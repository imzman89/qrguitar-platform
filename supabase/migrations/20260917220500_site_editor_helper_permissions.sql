-- Keep internal site-editor helpers private when Supabase default grants exist.
begin;

revoke all on function public.assign_site_editor_version(),
  public.site_editor_changed_fields(jsonb,jsonb)
  from public,anon,authenticated,service_role;

commit;
