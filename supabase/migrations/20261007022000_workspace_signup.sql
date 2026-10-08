begin;

-- Definition-only: existing accounts, settings and public handle bindings are untouched.
do $hooks$
begin
  if exists(select 1 from pg_trigger where tgrelid='auth.users'::regclass
      and not tgisinternal and (tgtype & 4)=4) then
    raise exception 'Review existing auth INSERT hooks before workspace signup installation.';
  end if;
end $hooks$;

create function public.initialize_signup_workspace()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $signup$
declare metadata jsonb:=to_jsonb(new)->'raw_user_meta_data'; workspace_type text; display_name text;
begin
  if tg_op<>'INSERT' or tg_table_schema<>'auth' or tg_table_name<>'users'
    or jsonb_typeof(metadata) is distinct from 'object'
    or jsonb_typeof(metadata->'qrguitar_workspace_type') is distinct from 'string'
    or jsonb_typeof(metadata->'display_name') is distinct from 'string' then return new; end if;
  workspace_type:=metadata->>'qrguitar_workspace_type';
  if workspace_type not in ('player','collector','shop','builder','luthier','other') then return new; end if;
  display_name:=left(btrim(regexp_replace(metadata->>'display_name','[[:space:]]+',' ','g')),80);
  if char_length(display_name)<2 then return new; end if;

  -- Workspace type is a feature preference, never a privileged role or paid entitlement.
  insert into public.profiles(id,display_name) values(new.id,display_name) on conflict(id) do nothing;
  insert into public.site_content(content_key,content_value,updated_by,updated_at)
    values('public_collection_owner:'||new.id::text,jsonb_build_object(
      'enabled',false,'handle','','publicName',display_name,'accountType',workspace_type,
      'bio','','location','','websiteUrl','','avatarUrl','','allowIndexing',true,
      'allowMessages',false,'allowWarrantyHelp',false,'warrantyHelpUrl','','ownerId',new.id),new.id,now())
    on conflict(content_key) do nothing;
  return new;
end $signup$;
revoke all on function public.initialize_signup_workspace() from public,anon,authenticated,service_role;
create trigger qrguitar_signup_workspace after insert on auth.users
  for each row execute function public.initialize_signup_workspace();

commit;
