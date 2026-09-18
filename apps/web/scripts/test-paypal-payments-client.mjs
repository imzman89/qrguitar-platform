import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), require = createRequire(path.join(web, "package.json")), ts = require("typescript"), modules = new Map();
function load(name) { if (modules.has(name)) return modules.get(name); const module = { exports: {} }; const compiled = ts.transpileModule(fs.readFileSync(path.join(web, `lib/${name}.ts`), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText; new Function("require", "exports", "module", compiled)(specifier => specifier.startsWith("./") ? load(specifier.slice(2)) : require(specifier), module.exports, module); modules.set(name, module.exports); return module.exports; }
const client = load("paypal-payments-client"), sdkModule = load("paypal-browser-sdk"), appleModule = load("paypal-apple-pay");
const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222", ID = "33333333-3333-4333-8333-333333333333", ORDER = "44444444-4444-4444-8444-444444444444", ID2 = "55555555-5555-4555-8555-555555555555", PAYPAL = "5O190127TN364715T";
const offers = [{ key: "profile_1", amount: 1200, credits: 1 }, { key: "profile_10", amount: 5000, credits: 10 }, { key: "profile_25", amount: 9900, credits: 25 }].map(value => ({ ...value, version: 1, currency: "usd", permanent: true, freeAllowance: 5 }));
const order = (patch = {}) => ({ orderId: ORDER, ownerId: A, requestId: ID, offerKey: "profile_10", paypalOrderId: PAYPAL, status: "approval_pending", offer: offers[1], createdAt: "2026-09-18T12:00:00.000Z", ...patch });
const snapshot = (patch = {}) => ({ environment: "test", freeLimit: 5, freeRemaining: 0, paidGranted: 0, paidConsumed: 0, paidRemaining: 0, paidAvailable: 0, ownedProfiles: 5, hold: false, commercialExempt: false, enabled: true, applePayEnabled: false, clientId: "public-test-client-id", currency: "USD", merchantName: "QRguitar", offers, order: null, pendingOrder: null, legacyOrderId: null, legacyOrderProvider: null, ...patch });
const json = value => Response.json({ ok: true, ...value }), session = id => id ? { access_token: `token-${id}`, user: { id } } : null;
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { resolve, promise }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(predicate) { for (let i = 0; i < 300; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 1)); } assert.ok(predicate(), "condition did not settle"); }
function fixture(t, options = {}) {
  const f = { session: session(A), calls: [], stored: new Map(), status: snapshot(), uuidCalls: 0, ...options }; let callback;
  const auth = { getSession: () => f.getSession ? f.getSession() : Promise.resolve({ data: { session: f.session } }), onAuthStateChange(fn) { callback = fn; return { data: { subscription: { unsubscribe() { f.unsubscribed = true; } } } }; } };
  f.respond = options.respond || (async (url, init) => {
    if (url.startsWith("/api/billing/paypal/status")) return json(f.status);
    const body = JSON.parse(init.body);
    if (url.endsWith("/create")) { const next = order({ requestId: body.requestId, offerKey: body.offerKey, offer: offers.find(offer => offer.key === body.offerKey) }); f.status = snapshot({ order: next, pendingOrder: next }); return json({ orderId: ORDER, paypalOrderId: PAYPAL }); }
    if (url.endsWith("/capture")) { const next = order({ ...f.status.pendingOrder, status: "fulfilled" }); f.status = snapshot({ order: next, paidGranted: next.offer.credits, paidAvailable: next.offer.credits, paidRemaining: next.offer.credits }); return json({ order: next }); }
    return json({ order: f.status.order });
  });
  f.client = client.createPayPalPaymentsClient({ auth: () => auth, fetch: async (url, init) => { f.calls.push({ url, init }); return f.respond(url, init); }, timeoutMs: f.timeoutMs ?? 1000, orderId: f.orderId, returnFlow: f.returnFlow, pollMs: f.pollMs ?? 5, maxPolls: f.maxPolls ?? 2,
    randomUUID: () => { f.uuidCalls++; return f.uuidCalls === 1 ? ID : ID2; }, storage: () => { if (f.storageDenied) throw new Error("Storage denied"); return { getItem: key => f.stored.get(key) || null, setItem: (key, value) => f.stored.set(key, value), removeItem: key => f.stored.delete(key) }; } });
  f.change = id => { f.session = session(id); callback("SIGNED_IN", f.session); };
  f.ready = async () => { await f.client.start(); await until(() => ["ready", "signed-out", "error"].includes(f.client.getState().phase)); };
  f.posts = () => f.calls.filter(call => call.init.method === "POST"); t.after(() => f.client.dispose()); return f;
}
test("signed-out payer cannot create orders", async t => { const f = fixture(t, { session: null }); await f.ready(); await assert.rejects(f.client.createOrder("profile_10", A)); assert.equal(f.calls.length, 0); });
test("status loads five-free account without creating an order", async t => { const f = fixture(t); await f.ready(); assert.equal(f.client.getState().snapshot.freeLimit, 5); assert.equal(f.posts().length, 0); assert.equal(f.calls[0].init.cache, "no-store"); });
test("provider order IDs match the database and service boundaries", () => { for (const size of [5, 17, 64]) { const value = "A".repeat(size); assert.equal(client.paypalProviderOrderId(value), value); } for (const value of ["A".repeat(4), "A".repeat(65), "lowercase", "ORDER_123", "ORDER-123", null]) assert.equal(client.paypalProviderOrderId(value), ""); });
test("unconfigured checkout still displays the usable five-free account", async t => { const f = fixture(t, { status: snapshot({ enabled: false, clientId: null, offers: [], freeRemaining: 5, ownedProfiles: 0 }) }); await f.ready(); assert.equal(f.client.getState().phase, "ready"); assert.equal(f.client.getState().snapshot.freeRemaining, 5); assert.equal(f.client.getState().snapshot.clientId, null); });
test("pausing new sales preserves the exact pending purchase with a public client ID", async t => {
  const next = order(), f = fixture(t, { status: snapshot({ enabled: false, offers: [], order: next, pendingOrder: next }) }); await f.ready(); assert.equal(await f.client.createOrder("profile_10", A), PAYPAL); assert.deepEqual(JSON.parse(f.posts()[0].init.body), { offerKey: "profile_10", requestId: ID }); assert.equal(f.uuidCalls, 0);
});
test("new orders blocked for unavailable methods, holds, existing access and legacy pending payment", async t => { for (const patch of [{ enabled: false }, { hold: true }, { commercialExempt: true }, { legacyOrderId: ORDER, legacyOrderProvider: "direct" }]) { const f = fixture(t, { status: snapshot(patch) }); await f.ready(); await assert.rejects(f.client.createOrder("profile_10", A)); assert.equal(f.posts().length, 0); } });
test("client rejects tampered pack amount, balance, merchant settings and ownership", async t => { for (const patch of [{ freeLimit: 25 }, { paidAvailable: 3 }, { clientId: "bad&injection" }, { applePayEnabled: "true" }, { offers: [{ ...offers[1], amount: 1 }] }, { order: order({ ownerId: B }) }]) { const f = fixture(t, { status: snapshot(patch) }); await f.ready(); assert.equal(f.client.getState().phase, "error"); assert.equal(f.client.getState().snapshot, null); } });
test("SDK create callback sends only approved pack key and one saved UUID", async t => {
  const f = fixture(t); await f.ready(); const results = await Promise.allSettled([f.client.createOrder("profile_10", A), f.client.createOrder("profile_10", A)]); assert.equal(results[0].value, PAYPAL); assert.equal(results[1].status, "rejected"); assert.equal(f.posts().length, 1); assert.deepEqual(JSON.parse(f.posts()[0].init.body), { offerKey: "profile_10", requestId: ID }); assert.equal(f.client.getState().snapshot.paidAvailable, 0);
});
test("uncertain create retries the exact request after controller recreation", async t => {
  const f = fixture(t), respond = f.respond; f.respond = (url, init) => init.method === "POST" ? Promise.reject(new Error("Lost response")) : respond(url, init); await f.ready(); await assert.rejects(f.client.createOrder("profile_10", A)); await f.client.reload();
  const resumed = fixture(t, { stored: f.stored }); await resumed.ready(); assert.equal(await resumed.client.createOrder("profile_10", A), PAYPAL); assert.equal(f.posts()[0].init.body, resumed.posts()[0].init.body); assert.equal(resumed.uuidCalls, 0);
});
test("lost create response followed by webhook fulfillment recovers the receipt without reopening PayPal", async t => {
  const f = fixture(t), respond = f.respond; let lost = true, statusReads = 0;
  f.respond = (url, init) => {
    if (url.endsWith("/create")) {
      if (lost) { lost = false; return Promise.reject(new Error("Lost create response")); }
      return json({ orderId: ORDER, paypalOrderId: PAYPAL, status: "fulfilled" });
    }
    if (url.includes(`orderId=${ORDER}`)) { statusReads++; return json(snapshot({ order: order({ status: "fulfilled" }), paidGranted: 10, paidRemaining: 10, paidAvailable: 10 })); }
    return respond(url, init);
  };
  await f.ready(); await assert.rejects(f.client.createOrder("profile_10", A)); await assert.rejects(f.client.createOrder("profile_10", A), /already resolved/);
  assert.equal(statusReads, 1); assert.equal(f.posts()[0].init.body, f.posts()[1].init.body); assert.equal(f.posts().filter(call => call.url.endsWith("/capture")).length, 0); assert.equal(f.client.getState().snapshot.order.status, "fulfilled"); assert.equal(f.client.getState().snapshot.paidAvailable, 10); assert.equal(f.client.getState().intent, null);
  f.client.sdkError(A); assert.equal(f.client.getState().uncertain, false); assert.doesNotMatch(f.client.getState().message, /try again|retry/i);
});
test("terminal create responses cannot show credits before an authoritative balance read", async t => {
  const f = fixture(t), respond = f.respond;
  f.respond = (url, init) => url.endsWith("/create") ? json({ orderId: ORDER, paypalOrderId: PAYPAL, status: "fulfilled" }) : url.includes("orderId=") ? Response.json({ ok: false, message: "Ledger unavailable" }, { status: 503 }) : respond(url, init);
  await f.ready(); await assert.rejects(f.client.createOrder("profile_10", A)); assert.equal(f.client.getState().snapshot, null); assert.equal(f.client.getState().intent.orderId, ORDER);
});
test("create rejects unrecognized provider state while retaining the original retry key", async t => {
  const f = fixture(t), respond = f.respond; f.respond = (url, init) => url.endsWith("/create") ? json({ orderId: ORDER, paypalOrderId: PAYPAL, status: "COMPLETED" }) : respond(url, init); await f.ready(); await assert.rejects(f.client.createOrder("profile_10", A), /could not be verified/); assert.equal(f.client.getState().intent.requestId, ID); assert.equal(f.client.getState().snapshot.paidAvailable, 0);
});
test("server pending order resumes without local storage", async t => { const next = order(), f = fixture(t, { storageDenied: true, status: snapshot({ order: next, pendingOrder: next }) }); await f.ready(); assert.equal(await f.client.createOrder("profile_10", A), PAYPAL); assert.equal(f.uuidCalls, 0); });
test("a held pending order remains reviewable without hiding the account balance", async t => {
  const next = order({ status: "needs_review" }), f = fixture(t, { status: snapshot({ hold: true, paidGranted: 10, paidRemaining: 10, paidAvailable: 0, order: next, pendingOrder: next }) }); await f.ready(); assert.equal(f.client.getState().phase, "ready"); assert.equal(f.client.getState().snapshot.paidAvailable, 0); assert.equal(f.client.getState().snapshot.order.status, "needs_review"); assert.equal(f.client.getState().intent.orderId, ORDER); assert.equal(f.client.getState().polling, false);
});
test("approval captures through server then shows only verified ledger credit", async t => {
  const f = fixture(t); await f.ready(); await f.client.createOrder("profile_10", A); assert.equal(await f.client.capture(PAYPAL, A), "confirmed"); assert.deepEqual(JSON.parse(f.posts()[1].init.body), { orderId: ORDER }); assert.equal(f.client.getState().snapshot.paidAvailable, 10); assert.equal(f.client.getState().snapshot.order.status, "fulfilled"); assert.equal(f.client.getState().intent, null); assert.equal(f.stored.size, 0);
});
test("mismatched SDK approval never calls capture", async t => { const f = fixture(t); await f.ready(); await f.client.createOrder("profile_10", A); await assert.rejects(f.client.capture("FOREIGNORDER12345", A)); assert.equal(f.posts().length, 1); });
test("a completed capture response alone cannot fabricate credits", async t => {
  const f = fixture(t), respond = f.respond; let captured = false; f.respond = (url, init) => { if (url.endsWith("/capture")) { captured = true; return json({ order: order({ status: "fulfilled" }), credits: 999 }); } return captured && init.method === "GET" ? Response.json({ ok: false, message: "Ledger read unavailable" }, { status: 503 }) : respond(url, init); };
  await f.ready(); await f.client.createOrder("profile_10", A); assert.equal(await f.client.capture(PAYPAL, A), "pending"); assert.equal(f.client.getState().snapshot, null); assert.equal(f.client.getState().intent.approvalObserved, true);
});
test("lost capture result keeps order identity and reconciliation adds no browser credits", async t => {
  const f = fixture(t), respond = f.respond; f.respond = (url, init) => url.endsWith("/capture") ? Promise.reject(new Error("Lost result")) : respond(url, init); await f.ready(); await f.client.createOrder("profile_10", A); await f.client.capture(PAYPAL, A); await f.client.reconcile();
  assert.equal(f.client.getState().snapshot.paidAvailable, 0); assert.equal(f.client.getState().intent.orderId, ORDER); assert.deepEqual(JSON.parse(f.posts()[2].init.body), { orderId: ORDER }); assert.ok(f.posts()[2].url.endsWith("/reconcile"));
});
test("reconciliation of an uncaptured order permits the same saved checkout to resume", async t => {
  const f = fixture(t), respond = f.respond; f.respond = (url, init) => url.endsWith("/capture") ? Promise.reject(new Error("Capture did not finish")) : respond(url, init); await f.ready(); await f.client.createOrder("profile_10", A); await f.client.capture(PAYPAL, A); assert.equal(f.client.getState().intent.approvalObserved, true); await f.client.reconcile(); assert.equal(f.client.getState().intent.approvalObserved, false); assert.equal(await f.client.createOrder("profile_10", A), PAYPAL); assert.equal(f.posts()[0].init.body, f.posts().at(-1).init.body);
});
test("authenticated processing and review observations survive a ledger-only status read without granting credits", async t => {
  for (const status of ["processing", "needs_review"]) {
    const next = order(), f = fixture(t, { pollMs: 1000, status: snapshot({ order: next, pendingOrder: next }) }), respond = f.respond;
    f.respond = (url, init) => url.endsWith("/reconcile") ? json({ order: order({ status }) }) : respond(url, init); await f.ready(); await f.client.reconcile(); assert.equal(f.client.getState().snapshot.order.status, status); assert.equal(f.client.getState().snapshot.paidAvailable, 0); assert.equal(f.client.getState().intent.approvalObserved, status === "processing"); assert.equal(f.client.getState().polling, status === "processing");
    f.status = snapshot({ order: order({ status: "fulfilled" }), paidGranted: 10, paidRemaining: 10, paidAvailable: 10 }); await f.client.reload(); assert.equal(f.client.getState().snapshot.order.status, "fulfilled"); assert.equal(f.client.getState().snapshot.paidAvailable, 10);
  }
});
test("reconciliation rejects another order or owner before changing observed state", async t => {
  for (const patch of [{ orderId: ID2 }, { ownerId: B }, { paypalOrderId: "OTHERORDER123" }]) {
    const next = order(), f = fixture(t, { status: snapshot({ order: next, pendingOrder: next }) }), respond = f.respond;
    f.respond = (url, init) => url.endsWith("/reconcile") ? json({ order: order({ status: "needs_review", ...patch }) }) : respond(url, init); await f.ready(); await f.client.reconcile(); assert.equal(f.client.getState().snapshot.order.status, "approval_pending"); assert.equal(f.client.getState().snapshot.paidAvailable, 0); assert.equal(f.client.getState().uncertain, true);
  }
});
test("a declined instrument asks SDK to restart without recording success", async t => {
  const f = fixture(t), respond = f.respond; f.respond = (url, init) => url.endsWith("/capture") ? Response.json({ ok: false, code: "instrument_declined", message: "Choose another instrument" }, { status: 422 }) : respond(url, init); await f.ready(); await f.client.createOrder("profile_10", A);
  assert.equal(await f.client.capture(PAYPAL, A), "restart"); assert.equal(f.client.getState().intent.approvalObserved, false); assert.equal(f.client.getState().snapshot.paidAvailable, 0);
});
test("cancel callback does not capture, erase order or assert terminal cancellation", async t => {
  const f = fixture(t); await f.ready(); await f.client.createOrder("profile_10", A); await f.client.cancelled(A); assert.equal(f.posts().length, 1); assert.equal(f.client.getState().intent.orderId, ORDER); assert.equal(f.client.getState().snapshot.order.status, "approval_pending"); assert.match(f.client.getState().message, /resume/);
});
test("return polling is bounded and read-only", async t => { const next = order({ status: "processing" }), f = fixture(t, { orderId: ORDER, returnFlow: true, status: snapshot({ order: next, pendingOrder: next }) }); await f.ready(); await until(() => !f.client.getState().polling); assert.equal(f.calls.length, 3); assert.equal(f.posts().length, 0); assert.equal(f.client.getState().snapshot.paidAvailable, 0); });
test("return completion captures only the server-restored local order and reads ledger success", async t => {
  const next = order(), f = fixture(t, { orderId: ORDER, returnFlow: true, status: snapshot({ order: next, pendingOrder: next }), pollMs: 1000 }); await f.ready(); await f.client.completeReturn(); assert.equal(f.posts().length, 1); assert.ok(f.posts()[0].url.endsWith("/capture")); assert.deepEqual(JSON.parse(f.posts()[0].init.body), { orderId: ORDER }); assert.equal(f.client.getState().snapshot.order.status, "fulfilled"); assert.equal(f.client.getState().snapshot.paidAvailable, 10);
});
test("return completion cannot charge without a verified matching order in return mode", async t => {
  for (const patch of [{ returnFlow: false, orderId: ORDER }, { returnFlow: true }, { returnFlow: true, orderId: ORDER, status: snapshot({ order: order({ status: "fulfilled" }) }) }, { returnFlow: true, orderId: ORDER, status: snapshot({ order: order({ ownerId: B }), pendingOrder: order() }) }]) {
    const f = fixture(t, { status: snapshot({ order: order(), pendingOrder: order() }), pollMs: 1000, ...patch }); await f.ready(); await f.client.completeReturn(); assert.equal(f.posts().length, 0);
  }
});
test("return status for one checkout cannot capture a different pending checkout", async t => {
  const f = fixture(t, { orderId: ORDER, returnFlow: true, pollMs: 1000, status: snapshot({ order: order(), pendingOrder: order({ orderId: ID2, requestId: ID2, paypalOrderId: "OTHERORDER123" }) }) }); await f.ready(); await f.client.completeReturn(); assert.equal(f.posts().length, 0);
});
test("fulfilled order stops return polling and clears only its saved request", async t => {
  const stored = new Map([[`qrguitar:paypal-checkout:${A}`, JSON.stringify({ requestId: ID, offerKey: "profile_10", orderId: ORDER, paypalOrderId: PAYPAL, approvalObserved: true })]]);
  const f = fixture(t, { stored, orderId: ORDER, returnFlow: true, status: snapshot({ order: order({ status: "fulfilled" }), paidGranted: 10, paidRemaining: 10, paidAvailable: 10 }) }); await f.ready(); assert.equal(f.client.getState().intent, null); assert.equal(f.client.getState().polling, false); assert.equal(f.posts().length, 0);
});
test("switching accounts clears payment data and stale approval cannot charge", async t => { const f = fixture(t); await f.ready(); await f.client.createOrder("profile_10", A); f.status = snapshot(); f.change(B); assert.equal(f.client.getState().snapshot, null); await until(() => f.client.getState().phase === "ready"); await assert.rejects(f.client.capture(PAYPAL, A)); assert.equal(f.posts().length, 1); });
test("late create response cannot reopen checkout for another account", async t => {
  const f = fixture(t), pending = deferred(), respond = f.respond; f.respond = (url, init) => init.method === "POST" ? pending.promise : respond(url, init); await f.ready(); const opening = f.client.createOrder("profile_10", A); await until(() => f.posts().length === 1); f.change(B); pending.resolve(json({ orderId: ORDER, paypalOrderId: PAYPAL })); await assert.rejects(opening); await until(() => f.client.getState().phase === "ready"); assert.equal(f.client.getState().actorId, B); assert.equal(f.client.getState().intent, null);
});
test("silent session change after capture never publishes another actor's grant", async t => {
  const f = fixture(t), respond = f.respond; f.respond = async (url, init) => { const result = await respond(url, init); if (url.endsWith("/capture")) { f.session = session(B); f.status = snapshot(); } return result; }; await f.ready(); await f.client.createOrder("profile_10", A); await assert.rejects(f.client.capture(PAYPAL, A)); await until(() => f.client.getState().phase === "ready"); assert.equal(f.client.getState().actorId, B); assert.equal(f.client.getState().snapshot.paidAvailable, 0);
});
test("timeout on response JSON retains saved request and releases busy state", async t => { const f = fixture(t, { timeoutMs: 15 }), respond = f.respond; f.respond = (url, init) => init.method === "POST" ? { ok: true, json: () => new Promise(() => {}) } : respond(url, init); await f.ready(); await assert.rejects(f.client.createOrder("profile_10", A)); assert.equal(f.client.getState().busy, ""); assert.equal(f.client.getState().intent.requestId, ID); });
test("dispose aborts requests, polling and auth subscription", async t => { const f = fixture(t); await f.ready(); const pending = deferred(); f.respond = () => pending.promise; const loading = f.client.reload(); await tick(); let updates = 0; f.client.subscribe(() => updates++); f.client.dispose(); pending.resolve(json(snapshot())); await loading; assert.equal(updates, 0); assert.equal(f.unsubscribed, true); });
test("official SDK URL requests one-time checkout without pay later or vaulting", () => {
  const url = new URL(sdkModule.paypalSdkUrl("public-test-client-id")); assert.equal(url.origin, "https://www.paypal.com"); assert.equal(url.pathname, "/sdk/js"); assert.equal(url.searchParams.get("components"), "buttons"); assert.equal(url.searchParams.get("vault"), "false"); assert.equal(url.searchParams.get("intent"), "capture"); assert.equal(url.searchParams.get("enable-funding"), "venmo,card"); assert.equal(url.searchParams.get("disable-funding"), "paylater,credit"); assert.throws(() => sdkModule.paypalSdkUrl("bad&components=evil"));
  assert.equal(new URL(sdkModule.paypalSdkUrl("public-test-client-id", true)).searchParams.get("components"), "buttons,applepay");
});
test("SDK adapter delegates creation and capture, restarts declined instruments and never grants", async () => {
  const calls = [], controller = { createOrder: async (...args) => { calls.push(["create", ...args]); return PAYPAL; }, capture: async (...args) => { calls.push(["capture", ...args]); return "restart"; }, cancelled: async (...args) => calls.push(["cancel", ...args]), sdkError: (...args) => calls.push(["error", ...args]) };
  const options = sdkModule.paypalButtonOptions(controller, "profile_10", A); assert.equal(await options.createOrder(), PAYPAL); await options.onApprove({ orderID: PAYPAL }, { restart: async () => calls.push(["restart"]) }); await options.onCancel(); options.onError(); assert.deepEqual(calls.map(call => call[0]), ["create", "capture", "restart", "cancel", "error"]); assert.deepEqual(calls[1], ["capture", PAYPAL, A]);
});
function sdkFixture() { const scripts = [], target = {}; const document = { createElement: () => ({ attributes: {}, setAttribute(key, value) { this.attributes[key] = value; }, remove() { this.removed = true; } }), head: { appendChild(script) { scripts.push(script); } } }; return { scripts, document, target }; }
test("SDK script loads once per document and errors can retry", async () => {
  const f = sdkFixture(), load = sdkModule.loadPayPalSdk("public-test-client-id", { document: f.document, window: f.target }); assert.equal(f.scripts.length, 1); assert.equal(f.scripts[0].attributes["data-namespace"], "qrguitarPayPal"); assert.equal(load, sdkModule.loadPayPalSdk("public-test-client-id", { document: f.document, window: f.target }));
  f.scripts[0].onerror(); await assert.rejects(load); assert.equal(f.scripts[0].removed, true);
  const retry = sdkModule.loadPayPalSdk("public-test-client-id", { document: f.document, window: f.target }); f.target.qrguitarPayPal = { Buttons() {} }; f.scripts[1].onload(); assert.equal(await retry, f.target.qrguitarPayPal); await assert.rejects(sdkModule.loadPayPalSdk("different-client-id", { document: f.document, window: f.target }));
});
test("SDK load timeout removes the broken script and permits retry", async () => { const f = sdkFixture(); await assert.rejects(sdkModule.loadPayPalSdk("public-test-client-id", { document: f.document, window: f.target, timeoutMs: 5 })); assert.equal(f.scripts[0].removed, true); });

const appleConfig = { isEligible: true, countryCode: "US", merchantCapabilities: ["supports3DS"], supportedNetworks: ["visa", "masterCard", "amex"] };
function appleFixture(t, changes = {}) {
  const calls = [], sessions = [], state = { actorId: A }, f = { calls, sessions, state, ...changes };
  class Session {
    static STATUS_SUCCESS = 1; static STATUS_FAILURE = 0; static canMakePayments() { return true; } static supportsVersion(version) { return version === 4; }
    constructor(version, request) { this.request = request; calls.push(["session", version, request]); sessions.push(this); }
    begin() { calls.push(["begin"]); } abort() { calls.push(["abort"]); } completeMerchantValidation(value) { calls.push(["validated", value]); } completePayment(status) { calls.push(["native", status]); }
  }
  f.Session = Session;
  f.applepay = { config: async () => appleConfig, validateMerchant: async input => { calls.push(["validate", input]); return { merchantSession: { signed: true } }; }, confirmOrder: async input => { calls.push(["confirm", input]); return {}; }, ...changes.applepay };
  f.controller = { getState: () => state, beginWalletCheckout: (...args) => { calls.push(["open", ...args]); return state.actorId === A; }, createOrder: async (...args) => { calls.push(["create", ...args]); return PAYPAL; }, capture: async (...args) => { calls.push(["capture", ...args]); return "confirmed"; }, cancelled: async (...args) => calls.push(["cancel", ...args]), sdkError: (...args) => calls.push(["error", ...args]), ...changes.controller };
  f.checkout = appleModule.createApplePayCheckout({ applepay: f.applepay, config: appleConfig, Session, controller: f.controller, actorId: A, offer: offers[1], merchantName: "QRguitar", onBusy: value => calls.push(["busy", value]), timeoutMs: changes.timeoutMs ?? 100 });
  t.after(() => f.checkout.dispose()); return f;
}
test("Apple SDK uses the official script with anonymous CORS, retries failures and stays single-load", async () => {
  const f = sdkFixture(), first = appleModule.loadApplePaySdk({ document: f.document }); assert.equal(first, appleModule.loadApplePaySdk({ document: f.document })); assert.equal(f.scripts[0].src, "https://applepay.cdn-apple.com/jsapi/1.latest/apple-pay-sdk.js"); assert.equal(f.scripts[0].crossOrigin, "anonymous"); f.scripts[0].onerror(); await assert.rejects(first); assert.equal(f.scripts[0].removed, true);
  const retry = appleModule.loadApplePaySdk({ document: f.document }); f.scripts[1].onload(); await retry;
});
test("Apple SDK timeout can retry without blocking other payment methods", async () => { const f = sdkFixture(); await assert.rejects(appleModule.loadApplePaySdk({ document: f.document, timeoutMs: 5 })); assert.equal(f.scripts[0].removed, true); });
test("Apple Pay requires the server flag, capable device and eligible merchant config", async t => {
  const f = appleFixture(t), sdk = { Applepay: () => f.applepay }, browser = { ApplePaySession: f.Session };
  assert.equal(await appleModule.eligibleApplePay(sdk, false, { window: browser }), null); assert.equal(await appleModule.eligibleApplePay(sdk, true, { window: {} }), null);
  assert.equal(await appleModule.eligibleApplePay(sdk, true, { window: { ApplePaySession: { canMakePayments: () => false } } }), null);
  assert.equal(await appleModule.eligibleApplePay({ Applepay: () => ({ config: async () => ({ ...appleConfig, isEligible: false }) }) }, true, { window: browser }), null);
  assert.equal(await appleModule.eligibleApplePay({ Applepay: () => ({ config: async () => ({ ...appleConfig, countryCode: "bad" }) }) }, true, { window: browser }), null);
  assert.equal(await appleModule.eligibleApplePay({ Applepay: () => ({ config: () => new Promise(() => {}) }) }, true, { window: browser, timeoutMs: 5 }), null);
  assert.equal((await appleModule.eligibleApplePay(sdk, true, { window: browser })).applepay, f.applepay);
});
test("Apple's non-WebKit handoff uses the matching sandbox or live environment", async t => { const f = appleFixture(t), configured = [], browser = { ApplePaySession: f.Session, ApplePayWebOptions: { set: value => configured.push(value) } }, sdk = { Applepay: () => f.applepay }; await appleModule.eligibleApplePay(sdk, true, { window: browser, environment: "test" }); await appleModule.eligibleApplePay(sdk, true, { window: browser, environment: "live" }); assert.deepEqual(configured, [{ environment: "sandbox" }, { environment: "prod" }]); });
test("wallet opening requires authoritative Apple Pay permission and creates no order before authorization", async t => {
  for (const applePayEnabled of [false, true]) { const f = fixture(t, { status: snapshot({ applePayEnabled }) }); await f.ready(); assert.equal(f.client.beginWalletCheckout("profile_10", A), applePayEnabled); assert.equal(f.client.beginWalletCheckout("profile_10", B), false); assert.equal(f.posts().length, 0); if (applePayEnabled) { assert.equal(f.client.getState().checkoutOpen, true); assert.equal(f.client.beginWalletCheckout("profile_10", A), false); await f.client.cancelled(A); assert.equal(f.client.getState().checkoutOpen, false); } }
});
test("Apple session starts synchronously with exact selected total and validates merchant through PayPal", async t => {
  const f = appleFixture(t); assert.equal(f.checkout.start(), true); assert.deepEqual(f.calls.map(call => call[0]), ["open", "session", "busy", "begin"]); assert.deepEqual(f.sessions[0].request.total, { label: "QRguitar", type: "final", amount: "50.00" }); assert.equal(f.sessions[0].request.currencyCode, "USD"); assert.equal("requiredShippingContactFields" in f.sessions[0].request, false); assert.equal(f.checkout.start(), false);
  f.sessions[0].onvalidatemerchant({ validationURL: "https://apple-pay-gateway.apple.com/paymentservices/startSession" }); await until(() => f.calls.some(call => call[0] === "validated")); assert.equal(f.calls.find(call => call[0] === "validate")[1].displayName, "QRguitar"); assert.equal(f.calls.some(call => call[0] === "create"), false);
});
test("Apple token and contact only go to PayPal; server capture receives the saved order identifier", async t => {
  const f = appleFixture(t), token = { encrypted: "TOKEN_ONLY_TO_PAYPAL" }, contact = { postalCode: "PRIVATE_CONTACT" }; f.checkout.start(); const event = { payment: { token, billingContact: contact } }; f.sessions[0].onpaymentauthorized(event); f.sessions[0].onpaymentauthorized(event); await until(() => f.calls.some(call => call[0] === "capture"));
  assert.deepEqual(f.calls.find(call => call[0] === "confirm"), ["confirm", { orderId: PAYPAL, token, billingContact: contact }]); assert.deepEqual(f.calls.find(call => call[0] === "create"), ["create", "profile_10", A]); assert.deepEqual(f.calls.find(call => call[0] === "capture"), ["capture", PAYPAL, A]); assert.equal(f.calls.filter(call => call[0] === "confirm").length, 1); assert.equal(f.calls.filter(call => call[0] === "native")[0][1], f.Session.STATUS_SUCCESS);
});
test("Apple authorization uses the real controller API and ledger without sending token data to QRguitar", async t => {
  const payer = fixture(t, { status: snapshot({ applePayEnabled: true }) }); await payer.ready();
  const native = appleFixture(t), checkout = appleModule.createApplePayCheckout({ applepay: native.applepay, config: appleConfig, Session: native.Session, controller: payer.client, actorId: A, offer: offers[1], merchantName: "QRguitar" }); t.after(() => checkout.dispose());
  checkout.start(); native.sessions[0].onpaymentauthorized({ payment: { token: { encrypted: "TOKEN_NEVER_TO_QRGUITAR" }, billingContact: { postalCode: "CONTACT_NEVER_TO_QRGUITAR" } } }); await until(() => payer.client.getState().snapshot?.order?.status === "fulfilled");
  assert.equal(payer.client.getState().snapshot.paidAvailable, 10); assert.deepEqual(payer.posts().map(call => JSON.parse(call.init.body)), [{ offerKey: "profile_10", requestId: ID }, { orderId: ORDER }]); assert.doesNotMatch(JSON.stringify([...payer.stored.entries(), ...payer.calls]), /TOKEN_NEVER_TO_QRGUITAR|CONTACT_NEVER_TO_QRGUITAR/);
});
test("Apple cancel before authorization creates and captures nothing", async t => { const f = appleFixture(t); f.checkout.start(); f.sessions[0].oncancel(); await tick(); assert.equal(f.calls.some(call => ["create", "confirm", "capture"].includes(call[0])), false); assert.equal(f.calls.filter(call => call[0] === "cancel").length, 1); });
test("Apple merchant-validation failures abort without a purchase", async t => { const f = appleFixture(t, { applepay: { validateMerchant: () => { throw new Error("Unavailable"); } } }); f.checkout.start(); f.sessions[0].onvalidatemerchant({ validationURL: "https://apple.example" }); await until(() => f.calls.some(call => call[0] === "abort")); assert.equal(f.calls.some(call => ["create", "capture"].includes(call[0])), false); assert.equal(f.calls.filter(call => call[0] === "error").length, 1); });
test("Apple confirm failure or timeout does not capture or claim success", async t => {
  for (const confirmOrder of [async () => { throw new Error("Denied"); }, () => new Promise(() => {})]) {
    const f = appleFixture(t, { applepay: { confirmOrder }, timeoutMs: 5 }); f.checkout.start(); f.sessions[0].onpaymentauthorized({ payment: { token: "TOKEN" } }); await until(() => f.calls.some(call => call[0] === "error")); assert.equal(f.calls.some(call => call[0] === "capture"), false); assert.deepEqual(f.calls.filter(call => call[0] === "native"), [["native", f.Session.STATUS_FAILURE]]);
  }
});
test("unmount cancels the native sheet and ignores late merchant validation", async t => { const pending = deferred(), f = appleFixture(t, { applepay: { validateMerchant: () => pending.promise } }); f.checkout.start(); f.sessions[0].onvalidatemerchant({ validationURL: "https://apple.example" }); f.checkout.dispose(); pending.resolve({ merchantSession: "late" }); await tick(); assert.equal(f.calls.some(call => call[0] === "abort"), true); assert.equal(f.calls.some(call => call[0] === "validated"), false); });
test("late merchant callbacks after cancel never contact PayPal", async t => { const f = appleFixture(t); f.checkout.start(); f.sessions[0].oncancel(); f.sessions[0].onvalidatemerchant({ validationURL: "https://apple.example" }); await tick(); assert.equal(f.calls.some(call => call[0] === "validate"), false); });
test("account changes while Apple confirms prevent capture in the new account", async t => { const pending = deferred(), f = appleFixture(t, { applepay: { confirmOrder: () => pending.promise } }); f.checkout.start(); f.sessions[0].onpaymentauthorized({ payment: { token: "TOKEN" } }); await until(() => f.calls.some(call => call[0] === "create")); f.state.actorId = B; f.checkout.dispose(); pending.resolve({}); await tick(); assert.equal(f.calls.some(call => call[0] === "capture"), false); assert.equal(f.calls.some(call => call[0] === "native"), false); assert.equal(f.calls.some(call => call[0] === "cancel"), false); });

function renderBilling(state, { mode = "overview", query = "", choice = { actorId: "", offerKey: "" }, controller = null, appleOption = null } = {}) {
  const React = require("react"), { renderToStaticMarkup } = require("react-dom/server"), component = { exports: {} }; let states = 0, refs = 0;
  const compiled = ts.transpileModule(fs.readFileSync(path.join(web, "app/billing/PayPalBillingPage.tsx"), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function("require", "module", "exports", compiled)(specifier => {
    if (specifier === "react") return { ...React, useEffect() {}, useRef: () => ({ current: refs++ === 0 ? controller : null }), useState(initial) { const index = states++; return [index === 0 ? state : index === 1 ? choice : index === 5 ? appleOption : typeof initial === "function" ? initial() : initial, () => {}]; } };
    if (specifier === "next/link") return ({ children, ...props }) => React.createElement("a", props, children);
    if (specifier === "next/navigation") return { useSearchParams: () => new URLSearchParams(query) };
    if (specifier.endsWith("/Nav")) return { Nav: () => null };
    if (specifier.endsWith("/Footer")) return { Footer: () => null };
    if (specifier.endsWith("/supabase-browser")) return { createBrowserSupabaseClient: () => { throw new Error("No auth during render"); } };
    if (specifier.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_target, name) => String(name) }) };
    if (specifier.includes("/lib/")) return load(specifier.split("/").at(-1));
    return require(specifier);
  }, component, component.exports);
  return renderToStaticMarkup(React.createElement(component.exports.default, { mode }));
}
const ready = patch => ({ ...client.initialPayPalPaymentsState(), phase: "ready", actorId: A, snapshot: snapshot(), ...patch });
test("default billing is compact automated checkout without manual payment chores", () => { const html = renderBilling(ready()); assert.match(html, /5 free Profiles/); assert.match(html, /\$12/); assert.match(html, /\$50/); assert.match(html, /\$99/); assert.doesNotMatch(html, /I sent|Copy|Payment note|screenshot|manual verification|Apple Pay|Most popular/); });
test("Apple payment button stays absent until server and device/provider eligibility both permit it", () => {
  const options = { choice: { actorId: A, offerKey: "profile_10" }, controller: {} };
  const eligible = renderBilling(ready({ snapshot: snapshot({ applePayEnabled: true }) }), { ...options, appleOption: {} }); assert.match(eligible, /<apple-pay-button/); assert.match(eligible, /Buy with Apple Pay/); assert.match(eligible, /Payment information is processed by PayPal/); assert.match(eligible, /paypal\.com\/us\/legalhub\/paypal\/privacy-full/);
  for (const [enabled, appleOption] of [[true, null], [false, {}], [false, null]]) { const html = renderBilling(ready({ snapshot: snapshot({ applePayEnabled: enabled }) }), { ...options, appleOption }); assert.doesNotMatch(html, /<apple-pay-button|Buy with Apple Pay/); assert.match(html, /Loading secure payment options/); }
});
test("available free or paid capacity remains the primary create path", () => { const html = renderBilling(ready({ snapshot: snapshot({ freeRemaining: 3 }) })); assert.match(html, /No purchase needed/); assert.match(html, /Create a Profile/); assert.match(html, /<details class="packDisclosure">/); });
test("confirmed account state alone shows success", () => { const html = renderBilling(ready({ snapshot: snapshot({ order: order({ status: "fulfilled" }), paidGranted: 10, paidRemaining: 10, paidAvailable: 10 }) })); assert.match(html, /10 Profile credits have been added/); assert.match(html, /No extra steps/); const unconfirmed = renderBilling(ready(), { query: "paid=true&success=true&token=FAKEORDER123" }); assert.doesNotMatch(unconfirmed, /have been added|You’re ready to create/); });
test("a new pack can be selected after success without replaying the prior receipt", () => {
  const state = ready({ snapshot: snapshot({ order: order({ status: "fulfilled" }), paidGranted: 10, paidRemaining: 10, paidAvailable: 10 }) });
  const html = renderBilling(state, { choice: { actorId: A, offerKey: "profile_25", afterOrderId: ORDER } }); assert.match(html, /id="automatic-checkout-title"[^>]*>25 Profile credits/); assert.match(html, /Your credits are added automatically/); assert.doesNotMatch(html, /10 Profile credits have been added/);
  const receipt = renderBilling(state, { mode: "return", query: `orderId=${ORDER}` }); assert.match(receipt, /10 Profile credits have been added/); assert.match(receipt, /Add another Profile pack/);
});
test("return URL switches hide stale order until fresh identity checked", () => { const html = renderBilling(ready({ snapshot: snapshot({ order: order({ status: "fulfilled" }) }) }), { mode: "return", query: `orderId=${ID2}` }); assert.match(html, /Loading your Profile balance/); assert.doesNotMatch(html, /have been added/); });
test("cancel UI preserves payment recovery without asserting no charge", () => { const next = order(); const html = renderBilling(ready({ snapshot: snapshot({ order: next, pendingOrder: next }) }), { mode: "cancel", query: `orderId=${ORDER}` }); assert.match(html, /does not confirm or cancel a charge/); assert.doesNotMatch(html, /payment cancelled|no charge|have been added/i); });
test("earlier payments use the matching provider recovery and prevent active new purchase controls", () => {
  const direct = renderBilling(ready({ snapshot: snapshot({ legacyOrderId: ORDER, legacyOrderProvider: "direct" }) }));
  assert.match(direct, /href="\/contact"/); assert.match(direct, /legacy payment/); assert.doesNotMatch(direct, /\/billing\/manual|I sent|Payment note|Copy/);
  const stripe = renderBilling(ready({ snapshot: snapshot({ legacyOrderId: ORDER, legacyOrderProvider: "stripe" }) }));
  assert.match(stripe, new RegExp(`/billing/return\\?orderId=${ORDER}`));
  for (const html of [direct, stripe]) assert.doesNotMatch(html, /aria-label="10 Profile credits/);
});
test("earlier payment identity and provider must arrive together", async t => {
  for (const patch of [{ legacyOrderId: ORDER }, { legacyOrderProvider: "direct" }, { legacyOrderId: ORDER, legacyOrderProvider: "paypal" }]) {
    const f = fixture(t, { status: snapshot(patch) }); await f.ready(); assert.equal(f.client.getState().phase, "error");
  }
});
test("paused sales still render official checkout for the saved pending pack", () => {
  const next = order(), intent = { requestId: ID, offerKey: "profile_10", orderId: ORDER, paypalOrderId: PAYPAL, approvalObserved: false };
  const html = renderBilling(ready({ snapshot: snapshot({ enabled: false, offers: [], order: next, pendingOrder: next }), intent }), { controller: {} }); assert.match(html, /Loading secure payment options/); assert.match(html, /10 Profile credits/); assert.doesNotMatch(html, /Checkout is being connected/);
  const unconfigured = renderBilling(ready({ snapshot: snapshot({ enabled: false, clientId: null, offers: [], order: next, pendingOrder: next }), intent }), { controller: {} }); assert.doesNotMatch(unconfigured, /Loading secure payment options/); assert.match(unconfigured, /Check saved payment/);
});
test("automatic-payment errors offer retry and support without sending PayPal IDs to manual checkout", () => {
  const html = renderBilling({ ...client.initialPayPalPaymentsState(), phase: "error", actorId: A, message: "Could not check payment" }, { mode: "return", query: `orderId=${ORDER}` }); assert.match(html, /Try again/); assert.match(html, /href="\/contact"/); assert.doesNotMatch(html, /\/billing\/manual/);
});
test("approval or processing status only shows pending confirmation", () => { const next = order({ status: "processing" }); const html = renderBilling(ready({ snapshot: snapshot({ order: next, pendingOrder: next }) })); assert.match(html, /Confirming your payment/); assert.match(html, /Check saved payment/); assert.doesNotMatch(html, /have been added|No extra steps/); });
