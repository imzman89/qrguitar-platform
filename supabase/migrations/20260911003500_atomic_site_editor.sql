-- Atomic shared editor state. Deploy before clients that send versioned mutations.
alter table public.site_content add column if not exists editor_version uuid;
update public.site_content set editor_version = gen_random_uuid()
where content_key in ('homepage','site-editor:draft') and editor_version is null;

create or replace function public.assign_site_editor_version() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.content_key in ('homepage','site-editor:draft') then
    new.editor_version := gen_random_uuid();
  end if;
  return new;
end $$;
drop trigger if exists site_content_editor_version on public.site_content;
create trigger site_content_editor_version before insert or update on public.site_content
for each row execute function public.assign_site_editor_version();

create table if not exists public.site_editor_receipts (
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  request_body jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(actor_user_id, request_id)
);
alter table public.site_editor_receipts enable row level security;
revoke all on public.site_editor_receipts from public, anon, authenticated;
grant all on public.site_editor_receipts to service_role;

create or replace function public.read_site_editor_state() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'publishedValue', (select content_value from site_content where content_key='homepage'),
    'publishedAt', coalesce((select updated_at::text from site_content where content_key='homepage'),''),
    'publishedVersion', coalesce((select editor_version::text from site_content where content_key='homepage'),''),
    'draftValue', (select content_value from site_content where content_key='site-editor:draft'),
    'draftUpdatedAt', coalesce((select updated_at::text from site_content where content_key='site-editor:draft'),''),
    'draftVersion', coalesce((select editor_version::text from site_content where content_key='site-editor:draft'),''),
    'revisionRows', coalesce((select jsonb_agg(to_jsonb(r) order by r.updated_at desc, r.content_key desc)
      from (select content_key, content_value - 'settings' as content_value, updated_at from site_content
        where content_key like 'site-editor:revision:%' order by updated_at desc, content_key desc limit 30) r), '[]'::jsonb)
  );
$$;

create or replace function public.site_editor_changed_fields(p_before jsonb, p_after jsonb) returns jsonb
language sql immutable set search_path = public as $$
  select coalesce(jsonb_agg(k order by k), '[]'::jsonb) from (
    select k from (select jsonb_object_keys(coalesce(p_before->'content','{}'::jsonb)) as k
      union select jsonb_object_keys(coalesce(p_after->'content','{}'::jsonb))) keys
      where p_before->'content'->k is distinct from p_after->'content'->k
    union select k from unnest(array['brandName','tagline','instrumentCategories','brandLogos','colors','hero','sections','seo','dashboard','composition']) k
      where p_before->k is distinct from p_after->k
  ) changes;
$$;

create or replace function public.mutate_site_editor(
  p_actor_id uuid, p_actor_email text, p_env_authorized boolean,
  p_request jsonb, p_settings jsonb, p_defaults jsonb, p_revision_value jsonb default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_action text := p_request->>'action';
  v_request_id uuid;
  v_existing public.site_editor_receipts%rowtype;
  v_state jsonb;
  v_before jsonb;
  v_settings jsonb;
  v_revision jsonb;
  v_changes jsonb;
  v_revision_id text;
  v_result jsonb;
  v_action_name text;
  v_now timestamptz := clock_timestamp();
  v_note text := left(coalesce(p_request->>'note',''), 1000);
  v_area text := left(coalesce(p_request->>'area','All content'), 200);
begin
  if p_actor_id is null or not exists(select 1 from auth.users where id=p_actor_id) then
    raise exception using errcode='QSE05', message='Authorized editor required';
  end if;
  -- The API supplies an explicit environment allowlist decision. Otherwise lock and
  -- recheck the database role/status so revoked editors cannot pass a stale API check.
  perform 1 from profiles where id=p_actor_id for share;
  if not coalesce(p_env_authorized,false) and not exists(
    select 1 from profiles where id=p_actor_id and role='admin'
      and coalesce(account_status,'active') = 'active'
  ) then raise exception using errcode='QSE05', message='Authorized editor required'; end if;
  if jsonb_typeof(p_request) <> 'object' or v_action is null
    or v_action not in ('save_draft','publish','discard_draft','restore_revision')
    or jsonb_typeof(p_request->'expectedPublishedVersion') is distinct from 'string'
    or jsonb_typeof(p_request->'expectedDraftVersion') is distinct from 'string'
    or coalesce(p_request->>'requestId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then raise exception using errcode='QSE03', message='Versioned editor request required'; end if;
  if p_request->>'expectedActorId' is distinct from p_actor_id::text then raise exception using errcode='QSE05', message='Signed-in editor changed'; end if;
  v_request_id := (p_request->>'requestId')::uuid;
  -- Also protects the absent homepage/draft cases; row locks alone cannot lock absence.
  perform pg_advisory_xact_lock(hashtextextended('qrguitar:site-editor',0));
  select * into v_existing from site_editor_receipts
    where actor_user_id=p_actor_id and request_id=v_request_id;
  if found then
    if v_existing.request_body is distinct from p_request then
      raise exception using errcode='QSE02', message='Request ID already used for another change';
    end if;
    v_state := read_site_editor_state();
    return v_existing.result || jsonb_build_object('replayed',true,'superseded',
      v_state->>'publishedVersion' is distinct from v_existing.result->'state'->>'publishedVersion'
      or v_state->>'draftVersion' is distinct from v_existing.result->'state'->>'draftVersion');
  end if;
  perform 1 from site_content where content_key in ('homepage','site-editor:draft') order by content_key for update;
  v_state := read_site_editor_state();
  if p_request->>'expectedPublishedVersion' is distinct from v_state->>'publishedVersion'
    or p_request->>'expectedDraftVersion' is distinct from v_state->>'draftVersion'
  then raise exception using errcode='QSE01', message='Editor changed in another session'; end if;
  v_before := coalesce(nullif(v_state->'publishedValue','null'::jsonb),p_defaults);
  v_settings := p_settings;
  if v_action='restore_revision' then
    select content_value into v_revision from site_content
      where content_key=p_request->>'revisionId' and content_key like 'site-editor:revision:%' for share;
    if v_revision is null or v_revision->'settings' is null then
      raise exception using errcode='QSE04', message='Revision unavailable';
    end if;
    if v_revision is distinct from p_revision_value then
      raise exception using errcode='QSE01', message='Revision changed while loading';
    end if;
  end if;
  if v_action in ('save_draft','publish','restore_revision')
    and (jsonb_typeof(v_settings) is distinct from 'object' or jsonb_typeof(v_settings->'content') is distinct from 'object') then
    raise exception using errcode='QSE03', message='Validated settings required';
  end if;
  v_changes := case when v_action='discard_draft' then '[]'::jsonb else site_editor_changed_fields(v_before,v_settings) end;
  if v_action in ('save_draft','restore_revision') then
    insert into site_content(content_key,content_value,updated_at)
    values('site-editor:draft',jsonb_build_object('settings',v_settings,
      'basePublishedAt',v_state->>'publishedAt','basePublishedVersion',v_state->>'publishedVersion',
      'updatedAt',v_now,'updatedBy',p_actor_email,'note',v_note,'area',v_area,'changedFields',v_changes),v_now)
    on conflict(content_key) do update set content_value=excluded.content_value,updated_at=excluded.updated_at;
    v_action_name := case when v_action='save_draft' then 'site_draft_saved' else 'site_revision_restored_to_draft' end;
  elsif v_action='publish' then
    v_revision_id := 'site-editor:revision:' || to_char(v_now at time zone 'UTC','YYYYMMDDHH24MISSUS') || ':' || gen_random_uuid()::text;
    insert into site_content(content_key,content_value,updated_at) values(v_revision_id,
      jsonb_build_object('settings',v_before,'publishedAt',v_state->>'publishedAt',
        'publishedBy',p_actor_email,'note',v_note,'area',v_area,'changedFields',v_changes),v_now);
    insert into site_content(content_key,content_value,updated_at) values('homepage',v_settings,v_now)
    on conflict(content_key) do update set content_value=excluded.content_value,updated_at=excluded.updated_at;
    delete from site_content where content_key='site-editor:draft';
    v_action_name := 'site_content_published';
  else
    delete from site_content where content_key='site-editor:draft';
    v_action_name := 'site_draft_discarded';
  end if;
  insert into admin_audit_events(actor_user_id,actor_email,action,target_type,target_id,reason,metadata)
    values(p_actor_id,p_actor_email,v_action_name,'site_content',
      case when v_action='publish' then 'homepage' when v_action='restore_revision' then p_request->>'revisionId' else 'site-editor:draft' end,
      v_note,jsonb_build_object('area',v_area,'changedFields',v_changes,'revisionId',v_revision_id,'requestId',v_request_id));
  v_result := jsonb_build_object('state',read_site_editor_state(),'before',v_before,'changedFields',v_changes,
    'action',v_action,'requestId',v_request_id,'replayed',false,'superseded',false);
  insert into site_editor_receipts(actor_user_id,request_id,request_body,result) values(p_actor_id,v_request_id,p_request,v_result);
  return v_result;
end $$;

revoke all on function public.assign_site_editor_version() from public,anon,authenticated;
revoke all on function public.site_editor_changed_fields(jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.read_site_editor_state() from public,anon,authenticated;
revoke all on function public.mutate_site_editor(uuid,text,boolean,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.read_site_editor_state() to service_role;
grant execute on function public.mutate_site_editor(uuid,text,boolean,jsonb,jsonb,jsonb,jsonb) to service_role;



