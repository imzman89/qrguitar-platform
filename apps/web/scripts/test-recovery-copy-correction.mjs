import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const require = createRequire(path.join(repo, 'package.json')), ts = require('typescript');
const { PGlite } = require('@electric-sql/pglite-pg17');
const { installRepositorySchema } = await import(pathToFileURL(path.join(repo, 'apps/web/scripts/security/postgres-fixture.mjs')));
const db = new PGlite();
const actor = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222';
function loader(overrides = {}, globals = {}) {
  const cache = new Map();
  function load(relative) {
    const file = path.join(repo, relative);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    new Function('require', 'module', 'exports', ...Object.keys(globals), output)(name => {
      if (Object.hasOwn(overrides, name)) return overrides[name];
      if (name.endsWith('.module.css')) return { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) };
      if (!name.startsWith('.')) return require(name);
      const resolved = path.resolve(path.dirname(file), name);
      return load(path.relative(repo, resolved) + (path.extname(resolved) ? '' : fs.existsSync(resolved + '.ts') ? '.ts' : '.tsx'));
    }, module, module.exports, ...Object.values(globals));
    return module.exports;
  }
  return load;
}
const real = loader();
const helper = real('apps/web/lib/site-editor-recovery-copy.ts');
const editorClient = real('apps/web/lib/site-editor-client.ts');
const key = helper.RECOVERY_COPY_KEY, approved = helper.RECOVERY_COPY_VALUE;
const baseline = JSON.parse('{"brandName":"  untouched name  ","content":{"resetPassword.hero.body":"Enter your email to reset your password.","legacy.unregistered":{"keep":[null,7," text "]}},"colors":{"background":"legacy-saved-color"},"unknown":{"__proto__":{"preserve":true},"nested":[false,null,1.25]},"brandLogos":null}');
const state = async () => (await db.query('select read_site_editor_state() as state')).rows[0].state;
const snapshot = async () => (await db.query("select jsonb_build_object('content',(select jsonb_agg(to_jsonb(s) order by content_key) from site_content s),'audit',(select jsonb_agg(to_jsonb(a) order by id) from admin_audit_events a),'receipts',(select jsonb_agg(to_jsonb(r) order by request_id) from site_editor_receipts r)) as snapshot")).rows[0].snapshot;
let adminActor = actor, denied = 0, beforeMutation = null, loseResponse = false, reads = 0, writes = 0, lastSettings;
async function mutateRaw(request, settings) {
  return (await db.query('select mutate_site_editor($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb) as result', [actor, 'synthetic-admin@example.test', false, request, settings, {}, null])).rows[0].result;
}
async function normalRequest(action, settings) {
  const s = await state();
  return mutateRaw({ action, expectedActorId: actor, requestId: randomUUID(), expectedPublishedVersion: s.publishedVersion, expectedDraftVersion: s.draftVersion }, settings);
}
const client = {
  async rpc(name, args) {
    if (name === 'read_site_editor_state') { reads++; return { data: await state(), error: null }; }
    assert.equal(name, 'mutate_site_editor'); writes++; lastSettings = args.p_settings;
    if (beforeMutation) { const hook = beforeMutation; beforeMutation = null; await hook(); }
    let result;
    try { result = await mutateRaw(args.p_request, args.p_settings); }
    catch (error) { return { data: null, error: { code: error.code } }; }
    if (loseResponse) { loseResponse = false; throw Error('Synthetic response loss after commit'); }
    return { data: result, error: null };
  },
  from(table) {
    assert.equal(table, 'site_editor_receipts'); const filters = {};
    return { select() { return this; }, eq(column, value) { filters[column] = value; return this; }, async maybeSingle() {
      const result = await db.query('select request_body,result from site_editor_receipts where actor_user_id=$1 and request_id=$2', [filters.actor_user_id, filters.request_id]);
      return { data: result.rows[0] || null, error: null };
    } };
  }
};
const cacheCalls = [];
const route = loader({
  'next/server': { NextResponse: { json: (body, init) => new Response(JSON.stringify(body), { ...init, headers: { 'content-type': 'application/json', ...init.headers } }) } },
  'next/cache': { unstable_noStore() {}, revalidatePath: (...args) => cacheCalls.push(args) },
  '../../../../lib/admin-auth': { getAdminContext: async () => denied ? { ok: false, status: denied, message: 'Admin access required.' } : { ok: true, user: { id: adminActor }, email: 'synthetic-admin@example.test' }, readAdminEmailList: () => [] },
  '../../../../lib/supabase-server': { createServerSupabaseClientWithTimeout: () => client }
})('apps/web/app/api/site-editor/recovery-copy/route.ts');
const get = async (restore) => {
  const response = await route.GET(new Request('https://isolated.invalid/api/site-editor/recovery-copy' + (restore ? '?restore=' + restore : '')));
  return { status: response.status, body: await response.json(), headers: response.headers };
};
const post = async body => {
  const response = await route.POST(new Request('https://isolated.invalid/api/site-editor/recovery-copy', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }));
  return { status: response.status, payload: await response.json() };
};
async function requestFor(preflight) {
  preflight ??= (await get()).body.preflight;
  return { operation: preflight.operation, field: key, value: preflight.after, expectedValue: preflight.before, ...(preflight.priorRequestId ? { priorRequestId: preflight.priorRequestId } : {}), expectedActorId: actor, requestId: randomUUID(), expectedPublishedVersion: preflight.publishedVersion, expectedDraftVersion: '' };
}
async function reset() {
  await db.exec('delete from site_editor_receipts; delete from admin_audit_events; delete from site_content;');
  await db.query("insert into site_content(content_key,content_value) values('homepage',$1),('unrelated','{\"keep\":true}')", [baseline]);
  adminActor = actor; denied = 0; beforeMutation = null; loseResponse = false; reads = 0; writes = 0; cacheCalls.length = 0;
}
let passes = 0;
async function test(name, fn) { await reset(); await fn(); passes++; console.log('PASS ' + name); }
const nodes = value => Array.isArray(value) ? value.flatMap(nodes) : value && typeof value === 'object' ? [value, ...nodes(value.props?.children)] : [];
const text = value => Array.isArray(value) ? value.map(text).join('') : typeof value === 'string' ? value : value && typeof value === 'object' ? text(value.props?.children) : '';
function uiFixture(storage = new Map(), fetchOverride, options = {}) {
  let cursor = 0, dirty = true, mounted = true, tree, lateWrites = 0;
  const slots = [], effects = [], listeners = new Set(), downloads = [], calls = [], redirects = [], signOutCalls = [];
  let session = Object.hasOwn(options, 'session') ? options.session : { user: { id: actor } }, clearSessionCalls = 0;
  const router = { replace: url => redirects.push(url) };
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const hooks = {
    useState(initial) { const i = cursor++; slots[i] ??= { value: initial }; return [slots[i].value, next => { if (!mounted) lateWrites++; slots[i].value = typeof next === 'function' ? next(slots[i].value) : next; dirty = true; }]; },
    useRef(initial) { const i = cursor++; slots[i] ??= { current: initial }; return slots[i]; },
    useCallback(callback, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) slots[i] = { value: callback, deps }; return slots[i].value; },
    useEffect(run, deps) { const i = cursor++; slots[i] ??= {}; if (!same(slots[i].deps, deps)) effects.push(() => { slots[i].cleanup?.(); slots[i].deps = deps; slots[i].cleanup = run(); }); }
  };
  const browserStorage = { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
  const emitSession = next => { session = next ? { user: { id: next } } : null; listeners.forEach(fn => fn(next ? 'SIGNED_IN' : 'SIGNED_OUT', session)); };
  const auth = { getSession: () => options.sessionRead || Promise.resolve({ data: { session } }), onAuthStateChange: fn => { listeners.add(fn); return { data: { subscription: { unsubscribe: () => listeners.delete(fn) } } }; },
    async signOut() { signOutCalls.push(true); const result = options.signOut ? await options.signOut() : { error: null }; if (!result.error) emitSession(null); return result; }
  };
  const browserAuth = { createBrowserSupabaseClient: () => ({ auth }), getSupabaseAccessToken: async () => 'synthetic-test-session', clearQrGuitarSessionState: () => { clearSessionCalls++; } };
  class BrowserURL extends URL { static createObjectURL(blob) { downloads.push(blob); return 'blob:isolated-backup'; } static revokeObjectURL() {} }
  const view = loader({ react: hooks, '../lib/supabase-browser': browserAuth, './supabase-browser': browserAuth, 'next/link': { __esModule: true, default: 'a' }, 'next/navigation': { useRouter: () => router } }, {
    window: { sessionStorage: browserStorage, setTimeout, clearTimeout, location: { origin: 'https://isolated.invalid' } }, URL: BrowserURL, crypto: { randomUUID },
    document: { createElement: () => ({ click() {} }) },
    fetch: async (url, init) => { calls.push({ url, method: init.method, body: init.body }); if (fetchOverride) return fetchOverride(url, init);
      const req = new Request('https://isolated.invalid' + url, init); return init.method === 'POST' ? route.POST(req) : route.GET(req); }
  })('apps/web/components/RecoveryCopyCorrection.tsx');
  const fixture = {
    render() { for (let i = 0; i < 30; i++) { if (dirty) { dirty = false; cursor = 0; tree = view.RecoveryCopyCorrection(); } effects.splice(0).forEach(fn => fn()); if (!dirty) return; } throw Error('UI did not settle'); },
    async flush() { for (let i = 0; i < 12; i++) { await new Promise(resolve => setImmediate(resolve)); fixture.render(); } },
    all: () => nodes(tree), text: () => text(tree),
    button(label) { const button = nodes(tree).find(node => node.type === 'button' && text(node).trim() === label); assert.ok(button, 'Expected button ' + label); return button; },
    async click(label) { const button = fixture.button(label); assert.ok(!button.props.disabled, label + ' must be enabled'); button.props.onClick(); fixture.render(); await fixture.flush(); },
    confirm() { const checkbox = nodes(tree).find(node => node.type === 'input' && node.props.type === 'checkbox'); assert.ok(checkbox && !checkbox.props.disabled); checkbox.props.onChange({ target: { checked: true } }); fixture.render(); },
    emit(next) { emitSession(next); fixture.render(); },
    dispose() { mounted = false; slots.forEach(slot => slot.cleanup?.()); }, downloads, calls, redirects, signOutCalls, clearSessionCalls: () => clearSessionCalls, lateWrites: () => lateWrites
  };
  fixture.render(); return fixture;
}
try {
  await installRepositorySchema(db, repo, '20260911003500');
  await db.exec(fs.readFileSync(path.join(repo, 'supabase/migrations/20260911003500_atomic_site_editor.sql'), 'utf8'));
  await db.query('insert into auth.users(id) values($1),($2)', [actor, other]);
  await db.query("insert into profiles(id,display_name,role) values($1,'Synthetic editor','admin'),($2,'Other editor','admin')", [actor, other]);

  await test('preflight is read-only and exposes raw state, both revisions, exact sentences and reproducible snapshot hash', async () => {
    const before = await snapshot(), result = await get();
    assert.equal(result.status, 200); assert.match(result.headers.get('cache-control'), /no-store/);
    const p = result.body.preflight; assert.equal(p.eligible, true); assert.equal(p.field, key); assert.equal(p.before, baseline.content[key]); assert.equal(p.after, approved);
    assert.deepEqual(p.publishedValue, baseline); assert.equal(p.draftValue, null); assert.equal(p.draftVersion, '');
    assert.equal(p.publishedHash, createHash('sha256').update(JSON.stringify(p.publishedValue)).digest('hex'));
    assert.equal(writes, 0); assert.deepEqual(await snapshot(), before);
  });
  await test('publication preserves omitted defaults, unknown content, whitespace, nulls and raw revision backup', async () => {
    const before = await state(), result = await post(await requestFor()); assert.equal(result.status, 200); assert.equal(result.payload.independentlyVerified, true);
    const expected = { ...baseline, content: { ...baseline.content, [key]: approved } }, after = await state();
    assert.deepEqual(after.publishedValue, expected); assert.equal(Object.hasOwn(after.publishedValue, 'composition'), false); assert.equal(Object.hasOwn(after.publishedValue, 'dashboard'), false);
    assert.notEqual(after.publishedVersion, before.publishedVersion); assert.equal(after.draftVersion, ''); assert.equal(after.draftValue, null);
    assert.deepEqual(result.payload.record.before, baseline); assert.deepEqual(result.payload.record.after, expected); assert.deepEqual(result.payload.record.changedFields, [key]);
    const revision = (await db.query('select content_value from site_content where content_key=$1', [after.revisionRows[0].content_key])).rows[0].content_value;
    assert.deepEqual(revision.settings, baseline); assert.equal((await db.query('select count(*)::int as count from admin_audit_events')).rows[0].count, 1);
    assert.ok(cacheCalls.some(call => call[0] === '/reset-password'));
  });
  await test('wrong field/value, injected settings, stale actor and unsupported rollback fail before mutation', async () => {
    const valid = await requestFor();
    for (const changed of [{ field: 'home.hero.body' }, { value: 'Different text' }, { settings: baseline }, { expectedActorId: other }, { expectedDraftVersion: randomUUID() }, { operation: 'restore', priorRequestId: 'bad' }]) {
      const before = await snapshot(); const result = await post({ ...valid, ...changed }); assert.ok(result.status >= 400); assert.deepEqual(await snapshot(), before);
    }
    assert.equal(writes, 0);
  });
  await test('existing drafts are blocked even when their normalized content equals publication', async () => {
    await normalRequest('save_draft', baseline); const p = (await get()).body.preflight; assert.equal(p.eligible, false); assert.match(p.reason, /shared draft/);
    const before = await snapshot(), result = await post(await requestFor(p)); assert.equal(result.status, 409); assert.equal(result.payload.code, 'QSE01'); assert.deepEqual(await snapshot(), before);
  });
  await test('a draft created between read and publish is retained by the existing atomic revision checks', async () => {
    const body = await requestFor(); beforeMutation = () => normalRequest('save_draft', { ...baseline, extraDraft: true });
    const result = await post(body); assert.equal(result.status, 409); const after = await state(); assert.deepEqual(after.publishedValue, baseline); assert.equal(after.draftValue.settings.extraDraft, true);
  });
  await test('a concurrent publication wins without being overwritten by a reviewed stale correction', async () => {
    const body = await requestFor(); const changed = { ...baseline, concurrent: 'preserved' }; beforeMutation = () => normalRequest('publish', changed);
    const result = await post(body); assert.equal(result.status, 409); assert.deepEqual((await state()).publishedValue, changed);
  });
  await test('a stale request without a receipt passes null settings and is rejected without writing defaults', async () => {
    const body = await requestFor(); await normalRequest('publish', { ...baseline, later: 'untouched' });
    const before = await snapshot(), result = await post(body);
    assert.equal(lastSettings, null); assert.equal(result.status, 409); assert.equal(result.payload.code, 'QSE01'); assert.deepEqual(await snapshot(), before);
  });
  await test('missing admin authorization prevents raw reads and all writes', async () => {
    const body = await requestFor(); reads = 0; denied = 403;
    assert.equal((await get()).status, 403); assert.equal((await post(body)).status, 403); assert.equal(reads, 0); assert.equal(writes, 0);
  });
  await test('uncertain response retries the identical request after later changes without new writes or audit', async () => {
    const p = (await get()).body.preflight, store = new Map(), wire = [];
    const controller = editorClient.createEditorMutationController({ actorId: actor, storageScope: 'recovery-copy', storage: { getItem: k => store.get(k) || null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) }, uuid: randomUUID,
      send: async body => { wire.push(body); return post(body); } });
    loseResponse = true;
    await assert.rejects(controller.mutate({ operation: 'correct', field: key, value: p.after, expectedValue: p.before }, p, 'single-field review'), error => error.uncertain === true);
    assert.equal((await state()).publishedValue.content[key], approved); assert.ok(controller.pending);
    await normalRequest('save_draft', { ...(await state()).publishedValue, laterDraft: true });
    const before = await snapshot(), result = await controller.retry(); assert.equal(result.committed, true); assert.equal(result.replayed, true); assert.equal(result.superseded, true);
    assert.equal(wire[1], wire[0]); assert.equal(controller.pending, null); assert.deepEqual(await snapshot(), before);
    const changed = JSON.parse(wire[0]); changed.expectedValue = 'Another old sentence'; const mismatch = await post(changed); assert.equal(mismatch.status, 409); assert.equal(mismatch.payload.code, 'QSE02');
  });
  await test('rollback is limited to the same admin correction receipt and preserves newer unrelated raw fields', async () => {
    const corrected = await post(await requestFor()), id = corrected.payload.requestId;
    adminActor = other; assert.equal((await get(id)).status, 404); adminActor = actor;
    const current = (await state()).publishedValue; await normalRequest('publish', { ...current, newerUnrelated: { untouched: true } });
    const p = (await get(id)).body.preflight; assert.equal(p.operation, 'restore'); assert.equal(p.after, baseline.content[key]); assert.equal(p.eligible, true);
    const wrong = await post({ ...(await requestFor(p)), value: 'Arbitrary rollback' }); assert.equal(wrong.status, 400);
    const restored = await post(await requestFor(p)); assert.equal(restored.status, 200);
    assert.deepEqual((await state()).publishedValue, { ...baseline, newerUnrelated: { untouched: true } });
    assert.deepEqual(restored.payload.record.changedFields, [key]);
  });
  await test('an already-correct value is a read-only state and later edited introductions cannot be rolled back blindly', async () => {
    const corrected = await post(await requestFor()), id = corrected.payload.requestId;
    assert.equal((await get()).body.preflight.eligible, false); const before = await snapshot();
    assert.equal((await post(await requestFor())).status, 409); assert.deepEqual(await snapshot(), before);
    await normalRequest('publish', { ...baseline, content: { ...baseline.content, [key]: 'A later reviewed introduction.' } });
    assert.equal((await get(id)).body.preflight.eligible, false);
  });

  // Render the actual review component, including exact text and both revisions.
  await test('review UI renders exact old/new text, both revisions and snapshot hash without exposing raw JSON', async () => {
    const { renderToStaticMarkup } = require('react-dom/server'), React = require('react');
    const view = loader({ '../lib/supabase-browser': {}, 'next/link': { __esModule: true, default: 'a' } })('apps/web/components/RecoveryCopyCorrection.tsx');
    const p = (await get()).body.preflight, html = renderToStaticMarkup(React.createElement(view.RecoveryCopyReview, { preflight: p }));
    assert.ok(html.includes(p.before)); assert.ok(html.includes(p.after)); assert.ok(html.includes(p.publishedVersion)); assert.ok(html.includes(p.publishedHash));
    assert.match(html, /Draft revision/); assert.match(html, /Empty — no saved draft revision/); assert.doesNotMatch(html, /legacy-saved-color|legacy\.unregistered/);
  });
  await test('actual UI requires backup and review, publishes one field, reloads and offers a verified rollback', async () => {
    const storage = new Map(), ui = uiFixture(storage); await ui.flush();
    await ui.click('Review saved introduction'); assert.equal(ui.button('Publish only this introduction').props.disabled, true); assert.equal(writes, 0);
    await ui.click('Download raw backup'); assert.deepEqual(JSON.parse(await ui.downloads[0].text()).publishedValue, baseline);
    assert.equal(ui.button('Publish only this introduction').props.disabled, true); ui.confirm(); await ui.click('Publish only this introduction');
    assert.equal((await state()).publishedValue.content[key], approved); assert.equal(ui.calls.filter(call => call.method === 'POST').length, 1);
    await ui.click('Download restoration record'); assert.deepEqual(JSON.parse(await ui.downloads[1].text()).before, baseline); ui.dispose();
    const reloaded = uiFixture(storage); await reloaded.flush(); await reloaded.click('Review rollback');
    await reloaded.click('Download raw backup'); reloaded.confirm(); await reloaded.click('Restore only this introduction');
    assert.deepEqual((await state()).publishedValue, baseline); assert.equal(reloaded.calls.filter(call => call.method === 'POST').length, 1); reloaded.dispose();
  });
  await test('actual UI reload recovers an uncertain attempt and retries the same wire request', async () => {
    const storage = new Map(), ui = uiFixture(storage); await ui.flush(); await ui.click('Review saved introduction'); await ui.click('Download raw backup'); ui.confirm();
    loseResponse = true; await ui.click('Publish only this introduction'); const original = ui.calls.find(call => call.method === 'POST').body;
    assert.equal(ui.button('Review saved introduction').props.disabled, true); ui.dispose(); const before = await snapshot();
    const reloaded = uiFixture(storage); await reloaded.flush(); await reloaded.click('Retry the same request');
    assert.equal(reloaded.calls.find(call => call.method === 'POST').body, original); assert.deepEqual(await snapshot(), before); assert.ok(reloaded.button('Review rollback')); reloaded.dispose();
  });
  await test('Auth invalidation clears the real review and ignores a late request without writes', async () => {
    let finish; const waiting = new Promise(resolve => { finish = resolve; });
    const p = (await get()).body.preflight;
    let requests = 0;
    const ui = uiFixture(new Map(), (url, init) => ++requests === 1 ? route.GET(new Request('https://isolated.invalid' + url, init)) : waiting); await ui.flush();
    ui.button('Review saved introduction').props.onClick(); ui.render(); await ui.flush(); ui.emit(null);
    finish(new Response(JSON.stringify({ ok: true, preflight: p }), { status: 200 })); await ui.flush();
    assert.match(ui.text(), /Sign in/); assert.equal(ui.all().some(node => node.type === 'button' && text(node).includes('Publish only')), false); assert.equal(writes, 0); ui.dispose(); assert.equal(ui.lateWrites(), 0);
  });
  await test('the correction page is private and does not mount normal editor autosave', async () => {
    const page = fs.readFileSync(path.join(repo, 'apps/web/app/site-editor/recovery-copy/page.tsx'), 'utf8');
    assert.match(page, /index: false/); assert.match(page, /RecoveryCopyCorrection/); assert.doesNotMatch(page, /SiteEditorPage|save_draft|<Nav|<Footer/);
  });
  await test('unsettled browser Auth does not redirect or expose recovery instructions before local session resolves', async () => {
    let resolve; const sessionRead = new Promise(done => { resolve = done; });
    const ui = uiFixture(new Map(), undefined, { sessionRead }); await ui.flush();
    assert.match(ui.text(), /Checking admin access/); assert.doesNotMatch(ui.text(), /Password-reset introduction|Content recovery|shared draft/); assert.equal(ui.calls.length, 0); assert.deepEqual(ui.redirects, []);
    resolve({ data: { session: { user: { id: actor } } } }); await ui.flush();
    assert.ok(ui.button('Review saved introduction')); assert.deepEqual(ui.redirects, []); assert.equal(ui.calls.length, 1); assert.equal(writes, 0); ui.dispose();
  });
  await test('settled signed-out state redirects to the fixed normal login return destination without technical content', async () => {
    const ui = uiFixture(new Map(), undefined, { session: null }); await ui.flush();
    assert.deepEqual(ui.redirects, ['/login?next=%2Fsite-editor%2Frecovery-copy']); assert.equal(ui.calls.length, 0);
    assert.match(ui.text(), /Sign in to continue/); assert.doesNotMatch(ui.text(), /Password-reset introduction|Content recovery|raw backup|shared draft|Currently saved/); ui.dispose();
  });
  await test('signed-in non-admin sees only minimal denial after server authorization rejects access', async () => {
    denied = 403; const ui = uiFixture(); await ui.flush();
    assert.match(ui.text(), /Admin access required/); assert.match(ui.text(), /Return to dashboard/); assert.deepEqual(ui.redirects, []);
    assert.doesNotMatch(ui.text(), /Password-reset introduction|Content recovery|raw backup|shared draft/); assert.equal(ui.all().some(node => node.type === 'button'), false); assert.equal(writes, 0); ui.dispose();
  });
  await test('cached expired actor plus API 401 remains gated without bouncing through login', async () => {
    denied = 401; const ui = uiFixture(); await ui.flush();
    assert.match(ui.text(), /Your session expired/); assert.ok(ui.button('Sign out and sign in again')); assert.deepEqual(ui.redirects, []); assert.equal(ui.signOutCalls.length, 0);
    assert.doesNotMatch(ui.text(), /Password-reset introduction|Content recovery|raw backup|Currently saved/); assert.equal(writes, 0); ui.dispose();
  });
  await test('expired-session action uses ordinary sign-out, waits while pending and then preserves the fixed login return', async () => {
    denied = 401; let finish; const waiting = new Promise(resolve => { finish = resolve; });
    const ui = uiFixture(new Map(), undefined, { signOut: () => waiting }); await ui.flush();
    ui.button('Sign out and sign in again').props.onClick(); ui.render(); await ui.flush();
    assert.equal(ui.button('Signing out…').props.disabled, true); assert.equal(ui.signOutCalls.length, 1); assert.deepEqual(ui.redirects, []);
    finish({ error: null }); await ui.flush();
    assert.ok(ui.redirects.length > 0); assert.ok(ui.redirects.every(url => url === '/login?next=%2Fsite-editor%2Frecovery-copy')); assert.equal(ui.clearSessionCalls(), 1); assert.match(ui.text(), /Sign in to continue/); assert.equal(writes, 0); ui.dispose();
  });
  await test('failed normal sign-out keeps expired access gated with retry feedback and no login redirect', async () => {
    denied = 401; const ui = uiFixture(new Map(), undefined, { signOut: async () => ({ error: Error('Synthetic sign-out failure') }) }); await ui.flush(); await ui.click('Sign out and sign in again');
    assert.match(ui.text(), /Your session expired/); assert.match(ui.text(), /Could not sign out\. Please try again\./); assert.equal(ui.button('Sign out and sign in again').props.disabled, false);
    assert.deepEqual(ui.redirects, []); assert.equal(ui.clearSessionCalls(), 0); assert.equal(ui.signOutCalls.length, 1); assert.equal(writes, 0); ui.dispose();
  });
  await test('temporary access failure stays distinct from logout and can retry the normal authorized read', async () => {
    let fail = true; const ui = uiFixture(new Map(), (url, init) => fail ? Promise.reject(Error('Synthetic read outage')) : route.GET(new Request('https://isolated.invalid' + url, init)));
    await ui.flush(); assert.match(ui.text(), /Admin workspace unavailable/); assert.deepEqual(ui.redirects, []); assert.doesNotMatch(ui.text(), /Password-reset introduction|raw backup/);
    fail = false; await ui.click('Retry access check'); assert.ok(ui.button('Review saved introduction')); assert.equal(writes, 0); ui.dispose();
  });
  await test('server access revocation clears an already-loaded review instead of leaving technical admin controls visible', async () => {
    const ui = uiFixture(); await ui.flush(); await ui.click('Review saved introduction'); assert.ok(ui.button('Download raw backup'));
    denied = 403; await ui.click('Review saved introduction');
    assert.match(ui.text(), /Admin access required/); assert.doesNotMatch(ui.text(), /Password-reset introduction|Content recovery|raw backup|Publish only/); assert.equal(writes, 0); ui.dispose();
  });
  await test('actor changes hide the previous workspace immediately while the new account is checked', async () => {
    const ui = uiFixture(); await ui.flush(); await ui.click('Review saved introduction');
    denied = 403; ui.emit(other); assert.match(ui.text(), /Checking admin access/); assert.doesNotMatch(ui.text(), /Password-reset introduction|raw backup/);
    await ui.flush(); assert.match(ui.text(), /Admin access required/); assert.equal(writes, 0); ui.dispose();
  });
  console.log(`\n${passes} focused recovery-copy checks passed against production functions and disposable PostgreSQL semantics. No live requests.`);
} finally { await db.close(); }
