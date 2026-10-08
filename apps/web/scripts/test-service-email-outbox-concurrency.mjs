import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

if (process.argv[2]!=='--execute') { console.log('Manual only: requires dedicated empty qrg-service-outbox-pg-20260926 container on loopback port 55552.'); }
else {
  const container=JSON.parse(execFileSync('docker',['inspect','qrg-service-outbox-pg-20260926'],{encoding:'utf8'}))[0];
  assert.equal(container.Config.Labels['qrg.scope'],'service-outbox-acceptance');
  assert.deepEqual(container.HostConfig.PortBindings['5432/tcp'],[{HostIp:'127.0.0.1',HostPort:'55552'}]);
  assert.equal(container.Mounts.some(m=>m.Type==='bind'),false);
  const root=path.resolve(import.meta.dirname,'../../..');
  const options={host:'127.0.0.1',port:55552,database:'postgres',user:'postgres',connectionTimeoutMillis:5000,statement_timeout:10000};
  const a=new pg.Client(options),b=new pg.Client(options),c=new pg.Client(options);
  let passed=0;
  const scalar=async(client,sql,args=[])=>Object.values((await client.query(sql,args)).rows[0])[0];
  async function test(name,run){await run();passed++;console.log('PASS '+name);}
  try {
    await a.connect();await b.connect();await c.connect();
    assert.equal(await scalar(a,"select count(*)::int from pg_tables where schemaname='public'"),0,'Refusing existing schema');
    await a.query(`create extension pg_cron; create extension pg_net;
      create role anon;create role authenticated;create role service_role;
      create schema auth;create table auth.users(id uuid primary key,email text);
      create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table account_deletion_requests(actor_id uuid,status text);
      create table guitars(id uuid primary key,owner_id uuid,name text,model text,admin_archived_at timestamptz,owner_removed_at timestamptz);
      create table guitar_timeline_events(id uuid primary key default gen_random_uuid(),guitar_id uuid,created_by_user_id uuid,event_date date,date_precision text,category text,event_type text,title text,description text,private_notes text,shop_name text,is_public boolean,source_key text,created_at timestamptz,updated_at timestamptz);`);
    await a.query(fs.readFileSync(path.join(root,'supabase/migrations/20260718160000_service_provider_workflow.sql'),'utf8'));
    await a.query(fs.readFileSync(path.join(root,'supabase/proposals/service-email-outbox.sql'),'utf8'));
    const owner=randomUUID(),provider=randomUUID(),guitar=randomUUID(),submission=randomUUID();
    await a.query("insert into auth.users values($1,'owner@example.invalid'),($2,'provider@example.invalid')",[owner,provider]);
    await a.query("insert into guitars(id,owner_id,name) values($1,$2,'Synthetic')",[guitar,owner]);
    await test('actual pg_cron job is installed exactly once and inactive',async()=>{
      const jobs=(await a.query("select active,command from cron.job where jobname='qrguitar-service-email-sweep'")).rows;
      assert.equal(jobs.length,1);assert.equal(jobs[0].active,false);assert.equal(jobs[0].command,'select public.queue_service_email_sweep()');
      await a.query('select queue_service_email_sweep()');assert.equal(await scalar(a,'select count(*)::int from net.http_request_queue'),0);
    });
    await a.query('update service_email_outbox_control set enabled=true,dispatch_enabled=true');
    const insert=()=>a.query("insert into service_submissions(id,guitar_id,provider_user_id,owner_user_id,status,expires_at) values($1,$2,$3,$4,'submitted',now()+interval '1 day')",[submission,guitar,provider,owner]);
    await test('worker cannot observe an uncommitted submission and rollback leaves no mail',async()=>{
      await a.query('begin');await insert();assert.equal(await scalar(b,'select claim_service_email_intent($1)',[randomUUID()]),null);
      await a.query('rollback');assert.equal(await scalar(c,'select count(*)::int from service_email_intents'),0);
      assert.equal(await scalar(c,'select count(*)::int from service_submission_notifications'),0);
    });
    await insert();let intent,lease=randomUUID();
    await test('two real connections cannot claim the same pending email',async()=>{
      await a.query('begin');intent=await scalar(a,'select claim_service_email_intent($1)',[lease]);assert.ok(intent.id);
      assert.equal(await scalar(b,'select claim_service_email_intent($1)',[randomUUID()]),null);
      await a.query('commit');assert.equal(await scalar(c,'select claim_service_email_intent($1)',[randomUUID()]),null);
    });
    await test('foreign lease cannot start dispatch; valid lease can',async()=>{
      await assert.rejects(b.query('select begin_service_email_dispatch($1,$2)',[intent.id,randomUUID()]),/not current/);
      assert.equal((await scalar(a,'select begin_service_email_dispatch($1,$2)',[intent.id,lease])).to,'owner@example.invalid');
    });
    await test('crash after dispatch-start becomes unknown and neither worker resends',async()=>{
      await a.query("update service_email_intents set locked_until=now()-interval '1 second' where id=$1",[intent.id]);
      assert.equal(await scalar(b,'select claim_service_email_intent($1)',[randomUUID()]),null);
      assert.equal(await scalar(c,'select claim_service_email_intent($1)',[randomUUID()]),null);
      assert.equal(await scalar(a,'select state from service_email_intents where id=$1',[intent.id]),'unknown');
    });
    assert.equal(await scalar(a,'select count(*)::int from net.http_request_queue'),0);
    console.log(JSON.stringify({passed,scope:'Actual PostgreSQL 17, three independent connections, real pg_cron/pg_net installed inactive; no HTTP provider calls'}));
  } finally { await a.end();await b.end();await c.end(); }
}
