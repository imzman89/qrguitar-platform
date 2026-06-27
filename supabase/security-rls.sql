-- QRguitar MVP security/RLS hardening.
-- Run this in Supabase SQL Editor after the base schema.
-- Payments note: do not store or process card numbers in Supabase.
-- All payments must use Stripe Checkout or Stripe Customer Portal only.

alter table public.profiles enable row level security;
alter table public.guitars enable row level security;
alter table public.guitar_specs enable row level security;
alter table public.guitar_timeline_events enable row level security;
alter table public.guitar_media enable row level security;
alter table public.guitar_documents enable row level security;
alter table public.ownership_transfers enable row level security;
alter table public.qr_redirects enable row level security;
alter table public.site_content enable row level security;

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

drop policy if exists "Public guitars are readable" on public.guitars;
drop policy if exists "Owners manage guitars" on public.guitars;
drop policy if exists "Public profiles for public records are readable" on public.profiles;
drop policy if exists "Profiles read own account" on public.profiles;
drop policy if exists "Profiles update own account" on public.profiles;
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
    select 1 from public.guitars
    where guitars.id = qr_redirects.guitar_id
    and (guitars.visibility = 'public' or guitars.owner_id = auth.uid())
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
)
with check (
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
)
with check (
  exists (
    select 1 from public.guitars
    where guitars.id = guitar_timeline_events.guitar_id
    and guitars.owner_id = auth.uid()
  )
);

create policy "Public media is readable"
on public.guitar_media for select
using (
  exists (
    select 1 from public.guitars
    where guitars.id = guitar_media.guitar_id
    and (guitars.visibility = 'public' or guitars.owner_id = auth.uid())
  )
);

create policy "Owners manage media"
on public.guitar_media for all
using (
  exists (
    select 1 from public.guitars
    where guitars.id = guitar_media.guitar_id
    and guitars.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.guitars
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
    select 1 from public.guitars
    where guitars.id = guitar_documents.guitar_id
    and guitars.owner_id = auth.uid()
  )
);

create policy "Owners manage documents"
on public.guitar_documents for all
using (
  exists (
    select 1 from public.guitars
    where guitars.id = guitar_documents.guitar_id
    and guitars.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.guitars
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
    select 1 from public.guitars
    where guitars.id = ownership_transfers.guitar_id
    and guitars.owner_id = auth.uid()
  )
);

create policy "Owners create transfers"
on public.ownership_transfers for insert
with check (
  exists (
    select 1 from public.guitars
    where guitars.id = ownership_transfers.guitar_id
    and guitars.owner_id = auth.uid()
  )
);

create policy "Owners manage sent transfers"
on public.ownership_transfers for update
using (
  exists (
    select 1 from public.guitars
    where guitars.id = ownership_transfers.guitar_id
    and guitars.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.guitars
    where guitars.id = ownership_transfers.guitar_id
    and guitars.owner_id = auth.uid()
  )
);

-- Storage: create private buckets first in Supabase Storage:
-- instrument-media, instrument-documents
-- Recommended path format: {auth.uid()}/{guitar_id}/{filename}

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
