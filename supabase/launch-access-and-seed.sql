-- QRguitar launch access repair and demo seed.
-- Safe to run more than once in Supabase SQL Editor.
-- Does not drop/reset tables or disable RLS.

create extension if not exists "pgcrypto";

-- Required private buckets. Media can be exposed through signed URLs or policy;
-- documents remain private unless a row is explicitly marked public.
insert into storage.buckets (id, name, public)
values
  ('instrument-media', 'instrument-media', false),
  ('instrument-documents', 'instrument-documents', false)
on conflict (id) do update
set public = excluded.public;

-- PostgREST roles still need grants even when RLS policies decide row access.
grant usage on schema public to anon, authenticated, service_role;

grant select on public.profiles to anon, authenticated;
grant select on public.guitars to anon, authenticated;
grant select on public.qr_redirects to anon, authenticated;
grant select on public.guitar_specs to anon, authenticated;
grant select on public.guitar_timeline_events to anon, authenticated;
grant select on public.guitar_media to anon, authenticated;
grant select on public.guitar_documents to anon, authenticated;

grant insert, update, delete on public.profiles to authenticated;
grant insert, update, delete on public.guitars to authenticated;
grant insert, update, delete on public.guitar_specs to authenticated;
grant insert, update, delete on public.guitar_timeline_events to authenticated;
grant insert, update, delete on public.guitar_media to authenticated;
grant insert, update, delete on public.guitar_documents to authenticated;
grant select, insert, update on public.ownership_transfers to authenticated;

grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

alter table public.profiles enable row level security;
alter table public.guitars enable row level security;
alter table public.guitar_specs enable row level security;
alter table public.guitar_timeline_events enable row level security;
alter table public.guitar_media enable row level security;
alter table public.guitar_documents enable row level security;
alter table public.ownership_transfers enable row level security;
alter table public.qr_redirects enable row level security;
alter table public.site_content enable row level security;

drop policy if exists "Public profiles for public records are readable" on public.profiles;
drop policy if exists "Profiles read own account" on public.profiles;
drop policy if exists "Profiles update own account" on public.profiles;
drop policy if exists "Public guitars are readable" on public.guitars;
drop policy if exists "Owners manage guitars" on public.guitars;
drop policy if exists "Active QR redirects are readable" on public.qr_redirects;
drop policy if exists "Public specs are readable" on public.guitar_specs;
drop policy if exists "Owners manage specs" on public.guitar_specs;
drop policy if exists "Public timeline is readable" on public.guitar_timeline_events;
drop policy if exists "Owners manage timeline" on public.guitar_timeline_events;
drop policy if exists "Public media is readable" on public.guitar_media;
drop policy if exists "Owners manage media" on public.guitar_media;
drop policy if exists "Public documents are readable only when marked public" on public.guitar_documents;
drop policy if exists "Owners read documents" on public.guitar_documents;
drop policy if exists "Owners manage documents" on public.guitar_documents;
drop policy if exists "Transfer participants read transfers" on public.ownership_transfers;
drop policy if exists "Owners create transfers" on public.ownership_transfers;
drop policy if exists "Owners manage sent transfers" on public.ownership_transfers;

create policy "Profiles read own account"
on public.profiles for select
using (id = auth.uid());

create policy "Public profiles for public records are readable"
on public.profiles for select
using (
  exists (
    select 1
    from public.guitars
    where guitars.owner_id = profiles.id
    and guitars.visibility = 'public'
  )
);

create policy "Profiles update own account"
on public.profiles for update
using (id = auth.uid())
with check (id = auth.uid());

create policy "Public guitars are readable"
on public.guitars for select
using (visibility = 'public' or owner_id = auth.uid());

create policy "Owners manage guitars"
on public.guitars for all
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "Active QR redirects are readable"
on public.qr_redirects for select
using (
  active = true
  and exists (
    select 1
    from public.guitars
    where guitars.id = qr_redirects.guitar_id
    and (guitars.visibility = 'public' or guitars.owner_id = auth.uid())
  )
);

create policy "Public specs are readable"
on public.guitar_specs for select
using (
  exists (
    select 1
    from public.guitars
    where guitars.id = guitar_specs.guitar_id
    and (guitars.visibility = 'public' or guitars.owner_id = auth.uid())
  )
);

create policy "Owners manage specs"
on public.guitar_specs for all
using (
  exists (
    select 1
    from public.guitars
    where guitars.id = guitar_specs.guitar_id
    and guitars.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.guitars
    where guitars.id = guitar_specs.guitar_id
    and guitars.owner_id = auth.uid()
  )
);

create policy "Public timeline is readable"
on public.guitar_timeline_events for select
using (
  exists (
    select 1
    from public.guitars
    where guitars.id = guitar_timeline_events.guitar_id
    and (guitars.visibility = 'public' or guitars.owner_id = auth.uid())
  )
);

create policy "Owners manage timeline"
on public.guitar_timeline_events for all
using (
  exists (
    select 1
    from public.guitars
    where guitars.id = guitar_timeline_events.guitar_id
    and guitars.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.guitars
    where guitars.id = guitar_timeline_events.guitar_id
    and guitars.owner_id = auth.uid()
  )
);

create policy "Public media is readable"
on public.guitar_media for select
using (
  exists (
    select 1
    from public.guitars
    where guitars.id = guitar_media.guitar_id
    and (guitars.visibility = 'public' or guitars.owner_id = auth.uid())
  )
);

create policy "Owners manage media"
on public.guitar_media for all
using (
  exists (
    select 1
    from public.guitars
    where guitars.id = guitar_media.guitar_id
    and guitars.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.guitars
    where guitars.id = guitar_media.guitar_id
    and guitars.owner_id = auth.uid()
  )
);

create policy "Public documents are readable only when marked public"
on public.guitar_documents for select
using (
  is_public = true
  and exists (
    select 1
    from public.guitars
    where guitars.id = guitar_documents.guitar_id
    and guitars.visibility = 'public'
  )
);

create policy "Owners read documents"
on public.guitar_documents for select
using (
  exists (
    select 1
    from public.guitars
    where guitars.id = guitar_documents.guitar_id
    and guitars.owner_id = auth.uid()
  )
);

create policy "Owners manage documents"
on public.guitar_documents for all
using (
  exists (
    select 1
    from public.guitars
    where guitars.id = guitar_documents.guitar_id
    and guitars.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.guitars
    where guitars.id = guitar_documents.guitar_id
    and guitars.owner_id = auth.uid()
  )
);

create policy "Transfer participants read transfers"
on public.ownership_transfers for select
using (
  from_owner_id = auth.uid()
  or accepted_by = auth.uid()
  or exists (
    select 1
    from public.guitars
    where guitars.id = ownership_transfers.guitar_id
    and guitars.owner_id = auth.uid()
  )
);

create policy "Owners create transfers"
on public.ownership_transfers for insert
with check (
  exists (
    select 1
    from public.guitars
    where guitars.id = ownership_transfers.guitar_id
    and guitars.owner_id = auth.uid()
  )
);

create policy "Owners manage sent transfers"
on public.ownership_transfers for update
using (
  exists (
    select 1
    from public.guitars
    where guitars.id = ownership_transfers.guitar_id
    and guitars.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.guitars
    where guitars.id = ownership_transfers.guitar_id
    and guitars.owner_id = auth.uid()
  )
);

drop policy if exists "Owners manage instrument media files" on storage.objects;
drop policy if exists "Public instrument media files are readable" on storage.objects;
drop policy if exists "Owners manage instrument document files" on storage.objects;
drop policy if exists "Owners read instrument document files" on storage.objects;
drop policy if exists "Public instrument document files are readable only when marked public" on storage.objects;

create policy "Owners manage instrument media files"
on storage.objects for all
using (
  bucket_id = 'instrument-media'
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'instrument-media'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "Public instrument media files are readable"
on storage.objects for select
using (
  bucket_id = 'instrument-media'
  and exists (
    select 1
    from public.guitar_media
    join public.guitars on guitars.id = guitar_media.guitar_id
    where guitar_media.storage_path = storage.objects.name
    and (guitars.visibility = 'public' or guitars.owner_id = auth.uid())
  )
);

create policy "Owners manage instrument document files"
on storage.objects for all
using (
  bucket_id = 'instrument-documents'
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'instrument-documents'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "Owners read instrument document files"
on storage.objects for select
using (
  bucket_id = 'instrument-documents'
  and exists (
    select 1
    from public.guitar_documents
    join public.guitars on guitars.id = guitar_documents.guitar_id
    where guitar_documents.storage_path = storage.objects.name
    and guitars.owner_id = auth.uid()
  )
);

create policy "Public instrument document files are readable only when marked public"
on storage.objects for select
using (
  bucket_id = 'instrument-documents'
  and exists (
    select 1
    from public.guitar_documents
    join public.guitars on guitars.id = guitar_documents.guitar_id
    where guitar_documents.storage_path = storage.objects.name
    and guitar_documents.is_public = true
    and guitars.visibility = 'public'
  )
);

-- Demo seed used by /i/QRG-PI260001 and launch catalog fallback.
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
  summary,
  hero_image_path
) values (
  'QRG-PI260001',
  '/i/QRG-PI260001',
  'Reptile',
  'Proper Instruments',
  '1-of-1 Reptile',
  '2026',
  'PI260001',
  'Proper Instruments',
  'Cranston, RI',
  'verified',
  'public',
  'Reptile is a one-of-one Proper Instruments build from Cranston, Rhode Island, equipped with Proper Passive tone controls, a Proper Pickups ''64 Closetcaster pickup set, a nitro-finished neck, and a permanent QRguitar record.',
  '/media/reptile-hero.jpg'
)
on conflict (qr_code) do update
set
  permanent_path = excluded.permanent_path,
  name = excluded.name,
  brand = excluded.brand,
  model = excluded.model,
  year = excluded.year,
  serial_number = excluded.serial_number,
  builder = excluded.builder,
  location = excluded.location,
  status = excluded.status,
  visibility = excluded.visibility,
  summary = excluded.summary,
  hero_image_path = excluded.hero_image_path,
  updated_at = now();

delete from public.guitar_specs
using public.guitars
where guitar_specs.guitar_id = guitars.id
  and guitars.qr_code = 'QRG-PI260001'
  and guitars.serial_number = 'PI260001'
  and guitars.brand = 'Proper Instruments';

insert into public.guitar_specs (guitar_id, label, value, sort_order)
select guitars.id, seed.label, seed.value, seed.sort_order
from public.guitars
cross join (
  values
    ('Condition', 'new', 1),
    ('Type', 'Electric guitar', 2),
    ('Electronics', 'Proper Passive tone controls', 3),
    ('Pickups', 'Proper Pickups ''64 Closetcaster pickup set', 4),
    ('Neck', 'Nitro-finished neck, slim ''60s C profile', 5),
    ('Fingerboard', 'Rosewood', 6),
    ('Radius', '9.5 inch', 7),
    ('Case', 'Hardshell case included', 8),
    ('QR Record', 'Lifetime QRguitar tracker', 9),
    ('Weight', '7.4 lbs', 10)
) as seed(label, value, sort_order)
where guitars.qr_code = 'QRG-PI260001'
  and guitars.serial_number = 'PI260001'
  and guitars.brand = 'Proper Instruments';

-- Hide the original scaffold seed if it exists. The launch demo is QRG-PI260001.
update public.guitars
set
  visibility = 'private',
  updated_at = now()
where qr_code = 'QRG-0001'
  and name = 'Reptile'
  and brand = 'Proper Instruments'
  and serial_number = 'PI260001';
