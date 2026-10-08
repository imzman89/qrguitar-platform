import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import pg from 'pg';
import {installRepositorySchema} from './security/postgres-fixture.mjs';
import {buildWorkflowSchemaBundle,source,postconditions} from './prepare-workflow-email-schema.mjs';
const root=path.resolve(import.meta.dirname,'../../..'),native=process.argv[2]==='--native';let db,client,passed=0;
if(native){
 const name=process.argv[3];assert.match(name,/^qrg-action-email-pg-\d{8}$/);
 const d=JSON.parse(execFileSync('docker',['inspect',name],{encoding:'utf8'}))[0];
 assert.equal(d.Config.Labels['qrg.scope'],'action-email-acceptance');assert.equal(d.Mounts.some(x=>x.Type==='bind'),false);
 assert.deepEqual(d.HostConfig.PortBindings['5432/tcp'],[{HostIp:'127.0.0.1',HostPort:'55553'}]);
 client=new pg.Client({host:'127.0.0.1',port:55553,database:'postgres',user:'postgres',connectionTimeoutMillis:5000,statement_timeout:90000});await client.connect();
 db={exec:sql=>client.query(sql),query:(sql,args)=>client.query(sql,args),close:()=>client.end()};
}else db=new PGlite();
const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
const pass=name=>{passed++;console.log('PASS '+name);};
async function fingerprint(){return one("select jsonb_build_object('tables',(select jsonb_agg(tablename order by tablename) from pg_tables where schemaname='public'),'functions',(select jsonb_object_agg(oid::regprocedure::text,md5(pg_get_functiondef(oid))) from pg_proc where pronamespace='public'::regnamespace and prokind='f'),'triggers',(select jsonb_agg(pg_get_triggerdef(oid) order by oid) from pg_trigger where not tgisinternal and tgrelid in(select oid from pg_class where relnamespace='public'::regnamespace)))");}
try{
 assert.equal(await one("select count(*)::int from pg_tables where schemaname='public'"),0,'Harness refuses nonempty databases');
 if(native){assert.equal(await one("select current_setting('cron.launch_active_jobs')"),'off');await db.exec('create extension pgcrypto');}
 // This old workflow bundle pins the September base; current readiness has its separate full-chain gate.
 await installRepositorySchema(db,root,'20260923121100');await db.exec('alter table auth.users add column email_confirmed_at timestamptz');
 // Same private bucket configuration as the repository's global-readiness fixture.
 await db.exec("insert into storage.buckets(id,name,public) values('instrument-media','instrument-media',false),('instrument-documents','instrument-documents',false),('service-evidence','service-evidence',false) on conflict(id) do update set public=false");
 if(native)await db.exec('update cron.job set active=false');
 const actor=randomUUID(),provider=randomUUID(),guitar=randomUUID(),submission=randomUUID(),claim=randomUUID();
 for(const [id,label] of [[actor,'owner'],[provider,'provider']]){await db.query('insert into auth.users(id,email) values($1,$2)',[id,label+'@example.invalid']);await db.query("insert into profiles(id,display_name,role,plan) values($1,$2,'owner','single')",[id,label]);}
 await db.query("insert into guitars(id,owner_id,qr_code,permanent_path,name,brand,visibility) values($1,$2,'QRG-SYNTHETIC-PREFLIGHT','/i/QRG-SYNTHETIC-PREFLIGHT','Synthetic','Synthetic','private')",[guitar,actor]);
 await db.query("insert into service_submissions(id,guitar_id,owner_user_id,provider_user_id,status,title) values($1,$2,$3,$4,'submitted','Existing work')",[submission,guitar,actor,provider]);
 await db.query("insert into ownership_claims(id,guitar_id,current_owner_id,claimant_user_id,claim_type,status) values($1,$2,$3,$4,'store_purchase','awaiting_owner')",[claim,guitar,actor,provider]);
 const baseline=await one('select qrguitar_release_readiness()');assert.equal(baseline.ready,true,JSON.stringify(baseline));assert.equal(baseline.releaseVersion,'2026-09-23.1');pass('historical 2026-09-23.1 workflow base passes all fourteen checks; not current acceptance');
 const original=await fingerprint(),cronBefore=native?await one('select count(*)::int from cron.job'):0;
 await db.exec(fs.readFileSync(path.join(root,'supabase/proposals/workflow-email-preflight.sql'),'utf8'));assert.deepEqual(await fingerprint(),original);pass('read-only preflight leaves populated schema unchanged');
 const bundle=buildWorkflowSchemaBundle(root),hash=createHash('sha256').update(bundle.sql).digest('hex');assert.equal(bundle.manifest.length,6);assert.equal((bundle.sql.match(/^commit;$/gm)||[]).length,1);pass('bundle pins six reviewed source files with one final commit');
 for(const drift of ['partial_table','partial_column','auth_column','base_version']){
  await db.exec('begin');
  if(drift==='partial_table')await db.exec('create table public.action_email_control(singleton boolean)');
  if(drift==='partial_column')await db.exec('alter table service_submissions add column action_email_version integer');
  if(drift==='auth_column')await db.exec('alter table auth.users drop column email_confirmed_at');
  if(drift==='base_version')await db.exec("create or replace function qrguitar_release_readiness() returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$select '{\"ready\":true,\"releaseVersion\":\"wrong\",\"checks\":[]}'::jsonb$$");
  await assert.rejects(()=>db.exec(bundle.sql));await db.exec('rollback');assert.deepEqual(await fingerprint(),original);pass('preflight rejects '+drift+' without partial schema changes');
 }
 const late=bundle.sql.replace(/\ncommit;\s*$/,'\nselect 1/0;\ncommit;');await assert.rejects(()=>db.exec(late),/division by zero/);await db.exec('rollback');
 assert.deepEqual(await fingerprint(),original);if(native)assert.equal(await one('select count(*)::int from cron.job'),cronBefore);pass('failure after all six proposals and readiness rolls back all DDL functions triggers and schedules');
 const drift=bundle.sql.replace(postconditions,`grant execute on function begin_action_email(uuid,uuid) to anon;\n${postconditions}`);await assert.rejects(()=>db.exec(drift),/postconditions failed/);await db.exec('rollback');assert.deepEqual(await fingerprint(),original);pass('final security-readiness drift rolls back the entire package');
 await db.exec(bundle.sql);
 const global=await one('select qrguitar_release_readiness()'),ready=await one('select action_email_readiness(null,null)');assert.deepEqual(global,baseline);assert.equal(ready.schemaReady,true);assert.equal(ready.version,'2026-09-27.action-email.3');assert.equal(ready.ready,false);pass('atomic installation preserves exact base readiness and installs disabled action .3');
 assert.equal(await one('select owner_id from guitars where id=$1',[guitar]),actor);assert.equal(await one('select status from service_submissions where id=$1',[submission]),'submitted');assert.equal(await one('select email_dispatch_mode from service_submissions where id=$1',[submission]),'inline');assert.equal(await one('select action_email_completed from ownership_claims where id=$1',[claim]),false);assert.equal(await one('select count(*)::int from action_email_intents'),0);assert.equal(await one('select count(*)::int from service_email_intents'),0);pass('existing records preserved with no completion backfill or queued emails');
 const installed=await fingerprint();await assert.rejects(()=>db.exec(bundle.sql),/already present or partially installed/);await db.exec('rollback');assert.deepEqual(await fingerprint(),installed);pass('installed schema cannot be replayed or silently overwritten');
 if(native){assert.equal(await one("select count(*)::int from cron.job where jobname in('qrguitar-service-email-sweep','qrguitar-action-email-sweep') and not active"),2);assert.equal(await one('select count(*)::int from cron.job where active'),0);assert.equal(await one('select count(*)::int from net.http_request_queue'),0);pass('two new schedules inactive and no HTTP request queued');}
 console.log(JSON.stringify({passed,native,source,bundleSha256:hash,productionOrSharedDatabase:false}));
}finally{await db.close();}
