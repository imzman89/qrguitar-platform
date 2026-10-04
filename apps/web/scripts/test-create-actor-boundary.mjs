import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import test from 'node:test';
const require = createRequire(import.meta.url), ts = require('typescript');
function saleModule(file) {
  if (file instanceof URL) file = fileURLToPath(file);
  const module = { exports: {} };
  const source = fs.readFileSync(file, 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  new Function('require', 'module', 'exports', js)(name => name.startsWith('.') ? saleModule(path.resolve(path.dirname(file), `${name}.ts`)) : require(name), module, module.exports);
  return module.exports;
}
const { profileSaleFieldsError } = saleModule(new URL('../lib/profile-sale.ts', import.meta.url));
const source = fs.readFileSync(new URL('../app/create/page.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('create.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), functions = new Map();
function visit(n) { if (ts.isFunctionDeclaration(n) && n.name) functions.set(n.name.text, n.getText(ast)); ts.forEachChild(n, visit); } visit(ast);
function compile(name, env) {
  const js = ts.transpileModule(functions.get(name).replace(/^export default /, ''), { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  return new Function(...Object.keys(env), js + ';return ' + name)(...Object.values(env));
}
const session = id => id ? { user: { id, email: id + '@example.invalid' }, access_token: 'synthetic-' + id } : null;
const tick = () => new Promise(resolve => setImmediate(resolve));
function identityFixture(options = {}) {
  const states = [], effects = [], listeners = new Set(); let cursor = 0, actor = 'a', tree;
  const timers = new Map(); let timerId = 0;
  const auth = { getSession: async () => options.read ? options.read() : ({ data: { session: session(actor) }, error: null }), onAuthStateChange: fn => { listeners.add(fn); return { data: { subscription: { unsubscribe: () => listeners.delete(fn) } } }; } };
  const env = { setTimeout: (fn, ms) => { assert.equal(ms, 5000); timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id), useRef: value => states[cursor++] ||= { current: value }, useState: value => { const i = cursor++; if (!(i in states)) states[i] = value; return [states[i], next => { states[i] = next; }]; }, useEffect: fn => { if (!effects.length) effects.push(fn); }, createBrowserSupabaseClient: () => ({ auth }), CreateOwnerDraft: 'owner-draft', React: { createElement: (type, props) => ({ type, props }) } };
  const renderParent = compile('CreatePage', env); let cleanup;
  const render = () => { cursor = 0; tree = renderParent(); return tree; };
  render(); cleanup = effects[0]();
  return { render, timeout: () => { for (const fn of [...timers.values()]) fn(); }, event: id => { actor = id; for (const fn of listeners) fn(id ? 'SIGNED_IN' : 'SIGNED_OUT', session(id)); }, dispose: () => cleanup() };
}
test('hung initial session uses existing auth gate after bounded five-second fallback', () => { const f = identityFixture({ read: () => new Promise(() => {}) }); assert.equal(f.render().props.authChecked, false); f.timeout(); const after = f.render(); assert.equal(after.props.authChecked, true); assert.equal(after.props.user, null); f.dispose(); });
test('auth event outranks late initial session and cancels fallback without resetting same-owner work', async () => { let resolve; const pending = new Promise(r => { resolve = r; }); const f = identityFixture({ read: () => pending }); f.event('b'); const before = f.render(); resolve({ data: { session: session('a') }, error: null }); await tick(); f.timeout(); const after = f.render(); assert.equal(after.props.user.id, 'b'); assert.equal(after.props.key, before.props.key); assert.equal(before.props.isCurrent(), true); f.dispose(); });
for (const actors of [['b'], ['', 'a'], ['b', 'a']]) test('actual parent fences pre-render stale draft and remounts after ' + actors.join('→'), async () => {
  const f = identityFixture(); await tick(); const before = f.render(); assert.equal(before.props.user.id, 'a');
  actors.forEach(f.event); assert.equal(before.props.isCurrent(), false);
  const after = f.render(); assert.notEqual(after.props.key, before.props.key); assert.equal(after.props.user?.id || '', actors.at(-1));
  f.dispose(); assert.equal(after.props.isCurrent(), false);
});
test('same actor token refresh preserves draft key and lease', async () => { const f = identityFixture(); await tick(); const before = f.render(); f.event('a'); const after = f.render(); assert.equal(after.props.key, before.props.key); assert.equal(before.props.isCurrent(), true); f.dispose(); });
function submitFixture(options = {}) {
  let current = true, actor = options.actor || 'a'; const requests = [], writes = [];
  const form = new Proxy({ brand: 'Fender', model: 'Fixture', serial: 'FIXTURE', instrumentType: 'Guitar', owner: 'Private A', summary: 'Retained private draft', heroImageDataUrl: 'photo', visibility: 'private', saleStatus: options.saleStatus || '' }, { get: (o,k) => o[k] ?? '' });
  const env = { isCurrent: () => current, user: session('a').user, savingProfile: false, saveInFlight: { current: false }, fileSelectionPending: { current: false }, honeypot: '', form, galleryImages: ['photo'], documents: [], customFields: options.fields || [], customLinks: options.links || [], profileSaleFieldsError, document: { getElementById: () => ({ scrollIntoView() {} }) }, uploadId: 'original-upload', idempotencyKey: 'original-request', ui: (_k, text) => text, focusFirstError() {}, clearStagedPathsAfterServerCleanup() {}, stageSelectedFiles: async () => { options.stage?.(() => { current = false; }); return { photoPaths: ['a/photo.jpg'], documentPaths: [] }; }, createBrowserSupabaseClient: () => ({ auth: { getSession: async () => ({ data: { session: session(actor) }, error: options.error || null }) } }), fetch: async (url, init) => { requests.push({ url, init }); return options.response || { ok: false, status: 400, json: async () => ({ ok: false, retryable: true, message: 'Recoverable failure' }) }; } };
  for (const name of ['setFieldErrors','setSavingProfile','setMessage','setBillingHelp','setLastErrorRetryable','setExistingProfileHref','setClaimHref','setQrCode','setCreatedCode']) env[name] = value => writes.push({ name, value });
  env.tokenForDraftOwner = compile('tokenForDraftOwner', env);
  return { submit: compile('createRecordAndRedirect', env), invalidate: () => { current = false; }, requests, writes, form };
}
test('fresh B session blocks actual A submit even without auth event delivery', async () => { const f = submitFixture({ actor: 'b' }); await f.submit(); assert.equal(f.requests.length, 0); assert.equal(f.form.summary, 'Retained private draft'); });
test('same-owner failed request preserves payload identities, private fields and retryability', async () => { const f = submitFixture(); await f.submit(); assert.equal(f.requests.length, 1); const body = JSON.parse(f.requests[0].init.body); assert.equal(body.idempotencyKey, 'original-request'); assert.equal(body.uploadId, 'original-upload'); assert.equal(body.summary, f.form.summary); assert.ok(f.writes.some(w => w.name === 'setLastErrorRetryable' && w.value === true)); });
test('auth lookup error sends zero requests and retains same-owner work', async () => { const f = submitFixture({ error: Error('synthetic session lookup') }); await f.submit(); assert.equal(f.requests.length, 0); assert.equal(f.form.summary, 'Retained private draft'); });
test('stale rendered submit is completely inert', async () => { const f = submitFixture(); f.invalidate(); await f.submit(); assert.equal(f.requests.length, 0); assert.equal(f.writes.length, 0); });
test('actor change during staging starts no final POST', async () => { const f = submitFixture({ stage: invalidate => invalidate() }); await f.submit(); assert.equal(f.requests.length, 0); assert.equal(f.writes.filter(w => w.name === 'setSavingProfile').length, 1); });
test('late response after account change cannot write success or failure into the new draft', async () => { let resolve; const response = new Promise(r => { resolve = r; }); const f = submitFixture({ response }); const pending = f.submit(); await tick(); const before = f.writes.length; f.invalidate(); resolve({ ok: true, json: async () => ({ ok: true, qrCode: 'synthetic-result' }) }); await pending; assert.equal(f.writes.length, before); });

test('actual Create handler blocks an incomplete sale price before any upload or write', async () => {
  const fields = [{ label: 'Asking price', value: '2500.00' }];
  const f = submitFixture({ saleStatus: 'for_sale', fields });
  await f.submit();
  assert.equal(f.requests.length, 0);
  assert.ok(f.writes.some((w) => w.name === 'setMessage' && /currency/.test(w.value)));
  assert.equal(fields[0].value, '2500.00');
});

test('actual Create handler serializes valid sale details with the guarded original request', async () => {
  const fields = [{ label: 'Asking price', value: '2500.00' }, { label: 'Currency', value: 'USD' }];
  const links = [{ label: 'Shop', url: 'https://store.example/product/exact-instrument' }];
  const f = submitFixture({ saleStatus: 'for_sale', fields, links });
  await f.submit();
  assert.equal(f.requests.length, 1);
  const body = JSON.parse(f.requests[0].init.body);
  assert.deepEqual(body.customLinks, links);
  assert.ok(body.customFields.some((field) => field.label === 'Asking price' && field.value === '2500.00'));
  assert.ok(body.customFields.some((field) => field.label === 'Currency' && field.value === 'USD'));
  assert.equal(body.idempotencyKey, 'original-request');
});
