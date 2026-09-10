-- Inactive legacy pack labels do not grant unlimited public-beta creation.
-- Keep approved commercial plans and explicit server launch-test access intact.
-- No purchases, credits, existing Profiles, or trust states are modified.
begin;
do $$
declare
  target regprocedure := to_regprocedure('public.create_instrument_profile_unregistered(uuid,text,text,jsonb,boolean,text)');
  source text;
  old_predicate text := 'owner_row.plan=''single'' and not coalesce(p_launch_testing_access,false)';
  new_predicate text := 'owner_row.plan not in (''business'',''enterprise'') and not coalesce(p_launch_testing_access,false)';
begin
  if target is null then raise exception 'The staged-upload create migration is required before beta quota protection.'; end if;
  source := pg_get_functiondef(target);
  if position(old_predicate in source)>0 then
    if (length(source)-length(replace(source,old_predicate,'')))/length(old_predicate)<>1 then
      raise exception 'The create quota predicate is ambiguous; review the installed function.';
    end if;
    execute replace(source,old_predicate,new_predicate);
  elsif position(new_predicate in source)=0 then
    raise exception 'The create quota predicate has changed; review the installed function.';
  end if;
end;
$$;
revoke all on function public.create_instrument_profile_unregistered(uuid,text,text,jsonb,boolean,text) from public,anon,authenticated,service_role;
commit;
