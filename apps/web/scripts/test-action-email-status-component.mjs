import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(path.join(root, "package.json"));
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { act, create } = require("react-test-renderer");
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const source = fs.readFileSync(path.join(root, "components/ActionEmailStatus.tsx"), "utf8");
const module = { exports: {} };
const EmptyIcon = props => React.createElement("svg", props);
const Link = ({ children, ...props }) => React.createElement("a", props, children);
const localRequire = specifier => {
  if (specifier === "react") return React;
  if (specifier === "next/link") return Link;
  if (specifier === "lucide-react") return { ChevronDown: EmptyIcon, RefreshCw: EmptyIcon };
  if (specifier === "./UiTextProvider") return { useUiText: () => ui };
  if (specifier === "../lib/supabase-browser") return { createBrowserSupabaseClient() { throw new Error("No live auth in component tests"); } };
  if (specifier.endsWith(".module.css")) return new Proxy({}, { get: (_target, key) => String(key) });
  return require(specifier);
};
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
new Function("require", "module", "exports", compiled)(localRequire, module, module.exports);
const { ActionEmailStatusView, actionEmailResolutionValid, actionEmailSessionChanged, parseActionEmailItem, parseActionEmailPage, requestActionEmailStatus } = module.exports;
const ui = (_key, fallback, values = {}) => Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{{${key}}}`, String(value)), fallback);
const intentId = "10000000-0000-4000-8000-000000000001";
const claimId = "20000000-0000-4000-8000-000000000002";
const submissionId = "30000000-0000-4000-8000-000000000003";
const stamp = "2026-09-27T10:15:00.123456+00:00";
const item = { id: intentId, event: "claim.ownerReview", state: "unknown", attempts: 1, claimId, submissionId: null, updatedAt: stamp, createdAt: stamp, nextAttemptAt: stamp, code: "provider_acceptance_unknown", canRetry: false, canReconcile: true };
const page = { captureEnabled: true, dispatchEnabled: true, queued: 0, unknown: 1, failed: 0, accepted: 0, inFlight: 0, suppressed: 0, oldestPendingAt: stamp, total: 1, offset: 0, limit: 50, items: [item] };
let passed = 0;
async function test(name, run) { await run(); console.log("PASS " + name); passed++; }

await test("DTO projection preserves exact microsecond timestamps and strips private extras", () => {
  const parsed = parseActionEmailItem({ ...item, recipient: "private@example.invalid", providerResponse: "secret" });
  assert.equal(parsed.updatedAt, stamp); assert.equal(parsed.nextAttemptAt, stamp); assert.equal("recipient" in parsed, false); assert.equal("providerResponse" in parsed, false);
  const parsedPage = parseActionEmailPage({ ...page, privateDiagnostics: "secret", items: [{ ...item, note: "private" }] });
  assert.equal(parsedPage.items[0].updatedAt, stamp); assert.equal(JSON.stringify(parsedPage).includes("secret"), false); assert.equal(JSON.stringify(parsedPage).includes("private"), false);
  assert.equal(parseActionEmailPage({ ...page, items: [{ ...item, updatedAt: "2026-09-27T10:15:00.1234567Z" }] }), null);
});

await test("default-disabled GET is a normal off result with no follow-up request", async () => {
  const calls = [];
  const result = await requestActionEmailStatus({ token: "token", offset: 0, fetcher: async (url, init) => { calls.push({ url: String(url), init }); return Response.json({ ok: false, code: "disabled", message: "Action-email operator controls are not enabled." }); } });
  assert.equal(result.kind, "disabled"); assert.equal(calls.length, 1); assert.equal(calls[0].url, "/api/admin/action-email?offset=0"); assert.equal(calls[0].init.headers.authorization, "Bearer token");
});

await test("lost PATCH response reconciles once on the originating page without replay", async () => {
  const calls = [];
  const accepted = { ...item, state: "accepted", canReconcile: false };
  const orderedRows = Array.from({ length: 50 }, (_value, index) => ({ ...item, id: `${String(index + 1).padStart(8, "0")}-0000-4000-8000-000000000001` })).concat(accepted);
  const fetcher = async (url, init) => {
    calls.push({ url: String(url), init });
    if (init.method === "PATCH") throw new Error("Reply lost after commit");
    const offset = Number(new URL(String(url), "https://test.invalid").searchParams.get("offset"));
    return Response.json({ ok: true, status: { ...page, accepted: 1, unknown: 0, total: orderedRows.length, offset, items: orderedRows.slice(offset, offset + 50) } });
  };
  const input = { intentId, expectedUpdatedAt: stamp, resolution: "confirmed_accepted", reason: " Provider log confirms acceptance. ", providerMessageId: " receipt-123 " };
  const result = await requestActionEmailStatus({ token: "admin-token", offset: 50, input, fetcher });
  assert.equal(result.kind, "ready"); assert.equal(result.reconciled, true); assert.equal(result.status.offset, 50); assert.equal(calls.length, 2); assert.equal(calls.filter(call => call.init.method === "PATCH").length, 1); assert.equal(calls[1].url, "/api/admin/action-email?offset=50");
  const body = JSON.parse(calls[0].init.body); assert.equal(body.expectedUpdatedAt, stamp); assert.equal(body.reason, "Provider log confirms acceptance."); assert.equal(body.providerMessageId, "receipt-123"); assert.deepEqual(Object.keys(body).sort(), ["expectedUpdatedAt", "intentId", "providerMessageId", "reason", "resolution"]);
});

await test("PATCH receipt alone never claims success when refreshed state is unchanged", async () => {
  const calls = [];
  const fetcher = async (_url, init) => { calls.push(init); return init.method === "PATCH" ? Response.json({ ok: true, status: { ...item, state: "accepted", canReconcile: false } }) : Response.json({ ok: true, status: page }); };
  const result = await requestActionEmailStatus({ token: "token", offset: 0, input: { intentId, expectedUpdatedAt: stamp, resolution: "confirmed_accepted", reason: "Provider evidence reviewed.", providerMessageId: "receipt" }, fetcher });
  assert.equal(result.kind, "unconfirmed"); assert.equal(calls.length, 2); assert.equal(calls.filter(call => call.method === "PATCH").length, 1);
});

await test("reason and provider receipt validation blocks invalid writes before fetch", async () => {
  let calls = 0; const fetcher = async () => { calls++; return Response.json({ ok: true, status: page }); };
  const base = { intentId, expectedUpdatedAt: stamp, resolution: "confirmed_accepted", reason: "Provider evidence reviewed." };
  for (const input of [{ ...base }, { ...base, providerMessageId: " " }, { ...base, providerMessageId: "receipt", reason: "short" }, { ...base, providerMessageId: "receipt", reason: "line\nbreak evidence" }]) assert.equal((await requestActionEmailStatus({ token: "token", offset: 0, input, fetcher })).kind, "invalid");
  assert.equal(calls, 0); assert.equal(actionEmailResolutionValid({ ...base, providerMessageId: "receipt" }), true);
  assert.equal(actionEmailResolutionValid({ intentId, expectedUpdatedAt: stamp, resolution: "confirmed_not_accepted", reason: "Confirmed not accepted." }), true);
});

await test("account changes invalidate loaded admin state while token refresh does not", () => {
  assert.equal(actionEmailSessionChanged("TOKEN_REFRESHED", claimId, claimId), false);
  assert.equal(actionEmailSessionChanged("INITIAL_SESSION", claimId, submissionId), false);
  assert.equal(actionEmailSessionChanged("SIGNED_IN", claimId, submissionId), true);
  assert.equal(actionEmailSessionChanged("SIGNED_OUT", claimId, undefined), true);
  assert.equal(actionEmailSessionChanged("SIGNED_OUT", "", undefined), true);
});

await test("disabled view is concise and never claims delivery activation", () => {
  const html = renderToStaticMarkup(React.createElement(ActionEmailStatusView, { mode: "disabled", status: null, offset: 0, busy: false, notice: null, ui, onRefresh() {}, onPage() {}, onReconcile() {} }));
  assert.match(html, /Controls off/); assert.match(html, /not enabled/); assert.match(html, /No delivery setting was changed/); assert.doesNotMatch(html, /reported enabled|<dl/);
});

await test("unknown delivery renders evidence workflow, exact timestamp, and no claimant-facing link", () => {
  const service = { ...item, id: submissionId, event: "service.revisionRequested", claimId: null, submissionId };
  const html = renderToStaticMarkup(React.createElement(ActionEmailStatusView, { mode: "ready", status: { ...page, items: [item, service] }, offset: 0, busy: false, notice: null, ui, onRefresh() {}, onPage() {}, onReconcile() {} }));
  assert.match(html, /No automatic retry/); assert.match(html, /<summary><svg/); assert.match(html, /Provider evidence and reason/); assert.match(html, /minLength="10"/); assert.match(html, new RegExp(stamp.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(html, new RegExp(`/service-review/${submissionId}`)); assert.doesNotMatch(html, /ownership-claim\?claim=/); assert.match(html, /These controls do not activate delivery/);
});

await test("component source uses bearer auth, aborts stale work, and is mounted beside existing review status", () => {
  assert.match(source, /auth\.getSession\(\)/); assert.match(source, /Bearer \$\{token\}/); assert.match(source, /onAuthStateChange/); assert.match(source, /controller\.current\?\.abort\(\)/);
  const pageSource = fs.readFileSync(path.join(root, "app/admin/service-workflow/page.tsx"), "utf8");
  assert.match(pageSource, /<ServiceEmailStatus \/>\s*<ActionEmailStatus \/>/); assert.match(pageSource, /components\/ActionEmailStatus/);
});

await test("response-body parsing is bounded and aborts a stalled read", async () => {
  let aborted = false;
  const fetcher = async (_url, init) => {
    init.signal.addEventListener("abort", () => { aborted = true; });
    return { ok: true, json: () => new Promise(() => {}) };
  };
  const result = await requestActionEmailStatus({ token: "token", offset: 0, fetcher, timeoutMs: 8 });
  assert.equal(result.kind, "unavailable"); assert.equal(aborted, true);
});

function mountedHarness(auth, props = {}) {
  const values = [], refs = [], effects = [];
  let stateIndex = 0, refIndex = 0, effectIndex = 0;
  const fakeReact = { ...React,
    useState(initial) { const index = stateIndex++; if (!(index in values)) values[index] = typeof initial === "function" ? initial() : initial; return [values[index], next => { values[index] = typeof next === "function" ? next(values[index]) : next; }]; },
    useRef(initial) { const index = refIndex++; return refs[index] ||= { current: initial }; },
    useCallback(fn) { return fn; },
    useEffect(fn) { effects[effectIndex++] = fn; }
  };
  const mountedModule = { exports: {} };
  const mountedRequire = specifier => {
    if (specifier === "react") return fakeReact;
    if (specifier === "next/link") return Link;
    if (specifier === "lucide-react") return { ChevronDown: EmptyIcon, RefreshCw: EmptyIcon };
    if (specifier === "./UiTextProvider") return { useUiText: () => ui };
    if (specifier === "../lib/supabase-browser") return { createBrowserSupabaseClient: () => ({ auth }) };
    if (specifier.endsWith(".module.css")) return new Proxy({}, { get: (_target, key) => String(key) });
    return require(specifier);
  };
  new Function("require", "module", "exports", compiled)(mountedRequire, mountedModule, mountedModule.exports);
  function render() { stateIndex = 0; refIndex = 0; effectIndex = 0; return mountedModule.exports.ActionEmailStatus(props); }
  const tree = render();
  const cleanup = effects[0]();
  return { values, refs, render, cleanup, tree };
}

const tick = () => new Promise(resolve => setImmediate(resolve));
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function until(predicate) { for (let i = 0; i < 80 && !predicate(); i++) await tick(); assert.ok(predicate(), "mounted state did not settle"); }
function deferred() { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; }
const session = id => ({ data: { session: { access_token: "token-" + id, user: { id } } }, error: null });

await test("mounted pending session is fenced by sign-out before any bearer request", async () => {
  const gate = deferred(), callbacks = []; let fetches = 0;
  const auth = { getSession: () => gate.promise, onAuthStateChange(callback) { callbacks.push(callback); return { data: { subscription: { unsubscribe() {} } } }; } };
  const originalFetch = globalThis.fetch; globalThis.fetch = async () => { fetches++; return Response.json({ ok: false, code: "disabled" }); };
  try {
    const h = mountedHarness(auth); await until(() => h.values[4] === true);
    callbacks[0]("SIGNED_OUT", null); assert.equal(h.values[4], false); assert.equal(h.values[0], "unavailable"); assert.equal(h.values[1], null);
    gate.resolve(session(claimId)); await tick(); await tick();
    assert.equal(fetches, 0); assert.equal(h.values[4], false); assert.match(h.values[3].text, /Account changed/); h.cleanup();
  } finally { globalThis.fetch = originalFetch; }
});

await test("mounted session deadline releases Refresh and ignores late completion", async () => {
  const gate = deferred(), callbacks = []; let fetches = 0;
  const auth = { getSession: () => gate.promise, onAuthStateChange(callback) { callbacks.push(callback); return { data: { subscription: { unsubscribe() {} } } }; } };
  const originalFetch = globalThis.fetch; globalThis.fetch = async () => { fetches++; return Response.json({ ok: false, code: "disabled" }); };
  try {
    const h = mountedHarness(auth, { sessionTimeoutMs: 8 }); await until(() => h.values[4] === true); await delay(20); await until(() => h.values[4] === false);
    assert.equal(h.values[0], "unavailable"); assert.match(h.values[3].text, /unavailable/); assert.equal(fetches, 0);
    gate.resolve(session(claimId)); await tick(); await tick();
    assert.equal(fetches, 0); assert.equal(h.values[0], "unavailable"); assert.equal(h.values[4], false); h.cleanup();
  } finally { globalThis.fetch = originalFetch; }
});

await test("mounted account mismatch never uses the old token and refresh recovers without a stuck lock", async () => {
  const gate = deferred(), callbacks = []; let currentGet = () => gate.promise; const calls = [];
  const auth = { getSession: () => currentGet(), onAuthStateChange(callback) { callbacks.push(callback); return { data: { subscription: { unsubscribe() {} } } }; } };
  const originalFetch = globalThis.fetch; globalThis.fetch = async (url, init) => { calls.push({ url: String(url), authorization: init.headers.authorization }); return Response.json({ ok: false, code: "disabled" }); };
  try {
    const h = mountedHarness(auth); await until(() => h.values[4] === true);
    callbacks[0]("SIGNED_IN", session(submissionId).data.session); gate.resolve(session(claimId)); await tick(); await tick();
    assert.equal(calls.length, 0); assert.equal(h.values[4], false); assert.equal(h.values[0], "unavailable"); assert.match(h.values[3].text, /Account changed/);
    currentGet = async () => session(submissionId);
    h.render().props.onRefresh(); await until(() => h.values[0] === "disabled" && h.values[4] === false);
    assert.equal(calls.length, 1); assert.equal(calls[0].authorization, "Bearer token-" + submissionId); h.cleanup();
  } finally { globalThis.fetch = originalFetch; }
});
await test("delivery draft survives the same record version and clears on updatedAt change", async () => {
  const props = current => ({ mode: "ready", status: { ...page, items: [current] }, offset: 0, busy: false, notice: null, ui, onRefresh() {}, onPage() {}, onReconcile() {} });
  let renderer;
  await act(async () => { renderer = create(React.createElement(ActionEmailStatusView, props(item))); });
  await act(async () => {
    renderer.root.findByType("select").props.onChange({ target: { value: "confirmed_accepted" } });
    renderer.root.findByType("textarea").props.onChange({ target: { value: "Provider evidence reviewed." } });
  });
  await act(async () => { renderer.root.findByType("input").props.onChange({ target: { value: "provider-receipt" } }); });
  await act(async () => { renderer.update(React.createElement(ActionEmailStatusView, props({ ...item, code: "provider_still_unknown" }))); });
  assert.equal(renderer.root.findByType("select").props.value, "confirmed_accepted"); assert.equal(renderer.root.findByType("textarea").props.value, "Provider evidence reviewed."); assert.equal(renderer.root.findByType("input").props.value, "provider-receipt");
  const changed = { ...item, updatedAt: "2026-09-27T10:15:00.123457+00:00" };
  await act(async () => { renderer.update(React.createElement(ActionEmailStatusView, props(changed))); });
  assert.equal(renderer.root.findByType("select").props.value, ""); assert.equal(renderer.root.findByType("textarea").props.value, ""); assert.equal(renderer.root.findAllByType("input").length, 0);
  await act(async () => { renderer.unmount(); });
});
console.log(`${passed} action-email status component cases passed.`);
