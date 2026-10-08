
-- Each delivery has an immutable operation UUID; repeated pages do not count as new coverage.
LOCK TABLE public.account_deletion_review_page_receipts IN ACCESS EXCLUSIVE MODE;
do $schema_guard$ begin
 if (jsonb_build_object('constraints',(SELECT jsonb_agg(jsonb_build_object('name',conname,'type',contype,'definition',pg_get_constraintdef(oid),'index',conindid::regclass::text,'validated',convalidated) ORDER BY conname) FROM pg_constraint WHERE conrelid='public.account_deletion_review_page_receipts'::regclass),'indexes',(SELECT jsonb_agg(jsonb_build_object('name',ci.relname,'definition',pg_get_indexdef(i.indexrelid),'unique',i.indisunique,'primary',i.indisprimary,'valid',i.indisvalid,'ready',i.indisready,'replident',i.indisreplident,'clustered',i.indisclustered,'predicate',pg_get_expr(i.indpred,i.indrelid)) ORDER BY ci.relname) FROM pg_index i JOIN pg_class ci ON ci.oid=i.indexrelid WHERE i.indrelid='public.account_deletion_review_page_receipts'::regclass),'table',(SELECT jsonb_build_object('owner',pg_get_userbyid(relowner),'acl',relacl::text,'rls',relrowsecurity,'forceRls',relforcerowsecurity) FROM pg_class WHERE oid='public.account_deletion_review_page_receipts'::regclass),'triggers',(SELECT jsonb_agg(jsonb_build_object('name',tgname,'enabled',tgenabled,'definition',pg_get_triggerdef(oid)) ORDER BY tgname) FROM pg_trigger WHERE tgrelid='public.account_deletion_review_page_receipts'::regclass AND NOT tgisinternal),'policies',(SELECT jsonb_agg(jsonb_build_object('name',polname,'command',polcmd,'roles',polroles,'qual',pg_get_expr(polqual,polrelid),'check',pg_get_expr(polwithcheck,polrelid)) ORDER BY polname) FROM pg_policy WHERE polrelid='public.account_deletion_review_page_receipts'::regclass))) is distinct from $schema_preimage${"table":{"acl":"{postgres=arwdDxtm/postgres}","rls":true,"owner":"postgres","forceRls":true},"indexes":[{"name":"account_deletion_review_page__request_id_kind_scope_key_con_key","ready":true,"valid":true,"unique":true,"primary":false,"clustered":false,"predicate":null,"replident":false,"definition":"CREATE UNIQUE INDEX account_deletion_review_page__request_id_kind_scope_key_con_key ON public.account_deletion_review_page_receipts USING btree (request_id, kind, scope_key, content_fingerprint, page_index, reviewed_by)"},{"name":"account_deletion_review_page_receipts_pkey","ready":true,"valid":true,"unique":true,"primary":true,"clustered":false,"predicate":null,"replident":false,"definition":"CREATE UNIQUE INDEX account_deletion_review_page_receipts_pkey ON public.account_deletion_review_page_receipts USING btree (operation_id)"}],"policies":[{"name":"account_deletion_review_page_receipts_no_direct_access","qual":"false","check":"false","roles":["0"],"command":"*"}],"triggers":[{"name":"account_deletion_review_page_receipts_immutable","enabled":"O","definition":"CREATE TRIGGER account_deletion_review_page_receipts_immutable BEFORE DELETE OR UPDATE ON public.account_deletion_review_page_receipts FOR EACH ROW EXECUTE FUNCTION _account_deletion_fulfillment_guard()"}],"constraints":[{"name":"account_deletion_review_page__request_id_kind_scope_key_con_key","type":"u","index":"account_deletion_review_page__request_id_kind_scope_key_con_key","validated":true,"definition":"UNIQUE (request_id, kind, scope_key, content_fingerprint, page_index, reviewed_by)"},{"name":"account_deletion_review_page_receipts_check","type":"c","index":"-","validated":true,"definition":"CHECK (((page_count >= 1) AND (page_index < page_count)))"},{"name":"account_deletion_review_page_receipts_content_fingerprint_check","type":"c","index":"-","validated":true,"definition":"CHECK ((octet_length(content_fingerprint) = 32))"},{"name":"account_deletion_review_page_receipts_kind_check","type":"c","index":"-","validated":true,"definition":"CHECK ((kind = ANY (ARRAY['profile'::text, 'retention'::text])))"},{"name":"account_deletion_review_page_receipts_page_digest_check","type":"c","index":"-","validated":true,"definition":"CHECK ((octet_length(page_digest) = 32))"},{"name":"account_deletion_review_page_receipts_page_index_check","type":"c","index":"-","validated":true,"definition":"CHECK ((page_index >= 0))"},{"name":"account_deletion_review_page_receipts_pkey","type":"p","index":"account_deletion_review_page_receipts_pkey","validated":true,"definition":"PRIMARY KEY (operation_id)"},{"name":"account_deletion_review_page_receipts_request_id_fkey","type":"f","index":"account_deletion_fulfillments_pkey","validated":true,"definition":"FOREIGN KEY (request_id) REFERENCES account_deletion_fulfillments(request_id) ON DELETE CASCADE"}]}$schema_preimage$::jsonb then raise exception 'Pinned review receipt schema preimage changed';end if;
 if to_regclass('public.account_deletion_review_page_scope_lookup') is not null then raise exception 'Review scope lookup index already exists';end if;
end $schema_guard$;
CREATE INDEX account_deletion_review_page_scope_lookup ON public.account_deletion_review_page_receipts (request_id,kind,scope_key,content_fingerprint,page_index,reviewed_by);
ALTER TABLE public.account_deletion_review_page_receipts DROP CONSTRAINT account_deletion_review_page__request_id_kind_scope_key_con_key;
do $guard$ begin
 if encode(sha256(convert_to(replace(pg_get_functiondef('public.inspect_account_deletion_review_page(uuid,boolean,uuid,uuid,text,uuid,text,text,integer)'::regprocedure),E'\r\n',E'\n'),'UTF8')),'hex') is distinct from '6f1518ba48ecc2e983f55b44a0fd6d2cca3847c5f29fa7825a86df12b3a57f22' then raise exception 'Pinned function preimage changed';end if;
end $guard$;
CREATE OR REPLACE FUNCTION public.inspect_account_deletion_review_page(p_admin_id uuid, p_environment_admin boolean, p_request_id uuid, p_operation_id uuid, p_kind text, p_guitar_id uuid, p_domain text, p_expected_fingerprint text, p_page_index integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare job public.account_deletion_fulfillments; scope_row public.account_deletion_profile_review_scopes;
  actual bytea; safe_graph jsonb; page_rows jsonb; sections jsonb; total_rows integer; v_page_count integer;
  v_page_digest bytea; v_scope_key text; existing public.account_deletion_review_page_receipts; output jsonb;
begin
  if p_request_id is null or p_operation_id is null or p_kind not in ('profile','retention')
    or coalesce(p_expected_fingerprint,'')!~'^[a-f0-9]{64}$' or p_page_index is null or p_page_index<0 then
    raise exception using errcode='22023',message='An exact review page and fingerprint are required.';end if;
  perform public._account_deletion_admin(p_admin_id,p_environment_admin);
  perform pg_advisory_xact_lock(hashtextextended('qrguitar:deletion-operation:'||p_operation_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended('qrguitar:account-deletion:'||p_request_id::text,0));
  select * into job from public.account_deletion_fulfillments where request_id=p_request_id for update;
  if not found or job.state<>'blocked' then raise exception using errcode='PD409',message='This privacy review is not open.';end if;
  if exists(select 1 from public.account_deletion_fulfillment_receipts where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_profile_review_attestations where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_retention_attestations where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_storage_content_reviews where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_custody_evidence_reviews where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_custody_release_receipts where operation_id=p_operation_id)
    or exists(select 1 from public.account_deletion_storage_relocations where finalize_operation_id=p_operation_id or complete_operation_id=p_operation_id) then
    raise exception using errcode='PD409',message='This operation UUID belongs to another deletion action.';end if;
  if p_kind='profile' then
    if p_guitar_id is null or p_domain is not null then raise exception using errcode='22023',message='A Profile review requires only its Profile UUID.';end if;
    perform pg_advisory_xact_lock(hashtextextended('qrguitar:profile-graph:'||p_guitar_id::text,0));
    select * into scope_row from public.account_deletion_profile_review_scopes where request_id=p_request_id and guitar_id=p_guitar_id;
    if not found then raise exception using errcode='PD404',message='This Profile is not in the deletion review scope.';end if;
    actual:=public._account_deletion_profile_fingerprint(p_request_id,p_guitar_id);v_scope_key:=p_guitar_id::text;
    safe_graph:=public._account_deletion_review_safe_jsonb(public._account_deletion_profile_review_graph(p_request_id,p_guitar_id))-'ownerScope';
  else
    if p_guitar_id is not null or p_domain not in ('billing','service') then raise exception using errcode='22023',message='A retention review requires its domain.';end if;
    perform pg_advisory_xact_lock(hashtextextended('qrguitar:account-deletion-retention:'||p_request_id::text||':'||p_domain,0));
    if p_domain='billing' then perform pg_advisory_xact_lock(hashtextextended('qrguitar:billing-ledger',0));end if;
    actual:=public._account_deletion_retention_fingerprint(p_request_id,p_domain);v_scope_key:=p_domain;
    safe_graph:=public._account_deletion_review_safe_jsonb(public._account_deletion_redact_identity_jsonb(
      public._account_deletion_strip_internal_identity(case when p_domain='billing' then public._account_deletion_billing_graph(job.actor_id,null)
        else public._account_deletion_service_graph(job.actor_id,null) end),job.actor_id,lower(coalesce(job.target_email,'')),job.subject_token));
  end if;
  if actual is null or encode(actual,'hex')<>p_expected_fingerprint then raise exception using errcode='PD412',message='Reviewed records changed; load the latest fingerprint.';end if;
  select count(*)::integer into total_rows from jsonb_each(safe_graph) e
    cross join lateral jsonb_array_elements(case when jsonb_typeof(e.value)='array' then e.value else jsonb_build_array(e.value) end) v;
  v_page_count:=greatest(1,ceil(total_rows/50.0)::integer);
  if p_page_index>=v_page_count then raise exception using errcode='22023',message='This review page does not exist.';end if;
  with flattened as (
    select e.key section_code,v.value record,v.ordinality,row_number() over(order by e.key,v.ordinality) rn
    from jsonb_each(safe_graph) e cross join lateral
      jsonb_array_elements(case when jsonb_typeof(e.value)='array' then e.value else jsonb_build_array(e.value) end) with ordinality v(value,ordinality)
  ), selected as (select * from flattened where rn between p_page_index*50+1 and (p_page_index+1)*50),
  grouped as (select section_code,jsonb_agg(record order by ordinality) records from selected group by section_code)
  select coalesce(jsonb_object_agg(section_code,records),'{}'::jsonb) into page_rows from grouped;
  v_page_digest:=sha256(convert_to(p_expected_fingerprint||':'||p_page_index::text||':'||v_page_count::text||':'||page_rows::text,'UTF8'));
  select coalesce(jsonb_agg(jsonb_build_object('code',e.key,'label',initcap(regexp_replace(e.key,'([A-Z])',' \1','g')),
    'recordCount',case when jsonb_typeof(e.value)='array' then jsonb_array_length(e.value) else 1 end,
    'contentDigest',encode(sha256(convert_to(e.value::text,'UTF8')),'hex'),'records',coalesce(page_rows->e.key,'[]'::jsonb)) order by e.key),'[]'::jsonb)
    into sections from jsonb_each(safe_graph) e where p_kind='retention' or e.key not in ('policyVersion','requestId','guitarId','scope');
  select * into existing from public.account_deletion_review_page_receipts where operation_id=p_operation_id;
  if found then
    if existing.request_id<>p_request_id or existing.kind<>p_kind or existing.scope_key<>v_scope_key
      or existing.content_fingerprint<>actual or existing.page_index<>p_page_index or existing.page_count<>v_page_count or existing.page_digest<>v_page_digest then
      raise exception using errcode='PD409',message='This operation UUID belongs to another review page.';end if;
  else
    insert into public.account_deletion_review_page_receipts(operation_id,request_id,kind,scope_key,content_fingerprint,page_index,page_count,page_digest,reviewed_by,result)
      values(p_operation_id,p_request_id,p_kind,v_scope_key,actual,p_page_index,v_page_count,v_page_digest,p_admin_id,
        jsonb_build_object('contentFingerprint',p_expected_fingerprint,'pageIndex',p_page_index,'pageCount',v_page_count,'pageDigest',encode(v_page_digest,'hex')));
  end if;
  output:=jsonb_build_object('ok',true,'kind',p_kind,'policyVersion',1,'contentFingerprint',p_expected_fingerprint,'truncated',false,
    'pageIndex',p_page_index,'pageCount',v_page_count,'pageDigest',encode(v_page_digest,'hex'),
    'deliveredPages',(select count(distinct r.page_index) from public.account_deletion_review_page_receipts r where r.request_id=p_request_id
      and r.kind=p_kind and r.scope_key=v_scope_key and r.content_fingerprint=actual and r.page_count=v_page_count),
    'allPagesDelivered',(select count(distinct r.page_index)=v_page_count from public.account_deletion_review_page_receipts r where r.request_id=p_request_id
      and r.kind=p_kind and r.scope_key=v_scope_key and r.content_fingerprint=actual and r.page_count=v_page_count));
  if p_kind='profile' then return output||jsonb_build_object('profile',jsonb_build_object('guitarId',p_guitar_id,
    'qrCode',(select qr_code from public.guitars where id=p_guitar_id),'relationshipCodes',to_jsonb(scope_row.relationship_codes),'sections',sections));end if;
  return output||jsonb_build_object('retention',jsonb_build_object('domain',p_domain,'sections',sections));
end $function$;

do $guard_preimage$ begin
 if encode(sha256(convert_to(replace(pg_get_functiondef('public._account_deletion_fulfillment_guard()'::regprocedure),E'\r\n',E'\n'),'UTF8')),'hex') is distinct from 'f5bed15f5df33a5a3be3ee811033f62abd635d2c4c9095a2bb020ae3af7de386' then raise exception 'Pinned shared receipt guard preimage changed';end if;
end $guard_preimage$;
CREATE OR REPLACE FUNCTION public._account_deletion_fulfillment_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare permitted text:=current_setting('qrguitar.account_deletion_request',true);
  reviewer text:=current_setting('qrguitar.account_deletion_reviewer',true);
  release_request text:=current_setting('qrguitar.account_deletion_custody_release',true);
  storage_request text:=current_setting('qrguitar.account_deletion_storage_relocation',true);
begin
  if tg_table_name='account_deletion_fulfillment_receipts' then
    if tg_op='DELETE' and permitted=old.request_id::text then return old; end if;
    raise exception using errcode='42501',message='Account deletion fulfillment receipts are immutable.';
  end if;
  if tg_table_name='account_deletion_profile_custody' then
    if tg_op='DELETE' and permitted=old.request_id::text
      and exists(select 1 from public.account_deletion_fulfillments where request_id=old.request_id and state='blocked') then return old; end if;
    if tg_op='UPDATE' and release_request=old.request_id::text and old.state='privacy_review_required' and new.state='released'
      and row(new.guitar_id,new.request_id,new.prior_visibility,new.held_at)
        is not distinct from row(old.guitar_id,old.request_id,old.prior_visibility,old.held_at)
      and new.released_claim_id is not null and new.release_subject is not null and new.released_at is not null then return new; end if;
    if tg_op='UPDATE' and old.state='released' and new.state='released'
      and (new.released_to is null or new.released_to=old.released_to)
      and (new.released_by is null or new.released_by=old.released_by)
      and row(new.guitar_id,new.request_id,new.prior_visibility,new.held_at,new.released_claim_id,new.release_subject,new.released_at)
        is not distinct from row(old.guitar_id,old.request_id,old.prior_visibility,old.held_at,old.released_claim_id,old.release_subject,old.released_at) then return new; end if;
    raise exception using errcode='42501',message='Account deletion Profile custody is immutable.';
  end if;
  if tg_table_name='account_deletion_profile_review_scopes' then
    if tg_op='DELETE' and permitted=old.request_id::text
      and exists(select 1 from public.account_deletion_fulfillments where request_id=old.request_id and state='blocked') then return old; end if;
    raise exception using errcode='42501',message='Account deletion review scope is immutable.';
  end if;
  if tg_table_name in ('account_deletion_billing_subjects','account_deletion_service_subjects') then
    if tg_op='UPDATE' and permitted=old.request_id::text and old.after_fingerprint is null and new.after_fingerprint is not null
      and to_jsonb(new)-'after_fingerprint'=to_jsonb(old)-'after_fingerprint' then return new; end if;
  end if;
  if tg_table_name in ('account_deletion_profile_review_attestations','account_deletion_billing_subjects',
      'account_deletion_service_subjects','account_deletion_custody_release_receipts','account_deletion_retention_attestations',
      'account_deletion_storage_content_reviews','account_deletion_custody_evidence_reviews') then
    if tg_op='DELETE' and permitted=old.request_id::text
      and exists(select 1 from public.account_deletion_fulfillments where request_id=old.request_id and state='blocked') then return old; end if;
    if tg_op='UPDATE' and to_jsonb(new)-array['reviewed_by','migrated_by','claimant_id']::text[]
        =to_jsonb(old)-array['reviewed_by','migrated_by','claimant_id']::text[]
      and ((to_jsonb(old)->>'reviewed_by' is not null and to_jsonb(new)->>'reviewed_by' is null)
        or (to_jsonb(old)->>'migrated_by' is not null and to_jsonb(new)->>'migrated_by' is null)
        or (to_jsonb(old)->>'claimant_id' is not null and to_jsonb(new)->>'claimant_id' is null)) then return new; end if;
    raise exception using errcode='42501',message='Account deletion privacy receipts are immutable.';
  end if;
  if tg_table_name='account_deletion_review_page_receipts' then
    if tg_op='DELETE' and permitted=old.request_id::text
      and exists(select 1 from public.account_deletion_fulfillments where request_id=old.request_id and state='blocked') then return old;end if;
    raise exception using errcode='42501',message='Account deletion review page receipts are immutable.';
  end if;
  if tg_table_name='account_deletion_identity_inventory' then
    raise exception using errcode='42501',message='Account deletion identity inventory is immutable.';
  end if;
  if tg_table_name='account_deletion_storage_relocations' then
    if tg_op='DELETE' and permitted=old.request_id::text
      and exists(select 1 from public.account_deletion_fulfillments where request_id=old.request_id and state='blocked') then return old; end if;
    if tg_op='DELETE' and storage_request=old.request_id::text and old.state='planned'
      and not exists(select 1 from storage.objects where bucket_id=old.bucket_id and name=old.source_path) then return old;end if;
    if tg_op='UPDATE' and storage_request=old.request_id::text and old.state='planned' and new.state='planned'
      and row(new.relocation_id,new.request_id,new.bucket_id,new.source_path,new.planned_at,
        new.byte_sha256,new.copied_size,new.finalize_operation_id,new.complete_operation_id,new.references_updated_at,new.completed_at)
        is not distinct from row(old.relocation_id,old.request_id,old.bucket_id,old.source_path,old.planned_at,
          old.byte_sha256,old.copied_size,old.finalize_operation_id,old.complete_operation_id,old.references_updated_at,old.completed_at) then return new;end if;
    if tg_op='UPDATE' and storage_request=old.request_id::text
      and row(new.relocation_id,new.request_id,new.bucket_id,new.disposition,new.destination_path,new.source_size,
        new.source_mime_type,new.source_version,new.source_fingerprint,new.planned_at)
        is not distinct from row(old.relocation_id,old.request_id,old.bucket_id,old.disposition,old.destination_path,old.source_size,
          old.source_mime_type,old.source_version,old.source_fingerprint,old.planned_at)
      and ((old.state='planned' and old.disposition='retain' and new.state='copy_authorized'
          and new.byte_sha256 is null and new.copied_size is null and new.finalize_operation_id is not null
          and new.complete_operation_id is null and new.references_updated_at is null and new.completed_at is null
          and new.source_path=old.source_path)
        or (old.state='planned' and old.disposition='delete' and new.state='deletion_authorized'
          and new.byte_sha256 is null and new.copied_size is null and new.finalize_operation_id is not null
          and new.complete_operation_id is null and new.references_updated_at is null and new.completed_at is null
          and new.source_path=old.source_path)
        or (old.state='copy_authorized' and old.disposition='retain' and new.state='references_updated' and new.byte_sha256 is not null
          and new.copied_size is not null and new.finalize_operation_id=old.finalize_operation_id and new.complete_operation_id is null
          and new.references_updated_at is not null and new.completed_at is null and new.source_path=old.source_path)
        or (old.state='references_updated' and new.state='completed' and new.byte_sha256=old.byte_sha256
          and new.copied_size=old.copied_size and new.finalize_operation_id=old.finalize_operation_id
          and new.complete_operation_id is not null and new.references_updated_at=old.references_updated_at and new.completed_at is not null
          and new.source_path='removed/'||old.relocation_id::text)
        or (old.state='deletion_authorized' and old.disposition='delete' and new.state='completed'
          and new.byte_sha256 is null and new.copied_size is null and new.finalize_operation_id=old.finalize_operation_id
          and new.complete_operation_id is not null and new.references_updated_at is null and new.completed_at is not null
          and new.source_path='removed/'||old.relocation_id::text)) then
      return new;
    end if;
    raise exception using errcode='42501',message='Account deletion Storage relocation receipts are immutable.';
  end if;
  if tg_op='UPDATE' and nullif(reviewer,'') is not null
    and new.request_id=old.request_id and new.actor_id is not distinct from old.actor_id
    and new.subject_token=old.subject_token and new.actor_fingerprint=old.actor_fingerprint
    and new.target_email is not distinct from old.target_email
    and new.state=old.state and new.blockers=old.blockers and new.revision=old.revision
    and new.started_by is not distinct from (case when old.started_by::text=reviewer then null else old.started_by end)
    and new.last_reviewed_by is not distinct from (case when old.last_reviewed_by::text=reviewer then null else old.last_reviewed_by end)
    and new.started_at=old.started_at and new.reviewed_at=old.reviewed_at
    and new.storage_quiesce_until is not distinct from old.storage_quiesce_until
    and new.database_anonymized_at is not distinct from old.database_anonymized_at
    and new.auth_deleted_at is not distinct from old.auth_deleted_at and new.completed_at is not distinct from old.completed_at then
    return new;
  end if;
  -- The Auth foreign key performs this single transition during provider
  -- deletion. Direct table access is revoked, and every other field remains
  -- guarded; the finalizer independently requires this transition.
  if tg_op='UPDATE' and old.state='ready_for_auth_deletion' and old.actor_id is not null and new.actor_id is null
    and new.request_id=old.request_id and new.subject_token=old.subject_token and new.actor_fingerprint=old.actor_fingerprint
    and new.target_email is not distinct from old.target_email
    and new.state=old.state and new.blockers=old.blockers and new.revision=old.revision
    and new.started_by is not distinct from old.started_by and new.last_reviewed_by is not distinct from old.last_reviewed_by
    and new.started_at=old.started_at and new.reviewed_at=old.reviewed_at
    and new.storage_quiesce_until=old.storage_quiesce_until
    and new.database_anonymized_at=old.database_anonymized_at and new.auth_deleted_at is not distinct from old.auth_deleted_at
    and new.completed_at is not distinct from old.completed_at then return new;
  end if;
  if permitted is null or permitted<>old.request_id::text then
    raise exception using errcode='42501',message='Account deletion fulfillment may change only through its reviewed protocol.';
  end if;
  if tg_op='DELETE' and old.state='blocked' then
    delete from public.account_deletion_review_page_receipts where request_id=old.request_id;
    return old;
  end if;
  if tg_op='DELETE' or new.request_id is distinct from old.request_id
    or new.subject_token is distinct from old.subject_token
    or (old.target_email is null and new.target_email is not null)
    or new.started_by is distinct from old.started_by or new.started_at is distinct from old.started_at then
    raise exception using errcode='42501',message='Account deletion fulfillment identity is immutable.';
  end if;
  return new;
end $function$
