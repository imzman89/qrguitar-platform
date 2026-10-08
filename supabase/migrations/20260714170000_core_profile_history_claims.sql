-- QRguitar core profile/history/claims expansion.
-- Additive and idempotent: preserves all guitars, URLs, photos, documents, and transfers.

begin;

create extension if not exists pgcrypto;

alter table public.guitars
  add column if not exists no_serial_used boolean not null default false;

create or replace function public.normalize_instrument_serial(value text)
returns text
language sql
immutable
strict
as $$
  select regexp_replace(upper(trim(value)), '[^A-Z0-9]', '', 'g');
$$;

create table if not exists public.guitar_serial_aliases (
  id uuid primary key default gen_random_uuid(),
  guitar_id uuid not null references public.guitars(id) on delete cascade,
  serial_normalized text not null,
  serial_display text not null default '',
  is_current boolean not null default true,
  source text not null default 'profile',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint guitar_serial_aliases_serial_not_blank check (length(serial_normalized) >= 4)
);

create unique index if not exists guitar_serial_aliases_normalized_unique
  on public.guitar_serial_aliases(serial_normalized);
create index if not exists guitar_serial_aliases_guitar_idx
  on public.guitar_serial_aliases(guitar_id, is_current desc, created_at desc);

create or replace function public.set_guitar_no_serial_flag()
returns trigger
language plpgsql
as $$
begin
  new.no_serial_used := (new.serial_number is null or trim(new.serial_number) = '');
  return new;
end;
$$;

create or replace function public.sync_guitar_serial_alias()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized text;
  existing_guitar_id uuid;
begin
  if new.serial_number is null or trim(new.serial_number) = '' then
    update public.guitar_serial_aliases
      set is_current = false
      where guitar_id = new.id and is_current = true;
    return null;
  end if;

  normalized := public.normalize_instrument_serial(new.serial_number);
  if length(normalized) < 4 then
    raise exception 'Serial Number must contain at least four letters or numbers.';
  end if;

  select guitar_id into existing_guitar_id
  from public.guitar_serial_aliases
  where serial_normalized = normalized
  limit 1;

  if existing_guitar_id is not null and existing_guitar_id <> new.id then
    raise exception 'An existing QRguitar Profile already uses this Serial Number.';
  end if;

  update public.guitar_serial_aliases
    set is_current = false
    where guitar_id = new.id and serial_normalized <> normalized and is_current = true;

  insert into public.guitar_serial_aliases (
    guitar_id, serial_normalized, serial_display, is_current, source, created_by
  ) values (
    new.id, normalized, new.serial_number, true,
    case when tg_op = 'INSERT' then 'profile_creation' else 'serial_correction' end,
    new.owner_id
  )
  on conflict (serial_normalized) do update
    set serial_display = excluded.serial_display,
        is_current = true
    where public.guitar_serial_aliases.guitar_id = excluded.guitar_id;

  return null;
end;
$$;

drop trigger if exists set_guitar_no_serial_flag_trigger on public.guitars;
create trigger set_guitar_no_serial_flag_trigger
before insert or update of serial_number on public.guitars
for each row execute function public.set_guitar_no_serial_flag();

drop trigger if exists sync_guitar_serial_alias_trigger on public.guitars;
create trigger sync_guitar_serial_alias_trigger
after insert or update of serial_number on public.guitars
for each row execute function public.sync_guitar_serial_alias();

insert into public.guitar_serial_aliases (
  guitar_id, serial_normalized, serial_display, is_current, source, created_by, created_at
)
select
  g.id,
  public.normalize_instrument_serial(g.serial_number),
  g.serial_number,
  true,
  'production_backfill',
  g.owner_id,
  coalesce(g.created_at, now())
from public.guitars g
where g.serial_number is not null
  and trim(g.serial_number) <> ''
  and length(public.normalize_instrument_serial(g.serial_number)) >= 4
on conflict (serial_normalized) do nothing;

update public.guitars
set no_serial_used = (serial_number is null or trim(serial_number) = '');

create table if not exists public.guitar_external_media (
  id uuid primary key default gen_random_uuid(),
  guitar_id uuid not null references public.guitars(id) on delete cascade,
  provider text not null,
  canonical_url text not null,
  provider_id text,
  title text not null default '',
  caption text not null default '',
  thumbnail_url text,
  is_public boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guitar_external_media_provider check (provider in ('youtube', 'vimeo', 'audio', 'link')),
  constraint guitar_external_media_url_unique unique (guitar_id, canonical_url)
);

create index if not exists guitar_external_media_guitar_idx
  on public.guitar_external_media(guitar_id, sort_order, created_at);

alter table public.guitar_documents
  add column if not exists category text,
  add column if not exists issuer_source text,
  add column if not exists document_date date,
  add column if not exists description text,
  add column if not exists file_size_bytes bigint,
  add column if not exists related_timeline_event_id uuid,
  add column if not exists related_service_event_id uuid;

alter table public.guitar_timeline_events
  add column if not exists date_precision text not null default 'day',
  add column if not exists category text not null default 'Other',
  add column if not exists is_system boolean not null default false,
  add column if not exists related_document_id uuid references public.guitar_documents(id) on delete set null,
  add column if not exists related_media_id uuid references public.guitar_external_media(id) on delete set null,
  add column if not exists source_key text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'guitar_timeline_date_precision_check'
  ) then
    alter table public.guitar_timeline_events
      add constraint guitar_timeline_date_precision_check
      check (date_precision in ('day', 'month', 'year', 'unknown'));
  end if;
end $$;

create unique index if not exists guitar_timeline_source_key_unique
  on public.guitar_timeline_events(guitar_id, source_key)
  where source_key is not null;
create index if not exists guitar_timeline_public_order_idx
  on public.guitar_timeline_events(guitar_id, is_public, event_date desc, created_at desc);

create or replace function public.protect_system_timeline_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.is_system = true
    and auth.role() <> 'service_role'
    and not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  then
    raise exception 'System timeline events cannot be changed.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists protect_system_timeline_event_trigger on public.guitar_timeline_events;
create trigger protect_system_timeline_event_trigger
before update or delete on public.guitar_timeline_events
for each row execute function public.protect_system_timeline_event();

create or replace function public.create_profile_timeline_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.guitar_timeline_events (
    guitar_id, event_date, date_precision, event_type, category, title,
    description, is_public, is_system, created_by_user_id, source_key, created_at, updated_at
  ) values (
    new.id,
    coalesce(new.created_at::date, current_date),
    'day',
    'profile_created',
    'Documentation',
    'QRguitar Profile created',
    'A permanent QRguitar Profile was created for this instrument.',
    true,
    true,
    new.owner_id,
    'system:profile-created',
    coalesce(new.created_at, now()),
    coalesce(new.created_at, now())
  ) on conflict (guitar_id, source_key) where source_key is not null do nothing;
  return new;
end;
$$;

drop trigger if exists create_profile_timeline_event_trigger on public.guitars;
create trigger create_profile_timeline_event_trigger
after insert on public.guitars
for each row execute function public.create_profile_timeline_event();

insert into public.guitar_timeline_events (
  guitar_id, event_date, date_precision, event_type, category, title,
  description, is_public, is_system, created_by_user_id, source_key, created_at, updated_at
)
select
  g.id,
  coalesce(g.created_at::date, current_date),
  'day',
  'profile_created',
  'Documentation',
  'QRguitar Profile created',
  'A permanent QRguitar Profile was created for this instrument.',
  true,
  true,
  g.owner_id,
  'system:profile-created',
  coalesce(g.created_at, now()),
  coalesce(g.created_at, now())
from public.guitars g
on conflict (guitar_id, source_key) where source_key is not null do nothing;

insert into public.guitar_timeline_events (
  guitar_id, event_date, date_precision, event_type, category, title,
  description, private_notes, is_public, is_system, created_by_user_id, source_key
)
select
  s.guitar_id,
  null,
  'unknown',
  'service',
  'Service',
  'Legacy service notes',
  'Legacy service notes imported for owner review.',
  s.value,
  false,
  false,
  g.owner_id,
  'legacy:service-notes'
from public.guitar_specs s
join public.guitars g on g.id = s.guitar_id
where lower(trim(s.label)) = 'service notes'
  and trim(s.value) <> ''
on conflict (guitar_id, source_key) where source_key is not null do nothing;

create table if not exists public.ownership_claims (
  id uuid primary key default gen_random_uuid(),
  guitar_id uuid not null references public.guitars(id) on delete cascade,
  claim_type text not null,
  status text not null default 'awaiting_claimant',
  current_owner_id uuid references auth.users(id) on delete set null,
  claimant_user_id uuid references auth.users(id) on delete set null,
  recipient_email_normalized text,
  claim_token_hash text,
  purchaser_code_hash text,
  acquisition_details text,
  ownership_declaration text,
  owner_response_note text,
  admin_review_note text,
  expires_at timestamptz,
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ownership_claim_type_check check (claim_type in ('owner_transfer', 'store_purchase', 'legacy_review')),
  constraint ownership_claim_status_check check (status in ('awaiting_claimant', 'awaiting_owner', 'admin_review', 'approved', 'denied', 'expired', 'cancelled'))
);

create unique index if not exists ownership_claims_one_active_claimant_idx
  on public.ownership_claims(guitar_id, claimant_user_id)
  where status in ('awaiting_claimant', 'awaiting_owner', 'admin_review');
create unique index if not exists ownership_claims_token_hash_idx
  on public.ownership_claims(claim_token_hash)
  where claim_token_hash is not null;
create unique index if not exists ownership_claims_code_hash_idx
  on public.ownership_claims(purchaser_code_hash)
  where purchaser_code_hash is not null;
create index if not exists ownership_claims_review_idx
  on public.ownership_claims(status, created_at desc);

create table if not exists public.ownership_claim_evidence (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.ownership_claims(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id) on delete cascade,
  evidence_type text not null,
  file_name text not null,
  storage_path text not null,
  private_note text,
  created_at timestamptz not null default now()
);

create index if not exists ownership_claim_evidence_claim_idx
  on public.ownership_claim_evidence(claim_id, created_at);

create table if not exists public.ownership_claim_events (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.ownership_claims(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ownership_claim_events_claim_idx
  on public.ownership_claim_events(claim_id, created_at desc);

alter table public.ownership_transfers
  add column if not exists expires_at timestamptz,
  add column if not exists claim_token_hash text,
  add column if not exists purchaser_code_hash text,
  add column if not exists claim_prepared_at timestamptz;

create or replace function public.complete_ownership_transfer(
  p_transfer_id uuid,
  p_new_owner_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  transfer_row public.ownership_transfers%rowtype;
  guitar_row public.guitars%rowtype;
  accepted_time timestamptz := now();
begin
  select * into transfer_row
  from public.ownership_transfers
  where id = p_transfer_id
  for update;

  if transfer_row.id is null or transfer_row.status <> 'sent' then
    raise exception 'This transfer is no longer available.';
  end if;

  select * into guitar_row
  from public.guitars
  where id = transfer_row.guitar_id
  for update;

  if guitar_row.id is null or guitar_row.owner_id is distinct from transfer_row.from_owner_id then
    raise exception 'The owner changed before this transfer could be completed.';
  end if;

  update public.guitars
  set owner_id = p_new_owner_id, updated_at = accepted_time
  where id = guitar_row.id;

  update public.ownership_transfers
  set status = 'accepted', accepted_by = p_new_owner_id, accepted_at = accepted_time
  where id = p_transfer_id;

  insert into public.guitar_timeline_events (
    guitar_id, event_date, date_precision, event_type, category, title,
    description, is_public, is_system, created_by_user_id, source_key, created_at, updated_at
  ) values (
    guitar_row.id,
    accepted_time::date,
    'day',
    'ownership',
    'Ownership',
    'Ownership transferred',
    'Ownership was transferred while the permanent QRguitar Profile remained unchanged.',
    true,
    true,
    p_new_owner_id,
    'transfer:' || p_transfer_id::text,
    accepted_time,
    accepted_time
  ) on conflict (guitar_id, source_key) where source_key is not null do nothing;

  return jsonb_build_object(
    'transfer_id', p_transfer_id,
    'guitar_id', guitar_row.id,
    'new_owner_id', p_new_owner_id,
    'accepted_at', accepted_time
  );
end;
$$;

revoke all on function public.complete_ownership_transfer(uuid, uuid) from public, anon, authenticated;
grant execute on function public.complete_ownership_transfer(uuid, uuid) to service_role;

create or replace function public.approve_ownership_claim(
  p_claim_id uuid,
  p_decided_by uuid,
  p_decision_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  claim_row public.ownership_claims%rowtype;
  guitar_row public.guitars%rowtype;
  decided_time timestamptz := now();
begin
  select * into claim_row
  from public.ownership_claims
  where id = p_claim_id
  for update;

  if claim_row.id is null
    or claim_row.status not in ('awaiting_owner', 'admin_review')
    or claim_row.claimant_user_id is null
  then
    raise exception 'This ownership request is no longer available.';
  end if;

  select * into guitar_row
  from public.guitars
  where id = claim_row.guitar_id
  for update;

  if guitar_row.id is null
    or guitar_row.owner_id is distinct from claim_row.current_owner_id
  then
    raise exception 'The owner changed before this request could be completed.';
  end if;

  update public.guitars
  set owner_id = claim_row.claimant_user_id, updated_at = decided_time
  where id = guitar_row.id;

  update public.ownership_claims
  set status = 'approved',
      decided_at = decided_time,
      decided_by = p_decided_by,
      admin_review_note = nullif(trim(coalesce(p_decision_note, '')), ''),
      updated_at = decided_time
  where id = claim_row.id;

  insert into public.ownership_claim_events (
    claim_id, actor_user_id, action, note, metadata
  ) values (
    claim_row.id,
    p_decided_by,
    'approved',
    nullif(trim(coalesce(p_decision_note, '')), ''),
    jsonb_build_object('previous_owner_id', guitar_row.owner_id, 'new_owner_id', claim_row.claimant_user_id)
  );

  insert into public.guitar_timeline_events (
    guitar_id, event_date, date_precision, event_type, category, title,
    description, is_public, is_system, created_by_user_id, source_key, created_at, updated_at
  ) values (
    guitar_row.id,
    decided_time::date,
    'day',
    'ownership',
    'Ownership',
    'Ownership updated',
    'Ownership was updated after a reviewed request. The permanent QRguitar Profile remained unchanged.',
    true,
    true,
    claim_row.claimant_user_id,
    'ownership-claim:' || claim_row.id::text,
    decided_time,
    decided_time
  ) on conflict (guitar_id, source_key) where source_key is not null do nothing;

  return jsonb_build_object(
    'claim_id', claim_row.id,
    'guitar_id', guitar_row.id,
    'new_owner_id', claim_row.claimant_user_id,
    'approved_at', decided_time
  );
end;
$$;

revoke all on function public.approve_ownership_claim(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.approve_ownership_claim(uuid, uuid, text) to service_role;

alter table public.guitar_serial_aliases enable row level security;
alter table public.guitar_external_media enable row level security;
alter table public.ownership_claims enable row level security;
alter table public.ownership_claim_evidence enable row level security;
alter table public.ownership_claim_events enable row level security;

revoke all on public.guitar_serial_aliases from anon, authenticated;
grant all on public.guitar_serial_aliases to service_role;

grant select on public.guitar_external_media to anon, authenticated;
grant insert, update, delete on public.guitar_external_media to authenticated;
grant all on public.guitar_external_media to service_role;

drop policy if exists "Public external media is readable" on public.guitar_external_media;
create policy "Public external media is readable"
on public.guitar_external_media for select
using (
  is_public = true and exists (
    select 1 from public.guitars g
    where g.id = guitar_id
      and g.visibility in ('public', 'unlisted')
      and g.admin_archived_at is null
      and g.owner_removed_at is null
  )
);

drop policy if exists "Owners manage external media" on public.guitar_external_media;
create policy "Owners manage external media"
on public.guitar_external_media for all
using (exists (select 1 from public.guitars g where g.id = guitar_id and g.owner_id = auth.uid()))
with check (exists (select 1 from public.guitars g where g.id = guitar_id and g.owner_id = auth.uid()));

revoke insert, update, delete on public.ownership_claims from authenticated;
grant select on public.ownership_claims to authenticated;
grant all on public.ownership_claims to service_role;
revoke all on public.ownership_claim_evidence from authenticated;
grant all on public.ownership_claim_evidence to service_role;
revoke insert, update, delete on public.ownership_claim_events from authenticated;
grant select on public.ownership_claim_events to authenticated;
grant all on public.ownership_claim_events to service_role;

drop policy if exists "Claim participants read claims" on public.ownership_claims;
create policy "Claim participants read claims"
on public.ownership_claims for select
using (claimant_user_id = auth.uid() or current_owner_id = auth.uid());

drop policy if exists "Claimants create review claims" on public.ownership_claims;
drop policy if exists "Claimants update open claims" on public.ownership_claims;
drop policy if exists "Claimants manage own evidence" on public.ownership_claim_evidence;

drop policy if exists "Claim participants read claim events" on public.ownership_claim_events;
create policy "Claim participants read claim events"
on public.ownership_claim_events for select
using (exists (
  select 1 from public.ownership_claims c
  where c.id = claim_id and (c.claimant_user_id = auth.uid() or c.current_owner_id = auth.uid())
));

drop policy if exists "Claimants add claim events" on public.ownership_claim_events;

commit;
