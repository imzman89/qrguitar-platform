-- Owner display controls and collection tombstones must serialize with edits and transfers.
-- Requires core Profile/history, account controls, and archive columns. No hard deletes.
create or replace function public.update_instrument_controls(
  p_actor_id uuid,p_qr_code text,p_action text,p_payload jsonb,p_env_admin boolean
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare g public.guitars%rowtype; actor public.profiles%rowtype; actor_email text; is_admin boolean;
  trust_key text; raw_trust jsonb; trust jsonb; next_trust jsonb; next_status public.guitar_status;
  field text; changed_at timestamptz:=clock_timestamp(); changed boolean; reason text;
  defaults jsonb:='{"authenticityStatus":"unconfirmed","showVerificationBadge":true,"showAuthenticityBadge":true,"showSerialPublic":false,"serialExceptionApproved":false,"internalVerificationNote":"","publicVerificationNote":"","internalAuthenticityNote":"","publicAuthenticityNote":""}';
begin
  if nullif(btrim(p_qr_code),'') is null or p_action is null or p_action not in ('verification','remove_from_collection')
    or jsonb_typeof(p_payload) is distinct from 'object' then raise exception using errcode='22023',message='Invalid Profile control request.'; end if;
  select * into g from public.guitars where qr_code=upper(btrim(p_qr_code)) for update;
  if not found then raise exception using errcode='QC001',message='QRguitar Profile was not found.'; end if;
  select lower(btrim(email)) into actor_email from auth.users where id=p_actor_id for share;
  if not found then raise exception using errcode='42501',message='Sign in required.'; end if;
  -- Missing profiles are not rewritten into active defaults. Only a known active account can mutate controls.
  select * into actor from public.profiles where id=p_actor_id for update;
  if actor.id is null or actor.account_status is distinct from 'active' then
    raise exception using errcode='42501',message='This account cannot change Profiles.';
  end if;
  is_admin:=coalesce(p_env_admin,false) or actor.role='admin';
  if p_action='remove_from_collection' and g.owner_id is distinct from p_actor_id
    or p_action='verification' and g.owner_id is distinct from p_actor_id and not is_admin then
    raise exception using errcode='42501',message='Only the current owner or authorized QRguitar admin can change this Profile.';
  end if;
  if p_action='remove_from_collection' and g.owner_removed_at is not null then
    return jsonb_build_object('ok',true,'replayed',true,'qrCode',g.qr_code,'permanentPath',g.permanent_path,'removed',true);
  end if;
  if g.owner_removed_at is not null or g.admin_archived_at is not null then
    raise exception using errcode='QC002',message='This Profile is no longer editable.';
  end if;
  trust_key:='record_trust:'||g.qr_code;
  select content_value into raw_trust from public.site_content where content_key=trust_key for update;
  if raw_trust is not null and jsonb_typeof(raw_trust) is distinct from 'object' then
    raise exception using errcode='QC003',message='Profile trust settings need review before this change.';
  end if;
  trust:=defaults||coalesce(raw_trust,'{}'::jsonb);
  trust:=trust||jsonb_build_object(
    'authenticityStatus',case when raw_trust->>'authenticityStatus'='confirmed' then 'confirmed' else 'unconfirmed' end,
    'showVerificationBadge',raw_trust->'showVerificationBadge' is distinct from 'false'::jsonb,
    'showAuthenticityBadge',raw_trust->'showAuthenticityBadge' is distinct from 'false'::jsonb,
    'showSerialPublic',raw_trust is not null and raw_trust->'showSerialPublic' is distinct from 'false'::jsonb,
    'serialExceptionApproved',coalesce(raw_trust->'serialExceptionApproved'='true'::jsonb,false));
  foreach field in array array['internalVerificationNote','publicVerificationNote','internalAuthenticityNote','publicAuthenticityNote'] loop
    trust:=jsonb_set(trust,array[field],to_jsonb(btrim(coalesce(raw_trust->>field,''))));
  end loop;
  if p_action='remove_from_collection' then
    if g.status='verified' or trust->>'authenticityStatus'='confirmed' then
      raise exception using errcode='42501',message='Verified and authenticity-confirmed Profiles are preserved for provenance. Transfer ownership or contact QRguitar support for permanent removal.';
    end if;
    reason:=left(btrim(coalesce(p_payload->>'reason','')),1000);
    changed_at:=clock_timestamp();
    update public.guitars set owner_removed_at=changed_at,owner_removed_by=p_actor_id,
      owner_removed_reason=coalesce(nullif(reason,''),'Owner permanently deleted Profile from dashboard.'),
      visibility='private',updated_at=changed_at where id=g.id returning * into g;
    insert into public.admin_audit_events(actor_user_id,actor_email,action,target_type,target_id,target_user_id,reason,metadata)
    values(p_actor_id,actor_email,'record_removed_from_collection','guitar',g.qr_code,p_actor_id,nullif(reason,''),jsonb_build_object('qrCode',g.qr_code));
    return jsonb_build_object('ok',true,'replayed',false,'qrCode',g.qr_code,'permanentPath',g.permanent_path,'removed',true);
  end if;
  next_trust:=trust;next_status:=g.status;
  foreach field in array array['showVerificationBadge','showAuthenticityBadge','showSerialPublic'] loop
    if p_payload?field then
      if jsonb_typeof(p_payload->field)<>'boolean' then raise exception using errcode='22023',message='Display preferences must be true or false.'; end if;
      next_trust:=jsonb_set(next_trust,array[field],p_payload->field);
    end if;
  end loop;
  if is_admin then
    if p_payload?'verificationStatus' then
      if p_payload->>'verificationStatus' not in ('verified','unverified') or jsonb_typeof(p_payload->'verificationStatus')<>'string' then
        raise exception using errcode='22023',message='Invalid verification status.';
      end if;
      next_status:=(p_payload->>'verificationStatus')::public.guitar_status;
    end if;
    if p_payload?'authenticityStatus' then
      if p_payload->>'authenticityStatus' not in ('confirmed','unconfirmed') or jsonb_typeof(p_payload->'authenticityStatus')<>'string' then
        raise exception using errcode='22023',message='Invalid authenticity status.';
      end if;
      next_trust:=jsonb_set(next_trust,'{authenticityStatus}',p_payload->'authenticityStatus');
    end if;
    if p_payload?'serialExceptionApproved' then
      if jsonb_typeof(p_payload->'serialExceptionApproved')<>'boolean' then raise exception using errcode='22023',message='Invalid serial exception preference.'; end if;
      next_trust:=jsonb_set(next_trust,'{serialExceptionApproved}',p_payload->'serialExceptionApproved');
    end if;
    foreach field in array array['internalVerificationNote','publicVerificationNote','internalAuthenticityNote','publicAuthenticityNote'] loop
      if p_payload?field then
        if jsonb_typeof(p_payload->field)<>'string' then raise exception using errcode='22023',message='Verification notes must be text.'; end if;
        next_trust:=jsonb_set(next_trust,array[field],to_jsonb(btrim(p_payload->>field)));
      end if;
    end loop;
    if nullif(btrim(g.serial_number),'') is null and next_trust->'serialExceptionApproved'<>'true'::jsonb
      and (next_status='verified' or next_trust->>'authenticityStatus'='confirmed') then
      raise exception using errcode='22023',message='Profiles without a Serial Number require a QRguitar serial exception before verification or authenticity confirmation.';
    end if;
  end if;
  changed:=g.status is distinct from next_status or trust is distinct from next_trust;
  if changed then
    changed_at:=clock_timestamp();
    update public.guitars set status=next_status,updated_at=changed_at where id=g.id returning * into g;
    insert into public.site_content(content_key,content_value,updated_at) values(trust_key,next_trust,changed_at)
      on conflict(content_key) do update set content_value=excluded.content_value,updated_at=excluded.updated_at;
  end if;
  return jsonb_build_object('ok',true,'replayed',not changed,'qrCode',g.qr_code,'permanentPath',g.permanent_path,
    'verificationStatus',case when g.status='verified' then 'verified' else 'unverified' end,'trust',next_trust);
end $$;
revoke all on function public.update_instrument_controls(uuid,text,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.update_instrument_controls(uuid,text,text,jsonb,boolean) to service_role;
notify pgrst,'reload schema';

