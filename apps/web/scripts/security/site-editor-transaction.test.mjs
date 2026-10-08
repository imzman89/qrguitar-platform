import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
const args=process.argv.slice(2); const option=(name)=>args[args.indexOf(name)+1];
const inferredRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const repo=path.resolve(args.includes('--repo')?option('--repo'):process.env.QRGUITAR_TEST_REPO||inferredRoot);
const proposal=path.resolve(args.includes('--proposal')?option('--proposal'):inferredRoot);
const require=createRequire(path.join(repo,'package.json'));
const {PGlite}=require('@electric-sql/pglite-pg17');
const {installRepositorySchema}=await import(pathToFileURL(path.join(repo,'apps/web/scripts/security/postgres-fixture.mjs')));
const db=new PGlite();
const actor='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222';
const baseline={brandName:'QRguitar',content:{'home.title':'Before'},colors:{background:'#000000'}};
const settings=(title)=>({...baseline,content:{'home.title':title}});
const state=async()=> (await db.query('select read_site_editor_state() as state')).rows[0].state;
const snapshot=async()=> (await db.query("select jsonb_build_object('content',(select jsonb_agg(to_jsonb(s) order by content_key) from site_content s),'audit',(select jsonb_agg(to_jsonb(a) order by id) from admin_audit_events a),'receipts',(select jsonb_agg(to_jsonb(r) order by request_id) from site_editor_receipts r)) as snapshot")).rows[0].snapshot;
async function request(action='save_draft', extra={}) { const s=await state(); return {action,expectedActorId:actor,requestId:randomUUID(),expectedPublishedVersion:s.publishedVersion,expectedDraftVersion:s.draftVersion,...extra}; }
async function mutate(body,value=settings('Next'),id=actor,env=false,revision=null) {return (await db.query('select mutate_site_editor($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb) as result',[id,'editor@example.test',env,body,value,baseline,revision])).rows[0].result;}
let passes=0;async function test(name,fn){await fn();passes++;console.log('PASS '+name);}
try {
 await installRepositorySchema(db,repo,'20260911003500');
 const migration=fs.readFileSync(path.join(proposal,'supabase/migrations/20260911003500_atomic_site_editor.sql'),'utf8');
 await db.exec(migration); await db.exec(migration);
 await db.query('insert into auth.users(id) values($1),($2)',[actor,other]);
 await db.query("insert into profiles(id,display_name,role) values($1,'Editor','admin'),($2,'Owner','owner')",[actor,other]);
 await db.query("insert into site_content(content_key,content_value) values('homepage',$1),('unrelated','{\"keep\":true}')",[baseline]);
 await test('only service_role can read or mutate editor state',async()=>{
  for(const role of ['anon','authenticated']) { await db.exec('set role '+role); await assert.rejects(state(),e=>e.code==='42501'); await assert.rejects(mutate({}),e=>e.code==='42501'); }
  await db.exec('reset role;set role service_role');
 });
 await test('helpers remain inaccessible to service_role',async()=>{
  const row=(await db.query("select has_function_privilege('service_role','public.assign_site_editor_version()','EXECUTE') as trigger,has_function_privilege('service_role','public.site_editor_changed_fields(jsonb,jsonb)','EXECUTE') as changes")).rows[0];assert.equal(row.trigger,false);assert.equal(row.changes,false);
 });
 await test('signed-in actor mismatch cannot apply a pending request under a different account',async()=>{
  const body=await request();const before=await snapshot();await assert.rejects(mutate({...body,expectedActorId:other}),e=>e.code==='QSE05');assert.deepEqual(await snapshot(),before);
 });
 await test('non-admin and inactive administrator fail closed; explicit environment authorization retained',async()=>{
  await assert.rejects(mutate(await request(),settings('No'),other),e=>e.code==='QSE05');
  await db.query("update profiles set account_status='locked' where id=$1",[actor]);
  await assert.rejects(mutate(await request()),e=>e.code==='QSE05');
  await mutate(await request(),settings('Allowed environment'),actor,true);
  await db.query("update profiles set account_status='active' where id=$1",[actor]);
 });
 await test('versions required even on initially absent rows',async()=>{await assert.rejects(mutate({action:'publish',requestId:randomUUID()}),e=>e.code==='QSE03');});
 await test('saving a draft updates its opaque version and keeps live settings',async()=>{
  const before=await state(); const result=await mutate(await request(),settings('Draft'));
  assert.equal(result.state.publishedVersion,before.publishedVersion);assert.notEqual(result.state.draftVersion,before.draftVersion);assert.deepEqual(result.state.publishedValue,baseline);assert.deepEqual(result.state.draftValue.settings,settings('Draft'));
 });
 await test('exact request replay adds no writes, audits, or receipts',async()=>{
  const body=await request();const first=await mutate(body,settings('Replay'));const before=await snapshot();
  const replay=await mutate(body,settings('Different normalized fallback ignored on receipt'));
  assert.equal(replay.replayed,true);assert.deepEqual(replay.state,first.state);assert.deepEqual(await snapshot(),before);
  await assert.rejects(mutate({...body,note:'different wire body'}),e=>e.code==='QSE02');
 });
 await test('reading identical draft state is read-only; explicit matched discard preserves published and unrelated data',async()=>{
  const published=(await state()).publishedValue;
  await mutate(await request(),published);
  const before=await snapshot(), observed=await state();
  assert.deepEqual(observed.draftValue.settings,observed.publishedValue);
  assert.deepEqual(await snapshot(),before,'the read creates no writes, audits or receipts');
  const result=await mutate(await request('discard_draft'),null);
  assert.equal(result.state.draftValue,null);assert.equal(result.state.draftVersion,'');
  assert.equal(result.state.publishedVersion,observed.publishedVersion);
  assert.deepEqual(result.state.publishedValue,published);
  assert.deepEqual(result.state.revisionRows,observed.revisionRows);
  const after=await snapshot();
  assert.deepEqual(after.content.filter(row=>row.content_key!=='site-editor:draft'),before.content.filter(row=>row.content_key!=='site-editor:draft'));
  assert.equal(after.audit.length,before.audit.length+1);assert.equal(after.receipts.length,before.receipts.length+1);
 });
 await test('a draft that matched on load cannot discard a concurrent changed draft or publication',async()=>{
  for(const concurrentAction of ['save_draft','publish']) {
   const published=(await state()).publishedValue;
   await mutate(await request(),published);
   const stale=await request();
   const observed=await state();assert.deepEqual(observed.draftValue.settings,observed.publishedValue);
   await mutate(await request(concurrentAction),settings('Another editor changed '+concurrentAction));
   for(const action of ['save_draft','discard_draft','restore_revision','publish']) {
    const before=await snapshot();
    await assert.rejects(mutate({...stale,requestId:randomUUID(),action}),e=>e.code==='QSE01');
    assert.deepEqual(await snapshot(),before,'stale '+action+' cannot change content, audit or receipt state');
   }
  }
 });
 await test('draft created after publish snapshot is retained when publish conflicts',async()=>{
  await mutate(await request('discard_draft'),null);const old=await request('publish');await mutate(await request(),settings('New shared draft'));
  const before=await snapshot();await assert.rejects(mutate(old,settings('Stale publish')),e=>e.code==='QSE01');assert.deepEqual(await snapshot(),before);
 });
 await test('publish atomically writes revision/live/audit/receipt and removes only matched draft',async()=>{
  const before=await state();const result=await mutate(await request('publish'),settings('Published'));
  assert.equal(result.state.draftVersion,'');assert.equal(result.state.draftValue,null);assert.deepEqual(result.state.publishedValue,settings('Published'));
  assert.notEqual(result.state.publishedVersion,before.publishedVersion);assert.deepEqual((await db.query('select content_value from site_content where content_key=$1',[result.state.revisionRows[0].content_key])).rows[0].content_value.settings,before.publishedValue);
  assert.equal(result.state.revisionRows.length,before.revisionRows.length+1);
 });
 await test('two competing publish requests have one CAS winner',async()=>{
  // PGlite serializes one connection: exercises real SQL CAS, not multi-connection lock scheduling.
  const first=await request('publish');const second={...first,requestId:randomUUID()};
  const result=await Promise.allSettled([mutate(first,settings('Winner A')),mutate(second,settings('Winner B'))]);
  assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(result.find(r=>r.status==='rejected').reason.code,'QSE01');
 });
 await test('successful replay after another change reports superseded and cannot mutate current state',async()=>{
  const body=await request();const result=await mutate(body,settings('Receipt version'));await mutate(await request(),settings('Later version'));const before=await snapshot();
  const replay=await mutate(body);assert.equal(replay.superseded,true);assert.deepEqual(replay.state,result.state);assert.deepEqual(await snapshot(),before);
 });
 await test('restoring a revision checks its exact value and creates draft without changing live',async()=>{
  const before=await state(), revision=before.revisionRows[0]; revision.content_value=(await db.query('select content_value from site_content where content_key=$1',[revision.content_key])).rows[0].content_value;
  const body=await request('restore_revision',{revisionId:revision.content_key});
  await assert.rejects(mutate(body,revision.content_value.settings,actor,false,{}),e=>e.code==='QSE01');
  const result=await mutate(body,revision.content_value.settings,actor,false,revision.content_value);
  assert.deepEqual(result.state.draftValue.settings,revision.content_value.settings);assert.equal(result.state.publishedVersion,before.publishedVersion);
 });
 for(const fault of ['revision','live','draft','audit','receipt']) await test(fault+' failure rolls back the complete transaction and permits same-key retry',async()=>{
  const before=await snapshot(), body=await request('publish');
  await db.exec('reset role');
  const table=fault==='audit'?'admin_audit_events':fault==='receipt'?'site_editor_receipts':'site_content';
  const event=fault==='draft'?'delete':fault==='live'?'insert or update':'insert';
  const condition=fault==='revision'?"new.content_key like 'site-editor:revision:%'":fault==='live'?"new.content_key='homepage'":fault==='draft'?"old.content_key='site-editor:draft'":'true';
  await db.exec(`create function editor_test_fault() returns trigger language plpgsql as $$ begin if ${condition} then raise exception 'synthetic failure'; end if; return ${fault==='draft'?'old':'new'}; end $$; create trigger editor_test_fault before ${event} on ${table} for each row execute function editor_test_fault();set role service_role;`);
  await assert.rejects(mutate(body,settings('Fault test')),e=>e.code==='P0001');assert.deepEqual(await snapshot(),before);
  await db.exec(`reset role;drop trigger editor_test_fault on ${table};drop function editor_test_fault();set role service_role;`);
  await mutate(body,settings('Fault test'));await mutate(await request(),settings('Seed next fault draft'));
 });
 await test('direct legacy service write invalidates observed version rather than bypassing CAS',async()=>{
  const body=await request('publish');await db.query("update site_content set content_value=$1 where content_key='homepage'",[settings('Legacy write')]);await assert.rejects(mutate(body),e=>e.code==='QSE01');
 });
 await test('read snapshot is bounded and revisions have stable tie ordering',async()=>{
  for(let i=0;i<35;i++)await db.query("insert into site_content(content_key,content_value,updated_at) values($1,$2,'2040-01-01')",['site-editor:revision:synthetic'+String(i).padStart(2,'0'),{settings:baseline}]);
  const s=await state();assert.equal(s.revisionRows.length,30);assert.equal(s.revisionRows[0].content_value.settings,undefined);assert.equal(s.revisionRows[0].content_key,'site-editor:revision:synthetic34');
 });
 console.log(`\n${passes} actual PostgreSQL tests passed.`);
} finally {await db.close();}


