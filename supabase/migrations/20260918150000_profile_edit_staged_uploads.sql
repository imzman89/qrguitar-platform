-- Allow Profile edits to consume direct-to-Storage uploads without routing file
-- bytes through the web function. Existing create-upload functions are unchanged.
begin;

create or replace function public.register_staged_instrument_edit_upload(
  p_owner_id uuid,
  p_upload_id text,
  p_guitar_id uuid,
  p_bucket_id text,
  p_storage_path text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  prefix text;
  kind text;
  upload_row public.instrument_staged_uploads%rowtype;
  guitar_row public.guitars%rowtype;
begin
  kind := case p_bucket_id when 'instrument-media' then 'image' when 'instrument-documents' then 'document' else null end;
  prefix := p_owner_id::text || '/' || p_guitar_id::text || '/profile-uploads/' || p_upload_id || '/';
  if p_owner_id is null or p_guitar_id is null or p_upload_id is null
     or p_upload_id !~ '^[A-Za-z0-9-]{12,80}$' or kind is null
     or p_storage_path is null or left(p_storage_path, length(prefix)) <> prefix
     or (kind = 'image' and substring(p_storage_path from length(prefix) + 1) !~ '^image-[A-Za-z0-9-]+[.](jpg|jpeg|png|webp)$')
     or (kind = 'document' and substring(p_storage_path from length(prefix) + 1) !~ '^document-[A-Za-z0-9-]+[.](jpg|jpeg|png|webp|pdf)$') then
    raise exception using errcode = '42501', message = 'This staged upload does not belong to the Profile edit session.';
  end if;

  select * into guitar_row from public.guitars where id = p_guitar_id;
  if not found or guitar_row.owner_id is distinct from p_owner_id then
    raise exception using errcode = '42501', message = 'Only the current owner can upload files to this Profile.';
  end if;
  if guitar_row.owner_removed_at is not null or guitar_row.admin_archived_at is not null
     or not exists (select 1 from public.profiles where id = p_owner_id and account_status = 'active') then
    raise exception using errcode = '42501', message = 'This account cannot upload files to this Profile.';
  end if;
  perform 1 from storage.objects where bucket_id = p_bucket_id and name = p_storage_path for share;
  if not found then raise exception using errcode = 'QG005', message = 'The uploaded file was not found.'; end if;

  insert into public.instrument_staged_uploads(bucket_id, storage_path, owner_id, upload_id)
  values(p_bucket_id, p_storage_path, p_owner_id, p_upload_id)
  on conflict(bucket_id, storage_path) do nothing;
  select * into upload_row from public.instrument_staged_uploads
  where bucket_id = p_bucket_id and storage_path = p_storage_path for update;
  if upload_row.owner_id <> p_owner_id or upload_row.upload_id <> p_upload_id then
    raise exception using errcode = '42501', message = 'This upload is registered to another account or session.';
  end if;
  if upload_row.state = 'tombstoned' then
    raise exception using errcode = 'QG007', message = 'This file was removed from the edit session. Upload it again.';
  end if;
  if upload_row.state = 'consumed' and upload_row.guitar_id is distinct from p_guitar_id then
    raise exception using errcode = 'QG007', message = 'This file already belongs to another Profile.';
  end if;
  return jsonb_build_object('ok', true, 'state', upload_row.state);
end;
$$;
revoke all on function public.register_staged_instrument_edit_upload(uuid,text,uuid,text,text) from public, anon, authenticated;
grant execute on function public.register_staged_instrument_edit_upload(uuid,text,uuid,text,text) to service_role;

create or replace function public.cleanup_staged_instrument_edit_uploads(
  p_owner_id uuid,
  p_upload_id text,
  p_guitar_id uuid,
  p_media_paths text[],
  p_document_paths text[]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  item record;
  upload_row public.instrument_staged_uploads%rowtype;
  prefix text;
  kind text;
  media_to_remove jsonb := '[]';
  documents_to_remove jsonb := '[]';
  retained_count integer := 0;
  unregistered_count integer := 0;
  referenced boolean;
begin
  if p_owner_id is null or p_guitar_id is null or p_upload_id is null
     or p_upload_id !~ '^[A-Za-z0-9-]{12,80}$'
     or coalesce(cardinality(p_media_paths), 0) + coalesce(cardinality(p_document_paths), 0) > 30 then
    raise exception using errcode = '22023', message = 'Invalid edit-upload cleanup request.';
  end if;
  prefix := p_owner_id::text || '/' || p_guitar_id::text || '/profile-uploads/' || p_upload_id || '/';
  for item in select distinct bucket_id, storage_path from (
      select 'instrument-media'::text bucket_id, unnest(coalesce(p_media_paths, '{}'::text[])) storage_path
      union all
      select 'instrument-documents', unnest(coalesce(p_document_paths, '{}'::text[]))
    ) paths order by bucket_id, storage_path loop
    kind := case item.bucket_id when 'instrument-media' then 'image' else 'document' end;
    if item.storage_path is null or left(item.storage_path, length(prefix)) <> prefix
       or (kind = 'image' and substring(item.storage_path from length(prefix) + 1) !~ '^image-[A-Za-z0-9-]+[.](jpg|jpeg|png|webp)$')
       or (kind = 'document' and substring(item.storage_path from length(prefix) + 1) !~ '^document-[A-Za-z0-9-]+[.](jpg|jpeg|png|webp|pdf)$') then
      raise exception using errcode = '42501', message = 'Cleanup includes an upload from another Profile edit session.';
    end if;
    select * into upload_row from public.instrument_staged_uploads
    where bucket_id = item.bucket_id and storage_path = item.storage_path for update;
    if not found then unregistered_count := unregistered_count + 1; continue; end if;
    if upload_row.owner_id <> p_owner_id or upload_row.upload_id <> p_upload_id then
      raise exception using errcode = '42501', message = 'The upload registration does not match this cleanup request.';
    end if;
    referenced := case item.bucket_id when 'instrument-media' then
      exists(select 1 from public.guitar_media where storage_path = item.storage_path) or
      exists(select 1 from public.guitars where hero_image_path = item.storage_path)
      else exists(select 1 from public.guitar_documents where storage_path = item.storage_path) end;
    if upload_row.state = 'consumed' or referenced then
      if upload_row.state <> 'consumed' then
        update public.instrument_staged_uploads
        set state = 'consumed', guitar_id = p_guitar_id, updated_at = clock_timestamp()
        where bucket_id = item.bucket_id and storage_path = item.storage_path;
      end if;
      retained_count := retained_count + 1;
      continue;
    end if;
    update public.instrument_staged_uploads set state = 'tombstoned', updated_at = clock_timestamp()
    where bucket_id = item.bucket_id and storage_path = item.storage_path;
    if item.bucket_id = 'instrument-media' then media_to_remove := media_to_remove || jsonb_build_array(item.storage_path);
    else documents_to_remove := documents_to_remove || jsonb_build_array(item.storage_path); end if;
  end loop;
  return jsonb_build_object('ok', true, 'mediaPaths', media_to_remove, 'documentPaths', documents_to_remove,
    'retainedCount', retained_count, 'unregisteredCount', unregistered_count);
end;
$$;
revoke all on function public.cleanup_staged_instrument_edit_uploads(uuid,text,uuid,text[],text[]) from public, anon, authenticated;
grant execute on function public.cleanup_staged_instrument_edit_uploads(uuid,text,uuid,text[],text[]) to service_role;

create or replace function public.consume_staged_instrument_edit_upload()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  profile_owner uuid;
  prefix text;
  suffix text;
  upload_id text;
  file_part text;
  expected_kind text;
  expected_bucket text;
  upload_row public.instrument_staged_uploads%rowtype;
  object_metadata jsonb;
  object_size numeric;
  object_mime text;
  expected_extension text;
begin
  select owner_id into profile_owner from public.guitars where id = new.guitar_id;
  if profile_owner is null then return new; end if;
  prefix := profile_owner::text || '/' || new.guitar_id::text || '/profile-uploads/';
  if left(new.storage_path, length(prefix)) <> prefix then return new; end if;

  suffix := substring(new.storage_path from length(prefix) + 1);
  upload_id := split_part(suffix, '/', 1);
  file_part := split_part(suffix, '/', 2);
  expected_kind := case tg_table_name when 'guitar_media' then 'image' when 'guitar_documents' then 'document' else null end;
  expected_bucket := case expected_kind when 'image' then 'instrument-media' else 'instrument-documents' end;
  if upload_id !~ '^[A-Za-z0-9-]{12,80}$' or split_part(suffix, '/', 3) <> ''
     or (expected_kind = 'image' and file_part !~ '^image-[A-Za-z0-9-]+[.](jpg|jpeg|png|webp)$')
     or (expected_kind = 'document' and file_part !~ '^document-[A-Za-z0-9-]+[.](jpg|jpeg|png|webp|pdf)$') then
    raise exception using errcode = '42501', message = 'The Profile edit upload path is invalid.';
  end if;

  select * into upload_row from public.instrument_staged_uploads
  where bucket_id = expected_bucket and storage_path = new.storage_path for update;
  if not found then raise exception using errcode = 'QG007', message = 'The Profile edit upload is not registered.'; end if;
  if upload_row.owner_id <> profile_owner or upload_row.upload_id <> upload_id then
    raise exception using errcode = '42501', message = 'The Profile edit upload belongs to another account or session.';
  end if;
  if upload_row.state <> 'staged' then
    raise exception using errcode = 'QG007', message = 'The Profile edit upload is no longer staged.';
  end if;

  select metadata into object_metadata from storage.objects
  where bucket_id = expected_bucket and name = new.storage_path for share;
  if not found or jsonb_typeof(object_metadata->'size') is distinct from 'number'
     or jsonb_typeof(object_metadata->'mimetype') is distinct from 'string' then
    raise exception using errcode = 'QG007', message = 'The Profile edit upload is missing verified Storage metadata.';
  end if;
  object_size := (object_metadata->>'size')::numeric;
  object_mime := lower(object_metadata->>'mimetype');
  expected_extension := case object_mime
    when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp'
    when 'application/pdf' then 'pdf' else '' end;
  if object_size <> trunc(object_size) or object_size < 1 or object_size > 12582912
     or expected_extension = '' or (expected_kind = 'image' and object_mime = 'application/pdf')
     or right(lower(new.storage_path), length(expected_extension) + 1) <> ('.' || expected_extension) then
    raise exception using errcode = 'QG007', message = 'The Profile edit upload metadata no longer matches its path.';
  end if;
  if expected_kind = 'document' and
     ((to_jsonb(new)->>'mime_type') is distinct from object_mime
      or nullif(to_jsonb(new)->>'file_size_bytes', '')::bigint is distinct from object_size::bigint) then
    raise exception using errcode = 'QG007', message = 'The Profile document metadata no longer matches Storage.';
  end if;

  update public.instrument_staged_uploads
  set state = 'consumed', guitar_id = new.guitar_id, updated_at = clock_timestamp()
  where bucket_id = expected_bucket and storage_path = new.storage_path;
  return new;
end;
$$;
revoke all on function public.consume_staged_instrument_edit_upload() from public, anon, authenticated, service_role;

drop trigger if exists consume_staged_instrument_edit_media on public.guitar_media;
create trigger consume_staged_instrument_edit_media
before insert on public.guitar_media
for each row execute function public.consume_staged_instrument_edit_upload();

drop trigger if exists consume_staged_instrument_edit_document on public.guitar_documents;
create trigger consume_staged_instrument_edit_document
before insert on public.guitar_documents
for each row execute function public.consume_staged_instrument_edit_upload();

notify pgrst, 'reload schema';
commit;
