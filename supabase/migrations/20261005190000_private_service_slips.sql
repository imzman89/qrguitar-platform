begin;

-- Standalone private shop records, never public service submissions or guitar ownership.
create table public.private_service_slips (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  revision integer not null default 1 check (revision > 0),
  data jsonb not null check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 65536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index private_service_slips_owner_updated_idx on public.private_service_slips(owner_id, updated_at desc, id desc);
alter table public.private_service_slips enable row level security;
revoke all on table public.private_service_slips from public, anon, authenticated;
grant select, insert, update on table public.private_service_slips to service_role;

create function public.save_private_service_slip(p_actor uuid, p_id uuid, p_expected_revision integer, p_data jsonb)
returns jsonb language plpgsql security invoker set search_path = pg_catalog, public as $slip$
declare
  saved public.private_service_slips%rowtype;
  account_state text;
  workspace text;
begin
  if p_actor is null or p_id is null or p_expected_revision is null or p_expected_revision < 0 or p_expected_revision >= 2147483646
    or p_data is null or jsonb_typeof(p_data) <> 'object' or octet_length(p_data::text) > 65536
    or nullif(btrim(p_data->>'instrument'), '') is null then
    raise exception using errcode = '22023', message = 'Invalid private service slip';
  end if;
  -- Same profile row lock used by save_account_settings serializes workspace changes.
  select account_status::text into account_state from public.profiles where id = p_actor for update;
  if not found or account_state is distinct from 'active' then
    raise exception using errcode = '42501', message = 'Account unavailable';
  end if;
  select content_value->>'accountType' into workspace from public.site_content
    where content_key = 'public_collection_owner:' || p_actor::text;
  if workspace is null or workspace not in ('shop', 'luthier') then
    raise exception using errcode = '42501', message = 'Professional workspace required';
  end if;
  if p_expected_revision = 0 then
    insert into public.private_service_slips(id, owner_id, revision, data)
      values (p_id, p_actor, 1, p_data) on conflict (id) do nothing;
  end if;
  select * into saved from public.private_service_slips where id = p_id and owner_id = p_actor for update;
  if not found then raise exception using errcode = 'P0002', message = 'Slip unavailable'; end if;
  -- Exact request replay after a lost response returns the same confirmed version.
  if saved.revision = p_expected_revision + 1 and saved.data = p_data then return to_jsonb(saved); end if;
  if saved.revision <> p_expected_revision then
    raise exception using errcode = '40001', message = 'Slip version changed';
  end if;
  update public.private_service_slips set data = p_data, revision = revision + 1, updated_at = clock_timestamp()
    where id = p_id and owner_id = p_actor returning * into saved;
  return to_jsonb(saved);
end;
$slip$;
revoke all on function public.save_private_service_slip(uuid, uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.save_private_service_slip(uuid, uuid, integer, jsonb) to service_role;
comment on table public.private_service_slips is 'Private account-scoped service paperwork. No public Profile, owner approval, payment or provider verification is created.';
commit;
