import assert from 'node:assert/strict';import{createTestDb}from'./atomic-test-support.mjs';
process.on('uncaughtException',e=>{console.error({message:e.message,code:e.code,where:e.where,position:e.position});process.exit(1);});
const db=await createTestDb(['20260911001500_atomic_ownership_transfers.sql']);
await db.exec('alter table auth.users add column email text;');
const owner='10000000-0000-4000-8000-000000000001',buyer='10000000-0000-4000-8000-000000000002',other='10000000-0000-4000-8000-000000000003',admin='10000000-0000-4000-8000-000000000004';
await db.query("insert into auth.users(id,email)values($1,'seller@example.test'),($2,'buyer@example.test'),($3,'other@example.test'),($4,'admin@example.test')",[owner,buyer,other,admin]);
await db.query("insert into public.profiles(id,display_name,plan,role,created_at)values($1,'Seller','business','shop','2020-01-01'),($2,'Buyer','enterprise','builder','2021-01-01'),($3,'Other','single','owner','2022-01-01'),($4,'Admin','single','admin','2023-01-01')",[owner,buyer,other,admin]);
await db.query("insert into public.site_content(content_key,content_value)values($1,'{\"accountType\":\"shop\"}')",['public_collection_owner:'+owner]);
let n=0,passed=0;const hash='a'.repeat(64),order='b'.repeat(64);
const tables=['profiles','guitars','ownership_transfers','guitar_timeline_events','guitar_serial_aliases','admin_audit_events'];
async function snapshot(){const result={};for(const table of tables)result[table]=(await db.query(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) rows from public.${table} t`)).rows[0].rows;return result;}
async function fixture(){n++;return(await db.query("insert into public.guitars(owner_id,qr_code,permanent_path,name,brand,visibility)values($1,$2,$3,'Test guitar','Fender','private') returning *",[owner,'TRANS'+n,'/i/TRANS'+n])).rows[0];}
async function prepare(g,{actor=owner,email='buyer@example.test',code=null,reference=null,env=false}={}){return(await db.query('select public.prepare_ownership_transfer($1,$2,$3,$4,$5,$6,7,$7,$8) result',[actor,g.qr_code,email,'Buyer',code,reference,env,'Changed name'])).rows[0].result;}
async function complete(t,{actor=buyer,code=null,reference=null,env=false,byCode=false}={}){return(await db.query('select public.complete_ownership_transfer($1,$2,$3,$4,$5,$6) result',[byCode?null:t.id,actor,code,reference,env,'Changed name'])).rows[0].result;}
async function manage(t,{actor=owner,action='cancel',env=false}={}){return(await db.query('select public.manage_ownership_transfer($1,$2,$3,$4,$5,$6) result',[t.id,actor,action,'Test cancellation',env,'Changed name'])).rows[0].result;}
async function test(name,fn){await db.exec('begin');try{await fn();console.log('PASS '+name);passed++;}finally{await db.exec('rollback');}}
async function rejects(fn,code){await db.exec('savepoint expected_failure');try{await assert.rejects(fn,e=>e.code===code);}finally{await db.exec('rollback to savepoint expected_failure');}}
await test('RPCs are service-only and the old two-argument bypass is revoked',async()=>{
 for(const signature of ['prepare_ownership_transfer(uuid,text,text,text,text,text,integer,boolean,text)','complete_ownership_transfer(uuid,uuid,text,text,boolean,text)','manage_ownership_transfer(uuid,uuid,text,text,boolean,text)']){
  const rows=(await db.query("select r,has_function_privilege(r,$1,'EXECUTE') allowed from unnest(array['anon','authenticated','service_role'])r",['public.'+signature])).rows;
  assert.deepEqual(rows.map(x=>x.allowed),[false,false,true]);
 }
 assert.equal((await db.query("select has_function_privilege('service_role','public.complete_ownership_transfer(uuid,uuid)','EXECUTE') allowed")).rows[0].allowed,false);
});
await test('prepare serializes one email handoff, replays its recipient, and rejects changed recipients',async()=>{
 const g=await fixture(),a=await prepare(g),b=await prepare(g);assert.equal(a.transfer.id,b.transfer.id);assert.equal(b.replayed,true);assert.equal(a.transfer.fee_cents,0);
 await rejects(()=>prepare(g,{email:'other@example.test'}),'QT002');
 assert.equal((await db.query('select count(*)::int count from public.ownership_transfers where guitar_id=$1',[g.id])).rows[0].count,1);
});
await test('former owner cannot prepare a handoff after an accepted transfer',async()=>{
 const g=await fixture(),{transfer:t}=await prepare(g);await complete(t);
 await rejects(()=>prepare(g),'42501');const current=await prepare(g,{actor:buyer,email:'other@example.test'});assert.equal(current.transfer.from_owner_id,buyer);
});
await test('legacy duplicate pending rows are preserved and block prepare and acceptance',async()=>{
 const g=await fixture(),{transfer:t}=await prepare(g);await db.query("insert into public.ownership_transfers(guitar_id,from_owner_id,to_email,status)values($1,$2,'buyer@example.test','sent')",[g.id,owner]);
 const before=await snapshot();await rejects(()=>prepare(g),'QT004');await rejects(()=>complete(t),'QT004');assert.deepEqual(await snapshot(),before);
 await manage(t);const pending=(await db.query("select * from public.ownership_transfers where guitar_id=$1 and status='sent'",[g.id])).rows[0];assert.equal((await complete(pending)).ok,true);
});
await test('buyer code eligibility matches shop, builder, and legacy brand settings',async()=>{
 for(const type of ['shop','builder','brand']){const g=await fixture();await db.query('update public.site_content set content_value=$1::jsonb where content_key=$2',[JSON.stringify({accountType:type}),'public_collection_owner:'+owner]);const a=await prepare(g,{code:String(n%10).repeat(64)});assert.equal(a.transfer.fee_cents,0);}
 await db.query("update public.site_content set content_value='{\"accountType\":\"player\"}' where content_key=$1",['public_collection_owner:'+owner]);await rejects(async()=>prepare(await fixture(),{code:hash}),'42501');
});
await test('ordinary owner role cannot override ownership or recipient checks',async()=>{
 const g=await fixture();await rejects(()=>prepare(g,{actor:other}),'42501');const{transfer:t}=await prepare(g);await rejects(()=>complete(t,{actor:other}),'42501');assert.equal((await complete(t,{actor:admin})).transfer.accepted_by,admin);
});
await test('recipient plan, role, display name, and creation time remain unchanged',async()=>{
 const g=await fixture(),{transfer:t}=await prepare(g),before=(await db.query('select to_jsonb(p) row from profiles p where id=$1',[buyer])).rows[0].row;
 await complete(t);assert.deepEqual((await db.query('select to_jsonb(p) row from profiles p where id=$1',[buyer])).rows[0].row,before);
});
await test('a missing recipient profile is created once with valid defaults in the same transaction',async()=>{
 await db.query('delete from public.profiles where id=$1',[buyer]);const g=await fixture(),{transfer:t}=await prepare(g);await complete(t);
 const p=(await db.query('select role,plan from profiles where id=$1',[buyer])).rows[0];assert.deepEqual(p,{role:'owner',plan:'single'});
});
await test('email acceptance rechecks current auth email and active account',async()=>{
 const g=await fixture(),{transfer:t}=await prepare(g);await db.query("update auth.users set email='changed@example.test' where id=$1",[buyer]);await rejects(()=>complete(t),'42501');
 await db.query("update auth.users set email='buyer@example.test' where id=$1",[buyer]);for(const status of ['locked','banned','removed']){await db.query('update profiles set account_status=$1 where id=$2',[status,buyer]);await rejects(()=>complete(t),'42501');}
});
await test('empty legacy email recipients cannot be claimed by an unrelated no-email account',async()=>{
 const g=await fixture(),{transfer:t}=await prepare(g);await db.query("update ownership_transfers set to_email='' where id=$1",[t.id]);await db.query("update auth.users set email='' where id=$1",[other]);await rejects(()=>complete(t,{actor:other}),'42501');
});
await test('private code, assigned recipient, order reference, and expiry are enforced under SQL locks',async()=>{
 const g=await fixture(),{transfer:t}=await prepare(g,{code:hash,reference:order});const before=await snapshot();
 await rejects(()=>complete(t),'42501');await rejects(()=>complete(t,{code:hash,reference:'c'.repeat(64)}),'42501');await rejects(()=>complete(t,{actor:other,code:hash,reference:order}),'42501');assert.deepEqual(await snapshot(),before);
 await db.query("update ownership_transfers set expires_at=clock_timestamp()-interval '1 second' where id=$1",[t.id]);await rejects(()=>complete(t,{code:hash,reference:order}),'QT003');
});
await test('lost completion response replays for the same buyer after expiry without a second event',async()=>{
 const g=await fixture(),{transfer:t}=await prepare(g,{code:hash,reference:order}),first=await complete(t,{code:hash,reference:order,byCode:true});
 await db.query("update ownership_transfers set expires_at=clock_timestamp()-interval '1 second' where id=$1",[t.id]);const before=await snapshot(),replay=await complete(t,{code:hash,reference:order,byCode:true});
 assert.equal(replay.replayed,true);assert.equal(replay.transfer.accepted_at,first.transfer.accepted_at);assert.equal(replay.guitar.permanent_path,g.permanent_path);assert.deepEqual(await snapshot(),before);
 await rejects(()=>complete(t,{actor:other,code:hash,reference:order,byCode:true}),'QT002');
});
await test('accepted replay never takes the guitar back after a later transfer',async()=>{
 const g=await fixture(),{transfer:t}=await prepare(g);await complete(t);const later=await prepare(g,{actor:buyer,email:'other@example.test'});await complete(later.transfer,{actor:other});
 const before=await snapshot();assert.equal((await complete(t)).replayed,true);assert.deepEqual(await snapshot(),before);assert.equal((await db.query('select owner_id from guitars where id=$1',[g.id])).rows[0].owner_id,other);
});
await test('stale owner, archive, and removed-record changes block acceptance without changing history',async()=>{
 for(const field of ['owner_id','owner_removed_at','admin_archived_at']){const g=await fixture(),{transfer:t}=await prepare(g);await db.query(`update guitars set ${field}=$1 where id=$2`,[field==='owner_id'?other:new Date().toISOString(),g.id]);const before=await snapshot();await rejects(()=>complete(t),'QT002');assert.deepEqual(await snapshot(),before);}
});
for(const table of ['profiles','guitars','ownership_transfers','guitar_timeline_events'])await test(table+' failure rolls back ownership, receipt state, profile creation, and timeline',async()=>{
 const g=await fixture(),{transfer:t}=await prepare(g);await db.query('delete from public.profiles where id=$1',[buyer]);const before=await snapshot();
 await db.exec(`create function public.qa_transfer_fail()returns trigger language plpgsql as $$begin raise exception using errcode='ZT001',message='injected';end$$;create trigger qa_transfer_fail before ${table==='profiles'||table==='guitar_timeline_events'?'insert':'update'} on public.${table} for each row execute function public.qa_transfer_fail();`);
 await rejects(()=>complete(t),'ZT001');assert.deepEqual(await snapshot(),before);
 await db.exec(`drop trigger qa_transfer_fail on public.${table};drop function public.qa_transfer_fail();`);assert.equal((await complete(t)).transfer.status,'accepted');
});
await test('cancel is replayable and invalidates code redemption without erasing its history',async()=>{
 const g=await fixture(),{transfer:t}=await prepare(g,{code:hash});assert.equal((await manage(t)).transfer.status,'cancelled');const before=await snapshot();assert.equal((await manage(t)).replayed,true);assert.deepEqual(await snapshot(),before);await rejects(()=>complete(t,{code:hash}),'QT002');
});
await test('former owner cannot resend or cancel a stale handoff; current owner can revoke it',async()=>{
 const g=await fixture(),{transfer:t}=await prepare(g,{code:hash});await db.query('update guitars set owner_id=$1 where id=$2',[other,g.id]);
 await rejects(()=>manage(t,{action:'resend'}),'42501');await rejects(()=>manage(t),'42501');await rejects(()=>manage(t,{actor:other,action:'resend'}),'QT002');assert.equal((await manage(t,{actor:other})).transfer.status,'cancelled');
});
await test('admin cancellation and audit write commit together or both roll back',async()=>{
 const g=await fixture(),{transfer:t}=await prepare(g),before=await snapshot();
 await db.exec("create function public.qa_audit_fail() returns trigger language plpgsql as $$begin raise exception using errcode='ZT001',message='injected';end$$;create trigger qa_audit_fail before insert on public.admin_audit_events for each row execute function public.qa_audit_fail();");
 await rejects(()=>manage(t,{actor:admin}),'ZT001');assert.deepEqual(await snapshot(),before);await db.exec('drop trigger qa_audit_fail on public.admin_audit_events;drop function public.qa_audit_fail();');
 await manage(t,{actor:admin});await manage(t,{actor:admin});assert.equal((await db.query("select count(*)::int count from admin_audit_events where target_id=$1",[t.id])).rows[0].count,1);
});
console.log('Completed '+passed+' transactional ownership tests.');await db.close();

