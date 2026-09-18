import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
const overlay = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const repo = path.resolve(process.env.QRGUITAR_SOURCE_ROOT || overlay);
const require = createRequire(path.join(repo, 'package.json')), ts = require('typescript');
const { createMemoryDatabase } = await import(pathToFileURL(path.join(repo, 'apps/web/scripts/security/mock-routes.mjs')));
export const provider = '11111111-1111-4111-8111-111111111111', owner = '22222222-2222-4222-8222-222222222222';
export const stranger = '33333333-3333-4333-8333-333333333333', submission = '44444444-4444-4444-8444-444444444444';
export const upload = '55555555-5555-4555-8555-555555555555', evidenceId = '66666666-6666-4666-8666-666666666666';
const origin = 'https://synthetic.supabase.co', app = 'https://app.example.test', stamp = '2026-09-17T00:00:00.123456Z';
export const base = { protocolVersion: 2, action: 'prepare', expectedActorId: provider, submissionId: submission, uploadId: upload, expectedRevision: '0', evidenceType: 'receipt', fileName: '../service invoice.pdf', mimeType: 'application/pdf', size: 15 * 1024 * 1024 };
export const identity = (action = 'complete', changes = {}) => ({ protocolVersion: 2, action, expectedActorId: provider, submissionId: submission, uploadId: upload, expectedRevision: '0', ...changes });
let passes = 0;
export function fixture(options = {}) {
  const events = [], receipts = new Map(), objects = new Map();
  const tables = { service_submissions: [{ id: submission, provider_user_id: provider, owner_user_id: owner, status: 'draft' }], service_submission_evidence: [] };
  const db = createMemoryDatabase(tables), state = { actor: provider, admin: false, status: 'active', revision: '0', ...options }, cache = new Map();
  const mocks = {
    'next/server': { NextResponse: { json: (value, init) => Response.json(value, init) } },
    'apps/web/lib/supabase-server.ts': { createServerSupabaseClient: () => state.noClient ? null : db, getAuthenticatedUser: async () => { events.push({ kind: 'auth' }); if (state.authThrows) throw Error('private-auth-detail'); return { user: state.actor ? { id: state.actor } : null }; }, getSupabaseEnvStatus: () => ({ supabaseUrl: origin }) },
    'apps/web/lib/admin-auth.ts': { assertAccountCanWrite: async () => ({ ok: state.status === 'active', status: 403, message: 'Account restricted' }), getAdminContext: async () => ({ ok: state.admin, user: { id: state.adminActor || state.actor } }) }
  };
  function load(relative) {
    if (mocks[relative]) return mocks[relative]; if (cache.has(relative)) return cache.get(relative);
    const full = fs.existsSync(path.join(overlay, relative)) ? path.join(overlay, relative) : path.join(repo, relative);
    const code = ts.transpileModule(fs.readFileSync(full, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const module = { exports: {} }; cache.set(relative, module.exports);
    vm.runInNewContext(code, { module, exports: module.exports, require: name => mocks[name] || (name.startsWith('.') ? load(path.posix.normalize(path.posix.join(path.posix.dirname(relative), name)) + '.ts') : require(name)), Request, Response, URL, URLSearchParams, Buffer, File, FormData, TextDecoder, Uint8Array, console,
      setTimeout: (fn, ms) => setTimeout(fn, state.timeout ? 1 : ms), clearTimeout, process: { env: {} } }, { filename: full });
    cache.set(relative, module.exports); return module.exports;
  }
  const protocol = load('apps/web/lib/service-evidence-upload.ts'), route = load('apps/web/app/api/service-evidence/route.ts');
  const storagePath = protocol.serviceEvidenceStoragePath(submission, provider, upload, base.mimeType);
  db.storage = { from(bucket) { assert.equal(bucket, 'service-evidence'); return {
    async info(p) { events.push({ kind: 'info', path: p }); if (state.infoPending) return new Promise(() => {}); if (state.infoError) return { data: null, error: state.infoError }; return { data: objects.get(p) || null, error: objects.has(p) ? null : { status: 404, code: 'NoSuchKey' } }; },
    async createSignedUploadUrl(p, opts) { events.push({ kind: 'sign-upload', path: p, opts }); assert.equal(opts.upsert, false); return { error: state.signError || null, data: { path: state.signPath || p, signedUrl: state.signedUrl || `${origin}/storage/v1/object/upload/sign/${bucket}/${p}?token=synthetic-only` } }; },
    async createSignedUrl(p) { events.push({ kind: 'sign-read', path: p }); return state.previewError ? { error: { message: 'secret-url' } } : { data: { signedUrl: 'https://preview.invalid/private-token' } }; },
    async remove(paths) { events.push({ kind: 'remove', paths }); return { error: state.removeError || null }; },
    upload() { throw Error('The app must never receive file bytes'); }
  }; } };
  function snapshot(r) {
    if (!r) return null; const result = structuredClone(r);
    result.canDiscard = r.state === 'prepared' && state.status === 'active';
    result.storageState = r.state !== 'prepared' ? 'not_applicable' : !objects.has(r.storagePath) ? 'missing' : objects.get(r.storagePath).size === r.metadata.file_size_bytes && objects.get(r.storagePath).contentType === r.metadata.mime_type ? 'matching' : 'mismatch';
    result.canFinish = result.canDiscard && result.storageState === 'matching' && (state.admin || ['draft', 'changes_requested'].includes(tables.service_submissions[0].status));
    return result;
  }
  db.rpc = async (name, args) => {
    events.push({ kind: name, args });
    if (name === 'commit_service_evidence') {
      assert.equal(args.p_action, 'delete'); if (state.deleteError) return { error: state.deleteError };
      const row = tables.service_submission_evidence.find(r => r.id === args.p_evidence.id);
      if (!row) return { error: { code: 'P0002' } };
      tables.service_submission_evidence = tables.service_submission_evidence.filter(r => r.id !== row.id);
      for (const r of receipts.values()) if (r.evidence?.id === row.id) { r.state = 'deleted'; r.deletedAt = stamp; r.evidence = null; }
      return { data: row, error: null };
    }
    if (state.rpcError) return { error: state.rpcError };
    if (args.p_actor_id !== provider && !args.p_is_admin) return { error: { code: 'SE403' } };
    if (name === 'read_service_evidence_uploads') {
      if (state.readPending) return new Promise(() => {});
      const all = [...receipts.values()].filter(r => r.actorId === args.p_actor_id && r.submissionId === args.p_submission_id), pending = all.filter(r => r.state === 'prepared');
      return { data: { ok: true, protocolVersion: 2, actorId: args.p_actor_id, submissionId: args.p_submission_id, revision: state.revision, pendingCount: pending.length, pending: snapshot(pending[0]), latest: snapshot(all.at(-1)), requested: snapshot(all.find(r => r.uploadId === args.p_upload_id)), canPrepare: !pending.length && state.status === 'active' && ['draft', 'changes_requested'].includes(tables.service_submissions[0].status), ...state.discoveryPatch }, error: null };
    }
    if (state.status !== 'active') return { error: { code: 'SE403' } };
    let receipt = receipts.get(args.p_upload_id);
    if (receipt && (receipt.actorId !== args.p_actor_id || receipt.submissionId !== args.p_submission_id || receipt.expectedRevision !== args.p_expected_revision)) return { error: { code: 'PT409' } };
    if (name === 'prepare_service_evidence_upload') {
      if (receipt && receipt.state === 'discarded') return { error: { code: 'SE410' } };
      if (receipt && receipt.state === 'deleted') return { error: { code: 'SE409' } };
      if (receipt && JSON.stringify(receipt.metadata) !== JSON.stringify(args.p_evidence)) return { error: { code: 'PT409' } };
      if (!receipt) {
        if (args.p_expected_revision !== state.revision) return { error: { code: 'SE412' } };
        if ([...receipts.values()].some(r => r.state === 'prepared')) return { error: { code: 'SE428' } };
        if (!args.p_is_admin && !['draft', 'changes_requested'].includes(tables.service_submissions[0].status)) return { error: { code: 'PT409' } };
        receipt = { uploadId: args.p_upload_id, submissionId: args.p_submission_id, actorId: args.p_actor_id, expectedRevision: args.p_expected_revision, state: 'prepared', bucket: 'service-evidence', storagePath: protocol.serviceEvidenceStoragePath(args.p_submission_id, args.p_actor_id, args.p_upload_id, args.p_evidence.mime_type), metadata: args.p_evidence, evidence: null, preparedAt: stamp, committedAt: null, deletedAt: null, discardedAt: null };
        receipts.set(args.p_upload_id, receipt); state.revision = String(BigInt(state.revision) + 1n);
      }
      if (state.prepareLoss) { state.prepareLoss = false; throw Error('Lost prepare response'); }
    } else if (name === 'discard_service_evidence_upload') {
      if (!receipt) {
        if (args.p_expected_revision === null) return { error: { code: '22023' } };
        if (BigInt(args.p_expected_revision) > BigInt(state.revision)) return { error: { code: 'SE412' } };
        receipt = { uploadId: args.p_upload_id, submissionId: args.p_submission_id, actorId: args.p_actor_id, expectedRevision: args.p_expected_revision, state: 'discarded', bucket: 'service-evidence', storagePath: null, metadata: null, evidence: null, preparedAt: null, committedAt: null, deletedAt: null, discardedAt: stamp };
        receipts.set(args.p_upload_id, receipt); if (args.p_expected_revision === state.revision) state.revision = String(BigInt(state.revision) + 1n);
      } else if (receipt.state === 'prepared') { receipt.state = 'discarded'; receipt.discardedAt = stamp; state.revision = String(BigInt(state.revision) + 1n); }
      if (state.discardLoss) { state.discardLoss = false; throw Error('Lost discard response'); }
    } else {
      assert.equal(name, 'commit_service_evidence_upload');
      if (state.commitPending) return new Promise(() => {}); if (state.commitError) return { error: state.commitError };
      if (!receipt) return { error: { code: 'P0002' } };
      if (receipt.state === 'deleted' || receipt.state === 'discarded') return { error: { code: receipt.state === 'deleted' ? 'SE409' : 'SE410' } };
      if (receipt.state !== 'committed') {
        if (state.closeAtCommit || !['draft', 'changes_requested'].includes(tables.service_submissions[0].status)) return { error: { code: 'PT409' } };
        const snap = snapshot(receipt); if (snap.storageState !== 'matching') return { error: { code: snap.storageState === 'missing' ? 'SE404' : 'SE422' } };
        const row = { id: evidenceId, submission_id: submission, uploaded_by_user_id: args.p_actor_id, ...receipt.metadata, storage_path: receipt.storagePath, created_at: stamp };
        tables.service_submission_evidence.push(row); receipt.evidence = { id: row.id, type: row.evidence_type, fileName: row.file_name, mimeType: row.mime_type, fileSizeBytes: row.file_size_bytes, createdAt: row.created_at }; receipt.state = 'committed'; receipt.committedAt = stamp;
      }
      if (state.commitLoss) { state.commitLoss = false; throw Error('Lost commit response'); }
    }
    return { data: { ok: true, revision: state.revision, receipt: { ...snapshot(receipt), ...state.receiptPatch }, ...state.resultPatch }, error: null };
  };
  function arrived(p = storagePath, patch = {}) { objects.set(p, { name: p, bucketId: 'service-evidence', size: base.size, contentType: base.mimeType, ...patch }); }
  async function response(result) { return { status: result.status, headers: result.headers, ...await result.json() }; }
  async function post(body = base, headers = {}, customRequest) {
    return response(await route.POST(customRequest || new Request(`${app}/api/service-evidence`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })));
  }
  async function discover(params = '', id = submission) { return response(await route.GET(new Request(`${app}/api/service-evidence?submissionId=${id}&uploadState=1${params}`))); }
  return { protocol, route, load, state, db, receipts, objects, events, tables, storagePath, arrived, post, discover };
}
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
async function test(name, fn) { if (!isMain) return; await fn(); passes++; console.log('PASS ' + name); }
const writes = f => f.events.filter(e => /^(prepare|commit|discard)_/.test(e.kind) || /^(sign|remove|info)/.test(e.kind));
await test('15MiB preparation binds revision and durable path before signing without upsert', async () => {
  const f = fixture(), r = await f.post(); assert.equal(r.phase, 'upload'); assert.equal(r.revision, '1'); assert.equal(r.expectedRevision, '0'); assert.equal(r.storagePath, f.storagePath); assert.equal(r.protocolVersion, 2);
  assert.deepEqual(writes(f).map(e => e.kind), ['prepare_service_evidence_upload', 'info', 'sign-upload']); assert.match(r.headers.get('cache-control'), /no-store/);
});
await test('revisions preserve PostgreSQL bigint precision and reject alternate encodings', async () => {
  const f = fixture(); for (const revision of ['0', '9007199254740993', '9223372036854775807']) assert.equal(f.protocol.cleanServiceEvidenceRevision(revision), revision);
  for (const value of [0, 1, null, '', '-1', '01', '+1', '1.0', '1e2', ' 1', '9223372036854775808', '99999999999999999999']) assert.equal(f.protocol.cleanServiceEvidenceRevision(value), null);
  for (const expectedRevision of ['01', 1, null, undefined]) { const r = await f.post({ ...base, expectedRevision }); assert.equal(r.status, 400); } assert.equal(writes(f).length, 0);
});
await test('strict action-specific JSON rejects extra metadata on finish/discard and actor/admin/path injection', async () => {
  for (const body of [{ ...base, actorId: stranger }, { ...base, isAdmin: true }, { ...base, storagePath: 'elsewhere' }, { ...base, uploadId: '../escape' }, { ...base, action: 'complete' }, { ...identity('discard'), fileName: 'x' }, { ...base, evidenceType: 'unknown' }, { ...base, expectedActorId: '' }]) { const f = fixture(); assert.equal((await f.post(body)).status, 400); assert.equal(writes(f).length, 0); }
});
await test('old and unsupported protocol receive finite refresh instruction without any RPC', async () => {
  for (const protocolVersion of [undefined, 1, 3, '2']) { const f = fixture(), r = await f.post({ ...base, protocolVersion }); assert.equal(r.status, 426); assert.equal(r.code, 'upload_upgrade_required'); assert.equal(writes(f).length, 0); }
});
await test('normalization preserves existing filename sanitizer and MIME extensions', async () => {
  const f = fixture(), workflow = f.load('apps/web/lib/service-workflow.ts'); for (const fileName of ['../invoice.pdf', 'C:\\fakepath\\receipt.pdf', 'Évidence 🎸.pdf', '..', 'a'.repeat(150) + '.jpg', '<script>.png']) assert.equal(f.protocol.normalizeServiceEvidenceUpload({ ...base, fileName }).fileName, workflow.sanitizeEvidenceFilename(fileName));
  for (const [mimeType, ext] of [['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp'], ['application/pdf', 'pdf']]) { const g = fixture(); assert((await g.post({ ...base, mimeType, size: 1 })).storagePath.endsWith('.' + ext)); }
});
await test('malformed metadata and bodies never dispatch', async () => {
  for (const body of [null, [], ...[{ size: 0 }, { size: -1 }, { size: 1.5 }, { size: '100' }, { size: Number.MAX_SAFE_INTEGER }, { mimeType: 'image/svg+xml' }, { mimeType: '__proto__' }, { fileName: '' }, { fileName: 'a'.repeat(1025) }].map(p => ({ ...base, ...p }))]) { const f = fixture(); assert.equal((await f.post(body)).ok, false); assert.equal(writes(f).length, 0); }
});
await test('signed-out requests reject before body access and dependency errors stay private', async () => {
  const f = fixture({ actor: null }), req = new Request(`${app}/api/service-evidence`, { method: 'POST', body: '{}' }); req.body.getReader = () => { throw Error('Must not read'); }; assert.equal((await f.post(base, {}, req)).status, 401); assert.deepEqual(f.events.map(e => e.kind), ['auth']);
  for (const opts of [{ noClient: true }, { authThrows: true }]) { const g = fixture(opts), r = await g.post(); assert.equal(r.status, 503); assert(!JSON.stringify(r).includes('private-auth-detail')); }
});
await test('actor changes, owner and strangers cannot sign another actor upload', async () => {
  const f = fixture({ actor: stranger }); assert.equal((await f.post()).code, 'upload_actor_changed'); assert.equal(writes(f).length, 0);
  for (const actor of [owner, stranger]) { const g = fixture({ actor }); assert.equal((await g.post({ ...base, expectedActorId: actor })).status, 403); assert(!g.events.some(e => e.kind === 'sign-upload')); }
});
await test('trusted admin is server-derived and active account is required for all mutations', async () => {
  const f = fixture({ actor: stranger, admin: true }); assert.equal((await f.post({ ...base, expectedActorId: stranger })).phase, 'upload'); assert.equal(f.events.find(e => e.kind === 'prepare_service_evidence_upload').args.p_is_admin, true);
  const bad = fixture({ actor: stranger, admin: true, adminActor: provider }); assert.equal((await bad.post({ ...base, expectedActorId: stranger })).status, 403);
  for (const status of ['locked', 'banned', 'removed']) for (const body of [base, identity(), identity('discard')]) { const g = fixture({ status, admin: true }); assert.equal((await g.post(body)).status, 403); assert.equal(writes(g).length, 0); }
});
await test('multipart, cross-origin and oversized headers reject without file parsing', async () => {
  for (const headers of [{ 'content-type': 'multipart/form-data; boundary=x' }, { origin: 'https://attacker.invalid' }, { 'content-length': '16385' }]) { const f = fixture(), r = await f.post(base, headers); assert.equal(r.ok, false); assert.equal(writes(f).length, 0); }
  const f = fixture(); assert.equal((await f.post({ ...base, padding: 'x'.repeat(16384) })).status, 413);
});
await test('oversized and stalled streamed JSON is cancelled finitely without dispatch', async () => {
  for (const oversized of [true, false]) { const f = fixture({ timeout: true }); let cancelled = false, pulls = 0;
    const body = new ReadableStream({ pull(c) { pulls++; if (oversized) c.enqueue(new Uint8Array(16385)); }, cancel() { cancelled = true; } }, { highWaterMark: 0 });
    const r = await f.post(base, {}, new Request(`${app}/api/service-evidence`, { method: 'POST', headers: { 'content-type': 'application/json' }, body, duplex: 'half' })); assert.equal(r.status, oversized ? 413 : 400); assert(cancelled); assert.equal(pulls, 1); assert.equal(writes(f).length, 0);
  }
});
await test('lost preparation response retains exact original revision on retry', async () => {
  const f = fixture({ prepareLoss: true }); const lost = await f.post(); assert.equal(lost.uncertain, true); assert.equal(lost.expectedRevision, '0'); assert.equal((await f.post()).phase, 'upload'); assert.equal(f.receipts.size, 1); assert.equal(f.state.revision, '1');
});
await test('already-arrived bytes report uploaded without implicit finalization', async () => { const f = fixture(); f.arrived(); assert.equal((await f.post()).phase, 'uploaded'); assert.equal(f.tables.service_submission_evidence.length, 0); assert(!f.events.some(e => e.kind === 'commit_service_evidence_upload')); });
await test('finish calls only commit RPC, uses original revision and returns safe evidence', async () => {
  const f = fixture(); await f.post(); f.arrived(); f.events.length = 0; const r = await f.post(identity()); assert.equal(r.phase, 'committed'); assert.equal(r.committed, true); assert.equal(r.evidence.id, evidenceId); assert.equal(r.evidence.storage_path, undefined); assert.deepEqual(writes(f).map(e => e.kind), ['commit_service_evidence_upload']); assert.equal(writes(f)[0].args.p_expected_revision, '0');
});
await test('finish absent or missing bytes does not prepare, sign, or delete', async () => {
  const f = fixture(); assert.equal((await f.post(identity())).status, 404); await f.post(); f.events.length = 0; const r = await f.post(identity()); assert.equal(r.code, 'upload_not_ready'); assert.equal(r.retryable, true); assert.deepEqual(writes(f).map(e => e.kind), ['commit_service_evidence_upload']);
});
await test('prepare checks Storage size MIME path bucket and delete marker before exposing success', async () => {
  for (const patch of [{ size: 1 }, { contentType: 'image/png' }, { name: 'elsewhere' }, { bucketId: 'public-media' }, { bucketId: undefined }, { size: String(base.size) }, { isDeleteMarker: true }]) { const f = fixture(); f.arrived(undefined, patch); assert.equal((await f.post()).code, 'upload_metadata_mismatch'); assert(!f.events.some(e => e.kind === 'sign-upload' || e.kind === 'remove')); }
});
await test('Storage errors and timeouts preserve bound attempt without replacement signing', async () => {
  for (const options of [{ infoError: { status: 500, message: 'private-token' } }, { infoPending: true, timeout: true }]) { const f = fixture(options), r = await f.post(); assert.equal(r.status, 503); assert.equal(r.uncertain, true); assert.equal(r.uploadId, upload); assert(!JSON.stringify(r).includes('private-token')); assert(!f.events.some(e => e.kind === 'sign-upload')); }
});
await test('receipt identity shape metadata and state contradictions cannot reach Storage', async () => {
  for (const receiptPatch of [{ uploadId: evidenceId }, { actorId: owner }, { submissionId: evidenceId }, { expectedRevision: '1' }, { bucket: 'other' }, { storagePath: 'other' }, { metadata: { evidence_type: 'receipt', file_name: 'changed.pdf', mime_type: 'application/pdf', file_size_bytes: base.size } }, { state: 'deleted' }, { evidence: {} }, { canFinish: true }, { discardedAt: stamp }, { rawPrivateNote: 'secret' }]) { const f = fixture({ receiptPatch }); assert.equal((await f.post()).status, 503); assert(!f.events.some(e => e.kind === 'info')); }
  for (const resultPatch of [{ revision: 1 }, { revision: '01' }, { ok: false }, { secret: 'x' }]) assert.equal((await fixture({ resultPatch }).post()).status, 503);
});
await test('same UUID changed metadata or revision conflicts without replacement capability', async () => {
  const f = fixture(); await f.post(); f.events.length = 0; assert.equal((await f.post({ ...base, fileName: 'other.pdf' })).status, 409); assert.equal((await f.post({ ...base, expectedRevision: '1' })).status, 409); assert(!f.events.some(e => e.kind === 'info' || e.kind === 'sign-upload'));
});
await test('malicious signed capability URLs never leave response', async () => {
  const good = `${origin}/storage/v1/object/upload/sign/service-evidence/${fixture().storagePath}`;
  for (const signedUrl of ['https://attacker.invalid/?token=secret', good.replace('https:', 'http:') + '?token=secret', good + '?token=secret&redirect=x', good + '?token=a&token=b', good + '?token=secret#x', good.replace(provider, owner) + '?token=secret', good + '?token=', good.replace('https://', 'https://user:pass@') + '?token=secret']) { const r = await fixture({ signedUrl }).post(); assert.equal(r.code, 'signed_upload_unavailable'); assert.equal(r.signedUrl, undefined); assert(!JSON.stringify(r).includes('secret')); }
  assert.equal((await fixture({ signPath: 'unrelated' }).post()).code, 'signed_upload_unavailable');
});
await test('lost complete response is recovered read-only after closure with one attachment', async () => {
  const f = fixture({ commitLoss: true }); await f.post(); f.arrived(); assert.equal((await f.post(identity())).commitStatus, 'unknown'); f.tables.service_submissions[0].status = 'approved'; f.events.length = 0;
  const r = await f.discover('&uploadId=' + upload); assert.equal(r.requested.state, 'committed'); assert.equal(r.pendingCount, 0); assert.equal(writes(f).length, 0); assert.equal((await f.post(identity())).phase, 'committed'); assert.equal(f.tables.service_submission_evidence.length, 1);
});
await test('commit timeout is finite and preserves identity without cleanup', async () => { const f = fixture({ commitPending: true, timeout: true }); await f.post(); const r = await f.post(identity()); assert.equal(r.commitStatus, 'unknown'); assert.equal(r.expectedRevision, '0'); assert(!f.events.some(e => e.kind === 'remove')); });
await test('RPC domain codes are precise and generic ACL/serialization/dependency errors remain uncertain', async () => {
  for (const [code, status, expected] of [['SE426', 426, 'upload_upgrade_required'], ['SE403', 403, 'evidence_write_forbidden'], ['SE412', 412, 'upload_revision_changed'], ['SE428', 409, 'upload_pending'], ['SE409', 409, 'upload_deleted'], ['SE410', 409, 'upload_discarded'], ['SE404', 409, 'upload_not_ready'], ['SE422', 409, 'upload_metadata_mismatch'], ['PT409', 409, 'upload_conflict'], ['P0002', 404, 'submission_not_found'], ['22023', 400, 'invalid_upload'], ['42501', 503, 'upload_unconfirmed'], ['40001', 503, 'upload_unconfirmed'], ['SE503', 503, 'upload_unconfirmed'], ['PGRST000', 503, 'upload_unconfirmed'], ['57014', 503, 'upload_unconfirmed']]) {
    const f = fixture({ rpcError: { code, message: 'private-db-detail' } }), r = await f.post(identity()); assert.equal(r.status, status); assert.equal(r.code, expected); assert.equal(r.uncertain, status === 503); assert.equal(r.expectedRevision, '0'); assert(!JSON.stringify(r).includes('private-db-detail'));
  }
});
await test('discovery is read-only for empty prepared matching and committed states', async () => {
  const f = fixture(); assert.equal((await f.discover()).canPrepare, true); assert.equal(f.receipts.size, 0);
  await f.post(); f.events.length = 0; const pending = await f.discover(); assert.equal(pending.pending.state, 'prepared'); assert.equal(pending.pending.storageState, 'missing'); assert.equal(pending.pendingCount, 1); assert.equal(pending.canPrepare, false); assert.equal(writes(f).length, 0);
  f.arrived(); const matching = await f.discover(); assert.equal(matching.pending.canFinish, true); assert.equal(f.tables.service_submission_evidence.length, 0); assert.equal(writes(f).length, 0); assert(!JSON.stringify(matching).includes('signedUrl'));
});
await test('discovery exact lookup cannot broaden actor and rejects duplicate/extra/invalid queries', async () => {
  for (const params of ['&actorId=' + owner, '&submissionId=' + submission, '&uploadState=1', '&uploadId=invalid', '&uploadId=' + upload + '&uploadId=' + upload, '&evidenceId=' + evidenceId]) { const f = fixture(); assert.equal((await f.discover(params)).status, 400); assert(!f.events.some(e => e.kind === 'read_service_evidence_uploads')); }
  const f = fixture(); assert.equal((await f.discover('', 'invalid')).status, 400); assert.equal((await f.discover('&uploadId=' + upload)).requested, null);
  for (const actor of [owner, stranger]) { const g = fixture({ actor }); assert.equal((await g.discover()).status, 403); }
});
await test('locked account can read own pending receipt but cannot finish or discard', async () => { const f = fixture(); await f.post(); f.arrived(); f.state.status = 'locked'; const r = await f.discover(); assert.equal(r.status, 200); assert.equal(r.pending.canFinish, false); assert.equal(r.pending.canDiscard, false); assert.equal(r.canPrepare, false); });
await test('discovery rejects forged identities malformed receipts counts revisions and dependency loss', async () => {
  for (const discoveryPatch of [{ actorId: owner }, { submissionId: upload }, { revision: 1 }, { revision: '01' }, { pendingCount: -1 }, { pendingCount: 1 }, { latest: {} }, { requested: {} }, { rawToken: 'private' }]) { const f = fixture({ discoveryPatch }); assert.equal((await f.discover()).status, 503); }
  const f = fixture({ readPending: true, timeout: true }); assert.equal((await f.discover()).status, 503);
});
await test('discard missing prepare creates identity-bound terminal result without metadata or Storage', async () => {
  const f = fixture(), r = await f.post(identity('discard')); assert.equal(r.phase, 'discarded'); assert.equal(r.receipt.metadata, null); assert.equal(r.receipt.storagePath, null); assert.equal(r.revision, '1'); assert.deepEqual(writes(f).map(e => e.kind), ['discard_service_evidence_upload']); assert.equal((await f.post()).code, 'upload_discarded');
});
await test('discard prepared upload releases pending state and keeps uploaded bytes', async () => {
  const f = fixture(); await f.post(); f.arrived(); f.events.length = 0; const r = await f.post(identity('discard')); assert.equal(r.phase, 'discarded'); assert.equal(r.receipt.metadata.file_name, 'service-invoice.pdf'); assert.equal(r.revision, '2'); assert(f.objects.has(f.storagePath)); assert.deepEqual(writes(f).map(e => e.kind), ['discard_service_evidence_upload']); assert.equal((await f.discover()).canPrepare, true);
});
await test('discard already committed reports actual committed state and never deletes attached evidence', async () => {
  const f = fixture(); await f.post(); f.arrived(); await f.post(identity()); f.events.length = 0; const r = await f.post(identity('discard')); assert.equal(r.phase, 'committed'); assert.equal(r.receipt.evidence.id, evidenceId); assert.equal(f.tables.service_submission_evidence.length, 1); assert.deepEqual(writes(f).map(e => e.kind), ['discard_service_evidence_upload']);
});
await test('lost discard response is reconciled by exact read without duplicate revision', async () => {
  const f = fixture({ discardLoss: true }); assert.equal((await f.post(identity('discard'))).uncertain, true); assert.equal((await f.discover('&uploadId=' + upload)).requested.state, 'discarded'); assert.equal((await f.post(identity('discard'))).revision, '1');
});
await test('null legacy revision is accepted only by finish/discard identity and retained unchanged', async () => {
  const f = fixture(); await f.post(); f.receipts.get(upload).expectedRevision = null; f.arrived(); const r = await f.post(identity('complete', { expectedRevision: null })); assert.equal(r.phase, 'committed'); assert.equal(r.expectedRevision, null); assert.equal(f.events.filter(e => e.kind === 'commit_service_evidence_upload').at(-1).args.p_expected_revision, null); assert.equal((await fixture().post(identity('discard', { expectedRevision: null }))).status, 400);
});
await test('existing private evidence GET and delete behavior stay participant-scoped', async () => {
  const f = fixture(); await f.post(); f.arrived(); await f.post(identity()); const req = new Request(`${app}/api/service-evidence?submissionId=${submission}`); f.state.actor = stranger; assert.equal((await f.route.GET(req)).status, 403); f.state.actor = owner; const result = await (await f.route.GET(req)).json(); assert.equal(result.evidence[0].previewUrl, 'https://preview.invalid/private-token'); assert.equal(result.evidence[0].storage_path, undefined);
  f.state.actor = provider; const del = await f.route.DELETE(new Request(`${app}/api/service-evidence`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ evidenceId }) })); assert.equal(del.status, 200); assert.equal((await f.discover('&uploadId=' + upload)).requested.state, 'deleted'); assert.equal((await f.post()).code, 'upload_deleted');
});
await test('private preview failure and delete cleanup uncertainty are reported honestly', async () => {
  for (const failDelete of [true, false]) { const f = fixture({ previewError: true, ...(failDelete ? { deleteError: { code: '57014' } } : { removeError: { message: 'offline' } }) }); await f.post(); f.arrived(); await f.post(identity()); assert.equal((await f.route.GET(new Request(`${app}/api/service-evidence?submissionId=${submission}`))).status, 503); f.events.length = 0;
    const response = await f.route.DELETE(new Request(`${app}/api/service-evidence`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ evidenceId }) })), r = await response.json(); assert.equal(response.status, failDelete ? 503 : 200); if (failDelete) assert(!f.events.some(e => e.kind === 'remove')); else { assert.equal(r.committed, true); assert.equal(r.cleanupPending, true); }
  }
});
if (isMain) console.log(`Completed ${passes} service evidence v2 protocol/route cases (offline Storage/RPC mocks; SQL and real Storage acceptance are separate).`);
