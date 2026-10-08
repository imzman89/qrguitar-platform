-- Durable, resumable PayPal webhook intake. The public webhook stores exact
-- bytes and signature metadata before processing. Browser roles cannot read or
-- mutate the queue; only narrowly-scoped service RPCs cross this boundary.
begin;

create table public.billing_paypal_webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  environment text not null check(environment in ('live','test')),
  delivery_hash text not null check(delivery_hash ~ '^[a-f0-9]{64}$'),
  body_hash text not null check(body_hash ~ '^[a-f0-9]{64}$'),
  state text not null default 'queued' check(state in ('queued','verified','planned','retry','processing','completed','quarantined')),
  verified_event_id text check(verified_event_id is null or verified_event_id ~ '^[A-Za-z0-9_-]{8,100}$'),
  event_type text check(event_type is null or event_type ~ '^[A-Z0-9._-]{3,100}$'),
  event_hash text check(event_hash is null or event_hash ~ '^[a-f0-9]{64}$'),
  canonical_delivery_id uuid references public.billing_paypal_webhook_deliveries(id),
  plan jsonb,
  cursor integer not null default 0 check(cursor between 0 and 20),
  total_items integer check(total_items between 1 and 20),
  attempt_count integer not null default 0 check(attempt_count>=0),
  failure_count integer not null default 0 check(failure_count between 0 and 32),
  next_attempt_at timestamptz not null default clock_timestamp(),
  lease_token uuid,
  locked_until timestamptz,
  last_error_code text check(last_error_code is null or last_error_code ~ '^[a-z0-9_]{3,80}$'),
  outcome_code text check(outcome_code is null or outcome_code ~ '^[a-z0-9_]{3,80}$'),
  received_at timestamptz not null default clock_timestamp(),
  verified_at timestamptz,
  completed_at timestamptz,
  raw_purged_at timestamptz,
  acknowledged_at timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  unique(environment,delivery_hash),
  check((lease_token is null)=(locked_until is null)),
  check((verified_event_id is null)=(event_type is null)),
  check((verified_event_id is null)=(event_hash is null)),
  check(canonical_delivery_id is null or canonical_delivery_id<>id),
  check(plan is null or (jsonb_typeof(plan)='array' and jsonb_array_length(plan) between 1 and 20 and octet_length(plan::text)<=32768)),
  check((plan is null and total_items is null) or (plan is not null and total_items=jsonb_array_length(plan))),
  check(cursor<=coalesce(total_items,20)),
  check(state<>'completed' or (plan is null and total_items is null)),
  check(raw_purged_at is null or verified_event_id is not null or (state='quarantined' and plan is null and total_items is null)),
  check(acknowledged_at is null or (state='quarantined' and plan is null and total_items is null))
);
create unique index billing_paypal_webhook_canonical_event on public.billing_paypal_webhook_deliveries(environment,verified_event_id)
  where verified_event_id is not null and canonical_delivery_id is null;
create index billing_paypal_webhook_due on public.billing_paypal_webhook_deliveries(environment,next_attempt_at,received_at)
  where state in ('queued','verified','planned','retry','processing');
create index billing_paypal_webhook_sweep_due on public.billing_paypal_webhook_deliveries(environment,
  (case when plan is not null then 0 when verified_event_id is not null then 1 when state='retry' then 2 else 3 end),next_attempt_at,received_at,id)
  where state in ('queued','verified','planned','retry','processing');
create index billing_paypal_webhook_terminal_retention on public.billing_paypal_webhook_deliveries(completed_at,id)
  where state in ('completed','quarantined');
create index billing_paypal_webhook_unverified_retention on public.billing_paypal_webhook_deliveries(completed_at,id)
  where state='quarantined' and verified_event_id is null;
create index billing_paypal_webhook_unverified_quota on public.billing_paypal_webhook_deliveries(environment,received_at,id)
  where verified_event_id is null and raw_purged_at is null;

create table public.billing_paypal_webhook_payloads (
  delivery_id uuid primary key references public.billing_paypal_webhook_deliveries(id) on delete cascade,
  raw_body text not null check(octet_length(raw_body) between 2 and 65536),
  signature_headers jsonb not null check(jsonb_typeof(signature_headers)='object' and octet_length(signature_headers::text)<=12288),
  received_at timestamptz not null default clock_timestamp()
);

create table public.billing_paypal_webhook_outcomes (
  environment text not null check(environment in ('live','test')),
  event_id text not null check(event_id ~ '^[A-Za-z0-9_-]{8,100}$'),
  event_cursor integer not null check(event_cursor between 0 and 19),
  delivery_id uuid not null references public.billing_paypal_webhook_deliveries(id),
  event_type text not null check(event_type ~ '^[A-Z0-9._-]{3,100}$'),
  action text not null check(action in ('applied','ignored')),
  resource_kind text not null check(resource_kind in ('order','capture','refund','dispute','event')),
  resource_id text,
  paypal_order_id text check(paypal_order_id is null or paypal_order_id ~ '^[A-Z0-9]{5,64}$'),
  capture_id text check(capture_id is null or capture_id ~ '^[A-Z0-9]{5,64}$'),
  provider_status text check(provider_status is null or provider_status ~ '^[A-Z0-9._-]{2,80}$'),
  amount integer check(amount is null or amount between 0 and 999999999),
  currency text check(currency is null or currency='USD'),
  receipt_event_id text check(receipt_event_id is null or receipt_event_id ~ '^[A-Za-z0-9_:-]{3,200}$'),
  detail jsonb not null default '{}'::jsonb check(jsonb_typeof(detail)='object' and octet_length(detail::text)<=4096),
  created_at timestamptz not null default clock_timestamp(),
  primary key(environment,event_id,event_cursor),
  check(resource_id is null or (char_length(resource_id) between 1 and 255 and resource_id !~ '[[:cntrl:]]'))
);

create table public.billing_paypal_webhook_admin_actions (
  id uuid primary key,
  environment text not null check(environment in ('live','test')),
  delivery_id uuid not null references public.billing_paypal_webhook_deliveries(id),
  operator_id uuid not null,
  action text not null check(action in ('retry','acknowledge')),
  reason text not null check(char_length(reason) between 10 and 1000),
  created_at timestamptz not null default clock_timestamp()
);
create index billing_paypal_webhook_admin_actions_delivery on public.billing_paypal_webhook_admin_actions(delivery_id,created_at desc);

-- The secret proves who called the recovery endpoint; this row proves that a
-- scheduler has actually reached it recently. It is bounded to one row per
-- billing environment and contains no customer or payment data.
create table public.billing_paypal_webhook_heartbeats (
  environment text primary key check(environment in ('live','test')),
  last_success_at timestamptz not null,
  updated_at timestamptz not null default clock_timestamp()
);

do $$declare t text;begin
  foreach t in array array['billing_paypal_webhook_deliveries','billing_paypal_webhook_payloads','billing_paypal_webhook_outcomes','billing_paypal_webhook_admin_actions','billing_paypal_webhook_heartbeats'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on table public.%I from public,anon,authenticated,service_role',t);
    execute format('create policy qrguitar_billing_server_only on public.%I as restrictive for all to anon,authenticated using(false) with check(false)',t);
  end loop;
end;$$;
create trigger billing_paypal_webhook_outcomes_immutable before update or delete on public.billing_paypal_webhook_outcomes
  for each row execute function public._billing_immutable();
create trigger billing_paypal_webhook_admin_actions_immutable before update or delete on public.billing_paypal_webhook_admin_actions
  for each row execute function public._billing_immutable();

create function public._billing_paypal_webhook_headers(p_headers jsonb) returns void
language plpgsql immutable set search_path=pg_catalog,public as $$
declare k text;v text;begin
  if jsonb_typeof(p_headers) is distinct from 'object' or p_headers is distinct from jsonb_build_object(
    'paypal-auth-algo',p_headers->>'paypal-auth-algo','paypal-cert-url',p_headers->>'paypal-cert-url',
    'paypal-transmission-id',p_headers->>'paypal-transmission-id','paypal-transmission-sig',p_headers->>'paypal-transmission-sig',
    'paypal-transmission-time',p_headers->>'paypal-transmission-time') then
    raise exception using errcode='22023',message='Exact PayPal signature headers are required.';end if;
  foreach k in array array['paypal-auth-algo','paypal-cert-url','paypal-transmission-id','paypal-transmission-sig','paypal-transmission-time'] loop
    v:=p_headers->>k;
    if char_length(coalesce(v,'')) not between 1 and 2048 or v ~ '[[:cntrl:]]' then
      raise exception using errcode='22023',message='Invalid PayPal signature header.';end if;
  end loop;
end;$$;

create function public._billing_paypal_webhook_delivery_hash(p_raw text,p_headers jsonb) returns text
language plpgsql immutable set search_path=pg_catalog,public as $$
declare material text;v text;k text;begin
  material:=octet_length(p_raw)::text||':'||p_raw;
  foreach k in array array['paypal-auth-algo','paypal-cert-url','paypal-transmission-id','paypal-transmission-sig','paypal-transmission-time'] loop
    v:=p_headers->>k; material:=material||octet_length(v)::text||':'||v;
  end loop;
  return encode(sha256(convert_to(material,'UTF8')),'hex');
end;$$;

create function public._billing_paypal_webhook_json(p_delivery public.billing_paypal_webhook_deliveries,p_payload boolean default false,p_lease boolean default false) returns jsonb
language sql stable set search_path=pg_catalog,public as $$
  select jsonb_build_object('deliveryId',p_delivery.id,'environment',p_delivery.environment,'state',p_delivery.state,
    'eventId',p_delivery.verified_event_id,'eventType',p_delivery.event_type,'canonicalDeliveryId',p_delivery.canonical_delivery_id,
    'plan',p_delivery.plan,'cursor',p_delivery.cursor,'totalItems',p_delivery.total_items,'attemptCount',p_delivery.attempt_count,
    'failureCount',p_delivery.failure_count,
    'nextAttemptAt',p_delivery.next_attempt_at,'leaseToken',case when p_lease then p_delivery.lease_token else null end,
    'lockedUntil',case when p_lease then p_delivery.locked_until else null end,
    'lastErrorCode',p_delivery.last_error_code,'outcomeCode',p_delivery.outcome_code,'receivedAt',p_delivery.received_at,
    'acknowledgedAt',p_delivery.acknowledged_at,'updatedAt',p_delivery.updated_at,
    'rawBody',case when p_payload then x.raw_body else null end,
    'signatureHeaders',case when p_payload then x.signature_headers else null end)
  from (select raw_body,signature_headers from public.billing_paypal_webhook_payloads where delivery_id=p_delivery.id) x
  right join (select 1) keep on true;
$$;

create function public.billing_paypal_webhook_record_heartbeat(p_environment text) returns boolean
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  perform public._billing_create_environment(p_environment);
  insert into public.billing_paypal_webhook_heartbeats(environment,last_success_at,updated_at)
    values(p_environment,clock_timestamp(),clock_timestamp())
    on conflict(environment) do update set last_success_at=excluded.last_success_at,updated_at=excluded.updated_at;
  return true;
end;$$;

create function public.billing_paypal_webhook_scheduler_ready(p_environment text) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
  select exists(select 1 from public.billing_paypal_webhook_heartbeats h
    where h.environment=p_environment and h.last_success_at>=statement_timestamp()-interval '15 minutes');
$$;

-- Retention runs in small batches during both public intake and private admin
-- queue reads, so low webhook traffic cannot leave raw payer data indefinitely.
create function public._billing_paypal_webhook_cleanup() returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  with old as (
    select p.delivery_id from public.billing_paypal_webhook_payloads p
    join public.billing_paypal_webhook_deliveries q on q.id=p.delivery_id
    where q.state in ('completed','quarantined') and (q.completed_at<clock_timestamp()-interval '7 days'
      or (q.state='quarantined' and q.verified_event_id is null and q.completed_at<clock_timestamp()-interval '24 hours'))
    order by q.completed_at,q.id limit 100 for update of q skip locked
  ) delete from public.billing_paypal_webhook_payloads p using old
      where p.delivery_id=old.delivery_id and exists(select 1 from public.billing_paypal_webhook_deliveries q where q.id=old.delivery_id and q.state in ('completed','quarantined'));
  with purged as (
    select q.id from public.billing_paypal_webhook_deliveries q
    where q.raw_purged_at is null and q.state in ('completed','quarantined')
      and (q.completed_at<clock_timestamp()-interval '7 days'
        or (q.state='quarantined' and q.verified_event_id is null and q.completed_at<clock_timestamp()-interval '24 hours'))
      and not exists(select 1 from public.billing_paypal_webhook_payloads p where p.delivery_id=q.id)
    order by q.completed_at,q.id limit 100 for update of q skip locked
  ) update public.billing_paypal_webhook_deliveries q
      set raw_purged_at=clock_timestamp(),plan=null,total_items=null,updated_at=clock_timestamp()
      from purged where q.id=purged.id and q.state in ('completed','quarantined')
        and not exists(select 1 from public.billing_paypal_webhook_payloads p where p.delivery_id=q.id);
  with expired_plans as (
    select q.id from public.billing_paypal_webhook_deliveries q
    where q.state='quarantined' and q.plan is not null and q.completed_at<clock_timestamp()-interval '7 days'
    order by q.completed_at,q.id limit 100 for update of q skip locked
  ) update public.billing_paypal_webhook_deliveries q set plan=null,total_items=null,updated_at=clock_timestamp()
      from expired_plans where q.id=expired_plans.id and q.state='quarantined' and q.completed_at<clock_timestamp()-interval '7 days';
  with stale as (
    select q.id from public.billing_paypal_webhook_deliveries q
    where q.verified_event_id is null and q.state='quarantined'
      and q.completed_at<clock_timestamp()-interval '7 days'
      and not exists(select 1 from public.billing_paypal_webhook_payloads p where p.delivery_id=q.id)
      and not exists(select 1 from public.billing_paypal_webhook_admin_actions a where a.delivery_id=q.id)
    order by q.completed_at,q.id limit 100 for update of q skip locked
  ) delete from public.billing_paypal_webhook_deliveries q using stale where q.id=stale.id and q.state='quarantined'
      and q.verified_event_id is null and not exists(select 1 from public.billing_paypal_webhook_payloads p where p.delivery_id=q.id)
      and not exists(select 1 from public.billing_paypal_webhook_admin_actions a where a.delivery_id=q.id);
end;$$;

create function public.billing_paypal_webhook_enqueue(p_environment text,p_raw_body text,p_signature_headers jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare d public.billing_paypal_webhook_deliveries%rowtype;v_delivery_hash text;v_body_hash text;v_unverified integer;begin
  perform public._billing_create_environment(p_environment);
  if octet_length(coalesce(p_raw_body,'')) not between 2 and 65536 then raise exception using errcode='22023',message='Invalid PayPal webhook body.';end if;
  perform public._billing_paypal_webhook_headers(p_signature_headers);
  v_body_hash:=encode(sha256(convert_to(p_raw_body,'UTF8')),'hex');
  v_delivery_hash:=public._billing_paypal_webhook_delivery_hash(p_raw_body,p_signature_headers);
  perform public._billing_paypal_webhook_cleanup();
  select * into d from public.billing_paypal_webhook_deliveries q where q.environment=p_environment and q.delivery_hash=v_delivery_hash;
  if found then
    if d.body_hash is distinct from v_body_hash then raise exception using errcode='PT409',message='Webhook delivery identity conflict.';end if;
    return public._billing_paypal_webhook_json(d,false)||jsonb_build_object('duplicate',true);
  end if;
  -- Serialize the small unverified-ingress quota. Exact provider retries above
  -- remain available even while novel unauthenticated traffic is throttled.
  perform pg_advisory_xact_lock(hashtextextended('qrguitar:paypal:webhook:quota:'||p_environment,0));
  select * into d from public.billing_paypal_webhook_deliveries q where q.environment=p_environment and q.delivery_hash=v_delivery_hash;
  if found then return public._billing_paypal_webhook_json(d,false)||jsonb_build_object('duplicate',true);end if;
  select count(*) into v_unverified from (select 1 from public.billing_paypal_webhook_deliveries q
    where q.environment=p_environment and q.verified_event_id is null and q.raw_purged_at is null
    order by q.received_at,q.id limit 1000) bounded;
  if v_unverified>=1000 then raise exception using errcode='PT429',message='PayPal webhook intake is temporarily full.';end if;
  insert into public.billing_paypal_webhook_deliveries(environment,delivery_hash,body_hash)
    values(p_environment,v_delivery_hash,v_body_hash) returning * into d;
  insert into public.billing_paypal_webhook_payloads(delivery_id,raw_body,signature_headers) values(d.id,p_raw_body,p_signature_headers);
  return public._billing_paypal_webhook_json(d,false)||jsonb_build_object('duplicate',false);
end;$$;

create function public.billing_paypal_webhook_claim(p_environment text,p_delivery_id uuid,p_lease_token uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare d public.billing_paypal_webhook_deliveries%rowtype;target uuid;begin
  perform public._billing_create_environment(p_environment);
  if p_delivery_id is null or p_lease_token is null then raise exception using errcode='22023',message='A delivery and lease identity are required.';end if;
  select coalesce(canonical_delivery_id,id) into target from public.billing_paypal_webhook_deliveries where id=p_delivery_id and environment=p_environment;
  if target is null then raise exception using errcode='P0002',message='Webhook delivery was not found.';end if;
  select * into d from public.billing_paypal_webhook_deliveries where id=target and environment=p_environment for update;
  if d.state in ('completed','quarantined') then return public._billing_paypal_webhook_json(d,false);end if;
  if (d.received_at < clock_timestamp() - (case when d.plan is not null then interval '30 days' else interval '7 days' end)
      and not exists(
      select 1 from public.billing_paypal_webhook_admin_actions a where a.delivery_id=d.id and a.action='retry'
        and a.created_at>=clock_timestamp()-interval '7 days')) then
    update public.billing_paypal_webhook_deliveries set state='quarantined',last_error_code='retry_budget_exhausted',outcome_code='quarantined',
      completed_at=clock_timestamp(),lease_token=null,locked_until=null,updated_at=clock_timestamp() where id=d.id returning * into d;
    return public._billing_paypal_webhook_json(d,false);
  end if;
  if d.next_attempt_at>clock_timestamp() or (d.locked_until is not null and d.locked_until>clock_timestamp()) then
    return public._billing_paypal_webhook_json(d,false)||jsonb_build_object('busy',true);end if;
  update public.billing_paypal_webhook_deliveries set state='processing',attempt_count=attempt_count+1,lease_token=p_lease_token,
    locked_until=clock_timestamp()+interval '120 seconds',updated_at=clock_timestamp() where id=d.id returning * into d;
  return public._billing_paypal_webhook_json(d,true,true);
end;$$;

-- A scheduler claims one due unit under the same lease and retry budget as a
-- provider delivery. SKIP LOCKED lets duplicate serverless invocations share
-- the queue without serializing unrelated deliveries. Each returned row is
-- still advanced through one atomic item at a time.
create function public.billing_paypal_webhook_claim_due(p_environment text,p_lease_token uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare d public.billing_paypal_webhook_deliveries%rowtype;terminal boolean;begin
  perform public._billing_create_environment(p_environment);
  if p_lease_token is null then raise exception using errcode='22023',message='A webhook lease identity is required.';end if;
  perform public._billing_paypal_webhook_cleanup();
  select q.* into d from public.billing_paypal_webhook_deliveries q
    where q.environment=p_environment and q.state in ('queued','verified','planned','retry','processing')
      and q.next_attempt_at<=clock_timestamp() and (q.locked_until is null or q.locked_until<=clock_timestamp())
      and q.acknowledged_at is null
      and (q.plan is not null or exists(select 1 from public.billing_paypal_webhook_payloads p where p.delivery_id=q.id))
    order by case when q.plan is not null then 0 when q.verified_event_id is not null then 1 when q.state='retry' then 2 else 3 end,
      q.next_attempt_at,q.received_at,q.id limit 1 for update of q skip locked;
  if not found then return null;end if;
  terminal := (d.received_at < clock_timestamp() - (case when d.plan is not null then interval '30 days' else interval '7 days' end)
    and not exists(
    select 1 from public.billing_paypal_webhook_admin_actions a where a.delivery_id=d.id and a.action='retry'
      and a.created_at>=clock_timestamp()-interval '7 days'));
  if terminal then
    update public.billing_paypal_webhook_deliveries set state='quarantined',last_error_code='retry_budget_exhausted',outcome_code='quarantined',
      completed_at=clock_timestamp(),lease_token=null,locked_until=null,updated_at=clock_timestamp() where id=d.id returning * into d;
    return public._billing_paypal_webhook_json(d,false);
  end if;
  update public.billing_paypal_webhook_deliveries set state='processing',attempt_count=attempt_count+1,lease_token=p_lease_token,
    locked_until=clock_timestamp()+interval '120 seconds',updated_at=clock_timestamp() where id=d.id returning * into d;
  return public._billing_paypal_webhook_json(d,true,true);
end;$$;

create function public.billing_paypal_webhook_mark_verified(p_environment text,p_delivery_id uuid,p_lease_token uuid,p_event_id text,p_event_type text,p_event_hash text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare d public.billing_paypal_webhook_deliveries%rowtype;c public.billing_paypal_webhook_deliveries%rowtype;begin
  perform public._billing_create_environment(p_environment);
  if coalesce(p_event_id,'') !~ '^[A-Za-z0-9_-]{8,100}$' or coalesce(p_event_type,'') !~ '^[A-Z0-9._-]{3,100}$' or coalesce(p_event_hash,'') !~ '^[a-f0-9]{64}$' then
    raise exception using errcode='22023',message='A verified PayPal event identity is required.';end if;
  select * into d from public.billing_paypal_webhook_deliveries where id=p_delivery_id and environment=p_environment for update;
  if not found then raise exception using errcode='P0002',message='Webhook delivery was not found.';end if;
  if d.state<>'processing' or d.lease_token is distinct from p_lease_token or d.locked_until<=clock_timestamp() then
    raise exception using errcode='PT409',message='Webhook delivery lease was lost.';end if;
  perform pg_advisory_xact_lock(hashtextextended(p_environment||':'||p_event_id,0));
  select * into c from public.billing_paypal_webhook_deliveries where environment=p_environment and verified_event_id=p_event_id
    and canonical_delivery_id is null and id<>d.id for update;
  if found then
    if c.event_type is distinct from p_event_type or c.event_hash is distinct from p_event_hash then
      update public.billing_paypal_webhook_deliveries set verified_event_id=p_event_id,event_type=p_event_type,event_hash=p_event_hash,
        canonical_delivery_id=c.id,state='quarantined',last_error_code='verified_event_conflict',outcome_code='quarantined',verified_at=clock_timestamp(),completed_at=clock_timestamp(),
        plan=null,total_items=null,raw_purged_at=clock_timestamp(),lease_token=null,locked_until=null,failure_count=0,updated_at=clock_timestamp() where id=d.id returning * into d;
      delete from public.billing_paypal_webhook_payloads where delivery_id=d.id;
      return public._billing_paypal_webhook_json(d,false);
    end if;
    update public.billing_paypal_webhook_deliveries set verified_event_id=p_event_id,event_type=p_event_type,event_hash=p_event_hash,
      canonical_delivery_id=c.id,state='completed',outcome_code='duplicate_delivery',verified_at=clock_timestamp(),completed_at=clock_timestamp(),
      lease_token=null,locked_until=null,plan=null,total_items=null,raw_purged_at=clock_timestamp(),failure_count=0,updated_at=clock_timestamp() where id=d.id returning * into d;
    delete from public.billing_paypal_webhook_payloads where delivery_id=d.id;
    return public._billing_paypal_webhook_json(c,false)||jsonb_build_object('duplicateDeliveryId',d.id);
  end if;
  update public.billing_paypal_webhook_deliveries set verified_event_id=p_event_id,event_type=p_event_type,event_hash=p_event_hash,
    state='verified',verified_at=clock_timestamp(),lease_token=null,locked_until=null,last_error_code=null,failure_count=0,next_attempt_at=clock_timestamp(),updated_at=clock_timestamp()
    where id=d.id returning * into d;
  return public._billing_paypal_webhook_json(d,false);
end;$$;

create function public.billing_paypal_webhook_save_plan(p_environment text,p_delivery_id uuid,p_lease_token uuid,p_plan jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare d public.billing_paypal_webhook_deliveries%rowtype;n integer;begin
  perform public._billing_create_environment(p_environment);
  if jsonb_typeof(p_plan) is distinct from 'array' or jsonb_array_length(p_plan) not between 1 and 20 or octet_length(p_plan::text)>32768
    or exists(select 1 from jsonb_array_elements(p_plan) x where jsonb_typeof(x)<>'object'
      or x is distinct from jsonb_build_object('action',x->>'action','resourceKind',x->>'resourceKind','resourceId',x->'resourceId',
        'captureId',x->'captureId','refundId',x->'refundId','disputeId',x->'disputeId','caseId',x->'caseId',
        'providerStatus',x->'providerStatus','amount',x->'amount','currency',x->'currency','detail',x->'detail')
      or x->>'action' not in ('order_approved','approval_reversed','capture','capture_reversed','refund','dispute','ignore')
      or x->>'resourceKind' not in ('order','capture','refund','dispute','event')
      or (x->>'resourceId' is not null and (char_length(x->>'resourceId') not between 1 and 255 or x->>'resourceId' ~ '[[:cntrl:]]'))
      or (x->>'captureId' is not null and x->>'captureId' !~ '^[A-Z0-9]{5,64}$')
      or (x->>'refundId' is not null and x->>'refundId' !~ '^[A-Z0-9]{5,64}$')
      or (x->>'disputeId' is not null and x->>'disputeId' !~ '^[A-Za-z0-9-]{1,255}$')
      or (x->>'caseId' is not null and x->>'caseId' !~ '^[A-Za-z0-9-]{1,255}$')
      or (x->>'providerStatus' is not null and x->>'providerStatus' !~ '^[A-Z0-9._-]{2,80}$')
      or (x->>'amount' is not null and ((x->>'amount')::numeric<>trunc((x->>'amount')::numeric) or (x->>'amount')::numeric not between 0 and 999999999))
      or (x->>'currency' is not null and x->>'currency'<>'USD')
      or jsonb_typeof(x->'detail') is distinct from 'object'
      or x->'detail' is distinct from jsonb_build_object('stage',x->'detail'->'stage','reason',x->'detail'->'reason',
        'outcome',x->'detail'->'outcome','captureStatus',x->'detail'->'captureStatus')
      or exists(select 1 from jsonb_each_text(x->'detail') v where char_length(v.value)>100 or v.value ~ '[[:cntrl:]]')) then
    raise exception using errcode='22023',message='A bounded verified webhook work plan is required.';end if;
  n:=jsonb_array_length(p_plan);
  select * into d from public.billing_paypal_webhook_deliveries where id=p_delivery_id and environment=p_environment for update;
  if not found then raise exception using errcode='P0002',message='Webhook delivery was not found.';end if;
  if d.state<>'processing' or d.lease_token is distinct from p_lease_token or d.verified_event_id is null or d.locked_until<=clock_timestamp() then
    raise exception using errcode='PT409',message='Webhook delivery lease was lost.';end if;
  if d.plan is not null and (d.plan is distinct from p_plan or d.total_items is distinct from n) then raise exception using errcode='PT409',message='Webhook work plan changed.';end if;
  -- A quarantined partial plan may be rebuilt from retained raw input, but its
  -- already-applied prefix must still match every immutable outcome exactly.
  if n<d.cursor or exists(select 1 from generate_series(0,d.cursor-1) i
      left join public.billing_paypal_webhook_outcomes o on o.environment=p_environment and o.event_id=d.verified_event_id and o.event_cursor=i
      cross join lateral (select p_plan->i item) frozen
      where o.event_cursor is null
        or o.action is distinct from case when frozen.item->>'action'='ignore' or (frozen.item->>'action'='refund' and frozen.item->>'providerStatus' in ('FAILED','CANCELLED')) then 'ignored' else 'applied' end
        or o.resource_kind is distinct from frozen.item->>'resourceKind' or o.resource_id is distinct from frozen.item->>'resourceId'
        or (frozen.item->>'action'<>'order_approved' and o.capture_id is distinct from frozen.item->>'captureId')
        or o.provider_status is distinct from frozen.item->>'providerStatus'
        or o.amount is distinct from (frozen.item->>'amount')::integer or o.currency is distinct from frozen.item->>'currency'
        or o.detail is distinct from frozen.item->'detail') then
    raise exception using errcode='PT409',message='Webhook work plan changed after an applied item.';end if;
  update public.billing_paypal_webhook_deliveries set plan=p_plan,total_items=n,state='planned',raw_purged_at=clock_timestamp(),lease_token=null,locked_until=null,
    last_error_code=null,failure_count=0,next_attempt_at=clock_timestamp(),updated_at=clock_timestamp() where id=d.id returning * into d;
  -- Verification and the sanitized frozen plan are now sufficient to resume;
  -- discard the untrusted raw body and signature material immediately.
  delete from public.billing_paypal_webhook_payloads where delivery_id=d.id;
  return public._billing_paypal_webhook_json(d,false);
end;$$;

create function public.billing_paypal_webhook_apply_item(p_environment text,p_delivery_id uuid,p_lease_token uuid,p_cursor integer,p_command jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare d public.billing_paypal_webhook_deliveries%rowtype;old public.billing_paypal_webhook_outcomes%rowtype;done boolean;item jsonb;o jsonb;
  effect text;expected_action text;expected_receipt text;effect_result jsonb;begin
  perform public._billing_create_environment(p_environment);
  select * into d from public.billing_paypal_webhook_deliveries where id=p_delivery_id and environment=p_environment for update;
  if not found then raise exception using errcode='P0002',message='Webhook delivery was not found.';end if;
  -- Response loss or a concurrent stale command returns the first committed
  -- canonical result. No later provider state can select another effect branch.
  if d.cursor>p_cursor then
    select * into old from public.billing_paypal_webhook_outcomes where environment=p_environment and event_id=d.verified_event_id and event_cursor=p_cursor;
    if not found or old.delivery_id is distinct from d.id then raise exception using errcode='PT409',message='Webhook cursor outcome is unavailable.';end if;
    return public._billing_paypal_webhook_json(d,false)||jsonb_build_object('itemApplied',false,'outcome',jsonb_build_object(
      'eventId',old.event_id,'eventType',old.event_type,'cursor',old.event_cursor,'action',old.action,'resourceKind',old.resource_kind,
      'resourceId',old.resource_id,'paypalOrderId',old.paypal_order_id,'captureId',old.capture_id,'providerStatus',old.provider_status,
      'amount',old.amount,'currency',old.currency,'receiptEventId',old.receipt_event_id,'detail',old.detail));
  end if;
  if d.state<>'processing' or d.lease_token is distinct from p_lease_token or d.locked_until<=clock_timestamp() or d.cursor is distinct from p_cursor
    or d.plan is null or d.total_items is null or p_cursor>=d.total_items then raise exception using errcode='PT409',message='Webhook item lease was lost.';end if;
  item:=d.plan->p_cursor;o:=p_command->'outcome';effect:=p_command->>'effect';
  expected_action:=case when item->>'action'='ignore' or (item->>'action'='refund' and item->>'providerStatus' in ('FAILED','CANCELLED')) then 'ignored' else 'applied' end;
  if jsonb_typeof(p_command) is distinct from 'object' or p_command is distinct from jsonb_build_object(
      'effect',effect,'orderId',p_command->'orderId','reviewKind',p_command->'reviewKind','paypalOrderId',p_command->'paypalOrderId',
      'merchantId',p_command->'merchantId','receipt',p_command->'receipt','evidence',p_command->'evidence','outcome',o)
    or effect not in ('none','capture','failure','close','review','approval_reversed')
    or jsonb_typeof(o) is distinct from 'object' or o is distinct from jsonb_build_object(
      'eventId',o->>'eventId','eventType',o->>'eventType','cursor',(o->>'cursor')::integer,
      'action',o->>'action','resourceKind',o->>'resourceKind','resourceId',o->'resourceId',
      'paypalOrderId',o->'paypalOrderId','captureId',o->'captureId','providerStatus',o->'providerStatus',
      'amount',o->'amount','currency',o->'currency','receiptEventId',o->'receiptEventId','detail',o->'detail')
    or o->>'eventId' is distinct from d.verified_event_id or o->>'eventType' is distinct from d.event_type
    or (o->>'cursor')::integer is distinct from p_cursor or o->>'action' is distinct from expected_action
    or o->>'resourceKind' is distinct from item->>'resourceKind' or o->'resourceId' is distinct from item->'resourceId'
    or (item->>'action'<>'order_approved' and o->'captureId' is distinct from item->'captureId')
    or o->'providerStatus' is distinct from item->'providerStatus' or o->'amount' is distinct from item->'amount'
    or o->'currency' is distinct from item->'currency' or o->'detail' is distinct from item->'detail'
    or jsonb_typeof(o->'detail') is distinct from 'object' or octet_length((o->'detail')::text)>4096
    or p_command->'paypalOrderId' is distinct from o->'paypalOrderId'
    or (item->>'action'='order_approved' and o->>'paypalOrderId' is distinct from item->>'resourceId')
    or (item->>'action'='ignore' and effect<>'none')
    or (item->>'action'='approval_reversed' and effect<>'approval_reversed')
    or (item->>'action' in ('capture_reversed','dispute') and effect<>'review')
    or (item->>'action'='refund' and item->>'providerStatus' in ('FAILED','CANCELLED') and effect<>'none')
    or (item->>'action'='refund' and item->>'providerStatus' not in ('FAILED','CANCELLED') and effect<>'review')
    or (item->>'action'='capture' and effect not in ('none','capture','failure','review'))
    or (item->>'action'='capture' and effect='none' and (d.event_type<>'PAYMENT.CAPTURE.PENDING' or item->>'providerStatus' is distinct from 'PENDING'))
    or (item->>'action'='order_approved' and effect not in ('capture','failure','close','review'))
    or (item->>'action'='order_approved' and d.event_type<>'CHECKOUT.ORDER.APPROVED')
    or (item->>'action'='approval_reversed' and d.event_type<>'CHECKOUT.PAYMENT-APPROVAL.REVERSED')
    or (item->>'action'='capture' and d.event_type not in ('PAYMENT.CAPTURE.COMPLETED','PAYMENT.CAPTURE.PENDING','PAYMENT.CAPTURE.DENIED','PAYMENT.CAPTURE.DECLINED'))
    or (item->>'action'='capture_reversed' and d.event_type<>'PAYMENT.CAPTURE.REVERSED')
    or (item->>'action'='refund' and d.event_type not in ('PAYMENT.CAPTURE.REFUNDED','PAYMENT.REFUND.PENDING','PAYMENT.REFUND.FAILED'))
    or (item->>'action'='dispute' and d.event_type not in ('CUSTOMER.DISPUTE.CREATED','CUSTOMER.DISPUTE.UPDATED','CUSTOMER.DISPUTE.RESOLVED'))
    or (effect='none' and (p_command->>'orderId' is not null or p_command->>'reviewKind' is not null or p_command->>'merchantId' is not null
      or p_command->'receipt'<>'null'::jsonb or p_command->'evidence'<>'null'::jsonb))
    or (effect<>'none' and coalesce(p_command->>'orderId','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
    then raise exception using errcode='22023',message='A canonical PayPal webhook effect command is required.';end if;
  expected_receipt:=case effect
    when 'capture' then 'paypal:capture:'||(o->>'captureId')
    when 'failure' then 'paypal:failed:'||(o->>'captureId')||':'||(p_command->'receipt'->>'status')
    when 'close' then 'paypal:closed:'||(p_command->>'paypalOrderId')
    when 'review' then public._billing_paypal_webhook_receipt_id(d.verified_event_id,p_cursor)
    when 'approval_reversed' then public._billing_paypal_webhook_receipt_id(d.verified_event_id,p_cursor)
    else null end;
  if o->>'receiptEventId' is distinct from expected_receipt
    or (effect in ('capture','failure') and jsonb_typeof(p_command->'receipt') is distinct from 'object')
    or (effect in ('capture','failure','review') and (p_command->'receipt'->>'captureId' is distinct from o->>'captureId'
      or p_command->'receipt'->>'paypalOrderId' is distinct from o->>'paypalOrderId'))
    or (effect='review' and (p_command->>'reviewKind' not in ('refund','dispute','reversal','refund_pending')
      or jsonb_typeof(p_command->'receipt') is distinct from 'object' or jsonb_typeof(p_command->'evidence') is distinct from 'object'))
    or (effect in ('review','approval_reversed') and (p_command->'evidence'->>'paypalEventId' is distinct from d.verified_event_id
      or p_command->'evidence'->>'eventType' is distinct from d.event_type or (p_command->'evidence'->>'cursor')::integer is distinct from p_cursor
      or p_command->'evidence'->>'resourceKind' is distinct from item->>'resourceKind'
      or p_command->'evidence'->'resourceId' is distinct from item->'resourceId'
      or p_command->'evidence'->'refundId' is distinct from item->'refundId'
      or p_command->'evidence'->'disputeId' is distinct from item->'disputeId'
      or p_command->'evidence'->'caseId' is distinct from item->'caseId'
      or p_command->'evidence'->>'paypalOrderId' is distinct from o->>'paypalOrderId'
      or p_command->'evidence'->>'captureId' is distinct from o->>'captureId'
      or p_command->'evidence'->'providerStatus' is distinct from item->'providerStatus'
      or p_command->'evidence'->'amount' is distinct from item->'amount'
      or p_command->'evidence'->'currency' is distinct from item->'currency'
      or p_command->'evidence'->'detail' is distinct from item->'detail'))
    or (effect='approval_reversed' and (jsonb_typeof(p_command->'evidence') is distinct from 'object' or p_command->'receipt'<>'null'::jsonb))
    or (effect in ('capture','failure','close') and (p_command->>'reviewKind' is not null or p_command->'evidence'<>'null'::jsonb))
    or (effect='close' and (p_command->'receipt'<>'null'::jsonb or coalesce(p_command->>'paypalOrderId','') !~ '^[A-Z0-9]{5,64}$'
      or coalesce(p_command->>'merchantId','') !~ '^[A-Z0-9]{13}$'))
    then raise exception using errcode='22023',message='Webhook effect receipt does not match its frozen plan.';end if;
  case effect
    when 'capture' then effect_result:=public.billing_paypal_apply_capture(p_environment,(p_command->>'orderId')::uuid,p_command->'receipt');
    when 'failure' then effect_result:=public.billing_paypal_record_failure(p_environment,(p_command->>'orderId')::uuid,p_command->'receipt');
    when 'close' then effect_result:=public.billing_paypal_close_order(p_environment,(p_command->>'orderId')::uuid,p_command->>'paypalOrderId',p_command->>'merchantId','VOIDED');
    when 'review' then effect_result:=public.billing_paypal_webhook_record_review(p_environment,(p_command->>'orderId')::uuid,d.verified_event_id,d.event_type,p_cursor,
      p_command->>'reviewKind',p_command->'receipt',p_command->'evidence');
    when 'approval_reversed' then effect_result:=public.billing_paypal_webhook_reverse_approval(p_environment,(p_command->>'orderId')::uuid,p_command->>'paypalOrderId',
      p_command->>'merchantId',d.verified_event_id,d.event_type,p_cursor,p_command->'evidence');
    else effect_result:=null;
  end case;
  if effect<>'none' and effect_result->>'orderId' is distinct from p_command->>'orderId' then
    raise exception using errcode='PT409',message='Webhook effect changed payment identity.';end if;
  if effect in ('review','approval_reversed') and effect_result->>'webhookReceiptEventId' is distinct from expected_receipt then
    raise exception using errcode='PT409',message='Webhook effect changed its immutable receipt identity.';end if;
  if effect='capture' and (effect_result->>'captureId' is distinct from o->>'captureId'
      or effect_result->>'paypalOrderId' is distinct from o->>'paypalOrderId') then
    raise exception using errcode='PT409',message='Webhook capture result changed payment identity.';end if;
  if effect in ('failure','close','review','approval_reversed') and effect_result->>'paypalOrderId' is distinct from o->>'paypalOrderId' then
    raise exception using errcode='PT409',message='Webhook effect result changed provider order identity.';end if;
  insert into public.billing_paypal_webhook_outcomes(environment,event_id,event_cursor,delivery_id,event_type,action,resource_kind,resource_id,
    paypal_order_id,capture_id,provider_status,amount,currency,receipt_event_id,detail)
    values(p_environment,d.verified_event_id,p_cursor,d.id,d.event_type,o->>'action',o->>'resourceKind',o->>'resourceId',
      o->>'paypalOrderId',o->>'captureId',o->>'providerStatus',(o->>'amount')::integer,o->>'currency',o->>'receiptEventId',o->'detail');
  done:=p_cursor+1>=d.total_items;
  update public.billing_paypal_webhook_deliveries set cursor=p_cursor+1,state=case when done then 'completed' else 'planned' end,
    outcome_code=case when done then 'processed' else null end,completed_at=case when done then clock_timestamp() else null end,
    plan=case when done then null else plan end,total_items=case when done then null else total_items end,
    lease_token=null,locked_until=null,last_error_code=null,failure_count=0,next_attempt_at=clock_timestamp(),updated_at=clock_timestamp()
    where id=d.id returning * into d;
  return public._billing_paypal_webhook_json(d,false)||jsonb_build_object('itemApplied',true,'outcome',o);
end;$$;

create function public.billing_paypal_webhook_retry(p_environment text,p_delivery_id uuid,p_lease_token uuid,p_error_code text,p_delay_seconds integer) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare d public.billing_paypal_webhook_deliveries%rowtype;terminal boolean;begin
  perform public._billing_create_environment(p_environment);
  if coalesce(p_error_code,'') !~ '^[a-z0-9_]{3,80}$' or p_delay_seconds not between 1 and 21600 then raise exception using errcode='22023',message='Invalid webhook retry.';end if;
  select * into d from public.billing_paypal_webhook_deliveries where id=p_delivery_id and environment=p_environment for update;
  if not found then raise exception using errcode='P0002',message='Webhook delivery was not found.';end if;
  if d.state<>'processing' or d.lease_token is distinct from p_lease_token or d.locked_until<=clock_timestamp() then raise exception using errcode='PT409',message='Webhook delivery lease was lost.';end if;
  terminal := (d.received_at < clock_timestamp() - (case when d.plan is not null then interval '30 days' else interval '7 days' end)
    and not exists(
    select 1 from public.billing_paypal_webhook_admin_actions a where a.delivery_id=d.id and a.action='retry'
      and a.created_at>=clock_timestamp()-interval '7 days'));
  update public.billing_paypal_webhook_deliveries set state=case when terminal then 'quarantined' else 'retry' end,last_error_code=p_error_code,
    outcome_code=case when terminal then 'quarantined' else null end,completed_at=case when terminal then clock_timestamp() else null end,
    failure_count=least(32,failure_count+1),
    next_attempt_at=case when terminal then next_attempt_at else clock_timestamp()+make_interval(secs=>p_delay_seconds) end,
    lease_token=null,locked_until=null,updated_at=clock_timestamp() where id=d.id returning * into d;
  return public._billing_paypal_webhook_json(d,false);
end;$$;

create function public.billing_paypal_webhook_quarantine(p_environment text,p_delivery_id uuid,p_lease_token uuid,p_error_code text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare d public.billing_paypal_webhook_deliveries%rowtype;begin
  perform public._billing_create_environment(p_environment);
  if coalesce(p_error_code,'') !~ '^[a-z0-9_]{3,80}$' then raise exception using errcode='22023',message='Invalid webhook quarantine reason.';end if;
  update public.billing_paypal_webhook_deliveries set state='quarantined',last_error_code=p_error_code,outcome_code='quarantined',completed_at=clock_timestamp(),
    lease_token=null,locked_until=null,updated_at=clock_timestamp() where id=p_delivery_id and environment=p_environment
      and state='processing' and lease_token=p_lease_token and locked_until>clock_timestamp() returning * into d;
  if not found then raise exception using errcode='PT409',message='Webhook delivery lease was lost.';end if;
  -- A permanently invalid pre-verification envelope cannot become actionable.
  -- Drop attacker-controlled raw/signature material immediately so invalid
  -- traffic cannot occupy the bounded ingress quota for the retention window.
  if d.verified_event_id is null and p_error_code in ('invalid_webhook','invalid_webhook_signature') then
    delete from public.billing_paypal_webhook_payloads where delivery_id=d.id;
    update public.billing_paypal_webhook_deliveries set raw_purged_at=clock_timestamp(),updated_at=clock_timestamp()
      where id=d.id returning * into d;
  end if;
  return public._billing_paypal_webhook_json(d,false);
end;$$;

create function public.billing_paypal_webhook_admin_list(p_operator_id uuid,p_environment text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  perform public._billing_create_environment(p_environment);
  if not exists(select 1 from public.profiles where id=p_operator_id and role='admin' and account_status='active') then raise exception using errcode='42501',message='An active administrator is required.';end if;
  perform public._billing_paypal_webhook_cleanup();
  return coalesce((select jsonb_agg(jsonb_build_object('deliveryId',id,'state',state,'eventId',verified_event_id,'eventType',event_type,
    'cursor',cursor,'totalItems',total_items,'attemptCount',attempt_count,'failureCount',failure_count,'lastErrorCode',last_error_code,'outcomeCode',outcome_code,
    'nextAttemptAt',next_attempt_at,'lockedUntil',locked_until,'rawAvailable',raw_available,'continuationAvailable',(plan is not null or raw_available),'acknowledgedAt',acknowledged_at,
    'receivedAt',received_at,'updatedAt',updated_at) order by priority,received_at)
    from (select q.*,exists(select 1 from public.billing_paypal_webhook_payloads p where p.delivery_id=q.id) raw_available,
      case when q.state='retry' and q.next_attempt_at<=clock_timestamp() then 0
        when q.state='processing' and q.locked_until<=clock_timestamp() then 1
        when q.state='quarantined' and (q.plan is not null or exists(select 1 from public.billing_paypal_webhook_payloads p where p.delivery_id=q.id)) then 2
        when q.state in ('queued','verified','planned') then 3 when q.state='retry' then 4 when q.state='processing' then 5 else 6 end priority
      from public.billing_paypal_webhook_deliveries q where q.environment=p_environment and q.acknowledged_at is null
        and q.state in ('queued','verified','planned','retry','processing','quarantined')
      order by priority,q.received_at limit 100) q),'[]'::jsonb);
end;$$;

create function public.billing_paypal_webhook_admin_retry(p_operator_id uuid,p_environment text,p_delivery_id uuid,p_action_id uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare d public.billing_paypal_webhook_deliveries%rowtype;a public.billing_paypal_webhook_admin_actions%rowtype;begin
  perform public._billing_create_environment(p_environment);
  if not exists(select 1 from public.profiles where id=p_operator_id and role='admin' and account_status='active') then raise exception using errcode='42501',message='An active administrator is required.';end if;
  if p_action_id is null or char_length(coalesce(btrim(p_reason),'')) not between 10 and 1000 then raise exception using errcode='22023',message='A retry identity and reason are required.';end if;
  select * into d from public.billing_paypal_webhook_deliveries where id=p_delivery_id and environment=p_environment for update;
  if not found then raise exception using errcode='P0002',message='Webhook delivery was not found.';end if;
  select * into a from public.billing_paypal_webhook_admin_actions where id=p_action_id;
  if found then
    if row(a.environment,a.delivery_id,a.operator_id,a.action,a.reason) is distinct from row(p_environment,d.id,p_operator_id,'retry',btrim(p_reason)) then
      raise exception using errcode='PT409',message='This admin retry identity was already used.';end if;
    return public._billing_paypal_webhook_json(d,false)||jsonb_build_object('advanceAllowed',false,'actionReplayed',true);
  end if;
  if d.state not in ('queued','verified','planned','retry','quarantined','processing') or (d.state='processing' and d.locked_until>clock_timestamp()) then
    raise exception using errcode='PT409',message='Only a saved webhook delivery without a live processor may be continued.';end if;
  if d.plan is null and not exists(select 1 from public.billing_paypal_webhook_payloads p where p.delivery_id=d.id) then
    raise exception using errcode='PT409',message='Expired webhook recovery material cannot be retried.';end if;
  insert into public.billing_paypal_webhook_admin_actions(id,environment,delivery_id,operator_id,action,reason)
    values(p_action_id,p_environment,d.id,p_operator_id,'retry',btrim(p_reason)) on conflict do nothing;
  select * into a from public.billing_paypal_webhook_admin_actions where id=p_action_id;
  if row(a.environment,a.delivery_id,a.operator_id,a.action,a.reason) is distinct from row(p_environment,d.id,p_operator_id,'retry',btrim(p_reason)) then
    raise exception using errcode='PT409',message='This admin retry identity was already used.';end if;
  update public.billing_paypal_webhook_deliveries set state=case when plan is not null then 'planned' when verified_event_id is not null then 'verified' else 'queued' end,
    attempt_count=0,failure_count=0,next_attempt_at=clock_timestamp(),lease_token=null,locked_until=null,last_error_code=null,outcome_code=null,completed_at=null,
    acknowledged_at=null,updated_at=clock_timestamp()
    where id=d.id returning * into d;
  return public._billing_paypal_webhook_json(d,false)||jsonb_build_object('advanceAllowed',true,'actionReplayed',false);
end;$$;

create function public.billing_paypal_webhook_admin_acknowledge(p_operator_id uuid,p_environment text,p_delivery_id uuid,p_action_id uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare d public.billing_paypal_webhook_deliveries%rowtype;a public.billing_paypal_webhook_admin_actions%rowtype;begin
  perform public._billing_create_environment(p_environment);
  if not exists(select 1 from public.profiles where id=p_operator_id and role='admin' and account_status='active') then raise exception using errcode='42501',message='An active administrator is required.';end if;
  if p_action_id is null or char_length(coalesce(btrim(p_reason),'')) not between 10 and 1000 then raise exception using errcode='22023',message='An acknowledgement identity and reason are required.';end if;
  select * into d from public.billing_paypal_webhook_deliveries where id=p_delivery_id and environment=p_environment for update;
  if not found then raise exception using errcode='P0002',message='Webhook delivery was not found.';end if;
  select * into a from public.billing_paypal_webhook_admin_actions where id=p_action_id;
  if found then
    if row(a.environment,a.delivery_id,a.operator_id,a.action,a.reason) is distinct from row(p_environment,d.id,p_operator_id,'acknowledge',btrim(p_reason)) then
      raise exception using errcode='PT409',message='This admin acknowledgement identity was already used.';end if;
    return public._billing_paypal_webhook_json(d,false)||jsonb_build_object('actionReplayed',true);
  end if;
  if d.state<>'quarantined' or d.plan is not null or exists(select 1 from public.billing_paypal_webhook_payloads p where p.delivery_id=d.id) then
    raise exception using errcode='PT409',message='Only an expired quarantined webhook alert may be acknowledged.';end if;
  insert into public.billing_paypal_webhook_admin_actions(id,environment,delivery_id,operator_id,action,reason)
    values(p_action_id,p_environment,d.id,p_operator_id,'acknowledge',btrim(p_reason)) on conflict do nothing;
  select * into a from public.billing_paypal_webhook_admin_actions where id=p_action_id;
  if row(a.environment,a.delivery_id,a.operator_id,a.action,a.reason) is distinct from row(p_environment,d.id,p_operator_id,'acknowledge',btrim(p_reason)) then
    raise exception using errcode='PT409',message='This admin acknowledgement identity was already used.';end if;
  update public.billing_paypal_webhook_deliveries set acknowledged_at=coalesce(acknowledged_at,clock_timestamp()),
    raw_purged_at=coalesce(raw_purged_at,clock_timestamp()),plan=null,total_items=null,updated_at=clock_timestamp()
    where id=d.id returning * into d;
  return public._billing_paypal_webhook_json(d,false)||jsonb_build_object('actionReplayed',false);
end;$$;

create function public._billing_paypal_webhook_receipt_id(p_event_id text,p_cursor integer) returns text
language sql immutable set search_path=pg_catalog,public as $$
  select 'paypal:webhook:'||encode(sha256(convert_to(p_event_id||':'||p_cursor::text,'UTF8')),'hex');
$$;

create function public._billing_paypal_webhook_evidence(p_event_id text,p_event_type text,p_cursor integer,p_receipt jsonb,p_evidence jsonb) returns void
language plpgsql immutable set search_path=pg_catalog,public as $$
declare d jsonb;k text;v text;begin
  d:=p_evidence->'detail';
  if jsonb_typeof(p_evidence) is distinct from 'object' or p_evidence is distinct from jsonb_build_object(
      'version',1,'paypalEventId',p_evidence->>'paypalEventId','eventType',p_evidence->>'eventType','cursor',(p_evidence->>'cursor')::integer,
      'resourceKind',p_evidence->>'resourceKind','resourceId',p_evidence->'resourceId','refundId',p_evidence->'refundId',
      'disputeId',p_evidence->'disputeId','caseId',p_evidence->'caseId','paypalOrderId',p_evidence->'paypalOrderId',
      'captureId',p_evidence->'captureId','providerStatus',p_evidence->'providerStatus','amount',p_evidence->'amount',
      'currency',p_evidence->'currency','detail',d)
    or p_evidence->>'paypalEventId' is distinct from p_event_id or p_evidence->>'eventType' is distinct from p_event_type
    or (p_evidence->>'cursor')::integer is distinct from p_cursor or p_evidence->>'resourceKind' not in ('order','capture','refund','dispute','event')
    or p_evidence->>'captureId' is distinct from p_receipt->>'captureId'
    or (p_evidence->>'paypalOrderId' is not null and p_evidence->>'paypalOrderId' is distinct from p_receipt->>'paypalOrderId')
    or (p_evidence->>'providerStatus' is not null and p_evidence->>'providerStatus' !~ '^[A-Z0-9._-]{2,80}$')
    or (p_evidence->>'amount' is not null and ((p_evidence->>'amount')::integer not between 0 and 999999999))
    or (p_evidence->>'currency' is not null and p_evidence->>'currency'<>'USD')
    or jsonb_typeof(d) is distinct from 'object' or d is distinct from jsonb_build_object('stage',d->'stage','reason',d->'reason','outcome',d->'outcome','captureStatus',d->'captureStatus')
    or octet_length(d::text)>2048 then raise exception using errcode='22023',message='Canonical bounded PayPal webhook evidence is required.';end if;
  foreach k in array array['resourceId','refundId','disputeId','caseId'] loop
    v:=p_evidence->>k;if v is not null and (char_length(v) not between 1 and 255 or v ~ '[[:cntrl:]]') then
      raise exception using errcode='22023',message='Invalid PayPal webhook evidence identifier.';end if;
  end loop;
  foreach k in array array['stage','reason','outcome','captureStatus'] loop
    v:=d->>k;if v is not null and (char_length(v)>100 or v ~ '[[:cntrl:]]') then
      raise exception using errcode='22023',message='Invalid PayPal webhook evidence detail.';end if;
  end loop;
end;$$;

-- Webhook review receipts use immutable PayPal event identity plus transaction
-- cursor. Fresh provider capture state can change across retries, but a replay
-- can never create another hold for the same signed event item.
create function public.billing_paypal_webhook_record_review(p_environment text,p_order_id uuid,p_event_id text,p_event_type text,p_cursor integer,p_kind text,p_receipt jsonb,p_evidence jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare o public.billing_orders%rowtype;r jsonb;rid text;receipt_kind text;old public.billing_receipts%rowtype;fresh boolean:=false;begin
  perform public._billing_create_environment(p_environment);
  select b.* into o from public.billing_orders b join public.billing_paypal_orders p on p.order_id=b.id where b.id=p_order_id and b.environment=p_environment;
  if not found then raise exception using errcode='P0002',message='PayPal payment order was not found.';end if;
  perform public._billing_lock_actor(o.owner_id,p_environment,false);
  select * into o from public.billing_orders where id=p_order_id for update;
  perform public._billing_paypal_validate_capture(o,p_receipt);
  perform public._billing_paypal_webhook_evidence(p_event_id,p_event_type,p_cursor,p_receipt,p_evidence);
  if coalesce(p_event_id,'') !~ '^[A-Za-z0-9_-]{8,100}$' or coalesce(p_event_type,'') !~ '^[A-Z0-9._-]{3,100}$' or p_cursor not between 0 and 19
    or p_kind not in ('refund','dispute','reversal','refund_pending')
    or (p_kind='refund' and coalesce(p_receipt->>'status','') not in ('COMPLETED','REFUNDED','PARTIALLY_REFUNDED'))
    or (p_kind='refund_pending' and coalesce(p_receipt->>'status','') not in ('COMPLETED','PENDING','REFUNDED','PARTIALLY_REFUNDED'))
    or (p_kind='dispute' and coalesce(p_receipt->>'status','') not in ('COMPLETED','PENDING','DECLINED','DENIED','FAILED','REVERSED','REFUNDED','PARTIALLY_REFUNDED'))
    or (p_kind='reversal' and coalesce(p_receipt->>'status','') not in ('COMPLETED','REVERSED','DECLINED','DENIED','FAILED','PENDING','REFUNDED','PARTIALLY_REFUNDED')) then
    raise exception using errcode='22023',message='A verified PayPal webhook review event is required.';end if;
  perform public._billing_paypal_register_reference(p_environment,'paypal',p_receipt->>'captureId',o.id);
  rid:=public._billing_paypal_webhook_receipt_id(p_event_id,p_cursor);
  receipt_kind:=case when p_kind in ('refund','refund_pending') then 'refund' else 'dispute' end;
  select * into old from public.billing_receipts where environment=p_environment and event_id=rid;
  if found then
    -- The first committed effect is canonical for this verified event cursor.
    -- A response-loss retry may observe a newer capture status and derive a
    -- different review label, but it must return the original receipt rather
    -- than create a second hold or deadlock on mutable provider state.
    if old.order_id is distinct from o.id or old.receipt->'providerEvidence' is distinct from p_evidence
      or old.receipt->>'captureId' is distinct from p_receipt->>'captureId' then
      raise exception using errcode='PT409',message='This verified PayPal event item was already recorded with different evidence.';end if;
  else
    r:=p_receipt||jsonb_build_object('eventId',rid,'source','paypal_webhook','kind',p_kind,'providerEvidence',p_evidence);
    fresh:=public._billing_receipt(o,receipt_kind,r);
  end if;
  if fresh then
    insert into public.billing_credit_holds(environment,event_id,owner_id,reason) values(p_environment,rid,o.owner_id,p_kind);
    update public.billing_orders set payment_id='paypal_capture:'||(p_receipt->>'captureId'),last_error='billing_review_required',updated_at=clock_timestamp() where id=o.id returning * into o;
  else select * into o from public.billing_orders where id=p_order_id;end if;
  return public._billing_paypal_order_json(o)||jsonb_build_object('webhookReceiptEventId',rid);
exception when unique_violation then raise exception using errcode='PT409',message='This PayPal capture was already recorded for another order.';
end;$$;

create function public.billing_paypal_webhook_reverse_approval(p_environment text,p_order_id uuid,p_paypal_order_id text,p_merchant_id text,p_event_id text,p_event_type text,p_cursor integer,p_evidence jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare o public.billing_orders%rowtype;r jsonb;rid text;old public.billing_receipts%rowtype;fresh boolean:=false;empty_receipt jsonb;begin
  perform public._billing_create_environment(p_environment);
  select b.* into o from public.billing_orders b join public.billing_paypal_orders p on p.order_id=b.id where b.id=p_order_id and b.environment=p_environment;
  if not found then raise exception using errcode='P0002',message='PayPal payment order was not found.';end if;
  perform public._billing_lock_actor(o.owner_id,p_environment,false);
  select * into o from public.billing_orders where id=p_order_id for update;
  empty_receipt:=jsonb_build_object('paypalOrderId',p_paypal_order_id,'captureId',p_evidence->'captureId');
  perform public._billing_paypal_webhook_evidence(p_event_id,p_event_type,p_cursor,empty_receipt,p_evidence);
  if p_paypal_order_id !~ '^[A-Z0-9]{5,64}$' or p_event_type<>'CHECKOUT.PAYMENT-APPROVAL.REVERSED' or p_cursor<>0
    or not exists(select 1 from public.billing_paypal_orders p join public.billing_paypal_bindings b on b.order_id=p.order_id
      where p.order_id=o.id and p.merchant_id=p_merchant_id and b.paypal_order_id=p_paypal_order_id and b.environment=p_environment) then
    raise exception using errcode='22023',message='An authoritative payment-approval reversal is required.';end if;
  rid:=public._billing_paypal_webhook_receipt_id(p_event_id,p_cursor);
  select * into old from public.billing_receipts where environment=p_environment and event_id=rid;
  if found then
    if old.order_id is distinct from o.id or old.kind<>'expired' or old.receipt->'providerEvidence' is distinct from p_evidence then
      raise exception using errcode='PT409',message='This verified PayPal reversal was already recorded with different evidence.';end if;
  else
    r:=jsonb_build_object('eventId',rid,'source','paypal_webhook','paypalOrderId',p_paypal_order_id,'merchantId',p_merchant_id,
      'status','PAYMENT_APPROVAL_REVERSED','providerEvidence',p_evidence);
    fresh:=public._billing_receipt(o,'expired',r);
  end if;
  if fresh then
    if o.payment_id is not null or o.status='fulfilled' then
      insert into public.billing_credit_holds(environment,event_id,owner_id,reason) values(p_environment,rid,o.owner_id,'payment_approval_reversed');
      update public.billing_orders set last_error='billing_review_required',updated_at=clock_timestamp() where id=o.id returning * into o;
    else
      update public.billing_orders set status='expired',last_error=null,updated_at=clock_timestamp() where id=o.id returning * into o;
    end if;
  else select * into o from public.billing_orders where id=p_order_id;end if;
  return public._billing_paypal_order_json(o)||jsonb_build_object('webhookReceiptEventId',rid);
end;$$;

do $$declare f record;begin
  for f in select oid::regprocedure signature,proname from pg_proc where pronamespace='public'::regnamespace and proname like '%billing_paypal_webhook%' loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
    if f.proname like 'billing_paypal_webhook_%' then execute format('grant execute on function %s to service_role',f.signature);end if;
  end loop;
end;$$;

commit;
