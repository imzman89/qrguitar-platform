-- Permanent additional Profile credits; additive migration over the reviewed 2026-09-17.2 schema.
-- Preserve historical migrations. Exact create-body guards fail closed on upstream implementation drift.
begin;

create table public.billing_instance_config (
  singleton boolean primary key default true check(singleton),
  create_environment text not null check(create_environment in ('test','live'))
);
insert into public.billing_instance_config(singleton,create_environment) values(true,'live');

create table public.billing_offers (
  environment text not null check(environment in ('test','live')),
  offer_key text not null, version integer not null, price_id text not null,
  amount integer not null, credits integer not null, currency text not null check(currency='usd'),
  created_at timestamptz not null default clock_timestamp(),
  primary key(environment,offer_key,version), unique(environment,price_id),
  check(version=1 and ((offer_key='profile_1' and amount=1200 and credits=1)
    or (offer_key='profile_10' and amount=5000 and credits=10)
    or (offer_key='profile_25' and amount=9900 and credits=25)))
);
create table public.billing_customers (
  owner_id uuid not null, environment text not null check(environment in ('test','live')),
  customer_id text not null, created_at timestamptz not null default clock_timestamp(),
  primary key(owner_id,environment), unique(environment,customer_id)
);
create table public.billing_orders (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null,
  environment text not null check(environment in ('test','live')), request_key uuid not null,
  offer jsonb not null, status text not null default 'reserved' check(status in ('reserved','open','fulfilled','expired')),
  customer_id text, session_id text, payment_id text, last_error text,
  created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
  unique(owner_id,environment,request_key), unique(environment,session_id), unique(environment,payment_id),
  unique(id,owner_id,environment)
);
create unique index billing_one_unresolved_checkout on public.billing_orders(owner_id,environment) where status in ('reserved','open');
create table public.billing_receipts (
  environment text not null, event_id text not null, owner_id uuid not null, order_id uuid not null,
  kind text not null check(kind in ('payment','refund','dispute','expired','error')),
  receipt jsonb not null, created_at timestamptz not null default clock_timestamp(),
  primary key(environment,event_id),
  foreign key(order_id,owner_id,environment) references public.billing_orders(id,owner_id,environment)
);
create table public.billing_credit_grants (
  order_id uuid primary key, owner_id uuid not null, environment text not null,
  session_id text not null, payment_id text not null, credits integer not null check(credits>0),
  created_at timestamptz not null default clock_timestamp(),
  unique(environment,session_id), unique(environment,payment_id), unique(order_id,owner_id,environment),
  foreign key(order_id,owner_id,environment) references public.billing_orders(id,owner_id,environment)
);
create table public.billing_credit_consumptions (
  guitar_id uuid primary key, order_id uuid not null, owner_id uuid not null, environment text not null,
  create_key text not null, credits integer not null default 1 check(credits=1),
  created_at timestamptz not null default clock_timestamp(), unique(owner_id,create_key),
  foreign key(order_id,owner_id,environment) references public.billing_credit_grants(order_id,owner_id,environment)
);
create table public.billing_credit_holds (
  environment text not null, event_id text not null, owner_id uuid not null, reason text not null,
  created_at timestamptz not null default clock_timestamp(), primary key(environment,event_id),
  foreign key(environment,event_id) references public.billing_receipts(environment,event_id)
);
create table public.billing_review_decisions (
  id uuid primary key, environment text not null, event_id text not null, owner_id uuid not null,
  operator_id uuid not null, action text not null check(action in ('release','retain_hold')), reason text not null,
  created_at timestamptz not null default clock_timestamp(),
  foreign key(environment,event_id) references public.billing_credit_holds(environment,event_id)
);
-- No cascade/FK to Auth or guitars: historical receipts survive account/instrument removal.

create function public._billing_immutable() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin raise exception using errcode='42501',message='Billing history is append-only.'; end;$$;
create function public._billing_order_identity() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if tg_op='DELETE' then raise exception using errcode='42501',message='Billing orders cannot be deleted.';end if;
  if row(new.id,new.owner_id,new.environment,new.request_key,new.offer,new.created_at)
    is distinct from row(old.id,old.owner_id,old.environment,old.request_key,old.offer,old.created_at)
    or (old.customer_id is not null and new.customer_id is distinct from old.customer_id)
    or (old.session_id is not null and new.session_id is distinct from old.session_id)
    or (old.payment_id is not null and new.payment_id is distinct from old.payment_id) then
    raise exception using errcode='42501',message='Billing order identity is immutable.';
  end if;
  return new;
end;$$;
create function public._billing_instance_boundary() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if tg_op='DELETE' then raise exception using errcode='42501',message='The database billing boundary cannot be removed.';end if;
  if new.create_environment is distinct from old.create_environment and (
    exists(select 1 from auth.users) or exists(select 1 from public.profiles)
    or exists(select 1 from public.guitars) or exists(select 1 from public.instrument_create_receipts)
    or exists(select 1 from public.instrument_staged_uploads) or exists(select 1 from public.billing_orders)
    or exists(select 1 from public.billing_customers)) then
    raise exception using errcode='42501',message='Billing environment may be configured only on an empty isolated database.';
  end if;
  return new;
end;$$;
do $$declare t text;begin
  foreach t in array array['billing_instance_config','billing_offers','billing_customers','billing_orders','billing_receipts','billing_credit_grants','billing_credit_consumptions','billing_credit_holds','billing_review_decisions'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on table public.%I from public,anon,authenticated,service_role',t);
    execute format('create policy qrguitar_billing_server_only on public.%I as restrictive for all to anon,authenticated using(false) with check(false)',t);
    if t not in ('billing_orders','billing_instance_config') then execute format('create trigger billing_history_immutable before update or delete on public.%I for each row execute function public._billing_immutable()',t);end if;
  end loop;
end;$$;
create trigger billing_order_identity before update or delete on public.billing_orders for each row execute function public._billing_order_identity();
create trigger billing_instance_boundary before update or delete on public.billing_instance_config for each row execute function public._billing_instance_boundary();

create function public._billing_environment(p_environment text) returns void language plpgsql immutable set search_path=pg_catalog,public as $$
begin if p_environment is null or p_environment not in ('test','live') then raise exception using errcode='22023',message='Invalid billing environment.';end if;end;$$;
create function public._billing_create_environment(p_environment text) returns void language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
  perform public._billing_environment(p_environment);
  if p_environment is distinct from (select create_environment from public.billing_instance_config where singleton) then
    raise exception using errcode='42501',message='Test and live Profile creation require separate configured databases.';
  end if;
end;$$;
create function public._billing_offer(p_offer jsonb) returns void language plpgsql immutable set search_path=pg_catalog,public as $$
declare a integer;c integer;begin
  if jsonb_typeof(p_offer) is distinct from 'object' then raise exception using errcode='22023',message='Invalid billing offer.';end if;
  case p_offer->>'key' when 'profile_1' then a:=1200;c:=1;when 'profile_10' then a:=5000;c:=10;when 'profile_25' then a:=9900;c:=25;else raise exception using errcode='22023',message='Unapproved billing offer.';end case;
  if coalesce(p_offer->>'priceId','') !~ '^price_[A-Za-z0-9_]{1,180}$'
    or p_offer is distinct from jsonb_build_object('key',p_offer->>'key','version',1,'currency','usd','amount',a,'credits',c,'priceId',p_offer->>'priceId') then
    raise exception using errcode='22023',message='Billing offer must exactly match approved USD pricing.';
  end if;
end;$$;
create function public._billing_lock_actor(p_owner_id uuid,p_environment text,p_active boolean) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare s text;begin
  perform public._billing_environment(p_environment);
  if p_owner_id is null then raise exception using errcode='22023',message='Billing owner is required.';end if;
  perform pg_advisory_xact_lock(hashtextextended('qrguitar:create:'||p_owner_id::text,0));
  if p_active and not exists(select 1 from auth.users where id=p_owner_id) then raise exception using errcode='42501',message='Billing account is unavailable.';end if;
  if p_active then insert into public.profiles(id) values(p_owner_id) on conflict(id) do nothing;end if;
  select account_status into s from public.profiles where id=p_owner_id for update;
  if p_active and s is distinct from 'active' then raise exception using errcode='42501',message='This account cannot purchase credits.';end if;
end;$$;
create function public._billing_held(p_owner_id uuid,p_environment text) returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select exists(select 1 from public.billing_credit_holds h where h.owner_id=p_owner_id and h.environment=p_environment
    and not exists(select 1 from public.billing_review_decisions d where d.environment=h.environment and d.event_id=h.event_id and d.action='release'));
$$;
create function public._billing_order_json(p_order public.billing_orders) returns jsonb language sql stable set search_path=pg_catalog,public as $$
  select jsonb_build_object('orderId',p_order.id,'ownerId',p_order.owner_id,'environment',p_order.environment,'requestKey',p_order.request_key,
    'status',p_order.status,'offer',p_order.offer,'customerId',p_order.customer_id,'sessionId',p_order.session_id,'paymentId',p_order.payment_id,
    'lastError',p_order.last_error,'createdAt',p_order.created_at,'updatedAt',p_order.updated_at);
$$;
create function public._billing_receipt(p_order public.billing_orders,p_kind text,p_receipt jsonb) returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
declare old public.billing_receipts%rowtype;begin
  if jsonb_typeof(p_receipt) is distinct from 'object' or coalesce(p_receipt->>'eventId','') !~ '^[A-Za-z0-9_:-]{3,200}$' then raise exception using errcode='22023',message='A canonical event receipt is required.';end if;
  insert into public.billing_receipts(environment,event_id,owner_id,order_id,kind,receipt)
    values(p_order.environment,p_receipt->>'eventId',p_order.owner_id,p_order.id,p_kind,p_receipt) on conflict do nothing;
  if found then return true;end if;
  select * into old from public.billing_receipts where environment=p_order.environment and event_id=p_receipt->>'eventId';
  if old.order_id is distinct from p_order.id or old.kind is distinct from p_kind or old.receipt is distinct from p_receipt then
    raise exception using errcode='PT409',message='This billing event was already recorded with different details.';
  end if;
  return false;
end;$$;

create function public.billing_register_offer(p_environment text,p_offer jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare saved public.billing_offers%rowtype;begin
  perform public._billing_environment(p_environment);perform public._billing_offer(p_offer);
  insert into public.billing_offers(environment,offer_key,version,price_id,amount,credits,currency)
    values(p_environment,p_offer->>'key',1,p_offer->>'priceId',(p_offer->>'amount')::integer,(p_offer->>'credits')::integer,'usd') on conflict do nothing;
  select * into saved from public.billing_offers where environment=p_environment and offer_key=p_offer->>'key' and version=1;
  if saved.price_id is distinct from p_offer->>'priceId' then raise exception using errcode='PT409',message='The approved offer mapping already has another Price identity.';end if;
  return p_offer;
end;$$;
create function public.billing_catalog(p_environment text) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
  perform public._billing_create_environment(p_environment);
  return jsonb_build_object('environment',p_environment,'createEnvironment',(select create_environment from public.billing_instance_config where singleton),
    'offers',coalesce((select jsonb_agg(jsonb_build_object('key',offer_key,'version',version,'currency',currency,'amount',amount,'credits',credits,'priceId',price_id) order by credits,offer_key,version)
      from public.billing_offers where environment=p_environment),'[]'::jsonb));
end;$$;
create function public.billing_get_customer(p_owner_id uuid,p_environment text) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin perform public._billing_environment(p_environment);if p_owner_id is null then raise exception using errcode='22023',message='Billing owner is required.';end if;
  return jsonb_build_object('customerId',(select customer_id from public.billing_customers where owner_id=p_owner_id and environment=p_environment));end;$$;
create function public.billing_get_order(p_owner_id uuid,p_environment text,p_order_id uuid) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare o public.billing_orders%rowtype;begin perform public._billing_environment(p_environment);
  select * into o from public.billing_orders where id=p_order_id and owner_id=p_owner_id and environment=p_environment;
  if not found then raise exception using errcode='P0002',message='Billing order was not found.';end if;return public._billing_order_json(o);end;$$;
create function public.billing_reserve_order(p_owner_id uuid,p_environment text,p_request_key uuid,p_offer jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare o public.billing_orders%rowtype;begin
  perform public._billing_offer(p_offer);perform public._billing_lock_actor(p_owner_id,p_environment,true);
  if p_request_key is null then raise exception using errcode='22023',message='A request UUID is required.';end if;
  select * into o from public.billing_orders where owner_id=p_owner_id and environment=p_environment and request_key=p_request_key;
  if found then
    if o.offer is distinct from p_offer then raise exception using errcode='PT409',message='This purchase request was already used for another offer.';end if;
    if o.status in ('reserved','open') and public._billing_held(p_owner_id,p_environment) then raise exception using errcode='PT409',message='Purchases are on hold pending billing review.';end if;
    return public._billing_order_json(o);
  end if;
  if public._billing_held(p_owner_id,p_environment) then raise exception using errcode='PT409',message='Purchases are on hold pending billing review.';end if;
  if not exists(select 1 from public.billing_offers where environment=p_environment and offer_key=p_offer->>'key' and version=1 and price_id=p_offer->>'priceId'
    and amount=(p_offer->>'amount')::integer and credits=(p_offer->>'credits')::integer and currency='usd') then raise exception using errcode='22023',message='This Price is not an approved offer in this environment.';end if;
  if exists(select 1 from public.billing_orders where owner_id=p_owner_id and environment=p_environment and status in ('reserved','open')) then
    raise exception using errcode='PT409',message='Resume the existing checkout before starting another purchase.';
  end if;
  insert into public.billing_orders(owner_id,environment,request_key,offer) values(p_owner_id,p_environment,p_request_key,p_offer) returning * into o;
  return public._billing_order_json(o);
end;$$;
create function public.billing_link_customer(p_owner_id uuid,p_environment text,p_customer_id text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare current_id text;begin
  perform public._billing_lock_actor(p_owner_id,p_environment,true);
  if coalesce(p_customer_id,'') !~ '^cus_[A-Za-z0-9_]{1,180}$' then raise exception using errcode='22023',message='Invalid Stripe customer identity.';end if;
  insert into public.billing_customers(owner_id,environment,customer_id) values(p_owner_id,p_environment,p_customer_id) on conflict do nothing;
  select customer_id into current_id from public.billing_customers where owner_id=p_owner_id and environment=p_environment;
  if current_id is distinct from p_customer_id then raise exception using errcode='PT409',message='The Stripe customer is already linked to another billing identity.';end if;
  return jsonb_build_object('customerId',current_id);
end;$$;
create function public.billing_link_checkout(p_owner_id uuid,p_environment text,p_order_id uuid,p_session_id text,p_customer_id text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare o public.billing_orders%rowtype;begin
  -- Attach only a server-verified existing Checkout identity; account restrictions must not block financial reconciliation.
  -- New purchases/customer creation still require an active account in their separate RPCs.
  perform public._billing_lock_actor(p_owner_id,p_environment,false);
  select * into o from public.billing_orders where id=p_order_id and owner_id=p_owner_id and environment=p_environment for update;
  if not found then raise exception using errcode='P0002',message='Billing order was not found.';end if;
  if coalesce(p_session_id,'') !~ '^cs_[A-Za-z0-9_]{1,180}$' or not exists(select 1 from public.billing_customers where owner_id=p_owner_id and environment=p_environment and customer_id=p_customer_id) then
    raise exception using errcode='22023',message='Checkout customer or session identity does not match.';end if;
  if o.session_id is not null then
    if o.session_id is distinct from p_session_id or o.customer_id is distinct from p_customer_id then raise exception using errcode='PT409',message='The order already has another Checkout identity.';end if;
    return public._billing_order_json(o);
  end if;
  if o.status<>'reserved' then raise exception using errcode='PT409',message='Only a reserved order can attach its Checkout.';end if;
  if exists(select 1 from public.billing_orders where environment=p_environment and session_id=p_session_id) then raise exception using errcode='PT409',message='Checkout already belongs to another order.';end if;
  update public.billing_orders set customer_id=p_customer_id,session_id=p_session_id,status='open',updated_at=clock_timestamp() where id=o.id returning * into o;
  return public._billing_order_json(o);
exception when unique_violation then raise exception using errcode='PT409',message='Checkout already belongs to another order.';
end;$$;

create function public._billing_payment_identity(p_order public.billing_orders,p_receipt jsonb) returns void language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
  if jsonb_typeof(p_receipt) is distinct from 'object'
    or p_receipt->>'environment' is distinct from p_order.environment
    or coalesce(p_receipt->>'sessionId','') !~ '^cs_[A-Za-z0-9_]{1,180}$'
    or coalesce(p_receipt->>'paymentId','') !~ '^pi_[A-Za-z0-9_]{1,180}$'
    or not exists(select 1 from public.billing_customers where owner_id=p_order.owner_id and environment=p_order.environment and customer_id=p_receipt->>'customerId')
    or (p_order.session_id is not null and p_order.session_id is distinct from p_receipt->>'sessionId')
    or (p_order.customer_id is not null and p_order.customer_id is distinct from p_receipt->>'customerId')
    or (p_order.payment_id is not null and p_order.payment_id is distinct from p_receipt->>'paymentId') then
    raise exception using errcode='PT409',message='Canonical payment identity does not match the order.';
  end if;
  if exists(select 1 from public.billing_orders where environment=p_order.environment and id<>p_order.id
    and (session_id=p_receipt->>'sessionId' or payment_id=p_receipt->>'paymentId')) then
    raise exception using errcode='PT409',message='This Checkout or payment is already attached to another order.';
  end if;
end;$$;
create function public.billing_fulfill_order(p_owner_id uuid,p_environment text,p_order_id uuid,p_receipt jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare o public.billing_orders%rowtype;existing public.billing_credit_grants%rowtype;new_grant boolean:=false;begin
  perform public._billing_lock_actor(p_owner_id,p_environment,false);
  select * into o from public.billing_orders where id=p_order_id and owner_id=p_owner_id and environment=p_environment for update;
  if not found then raise exception using errcode='P0002',message='Billing order was not found.';end if;
  perform public._billing_payment_identity(o,p_receipt);
  if p_receipt is distinct from jsonb_build_object('eventId',p_receipt->>'eventId','sessionId',p_receipt->>'sessionId','customerId',p_receipt->>'customerId',
    'paymentId',p_receipt->>'paymentId','priceId',o.offer->>'priceId','amount',o.offer->'amount','currency','usd','credits',o.offer->'credits',
    'quantity',1,'environment',p_environment,'status','complete','paymentStatus','paid') then
    raise exception using errcode='22023',message='Only the exact approved paid complete Checkout receipt may grant credits.';
  end if;
  perform public._billing_receipt(o,'payment',p_receipt);
  select * into existing from public.billing_credit_grants where order_id=o.id;
  if found then
    if existing.session_id is distinct from p_receipt->>'sessionId' or existing.payment_id is distinct from p_receipt->>'paymentId'
      or existing.credits is distinct from (o.offer->>'credits')::integer then raise exception using errcode='PT409',message='The completed order has a different grant identity.';end if;
  else
    insert into public.billing_credit_grants(order_id,owner_id,environment,session_id,payment_id,credits)
      values(o.id,p_owner_id,p_environment,p_receipt->>'sessionId',p_receipt->>'paymentId',(o.offer->>'credits')::integer);
    new_grant:=true;
  end if;
  if o.status='expired' then
    insert into public.billing_credit_holds(environment,event_id,owner_id,reason)
      values(p_environment,p_receipt->>'eventId',p_owner_id,'late_payment_after_expiry') on conflict do nothing;
  end if;
  update public.billing_orders set customer_id=p_receipt->>'customerId',session_id=p_receipt->>'sessionId',payment_id=p_receipt->>'paymentId',
    status='fulfilled',last_error=null,updated_at=case when status='fulfilled' then updated_at else clock_timestamp() end where id=o.id returning * into o;
  return public._billing_order_json(o)||jsonb_build_object('granted',new_grant,'alreadyGranted',not new_grant,'hold',public._billing_held(p_owner_id,p_environment));
exception when unique_violation then raise exception using errcode='PT409',message='This payment or Checkout was already recorded for another order.';
end;$$;
create function public.billing_record_review(p_owner_id uuid,p_environment text,p_order_id uuid,p_receipt jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare o public.billing_orders%rowtype;fresh boolean;begin
  perform public._billing_lock_actor(p_owner_id,p_environment,false);
  select * into o from public.billing_orders where id=p_order_id and owner_id=p_owner_id and environment=p_environment for update;
  if not found then raise exception using errcode='P0002',message='Billing order was not found.';end if;
  perform public._billing_payment_identity(o,p_receipt);
  if coalesce(p_receipt->>'kind','') not in ('refund','dispute') or coalesce(p_receipt->>'referenceId','') !~ '^(ch|re|dp)_[A-Za-z0-9_]{1,180}$'
    or p_receipt is distinct from jsonb_build_object('eventId',p_receipt->>'eventId','sessionId',p_receipt->>'sessionId','customerId',p_receipt->>'customerId',
      'paymentId',p_receipt->>'paymentId','environment',p_environment,'kind',p_receipt->>'kind','referenceId',p_receipt->>'referenceId') then
    raise exception using errcode='22023',message='A canonical refund or dispute receipt is required.';
  end if;
  fresh:=public._billing_receipt(o,p_receipt->>'kind',p_receipt);
  if not fresh then return public._billing_order_json(o)||jsonb_build_object('hold',public._billing_held(p_owner_id,p_environment));end if;
  insert into public.billing_credit_holds(environment,event_id,owner_id,reason)
    values(p_environment,p_receipt->>'eventId',p_owner_id,p_receipt->>'kind') on conflict do nothing;
  update public.billing_orders set customer_id=p_receipt->>'customerId',session_id=p_receipt->>'sessionId',payment_id=p_receipt->>'paymentId',
    status=case when status='reserved' then 'open' else status end,last_error='billing_review_required',updated_at=clock_timestamp() where id=o.id returning * into o;
  return public._billing_order_json(o)||jsonb_build_object('hold',public._billing_held(p_owner_id,p_environment));
exception when unique_violation then raise exception using errcode='PT409',message='This payment or Checkout was already recorded for another order.';
end;$$;
create function public.billing_record_checkout_expired(p_owner_id uuid,p_environment text,p_order_id uuid,p_receipt jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare o public.billing_orders%rowtype;begin
  perform public._billing_lock_actor(p_owner_id,p_environment,false);
  select * into o from public.billing_orders where id=p_order_id and owner_id=p_owner_id and environment=p_environment for update;
  if not found then raise exception using errcode='P0002',message='Billing order was not found.';end if;
  if o.session_id is null or o.customer_id is null or p_receipt is distinct from jsonb_build_object('eventId',p_receipt->>'eventId','sessionId',o.session_id,
    'customerId',o.customer_id,'environment',p_environment,'status','expired','paymentStatus','unpaid') then
    raise exception using errcode='PT409',message='Only the exact linked expired unpaid Checkout can resolve this order.';
  end if;
  perform public._billing_receipt(o,'expired',p_receipt);
  if o.status='open' and o.payment_id is null then
    update public.billing_orders set status='expired',last_error=null,updated_at=clock_timestamp() where id=o.id returning * into o;
  elsif o.status not in ('expired','fulfilled') then
    raise exception using errcode='PT409',message='This order requires payment reconciliation before it can expire.';
  end if;
  return public._billing_order_json(o);
end;$$;
create function public.billing_mark_order_error(p_owner_id uuid,p_environment text,p_order_id uuid,p_code text,p_receipt_id text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare o public.billing_orders%rowtype;fresh boolean;begin
  perform public._billing_lock_actor(p_owner_id,p_environment,false);
  if coalesce(p_code,'') !~ '^[a-z][a-z0-9_]{2,79}$' then raise exception using errcode='22023',message='Use a sanitized billing error code.';end if;
  select * into o from public.billing_orders where id=p_order_id and owner_id=p_owner_id and environment=p_environment for update;
  if not found then raise exception using errcode='P0002',message='Billing order was not found.';end if;
  fresh:=public._billing_receipt(o,'error',jsonb_build_object('eventId',p_receipt_id,'code',p_code));
  if fresh and o.status in ('reserved','open') then update public.billing_orders set last_error=p_code,updated_at=clock_timestamp() where id=o.id returning * into o;end if;
  return public._billing_order_json(o);
end;$$;
create function public.billing_resolve_review(p_owner_id uuid,p_environment text,p_event_id text,p_operator_id uuid,p_decision_id uuid,p_action text,p_reason text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare d public.billing_review_decisions%rowtype;begin
  perform public._billing_lock_actor(p_owner_id,p_environment,false);
  if not exists(select 1 from public.profiles where id=p_operator_id and role='admin' and account_status='active') then
    raise exception using errcode='42501',message='An active administrator must review billing holds.';end if;
  if p_decision_id is null or p_action is null or p_action not in ('release','retain_hold') or char_length(coalesce(btrim(p_reason),'')) not between 10 and 1000 then
    raise exception using errcode='22023',message='A reviewed decision identity and reason are required.';end if;
  if not exists(select 1 from public.billing_credit_holds where owner_id=p_owner_id and environment=p_environment and event_id=p_event_id) then
    raise exception using errcode='P0002',message='Billing review receipt was not found.';end if;
  select * into d from public.billing_review_decisions where id=p_decision_id;
  if found then
    if row(d.environment,d.event_id,d.owner_id,d.operator_id,d.action,d.reason) is distinct from row(p_environment,p_event_id,p_owner_id,p_operator_id,p_action,btrim(p_reason)) then
      raise exception using errcode='PT409',message='This review decision was already used with different details.';end if;
    return jsonb_build_object('hold',public._billing_held(p_owner_id,p_environment),'decisionId',d.id);
  end if;
  if exists(select 1 from public.billing_review_decisions where environment=p_environment and event_id=p_event_id and action='release') then
    raise exception using errcode='PT409',message='This reviewed receipt was already released. A new verified review receipt is required to reopen a hold.';
  end if;
  insert into public.billing_review_decisions(id,environment,event_id,owner_id,operator_id,action,reason)
    values(p_decision_id,p_environment,p_event_id,p_owner_id,p_operator_id,p_action,btrim(p_reason)) on conflict do nothing;
  select * into d from public.billing_review_decisions where id=p_decision_id;
  if row(d.environment,d.event_id,d.owner_id,d.operator_id,d.action,d.reason) is distinct from row(p_environment,p_event_id,p_owner_id,p_operator_id,p_action,btrim(p_reason)) then
    raise exception using errcode='PT409',message='This review decision was already used with different details.';end if;
  return jsonb_build_object('hold',public._billing_held(p_owner_id,p_environment),'decisionId',d.id);
exception when unique_violation then raise exception using errcode='PT409',message='This review decision identity was already recorded.';
end;$$;
create function public.billing_account_status(p_owner_id uuid,p_environment text) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare owned bigint;granted bigint;consumed bigint;held boolean;unresolved public.billing_orders%rowtype;begin
  perform public._billing_environment(p_environment);if p_owner_id is null then raise exception using errcode='22023',message='Billing owner is required.';end if;
  select count(*) into owned from public.guitars where owner_id=p_owner_id;
  select coalesce(sum(credits),0) into granted from public.billing_credit_grants where owner_id=p_owner_id and environment=p_environment;
  select coalesce(sum(credits),0) into consumed from public.billing_credit_consumptions where owner_id=p_owner_id and environment=p_environment;
  held:=public._billing_held(p_owner_id,p_environment);
  select * into unresolved from public.billing_orders where owner_id=p_owner_id and environment=p_environment and status in ('reserved','open');
  return jsonb_build_object('environment',p_environment,'createEnvironment',(select create_environment from public.billing_instance_config where singleton),'freeLimit',25,'ownedProfiles',owned,'freeRemaining',greatest(25-owned,0),
    'commercialExempt',coalesce((select plan in ('business','enterprise') from public.profiles where id=p_owner_id),false),
    'paidGranted',granted,'paidConsumed',consumed,'paidRemaining',granted-consumed,'paidAvailable',case when held then 0 else granted-consumed end,
    'hold',held,'unresolvedOrder',case when unresolved.id is null then null else public._billing_order_json(unresolved) end);
end;$$;
create function public._billing_consume_profile_credit(p_owner_id uuid,p_environment text,p_guitar_id uuid,p_create_key text) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare grant_id uuid;begin
  perform public._billing_environment(p_environment);
  -- Called only after the original create function has acquired the owner advisory/profile lock.
  if public._billing_held(p_owner_id,p_environment) then raise exception using errcode='QG008',message='Paid Profile credits are on hold pending billing review.';end if;
  select g.order_id into grant_id from public.billing_credit_grants g where g.owner_id=p_owner_id and g.environment=p_environment
    and g.credits>(select count(*) from public.billing_credit_consumptions c where c.order_id=g.order_id)
    order by g.created_at,g.order_id limit 1;
  if grant_id is null then raise exception using errcode='QG001',message='The free Profile capacity is full and no prepaid Profile credits remain.';end if;
  insert into public.billing_credit_consumptions(guitar_id,order_id,owner_id,environment,create_key) values(p_guitar_id,grant_id,p_owner_id,p_environment,p_create_key);
end;$$;

-- Additive overloads preserve the reviewed staged-upload implementation. Exact body guards
-- deliberately refuse unexpected upstream changes; do not weaken them to force a migration.
do $$declare backing text;wrapper text;old_quota text;new_quota text;begin
  select prosrc into backing from pg_proc where oid='public.create_instrument_profile_unregistered(uuid,text,text,jsonb,boolean,text)'::regprocedure;
  select prosrc into wrapper from pg_proc where oid='public.create_instrument_profile(uuid,text,text,jsonb,boolean,text)'::regprocedure;
  -- Match the deployed readiness contract's CRLF normalization, while preserving all other bytes.
  backing:=replace(backing,E'\r\n',E'\n');wrapper:=replace(wrapper,E'\r\n',E'\n');
  if encode(sha256(convert_to(backing,'UTF8')),'hex')<>'c5cfecebf87e01a60d9b28011d702cf21f0311aa3d23ee87b011dcf54bd4a303'
    or encode(sha256(convert_to(wrapper,'UTF8')),'hex')<>'680f6f11d9beaae41c154fcdc6dd5365db648a5294cec9796c943e7b929d751f' then
    raise exception 'The reviewed create implementation changed. Review and regenerate the additive billing integration.';
  end if;
  old_quota:=$q$    if owner_row.plan not in ('business','enterprise') and not coalesce(p_launch_testing_access,false) and
      (select count(*) from public.guitars where owner_id=p_owner_id)>=25 then
      raise exception using errcode='QG001',message='Free public beta accounts can create up to 25 Profiles.';
    end if;$q$;
  new_quota:=$q$    needs_paid_credit := owner_row.plan not in ('business','enterprise') and not coalesce(p_launch_testing_access,false) and
      (select count(*) from public.guitars where owner_id=p_owner_id)>=25;$q$;
  if position(old_quota in backing)=0 or position('  completed_time := clock_timestamp();' in backing)=0 then raise exception 'The create credit insertion points changed.';end if;
  backing:=replace(backing,'  recovered boolean := false;','  recovered boolean := false;'||chr(10)||'  needs_paid_credit boolean := false;');
  backing:=replace(backing,old_quota,new_quota);
  backing:=replace(backing,'  completed_time := clock_timestamp();','  if needs_paid_credit then perform public._billing_consume_profile_credit(p_owner_id,p_billing_environment,guitar_id,p_idempotency_key);end if;'||chr(10)||'  completed_time := clock_timestamp();');
  execute 'create function public.create_instrument_profile_credited(p_owner_id uuid,p_idempotency_key text,p_upload_id text,p_payload jsonb,p_launch_testing_access boolean,p_owner_display_name text,p_billing_environment text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as '||quote_literal(backing);
  wrapper:=replace(wrapper,'public.create_instrument_profile_unregistered(p_owner_id,p_idempotency_key,p_upload_id,p_payload,p_launch_testing_access,p_owner_display_name)',
    'public.create_instrument_profile_credited(p_owner_id,p_idempotency_key,p_upload_id,p_payload,p_launch_testing_access,p_owner_display_name,p_billing_environment)');
  wrapper:=replace(wrapper,'begin'||chr(10)||'  if p_owner_id','begin'||chr(10)||'  perform public._billing_create_environment(p_billing_environment);'||chr(10)||'  if p_owner_id');
  execute 'create function public.create_instrument_profile(p_owner_id uuid,p_idempotency_key text,p_upload_id text,p_payload jsonb,p_launch_testing_access boolean,p_owner_display_name text,p_billing_environment text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as '||quote_literal(wrapper);
end;$$;
create or replace function public.create_instrument_profile(p_owner_id uuid,p_idempotency_key text,p_upload_id text,p_payload jsonb,p_launch_testing_access boolean default false,p_owner_display_name text default null)
returns jsonb language sql security definer set search_path=pg_catalog,public as $$
  select public.create_instrument_profile(p_owner_id,p_idempotency_key,p_upload_id,p_payload,p_launch_testing_access,p_owner_display_name,'live');
$$;

-- Explicit allowlist: even service_role cannot call private helpers or mutate history directly.
do $$declare p record;begin
  for p in select oid::regprocedure signature,proname from pg_proc where pronamespace='public'::regnamespace and (proname like 'billing\_%' escape '\' or proname like '\_billing\_%' escape '\' or proname='create_instrument_profile_credited') loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',p.signature);
    if p.proname like 'billing\_%' escape '\' then execute format('grant execute on function %s to service_role',p.signature);end if;
  end loop;
end;$$;
revoke all on function public.create_instrument_profile(uuid,text,text,jsonb,boolean,text) from public,anon,authenticated;
revoke all on function public.create_instrument_profile(uuid,text,text,jsonb,boolean,text,text) from public,anon,authenticated;
grant execute on function public.create_instrument_profile(uuid,text,text,jsonb,boolean,text),public.create_instrument_profile(uuid,text,text,jsonb,boolean,text,text) to service_role;
revoke all on function public.create_instrument_profile_unregistered(uuid,text,text,jsonb,boolean,text) from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
