begin;
do $profile_metadata_attention_readiness$
declare definition text; source text; next_source text; old_token text; next_token text; manifest jsonb; item jsonb; item_key text; item_value jsonb; outcome jsonb; proc_oid oid;
delta constant jsonb := $metadata_attention_delta${"replaceFingerprints":[{"signature":"public.save_instrument_profile(uuid,uuid,timestamp with time zone,jsonb)","source_hash":"1c891ec2b7556f7cc0de457df89783d1e62c4c284bf0918d882242aabf6a7dfd","arguments":"p_guitar_id uuid, p_owner_id uuid, p_expected_updated_at timestamp with time zone, p_payload jsonb","result":"jsonb","definer":true,"volatility":"v","settings":["search_path=pg_catalog, public"]}],"append":{"fingerprints":[{"signature":"public.read_owner_service_correction_attention(uuid)","source_hash":"1c594cb16647a249958624f0d5425580c86948790af68f1a567a50ee116943b7","arguments":"p_actor_id uuid","result":"jsonb","definer":true,"volatility":"s","settings":["search_path=pg_catalog, public"]}],"serviceFunctions":["public.read_owner_service_correction_attention(uuid)"],"currentFunctionSignatures":["public.save_instrument_profile(uuid,uuid,timestamp with time zone,jsonb)","public.read_owner_service_correction_attention(uuid)"],"currentFunctionNames":["save_instrument_profile","read_owner_service_correction_attention"]},"set":{"releaseVersion":"2026-10-05.5","previousReleaseVersion":"2026-10-05.4","previousReadinessSourceSha256":"5315e486c4f60c7a0f618c3fbd4ead8800c48d4ce846e6a2ddd7cc112fbe0b18","profileMetadataPreservationSourceSha256":"d502f43c5d32347baf8b2d8390fb6d0f8861d6bda8b006b3bdc85e8b25fd22e3","ownerServiceCorrectionAttentionSourceSha256":"c1178b03c4731c00577c816f6c9c55986f0f9235c6ab1a2f9977aa4b89848b68"}}$metadata_attention_delta$::jsonb;
begin
 proc_oid:=to_regprocedure('public.qrguitar_release_readiness()');
 if proc_oid is null then raise exception 'Missing readiness predecessor.';end if;
 select pg_get_functiondef(oid),prosrc into definition,source from pg_proc where oid=proc_oid;
 if encode(sha256(convert_to(replace(source,E'\r\n',E'\n'),'UTF8')),'hex') is distinct from '5315e486c4f60c7a0f618c3fbd4ead8800c48d4ce846e6a2ddd7cc112fbe0b18' or not exists(select 1 from pg_proc where oid=proc_oid and prosecdef and provolatile='s' and prorettype='jsonb'::regtype and proconfig=array['search_path=pg_catalog, public']::text[] and pg_get_userbyid(proowner) not in('anon','authenticated','service_role')) then raise exception 'Unsupported profile-metadata/attention readiness predecessor.';end if;
 if array_length(string_to_array(source,'$manifest$'),1)<>3 then raise exception 'Exact readiness manifest token required.';end if;
 old_token:='$manifest$'||split_part(source,'$manifest$',2)||'$manifest$';
 manifest:=split_part(source,'$manifest$',2)::jsonb;
 if manifest->>'releaseVersion' is distinct from '2026-10-05.4' or jsonb_array_length(manifest->'checks')<>14 then raise exception 'Unsupported readiness manifest predecessor.';end if;
 for item in select value from jsonb_array_elements(delta->'replaceFingerprints') loop
  if (select count(*) from jsonb_array_elements(manifest->'fingerprints') f where f->>'signature'=item->>'signature')<>1 then raise exception 'Exact predecessor function pin required.';end if;
  manifest:=jsonb_set(manifest,'{fingerprints}',(select jsonb_agg(case when f.value->>'signature'=item->>'signature' then item else f.value end order by f.ordinality) from jsonb_array_elements(manifest->'fingerprints') with ordinality f(value,ordinality)));
 end loop;
 for item_key,item_value in select key,value from jsonb_each(delta->'append') loop
  if item_key not in ('fingerprints','serviceFunctions','blockedFunctions','currentFunctionNames','currentFunctionSignatures') or jsonb_typeof(manifest->item_key) is distinct from 'array' then raise exception 'Exact readiness array required.';end if;
  manifest:=jsonb_set(manifest,array[item_key],(manifest->item_key)||item_value);
 end loop;
 if exists(select 1 from jsonb_object_keys(delta->'set') k where k not in ('releaseVersion','previousReleaseVersion','previousReadinessSourceSha256','profileMetadataPreservationSourceSha256','ownerServiceCorrectionAttentionSourceSha256')) then raise exception 'Unsupported readiness metadata field.';end if;
 manifest:=manifest||(delta->'set');
 next_token:='$manifest$'||manifest::text||'$manifest$';
 next_source:=replace(source,old_token,next_token);
 if replace(next_source,next_token,old_token) is distinct from source then raise exception 'Existing readiness guards changed.';end if;
 if (length(definition)-length(replace(definition,source,'')))/length(source)<>1 then raise exception 'Exact readiness function definition required.';end if;
 execute replace(definition,source,next_source);
 outcome:=public.qrguitar_release_readiness();
 if outcome->>'ready' is distinct from 'true' or outcome->>'releaseVersion' is distinct from '2026-10-05.5' or jsonb_array_length(outcome->'checks')<>14 or exists(select 1 from jsonb_array_elements(outcome->'checks') c where c->>'ok' is distinct from 'true') then raise exception 'Profile metadata/attention catalog is not release-ready.';end if;
end
$profile_metadata_attention_readiness$;
notify pgrst,'reload schema';
commit;
