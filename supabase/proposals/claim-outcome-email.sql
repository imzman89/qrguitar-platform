-- DISABLED PROPOSAL. Install after action-email-operations.sql, no backfill or activation.
-- Claimant outcomes only. Withdrawal/cancelled and elapsed timestamps are not expiry events.
begin;
do $preflight$
declare ready jsonb;control public.action_email_control;ops public.action_email_operations;
begin
 select * into control from public.action_email_control where singleton for update;
 select * into ops from public.action_email_operations where singleton for update;
 ready:=public.action_email_readiness(null,null);
 if control.singleton is null or ops.singleton is null
   or ready->>'version' is distinct from '2026-09-27.action-email.1' or (ready->>'schemaReady')::boolean is not true
   or control.capture_enabled or control.dispatch_enabled
   or ops.project_url is not null or ops.approved_commit is not null then
   raise exception 'Outcome extension requires the reviewed disabled unbound predecessor; inspect drift before installation.';
 end if;
end;$preflight$;
alter table public.action_email_intents drop constraint action_email_intents_event_type_check;
alter table public.action_email_intents drop constraint action_email_intents_check;
alter table public.action_email_intents add constraint action_email_intents_event_type_check
 check(event_type in('claim.ownerReview','claim.moreInfo','claim.approved','claim.declined','claim.expired','service.revisionRequested'));
alter table public.action_email_intents add constraint action_email_intents_check
 check((claim_id is not null and submission_id is null and event_type in('claim.ownerReview','claim.moreInfo','claim.approved','claim.declined','claim.expired'))
   or (claim_id is null and submission_id is not null and event_type='service.revisionRequested'));

create or replace function public.capture_claim_action_email() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare family text;active boolean;
begin
 if new.action_email_version=old.action_email_version then return new;end if;
 update public.action_email_intents set state='suppressed',outcome_code='source_changed',lease_token=null,locked_until=null,updated_at=clock_timestamp()
   where claim_id=new.id and source_version<>new.action_email_version and state in('queued','retry','leased','failed');
 if old.status in('awaiting_owner','awaiting_claimant','admin_review') and new.status is distinct from old.status then
   family:=case new.status when 'approved' then 'claim.approved' when 'denied' then 'claim.declined' when 'expired' then 'claim.expired' else null end;
 end if;
 if family is null and new.action_email_completed then
   if new.status='awaiting_owner' and (old.status is distinct from new.status or not old.action_email_completed) then family:='claim.ownerReview';
   elsif new.status='awaiting_claimant' and nullif(btrim(new.admin_review_note),'') is not null
     and (old.status is distinct from new.status or old.admin_review_note is distinct from new.admin_review_note) then family:='claim.moreInfo';end if;
 end if;
 if family is null or new.claimant_user_id is null then return new;end if;
 select capture_enabled into active from public.action_email_control where singleton for share;
 if active then insert into public.action_email_intents(claim_id,event_type,source_version) values(new.id,family,new.action_email_version);end if;
 return new;
end;$$;

create or replace function public.action_email_retry_eligible(p_intent_id uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
 select coalesce((select g.id is not null and g.admin_archived_at is null and g.owner_removed_at is null
   and case when i.claim_id is not null then c.action_email_version=i.source_version and c.claimant_user_id is not null and (
     (i.event_type='claim.approved' and c.status='approved' and g.owner_id=c.claimant_user_id)
     or (i.event_type='claim.declined' and c.status='denied')
     or (i.event_type='claim.expired' and c.status='expired')
     or (i.event_type in('claim.ownerReview','claim.moreInfo') and c.action_email_completed
       and (c.expires_at is null or c.expires_at>clock_timestamp()) and g.owner_id is not distinct from c.current_owner_id
       and ((i.event_type='claim.ownerReview' and c.status='awaiting_owner' and c.current_owner_id is not null)
         or (i.event_type='claim.moreInfo' and c.status='awaiting_claimant'))))
   else s.status='changes_requested' and s.action_email_version=i.source_version and s.expires_at>clock_timestamp()
     and s.owner_user_id=g.owner_id and s.owner_user_id is not null and s.provider_user_id is not null end
   and exists(select 1 from auth.users u join public.profiles p on p.id=u.id
     where u.id=r.recipient and p.account_status='active' and nullif(btrim(u.email),'') is not null)
   and (r.other_actor is null or exists(select 1 from public.profiles where id=r.other_actor and account_status='active'))
   and not exists(select 1 from public.account_deletion_requests where actor_id in(r.recipient,r.other_actor) and status='requested')
 from public.action_email_intents i left join public.ownership_claims c on c.id=i.claim_id
 left join public.service_submissions s on s.id=i.submission_id
 left join public.guitars g on g.id=coalesce(c.guitar_id,s.guitar_id)
 cross join lateral(select case when i.event_type='claim.ownerReview' then c.current_owner_id
   when i.claim_id is not null then c.claimant_user_id else s.provider_user_id end recipient,
   case when i.event_type='claim.ownerReview' then c.claimant_user_id
   when i.event_type='claim.moreInfo' then c.current_owner_id
   when i.submission_id is not null then s.owner_user_id else null end other_actor) r
 where i.id=p_intent_id),false);
$$;

create or replace function public.begin_action_email(p_intent_id uuid,p_lease_token uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare i public.action_email_intents;c public.ownership_claims;s public.service_submissions;g public.guitars;
 source_guitar uuid;recipient uuid;destination text;claim uuid;submission uuid;
begin
 if not exists(select 1 from public.action_email_control where singleton and capture_enabled and dispatch_enabled) then raise exception 'Dispatch disabled.';end if;
 select claim_id,submission_id into claim,submission from public.action_email_intents where id=p_intent_id;
 if claim is not null then
   select guitar_id into source_guitar from public.ownership_claims where id=claim;
   select * into g from public.guitars where id=source_guitar for share;
   select * into c from public.ownership_claims where id=claim for update;
 elsif submission is not null then
   select * into s from public.service_submissions where id=submission for update;
   select * into g from public.guitars where id=s.guitar_id for share;
 else raise exception 'Intent unavailable.';end if;
 select * into i from public.action_email_intents where id=p_intent_id for update;
 if not found or i.state<>'leased' or p_lease_token is null or i.lease_token is distinct from p_lease_token or i.locked_until<=clock_timestamp() then raise exception 'Lease is not current.';end if;
 if not public.action_email_retry_eligible(i.id) then
   update public.action_email_intents set state='suppressed',outcome_code='authority_or_workflow_changed',lease_token=null,locked_until=null,updated_at=clock_timestamp() where id=i.id;return null;
 end if;
 recipient:=case when i.event_type='claim.ownerReview' then c.current_owner_id when claim is not null then c.claimant_user_id else s.provider_user_id end;
 select u.email into destination from auth.users u join public.profiles p on p.id=u.id where u.id=recipient and p.account_status='active';
 if nullif(btrim(destination),'') is null then
   update public.action_email_intents set state='suppressed',outcome_code='authority_or_workflow_changed',lease_token=null,locked_until=null,updated_at=clock_timestamp() where id=i.id;return null;
 end if;
 update public.action_email_intents set state='dispatching',attempt_count=attempt_count+1,updated_at=clock_timestamp() where id=i.id;
 return jsonb_build_object('event',i.event_type,'to',destination,'profileTitle',coalesce(nullif(g.name,''),nullif(g.model,''),'Your Profile'),
   'subjectId',coalesce(claim,submission),'qrCode',case when submission is not null or i.event_type='claim.approved' then g.qr_code else null end);
end;$$;

-- Preserve all existing readiness checks; the reviewed release adds exactly three outcome families.
create or replace function public.action_email_readiness(p_project_url text,p_release_sha text) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare schema_ready boolean;bound boolean;controls boolean;ops public.action_email_operations;
begin
 select * into ops from public.action_email_operations where singleton;
 select count(*)=4 and bool_and(c.relrowsecurity
   and not has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE')
   and not has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE')) into schema_ready
   from pg_class c where c.oid in ('public.action_email_intents'::regclass,'public.action_email_control'::regclass,
     'public.action_email_operations'::regclass,'public.action_email_function_manifest'::regclass);
 schema_ready:=schema_ready and (select count(*)=20 and bool_and(p.oid is not null and p.prosecdef
   and p.proconfig @> array['search_path=pg_catalog, public']
   and not has_function_privilege('anon',p.oid,'EXECUTE') and not has_function_privilege('authenticated',p.oid,'EXECUTE')
   and md5(pg_get_functiondef(p.oid))=m.definition_hash)
   from public.action_email_function_manifest m left join pg_proc p on p.oid=to_regprocedure(m.signature));
 schema_ready:=schema_ready and (select count(*)=6 and bool_and(t.oid is not null and not t.tgisinternal and t.tgenabled='O' and t.tgfoid=to_regprocedure(e.fn))
   from (values
     ('public.ownership_claims','claim_action_email_version','public.version_claim_action_email()'),
     ('public.ownership_claims','claim_action_email_capture','public.capture_claim_action_email()'),
     ('public.ownership_claims','claim_completion_intent_guard','public.guard_claim_completion_intent()'),
     ('public.ownership_claim_events','claim_action_email_completed','public.complete_claim_action_email()'),
     ('public.service_submissions','service_action_email_version','public.version_service_action_email()'),
     ('public.service_submissions','service_action_email_capture','public.capture_service_action_email()')) e(rel,name,fn)
   left join pg_trigger t on t.tgrelid=to_regclass(e.rel) and t.tgname=e.name);
 bound:=ops.project_url is not null and ops.approved_commit is not null and ops.project_url=p_project_url and ops.approved_commit=p_release_sha;
 select capture_enabled and dispatch_enabled into controls from public.action_email_control where singleton;
 return jsonb_build_object('version','2026-09-27.action-email.2','ready',coalesce(schema_ready and bound and controls,false),
   'schemaReady',coalesce(schema_ready,false),'destinationBound',coalesce(bound,false),'dispatchEnabled',coalesce(controls,false),
   'lastSuccessAt',ops.last_success_at,'lastFailureAt',ops.last_failure_at);
end;$$;
update public.action_email_function_manifest set definition_hash=md5(pg_get_functiondef(signature::regprocedure))
 where signature in('public.capture_claim_action_email()','public.action_email_retry_eligible(uuid)',
   'public.begin_action_email(uuid,uuid)','public.action_email_readiness(text,text)');
commit;
