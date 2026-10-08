begin;

create function public.read_owner_service_correction_attention(p_actor_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare result jsonb; frozen boolean;
begin
 if p_actor_id is null or not exists(select 1 from public.profiles p join auth.users u on u.id=p.id
  where p.id=p_actor_id and p.account_status='active') then
  raise exception 'An active account is required.' using errcode='42501';
 end if;
 if exists(select 1 from public.account_deletion_requests where actor_id=p_actor_id and status='requested')
  or exists(select 1 from public.account_deletion_fulfillments where actor_id=p_actor_id
   and state in ('blocked','quiescing_storage','ready_for_auth_deletion')) then
  raise exception 'Service correction review is temporarily unavailable.' using errcode='PD423';
 end if;
 with pending as (
  select s.id as submission_id,g.id as guitar_id,g.qr_code,count(*) as pending_count,min(c.submitted_at) as first_pending
  from public.service_record_corrections c
  join public.service_submissions s on s.id=c.submission_id and s.guitar_id=c.guitar_id
  join public.guitars g on g.id=s.guitar_id
  join public.guitar_timeline_events e on e.id=s.resulting_service_event_id and e.id=c.original_event_id
   and e.guitar_id=g.id and e.service_submission_id=s.id and e.source_kind='provider_submitted_owner_approved'
  where g.owner_id=p_actor_id and p_actor_id is distinct from s.provider_user_id
   and g.admin_archived_at is null and g.owner_removed_at is null and s.status='approved'
   and not exists(select 1 from public.service_record_correction_decisions d where d.correction_id=c.id)
  group by s.id,g.id,g.qr_code
 )
 select coalesce(jsonb_agg(jsonb_build_object('submissionId',p.submission_id,'qrCode',p.qr_code,
   'pendingCount',p.pending_count) order by p.first_pending,p.submission_id),'[]'::jsonb),
  coalesce(bool_or(
   exists(select 1 from public.account_deletion_profile_custody c where c.guitar_id=p.guitar_id and c.state='privacy_review_required')
   or exists(select 1 from public.account_deletion_profile_review_scopes s
    join public.account_deletion_fulfillments f on f.request_id=s.request_id where s.guitar_id=p.guitar_id and (
     f.state in ('quiescing_storage','ready_for_auth_deletion')
     or exists(select 1 from public.account_deletion_storage_relocations r where r.request_id=s.request_id
      and r.state in ('copy_authorized','deletion_authorized','references_updated'))))
  ),false) into result,frozen from pending p;
 if frozen then
  raise exception 'Service correction review is temporarily unavailable.' using errcode='PD423';
 end if;
 return result;
end;
$$;
revoke all on function public.read_owner_service_correction_attention(uuid) from public,anon,authenticated,service_role;
grant execute on function public.read_owner_service_correction_attention(uuid) to service_role;
notify pgrst,'reload schema';
commit;
