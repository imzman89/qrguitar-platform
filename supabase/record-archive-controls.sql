alter table public.guitars
  add column if not exists admin_archived_at timestamptz,
  add column if not exists admin_archived_by text,
  add column if not exists admin_archive_reason text,
  add column if not exists owner_removed_at timestamptz,
  add column if not exists owner_removed_by uuid,
  add column if not exists owner_removed_reason text;

create index if not exists guitars_admin_archive_idx
on public.guitars(admin_archived_at, visibility, created_at desc);

create index if not exists guitars_owner_removed_idx
on public.guitars(owner_removed_at, owner_id, created_at desc);
