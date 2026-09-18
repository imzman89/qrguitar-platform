-- Durable actor-bound evidence recovery. No Storage writes, deletes or automatic completion.
begin;

alter table public.service_evidence_uploads
  add column expected_revision bigint check(expected_revision is null or expected_revision>=0),
  add column discarded_at timestamptz;
alter table public.service_evidence_uploads drop constraint service_evidence_uploads_state_check;
alter table public.service_evidence_uploads add constraint service_evidence_uploads_state_check
  check(state in ('prepared','committed','deleted','discarded'));
alter table public.service_evidence_uploads drop constraint service_evidence_uploads_check1;
alter table public.service_evidence_uploads add constraint service_evidence_uploads_check1 check(
  (state='prepared' and evidence_id is null and evidence_result is null and committed_at is null and deleted_at is null and discarded_at is null)
  or (state='discarded' and evidence_id is null and evidence_result is null and committed_at is null and deleted_at is null and discarded_at is not null and discarded_at>=prepared_at)
  or (state in ('committed','deleted') and evidence_id is not null and jsonb_typeof(evidence_result)='object'
    and evidence_result->>'id' is not null and evidence_result->>'id'=evidence_id::text and committed_at is not null
    and committed_at>=prepared_at and discarded_at is null
    and ((state='committed' and deleted_at is null) or (state='deleted' and deleted_at is not null and deleted_at>=committed_at)))
);
create index service_evidence_uploads_pending on public.service_evidence_uploads(submission_id,actor_id,prepared_at,upload_id) where state='prepared';

create table public.service_evidence_upload_scopes(
  submission_id uuid not null references public.service_submissions(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  revision bigint not null default 0 check(revision>=0),
  primary key(submission_id,actor_id)
);
create table public.service_evidence_upload_discard_receipts(
  upload_id uuid primary key,
  submission_id uuid not null references public.service_submissions(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  expected_revision bigint check(expected_revision is null or expected_revision>=0),
  discarded_at timestamptz not null default clock_timestamp()
);
create index service_evidence_upload_discards_actor on public.service_evidence_upload_discard_receipts(submission_id,actor_id,discarded_at,upload_id);
alter table public.service_evidence_upload_scopes enable row level security;
alter table public.service_evidence_upload_discard_receipts enable row level security;
revoke all on public.service_evidence_upload_scopes,public.service_evidence_upload_discard_receipts from public,anon,authenticated,service_role;
create policy service_evidence_upload_scopes_no_direct_access on public.service_evidence_upload_scopes
  as restrictive for all to public using(false) with check(false);
create policy service_evidence_upload_discards_no_direct_access on public.service_evidence_upload_discard_receipts
  as restrictive for all to public using(false) with check(false);

create or replace function public._service_evidence_upload_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if row(new.upload_id,new.submission_id,new.actor_id,new.evidence_type,new.file_name,new.mime_type,new.file_size_bytes,new.storage_path,new.prepared_at,new.expected_revision)
    is distinct from row(old.upload_id,old.submission_id,old.actor_id,old.evidence_type,old.file_name,old.mime_type,old.file_size_bytes,old.storage_path,old.prepared_at,old.expected_revision)
    or not ((old.state='prepared' and new.state in ('committed','discarded')) or (old.state='committed' and new.state='deleted'))
    or (old.state='committed' and row(new.evidence_id,new.evidence_result,new.committed_at)
      is distinct from row(old.evidence_id,old.evidence_result,old.committed_at)) then
    raise exception using errcode='42501',message='Evidence upload identity and terminal receipt are immutable.';
  end if;
  return new;
end $$;

create function public._service_evidence_upload_recovery_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if tg_table_name='service_evidence_upload_discard_receipts' then
    raise exception using errcode='42501',message='Evidence discard receipts are immutable.';
  end if;
  if row(new.submission_id,new.actor_id) is distinct from row(old.submission_id,old.actor_id)
    or old.revision=9223372036854775807 or new.revision<>old.revision+1 then
    raise exception using errcode='42501',message='Evidence recovery revision must advance exactly once.';
  end if;
  return new;
end $$;
create trigger service_evidence_upload_scope_revision before update on public.service_evidence_upload_scopes
  for each row execute function public._service_evidence_upload_recovery_guard();
create trigger service_evidence_upload_discard_identity before update on public.service_evidence_upload_discard_receipts
  for each row execute function public._service_evidence_upload_recovery_guard();

create function public._service_evidence_upload_recovery_authority(p_submission public.service_submissions,p_actor_id uuid,p_is_admin boolean) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if p_actor_id is null or not exists(select 1 from auth.users where id=p_actor_id) then
    raise exception using errcode='SE403',message='This account cannot change evidence.';
  end if;
  perform 1 from public.profiles where id=p_actor_id and account_status='active' for share;
  if not found then raise exception using errcode='SE403',message='This account cannot change evidence.';end if;
  if not coalesce(p_is_admin,false) and p_submission.provider_user_id is distinct from p_actor_id then
    raise exception using errcode='SE403',message='Only the submitting provider can change evidence.';
  end if;
end $$;

create function public._service_evidence_upload_advance(p_submission_id uuid,p_actor_id uuid) returns bigint
language plpgsql security definer set search_path=pg_catalog,public as $$
declare next_revision bigint;
begin
  insert into public.service_evidence_upload_scopes(submission_id,actor_id,revision) values(p_submission_id,p_actor_id,1)
  on conflict(submission_id,actor_id) do update set revision=service_evidence_upload_scopes.revision+1
    where service_evidence_upload_scopes.revision<9223372036854775807
  returning revision into next_revision;
  if next_revision is null then raise exception using errcode='SE503',message='Evidence recovery revision is unavailable.';end if;
  return next_revision;
end $$;

create function public._service_evidence_upload_recovery_json(p_submission_id uuid,p_actor_id uuid,p_upload_id uuid,p_active boolean,p_editable boolean) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare u public.service_evidence_uploads;d public.service_evidence_upload_discard_receipts;m jsonb;storage_state text:='not_applicable';safe_evidence jsonb;
begin
  select * into u from public.service_evidence_uploads where upload_id=p_upload_id and submission_id=p_submission_id and actor_id=p_actor_id;
  if u.upload_id is null then
    select * into d from public.service_evidence_upload_discard_receipts where upload_id=p_upload_id and submission_id=p_submission_id and actor_id=p_actor_id;
    if d.upload_id is null then return null;end if;
    return jsonb_build_object('uploadId',d.upload_id,'submissionId',d.submission_id,'actorId',d.actor_id,'expectedRevision',d.expected_revision::text,
      'state','discarded','bucket','service-evidence','storagePath',null,'metadata',null,'evidence',null,'storageState','not_applicable',
      'preparedAt',null,'committedAt',null,'deletedAt',null,'discardedAt',d.discarded_at,'canFinish',false,'canDiscard',false);
  end if;
  if u.state='prepared' then
    select metadata into m from storage.objects where bucket_id='service-evidence' and name=u.storage_path;
    if not found then storage_state:='missing';
    elsif jsonb_typeof(m->'size')='number' and m->'size'=to_jsonb(u.file_size_bytes) and m->>'mimetype'=u.mime_type then storage_state:='matching';
    else storage_state:='mismatch';end if;
  end if;
  if u.state='committed' then
    safe_evidence:=jsonb_build_object('id',u.evidence_id,'type',u.evidence_type,'fileName',u.file_name,'mimeType',u.mime_type,
      'fileSizeBytes',u.file_size_bytes,'createdAt',u.evidence_result->'created_at');
  end if;
  return jsonb_build_object('uploadId',u.upload_id,'submissionId',u.submission_id,'actorId',u.actor_id,'expectedRevision',u.expected_revision::text,
    'state',u.state,'bucket','service-evidence','storagePath',u.storage_path,
    'metadata',jsonb_build_object('evidence_type',u.evidence_type,'file_name',u.file_name,'mime_type',u.mime_type,'file_size_bytes',u.file_size_bytes),
    'evidence',safe_evidence,'storageState',storage_state,'preparedAt',u.prepared_at,'committedAt',u.committed_at,'deletedAt',u.deleted_at,
    'discardedAt',u.discarded_at,'canFinish',u.state='prepared' and p_active and p_editable and storage_state='matching',
    'canDiscard',u.state='prepared' and p_active);
end $$;

create function public.read_service_evidence_uploads(p_submission_id uuid,p_actor_id uuid,p_is_admin boolean,p_upload_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare s public.service_submissions;active boolean;editable boolean;rev bigint;pending_count bigint;pending_id uuid;latest_id uuid;
begin
  if p_submission_id is null or p_actor_id is null then raise exception using errcode='22023',message='Submission and actor are required.';end if;
  select * into s from public.service_submissions where id=p_submission_id;
  if not found then raise exception using errcode='P0002',message='Service submission was not found.';end if;
  if not exists(select 1 from auth.users where id=p_actor_id) or (not coalesce(p_is_admin,false) and s.provider_user_id is distinct from p_actor_id) then
    raise exception using errcode='SE403',message='This account cannot read these upload attempts.';
  end if;
  select account_status='active' into active from public.profiles where id=p_actor_id;
  if not found then raise exception using errcode='SE403',message='This account cannot read these upload attempts.';end if;
  editable:=coalesce(p_is_admin,false) or s.status in ('draft','changes_requested');
  select coalesce((select revision from public.service_evidence_upload_scopes where submission_id=p_submission_id and actor_id=p_actor_id),0) into rev;
  select count(*) into pending_count from public.service_evidence_uploads where submission_id=p_submission_id and actor_id=p_actor_id and state='prepared';
  select upload_id into pending_id from public.service_evidence_uploads where submission_id=p_submission_id and actor_id=p_actor_id and state='prepared' order by prepared_at,upload_id limit 1;
  select upload_id into latest_id from (
    select upload_id,prepared_at as created_at from public.service_evidence_uploads where submission_id=p_submission_id and actor_id=p_actor_id
    union all
    select d.upload_id,d.discarded_at from public.service_evidence_upload_discard_receipts d where d.submission_id=p_submission_id and d.actor_id=p_actor_id
      and not exists(select 1 from public.service_evidence_uploads u where u.upload_id=d.upload_id)
  ) attempts order by created_at desc,upload_id desc limit 1;
  return jsonb_build_object('ok',true,'protocolVersion',2,'actorId',p_actor_id,'submissionId',p_submission_id,'revision',rev::text,'pendingCount',pending_count,
    'pending',public._service_evidence_upload_recovery_json(p_submission_id,p_actor_id,pending_id,active,editable),
    'latest',public._service_evidence_upload_recovery_json(p_submission_id,p_actor_id,latest_id,active,editable),
    'requested',public._service_evidence_upload_recovery_json(p_submission_id,p_actor_id,p_upload_id,active,editable),
    'canPrepare',active and editable and pending_count=0 and rev<9223372036854775807);
end $$;

create function public.prepare_service_evidence_upload(p_submission_id uuid,p_actor_id uuid,p_is_admin boolean,p_upload_id uuid,p_evidence jsonb,p_expected_revision bigint) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare s public.service_submissions;u public.service_evidence_uploads;d public.service_evidence_upload_discard_receipts;rev bigint;file_bytes bigint;expected_path text;editable boolean;
begin
  if p_submission_id is null or p_actor_id is null or p_upload_id is null or p_expected_revision<0 then raise exception using errcode='22023',message='Valid upload identities and revision are required.';end if;
  select * into s from public.service_submissions where id=p_submission_id for update;
  if not found then raise exception using errcode='P0002',message='Service submission was not found.';end if;
  perform public._service_evidence_upload_recovery_authority(s,p_actor_id,p_is_admin);
  perform pg_advisory_xact_lock(hashtextextended('qrguitar:service-evidence-upload:'||p_upload_id::text,0));
  select * into u from public.service_evidence_uploads where upload_id=p_upload_id for update;
  select * into d from public.service_evidence_upload_discard_receipts where upload_id=p_upload_id for update;
  if d.upload_id is not null then
    if row(d.submission_id,d.actor_id,d.expected_revision) is distinct from row(p_submission_id,p_actor_id,p_expected_revision) then raise exception using errcode='PT409',message='This upload identity belongs to another intent.';end if;
    raise exception using errcode='SE410',message='This upload attempt was discarded.';
  end if;
  if jsonb_typeof(p_evidence) is distinct from 'object' or jsonb_typeof(p_evidence->'file_size_bytes') is distinct from 'number'
    or coalesce(p_evidence->>'file_size_bytes','') !~ '^[1-9][0-9]{0,7}$'
    or coalesce(p_evidence->>'evidence_type','') not in ('invoice','work_order','service_slip','before_photo','after_photo','measurement_sheet','receipt','other')
    or coalesce(p_evidence->>'mime_type','') not in ('image/jpeg','image/png','image/webp','application/pdf')
    or coalesce(p_evidence->>'file_name','') !~ '^[A-Za-z0-9_][A-Za-z0-9._-]{0,119}$'
    or p_evidence is distinct from jsonb_build_object('evidence_type',p_evidence->>'evidence_type','file_name',p_evidence->>'file_name','mime_type',p_evidence->>'mime_type','file_size_bytes',p_evidence->'file_size_bytes') then
    raise exception using errcode='22023',message='Invalid evidence metadata.';
  end if;
  file_bytes:=(p_evidence->>'file_size_bytes')::bigint;
  if file_bytes>15728640 then raise exception using errcode='22023',message='Evidence exceeds 15 MiB.';end if;
  expected_path:=p_submission_id::text||'/'||p_actor_id::text||'/direct/'||p_upload_id::text||case p_evidence->>'mime_type' when 'image/jpeg' then '.jpg' when 'image/png' then '.png' when 'image/webp' then '.webp' else '.pdf' end;
  editable:=coalesce(p_is_admin,false) or s.status in ('draft','changes_requested');
  select coalesce((select revision from public.service_evidence_upload_scopes where submission_id=p_submission_id and actor_id=p_actor_id),0) into rev;
  if u.upload_id is not null then
    if row(u.submission_id,u.actor_id,u.expected_revision,u.evidence_type,u.file_name,u.mime_type,u.file_size_bytes,u.storage_path)
      is distinct from row(p_submission_id,p_actor_id,p_expected_revision,p_evidence->>'evidence_type',p_evidence->>'file_name',p_evidence->>'mime_type',file_bytes,expected_path) then
      raise exception using errcode='PT409',message='This upload identity belongs to different evidence.';
    end if;
    if u.state='deleted' then raise exception using errcode='SE409',message='This evidence was deleted.';end if;
    if u.state='discarded' then raise exception using errcode='SE410',message='This upload attempt was discarded.';end if;
    if u.state='committed' then return jsonb_build_object('ok',true,'revision',rev::text,'receipt',public._service_evidence_upload_recovery_json(p_submission_id,p_actor_id,p_upload_id,true,editable));end if;
  end if;
  if not editable then raise exception using errcode='PT409',message='The submission is no longer editable.';end if;
  perform public._service_evidence_upload_bucket();
  if u.upload_id is null then
    if p_expected_revision is null then raise exception using errcode='22023',message='A fresh upload requires its expected revision.';end if;
    if p_expected_revision<>rev then raise exception using errcode='SE412',message='Evidence upload state changed. Read it again.';end if;
    if exists(select 1 from public.service_evidence_uploads where submission_id=p_submission_id and actor_id=p_actor_id and state='prepared') then raise exception using errcode='SE428',message='Resolve the existing unfinished upload first.';end if;
    rev:=public._service_evidence_upload_advance(p_submission_id,p_actor_id);
    insert into public.service_evidence_uploads(upload_id,submission_id,actor_id,evidence_type,file_name,mime_type,file_size_bytes,storage_path,expected_revision)
      values(p_upload_id,p_submission_id,p_actor_id,p_evidence->>'evidence_type',p_evidence->>'file_name',p_evidence->>'mime_type',file_bytes,expected_path,p_expected_revision);
  end if;
  return jsonb_build_object('ok',true,'revision',rev::text,'receipt',public._service_evidence_upload_recovery_json(p_submission_id,p_actor_id,p_upload_id,true,editable));
exception when unique_violation then raise exception using errcode='PT409',message='This upload identity belongs to existing evidence.';
end $$;

create function public.commit_service_evidence_upload(p_submission_id uuid,p_actor_id uuid,p_is_admin boolean,p_upload_id uuid,p_expected_revision bigint) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare s public.service_submissions;u public.service_evidence_uploads;d public.service_evidence_upload_discard_receipts;m jsonb;saved jsonb;rev bigint;editable boolean;
begin
  if p_submission_id is null or p_actor_id is null or p_upload_id is null or p_expected_revision<0 then raise exception using errcode='22023',message='Valid upload identities and revision are required.';end if;
  select * into s from public.service_submissions where id=p_submission_id for update;
  if not found then raise exception using errcode='P0002',message='Service submission was not found.';end if;
  perform public._service_evidence_upload_recovery_authority(s,p_actor_id,p_is_admin);
  perform pg_advisory_xact_lock(hashtextextended('qrguitar:service-evidence-upload:'||p_upload_id::text,0));
  select * into u from public.service_evidence_uploads where upload_id=p_upload_id for update;
  select * into d from public.service_evidence_upload_discard_receipts where upload_id=p_upload_id for update;
  if d.upload_id is not null then
    if row(d.submission_id,d.actor_id,d.expected_revision) is distinct from row(p_submission_id,p_actor_id,p_expected_revision) then raise exception using errcode='PT409',message='This upload identity belongs to another intent.';end if;
    raise exception using errcode='SE410',message='This upload attempt was discarded.';
  end if;
  if u.upload_id is null then raise exception using errcode='P0002',message='Evidence upload was not prepared.';end if;
  if row(u.submission_id,u.actor_id,u.expected_revision) is distinct from row(p_submission_id,p_actor_id,p_expected_revision) then raise exception using errcode='PT409',message='This upload identity belongs to another intent.';end if;
  if u.state='deleted' then raise exception using errcode='SE409',message='This evidence was deleted.';end if;
  if u.state='discarded' then raise exception using errcode='SE410',message='This upload attempt was discarded.';end if;
  editable:=coalesce(p_is_admin,false) or s.status in ('draft','changes_requested');
  select coalesce((select revision from public.service_evidence_upload_scopes where submission_id=p_submission_id and actor_id=p_actor_id),0) into rev;
  if u.state='committed' then return jsonb_build_object('ok',true,'revision',rev::text,'receipt',public._service_evidence_upload_recovery_json(p_submission_id,p_actor_id,p_upload_id,true,editable));end if;
  if not editable then raise exception using errcode='PT409',message='The submission is no longer editable.';end if;
  perform public._service_evidence_upload_bucket();
  select metadata into m from storage.objects where bucket_id='service-evidence' and name=u.storage_path for share;
  if not found then raise exception using errcode='SE404',message='The evidence file has not arrived in private Storage.';end if;
  if jsonb_typeof(m->'size') is distinct from 'number' or m->'size' is distinct from to_jsonb(u.file_size_bytes) or m->>'mimetype' is distinct from u.mime_type then raise exception using errcode='SE422',message='Stored evidence MIME type or size does not match this upload.';end if;
  saved:=public.commit_service_evidence(p_submission_id,p_actor_id,p_is_admin,'upload',jsonb_build_object('evidence_type',u.evidence_type,'file_name',u.file_name,'mime_type',u.mime_type,'file_size_bytes',u.file_size_bytes,'storage_path',u.storage_path));
  if saved->>'id' is null then raise exception using errcode='SE503',message='Evidence completion was not confirmed.';end if;
  update public.service_evidence_uploads set state='committed',evidence_id=(saved->>'id')::uuid,evidence_result=saved,committed_at=greatest(clock_timestamp(),prepared_at) where upload_id=p_upload_id;
  return jsonb_build_object('ok',true,'revision',rev::text,'receipt',public._service_evidence_upload_recovery_json(p_submission_id,p_actor_id,p_upload_id,true,editable));
exception when unique_violation then raise exception using errcode='PT409',message='This upload identity belongs to existing evidence.';
end $$;

create function public.discard_service_evidence_upload(p_submission_id uuid,p_actor_id uuid,p_is_admin boolean,p_upload_id uuid,p_expected_revision bigint) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare s public.service_submissions;u public.service_evidence_uploads;d public.service_evidence_upload_discard_receipts;rev bigint;editable boolean;discarded_time timestamptz;
begin
  if p_submission_id is null or p_actor_id is null or p_upload_id is null or p_expected_revision<0 then raise exception using errcode='22023',message='Valid upload identities and revision are required.';end if;
  select * into s from public.service_submissions where id=p_submission_id for update;
  if not found then raise exception using errcode='P0002',message='Service submission was not found.';end if;
  perform public._service_evidence_upload_recovery_authority(s,p_actor_id,p_is_admin);
  perform pg_advisory_xact_lock(hashtextextended('qrguitar:service-evidence-upload:'||p_upload_id::text,0));
  select * into u from public.service_evidence_uploads where upload_id=p_upload_id for update;
  select * into d from public.service_evidence_upload_discard_receipts where upload_id=p_upload_id for update;
  editable:=coalesce(p_is_admin,false) or s.status in ('draft','changes_requested');
  select coalesce((select revision from public.service_evidence_upload_scopes where submission_id=p_submission_id and actor_id=p_actor_id),0) into rev;
  if d.upload_id is not null then
    if row(d.submission_id,d.actor_id,d.expected_revision) is distinct from row(p_submission_id,p_actor_id,p_expected_revision) then raise exception using errcode='PT409',message='This upload identity belongs to another intent.';end if;
    return jsonb_build_object('ok',true,'revision',rev::text,'receipt',public._service_evidence_upload_recovery_json(p_submission_id,p_actor_id,p_upload_id,true,editable));
  end if;
  if u.upload_id is not null then
    if row(u.submission_id,u.actor_id,u.expected_revision) is distinct from row(p_submission_id,p_actor_id,p_expected_revision) then raise exception using errcode='PT409',message='This upload identity belongs to another intent.';end if;
    if u.state in ('committed','deleted') then return jsonb_build_object('ok',true,'revision',rev::text,'receipt',public._service_evidence_upload_recovery_json(p_submission_id,p_actor_id,p_upload_id,true,editable));end if;
    if u.state='discarded' then raise exception using errcode='SE503',message='Evidence discard receipt is unavailable.';end if;
    discarded_time:=greatest(clock_timestamp(),u.prepared_at);
    rev:=public._service_evidence_upload_advance(p_submission_id,p_actor_id);
    update public.service_evidence_uploads set state='discarded',discarded_at=discarded_time where upload_id=p_upload_id;
  else
    if p_expected_revision is null then raise exception using errcode='22023',message='An absent upload requires its original revision.';end if;
    if p_expected_revision>rev then raise exception using errcode='SE412',message='Evidence upload state changed. Read it again.';end if;
    if p_expected_revision=rev then rev:=public._service_evidence_upload_advance(p_submission_id,p_actor_id);end if;
    discarded_time:=clock_timestamp();
  end if;
  insert into public.service_evidence_upload_discard_receipts(upload_id,submission_id,actor_id,expected_revision,discarded_at) values(p_upload_id,p_submission_id,p_actor_id,p_expected_revision,discarded_time);
  return jsonb_build_object('ok',true,'revision',rev::text,'receipt',public._service_evidence_upload_recovery_json(p_submission_id,p_actor_id,p_upload_id,true,editable));
exception when unique_violation then raise exception using errcode='PT409',message='This upload identity belongs to existing evidence.';
end $$;

-- An old application cannot create/complete unfenced attempts during the cutover.
create or replace function public.prepare_service_evidence_upload(p_submission_id uuid,p_actor_id uuid,p_is_admin boolean,p_upload_id uuid,p_evidence jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
begin raise exception using errcode='SE426',message='Refresh the service editor to use recoverable evidence uploads.';end $$;
create or replace function public.commit_service_evidence_upload(p_submission_id uuid,p_actor_id uuid,p_is_admin boolean,p_upload_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
begin raise exception using errcode='SE426',message='Refresh the service editor to use recoverable evidence uploads.';end $$;

revoke all on function public._service_evidence_upload_recovery_guard(),
  public._service_evidence_upload_recovery_authority(public.service_submissions,uuid,boolean),public._service_evidence_upload_advance(uuid,uuid),
  public._service_evidence_upload_recovery_json(uuid,uuid,uuid,boolean,boolean),
  public.read_service_evidence_uploads(uuid,uuid,boolean,uuid),public.prepare_service_evidence_upload(uuid,uuid,boolean,uuid,jsonb,bigint),
  public.commit_service_evidence_upload(uuid,uuid,boolean,uuid,bigint),public.discard_service_evidence_upload(uuid,uuid,boolean,uuid,bigint)
  from public,anon,authenticated,service_role;
grant execute on function public.read_service_evidence_uploads(uuid,uuid,boolean,uuid),public.prepare_service_evidence_upload(uuid,uuid,boolean,uuid,jsonb,bigint),
  public.commit_service_evidence_upload(uuid,uuid,boolean,uuid,bigint),public.discard_service_evidence_upload(uuid,uuid,boolean,uuid,bigint) to service_role;
notify pgrst,'reload schema';
commit;
