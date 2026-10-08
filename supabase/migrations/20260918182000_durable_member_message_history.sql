-- Member conversations are durable business records. Participants cannot archive,
-- block, or delete the shared history through QRguitar.
begin;

update public.member_conversations
set user_a_archived_at = null,
    user_b_archived_at = null
where user_a_archived_at is not null or user_b_archived_at is not null;

delete from public.member_message_blocks;

alter table public.member_conversations
  add constraint member_conversations_durable_history_no_archive
  check (user_a_archived_at is null and user_b_archived_at is null);

alter table public.member_message_blocks
  add constraint member_message_blocks_disabled
  check (false);

revoke insert, update, delete, truncate, references, trigger
  on public.member_conversations from service_role;
revoke all on public.member_message_blocks from service_role;

drop function if exists public.set_member_conversation_archived(uuid,uuid,boolean);
drop function if exists public.set_member_message_block(uuid,uuid,boolean);

notify pgrst,'reload schema';
commit;