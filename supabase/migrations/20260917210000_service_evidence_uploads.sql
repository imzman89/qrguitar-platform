-- Proposal: direct-to-Storage evidence upload receipts. No Storage writes or cleanup.
begin;

create table public.service_evidence_uploads (
  upload_id uuid primary key,
  submission_id uuid not null references public.service_submissions(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  evidence_type text not null check (evidence_type in ('invoice','work_order','service_slip','before_photo','after_photo','measurement_sheet','receipt','other')),
  file_name text not null check (char_length(file_name) between 1 and 120 and file_name ~ '^[A-Za-z0-9_][A-Za-z0-9._-]*$'),
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp','application/pdf')),
  file_size_bytes bigint not null check (file_size_bytes between 1 and 15728640),
  storage_path text not null unique,
  state text not null default 'prepared' check (state in ('prepared','committed','deleted')),
  evidence_id uuid unique,
  evidence_result jsonb,
  prepared_at timestamptz not null default clock_timestamp(),
  committed_at timestamptz,
  deleted_at timestamptz,
  check (storage_path = submission_id::text || '/' || actor_id::text || '/direct/' || upload_id::text ||
    case mime_type when 'image/jpeg' then '.jpg' when 'image/png' then '.png' when 'image/webp' then '.webp' else '.pdf' end),
  check ((state='prepared' and evidence_id is null and evidence_result is null and committed_at is null and deleted_at is null)
    or (state in ('committed','deleted') and evidence_id is not null and jsonb_typeof(evidence_result)='object'
      and evidence_result->>'id' is not null and evidence_result->>'id'=evidence_id::text and committed_at is not null and committed_at>=prepared_at
      and ((state='committed' and deleted_at is null) or (state='deleted' and deleted_at is not null and deleted_at>=committed_at))))
);
create index service_evidence_uploads_submission_actor on public.service_evidence_uploads(submission_id,actor_id,prepared_at);
comment on table public.service_evidence_uploads is
  'Private direct-upload protocol receipts. Immutable identity and original evidence result; deletion keeps a tombstone while the parent submission and Auth actor exist. No automatic object deletion or retention duration is defined.';
-- evidence_id intentionally has no FK: the original identity/result survive evidence deletion.
alter table public.service_evidence_uploads enable row level security;
revoke all on public.service_evidence_uploads from public,anon,authenticated,service_role;
create policy service_evidence_uploads_no_direct_access on public.service_evidence_uploads
  as restrictive for all to public using(false) with check(false);

create function public._service_evidence_upload_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if row(new.upload_id,new.submission_id,new.actor_id,new.evidence_type,new.file_name,new.mime_type,new.file_size_bytes,new.storage_path,new.prepared_at)
    is distinct from row(old.upload_id,old.submission_id,old.actor_id,old.evidence_type,old.file_name,old.mime_type,old.file_size_bytes,old.storage_path,old.prepared_at)
    or not ((old.state='prepared' and new.state='committed') or (old.state='committed' and new.state='deleted'))
    or (old.state='committed' and row(new.evidence_id,new.evidence_result,new.committed_at)
      is distinct from row(old.evidence_id,old.evidence_result,old.committed_at)) then
    raise exception using errcode='42501',message='Evidence upload identity and completed receipt are immutable.';
  end if;
  return new;
end $$;
create trigger service_evidence_upload_identity before update on public.service_evidence_uploads
  for each row execute function public._service_evidence_upload_guard();

create function public._service_evidence_upload_deleted() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  -- commit_service_evidence('delete') already owns the submission lock. This
  -- receipt update is in the same transaction as evidence removal and activity.
  update public.service_evidence_uploads
    set state='deleted',deleted_at=greatest(clock_timestamp(),committed_at)
    where evidence_id=old.id and submission_id=old.submission_id and state='committed';
  return old;
end $$;
create trigger service_evidence_upload_tombstone after delete on public.service_submission_evidence
  for each row execute function public._service_evidence_upload_deleted();

create function public._service_evidence_upload_authority(p_submission public.service_submissions,p_actor_id uuid,p_is_admin boolean) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if p_actor_id is null or not exists(select 1 from auth.users where id=p_actor_id) then
    raise exception using errcode='42501',message='This account cannot change evidence.';
  end if;
  perform 1 from public.profiles where id=p_actor_id and account_status='active' for share;
  if not found then
    raise exception using errcode='42501',message='This account cannot change evidence.';
  end if;
  -- Admin permission is derived by the trusted server; these RPCs are never client-callable.
  if not coalesce(p_is_admin,false) and p_submission.provider_user_id is distinct from p_actor_id then
    raise exception using errcode='42501',message='Only the submitting provider can change evidence.';
  end if;
end $$;

create function public._service_evidence_upload_bucket() returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if not exists(select 1 from storage.buckets where id='service-evidence' and public=false and file_size_limit=15728640
    and allowed_mime_types @> array['image/jpeg','image/png','image/webp','application/pdf']::text[]
    and allowed_mime_types <@ array['image/jpeg','image/png','image/webp','application/pdf']::text[]) then
    raise exception using errcode='SE503',message='Private evidence Storage configuration is unavailable.';
  end if;
end $$;

create function public._service_evidence_upload_json(p_upload public.service_evidence_uploads) returns jsonb
language sql stable set search_path=pg_catalog,public as $$
  select jsonb_build_object('ok',true,'uploadId',p_upload.upload_id,'submissionId',p_upload.submission_id,
    'actorId',p_upload.actor_id,'state',p_upload.state,'bucket','service-evidence','storagePath',p_upload.storage_path,
    'metadata',jsonb_build_object('evidence_type',p_upload.evidence_type,'file_name',p_upload.file_name,
      'mime_type',p_upload.mime_type,'file_size_bytes',p_upload.file_size_bytes),
    'evidence',p_upload.evidence_result,'preparedAt',p_upload.prepared_at,'committedAt',p_upload.committed_at,'deletedAt',p_upload.deleted_at)
$$;

create function public.prepare_service_evidence_upload(p_submission_id uuid,p_actor_id uuid,p_is_admin boolean,p_upload_id uuid,p_evidence jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  submission public.service_submissions;
  receipt public.service_evidence_uploads;
  expected_path text;
  file_bytes bigint;
begin
  if p_submission_id is null or p_actor_id is null or p_upload_id is null then
    raise exception using errcode='22023',message='Submission, actor and upload identities are required.';
  end if;
  -- Match the existing evidence mutation lock order: submission first, receipt second.
  select * into submission from public.service_submissions where id=p_submission_id for update;
  if not found then raise exception using errcode='P0002',message='Service submission was not found.';end if;
  select * into receipt from public.service_evidence_uploads where upload_id=p_upload_id for update;
  perform public._service_evidence_upload_authority(submission,p_actor_id,p_is_admin);
  if jsonb_typeof(p_evidence) is distinct from 'object'
    or jsonb_typeof(p_evidence->'file_size_bytes') is distinct from 'number'
    or coalesce(p_evidence->>'file_size_bytes','') !~ '^[1-9][0-9]{0,7}$'
    or coalesce(p_evidence->>'evidence_type','') not in ('invoice','work_order','service_slip','before_photo','after_photo','measurement_sheet','receipt','other')
    or coalesce(p_evidence->>'mime_type','') not in ('image/jpeg','image/png','image/webp','application/pdf')
    or coalesce(p_evidence->>'file_name','') !~ '^[A-Za-z0-9_][A-Za-z0-9._-]{0,119}$'
    or p_evidence is distinct from jsonb_build_object('evidence_type',p_evidence->>'evidence_type','file_name',p_evidence->>'file_name',
      'mime_type',p_evidence->>'mime_type','file_size_bytes',p_evidence->'file_size_bytes') then
    raise exception using errcode='22023',message='Invalid evidence metadata.';
  end if;
  file_bytes:=(p_evidence->>'file_size_bytes')::bigint;
  if file_bytes>15728640 then raise exception using errcode='22023',message='Evidence exceeds 15 MiB.';end if;
  expected_path:=p_submission_id::text||'/'||p_actor_id::text||'/direct/'||p_upload_id::text||
    case p_evidence->>'mime_type' when 'image/jpeg' then '.jpg' when 'image/png' then '.png' when 'image/webp' then '.webp' else '.pdf' end;
  if receipt.upload_id is not null then
    if row(receipt.submission_id,receipt.actor_id,receipt.evidence_type,receipt.file_name,receipt.mime_type,receipt.file_size_bytes,receipt.storage_path)
      is distinct from row(p_submission_id,p_actor_id,p_evidence->>'evidence_type',p_evidence->>'file_name',p_evidence->>'mime_type',file_bytes,expected_path) then
      raise exception using errcode='PT409',message='This upload identity belongs to different evidence.';
    end if;
    if receipt.state='deleted' then raise exception using errcode='SE409',message='This evidence upload was deleted.';end if;
    if receipt.state='committed' then return public._service_evidence_upload_json(receipt);end if;
  end if;
  if not coalesce(p_is_admin,false) and submission.status not in ('draft','changes_requested') then
    raise exception using errcode='PT409',message='The submission is no longer editable.';
  end if;
  perform public._service_evidence_upload_bucket();
  if receipt.upload_id is null then
    insert into public.service_evidence_uploads(upload_id,submission_id,actor_id,evidence_type,file_name,mime_type,file_size_bytes,storage_path)
      values(p_upload_id,p_submission_id,p_actor_id,p_evidence->>'evidence_type',p_evidence->>'file_name',p_evidence->>'mime_type',file_bytes,expected_path)
      returning * into receipt;
  end if;
  return public._service_evidence_upload_json(receipt);
exception when unique_violation then raise exception using errcode='PT409',message='This upload identity belongs to existing evidence.';
end $$;

create function public.commit_service_evidence_upload(p_submission_id uuid,p_actor_id uuid,p_is_admin boolean,p_upload_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  submission public.service_submissions;
  receipt public.service_evidence_uploads;
  object_metadata jsonb;
  saved jsonb;
begin
  if p_submission_id is null or p_actor_id is null or p_upload_id is null then
    raise exception using errcode='22023',message='Submission, actor and upload identities are required.';
  end if;
  select * into submission from public.service_submissions where id=p_submission_id for update;
  if not found then raise exception using errcode='P0002',message='Service submission was not found.';end if;
  select * into receipt from public.service_evidence_uploads where upload_id=p_upload_id for update;
  perform public._service_evidence_upload_authority(submission,p_actor_id,p_is_admin);
  if receipt.upload_id is null then raise exception using errcode='P0002',message='Evidence upload was not prepared.';end if;
  if receipt.submission_id is distinct from p_submission_id or receipt.actor_id is distinct from p_actor_id then
    raise exception using errcode='PT409',message='This upload identity belongs to different evidence.';
  end if;
  if receipt.state='deleted' then raise exception using errcode='SE409',message='This evidence upload was deleted.';end if;
  if receipt.state='committed' then return public._service_evidence_upload_json(receipt);end if;
  if not coalesce(p_is_admin,false) and submission.status not in ('draft','changes_requested') then
    raise exception using errcode='PT409',message='The submission is no longer editable.';
  end if;
  perform public._service_evidence_upload_bucket();
  select metadata into object_metadata from storage.objects
    where bucket_id='service-evidence' and name=receipt.storage_path for share;
  if not found then raise exception using errcode='SE404',message='The evidence file has not arrived in private Storage.';end if;
  if jsonb_typeof(object_metadata->'size') is distinct from 'number'
    or object_metadata->'size' is distinct from to_jsonb(receipt.file_size_bytes)
    or object_metadata->>'mimetype' is distinct from receipt.mime_type then
    raise exception using errcode='SE422',message='Stored evidence MIME type or size does not match this upload.';
  end if;
  saved:=public.commit_service_evidence(p_submission_id,p_actor_id,p_is_admin,'upload',jsonb_build_object(
    'evidence_type',receipt.evidence_type,'file_name',receipt.file_name,'mime_type',receipt.mime_type,
    'file_size_bytes',receipt.file_size_bytes,'storage_path',receipt.storage_path));
  if saved->>'id' is null then raise exception using errcode='SE503',message='Evidence completion was not confirmed.';end if;
  update public.service_evidence_uploads set state='committed',evidence_id=(saved->>'id')::uuid,evidence_result=saved,
    committed_at=greatest(clock_timestamp(),prepared_at) where upload_id=p_upload_id returning * into receipt;
  return public._service_evidence_upload_json(receipt);
exception when unique_violation then raise exception using errcode='PT409',message='This upload identity belongs to existing evidence.';
end $$;

revoke all on function public._service_evidence_upload_guard(),public._service_evidence_upload_deleted(),
  public._service_evidence_upload_authority(public.service_submissions,uuid,boolean),public._service_evidence_upload_bucket(),
  public._service_evidence_upload_json(public.service_evidence_uploads),
  public.prepare_service_evidence_upload(uuid,uuid,boolean,uuid,jsonb),public.commit_service_evidence_upload(uuid,uuid,boolean,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.prepare_service_evidence_upload(uuid,uuid,boolean,uuid,jsonb),
  public.commit_service_evidence_upload(uuid,uuid,boolean,uuid) to service_role;
notify pgrst,'reload schema';
commit;
