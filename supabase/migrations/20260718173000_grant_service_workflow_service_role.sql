-- Workflow routes authenticate users, then perform database writes through the
-- server-only service role. Keep client roles blocked by RLS and grant only the
-- server role the table privileges required by those routes.
grant select, insert, update, delete on table
  public.service_provider_profiles,
  public.service_provider_profile_access,
  public.service_submissions,
  public.service_submission_evidence,
  public.service_submission_tokens,
  public.service_submission_activity,
  public.service_submission_notifications
to service_role;
