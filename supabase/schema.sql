-- QRguitar MVP schema for Supabase
-- Run this in Supabase SQL Editor.
-- After this base schema, run supabase/security-rls.sql for launch RLS/storage hardening.
-- Do not store or process card numbers here; payments must use Stripe Checkout or Stripe Customer Portal only.

create extension if not exists "pgcrypto";

create type guitar_visibility as enum ('public', 'unlisted', 'private');
create type guitar_status as enum ('verified', 'unverified', 'transferred');
create type member_role as enum ('owner', 'builder', 'shop', 'admin');
create type plan_tier as enum ('single', 'pack_10', 'pack_25', 'bulk_50', 'business', 'enterprise');
create type transfer_status as enum ('draft', 'sent', 'accepted', 'expired', 'cancelled');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role member_role not null default 'owner',
  plan plan_tier not null default 'single',
  purchased_code_count integer not null default 0,
  remaining_code_count integer not null default 0,
  free_ownership_transfers_included boolean not null default false,
  included_ownership_transfer_count integer not null default 0,
  remaining_free_ownership_transfers integer,
  business_branding_enabled boolean not null default false,
  bulk_handoff_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.guitars (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete set null,
  qr_code text unique not null,
  permanent_path text unique not null,
  name text not null,
  brand text not null,
  model text,
  year text,
  serial_number text,
  builder text,
  location text,
  status guitar_status not null default 'unverified',
  visibility guitar_visibility not null default 'public',
  summary text not null default '',
  hero_image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.qr_redirects (
  id uuid primary key default gen_random_uuid(),
  guitar_id uuid not null references public.guitars(id) on delete cascade,
  old_path text unique not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.guitar_specs (
  id uuid primary key default gen_random_uuid(),
  guitar_id uuid not null references public.guitars(id) on delete cascade,
  label text not null,
  value text not null,
  sort_order integer not null default 0
);

create table public.guitar_timeline_events (
  id uuid primary key default gen_random_uuid(),
  guitar_id uuid not null references public.guitars(id) on delete cascade,
  event_date date,
  title text not null,
  description text not null default '',
  created_at timestamptz not null default now()
);

create table public.guitar_media (
  id uuid primary key default gen_random_uuid(),
  guitar_id uuid not null references public.guitars(id) on delete cascade,
  storage_path text not null,
  alt text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.guitar_documents (
  id uuid primary key default gen_random_uuid(),
  guitar_id uuid not null references public.guitars(id) on delete cascade,
  name text not null,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create table public.ownership_transfers (
  id uuid primary key default gen_random_uuid(),
  guitar_id uuid not null references public.guitars(id) on delete cascade,
  from_owner_id uuid references public.profiles(id) on delete set null,
  to_email text not null,
  to_name text,
  status transfer_status not null default 'draft',
  fee_cents integer not null default 700,
  fee_waived_reason text,
  accepted_by uuid references public.profiles(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.site_content (
  id uuid primary key default gen_random_uuid(),
  content_key text unique not null,
  content_value jsonb not null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.guitars enable row level security;
alter table public.guitar_specs enable row level security;
alter table public.guitar_timeline_events enable row level security;
alter table public.guitar_media enable row level security;
alter table public.guitar_documents enable row level security;
alter table public.ownership_transfers enable row level security;
alter table public.qr_redirects enable row level security;
alter table public.site_content enable row level security;

create policy "Public guitars are readable"
on public.guitars for select
using (visibility = 'public' or owner_id = auth.uid());

create policy "Active QR redirects are readable"
on public.qr_redirects for select
using (active = true);

create policy "Owners manage guitars"
on public.guitars for all
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "Profiles read own account"
on public.profiles for select
using (id = auth.uid());

create policy "Admins manage editable site content"
on public.site_content for all
using (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
    and profiles.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
    and profiles.role = 'admin'
  )
);

create policy "Public specs are readable"
on public.guitar_specs for select
using (
  exists (
    select 1 from public.guitars
    where guitars.id = guitar_specs.guitar_id
    and (guitars.visibility = 'public' or guitars.owner_id = auth.uid())
  )
);

create policy "Owners manage specs"
on public.guitar_specs for all
using (
  exists (
    select 1 from public.guitars
    where guitars.id = guitar_specs.guitar_id
    and guitars.owner_id = auth.uid()
  )
);

create policy "Public timeline is readable"
on public.guitar_timeline_events for select
using (
  exists (
    select 1 from public.guitars
    where guitars.id = guitar_timeline_events.guitar_id
    and (guitars.visibility = 'public' or guitars.owner_id = auth.uid())
  )
);

create policy "Owners manage timeline"
on public.guitar_timeline_events for all
using (
  exists (
    select 1 from public.guitars
    where guitars.id = guitar_timeline_events.guitar_id
    and guitars.owner_id = auth.uid()
  )
);

insert into public.guitars (
  qr_code,
  permanent_path,
  name,
  brand,
  model,
  year,
  serial_number,
  builder,
  location,
  status,
  visibility,
  summary
) values (
  'QRG-0001',
  '/i/QRG-0001',
  'Reptile',
  'Proper Instruments',
  'Custom Offset',
  '2026',
  'PI260001',
  'Proper Instruments',
  'Cranston, Rhode Island, USA',
  'verified',
  'public',
  'A permanent digital identity for a one-of-one handcrafted instrument. Specs, ownership, provenance, repairs, media, and documentation stay with the guitar for life.'
);
