import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite-pg17';
import ts from 'typescript';
import { installRepositorySchema } from './security/postgres-fixture.mjs';
const root=path.resolve(import.meta.dirname,'../../..'),db=new PGlite();
const owner=randomUUID(),claimant=randomUUID(),provider=randomUUID(),other=randomUUID();
let passed=0;
const q=(sql,args=[])=>db.query(sql,args),one=async(sql,args=[])=>Object.values((await q(sql,args)).rows[0])[0];
async function test(name,run){await db.exec('begin');try{await run();passed++;console.log('PASS '+name);}finally{await db.exec('rollback');}}
async function rejects(run,pattern){await db.exec('savepoint rejected');try{await assert.rejects(run,pattern);}finally{await db.exec('rollback to savepoint rejected');}}
async function instrument(){const id=randomUUID();await q("insert into guitars(id,owner_id,qr_code,permanent_path,name,brand,visibility) values($1,$2,$3,$4,'Synthetic Profile','Synthetic','private')",[id,owner,'QRG-'+id,'/i/QRG-'+id]);return id;}
async function claim({complete=true,status='awaiting_owner'}={}){const guitar=await instrument(),id=randomUUID();await q("insert into ownership_claims(id,guitar_id,current_owner_id,claimant_user_id,claim_type,status,expires_at) values($1,$2,$3,$4,'store_purchase',$5,now()+interval '1 day')",[id,guitar,owner,claimant,status]);if(complete)await finishClaim(id);return{id,guitar};}
async function evidence(id){await q("insert into ownership_claim_evidence(claim_id,uploaded_by,evidence_type,file_name,storage_path) values($1,$2,'invoice','fixture.pdf',$3)",[id,claimant,`claims/${id}/${claimant}/fixture.pdf`]);}
const completed=id=>q("insert into ownership_claim_events(claim_id,actor_user_id,action,metadata) values($1,$2,'submitted','{\"evidence_count\":1}')",[id,claimant]);
async function finishClaim(id){await evidence(id);await completed(id);}
async function service(){const guitar=await instrument(),id=randomUUID();await q("insert into service_submissions(id,guitar_id,owner_user_id,provider_user_id,status,title,expires_at) values($1,$2,$3,$4,'submitted','Setup',now()+interval '1 day')",[id,guitar,owner,provider]);return{id,guitar};}
const requestRevision=id=>q("update service_submissions set status='changes_requested',owner_review_note='Private request' where id=$1",[id]);
const lease=()=>one('select claim_action_email($1)',[randomUUID()]);
const begin=i=>one('select begin_action_email($1,$2)',[i.id,i.leaseToken]);
const settle=(i,state,receipt=null)=>one('select settle_action_email($1,$2,$3,$4,60)',[i.id,i.leaseToken,state,receipt]);
const state=i=>one('select state from action_email_intents where id=$1',[i.id]);
const operatorStatus=i=>one('select action_email_intent_status($1)',[i.id]);
const promote=()=>q("update profiles set role='admin' where id=$1",[other]);
async function review(i,resolution,{actor=other,envAdmin=false,reason='Provider log reviewed; no personal data recorded.',receipt=null,version}={}){
 const expected=version??(await operatorStatus(i)).updatedAt;
 return one('select reconcile_action_email($1,$2,$3,$4,$5,$6,$7)',[i.id,actor,envAdmin,resolution,reason,receipt,expected]);
}
try{
 await installRepositorySchema(db,root);
 await db.exec(fs.readFileSync(path.join(root,'supabase/proposals/service-email-outbox.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.join(root,'supabase/proposals/action-required-email.sql'),'utf8'));
 for(const [id,name] of [[owner,'owner'],[claimant,'claimant'],[provider,'provider'],[other,'other']]){
   await q('insert into auth.users(id,email) values($1,$2)',[id,`${name}@example.invalid`]);
   await q("insert into profiles(id,display_name,role,plan) values($1,$2,'owner','single')",[id,name]);
 }
 await test('install stays disabled and captures no existing/current claim or revision',async()=>{await claim();const s=await service();await requestRevision(s.id);assert.equal(await one('select count(*)::int from action_email_intents'),0);assert.equal(await lease(),null);});
 await db.exec('update action_email_control set capture_enabled=true,dispatch_enabled=true');
 await test('initial claim insert does not queue before evidence or completion',async()=>{const c=await claim({complete:false});assert.equal(await lease(),null);await evidence(c.id);assert.equal(await lease(),null);await completed(c.id);assert.equal(await one('select count(*)::int from action_email_intents'),1);});
 await test('incomplete evidence completion rejected with no durable marker or intent',async()=>{const c=await claim({complete:false});await rejects(()=>completed(c.id),/incomplete/);assert.equal(await one('select action_email_completed from ownership_claims where id=$1',[c.id]),false);assert.equal(await lease(),null);});
 await test('completion transaction rollback removes marker and captured intent',async()=>{const c=await claim({complete:false});await evidence(c.id);await db.exec('savepoint completion');await completed(c.id);await db.exec('rollback to savepoint completion');assert.equal(await lease(),null);assert.equal(await one('select action_email_completed from ownership_claims where id=$1',[c.id]),false);});
 await test('duplicate completion and no-op state edit cannot duplicate ownerReview',async()=>{const c=await claim();await completed(c.id);await q("update ownership_claims set status='awaiting_owner' where id=$1",[c.id]);assert.equal(await one('select count(*)::int from action_email_intents'),1);});
 await test('ownerReview dispatch uses authoritative owner not claimant and strips private fields',async()=>{await claim();const i=await lease(),d=await begin(i);assert.equal(d.to,'owner@example.invalid');assert.equal(d.event,'claim.ownerReview');assert.deepEqual(Object.keys(d).sort(),['event','profileTitle','qrCode','subjectId','to']);await settle(i,'accepted','fixture-receipt');assert.equal(await lease(),null);});
 await test('moreInfo new note is a new event; identical replay is not',async()=>{const c=await claim();await q("update ownership_claims set status='awaiting_claimant',admin_review_note='Private note one' where id=$1",[c.id]);await q("update ownership_claims set status='awaiting_claimant',admin_review_note='Private note one' where id=$1",[c.id]);assert.equal(await one('select count(*)::int from action_email_intents'),2);await q("update ownership_claims set admin_review_note='Private note two' where id=$1",[c.id]);assert.equal(await one('select count(*)::int from action_email_intents'),3);const d=await begin(await lease());assert.equal(d.event,'claim.moreInfo');assert.equal(d.to,'claimant@example.invalid');assert.doesNotMatch(JSON.stringify(d),/Private note/);});
 await test('resubmit supersedes moreInfo and queues only ownerReview',async()=>{const c=await claim();await q("update ownership_claims set status='awaiting_claimant',admin_review_note='More evidence' where id=$1",[c.id]);await evidence(c.id);await q("update ownership_claims set status='awaiting_owner',admin_review_note=null where id=$1",[c.id]);const d=await begin(await lease());assert.equal(d.event,'claim.ownerReview');assert.equal(await lease(),null);});
 await test('claim deletion on upload failure cascades all intents',async()=>{const c=await claim();await q('delete from ownership_claims where id=$1',[c.id]);assert.equal(await lease(),null);assert.equal(await one('select count(*)::int from action_email_intents'),0);});
 for(const change of ['expired','closed','owner','archived','removed','locked','deleting','claimant']) await test('claim revalidates '+change+' before send',async()=>{
   const c=await claim(),i=await lease();
   if(change==='expired')await q("update ownership_claims set expires_at=now()-interval '1 second' where id=$1",[c.id]);
   if(change==='closed')await q("update ownership_claims set status='cancelled' where id=$1",[c.id]);
   if(change==='claimant')await q('update ownership_claims set claimant_user_id=null where id=$1',[c.id]);
   if(change==='owner')await q('update guitars set owner_id=$1 where id=$2',[other,c.guitar]);
   if(change==='archived'||change==='removed')await q(`update guitars set ${change==='archived'?'admin_archived_at':'owner_removed_at'}=now() where id=$1`,[c.guitar]);
   if(change==='locked')await q("update profiles set account_status='locked' where id=$1",[owner]);
   if(change==='deleting')await q("insert into account_deletion_requests(actor_id,status) values($1,'requested')",[owner]);
   if(await state(i)==='suppressed')await rejects(()=>begin(i),/Lease is not current/);else assert.equal(await begin(i),null);
   assert.equal(await state(i),'suppressed');
 });
 await test('service revision request targets provider without provider_revision bump',async()=>{const s=await service();const before=await one('select provider_revision from service_submissions where id=$1',[s.id]);await requestRevision(s.id);await requestRevision(s.id);assert.equal(await one('select provider_revision from service_submissions where id=$1',[s.id]),before);assert.equal(await one('select count(*)::int from action_email_intents'),1);const d=await begin(await lease());assert.equal(d.event,'service.revisionRequested');assert.equal(d.to,'provider@example.invalid');assert.ok(d.qrCode.startsWith('QRG-'));});
 await test('resubmitted service produces only existing submitted email, no action-family duplicate',async()=>{await db.exec('update service_email_outbox_control set enabled=true');const s=await service();await requestRevision(s.id);await q("update service_submissions set status='submitted',provider_revision=provider_revision+1 where id=$1",[s.id]);assert.equal(await one("select count(*)::int from action_email_intents where state='queued'"),0);assert.equal(await one('select count(*)::int from service_email_intents where submission_id=$1',[s.id]),2);});
 for(const change of ['expired','closed','owner','provider','locked'])await test('service revision revalidates '+change,async()=>{const s=await service();await requestRevision(s.id);const i=await lease();if(change==='expired')await q("update service_submissions set expires_at=now()-interval '1 second' where id=$1",[s.id]);if(change==='closed')await q("update service_submissions set status='cancelled' where id=$1",[s.id]);if(change==='owner')await q('update guitars set owner_id=$1 where id=$2',[other,s.guitar]);if(change==='provider')await q('update service_submissions set provider_user_id=$1 where id=$2',[other,s.id]);if(change==='locked')await q("update profiles set account_status='banned' where id=$1",[provider]);if(await state(i)==='suppressed')await rejects(()=>begin(i),/Lease is not current/);else assert.equal(await begin(i),null);assert.equal(await state(i),'suppressed');});
 await test('dispatch pause keeps durable capture but makes no claims',async()=>{await db.exec('update action_email_control set dispatch_enabled=false');await claim();assert.equal(await one('select count(*)::int from action_email_intents'),1);assert.equal(await lease(),null);});
 await test('foreign lease and invalid accepted receipt rejected',async()=>{await claim();const i=await lease();await rejects(()=>one('select begin_action_email($1,$2)',[i.id,randomUUID()]),/Lease/);await begin(i);await rejects(()=>settle(i,'accepted'),/Invalid outcome/);await settle(i,'unknown');assert.equal(await lease(),null);});
 await test('lost post-dispatch receipt quarantined unknown, never auto-replayed',async()=>{await claim();const i=await lease();await begin(i);await q("update action_email_intents set locked_until=now()-interval '1 second' where id=$1",[i.id]);assert.equal(await lease(),null);assert.equal(await state(i),'unknown');await rejects(()=>settle(i,'accepted','late'),/no longer current/);});
 await test('pre-dispatch lease expiry retries without consuming transport attempt',async()=>{await claim();const i=await lease();await q("update action_email_intents set locked_until=now()-interval '1 second' where id=$1",[i.id]);const next=await lease();assert.equal(next.id,i.id);assert.equal(await one('select attempt_count from action_email_intents where id=$1',[i.id]),0);});
 await test('definite transient rejection bounded at six attempts',async()=>{await claim();let i;for(let n=0;n<6;n++){i=await lease();await begin(i);await settle(i,'retry');await q('update action_email_intents set next_attempt_at=now() where id=$1',[i.id]);}assert.equal(await state(i),'failed');assert.equal(await lease(),null);});
 await test('unknown historical event survives later source transition',async()=>{const c=await claim();const i=await lease();await begin(i);await settle(i,'unknown');await q("update ownership_claims set status='awaiting_claimant',admin_review_note='New evidence' where id=$1",[c.id]);assert.equal(await state(i),'unknown');assert.equal((await one('select action_email_status()')).unknown,1);});
 await test('clients cannot read queue, fake completion or execute worker',async()=>{for(const role of ['anon','authenticated']){assert.equal(await one("select has_table_privilege($1,'action_email_intents','SELECT,INSERT,UPDATE,DELETE')",[role]),false);for(const fn of ['claim_action_email(uuid)','begin_action_email(uuid,uuid)','settle_action_email(uuid,uuid,text,text,integer)','complete_claim_action_email()'])assert.equal(await one('select has_function_privilege($1,$2,\'EXECUTE\')',[role,fn]),false);}assert.equal(await one("select count(*)::int from pg_constraint where conrelid='action_email_intents'::regclass and confrelid='auth.users'::regclass"),0);});
 await test('locked current-owner denial is atomic and idempotent without changing ownership',async()=>{const c=await claim();const result=await one('select deny_ownership_claim_current($1,$2,$3,false)',[c.id,owner,'Reviewed evidence']);assert.equal(result.ok,true);assert.equal(await one('select owner_id from guitars where id=$1',[c.guitar]),owner);assert.equal(await one("select count(*)::int from ownership_claim_events where claim_id=$1 and action='deny'",[c.id]),1);assert.equal((await one('select deny_ownership_claim_current($1,$2,$3,false)',[c.id,owner,'Reviewed evidence'])).replayed,true);});
 await test('atomic denial rejects changed owner, stranger and expired request',async()=>{const c=await claim();await rejects(()=>one('select deny_ownership_claim_current($1,$2,null,false)',[c.id,other]),/Current owner/);await q('update guitars set owner_id=$1 where id=$2',[other,c.guitar]);await rejects(()=>one('select deny_ownership_claim_current($1,$2,null,false)',[c.id,owner]),/ownership changed/);await q('update guitars set owner_id=$1 where id=$2',[owner,c.guitar]);await q("update ownership_claims set expires_at=now()-interval '1 second' where id=$1",[c.id]);await rejects(()=>one('select deny_ownership_claim_current($1,$2,null,false)',[c.id,owner]),/ownership changed/);assert.equal(await one('select status from ownership_claims where id=$1',[c.id]),'awaiting_owner');});
 await test('committed resubmission refuses stale owner at DB boundary',async()=>{const c=await claim();await q("update ownership_claims set status='awaiting_claimant',admin_review_note='Evidence required' where id=$1",[c.id]);await q('update guitars set owner_id=$1 where id=$2',[other,c.guitar]);await rejects(()=>q("update ownership_claims set status='awaiting_owner' where id=$1",[c.id]),/authority changed/);assert.equal(await one('select status from ownership_claims where id=$1',[c.id]),'awaiting_claimant');});
 await test('operator status is bounded and contains no private source or recipient fields',async()=>{
  await claim();const i=await lease();await begin(i);await settle(i,'unknown');
  const page=await one('select action_email_admin_status(0)');assert.equal(page.unknown,1);assert.equal(page.total,1);assert.equal(page.limit,50);
  assert.equal(page.items[0].canReconcile,true);assert.equal(page.items[0].canRetry,false);
  for(const field of ['to','email','profileTitle','providerMessageId','note','actorId','evidence'])assert.equal(field in page.items[0],false);
  await rejects(()=>one('select action_email_admin_status(-1)'),/Invalid delivery page/);
  await rejects(()=>one('select action_email_admin_status(1000001)'),/Invalid delivery page/);
  await rejects(()=>one('select action_email_admin_status(null)'),/Invalid delivery page/);
  assert.equal((await one('select action_email_admin_status(50)')).items.length,0);
 });
 await test('operator pagination caps an actual fifty-one item queue',async()=>{
  for(let n=0;n<51;n++)await claim();
  const first=await one('select action_email_admin_status(0)'),second=await one('select action_email_admin_status(50)');
  assert.equal(first.total,51);assert.equal(first.items.length,50);assert.equal(second.items.length,1);
  assert.equal(first.items.some(i=>i.id===second.items[0].id),false);
 });
 await test('nonadmin, inactive admin and pending-deletion admin cannot reconcile',async()=>{
  await claim();const i=await lease();await begin(i);await settle(i,'unknown');
  await rejects(()=>review(i,'confirmed_not_accepted'),/Active administrator/);await promote();
  await q("update profiles set account_status='banned' where id=$1",[other]);await rejects(()=>review(i,'confirmed_not_accepted'),/Active administrator/);
  await q("update profiles set account_status='active' where id=$1",[other]);
  await q("insert into account_deletion_requests(actor_id,status) values($1,'requested')",[other]);
  await rejects(()=>review(i,'confirmed_not_accepted'),/Active administrator/);assert.equal(await state(i),'unknown');
 });
 await test('verified environment admin can record acceptance with exact provider receipt',async()=>{
  await claim();const i=await lease();await begin(i);await settle(i,'unknown');
  const result=await review(i,'confirmed_accepted',{envAdmin:true,receipt:'synthetic-provider-receipt'});
  assert.equal(result.state,'accepted');assert.equal(await one('select provider_message_id from action_email_intents where id=$1',[i.id]),'synthetic-provider-receipt');
  assert.equal(await one("select count(*)::int from admin_audit_events where target_id=$1 and action='action_email.reviewed'",[i.id]),1);
 });
 await test('operator review requires bounded evidence and receipt, with no automatic unknown retry',async()=>{
  await promote();await claim();const i=await lease();await begin(i);await settle(i,'unknown');
  for(const args of [{reason:'short'},{reason:'x'.repeat(1001)},{reason:'Evidence\nwith newline'},{receipt:'unexpected'}])await rejects(()=>review(i,'confirmed_not_accepted',args),/valid provider evidence/);
  for(const receipt of [null,' ','x'.repeat(301),'bad\r\nreceipt'])await rejects(()=>review(i,'confirmed_accepted',{receipt}),/valid provider evidence/);
  await rejects(()=>review(i,'retry'),/cannot be reviewed/);assert.equal(await state(i),'unknown');assert.equal(await lease(),null);
 });
 await test('operator stale submission and duplicate review do not replay or double-audit',async()=>{
  await promote();await claim();const i=await lease();await begin(i);await settle(i,'unknown');const version=(await operatorStatus(i)).updatedAt;
  await rejects(()=>review(i,'confirmed_not_accepted',{version:'2000-01-01T00:00:00Z'}),/Delivery changed/);
  assert.equal((await review(i,'confirmed_not_accepted',{version})).state,'retry');
  await rejects(()=>review(i,'confirmed_not_accepted',{version}),/Delivery changed/);
  assert.equal(await one("select count(*)::int from admin_audit_events where target_id=$1 and action='action_email.reviewed'",[i.id]),1);
 });
 await test('operator retry of definite failure honors remaining budget without sending',async()=>{
  await promote();await claim();const i=await lease();await begin(i);await settle(i,'failed');
  assert.equal((await operatorStatus(i)).canRetry,true);assert.equal((await review(i,'retry')).state,'retry');
  assert.equal(await one('select attempt_count from action_email_intents where id=$1',[i.id]),1);
  assert.equal(await one("select count(*)::int from ownership_claim_events where action='email_reviewed'"),0);
 });
 for(const family of ['claim.ownerReview','claim.moreInfo','service.revisionRequested'])await test('operator retry rechecks current recipient for '+family,async()=>{
  await promote();let recipient;
  if(family==='service.revisionRequested'){const s=await service();await requestRevision(s.id);recipient=provider;}
  else{const c=await claim();recipient=owner;if(family==='claim.moreInfo'){await q("update ownership_claims set status='awaiting_claimant',admin_review_note='Additional evidence' where id=$1",[c.id]);recipient=claimant;}}
  const i=await lease();await begin(i);await settle(i,'unknown');await q("update profiles set account_status='locked' where id=$1",[recipient]);
  assert.equal((await review(i,'confirmed_not_accepted')).state,'suppressed');
 });
 for(const changed of ['owner','expired','removed','actor','recipientEmail','deletion','sourceVersion'])await test('operator cannot requeue changed claim '+changed,async()=>{
  await promote();const c=await claim();const i=await lease();await begin(i);await settle(i,'unknown');
  if(changed==='owner')await q('update guitars set owner_id=$1 where id=$2',[provider,c.guitar]);
  if(changed==='expired')await q("update ownership_claims set expires_at=now()-interval '1 second' where id=$1",[c.id]);
  if(changed==='removed')await q('update guitars set owner_removed_at=now() where id=$1',[c.guitar]);
  if(changed==='actor')await q("update profiles set account_status='banned' where id=$1",[claimant]);
  if(changed==='recipientEmail')await q('update auth.users set email=null where id=$1',[owner]);
  if(changed==='deletion')await q("insert into account_deletion_requests(actor_id,status) values($1,'requested')",[owner]);
  if(changed==='sourceVersion')await q("update ownership_claims set status='awaiting_claimant',admin_review_note='Fresh cycle' where id=$1",[c.id]);
  assert.equal((await review(i,'confirmed_not_accepted')).state,'suppressed');
 });
 await test('historical acceptance records evidence without reviving obsolete source',async()=>{
  await promote();const c=await claim();const i=await lease();await begin(i);await settle(i,'unknown');
  await q("update ownership_claims set status='cancelled' where id=$1",[c.id]);assert.equal((await review(i,'confirmed_accepted',{receipt:'historical-receipt'})).state,'accepted');
  assert.equal(await one('select status from ownership_claims where id=$1',[c.id]),'cancelled');assert.equal(await lease(),null);
 });
 await test('confirmed no-acceptance cannot bypass six-attempt budget',async()=>{
  await promote();await claim();const i=await lease();await begin(i);await settle(i,'unknown');await q('update action_email_intents set attempt_count=6 where id=$1',[i.id]);
  assert.equal((await review(i,'confirmed_not_accepted')).state,'failed');assert.equal((await operatorStatus(i)).canRetry,false);
  await rejects(()=>review(i,'retry'),/cannot be reviewed/);assert.equal(await lease(),null);
 });
 await test('review cannot interrupt active dispatch or resend accepted mail',async()=>{
  await promote();await claim();const i=await lease();
  await rejects(()=>review(i,'confirmed_not_accepted'),/cannot be reviewed/);await begin(i);
  await rejects(()=>review(i,'confirmed_accepted',{receipt:'premature'}),/cannot be reviewed/);await settle(i,'accepted','receipt');
  await rejects(()=>review(i,'retry'),/cannot be reviewed/);assert.equal(await lease(),null);
 });
 await test('paused dispatch remains paused after operator queues a retry',async()=>{
  await promote();await claim();const i=await lease();await begin(i);await settle(i,'unknown');await db.exec('update action_email_control set dispatch_enabled=false');
  assert.equal((await review(i,'confirmed_not_accepted')).state,'retry');assert.equal(await lease(),null);
  assert.equal((await one('select action_email_admin_status(0)')).dispatchEnabled,false);
 });
 await test('operator audit failure rolls back state, and clients cannot call operator RPCs',async()=>{
  await promote();await claim();const i=await lease();await begin(i);await settle(i,'unknown');
  await db.exec("create function pg_temp.reject_email_audit() returns trigger language plpgsql as $$begin raise exception 'synthetic audit failure';end$$; create trigger qa_email_audit before insert on admin_audit_events for each row execute function pg_temp.reject_email_audit()");
  await rejects(()=>review(i,'confirmed_not_accepted'),/synthetic audit failure/);assert.equal(await state(i),'unknown');
  for(const role of ['anon','authenticated'])for(const fn of ['action_email_admin_status(integer)','action_email_intent_status(uuid)','reconcile_action_email(uuid,uuid,boolean,text,text,text,timestamptz)'])assert.equal(await one("select has_function_privilege($1,$2,'EXECUTE')",[role,fn]),false);
 });
 await test('actual privacy fulfillment preserves contributed service facts without active email intents',async()=>{
   const source=fs.readFileSync(path.join(root,'apps/web/scripts/account-deletion/test-account-deletion-fulfillment.mjs'),'utf8');
   const ast=ts.createSourceFile('privacy.mjs',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
   const names=['seed','request','prepare','attestReviews','expireStorageQuiescence','prepareReady'];
   const body=names.map(name=>ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name).getText(ast)).join('\n');
   const actor='10000000-0000-4000-8000-000000000001',recipient='20000000-0000-4000-8000-000000000002',admin='30000000-0000-4000-8000-000000000003';
   const helpers=new Function('db','assert','randomUUID','ACTOR','OTHER','ADMIN',body+';return {seed,request,prepareReady};')(db,assert,randomUUID,actor,recipient,admin);
   await helpers.seed();await db.exec("select set_config('request.jwt.claim.role','service_role',true)");
   const guitar=await instrument(),approved=randomUUID(),pending=randomUUID();
   await q('update guitars set owner_id=$1 where id=$2',[recipient,guitar]);
   for(const id of [approved,pending])await q("insert into service_submissions(id,guitar_id,provider_user_id,owner_user_id,status,title,service_date,work_performed,expires_at) values($1,$2,$3,$4,'submitted','Setup',current_date,'Setup complete',now()+interval '1 day')",[id,guitar,actor,recipient]);
   await q('select approve_service_submission($1,$2,null)',[approved,recipient]);await requestRevision(pending);
   assert.equal(await one("select count(*)::int from action_email_intents where submission_id=$1 and state='queued'",[pending]),1);
   const requestId=(await helpers.request()).request.requestId;const blocked=await helpers.prepareReady(requestId);
   assert.equal(blocked.fulfillment.state,'blocked');assert.ok(blocked.fulfillment.blockers.includes('active_service_workflow'));
   const pendingIntent=await lease();assert.equal(await begin(pendingIntent),null);assert.equal(await state(pendingIntent),'suppressed');
   await q("update service_submissions set status='cancelled' where id=$1",[pending]);
   const ready=await helpers.prepareReady(requestId);
   assert.equal(ready.fulfillment.state,'ready_for_auth_deletion');
   assert.equal(await one('select provider_user_id from service_submissions where id=$1',[approved]),null);
   assert.equal(await one("select count(*)::int from action_email_intents where submission_id=$1 and state in('queued','retry','leased')",[pending]),0);
 });
 console.log(JSON.stringify({passed,scope:'actual full repository schema plus both disabled proposals; no HTTP, provider, production or shared DB'}));
}finally{await db.close();}
