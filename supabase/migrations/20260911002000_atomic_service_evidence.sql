begin;
create or replace function public.commit_service_evidence(
  p_submission_id uuid, p_actor_id uuid, p_is_admin boolean, p_action text, p_evidence jsonb
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_submission public.service_submissions%rowtype;
  v_evidence public.service_submission_evidence%rowtype;
begin
  select * into v_submission from public.service_submissions where id = p_submission_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Service submission was not found.'; end if;
  if p_actor_id is null or exists(select 1 from public.profiles where id=p_actor_id and account_status <> 'active') then
    raise exception using errcode = '42501', message = 'This account cannot make changes.';
  end if;
  if coalesce(p_is_admin,false) is false then
    if v_submission.provider_user_id <> p_actor_id then raise exception using errcode = '42501', message = 'Only the submitting provider can change evidence.'; end if;
    if v_submission.status not in ('draft','changes_requested') then raise exception using errcode = '40001', message = 'The submission changed. Reload before editing evidence.'; end if;
  end if;
  if p_action = 'upload' then
    if jsonb_typeof(p_evidence) is distinct from 'object'
      or coalesce(p_evidence->>'file_name','') = ''
      or coalesce(p_evidence->>'mime_type','') not in ('image/jpeg','image/png','image/webp','application/pdf')
      or left(coalesce(p_evidence->>'storage_path',''),char_length(p_submission_id::text || '/' || p_actor_id::text || '/')) <> p_submission_id::text || '/' || p_actor_id::text || '/' then
      raise exception using errcode = '22023', message = 'Invalid evidence metadata.';
    end if;
    insert into public.service_submission_evidence(submission_id,uploaded_by_user_id,evidence_type,file_name,mime_type,file_size_bytes,storage_path)
    values(p_submission_id,p_actor_id,coalesce(p_evidence->>'evidence_type','other'),p_evidence->>'file_name',p_evidence->>'mime_type',(p_evidence->>'file_size_bytes')::bigint,p_evidence->>'storage_path')
    returning * into v_evidence;
    insert into public.service_submission_activity(submission_id,actor_user_id,action,metadata)
    values(p_submission_id,p_actor_id,'evidence_uploaded',jsonb_build_object('evidenceId',v_evidence.id,'type',v_evidence.evidence_type));
  elsif p_action = 'delete' then
    delete from public.service_submission_evidence where id=(p_evidence->>'id')::uuid and submission_id=p_submission_id returning * into v_evidence;
    if not found then raise exception using errcode = 'P0002', message = 'Evidence was not found.'; end if;
    insert into public.service_submission_activity(submission_id,actor_user_id,action,metadata)
    values(p_submission_id,p_actor_id,'evidence_removed',jsonb_build_object('evidenceId',v_evidence.id));
  else
    raise exception using errcode = '22023', message = 'Unsupported evidence action.';
  end if;
  return to_jsonb(v_evidence);
end;
$$;
revoke all on function public.commit_service_evidence(uuid,uuid,boolean,text,jsonb) from public,anon,authenticated;
grant execute on function public.commit_service_evidence(uuid,uuid,boolean,text,jsonb) to service_role;
commit;
