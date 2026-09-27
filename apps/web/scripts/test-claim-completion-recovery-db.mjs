import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { installRepositorySchema } from './security/postgres-fixture.mjs';
const root=path.resolve(import.meta.dirname,'../../..'), db=new PGlite();
const owner=randomUUID(),claimant=randomUUID(),other=randomUUID(); let passed=0;
const q=(sql,args=[])=>db.query(sql,args),one=async(sql,args=[])=>Object.values((await q(sql,args)).rows[0])[0];
async function test(name,run){await db.exec('begin');try{await run();passed++;console.log('PASS '+name);}finally{await db.exec('rollback');}}
async function rejects(run,pattern){await db.exec('savepoint refused');try{await assert.rejects(run,pattern);}finally{await db.exec('rollback to savepoint refused');}}
async function fixture(expected=1,files=expected??1){const g=randomUUID(),id=randomUUID();
 await q("insert into guitars(id,owner_id,qr_code,permanent_path,name,brand,visibility) values($1,$2,$3,$4,'Synthetic','Synthetic','private')",[g,owner,'QRG-'+g.toUpperCase(),'/i/QRG-'+g.toUpperCase()]);
 await q("insert into ownership_claims(id,guitar_id,current_owner_id,claimant_user_id,claim_type,status,expires_at,completion_expected_evidence) values($1,$2,$3,$4,'store_purchase','awaiting_owner',now()+interval '1 day',$5)",[id,g,owner,claimant,expected]);
 for(let i=0;i<files;i++)await q("insert into ownership_claim_evidence(claim_id,uploaded_by,evidence_type,file_name,storage_path) values($1,$2,'invoice','fixture.pdf',$3)",[id,claimant,`claims/${id}/${claimant}/${i}.pdf`]);
 return{id,g};
}
const complete=(x,actor=claimant)=>one('select complete_ownership_claim_submission($1,$2)',[x.id,actor]);
try{
 await installRepositorySchema(db,root);
 for(const name of ['service-email-outbox.sql','action-required-email.sql','claim-completion-recovery.sql'])await db.exec(fs.readFileSync(path.join(root,'supabase/proposals',name),'utf8'));
 for(const id of [owner,claimant,other]){await q('insert into auth.users(id,email) values($1,$2)',[id,id+'@example.invalid']);await q("insert into profiles(id,display_name,role,plan) values($1,'Synthetic','owner','single')",[id]);}
 await test('disabled queue stays disabled while explicit recovery completes existing request',async()=>{const x=await fixture();assert.equal((await complete(x)).submission_complete,true);assert.equal(await one('select count(*)::int from action_email_intents'),0);assert.equal(await one('select count(*)::int from ownership_claims'),1);});
 await db.exec('update action_email_control set capture_enabled=true');
 await test('saved evidence completes once and repeated request cannot duplicate event or intent',async()=>{const x=await fixture(2);assert.equal((await complete(x)).replayed,false);assert.equal((await complete(x)).replayed,true);assert.equal(await one('select count(*)::int from ownership_claim_events where claim_id=$1',[x.id]),1);assert.equal(await one('select count(*)::int from action_email_intents'),1);assert.equal(await one('select count(*)::int from ownership_claim_evidence where claim_id=$1',[x.id]),2);assert.equal(await one('select owner_id from guitars where id=$1',[x.g]),owner);});
 await test('completion rollback preserves evidence but no marker event or intent',async()=>{const x=await fixture();await db.exec('savepoint receipt');await complete(x);await db.exec('rollback to savepoint receipt');assert.equal(await one('select action_email_completed from ownership_claims where id=$1',[x.id]),false);assert.equal(await one('select count(*)::int from action_email_intents'),0);assert.equal(await one('select count(*)::int from ownership_claim_evidence where claim_id=$1',[x.id]),1);await complete(x);});
 for(const [expected,files] of [[2,1],[1,2],[null,1]])await test('unknown or mismatched original evidence '+expected+'/'+files+' cannot recover',async()=>{const x=await fixture(expected,files);await rejects(()=>complete(x),/scope is unknown|evidence is incomplete/);assert.equal(await one('select count(*)::int from action_email_intents'),0);});
 for(const actor of [owner,other,null])await test('nonclaimant cannot complete '+actor,async()=>{const x=await fixture();await rejects(()=>complete(x,actor),/Claimant required/);});
 for(const change of ['owner','archived','removed','expired','closed','locked','deleting'])await test('recovery rechecks '+change,async()=>{const x=await fixture();
  if(change==='owner')await q('update guitars set owner_id=$1 where id=$2',[other,x.g]);
  if(change==='archived'||change==='removed')await q(`update guitars set ${change==='archived'?'admin_archived_at':'owner_removed_at'}=now() where id=$1`,[x.g]);
  if(change==='expired')await q("update ownership_claims set expires_at=now()-interval '1 second' where id=$1",[x.id]);
  if(change==='closed')await q("update ownership_claims set status='cancelled' where id=$1",[x.id]);
  if(change==='locked')await q("update profiles set account_status='locked' where id=$1",[claimant]);
  if(change==='deleting')await q("insert into account_deletion_requests(actor_id,status) values($1,'requested')",[claimant]);
  await rejects(()=>complete(x),/changed|unavailable/);assert.equal(await one('select count(*)::int from action_email_intents'),0);
 });
 await test('original count immutable and actual approval RPC cannot approve incomplete request',async()=>{const x=await fixture();await rejects(()=>q('update ownership_claims set completion_expected_evidence=2 where id=$1',[x.id]),/cannot be changed/);await rejects(()=>one('select approve_ownership_claim($1,$2,$3,false)',[x.id,owner,'Reviewed synthetic evidence']),/incomplete/);assert.equal(await one('select owner_id from guitars where id=$1',[x.g]),owner);await complete(x);await one('select approve_ownership_claim($1,$2,$3,false)',[x.id,owner,'Reviewed synthetic evidence']);assert.equal(await one('select owner_id from guitars where id=$1',[x.g]),claimant);assert.equal((await complete(x)).replayed,true);assert.equal(await one('select count(*)::int from action_email_intents'),1);});
 await test('unknown legacy requests not backfilled and unauthenticated roles cannot invoke recovery',async()=>{await fixture(null);for(const role of ['anon','authenticated'])assert.equal(await one("select has_function_privilege($1,'complete_ownership_claim_submission(uuid,uuid)','EXECUTE')",[role]),false);assert.equal(await one('select count(*)::int from action_email_intents'),0);});
 for(const recovered of [false,true])await test('cleanup cannot erase full evidence or completed request '+recovered,async()=>{
 const x=await fixture();if(recovered)await complete(x);
 const receipt=await one('select discard_incomplete_claim_submission($1,$2)',[x.id,claimant]);assert.equal(receipt.deleted,false);
 assert.equal(await one('select count(*)::int from ownership_claims where id=$1',[x.id]),1);assert.equal(await one('select count(*)::int from ownership_claim_evidence where claim_id=$1',[x.id]),1);
 assert.equal(await one('select count(*)::int from action_email_intents'),recovered?1:0);
 });
 await test('confirmed incomplete cleanup deletes only its own partial request and evidence',async()=>{
 const x=await fixture(2,1);await rejects(()=>one('select discard_incomplete_claim_submission($1,$2)',[x.id,other]),/Claimant required/);
 assert.equal((await one('select discard_incomplete_claim_submission($1,$2)',[x.id,claimant])).deleted,true);
 assert.equal(await one('select count(*)::int from ownership_claims where id=$1',[x.id]),0);assert.equal(await one('select count(*)::int from ownership_claim_evidence where claim_id=$1',[x.id]),0);
 assert.equal((await one('select discard_incomplete_claim_submission($1,$2)',[x.id,claimant])).deleted,false);
 for(const role of ['anon','authenticated'])assert.equal(await one("select has_function_privilege($1,'discard_incomplete_claim_submission(uuid,uuid)','EXECUTE')",[role]),false);
 });
 console.log(JSON.stringify({passed,scope:'full schema + three proposals in disposable PGlite; no Auth, Storage or sender'}));
}finally{await db.close();}
