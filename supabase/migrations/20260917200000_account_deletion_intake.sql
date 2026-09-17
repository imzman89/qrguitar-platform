-- PROPOSAL ONLY. Request intake and cancellation; never erasure or fulfillment.
-- Apply as the trusted migration owner after the existing account schema.
begin;

create table public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'requested' check (status in ('requested', 'cancelled')),
  requested_at timestamptz not null default clock_timestamp(),
  cancelled_at timestamptz,
  unique (id, actor_id),
  check ((status = 'requested' and cancelled_at is null)
    or (status = 'cancelled' and cancelled_at is not null and cancelled_at >= requested_at))
);
create unique index account_deletion_one_active_request
  on public.account_deletion_requests(actor_id) where status = 'requested';
create index account_deletion_request_queue
  on public.account_deletion_requests(requested_at desc, id desc) where status = 'requested';
create index account_deletion_request_actor_history
  on public.account_deletion_requests(actor_id, requested_at desc, id desc);

create table public.account_deletion_actor_revisions (
  actor_id uuid primary key references auth.users(id) on delete restrict,
  revision bigint not null default 0 check (revision >= 0)
);

create table public.account_deletion_request_receipts (
  actor_id uuid not null,
  operation_id uuid not null,
  action text not null check (action in ('submit', 'cancel')),
  request_id uuid not null,
  expected_revision bigint not null check (expected_revision >= 0),
  recorded_at timestamptz not null default clock_timestamp(),
  primary key (actor_id, operation_id),
  foreign key (request_id, actor_id) references public.account_deletion_requests(id, actor_id) on delete restrict
);
create index account_deletion_receipt_actor_time
  on public.account_deletion_request_receipts(actor_id, recorded_at desc);

comment on table public.account_deletion_requests is
  'Private request intake only. Auth UUID is linkable personal data, not anonymous. No retention duration, fulfillment permission, or completion claim is implied. Future reviewed fulfillment must explicitly transform these records and this restrictive Auth FK.';
comment on table public.account_deletion_request_receipts is
  'Minimal operation receipts prevent lost-response retries reopening cancelled requests. No email, token, IP, user-agent, free-text reason, document, or cleanup manifest is stored at intake.';
comment on table public.account_deletion_actor_revisions is
  'Private intake-only revision fence. Every accepted fresh submit/cancel operation advances the actor revision; exact operation replays do not. Not an erasure or general account lifecycle fence.';

alter table public.account_deletion_requests enable row level security;
alter table public.account_deletion_request_receipts enable row level security;
alter table public.account_deletion_actor_revisions enable row level security;
revoke all privileges on public.account_deletion_requests, public.account_deletion_request_receipts, public.account_deletion_actor_revisions
  from public, anon, authenticated, service_role;
create policy account_deletion_requests_no_direct_access on public.account_deletion_requests
  as restrictive for all to public using (false) with check (false);
create policy account_deletion_receipts_no_direct_access on public.account_deletion_request_receipts
  as restrictive for all to public using (false) with check (false);
create policy account_deletion_revisions_no_direct_access on public.account_deletion_actor_revisions
  as restrictive for all to public using (false) with check (false);

create function public._account_deletion_intake_guard() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if tg_table_name = 'account_deletion_request_receipts' then
    raise exception using errcode = '42501', message = 'Account request receipts are immutable.';
  end if;
  if tg_op = 'DELETE' or new.id is distinct from old.id or new.actor_id is distinct from old.actor_id
    or new.requested_at is distinct from old.requested_at or old.status <> 'requested' or new.status <> 'cancelled'
    or new.cancelled_at is null then
    raise exception using errcode = '42501', message = 'Only request cancellation is available; fulfillment requires a separate reviewed protocol.';
  end if;
  return new;
end $$;
create trigger account_deletion_requests_intake_only before update or delete
  on public.account_deletion_requests for each row execute function public._account_deletion_intake_guard();
create trigger account_deletion_receipts_immutable before update or delete
  on public.account_deletion_request_receipts for each row execute function public._account_deletion_intake_guard();

create function public._account_deletion_lock_actor(p_actor_id uuid) returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if p_actor_id is null then raise exception using errcode = '22023', message = 'Verified account identity is required.'; end if;
  -- This lock serializes only intake/cancel operations. It is NOT a lifecycle
  -- fence for Profiles, uploads, claims, transfers, provider work, or billing.
  perform pg_advisory_xact_lock(hashtextextended('qrguitar:privacy-request:' || p_actor_id::text, 0));
  perform 1 from auth.users where id = p_actor_id for key share;
  if not found then raise exception using errcode = 'PD401', message = 'Verified account identity is unavailable.'; end if;
  -- Deliberately do not require profiles.account_status='active'. Restricted
  -- users with a verified Auth identity retain access to privacy requests.
end $$;

create function public._account_deletion_request_json(p_request public.account_deletion_requests) returns jsonb
language sql stable set search_path = pg_catalog, public as $$
  select jsonb_build_object('requestId', p_request.id, 'status', p_request.status,
    'requestedAt', p_request.requested_at, 'cancelledAt', p_request.cancelled_at)
$$;

create function public._account_deletion_receipt_json(p_receipt public.account_deletion_request_receipts) returns jsonb
language sql stable set search_path = pg_catalog, public as $$
  select jsonb_build_object('ok', true,
    'receipt', jsonb_build_object('operationId', p_receipt.operation_id, 'action', p_receipt.action,
      'requestId', p_receipt.request_id, 'recordedAt', p_receipt.recorded_at, 'expectedRevision', p_receipt.expected_revision::text),
    'request', public._account_deletion_request_json(r))
  from public.account_deletion_requests r where r.id = p_receipt.request_id and r.actor_id = p_receipt.actor_id
$$;

create function public.submit_account_deletion_request(p_actor_id uuid, p_operation_id uuid, p_expected_revision bigint) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  saved public.account_deletion_requests;
  receipt public.account_deletion_request_receipts;
  current_revision bigint;
  receipt_cutoff timestamptz;
  recent_operations integer;
begin
  if p_operation_id is null or p_expected_revision is null or p_expected_revision < 0 then
    raise exception using errcode = '22023', message = 'An operation ID and nonnegative expected revision are required.';
  end if;
  perform public._account_deletion_lock_actor(p_actor_id);
  select * into receipt from public.account_deletion_request_receipts where actor_id = p_actor_id and operation_id = p_operation_id;
  if found then
    if receipt.action <> 'submit' or receipt.expected_revision <> p_expected_revision then
      raise exception using errcode = 'PD409', message = 'This operation ID belongs to a different action or expected revision.';
    end if;
    -- Historical receipt is stable; current status may now be cancelled. Never reopen it.
    return public._account_deletion_receipt_json(receipt);
  end if;
  select coalesce((select revision from public.account_deletion_actor_revisions where actor_id = p_actor_id), 0) into current_revision;
  if p_expected_revision <> current_revision then
    raise exception using errcode = 'PD412', message = 'Request state changed. Read current status and confirm a new action.';
  end if;
  receipt_cutoff := clock_timestamp() - interval '1 hour';
  select count(*) into recent_operations from (
    select 1 from public.account_deletion_request_receipts
    where actor_id = p_actor_id and recorded_at >= receipt_cutoff
    order by recorded_at desc limit 60
  ) recent;
  -- Reserve the final slot for cancelling an active request. Exact replays
  -- above are never rate-limited and stale revisions still resolve as PD412.
  if recent_operations >= 59 then
    raise exception using errcode = 'PD429', message = 'Too many new request actions. Retry this action later.';
  end if;
  select * into saved from public.account_deletion_requests where actor_id = p_actor_id and status = 'requested' for update;
  if not found then
    insert into public.account_deletion_requests(actor_id) values (p_actor_id) returning * into saved;
  end if;
  insert into public.account_deletion_request_receipts(actor_id, operation_id, action, request_id, expected_revision)
    values (p_actor_id, p_operation_id, 'submit', saved.id, p_expected_revision) returning * into receipt;
  insert into public.account_deletion_actor_revisions(actor_id, revision) values (p_actor_id, 1)
    on conflict (actor_id) do update set revision = public.account_deletion_actor_revisions.revision + 1;
  return public._account_deletion_receipt_json(receipt);
end $$;

create function public.cancel_account_deletion_request(p_actor_id uuid, p_request_id uuid, p_operation_id uuid, p_expected_revision bigint) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  saved public.account_deletion_requests;
  receipt public.account_deletion_request_receipts;
  current_revision bigint;
  receipt_cutoff timestamptz;
  recent_operations integer;
begin
  if p_request_id is null or p_operation_id is null or p_expected_revision is null or p_expected_revision < 0 then
    raise exception using errcode = '22023', message = 'Request and operation IDs and nonnegative expected revision are required.';
  end if;
  perform public._account_deletion_lock_actor(p_actor_id);
  select * into receipt from public.account_deletion_request_receipts where actor_id = p_actor_id and operation_id = p_operation_id;
  if found then
    if receipt.action <> 'cancel' or receipt.request_id <> p_request_id or receipt.expected_revision <> p_expected_revision then
      raise exception using errcode = 'PD409', message = 'This operation ID belongs to a different action, request, or expected revision.';
    end if;
    return public._account_deletion_receipt_json(receipt);
  end if;
  select coalesce((select revision from public.account_deletion_actor_revisions where actor_id = p_actor_id), 0) into current_revision;
  if p_expected_revision <> current_revision then
    raise exception using errcode = 'PD412', message = 'Request state changed. Read current status and confirm a new action.';
  end if;
  select * into saved from public.account_deletion_requests where id = p_request_id and actor_id = p_actor_id for update;
  if not found then raise exception using errcode = 'PD404', message = 'Account deletion request was not found.'; end if;
  receipt_cutoff := clock_timestamp() - interval '1 hour';
  select count(*) into recent_operations from (
    select 1 from public.account_deletion_request_receipts
    where actor_id = p_actor_id and recorded_at >= receipt_cutoff
    order by recorded_at desc limit 60
  ) recent;
  if recent_operations >= (case when saved.status = 'requested' then 60 else 59 end) then
    raise exception using errcode = 'PD429', message = 'Too many new request actions. Retry this action later.';
  end if;
  if saved.status = 'requested' then
    update public.account_deletion_requests
      set status = 'cancelled', cancelled_at = greatest(clock_timestamp(), requested_at)
      where id = saved.id returning * into saved;
  elsif saved.status <> 'cancelled' then
    raise exception using errcode = 'PD409', message = 'This request can no longer be cancelled.';
  end if;
  insert into public.account_deletion_request_receipts(actor_id, operation_id, action, request_id, expected_revision)
    values (p_actor_id, p_operation_id, 'cancel', saved.id, p_expected_revision) returning * into receipt;
  insert into public.account_deletion_actor_revisions(actor_id, revision) values (p_actor_id, 1)
    on conflict (actor_id) do update set revision = public.account_deletion_actor_revisions.revision + 1;
  return public._account_deletion_receipt_json(receipt);
end $$;

create function public.read_account_deletion_requests(p_actor_id uuid, p_request_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare requested jsonb; active_request jsonb; latest_request jsonb; actor_revision text;
begin
  if p_actor_id is null or not exists(select 1 from auth.users where id = p_actor_id) then
    raise exception using errcode = 'PD401', message = 'Verified account identity is unavailable.';
  end if;
  if p_request_id is not null then
    select public._account_deletion_request_json(r) into requested
      from public.account_deletion_requests r where r.id = p_request_id and r.actor_id = p_actor_id;
    if not found then raise exception using errcode = 'PD404', message = 'Account deletion request was not found.'; end if;
  end if;
  select public._account_deletion_request_json(r) into active_request
    from public.account_deletion_requests r where r.actor_id = p_actor_id and r.status = 'requested';
  select public._account_deletion_request_json(r) into latest_request
    from public.account_deletion_requests r where r.actor_id = p_actor_id order by r.requested_at desc, r.id desc limit 1;
  select coalesce((select revision from public.account_deletion_actor_revisions where actor_id = p_actor_id), 0)::text into actor_revision;
  return jsonb_build_object('ok', true, 'revision', actor_revision, 'request', requested, 'activeRequest', active_request, 'latestRequest', latest_request);
end $$;

create function public.read_account_deletion_queue(
  p_actor_id uuid, p_environment_admin boolean default false,
  p_before_requested_at timestamptz default null, p_before_id uuid default null, p_limit integer default 50
) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare reviewer public.profiles; rows jsonb;
begin
  if p_actor_id is null or not exists(select 1 from auth.users where id = p_actor_id) then
    raise exception using errcode = 'PD401', message = 'Verified administrator identity is unavailable.';
  end if;
  select * into reviewer from public.profiles where id = p_actor_id;
  if p_environment_admin is not true and (reviewer.id is null or reviewer.role::text is distinct from 'admin' or reviewer.account_status is distinct from 'active') then
    raise exception using errcode = 'PD403', message = 'Administrator access is required.';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100
    or ((p_before_requested_at is null) <> (p_before_id is null)) then
    raise exception using errcode = '22023', message = 'A valid bounded queue cursor and limit are required.';
  end if;
  select coalesce(jsonb_agg(item.value order by item.requested_at desc, item.id desc), '[]'::jsonb) into rows
  from (
    select r.requested_at, r.id, public._account_deletion_request_json(r) || jsonb_build_object('actorId', r.actor_id) as value
    from public.account_deletion_requests r where r.status = 'requested'
      and (p_before_requested_at is null or (r.requested_at, r.id) < (p_before_requested_at, p_before_id))
    order by r.requested_at desc, r.id desc limit p_limit
  ) item;
  return jsonb_build_object('ok', true, 'requests', rows);
end $$;

revoke all on function public._account_deletion_intake_guard(), public._account_deletion_lock_actor(uuid),
  public._account_deletion_request_json(public.account_deletion_requests),
  public._account_deletion_receipt_json(public.account_deletion_request_receipts)
  from public, anon, authenticated, service_role;
revoke all on function public.submit_account_deletion_request(uuid,uuid,bigint),
  public.cancel_account_deletion_request(uuid,uuid,uuid,bigint), public.read_account_deletion_requests(uuid,uuid),
  public.read_account_deletion_queue(uuid,boolean,timestamptz,uuid,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.submit_account_deletion_request(uuid,uuid,bigint),
  public.cancel_account_deletion_request(uuid,uuid,uuid,bigint), public.read_account_deletion_requests(uuid,uuid),
  public.read_account_deletion_queue(uuid,boolean,timestamptz,uuid,integer) to service_role;

commit;
