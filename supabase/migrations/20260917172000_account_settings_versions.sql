begin;

alter table public.profiles
  add column if not exists account_settings_version bigint not null default 0;

-- Compare under the row lock before invoking the existing atomic writer.
-- A delayed request cannot replace a snapshot saved by a newer request.
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
    raise exception 'Account settings changed. Reload your account before saving again.' using errcode = '40001';
  end if;

  v_saved := public.save_account_settings(p_user_id, p_display_name, p_collection);
  update public.profiles set account_settings_version = v_version + 1 where id = p_user_id;
  return v_saved || jsonb_build_object('settingsVersion', v_version + 1);
end;
$$;

-- Requests can only call the versioned entry point; its definer retains access
-- to the original transactional helper.
revoke all on function public.save_account_settings(uuid, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.save_account_settings(uuid, text, jsonb, bigint) from public, anon, authenticated;
grant execute on function public.save_account_settings(uuid, text, jsonb, bigint) to service_role;

commit;
