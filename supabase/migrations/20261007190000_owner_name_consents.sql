-- Apply within one transaction; reject changed current function preimages.
do $guard$ declare pin jsonb; actual text; begin
 for pin in select value from jsonb_array_elements('[{"signature":"public.approve_ownership_claim(uuid,uuid,text,boolean)","hash":"6fbe510976c53b2498d178ad73253b4a8c0f2dc1d3867c7ba298cd56e386bd11"},{"signature":"public._account_deletion_profile_graph_fence()","hash":"a378695dce51daa641341483e5224e546531b05dc654da6d2f927e3d19255412"},{"signature":"public._account_deletion_sync_profile_review_scope(uuid,uuid,text)","hash":"0517c60833d4e5f3a5843960dac48f57e79e801723c307aec6ceaa88f34f3bab"},{"signature":"public._account_deletion_profile_review_graph(uuid,uuid)","hash":"cf7a3fd1b4863249d76c0c979af7b9be09b79c7f48dd7a09e9e47cf8abfb31ff"},{"signature":"public._account_deletion_retained_pii(uuid,uuid,text)","hash":"3522551fc77b6bd4278aa49bc2cbb52098f79f180b08864fd62cd3c4b4ae21f5"},{"signature":"public.prepare_account_deletion_fulfillment(uuid,boolean,uuid,uuid,text[])","hash":"e56fb386c8ae9815293d0f4c699927ed23cdfa89493542392264f4a7d7c333a7"}]'::jsonb) loop
 select encode(sha256(convert_to(replace(pg_get_functiondef(to_regprocedure(pin->>'signature')),E'\r\n',E'\n'),'UTF8')),'hex') into actual;
 if actual is distinct from pin->>'hash' then raise exception 'Owner consent function preimage changed: %',pin->>'signature';end if;
 end loop;
end $guard$;
-- Per-event voluntary outgoing-owner attribution. No consent or claim backfill.
alter table public.ownership_claims add column approved_previous_owner_id uuid references public.profiles(id) on delete set null;
alter table public.ownership_claims add column approved_previous_owner_captured boolean not null default false;
create table public.owner_name_consents(
 event_id uuid primary key references public.guitar_timeline_events(id) on delete cascade,
 subject_user_id uuid references public.profiles(id) on delete set null,
 enabled boolean not null default false,
 public_name text,
 version bigint not null default 0 check(version>=0),
 consented_at timestamptz,
 updated_at timestamptz not null default now(),
 constraint owner_name_consent_name check(
  (enabled and subject_user_id is not null and public_name is not null and char_length(public_name) between 2 and 80
   and public_name=btrim(public_name) and public_name !~ '[[:cntrl:]]' and consented_at is not null)
  or(not enabled and public_name is null and consented_at is null))
);
alter table public.owner_name_consents enable row level security;
revoke all on public.owner_name_consents from public,anon,authenticated,service_role;
create policy qrguitar_billing_server_only on public.owner_name_consents as restrictive for all
 to anon,authenticated using(false) with check(false);
create index owner_name_consents_subject on public.owner_name_consents(subject_user_id) where subject_user_id is not null;

create function public._owner_name_subject(p_event_id uuid) returns uuid
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare e public.guitar_timeline_events%rowtype; c public.ownership_claims%rowtype;
 subject uuid; ref text; receipt_count integer; previous_text text;
begin
 select * into e from public.guitar_timeline_events where id=p_event_id;
 if e.id is null or e.is_system is distinct from true or e.event_type is distinct from 'ownership' then return null;end if;
 if e.source_key ~ '^transfer:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
  select t.from_owner_id into subject from public.ownership_transfers t
   where t.id=substr(e.source_key,10)::uuid and t.guitar_id=e.guitar_id and t.status='accepted' and t.accepted_at is not null;
 elsif e.source_key ~ '^ownership-claim:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
  select * into c from public.ownership_claims where id=substr(e.source_key,17)::uuid and guitar_id=e.guitar_id and status='approved' and decided_at is not null;
  if c.id is null then return null;end if;
  if c.approved_previous_owner_captured then subject:=c.approved_previous_owner_id;
  else
   select count(*)::integer,min(x.metadata->>'previous_owner_id') into receipt_count,previous_text
    from public.ownership_claim_events x where x.claim_id=c.id and x.action='approved';
   if receipt_count<>1 or previous_text is null or previous_text !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then return null;end if;
   subject:=previous_text::uuid;
   if c.current_owner_id is distinct from subject then return null;end if;
  end if;
 else return null;
 end if;
 if not exists(select 1 from public.profiles p where p.id=subject and p.account_status='active' and not p.hide_public_content and not exists(select 1 from public.account_deletion_fulfillments f where f.state='completed' and f.actor_fingerprint=sha256(convert_to(subject::text||':'||f.subject_token::text,'UTF8')))) then return null;end if;
 return subject;
end $$;
revoke all on function public._owner_name_subject(uuid) from public,anon,authenticated,service_role;

create function public._owner_name_item(p_event_id uuid,p_actor_id uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('eventId',e.id,'eventDate',e.event_date,'reference','Ownership event '||upper(right(e.id::text,8)),
  'enabled',coalesce(c.enabled,false),'publicName',case when c.enabled then c.public_name else null end,'version',coalesce(c.version,0)::text)
 from public.guitar_timeline_events e left join public.owner_name_consents c on c.event_id=e.id where e.id=p_event_id and (c.subject_user_id=p_actor_id or(c.subject_user_id is null and public._owner_name_subject(e.id)=p_actor_id))
$$;
revoke all on function public._owner_name_item(uuid,uuid) from public,anon,authenticated,service_role;

create function public.list_owner_name_consents(p_actor_id uuid,p_cursor uuid default null,p_limit integer default 100) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare ids uuid[]; items jsonb; more boolean;
begin
 if p_actor_id is null or p_limit is null or p_limit not between 1 and 100
  or not exists(select 1 from public.profiles p where p.id=p_actor_id and p.account_status='active' and not exists(select 1 from public.account_deletion_fulfillments f where f.state='completed' and f.actor_fingerprint=sha256(convert_to(p_actor_id::text||':'||f.subject_token::text,'UTF8')))) then
  raise exception using errcode='42501',message='Your account cannot load these preferences.';end if;
 select array_agg(x.id order by x.id) into ids from(
  select e.id from public.guitar_timeline_events e left join public.owner_name_consents c on c.event_id=e.id
   where (p_cursor is null or e.id>p_cursor) and ((public._owner_name_subject(e.id)=p_actor_id and(c.subject_user_id is null or c.subject_user_id=p_actor_id)) or c.subject_user_id=p_actor_id)
   order by e.id limit p_limit+1) x;
 ids:=coalesce(ids,'{}'::uuid[]);more:=cardinality(ids)>p_limit;ids:=ids[1:p_limit];
 select coalesce(jsonb_agg(public._owner_name_item(x.id,p_actor_id) order by x.id),'[]'::jsonb) into items from unnest(ids) x(id);
 return jsonb_build_object('ok',true,'actorId',p_actor_id,'items',items,'nextCursor',case when more then ids[cardinality(ids)] else null end);
end $$;
revoke all on function public.list_owner_name_consents(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.list_owner_name_consents(uuid,uuid,integer) to service_role;

create function public.save_owner_name_consent(p_actor_id uuid,p_event_id uuid,p_enabled boolean,p_public_name text,p_expected_version text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare subject uuid; g uuid; current_row public.owner_name_consents%rowtype; expected bigint; v bigint; name text;
begin
 if p_actor_id is null or p_event_id is null or p_enabled is null or p_expected_version is null
  or p_expected_version !~ '^(0|[1-9][0-9]{0,18})$' or(length(p_expected_version)=19 and p_expected_version>'9223372036854775807') then
  raise exception using errcode='22023',message='Reload the saved setting before making a change.';end if;
 expected:=p_expected_version::bigint;
 if p_enabled then
  if p_public_name is null or p_public_name ~ '[[:cntrl:]]' then raise exception using errcode='22023',message='Enter a public name with 2 to 80 characters.';end if;
  name:=btrim(regexp_replace(p_public_name,'[[:space:]]+',' ','g'));
  if char_length(name) not between 2 and 80 then raise exception using errcode='22023',message='Enter a public name with 2 to 80 characters.';end if;
 elsif p_public_name is not null then raise exception using errcode='22023',message='Withdrawal must clear the public name.';end if;
 if not pg_try_advisory_xact_lock(hashtextextended('qrguitar:privacy-request:'||p_actor_id::text,0)) then
  raise exception using errcode='PD423',message='Your account has a privacy change in progress. Retry the action.';end if;
 if not exists(select 1 from public.profiles where id=p_actor_id and account_status='active' and not exists(select 1 from public.account_deletion_fulfillments f where f.state='completed' and f.actor_fingerprint=sha256(convert_to(p_actor_id::text||':'||f.subject_token::text,'UTF8')))) then
  raise exception using errcode='42501',message='Your account cannot change these preferences.';end if;
 if p_enabled and(exists(select 1 from public.account_deletion_requests r where r.actor_id=p_actor_id and r.status='requested')
  or exists(select 1 from public.account_deletion_fulfillments f where f.actor_id=p_actor_id and f.state in('blocked','quiescing_storage','ready_for_auth_deletion'))) then
  raise exception using errcode='PD423',message='Name sharing is unavailable during your privacy request. Removal remains available.';end if;
 select guitar_id into g from public.guitar_timeline_events where id=p_event_id;
 if g is null then raise exception using errcode='42501',message='This ownership event is unavailable.';end if;
 if not pg_try_advisory_xact_lock(hashtextextended('qrguitar:profile-graph:'||g::text,0)) then
  raise exception using errcode='PD423',message='This Profile has a privacy review in progress. Retry the action.';end if;
 perform pg_advisory_xact_lock(hashtextextended('qrguitar:owner-consent:'||p_event_id::text,0));
 subject:=public._owner_name_subject(p_event_id);
 select * into current_row from public.owner_name_consents where event_id=p_event_id for update;
 if current_row.subject_user_id is not null and current_row.subject_user_id<>p_actor_id then
  raise exception using errcode='42501',message='This saved preference cannot be changed by this account.';end if;
 if p_enabled then
  if subject is distinct from p_actor_id then raise exception using errcode='42501',message='Only the outgoing owner can share a name for this event.';end if;
 else
  if subject is distinct from p_actor_id and current_row.subject_user_id is distinct from p_actor_id then
   raise exception using errcode='42501',message='Only your own saved name can be removed.';end if;
 end if;
 v:=coalesce(current_row.version,0);
 if p_enabled and expected<>v then raise exception using errcode='PT409',message='This saved setting changed. Reload before sharing a name.';end if;
 if v>=9223372036854775807 then raise exception using errcode='22023',message='This saved setting needs support review.';end if;
 -- A first withdrawal creates a nameless, unassociated tombstone. It prevents a delayed version-zero grant.
 if current_row.event_id is not null then
  update public.owner_name_consents set subject_user_id=case when p_enabled then p_actor_id else subject_user_id end,
   enabled=p_enabled,public_name=name,version=v+1,consented_at=case when p_enabled then clock_timestamp() else null end,updated_at=clock_timestamp() where event_id=p_event_id;
 else
  insert into public.owner_name_consents(event_id,subject_user_id,enabled,public_name,version,consented_at,updated_at)
  values(p_event_id,case when p_enabled then p_actor_id else null end,p_enabled,name,v+1,case when p_enabled then clock_timestamp() else null end,clock_timestamp());
 end if;
 return jsonb_build_object('ok',true,'actorId',p_actor_id,'item',public._owner_name_item(p_event_id,p_actor_id));
end $$;
revoke all on function public.save_owner_name_consent(uuid,uuid,boolean,text,text) from public,anon,authenticated;
grant execute on function public.save_owner_name_consent(uuid,uuid,boolean,text,text) to service_role;

create function public.read_public_owner_names(p_event_ids uuid[],p_allow_unlisted boolean default false) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select coalesce(jsonb_agg(jsonb_build_object('eventId',e.id,'publicName',c.public_name) order by e.id),'[]'::jsonb)
 from public.guitar_timeline_events e join public.guitars g on g.id=e.guitar_id
 join public.owner_name_consents c on c.event_id=e.id
 left join public.profiles owner_profile on owner_profile.id=g.owner_id
 where cardinality(p_event_ids)<=500 and e.id=any(p_event_ids) and e.is_public and e.is_system and e.event_type='ownership'
  and g.admin_archived_at is null and g.owner_removed_at is null
  and upper(btrim(g.qr_code)) not in('QRG-PI260001','QRG-0001')
  and(g.visibility='public' or(coalesce(p_allow_unlisted,false) and g.visibility='unlisted'))
  and(g.owner_id is null or(owner_profile.account_status='active' and not owner_profile.hide_public_content))
  and c.enabled and c.public_name is not null and c.subject_user_id=public._owner_name_subject(e.id)
$$;
revoke all on function public.read_public_owner_names(uuid[],boolean) from public,anon,authenticated;
grant execute on function public.read_public_owner_names(uuid[],boolean) to service_role;

create trigger account_deletion_fence_owner_name_consents before insert or update or delete on public.owner_name_consents
 for each row execute function public._account_deletion_write_fence('subject_user_id');
create trigger account_deletion_graph_owner_name_consents before insert or update or delete on public.owner_name_consents
 for each row execute function public._account_deletion_profile_graph_fence();
create trigger account_deletion_fence_claim_previous_owner before insert or update or delete on public.ownership_claims
 for each row execute function public._account_deletion_write_fence('approved_previous_owner_id');

create function public._owner_claim_provenance_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare permitted text:=current_setting('qrguitar.account_deletion_request',true);
begin
 if tg_op='INSERT' then
  if new.approved_previous_owner_captured or new.approved_previous_owner_id is not null then
   raise exception using errcode='42501',message='Previous owner provenance is recorded by approval.';end if;
 elsif old.approved_previous_owner_captured then
  if new.approved_previous_owner_captured is distinct from true then raise exception using errcode='42501',message='Previous owner provenance cannot be reset.';end if;
  if new.approved_previous_owner_id is distinct from old.approved_previous_owner_id and not(
   new.approved_previous_owner_id is null and old.approved_previous_owner_id is not null and(
    not exists(select 1 from public.profiles where id=old.approved_previous_owner_id)
    or exists(select 1 from public.account_deletion_fulfillments f where f.request_id::text=permitted and f.actor_id=old.approved_previous_owner_id))) then
   raise exception using errcode='42501',message='Previous owner provenance is immutable.';end if;
 elsif new.approved_previous_owner_captured then
  if old.status not in('awaiting_owner','admin_review') or new.status<>'approved'
   or new.approved_previous_owner_id is distinct from old.current_owner_id then
   raise exception using errcode='42501',message='Previous owner provenance requires a reviewed approval.';end if;
 elsif new.approved_previous_owner_id is not null then raise exception using errcode='42501',message='Uncaptured previous owner provenance must stay empty.';
 end if;
 return new;
end $$;
revoke all on function public._owner_claim_provenance_guard() from public,anon,authenticated,service_role;
create trigger owner_claim_provenance_guard before insert or update on public.ownership_claims for each row execute function public._owner_claim_provenance_guard();



-- Current October definitions retained with exact bounded additions.
CREATE OR REPLACE FUNCTION public.approve_ownership_claim(p_claim_id uuid, p_decided_by uuid, p_decision_note text, p_env_admin boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  claim_row public.ownership_claims%rowtype;
  guitar_row public.guitars%rowtype;
  actor_row public.profiles%rowtype;
  claimant_row public.profiles%rowtype;
  target_guitar_id uuid;
  decided_time timestamptz;
  is_admin boolean;
begin
  select guitar_id into target_guitar_id from public.ownership_claims where id = p_claim_id;
  if not found then raise exception using errcode='QC001', message='Ownership request not found.'; end if;
  -- All ownership writers lock the instrument first, then their request.
  select * into guitar_row from public.guitars where id = target_guitar_id for update;
  select * into claim_row from public.ownership_claims where id = p_claim_id for update;
  if guitar_row.id is null or claim_row.id is null or claim_row.guitar_id is distinct from guitar_row.id then
    raise exception using errcode='QC002', message='This ownership request is no longer available.';
  end if;
  select * into actor_row from public.profiles where id = p_decided_by for share;
  if actor_row.id is null or actor_row.account_status is distinct from 'active' then
    raise exception using errcode='42501', message='This account cannot change ownership.';
  end if;
  is_admin := coalesce(p_env_admin, false) or actor_row.role = 'admin';
  -- A lost response may be retried by the original reviewer without moving the instrument again.
  if claim_row.status = 'approved' and claim_row.decided_by = p_decided_by then
    return jsonb_build_object('ok',true,'replayed',true,'claim_id',claim_row.id,
      'guitar_id',claim_row.guitar_id,'new_owner_id',claim_row.claimant_user_id,'approved_at',claim_row.decided_at);
  end if;
  if claim_row.status not in ('awaiting_owner','admin_review') or claim_row.claimant_user_id is null then
    raise exception using errcode='QC002', message='This ownership request is no longer available.';
  end if;
  if not is_admin and (guitar_row.owner_id is distinct from p_decided_by or claim_row.status = 'admin_review') then
    raise exception using errcode='42501', message='Current owner or administrator review is required.';
  end if;
  if is_admin and nullif(btrim(coalesce(p_decision_note,'')),'') is null then
    raise exception using errcode='22023', message='An operator reason is required for the audit trail.';
  end if;
  if guitar_row.admin_archived_at is not null or guitar_row.owner_removed_at is not null
    or guitar_row.owner_id is distinct from claim_row.current_owner_id then
    raise exception using errcode='QC002', message='The Profile or its owner changed. This request cannot be approved.';
  end if;
  decided_time := clock_timestamp();
  if claim_row.expires_at is not null and claim_row.expires_at <= decided_time then
    raise exception using errcode='QC003', message='This ownership request has expired.';
  end if;
  select * into claimant_row from public.profiles where id = claim_row.claimant_user_id for share;
  if claimant_row.id is null or claimant_row.account_status is distinct from 'active' then
    raise exception using errcode='42501', message='The receiving account is unavailable for ownership changes.';
  end if;
  update public.guitars set owner_id=claim_row.claimant_user_id, updated_at=decided_time where id=guitar_row.id;
  update public.ownership_claims set status='approved', decided_at=decided_time, decided_by=p_decided_by,
    admin_review_note=nullif(btrim(coalesce(p_decision_note,'')),''),
    approved_previous_owner_id=guitar_row.owner_id,approved_previous_owner_captured=true,
    updated_at=decided_time where id=claim_row.id;
  insert into public.ownership_claim_events(claim_id,actor_user_id,action,note,metadata)
  values(claim_row.id,p_decided_by,'approved',nullif(btrim(coalesce(p_decision_note,'')),''),
    jsonb_build_object('previous_owner_id',guitar_row.owner_id,'new_owner_id',claim_row.claimant_user_id));
  insert into public.guitar_timeline_events(
    guitar_id,event_date,date_precision,event_type,category,title,description,is_public,is_system,created_by_user_id,source_key,created_at,updated_at
  ) values (
    guitar_row.id,decided_time::date,'day','ownership','Ownership','Ownership updated',
    'Ownership was updated after a reviewed request. The permanent QRguitar Profile remained unchanged.',
    true,true,claim_row.claimant_user_id,'ownership-claim:'||claim_row.id::text,decided_time,decided_time
  ) on conflict(guitar_id,source_key) where source_key is not null do nothing;
  return jsonb_build_object('ok',true,'replayed',false,'claim_id',claim_row.id,
    'guitar_id',guitar_row.id,'new_owner_id',claim_row.claimant_user_id,'approved_at',decided_time);
end $function$
;

CREATE OR REPLACE FUNCTION public._account_deletion_profile_graph_fence()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_guitar_id uuid; v_related uuid[]:='{}'::uuid[]; v_id uuid; request_row record; held_request uuid; held_state text;
  permitted text:=current_setting('qrguitar.account_deletion_request',true);
  release_request text:=current_setting('qrguitar.account_deletion_custody_release',true);
begin
  if tg_table_name='guitars' then
    if tg_op<>'INSERT' then v_related:=array_append(v_related,old.id);end if;
    if tg_op<>'DELETE' then v_related:=array_append(v_related,new.id);end if;
  elsif tg_table_name='owner_name_consents' then
    for v_id in select distinct e.guitar_id from public.guitar_timeline_events e where e.id in(
      case when tg_op<>'INSERT' then nullif(to_jsonb(old)->>'event_id','')::uuid end,
      case when tg_op<>'DELETE' then nullif(to_jsonb(new)->>'event_id','')::uuid end) loop
      v_related:=array_append(v_related,v_id);
    end loop;
  elsif tg_table_name in ('ownership_claim_evidence','ownership_claim_events') then
    for v_id in select distinct c.guitar_id from public.ownership_claims c where c.id in (
      case when tg_op<>'INSERT' then nullif(to_jsonb(old)->>'claim_id','')::uuid end,
      case when tg_op<>'DELETE' then nullif(to_jsonb(new)->>'claim_id','')::uuid end) loop
      v_related:=array_append(v_related,v_id);
    end loop;
  elsif tg_table_name in ('service_submission_evidence','service_submission_tokens','service_submission_activity','service_submission_notifications',
      'service_evidence_uploads','service_evidence_upload_scopes','service_evidence_upload_discard_receipts') then
    for v_id in select distinct s.guitar_id from public.service_submissions s where s.id in (
      case when tg_op<>'INSERT' then nullif(to_jsonb(old)->>'submission_id','')::uuid end,
      case when tg_op<>'DELETE' then nullif(to_jsonb(new)->>'submission_id','')::uuid end) loop
      v_related:=array_append(v_related,v_id);
    end loop;
  elsif tg_table_name='service_record_correction_decisions' then
    for v_id in select distinct c.guitar_id from public.service_record_corrections c where c.id in (
      case when tg_op<>'INSERT' then nullif(to_jsonb(old)->>'correction_id','')::uuid end,
      case when tg_op<>'DELETE' then nullif(to_jsonb(new)->>'correction_id','')::uuid end) loop
      v_related:=array_append(v_related,v_id);
    end loop;
  elsif tg_table_name='site_content' then
    for v_id in select distinct g.id from public.guitars g where
      (tg_op<>'INSERT' and (to_jsonb(old)->>'content_key'='record_trust:'||g.qr_code
        or to_jsonb(old)->'content_value'->>'guitarId'=g.id::text or to_jsonb(old)->'content_value'->>'qrCode'=g.qr_code))
      or (tg_op<>'DELETE' and (to_jsonb(new)->>'content_key'='record_trust:'||g.qr_code
        or to_jsonb(new)->'content_value'->>'guitarId'=g.id::text or to_jsonb(new)->'content_value'->>'qrCode'=g.qr_code)) loop
      v_related:=array_append(v_related,v_id);
    end loop;
  else
    begin
      if tg_op<>'INSERT' and nullif(to_jsonb(old)->>'guitar_id','') is not null then
        v_related:=array_append(v_related,(to_jsonb(old)->>'guitar_id')::uuid);end if;
      if tg_op<>'DELETE' and nullif(to_jsonb(new)->>'guitar_id','') is not null then
        v_related:=array_append(v_related,(to_jsonb(new)->>'guitar_id')::uuid);end if;
    exception when invalid_text_representation then raise exception using errcode='22023',message='Invalid Profile relationship.'; end;
  end if;
  for v_guitar_id in select distinct x from unnest(v_related) x where x is not null order by x loop
    if not pg_try_advisory_xact_lock(hashtextextended('qrguitar:profile-graph:'||v_guitar_id::text,0)) then
      raise exception using errcode='PD423',message='This Profile has a privacy review in progress; retry the operation.';
    end if;
    for request_row in select s.request_id,f.state from public.account_deletion_profile_review_scopes s
      join public.account_deletion_fulfillments f on f.request_id=s.request_id
      where s.guitar_id=v_guitar_id and exists(
        select 1 from public.account_deletion_storage_relocations r where r.request_id=s.request_id
          and r.state in ('copy_authorized','deletion_authorized','references_updated'))
      order by s.request_id loop
      if permitted is distinct from request_row.request_id::text and release_request is distinct from request_row.request_id::text then
        raise exception using errcode='PD423',message='This Profile is frozen for verified Storage cleanup.';
      end if;
    end loop;
    for request_row in select s.request_id,f.state from public.account_deletion_profile_review_scopes s
      join public.account_deletion_fulfillments f on f.request_id=s.request_id
      where s.guitar_id=v_guitar_id and f.state in ('quiescing_storage','ready_for_auth_deletion') order by s.request_id loop
      if permitted is distinct from request_row.request_id::text and release_request is distinct from request_row.request_id::text then
        raise exception using errcode='PD423',message='This Profile is frozen for privacy fulfillment.';
      end if;
    end loop;
    select c.request_id,f.state into held_request,held_state from public.account_deletion_profile_custody c
      join public.account_deletion_fulfillments f on f.request_id=c.request_id
      where c.guitar_id=v_guitar_id and c.state='privacy_review_required' order by c.held_at desc limit 1;
    if held_request is not null and permitted is distinct from held_request::text and release_request is distinct from held_request::text
      and not (held_state='completed' and tg_table_name in ('ownership_claims','ownership_claim_evidence','ownership_claim_events')) then
      raise exception using errcode='PD423',message='This retained Profile is frozen in privacy custody.';
    end if;
  end loop;
  return case when tg_op='DELETE' then old else new end;
end $function$
;

CREATE OR REPLACE FUNCTION public._account_deletion_sync_profile_review_scope(p_request_id uuid, p_actor_id uuid, p_email text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  insert into public.account_deletion_profile_review_scopes(request_id,guitar_id,relationship_codes)
  select p_request_id,links.guitar_id,array_agg(distinct reason order by reason) from (
    select g.id guitar_id,'current_owner' reason from public.guitars g where g.owner_id=p_actor_id
    union all select g.id,'safety_author' from public.guitars g where g.safety_status_updated_by=p_actor_id
    union all select g.id,'owner_removal_author' from public.guitars g where g.owner_removed_by=p_actor_id
    union all select g.id,'archive_author' from public.guitars g where p_email<>'' and lower(coalesce(g.admin_archived_by,''))=p_email
    union all select t.guitar_id,'transfer_from_owner' from public.ownership_transfers t where t.from_owner_id=p_actor_id
    union all select t.guitar_id,'transfer_recipient' from public.ownership_transfers t where t.accepted_by=p_actor_id or (p_email<>'' and lower(btrim(t.to_email))=p_email)
    union all select c.guitar_id,'claim_participant' from public.ownership_claims c where c.current_owner_id=p_actor_id or c.claimant_user_id=p_actor_id
      or c.decided_by=p_actor_id or (p_email<>'' and lower(btrim(c.recipient_email_normalized))=p_email)
    union all select c.guitar_id,'claim_previous_owner' from public.ownership_claims c where c.approved_previous_owner_id=p_actor_id
    union all select e.guitar_id,'owner_name_consent' from public.owner_name_consents c join public.guitar_timeline_events e on e.id=c.event_id
      where c.subject_user_id=p_actor_id
    union all select c.guitar_id,'claim_evidence_author' from public.ownership_claim_evidence e join public.ownership_claims c on c.id=e.claim_id where e.uploaded_by=p_actor_id
    union all select c.guitar_id,'claim_event_author' from public.ownership_claim_events e join public.ownership_claims c on c.id=e.claim_id where e.actor_user_id=p_actor_id
    union all select d.guitar_id,'document_author' from public.guitar_documents d where d.uploaded_by_user_id=p_actor_id
    union all select d.guitar_id,'document_custodian' from public.guitar_documents d where d.retained_by_user_id=p_actor_id
    union all select x.guitar_id,'external_media_author' from public.guitar_external_media x where x.created_by=p_actor_id
    union all select a.guitar_id,'serial_author' from public.guitar_serial_aliases a where a.created_by=p_actor_id
    union all select e.guitar_id,'timeline_author' from public.guitar_timeline_events e where e.created_by_user_id=p_actor_id or e.provider_user_id=p_actor_id or e.evidence_reviewed_by=p_actor_id
    union all select a.guitar_id,'service_access' from public.service_provider_profile_access a where a.provider_user_id=p_actor_id or a.granted_by_user_id=p_actor_id
    union all select s.guitar_id,'service_participant' from public.service_submissions s where s.provider_user_id=p_actor_id or s.owner_user_id=p_actor_id
    union all select s.guitar_id,'service_evidence_author' from public.service_submission_evidence e join public.service_submissions s on s.id=e.submission_id where e.uploaded_by_user_id=p_actor_id
    union all select s.guitar_id,'service_activity_author' from public.service_submission_activity a join public.service_submissions s on s.id=a.submission_id where a.actor_user_id=p_actor_id
    union all select s.guitar_id,'service_notification_recipient' from public.service_submission_notifications n join public.service_submissions s on s.id=n.submission_id where n.recipient_user_id=p_actor_id
    union all select s.guitar_id,'service_upload_author' from public.service_evidence_uploads u join public.service_submissions s on s.id=u.submission_id where u.actor_id=p_actor_id
    union all select s.guitar_id,'service_upload_scope' from public.service_evidence_upload_scopes u join public.service_submissions s on s.id=u.submission_id where u.actor_id=p_actor_id
    union all select s.guitar_id,'service_discard_receipt' from public.service_evidence_upload_discard_receipts u join public.service_submissions s on s.id=u.submission_id where u.actor_id=p_actor_id
    union all select r.guitar_id,'create_receipt' from public.instrument_create_receipts r where r.owner_id=p_actor_id and r.guitar_id is not null
    union all select u.guitar_id,'staged_upload' from public.instrument_staged_uploads u where u.owner_id=p_actor_id and u.guitar_id is not null
    union all select g.id,'site_content' from public.site_content c join public.guitars g
      on c.content_value->>'guitarId'=g.id::text or c.content_value->>'qrCode'=g.qr_code
      where c.updated_by=p_actor_id or c.content_key like 'create_submission:'||p_actor_id::text||':%'
    union all select c.guitar_id,'service_participant' from public.service_record_corrections c where c.provider_user_id=p_actor_id or c.owner_user_id=p_actor_id
      or public._account_deletion_text_has_identity(concat_ws('|',c.details,c.request_body::text),p_actor_id,p_email)
    union all select c.guitar_id,'service_participant' from public.service_record_correction_decisions d join public.service_record_corrections c on c.id=d.correction_id
      where d.owner_user_id=p_actor_id or public._account_deletion_text_has_identity(d.request_body::text,p_actor_id,p_email)
  ) links join public.guitars current_g on current_g.id=links.guitar_id
  where links.guitar_id is not null
  group by links.guitar_id
  on conflict(request_id,guitar_id) do nothing
$function$
;

CREATE OR REPLACE FUNCTION public._account_deletion_profile_review_graph(p_request_id uuid, p_guitar_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET "TimeZone" TO 'UTC'
AS $function$
  with job as (
    select actor_id,subject_token,lower(coalesce(target_email,'')) target_email
    from public.account_deletion_fulfillments where request_id=p_request_id
  ), retained as (
  select jsonb_build_object(
    'policyVersion',1,'requestId',p_request_id,'guitarId',p_guitar_id,
    'scope',(select to_jsonb(s)-'recorded_at' from public.account_deletion_profile_review_scopes s where s.request_id=p_request_id and s.guitar_id=p_guitar_id),
    'guitar',(select (to_jsonb(g)-array['owner_id','visibility','updated_at','safety_status_updated_by','owner_removed_by','admin_archived_by']::text[])
      ||jsonb_build_object('ownerScope',case when g.owner_id=job.actor_id then 'deletion-target' else coalesce(g.owner_id::text,'ownerless') end,
        'visibilityScope',case when g.owner_id=job.actor_id then 'privacy-custody' else g.visibility::text end)
      from public.guitars g where g.id=p_guitar_id),
    'redirects',(select coalesce(jsonb_agg(to_jsonb(x) order by x.old_path),'[]'::jsonb) from public.qr_redirects x where x.guitar_id=p_guitar_id),
    'specs',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb) from public.guitar_specs x where x.guitar_id=p_guitar_id),
    'media',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb) from public.guitar_media x where x.guitar_id=p_guitar_id),
    'documents',(select coalesce(jsonb_agg(to_jsonb(x)-array['uploaded_by_user_id','retained_by_user_id','updated_at']::text[] order by x.id),'[]'::jsonb) from public.guitar_documents x where x.guitar_id=p_guitar_id),
    'documentSelections',(select coalesce(jsonb_agg(to_jsonb(x) order by x.transfer_id),'[]'::jsonb) from public.ownership_transfer_document_selections x where x.guitar_id=p_guitar_id),
    'externalMedia',(select coalesce(jsonb_agg(to_jsonb(x)-array['created_by','updated_at']::text[] order by x.id),'[]'::jsonb) from public.guitar_external_media x where x.guitar_id=p_guitar_id),
    'serialAliases',(select coalesce(jsonb_agg(to_jsonb(x)-'created_by' order by x.id),'[]'::jsonb) from public.guitar_serial_aliases x where x.guitar_id=p_guitar_id),
    'timeline',(select coalesce(jsonb_agg(to_jsonb(x)-array['created_by_user_id','provider_user_id','evidence_reviewed_by','created_by_subject_id','provider_subject_id','evidence_reviewed_by_subject_id','updated_at']::text[] order by x.id),'[]'::jsonb) from public.guitar_timeline_events x where x.guitar_id=p_guitar_id),
    'ownerNameConsents',(select coalesce(jsonb_agg(jsonb_build_object(
      'eventId',x.event_id,'enabled',x.enabled and x.subject_user_id is distinct from job.actor_id,
      'publicName',case when x.enabled and x.subject_user_id is distinct from job.actor_id then x.public_name else null end,
      'version',case when x.enabled and x.subject_user_id is distinct from job.actor_id then x.version::text else null end)
      order by x.event_id),'[]'::jsonb) from public.owner_name_consents x join public.guitar_timeline_events e on e.id=x.event_id where e.guitar_id=p_guitar_id),
    'transfers',(select coalesce(jsonb_agg(to_jsonb(x)-array['from_owner_id','accepted_by','to_email','claim_token_hash','purchaser_code_hash']::text[] order by x.id),'[]'::jsonb) from public.ownership_transfers x where x.guitar_id=p_guitar_id),
    'claims',(select coalesce(jsonb_agg(to_jsonb(x)-array['current_owner_id','claimant_user_id','decided_by','recipient_email_normalized','claim_token_hash','purchaser_code_hash','updated_at','approved_previous_owner_id']::text[] order by x.id),'[]'::jsonb) from public.ownership_claims x where x.guitar_id=p_guitar_id),
    'claimEvidence',(select coalesce(jsonb_agg(to_jsonb(x)-'uploaded_by' order by x.id),'[]'::jsonb) from public.ownership_claim_evidence x join public.ownership_claims c on c.id=x.claim_id where c.guitar_id=p_guitar_id),
    'claimEvents',(select coalesce(jsonb_agg(to_jsonb(x)-'actor_user_id' order by x.id),'[]'::jsonb) from public.ownership_claim_events x join public.ownership_claims c on c.id=x.claim_id where c.guitar_id=p_guitar_id),
    'serviceAccess',(select coalesce(jsonb_agg(to_jsonb(x)-array['provider_user_id','granted_by_user_id']::text[] order by x.id),'[]'::jsonb) from public.service_provider_profile_access x where x.guitar_id=p_guitar_id),
    'serviceCorrections',(select coalesce(jsonb_agg(to_jsonb(x)-array['provider_user_id','provider_subject_id','owner_user_id','owner_subject_id']::text[] order by x.id),'[]'::jsonb) from public.service_record_corrections x where x.guitar_id=p_guitar_id),
    'serviceCorrectionDecisions',(select coalesce(jsonb_agg(to_jsonb(x)-array['owner_user_id','owner_subject_id']::text[] order by x.id),'[]'::jsonb) from public.service_record_correction_decisions x join public.service_record_corrections c on c.id=x.correction_id where c.guitar_id=p_guitar_id),
    'serviceSubmissions',(select coalesce(jsonb_agg(to_jsonb(x)-array['provider_user_id','owner_user_id','provider_subject_id','owner_subject_id','updated_at']::text[] order by x.id),'[]'::jsonb) from public.service_submissions x where x.guitar_id=p_guitar_id),
    'serviceEvidence',(select coalesce(jsonb_agg(to_jsonb(x)-array['uploaded_by_user_id','uploaded_by_subject_id']::text[] order by x.id),'[]'::jsonb) from public.service_submission_evidence x join public.service_submissions s on s.id=x.submission_id where s.guitar_id=p_guitar_id),
    'serviceTokens',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb) from public.service_submission_tokens x join public.service_submissions s on s.id=x.submission_id where s.guitar_id=p_guitar_id),
    'serviceActivity',(select coalesce(jsonb_agg(to_jsonb(x)-array['actor_user_id','actor_subject_id']::text[] order by x.id),'[]'::jsonb) from public.service_submission_activity x join public.service_submissions s on s.id=x.submission_id where s.guitar_id=p_guitar_id),
    'serviceNotifications',(select coalesce(jsonb_agg(to_jsonb(x)-'recipient_user_id' order by x.id),'[]'::jsonb) from public.service_submission_notifications x join public.service_submissions s on s.id=x.submission_id where s.guitar_id=p_guitar_id),
    'serviceUploads',(select coalesce(jsonb_agg(to_jsonb(x)-array['actor_id','actor_subject_id']::text[] order by x.upload_id),'[]'::jsonb) from public.service_evidence_uploads x join public.service_submissions s on s.id=x.submission_id where s.guitar_id=p_guitar_id),
    'serviceUploadScopes',(select coalesce(jsonb_agg(to_jsonb(x)-'actor_id' order by x.submission_id),'[]'::jsonb) from public.service_evidence_upload_scopes x join public.service_submissions s on s.id=x.submission_id where s.guitar_id=p_guitar_id),
    'serviceDiscardReceipts',(select coalesce(jsonb_agg(to_jsonb(x)-array['actor_id','actor_subject_id']::text[] order by x.upload_id),'[]'::jsonb) from public.service_evidence_upload_discard_receipts x join public.service_submissions s on s.id=x.submission_id where s.guitar_id=p_guitar_id),
    'createReceipts',(select coalesce(jsonb_agg(to_jsonb(x)-'owner_id' order by x.idempotency_key),'[]'::jsonb) from public.instrument_create_receipts x where x.guitar_id=p_guitar_id),
    'stagedUploads',(select coalesce(jsonb_agg(to_jsonb(x)-'owner_id' order by x.bucket_id,x.storage_path),'[]'::jsonb) from public.instrument_staged_uploads x where x.guitar_id=p_guitar_id),
    'siteContent',(select coalesce(jsonb_agg(to_jsonb(x)-array['updated_by','updated_at','editor_version']::text[] order by x.content_key),'[]'::jsonb)
      from public.site_content x join public.guitars g on g.id=p_guitar_id where x.content_key='record_trust:'||g.qr_code
        or x.content_value->>'guitarId'=p_guitar_id::text or x.content_value->>'qrCode'=g.qr_code)
  ) value from job)
  select public._account_deletion_redact_identity_jsonb(retained.value,job.actor_id,job.target_email,job.subject_token)
  from retained,job
$function$
;

CREATE OR REPLACE FUNCTION public._account_deletion_retained_pii(p_request_id uuid, p_actor_id uuid, p_email text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select exists(select 1 from public.account_deletion_profile_custody c join public.guitars g on g.id=c.guitar_id
    where c.request_id=p_request_id and c.state='privacy_review_required' and (g.owner_id is not null or g.visibility<>'private'))
  or exists(select 1 from public.owner_name_consents c where c.subject_user_id=p_actor_id)
  or exists(select 1 from public.ownership_claims c where c.approved_previous_owner_id=p_actor_id)
  or public._account_deletion_unscoped_personal_content(p_actor_id,p_email)
  or exists(select 1 from public.account_deletion_profile_review_scopes s where s.request_id=p_request_id
    and public._account_deletion_profile_has_exact_identity(s.guitar_id,p_actor_id,p_email))
  or exists(select 1 from public.account_deletion_profile_custody c where c.request_id=p_request_id
    and public._account_deletion_profile_has_exact_identity(c.guitar_id,p_actor_id,p_email))
  or public._account_deletion_identity_inventory_has_actor('billing',p_actor_id)
  or public._account_deletion_identity_inventory_has_actor('service',p_actor_id)
  or public._account_deletion_storage_cleanup_required(p_request_id,p_actor_id,p_email)
  or exists(select 1 from public.account_deletion_storage_relocations r where r.request_id=p_request_id
    and public._account_deletion_text_has_identity(concat_ws('|',r.source_path,r.destination_path,r.source_mime_type,r.source_version),p_actor_id,p_email))
  or exists(select 1 from public.account_deletion_billing_subjects where request_id=p_request_id and after_fingerprint is null)
  or exists(select 1 from public.account_deletion_service_subjects where request_id=p_request_id and after_fingerprint is null)
  or exists(select 1 from public.site_content s where s.updated_by=p_actor_id
    or strpos(lower(s.content_key),p_actor_id::text)>0 or strpos(lower(s.content_value::text),p_actor_id::text)>0
    or (p_email<>'' and (strpos(lower(s.content_key),p_email)>0 or strpos(lower(s.content_value::text),p_email)>0)))
  or exists(select 1 from public.site_editor_receipts r where r.actor_user_id=p_actor_id
    or strpos(lower(r.request_body::text),p_actor_id::text)>0 or strpos(lower(r.result::text),p_actor_id::text)>0
    or (p_email<>'' and (strpos(lower(r.request_body::text),p_email)>0 or strpos(lower(r.result::text),p_email)>0)))
  or exists(select 1 from public.service_submission_notifications n where n.recipient_user_id=p_actor_id
    or strpos(lower(n.message),p_actor_id::text)>0
    or (p_email<>'' and strpos(lower(n.message),p_email)>0))
  or exists(select 1 from public.guitar_documents d where d.uploaded_by_user_id=p_actor_id or d.retained_by_user_id=p_actor_id)
  or exists(select 1 from public.guitar_external_media x where x.created_by=p_actor_id)
  or exists(select 1 from public.guitar_serial_aliases x where x.created_by=p_actor_id)
  or exists(select 1 from public.ownership_claim_evidence e where e.uploaded_by=p_actor_id)
  or exists(select 1 from public.ownership_claim_events e where e.actor_user_id=p_actor_id)
  or exists(select 1 from public.guitars g where g.owner_id=p_actor_id or g.safety_status_updated_by=p_actor_id or g.owner_removed_by=p_actor_id)
  or exists(select 1 from public.ownership_transfers t where t.from_owner_id=p_actor_id or t.accepted_by=p_actor_id)
  or exists(select 1 from public.ownership_claims c where c.current_owner_id=p_actor_id or c.claimant_user_id=p_actor_id or c.decided_by=p_actor_id)
  or exists(select 1 from public.instrument_create_receipts r where r.owner_id=p_actor_id
    or public._account_deletion_text_has_identity(to_jsonb(r)::text,p_actor_id,p_email))
  or exists(select 1 from public.instrument_staged_uploads u where u.owner_id=p_actor_id
    or public._account_deletion_text_has_identity(to_jsonb(u)::text,p_actor_id,p_email))
  or exists(select 1 from public.ownership_transfers t where p_email<>'' and lower(btrim(t.to_email))=p_email)
  or exists(select 1 from public.ownership_claims c where p_email<>'' and lower(btrim(c.recipient_email_normalized))=p_email)
  or exists(select 1 from public.account_deletion_fulfillments f where f.started_by=p_actor_id or f.last_reviewed_by=p_actor_id)
  or exists(select 1 from public.profiles p where (p_email<>'' and (lower(coalesce(p.account_locked_by,''))=p_email or lower(coalesce(p.account_banned_by,''))=p_email)))
  or exists(select 1 from public.guitars g where p_email<>'' and lower(coalesce(g.admin_archived_by,''))=p_email)
  or exists(select 1 from public.admin_audit_events a where a.actor_user_id=p_actor_id or a.target_user_id=p_actor_id or a.target_id=p_actor_id::text
    or strpos(lower(coalesce(a.target_id,'')),p_actor_id::text)>0 or strpos(lower(coalesce(a.reason,'')),p_actor_id::text)>0
    or strpos(lower(a.metadata::text),p_actor_id::text)>0
    or (p_email<>'' and (lower(coalesce(a.actor_email,''))=p_email or strpos(lower(coalesce(a.target_id,'')),p_email)>0
      or strpos(lower(coalesce(a.reason,'')),p_email)>0 or strpos(lower(a.metadata::text),p_email)>0)))
  or public._account_deletion_promo_retained_pii(p_actor_id,p_email)
  or exists(select 1 from public.service_record_corrections c where public._account_deletion_text_has_identity(concat_ws('|',c.details,c.request_body::text),p_actor_id,p_email))
  or exists(select 1 from public.service_record_correction_decisions d where public._account_deletion_text_has_identity(d.request_body::text,p_actor_id,p_email))
$function$
;

CREATE OR REPLACE FUNCTION public.prepare_account_deletion_fulfillment(p_admin_id uuid, p_environment_admin boolean, p_request_id uuid, p_operation_id uuid, p_protected_admin_emails text[] DEFAULT '{}'::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare request_row public.account_deletion_requests; job public.account_deletion_fulfillments;
  old_receipt public.account_deletion_fulfillment_receipts; target_email text; target_display_name text; blocked jsonb; answer jsonb;
  new_subject uuid; preliminary_actor uuid; protected_admin_emails text[]; unscoped_remaining boolean; now_at timestamptz:=clock_timestamp();
begin
  if p_request_id is null or p_operation_id is null then raise exception using errcode='22023',message='Request and operation UUIDs are required.'; end if;
  if cardinality(coalesce(p_protected_admin_emails,'{}'::text[]))>100
    or exists(select 1 from unnest(coalesce(p_protected_admin_emails,'{}'::text[])) email
      where length(email)>320 or btrim(email)='' or email<>lower(btrim(email))) then
    raise exception using errcode='22023',message='Protected administrator identities are invalid.';
  end if;
  select coalesce(array_agg(distinct email order by email),'{}'::text[]) into protected_admin_emails
    from unnest(coalesce(p_protected_admin_emails,'{}'::text[])) email;
  perform public._account_deletion_admin(p_admin_id,p_environment_admin);
  perform pg_advisory_xact_lock(hashtextextended('qrguitar:deletion-operation:'||p_operation_id::text,0));
  if exists(select 1 from public.account_deletion_profile_review_attestations where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_retention_attestations where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_custody_release_receipts where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_storage_content_reviews where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_custody_evidence_reviews where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_review_page_receipts where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_storage_relocations where finalize_operation_id=p_operation_id or complete_operation_id=p_operation_id) then
    raise exception using errcode='PD409',message='This operation UUID belongs to another deletion action.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('qrguitar:account-deletion:'||p_request_id::text,0));
  select * into old_receipt from public.account_deletion_fulfillment_receipts where operation_id=p_operation_id;
  if found then
    if old_receipt.request_id<>p_request_id or old_receipt.action<>'prepare' then raise exception using errcode='PD409',message='This operation UUID belongs to another fulfillment action.'; end if;
    select * into job from public.account_deletion_fulfillments where request_id=p_request_id;
    return jsonb_build_object('ok',true,'fulfillment',public._account_deletion_admin_fulfillment_json(job),
      'profileReviews',public._account_deletion_profile_reviews_json(p_request_id),
      'retentionReviews',public._account_deletion_retention_reviews_json(p_request_id),
      'storageReviews',public._account_deletion_storage_reviews_json(p_request_id),
      'storageRelocations',public._account_deletion_storage_relocations_json(p_request_id),
      'authActorId',case when job.state='ready_for_auth_deletion' then job.actor_id else null end);
  end if;
  select actor_id into preliminary_actor from public.account_deletion_requests where id=p_request_id and status='requested';
  if not found then raise exception using errcode='PD404',message='An active deletion request was not found.'; end if;
  if preliminary_actor is not null then
    -- Existing create and billing paths take the create lock before an
    -- actor-bearing insert reaches the privacy write fence. Preserve that
    -- global order here to avoid create<->prepare deadlocks.
    perform pg_advisory_xact_lock(hashtextextended('qrguitar:create:'||preliminary_actor::text,0));
    perform pg_advisory_xact_lock(hashtextextended('qrguitar:privacy-request:'||preliminary_actor::text,0));
  end if;
  select * into request_row from public.account_deletion_requests where id=p_request_id for update;
  if not found or request_row.status<>'requested' then raise exception using errcode='PD404',message='An active deletion request was not found.'; end if;
  if request_row.actor_id is distinct from preliminary_actor then raise exception using errcode='PD409',message='The deletion request identity changed during review.'; end if;
  if request_row.actor_id is null then
    select * into job from public.account_deletion_fulfillments where request_id=p_request_id for update;
    if not found then raise exception using errcode='PD409',message='This request has no resumable fulfillment.'; end if;
  else
    if request_row.actor_id=p_admin_id then raise exception using errcode='PD409',message='Administrators cannot fulfill their own account deletion.'; end if;
    perform 1 from auth.users where id=request_row.actor_id for key share;
    if not found then raise exception using errcode='PD409',message='The requested Auth identity is unavailable.'; end if;
    perform 1 from public.profiles where id=request_row.actor_id for update;
    select lower(btrim(coalesce(u.email,''))),nullif(btrim(p.display_name),'') into target_email,target_display_name
      from auth.users u left join public.profiles p on p.id=u.id where u.id=request_row.actor_id;
    if target_email<>'' then
      perform pg_advisory_xact_lock(hashtextextended('qrguitar:privacy-email:'||target_email,0));
    end if;
    new_subject:=gen_random_uuid();
    insert into public.account_deletion_fulfillments(request_id,actor_id,subject_token,actor_fingerprint,target_email,started_by,last_reviewed_by,blockers)
      values(p_request_id,request_row.actor_id,new_subject,sha256(convert_to(request_row.actor_id::text||':'||new_subject::text,'UTF8')),target_email,p_admin_id,p_admin_id,'["inventory_pending"]'::jsonb)
      on conflict(request_id) do nothing;
    select * into job from public.account_deletion_fulfillments where request_id=p_request_id for update;
    if job.actor_id is distinct from request_row.actor_id then raise exception using errcode='PD409',message='The fulfillment identity no longer matches this request.'; end if;
    if job.target_email is distinct from target_email then raise exception using errcode='PD409',message='The deletion identity email changed during review.'; end if;
  end if;
  if target_display_name is null and job.actor_id is not null then
    select nullif(btrim(display_name),'') into target_display_name from public.profiles where id=job.actor_id;
  end if;
  perform set_config('qrguitar.account_deletion_request',p_request_id::text,true);
  perform set_config('qrguitar.account_deletion_target_name',coalesce(target_display_name,''),true);
  now_at:=clock_timestamp();
  if job.state='completed' then
    answer:=public._account_deletion_admin_fulfillment_json(job);
  elsif job.state='ready_for_auth_deletion' then
    answer:=public._account_deletion_admin_fulfillment_json(job);
  else
    perform set_config('request.jwt.claim.role','service_role',true);
    perform public._account_deletion_scrub_unscoped_personal_content(p_request_id,job.actor_id,target_email,job.subject_token);
    unscoped_remaining:=public._account_deletion_unscoped_personal_content(job.actor_id,target_email);
    perform set_config('qrguitar.account_deletion_target_name','',true);
    perform public._account_deletion_sync_profile_review_scope(p_request_id,job.actor_id,target_email);
    perform public._account_deletion_lock_profile_reviews(p_request_id);
    if job.state='blocked' then
      perform public._account_deletion_sync_storage_relocations(p_request_id,job.actor_id,target_email);
    end if;
    perform pg_advisory_xact_lock(hashtextextended('qrguitar:billing-ledger',0));
    if job.state='quiescing_storage' and clock_timestamp()>=job.storage_quiesce_until then
      lock table storage.objects in share mode;
      now_at:=clock_timestamp();
    end if;
    blocked:=public._account_deletion_blockers(p_request_id,job.actor_id,target_email,protected_admin_emails,unscoped_remaining);
    if job.state='blocked' and blocked<>'[]'::jsonb then
      update public.account_deletion_fulfillments set state='blocked',blockers=blocked,revision=revision+1,
        last_reviewed_by=p_admin_id,reviewed_at=now_at where request_id=p_request_id returning * into job;
      answer:=public._account_deletion_admin_fulfillment_json(job);
    elsif job.state='blocked' then
      -- Freeze account writes in a committed phase before claiming the storage
      -- inventory is final. Supabase signed upload capabilities remain valid for
      -- two hours; the additional hour drains already-started bounded uploads.
      -- A later operation must rescan storage after this timestamp. The phase is
      -- intentionally non-cancellable because the account is already frozen.
      perform set_config('request.jwt.claim.role','service_role',true);
      insert into public.account_deletion_profile_custody(guitar_id,request_id,prior_visibility)
        select id,p_request_id,visibility from public.guitars where owner_id=job.actor_id on conflict do nothing;
      update public.guitars set visibility='private',updated_at=greatest(updated_at,now_at) where owner_id=job.actor_id;
      -- Remove optional names before the durable privacy freeze; preserve withdrawal versions.
      update public.owner_name_consents set enabled=false,public_name=null,subject_user_id=null,
        consented_at=null,version=version+1,updated_at=now_at
        where subject_user_id=job.actor_id;
      update public.ownership_claims set approved_previous_owner_id=null
        where approved_previous_owner_id=job.actor_id;
      update public.profiles set account_status='removed',hide_public_content=true where id=job.actor_id;
      select coalesce(jsonb_agg(code order by code),'[]'::jsonb) into blocked from (
        select value code from jsonb_array_elements_text(blocked)
        union select 'storage_quiescence_required'
      ) blockers;
      update public.account_deletion_fulfillments set state='quiescing_storage',blockers=blocked,
        storage_quiesce_until=clock_timestamp()+interval '3 hours',revision=revision+1,
        last_reviewed_by=p_admin_id,reviewed_at=now_at where request_id=p_request_id returning * into job;
      answer:=public._account_deletion_admin_fulfillment_json(job);
    else
      if now_at<job.storage_quiesce_until then
        select coalesce(jsonb_agg(code order by code),'[]'::jsonb) into blocked from (
          select value code from jsonb_array_elements_text(blocked)
          union select 'storage_quiescence_required'
        ) blockers;
      end if;
      if blocked<>'[]'::jsonb then
        update public.account_deletion_fulfillments set state='quiescing_storage',blockers=blocked,revision=revision+1,
          last_reviewed_by=p_admin_id,reviewed_at=now_at where request_id=p_request_id returning * into job;
        answer:=public._account_deletion_admin_fulfillment_json(job);
      else
        -- The durable freeze has outlived every issued upload capability and a
        -- fresh storage inventory is empty. Now anonymize under the same actor
        -- and recipient-email locks before Auth deletion can be attempted.
        perform set_config('request.jwt.claim.role','service_role',true);
        perform set_config('qrguitar.account_deletion_target_name',coalesce(target_display_name,''),true);
        perform public._account_deletion_migrate_billing_subject(p_request_id,job.actor_id,p_admin_id);
        perform public._account_deletion_migrate_service_subject(p_request_id,job.actor_id,p_admin_id);
      -- Remove optional names before the durable privacy freeze; preserve withdrawal versions.
      update public.owner_name_consents set enabled=false,public_name=null,subject_user_id=null,
        consented_at=null,version=version+1,updated_at=now_at
        where subject_user_id=job.actor_id;
      update public.ownership_claims set approved_previous_owner_id=null
        where approved_previous_owner_id=job.actor_id;
        update public.profiles set account_status='removed',hide_public_content=true,display_name=null,
          admin_notes=null,account_lock_reason=null,account_ban_reason=null,
          purchased_code_count=0,remaining_code_count=0 where id=job.actor_id;

      insert into public.account_deletion_profile_custody(guitar_id,request_id,prior_visibility)
        select id,p_request_id,visibility from public.guitars where owner_id=job.actor_id on conflict do nothing;

      -- Custody keeps the permanent QR and every factual instrument/service
      -- record. Only proven identity strings and Auth links are removed.
      update public.site_content s set
        content_value=public._account_deletion_redact_identity_jsonb(s.content_value,job.actor_id,target_email,job.subject_token),
        updated_by=null
        from public.account_deletion_profile_review_scopes c join public.guitars g on g.id=c.guitar_id
        where c.request_id=p_request_id and s.content_key='record_trust:'||g.qr_code;
      update public.guitars g set owner_id=null,visibility='private',
        name=public._account_deletion_redact_identity(g.name,job.actor_id,target_email),
        brand=public._account_deletion_redact_identity(g.brand,job.actor_id,target_email),
        model=public._account_deletion_redact_identity(g.model,job.actor_id,target_email),
        year=public._account_deletion_redact_identity(g.year,job.actor_id,target_email),
        serial_number=public._account_deletion_redact_identity(g.serial_number,job.actor_id,target_email),
        builder=public._account_deletion_redact_identity(g.builder,job.actor_id,target_email),
        location=case when g.location is null then null else '[personal information removed]' end,
        summary=public._account_deletion_redact_identity(g.summary,job.actor_id,target_email),
        hero_image_path=case when public._account_deletion_text_has_identity(g.hero_image_path,job.actor_id,target_email)
          then null else g.hero_image_path end,
        safety_status_updated_by=null,
        safety_note=case when g.safety_note is null then null else '[personal information removed]' end,
        public_safety_note=case when g.public_safety_note is null then null else '[personal information removed]' end,
        owner_removed_by=null,
        owner_removed_reason=public._account_deletion_redact_identity(g.owner_removed_reason,job.actor_id,target_email),
        admin_archived_by=case when target_email<>'' and lower(coalesce(g.admin_archived_by,''))=target_email then null else g.admin_archived_by end,
        admin_archive_reason=public._account_deletion_redact_identity(g.admin_archive_reason,job.actor_id,target_email),
        updated_at=greatest(g.updated_at,now_at)
        from public.account_deletion_profile_custody c where c.request_id=p_request_id and c.guitar_id=g.id;
      update public.guitars g set
        name=public._account_deletion_redact_identity(g.name,job.actor_id,target_email),
        brand=public._account_deletion_redact_identity(g.brand,job.actor_id,target_email),
        model=public._account_deletion_redact_identity(g.model,job.actor_id,target_email),
        year=public._account_deletion_redact_identity(g.year,job.actor_id,target_email),
        serial_number=public._account_deletion_redact_identity(g.serial_number,job.actor_id,target_email),
        builder=public._account_deletion_redact_identity(g.builder,job.actor_id,target_email),
        location=public._account_deletion_redact_identity(g.location,job.actor_id,target_email),
        summary=public._account_deletion_redact_identity(g.summary,job.actor_id,target_email),
        hero_image_path=case when public._account_deletion_text_has_identity(g.hero_image_path,job.actor_id,target_email) then null else g.hero_image_path end,
        safety_note=public._account_deletion_redact_identity(g.safety_note,job.actor_id,target_email),
        public_safety_note=public._account_deletion_redact_identity(g.public_safety_note,job.actor_id,target_email),
        owner_removed_reason=public._account_deletion_redact_identity(g.owner_removed_reason,job.actor_id,target_email),
        admin_archive_reason=public._account_deletion_redact_identity(g.admin_archive_reason,job.actor_id,target_email),
        updated_at=greatest(g.updated_at,now_at)
        from public.account_deletion_profile_review_scopes c
        where c.request_id=p_request_id and c.guitar_id=g.id
          and not exists(select 1 from public.account_deletion_profile_custody h where h.request_id=p_request_id and h.guitar_id=g.id);
      update public.guitars set safety_status_updated_by=null where safety_status_updated_by=job.actor_id;
      update public.guitars set owner_removed_by=null where owner_removed_by=job.actor_id;
      update public.guitars set admin_archived_by=null
        where target_email<>'' and lower(coalesce(admin_archived_by,''))=target_email;

      update public.guitar_specs s set
        label=public._account_deletion_redact_identity(s.label,job.actor_id,target_email),
        value=public._account_deletion_redact_identity(s.value,job.actor_id,target_email)
        from public.account_deletion_profile_review_scopes c where c.request_id=p_request_id and c.guitar_id=s.guitar_id;
      update public.guitar_media m set
        storage_path=case when public._account_deletion_text_has_identity(m.storage_path,job.actor_id,target_email)
          then 'privacy-removed/'||m.id::text else m.storage_path end,
        alt=public._account_deletion_redact_identity(m.alt,job.actor_id,target_email)
        from public.account_deletion_profile_review_scopes c where c.request_id=p_request_id and c.guitar_id=m.guitar_id;
      update public.guitar_documents d set uploaded_by_user_id=case when d.uploaded_by_user_id=job.actor_id then null else d.uploaded_by_user_id end,
        name=public._account_deletion_redact_identity(d.name,job.actor_id,target_email),
        storage_path=case when public._account_deletion_text_has_identity(d.storage_path,job.actor_id,target_email)
          then 'privacy-removed/'||d.id::text else d.storage_path end,
        document_type=public._account_deletion_redact_identity(d.document_type,job.actor_id,target_email),
        file_name=public._account_deletion_redact_identity(d.file_name,job.actor_id,target_email),
        public_description=public._account_deletion_redact_identity(d.public_description,job.actor_id,target_email),
        private_notes=public._account_deletion_redact_identity(d.private_notes,job.actor_id,target_email),
        category=public._account_deletion_redact_identity(d.category,job.actor_id,target_email),
        issuer_source=public._account_deletion_redact_identity(d.issuer_source,job.actor_id,target_email),
        description=public._account_deletion_redact_identity(d.description,job.actor_id,target_email)
        from public.account_deletion_profile_review_scopes c where c.request_id=p_request_id and c.guitar_id=d.guitar_id;
      update public.guitar_documents set uploaded_by_user_id=null where uploaded_by_user_id=job.actor_id;
      update public.guitar_documents set retained_by_user_id=null where retained_by_user_id=job.actor_id;
      update public.guitar_external_media x set created_by=case when x.created_by=job.actor_id then null else x.created_by end,
        canonical_url=case when public._account_deletion_text_has_identity(x.canonical_url,job.actor_id,target_email)
          then 'https://privacy.invalid/removed/'||x.id::text else x.canonical_url end,
        provider_id=public._account_deletion_redact_identity(x.provider_id,job.actor_id,target_email),
        title=public._account_deletion_redact_identity(x.title,job.actor_id,target_email),
        caption=public._account_deletion_redact_identity(x.caption,job.actor_id,target_email),
        thumbnail_url=case when public._account_deletion_text_has_identity(x.thumbnail_url,job.actor_id,target_email)
          then null else x.thumbnail_url end
        from public.account_deletion_profile_review_scopes c where c.request_id=p_request_id and c.guitar_id=x.guitar_id;
      update public.guitar_external_media set created_by=null where created_by=job.actor_id;
      update public.guitar_serial_aliases a set created_by=case when a.created_by=job.actor_id then null else a.created_by end,
        serial_normalized=case when public._account_deletion_text_has_identity(a.serial_normalized,job.actor_id,target_email)
          then 'REDACTED-'||replace(a.id::text,'-','') else a.serial_normalized end,
        serial_display=public._account_deletion_redact_identity(a.serial_display,job.actor_id,target_email)
        from public.account_deletion_profile_review_scopes c where c.request_id=p_request_id and c.guitar_id=a.guitar_id;
      update public.guitar_serial_aliases set created_by=null where created_by=job.actor_id;

      update public.guitar_timeline_events e set
        title=public._account_deletion_redact_identity(e.title,job.actor_id,target_email),
        description=public._account_deletion_redact_identity(e.description,job.actor_id,target_email),
        private_notes=public._account_deletion_redact_identity(e.private_notes,job.actor_id,target_email),
        shop_name=public._account_deletion_redact_identity(e.shop_name,job.actor_id,target_email),
        location=public._account_deletion_redact_identity(e.location,job.actor_id,target_email),
        provider_display_name=public._account_deletion_redact_identity(e.provider_display_name,job.actor_id,target_email),
        work_order_reference=public._account_deletion_redact_identity(e.work_order_reference,job.actor_id,target_email),
        parts_installed=public._account_deletion_redact_identity(e.parts_installed,job.actor_id,target_email),
        setup_measurements=public._account_deletion_redact_identity(e.setup_measurements,job.actor_id,target_email),
        who_performed=public._account_deletion_redact_identity(e.who_performed,job.actor_id,target_email),
        event_type=public._account_deletion_redact_identity(e.event_type,job.actor_id,target_email),
        category=public._account_deletion_redact_identity(e.category,job.actor_id,target_email),
        source_key=public._account_deletion_redact_identity(e.source_key,job.actor_id,target_email)
        from public.account_deletion_profile_review_scopes c where c.request_id=p_request_id and c.guitar_id=e.guitar_id;

      update public.ownership_transfers t set
        from_owner_id=case when t.from_owner_id=job.actor_id then null else t.from_owner_id end,
        accepted_by=case when t.accepted_by=job.actor_id then null else t.accepted_by end,
        to_name=public._account_deletion_redact_identity(t.to_name,job.actor_id,target_email),
        to_email=case when target_email<>'' and lower(btrim(t.to_email))=target_email then 'deleted+'||t.id::text||'@privacy.invalid' else t.to_email end,
        claim_token_hash=null,purchaser_code_hash=null,
        fee_waived_reason=public._account_deletion_redact_identity(t.fee_waived_reason,job.actor_id,target_email)
        where t.from_owner_id=job.actor_id or t.accepted_by=job.actor_id or (target_email<>'' and lower(btrim(t.to_email))=target_email);
      update public.ownership_claim_evidence e set uploaded_by=null,
        file_name=public._account_deletion_redact_identity(e.file_name,job.actor_id,target_email),
        storage_path=case when public._account_deletion_text_has_identity(e.storage_path,job.actor_id,target_email)
          then 'privacy-removed/'||e.id::text else e.storage_path end,
        private_note=public._account_deletion_redact_identity(e.private_note,job.actor_id,target_email)
        where e.uploaded_by=job.actor_id;
      update public.ownership_claim_events e set actor_user_id=null,
        note=public._account_deletion_redact_identity(e.note,job.actor_id,target_email),
        metadata=public._account_deletion_redact_identity_jsonb(e.metadata,job.actor_id,target_email,job.subject_token)
        from public.ownership_claims c where c.id=e.claim_id and (
          e.actor_user_id=job.actor_id or c.current_owner_id=job.actor_id or c.claimant_user_id=job.actor_id or c.decided_by=job.actor_id
          or c.approved_previous_owner_id=job.actor_id or public._account_deletion_text_has_identity(e.metadata::text,job.actor_id,target_email)
          or (target_email<>'' and lower(btrim(c.recipient_email_normalized))=target_email));
      update public.ownership_claims c set
        current_owner_id=case when c.current_owner_id=job.actor_id then null else c.current_owner_id end,
        claimant_user_id=case when c.claimant_user_id=job.actor_id then null else c.claimant_user_id end,
        decided_by=case when c.decided_by=job.actor_id then null else c.decided_by end,
        recipient_email_normalized=case when target_email<>'' and lower(btrim(c.recipient_email_normalized))=target_email then null else c.recipient_email_normalized end,
        claim_token_hash=null,purchaser_code_hash=null,
        acquisition_details=public._account_deletion_redact_identity(c.acquisition_details,job.actor_id,target_email),
        ownership_declaration=public._account_deletion_redact_identity(c.ownership_declaration,job.actor_id,target_email),
        owner_response_note=public._account_deletion_redact_identity(c.owner_response_note,job.actor_id,target_email),
        admin_review_note=public._account_deletion_redact_identity(c.admin_review_note,job.actor_id,target_email)
        where c.current_owner_id=job.actor_id or c.claimant_user_id=job.actor_id or c.decided_by=job.actor_id
          or (target_email<>'' and lower(btrim(c.recipient_email_normalized))=target_email);

      update public.profiles set account_lock_reason=case when target_email<>'' and lower(coalesce(account_locked_by,''))=target_email then null else account_lock_reason end,
        account_locked_by=case when target_email<>'' and lower(coalesce(account_locked_by,''))=target_email then null else account_locked_by end,
        account_ban_reason=case when target_email<>'' and lower(coalesce(account_banned_by,''))=target_email then null else account_ban_reason end,
        account_banned_by=case when target_email<>'' and lower(coalesce(account_banned_by,''))=target_email then null else account_banned_by end
        where target_email<>'' and (lower(coalesce(account_locked_by,''))=target_email or lower(coalesce(account_banned_by,''))=target_email);
      perform set_config('qrguitar.account_deletion_reviewer',job.actor_id::text,true);
      update public.account_deletion_fulfillments set
        started_by=case when started_by=job.actor_id then null else started_by end,
        last_reviewed_by=case when last_reviewed_by=job.actor_id then null else last_reviewed_by end
        where request_id<>p_request_id and (started_by=job.actor_id or last_reviewed_by=job.actor_id);
      perform set_config('qrguitar.account_deletion_reviewer','',true);

      -- Staged-upload rows are operational receipts, not instrument history.
      -- Every still-staged row blocked above; consumed/tombstoned rows can now
      -- be removed without leaving an Auth UUID or identity-bearing path.
      delete from public.instrument_staged_uploads where owner_id=job.actor_id;
      delete from public.instrument_create_receipts where owner_id=job.actor_id;
      delete from public.site_content where content_key='public_collection_owner:'||job.actor_id::text
        or content_key like 'create_submission:'||job.actor_id::text||':%';
      update public.site_content set updated_by=null where updated_by=job.actor_id;
      delete from public.site_editor_receipts where actor_user_id=job.actor_id;
      update public.admin_audit_events set actor_user_id=null,actor_email=null,reason='Personal information removed after an account deletion request.',metadata='{"redacted":true}'::jsonb
        where actor_user_id=job.actor_id;
      update public.admin_audit_events set target_user_id=null,target_id=null,reason='Personal information removed after an account deletion request.',metadata='{"redacted":true}'::jsonb
        where target_user_id=job.actor_id or target_id=job.actor_id::text;

      perform public._redact_service_corrections(p_request_id,s.guitar_id,null) from public.account_deletion_profile_review_scopes s where s.request_id=p_request_id;
      if public._account_deletion_retained_pii(p_request_id,job.actor_id,target_email) then
        raise exception using errcode='PD500',message='Retained Profile privacy postconditions failed; Auth deletion is blocked.';
      end if;

      delete from public.account_deletion_request_receipts where actor_id=job.actor_id;
      delete from public.account_deletion_actor_revisions where actor_id=job.actor_id;
      -- Detach every historical intake row, including cancelled requests. Auth
      -- deletion otherwise attempts an FK SET NULL on those rows later, outside
      -- this reviewed transaction, and the immutable intake guard rejects it.
      update public.account_deletion_requests set actor_id=null where actor_id=job.actor_id;
      update public.account_deletion_fulfillments set state='ready_for_auth_deletion',blockers='[]'::jsonb,target_email=null,
        revision=revision+1,last_reviewed_by=p_admin_id,reviewed_at=now_at,database_anonymized_at=now_at
        where request_id=p_request_id returning * into job;
        answer:=public._account_deletion_admin_fulfillment_json(job);
      end if;
    end if;
  end if;
  perform set_config('qrguitar.account_deletion_request','',true);
  perform set_config('qrguitar.account_deletion_target_name','',true);
  insert into public.account_deletion_fulfillment_receipts(operation_id,request_id,action,result)
    values(p_operation_id,p_request_id,'prepare',answer);
  return jsonb_build_object('ok',true,'fulfillment',answer,
    'profileReviews',public._account_deletion_profile_reviews_json(p_request_id),
    'retentionReviews',public._account_deletion_retention_reviews_json(p_request_id),
    'storageReviews',public._account_deletion_storage_reviews_json(p_request_id),
    'storageRelocations',public._account_deletion_storage_relocations_json(p_request_id),
    'authActorId',case when job.state='ready_for_auth_deletion' then job.actor_id else null end);
end $function$
;
