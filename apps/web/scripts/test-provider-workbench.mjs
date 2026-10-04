import { withUiTextTestContext } from "./ui-text-test-context.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(process.env.QRGUITAR_SOURCE_ROOT ? path.join(process.env.QRGUITAR_SOURCE_ROOT, "package.json") : import.meta.url);
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const source = fs.readFileSync(path.join(root, "app/dashboard/service/page.tsx"), "utf8");
const ast = ts.createSourceFile("service-workbench.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const functions = new Map(), effects = [];
let statusSource;
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node.getText(ast).replace("export default ", ""));
  if (ts.isCallExpression(node) && node.expression.getText(ast) === "useEffect") effects.push(node.arguments[0].getText(ast));
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "statuses") statusSource = "const " + node.getText(ast) + ";";
  ts.forEachChild(node, visit);
}
visit(ast);
function compile(code, env, result) {
  const { useUiText } = withUiTextTestContext(() => { throw new Error("Unexpected module"); })("UiTextProvider");
  env = { useUiText, ui: useUiText("app.dashboard.service.page"), ...env };
  const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
  return new Function(...Object.keys(env), js + "\nreturn " + result)(...Object.values(env));
}
const statuses = compile(statusSource, {}, "statuses");
const isWorkItem = compile(functions.get("isWorkItem"), { statuses }, "isWorkItem");
const helpers = Object.fromEntries(["filterProviderWork", "serviceWorkHref", "newServiceWorkHref", "updatedLabel"].map((name) => [name, compile(functions.get(name), {}, name)]));
const item = (status = "draft", patch = {}) => ({ id: "draft-one", qrCode: "QRG-123456", profileTitle: "Test guitar", title: "Fret dress", status, workOrderReference: "WO-123", serviceType: "Fretwork", evidenceCount: 2, emailDeliveryStatus: "not_attempted", updatedAt: "2026-09-17T12:00:00Z", ...patch });
const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function setters(state) { return Object.fromEntries(Object.keys(state).map((key) => ["set" + key[0].toUpperCase() + key.slice(1), (value) => { state[key] = typeof value === "function" ? value(state[key]) : value; }])); }
let passes = 0;
async function test(name, run) { await run(); passes++; console.log("PASS " + name); }

for (const outcome of ["empty", "populated", "503", "missing-array", "invalid-status", "invalid-evidence", "missing-token"]) await test(`provider load ${outcome} preserves empty/error distinction`, async () => {
  let calls = 0;
  const controller = new AbortController();
  const fn = compile(functions.get("loadProviderWork"), { isWorkItem, fetch: async (url, init) => {
    calls++; assert.equal(url, "/api/service-submissions?scope=provider"); assert.equal(init.cache, "no-store"); assert.equal(init.signal, controller.signal); assert.equal(init.method, undefined);
    if (outcome === "503") return Response.json({ ok: false, message: "Read unavailable" }, { status: 503 });
    if (outcome === "missing-array") return Response.json({ ok: true });
    return Response.json({ ok: true, submissions: outcome === "empty" ? [] : [item(outcome === "invalid-status" ? "invented" : "draft", outcome === "invalid-evidence" ? { evidenceCount: -1 } : {})] });
  } }, "loadProviderWork");
  if (["empty", "populated"].includes(outcome)) assert.equal((await fn("token", controller.signal)).length, outcome === "empty" ? 0 : 1);
  else await assert.rejects(fn(outcome === "missing-token" ? "" : "token", controller.signal));
  assert.equal(calls, outcome === "missing-token" ? 0 : 1);
});

await test("every actual status can be filtered without changing its meaning", async () => {
  const rows = Object.keys(statuses).map((status) => item(status, { id: status }));
  for (const status of Object.keys(statuses)) assert.deepEqual(helpers.filterProviderWork(rows, status, "").map((row) => row.id), [status]);
  assert.equal(helpers.filterProviderWork(rows, "all", "").length, 7);
});
for (const query of ["wo-123", "fret DRESS", "test Guitar", " qrg-123456 "]) await test(`search finds ${query} across work-order/title/instrument/QR fields`, async () => {
  assert.equal(helpers.filterProviderWork([item()], "all", query).length, 1);
  assert.equal(helpers.filterProviderWork([item()], "approved", query).length, 0);
});
await test("resume URL keeps submission identity and safely encodes routing values", async () => {
  assert.equal(helpers.serviceWorkHref(item()), "/service-work/QRG-123456?submission=draft-one");
  assert.equal(helpers.serviceWorkHref({ qrCode: "QRG-A/B", id: "id&other" }), "/service-work/QRG-A%2FB?submission=id%26other");
  assert.equal(helpers.serviceWorkHref({ qrCode: "", id: "one" }), "");
});
await test("new work accepts complete IDs without changing an instrument identifier", async () => {
  assert.equal(helpers.newServiceWorkHref(" qrg-123456 "), "/service-work/QRG-123456");
  for (const invalid of ["", "123456", "QRG-", "https://example.invalid/i/QRG-ONE", "QRG-<script>", "QRG-ONE/other", "QRG-" + "A".repeat(77)]) assert.equal(helpers.newServiceWorkHref(invalid), "");
});

const authEffect = effects.find((effect) => effect.includes("let authResolved"));
function authHarness() {
  const initial = deferred(); let listener, timer, unsubscribed = false;
  const state = { session: { userId: "old", token: "old-token" }, authChecked: false, authError: "", items: [{ secret: "old" }], error: "", search: "old", status: "draft", qrCode: "QRG-OLD", startError: "" };
  const revision = { current: 0 };
  const env = { ...setters(state), userId: { current: "old" }, accountRevision: revision, window: { setTimeout: (fn) => { timer = fn; return 1; }, clearTimeout() {} }, createBrowserSupabaseClient: () => ({ auth: { getSession: () => initial.promise, onAuthStateChange(fn) { listener = fn; return { data: { subscription: { unsubscribe() { unsubscribed = true; } } } }; } } }) };
  const dispose = compile("const effect = " + authEffect + ";", env, "effect")();
  return { state, initial, revision, dispose, event: (session) => listener("TEST", session), timeout: () => timer(), unsubscribed: () => unsubscribed };
}
await test("account change immediately clears private rows and late initial session cannot restore them", async () => {
  const h = authHarness(); h.event({ user: { id: "new" }, access_token: "new-token" });
  assert.equal(h.state.items, null); assert.equal(h.state.qrCode, ""); assert.equal(h.state.search, ""); assert.equal(h.state.session.userId, "new");
  h.initial.resolve({ data: { session: { user: { id: "old" }, access_token: "old-token" } } }); await tick();
  assert.equal(h.state.session.userId, "new");
  h.event(null); assert.equal(h.state.session, null); assert.equal(h.state.items, null); h.dispose(); assert.equal(h.unsubscribed(), true);
});
await test("sign-in deadline presents a retryable error and ignores late initial result", async () => {
  const h = authHarness(); h.timeout();
  assert.equal(h.state.authChecked, true); assert.equal(h.state.items, null); assert.match(h.state.authError, /Try again/);
  h.initial.resolve({ data: { session: { user: { id: "old" }, access_token: "old-token" } } }); await tick(); assert.equal(h.state.session, null); h.dispose();
});

const loadEffect = effects.find((effect) => effect.includes("loadProviderWork(session.token"));
function loadHarness(loader) {
  let timer, signal;
  const revision = { current: 1 };
  const state = { items: [item()], loading: false, error: "" };
  const env = { ...setters(state), session: { userId: "provider", token: "token" }, accountRevision: revision, AbortController, window: { setTimeout: (fn) => { timer = fn; return 1; }, clearTimeout() {} }, loadProviderWork: (token, nextSignal) => { signal = nextSignal; return loader(token, nextSignal); } };
  const dispose = compile("const effect = " + loadEffect + ";", env, "effect")();
  return { state, revision, dispose, timeout: () => timer(), signal: () => signal };
}
await test("failed refresh preserves the last loaded snapshot and reports failure", async () => {
  const h = loadHarness(async () => { throw new Error("Related read failed"); }); await tick();
  assert.equal(h.state.items[0].id, "draft-one"); assert.equal(h.state.error, "Related read failed"); assert.equal(h.state.loading, false); h.dispose();
});
await test("late request for an old account cannot populate the new account", async () => {
  const response = deferred(); const h = loadHarness(() => response.promise);
  h.revision.current++; h.state.items = null; response.resolve([item()]); await tick(); assert.equal(h.state.items, null); h.dispose();
});
await test("read deadline aborts transport and ignores a late successful snapshot", async () => {
  const response = deferred(); const h = loadHarness(() => response.promise); h.timeout();
  assert.equal(h.signal().aborted, true); assert.equal(h.state.loading, false); assert.match(h.state.error, /too long/);
  response.resolve([]); await tick(); assert.equal(h.state.items.length, 1); h.dispose();
});
await test("successful empty refresh replaces prior records without implying a failure", async () => {
  const h = loadHarness(async () => []); await tick(); assert.deepEqual(h.state.items, []); assert.equal(h.state.error, ""); assert.equal(h.state.loading, false); h.dispose();
});

function render(items, overrides = {}) {
  const values = [{ userId: "provider", token: "token" }, true, "", 0, items, false, "", 0, "all", "", "", ""];
  for (const [key, value] of Object.entries(overrides)) values[Number(key)] = value;
  let index = 0;
  const empty = () => null;
  const component = compile(functions.get("ServiceWorkbenchPage"), {
    React, statuses, ...helpers, useRouter: () => ({ push() {} }), useState: () => [values[index++], () => {}], useRef: (value) => ({ current: value }), useMemo: (fn) => fn(), useEffect() {},
    Nav: empty, Footer: empty, ArrowLeft: empty, ArrowUpRight: empty, FileLock2: empty, RefreshCw: empty, Search: empty, Wrench: empty,
    Link: ({ children, ...props }) => React.createElement("a", props, children), styles: new Proxy({}, { get: (_, name) => name })
  }, "ServiceWorkbenchPage");
  return renderToStaticMarkup(React.createElement(component));
}
await test("rendered requests separate lifecycle, authorized attachments and review email", async () => {
  const html = render([item("changes_requested", { emailDeliveryStatus: "failed" })]);
  assert.match(html, /Changes requested/); assert.match(html, /Review attachments/);
  assert.match(html, /Attachments are available only to authorized accounts\./);
  assert.match(html, /A sent email does not mean the owner has approved the work\./); assert.match(html, /2 files/); assert.match(html, /Review email/); assert.match(html, /Delivery failed/);
  assert.match(html, /Resume Fret dress/); assert.match(html, /submission=draft-one/); assert.match(html, /Showing 1 of 1 loaded requests/);
});
await test("closed statuses offer View and initial errors never look like an empty workbench", async () => {
  for (const status of ["submitted", "approved", "declined", "cancelled", "expired"]) assert.match(render([item(status)]), /View Fret dress/);
  const html = render(null, { 6: "Unavailable" }); assert.match(html, /Unavailable/); assert.doesNotMatch(html, /Your first service record starts here|No service requests yet\.|Requests loaded/);
  const empty = render([]);
  assert.match(empty, /No service requests yet\./);
  assert.match(empty, /The Profile owner decides whether to approve and share the service entry\./);
});
console.log(`${passes} provider workbench behavior cases passed.`);
