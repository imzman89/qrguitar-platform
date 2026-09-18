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
  action text not null check(action in ('prepare','complete','profile_redact','unscoped_scrub')),
  result jsonb not null check(jsonb_typeof(result)='object'),
  recorded_at timestamptz not null default clock_timestamp()
);
create index account_deletion_fulfillment_receipt_request
  on public.account_deletion_fulfillment_receipts(request_id,recorded_at,operation_id);

create table public.account_deletion_profile_custody (
  guitar_id uuid not null references public.guitars(id) on delete restrict,
  request_id uuid not null references public.account_deletion_fulfillments(request_id) on delete restrict,
  prior_visibility public.guitar_visibility not null,
  state text not null default 'privacy_review_required' check(state in ('privacy_review_required','released')),
  held_at timestamptz not null default clock_timestamp(),
  released_claim_id uuid references public.ownership_claims(id) on delete restrict,
  released_to uuid references auth.users(id) on delete set null,
  released_by uuid references auth.users(id) on delete set null,
  release_subject uuid unique,
  released_at timestamptz,
  check((state='privacy_review_required' and released_claim_id is null and released_to is null and released_by is null and release_subject is null and released_at is null)
    or (state='released' and released_claim_id is not null and release_subject is not null and released_at is not null)),
  primary key(request_id,guitar_id)
);
create unique index account_deletion_one_active_profile_custody
  on public.account_deletion_profile_custody(guitar_id) where state='privacy_review_required';
comment on table public.account_deletion_profile_custody is
  'Ownerless permanent Profiles stay private until an administrator approves a proof-backed ownership claim and atomically records a fingerprinted privacy release.';

-- Scope is durable because identity links are removed later.  Each attestation
-- binds one exact, versioned snapshot of the complete retained Profile graph;
-- changing any covered row makes that attestation stale rather than silently
-- waiving the new content.
create table public.account_deletion_profile_review_scopes (
  request_id uuid not null references public.account_deletion_fulfillments(request_id) on delete restrict,
  guitar_id uuid not null references public.guitars(id) on delete restrict,
  relationship_codes text[] not null check(cardinality(relationship_codes) between 1 and 32),
  recorded_at timestamptz not null default clock_timestamp(),
  primary key(request_id,guitar_id)
);
create table public.account_deletion_profile_review_attestations (
  operation_id uuid primary key,
  request_id uuid not null references public.account_deletion_fulfillments(request_id) on delete restrict,
  guitar_id uuid not null references public.guitars(id) on delete restrict,
  policy_version integer not null default 1 check(policy_version=1),
  content_fingerprint bytea not null check(octet_length(content_fingerprint)=32),
  reviewed_by uuid references auth.users(id) on delete set null,
  result jsonb not null check(jsonb_typeof(result)='object'),
  reviewed_at timestamptz not null default clock_timestamp(),
  foreign key(request_id,guitar_id) references public.account_deletion_profile_review_scopes(request_id,guitar_id) on delete restrict
);
create table public.account_deletion_retention_attestations (
  operation_id uuid primary key,
  request_id uuid not null references public.account_deletion_fulfillments(request_id) on delete restrict,
  domain text not null check(domain in ('billing','service')),
  policy_version integer not null default 1 check(policy_version=1),
  content_fingerprint bytea not null check(octet_length(content_fingerprint)=32),
  decision_code text not null check(decision_code in ('lawful_financial_retention_reviewed','service_history_privacy_reviewed')),
  reviewed_by uuid references auth.users(id) on delete set null,
  result jsonb not null check(jsonb_typeof(result)='object'),
  reviewed_at timestamptz not null default clock_timestamp(),
  check((domain='billing' and decision_code='lawful_financial_retention_reviewed')
    or (domain='service' and decision_code='service_history_privacy_reviewed'))
);

-- Commercial and service facts outlive a login identity.  These roots are
-- pseudonymous ledger subjects; neither UUID is an Auth identifier and neither
-- is returned by browser/admin status APIs.
create table public.account_deletion_billing_subjects (
  request_id uuid primary key references public.account_deletion_fulfillments(request_id) on delete restrict,
  subject_id uuid not null unique,
  before_fingerprint bytea not null check(octet_length(before_fingerprint)=32),
  after_fingerprint bytea check(after_fingerprint is null or octet_length(after_fingerprint)=32),
  row_counts jsonb not null check(jsonb_typeof(row_counts)='object'),
  migrated_by uuid references auth.users(id) on delete set null,
  migrated_at timestamptz not null default clock_timestamp()
);
create table public.account_deletion_service_subjects (
  request_id uuid primary key references public.account_deletion_fulfillments(request_id) on delete restrict,
  subject_id uuid not null unique,
  before_fingerprint bytea not null check(octet_length(before_fingerprint)=32),
  after_fingerprint bytea check(after_fingerprint is null or octet_length(after_fingerprint)=32),
  row_counts jsonb not null check(jsonb_typeof(row_counts)='object'),
  migrated_by uuid references auth.users(id) on delete set null,
  migrated_at timestamptz not null default clock_timestamp()
);
create table public.account_deletion_custody_release_receipts (
  operation_id uuid primary key,
  claim_id uuid not null unique references public.ownership_claims(id) on delete restrict,
  request_id uuid not null references public.account_deletion_fulfillments(request_id) on delete restrict,
  guitar_id uuid not null references public.guitars(id) on delete restrict,
  claimant_id uuid references auth.users(id) on delete set null,
  claimant_subject uuid not null unique,
  policy_version integer not null default 1 check(policy_version=1),
  content_fingerprint bytea not null check(octet_length(content_fingerprint)=32),
  evidence_count integer not null check(evidence_count>0),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz not null default clock_timestamp(),
  result jsonb not null check(jsonb_typeof(result)='object'),
  unique(request_id,guitar_id)
);

-- Raw Auth aliases become nullable while immutable economic/work facts keep a
-- non-Auth subject. New owner/operator identity columns must register here so
-- readiness and the final privacy postcondition fail closed on schema growth.
create table public.account_deletion_identity_inventory (
  domain text not null check(domain in ('billing','service')),
  table_name text not null,
  actor_column text not null,
  subject_column text not null,
  primary key(domain,table_name,actor_column)
);

-- Storage bytes cannot be moved by PostgreSQL.  This private journal gives the
-- service-role worker a durable, replayable copy/finalize/delete contract.  A
-- source object remains in place until the destination bytes and every
-- database reference have been verified in one transaction.  Only then may
-- the worker remove the source and record completion.
create table public.account_deletion_storage_relocations (
  relocation_id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.account_deletion_fulfillments(request_id) on delete restrict,
  bucket_id text not null check(bucket_id in ('instrument-media','instrument-documents','service-evidence')),
  source_path text not null,
  disposition text not null check(disposition in ('retain','delete')),
  destination_path text,
  source_size bigint check(source_size is null or source_size>=0),
  source_mime_type text,
  source_version text,
  source_fingerprint bytea not null check(octet_length(source_fingerprint)=32),
  state text not null default 'planned' check(state in ('planned','copy_authorized','deletion_authorized','references_updated','completed')),
  byte_sha256 bytea check(byte_sha256 is null or octet_length(byte_sha256)=32),
  copied_size bigint check(copied_size is null or copied_size>=0),
  finalize_operation_id uuid unique,
  complete_operation_id uuid unique,
  planned_at timestamptz not null default clock_timestamp(),
  references_updated_at timestamptz,
  completed_at timestamptz,
  unique(request_id,bucket_id,source_path),
  unique(bucket_id,destination_path),
  check((disposition='retain' and destination_path is not null and source_path<>destination_path)
    or (disposition='delete' and destination_path is null)),
  check(
    (state='planned' and byte_sha256 is null and copied_size is null and finalize_operation_id is null
      and complete_operation_id is null and references_updated_at is null and completed_at is null)
    or (state='copy_authorized' and disposition='retain' and byte_sha256 is null and copied_size is null
      and finalize_operation_id is not null and complete_operation_id is null and references_updated_at is null and completed_at is null)
    or (state='deletion_authorized' and disposition='delete' and byte_sha256 is null and copied_size is null
      and finalize_operation_id is not null and complete_operation_id is null and references_updated_at is null and completed_at is null)
    or (state='references_updated' and disposition='retain' and byte_sha256 is not null and copied_size is not null and finalize_operation_id is not null
      and complete_operation_id is null and references_updated_at is not null and completed_at is null)
    or (state='completed' and complete_operation_id is not null and completed_at is not null and (
      (disposition='retain' and byte_sha256 is not null and copied_size is not null and finalize_operation_id is not null and references_updated_at is not null)
      or (disposition='delete' and byte_sha256 is null and copied_size is null and finalize_operation_id is not null and references_updated_at is null)))
  )
);
create index account_deletion_storage_relocations_request
  on public.account_deletion_storage_relocations(request_id,state,bucket_id,source_path);
comment on table public.account_deletion_storage_relocations is
  'Private two-phase Storage relocation journal. Source bytes are removed only after a verified destination and atomic database-reference update.';

-- Retained binary files can contain personal information inside the bytes
-- (for example image EXIF data or a PDF address).  A service-role endpoint
-- streams the private source to an authenticated administrator; the resulting
-- human decision is bound to the exact source row and a server-computed byte
-- digest.  Only an exact retain receipt may authorize a byte-preserving copy.
create table public.account_deletion_storage_content_reviews (
  operation_id uuid primary key,
  relocation_id uuid not null unique references public.account_deletion_storage_relocations(relocation_id) on delete restrict,
  request_id uuid not null references public.account_deletion_fulfillments(request_id) on delete restrict,
  source_fingerprint bytea not null check(octet_length(source_fingerprint)=32),
  byte_sha256 bytea not null check(octet_length(byte_sha256)=32),
  byte_size bigint not null check(byte_size>=0),
  mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp','application/pdf')),
  decision text not null check(decision in ('retain','delete')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz not null default clock_timestamp(),
  result jsonb not null check(jsonb_typeof(result)='object'),
  unique(request_id,relocation_id)
);
comment on table public.account_deletion_storage_content_reviews is
  'Immutable administrator review of exact private bytes. Retain means visible content and metadata were inspected for personal information; delete means the bytes must not be copied.';

-- Claimant proof belongs to the later custody-release workflow, not to the
-- departing account's Storage cleanup. Each private proof object is inspected
-- independently and bound to its current object fingerprint and byte digest.
create table public.account_deletion_custody_evidence_reviews (
  operation_id uuid primary key,
  request_id uuid not null references public.account_deletion_fulfillments(request_id) on delete restrict,
  claim_id uuid not null references public.ownership_claims(id) on delete restrict,
  evidence_id uuid not null references public.ownership_claim_evidence(id) on delete restrict,
  guitar_id uuid not null references public.guitars(id) on delete restrict,
  profile_fingerprint bytea not null check(octet_length(profile_fingerprint)=32),
  object_fingerprint bytea not null check(octet_length(object_fingerprint)=32),
  object_path_fingerprint bytea not null check(octet_length(object_path_fingerprint)=32),
  object_version text,
  byte_sha256 bytea not null check(octet_length(byte_sha256)=32),
  byte_size bigint not null check(byte_size>=0),
  mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp','application/pdf')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz not null default clock_timestamp(),
  result jsonb not null check(jsonb_typeof(result)='object')
);
create index account_deletion_custody_evidence_review_current
  on public.account_deletion_custody_evidence_reviews(request_id,claim_id,evidence_id,reviewed_at desc,operation_id);

alter table public.billing_customers
  add column subject_id uuid references public.account_deletion_billing_subjects(subject_id) on delete restrict,
  add constraint billing_customers_identity_mode check(
    (subject_id is null and owner_id is not null) or (subject_id is not null and owner_id=subject_id));
alter table public.billing_orders alter column owner_id drop not null,
  add column subject_id uuid references public.account_deletion_billing_subjects(subject_id) on delete restrict;
alter table public.billing_receipts alter column owner_id drop not null,
  add column subject_id uuid references public.account_deletion_billing_subjects(subject_id) on delete restrict,
  add constraint billing_receipts_order_history_fkey foreign key(order_id) references public.billing_orders(id) on delete restrict;
alter table public.billing_credit_grants alter column owner_id drop not null,
  add column subject_id uuid references public.account_deletion_billing_subjects(subject_id) on delete restrict,
  add constraint billing_credit_grants_order_history_fkey foreign key(order_id) references public.billing_orders(id) on delete restrict;
alter table public.billing_credit_consumptions alter column owner_id drop not null,
  add column subject_id uuid references public.account_deletion_billing_subjects(subject_id) on delete restrict,
  add constraint billing_credit_consumptions_order_history_fkey foreign key(order_id) references public.billing_credit_grants(order_id) on delete restrict;
alter table public.billing_credit_holds alter column owner_id drop not null,
  add column subject_id uuid references public.account_deletion_billing_subjects(subject_id) on delete restrict;
alter table public.billing_review_decisions alter column owner_id drop not null,alter column operator_id drop not null,
  add column subject_id uuid references public.account_deletion_billing_subjects(subject_id) on delete restrict,
  add column operator_subject_id uuid references public.account_deletion_billing_subjects(subject_id) on delete restrict;
alter table public.billing_direct_orders alter column owner_id drop not null,
  add column subject_id uuid references public.account_deletion_billing_subjects(subject_id) on delete restrict,
  add constraint billing_direct_orders_order_history_fkey foreign key(order_id) references public.billing_orders(id) on delete restrict;
alter table public.billing_direct_payments alter column operator_id drop not null,
  add column operator_subject_id uuid references public.account_deletion_billing_subjects(subject_id) on delete restrict;
alter table public.billing_paypal_orders alter column owner_id drop not null,
  add column subject_id uuid references public.account_deletion_billing_subjects(subject_id) on delete restrict,
  add constraint billing_paypal_orders_order_history_fkey foreign key(order_id) references public.billing_orders(id) on delete restrict;
alter table public.billing_paypal_webhook_admin_actions alter column operator_id drop not null,
  add column operator_subject_id uuid references public.account_deletion_billing_subjects(subject_id) on delete restrict;

alter table public.billing_orders add constraint billing_orders_identity_mode check(
  (subject_id is null and owner_id is not null) or (subject_id is not null and owner_id=subject_id));
alter table public.billing_receipts add constraint billing_receipts_identity_mode check(
  (subject_id is null and owner_id is not null) or (subject_id is not null and owner_id=subject_id));
alter table public.billing_credit_grants add constraint billing_credit_grants_identity_mode check(
  (subject_id is null and owner_id is not null) or (subject_id is not null and owner_id=subject_id));
alter table public.billing_credit_consumptions add constraint billing_credit_consumptions_identity_mode check(
  (subject_id is null and owner_id is not null) or (subject_id is not null and owner_id=subject_id));
alter table public.billing_credit_holds add constraint billing_credit_holds_identity_mode check(
  (subject_id is null and owner_id is not null) or (subject_id is not null and owner_id=subject_id));
alter table public.billing_direct_orders add constraint billing_direct_orders_identity_mode check(
  (subject_id is null and owner_id is not null) or (subject_id is not null and owner_id=subject_id));
alter table public.billing_paypal_orders add constraint billing_paypal_orders_identity_mode check(
  (subject_id is null and owner_id is not null) or (subject_id is not null and owner_id=subject_id));
alter table public.billing_direct_payments add constraint billing_direct_payments_operator_identity_mode check(
  (operator_subject_id is null and operator_id is not null) or (operator_subject_id is not null and operator_id=operator_subject_id));
alter table public.billing_paypal_webhook_admin_actions add constraint billing_paypal_webhook_admin_actions_operator_identity_mode check(
  (operator_subject_id is null and operator_id is not null) or (operator_subject_id is not null and operator_id=operator_subject_id));
alter table public.billing_review_decisions add constraint billing_review_decisions_identity_mode check(
  ((subject_id is null and owner_id is not null) or (subject_id is not null and owner_id=subject_id))
  and ((operator_subject_id is null and operator_id is not null) or (operator_subject_id is not null and operator_id=operator_subject_id)));

alter table public.billing_orders add constraint billing_orders_history_environment_key unique(id,environment);
alter table public.billing_credit_grants add constraint billing_credit_grants_history_environment_key unique(order_id,environment);
alter table public.billing_receipts drop constraint billing_receipts_order_id_owner_id_environment_fkey,
  drop constraint billing_receipts_order_history_fkey,
  add constraint billing_receipts_order_history_fkey foreign key(order_id,environment) references public.billing_orders(id,environment) on delete restrict;
alter table public.billing_credit_grants drop constraint billing_credit_grants_order_id_owner_id_environment_fkey,
  drop constraint billing_credit_grants_order_history_fkey,
  add constraint billing_credit_grants_order_history_fkey foreign key(order_id,environment) references public.billing_orders(id,environment) on delete restrict;
alter table public.billing_credit_consumptions drop constraint billing_credit_consumptions_order_id_owner_id_environment_fkey,
  drop constraint billing_credit_consumptions_order_history_fkey,
  add constraint billing_credit_consumptions_order_history_fkey foreign key(order_id,environment) references public.billing_credit_grants(order_id,environment) on delete restrict;
alter table public.billing_direct_orders drop constraint billing_direct_orders_order_id_owner_id_environment_fkey,
  drop constraint billing_direct_orders_order_history_fkey,
  add constraint billing_direct_orders_order_history_fkey foreign key(order_id,environment) references public.billing_orders(id,environment) on delete restrict;
alter table public.billing_paypal_orders drop constraint billing_paypal_orders_order_id_owner_id_environment_fkey,
  drop constraint billing_paypal_orders_order_history_fkey,
  add constraint billing_paypal_orders_order_history_fkey foreign key(order_id,environment) references public.billing_orders(id,environment) on delete restrict;

create unique index billing_orders_subject_request on public.billing_orders(subject_id,environment,request_key) where subject_id is not null;
create unique index billing_consumptions_subject_key on public.billing_credit_consumptions(subject_id,create_key) where subject_id is not null;

alter table public.service_submissions alter column provider_user_id drop not null,alter column owner_user_id drop not null,
  add column provider_subject_id uuid references public.account_deletion_service_subjects(subject_id) on delete restrict,
  add column owner_subject_id uuid references public.account_deletion_service_subjects(subject_id) on delete restrict;
alter table public.service_submission_evidence alter column uploaded_by_user_id drop not null,
  add column uploaded_by_subject_id uuid references public.account_deletion_service_subjects(subject_id) on delete restrict;
alter table public.service_evidence_uploads alter column actor_id drop not null,
  add column actor_subject_id uuid references public.account_deletion_service_subjects(subject_id) on delete restrict;
alter table public.service_evidence_uploads drop constraint service_evidence_uploads_check;
alter table public.service_evidence_uploads add constraint service_evidence_uploads_identity_path_check check(
  (actor_id is not null and actor_subject_id is null and storage_path = submission_id::text || '/' || actor_id::text || '/direct/' || upload_id::text ||
    case mime_type when 'image/jpeg' then '.jpg' when 'image/png' then '.png' when 'image/webp' then '.webp' else '.pdf' end)
  or (actor_id is not null and actor_subject_id is null
    and storage_path~'^account-deletion/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{64}$')
  or (actor_id is null and actor_subject_id is not null and (
    (state in ('deleted','discarded') and (storage_path='privacy-subject/'||actor_subject_id::text||'/'||upload_id::text
      or storage_path~'^account-deletion/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{64}$'))
    or (state='committed' and storage_path~'^account-deletion/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{64}$'))));
alter table public.service_evidence_upload_discard_receipts alter column actor_id drop not null,
  add column actor_subject_id uuid references public.account_deletion_service_subjects(subject_id) on delete restrict;
alter table public.service_submission_activity
  add column actor_subject_id uuid references public.account_deletion_service_subjects(subject_id) on delete restrict;
alter table public.guitar_timeline_events
  add column created_by_subject_id uuid references public.account_deletion_service_subjects(subject_id) on delete restrict,
  add column provider_subject_id uuid references public.account_deletion_service_subjects(subject_id) on delete restrict,
  add column evidence_reviewed_by_subject_id uuid references public.account_deletion_service_subjects(subject_id) on delete restrict;

-- Claim evidence is permanent ownership-history evidence. Detach its Auth
-- author instead of cascading away the evidence when the author deletes their
-- account.
alter table public.ownership_claim_evidence
  drop constraint ownership_claim_evidence_uploaded_by_fkey,
  alter column uploaded_by drop not null,
  add constraint ownership_claim_evidence_uploaded_by_fkey
    foreign key(uploaded_by) references auth.users(id) on delete set null;
alter table public.service_submissions add constraint service_submissions_identity_mode check(
  ((provider_user_id is null)<>(provider_subject_id is null)) and ((owner_user_id is null)<>(owner_subject_id is null)));
alter table public.service_submission_evidence add constraint service_submission_evidence_identity_mode check(
  (uploaded_by_user_id is null)<>(uploaded_by_subject_id is null));
alter table public.service_evidence_uploads add constraint service_evidence_uploads_actor_identity_mode check(
  (actor_id is null)<>(actor_subject_id is null));
alter table public.service_evidence_upload_discard_receipts add constraint service_evidence_upload_discard_identity_mode check(
  (actor_id is null)<>(actor_subject_id is null));
alter table public.service_submission_activity add constraint service_submission_activity_actor_identity_mode check(
  not (actor_user_id is not null and actor_subject_id is not null));
alter table public.guitar_timeline_events add constraint guitar_timeline_service_identity_mode check(
  not (created_by_user_id is not null and created_by_subject_id is not null)
  and not (provider_user_id is not null and provider_subject_id is not null)
  and not (evidence_reviewed_by is not null and evidence_reviewed_by_subject_id is not null));

insert into public.account_deletion_identity_inventory(domain,table_name,actor_column,subject_column) values
  ('billing','billing_customers','owner_id','subject_id'),('billing','billing_orders','owner_id','subject_id'),
  ('billing','billing_receipts','owner_id','subject_id'),('billing','billing_credit_grants','owner_id','subject_id'),
  ('billing','billing_credit_consumptions','owner_id','subject_id'),('billing','billing_credit_holds','owner_id','subject_id'),
  ('billing','billing_review_decisions','owner_id','subject_id'),('billing','billing_review_decisions','operator_id','operator_subject_id'),
  ('billing','billing_direct_orders','owner_id','subject_id'),('billing','billing_direct_payments','operator_id','operator_subject_id'),
  ('billing','billing_paypal_orders','owner_id','subject_id'),('billing','billing_paypal_webhook_admin_actions','operator_id','operator_subject_id'),
  ('service','service_submissions','provider_user_id','provider_subject_id'),('service','service_submissions','owner_user_id','owner_subject_id'),
  ('service','service_submission_evidence','uploaded_by_user_id','uploaded_by_subject_id'),
  ('service','service_evidence_uploads','actor_id','actor_subject_id'),
  ('service','service_evidence_upload_discard_receipts','actor_id','actor_subject_id'),
  ('service','service_submission_activity','actor_user_id','actor_subject_id'),
  ('service','guitar_timeline_events','created_by_user_id','created_by_subject_id'),
  ('service','guitar_timeline_events','provider_user_id','provider_subject_id'),
  ('service','guitar_timeline_events','evidence_reviewed_by','evidence_reviewed_by_subject_id');

comment on table public.account_deletion_fulfillments is
  'Private deletion state machine. Blockers are stable machine codes, never customer content. ready_for_auth_deletion means database identity links are removed; only completed means the Auth identity is absent.';
comment on table public.account_deletion_fulfillment_receipts is
  'Idempotency receipts for administrator prepare/complete actions. Results contain status and blocker codes only, never the target Auth UUID, email, storage path, or payment identifier.';

alter table public.account_deletion_fulfillments enable row level security;
alter table public.account_deletion_fulfillment_receipts enable row level security;
alter table public.account_deletion_profile_custody enable row level security;
alter table public.account_deletion_profile_review_scopes enable row level security;
alter table public.account_deletion_profile_review_attestations enable row level security;
alter table public.account_deletion_retention_attestations enable row level security;
alter table public.account_deletion_billing_subjects enable row level security;
alter table public.account_deletion_service_subjects enable row level security;
alter table public.account_deletion_custody_release_receipts enable row level security;
alter table public.account_deletion_identity_inventory enable row level security;
alter table public.account_deletion_storage_relocations enable row level security;
alter table public.account_deletion_storage_content_reviews enable row level security;
alter table public.account_deletion_custody_evidence_reviews enable row level security;
revoke all on public.account_deletion_fulfillments,public.account_deletion_fulfillment_receipts,public.account_deletion_profile_custody,
  public.account_deletion_profile_review_scopes,public.account_deletion_profile_review_attestations,
  public.account_deletion_retention_attestations,
  public.account_deletion_billing_subjects,public.account_deletion_service_subjects,
  public.account_deletion_custody_release_receipts,public.account_deletion_identity_inventory,
  public.account_deletion_storage_relocations,public.account_deletion_storage_content_reviews,
  public.account_deletion_custody_evidence_reviews
  from public,anon,authenticated,service_role;
create policy account_deletion_fulfillments_no_direct_access on public.account_deletion_fulfillments
  as restrictive for all to public using(false) with check(false);
create policy account_deletion_fulfillment_receipts_no_direct_access on public.account_deletion_fulfillment_receipts
  as restrictive for all to public using(false) with check(false);
create policy account_deletion_profile_custody_no_direct_access on public.account_deletion_profile_custody
  as restrictive for all to public using(false) with check(false);
create policy account_deletion_profile_review_scopes_no_direct_access on public.account_deletion_profile_review_scopes
  as restrictive for all to public using(false) with check(false);
create policy account_deletion_profile_review_attestations_no_direct_access on public.account_deletion_profile_review_attestations
  as restrictive for all to public using(false) with check(false);
create policy account_deletion_retention_attestations_no_direct_access on public.account_deletion_retention_attestations
  as restrictive for all to public using(false) with check(false);
create policy account_deletion_billing_subjects_no_direct_access on public.account_deletion_billing_subjects
  as restrictive for all to public using(false) with check(false);
create policy account_deletion_service_subjects_no_direct_access on public.account_deletion_service_subjects
  as restrictive for all to public using(false) with check(false);
create policy account_deletion_custody_release_receipts_no_direct_access on public.account_deletion_custody_release_receipts
  as restrictive for all to public using(false) with check(false);
create policy account_deletion_identity_inventory_no_direct_access on public.account_deletion_identity_inventory
  as restrictive for all to public using(false) with check(false);
create policy account_deletion_storage_relocations_no_direct_access on public.account_deletion_storage_relocations
  as restrictive for all to public using(false) with check(false);
create policy account_deletion_storage_content_reviews_no_direct_access on public.account_deletion_storage_content_reviews
  as restrictive for all to public using(false) with check(false);
create policy account_deletion_custody_evidence_reviews_no_direct_access on public.account_deletion_custody_evidence_reviews
  as restrictive for all to public using(false) with check(false);

create function public._account_deletion_fulfillment_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare permitted text:=current_setting('qrguitar.account_deletion_request',true);
  reviewer text:=current_setting('qrguitar.account_deletion_reviewer',true);
  release_request text:=current_setting('qrguitar.account_deletion_custody_release',true);
  storage_request text:=current_setting('qrguitar.account_deletion_storage_relocation',true);
begin
  if tg_table_name='account_deletion_fulfillment_receipts' then
    if tg_op='DELETE' and permitted=old.request_id::text then return old; end if;
    raise exception using errcode='42501',message='Account deletion fulfillment receipts are immutable.';
  end if;
  if tg_table_name='account_deletion_profile_custody' then
    if tg_op='DELETE' and permitted=old.request_id::text
      and exists(select 1 from public.account_deletion_fulfillments where request_id=old.request_id and state='blocked') then return old; end if;
    if tg_op='UPDATE' and release_request=old.request_id::text and old.state='privacy_review_required' and new.state='released'
      and row(new.guitar_id,new.request_id,new.prior_visibility,new.held_at)
        is not distinct from row(old.guitar_id,old.request_id,old.prior_visibility,old.held_at)
      and new.released_claim_id is not null and new.release_subject is not null and new.released_at is not null then return new; end if;
    if tg_op='UPDATE' and old.state='released' and new.state='released'
      and (new.released_to is null or new.released_to=old.released_to)
      and (new.released_by is null or new.released_by=old.released_by)
      and row(new.guitar_id,new.request_id,new.prior_visibility,new.held_at,new.released_claim_id,new.release_subject,new.released_at)
        is not distinct from row(old.guitar_id,old.request_id,old.prior_visibility,old.held_at,old.released_claim_id,old.release_subject,old.released_at) then return new; end if;
    raise exception using errcode='42501',message='Account deletion Profile custody is immutable.';
  end if;
  if tg_table_name='account_deletion_profile_review_scopes' then
    if tg_op='DELETE' and permitted=old.request_id::text
      and exists(select 1 from public.account_deletion_fulfillments where request_id=old.request_id and state='blocked') then return old; end if;
    raise exception using errcode='42501',message='Account deletion review scope is immutable.';
  end if;
  if tg_table_name in ('account_deletion_billing_subjects','account_deletion_service_subjects') then
    if tg_op='UPDATE' and permitted=old.request_id::text and old.after_fingerprint is null and new.after_fingerprint is not null
      and to_jsonb(new)-'after_fingerprint'=to_jsonb(old)-'after_fingerprint' then return new; end if;
  end if;
  if tg_table_name in ('account_deletion_profile_review_attestations','account_deletion_billing_subjects',
      'account_deletion_service_subjects','account_deletion_custody_release_receipts','account_deletion_retention_attestations',
      'account_deletion_storage_content_reviews','account_deletion_custody_evidence_reviews') then
    if tg_op='DELETE' and permitted=old.request_id::text
      and exists(select 1 from public.account_deletion_fulfillments where request_id=old.request_id and state='blocked') then return old; end if;
    if tg_op='UPDATE' and to_jsonb(new)-array['reviewed_by','migrated_by','claimant_id']::text[]
        =to_jsonb(old)-array['reviewed_by','migrated_by','claimant_id']::text[]
      and ((to_jsonb(old)->>'reviewed_by' is not null and to_jsonb(new)->>'reviewed_by' is null)
        or (to_jsonb(old)->>'migrated_by' is not null and to_jsonb(new)->>'migrated_by' is null)
        or (to_jsonb(old)->>'claimant_id' is not null and to_jsonb(new)->>'claimant_id' is null)) then return new; end if;
    raise exception using errcode='42501',message='Account deletion privacy receipts are immutable.';
  end if;
  if tg_table_name='account_deletion_identity_inventory' then
    raise exception using errcode='42501',message='Account deletion identity inventory is immutable.';
  end if;
  if tg_table_name='account_deletion_storage_relocations' then
    if tg_op='DELETE' and permitted=old.request_id::text
      and exists(select 1 from public.account_deletion_fulfillments where request_id=old.request_id and state='blocked') then return old; end if;
    if tg_op='DELETE' and storage_request=old.request_id::text and old.state='planned'
      and not exists(select 1 from storage.objects where bucket_id=old.bucket_id and name=old.source_path) then return old;end if;
    if tg_op='UPDATE' and storage_request=old.request_id::text and old.state='planned' and new.state='planned'
      and row(new.relocation_id,new.request_id,new.bucket_id,new.source_path,new.planned_at,
        new.byte_sha256,new.copied_size,new.finalize_operation_id,new.complete_operation_id,new.references_updated_at,new.completed_at)
        is not distinct from row(old.relocation_id,old.request_id,old.bucket_id,old.source_path,old.planned_at,
          old.byte_sha256,old.copied_size,old.finalize_operation_id,old.complete_operation_id,old.references_updated_at,old.completed_at) then return new;end if;
    if tg_op='UPDATE' and storage_request=old.request_id::text
      and row(new.relocation_id,new.request_id,new.bucket_id,new.disposition,new.destination_path,new.source_size,
        new.source_mime_type,new.source_version,new.source_fingerprint,new.planned_at)
        is not distinct from row(old.relocation_id,old.request_id,old.bucket_id,old.disposition,old.destination_path,old.source_size,
          old.source_mime_type,old.source_version,old.source_fingerprint,old.planned_at)
      and ((old.state='planned' and old.disposition='retain' and new.state='copy_authorized'
          and new.byte_sha256 is null and new.copied_size is null and new.finalize_operation_id is not null
          and new.complete_operation_id is null and new.references_updated_at is null and new.completed_at is null
          and new.source_path=old.source_path)
        or (old.state='planned' and old.disposition='delete' and new.state='deletion_authorized'
          and new.byte_sha256 is null and new.copied_size is null and new.finalize_operation_id is not null
          and new.complete_operation_id is null and new.references_updated_at is null and new.completed_at is null
          and new.source_path=old.source_path)
        or (old.state='copy_authorized' and old.disposition='retain' and new.state='references_updated' and new.byte_sha256 is not null
          and new.copied_size is not null and new.finalize_operation_id=old.finalize_operation_id and new.complete_operation_id is null
          and new.references_updated_at is not null and new.completed_at is null and new.source_path=old.source_path)
        or (old.state='references_updated' and new.state='completed' and new.byte_sha256=old.byte_sha256
          and new.copied_size=old.copied_size and new.finalize_operation_id=old.finalize_operation_id
          and new.complete_operation_id is not null and new.references_updated_at=old.references_updated_at and new.completed_at is not null
          and new.source_path='removed/'||old.relocation_id::text)
        or (old.state='deletion_authorized' and old.disposition='delete' and new.state='completed'
          and new.byte_sha256 is null and new.copied_size is null and new.finalize_operation_id=old.finalize_operation_id
          and new.complete_operation_id is not null and new.references_updated_at is null and new.completed_at is not null
          and new.source_path='removed/'||old.relocation_id::text)) then
      return new;
    end if;
    raise exception using errcode='42501',message='Account deletion Storage relocation receipts are immutable.';
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
create trigger account_deletion_profile_review_scopes_immutable before update or delete
  on public.account_deletion_profile_review_scopes for each row execute function public._account_deletion_fulfillment_guard();
create trigger account_deletion_profile_review_attestations_immutable before update or delete
  on public.account_deletion_profile_review_attestations for each row execute function public._account_deletion_fulfillment_guard();
create trigger account_deletion_retention_attestations_immutable before update or delete
  on public.account_deletion_retention_attestations for each row execute function public._account_deletion_fulfillment_guard();
create trigger account_deletion_billing_subjects_immutable before update or delete
  on public.account_deletion_billing_subjects for each row execute function public._account_deletion_fulfillment_guard();
create trigger account_deletion_service_subjects_immutable before update or delete
  on public.account_deletion_service_subjects for each row execute function public._account_deletion_fulfillment_guard();
create trigger account_deletion_custody_release_receipts_immutable before update or delete
  on public.account_deletion_custody_release_receipts for each row execute function public._account_deletion_fulfillment_guard();
create trigger account_deletion_identity_inventory_immutable before update or delete
  on public.account_deletion_identity_inventory for each row execute function public._account_deletion_fulfillment_guard();
create trigger account_deletion_storage_relocations_immutable before update or delete
  on public.account_deletion_storage_relocations for each row execute function public._account_deletion_fulfillment_guard();
create trigger account_deletion_storage_content_reviews_immutable before update or delete
  on public.account_deletion_storage_content_reviews for each row execute function public._account_deletion_fulfillment_guard();
create trigger account_deletion_custody_evidence_reviews_immutable before update or delete
  on public.account_deletion_custody_evidence_reviews for each row execute function public._account_deletion_fulfillment_guard();

-- Custody keeps the Profile private and ownerless.  Claim rows/evidence may be
-- created through the existing proof workflow, but only the reviewed approval
-- RPC can release custody and it keeps visibility private for the new owner.
create function public._account_deletion_custody_fence() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare held_request uuid; held_state text; permitted text:=current_setting('qrguitar.account_deletion_request',true);
  release_request text:=current_setting('qrguitar.account_deletion_custody_release',true);
begin
  if tg_table_name='guitars' then
    select request_id into held_request from public.account_deletion_profile_custody where guitar_id=old.id and state='privacy_review_required';
    if held_request is null then return case when tg_op='DELETE' then old else new end; end if;
    if permitted=held_request::text or release_request=held_request::text then return case when tg_op='DELETE' then old else new end; end if;
    if tg_op='DELETE' or new.owner_id is not null or new.visibility<>'private' then
      raise exception using errcode='PD423',message='This retained Profile is in privacy custody.';
    end if;
    return new;
  end if;
  if tg_op='INSERT' then
    select request_id into held_request from public.account_deletion_profile_custody where guitar_id=new.guitar_id and state='privacy_review_required';
  elsif tg_op='DELETE' then
    select request_id into held_request from public.account_deletion_profile_custody where guitar_id=old.guitar_id and state='privacy_review_required';
  else
    select request_id into held_request from public.account_deletion_profile_custody
      where guitar_id in (old.guitar_id,new.guitar_id) and state='privacy_review_required' order by guitar_id limit 1;
  end if;
  -- Proof claims open only after Auth deletion is durably complete. During the
  -- storage window every custody graph is frozen, so a late claim cannot stale
  -- an attestation and wedge fulfillment permanently.
  if held_request is not null and tg_table_name='ownership_claims' then
    if permitted=held_request::text or release_request=held_request::text then
      return case when tg_op='DELETE' then old else new end;
    end if;
    select state into held_state from public.account_deletion_fulfillments where request_id=held_request;
    if held_state='completed' then return case when tg_op='DELETE' then old else new end; end if;
    raise exception using errcode='PD423',message='This retained Profile can accept a claim after privacy fulfillment completes.';
  end if;
  if held_request is not null and permitted is distinct from held_request::text and release_request is distinct from held_request::text then
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
  reconciliation_order uuid;
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

  -- Provider callbacks must still be able to append an exact receipt for a
  -- checkout that existed before an account was removed. _billing_receipt
  -- sets this transaction-local capability only after the public RPC has
  -- locked and validated the canonical order. It is intentionally limited to
  -- a receipt whose owner/environment/order match that immutable parent.
  if tg_table_name in ('billing_receipts','billing_orders') then
    begin reconciliation_order:=nullif(current_setting('qrguitar.billing_reconciliation_order',true),'')::uuid;
    exception when invalid_text_representation then reconciliation_order:=null;end;
    if reconciliation_order is not null and (
      (tg_op='INSERT' and tg_table_name='billing_receipts'
        and nullif(to_jsonb(new)->>'order_id','')::uuid=reconciliation_order
        and exists(select 1 from public.billing_orders o where o.id=reconciliation_order
          and o.owner_id=nullif(to_jsonb(new)->>'owner_id','')::uuid and o.environment=to_jsonb(new)->>'environment'))
      or (tg_op='UPDATE' and tg_table_name='billing_orders'
        and nullif(to_jsonb(old)->>'id','')::uuid=reconciliation_order and to_jsonb(new)->>'id'=to_jsonb(old)->>'id'
        and to_jsonb(new)->>'owner_id'=to_jsonb(old)->>'owner_id' and to_jsonb(new)->>'environment'=to_jsonb(old)->>'environment')
    ) then return new;end if;
  end if;

  if tg_op='UPDATE' and tg_table_name='billing_orders'
    and to_jsonb(new)->>'id'=to_jsonb(old)->>'id' and to_jsonb(new)->>'owner_id'=to_jsonb(old)->>'owner_id'
    and to_jsonb(new)->>'environment'=to_jsonb(old)->>'environment' then return new;end if;

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
    old_actor:=case when tg_op='INSERT' then null else nullif(to_jsonb(old)->>column_name,'')::uuid end;
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
      if (tg_op='INSERT' or new_actor is distinct from old_actor)
        and (exists(select 1 from public.account_deletion_requests r where r.actor_id=new_actor and r.status='requested')
          or exists(select 1 from public.account_deletion_fulfillments f where f.actor_id=new_actor
            and f.state in ('blocked','quiescing_storage','ready_for_auth_deletion')))
        and not exists(select 1 from public.account_deletion_fulfillments f where f.request_id::text=permitted
          and f.actor_id=new_actor and f.state in ('blocked','quiescing_storage')) then
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
language sql stable set search_path=pg_catalog,public as $$
  select strpos(lower(coalesce(p_text,'')),p_actor_id::text)>0
    or (p_email<>'' and strpos(lower(coalesce(p_text,'')),p_email)>0)
    or (char_length(coalesce(current_setting('qrguitar.account_deletion_target_name',true),''))>=3
      and strpos(lower(coalesce(p_text,'')),lower(current_setting('qrguitar.account_deletion_target_name',true)))>0)
$$;

-- Remove only identity strings we can prove belong to the departing account.
-- This deliberately preserves the surrounding instrument/service fact instead
-- of replacing whole notes, events, specifications, or Profile descriptions.
create function public._account_deletion_redact_identity(p_value text,p_actor_id uuid,p_email text) returns text
language plpgsql stable set search_path=pg_catalog,public as $$
declare answer text:=p_value; needle text; at_position integer;
begin
  if answer is null then return null; end if;
  foreach needle in array array[p_actor_id::text,nullif(lower(btrim(p_email)),''),
      nullif(btrim(current_setting('qrguitar.account_deletion_target_name',true)),'')] loop
    if needle is null or (needle<>p_actor_id::text and needle<>lower(btrim(p_email)) and char_length(needle)<3) then continue; end if;
    loop
      at_position:=strpos(lower(answer),lower(needle));
      exit when at_position=0;
      answer:=overlay(answer placing '[personal information removed]' from at_position for char_length(needle));
    end loop;
  end loop;
  return answer;
end $$;

create function public._account_deletion_redact_identity_jsonb(p_value jsonb,p_actor_id uuid,p_email text,p_salt uuid) returns jsonb
language plpgsql stable set search_path=pg_catalog,public as $$
declare result jsonb;
begin
  if p_value is null then return null;end if;
  if jsonb_typeof(p_value)='object' then
    select coalesce(jsonb_object_agg(
      case when public._account_deletion_redact_identity(e.key,p_actor_id,p_email) is distinct from e.key
        then 'privacy-key-'||encode(sha256(convert_to(p_salt::text||':'||e.key,'UTF8')),'hex') else e.key end,
      public._account_deletion_redact_identity_jsonb(e.value,p_actor_id,p_email,p_salt) order by e.key),'{}'::jsonb)
      into result from jsonb_each(p_value) e;return result;
  elsif jsonb_typeof(p_value)='array' then
    select coalesce(jsonb_agg(public._account_deletion_redact_identity_jsonb(e.value,p_actor_id,p_email,p_salt) order by e.ordinality),'[]'::jsonb)
      into result from jsonb_array_elements(p_value) with ordinality e(value,ordinality);return result;
  elsif jsonb_typeof(p_value)='string' then return to_jsonb(public._account_deletion_redact_identity(p_value#>>'{}',p_actor_id,p_email));end if;
  return p_value;
end $$;

create function public._account_deletion_redact_terms(p_value text,p_terms text[]) returns text
language plpgsql immutable set search_path=pg_catalog,public as $$
declare answer text:=''; needle text; matched text; at_position integer:=1; source_length integer;
begin
  if p_value is null then return null;end if;
  source_length:=char_length(p_value);
  -- Scan the original value exactly once. Replacement text is never scanned,
  -- so terms such as "personal", "information", or "removed" cannot match
  -- the marker we just inserted and grow forever. Longest matches win, with a
  -- lexical tie-breaker, making overlapping terms deterministic.
  while at_position<=source_length loop
    matched:=null;
    foreach needle in array coalesce(p_terms,'{}'::text[]) loop
      needle:=btrim(needle);
      if char_length(needle)>=3
        and lower(substring(p_value from at_position for char_length(needle)))=lower(needle)
        and (matched is null or char_length(needle)>char_length(matched)
          or (char_length(needle)=char_length(matched) and lower(needle)<lower(matched))) then
        matched:=needle;
      end if;
    end loop;
    if matched is null then
      answer:=answer||substring(p_value from at_position for 1);
      at_position:=at_position+1;
    else
      answer:=answer||'[personal information removed]';
      at_position:=at_position+char_length(matched);
    end if;
  end loop;
  return answer;
end $$;

create function public._account_deletion_redact_terms_jsonb(p_value jsonb,p_terms text[],p_salt uuid) returns jsonb
language plpgsql immutable set search_path=pg_catalog,public as $$
declare result jsonb;
begin
  if p_value is null then return null;end if;
  if jsonb_typeof(p_value)='object' then
    select coalesce(jsonb_object_agg(
      case when public._account_deletion_redact_terms(e.key,p_terms) is distinct from e.key
        then 'privacy-key-'||encode(sha256(convert_to(p_salt::text||':'||e.key,'UTF8')),'hex') else e.key end,
      public._account_deletion_redact_terms_jsonb(e.value,p_terms,p_salt) order by e.key),'{}'::jsonb)
      into result from jsonb_each(p_value) e;
    return result;
  elsif jsonb_typeof(p_value)='array' then
    select coalesce(jsonb_agg(public._account_deletion_redact_terms_jsonb(e.value,p_terms,p_salt) order by e.ordinality),'[]'::jsonb)
      into result from jsonb_array_elements(p_value) with ordinality e(value,ordinality);
    return result;
  elsif jsonb_typeof(p_value)='string' then
    return to_jsonb(public._account_deletion_redact_terms(p_value#>>'{}',p_terms));
  end if;
  return p_value;
end $$;

create function public._account_deletion_replace_json_string(p_value jsonb,p_old text,p_new text) returns jsonb
language plpgsql immutable set search_path=pg_catalog,public as $$
declare result jsonb;
begin
  if p_value is null then return null;end if;
  if jsonb_typeof(p_value)='object' then
    select coalesce(jsonb_object_agg(e.key,public._account_deletion_replace_json_string(e.value,p_old,p_new) order by e.key),'{}'::jsonb)
      into result from jsonb_each(p_value) e;return result;
  elsif jsonb_typeof(p_value)='array' then
    select coalesce(jsonb_agg(public._account_deletion_replace_json_string(e.value,p_old,p_new) order by e.ordinality),'[]'::jsonb)
      into result from jsonb_array_elements(p_value) with ordinality e(value,ordinality);return result;
  elsif jsonb_typeof(p_value)='string' and p_value#>>'{}'=p_old then return to_jsonb(p_new);
  end if;
  return p_value;
end $$;

create function public._account_deletion_review_safe_jsonb(p_value jsonb) returns jsonb
language plpgsql immutable set search_path=pg_catalog,public as $$
declare result jsonb;
begin
  if p_value is null then return null;end if;
  if jsonb_typeof(p_value)='object' then
    select coalesce(jsonb_object_agg(e.key,public._account_deletion_review_safe_jsonb(e.value) order by e.key),'{}'::jsonb)
      into result from jsonb_each(p_value) e
      where lower(e.key) !~ '(^|_)(token|secret|signature|hash)(_|$)'
        and e.key not in ('authActorId','owner_id','subject_id','operator_id','operator_subject_id','provider_user_id',
          'provider_subject_id','owner_user_id','owner_subject_id','uploaded_by_user_id','uploaded_by_subject_id',
          'actor_user_id','actor_subject_id','actor_id','created_by_user_id','created_by_subject_id','evidence_reviewed_by',
          'evidence_reviewed_by_subject_id','recipient_user_id','storage_path','evidence_result','ownerScope');
    return result;
  elsif jsonb_typeof(p_value)='array' then
    select coalesce(jsonb_agg(public._account_deletion_review_safe_jsonb(e.value) order by e.ordinality),'[]'::jsonb)
      into result from jsonb_array_elements(p_value) with ordinality e(value,ordinality);
    return result;
  end if;
  return p_value;
end $$;

create function public._account_deletion_sync_profile_review_scope(p_request_id uuid,p_actor_id uuid,p_email text) returns void
language sql security definer set search_path=pg_catalog,public as $$
  insert into public.account_deletion_profile_review_scopes(request_id,guitar_id,relationship_codes)
  select p_request_id,links.guitar_id,array_agg(distinct reason order by reason) from (
    select g.id guitar_id,'current_owner' reason from public.guitars g where g.owner_id=p_actor_id
    union all select g.id,'safety_author' from public.guitars g where g.safety_status_updated_by=p_actor_id
    union all select g.id,'owner_removal_author' from public.guitars g where g.owner_removed_by=p_actor_id
    union all select g.id,'archive_author' from public.guitars g where p_email<>'' and lower(coalesce(g.admin_archived_by,''))=p_email
    union all select t.guitar_id,'transfer_from_owner' from public.ownership_transfers t where t.from_owner_id=p_actor_id
    union all select t.guitar_id,'transfer_recipient' from public.ownership_transfers t where t.accepted_by=p_actor_id or (p_email<>'' and lower(btrim(t.to_email))=p_email)
    union all select c.guitar_id,'claim_participant' from public.ownership_claims c where c.current_owner_id=p_actor_id or c.claimant_user_id=p_actor_id
      or c.decided_by=p_actor_id or (p_email<>'' and lower(btrim(c.recipient_email_normalized))=p_email)
    union all select c.guitar_id,'claim_evidence_author' from public.ownership_claim_evidence e join public.ownership_claims c on c.id=e.claim_id where e.uploaded_by=p_actor_id
    union all select c.guitar_id,'claim_event_author' from public.ownership_claim_events e join public.ownership_claims c on c.id=e.claim_id where e.actor_user_id=p_actor_id
    union all select d.guitar_id,'document_author' from public.guitar_documents d where d.uploaded_by_user_id=p_actor_id
    union all select x.guitar_id,'external_media_author' from public.guitar_external_media x where x.created_by=p_actor_id
    union all select a.guitar_id,'serial_author' from public.guitar_serial_aliases a where a.created_by=p_actor_id
    union all select e.guitar_id,'timeline_author' from public.guitar_timeline_events e where e.created_by_user_id=p_actor_id or e.provider_user_id=p_actor_id or e.evidence_reviewed_by=p_actor_id
    union all select a.guitar_id,'service_access' from public.service_provider_profile_access a where a.provider_user_id=p_actor_id or a.granted_by_user_id=p_actor_id
    union all select s.guitar_id,'service_participant' from public.service_submissions s where s.provider_user_id=p_actor_id or s.owner_user_id=p_actor_id
    union all select s.guitar_id,'service_evidence_author' from public.service_submission_evidence e join public.service_submissions s on s.id=e.submission_id where e.uploaded_by_user_id=p_actor_id
    union all select s.guitar_id,'service_activity_author' from public.service_submission_activity a join public.service_submissions s on s.id=a.submission_id where a.actor_user_id=p_actor_id
    union all select s.guitar_id,'service_notification_recipient' from public.service_submission_notifications n join public.service_submissions s on s.id=n.submission_id where n.recipient_user_id=p_actor_id
    union all select s.guitar_id,'service_upload_author' from public.service_evidence_uploads u join public.service_submissions s on s.id=u.submission_id where u.actor_id=p_actor_id
    union all select s.guitar_id,'service_upload_scope' from public.service_evidence_upload_scopes u join public.service_submissions s on s.id=u.submission_id where u.actor_id=p_actor_id
    union all select s.guitar_id,'service_discard_receipt' from public.service_evidence_upload_discard_receipts u join public.service_submissions s on s.id=u.submission_id where u.actor_id=p_actor_id
    union all select r.guitar_id,'create_receipt' from public.instrument_create_receipts r where r.owner_id=p_actor_id and r.guitar_id is not null
    union all select u.guitar_id,'staged_upload' from public.instrument_staged_uploads u where u.owner_id=p_actor_id and u.guitar_id is not null
    union all select g.id,'site_content' from public.site_content c join public.guitars g
      on c.content_value->>'guitarId'=g.id::text or c.content_value->>'qrCode'=g.qr_code
      where c.updated_by=p_actor_id or c.content_key like 'create_submission:'||p_actor_id::text||':%'
  ) links join public.guitars current_g on current_g.id=links.guitar_id
  where links.guitar_id is not null
  group by links.guitar_id
  on conflict(request_id,guitar_id) do nothing
$$;

create function public._account_deletion_profile_review_graph(p_request_id uuid,p_guitar_id uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,public set timezone='UTC' as $$
  with job as (
    select actor_id,subject_token,lower(coalesce(target_email,'')) target_email
    from public.account_deletion_fulfillments where request_id=p_request_id
  ), retained as (
  select jsonb_build_object(
    'policyVersion',1,'requestId',p_request_id,'guitarId',p_guitar_id,
    'scope',(select to_jsonb(s)-'recorded_at' from public.account_deletion_profile_review_scopes s where s.request_id=p_request_id and s.guitar_id=p_guitar_id),
    'guitar',(select (to_jsonb(g)-array['owner_id','visibility','updated_at','safety_status_updated_by','owner_removed_by','admin_archived_by']::text[])
      ||jsonb_build_object('ownerScope',case when g.owner_id=job.actor_id then 'deletion-target' else coalesce(g.owner_id::text,'ownerless') end,
        'visibilityScope',case when g.owner_id=job.actor_id then 'privacy-custody' else g.visibility::text end)
      from public.guitars g where g.id=p_guitar_id),
    'redirects',(select coalesce(jsonb_agg(to_jsonb(x) order by x.old_path),'[]'::jsonb) from public.qr_redirects x where x.guitar_id=p_guitar_id),
    'specs',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb) from public.guitar_specs x where x.guitar_id=p_guitar_id),
    'media',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb) from public.guitar_media x where x.guitar_id=p_guitar_id),
    'documents',(select coalesce(jsonb_agg(to_jsonb(x)-array['uploaded_by_user_id','updated_at']::text[] order by x.id),'[]'::jsonb) from public.guitar_documents x where x.guitar_id=p_guitar_id),
    'externalMedia',(select coalesce(jsonb_agg(to_jsonb(x)-array['created_by','updated_at']::text[] order by x.id),'[]'::jsonb) from public.guitar_external_media x where x.guitar_id=p_guitar_id),
    'serialAliases',(select coalesce(jsonb_agg(to_jsonb(x)-'created_by' order by x.id),'[]'::jsonb) from public.guitar_serial_aliases x where x.guitar_id=p_guitar_id),
    'timeline',(select coalesce(jsonb_agg(to_jsonb(x)-array['created_by_user_id','provider_user_id','evidence_reviewed_by','created_by_subject_id','provider_subject_id','evidence_reviewed_by_subject_id','updated_at']::text[] order by x.id),'[]'::jsonb) from public.guitar_timeline_events x where x.guitar_id=p_guitar_id),
    'transfers',(select coalesce(jsonb_agg(to_jsonb(x)-array['from_owner_id','accepted_by','to_email','claim_token_hash','purchaser_code_hash']::text[] order by x.id),'[]'::jsonb) from public.ownership_transfers x where x.guitar_id=p_guitar_id),
    'claims',(select coalesce(jsonb_agg(to_jsonb(x)-array['current_owner_id','claimant_user_id','decided_by','recipient_email_normalized','claim_token_hash','purchaser_code_hash','updated_at']::text[] order by x.id),'[]'::jsonb) from public.ownership_claims x where x.guitar_id=p_guitar_id),
    'claimEvidence',(select coalesce(jsonb_agg(to_jsonb(x)-'uploaded_by' order by x.id),'[]'::jsonb) from public.ownership_claim_evidence x join public.ownership_claims c on c.id=x.claim_id where c.guitar_id=p_guitar_id),
    'claimEvents',(select coalesce(jsonb_agg(to_jsonb(x)-'actor_user_id' order by x.id),'[]'::jsonb) from public.ownership_claim_events x join public.ownership_claims c on c.id=x.claim_id where c.guitar_id=p_guitar_id),
    'serviceAccess',(select coalesce(jsonb_agg(to_jsonb(x)-array['provider_user_id','granted_by_user_id']::text[] order by x.id),'[]'::jsonb) from public.service_provider_profile_access x where x.guitar_id=p_guitar_id),
    'serviceSubmissions',(select coalesce(jsonb_agg(to_jsonb(x)-array['provider_user_id','owner_user_id','provider_subject_id','owner_subject_id','updated_at']::text[] order by x.id),'[]'::jsonb) from public.service_submissions x where x.guitar_id=p_guitar_id),
    'serviceEvidence',(select coalesce(jsonb_agg(to_jsonb(x)-array['uploaded_by_user_id','uploaded_by_subject_id']::text[] order by x.id),'[]'::jsonb) from public.service_submission_evidence x join public.service_submissions s on s.id=x.submission_id where s.guitar_id=p_guitar_id),
    'serviceTokens',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb) from public.service_submission_tokens x join public.service_submissions s on s.id=x.submission_id where s.guitar_id=p_guitar_id),
    'serviceActivity',(select coalesce(jsonb_agg(to_jsonb(x)-array['actor_user_id','actor_subject_id']::text[] order by x.id),'[]'::jsonb) from public.service_submission_activity x join public.service_submissions s on s.id=x.submission_id where s.guitar_id=p_guitar_id),
    'serviceNotifications',(select coalesce(jsonb_agg(to_jsonb(x)-'recipient_user_id' order by x.id),'[]'::jsonb) from public.service_submission_notifications x join public.service_submissions s on s.id=x.submission_id where s.guitar_id=p_guitar_id),
    'serviceUploads',(select coalesce(jsonb_agg(to_jsonb(x)-array['actor_id','actor_subject_id']::text[] order by x.upload_id),'[]'::jsonb) from public.service_evidence_uploads x join public.service_submissions s on s.id=x.submission_id where s.guitar_id=p_guitar_id),
    'serviceUploadScopes',(select coalesce(jsonb_agg(to_jsonb(x)-'actor_id' order by x.submission_id),'[]'::jsonb) from public.service_evidence_upload_scopes x join public.service_submissions s on s.id=x.submission_id where s.guitar_id=p_guitar_id),
    'serviceDiscardReceipts',(select coalesce(jsonb_agg(to_jsonb(x)-array['actor_id','actor_subject_id']::text[] order by x.upload_id),'[]'::jsonb) from public.service_evidence_upload_discard_receipts x join public.service_submissions s on s.id=x.submission_id where s.guitar_id=p_guitar_id),
    'createReceipts',(select coalesce(jsonb_agg(to_jsonb(x)-'owner_id' order by x.idempotency_key),'[]'::jsonb) from public.instrument_create_receipts x where x.guitar_id=p_guitar_id),
    'stagedUploads',(select coalesce(jsonb_agg(to_jsonb(x)-'owner_id' order by x.bucket_id,x.storage_path),'[]'::jsonb) from public.instrument_staged_uploads x where x.guitar_id=p_guitar_id),
    'siteContent',(select coalesce(jsonb_agg(to_jsonb(x)-array['updated_by','updated_at','editor_version']::text[] order by x.content_key),'[]'::jsonb)
      from public.site_content x join public.guitars g on g.id=p_guitar_id where x.content_key='record_trust:'||g.qr_code
        or x.content_value->>'guitarId'=p_guitar_id::text or x.content_value->>'qrCode'=g.qr_code)
  ) value from job)
  select public._account_deletion_redact_identity_jsonb(retained.value,job.actor_id,job.target_email,job.subject_token)
  from retained,job
$$;

create function public._account_deletion_profile_fingerprint(p_request_id uuid,p_guitar_id uuid) returns bytea
language sql stable security definer set search_path=pg_catalog,public as $$
  select sha256(convert_to(public._account_deletion_profile_review_graph(p_request_id,p_guitar_id)::text,'UTF8'))
$$;

create function public._account_deletion_lock_profile_reviews(p_request_id uuid) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare item record;
begin
  for item in select guitar_id from public.account_deletion_profile_review_scopes where request_id=p_request_id order by guitar_id loop
    perform pg_advisory_xact_lock(hashtextextended('qrguitar:profile-graph:'||item.guitar_id::text,0));
    perform 1 from public.guitars where id=item.guitar_id for update;
  end loop;
end $$;

create function public._account_deletion_profile_reviews_json(p_request_id uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'guitarId',s.guitar_id,'qrCode',g.qr_code,'permanentPath',g.permanent_path,'relationshipCodes',to_jsonb(s.relationship_codes),
    'policyVersion',1,'contentFingerprint',encode(public._account_deletion_profile_fingerprint(s.request_id,s.guitar_id),'hex'),
    'attested',a.operation_id is not null,'attestedAt',a.reviewed_at
  ) order by g.qr_code,s.guitar_id),'[]'::jsonb)
  from public.account_deletion_profile_review_scopes s join public.guitars g on g.id=s.guitar_id
  left join lateral(select x.operation_id,x.reviewed_at from public.account_deletion_profile_review_attestations x
    where x.request_id=s.request_id and x.guitar_id=s.guitar_id
      and x.content_fingerprint=public._account_deletion_profile_fingerprint(s.request_id,s.guitar_id)
    order by x.reviewed_at desc,x.operation_id limit 1) a on true
  where s.request_id=p_request_id
$$;

create function public._account_deletion_profile_reviews_complete(p_request_id uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
  select not exists(select 1 from public.account_deletion_profile_review_scopes s where s.request_id=p_request_id and not exists(
    select 1 from public.account_deletion_profile_review_attestations a where a.request_id=s.request_id and a.guitar_id=s.guitar_id
      and a.content_fingerprint=public._account_deletion_profile_fingerprint(s.request_id,s.guitar_id)))
$$;

create function public._account_deletion_historical_profile_reviews_complete(p_request_id uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
  select not exists(select 1 from public.account_deletion_profile_review_scopes s
    join public.account_deletion_fulfillments f on f.request_id=s.request_id
    join public.guitars g on g.id=s.guitar_id
    where s.request_id=p_request_id and g.owner_id is distinct from f.actor_id and not exists(
      select 1 from public.account_deletion_profile_review_attestations a where a.request_id=s.request_id and a.guitar_id=s.guitar_id
        and a.content_fingerprint=public._account_deletion_profile_fingerprint(s.request_id,s.guitar_id)))
$$;

create function public._account_deletion_profile_has_exact_identity(p_guitar_id uuid,p_actor_id uuid,p_email text) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
  select exists(select 1 from public.guitars g where g.id=p_guitar_id and public._account_deletion_text_has_identity(
      concat_ws('|',g.name,g.brand,g.model,g.year,g.serial_number,g.builder,g.location,g.summary,g.hero_image_path,
        g.safety_note,g.public_safety_note,g.owner_removed_reason,g.admin_archive_reason),p_actor_id,p_email))
  or exists(select 1 from public.guitar_specs x where x.guitar_id=p_guitar_id and public._account_deletion_text_has_identity((to_jsonb(x)-array['id','guitar_id']::text[])::text,p_actor_id,p_email))
  or exists(select 1 from public.guitar_media x where x.guitar_id=p_guitar_id and public._account_deletion_text_has_identity((to_jsonb(x)-array['id','guitar_id']::text[])::text,p_actor_id,p_email))
  or exists(select 1 from public.guitar_documents x where x.guitar_id=p_guitar_id and public._account_deletion_text_has_identity(
      (to_jsonb(x)-array['id','guitar_id','uploaded_by_user_id']::text[])::text,p_actor_id,p_email))
  or exists(select 1 from public.guitar_external_media x where x.guitar_id=p_guitar_id and public._account_deletion_text_has_identity(
      (to_jsonb(x)-array['id','guitar_id','created_by']::text[])::text,p_actor_id,p_email))
  or exists(select 1 from public.guitar_serial_aliases x where x.guitar_id=p_guitar_id and public._account_deletion_text_has_identity(
      (to_jsonb(x)-array['id','guitar_id','created_by']::text[])::text,p_actor_id,p_email))
  or exists(select 1 from public.guitar_timeline_events x where x.guitar_id=p_guitar_id and public._account_deletion_text_has_identity(
      (to_jsonb(x)-array['id','guitar_id','created_by_user_id','provider_user_id','evidence_reviewed_by','created_by_subject_id','provider_subject_id','evidence_reviewed_by_subject_id']::text[])::text,p_actor_id,p_email))
  or exists(select 1 from public.ownership_transfers x where x.guitar_id=p_guitar_id and public._account_deletion_text_has_identity(
      concat_ws('|',x.to_name,x.fee_waived_reason),p_actor_id,p_email))
  or exists(select 1 from public.ownership_claims x where x.guitar_id=p_guitar_id and public._account_deletion_text_has_identity(
      concat_ws('|',x.acquisition_details,x.ownership_declaration,x.owner_response_note,x.admin_review_note),p_actor_id,p_email))
  or exists(select 1 from public.ownership_claim_evidence x join public.ownership_claims c on c.id=x.claim_id where c.guitar_id=p_guitar_id
      and public._account_deletion_text_has_identity(concat_ws('|',x.evidence_type,x.file_name,x.storage_path,x.private_note),p_actor_id,p_email))
  or exists(select 1 from public.ownership_claim_events x join public.ownership_claims c on c.id=x.claim_id where c.guitar_id=p_guitar_id
      and public._account_deletion_text_has_identity(concat_ws('|',x.action,x.note,x.metadata::text),p_actor_id,p_email))
  or exists(select 1 from public.service_submissions x where x.guitar_id=p_guitar_id and public._account_deletion_text_has_identity(
      (to_jsonb(x)-array['id','guitar_id','provider_user_id','owner_user_id','provider_subject_id','owner_subject_id']::text[])::text,p_actor_id,p_email))
  or exists(select 1 from public.service_submission_evidence x join public.service_submissions s on s.id=x.submission_id where s.guitar_id=p_guitar_id
      and public._account_deletion_text_has_identity((to_jsonb(x)-array['id','submission_id','uploaded_by_user_id','uploaded_by_subject_id']::text[])::text,p_actor_id,p_email))
  or exists(select 1 from public.service_submission_activity x join public.service_submissions s on s.id=x.submission_id where s.guitar_id=p_guitar_id
      and public._account_deletion_text_has_identity((to_jsonb(x)-array['id','submission_id','actor_user_id','actor_subject_id']::text[])::text,p_actor_id,p_email))
  or exists(select 1 from public.service_submission_notifications x join public.service_submissions s on s.id=x.submission_id where s.guitar_id=p_guitar_id
      and public._account_deletion_text_has_identity((to_jsonb(x)-array['id','submission_id','recipient_user_id']::text[])::text,p_actor_id,p_email))
  or exists(select 1 from public.site_content x join public.guitars g on g.id=p_guitar_id where x.content_key='record_trust:'||g.qr_code
      and public._account_deletion_text_has_identity((to_jsonb(x)-array['updated_by']::text[])::text,p_actor_id,p_email))
$$;

create function public._account_deletion_storage_object_fingerprint(p_bucket text,p_path text,p_salt uuid) returns bytea
language sql stable security definer set search_path=pg_catalog,public,storage as $$
  select sha256(convert_to(p_salt::text||':'||jsonb_build_object(
    'bucket',o.bucket_id,'name',o.name,'ownerId',to_jsonb(o)->>'owner_id','owner',to_jsonb(o)->>'owner',
    'metadata',coalesce(o.metadata,'{}'::jsonb),'userMetadata',coalesce(to_jsonb(o)->'user_metadata','{}'::jsonb),
    'version',to_jsonb(o)->>'version')::text,'UTF8'))
  from storage.objects o where o.bucket_id=p_bucket and o.name=p_path
$$;

create function public._account_deletion_storage_disposition(p_bucket text,p_path text) returns text
language sql stable security definer set search_path=pg_catalog,public as $$
  select case when
    (p_bucket='instrument-media' and (exists(select 1 from public.guitars where hero_image_path=p_path)
      or exists(select 1 from public.guitar_media where storage_path=p_path)))
    or (p_bucket='instrument-documents' and (exists(select 1 from public.guitar_documents where storage_path=p_path)
      or exists(select 1 from public.ownership_claim_evidence where storage_path=p_path)))
    or (p_bucket='service-evidence' and exists(
      select 1 from public.service_submission_evidence e where e.storage_path=p_path))
    then 'retain' else 'delete' end
$$;

create function public._account_deletion_sync_storage_relocations(p_request_id uuid,p_actor_id uuid,p_email text) returns void
language plpgsql security definer set search_path=pg_catalog,public,storage as $$
declare subject uuid;
begin
  if not exists(select 1 from pg_attribute where attrelid='storage.objects'::regclass and attname='owner_id' and not attisdropped)
    or not exists(select 1 from pg_attribute where attrelid='storage.objects'::regclass and attname='owner' and not attisdropped)
    or not exists(select 1 from pg_attribute where attrelid='storage.objects'::regclass and attname='user_metadata' and not attisdropped)
    or not exists(select 1 from pg_attribute where attrelid='storage.objects'::regclass and attname='version' and not attisdropped) then
    raise exception using errcode='PD503',message='Storage identity inventory is unavailable.';
  end if;
  select subject_token into subject from public.account_deletion_fulfillments where request_id=p_request_id;
  if subject is null then raise exception using errcode='PD404',message='Deletion fulfillment was not found.';end if;
  perform set_config('qrguitar.account_deletion_storage_relocation',p_request_id::text,true);
  delete from public.account_deletion_storage_relocations r where r.request_id=p_request_id and r.state='planned'
    and not exists(select 1 from public.account_deletion_storage_content_reviews v where v.relocation_id=r.relocation_id)
    and not exists(select 1 from storage.objects o where o.bucket_id=r.bucket_id and o.name=r.source_path);
  insert into public.account_deletion_storage_relocations(
    request_id,bucket_id,source_path,disposition,destination_path,source_size,source_mime_type,source_version,source_fingerprint)
  select p_request_id,o.bucket_id,o.name,d.disposition,
    case when d.disposition='retain' then 'account-deletion/'||subject::text||'/'||encode(sha256(convert_to(subject::text||':'||o.bucket_id||':'||o.name,'UTF8')),'hex') end,
    case when coalesce(o.metadata->>'size','')~'^[0-9]{1,19}$' then (o.metadata->>'size')::bigint end,
    coalesce(o.metadata->>'mimetype',o.metadata->>'contentType'),to_jsonb(o)->>'version',
    public._account_deletion_storage_object_fingerprint(o.bucket_id,o.name,subject)
  from storage.objects o cross join lateral (select public._account_deletion_storage_disposition(o.bucket_id,o.name) disposition) d
  where o.bucket_id in ('instrument-media','instrument-documents','service-evidence')
    and o.name not like 'account-deletion/'||subject::text||'/%' and (
    coalesce(to_jsonb(o)->>'owner_id','')=p_actor_id::text or coalesce(to_jsonb(o)->>'owner','')=p_actor_id::text
    or strpos('/'||coalesce(o.name,'')||'/','/'||p_actor_id::text||'/')>0
    or public._account_deletion_text_has_identity(concat_ws('|',o.name,o.metadata::text,(to_jsonb(o)->'user_metadata')::text),p_actor_id,p_email)
    or (o.bucket_id='instrument-media' and exists(
      select 1 from public.account_deletion_profile_review_scopes s
      join public.guitars g on g.id=s.guitar_id
      where s.request_id=p_request_id and (g.hero_image_path=o.name or exists(
        select 1 from public.guitar_media m where m.guitar_id=s.guitar_id and m.storage_path=o.name))))
    or (o.bucket_id='instrument-documents' and exists(
      select 1 from public.account_deletion_profile_review_scopes s where s.request_id=p_request_id and (
        exists(select 1 from public.guitar_documents d where d.guitar_id=s.guitar_id and d.storage_path=o.name)
        or exists(select 1 from public.ownership_claims c join public.ownership_claim_evidence e on e.claim_id=c.id
          join public.account_deletion_fulfillments f on f.request_id=s.request_id
          where c.guitar_id=s.guitar_id and e.storage_path=o.name and e.created_at<=f.started_at))))
    or (o.bucket_id='service-evidence' and exists(
      select 1 from public.account_deletion_profile_review_scopes s
      join public.service_submissions x on x.guitar_id=s.guitar_id
      join public.service_submission_evidence e on e.submission_id=x.id
      join public.account_deletion_fulfillments f on f.request_id=s.request_id
      where s.request_id=p_request_id and e.storage_path=o.name and e.created_at<=f.started_at)))
  on conflict(request_id,bucket_id,source_path) do update set
    disposition=excluded.disposition,destination_path=excluded.destination_path,
    source_size=excluded.source_size,source_mime_type=excluded.source_mime_type,
    source_version=excluded.source_version,source_fingerprint=excluded.source_fingerprint
    where public.account_deletion_storage_relocations.state='planned'
      and not exists(select 1 from public.account_deletion_storage_content_reviews v
        where v.relocation_id=public.account_deletion_storage_relocations.relocation_id);
  perform set_config('qrguitar.account_deletion_storage_relocation','',true);
end $$;

create function public._account_deletion_storage_relocations_json(p_request_id uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'relocationId',r.relocation_id,'bucket',r.bucket_id,'sourcePath',r.source_path,'disposition',r.disposition,'destinationPath',r.destination_path,
    'sourceSize',r.source_size,'sourceMimeType',r.source_mime_type,'state',r.state,
    'sourceFingerprint',encode(r.source_fingerprint,'hex'),
    'contentReviewRequired',r.disposition='retain' and v.operation_id is null,
    'contentReviewDecision',v.decision,'contentReviewedAt',v.reviewed_at,
    'byteSha256',case when r.byte_sha256 is null then null else encode(r.byte_sha256,'hex') end,
    'authorizationOperationId',r.finalize_operation_id)
    order by r.bucket_id,r.source_path),'[]'::jsonb)
  from public.account_deletion_storage_relocations r
  left join public.account_deletion_storage_content_reviews v on v.relocation_id=r.relocation_id
  where r.request_id=p_request_id and r.state<>'completed'
$$;

create function public._account_deletion_storage_reviews_json(p_request_id uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'relocationId',r.relocation_id,'bucket',r.bucket_id,'disposition',r.disposition,
    'sourceSize',r.source_size,'sourceMimeType',r.source_mime_type,
    'sourceFingerprint',encode(r.source_fingerprint,'hex'),'reviewRequired',r.disposition='retain',
    'decision',v.decision,'byteSha256',case when v.byte_sha256 is null then null else encode(v.byte_sha256,'hex') end,
    'reviewedAt',v.reviewed_at,'state',r.state)
    order by r.bucket_id,r.relocation_id),'[]'::jsonb)
  from public.account_deletion_storage_relocations r
  left join public.account_deletion_storage_content_reviews v on v.relocation_id=r.relocation_id
  where r.request_id=p_request_id and r.state<>'completed' and (r.disposition='retain' or v.operation_id is not null)
$$;

create function public._account_deletion_storage_cleanup_required(p_request_id uuid,p_actor_id uuid,p_email text) returns boolean
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare found_value boolean;
begin
  if not exists(select 1 from pg_attribute where attrelid='storage.objects'::regclass and attname='owner_id' and not attisdropped)
    or not exists(select 1 from pg_attribute where attrelid='storage.objects'::regclass and attname='owner' and not attisdropped)
    or not exists(select 1 from pg_attribute where attrelid='storage.objects'::regclass and attname='user_metadata' and not attisdropped) then
    return true;
  end if;
  execute $scan$select exists(select 1 from storage.objects where bucket_id in ('instrument-media','instrument-documents','service-evidence') and (
    coalesce(owner_id::text,'')=$1::text or coalesce(owner::text,'')=$1::text
    or strpos('/'||coalesce(name,'')||'/','/'||$1::text||'/')>0
    or public._account_deletion_text_has_identity(concat_ws('|',name,metadata::text,user_metadata::text),$1,$2)))$scan$
    into found_value using p_actor_id,p_email;
  return found_value or exists(select 1 from public.account_deletion_storage_relocations
    where request_id=p_request_id and state<>'completed');
end $$;

-- Product surfaces installed after this core migration can authorize narrowly
-- scoped, delete-only Storage cleanup without weakening the global freeze.
create function public._account_deletion_external_storage_delete_allowed(p_bucket text,p_path text) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$select false$$;

-- Storage writes take the same actor lock as intake/fulfillment.  Real
-- Supabase objects carry the uploader in owner_id (and older installations in
-- owner); checking both OLD and NEW prevents an update from racing the final
-- inventory by moving the identity out of the scanned fields.
create function public._account_deletion_storage_write_fence() returns trigger
language plpgsql security definer set search_path=pg_catalog,public,storage as $$
declare actor uuid; candidate text; row_text text; actors uuid[]:='{}'::uuid[]; item record; active record;
begin
  if tg_op='DELETE' and public._account_deletion_external_storage_delete_allowed(old.bucket_id,old.name) then
    return old;
  end if;
  if exists(select 1 from public.account_deletion_custody_evidence_reviews v
      join public.account_deletion_fulfillments f on f.request_id=v.request_id
      where (tg_op<>'INSERT' and old.bucket_id='instrument-documents'
          and v.object_path_fingerprint=sha256(convert_to(f.subject_token::text||':instrument-documents:'||old.name,'UTF8')))
         or (tg_op<>'DELETE' and new.bucket_id='instrument-documents'
          and v.object_path_fingerprint=sha256(convert_to(f.subject_token::text||':instrument-documents:'||new.name,'UTF8'))))
    and not (tg_op='DELETE' and exists(select 1 from public.account_deletion_storage_relocations r
      where r.bucket_id=old.bucket_id and r.source_path=old.name and r.state in ('deletion_authorized','references_updated'))) then
    raise exception using errcode='PD423',message='This custody proof object is frozen by its reviewed byte receipt.';
  end if;
  -- Once a reviewed plan is authorized its source is immutable. Retained bytes
  -- may be removed only after references have moved; delete-disposition bytes
  -- may be removed only after explicit authorization. Recreating the old path
  -- is always rejected while the durable receipt remains active.
  select r.request_id,r.state into active from public.account_deletion_storage_relocations r where
    (r.state in ('copy_authorized','deletion_authorized','references_updated')
      or exists(select 1 from public.account_deletion_storage_content_reviews v where v.relocation_id=r.relocation_id)) and (
      (tg_op<>'INSERT' and r.bucket_id=old.bucket_id and r.source_path=old.name)
      or (tg_op<>'DELETE' and r.bucket_id=new.bucket_id and r.source_path=new.name))
    order by r.request_id limit 1;
  if found then
    if tg_op='DELETE' and active.state in ('deletion_authorized','references_updated') then return old;end if;
    raise exception using errcode='PD423',message='This Storage object is frozen for verified privacy cleanup.';
  end if;
  if tg_op<>'INSERT' then
    foreach candidate in array array[coalesce(to_jsonb(old)->>'owner_id',''),coalesce(to_jsonb(old)->>'owner','')] loop
      begin if candidate<>'' then actors:=array_append(actors,candidate::uuid);end if;exception when invalid_text_representation then null;end;
    end loop;
  end if;
  if tg_op<>'DELETE' then
    foreach candidate in array array[coalesce(to_jsonb(new)->>'owner_id',''),coalesce(to_jsonb(new)->>'owner','')] loop
      begin if candidate<>'' then actors:=array_append(actors,candidate::uuid);end if;exception when invalid_text_representation then null;end;
    end loop;
  end if;
  row_text:=lower(concat_ws('|',case when tg_op='INSERT' then null else to_jsonb(old)::text end,
    case when tg_op='DELETE' then null else to_jsonb(new)::text end));
  for item in select r.actor_id,lower(btrim(coalesce(u.email,''))) email
    from public.account_deletion_requests r join auth.users u on u.id=r.actor_id where r.status='requested'
      and (r.actor_id=any(actors) or strpos(row_text,r.actor_id::text)>0
        or (coalesce(u.email,'')<>'' and strpos(row_text,lower(btrim(u.email)))>0))
    order by r.actor_id loop
    actor:=item.actor_id;
    if not pg_try_advisory_xact_lock(hashtextextended('qrguitar:privacy-request:'||actor::text,0)) then
      raise exception using errcode='PD423',message='This account has a privacy change in progress; retry the upload.';
    end if;
    if exists(select 1 from public.account_deletion_fulfillments f where f.actor_id=actor
      and f.state in ('quiescing_storage','ready_for_auth_deletion')) then
      raise exception using errcode='PD423',message='Uploads are frozen for privacy fulfillment.';
    end if;
  end loop;
  -- Even before fulfillment exists, serialize owner-attributed objects with a
  -- concurrent intake transaction so the first inventory observes the write.
  for actor in select distinct x from unnest(actors) x where x is not null order by x loop
    if not pg_try_advisory_xact_lock(hashtextextended('qrguitar:privacy-request:'||actor::text,0)) then
      raise exception using errcode='PD423',message='This account has a privacy change in progress; retry the upload.';
    end if;
  end loop;
  return case when tg_op='DELETE' then old else new end;
end $$;
create trigger account_deletion_storage_write_fence before insert or update or delete on storage.objects
  for each row execute function public._account_deletion_storage_write_fence();

-- Profile graph writes and privacy review use the same request/Profile lock.
-- This covers actorless child rows (specs/media) and historical Profiles now
-- owned by someone else, so an attestation can never win a READ COMMITTED race
-- against content that commits immediately afterward.
create function public._account_deletion_profile_graph_fence() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_guitar_id uuid; v_related uuid[]:='{}'::uuid[]; v_id uuid; request_row record; held_request uuid; held_state text;
  permitted text:=current_setting('qrguitar.account_deletion_request',true);
  release_request text:=current_setting('qrguitar.account_deletion_custody_release',true);
begin
  if tg_table_name='guitars' then
    if tg_op<>'INSERT' then v_related:=array_append(v_related,old.id);end if;
    if tg_op<>'DELETE' then v_related:=array_append(v_related,new.id);end if;
  elsif tg_table_name in ('ownership_claim_evidence','ownership_claim_events') then
    for v_id in select distinct c.guitar_id from public.ownership_claims c where c.id in (
      case when tg_op<>'INSERT' then nullif(to_jsonb(old)->>'claim_id','')::uuid end,
      case when tg_op<>'DELETE' then nullif(to_jsonb(new)->>'claim_id','')::uuid end) loop
      v_related:=array_append(v_related,v_id);
    end loop;
  elsif tg_table_name in ('service_submission_evidence','service_submission_tokens','service_submission_activity','service_submission_notifications',
      'service_evidence_uploads','service_evidence_upload_scopes','service_evidence_upload_discard_receipts') then
    for v_id in select distinct s.guitar_id from public.service_submissions s where s.id in (
      case when tg_op<>'INSERT' then nullif(to_jsonb(old)->>'submission_id','')::uuid end,
      case when tg_op<>'DELETE' then nullif(to_jsonb(new)->>'submission_id','')::uuid end) loop
      v_related:=array_append(v_related,v_id);
    end loop;
  elsif tg_table_name='site_content' then
    for v_id in select distinct g.id from public.guitars g where
      (tg_op<>'INSERT' and (to_jsonb(old)->>'content_key'='record_trust:'||g.qr_code
        or to_jsonb(old)->'content_value'->>'guitarId'=g.id::text or to_jsonb(old)->'content_value'->>'qrCode'=g.qr_code))
      or (tg_op<>'DELETE' and (to_jsonb(new)->>'content_key'='record_trust:'||g.qr_code
        or to_jsonb(new)->'content_value'->>'guitarId'=g.id::text or to_jsonb(new)->'content_value'->>'qrCode'=g.qr_code)) loop
      v_related:=array_append(v_related,v_id);
    end loop;
  else
    begin
      if tg_op<>'INSERT' and nullif(to_jsonb(old)->>'guitar_id','') is not null then
        v_related:=array_append(v_related,(to_jsonb(old)->>'guitar_id')::uuid);end if;
      if tg_op<>'DELETE' and nullif(to_jsonb(new)->>'guitar_id','') is not null then
        v_related:=array_append(v_related,(to_jsonb(new)->>'guitar_id')::uuid);end if;
    exception when invalid_text_representation then raise exception using errcode='22023',message='Invalid Profile relationship.'; end;
  end if;
  for v_guitar_id in select distinct x from unnest(v_related) x where x is not null order by x loop
    if not pg_try_advisory_xact_lock(hashtextextended('qrguitar:profile-graph:'||v_guitar_id::text,0)) then
      raise exception using errcode='PD423',message='This Profile has a privacy review in progress; retry the operation.';
    end if;
    for request_row in select s.request_id,f.state from public.account_deletion_profile_review_scopes s
      join public.account_deletion_fulfillments f on f.request_id=s.request_id
      where s.guitar_id=v_guitar_id and exists(
        select 1 from public.account_deletion_storage_relocations r where r.request_id=s.request_id
          and r.state in ('copy_authorized','deletion_authorized','references_updated'))
      order by s.request_id loop
      if permitted is distinct from request_row.request_id::text and release_request is distinct from request_row.request_id::text then
        raise exception using errcode='PD423',message='This Profile is frozen for verified Storage cleanup.';
      end if;
    end loop;
    for request_row in select s.request_id,f.state from public.account_deletion_profile_review_scopes s
      join public.account_deletion_fulfillments f on f.request_id=s.request_id
      where s.guitar_id=v_guitar_id and f.state in ('quiescing_storage','ready_for_auth_deletion') order by s.request_id loop
      if permitted is distinct from request_row.request_id::text and release_request is distinct from request_row.request_id::text then
        raise exception using errcode='PD423',message='This Profile is frozen for privacy fulfillment.';
      end if;
    end loop;
    select c.request_id,f.state into held_request,held_state from public.account_deletion_profile_custody c
      join public.account_deletion_fulfillments f on f.request_id=c.request_id
      where c.guitar_id=v_guitar_id and c.state='privacy_review_required' order by c.held_at desc limit 1;
    if held_request is not null and permitted is distinct from held_request::text and release_request is distinct from held_request::text
      and not (held_state='completed' and tg_table_name in ('ownership_claims','ownership_claim_evidence','ownership_claim_events')) then
      raise exception using errcode='PD423',message='This retained Profile is frozen in privacy custody.';
    end if;
  end loop;
  return case when tg_op='DELETE' then old else new end;
end $$;

do $profile_graph_fences$
declare table_name text; trigger_name text;
begin
  foreach table_name in array array['guitars','qr_redirects','guitar_specs','guitar_media','guitar_documents','guitar_external_media',
    'guitar_serial_aliases','guitar_timeline_events','ownership_transfers','ownership_claims','ownership_claim_evidence','ownership_claim_events',
    'service_provider_profile_access','service_submissions','service_submission_evidence','service_submission_tokens','service_submission_activity',
    'service_submission_notifications','service_evidence_uploads','service_evidence_upload_scopes','service_evidence_upload_discard_receipts',
    'instrument_create_receipts','instrument_staged_uploads','site_content'] loop
    trigger_name:='account_deletion_profile_graph_'||table_name;
    execute format('create trigger %I before insert or update or delete on public.%I for each row execute function public._account_deletion_profile_graph_fence()',trigger_name,table_name);
  end loop;
end $profile_graph_fences$;

create function public._account_deletion_identity_update_allowed(p_domain text,p_table text,p_old jsonb,p_new jsonb) returns boolean
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_request_id uuid; actor_id uuid; subject_id uuid; columns_to_strip text[]; item record;
  old_actor text; new_actor text; old_subject text; new_subject text;
begin
  begin v_request_id:=nullif(current_setting('qrguitar.account_deletion_identity_migration',true),'')::uuid;
  exception when invalid_text_representation then return false; end;
  if v_request_id is null then return false; end if;
  select f.actor_id,case when p_domain='billing' then b.subject_id else s.subject_id end into actor_id,subject_id
    from public.account_deletion_fulfillments f
    left join public.account_deletion_billing_subjects b on b.request_id=f.request_id
    left join public.account_deletion_service_subjects s on s.request_id=f.request_id
    where f.request_id=v_request_id and f.state='quiescing_storage';
  if actor_id is null or subject_id is null then return false; end if;
  select array_agg(distinct value order by value) into columns_to_strip from (
    select actor_column value from public.account_deletion_identity_inventory where domain=p_domain and table_name=p_table
    union select subject_column from public.account_deletion_identity_inventory where domain=p_domain and table_name=p_table
  ) fields;
  if columns_to_strip is null or p_old-columns_to_strip is distinct from p_new-columns_to_strip then return false; end if;
  for item in select actor_column,subject_column from public.account_deletion_identity_inventory
    where domain=p_domain and table_name=p_table order by actor_column loop
    old_actor:=p_old->>item.actor_column;new_actor:=p_new->>item.actor_column;
    old_subject:=p_old->>item.subject_column;new_subject:=p_new->>item.subject_column;
    if old_actor=actor_id::text then
      if p_domain='billing' then
        if new_actor is distinct from subject_id::text or new_subject is distinct from subject_id::text then return false; end if;
      elsif new_actor is not null or new_subject is distinct from subject_id::text then return false;
      end if;
    elsif new_actor is distinct from old_actor or new_subject is distinct from old_subject then return false;
    end if;
  end loop;
  return true;
end $$;

create function public._account_deletion_pseudonymous_text(p_value text,p_actor_id uuid,p_email text,p_salt uuid) returns text
language sql immutable set search_path=pg_catalog as $$
  select case when public._account_deletion_text_has_identity(p_value,p_actor_id,p_email)
    then 'privacy-'||encode(sha256(convert_to(p_salt::text||':'||coalesce(p_value,''),'UTF8')),'hex')
    else p_value end
$$;

-- Billing history is immutable. During the reviewed subject migration, allow
-- only the exact deterministic removal of the departing Auth UUID/current
-- email from enumerated retained content fields; every other byte must match.
create function public._account_deletion_billing_content_update_allowed(p_table text,p_old jsonb,p_new jsonb) returns boolean
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare request_id uuid; actor uuid; email text; salt uuid; expected jsonb:=p_old;
begin
  begin request_id:=nullif(current_setting('qrguitar.account_deletion_billing_content_migration',true),'')::uuid;
  exception when invalid_text_representation then return false;end;
  if request_id is null then return false;end if;
  select actor_id,lower(coalesce(target_email,'')),subject_token into actor,email,salt
    from public.account_deletion_fulfillments where request_id=request_id and state='quiescing_storage';
  if actor is null or salt is null then return false;end if;
  if p_table='billing_orders' then
    expected:=jsonb_set(expected,'{offer}',public._account_deletion_redact_identity_jsonb(p_old->'offer',actor,email,salt),true);
    expected:=jsonb_set(expected,'{last_error}',coalesce(to_jsonb(public._account_deletion_redact_identity(p_old->>'last_error',actor,email)),'null'::jsonb),true);
  elsif p_table='billing_receipts' then
    expected:=jsonb_set(expected,'{receipt}',public._account_deletion_redact_identity_jsonb(p_old->'receipt',actor,email,salt),true);
  elsif p_table in ('billing_credit_holds','billing_review_decisions','billing_paypal_webhook_admin_actions') then
    expected:=jsonb_set(expected,'{reason}',coalesce(to_jsonb(public._account_deletion_redact_identity(p_old->>'reason',actor,email)),'null'::jsonb),true);
  elsif p_table='billing_direct_claims' then
    expected:=jsonb_set(expected,'{reference}',to_jsonb(public._account_deletion_pseudonymous_text(p_old->>'reference',actor,email,salt)),true);
  elsif p_table='billing_direct_orders' then
    expected:=jsonb_set(expected,'{recipient}',public._account_deletion_redact_identity_jsonb(p_old->'recipient',actor,email,salt),true);
  elsif p_table='billing_direct_payments' then
    expected:=jsonb_set(expected,'{reference}',to_jsonb(public._account_deletion_pseudonymous_text(p_old->>'reference',actor,email,salt)),true);
    expected:=jsonb_set(expected,'{normalized_reference}',to_jsonb(public._account_deletion_pseudonymous_text(p_old->>'normalized_reference',actor,email,salt)),true);
  elsif p_table='billing_paypal_webhook_payloads' then
    expected:=jsonb_set(expected,'{raw_body}',to_jsonb(public._account_deletion_redact_identity(p_old->>'raw_body',actor,email)),true);
    expected:=jsonb_set(expected,'{signature_headers}',public._account_deletion_redact_identity_jsonb(p_old->'signature_headers',actor,email,salt),true);
  elsif p_table='billing_paypal_webhook_deliveries' then
    expected:=jsonb_set(expected,'{plan}',public._account_deletion_redact_identity_jsonb(p_old->'plan',actor,email,salt),true);
  elsif p_table='billing_paypal_webhook_outcomes' then
    expected:=jsonb_set(expected,'{resource_id}',coalesce(to_jsonb(public._account_deletion_pseudonymous_text(p_old->>'resource_id',actor,email,salt)),'null'::jsonb),true);
    expected:=jsonb_set(expected,'{detail}',public._account_deletion_redact_identity_jsonb(p_old->'detail',actor,email,salt),true);
  else return false;end if;
  return expected=p_new;
end $$;

create or replace function public._billing_immutable() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare request_id uuid;actor_id uuid;
begin
  if tg_op='UPDATE' and public._account_deletion_billing_content_update_allowed(tg_table_name,to_jsonb(old),to_jsonb(new)) then return new;end if;
  if tg_op='UPDATE' and public._account_deletion_identity_update_allowed('billing',tg_table_name,to_jsonb(old),to_jsonb(new)) then return new; end if;
  if tg_op='DELETE' and tg_table_name='billing_customers' then
    begin request_id:=nullif(current_setting('qrguitar.account_deletion_identity_migration',true),'')::uuid;
    exception when invalid_text_representation then request_id:=null; end;
    select f.actor_id into actor_id from public.account_deletion_fulfillments f where f.request_id=request_id and f.state='quiescing_storage';
    if actor_id is not null and old.owner_id=actor_id then return old; end if;
  end if;
  raise exception using errcode='42501',message='Billing history is append-only.';
end $$;
create or replace function public._billing_order_identity() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if tg_op='UPDATE' and public._account_deletion_billing_content_update_allowed(tg_table_name,to_jsonb(old),to_jsonb(new)) then return new;end if;
  if tg_op='UPDATE' and public._account_deletion_identity_update_allowed('billing',tg_table_name,to_jsonb(old),to_jsonb(new)) then return new; end if;
  if tg_op='DELETE' then raise exception using errcode='42501',message='Billing orders cannot be deleted.';end if;
  if row(new.id,new.owner_id,new.environment,new.request_key,new.offer,new.created_at)
    is distinct from row(old.id,old.owner_id,old.environment,old.request_key,old.offer,old.created_at)
    or new.subject_id is distinct from old.subject_id
    or (old.customer_id is not null and new.customer_id is distinct from old.customer_id)
    or (old.session_id is not null and new.session_id is distinct from old.session_id)
    or (old.payment_id is not null and new.payment_id is distinct from old.payment_id) then
    raise exception using errcode='42501',message='Billing order identity is immutable.';
  end if;
  return new;
end $$;

create function public._account_deletion_billing_identity_normalize() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare i integer:=0; actor_column text; subject_column text; actor_value uuid; subject_value uuid;
  payload jsonb:=to_jsonb(new); expected_owner uuid;
begin
  while i<tg_nargs loop
    actor_column:=tg_argv[i];subject_column:=tg_argv[i+1];i:=i+2;
    actor_value:=nullif(payload->>actor_column,'')::uuid;
    subject_value:=nullif(payload->>subject_column,'')::uuid;
    if actor_value is not null and exists(select 1 from public.account_deletion_billing_subjects where subject_id=actor_value) then
      payload:=payload||jsonb_build_object(subject_column,actor_value);
    elsif subject_value is not null then
      raise exception using errcode='23514',message='Billing subject linkage does not match the pseudonymous owner.';
    end if;
  end loop;
  new:=jsonb_populate_record(new,payload);
  if tg_table_name in ('billing_receipts','billing_credit_grants','billing_direct_orders','billing_paypal_orders') then
    select owner_id into expected_owner from public.billing_orders where id=(to_jsonb(new)->>'order_id')::uuid;
  elsif tg_table_name='billing_credit_consumptions' then
    select owner_id into expected_owner from public.billing_credit_grants where order_id=(to_jsonb(new)->>'order_id')::uuid;
  elsif tg_table_name='billing_credit_holds' then
    select owner_id into expected_owner from public.billing_receipts where environment=to_jsonb(new)->>'environment' and event_id=to_jsonb(new)->>'event_id';
  elsif tg_table_name='billing_review_decisions' then
    select owner_id into expected_owner from public.billing_credit_holds where environment=to_jsonb(new)->>'environment' and event_id=to_jsonb(new)->>'event_id';
  end if;
  if expected_owner is not null and nullif(to_jsonb(new)->>'owner_id','')::uuid is distinct from expected_owner then
    raise exception using errcode='23514',message='Billing history owner must match its parent order.';
  end if;
  return new;
end $$;

do $billing_subject_triggers$
declare item text; table_name text; pairs text; trigger_name text;
begin
  foreach item in array array[
    'billing_customers:owner_id,subject_id','billing_orders:owner_id,subject_id','billing_receipts:owner_id,subject_id',
    'billing_credit_grants:owner_id,subject_id','billing_credit_consumptions:owner_id,subject_id','billing_credit_holds:owner_id,subject_id',
    'billing_review_decisions:owner_id,subject_id,operator_id,operator_subject_id','billing_direct_orders:owner_id,subject_id',
    'billing_direct_payments:operator_id,operator_subject_id','billing_paypal_orders:owner_id,subject_id',
    'billing_paypal_webhook_admin_actions:operator_id,operator_subject_id'] loop
    table_name:=split_part(item,':',1);pairs:=split_part(item,':',2);trigger_name:='account_deletion_billing_subject_'||table_name;
    execute format('create trigger %I before insert or update on public.%I for each row execute function public._account_deletion_billing_identity_normalize(%s)',
      trigger_name,table_name,(select string_agg(quote_literal(value),',') from unnest(string_to_array(pairs,',')) value));
  end loop;
end $billing_subject_triggers$;

-- Purchases remain permanently closed after the Auth identity was removed. The
-- dedicated privacy code distinguishes that terminal state from an ordinary
-- missing billing account while preserving the original active-account checks.
create or replace function public._billing_lock_actor(p_owner_id uuid,p_environment text,p_active boolean) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare s text;
begin
  perform public._billing_environment(p_environment);
  if p_owner_id is null then raise exception using errcode='22023',message='Billing owner is required.';end if;
  perform pg_advisory_xact_lock(hashtextextended('qrguitar:create:'||p_owner_id::text,0));
  if p_active and not exists(select 1 from auth.users where id=p_owner_id) then
    if exists(select 1 from public.account_deletion_fulfillments f
      where f.state in ('ready_for_auth_deletion','completed')
        and f.actor_fingerprint=sha256(convert_to(p_owner_id::text||':'||f.subject_token::text,'UTF8'))) then
      raise exception using errcode='PD423',message='This account is frozen for privacy fulfillment.';
    end if;
    raise exception using errcode='42501',message='Billing account is unavailable.';
  end if;
  if p_active then insert into public.profiles(id) values(p_owner_id) on conflict(id) do nothing;end if;
  select account_status into s from public.profiles where id=p_owner_id for update;
  if p_active and s is distinct from 'active' then
    if s='removed' then raise exception using errcode='PD423',message='This account is frozen for privacy fulfillment.';end if;
    raise exception using errcode='42501',message='This account cannot purchase credits.';
  end if;
end $$;
-- Reconciliation appends are scoped to the exact already-validated order.
-- The public provider RPCs call this private helper only after their canonical
-- receipt checks, and the privacy fence accepts no other owner/order pair.
create or replace function public._billing_receipt(p_order public.billing_orders,p_kind text,p_receipt jsonb) returns boolean
language plpgsql security definer set search_path=pg_catalog,public as $$
declare old public.billing_receipts%rowtype;
begin
  if jsonb_typeof(p_receipt) is distinct from 'object' or coalesce(p_receipt->>'eventId','') !~ '^[A-Za-z0-9_:-]{3,200}$' then
    raise exception using errcode='22023',message='A canonical event receipt is required.';end if;
  perform set_config('qrguitar.billing_reconciliation_order',p_order.id::text,true);
  insert into public.billing_receipts(environment,event_id,owner_id,order_id,kind,receipt)
    values(p_order.environment,p_receipt->>'eventId',p_order.owner_id,p_order.id,p_kind,p_receipt) on conflict do nothing;
  if found then return true;end if;
  select * into old from public.billing_receipts where environment=p_order.environment and event_id=p_receipt->>'eventId';
  if old.order_id is distinct from p_order.id or old.kind is distinct from p_kind or old.receipt is distinct from p_receipt then
    raise exception using errcode='PT409',message='This billing event was already recorded with different details.';end if;
  return false;
end $$;
-- Resolve a provider's original owner UUID to the exact pseudonymous subject
-- on one immutable order.  The keyed actor fingerprint prevents a caller from
-- guessing another deleted account or crossing order/environment boundaries.
create function public._account_deletion_billing_order_owner(
  p_presented_owner uuid,p_environment text,p_order_id uuid
) returns uuid language sql stable security definer set search_path=pg_catalog,public as $$
  select o.owner_id from public.billing_orders o
  where o.id=p_order_id and o.environment=p_environment and (
    o.owner_id=p_presented_owner or exists(
      select 1 from public.account_deletion_billing_subjects b
      join public.account_deletion_fulfillments f on f.request_id=b.request_id
      where b.subject_id=o.owner_id and f.state in ('ready_for_auth_deletion','completed')
        and f.actor_fingerprint=sha256(convert_to(p_presented_owner::text||':'||f.subject_token::text,'UTF8'))))
$$;

create function public._account_deletion_billing_customer_owner(
  p_presented_owner uuid,p_environment text
) returns uuid language sql stable security definer set search_path=pg_catalog,public as $$
  select c.owner_id from public.billing_customers c where c.environment=p_environment and (
    c.owner_id=p_presented_owner or exists(
      select 1 from public.account_deletion_billing_subjects b
      join public.account_deletion_fulfillments f on f.request_id=b.request_id
      where b.subject_id=c.owner_id and f.state in ('ready_for_auth_deletion','completed')
        and f.actor_fingerprint=sha256(convert_to(p_presented_owner::text||':'||f.subject_token::text,'UTF8'))))
  order by (c.owner_id=p_presented_owner) desc limit 1
$$;

create function public._account_deletion_billing_order_json(
  p_order public.billing_orders,p_presented_owner uuid
) returns jsonb language sql stable set search_path=pg_catalog,public as $$
  select public._billing_order_json(p_order)||jsonb_build_object('ownerId',p_presented_owner)
$$;

create or replace function public.billing_get_customer(p_owner_id uuid,p_environment text) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare canonical_owner uuid;
begin
  perform public._billing_environment(p_environment);
  if p_owner_id is null then raise exception using errcode='22023',message='Billing owner is required.';end if;
  canonical_owner:=public._account_deletion_billing_customer_owner(p_owner_id,p_environment);
  return jsonb_build_object('customerId',(select customer_id from public.billing_customers
    where owner_id=canonical_owner and environment=p_environment));
end $$;

create or replace function public.billing_get_order(p_owner_id uuid,p_environment text,p_order_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare o public.billing_orders%rowtype;canonical_owner uuid;
begin
  perform public._billing_environment(p_environment);
  canonical_owner:=public._account_deletion_billing_order_owner(p_owner_id,p_environment,p_order_id);
  select * into o from public.billing_orders where id=p_order_id and owner_id=canonical_owner and environment=p_environment;
  if not found then raise exception using errcode='P0002',message='Billing order was not found.';end if;
  return public._account_deletion_billing_order_json(o,p_owner_id);
end $$;

create or replace function public.billing_link_checkout(p_owner_id uuid,p_environment text,p_order_id uuid,p_session_id text,p_customer_id text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare o public.billing_orders%rowtype;canonical_owner uuid;
begin
  perform public._billing_lock_actor(p_owner_id,p_environment,false);
  canonical_owner:=public._account_deletion_billing_order_owner(p_owner_id,p_environment,p_order_id);
  select * into o from public.billing_orders where id=p_order_id and owner_id=canonical_owner and environment=p_environment for update;
  if not found then raise exception using errcode='P0002',message='Billing order was not found.';end if;
  if coalesce(p_session_id,'') !~ '^cs_[A-Za-z0-9_]{1,180}$' or not exists(select 1 from public.billing_customers
      where owner_id=canonical_owner and environment=p_environment and customer_id=p_customer_id) then
    raise exception using errcode='22023',message='Checkout customer or session identity does not match.';end if;
  if o.session_id is not null then
    if o.session_id is distinct from p_session_id or o.customer_id is distinct from p_customer_id then
      raise exception using errcode='PT409',message='The order already has another Checkout identity.';end if;
    return public._account_deletion_billing_order_json(o,p_owner_id);
  end if;
  if o.status<>'reserved' then raise exception using errcode='PT409',message='Only a reserved order can attach its Checkout.';end if;
  if exists(select 1 from public.billing_orders where environment=p_environment and session_id=p_session_id) then
    raise exception using errcode='PT409',message='Checkout already belongs to another order.';end if;
  update public.billing_orders set customer_id=p_customer_id,session_id=p_session_id,status='open',updated_at=clock_timestamp()
    where id=o.id returning * into o;
  return public._account_deletion_billing_order_json(o,p_owner_id);
exception when unique_violation then raise exception using errcode='PT409',message='Checkout already belongs to another order.';
end $$;

create or replace function public.billing_fulfill_order(p_owner_id uuid,p_environment text,p_order_id uuid,p_receipt jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare o public.billing_orders%rowtype;existing public.billing_credit_grants%rowtype;new_grant boolean:=false;canonical_owner uuid;
begin
  perform public._billing_lock_actor(p_owner_id,p_environment,false);
  canonical_owner:=public._account_deletion_billing_order_owner(p_owner_id,p_environment,p_order_id);
  select * into o from public.billing_orders where id=p_order_id and owner_id=canonical_owner and environment=p_environment for update;
  if not found then raise exception using errcode='P0002',message='Billing order was not found.';end if;
  perform public._billing_payment_identity(o,p_receipt);
  if p_receipt is distinct from jsonb_build_object('eventId',p_receipt->>'eventId','sessionId',p_receipt->>'sessionId','customerId',p_receipt->>'customerId',
    'paymentId',p_receipt->>'paymentId','priceId',o.offer->>'priceId','amount',o.offer->'amount','currency','usd','credits',o.offer->'credits',
    'quantity',1,'environment',p_environment,'status','complete','paymentStatus','paid') then
    raise exception using errcode='22023',message='Only the exact approved paid complete Checkout receipt may grant credits.';end if;
  perform public._billing_receipt(o,'payment',p_receipt);
  select * into existing from public.billing_credit_grants where order_id=o.id;
  if found then
    if existing.session_id is distinct from p_receipt->>'sessionId' or existing.payment_id is distinct from p_receipt->>'paymentId'
      or existing.credits is distinct from (o.offer->>'credits')::integer then
      raise exception using errcode='PT409',message='The completed order has a different grant identity.';end if;
  else
    insert into public.billing_credit_grants(order_id,owner_id,environment,session_id,payment_id,credits)
      values(o.id,canonical_owner,p_environment,p_receipt->>'sessionId',p_receipt->>'paymentId',(o.offer->>'credits')::integer);
    new_grant:=true;
  end if;
  if o.status='expired' then insert into public.billing_credit_holds(environment,event_id,owner_id,reason)
    values(p_environment,p_receipt->>'eventId',canonical_owner,'late_payment_after_expiry') on conflict do nothing;end if;
  update public.billing_orders set customer_id=p_receipt->>'customerId',session_id=p_receipt->>'sessionId',payment_id=p_receipt->>'paymentId',
    status='fulfilled',last_error=null,updated_at=case when status='fulfilled' then updated_at else clock_timestamp() end
    where id=o.id returning * into o;
  return public._account_deletion_billing_order_json(o,p_owner_id)||jsonb_build_object('granted',new_grant,'alreadyGranted',not new_grant,
    'hold',public._billing_held(canonical_owner,p_environment));
exception when unique_violation then raise exception using errcode='PT409',message='This payment or Checkout was already recorded for another order.';
end $$;

create or replace function public.billing_record_review(p_owner_id uuid,p_environment text,p_order_id uuid,p_receipt jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare o public.billing_orders%rowtype;fresh boolean;canonical_owner uuid;
begin
  perform public._billing_lock_actor(p_owner_id,p_environment,false);
  canonical_owner:=public._account_deletion_billing_order_owner(p_owner_id,p_environment,p_order_id);
  select * into o from public.billing_orders where id=p_order_id and owner_id=canonical_owner and environment=p_environment for update;
  if not found then raise exception using errcode='P0002',message='Billing order was not found.';end if;
  perform public._billing_payment_identity(o,p_receipt);
  if coalesce(p_receipt->>'kind','') not in ('refund','dispute') or coalesce(p_receipt->>'referenceId','') !~ '^(ch|re|dp)_[A-Za-z0-9_]{1,180}$'
    or p_receipt is distinct from jsonb_build_object('eventId',p_receipt->>'eventId','sessionId',p_receipt->>'sessionId','customerId',p_receipt->>'customerId',
      'paymentId',p_receipt->>'paymentId','environment',p_environment,'kind',p_receipt->>'kind','referenceId',p_receipt->>'referenceId') then
    raise exception using errcode='22023',message='A canonical refund or dispute receipt is required.';end if;
  fresh:=public._billing_receipt(o,p_receipt->>'kind',p_receipt);
  if not fresh then return public._account_deletion_billing_order_json(o,p_owner_id)||jsonb_build_object('hold',public._billing_held(canonical_owner,p_environment));end if;
  insert into public.billing_credit_holds(environment,event_id,owner_id,reason)
    values(p_environment,p_receipt->>'eventId',canonical_owner,p_receipt->>'kind') on conflict do nothing;
  update public.billing_orders set customer_id=p_receipt->>'customerId',session_id=p_receipt->>'sessionId',payment_id=p_receipt->>'paymentId',
    status=case when status='reserved' then 'open' else status end,last_error='billing_review_required',updated_at=clock_timestamp()
    where id=o.id returning * into o;
  return public._account_deletion_billing_order_json(o,p_owner_id)||jsonb_build_object('hold',public._billing_held(canonical_owner,p_environment));
exception when unique_violation then raise exception using errcode='PT409',message='This payment or Checkout was already recorded for another order.';
end $$;

create or replace function public.billing_record_checkout_expired(p_owner_id uuid,p_environment text,p_order_id uuid,p_receipt jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare o public.billing_orders%rowtype;canonical_owner uuid;
begin
  perform public._billing_lock_actor(p_owner_id,p_environment,false);
  canonical_owner:=public._account_deletion_billing_order_owner(p_owner_id,p_environment,p_order_id);
  select * into o from public.billing_orders where id=p_order_id and owner_id=canonical_owner and environment=p_environment for update;
  if not found then raise exception using errcode='P0002',message='Billing order was not found.';end if;
  if o.session_id is null or o.customer_id is null or p_receipt is distinct from jsonb_build_object('eventId',p_receipt->>'eventId','sessionId',o.session_id,
    'customerId',o.customer_id,'environment',p_environment,'status','expired','paymentStatus','unpaid') then
    raise exception using errcode='PT409',message='Only the exact linked expired unpaid Checkout can resolve this order.';end if;
  perform public._billing_receipt(o,'expired',p_receipt);
  if o.status='open' and o.payment_id is null then
    update public.billing_orders set status='expired',last_error=null,updated_at=clock_timestamp() where id=o.id returning * into o;
  elsif o.status not in ('expired','fulfilled') then
    raise exception using errcode='PT409',message='This order requires payment reconciliation before it can expire.';
  end if;
  return public._account_deletion_billing_order_json(o,p_owner_id);
end $$;

create or replace function public.billing_mark_order_error(p_owner_id uuid,p_environment text,p_order_id uuid,p_code text,p_receipt_id text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare o public.billing_orders%rowtype;fresh boolean;canonical_owner uuid;
begin
  perform public._billing_lock_actor(p_owner_id,p_environment,false);
  if coalesce(p_code,'') !~ '^[a-z][a-z0-9_]{2,79}$' then raise exception using errcode='22023',message='Use a sanitized billing error code.';end if;
  canonical_owner:=public._account_deletion_billing_order_owner(p_owner_id,p_environment,p_order_id);
  select * into o from public.billing_orders where id=p_order_id and owner_id=canonical_owner and environment=p_environment for update;
  if not found then raise exception using errcode='P0002',message='Billing order was not found.';end if;
  fresh:=public._billing_receipt(o,'error',jsonb_build_object('eventId',p_receipt_id,'code',p_code));
  if fresh and o.status in ('reserved','open') then
    update public.billing_orders set last_error=p_code,updated_at=clock_timestamp() where id=o.id returning * into o;end if;
  return public._account_deletion_billing_order_json(o,p_owner_id);
end $$;
create function public._account_deletion_billing_graph_fence() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if not pg_try_advisory_xact_lock(hashtextextended('qrguitar:billing-ledger',0)) then
    raise exception using errcode='PD423',message='Billing history has a privacy review in progress; retry the operation.';
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
do $billing_graph_fences$
declare table_name text; trigger_name text;
begin
  foreach table_name in array array['billing_customers','billing_orders','billing_receipts','billing_credit_grants',
    'billing_credit_consumptions','billing_credit_holds','billing_review_decisions','billing_direct_orders','billing_direct_claims',
    'billing_direct_payments','billing_provider_references','billing_paypal_orders','billing_paypal_bindings',
    'billing_paypal_webhook_deliveries','billing_paypal_webhook_payloads','billing_paypal_webhook_outcomes',
    'billing_paypal_webhook_admin_actions'] loop
    trigger_name:='account_deletion_billing_graph_'||table_name;
    execute format('create trigger %I before insert or update or delete on public.%I for each row execute function public._account_deletion_billing_graph_fence()',trigger_name,table_name);
  end loop;
end $billing_graph_fences$;

create or replace function public._service_evidence_upload_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare redaction_request uuid; storage_request uuid;
begin
  begin redaction_request:=nullif(current_setting('qrguitar.account_deletion_profile_redaction',true),'')::uuid;
  exception when invalid_text_representation then redaction_request:=null;end;
  begin storage_request:=nullif(current_setting('qrguitar.account_deletion_storage_relocation',true),'')::uuid;
  exception when invalid_text_representation then storage_request:=null;end;
  if redaction_request is not null and exists(
      select 1 from public.account_deletion_fulfillments f
      join public.account_deletion_profile_review_scopes r on r.request_id=f.request_id
      join public.service_submissions s on s.guitar_id=r.guitar_id
      where f.request_id=redaction_request and f.state='blocked' and s.id=old.submission_id)
    and to_jsonb(new)-array['file_name','evidence_result']::text[]=to_jsonb(old)-array['file_name','evidence_result']::text[]
    and (old.evidence_result is null or new.evidence_result->>'id'=old.evidence_result->>'id') then return new;end if;
  if storage_request is not null and exists(select 1 from public.account_deletion_storage_relocations r
      where r.request_id=storage_request and r.bucket_id='service-evidence' and r.state in ('planned','copy_authorized')
        and r.source_path=old.storage_path and r.destination_path=new.storage_path)
    and to_jsonb(new)-array['storage_path','evidence_result']::text[]=to_jsonb(old)-array['storage_path','evidence_result']::text[]
    and new.evidence_result is not distinct from (case when old.evidence_result is null then null
      else public._account_deletion_replace_json_string(old.evidence_result,old.storage_path,new.storage_path) end) then return new;end if;
  if public._account_deletion_identity_update_allowed('service',tg_table_name,
      to_jsonb(old)-array['storage_path','evidence_result']::text[],to_jsonb(new)-array['storage_path','evidence_result']::text[])
    and ((old.state in ('deleted','discarded') and
        (new.storage_path='privacy-subject/'||new.actor_subject_id::text||'/'||new.upload_id::text
          or (old.storage_path~'^account-deletion/' and new.storage_path=old.storage_path)))
      or (old.state='committed' and old.storage_path~'^account-deletion/' and new.storage_path=old.storage_path))
    and new.evidence_result is not distinct from (case when old.evidence_result is null then null else
      replace(old.evidence_result::text,old.actor_id::text,new.actor_subject_id::text)::jsonb end)
    and old.state in ('committed','deleted','discarded') and new.state=old.state then return new; end if;
  if row(new.upload_id,new.submission_id,new.actor_id,new.actor_subject_id,new.evidence_type,new.file_name,new.mime_type,new.file_size_bytes,new.storage_path,new.prepared_at,new.expected_revision)
    is distinct from row(old.upload_id,old.submission_id,old.actor_id,old.actor_subject_id,old.evidence_type,old.file_name,old.mime_type,old.file_size_bytes,old.storage_path,old.prepared_at,old.expected_revision)
    or not ((old.state='prepared' and new.state in ('committed','discarded')) or (old.state='committed' and new.state='deleted'))
    or (old.state='committed' and row(new.evidence_id,new.evidence_result,new.committed_at)
      is distinct from row(old.evidence_id,old.evidence_result,old.committed_at)) then
    raise exception using errcode='42501',message='Evidence upload identity and terminal receipt are immutable.';
  end if;
  return new;
end $$;

create or replace function public._service_evidence_upload_recovery_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if tg_table_name='service_evidence_upload_discard_receipts'
    and tg_op='UPDATE' and public._account_deletion_identity_update_allowed('service',tg_table_name,to_jsonb(old),to_jsonb(new)) then return new; end if;
  if tg_table_name='service_evidence_upload_discard_receipts' then
    raise exception using errcode='42501',message='Evidence discard receipts are immutable.';
  end if;
  if row(new.submission_id,new.actor_id) is distinct from row(old.submission_id,old.actor_id)
    or old.revision=9223372036854775807 or new.revision<>old.revision+1 then
    raise exception using errcode='42501',message='Evidence recovery revision must advance exactly once.';
  end if;
  return new;
end $$;

-- Product migrations installed later can extend the reviewed billing graph and
-- migrate their owner aliases inside the same subject transaction.  The stubs
-- keep this core independently installable and fail closed once a later table
-- registers itself in account_deletion_identity_inventory.
create function public._account_deletion_promo_billing_graph(p_actor_id uuid,p_subject_id uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$select jsonb_build_object('promotions','[]'::jsonb)$$;
create function public._account_deletion_promo_migrate_billing_subject(
  p_request_id uuid,p_actor_id uuid,p_subject_id uuid
) returns void language plpgsql security definer set search_path=pg_catalog,public as $$begin return;end$$;

create function public._account_deletion_billing_graph(p_actor_id uuid,p_subject_id uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,public set timezone='UTC' as $$
  with linked_orders as (
    select distinct id from public.billing_orders where owner_id in (p_actor_id,p_subject_id) or subject_id=p_subject_id
    union select distinct order_id from public.billing_receipts where owner_id in (p_actor_id,p_subject_id) or subject_id=p_subject_id
    union select distinct order_id from public.billing_credit_grants where owner_id in (p_actor_id,p_subject_id) or subject_id=p_subject_id
    union select distinct order_id from public.billing_credit_consumptions where owner_id in (p_actor_id,p_subject_id) or subject_id=p_subject_id
    union select distinct order_id from public.billing_direct_orders where owner_id in (p_actor_id,p_subject_id) or subject_id=p_subject_id
    union select distinct order_id from public.billing_direct_payments where operator_id in (p_actor_id,p_subject_id) or operator_subject_id=p_subject_id
    union select distinct order_id from public.billing_paypal_orders where owner_id in (p_actor_id,p_subject_id) or subject_id=p_subject_id
  ), linked_events as (
    select r.environment,r.event_id from public.billing_receipts r where r.order_id in (select id from linked_orders)
    union select h.environment,h.event_id from public.billing_credit_holds h where h.owner_id in (p_actor_id,p_subject_id) or h.subject_id=p_subject_id
  ), linked_paypal as (
    select b.environment,b.paypal_order_id from public.billing_paypal_bindings b where b.order_id in (select id from linked_orders)
  ), linked_deliveries as (
    select distinct o.delivery_id from public.billing_paypal_webhook_outcomes o where
      (o.environment,o.receipt_event_id) in (select environment,event_id from linked_events)
      or (o.environment,o.paypal_order_id) in (select environment,paypal_order_id from linked_paypal)
      or exists(select 1 from linked_orders x where o.detail::text like '%'||x.id::text||'%')
    union select distinct d.id from public.billing_paypal_webhook_deliveries d where exists(
      select 1 from linked_orders x where coalesce(d.plan,'[]'::jsonb)::text like '%'||x.id::text||'%')
  )
  select jsonb_build_object(
    'customers',(select coalesce(jsonb_agg(to_jsonb(x) order by x.environment,x.customer_id),'[]'::jsonb) from public.billing_customers x where x.owner_id in (p_actor_id,p_subject_id) or x.subject_id=p_subject_id),
    'orders',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb) from public.billing_orders x where x.id in (select id from linked_orders)),
    'receipts',(select coalesce(jsonb_agg(to_jsonb(x) order by x.environment,x.event_id),'[]'::jsonb) from public.billing_receipts x where x.order_id in (select id from linked_orders)),
    'grants',(select coalesce(jsonb_agg(to_jsonb(x) order by x.order_id),'[]'::jsonb) from public.billing_credit_grants x where x.order_id in (select id from linked_orders)),
    'consumptions',(select coalesce(jsonb_agg(to_jsonb(x) order by x.guitar_id),'[]'::jsonb) from public.billing_credit_consumptions x where x.order_id in (select id from linked_orders)),
    'holds',(select coalesce(jsonb_agg(to_jsonb(x) order by x.environment,x.event_id),'[]'::jsonb) from public.billing_credit_holds x where (x.environment,x.event_id) in (select environment,event_id from linked_events)),
    'decisions',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb) from public.billing_review_decisions x where (x.environment,x.event_id) in (select environment,event_id from linked_events) or x.owner_id in (p_actor_id,p_subject_id) or x.operator_id in (p_actor_id,p_subject_id) or x.subject_id=p_subject_id or x.operator_subject_id=p_subject_id),
    'directOrders',(select coalesce(jsonb_agg(to_jsonb(x) order by x.order_id),'[]'::jsonb) from public.billing_direct_orders x where x.order_id in (select id from linked_orders)),
    'directClaims',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb) from public.billing_direct_claims x where x.order_id in (select id from linked_orders)),
    'directPayments',(select coalesce(jsonb_agg(to_jsonb(x) order by x.order_id),'[]'::jsonb) from public.billing_direct_payments x where x.order_id in (select id from linked_orders)),
    'providerReferences',(select coalesce(jsonb_agg(to_jsonb(x) order by x.environment,x.provider,x.normalized_reference),'[]'::jsonb) from public.billing_provider_references x where x.order_id in (select id from linked_orders)),
    'paypalOrders',(select coalesce(jsonb_agg(to_jsonb(x) order by x.order_id),'[]'::jsonb) from public.billing_paypal_orders x where x.order_id in (select id from linked_orders)),
    'paypalBindings',(select coalesce(jsonb_agg(to_jsonb(x) order by x.order_id),'[]'::jsonb) from public.billing_paypal_bindings x where x.order_id in (select id from linked_orders)),
    'webhookDeliveries',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb) from public.billing_paypal_webhook_deliveries x where x.id in (select delivery_id from linked_deliveries)),
    'webhookPayloads',(select coalesce(jsonb_agg(to_jsonb(x) order by x.delivery_id),'[]'::jsonb) from public.billing_paypal_webhook_payloads x where x.delivery_id in (select delivery_id from linked_deliveries)),
    'webhookOutcomes',(select coalesce(jsonb_agg(to_jsonb(x) order by x.environment,x.event_id,x.event_cursor),'[]'::jsonb) from public.billing_paypal_webhook_outcomes x where x.delivery_id in (select delivery_id from linked_deliveries)),
    'webhookActions',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb) from public.billing_paypal_webhook_admin_actions x where x.delivery_id in (select delivery_id from linked_deliveries) or x.operator_id in (p_actor_id,p_subject_id) or x.operator_subject_id=p_subject_id)
  ) || public._account_deletion_promo_billing_graph(p_actor_id,p_subject_id)
$$;

create function public._account_deletion_service_graph(p_actor_id uuid,p_subject_id uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,public set timezone='UTC' as $$
  with linked_submissions as (
    select distinct id from public.service_submissions where provider_user_id=p_actor_id or owner_user_id=p_actor_id
      or provider_subject_id=p_subject_id or owner_subject_id=p_subject_id
    union select distinct submission_id from public.service_submission_evidence where uploaded_by_user_id=p_actor_id or uploaded_by_subject_id=p_subject_id
    union select distinct submission_id from public.service_evidence_uploads where actor_id=p_actor_id or actor_subject_id=p_subject_id
    union select distinct submission_id from public.service_evidence_upload_discard_receipts where actor_id=p_actor_id or actor_subject_id=p_subject_id
    union select distinct submission_id from public.service_submission_activity where actor_user_id=p_actor_id or actor_subject_id=p_subject_id
  )
  select jsonb_build_object(
    'submissions',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb) from public.service_submissions x where x.id in (select id from linked_submissions)),
    'evidence',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb) from public.service_submission_evidence x where x.submission_id in (select id from linked_submissions)),
    'uploads',(select coalesce(jsonb_agg(to_jsonb(x) order by x.upload_id),'[]'::jsonb) from public.service_evidence_uploads x where x.submission_id in (select id from linked_submissions)),
    'discards',(select coalesce(jsonb_agg(to_jsonb(x) order by x.upload_id),'[]'::jsonb) from public.service_evidence_upload_discard_receipts x where x.submission_id in (select id from linked_submissions)),
    'activity',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb) from public.service_submission_activity x where x.submission_id in (select id from linked_submissions)),
    'timeline',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb) from public.guitar_timeline_events x where x.created_by_user_id=p_actor_id or x.provider_user_id=p_actor_id or x.evidence_reviewed_by=p_actor_id
      or x.created_by_subject_id=p_subject_id or x.provider_subject_id=p_subject_id or x.evidence_reviewed_by_subject_id=p_subject_id
      or x.service_submission_id in (select id from linked_submissions))
  )
$$;

create function public._account_deletion_graph_has_rows(p_graph jsonb) returns boolean
language sql immutable set search_path=pg_catalog as $$
  select exists(select 1 from jsonb_each(p_graph) e where jsonb_typeof(e.value)='array' and jsonb_array_length(e.value)>0)
$$;

create function public._account_deletion_strip_internal_identity(p_value jsonb) returns jsonb
language plpgsql immutable set search_path=pg_catalog,public as $$
declare result jsonb;
begin
  if jsonb_typeof(p_value)<>'object' then return p_value;end if;
  select coalesce(jsonb_object_agg(grouped.key,case when jsonb_typeof(grouped.value)<>'array' then grouped.value else (
    select coalesce(jsonb_agg(case when jsonb_typeof(item.value)='object' then item.value-array[
      'owner_id','subject_id','operator_id','operator_subject_id','provider_user_id','provider_subject_id',
      'owner_user_id','owner_subject_id','uploaded_by_user_id','uploaded_by_subject_id','actor_user_id','actor_subject_id',
      'actor_id','created_by_user_id','created_by_subject_id','evidence_reviewed_by','evidence_reviewed_by_subject_id',
      'storage_path','evidence_result']::text[] else item.value end order by item.ordinality),'[]'::jsonb)
      from jsonb_array_elements(grouped.value) with ordinality item(value,ordinality)) end order by grouped.key),'{}'::jsonb)
    into result from jsonb_each(p_value) grouped;
  return result;
end $$;

create function public._account_deletion_retention_fingerprint(p_request_id uuid,p_domain text) returns bytea
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare actor uuid; subject uuid; graph jsonb;
begin
  select f.actor_id,case when p_domain='billing' then b.subject_id else s.subject_id end into actor,subject
    from public.account_deletion_fulfillments f
    left join public.account_deletion_billing_subjects b on b.request_id=f.request_id
    left join public.account_deletion_service_subjects s on s.request_id=f.request_id
    where f.request_id=p_request_id;
  if p_domain not in ('billing','service') then return null;end if;
  graph:=case when p_domain='billing' then public._account_deletion_billing_graph(actor,subject)
    else public._account_deletion_service_graph(actor,subject) end;
  return sha256(convert_to(graph::text,'UTF8'));
end $$;

create function public._account_deletion_retention_reviews_json(p_request_id uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
  with job as (select f.actor_id,b.subject_id billing_subject,s.subject_id service_subject
    from public.account_deletion_fulfillments f
    left join public.account_deletion_billing_subjects b on b.request_id=f.request_id
    left join public.account_deletion_service_subjects s on s.request_id=f.request_id
    where f.request_id=p_request_id), domains as (
    select 'billing' domain,job.actor_id,public._account_deletion_billing_graph(job.actor_id,job.billing_subject) graph from job
    union all select 'service',job.actor_id,public._account_deletion_service_graph(job.actor_id,job.service_subject) from job
  )
  select coalesce(jsonb_agg(jsonb_build_object('domain',d.domain,'policyVersion',1,
    'contentFingerprint',case when d.actor_id is null and a.operation_id is not null then encode(a.content_fingerprint,'hex')
      else encode(public._account_deletion_retention_fingerprint(p_request_id,d.domain),'hex') end,
    'required',public._account_deletion_graph_has_rows(d.graph),'attested',a.operation_id is not null,
    'decisionCode',a.decision_code,'attestedAt',a.reviewed_at) order by d.domain),'[]'::jsonb)
  from domains d left join lateral(select x.operation_id,x.content_fingerprint,x.decision_code,x.reviewed_at
    from public.account_deletion_retention_attestations x where x.request_id=p_request_id and x.domain=d.domain
      and (d.actor_id is null or x.content_fingerprint=public._account_deletion_retention_fingerprint(p_request_id,d.domain))
    order by x.reviewed_at desc,x.operation_id limit 1) a on true
$$;

create function public._account_deletion_retention_review_complete(p_request_id uuid,p_domain text) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
  with job as (select actor_id from public.account_deletion_fulfillments where request_id=p_request_id), graph as (
    select case when p_domain='billing' then public._account_deletion_billing_graph(actor_id,null)
      else public._account_deletion_service_graph(actor_id,null) end value from job)
  select coalesce(not public._account_deletion_graph_has_rows(graph.value) or exists(
    select 1 from public.account_deletion_retention_attestations a where a.request_id=p_request_id and a.domain=p_domain
      and a.content_fingerprint=public._account_deletion_retention_fingerprint(p_request_id,p_domain)),false) from graph
$$;

-- Replace the early bootstrap serializer now that the reviewed inventories are
-- available. These are bounded to the request's durable scope and contain no
-- target Auth UUID, email, payment reference, or free-form customer content.
create function public._account_deletion_admin_fulfillment_json(p_job public.account_deletion_fulfillments) returns jsonb
language sql stable set search_path=pg_catalog,public as $$
  select public._account_deletion_fulfillment_json(p_job)
$$;

create table public.account_deletion_review_page_receipts (
  operation_id uuid primary key,
  request_id uuid not null references public.account_deletion_fulfillments(request_id) on delete cascade,
  kind text not null check(kind in ('profile','retention')),
  scope_key text not null,
  content_fingerprint bytea not null check(octet_length(content_fingerprint)=32),
  page_index integer not null check(page_index>=0),
  page_count integer not null check(page_count>=1 and page_index<page_count),
  page_digest bytea not null check(octet_length(page_digest)=32),
  reviewed_by uuid not null,
  reviewed_at timestamptz not null default clock_timestamp(),
  result jsonb not null,
  unique(request_id,kind,scope_key,content_fingerprint,page_index,reviewed_by)
);
alter table public.account_deletion_review_page_receipts enable row level security;
alter table public.account_deletion_review_page_receipts force row level security;
revoke all on public.account_deletion_review_page_receipts from public,anon,authenticated,service_role;
create policy account_deletion_review_page_receipts_no_direct_access on public.account_deletion_review_page_receipts for all using(false) with check(false);
create trigger account_deletion_review_page_receipts_immutable before update or delete on public.account_deletion_review_page_receipts
  for each row execute function public._account_deletion_fulfillment_guard();

create function public._account_deletion_review_graph_within_bounds(p_graph jsonb) returns boolean
language sql immutable set search_path=pg_catalog as $$
  select octet_length(p_graph::text)<=524288 and coalesce((
    select sum(case when jsonb_typeof(e.value)='array' then jsonb_array_length(e.value) else 1 end)
    from jsonb_each(p_graph) e),0)<=500
$$;

create function public.read_account_deletion_review_snapshot(
  p_admin_id uuid,p_environment_admin boolean,p_request_id uuid,p_kind text,p_guitar_id uuid,
  p_domain text,p_expected_fingerprint text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare job public.account_deletion_fulfillments; actual bytea; graph jsonb; scope_row public.account_deletion_profile_review_scopes;
  sections jsonb; safe_graph jsonb; truncated boolean;
begin
  if p_request_id is null or p_kind not in ('profile','retention')
    or coalesce(p_expected_fingerprint,'') !~ '^[a-f0-9]{64}$' then
    raise exception using errcode='22023',message='A review kind and exact content fingerprint are required.';
  end if;
  perform public._account_deletion_admin(p_admin_id,p_environment_admin);
  if not pg_try_advisory_xact_lock(hashtextextended('qrguitar:account-deletion:'||p_request_id::text,0)) then
    raise exception using errcode='PD423',message='This deletion review is changing; retry the inspection.';end if;
  select * into job from public.account_deletion_fulfillments where request_id=p_request_id;
  if not found then raise exception using errcode='PD404',message='Deletion fulfillment was not found.';end if;
  if p_kind='profile' then
    if p_guitar_id is null or p_domain is not null then
      raise exception using errcode='22023',message='A Profile review requires only its Profile UUID.';end if;
    if not pg_try_advisory_xact_lock(hashtextextended('qrguitar:profile-graph:'||p_guitar_id::text,0)) then
      raise exception using errcode='PD423',message='This Profile is changing; retry the inspection.';end if;
    select * into scope_row from public.account_deletion_profile_review_scopes
      where request_id=p_request_id and guitar_id=p_guitar_id;
    if not found then raise exception using errcode='PD404',message='This Profile is not in the deletion review scope.';end if;
    actual:=public._account_deletion_profile_fingerprint(p_request_id,p_guitar_id);
    if encode(actual,'hex')<>p_expected_fingerprint then
      raise exception using errcode='PD412',message='Profile content changed; load the latest review.';end if;
    safe_graph:=public._account_deletion_review_safe_jsonb(public._account_deletion_profile_review_graph(p_request_id,p_guitar_id))-'ownerScope';
    truncated:=not public._account_deletion_review_graph_within_bounds(safe_graph);
    select coalesce(jsonb_agg(jsonb_build_object('code',e.key,'label',initcap(regexp_replace(e.key,'([A-Z])',' \1','g')),
      'recordCount',case when jsonb_typeof(e.value)='array' then jsonb_array_length(e.value) else 1 end,
      'contentDigest',encode(sha256(convert_to(e.value::text,'UTF8')),'hex'),
      'records',case when truncated then '[]'::jsonb when jsonb_typeof(e.value)='array' then e.value else jsonb_build_array(e.value) end) order by e.key),'[]'::jsonb)
      into sections from jsonb_each(safe_graph) e
      where e.key not in ('policyVersion','requestId','guitarId','scope');
    return jsonb_build_object('ok',true,'kind','profile','policyVersion',1,'contentFingerprint',p_expected_fingerprint,
      'truncated',truncated,'profile',jsonb_build_object('guitarId',p_guitar_id,
        'qrCode',(select qr_code from public.guitars where id=p_guitar_id),
        'relationshipCodes',to_jsonb(scope_row.relationship_codes),'sections',sections));
  end if;
  if p_guitar_id is not null or p_domain not in ('billing','service') then
    raise exception using errcode='22023',message='A retention review requires only its billing or service domain.';end if;
  if not pg_try_advisory_xact_lock(hashtextextended('qrguitar:account-deletion-retention:'||p_request_id::text||':'||p_domain,0)) then
    raise exception using errcode='PD423',message='These retained records are changing; retry the inspection.';end if;
  if p_domain='billing' and not pg_try_advisory_xact_lock(hashtextextended('qrguitar:billing-ledger',0)) then
    raise exception using errcode='PD423',message='Billing history is changing; retry the inspection.';end if;
  actual:=public._account_deletion_retention_fingerprint(p_request_id,p_domain);
  if actual is null or encode(actual,'hex')<>p_expected_fingerprint then
    raise exception using errcode='PD412',message='Retained records changed; load the latest review.';end if;
  graph:=case when p_domain='billing' then public._account_deletion_billing_graph(job.actor_id,null)
    else public._account_deletion_service_graph(job.actor_id,null) end;
  if not public._account_deletion_graph_has_rows(graph) then
    raise exception using errcode='PD409',message='This retention review is not required.';end if;
  safe_graph:=public._account_deletion_review_safe_jsonb(public._account_deletion_redact_identity_jsonb(
    public._account_deletion_strip_internal_identity(graph),job.actor_id,lower(coalesce(job.target_email,'')),job.subject_token));
  truncated:=not public._account_deletion_review_graph_within_bounds(safe_graph);
  select coalesce(jsonb_agg(jsonb_build_object('code',e.key,'label',initcap(regexp_replace(e.key,'([A-Z])',' \1','g')),
    'recordCount',case when jsonb_typeof(e.value)='array' then jsonb_array_length(e.value) else 1 end,
    'contentDigest',encode(sha256(convert_to(e.value::text,'UTF8')),'hex'),
    'records',case when truncated then '[]'::jsonb when jsonb_typeof(e.value)='array' then e.value else jsonb_build_array(e.value) end) order by e.key),'[]'::jsonb)
    into sections from jsonb_each(safe_graph) e;
  return jsonb_build_object('ok',true,'kind','retention','policyVersion',1,'contentFingerprint',p_expected_fingerprint,
    'truncated',truncated,'retention',jsonb_build_object('domain',p_domain,'sections',sections));
end $$;

-- Every bounded page is fingerprinted and durably recorded as delivered to the
-- reviewing administrator. Final attestation requires every page for the
-- unchanged aggregate fingerprint, so large histories cannot be silently
-- omitted or stranded behind a one-response size cap.
create function public.inspect_account_deletion_review_page(
  p_admin_id uuid,p_environment_admin boolean,p_request_id uuid,p_operation_id uuid,p_kind text,p_guitar_id uuid,
  p_domain text,p_expected_fingerprint text,p_page_index integer
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare job public.account_deletion_fulfillments; scope_row public.account_deletion_profile_review_scopes;
  actual bytea; safe_graph jsonb; page_rows jsonb; sections jsonb; total_rows integer; v_page_count integer;
  v_page_digest bytea; v_scope_key text; existing public.account_deletion_review_page_receipts; output jsonb;
begin
  if p_request_id is null or p_operation_id is null or p_kind not in ('profile','retention')
    or coalesce(p_expected_fingerprint,'')!~'^[a-f0-9]{64}$' or p_page_index is null or p_page_index<0 then
    raise exception using errcode='22023',message='An exact review page and fingerprint are required.';end if;
  perform public._account_deletion_admin(p_admin_id,p_environment_admin);
  perform pg_advisory_xact_lock(hashtextextended('qrguitar:deletion-operation:'||p_operation_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended('qrguitar:account-deletion:'||p_request_id::text,0));
  select * into job from public.account_deletion_fulfillments where request_id=p_request_id for update;
  if not found or job.state<>'blocked' then raise exception using errcode='PD409',message='This privacy review is not open.';end if;
  if exists(select 1 from public.account_deletion_fulfillment_receipts where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_profile_review_attestations where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_retention_attestations where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_storage_content_reviews where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_custody_evidence_reviews where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_review_page_receipts where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_custody_release_receipts where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_storage_relocations where finalize_operation_id=p_operation_id or complete_operation_id=p_operation_id) then
    raise exception using errcode='PD409',message='This operation UUID belongs to another deletion action.';end if;
  if p_kind='profile' then
    if p_guitar_id is null or p_domain is not null then raise exception using errcode='22023',message='A Profile review requires only its Profile UUID.';end if;
    perform pg_advisory_xact_lock(hashtextextended('qrguitar:profile-graph:'||p_guitar_id::text,0));
    select * into scope_row from public.account_deletion_profile_review_scopes where request_id=p_request_id and guitar_id=p_guitar_id;
    if not found then raise exception using errcode='PD404',message='This Profile is not in the deletion review scope.';end if;
    actual:=public._account_deletion_profile_fingerprint(p_request_id,p_guitar_id);v_scope_key:=p_guitar_id::text;
    safe_graph:=public._account_deletion_review_safe_jsonb(public._account_deletion_profile_review_graph(p_request_id,p_guitar_id))-'ownerScope';
  else
    if p_guitar_id is not null or p_domain not in ('billing','service') then raise exception using errcode='22023',message='A retention review requires its domain.';end if;
    perform pg_advisory_xact_lock(hashtextextended('qrguitar:account-deletion-retention:'||p_request_id::text||':'||p_domain,0));
    if p_domain='billing' then perform pg_advisory_xact_lock(hashtextextended('qrguitar:billing-ledger',0));end if;
    actual:=public._account_deletion_retention_fingerprint(p_request_id,p_domain);v_scope_key:=p_domain;
    safe_graph:=public._account_deletion_review_safe_jsonb(public._account_deletion_redact_identity_jsonb(
      public._account_deletion_strip_internal_identity(case when p_domain='billing' then public._account_deletion_billing_graph(job.actor_id,null)
        else public._account_deletion_service_graph(job.actor_id,null) end),job.actor_id,lower(coalesce(job.target_email,'')),job.subject_token));
  end if;
  if actual is null or encode(actual,'hex')<>p_expected_fingerprint then raise exception using errcode='PD412',message='Reviewed records changed; load the latest fingerprint.';end if;
  select count(*)::integer into total_rows from jsonb_each(safe_graph) e
    cross join lateral jsonb_array_elements(case when jsonb_typeof(e.value)='array' then e.value else jsonb_build_array(e.value) end) v;
  v_page_count:=greatest(1,ceil(total_rows/50.0)::integer);
  if p_page_index>=v_page_count then raise exception using errcode='22023',message='This review page does not exist.';end if;
  with flattened as (
    select e.key section_code,v.value record,v.ordinality,row_number() over(order by e.key,v.ordinality) rn
    from jsonb_each(safe_graph) e cross join lateral
      jsonb_array_elements(case when jsonb_typeof(e.value)='array' then e.value else jsonb_build_array(e.value) end) with ordinality v(value,ordinality)
  ), selected as (select * from flattened where rn between p_page_index*50+1 and (p_page_index+1)*50),
  grouped as (select section_code,jsonb_agg(record order by ordinality) records from selected group by section_code)
  select coalesce(jsonb_object_agg(section_code,records),'{}'::jsonb) into page_rows from grouped;
  v_page_digest:=sha256(convert_to(p_expected_fingerprint||':'||p_page_index::text||':'||v_page_count::text||':'||page_rows::text,'UTF8'));
  select coalesce(jsonb_agg(jsonb_build_object('code',e.key,'label',initcap(regexp_replace(e.key,'([A-Z])',' \1','g')),
    'recordCount',case when jsonb_typeof(e.value)='array' then jsonb_array_length(e.value) else 1 end,
    'contentDigest',encode(sha256(convert_to(e.value::text,'UTF8')),'hex'),'records',coalesce(page_rows->e.key,'[]'::jsonb)) order by e.key),'[]'::jsonb)
    into sections from jsonb_each(safe_graph) e where p_kind='retention' or e.key not in ('policyVersion','requestId','guitarId','scope');
  select * into existing from public.account_deletion_review_page_receipts where operation_id=p_operation_id;
  if found then
    if existing.request_id<>p_request_id or existing.kind<>p_kind or existing.scope_key<>v_scope_key
      or existing.content_fingerprint<>actual or existing.page_index<>p_page_index or existing.page_count<>v_page_count or existing.page_digest<>v_page_digest then
      raise exception using errcode='PD409',message='This operation UUID belongs to another review page.';end if;
  else
    insert into public.account_deletion_review_page_receipts(operation_id,request_id,kind,scope_key,content_fingerprint,page_index,page_count,page_digest,reviewed_by,result)
      values(p_operation_id,p_request_id,p_kind,v_scope_key,actual,p_page_index,v_page_count,v_page_digest,p_admin_id,
        jsonb_build_object('contentFingerprint',p_expected_fingerprint,'pageIndex',p_page_index,'pageCount',v_page_count,'pageDigest',encode(v_page_digest,'hex')));
  end if;
  output:=jsonb_build_object('ok',true,'kind',p_kind,'policyVersion',1,'contentFingerprint',p_expected_fingerprint,'truncated',false,
    'pageIndex',p_page_index,'pageCount',v_page_count,'pageDigest',encode(v_page_digest,'hex'),
    'deliveredPages',(select count(distinct r.page_index) from public.account_deletion_review_page_receipts r where r.request_id=p_request_id
      and r.kind=p_kind and r.scope_key=v_scope_key and r.content_fingerprint=actual and r.page_count=v_page_count),
    'allPagesDelivered',(select count(distinct r.page_index)=v_page_count from public.account_deletion_review_page_receipts r where r.request_id=p_request_id
      and r.kind=p_kind and r.scope_key=v_scope_key and r.content_fingerprint=actual and r.page_count=v_page_count));
  if p_kind='profile' then return output||jsonb_build_object('profile',jsonb_build_object('guitarId',p_guitar_id,
    'qrCode',(select qr_code from public.guitars where id=p_guitar_id),'relationshipCodes',to_jsonb(scope_row.relationship_codes),'sections',sections));end if;
  return output||jsonb_build_object('retention',jsonb_build_object('domain',p_domain,'sections',sections));
end $$;

create function public.redact_account_deletion_profile_review(
  p_admin_id uuid,p_environment_admin boolean,p_request_id uuid,p_operation_id uuid,p_guitar_id uuid,
  p_expected_fingerprint text,p_terms text[]
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare job public.account_deletion_fulfillments; receipt public.account_deletion_fulfillment_receipts;
  actual bytea; after_value bytea; normalized_terms text[]; terms_digest text; result jsonb;
begin
  if p_request_id is null or p_operation_id is null or p_guitar_id is null
    or coalesce(p_expected_fingerprint,'') !~ '^[a-f0-9]{64}$'
    or coalesce(cardinality(p_terms),0) not between 1 and 32
    or exists(select 1 from unnest(p_terms) t where char_length(btrim(t)) not between 3 and 200 or t~'[[:cntrl:]]') then
    raise exception using errcode='22023',message='One to 32 exact personal-information terms of 3 to 200 characters are required.';
  end if;
  select array_agg(value order by lower(value),value) into normalized_terms from (
    select distinct btrim(t) value from unnest(p_terms) t) terms;
  perform public._account_deletion_admin(p_admin_id,p_environment_admin);
  perform pg_advisory_xact_lock(hashtextextended('qrguitar:deletion-operation:'||p_operation_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended('qrguitar:account-deletion:'||p_request_id::text,0));
  select * into job from public.account_deletion_fulfillments where request_id=p_request_id for update;
  if not found then raise exception using errcode='PD404',message='Deletion fulfillment was not found.';end if;
  terms_digest:=encode(sha256(convert_to(job.subject_token::text||':'||array_to_string(normalized_terms,E'\n'),'UTF8')),'hex');
  select * into receipt from public.account_deletion_fulfillment_receipts where operation_id=p_operation_id;
  if found then
    if receipt.request_id<>p_request_id or receipt.action<>'profile_redact'
      or receipt.result->>'guitarId'<>p_guitar_id::text
      or receipt.result->>'beforeFingerprint'<>p_expected_fingerprint
      or receipt.result->>'termsDigest'<>terms_digest then
      raise exception using errcode='PD409',message='This operation UUID belongs to another deletion action.';end if;
    return jsonb_build_object('ok',true,'redaction',receipt.result,
      'profileReviews',public._account_deletion_profile_reviews_json(p_request_id));
  end if;
  if exists(select 1 from public.account_deletion_profile_review_attestations where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_retention_attestations where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_storage_content_reviews where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_custody_evidence_reviews where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_review_page_receipts where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_storage_relocations where finalize_operation_id=p_operation_id or complete_operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_custody_release_receipts where operation_id=p_operation_id) then
    raise exception using errcode='PD409',message='This operation UUID belongs to another deletion action.';end if;
  if job.state<>'blocked' then raise exception using errcode='PD409',message='Profile redaction is closed after storage quiescence begins.';end if;
  perform pg_advisory_xact_lock(hashtextextended('qrguitar:profile-graph:'||p_guitar_id::text,0));
  perform 1 from public.account_deletion_profile_review_scopes where request_id=p_request_id and guitar_id=p_guitar_id;
  if not found then raise exception using errcode='PD404',message='This Profile is not in the deletion review scope.';end if;
  actual:=public._account_deletion_profile_fingerprint(p_request_id,p_guitar_id);
  if encode(actual,'hex')<>p_expected_fingerprint then
    raise exception using errcode='PD412',message='Profile content changed; inspect the latest review before redacting it.';end if;
  if exists(select 1 from public.ownership_transfers where guitar_id=p_guitar_id and status in ('draft','sent'))
    or exists(select 1 from public.ownership_claims where guitar_id=p_guitar_id and status in ('awaiting_claimant','awaiting_owner','admin_review'))
    or exists(select 1 from public.service_submissions where guitar_id=p_guitar_id and status in ('draft','submitted','changes_requested')) then
    raise exception using errcode='PD409',message='Resolve active ownership and service workflows before redacting retained content.';end if;
  if exists(select 1 from public.guitar_media x where x.guitar_id=p_guitar_id
      and public._account_deletion_redact_terms(x.storage_path,normalized_terms) is distinct from x.storage_path)
    or exists(select 1 from public.guitar_documents x where x.guitar_id=p_guitar_id
      and public._account_deletion_redact_terms(x.storage_path,normalized_terms) is distinct from x.storage_path)
    or exists(select 1 from public.ownership_claim_evidence x join public.ownership_claims c on c.id=x.claim_id
      where c.guitar_id=p_guitar_id and public._account_deletion_redact_terms(x.storage_path,normalized_terms) is distinct from x.storage_path)
    or exists(select 1 from public.service_submission_evidence x join public.service_submissions s on s.id=x.submission_id
      where s.guitar_id=p_guitar_id and public._account_deletion_redact_terms(x.storage_path,normalized_terms) is distinct from x.storage_path)
    or exists(select 1 from public.service_evidence_uploads x join public.service_submissions s on s.id=x.submission_id
      where s.guitar_id=p_guitar_id and public._account_deletion_redact_terms(x.storage_path,normalized_terms) is distinct from x.storage_path) then
    raise exception using errcode='PD428',message='A matching stored object must be moved or deleted through the reviewed Storage cleanup before text redaction.';end if;
  perform set_config('qrguitar.account_deletion_request',p_request_id::text,true);
  perform set_config('qrguitar.account_deletion_profile_redaction',p_request_id::text,true);
  update public.guitars g set
    name=public._account_deletion_redact_terms(g.name,normalized_terms),
    brand=public._account_deletion_redact_terms(g.brand,normalized_terms),
    model=public._account_deletion_redact_terms(g.model,normalized_terms),
    year=public._account_deletion_redact_terms(g.year,normalized_terms),
    serial_number=case when public._account_deletion_redact_terms(g.serial_number,normalized_terms) is distinct from g.serial_number
      then 'PRIVACY-'||substr(replace(g.id::text,'-',''),1,16) else g.serial_number end,
    builder=public._account_deletion_redact_terms(g.builder,normalized_terms),
    location=public._account_deletion_redact_terms(g.location,normalized_terms),
    summary=public._account_deletion_redact_terms(g.summary,normalized_terms),
    hero_image_path=case when public._account_deletion_redact_terms(g.hero_image_path,normalized_terms) is distinct from g.hero_image_path then null else g.hero_image_path end,
    safety_note=public._account_deletion_redact_terms(g.safety_note,normalized_terms),
    public_safety_note=public._account_deletion_redact_terms(g.public_safety_note,normalized_terms),
    owner_removed_reason=public._account_deletion_redact_terms(g.owner_removed_reason,normalized_terms),
    admin_archive_reason=public._account_deletion_redact_terms(g.admin_archive_reason,normalized_terms)
    where g.id=p_guitar_id;
  update public.guitar_specs x set label=public._account_deletion_redact_terms(x.label,normalized_terms),
    value=public._account_deletion_redact_terms(x.value,normalized_terms) where x.guitar_id=p_guitar_id;
  update public.guitar_media x set
    alt=public._account_deletion_redact_terms(x.alt,normalized_terms) where x.guitar_id=p_guitar_id;
  update public.guitar_documents x set
    name=public._account_deletion_redact_terms(x.name,normalized_terms),
    document_type=public._account_deletion_redact_terms(x.document_type,normalized_terms),
    file_name=public._account_deletion_redact_terms(x.file_name,normalized_terms),
    public_description=public._account_deletion_redact_terms(x.public_description,normalized_terms),
    private_notes=public._account_deletion_redact_terms(x.private_notes,normalized_terms),
    category=public._account_deletion_redact_terms(x.category,normalized_terms),
    issuer_source=public._account_deletion_redact_terms(x.issuer_source,normalized_terms),
    description=public._account_deletion_redact_terms(x.description,normalized_terms) where x.guitar_id=p_guitar_id;
  update public.guitar_external_media x set
    canonical_url=case when public._account_deletion_redact_terms(x.canonical_url,normalized_terms) is distinct from x.canonical_url then 'https://privacy.invalid/review/'||x.id::text else x.canonical_url end,
    provider_id=public._account_deletion_redact_terms(x.provider_id,normalized_terms),
    title=public._account_deletion_redact_terms(x.title,normalized_terms),caption=public._account_deletion_redact_terms(x.caption,normalized_terms),
    thumbnail_url=case when public._account_deletion_redact_terms(x.thumbnail_url,normalized_terms) is distinct from x.thumbnail_url then null else x.thumbnail_url end
    where x.guitar_id=p_guitar_id;
  update public.guitar_serial_aliases x set
    serial_normalized=case when public._account_deletion_redact_terms(x.serial_normalized,normalized_terms) is distinct from x.serial_normalized
      then 'PRIVACY'||upper(substr(replace(x.id::text,'-',''),1,16)) else x.serial_normalized end,
    serial_display=public._account_deletion_redact_terms(x.serial_display,normalized_terms)
    where x.guitar_id=p_guitar_id;
  update public.guitar_timeline_events x set
    title=public._account_deletion_redact_terms(x.title,normalized_terms),description=public._account_deletion_redact_terms(x.description,normalized_terms),
    private_notes=public._account_deletion_redact_terms(x.private_notes,normalized_terms),shop_name=public._account_deletion_redact_terms(x.shop_name,normalized_terms),
    location=public._account_deletion_redact_terms(x.location,normalized_terms),provider_display_name=public._account_deletion_redact_terms(x.provider_display_name,normalized_terms),
    work_order_reference=public._account_deletion_redact_terms(x.work_order_reference,normalized_terms),parts_installed=public._account_deletion_redact_terms(x.parts_installed,normalized_terms),
    setup_measurements=public._account_deletion_redact_terms(x.setup_measurements,normalized_terms),who_performed=public._account_deletion_redact_terms(x.who_performed,normalized_terms)
    where x.guitar_id=p_guitar_id;
  update public.ownership_transfers x set to_name=public._account_deletion_redact_terms(x.to_name,normalized_terms),
    to_email=case when public._account_deletion_redact_terms(x.to_email,normalized_terms) is distinct from x.to_email then 'privacy+'||x.id::text||'@privacy.invalid' else x.to_email end,
    fee_waived_reason=public._account_deletion_redact_terms(x.fee_waived_reason,normalized_terms) where x.guitar_id=p_guitar_id;
  update public.ownership_claims x set
    recipient_email_normalized=case when public._account_deletion_redact_terms(x.recipient_email_normalized,normalized_terms) is distinct from x.recipient_email_normalized then null else x.recipient_email_normalized end,
    acquisition_details=public._account_deletion_redact_terms(x.acquisition_details,normalized_terms),
    ownership_declaration=public._account_deletion_redact_terms(x.ownership_declaration,normalized_terms),
    owner_response_note=public._account_deletion_redact_terms(x.owner_response_note,normalized_terms),
    admin_review_note=public._account_deletion_redact_terms(x.admin_review_note,normalized_terms) where x.guitar_id=p_guitar_id;
  update public.ownership_claim_evidence x set
    evidence_type=public._account_deletion_redact_terms(x.evidence_type,normalized_terms),
    file_name=public._account_deletion_redact_terms(x.file_name,normalized_terms),
    private_note=public._account_deletion_redact_terms(x.private_note,normalized_terms)
    from public.ownership_claims c where c.id=x.claim_id and c.guitar_id=p_guitar_id;
  update public.ownership_claim_events x set note=public._account_deletion_redact_terms(x.note,normalized_terms),
    metadata=public._account_deletion_redact_terms_jsonb(x.metadata,normalized_terms,job.subject_token)
    from public.ownership_claims c where c.id=x.claim_id and c.guitar_id=p_guitar_id;
  update public.service_submissions x set
    service_type=public._account_deletion_redact_terms(x.service_type,normalized_terms),title=public._account_deletion_redact_terms(x.title,normalized_terms),
    work_performed=public._account_deletion_redact_terms(x.work_performed,normalized_terms),parts_installed=public._account_deletion_redact_terms(x.parts_installed,normalized_terms),
    setup_measurements=public._account_deletion_redact_terms(x.setup_measurements,normalized_terms),work_order_reference=public._account_deletion_redact_terms(x.work_order_reference,normalized_terms),
    recommended_public_description=public._account_deletion_redact_terms(x.recommended_public_description,normalized_terms),
    private_provider_note=public._account_deletion_redact_terms(x.private_provider_note,normalized_terms),
    owner_review_note=public._account_deletion_redact_terms(x.owner_review_note,normalized_terms),
    email_delivery_message=public._account_deletion_redact_terms(x.email_delivery_message,normalized_terms) where x.guitar_id=p_guitar_id;
  update public.service_submission_evidence x set
    evidence_type=public._account_deletion_redact_terms(x.evidence_type,normalized_terms),
    file_name=public._account_deletion_redact_terms(x.file_name,normalized_terms),
    storage_path=x.storage_path
    from public.service_submissions s where s.id=x.submission_id and s.guitar_id=p_guitar_id;
  update public.service_submission_activity x set note=public._account_deletion_redact_terms(x.note,normalized_terms),
    metadata=public._account_deletion_redact_terms_jsonb(x.metadata,normalized_terms,job.subject_token)
    from public.service_submissions s where s.id=x.submission_id and s.guitar_id=p_guitar_id;
  update public.service_submission_notifications x set message=public._account_deletion_redact_terms(x.message,normalized_terms)
    from public.service_submissions s where s.id=x.submission_id and s.guitar_id=p_guitar_id;
  update public.service_evidence_uploads x set
    file_name=case when public._account_deletion_redact_terms(x.file_name,normalized_terms) is distinct from x.file_name
      then 'privacy-removed-'||substr(replace(x.upload_id::text,'-',''),1,16)||'.bin' else x.file_name end,
    evidence_result=public._account_deletion_redact_terms_jsonb(x.evidence_result,normalized_terms,job.subject_token)
    from public.service_submissions s where s.id=x.submission_id and s.guitar_id=p_guitar_id;
  update public.site_content x set content_value=public._account_deletion_redact_terms_jsonb(x.content_value,normalized_terms,job.subject_token)
    from public.guitars g where g.id=p_guitar_id and (x.content_key='record_trust:'||g.qr_code
      or x.content_value->>'guitarId'=g.id::text or x.content_value->>'qrCode'=g.qr_code);
  perform set_config('qrguitar.account_deletion_profile_redaction','',true);
  perform set_config('qrguitar.account_deletion_request','',true);
  after_value:=public._account_deletion_profile_fingerprint(p_request_id,p_guitar_id);
  if after_value=actual then raise exception using errcode='PD409',message='None of those personal-information terms occur in this reviewed Profile.';end if;
  result:=jsonb_build_object('guitarId',p_guitar_id,'policyVersion',1,'beforeFingerprint',p_expected_fingerprint,
    'afterFingerprint',encode(after_value,'hex'),'termCount',cardinality(normalized_terms),
    'termsDigest',terms_digest);
  insert into public.account_deletion_fulfillment_receipts(operation_id,request_id,action,result)
    values(p_operation_id,p_request_id,'profile_redact',result);
  return jsonb_build_object('ok',true,'redaction',result,
    'profileReviews',public._account_deletion_profile_reviews_json(p_request_id));
end $$;

create function public.attest_account_deletion_profile_review(
  p_admin_id uuid,p_environment_admin boolean,p_request_id uuid,p_operation_id uuid,p_guitar_id uuid,
  p_expected_fingerprint text,p_confirm_personal_information_removed boolean
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare job public.account_deletion_fulfillments; existing public.account_deletion_profile_review_attestations;
  actual bytea; result jsonb;
begin
  if p_request_id is null or p_operation_id is null or p_guitar_id is null
    or coalesce(p_expected_fingerprint,'') !~ '^[a-f0-9]{64}$' or p_confirm_personal_information_removed is distinct from true then
    raise exception using errcode='22023',message='An exact Profile fingerprint and explicit privacy confirmation are required.';
  end if;
  perform public._account_deletion_admin(p_admin_id,p_environment_admin);
  perform pg_advisory_xact_lock(hashtextextended('qrguitar:deletion-operation:'||p_operation_id::text,0));
  select * into existing from public.account_deletion_profile_review_attestations where operation_id=p_operation_id;
  if found then
    if existing.request_id<>p_request_id or existing.guitar_id<>p_guitar_id
      or encode(existing.content_fingerprint,'hex')<>p_expected_fingerprint then
      raise exception using errcode='PD409',message='This operation UUID belongs to another privacy review.';end if;
    return jsonb_build_object('ok',true,'review',existing.result,'profileReviews',public._account_deletion_profile_reviews_json(p_request_id));
  end if;
  if exists(select 1 from public.account_deletion_retention_attestations where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_fulfillment_receipts where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_custody_release_receipts where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_storage_content_reviews where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_custody_evidence_reviews where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_review_page_receipts where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_storage_relocations where finalize_operation_id=p_operation_id or complete_operation_id=p_operation_id) then
    raise exception using errcode='PD409',message='This operation UUID belongs to another deletion action.';end if;
  perform pg_advisory_xact_lock(hashtextextended('qrguitar:account-deletion:'||p_request_id::text,0));
  select * into job from public.account_deletion_fulfillments where request_id=p_request_id for update;
  if not found then raise exception using errcode='PD404',message='Deletion fulfillment was not found.';end if;
  if job.state<>'blocked' then raise exception using errcode='PD409',message='Profile review is closed after storage quiescence begins.';end if;
  perform pg_advisory_xact_lock(hashtextextended('qrguitar:profile-graph:'||p_guitar_id::text,0));
  if not exists(select 1 from public.account_deletion_profile_review_scopes where request_id=p_request_id and guitar_id=p_guitar_id) then
    raise exception using errcode='PD404',message='This Profile is not in the deletion review scope.';end if;
  actual:=public._account_deletion_profile_fingerprint(p_request_id,p_guitar_id);
  if encode(actual,'hex')<>p_expected_fingerprint then raise exception using errcode='PD412',message='Profile content changed; review the latest fingerprint.';end if;
  if not exists(select 1 from public.account_deletion_review_page_receipts r where r.request_id=p_request_id and r.kind='profile'
      and r.scope_key=p_guitar_id::text and r.content_fingerprint=actual group by r.page_count having count(distinct r.page_index)=r.page_count) then
    raise exception using errcode='PD428',message='Every current Profile review page must be inspected before confirmation.';end if;
  result:=jsonb_build_object('approved',true,'guitarId',p_guitar_id,'policyVersion',1,'contentFingerprint',p_expected_fingerprint);
  insert into public.account_deletion_profile_review_attestations(operation_id,request_id,guitar_id,content_fingerprint,reviewed_by,result)
    values(p_operation_id,p_request_id,p_guitar_id,actual,p_admin_id,result);
  return jsonb_build_object('ok',true,'review',result,'profileReviews',public._account_deletion_profile_reviews_json(p_request_id));
end $$;

create function public.attest_account_deletion_retention_review(
  p_admin_id uuid,p_environment_admin boolean,p_request_id uuid,p_operation_id uuid,p_domain text,
  p_expected_fingerprint text,p_decision_code text,p_confirm_reviewed boolean
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare job public.account_deletion_fulfillments; existing public.account_deletion_retention_attestations;
  actual bytea; graph jsonb; expected_decision text; result jsonb;
begin
  expected_decision:=case p_domain when 'billing' then 'lawful_financial_retention_reviewed'
    when 'service' then 'service_history_privacy_reviewed' end;
  if p_request_id is null or p_operation_id is null or expected_decision is null or p_decision_code is distinct from expected_decision
    or coalesce(p_expected_fingerprint,'') !~ '^[a-f0-9]{64}$' or p_confirm_reviewed is distinct from true then
    raise exception using errcode='22023',message='An exact retention fingerprint, reviewed decision, and confirmation are required.';
  end if;
  perform public._account_deletion_admin(p_admin_id,p_environment_admin);
  perform pg_advisory_xact_lock(hashtextextended('qrguitar:deletion-operation:'||p_operation_id::text,0));
  select * into existing from public.account_deletion_retention_attestations where operation_id=p_operation_id;
  if found then
    if existing.request_id<>p_request_id or existing.domain<>p_domain or existing.decision_code<>p_decision_code
      or encode(existing.content_fingerprint,'hex')<>p_expected_fingerprint then
      raise exception using errcode='PD409',message='This operation UUID belongs to another retention review.';end if;
    return jsonb_build_object('ok',true,'review',existing.result,'retentionReviews',public._account_deletion_retention_reviews_json(p_request_id));
  end if;
  if exists(select 1 from public.account_deletion_profile_review_attestations where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_fulfillment_receipts where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_custody_release_receipts where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_storage_content_reviews where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_custody_evidence_reviews where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_review_page_receipts where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_storage_relocations where finalize_operation_id=p_operation_id or complete_operation_id=p_operation_id) then
    raise exception using errcode='PD409',message='This operation UUID belongs to another deletion action.';end if;
  perform pg_advisory_xact_lock(hashtextextended('qrguitar:account-deletion:'||p_request_id::text,0));
  select * into job from public.account_deletion_fulfillments where request_id=p_request_id for update;
  if not found then raise exception using errcode='PD404',message='Deletion fulfillment was not found.';end if;
  if job.state<>'blocked' then raise exception using errcode='PD409',message='Retention review is closed after storage quiescence begins.';end if;
  if job.actor_id is null then raise exception using errcode='PD409',message='The deletion subject is unavailable.';end if;
  perform pg_advisory_xact_lock(hashtextextended('qrguitar:account-deletion-retention:'||p_request_id::text||':'||p_domain,0));
  if p_domain='billing' then perform pg_advisory_xact_lock(hashtextextended('qrguitar:billing-ledger',0));end if;
  graph:=case when p_domain='billing' then public._account_deletion_billing_graph(job.actor_id,null)
    else public._account_deletion_service_graph(job.actor_id,null) end;
  if not public._account_deletion_graph_has_rows(graph) then raise exception using errcode='PD409',message='This retention review is not required.';end if;
  actual:=sha256(convert_to(graph::text,'UTF8'));
  if not exists(select 1 from public.account_deletion_review_page_receipts r where r.request_id=p_request_id and r.kind='retention'
      and r.scope_key=p_domain and r.content_fingerprint=actual group by r.page_count having count(distinct r.page_index)=r.page_count) then
    raise exception using errcode='PD428',message='Every current retention review page must be inspected before confirmation.';end if;
  if encode(actual,'hex')<>p_expected_fingerprint then raise exception using errcode='PD412',message='Retained records changed; review the latest fingerprint.';end if;
  result:=jsonb_build_object('approved',true,'domain',p_domain,'decisionCode',p_decision_code,
    'policyVersion',1,'contentFingerprint',p_expected_fingerprint);
  insert into public.account_deletion_retention_attestations(operation_id,request_id,domain,content_fingerprint,decision_code,reviewed_by,result)
    values(p_operation_id,p_request_id,p_domain,actual,p_decision_code,p_admin_id,result);
  return jsonb_build_object('ok',true,'review',result,'retentionReviews',public._account_deletion_retention_reviews_json(p_request_id));
end $$;

-- Server-only descriptor used by the authenticated byte-inspection endpoint.
-- Raw Storage paths never appear in browser fulfillment JSON.
create function public.read_account_deletion_storage_review_source(
  p_admin_id uuid,p_environment_admin boolean,p_request_id uuid,p_relocation_id uuid,p_expected_fingerprint text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,storage as $$
declare job public.account_deletion_fulfillments; relocation public.account_deletion_storage_relocations;
begin
  if p_request_id is null or p_relocation_id is null or coalesce(p_expected_fingerprint,'')!~'^[a-f0-9]{64}$' then
    raise exception using errcode='22023',message='An exact Storage review fingerprint is required.';end if;
  perform public._account_deletion_admin(p_admin_id,p_environment_admin);
  perform pg_advisory_xact_lock(hashtextextended('qrguitar:account-deletion:'||p_request_id::text,0));
  select * into job from public.account_deletion_fulfillments where request_id=p_request_id for update;
  if not found then raise exception using errcode='PD404',message='Deletion fulfillment was not found.';end if;
  if job.state<>'blocked' then raise exception using errcode='PD409',message='Storage review is closed after quiescence begins.';end if;
  if job.actor_id is not null then perform pg_advisory_xact_lock(hashtextextended('qrguitar:privacy-request:'||job.actor_id::text,0));end if;
  select * into relocation from public.account_deletion_storage_relocations
    where request_id=p_request_id and relocation_id=p_relocation_id for update;
  if not found or relocation.state<>'planned' or relocation.disposition<>'retain' then
    raise exception using errcode='PD409',message='This retained file is not awaiting content review.';end if;
  perform 1 from storage.objects where bucket_id=relocation.bucket_id and name=relocation.source_path for share;
  if not found or public._account_deletion_storage_object_fingerprint(relocation.bucket_id,relocation.source_path,job.subject_token)<>relocation.source_fingerprint
    or encode(relocation.source_fingerprint,'hex')<>p_expected_fingerprint then
    raise exception using errcode='PD412',message='The private file changed; prepare and inspect it again.';end if;
  return jsonb_build_object('ok',true,'source',jsonb_build_object(
    'relocationId',relocation.relocation_id,'bucket',relocation.bucket_id,'sourcePath',relocation.source_path,
    'sourceFingerprint',encode(relocation.source_fingerprint,'hex'),'sourceSize',relocation.source_size,
    'sourceMimeType',relocation.source_mime_type));
end $$;

create function public.attest_account_deletion_storage_content(
  p_admin_id uuid,p_environment_admin boolean,p_request_id uuid,p_operation_id uuid,p_relocation_id uuid,
  p_expected_fingerprint text,p_byte_sha256 text,p_byte_size bigint,p_mime_type text,p_decision text,p_confirm_reviewed boolean
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,storage as $$
declare job public.account_deletion_fulfillments; relocation public.account_deletion_storage_relocations;
  existing public.account_deletion_storage_content_reviews; result jsonb; allowed_mime boolean;
begin
  allowed_mime:=case p_mime_type
    when 'image/jpeg' then true when 'image/png' then true when 'image/webp' then true
    when 'application/pdf' then true else false end;
  if p_request_id is null or p_operation_id is null or p_relocation_id is null
    or coalesce(p_expected_fingerprint,'')!~'^[a-f0-9]{64}$'
    or coalesce(p_byte_sha256,'')!~'^[a-f0-9]{64}$' or p_byte_size is null or p_byte_size<0
    or not allowed_mime or p_decision not in ('retain','delete') or p_confirm_reviewed is distinct from true then
    raise exception using errcode='22023',message='Exact inspected bytes, a privacy decision, and explicit confirmation are required.';end if;
  perform public._account_deletion_admin(p_admin_id,p_environment_admin);
  perform pg_advisory_xact_lock(hashtextextended('qrguitar:deletion-operation:'||p_operation_id::text,0));
  select * into existing from public.account_deletion_storage_content_reviews where operation_id=p_operation_id;
  if found then
    if existing.request_id<>p_request_id or existing.relocation_id<>p_relocation_id
      or encode(existing.source_fingerprint,'hex')<>p_expected_fingerprint
      or encode(existing.byte_sha256,'hex')<>p_byte_sha256 or existing.byte_size<>p_byte_size
      or existing.mime_type<>p_mime_type or existing.decision<>p_decision then
      raise exception using errcode='PD409',message='This operation UUID belongs to another Storage content review.';end if;
    return jsonb_build_object('ok',true,'review',existing.result,
      'storageReviews',public._account_deletion_storage_reviews_json(p_request_id));
  end if;
  if exists(select 1 from public.account_deletion_fulfillment_receipts where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_profile_review_attestations where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_retention_attestations where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_custody_release_receipts where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_custody_evidence_reviews where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_review_page_receipts where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_storage_relocations
      where finalize_operation_id=p_operation_id or complete_operation_id=p_operation_id) then
    raise exception using errcode='PD409',message='This operation UUID belongs to another deletion action.';end if;
  perform pg_advisory_xact_lock(hashtextextended('qrguitar:account-deletion:'||p_request_id::text,0));
  select * into job from public.account_deletion_fulfillments where request_id=p_request_id for update;
  if not found then raise exception using errcode='PD404',message='Deletion fulfillment was not found.';end if;
  if job.state<>'blocked' or job.actor_id is null then raise exception using errcode='PD409',message='Storage content review is closed.';end if;
  perform pg_advisory_xact_lock(hashtextextended('qrguitar:privacy-request:'||job.actor_id::text,0));
  select * into relocation from public.account_deletion_storage_relocations
    where request_id=p_request_id and relocation_id=p_relocation_id for update;
  if not found or relocation.state<>'planned' or relocation.disposition<>'retain'
    or encode(relocation.source_fingerprint,'hex')<>p_expected_fingerprint then
    raise exception using errcode='PD412',message='The private file changed; prepare and inspect it again.';end if;
  perform 1 from storage.objects where bucket_id=relocation.bucket_id and name=relocation.source_path for update;
  if not found or public._account_deletion_storage_object_fingerprint(relocation.bucket_id,relocation.source_path,job.subject_token)<>relocation.source_fingerprint
    or (relocation.source_size is not null and relocation.source_size<>p_byte_size)
    or relocation.source_mime_type is distinct from p_mime_type then
    raise exception using errcode='PD412',message='The private file changed; prepare and inspect it again.';end if;
  result:=jsonb_build_object('relocationId',p_relocation_id,'sourceFingerprint',p_expected_fingerprint,
    'byteSha256',p_byte_sha256,'byteSize',p_byte_size,'mimeType',p_mime_type,'decision',p_decision,
    'reviewedAt',clock_timestamp());
  insert into public.account_deletion_storage_content_reviews(
    operation_id,relocation_id,request_id,source_fingerprint,byte_sha256,byte_size,mime_type,decision,reviewed_by,result)
    values(p_operation_id,p_relocation_id,p_request_id,relocation.source_fingerprint,decode(p_byte_sha256,'hex'),
      p_byte_size,p_mime_type,p_decision,p_admin_id,result);
  if p_decision='delete' then
    perform set_config('qrguitar.account_deletion_storage_relocation',p_request_id::text,true);
    update public.account_deletion_storage_relocations set disposition='delete',destination_path=null
      where relocation_id=p_relocation_id;
    perform set_config('qrguitar.account_deletion_storage_relocation','',true);
  end if;
  return jsonb_build_object('ok',true,'review',result,
    'storageReviews',public._account_deletion_storage_reviews_json(p_request_id));
end $$;

create function public.authorize_account_deletion_storage_relocation(
  p_admin_id uuid,p_environment_admin boolean,p_request_id uuid,p_operation_id uuid,p_relocation_id uuid,
  p_byte_sha256 text default null,p_byte_size bigint default null,p_mime_type text default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,storage as $$
declare job public.account_deletion_fulfillments; relocation public.account_deletion_storage_relocations;
  content_review public.account_deletion_storage_content_reviews; preliminary_actor uuid;
begin
  if p_request_id is null or p_operation_id is null or p_relocation_id is null then
    raise exception using errcode='22023',message='Request, operation, and relocation UUIDs are required.';end if;
  perform public._account_deletion_admin(p_admin_id,p_environment_admin);
  perform pg_advisory_xact_lock(hashtextextended('qrguitar:deletion-operation:'||p_operation_id::text,0));
  if exists(select 1 from public.account_deletion_fulfillment_receipts where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_profile_review_attestations where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_retention_attestations where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_custody_release_receipts where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_storage_content_reviews where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_custody_evidence_reviews where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_review_page_receipts where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_storage_relocations
      where (finalize_operation_id=p_operation_id or complete_operation_id=p_operation_id) and relocation_id<>p_relocation_id) then
    raise exception using errcode='PD409',message='This operation UUID belongs to another deletion action.';end if;
  -- All fulfillment mutations acquire operation, request, actor privacy, then
  -- durable row locks in that order. Cancellation is replaced below with the
  -- same ordering so it cannot deadlock a Storage action.
  perform pg_advisory_xact_lock(hashtextextended('qrguitar:account-deletion:'||p_request_id::text,0));
  select actor_id into preliminary_actor from public.account_deletion_fulfillments where request_id=p_request_id;
  if preliminary_actor is null then raise exception using errcode='PD404',message='Deletion fulfillment was not found.';end if;
  perform pg_advisory_xact_lock(hashtextextended('qrguitar:privacy-request:'||preliminary_actor::text,0));
  select * into job from public.account_deletion_fulfillments where request_id=p_request_id for update;
  if not found or job.actor_id is distinct from preliminary_actor then raise exception using errcode='PD409',message='The deletion identity changed.';end if;
  select * into relocation from public.account_deletion_storage_relocations where request_id=p_request_id and relocation_id=p_relocation_id for update;
  if not found then raise exception using errcode='PD404',message='Storage relocation was not found.';end if;
  select * into content_review from public.account_deletion_storage_content_reviews where relocation_id=p_relocation_id;
  if relocation.disposition='retain' and (not found or content_review.decision<>'retain'
      or coalesce(p_byte_sha256,'')!~'^[a-f0-9]{64}$' or content_review.byte_sha256<>decode(p_byte_sha256,'hex')
      or p_byte_size is null or content_review.byte_size<>p_byte_size or content_review.mime_type is distinct from p_mime_type
      or content_review.source_fingerprint<>relocation.source_fingerprint) then
    raise exception using errcode='PD428',message='The exact retained bytes need administrator content review before copying.';end if;
  if relocation.disposition='delete' and (p_byte_sha256 is not null or p_byte_size is not null or p_mime_type is not null) then
    raise exception using errcode='22023',message='Delete cleanup does not accept a retained-byte proof.';end if;
  if relocation.state in ('copy_authorized','deletion_authorized','references_updated','completed') then
    if relocation.finalize_operation_id<>p_operation_id then raise exception using errcode='PD409',message='This Storage plan belongs to another operation.';end if;
    return jsonb_build_object('ok',true,'relocation',jsonb_build_object('relocationId',relocation.relocation_id,
      'disposition',relocation.disposition,'state',relocation.state));
  end if;
  if job.state<>'blocked' then raise exception using errcode='PD409',message='Storage planning is closed after quiescence begins.';end if;
  if relocation.disposition='delete' and (job.blockers ? 'active_ownership_transfer'
      or job.blockers ? 'active_ownership_claim' or job.blockers ? 'active_service_workflow') then
    raise exception using errcode='PD409',message='Resolve active ownership and service workflows before removing their private files.';end if;
  perform public._account_deletion_lock_profile_reviews(p_request_id);
  perform 1 from storage.objects where bucket_id=relocation.bucket_id and name=relocation.source_path for update;
  if not found or public._account_deletion_storage_object_fingerprint(relocation.bucket_id,relocation.source_path,job.subject_token)<>relocation.source_fingerprint
    or (not exists(select 1 from public.account_deletion_storage_content_reviews v where v.relocation_id=relocation.relocation_id and v.decision='delete')
      and public._account_deletion_storage_disposition(relocation.bucket_id,relocation.source_path)<>relocation.disposition) then
    raise exception using errcode='PD412',message='The Storage plan changed; prepare it again.';end if;
  perform set_config('qrguitar.account_deletion_storage_relocation',p_request_id::text,true);
  update public.account_deletion_storage_relocations set
    state=case disposition when 'retain' then 'copy_authorized' else 'deletion_authorized' end,
    finalize_operation_id=p_operation_id where relocation_id=p_relocation_id returning * into relocation;
  perform set_config('qrguitar.account_deletion_storage_relocation','',true);
  return jsonb_build_object('ok',true,'relocation',jsonb_build_object('relocationId',relocation.relocation_id,
    'disposition',relocation.disposition,'state',relocation.state));
end $$;

create function public.finalize_account_deletion_storage_relocation(
  p_admin_id uuid,p_environment_admin boolean,p_request_id uuid,p_operation_id uuid,p_relocation_id uuid,
  p_byte_sha256 text,p_copied_size bigint
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,storage as $$
declare job public.account_deletion_fulfillments; relocation public.account_deletion_storage_relocations;
  destination storage.objects; source storage.objects; preliminary_actor uuid;
  now_at timestamptz:=clock_timestamp(); answer jsonb;
begin
  if p_request_id is null or p_operation_id is null or p_relocation_id is null
    or coalesce(p_byte_sha256,'')!~'^[a-f0-9]{64}$' or p_copied_size is null or p_copied_size<0 then
    raise exception using errcode='22023',message='A valid Storage relocation proof is required.';
  end if;
  perform public._account_deletion_admin(p_admin_id,p_environment_admin);
  perform pg_advisory_xact_lock(hashtextextended('qrguitar:deletion-operation:'||p_operation_id::text,0));
  if exists(select 1 from public.account_deletion_fulfillment_receipts where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_profile_review_attestations where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_retention_attestations where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_custody_release_receipts where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_storage_content_reviews where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_custody_evidence_reviews where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_review_page_receipts where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_storage_relocations
      where complete_operation_id=p_operation_id or (finalize_operation_id=p_operation_id and relocation_id<>p_relocation_id)) then
    raise exception using errcode='PD409',message='This operation UUID belongs to another deletion action.';end if;
  perform pg_advisory_xact_lock(hashtextextended('qrguitar:account-deletion:'||p_request_id::text,0));
  select actor_id into preliminary_actor from public.account_deletion_fulfillments where request_id=p_request_id;
  if not found then raise exception using errcode='PD404',message='Deletion fulfillment was not found.';end if;
  if preliminary_actor is not null then
    perform pg_advisory_xact_lock(hashtextextended('qrguitar:privacy-request:'||preliminary_actor::text,0));
  end if;
  select * into job from public.account_deletion_fulfillments where request_id=p_request_id for update;
  if not found then raise exception using errcode='PD404',message='Deletion fulfillment was not found.';end if;
  if job.actor_id is distinct from preliminary_actor then raise exception using errcode='PD409',message='The deletion identity changed.';end if;
  select * into relocation from public.account_deletion_storage_relocations
    where relocation_id=p_relocation_id and request_id=p_request_id for update;
  if not found then raise exception using errcode='PD404',message='Storage relocation was not found.';end if;
  if relocation.state in ('references_updated','completed') then
    if relocation.finalize_operation_id<>p_operation_id or relocation.byte_sha256<>decode(p_byte_sha256,'hex') or relocation.copied_size<>p_copied_size then
      raise exception using errcode='PD409',message='Storage relocation proof does not match the durable receipt.';end if;
    return jsonb_build_object('ok',true,'relocation',jsonb_build_object('relocationId',relocation.relocation_id,
      'state',relocation.state,'byteSha256',encode(relocation.byte_sha256,'hex'),'copiedSize',relocation.copied_size));
  end if;
  if job.state<>'blocked' or job.actor_id is null or relocation.disposition<>'retain'
    or relocation.state<>'copy_authorized' or relocation.finalize_operation_id<>p_operation_id then
    raise exception using errcode='PD409',message='Storage relocation is closed after storage quiescence begins.';end if;
  if not exists(select 1 from public.account_deletion_storage_content_reviews v
      where v.relocation_id=relocation.relocation_id and v.request_id=p_request_id and v.decision='retain'
        and v.source_fingerprint=relocation.source_fingerprint and v.byte_sha256=decode(p_byte_sha256,'hex')
        and v.byte_size=p_copied_size and v.mime_type=relocation.source_mime_type) then
    raise exception using errcode='PD412',message='The copied bytes do not match the reviewed content.';end if;
  perform public._account_deletion_lock_profile_reviews(p_request_id);
  select * into source from storage.objects where bucket_id=relocation.bucket_id and name=relocation.source_path for update;
  if not found or public._account_deletion_storage_object_fingerprint(relocation.bucket_id,relocation.source_path,job.subject_token)<>relocation.source_fingerprint then
    raise exception using errcode='PD412',message='The source object changed after relocation was planned.';end if;
  select * into destination from storage.objects where bucket_id=relocation.bucket_id and name=relocation.destination_path for update;
  if not found then raise exception using errcode='PD428',message='The copied destination object is not available.';end if;
  if public._account_deletion_text_has_identity(concat_ws('|',destination.name,destination.metadata::text,
      (to_jsonb(destination)->'user_metadata')::text,to_jsonb(destination)->>'owner_id',to_jsonb(destination)->>'owner'),
      job.actor_id,lower(coalesce(job.target_email,'')))
    or coalesce(destination.metadata->>'size','')!~'^[0-9]{1,19}$'
    or (destination.metadata->>'size')::bigint<>p_copied_size
    or (relocation.source_size is not null and relocation.source_size<>p_copied_size)
    or lower(coalesce((to_jsonb(destination)->'user_metadata')->>'sha256',''))<>p_byte_sha256
    or coalesce((to_jsonb(destination)->'user_metadata')->>'accountDeletionRelocationId','')<>relocation.relocation_id::text then
    raise exception using errcode='PD412',message='The copied destination object failed privacy or integrity verification.';end if;
  perform set_config('qrguitar.account_deletion_request',p_request_id::text,true);
  perform set_config('qrguitar.account_deletion_storage_relocation',p_request_id::text,true);
  update public.guitars set hero_image_path=relocation.destination_path
    where relocation.bucket_id='instrument-media' and hero_image_path=relocation.source_path;
  update public.guitar_media set storage_path=relocation.destination_path
    where relocation.bucket_id='instrument-media' and storage_path=relocation.source_path;
  update public.guitar_documents set storage_path=relocation.destination_path
    where relocation.bucket_id='instrument-documents' and storage_path=relocation.source_path;
  update public.ownership_claim_evidence set storage_path=relocation.destination_path
    where relocation.bucket_id='instrument-documents' and storage_path=relocation.source_path;
  update public.service_submission_evidence set storage_path=relocation.destination_path
    where relocation.bucket_id='service-evidence' and storage_path=relocation.source_path;
  update public.service_evidence_uploads set storage_path=relocation.destination_path,
    evidence_result=case when evidence_result is null then null else
      public._account_deletion_replace_json_string(evidence_result,relocation.source_path,relocation.destination_path) end
    where relocation.bucket_id='service-evidence' and storage_path=relocation.source_path;
  update public.instrument_staged_uploads set storage_path=relocation.destination_path,updated_at=now_at
    where bucket_id=relocation.bucket_id and storage_path=relocation.source_path;
  update public.account_deletion_storage_relocations set state='references_updated',byte_sha256=decode(p_byte_sha256,'hex'),
    copied_size=p_copied_size,finalize_operation_id=p_operation_id,references_updated_at=now_at
    where relocation_id=p_relocation_id returning * into relocation;
  perform set_config('qrguitar.account_deletion_storage_relocation','',true);
  perform set_config('qrguitar.account_deletion_request','',true);
  answer:=jsonb_build_object('relocationId',relocation.relocation_id,'state',relocation.state,
    'byteSha256',encode(relocation.byte_sha256,'hex'),'copiedSize',relocation.copied_size);
  return jsonb_build_object('ok',true,'relocation',answer);
end $$;

create function public.complete_account_deletion_storage_relocation(
  p_admin_id uuid,p_environment_admin boolean,p_request_id uuid,p_operation_id uuid,p_relocation_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,storage as $$
declare job public.account_deletion_fulfillments; relocation public.account_deletion_storage_relocations;
  destination storage.objects; preliminary_actor uuid; answer jsonb; now_at timestamptz:=clock_timestamp();
begin
  if p_request_id is null or p_operation_id is null or p_relocation_id is null then
    raise exception using errcode='22023',message='Request, operation, and relocation UUIDs are required.';end if;
  perform public._account_deletion_admin(p_admin_id,p_environment_admin);
  perform pg_advisory_xact_lock(hashtextextended('qrguitar:deletion-operation:'||p_operation_id::text,0));
  if exists(select 1 from public.account_deletion_fulfillment_receipts where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_profile_review_attestations where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_retention_attestations where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_custody_release_receipts where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_storage_content_reviews where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_custody_evidence_reviews where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_review_page_receipts where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_storage_relocations
      where finalize_operation_id=p_operation_id or (complete_operation_id=p_operation_id and relocation_id<>p_relocation_id)) then
    raise exception using errcode='PD409',message='This operation UUID belongs to another deletion action.';end if;
  perform pg_advisory_xact_lock(hashtextextended('qrguitar:account-deletion:'||p_request_id::text,0));
  select actor_id into preliminary_actor from public.account_deletion_fulfillments where request_id=p_request_id;
  if not found then raise exception using errcode='PD404',message='Deletion fulfillment was not found.';end if;
  if preliminary_actor is not null then
    perform pg_advisory_xact_lock(hashtextextended('qrguitar:privacy-request:'||preliminary_actor::text,0));
  end if;
  select * into job from public.account_deletion_fulfillments where request_id=p_request_id for update;
  if not found then raise exception using errcode='PD404',message='Deletion fulfillment was not found.';end if;
  if job.actor_id is distinct from preliminary_actor then raise exception using errcode='PD409',message='The deletion identity changed.';end if;
  select * into relocation from public.account_deletion_storage_relocations
    where relocation_id=p_relocation_id and request_id=p_request_id for update;
  if not found then raise exception using errcode='PD404',message='Storage relocation was not found.';end if;
  if relocation.state='completed' then
    if relocation.complete_operation_id<>p_operation_id then
      raise exception using errcode='PD409',message='This completed Storage relocation belongs to another operation.';end if;
    return jsonb_build_object('ok',true,'relocation',jsonb_build_object('relocationId',relocation.relocation_id,
      'disposition',relocation.disposition,'state','completed',
      'byteSha256',case when relocation.byte_sha256 is null then null else encode(relocation.byte_sha256,'hex') end,
      'copiedSize',relocation.copied_size));
  end if;
  if job.state<>'blocked' or job.actor_id is null or not (
      (relocation.disposition='retain' and relocation.state='references_updated')
      or (relocation.disposition='delete' and relocation.state='deletion_authorized')) then
    raise exception using errcode='PD409',message='Storage relocation is not ready to complete.';end if;
  if exists(select 1 from storage.objects where bucket_id=relocation.bucket_id and name=relocation.source_path) then
    raise exception using errcode='PD428',message='The source object has not been removed.';end if;
  if relocation.disposition='delete' then
    -- Delete only the attachment/reference whose reviewed bytes were removed;
    -- structured Profile, claim, and service facts remain. Service upload
    -- tombstones are created by the existing evidence-delete trigger.
    perform set_config('qrguitar.account_deletion_request',p_request_id::text,true);
    perform set_config('qrguitar.account_deletion_storage_relocation',p_request_id::text,true);
    update public.guitars set hero_image_path=null where hero_image_path=relocation.source_path;
    delete from public.guitar_media where relocation.bucket_id='instrument-media' and storage_path=relocation.source_path;
    delete from public.guitar_documents where relocation.bucket_id='instrument-documents' and storage_path=relocation.source_path;
    update public.ownership_claim_evidence set storage_path='privacy-removed/'||relocation.relocation_id::text,
      file_name='private-proof-removed.bin',private_note='Private proof bytes removed during reviewed account deletion.'
      where relocation.bucket_id='instrument-documents' and storage_path=relocation.source_path;
    delete from public.service_submission_evidence where relocation.bucket_id='service-evidence' and storage_path=relocation.source_path;
    delete from public.instrument_staged_uploads where bucket_id=relocation.bucket_id and storage_path=relocation.source_path;
    perform set_config('qrguitar.account_deletion_storage_relocation','',true);
    perform set_config('qrguitar.account_deletion_request','',true);
  end if;
  if relocation.disposition='retain' then
    select * into destination from storage.objects where bucket_id=relocation.bucket_id and name=relocation.destination_path for update;
    if not found or coalesce(destination.metadata->>'size','')!~'^[0-9]{1,19}$'
      or (destination.metadata->>'size')::bigint<>relocation.copied_size
      or lower(coalesce((to_jsonb(destination)->'user_metadata')->>'sha256',''))<>encode(relocation.byte_sha256,'hex')
      or coalesce((to_jsonb(destination)->'user_metadata')->>'accountDeletionRelocationId','')<>relocation.relocation_id::text
      or public._account_deletion_text_has_identity(concat_ws('|',destination.name,destination.metadata::text,
        (to_jsonb(destination)->'user_metadata')::text,to_jsonb(destination)->>'owner_id',to_jsonb(destination)->>'owner'),
        job.actor_id,lower(coalesce(job.target_email,''))) then
      raise exception using errcode='PD412',message='The retained destination object failed final verification.';end if;
  end if;
  perform set_config('qrguitar.account_deletion_storage_relocation',p_request_id::text,true);
  update public.account_deletion_storage_relocations set state='completed',
    source_path='removed/'||relocation_id::text,
    complete_operation_id=p_operation_id,completed_at=now_at
    where relocation_id=p_relocation_id returning * into relocation;
  perform set_config('qrguitar.account_deletion_storage_relocation','',true);
  answer:=jsonb_build_object('relocationId',relocation.relocation_id,'disposition',relocation.disposition,
    'state',relocation.state,
    'byteSha256',case when relocation.byte_sha256 is null then null else encode(relocation.byte_sha256,'hex') end,
    'copiedSize',relocation.copied_size);
  return jsonb_build_object('ok',true,'relocation',answer);
end $$;

create function public._account_deletion_migrate_billing_subject(p_request_id uuid,p_actor_id uuid,p_admin_id uuid) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_subject_id uuid; before_hash bytea; after_hash bytea; counts jsonb; before_graph jsonb;
begin
  perform 1 from public.account_deletion_fulfillments where request_id=p_request_id and actor_id=p_actor_id and state='quiescing_storage' for update;
  if not found then raise exception using errcode='PD409',message='Billing identity migration is unavailable.';end if;
  select b.subject_id into v_subject_id from public.account_deletion_billing_subjects b where b.request_id=p_request_id;
  if v_subject_id is not null and exists(select 1 from public.account_deletion_billing_subjects where request_id=p_request_id and after_fingerprint is not null) then return;end if;
  if v_subject_id is null then v_subject_id:=gen_random_uuid();end if;
  before_graph:=public._account_deletion_billing_graph(p_actor_id,null);
  if not public._account_deletion_graph_has_rows(before_graph) then return;end if;
  if not exists(select 1 from public.account_deletion_retention_attestations a where a.request_id=p_request_id and a.domain='billing'
    and a.content_fingerprint=sha256(convert_to(before_graph::text,'UTF8'))) then
    raise exception using errcode='PD412',message='The billing retention review is missing or stale.';
  end if;
  before_hash:=sha256(convert_to(public._account_deletion_strip_internal_identity(before_graph)::text,'UTF8'));
  select coalesce(jsonb_object_agg(e.key,jsonb_array_length(e.value) order by e.key),'{}'::jsonb) into counts from jsonb_each(before_graph) e;
  insert into public.account_deletion_billing_subjects(request_id,subject_id,before_fingerprint,row_counts,migrated_by)
    values(p_request_id,v_subject_id,before_hash,counts,p_admin_id) on conflict(request_id) do nothing;
  perform set_config('qrguitar.account_deletion_identity_migration',p_request_id::text,true);
  perform public._account_deletion_promo_migrate_billing_subject(p_request_id,p_actor_id,v_subject_id);
  update public.billing_customers set owner_id=v_subject_id,subject_id=v_subject_id where owner_id=p_actor_id;
  update public.billing_orders set owner_id=v_subject_id,subject_id=v_subject_id where owner_id=p_actor_id;
  update public.billing_receipts set owner_id=v_subject_id,subject_id=v_subject_id where owner_id=p_actor_id;
  update public.billing_credit_grants set owner_id=v_subject_id,subject_id=v_subject_id where owner_id=p_actor_id;
  update public.billing_credit_consumptions set owner_id=v_subject_id,subject_id=v_subject_id where owner_id=p_actor_id;
  update public.billing_credit_holds set owner_id=v_subject_id,subject_id=v_subject_id where owner_id=p_actor_id;
  update public.billing_review_decisions set
    owner_id=case when owner_id=p_actor_id then v_subject_id else owner_id end,
    subject_id=case when owner_id=p_actor_id then v_subject_id else subject_id end,
    operator_id=case when operator_id=p_actor_id then v_subject_id else operator_id end,
    operator_subject_id=case when operator_id=p_actor_id then v_subject_id else operator_subject_id end
    where owner_id=p_actor_id or operator_id=p_actor_id;
  update public.billing_direct_orders set owner_id=v_subject_id,subject_id=v_subject_id where owner_id=p_actor_id;
  update public.billing_direct_payments set operator_id=v_subject_id,operator_subject_id=v_subject_id where operator_id=p_actor_id;
  update public.billing_paypal_orders set owner_id=v_subject_id,subject_id=v_subject_id where owner_id=p_actor_id;
  update public.billing_paypal_webhook_admin_actions set operator_id=v_subject_id,operator_subject_id=v_subject_id where operator_id=p_actor_id;
  perform set_config('qrguitar.account_deletion_identity_migration','',true);
  after_hash:=sha256(convert_to(public._account_deletion_strip_internal_identity(
    public._account_deletion_billing_graph(p_actor_id,v_subject_id))::text,'UTF8'));
  if after_hash<>before_hash then raise exception using errcode='PD500',message='Billing facts changed during pseudonymization.';end if;
  update public.account_deletion_billing_subjects set after_fingerprint=after_hash where request_id=p_request_id and after_fingerprint is null;
  if public._account_deletion_identity_inventory_has_actor('billing',p_actor_id) then
    raise exception using errcode='PD500',message='Billing pseudonymization postconditions failed.';
  end if;
end $$;

create function public._account_deletion_migrate_service_subject(p_request_id uuid,p_actor_id uuid,p_admin_id uuid) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_subject_id uuid; before_hash bytea; after_hash bytea; counts jsonb; before_graph jsonb;
begin
  perform 1 from public.account_deletion_fulfillments where request_id=p_request_id and actor_id=p_actor_id and state='quiescing_storage' for update;
  if not found then raise exception using errcode='PD409',message='Service identity migration is unavailable.';end if;
  select s.subject_id into v_subject_id from public.account_deletion_service_subjects s where s.request_id=p_request_id;
  if v_subject_id is not null and exists(select 1 from public.account_deletion_service_subjects where request_id=p_request_id and after_fingerprint is not null) then return;end if;
  if v_subject_id is null then v_subject_id:=gen_random_uuid();end if;
  before_graph:=public._account_deletion_service_graph(p_actor_id,null);
  if not public._account_deletion_graph_has_rows(before_graph) then return;end if;
  if not exists(select 1 from public.account_deletion_retention_attestations a where a.request_id=p_request_id and a.domain='service'
    and a.content_fingerprint=sha256(convert_to(before_graph::text,'UTF8'))) then
    raise exception using errcode='PD412',message='The service-history privacy review is missing or stale.';
  end if;
  before_hash:=sha256(convert_to(public._account_deletion_strip_internal_identity(before_graph)::text,'UTF8'));
  select coalesce(jsonb_object_agg(e.key,jsonb_array_length(e.value) order by e.key),'{}'::jsonb) into counts from jsonb_each(before_graph) e;
  insert into public.account_deletion_service_subjects(request_id,subject_id,before_fingerprint,row_counts,migrated_by)
    values(p_request_id,v_subject_id,before_hash,counts,p_admin_id) on conflict(request_id) do nothing;
  perform set_config('qrguitar.account_deletion_identity_migration',p_request_id::text,true);
  delete from public.service_evidence_upload_scopes where actor_id=p_actor_id;
  delete from public.service_provider_profile_access where provider_user_id=p_actor_id or granted_by_user_id=p_actor_id;
  delete from public.service_provider_profiles where user_id=p_actor_id;
  update public.service_provider_profiles set verified_by=null,internal_review_note=null where verified_by=p_actor_id;
  delete from public.service_submission_notifications where recipient_user_id=p_actor_id or submission_id in (
    select id from public.service_submissions where provider_user_id=p_actor_id or owner_user_id=p_actor_id);
  delete from public.service_submission_tokens where submission_id in (
    select id from public.service_submissions where provider_user_id=p_actor_id or owner_user_id=p_actor_id);
  update public.service_submission_evidence e set storage_path=case when u.storage_path~'^account-deletion/' then u.storage_path
        else 'privacy-subject/'||v_subject_id::text||'/'||u.upload_id::text end,
      uploaded_by_user_id=case when e.uploaded_by_user_id=p_actor_id then null else e.uploaded_by_user_id end,
      uploaded_by_subject_id=case when e.uploaded_by_user_id=p_actor_id then v_subject_id else e.uploaded_by_subject_id end
    from public.service_evidence_uploads u where u.evidence_id=e.id and u.actor_id=p_actor_id and u.state in ('committed','deleted');
  update public.service_evidence_uploads set actor_id=null,actor_subject_id=v_subject_id,
    storage_path=case when storage_path~'^account-deletion/' then storage_path
      else 'privacy-subject/'||v_subject_id::text||'/'||upload_id::text end,
    evidence_result=case when evidence_result is null then null else replace(evidence_result::text,p_actor_id::text,v_subject_id::text)::jsonb end
    where actor_id=p_actor_id and state in ('committed','deleted','discarded');
  update public.service_evidence_upload_discard_receipts set actor_id=null,actor_subject_id=v_subject_id where actor_id=p_actor_id;
  update public.service_submissions set
    provider_user_id=case when provider_user_id=p_actor_id then null else provider_user_id end,
    provider_subject_id=case when provider_user_id=p_actor_id then v_subject_id else provider_subject_id end,
    owner_user_id=case when owner_user_id=p_actor_id then null else owner_user_id end,
    owner_subject_id=case when owner_user_id=p_actor_id then v_subject_id else owner_subject_id end
    where provider_user_id=p_actor_id or owner_user_id=p_actor_id;
  update public.service_submission_evidence set uploaded_by_user_id=null,uploaded_by_subject_id=v_subject_id,
    storage_path=replace(storage_path,p_actor_id::text,v_subject_id::text) where uploaded_by_user_id=p_actor_id;
  update public.service_submission_activity set actor_user_id=null,actor_subject_id=v_subject_id where actor_user_id=p_actor_id;
  update public.guitar_timeline_events set
    created_by_user_id=case when created_by_user_id=p_actor_id then null else created_by_user_id end,
    created_by_subject_id=case when created_by_user_id=p_actor_id then v_subject_id else created_by_subject_id end,
    provider_user_id=case when provider_user_id=p_actor_id then null else provider_user_id end,
    provider_subject_id=case when provider_user_id=p_actor_id then v_subject_id else provider_subject_id end,
    evidence_reviewed_by=case when evidence_reviewed_by=p_actor_id then null else evidence_reviewed_by end,
    evidence_reviewed_by_subject_id=case when evidence_reviewed_by=p_actor_id then v_subject_id else evidence_reviewed_by_subject_id end
    where created_by_user_id=p_actor_id or provider_user_id=p_actor_id or evidence_reviewed_by=p_actor_id;
  perform set_config('qrguitar.account_deletion_identity_migration','',true);
  after_hash:=sha256(convert_to(public._account_deletion_strip_internal_identity(
    public._account_deletion_service_graph(p_actor_id,v_subject_id))::text,'UTF8'));
  if after_hash<>before_hash then raise exception using errcode='PD500',message='Service facts changed during pseudonymization.';end if;
  update public.account_deletion_service_subjects set after_fingerprint=after_hash where request_id=p_request_id and after_fingerprint is null;
  if public._account_deletion_identity_inventory_has_actor('service',p_actor_id) then
    raise exception using errcode='PD500',message='Service pseudonymization postconditions failed.';
  end if;
end $$;

create function public._account_deletion_identity_inventory_has_actor(p_domain text,p_actor_id uuid) returns boolean
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare item record; found_value boolean;
begin
  for item in select table_name,actor_column from public.account_deletion_identity_inventory where domain=p_domain order by table_name,actor_column loop
    execute format('select exists(select 1 from public.%I where %I=$1)',item.table_name,item.actor_column) into found_value using p_actor_id;
    if found_value then return true;end if;
  end loop;
  return false;
end $$;

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

-- Remove provable identity strings from rows whose current actor links do not
-- place them in a normal Profile/retention review. Each table is capped per
-- prepare call; a remaining match stays as a blocker and the next replay
-- continues from the current committed state. Facts and rows remain intact.
create function public._account_deletion_scrub_unscoped_personal_content(
  p_request_id uuid,p_actor_id uuid,p_email text,p_salt uuid
) returns integer language plpgsql security definer set search_path=pg_catalog,public as $$
declare changed integer:=0; affected integer;
begin
  update public.profiles p set
    display_name=public._account_deletion_redact_identity(p.display_name,p_actor_id,p_email),
    admin_notes=public._account_deletion_redact_identity(p.admin_notes,p_actor_id,p_email),
    account_lock_reason=public._account_deletion_redact_identity(p.account_lock_reason,p_actor_id,p_email),
    account_ban_reason=public._account_deletion_redact_identity(p.account_ban_reason,p_actor_id,p_email)
  where p.id in (select q.id from public.profiles q where q.id<>p_actor_id and
    public._account_deletion_text_has_identity(concat_ws('|',q.display_name,q.admin_notes,q.account_lock_reason,q.account_ban_reason),p_actor_id,p_email)
    order by q.id limit 100);
  get diagnostics affected=row_count;changed:=changed+affected;

  update public.guitars g set
    name=public._account_deletion_redact_identity(g.name,p_actor_id,p_email),
    brand=public._account_deletion_redact_identity(g.brand,p_actor_id,p_email),
    model=public._account_deletion_redact_identity(g.model,p_actor_id,p_email),
    year=public._account_deletion_redact_identity(g.year,p_actor_id,p_email),
    serial_number=public._account_deletion_redact_identity(g.serial_number,p_actor_id,p_email),
    builder=public._account_deletion_redact_identity(g.builder,p_actor_id,p_email),
    location=public._account_deletion_redact_identity(g.location,p_actor_id,p_email),
    summary=public._account_deletion_redact_identity(g.summary,p_actor_id,p_email),
    safety_note=public._account_deletion_redact_identity(g.safety_note,p_actor_id,p_email),
    public_safety_note=public._account_deletion_redact_identity(g.public_safety_note,p_actor_id,p_email),
    owner_removed_reason=public._account_deletion_redact_identity(g.owner_removed_reason,p_actor_id,p_email),
    admin_archive_reason=public._account_deletion_redact_identity(g.admin_archive_reason,p_actor_id,p_email),
    updated_at=greatest(g.updated_at,clock_timestamp())
  where g.id in (select q.id from public.guitars q where q.owner_id is distinct from p_actor_id and
    public._account_deletion_text_has_identity(concat_ws('|',q.name,q.brand,q.model,q.year,q.serial_number,q.builder,q.location,q.summary,
      q.safety_note,q.public_safety_note,q.owner_removed_reason,q.admin_archive_reason),p_actor_id,p_email) order by q.id limit 100);
  get diagnostics affected=row_count;changed:=changed+affected;

  update public.guitar_specs s set label=public._account_deletion_redact_identity(s.label,p_actor_id,p_email),
    value=public._account_deletion_redact_identity(s.value,p_actor_id,p_email)
  where s.id in (select q.id from public.guitar_specs q join public.guitars g on g.id=q.guitar_id
    where g.owner_id is distinct from p_actor_id and public._account_deletion_text_has_identity(concat_ws('|',q.label,q.value),p_actor_id,p_email)
    order by q.id limit 100);
  get diagnostics affected=row_count;changed:=changed+affected;

  update public.guitar_media m set alt=public._account_deletion_redact_identity(m.alt,p_actor_id,p_email)
  where m.id in (select q.id from public.guitar_media q join public.guitars g on g.id=q.guitar_id
    where g.owner_id is distinct from p_actor_id and public._account_deletion_text_has_identity(q.alt,p_actor_id,p_email) order by q.id limit 100);
  get diagnostics affected=row_count;changed:=changed+affected;

  update public.guitar_documents d set
    name=public._account_deletion_redact_identity(d.name,p_actor_id,p_email),
    file_name=public._account_deletion_redact_identity(d.file_name,p_actor_id,p_email),
    public_description=public._account_deletion_redact_identity(d.public_description,p_actor_id,p_email),
    private_notes=public._account_deletion_redact_identity(d.private_notes,p_actor_id,p_email),
    category=public._account_deletion_redact_identity(d.category,p_actor_id,p_email),
    issuer_source=public._account_deletion_redact_identity(d.issuer_source,p_actor_id,p_email),
    description=public._account_deletion_redact_identity(d.description,p_actor_id,p_email)
  where d.id in (select q.id from public.guitar_documents q join public.guitars g on g.id=q.guitar_id
    where g.owner_id is distinct from p_actor_id and q.uploaded_by_user_id is distinct from p_actor_id
      and public._account_deletion_text_has_identity(concat_ws('|',q.name,q.file_name,q.public_description,q.private_notes,q.category,q.issuer_source,q.description),p_actor_id,p_email)
    order by q.id limit 100);
  get diagnostics affected=row_count;changed:=changed+affected;

  update public.guitar_external_media x set
    canonical_url=case when public._account_deletion_text_has_identity(x.canonical_url,p_actor_id,p_email) then 'https://privacy.invalid/'||x.id::text else x.canonical_url end,
    provider_id=public._account_deletion_redact_identity(x.provider_id,p_actor_id,p_email),
    title=public._account_deletion_redact_identity(x.title,p_actor_id,p_email),
    caption=public._account_deletion_redact_identity(x.caption,p_actor_id,p_email),
    thumbnail_url=case when public._account_deletion_text_has_identity(x.thumbnail_url,p_actor_id,p_email) then null else x.thumbnail_url end
  where x.id in (select q.id from public.guitar_external_media q join public.guitars g on g.id=q.guitar_id
    where g.owner_id is distinct from p_actor_id and q.created_by is distinct from p_actor_id
      and public._account_deletion_text_has_identity(concat_ws('|',q.canonical_url,q.provider_id,q.title,q.caption,q.thumbnail_url),p_actor_id,p_email)
    order by q.id limit 100);
  get diagnostics affected=row_count;changed:=changed+affected;

  update public.guitar_serial_aliases a set
    serial_display=public._account_deletion_redact_identity(a.serial_display,p_actor_id,p_email),
    serial_normalized=case when public._account_deletion_text_has_identity(a.serial_normalized,p_actor_id,p_email)
      then 'PRIVACY'||upper(substr(replace(a.id::text,'-',''),1,16)) else a.serial_normalized end
  where a.id in (select q.id from public.guitar_serial_aliases q where
    public._account_deletion_text_has_identity(concat_ws('|',q.serial_display,q.serial_normalized),p_actor_id,p_email) order by q.id limit 100);
  get diagnostics affected=row_count;changed:=changed+affected;

  update public.guitar_timeline_events e set
    title=public._account_deletion_redact_identity(e.title,p_actor_id,p_email),
    description=public._account_deletion_redact_identity(e.description,p_actor_id,p_email),
    private_notes=public._account_deletion_redact_identity(e.private_notes,p_actor_id,p_email),
    shop_name=public._account_deletion_redact_identity(e.shop_name,p_actor_id,p_email),
    location=public._account_deletion_redact_identity(e.location,p_actor_id,p_email),
    source_key=public._account_deletion_redact_identity(e.source_key,p_actor_id,p_email),
    provider_display_name=public._account_deletion_redact_identity(e.provider_display_name,p_actor_id,p_email),
    work_order_reference=public._account_deletion_redact_identity(e.work_order_reference,p_actor_id,p_email),
    parts_installed=public._account_deletion_redact_identity(e.parts_installed,p_actor_id,p_email),
    setup_measurements=public._account_deletion_redact_identity(e.setup_measurements,p_actor_id,p_email)
  where e.id in (select q.id from public.guitar_timeline_events q join public.guitars g on g.id=q.guitar_id
    where g.owner_id is distinct from p_actor_id and q.created_by_user_id is distinct from p_actor_id
      and q.provider_user_id is distinct from p_actor_id and q.evidence_reviewed_by is distinct from p_actor_id
      and public._account_deletion_text_has_identity(concat_ws('|',q.event_type,q.title,q.description,q.private_notes,q.shop_name,q.location,q.category,
        q.source_key,q.provider_display_name,q.work_order_reference,q.parts_installed,q.setup_measurements),p_actor_id,p_email)
    order by q.id limit 100);
  get diagnostics affected=row_count;changed:=changed+affected;

  update public.ownership_transfers t set
    to_name=public._account_deletion_redact_identity(t.to_name,p_actor_id,p_email),
    fee_waived_reason=public._account_deletion_redact_identity(t.fee_waived_reason,p_actor_id,p_email)
  where t.id in (select q.id from public.ownership_transfers q where q.from_owner_id is distinct from p_actor_id
    and q.accepted_by is distinct from p_actor_id and (p_email='' or lower(btrim(q.to_email))<>p_email)
    and public._account_deletion_text_has_identity(concat_ws('|',q.to_name,q.fee_waived_reason),p_actor_id,p_email) order by q.id limit 100);
  get diagnostics affected=row_count;changed:=changed+affected;

  update public.ownership_claims c set
    acquisition_details=public._account_deletion_redact_identity(c.acquisition_details,p_actor_id,p_email),
    ownership_declaration=public._account_deletion_redact_identity(c.ownership_declaration,p_actor_id,p_email),
    owner_response_note=public._account_deletion_redact_identity(c.owner_response_note,p_actor_id,p_email),
    admin_review_note=public._account_deletion_redact_identity(c.admin_review_note,p_actor_id,p_email)
  where c.id in (select q.id from public.ownership_claims q where q.current_owner_id is distinct from p_actor_id
    and q.claimant_user_id is distinct from p_actor_id and q.decided_by is distinct from p_actor_id
    and (p_email='' or lower(btrim(q.recipient_email_normalized))<>p_email)
    and public._account_deletion_text_has_identity(concat_ws('|',q.acquisition_details,q.ownership_declaration,q.owner_response_note,q.admin_review_note),p_actor_id,p_email)
    order by q.id limit 100);
  get diagnostics affected=row_count;changed:=changed+affected;

  update public.ownership_claim_evidence e set
    file_name=public._account_deletion_redact_identity(e.file_name,p_actor_id,p_email),
    private_note=public._account_deletion_redact_identity(e.private_note,p_actor_id,p_email)
  where e.id in (select q.id from public.ownership_claim_evidence q join public.ownership_claims c on c.id=q.claim_id
    where q.uploaded_by is distinct from p_actor_id and c.current_owner_id is distinct from p_actor_id
      and c.claimant_user_id is distinct from p_actor_id and c.decided_by is distinct from p_actor_id
      and (p_email='' or lower(btrim(c.recipient_email_normalized))<>p_email)
      and public._account_deletion_text_has_identity(concat_ws('|',q.evidence_type,q.file_name,q.private_note),p_actor_id,p_email)
    order by q.id limit 100);
  get diagnostics affected=row_count;changed:=changed+affected;

  update public.ownership_claim_events e set
    note=public._account_deletion_redact_identity(e.note,p_actor_id,p_email),
    metadata=public._account_deletion_redact_identity_jsonb(e.metadata,p_actor_id,p_email,p_salt)
  where e.id in (select q.id from public.ownership_claim_events q join public.ownership_claims c on c.id=q.claim_id
    where q.actor_user_id is distinct from p_actor_id and c.current_owner_id is distinct from p_actor_id
      and c.claimant_user_id is distinct from p_actor_id and c.decided_by is distinct from p_actor_id
      and (p_email='' or lower(btrim(c.recipient_email_normalized))<>p_email)
      and public._account_deletion_text_has_identity(concat_ws('|',q.note,q.metadata::text),p_actor_id,p_email)
    order by q.id limit 100);
  get diagnostics affected=row_count;changed:=changed+affected;

  update public.service_provider_profiles p set
    business_name=public._account_deletion_redact_identity(p.business_name,p_actor_id,p_email),
    public_display_name=public._account_deletion_redact_identity(p.public_display_name,p_actor_id,p_email),
    website=public._account_deletion_redact_identity(p.website,p_actor_id,p_email),
    location=public._account_deletion_redact_identity(p.location,p_actor_id,p_email),
    service_categories=(select coalesce(array_agg(public._account_deletion_redact_identity(v,p_actor_id,p_email) order by n),'{}'::text[])
      from unnest(p.service_categories) with ordinality t(v,n)),
    internal_review_note=public._account_deletion_redact_identity(p.internal_review_note,p_actor_id,p_email)
  where p.user_id in (select q.user_id from public.service_provider_profiles q where q.user_id<>p_actor_id and
    public._account_deletion_text_has_identity(concat_ws('|',q.business_name,q.public_display_name,q.website,q.location,q.service_categories::text,q.internal_review_note),p_actor_id,p_email)
    order by q.user_id limit 100);
  get diagnostics affected=row_count;changed:=changed+affected;

  update public.service_submissions s set
    title=public._account_deletion_redact_identity(s.title,p_actor_id,p_email),
    work_performed=public._account_deletion_redact_identity(s.work_performed,p_actor_id,p_email),
    parts_installed=public._account_deletion_redact_identity(s.parts_installed,p_actor_id,p_email),
    setup_measurements=public._account_deletion_redact_identity(s.setup_measurements,p_actor_id,p_email),
    work_order_reference=public._account_deletion_redact_identity(s.work_order_reference,p_actor_id,p_email),
    recommended_public_description=public._account_deletion_redact_identity(s.recommended_public_description,p_actor_id,p_email),
    private_provider_note=public._account_deletion_redact_identity(s.private_provider_note,p_actor_id,p_email),
    owner_review_note=public._account_deletion_redact_identity(s.owner_review_note,p_actor_id,p_email),
    email_delivery_message=public._account_deletion_redact_identity(s.email_delivery_message,p_actor_id,p_email)
  where s.id in (select q.id from public.service_submissions q where q.provider_user_id is distinct from p_actor_id
    and q.owner_user_id is distinct from p_actor_id and public._account_deletion_text_has_identity(concat_ws('|',q.service_type,q.title,
      q.work_performed,q.parts_installed,q.setup_measurements,q.work_order_reference,q.recommended_public_description,
      q.private_provider_note,q.owner_review_note,q.email_delivery_message),p_actor_id,p_email) order by q.id limit 100);
  get diagnostics affected=row_count;changed:=changed+affected;

  update public.service_submission_evidence e set
    file_name=public._account_deletion_redact_identity(e.file_name,p_actor_id,p_email)
  where e.id in (select q.id from public.service_submission_evidence q join public.service_submissions s on s.id=q.submission_id
    where q.uploaded_by_user_id is distinct from p_actor_id and s.provider_user_id is distinct from p_actor_id
      and s.owner_user_id is distinct from p_actor_id and public._account_deletion_text_has_identity(concat_ws('|',q.evidence_type,q.file_name),p_actor_id,p_email)
    order by q.id limit 100);
  get diagnostics affected=row_count;changed:=changed+affected;

  update public.service_submission_activity a set
    note=public._account_deletion_redact_identity(a.note,p_actor_id,p_email),
    metadata=public._account_deletion_redact_identity_jsonb(a.metadata,p_actor_id,p_email,p_salt)
  where a.id in (select q.id from public.service_submission_activity q where q.actor_user_id is distinct from p_actor_id
    and public._account_deletion_text_has_identity(concat_ws('|',q.note,q.metadata::text),p_actor_id,p_email) order by q.id limit 100);
  get diagnostics affected=row_count;changed:=changed+affected;

  update public.service_submission_notifications n set message=public._account_deletion_redact_identity(n.message,p_actor_id,p_email)
  where n.id in (select q.id from public.service_submission_notifications q where q.recipient_user_id is distinct from p_actor_id
    and public._account_deletion_text_has_identity(q.message,p_actor_id,p_email) order by q.id limit 100);
  get diagnostics affected=row_count;changed:=changed+affected;

  update public.service_evidence_uploads e set
    file_name=case when public._account_deletion_text_has_identity(e.file_name,p_actor_id,p_email)
      then 'privacy-removed-'||e.upload_id::text||'.dat' else e.file_name end,
    evidence_result=public._account_deletion_redact_identity_jsonb(e.evidence_result,p_actor_id,p_email,p_salt)
  where e.upload_id in (select q.upload_id from public.service_evidence_uploads q where q.actor_id is distinct from p_actor_id
    and public._account_deletion_text_has_identity(concat_ws('|',q.file_name,q.evidence_result::text),p_actor_id,p_email) order by q.upload_id limit 100);
  get diagnostics affected=row_count;changed:=changed+affected;

  delete from public.site_content s where s.content_key in (select q.content_key from public.site_content q
    where public._account_deletion_text_has_identity(q.content_key,p_actor_id,p_email)
      and q.content_key<>'public_collection_owner:'||p_actor_id::text
      and q.content_key not like 'create_submission:'||p_actor_id::text||':%'
      and coalesce(q.content_value->>'ownerId','')<>p_actor_id::text
    order by q.content_key limit 100);
  get diagnostics affected=row_count;changed:=changed+affected;
  update public.site_content s set
    content_value=public._account_deletion_redact_identity_jsonb(s.content_value,p_actor_id,p_email,p_salt),
    updated_by=case when s.updated_by=p_actor_id then null else s.updated_by end
  where s.content_key in (select q.content_key from public.site_content q where
    public._account_deletion_text_has_identity(q.content_value::text,p_actor_id,p_email)
      and q.content_key<>'public_collection_owner:'||p_actor_id::text
      and q.content_key not like 'create_submission:'||p_actor_id::text||':%'
      and coalesce(q.content_value->>'ownerId','')<>p_actor_id::text
    order by q.content_key limit 100);
  get diagnostics affected=row_count;changed:=changed+affected;

  update public.site_editor_receipts r set
    request_body=public._account_deletion_redact_identity_jsonb(r.request_body,p_actor_id,p_email,p_salt),
    result=public._account_deletion_redact_identity_jsonb(r.result,p_actor_id,p_email,p_salt)
  where (r.actor_user_id,r.request_id) in (select q.actor_user_id,q.request_id from public.site_editor_receipts q
    where q.actor_user_id<>p_actor_id and public._account_deletion_text_has_identity(concat_ws('|',q.request_body::text,q.result::text),p_actor_id,p_email)
    order by q.actor_user_id,q.request_id limit 100);
  get diagnostics affected=row_count;changed:=changed+affected;

  update public.admin_audit_events a set
    actor_email=public._account_deletion_redact_identity(a.actor_email,p_actor_id,p_email),
    target_id=public._account_deletion_redact_identity(a.target_id,p_actor_id,p_email),
    reason=public._account_deletion_redact_identity(a.reason,p_actor_id,p_email),
    metadata=public._account_deletion_redact_identity_jsonb(a.metadata,p_actor_id,p_email,p_salt)
  where a.id in (select q.id from public.admin_audit_events q where q.actor_user_id is distinct from p_actor_id
    and q.target_user_id is distinct from p_actor_id and public._account_deletion_text_has_identity(
      concat_ws('|',q.actor_email,q.target_id,q.reason,q.metadata::text),p_actor_id,p_email) order by q.id limit 100);
  get diagnostics affected=row_count;changed:=changed+affected;
  if changed>0 then
    insert into public.account_deletion_fulfillment_receipts(operation_id,request_id,action,result)
      values(gen_random_uuid(),p_request_id,'unscoped_scrub',jsonb_build_object('policyVersion',1,'changedRows',changed));
  end if;
  return changed;
end $$;
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

-- Later product migrations replace these hooks. Keeping fail-safe stubs in
-- the core migration lets this state machine install and test independently.
create function public._account_deletion_promo_blockers(p_actor_id uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$select '[]'::jsonb$$;
create function public._account_deletion_promo_retained_pii(p_actor_id uuid,p_email text) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$select false$$;

create function public._account_deletion_blockers(p_request_id uuid,p_actor_id uuid,p_email text,p_protected_admin_emails text[],p_unscoped_personal_content boolean) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare result jsonb;
begin
  select coalesce(jsonb_agg(distinct code order by code),'[]'::jsonb) into result from (
    select 'administrator_account' code where exists(select 1 from public.profiles where id=p_actor_id and role::text='admin')
      or (p_email<>'' and p_email=any(coalesce(p_protected_admin_emails,'{}'::text[])))
    union all select 'unused_paid_credits' where exists(select 1 from public.billing_credit_grants g where g.owner_id=p_actor_id
      and g.credits<>(select coalesce(sum(c.credits),0) from public.billing_credit_consumptions c where c.order_id=g.order_id and c.owner_id=p_actor_id))
    union all select 'unresolved_payment_order' where exists(select 1 from public.billing_orders where owner_id=p_actor_id and status in ('reserved','open'))
    union all select 'payment_hold_or_dispute' where exists(
      select 1 from public.billing_credit_holds h where h.owner_id=p_actor_id and not exists(
        select 1 from public.billing_review_decisions d where d.environment=h.environment and d.event_id=h.event_id and d.action='release'))
    union all select 'billing_retention_review_required' where not public._account_deletion_retention_review_complete(p_request_id,'billing')
    union all select 'unused_profile_credits' where exists(select 1 from public.profiles where id=p_actor_id and (purchased_code_count>0 or remaining_code_count>0))
    union all select 'storage_cleanup_required' where
      exists(select 1 from public.instrument_staged_uploads where owner_id=p_actor_id and state='staged')
      or exists(select 1 from public.service_evidence_uploads where actor_id=p_actor_id and state='prepared')
      or public._account_deletion_storage_cleanup_required(p_request_id,p_actor_id,p_email)
    union all select 'active_ownership_transfer' where exists(select 1 from public.ownership_transfers where (from_owner_id=p_actor_id or accepted_by=p_actor_id or (p_email<>'' and lower(btrim(to_email))=p_email)) and status in ('draft','sent'))
    union all select 'active_ownership_claim' where exists(select 1 from public.ownership_claims where (current_owner_id=p_actor_id or claimant_user_id=p_actor_id or (p_email<>'' and lower(btrim(recipient_email_normalized))=p_email)) and status in ('awaiting_claimant','awaiting_owner','admin_review'))
    union all select 'active_service_workflow' where exists(select 1 from public.service_submissions where (provider_user_id=p_actor_id or owner_user_id=p_actor_id) and status in ('draft','submitted','changes_requested'))
    union all select 'service_history_privacy_review_required' where not public._account_deletion_retention_review_complete(p_request_id,'service')
    union all select 'profile_history_privacy_review_required' where not public._account_deletion_profile_reviews_complete(p_request_id)
    union all select 'retained_personal_content_review_required' where p_unscoped_personal_content
    union all select value from jsonb_array_elements_text(public._account_deletion_promo_blockers(p_actor_id)) hook(value)
  ) blockers;
  return result;
end $$;

-- A final, narrow invariant over every retained Profile owned by the departing
-- account. The fulfillment procedure scrubs these fields deterministically;
-- this assertion makes an unforeseen trigger/schema drift abort before Auth
-- deletion can even be attempted.
create function public._account_deletion_retained_pii(p_request_id uuid,p_actor_id uuid,p_email text) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
  select exists(select 1 from public.account_deletion_profile_custody c join public.guitars g on g.id=c.guitar_id
    where c.request_id=p_request_id and c.state='privacy_review_required' and (g.owner_id is not null or g.visibility<>'private'))
  or public._account_deletion_unscoped_personal_content(p_actor_id,p_email)
  or exists(select 1 from public.account_deletion_profile_review_scopes s where s.request_id=p_request_id
    and public._account_deletion_profile_has_exact_identity(s.guitar_id,p_actor_id,p_email))
  or exists(select 1 from public.account_deletion_profile_custody c where c.request_id=p_request_id
    and public._account_deletion_profile_has_exact_identity(c.guitar_id,p_actor_id,p_email))
  or public._account_deletion_identity_inventory_has_actor('billing',p_actor_id)
  or public._account_deletion_identity_inventory_has_actor('service',p_actor_id)
  or public._account_deletion_storage_cleanup_required(p_request_id,p_actor_id,p_email)
  or exists(select 1 from public.account_deletion_storage_relocations r where r.request_id=p_request_id
    and public._account_deletion_text_has_identity(concat_ws('|',r.source_path,r.destination_path,r.source_mime_type,r.source_version),p_actor_id,p_email))
  or exists(select 1 from public.account_deletion_billing_subjects where request_id=p_request_id and after_fingerprint is null)
  or exists(select 1 from public.account_deletion_service_subjects where request_id=p_request_id and after_fingerprint is null)
  or exists(select 1 from public.site_content s where s.updated_by=p_actor_id
    or strpos(lower(s.content_key),p_actor_id::text)>0 or strpos(lower(s.content_value::text),p_actor_id::text)>0
    or (p_email<>'' and (strpos(lower(s.content_key),p_email)>0 or strpos(lower(s.content_value::text),p_email)>0)))
  or exists(select 1 from public.site_editor_receipts r where r.actor_user_id=p_actor_id
    or strpos(lower(r.request_body::text),p_actor_id::text)>0 or strpos(lower(r.result::text),p_actor_id::text)>0
    or (p_email<>'' and (strpos(lower(r.request_body::text),p_email)>0 or strpos(lower(r.result::text),p_email)>0)))
  or exists(select 1 from public.service_submission_notifications n where n.recipient_user_id=p_actor_id
    or strpos(lower(n.message),p_actor_id::text)>0
    or (p_email<>'' and strpos(lower(n.message),p_email)>0))
  or exists(select 1 from public.guitar_documents d where d.uploaded_by_user_id=p_actor_id)
  or exists(select 1 from public.guitar_external_media x where x.created_by=p_actor_id)
  or exists(select 1 from public.guitar_serial_aliases x where x.created_by=p_actor_id)
  or exists(select 1 from public.ownership_claim_evidence e where e.uploaded_by=p_actor_id)
  or exists(select 1 from public.ownership_claim_events e where e.actor_user_id=p_actor_id)
  or exists(select 1 from public.guitars g where g.owner_id=p_actor_id or g.safety_status_updated_by=p_actor_id or g.owner_removed_by=p_actor_id)
  or exists(select 1 from public.ownership_transfers t where t.from_owner_id=p_actor_id or t.accepted_by=p_actor_id)
  or exists(select 1 from public.ownership_claims c where c.current_owner_id=p_actor_id or c.claimant_user_id=p_actor_id or c.decided_by=p_actor_id)
  or exists(select 1 from public.instrument_create_receipts r where r.owner_id=p_actor_id
    or public._account_deletion_text_has_identity(to_jsonb(r)::text,p_actor_id,p_email))
  or exists(select 1 from public.instrument_staged_uploads u where u.owner_id=p_actor_id
    or public._account_deletion_text_has_identity(to_jsonb(u)::text,p_actor_id,p_email))
  or exists(select 1 from public.ownership_transfers t where p_email<>'' and lower(btrim(t.to_email))=p_email)
  or exists(select 1 from public.ownership_claims c where p_email<>'' and lower(btrim(c.recipient_email_normalized))=p_email)
  or exists(select 1 from public.account_deletion_fulfillments f where f.started_by=p_actor_id or f.last_reviewed_by=p_actor_id)
  or exists(select 1 from public.profiles p where (p_email<>'' and (lower(coalesce(p.account_locked_by,''))=p_email or lower(coalesce(p.account_banned_by,''))=p_email)))
  or exists(select 1 from public.guitars g where p_email<>'' and lower(coalesce(g.admin_archived_by,''))=p_email)
  or exists(select 1 from public.admin_audit_events a where a.actor_user_id=p_actor_id or a.target_user_id=p_actor_id or a.target_id=p_actor_id::text
    or strpos(lower(coalesce(a.target_id,'')),p_actor_id::text)>0 or strpos(lower(coalesce(a.reason,'')),p_actor_id::text)>0
    or strpos(lower(a.metadata::text),p_actor_id::text)>0
    or (p_email<>'' and (lower(coalesce(a.actor_email,''))=p_email or strpos(lower(coalesce(a.target_id,'')),p_email)>0
      or strpos(lower(coalesce(a.reason,'')),p_email)>0 or strpos(lower(a.metadata::text),p_email)>0)))
  or public._account_deletion_promo_retained_pii(p_actor_id,p_email)
$$;

create function public.prepare_account_deletion_fulfillment(
  p_admin_id uuid,p_environment_admin boolean,p_request_id uuid,p_operation_id uuid,
  p_protected_admin_emails text[] default '{}'::text[]
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare request_row public.account_deletion_requests; job public.account_deletion_fulfillments;
  old_receipt public.account_deletion_fulfillment_receipts; target_email text; target_display_name text; blocked jsonb; answer jsonb;
  new_subject uuid; preliminary_actor uuid; protected_admin_emails text[]; unscoped_remaining boolean; now_at timestamptz:=clock_timestamp();
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
  perform pg_advisory_xact_lock(hashtextextended('qrguitar:deletion-operation:'||p_operation_id::text,0));
  if exists(select 1 from public.account_deletion_profile_review_attestations where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_retention_attestations where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_custody_release_receipts where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_storage_content_reviews where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_custody_evidence_reviews where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_review_page_receipts where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_storage_relocations where finalize_operation_id=p_operation_id or complete_operation_id=p_operation_id) then
    raise exception using errcode='PD409',message='This operation UUID belongs to another deletion action.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('qrguitar:account-deletion:'||p_request_id::text,0));
  select * into old_receipt from public.account_deletion_fulfillment_receipts where operation_id=p_operation_id;
  if found then
    if old_receipt.request_id<>p_request_id or old_receipt.action<>'prepare' then raise exception using errcode='PD409',message='This operation UUID belongs to another fulfillment action.'; end if;
    select * into job from public.account_deletion_fulfillments where request_id=p_request_id;
    return jsonb_build_object('ok',true,'fulfillment',public._account_deletion_admin_fulfillment_json(job),
      'profileReviews',public._account_deletion_profile_reviews_json(p_request_id),
      'retentionReviews',public._account_deletion_retention_reviews_json(p_request_id),
      'storageReviews',public._account_deletion_storage_reviews_json(p_request_id),
      'storageRelocations',public._account_deletion_storage_relocations_json(p_request_id),
      'authActorId',case when job.state='ready_for_auth_deletion' then job.actor_id else null end);
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
    select lower(btrim(coalesce(u.email,''))),nullif(btrim(p.display_name),'') into target_email,target_display_name
      from auth.users u left join public.profiles p on p.id=u.id where u.id=request_row.actor_id;
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
  if target_display_name is null and job.actor_id is not null then
    select nullif(btrim(display_name),'') into target_display_name from public.profiles where id=job.actor_id;
  end if;
  perform set_config('qrguitar.account_deletion_request',p_request_id::text,true);
  perform set_config('qrguitar.account_deletion_target_name',coalesce(target_display_name,''),true);
  now_at:=clock_timestamp();
  if job.state='completed' then
    answer:=public._account_deletion_admin_fulfillment_json(job);
  elsif job.state='ready_for_auth_deletion' then
    answer:=public._account_deletion_admin_fulfillment_json(job);
  else
    perform set_config('request.jwt.claim.role','service_role',true);
    perform public._account_deletion_scrub_unscoped_personal_content(p_request_id,job.actor_id,target_email,job.subject_token);
    unscoped_remaining:=public._account_deletion_unscoped_personal_content(job.actor_id,target_email);
    perform set_config('qrguitar.account_deletion_target_name','',true);
    perform public._account_deletion_sync_profile_review_scope(p_request_id,job.actor_id,target_email);
    perform public._account_deletion_lock_profile_reviews(p_request_id);
    if job.state='blocked' then
      perform public._account_deletion_sync_storage_relocations(p_request_id,job.actor_id,target_email);
    end if;
    perform pg_advisory_xact_lock(hashtextextended('qrguitar:billing-ledger',0));
    if job.state='quiescing_storage' and clock_timestamp()>=job.storage_quiesce_until then
      lock table storage.objects in share mode;
      now_at:=clock_timestamp();
    end if;
    blocked:=public._account_deletion_blockers(p_request_id,job.actor_id,target_email,protected_admin_emails,unscoped_remaining);
    if job.state='blocked' and blocked<>'[]'::jsonb then
      update public.account_deletion_fulfillments set state='blocked',blockers=blocked,revision=revision+1,
        last_reviewed_by=p_admin_id,reviewed_at=now_at where request_id=p_request_id returning * into job;
      answer:=public._account_deletion_admin_fulfillment_json(job);
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
      answer:=public._account_deletion_admin_fulfillment_json(job);
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
        answer:=public._account_deletion_admin_fulfillment_json(job);
      else
        -- The durable freeze has outlived every issued upload capability and a
        -- fresh storage inventory is empty. Now anonymize under the same actor
        -- and recipient-email locks before Auth deletion can be attempted.
        perform set_config('request.jwt.claim.role','service_role',true);
        perform set_config('qrguitar.account_deletion_target_name',coalesce(target_display_name,''),true);
        perform public._account_deletion_migrate_billing_subject(p_request_id,job.actor_id,p_admin_id);
        perform public._account_deletion_migrate_service_subject(p_request_id,job.actor_id,p_admin_id);
        update public.profiles set account_status='removed',hide_public_content=true,display_name=null,
          admin_notes=null,account_lock_reason=null,account_ban_reason=null,
          purchased_code_count=0,remaining_code_count=0 where id=job.actor_id;

      insert into public.account_deletion_profile_custody(guitar_id,request_id,prior_visibility)
        select id,p_request_id,visibility from public.guitars where owner_id=job.actor_id on conflict do nothing;

      -- Custody keeps the permanent QR and every factual instrument/service
      -- record. Only proven identity strings and Auth links are removed.
      update public.site_content s set
        content_value=public._account_deletion_redact_identity_jsonb(s.content_value,job.actor_id,target_email,job.subject_token),
        updated_by=null
        from public.account_deletion_profile_review_scopes c join public.guitars g on g.id=c.guitar_id
        where c.request_id=p_request_id and s.content_key='record_trust:'||g.qr_code;
      update public.guitars g set owner_id=null,visibility='private',
        name=public._account_deletion_redact_identity(g.name,job.actor_id,target_email),
        brand=public._account_deletion_redact_identity(g.brand,job.actor_id,target_email),
        model=public._account_deletion_redact_identity(g.model,job.actor_id,target_email),
        year=public._account_deletion_redact_identity(g.year,job.actor_id,target_email),
        serial_number=public._account_deletion_redact_identity(g.serial_number,job.actor_id,target_email),
        builder=public._account_deletion_redact_identity(g.builder,job.actor_id,target_email),
        location=case when g.location is null then null else '[personal information removed]' end,
        summary=public._account_deletion_redact_identity(g.summary,job.actor_id,target_email),
        hero_image_path=case when public._account_deletion_text_has_identity(g.hero_image_path,job.actor_id,target_email)
          then null else g.hero_image_path end,
        safety_status_updated_by=null,
        safety_note=case when g.safety_note is null then null else '[personal information removed]' end,
        public_safety_note=case when g.public_safety_note is null then null else '[personal information removed]' end,
        owner_removed_by=null,
        owner_removed_reason=public._account_deletion_redact_identity(g.owner_removed_reason,job.actor_id,target_email),
        admin_archived_by=case when target_email<>'' and lower(coalesce(g.admin_archived_by,''))=target_email then null else g.admin_archived_by end,
        admin_archive_reason=public._account_deletion_redact_identity(g.admin_archive_reason,job.actor_id,target_email),
        updated_at=greatest(g.updated_at,now_at)
        from public.account_deletion_profile_custody c where c.request_id=p_request_id and c.guitar_id=g.id;
      update public.guitars g set
        name=public._account_deletion_redact_identity(g.name,job.actor_id,target_email),
        brand=public._account_deletion_redact_identity(g.brand,job.actor_id,target_email),
        model=public._account_deletion_redact_identity(g.model,job.actor_id,target_email),
        year=public._account_deletion_redact_identity(g.year,job.actor_id,target_email),
        serial_number=public._account_deletion_redact_identity(g.serial_number,job.actor_id,target_email),
        builder=public._account_deletion_redact_identity(g.builder,job.actor_id,target_email),
        location=public._account_deletion_redact_identity(g.location,job.actor_id,target_email),
        summary=public._account_deletion_redact_identity(g.summary,job.actor_id,target_email),
        hero_image_path=case when public._account_deletion_text_has_identity(g.hero_image_path,job.actor_id,target_email) then null else g.hero_image_path end,
        safety_note=public._account_deletion_redact_identity(g.safety_note,job.actor_id,target_email),
        public_safety_note=public._account_deletion_redact_identity(g.public_safety_note,job.actor_id,target_email),
        owner_removed_reason=public._account_deletion_redact_identity(g.owner_removed_reason,job.actor_id,target_email),
        admin_archive_reason=public._account_deletion_redact_identity(g.admin_archive_reason,job.actor_id,target_email),
        updated_at=greatest(g.updated_at,now_at)
        from public.account_deletion_profile_review_scopes c
        where c.request_id=p_request_id and c.guitar_id=g.id
          and not exists(select 1 from public.account_deletion_profile_custody h where h.request_id=p_request_id and h.guitar_id=g.id);
      update public.guitars set safety_status_updated_by=null where safety_status_updated_by=job.actor_id;
      update public.guitars set owner_removed_by=null where owner_removed_by=job.actor_id;
      update public.guitars set admin_archived_by=null
        where target_email<>'' and lower(coalesce(admin_archived_by,''))=target_email;

      update public.guitar_specs s set
        label=public._account_deletion_redact_identity(s.label,job.actor_id,target_email),
        value=public._account_deletion_redact_identity(s.value,job.actor_id,target_email)
        from public.account_deletion_profile_review_scopes c where c.request_id=p_request_id and c.guitar_id=s.guitar_id;
      update public.guitar_media m set
        storage_path=case when public._account_deletion_text_has_identity(m.storage_path,job.actor_id,target_email)
          then 'privacy-removed/'||m.id::text else m.storage_path end,
        alt=public._account_deletion_redact_identity(m.alt,job.actor_id,target_email)
        from public.account_deletion_profile_review_scopes c where c.request_id=p_request_id and c.guitar_id=m.guitar_id;
      update public.guitar_documents d set uploaded_by_user_id=case when d.uploaded_by_user_id=job.actor_id then null else d.uploaded_by_user_id end,
        name=public._account_deletion_redact_identity(d.name,job.actor_id,target_email),
        storage_path=case when public._account_deletion_text_has_identity(d.storage_path,job.actor_id,target_email)
          then 'privacy-removed/'||d.id::text else d.storage_path end,
        document_type=public._account_deletion_redact_identity(d.document_type,job.actor_id,target_email),
        file_name=public._account_deletion_redact_identity(d.file_name,job.actor_id,target_email),
        public_description=public._account_deletion_redact_identity(d.public_description,job.actor_id,target_email),
        private_notes=public._account_deletion_redact_identity(d.private_notes,job.actor_id,target_email),
        category=public._account_deletion_redact_identity(d.category,job.actor_id,target_email),
        issuer_source=public._account_deletion_redact_identity(d.issuer_source,job.actor_id,target_email),
        description=public._account_deletion_redact_identity(d.description,job.actor_id,target_email)
        from public.account_deletion_profile_review_scopes c where c.request_id=p_request_id and c.guitar_id=d.guitar_id;
      update public.guitar_documents set uploaded_by_user_id=null where uploaded_by_user_id=job.actor_id;
      update public.guitar_external_media x set created_by=case when x.created_by=job.actor_id then null else x.created_by end,
        canonical_url=case when public._account_deletion_text_has_identity(x.canonical_url,job.actor_id,target_email)
          then 'https://privacy.invalid/removed/'||x.id::text else x.canonical_url end,
        provider_id=public._account_deletion_redact_identity(x.provider_id,job.actor_id,target_email),
        title=public._account_deletion_redact_identity(x.title,job.actor_id,target_email),
        caption=public._account_deletion_redact_identity(x.caption,job.actor_id,target_email),
        thumbnail_url=case when public._account_deletion_text_has_identity(x.thumbnail_url,job.actor_id,target_email)
          then null else x.thumbnail_url end
        from public.account_deletion_profile_review_scopes c where c.request_id=p_request_id and c.guitar_id=x.guitar_id;
      update public.guitar_external_media set created_by=null where created_by=job.actor_id;
      update public.guitar_serial_aliases a set created_by=case when a.created_by=job.actor_id then null else a.created_by end,
        serial_normalized=case when public._account_deletion_text_has_identity(a.serial_normalized,job.actor_id,target_email)
          then 'REDACTED-'||replace(a.id::text,'-','') else a.serial_normalized end,
        serial_display=public._account_deletion_redact_identity(a.serial_display,job.actor_id,target_email)
        from public.account_deletion_profile_review_scopes c where c.request_id=p_request_id and c.guitar_id=a.guitar_id;
      update public.guitar_serial_aliases set created_by=null where created_by=job.actor_id;

      update public.guitar_timeline_events e set
        title=public._account_deletion_redact_identity(e.title,job.actor_id,target_email),
        description=public._account_deletion_redact_identity(e.description,job.actor_id,target_email),
        private_notes=public._account_deletion_redact_identity(e.private_notes,job.actor_id,target_email),
        shop_name=public._account_deletion_redact_identity(e.shop_name,job.actor_id,target_email),
        location=public._account_deletion_redact_identity(e.location,job.actor_id,target_email),
        provider_display_name=public._account_deletion_redact_identity(e.provider_display_name,job.actor_id,target_email),
        work_order_reference=public._account_deletion_redact_identity(e.work_order_reference,job.actor_id,target_email),
        parts_installed=public._account_deletion_redact_identity(e.parts_installed,job.actor_id,target_email),
        setup_measurements=public._account_deletion_redact_identity(e.setup_measurements,job.actor_id,target_email),
        who_performed=public._account_deletion_redact_identity(e.who_performed,job.actor_id,target_email),
        event_type=public._account_deletion_redact_identity(e.event_type,job.actor_id,target_email),
        category=public._account_deletion_redact_identity(e.category,job.actor_id,target_email),
        source_key=public._account_deletion_redact_identity(e.source_key,job.actor_id,target_email)
        from public.account_deletion_profile_review_scopes c where c.request_id=p_request_id and c.guitar_id=e.guitar_id;

      update public.ownership_transfers t set
        from_owner_id=case when t.from_owner_id=job.actor_id then null else t.from_owner_id end,
        accepted_by=case when t.accepted_by=job.actor_id then null else t.accepted_by end,
        to_name=public._account_deletion_redact_identity(t.to_name,job.actor_id,target_email),
        to_email=case when target_email<>'' and lower(btrim(t.to_email))=target_email then 'deleted+'||t.id::text||'@privacy.invalid' else t.to_email end,
        claim_token_hash=null,purchaser_code_hash=null,
        fee_waived_reason=public._account_deletion_redact_identity(t.fee_waived_reason,job.actor_id,target_email)
        where t.from_owner_id=job.actor_id or t.accepted_by=job.actor_id or (target_email<>'' and lower(btrim(t.to_email))=target_email);
      update public.ownership_claim_evidence e set uploaded_by=null,
        file_name=public._account_deletion_redact_identity(e.file_name,job.actor_id,target_email),
        storage_path=case when public._account_deletion_text_has_identity(e.storage_path,job.actor_id,target_email)
          then 'privacy-removed/'||e.id::text else e.storage_path end,
        private_note=public._account_deletion_redact_identity(e.private_note,job.actor_id,target_email)
        where e.uploaded_by=job.actor_id;
      update public.ownership_claim_events e set actor_user_id=null,
        note=public._account_deletion_redact_identity(e.note,job.actor_id,target_email),
        metadata=public._account_deletion_redact_identity_jsonb(e.metadata,job.actor_id,target_email,job.subject_token)
        from public.ownership_claims c where c.id=e.claim_id and (
          e.actor_user_id=job.actor_id or c.current_owner_id=job.actor_id or c.claimant_user_id=job.actor_id or c.decided_by=job.actor_id
          or (target_email<>'' and lower(btrim(c.recipient_email_normalized))=target_email));
      update public.ownership_claims c set
        current_owner_id=case when c.current_owner_id=job.actor_id then null else c.current_owner_id end,
        claimant_user_id=case when c.claimant_user_id=job.actor_id then null else c.claimant_user_id end,
        decided_by=case when c.decided_by=job.actor_id then null else c.decided_by end,
        recipient_email_normalized=case when target_email<>'' and lower(btrim(c.recipient_email_normalized))=target_email then null else c.recipient_email_normalized end,
        claim_token_hash=null,purchaser_code_hash=null,
        acquisition_details=public._account_deletion_redact_identity(c.acquisition_details,job.actor_id,target_email),
        ownership_declaration=public._account_deletion_redact_identity(c.ownership_declaration,job.actor_id,target_email),
        owner_response_note=public._account_deletion_redact_identity(c.owner_response_note,job.actor_id,target_email),
        admin_review_note=public._account_deletion_redact_identity(c.admin_review_note,job.actor_id,target_email)
        where c.current_owner_id=job.actor_id or c.claimant_user_id=job.actor_id or c.decided_by=job.actor_id
          or (target_email<>'' and lower(btrim(c.recipient_email_normalized))=target_email);

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

      -- Staged-upload rows are operational receipts, not instrument history.
      -- Every still-staged row blocked above; consumed/tombstoned rows can now
      -- be removed without leaving an Auth UUID or identity-bearing path.
      delete from public.instrument_staged_uploads where owner_id=job.actor_id;
      delete from public.instrument_create_receipts where owner_id=job.actor_id;
      delete from public.site_content where content_key='public_collection_owner:'||job.actor_id::text
        or content_key like 'create_submission:'||job.actor_id::text||':%';
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
        answer:=public._account_deletion_admin_fulfillment_json(job);
      end if;
    end if;
  end if;
  perform set_config('qrguitar.account_deletion_request','',true);
  perform set_config('qrguitar.account_deletion_target_name','',true);
  insert into public.account_deletion_fulfillment_receipts(operation_id,request_id,action,result)
    values(p_operation_id,p_request_id,'prepare',answer);
  return jsonb_build_object('ok',true,'fulfillment',answer,
    'profileReviews',public._account_deletion_profile_reviews_json(p_request_id),
    'retentionReviews',public._account_deletion_retention_reviews_json(p_request_id),
    'storageReviews',public._account_deletion_storage_reviews_json(p_request_id),
    'storageRelocations',public._account_deletion_storage_relocations_json(p_request_id),
    'authActorId',case when job.state='ready_for_auth_deletion' then job.actor_id else null end);
end $$;

create function public.complete_account_deletion_fulfillment(
  p_admin_id uuid,p_environment_admin boolean,p_request_id uuid,p_operation_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare job public.account_deletion_fulfillments; receipt public.account_deletion_fulfillment_receipts; answer jsonb; now_at timestamptz:=clock_timestamp();
begin
  if p_request_id is null or p_operation_id is null then raise exception using errcode='22023',message='Request and operation UUIDs are required.'; end if;
  perform public._account_deletion_admin(p_admin_id,p_environment_admin);
  perform pg_advisory_xact_lock(hashtextextended('qrguitar:deletion-operation:'||p_operation_id::text,0));
  if exists(select 1 from public.account_deletion_profile_review_attestations where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_retention_attestations where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_custody_release_receipts where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_storage_content_reviews where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_custody_evidence_reviews where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_review_page_receipts where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_storage_relocations where finalize_operation_id=p_operation_id or complete_operation_id=p_operation_id) then
    raise exception using errcode='PD409',message='This operation UUID belongs to another deletion action.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('qrguitar:account-deletion:'||p_request_id::text,0));
  select * into receipt from public.account_deletion_fulfillment_receipts where operation_id=p_operation_id;
  if found then
    if receipt.request_id<>p_request_id or receipt.action<>'complete' then raise exception using errcode='PD409',message='This operation UUID belongs to another fulfillment action.'; end if;
    return jsonb_build_object('ok',true,'fulfillment',receipt.result,
      'profileReviews',public._account_deletion_profile_reviews_json(p_request_id),
      'retentionReviews',public._account_deletion_retention_reviews_json(p_request_id),
      'storageReviews',public._account_deletion_storage_reviews_json(p_request_id));
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
  answer:=public._account_deletion_admin_fulfillment_json(job);
  insert into public.account_deletion_fulfillment_receipts(operation_id,request_id,action,result)
    values(p_operation_id,p_request_id,'complete',answer);
  return jsonb_build_object('ok',true,'fulfillment',answer,
    'profileReviews',public._account_deletion_profile_reviews_json(p_request_id),
    'retentionReviews',public._account_deletion_retention_reviews_json(p_request_id),
    'storageReviews',public._account_deletion_storage_reviews_json(p_request_id));
end $$;

create function public.read_account_deletion_fulfillment(
  p_admin_id uuid,p_environment_admin boolean,p_request_id uuid
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare job public.account_deletion_fulfillments;
begin
  if p_request_id is null then raise exception using errcode='22023',message='Request UUID is required.'; end if;
  perform public._account_deletion_admin(p_admin_id,p_environment_admin);
  select * into job from public.account_deletion_fulfillments where request_id=p_request_id;
  return jsonb_build_object('ok',true,'fulfillment',case when found then public._account_deletion_admin_fulfillment_json(job) else null end,
    'profileReviews',case when found then public._account_deletion_profile_reviews_json(p_request_id) else '[]'::jsonb end,
    'retentionReviews',case when found then public._account_deletion_retention_reviews_json(p_request_id) else '[]'::jsonb end,
    'storageReviews',case when found then public._account_deletion_storage_reviews_json(p_request_id) else '[]'::jsonb end);
end $$;

create function public._account_deletion_custody_evidence_reviews_json(p_request_id uuid,p_claim_id uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,public,storage as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'evidenceId',e.id,
    'objectFingerprint',case when o.id is null then null else encode(public._account_deletion_storage_object_fingerprint(
      o.bucket_id,o.name,f.subject_token),'hex') end,
    'byteSize',case when coalesce(o.metadata->>'size','')~'^[0-9]{1,19}$' then (o.metadata->>'size')::bigint end,
    'mimeType',coalesce(o.metadata->>'mimetype',o.metadata->>'contentType'),
    'reviewed',v.operation_id is not null,
    'byteSha256',case when v.byte_sha256 is null then null else encode(v.byte_sha256,'hex') end,
    'reviewedAt',v.reviewed_at) order by e.id),'[]'::jsonb)
  from public.account_deletion_fulfillments f
  join public.ownership_claims c on c.id=p_claim_id
  join public.ownership_claim_evidence e on e.claim_id=c.id
  left join storage.objects o on o.bucket_id='instrument-documents' and o.name=e.storage_path
  left join lateral (select r.* from public.account_deletion_custody_evidence_reviews r
    where r.request_id=f.request_id and r.claim_id=c.id and r.evidence_id=e.id
      and r.object_path_fingerprint=sha256(convert_to(f.subject_token::text||':instrument-documents:'||e.storage_path,'UTF8'))
      and r.object_fingerprint=public._account_deletion_storage_object_fingerprint('instrument-documents',e.storage_path,f.subject_token)
      and r.object_version is not distinct from to_jsonb(o)->>'version'
    order by r.reviewed_at desc,r.operation_id desc limit 1) v on true
  where f.request_id=p_request_id
$$;

create function public.read_account_deletion_custody_evidence_inventory(
  p_admin_id uuid,p_environment_admin boolean,p_request_id uuid,p_claim_id uuid,p_expected_profile_fingerprint text,p_page_index integer
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare job public.account_deletion_fulfillments; claim_row public.ownership_claims; guitar_id uuid; actual bytea; evidence jsonb; all_evidence jsonb;
  evidence_count integer; page_count integer; inventory_fingerprint text;
begin
  if p_request_id is null or p_claim_id is null or coalesce(p_expected_profile_fingerprint,'')!~'^[a-f0-9]{64}$' or p_page_index is null or p_page_index<0 then
    raise exception using errcode='22023',message='An exact custody claim, Profile fingerprint, and page are required.';end if;
  perform public._account_deletion_admin(p_admin_id,p_environment_admin);
  select * into job from public.account_deletion_fulfillments where request_id=p_request_id;
  select * into claim_row from public.ownership_claims where id=p_claim_id;
  if job.request_id is null or claim_row.id is null or job.state<>'completed' or claim_row.status<>'admin_review' or claim_row.claimant_user_id is null
    or not exists(select 1 from public.profiles where id=claim_row.claimant_user_id and account_status='active')
    or not exists(select 1 from public.account_deletion_profile_custody c
      where c.request_id=p_request_id and c.guitar_id=claim_row.guitar_id and c.state='privacy_review_required') then
    raise exception using errcode='PD409',message='This proof set is not eligible for custody review.';end if;
  guitar_id:=claim_row.guitar_id;actual:=public._account_deletion_profile_fingerprint(p_request_id,guitar_id);
  if encode(actual,'hex')<>p_expected_profile_fingerprint then raise exception using errcode='PD412',message='The custody Profile changed; inspect the current review.';end if;
  select count(*)::integer into evidence_count from public.ownership_claim_evidence where claim_id=p_claim_id;
  if evidence_count<1 then raise exception using errcode='PD409',message='At least one custody proof is required.';end if;
  page_count:=ceil(evidence_count/32.0)::integer;
  if p_page_index>=page_count then raise exception using errcode='22023',message='This custody proof page does not exist.';end if;
  all_evidence:=public._account_deletion_custody_evidence_reviews_json(p_request_id,p_claim_id);
  select coalesce(jsonb_agg(value order by ordinality),'[]'::jsonb) into evidence from jsonb_array_elements(all_evidence) with ordinality
    where ordinality between p_page_index*32+1 and (p_page_index+1)*32;
  select encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_object('evidenceId',value->>'evidenceId','objectFingerprint',value->>'objectFingerprint') order by value->>'evidenceId'),'[]'::jsonb)::text,'UTF8')),'hex')
    into inventory_fingerprint from jsonb_array_elements(all_evidence);
  return jsonb_build_object('ok',true,'claim',jsonb_build_object('claimId',p_claim_id,'guitarId',guitar_id,
    'profileFingerprint',p_expected_profile_fingerprint,'inventoryFingerprint',inventory_fingerprint,'pageIndex',p_page_index,
    'pageCount',page_count,'evidenceCount',evidence_count,'reviewedCount',(select count(*) from jsonb_array_elements(all_evidence) where (value->>'reviewed')::boolean),'evidence',evidence));
end $$;

create function public.read_account_deletion_custody_evidence_source(
  p_admin_id uuid,p_environment_admin boolean,p_request_id uuid,p_claim_id uuid,p_evidence_id uuid,p_expected_object_fingerprint text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,storage as $$
declare job public.account_deletion_fulfillments; evidence public.ownership_claim_evidence; claim_row public.ownership_claims; actual bytea;
begin
  if p_request_id is null or p_claim_id is null or p_evidence_id is null
    or coalesce(p_expected_object_fingerprint,'')!~'^[a-f0-9]{64}$' then
    raise exception using errcode='22023',message='An exact custody proof fingerprint is required.';end if;
  perform public._account_deletion_admin(p_admin_id,p_environment_admin);
  perform pg_advisory_xact_lock(hashtextextended('qrguitar:account-deletion:'||p_request_id::text,0));
  select * into job from public.account_deletion_fulfillments where request_id=p_request_id for update;
  select * into claim_row from public.ownership_claims where id=p_claim_id for share;
  select * into evidence from public.ownership_claim_evidence where id=p_evidence_id and claim_id=p_claim_id for share;
  if job.request_id is null or claim_row.id is null or job.state<>'completed' or evidence.id is null or claim_row.status<>'admin_review'
    or not exists(select 1 from public.account_deletion_profile_custody c
      where c.request_id=p_request_id and c.guitar_id=claim_row.guitar_id and c.state='privacy_review_required') then
    raise exception using errcode='PD409',message='This custody proof is not available for review.';end if;
  perform 1 from storage.objects where bucket_id='instrument-documents' and name=evidence.storage_path for share;
  if not found then raise exception using errcode='PD428',message='The custody proof object is missing.';end if;
  actual:=public._account_deletion_storage_object_fingerprint('instrument-documents',evidence.storage_path,job.subject_token);
  if encode(actual,'hex')<>p_expected_object_fingerprint then
    raise exception using errcode='PD412',message='The custody proof changed; inspect the current object.';end if;
  return jsonb_build_object('ok',true,'source',jsonb_build_object('claimId',p_claim_id,'evidenceId',p_evidence_id,
    'bucket','instrument-documents','sourcePath',evidence.storage_path,'objectFingerprint',p_expected_object_fingerprint,
    'sourceSize',case when coalesce((select metadata->>'size' from storage.objects where bucket_id='instrument-documents' and name=evidence.storage_path),'')~'^[0-9]{1,19}$'
      then ((select metadata->>'size' from storage.objects where bucket_id='instrument-documents' and name=evidence.storage_path))::bigint end,
    'sourceMimeType',(select coalesce(metadata->>'mimetype',metadata->>'contentType') from storage.objects
      where bucket_id='instrument-documents' and name=evidence.storage_path)));
end $$;

create function public.attest_account_deletion_custody_evidence(
  p_admin_id uuid,p_environment_admin boolean,p_request_id uuid,p_operation_id uuid,p_claim_id uuid,p_evidence_id uuid,
  p_expected_profile_fingerprint text,p_expected_object_fingerprint text,p_byte_sha256 text,p_byte_size bigint,
  p_mime_type text,p_confirm_reviewed boolean
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,storage as $$
declare job public.account_deletion_fulfillments; claim_row public.ownership_claims; evidence public.ownership_claim_evidence;
  existing public.account_deletion_custody_evidence_reviews; profile_actual bytea; object_actual bytea;
  path_actual bytea; object_version text; result jsonb;
begin
  if p_request_id is null or p_operation_id is null or p_claim_id is null or p_evidence_id is null
    or coalesce(p_expected_profile_fingerprint,'')!~'^[a-f0-9]{64}$'
    or coalesce(p_expected_object_fingerprint,'')!~'^[a-f0-9]{64}$'
    or coalesce(p_byte_sha256,'')!~'^[a-f0-9]{64}$' or p_byte_size is null or p_byte_size<0
    or p_mime_type not in ('image/jpeg','image/png','image/webp','application/pdf')
    or p_confirm_reviewed is distinct from true then
    raise exception using errcode='22023',message='Exact inspected custody proof bytes and explicit confirmation are required.';end if;
  perform public._account_deletion_admin(p_admin_id,p_environment_admin);
  perform pg_advisory_xact_lock(hashtextextended('qrguitar:deletion-operation:'||p_operation_id::text,0));
  select * into existing from public.account_deletion_custody_evidence_reviews where operation_id=p_operation_id;
  if found then
    if existing.request_id<>p_request_id or existing.claim_id<>p_claim_id or existing.evidence_id<>p_evidence_id
      or encode(existing.profile_fingerprint,'hex')<>p_expected_profile_fingerprint
      or encode(existing.object_fingerprint,'hex')<>p_expected_object_fingerprint
      or encode(existing.byte_sha256,'hex')<>p_byte_sha256 or existing.byte_size<>p_byte_size
      or existing.mime_type<>p_mime_type then
      raise exception using errcode='PD409',message='This operation UUID belongs to another custody proof review.';end if;
    return jsonb_build_object('ok',true,'review',existing.result,
      'evidence',public._account_deletion_custody_evidence_reviews_json(p_request_id,p_claim_id));
  end if;
  if exists(select 1 from public.account_deletion_fulfillment_receipts where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_profile_review_attestations where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_retention_attestations where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_storage_content_reviews where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_custody_release_receipts where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_storage_relocations
      where finalize_operation_id=p_operation_id or complete_operation_id=p_operation_id) then
    raise exception using errcode='PD409',message='This operation UUID belongs to another deletion action.';end if;
  perform pg_advisory_xact_lock(hashtextextended('qrguitar:account-deletion:'||p_request_id::text,0));
  select * into job from public.account_deletion_fulfillments where request_id=p_request_id for update;
  select * into claim_row from public.ownership_claims where id=p_claim_id;
  if job.request_id is null or claim_row.id is null or job.state<>'completed' or claim_row.status<>'admin_review' or claim_row.claimant_user_id is null
    or not exists(select 1 from public.account_deletion_profile_custody c
      where c.request_id=p_request_id and c.guitar_id=claim_row.guitar_id and c.state='privacy_review_required') then
    raise exception using errcode='PD409',message='This custody proof is not eligible for review.';end if;
  perform pg_advisory_xact_lock(hashtextextended('qrguitar:profile-graph:'||claim_row.guitar_id::text,0));
  perform 1 from public.guitars where id=claim_row.guitar_id for update;
  select * into evidence from public.ownership_claim_evidence where id=p_evidence_id and claim_id=p_claim_id for update;
  if not found then raise exception using errcode='PD404',message='Custody claim evidence was not found.';end if;
  profile_actual:=public._account_deletion_profile_fingerprint(p_request_id,claim_row.guitar_id);
  if encode(profile_actual,'hex')<>p_expected_profile_fingerprint then
    raise exception using errcode='PD412',message='The custody Profile changed; inspect it again.';end if;
  perform 1 from storage.objects where bucket_id='instrument-documents' and name=evidence.storage_path for update;
  if not found then raise exception using errcode='PD428',message='The custody proof object is missing.';end if;
  object_actual:=public._account_deletion_storage_object_fingerprint('instrument-documents',evidence.storage_path,job.subject_token);
  path_actual:=sha256(convert_to(job.subject_token::text||':instrument-documents:'||evidence.storage_path,'UTF8'));
  select to_jsonb(o)->>'version' into object_version from storage.objects o
    where o.bucket_id='instrument-documents' and o.name=evidence.storage_path;
  if encode(object_actual,'hex')<>p_expected_object_fingerprint
    or coalesce((select metadata->>'size' from storage.objects where bucket_id='instrument-documents' and name=evidence.storage_path),'')!~'^[0-9]{1,19}$'
    or ((select metadata->>'size' from storage.objects where bucket_id='instrument-documents' and name=evidence.storage_path))::bigint<>p_byte_size
    or (select coalesce(metadata->>'mimetype',metadata->>'contentType') from storage.objects
      where bucket_id='instrument-documents' and name=evidence.storage_path) is distinct from p_mime_type then
    raise exception using errcode='PD412',message='The custody proof bytes changed; inspect them again.';end if;
  result:=jsonb_build_object('claimId',p_claim_id,'evidenceId',p_evidence_id,
    'profileFingerprint',p_expected_profile_fingerprint,'objectFingerprint',p_expected_object_fingerprint,
    'byteSha256',p_byte_sha256,'byteSize',p_byte_size,'mimeType',p_mime_type,'reviewedAt',clock_timestamp());
  insert into public.account_deletion_custody_evidence_reviews(
    operation_id,request_id,claim_id,evidence_id,guitar_id,profile_fingerprint,object_fingerprint,
    object_path_fingerprint,object_version,byte_sha256,byte_size,mime_type,reviewed_by,result)
    values(p_operation_id,p_request_id,p_claim_id,p_evidence_id,claim_row.guitar_id,profile_actual,object_actual,
      path_actual,object_version,decode(p_byte_sha256,'hex'),p_byte_size,p_mime_type,p_admin_id,result);
  return jsonb_build_object('ok',true,'review',result,
    'evidence',public._account_deletion_custody_evidence_reviews_json(p_request_id,p_claim_id));
end $$;

-- Permanent QR Profiles remain private after account deletion until a
-- fingerprint-bound, evidence-backed claim is approved. This RPC is the sole
-- custody-release boundary and deliberately leaves publication to the new
-- owner's ordinary Profile controls.
create function public.release_account_deletion_profile_custody(
  p_admin_id uuid,p_environment_admin boolean,p_request_id uuid,p_operation_id uuid,
  p_claim_id uuid,p_expected_fingerprint text,p_confirm_reviewed boolean
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare job public.account_deletion_fulfillments; custody public.account_deletion_profile_custody;
  claim_row public.ownership_claims; receipt public.account_deletion_custody_release_receipts;
  v_guitar_id uuid; actual bytea; evidence_count integer; claimant_subject uuid:=gen_random_uuid();
  v_released_at timestamptz:=clock_timestamp(); result jsonb;
begin
  if p_request_id is null or p_operation_id is null or p_claim_id is null
    or coalesce(p_expected_fingerprint,'') !~ '^[a-f0-9]{64}$' or p_confirm_reviewed is distinct from true then
    raise exception using errcode='22023',message='An exact custody claim, Profile fingerprint, and review confirmation are required.';
  end if;
  perform public._account_deletion_admin(p_admin_id,p_environment_admin);
  perform pg_advisory_xact_lock(hashtextextended('qrguitar:deletion-operation:'||p_operation_id::text,0));
  select * into receipt from public.account_deletion_custody_release_receipts where operation_id=p_operation_id;
  if found then
    if receipt.request_id<>p_request_id or receipt.claim_id<>p_claim_id
      or encode(receipt.content_fingerprint,'hex')<>p_expected_fingerprint then
      raise exception using errcode='PD409',message='This operation UUID belongs to another custody action.';end if;
    return jsonb_build_object('ok',true,'release',receipt.result);
  end if;
  if exists(select 1 from public.account_deletion_fulfillment_receipts where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_profile_review_attestations where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_retention_attestations where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_storage_content_reviews where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_custody_evidence_reviews where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_review_page_receipts where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_storage_relocations
      where finalize_operation_id=p_operation_id or complete_operation_id=p_operation_id) then
    raise exception using errcode='PD409',message='This operation UUID belongs to another deletion action.';end if;
  perform pg_advisory_xact_lock(hashtextextended('qrguitar:account-deletion:'||p_request_id::text,0));
  select c.guitar_id into v_guitar_id from public.ownership_claims c
    join public.account_deletion_profile_custody h on h.request_id=p_request_id and h.guitar_id=c.guitar_id
      and h.state='privacy_review_required'
    where c.id=p_claim_id;
  if not found then raise exception using errcode='PD404',message='This claim is not for an active custody Profile.';end if;
  perform pg_advisory_xact_lock(hashtextextended('qrguitar:profile-graph:'||v_guitar_id::text,0));
  select * into job from public.account_deletion_fulfillments where request_id=p_request_id for update;
  if not found or job.state<>'completed' then
    raise exception using errcode='PD409',message='Profile custody can be released only after account deletion completes.';end if;
  perform 1 from public.guitars where id=v_guitar_id for update;
  select * into custody from public.account_deletion_profile_custody
    where request_id=p_request_id and guitar_id=v_guitar_id for update;
  if not found or custody.state<>'privacy_review_required' then
    raise exception using errcode='PD409',message='This custody hold is no longer active.';end if;
  select * into claim_row from public.ownership_claims where id=p_claim_id and guitar_id=v_guitar_id for update;
  if not found or claim_row.status<>'admin_review' or claim_row.claimant_user_id is null
    or claim_row.current_owner_id is not null then
    raise exception using errcode='PD409',message='A pending administrator claim for the ownerless Profile is required.';end if;
  if not exists(select 1 from public.profiles where id=claim_row.claimant_user_id and account_status='active') then
    raise exception using errcode='PD409',message='The claimant account is unavailable.';end if;
  select count(*)::integer into evidence_count from public.ownership_claim_evidence where claim_id=p_claim_id;
  if evidence_count<1 then raise exception using errcode='PD409',message='At least one retained proof item is required.';end if;
  -- Evidence is checked set-wise against exact byte receipts. Inventory reads are paged separately.
  actual:=public._account_deletion_profile_fingerprint(p_request_id,v_guitar_id);
  if encode(actual,'hex')<>p_expected_fingerprint then
    raise exception using errcode='PD412',message='Profile or claim evidence changed; inspect the latest private snapshot.';end if;
  perform 1 from public.ownership_claim_evidence e where e.claim_id=p_claim_id order by e.id for update;
  perform 1 from storage.objects o where o.bucket_id='instrument-documents' and exists(
    select 1 from public.ownership_claim_evidence e where e.claim_id=p_claim_id and e.storage_path=o.name)
    order by o.name for update;
  if exists(select 1 from public.ownership_claim_evidence e
      left join storage.objects o on o.bucket_id='instrument-documents' and o.name=e.storage_path
      where e.claim_id=p_claim_id and (o.id is null or not exists(
        select 1 from public.account_deletion_custody_evidence_reviews v
        where v.request_id=p_request_id and v.claim_id=p_claim_id and v.evidence_id=e.id
          and v.guitar_id=v_guitar_id
          and v.object_path_fingerprint=sha256(convert_to(job.subject_token::text||':instrument-documents:'||e.storage_path,'UTF8'))
          and v.object_fingerprint=public._account_deletion_storage_object_fingerprint('instrument-documents',e.storage_path,job.subject_token)
          and v.object_version is not distinct from to_jsonb(o)->>'version'
          and coalesce(o.metadata->>'size','')~'^[0-9]{1,19}$' and (o.metadata->>'size')::bigint=v.byte_size
          and coalesce(o.metadata->>'mimetype',o.metadata->>'contentType') is not distinct from v.mime_type))) then
    raise exception using errcode='PD428',message='Every current private proof file must be inspected and attested before custody release.';end if;
  perform set_config('qrguitar.account_deletion_custody_release',p_request_id::text,true);
  perform public.approve_ownership_claim(p_claim_id,p_admin_id,
    'Custody released after fingerprint-bound privacy and ownership-evidence review.',true);
  update public.guitars set visibility='private',updated_at=greatest(updated_at,v_released_at)
    where id=v_guitar_id and owner_id=claim_row.claimant_user_id;
  update public.account_deletion_profile_custody set state='released',released_claim_id=p_claim_id,
    released_to=claim_row.claimant_user_id,released_by=p_admin_id,release_subject=claimant_subject,released_at=v_released_at
    where request_id=p_request_id and guitar_id=v_guitar_id;
  perform set_config('qrguitar.account_deletion_custody_release','',true);
  result:=jsonb_build_object('requestId',p_request_id,'claimId',p_claim_id,'guitarId',v_guitar_id,
    'policyVersion',1,'contentFingerprint',p_expected_fingerprint,'evidenceCount',evidence_count,
    'visibility','private','releasedAt',v_released_at);
  insert into public.account_deletion_custody_release_receipts(
    operation_id,claim_id,request_id,guitar_id,claimant_id,claimant_subject,content_fingerprint,evidence_count,reviewed_by,result)
    values(p_operation_id,p_claim_id,p_request_id,v_guitar_id,claim_row.claimant_user_id,claimant_subject,actual,evidence_count,p_admin_id,result);
  return jsonb_build_object('ok',true,'release',result);
end $$;

-- The intake migration predates fulfillment and originally took the actor lock
-- before touching the request. Storage actions use the request lock first, so
-- keep cancellation in that same global order before its UPDATE trigger removes
-- blocked fulfillment children.
create or replace function public.cancel_account_deletion_request(
  p_actor_id uuid,p_request_id uuid,p_operation_id uuid,p_expected_revision bigint
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare saved public.account_deletion_requests; receipt public.account_deletion_request_receipts;
  current_revision bigint; receipt_cutoff timestamptz; recent_operations integer;
begin
  if p_request_id is null or p_operation_id is null or p_expected_revision is null or p_expected_revision<0 then
    raise exception using errcode='22023',message='Request and operation IDs and nonnegative expected revision are required.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('qrguitar:deletion-operation:'||p_operation_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended('qrguitar:account-deletion:'||p_request_id::text,0));
  perform public._account_deletion_lock_actor(p_actor_id);
  select * into receipt from public.account_deletion_request_receipts where actor_id=p_actor_id and operation_id=p_operation_id;
  if found then
    if receipt.action<>'cancel' or receipt.request_id<>p_request_id or receipt.expected_revision<>p_expected_revision then
      raise exception using errcode='PD409',message='This operation ID belongs to a different action, request, or expected revision.';
    end if;
    return public._account_deletion_receipt_json(receipt);
  end if;
  select coalesce((select revision from public.account_deletion_actor_revisions where actor_id=p_actor_id),0) into current_revision;
  if p_expected_revision<>current_revision then
    raise exception using errcode='PD412',message='Request state changed. Read current status and confirm a new action.';
  end if;
  select * into saved from public.account_deletion_requests where id=p_request_id and actor_id=p_actor_id for update;
  if not found then raise exception using errcode='PD404',message='Account deletion request was not found.';end if;
  receipt_cutoff:=clock_timestamp()-interval '1 hour';
  select count(*) into recent_operations from (
    select 1 from public.account_deletion_request_receipts where actor_id=p_actor_id and recorded_at>=receipt_cutoff
    order by recorded_at desc limit 60) recent;
  if recent_operations >= (case when saved.status='requested' then 60 else 59 end) then
    raise exception using errcode='PD429',message='Too many new request actions. Retry this action later.';
  end if;
  if saved.status='requested' then
    update public.account_deletion_requests set status='cancelled',cancelled_at=greatest(clock_timestamp(),requested_at)
      where id=saved.id returning * into saved;
  elsif saved.status<>'cancelled' then
    raise exception using errcode='PD409',message='This request can no longer be cancelled.';
  end if;
  insert into public.account_deletion_request_receipts(actor_id,operation_id,action,request_id,expected_revision)
    values(p_actor_id,p_operation_id,'cancel',saved.id,p_expected_revision) returning * into receipt;
  insert into public.account_deletion_actor_revisions(actor_id,revision) values(p_actor_id,1)
    on conflict(actor_id) do update set revision=public.account_deletion_actor_revisions.revision+1;
  return public._account_deletion_receipt_json(receipt);
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
      if exists(select 1 from public.account_deletion_fulfillment_receipts r
          where r.request_id=old.id and r.action in ('profile_redact','unscoped_scrub')) then
        raise exception using errcode='PD409',message='Reviewed privacy redaction has already changed retained history; this request can no longer be cancelled.';
      end if;
      if exists(select 1 from public.account_deletion_storage_relocations r where r.request_id=old.id and (
          r.state<>'planned' or exists(select 1 from storage.objects o where o.bucket_id=r.bucket_id and o.name=r.destination_path))) then
        raise exception using errcode='PD409',message='Storage relocation has started; finish its verified cleanup before cancelling.';end if;
      perform set_config('qrguitar.account_deletion_request',old.id::text,true);
      delete from public.account_deletion_profile_review_attestations where request_id=old.id;
      delete from public.account_deletion_retention_attestations where request_id=old.id;
      delete from public.account_deletion_storage_content_reviews where request_id=old.id;
      delete from public.account_deletion_storage_relocations where request_id=old.id;
      delete from public.account_deletion_profile_review_scopes where request_id=old.id;
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
      case when f.request_id is null then null else public._account_deletion_admin_fulfillment_json(f) end,
      'profileReviews',case when f.request_id is null then '[]'::jsonb else public._account_deletion_profile_reviews_json(f.request_id) end,
      'retentionReviews',case when f.request_id is null then '[]'::jsonb else public._account_deletion_retention_reviews_json(f.request_id) end,
      'storageReviews',case when f.request_id is null then '[]'::jsonb else public._account_deletion_storage_reviews_json(f.request_id) end) value
    from public.account_deletion_requests r left join public.account_deletion_fulfillments f on f.request_id=r.id
    where r.status='requested' and (r.actor_id is not null or f.state='ready_for_auth_deletion' or
      (f.state='completed' and exists(select 1 from public.account_deletion_profile_custody c
        where c.request_id=f.request_id and c.state='privacy_review_required')))
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
  public._account_deletion_scrub_unscoped_personal_content(uuid,uuid,text,uuid),
  public._account_deletion_billing_personal_content(uuid,text),public._account_deletion_blockers(uuid,uuid,text,text[],boolean),
  public._account_deletion_retained_pii(uuid,uuid,text) from public,anon,authenticated,service_role;
do $private_account_deletion_helpers$
declare helper record;
begin
  for helper in select oid::regprocedure signature from pg_proc
    where pronamespace='public'::regnamespace and proname like '\_account\_deletion\_%' escape '\' loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',helper.signature);
  end loop;
end $private_account_deletion_helpers$;
revoke all on function public.prepare_account_deletion_fulfillment(uuid,boolean,uuid,uuid,text[]),
  public.complete_account_deletion_fulfillment(uuid,boolean,uuid,uuid),
  public.read_account_deletion_fulfillment(uuid,boolean,uuid),
  public.read_account_deletion_review_snapshot(uuid,boolean,uuid,text,uuid,text,text),
  public.inspect_account_deletion_review_page(uuid,boolean,uuid,uuid,text,uuid,text,text,integer),
  public.redact_account_deletion_profile_review(uuid,boolean,uuid,uuid,uuid,text,text[]),
  public.attest_account_deletion_profile_review(uuid,boolean,uuid,uuid,uuid,text,boolean),
  public.attest_account_deletion_retention_review(uuid,boolean,uuid,uuid,text,text,text,boolean),
  public.read_account_deletion_storage_review_source(uuid,boolean,uuid,uuid,text),
  public.attest_account_deletion_storage_content(uuid,boolean,uuid,uuid,uuid,text,text,bigint,text,text,boolean),
  public.read_account_deletion_custody_evidence_inventory(uuid,boolean,uuid,uuid,text,integer),
  public.read_account_deletion_custody_evidence_source(uuid,boolean,uuid,uuid,uuid,text),
  public.attest_account_deletion_custody_evidence(uuid,boolean,uuid,uuid,uuid,uuid,text,text,text,bigint,text,boolean),
  public.authorize_account_deletion_storage_relocation(uuid,boolean,uuid,uuid,uuid,text,bigint,text),
  public.finalize_account_deletion_storage_relocation(uuid,boolean,uuid,uuid,uuid,text,bigint),
  public.complete_account_deletion_storage_relocation(uuid,boolean,uuid,uuid,uuid),
  public.release_account_deletion_profile_custody(uuid,boolean,uuid,uuid,uuid,text,boolean)
  from public,anon,authenticated,service_role;
grant execute on function public.prepare_account_deletion_fulfillment(uuid,boolean,uuid,uuid,text[]),
  public.complete_account_deletion_fulfillment(uuid,boolean,uuid,uuid),
  public.read_account_deletion_fulfillment(uuid,boolean,uuid),
  public.read_account_deletion_review_snapshot(uuid,boolean,uuid,text,uuid,text,text),
  public.inspect_account_deletion_review_page(uuid,boolean,uuid,uuid,text,uuid,text,text,integer),
  public.redact_account_deletion_profile_review(uuid,boolean,uuid,uuid,uuid,text,text[]),
  public.attest_account_deletion_profile_review(uuid,boolean,uuid,uuid,uuid,text,boolean),
  public.attest_account_deletion_retention_review(uuid,boolean,uuid,uuid,text,text,text,boolean),
  public.read_account_deletion_storage_review_source(uuid,boolean,uuid,uuid,text),
  public.attest_account_deletion_storage_content(uuid,boolean,uuid,uuid,uuid,text,text,bigint,text,text,boolean),
  public.read_account_deletion_custody_evidence_inventory(uuid,boolean,uuid,uuid,text,integer),
  public.read_account_deletion_custody_evidence_source(uuid,boolean,uuid,uuid,uuid,text),
  public.attest_account_deletion_custody_evidence(uuid,boolean,uuid,uuid,uuid,uuid,text,text,text,bigint,text,boolean),
  public.authorize_account_deletion_storage_relocation(uuid,boolean,uuid,uuid,uuid,text,bigint,text),
  public.finalize_account_deletion_storage_relocation(uuid,boolean,uuid,uuid,uuid,text,bigint),
  public.complete_account_deletion_storage_relocation(uuid,boolean,uuid,uuid,uuid),
  public.release_account_deletion_profile_custody(uuid,boolean,uuid,uuid,uuid,text,boolean)
  to service_role;

notify pgrst,'reload schema';
commit;
