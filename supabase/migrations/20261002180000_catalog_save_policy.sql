-- PROPOSAL ONLY. Boss must review and apply to the isolated backend first.
-- No data backfill; historical custody and create replays deliberately remain untouched.
begin;

-- Resolve a chosen collection name and reserve its handle in the existing atomic,
-- versioned account transaction. Never derive a published name from email/Auth metadata.
create function public._ensure_saved_instrument_collection(p_owner_id uuid, p_chosen_name text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $catalog$
declare
  v_profile public.profiles%rowtype;
  v_prior jsonb;
  v_collection jsonb;
  v_name text;
  v_handle text;
  v_base text;
  v_candidate text;
  v_display text;
  v_binding_owner text;
  v_saved jsonb;
  v_attempt integer;
begin
  select * into v_profile from public.profiles where id = p_owner_id for update;
  if not found or v_profile.account_status is distinct from 'active' then
    raise exception using errcode = '42501', message = 'This account cannot save instruments.';
  end if;
  select content_value into v_prior from public.site_content
    where content_key = 'public_collection_owner:' || p_owner_id::text for update;
  if v_prior is not null and (jsonb_typeof(v_prior) is distinct from 'object'
      or (v_prior ? 'ownerId' and v_prior->>'ownerId' is distinct from p_owner_id::text)) then
    raise exception using errcode = '42501', message = 'Collection settings ownership does not match this account.';
  end if;
  -- Existing explicitly chosen names/handles win. Renaming is an Account action,
  -- not a side effect of editing one instrument.
  v_name := regexp_replace(btrim(coalesce(nullif(v_prior->>'publicName', ''), p_chosen_name, '')), '[[:space:]]+', ' ', 'g');
  if char_length(v_name) not between 1 and 80 then
    raise exception using errcode = '22023', message = 'Choose a collection name in Account, then retry this same save.';
  end if;
  v_collection := coalesce(v_prior, '{}'::jsonb) ||
    jsonb_build_object('enabled', true, 'publicName', v_name, 'ownerId', p_owner_id);
  v_display := case when char_length(btrim(coalesce(v_profile.display_name, ''))) between 2 and 80
    then v_profile.display_name else 'Collection' end;
  v_handle := coalesce(v_prior->>'handle', '');
  if v_handle <> '' then
    if char_length(v_handle) not between 3 and 40 or v_handle !~ '^[a-z0-9][a-z0-9-]*$'
        or v_handle is distinct from left(btrim(regexp_replace(lower(btrim(v_handle)), '[^a-z0-9-]+', '-', 'g'), '-'), 40) then
      raise exception using errcode = '22023', message = 'Choose a valid collection link in Account, then retry this same save.';
    end if;
    select content_value->>'ownerId' into v_binding_owner from public.site_content
      where content_key = 'public_collection_handle:' || v_handle;
    if v_prior->'enabled' = 'true'::jsonb and v_prior->>'ownerId' = p_owner_id::text
       and v_binding_owner = p_owner_id::text then
      return v_collection;
    end if;
    -- Existing handles are never silently renamed on a collision.
    begin
      v_saved := public.save_account_settings(p_owner_id, v_display,
        v_collection || jsonb_build_object('handle', v_handle), v_profile.account_settings_version);
    exception when unique_violation then
      raise exception using errcode = '22023', message = 'That collection link is already in use. Choose another in Account before retrying.';
    end;
    return v_saved->'publicCollection';
  end if;
  -- Trim again after truncation: a boundary hyphen must not produce a handle
  -- that the URL cleaner changes on its next read.
  v_base := btrim(left(btrim(regexp_replace(lower(v_name), '[^a-z0-9-]+', '-', 'g'), '-'), 40), '-');
  if char_length(v_base) < 3 then v_base := 'collection'; end if;
  for v_attempt in 0..19 loop
    v_candidate := case when v_attempt = 0 then v_base else
      left(v_base, 21) || '-' || left(encode(sha256(convert_to(p_owner_id::text, 'UTF8')), 'hex'), 12)
      || '-' || v_attempt::text end;
    begin
      -- save_account_settings uniquely reserves the handle and refuses foreign/malformed
      -- bindings. A collision rolls back this subtransaction, including version writes.
      v_saved := public.save_account_settings(p_owner_id, v_display,
        v_collection || jsonb_build_object('handle', v_candidate), v_profile.account_settings_version);
      return v_saved->'publicCollection';
    exception when unique_violation then
      null;
    end;
  end loop;
  raise exception using errcode = '22023', message = 'Could not reserve a collection link. Choose a link in Account before retrying.';
end;
$catalog$;
revoke all on function public._ensure_saved_instrument_collection(uuid,text) from public,anon,authenticated,service_role;

create function public.create_catalog_instrument_profile(
  p_owner_id uuid, p_idempotency_key text, p_upload_id text, p_payload jsonb,
  p_launch_testing_access boolean default false, p_owner_display_name text default null,
  p_billing_environment text default 'live'
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $catalog$
declare
  v_result jsonb;
  v_guitar_id uuid;
begin
  -- Delegate EXACT canonical JSON: hashing, staged-upload ownership, legacy recovery,
  -- QR reservation and five-free/paid-credit consumption are unchanged.
  v_result := public.create_instrument_profile(p_owner_id,p_idempotency_key,p_upload_id,p_payload,
    p_launch_testing_access,p_owner_display_name,p_billing_environment);
  if v_result->'ok' is distinct from 'true'::jsonb then
    raise exception using errcode = 'QG006', message = 'The instrument save could not be confirmed.';
  end if;
  -- A historical replay may now belong to a different owner or custody account.
  -- Return its original receipt; never publish, rename, charge or reassign it.
  if v_result->'alreadyCreated' = 'true'::jsonb then return v_result; end if;
  if v_result->'alreadyCreated' is distinct from 'false'::jsonb then
    raise exception using errcode = 'QG006', message = 'The instrument save needs review.';
  end if;
  select g.id into v_guitar_id from public.instrument_create_receipts r
    join public.guitars g on g.id = r.guitar_id
    where r.owner_id = p_owner_id and r.idempotency_key = p_idempotency_key
      and r.upload_id = p_upload_id and g.owner_id = p_owner_id
      and g.owner_removed_at is null and g.admin_archived_at is null
      and g.qr_code = v_result->>'qrCode' for update of g;
  if not found then raise exception using errcode = '42501', message = 'The new instrument owner could not be confirmed.'; end if;
  perform public._ensure_saved_instrument_collection(p_owner_id,p_payload->>'owner_name');
  update public.guitars set visibility = 'public'::public.guitar_visibility,
    updated_at = clock_timestamp() where id = v_guitar_id;
  return v_result;
end;
$catalog$;
revoke all on function public.create_catalog_instrument_profile(uuid,text,text,jsonb,boolean,text,text) from public,anon,authenticated;
grant execute on function public.create_catalog_instrument_profile(uuid,text,text,jsonb,boolean,text,text) to service_role;

create function public.save_catalog_instrument_profile(
  p_guitar_id uuid, p_owner_id uuid, p_expected_updated_at timestamptz, p_payload jsonb
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $catalog$
declare v_result jsonb;
begin
  -- Preserve full owner/version/file/serial/trust/QR transaction. This is an explicit
  -- full save, not removal, verification-only, transfer, custody or administrative work.
  v_result := public.save_instrument_profile(p_guitar_id,p_owner_id,p_expected_updated_at,
    jsonb_set(p_payload,'{guitar,visibility}','"public"'::jsonb));
  if v_result->'ok' is distinct from 'true'::jsonb then
    raise exception using errcode = '22023', message = 'The instrument save could not be confirmed.';
  end if;
  perform public._ensure_saved_instrument_collection(p_owner_id,p_payload->>'owner_name');
  return v_result;
end;
$catalog$;
revoke all on function public.save_catalog_instrument_profile(uuid,uuid,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.save_catalog_instrument_profile(uuid,uuid,timestamptz,jsonb) to service_role;

notify pgrst, 'reload schema';
commit;
