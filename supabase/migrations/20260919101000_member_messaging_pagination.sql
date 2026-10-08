-- Stable, forward-only inbox pagination for durable member conversation history.
begin;

create index if not exists member_conversations_user_a_updated_page
  on public.member_conversations(user_a,updated_at desc,id desc);
create index if not exists member_conversations_user_b_updated_page
  on public.member_conversations(user_b,updated_at desc,id desc);

commit;
