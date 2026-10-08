import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';
import {installRepositorySchema} from './security/postgres-fixture.mjs';
const root=path.resolve(import.meta.dirname,'../../..'),db=new PGlite();
const url='https://abcdefghijklmnopqrst.supabase.co',sha='a'.repeat(40);
const actor='10000000-0000-4000-8000-000000000001',other='20000000-0000-4000-8000-000000000002',admin='30000000-0000-4000-8000-000000000003';
const q=(sql,args=[])=>db.query(sql,args),one=async(sql,args=[])=>Object.values((await q(sql,args)).rows[0])[0];let passed=0;
async function test(name,run){await db.exec('begin');try{await run();passed++;console.log('PASS '+name);}finally{await db.exec('rollback');}}
async function rejects(run){await db.exec('savepoint refused');try{await assert.rejects(run);}finally{await db.exec('rollback to savepoint refused');}}
const readiness=()=>one('select action_email_readiness($1,$2)',[url,sha]);
async function bind(){await q('update action_email_operations set project_url=$1,approved_commit=$2',[url,sha]);await db.exec('update action_email_control set capture_enabled=true,dispatch_enabled=true');}
const source=fs.readFileSync(path.join(root,'apps/web/scripts/account-deletion/test-account-deletion-fulfillment.mjs'),'utf8');
const ast=ts.createSourceFile('privacy.mjs',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const names=['seed','request','prepare','attestReviews','expireStorageQuiescence','prepareReady'];
const body=names.map(name=>ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name).getText(ast)).join('\n');
const helpers=new Function('db','assert','randomUUID','ACTOR','OTHER','ADMIN',body+';return {seed,request,prepareReady,prepare};')(db,assert,randomUUID,actor,other,admin);
try{
 await installRepositorySchema(db,root);
 for(const file of ['service-email-outbox.sql','action-required-email.sql','claim-completion-recovery.sql','action-email-operations.sql'])await db.exec(fs.readFileSync(path.join(root,'supabase/proposals',file),'utf8'));
 await test('operations install unbound with capture and dispatch off',async()=>{const r=await readiness();assert.equal(r.version,'2026-09-27.action-email.1');assert.equal(r.schemaReady,true);assert.equal(r.ready,false);assert.equal(r.destinationBound,false);assert.equal(r.dispatchEnabled,false);await q('select queue_action_email_sweep()');});
 await test('readiness requires exact bound release and project plus dispatch controls',async()=>{await bind();assert.equal((await readiness()).ready,true);assert.equal((await one('select action_email_readiness($1,$2)',[url,'b'.repeat(40)])).ready,false);assert.equal((await one('select action_email_readiness($1,$2)',['https://otherprojectabcdefgh.supabase.co',sha])).ready,false);await db.exec('update action_email_control set dispatch_enabled=false');assert.equal((await readiness()).ready,false);});
 for(const tamper of ['grant','trigger','function','manifest','rls'])await test('readiness fails closed on '+tamper+' drift',async()=>{await bind();
  if(tamper==='grant')await db.exec('grant execute on function public.begin_action_email(uuid,uuid) to authenticated');
  if(tamper==='trigger')await db.exec('alter table ownership_claims disable trigger claim_completion_intent_guard');
  if(tamper==='function')await db.exec("create or replace function public.action_email_status() returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$select '{}'::jsonb$$");
  if(tamper==='manifest')await db.exec("delete from action_email_function_manifest where signature='public.action_email_status()'");
  if(tamper==='rls')await db.exec('alter table action_email_operations disable row level security');
  assert.equal((await readiness()).schemaReady,false);assert.equal((await readiness()).ready,false);
 });
 await test('heartbeat records bounded health without exposing destinations or secrets',async()=>{await q('select action_email_worker_heartbeat(true)');await q('select action_email_worker_heartbeat(false)');const r=await readiness();assert.ok(r.lastSuccessAt);assert.ok(r.lastFailureAt);for(const key of ['projectUrl','secret','approvedCommit'])assert.equal(key in r,false);await rejects(()=>q('select action_email_worker_heartbeat(null)'));});
 await test('clients cannot configure or invoke readiness and scheduling',async()=>{for(const role of ['anon','authenticated']){for(const table of ['action_email_operations','action_email_function_manifest'])assert.equal(await one("select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE')",[role,table]),false);for(const fn of ['action_email_readiness(text,text)','action_email_worker_heartbeat(boolean)','queue_action_email_sweep()'])assert.equal(await one("select has_function_privilege($1,$2,'EXECUTE')",[role,fn]),false);}assert.equal(await one("select has_function_privilege('service_role','queue_action_email_sweep()','EXECUTE')"),false);});
 for(const family of ['claim.ownerReview','claim.moreInfo'])for(const target of ['claimant','owner'])await test('actual privacy lifecycle for '+family+' deleting '+target,async()=>{
  await helpers.seed();await db.exec("select set_config('request.jwt.claim.role','service_role',true)");await bind();
  const owner=target==='owner'?actor:other,claimant=target==='claimant'?actor:other,guitar=randomUUID(),claim=randomUUID();
  await q("insert into guitars(id,owner_id,qr_code,permanent_path,name,brand,visibility) values($1,$2,$3,$4,'Synthetic','Synthetic','private')",[guitar,owner,'QRG-'+guitar.toUpperCase(),'/i/QRG-'+guitar.toUpperCase()]);
  await q("insert into ownership_claims(id,guitar_id,current_owner_id,claimant_user_id,claim_type,status,expires_at,completion_expected_evidence) values($1,$2,$3,$4,'store_purchase','awaiting_owner',now()+interval '1 day',1)",[claim,guitar,owner,claimant]);
  await q("insert into ownership_claim_evidence(claim_id,uploaded_by,evidence_type,file_name,storage_path) values($1,$2,'invoice','fixture.pdf','synthetic/fixture.pdf')",[claim,claimant]);
  await q('select complete_ownership_claim_submission($1,$2)',[claim,claimant]);
  if(family==='claim.moreInfo')await q("update ownership_claims set status='awaiting_claimant',admin_review_note='Private request' where id=$1",[claim]);
  const intent=(await q("select id from action_email_intents where claim_id=$1 and event_type=$2",[claim,family])).rows[0];assert.ok(intent);
  let requestId=(await helpers.request()).request.requestId;
  const token=randomUUID(),leased=await one('select claim_action_email($1)',[token]);assert.equal(leased.id,intent.id);
  assert.equal(await one('select begin_action_email($1,$2)',[intent.id,token]),null);
  assert.equal(await one('select state from action_email_intents where id=$1',[intent.id]),'suppressed');
  const revision=await one('select revision::text from account_deletion_actor_revisions where actor_id=$1',[actor]);
  const cancelled=await one('select cancel_account_deletion_request($1,$2,$3,$4)',[actor,requestId,randomUUID(),revision]);
  assert.equal(cancelled.request.status,'cancelled');
  assert.equal(await one('select claim_action_email($1)',[randomUUID()]),null,'Cancellation must not revive suppressed mail');
  requestId=(await helpers.request()).request.requestId;
  const pending=await helpers.prepareReady(requestId);
  assert.equal(pending.fulfillment.state,'blocked');
  assert.ok(pending.fulfillment.blockers.includes('active_ownership_claim'));
  await q("update ownership_claims set status='cancelled' where id=$1",[claim]);
  const closed=await helpers.prepareReady(requestId);
  assert.equal(closed.fulfillment.state,'ready_for_auth_deletion',JSON.stringify({state:closed.fulfillment.state,blockers:closed.fulfillment.blockers}));
  assert.equal(await one("select count(*)::int from action_email_intents where claim_id=$1 and state in('queued','retry','leased')",[claim]),0);
  assert.equal(await one('select action_email_retry_eligible($1)',[intent.id]),false);
  assert.equal(await one('select claimant_user_id=$2 or current_owner_id=$2 from ownership_claims where id=$1',[claim,actor]),null);
 });
 console.log(JSON.stringify({passed,scope:'actual full repository schema; operations readiness + real privacy RPCs; isolated PGlite only'}));
}finally{await db.close();}
