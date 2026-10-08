-- Read-only inspection, no secrets, addresses, record bodies, queue claims or heartbeat writes.
-- Run only on the operator-verified destination. A prior readiness receipt is not current proof.
begin transaction read only;
set local statement_timeout='15s';
select public.qrguitar_release_readiness() as existing_release_readiness;
with feature_tables(name) as(values
 ('public.service_email_outbox_control'),('public.service_email_intents'),('public.action_email_control'),
 ('public.action_email_intents'),('public.action_email_operations'),('public.action_email_function_manifest')),
feature_columns(rel,col) as(values
 ('public.service_submissions','email_dispatch_mode'),('public.service_submissions','action_email_version'),
 ('public.service_submissions','service_cancel_recipient_role'),('public.ownership_claims','action_email_version'),
 ('public.ownership_claims','action_email_completed'),('public.ownership_claims','completion_expected_evidence'),
 ('public.ownership_transfers','action_email_version')),
required_functions(signature) as(values
 ('public.approve_service_submission(uuid,uuid,text)'),('public.approve_ownership_claim(uuid,uuid,text,boolean)'),
 ('public.complete_ownership_transfer(uuid,uuid,text,text,boolean,text)'),
 ('public.manage_ownership_transfer(uuid,uuid,text,text,boolean,text)'),
 ('public._account_deletion_write_fence()'))
select jsonb_build_object(
 'existingFeatureTables',coalesce((select jsonb_agg(name order by name) from feature_tables where to_regclass(name) is not null),'[]'::jsonb),
 'existingFeatureColumns',coalesce((select jsonb_agg(rel||'.'||col order by rel,col) from feature_columns e
   join pg_attribute a on a.attrelid=to_regclass(e.rel) and a.attname=e.col and a.attnum>0 and not a.attisdropped),'[]'::jsonb),
 'missingWorkflowFunctions',coalesce((select jsonb_agg(signature order by signature) from required_functions where to_regprocedure(signature) is null),'[]'::jsonb),
 'authConfirmedEmailColumn',exists(select 1 from pg_attribute where attrelid='auth.users'::regclass and attname='email_confirmed_at' and attnum>0 and not attisdropped),
 'cronAvailable',to_regclass('cron.job') is not null,
 'netAvailable',to_regnamespace('net') is not null,
 'vaultAvailable',to_regclass('vault.decrypted_secrets') is not null,
 'source','be098252d49817cd7fc9a3c11df5bd0c0e306273'
) as workflow_schema_inventory;
-- If any feature object exists, STOP. This is not permission to drop or rerun it.
-- When cron is available, separately inspect only these two names and their active flags:
-- select jobname,active from cron.job where jobname in('qrguitar-service-email-sweep','qrguitar-action-email-sweep');
-- Both must be absent before first installation. Existing unrelated schedules are untouched.
rollback;
