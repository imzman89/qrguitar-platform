-- Server-authoritative promotion codes for automatic PayPal checkout.
-- A promotion is resolved and reserved in the same transaction as its billing
-- order. The effective amount is then immutable inside billing_orders.offer and
-- remains the amount verified against PayPal's order and capture resources.
begin;

create table public.billing_promo_codes (
  id uuid primary key default gen_random_uuid(),
  environment text not null check(environment in ('live','test')),
  code text not null check(code ~ '^[A-Z0-9][A-Z0-9_-]{2,31}$'),
  name text not null check(char_length(name) between 1 and 80 and name=btrim(name)),
  description text not null default '' check(char_length(description)<=500 and description=btrim(description)),
  status text not null check(status in ('active','paused','archived')),
  audience text not null check(audience in ('everyone','admin')),
  discount_type text not null check(discount_type in ('fixed_total','amount_off','percent_off')),
  discount_value integer not null,
  minimum_amount integer not null default 0 check(minimum_amount between 0 and 100000000),
  eligible_offer_keys text[] not null,
  starts_at timestamptz,
  ends_at timestamptz,
  max_redemptions integer check(max_redemptions is null or max_redemptions>0),
  max_redemptions_per_owner integer check(max_redemptions_per_owner is null or max_redemptions_per_owner>0),
  created_by uuid,
  updated_by uuid,
  revision integer not null default 1 check(revision>0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(environment,code),
  check((discount_type='percent_off' and discount_value between 1 and 10000)
    or (discount_type='fixed_total' and discount_value between 30 and 100000000)
    or (discount_type='amount_off' and discount_value between 1 and 100000000)),
  check(cardinality(eligible_offer_keys) between 1 and 3
    and eligible_offer_keys <@ array['profile_1','profile_10','profile_25']::text[]
    and cardinality(array_positions(eligible_offer_keys,'profile_1'))<=1
    and cardinality(array_positions(eligible_offer_keys,'profile_10'))<=1
    and cardinality(array_positions(eligible_offer_keys,'profile_25'))<=1),
  check(starts_at is null or ends_at is null or starts_at<ends_at),
  check(max_redemptions is null or max_redemptions_per_owner is null or max_redemptions_per_owner<=max_redemptions)
);

create table public.billing_order_promotions (
  order_id uuid primary key,
  promotion_id uuid not null references public.billing_promo_codes(id),
  owner_id uuid not null,
  environment text not null check(environment in ('live','test')),
  code text not null check(code ~ '^[A-Z0-9][A-Z0-9_-]{2,31}$'),
  name text not null check(char_length(name) between 1 and 80),
  promotion_revision integer not null check(promotion_revision>0),
  discount_type text not null check(discount_type in ('fixed_total','amount_off','percent_off')),
  discount_value integer not null check(discount_value>0),
  classification text not null check(classification in ('promotion','internal_test')),
  original_amount integer not null check(original_amount>0),
  discount_amount integer not null check(discount_amount>0),
  final_amount integer not null check(final_amount>=30 and final_amount<original_amount),
  created_at timestamptz not null default clock_timestamp(),
  unique(order_id,owner_id,environment),
  foreign key(order_id,owner_id,environment) references public.billing_orders(id,owner_id,environment),
  check(original_amount-discount_amount=final_amount)
);

create table public.billing_promo_admin_events (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.billing_promo_codes(id),
  environment text not null check(environment in ('live','test')),
  operator_id uuid not null,
  operator_email text not null check(char_length(operator_email) between 3 and 320 and operator_email=btrim(operator_email)),
  action text not null check(action in ('create','update','pause','resume','archive')),
  reason text not null check(char_length(reason) between 10 and 500 and reason=btrim(reason)),
  before_value jsonb,
  after_value jsonb,
  created_at timestamptz not null default clock_timestamp(),
  check((action='create' and before_value is null and jsonb_typeof(after_value)='object')
    or (action<>'create' and jsonb_typeof(before_value)='object' and jsonb_typeof(after_value)='object'))
);

-- Distributed, per-account quote throttling. Quote failures are returned as a
-- normal result so this counter still commits when a guessed code is rejected.
create table public.billing_promo_quote_limits (
  owner_id uuid not null references auth.users(id) on delete cascade,
  environment text not null check(environment in ('live','test')),
  window_started_at timestamptz not null default clock_timestamp(),
  attempt_count integer not null default 1 check(attempt_count>0),
  updated_at timestamptz not null default clock_timestamp(),
  primary key(owner_id,environment)
);

create index billing_promo_codes_status on public.billing_promo_codes(environment,status,starts_at,ends_at);
create index billing_order_promotions_usage on public.billing_order_promotions(promotion_id,owner_id,created_at);
create index billing_promo_admin_events_history on public.billing_promo_admin_events(promotion_id,created_at desc,id desc);

create function public._billing_promo_code_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if tg_op='DELETE' then raise exception using errcode='42501',message='Promotion history cannot be deleted.';end if;
  if row(new.id,new.environment,new.code,new.created_by,new.created_at)
      is distinct from row(old.id,old.environment,old.code,old.created_by,old.created_at)
    or new.revision is distinct from old.revision+1 or new.updated_at<=old.updated_at then
    raise exception using errcode='42501',message='Promotion identity and revision history are protected.';
  end if;
  if old.code in ('GARYWON','GARYAPPLE') and (
      new.status='archived' or new.audience<>'admin' or new.discount_type<>'fixed_total'
      or new.discount_value<>case old.code when 'GARYWON' then 30 else 100 end
      or new.minimum_amount<>0
      or new.eligible_offer_keys<>array['profile_1','profile_10','profile_25']::text[]) then
    raise exception using errcode='PT409',message='Owner payment-test pricing is protected.';
  end if;
  if old.status='archived' then raise exception using errcode='42501',message='An archived promotion cannot be changed.';end if;
  return new;
end;$$;

do $$declare t text;begin
  foreach t in array array['billing_promo_codes','billing_order_promotions','billing_promo_admin_events','billing_promo_quote_limits'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on table public.%I from public,anon,authenticated,service_role',t);
    execute format('create policy qrguitar_billing_server_only on public.%I as restrictive for all to anon,authenticated using(false) with check(false)',t);
  end loop;
end;$$;

create function public._billing_promo_consume_quote_attempt(p_owner_id uuid,p_environment text) returns boolean
language plpgsql security definer set search_path=pg_catalog,public as $$
declare attempts integer;started_at timestamptz;now_at timestamptz:=clock_timestamp();begin
  perform public._billing_create_environment(p_environment);
  if p_owner_id is null or not exists(select 1 from auth.users where id=p_owner_id) then
    raise exception using errcode='22023',message='Billing owner is required.';end if;
  insert into public.billing_promo_quote_limits(owner_id,environment,window_started_at,attempt_count,updated_at)
    values(p_owner_id,p_environment,now_at,1,now_at)
  on conflict(owner_id,environment) do update set
    window_started_at=case when billing_promo_quote_limits.window_started_at<=now_at-interval '5 minutes' then now_at else billing_promo_quote_limits.window_started_at end,
    attempt_count=case when billing_promo_quote_limits.window_started_at<=now_at-interval '5 minutes' then 1 else billing_promo_quote_limits.attempt_count+1 end,
    updated_at=now_at
  returning attempt_count,window_started_at into attempts,started_at;
  return attempts<=12 and started_at>now_at-interval '5 minutes';
end;$$;
create trigger billing_promo_code_guard before update or delete on public.billing_promo_codes
  for each row execute function public._billing_promo_code_guard();
create trigger billing_order_promotions_immutable before update or delete on public.billing_order_promotions
  for each row execute function public._billing_immutable();
create trigger billing_promo_admin_events_immutable before update or delete on public.billing_promo_admin_events
  for each row execute function public._billing_immutable();

create function public._billing_promo_normalize_code(p_code text) returns text
language sql immutable set search_path=pg_catalog,public as $$
  select upper(btrim(coalesce(p_code,'')));
$$;

create function public._billing_promo_snapshot(p public.billing_promo_codes) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
  select jsonb_build_object('id',p.id,'code',p.code,'name',p.name,'description',p.description,
    'status',p.status,'audience',p.audience,'discountType',p.discount_type,'discountValue',p.discount_value,
    'minimumAmount',p.minimum_amount,'eligibleOfferKeys',to_jsonb(p.eligible_offer_keys),'startsAt',p.starts_at,
    'endsAt',p.ends_at,'maxRedemptions',p.max_redemptions,'maxRedemptionsPerOwner',p.max_redemptions_per_owner,
    'revision',p.revision,'createdAt',p.created_at,'updatedAt',p.updated_at);
$$;

create function public._billing_promo_order_snapshot(p public.billing_order_promotions) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
  select jsonb_build_object('id',p.promotion_id,'code',p.code,'name',p.name,'revision',p.promotion_revision,
    'discountType',p.discount_type,'discountValue',p.discount_value,'classification',p.classification,'originalAmount',p.original_amount,
    'discountAmount',p.discount_amount,'finalAmount',p.final_amount);
$$;

create function public._billing_promo_admin(p_operator_id uuid,p_allow_environment_admin boolean) returns void
language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
  if not exists(select 1 from auth.users u left join public.profiles p on p.id=u.id where u.id=p_operator_id
    and coalesce(p.account_status,'active')='active' and (p.role='admin' or p_allow_environment_admin is true)) then
    raise exception using errcode='42501',message='An active administrator is required.';
  end if;
end;$$;

create function public._billing_promo_resolve(p_owner_id uuid,p_environment text,p_offer_key text,p_code text,
  p_internal_access boolean,p_lock boolean) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare p public.billing_promo_codes%rowtype;base_amount integer;credits integer;final_amount integer;
  total_used integer;owner_used integer;normalized text;now_at timestamptz:=clock_timestamp();
begin
  perform public._billing_create_environment(p_environment);
  if p_owner_id is null then raise exception using errcode='22023',message='Billing owner is required.';end if;
  case p_offer_key when 'profile_1' then base_amount:=1200;credits:=1;
    when 'profile_10' then base_amount:=5000;credits:=10;
    when 'profile_25' then base_amount:=9900;credits:=25;
    else raise exception using errcode='22023',message='Unapproved Profile credit pack.';end case;
  normalized:=public._billing_promo_normalize_code(p_code);
  if normalized='' then
    return jsonb_build_object('offer',jsonb_build_object('key',p_offer_key,'version',1,'currency','usd','amount',base_amount,'credits',credits),'promotion',null);
  end if;
  if normalized !~ '^[A-Z0-9][A-Z0-9_-]{2,31}$' then
    raise exception using errcode='PT404',message='Promotion code is not valid.';end if;
  if p_lock then select * into p from public.billing_promo_codes where environment=p_environment and code=normalized for update;
  else select * into p from public.billing_promo_codes where environment=p_environment and code=normalized;end if;
  if p.id is null then raise exception using errcode='PT404',message='Promotion code is not valid.';end if;
  if p.status<>'active' or (p.starts_at is not null and p.starts_at>now_at) or (p.ends_at is not null and p.ends_at<=now_at)
    or not (p_offer_key=any(p.eligible_offer_keys)) or base_amount<p.minimum_amount then
    raise exception using errcode='PT410',message='Promotion code is not available.';end if;
  if p.audience='admin' and not (p_internal_access is true or exists(select 1 from public.profiles x
      where x.id=p_owner_id and x.role='admin' and x.account_status='active')) then
    raise exception using errcode='PT403',message='Promotion code is not available for this account.';end if;
  select count(*)::integer,count(*) filter(where op.owner_id=p_owner_id)::integer into total_used,owner_used
    from public.billing_order_promotions op join public.billing_orders o on o.id=op.order_id
    where op.promotion_id=p.id and o.status in ('reserved','open','fulfilled');
  if (p.max_redemptions is not null and total_used>=p.max_redemptions)
    or (p.max_redemptions_per_owner is not null and owner_used>=p.max_redemptions_per_owner) then
    raise exception using errcode='PT410',message='Promotion code has reached its use limit.';end if;
  final_amount:=case p.discount_type
    when 'fixed_total' then least(base_amount,greatest(30,p.discount_value))
    when 'amount_off' then greatest(30,base_amount-p.discount_value)
    else greatest(30,round(base_amount*(10000-p.discount_value)/10000.0)::integer) end;
  if final_amount>=base_amount then raise exception using errcode='PT410',message='Promotion does not reduce this order.';end if;
  return jsonb_build_object('offer',jsonb_build_object('key',p_offer_key,'version',1,'currency','usd','amount',final_amount,'credits',credits),
    'promotion',jsonb_build_object('id',p.id,'code',p.code,'name',p.name,'revision',p.revision,'discountType',p.discount_type,
      'discountValue',p.discount_value,'classification',case when p.audience='admin' then 'internal_test' else 'promotion' end,
      'originalAmount',base_amount,'discountAmount',base_amount-final_amount,'finalAmount',final_amount));
end;$$;

create function public.billing_promo_quote(p_owner_id uuid,p_environment text,p_offer_key text,p_code text,p_internal_access boolean) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if not public._billing_promo_consume_quote_attempt(p_owner_id,p_environment) then
    return jsonb_build_object('available',false,'rateLimited',true);
  end if;
  begin
    return public._billing_promo_resolve(p_owner_id,p_environment,p_offer_key,p_code,p_internal_access,false)
      ||jsonb_build_object('available',true,'rateLimited',false);
  exception when sqlstate 'PT404' or sqlstate 'PT403' or sqlstate 'PT410' then
    return jsonb_build_object('available',false,'rateLimited',false);
  end;
end;$$;

create or replace function public._billing_paypal_order_json(p_order public.billing_orders) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
  select public._billing_order_json(p_order)||jsonb_build_object('provider','paypal','merchantId',p.merchant_id,
    'paypalOrderId',(select b.paypal_order_id from public.billing_paypal_bindings b where b.order_id=p_order.id),
    'captureId',case when p_order.payment_id like 'paypal_capture:%' then substr(p_order.payment_id,16) else null end,
    'hold',public._billing_held(p_order.owner_id,p_order.environment),
    'promotion',(select public._billing_promo_order_snapshot(op) from public.billing_order_promotions op where op.order_id=p_order.id))
  from public.billing_paypal_orders p where p.order_id=p_order.id;
$$;

create function public.billing_paypal_reserve_promoted_order(p_owner_id uuid,p_environment text,p_request_key uuid,
  p_offer_key text,p_merchant_id text,p_promo_code text,p_promotion_id uuid,p_promotion_revision integer,
  p_expected_amount integer,p_internal_access boolean) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare o public.billing_orders%rowtype;p public.billing_paypal_orders%rowtype;op public.billing_order_promotions%rowtype;
  resolved jsonb;offer jsonb;promotion jsonb;normalized text;
begin
  perform public._billing_create_environment(p_environment);
  perform public._billing_lock_actor(p_owner_id,p_environment,true);
  if p_request_key is null or coalesce(p_merchant_id,'') !~ '^[A-Z0-9]{5,64}$' then
    raise exception using errcode='22023',message='A request UUID and configured PayPal merchant identity are required.';end if;
  normalized:=public._billing_promo_normalize_code(p_promo_code);
  select * into o from public.billing_orders where owner_id=p_owner_id and environment=p_environment and request_key=p_request_key;
  if found then
    select * into p from public.billing_paypal_orders where order_id=o.id;
    select * into op from public.billing_order_promotions where order_id=o.id;
    if p.order_id is null or o.offer->>'key' is distinct from p_offer_key or p.merchant_id is distinct from p_merchant_id
      or coalesce(op.code,'') is distinct from normalized
      or (op.order_id is null and (p_promotion_id is not null or p_promotion_revision is not null or p_expected_amount is not null))
      or (op.order_id is not null and (op.promotion_id is distinct from p_promotion_id
        or op.promotion_revision is distinct from p_promotion_revision or op.final_amount is distinct from p_expected_amount)) then
      raise exception using errcode='PT409',message='This purchase request was already used with different details.';end if;
    if o.status in ('reserved','open') and public._billing_held(p_owner_id,p_environment) then
      raise exception using errcode='PT409',message='Purchases are on hold pending billing review.';end if;
    return public._billing_paypal_order_json(o);
  end if;
  if public._billing_held(p_owner_id,p_environment) then raise exception using errcode='PT409',message='Purchases are on hold pending billing review.';end if;
  if exists(select 1 from public.profiles where id=p_owner_id and plan in ('business','enterprise')) then
    raise exception using errcode='PT409',message='The approved plan already includes expanded Profile access.';end if;
  if exists(select 1 from public.billing_orders where owner_id=p_owner_id and environment=p_environment and status in ('reserved','open')) then
    raise exception using errcode='PT409',message='Resume the existing payment before starting another purchase.';end if;
  resolved:=public._billing_promo_resolve(p_owner_id,p_environment,p_offer_key,p_promo_code,p_internal_access,true);
  offer:=resolved->'offer';promotion:=resolved->'promotion';
  if (promotion is null or promotion='null'::jsonb) and (p_promotion_id is not null or p_promotion_revision is not null or p_expected_amount is not null)
    or (promotion is not null and promotion<>'null'::jsonb and ((promotion->>'id')::uuid is distinct from p_promotion_id
      or (promotion->>'revision')::integer is distinct from p_promotion_revision
      or (promotion->>'finalAmount')::integer is distinct from p_expected_amount)) then
    raise exception using errcode='PT410',message='Promotion is not available for these checkout details.';
  end if;
  insert into public.billing_orders(owner_id,environment,request_key,offer)
    values(p_owner_id,p_environment,p_request_key,offer) returning * into o;
  insert into public.billing_paypal_orders(order_id,owner_id,environment,merchant_id)
    values(o.id,p_owner_id,p_environment,p_merchant_id);
  if promotion is not null and promotion<>'null'::jsonb then
    insert into public.billing_order_promotions(order_id,promotion_id,owner_id,environment,code,name,promotion_revision,
      discount_type,discount_value,classification,original_amount,discount_amount,final_amount)
    values(o.id,(promotion->>'id')::uuid,p_owner_id,p_environment,promotion->>'code',promotion->>'name',(promotion->>'revision')::integer,
      promotion->>'discountType',(promotion->>'discountValue')::integer,promotion->>'classification',(promotion->>'originalAmount')::integer,
      (promotion->>'discountAmount')::integer,(promotion->>'finalAmount')::integer);
  end if;
  return public._billing_paypal_order_json(o);
exception when unique_violation then raise exception using errcode='PT409',message='A payment request already exists. Resume that order.';
end;$$;

create function public.billing_promo_admin_list(p_operator_id uuid,p_allow_environment_admin boolean,p_environment text) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
  perform public._billing_promo_admin(p_operator_id,p_allow_environment_admin);
  perform public._billing_create_environment(p_environment);
  return jsonb_build_object('environment',p_environment,'promotions',coalesce((select jsonb_agg(
    public._billing_promo_snapshot(p)||jsonb_build_object(
      'reservedRedemptions',(select count(*) from public.billing_order_promotions op join public.billing_orders o on o.id=op.order_id where op.promotion_id=p.id and o.status in ('reserved','open')),
      'completedRedemptions',(select count(*) from public.billing_order_promotions op join public.billing_orders o on o.id=op.order_id where op.promotion_id=p.id and o.status='fulfilled'),
      'releasedRedemptions',(select count(*) from public.billing_order_promotions op join public.billing_orders o on o.id=op.order_id where op.promotion_id=p.id and o.status='expired'),
      'adjustedRedemptions',(select count(*) from public.billing_order_promotions op where op.promotion_id=p.id
        and exists(select 1 from public.billing_receipts r where r.order_id=op.order_id and r.kind in ('refund','dispute'))),
      'grossCapturedAmount',coalesce((select sum(op.final_amount) from public.billing_order_promotions op join public.billing_orders o on o.id=op.order_id where op.promotion_id=p.id and o.status='fulfilled'),0))
    order by case p.status when 'active' then 0 when 'paused' then 1 else 2 end,p.updated_at desc,p.code)
    from public.billing_promo_codes p where p.environment=p_environment),'[]'::jsonb));
end;$$;

create function public.billing_promo_admin_redemptions(p_operator_id uuid,p_allow_environment_admin boolean,p_environment text,p_promotion_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
  perform public._billing_promo_admin(p_operator_id,p_allow_environment_admin);
  perform public._billing_create_environment(p_environment);
  if not exists(select 1 from public.billing_promo_codes where id=p_promotion_id and environment=p_environment) then
    raise exception using errcode='P0002',message='Promotion was not found.';end if;
  return jsonb_build_object('redemptions',coalesce((select jsonb_agg(jsonb_build_object('orderId',op.order_id,
    'ownerId',op.owner_id,'code',op.code,'offerKey',o.offer->>'key','credits',(o.offer->>'credits')::integer,
    'originalAmount',op.original_amount,'discountAmount',op.discount_amount,'finalAmount',op.final_amount,
    'status',o.status,'createdAt',op.created_at) order by op.created_at desc,op.order_id desc)
    from (select * from public.billing_order_promotions where promotion_id=p_promotion_id order by created_at desc,order_id desc limit 100) op
    join public.billing_orders o on o.id=op.order_id),'[]'::jsonb),
    'changes',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'action',e.action,'reason',e.reason,
      'operatorEmail',e.operator_email,'revision',coalesce((e.after_value->>'revision')::integer,(e.before_value->>'revision')::integer),
      'createdAt',e.created_at) order by e.created_at desc,e.id desc)
      from (select * from public.billing_promo_admin_events where promotion_id=p_promotion_id
        order by created_at desc,id desc limit 100) e),'[]'::jsonb));
end;$$;

create function public._billing_promo_admin_event(p public.billing_promo_codes,p_operator_id uuid,p_operator_email text,
  p_action text,p_reason text,p_before jsonb,p_after jsonb) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if char_length(coalesce(btrim(p_operator_email),'')) not between 3 and 320
    or char_length(coalesce(btrim(p_reason),'')) not between 10 and 500 then
    raise exception using errcode='22023',message='Promotion changes require an operator identity and audit reason.';end if;
  insert into public.billing_promo_admin_events(promotion_id,environment,operator_id,operator_email,action,reason,before_value,after_value)
    values(p.id,p.environment,p_operator_id,lower(btrim(p_operator_email)),p_action,btrim(p_reason),p_before,p_after);
end;$$;

create function public.billing_promo_admin_create(p_operator_id uuid,p_operator_email text,p_allow_environment_admin boolean,p_environment text,
  p_code text,p_name text,p_description text,p_status text,p_audience text,p_discount_type text,p_discount_value integer,
  p_minimum_amount integer,p_eligible_offer_keys text[],p_starts_at timestamptz,p_ends_at timestamptz,
  p_max_redemptions integer,p_max_redemptions_per_owner integer,p_reason text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare p public.billing_promo_codes%rowtype;snapshot jsonb;begin
  perform public._billing_promo_admin(p_operator_id,p_allow_environment_admin);
  perform public._billing_create_environment(p_environment);
  insert into public.billing_promo_codes(environment,code,name,description,status,audience,discount_type,discount_value,
    minimum_amount,eligible_offer_keys,starts_at,ends_at,max_redemptions,max_redemptions_per_owner,created_by,updated_by)
  values(p_environment,public._billing_promo_normalize_code(p_code),btrim(p_name),btrim(coalesce(p_description,'')),p_status,p_audience,
    p_discount_type,p_discount_value,p_minimum_amount,p_eligible_offer_keys,p_starts_at,p_ends_at,p_max_redemptions,p_max_redemptions_per_owner,
    p_operator_id,p_operator_id) returning * into p;
  snapshot:=public._billing_promo_snapshot(p);
  perform public._billing_promo_admin_event(p,p_operator_id,p_operator_email,'create',p_reason,null,snapshot);
  return snapshot;
exception when unique_violation then raise exception using errcode='PT409',message='That promotion code already exists.';
end;$$;

create function public.billing_promo_admin_update(p_operator_id uuid,p_operator_email text,p_allow_environment_admin boolean,p_environment text,
  p_promotion_id uuid,p_expected_revision integer,p_name text,p_description text,p_audience text,p_discount_type text,p_discount_value integer,
  p_minimum_amount integer,p_eligible_offer_keys text[],p_starts_at timestamptz,p_ends_at timestamptz,
  p_max_redemptions integer,p_max_redemptions_per_owner integer,p_reason text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare p public.billing_promo_codes%rowtype;before_snapshot jsonb;after_snapshot jsonb;begin
  perform public._billing_promo_admin(p_operator_id,p_allow_environment_admin);
  perform public._billing_create_environment(p_environment);
  select * into p from public.billing_promo_codes where id=p_promotion_id and environment=p_environment for update;
  if not found then raise exception using errcode='P0002',message='Promotion was not found.';end if;
  if p.status='archived' then raise exception using errcode='PT409',message='An archived promotion cannot be edited.';end if;
  if p.revision is distinct from p_expected_revision then raise exception using errcode='PT409',message='Promotion changed; refresh before saving.';end if;
  before_snapshot:=public._billing_promo_snapshot(p);
  update public.billing_promo_codes set name=btrim(p_name),description=btrim(coalesce(p_description,'')),audience=p_audience,
    discount_type=p_discount_type,discount_value=p_discount_value,minimum_amount=p_minimum_amount,eligible_offer_keys=p_eligible_offer_keys,
    starts_at=p_starts_at,ends_at=p_ends_at,max_redemptions=p_max_redemptions,max_redemptions_per_owner=p_max_redemptions_per_owner,
    updated_by=p_operator_id,revision=revision+1,updated_at=clock_timestamp() where id=p.id returning * into p;
  after_snapshot:=public._billing_promo_snapshot(p);
  perform public._billing_promo_admin_event(p,p_operator_id,p_operator_email,'update',p_reason,before_snapshot,after_snapshot);
  return after_snapshot;
end;$$;

create function public.billing_promo_admin_set_status(p_operator_id uuid,p_operator_email text,p_allow_environment_admin boolean,
  p_environment text,p_promotion_id uuid,p_expected_revision integer,p_status text,p_reason text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare p public.billing_promo_codes%rowtype;before_snapshot jsonb;after_snapshot jsonb;action text;begin
  perform public._billing_promo_admin(p_operator_id,p_allow_environment_admin);
  perform public._billing_create_environment(p_environment);
  select * into p from public.billing_promo_codes where id=p_promotion_id and environment=p_environment for update;
  if not found then raise exception using errcode='P0002',message='Promotion was not found.';end if;
  if p.revision is distinct from p_expected_revision then raise exception using errcode='PT409',message='Promotion changed; refresh before saving.';end if;
  if p.code in ('GARYWON','GARYAPPLE') and p_status='archived' then
    raise exception using errcode='PT409',message='Owner payment-test promotions can be paused, but not deleted.';end if;
  if p.status='archived' or p_status not in ('active','paused','archived') or p.status=p_status then
    raise exception using errcode='22023',message='Invalid promotion status change.';end if;
  action:=case p_status when 'active' then 'resume' when 'paused' then 'pause' else 'archive' end;
  before_snapshot:=public._billing_promo_snapshot(p);
  update public.billing_promo_codes set status=p_status,updated_by=p_operator_id,revision=revision+1,updated_at=clock_timestamp()
    where id=p.id returning * into p;
  after_snapshot:=public._billing_promo_snapshot(p);
  perform public._billing_promo_admin_event(p,p_operator_id,p_operator_email,action,p_reason,before_snapshot,after_snapshot);
  return after_snapshot;
end;$$;

-- GARYWON is deliberately internal-only. It makes every current Profile pack a
-- $0.30 order for owner testing without becoming a public ninety-nine-dollar
-- giveaway if the code is guessed or exposed.
insert into public.billing_promo_codes(environment,code,name,description,status,audience,discount_type,discount_value,
  minimum_amount,eligible_offer_keys,max_redemptions,max_redemptions_per_owner)
select create_environment,'GARYWON','Owner payment test','Internal QRguitar payment-method acceptance code.','active','admin',
  'fixed_total',30,0,array['profile_1','profile_10','profile_25']::text[],100,100
from public.billing_instance_config where singleton;

-- PayPal's Apple Pay rail requires at least $1 USD. Keep a separate protected
-- internal code for end-to-end Apple Pay acceptance without weakening GARYWON.
insert into public.billing_promo_codes(environment,code,name,description,status,audience,discount_type,discount_value,
  minimum_amount,eligible_offer_keys,max_redemptions,max_redemptions_per_owner)
select create_environment,'GARYAPPLE','Apple Pay acceptance test','Internal QRguitar Apple Pay minimum-amount acceptance code.','active','admin',
  'fixed_total',100,0,array['profile_1','profile_10','profile_25']::text[],100,100
from public.billing_instance_config where singleton;

do $$declare f record;begin
  for f in select oid::regprocedure signature,proname from pg_proc where pronamespace='public'::regnamespace
    and (proname like 'billing_promo_%' or proname like '_billing_promo_%' or proname='billing_paypal_reserve_promoted_order') loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
    if f.proname like 'billing_%' then execute format('grant execute on function %s to service_role',f.signature);end if;
  end loop;
end;$$;
notify pgrst,'reload schema';
commit;
