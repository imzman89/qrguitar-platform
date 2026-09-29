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
const words = tree => typeof tree === "string" || typeof tree === "number" ? String(tree) : tree && typeof tree === "object" ? React.Children.toArray(tree.props?.children).map(words).join("") : "";
function nodes(tree) { return !tree || typeof tree !== "object" ? [] : [tree, ...React.Children.toArray(tree.props?.children).flatMap(nodes)]; }

// Execute actual route/component source with deterministic hooks and in-memory
// response fixtures. No local service, account, customer record, or real request.
function fixture(kind = "service", options = {}) {
  const values = [], effects = [], memo = [], timers = new Map(), requests = [], navigations = [];
  let cursor = 0, effectCursor = 0, memoCursor = 0, timerId = 0, dirty = true, mounted = true, tree, callback, writesAfterUnmount = 0;
  const ui = (key, fallback) => options.content?.[key] ?? fallback;
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
    getSession: () => options.getSession?.() ?? Promise.resolve({ data: { session }, error: null }),
    onAuthStateChange(fn) { callback = fn; return { data: { subscription: { unsubscribe() {} } } }; }
  };
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
    if (name === "next/navigation") return { useParams: () => ({ id: kind === "transfer" ? "transfer-a" : "review-a" }), useSearchParams: () => new URLSearchParams() };
    if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
    if (name.endsWith("/Nav") || name.endsWith("/Footer")) return { Nav: () => null, Footer: () => null };
    if (name.endsWith("/content-registry")) return { getContentValue: (_, key) => ({ "serviceReview.actions.approve": "Approve", "serviceReview.actions.revise": "Request changes", "serviceReview.actions.decline": "Decline" })[key] || key };
    if (name.endsWith("/use-site-content")) return { useSiteContent: () => ({}) };
    if (name.endsWith("/supabase-browser")) return { createBrowserSupabaseClient: () => ({ auth }), getSupabaseAccessToken: async () => "synthetic-token" };
    if (name.endsWith("/use-auth-navigation")) return { useAuthNavigation: () => ({ logout: options.logout || (async () => false), signingOut: false, logoutError: options.logoutError || "" }) };
    if (name.endsWith("/local-demo")) return { transferStatusLabel: value => value.status };
    if (name.endsWith("/optional-tracking-consent")) return { optionalTrackingProductEvents: {}, dispatchOptionalTrackingProductEvent: async () => true };
    if (name.endsWith("/member-messaging")) return { MEMBER_MEDIA_TYPES: [], MEMBER_MEDIA_COUNT_LIMIT: 4, MEMBER_MEDIA_LIMIT: 15 * 1024 * 1024 };
    throw new Error(`Unexpected test import: ${name}`);
  };
  const source = fs.readFileSync(path.join(root, names[kind]), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", "fetch", "setTimeout", "clearTimeout", "window", code)(modules, module, module.exports, fakeFetch,
    (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms }); return id; }, id => timers.delete(id), { location: { assign: url => navigations.push(url) } });
  const Component = kind === "messages" ? module.exports.MessagesClient : module.exports.default;
  const h = {
    requests, timers, navigations,
    render() { dirty = true; let turns = 0; while (dirty) { assert.ok(turns++ < 20, "render loop"); dirty = false; cursor = effectCursor = memoCursor = 0; tree = Component(kind === "messages" ? { conversationId: "conversation-a" } : {}); if (!options.skipEffects) for (const effect of effects) if (effect.pending) { effect.pending = false; effect.cleanup?.(); effect.cleanup = effect.run(); } } return tree; },
    elements() { return nodes(h.render()); },
    button(label) { const node = h.elements().find(n => n.type === "button" && words(n).trim() === label); assert.ok(node, `Missing button: ${label}`); return node; },
    text() { return words(h.render()); },
    async settle() { for (let i = 0; i < 4; i++) { await tick(); h.render(); } },
    auth(value) { callback("SIGNED_IN", value); h.render(); },
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
  h.elements().find(n => n.type === "select").props.onChange({ target: { value: "public" } });
  h.button("Request changes").props.onClick(); await h.settle(); assert.equal(failed, true);
  h.button("Check review status").props.onClick(); await h.settle();
  assert.equal(h.decisions().length, 1); assert.equal(h.button("Approve").props.disabled, false);
  assert.equal(h.elements().find(n => n.type === "textarea").props.value, "Please explain the setup.");
  assert.equal(h.elements().find(n => n.type === "select").props.value, "public");
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
