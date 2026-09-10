-- Run after 20260910230000_atomic_instrument_create.sql.
-- Registry state is per file; Storage itself is modified only by the Storage API.
begin;
create table if not exists public.instrument_staged_uploads(
  bucket_id text not null check(bucket_id in('instrument-media','instrument-documents')),
  storage_path text not null,
  owner_id uuid not null,
  upload_id text not null,
  state text not null default 'staged' check(state in('staged','consumed','tombstoned')),
  guitar_id uuid references public.guitars(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(bucket_id,storage_path)
);
create index if not exists instrument_staged_uploads_session_idx on public.instrument_staged_uploads(owner_id,upload_id,state);
alter table public.instrument_staged_uploads enable row level security;
revoke all on public.instrument_staged_uploads from public,anon,authenticated;
grant all on public.instrument_staged_uploads to service_role;

-- Backfill only proven references as consumed. Unreferenced historical uploads
-- remain unregistered and cannot be cleaned up or consumed by a new request.
-- Keep original uploader UUID even after account deletion or ownership transfer.
with referenced as(
  select 'instrument-media'::text bucket_id,hero_image_path storage_path,id guitar_id from public.guitars where hero_image_path is not null
  union all select 'instrument-media',storage_path,guitar_id from public.guitar_media
  union all select 'instrument-documents',storage_path,guitar_id from public.guitar_documents
), matching as(
  select bucket_id,storage_path,guitar_id,
    regexp_match(storage_path,'^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/profile-uploads/([A-Za-z0-9-]{12,100})/(image|document)-[A-Za-z0-9-]+[.](jpg|jpeg|png|webp|pdf)$') parts
  from referenced
), grouped as(
  select distinct on(bucket_id,storage_path) bucket_id,storage_path,guitar_id,parts from matching
    where parts is not null and ((bucket_id='instrument-media' and parts[3]='image')or(bucket_id='instrument-documents' and parts[3]='document'))
    order by bucket_id,storage_path,guitar_id
)
insert into public.instrument_staged_uploads(bucket_id,storage_path,owner_id,upload_id,state,guitar_id)
select bucket_id,storage_path,parts[1]::uuid,parts[2],'consumed',guitar_id from grouped
on conflict(bucket_id,storage_path) do update set state='consumed',guitar_id=coalesce(public.instrument_staged_uploads.guitar_id,excluded.guitar_id),updated_at=now();

create or replace function public.register_staged_instrument_upload(p_owner_id uuid,p_upload_id text,p_bucket_id text,p_storage_path text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare prefix text;kind text;upload_row public.instrument_staged_uploads%rowtype;
begin
  kind:=case p_bucket_id when 'instrument-media' then 'image' when 'instrument-documents' then 'document' else null end;
  prefix:=p_owner_id::text||'/profile-uploads/'||p_upload_id||'/';
  if p_owner_id is null or p_upload_id is null or p_upload_id!~'^[A-Za-z0-9-]{12,100}$' or kind is null
    or p_storage_path is null or left(p_storage_path,length(prefix))<>prefix
    or substring(p_storage_path from length(prefix)+1)!~('^'||kind||'-[A-Za-z0-9-]+[.](jpg|jpeg|png|webp|pdf)$') then
    raise exception using errcode='42501',message='This staged upload does not belong to the account and session.';
  end if;
  if not exists(select 1 from auth.users where id=p_owner_id) then
    raise exception using errcode='42501',message='The upload account was not found.';
  end if;
  if exists(select 1 from public.profiles where id=p_owner_id and account_status<>'active') then
    raise exception using errcode='42501',message='This account cannot upload profile files.';
  end if;
  perform 1 from storage.objects where bucket_id=p_bucket_id and name=p_storage_path for share;
  if not found then raise exception using errcode='QG005',message='The uploaded file was not found.';end if;
  insert into public.instrument_staged_uploads(bucket_id,storage_path,owner_id,upload_id)
    values(p_bucket_id,p_storage_path,p_owner_id,p_upload_id) on conflict(bucket_id,storage_path) do nothing;
  select * into upload_row from public.instrument_staged_uploads where bucket_id=p_bucket_id and storage_path=p_storage_path for update;
  if upload_row.owner_id<>p_owner_id or upload_row.upload_id<>p_upload_id then
    raise exception using errcode='42501',message='This upload is registered to another account or session.';
  end if;
  if upload_row.state='tombstoned' then
    raise exception using errcode='QG007',message='This file was removed from the create session. Upload it again.';
  end if;
  return jsonb_build_object('ok',true,'state',upload_row.state);
end;$$;
revoke all on function public.register_staged_instrument_upload(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.register_staged_instrument_upload(uuid,text,text,text) to service_role;

create or replace function public.cleanup_staged_instrument_uploads(
  p_owner_id uuid,p_upload_id text,p_media_paths text[],p_document_paths text[]
)returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare item record;upload_row public.instrument_staged_uploads%rowtype;prefix text;kind text;
  media_to_remove jsonb:='[]';documents_to_remove jsonb:='[]';retained_count integer:=0;unregistered_count integer:=0;referenced boolean;
begin
  if p_owner_id is null or p_upload_id is null or p_upload_id!~'^[A-Za-z0-9-]{12,100}$'
    or coalesce(cardinality(p_media_paths),0)+coalesce(cardinality(p_document_paths),0)>30 then
    raise exception using errcode='22023',message='Invalid cleanup request.';
  end if;
  prefix:=p_owner_id::text||'/profile-uploads/'||p_upload_id||'/';
  -- Deterministic per-file lock order matches creation, preventing a cleanup/create
  -- interleaving from approving a deletion before a file becomes referenced.
  for item in select distinct bucket_id,storage_path from(
      select 'instrument-media'::text bucket_id,unnest(coalesce(p_media_paths,'{}'::text[])) storage_path
      union all select 'instrument-documents',unnest(coalesce(p_document_paths,'{}'::text[]))
    ) paths order by bucket_id,storage_path loop
    kind:=case item.bucket_id when 'instrument-media' then 'image' else 'document' end;
    if item.storage_path is null or left(item.storage_path,length(prefix))<>prefix
      or substring(item.storage_path from length(prefix)+1)!~('^'||kind||'-[A-Za-z0-9-]+[.](jpg|jpeg|png|webp|pdf)$') then
      raise exception using errcode='42501',message='Cleanup includes an upload from another account or session.';
    end if;
    select * into upload_row from public.instrument_staged_uploads
      where bucket_id=item.bucket_id and storage_path=item.storage_path for update;
    if not found then unregistered_count:=unregistered_count+1;continue;end if;
    if upload_row.owner_id<>p_owner_id or upload_row.upload_id<>p_upload_id then
      raise exception using errcode='42501',message='The upload registration does not match this cleanup request.';
    end if;
    referenced:=case item.bucket_id when 'instrument-media' then
      exists(select 1 from public.guitar_media where storage_path=item.storage_path)or
      exists(select 1 from public.guitars where hero_image_path=item.storage_path)
      else exists(select 1 from public.guitar_documents where storage_path=item.storage_path) end;
    if upload_row.state='consumed' or referenced then
      -- Also protect a legacy writer that created a reference after migration.
      if upload_row.state<>'consumed' then
        update public.instrument_staged_uploads set state='consumed',updated_at=clock_timestamp()
          where bucket_id=item.bucket_id and storage_path=item.storage_path;
      end if;
      retained_count:=retained_count+1;continue;
    end if;
    update public.instrument_staged_uploads set state='tombstoned',updated_at=clock_timestamp()
      where bucket_id=item.bucket_id and storage_path=item.storage_path;
    if item.bucket_id='instrument-media' then media_to_remove:=media_to_remove||jsonb_build_array(item.storage_path);
    else documents_to_remove:=documents_to_remove||jsonb_build_array(item.storage_path);end if;
  end loop;
  return jsonb_build_object('ok',true,'mediaPaths',media_to_remove,'documentPaths',documents_to_remove,
    'retainedCount',retained_count,'unregisteredCount',unregistered_count);
end;$$;
revoke all on function public.cleanup_staged_instrument_uploads(uuid,text,text[],text[]) from public,anon,authenticated;
grant execute on function public.cleanup_staged_instrument_uploads(uuid,text,text[],text[]) to service_role;

-- Preserve the tested atomic-create implementation as an internal-only routine.
-- The service role cannot bypass the registry by calling this routine directly.
do $$begin
  if to_regprocedure('public.create_instrument_profile_unregistered(uuid,text,text,jsonb,boolean,text)') is null then
    alter function public.create_instrument_profile(uuid,text,text,jsonb,boolean,text) rename to create_instrument_profile_unregistered;
  end if;
end;$$;
revoke all on function public.create_instrument_profile_unregistered(uuid,text,text,jsonb,boolean,text) from public,anon,authenticated,service_role;

create or replace function public.create_instrument_profile(
  p_owner_id uuid,p_idempotency_key text,p_upload_id text,p_payload jsonb,
  p_launch_testing_access boolean default false,p_owner_display_name text default null
)returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare item record;upload_row public.instrument_staged_uploads%rowtype;legacy jsonb;result jsonb;created_guitar_id uuid;is_referenced boolean;
begin
  if p_owner_id is null or p_idempotency_key is null or p_upload_id is null or jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception using errcode='22023',message='Invalid create request.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('qrguitar:create:'||p_owner_id::text,0));
  select content_value into legacy from public.site_content
    where content_key='create_submission:'||p_owner_id::text||':'||p_idempotency_key;
  if exists(select 1 from public.instrument_create_receipts where owner_id=p_owner_id and(idempotency_key=p_idempotency_key or upload_id=p_upload_id))
    or legacy->>'status'='complete' then
    -- Completed replays must work after legitimate file edits or transfers. The
    -- internal function still verifies the exact receipt/hash/account constraints.
    return public.create_instrument_profile_unregistered(p_owner_id,p_idempotency_key,p_upload_id,p_payload,p_launch_testing_access,p_owner_display_name);
  end if;
  if legacy is null and exists(select 1 from public.instrument_staged_uploads where owner_id=p_owner_id and upload_id=p_upload_id and state='consumed') then
    raise exception using errcode='QG003',message='This upload session is already attached to a legacy Profile and needs review.';
  end if;
  if jsonb_typeof(p_payload->'media') is distinct from 'array' or jsonb_typeof(p_payload->'documents') is distinct from 'array' then
    raise exception using errcode='22023',message='Invalid uploaded file list.';
  end if;
  for item in select bucket_id,storage_path from(
      select 'instrument-media'::text bucket_id,e->>'storage_path' storage_path from jsonb_array_elements(p_payload->'media') e
      union select 'instrument-documents',e->>'storage_path' from jsonb_array_elements(p_payload->'documents') e
    ) paths order by bucket_id,storage_path loop
    select * into upload_row from public.instrument_staged_uploads
      where bucket_id=item.bucket_id and storage_path=item.storage_path for update;
    if not found then
      if legacy->>'status'='pending' then raise exception using errcode='QG003',message='This older request contains unregistered uploads and needs review.';end if;
      raise exception using errcode='QG007',message='An upload is not registered. Upload it again before creating the Profile.';
    end if;
    if upload_row.owner_id<>p_owner_id or upload_row.upload_id<>p_upload_id then
      raise exception using errcode='42501',message='An uploaded file belongs to another account or session.';
    end if;
    if upload_row.state='tombstoned' then
      raise exception using errcode='QG007',message='A selected file was removed. Upload it again before creating the Profile.';
    end if;
    if upload_row.state='consumed' and coalesce(legacy->>'status','')<>'pending' then
      raise exception using errcode='QG007',message='An uploaded file is already reserved by an existing Profile.';
    end if;
    is_referenced:=case item.bucket_id when 'instrument-media' then
      exists(select 1 from public.guitar_media where storage_path=item.storage_path)or
      exists(select 1 from public.guitars where hero_image_path=item.storage_path)
      else exists(select 1 from public.guitar_documents where storage_path=item.storage_path) end;
    if is_referenced and coalesce(legacy->>'status','')<>'pending' then
      raise exception using errcode='QG007',message='An uploaded file is already used by an existing Profile.';
    end if;
  end loop;
  begin
    result:=public.create_instrument_profile_unregistered(p_owner_id,p_idempotency_key,p_upload_id,p_payload,p_launch_testing_access,p_owner_display_name);
  exception when sqlstate 'QG005' then
    if legacy->>'status'='pending' then
      raise exception using errcode='QG003',message='A legacy pending request has missing files and needs review.';
    end if;
    raise exception using errcode='QG007',message='A registered uploaded file is missing or invalid. Upload the selected files again.';
  end;
  select guitar_id into created_guitar_id from public.instrument_create_receipts where owner_id=p_owner_id and idempotency_key=p_idempotency_key;
  if result->>'ok' is distinct from 'true' or created_guitar_id is null then
    raise exception using errcode='QG007',message='The created Profile could not consume its registered files.';
  end if;
  for item in select bucket_id,storage_path from(
      select 'instrument-media'::text bucket_id,e->>'storage_path' storage_path from jsonb_array_elements(p_payload->'media') e
      union select 'instrument-documents',e->>'storage_path' from jsonb_array_elements(p_payload->'documents') e
    ) paths order by bucket_id,storage_path loop
    select * into upload_row from public.instrument_staged_uploads
      where bucket_id=item.bucket_id and storage_path=item.storage_path for update;
    if not found or upload_row.state='tombstoned' or
      (upload_row.state='consumed' and upload_row.guitar_id is not null and upload_row.guitar_id<>created_guitar_id) then
      raise exception using errcode='QG007',message='A registered file conflicts with another Profile.';
    end if;
    update public.instrument_staged_uploads set state='consumed',guitar_id=created_guitar_id,updated_at=clock_timestamp()
      where bucket_id=item.bucket_id and storage_path=item.storage_path;
  end loop;
  return result;
end;$$;
revoke all on function public.create_instrument_profile(uuid,text,text,jsonb,boolean,text) from public,anon,authenticated;
grant execute on function public.create_instrument_profile(uuid,text,text,jsonb,boolean,text) to service_role;
notify pgrst,'reload schema';
commit;


