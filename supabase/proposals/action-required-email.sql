-- Candidate only. No migration, scheduler, backfill, sender or activation.
-- Separate from service.submitted: claim and provider recipients have different authority.
begin;
create table public.action_email_control (
  singleton boolean primary key default true check(singleton),
  capture_enabled boolean not null default false,
  dispatch_enabled boolean not null default false,
  check(not dispatch_enabled or capture_enabled)
);
insert into public.action_email_control default values;
create table public.action_email_intents (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid references public.ownership_claims(id) on delete cascade,
  submission_id uuid references public.service_submissions(id) on delete cascade,
  event_type text not null check(event_type in ('claim.ownerReview','claim.moreInfo','service.revisionRequested')),
  source_version integer not null check(source_version>0),
  state text not null default 'queued' check(state in ('queued','leased','dispatching','retry','accepted','failed','unknown','suppressed')),
  attempt_count integer not null default 0 check(attempt_count between 0 and 6),
  lease_token uuid, locked_until timestamptz,
  next_attempt_at timestamptz not null default now(),
  provider_message_id text, relay_acceptance jsonb, outcome_code text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check((claim_id is not null and submission_id is null and event_type in ('claim.ownerReview','claim.moreInfo'))
     or (claim_id is null and submission_id is not null and event_type='service.revisionRequested')),
  unique(claim_id,source_version),unique(submission_id,source_version),
  constraint action_email_nonaccepted_no_relay
    check(state='accepted' or relay_acceptance is null),
  constraint action_email_accepted_receipt_check check (
    state <> 'accepted'
    or (nullif(btrim(provider_message_id),'') is not null
      and length(provider_message_id)<=300
      and provider_message_id !~ '[[:cntrl:]]'
      and relay_acceptance is null)
    or (provider_message_id is null and relay_acceptance is not null
      and relay_acceptance='{"schema":"qrguitar-zoho-smtp-acceptance/v1","provider":"zoho-smtp","responseCode":250}'::jsonb)
  )
);
create index action_email_ready_idx on public.action_email_intents(next_attempt_at,created_at) where state in ('queued','retry');
alter table public.action_email_control enable row level security;
alter table public.action_email_intents enable row level security;
revoke all on public.action_email_control,public.action_email_intents from public,anon,authenticated,service_role;
alter table public.ownership_claims add column action_email_version integer not null default 0,
  add column action_email_completed boolean not null default false;
alter table public.service_submissions add column action_email_version integer not null default 0;

create function public.version_claim_action_email() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare completed boolean;g public.guitars;
begin
  if tg_op='INSERT' then new.action_email_version:=0;new.action_email_completed:=false;return new;end if;
  if old.status in('approved','denied','expired','cancelled') and new.status=old.status then
    new.action_email_version:=old.action_email_version;new.action_email_completed:=old.action_email_completed;return new;
  end if;
  completed:=old.action_email_completed or (
    (new.action_email_completed or (new.status in('awaiting_owner','awaiting_claimant','admin_review') and old.status is distinct from new.status)
      or (new.status='awaiting_claimant' and old.admin_review_note is distinct from new.admin_review_note))
    and exists(select 1 from public.ownership_claim_events where claim_id=new.id and action='submitted'));
  -- Hold current ownership through commit, not just the API's earlier snapshot.
  -- Concurrent ownership writers may cause a retryable DB conflict, never stale authority.
  if (new.status='denied' and old.status is distinct from new.status)
    or (new.status in('awaiting_owner','admin_review') and (old.status='awaiting_claimant' or (completed and not old.action_email_completed))) then
    select * into g from public.guitars where id=new.guitar_id for share;
    if not found or g.owner_id is distinct from new.current_owner_id or g.admin_archived_at is not null or g.owner_removed_at is not null
      or (new.expires_at is not null and new.expires_at<=clock_timestamp()) then raise exception 'The Profile or claim authority changed.' using errcode='40001';end if;
  end if;
  new.action_email_completed:=completed;
  new.action_email_version:=old.action_email_version + case when
    row(new.status,new.current_owner_id,new.claimant_user_id,new.expires_at,new.admin_review_note,completed)
    is distinct from row(old.status,old.current_owner_id,old.claimant_user_id,old.expires_at,old.admin_review_note,old.action_email_completed)
    then 1 else 0 end;
  return new;
end;$$;
create trigger claim_action_email_version before insert or update on public.ownership_claims
for each row execute function public.version_claim_action_email();

-- Only the post-evidence submitted event establishes initial completion. A failed
-- event/intent transaction leaves the claim available, but cannot announce queued mail.
create function public.complete_claim_action_email() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare c public.ownership_claims; evidence_count integer;
begin
  if new.action<>'submitted' then return new;end if;
  select * into c from public.ownership_claims where id=new.claim_id for update;
  if not found or c.claimant_user_id is null or new.actor_user_id is distinct from c.claimant_user_id then raise exception 'Claim completion authority unavailable.';end if;
  if c.action_email_completed then return new;end if;
  if c.status not in ('awaiting_owner','admin_review') then raise exception 'Claim cannot be completed in this state.';end if;
  if coalesce(new.metadata->>'evidence_count','') !~ '^[1-3]$' then raise exception 'Evidence completion count is required.';end if;
  select count(*) into evidence_count from public.ownership_claim_evidence where claim_id=c.id and uploaded_by=c.claimant_user_id;
  if evidence_count < (new.metadata->>'evidence_count')::integer then raise exception 'Claim evidence is incomplete.';end if;
  update public.ownership_claims set action_email_completed=true where id=c.id;
  return new;
end;$$;
create trigger claim_action_email_completed after insert on public.ownership_claim_events
for each row execute function public.complete_claim_action_email();

create function public.capture_claim_action_email() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare family text; active boolean;
begin
  if new.action_email_version=old.action_email_version then return new;end if;
  update public.action_email_intents set state='suppressed',outcome_code='source_changed',lease_token=null,locked_until=null,updated_at=clock_timestamp()
    where claim_id=new.id and source_version<>new.action_email_version and state in ('queued','retry','leased','failed');
  if not new.action_email_completed then return new;end if;
  if new.status='awaiting_owner' and (old.status is distinct from new.status or not old.action_email_completed) then family:='claim.ownerReview';
  elsif new.status='awaiting_claimant' and nullif(btrim(new.admin_review_note),'') is not null
    and (old.status is distinct from new.status or old.admin_review_note is distinct from new.admin_review_note) then family:='claim.moreInfo';end if;
  if family is null then return new;end if;
  select capture_enabled into active from public.action_email_control where singleton for share;
  if active then insert into public.action_email_intents(claim_id,event_type,source_version) values(new.id,family,new.action_email_version);end if;
  return new;
end;$$;
create trigger claim_action_email_capture after update on public.ownership_claims for each row execute function public.capture_claim_action_email();

create function public.version_service_action_email() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if tg_op='INSERT' then new.action_email_version:=0;return new;end if;
  -- Closed retained service facts must stay stable during privacy pseudonymization.
  if old.status in('approved','declined','cancelled','expired') and new.status=old.status then
    new.action_email_version:=old.action_email_version;return new;
  end if;
  new.action_email_version:=old.action_email_version + case when
    row(new.status,new.owner_user_id,new.provider_user_id,new.expires_at,new.provider_revision,new.owner_review_note)
    is distinct from row(old.status,old.owner_user_id,old.provider_user_id,old.expires_at,old.provider_revision,old.owner_review_note)
    then 1 else 0 end;
  return new;
end;$$;
create trigger service_action_email_version before insert or update on public.service_submissions for each row execute function public.version_service_action_email();
create function public.capture_service_action_email() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare active boolean;
begin
  if new.action_email_version=old.action_email_version then return new;end if;
  update public.action_email_intents set state='suppressed',outcome_code='source_changed',lease_token=null,locked_until=null,updated_at=clock_timestamp()
    where submission_id=new.id and source_version<>new.action_email_version and state in ('queued','retry','leased','failed');
  if new.status<>'changes_requested' or old.status<>'submitted' or nullif(btrim(new.owner_review_note),'') is null then return new;end if;
  select capture_enabled into active from public.action_email_control where singleton for share;
  if active then insert into public.action_email_intents(submission_id,event_type,source_version) values(new.id,'service.revisionRequested',new.action_email_version);end if;
  return new;
end;$$;
create trigger service_action_email_capture after update on public.service_submissions for each row execute function public.capture_service_action_email();

create function public.claim_action_email(p_lease_token uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare claimed public.action_email_intents;
begin
  if p_lease_token is null then raise exception 'Lease required.';end if;
  if not exists(select 1 from public.action_email_control where singleton and capture_enabled and dispatch_enabled) then return null;end if;
  with expired as(select id from public.action_email_intents where state in ('leased','dispatching') and locked_until<=clock_timestamp() order by locked_until,id limit 20 for update skip locked)
  update public.action_email_intents i set state=case when i.state='dispatching' then 'unknown' else 'retry' end,
    outcome_code=case when i.state='dispatching' then 'dispatch_receipt_missing' else 'lease_expired_before_dispatch' end,
    lease_token=null,locked_until=null,updated_at=clock_timestamp() from expired where i.id=expired.id;
  select * into claimed from public.action_email_intents where state in ('queued','retry') and attempt_count<6 and next_attempt_at<=clock_timestamp()
    order by next_attempt_at,created_at,id limit 1 for update skip locked;
  if not found then return null;end if;
  update public.action_email_intents set state='leased',lease_token=p_lease_token,locked_until=clock_timestamp()+interval '120 seconds',updated_at=clock_timestamp() where id=claimed.id;
  return jsonb_build_object('id',claimed.id,'leaseToken',p_lease_token);
end;$$;

create function public.begin_action_email(p_intent_id uuid,p_lease_token uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare i public.action_email_intents;c public.ownership_claims;s public.service_submissions;g public.guitars;
  source_guitar uuid; recipient uuid; other_actor uuid; destination text; eligible boolean:=false; claim uuid; submission uuid;
begin
  if not exists(select 1 from public.action_email_control where singleton and capture_enabled and dispatch_enabled) then raise exception 'Dispatch disabled.';end if;
  select claim_id,submission_id into claim,submission from public.action_email_intents where id=p_intent_id;
  if claim is not null then
    select guitar_id into source_guitar from public.ownership_claims where id=claim;
    -- Match ownership approval's guitar -> claim order. Queue is always last.
    select * into g from public.guitars where id=source_guitar for share;
    select * into c from public.ownership_claims where id=claim for update;
  elsif submission is not null then
    -- Service workflow locks submission before Profile; avoid crossing its order.
    select * into s from public.service_submissions where id=submission for update;
    select * into g from public.guitars where id=s.guitar_id for share;
  else raise exception 'Intent unavailable.';end if;
  select * into i from public.action_email_intents where id=p_intent_id for update;
  if not found or i.state<>'leased' or p_lease_token is null or i.lease_token is distinct from p_lease_token or i.locked_until<=clock_timestamp() then raise exception 'Lease is not current.';end if;
  if claim is not null then
    eligible:=c.action_email_completed and c.action_email_version=i.source_version
      and (c.expires_at is null or c.expires_at>clock_timestamp()) and c.claimant_user_id is not null
      and g.owner_id is not distinct from c.current_owner_id
      and ((i.event_type='claim.ownerReview' and c.status='awaiting_owner' and c.current_owner_id is not null)
        or (i.event_type='claim.moreInfo' and c.status='awaiting_claimant'));
    recipient:=case when i.event_type='claim.ownerReview' then c.current_owner_id else c.claimant_user_id end;
    other_actor:=case when i.event_type='claim.ownerReview' then c.claimant_user_id else c.current_owner_id end;
  else
    eligible:=s.status='changes_requested' and s.action_email_version=i.source_version and s.expires_at>clock_timestamp()
      and s.owner_user_id=g.owner_id and s.owner_user_id is not null and s.provider_user_id is not null;
    recipient:=s.provider_user_id;other_actor:=s.owner_user_id;
  end if;
  select u.email into destination from auth.users u join public.profiles p on p.id=u.id where u.id=recipient and p.account_status='active';
  if eligible is not true or g.id is null or g.admin_archived_at is not null or g.owner_removed_at is not null or nullif(btrim(destination),'') is null
    or (other_actor is not null and not exists(select 1 from public.profiles where id=other_actor and account_status='active'))
    or exists(select 1 from public.account_deletion_requests where actor_id in(recipient,other_actor) and status='requested') then
    update public.action_email_intents set state='suppressed',outcome_code='authority_or_workflow_changed',lease_token=null,locked_until=null,updated_at=clock_timestamp() where id=i.id;return null;
  end if;
  update public.action_email_intents set state='dispatching',attempt_count=attempt_count+1,updated_at=clock_timestamp() where id=i.id;
  return jsonb_build_object('event',i.event_type,'to',destination,'profileTitle',coalesce(nullif(g.name,''),nullif(g.model,''),'Your Profile'),
    'subjectId',coalesce(claim,submission),'qrCode',case when submission is not null then g.qr_code else null end);
end;$$;

drop function if exists public.settle_action_email(uuid,uuid,text,text,integer);
create function public.settle_action_email(p_intent_id uuid,p_lease_token uuid,p_state text,p_provider_message_id text default null,p_relay_acceptance jsonb default null,p_retry_after_seconds integer default 60) returns boolean
language plpgsql security definer set search_path=pg_catalog,public as $$
declare i public.action_email_intents;final_state text;
begin
  if p_state is null or p_state not in('accepted','retry','failed','unknown') or p_retry_after_seconds is null or p_retry_after_seconds not between 60 and 21600
    or (p_state='accepted' and not (
      (nullif(btrim(p_provider_message_id),'') is not null and length(p_provider_message_id)<=300
        and p_provider_message_id !~ '[[:cntrl:]]' and p_relay_acceptance is null)
      or (p_provider_message_id is null and p_relay_acceptance is not null
        and p_relay_acceptance='{"schema":"qrguitar-zoho-smtp-acceptance/v1","provider":"zoho-smtp","responseCode":250}'::jsonb)))
    or (p_state<>'accepted' and p_relay_acceptance is not null) then raise exception 'Invalid outcome.';end if;
  select * into i from public.action_email_intents where id=p_intent_id for update;
  if not found or i.state<>'dispatching' or p_lease_token is null or i.lease_token is distinct from p_lease_token or i.locked_until<=clock_timestamp() then raise exception 'Dispatch receipt is no longer current.';end if;
  final_state:=case when p_state='retry' and i.attempt_count>=6 then 'failed' else p_state end;
  update public.action_email_intents set state=final_state,provider_message_id=case when final_state='accepted' then p_provider_message_id else null end,
    relay_acceptance=case when final_state='accepted' then p_relay_acceptance else null end,
    outcome_code=case when final_state='accepted' then 'provider_accepted' when final_state='unknown' then 'provider_acceptance_unknown' when p_state='retry' and final_state='failed' then 'retry_budget_exhausted' else 'provider_rejected' end,
    next_attempt_at=case when final_state='retry' then clock_timestamp()+make_interval(secs=>greatest(p_retry_after_seconds,least(21600,(60*power(2,i.attempt_count-1))::integer))) else next_attempt_at end,
    lease_token=null,locked_until=null,updated_at=clock_timestamp() where id=i.id;
  return true;
end;$$;

create function public.action_email_status() returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('captureEnabled',(select capture_enabled from public.action_email_control where singleton),
 'dispatchEnabled',(select dispatch_enabled from public.action_email_control where singleton),
 'queued',count(*) filter(where state in('queued','retry')),'unknown',count(*) filter(where state='unknown'),
 'failed',count(*) filter(where state='failed'),'accepted',count(*) filter(where state='accepted'),
 'inFlight',count(*) filter(where state in('leased','dispatching')),'suppressed',count(*) filter(where state='suppressed'),
 'oldestPendingAt',min(created_at) filter(where state in('queued','retry'))) from public.action_email_intents;
$$;
-- Read-only eligibility hints are rechecked after source locks before an operator retry.
create function public.action_email_retry_eligible(p_intent_id uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
 select coalesce((select g.id is not null and g.admin_archived_at is null and g.owner_removed_at is null
   and case when i.claim_id is not null then
     c.action_email_completed and c.action_email_version=i.source_version
     and (c.expires_at is null or c.expires_at>statement_timestamp()) and c.claimant_user_id is not null
     and g.owner_id is not distinct from c.current_owner_id
     and ((i.event_type='claim.ownerReview' and c.status='awaiting_owner' and c.current_owner_id is not null)
       or (i.event_type='claim.moreInfo' and c.status='awaiting_claimant'))
   else s.status='changes_requested' and s.action_email_version=i.source_version and s.expires_at>statement_timestamp()
     and s.owner_user_id=g.owner_id and s.owner_user_id is not null and s.provider_user_id is not null end
   and exists(select 1 from auth.users u join public.profiles p on p.id=u.id
     where u.id=r.recipient and p.account_status='active' and nullif(btrim(u.email),'') is not null)
   and (r.other_actor is null or exists(select 1 from public.profiles where id=r.other_actor and account_status='active'))
   and not exists(select 1 from public.account_deletion_requests where actor_id in(r.recipient,r.other_actor) and status='requested')
 from public.action_email_intents i left join public.ownership_claims c on c.id=i.claim_id
 left join public.service_submissions s on s.id=i.submission_id
 left join public.guitars g on g.id=coalesce(c.guitar_id,s.guitar_id)
 cross join lateral(select case when i.event_type='claim.ownerReview' then c.current_owner_id
   when i.event_type='claim.moreInfo' then c.claimant_user_id else s.provider_user_id end recipient,
   case when i.event_type='claim.ownerReview' then c.claimant_user_id
   when i.event_type='claim.moreInfo' then c.current_owner_id else s.owner_user_id end other_actor) r
 where i.id=p_intent_id),false);
$$;
create function public.action_email_intent_status(p_intent_id uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('id',i.id,'event',i.event_type,'state',i.state,'attempts',i.attempt_count,
   'claimId',i.claim_id,'submissionId',i.submission_id,'updatedAt',i.updated_at,'createdAt',i.created_at,
   'nextAttemptAt',i.next_attempt_at,'code',i.outcome_code,
   'canRetry',i.state='failed' and i.attempt_count<6 and public.action_email_retry_eligible(i.id),
   'canReconcile',i.state='unknown') from public.action_email_intents i where i.id=p_intent_id;
$$;
create function public.action_email_admin_status(p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
 if p_offset is null or p_offset<0 or p_offset>1000000 then raise exception 'Invalid delivery page.' using errcode='22023';end if;
 return public.action_email_status() || jsonb_build_object('offset',p_offset,'limit',50,
   'total',(select count(*) from public.action_email_intents),
   'items',coalesce((select jsonb_agg(item order by created_at,id) from (
     select public.action_email_intent_status(i.id) item,i.created_at,i.id
       from public.action_email_intents i order by i.created_at,i.id limit 50 offset p_offset) rows),'[]'::jsonb));
end;$$;
-- Only a verified server-side administrator can assert external provider evidence.
-- Accepted means provider acceptance, never proof of delivery to an inbox.
create function public.reconcile_action_email(p_intent_id uuid,p_actor_id uuid,p_env_admin boolean,
 p_resolution text,p_reason text,p_provider_message_id text,p_expected_updated_at timestamptz) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare i public.action_email_intents;claim uuid;submission uuid;gid uuid;eligible boolean;actor public.profiles;
begin
 select * into actor from public.profiles where id=p_actor_id for share;
 if actor.id is null or actor.account_status is distinct from 'active'
   or not exists(select 1 from auth.users where id=p_actor_id)
   or (actor.role is distinct from 'admin' and p_env_admin is not true)
   or exists(select 1 from public.account_deletion_requests where actor_id=p_actor_id and status='requested') then
   raise exception 'Active administrator required.' using errcode='42501';end if;
 if p_expected_updated_at is null or p_resolution is null or p_resolution not in('retry','confirmed_accepted','confirmed_not_accepted')
   or p_reason is null or length(btrim(p_reason))<10 or length(p_reason)>1000 or p_reason ~ '[[:cntrl:]]'
   or (p_resolution='confirmed_accepted' and (nullif(btrim(p_provider_message_id),'') is null
     or length(p_provider_message_id)>300 or p_provider_message_id ~ '[[:cntrl:]]'))
   or (p_resolution<>'confirmed_accepted' and p_provider_message_id is not null) then
   raise exception 'Record valid provider evidence without personal information.' using errcode='22023';end if;
 select claim_id,submission_id into claim,submission from public.action_email_intents where id=p_intent_id;
 if claim is not null then
   select guitar_id into gid from public.ownership_claims where id=claim;
   perform 1 from public.guitars where id=gid for share;
   perform 1 from public.ownership_claims where id=claim for update;
 elsif submission is not null then
   select guitar_id into gid from public.service_submissions where id=submission for update;
   perform 1 from public.guitars where id=gid for share;
 else raise exception 'Delivery unavailable.' using errcode='22023';end if;
 select * into i from public.action_email_intents where id=p_intent_id for update;
 if i.id is null or i.updated_at is distinct from p_expected_updated_at then
   raise exception 'Delivery changed. Refresh before reviewing.' using errcode='40001';end if;
 if (p_resolution='retry' and (i.state<>'failed' or i.attempt_count>=6))
   or (p_resolution<>'retry' and i.state<>'unknown') then
   raise exception 'Delivery cannot be reviewed with this resolution.' using errcode='22023';end if;
 if p_resolution='confirmed_accepted' then
   update public.action_email_intents set state='accepted',provider_message_id=btrim(p_provider_message_id),
     outcome_code='operator_confirmed_accepted',lease_token=null,locked_until=null,updated_at=clock_timestamp() where id=i.id;
 else
   eligible:=public.action_email_retry_eligible(i.id);
   if p_resolution='retry' and not eligible then raise exception 'Source is no longer eligible.' using errcode='40001';end if;
   update public.action_email_intents set state=case when not eligible then 'suppressed' when attempt_count>=6 then 'failed' else 'retry' end,
     outcome_code=case when not eligible then 'operator_confirmed_not_accepted_closed' when attempt_count>=6 then 'retry_budget_exhausted' else 'operator_requested_retry' end,
     provider_message_id=null,lease_token=null,locked_until=null,next_attempt_at=clock_timestamp(),updated_at=clock_timestamp() where id=i.id;
 end if;
 insert into public.admin_audit_events(actor_user_id,action,target_type,target_id,reason,metadata)
   values(p_actor_id,'action_email.reviewed','action_email_intent',i.id::text,btrim(p_reason),
     jsonb_build_object('resolution',p_resolution,'previousState',i.state,'event',i.event_type));
 return public.action_email_intent_status(i.id);
end;$$;
revoke all on function public.action_email_retry_eligible(uuid) from public,anon,authenticated,service_role;
revoke all on function public.action_email_intent_status(uuid),public.action_email_admin_status(integer),
 public.reconcile_action_email(uuid,uuid,boolean,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.action_email_intent_status(uuid),public.action_email_admin_status(integer),
 public.reconcile_action_email(uuid,uuid,boolean,text,text,text,timestamptz) to service_role;
-- Decision authority is checked with the same Profile -> claim lock order as approval.
create function public.deny_ownership_claim_current(p_claim_id uuid,p_decided_by uuid,p_decision_note text,p_env_admin boolean) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare c public.ownership_claims;g public.guitars;actor public.profiles;gid uuid;admin boolean;
begin
 select guitar_id into gid from public.ownership_claims where id=p_claim_id;
 select * into g from public.guitars where id=gid for update;
 select * into c from public.ownership_claims where id=p_claim_id for update;
 if c.id is null or g.id is null then raise exception 'Claim unavailable.' using errcode='QC001';end if;
 select * into actor from public.profiles where id=p_decided_by for share;
 if actor.id is null or actor.account_status is distinct from 'active'
   or exists(select 1 from public.account_deletion_requests where actor_id=p_decided_by and status='requested') then raise exception 'Account unavailable.' using errcode='42501';end if;
 admin:=coalesce(p_env_admin,false) or actor.role='admin';
 if c.status='denied' and c.decided_by=p_decided_by then return jsonb_build_object('ok',true,'claim_id',c.id,'replayed',true);end if;
 if c.status not in('awaiting_owner','awaiting_claimant','admin_review') or (c.expires_at is not null and c.expires_at<=clock_timestamp())
   or g.owner_id is distinct from c.current_owner_id or g.admin_archived_at is not null or g.owner_removed_at is not null then raise exception 'Claim or current ownership changed.' using errcode='QC002';end if;
 if not admin and (g.owner_id is distinct from p_decided_by or c.status<>'awaiting_owner') then raise exception 'Current owner review required.' using errcode='42501';end if;
 if admin and nullif(btrim(p_decision_note),'') is null then raise exception 'Operator reason required.' using errcode='22023';end if;
 update public.ownership_claims set status='denied',owner_response_note=nullif(btrim(p_decision_note),''),decided_by=p_decided_by,decided_at=clock_timestamp(),updated_at=clock_timestamp() where id=c.id;
 insert into public.ownership_claim_events(claim_id,actor_user_id,action,note) values(c.id,p_decided_by,'deny',nullif(btrim(p_decision_note),''));
 return jsonb_build_object('ok',true,'claim_id',c.id,'replayed',false);
end;$$;
revoke all on function public.deny_ownership_claim_current(uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.deny_ownership_claim_current(uuid,uuid,text,boolean) to service_role;
revoke all on function public.version_claim_action_email(),public.complete_claim_action_email(),public.capture_claim_action_email(),public.version_service_action_email(),public.capture_service_action_email() from public,anon,authenticated,service_role;
revoke all on function public.claim_action_email(uuid),public.begin_action_email(uuid,uuid),public.settle_action_email(uuid,uuid,text,text,jsonb,integer),public.action_email_status() from public,anon,authenticated;
grant execute on function public.claim_action_email(uuid),public.begin_action_email(uuid,uuid),public.settle_action_email(uuid,uuid,text,text,jsonb,integer),public.action_email_status() to service_role;
commit;
