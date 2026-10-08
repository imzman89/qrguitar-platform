-- Only after the approved runtime is deployed, old inline requests drained,
-- dedicated worker secret installed in both Vault/runtime, and the authenticated
-- empty worker smoke check passed. Never run automatically during deployment.
-- Operator must set qrguitar.service_email_cutover_confirmed to new-runtime-only
-- in this session after verifying those prerequisites. No browser/API sets it.
begin;
do $activate$
declare ready jsonb; job bigint; secrets integer;
begin
  if current_setting('qrguitar.service_email_cutover_confirmed',true) is distinct from 'new-runtime-only' then raise exception 'Cutover preconditions have not been confirmed.'; end if;
  ready:=public.service_email_outbox_readiness();
  if ready->>'version'<>'2026-09-26.service-email.2' or (ready->>'ready')::boolean is not true then raise exception 'Outbox readiness failed.'; end if;
  if to_regclass('cron.job') is null or to_regclass('vault.decrypted_secrets') is null then raise exception 'Scheduler or Vault unavailable.'; end if;
  select count(*) into secrets from vault.decrypted_secrets where name='qrguitar_service_email_cron_secret'
    and octet_length(decrypted_secret) between 32 and 256 and decrypted_secret !~ '[[:space:][:cntrl:]]';
  if secrets<>1 or (select count(*) from vault.decrypted_secrets where name='qrguitar_service_email_cron_secret')<>1 then raise exception 'Dedicated scheduler secret unavailable.'; end if;
  if (select count(*) from cron.job where jobname='qrguitar-service-email-sweep')<>1 then raise exception 'Exactly one service email schedule is required.'; end if;
  select jobid into job from cron.job where jobname='qrguitar-service-email-sweep';
  update public.service_email_outbox_control set enabled=true,dispatch_enabled=true where singleton;
  perform cron.alter_job(job_id:=job,active:=true);
end;$activate$;
commit;
