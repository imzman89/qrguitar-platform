-- Account-deletion compatibility for private member conversations and media.
-- Conversations are not retained after either participant deletes an account,
-- so every attachment in those conversations is physically removed. No
-- retained message row or Storage key can preserve an Auth UUID.
begin;

-- Extend the reviewed per-identity write fence to every messaging identity
-- column. Signed upload capabilities issued before the freeze are covered by
-- the existing storage-quiescence window; complete_* rescans Storage after the
-- server removes the inventory and fails closed if any object arrived late.
do $fences$
declare item text; table_name text; columns text; trigger_name text;
begin
  foreach item in array array[
    'member_conversations:user_a,user_b,created_by',
    'member_messages:sender_id',
    'member_message_uploads:actor_id',
    'member_message_attachments:uploader_id',
    'member_message_blocks:blocker_id,blocked_id',
    'member_message_reports:reported_by,target_user_id,reviewed_by'
  ] loop
    table_name:=split_part(item,':',1); columns:=split_part(item,':',2);
    trigger_name:='account_deletion_fence_'||table_name;
    execute format('drop trigger if exists %I on public.%I',trigger_name,table_name);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public._account_deletion_write_fence(%s)',
      trigger_name,table_name,(select string_agg(quote_literal(value),',') from unnest(string_to_array(columns,',')) value));
  end loop;
end $fences$;

create or replace function public._account_deletion_external_storage_delete_allowed(p_bucket text,p_path text) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
  select p_bucket='member-message-media' and exists(
    select 1 from public.account_deletion_fulfillments f
    where f.actor_id is not null and f.state='ready_for_auth_deletion' and (
      split_part(p_path,'/',2)=f.actor_id::text
      or exists(select 1 from public.member_conversations c
        where c.id::text=split_part(p_path,'/',1) and f.actor_id in (c.user_a,c.user_b)))
  )
$$;
revoke all on function public._account_deletion_external_storage_delete_allowed(text,text)
  from public,anon,authenticated,service_role;

create function public.prepare_member_messaging_account_deletion(p_actor_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,storage as $$
declare paths jsonb;
begin
  if p_actor_id is null or not exists(
    select 1 from public.account_deletion_fulfillments
    where actor_id=p_actor_id and state='ready_for_auth_deletion'
  ) then
    raise exception using errcode='PD409',message='Account deletion is not ready for private message cleanup.';
  end if;
  select coalesce(jsonb_agg(name order by name),'[]'::jsonb) into paths
  from (
    select distinct o.name
    from storage.objects o
    where o.bucket_id='member-message-media' and (
      split_part(o.name,'/',2)=p_actor_id::text
      or exists(select 1 from public.member_conversations c
        where c.id::text=split_part(o.name,'/',1) and p_actor_id in (c.user_a,c.user_b))
    )
  ) files;
  return jsonb_build_object('ok',true,'bucket','member-message-media','paths',paths);
end $$;

create function public.complete_member_messaging_account_deletion(p_actor_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,storage as $$
declare conversation_count integer;
begin
  if p_actor_id is null or not exists(
    select 1 from public.account_deletion_fulfillments
    where actor_id=p_actor_id and state='ready_for_auth_deletion'
  ) then
    raise exception using errcode='PD409',message='Account deletion is not ready for private message cleanup.';
  end if;
  if exists(
    select 1 from storage.objects o
    where o.bucket_id='member-message-media' and (
      split_part(o.name,'/',2)=p_actor_id::text
      or exists(select 1 from public.member_conversations c
        where c.id::text=split_part(o.name,'/',1) and p_actor_id in (c.user_a,c.user_b))
    )
  ) then
    raise exception using errcode='PD409',message='Private message media has not been removed.';
  end if;

  -- Preserve unrelated safety reports while removing a departing reviewer's
  -- identity. Rebuilding the row is deliberate: the shared deletion fence
  -- rejects ordinary updates that detach a frozen actor, while DELETE remains
  -- available to privacy finalizers and the replacement row contains no
  -- reference to the departing account.
  with detached_reviews as (
    delete from public.member_message_reports r
    where r.reviewed_by=p_actor_id
      and r.reported_by is distinct from p_actor_id
      and r.target_user_id is distinct from p_actor_id
      and not exists(
        select 1 from public.member_conversations c
        where c.id=r.conversation_id and p_actor_id in (c.user_a,c.user_b)
      )
    returning r.id,r.conversation_id,r.message_id,r.reported_by,r.target_user_id,
      r.reason,r.details,r.status,r.created_at,r.reviewed_at
  )
  insert into public.member_message_reports(
    id,conversation_id,message_id,reported_by,target_user_id,reason,details,status,created_at,reviewed_at,reviewed_by
  )
  select id,conversation_id,message_id,reported_by,target_user_id,reason,details,status,created_at,reviewed_at,null::uuid
  from detached_reviews;

  delete from public.member_message_blocks where blocker_id=p_actor_id or blocked_id=p_actor_id;
  delete from public.member_conversations where user_a=p_actor_id or user_b=p_actor_id;
  get diagnostics conversation_count=row_count;
  if exists(select 1 from public.member_conversations where user_a=p_actor_id or user_b=p_actor_id)
    or exists(select 1 from public.member_message_blocks where blocker_id=p_actor_id or blocked_id=p_actor_id)
    or exists(select 1 from public.member_message_uploads where actor_id=p_actor_id)
    or exists(select 1 from public.member_message_attachments where uploader_id=p_actor_id)
    or exists(select 1 from public.member_message_reports where reported_by=p_actor_id or target_user_id=p_actor_id or reviewed_by=p_actor_id)
    or exists(select 1 from storage.objects where bucket_id='member-message-media'
      and strpos('/'||coalesce(name,'')||'/','/'||p_actor_id::text||'/')>0) then
    raise exception using errcode='PD500',message='Private message cleanup postconditions failed.';
  end if;
  return jsonb_build_object('ok',true,'removedConversations',conversation_count);
end $$;

revoke all on function public.prepare_member_messaging_account_deletion(uuid),public.complete_member_messaging_account_deletion(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.prepare_member_messaging_account_deletion(uuid),public.complete_member_messaging_account_deletion(uuid)
  to service_role;

notify pgrst,'reload schema';
commit;
