-- Extend durable account deletion across the promotion ledger without
-- rewriting the fulfillment state machine. Promotion and audit facts remain;
-- only account links and text that contains the departing UUID/email change.
begin;

alter table public.billing_promo_admin_events
  alter column operator_id drop not null,
  alter column operator_email drop not null,
  drop constraint if exists billing_promo_admin_events_operator_email_check,
  add constraint billing_promo_admin_events_operator_email_check check(
    operator_email is null or (
      char_length(operator_email) between 3 and 320
      and operator_email=btrim(operator_email)
    )
  );

create function public._account_deletion_promo_text_has_identity(
  p_text text,p_actor_id uuid,p_email text
) returns boolean
language sql immutable set search_path=pg_catalog,public as $$
  select (p_actor_id is not null and strpos(lower(coalesce(p_text,'')),p_actor_id::text)>0)
    or (nullif(lower(btrim(coalesce(p_email,''))),'') is not null
      and strpos(lower(coalesce(p_text,'')),lower(btrim(p_email)))>0)
$$;

-- Promotion snapshots are factual audit records. Walk the JSON structure and
-- replace only strings that identify the departing account.
create function public._account_deletion_promo_redact_json(
  p_value jsonb,p_actor_id uuid,p_email text
) returns jsonb
language plpgsql immutable set search_path=pg_catalog,public as $$
declare scrubbed jsonb; scalar_text text;
begin
  if p_value is null then return null; end if;
  case jsonb_typeof(p_value)
    when 'object' then
      select coalesce(jsonb_object_agg(item.key,
        public._account_deletion_promo_redact_json(item.value,p_actor_id,p_email)),'{}'::jsonb)
        into scrubbed from jsonb_each(p_value) item;
      return scrubbed;
    when 'array' then
      select coalesce(jsonb_agg(
        public._account_deletion_promo_redact_json(item.value,p_actor_id,p_email)
        order by item.ordinality),'[]'::jsonb)
        into scrubbed from jsonb_array_elements(p_value) with ordinality item(value,ordinality);
      return scrubbed;
    when 'string' then
      scalar_text:=p_value#>>'{}';
      if public._account_deletion_promo_text_has_identity(scalar_text,p_actor_id,p_email) then
        return to_jsonb('[redacted]'::text);
      end if;
      return p_value;
    else return p_value;
  end case;
end $$;

-- The normal promotion guard remains unchanged outside a live, reviewed
-- deletion. Inside that context it permits one exact identity scrub while
-- preserving code, pricing, lifecycle, revision, and timestamps.
create or replace function public._billing_promo_code_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare permitted text:=nullif(current_setting('qrguitar.account_deletion_request',true),'');
  deletion_request_id uuid; deletion_actor uuid; deletion_email text;
begin
  if tg_op='UPDATE' and permitted is not null then
    begin deletion_request_id:=permitted::uuid;
    exception when invalid_text_representation then deletion_request_id:=null;
    end;
    if deletion_request_id is not null then
      select f.actor_id,lower(btrim(f.target_email)) into deletion_actor,deletion_email
      from public.account_deletion_fulfillments f
      join public.account_deletion_requests r on r.id=f.request_id
      where f.request_id=deletion_request_id and r.actor_id=f.actor_id and r.status='requested'
        and f.actor_id is not null and f.target_email is not null
        and f.state in ('blocked','quiescing_storage');
    end if;
    if deletion_actor is not null
      and (old.created_by=deletion_actor or old.updated_by=deletion_actor
        or public._account_deletion_promo_text_has_identity(
          concat_ws('|',old.name,old.description),deletion_actor,deletion_email))
      and (to_jsonb(new)-array['created_by','updated_by','name','description']::text[])
        =(to_jsonb(old)-array['created_by','updated_by','name','description']::text[])
      and new.created_by is not distinct from (case when old.created_by=deletion_actor then null else old.created_by end)
      and new.updated_by is not distinct from (case when old.updated_by=deletion_actor then null else old.updated_by end)
      and new.name is not distinct from (case
        when public._account_deletion_promo_text_has_identity(old.name,deletion_actor,deletion_email)
          then 'Redacted promotion' else old.name end)
      and new.description is not distinct from (case
        when public._account_deletion_promo_text_has_identity(old.description,deletion_actor,deletion_email)
          then '' else old.description end) then
      return new;
    end if;
  end if;
  if tg_op='DELETE' then
    raise exception using errcode='42501',message='Promotion history cannot be deleted.';
  end if;
  if row(new.id,new.environment,new.code,new.created_by,new.created_at)
      is distinct from row(old.id,old.environment,old.code,old.created_by,old.created_at)
    or new.revision is distinct from old.revision+1 or new.updated_at<=old.updated_at then
    raise exception using errcode='42501',message='Promotion identity and revision history are protected.';
  end if;
  if old.code in ('GARYWON','GARYAPPLE') and (
      new.status='archived' or new.audience<>'admin' or new.discount_type<>'fixed_total'
      or new.discount_value<>case old.code when 'GARYWON' then 30 else 100 end
      or new.minimum_amount<>0
      or new.eligible_offer_keys<>array['profile_1','profile_10','profile_25']::text[]) then
    raise exception using errcode='PT409',message='Owner payment-test pricing is protected.';
  end if;
  if old.status='archived' then
    raise exception using errcode='42501',message='An archived promotion cannot be changed.';
  end if;
  return new;
end $$;

-- Admin events stay append-only. A reviewed deletion may null the operator
-- link and redact identifying strings, but cannot change the event identity,
-- action, promotion, environment, or creation time.
create function public._billing_promo_admin_event_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare permitted text:=nullif(current_setting('qrguitar.account_deletion_request',true),'');
  deletion_request_id uuid; deletion_actor uuid; deletion_email text;
begin
  if tg_op='UPDATE' and permitted is not null then
    begin deletion_request_id:=permitted::uuid;
    exception when invalid_text_representation then deletion_request_id:=null;
    end;
    if deletion_request_id is not null then
      select f.actor_id,lower(btrim(f.target_email)) into deletion_actor,deletion_email
      from public.account_deletion_fulfillments f
      join public.account_deletion_requests r on r.id=f.request_id
      where f.request_id=deletion_request_id and r.actor_id=f.actor_id and r.status='requested'
        and f.actor_id is not null and f.target_email is not null
        and f.state in ('blocked','quiescing_storage');
    end if;
    if deletion_actor is not null
      and (old.operator_id=deletion_actor or (deletion_email<>''
          and lower(btrim(coalesce(old.operator_email,'')))=deletion_email)
        or public._account_deletion_promo_text_has_identity(
          concat_ws('|',old.reason,old.before_value::text,old.after_value::text),deletion_actor,deletion_email))
      and (to_jsonb(new)-array['operator_id','operator_email','reason','before_value','after_value']::text[])
        =(to_jsonb(old)-array['operator_id','operator_email','reason','before_value','after_value']::text[])
      and new.operator_id is not distinct from (case when old.operator_id=deletion_actor then null else old.operator_id end)
      and new.operator_email is not distinct from (case when deletion_email<>''
        and lower(btrim(coalesce(old.operator_email,'')))=deletion_email then null else old.operator_email end)
      and new.reason is not distinct from (case
        when public._account_deletion_promo_text_has_identity(old.reason,deletion_actor,deletion_email)
          then 'Personal information removed after an account deletion request.' else old.reason end)
      and new.before_value is not distinct from
        public._account_deletion_promo_redact_json(old.before_value,deletion_actor,deletion_email)
      and new.after_value is not distinct from
        public._account_deletion_promo_redact_json(old.after_value,deletion_actor,deletion_email) then
      return new;
    end if;
  end if;
  raise exception using errcode='42501',message='Promotion administrator history is immutable.';
end $$;

drop trigger billing_promo_admin_events_immutable on public.billing_promo_admin_events;
create trigger billing_promo_admin_events_immutable before update or delete
  on public.billing_promo_admin_events for each row
  execute function public._billing_promo_admin_event_guard();

-- These use the same actor/email advisory locks and tombstone checks as the
-- fulfillment baseline. Deletes remain available to the reviewed cleanup.
do $fences$
declare item text; table_name text; columns text; trigger_name text;
begin
  foreach item in array array[
    'billing_order_promotions:owner_id',
    'billing_promo_codes:created_by,updated_by',
    'billing_promo_admin_events:operator_id,email__operator_email',
    'billing_promo_quote_limits:owner_id'
  ] loop
    table_name:=split_part(item,':',1); columns:=split_part(item,':',2);
    trigger_name:='account_deletion_fence_'||table_name;
    execute format('drop trigger if exists %I on public.%I',trigger_name,table_name);
    execute format(
      'create trigger %I before insert or update on public.%I for each row execute function public._account_deletion_write_fence(%s)',
      trigger_name,table_name,
      (select string_agg(quote_literal(value),',') from unnest(string_to_array(columns,',')) value)
    );
  end loop;
end $fences$;

-- The revised fulfillment scanner should merge this array with its own stable
-- blocker set. A promoted order remains billing history; it is never scrubbed.
create function public._account_deletion_promo_blockers(p_actor_id uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
  select case when exists(
    select 1 from public.billing_order_promotions where owner_id=p_actor_id
  ) then '["billing_retention_migration_required"]'::jsonb else '[]'::jsonb end
$$;

-- This is both a standalone integration postcondition and the assertion used
-- by the scrub hook. Order history, actor links, quote throttles, or a literal
-- UUID/email anywhere in retained promo configuration/audit data all fail it.
create function public._account_deletion_promo_retained_pii(
  p_actor_id uuid,p_email text
) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
  select exists(select 1 from public.billing_order_promotions where owner_id=p_actor_id)
    or exists(select 1 from public.billing_promo_codes p where p.created_by=p_actor_id or p.updated_by=p_actor_id
      or public._account_deletion_promo_text_has_identity(to_jsonb(p)::text,p_actor_id,p_email))
    or exists(select 1 from public.billing_promo_admin_events e where e.operator_id=p_actor_id
      or (nullif(lower(btrim(coalesce(p_email,''))),'') is not null
        and lower(btrim(coalesce(e.operator_email,'')))=lower(btrim(p_email)))
      or public._account_deletion_promo_text_has_identity(to_jsonb(e)::text,p_actor_id,p_email))
    or exists(select 1 from public.billing_promo_quote_limits where owner_id=p_actor_id)
$$;

-- prepare_account_deletion_fulfillment writes account_status='removed' in its
-- committed freeze and final anonymization phases. PostgreSQL fires this hook
-- whenever that column is targeted, even when it is already 'removed', so the
-- same narrow cleanup and postcondition cover both phases without copying the
-- large fulfillment procedure.
create function public._account_deletion_promo_scrub_profile() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare permitted text:=nullif(current_setting('qrguitar.account_deletion_request',true),'');
  deletion_request_id uuid; deletion_actor uuid; deletion_email text;
begin
  if new.account_status::text<>'removed' or permitted is null then return new; end if;
  begin deletion_request_id:=permitted::uuid;
  exception when invalid_text_representation then
    raise exception using errcode='42501',message='Promotion privacy cleanup requires a reviewed deletion context.';
  end;
  select f.actor_id,lower(btrim(f.target_email)) into deletion_actor,deletion_email
  from public.account_deletion_fulfillments f
  join public.account_deletion_requests r on r.id=f.request_id
  where f.request_id=deletion_request_id and r.actor_id=f.actor_id and r.status='requested'
    and f.actor_id=new.id and f.target_email is not null
    and f.state in ('blocked','quiescing_storage');
  if deletion_actor is null then
    raise exception using errcode='42501',message='Promotion privacy cleanup requires the reviewed deletion subject.';
  end if;

  update public.billing_promo_codes p set
    created_by=case when p.created_by=deletion_actor then null else p.created_by end,
    updated_by=case when p.updated_by=deletion_actor then null else p.updated_by end,
    name=case when public._account_deletion_promo_text_has_identity(p.name,deletion_actor,deletion_email)
      then 'Redacted promotion' else p.name end,
    description=case when public._account_deletion_promo_text_has_identity(p.description,deletion_actor,deletion_email)
      then '' else p.description end
  where p.created_by=deletion_actor or p.updated_by=deletion_actor
    or public._account_deletion_promo_text_has_identity(
      concat_ws('|',p.name,p.description),deletion_actor,deletion_email);

  update public.billing_promo_admin_events e set
    operator_id=case when e.operator_id=deletion_actor then null else e.operator_id end,
    operator_email=case when deletion_email<>''
      and lower(btrim(coalesce(e.operator_email,'')))=deletion_email
      then null else e.operator_email end,
    reason=case when public._account_deletion_promo_text_has_identity(e.reason,deletion_actor,deletion_email)
      then 'Personal information removed after an account deletion request.' else e.reason end,
    before_value=public._account_deletion_promo_redact_json(e.before_value,deletion_actor,deletion_email),
    after_value=public._account_deletion_promo_redact_json(e.after_value,deletion_actor,deletion_email)
  where e.operator_id=deletion_actor or (deletion_email<>''
      and lower(btrim(coalesce(e.operator_email,'')))=deletion_email)
    or public._account_deletion_promo_text_has_identity(
      concat_ws('|',e.reason,e.before_value::text,e.after_value::text),deletion_actor,deletion_email);

  delete from public.billing_promo_quote_limits where owner_id=deletion_actor;

  if public._account_deletion_promo_retained_pii(deletion_actor,deletion_email) then
    raise exception using errcode='PD500',
      message='Promotion privacy postconditions failed; Auth deletion is blocked.';
  end if;
  return new;
end $$;

create trigger account_deletion_promo_profile_redaction
  after update of account_status on public.profiles for each row
  execute function public._account_deletion_promo_scrub_profile();

revoke all on function public._account_deletion_promo_text_has_identity(text,uuid,text),
  public._account_deletion_promo_redact_json(jsonb,uuid,text),
  public._billing_promo_admin_event_guard(),
  public._account_deletion_promo_blockers(uuid),
  public._account_deletion_promo_retained_pii(uuid,text),
  public._account_deletion_promo_scrub_profile()
  from public,anon,authenticated,service_role;

notify pgrst,'reload schema';
commit;
