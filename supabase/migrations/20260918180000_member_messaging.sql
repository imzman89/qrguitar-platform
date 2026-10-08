-- Private member-to-member conversations backed only by existing Supabase services.
begin;

create table public.member_conversations (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  context_guitar_id uuid references public.guitars(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  last_message_at timestamptz,
  user_a_read_at timestamptz,
  user_b_read_at timestamptz,
  user_a_archived_at timestamptz,
  user_b_archived_at timestamptz,
  check (user_a::text < user_b::text),
  check (created_by in (user_a,user_b)),
  unique(user_a,user_b)
);
create index member_conversations_user_a_activity on public.member_conversations(user_a,last_message_at desc nulls last,created_at desc);
create index member_conversations_user_b_activity on public.member_conversations(user_b,last_message_at desc nulls last,created_at desc);

create table public.member_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.member_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  client_operation_id uuid not null,
  body text not null default '' check (char_length(body) <= 4000),
  created_at timestamptz not null default clock_timestamp(),
  unique(sender_id,client_operation_id)
);
create index member_messages_conversation_time on public.member_messages(conversation_id,created_at,id);
create index member_messages_sender_rate on public.member_messages(sender_id,created_at desc);

create table public.member_message_uploads (
  upload_id uuid primary key,
  conversation_id uuid not null references public.member_conversations(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  file_name text not null check (char_length(file_name) between 1 and 120 and file_name !~ '[[:cntrl:]/\\]'),
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm')),
  file_size_bytes bigint not null check (file_size_bytes between 1 and 15728640),
  storage_path text not null unique,
  state text not null default 'prepared' check (state in ('prepared','committed','discarded')),
  message_id uuid references public.member_messages(id) on delete cascade,
  prepared_at timestamptz not null default clock_timestamp(),
  committed_at timestamptz,
  discarded_at timestamptz,
  check ((state='prepared' and message_id is null and committed_at is null and discarded_at is null)
    or (state='committed' and message_id is not null and committed_at is not null and discarded_at is null)
    or (state='discarded' and message_id is null and committed_at is null and discarded_at is not null)),
  unique(actor_id,operation_id,upload_id)
);
create index member_message_uploads_operation on public.member_message_uploads(actor_id,conversation_id,operation_id,state);
create index member_message_uploads_expiry on public.member_message_uploads(state,prepared_at);

create table public.member_message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.member_messages(id) on delete cascade,
  uploader_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  mime_type text not null,
  file_size_bytes bigint not null,
  storage_path text not null unique,
  created_at timestamptz not null default clock_timestamp()
);
create index member_message_attachments_message on public.member_message_attachments(message_id,created_at,id);

create table public.member_message_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  primary key(blocker_id,blocked_id),
  check(blocker_id<>blocked_id)
);

create table public.member_message_reports (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.member_conversations(id) on delete cascade,
  message_id uuid references public.member_messages(id) on delete set null,
  reported_by uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  reason text not null check(reason in ('spam','harassment','fraud','unsafe_content','other')),
  details text not null default '' check(char_length(details)<=1000),
  status text not null default 'open' check(status in ('open','reviewed','closed')),
  created_at timestamptz not null default clock_timestamp(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null
);
create index member_message_reports_queue on public.member_message_reports(status,created_at,id);
create unique index member_message_reports_once on public.member_message_reports(reported_by,message_id) where message_id is not null;

alter table public.member_conversations enable row level security;
alter table public.member_messages enable row level security;
alter table public.member_message_uploads enable row level security;
alter table public.member_message_attachments enable row level security;
alter table public.member_message_blocks enable row level security;
alter table public.member_message_reports enable row level security;

revoke all on public.member_conversations,public.member_messages,public.member_message_uploads,
  public.member_message_attachments,public.member_message_blocks,public.member_message_reports
  from public,anon,authenticated,service_role;
grant select on public.member_conversations,public.member_messages to authenticated;
grant all on public.member_conversations,public.member_messages,public.member_message_uploads,
  public.member_message_attachments,public.member_message_blocks,public.member_message_reports to service_role;

create policy member_conversation_participant_read on public.member_conversations
  for select to authenticated using(auth.uid()=user_a or auth.uid()=user_b);
create policy member_message_participant_read on public.member_messages
  for select to authenticated using(exists(
    select 1 from public.member_conversations c
    where c.id=conversation_id and auth.uid() in (c.user_a,c.user_b)
  ));
create policy member_uploads_no_direct_access on public.member_message_uploads
  as restrictive for all to public using(false) with check(false);
create policy member_attachments_no_direct_access on public.member_message_attachments
  as restrictive for all to public using(false) with check(false);
create policy member_blocks_no_direct_access on public.member_message_blocks
  as restrictive for all to public using(false) with check(false);
create policy member_reports_no_direct_access on public.member_message_reports
  as restrictive for all to public using(false) with check(false);

do $bucket$
begin
  insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
    values('member-message-media','member-message-media',false,15728640,
      array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm']::text[])
    on conflict(id) do nothing;
  if not exists(select 1 from storage.buckets where id='member-message-media' and public=false
    and file_size_limit=15728640
    and allowed_mime_types @> array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm']::text[]
    and allowed_mime_types <@ array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm']::text[]) then
    raise exception using errcode='MM503',message='Private member media Storage configuration is unavailable.';
  end if;
end $bucket$;

drop policy if exists member_message_media_no_direct_access on storage.objects;
create policy member_message_media_no_direct_access on storage.objects
  as restrictive for all to public using(bucket_id<>'member-message-media') with check(bucket_id<>'member-message-media');

create function public._member_conversation_participant(p_conversation public.member_conversations,p_actor_id uuid) returns uuid
language sql immutable set search_path=pg_catalog,public as $$
  select case when p_conversation.user_a=p_actor_id then p_conversation.user_b
    when p_conversation.user_b=p_actor_id then p_conversation.user_a else null end
$$;

create function public._member_require_active(p_actor_id uuid) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if p_actor_id is null or not exists(select 1 from auth.users where id=p_actor_id)
    or not exists(select 1 from public.profiles where id=p_actor_id and account_status='active') then
    raise exception using errcode='MM401',message='An active signed-in account is required.';
  end if;
end $$;

create function public._member_assert_conversation(p_conversation_id uuid,p_actor_id uuid,p_require_send boolean default false)
returns public.member_conversations language plpgsql security definer set search_path=pg_catalog,public as $$
declare conversation public.member_conversations; other_id uuid;
begin
  perform public._member_require_active(p_actor_id);
  select * into conversation from public.member_conversations where id=p_conversation_id for update;
  other_id:=public._member_conversation_participant(conversation,p_actor_id);
  if conversation.id is null or other_id is null then
    raise exception using errcode='MM404',message='Conversation not found.';
  end if;
  if p_require_send then
    perform public._member_require_active(other_id);
    if exists(select 1 from public.member_message_blocks where
      (blocker_id=p_actor_id and blocked_id=other_id) or (blocker_id=other_id and blocked_id=p_actor_id)) then
      raise exception using errcode='MM403',message='Messaging is unavailable for this conversation.';
    end if;
  end if;
  return conversation;
end $$;

create function public.ensure_member_conversation(p_actor_id uuid,p_target_id uuid,p_context_guitar_id uuid default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare conversation public.member_conversations; first_id uuid; second_id uuid; created boolean:=false;
begin
  perform public._member_require_active(p_actor_id);
  perform public._member_require_active(p_target_id);
  if p_actor_id=p_target_id then raise exception using errcode='22023',message='Choose another member to message.'; end if;
  if not exists(select 1 from public.site_content s where s.content_key='public_collection_owner:'||p_target_id::text
    and s.content_value->>'enabled'='true' and s.content_value->>'allowMessages'='true'
    and nullif(btrim(s.content_value->>'publicName'),'') is not null) then
    raise exception using errcode='MM403',message='This member is not accepting messages.';
  end if;
  if p_context_guitar_id is not null and not exists(select 1 from public.guitars g where g.id=p_context_guitar_id
    and g.owner_id=p_target_id and g.visibility='public' and g.owner_removed_at is null and g.admin_archived_at is null) then
    raise exception using errcode='22023',message='The selected Profile is unavailable.';
  end if;
  if exists(select 1 from public.member_message_blocks where
    (blocker_id=p_actor_id and blocked_id=p_target_id) or (blocker_id=p_target_id and blocked_id=p_actor_id)) then
    raise exception using errcode='MM403',message='Messaging is unavailable for this member.';
  end if;
  first_id:=case when p_actor_id::text<p_target_id::text then p_actor_id else p_target_id end;
  second_id:=case when p_actor_id::text<p_target_id::text then p_target_id else p_actor_id end;
  select * into conversation from public.member_conversations where user_a=first_id and user_b=second_id for update;
  if conversation.id is null then
    if (select count(*) from public.member_conversations where created_by=p_actor_id and created_at>clock_timestamp()-interval '24 hours')>=20 then
      raise exception using errcode='MM429',message='New conversation limit reached. Try again later.';
    end if;
    insert into public.member_conversations(user_a,user_b,created_by,context_guitar_id,user_a_read_at,user_b_read_at)
      values(first_id,second_id,p_actor_id,p_context_guitar_id,
        case when first_id=p_actor_id then clock_timestamp() end,
        case when second_id=p_actor_id then clock_timestamp() end)
      on conflict(user_a,user_b) do nothing returning * into conversation;
    if conversation.id is null then
      select * into conversation from public.member_conversations where user_a=first_id and user_b=second_id for update;
    else
      created:=true;
    end if;
  elsif conversation.context_guitar_id is null and p_context_guitar_id is not null then
    update public.member_conversations set context_guitar_id=p_context_guitar_id,updated_at=greatest(clock_timestamp(),updated_at)
      where id=conversation.id returning * into conversation;
  end if;
  return jsonb_build_object('ok',true,'conversationId',conversation.id,'created',created,'contextGuitarId',conversation.context_guitar_id);
end $$;

create function public.prepare_member_message_upload(p_conversation_id uuid,p_actor_id uuid,p_operation_id uuid,p_upload_id uuid,p_file jsonb)
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

create function public.send_member_message(p_conversation_id uuid,p_actor_id uuid,p_operation_id uuid,p_body text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare conversation public.member_conversations; existing public.member_messages; saved public.member_messages;
  clean_body text:=left(btrim(replace(coalesce(p_body,''),E'\r\n',E'\n')),4000); upload_count integer; upload public.member_message_uploads; metadata jsonb; now_at timestamptz:=clock_timestamp();
begin
  if p_operation_id is null then raise exception using errcode='22023',message='A message operation is required.'; end if;
  conversation:=public._member_assert_conversation(p_conversation_id,p_actor_id,true);
  select * into existing from public.member_messages where sender_id=p_actor_id and client_operation_id=p_operation_id for update;
  if existing.id is not null then
    if existing.conversation_id is distinct from p_conversation_id or existing.body is distinct from clean_body then
      raise exception using errcode='MM409',message='This send operation belongs to another message.';
    end if;
    return jsonb_build_object('ok',true,'conversationId',existing.conversation_id,'messageId',existing.id,'createdAt',existing.created_at,'replayed',true);
  end if;
  select count(*) into upload_count from public.member_message_uploads where conversation_id=p_conversation_id and actor_id=p_actor_id
    and operation_id=p_operation_id and state='prepared';
  if clean_body='' and upload_count=0 then raise exception using errcode='22023',message='Write a message or attach media.'; end if;
  if upload_count>4 then raise exception using errcode='22023',message='A message can include up to four attachments.'; end if;
  if (select count(*) from public.member_messages where sender_id=p_actor_id and created_at>now_at-interval '1 minute')>=12
    or (select count(*) from public.member_messages where sender_id=p_actor_id and created_at>now_at-interval '1 hour')>=100 then
    raise exception using errcode='MM429',message='Message limit reached. Try again later.';
  end if;
  for upload in select * from public.member_message_uploads where conversation_id=p_conversation_id and actor_id=p_actor_id
    and operation_id=p_operation_id and state='prepared' order by prepared_at,upload_id for update loop
    select o.metadata into metadata from storage.objects o where o.bucket_id='member-message-media' and o.name=upload.storage_path for share;
    if metadata is null then raise exception using errcode='MM422',message='An attachment has not finished uploading.'; end if;
    if coalesce(metadata->>'mimetype','')<>upload.mime_type or coalesce(metadata->>'size','') !~ '^[0-9]+$'
      or (metadata->>'size')::bigint<>upload.file_size_bytes then
      raise exception using errcode='MM422',message='An attachment does not match its prepared file.';
    end if;
  end loop;
  insert into public.member_messages(conversation_id,sender_id,client_operation_id,body,created_at)
    values(p_conversation_id,p_actor_id,p_operation_id,clean_body,now_at) returning * into saved;
  for upload in select * from public.member_message_uploads where conversation_id=p_conversation_id and actor_id=p_actor_id
    and operation_id=p_operation_id and state='prepared' order by prepared_at,upload_id for update loop
    insert into public.member_message_attachments(message_id,uploader_id,file_name,mime_type,file_size_bytes,storage_path)
      values(saved.id,p_actor_id,upload.file_name,upload.mime_type,upload.file_size_bytes,upload.storage_path);
    update public.member_message_uploads set state='committed',message_id=saved.id,committed_at=now_at where upload_id=upload.upload_id;
  end loop;
  update public.member_conversations set last_message_at=now_at,updated_at=now_at,
    user_a_read_at=case when user_a=p_actor_id then now_at else user_a_read_at end,
    user_b_read_at=case when user_b=p_actor_id then now_at else user_b_read_at end,
    user_a_archived_at=case when user_a=p_actor_id then null else user_a_archived_at end,
    user_b_archived_at=case when user_b=p_actor_id then null else user_b_archived_at end
    where id=p_conversation_id;
  return jsonb_build_object('ok',true,'conversationId',saved.conversation_id,'messageId',saved.id,'createdAt',saved.created_at,'replayed',false);
end $$;

create function public.mark_member_conversation_read(p_conversation_id uuid,p_actor_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare conversation public.member_conversations; now_at timestamptz:=clock_timestamp();
begin
  conversation:=public._member_assert_conversation(p_conversation_id,p_actor_id,false);
  update public.member_conversations set
    user_a_read_at=case when user_a=p_actor_id then now_at else user_a_read_at end,
    user_b_read_at=case when user_b=p_actor_id then now_at else user_b_read_at end
    where id=p_conversation_id;
  return jsonb_build_object('ok',true,'conversationId',p_conversation_id,'readAt',now_at);
end $$;

create function public.set_member_conversation_archived(p_conversation_id uuid,p_actor_id uuid,p_archived boolean) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare conversation public.member_conversations; now_at timestamptz:=clock_timestamp();
begin
  conversation:=public._member_assert_conversation(p_conversation_id,p_actor_id,false);
  update public.member_conversations set
    user_a_archived_at=case when user_a=p_actor_id then case when p_archived then now_at end else user_a_archived_at end,
    user_b_archived_at=case when user_b=p_actor_id then case when p_archived then now_at end else user_b_archived_at end
    where id=p_conversation_id;
  return jsonb_build_object('ok',true,'conversationId',p_conversation_id,'archived',p_archived);
end $$;

create function public.set_member_message_block(p_actor_id uuid,p_target_id uuid,p_blocked boolean) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  perform public._member_require_active(p_actor_id);
  if p_target_id is null or p_target_id=p_actor_id or not exists(select 1 from auth.users where id=p_target_id) then
    raise exception using errcode='22023',message='Choose a valid member.';
  end if;
  if p_blocked then insert into public.member_message_blocks(blocker_id,blocked_id) values(p_actor_id,p_target_id) on conflict do nothing;
  else delete from public.member_message_blocks where blocker_id=p_actor_id and blocked_id=p_target_id; end if;
  return jsonb_build_object('ok',true,'blocked',p_blocked);
end $$;

create function public.report_member_message(p_conversation_id uuid,p_actor_id uuid,p_message_id uuid,p_reason text,p_details text default '') returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare conversation public.member_conversations; target_id uuid; report_id uuid;
begin
  conversation:=public._member_assert_conversation(p_conversation_id,p_actor_id,false);
  target_id:=public._member_conversation_participant(conversation,p_actor_id);
  if p_message_id is null or not exists(select 1 from public.member_messages where id=p_message_id and conversation_id=p_conversation_id and sender_id=target_id) then
    raise exception using errcode='22023',message='Choose a message from the other member.';
  end if;
  if p_reason not in ('spam','harassment','fraud','unsafe_content','other') or char_length(coalesce(p_details,''))>1000 then
    raise exception using errcode='22023',message='Choose a report reason and keep details under 1,000 characters.';
  end if;
  if (select count(*) from public.member_message_reports where reported_by=p_actor_id and created_at>clock_timestamp()-interval '24 hours')>=10 then
    raise exception using errcode='MM429',message='Report limit reached. Contact support if there is an urgent safety issue.';
  end if;
  insert into public.member_message_reports(conversation_id,message_id,reported_by,target_user_id,reason,details)
    values(p_conversation_id,p_message_id,p_actor_id,target_id,p_reason,left(btrim(coalesce(p_details,'')),1000))
    on conflict(reported_by,message_id) where message_id is not null do update set reason=excluded.reason,details=excluded.details
    returning id into report_id;
  return jsonb_build_object('ok',true,'reportId',report_id);
end $$;

revoke all on function public._member_conversation_participant(public.member_conversations,uuid),public._member_require_active(uuid),
  public._member_assert_conversation(uuid,uuid,boolean),public.ensure_member_conversation(uuid,uuid,uuid),
  public.prepare_member_message_upload(uuid,uuid,uuid,uuid,jsonb),public.send_member_message(uuid,uuid,uuid,text),
  public.mark_member_conversation_read(uuid,uuid),public.set_member_conversation_archived(uuid,uuid,boolean),
  public.set_member_message_block(uuid,uuid,boolean),public.report_member_message(uuid,uuid,uuid,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.ensure_member_conversation(uuid,uuid,uuid),public.prepare_member_message_upload(uuid,uuid,uuid,uuid,jsonb),
  public.send_member_message(uuid,uuid,uuid,text),public.mark_member_conversation_read(uuid,uuid),
  public.set_member_conversation_archived(uuid,uuid,boolean),public.set_member_message_block(uuid,uuid,boolean),
  public.report_member_message(uuid,uuid,uuid,text,text) to service_role;

do $realtime$
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime')
    and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='member_messages') then
    alter publication supabase_realtime add table public.member_messages;
  end if;
end $realtime$;

notify pgrst,'reload schema';
commit;
