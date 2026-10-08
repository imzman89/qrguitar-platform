begin;

-- Definition-only additive proposal: no existing customer rows are updated during installation.

create function public._member_require_business_message_consent(p_target_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public as $consent$
declare profile public.profiles; settings jsonb; mapping jsonb;
begin
  select * into profile from public.profiles where id=p_target_id for share;
  select content_value into settings from public.site_content where content_key='public_collection_owner:'||p_target_id::text for share;
  if coalesce(settings->>'accountType','') in ('shop','builder','brand') or profile.role::text in ('shop','builder') then
    if profile.id is null or profile.account_status<>'active' or profile.hide_public_content
      or settings->'enabled' is distinct from 'true'::jsonb or settings->'allowMessages' is distinct from 'true'::jsonb
      or nullif(btrim(settings->>'publicName'),'') is null
      or nullif(settings->>'handle','') is null
      or settings ? 'ownerId' and settings->>'ownerId' is distinct from p_target_id::text then
      raise exception using errcode='MM403',message='This business is not accepting messages.';
    end if;
    select content_value into mapping from public.site_content where content_key='public_collection_handle:'||(settings->>'handle') for share;
    if mapping->>'ownerId' is distinct from p_target_id::text then
      raise exception using errcode='MM403',message='This business is not accepting messages.';
    end if;
  end if;
end $consent$;
revoke all on function public._member_require_business_message_consent(uuid) from public,anon,authenticated,service_role;

do $patch$
declare source text; configuration text[]; definer boolean; definition text;
begin
 select prosrc,proconfig,prosecdef,replace(pg_get_functiondef(oid),E'\r\n',E'\n') into source,configuration,definer,definition
   from pg_proc where oid='public.save_account_settings(uuid,text,jsonb,bigint)'::regprocedure;
 if encode(sha256(convert_to(replace(source,E'\r\n',E'\n'),'UTF8')),'hex') is distinct from '1beee0b381bf308147d8e0afee278040196d18cf42fd8aea15e1607800b86c42'
   or not definer or configuration is distinct from array['search_path=pg_catalog, public'] then
   raise exception 'Unsupported predecessor: save_account_settings(uuid,text,jsonb,bigint)';
 end if;
 execute replace(definition,$before$begin
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

  v_saved := public.save_account_settings(p_user_id, p_display_name, p_collection);$before$,$after$  v_prior jsonb;
  v_help boolean;
  v_url text;
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

  if p_collection is not null then
    select content_value into v_prior from public.site_content
      where content_key = 'public_collection_owner:' || p_user_id::text for update;
    if p_collection ? 'allowWarrantyHelp' and jsonb_typeof(p_collection->'allowWarrantyHelp') is distinct from 'boolean'
      or p_collection ? 'warrantyHelpUrl' and jsonb_typeof(p_collection->'warrantyHelpUrl') is distinct from 'string' then
      raise exception 'Invalid warranty assistance settings.' using errcode = '22023';
    end if;
    v_help := case when p_collection ? 'allowWarrantyHelp' then (p_collection->>'allowWarrantyHelp')::boolean
      else coalesce(v_prior->'allowWarrantyHelp' = 'true'::jsonb, false) end;
    v_url := btrim(coalesce(case when p_collection ? 'warrantyHelpUrl' then p_collection->>'warrantyHelpUrl'
      else v_prior->>'warrantyHelpUrl' end, ''));
    if v_url <> '' and (char_length(v_url) > 500 or v_url ~ '[[:space:]]' or position(chr(92) in v_url) > 0
      or v_url !~ '^https://([A-Za-z0-9.-]+|\[[0-9A-Fa-f:]+\])(:[0-9]{1,5})?(/|[?#]|$)') or v_help and v_url = '' then
      raise exception 'Use an HTTPS warranty assistance address.' using errcode = '22023';
    end if;
  end if;
  v_saved := public.save_account_settings(p_user_id, p_display_name, p_collection);
  if p_collection is not null then
    update public.site_content set content_value = content_value ||
      jsonb_build_object('allowWarrantyHelp', v_help, 'warrantyHelpUrl', v_url)
      where content_key = 'public_collection_owner:' || p_user_id::text returning content_value into v_prior;
    if not found then raise exception 'Could not confirm assistance settings.' using errcode = 'P0002'; end if;
    v_saved := jsonb_set(v_saved, '{publicCollection}', v_prior);
  end if;$after$);
end $patch$;

do $patch$
declare source text; configuration text[]; definer boolean; definition text;
begin
 select prosrc,proconfig,prosecdef,replace(pg_get_functiondef(oid),E'\r\n',E'\n') into source,configuration,definer,definition
   from pg_proc where oid='public._member_assert_conversation(uuid,uuid,boolean)'::regprocedure;
 if encode(sha256(convert_to(replace(source,E'\r\n',E'\n'),'UTF8')),'hex') is distinct from 'd61c00931453a84b8ed00032d83ce06e2db170b0141608b4dd0dd1e911862798'
   or not definer or configuration is distinct from array['search_path=pg_catalog, public'] then
   raise exception 'Unsupported predecessor: _member_assert_conversation(uuid,uuid,boolean)';
 end if;
 execute replace(definition,$before$    if exists(select 1 from public.member_message_blocks where$before$,$after$    perform public._member_require_business_message_consent(other_id);
    if exists(select 1 from public.member_message_blocks where$after$);
end $patch$;

do $patch$
declare source text; configuration text[]; definer boolean; definition text;
begin
 select prosrc,proconfig,prosecdef,replace(pg_get_functiondef(oid),E'\r\n',E'\n') into source,configuration,definer,definition
   from pg_proc where oid='public.ensure_member_conversation(uuid,uuid,uuid)'::regprocedure;
 if encode(sha256(convert_to(replace(source,E'\r\n',E'\n'),'UTF8')),'hex') is distinct from 'db170036092cc5cbde44078923cf45b9b14e63bf0a93934a13c8e73c92105f07'
   or not definer or configuration is distinct from array['search_path=pg_catalog, public'] then
   raise exception 'Unsupported predecessor: ensure_member_conversation(uuid,uuid,uuid)';
 end if;
 execute replace(definition,$before$  return jsonb_build_object('ok',true,'conversationId',conversation.id,'created',created,'contextGuitarId',conversation.context_guitar_id);$before$,$after$  perform public._member_require_business_message_consent(p_target_id);
  return jsonb_build_object('ok',true,'conversationId',conversation.id,'created',created,'contextGuitarId',conversation.context_guitar_id);$after$);
end $patch$;

do $patch$
declare source text; configuration text[]; definer boolean; definition text;
begin
 select prosrc,proconfig,prosecdef,replace(pg_get_functiondef(oid),E'\r\n',E'\n') into source,configuration,definer,definition
   from pg_proc where oid='public.send_member_message(uuid,uuid,uuid,text)'::regprocedure;
 if encode(sha256(convert_to(replace(source,E'\r\n',E'\n'),'UTF8')),'hex') is distinct from 'b676553e7b82de79be845ee618407c34764f90e6c2041ce994f4fff7161cf9f3'
   or not definer or configuration is distinct from array['search_path=pg_catalog, public'] then
   raise exception 'Unsupported predecessor: send_member_message(uuid,uuid,uuid,text)';
 end if;
 execute replace(definition,$before$  conversation:=public._member_assert_conversation(p_conversation_id,p_actor_id,true);
  select * into existing from public.member_messages where sender_id=p_actor_id and client_operation_id=p_operation_id for update;
  if existing.id is not null then
    if existing.conversation_id is distinct from p_conversation_id or existing.body is distinct from clean_body then
      raise exception using errcode='MM409',message='This send operation belongs to another message.';
    end if;
    return jsonb_build_object('ok',true,'conversationId',existing.conversation_id,'messageId',existing.id,'createdAt',existing.created_at,'replayed',true);
  end if;$before$,$after$  conversation:=public._member_assert_conversation(p_conversation_id,p_actor_id,false);
  select * into existing from public.member_messages where sender_id=p_actor_id and client_operation_id=p_operation_id for update;
  if existing.id is not null then
    if existing.conversation_id is distinct from p_conversation_id or existing.body is distinct from clean_body then
      raise exception using errcode='MM409',message='This send operation belongs to another message.';
    end if;
    return jsonb_build_object('ok',true,'conversationId',existing.conversation_id,'messageId',existing.id,'createdAt',existing.created_at,'replayed',true);
  end if;
  perform public._member_assert_conversation(p_conversation_id,p_actor_id,true);$after$);
end $patch$;

-- Revalidate ownership and the recorded sender under the guitar lock. No public Profile context is required.
create function public.ensure_recorded_business_conversation(p_actor_id uuid,p_target_id uuid,p_transfer_id uuid,p_handle text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $recorded$
declare guitar public.guitars; handoff public.ownership_transfers; receipt public.ownership_transfers; settings jsonb; started jsonb;
begin
  perform public._member_require_active(p_actor_id);
  select * into receipt from public.ownership_transfers where id=p_transfer_id and status='accepted' and accepted_by=p_actor_id;
  if receipt.id is null then raise exception using errcode='MM404',message='Recorded business unavailable.'; end if;
  select * into guitar from public.guitars where id=receipt.guitar_id for update;
  if guitar.id is null or guitar.owner_id is distinct from p_actor_id or guitar.owner_removed_at is not null or guitar.admin_archived_at is not null then
    raise exception using errcode='MM404',message='Recorded business unavailable.';
  end if;
  select * into handoff from public.ownership_transfers where guitar_id=guitar.id and status='accepted' and accepted_by=p_actor_id
    order by accepted_at desc,id desc limit 1 for share;
  if handoff.id is distinct from p_transfer_id or handoff.from_owner_id is distinct from p_target_id then
    raise exception using errcode='MM404',message='Recorded business unavailable.';
  end if;
  -- The pair writer locks the conversation, then consent/settings: the send path uses the same order.
  started := public.ensure_member_conversation(p_actor_id,p_target_id,null);
  select content_value into settings from public.site_content where content_key='public_collection_owner:'||p_target_id::text;
  if coalesce(settings->>'accountType','') not in ('shop','builder','brand') or settings->>'handle' is distinct from p_handle then
    raise exception using errcode='MM404',message='Recorded business unavailable.';
  end if;
  return started;
end $recorded$;
revoke all on function public.ensure_recorded_business_conversation(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.ensure_recorded_business_conversation(uuid,uuid,uuid,text) to service_role;

notify pgrst,'reload schema';
commit;
