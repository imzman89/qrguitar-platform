begin;
create or replace function public.mutate_external_media(
  p_guitar_id uuid, p_actor_id uuid, p_is_admin boolean, p_action text, p_media_id uuid default null, p_values jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_guitar public.guitars%rowtype;
  v_media public.guitar_external_media%rowtype;
begin
  select * into v_guitar from public.guitars where id=p_guitar_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Profile was not found.'; end if;
  if p_actor_id is null or (coalesce(p_is_admin,false) is false and v_guitar.owner_id is distinct from p_actor_id)
    or exists(select 1 from public.profiles where id=p_actor_id and account_status <> 'active') then
    raise exception using errcode = '42501', message = 'Profile ownership or account access changed. Reload before editing media.';
  end if;
  if p_action = 'insert' then
    insert into public.guitar_external_media(guitar_id,provider,canonical_url,provider_id,title,caption,is_public,sort_order,created_by)
    values(p_guitar_id,p_values->>'provider',p_values->>'canonical_url',p_values->>'provider_id',p_values->>'title',coalesce(p_values->>'caption',''),coalesce((p_values->>'is_public')::boolean,false),coalesce((p_values->>'sort_order')::integer,0),p_actor_id)
    returning * into v_media;
  elsif p_action = 'update' then
    update public.guitar_external_media set
      title=case when p_values ? 'title' then p_values->>'title' else title end,
      caption=case when p_values ? 'caption' then p_values->>'caption' else caption end,
      is_public=case when p_values ? 'is_public' then (p_values->>'is_public')::boolean else is_public end,
      sort_order=case when p_values ? 'sort_order' then (p_values->>'sort_order')::integer else sort_order end
    where id=p_media_id and guitar_id=p_guitar_id returning * into v_media;
  elsif p_action = 'delete' then
    delete from public.guitar_external_media where id=p_media_id and guitar_id=p_guitar_id returning * into v_media;
  else
    raise exception using errcode = '22023', message = 'Unsupported media action.';
  end if;
  if v_media.id is null then raise exception using errcode = 'P0002', message = 'Media was not found.'; end if;
  return to_jsonb(v_media);
end;
$$;
revoke all on function public.mutate_external_media(uuid,uuid,boolean,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.mutate_external_media(uuid,uuid,boolean,text,uuid,jsonb) to service_role;
commit;
