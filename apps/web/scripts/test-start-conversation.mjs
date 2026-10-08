import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { withUiTextTestContext } from './ui-text-test-context.mjs';
const require = withUiTextTestContext(createRequire(import.meta.url));
const ts = require('typescript'), React = require('react'), root = path.resolve(import.meta.dirname, '..');
const tick = () => new Promise(r => setImmediate(r));
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
const session = id => id ? { access_token: 'token-' + id, user: { id } } : null;
const unhandled = [], capture = e => unhandled.push(e);
process.on('unhandledRejection', capture);
function load(file, name, env) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name);
  assert.ok(declaration);
  const js = ts.transpileModule(declaration.getText(ast).replace(/^export /, ''), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  return new Function('require', 'exports', ...Object.keys(env), js + '\nreturn ' + name)(require, {}, ...Object.values(env));
}
const words = n => typeof n === 'string' ? n : n && typeof n === 'object' ? React.Children.toArray(n.props?.children).map(words).join(' ') : '';
const nodes = n => n && typeof n === 'object' ? [n, ...React.Children.toArray(n.props?.children).flatMap(nodes)] : [];
function fixture(options = {}) {
  const values = [], effects = [], timers = new Map();
  let cursor = 0, ec = 0, dirty = true, mounted = true, tree, listener, tid = 0;
  let props = { handle: 'shop-a', profileCode: 'QRG-A' };
  const f = { requests: [], redirects: [], lateWrites: 0, session: session('a'), ...options };
  const auth = { async getSession() { return f.read ? f.read() : { data: { session: f.session }, error: null }; }, onAuthStateChange(cb) { listener = cb; return { data: { subscription: { unsubscribe() { listener = undefined; } } } }; } };
  const client = () => { if (f.constructError) throw Error('Auth unavailable'); return { auth }; };
  const router = { replace: url => f.redirects.push(url) };
  const hooks = {
    useState(initial) { const i = cursor++; if (!(i in values)) values[i] = initial; return [values[i], next => { if (!mounted) f.lateWrites++; const value = typeof next === 'function' ? next(values[i]) : next; if (!Object.is(value, values[i])) { values[i] = value; dirty = true; } }]; },
    useRef(initial) { return values[cursor++] ||= { current: initial }; },
    useEffect(run, deps) { const i = ec++, old = effects[i]; if (!old || deps.some((v, j) => !Object.is(v, old.deps[j]))) effects[i] = { run, deps, cleanup: old?.cleanup, pending: true }; }
  };
  const C = load('components/StartConversation.tsx', 'StartConversation', {
    ...hooks, useUiText: scope => { const original = require('UiTextProvider').useUiText(scope); return (key, ...args) => f.copy?.[key] ?? original(key, ...args); }, useRouter: () => router, createBrowserSupabaseClient: client,
    getSupabaseAccessToken: load('lib/supabase-browser.ts', 'getSupabaseAccessToken', { createBrowserSupabaseClient: client }),
    styles: { state: 'state', spin: 'spin' }, Link: 'a', MessageCircle: () => null, LoaderCircle: () => null,
    setTimeout: (fn, ms) => { const id = ++tid; timers.set(id, { fn, ms }); return id; }, clearTimeout: id => timers.delete(id),
    fetch: async (url, init) => { f.requests.push({ url, ...init }); return f.reply ? f.reply() : Response.json({ ok: true, conversationId: 'conversation-a' }); }
  });
  f.render = () => { let turns = 0; dirty = true; while (dirty) { assert.ok(turns++ < 20); dirty = false; cursor = ec = 0; tree = C(props); for (const e of effects) if (e.pending) { e.pending = false; e.cleanup?.(); e.cleanup = e.run(); } } return tree; };
  f.text = () => words(f.render());
  f.retry = () => { const b = nodes(f.render()).find(n => n.type === 'button' && /try again/i.test(words(n))); assert.ok(b, 'Retry must be available'); b.props.onClick(); f.render(); };
  f.event = (event,id) => listener?.(event,session(id));
  f.change = id => { f.session = session(id); listener?.('SIGNED_IN', f.session); };
  f.route = patch => { props = { ...props, ...patch }; f.render(); };
  f.replay = () => { for (const e of effects) { e.cleanup?.(); e.cleanup = e.run(); } };
  f.timeout = () => { for (const { fn } of [...timers.values()]) fn(); };
  f.unmount = () => { mounted = false; for (const e of effects) e.cleanup?.(); };
  f.timers = timers; f.render(); return f;
}
let passed = 0, failed = 0;
async function test(name, run) { try { await run(); passed++; console.log('PASS ' + name); } catch (e) { failed++; console.log('FAIL ' + name + ': ' + e.message); } }
for (const mode of ['error', 'throw', 'construct']) await test(mode + ' session failure is retryable, never false login', async () => {
  const before = unhandled.length, f = fixture({ constructError: mode === 'construct', read: async () => { if (mode === 'throw') throw Error('Auth outage'); return { data: { session: null }, error: Error('Auth outage') }; } });
  await tick(); try { assert.deepEqual(f.redirects, []); assert.match(f.text(), /could not|unavailable/i); assert.equal(unhandled.length, before); f.constructError = false; f.read = undefined; f.retry(); await tick(); assert.deepEqual(f.redirects, ['/messages/conversation-a']); assert.equal(f.requests.length, 1); } finally { f.unmount(); }
});
await test('confirmed anonymous preserves intended destination', async () => {
  const f = fixture({ session: null }); await tick(); assert.equal(f.requests.length, 0); const u = new URL(f.redirects[0], 'https://test.invalid'); assert.equal(u.pathname, '/login'); assert.equal(u.searchParams.get('next'), '/messages/new?member=shop-a&profile=QRG-A'); f.unmount();
});
for (const phase of ['read', 'request', 'body']) await test('unmount during ' + phase + ' suppresses late effects', async () => {
  const g = deferred(), f = fixture({ ...(phase === 'read' ? { read: () => g.promise } : { reply: () => phase === 'body' ? { ok: true, json: () => g.promise } : g.promise }) }); await tick(); f.unmount(); g.resolve(phase === 'read' ? { data: { session: session('a') } } : phase === 'body' ? { ok: true, conversationId: 'old' } : Response.json({ ok: true, conversationId: 'old' })); await tick(); assert.deepEqual(f.redirects, []); assert.equal(f.lateWrites, 0); if (phase !== 'read') assert.equal(f.requests[0].signal.aborted, true); assert.equal(f.timers.size, 0);
});
for (const id of ['b', null]) await test('identity change to ' + id + ' cancels pending response', async () => {
  const g = deferred(), f = fixture({ reply: () => g.promise }); await tick(); f.change(id); g.resolve(Response.json({ ok: true, conversationId: 'old' })); await tick(); assert.deepEqual(f.redirects, []); assert.equal(f.requests.length, 1); assert.equal(f.requests[0].signal.aborted, true); assert.match(f.text(), /session|account|sign.in/i); f.unmount();
});
await test('silent account switch after response prevents old navigation', async () => {
  const f = fixture({ reply: () => { f.session = session('b'); return Response.json({ ok: true, conversationId: 'old' }); } }); await tick(); assert.deepEqual(f.redirects, []); assert.match(f.text(), /session|account/i); f.unmount();
});
await test('same actor refresh preserves current action', async () => {
  const g = deferred(), f = fixture({ reply: () => g.promise }); await tick(); f.change('a'); g.resolve(Response.json({ ok: true, conversationId: 'conversation-a' })); await tick(); assert.deepEqual(f.redirects, ['/messages/conversation-a']); assert.equal(f.requests.length, 1); f.unmount();
});
await test('new route ignores old response', async () => {
  const g = deferred(); let count = 0; const f = fixture({ reply: () => ++count === 1 ? g.promise : Response.json({ ok: true, conversationId: 'conversation-b' }) }); await tick(); f.route({ handle: 'shop-b' }); await tick(); g.resolve(Response.json({ ok: true, conversationId: 'old' })); await tick(); assert.deepEqual(f.redirects, ['/messages/conversation-b']); assert.equal(JSON.parse(f.requests[1].body).handle, 'shop-b'); f.unmount();
});
await test('Strict Mode replay neither duplicates nor strands', async () => {
  const f = fixture(); f.replay(); await tick(); assert.deepEqual(f.redirects, ['/messages/conversation-a']); assert.equal(f.requests.length, 1); f.unmount();
});
for (const phase of ['read', 'request', 'body']) await test(phase + ' deadline allows retry', async () => {
  const f = fixture({ ...(phase === 'read' ? { read: () => new Promise(() => {}) } : { reply: () => phase === 'body' ? { ok: true, json: () => new Promise(() => {}) } : new Promise(() => {}) }) }); await tick(); f.timeout(); await tick(); assert.match(f.text(), /timed out/i); f.read = undefined; f.reply = undefined; f.retry(); await tick(); assert.deepEqual(f.redirects, ['/messages/conversation-a']); f.unmount(); assert.equal(f.timers.size, 0);
});
await test('auth event outranks delayed initial read without sending old actor request', async () => {
  const g = deferred(), f = fixture({ read: () => g.promise }); await tick(); f.change('b'); g.resolve({ data: { session: session('a') } }); await tick(); assert.deepEqual(f.requests, []); assert.deepEqual(f.redirects, []); assert.match(f.text(), /session changed/i); f.unmount();
});
await test('post-response auth outage cannot navigate or reveal returned details', async () => {
  const f = fixture({ reply: () => { f.read = async () => ({ data: { session: null }, error: Error('outage') }); return Response.json({ ok: false, message: 'Private server detail' }, { status: 403 }); } }); await tick(); assert.deepEqual(f.redirects, []); assert.doesNotMatch(f.text(), /Private server detail/); assert.match(f.text(), /could not/i); f.unmount();
});
await test('confirmed rejection retains useful member availability error', async () => {
  const f = fixture({ reply: () => Response.json({ ok: false, message: 'This member is not accepting messages.' }, { status: 403 }) }); await tick(); assert.deepEqual(f.redirects, []); assert.match(f.text(), /not accepting messages/); f.unmount();
});
for (const reply of [() => { throw Error('network'); }, () => new Response('invalid json'), () => Response.json({ ok: true, conversationId: '../../account' })]) await test('invalid response is retryable without unsafe navigation', async () => {
  const f = fixture({ reply }); await tick(); assert.deepEqual(f.redirects, []); assert.match(f.text(), /could not/i); f.reply = undefined; f.retry(); await tick(); assert.deepEqual(f.redirects, ['/messages/conversation-a']); f.unmount();
});
await test('same-tick repeated retry starts only one new operation', async () => {
  const f = fixture({ constructError: true }); await tick(); const button = nodes(f.render()).find(n => n.type === 'button'); f.constructError = false; button.props.onClick(); button.props.onClick(); f.render(); await tick(); assert.equal(f.requests.length, 1); assert.deepEqual(f.redirects, ['/messages/conversation-a']); f.unmount();
});
await test('CMS update while pending neither restarts nor duplicates POST', async () => {
  const g = deferred(), f = fixture({ reply: () => g.promise }); await tick(); f.copy = { 'ui.components.StartConversation.2a8b850dadd9': 'Localized opening' }; assert.match(f.text(), /Localized opening/); assert.equal(f.requests.length, 1); g.resolve(Response.json({ ok: true, conversationId: 'conversation-a' })); await tick(); assert.deepEqual(f.redirects, ['/messages/conversation-a']); assert.equal(f.requests.length, 1); f.unmount();
});
for (const kind of ['sessionChanged', 'openingTimedOut', 'openRetryFailure', 'c2ad2f8a287b']) await test(kind + ' error copy updates without restarting action', async () => {
  const f = fixture(kind === 'c2ad2f8a287b' ? { constructError: true } : { reply: () => kind === 'openRetryFailure' ? Response.json({ ok: false }) : new Promise(() => {}) }); await tick();
  if (kind === 'sessionChanged') f.change('b');
  if (kind === 'openingTimedOut') { f.timeout(); await tick(); }
  const count = f.requests.length;
  f.copy = { ['ui.components.StartConversation.' + kind]: 'Localized failure', 'ui.components.StartConversation.retryConversation': 'Localized retry' };
  assert.match(f.text(), /Localized failure/); assert.match(f.text(), /Localized retry/); await tick(); assert.equal(f.requests.length, count); assert.deepEqual(f.redirects, []); f.unmount();
});
await test('late initial null from failed refresh does not cancel a recovered same-actor action', async () => { const g=deferred(),f=fixture({reply:()=>g.promise}); await tick(); f.event('INITIAL_SESSION',null); g.resolve(Response.json({ok:true,conversationId:'conversation-a'})); await tick(); assert.deepEqual(f.redirects,['/messages/conversation-a']); assert.equal(f.requests.length,1); f.unmount(); });
await test('successful token refresh recovers an earlier lookup error without another click', async()=>{const f=fixture({read:async()=>({data:{session:null},error:Error('Temporary refresh failure')})});await tick();assert.equal(f.requests.length,0);f.read=undefined;f.event('TOKEN_REFRESHED','a');f.render();await tick();assert.deepEqual(f.redirects,['/messages/conversation-a']);assert.equal(f.requests.length,1);f.unmount();});
await test('refresh after a post-send lookup failure never automatically repeats the POST',async()=>{let reads=0;const f=fixture({read:async()=>++reads===1?{data:{session:session('a')},error:null}:{data:{session:null},error:Error('Refresh failure')}});await tick();assert.equal(f.requests.length,1);f.read=undefined;f.event('TOKEN_REFRESHED','a');f.render();await tick();assert.equal(f.requests.length,1);assert.deepEqual(f.redirects,[]);f.unmount();});
assert.equal(unhandled.length, 0, 'No component promise may be unhandled');
console.log(JSON.stringify({ passed, failed, unhandledRejections: unhandled.length }));
process.removeListener('unhandledRejection', capture);
if (failed) process.exitCode = 1;
