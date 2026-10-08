import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url), ts = require("typescript"), React = require("react");
const root = path.resolve(import.meta.dirname, "..");
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const review = { id: "review-a", status: "submitted", qrCode: "QRG-FIXTURE", profileTitle: "Fixture instrument", title: "Fixture service", requestedVisibility: "private", evidenceCount: 2, provider: {} };
const session = { access_token: "synthetic-token", user: { id: "actor-a" } };
const names = { service: "app/service-review/[id]/page.tsx", transfer: "app/transfer/[id]/page.tsx", messages: "components/MessagesClient.tsx" };
const expand = tree => tree?.type?.name === "MessageState" ? tree.type(tree.props) : tree;
const words = value => { const tree = expand(value); return typeof tree === "string" || typeof tree === "number" ? String(tree) : tree && typeof tree === "object" ? React.Children.toArray(tree.props?.children).map(words).join("") : ""; };
function nodes(value) { const tree = expand(value); return !tree || typeof tree !== "object" ? [] : [tree, ...React.Children.toArray(tree.props?.children).flatMap(nodes)]; }

// Execute actual route/component source with deterministic hooks and in-memory
// response fixtures. No local service, account, customer record, or real request.
export function fixture(kind = "service", options = {}) {
  let routeId = kind === "transfer" ? "transfer-a" : "review-a";
  const values = [], effects = [], memo = [], timers = new Map(), requests = [], navigations = [];
  let cursor = 0, effectCursor = 0, memoCursor = 0, timerId = 0, dirty = true, mounted = true, tree, callback, writesAfterUnmount = 0;
  let ui = (key, fallback) => options.content?.[key] ?? fallback;
  let conversationId = options.conversationId ?? "conversation-a";
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in values)) values[index] = options.initial?.[index] ?? (typeof initial === "function" ? initial() : initial);
      return [values[index], next => { if (!mounted) { writesAfterUnmount++; return; } const value = typeof next === "function" ? next(values[index]) : next; if (!Object.is(value, values[index])) { values[index] = value; dirty = true; } }];
    },
    useRef(initial) { const index = cursor++; return values[index] ||= { current: initial }; },
    useMemo(fn) { return fn(); },
    useCallback(fn, deps) { const index = memoCursor++, old = memo[index]; if (!old || deps.some((value, i) => !Object.is(value, old.deps[i]))) memo[index] = { fn, deps }; return memo[index].fn; },
    useEffect(run, deps) { const index = effectCursor++, old = effects[index]; if (!old || deps.some((value, i) => !Object.is(value, old.deps[i]))) effects[index] = { run, deps, cleanup: old?.cleanup, pending: true }; }
  };
  const auth = {
    getSession: () => options.getSession?.() ?? Promise.resolve({ data: { session: currentSession }, error: null }),
    onAuthStateChange(fn) { callback = fn; return { data: { subscription: { unsubscribe() {} } } }; }
  };
  let currentSession = session;
  const setTimer = (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms }); return id; };
  const clearTimer = id => timers.delete(id);
  const libraries = new Map();
  function library(name) {
    if (libraries.has(name)) return libraries.get(name);
    const module = { exports: {} };
    const code = ts.transpileModule(fs.readFileSync(path.join(root, "lib", name + ".ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    new Function("require", "module", "exports", "fetch", "setTimeout", "clearTimeout", code)(modules, module, module.exports, fakeFetch, setTimer, clearTimer);
    libraries.set(name, module.exports); return module.exports;
  }
  const fakeFetch = async (url, init = {}) => {
    const request = { url, method: init.method || "GET", body: init.body ? JSON.parse(init.body) : undefined, signal: init.signal };
    requests.push(request);
    if (options.fetch) return options.fetch(request);
    if (kind === "transfer") return Response.json({ ok: true, transfer: { id: "transfer-a", status: "accepted", guitarQrCode: "QRG-FIXTURE" } });
    if (url.startsWith("/api/service-evidence")) return Response.json({ ok: true, evidence: [] });
    if (request.body?.action === "mark_read") return Response.json({ ok: true });
    return Response.json({ ok: true, submission: review });
  };
  const modules = name => {
    if (name === "react") return hooks;
    if (name === "react/jsx-runtime") return require(name);
    if (name.endsWith("UiTextProvider")) return { useUiText: () => ui };
    if (name === "lucide-react") return new Proxy({}, { get: () => () => null });
    if (name === "next/link") return { __esModule: true, default: "a" };
    if (name === "next/navigation") return { useParams: () => ({ id: routeId }), useSearchParams: () => new URLSearchParams() };
    if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
    if (name.endsWith("/Nav") || name.endsWith("/Footer")) return { Nav: () => null, Footer: () => null };
    if (name.endsWith("/content-registry")) return { getContentValue: (_, key) => ({ "serviceReview.actions.approve": "Approve", "serviceReview.actions.revise": "Request changes", "serviceReview.actions.decline": "Decline" })[key] || key };
    if (name.endsWith("/use-site-content")) return { useSiteContent: () => ({}) };
    if (name.endsWith("/supabase-browser")) return { createBrowserSupabaseClient: () => ({ auth, channel: () => { const channel = { on: () => channel, subscribe: fn => { options.onChannelSubscribe?.(fn); return channel; } }; return channel; }, removeChannel: async () => {}, storage: { from: () => ({ uploadToSignedUrl: (...args) => options.upload?.(...args) ?? Promise.resolve({ error: null }) }) } }), getSupabaseAccessToken: () => options.getToken?.() ?? Promise.resolve("synthetic-token") };
    if (name.endsWith("/use-auth-navigation")) return { useAuthNavigation: () => ({ logout: options.logout || (async () => false), signingOut: false, logoutError: options.logoutError || "" }) };
    if (name.endsWith("/local-demo")) return { transferStatusLabel: value => value.status };
    if (name.endsWith("/optional-tracking-consent")) return { optionalTrackingProductEvents: {}, dispatchOptionalTrackingProductEvent: async () => true };
    if (name.endsWith("/member-messaging")) return library("member-messaging");
    if (name.endsWith("/message-session")) return library("message-session");
    if (name.endsWith("/service-corrections-client")) return library("service-corrections-client");
    if (name.endsWith("/ServiceCorrections")) {
      const componentKey = "component/ServiceCorrections";
      if (libraries.has(componentKey)) return libraries.get(componentKey);
      const actual = { exports: {} };
      const componentSource = fs.readFileSync(path.join(root, "components/ServiceCorrections.tsx"), "utf8");
      const componentCode = ts.transpileModule(componentSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
      new Function("require", "module", "exports", componentCode)(modules, actual, actual.exports);
      libraries.set(componentKey, actual.exports); return actual.exports;
    }
    throw new Error(`Unexpected test import: ${name}`);
  };
  const source = fs.readFileSync(path.join(root, names[kind]), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", "fetch", "setTimeout", "clearTimeout", "window", "document", code)(modules, module, module.exports, fakeFetch,
    setTimer, clearTimer, { location: { assign: url => navigations.push(url) }, setInterval: setTimer, clearInterval: clearTimer, addEventListener() {}, removeEventListener() {}, requestAnimationFrame: fn => fn() }, { visibilityState: "visible", addEventListener() {}, removeEventListener() {} });
  const Component = kind === "messages" ? module.exports.MessagesClient : module.exports.default;
  const h = {
    requests, timers, navigations,
    route(id) { routeId = id; h.render(); },
    render() { dirty = true; let turns = 0; while (dirty) { assert.ok(turns++ < 20, "render loop"); dirty = false; cursor = effectCursor = memoCursor = 0; tree = Component(kind === "messages" ? { conversationId } : {}); if (!options.skipEffects) for (const effect of effects) if (effect.pending) { effect.pending = false; effect.cleanup?.(); effect.cleanup = effect.run(); } } return tree; },
    content(patch) { ui = (key, fallback) => patch[key] ?? fallback; h.render(); },
    conversation(id) { conversationId = id; h.render(); },
    elements() { return nodes(h.render()); },
    button(label) { const node = h.elements().find(n => n.type === "button" && words(n).trim() === label); assert.ok(node, `Missing button: ${label}`); return node; },
    text() { return words(h.render()); },
    async settle() { for (let i = 0; i < 4; i++) { await tick(); h.render(); } },
    auth(value) { currentSession = value; callback("SIGNED_IN", value); h.render(); },
    authEvent(event, value, flush = true) { callback(event, value); if (flush) h.render(); },
    unmount() { for (const effect of effects) effect.cleanup?.(); mounted = false; },
    afterUnmount() { return writesAfterUnmount; },
    decisions() { return requests.filter(r => ["approve", "request_changes", "decline"].includes(r.body?.action)); },
    expire() { const pending = [...timers.entries()]; for (const [id, timer] of pending) { timers.delete(id); timer.fn(); } }
  };
  h.render(); return h;
}
async function ready(kind = "service", options = {}) { const h = fixture(kind, options); await h.settle(); return h; }
function serviceFetch(run) { return request => request.body?.action === "mark_read" ? Response.json({ ok: true }) : request.url.startsWith("/api/service-evidence") ? Response.json({ ok: true, evidence: [] }) : run(request); }

test("session startup is loading, not an incorrect sign-in prompt", async () => {
  const d = deferred(), h = fixture("service", { getSession: () => d.promise });
  assert.match(h.text(), /Loading private submission/); assert.doesNotMatch(h.text(), /Owner sign-in required/);
  d.resolve({ data: { session }, error: null }); await h.settle(); assert.ok(h.button("Approve")); h.unmount();
});

for (const [label, action] of [["Approve", "approve"], ["Request changes", "request_changes"], ["Decline", "decline"]]) {
  test(`${action}: lost response releases busy but locks decisions until saved status is checked`, async () => {
    const h = await ready("service", { fetch: serviceFetch(r => r.method === "PATCH" ? Promise.reject(Error("offline")) : Response.json({ ok: true, submission: review })) });
    h.button(label).props.onClick(); await h.settle();
    assert.match(h.text(), /could not be confirmed/); assert.equal(h.button("Approve").props.disabled, true);
    assert.equal(h.button("Check review status").props.disabled, false); assert.equal(h.decisions().length, 1);
    h.button("Approve").props.onClick(); await h.settle(); assert.equal(h.decisions().length, 1); h.unmount();
  });
}

test("decision timeout aborts request and restores status-check recovery", async () => {
  let signal;
  const h = await ready("service", { fetch: serviceFetch(r => { if (r.method === "PATCH") { signal = r.signal; return new Promise(() => {}); } return Response.json({ ok: true, submission: review }); }) });
  h.button("Approve").props.onClick(); await tick(); h.expire(); await h.settle();
  assert.equal(signal.aborted, true); assert.equal(h.button("Check review status").props.disabled, false); assert.equal(h.timers.size, 0); h.unmount();
});

test("status reconciliation is GET only, preserves drafts, and unlocks explicit retry only after confirmation", async () => {
  let failed = false;
  const h = await ready("service", { fetch: serviceFetch(r => { if (r.method === "PATCH") { failed = true; throw Error("lost"); } return Response.json({ ok: true, submission: review }); }) });
  h.elements().find(n => n.type === "textarea").props.onChange({ target: { value: "Please explain the setup." } });
  const sharing = h.elements().find(n => n.type === "input" && n.props.type === "checkbox");
  assert.equal(sharing.props.checked, false, "Service report sharing starts private");
  sharing.props.onChange({ target: { checked: true } });
  h.button("Request changes").props.onClick(); await h.settle(); assert.equal(failed, true);
  h.button("Check review status").props.onClick(); await h.settle();
  assert.equal(h.decisions().length, 1); assert.equal(h.button("Approve").props.disabled, false);
  assert.equal(h.elements().find(n => n.type === "textarea").props.value, "Please explain the setup.");
  assert.equal(h.elements().find(n => n.type === "input" && n.props.type === "checkbox").props.checked, true);
  assert.match(h.text(), /still awaiting your decision/); h.unmount();
});

test("failed reconciliation keeps the write locked and never resends it", async () => {
  let reads = 0;
  const h = await ready("service", { fetch: serviceFetch(r => r.method === "PATCH" ? Promise.reject(Error("lost")) : ++reads === 1 ? Response.json({ ok: true, submission: review }) : Response.json({ ok: false }, { status: 503 })) });
  h.button("Approve").props.onClick(); await h.settle(); h.button("Check review status").props.onClick(); await h.settle();
  assert.match(h.text(), /status could not be checked/); assert.equal(h.button("Approve").props.disabled, true); assert.equal(h.decisions().length, 1); h.unmount();
});

test("reconciled approval displays completion without a second decision", async () => {
  let reads = 0;
  const h = await ready("service", { fetch: serviceFetch(r => r.method === "PATCH" ? Promise.reject(Error("lost")) : Response.json({ ok: true, submission: { ...review, status: ++reads === 1 ? "submitted" : "approved" } })) });
  h.button("Approve").props.onClick(); await h.settle(); h.button("Check review status").props.onClick(); await h.settle();
  assert.match(h.text(), /Approved service history/); assert.equal(h.decisions().length, 1); assert.equal(h.elements().some(n => n.type === "button" && words(n) === "Approve"), false); h.unmount();
});

for (const [label, result] of [["server failure", () => Response.json({ ok: false }, { status: 500 })], ["malformed success", () => new Response("invalid")], ["mismatched result", () => Response.json({ ok: true, submission: { ...review, id: "other", status: "approved" } })]]) {
  test(`${label} is uncertain, never a confirmed decision`, async () => {
    const h = await ready("service", { fetch: serviceFetch(r => r.method === "PATCH" ? result() : Response.json({ ok: true, submission: review })) });
    h.button("Approve").props.onClick(); await h.settle(); assert.ok(h.button("Check review status")); assert.equal(h.button("Approve").props.disabled, true); h.unmount();
  });
}

test("definite validation refusal restores controls and preserves server feedback", async () => {
  const h = await ready("service", { fetch: serviceFetch(r => r.method === "PATCH" ? Response.json({ ok: false, message: "Explain what should change." }, { status: 400 }) : Response.json({ ok: true, submission: review })) });
  h.button("Request changes").props.onClick(); await h.settle(); assert.match(h.text(), /Explain what should change/); assert.equal(h.button("Approve").props.disabled, false); h.unmount();
});

test("rapid duplicate clicks send one decision and preserve the request contract", async () => {
  const d = deferred(), h = await ready("service", { fetch: serviceFetch(r => r.method === "PATCH" ? d.promise : Response.json({ ok: true, submission: review })) });
  const click = h.button("Approve").props.onClick; click(); click(); await tick();
  assert.equal(h.decisions().length, 1); assert.deepEqual(h.decisions()[0].body, { id: "review-a", action: "approve", note: "", requestedVisibility: "private", reviewToken: "" });
  d.resolve(Response.json({ ok: true, submission: { ...review, status: "approved" } })); await h.settle(); assert.match(h.text(), /decision has been saved/); h.unmount();
});

test("evidence HTTP failure differs from empty and supports retry without sending a decision", async () => {
  let attempts = 0;
  const h = await ready("service", { fetch: r => r.url.startsWith("/api/service-evidence") ? ++attempts === 1 ? Response.json({ ok: false }, { status: 500 }) : Response.json({ ok: true, evidence: [] }) : Response.json({ ok: true, submission: review }) });
  assert.match(h.text(), /could not be loaded/); assert.doesNotMatch(h.text(), /No private evidence uploaded/);
  h.button("Retry evidence").props.onClick(); await h.settle(); assert.match(h.text(), /No private evidence uploaded/); assert.equal(attempts, 2); assert.equal(h.decisions().length, 0); h.unmount();
});

test("evidence stays loading until its response, with no false empty state", async () => {
  const d = deferred(), h = await ready("service", { fetch: r => r.url.startsWith("/api/service-evidence") ? d.promise : Response.json({ ok: true, submission: review }) });
  assert.match(h.text(), /Loading private evidence/); assert.doesNotMatch(h.text(), /No private evidence uploaded/);
  d.resolve(Response.json({ ok: true, evidence: [{ id: "e", fileName: "fixture.pdf", type: "invoice", fileSizeBytes: 20, previewUrl: "https://example.invalid/fixture" }] })); await h.settle(); assert.match(h.text(), /fixture.pdf/); h.unmount();
});

test("account change clears private review and ignores the prior decision response", async () => {
  const d = deferred(), h = await ready("service", { fetch: serviceFetch(r => r.method === "PATCH" ? d.promise : Response.json({ ok: true, submission: review })) });
  h.button("Approve").props.onClick(); await tick(); h.auth(null); assert.doesNotMatch(h.text(), /Fixture service/);
  d.resolve(Response.json({ ok: true, submission: { ...review, status: "approved" } })); await h.settle(); assert.match(h.text(), /Owner sign-in required/); assert.doesNotMatch(h.text(), /Approved service history/); h.unmount();
});

test("unmount aborts outstanding decision and ignores all late state writes", async () => {
  const d = deferred(), h = await ready("service", { fetch: serviceFetch(r => r.method === "PATCH" ? d.promise : Response.json({ ok: true, submission: review })) });
  h.button("Approve").props.onClick(); await tick(); h.unmount(); d.resolve(Response.json({ ok: true, submission: { ...review, status: "approved" } })); await tick(); await tick();
  assert.equal(h.afterUnmount(), 0); assert.equal(h.timers.size, 0); assert.equal(h.decisions()[0].signal.aborted, true);
});

test("wrong-account transfer uses shared signout then exact login return, never acceptance", async () => {
  let signouts = 0;
  const h = await ready("transfer", { logout: async () => { signouts++; return true; }, fetch: () => Response.json({ ok: true, requiresSignIn: true, transfer: { id: "transfer-a" } }) });
  h.button("Use another account").props.onClick(); await h.settle(); assert.equal(signouts, 1); assert.deepEqual(h.navigations, ["/login?next=%2Ftransfer%2Ftransfer-a"]); assert.equal(h.requests.some(r => r.method === "PATCH"), false); h.unmount();
});

test("failed normal signout does not redirect or claim success", async () => {
  const h = await ready("transfer", { logout: async () => false, logoutError: "Could not sign out. Please try again.", fetch: () => Response.json({ ok: true, requiresSignIn: true }) });
  h.button("Use another account").props.onClick(); await h.settle(); assert.deepEqual(h.navigations, []); assert.match(h.text(), /Could not sign out/); h.unmount();
});

test("completed transfer primary return is Dashboard, never an owner-only Profile", async () => {
  const h = await ready("transfer"), links = h.elements().filter(n => n.type === "a");
  assert.equal(links.find(n => words(n) === "Open Dashboard").props.href, "/dashboard");
  assert.equal(links.some(n => n.props.href?.startsWith("/dashboard/profile/")), false); assert.match(h.text(), /Previous owners no longer have access/); h.unmount();
});

test("Messages exposes the existing Profile context near the header before the composer", () => {
  const thread = { member: { publicName: "Fixture member", accountType: "player", avatarUrl: "", location: "" }, contextProfile: { title: "Fixture instrument", href: "/i/QRG-FIXTURE" }, messages: [] };
  const h = fixture("messages", { skipEffects: true, initial: { 0: "ready", 4: thread } }), elements = h.elements();
  const context = elements.find(n => n.type === "a" && n.props.className === "threadContext");
  assert.equal(words(context), "About Fixture instrument"); assert.equal(context.props.href, thread.contextProfile.href);
  assert.ok(elements.indexOf(context) < elements.findIndex(n => n.type === "textarea"));
  const css = fs.readFileSync(path.join(root, "components/MessagesClient.module.css"), "utf8");
  assert.match(css, /\.threadContext\s*\{[^}]*grid-column:\s*1 \/ -1/); assert.match(css, /\.threadContext\s*\{[^}]*min-height:\s*44px/); assert.match(css, /\.threadContext\s*\{[^}]*overflow-wrap:\s*anywhere/);
  h.unmount();
});


function refreshingThread() { return { id: "conversation-a", member: { publicName: "Synthetic member", accountType: "player", avatarUrl: "", location: "" }, contextProfile: null, messages: [], hasOlderMessages: false, nextMessageCursor: null }; }
function refreshResponse(request) { return Response.json(request.url.endsWith("/controls") ? { ok: true } : { ok: true, conversation: refreshingThread() }); }
function refreshTimer(h) { const timer = [...h.timers.values()].find(t => t.ms === 12000); assert.ok(timer, "actual 12-second fallback scheduled"); timer.fn(); }
for (const status of ["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"]) test("Messages successful HTTP fallback is disclosed after " + status, async () => {
  let channel;
  const h = await ready("messages", { onChannelSubscribe: fn => { channel = fn; }, fetch: refreshResponse });
  channel(status); await h.settle(); assert.match(h.text(), /Automatic refresh/); assert.doesNotMatch(h.text(), /Reconnecting/);
  const before = h.requests.filter(r => r.method === "GET").length; refreshTimer(h); await h.settle();
  assert.equal(h.requests.filter(r => r.method === "GET").length, before + 1); assert.match(h.text(), /Automatic refresh/);
  channel("SUBSCRIBED"); await h.settle(); assert.doesNotMatch(h.text(), /Automatic refresh/); assert.match(h.text(), /Live/);
  h.unmount(); assert.equal(h.timers.size, 0);
});
test("Messages failed fallback withdraws healthy label and recovery restores it", async () => {
  let channel, fail = false;
  const h = await ready("messages", { onChannelSubscribe: fn => { channel = fn; }, fetch: request => fail && request.method === "GET" ? Response.json({ ok: false, message: "Refresh failed" }, { status: 503 }) : refreshResponse(request) });
  channel("CHANNEL_ERROR"); await h.settle(); assert.match(h.text(), /Automatic refresh/);
  fail = true; refreshTimer(h); await h.settle(); assert.doesNotMatch(h.text(), /Automatic refresh/); assert.match(h.text(), /Reconnecting/); assert.match(h.text(), /Refresh failed/);
  fail = false; refreshTimer(h); await h.settle(); assert.match(h.text(), /Automatic refresh/); assert.doesNotMatch(h.text(), /Refresh failed/); h.unmount();
});
test("Messages stale refresh cannot clear newer success or resurrect status after signout", async () => {
  let channel, next;
  const h = await ready("messages", { onChannelSubscribe: fn => { channel = fn; }, fetch: request => request.method === "GET" && next ? next.promise : refreshResponse(request) });
  channel("CHANNEL_ERROR"); const old = deferred(); next = old; refreshTimer(h); await tick(); next = undefined; refreshTimer(h); await h.settle();
  old.resolve(Response.json({ ok: false, message: "old failure" }, { status: 503 })); await h.settle(); assert.match(h.text(), /Automatic refresh/); assert.doesNotMatch(h.text(), /old failure/);
  next = deferred(); const late = next; refreshTimer(h); await tick(); h.auth(null); await h.settle(); late.resolve(Response.json({ ok: true, conversation: refreshingThread() })); await h.settle(); channel("SUBSCRIBED");
  assert.match(h.text(), /Sign in to Messages/); assert.doesNotMatch(h.text(), /Automatic refresh|Synthetic member/); h.unmount(); assert.equal(h.afterUnmount(), 0);
});
test("Messages initial failed read never claims successful automatic refresh", async () => {
  const h = await ready("messages", { fetch: () => Response.json({ ok: false, error: "Unavailable" }, { status: 503 }) });
  assert.match(h.text(), /Messages are unavailable/); assert.doesNotMatch(h.text(), /Automatic refresh/); h.unmount();
});
