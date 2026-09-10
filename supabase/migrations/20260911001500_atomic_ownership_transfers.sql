-- Transactional ownership handoffs. Apply after core Profile/history/account/archive migrations.
-- Never resolves historical duplicates by deleting evidence. All callers are trusted server RPCs.
create or replace function public.ownership_transfer_actor(
  p_actor_id uuid, p_display_name text, p_env_admin boolean
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare profile_row public.profiles%rowtype; actor_email text;
begin
  select lower(btrim(email)) into actor_email from auth.users where id=p_actor_id for share;
  if not found then raise exception using errcode='42501',message='Sign in required.'; end if;
  insert into public.profiles(id,display_name) values(p_actor_id,coalesce(nullif(btrim(p_display_name),''),actor_email,''))
    on conflict(id) do nothing;
  select * into profile_row from public.profiles where id=p_actor_id for update;
  if profile_row.account_status is distinct from 'active' then
    raise exception using errcode='42501',message='This account cannot change ownership.';
  end if;
  return jsonb_build_object('email',coalesce(actor_email,''),'admin',coalesce(p_env_admin,false) or profile_row.role='admin');
end $$;
revoke all on function public.ownership_transfer_actor(uuid,text,boolean) from public,anon,authenticated,service_role;

create or replace function public.ownership_transfer_snapshot(
  p_transfer public.ownership_transfers, p_guitar public.guitars, p_replayed boolean default false
) returns jsonb language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object('ok',true,'replayed',p_replayed,'transfer',to_jsonb(p_transfer),
    'guitar',jsonb_build_object('id',p_guitar.id,'owner_id',p_guitar.owner_id,'qr_code',p_guitar.qr_code,
      'permanent_path',p_guitar.permanent_path,'name',p_guitar.name,'brand',p_guitar.brand,
      'model',p_guitar.model,'visibility',p_guitar.visibility));
$$;
revoke all on function public.ownership_transfer_snapshot(public.ownership_transfers,public.guitars,boolean) from public,anon,authenticated,service_role;

create or replace function public.prepare_ownership_transfer(
  p_actor_id uuid, p_qr_code text, p_to_email text, p_to_name text, p_buyer_code_hash text,
  p_order_reference_hash text, p_expires_in_days integer, p_env_admin boolean, p_display_name text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g public.guitars%rowtype; t public.ownership_transfers%rowtype; actor jsonb; pending_count integer;
  to_email text:=lower(btrim(coalesce(p_to_email,''))); account_type text;
begin
  if nullif(btrim(p_qr_code),'') is null or length(to_email)>320 or length(coalesce(p_to_name,''))>200
    or (p_buyer_code_hash is null and to_email='') or (to_email<>'' and to_email !~ '^[^[:space:]@]+@[^[:space:]@]+$')
    or (p_buyer_code_hash is not null and p_buyer_code_hash !~ '^[0-9a-f]{64}$')
    or (p_order_reference_hash is not null and (p_buyer_code_hash is null or p_order_reference_hash !~ '^[0-9a-f]{64}$'))
    or p_expires_in_days is null or p_expires_in_days not between 1 and 30 then
    raise exception using errcode='22023',message='Enter valid handoff details.';
  end if;
  select * into g from public.guitars where qr_code=upper(btrim(p_qr_code)) for update;
  if not found then raise exception using errcode='QT001',message='QRguitar Profile was not found.'; end if;
  actor:=public.ownership_transfer_actor(p_actor_id,p_display_name,p_env_admin);
  if g.owner_id is null or (g.owner_id<>p_actor_id and not (actor->>'admin')::boolean) then
    raise exception using errcode='42501',message='Only the current owner can create a transfer.';
  end if;
  if g.owner_removed_at is not null or g.admin_archived_at is not null then
    raise exception using errcode='QT002',message='This Profile is not available for transfer.';
  end if;
  if p_buyer_code_hash is not null and not (actor->>'admin')::boolean then
    select content_value->>'accountType' into account_type from public.site_content
      where content_key='public_collection_owner:'||p_actor_id::text for share;
    if coalesce(account_type,'') not in ('shop','builder','brand') then
      raise exception using errcode='42501',message='Private buyer codes are available to enrolled shop and builder accounts.';
    end if;
  end if;
  select count(*) into pending_count from public.ownership_transfers where guitar_id=g.id and status='sent';
  if pending_count>1 then raise exception using errcode='QT004',message='Multiple pending handoffs need review. Cancel the obsolete handoffs before continuing.'; end if;
  if pending_count=1 then
    select * into t from public.ownership_transfers where guitar_id=g.id and status='sent' for update;
    if t.from_owner_id is distinct from g.owner_id or t.purchaser_code_hash is not null or p_buyer_code_hash is not null
      or lower(btrim(t.to_email))<>to_email then
      raise exception using errcode='QT002',message='A pending handoff already exists. Revoke it before preparing a different handoff.';
    end if;
    return public.ownership_transfer_snapshot(t,g,true);
  end if;
  if p_buyer_code_hash is not null then
    perform pg_advisory_xact_lock(hashtextextended('qrguitar:buyer-code:'||p_buyer_code_hash,0));
    if exists(select 1 from public.ownership_transfers where purchaser_code_hash=p_buyer_code_hash) then
      raise exception using errcode='QT002',message='Please prepare a new private buyer code.';
    end if;
  end if;
  insert into public.ownership_transfers(guitar_id,from_owner_id,to_email,to_name,status,fee_cents,
    purchaser_code_hash,claim_token_hash,expires_at,claim_prepared_at)
  values(g.id,g.owner_id,to_email,btrim(coalesce(p_to_name,'')),'sent',0,p_buyer_code_hash,p_order_reference_hash,
    case when p_buyer_code_hash is not null then clock_timestamp()+make_interval(days=>p_expires_in_days) end,
    case when p_buyer_code_hash is not null then clock_timestamp() end) returning * into t;
  return public.ownership_transfer_snapshot(t,g,false);
end $$;
revoke all on function public.prepare_ownership_transfer(uuid,text,text,text,text,text,integer,boolean,text) from public,anon,authenticated;
grant execute on function public.prepare_ownership_transfer(uuid,text,text,text,text,text,integer,boolean,text) to service_role;

-- Retain the old signature for migration/dependency compatibility, but remove its unsafe server grant.
revoke all on function public.complete_ownership_transfer(uuid,uuid) from public,anon,authenticated,service_role;
create or replace function public.complete_ownership_transfer(
  p_transfer_id uuid, p_new_owner_id uuid, p_buyer_code_hash text,
  p_order_reference_hash text, p_env_admin boolean, p_display_name text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g public.guitars%rowtype; t public.ownership_transfers%rowtype; actor jsonb;
  target_id uuid; target_guitar_id uuid; matching_count integer; accepted_time timestamptz;
begin
  if p_transfer_id is null then
    if p_buyer_code_hash is null or p_buyer_code_hash !~ '^[0-9a-f]{64}$' then
      raise exception using errcode='22023',message='Enter the complete private buyer code.';
    end if;
    select count(*),min(id::text)::uuid into matching_count,target_id from public.ownership_transfers where purchaser_code_hash=p_buyer_code_hash;
    if matching_count=0 then raise exception using errcode='QT001',message='That private buyer code is invalid or revoked.'; end if;
    if matching_count<>1 then raise exception using errcode='QT004',message='This handoff needs review.'; end if;
  else target_id:=p_transfer_id;
  end if;
  select guitar_id into target_guitar_id from public.ownership_transfers where id=target_id;
  if not found then raise exception using errcode='QT001',message='Transfer not found.'; end if;
  -- Every handoff writer locks guitar first, then transfer. Re-read after locking; never trust a route snapshot.
  select * into g from public.guitars where id=target_guitar_id for update;
  select * into t from public.ownership_transfers where id=target_id for update;
  if g.id is null or t.id is null or t.guitar_id<>g.id then raise exception using errcode='QT002',message='This transfer is no longer available.'; end if;
  actor:=public.ownership_transfer_actor(p_new_owner_id,p_display_name,p_env_admin);
  if t.purchaser_code_hash is not null then
    if p_buyer_code_hash is distinct from t.purchaser_code_hash then
      raise exception using errcode='42501',message='This handoff requires its private buyer code.';
    end if;
    if t.claim_token_hash is not null and p_order_reference_hash is distinct from t.claim_token_hash then
      raise exception using errcode='42501',message='Enter the order or receipt reference supplied with this buyer handoff.';
    end if;
  elsif p_buyer_code_hash is not null then
    raise exception using errcode='42501',message='This transfer requires the recipient email.';
  end if;
  if t.status='accepted' then
    if t.accepted_by is distinct from p_new_owner_id then raise exception using errcode='QT002',message='This transfer was already accepted by another account.'; end if;
    -- A committed result remains replayable after expiry or a later handoff. Never reassign the guitar on replay.
    return public.ownership_transfer_snapshot(t,g,true);
  end if;
  if t.status<>'sent' then raise exception using errcode='QT002',message='This transfer is no longer available.'; end if;
  if t.purchaser_code_hash is not null and (t.expires_at is null or t.expires_at<=clock_timestamp())
    or t.expires_at is not null and t.expires_at<=clock_timestamp() then
    raise exception using errcode='QT003',message='This handoff has expired. Ask the seller or shop for a new one.';
  end if;
  if t.purchaser_code_hash is not null then
    if btrim(t.to_email)<>'' and lower(btrim(t.to_email))<>actor->>'email' then
      raise exception using errcode='42501',message='Sign in with the recipient email assigned to this buyer code.';
    end if;
  elsif not (actor->>'admin')::boolean and (btrim(t.to_email)='' or coalesce(actor->>'email','')='' or lower(btrim(t.to_email))<>actor->>'email') then
    raise exception using errcode='42501',message='Sign in with the recipient email on this transfer.';
  end if;
  if g.owner_id is null or g.owner_id is distinct from t.from_owner_id then
    raise exception using errcode='QT002',message='The owner changed before this transfer could be completed.';
  end if;
  if g.owner_removed_at is not null or g.admin_archived_at is not null then
    raise exception using errcode='QT002',message='This Profile is not available for transfer.';
  end if;
  if (select count(*) from public.ownership_transfers where guitar_id=g.id and status='sent')<>1 then
    raise exception using errcode='QT004',message='Multiple pending handoffs need review before ownership can change.';
  end if;
  accepted_time:=clock_timestamp();
  update public.guitars set owner_id=p_new_owner_id,updated_at=accepted_time where id=g.id returning * into g;
  update public.ownership_transfers set status='accepted',accepted_by=p_new_owner_id,accepted_at=accepted_time
    where id=t.id returning * into t;
  insert into public.guitar_timeline_events(guitar_id,event_date,date_precision,event_type,category,title,description,
    is_public,is_system,created_by_user_id,source_key,created_at,updated_at)
  values(g.id,accepted_time::date,'day','ownership','Ownership','Ownership transferred',
    'Ownership was transferred while the permanent QRguitar Profile remained unchanged.',true,true,p_new_owner_id,
    'transfer:'||t.id::text,accepted_time,accepted_time)
  on conflict(guitar_id,source_key) where source_key is not null do nothing;
  return public.ownership_transfer_snapshot(t,g,false);
end $$;
revoke all on function public.complete_ownership_transfer(uuid,uuid,text,text,boolean,text) from public,anon,authenticated;
grant execute on function public.complete_ownership_transfer(uuid,uuid,text,text,boolean,text) to service_role;

create or replace function public.manage_ownership_transfer(
  p_transfer_id uuid,p_actor_id uuid,p_action text,p_reason text,p_env_admin boolean,p_display_name text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare g public.guitars%rowtype; t public.ownership_transfers%rowtype; actor jsonb; target_guitar_id uuid;
begin
  if p_action not in ('cancel','resend') or p_action is null then raise exception using errcode='22023',message='Unsupported handoff action.'; end if;
  select guitar_id into target_guitar_id from public.ownership_transfers where id=p_transfer_id;
  if not found then raise exception using errcode='QT001',message='Transfer not found.'; end if;
  select * into g from public.guitars where id=target_guitar_id for update;
  select * into t from public.ownership_transfers where id=p_transfer_id for update;
  if g.id is null or t.id is null then raise exception using errcode='QT002',message='This transfer is no longer available.'; end if;
  actor:=public.ownership_transfer_actor(p_actor_id,p_display_name,p_env_admin);
  if g.owner_id is distinct from p_actor_id and not (actor->>'admin')::boolean then
    raise exception using errcode='42501',message='Only the current owner can manage this transfer.';
  end if;
  if p_action='cancel' and t.status='cancelled' then return public.ownership_transfer_snapshot(t,g,true); end if;
  if t.status<>'sent' then raise exception using errcode='QT002',message='Only pending transfers can be managed.'; end if;
  if p_action='resend' then
    if t.purchaser_code_hash is null or btrim(t.to_email)='' then raise exception using errcode='22023',message='This handoff does not have a resendable buyer invitation.'; end if;
    if g.owner_id is distinct from t.from_owner_id or g.owner_removed_at is not null or g.admin_archived_at is not null then
      raise exception using errcode='QT002',message='This handoff is no longer available.';
    end if;
    if t.expires_at is null or t.expires_at<=clock_timestamp() then raise exception using errcode='QT003',message='This handoff has expired.'; end if;
    return public.ownership_transfer_snapshot(t,g,false);
  end if;
  update public.ownership_transfers set status='cancelled' where id=t.id returning * into t;
  if (actor->>'admin')::boolean then
    insert into public.admin_audit_events(actor_user_id,actor_email,action,target_type,target_id,target_user_id,reason,metadata)
    values(p_actor_id,actor->>'email','transfer_cancelled','transfer',t.id::text,t.from_owner_id,
      coalesce(nullif(btrim(p_reason),''),'Transfer cancelled.'),jsonb_build_object('guitarId',g.id,'qrCode',g.qr_code));
  end if;
  return public.ownership_transfer_snapshot(t,g,false);
end $$;
revoke all on function public.manage_ownership_transfer(uuid,uuid,text,text,boolean,text) from public,anon,authenticated;
grant execute on function public.manage_ownership_transfer(uuid,uuid,text,text,boolean,text) to service_role;
notify pgrst,'reload schema';

