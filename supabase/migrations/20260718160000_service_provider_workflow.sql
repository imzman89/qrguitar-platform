-- QRguitar service-provider workflow.
-- Additive only. Private workflow tables are accessed through authenticated server routes.

create extension if not exists pgcrypto;

create table if not exists public.service_provider_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  business_name text not null default '',
  public_display_name text not null default '',
  website text,
  location text,
  service_categories text[] not null default '{}',
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'verified')),
  verified_at timestamptz,
  verified_by uuid references auth.users(id) on delete set null,
  internal_review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.service_provider_profile_access (
  id uuid primary key default gen_random_uuid(),
  guitar_id uuid not null references public.guitars(id) on delete cascade,
  provider_user_id uuid not null references auth.users(id) on delete cascade,
  granted_by_user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (guitar_id, provider_user_id)
);

create table if not exists public.service_submissions (
  id uuid primary key default gen_random_uuid(),
  guitar_id uuid not null references public.guitars(id) on delete cascade,
  provider_user_id uuid not null references auth.users(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'changes_requested', 'approved', 'declined', 'cancelled', 'expired')),
  service_date date,
  service_type text not null default 'Other',
  title text not null default '',
  work_performed text not null default '',
  parts_installed text,
  setup_measurements text,
  work_order_reference text,
  recommended_public_description text,
  private_provider_note text,
  owner_visibility_choice text not null default 'private'
    check (owner_visibility_choice in ('public', 'private')),
  provider_revision integer not null default 1 check (provider_revision > 0),
  owner_review_note text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  approved_at timestamptz,
  declined_at timestamptz,
  cancelled_at timestamptz,
  expires_at timestamptz,
  resulting_service_event_id uuid references public.guitar_timeline_events(id) on delete set null,
  resulting_timeline_event_id uuid references public.guitar_timeline_events(id) on delete set null,
  email_delivery_status text not null default 'not_attempted'
    check (email_delivery_status in ('not_attempted', 'sent', 'failed')),
  email_delivery_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.service_submission_evidence (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.service_submissions(id) on delete cascade,
  uploaded_by_user_id uuid not null references auth.users(id) on delete cascade,
  evidence_type text not null default 'other',
  file_name text not null,
  mime_type text not null,
  file_size_bytes bigint not null check (file_size_bytes > 0 and file_size_bytes <= 15728640),
  storage_path text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.service_submission_tokens (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.service_submissions(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.service_submission_activity (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.service_submissions(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.service_submission_notifications (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.service_submissions(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.guitar_timeline_events
  add column if not exists source_kind text not null default 'owner_reported',
  add column if not exists provider_user_id uuid references auth.users(id) on delete set null,
  add column if not exists provider_display_name text,
  add column if not exists provider_verified_at_snapshot timestamptz,
  add column if not exists service_submission_id uuid,
  add column if not exists evidence_reviewed_at timestamptz,
  add column if not exists evidence_reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists work_order_reference text,
  add column if not exists parts_installed text,
  add column if not exists setup_measurements text,
  add column if not exists who_performed text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'guitar_timeline_service_submission_fk'
  ) then
    alter table public.guitar_timeline_events
      add constraint guitar_timeline_service_submission_fk
      foreign key (service_submission_id)
      references public.service_submissions(id)
      on delete set null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'guitar_timeline_who_performed_check'
  ) then
    alter table public.guitar_timeline_events
      add constraint guitar_timeline_who_performed_check
      check (who_performed is null or who_performed in ('self', 'shop', 'unknown'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'guitar_timeline_source_kind_check'
  ) then
    alter table public.guitar_timeline_events
      add constraint guitar_timeline_source_kind_check
      check (source_kind in ('owner_reported', 'provider_submitted_owner_approved'));
  end if;
end $$;

create index if not exists service_submissions_owner_status_idx
  on public.service_submissions(owner_user_id, status, submitted_at desc);
create index if not exists service_submissions_provider_status_idx
  on public.service_submissions(provider_user_id, status, updated_at desc);
create index if not exists service_submissions_guitar_idx
  on public.service_submissions(guitar_id, created_at desc);
create index if not exists service_submission_activity_submission_idx
  on public.service_submission_activity(submission_id, created_at asc);
create index if not exists service_notifications_recipient_idx
  on public.service_submission_notifications(recipient_user_id, read_at, created_at desc);
create unique index if not exists service_submission_active_work_order_unique
  on public.service_submissions(guitar_id, provider_user_id, lower(work_order_reference))
  where work_order_reference is not null
    and length(btrim(work_order_reference)) > 0
    and status in ('draft', 'submitted', 'changes_requested');
create unique index if not exists guitar_timeline_service_submission_unique
  on public.guitar_timeline_events(service_submission_id)
  where service_submission_id is not null;

alter table public.service_provider_profiles enable row level security;
alter table public.service_provider_profile_access enable row level security;
alter table public.service_submissions enable row level security;
alter table public.service_submission_evidence enable row level security;
alter table public.service_submission_tokens enable row level security;
alter table public.service_submission_activity enable row level security;
alter table public.service_submission_notifications enable row level security;

-- No client policies are intentional. Server routes authenticate the user and use
-- the service-role client after enforcing owner/provider/admin authorization.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'service-evidence',
  'service-evidence',
  false,
  15728640,
  array['image/jpeg','image/png','image/webp','application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.approve_service_submission(
  p_submission_id uuid,
  p_owner_user_id uuid,
  p_token_hash text default null
)
returns table(service_event_id uuid, timeline_event_id uuid, already_approved boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_submission public.service_submissions%rowtype;
  v_provider public.service_provider_profiles%rowtype;
  v_event_id uuid;
  v_token public.service_submission_tokens%rowtype;
begin
  select * into v_submission
  from public.service_submissions
  where id = p_submission_id
  for update;

  if not found then
    raise exception 'Service submission was not found.' using errcode = 'P0002';
  end if;

  if v_submission.owner_user_id <> p_owner_user_id then
    raise exception 'Only the current Profile owner can approve this submission.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.guitars g
    where g.id = v_submission.guitar_id and g.owner_id = p_owner_user_id
  ) then
    raise exception 'Profile ownership changed. Review must be restarted.' using errcode = '42501';
  end if;

  if v_submission.provider_user_id = p_owner_user_id then
    raise exception 'A provider cannot approve service work for their own Profile.' using errcode = '42501';
  end if;

  if p_token_hash is not null then
    select * into v_token
    from public.service_submission_tokens
    where submission_id = v_submission.id and token_hash = p_token_hash
    for update;

    if not found or v_token.consumed_at is not null or v_token.expires_at <= now() then
      insert into public.service_submission_activity(submission_id, actor_user_id, action)
      values (v_submission.id, p_owner_user_id, 'review_token_rejected');
      raise exception 'This review link is invalid, expired, or already used.' using errcode = '22023';
    end if;
  end if;

  if v_submission.status = 'approved' then
    return query select
      v_submission.resulting_service_event_id,
      v_submission.resulting_timeline_event_id,
      true;
    return;
  end if;

  if v_submission.status <> 'submitted' then
    raise exception 'Only a submitted request can be approved.' using errcode = '22023';
  end if;

  if v_submission.expires_at is not null and v_submission.expires_at <= now() then
    update public.service_submissions set status = 'expired', updated_at = now() where id = v_submission.id;
    raise exception 'This review request expired.' using errcode = '22023';
  end if;

  select * into v_provider from public.service_provider_profiles where user_id = v_submission.provider_user_id;

  insert into public.guitar_timeline_events (
    guitar_id, created_by_user_id, event_date, date_precision, category, event_type,
    title, description, private_notes, shop_name, is_public, source_key, source_kind,
    provider_user_id, provider_display_name, provider_verified_at_snapshot,
    service_submission_id, work_order_reference, parts_installed, setup_measurements,
    created_at, updated_at
  ) values (
    v_submission.guitar_id,
    v_submission.provider_user_id,
    v_submission.service_date,
    case when v_submission.service_date is null then 'unknown' else 'day' end,
    v_submission.service_type,
    v_submission.service_type,
    v_submission.title,
    coalesce(nullif(v_submission.recommended_public_description, ''), v_submission.work_performed),
    v_submission.private_provider_note,
    coalesce(nullif(v_provider.public_display_name, ''), nullif(v_provider.business_name, ''), 'Service provider'),
    v_submission.owner_visibility_choice = 'public',
    'provider-submission:' || v_submission.id::text,
    'provider_submitted_owner_approved',
    v_submission.provider_user_id,
    coalesce(nullif(v_provider.public_display_name, ''), nullif(v_provider.business_name, ''), 'Service provider'),
    case when v_provider.verification_status = 'verified' then v_provider.verified_at else null end,
    v_submission.id,
    v_submission.work_order_reference,
    v_submission.parts_installed,
    v_submission.setup_measurements,
    now(), now()
  )
  on conflict (service_submission_id) where service_submission_id is not null
  do update set updated_at = public.guitar_timeline_events.updated_at
  returning id into v_event_id;

  update public.service_submissions set
    status = 'approved', reviewed_at = now(), approved_at = now(),
    resulting_service_event_id = v_event_id,
    resulting_timeline_event_id = v_event_id,
    updated_at = now()
  where id = v_submission.id;

  update public.service_submission_tokens set consumed_at = now()
  where submission_id = v_submission.id and consumed_at is null;

  insert into public.service_submission_activity(submission_id, actor_user_id, action, metadata)
  values (v_submission.id, p_owner_user_id, 'approved', jsonb_build_object('canonical_event_id', v_event_id));

  insert into public.service_submission_notifications(submission_id, recipient_user_id, notification_type, message)
  values (v_submission.id, v_submission.provider_user_id, 'approved', 'Your service submission was approved by the Profile owner.');

  return query select v_event_id, v_event_id, false;
end;
$$;

revoke all on function public.approve_service_submission(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.approve_service_submission(uuid, uuid, text) to service_role;

comment on function public.approve_service_submission(uuid, uuid, text) is
  'Atomically approves one provider submission and creates exactly one canonical timeline/service row.';
