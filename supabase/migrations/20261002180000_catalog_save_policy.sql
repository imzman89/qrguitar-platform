-- UNAPPLIED EXTERNAL SUCCESSOR PROPOSAL; execution disabled; Boss integration only.
-- No automatic collection changes; fresh create honors canonical visibility; edits preserve stored visibility.
begin;

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
  -- The base transaction already saved the supplied visibility. Do not publish or enable a collection here.
  return v_result;
end;
$catalog$;
revoke all on function public.create_catalog_instrument_profile(uuid,text,text,jsonb,boolean,text,text) from public,anon,authenticated;
grant execute on function public.create_catalog_instrument_profile(uuid,text,text,jsonb,boolean,text,text) to service_role;

create function public.save_catalog_instrument_profile(
  p_guitar_id uuid, p_owner_id uuid, p_expected_updated_at timestamptz, p_payload jsonb
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $catalog$
declare
  v_result jsonb;
  v_visibility public.guitar_visibility;
begin
  if jsonb_typeof(p_payload) is distinct from 'object'
      or jsonb_typeof(p_payload->'guitar') is distinct from 'object' then
    raise exception using errcode = '22023', message = 'Invalid profile save request.';
  end if;
  -- Read under the same parent lock used by the base writer, never a client snapshot.
  select visibility into v_visibility from public.guitars
    where id = p_guitar_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'QRguitar Profile was not found.';
  end if;
  if v_visibility is null then
    raise exception using errcode = '22023', message = 'The current Profile visibility needs review.';
  end if;
  -- Ordinary full Save is not a publication operation. Even an old client sending
  -- public must not promote a private or unlisted record. The unchanged base RPC
  -- still checks owner, account, parent/child versions, files, serial and trust.
  v_result := public.save_instrument_profile(p_guitar_id,p_owner_id,p_expected_updated_at,
    jsonb_set(p_payload,'{guitar,visibility}',to_jsonb(v_visibility::text)));
  if v_result->'ok' is distinct from 'true'::jsonb then
    raise exception using errcode = '22023', message = 'The instrument save could not be confirmed.';
  end if;
  -- Deliberately no collection helper/account-settings RPC or collection write.
  return v_result;
end;
$catalog$;
revoke all on function public.save_catalog_instrument_profile(uuid,uuid,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.save_catalog_instrument_profile(uuid,uuid,timestamptz,jsonb) to service_role;

notify pgrst, 'reload schema';
commit;
