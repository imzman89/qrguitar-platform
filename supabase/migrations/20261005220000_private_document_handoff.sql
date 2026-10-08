begin;

-- Proposal: fail-closed private-file custody. No visibility, service policy or history rewrite.
alter table public.guitar_documents
  add column retained_private boolean not null default false,
  add column retained_by_user_id uuid references auth.users(id) on delete set null,
  add constraint guitar_documents_retained_private_check
    check (not retained_private or not is_public),
  add constraint guitar_documents_retained_actor_check
    check (retained_private or retained_by_user_id is null);
create index guitar_documents_retained_actor_idx
  on public.guitar_documents(retained_by_user_id,id) where retained_private;

create table public.ownership_transfer_document_selections (
  transfer_id uuid primary key references public.ownership_transfers(id) on delete restrict,
  guitar_id uuid not null references public.guitars(id) on delete restrict,
  schema_version integer not null default 1 check (schema_version=1),
  profile_updated_at timestamptz not null,
  document_snapshot jsonb not null check (jsonb_typeof(document_snapshot)='array'),
  selected_private_ids uuid[] not null,
  created_at timestamptz not null default clock_timestamp()
);
alter table public.ownership_transfer_document_selections enable row level security;
create policy server_only_document_selections on public.ownership_transfer_document_selections
  as restrictive for all to anon,authenticated using(false) with check(false);
revoke all on public.ownership_transfer_document_selections from public,anon,authenticated,service_role;
grant select,insert on public.ownership_transfer_document_selections to service_role;

create function public._ownership_document_receipt_immutable() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $receipt$
begin
  raise exception using errcode='42501',message='The prepared file selection cannot be changed. Cancel and prepare a new handoff.';
end
$receipt$;
revoke all on function public._ownership_document_receipt_immutable() from public,anon,authenticated,service_role;
create trigger ownership_document_receipt_immutable before update or delete
  on public.ownership_transfer_document_selections for each row
  execute function public._ownership_document_receipt_immutable();
create trigger account_deletion_profile_graph_document_selections before insert or update or delete
  on public.ownership_transfer_document_selections for each row
  execute function public._account_deletion_profile_graph_fence();

-- Existing pending-deletion fence gains the custodian; it is not replaced with a looser fence.
do $fence$
begin
  if not exists(select 1 from pg_trigger where tgrelid='public.guitar_documents'::regclass
    and tgname='account_deletion_fence_guitar_documents' and not tgisinternal and tgenabled='O'
    and tgfoid='public._account_deletion_write_fence()'::regprocedure and tgtype=23
    and tgnargs=1 and tgargs=decode('75706c6f616465645f62795f757365725f696400','hex')) then
    raise exception 'Exact original document account-deletion fence required';
  end if;
end
$fence$;
drop trigger account_deletion_fence_guitar_documents on public.guitar_documents;
create trigger account_deletion_fence_guitar_documents before insert or update
  on public.guitar_documents for each row
  execute function public._account_deletion_write_fence('uploaded_by_user_id','retained_by_user_id');

-- Patch exact current function bodies only, retaining signatures/security/ACLs and all other behavior.
do $patch_functions$
declare item jsonb; edit jsonb; oid_value oid; old_body text; body_value text; definition text;
begin
  for item in select value from jsonb_array_elements($patches$
[{"signature":"public.save_instrument_profile(uuid,uuid,timestamptz,jsonb)","beforeSha256":"24bb651ac92f5a535463871eeee53c98b819952b239e4fc533de7a6f718f1186","afterSha256":"d1117f657411c66c6b079b21ad68033b4717a745c877440cce70a06f1bf00a81","replacements":[{"before":"perform 1 from public.guitar_documents where guitar_id = p_guitar_id order by id for update;","after":"perform 1 from public.guitar_documents where guitar_id = p_guitar_id and not retained_private order by id for update;"},{"before":"(select count(*) from public.guitar_documents where guitar_id = p_guitar_id)","after":"(select count(*) from public.guitar_documents where guitar_id = p_guitar_id and not retained_private)"},{"before":"where d.guitar_id = p_guitar_id and d.id = (e->>'id')::uuid","after":"where d.guitar_id = p_guitar_id and not d.retained_private and d.id = (e->>'id')::uuid"},{"before":"where id = item_id and guitar_id = p_guitar_id and storage_path = item->>'storage_path' for update;","after":"where id = item_id and guitar_id = p_guitar_id and not retained_private and storage_path = item->>'storage_path' for update;"},{"before":"    where id = item_id;\n    document_ids","after":"    where id = item_id and guitar_id = p_guitar_id and not retained_private;\n    document_ids"},{"before":"delete from public.guitar_documents where guitar_id = p_guitar_id and not (id = any(document_ids));","after":"delete from public.guitar_documents where guitar_id = p_guitar_id and not retained_private and not (id = any(document_ids));"}]},{"signature":"public._account_deletion_sync_profile_review_scope(uuid,uuid,text)","beforeSha256":"cb02c540d5717d2f92830a1b516f0ec5115a76d59bd5314393222dd7e5f28f18","afterSha256":"07ad959cf6b24cb3a67acf357cca7b0c257faadc31c3a0ee1e27b6ba6f7866ef","replacements":[{"before":"    union all select d.guitar_id,'document_author' from public.guitar_documents d where d.uploaded_by_user_id=p_actor_id","after":"    union all select d.guitar_id,'document_author' from public.guitar_documents d where d.uploaded_by_user_id=p_actor_id\n    union all select d.guitar_id,'document_custodian' from public.guitar_documents d where d.retained_by_user_id=p_actor_id"}]},{"signature":"public._account_deletion_retained_pii(uuid,uuid,text)","beforeSha256":"8c82de4192a80996ecbe969e0e6c1ddd4366a8155472006d930fb98c5474e3eb","afterSha256":"591f901458b179e249cd300d9865db5ed5f199b1da72f03cb7e53d5c288ee9d0","replacements":[{"before":"or exists(select 1 from public.guitar_documents d where d.uploaded_by_user_id=p_actor_id)","after":"or exists(select 1 from public.guitar_documents d where d.uploaded_by_user_id=p_actor_id or d.retained_by_user_id=p_actor_id)"}]},{"signature":"public.prepare_account_deletion_fulfillment(uuid,boolean,uuid,uuid,text[])","beforeSha256":"deed6f77be86bc3edfdeb7f659d9ee22a22023f824e51efba428d349dcceeafd","afterSha256":"a1a3c3d6d64d5826673099a32d1bde2b55a1dd1d5014d6f867aac14f37a45997","replacements":[{"before":"update public.guitar_documents set uploaded_by_user_id=null where uploaded_by_user_id=job.actor_id;","after":"update public.guitar_documents set uploaded_by_user_id=null where uploaded_by_user_id=job.actor_id;\n      update public.guitar_documents set retained_by_user_id=null where retained_by_user_id=job.actor_id;"}]},{"signature":"public._account_deletion_profile_review_graph(uuid,uuid)","beforeSha256":"b9e5a065709cc36bb41c229fd02071a5ea351f45459ffb06b993b9991a74bd91","afterSha256":"3011431cede124fa4bc47c11fd2041090ebf32871382d9a6f62e04b0a7eb2cec","replacements":[{"before":"    'documents',(select coalesce(jsonb_agg(to_jsonb(x)-array['uploaded_by_user_id','updated_at']::text[] order by x.id),'[]'::jsonb) from public.guitar_documents x where x.guitar_id=p_guitar_id),","after":"    'documents',(select coalesce(jsonb_agg(to_jsonb(x)-array['uploaded_by_user_id','retained_by_user_id','updated_at']::text[] order by x.id),'[]'::jsonb) from public.guitar_documents x where x.guitar_id=p_guitar_id),\n    'documentSelections',(select coalesce(jsonb_agg(to_jsonb(x) order by x.transfer_id),'[]'::jsonb) from public.ownership_transfer_document_selections x where x.guitar_id=p_guitar_id),"}]}]
$patches$::jsonb) loop
    oid_value:=to_regprocedure(item->>'signature');
    if oid_value is null then raise exception 'Required function missing: %',item->>'signature';end if;
    select replace(prosrc,E'\r\n',E'\n') into old_body from pg_proc where oid=oid_value;
    if encode(sha256(convert_to(old_body,'UTF8')),'hex')<>item->>'beforeSha256' then
      raise exception 'Current source differs: %',item->>'signature';
    end if;
    body_value:=old_body;
    for edit in select value from jsonb_array_elements(item->'replacements') loop
      if (length(body_value)-length(replace(body_value,edit->>'before','')))/length(edit->>'before')<>1 then
        raise exception 'Exact single source anchor required: %',item->>'signature';
      end if;
      body_value:=replace(body_value,edit->>'before',edit->>'after');
    end loop;
    if encode(sha256(convert_to(body_value,'UTF8')),'hex')<>item->>'afterSha256' then
      raise exception 'Patched source hash differs: %',item->>'signature';
    end if;
    definition:=replace(pg_get_functiondef(oid_value),E'\r\n',E'\n');
    if (length(definition)-length(replace(definition,old_body,'')))/length(old_body)<>1 then
      raise exception 'Exact body required in function definition: %',item->>'signature';
    end if;
    execute replace(definition,old_body,body_value);
  end loop;
end
$patch_functions$;

-- Applies to every owner-changing writer, including claims/custody. No client flag can bypass it.
create function public._retain_private_documents_on_owner_change() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $custody$
begin
  if tg_op='DELETE' then
    if exists(select 1 from public.guitar_documents where guitar_id=old.id and retained_private) then
      raise exception using errcode='42501',message='Private retained files must pass their existing cleanup flow before Profile deletion.';
    end if;
    return old;
  end if;
  if old.owner_id is distinct from new.owner_id then
    perform 1 from public.guitar_documents where guitar_id=new.id and not retained_private order by id for update;
    update public.guitar_documents set retained_private=true,retained_by_user_id=old.owner_id
      where guitar_id=new.id and not retained_private and not is_public;
  end if;
  return new;
end
$custody$;
revoke all on function public._retain_private_documents_on_owner_change() from public,anon,authenticated,service_role;
create trigger retain_private_documents_on_owner_change after update of owner_id
  on public.guitars for each row execute function public._retain_private_documents_on_owner_change();
create trigger protect_retained_documents_from_profile_delete before delete
  on public.guitars for each row execute function public._retain_private_documents_on_owner_change();

-- A retained path cannot be reattached as a newly inserted/redirected active document.
create function public._block_retained_document_path_reuse() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $path_guard$
begin
  if tg_op='UPDATE' then
    if new.storage_path is not distinct from old.storage_path then return new;end if;
  end if;
  -- The normal save/create writers already hold this lock; take it here as well for path inserts.
  perform 1 from public.guitars where id=new.guitar_id for update;
  if not new.retained_private and exists(select 1 from public.guitar_documents d
      where d.storage_path=new.storage_path and d.retained_private and d.id is distinct from new.id) then
    raise exception using errcode='42501',message='This private file is retained by its custodian. Upload a new authorized file.';
  end if;
  return new;
end
$path_guard$;
revoke all on function public._block_retained_document_path_reuse() from public,anon,authenticated,service_role;
create trigger block_retained_document_path_reuse before insert or update
  on public.guitar_documents for each row execute function public._block_retained_document_path_reuse();

-- Original transfer bodies remain intact; this migration binds their exact reviewed source.
do $bind_originals$
begin
  if (select encode(sha256(convert_to(replace(prosrc,E'\r\n',E'\n'),'UTF8')),'hex') from pg_proc
    where oid='public.prepare_ownership_transfer(uuid,text,text,text,text,text,integer,boolean,text)'::regprocedure)
      is distinct from '2ebbb209c53ff2588ee3dd2fc45533f2edaeebf33ead6e29cd2196b0b84803d3'
    or (select encode(sha256(convert_to(replace(prosrc,E'\r\n',E'\n'),'UTF8')),'hex') from pg_proc
      where oid='public.complete_ownership_transfer(uuid,uuid,text,text,boolean,text)'::regprocedure)
      is distinct from 'ee851211fa2dcd5dc4038852e1b2d9e8e3cc6a6af6408c33476a1f021a593ed9' then
    raise exception 'Exact reviewed prepare/complete transfer bodies required';
  end if;
end
$bind_originals$;

create function public._ownership_active_document_snapshot(p_guitar_id uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,public set timezone='UTC' as $snapshot$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',d.id,'updatedAt',d.updated_at,'isPublic',d.is_public,
    'fingerprint',encode(sha256(convert_to(
      (to_jsonb(d)-array['retained_private','retained_by_user_id']::text[])::text,'UTF8')),'hex')
  ) order by d.id),'[]'::jsonb)
  from public.guitar_documents d where d.guitar_id=p_guitar_id and not d.retained_private
$snapshot$;
revoke all on function public._ownership_active_document_snapshot(uuid) from public,anon,authenticated,service_role;

create function public.prepare_ownership_transfer_with_documents(
  p_actor_id uuid,p_qr_code text,p_to_email text,p_to_name text,p_buyer_code_hash text,
  p_order_reference_hash text,p_expires_in_days integer,p_env_admin boolean,p_display_name text,
  p_expected_updated_at timestamptz,p_expected_documents jsonb,p_selected_private_ids uuid[]
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $prepare$
declare result jsonb; g public.guitars%rowtype; t public.ownership_transfers%rowtype;
  receipt public.ownership_transfer_document_selections%rowtype; current_snapshot jsonb; selected uuid[];
begin
  if p_expected_updated_at is null or p_selected_private_ids is null
    or jsonb_typeof(p_expected_documents) is distinct from 'array' then
    raise exception using errcode='22023',message='Review the current Profile and choose its private files before preparing a handoff.';
  end if;
  if jsonb_array_length(p_expected_documents)>10 or cardinality(p_selected_private_ids)>10
    or array_position(p_selected_private_ids,null) is not null then
    raise exception using errcode='22023',message='Invalid file selection.';
  end if;
  select coalesce(array_agg(distinct picked.document_id order by picked.document_id),'{}'::uuid[])
    into selected from unnest(p_selected_private_ids) as picked(document_id);
  if cardinality(selected)<>cardinality(p_selected_private_ids) then
    raise exception using errcode='22023',message='A private file was selected more than once.';
  end if;
  -- Original code locks the guitar then its transfer and rechecks actor/ownership.
  result:=public.prepare_ownership_transfer(p_actor_id,p_qr_code,p_to_email,p_to_name,p_buyer_code_hash,
    p_order_reference_hash,p_expires_in_days,p_env_admin,p_display_name);
  select * into t from public.ownership_transfers where id=(result->'transfer'->>'id')::uuid for update;
  select * into g from public.guitars where id=t.guitar_id for update;
  if t.id is null or g.id is null or t.from_owner_id is distinct from g.owner_id then
    raise exception using errcode='QT002',message='The handoff changed. Reload the Profile.';
  end if;
  perform 1 from public.guitar_documents where guitar_id=g.id and not retained_private order by id for update;
  current_snapshot:=public._ownership_active_document_snapshot(g.id);
  if g.updated_at is distinct from p_expected_updated_at
    or jsonb_array_length(current_snapshot)<>jsonb_array_length(p_expected_documents)
    or (select count(distinct (e->>'id')::uuid) from jsonb_array_elements(p_expected_documents) e)
      <>jsonb_array_length(p_expected_documents)
    or exists(select 1 from jsonb_array_elements(p_expected_documents) e where
      not exists(select 1 from public.guitar_documents d where d.guitar_id=g.id and not d.retained_private
        and d.id=(e->>'id')::uuid and d.updated_at=(e->>'updatedAt')::timestamptz))
    or exists(select 1 from unnest(selected) as picked(document_id) where not exists(select 1 from public.guitar_documents d
      where d.id=picked.document_id and d.guitar_id=g.id and not d.retained_private and not d.is_public)) then
    raise exception using errcode='QT002',message='Profile files changed. Reload and choose the files again.';
  end if;
  select * into receipt from public.ownership_transfer_document_selections where transfer_id=t.id;
  if found then
    if receipt.guitar_id is distinct from g.id or receipt.profile_updated_at is distinct from g.updated_at
      or receipt.document_snapshot is distinct from current_snapshot or receipt.selected_private_ids is distinct from selected then
      raise exception using errcode='QT002',message='This handoff has a different file selection. Cancel it and prepare a new handoff.';
    end if;
  elsif (result->>'replayed')::boolean then
    raise exception using errcode='QT002',message='Cancel this older handoff and prepare one with an explicit private-file selection.';
  else
    insert into public.ownership_transfer_document_selections(
      transfer_id,guitar_id,profile_updated_at,document_snapshot,selected_private_ids)
      values(t.id,g.id,g.updated_at,current_snapshot,selected);
  end if;
  -- Return the original whitelisted snapshot; never return the receipt or an unchecked private-file name.
  return result;
end
$prepare$;
revoke all on function public.prepare_ownership_transfer_with_documents(uuid,text,text,text,text,text,integer,boolean,text,timestamptz,jsonb,uuid[])
  from public,anon,authenticated,service_role;
grant execute on function public.prepare_ownership_transfer_with_documents(uuid,text,text,text,text,text,integer,boolean,text,timestamptz,jsonb,uuid[])
  to service_role;

create function public.complete_ownership_transfer_with_documents(
  p_transfer_id uuid,p_new_owner_id uuid,p_buyer_code_hash text,
  p_order_reference_hash text,p_env_admin boolean,p_display_name text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $complete$
declare target_id uuid; target_guitar uuid; matching_count integer; restored_count integer;
  g public.guitars%rowtype; t public.ownership_transfers%rowtype;
  receipt public.ownership_transfer_document_selections%rowtype; result jsonb;
begin
  if p_transfer_id is null then
    if p_buyer_code_hash is null or p_buyer_code_hash!~'^[0-9a-f]{64}$' then
      raise exception using errcode='22023',message='Enter the complete private buyer code.';
    end if;
    select count(*),min(id::text)::uuid into matching_count,target_id
      from public.ownership_transfers where purchaser_code_hash=p_buyer_code_hash;
    if matching_count=0 then raise exception using errcode='QT001',message='Transfer not found.';end if;
    if matching_count<>1 then raise exception using errcode='QT004',message='This handoff needs review.';end if;
  else target_id:=p_transfer_id;end if;
  select guitar_id into target_guitar from public.ownership_transfers where id=target_id;
  if not found then raise exception using errcode='QT001',message='Transfer not found.';end if;
  select * into g from public.guitars where id=target_guitar for update;
  select * into t from public.ownership_transfers where id=target_id for update;
  if g.id is null or t.id is null or t.guitar_id<>g.id then
    raise exception using errcode='QT002',message='This transfer is no longer available.';
  end if;
  -- Original replay authorization remains authoritative, even after subsequent ownership changes.
  if t.status='accepted' then
    return public.complete_ownership_transfer(p_transfer_id,p_new_owner_id,p_buyer_code_hash,
      p_order_reference_hash,p_env_admin,p_display_name);
  end if;
  if t.status<>'sent' or g.owner_id is null or g.owner_id is distinct from t.from_owner_id then
    raise exception using errcode='QT002',message='This transfer is no longer available.';
  end if;
  select * into receipt from public.ownership_transfer_document_selections where transfer_id=t.id;
  if not found or receipt.guitar_id is distinct from g.id or receipt.profile_updated_at is distinct from g.updated_at then
    raise exception using errcode='QT002',message='Ask the sender to prepare a handoff with the current file selection.';
  end if;
  perform 1 from public.guitar_documents where guitar_id=g.id and not retained_private order by id for update;
  if receipt.document_snapshot is distinct from public._ownership_active_document_snapshot(g.id) then
    raise exception using errcode='QT002',message='Profile files changed after the handoff was prepared.';
  end if;
  -- All original recipient/code/expiry/admin/conflict guards execute before any durable result.
  result:=public.complete_ownership_transfer(p_transfer_id,p_new_owner_id,p_buyer_code_hash,
    p_order_reference_hash,p_env_admin,p_display_name);
  if result->>'ok' is distinct from 'true' or result->>'replayed' is distinct from 'false'
    or result->'transfer'->>'status' is distinct from 'accepted'
    or (result->'guitar'->>'owner_id')::uuid is distinct from p_new_owner_id then
    raise exception using errcode='QT002',message='Ownership acceptance was not confirmed.';
  end if;
  if g.owner_id is distinct from p_new_owner_id then
    -- The owner-change trigger retained ALL private files. Release only this immutable selection.
    update public.guitar_documents set retained_private=false,retained_by_user_id=null
      where guitar_id=g.id and id=any(receipt.selected_private_ids) and retained_private
        and retained_by_user_id=t.from_owner_id and not is_public;
    get diagnostics restored_count=row_count;
    if restored_count<>cardinality(receipt.selected_private_ids) then
      raise exception using errcode='QT002',message='The selected private files could not be handed off.';
    end if;
  end if;
  return result;
end
$complete$;
revoke all on function public.complete_ownership_transfer_with_documents(uuid,uuid,text,text,boolean,text)
  from public,anon,authenticated,service_role;
grant execute on function public.complete_ownership_transfer_with_documents(uuid,uuid,text,text,boolean,text) to service_role;
-- Server routes must use the guarded wrappers. Accepted legacy replays still go through the wrapper.
revoke all on function public.prepare_ownership_transfer(uuid,text,text,text,text,text,integer,boolean,text),
  public.complete_ownership_transfer(uuid,uuid,text,text,boolean,text) from public,anon,authenticated,service_role;

create function public.read_retained_private_documents(p_actor_id uuid,p_offset integer,p_document_id uuid default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $read$
declare rows jsonb;
begin
  if p_offset is null or p_offset<0 or p_offset>100000 then
    raise exception using errcode='22023',message='Invalid document page.';
  end if;
  perform public._account_deletion_lock_actor(p_actor_id);
  if not exists(select 1 from public.profiles where id=p_actor_id and account_status='active')
    or exists(select 1 from public.account_deletion_requests where actor_id=p_actor_id and status='requested') then
    raise exception using errcode='42501',message='This account cannot access retained private files.';
  end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb) into rows from (
    select d.id,d.guitar_id,d.name,d.file_name,d.storage_path,d.mime_type,d.file_size_bytes,d.created_at
    from public.guitar_documents d where d.retained_private and not d.is_public
      and d.retained_by_user_id=p_actor_id and (p_document_id is null or d.id=p_document_id)
    order by d.id limit 51 offset p_offset
  ) x;
  -- Trusted server consumes paths; API must whitelist metadata and never return storage_path.
  return jsonb_build_object('ok',true,'documents',rows);
end
$read$;
revoke all on function public.read_retained_private_documents(uuid,integer,uuid) from public,anon,authenticated,service_role;
grant execute on function public.read_retained_private_documents(uuid,integer,uuid) to service_role;
notify pgrst,'reload schema';
commit;
