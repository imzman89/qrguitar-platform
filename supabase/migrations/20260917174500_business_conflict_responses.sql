begin;

-- Expected business conflicts must not use serialization_failure (40001),
-- which hosted PostgREST retries. PT409 returns an HTTP conflict immediately.

create or replace function public.save_instrument_profile(
  p_guitar_id uuid,
  p_owner_id uuid,
  p_expected_updated_at timestamptz,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  guitar_row public.guitars%rowtype;
  document_row public.guitar_documents%rowtype;
  item jsonb;
  item_id uuid;
  media_ids uuid[] := '{}';
  document_ids uuid[] := '{}';
  next_code text;
  next_serial text;
  serial_changed boolean;
  changed_at timestamptz := clock_timestamp();
  old_trust_key text;
  next_trust_key text;
  trust_default jsonb := '{"authenticityStatus":"unconfirmed","showVerificationBadge":true,"showAuthenticityBadge":true,"showSerialPublic":false,"serialExceptionApproved":false,"internalVerificationNote":"","publicVerificationNote":"","internalAuthenticityNote":"","publicAuthenticityNote":""}'::jsonb;
  trust_value jsonb;
begin
  -- Service callers only. Recheck ownership AFTER locking: transfers may finish during uploads.
  if p_owner_id is null or jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'Invalid profile save request.';
  end if;
  select * into guitar_row from public.guitars where id = p_guitar_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'QRguitar Profile was not found.';
  end if;
  if guitar_row.owner_id is distinct from p_owner_id then
    raise exception using errcode = '42501', message = 'Only the current owner can edit this Profile.';
  end if;
  if not exists (select 1 from public.profiles where id = p_owner_id and account_status = 'active') then
    raise exception using errcode = '42501', message = 'This account cannot edit Profiles.';
  end if;
  if guitar_row.owner_removed_at is not null or guitar_row.admin_archived_at is not null then
    raise exception using errcode = '42501', message = 'This Profile is no longer editable.';
  end if;
  if p_expected_updated_at is null or guitar_row.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = 'PT409', message = 'This Profile changed while you were saving. Reload it before trying again.';
  end if;
  if jsonb_typeof(p_payload->'guitar') is distinct from 'object'
     or jsonb_typeof(p_payload->'media') is distinct from 'array'
     or jsonb_typeof(p_payload->'documents') is distinct from 'array'
     or jsonb_typeof(p_payload->'specs') is distinct from 'array'
     or jsonb_typeof(p_payload->'expected_documents') is distinct from 'array'
     or jsonb_typeof(p_payload->'expected_media') is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Incomplete profile save request.';
  end if;
  if jsonb_array_length(p_payload->'media') not between 1 and 20
     or jsonb_array_length(p_payload->'documents') > 10
     or jsonb_array_length(p_payload->'specs') > 100 then
    raise exception using errcode = '22023', message = 'Too many photos, documents, or profile details.';
  end if;
  -- Lock existing child rows before checking their versions. The guitar FOR UPDATE lock also blocks new FK-linked inserts.
  perform 1 from public.guitar_documents where guitar_id = p_guitar_id order by id for update;
  perform 1 from public.guitar_media where guitar_id = p_guitar_id order by id for update;
  -- Detect changes from dedicated file endpoints, which do not necessarily touch guitars.updated_at.
  if (select count(*) from public.guitar_documents where guitar_id = p_guitar_id)
       <> jsonb_array_length(p_payload->'expected_documents')
     or exists (
       select 1 from jsonb_array_elements(p_payload->'expected_documents') e
       where not exists (
         select 1 from public.guitar_documents d
         where d.guitar_id = p_guitar_id and d.id = (e->>'id')::uuid
           and d.updated_at = (e->>'updated_at')::timestamptz
       )
     )
     or (select count(*) from public.guitar_media where guitar_id = p_guitar_id)
       <> jsonb_array_length(p_payload->'expected_media')
     or exists (
       select 1 from jsonb_array_elements(p_payload->'expected_media') e
       where not exists (
         select 1 from public.guitar_media m
         where m.guitar_id = p_guitar_id and m.id = (e->>'id')::uuid
           and m.storage_path = e->>'storage_path' and m.sort_order = (e->>'sort_order')::integer
       )
     ) then
    raise exception using errcode = 'PT409', message = 'Profile files changed while you were saving. Reload it before trying again.';
  end if;

  next_serial := nullif(btrim(p_payload->'guitar'->>'serial_number'), '');
  serial_changed := coalesce(public.normalize_instrument_serial(next_serial), '')
    <> coalesce(public.normalize_instrument_serial(guitar_row.serial_number), '');
  if serial_changed and coalesce((p_payload->>'serial_correction_approved')::boolean, false) is not true then
    raise exception using errcode = '42501', message = 'Serial Number corrections require QRguitar admin approval.';
  end if;
  if next_serial is not null and length(public.normalize_instrument_serial(next_serial)) < 4 then
    raise exception using errcode = '22023', message = 'Serial Number must contain at least four letters or numbers.';
  end if;
  next_code := p_payload->'guitar'->>'qr_code';
  if next_code is distinct from (case
       when serial_changed and next_serial is not null then 'QRG-' || left(public.normalize_instrument_serial(next_serial), 64)
       else guitar_row.qr_code end) then
    raise exception using errcode = '22023', message = 'The QRguitar ID does not match the approved identity.';
  end if;
  if nullif(btrim(p_payload->'guitar'->>'brand'), '') is null
     or nullif(btrim(p_payload->'guitar'->>'model'), '') is null
     or nullif(btrim(p_payload->'guitar'->>'name'), '') is null then
    raise exception using errcode = '22023', message = 'Brand, model, and profile name are required.';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(p_payload->'media') m
    where m->>'storage_path' = p_payload->'guitar'->>'hero_image_path'
  ) then
    raise exception using errcode = '22023', message = 'Choose a main photo from this Profile.';
  end if;

  if next_code <> guitar_row.qr_code then
    insert into public.qr_redirects (guitar_id, old_path, active)
    values (p_guitar_id, '/i/' || guitar_row.qr_code, true)
    on conflict (old_path) do update set active = true
    where public.qr_redirects.guitar_id = excluded.guitar_id;
    if not found then
      raise exception using errcode = '23505', message = 'The previous QR link belongs to another Profile.';
    end if;
  end if;

  update public.guitars set
    qr_code = next_code,
    permanent_path = case when next_code = guitar_row.qr_code then guitar_row.permanent_path else '/i/' || next_code end,
    name = p_payload->'guitar'->>'name', brand = p_payload->'guitar'->>'brand',
    model = p_payload->'guitar'->>'model', year = nullif(p_payload->'guitar'->>'year', ''),
    serial_number = next_serial, no_serial_used = next_serial is null,
    builder = nullif(p_payload->'guitar'->>'builder', ''), location = nullif(p_payload->'guitar'->>'location', ''),
    visibility = (p_payload->'guitar'->>'visibility')::public.guitar_visibility,
    summary = coalesce(p_payload->'guitar'->>'summary', ''),
    hero_image_path = p_payload->'guitar'->>'hero_image_path', updated_at = changed_at
  where id = p_guitar_id;
  -- Existing serial-alias triggers run in this transaction and roll back every write on conflict.

  for item in select value from jsonb_array_elements(p_payload->'media') loop
    item_id := nullif(item->>'id', '')::uuid;
    if nullif(item->>'storage_path', '') is null or length(item->>'storage_path') > 2000 then
      raise exception using errcode = '22023', message = 'Invalid photo path.';
    end if;
    if item_id is null then
      if item->>'storage_path' not like p_owner_id::text || '/' || p_guitar_id::text || '/%'
         and item->>'storage_path' is distinct from guitar_row.hero_image_path then
        raise exception using errcode = '42501', message = 'New photos must be uploaded for this Profile.';
      end if;
      insert into public.guitar_media (guitar_id, storage_path, alt, sort_order)
      values (p_guitar_id, item->>'storage_path', coalesce(item->>'alt', ''), (item->>'sort_order')::integer)
      returning id into item_id;
    else
      update public.guitar_media set alt = coalesce(item->>'alt', ''), sort_order = (item->>'sort_order')::integer
      where id = item_id and guitar_id = p_guitar_id and storage_path = item->>'storage_path';
      if not found then
        raise exception using errcode = 'PT409', message = 'An existing photo changed. Reload this Profile.';
      end if;
    end if;
    if item_id = any(media_ids) then
      raise exception using errcode = '22023', message = 'A photo was submitted more than once.';
    end if;
    media_ids := array_append(media_ids, item_id);
  end loop;
  delete from public.guitar_media where guitar_id = p_guitar_id and not (id = any(media_ids));

  for item in select value from jsonb_array_elements(p_payload->'documents') loop
    item_id := nullif(item->>'id', '')::uuid;
    if nullif(item->>'storage_path', '') is null or length(item->>'storage_path') > 2000
       or nullif(item->>'name', '') is null then
      raise exception using errcode = '22023', message = 'Invalid document.';
    end if;
    if nullif(item->>'related_timeline_event_id', '') is not null and not exists (
      select 1 from public.guitar_timeline_events where id = (item->>'related_timeline_event_id')::uuid and guitar_id = p_guitar_id
    ) then
      raise exception using errcode = '22023', message = 'The related timeline event belongs to another Profile or no longer exists.';
    end if;
    if nullif(item->>'related_service_event_id', '') is not null and not exists (
      select 1 from public.guitar_timeline_events where id = (item->>'related_service_event_id')::uuid and guitar_id = p_guitar_id
    ) then
      raise exception using errcode = '22023', message = 'The related service event belongs to another Profile or no longer exists.';
    end if;
    if item_id is null then
      if item->>'storage_path' not like p_owner_id::text || '/' || p_guitar_id::text || '/%' then
        raise exception using errcode = '42501', message = 'New documents must be uploaded for this Profile.';
      end if;
      insert into public.guitar_documents (guitar_id, storage_path, name, uploaded_by_user_id, file_name, mime_type, file_size_bytes)
      values (p_guitar_id, item->>'storage_path', item->>'name', p_owner_id,
        item->>'name', item->>'mime_type', nullif(item->>'file_size_bytes', '')::bigint)
      returning id into item_id;
    else
      select * into document_row from public.guitar_documents
      where id = item_id and guitar_id = p_guitar_id and storage_path = item->>'storage_path' for update;
      if not found then
        raise exception using errcode = 'PT409', message = 'An existing document changed. Reload this Profile.';
      end if;
    end if;
    if item_id = any(document_ids) then
      raise exception using errcode = '22023', message = 'A document was submitted more than once.';
    end if;
    -- Preserve ID, created_at, original file metadata/uploader and timeline related_document_id.
    update public.guitar_documents set
      name = item->>'name', is_public = coalesce((item->>'is_public')::boolean, false),
      document_type = nullif(item->>'document_type', ''), public_description = nullif(item->>'public_description', ''),
      private_notes = nullif(item->>'private_notes', ''), issuer_source = nullif(item->>'issuer_source', ''),
      document_date = nullif(item->>'document_date', '')::date, description = nullif(item->>'description', ''),
      related_timeline_event_id = nullif(item->>'related_timeline_event_id', '')::uuid,
      related_service_event_id = nullif(item->>'related_service_event_id', '')::uuid, updated_at = changed_at
    where id = item_id;
    document_ids := array_append(document_ids, item_id);
  end loop;
  -- Only explicit removals delete rows. Their FK uses the existing ON DELETE SET NULL.
  -- No Storage file is removed, even after an ambiguous RPC response.
  delete from public.guitar_documents where guitar_id = p_guitar_id and not (id = any(document_ids));

  delete from public.guitar_specs where guitar_id = p_guitar_id;
  for item in select value from jsonb_array_elements(p_payload->'specs') loop
    if nullif(btrim(item->>'label'), '') is null or nullif(btrim(item->>'value'), '') is null then
      raise exception using errcode = '22023', message = 'Invalid profile detail.';
    end if;
    insert into public.guitar_specs (guitar_id, label, value, sort_order)
    values (p_guitar_id, item->>'label', item->>'value', (item->>'sort_order')::integer);
  end loop;

  old_trust_key := 'record_trust:' || guitar_row.qr_code;
  next_trust_key := 'record_trust:' || next_code;
  insert into public.site_content (content_key, content_value)
  values (old_trust_key, trust_default) on conflict (content_key) do nothing;
  select content_value into trust_value from public.site_content where content_key = old_trust_key for update;
  -- Patch only serial visibility; never overwrite admin trust fields with a stale server snapshot.
  if jsonb_typeof(p_payload->'show_serial_public') = 'boolean' then
    trust_value := jsonb_set(trust_value, '{showSerialPublic}', to_jsonb(next_serial is not null and (p_payload->>'show_serial_public')::boolean));
  end if;
  if next_serial is null then
    trust_value := jsonb_set(trust_value, '{showSerialPublic}', 'false'::jsonb);
  end if;
  if next_code <> guitar_row.qr_code and exists (select 1 from public.site_content where content_key = next_trust_key) then
    raise exception using errcode = '23505', message = 'Trust settings already exist for the corrected QRguitar ID. Admin review is required.';
  end if;
  update public.site_content set content_key = next_trust_key, content_value = trust_value, updated_at = changed_at
  where content_key = old_trust_key;
  update public.profiles set display_name = coalesce(nullif(p_payload->>'owner_name', ''), display_name)
  where id = p_owner_id;

  if next_code <> guitar_row.qr_code then
    insert into public.admin_audit_events (actor_user_id, actor_email, action, target_type, target_id, target_user_id, reason, metadata)
    values (p_owner_id, p_payload->>'actor_email', 'serial_correction_qrguitar_id_changed', 'guitar', next_code,
      p_owner_id, 'Approved Serial Number correction',
      jsonb_build_object('oldQrCode', guitar_row.qr_code, 'nextQrCode', next_code, 'serialNumber', next_serial));
  end if;
  return jsonb_build_object('ok', true, 'qrCode', next_code,
    'permanentPath', case when next_code = guitar_row.qr_code then guitar_row.permanent_path else '/i/' || next_code end,
    'updatedAt', changed_at);
end;
$$;

-- PostgreSQL grants new functions to PUBLIC by default; revoke explicitly.
revoke all on function public.save_instrument_profile(uuid, uuid, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.save_instrument_profile(uuid, uuid, timestamptz, jsonb) to service_role;


create or replace function public.commit_service_evidence(
  p_submission_id uuid, p_actor_id uuid, p_is_admin boolean, p_action text, p_evidence jsonb
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_submission public.service_submissions%rowtype;
  v_evidence public.service_submission_evidence%rowtype;
begin
  select * into v_submission from public.service_submissions where id = p_submission_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Service submission was not found.'; end if;
  if p_actor_id is null or exists(select 1 from public.profiles where id=p_actor_id and account_status <> 'active') then
    raise exception using errcode = '42501', message = 'This account cannot make changes.';
  end if;
  if coalesce(p_is_admin,false) is false then
    if v_submission.provider_user_id <> p_actor_id then raise exception using errcode = '42501', message = 'Only the submitting provider can change evidence.'; end if;
    if v_submission.status not in ('draft','changes_requested') then raise exception using errcode = 'PT409', message = 'The submission changed. Reload before editing evidence.'; end if;
  end if;
  if p_action = 'upload' then
    if jsonb_typeof(p_evidence) is distinct from 'object'
      or coalesce(p_evidence->>'file_name','') = ''
      or coalesce(p_evidence->>'mime_type','') not in ('image/jpeg','image/png','image/webp','application/pdf')
      or left(coalesce(p_evidence->>'storage_path',''),char_length(p_submission_id::text || '/' || p_actor_id::text || '/')) <> p_submission_id::text || '/' || p_actor_id::text || '/' then
      raise exception using errcode = '22023', message = 'Invalid evidence metadata.';
    end if;
    insert into public.service_submission_evidence(submission_id,uploaded_by_user_id,evidence_type,file_name,mime_type,file_size_bytes,storage_path)
    values(p_submission_id,p_actor_id,coalesce(p_evidence->>'evidence_type','other'),p_evidence->>'file_name',p_evidence->>'mime_type',(p_evidence->>'file_size_bytes')::bigint,p_evidence->>'storage_path')
    returning * into v_evidence;
    insert into public.service_submission_activity(submission_id,actor_user_id,action,metadata)
    values(p_submission_id,p_actor_id,'evidence_uploaded',jsonb_build_object('evidenceId',v_evidence.id,'type',v_evidence.evidence_type));
  elsif p_action = 'delete' then
    delete from public.service_submission_evidence where id=(p_evidence->>'id')::uuid and submission_id=p_submission_id returning * into v_evidence;
    if not found then raise exception using errcode = 'P0002', message = 'Evidence was not found.'; end if;
    insert into public.service_submission_activity(submission_id,actor_user_id,action,metadata)
    values(p_submission_id,p_actor_id,'evidence_removed',jsonb_build_object('evidenceId',v_evidence.id));
  else
    raise exception using errcode = '22023', message = 'Unsupported evidence action.';
  end if;
  return to_jsonb(v_evidence);
end;
$$;
revoke all on function public.commit_service_evidence(uuid,uuid,boolean,text,jsonb) from public,anon,authenticated;
grant execute on function public.commit_service_evidence(uuid,uuid,boolean,text,jsonb) to service_role;

create or replace function public.save_account_settings(
  p_user_id uuid,
  p_display_name text,
  p_collection jsonb,
  p_expected_version bigint
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_version bigint;
  v_saved jsonb;
begin
  if p_expected_version is null or p_expected_version < 0 or p_expected_version >= 9007199254740991 then
    raise exception 'Invalid account settings version.' using errcode = '22023';
  end if;

  insert into public.profiles(id, display_name)
  values (p_user_id, p_display_name)
  on conflict (id) do nothing;

  select account_settings_version into v_version
  from public.profiles where id = p_user_id for update;
  if v_version is distinct from p_expected_version then
    raise exception 'Account settings changed. Reload your account before saving again.' using errcode = 'PT409';
  end if;

  v_saved := public.save_account_settings(p_user_id, p_display_name, p_collection);
  update public.profiles set account_settings_version = v_version + 1 where id = p_user_id;
  return v_saved || jsonb_build_object('settingsVersion', v_version + 1);
end;
$$;

revoke all on function public.save_account_settings(uuid, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.save_account_settings(uuid, text, jsonb, bigint) from public, anon, authenticated;
grant execute on function public.save_account_settings(uuid, text, jsonb, bigint) to service_role;

notify pgrst, 'reload schema';
commit;
