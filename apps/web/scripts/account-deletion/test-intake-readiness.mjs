// Actual catalog fault injection in an in-memory PGlite database only. No network or live credentials.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), opts = new Map();
assert.equal(args.length % 2,0,'Each argument requires a value');
for (let i=0;i<args.length;i+=2) {
  assert.ok(['--repo','--source-root','--intake-sql','--report'].includes(args[i]) && !opts.has(args[i]),'Unknown or duplicate option');
  assert.ok(args[i+1] && !args[i+1].startsWith('--'),'Missing option value'); opts.set(args[i],args[i+1]);
}
const repo = path.resolve(opts.get('--repo') || path.join(here,'../../../..'));
const source = path.resolve(opts.get('--source-root') || repo);
const intakePath = path.resolve(opts.get('--intake-sql') || path.join(source,'supabase/migrations/20260917200000_account_deletion_intake.sql'));
const readinessPath = path.join(source,'supabase/migrations/20260917201000_release_readiness.sql');
const intakeSql = fs.readFileSync(intakePath,'utf8'), readinessSql = fs.readFileSync(readinessPath,'utf8');
const manifestText = readinessSql.match(/\$manifest\$([\s\S]*?)\$manifest\$/)?.[1];
assert.ok(manifestText, 'Historical intake readiness manifest is required');
const manifest = JSON.parse(manifestText);
const sha = value => createHash('sha256').update(value).digest('hex');
const normalize = value => value.replaceAll('\r\n','\n');
assert.equal(manifest.releaseVersion,'2026-09-17.4'); assert.equal(manifest.checks.length,14);
assert.deepEqual([...manifest.intakeTables].sort(),['account_deletion_actor_revisions','account_deletion_request_receipts','account_deletion_requests']);
assert.equal(sha(normalize(intakeSql)),manifest.intakeSourceSha256,'Readiness manifest must bind the exact reviewed intake SQL');
const { PGlite } = createRequire(path.join(repo,'apps/web/package.json'))('@electric-sql/pglite-pg17');
const { installRepositorySchema } = await import(pathToFileURL(path.join(repo,'apps/web/scripts/security/postgres-fixture.mjs')));
const canonicalSources = () => ['apps/web/scripts/security/postgres-fixture.mjs',
  ...['schema.sql','security-rls.sql','admin-panel-foundation.sql','record-archive-controls.sql','service-history-timeline.sql','lost-stolen-safety-status.sql'].map(file=>'supabase/'+file),
  ...fs.readdirSync(path.join(repo,'supabase/migrations')).filter(file=>file.endsWith('.sql')&&file<'20260917200000').sort().map(file=>'supabase/migrations/'+file)];
const canonicalHashes = () => Object.fromEntries(canonicalSources().map(file=>[file,sha(fs.readFileSync(path.join(repo,file)))]));
const db = new PGlite(), results = [], previousFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('Network is forbidden in this isolated readiness suite'); };
const report = { scope:'Isolated actual PGlite catalog faults; no live database or PostgreSQL17 scheduling proof.', tests:results,
  canonicalSchemaHashes:canonicalHashes(),
  sourceHashes:{ intake:sha(intakeSql),readiness:sha(readinessSql),manifest:sha(manifestText),runner:sha(fs.readFileSync(fileURLToPath(import.meta.url))) } };
const ident = value => { assert.match(value,/^[a-z_][a-z_0-9]*$/); return '"'+value+'"'; };
const ready = async () => (await db.query('select public.qrguitar_release_readiness() result')).rows[0].result;
function shape(value) {
  assert.deepEqual(Object.keys(value).sort(),['checks','ready','releaseVersion']); assert.equal(value.releaseVersion,'2026-09-17.4');
  assert.equal(typeof value.ready,'boolean'); assert.deepEqual(value.checks.map(item=>item.name),manifest.checks);
  assert.equal(new Set(value.checks.map(item=>item.name)).size,14);
  for (const item of value.checks) { assert.deepEqual(Object.keys(item).sort(),['name','ok']); assert.equal(typeof item.ok,'boolean'); }
}
async function pristine() { const value=await ready();shape(value);assert.equal(value.ready,true,JSON.stringify(value));assert.ok(value.checks.every(item=>item.ok)); }
async function rejected(check) { const value=await ready();shape(value);assert.equal(value.ready,false,JSON.stringify(value));assert.equal(value.checks.find(item=>item.name===check)?.ok,false,check); }
async function test(name,work) {
  let failure;
  await db.exec('begin');
  try { await work(); } catch(error) { failure=error; }
  finally { await db.exec('rollback'); }
  try { await pristine(); } catch(error) { failure ||= error; }
  if (failure) { results.push({name,ok:false,message:String(failure.message),code:failure.code});console.log('FAIL '+name+': '+failure.message); }
  else { results.push({name,ok:true});console.log('PASS '+name); }
}
const definition = async signature => (await db.query('select pg_get_functiondef($1::regprocedure) definition',[signature])).rows[0].definition;
const columns = manifest.columns.filter(item=>manifest.intakeTables.includes(item.table));
const serviceFunctions = manifest.serviceFunctions.filter(signature=>signature.includes('account_deletion'));
const helpers = manifest.blockedFunctions.filter(signature=>signature.includes('account_deletion'));
const triggers = manifest.provenanceTriggers.filter(([table])=>manifest.intakeTables.includes(table));

try {
  // Avoid duplicate proposal installation even after root integrates canonical .4.
  await installRepositorySchema(db,repo,'20260917200000');
  await db.exec(intakeSql); await db.exec(readinessSql);
  await db.exec("insert into storage.buckets(id,name,public) values('instrument-media','instrument-media',false),('instrument-documents','instrument-documents',false),('service-evidence','service-evidence',false) on conflict(id) do update set public=false");
  report.databaseVersion=(await db.query('select version() version')).rows[0].version;
  await pristine();
  await test('pristine revision-fenced intake returns .4 and exactly fourteen true checks',pristine);
  await test('readiness service execution succeeds in a read-only transaction',async()=>{
    await db.exec('set transaction read only; set local role service_role'); await pristine();
  });
  for(const role of ['anon','authenticated']) await test(role+' cannot execute readiness',async()=>{
    await db.exec('set local role '+role); await assert.rejects(ready,error=>error.code==='42501');
  });

  for(const signature of serviceFunctions) {
    await test('missing required intake RPC: '+signature,async()=>{await db.exec('drop function '+signature);await rejected('required_functions');});
    for(const role of ['public','anon','authenticated']) await test('intake RPC cannot gain '+role+' EXECUTE: '+signature,async()=>{
      await db.exec('grant execute on function '+signature+' to '+role);await rejected('function_security');
    });
    await test('intake RPC must retain service EXECUTE: '+signature,async()=>{await db.exec('revoke execute on function '+signature+' from service_role');await rejected('function_security');});
    await test('intake RPC cannot become owned by service_role: '+signature,async()=>{await db.exec('alter function '+signature+' owner to service_role');await rejected('function_security');});
  }
  for(const signature of helpers) {
    for(const role of ['service_role','public','anon','authenticated']) await test('private intake helper cannot gain '+role+' EXECUTE: '+signature,async()=>{
      await db.exec('grant execute on function '+signature+' to '+role);await rejected('blocked_function_grants');
    });
  }
  await test('changed submit revision-conflict semantics fails fixed source fingerprint',async()=>{
    const original=await definition('public.submit_account_deletion_request(uuid,uuid,bigint)');
    assert.ok(original.includes("errcode = 'PD412'"));await db.exec(original.replace("errcode = 'PD412'","errcode = 'PD409'"));await rejected('function_security');
  });
  await test('changed actor lock namespace fails helper fingerprint',async()=>{
    const original=await definition('public._account_deletion_lock_actor(uuid)');
    assert.ok(original.includes('qrguitar:privacy-request:'));await db.exec(original.replace('qrguitar:privacy-request:','qrguitar:wrong-request:'));await rejected('function_security');
  });
  await test('intake RPC cannot lose SECURITY DEFINER or its fixed search path',async()=>{
    await db.exec('alter function public.submit_account_deletion_request(uuid,uuid,bigint) security invoker');await rejected('function_security');
  });
  await test('intake RPC fixed search path cannot be widened',async()=>{
    await db.exec('alter function public.submit_account_deletion_request(uuid,uuid,bigint) set search_path=public,pg_catalog');await rejected('function_security');
  });
  for(const sql of [
    'create function public.submit_account_deletion_request(uuid,uuid) returns jsonb language sql as $$select jsonb_build_object(\'ok\',true)$$',
    'create function public.cancel_account_deletion_request(uuid,uuid,uuid) returns jsonb language sql as $$select jsonb_build_object(\'ok\',true)$$',
    'create function public._account_deletion_bypass(uuid) returns void language sql as $$select$$'
  ]) await test('unexpected intake function/legacy overload cannot pass inventory: '+sql.split(' returns ')[0],async()=>{
    await db.exec(sql);await rejected('function_security');
  });

  for(const table of manifest.intakeTables) {
    const column=columns.find(item=>item.table===table).name;
    await test(table+' missing table fails closed',async()=>{await db.exec('drop table public.'+ident(table)+' cascade');await rejected('private_tables');});
    await test(table+' disabled RLS fails closed',async()=>{await db.exec('alter table public.'+ident(table)+' disable row level security');await rejected('private_tables');});
    for(const role of ['public','anon','authenticated','service_role']) {
      await test(table+' direct SELECT denied even for '+role,async()=>{await db.exec('grant select on public.'+ident(table)+' to '+role);await rejected('private_table_grants');});
      await test(table+' column-only SELECT denied even for '+role,async()=>{await db.exec('grant select('+ident(column)+') on public.'+ident(table)+' to '+role);await rejected('private_table_grants');});
    }
    for(const privilege of ['insert','update','delete','truncate','references','trigger']) await test(table+' direct service '+privilege+' fails readiness',async()=>{
      await db.exec('grant '+privilege+' on public.'+ident(table)+' to service_role');await rejected('private_table_grants');
    });
    await test(table+' unexpected private column cannot escape inventory',async()=>{await db.exec('alter table public.'+ident(table)+' add column private_unreviewed text');await rejected('schema_columns');});
  }
  for(const policy of manifest.intakePolicies) {
    const drop='drop policy '+ident(policy.name)+' on public.'+ident(policy.table)+';';
    await test(policy.table+' missing restrictive policy fails',async()=>{await db.exec(drop);await rejected('server_only_policies');});
    await test(policy.table+' same-name permissive policy fails',async()=>{await db.exec(drop+'create policy '+ident(policy.name)+' on public.'+ident(policy.table)+' as permissive for all to public using(false) with check(false)');await rejected('server_only_policies');});
    await test(policy.table+' weakened restrictive policy fails',async()=>{await db.exec('alter policy '+ident(policy.name)+' on public.'+ident(policy.table)+' using(true) with check(true)');await rejected('server_only_policies');});
  }

  await test('all intake nullability uses pg_attribute and excludes PG18-only NOT NULL constraint rows',async()=>{
    assert.ok(manifest.intakeConstraints.every(item=>item.type!=='n'));
    const actual=(await db.query("select t.relname as table,a.attname as name,format_type(a.atttypid,a.atttypmod) type,a.attnotnull as not_null from pg_attribute a join pg_class t on t.oid=a.attrelid where t.relnamespace='public'::regnamespace and t.relname=any($1) and a.attnum>0 and not a.attisdropped order by t.relname,a.attname",[manifest.intakeTables])).rows;
    assert.deepEqual(actual,[...columns].sort((a,b)=>(a.table+'.'+a.name).localeCompare(b.table+'.'+b.name)));await pristine();
  });
  for(const column of columns) {
    await test('missing intake column '+column.table+'.'+column.name,async()=>{await db.exec('alter table public.'+ident(column.table)+' drop column '+ident(column.name)+' cascade');await rejected('schema_columns');});
    if(column.not_null) await test('nullable required intake column '+column.table+'.'+column.name,async()=>{
      const keys=(await db.query("select c.conname from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey) where c.conrelid=$1::regclass and c.contype='p' and a.attname=$2",['public.'+column.table,column.name])).rows;
      for(const key of keys)await db.exec('alter table public.'+ident(column.table)+' drop constraint '+ident(key.conname)+' cascade');
      await db.exec('alter table public.'+ident(column.table)+' alter column '+ident(column.name)+' drop not null');await rejected('schema_columns');
    });
  }
  for(const [table,column,type] of [['account_deletion_requests','status','varchar(20)'],['account_deletion_actor_revisions','revision','numeric'],['account_deletion_request_receipts','expected_revision','numeric']]) await test('wrong column type '+table+'.'+column,async()=>{
    await db.exec('alter table public.'+ident(table)+' alter column '+ident(column)+' type '+type);await rejected('schema_columns');
  });
  for(const item of manifest.intakeDefaults.filter(item=>item.expression!==null)) await test('missing reviewed default '+item.table+'.'+item.name,async()=>{
    await db.exec('alter table public.'+ident(item.table)+' alter column '+ident(item.name)+' drop default');await rejected('schema_columns');
  });
  await test('new default cannot be introduced on caller-supplied expected revision',async()=>{
    await db.exec('alter table public.account_deletion_request_receipts alter column expected_revision set default 0');await rejected('schema_columns');
  });
  for(const item of manifest.intakeConstraints) await test('missing intake constraint '+item.name,async()=>{
    await db.exec('alter table public.'+ident(item.table)+' drop constraint '+ident(item.name)+' cascade');await rejected('receipt_constraints');
  });
  for(const item of manifest.intakeConstraints.filter(item=>item.type==='f')) await test('foreign-key erasure cascade cannot replace restrictive intake linkage '+item.name,async()=>{
    assert.ok(item.definition.includes('ON DELETE RESTRICT'));
    await db.exec('alter table public.'+ident(item.table)+' drop constraint '+ident(item.name)+';alter table public.'+ident(item.table)+' add constraint '+ident(item.name)+' '+item.definition.replace('ON DELETE RESTRICT','ON DELETE CASCADE'));await rejected('receipt_constraints');
  });
  await test('receipt linkage cannot lose actor ownership while retaining request reference',async()=>{
    const item=manifest.intakeConstraints.find(item=>item.table==='account_deletion_request_receipts'&&item.type==='f');assert.ok(item);
    await db.exec('alter table public.account_deletion_request_receipts drop constraint '+ident(item.name)+';alter table public.account_deletion_request_receipts add constraint '+ident(item.name)+' foreign key(request_id) references public.account_deletion_requests(id) on delete restrict');await rejected('receipt_constraints');
  });
  for(const item of manifest.intakeConstraints.filter(item=>item.type==='c')) await test('unvalidated same-expression intake constraint '+item.name,async()=>{
    await db.exec('alter table public.'+ident(item.table)+' drop constraint '+ident(item.name)+';alter table public.'+ident(item.table)+' add constraint '+ident(item.name)+' '+item.definition+' not valid');await rejected('receipt_constraints');
  });
  await test('weakened revision check cannot pass under the expected name',async()=>{
    await db.exec('alter table account_deletion_actor_revisions drop constraint account_deletion_actor_revisions_revision_check;alter table account_deletion_actor_revisions add constraint account_deletion_actor_revisions_revision_check check(revision>=-1)');await rejected('receipt_constraints');
  });
  for(const item of manifest.intakeIndexes) await test('missing intake index '+item.name,async()=>{
    const constraint=manifest.intakeConstraints.find(c=>c.table===item.table&&c.name===item.name&&['p','u'].includes(c.type));
    await db.exec(constraint?'alter table public.'+ident(item.table)+' drop constraint '+ident(item.name)+' cascade':'drop index public.'+ident(item.name));await rejected('receipt_constraints');
  });
  await test('active request index cannot silently lose uniqueness',async()=>{
    await db.exec("drop index account_deletion_one_active_request;create index account_deletion_one_active_request on account_deletion_requests(actor_id) where status='requested'");await rejected('receipt_constraints');
  });
  await test('active request index cannot protect the wrong state',async()=>{
    await db.exec("drop index account_deletion_one_active_request;create unique index account_deletion_one_active_request on account_deletion_requests(actor_id) where status='cancelled'");await rejected('receipt_constraints');
  });
  for(const [table,name] of triggers) {
    await test('disabled intake guard trigger '+name,async()=>{await db.exec('alter table public.'+ident(table)+' disable trigger '+ident(name));await rejected('schema_columns');});
    await test('missing intake guard trigger '+name,async()=>{await db.exec('drop trigger '+ident(name)+' on public.'+ident(table));await rejected('schema_columns');});
  }
  await test('same-name intake guard trigger cannot become insert-only',async()=>{
    await db.exec('drop trigger account_deletion_receipts_immutable on account_deletion_request_receipts;create trigger account_deletion_receipts_immutable before insert on account_deletion_request_receipts for each row execute function _account_deletion_intake_guard()');await rejected('schema_columns');
  });

  for(const signature of ['public.submit_account_deletion_request(uuid,uuid,bigint)','public.cancel_account_deletion_request(uuid,uuid,uuid,bigint)']) await test('changed hourly scan bound fails fixed RPC fingerprint: '+signature,async()=>{
    const original=await definition(signature);assert.ok(manifest.intakeFunctionSignatures.includes(signature));
    assert.ok(original.includes('limit 60'),'Reviewed bounded receipt scan must exist');assert.ok(original.includes("'PD429'"));
    // Execute a valid but weakened bound and observe readiness reject the changed body.
    await db.exec(original.replace('limit 60','limit 600'));await rejected('function_security');
  });
  await test('bounded hourly receipt scan must retain its reviewed actor/time index',async()=>{
    const rate=manifest.intakeIndexes.find(item=>item.table==='account_deletion_request_receipts'&&!item.unique);assert.ok(rate,'Reviewed rate scan index must exist');
    await db.exec('drop index public.'+ident(rate.name));await rejected('receipt_constraints');
  });
  await test('readiness exposes no private intake data and does not mutate receipts or revisions',async()=>{
    await db.exec("insert into auth.users(id,email) values('90000000-0000-4000-8000-000000000001','INTAKE_PRIVATE_SENTINEL@example.invalid')");
    await db.query('select submit_account_deletion_request($1,$2,0)',['90000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000002']);
    const capture=async()=>Object.fromEntries(await Promise.all(manifest.intakeTables.map(async table=>[table,(await db.query('select to_jsonb(t) value from public.'+ident(table)+' t')).rows])));
    const before=await capture(), value=await ready();shape(value);assert.equal(value.ready,true);assert.ok(!JSON.stringify(value).includes('90000000-'));assert.ok(!JSON.stringify(value).includes('SENTINEL'));assert.deepEqual(await capture(),before);
  });
  assert.equal(sha(fs.readFileSync(intakePath,'utf8')),report.sourceHashes.intake,'Intake changed during test');
  assert.equal(sha(fs.readFileSync(readinessPath,'utf8')),report.sourceHashes.readiness,'Readiness changed during test');
  assert.equal(sha(fs.readFileSync(readinessPath,'utf8').match(/\$manifest\$([\s\S]*?)\$manifest\$/)[1]),report.sourceHashes.manifest,'Historical manifest changed during test');
  assert.deepEqual(canonicalHashes(),report.canonicalSchemaHashes,'Canonical fixture sources changed during test');
  assert.equal(sha(fs.readFileSync(fileURLToPath(import.meta.url))),report.sourceHashes.runner,'Fault test source changed during test');
} catch(error) { report.fatal={message:String(error.message),code:error.code};console.error('FATAL '+error.message); }
finally {
  await db.close(); globalThis.fetch=previousFetch;
  report.passed=results.filter(item=>item.ok).length;report.failed=results.filter(item=>!item.ok).length;
  report.accepted=!report.fatal && report.failed===0 && report.passed>0;
  if(opts.has('--report')) {const output=path.resolve(opts.get('--report'));fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');}
  console.log(JSON.stringify({accepted:report.accepted,passed:report.passed,failed:report.failed,fatal:report.fatal}));
  if(!report.accepted)process.exitCode=1;
}
