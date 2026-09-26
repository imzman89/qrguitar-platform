-- Operational pause, NOT a schema or application-code rollback.
-- Does not stop already-running provider requests. Retain all intents/receipts.
begin;
update public.service_email_outbox_control set dispatch_enabled=false where singleton;
do $pause$
declare job bigint;
begin
  if to_regclass('cron.job') is null then return; end if;
  for job in select jobid from cron.job where jobname='qrguitar-service-email-sweep' loop
    perform cron.alter_job(job_id:=job,active:=false);
  end loop;
end;$pause$;
commit;
