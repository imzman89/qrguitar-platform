-- Durable, fail-closed account-deletion fulfillment.
--
-- Permanent instrument Profiles and factual history survive. The target's Auth
-- identity is deleted only after this transaction has removed database identity
-- links and only when no payment, storage, or unresolved workflow needs a human
-- decision. Those cases remain resumable, explicit blockers; this migration
-- never invents a refund or forfeits a purchased credit.
begin;

alter table public.account_deletion_request_receipts
  drop constraint account_deletion_request_receipts_request_id_actor_id_fkey;
alter table public.account_deletion_requests
  drop constraint account_deletion_requests_actor_id_fkey,
  alter column actor_id drop not null,
  add constraint account_deletion_requests_actor_id_fkey
    foreign key(actor_id) references auth.users(id) on delete set null;
alter table public.account_deletion_request_receipts
  add constraint account_deletion_request_receipts_request_id_actor_id_fkey
    foreign key(request_id,actor_id) references public.account_deletion_requests(id,actor_id) on delete restrict;

create table public.account_deletion_fulfillments (
  request_id uuid primary key references public.account_deletion_requests(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  subject_token uuid not null default gen_random_uuid() unique,
  actor_fingerprint bytea not null unique check(octet_length(actor_fingerprint)=32),
  target_email text,
  state text not null default 'blocked'
    check(state in ('blocked','quiescing_storage','ready_for_auth_deletion','completed')),
  blockers jsonb not null default '[]'::jsonb
    check(jsonb_typeof(blockers)='array' and jsonb_array_length(blockers)<=20),
  revision bigint not null default 0 check(revision>=0),
  started_by uuid,
  last_reviewed_by uuid,
  started_at timestamptz not null default clock_timestamp(),
  reviewed_at timestamptz not null default clock_timestamp(),
  storage_quiesce_until timestamptz,
  database_anonymized_at timestamptz,
  auth_deleted_at timestamptz,
  completed_at timestamptz,
  check(
    (state='blocked' and actor_id is not null and target_email is not null and storage_quiesce_until is null and database_anonymized_at is null and auth_deleted_at is null and completed_at is null and jsonb_array_length(blockers)>0)
    or (state='quiescing_storage' and actor_id is not null and target_email is not null and storage_quiesce_until is not null and database_anonymized_at is null and auth_deleted_at is null and completed_at is null and jsonb_array_length(blockers)>0)
    or (state='ready_for_auth_deletion' and target_email is null and storage_quiesce_until is not null and database_anonymized_at>=storage_quiesce_until and auth_deleted_at is null and completed_at is null and blockers='[]'::jsonb)
    or (state='completed' and actor_id is null and target_email is null and storage_quiesce_until is not null and database_anonymized_at>=storage_quiesce_until and auth_deleted_at is not null and completed_at is not null and blockers='[]'::jsonb)
  )
);
create unique index account_deletion_one_fulfillment_actor
  on public.account_deletion_fulfillments(actor_id) where actor_id is not null and state<>'completed';
create index account_deletion_fulfillment_queue
  on public.account_deletion_fulfillments(state,reviewed_at,request_id);

create table public.account_deletion_fulfillment_receipts (
  operation_id uuid primary key,
  request_id uuid not null references public.account_deletion_fulfillments(request_id) on delete restrict,
  action text not null check(action in ('prepare','complete')),
  result jsonb not null check(jsonb_typeof(result)='object'),
  recorded_at timestamptz not null default clock_timestamp()
);
create index account_deletion_fulfillment_receipt_request
  on public.account_deletion_fulfillment_receipts(request_id,recorded_at,operation_id);

create table public.account_deletion_profile_custody (
  guitar_id uuid primary key references public.guitars(id) on delete restrict,
  request_id uuid not null references public.account_deletion_fulfillments(request_id) on delete restrict,
  prior_visibility public.guitar_visibility not null,
  state text not null default 'privacy_review_required' check(state='privacy_review_required'),
  held_at timestamptz not null default clock_timestamp(),
  unique(request_id,guitar_id)
);
comment on table public.account_deletion_profile_custody is
  'Ownerless permanent Profiles are forced private and held here for a future owner/admin privacy review. This release never republishes them automatically.';

comment on table public.account_deletion_fulfillments is
  'Private deletion state machine. Blockers are stable machine codes, never customer content. ready_for_auth_deletion means database identity links are removed; only completed means the Auth identity is absent.';
comment on table public.account_deletion_fulfillment_receipts is
  'Idempotency receipts for administrator prepare/complete actions. Results contain status and blocker codes only, never the target Auth UUID, email, storage path, or payment identifier.';

alter table public.account_deletion_fulfillments enable row level security;
alter table public.account_deletion_fulfillment_receipts enable row level security;
alter table public.account_deletion_profile_custody enable row level security;
revoke all on public.account_deletion_fulfillments,public.account_deletion_fulfillment_receipts,public.account_deletion_profile_custody
  from public,anon,authenticated,service_role;
create policy account_deletion_fulfillments_no_direct_access on public.account_deletion_fulfillments
  as restrictive for all to public using(false) with check(false);
create policy account_deletion_fulfillment_receipts_no_direct_access on public.account_deletion_fulfillment_receipts
  as restrictive for all to public using(false) with check(false);
create policy account_deletion_profile_custody_no_direct_access on public.account_deletion_profile_custody
  as restrictive for all to public using(false) with check(false);

create function public._account_deletion_fulfillment_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare permitted text:=current_setting('qrguitar.account_deletion_request',true);
  reviewer text:=current_setting('qrguitar.account_deletion_reviewer',true);
begin
  if tg_table_name='account_deletion_fulfillment_receipts' then
    if tg_op='DELETE' and permitted=old.request_id::text then return old; end if;
    raise exception using errcode='42501',message='Account deletion fulfillment receipts are immutable.';
  end if;
  if tg_table_name='account_deletion_profile_custody' then
    raise exception using errcode='42501',message='Account deletion Profile custody is immutable.';
  end if;
  if tg_op='UPDATE' and nullif(reviewer,'') is not null
    and new.request_id=old.request_id and new.actor_id is not distinct from old.actor_id
    and new.subject_token=old.subject_token and new.actor_fingerprint=old.actor_fingerprint
    and new.target_email is not distinct from old.target_email
    and new.state=old.state and new.blockers=old.blockers and new.revision=old.revision
    and new.started_by is not distinct from (case when old.started_by::text=reviewer then null else old.started_by end)
    and new.last_reviewed_by is not distinct from (case when old.last_reviewed_by::text=reviewer then null else old.last_reviewed_by end)
    and new.started_at=old.started_at and new.reviewed_at=old.reviewed_at
    and new.storage_quiesce_until is not distinct from old.storage_quiesce_until
    and new.database_anonymized_at is not distinct from old.database_anonymized_at
    and new.auth_deleted_at is not distinct from old.auth_deleted_at and new.completed_at is not distinct from old.completed_at then
    return new;
  end if;
  -- The Auth foreign key performs this single transition during provider
  -- deletion. Direct table access is revoked, and every other field remains
  -- guarded; the finalizer independently requires this transition.
  if tg_op='UPDATE' and old.state='ready_for_auth_deletion' and old.actor_id is not null and new.actor_id is null
    and new.request_id=old.request_id and new.subject_token=old.subject_token and new.actor_fingerprint=old.actor_fingerprint
    and new.target_email is not distinct from old.target_email
    and new.state=old.state and new.blockers=old.blockers and new.revision=old.revision
    and new.started_by is not distinct from old.started_by and new.last_reviewed_by is not distinct from old.last_reviewed_by
    and new.started_at=old.started_at and new.reviewed_at=old.reviewed_at
    and new.storage_quiesce_until=old.storage_quiesce_until
    and new.database_anonymized_at=old.database_anonymized_at and new.auth_deleted_at is not distinct from old.auth_deleted_at
    and new.completed_at is not distinct from old.completed_at then return new;
  end if;
  if permitted is null or permitted<>old.request_id::text then
    raise exception using errcode='42501',message='Account deletion fulfillment may change only through its reviewed protocol.';
  end if;
  if tg_op='DELETE' and old.state='blocked' then return old; end if;
  if tg_op='DELETE' or new.request_id is distinct from old.request_id
    or new.subject_token is distinct from old.subject_token
    or (old.target_email is null and new.target_email is not null)
    or new.started_by is distinct from old.started_by or new.started_at is distinct from old.started_at then
    raise exception using errcode='42501',message='Account deletion fulfillment identity is immutable.';
  end if;
  return new;
end $$;
create trigger account_deletion_fulfillments_guard before update or delete
  on public.account_deletion_fulfillments for each row execute function public._account_deletion_fulfillment_guard();
create trigger account_deletion_fulfillment_receipts_immutable before update or delete
  on public.account_deletion_fulfillment_receipts for each row execute function public._account_deletion_fulfillment_guard();
create trigger account_deletion_profile_custody_immutable before update or delete
  on public.account_deletion_profile_custody for each row execute function public._account_deletion_fulfillment_guard();

-- The deletion release intentionally has no custody-release mutation. A held
-- Profile remains private, ownerless, and unclaimable until a separately
-- reviewed release protocol is deployed. This prevents existing transfer and
-- claim functions from accidentally exposing retained free-form history.
create function public._account_deletion_custody_fence() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare held_request uuid; permitted text:=current_setting('qrguitar.account_deletion_request',true);
begin
  if tg_table_name='guitars' then
    select request_id into held_request from public.account_deletion_profile_custody where guitar_id=old.id;
    if held_request is null then return case when tg_op='DELETE' then old else new end; end if;
    if permitted=held_request::text then return case when tg_op='DELETE' then old else new end; end if;
    if tg_op='DELETE' or new.owner_id is not null or new.visibility<>'private' then
      raise exception using errcode='PD423',message='This retained Profile is in privacy custody.';
    end if;
    return new;
  end if;
  if tg_op='INSERT' then
    select request_id into held_request from public.account_deletion_profile_custody where guitar_id=new.guitar_id;
  elsif tg_op='DELETE' then
    select request_id into held_request from public.account_deletion_profile_custody where guitar_id=old.guitar_id;
  else
    select request_id into held_request from public.account_deletion_profile_custody
      where guitar_id in (old.guitar_id,new.guitar_id) order by guitar_id limit 1;
  end if;
  if held_request is not null and permitted is distinct from held_request::text then
    raise exception using errcode='PD423',message='This retained Profile must pass privacy review before a claim or transfer.';
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
create trigger account_deletion_custody_guitar before update or delete on public.guitars
  for each row execute function public._account_deletion_custody_fence();
create trigger account_deletion_custody_transfer before insert or update or delete on public.ownership_transfers
  for each row execute function public._account_deletion_custody_fence();
create trigger account_deletion_custody_claim before insert or update or delete on public.ownership_claims
  for each row execute function public._account_deletion_custody_fence();

-- Every actor-bearing write shares the per-actor privacy advisory lock used by
-- intake and fulfillment. This also serializes actors without a Profile row.
-- A write that began earlier finishes before intake/prepare; a later write sees
-- the freeze/tombstone and fails. While a deletion request is active, a caller
-- cannot detach its actor UUID and strand associated free text outside the
-- anonymizer. Row deletion remains safe because it removes the associated data.
create function public._account_deletion_write_fence() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare column_name text; actor uuid; old_actor uuid; new_actor uuid; status text;
  email_column text; email_value text; old_email text; new_email text;
  actors uuid[]:='{}'::uuid[]; emails text[]:='{}'::text[]; new_emails text[]:='{}'::text[];
  permitted text:=current_setting('qrguitar.account_deletion_request',true);
begin
  -- Acquire multiple actor locks in UUID order so cross-account updates cannot
  -- deadlock one another. OLD matters: changing an actor link is itself a
  -- privacy-sensitive write even when NEW is null.
  foreach column_name in array tg_argv loop
    if left(column_name,7)='email__' then
      email_column:=substr(column_name,8); old_email:=null; new_email:=null;
      if tg_op<>'INSERT' then old_email:=lower(btrim(nullif(to_jsonb(old)->>email_column,''))); end if;
      if tg_op<>'DELETE' then new_email:=lower(btrim(nullif(to_jsonb(new)->>email_column,''))); end if;
      if old_email is not null then emails:=array_append(emails,old_email); end if;
      if new_email is not null then
        emails:=array_append(emails,new_email);
        if tg_op='INSERT' or new_email is distinct from old_email then new_emails:=array_append(new_emails,new_email); end if;
      end if;
      continue;
    end if;
    old_actor:=null; new_actor:=null;
    begin
      if tg_op<>'INSERT' then old_actor:=nullif(to_jsonb(old)->>column_name,'')::uuid; end if;
      if tg_op<>'DELETE' then new_actor:=nullif(to_jsonb(new)->>column_name,'')::uuid; end if;
    exception when invalid_text_representation then
      raise exception using errcode='22023',message='Invalid account identity.';
    end;
    if old_actor is not null then actors:=array_append(actors,old_actor); end if;
    if new_actor is not null then actors:=array_append(actors,new_actor); end if;
  end loop;
  for actor in select distinct a.value from unnest(actors) a(value) order by a.value loop
    -- Writers can arrive here while already holding an older create/Profile
    -- lock. Never wait behind fulfillment while holding that lock: an immediate,
    -- retryable rejection breaks the legacy lock-order cycle. If this try-lock
    -- succeeds, intake/prepare waits for this transaction and observes it.
    if not pg_try_advisory_xact_lock(hashtextextended('qrguitar:privacy-request:'||actor::text,0)) then
      raise exception using errcode='PD423',message='This account has a privacy change in progress; retry the operation.';
    end if;
  end loop;
  -- Recipient email is itself an account association even when no target UUID
  -- is present in the invite row. Serialize it with fulfillment so a transfer
  -- or claim cannot land after the target-email inventory has been scanned.
  for email_value in select distinct e.value from unnest(emails) e(value) order by e.value loop
    if not pg_try_advisory_xact_lock(hashtextextended('qrguitar:privacy-email:'||email_value,0)) then
      raise exception using errcode='PD423',message='This recipient has a privacy change in progress; retry the operation.';
    end if;
  end loop;
  if tg_table_schema='auth' and tg_table_name='users' and old_email is distinct from new_email
    and exists(select 1 from public.account_deletion_requests r where r.actor_id=old_actor and r.status='requested') then
    raise exception using errcode='PD423',message='This account email is frozen for privacy fulfillment.';
  end if;

  if tg_op='UPDATE' then
    foreach column_name in array tg_argv loop
      if left(column_name,7)='email__' then continue; end if;
      old_actor:=nullif(to_jsonb(old)->>column_name,'')::uuid;
      new_actor:=nullif(to_jsonb(new)->>column_name,'')::uuid;
      if old_actor is not null and new_actor is distinct from old_actor then
        if not exists(
          select 1 from public.account_deletion_fulfillments f
          where f.request_id::text=permitted and f.actor_id=old_actor and f.state in ('blocked','quiescing_storage')
        ) and (exists(
          select 1 from public.account_deletion_requests r where r.actor_id=old_actor and r.status='requested'
        ) or exists(
          select 1 from public.account_deletion_fulfillments f where f.state in ('ready_for_auth_deletion','completed')
            and f.actor_fingerprint=sha256(convert_to(old_actor::text||':'||f.subject_token::text,'UTF8'))
        )) then
          raise exception using errcode='PD423',message='This account is frozen for privacy fulfillment.';
        end if;
      end if;
    end loop;
  end if;

  if tg_op='DELETE' then return old; end if;
  foreach column_name in array tg_argv loop
    if left(column_name,7)='email__' then continue; end if;
    new_actor:=nullif(to_jsonb(new)->>column_name,'')::uuid;
    if new_actor is not null then
      select account_status into status from public.profiles where id=new_actor for share;
      if (status='removed' or exists(
        select 1 from public.account_deletion_fulfillments f
          where f.state in ('ready_for_auth_deletion','completed')
          and f.actor_fingerprint=sha256(convert_to(new_actor::text||':'||f.subject_token::text,'UTF8')))) and not exists(
        select 1 from public.account_deletion_fulfillments f where f.request_id::text=permitted
          and f.actor_id=new_actor and f.state in ('blocked','quiescing_storage')
      ) then
        raise exception using errcode='PD423',message='This account is frozen for privacy fulfillment.';
      end if;
    end if;
  end loop;
  foreach email_value in array new_emails loop
    if email_value is not null and exists(select 1 from auth.users u where lower(btrim(u.email))=email_value and (
      exists(select 1 from public.account_deletion_requests r where r.actor_id=u.id and r.status='requested')
      or exists(select 1 from public.account_deletion_fulfillments f where f.actor_id=u.id and f.state in ('blocked','quiescing_storage','ready_for_auth_deletion'))
    )) then
      raise exception using errcode='PD423',message='This recipient is frozen for privacy fulfillment.';
    end if;
  end loop;
  return new;
end $$;

do $fences$
declare item text; table_name text; columns text; trigger_name text;
begin
  foreach item in array array[
    'profiles:id','guitars:owner_id,safety_status_updated_by,owner_removed_by',
    'guitar_documents:uploaded_by_user_id','guitar_timeline_events:created_by_user_id,provider_user_id,evidence_reviewed_by',
    'guitar_serial_aliases:created_by','guitar_external_media:created_by',
    'ownership_transfers:from_owner_id,accepted_by,email__to_email','ownership_claims:current_owner_id,claimant_user_id,decided_by,email__recipient_email_normalized',
    'ownership_claim_evidence:uploaded_by','ownership_claim_events:actor_user_id',
    'service_provider_profiles:user_id,verified_by','service_provider_profile_access:provider_user_id,granted_by_user_id',
    'service_submissions:provider_user_id,owner_user_id','service_submission_evidence:uploaded_by_user_id',
    'service_submission_activity:actor_user_id','service_submission_notifications:recipient_user_id',
    'service_evidence_uploads:actor_id','service_evidence_upload_scopes:actor_id','service_evidence_upload_discard_receipts:actor_id',
    'instrument_staged_uploads:owner_id','instrument_create_receipts:owner_id','site_content:updated_by','site_editor_receipts:actor_user_id',
    'billing_customers:owner_id','billing_orders:owner_id','billing_receipts:owner_id','billing_credit_grants:owner_id',
    'billing_credit_consumptions:owner_id','billing_credit_holds:owner_id','billing_review_decisions:owner_id,operator_id',
    'billing_direct_orders:owner_id','billing_direct_payments:operator_id','billing_paypal_orders:owner_id',
    'billing_paypal_webhook_admin_actions:operator_id','admin_audit_events:actor_user_id,target_user_id'
  ] loop
    table_name:=split_part(item,':',1); columns:=split_part(item,':',2);
    trigger_name:='account_deletion_fence_'||table_name;
    execute format('drop trigger if exists %I on public.%I',trigger_name,table_name);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public._account_deletion_write_fence(%s)',
      trigger_name,table_name,(select string_agg(quote_literal(value),',') from unnest(string_to_array(columns,',')) value));
  end loop;
end $fences$;

create trigger account_deletion_fence_auth_users before update of email on auth.users
  for each row execute function public._account_deletion_write_fence('id','email__email');

-- Intake remains available to locked or banned people, but once fulfillment
-- freezes an identity no second request may race in behind it. Taking the same
-- Profile-row lock as every actor-bearing writer makes this decision serialize
-- with prepare; the fingerprint still rejects a recreated Auth UUID later.
create or replace function public._account_deletion_lock_actor(p_actor_id uuid) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if p_actor_id is null then raise exception using errcode='22023',message='Verified account identity is required.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('qrguitar:privacy-request:'||p_actor_id::text,0));
  perform 1 from auth.users where id=p_actor_id for key share;
  if not found then raise exception using errcode='PD401',message='Verified account identity is unavailable.'; end if;
  perform 1 from public.profiles where id=p_actor_id for share;
  if exists(select 1 from public.account_deletion_fulfillments f
    where f.state in ('ready_for_auth_deletion','completed')
      and f.actor_fingerprint=sha256(convert_to(p_actor_id::text||':'||f.subject_token::text,'UTF8'))) then
    raise exception using errcode='PD409',message='Account deletion fulfillment has already started.';
  end if;
end $$;

create function public._account_deletion_admin(p_actor_id uuid,p_environment_admin boolean) returns void
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare reviewer public.profiles;
begin
  if p_actor_id is null or not exists(select 1 from auth.users where id=p_actor_id) then
    raise exception using errcode='PD401',message='Verified administrator identity is unavailable.';
  end if;
  select * into reviewer from public.profiles where id=p_actor_id;
  if p_environment_admin is not true and (reviewer.id is null or reviewer.role::text is distinct from 'admin' or reviewer.account_status is distinct from 'active') then
    raise exception using errcode='PD403',message='Administrator access is required.';
  end if;
end $$;

create function public._account_deletion_fulfillment_json(p_job public.account_deletion_fulfillments) returns jsonb
language sql stable set search_path=pg_catalog,public as $$
  select jsonb_build_object('requestId',p_job.request_id,'state',p_job.state,'blockers',p_job.blockers,
    'revision',p_job.revision::text,'startedAt',p_job.started_at,'reviewedAt',p_job.reviewed_at,
    'storageQuiesceUntil',p_job.storage_quiesce_until,
    'databaseAnonymizedAt',p_job.database_anonymized_at,'authDeletedAt',p_job.auth_deleted_at,'completedAt',p_job.completed_at)
$$;

create function public._account_deletion_text_has_identity(p_text text,p_actor_id uuid,p_email text) returns boolean
language sql immutable set search_path=pg_catalog,public as $$
  select strpos(lower(coalesce(p_text,'')),p_actor_id::text)>0
    or (p_email<>'' and strpos(lower(coalesce(p_text,'')),p_email)>0)
$$;

-- Scan user-authored content that is not selected for deterministic scrubbing
-- by its current owner/actor linkage. This catches transferred Profiles and
-- other historical rows whose free text still names the departing person.
create function public._account_deletion_unscoped_personal_content(p_actor_id uuid,p_email text) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
  select exists(select 1 from public.profiles p where p.id<>p_actor_id and (
      public._account_deletion_text_has_identity(concat_ws('|',p.display_name,p.admin_notes),p_actor_id,p_email)
      or ((p_email='' or lower(coalesce(p.account_locked_by,''))<>p_email) and public._account_deletion_text_has_identity(p.account_lock_reason,p_actor_id,p_email))
      or ((p_email='' or lower(coalesce(p.account_banned_by,''))<>p_email) and public._account_deletion_text_has_identity(p.account_ban_reason,p_actor_id,p_email))))
  or exists(select 1 from public.guitars g where
      public._account_deletion_text_has_identity(concat_ws('|',g.brand,g.model,g.year,g.serial_number),p_actor_id,p_email)
      or (g.owner_id is distinct from p_actor_id and (
      public._account_deletion_text_has_identity(concat_ws('|',g.name,g.builder,g.location,g.summary,g.hero_image_path),p_actor_id,p_email)
      or (g.safety_status_updated_by is distinct from p_actor_id and public._account_deletion_text_has_identity(concat_ws('|',g.safety_note,g.public_safety_note),p_actor_id,p_email))
      or (g.owner_removed_by is distinct from p_actor_id and public._account_deletion_text_has_identity(g.owner_removed_reason,p_actor_id,p_email))
      or ((p_email='' or lower(coalesce(g.admin_archived_by,''))<>p_email) and public._account_deletion_text_has_identity(g.admin_archive_reason,p_actor_id,p_email)))))
  or exists(select 1 from public.guitar_specs s join public.guitars g on g.id=s.guitar_id
    where g.owner_id is distinct from p_actor_id and public._account_deletion_text_has_identity(concat_ws('|',s.label,s.value),p_actor_id,p_email))
  or exists(select 1 from public.guitar_media m join public.guitars g on g.id=m.guitar_id
    where g.owner_id is distinct from p_actor_id and public._account_deletion_text_has_identity(concat_ws('|',m.storage_path,m.alt),p_actor_id,p_email))
  or exists(select 1 from public.guitar_documents d join public.guitars g on g.id=d.guitar_id
    where g.owner_id is distinct from p_actor_id and d.uploaded_by_user_id is distinct from p_actor_id
      and public._account_deletion_text_has_identity(
      concat_ws('|',d.name,d.storage_path,d.document_type,d.file_name,d.public_description,d.private_notes,d.category,d.issuer_source,d.description),p_actor_id,p_email))
  or exists(select 1 from public.guitar_external_media x join public.guitars g on g.id=x.guitar_id
    where g.owner_id is distinct from p_actor_id and x.created_by is distinct from p_actor_id
      and public._account_deletion_text_has_identity(concat_ws('|',x.canonical_url,x.provider_id,x.title,x.caption,x.thumbnail_url),p_actor_id,p_email))
  or exists(select 1 from public.guitar_serial_aliases a where
    public._account_deletion_text_has_identity(concat_ws('|',a.serial_display,a.serial_normalized),p_actor_id,p_email))
  or exists(select 1 from public.guitar_timeline_events e join public.guitars g on g.id=e.guitar_id
    where g.owner_id is distinct from p_actor_id and e.created_by_user_id is distinct from p_actor_id
      and e.provider_user_id is distinct from p_actor_id and e.evidence_reviewed_by is distinct from p_actor_id
      and public._account_deletion_text_has_identity(concat_ws('|',e.event_type,e.title,e.description,e.private_notes,e.shop_name,e.location,e.category,
        e.source_key,e.provider_display_name,e.work_order_reference,e.parts_installed,e.setup_measurements),p_actor_id,p_email))
  or exists(select 1 from public.ownership_transfers t where t.from_owner_id is distinct from p_actor_id
    and t.accepted_by is distinct from p_actor_id and (p_email='' or lower(btrim(t.to_email))<>p_email)
    and public._account_deletion_text_has_identity(concat_ws('|',t.to_name,t.fee_waived_reason),p_actor_id,p_email))
  or exists(select 1 from public.ownership_claims c where c.current_owner_id is distinct from p_actor_id
    and c.claimant_user_id is distinct from p_actor_id and c.decided_by is distinct from p_actor_id
    and (p_email='' or lower(btrim(c.recipient_email_normalized))<>p_email)
    and public._account_deletion_text_has_identity(concat_ws('|',c.acquisition_details,c.ownership_declaration,c.owner_response_note,c.admin_review_note),p_actor_id,p_email))
  or exists(select 1 from public.ownership_claim_evidence e join public.ownership_claims c on c.id=e.claim_id
    where e.uploaded_by is distinct from p_actor_id and c.current_owner_id is distinct from p_actor_id
      and c.claimant_user_id is distinct from p_actor_id and c.decided_by is distinct from p_actor_id
      and (p_email='' or lower(btrim(c.recipient_email_normalized))<>p_email)
      and public._account_deletion_text_has_identity(concat_ws('|',e.evidence_type,e.file_name,e.storage_path,e.private_note),p_actor_id,p_email))
  or exists(select 1 from public.ownership_claim_events e join public.ownership_claims c on c.id=e.claim_id
    where e.actor_user_id is distinct from p_actor_id and c.current_owner_id is distinct from p_actor_id
      and c.claimant_user_id is distinct from p_actor_id and c.decided_by is distinct from p_actor_id
      and (p_email='' or lower(btrim(c.recipient_email_normalized))<>p_email)
      and public._account_deletion_text_has_identity(concat_ws('|',e.note,e.metadata::text),p_actor_id,p_email))
  or exists(select 1 from public.service_provider_profiles p where p.user_id<>p_actor_id and (
      public._account_deletion_text_has_identity(concat_ws('|',p.business_name,p.public_display_name,p.website,p.location,p.service_categories::text),p_actor_id,p_email)
      or (p.verified_by is distinct from p_actor_id and public._account_deletion_text_has_identity(p.internal_review_note,p_actor_id,p_email))))
  or exists(select 1 from public.service_submissions s where s.provider_user_id is distinct from p_actor_id
    and s.owner_user_id is distinct from p_actor_id and public._account_deletion_text_has_identity(
      concat_ws('|',s.service_type,s.title,s.work_performed,s.parts_installed,s.setup_measurements,s.work_order_reference,
        s.recommended_public_description,s.private_provider_note,s.owner_review_note,s.email_delivery_message),p_actor_id,p_email))
  or exists(select 1 from public.service_submission_evidence e join public.service_submissions s on s.id=e.submission_id
    where e.uploaded_by_user_id is distinct from p_actor_id and s.provider_user_id is distinct from p_actor_id
      and s.owner_user_id is distinct from p_actor_id and public._account_deletion_text_has_identity(
        concat_ws('|',e.evidence_type,e.file_name,e.storage_path),p_actor_id,p_email))
  or exists(select 1 from public.service_submission_activity a where a.actor_user_id is distinct from p_actor_id
    and public._account_deletion_text_has_identity(concat_ws('|',a.note,a.metadata::text),p_actor_id,p_email))
  or exists(select 1 from public.service_submission_notifications n where n.recipient_user_id is distinct from p_actor_id
    and public._account_deletion_text_has_identity(n.message,p_actor_id,p_email))
  or exists(select 1 from public.service_evidence_uploads e where e.actor_id is distinct from p_actor_id
    and public._account_deletion_text_has_identity(concat_ws('|',e.file_name,e.storage_path,e.evidence_result::text),p_actor_id,p_email))
  or exists(select 1 from public.site_content s where (s.updated_by=p_actor_id or public._account_deletion_text_has_identity(
      concat_ws('|',s.content_key,s.content_value::text),p_actor_id,p_email))
    and s.content_key<>'public_collection_owner:'||p_actor_id::text
    and s.content_key not like 'create_submission:'||p_actor_id::text||':%'
    and coalesce(s.content_value->>'ownerId','')<>p_actor_id::text
    and not exists(select 1 from public.guitars g where g.owner_id=p_actor_id and s.content_key='record_trust:'||g.qr_code))
  or exists(select 1 from public.site_editor_receipts r where r.actor_user_id<>p_actor_id
    and public._account_deletion_text_has_identity(concat_ws('|',r.request_body::text,r.result::text),p_actor_id,p_email))
  or exists(select 1 from public.admin_audit_events a where a.actor_user_id is distinct from p_actor_id
    and a.target_user_id is distinct from p_actor_id and public._account_deletion_text_has_identity(
      concat_ws('|',a.actor_email,a.target_id,a.reason,a.metadata::text),p_actor_id,p_email))
$$;

create function public._account_deletion_billing_personal_content(p_actor_id uuid,p_email text) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
  select exists(select 1 from public.billing_orders b where public._account_deletion_text_has_identity(concat_ws('|',b.offer::text,b.last_error),p_actor_id,p_email))
  or exists(select 1 from public.billing_receipts b where public._account_deletion_text_has_identity(b.receipt::text,p_actor_id,p_email))
  or exists(select 1 from public.billing_credit_holds b where public._account_deletion_text_has_identity(b.reason,p_actor_id,p_email))
  or exists(select 1 from public.billing_review_decisions b where public._account_deletion_text_has_identity(b.reason,p_actor_id,p_email))
  or exists(select 1 from public.billing_direct_claims b where public._account_deletion_text_has_identity(b.reference,p_actor_id,p_email))
  or exists(select 1 from public.billing_direct_orders b where public._account_deletion_text_has_identity(b.recipient::text,p_actor_id,p_email))
  or exists(select 1 from public.billing_direct_payments b where public._account_deletion_text_has_identity(b.reference,p_actor_id,p_email))
  or exists(select 1 from public.billing_paypal_webhook_payloads b where public._account_deletion_text_has_identity(concat_ws('|',b.raw_body,b.signature_headers::text),p_actor_id,p_email))
  or exists(select 1 from public.billing_paypal_webhook_deliveries b where public._account_deletion_text_has_identity(b.plan::text,p_actor_id,p_email))
  or exists(select 1 from public.billing_paypal_webhook_outcomes b where public._account_deletion_text_has_identity(concat_ws('|',b.resource_id,b.detail::text),p_actor_id,p_email))
  or exists(select 1 from public.billing_paypal_webhook_admin_actions b where public._account_deletion_text_has_identity(b.reason,p_actor_id,p_email))
$$;

create function public._account_deletion_blockers(p_actor_id uuid,p_email text,p_protected_admin_emails text[]) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare result jsonb;
begin
  select coalesce(jsonb_agg(code order by code),'[]'::jsonb) into result from (
    select 'administrator_account' code where exists(select 1 from public.profiles where id=p_actor_id and role::text='admin')
      or (p_email<>'' and p_email=any(coalesce(p_protected_admin_emails,'{}'::text[])))
    union all select 'unused_paid_credits' where
      coalesce((select sum(credits) from public.billing_credit_grants where owner_id=p_actor_id),0)
      > coalesce((select sum(credits) from public.billing_credit_consumptions where owner_id=p_actor_id),0)
    union all select 'unresolved_payment_order' where exists(select 1 from public.billing_orders where owner_id=p_actor_id and status in ('reserved','open'))
    union all select 'payment_hold_or_dispute' where exists(
      select 1 from public.billing_credit_holds h where h.owner_id=p_actor_id and not exists(
        select 1 from public.billing_review_decisions d where d.environment=h.environment and d.event_id=h.event_id and d.action='release'))
    union all select 'billing_retention_migration_required' where
      exists(select 1 from public.billing_customers where owner_id=p_actor_id)
      or exists(select 1 from public.billing_orders where owner_id=p_actor_id)
      or exists(select 1 from public.billing_receipts where owner_id=p_actor_id)
      or exists(select 1 from public.billing_credit_grants where owner_id=p_actor_id)
      or exists(select 1 from public.billing_credit_consumptions where owner_id=p_actor_id)
      or exists(select 1 from public.billing_credit_holds where owner_id=p_actor_id)
      or exists(select 1 from public.billing_review_decisions where owner_id=p_actor_id or operator_id=p_actor_id)
      or exists(select 1 from public.billing_direct_payments where operator_id=p_actor_id)
      or exists(select 1 from public.billing_paypal_webhook_admin_actions where operator_id=p_actor_id)
      or public._account_deletion_billing_personal_content(p_actor_id,p_email)
    union all select 'unused_profile_credits' where exists(select 1 from public.profiles where id=p_actor_id and (purchased_code_count>0 or remaining_code_count>0))
    union all select 'storage_cleanup_required' where
      exists(select 1 from public.guitars g where g.owner_id=p_actor_id and nullif(g.hero_image_path,'') is not null)
      or exists(select 1 from public.guitar_media m join public.guitars g on g.id=m.guitar_id where g.owner_id=p_actor_id)
      or exists(select 1 from public.guitar_documents d join public.guitars g on g.id=d.guitar_id where g.owner_id=p_actor_id)
      or exists(select 1 from public.guitar_documents where uploaded_by_user_id=p_actor_id)
      or exists(select 1 from public.instrument_staged_uploads where owner_id=p_actor_id)
      or exists(select 1 from public.ownership_claim_evidence where uploaded_by=p_actor_id)
      or exists(select 1 from public.ownership_claim_evidence e join public.ownership_claims c on c.id=e.claim_id
        where c.current_owner_id=p_actor_id or c.claimant_user_id=p_actor_id or c.decided_by=p_actor_id
          or (p_email<>'' and c.recipient_email_normalized=p_email))
      or exists(select 1 from public.service_submission_evidence where uploaded_by_user_id=p_actor_id)
      or exists(select 1 from public.service_evidence_uploads where actor_id=p_actor_id and state not in ('deleted','discarded'))
      or exists(select 1 from storage.objects where bucket_id in ('instrument-media','instrument-documents','service-evidence')
        and strpos('/'||coalesce(name,'')||'/','/'||p_actor_id::text||'/')>0)
      or exists(select 1 from storage.objects where bucket_id in ('instrument-media','instrument-documents','service-evidence')
        and public._account_deletion_text_has_identity(concat_ws('|',name,metadata::text),p_actor_id,p_email))
    union all select 'active_ownership_transfer' where exists(select 1 from public.ownership_transfers where (from_owner_id=p_actor_id or accepted_by=p_actor_id or (p_email<>'' and lower(btrim(to_email))=p_email)) and status in ('draft','sent'))
    union all select 'active_ownership_claim' where exists(select 1 from public.ownership_claims where (current_owner_id=p_actor_id or claimant_user_id=p_actor_id or (p_email<>'' and lower(btrim(recipient_email_normalized))=p_email)) and status in ('awaiting_claimant','awaiting_owner','admin_review'))
    union all select 'active_service_workflow' where exists(select 1 from public.service_submissions where (provider_user_id=p_actor_id or owner_user_id=p_actor_id) and status in ('draft','submitted','changes_requested'))
    union all select 'service_record_migration_required' where
      exists(select 1 from public.service_submissions where provider_user_id=p_actor_id or owner_user_id=p_actor_id)
      or exists(select 1 from public.service_submission_evidence where uploaded_by_user_id=p_actor_id)
      or exists(select 1 from public.service_evidence_uploads where actor_id=p_actor_id)
      or exists(select 1 from public.service_evidence_upload_scopes where actor_id=p_actor_id)
      or exists(select 1 from public.service_evidence_upload_discard_receipts where actor_id=p_actor_id)
    union all select 'retained_personal_content_review_required' where
      public._account_deletion_unscoped_personal_content(p_actor_id,p_email)
  ) blockers;
  return result;
end $$;

-- A final, narrow invariant over every retained Profile owned by the departing
-- account. The fulfillment procedure scrubs these fields deterministically;
-- this assertion makes an unforeseen trigger/schema drift abort before Auth
-- deletion can even be attempted.
create function public._account_deletion_retained_pii(p_request_id uuid,p_actor_id uuid,p_email text) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
  select exists(
    select 1
    from public.account_deletion_profile_custody c
    join public.guitars g on g.id=c.guitar_id
    where c.request_id=p_request_id and (
      g.owner_id is not null or g.visibility<>'private' or g.name<>'Retained instrument Profile'
      or g.builder is not null or g.location is not null or g.summary<>''
      or g.safety_status_updated_by is not null or g.safety_note is not null or g.public_safety_note is not null
      or g.owner_removed_by is not null or g.owner_removed_reason is not null or g.admin_archive_reason is not null
      or exists(select 1 from public.guitar_specs s where s.guitar_id=g.id)
      or exists(select 1 from public.guitar_media m where m.guitar_id=g.id)
      or exists(select 1 from public.guitar_documents d where d.guitar_id=g.id)
      or exists(select 1 from public.guitar_external_media x where x.guitar_id=g.id)
      or exists(
        select 1 from public.guitar_timeline_events e where e.guitar_id=g.id and (
          e.created_by_user_id is not null or e.provider_user_id is not null or e.evidence_reviewed_by is not null
          or e.private_notes is not null or e.shop_name is not null or e.location is not null
          or e.work_order_reference is not null or e.parts_installed is not null or e.setup_measurements is not null
          or e.who_performed is not null or e.event_type is not null or e.category<>'Other' or e.source_key is not null or e.is_public
          or (e.is_system and e.title<>'Retained system history event')
          or (not e.is_system and e.title<>'Retained history event')
          or e.description<>'' or e.provider_display_name is not null
        )
      )
      or exists(select 1 from public.site_content s where s.content_key='record_trust:'||g.qr_code and (
        jsonb_typeof(s.content_value)<>'object'
        or (s.content_value-array['authenticityStatus','showVerificationBadge','showAuthenticityBadge','showSerialPublic','serialExceptionApproved',
          'internalVerificationNote','publicVerificationNote','internalAuthenticityNote','publicAuthenticityNote']::text[])<>'{}'::jsonb
        or coalesce(s.content_value->>'internalVerificationNote','')<>'' or coalesce(s.content_value->>'publicVerificationNote','')<>''
        or coalesce(s.content_value->>'internalAuthenticityNote','')<>'' or coalesce(s.content_value->>'publicAuthenticityNote','')<>''))
    )
  ) or public._account_deletion_unscoped_personal_content(p_actor_id,p_email)
  or public._account_deletion_billing_personal_content(p_actor_id,p_email)
  or exists(select 1 from public.site_content s where s.updated_by=p_actor_id
    or strpos(lower(s.content_key),p_actor_id::text)>0 or strpos(lower(s.content_value::text),p_actor_id::text)>0
    or (p_email<>'' and (strpos(lower(s.content_key),p_email)>0 or strpos(lower(s.content_value::text),p_email)>0)))
  or exists(select 1 from public.site_editor_receipts r where r.actor_user_id=p_actor_id
    or strpos(lower(r.request_body::text),p_actor_id::text)>0 or strpos(lower(r.result::text),p_actor_id::text)>0
    or (p_email<>'' and (strpos(lower(r.request_body::text),p_email)>0 or strpos(lower(r.result::text),p_email)>0)))
  or exists(select 1 from public.service_submission_notifications n where n.recipient_user_id=p_actor_id
    or strpos(lower(n.message),p_actor_id::text)>0
    or (p_email<>'' and strpos(lower(n.message),p_email)>0))
  or exists(select 1 from public.guitar_timeline_events e where e.created_by_user_id=p_actor_id
    or e.provider_user_id=p_actor_id or e.evidence_reviewed_by=p_actor_id)
  or exists(select 1 from public.guitar_documents d where d.uploaded_by_user_id=p_actor_id)
  or exists(select 1 from public.guitar_external_media x where x.created_by=p_actor_id)
  or exists(select 1 from public.ownership_claim_evidence e where e.uploaded_by=p_actor_id)
  or exists(select 1 from public.ownership_claim_events e where e.actor_user_id=p_actor_id)
  or exists(select 1 from public.ownership_transfers t where p_email<>'' and lower(btrim(t.to_email))=p_email)
  or exists(select 1 from public.ownership_claims c where p_email<>'' and lower(btrim(c.recipient_email_normalized))=p_email)
  or exists(select 1 from public.account_deletion_fulfillments f where f.started_by=p_actor_id or f.last_reviewed_by=p_actor_id)
  or exists(select 1 from storage.objects where bucket_id in ('instrument-media','instrument-documents','service-evidence')
    and strpos('/'||coalesce(name,'')||'/','/'||p_actor_id::text||'/')>0)
  or exists(select 1 from storage.objects where bucket_id in ('instrument-media','instrument-documents','service-evidence')
    and public._account_deletion_text_has_identity(concat_ws('|',name,metadata::text),p_actor_id,p_email))
  or exists(select 1 from public.profiles p where (p_email<>'' and (lower(coalesce(p.account_locked_by,''))=p_email or lower(coalesce(p.account_banned_by,''))=p_email)))
  or exists(select 1 from public.guitars g where p_email<>'' and lower(coalesce(g.admin_archived_by,''))=p_email)
  or exists(select 1 from public.admin_audit_events a where a.actor_user_id=p_actor_id or a.target_user_id=p_actor_id or a.target_id=p_actor_id::text
    or strpos(lower(coalesce(a.target_id,'')),p_actor_id::text)>0 or strpos(lower(coalesce(a.reason,'')),p_actor_id::text)>0
    or strpos(lower(a.metadata::text),p_actor_id::text)>0
    or (p_email<>'' and (lower(coalesce(a.actor_email,''))=p_email or strpos(lower(coalesce(a.target_id,'')),p_email)>0
      or strpos(lower(coalesce(a.reason,'')),p_email)>0 or strpos(lower(a.metadata::text),p_email)>0)))
$$;

create function public.prepare_account_deletion_fulfillment(
  p_admin_id uuid,p_environment_admin boolean,p_request_id uuid,p_operation_id uuid,
  p_protected_admin_emails text[] default '{}'::text[]
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare request_row public.account_deletion_requests; job public.account_deletion_fulfillments;
  old_receipt public.account_deletion_fulfillment_receipts; target_email text; blocked jsonb; answer jsonb;
  new_subject uuid; preliminary_actor uuid; protected_admin_emails text[]; now_at timestamptz:=clock_timestamp();
begin
  if p_request_id is null or p_operation_id is null then raise exception using errcode='22023',message='Request and operation UUIDs are required.'; end if;
  if cardinality(coalesce(p_protected_admin_emails,'{}'::text[]))>100
    or exists(select 1 from unnest(coalesce(p_protected_admin_emails,'{}'::text[])) email
      where length(email)>320 or btrim(email)='' or email<>lower(btrim(email))) then
    raise exception using errcode='22023',message='Protected administrator identities are invalid.';
  end if;
  select coalesce(array_agg(distinct email order by email),'{}'::text[]) into protected_admin_emails
    from unnest(coalesce(p_protected_admin_emails,'{}'::text[])) email;
  perform public._account_deletion_admin(p_admin_id,p_environment_admin);
  perform pg_advisory_xact_lock(hashtextextended('qrguitar:account-deletion:'||p_request_id::text,0));
  select * into old_receipt from public.account_deletion_fulfillment_receipts where operation_id=p_operation_id;
  if found then
    if old_receipt.request_id<>p_request_id or old_receipt.action<>'prepare' then raise exception using errcode='PD409',message='This operation UUID belongs to another fulfillment action.'; end if;
    select * into job from public.account_deletion_fulfillments where request_id=p_request_id;
    return jsonb_build_object('ok',true,'fulfillment',old_receipt.result,'authActorId',case when job.state='ready_for_auth_deletion' then job.actor_id else null end);
  end if;
  select actor_id into preliminary_actor from public.account_deletion_requests where id=p_request_id and status='requested';
  if not found then raise exception using errcode='PD404',message='An active deletion request was not found.'; end if;
  if preliminary_actor is not null then
    -- Existing create and billing paths take the create lock before an
    -- actor-bearing insert reaches the privacy write fence. Preserve that
    -- global order here to avoid create<->prepare deadlocks.
    perform pg_advisory_xact_lock(hashtextextended('qrguitar:create:'||preliminary_actor::text,0));
    perform pg_advisory_xact_lock(hashtextextended('qrguitar:privacy-request:'||preliminary_actor::text,0));
  end if;
  select * into request_row from public.account_deletion_requests where id=p_request_id for update;
  if not found or request_row.status<>'requested' then raise exception using errcode='PD404',message='An active deletion request was not found.'; end if;
  if request_row.actor_id is distinct from preliminary_actor then raise exception using errcode='PD409',message='The deletion request identity changed during review.'; end if;
  if request_row.actor_id is null then
    select * into job from public.account_deletion_fulfillments where request_id=p_request_id for update;
    if not found then raise exception using errcode='PD409',message='This request has no resumable fulfillment.'; end if;
  else
    if request_row.actor_id=p_admin_id then raise exception using errcode='PD409',message='Administrators cannot fulfill their own account deletion.'; end if;
    perform 1 from auth.users where id=request_row.actor_id for key share;
    if not found then raise exception using errcode='PD409',message='The requested Auth identity is unavailable.'; end if;
    perform 1 from public.profiles where id=request_row.actor_id for update;
    select lower(btrim(coalesce(u.email,''))) into target_email from auth.users u where u.id=request_row.actor_id;
    if target_email<>'' then
      perform pg_advisory_xact_lock(hashtextextended('qrguitar:privacy-email:'||target_email,0));
    end if;
    new_subject:=gen_random_uuid();
    insert into public.account_deletion_fulfillments(request_id,actor_id,subject_token,actor_fingerprint,target_email,started_by,last_reviewed_by,blockers)
      values(p_request_id,request_row.actor_id,new_subject,sha256(convert_to(request_row.actor_id::text||':'||new_subject::text,'UTF8')),target_email,p_admin_id,p_admin_id,'["inventory_pending"]'::jsonb)
      on conflict(request_id) do nothing;
    select * into job from public.account_deletion_fulfillments where request_id=p_request_id for update;
    if job.actor_id is distinct from request_row.actor_id then raise exception using errcode='PD409',message='The fulfillment identity no longer matches this request.'; end if;
    if job.target_email is distinct from target_email then raise exception using errcode='PD409',message='The deletion identity email changed during review.'; end if;
  end if;
  perform set_config('qrguitar.account_deletion_request',p_request_id::text,true);
  now_at:=clock_timestamp();
  if job.state='completed' then
    answer:=public._account_deletion_fulfillment_json(job);
  elsif job.state='ready_for_auth_deletion' then
    answer:=public._account_deletion_fulfillment_json(job);
  else
    blocked:=public._account_deletion_blockers(job.actor_id,target_email,protected_admin_emails);
    if job.state='blocked' and blocked<>'[]'::jsonb then
      update public.account_deletion_fulfillments set state='blocked',blockers=blocked,revision=revision+1,
        last_reviewed_by=p_admin_id,reviewed_at=now_at where request_id=p_request_id returning * into job;
      answer:=public._account_deletion_fulfillment_json(job);
    elsif job.state='blocked' then
      -- Freeze account writes in a committed phase before claiming the storage
      -- inventory is final. Supabase signed upload capabilities remain valid for
      -- two hours; the additional hour drains already-started bounded uploads.
      -- A later operation must rescan storage after this timestamp. The phase is
      -- intentionally non-cancellable because the account is already frozen.
      perform set_config('request.jwt.claim.role','service_role',true);
      insert into public.account_deletion_profile_custody(guitar_id,request_id,prior_visibility)
        select id,p_request_id,visibility from public.guitars where owner_id=job.actor_id on conflict do nothing;
      update public.guitars set visibility='private',updated_at=greatest(updated_at,now_at) where owner_id=job.actor_id;
      update public.profiles set account_status='removed',hide_public_content=true where id=job.actor_id;
      select coalesce(jsonb_agg(code order by code),'[]'::jsonb) into blocked from (
        select value code from jsonb_array_elements_text(blocked)
        union select 'storage_quiescence_required'
      ) blockers;
      update public.account_deletion_fulfillments set state='quiescing_storage',blockers=blocked,
        storage_quiesce_until=clock_timestamp()+interval '3 hours',revision=revision+1,
        last_reviewed_by=p_admin_id,reviewed_at=now_at where request_id=p_request_id returning * into job;
      answer:=public._account_deletion_fulfillment_json(job);
    else
      if now_at<job.storage_quiesce_until then
        select coalesce(jsonb_agg(code order by code),'[]'::jsonb) into blocked from (
          select value code from jsonb_array_elements_text(blocked)
          union select 'storage_quiescence_required'
        ) blockers;
      end if;
      if blocked<>'[]'::jsonb then
        update public.account_deletion_fulfillments set state='quiescing_storage',blockers=blocked,revision=revision+1,
          last_reviewed_by=p_admin_id,reviewed_at=now_at where request_id=p_request_id returning * into job;
        answer:=public._account_deletion_fulfillment_json(job);
      else
        -- The durable freeze has outlived every issued upload capability and a
        -- fresh storage inventory is empty. Now anonymize under the same actor
        -- and recipient-email locks before Auth deletion can be attempted.
        perform set_config('request.jwt.claim.role','service_role',true);
        update public.profiles set account_status='removed',hide_public_content=true,display_name=null,
          admin_notes=null,account_lock_reason=null,account_ban_reason=null,
          purchased_code_count=0,remaining_code_count=0 where id=job.actor_id;

      insert into public.account_deletion_profile_custody(guitar_id,request_id,prior_visibility)
        select id,p_request_id,visibility from public.guitars where owner_id=job.actor_id on conflict do nothing;
      update public.site_content s set content_value=jsonb_build_object(
          'authenticityStatus',case when s.content_value->>'authenticityStatus'='confirmed' then 'confirmed' else 'unconfirmed' end,
          'showVerificationBadge',s.content_value->'showVerificationBadge' is distinct from 'false'::jsonb,
          'showAuthenticityBadge',s.content_value->'showAuthenticityBadge' is distinct from 'false'::jsonb,
          'showSerialPublic',s.content_value->'showSerialPublic'='true'::jsonb,
          'serialExceptionApproved',s.content_value->'serialExceptionApproved'='true'::jsonb,
          'internalVerificationNote','','publicVerificationNote','','internalAuthenticityNote','','publicAuthenticityNote',''),
        updated_by=null
        from public.account_deletion_profile_custody c join public.guitars g on g.id=c.guitar_id
        where c.request_id=p_request_id and s.content_key='record_trust:'||g.qr_code;
      update public.guitars set owner_id=null,visibility='private',name='Retained instrument Profile',builder=null,summary='',location=null,
        safety_status_updated_by=null,safety_note=null,public_safety_note=null,
        owner_removed_by=null,owner_removed_reason=null,admin_archive_reason=null,
        updated_at=greatest(updated_at,now_at) where owner_id=job.actor_id;
      update public.guitars set safety_status_updated_by=null,safety_note=null,public_safety_note=null where safety_status_updated_by=job.actor_id;
      update public.guitars set owner_removed_by=null,owner_removed_reason=null where owner_removed_by=job.actor_id;
      update public.guitars set admin_archived_by=null,admin_archive_reason=null
        where target_email<>'' and lower(coalesce(admin_archived_by,''))=target_email;
      delete from public.guitar_specs s using public.account_deletion_profile_custody c
        where c.request_id=p_request_id and c.guitar_id=s.guitar_id;
      update public.guitar_timeline_events e set created_by_user_id=null,provider_user_id=null,evidence_reviewed_by=null,
        title=case when e.is_system then 'Retained system history event' else 'Retained history event' end,
        description='',private_notes=null,shop_name=null,location=null,provider_display_name=null,
        work_order_reference=null,parts_installed=null,setup_measurements=null,who_performed=null,
        event_type=null,category='Other',source_key=null,is_public=false
        from public.account_deletion_profile_custody c where c.request_id=p_request_id and c.guitar_id=e.guitar_id;
      update public.guitar_timeline_events set created_by_user_id=null,provider_user_id=null,evidence_reviewed_by=null,
        title=case when is_system then 'Retained system history event' else 'Retained history event' end,
        description='',private_notes=null,shop_name=null,location=null,provider_display_name=null,
        work_order_reference=null,parts_installed=null,setup_measurements=null,who_performed=null,
        event_type=null,category='Other',source_key=null,is_public=false
        where created_by_user_id=job.actor_id or provider_user_id=job.actor_id or evidence_reviewed_by=job.actor_id;
      update public.guitar_documents set uploaded_by_user_id=null,private_notes=null where uploaded_by_user_id=job.actor_id;
      update public.guitar_serial_aliases set created_by=null where created_by=job.actor_id;
      delete from public.guitar_external_media x using public.account_deletion_profile_custody c
        where c.request_id=p_request_id and c.guitar_id=x.guitar_id;
      delete from public.guitar_external_media where created_by=job.actor_id;

      update public.ownership_transfers set from_owner_id=null,accepted_by=null,to_name=null,
        to_email=case when target_email<>'' and lower(btrim(to_email))=target_email then 'deleted+'||job.subject_token::text||'@privacy.invalid' else to_email end,
        claim_token_hash=null,purchaser_code_hash=null,fee_waived_reason=null
        where from_owner_id=job.actor_id or accepted_by=job.actor_id or (target_email<>'' and lower(btrim(to_email))=target_email);
      update public.ownership_claim_events e set actor_user_id=null,note=null,metadata='{}'::jsonb
        from public.ownership_claims c where c.id=e.claim_id and (
          e.actor_user_id=job.actor_id or c.current_owner_id=job.actor_id or c.claimant_user_id=job.actor_id or c.decided_by=job.actor_id
          or (target_email<>'' and lower(btrim(c.recipient_email_normalized))=target_email));
      update public.ownership_claims set current_owner_id=null,claimant_user_id=null,decided_by=null,
        recipient_email_normalized=null,claim_token_hash=null,purchaser_code_hash=null,acquisition_details=null,
        ownership_declaration=null,owner_response_note=null,admin_review_note=null
        where current_owner_id=job.actor_id or claimant_user_id=job.actor_id or decided_by=job.actor_id
          or (target_email<>'' and lower(btrim(recipient_email_normalized))=target_email);

      delete from public.service_provider_profile_access where provider_user_id=job.actor_id or granted_by_user_id=job.actor_id;
      delete from public.service_provider_profiles where user_id=job.actor_id;
      update public.service_provider_profiles set verified_by=null,internal_review_note=null where verified_by=job.actor_id;
      update public.service_submission_activity set actor_user_id=null,note=null,metadata='{}'::jsonb where actor_user_id=job.actor_id;
      delete from public.service_submission_notifications where recipient_user_id=job.actor_id
        or strpos(lower(message),job.actor_id::text)>0
        or (target_email<>'' and strpos(lower(message),target_email)>0);

      update public.profiles set account_lock_reason=case when target_email<>'' and lower(coalesce(account_locked_by,''))=target_email then null else account_lock_reason end,
        account_locked_by=case when target_email<>'' and lower(coalesce(account_locked_by,''))=target_email then null else account_locked_by end,
        account_ban_reason=case when target_email<>'' and lower(coalesce(account_banned_by,''))=target_email then null else account_ban_reason end,
        account_banned_by=case when target_email<>'' and lower(coalesce(account_banned_by,''))=target_email then null else account_banned_by end
        where target_email<>'' and (lower(coalesce(account_locked_by,''))=target_email or lower(coalesce(account_banned_by,''))=target_email);
      perform set_config('qrguitar.account_deletion_reviewer',job.actor_id::text,true);
      update public.account_deletion_fulfillments set
        started_by=case when started_by=job.actor_id then null else started_by end,
        last_reviewed_by=case when last_reviewed_by=job.actor_id then null else last_reviewed_by end
        where request_id<>p_request_id and (started_by=job.actor_id or last_reviewed_by=job.actor_id);
      perform set_config('qrguitar.account_deletion_reviewer','',true);

      delete from public.instrument_create_receipts where owner_id=job.actor_id;
      delete from public.site_content where content_key='public_collection_owner:'||job.actor_id::text
        or content_key like 'create_submission:'||job.actor_id::text||':%'
        or content_value->>'ownerId'=job.actor_id::text;
      update public.site_content set updated_by=null where updated_by=job.actor_id;
      delete from public.site_editor_receipts where actor_user_id=job.actor_id;
      update public.admin_audit_events set actor_user_id=null,actor_email=null,reason='Personal information removed after an account deletion request.',metadata='{"redacted":true}'::jsonb
        where actor_user_id=job.actor_id;
      update public.admin_audit_events set target_user_id=null,target_id=null,reason='Personal information removed after an account deletion request.',metadata='{"redacted":true}'::jsonb
        where target_user_id=job.actor_id or target_id=job.actor_id::text;

      if public._account_deletion_retained_pii(p_request_id,job.actor_id,target_email) then
        raise exception using errcode='PD500',message='Retained Profile privacy postconditions failed; Auth deletion is blocked.';
      end if;

      delete from public.account_deletion_request_receipts where actor_id=job.actor_id;
      delete from public.account_deletion_actor_revisions where actor_id=job.actor_id;
      -- Detach every historical intake row, including cancelled requests. Auth
      -- deletion otherwise attempts an FK SET NULL on those rows later, outside
      -- this reviewed transaction, and the immutable intake guard rejects it.
      update public.account_deletion_requests set actor_id=null where actor_id=job.actor_id;
      update public.account_deletion_fulfillments set state='ready_for_auth_deletion',blockers='[]'::jsonb,target_email=null,
        revision=revision+1,last_reviewed_by=p_admin_id,reviewed_at=now_at,database_anonymized_at=now_at
        where request_id=p_request_id returning * into job;
        answer:=public._account_deletion_fulfillment_json(job);
      end if;
    end if;
  end if;
  perform set_config('qrguitar.account_deletion_request','',true);
  insert into public.account_deletion_fulfillment_receipts(operation_id,request_id,action,result)
    values(p_operation_id,p_request_id,'prepare',answer);
  return jsonb_build_object('ok',true,'fulfillment',answer,'authActorId',case when job.state='ready_for_auth_deletion' then job.actor_id else null end);
end $$;

create function public.complete_account_deletion_fulfillment(
  p_admin_id uuid,p_environment_admin boolean,p_request_id uuid,p_operation_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare job public.account_deletion_fulfillments; receipt public.account_deletion_fulfillment_receipts; answer jsonb; now_at timestamptz:=clock_timestamp();
begin
  if p_request_id is null or p_operation_id is null then raise exception using errcode='22023',message='Request and operation UUIDs are required.'; end if;
  perform public._account_deletion_admin(p_admin_id,p_environment_admin);
  perform pg_advisory_xact_lock(hashtextextended('qrguitar:account-deletion:'||p_request_id::text,0));
  select * into receipt from public.account_deletion_fulfillment_receipts where operation_id=p_operation_id;
  if found then
    if receipt.request_id<>p_request_id or receipt.action<>'complete' then raise exception using errcode='PD409',message='This operation UUID belongs to another fulfillment action.'; end if;
    return jsonb_build_object('ok',true,'fulfillment',receipt.result);
  end if;
  select * into job from public.account_deletion_fulfillments where request_id=p_request_id for update;
  if not found then raise exception using errcode='PD404',message='Deletion fulfillment was not found.'; end if;
  if job.state='ready_for_auth_deletion' then
    if job.actor_id is not null or exists(select 1 from auth.users where id=job.actor_id) then
      raise exception using errcode='PD428',message='Auth deletion has not been confirmed.';
    end if;
    perform set_config('qrguitar.account_deletion_request',p_request_id::text,true);
    update public.account_deletion_fulfillments set state='completed',revision=revision+1,last_reviewed_by=p_admin_id,
      reviewed_at=now_at,auth_deleted_at=now_at,completed_at=now_at where request_id=p_request_id returning * into job;
  elsif job.state<>'completed' then
    raise exception using errcode='PD409',message='Deletion fulfillment has unresolved blockers.';
  end if;
  perform set_config('qrguitar.account_deletion_request','',true);
  answer:=public._account_deletion_fulfillment_json(job);
  insert into public.account_deletion_fulfillment_receipts(operation_id,request_id,action,result)
    values(p_operation_id,p_request_id,'complete',answer);
  return jsonb_build_object('ok',true,'fulfillment',answer);
end $$;

create function public.read_account_deletion_fulfillment(
  p_admin_id uuid,p_environment_admin boolean,p_request_id uuid
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare job public.account_deletion_fulfillments;
begin
  if p_request_id is null then raise exception using errcode='22023',message='Request UUID is required.'; end if;
  perform public._account_deletion_admin(p_admin_id,p_environment_admin);
  select * into job from public.account_deletion_fulfillments where request_id=p_request_id;
  return jsonb_build_object('ok',true,'fulfillment',case when found then public._account_deletion_fulfillment_json(job) else null end);
end $$;

create or replace function public._account_deletion_intake_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare permitted text:=current_setting('qrguitar.account_deletion_request',true);
begin
  if tg_table_name='account_deletion_request_receipts' then
    if tg_op='DELETE' and (permitted=old.request_id::text or exists(
      select 1 from public.account_deletion_fulfillments f
      where f.request_id::text=permitted and f.actor_id=old.actor_id and f.state in ('blocked','quiescing_storage')
    )) then return old; end if;
    raise exception using errcode='42501',message='Account request receipts are immutable.';
  end if;
  if tg_op='UPDATE' and old.actor_id is not null and new.actor_id is null
    and new.id=old.id and new.status=old.status and new.requested_at=old.requested_at and new.cancelled_at is not distinct from old.cancelled_at then
    if permitted=old.id::text or exists(
      select 1 from public.account_deletion_fulfillments f
      where f.request_id::text=permitted and f.actor_id=old.actor_id and f.state in ('blocked','quiescing_storage')
    ) then return new; end if;
  end if;
  if tg_op='UPDATE' and old.status='requested' and new.status='cancelled'
    and exists(select 1 from public.account_deletion_fulfillments where request_id=old.id) then
    if exists(select 1 from public.account_deletion_fulfillments where request_id=old.id and state='blocked') then
      perform set_config('qrguitar.account_deletion_request',old.id::text,true);
      delete from public.account_deletion_fulfillment_receipts where request_id=old.id;
      delete from public.account_deletion_fulfillments where request_id=old.id;
    else
      raise exception using errcode='PD409',message='Privacy fulfillment has started; this request can no longer be cancelled.';
    end if;
  end if;
  if tg_op='DELETE' or new.id is distinct from old.id or new.actor_id is distinct from old.actor_id
    or new.requested_at is distinct from old.requested_at or old.status<>'requested' or new.status<>'cancelled'
    or new.cancelled_at is null then
    raise exception using errcode='42501',message='Only request cancellation is available outside the reviewed fulfillment protocol.';
  end if;
  return new;
end $$;

create or replace function public.read_account_deletion_queue(
  p_actor_id uuid,p_environment_admin boolean default false,
  p_before_requested_at timestamptz default null,p_before_id uuid default null,p_limit integer default 50
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare rows jsonb;
begin
  perform public._account_deletion_admin(p_actor_id,p_environment_admin);
  if p_limit is null or p_limit<1 or p_limit>100 or ((p_before_requested_at is null)<>(p_before_id is null)) then
    raise exception using errcode='22023',message='A valid bounded queue cursor and limit are required.';
  end if;
  select coalesce(jsonb_agg(item.value order by item.requested_at desc,item.id desc),'[]'::jsonb) into rows from (
    select r.requested_at,r.id,public._account_deletion_request_json(r)||jsonb_build_object('actorId',r.actor_id,'fulfillment',
      case when f.request_id is null then null else public._account_deletion_fulfillment_json(f) end) value
    from public.account_deletion_requests r left join public.account_deletion_fulfillments f on f.request_id=r.id
    where r.status='requested' and (r.actor_id is not null or f.state='ready_for_auth_deletion')
      and (p_before_requested_at is null or (r.requested_at,r.id)<(p_before_requested_at,p_before_id))
    order by r.requested_at desc,r.id desc limit p_limit
  ) item;
  return jsonb_build_object('ok',true,'requests',rows);
end $$;

-- Self-service status must stop offering cancellation once the durable write
-- freeze has started. This response contains only the same safe state DTO used
-- by the administrator queue; target identity and private blocker details are
-- never selected from Auth or the fulfillment table.
create or replace function public.read_account_deletion_requests(p_actor_id uuid,p_request_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare requested jsonb; active_request jsonb; latest_request jsonb; actor_revision text; fulfillment jsonb;
begin
  if p_actor_id is null or not exists(select 1 from auth.users where id=p_actor_id) then
    raise exception using errcode='PD401',message='Verified account identity is unavailable.';
  end if;
  if p_request_id is not null then
    select public._account_deletion_request_json(r) into requested
      from public.account_deletion_requests r left join public.account_deletion_fulfillments f on f.request_id=r.id
      where r.id=p_request_id and (r.actor_id=p_actor_id or f.actor_id=p_actor_id);
    if not found then raise exception using errcode='PD404',message='Account deletion request was not found.'; end if;
  end if;
  select public._account_deletion_request_json(r),
    case when f.request_id is null then null else public._account_deletion_fulfillment_json(f) end
    into active_request,fulfillment
    from public.account_deletion_requests r left join public.account_deletion_fulfillments f on f.request_id=r.id
    where r.status='requested' and (r.actor_id=p_actor_id or f.actor_id=p_actor_id)
    order by r.requested_at desc,r.id desc limit 1;
  select public._account_deletion_request_json(r) into latest_request
    from public.account_deletion_requests r left join public.account_deletion_fulfillments f on f.request_id=r.id
    where r.actor_id=p_actor_id or f.actor_id=p_actor_id order by r.requested_at desc,r.id desc limit 1;
  select coalesce((select revision from public.account_deletion_actor_revisions where actor_id=p_actor_id),0)::text into actor_revision;
  return jsonb_build_object('ok',true,'revision',actor_revision,'request',requested,'activeRequest',active_request,
    'latestRequest',latest_request,'fulfillment',fulfillment);
end $$;

revoke all on function public._account_deletion_fulfillment_guard(),public._account_deletion_custody_fence(),public._account_deletion_write_fence(),
  public._account_deletion_admin(uuid,boolean),public._account_deletion_fulfillment_json(public.account_deletion_fulfillments),
  public._account_deletion_text_has_identity(text,uuid,text),public._account_deletion_unscoped_personal_content(uuid,text),
  public._account_deletion_billing_personal_content(uuid,text),public._account_deletion_blockers(uuid,text,text[]),
  public._account_deletion_retained_pii(uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.prepare_account_deletion_fulfillment(uuid,boolean,uuid,uuid,text[]),
  public.complete_account_deletion_fulfillment(uuid,boolean,uuid,uuid),
  public.read_account_deletion_fulfillment(uuid,boolean,uuid) from public,anon,authenticated,service_role;
grant execute on function public.prepare_account_deletion_fulfillment(uuid,boolean,uuid,uuid,text[]),
  public.complete_account_deletion_fulfillment(uuid,boolean,uuid,uuid),
  public.read_account_deletion_fulfillment(uuid,boolean,uuid) to service_role;

notify pgrst,'reload schema';
commit;
