-- Automatic PayPal Orders v2 payments. Only a server-verified provider response
-- may grant credits; browser approval, cancellation and payment claims never do.
begin;

create table public.billing_paypal_orders (
  order_id uuid primary key, owner_id uuid not null, environment text not null,
  merchant_id text not null check(merchant_id ~ '^[A-Z0-9]{5,64}$'),
  created_at timestamptz not null default clock_timestamp(),
  foreign key(order_id,owner_id,environment) references public.billing_orders(id,owner_id,environment)
);
create table public.billing_paypal_bindings (
  order_id uuid primary key references public.billing_paypal_orders(order_id),
  environment text not null check(environment in ('live','test')),
  paypal_order_id text not null check(paypal_order_id ~ '^[A-Z0-9]{5,64}$'),
  created_at timestamptz not null default clock_timestamp(), unique(environment,paypal_order_id)
);
-- Shared by automatic and manually verified providers. The receiving-account
-- configuration is deliberately absent from the unique key: renaming an account
-- must not make a previously granted provider receipt spendable a second time.
create table public.billing_provider_references (
  environment text not null, provider text not null check(provider in ('venmo','cashapp','zelle','paypal')),
  normalized_reference text not null check(char_length(normalized_reference) between 3 and 200),
  order_id uuid not null references public.billing_orders(id),
  created_at timestamptz not null default clock_timestamp(),
  primary key(environment,provider,normalized_reference)
);
insert into public.billing_provider_references(environment,provider,normalized_reference,order_id,created_at)
  select environment,provider,normalized_reference,order_id,created_at from public.billing_direct_payments;

do $$declare t text;begin
  foreach t in array array['billing_paypal_orders','billing_paypal_bindings','billing_provider_references'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on table public.%I from public,anon,authenticated,service_role',t);
    execute format('create policy qrguitar_billing_server_only on public.%I as restrictive for all to anon,authenticated using(false) with check(false)',t);
    execute format('create trigger billing_history_immutable before update or delete on public.%I for each row execute function public._billing_immutable()',t);
  end loop;
end;$$;

create function public._billing_paypal_register_reference(p_environment text,p_provider text,p_reference text,p_order_id uuid) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare existing uuid; normalized text;begin
  normalized:=lower(regexp_replace(coalesce(p_reference,''),'[^A-Za-z0-9]','','g'));
  if char_length(normalized) not between 3 and 200 then raise exception using errcode='22023',message='An actual provider transaction identity is required.';end if;
  insert into public.billing_provider_references(environment,provider,normalized_reference,order_id)
    values(p_environment,p_provider,normalized,p_order_id) on conflict do nothing;
  select order_id into existing from public.billing_provider_references
    where environment=p_environment and provider=p_provider and normalized_reference=normalized;
  if existing is distinct from p_order_id then raise exception using errcode='PT409',message='This provider transaction already belongs to another order.';end if;
end;$$;
create function public._billing_paypal_direct_reference() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  perform public._billing_paypal_register_reference(new.environment,new.provider,new.normalized_reference,new.order_id);
  return new;
end;$$;
create trigger billing_provider_reference before insert on public.billing_direct_payments
  for each row execute function public._billing_paypal_direct_reference();

create function public._billing_paypal_order_json(p_order public.billing_orders) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
  select public._billing_order_json(p_order)||jsonb_build_object('provider','paypal','merchantId',p.merchant_id,
    'paypalOrderId',(select b.paypal_order_id from public.billing_paypal_bindings b where b.order_id=p_order.id),
    'captureId',case when p_order.payment_id like 'paypal_capture:%' then substr(p_order.payment_id,16) else null end,
    'hold',public._billing_held(p_order.owner_id,p_order.environment))
  from public.billing_paypal_orders p where p.order_id=p_order.id;
$$;
create function public.billing_paypal_get_order(p_owner_id uuid,p_environment text,p_order_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare o public.billing_orders%rowtype;begin
  perform public._billing_create_environment(p_environment);
  select b.* into o from public.billing_orders b join public.billing_paypal_orders p on p.order_id=b.id
    where b.id=p_order_id and b.owner_id=p_owner_id and b.environment=p_environment;
  if not found then raise exception using errcode='P0002',message='PayPal payment order was not found.';end if;
  return public._billing_paypal_order_json(o);
end;$$;
create function public.billing_paypal_find_order(p_owner_id uuid,p_environment text,p_request_key uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare o public.billing_orders%rowtype;begin
  perform public._billing_create_environment(p_environment);
  if p_owner_id is null or p_request_key is null then raise exception using errcode='22023',message='Owner and request UUID are required.';end if;
  select b.* into o from public.billing_orders b join public.billing_paypal_orders p on p.order_id=b.id
    where b.owner_id=p_owner_id and b.environment=p_environment and b.request_key=p_request_key;
  return jsonb_build_object('order',case when o.id is null then null else public._billing_paypal_order_json(o) end);
end;$$;
create function public.billing_paypal_reserve_order(p_owner_id uuid,p_environment text,p_request_key uuid,p_offer_key text,p_merchant_id text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare o public.billing_orders%rowtype;p public.billing_paypal_orders%rowtype;a integer;c integer;offer jsonb;begin
  perform public._billing_create_environment(p_environment);
  perform public._billing_lock_actor(p_owner_id,p_environment,true);
  if p_request_key is null or coalesce(p_merchant_id,'') !~ '^[A-Z0-9]{5,64}$' then
    raise exception using errcode='22023',message='A request UUID and configured PayPal merchant identity are required.';end if;
  case p_offer_key when 'profile_1' then a:=1200;c:=1;when 'profile_10' then a:=5000;c:=10;
    when 'profile_25' then a:=9900;c:=25;else raise exception using errcode='22023',message='Unapproved Profile credit pack.';end case;
  offer:=jsonb_build_object('key',p_offer_key,'version',1,'currency','usd','amount',a,'credits',c);
  select * into o from public.billing_orders where owner_id=p_owner_id and environment=p_environment and request_key=p_request_key;
  if found then
    select * into p from public.billing_paypal_orders where order_id=o.id;
    if p.order_id is null or o.offer is distinct from offer or p.merchant_id is distinct from p_merchant_id then
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
  insert into public.billing_orders(owner_id,environment,request_key,offer) values(p_owner_id,p_environment,p_request_key,offer) returning * into o;
  insert into public.billing_paypal_orders(order_id,owner_id,environment,merchant_id) values(o.id,p_owner_id,p_environment,p_merchant_id);
  return public._billing_paypal_order_json(o);
exception when unique_violation then raise exception using errcode='PT409',message='A payment request already exists. Resume that order.';
end;$$;
create function public.billing_paypal_lookup_order(p_environment text,p_paypal_order_id text default null,p_capture_id text default null) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare o public.billing_orders%rowtype;begin
  perform public._billing_create_environment(p_environment);
  if (p_paypal_order_id is null and p_capture_id is null)
    or (p_paypal_order_id is not null and p_paypal_order_id !~ '^[A-Z0-9]{5,64}$')
    or (p_capture_id is not null and p_capture_id !~ '^[A-Z0-9]{5,64}$') then
    raise exception using errcode='22023',message='A verified PayPal order or capture identity is required.';end if;
  select x.* into o from public.billing_orders x join public.billing_paypal_bindings b on b.order_id=x.id
    where x.environment=p_environment and b.environment=p_environment
    and (p_paypal_order_id is null or b.paypal_order_id=p_paypal_order_id)
    and (p_capture_id is null or x.payment_id='paypal_capture:'||p_capture_id);
  return jsonb_build_object('order',case when o.id is null then null else public._billing_paypal_order_json(o) end);
end;$$;
create function public.billing_paypal_bind_order(p_owner_id uuid,p_environment text,p_order_id uuid,p_paypal_order_id text,p_merchant_id text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare o public.billing_orders%rowtype;p public.billing_paypal_orders%rowtype;b public.billing_paypal_bindings%rowtype;begin
  perform public._billing_create_environment(p_environment);
  perform public._billing_lock_actor(p_owner_id,p_environment,false);
  select x.* into o from public.billing_orders x join public.billing_paypal_orders y on y.order_id=x.id
    where x.id=p_order_id and x.owner_id=p_owner_id and x.environment=p_environment for update of x;
  if not found then raise exception using errcode='P0002',message='PayPal payment order was not found.';end if;
  select * into p from public.billing_paypal_orders where order_id=o.id;
  if coalesce(p_paypal_order_id,'') !~ '^[A-Z0-9]{5,64}$' or p.merchant_id is distinct from p_merchant_id then
    raise exception using errcode='22023',message='The verified PayPal order or merchant identity does not match.';end if;
  select * into b from public.billing_paypal_bindings where order_id=o.id;
  if found then
    if b.paypal_order_id is distinct from p_paypal_order_id then raise exception using errcode='PT409',message='This purchase already has another PayPal order.';end if;
    return public._billing_paypal_order_json(o);
  end if;
  -- A late verified create/capture must still attach to a safely expired local
  -- reservation for reconciliation. Binding never reopens an expired purchase.
  if o.status not in ('reserved','expired') or o.session_id is not null then raise exception using errcode='PT409',message='Only an unbound purchase can attach its PayPal order.';end if;
  insert into public.billing_paypal_bindings(order_id,environment,paypal_order_id) values(o.id,p_environment,p_paypal_order_id);
  update public.billing_orders set session_id='paypal_order:'||p_paypal_order_id,status=case when status='expired' then 'expired' else 'open' end,updated_at=clock_timestamp() where id=o.id returning * into o;
  return public._billing_paypal_order_json(o);
exception when unique_violation then raise exception using errcode='PT409',message='This PayPal order already belongs to another purchase.';
end;$$;

-- Used only after the server fetched a provider order and verified its custom
-- reference and receiving merchant. This recovers a lost create/bind response.
create function public.billing_paypal_find_correlated_order(p_environment text,p_order_id uuid,p_merchant_id text) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare o public.billing_orders%rowtype;begin
  perform public._billing_create_environment(p_environment);
  if p_order_id is null or coalesce(p_merchant_id,'') !~ '^[A-Z0-9]{5,64}$' then raise exception using errcode='22023',message='A verified local reference and PayPal merchant are required.';end if;
  select b.* into o from public.billing_orders b join public.billing_paypal_orders p on p.order_id=b.id
    where b.id=p_order_id and b.environment=p_environment and p.merchant_id=p_merchant_id;
  return jsonb_build_object('order',case when o.id is null then null else public._billing_paypal_order_json(o) end);
end;$$;

create function public.billing_paypal_expire_unbound(p_owner_id uuid,p_environment text,p_order_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare o public.billing_orders%rowtype;begin
  perform public._billing_create_environment(p_environment);
  perform public._billing_lock_actor(p_owner_id,p_environment,false);
  select b.* into o from public.billing_orders b join public.billing_paypal_orders p on p.order_id=b.id
    where b.id=p_order_id and b.owner_id=p_owner_id and b.environment=p_environment for update of b;
  if not found then raise exception using errcode='P0002',message='PayPal payment order was not found.';end if;
  -- Binding wins this race by preserving the original order for recovery. No
  -- browser has a usable provider order until that binding succeeds. New remote
  -- create attempts are forbidden after five hours in the server service.
  if o.status<>'reserved' or o.session_id is not null or o.payment_id is not null
    or exists(select 1 from public.billing_paypal_bindings where order_id=o.id) then return public._billing_paypal_order_json(o);end if;
  if o.created_at>clock_timestamp()-interval '5 hours' then raise exception using errcode='PT409',message='The unfinished purchase is still inside its safe retry window.';end if;
  perform public._billing_receipt(o,'expired',jsonb_build_object('eventId','paypal:unbound-expired:'||o.id::text,
    'source','qrguitar_recovery','status','UNBOUND_REQUEST_EXPIRED','reason','Unbound provider request passed the five-hour create retry window.'));
  update public.billing_orders set status='expired',last_error=null,updated_at=clock_timestamp() where id=o.id returning * into o;
  return public._billing_paypal_order_json(o);
end;$$;

create function public._billing_paypal_validate_capture(p_order public.billing_orders,p_receipt jsonb) returns void
language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
  if jsonb_typeof(p_receipt) is distinct from 'object'
    or coalesce(p_receipt->>'captureId','') !~ '^[A-Z0-9]{5,64}$'
    or p_receipt->>'referenceId' is distinct from p_order.id::text
    or p_receipt->>'customId' is distinct from p_order.id::text
    or p_receipt->>'invoiceId' is distinct from 'QRG-'||p_order.id::text
    or not exists(select 1 from public.billing_paypal_orders p join public.billing_paypal_bindings b on b.order_id=p.order_id
      where p.order_id=p_order.id and p.merchant_id=p_receipt->>'merchantId' and b.environment=p_order.environment
      and b.paypal_order_id=p_receipt->>'paypalOrderId' and p_order.session_id='paypal_order:'||b.paypal_order_id)
    or p_receipt is distinct from jsonb_build_object('paypalOrderId',p_receipt->>'paypalOrderId','captureId',p_receipt->>'captureId',
      'merchantId',p_receipt->>'merchantId','referenceId',p_order.id::text,'customId',p_order.id::text,'invoiceId','QRG-'||p_order.id::text,
      'amount',p_order.offer->'amount','currency','USD','status',p_receipt->>'status') then
    raise exception using errcode='22023',message='The verified PayPal capture must exactly match this order, merchant and approved gross USD amount.';
  end if;
  if p_order.payment_id is not null and p_order.payment_id is distinct from 'paypal_capture:'||(p_receipt->>'captureId') then
    raise exception using errcode='PT409',message='This order already has a different payment identity.';end if;
end;$$;

create function public.billing_paypal_apply_capture(p_environment text,p_order_id uuid,p_receipt jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare o public.billing_orders%rowtype;receipt jsonb;payment text;new_grant boolean:=false;begin
  perform public._billing_create_environment(p_environment);
  select b.* into o from public.billing_orders b join public.billing_paypal_orders p on p.order_id=b.id where b.id=p_order_id and b.environment=p_environment;
  if not found then raise exception using errcode='P0002',message='PayPal payment order was not found.';end if;
  -- Money must be reconciled even after the paying account is locked or removed.
  perform public._billing_lock_actor(o.owner_id,p_environment,false);
  select * into o from public.billing_orders where id=p_order_id for update;
  perform public._billing_paypal_validate_capture(o,p_receipt);
  if p_receipt->>'status' is distinct from 'COMPLETED' then raise exception using errcode='22023',message='Only a completed PayPal capture grants credits.';end if;
  payment:='paypal_capture:'||(p_receipt->>'captureId');
  perform public._billing_paypal_register_reference(p_environment,'paypal',p_receipt->>'captureId',o.id);
  receipt:=p_receipt||jsonb_build_object('eventId','paypal:capture:'||(p_receipt->>'captureId'),'source','paypal_api');
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
  update public.billing_orders set payment_id=payment,status='fulfilled',last_error=case when public._billing_held(o.owner_id,p_environment) then 'billing_review_required' else null end,
    updated_at=case when status='fulfilled' then updated_at else clock_timestamp() end where id=o.id returning * into o;
  return public._billing_paypal_order_json(o)||jsonb_build_object('granted',new_grant,'alreadyGranted',not new_grant);
exception when unique_violation then raise exception using errcode='PT409',message='This PayPal capture was already recorded for another order.';
end;$$;

create function public.billing_paypal_record_review(p_environment text,p_order_id uuid,p_event_id text,p_kind text,p_receipt jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare o public.billing_orders%rowtype;receipt jsonb;fresh boolean;begin
  perform public._billing_create_environment(p_environment);
  select b.* into o from public.billing_orders b join public.billing_paypal_orders p on p.order_id=b.id where b.id=p_order_id and b.environment=p_environment;
  if not found then raise exception using errcode='P0002',message='PayPal payment order was not found.';end if;
  perform public._billing_lock_actor(o.owner_id,p_environment,false);
  select * into o from public.billing_orders where id=p_order_id for update;
  perform public._billing_paypal_validate_capture(o,p_receipt);
  if coalesce(p_event_id,'') !~ '^[A-Za-z0-9_-]{3,150}$' or p_kind is null or p_kind not in ('refund','dispute','reversal','refund_pending')
    -- For a refund webhook, the server verifies the refund resource itself and
    -- its capture link. The capture resource may still show COMPLETED during lag.
    or (p_kind='refund' and coalesce(p_receipt->>'status','') not in ('COMPLETED','REFUNDED','PARTIALLY_REFUNDED'))
    or (p_kind in ('dispute','refund_pending') and coalesce(p_receipt->>'status','') not in ('COMPLETED','REFUNDED','PARTIALLY_REFUNDED'))
    -- An authoritative reversal must hold even while its fresh capture resource
    -- has an older or a later recognized state. It never authorizes a grant.
    or (p_kind='reversal' and coalesce(p_receipt->>'status','') not in ('COMPLETED','REVERSED','DECLINED','DENIED','FAILED','PENDING','REFUNDED','PARTIALLY_REFUNDED')) then
    raise exception using errcode='22023',message='A verified PayPal refund, dispute or reversal event is required.';end if;
  perform public._billing_paypal_register_reference(p_environment,'paypal',p_receipt->>'captureId',o.id);
  receipt:=p_receipt||jsonb_build_object('eventId','paypal:review:'||p_event_id,'source','paypal_api','kind',p_kind);
  -- Preserve the original risk event in the audit while using the existing
  -- receipt categories. Pending refunds and reversals never create a grant.
  fresh:=public._billing_receipt(o,case when p_kind in ('refund','refund_pending') then 'refund' else 'dispute' end,receipt);
  if fresh then
    insert into public.billing_credit_holds(environment,event_id,owner_id,reason) values(p_environment,receipt->>'eventId',o.owner_id,p_kind);
    update public.billing_orders set payment_id='paypal_capture:'||(p_receipt->>'captureId'),last_error='billing_review_required',updated_at=clock_timestamp() where id=o.id returning * into o;
  end if;
  return public._billing_paypal_order_json(o);
exception when unique_violation then raise exception using errcode='PT409',message='This PayPal capture was already recorded for another order.';
end;$$;

create function public.billing_paypal_close_order(p_environment text,p_order_id uuid,p_paypal_order_id text,p_merchant_id text,p_status text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare o public.billing_orders%rowtype;begin
  perform public._billing_create_environment(p_environment);
  select b.* into o from public.billing_orders b join public.billing_paypal_orders p on p.order_id=b.id where b.id=p_order_id and b.environment=p_environment;
  if not found then raise exception using errcode='P0002',message='PayPal payment order was not found.';end if;
  perform public._billing_lock_actor(o.owner_id,p_environment,false);
  select * into o from public.billing_orders where id=p_order_id for update;
  if p_status is distinct from 'VOIDED' or not exists(select 1 from public.billing_paypal_orders p join public.billing_paypal_bindings b on b.order_id=p.order_id
    where p.order_id=o.id and p.merchant_id=p_merchant_id and b.paypal_order_id=p_paypal_order_id and b.environment=p_environment) then
    raise exception using errcode='22023',message='Only an authoritative voided PayPal order may close an unpaid purchase.';end if;
  if o.status='fulfilled' or o.payment_id is not null then raise exception using errcode='PT409',message='A captured payment requires refund or dispute review.';end if;
  perform public._billing_receipt(o,'expired',jsonb_build_object('eventId','paypal:closed:'||p_paypal_order_id,'source','paypal_api',
    'paypalOrderId',p_paypal_order_id,'merchantId',p_merchant_id,'status',p_status));
  update public.billing_orders set status='expired',last_error=null,updated_at=case when status='expired' then updated_at else clock_timestamp() end where id=o.id returning * into o;
  return public._billing_paypal_order_json(o);
end;$$;

-- An ordinary failed capture is not a chargeback against earlier paid credits.
-- Close the unpaid attempt; if money was already recorded, preserve it under a
-- hold. A later completed capture on the closed order also grants only on hold.
create function public.billing_paypal_record_failure(p_environment text,p_order_id uuid,p_receipt jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare o public.billing_orders%rowtype;receipt jsonb;begin
  perform public._billing_create_environment(p_environment);
  select b.* into o from public.billing_orders b join public.billing_paypal_orders p on p.order_id=b.id where b.id=p_order_id and b.environment=p_environment;
  if not found then raise exception using errcode='P0002',message='PayPal payment order was not found.';end if;
  perform public._billing_lock_actor(o.owner_id,p_environment,false);
  select * into o from public.billing_orders where id=p_order_id for update;
  perform public._billing_paypal_validate_capture(o,p_receipt);
  if coalesce(p_receipt->>'status','') not in ('DECLINED','DENIED','FAILED') then raise exception using errcode='22023',message='A verified failed PayPal capture is required.';end if;
  perform public._billing_paypal_register_reference(p_environment,'paypal',p_receipt->>'captureId',o.id);
  receipt:=p_receipt||jsonb_build_object('eventId','paypal:failed:'||(p_receipt->>'captureId')||':'||(p_receipt->>'status'),'source','paypal_api');
  perform public._billing_receipt(o,'expired',receipt);
  if o.payment_id is not null or o.status='fulfilled' then
    insert into public.billing_credit_holds(environment,event_id,owner_id,reason)
      values(p_environment,receipt->>'eventId',o.owner_id,'payment_failed_after_capture') on conflict do nothing;
    update public.billing_orders set last_error='billing_review_required',
      updated_at=case when last_error='billing_review_required' then updated_at else clock_timestamp() end where id=o.id returning * into o;
  else
    update public.billing_orders set status='expired',last_error=null,
      updated_at=case when status='expired' then updated_at else clock_timestamp() end where id=o.id returning * into o;
  end if;
  return public._billing_paypal_order_json(o);
end;$$;
-- CHECKOUT.PAYMENT-APPROVAL.REVERSED is a signed provider signal, not a browser
-- cancel. The server must verify its signature and fetch the matching PayPal
-- order before calling this RPC. A racing capture is never lost or left usable.
create function public.billing_paypal_reverse_approval(p_environment text,p_order_id uuid,p_paypal_order_id text,p_merchant_id text,p_event_id text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare o public.billing_orders%rowtype;receipt jsonb;begin
  perform public._billing_create_environment(p_environment);
  select b.* into o from public.billing_orders b join public.billing_paypal_orders p on p.order_id=b.id where b.id=p_order_id and b.environment=p_environment;
  if not found then raise exception using errcode='P0002',message='PayPal payment order was not found.';end if;
  perform public._billing_lock_actor(o.owner_id,p_environment,false);
  select * into o from public.billing_orders where id=p_order_id for update;
  if coalesce(p_event_id,'') !~ '^[A-Za-z0-9_-]{3,150}$' or not exists(select 1 from public.billing_paypal_orders p join public.billing_paypal_bindings b on b.order_id=p.order_id
    where p.order_id=o.id and p.merchant_id=p_merchant_id and b.paypal_order_id=p_paypal_order_id and b.environment=p_environment) then
    raise exception using errcode='22023',message='An authoritative payment-approval reversal for this PayPal order is required.';end if;
  receipt:=jsonb_build_object('eventId','paypal:approval-reversed:'||p_event_id,'source','paypal_webhook',
    'paypalOrderId',p_paypal_order_id,'merchantId',p_merchant_id,'status','PAYMENT_APPROVAL_REVERSED');
  -- Always use the same receipt kind and payload, independently of which event
  -- arrived first. Replays keep the original immutable provider audit.
  perform public._billing_receipt(o,'expired',receipt);
  if o.payment_id is not null or o.status='fulfilled' then
    insert into public.billing_credit_holds(environment,event_id,owner_id,reason)
      values(p_environment,receipt->>'eventId',o.owner_id,'payment_approval_reversed') on conflict do nothing;
    update public.billing_orders set last_error='billing_review_required',
      updated_at=case when last_error='billing_review_required' then updated_at else clock_timestamp() end where id=o.id returning * into o;
  else
    update public.billing_orders set status='expired',last_error=null,
      updated_at=case when status='expired' then updated_at else clock_timestamp() end where id=o.id returning * into o;
  end if;
  return public._billing_paypal_order_json(o);
end;$$;
create function public.billing_paypal_status(p_owner_id uuid,p_environment text,p_order_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare current_order jsonb;pending public.billing_orders%rowtype;other_order jsonb;begin
  perform public._billing_create_environment(p_environment);
  if p_owner_id is null then raise exception using errcode='22023',message='Billing owner is required.';end if;
  if p_order_id is not null then current_order:=public.billing_paypal_get_order(p_owner_id,p_environment,p_order_id);end if;
  select b.* into pending from public.billing_orders b join public.billing_paypal_orders p on p.order_id=b.id
    where b.owner_id=p_owner_id and b.environment=p_environment and b.status in ('reserved','open');
  select jsonb_build_object('orderId',b.id,'provider',case when exists(select 1 from public.billing_direct_orders d where d.order_id=b.id) then 'direct' else 'stripe' end)
    into other_order from public.billing_orders b where b.owner_id=p_owner_id and b.environment=p_environment and b.status in ('reserved','open')
    and not exists(select 1 from public.billing_paypal_orders p where p.order_id=b.id);
  return jsonb_build_object('account',public.billing_account_status(p_owner_id,p_environment),'order',current_order,
    'pendingOrder',case when pending.id is null then null else public._billing_paypal_order_json(pending) end,'otherPendingOrder',other_order);
end;$$;

-- The historical Stripe status parser only accepts Stripe's own order shape.
do $$declare source text;needle text:='and not exists(select 1 from public.billing_direct_orders d where d.order_id=b.id);';begin
  source:=pg_get_functiondef('public.billing_account_status(uuid,text)'::regprocedure);
  if (length(source)-length(replace(source,needle,'')))/length(needle)<>1 then raise exception 'The unresolved order query changed; review PayPal status isolation.';end if;
  execute replace(source,needle,'and not exists(select 1 from public.billing_direct_orders d where d.order_id=b.id) and not exists(select 1 from public.billing_paypal_orders p where p.order_id=b.id);');
end;$$;
do $$declare f record;begin
  for f in select oid::regprocedure signature,proname from pg_proc where pronamespace='public'::regnamespace
    and (proname like 'billing_paypal_%' or proname like '_billing_paypal_%') loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
    if f.proname like 'billing_paypal_%' then execute format('grant execute on function %s to service_role',f.signature);end if;
  end loop;
end;$$;
commit;
