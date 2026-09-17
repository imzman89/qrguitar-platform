import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const option=(name,fallback)=>process.argv.includes(name)?process.argv[process.argv.indexOf(name)+1]:fallback;
const repo=path.resolve(option('--repo',path.resolve(here,'../../..')));
const overlay=path.resolve(option('--migration-root',repo));
const uploadPath=path.resolve(option('--upload-sql',path.join(overlay,'supabase/migrations/20260917210000_service_evidence_uploads.sql')));
const readinessPath=path.join(overlay,'supabase/migrations/20260917211000_release_readiness.sql');
const manifestPath=path.join(overlay,'apps/web/scripts/release-readiness-manifest.json');
const sha=value=>createHash('sha256').update(value).digest('hex'),normalized=value=>value.replaceAll('\r\n','\n');
const upload=fs.readFileSync(uploadPath,'utf8'),readiness=fs.readFileSync(readinessPath,'utf8'),manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
assert.equal(manifest.releaseVersion,'2026-09-17.5');assert.equal(sha(normalized(upload)),manifest.serviceEvidenceSourceSha256);
const {PGlite}=createRequire(path.join(repo,'package.json'))('@electric-sql/pglite');
const {installRepositorySchema}=await import(pathToFileURL(path.join(repo,'apps/web/scripts/security/postgres-fixture.mjs')).href);
const db=new PGlite(),savedFetch=globalThis.fetch;
globalThis.fetch=async()=>{throw new Error('External network forbidden in readiness fault tests.');};
let passed=0;
const ident=value=>'"'+value.replaceAll('"','""')+'"';
const ready=async()=>(await db.query('select public.qrguitar_release_readiness() value')).rows[0].value;
async function pristine(){const r=await ready();assert.equal(r.releaseVersion,'2026-09-17.5');assert.equal(r.ready,true,JSON.stringify(r));assert.deepEqual(r.checks.map(c=>c.name),manifest.checks);assert.equal(r.checks.length,14);assert(r.checks.every(c=>c.ok===true));}
async function failed(key){const r=await ready();assert.equal(r.releaseVersion,'2026-09-17.5');assert.equal(r.ready,false);assert.equal(r.checks.find(c=>c.name===key)?.ok,false,JSON.stringify(r));}
async function test(name,run){await db.exec('begin');try{await run();passed++;console.log('PASS '+name);}finally{await db.exec('rollback');}await pristine();}
const functions=manifest.serviceEvidenceFunctionSignatures;
const definition=async signature=>(await db.query('select pg_get_functiondef($1::regprocedure) value',[signature])).rows[0].value;
try{
  await installRepositorySchema(db,repo,'20260917210000');
  await db.exec('alter table storage.objects add column if not exists metadata jsonb');
  await db.exec(upload);await db.exec(readiness);
  await db.exec("insert into storage.buckets(id,name,public) values('instrument-media','instrument-media',false),('instrument-documents','instrument-documents',false) on conflict(id) do update set public=false");
  await test('all historical and new contracts pass in read-only service transaction',async()=>{await db.exec('set transaction read only;set local role service_role');await pristine();});
  for(const principal of ['anon','authenticated'])await test(principal+' cannot execute readiness',async()=>{await db.exec('savepoint denial;set local role '+principal);await assert.rejects(ready,error=>error.code==='42501');await db.exec('rollback to savepoint denial;reset role');});
  for(const signature of functions){
    await test('changed implementation '+signature,async()=>{const source=await definition(signature);assert(source.includes('AS $function$'));await db.exec(source.replace('AS $function$','AS $function$\n-- actual executable definition drift'));await failed('function_security');});
    await test('wrong search path '+signature,async()=>{await db.exec('alter function '+signature+' set search_path=public');await failed('function_security');});
    for(const principal of ['public','anon','authenticated'])await test('forbidden '+principal+' function grant '+signature,async()=>{await db.exec('grant execute on function '+signature+' to '+principal);await failed(signature.includes('public._')?'blocked_function_grants':'function_security');});
  }
  for(const signature of functions.filter(s=>s.includes('public._')))await test('private helper cannot be exposed to service '+signature,async()=>{await db.exec('grant execute on function '+signature+' to service_role');await failed('blocked_function_grants');});
  for(const signature of functions.filter(s=>!s.includes('public._')))await test('missing service grant '+signature,async()=>{await db.exec('revoke execute on function '+signature+' from service_role');await failed('function_security');});
  await test('unreviewed mutation overload fails',async()=>{await db.exec("create function public.commit_service_evidence_upload(uuid) returns jsonb language sql as $$select '{}'::jsonb$$");await failed('function_security');});
  await test('weakened authoritative size check fails',async()=>{const sig=functions.find(s=>s.startsWith('public.commit_service_evidence_upload(')),source=await definition(sig),needle="object_metadata->'size' is distinct from to_jsonb(receipt.file_size_bytes)";assert(source.includes(needle));await db.exec(source.replace(needle,'false'));await failed('function_security');});
  await test('weakened deleted-receipt fence fails',async()=>{const sig=functions.find(s=>s.startsWith('public.commit_service_evidence_upload(')),source=await definition(sig),needle="receipt.state='deleted'";assert(source.includes(needle));await db.exec(source.replace(needle,'false'));await failed('function_security');});
  const table='service_evidence_uploads';
  await test('missing receipt table fails closed',async()=>{await db.exec('drop table public.'+table+' cascade');await failed('private_tables');});
  await test('RLS disabled fails',async()=>{await db.exec('alter table public.'+table+' disable row level security');await failed('private_tables');});
  for(const principal of ['public','anon','authenticated','service_role']){
    await test('forbidden '+principal+' table privilege',async()=>{await db.exec('grant select on public.'+table+' to '+principal);await failed('private_table_grants');});
    await test('forbidden '+principal+' column privilege',async()=>{await db.exec('grant select(file_name) on public.'+table+' to '+principal);await failed('private_table_grants');});
  }
  await test('restrictive private policy removed',async()=>{await db.exec('drop policy service_evidence_uploads_no_direct_access on public.'+table);await failed('server_only_policies');});
  await test('same-name permissive policy fails',async()=>{await db.exec('drop policy service_evidence_uploads_no_direct_access on public.'+table+';create policy service_evidence_uploads_no_direct_access on public.'+table+' as permissive for all to public using(false) with check(false)');await failed('server_only_policies');});
  for(const trigger of manifest.provenanceTriggers.filter(([,name])=>name.startsWith('service_evidence_upload_'))){
    await test('removed '+trigger[1]+' fails',async()=>{await db.exec('drop trigger '+ident(trigger[1])+' on public.'+ident(trigger[0]));await failed('schema_columns');});
    await test('disabled '+trigger[1]+' fails',async()=>{await db.exec('alter table public.'+ident(trigger[0])+' disable trigger '+ident(trigger[1]));await failed('schema_columns');});
  }
  for(const column of manifest.columns.filter(c=>c.table===table&&c.not_null))await test('required nullability '+column.name,async()=>{if(column.name==='upload_id')await db.exec('alter table '+table+' drop constraint service_evidence_uploads_pkey');await db.exec('alter table '+table+' alter column '+ident(column.name)+' drop not null');await failed('schema_columns');});
  for(const item of manifest.serviceEvidenceDefaults.filter(c=>c.expression!==null))await test('missing default '+item.name,async()=>{await db.exec('alter table '+table+' alter column '+ident(item.name)+' drop default');await failed('schema_columns');});
  for(const item of manifest.serviceEvidenceConstraints)await test('missing constraint '+item.name,async()=>{await db.exec('alter table '+table+' drop constraint '+ident(item.name));await failed('receipt_constraints');});
  for(const item of manifest.serviceEvidenceIndexes)await test('missing exact index '+item.name,async()=>{const constraint=manifest.serviceEvidenceConstraints.find(c=>c.name===item.name&&['p','u'].includes(c.type));await db.exec(constraint?'alter table '+table+' drop constraint '+ident(item.name):'drop index public.'+ident(item.name));await failed('receipt_constraints');});
  await test('unexpected receipt column fails',async()=>{await db.exec('alter table '+table+' add column unreviewed text');await failed('schema_columns');});
  await test('missing authoritative Storage metadata fails',async()=>{await db.exec('alter table storage.objects drop column metadata');await failed('schema_columns');});
  for(const change of ["public=true","file_size_limit=null","file_size_limit=15728641","file_size_limit=1","allowed_mime_types=null","allowed_mime_types=array['application/pdf']","allowed_mime_types=array['application/pdf','image/jpeg','image/png','image/webp','text/html']"])await test('bucket invariant '+change,async()=>{await db.exec("update storage.buckets set "+change+" where id='service-evidence'");await failed('private_storage_buckets');});
  await test('historical billing security remains enforced',async()=>{await db.exec('grant select on public.billing_orders to service_role');await failed('private_table_grants');});
  await test('historical intake receipt fence remains enforced',async()=>{await db.exec('alter table public.account_deletion_request_receipts disable trigger account_deletion_receipts_immutable');await failed('schema_columns');});
  assert.equal(sha(fs.readFileSync(uploadPath)),sha(upload),'Upload SQL changed during test');assert.equal(sha(fs.readFileSync(readinessPath)),sha(readiness),'Readiness SQL changed during test');
  console.log(JSON.stringify({passed,failed:0,runtime:'actual isolated PGlite catalog faults with rollback; no remote calls',uploadSha256:sha(normalized(upload)),readinessSha256:sha(normalized(readiness)),manifestSha256:sha(fs.readFileSync(manifestPath))}));
}catch(error){console.error('FAIL after '+passed+' cases: '+error.message+' ['+(error.code||'assertion')+']');process.exitCode=1;}finally{await db.close();globalThis.fetch=savedFetch;}
