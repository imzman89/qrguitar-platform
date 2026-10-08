-- PREPARATION ONLY. After action-required-email.sql and claim-completion-recovery.sql.
-- No binding, secret, dispatch activation or active scheduler is installed here.
begin;
create table public.action_email_operations (
 singleton boolean primary key default true check(singleton),
 project_url text check(project_url ~ '^https://[a-z0-9]{20}\.supabase\.co$'),
 approved_commit text check(approved_commit ~ '^[0-9a-f]{40}$'),
 last_success_at timestamptz,
 last_failure_at timestamptz
);
insert into public.action_email_operations default values;
alter table public.action_email_operations enable row level security;
revoke all on public.action_email_operations from public,anon,authenticated,service_role;

-- Pin the installed callable/trigger definitions as a reviewed schema receipt.
create table public.action_email_function_manifest(signature text primary key,definition_hash text not null);
alter table public.action_email_function_manifest enable row level security;
revoke all on public.action_email_function_manifest from public,anon,authenticated,service_role;
insert into public.action_email_function_manifest
select signature,md5(pg_get_functiondef(signature::regprocedure)) from unnest(array[
 'public.version_claim_action_email()','public.complete_claim_action_email()','public.capture_claim_action_email()',
 'public.version_service_action_email()','public.capture_service_action_email()',
 'public.claim_action_email(uuid)','public.begin_action_email(uuid,uuid)','public.settle_action_email(uuid,uuid,text,text,integer)',
 'public.action_email_status()','public.action_email_retry_eligible(uuid)','public.action_email_intent_status(uuid)',
 'public.action_email_admin_status(integer)','public.reconcile_action_email(uuid,uuid,boolean,text,text,text,timestamptz)',
 'public.deny_ownership_claim_current(uuid,uuid,text,boolean)','public.guard_claim_completion_intent()',
 'public.complete_ownership_claim_submission(uuid,uuid)','public.discard_incomplete_claim_submission(uuid,uuid)'
]) signature;

create function public.action_email_readiness(p_project_url text,p_release_sha text) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare schema_ready boolean;bound boolean;controls boolean;ops public.action_email_operations;
begin
 select * into ops from public.action_email_operations where singleton;
 select count(*)=4 and bool_and(c.relrowsecurity
   and not has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE')
   and not has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE')) into schema_ready
   from pg_class c where c.oid in ('public.action_email_intents'::regclass,'public.action_email_control'::regclass,
     'public.action_email_operations'::regclass,'public.action_email_function_manifest'::regclass);
 schema_ready:=schema_ready and (select count(*)=20 and bool_and(p.oid is not null and p.prosecdef
   and p.proconfig @> array['search_path=pg_catalog, public']
   and not has_function_privilege('anon',p.oid,'EXECUTE') and not has_function_privilege('authenticated',p.oid,'EXECUTE')
   and md5(pg_get_functiondef(p.oid))=m.definition_hash)
   from public.action_email_function_manifest m left join pg_proc p on p.oid=to_regprocedure(m.signature));
 schema_ready:=schema_ready and (select count(*)=6 and bool_and(t.oid is not null and not t.tgisinternal and t.tgenabled='O' and t.tgfoid=to_regprocedure(e.fn))
   from (values
     ('public.ownership_claims','claim_action_email_version','public.version_claim_action_email()'),
     ('public.ownership_claims','claim_action_email_capture','public.capture_claim_action_email()'),
     ('public.ownership_claims','claim_completion_intent_guard','public.guard_claim_completion_intent()'),
     ('public.ownership_claim_events','claim_action_email_completed','public.complete_claim_action_email()'),
     ('public.service_submissions','service_action_email_version','public.version_service_action_email()'),
     ('public.service_submissions','service_action_email_capture','public.capture_service_action_email()')) e(rel,name,fn)
   left join pg_trigger t on t.tgrelid=to_regclass(e.rel) and t.tgname=e.name);
 bound:=ops.project_url is not null and ops.approved_commit is not null and ops.project_url=p_project_url and ops.approved_commit=p_release_sha;
 select capture_enabled and dispatch_enabled into controls from public.action_email_control where singleton;
 return jsonb_build_object('version','2026-09-27.action-email.1','ready',coalesce(schema_ready and bound and controls,false),
   'schemaReady',coalesce(schema_ready,false),'destinationBound',coalesce(bound,false),'dispatchEnabled',coalesce(controls,false),
   'lastSuccessAt',ops.last_success_at,'lastFailureAt',ops.last_failure_at);
end;$$;
create function public.action_email_worker_heartbeat(p_success boolean) returns boolean
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if p_success is null then raise exception 'Worker result required.' using errcode='22023';end if;
 update public.action_email_operations set last_success_at=case when p_success then clock_timestamp() else last_success_at end,
   last_failure_at=case when not p_success then clock_timestamp() else last_failure_at end where singleton;
 if not found then raise exception 'Worker operations not installed.';end if;
 return true;
end;$$;
revoke all on function public.action_email_readiness(text,text),public.action_email_worker_heartbeat(boolean) from public,anon,authenticated;
grant execute on function public.action_email_readiness(text,text),public.action_email_worker_heartbeat(boolean) to service_role;

create function public.queue_action_email_sweep() returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare secret text;ops public.action_email_operations;ready jsonb;
begin
 select * into ops from public.action_email_operations where singleton;
 ready:=public.action_email_readiness(ops.project_url,ops.approved_commit);
 if (ready->>'ready')::boolean is not true then return;end if;
 if to_regclass('vault.decrypted_secrets') is null or to_regnamespace('net') is null then return;end if;
 execute 'select min(decrypted_secret) from vault.decrypted_secrets where name=''qrguitar_action_email_cron_secret'' having count(*)=1' into secret;
 if secret is null or octet_length(secret) not between 32 and 256 or secret ~ '[[:space:][:cntrl:]]' then return;end if;
 execute 'select net.http_post(url:=$1,headers:=$2,body:=$3,timeout_milliseconds:=55000)'
   using 'https://www.qrguitar.com/api/internal/action-email-sweep',jsonb_build_object('Authorization','Bearer '||secret,'Content-Type','application/json'),'{}'::jsonb;
end;$$;
revoke all on function public.queue_action_email_sweep() from public,anon,authenticated,service_role;
do $scheduler$
declare job bigint;
begin
 if to_regclass('cron.job') is null or to_regnamespace('net') is null then return;end if;
 if exists(select 1 from cron.job where jobname='qrguitar-action-email-sweep') then raise exception 'Action email schedule exists; review before installing.';end if;
 execute $sql$select cron.schedule('qrguitar-action-email-sweep','*/5 * * * *','select public.queue_action_email_sweep()')$sql$ into job;
 execute 'select cron.alter_job(job_id:=$1,active:=false)' using job;
end;$scheduler$;
insert into public.action_email_function_manifest
 select signature,md5(pg_get_functiondef(signature::regprocedure)) from unnest(array[
   'public.action_email_readiness(text,text)','public.action_email_worker_heartbeat(boolean)','public.queue_action_email_sweep()'
 ]) signature;
commit;
