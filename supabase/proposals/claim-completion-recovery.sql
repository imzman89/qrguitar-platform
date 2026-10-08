-- PROPOSAL ONLY: apply after action-required-email.sql. No activation or legacy backfill.
begin;
alter table public.ownership_claims add column completion_expected_evidence integer
  check(completion_expected_evidence between 1 and 3);

create function public.guard_claim_completion_intent() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if new.completion_expected_evidence is distinct from old.completion_expected_evidence then
   raise exception 'The original evidence count cannot be changed.' using errcode='22023';
 end if;
 if new.status='approved' and old.status is distinct from new.status
   and new.completion_expected_evidence is not null and not old.action_email_completed then
   raise exception 'Claim submission is incomplete.' using errcode='QC003';
 end if;
 return new;
end;$$;
create trigger claim_completion_intent_guard before update on public.ownership_claims
for each row execute function public.guard_claim_completion_intent();

create function public.complete_ownership_claim_submission(p_claim_id uuid,p_claimant_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare c public.ownership_claims;g public.guitars;actor public.profiles;gid uuid;actual_count integer;
begin
 select guitar_id into gid from public.ownership_claims where id=p_claim_id;
 select * into g from public.guitars where id=gid for update;
 select * into c from public.ownership_claims where id=p_claim_id for update;
 if c.id is null or g.id is null then raise exception 'Request unavailable.' using errcode='QC001';end if;
 if c.claimant_user_id is distinct from p_claimant_id or p_claimant_id is null then
   raise exception 'Claimant required.' using errcode='42501';
 end if;
 select * into actor from public.profiles where id=p_claimant_id for share;
 if actor.id is null or actor.account_status is distinct from 'active'
   or exists(select 1 from public.account_deletion_requests where actor_id=p_claimant_id and status='requested') then
   raise exception 'Account unavailable.' using errcode='42501';
 end if;
 -- A known committed receipt is read-only replay, even after later review/expiry. Never enqueue again.
 if c.action_email_completed then
   return jsonb_build_object('ok',true,'claim_id',c.id,'submission_complete',true,'replayed',true);
 end if;
 if c.completion_expected_evidence is null then raise exception 'Original submission scope is unknown.' using errcode='QC003';end if;
 if c.status not in('awaiting_owner','admin_review') or (c.expires_at is not null and c.expires_at<=clock_timestamp())
   or g.owner_id is distinct from c.current_owner_id or g.admin_archived_at is not null or g.owner_removed_at is not null then
   raise exception 'Request or current ownership changed.' using errcode='QC002';
 end if;
 perform id from public.ownership_claim_evidence where claim_id=c.id for share;
 select count(*) into actual_count from public.ownership_claim_evidence where claim_id=c.id and uploaded_by=p_claimant_id;
 if actual_count<>c.completion_expected_evidence then raise exception 'Original evidence is incomplete.' using errcode='QC003';end if;
 if exists(select 1 from public.ownership_claim_events where claim_id=c.id and action='submitted') then
   raise exception 'Completion history needs operator review.' using errcode='QC003';
 end if;
 insert into public.ownership_claim_events(claim_id,actor_user_id,action,note,metadata)
 values(c.id,p_claimant_id,'submitted','Saved ownership request completed with existing private evidence.',
   jsonb_build_object('evidence_count',c.completion_expected_evidence,'claim_type',c.claim_type,'completion_recovered',true));
 if not (select action_email_completed from public.ownership_claims where id=c.id) then
   raise exception 'Completion was not persisted.' using errcode='QC003';
 end if;
 return jsonb_build_object('ok',true,'claim_id',c.id,'submission_complete',true,'replayed',false);
end;$$;
revoke all on function public.guard_claim_completion_intent() from public,anon,authenticated,service_role;
revoke all on function public.complete_ownership_claim_submission(uuid,uuid) from public,anon,authenticated;
grant execute on function public.complete_ownership_claim_submission(uuid,uuid) to service_role;

-- Cleanup is serialized with completion/approval. Storage cleanup is permitted only after this receipt.
create function public.discard_incomplete_claim_submission(p_claim_id uuid,p_claimant_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare c public.ownership_claims;g public.guitars;gid uuid;actual_count integer;
begin
 select guitar_id into gid from public.ownership_claims where id=p_claim_id;
 select * into g from public.guitars where id=gid for update;
 select * into c from public.ownership_claims where id=p_claim_id for update;
 if c.id is null then return jsonb_build_object('ok',true,'claim_id',p_claim_id,'deleted',false);end if;
 if p_claimant_id is null or c.claimant_user_id is distinct from p_claimant_id then raise exception 'Claimant required.' using errcode='42501';end if;
 if not exists(select 1 from public.profiles where id=p_claimant_id and account_status='active')
   or exists(select 1 from public.account_deletion_requests where actor_id=p_claimant_id and status='requested') then raise exception 'Account unavailable.' using errcode='42501';end if;
 if c.action_email_completed or c.completion_expected_evidence is null or c.status not in('awaiting_owner','admin_review')
   or g.id is null or g.owner_id is distinct from c.current_owner_id
   or exists(select 1 from public.ownership_claim_events where claim_id=c.id and action='submitted') then
   return jsonb_build_object('ok',true,'claim_id',c.id,'deleted',false);
 end if;
 perform id from public.ownership_claim_evidence where claim_id=c.id for share;
 select count(*) into actual_count from public.ownership_claim_evidence where claim_id=c.id and uploaded_by=p_claimant_id;
 if actual_count>=c.completion_expected_evidence then return jsonb_build_object('ok',true,'claim_id',c.id,'deleted',false);end if;
 delete from public.ownership_claims where id=c.id;
 return jsonb_build_object('ok',true,'claim_id',c.id,'deleted',true);
end;$$;
revoke all on function public.discard_incomplete_claim_submission(uuid,uuid) from public,anon,authenticated;
grant execute on function public.discard_incomplete_claim_submission(uuid,uuid) to service_role;
commit;
