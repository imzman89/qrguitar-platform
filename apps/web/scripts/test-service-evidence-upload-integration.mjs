import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fixture } from './test-service-evidence-upload.mjs';
const overlay = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const repo = path.resolve(process.env.QRGUITAR_SOURCE_ROOT || overlay);
const { PGlite } = createRequire(path.join(repo, 'package.json'))('@electric-sql/pglite');
const { installRepositorySchema } = await import(pathToFileURL(path.join(repo, 'apps/web/scripts/security/postgres-fixture.mjs')));
const db = new PGlite();
const provider = '11111111-1111-4111-8111-111111111111', owner = '22222222-2222-4222-8222-222222222222', stranger = '33333333-3333-4333-8333-333333333333';
const submission = '44444444-4444-4444-8444-444444444444', upload = '55555555-5555-4555-8555-555555555555', guitar = '77777777-7777-4777-8777-777777777777';
const base = { action: 'prepare', expectedActorId: provider, submissionId: submission, uploadId: upload, evidenceType: 'receipt', fileName: '../service invoice.pdf', mimeType: 'application/pdf', size: 15 * 1024 * 1024 };
let passed = 0;
async function scalar(sql, args = []) { return (await db.query(sql, args)).rows[0].value; }
async function counts() { return scalar("select jsonb_build_object('receipts',(select count(*) from service_evidence_uploads),'evidence',(select count(*) from service_submission_evidence),'activity',(select count(*) from service_submission_activity)) value"); }
function integrationFixture() {
  const f = fixture();
  f.db.rpc = async (name, args) => {
    const spec = {
      prepare_service_evidence_upload: ['p_submission_id', 'p_actor_id', 'p_is_admin', 'p_upload_id', 'p_evidence'],
      commit_service_evidence_upload: ['p_submission_id', 'p_actor_id', 'p_is_admin', 'p_upload_id'],
      commit_service_evidence: ['p_submission_id', 'p_actor_id', 'p_is_admin', 'p_action', 'p_evidence']
    }[name];
    assert(spec, 'RPC must be explicitly known'); f.events.push({ kind: name, args });
    await db.exec('savepoint http_rpc; set local role service_role');
    try {
      const data = await scalar(`select public.${name}(${spec.map((key, i) => '$' + (i + 1) + (key === 'p_evidence' ? '::jsonb' : '')).join(',')}) value`, spec.map(key => key === 'p_evidence' ? JSON.stringify(args[key]) : args[key]));
      await db.exec('reset role; release savepoint http_rpc');
      if (f.state.loseAfter === name) { f.state.loseAfter = null; throw Error('Lost successful SQL response'); }
      return { data, error: null };
    } catch (error) {
      if (!error.code) throw error;
      await db.exec('rollback to savepoint http_rpc; reset role; release savepoint http_rpc'); return { data: null, error: { code: error.code } };
    }
  };
  f.db.from = table => {
    assert(['service_submissions', 'service_submission_evidence'].includes(table)); const filters = [];
    const query = { select() { return query; }, eq(key, value) { assert(['id', 'submission_id'].includes(key)); filters.push([key, value]); return query; }, order() { return query; }, maybeSingle() { query.single = true; return query; },
      then(resolve, reject) { return db.query(`select * from public.${table}${filters.length ? ' where ' + filters.map(([key], i) => key + '=$' + (i + 1)).join(' and ') : ''}`, filters.map(([, value]) => value)).then(result => ({ data: query.single ? result.rows[0] || null : result.rows, error: null })).then(resolve, reject); } };
    return query;
  };
  const storageFrom = f.db.storage.from;
  f.db.storage.from = bucket => ({ ...storageFrom(bucket), async info(storagePath) {
    f.events.push({ kind: 'info', path: storagePath });
    const object = (await db.query('select bucket_id,name,metadata from storage.objects where bucket_id=$1 and name=$2', [bucket, storagePath])).rows[0];
    const result = object ? { data: { bucketId: object.bucket_id, name: object.name, size: object.metadata.size, contentType: object.metadata.mimetype }, error: null } : { data: null, error: { status: 404 } };
    if (f.state.mutateAfterInfo) await db.query("update storage.objects set metadata=jsonb_set(metadata,'{size}','1') where bucket_id=$1 and name=$2", [bucket, storagePath]);
    return result;
  } });
  f.arrived = async () => { await db.query("insert into storage.objects(id,bucket_id,name,metadata) values(gen_random_uuid(),'service-evidence',$1,$2::jsonb)", [f.storagePath, JSON.stringify({ size: base.size, mimetype: base.mimeType })]); };
  return f;
}
async function test(name, run) { await db.exec('begin'); try { await run(integrationFixture()); passed++; console.log('PASS ' + name); } finally { await db.exec('rollback'); } }
try {
  await installRepositorySchema(db, repo, '20260917210000');
  await db.exec('alter table storage.objects add column if not exists metadata jsonb; create unique index fixture_storage_bucket_name on storage.objects(bucket_id,name)');
  const localMigration = path.join(overlay, '20260917210000_service_evidence_uploads.sql');
  await db.exec(fs.readFileSync(fs.existsSync(localMigration) ? localMigration : path.join(repo, 'supabase/migrations/20260917210000_service_evidence_uploads.sql'), 'utf8'));
  await db.query("insert into auth.users(id,email) values($1,'provider@example.test'),($2,'owner@example.test'),($3,'stranger@example.test')", [provider, owner, stranger]);
  await db.query("insert into profiles(id,display_name) values($1,'Provider'),($2,'Owner'),($3,'Stranger')", [provider, owner, stranger]);
  await db.query("insert into guitars(id,owner_id,qr_code,permanent_path,name,brand) values($1,$2,'QRG-HTTP-EVIDENCE','/i/QRG-HTTP-EVIDENCE','Synthetic','Synthetic')", [guitar, owner]);
  await db.query('insert into service_submissions(id,guitar_id,provider_user_id,owner_user_id) values($1,$2,$3,$4)', [submission, guitar, provider, owner]);
  await test('actual route + SQL prepare binds one durable receipt before signed capability', async f => { const r = await f.post(); assert.equal(r.phase, 'upload'); assert.deepEqual(await counts(), { receipts: 1, evidence: 0, activity: 0 }); assert.equal(await scalar('select storage_path value from service_evidence_uploads where upload_id=$1', [upload]), r.storagePath); });
  await test('actual route accepts SQL committed DTO and replay preserves one evidence/activity', async f => { await f.post(); await f.arrived(); const first = await f.post({ ...base, action: 'complete' }); assert.equal(first.phase, 'committed'); assert.equal(first.committed, true); assert.equal(first.evidence.fileName, 'service-invoice.pdf'); const again = await f.post(); assert.equal(again.replayed, true); assert.deepEqual(again.evidence, first.evidence); assert.deepEqual(await counts(), { receipts: 1, evidence: 1, activity: 1 }); });
  await test('actual SQL commit followed by transport loss can be recovered after closure', async f => { await f.arrived(); f.state.loseAfter = 'commit_service_evidence_upload'; const lost = await f.post({ ...base, action: 'complete' }); assert.equal(lost.commitStatus, 'unknown'); await db.query("update service_submissions set status='approved' where id=$1", [submission]); const r = await f.post(); assert.equal(r.replayed, true); assert.deepEqual(await counts(), { receipts: 1, evidence: 1, activity: 1 }); });
  await test('actual RPC authorization rejects owner mutation and restricted provider replay', async f => { f.state.actor = owner; assert.equal((await f.post({ ...base, expectedActorId: owner })).status, 403); f.state.actor = provider; await f.arrived(); await f.post({ ...base, action: 'complete' }); await db.query("update profiles set account_status='locked' where id=$1", [provider]); assert.equal((await f.post()).status, 403); assert.deepEqual(await counts(), { receipts: 1, evidence: 1, activity: 1 }); });
  await test('SQL independently rejects metadata changed after successful Storage.info', async f => { await f.arrived(); f.state.mutateAfterInfo = true; const r = await f.post({ ...base, action: 'complete' }); assert.equal(r.code, 'upload_metadata_mismatch'); assert.deepEqual(await counts(), { receipts: 1, evidence: 0, activity: 0 }); assert.equal(f.events.some(e => e.kind === 'remove'), false); });
  await test('existing real delete transaction tombstones receipt and prevents route resurrection', async f => { await f.arrived(); const r = await f.post({ ...base, action: 'complete' }); const response = await f.route.DELETE(new Request('https://app.example.test/api/service-evidence', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ evidenceId: r.evidence.id }) })); assert.equal(response.status, 200); assert.equal((await f.post()).code, 'upload_deleted'); assert.deepEqual(await counts(), { receipts: 1, evidence: 0, activity: 2 }); assert.equal(await scalar('select state value from service_evidence_uploads where upload_id=$1', [upload]), 'deleted'); });
  await test('SQL activity failure leaves no false evidence commit and same UUID retry succeeds', async f => { await f.arrived(); await db.exec("create function public.fixture_http_evidence_failure() returns trigger language plpgsql as $$begin raise exception 'Synthetic failure' using errcode='XX000';end$$; create trigger fixture_http_evidence_failure before insert on service_submission_activity for each row execute function public.fixture_http_evidence_failure()"); const r = await f.post({ ...base, action: 'complete' }); assert.equal(r.commitStatus, 'unknown'); assert.deepEqual(await counts(), { receipts: 1, evidence: 0, activity: 0 }); await db.exec('drop trigger fixture_http_evidence_failure on service_submission_activity'); assert.equal((await f.post({ ...base, action: 'complete' })).committed, true); });
  await test('SQL bucket configuration failure cannot produce a signed capability', async f => { await db.exec("update storage.buckets set public=true where id='service-evidence'"); const r = await f.post(); assert.equal(r.status, 503); assert.equal(f.events.some(e => e.kind === 'sign-upload'), false); assert.deepEqual(await counts(), { receipts: 0, evidence: 0, activity: 0 }); });
  console.log(`Completed ${passed} actual route/PGlite integration cases; synthetic metadata only, no network or file uploads.`);
} finally { await db.close(); }
