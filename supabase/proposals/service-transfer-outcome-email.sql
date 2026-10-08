-- DISABLED PROPOSAL. Install after claim-outcome-email.sql. No backfill, sends or activation.
begin;
do $preflight$
declare ready jsonb;control public.action_email_control;ops public.action_email_operations;
begin
 select * into control from public.action_email_control where singleton for update;
 select * into ops from public.action_email_operations where singleton for update;
 ready:=public.action_email_readiness(null,null);
 if control.singleton is null or ops.singleton is null
   or ready->>'version' is distinct from '2026-09-27.action-email.2' or (ready->>'schemaReady')::boolean is not true
   or control.capture_enabled or control.dispatch_enabled or ops.project_url is not null or ops.approved_commit is not null then
   raise exception 'Outcome extension requires the reviewed disabled unbound predecessor; inspect drift before installation.';
 end if;
end;$preflight$;

alter table public.service_submissions add column service_cancel_recipient_role text
 check(service_cancel_recipient_role in('owner','provider'));
alter table public.ownership_transfers add column action_email_version bigint not null default 0;
alter table public.action_email_intents add column transfer_id uuid references public.ownership_transfers(id) on delete cascade;
alter table public.action_email_intents add constraint action_email_transfer_version_unique unique(transfer_id,source_version);
alter table public.action_email_intents drop constraint action_email_intents_event_type_check;
alter table public.action_email_intents drop constraint action_email_intents_check;
alter table public.action_email_intents add constraint action_email_intents_event_type_check
 check(event_type in('claim.ownerReview','claim.moreInfo','claim.approved','claim.declined','claim.expired',
   'service.revisionRequested','service.approved','service.declined','service.cancelled','ownership.transferAccepted','ownership.transferCancelled'));
alter table public.action_email_intents add constraint action_email_intents_check
 check((claim_id is not null and submission_id is null and transfer_id is null and event_type in('claim.ownerReview','claim.moreInfo','claim.approved','claim.declined','claim.expired'))
   or (claim_id is null and submission_id is not null and transfer_id is null and event_type in('service.revisionRequested','service.approved','service.declined','service.cancelled'))
   or (claim_id is null and submission_id is null and transfer_id is not null and event_type in('ownership.transferAccepted','ownership.transferCancelled')));

create function public.guard_service_cancel_recipient() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if tg_op='INSERT' then
   if new.service_cancel_recipient_role is not null then raise exception 'Cancellation recipient requires a committed transition.';end if;
 elsif new.service_cancel_recipient_role is distinct from old.service_cancel_recipient_role
   and not(old.status in('draft','submitted','changes_requested') and new.status='cancelled'
     and old.service_cancel_recipient_role is null) then
   raise exception 'Cancellation recipient cannot be rewritten.';
 end if;
 if new.service_cancel_recipient_role is not null and new.status<>'cancelled' then raise exception 'Cancellation recipient requires cancelled status.';end if;
 return new;
end;$$;
create trigger service_cancel_recipient_guard before insert or update on public.service_submissions
 for each row execute function public.guard_service_cancel_recipient();

create function public.cancel_service_submission(p_submission_id uuid,p_actor_id uuid,p_env_admin boolean default false,p_note text default '') returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare s public.service_submissions;actor public.profiles;provider boolean;recipient uuid;stamp timestamptz:=clock_timestamp();
begin
 select * into s from public.service_submissions where id=p_submission_id for update;
 if s.id is null then raise exception 'Service submission unavailable.' using errcode='22023';end if;
 perform 1 from public.guitars where id=s.guitar_id for share;
 if not found then raise exception 'Profile unavailable.' using errcode='22023';end if;
 select * into actor from public.profiles where id=p_actor_id for share;
 if actor.id is null or actor.account_status is distinct from 'active' or not exists(select 1 from auth.users where id=p_actor_id)
   or exists(select 1 from public.account_deletion_requests where actor_id=p_actor_id and status='requested') then
   raise exception 'Active account required.' using errcode='42501';end if;
 provider:=s.provider_user_id is not distinct from p_actor_id;
 if not provider and actor.role is distinct from 'admin' and p_env_admin is not true then
   raise exception 'Only the provider or an administrator can cancel this submission.' using errcode='42501';end if;
 if s.status='cancelled' then return jsonb_build_object('ok',true,'submission',to_jsonb(s),'alreadyCancelled',true);end if;
 if s.status not in('draft','submitted','changes_requested') then raise exception 'Service submission is already closed.' using errcode='40001';end if;
 if length(coalesce(p_note,''))>2000 then raise exception 'Cancellation note is too long.' using errcode='22023';end if;
 recipient:=case when provider then s.owner_user_id else s.provider_user_id end;
 update public.service_submissions set status='cancelled',cancelled_at=stamp,updated_at=stamp,
   service_cancel_recipient_role=case when provider then 'owner' else 'provider' end where id=s.id returning * into s;
 insert into public.service_submission_activity(submission_id,actor_user_id,action,note)
   values(s.id,p_actor_id,'cancelled',nullif(btrim(p_note),''));
 if recipient is not null then
   insert into public.service_submission_notifications(submission_id,recipient_user_id,notification_type,message)
     values(s.id,recipient,'cancelled','The service submission was cancelled. Nothing was published.');
 end if;
 return jsonb_build_object('ok',true,'submission',to_jsonb(s),'alreadyCancelled',false);
end;$$;

create or replace function public.capture_service_action_email() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare active boolean;family text;
begin
 if new.action_email_version=old.action_email_version then return new;end if;
 update public.action_email_intents set state='suppressed',outcome_code='source_changed',lease_token=null,locked_until=null,updated_at=clock_timestamp()
   where submission_id=new.id and source_version<>new.action_email_version and state in('queued','retry','leased','failed');
 if old.status='submitted' and new.status='changes_requested' and nullif(btrim(new.owner_review_note),'') is not null then family:='service.revisionRequested';
 elsif old.status='submitted' and new.status='approved' then family:='service.approved';
 elsif old.status='submitted' and new.status='declined' then family:='service.declined';
 elsif old.status in('draft','submitted','changes_requested') and new.status='cancelled' and new.service_cancel_recipient_role is not null then family:='service.cancelled';end if;
 if family is null then return new;end if;
 select capture_enabled into active from public.action_email_control where singleton for share;
 if active then insert into public.action_email_intents(submission_id,event_type,source_version) values(new.id,family,new.action_email_version);end if;
 return new;
end;$$;

create function public.version_transfer_action_email() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if tg_op='INSERT' then new.action_email_version:=0;return new;end if;
 -- Privacy pseudonymization must not alter the retained transfer-facts fingerprint.
 if old.status in('accepted','cancelled','expired') and new.status=old.status then new.action_email_version:=old.action_email_version;return new;end if;
 new.action_email_version:=old.action_email_version+case when
   row(new.status,new.from_owner_id,new.to_email,new.accepted_by,new.expires_at) is distinct from
   row(old.status,old.from_owner_id,old.to_email,old.accepted_by,old.expires_at) then 1 else 0 end;
 return new;
end;$$;
create trigger transfer_action_email_version before insert or update on public.ownership_transfers
 for each row execute function public.version_transfer_action_email();
create function public.capture_transfer_action_email() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare active boolean;family text;
begin
 if new.action_email_version=old.action_email_version then return new;end if;
 update public.action_email_intents set state='suppressed',outcome_code='source_changed',lease_token=null,locked_until=null,updated_at=clock_timestamp()
   where transfer_id=new.id and source_version<>new.action_email_version and state in('queued','retry','leased','failed');
 if old.status='sent' then family:=case new.status when 'accepted' then 'ownership.transferAccepted' when 'cancelled' then 'ownership.transferCancelled' else null end;end if;
 if family is null then return new;end if;
 select capture_enabled into active from public.action_email_control where singleton for share;
 if active then insert into public.action_email_intents(transfer_id,event_type,source_version) values(new.id,family,new.action_email_version);end if;
 return new;
end;$$;

create trigger transfer_action_email_capture after update on public.ownership_transfers
 for each row execute function public.capture_transfer_action_email();

-- Resolve recipients only from existing authoritative source/Auth bindings, never a copied address.
create function public.action_email_recipient(p_intent_id uuid) returns uuid
language sql stable security definer set search_path=pg_catalog,public as $$
 select case when i.event_type='claim.ownerReview' then c.current_owner_id when i.claim_id is not null then c.claimant_user_id
   when i.event_type='service.cancelled' then case s.service_cancel_recipient_role when 'owner' then s.owner_user_id when 'provider' then s.provider_user_id end
   when i.submission_id is not null then s.provider_user_id
   when i.event_type='ownership.transferAccepted' then t.from_owner_id
   when i.event_type='ownership.transferCancelled' then
     (select (array_agg(u.id))[1] from auth.users u where nullif(btrim(t.to_email),'') is not null
       and lower(btrim(u.email))=lower(btrim(t.to_email)) and u.email_confirmed_at is not null having count(*)=1)
   end
 from public.action_email_intents i left join public.ownership_claims c on c.id=i.claim_id
 left join public.service_submissions s on s.id=i.submission_id left join public.ownership_transfers t on t.id=i.transfer_id
 where i.id=p_intent_id;
$$;

create or replace function public.action_email_retry_eligible(p_intent_id uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
 select coalesce((select g.id is not null and g.admin_archived_at is null and g.owner_removed_at is null
   and case when i.claim_id is not null then c.action_email_version=i.source_version and c.claimant_user_id is not null and (
     (i.event_type='claim.approved' and c.status='approved' and g.owner_id=c.claimant_user_id)
     or (i.event_type='claim.declined' and c.status='denied') or (i.event_type='claim.expired' and c.status='expired')
     or (i.event_type in('claim.ownerReview','claim.moreInfo') and c.action_email_completed
       and (c.expires_at is null or c.expires_at>clock_timestamp()) and g.owner_id is not distinct from c.current_owner_id
       and ((i.event_type='claim.ownerReview' and c.status='awaiting_owner' and c.current_owner_id is not null)
         or (i.event_type='claim.moreInfo' and c.status='awaiting_claimant'))))
   when i.submission_id is not null then s.action_email_version=i.source_version and (
     (i.event_type='service.revisionRequested' and s.status='changes_requested' and s.expires_at>clock_timestamp()
       and s.owner_user_id=g.owner_id and s.owner_user_id is not null and s.provider_user_id is not null)
     or (i.event_type='service.approved' and s.status='approved') or (i.event_type='service.declined' and s.status='declined')
     or (i.event_type='service.cancelled' and s.status='cancelled' and
       (s.service_cancel_recipient_role='provider' or (s.service_cancel_recipient_role='owner' and s.owner_user_id=g.owner_id))))
   else t.action_email_version=i.source_version and
     ((i.event_type='ownership.transferAccepted' and t.status='accepted') or (i.event_type='ownership.transferCancelled' and t.status='cancelled')) end
   and exists(select 1 from auth.users u join public.profiles p on p.id=u.id
     where u.id=r.recipient and p.account_status='active' and nullif(btrim(u.email),'') is not null)
   and (r.other_actor is null or exists(select 1 from public.profiles where id=r.other_actor and account_status='active'))
   and not exists(select 1 from public.account_deletion_requests where actor_id in(r.recipient,r.other_actor) and status='requested')
 from public.action_email_intents i left join public.ownership_claims c on c.id=i.claim_id
 left join public.service_submissions s on s.id=i.submission_id left join public.ownership_transfers t on t.id=i.transfer_id
 left join public.guitars g on g.id=coalesce(c.guitar_id,s.guitar_id,t.guitar_id)
 cross join lateral(select public.action_email_recipient(i.id) recipient,
   case when i.event_type='claim.ownerReview' then c.claimant_user_id when i.event_type='claim.moreInfo' then c.current_owner_id
   when i.event_type='service.revisionRequested' then s.owner_user_id else null end other_actor) r
 where i.id=p_intent_id),false);
$$;

create or replace function public.begin_action_email(p_intent_id uuid,p_lease_token uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare i public.action_email_intents;c public.ownership_claims;s public.service_submissions;g public.guitars;
 source_guitar uuid;recipient uuid;destination text;claim uuid;submission uuid;transfer uuid;role text;result jsonb;
begin
 if not exists(select 1 from public.action_email_control where singleton and capture_enabled and dispatch_enabled) then raise exception 'Dispatch disabled.';end if;
 select claim_id,submission_id,transfer_id into claim,submission,transfer from public.action_email_intents where id=p_intent_id;
 if claim is not null then
   select guitar_id into source_guitar from public.ownership_claims where id=claim;
   select * into g from public.guitars where id=source_guitar for share;
   select * into c from public.ownership_claims where id=claim for update;
 elsif submission is not null then
   select * into s from public.service_submissions where id=submission for update;
   select * into g from public.guitars where id=s.guitar_id for share;
 elsif transfer is not null then
   select guitar_id into source_guitar from public.ownership_transfers where id=transfer;
   select * into g from public.guitars where id=source_guitar for share;
   perform 1 from public.ownership_transfers where id=transfer for update;
 else raise exception 'Intent unavailable.';end if;
 select * into i from public.action_email_intents where id=p_intent_id for update;
 if not found or i.state<>'leased' or p_lease_token is null or i.lease_token is distinct from p_lease_token or i.locked_until<=clock_timestamp() then raise exception 'Lease is not current.';end if;
 if not public.action_email_retry_eligible(i.id) then
   update public.action_email_intents set state='suppressed',outcome_code='authority_or_workflow_changed',lease_token=null,locked_until=null,updated_at=clock_timestamp() where id=i.id;return null;
 end if;
 recipient:=public.action_email_recipient(i.id);
 select u.email into destination from auth.users u join public.profiles p on p.id=u.id where u.id=recipient and p.account_status='active' for share of u,p;
 -- A concurrent Auth/profile change may have committed while its row lock was awaited.
 if nullif(btrim(destination),'') is null or not public.action_email_retry_eligible(i.id) then
   update public.action_email_intents set state='suppressed',outcome_code='authority_or_workflow_changed',lease_token=null,locked_until=null,updated_at=clock_timestamp() where id=i.id;return null;
 end if;
 if i.event_type in('service.approved','service.declined') then role:='provider';
 elsif i.event_type='service.cancelled' then role:=s.service_cancel_recipient_role;end if;
 update public.action_email_intents set state='dispatching',attempt_count=attempt_count+1,updated_at=clock_timestamp() where id=i.id;
 result:=jsonb_build_object('event',i.event_type,'to',destination,'profileTitle',coalesce(nullif(g.name,''),nullif(g.model,''),'Your Profile'),
   'subjectId',coalesce(claim,submission,transfer),'qrCode',case when role='provider' or i.event_type in('service.revisionRequested','claim.approved') then g.qr_code else null end);
 if role is not null then result:=result||jsonb_build_object('serviceRole',role);end if;
 return result;
end;$$;

create or replace function public.action_email_intent_status(p_intent_id uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('id',i.id,'event',i.event_type,'state',i.state,'attempts',i.attempt_count,
   'claimId',i.claim_id,'submissionId',i.submission_id,'transferId',i.transfer_id,'updatedAt',i.updated_at,'createdAt',i.created_at,
   'nextAttemptAt',i.next_attempt_at,'code',i.outcome_code,
   'canRetry',i.state='failed' and i.attempt_count<6 and public.action_email_retry_eligible(i.id),
   'canReconcile',i.state='unknown') from public.action_email_intents i where i.id=p_intent_id;
$$;

-- Same operator evidence rules; transfer source locks match the committed guitar -> transfer workflow.
create or replace function public.reconcile_action_email(p_intent_id uuid,p_actor_id uuid,p_env_admin boolean,
 p_resolution text,p_reason text,p_provider_message_id text,p_expected_updated_at timestamptz) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare i public.action_email_intents;claim uuid;submission uuid;transfer uuid;gid uuid;eligible boolean;actor public.profiles;
begin
 select * into actor from public.profiles where id=p_actor_id for share;
 if actor.id is null or actor.account_status is distinct from 'active' or not exists(select 1 from auth.users where id=p_actor_id)
   or (actor.role is distinct from 'admin' and p_env_admin is not true)
   or exists(select 1 from public.account_deletion_requests where actor_id=p_actor_id and status='requested') then
   raise exception 'Active administrator required.' using errcode='42501';end if;
 if p_expected_updated_at is null or p_resolution is null or p_resolution not in('retry','confirmed_accepted','confirmed_not_accepted')
   or p_reason is null or length(btrim(p_reason))<10 or length(p_reason)>1000 or p_reason ~ '[[:cntrl:]]'
   or (p_resolution='confirmed_accepted' and (nullif(btrim(p_provider_message_id),'') is null
     or length(p_provider_message_id)>300 or p_provider_message_id ~ '[[:cntrl:]]'))
   or (p_resolution<>'confirmed_accepted' and p_provider_message_id is not null) then
   raise exception 'Record valid provider evidence without personal information.' using errcode='22023';end if;
 select claim_id,submission_id,transfer_id into claim,submission,transfer from public.action_email_intents where id=p_intent_id;
 if claim is not null then
   select guitar_id into gid from public.ownership_claims where id=claim;
   perform 1 from public.guitars where id=gid for share;perform 1 from public.ownership_claims where id=claim for update;
 elsif submission is not null then
   select guitar_id into gid from public.service_submissions where id=submission for update;perform 1 from public.guitars where id=gid for share;
 elsif transfer is not null then
   select guitar_id into gid from public.ownership_transfers where id=transfer;
   perform 1 from public.guitars where id=gid for share;perform 1 from public.ownership_transfers where id=transfer for update;
 else raise exception 'Delivery unavailable.' using errcode='22023';end if;
 select * into i from public.action_email_intents where id=p_intent_id for update;
 if i.id is null or i.updated_at is distinct from p_expected_updated_at then raise exception 'Delivery changed. Refresh before reviewing.' using errcode='40001';end if;
 if (p_resolution='retry' and (i.state<>'failed' or i.attempt_count>=6)) or (p_resolution<>'retry' and i.state<>'unknown') then
   raise exception 'Delivery cannot be reviewed with this resolution.' using errcode='22023';end if;
 if p_resolution='confirmed_accepted' then
   update public.action_email_intents set state='accepted',provider_message_id=btrim(p_provider_message_id),outcome_code='operator_confirmed_accepted',lease_token=null,locked_until=null,updated_at=clock_timestamp() where id=i.id;
 else
   eligible:=public.action_email_retry_eligible(i.id);
   if p_resolution='retry' and not eligible then raise exception 'Source is no longer eligible.' using errcode='40001';end if;
   update public.action_email_intents set state=case when not eligible then 'suppressed' when attempt_count>=6 then 'failed' else 'retry' end,
     outcome_code=case when not eligible then 'operator_confirmed_not_accepted_closed' when attempt_count>=6 then 'retry_budget_exhausted' else 'operator_requested_retry' end,
     provider_message_id=null,lease_token=null,locked_until=null,next_attempt_at=clock_timestamp(),updated_at=clock_timestamp() where id=i.id;
 end if;
 insert into public.admin_audit_events(actor_user_id,action,target_type,target_id,reason,metadata)
   values(p_actor_id,'action_email.reviewed','action_email_intent',i.id::text,btrim(p_reason),jsonb_build_object('resolution',p_resolution,'previousState',i.state,'event',i.event_type));
 return public.action_email_intent_status(i.id);
end;$$;

revoke all on function public.guard_service_cancel_recipient(),public.version_transfer_action_email(),public.capture_transfer_action_email(),
 public.action_email_recipient(uuid),public.cancel_service_submission(uuid,uuid,boolean,text) from public,anon,authenticated,service_role;
grant execute on function public.cancel_service_submission(uuid,uuid,boolean,text) to service_role;

create or replace function public.action_email_readiness(p_project_url text,p_release_sha text) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare schema_ready boolean;bound boolean;controls boolean;ops public.action_email_operations;
begin
 select * into ops from public.action_email_operations where singleton;
 select count(*)=4 and bool_and(c.relrowsecurity
   and not has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') and not has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE')) into schema_ready
   from pg_class c where c.oid in('public.action_email_intents'::regclass,'public.action_email_control'::regclass,'public.action_email_operations'::regclass,'public.action_email_function_manifest'::regclass);
 schema_ready:=schema_ready and(select count(*)=25 and bool_and(p.oid is not null and p.prosecdef and p.proconfig @> array['search_path=pg_catalog, public']
   and not has_function_privilege('anon',p.oid,'EXECUTE') and not has_function_privilege('authenticated',p.oid,'EXECUTE')
   and md5(pg_get_functiondef(p.oid))=m.definition_hash)
   from public.action_email_function_manifest m left join pg_proc p on p.oid=to_regprocedure(m.signature));
 schema_ready:=schema_ready and(select count(*)=9 and bool_and(t.oid is not null and not t.tgisinternal and t.tgenabled='O' and t.tgfoid=to_regprocedure(e.fn))
   from(values
     ('public.ownership_claims','claim_action_email_version','public.version_claim_action_email()'),
     ('public.ownership_claims','claim_action_email_capture','public.capture_claim_action_email()'),
     ('public.ownership_claims','claim_completion_intent_guard','public.guard_claim_completion_intent()'),
     ('public.ownership_claim_events','claim_action_email_completed','public.complete_claim_action_email()'),
     ('public.service_submissions','service_action_email_version','public.version_service_action_email()'),
     ('public.service_submissions','service_action_email_capture','public.capture_service_action_email()'),
     ('public.service_submissions','service_cancel_recipient_guard','public.guard_service_cancel_recipient()'),
     ('public.ownership_transfers','transfer_action_email_version','public.version_transfer_action_email()'),
     ('public.ownership_transfers','transfer_action_email_capture','public.capture_transfer_action_email()'))e(rel,name,fn)
   left join pg_trigger t on t.tgrelid=to_regclass(e.rel) and t.tgname=e.name);
 bound:=ops.project_url is not null and ops.approved_commit is not null and ops.project_url=p_project_url and ops.approved_commit=p_release_sha;
 select capture_enabled and dispatch_enabled into controls from public.action_email_control where singleton;
 return jsonb_build_object('version','2026-09-27.action-email.3','ready',coalesce(schema_ready and bound and controls,false),
   'schemaReady',coalesce(schema_ready,false),'destinationBound',coalesce(bound,false),'dispatchEnabled',coalesce(controls,false),
   'lastSuccessAt',ops.last_success_at,'lastFailureAt',ops.last_failure_at);
end;$$;
update public.action_email_function_manifest set definition_hash=md5(pg_get_functiondef(signature::regprocedure))
 where signature in('public.capture_service_action_email()','public.action_email_retry_eligible(uuid)','public.begin_action_email(uuid,uuid)',
   'public.reconcile_action_email(uuid,uuid,boolean,text,text,text,timestamptz)','public.action_email_intent_status(uuid)','public.action_email_readiness(text,text)');
insert into public.action_email_function_manifest(signature,definition_hash)
 select signature,md5(pg_get_functiondef(signature::regprocedure)) from(values
   ('public.guard_service_cancel_recipient()'),('public.version_transfer_action_email()'),('public.capture_transfer_action_email()'),
   ('public.action_email_recipient(uuid)'),('public.cancel_service_submission(uuid,uuid,boolean,text)'))v(signature);
commit;
