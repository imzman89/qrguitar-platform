import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const source='be098252d49817cd7fc9a3c11df5bd0c0e306273';
export const files=['service-email-outbox.sql','action-required-email.sql','claim-completion-recovery.sql','action-email-operations.sql','claim-outcome-email.sql','service-transfer-outcome-email.sql'];
const checks=['catalog_readable','required_functions','function_security','blocked_function_grants','private_tables','private_table_grants','server_only_policies','private_storage_buckets','private_storage_policy','receipt_constraints','editor_versioning','schema_columns','public_schema_create','self_security'];
const tables=['service_email_outbox_control','service_email_intents','action_email_control','action_email_intents','action_email_operations','action_email_function_manifest'];
const columns=[['service_submissions','email_dispatch_mode'],['service_submissions','action_email_version'],['service_submissions','service_cancel_recipient_role'],['ownership_claims','action_email_version'],['ownership_claims','action_email_completed'],['ownership_claims','completion_expected_evidence'],['ownership_transfers','action_email_version']];
export const preconditions=`
do $workflow_install_guard$
declare ready jsonb;
begin
 ready:=public.qrguitar_release_readiness();
 if ready->>'releaseVersion' is distinct from '2026-09-23.1' or (ready->>'ready')::boolean is not true
   or jsonb_array_length(ready->'checks')<>14 or exists(
     select name from unnest(array[${checks.map(x=>`'${x}'`).join(',')}]) name
     where (select count(*) from jsonb_array_elements(ready->'checks') c where c->>'name'=name and (c->>'ok')::boolean is true)<>1) then
   raise exception 'Reviewed base release readiness is required before workflow schema installation.';
 end if;
 if exists(select 1 from unnest(array[${tables.map(x=>`'public.${x}'`).join(',')}]) name where to_regclass(name) is not null)
   or exists(select 1 from(values ${columns.map(([t,c])=>`('${t}','${c}')`).join(',')}) expected(rel,col)
     join pg_attribute a on a.attrelid=to_regclass('public.'||expected.rel) and a.attname=expected.col and a.attnum>0 and not a.attisdropped)
   or to_regprocedure('public.cancel_service_submission(uuid,uuid,boolean,text)') is not null
   or to_regprocedure('public.complete_ownership_claim_submission(uuid,uuid)') is not null
   or to_regprocedure('public.action_email_readiness(text,text)') is not null then
   raise exception 'Workflow schema already present or partially installed; inspect before proceeding. No replay or drop is permitted.';
 end if;
 if not exists(select 1 from pg_attribute where attrelid='auth.users'::regclass and attname='email_confirmed_at' and attnum>0 and not attisdropped) then
   raise exception 'Existing Supabase Auth confirmed-email column is required.';
 end if;
end;$workflow_install_guard$;
`;
export const postconditions=`
do $workflow_install_receipt$
declare base jsonb;service jsonb;action jsonb;control public.action_email_control;ops public.action_email_operations;
begin
 base:=public.qrguitar_release_readiness();service:=public.service_email_outbox_readiness();action:=public.action_email_readiness(null,null);
 select * into control from public.action_email_control where singleton;
 select * into ops from public.action_email_operations where singleton;
 if (base->>'ready')::boolean is not true or base->>'releaseVersion' is distinct from '2026-09-23.1'
   or service->>'version' is distinct from '2026-09-26.service-email.1' or (service->>'ready')::boolean is not true
   or action->>'version' is distinct from '2026-09-27.action-email.3' or (action->>'schemaReady')::boolean is not true
   or (action->>'ready')::boolean is not false or control.singleton is null or ops.singleton is null
   or control.capture_enabled or control.dispatch_enabled or ops.project_url is not null or ops.approved_commit is not null
   or not exists(select 1 from public.service_email_outbox_control where singleton and not enabled and not dispatch_enabled)
   or exists(select 1 from public.service_email_intents) or exists(select 1 from public.action_email_intents) then
   raise exception 'Disabled installation postconditions failed; rollback the entire workflow schema.';
 end if;
 if to_regclass('cron.job') is not null and to_regnamespace('net') is not null then
   if (select count(*) from cron.job where jobname in('qrguitar-service-email-sweep','qrguitar-action-email-sweep'))<>2
     or exists(select 1 from cron.job where jobname in('qrguitar-service-email-sweep','qrguitar-action-email-sweep') and active) then
     raise exception 'Expected exactly two inactive workflow schedules.';
   end if;
 end if;
end;$workflow_install_receipt$;
`;
export function buildWorkflowSchemaBundle(repo){
 const manifest=[];
 const bodies=files.map(file=>{
  const sql=execFileSync('git',['show',`${source}:supabase/proposals/${file}`],{cwd:repo,encoding:'utf8',maxBuffer:1024*1024}).replaceAll('\r\n','\n');
  const opening=sql.indexOf('\nbegin;');
  assert.ok(opening>=0&&sql.slice(0,opening).split('\n').every(line=>!line.trim()||line.trimStart().startsWith('--')),`Unreviewed wrapper: ${file}`);
  assert.match(sql,/\ncommit;\s*$/);assert.equal((sql.match(/^commit;\s*$/gm)||[]).length,1);
  const body=sql.slice(opening+'\nbegin;'.length).replace(/\ncommit;\s*$/,'');
  assert.doesNotMatch(body,/^\s*(commit|rollback|start transaction)\s*;/im);
  const sha256=createHash('sha256').update(sql).digest('hex');manifest.push({file,sha256});
  return `\n-- Source file: ${file}; normalized SHA256: ${sha256}\n${body}\n`;
 });
 return {manifest,sql:`-- Reviewed source ${source}. No secret, provider call, activation or backfill.\n-- Boss/operator only: inspect fresh preflight and obtain the maintenance/drain receipt first.\nbegin;\nset local lock_timeout='5s';\nset local statement_timeout='60s';\n${preconditions}${bodies.join('')}${postconditions}\ncommit;\n`};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const output=process.argv[2];assert.ok(output&&path.isAbsolute(output),'Pass an absolute output path. This command only writes a SQL artifact; it never connects to a database.');
 const repo=path.resolve(import.meta.dirname,'../../..'),bundle=buildWorkflowSchemaBundle(repo);
 fs.writeFileSync(output,bundle.sql,{flag:'wx'});
 console.log(JSON.stringify({source,output,files:bundle.manifest.length,sha256:createHash('sha256').update(bundle.sql).digest('hex'),databaseConnected:false}));
}
