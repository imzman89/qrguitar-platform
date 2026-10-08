begin;
-- Additive correction ledger. Original service submissions, events and evidence stay unchanged.
create table public.service_record_corrections (
 id uuid primary key, submission_id uuid not null, guitar_id uuid not null,
 provider_user_id uuid references auth.users(id), provider_subject_id uuid references public.account_deletion_service_subjects(subject_id),
 owner_user_id uuid references auth.users(id), owner_subject_id uuid references public.account_deletion_service_subjects(subject_id),
 revision bigint not null check(revision>0), request_body jsonb not null,
 original_event_id uuid not null, original_event_hash text not null check(original_event_hash ~ '^[a-f0-9]{64}$'), details text not null check(length(btrim(details)) between 1 and 6000),
 submitted_at timestamptz not null default clock_timestamp(),
 check((provider_user_id is not null and provider_subject_id is null) or (provider_user_id is null and provider_subject_id is not null)),
 check((owner_user_id is not null and owner_subject_id is null) or (owner_user_id is null and owner_subject_id is not null))
);
create table public.service_record_correction_decisions (
 id uuid primary key, correction_id uuid not null unique references public.service_record_corrections(id),
 owner_user_id uuid references auth.users(id), owner_subject_id uuid references public.account_deletion_service_subjects(subject_id), revision bigint not null check(revision>0), request_body jsonb not null,
 outcome text not null check(outcome in ('accepted','rejected')),
 is_public boolean not null default false, decided_at timestamptz not null default clock_timestamp(),
 check(outcome='accepted' or not is_public),
 check((owner_user_id is not null and owner_subject_id is null) or (owner_user_id is null and owner_subject_id is not null))
);
create index service_record_corrections_submission on public.service_record_corrections(submission_id,revision desc);

-- Transaction-local row capabilities contain hashes only and are consumed immediately.
create table public.service_correction_cleanup_authorizations (
 transaction_id bigint not null, target_table text not null check(target_table in ('service_record_corrections','service_record_correction_decisions')),
 row_id uuid not null, request_id uuid not null references public.account_deletion_fulfillments(request_id),
 guitar_id uuid not null, before_hash bytea not null, after_hash bytea not null,
 primary key(transaction_id,target_table,row_id)
);
alter table public.service_correction_cleanup_authorizations enable row level security;
revoke all on public.service_correction_cleanup_authorizations from public,anon,authenticated,service_role;
insert into public.account_deletion_identity_inventory(domain,table_name,actor_column,subject_column) values
 ('service','service_record_corrections','provider_user_id','provider_subject_id'),
 ('service','service_record_corrections','owner_user_id','owner_subject_id'),
 ('service','service_record_correction_decisions','owner_user_id','owner_subject_id');
create trigger account_deletion_service_correction_write before insert or update or delete on public.service_record_corrections
 for each row execute function public._account_deletion_write_fence('provider_user_id','owner_user_id');
create trigger account_deletion_service_correction_decision_write before insert or update or delete on public.service_record_correction_decisions
 for each row execute function public._account_deletion_write_fence('owner_user_id');
create trigger account_deletion_service_correction_graph before insert or update or delete on public.service_record_corrections
 for each row execute function public._account_deletion_profile_graph_fence();
create trigger account_deletion_service_correction_decision_graph before insert or update or delete on public.service_record_correction_decisions
 for each row execute function public._account_deletion_profile_graph_fence();

create function public._redact_service_corrections(p_request_id uuid,p_guitar_id uuid,p_terms text[] default null) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare job public.account_deletion_fulfillments; c public.service_record_corrections; d public.service_record_correction_decisions;
 next_details text; next_body jsonb; expected jsonb;
begin
 select * into job from public.account_deletion_fulfillments where request_id=p_request_id for update;
 if not found or job.actor_id is null or current_setting('qrguitar.account_deletion_request',true) is distinct from p_request_id::text
  or not exists(select 1 from public.account_deletion_profile_review_scopes where request_id=p_request_id and guitar_id=p_guitar_id)
  or not ((p_terms is null and job.state='quiescing_storage') or
   (p_terms is not null and job.state='blocked' and current_setting('qrguitar.account_deletion_profile_redaction',true)=p_request_id::text
    and cardinality(p_terms) between 1 and 32 and not exists(select 1 from unnest(p_terms) t where t is null or length(btrim(t)) not between 3 and 200 or t~'[[:cntrl:]]'))) then
  raise exception 'Verified scoped privacy cleanup is required.' using errcode='42501'; end if;
 for c in select * from public.service_record_corrections where guitar_id=p_guitar_id order by id for update loop
  next_details:=case when p_terms is null then public._account_deletion_redact_identity(c.details,job.actor_id,lower(coalesce(job.target_email,'')))
    else public._account_deletion_redact_terms(c.details,p_terms) end;
  next_body:=case when p_terms is null then public._account_deletion_redact_identity_jsonb(c.request_body,job.actor_id,lower(coalesce(job.target_email,'')),job.subject_token)
    else public._account_deletion_redact_terms_jsonb(c.request_body,p_terms,job.subject_token) end;
  expected:=to_jsonb(c)||jsonb_build_object('details',next_details,'request_body',next_body);
  if expected is distinct from to_jsonb(c) then
   insert into public.service_correction_cleanup_authorizations values(txid_current(),'service_record_corrections',c.id,p_request_id,p_guitar_id,
    sha256(convert_to(to_jsonb(c)::text,'UTF8')),sha256(convert_to(expected::text,'UTF8')));
   update public.service_record_corrections set details=next_details,request_body=next_body where id=c.id;
   delete from public.service_correction_cleanup_authorizations where transaction_id=txid_current() and target_table='service_record_corrections' and row_id=c.id;
  end if;
 end loop;
 for d in select d0.* from public.service_record_correction_decisions d0 join public.service_record_corrections c0 on c0.id=d0.correction_id
  where c0.guitar_id=p_guitar_id order by d0.id for update of d0 loop
  next_body:=case when p_terms is null then public._account_deletion_redact_identity_jsonb(d.request_body,job.actor_id,lower(coalesce(job.target_email,'')),job.subject_token)
    else public._account_deletion_redact_terms_jsonb(d.request_body,p_terms,job.subject_token) end;
  expected:=to_jsonb(d)||jsonb_build_object('request_body',next_body);
  if expected is distinct from to_jsonb(d) then
   insert into public.service_correction_cleanup_authorizations values(txid_current(),'service_record_correction_decisions',d.id,p_request_id,p_guitar_id,
    sha256(convert_to(to_jsonb(d)::text,'UTF8')),sha256(convert_to(expected::text,'UTF8')));
   update public.service_record_correction_decisions set request_body=next_body where id=d.id;
   delete from public.service_correction_cleanup_authorizations where transaction_id=txid_current() and target_table='service_record_correction_decisions' and row_id=d.id;
  end if;
 end loop;
end;
$$;
revoke all on function public._redact_service_corrections(uuid,uuid,text[]) from public,anon,authenticated,service_role;

create function public.protect_service_record_correction() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin
 if tg_op='UPDATE' and public._account_deletion_identity_update_allowed('service',tg_table_name,to_jsonb(old),to_jsonb(new)) then return new;end if;
 if tg_op='UPDATE' and exists(
  select 1 from public.service_correction_cleanup_authorizations a join public.account_deletion_fulfillments f on f.request_id=a.request_id
  where a.transaction_id=txid_current() and a.target_table=tg_table_name and a.row_id=old.id
   and a.before_hash=sha256(convert_to(to_jsonb(old)::text,'UTF8')) and a.after_hash=sha256(convert_to(to_jsonb(new)::text,'UTF8'))
   and f.actor_id is not null and f.state in ('blocked','quiescing_storage')
   and current_setting('qrguitar.account_deletion_request',true)=f.request_id::text
   and exists(select 1 from public.account_deletion_profile_review_scopes s where s.request_id=f.request_id and s.guitar_id=a.guitar_id)
   and ((tg_table_name='service_record_corrections' and to_jsonb(old)->>'guitar_id'=a.guitar_id::text
    and to_jsonb(old)-array['details','request_body']::text[]=to_jsonb(new)-array['details','request_body']::text[])
    or (tg_table_name='service_record_correction_decisions' and to_jsonb(old)-'request_body'=to_jsonb(new)-'request_body'
     and exists(select 1 from public.service_record_corrections c where c.id=(to_jsonb(old)->>'correction_id')::uuid and c.guitar_id=a.guitar_id)))
 ) then return new;end if;
 raise exception 'Service corrections and their decisions are append-only.' using errcode='42501';
end;
$$;
create trigger service_record_correction_immutable before update or delete on public.service_record_corrections
 for each row execute function public.protect_service_record_correction();
create trigger service_record_correction_decision_immutable before update or delete on public.service_record_correction_decisions
 for each row execute function public.protect_service_record_correction();
alter table public.service_record_corrections enable row level security;
alter table public.service_record_correction_decisions enable row level security;
revoke all on public.service_record_corrections,public.service_record_correction_decisions from public,anon,authenticated,service_role;


-- Fail closed on every current function body; both hashes are generated from native source.
do $correction_privacy_patches$
declare item jsonb; edit jsonb; function_oid oid; old_body text; new_body text; definition text;
begin
 for item in select value from jsonb_array_elements($patches$
[{"signature":"public._account_deletion_sync_profile_review_scope(uuid,uuid,text)","beforeSha256":"07ad959cf6b24cb3a67acf357cca7b0c257faadc31c3a0ee1e27b6ba6f7866ef","afterSha256":"a9a1519ecb009f3ef9743a68226829c1ecb7b6525a6af34ab7ea737ecee71fe2","replacements":[{"before":"  ) links join public.guitars current_g","after":"    union all select c.guitar_id,'service_participant' from public.service_record_corrections c where c.provider_user_id=p_actor_id or c.owner_user_id=p_actor_id\n      or public._account_deletion_text_has_identity(concat_ws('|',c.details,c.request_body::text),p_actor_id,p_email)\n    union all select c.guitar_id,'service_participant' from public.service_record_correction_decisions d join public.service_record_corrections c on c.id=d.correction_id\n      where d.owner_user_id=p_actor_id or public._account_deletion_text_has_identity(d.request_body::text,p_actor_id,p_email)\n  ) links join public.guitars current_g"}]},{"signature":"public._account_deletion_profile_review_graph(uuid,uuid)","beforeSha256":"3011431cede124fa4bc47c11fd2041090ebf32871382d9a6f62e04b0a7eb2cec","afterSha256":"d03a11f465c2ef6ef5247344bd90c7791acb8a9c7e2d986ae37518335ead3909","replacements":[{"before":"    'serviceSubmissions',","after":"    'serviceCorrections',(select coalesce(jsonb_agg(to_jsonb(x)-array['provider_user_id','provider_subject_id','owner_user_id','owner_subject_id']::text[] order by x.id),'[]'::jsonb) from public.service_record_corrections x where x.guitar_id=p_guitar_id),\n    'serviceCorrectionDecisions',(select coalesce(jsonb_agg(to_jsonb(x)-array['owner_user_id','owner_subject_id']::text[] order by x.id),'[]'::jsonb) from public.service_record_correction_decisions x join public.service_record_corrections c on c.id=x.correction_id where c.guitar_id=p_guitar_id),\n    'serviceSubmissions',"}]},{"signature":"public._account_deletion_service_graph(uuid,uuid)","beforeSha256":"f0c13f857a00ab5d8fc123cb8c56baee78f06b73a64acdf28c6d116032b4b37b","afterSha256":"4ce118e5d05a0fbbe823873c198cec6ca2f2aca4c7a67fbe3e37937fcea5835e","replacements":[{"before":"  )\n  select jsonb_build_object(","after":"    union select c.submission_id from public.service_record_corrections c where c.provider_user_id=p_actor_id or c.owner_user_id=p_actor_id or c.provider_subject_id=p_subject_id or c.owner_subject_id=p_subject_id\n    union select c.submission_id from public.service_record_correction_decisions d join public.service_record_corrections c on c.id=d.correction_id where d.owner_user_id=p_actor_id or d.owner_subject_id=p_subject_id\n  )\n  select jsonb_build_object("},{"before":"    'submissions',","after":"    'corrections',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb) from public.service_record_corrections x where x.submission_id in (select id from linked_submissions)),\n    'correctionDecisions',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb) from public.service_record_correction_decisions x join public.service_record_corrections c on c.id=x.correction_id where c.submission_id in (select id from linked_submissions)),\n    'submissions',"}]},{"signature":"public._account_deletion_unscoped_personal_content(uuid,text)","beforeSha256":"9ee9ba6657a6bfbb697df4e7699144a33d53a7d846934be0782a2b8a212eddcc","afterSha256":"8255c0f2714c7ce305f838b7cdff8fa8249a515800a6868d8819c813d5787bd2","replacements":[{"before":"      concat_ws('|',a.actor_email,a.target_id,a.reason,a.metadata::text),p_actor_id,p_email))","after":"      concat_ws('|',a.actor_email,a.target_id,a.reason,a.metadata::text),p_actor_id,p_email))\n  or exists(select 1 from public.service_record_corrections c where c.provider_user_id is distinct from p_actor_id and c.owner_user_id is distinct from p_actor_id\n    and public._account_deletion_text_has_identity(concat_ws('|',c.details,c.request_body::text),p_actor_id,p_email))\n  or exists(select 1 from public.service_record_correction_decisions d join public.service_record_corrections c on c.id=d.correction_id\n    where d.owner_user_id is distinct from p_actor_id and c.provider_user_id is distinct from p_actor_id and c.owner_user_id is distinct from p_actor_id\n    and public._account_deletion_text_has_identity(d.request_body::text,p_actor_id,p_email))"}]},{"signature":"public._account_deletion_retained_pii(uuid,uuid,text)","beforeSha256":"591f901458b179e249cd300d9865db5ed5f199b1da72f03cb7e53d5c288ee9d0","afterSha256":"c5fb947a36e5f57ea3f6bba960a564d68cc36ac1650e7baa0e16fb16a77931cd","replacements":[{"before":"  or public._account_deletion_promo_retained_pii(p_actor_id,p_email)","after":"  or public._account_deletion_promo_retained_pii(p_actor_id,p_email)\n  or exists(select 1 from public.service_record_corrections c where public._account_deletion_text_has_identity(concat_ws('|',c.details,c.request_body::text),p_actor_id,p_email))\n  or exists(select 1 from public.service_record_correction_decisions d where public._account_deletion_text_has_identity(d.request_body::text,p_actor_id,p_email))"}]},{"signature":"public._account_deletion_profile_has_exact_identity(uuid,uuid,text)","beforeSha256":"5148a8513daaffd1d9c5a66f1d1eb54e9ffb654a985f6bc6ba9463645cfa9999","afterSha256":"f5ba730721a13f9b0e0bbc5699aaa5defea53621f61ea29c0dfdfe420ca1d08f","replacements":[{"before":"      and public._account_deletion_text_has_identity((to_jsonb(x)-array['updated_by']::text[])::text,p_actor_id,p_email))","after":"      and public._account_deletion_text_has_identity((to_jsonb(x)-array['updated_by']::text[])::text,p_actor_id,p_email))\n  or exists(select 1 from public.service_record_corrections c where c.guitar_id=p_guitar_id and public._account_deletion_text_has_identity(concat_ws('|',c.details,c.request_body::text),p_actor_id,p_email))\n  or exists(select 1 from public.service_record_correction_decisions d join public.service_record_corrections c on c.id=d.correction_id where c.guitar_id=p_guitar_id and public._account_deletion_text_has_identity(d.request_body::text,p_actor_id,p_email))"}]},{"signature":"public._account_deletion_migrate_service_subject(uuid,uuid,uuid)","beforeSha256":"d09de73b2e0b0c6d3f6f48574fe1ce31f6bd7039b5eefdb0f6d3059744db9ad6","afterSha256":"fc4621970ea8949b5f09f3845fa0d28a9805aee799ea6c3182af0e6dd964dab4","replacements":[{"before":"  perform set_config('qrguitar.account_deletion_identity_migration','',true);","after":"  update public.service_record_corrections set\n    provider_user_id=case when provider_user_id=p_actor_id then null else provider_user_id end,\n    provider_subject_id=case when provider_user_id=p_actor_id then v_subject_id else provider_subject_id end,\n    owner_user_id=case when owner_user_id=p_actor_id then null else owner_user_id end,\n    owner_subject_id=case when owner_user_id=p_actor_id then v_subject_id else owner_subject_id end\n    where provider_user_id=p_actor_id or owner_user_id=p_actor_id;\n  update public.service_record_correction_decisions set owner_user_id=null,owner_subject_id=v_subject_id where owner_user_id=p_actor_id;\n  perform set_config('qrguitar.account_deletion_identity_migration','',true);"}]},{"signature":"public._account_deletion_profile_graph_fence()","beforeSha256":"541f152bdd3cef9f321df712370e4034db5b5cf1401ff77640671fd19a310974","afterSha256":"cd72541f09f06a4cac1bd2d78ea25324f321b855bccef07a32ef3cdf473a73d6","replacements":[{"before":"  elsif tg_table_name='site_content' then","after":"  elsif tg_table_name='service_record_correction_decisions' then\n    for v_id in select distinct c.guitar_id from public.service_record_corrections c where c.id in (\n      case when tg_op<>'INSERT' then nullif(to_jsonb(old)->>'correction_id','')::uuid end,\n      case when tg_op<>'DELETE' then nullif(to_jsonb(new)->>'correction_id','')::uuid end) loop\n      v_related:=array_append(v_related,v_id);\n    end loop;\n  elsif tg_table_name='site_content' then"}]},{"signature":"public.prepare_account_deletion_fulfillment(uuid,boolean,uuid,uuid,text[])","beforeSha256":"a1a3c3d6d64d5826673099a32d1bde2b55a1dd1d5014d6f867aac14f37a45997","afterSha256":"9bfb155b89a5427288b103258e3ae7111f7030465a51df67ba19f65aa7ead3c0","replacements":[{"before":"      if public._account_deletion_retained_pii(p_request_id,job.actor_id,target_email) then","after":"      perform public._redact_service_corrections(p_request_id,s.guitar_id,null) from public.account_deletion_profile_review_scopes s where s.request_id=p_request_id;\n      if public._account_deletion_retained_pii(p_request_id,job.actor_id,target_email) then"}]},{"signature":"public.redact_account_deletion_profile_review(uuid,boolean,uuid,uuid,uuid,text,text[])","beforeSha256":"62f5fd939a13c0d6a2e13e0f9a4614e19c11763c4b52b29f0b0a37395cd89bb3","afterSha256":"1801091ad234393584d646c32511b8ff88e4ef4204b73b62f8f84257f471debb","replacements":[{"before":"  perform set_config('qrguitar.account_deletion_profile_redaction','',true);","after":"  perform public._redact_service_corrections(p_request_id,p_guitar_id,normalized_terms);\n  perform set_config('qrguitar.account_deletion_profile_redaction','',true);"}]}]
$patches$::jsonb) loop
  function_oid:=to_regprocedure(item->>'signature');
  if function_oid is null then raise exception 'Required privacy function missing: %',item->>'signature';end if;
  select replace(prosrc,E'\r\n',E'\n') into old_body from pg_proc where oid=function_oid;
  if encode(sha256(convert_to(old_body,'UTF8')),'hex')<>item->>'beforeSha256' then raise exception 'Privacy source differs: %',item->>'signature';end if;
  new_body:=old_body;
  for edit in select value from jsonb_array_elements(item->'replacements') loop
   if (length(new_body)-length(replace(new_body,edit->>'before','')))/length(edit->>'before')<>1 then raise exception 'Exact single privacy anchor required: %',item->>'signature';end if;
   new_body:=replace(new_body,edit->>'before',edit->>'after');
  end loop;
  if encode(sha256(convert_to(new_body,'UTF8')),'hex')<>item->>'afterSha256' then raise exception 'Patched privacy source differs: %',item->>'signature';end if;
  definition:=replace(pg_get_functiondef(function_oid),E'\r\n',E'\n');
  if (length(definition)-length(replace(definition,old_body,'')))/length(old_body)<>1 then raise exception 'Exact privacy function definition required: %',item->>'signature';end if;
  execute replace(definition,old_body,new_body);
 end loop;
end
$correction_privacy_patches$;

create function public.read_service_corrections(p_actor_id uuid,p_submission_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare s public.service_submissions%rowtype; g public.guitars%rowtype; e public.guitar_timeline_events%rowtype; rev bigint;
begin
 if not exists(select 1 from public.profiles where id=p_actor_id and account_status='active') then
  raise exception 'An active account is required.' using errcode='42501'; end if;
 select * into s from public.service_submissions where id=p_submission_id;
 select * into g from public.guitars where id=s.guitar_id;
 if s.id is null or g.id is null or g.owner_id is null or g.admin_archived_at is not null or g.owner_removed_at is not null
  or s.status<>'approved' or (p_actor_id is distinct from s.provider_user_id and p_actor_id is distinct from g.owner_id) then
  raise exception 'Approved service record unavailable.' using errcode='P0002'; end if;
 select * into e from public.guitar_timeline_events where id=s.resulting_service_event_id and guitar_id=g.id
  and service_submission_id=s.id and source_kind='provider_submitted_owner_approved';
 if not found then raise exception 'Original approved event unavailable.' using errcode='PT409'; end if;
 select (select count(*) from public.service_record_corrections where submission_id=s.id)+
  (select count(*) from public.service_record_correction_decisions d join public.service_record_corrections c on c.id=d.correction_id where c.submission_id=s.id) into rev;
 return jsonb_build_object('submissionId',s.id,'revision',rev,'eventUpdatedAt',e.updated_at,
  'canPropose',p_actor_id=s.provider_user_id and p_actor_id is distinct from g.owner_id,
  'canReview',p_actor_id=g.owner_id and p_actor_id is distinct from s.provider_user_id,
  'original',jsonb_build_object('id',e.id,'title',e.title,'details',e.description,'serviceDate',e.event_date,
   'partsInstalled',e.parts_installed,'setupMeasurements',e.setup_measurements),
  'corrections',coalesce((select jsonb_agg(x.value order by x.revision desc) from (
   select c.revision,jsonb_build_object('id',c.id,'details',c.details,'submittedAt',c.submitted_at,
    'outcome',coalesce(d.outcome,'pending'),'isPublic',coalesce(d.is_public,false),'decidedAt',d.decided_at,
    'canAccept',d.id is null and c.owner_user_id=g.owner_id and c.original_event_hash=encode(sha256(convert_to(to_jsonb(e)::text,'UTF8')),'hex'),'canReject',d.id is null) as value
   from public.service_record_corrections c left join public.service_record_correction_decisions d on d.correction_id=c.id
   where c.submission_id=s.id order by c.revision desc limit 50) x),'[]'::jsonb));
end;
$$;

create function public.mutate_service_correction(p_actor_id uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare op text; rid uuid; sid uuid; gid uuid; rev bigint; want bigint;
 s public.service_submissions%rowtype; g public.guitars%rowtype; e public.guitar_timeline_events%rowtype;
 c public.service_record_corrections%rowtype; d public.service_record_correction_decisions%rowtype;
 cid uuid; body text; share boolean;
begin
 if p_request is null or jsonb_typeof(p_request)<>'object' then raise exception 'Invalid correction request.' using errcode='22023'; end if;
 op:=p_request->>'action';
 if op is null or op not in ('propose','accept','reject') or exists(select 1 from jsonb_object_keys(p_request) k
  where k not in ('action','requestId','submissionId','expectedRevision','expectedEventUpdatedAt','correctionId','details','sharePublicly')) then
  raise exception 'Unsupported correction fields.' using errcode='22023'; end if;
 rid:=(p_request->>'requestId')::uuid; sid:=(p_request->>'submissionId')::uuid;
 if rid is null or sid is null or jsonb_typeof(p_request->'expectedRevision') is distinct from 'number'
  or (p_request->>'expectedRevision') !~ '^(0|[1-9][0-9]*)$' then raise exception 'Review the current correction revision.' using errcode='22023'; end if;
 want:=(p_request->>'expectedRevision')::bigint;
 if not exists(select 1 from public.profiles where id=p_actor_id and account_status='active') then
  raise exception 'An active account is required.' using errcode='42501'; end if;
 select guitar_id into gid from public.service_submissions where id=sid;
 -- Same instrument-first order as confirmation and ownership writers.
 select * into g from public.guitars where id=gid for update;
 select * into s from public.service_submissions where id=sid for update;
 if s.id is null or g.id is null or g.owner_id is null or g.admin_archived_at is not null or g.owner_removed_at is not null or s.status<>'approved'
  or s.guitar_id is distinct from g.id then raise exception 'Approved service record unavailable.' using errcode='P0002'; end if;
 select * into e from public.guitar_timeline_events where id=s.resulting_service_event_id and guitar_id=g.id
  and service_submission_id=s.id and source_kind='provider_submitted_owner_approved' for update;
 if not found then raise exception 'Original approved event unavailable.' using errcode='PT409'; end if;
 if op='propose' then
  if p_actor_id is distinct from s.provider_user_id or p_actor_id is not distinct from g.owner_id then
   raise exception 'Only the original provider can propose a correction.' using errcode='42501'; end if;
  if p_request ? 'correctionId' or p_request ? 'sharePublicly' or jsonb_typeof(p_request->'details') is distinct from 'string' then
   raise exception 'Use correction text only; the owner chooses sharing.' using errcode='22023'; end if;
  body:=btrim(p_request->>'details');
  if length(body) not between 1 and 6000 or p_request->>'expectedEventUpdatedAt' is null then
   raise exception 'Correction text and original event revision are required.' using errcode='22023'; end if;
  select * into c from public.service_record_corrections where id=rid;
  if found then
   if c.provider_user_id is distinct from p_actor_id or c.owner_user_id is distinct from g.owner_id then raise exception 'Correction receipt is unavailable.' using errcode='42501'; end if;
   if c.request_body is distinct from p_request then raise exception 'Request identity already used.' using errcode='PT409'; end if;
   return jsonb_build_object('committed',true,'id',c.id,'revision',c.revision,'replayed',true);
  end if;
  if exists(select 1 from public.service_record_correction_decisions where id=rid) then raise exception 'Request identity already used.' using errcode='PT409'; end if;
 else
  if p_actor_id is distinct from g.owner_id or p_actor_id is not distinct from s.provider_user_id then
   raise exception 'Only the current owner can review a provider correction.' using errcode='42501'; end if;
  if p_request ? 'details' or p_request ? 'expectedEventUpdatedAt' or jsonb_typeof(p_request->'sharePublicly') is distinct from 'boolean' then
   raise exception 'Choose whether to share this correction.' using errcode='22023'; end if;
  cid:=(p_request->>'correctionId')::uuid; share:=(p_request->>'sharePublicly')::boolean;
  if cid is null or (op='reject' and share) then raise exception 'Invalid correction decision.' using errcode='22023'; end if;
  select * into d from public.service_record_correction_decisions where id=rid;
  if found then
   if d.owner_user_id is distinct from p_actor_id then raise exception 'Decision receipt is unavailable.' using errcode='42501'; end if;
   if d.request_body is distinct from p_request then raise exception 'Request identity already used.' using errcode='PT409'; end if;
   return jsonb_build_object('committed',true,'id',d.id,'revision',d.revision,'replayed',true);
  end if;
  if exists(select 1 from public.service_record_corrections where id=rid) then raise exception 'Request identity already used.' using errcode='PT409'; end if;
 end if;
 select (select count(*) from public.service_record_corrections where submission_id=s.id)+
  (select count(*) from public.service_record_correction_decisions d0 join public.service_record_corrections c0 on c0.id=d0.correction_id where c0.submission_id=s.id) into rev;
 if want is distinct from rev then raise exception 'Correction history changed. Reload.' using errcode='PT409'; end if;
 if op='propose' then
  if (p_request->>'expectedEventUpdatedAt')::timestamptz is distinct from e.updated_at then raise exception 'Original event changed. Reload.' using errcode='PT409'; end if;
  if exists(select 1 from public.service_record_corrections c0 where c0.submission_id=s.id
   and not exists(select 1 from public.service_record_correction_decisions d0 where d0.correction_id=c0.id)) then
   raise exception 'An earlier correction still needs an owner decision.' using errcode='PT409'; end if;
  if (select count(*) from public.service_record_corrections where provider_user_id=p_actor_id and submitted_at>clock_timestamp()-interval '1 hour')>=20 then
   raise exception 'Correction limit reached.' using errcode='P0429'; end if;
  insert into public.service_record_corrections(id,submission_id,guitar_id,provider_user_id,owner_user_id,revision,request_body,original_event_id,original_event_hash,details)
   values(rid,s.id,g.id,p_actor_id,g.owner_id,rev+1,p_request,e.id,encode(sha256(convert_to(to_jsonb(e)::text,'UTF8')),'hex'),body);
 else
  select * into c from public.service_record_corrections where id=cid and submission_id=s.id;
  if not found then raise exception 'Correction unavailable.' using errcode='P0002'; end if;
  if op='accept' and (c.owner_user_id is distinct from g.owner_id or c.original_event_hash is distinct from encode(sha256(convert_to(to_jsonb(e)::text,'UTF8')),'hex')) then
   raise exception 'Ownership or the original event changed. Restart review.' using errcode='PT409'; end if;
  if exists(select 1 from public.service_record_correction_decisions where correction_id=c.id) then raise exception 'Correction already reviewed.' using errcode='PT409'; end if;
  insert into public.service_record_correction_decisions(id,correction_id,owner_user_id,revision,request_body,outcome,is_public)
   values(rid,c.id,p_actor_id,rev+1,p_request,case op when 'accept' then 'accepted' else 'rejected' end,share);
 end if;
 return jsonb_build_object('committed',true,'id',rid,'revision',rev+1,'replayed',false);
end;
$$;

create function public.read_public_service_corrections(p_qr_code text) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select coalesce(jsonb_agg(x.value order by x.decided_at desc),'[]'::jsonb) from (
  select d.decided_at,jsonb_build_object('id',c.id,'submissionId',c.submission_id,'originalEventId',e.id,
   'originalServiceDate',e.event_date,'originalTitle',case when e.is_public then e.title else 'Approved service record' end,'details',c.details,
   'submittedAt',c.submitted_at,'decidedAt',d.decided_at) value
  from public.service_record_corrections c join public.service_record_correction_decisions d on d.correction_id=c.id
  join public.guitar_timeline_events e on e.id=c.original_event_id and e.guitar_id=c.guitar_id
   and e.service_submission_id=c.submission_id and e.source_kind='provider_submitted_owner_approved'
  join public.guitars g on g.id=c.guitar_id join public.profiles p on p.id=g.owner_id
  where g.qr_code=p_qr_code and g.visibility in ('public','unlisted') and g.admin_archived_at is null and g.owner_removed_at is null
   and p.account_status='active' and not p.hide_public_content and d.outcome='accepted' and d.is_public
  order by d.decided_at desc,c.id limit 50
 ) x
$$;
revoke all on function public.protect_service_record_correction(),public.read_service_corrections(uuid,uuid),
 public.mutate_service_correction(uuid,jsonb),public.read_public_service_corrections(text) from public,anon,authenticated;
grant execute on function public.read_service_corrections(uuid,uuid),public.mutate_service_correction(uuid,jsonb),
 public.read_public_service_corrections(text) to service_role;
revoke all on function public.protect_service_record_correction() from service_role;
notify pgrst,'reload schema';
commit;
