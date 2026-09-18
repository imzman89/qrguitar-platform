-- Direct business payments share the permanent credit ledger. No provider credentials,
-- receiving accounts, or purchase-enable flags are provisioned by this migration.
begin;

create table public.billing_direct_orders (
  order_id uuid primary key, owner_id uuid not null, environment text not null,
  provider text not null check(provider in ('venmo','cashapp','zelle','paypal')),
  recipient jsonb not null, created_at timestamptz not null default clock_timestamp(),
  foreign key(order_id,owner_id,environment) references public.billing_orders(id,owner_id,environment)
);
create table public.billing_direct_claims (
  id uuid primary key, order_id uuid not null unique references public.billing_direct_orders(order_id),
  reference text not null, created_at timestamptz not null default clock_timestamp()
);
create table public.billing_direct_payments (
  order_id uuid primary key references public.billing_direct_orders(order_id),
  environment text not null, provider text not null, account_key text not null,
  reference text not null, normalized_reference text not null,
  payment_id text not null, operator_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  unique(environment,provider,account_key,normalized_reference), unique(environment,payment_id),
  -- Fail safely on a provider reference reused after a receiving-account config change.
  unique(environment,provider,normalized_reference)
);
do $$declare t text;begin
  foreach t in array array['billing_direct_orders','billing_direct_claims','billing_direct_payments'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on table public.%I from public,anon,authenticated,service_role',t);
    execute format('create policy qrguitar_billing_server_only on public.%I as restrictive for all to anon,authenticated using(false) with check(false)',t);
    execute format('create trigger billing_history_immutable before update or delete on public.%I for each row execute function public._billing_immutable()',t);
  end loop;
end;$$;

create function public._billing_direct_admin(p_operator_id uuid) returns void
language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
  if not exists(select 1 from public.profiles p join auth.users u on u.id=p.id
    where p.id=p_operator_id and p.role='admin' and p.account_status='active') then
    raise exception using errcode='42501',message='An active administrator must verify direct payments.';
  end if;
end;$$;

create function public._billing_direct_order_json(p_order public.billing_orders) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
  select public._billing_order_json(p_order)||jsonb_build_object(
    'provider',d.provider,'recipient',d.recipient,
    'claim',(select jsonb_build_object('claimId',c.id,'reference',c.reference,'createdAt',c.created_at)
      from public.billing_direct_claims c where c.order_id=p_order.id order by c.created_at desc,c.id desc limit 1),
    'verification',(select r.receipt||jsonb_build_object('createdAt',r.created_at)
      from public.billing_receipts r where r.order_id=p_order.id and r.kind='payment'
      order by r.created_at,r.event_id limit 1),
    'hold',public._billing_held(p_order.owner_id,p_order.environment))
  from public.billing_direct_orders d where d.order_id=p_order.id;
$$;

create function public.billing_direct_get_order(p_owner_id uuid,p_environment text,p_order_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare o public.billing_orders%rowtype;begin
  perform public._billing_environment(p_environment);
  select b.* into o from public.billing_orders b join public.billing_direct_orders d on d.order_id=b.id
    where b.id=p_order_id and b.owner_id=p_owner_id and b.environment=p_environment;
  if not found then raise exception using errcode='P0002',message='Direct payment order was not found.';end if;
  return public._billing_direct_order_json(o);
end;$$;

create function public.billing_direct_find_order(p_owner_id uuid,p_environment text,p_request_key uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare o public.billing_orders%rowtype;begin
  perform public._billing_environment(p_environment);
  if p_owner_id is null or p_request_key is null then raise exception using errcode='22023',message='Owner and request UUID are required.';end if;
  select b.* into o from public.billing_orders b join public.billing_direct_orders d on d.order_id=b.id
    where b.owner_id=p_owner_id and b.environment=p_environment and b.request_key=p_request_key;
  return jsonb_build_object('order',case when o.id is null then null else public._billing_direct_order_json(o) end);
end;$$;

create function public.billing_direct_reserve_order(p_owner_id uuid,p_environment text,p_request_key uuid,
  p_offer_key text,p_provider text,p_recipient jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare o public.billing_orders%rowtype;d public.billing_direct_orders%rowtype;a integer;c integer;offer jsonb;begin
  perform public._billing_create_environment(p_environment);
  perform public._billing_lock_actor(p_owner_id,p_environment,true);
  if p_request_key is null or p_provider is null or p_provider not in ('venmo','cashapp','zelle','paypal') then
    raise exception using errcode='22023',message='An approved payment provider and request UUID are required.';end if;
  -- Recipient details are a trusted server configuration snapshot, never customer input.
  -- accountKey must remain stable for the same actual receiving account across URL/name edits.
  if jsonb_typeof(p_recipient) is distinct from 'object'
    or coalesce(p_recipient->>'accountKey','') !~ '^[a-z0-9][a-z0-9_.:@+-]{2,159}$'
    or char_length(coalesce(btrim(p_recipient->>'displayName'),'')) not between 1 and 120
    or (p_recipient->>'address' is not null and char_length(btrim(p_recipient->>'address')) not between 1 and 200)
    or (p_provider='zelle' and p_recipient->>'address' is null)
    or (p_provider='paypal' and ((p_environment='live' and coalesce(p_recipient->>'paymentUrl','') !~ '^https://(www\.)?paypal\.com/[A-Za-z0-9]')
      or (p_environment='test' and coalesce(p_recipient->>'paymentUrl','') !~ '^https://(www\.)?sandbox\.paypal\.com/[A-Za-z0-9]')))
    or (p_recipient->>'address' is null and p_recipient->>'paymentUrl' is null)
    or (p_recipient->>'paymentUrl' is not null and
      (char_length(p_recipient->>'paymentUrl')>2000 or p_recipient->>'paymentUrl' !~ '^https://'))
    or p_recipient is distinct from jsonb_build_object('accountKey',p_recipient->>'accountKey',
      'displayName',btrim(p_recipient->>'displayName'),'paymentUrl',p_recipient->>'paymentUrl','address',btrim(p_recipient->>'address')) then
    raise exception using errcode='22023',message='A configured business receiving account is required.';end if;
  case p_offer_key when 'profile_1' then a:=1200;c:=1;when 'profile_10' then a:=5000;c:=10;
    when 'profile_25' then a:=9900;c:=25;else raise exception using errcode='22023',message='Unapproved Profile credit pack.';end case;
  offer:=jsonb_build_object('key',p_offer_key,'version',1,'currency','usd','amount',a,'credits',c);
  select * into o from public.billing_orders where owner_id=p_owner_id and environment=p_environment and request_key=p_request_key;
  if found then
    select * into d from public.billing_direct_orders where order_id=o.id;
    if d.order_id is null or o.offer is distinct from offer or d.provider is distinct from p_provider or d.recipient is distinct from p_recipient then
      raise exception using errcode='PT409',message='This purchase request was already used with different details.';end if;
    if o.status in ('reserved','open') and public._billing_held(p_owner_id,p_environment) then
      raise exception using errcode='PT409',message='Purchases are on hold pending billing review.';end if;
    return public._billing_direct_order_json(o);
  end if;
  if public._billing_held(p_owner_id,p_environment) then raise exception using errcode='PT409',message='Purchases are on hold pending billing review.';end if;
  if exists(select 1 from public.profiles where id=p_owner_id and plan in ('business','enterprise')) then
    raise exception using errcode='PT409',message='The approved plan already includes expanded Profile access.';end if;
  if exists(select 1 from public.billing_orders where owner_id=p_owner_id and environment=p_environment and status in ('reserved','open')) then
    raise exception using errcode='PT409',message='Resume the existing payment before starting another purchase.';end if;
  insert into public.billing_orders(owner_id,environment,request_key,offer,status)
    values(p_owner_id,p_environment,p_request_key,offer,'open') returning * into o;
  update public.billing_orders set session_id='direct_order:'||o.id::text where id=o.id returning * into o;
  insert into public.billing_direct_orders(order_id,owner_id,environment,provider,recipient)
    values(o.id,p_owner_id,p_environment,p_provider,p_recipient);
  return public._billing_direct_order_json(o);
exception when unique_violation then raise exception using errcode='PT409',message='A payment request already exists. Resume that order.';
end;$$;

create function public.billing_direct_claim_order(p_owner_id uuid,p_environment text,p_order_id uuid,p_claim_id uuid,p_reference text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare o public.billing_orders%rowtype;c public.billing_direct_claims%rowtype;begin
  perform public._billing_lock_actor(p_owner_id,p_environment,true);
  select b.* into o from public.billing_orders b join public.billing_direct_orders d on d.order_id=b.id
    where b.id=p_order_id and b.owner_id=p_owner_id and b.environment=p_environment for update of b;
  if not found then raise exception using errcode='P0002',message='Direct payment order was not found.';end if;
  if p_claim_id is null or p_reference is null or char_length(p_reference)>200 then
    raise exception using errcode='22023',message='A payment claim identity and an optional reference of at most 200 characters are required.';end if;
  select * into c from public.billing_direct_claims where id=p_claim_id;
  if found then
    if c.order_id is distinct from o.id or c.reference is distinct from btrim(p_reference) then
      raise exception using errcode='PT409',message='This claim was already submitted with different details.';end if;
    return public._billing_direct_order_json(o);
  end if;
  if o.status<>'open' then raise exception using errcode='PT409',message='This order no longer accepts payment claims.';end if;
  if exists(select 1 from public.billing_direct_claims where order_id=o.id) then
    raise exception using errcode='PT409',message='This order already has a payment claim. Retry its original request identity.';end if;
  insert into public.billing_direct_claims(id,order_id,reference) values(p_claim_id,o.id,btrim(p_reference));
  -- Deliberately no receipt, grant, or payment identity: a claim is not verification.
  return public._billing_direct_order_json(o);
exception when unique_violation then raise exception using errcode='PT409',message='This payment claim identity was already recorded.';
end;$$;

create function public._billing_direct_bind_payment(p_order public.billing_orders,p_operator_id uuid,p_reference text) returns text
language plpgsql security definer set search_path=pg_catalog,public as $$
declare d public.billing_direct_orders%rowtype;p public.billing_direct_payments%rowtype;n text;identity text;begin
  select * into d from public.billing_direct_orders where order_id=p_order.id;
  if not found then raise exception using errcode='P0002',message='Direct payment order was not found.';end if;
  n:=lower(regexp_replace(coalesce(p_reference,''),'[^A-Za-z0-9]','','g'));
  if char_length(coalesce(btrim(p_reference),'')) not between 3 and 200 or char_length(n)<3 then
    raise exception using errcode='22023',message='The actual provider transaction reference is required.';end if;
  identity:='direct_payment:'||encode(sha256(convert_to(jsonb_build_array(d.provider,d.recipient->>'accountKey',n)::text,'UTF8')),'hex');
  insert into public.billing_direct_payments(order_id,environment,provider,account_key,reference,normalized_reference,payment_id,operator_id)
    values(p_order.id,p_order.environment,d.provider,d.recipient->>'accountKey',btrim(p_reference),n,identity,p_operator_id) on conflict do nothing;
  select * into p from public.billing_direct_payments where order_id=p_order.id;
  if p.payment_id is distinct from identity then raise exception using errcode='PT409',message='This payment reference belongs to another order or this order has a different verified payment.';end if;
  if p_order.payment_id is not null and p_order.payment_id is distinct from identity then
    raise exception using errcode='PT409',message='The order has a different payment identity.';end if;
  return identity;
end;$$;

create function public.billing_direct_verify_order(p_environment text,p_order_id uuid,p_operator_id uuid,p_verification_id uuid,
  p_payment_reference text,p_amount integer,p_currency text,p_reason text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare o public.billing_orders%rowtype;payment text;receipt jsonb;new_grant boolean:=false;begin
  perform public._billing_direct_admin(p_operator_id);perform public._billing_environment(p_environment);
  select b.* into o from public.billing_orders b join public.billing_direct_orders d on d.order_id=b.id where b.id=p_order_id and b.environment=p_environment;
  if not found then raise exception using errcode='P0002',message='Direct payment order was not found.';end if;
  perform public._billing_lock_actor(o.owner_id,p_environment,false);
  select * into o from public.billing_orders where id=p_order_id for update;
  if p_verification_id is null or p_amount is distinct from (o.offer->>'amount')::integer or p_currency is distinct from 'usd'
    or char_length(coalesce(btrim(p_reason),'')) not between 10 and 1000 then
    raise exception using errcode='22023',message='Verification requires the exact gross USD payment and an audit reason.';end if;
  payment:=public._billing_direct_bind_payment(o,p_operator_id,p_payment_reference);
  receipt:=jsonb_build_object('eventId','direct:verify:'||p_verification_id::text,'verificationId',p_verification_id,'operatorId',p_operator_id,
    'paymentReference',btrim(p_payment_reference),'paymentId',payment,'amount',p_amount,'currency',p_currency,'reason',btrim(p_reason));
  perform public._billing_receipt(o,'payment',receipt);
  if not exists(select 1 from public.billing_credit_grants where order_id=o.id) then
    insert into public.billing_credit_grants(order_id,owner_id,environment,session_id,payment_id,credits)
      values(o.id,o.owner_id,p_environment,o.session_id,payment,(o.offer->>'credits')::integer);
    new_grant:=true;
  elsif not exists(select 1 from public.billing_credit_grants where order_id=o.id and session_id=o.session_id and payment_id=payment and credits=(o.offer->>'credits')::integer) then
    raise exception using errcode='PT409',message='This order already has a different credit grant.';
  end if;
  if o.status='expired' then
    insert into public.billing_credit_holds(environment,event_id,owner_id,reason)
      values(p_environment,receipt->>'eventId',o.owner_id,'late_payment_after_expiry') on conflict do nothing;
  end if;
  update public.billing_orders set payment_id=payment,status='fulfilled',last_error=null,
    updated_at=case when status='fulfilled' then updated_at else clock_timestamp() end where id=o.id returning * into o;
  return public._billing_direct_order_json(o)||jsonb_build_object('granted',new_grant,'alreadyGranted',not new_grant);
exception when unique_violation then raise exception using errcode='PT409',message='This verified payment was already recorded for another order.';
end;$$;

create function public.billing_direct_record_review(p_environment text,p_order_id uuid,p_operator_id uuid,p_decision_id uuid,
  p_kind text,p_reference text,p_reason text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare o public.billing_orders%rowtype;payment text;receipt jsonb;fresh boolean;begin
  perform public._billing_direct_admin(p_operator_id);perform public._billing_environment(p_environment);
  select b.* into o from public.billing_orders b join public.billing_direct_orders d on d.order_id=b.id where b.id=p_order_id and b.environment=p_environment;
  if not found then raise exception using errcode='P0002',message='Direct payment order was not found.';end if;
  perform public._billing_lock_actor(o.owner_id,p_environment,false);
  select * into o from public.billing_orders where id=p_order_id for update;
  if p_decision_id is null or p_kind is null or p_kind not in ('refund','dispute') or char_length(coalesce(btrim(p_reason),'')) not between 10 and 1000 then
    raise exception using errcode='22023',message='An audited refund or dispute review is required.';end if;
  -- p_reference identifies the original incoming payment, not a refund ID.
  payment:=public._billing_direct_bind_payment(o,p_operator_id,p_reference);
  receipt:=jsonb_build_object('eventId','direct:review:'||p_decision_id::text,'operatorId',p_operator_id,
    'paymentReference',btrim(p_reference),'paymentId',payment,'kind',p_kind,'reason',btrim(p_reason));
  fresh:=public._billing_receipt(o,p_kind,receipt);
  if fresh then
    insert into public.billing_credit_holds(environment,event_id,owner_id,reason) values(p_environment,receipt->>'eventId',o.owner_id,p_kind);
    update public.billing_orders set payment_id=payment,last_error='billing_review_required',updated_at=clock_timestamp() where id=o.id returning * into o;
  end if;
  return public._billing_direct_order_json(o);
exception when unique_violation then raise exception using errcode='PT409',message='This payment reference was already recorded for another order.';
end;$$;

create function public.billing_direct_close_order(p_environment text,p_order_id uuid,p_operator_id uuid,p_decision_id uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare o public.billing_orders%rowtype;begin
  perform public._billing_direct_admin(p_operator_id);perform public._billing_environment(p_environment);
  select b.* into o from public.billing_orders b join public.billing_direct_orders d on d.order_id=b.id where b.id=p_order_id and b.environment=p_environment;
  if not found then raise exception using errcode='P0002',message='Direct payment order was not found.';end if;
  perform public._billing_lock_actor(o.owner_id,p_environment,false);
  select * into o from public.billing_orders where id=p_order_id for update;
  if p_decision_id is null or char_length(coalesce(btrim(p_reason),'')) not between 10 and 1000 then
    raise exception using errcode='22023',message='An audited reason for closing this unpaid order is required.';end if;
  if o.status='fulfilled' or o.payment_id is not null then raise exception using errcode='PT409',message='A verified payment requires refund or dispute review.';end if;
  perform public._billing_receipt(o,'expired',jsonb_build_object('eventId','direct:close:'||p_decision_id::text,'operatorId',p_operator_id,'reason',btrim(p_reason)));
  update public.billing_orders set status='expired',last_error=null,updated_at=case when status='expired' then updated_at else clock_timestamp() end where id=o.id returning * into o;
  return public._billing_direct_order_json(o);
end;$$;

create function public.billing_direct_list_orders(p_operator_id uuid,p_environment text,p_order_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
  perform public._billing_direct_admin(p_operator_id);perform public._billing_environment(p_environment);
  return jsonb_build_object('orders',coalesce((select jsonb_agg(public._billing_direct_order_json(o) order by (o.status='open') desc,o.created_at desc,o.id)
    from (select b.* from public.billing_orders b join public.billing_direct_orders d on d.order_id=b.id
      where b.environment=p_environment and (p_order_id is null or b.id=p_order_id)
      order by (b.status='open') desc,b.created_at desc,b.id limit 100) o),'[]'::jsonb),
    'hasMore',p_order_id is null and (select count(*)>100 from public.billing_direct_orders where environment=p_environment));
end;$$;

create function public.billing_direct_status(p_owner_id uuid,p_environment text,p_order_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare current_order jsonb;pending public.billing_orders%rowtype;begin
  perform public._billing_create_environment(p_environment);
  if p_owner_id is null then raise exception using errcode='22023',message='Billing owner is required.';end if;
  if p_order_id is not null then current_order:=public.billing_direct_get_order(p_owner_id,p_environment,p_order_id);end if;
  select b.* into pending from public.billing_orders b join public.billing_direct_orders d on d.order_id=b.id
    where b.owner_id=p_owner_id and b.environment=p_environment and b.status in ('reserved','open');
  return jsonb_build_object('account',public.billing_account_status(p_owner_id,p_environment),'order',current_order,
    'pendingOrder',case when pending.id is null then null else public._billing_direct_order_json(pending) end);
end;$$;

-- Historical definitions remain intact; update only the current credited creation path.
do $$declare source text;needle text:='(select count(*) from public.guitars where owner_id=p_owner_id)>=25';begin
  source:=pg_get_functiondef('public.create_instrument_profile_credited(uuid,text,text,jsonb,boolean,text,text)'::regprocedure);
  if (length(source)-length(replace(source,needle,'')))/length(needle)<>1 then
    raise exception 'The credited creation quota changed; review the five-free migration.';end if;
  execute replace(source,needle,'(select count(*) from public.guitars where owner_id=p_owner_id)>=5');
  source:=pg_get_functiondef('public.billing_account_status(uuid,text)'::regprocedure);
  if position('''freeLimit'',25' in source)=0 or position('greatest(25-owned,0)' in source)=0 then
    raise exception 'The billing status quota changed; review the five-free migration.';end if;
  source:=replace(replace(source,'''freeLimit'',25','''freeLimit'',5'),'greatest(25-owned,0)','greatest(5-owned,0)');
  -- Legacy Stripe status stays parseable; the direct status RPC supplies direct orders.
  needle:='select * into unresolved from public.billing_orders where owner_id=p_owner_id and environment=p_environment and status in (''reserved'',''open'');';
  if position(needle in source)=0 then raise exception 'The unresolved order query changed; review the direct order boundary.';end if;
  source:=replace(source,needle,'select * into unresolved from public.billing_orders b where owner_id=p_owner_id and environment=p_environment and status in (''reserved'',''open'') and not exists(select 1 from public.billing_direct_orders d where d.order_id=b.id);');
  execute source;
end;$$;

do $$declare f record;begin
  for f in select oid::regprocedure signature,proname from pg_proc where pronamespace='public'::regnamespace
    and (proname like 'billing_direct_%' or proname like '_billing_direct_%') loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
    if f.proname like 'billing_direct_%' then execute format('grant execute on function %s to service_role',f.signature);end if;
  end loop;
end;$$;
commit;
