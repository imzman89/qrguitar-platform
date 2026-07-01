-- QRguitar admin panel foundation.
-- Additive only. Does not delete users, records, photos, documents, transfers, or service history.

alter table public.profiles
  add column if not exists account_status text not null default 'active',
  add column if not exists account_locked_at timestamptz,
  add column if not exists account_locked_by text,
  add column if not exists account_lock_reason text,
  add column if not exists account_banned_at timestamptz,
  add column if not exists account_banned_by text,
  add column if not exists account_ban_reason text,
  add column if not exists hide_public_content boolean not null default false,
  add column if not exists admin_notes text;

alter table public.profiles
  drop constraint if exists profiles_account_status_check;

alter table public.profiles
  add constraint profiles_account_status_check
  check (account_status in ('active', 'locked', 'banned'));

create table if not exists public.admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_email text,
  action text not null,
  target_type text,
  target_id text,
  target_user_id uuid references auth.users(id) on delete set null,
  reason text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists profiles_account_status_idx
on public.profiles(account_status);

create index if not exists profiles_hide_public_content_idx
on public.profiles(hide_public_content);

create index if not exists admin_audit_events_created_idx
on public.admin_audit_events(created_at desc);

create index if not exists admin_audit_events_target_user_idx
on public.admin_audit_events(target_user_id, created_at desc);

grant select on public.profiles to authenticated, service_role;
grant update on public.profiles to service_role;
grant select, insert on public.admin_audit_events to service_role;
grant select on public.admin_audit_events to authenticated;

alter table public.admin_audit_events enable row level security;

drop policy if exists "Admins read audit events" on public.admin_audit_events;
create policy "Admins read audit events"
on public.admin_audit_events for select
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
    and profiles.role in ('owner', 'admin')
  )
);

drop policy if exists "Service role writes audit events" on public.admin_audit_events;
create policy "Service role writes audit events"
on public.admin_audit_events for insert
with check (false);
