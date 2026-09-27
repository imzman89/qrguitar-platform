import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { installRepositorySchema } from './security/postgres-fixture.mjs';

if(process.argv[2]!=='--execute')console.log('Manual only: dedicated empty qrg-action-email-pg-20260926 on 127.0.0.1:55553; never shared/production.');
else{
 const container=JSON.parse(execFileSync('docker',['inspect','qrg-action-email-pg-20260926'],{encoding:'utf8'}))[0];
 assert.equal(container.Config.Labels['qrg.scope'],'action-email-acceptance');
 assert.deepEqual(container.HostConfig.PortBindings['5432/tcp'],[{HostIp:'127.0.0.1',HostPort:'55553'}]);
 assert.equal(container.Mounts.some(m=>m.Type==='bind'),false);
 const root=path.resolve(import.meta.dirname,'../../..'),opts={host:'127.0.0.1',port:55553,database:'postgres',user:'postgres',connectionTimeoutMillis:5000,statement_timeout:15000};
 const a=new pg.Client(opts),b=new pg.Client(opts),c=new pg.Client(opts);
 const owner=randomUUID(),claimant=randomUUID(),other=randomUUID();let passed=0;
 const one=async(client,sql,args=[])=>Object.values((await client.query(sql,args)).rows[0])[0];
 async function waitBlocked(pid){const deadline=Date.now()+3000;while(Date.now()<deadline){if(await one(c,"select wait_event_type='Lock' from pg_stat_activity where pid=$1",[pid]))return;await new Promise(r=>setTimeout(r,10));}throw Error('Expected real PostgreSQL lock wait');}
 const outcome=p=>p.then(value=>({value}),error=>({error}));
 async function test(name,run){await a.query('truncate action_email_intents,ownership_claims,service_submissions cascade');await run();passed++;console.log('PASS '+name);}
 async function fixture(){const g=randomUUID(),id=randomUUID(),otherClaim=randomUUID();await a.query("insert into guitars(id,owner_id,qr_code,permanent_path,name,brand,visibility) values($1,$2,$3,$4,'Synthetic','Synthetic','private')",[g,owner,'QRG-'+g.toUpperCase(),'/i/QRG-'+g.toUpperCase()]);await a.query("insert into ownership_claims(id,guitar_id,current_owner_id,claimant_user_id,claim_type,status,expires_at) values($1,$2,$3,$4,'store_purchase','awaiting_owner',now()+interval '1 day'),($5,$2,$3,$6,'store_purchase','awaiting_owner',now()+interval '1 day')",[id,g,owner,claimant,otherClaim,other]);await a.query("insert into ownership_claim_evidence(claim_id,uploaded_by,evidence_type,file_name,storage_path) values($1,$2,'invoice','fixture.pdf','synthetic/fixture.pdf')",[id,claimant]);return{g,id,otherClaim};}
 const complete=(x,client=a)=>client.query("insert into ownership_claim_events(claim_id,actor_user_id,action,metadata) values($1,$2,'submitted','{\"evidence_count\":1}')",[x.id,claimant]);
 const deny=(x,client=a)=>client.query('select deny_ownership_claim_current($1,$2,$3,false)',[x.id,owner,'Reviewed synthetic evidence']);
 const transfer=(x,client=a)=>client.query('select approve_ownership_claim($1,$2,$3,false)',[x.otherClaim,owner,'Reviewed synthetic handoff']);
 const moreInfo=x=>a.query("update ownership_claims set status='awaiting_claimant',admin_review_note='Private synthetic request' where id=$1",[x.id]);
 const resubmit=(x,client=a)=>client.query("update ownership_claims set status='awaiting_owner',admin_review_note=null where id=$1",[x.id]);
 try{
  await a.connect();await b.connect();await c.connect();
  assert.equal(await one(a,"select count(*)::int from pg_tables where schemaname='public'"),0,'Refusing nonempty DB');
  assert.equal(await one(a,"select current_setting('cron.launch_active_jobs')"),'off','Cron execution must be disabled before schema installation');
  await a.query('create extension pgcrypto');
  await installRepositorySchema({exec:sql=>a.query(sql)},root);
  for(const file of ['service-email-outbox.sql','action-required-email.sql'])await a.query(fs.readFileSync(path.join(root,'supabase/proposals',file),'utf8'));
  await a.query('update cron.job set active=false');
  for(const [id,name] of [[owner,'owner'],[claimant,'claimant'],[other,'other']]){await a.query('insert into auth.users(id,email) values($1,$2)',[id,`${name}@example.invalid`]);await a.query("insert into profiles(id,display_name,role,plan) values($1,$2,'owner','single')",[id,name]);}
  await a.query('update action_email_control set capture_enabled=true,dispatch_enabled=true');
  const bpid=await one(b,'select pg_backend_pid()');
  await test('uncommitted completion is invisible and rollback leaves no mail',async()=>{const x=await fixture();await a.query('begin');await complete(x);assert.equal(await one(b,'select claim_action_email($1)',[randomUUID()]),null);await a.query('rollback');assert.equal(await one(c,'select count(*)::int from action_email_intents'),0);});
  await test('real ownership approval wins before denial; stale denial rejected',async()=>{const x=await fixture();await complete(x);await a.query('begin');await transfer(x);const pending=outcome(deny(x,b));await waitBlocked(bpid);await a.query('commit');const result=await pending;assert.equal(result.error?.code,'QC002');assert.equal(await one(c,'select status from ownership_claims where id=$1',[x.id]),'awaiting_owner');assert.equal(await one(c,'select owner_id from guitars where id=$1',[x.g]),other);});
  await test('denial wins lock first; later transfer cannot change its original decision',async()=>{const x=await fixture();await complete(x);await a.query('begin');await deny(x);const pending=outcome(transfer(x,b));await waitBlocked(bpid);await a.query('commit');assert.equal((await pending).error,undefined);assert.equal(await one(c,'select status from ownership_claims where id=$1',[x.id]),'denied');assert.equal(await one(c,"select count(*)::int from ownership_claim_events where claim_id=$1 and action='deny'",[x.id]),1);await deny(x);assert.equal(await one(c,"select count(*)::int from ownership_claim_events where claim_id=$1 and action='deny'",[x.id]),1);});
  await test('transfer fences overlapping resubmission; retry rejects stale owner',async()=>{const x=await fixture();await complete(x);await moreInfo(x);await a.query('begin');await transfer(x);assert.equal((await outcome(resubmit(x,b))).error?.code,'PD423');await a.query('commit');assert.equal((await outcome(resubmit(x,b))).error?.code,'40001');assert.equal(await one(c,'select status from ownership_claims where id=$1',[x.id]),'awaiting_claimant');assert.equal(await one(c,"select count(*)::int from action_email_intents where claim_id=$1 and event_type='claim.ownerReview' and state='queued'",[x.id]),0);});
  await test('resubmission commits before transfer; worker suppresses stale-recipient intent',async()=>{const x=await fixture();await complete(x);await moreInfo(x);await a.query('begin');await resubmit(x);const pending=outcome(transfer(x,b));await waitBlocked(bpid);await a.query('commit');assert.equal((await pending).error,undefined);const lease=randomUUID(),i=await one(c,'select claim_action_email($1)',[lease]);assert.ok(i.id);assert.equal(await one(c,'select begin_action_email($1,$2)',[i.id,lease]),null);assert.equal(await one(c,'select state from action_email_intents where id=$1',[i.id]),'suppressed');});
  await test('two concurrent identical information requests capture one new event',async()=>{const x=await fixture();await complete(x);await a.query('begin');await moreInfo(x);const pending=outcome(b.query("update ownership_claims set status='awaiting_claimant',admin_review_note='Private synthetic request' where id=$1",[x.id]));await waitBlocked(bpid);await a.query('commit');assert.equal((await pending).error,undefined);assert.equal(await one(c,"select count(*)::int from action_email_intents where claim_id=$1 and event_type='claim.moreInfo'",[x.id]),1);});
  await test('concurrent workers claim once and crash-after-dispatch stays unknown',async()=>{const x=await fixture();await complete(x);const lease=randomUUID();await a.query('begin');const i=await one(a,'select claim_action_email($1)',[lease]);assert.equal(await one(b,'select claim_action_email($1)',[randomUUID()]),null);await a.query('commit');assert.equal((await one(c,'select begin_action_email($1,$2)',[i.id,lease])).to,'owner@example.invalid');await a.query("update action_email_intents set locked_until=now()-interval '1 second' where id=$1",[i.id]);assert.equal(await one(b,'select claim_action_email($1)',[randomUUID()]),null);assert.equal(await one(c,'select claim_action_email($1)',[randomUUID()]),null);assert.equal(await one(a,'select state from action_email_intents where id=$1',[i.id]),'unknown');});
  assert.equal(await one(a,'select count(*)::int from cron.job where active'),0);
  assert.equal(await one(a,'select count(*)::int from net.http_request_queue'),0);
  console.log(JSON.stringify({passed,scope:'native PostgreSQL17, full repository schema + both proposals, three real connections, actual ownership approval vs deny/resubmit; no sender/HTTP/cron'}));
 }finally{await a.end();await b.end();await c.end();}
}
