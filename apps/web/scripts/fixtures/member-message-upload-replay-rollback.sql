-- Exact prior function logic, only CREATE OR REPLACE for restoration.
BEGIN;
create or replace function public.prepare_member_message_upload(p_conversation_id uuid,p_actor_id uuid,p_operation_id uuid,p_upload_id uuid,p_file jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare conversation public.member_conversations; receipt public.member_message_uploads; expected_path text; extension text; file_bytes bigint;
begin
  if p_operation_id is null or p_upload_id is null or jsonb_typeof(p_file) is distinct from 'object'
    or p_file is distinct from jsonb_build_object('fileName',p_file->>'fileName','mimeType',p_file->>'mimeType','fileSizeBytes',p_file->'fileSizeBytes')
    or coalesce(p_file->>'fileName','')='' or char_length(p_file->>'fileName')>120 or p_file->>'fileName' ~ '[[:cntrl:]/\\]'
    or coalesce(p_file->>'mimeType','') not in ('image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm')
    or jsonb_typeof(p_file->'fileSizeBytes') is distinct from 'number'
    or coalesce(p_file->>'fileSizeBytes','') !~ '^[1-9][0-9]{0,7}$' then
    raise exception using errcode='22023',message='Choose a supported image or video under 15 MB.';
  end if;
  file_bytes:=(p_file->>'fileSizeBytes')::bigint;
  if file_bytes>15728640 then raise exception using errcode='22023',message='Each attachment must be 15 MB or smaller.'; end if;
  conversation:=public._member_assert_conversation(p_conversation_id,p_actor_id,true);
  if exists(select 1 from public.member_messages where sender_id=p_actor_id and client_operation_id=p_operation_id) then
    raise exception using errcode='MM409',message='This message operation has already been sent.';
  end if;
  if (select count(*) from public.member_message_uploads where actor_id=p_actor_id and conversation_id=p_conversation_id
    and operation_id=p_operation_id and state='prepared')>=4 then
    raise exception using errcode='MM429',message='A message can include up to four attachments.';
  end if;
  if (select count(*) from public.member_message_uploads where actor_id=p_actor_id and prepared_at>clock_timestamp()-interval '1 hour')>=24 then
    raise exception using errcode='MM429',message='Attachment limit reached. Try again later.';
  end if;
  extension:=case p_file->>'mimeType' when 'image/jpeg' then '.jpg' when 'image/png' then '.png' when 'image/webp' then '.webp'
    when 'image/gif' then '.gif' when 'video/mp4' then '.mp4' else '.webm' end;
  expected_path:=p_conversation_id::text||'/'||p_actor_id::text||'/'||p_operation_id::text||'/'||p_upload_id::text||extension;
  select * into receipt from public.member_message_uploads where upload_id=p_upload_id for update;
  if receipt.upload_id is not null then
    if row(receipt.conversation_id,receipt.actor_id,receipt.operation_id,receipt.file_name,receipt.mime_type,receipt.file_size_bytes,receipt.storage_path)
      is distinct from row(p_conversation_id,p_actor_id,p_operation_id,p_file->>'fileName',p_file->>'mimeType',file_bytes,expected_path) then
      raise exception using errcode='MM409',message='This upload identity belongs to another attachment.';
    end if;
    if receipt.state<>'prepared' then raise exception using errcode='MM409',message='This attachment can no longer be uploaded.'; end if;
  else
    insert into public.member_message_uploads(upload_id,conversation_id,actor_id,operation_id,file_name,mime_type,file_size_bytes,storage_path)
      values(p_upload_id,p_conversation_id,p_actor_id,p_operation_id,p_file->>'fileName',p_file->>'mimeType',file_bytes,expected_path)
      returning * into receipt;
  end if;
  return jsonb_build_object('ok',true,'uploadId',receipt.upload_id,'conversationId',receipt.conversation_id,
    'operationId',receipt.operation_id,'bucket','member-message-media','storagePath',receipt.storage_path);
end $$;
COMMIT;
