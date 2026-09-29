import { fixture as reviewFixture } from "./test-downstream-ux-recovery.mjs";
import { withUiTextTestContext } from "./ui-text-test-context.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

const require = withUiTextTestContext(createRequire(import.meta.url)), ts = require("typescript");
const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hour = 60 * 60 * 1000, day = 24 * hour;
const startedKey = "qrguitar.sessionStartedAt", activityKey = "qrguitar.lastActivityAt", identityKey = "qrguitar.sessionIdentity";
const tick = () => new Promise((resolve) => setImmediate(resolve));
const sessionIdA = "10000000-0000-4000-8000-000000000001", sessionIdB = "10000000-0000-4000-8000-000000000002";
const jwt = (sessionId, userId = "owner-a", issuedAt = 1700000000) => [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
  Buffer.from(JSON.stringify({ sub: userId, session_id: sessionId, iat: issuedAt, exp: issuedAt + 3600 })).toString("base64url"),
  "synthetic-signature"
].join(".");
function compile(relative, imports, globals) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(web, relative), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }
  }).outputText;
  new Function("require", "module", "exports", ...Object.keys(globals), code)(
    (name) => Object.hasOwn(imports, name) ? imports[name] : require(name), module, module.exports, ...Object.values(globals)
  );
  return module.exports;
}
function fixture(options = {}) {
  const f = { now: Date.parse("2026-09-17T12:00:00Z"), denied: "", signouts: 0, redirects: [], intervals: [], ...options };
  const storage = new Map(), listeners = new Set(), effects = [], cleanups = [], windowEvents = new Map(), documentEvents = new Map();
  f.session = { access_token: "synthetic-token", user: { id: "owner-a", last_sign_in_at: new Date(f.now - hour).toISOString() } };
  const localStorage = {
    getItem(key) { if (f.denied === "read") throw new DOMException("Storage blocked", "SecurityError"); return storage.get(key) ?? null; },
    setItem(key, value) { if (f.denied === "write") throw new DOMException("Storage full", "QuotaExceededError"); storage.set(key, value); },
    removeItem(key) { if (f.denied === "remove") throw new DOMException("Storage blocked", "SecurityError"); storage.delete(key); }
  };
  const window = {
    location: { pathname: f.pathname || '/dashboard', search: f.search || '', hash: f.hash || '' },
    get localStorage() { if (f.denied === "getter") throw new DOMException("Storage blocked", "SecurityError"); return localStorage; },
    addEventListener: (name, fn) => windowEvents.set(name, fn), removeEventListener: (name) => windowEvents.delete(name),
    setInterval(fn) { f.intervals.push(fn); return f.intervals.length; }, clearInterval() {}, dispatchEvent() {}
  };
  const document = { visibilityState: "visible", addEventListener: (name, fn) => documentEvents.set(name, fn), removeEventListener: (name) => documentEvents.delete(name) };
  f.change = (event, session) => { f.session = session; for (const listener of listeners) listener(event, session); };
  const auth = {
    getSession: () => f.readSession ? f.readSession() : Promise.resolve({ data: { session: f.session }, error: null }),
    onAuthStateChange(fn) { listeners.add(fn); return { data: { subscription: { unsubscribe: () => listeners.delete(fn) } } }; },
    async signOut() { f.signouts++; if (f.signOut) return f.signOut(); f.change("SIGNED_OUT", null); return { error: null }; }
  };
  class FakeDate extends Date { static now() { return f.now; } }
  const globals = { window, document, Date: FakeDate, CustomEvent: class { constructor(type) { this.type = type; } } };
  const browser = compile("lib/supabase-browser.ts", {
    "@supabase/supabase-js": { createClient: () => ({ auth }) }, "./site-preview-client": { invalidateSitePreviewSession: async () => {} }
  }, { ...globals, process: { env: { NEXT_PUBLIC_SUPABASE_URL: "https://synthetic.invalid", NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic" } } });
  const component = compile("components/SessionLifecycle.tsx", {
    react: { useEffect: (fn) => effects.push(fn), useRef: (value) => ({ current: value }) },
    "next/navigation": { useRouter: () => ({ replace: (url) => f.redirects.push(url) }), usePathname: () => f.pathname || "/dashboard" },
    "../lib/auth-redirect": compile("lib/auth-redirect.ts", {}, {}),
    "../lib/supabase-browser": browser
  }, globals);
  f.storage = storage; f.browser = browser; f.window = window;
  f.seed = (started, activity = f.now, identity = JSON.stringify([f.session.user.id, f.session.user.last_sign_in_at])) => {
    storage.set(startedKey, String(started)); storage.set(activityKey, String(activity));
    if (identity !== null) storage.set(identityKey, identity);
  };
  f.mount = async () => { component.SessionLifecycle(); for (const effect of effects) cleanups.push(effect()); await tick(); return f; };
  f.poll = async () => { f.intervals.forEach((fn) => fn()); await tick(); };
  f.focus = async () => { windowEvents.get("focus")?.(); await tick(); };
  f.activity = () => windowEvents.get("pointerdown")?.();
  f.dispose = () => cleanups.forEach((fn) => fn?.());
  return f;
}

test("same-session SIGNED_IN from tab resume preserves both expiry timestamps", async () => {
  const f = fixture(); f.seed(f.now - 13 * day, f.now - hour); await f.mount();
  const before = [f.storage.get(startedKey), f.storage.get(activityKey)];
  f.change("SIGNED_IN", { ...f.session, user: { ...f.session.user } });
  assert.deepEqual([f.storage.get(startedKey), f.storage.get(activityKey)], before); f.dispose();
});

test("refocusing an active tab cannot extend its fourteen-day absolute lifetime", async () => {
  const f = fixture(); f.seed(f.now - 13 * day); await f.mount();
  f.change("SIGNED_IN", f.session); f.now += 2 * day; f.storage.set(activityKey, String(f.now)); await f.poll();
  assert.equal(f.signouts, 1); assert.equal(f.session, null); assert.match(f.redirects[0], /reason=session-expired/); f.dispose();
});

test("resume after nine idle hours expires before recording fresh activity", async () => {
  const f = await fixture().mount(); f.now += 9 * hour;
  f.change("SIGNED_IN", f.session); await f.focus();
  assert.equal(f.signouts, 1); assert.equal(f.storage.has(activityKey), false); f.dispose();
});

test("ordinary token refresh preserves the original clocks", async () => {
  const f = fixture(); f.seed(f.now - 3 * day, f.now - hour); await f.mount();
  f.change("TOKEN_REFRESHED", { ...f.session, access_token: "synthetic-refreshed" });
  assert.equal(f.storage.get(startedKey), String(f.now - 3 * day)); assert.equal(f.storage.get(activityKey), String(f.now - hour)); f.dispose();
});

test("a new authentication for the same user gets its actual new sign-in clock", async () => {
  const f = await fixture().mount(); f.now += hour;
  f.change("SIGNED_IN", { ...f.session, user: { ...f.session.user, last_sign_in_at: new Date(f.now).toISOString() } });
  assert.equal(f.storage.get(startedKey), String(f.now)); assert.equal(f.storage.get(activityKey), String(f.now)); f.dispose();
});

test("switching accounts does not inherit the previous account's clocks", async () => {
  const f = fixture(); f.seed(f.now - 13 * day); await f.mount();
  f.change("SIGNED_IN", { user: { id: "owner-b", last_sign_in_at: new Date(f.now).toISOString() } });
  assert.equal(f.storage.get(startedKey), String(f.now)); assert.match(f.storage.get(identityKey), /owner-b/); f.dispose();
});

test("legacy stored clocks gain an identity without resetting elapsed time", async () => {
  const f = fixture(); f.seed(f.now - 5 * day, f.now - hour, null); await f.mount();
  assert.equal(f.storage.get(startedKey), String(f.now - 5 * day)); assert.equal(f.storage.get(activityKey), String(f.now - hour)); assert.match(f.storage.get(identityKey), /owner-a/); f.dispose();
});

test("sign-out clears persisted session identity and clocks", async () => {
  const f = await fixture().mount(); f.change("SIGNED_OUT", null);
  for (const key of [startedKey, activityKey, identityKey]) assert.equal(f.storage.has(key), false); f.dispose();
});

for (const denied of ["getter", "read", "write"]) test(`storage ${denied} denial keeps working activity and expiry in memory`, async () => {
  const f = await fixture({ denied }).mount();
  assert.equal(f.browser.readSessionStorage(startedKey), String(f.now - hour));
  f.change("SIGNED_IN", f.session); f.now += hour; f.activity();
  assert.equal(f.browser.readSessionStorage(activityKey), String(f.now));
  f.now += 9 * hour; await f.focus();
  assert.equal(f.signouts, 1); assert.equal(f.browser.readSessionStorage(startedKey), null);
  assert.match(f.browser.readSessionStorage(f.browser.sessionExpiredMessageKey), /expired/); f.dispose();
});

test("storage removal denial clears in-memory clocks and does not interrupt sign-out cleanup", async () => {
  const f = await fixture().mount(); f.denied = "remove";
  assert.doesNotThrow(() => f.change("SIGNED_OUT", null));
  for (const key of [startedKey, activityKey, identityKey]) assert.equal(f.browser.readSessionStorage(key), null); f.dispose();
});

test("guarded helpers read other-tab activity while persistent storage is available", async () => {
  const f = await fixture().mount(); f.now += hour; f.storage.set(activityKey, String(f.now));
  assert.equal(f.browser.readSessionStorage(activityKey), String(f.now)); f.dispose();
});

test("temporary write denial flushes the pending clock before reading restored storage", async () => {
  const f = await fixture().mount(); const before = f.storage.get(activityKey); f.denied = "write";
  f.now += hour; f.browser.writeSessionStorage(activityKey, String(f.now)); assert.equal(f.storage.get(activityKey), before);
  f.denied = ""; assert.equal(f.browser.readSessionStorage(activityKey), String(f.now));
  assert.equal(f.storage.get(activityKey), String(f.now)); f.dispose();
});

test("temporary removal denial cannot resurrect metadata after storage recovers", async () => {
  const f = await fixture().mount(); f.denied = "remove"; f.change("SIGNED_OUT", null);
  assert.equal(f.storage.has(startedKey), true); f.denied = "";
  for (const key of [startedKey, activityKey, identityKey]) {
    assert.equal(f.browser.readSessionStorage(key), null); assert.equal(f.storage.has(key), false);
  }
  f.dispose();
});

test("same JWT session preserves clocks when token refresh updates user last-sign-in metadata", async () => {
  const f = fixture(); f.session.access_token = jwt(sessionIdA);
  f.seed(f.now - 13 * day, f.now - hour, JSON.stringify([f.session.user.id, `session:${sessionIdA}`])); await f.mount();
  f.change("TOKEN_REFRESHED", { ...f.session, access_token: jwt(sessionIdA, "owner-a", 1800000000), user: { ...f.session.user, last_sign_in_at: new Date(f.now).toISOString() } });
  assert.equal(f.storage.get(startedKey), String(f.now - 13 * day)); assert.equal(f.storage.get(activityKey), String(f.now - hour)); f.dispose();
});

test("a genuinely new JWT session resets the clock for the same user", async () => {
  const f = fixture(); f.session.access_token = jwt(sessionIdA); await f.mount(); f.now += hour;
  f.change("SIGNED_IN", { ...f.session, access_token: jwt(sessionIdB), user: { ...f.session.user, last_sign_in_at: new Date(f.now).toISOString() } });
  assert.equal(f.storage.get(startedKey), String(f.now)); assert.equal(f.storage.get(activityKey), String(f.now));
  assert.match(f.storage.get(identityKey), new RegExp(sessionIdB)); f.dispose();
});

test("JWT session identity remains scoped to the account", async () => {
  const f = fixture(); f.session.access_token = jwt(sessionIdA); await f.mount(); f.now += hour;
  f.change("SIGNED_IN", { access_token: jwt(sessionIdA, "owner-b"), user: { id: "owner-b", last_sign_in_at: new Date(f.now).toISOString() } });
  assert.equal(f.storage.get(startedKey), String(f.now)); assert.match(f.storage.get(identityKey), /owner-b/); f.dispose();
});

for (const accessToken of ["bad", "a.%%%25.c", jwt("not-a-session-id")]) test("unavailable JWT session metadata safely uses the sign-in fallback " + accessToken.length, async () => {
  const f = fixture(); f.session.access_token = accessToken; await f.mount();
  assert.equal(f.storage.get(startedKey), String(f.now - hour)); f.change("SIGNED_IN", f.session);
  assert.equal(f.storage.get(startedKey), String(f.now - hour)); f.dispose();
});

test("late initial session read cannot overwrite a newer account's clock", async () => {
  const f = fixture(); let resolve; f.readSession = () => new Promise((done) => { resolve = done; }); const previous = f.session;
  await f.mount(); f.change("SIGNED_IN", { user: { id: "owner-b", last_sign_in_at: new Date(f.now).toISOString() } });
  resolve({ data: { session: previous }, error: null }); await tick();
  assert.match(f.storage.get(identityKey), /owner-b/); assert.equal(f.storage.get(startedKey), String(f.now)); f.dispose();
});

test("late session read after unmount cannot recreate cleared metadata", async () => {
  const f = fixture(); let resolve; f.readSession = () => new Promise((done) => { resolve = done; }); await f.mount(); f.dispose();
  resolve({ data: { session: f.session }, error: null }); await tick(); assert.equal(f.storage.size, 0);
});

test("pending expiry completion cannot redirect a newly signed-in account", async () => {
  const f = fixture(); let settle; f.signOut = () => new Promise(resolve => { settle = resolve; }); f.seed(f.now - 15 * day);
  await f.mount(); assert.equal(f.signouts, 1);
  f.change('SIGNED_IN', { user: { id: 'owner-b', last_sign_in_at: new Date(f.now).toISOString() } });
  settle({ error: null }); await tick();
  assert.deepEqual(f.redirects, []); assert.match(f.storage.get(identityKey), /owner-b/); f.dispose();
});
test("expiry preserves safe collection settings query and hash", async () => {
  const f = fixture({ pathname: '/account', search: '?section=collection', hash: '#public-collection' }); f.seed(f.now - 15 * day); await f.mount();
  assert.equal(f.redirects[0], '/login?reason=session-expired&next='+encodeURIComponent('/account?section=collection#public-collection')); f.dispose();
});
test("overlapping expiry checks start one sign-out operation", async () => {
  const f = fixture(); let settle; f.signOut = () => new Promise(resolve => { settle = resolve; }); f.seed(f.now - 15 * day); await f.mount(); await f.poll(); await f.focus();
  assert.equal(f.signouts, 1); f.change('SIGNED_OUT', null); settle({ error: null }); await tick(); f.dispose();
});
test("same-session token refresh while expiry is pending cannot extend idle activity", async () => {
  const f = fixture(); f.session.access_token = jwt(sessionIdA); let settle;
  f.signOut = () => new Promise(resolve => { settle = resolve; });
  f.seed(f.now - day, f.now - 9 * hour, JSON.stringify([f.session.user.id, `session:${sessionIdA}`])); await f.mount();
  const oldActivity = f.storage.get(activityKey);
  f.change('TOKEN_REFRESHED', { ...f.session, access_token: jwt(sessionIdA, 'owner-a', 1800000000) }); f.activity();
  assert.equal(f.storage.get(activityKey), oldActivity); assert.equal(f.signouts, 1);
  f.change('SIGNED_OUT', null); settle({ error: null }); await tick(); assert.equal(f.redirects.length, 1); f.dispose();
});
test("pending expiry uses the browser's current path and query together after navigation", async () => {
  const f = fixture(); let settle; f.signOut = () => new Promise(resolve => { settle = resolve; }); f.seed(f.now - 15 * day); await f.mount();
  f.window.location = { pathname: '/account', search: '?section=collection', hash: '#public-collection', href: 'https://synthetic.invalid/account?section=collection#public-collection' };
  f.change('SIGNED_OUT', null); settle({ error: null }); await tick();
  assert.equal(f.redirects[0], '/login?reason=session-expired&next='+encodeURIComponent('/account?section=collection#public-collection')); f.dispose();
});

for (const reject of [false, true]) test(`failed resume session check does not extend activity (${reject ? "throw" : "result error"})`, async () => {
  const f = await fixture().mount(), before = f.storage.get(activityKey); f.now += hour;
  f.readSession = () => reject ? Promise.reject(new Error("offline")) : Promise.resolve({ data: { session: f.session }, error: new Error("offline") });
  await f.focus(); assert.equal(f.storage.get(activityKey), before); assert.equal(f.signouts, 0); f.dispose();
});

function componentStatements(relative, componentName) {
  const sourcePath = path.join(web, relative), source = fs.readFileSync(sourcePath, "utf8");
  const file = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = file.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === componentName);
  assert.ok(component?.body, `${componentName} component source is required`);
  return { file, statements: component.body.statements };
}

function compileLifecycleHarness(source) {
  const exports = {};
  const code = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
  }).outputText;
  new Function("exports", code)(exports);
  return exports;
}

for (const departure of ["route change", "unmount"]) test("owner service review aborts a stale load before private data can commit on " + departure, async () => {
  let resolveResponse, requestSignal;
  const response = new Promise(resolve => { resolveResponse = resolve; });
  const h = reviewFixture("service", { fetch: request => {
    if (request.method === "GET" && request.url.includes("/api/service-submissions?id=review-a")) { requestSignal = request.signal; return response; }
    if (request.url.startsWith("/api/service-evidence")) return Response.json({ ok: true, evidence: [] });
    if (request.body?.action === "mark_read") return Response.json({ ok: true });
    return Response.json({ ok: true, submission: { id: "review-b", status: "submitted", title: "Current route review", profileTitle: "Current route instrument", requestedVisibility: "private", evidenceCount: 0, provider: {} } });
  } });
  await h.settle(); assert.ok(requestSignal, "actual component issued the old route request");
  if (departure === "route change") { h.route("review-b"); await h.settle(); assert.match(h.text(), /Current route review/); }
  else h.unmount();
  assert.equal(requestSignal.aborted, true, "departure aborts the old request");
  resolveResponse(Response.json({ ok: true, submission: { id: "review-a", status: "submitted", title: "Stale private review", privateProviderNote: "Stale private note", requestedVisibility: "private" } }));
  if (departure === "route change") { await h.settle(); assert.match(h.text(), /Current route review/); assert.doesNotMatch(h.text(), /Stale private/); h.unmount(); }
  else { await tick(); await tick(); assert.equal(h.afterUnmount(), 0, "late response makes no unmounted state writes"); }
});

test("bot welcome state follows route changes even when the Profile identity is unchanged", () => {
  const { file, statements } = componentStatements("components/QRGuitarBotPopup.tsx", "QRGuitarBotPopup");
  const name = statements.find((node) => ts.isVariableStatement(node) && node.declarationList.declarations.some((declaration) => declaration.name.getText(file) === "profileInstrumentName"));
  const effect = statements.find((node) => ts.isExpressionStatement(node) && node.getText(file).includes("setMessages(["));
  assert.ok(name && effect, "bot route-aware welcome lifecycle source is required");
  const harness = compileLifecycleHarness(`export function run(d:any){const {pathname,instrument,useEffect,setMessages}=d;${name.getText(file)}${effect.getText(file)}}`);
  const instrument = { qrCode: "QRG-SAME", name: "Route test guitar", brand: "Test" };
  const render = (pathname) => {
    let message, dependencies;
    harness.run({ pathname, instrument, setMessages: (value) => { message = value[0].copy; }, useEffect: (callback, deps) => { dependencies = deps; callback(); } });
    return { message, dependencies };
  };
  const profile = render("/i/QRG-SAME"), editor = render("/edit/QRG-SAME");
  assert.match(profile.message, /Route test guitar/);
  assert.doesNotMatch(editor.message, /Route test guitar/);
  assert.notDeepEqual(profile.dependencies, editor.dependencies);
});

test('late initial null cannot clear the clock of a confirmed session',async()=>{const f=fixture();f.seed(f.now-hour);await f.mount();const before=[f.storage.get(startedKey),f.storage.get(activityKey),f.storage.get(identityKey)];f.change('INITIAL_SESSION',null);assert.deepEqual([f.storage.get(startedKey),f.storage.get(activityKey),f.storage.get(identityKey)],before);f.dispose();});
