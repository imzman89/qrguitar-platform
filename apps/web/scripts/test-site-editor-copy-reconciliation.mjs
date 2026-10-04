import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const base = process.argv.find(value => value.startsWith('--base='))?.slice(7) || process.cwd();
const overlay = process.argv.find(value => value.startsWith('--overlay='))?.slice(10) || base;
const require = createRequire(path.join(base, 'package.json'));
const ts = require('typescript');
const sourceFile = relative => fs.existsSync(path.join(overlay, relative)) ? path.join(overlay, relative) : path.join(base, relative);
const clone = value => JSON.parse(JSON.stringify(value));
const results = [];
const state = { raw: null, receipts: new Map(), calls: [], writes: 0, auth: true, readFailure: false };
const actor = '11111111-1111-1111-1111-111111111111';
const applyId = '22222222-2222-2222-2222-222222222222';
const rollbackId = '33333333-3333-3333-3333-333333333333';
const cache = new Map();
let helper, settingsModule, pairModule;
function load(relative) {
  if (cache.has(relative)) return cache.get(relative).exports;
  const module = { exports: {} }; cache.set(relative, module);
  const originalRoute = relative.endsWith('#preimage');
  const realRelative = originalRoute ? relative.slice(0, -9) : relative;
  const compiled = ts.transpileModule(fs.readFileSync(originalRoute ? path.join(base, realRelative) : sourceFile(realRelative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const importSource = specifier => {
    if (specifier === 'node:crypto') return require('node:crypto');
    if (specifier === 'lucide-react') return new Proxy({}, { get: () => function Icon() {} });
    if (specifier === 'next/cache') return { unstable_noStore() {}, revalidatePath() { state.calls.push('cache-revalidation'); } };
    if (specifier === 'next/server') return { NextResponse: { json: (body, options = {}) => new Response(JSON.stringify(body), { status: options.status || 200, headers: options.headers }) } };
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(realRelative), specifier + '.ts'));
    if (resolved === 'apps/web/lib/admin-auth.ts') return { readAdminEmailList: () => [], getAdminContext: async () => state.auth
      ? { ok: true, user: { id: actor }, email: 'synthetic-admin@example.invalid' }
      : { ok: false, status: 403, message: 'Unauthorized' } };
    if (resolved === 'apps/web/lib/supabase-server.ts') return { createServerSupabaseClientWithTimeout: () => fakeClient };
    assert.ok(specifier.startsWith('.'), 'Unapproved source import: ' + specifier);
    return load(resolved);
  };
  const execute = new vm.Script('(function(require,module,exports){' + compiled + '\n})', { filename: relative })
    .runInThisContext({ timeout: 10000 });
  execute(importSource, module, module.exports);
  return module.exports;
}
const fakeClient = {
  from(table) {
    assert.equal(table, 'site_editor_receipts'); const query = {};
    const chain = { select() { return chain; }, eq(key, value) { query[key] = value; return chain; },
      async maybeSingle() {
        state.calls.push('receipt:' + query.request_id); assert.equal(query.actor_user_id, actor);
        return state.readFailure ? { error: { code: 'synthetic' }, data: null } : { error: null, data: state.receipts.get(query.request_id) || null };
      } };
    return chain;
  },
  async rpc(name, parameters) {
    state.calls.push(name);
    if (name === 'read_site_editor_state') return { error: null, data: clone(state.raw) };
    assert.equal(name, 'mutate_site_editor');
    assert.equal(parameters.p_actor_id, actor);
    const body = parameters.p_request;
    const prior = state.receipts.get(body.requestId);
    if (prior) {
      if (helper.canonicalRawCopy(prior.request_body) !== helper.canonicalRawCopy(body)) return { error: { code: 'QSE02' } };
      return { error: null, data: { ...clone(prior.result), replayed: true,
        superseded: state.raw.publishedVersion !== prior.result.state.publishedVersion } };
    }
    if (body.expectedPublishedVersion !== state.raw.publishedVersion || body.expectedDraftVersion !== state.raw.draftVersion) {
      assert.equal(parameters.p_settings, null); return { error: { code: 'QSE01' } };
    }
    assert.ok(parameters.p_settings); state.writes++;
    const before = clone(state.raw.publishedValue);
    state.raw = { ...state.raw, publishedValue: clone(parameters.p_settings), publishedVersion: 'synthetic-v' + (state.writes + 1) };
    const result = { state: clone(state.raw), before, changedFields: ['content'], action: 'publish', requestId: body.requestId, replayed: false, superseded: false };
    state.receipts.set(body.requestId, { request_body: clone(body), result: clone(result) });
    return { error: null, data: result };
  }
};
helper = load('apps/web/lib/site-editor-copy-reconciliation.ts');
pairModule = load('apps/web/lib/site-copy-reconciliation-pairs.ts');
settingsModule = load('apps/web/lib/site-settings.ts');
const route = load('apps/web/app/api/site-editor/route.ts');
const preimageRoute = load('apps/web/app/api/site-editor/route.ts#preimage');
const pair = pairModule.approvedCopyPairs.find(pair => pair.selector.key === 'create.hero.body');
function reset() {
  const raw = clone(settingsModule.mergeSiteSettings({}));
  raw.content[pair.selector.key] = pair.beforeDefault;
  raw.content['unknown.saved.key'] = 'Keep service records verbatim';
  raw.extraMetadata = { username: 'Custom Name', bio: 'service records', specs: ['Custom spec'] };
  state.raw = { publishedValue: raw, publishedVersion: 'synthetic-v1', draftValue: null, draftVersion: '', revisionRows: [] };
  state.receipts = new Map(); state.calls = []; state.writes = 0; state.auth = true; state.readFailure = false;
}
function body(overrides = {}) {
  const candidate = helper.buildApprovedRawCopyCandidate(state.raw.publishedValue).candidate;
  return { source: helper.localCopyReconciliationSource, action: 'publish', copyDirection: 'apply', expectedActorId: actor,
    expectedPublishedVersion: state.raw.publishedVersion, expectedDraftVersion: '', requestId: applyId,
    allowlistSha256: pairModule.approvedCopyAllowlistSha256, beforePublishedSha256: helper.rawCopySha256(state.raw.publishedValue),
    settings: clone(candidate), ...overrides };
}
async function submit(payload, origin = helper.acceptedCopyPracticeOrigin, selectedRoute = route) {
  const response = await selectedRoute.PUT(new Request(helper.acceptedCopyPracticeOrigin + '/api/site-editor', {
    method: 'PUT', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  }));
  return { status: response.status, result: await response.json() };
}
async function test(name, run) {
  reset();
  try { await run(); results.push({ name, status: 'PASS' }); }
  catch (error) { results.push({ name, status: 'FAIL', message: error.message }); }
}
const envNames = ['QRG_LOCAL_COPY_RECONCILIATION', 'QRG_LOCAL_PRACTICE_ORIGIN'];
const savedEnv = Object.fromEntries(envNames.map(key => [key, process.env[key]]));
try {
  process.env.QRG_LOCAL_COPY_RECONCILIATION = '1'; process.env.QRG_LOCAL_PRACTICE_ORIGIN = helper.acceptedCopyPracticeOrigin;
  await test('Exactly 74 static pairs, five renderer exceptions, no retired/protected imports', () => {
    assert.equal(pairModule.approvedCopyPairs.length, 74); assert.equal(Object.keys(pairModule.approvedExactCopyAfterValues).length, 5);
    assert.ok(!pairModule.approvedCopyPairs.some(pair => ['ui.app.contact.page.draftIntro', 'ui.app.contact.page.draftPrepared'].includes(pair.selector.key)));
  });
  await test('Five exact approved after values survive actual staged normalizer; custom text stays custom', () => {
    for (const [key, value] of Object.entries(pairModule.approvedExactCopyAfterValues)) {
      assert.equal(settingsModule.mergeSiteSettings({ content: { [key]: value } }).content[key], value);
      assert.equal(settingsModule.mergeSiteSettings({ content: { [key]: 'Custom caption' } }).content[key], 'Custom caption');
    }
  });
  await test('Pure candidate changes only exact defaults, preserving unknown/user/prices/SEO', () => {
    const before = clone(state.raw.publishedValue); const prepared = helper.buildApprovedRawCopyCandidate(before);
    assert.deepEqual(prepared.changedIds, [pair.id]);
    assert.equal(prepared.candidate.content['unknown.saved.key'], before.content['unknown.saved.key']);
    assert.deepEqual(prepared.candidate.extraMetadata, before.extraMetadata);
    assert.deepEqual(prepared.candidate.seo, before.seo); assert.deepEqual(prepared.candidate.sections, before.sections);
  });
  await test('Preimage API full-normalization binding loses unknown raw copy (offline simulation)', async () => {
    const response = await submit(body(), helper.acceptedCopyPracticeOrigin, preimageRoute);
    assert.equal(response.status, 200); assert.equal(state.writes, 1);
    assert.equal(state.raw.publishedValue.content['unknown.saved.key'], undefined);
    assert.equal(state.raw.publishedValue.extraMetadata.bio, 'service history');
  });
  await test('Actual staged API derives candidate server-side and passes RAW values to atomic RPC', async () => {
    const before = clone(state.raw.publishedValue); const payload = body(); const response = await submit(payload);
    assert.equal(response.status, 200); assert.equal(response.result.committed, true); assert.equal(state.writes, 1);
    assert.equal(state.raw.publishedValue.content['unknown.saved.key'], before.content['unknown.saved.key']);
    assert.deepEqual(state.raw.publishedValue.extraMetadata, before.extraMetadata);
    assert.deepEqual(state.calls.slice(0, 2), ['receipt:' + applyId, 'read_site_editor_state']);
    assert.ok(state.calls.includes('cache-revalidation'));
  });
  await test('Receipt replay precedes any current-state read even after superseding change', async () => {
    const payload = body(); await submit(payload); state.raw.publishedVersion = 'newer-version'; state.raw.publishedValue.extraMetadata.bio = 'Newer biography';
    state.calls = []; const response = await submit(payload);
    assert.equal(response.status, 200); assert.equal(response.result.replayed, true); assert.equal(response.result.superseded, true);
    assert.equal(state.writes, 1); assert.ok(!state.calls.includes('read_site_editor_state'));
    assert.deepEqual(state.calls.slice(0, 2), ['receipt:' + applyId, 'mutate_site_editor']);
  });
  await test('Request ID/body collision still reaches atomic collision rejection', async () => {
    const payload = body(); await submit(payload); state.calls = [];
    const response = await submit({ ...payload, note: 'Different immutable body' });
    assert.equal(response.status, 409); assert.equal(response.result.code, 'QSE02'); assert.equal(state.writes, 1);
    assert.ok(!state.calls.includes('read_site_editor_state'));
  });
  await test('Stale state uses null candidate and atomic conflict, never recomputed write', async () => {
    const payload = body(); state.raw.publishedVersion = 'newer-version'; const response = await submit(payload);
    assert.equal(response.status, 409); assert.equal(response.result.code, 'QSE01'); assert.equal(state.writes, 0);
  });
  await test('Shared draft is not overwritten or discarded', async () => {
    const payload = body(); state.raw.draftVersion = 'shared'; state.raw.draftValue = { settings: { content: {} } };
    const response = await submit(payload); assert.equal(response.status, 409); assert.equal(state.writes, 0); assert.equal(state.raw.draftVersion, 'shared');
  });
  await test('Arbitrary unrelated candidate rejected before mutation', async () => {
    const payload = body(); payload.settings.seo.title = 'Unrelated title'; const response = await submit(payload);
    assert.equal(response.status, 400); assert.equal(state.writes, 0);
  });
  await test('Unapproved digest, raw preimage hash, or custom default replacement rejected', async () => {
    for (const changes of [{ allowlistSha256: 'other' }, { beforePublishedSha256: 'other' }]) {
      assert.equal((await submit(body(changes))).status, 400); assert.equal(state.writes, 0);
    }
    state.raw.publishedValue.content[pair.selector.key] = 'Custom wording';
    const payload = body(); payload.settings.content[pair.selector.key] = pair.afterDefault;
    assert.equal((await submit(payload)).status, 400); assert.equal(state.writes, 0);
  });
  await test('Rollback uses trusted original receipt and exact inverse only', async () => {
    const original = clone(state.raw.publishedValue); await submit(body());
    const payload = body({ copyDirection: 'rollback', requestId: rollbackId, appliedRequestId: applyId, settings: original });
    const response = await submit(payload); assert.equal(response.status, 200); assert.equal(state.writes, 2);
    assert.deepEqual(state.raw.publishedValue, original);
  });
  await test('Rollback refuses concurrent edit or forged original receipt', async () => {
    const original = clone(state.raw.publishedValue); await submit(body()); state.raw.publishedValue.extraMetadata.bio = 'Concurrent';
    const response = await submit(body({ copyDirection: 'rollback', requestId: rollbackId, appliedRequestId: applyId, settings: original }));
    assert.equal(response.status, 400); assert.equal(state.writes, 1);
  });
  await test('Auth/actor checks remain ahead of receipt access', async () => {
    const payload = body(); state.auth = false; assert.equal((await submit(payload)).status, 403); assert.deepEqual(state.calls, []);
    state.auth = true; assert.equal((await submit({ ...payload, expectedActorId: 'other' })).status, 403); assert.deepEqual(state.calls, []);
  });
  await test('Local source branch disabled by default and rejects wrong practice origin', async () => {
    delete process.env.QRG_LOCAL_COPY_RECONCILIATION;
    assert.equal((await submit(body())).status, 403); assert.deepEqual(state.calls, []);
    process.env.QRG_LOCAL_COPY_RECONCILIATION = '1';
    assert.equal((await submit(body(), 'http://127.0.0.1:3004')).status, 403); assert.deepEqual(state.calls, []);
  });
  await test('Correct Origin header cannot authorize a production or alternate backend target', () => {
    const environment = { QRG_LOCAL_COPY_RECONCILIATION: '1', QRG_LOCAL_PRACTICE_ORIGIN: helper.acceptedCopyPracticeOrigin };
    for (const url of ['https://www.qrguitar.com/api/site-editor', 'http://127.0.0.1:3004/api/site-editor', 'https://localhost:55441/api/site-editor']) {
      assert.equal(helper.allowLocalCopyReconciliation(new Request(url, { headers: { Origin: helper.acceptedCopyPracticeOrigin } }), environment), false);
    }
  });
  await test('Receipt-read failure keeps uncertain outcome and never mutates', async () => {
    state.readFailure = true; const response = await submit(body()); assert.equal(response.status, 503); assert.equal(response.result.uncertain, true); assert.equal(state.writes, 0);
  });
  await test('Missing raw copy never seeds content defaults or retired keys', () => {
    assert.deepEqual(helper.buildApprovedRawCopyCandidate({ content: {} }).candidate, { content: {} });
    assert.throws(() => helper.buildApprovedRawCopyCandidate({ hero: {} }), /raw content object/);
  });
} finally {
  for (const key of envNames) if (savedEnv[key] === undefined) delete process.env[key]; else process.env[key] = savedEnv[key];
}
const receipt = { scope: 'SOURCE-ONLY ACTUAL STAGED MODULES WITH OFFLINE AUTH/RPC RECEIPT STUBS; no DB, runtime, browser, saved settings, provider or production access',
  tests: results, passed: results.filter(item => item.status === 'PASS').length, failed: results.filter(item => item.status === 'FAIL').length,
  noNativeOrPersistenceAcceptance: true };
const receiptPath = process.argv.find(value => value.startsWith('--receipt='))?.slice(10);
if (receiptPath) fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ passed: receipt.passed, failed: receipt.failed, failures: results.filter(item => item.status === 'FAIL'), sourceOnly: true }));
process.exitCode = receipt.failed ? 1 : 0;
