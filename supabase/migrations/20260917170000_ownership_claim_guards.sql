-- Reviewed claims must obey the same ownership boundaries as direct transfers.
-- Additive: no instruments, evidence, URLs, or historical requests are removed.
create or replace function public.approve_ownership_claim(
  p_claim_id uuid, p_decided_by uuid, p_decision_note text, p_env_admin boolean
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  claim_row public.ownership_claims%rowtype;
  guitar_row public.guitars%rowtype;
  actor_row public.profiles%rowtype;
  claimant_row public.profiles%rowtype;
  target_guitar_id uuid;
  decided_time timestamptz;
  is_admin boolean;
begin
  select guitar_id into target_guitar_id from public.ownership_claims where id = p_claim_id;
  if not found then raise exception using errcode='QC001', message='Ownership request not found.'; end if;
  -- All ownership writers lock the instrument first, then their request.
  select * into guitar_row from public.guitars where id = target_guitar_id for update;
  select * into claim_row from public.ownership_claims where id = p_claim_id for update;
  if guitar_row.id is null or claim_row.id is null or claim_row.guitar_id is distinct from guitar_row.id then
    raise exception using errcode='QC002', message='This ownership request is no longer available.';
  end if;
  select * into actor_row from public.profiles where id = p_decided_by for share;
  if actor_row.id is null or actor_row.account_status is distinct from 'active' then
    raise exception using errcode='42501', message='This account cannot change ownership.';
  end if;
  is_admin := coalesce(p_env_admin, false) or actor_row.role = 'admin';
  -- A lost response may be retried by the original reviewer without moving the instrument again.
  if claim_row.status = 'approved' and claim_row.decided_by = p_decided_by then
    return jsonb_build_object('ok',true,'replayed',true,'claim_id',claim_row.id,
      'guitar_id',claim_row.guitar_id,'new_owner_id',claim_row.claimant_user_id,'approved_at',claim_row.decided_at);
  end if;
  if claim_row.status not in ('awaiting_owner','admin_review') or claim_row.claimant_user_id is null then
    raise exception using errcode='QC002', message='This ownership request is no longer available.';
  end if;
  if not is_admin and (guitar_row.owner_id is distinct from p_decided_by or claim_row.status = 'admin_review') then
    raise exception using errcode='42501', message='Current owner or administrator review is required.';
  end if;
  if is_admin and nullif(btrim(coalesce(p_decision_note,'')),'') is null then
    raise exception using errcode='22023', message='An operator reason is required for the audit trail.';
  end if;
  if guitar_row.admin_archived_at is not null or guitar_row.owner_removed_at is not null
    or guitar_row.owner_id is distinct from claim_row.current_owner_id then
    raise exception using errcode='QC002', message='The Profile or its owner changed. This request cannot be approved.';
  end if;
  decided_time := clock_timestamp();
  if claim_row.expires_at is not null and claim_row.expires_at <= decided_time then
    raise exception using errcode='QC003', message='This ownership request has expired.';
  end if;
  select * into claimant_row from public.profiles where id = claim_row.claimant_user_id for share;
  if claimant_row.id is null or claimant_row.account_status is distinct from 'active' then
    raise exception using errcode='42501', message='The receiving account is unavailable for ownership changes.';
  end if;
  update public.guitars set owner_id=claim_row.claimant_user_id, updated_at=decided_time where id=guitar_row.id;
  update public.ownership_claims set status='approved', decided_at=decided_time, decided_by=p_decided_by,
    admin_review_note=nullif(btrim(coalesce(p_decision_note,'')),''), updated_at=decided_time where id=claim_row.id;
  insert into public.ownership_claim_events(claim_id,actor_user_id,action,note,metadata)
  values(claim_row.id,p_decided_by,'approved',nullif(btrim(coalesce(p_decision_note,'')),''),
    jsonb_build_object('previous_owner_id',guitar_row.owner_id,'new_owner_id',claim_row.claimant_user_id));
  insert into public.guitar_timeline_events(
    guitar_id,event_date,date_precision,event_type,category,title,description,is_public,is_system,created_by_user_id,source_key,created_at,updated_at
  ) values (
    guitar_row.id,decided_time::date,'day','ownership','Ownership','Ownership updated',
    'Ownership was updated after a reviewed request. The permanent QRguitar Profile remained unchanged.',
    true,true,claim_row.claimant_user_id,'ownership-claim:'||claim_row.id::text,decided_time,decided_time
  ) on conflict(guitar_id,source_key) where source_key is not null do nothing;
  return jsonb_build_object('ok',true,'replayed',false,'claim_id',claim_row.id,
    'guitar_id',guitar_row.id,'new_owner_id',claim_row.claimant_user_id,'approved_at',decided_time);
end $$;
revoke all on function public.approve_ownership_claim(uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.approve_ownership_claim(uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.approve_ownership_claim(uuid,uuid,text,boolean) to service_role;
