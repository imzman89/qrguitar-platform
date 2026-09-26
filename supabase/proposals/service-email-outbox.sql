-- REVIEW PROPOSAL ONLY. Not in migrations; do not apply to production.
-- No backfill. No scheduler. Capture is disabled until coordinated application cutover.
begin;

create table public.service_email_outbox_control (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false
);
insert into public.service_email_outbox_control(singleton,enabled) values(true,false);
create table public.service_email_intents (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.service_submissions(id) on delete cascade,
  event_sequence integer not null check(event_sequence > 0),
  event_type text not null default 'service.submitted' check(event_type = 'service.submitted'),
  recipient_user_id uuid references auth.users(id) on delete set null,
  provider_user_id uuid references auth.users(id) on delete set null,
  provider_revision integer not null,
  state text not null default 'queued' check(state in ('queued','leased','dispatching','retry','accepted','failed','unknown','suppressed')),
  attempt_count integer not null default 0 check(attempt_count between 0 and 6),
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  locked_until timestamptz,
  provider_message_id text check(length(provider_message_id) <= 300),
  outcome_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(submission_id,event_sequence),
  check((state in ('leased','dispatching') and lease_token is not null and locked_until is not null)
    or (state not in ('leased','dispatching') and lease_token is null and locked_until is null))
);
create index service_email_intents_due on public.service_email_intents(state,next_attempt_at,created_at);
alter table public.service_email_outbox_control enable row level security;
alter table public.service_email_intents enable row level security;
revoke all on public.service_email_outbox_control,public.service_email_intents from public,anon,authenticated,service_role;

-- The parent row lock held by the domain UPDATE serializes event sequence allocation.
-- This transaction's rollback also rolls back the intent; HTTP response loss cannot lose it.
create function public.capture_service_email_intent() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare sequence_number integer;
begin
  if not exists(select 1 from public.service_email_outbox_control where singleton and enabled) then return new; end if;
  if new.status <> 'submitted' then return new; end if;
  if tg_op='UPDATE' then
    if old.status='submitted' and old.provider_revision is not distinct from new.provider_revision then return new; end if;
  end if;
  select coalesce(max(event_sequence),0)+1 into sequence_number from public.service_email_intents where submission_id=new.id;
  insert into public.service_email_intents(submission_id,event_sequence,recipient_user_id,provider_user_id,provider_revision)
    values(new.id,sequence_number,new.owner_user_id,new.provider_user_id,new.provider_revision);
  return new;
end;$$;
create trigger service_submission_email_intent after insert or update on public.service_submissions
  for each row execute function public.capture_service_email_intent();

create function public.claim_service_email_intent(p_lease_token uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare r public.service_email_intents;
begin
  if p_lease_token is null then raise exception 'A lease token is required.'; end if;
  if not exists(select 1 from public.service_email_outbox_control where singleton and enabled) then return null; end if;
  -- Recover a bounded number of expired leases. A send may have reached the provider.
  with expired as (select id from public.service_email_intents where state in ('leased','dispatching')
    and locked_until<=clock_timestamp() order by locked_until,id limit 20 for update skip locked)
  update public.service_email_intents i set state=case when i.state='dispatching' then 'unknown' else 'retry' end,
    outcome_code=case when i.state='dispatching' then 'dispatch_receipt_missing' else 'lease_expired_before_dispatch' end,
    lease_token=null,locked_until=null,updated_at=clock_timestamp() from expired where i.id=expired.id;
  select * into r from public.service_email_intents where state in ('queued','retry') and next_attempt_at<=clock_timestamp()
    and attempt_count<6 order by next_attempt_at,created_at,id limit 1 for update skip locked;
  if not found then return null; end if;
  update public.service_email_intents set state='leased',lease_token=p_lease_token,locked_until=clock_timestamp()+interval '120 seconds',updated_at=clock_timestamp() where id=r.id;
  return jsonb_build_object('id',r.id,'leaseToken',p_lease_token);
end;$$;

create function public.begin_service_email_dispatch(p_intent_id uuid,p_lease_token uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare r public.service_email_intents; s public.service_submissions; g public.guitars;
  submission uuid; destination text; provider_name text;
begin
  if not exists(select 1 from public.service_email_outbox_control where singleton and enabled) then raise exception 'Email dispatch is paused.'; end if;
  select submission_id into submission from public.service_email_intents where id=p_intent_id;
  if submission is null then raise exception 'Email intent is unavailable.'; end if;
  -- Match the domain trigger's lock ordering, then recheck all delivery eligibility.
  select * into s from public.service_submissions where id=submission for update;
  if not found then raise exception 'Service submission is unavailable.'; end if;
  select * into r from public.service_email_intents where id=p_intent_id for update;
  if not found or r.state<>'leased' or p_lease_token is null or r.lease_token is distinct from p_lease_token or r.locked_until<=clock_timestamp() then raise exception 'Email lease is not current.'; end if;
  select * into g from public.guitars where id=s.guitar_id for share;
  if not found then
    update public.service_email_intents set state='suppressed',outcome_code='profile_unavailable',lease_token=null,locked_until=null,updated_at=clock_timestamp() where id=r.id;
    return null;
  end if;
  select email into destination from auth.users where id=r.recipient_user_id;
  if s.status<>'submitted' or s.expires_at is null or s.expires_at<=clock_timestamp()
    or r.recipient_user_id is null or r.provider_user_id is null
    or s.owner_user_id is distinct from r.recipient_user_id or g.owner_id is distinct from r.recipient_user_id
    or s.provider_user_id is distinct from r.provider_user_id or s.provider_revision is distinct from r.provider_revision
    or g.admin_archived_at is not null or g.owner_removed_at is not null
    or nullif(destination,'') is null
    or exists(select 1 from public.service_email_intents newer where newer.submission_id=r.submission_id and newer.event_sequence>r.event_sequence) then
    update public.service_email_intents set state='suppressed',outcome_code='recipient_or_workflow_changed',lease_token=null,locked_until=null,updated_at=clock_timestamp() where id=r.id;
    return null;
  end if;
  select coalesce(nullif(public_display_name,''),nullif(business_name,''),'A service provider') into provider_name
    from public.service_provider_profiles where user_id=r.provider_user_id;
  update public.service_email_intents set state='dispatching',attempt_count=attempt_count+1,updated_at=clock_timestamp() where id=r.id;
  return jsonb_build_object('to',destination,'submissionId',s.id,
    'profileTitle',coalesce(nullif(g.name,''),nullif(g.model,''),'Your Profile'),
    'providerName',coalesce(provider_name,'A service provider'));
end;$$;

create function public.settle_service_email_intent(p_intent_id uuid,p_lease_token uuid,p_state text,
  p_provider_message_id text default null,p_retry_after_seconds integer default 60) returns boolean
language plpgsql security definer set search_path=pg_catalog,public as $$
declare r public.service_email_intents; final_state text; delay_seconds integer;
begin
  if p_state is null or p_state not in ('accepted','retry','failed','unknown') or p_retry_after_seconds is null or p_retry_after_seconds not between 60 and 21600
    or (p_state='accepted' and nullif(p_provider_message_id,'') is null)
    or length(p_provider_message_id)>300 then raise exception 'Invalid delivery outcome.'; end if;
  select * into r from public.service_email_intents where id=p_intent_id for update;
  if not found or r.state<>'dispatching' or r.lease_token is distinct from p_lease_token or r.locked_until<=clock_timestamp() then raise exception 'Email dispatch is not current.'; end if;
  final_state:=case when p_state='retry' and r.attempt_count>=6 then 'failed' else p_state end;
  delay_seconds:=greatest(p_retry_after_seconds,least(21600,(60*power(2,r.attempt_count-1))::integer));
  update public.service_email_intents set state=final_state,provider_message_id=case when final_state='accepted' then p_provider_message_id else null end,
    outcome_code=case when p_state='retry' and final_state='failed' then 'retry_budget_exhausted'
      when final_state='unknown' then 'provider_acceptance_unknown' when final_state='accepted' then 'provider_accepted' else 'provider_rejected' end,
    next_attempt_at=case when final_state='retry' then clock_timestamp()+make_interval(secs=>delay_seconds) else next_attempt_at end,
    lease_token=null,locked_until=null,updated_at=clock_timestamp() where id=r.id;
  return true;
end;$$;

-- Aggregate status only. An authenticated Admin route is required before exposing it.
create function public.service_email_outbox_status() returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
  select jsonb_build_object('enabled',(select enabled from public.service_email_outbox_control where singleton),
    'queued',count(*) filter(where state in ('queued','retry')),
    'inFlight',count(*) filter(where state in ('leased','dispatching')),
    'accepted',count(*) filter(where state='accepted'),
    'failed',count(*) filter(where state='failed'),
    'unknown',count(*) filter(where state='unknown'),
    'suppressed',count(*) filter(where state='suppressed'),
    'oldestPendingAt',min(created_at) filter(where state in ('queued','retry')))
  from public.service_email_intents;
$$;
revoke all on function public.capture_service_email_intent() from public,anon,authenticated,service_role;
revoke all on function public.claim_service_email_intent(uuid),public.begin_service_email_dispatch(uuid,uuid),
  public.settle_service_email_intent(uuid,uuid,text,text,integer),public.service_email_outbox_status() from public,anon,authenticated;
grant execute on function public.claim_service_email_intent(uuid),public.begin_service_email_dispatch(uuid,uuid),
  public.settle_service_email_intent(uuid,uuid,text,text,integer),public.service_email_outbox_status() to service_role;
commit;
