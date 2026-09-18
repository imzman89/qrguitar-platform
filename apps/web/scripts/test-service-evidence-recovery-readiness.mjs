import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const arg=(key,fallback)=>process.argv.includes(key)?process.argv[process.argv.indexOf(key)+1]:fallback;
const repo=path.resolve(arg('--repo',path.resolve(here,'../../..'))),overlay=path.resolve(arg('--migration-root',repo));
const source=path.resolve(arg('--recovery-sql',path.join(overlay,'supabase/migrations/20260917220000_service_evidence_recovery.sql')));
const readinessPath=path.join(overlay,'supabase/migrations/20260917221000_release_readiness.sql'),manifestPath=path.join(overlay,'apps/web/scripts/release-readiness-manifest.json');
const normalize=s=>s.replaceAll('\r\n','\n'),sha=s=>createHash('sha256').update(normalize(s)).digest('hex');
const recovery=fs.readFileSync(source,'utf8'),readiness=fs.readFileSync(readinessPath,'utf8'),manifestText=fs.readFileSync(manifestPath,'utf8'),manifest=JSON.parse(manifestText);
const helperPermissionsPath=path.join(overlay,'supabase/migrations/20260917220500_site_editor_helper_permissions.sql'),helperPermissions=fs.readFileSync(helperPermissionsPath,'utf8');
assert.equal(manifest.releaseVersion,'2026-09-17.6');assert.equal(sha(recovery),manifest.serviceEvidenceRecoverySourceSha256);
const {PGlite}=createRequire(path.join(repo,'package.json'))('@electric-sql/pglite');
const {installRepositorySchema}=await import(pathToFileURL(path.join(repo,'apps/web/scripts/security/postgres-fixture.mjs')));
const db=new PGlite(),savedFetch=globalThis.fetch;globalThis.fetch=async()=>{throw Error('External requests forbidden');};
let passed=0;const ident=s=>'"'+s.replaceAll('"','""')+'"';
const ready=async()=>(await db.query('select qrguitar_release_readiness() value')).rows[0].value;
async function pristine(){const r=await ready();assert.equal(r.releaseVersion,'2026-09-17.6');assert.equal(r.ready,true,JSON.stringify(r));assert.equal(r.checks.length,14);assert.deepEqual(r.checks.map(c=>c.name),manifest.checks);assert(r.checks.every(c=>c.ok===true));}
async function fails(key){const r=await ready();assert.equal(r.ready,false);assert.equal(r.checks.find(c=>c.name===key)?.ok,false,JSON.stringify(r));}
async function test(name,run){await db.exec('begin');try{await run();passed++;console.log('PASS '+name);}finally{await db.exec('rollback');}await pristine();}
const definition=async signature=>(await db.query('select pg_get_functiondef($1::regprocedure) value',[signature])).rows[0].value;
const functions=manifest.serviceEvidenceFunctionSignatures,tables=manifest.serviceEvidenceTables;
try{
  await installRepositorySchema(db,repo,'20260917220000');await db.exec(recovery);await db.exec(helperPermissions);await db.exec(readiness);
  await db.exec("insert into storage.buckets(id,name,public) values('instrument-media','instrument-media',false),('instrument-documents','instrument-documents',false) on conflict(id) do update set public=false");
  await test('all fourteen contracts pass read-only under service role',async()=>{await db.exec('set transaction read only;set local role service_role');await pristine();});
  for(const principal of ['anon','authenticated'])await test(principal+' cannot execute readiness',async()=>{await db.exec('savepoint denial;set local role '+principal);await assert.rejects(ready,e=>e.code==='42501');await db.exec('rollback to savepoint denial;reset role');});
  for(const fn of functions){
    await test('function body drift '+fn,async()=>{const sql=await definition(fn);assert(sql.includes('AS $function$'));await db.exec(sql.replace('AS $function$','AS $function$\n-- changed executable source'));await fails('function_security');});
    await test('unsafe search path '+fn,async()=>{await db.exec('alter function '+fn+' set search_path=public');await fails('function_security');});
    for(const principal of ['public','anon','authenticated'])await test('forbidden '+principal+' EXECUTE '+fn,async()=>{await db.exec('grant execute on function '+fn+' to '+principal);await fails(fn.includes('public._')?'blocked_function_grants':'function_security');});
    if(fn.includes('public._'))await test('helper service EXECUTE '+fn,async()=>{await db.exec('grant execute on function '+fn+' to service_role');await fails('blocked_function_grants');});
    else await test('required service EXECUTE '+fn,async()=>{await db.exec('revoke execute on function '+fn+' from service_role');await fails('function_security');});
  }
  const prepare=functions.find(f=>f.startsWith('public.prepare_service_evidence_upload(')&&f.endsWith(',bigint)'));
  const complete=functions.find(f=>f.startsWith('public.commit_service_evidence_upload(')&&f.endsWith(',bigint)'));
  const discard=functions.find(f=>f.startsWith('public.discard_service_evidence_upload('));
  for(const [name,fn,needle,replacement] of [
    ['revision fence removed',prepare,'p_expected_revision<>rev','false'],
    ['pending fence removed',prepare,"if exists(select 1 from public.service_evidence_uploads where submission_id=p_submission_id and actor_id=p_actor_id and state='prepared')",'if false'],
    ['cross-table identity lock removed',prepare,"perform pg_advisory_xact_lock(hashtextextended('qrguitar:service-evidence-upload:'||p_upload_id::text,0));",'null;'],
    ['Storage size proof removed',complete,"m->'size' is distinct from to_jsonb(u.file_size_bytes)",'false'],
    ['deleted terminal fence removed',complete,"u.state='deleted'",'false'],
    ['discard tombstone check removed',complete,'if d.upload_id is not null then','if false then'],
    ['absent-discard scope fence removed',discard,'if p_expected_revision=rev then','if false then']
  ])await test(name,async()=>{const sql=await definition(fn);assert(sql.includes(needle),name);await db.exec(sql.replace(needle,replacement));await fails('function_security');});
  await test('unknown overload rejected',async()=>{await db.exec("create function commit_service_evidence_upload(uuid) returns jsonb language sql as $$select '{}'::jsonb$$");await fails('function_security');});
  for(const table of tables){
    await test('missing private table '+table,async()=>{await db.exec('drop table '+ident(table)+' cascade');await fails('private_tables');});
    await test('RLS disabled '+table,async()=>{await db.exec('alter table '+ident(table)+' disable row level security');await fails('private_tables');});
    const column=manifest.columns.find(c=>c.table===table).name;
    for(const principal of ['public','anon','authenticated','service_role']){
      await test('forbidden '+principal+' table SELECT '+table,async()=>{await db.exec('grant select on '+ident(table)+' to '+principal);await fails('private_table_grants');});
      await test('forbidden '+principal+' column SELECT '+table,async()=>{await db.exec('grant select('+ident(column)+') on '+ident(table)+' to '+principal);await fails('private_table_grants');});
    }
    await test('extra schema column '+table,async()=>{await db.exec('alter table '+ident(table)+' add column unreviewed text');await fails('schema_columns');});
  }
  for(const policy of manifest.serviceEvidencePolicies){
    await test('missing restrictive policy '+policy.table,async()=>{await db.exec('drop policy '+ident(policy.name)+' on '+ident(policy.table));await fails('server_only_policies');});
    await test('same-name permissive policy '+policy.table,async()=>{await db.exec('drop policy '+ident(policy.name)+' on '+ident(policy.table)+';create policy '+ident(policy.name)+' on '+ident(policy.table)+' as permissive for all to public using(false) with check(false)');await fails('server_only_policies');});
  }
  for(const [table,name] of manifest.provenanceTriggers.filter(([,name])=>name.startsWith('service_evidence_upload_'))){
    await test('missing trigger '+name,async()=>{await db.exec('drop trigger '+ident(name)+' on '+ident(table));await fails('schema_columns');});
    await test('disabled trigger '+name,async()=>{await db.exec('alter table '+ident(table)+' disable trigger '+ident(name));await fails('schema_columns');});
  }
  for(const c of manifest.columns.filter(c=>tables.includes(c.table)&&c.not_null))await test('required nullability '+c.table+'.'+c.name,async()=>{
    const pkey=manifest.serviceEvidenceConstraints.find(x=>x.table===c.table&&x.type==='p');
    if(pkey&&new RegExp('\\b'+c.name+'\\b').test(pkey.definition))await db.exec('alter table '+ident(c.table)+' drop constraint '+ident(pkey.name));
    await db.exec('alter table '+ident(c.table)+' alter column '+ident(c.name)+' drop not null');await fails('schema_columns');
  });
  for(const c of manifest.serviceEvidenceDefaults.filter(c=>c.expression!==null))await test('default removed '+c.table+'.'+c.name,async()=>{await db.exec('alter table '+ident(c.table)+' alter column '+ident(c.name)+' drop default');await fails('schema_columns');});
  for(const c of manifest.serviceEvidenceConstraints)await test('constraint removed '+c.name,async()=>{await db.exec('alter table '+ident(c.table)+' drop constraint '+ident(c.name));await fails('receipt_constraints');});
  for(const index of manifest.serviceEvidenceIndexes)await test('index removed '+index.name,async()=>{const constraint=manifest.serviceEvidenceConstraints.find(c=>c.table===index.table&&c.name===index.name&&['p','u'].includes(c.type));await db.exec(constraint?'alter table '+ident(index.table)+' drop constraint '+ident(index.name):'drop index '+ident(index.name));await fails('receipt_constraints');});
  for(const change of ["public=true","file_size_limit=null","file_size_limit=15728641","allowed_mime_types=null","allowed_mime_types=array['application/pdf']","allowed_mime_types=array['application/pdf','image/jpeg','image/png','image/webp','text/html']"])await test('bucket remains strict '+change,async()=>{await db.exec('update storage.buckets set '+change+" where id='service-evidence'");await fails('private_storage_buckets');});
  await test('authoritative Storage metadata still required',async()=>{await db.exec('alter table storage.objects drop column metadata');await fails('schema_columns');});
  await test('billing ledger still private',async()=>{await db.exec('grant select on billing_credit_grants to authenticated');await fails('private_table_grants');});
  const intakeTrigger=manifest.provenanceTriggers.find(([table])=>table==='account_deletion_request_receipts');
  await test('intake receipt fence still required',async()=>{await db.exec('alter table '+ident(intakeTrigger[0])+' disable trigger '+ident(intakeTrigger[1]));await fails('schema_columns');});
  assert.equal(sha(fs.readFileSync(source,'utf8')),sha(recovery));assert.equal(sha(fs.readFileSync(readinessPath,'utf8')),sha(readiness));assert.equal(sha(fs.readFileSync(manifestPath,'utf8')),sha(manifestText));
  assert.equal(sha(fs.readFileSync(helperPermissionsPath,'utf8')),sha(helperPermissions));
  console.log(JSON.stringify({passed,failed:0,migrationSha256:sha(recovery),readinessSha256:sha(readiness),manifestSha256:sha(manifestText),runtime:'actual PGlite catalog mutations; rollback and all14 restored after each; no network'}));
}finally{globalThis.fetch=savedFetch;await db.close();}
