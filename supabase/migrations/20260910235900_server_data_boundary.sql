-- All QRguitar data access goes through server routes, which authenticate the user
-- and apply visibility, moderation, provenance, and ownership rules before using service_role.
-- Apply after the existing schema/migrations and deploy the service-read compatibility changes first.
begin;

do $$
declare
  table_name text;
  column_name text;
begin
  foreach table_name in array array[
    'profiles', 'guitars', 'qr_redirects', 'guitar_specs', 'guitar_timeline_events',
    'guitar_media', 'guitar_documents', 'ownership_transfers', 'site_content',
    'guitar_serial_aliases', 'guitar_external_media', 'ownership_claims',
    'ownership_claim_evidence', 'ownership_claim_events', 'admin_audit_events',
    'service_provider_profiles', 'service_provider_profile_access', 'service_submissions',
    'service_submission_evidence', 'service_submission_tokens', 'service_submission_activity',
    'service_submission_notifications'
  ]
  loop
    if to_regclass(format('public.%I', table_name)) is null then
      raise exception 'Apply the required QRguitar schema before the server data boundary: missing public.%', table_name;
    end if;

    execute format('revoke all privileges on table public.%I from public, anon, authenticated', table_name);
    -- Table-level REVOKE does not remove a preexisting per-column grant.
    for column_name in
      select attname from pg_attribute
      where attrelid = to_regclass(format('public.%I', table_name)) and attnum > 0 and not attisdropped
    loop
      execute format('revoke select (%I), insert (%I), update (%I), references (%I) on public.%I from public, anon, authenticated',
        column_name, column_name, column_name, column_name, table_name);
    end loop;

    execute format('alter table public.%I enable row level security', table_name);
    -- Keep denial even if a historical setup script is mistakenly reapplied later.
    execute format('drop policy if exists qrguitar_server_api_only on public.%I', table_name);
    execute format('create policy qrguitar_server_api_only on public.%I as restrictive for all to anon, authenticated using (false) with check (false)', table_name);
    execute format('grant select, insert, update, delete on public.%I to service_role', table_name);
  end loop;
end;
$$;

-- The historical policy incorrectly treated the ordinary member role "owner" as an operator.
drop policy if exists "Admins read audit events" on public.admin_audit_events;

-- Direct old-owner folder access must not permit modifying evidence after an ownership transfer.
-- Service routes upload/download/sign files; public-file routes enforce current profile visibility.
drop policy if exists qrguitar_server_owned_files on storage.objects;
create policy qrguitar_server_owned_files
on storage.objects as restrictive for all to anon, authenticated
using (bucket_id not in ('instrument-media', 'instrument-documents', 'service-evidence'))
with check (bucket_id not in ('instrument-media', 'instrument-documents', 'service-evidence'));

-- Public buckets bypass Storage's read policies, so these existing data buckets must be private.
update storage.buckets
set public = false
where id in ('instrument-media', 'instrument-documents', 'service-evidence');

commit;
