begin;

-- Account settings are one commit. Only the trusted server can choose the actor.
create or replace function public.save_account_settings(
  p_user_id uuid,
  p_display_name text,
  p_collection jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_owner_key text := 'public_collection_owner:' || p_user_id::text;
  v_prior jsonb;
  v_collection jsonb;
  v_handle text;
  v_enabled boolean;
  v_reserved uuid;
  v_owner_saved uuid;
begin
  if p_user_id is null or p_display_name is null or char_length(btrim(p_display_name)) < 2 or char_length(p_display_name) > 80 then
    raise exception using errcode = '22023', message = 'Invalid display name.';
  end if;
  if p_collection is not null then
    if jsonb_typeof(p_collection) is distinct from 'object'
      or jsonb_typeof(p_collection->'enabled') is distinct from 'boolean' then
      raise exception using errcode = '22023', message = 'Invalid public collection settings.';
    end if;
    v_enabled := (p_collection->>'enabled')::boolean;
    v_handle := coalesce(p_collection->>'handle', '');
    if char_length(v_handle) > 40 or (v_handle <> '' and v_handle !~ '^[a-z0-9][a-z0-9-]*$')
      or (v_enabled and (char_length(v_handle) < 3 or char_length(btrim(coalesce(p_collection->>'publicName', ''))) < 1))
      or char_length(coalesce(p_collection->>'publicName', '')) > 80
      or char_length(coalesce(p_collection->>'bio', '')) > 600
      or char_length(coalesce(p_collection->>'location', '')) > 160
      or char_length(coalesce(p_collection->>'websiteUrl', '')) > 500
      or char_length(coalesce(p_collection->>'avatarUrl', '')) > 1000
      or coalesce(p_collection->>'accountType', 'player') not in ('player','collector','shop','builder','luthier','other') then
      raise exception using errcode = '22023', message = 'Invalid public collection settings.';
    end if;
    v_collection := jsonb_build_object(
      'enabled', v_enabled, 'handle', v_handle,
      'publicName', coalesce(p_collection->>'publicName',''),
      'accountType', coalesce(p_collection->>'accountType','player'),
      'bio', coalesce(p_collection->>'bio',''), 'location', coalesce(p_collection->>'location',''),
      'websiteUrl', coalesce(p_collection->>'websiteUrl',''), 'avatarUrl', coalesce(p_collection->>'avatarUrl',''),
      'allowIndexing', coalesce(p_collection->'allowIndexing' = 'true'::jsonb, true),
      'allowMessages', coalesce(p_collection->'allowMessages' = 'true'::jsonb, false),
      'ownerId', p_user_id
    );
  end if;

  -- Defaults for a new profile come from the schema. Existing privileges and billing fields are untouched.
  insert into public.profiles(id, display_name) values(p_user_id, p_display_name) on conflict(id) do nothing;
  select * into strict v_profile from public.profiles where id = p_user_id for update;
  if v_profile.account_status <> 'active' then
    raise exception using errcode = '42501', message = 'This account cannot make changes.';
  end if;
  select content_value into v_prior from public.site_content where content_key = v_owner_key for update;
  if p_collection is not null and v_prior ? 'ownerId' and v_prior->>'ownerId' is distinct from p_user_id::text then
    raise exception using errcode = '42501', message = 'Collection settings ownership does not match this account.';
  end if;

  if p_collection is not null then
    if v_enabled then
      -- The unique key resolves competing requests atomically. Never overwrite a different/malformed owner.
      insert into public.site_content(content_key, content_value, updated_by, updated_at)
      values('public_collection_handle:' || v_handle, jsonb_build_object('ownerId', p_user_id), p_user_id, now())
      on conflict(content_key) do update
        set content_value = excluded.content_value, updated_by = excluded.updated_by, updated_at = excluded.updated_at
        where public.site_content.content_value->>'ownerId' = p_user_id::text
      returning id into v_reserved;
      if v_reserved is null then
        raise exception using errcode = '23505', message = 'That public collection handle is already in use.';
      end if;
    end if;
    if coalesce(v_prior->>'handle','') <> '' and (not v_enabled or v_prior->>'handle' <> v_handle) then
      delete from public.site_content
      where content_key = 'public_collection_handle:' || (v_prior->>'handle')
        and content_value->>'ownerId' = p_user_id::text;
    end if;
    insert into public.site_content(content_key, content_value, updated_by, updated_at)
    values(v_owner_key, v_collection, p_user_id, now())
    on conflict(content_key) do update
      set content_value = excluded.content_value, updated_by = excluded.updated_by, updated_at = excluded.updated_at
      where not (public.site_content.content_value ? 'ownerId') or public.site_content.content_value->>'ownerId' = p_user_id::text
    returning id into v_owner_saved;
    if v_owner_saved is null then
      raise exception using errcode = '42501', message = 'Collection settings ownership does not match this account.';
    end if;
  else
    v_collection := v_prior;
  end if;
  update public.profiles set display_name = p_display_name where id = p_user_id;
  return jsonb_build_object('displayName', p_display_name, 'publicCollection', v_collection);
end;
$$;

revoke all on function public.save_account_settings(uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.save_account_settings(uuid,text,jsonb) to service_role;

commit;

