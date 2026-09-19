-- Run PayPal webhook recovery independently of the web host. Supabase Cron
-- enqueues one authenticated call every five minutes; the application records
-- checkout's readiness heartbeat only after the bounded sweep succeeds.
--
-- The bearer value is deliberately absent from source and cron.job. Create a
-- Vault secret named qrguitar_paypal_cron_secret with the exact same value as
-- the production CRON_SECRET. Until it exists and passes the application's
-- secret policy, each run safely enqueues no call.
begin;

do $migration$
declare
  v_job_id bigint;
begin
  -- Unsupported local PostgreSQL fixtures have neither extension available.
  -- Leaving them untouched keeps checkout fail-closed. Hosted Supabase exposes
  -- both extensions and takes the production branch below.
  if not exists(select 1 from pg_catalog.pg_available_extensions where name = 'pg_cron')
    or not exists(select 1 from pg_catalog.pg_available_extensions where name = 'pg_net') then
    return;
  end if;

  execute 'create extension if not exists pg_cron';
  execute 'create extension if not exists pg_net';

  -- Use dynamic SQL so schema resolution follows extension installation.
  for v_job_id in execute
    'select jobid from cron.job where jobname = ''qrguitar-paypal-webhook-sweep'''
  loop
    execute format('select cron.unschedule(%s)', v_job_id);
  end loop;

  execute $install$
    select cron.schedule(
      'qrguitar-paypal-webhook-sweep',
      '*/5 * * * *',
      $qrguitar_cron$
        select net.http_post(
          url := 'https://www.qrguitar.com/api/internal/paypal-webhook-sweep',
          headers := jsonb_build_object(
            'Authorization', 'Bearer ' || decrypted_secret,
            'Content-Type', 'application/json'
          ),
          body := '{}'::jsonb,
          timeout_milliseconds := 15000
        ) as request_id
        from (
          select min(decrypted_secret) as decrypted_secret
          from vault.decrypted_secrets
          where name = 'qrguitar_paypal_cron_secret'
          having count(*) = 1
        ) secret
        where octet_length(decrypted_secret) between 32 and 256
          and decrypted_secret !~ '[[:space:][:cntrl:]]'
      $qrguitar_cron$
    )
  $install$;
end
$migration$;

commit;
