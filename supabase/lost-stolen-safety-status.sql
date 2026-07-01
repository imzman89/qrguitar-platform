alter table public.guitars
  add column if not exists safety_status text not null default 'clear',
  add column if not exists safety_status_updated_at timestamptz,
  add column if not exists safety_status_updated_by uuid references auth.users(id) on delete set null,
  add column if not exists safety_note text,
  add column if not exists public_safety_note text;

alter table public.guitars
  drop constraint if exists guitars_safety_status_check;

alter table public.guitars
  add constraint guitars_safety_status_check
  check (safety_status in ('clear', 'lost', 'stolen', 'recovered'));

create index if not exists guitars_safety_status_idx
on public.guitars(safety_status, visibility, created_at desc);
