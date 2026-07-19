create or replace function public.protect_service_provider_provenance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'authenticated' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op in ('UPDATE', 'DELETE')
    and old.source_kind = 'provider_submitted_owner_approved'
  then
    raise exception 'Approved provider service history cannot be changed directly.';
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    new.source_kind := 'owner_reported';
    new.provider_user_id := null;
    new.provider_display_name := null;
    new.provider_verified_at_snapshot := null;
    new.service_submission_id := null;
    new.evidence_reviewed_at := null;
    new.evidence_reviewed_by := null;

    if new.source_key like 'provider-submission:%' then
      new.source_key := null;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.protect_service_provider_provenance() from public, anon, authenticated;

drop trigger if exists protect_service_provider_provenance_trigger on public.guitar_timeline_events;
create trigger protect_service_provider_provenance_trigger
before insert or update or delete on public.guitar_timeline_events
for each row execute function public.protect_service_provider_provenance();
