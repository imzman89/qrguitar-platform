begin;
do $guard$
declare source text; configuration text[]; definer boolean;
begin
 select prosrc,proconfig,prosecdef into source,configuration,definer from pg_proc where oid='public.approve_service_submission(uuid,uuid,text)'::regprocedure;
 if encode(sha256(convert_to(replace(source,E'\r\n',E'\n'),'UTF8')),'hex') is distinct from '4f1d48b14d4643b1a7299ec317426107b28ccd1376430c5740d66b680e157c79' or not definer or configuration is distinct from array['search_path=public'] then
   raise exception 'Unsupported service-approval predecessor.';
 end if;
end $guard$;

create function public.confirm_service_submission(
  p_submission_id uuid,
  p_owner_user_id uuid,
  p_token_hash text,
  p_visibility text,
  p_expected_updated_at timestamp with time zone
)
returns table(service_event_id uuid, timeline_event_id uuid, already_approved boolean)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_submission public.service_submissions%rowtype;
  v_provider public.service_provider_profiles%rowtype;
  v_event_id uuid;
  v_token public.service_submission_tokens%rowtype;
  v_guitar public.guitars%rowtype;
  v_guitar_id uuid;
begin
  if p_visibility is null or p_visibility not in ('private','public') then
    raise exception 'Invalid owner sharing choice.' using errcode = '22023';
  end if;
  if not exists(select 1 from public.profiles where id=p_owner_user_id and account_status='active') then
    raise exception 'The owner account cannot confirm service work.' using errcode = '42501';
  end if;
  select guitar_id into v_guitar_id from public.service_submissions where id=p_submission_id;
  if not found then raise exception 'Service submission was not found.' using errcode = 'P0002'; end if;
  -- The instrument lock matches ownership-changing writers; the submission lock follows it.
  select * into v_guitar from public.guitars where id=v_guitar_id for update;
  if not found then raise exception 'Instrument was not found.' using errcode = 'P0002'; end if;
  select * into v_submission
  from public.service_submissions
  where id = p_submission_id
  for update;

  if not found then
    raise exception 'Service submission was not found.' using errcode = 'P0002';
  end if;

  if v_submission.guitar_id is distinct from v_guitar.id then
    raise exception 'Service review changed. Reload before confirming.' using errcode = 'PT409';
  end if;

  if v_submission.owner_user_id <> p_owner_user_id then
    raise exception 'Only the current Profile owner can approve this submission.' using errcode = '42501';
  end if;

  if v_guitar.owner_id is distinct from p_owner_user_id then
    raise exception 'Profile ownership changed. Review must be restarted.' using errcode = '42501';
  end if;

  if v_submission.provider_user_id = p_owner_user_id then
    raise exception 'A provider cannot approve service work for their own Profile.' using errcode = '42501';
  end if;

  -- A committed review is immutable; replay cannot change its sharing choice or duplicate history.
  if v_submission.status = 'approved' then
    return query select
      v_submission.resulting_service_event_id,
      v_submission.resulting_timeline_event_id,
      true;
    return;
  end if;

  if p_expected_updated_at is not null and v_submission.updated_at is distinct from p_expected_updated_at then
    raise exception 'Service review changed. Reload before confirming.' using errcode = 'PT409';
  end if;

  if p_token_hash is not null then
    select * into v_token
    from public.service_submission_tokens
    where submission_id = v_submission.id and token_hash = p_token_hash
    for update;

    if not found or v_token.consumed_at is not null or v_token.expires_at <= now() then
      insert into public.service_submission_activity(submission_id, actor_user_id, action)
      values (v_submission.id, p_owner_user_id, 'review_token_rejected');
      raise exception 'This review link is invalid, expired, or already used.' using errcode = '22023';
    end if;
  end if;

  if v_submission.status <> 'submitted' then
    raise exception 'Only a submitted request can be approved.' using errcode = '22023';
  end if;

  if v_submission.expires_at is not null and v_submission.expires_at <= now() then
    update public.service_submissions set status = 'expired', updated_at = now() where id = v_submission.id;
    raise exception 'This review request expired.' using errcode = '22023';
  end if;

  select * into v_provider from public.service_provider_profiles where user_id = v_submission.provider_user_id;

  insert into public.guitar_timeline_events (
    guitar_id, created_by_user_id, event_date, date_precision, category, event_type,
    title, description, private_notes, shop_name, is_public, source_key, source_kind,
    provider_user_id, provider_display_name, provider_verified_at_snapshot,
    service_submission_id, work_order_reference, parts_installed, setup_measurements,
    created_at, updated_at
  ) values (
    v_submission.guitar_id,
    v_submission.provider_user_id,
    v_submission.service_date,
    case when v_submission.service_date is null then 'unknown' else 'day' end,
    v_submission.service_type,
    v_submission.service_type,
    v_submission.title,
    coalesce(nullif(v_submission.recommended_public_description, ''), v_submission.work_performed),
    v_submission.private_provider_note,
    coalesce(nullif(v_provider.public_display_name, ''), nullif(v_provider.business_name, ''), 'Service provider'),
    p_visibility = 'public',
    'provider-submission:' || v_submission.id::text,
    'provider_submitted_owner_approved',
    v_submission.provider_user_id,
    coalesce(nullif(v_provider.public_display_name, ''), nullif(v_provider.business_name, ''), 'Service provider'),
    case when v_provider.verification_status = 'verified' then v_provider.verified_at else null end,
    v_submission.id,
    v_submission.work_order_reference,
    v_submission.parts_installed,
    v_submission.setup_measurements,
    now(), now()
  )
  on conflict (service_submission_id) where service_submission_id is not null
  do update set updated_at = public.guitar_timeline_events.updated_at
  returning id into v_event_id;

  update public.service_submissions set
    status = 'approved', owner_visibility_choice = p_visibility, reviewed_at = now(), approved_at = now(),
    resulting_service_event_id = v_event_id,
    resulting_timeline_event_id = v_event_id,
    updated_at = now()
  where id = v_submission.id;

  update public.service_submission_tokens set consumed_at = now()
  where submission_id = v_submission.id and consumed_at is null;

  insert into public.service_submission_activity(submission_id, actor_user_id, action, metadata)
  values (v_submission.id, p_owner_user_id, 'approved', jsonb_build_object('canonical_event_id', v_event_id));

  insert into public.service_submission_notifications(submission_id, recipient_user_id, notification_type, message)
  values (v_submission.id, v_submission.provider_user_id, 'approved', 'Your service submission was approved by the Profile owner.');

  return query select v_event_id, v_event_id, false;
end;
$$;

create or replace function public.approve_service_submission(
  p_submission_id uuid, p_owner_user_id uuid, p_token_hash text default null
) returns table(service_event_id uuid, timeline_event_id uuid, already_approved boolean)
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  -- Legacy callers also default to a private report; only the current owner route can opt in.
  return query select * from public.confirm_service_submission(p_submission_id,p_owner_user_id,p_token_hash,'private',null);
end;
$$;

revoke all on function public.confirm_service_submission(uuid,uuid,text,text,timestamp with time zone) from public,anon,authenticated;
grant execute on function public.confirm_service_submission(uuid,uuid,text,text,timestamp with time zone) to service_role;
revoke all on function public.approve_service_submission(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.approve_service_submission(uuid,uuid,text) to service_role;
notify pgrst,'reload schema';
commit;
