alter table public.guitar_timeline_events
  add column if not exists created_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists event_type text,
  add column if not exists private_notes text,
  add column if not exists shop_name text,
  add column if not exists location text,
  add column if not exists is_public boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists guitar_timeline_events_guitar_public_idx
on public.guitar_timeline_events(guitar_id, is_public, event_date desc, created_at desc);

grant select on public.guitar_timeline_events to anon, authenticated;
grant insert, update, delete on public.guitar_timeline_events to authenticated;

drop policy if exists "Public timeline is readable" on public.guitar_timeline_events;
drop policy if exists "Owners manage timeline" on public.guitar_timeline_events;

create policy "Public timeline is readable"
on public.guitar_timeline_events for select
using (
  is_public = true
  and exists (
    select 1 from public.guitars
    where guitars.id = guitar_timeline_events.guitar_id
    and guitars.visibility = 'public'
  )
);

create policy "Owners manage timeline"
on public.guitar_timeline_events for all
using (
  exists (
    select 1 from public.guitars
    where guitars.id = guitar_timeline_events.guitar_id
    and (
      guitars.owner_id = auth.uid()
      or exists (
        select 1 from public.profiles
        where profiles.id = auth.uid()
        and profiles.role = 'admin'
      )
    )
  )
)
with check (
  exists (
    select 1 from public.guitars
    where guitars.id = guitar_timeline_events.guitar_id
    and (
      guitars.owner_id = auth.uid()
      or exists (
        select 1 from public.profiles
        where profiles.id = auth.uid()
        and profiles.role = 'admin'
      )
    )
  )
);
