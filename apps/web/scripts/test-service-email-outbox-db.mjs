import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), { PGlite } = require('@electric-sql/pglite-pg17');
const root = path.resolve(import.meta.dirname, '../../..'), db = new PGlite();
const owner = '11111111-1111-4111-8111-111111111111', provider = '22222222-2222-4222-8222-222222222222', other = '33333333-3333-4333-8333-333333333333';
const guitar = '44444444-4444-4444-8444-444444444444', lease = '55555555-5555-4555-8555-555555555555';
let count = 0;
const q = (sql, args = []) => db.query(sql, args);
const scalar = async (sql, args = []) => Object.values((await q(sql, args)).rows[0])[0];
async function test(name, run) { await run(); count++; console.log('PASS ' + name); }
async function fixture() {
  await q('truncate public.service_email_intents,public.service_submissions cascade');
  await q('update public.service_email_outbox_control set enabled=true,dispatch_enabled=true');
  await q('update public.guitars set owner_id=$1,admin_archived_at=null,owner_removed_at=null where id=$2', [owner, guitar]);
  return scalar("insert into public.service_submissions(guitar_id,provider_user_id,owner_user_id,status,title,expires_at) values($1,$2,$3,'submitted','Synthetic service',now()+interval '14 days') returning id", [guitar, provider, owner]);
}
const claim = () => scalar('select public.claim_service_email_intent($1)', [lease]);
const begin = intent => scalar('select public.begin_service_email_dispatch($1,$2)', [intent.id, intent.leaseToken]);
const settle = (intent, state, message = null, delay = 60) => scalar('select public.settle_service_email_intent($1,$2,$3,$4,$5)', [intent.id, intent.leaseToken, state, message, delay]);
const state = id => scalar('select state from public.service_email_intents where id=$1', [id]);
try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key,email text);
    create table public.account_deletion_requests(actor_id uuid,status text);
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table public.guitars(id uuid primary key,owner_id uuid,name text,model text,admin_archived_at timestamptz,owner_removed_at timestamptz);
    create table public.guitar_timeline_events(id uuid primary key default gen_random_uuid(),guitar_id uuid,created_by_user_id uuid,event_date date,date_precision text,category text,event_type text,title text,description text,private_notes text,shop_name text,is_public boolean,source_key text,created_at timestamptz,updated_at timestamptz);`);
  // PGlite's core gen_random_uuid is sufficient; omit only unsupported extension installation.
  const workflow = fs.readFileSync(path.join(root, 'supabase/migrations/20260718160000_service_provider_workflow.sql'), 'utf8');
  await db.exec(workflow.replace('create extension if not exists pgcrypto;', ''));
  await db.exec(fs.readFileSync(path.join(root, 'supabase/proposals/service-email-outbox.sql'), 'utf8'));
  await q('insert into auth.users(id,email) values($1,$4),($2,$5),($3,$6)', [owner, provider, other, 'owner@example.invalid', 'provider@example.invalid', 'other@example.invalid']);
  await q('insert into public.guitars(id,owner_id,name) values($1,$2,$3)', [guitar, owner, 'Synthetic Profile']);
  await q('insert into public.service_provider_profiles(user_id,public_display_name) values($1,$2)', [provider, 'Synthetic provider']);
  await test('disabled installation captures no historic or current email', async () => {
    await q("insert into public.service_submissions(guitar_id,provider_user_id,owner_user_id,status) values($1,$2,$3,'submitted')", [guitar, provider, owner]);
    assert.equal(await scalar('select count(*)::int from public.service_email_intents'), 0);
    await q('update public.service_email_outbox_control set enabled=true'); assert.equal(await scalar('select count(*)::int from public.service_email_intents'), 0);
  });
  await test('domain rollback rolls back intent and no-op update cannot duplicate it', async () => {
    const id = await fixture(); await q("update public.service_submissions set title='Updated' where id=$1", [id]); assert.equal(await scalar('select count(*)::int from public.service_email_intents'), 1);
    await db.exec('begin'); await q("update public.service_submissions set status='changes_requested' where id=$1", [id]); await q("update public.service_submissions set status='submitted' where id=$1", [id]); await db.exec('rollback'); assert.equal(await scalar('select count(*)::int from public.service_email_intents'), 1);
  });
  await test('new review cycle emits new event and suppresses superseded intent', async () => {
    const id = await fixture(); await q("update public.service_submissions set status='changes_requested' where id=$1", [id]); await q("update public.service_submissions set status='submitted' where id=$1", [id]); assert.equal(await scalar('select count(*)::int from public.service_email_intents'), 2); const old = await claim(); assert.equal(await begin(old), null); assert.equal(await state(old.id), 'suppressed');
  });
  await test('claim is exclusive and provider acceptance persists', async () => {
    await fixture(); const intent = await claim(); assert.equal(await claim(), null); const send = await begin(intent); assert.equal(send.to, 'owner@example.invalid'); assert.equal(await settle(intent, 'accepted', 'synthetic-receipt'), true); assert.equal(await state(intent.id), 'accepted'); assert.equal(await claim(), null);
  });
  for (const change of ["status='cancelled'", "expires_at=now()-interval '1 second'", "provider_revision=provider_revision+1"]) await test('ineligible submission suppresses: ' + change, async () => {
    const id = await fixture(), intent = await claim(); await q('update public.service_submissions set ' + change + ' where id=$1', [id]); assert.equal(await begin(intent), null); assert.equal(await state(intent.id), 'suppressed');
  });
  await test('changed ownership suppresses, never sends to old or new owner', async () => {
    await fixture(); const intent = await claim(); await q('update public.guitars set owner_id=$1 where id=$2', [other, guitar]); assert.equal(await begin(intent), null); assert.equal(await state(intent.id), 'suppressed');
  });
  await test('paused dispatch retains the leased intent instead of suppressing', async () => {
    await fixture(); const intent = await claim(); await q('update public.service_email_outbox_control set dispatch_enabled=false'); await assert.rejects(begin(intent), /paused/); assert.equal(await state(intent.id), 'leased');
  });
  await test('expired presend lease retries; expired dispatch is unknown', async () => {
    await fixture(); let intent = await claim(); await q("update public.service_email_intents set locked_until=now()-interval '1 second' where id=$1", [intent.id]); intent = await claim(); assert.ok(intent); await begin(intent); await q("update public.service_email_intents set locked_until=now()-interval '1 second' where id=$1", [intent.id]); assert.equal(await claim(), null); assert.equal(await state(intent.id), 'unknown');
  });
  await test('six definitive retry rejections exhaust budget', async () => {
    await fixture(); let intent;
    for (let i=0;i<6;i++) { intent=await claim(); await begin(intent); await settle(intent,'retry'); await q("update public.service_email_intents set next_attempt_at=now()-interval '1 second' where id=$1", [intent.id]); }
    assert.equal(await state(intent.id),'failed'); assert.equal(await claim(),null);
  });
  await test('null outcomes/delay and foreign/stale lease are rejected', async () => {
    await fixture(); const intent=await claim(); await begin(intent); await assert.rejects(settle(intent,null),/Invalid/); await assert.rejects(settle(intent,'retry',null,null),/Invalid/); await assert.rejects(settle({...intent,leaseToken:other},'unknown'),/not current/); assert.equal(await state(intent.id),'dispatching');
  });
  await test('missing intent cannot dispatch', async () => { await assert.rejects(begin({id:other,leaseToken:lease}),/unavailable/); });
  await test('client roles cannot read queue or call worker', async () => {
    for (const role of ['anon','authenticated']) { await db.exec('set role '+role); try { await assert.rejects(q('select * from public.service_email_intents'), /permission/); await assert.rejects(claim(), /permission/); } finally { await db.exec('reset role'); } }
  });
  await test('existing RPC allows current owner tokenless review without relaxing guards', async () => {
    const id=await fixture(); const result=(await q('select * from public.approve_service_submission($1,$2,null)',[id,owner])).rows[0]; assert.equal(result.already_approved,false); assert.equal(await scalar('select status from public.service_submissions where id=$1',[id]),'approved');
  });
  for (const mode of ['wrong-owner','changed-owner','expired','cancelled','anonymous']) await test('existing approval guard rejects '+mode, async () => {
    const id=await fixture(); if(mode==='changed-owner') await q('update public.guitars set owner_id=$1 where id=$2',[other,guitar]); if(mode==='expired') await q("update public.service_submissions set expires_at=now()-interval '1 second' where id=$1",[id]); if(mode==='cancelled') await q("update public.service_submissions set status='cancelled' where id=$1",[id]); if(mode==='anonymous') await db.exec('set role anon');
    try { await assert.rejects(q('select * from public.approve_service_submission($1,$2,null)',[id,mode==='wrong-owner'?other:owner])); } finally { await db.exec('reset role'); }
  });
  await test('failed new delivery preserves old email token and its actual approval path', async () => {
    const id=await fixture(); await q("insert into public.service_submission_tokens(submission_id,token_hash,expires_at) values($1,'existing-synthetic-hash',now()+interval '1 day')",[id]); const intent=await claim(); await begin(intent); await settle(intent,'failed'); assert.equal(await scalar("select consumed_at is null from public.service_submission_tokens where submission_id=$1",[id]),true);
    assert.equal((await q("select * from public.approve_service_submission($1,$2,'existing-synthetic-hash')",[id,owner])).rows[0].already_approved,false);
  });
  await test('outbox mode and durable notification share the submission transaction', async () => {
    const id=await fixture(); assert.equal(await scalar('select email_dispatch_mode from service_submissions where id=$1',[id]),'outbox');
    assert.equal(await scalar('select count(*)::int from service_submission_notifications where submission_id=$1',[id]),1);
    await db.exec('begin'); await q("update service_submissions set status='changes_requested' where id=$1",[id]);
    await q("update service_submissions set status='submitted' where id=$1",[id]); await db.exec('rollback');
    assert.equal(await scalar('select count(*)::int from service_submission_notifications where submission_id=$1',[id]),1);
  });
  await test('dispatch pause continues capture and cannot revert durable mode to inline', async()=>{
    await fixture();await q('update service_email_outbox_control set dispatch_enabled=false');
    await assert.rejects(q('update service_email_outbox_control set enabled=false'),/cannot revert/);
    const id=await scalar("insert into service_submissions(guitar_id,provider_user_id,owner_user_id,status,expires_at) values($1,$2,$3,'submitted',now()+interval '1 day') returning id",[guitar,provider,owner]);
    assert.equal(await scalar('select count(*)::int from service_email_intents where submission_id=$1',[id]),1);
    assert.equal(await claim(),null);
  });
  await test('pending account deletion suppresses owner or provider delivery before transport',async()=>{
    for(const actor of [owner,provider]) {
      await fixture();const intent=await claim();
      await q("insert into account_deletion_requests(actor_id,status) values($1,'requested')",[actor]);
      assert.equal(await begin(intent),null);assert.equal(await state(intent.id),'suppressed');
      await q('delete from account_deletion_requests where actor_id=$1',[actor]);
    }
  });
  const retry=(intent,actor=provider,admin=false,resolution='retry',reason='',receipt=null)=>scalar('select retry_service_email_intent($1,$2,$3,$4,$5,$6)',[intent.id,actor,admin,resolution,reason,receipt]);
  await test('definite failure retry is provider/admin-only and does not reset attempts',async()=>{
    const id=await fixture(),intent=await claim();await begin(intent);await settle(intent,'failed');
    assert.equal((await scalar('select service_email_submission_status($1)',[id])).canRetry,true);
    await assert.rejects(retry(intent,owner),/Provider/);await assert.rejects(retry(intent,null),/Sign in/);
    assert.equal(await retry(intent),true);assert.equal(await state(intent.id),'retry');
    assert.equal(await scalar('select attempt_count from service_email_intents where id=$1',[intent.id]),1);
    await assert.rejects(retry(intent),/cannot be retried/);
  });
  await test('unknown never retries without explicit administrator evidence',async()=>{
    const id=await fixture(),intent=await claim();await begin(intent);await settle(intent,'unknown');
    assert.equal((await scalar('select service_email_submission_status($1)',[id])).canRetry,false);
    await assert.rejects(retry(intent),/cannot be retried/);
    await assert.rejects(retry(intent,provider,false,'confirmed_not_accepted','Provider logs inspected'),/administrator/);
    await assert.rejects(retry(intent,provider,true,'confirmed_not_accepted',''),/evidence/);
    assert.equal(await claim(),null);assert.equal(await retry(intent,provider,true,'confirmed_not_accepted','Provider logs confirm rejection'),true);
    assert.equal(await state(intent.id),'retry');
  });
  await test('confirmed acceptance records a receipt without any new dispatch',async()=>{
    await fixture();const intent=await claim();await begin(intent);await settle(intent,'unknown');
    await assert.rejects(retry(intent,provider,true,'confirmed_accepted','Provider logs confirm acceptance'),/receipt/);
    assert.equal(await retry(intent,provider,true,'confirmed_accepted','Provider logs confirm acceptance','synthetic-id'),true);
    assert.equal(await state(intent.id),'accepted');assert.equal(await claim(),null);
  });
  await test('changed owner and expired review remain ineligible for manual retry',async()=>{
    const id=await fixture(),intent=await claim();await begin(intent);await settle(intent,'failed');
    await q('update guitars set owner_id=$1 where id=$2',[other,guitar]);await assert.rejects(retry(intent),/eligible/);
    await q('update guitars set owner_id=$1 where id=$2',[owner,guitar]);await q("update service_submissions set expires_at=now()-interval '1 second' where id=$1",[id]);await assert.rejects(retry(intent),/eligible/);
  });
  await test('authority change suppresses queued work and no actor copies are stored',async()=>{
    const id=await fixture(),intent=await claim();await q('update service_submissions set owner_user_id=$1 where id=$2',[other,id]);
    assert.equal(await state(intent.id),'suppressed');await assert.rejects(begin(intent),/not current/);
    assert.equal(await scalar("select count(*)::int from information_schema.columns where table_name='service_email_intents' and column_name in ('recipient_user_id','provider_user_id','email','body')"),0);
  });
  await test('heartbeat and admin status are bounded and omit addresses/content',async()=>{
    await fixture();await scalar('select service_email_worker_heartbeat(true)');const admin=await scalar('select service_email_admin_status()');
    assert.ok(admin.lastSuccessAt);assert.equal(admin.items.length,1);assert.ok(admin.items[0].submissionId);
    assert.doesNotMatch(JSON.stringify(admin),/@|Synthetic service|Synthetic Profile/);
    await assert.rejects(scalar('select service_email_worker_heartbeat(null)'),/required/);
  });
  await test('client roles cannot call status retry heartbeat or scheduler',async()=>{
    for(const role of ['anon','authenticated']){await db.exec('set role '+role);try{
      for(const sql of ['select service_email_admin_status()','select service_email_worker_heartbeat(true)','select queue_service_email_sweep()',`select service_email_submission_status('${guitar}')`,`select retry_service_email_intent('${guitar}','${owner}',true)`])await assert.rejects(q(sql),/permission/);
    }finally{await db.exec('reset role');}}
  });
  await test('historical unknown stays actionable when a later revision is accepted',async()=>{
    const id=await fixture(),old=await claim();await begin(old);await settle(old,'unknown');
    await q('update service_submissions set provider_revision=2 where id=$1',[id]);
    const latest=await claim();await begin(latest);await settle(latest,'accepted','new-receipt');
    const admin=await scalar('select service_email_admin_status()');assert.equal(admin.unknown,1);assert.equal(admin.items[0].id,old.id);assert.equal(admin.items[0].state,'unknown');
    assert.equal((await scalar('select service_email_submission_status($1)',[id])).state,'accepted');
    await retry(old,provider,true,'confirmed_not_accepted','Old attempt was never accepted');assert.equal(await state(old.id),'suppressed');assert.equal(await claim(),null);
  });
  await test('new revision queued status replaces prior acceptance in participant batch',async()=>{
    const id=await fixture(),old=await claim();await begin(old);await settle(old,'accepted','old-receipt');
    await q('update service_submissions set provider_revision=2 where id=$1',[id]);
    const statuses=await scalar('select service_email_statuses($1)',[[id]]);assert.equal(statuses[id].state,'queued');
    assert.equal((await scalar('select service_email_admin_status(50)')).items.length,0);
  });
  console.log(JSON.stringify({passed:count,scope:'Real PGlite SQL, original approval RPC, cutover/reconciliation/permissions. No external Auth or provider.'}));
} finally { await db.close(); }
