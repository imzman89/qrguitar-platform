import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {installRepositorySchema} from './security/postgres-fixture.mjs';

if(process.argv[2]!=='--execute')console.log('Manual only: owned empty PostgreSQL fixture, loopback 55553, no shared backend.');
else{
 const name=process.argv[3];assert.match(name,/^qrg-action-email-pg-\d{8}$/);
 const container=JSON.parse(execFileSync('docker',['inspect',name],{encoding:'utf8'}))[0];
 assert.equal(container.Config.Labels['qrg.scope'],'action-email-acceptance');
 assert.deepEqual(container.HostConfig.PortBindings['5432/tcp'],[{HostIp:'127.0.0.1',HostPort:'55553'}]);
 assert.equal(container.Mounts.some(m=>m.Type==='bind'),false);
 const root=path.resolve(import.meta.dirname,'../../..'),opts={host:'127.0.0.1',port:55553,database:'postgres',user:'postgres',connectionTimeoutMillis:5000,statement_timeout:10000};
 const a=new pg.Client(opts),b=new pg.Client(opts),c=new pg.Client(opts);
 const owner=randomUUID(),provider=randomUUID(),admin=randomUUID(),other=randomUUID();let passed=0;
 const one=async(client,sql,args=[])=>Object.values((await client.query(sql,args)).rows[0])[0];
 const outcome=p=>p.then(value=>({value}),error=>({error}));
 async function blocked(pid){const until=Date.now()+2500;while(Date.now()<until){if(await one(c,"select wait_event_type='Lock' from pg_stat_activity where pid=$1",[pid]))return;await new Promise(r=>setTimeout(r,10));}throw Error('Expected PostgreSQL lock wait');}
 async function test(name,run){await a.query('truncate action_email_intents,ownership_transfers,service_submissions cascade');await run();passed++;console.log('PASS '+name);}
 async function guitar(){const g=randomUUID();await a.query("insert into guitars(id,owner_id,qr_code,permanent_path,name,brand,visibility) values($1,$2,$3,$4,'Synthetic','Synthetic','private')",[g,owner,'QRG-'+g.toUpperCase(),'/i/QRG-'+g.toUpperCase()]);return g;}
 async function service(){const g=await guitar(),id=randomUUID();await a.query("insert into service_submissions(id,guitar_id,owner_user_id,provider_user_id,status,title,expires_at) values($1,$2,$3,$4,'submitted','Setup',now()+interval '1 day')",[id,g,owner,provider]);return{id,g};}
 async function transfer(){const g=await guitar(),id=randomUUID();await a.query("insert into ownership_transfers(id,guitar_id,from_owner_id,to_email,status,expires_at) values($1,$2,$3,'provider@example.invalid','sent',now()+interval '1 day')",[id,g,owner]);return{id,g};}
 const cancel=(x,client=a,actor=provider,env=false)=>one(client,"select cancel_service_submission($1,$2,$3,'Synthetic note')",[x.id,actor,env]);
 const approve=(x,client=a)=>one(client,'select approve_service_submission($1,$2,null)',[x.id,owner]);
 const accept=(x,client=a)=>one(client,"select complete_ownership_transfer($1,$2,null,null,false,'Synthetic')",[x.id,provider]);
 const cancelTransfer=(x,client=a)=>one(client,"select manage_ownership_transfer($1,$2,'cancel',null,false,'Synthetic')",[x.id,owner]);
 const count=(x,event)=>one(c,'select count(*)::int from action_email_intents where (submission_id=$1 or transfer_id=$1) and event_type=$2',[x.id,event]);
 async function lease(){const token=randomUUID(),i=await one(a,'select claim_action_email($1)',[token]);return{id:i.id,token};}
 const begin=(i,client=a)=>one(client,'select begin_action_email($1,$2)',[i.id,i.token]);
 try{
  await a.connect();await b.connect();await c.connect();
  assert.equal(await one(a,"select count(*)::int from pg_tables where schemaname='public'"),0,'Refusing nonempty database');
  assert.equal(await one(a,"select current_setting('cron.launch_active_jobs')"),'off');
  await a.query('create extension pgcrypto');
  await installRepositorySchema({exec:sql=>a.query(sql)},root);
  await a.query('alter table auth.users add column email_confirmed_at timestamptz');
  for(const file of ['service-email-outbox.sql','action-required-email.sql','claim-completion-recovery.sql','action-email-operations.sql','claim-outcome-email.sql','service-transfer-outcome-email.sql'])await a.query(fs.readFileSync(path.join(root,'supabase/proposals',file),'utf8'));
  assert.equal(await one(a,"select count(*)::int from cron.job where jobname='qrguitar-action-email-sweep' and active=false"),1);
  await a.query('update cron.job set active=false');
  const ready=await one(a,'select action_email_readiness(null,null)');assert.equal(ready.version,'2026-09-27.action-email.3');assert.equal(ready.schemaReady,true);assert.equal(ready.ready,false);
  for(const [id,label,role] of [[owner,'owner','owner'],[provider,'provider','owner'],[admin,'admin','admin'],[other,'other','owner']]){
   await a.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id,label+'@example.invalid']);
   await a.query("insert into profiles(id,display_name,role,plan) values($1,$2,$3,'single')",[id,label,role]);
  }
  await a.query("insert into service_provider_profiles(user_id,business_name) values($1,'Synthetic')",[provider]);
  await a.query('update action_email_control set capture_enabled=true,dispatch_enabled=true');
  const bpid=await one(b,'select pg_backend_pid()');
  for(const [actor,label] of [[owner,'owner'],[provider,'provider'],[admin,'admin']])await test('authenticated '+label+' cannot write cancellation marker or call server RPC',async()=>{
   const x=await service();await b.query('begin');await b.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role','authenticated',true)",[actor]);await b.query('set local role authenticated');
   await b.query('savepoint direct');const write=await outcome(b.query("update service_submissions set status='cancelled',service_cancel_recipient_role='owner' where id=$1 returning id",[x.id]));
   assert.ok(write.error?.code==='42501'||write.value?.rowCount===0);await b.query('rollback to savepoint direct');
   const rpc=await outcome(cancel(x,b,actor,true));assert.equal(rpc.error?.code,'42501');await b.query('rollback');
   assert.equal(await one(c,'select status from service_submissions where id=$1',[x.id]),'submitted');assert.equal(await one(c,'select service_cancel_recipient_role from service_submissions where id=$1',[x.id]),null);assert.equal(await count(x,'service.cancelled'),0);
  });
  await test('server-only cancellation succeeds for authenticated provider identity',async()=>{const x=await service();await b.query('begin');await b.query("select set_config('request.jwt.claim.role','service_role',true)");await b.query('set local role service_role');assert.equal((await cancel(x,b)).submission.service_cancel_recipient_role,'owner');await b.query('commit');assert.equal(await count(x,'service.cancelled'),1);});
  await test('concurrent duplicate cancellation commits one activity notification and intent',async()=>{const x=await service();await a.query('begin');await cancel(x);const pending=outcome(cancel(x,b));await blocked(bpid);await a.query('commit');assert.equal((await pending).value.alreadyCancelled,true);assert.equal(await count(x,'service.cancelled'),1);assert.equal(await one(c,"select count(*)::int from service_submission_activity where submission_id=$1 and action='cancelled'",[x.id]),1);assert.equal(await one(c,"select count(*)::int from service_submission_notifications where submission_id=$1 and notification_type='cancelled'",[x.id]),1);});
  await test('uncommitted cancellation invisible and rollback preserves workflow',async()=>{const x=await service();await a.query('begin');await cancel(x);assert.equal(await one(b,'select claim_action_email($1)',[randomUUID()]),null);await a.query('rollback');assert.equal(await count(x,'service.cancelled'),0);assert.equal(await one(c,'select status from service_submissions where id=$1',[x.id]),'submitted');});
  await test('cancellation wins before approval without deadlock or published work',async()=>{const x=await service();await a.query('begin');await cancel(x);const pending=outcome(approve(x,b));await blocked(bpid);await a.query('commit');assert.ok((await pending).error);assert.equal(await one(c,'select status from service_submissions where id=$1',[x.id]),'cancelled');assert.equal(await count(x,'service.approved'),0);assert.equal(await count(x,'service.cancelled'),1);});
  await test('approval wins before cancellation with one committed outcome',async()=>{const x=await service();await a.query('begin');await approve(x);const pending=outcome(cancel(x,b));await blocked(bpid);await a.query('commit');assert.equal((await pending).error?.code,'40001');assert.equal(await count(x,'service.approved'),1);assert.equal(await count(x,'service.cancelled'),0);});
  for(const [label,act,event] of [['acceptance',accept,'ownership.transferAccepted'],['cancellation',cancelTransfer,'ownership.transferCancelled']])await test('duplicate transfer '+label+' captures once',async()=>{const x=await transfer();await a.query('begin');await act(x);const pending=outcome(act(x,b));await blocked(bpid);await a.query('commit');assert.equal((await pending).value.replayed,true);assert.equal(await count(x,event),1);});
  await test('transfer acceptance wins before cancellation',async()=>{const x=await transfer();await a.query('begin');await accept(x);const pending=outcome(cancelTransfer(x,b));await blocked(bpid);await a.query('commit');assert.ok((await pending).error);assert.equal(await count(x,'ownership.transferAccepted'),1);assert.equal(await count(x,'ownership.transferCancelled'),0);});
  await test('transfer cancellation wins before acceptance',async()=>{const x=await transfer();await a.query('begin');await cancelTransfer(x);const pending=outcome(accept(x,b));await blocked(bpid);await a.query('commit');assert.ok((await pending).error);assert.equal(await count(x,'ownership.transferAccepted'),0);assert.equal(await count(x,'ownership.transferCancelled'),1);});
  await test('Auth email update wins before dispatch; rebound address is not emailed',async()=>{const x=await transfer();await cancelTransfer(x);const i=await lease();await a.query('begin');await a.query("update auth.users set email='changed@example.invalid' where id=$1",[provider]);const pending=outcome(begin(i,b));await blocked(bpid);await a.query('commit');assert.equal((await pending).value,null);assert.equal(await one(c,'select state from action_email_intents where id=$1',[i.id]),'suppressed');await a.query("update auth.users set email='provider@example.invalid' where id=$1",[provider]);});
  await test('dispatch locks confirmed Auth address before a later change',async()=>{const x=await transfer();await cancelTransfer(x);const i=await lease();await a.query('begin');assert.equal((await begin(i)).to,'provider@example.invalid');const pending=outcome(b.query("update auth.users set email='changed@example.invalid' where id=$1",[provider]));await blocked(bpid);await a.query('commit');assert.equal((await pending).error,undefined);await a.query("update auth.users set email='provider@example.invalid' where id=$1",[provider]);});
  await test('owner change committed before owner-facing cancellation dispatch suppresses inaccessible CTA',async()=>{const x=await service();await cancel(x);const i=await lease();await a.query('begin');await a.query('update guitars set owner_id=$1 where id=$2',[other,x.g]);const pending=outcome(begin(i,b));await blocked(bpid);await a.query('commit');assert.equal((await pending).value,null);});
  assert.equal(await one(a,'select count(*)::int from cron.job where active'),0);
  await a.query('select queue_action_email_sweep()');assert.equal(await one(a,'select count(*)::int from net.http_request_queue'),0);
  console.log(JSON.stringify({passed,scope:'dedicated native PostgreSQL17; real sessions, RLS, RPC and Auth-lock races; zero provider requests'}));
 }finally{await Promise.all([a.end(),b.end(),c.end()]);}
}
