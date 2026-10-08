import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';
import {installRepositorySchema} from './security/postgres-fixture.mjs';
const root=path.resolve(import.meta.dirname,'../../..'),db=new PGlite();
const owner=randomUUID(),claimant=randomUUID(),admin=randomUUID(),other=randomUUID();let passed=0;
const q=(sql,args=[])=>db.query(sql,args),one=async(sql,args=[])=>Object.values((await q(sql,args)).rows[0])[0];
async function test(name,run){await db.exec('begin');try{await run();passed++;console.log('PASS '+name);}finally{await db.exec('rollback');}}
async function rejects(run){await db.exec('savepoint refused');try{await assert.rejects(run);}finally{await db.exec('rollback to savepoint refused');}}
async function fixture({complete=true,recipient=claimant,oldOwner=owner,status='awaiting_owner'}={}){const g=randomUUID(),id=randomUUID();
 await q("insert into guitars(id,owner_id,qr_code,permanent_path,name,brand,visibility) values($1,$2,$3,$4,'Synthetic','Synthetic','private')",[g,oldOwner,'QRG-'+g.toUpperCase(),'/i/QRG-'+g.toUpperCase()]);
 await q("insert into ownership_claims(id,guitar_id,current_owner_id,claimant_user_id,claim_type,status,expires_at,completion_expected_evidence) values($1,$2,$3,$4,'store_purchase',$5,now()+interval '1 day',1)",[id,g,oldOwner,recipient,status]);
 if(complete){await q("insert into ownership_claim_evidence(claim_id,uploaded_by,evidence_type,file_name,storage_path) values($1,$2,'invoice','synthetic.pdf','synthetic/file.pdf')",[id,recipient]);await q('select complete_ownership_claim_submission($1,$2)',[id,recipient]);}
 return{id,g,recipient,oldOwner};
}
const family=status=>({'approved':'claim.approved','denied':'claim.declined','expired':'claim.expired'})[status];
async function transition(x,status){if(status==='approved')await q('select approve_ownership_claim($1,$2,null,false)',[x.id,x.oldOwner]);else if(status==='denied')await q('select deny_ownership_claim_current($1,$2,null,false)',[x.id,x.oldOwner]);else await q("update ownership_claims set status=$2,decided_by=$3,decided_at=now(),admin_review_note='Reviewed' where id=$1",[x.id,status,admin]);}
const intent=(x,status)=>one('select id from action_email_intents where claim_id=$1 and event_type=$2',[x.id,family(status)]);
async function dispatch(x,status){const id=await intent(x,status),lease=randomUUID(),claimed=await one('select claim_action_email($1)',[lease]);assert.equal(claimed.id,id);return one('select begin_action_email($1,$2)',[id,lease]);}
try{
 await installRepositorySchema(db,root);
 for(const file of ['service-email-outbox.sql','action-required-email.sql','claim-completion-recovery.sql','action-email-operations.sql'])await db.exec(fs.readFileSync(path.join(root,'supabase/proposals',file),'utf8'));
 const extension=fs.readFileSync(path.join(root,'supabase/proposals/claim-outcome-email.sql'),'utf8');
 const manifestBefore=await one('select jsonb_object_agg(signature,definition_hash) from action_email_function_manifest');
 const definitionsBefore=await one('select jsonb_object_agg(signature,pg_get_functiondef(signature::regprocedure)) from action_email_function_manifest');
 for(const drift of ['capture','binding','grant','function','missing_control','missing_operations']){
  await db.exec('begin');try{
   if(drift==='capture')await db.exec('update action_email_control set capture_enabled=true');
   if(drift==='binding')await db.exec("update action_email_operations set project_url='https://abcdefghijklmnopqrst.supabase.co'");
   if(drift==='grant')await db.exec('grant execute on function action_email_status() to anon');
   if(drift==='function')await db.exec("create or replace function action_email_status() returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$select '{}'::jsonb$$");
   if(drift==='missing_control')await db.exec('delete from action_email_control');
   if(drift==='missing_operations')await db.exec('delete from action_email_operations');
   await assert.rejects(()=>db.exec(extension),/reviewed disabled unbound predecessor/);passed++;console.log('PASS extension refuses predecessor '+drift+' drift');
  }finally{await db.exec('rollback');}
  assert.deepEqual(await one('select jsonb_object_agg(signature,definition_hash) from action_email_function_manifest'),manifestBefore);
  assert.deepEqual(await one('select jsonb_object_agg(signature,pg_get_functiondef(signature::regprocedure)) from action_email_function_manifest'),definitionsBefore);
 }
 await db.exec(extension);
 const manifestAfter=await one('select jsonb_object_agg(signature,definition_hash) from action_email_function_manifest');
 assert.deepEqual(Object.keys(manifestAfter).filter(key=>manifestAfter[key]!==manifestBefore[key]).sort(),[
  'public.action_email_readiness(text,text)','public.action_email_retry_eligible(uuid)','public.begin_action_email(uuid,uuid)','public.capture_claim_action_email()'
 ].sort());
 for(const [id,name,role] of [[owner,'owner','owner'],[claimant,'claimant','owner'],[admin,'admin','admin'],[other,'other','owner']]){await q('insert into auth.users(id,email) values($1,$2)',[id,name+'@example.invalid']);await q('insert into profiles(id,display_name,role,plan) values($1,$2,$3,\'single\')',[id,name,role]);}
 await test('extension updates version and exact manifest while retaining disabled gates',async()=>{const r=await one('select action_email_readiness(null,null)');assert.equal(r.version,'2026-09-27.action-email.2');assert.equal(r.schemaReady,true);assert.equal(r.ready,false);assert.equal(r.dispatchEnabled,false);assert.equal(await one('select count(*)::int from action_email_intents'),0);const x=await fixture();await transition(x,'approved');assert.equal(await one('select count(*)::int from action_email_intents'),0);});
 await db.exec('update action_email_control set capture_enabled=true,dispatch_enabled=true');
 for(const moreInfo of [false,true])await test('existing '+(moreInfo?'more-info':'owner-review')+' recipient contract remains unchanged',async()=>{const x=await fixture();if(moreInfo)await q("update ownership_claims set status='awaiting_claimant',admin_review_note='Evidence requested' where id=$1",[x.id]);const token=randomUUID(),i=await one('select claim_action_email($1)',[token]),d=await one('select begin_action_email($1,$2)',[i.id,token]);assert.equal(d.event,moreInfo?'claim.moreInfo':'claim.ownerReview');assert.equal(d.to,moreInfo?'claimant@example.invalid':'owner@example.invalid');assert.equal(d.qrCode,null);});
 await test('existing service revision still addresses provider with original Profile path',async()=>{const x=await fixture({complete:false}),id=randomUUID();await q("insert into service_submissions(id,guitar_id,owner_user_id,provider_user_id,status,title,expires_at) values($1,$2,$3,$4,'submitted','Setup',now()+interval '1 day')",[id,x.g,owner,other]);await q("update service_submissions set status='changes_requested',owner_review_note='Adjust setup' where id=$1",[id]);const token=randomUUID(),i=await one('select claim_action_email($1)',[token]),d=await one('select begin_action_email($1,$2)',[i.id,token]);assert.equal(d.event,'service.revisionRequested');assert.equal(d.to,'other@example.invalid');assert.equal(d.qrCode,'QRG-'+x.g.toUpperCase());});
 await test('prior unknown owner-review survives outcome capture without automatic replay',async()=>{const x=await fixture(),token=randomUUID(),i=await one('select claim_action_email($1)',[token]);await one('select begin_action_email($1,$2)',[i.id,token]);await one("select settle_action_email($1,$2,'unknown',null,60)",[i.id,token]);await transition(x,'approved');assert.equal(await one('select state from action_email_intents where id=$1',[i.id]),'unknown');assert.equal((await dispatch(x,'approved')).event,'claim.approved');});
 for(const status of ['approved','denied','expired'])await test('actual '+status+' transition queues claimant-only safe DTO once',async()=>{
  const x=await fixture();await transition(x,status);assert.equal(await one('select count(*)::int from action_email_intents where claim_id=$1 and event_type=$2',[x.id,family(status)]),1);
  const d=await dispatch(x,status);assert.equal(d.event,family(status));assert.equal(d.to,'claimant@example.invalid');assert.equal(d.subjectId,x.id);
  assert.equal(d.qrCode,status==='approved'?'QRG-'+x.g.toUpperCase():null);
  assert.deepEqual(Object.keys(d).sort(),['event','profileTitle','qrCode','subjectId','to']);
  assert.equal(await one('select owner_id from guitars where id=$1',[x.g]),status==='approved'?claimant:owner);
  await q('update ownership_claims set updated_at=now(),admin_review_note=\'Closed note\' where id=$1',[x.id]);
  assert.equal(await one('select count(*)::int from action_email_intents where claim_id=$1 and event_type=$2',[x.id,family(status)]),1);
 });
 for(const status of ['approved','denied','expired'])await test('rollback of '+status+' decision does not expose outcome',async()=>{const x=await fixture();await db.exec('savepoint decision');await transition(x,status);await db.exec('rollback to savepoint decision');assert.equal(await one("select count(*)::int from action_email_intents where claim_id=$1 and event_type in('claim.approved','claim.declined','claim.expired')",[x.id]),0);assert.equal(await one('select status from ownership_claims where id=$1',[x.id]),'awaiting_owner');});
 for(const status of ['approved','denied','expired','cancelled'])await test('historical closed '+status+' insert and unrelated edit never backfill',async()=>{const x=await fixture({complete:false,status});await q("update ownership_claims set updated_at=now(),admin_review_note='Historical edit' where id=$1",[x.id]);assert.equal(await one('select count(*)::int from action_email_intents where claim_id=$1',[x.id]),0);});
 await test('claimant cancellation and elapsed expiry never synthesize expired mail',async()=>{const x=await fixture();await q("update ownership_claims set expires_at=now()-interval '1 second' where id=$1",[x.id]);assert.equal(await one("select count(*)::int from action_email_intents where event_type='claim.expired'"),0);await transition(x,'cancelled');assert.equal(await one("select count(*)::int from action_email_intents where event_type in('claim.approved','claim.declined','claim.expired')"),0);assert.equal(await one('select claim_action_email($1)',[randomUUID()]),null);});
 for(const status of ['denied','expired'])await test('saved incomplete claim can receive explicit '+status+' outcome without completing evidence',async()=>{const x=await fixture({complete:false});await transition(x,status);assert.equal((await dispatch(x,status)).event,family(status));assert.equal(await one('select action_email_completed from ownership_claims where id=$1',[x.id]),false);});
 await test('approval and denial original reviewer replay do not create second outcome',async()=>{for(const status of ['approved','denied']){const x=await fixture();await transition(x,status);await transition(x,status);assert.equal(await one('select count(*)::int from action_email_intents where claim_id=$1 and event_type=$2',[x.id,family(status)]),1);}});
 for(const status of ['approved','denied','expired'])await test(status+' outcome remains meaningful after original expiry time',async()=>{const x=await fixture();await transition(x,status);await q("update ownership_claims set expires_at=now()-interval '1 second' where id=$1",[x.id]);assert.equal((await dispatch(x,status)).event,family(status));});
 await test('later ownership transfer suppresses approved Profile CTA',async()=>{const x=await fixture();await transition(x,'approved');await q('update guitars set owner_id=$1 where id=$2',[other,x.g]);assert.equal(await dispatch(x,'approved'),null);});
 for(const status of ['denied','expired'])await test(status+' historical outcome is not redirected when Profile owner changes',async()=>{const x=await fixture();await transition(x,status);await q('update guitars set owner_id=$1 where id=$2',[other,x.g]);assert.equal((await dispatch(x,status)).to,'claimant@example.invalid');});
 for(const status of ['approved','denied','expired'])for(const change of ['locked','deleting','removed','missing_email'])await test(status+' suppresses '+change+' claimant/destination',async()=>{const x=await fixture();await transition(x,status);if(change==='locked')await q("update profiles set account_status='locked' where id=$1",[claimant]);if(change==='deleting')await q("insert into account_deletion_requests(actor_id,status) values($1,'requested')",[claimant]);if(change==='removed')await q('update guitars set owner_removed_at=now() where id=$1',[x.g]);if(change==='missing_email')await q('update auth.users set email=null where id=$1',[claimant]);assert.equal(await dispatch(x,status),null);});
 await test('current verified claimant email replaces old address without using typed recipient',async()=>{const x=await fixture();await transition(x,'approved');await q("update auth.users set email='changed@example.invalid' where id=$1",[claimant]);assert.equal((await dispatch(x,'approved')).to,'changed@example.invalid');});
 await test('prior owner account restrictions do not create or block claimant outcomes',async()=>{const x=await fixture();await transition(x,'approved');await q("update profiles set account_status='locked' where id=$1",[owner]);assert.equal((await dispatch(x,'approved')).to,'claimant@example.invalid');});
 await test('operator retry rechecks approved owner and never replays unknown automatically',async()=>{const x=await fixture();await transition(x,'approved');const token=randomUUID(),i=await one('select claim_action_email($1)',[token]);await one('select begin_action_email($1,$2)',[i.id,token]);await one("select settle_action_email($1,$2,'unknown',null,60)",[i.id,token]);assert.equal(await one('select claim_action_email($1)',[randomUUID()]),null);await q('update guitars set owner_id=$1 where id=$2',[other,x.g]);const status=await one('select action_email_intent_status($1)',[i.id]);const reviewed=await one("select reconcile_action_email($1,$2,false,'confirmed_not_accepted','Provider evidence reviewed.',null,$3)",[i.id,admin,status.updatedAt]);assert.equal(reviewed.state,'suppressed');});
 await test('outcome families cannot attach to service submissions or bypass client RPC grants',async()=>{const x=await fixture(),service=randomUUID();await q("insert into service_submissions(id,guitar_id,owner_user_id,provider_user_id,status,title,expires_at) values($1,$2,$3,$4,'submitted','Setup',now()+interval '1 day')",[service,x.g,owner,other]);await rejects(()=>q("insert into action_email_intents(submission_id,event_type,source_version) values($1,'claim.approved',999)",[service]));await rejects(()=>q("insert into action_email_intents(claim_id,event_type,source_version) values($1,'claim.cancelled',999)",[x.id]));for(const role of ['anon','authenticated'])assert.equal(await one("select has_function_privilege($1,'begin_action_email(uuid,uuid)','EXECUTE')",[role]),false);});
 const source=fs.readFileSync(path.join(root,'apps/web/scripts/account-deletion/test-account-deletion-fulfillment.mjs'),'utf8'),ast=ts.createSourceFile('privacy.mjs',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 const names=['seed','request','prepare','attestReviews','expireStorageQuiescence','prepareReady'];const body=names.map(name=>ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name).getText(ast)).join('\n');
 const actor='10000000-0000-4000-8000-000000000001',recipient='20000000-0000-4000-8000-000000000002',operator='30000000-0000-4000-8000-000000000003';
 const helpers=new Function('db','assert','randomUUID','ACTOR','OTHER','ADMIN',body+';return {seed,request,prepareReady};')(db,assert,randomUUID,actor,recipient,operator);
 for(const status of ['approved','denied','expired'])await test('actual closed '+status+' privacy fulfillment preserves history and suppresses outcome',async()=>{
  await helpers.seed();await db.exec("select set_config('request.jwt.claim.role','service_role',true)");const x=await fixture({recipient:actor,oldOwner:recipient});await transition(x,status);
  const id=await intent(x,status),request=(await helpers.request()).request.requestId;assert.equal(await dispatch(x,status),null);
  const ready=await helpers.prepareReady(request);assert.equal(ready.fulfillment.state,'ready_for_auth_deletion',JSON.stringify(ready.fulfillment.blockers));
  assert.equal(await one('select claimant_user_id from ownership_claims where id=$1',[x.id]),null);assert.equal(await one('select action_email_retry_eligible($1)',[id]),false);
  assert.equal(await one("select count(*)::int from action_email_intents where claim_id=$1 and state in('queued','leased','retry')",[x.id]),0);
 });
 console.log(JSON.stringify({passed,scope:'full repository + five disabled proposals, actual approval/deny/privacy RPCs; no HTTP or provider'}));
}finally{await db.close();}
