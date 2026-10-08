-- Candidate migration 20260926190000. Kept outside migrations until release authorization.
-- No backfill. Inline remains the initial mode; worker and schedule are disabled.
begin;

create table public.service_email_outbox_control (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  dispatch_enabled boolean not null default false,
  last_success_at timestamptz,
  last_failure_at timestamptz
);
insert into public.service_email_outbox_control(singleton,enabled) values(true,false);
create function public.protect_service_email_cutover() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin
  if old.enabled and not new.enabled then raise exception 'Pause dispatch instead; durable capture cannot revert to inline.'; end if;
  if new.dispatch_enabled and not new.enabled then raise exception 'Capture must be enabled before dispatch.'; end if;
  return new;
end;$$;
create trigger service_email_cutover_guard before update on public.service_email_outbox_control
  for each row execute function public.protect_service_email_cutover();
create table public.service_email_intents (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.service_submissions(id) on delete cascade,
  event_sequence integer not null check(event_sequence > 0),
  event_type text not null default 'service.submitted' check(event_type = 'service.submitted'),
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

-- Authority remains solely on service_submissions, including its existing privacy
-- subject migration. The queue duplicates neither actor IDs nor email addresses.
alter table public.service_submissions add column email_dispatch_mode text not null default 'inline'
  check(email_dispatch_mode in ('inline','outbox'));
create function public.mark_service_email_mode() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare active boolean;
begin
  if new.status='submitted' and (tg_op='INSERT' or old.status is distinct from 'submitted'
    or old.provider_revision is distinct from new.provider_revision) then
    select enabled into active from public.service_email_outbox_control where singleton for share;
    new.email_dispatch_mode:=case when active then 'outbox' else 'inline' end;
  elsif tg_op='UPDATE' then
    new.email_dispatch_mode:=old.email_dispatch_mode;
  end if;
  return new;
end;$$;
create trigger service_submission_email_mode before insert or update on public.service_submissions
  for each row execute function public.mark_service_email_mode();

-- The parent row lock held by the domain UPDATE serializes event sequence allocation.
-- This transaction's rollback also rolls back the intent; HTTP response loss cannot lose it.
create function public.capture_service_email_intent() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare sequence_number integer;
begin
  if tg_op='UPDATE' and (old.owner_user_id is distinct from new.owner_user_id or old.provider_user_id is distinct from new.provider_user_id) then
    update public.service_email_intents set state='suppressed',outcome_code='authority_changed',lease_token=null,locked_until=null,updated_at=clock_timestamp()
      where submission_id=new.id and state in ('queued','retry','leased','failed');
  end if;
  if new.email_dispatch_mode<>'outbox' then return new; end if;
  if new.status <> 'submitted' then return new; end if;
  if tg_op='UPDATE' then
    if old.status='submitted' and old.provider_revision is not distinct from new.provider_revision then return new; end if;
  end if;
  select coalesce(max(event_sequence),0)+1 into sequence_number from public.service_email_intents where submission_id=new.id;
  insert into public.service_email_intents(submission_id,event_sequence,provider_revision)
    values(new.id,sequence_number,new.provider_revision);
  insert into public.service_submission_notifications(submission_id,recipient_user_id,notification_type,message)
    values(new.id,new.owner_user_id,'owner_review','Service work was submitted for your approval.');
  return new;
end;$$;
create trigger service_submission_email_intent after insert or update on public.service_submissions
  for each row execute function public.capture_service_email_intent();

create function public.claim_service_email_intent(p_lease_token uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare r public.service_email_intents;
begin
  if p_lease_token is null then raise exception 'A lease token is required.'; end if;
  if not exists(select 1 from public.service_email_outbox_control where singleton and enabled and dispatch_enabled) then return null; end if;
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
  if not exists(select 1 from public.service_email_outbox_control where singleton and enabled and dispatch_enabled) then raise exception 'Email dispatch is paused.'; end if;
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
  select email into destination from auth.users where id=s.owner_user_id;
  if s.status<>'submitted' or s.expires_at is null or s.expires_at<=clock_timestamp()
    or s.owner_user_id is null or s.provider_user_id is null
    or g.owner_id is distinct from s.owner_user_id or s.provider_revision is distinct from r.provider_revision
    or g.admin_archived_at is not null or g.owner_removed_at is not null
    or exists(select 1 from public.account_deletion_requests where actor_id in (s.owner_user_id,s.provider_user_id) and status='requested')
    or nullif(destination,'') is null
    or exists(select 1 from public.service_email_intents newer where newer.submission_id=r.submission_id and newer.event_sequence>r.event_sequence) then
    update public.service_email_intents set state='suppressed',outcome_code='recipient_or_workflow_changed',lease_token=null,locked_until=null,updated_at=clock_timestamp() where id=r.id;
    return null;
  end if;
  select coalesce(nullif(public_display_name,''),nullif(business_name,''),'A service provider') into provider_name
    from public.service_provider_profiles where user_id=s.provider_user_id;
  update public.service_email_intents set state='dispatching',attempt_count=attempt_count+1,updated_at=clock_timestamp() where id=r.id;
  return jsonb_build_object('to',destination,'submissionId',s.id,
    'profileTitle',coalesce(nullif(g.name,''),nullif(g.model,''),'Your Profile'),
    'providerName',coalesce(provider_name,'A service provider'));
end;$$;

create function public.service_email_intent_status(p_intent_id uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
  select jsonb_build_object('id',i.id,'state',i.state,'attempts',i.attempt_count,'updatedAt',i.updated_at,
    'code',i.outcome_code,'canRetry',i.state='failed' and i.attempt_count<6 and s.status='submitted'
      and s.expires_at>now() and s.owner_user_id=g.owner_id and s.provider_user_id is not null and g.admin_archived_at is null and g.owner_removed_at is null
      and not exists(select 1 from public.account_deletion_requests where actor_id in (s.owner_user_id,s.provider_user_id) and status='requested')
      and not exists(select 1 from public.service_email_intents newer where newer.submission_id=s.id and newer.event_sequence>i.event_sequence))
  from public.service_email_intents i join public.service_submissions s on s.id=i.submission_id
    join public.guitars g on g.id=s.guitar_id where i.id=p_intent_id;
$$;
create function public.service_email_submission_status(p_submission_id uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
  select public.service_email_intent_status(id) from public.service_email_intents
    where submission_id=p_submission_id order by event_sequence desc limit 1;
$$;
create function public.service_email_statuses(p_submission_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
  if coalesce(cardinality(p_submission_ids),0)>250 then raise exception 'Too many submissions.'; end if;
  return (select coalesce(jsonb_object_agg(id::text,public.service_email_submission_status(id)),'{}'::jsonb)
    from unnest(p_submission_ids) id);
end;
$$;

-- The service-role HTTP boundary supplies the verified actor/admin decision.
create function public.retry_service_email_intent(p_intent_id uuid,p_actor_id uuid,p_admin boolean,
  p_resolution text default 'retry',p_reason text default '',p_provider_message_id text default null) returns boolean
language plpgsql security definer set search_path=pg_catalog,public as $$
declare i public.service_email_intents; s public.service_submissions; sid uuid; eligible boolean;
begin
  if p_actor_id is null or not exists(select 1 from auth.users where id=p_actor_id) then raise exception 'Sign in required.' using errcode='42501'; end if;
  select submission_id into sid from public.service_email_intents where id=p_intent_id;
  select * into s from public.service_submissions where id=sid for update;
  if not found then raise exception 'Service request unavailable.'; end if;
  select * into i from public.service_email_intents where id=p_intent_id for update;
  if p_admin is not true and s.provider_user_id is distinct from p_actor_id then raise exception 'Provider or administrator required.' using errcode='42501'; end if;
  if p_resolution is null or p_resolution not in ('retry','confirmed_not_accepted','confirmed_accepted') then raise exception 'Invalid resolution.'; end if;
  if p_resolution<>'retry' and (p_admin is not true or i.state<>'unknown' or length(btrim(p_reason))<10) then raise exception 'Unknown delivery requires administrator evidence.'; end if;
  if p_resolution='confirmed_accepted' then
    if nullif(btrim(p_provider_message_id),'') is null or length(p_provider_message_id)>300 then raise exception 'Provider receipt required.'; end if;
    update public.service_email_intents set state='accepted',provider_message_id=p_provider_message_id,outcome_code='operator_confirmed_accepted',updated_at=clock_timestamp() where id=i.id;
  else
    if p_resolution='retry' and (i.state<>'failed' or i.attempt_count>=6) then raise exception 'Delivery cannot be retried.'; end if;
    eligible:=not (s.status<>'submitted' or s.expires_at is null or s.expires_at<=now() or s.provider_user_id is null
      or not exists(select 1 from public.guitars where id=s.guitar_id and owner_id=s.owner_user_id and admin_archived_at is null and owner_removed_at is null)
      or exists(select 1 from public.service_email_intents where submission_id=s.id and event_sequence>i.event_sequence)
      or exists(select 1 from public.account_deletion_requests where actor_id in (s.owner_user_id,s.provider_user_id) and status='requested'));
    if p_resolution='retry' and not eligible then raise exception 'Review is no longer eligible.'; end if;
    update public.service_email_intents set state=case when not eligible then 'suppressed' when attempt_count>=6 then 'failed' else 'retry' end,
      outcome_code=case when not eligible then 'operator_confirmed_not_accepted_closed' when attempt_count>=6 then 'retry_budget_exhausted' else 'operator_requested_retry' end,
      next_attempt_at=clock_timestamp(),updated_at=clock_timestamp() where id=i.id;
  end if;
  insert into public.service_submission_activity(submission_id,actor_user_id,action,note,metadata)
    values(s.id,p_actor_id,'email_reviewed',nullif(left(btrim(p_reason),1000),''),jsonb_build_object('resolution',p_resolution,'intentId',i.id));
  return true;
end;$$;

create function public.settle_service_email_intent(p_intent_id uuid,p_lease_token uuid,p_state text,
  p_provider_message_id text default null,p_retry_after_seconds integer default 60) returns boolean
language plpgsql security definer set search_path=pg_catalog,public as $$
declare r public.service_email_intents; final_state text; delay_seconds integer;
begin
  if p_state is null or p_state not in ('accepted','retry','failed','unknown') or p_retry_after_seconds is null or p_retry_after_seconds not between 60 and 21600
    or (p_state='accepted' and nullif(p_provider_message_id,'') is null)
    or length(p_provider_message_id)>300 then raise exception 'Invalid delivery outcome.'; end if;
  perform 1 from public.service_submissions where id=(select submission_id from public.service_email_intents where id=p_intent_id) for update;
  select * into r from public.service_email_intents where id=p_intent_id for update;
  if not found or r.state<>'dispatching' or r.lease_token is distinct from p_lease_token or r.locked_until<=clock_timestamp() then raise exception 'Email dispatch is not current.'; end if;
  final_state:=case when p_state='retry' and r.attempt_count>=6 then 'failed' else p_state end;
  delay_seconds:=greatest(p_retry_after_seconds,least(21600,(60*power(2,r.attempt_count-1))::integer));
  update public.service_email_intents set state=final_state,provider_message_id=case when final_state='accepted' then p_provider_message_id else null end,
    outcome_code=case when p_state='retry' and final_state='failed' then 'retry_budget_exhausted'
      when final_state='unknown' then 'provider_acceptance_unknown' when final_state='accepted' then 'provider_accepted' else 'provider_rejected' end,
    next_attempt_at=case when final_state='retry' then clock_timestamp()+make_interval(secs=>delay_seconds) else next_attempt_at end,
    lease_token=null,locked_until=null,updated_at=clock_timestamp() where id=r.id;
  update public.service_submissions set email_delivery_status=case when final_state='accepted' then 'sent' else 'failed' end,
    email_delivery_message=case when final_state='accepted' then 'Accepted by the email provider; inbox delivery is not confirmed.'
      when final_state='unknown' then 'Delivery outcome is unknown. An administrator must review it before another email is sent.'
      when final_state='retry' then 'Email was not accepted. A retry is scheduled.' else 'Email was not accepted. Review is required.' end
    where id=r.submission_id and provider_revision=r.provider_revision and not exists(
      select 1 from public.service_email_intents newer where newer.submission_id=r.submission_id and newer.event_sequence>r.event_sequence);
  return true;
end;$$;

-- Aggregate status only. An authenticated Admin route is required before exposing it.
create function public.service_email_outbox_status() returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
  select jsonb_build_object('enabled',(select enabled from public.service_email_outbox_control where singleton),
    'dispatchEnabled',(select dispatch_enabled from public.service_email_outbox_control where singleton),
    'lastSuccessAt',(select last_success_at from public.service_email_outbox_control where singleton),
    'lastFailureAt',(select last_failure_at from public.service_email_outbox_control where singleton),
    'queued',count(*) filter(where state in ('queued','retry')),
    'inFlight',count(*) filter(where state in ('leased','dispatching')),
    'accepted',count(*) filter(where state='accepted'),
    'failed',count(*) filter(where state='failed'),
    'unknown',count(*) filter(where state='unknown'),
    'suppressed',count(*) filter(where state='suppressed'),
    'oldestPendingAt',min(created_at) filter(where state in ('queued','retry')))
  from public.service_email_intents;
$$;
create function public.service_email_worker_heartbeat(p_success boolean) returns boolean
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if p_success is null then raise exception 'Outcome required.'; end if;
  update public.service_email_outbox_control set last_success_at=case when p_success then clock_timestamp() else last_success_at end,
    last_failure_at=case when not p_success then clock_timestamp() else last_failure_at end where singleton;
  return true;
end;$$;
create function public.service_email_admin_status(p_offset integer default 0) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
  select public.service_email_outbox_status() || jsonb_build_object('items',coalesce((select jsonb_agg(item) from (
    select public.service_email_intent_status(i.id)||jsonb_build_object('submissionId',i.submission_id) item
    from public.service_email_intents i where i.state in ('failed','unknown','retry','queued','leased','dispatching')
    order by i.created_at,i.id limit 50 offset greatest(0,p_offset)) rows),'[]'::jsonb));
$$;
revoke all on function public.protect_service_email_cutover(),public.mark_service_email_mode(),public.capture_service_email_intent() from public,anon,authenticated,service_role;
revoke all on function public.claim_service_email_intent(uuid),public.begin_service_email_dispatch(uuid,uuid),
  public.settle_service_email_intent(uuid,uuid,text,text,integer),public.service_email_outbox_status() from public,anon,authenticated;
grant execute on function public.claim_service_email_intent(uuid),public.begin_service_email_dispatch(uuid,uuid),
  public.settle_service_email_intent(uuid,uuid,text,text,integer),public.service_email_outbox_status() to service_role;
revoke all on function public.service_email_intent_status(uuid),public.service_email_submission_status(uuid),public.service_email_statuses(uuid[]),public.retry_service_email_intent(uuid,uuid,boolean,text,text,text),
  public.service_email_worker_heartbeat(boolean),public.service_email_admin_status(integer) from public,anon,authenticated;
grant execute on function public.service_email_intent_status(uuid),public.service_email_submission_status(uuid),public.service_email_statuses(uuid[]),public.retry_service_email_intent(uuid,uuid,boolean,text,text,text),
  public.service_email_worker_heartbeat(boolean),public.service_email_admin_status(integer) to service_role;

-- One scheduler, created inactive. A dedicated Vault secret is never embedded in cron.job.
create function public.queue_service_email_sweep() returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare secret text;
begin
  if not exists(select 1 from public.service_email_outbox_control where singleton and enabled and dispatch_enabled) then return; end if;
  if to_regclass('vault.decrypted_secrets') is null then return; end if;
  execute 'select min(decrypted_secret) from vault.decrypted_secrets where name=''qrguitar_service_email_cron_secret'' having count(*)=1' into secret;
  if secret is null or octet_length(secret) not between 32 and 256 or secret ~ '[[:space:][:cntrl:]]' then return; end if;
  execute 'select net.http_post(url:=$1,headers:=$2,body:=$3,timeout_milliseconds:=55000)'
    using 'https://www.qrguitar.com/api/internal/service-email-sweep',jsonb_build_object('Authorization','Bearer '||secret,'Content-Type','application/json'),'{}'::jsonb;
end;$$;
revoke all on function public.queue_service_email_sweep() from public,anon,authenticated,service_role;
do $scheduler$
declare job bigint;
begin
  if to_regclass('cron.job') is null or not exists(select 1 from pg_namespace where nspname='net') then return; end if;
  if exists(select 1 from cron.job where jobname='qrguitar-service-email-sweep') then raise exception 'Service email scheduler already exists; review before installing.'; end if;
  execute $sql$select cron.schedule('qrguitar-service-email-sweep','*/5 * * * *','select public.queue_service_email_sweep()')$sql$ into job;
  execute 'select cron.alter_job(job_id:=$1,active:=false)' using job;
end;$scheduler$;
create function public.service_email_outbox_readiness() returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
  select jsonb_build_object('version','2026-09-26.service-email.1','ready',
    (select count(*)=2 and bool_and(c.relrowsecurity
      and not has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE')
      and not has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE'))
      from pg_class c where c.oid in ('public.service_email_intents'::regclass,'public.service_email_outbox_control'::regclass))
    and (select count(*)=12 and bool_and(not has_function_privilege('anon',p.oid,'EXECUTE')
      and not has_function_privilege('authenticated',p.oid,'EXECUTE') and p.prosecdef
      and p.proconfig @> array['search_path=pg_catalog, public']) from pg_proc p where p.pronamespace='public'::regnamespace
      and p.proname in ('capture_service_email_intent','mark_service_email_mode','claim_service_email_intent','begin_service_email_dispatch',
        'settle_service_email_intent','service_email_outbox_status','service_email_intent_status','service_email_submission_status',
        'service_email_statuses','retry_service_email_intent','service_email_worker_heartbeat','service_email_admin_status'))
    and (select count(*)=2 from pg_trigger where tgrelid='public.service_submissions'::regclass
      and tgname in ('service_submission_email_mode','service_submission_email_intent') and tgenabled='O')
    and exists(select 1 from public.service_email_outbox_control where singleton));
$$;
revoke all on function public.service_email_outbox_readiness() from public,anon,authenticated;
grant execute on function public.service_email_outbox_readiness() to service_role;
commit;
