-- Atomic creation; requires base/core profile history, archive/admin schema and Storage.
begin;
create table if not exists public.instrument_create_receipts (
  owner_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null,
  upload_id text not null,
  request_hash text not null,
  guitar_id uuid references public.guitars(id) on delete set null,
  qr_code text not null,
  permanent_path text not null,
  created_at timestamptz not null default now(),
  primary key (owner_id, idempotency_key),
  unique (owner_id, upload_id)
);
alter table public.instrument_create_receipts enable row level security;
revoke all on public.instrument_create_receipts from public, anon, authenticated;
grant all on public.instrument_create_receipts to service_role;

-- Prove a legacy pending request reached its intended relational state before
-- upgrading its receipt. This helper performs no writes and is not client-callable.
create or replace function public.legacy_create_matches_profile(p_guitar_id uuid, p_owner_id uuid, p_payload jsonb)
returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
declare actual jsonb; expected jsonb; expected_trust jsonb;
begin
  select jsonb_build_object(
    'name',g.name,'brand',g.brand,'model',g.model,'year',g.year,'serial_number',g.serial_number,
    'builder',g.builder,'location',g.location,'visibility',g.visibility::text,'summary',g.summary,'hero_image_path',g.hero_image_path
  ) into actual from public.guitars g where g.id=p_guitar_id and g.owner_id=p_owner_id
    and g.status='unverified' and g.owner_removed_at is null and g.admin_archived_at is null;
  if actual is null or actual is distinct from p_payload->'guitar' then return false; end if;
  select coalesce(jsonb_agg(jsonb_build_object('storage_path',storage_path,'alt',alt,'sort_order',sort_order)
    order by sort_order,storage_path),'[]'::jsonb) into actual from public.guitar_media where guitar_id=p_guitar_id;
  select coalesce(jsonb_agg(e order by (e->>'sort_order')::integer,e->>'storage_path'),'[]'::jsonb)
    into expected from jsonb_array_elements(p_payload->'media') e;
  if actual is distinct from expected then return false; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'name',name,'storage_path',storage_path,'is_public',is_public,'document_type',document_type,
    'public_description',public_description,'private_notes',private_notes,'issuer_source',issuer_source,
    'document_date',document_date,'description',description,'related_timeline_event_id',related_timeline_event_id,
    'related_service_event_id',related_service_event_id) order by storage_path),'[]'::jsonb)
    into actual from public.guitar_documents where guitar_id=p_guitar_id;
  select coalesce(jsonb_agg(e order by e->>'storage_path'),'[]'::jsonb) into expected
    from jsonb_array_elements(p_payload->'documents') e;
  if actual is distinct from expected then return false; end if;
  select coalesce(jsonb_agg(jsonb_build_object('label',label,'value',value,'sort_order',sort_order)
    order by sort_order,label,value),'[]'::jsonb) into actual from public.guitar_specs where guitar_id=p_guitar_id;
  select coalesce(jsonb_agg(e order by (e->>'sort_order')::integer,e->>'label',e->>'value'),'[]'::jsonb)
    into expected from jsonb_array_elements(p_payload->'specs') e;
  if actual is distinct from expected then return false; end if;
  select coalesce(jsonb_agg(jsonb_build_object('event_date',event_date,'event_type',event_type,'title',title,
    'description',description,'private_notes',private_notes,'shop_name',shop_name,'location',location,'is_public',is_public)
    order by id),'[]'::jsonb) into actual from public.guitar_timeline_events where guitar_id=p_guitar_id and is_system=false;
  expected := case when p_payload->'service' is null or p_payload->'service'='null'::jsonb then '[]'::jsonb
    else jsonb_build_array(p_payload->'service') end;
  if actual is distinct from expected then return false; end if;
  expected_trust := '{"authenticityStatus":"unconfirmed","showVerificationBadge":true,"showAuthenticityBadge":true,"showSerialPublic":false,"serialExceptionApproved":false,"internalVerificationNote":"","publicVerificationNote":"","internalAuthenticityNote":"","publicAuthenticityNote":""}'::jsonb
    || jsonb_build_object('showSerialPublic',(p_payload->>'show_serial_public')::boolean);
  select s.content_value into actual from public.site_content s join public.guitars g on s.content_key='record_trust:'||g.qr_code where g.id=p_guitar_id;
  return actual is not distinct from expected_trust;
end; $$;
revoke all on function public.legacy_create_matches_profile(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.legacy_create_matches_profile(uuid,uuid,jsonb) to service_role;

create or replace function public.create_instrument_profile(
  p_owner_id uuid, p_idempotency_key text, p_upload_id text, p_payload jsonb,
  p_launch_testing_access boolean default false, p_owner_display_name text default null
)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  owner_row public.profiles%rowtype;
  receipt public.instrument_create_receipts%rowtype;
  legacy jsonb;
  legacy_key text;
  fingerprint text;
  item jsonb;
  object_row storage.objects%rowtype;
  stage_prefix text;
  object_path text;
  serial text;
  code text;
  guitar_id uuid;
  guitar_path text;
  candidate_ids uuid[];
  candidate_count integer;
  completed_time timestamptz;
  trust_value jsonb;
  retry integer;
  recovered boolean := false;
begin
  if p_owner_id is null or p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9-]{12,100}$'
    or p_upload_id is null or p_upload_id !~ '^[A-Za-z0-9-]{12,100}$'
    or jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception using errcode='22023',message='Invalid create request.';
  end if;
  -- Lock by owner even when the profile row does not yet exist. No committed
  -- pending marker is needed: all concurrent requests wait for this transaction.
  perform pg_advisory_xact_lock(hashtextextended('qrguitar:create:'||p_owner_id::text,0));
  insert into public.profiles(id,display_name) values(p_owner_id,coalesce(nullif(p_payload->>'owner_name',''),nullif(p_owner_display_name,''))) on conflict(id) do nothing;
  select * into owner_row from public.profiles where id=p_owner_id for update;
  if owner_row.account_status is distinct from 'active' then
    raise exception using errcode='42501',message='This account cannot create Profiles.';
  end if;
  fingerprint := encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');
  select * into receipt from public.instrument_create_receipts
    where owner_id=p_owner_id and (idempotency_key=p_idempotency_key or upload_id=p_upload_id)
    order by case when idempotency_key=p_idempotency_key then 0 else 1 end limit 1;
  if found then
    if receipt.request_hash<>fingerprint or receipt.upload_id<>p_upload_id then
      raise exception using errcode='QG004',message='This create request or upload session was already used with different details.';
    end if;
    return jsonb_build_object('ok',true,'qrCode',receipt.qr_code,'permanentPath',receipt.permanent_path,'alreadyCreated',true);
  end if;
  legacy_key := 'create_submission:'||p_owner_id::text||':'||p_idempotency_key;
  select content_value into legacy from public.site_content where content_key=legacy_key for update;
    if legacy->>'status'='complete' and nullif(legacy->>'qrCode','') is not null and nullif(legacy->>'permanentPath','') is not null then
      -- Historical complete receipts have no payload fingerprint. Preserve their
      -- original result; never invent a new Profile or overwrite that receipt.
      return jsonb_build_object('ok',true,'qrCode',legacy->>'qrCode','permanentPath',legacy->>'permanentPath','alreadyCreated',true,'legacyReceipt',true);
    end if;
  if jsonb_typeof(p_payload->'guitar') is distinct from 'object'
    or jsonb_typeof(p_payload->'media') is distinct from 'array'
    or jsonb_typeof(p_payload->'documents') is distinct from 'array'
    or jsonb_typeof(p_payload->'specs') is distinct from 'array'
    or jsonb_array_length(p_payload->'media') not between 1 and 20
    or jsonb_array_length(p_payload->'documents')>10 or jsonb_array_length(p_payload->'specs')>100 then
    raise exception using errcode='22023',message='Invalid create payload.';
  end if;
  if nullif(btrim(p_payload->'guitar'->>'brand'),'') is null
    or nullif(btrim(p_payload->'guitar'->>'model'),'') is null
    or nullif(btrim(p_payload->'guitar'->>'name'),'') is null then
    raise exception using errcode='22023',message='Brand, model and name are required.';
  end if;
  serial := nullif(btrim(p_payload->'guitar'->>'serial_number'),'');
  if serial is not null and length(public.normalize_instrument_serial(serial))<4 then
    raise exception using errcode='22023',message='Serial Number must contain at least four letters or numbers.';
  end if;
  stage_prefix := p_owner_id::text||'/profile-uploads/'||p_upload_id||'/';
  if not exists(select 1 from jsonb_array_elements(p_payload->'media') e where e->>'storage_path'=p_payload->'guitar'->>'hero_image_path') then
    raise exception using errcode='22023',message='Choose a main photo from the uploaded photos.';
  end if;
  if (select count(distinct e->>'storage_path') from jsonb_array_elements(p_payload->'media') e)<>jsonb_array_length(p_payload->'media')
    or (select count(distinct e->>'storage_path') from jsonb_array_elements(p_payload->'documents') e)<>jsonb_array_length(p_payload->'documents') then
    raise exception using errcode='22023',message='Duplicate uploaded files are not allowed.';
  end if;
  -- Validate complete path segments, bucket, existence, type, and size. Client path
  -- prefixes alone are not evidence that an upload completed.
  for item in select jsonb_build_object('bucket','instrument-media','kind','image','path',e->>'storage_path')
      from jsonb_array_elements(p_payload->'media') e union all
      select jsonb_build_object('bucket','instrument-documents','kind','document','path',e->>'storage_path')
      from jsonb_array_elements(p_payload->'documents') e loop
    object_path := item->>'path';
    if object_path is null or left(object_path,length(stage_prefix))<>stage_prefix
      or substring(object_path from length(stage_prefix)+1) !~ ('^'||(item->>'kind')||'-[A-Za-z0-9-]+[.](jpg|jpeg|png|webp|pdf)$') then
      raise exception using errcode='42501',message='An upload does not belong to this create session.';
    end if;
    select * into object_row from storage.objects where bucket_id=item->>'bucket' and name=object_path for share;
    if not found or coalesce((object_row.metadata->>'size')::bigint,0) not between 1 and 12582912
      or coalesce(object_row.metadata->>'mimetype','') not in ('image/jpeg','image/png','image/webp','application/pdf')
      or ((item->>'kind')='image' and object_row.metadata->>'mimetype'='application/pdf') then
      raise exception using errcode='QG005',message='An uploaded file is missing, incomplete, or unsupported. Upload it again.';
    end if;
  end loop;

  if legacy is not null then

    if legacy->>'status' is distinct from 'pending' or legacy->>'uploadId' is distinct from p_upload_id then
      raise exception using errcode='QG003',message='This older create request needs review before it can be safely resumed.';
    end if;
    select array_agg(g.id) into candidate_ids from public.guitars g
      where g.owner_id=p_owner_id and (
        left(coalesce(g.hero_image_path,''),length(stage_prefix))=stage_prefix or
        exists(select 1 from public.guitar_media m where m.guitar_id=g.id and left(m.storage_path,length(stage_prefix))=stage_prefix) or
        exists(select 1 from public.guitar_documents d where d.guitar_id=g.id and left(d.storage_path,length(stage_prefix))=stage_prefix)
      );
    candidate_count := coalesce(array_length(candidate_ids,1),0);
    if candidate_count<>1 then
      raise exception using errcode='QG003',message='This older create request needs review. Existing Profiles and files have been preserved.';
    end if;
    perform 1 from public.guitars where id=candidate_ids[1] for update;
    perform 1 from public.guitar_media child where child.guitar_id=candidate_ids[1] order by child.id for update;
    perform 1 from public.guitar_documents child where child.guitar_id=candidate_ids[1] order by child.id for update;
    perform 1 from public.guitar_specs child where child.guitar_id=candidate_ids[1] order by child.id for update;
    perform 1 from public.guitar_timeline_events child where child.guitar_id=candidate_ids[1] order by child.id for update;
    perform 1 from public.site_content where content_key=(select 'record_trust:'||qr_code from public.guitars where id=candidate_ids[1]) for update;
    if not public.legacy_create_matches_profile(candidate_ids[1],p_owner_id,p_payload) then
      -- No age-based deletion. Missing/partial/ambiguous state needs operator review.
      raise exception using errcode='QG003',message='This older create request needs review. Existing Profiles and files have been preserved.';
    end if;
    select id,qr_code,permanent_path into guitar_id,code,guitar_path from public.guitars where id=candidate_ids[1] for update;
    recovered := true;
  else
    if owner_row.plan='single' and not coalesce(p_launch_testing_access,false) and
      (select count(*) from public.guitars where owner_id=p_owner_id)>=25 then
      raise exception using errcode='QG001',message='Free public beta accounts can create up to 25 Profiles.';
    end if;
    if serial is not null and (
      exists(select 1 from public.guitar_serial_aliases where serial_normalized=public.normalize_instrument_serial(serial)) or
      exists(select 1 from public.guitars where public.normalize_instrument_serial(serial_number)=public.normalize_instrument_serial(serial))
    ) then
      raise exception using errcode='QG002',message='A QRguitar Profile already uses this Serial Number.';
    end if;
    for retry in 1..40 loop
      code := case when serial is not null then 'QRG-'||left(public.normalize_instrument_serial(serial),64)
        else 'QRG-'||lpad(floor(random()*1000000)::integer::text,6,'0') end;
      -- Retired printed URLs and trust keys cannot be assigned to a new instrument.
      if exists(select 1 from public.qr_redirects where old_path='/i/'||code) or
        exists(select 1 from public.site_content where content_key='record_trust:'||code) then
        if serial is not null then raise exception using errcode='QG002',message='The QRguitar identity is already reserved.'; end if;
        continue;
      end if;
      begin
        insert into public.guitars(owner_id,qr_code,permanent_path,name,brand,model,year,serial_number,no_serial_used,
          builder,location,status,visibility,summary,hero_image_path)
        values(p_owner_id,code,'/i/'||code,p_payload->'guitar'->>'name',p_payload->'guitar'->>'brand',
          p_payload->'guitar'->>'model',p_payload->'guitar'->>'year',serial,serial is null,p_payload->'guitar'->>'builder',
          p_payload->'guitar'->>'location','unverified',(p_payload->'guitar'->>'visibility')::public.guitar_visibility,
          coalesce(p_payload->'guitar'->>'summary',''),p_payload->'guitar'->>'hero_image_path') returning id,permanent_path into guitar_id,guitar_path;
        exit;
      exception when unique_violation then
        if serial is not null then raise exception using errcode='QG002',message='A QRguitar Profile already uses this identity.'; end if;
      end;
    end loop;
    if guitar_id is null then raise exception using errcode='QG006',message='A unique QRguitar ID could not be reserved.'; end if;
    for item in select value from jsonb_array_elements(p_payload->'media') loop
      insert into public.guitar_media(guitar_id,storage_path,alt,sort_order) values(guitar_id,item->>'storage_path',coalesce(item->>'alt',''),(item->>'sort_order')::integer);
    end loop;
    for item in select value from jsonb_array_elements(p_payload->'documents') loop
      if nullif(item->>'related_timeline_event_id','') is not null or nullif(item->>'related_service_event_id','') is not null then
        raise exception using errcode='22023',message='Link documents to timeline events after creating this Profile.';
      end if;
      select * into object_row from storage.objects where bucket_id='instrument-documents' and name=item->>'storage_path';
      insert into public.guitar_documents(guitar_id,uploaded_by_user_id,name,storage_path,file_name,mime_type,file_size_bytes,
        is_public,document_type,public_description,private_notes,issuer_source,document_date,description)
      values(guitar_id,p_owner_id,item->>'name',item->>'storage_path',item->>'name',object_row.metadata->>'mimetype',
        (object_row.metadata->>'size')::bigint,(item->>'is_public')::boolean,item->>'document_type',item->>'public_description',
        item->>'private_notes',item->>'issuer_source',(item->>'document_date')::date,item->>'description');
    end loop;
    for item in select value from jsonb_array_elements(p_payload->'specs') loop
      if nullif(btrim(item->>'label'),'') is null or nullif(btrim(item->>'value'),'') is null then
        raise exception using errcode='22023',message='A profile detail is invalid.';
      end if;
      insert into public.guitar_specs(guitar_id,label,value,sort_order) values(guitar_id,item->>'label',item->>'value',(item->>'sort_order')::integer);
    end loop;
    item := p_payload->'service';
    if item is not null and item<>'null'::jsonb then
      insert into public.guitar_timeline_events(guitar_id,created_by_user_id,event_date,event_type,title,description,private_notes,shop_name,location,is_public)
      values(guitar_id,p_owner_id,(item->>'event_date')::date,item->>'event_type',item->>'title',coalesce(item->>'description',''),
        item->>'private_notes',item->>'shop_name',item->>'location',(item->>'is_public')::boolean);
    end if;
    trust_value := '{"authenticityStatus":"unconfirmed","showVerificationBadge":true,"showAuthenticityBadge":true,"showSerialPublic":false,"serialExceptionApproved":false,"internalVerificationNote":"","publicVerificationNote":"","internalAuthenticityNote":"","publicAuthenticityNote":""}'::jsonb
      || jsonb_build_object('showSerialPublic',serial is not null and (p_payload->>'show_serial_public')::boolean);
    insert into public.site_content(content_key,content_value,updated_by) values('record_trust:'||code,trust_value,p_owner_id);
  end if;
  completed_time := clock_timestamp();
  insert into public.instrument_create_receipts(owner_id,idempotency_key,upload_id,request_hash,guitar_id,qr_code,permanent_path,created_at)
    values(p_owner_id,p_idempotency_key,p_upload_id,fingerprint,guitar_id,code,guitar_path,completed_time);
  if recovered then
    update public.site_content set content_value=jsonb_build_object('status','complete','qrCode',code,'permanentPath',guitar_path,
      'completedAt',completed_time,'recoveredLegacyRequest',true),updated_at=completed_time where content_key=legacy_key;
  end if;
  update public.profiles set display_name=coalesce(nullif(p_payload->>'owner_name',''),display_name,nullif(p_owner_display_name,'')) where id=p_owner_id;
  return jsonb_build_object('ok',true,'qrCode',code,'permanentPath',guitar_path,'alreadyCreated',recovered);
end; $$;
revoke all on function public.create_instrument_profile(uuid,text,text,jsonb,boolean,text) from public,anon,authenticated;
grant execute on function public.create_instrument_profile(uuid,text,text,jsonb,boolean,text) to service_role;
notify pgrst,'reload schema';
commit;






