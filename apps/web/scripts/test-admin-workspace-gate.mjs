import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const require = createRequire(path.join(repo, "apps/web/package.json"));
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

function compile(relative, imports, globals = {}) {
  const source = fs.readFileSync(path.join(repo, "apps/web", relative), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", ...Object.keys(globals), code)((name) => imports[name] ?? require(name), module, module.exports, ...Object.values(globals));
  return module.exports;
}

const View = compile("components/AdminWorkspaceGate.tsx", {
  react: React,
  "next/link": { __esModule: true, default: ({ href, children, ...props }) => React.createElement("a", { href, ...props }, children) },
  "./BrandLogo": { BrandLogo: () => React.createElement("img", { alt: "QRguitar logo" }) },
  "next/navigation": { useRouter: () => ({ replace() {} }) },
  "../lib/use-auth-navigation": { useAuthNavigation: () => ({ logout: async () => true, signingOut: false, logoutError: "" }) },
  "../lib/supabase-browser": { createBrowserSupabaseClient: () => { throw new Error("View must not request auth"); } },
  "./AdminWorkspaceGate.module.css": { __esModule: true, default: new Proxy({}, { get: (_target, name) => String(name) }) }
}).AdminWorkspaceGateView;

const render = (phase) => renderToStaticMarkup(React.createElement(View, {
  phase, returnPath: "/admin/payments", onRetry: () => {}
}, React.createElement("span", null, "PRIVATE_WORKSPACE_CONTROL")));

test("signed-out, denied, loading and unavailable views never expose workspace controls", () => {
  for (const phase of ["checking", "signed-out", "denied", "unavailable"]) {
    const html = render(phase);
    assert.doesNotMatch(html, /PRIVATE_WORKSPACE_CONTROL/);
    assert.match(html, /QRguitar logo/);
    assert.match(html, /Admin workspace/);
  }
});

test("signed-out view preserves the requested admin destination", () => {
  const html = render("signed-out");
  assert.match(html, /href="\/login\?next=%2Fadmin%2Fpayments"/);
  assert.doesNotMatch(html, /Legacy manual-payment archive|New promo code/);
});

test("denied and unavailable views offer the appropriate recovery", () => {
  assert.doesNotMatch(render("denied"), /href="\/login\?next=/);
  assert.match(render("denied"), /href="\/dashboard"/);
  assert.doesNotMatch(render("denied"), /href="\/admin"/);
  assert.match(render("unavailable"), /Try again/);
  assert.match(render("unavailable"), /role="alert"/);
  assert.match(render("expired"), /Sign out and sign in again/);
  assert.doesNotMatch(render("expired"), /href="\/login\?next=/);
});

test("authorized view renders the workspace without a second shell", () => {
  const html = render("ready");
  assert.match(html, /PRIVATE_WORKSPACE_CONTROL/);
  assert.doesNotMatch(html, /Admin workspace/);
});

test("access endpoint uses server authorization for both denied and allowed requests", async () => {
  let allowed = false;
  const route = compile("app/api/admin/access/route.ts", {
    "../_utils": {
      requireAdmin: async () => allowed ? { ok: true } : { ok: false, response: new Response("denied", { status: 403 }) },
      adminJson: (body) => new Response(JSON.stringify(body), { status: 200 })
    }
  });
  assert.equal((await route.GET(new Request("https://example.test/api/admin/access"))).status, 403);
  allowed = true;
  const response = await route.GET(new Request("https://example.test/api/admin/access"));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
});

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fixture(initialSession) {
  const states = [], effects = [], requests = [], redirects = [], timers = new Map();
  let cursor = 0, effectCursor = 0, dirty = true, listener, nextTimer = 0;
  const auth = {
    onAuthStateChange(callback) { listener = callback; return { data: { subscription: { unsubscribe() { listener = null; } } } }; },
    getSession: async () => ({ data: { session: initialSession } })
  };
  const hooks = {
    useState(initial) { const index = cursor++; if (!(index in states)) states[index] = initial; return [states[index], (value) => {
      const next = typeof value === "function" ? value(states[index]) : value;
      if (!Object.is(states[index], next)) { states[index] = next; dirty = true; }
    }]; },
    useRef(initial) { const index = cursor++; return states[index] ||= { current: initial }; },
    useCallback(callback) { return callback; },
    useEffect(run, dependencies) {
      const index = effectCursor++, old = effects[index];
      if (!old || dependencies.some((value, i) => !Object.is(old.dependencies[i], value))) effects[index] = { run, dependencies, cleanup: old?.cleanup, pending: true };
    }
  };
  const Component = compile("components/AdminWorkspaceGate.tsx", {
    react: hooks,
    "next/link": { __esModule: true, default: "a" },
    "next/navigation": { useRouter: () => ({ replace: (url) => redirects.push(url) }) },
    "./BrandLogo": { BrandLogo: "img" },
    "../lib/use-auth-navigation": { useAuthNavigation: () => ({ logout: async () => true, signingOut: false, logoutError: "" }) },
    "../lib/supabase-browser": { createBrowserSupabaseClient: () => ({ auth }) },
    "./AdminWorkspaceGate.module.css": { __esModule: true, default: {} }
  }, {
    window: { setTimeout(callback) { const id = ++nextTimer; timers.set(id, callback); return id; }, clearTimeout(id) { timers.delete(id); } },
    fetch: (_url, init) => { const pending = deferred(); requests.push({ ...pending, init }); return pending.promise; }
  }).AdminWorkspaceGate;
  let tree;
  function render() {
    let limit = 20;
    while (dirty) {
      assert.ok(limit--, "render loop"); dirty = false; cursor = effectCursor = 0;
      tree = Component({ returnPath: "/admin/payments", children: "PRIVATE_WORKSPACE_CONTROL" });
      for (const effect of effects) if (effect.pending) { effect.pending = false; effect.cleanup?.(); effect.cleanup = effect.run(); }
    }
    return tree.props.phase;
  }
  return {
    requests, redirects, timers, auth,
    render,
    async flush() { await new Promise((resolve) => setImmediate(resolve)); return render(); },
    emit(session, event = "TOKEN_REFRESHED") { listener(event, session); return render(); },
    get view() { return tree.props; },
    dispose() { for (const effect of effects) effect.cleanup?.(); }
  };
}

const session = (actor, token = actor) => actor ? { user: { id: actor }, access_token: token } : null;
const allow = { ok: true, status: 200, json: async () => ({ ok: true }) };

test("same-actor token refresh keeps the authorized workspace mounted", async () => {
  const f = fixture(session("a", "old"));
  try {
    assert.equal(f.render(), "checking");
    await f.flush();
    f.requests[0].resolve(allow);
    assert.equal(await f.flush(), "ready");
    assert.equal(f.emit(session("a", "new")), "ready");
    assert.equal(f.requests.length, 2);
    f.requests[1].resolve(allow);
    assert.equal(await f.flush(), "ready");
  } finally { f.dispose(); }
});

test("actor change hides workspace immediately and ignores stale authorization", async () => {
  const f = fixture(session("a"));
  try {
    f.render(); await f.flush();
    assert.equal(f.emit(session("b"), "SIGNED_IN"), "checking");
    f.requests[0].resolve(allow); assert.equal(await f.flush(), "checking");
    f.requests[1].resolve(allow); assert.equal(await f.flush(), "ready");
    assert.equal(f.emit(null, "SIGNED_OUT"), "signed-out");
  } finally { f.dispose(); }
});

test("cached actor with API 401 gets a sign-out action, never a login bounce", async () => {
  const f = fixture(session("a"));
  try {
    f.render(); await f.flush();
    f.requests[0].resolve({ ok: false, status: 401 });
    assert.equal(await f.flush(), "expired");
    assert.equal(f.redirects.length, 0);
    f.view.onSignOut();
    await f.flush();
    assert.equal(f.redirects[0], "/login?reason=session-expired&next=%2Fadmin%2Fpayments");
  } finally { f.dispose(); }
});

test("denial, invalid success payload, timeout and settled sign-out fail closed", async () => {
  const f = fixture(session("a"));
  try {
    f.render(); await f.flush();
    f.requests[0].resolve({ ok: false, status: 403 }); assert.equal(await f.flush(), "denied");
    f.emit(session("a", "refreshed"));
    f.requests[1].resolve({ ok: true, status: 200, json: async () => ({ ok: false }) });
    assert.equal(await f.flush(), "unavailable");
    f.emit(session("a", "retry"));
    const timeout = [...f.timers.values()][0];
    timeout();
    f.requests[2].reject(new Error("aborted"));
    assert.equal(await f.flush(), "unavailable");
    assert.equal(f.emit(null, "SIGNED_OUT"), "signed-out");
  } finally { f.dispose(); }
});
