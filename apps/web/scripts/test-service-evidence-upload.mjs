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
const provider = '11111111-1111-4111-8111-111111111111', owner = '22222222-2222-4222-8222-222222222222';
const stranger = '33333333-3333-4333-8333-333333333333', submission = '44444444-4444-4444-8444-444444444444';
const upload = '55555555-5555-4555-8555-555555555555', evidenceId = '66666666-6666-4666-8666-666666666666';
const origin = 'https://synthetic.supabase.co', app = 'https://app.example.test';
const base = { action: 'prepare', expectedActorId: provider, submissionId: submission, uploadId: upload, evidenceType: 'receipt', fileName: '../service invoice.pdf', mimeType: 'application/pdf', size: 15 * 1024 * 1024 };
let passes = 0;
export function fixture(options = {}) {
  const events = [], receipts = new Map(), objects = new Map();
  const tables = { service_submissions: [{ id: submission, provider_user_id: provider, owner_user_id: owner, status: 'draft' }], service_submission_evidence: [] };
  const db = createMemoryDatabase(tables), state = { actor: provider, admin: false, status: 'active', prepareLoss: false, commitLoss: false, timeout: false, ...options };
  const cache = new Map();
  const mocks = {
    'next/server': { NextResponse: { json: (value, init) => Response.json(value, init) } },
    'apps/web/lib/supabase-server.ts': { createServerSupabaseClient: () => state.noClient ? null : db, getAuthenticatedUser: async () => { events.push({ kind: 'auth' }); if (state.authThrows) throw Error('private-auth-detail'); return { user: state.actor ? { id: state.actor } : null }; }, getSupabaseEnvStatus: () => ({ supabaseUrl: origin }) },
    'apps/web/lib/admin-auth.ts': { assertAccountCanWrite: async () => ({ ok: state.status === 'active', status: 403, message: 'Account restricted' }), getAdminContext: async () => ({ ok: state.admin, user: { id: state.adminActor || state.actor } }) }
  };
  function load(relative) {
    if (mocks[relative]) return mocks[relative];
    if (cache.has(relative)) return cache.get(relative);
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
  db.rpc = async (name, args) => {
    events.push({ kind: name, args });
    if (name === 'commit_service_evidence') {
      assert.equal(args.p_action, 'delete'); if (state.deleteError) return { error: state.deleteError };
      const row = tables.service_submission_evidence.find(r => r.id === args.p_evidence.id);
      if (!row) return { error: { code: 'P0002' } };
      tables.service_submission_evidence = tables.service_submission_evidence.filter(r => r.id !== row.id);
      for (const r of receipts.values()) if (r.evidence?.id === row.id) r.deletedAt = '2026-09-18T00:00:00Z';
      return { data: row, error: null };
    }
    if (state.rpcError) return { error: state.rpcError };
    if (state.status !== 'active' || (args.p_actor_id !== provider && !args.p_is_admin)) return { error: { code: '42501' } };
    let receipt = receipts.get(args.p_upload_id);
    if (receipt?.deletedAt) return { error: { code: 'SE409' } };
    if (name === 'prepare_service_evidence_upload') {
      if (receipt && JSON.stringify(receipt.metadata) !== JSON.stringify(args.p_evidence)) return { error: { code: 'PT409' } };
      if (!receipt) {
        if (!args.p_is_admin && tables.service_submissions[0].status !== 'draft' && tables.service_submissions[0].status !== 'changes_requested') return { error: { code: 'PT409' } };
        receipt = { ok: true, uploadId: args.p_upload_id, submissionId: args.p_submission_id, actorId: args.p_actor_id, state: 'prepared', bucket: 'service-evidence', storagePath: protocol.serviceEvidenceStoragePath(args.p_submission_id, args.p_actor_id, args.p_upload_id, args.p_evidence.mime_type), metadata: args.p_evidence, evidence: null, preparedAt: '2026-09-17T00:00:00Z', committedAt: null, deletedAt: null };
        receipts.set(args.p_upload_id, receipt);
      }
      if (state.prepareLoss) { state.prepareLoss = false; throw Error('Lost prepare response'); }
    } else {
      assert.equal(name, 'commit_service_evidence_upload');
      if (state.commitPending) return new Promise(() => {});
      if (state.commitError) return { error: state.commitError };
      if (state.closeAtCommit) return { error: { code: 'PT409' } };
      if (!receipt) return { error: { code: 'P0002' } };
      if (receipt.state !== 'committed') {
        const row = { id: evidenceId, submission_id: submission, uploaded_by_user_id: args.p_actor_id, ...receipt.metadata, storage_path: receipt.storagePath, created_at: '2026-09-17T00:00:00.123456Z' };
        tables.service_submission_evidence.push(row); receipt.evidence = row; receipt.state = 'committed'; receipt.committedAt = row.created_at;
      }
      if (state.commitLoss) { state.commitLoss = false; throw Error('Lost commit response'); }
    }
    return { data: state.receiptPatch ? { ...structuredClone(receipt), ...state.receiptPatch } : structuredClone(receipt), error: null };
  };
  function arrived(p = storagePath, patch = {}) { objects.set(p, { name: p, bucketId: 'service-evidence', size: base.size, contentType: base.mimeType, ...patch }); }
  async function post(body = base, headers = {}, customRequest) {
    const req = customRequest || new Request(`${app}/api/service-evidence`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
    const response = await route.POST(req); return { status: response.status, headers: response.headers, ...await response.json() };
  }
  return { protocol, route, load, state, db, receipts, objects, events, tables, storagePath, arrived, post };
}
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
async function test(name, fn) { if (!isMain) return; await fn(); passes++; console.log('PASS ' + name); }
await test('15MiB metadata prepares durable exact path before info and signs without upsert', async () => {
  const f = fixture(), r = await f.post(); assert.equal(r.phase, 'upload'); assert.equal(r.storagePath, f.storagePath); assert.equal(r.bucket, 'service-evidence'); assert.equal(r.actorId, provider); assert.equal(r.submissionId, submission); assert.equal(r.uploadId, upload);
  assert.deepEqual(f.events.filter(e => e.kind !== 'auth').map(e => e.kind), ['prepare_service_evidence_upload', 'info', 'sign-upload']); assert.match(r.headers.get('cache-control'), /no-store/); assert(f.receipts.has(upload));
});
await test('pure normalization retains sanitizer behavior for hostile and Unicode filenames', async () => {
  const f = fixture(), workflow = f.load('apps/web/lib/service-workflow.ts');
  for (const fileName of ['../invoice.pdf', 'C:\\fakepath\\receipt.pdf', 'Évidence 🎸.pdf', '..', 'a'.repeat(150) + '.jpg', '<script>.png']) assert.equal(f.protocol.normalizeServiceEvidenceUpload({ ...base, fileName }).fileName, workflow.sanitizeEvidenceFilename(fileName));
  assert.equal(f.protocol.normalizeServiceEvidenceUpload(base).fileName, 'service-invoice.pdf');
});
await test('strict field and identity validation rejects injected actor/admin/path and malformed UUIDs', async () => {
  for (const changes of [{ actorId: stranger }, { isAdmin: true }, { storagePath: 'elsewhere' }, { uploadId: '../escape' }, { submissionId: '44444444-4444-4444-4444-444444444444' }, { evidenceType: 'unknown' }, { expectedActorId: '' }, { action: 'upload' }]) {
    const f = fixture(), r = await f.post({ ...base, ...changes }); assert.equal(r.status, 400); assert.equal(f.receipts.size, 0); assert.equal(f.events.some(e => e.kind === 'info'), false);
  }
});
await test('missing fields arrays null unsafe numbers MIME and empty filenames never dispatch', async () => {
  const missing = { ...base }; delete missing.fileName;
  for (const body of [missing, null, [], ...[{ size: 0 }, { size: -1 }, { size: 1.5 }, { size: '100' }, { size: Number.MAX_SAFE_INTEGER }, { mimeType: 'image/svg+xml' }, { mimeType: '__proto__' }, { fileName: '' }, { fileName: 'a'.repeat(1025) }].map(p => ({ ...base, ...p }))]) {
    const f = fixture(), r = await f.post(body); assert.equal(r.ok, false); assert.equal(f.receipts.size, 0);
  }
});
await test('each supported MIME gets deterministic extension and accepts nonempty boundary', async () => {
  for (const [mimeType, extension] of [['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp'], ['application/pdf', 'pdf']]) { const f = fixture(), r = await f.post({ ...base, mimeType, size: 1 }); assert.equal(r.phase, 'upload'); assert(r.storagePath.endsWith(`${upload}.${extension}`)); }
});
await test('signed out rejected before body parsing or DB inspection', async () => {
  const f = fixture({ actor: null }), req = new Request(`${app}/api/service-evidence`, { method: 'POST', body: '{}' }); req.body.getReader = () => { throw Error('Must not read'); };
  assert.equal((await f.post(base, {}, req)).status, 401); assert.deepEqual(f.events.map(e => e.kind), ['auth']);
});
await test('missing service and Auth failure return bounded safe unavailable response', async () => { for (const options of [{ noClient: true }, { authThrows: true }]) { const f = fixture(options), r = await f.post(); assert.equal(r.status, 503); assert.equal(JSON.stringify(r).includes('private-auth-detail'), false); } });
await test('actor switch never reserves or signs original actor upload', async () => { const f = fixture({ actor: stranger }), r = await f.post(); assert.equal(r.code, 'upload_actor_changed'); assert.equal(r.uploadId, upload); assert.equal(f.receipts.size, 0); });
await test('locked banned and removed accounts cannot prepare or finalize even as admin', async () => { for (const status of ['locked', 'banned', 'removed']) { const f = fixture({ status, admin: true }); f.arrived(); assert.equal((await f.post({ ...base, action: 'complete' })).status, 403); assert.equal(f.receipts.size, 0); } });
await test('owner and stranger read permissions do not confer write permission', async () => { for (const actor of [owner, stranger]) { const f = fixture({ actor }), r = await f.post({ ...base, expectedActorId: actor }); assert.equal(r.status, 403); assert.equal(f.events.some(e => e.kind === 'info' || e.kind === 'sign-upload'), false); } });
await test('verified admin flag is server derived and actor-bound', async () => { const f = fixture({ actor: stranger, admin: true }), r = await f.post({ ...base, expectedActorId: stranger }); assert.equal(r.phase, 'upload'); assert.equal(f.events.find(e => e.kind === 'prepare_service_evidence_upload').args.p_is_admin, true); const bad = fixture({ actor: stranger, admin: true, adminActor: provider }); assert.equal((await bad.post({ ...base, expectedActorId: stranger })).status, 403); });
await test('multipart rejected before body access and old upload parser never invoked', async () => { const f = fixture(); const req = new Request(`${app}/api/service-evidence`, { method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=synthetic', 'content-length': '15728640' }, body: 'not-file-bytes' }); req.formData = () => { throw Error('Must not parse'); }; req.body.getReader = () => { throw Error('Must not read'); }; const r = await f.post(base, {}, req); assert.equal(r.status, 415); assert.equal(r.code, 'direct_upload_required'); assert.equal(f.receipts.size, 0); });
await test('oversized header and actual JSON stream are rejected before RPC', async () => { for (const [body, headers] of [[base, { 'content-length': '16385' }], [{ ...base, padding: 'x'.repeat(16384) }, {}]]) { const f = fixture(); assert.equal((await f.post(body, headers)).status, 413); assert.equal(f.receipts.size, 0); } });
await test('a stream crossing size limit is cancelled without reading remainder', async () => {
  const f = fixture(); let cancelled = false, pulls = 0;
  const body = new ReadableStream({ pull(c) { pulls++; c.enqueue(new Uint8Array(16385)); }, cancel() { cancelled = true; } }, { highWaterMark: 0 });
  const r = await f.post(base, {}, new Request(`${app}/api/service-evidence`, { method: 'POST', headers: { 'content-type': 'application/json' }, body, duplex: 'half' })); assert.equal(r.status, 413); assert.equal(cancelled, true); assert.equal(pulls, 1);
});
await test('malformed JSON and stalled control reads fail finitely without dispatch', async () => {
  const f = fixture({ timeout: true }); let cancelled = false;
  for (const body of ['{', new ReadableStream({ cancel() { cancelled = true; } })]) { const req = new Request(`${app}/api/service-evidence`, { method: 'POST', headers: { 'content-type': 'application/json' }, body, ...(typeof body === 'string' ? {} : { duplex: 'half' }) }); assert.equal((await f.post(base, {}, req)).status, 400); }
  assert.equal(cancelled, true); assert.equal(f.receipts.size, 0);
});
await test('cross-origin request cannot create a receipt or obtain a capability', async () => { const f = fixture(); assert.equal((await f.post(base, { origin: 'https://attacker.invalid' })).status, 403); assert.equal(f.receipts.size, 0); assert.equal((await f.post(base, { origin: app })).phase, 'upload'); });
await test('lost prepare response safely resumes same receipt before signing', async () => { const f = fixture({ prepareLoss: true }); const lost = await f.post(); assert.equal(lost.uncertain, true); assert.equal(lost.uploadId, upload); assert.equal(f.events.some(e => e.kind === 'sign-upload'), false); assert.equal((await f.post()).phase, 'upload'); assert.equal(f.receipts.size, 1); });
await test('prepare existing verified object reports uploaded without signing or committing', async () => { const f = fixture(); f.arrived(); const r = await f.post(); assert.equal(r.phase, 'uploaded'); assert.equal(r.signedUrl, undefined); assert.equal(f.tables.service_submission_evidence.length, 0); assert.equal(f.events.some(e => e.kind === 'commit_service_evidence_upload'), false); });
await test('complete commits only after info and returns private safe evidence DTO', async () => { const f = fixture(); f.arrived(); const r = await f.post({ ...base, action: 'complete' }); assert.equal(r.phase, 'committed'); assert.equal(r.committed, true); assert.equal(r.replayed, false); assert.equal(r.evidence.id, evidenceId); assert.equal(r.evidence.createdAt, '2026-09-17T00:00:00.123456Z'); assert.equal(r.evidence.storage_path, undefined); assert.equal(r.evidence.uploaded_by_user_id, undefined); assert.deepEqual(f.events.filter(e => e.kind !== 'auth').map(e => e.kind), ['prepare_service_evidence_upload', 'info', 'commit_service_evidence_upload']); });
await test('complete missing bytes does not sign or commit and retains original ID', async () => { const f = fixture(), r = await f.post({ ...base, action: 'complete' }); assert.equal(r.code, 'upload_not_ready'); assert.equal(r.retryable, true); assert.equal(r.uncertain, false); assert.equal(r.uploadId, upload); assert.equal(f.events.some(e => e.kind === 'sign-upload' || e.kind === 'commit_service_evidence_upload'), false); });
await test('Storage size type path bucket and delete markers must all match saved metadata', async () => {
  for (const patch of [{ size: 1 }, { contentType: 'image/png' }, { name: 'elsewhere' }, { bucketId: 'public-media' }, { bucketId: undefined }, { size: String(base.size) }, { isDeleteMarker: true }]) { const f = fixture(); f.arrived(undefined, patch); const r = await f.post({ ...base, action: 'complete' }); assert.equal(r.code, 'upload_metadata_mismatch'); assert.equal(f.events.some(e => e.kind === 'commit_service_evidence_upload'), false); assert.equal(f.events.some(e => e.kind === 'remove'), false); }
});
await test('Storage outage is not mistaken for missing object and never signs replacement', async () => { const f = fixture({ infoError: { status: 500, message: 'private-bucket-token' } }), r = await f.post(); assert.equal(r.status, 503); assert.equal(r.signedUrl, undefined); assert.equal(JSON.stringify(r).includes('private-bucket-token'), false); assert.equal(f.events.some(e => e.kind === 'sign-upload'), false); });
await test('Storage timeout remains finite and keeps bound attempt', async () => { const f = fixture({ infoPending: true, timeout: true }), r = await f.post(); assert.equal(r.status, 503); assert.equal(r.uncertain, true); assert.equal(r.uploadId, upload); });
await test('wrong or incomplete DB receipts never reach Storage or claim success', async () => {
  for (const receiptPatch of [{ uploadId: evidenceId }, { actorId: owner }, { submissionId: evidenceId }, { bucket: 'other' }, { storagePath: 'other' }, { metadata: { evidence_type: 'receipt', file_name: 'changed.pdf', mime_type: 'application/pdf', file_size_bytes: base.size } }, { state: 'deleted' }, { evidence: {} }, { ok: false }]) { const f = fixture({ receiptPatch }); const r = await f.post(); assert.equal(r.status, 503); assert.equal(f.events.some(e => e.kind === 'info'), false); }
});
await test('same UUID with changed metadata rejects before object lookup or another signature', async () => { const f = fixture(); await f.post(); f.events.length = 0; const r = await f.post({ ...base, fileName: 'other.pdf' }); assert.equal(r.status, 409); assert.equal(f.events.some(e => e.kind === 'info'), false); assert.equal(f.receipts.size, 1); });
await test('committed receipt cannot return evidence from another actor or submission or a deleted receipt', async () => {
  for (const changed of [{ submission_id: evidenceId }, { uploaded_by_user_id: owner }]) {
    const f = fixture(); f.arrived(); await f.post({ ...base, action: 'complete' }); f.receipts.get(upload).evidence = { ...f.receipts.get(upload).evidence, ...changed };
    assert.equal((await f.post()).status, 503);
  }
  const f = fixture(); f.arrived(); await f.post({ ...base, action: 'complete' }); f.state.receiptPatch = { deletedAt: '2026-09-18T00:00:00Z' }; assert.equal((await f.post()).status, 503);
});
await test('malicious signed URLs and paths never leave the response', async () => {
  const good = `${origin}/storage/v1/object/upload/sign/service-evidence/${fixture().storagePath}`;
  for (const signedUrl of ['https://attacker.invalid/?token=secret', good.replace('https:', 'http:') + '?token=secret', good + '?token=secret&redirect=x', good + '?token=a&token=b', good + '?token=secret#x', good.replace(provider, owner) + '?token=secret', good + '?token=', good.replace('https://', 'https://user:pass@') + '?token=secret']) { const f = fixture({ signedUrl }), r = await f.post(); assert.equal(r.code, 'signed_upload_unavailable'); assert.equal(r.signedUrl, undefined); assert.equal(JSON.stringify(r).includes('secret'), false); }
  const f = fixture({ signPath: 'unrelated' }); assert.equal((await f.post()).code, 'signed_upload_unavailable');
});
await test('lost complete response returns uncertainty without cleanup then replays exactly one row', async () => { const f = fixture({ commitLoss: true }); f.arrived(); const first = await f.post({ ...base, action: 'complete' }); assert.equal(first.status, 503); assert.equal(first.commitStatus, 'unknown'); assert.equal(first.uploadId, upload); const r = await f.post(); assert.equal(r.phase, 'committed'); assert.equal(r.replayed, true); assert.equal(f.tables.service_submission_evidence.length, 1); assert.equal(f.events.some(e => e.kind === 'remove' || e.kind === 'sign-upload'), false); });
await test('committed replay works after submission closure without more Storage requests', async () => { const f = fixture(); f.arrived(); await f.post({ ...base, action: 'complete' }); f.tables.service_submissions[0].status = 'approved'; f.events.length = 0; const r = await f.post({ ...base, action: 'complete' }); assert.equal(r.replayed, true); assert.equal(f.events.some(e => e.kind === 'info' || e.kind === 'commit_service_evidence_upload'), false); });
await test('uncommitted closed submission and close-at-commit reject without deleting bytes', async () => { const f = fixture(); f.tables.service_submissions[0].status = 'submitted'; assert.equal((await f.post()).status, 409); const g = fixture({ closeAtCommit: true }); g.arrived(); assert.equal((await g.post({ ...base, action: 'complete' })).status, 409); assert.equal(g.events.some(e => e.kind === 'remove'), false); });
await test('commit timeout preserves uncertainty and never deletes potentially committed bytes', async () => { const f = fixture({ commitPending: true, timeout: true }); f.arrived(); const r = await f.post({ ...base, action: 'complete' }); assert.equal(r.commitStatus, 'unknown'); assert.equal(r.uploadId, upload); assert.equal(f.events.some(e => e.kind === 'remove'), false); });
await test('domain rejections have specific retry semantics and unknown DB errors remain unknown', async () => {
  for (const [code, status, retryable, uncertain] of [['SE409', 409, false, false], ['SE404', 409, true, false], ['SE422', 409, false, false], ['PT409', 409, false, false], ['42501', 403, false, false], ['P0002', 404, false, false], ['22023', 400, false, false], ['PGRST000', 503, true, true], ['57014', 503, true, true], ['', 503, true, true]]) {
    const f = fixture({ commitError: { code, message: 'private-db-detail' } }); f.arrived(); const r = await f.post({ ...base, action: 'complete' }); assert.equal(r.status, status); assert.equal(r.retryable, retryable); assert.equal(r.uncertain, uncertain); assert.equal(r.uploadId, upload); assert.equal(JSON.stringify(r).includes('private-db-detail'), false); assert.equal(f.events.some(e => e.kind === 'remove'), false);
  }
});
await test('deleted evidence tombstone prevents same upload identity resurrection', async () => { const f = fixture(); f.arrived(); await f.post({ ...base, action: 'complete' }); const del = await f.route.DELETE(new Request(`${app}/api/service-evidence`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ evidenceId }) })); assert.equal(del.status, 200); f.events.length = 0; const r = await f.post(); assert.equal(r.code, 'upload_deleted'); assert.equal(r.status, 409); assert.equal(f.tables.service_submission_evidence.length, 0); assert.equal(f.events.some(e => e.kind === 'sign-upload' || e.kind === 'info'), false); });
await test('GET retains private participants-only behavior and safe signed DTO', async () => { const f = fixture(); f.arrived(); await f.post({ ...base, action: 'complete' }); const req = new Request(`${app}/api/service-evidence?submissionId=${submission}`); f.state.actor = stranger; assert.equal((await f.route.GET(req)).status, 403); f.state.actor = owner; const response = await f.route.GET(req), result = await response.json(); assert.equal(result.evidence[0].previewUrl, 'https://preview.invalid/private-token'); assert.equal(result.evidence[0].storage_path, undefined); assert.match(response.headers.get('cache-control'), /no-store/); });
await test('GET preview failure remains unavailable instead of a blank successful preview', async () => { const f = fixture({ previewError: true }); f.arrived(); await f.post({ ...base, action: 'complete' }); assert.equal((await f.route.GET(new Request(`${app}/api/service-evidence?submissionId=${submission}`))).status, 503); });
await test('DELETE DB rejection precedes Storage and cleanup failure is reported honestly', async () => {
  for (const rejected of [true, false]) { const f = fixture(rejected ? { deleteError: { code: '57014' } } : { removeError: { message: 'offline' } }); f.arrived(); await f.post({ ...base, action: 'complete' }); f.events.length = 0; const response = await f.route.DELETE(new Request(`${app}/api/service-evidence`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ evidenceId }) })); const r = await response.json(); assert.equal(response.status, rejected ? 503 : 200); if (rejected) assert.equal(f.events.some(e => e.kind === 'remove'), false); else { assert.equal(r.committed, true); assert.equal(r.cleanupPending, true); assert(f.events.findIndex(e => e.kind === 'commit_service_evidence') < f.events.findIndex(e => e.kind === 'remove')); } }
});
if (isMain) console.log(`Completed ${passes} service evidence direct-upload protocol/route cases (offline Storage/RPC mocks; SQL suite is separate).`);
