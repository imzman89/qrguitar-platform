import { withUiTextTestContext } from "./ui-text-test-context.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), require = withUiTextTestContext(createRequire(path.join(web, "package.json"))), ts = require("typescript");
const clientModule = { exports: {} };
new Function("exports", "module", ts.transpileModule(fs.readFileSync(path.join(web, "lib/direct-payments-client.ts"), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText)(clientModule.exports, clientModule);
const { createDirectPaymentsClient, createAdminPaymentsClient, directPaymentUrl, initialDirectPaymentsState } = clientModule.exports;
const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222", ID = "33333333-3333-4333-8333-333333333333", ORDER = "44444444-4444-4444-8444-444444444444", ID2 = "55555555-5555-4555-8555-555555555555";
const offers = [{ key: "profile_1", amount: 1200, credits: 1 }, { key: "profile_10", amount: 5000, credits: 10 }, { key: "profile_25", amount: 9900, credits: 25 }].map(value => ({ ...value, version: 1, currency: "usd", permanent: true, freeAllowance: 5 }));
const order = (patch = {}) => ({ orderId: ORDER, ownerId: A, requestId: ID, offerKey: "profile_10", method: "venmo", status: "awaiting_payment", reference: "QRG-123456789", offer: offers[1], recipient: { accountKey: "qrguitar-business", displayName: "QRguitar", paymentUrl: "https://venmo.com/u/qrguitar-business", address: null }, createdAt: "2026-09-18T12:00:00.000Z", payerReference: null, ...patch });
const snapshot = (patch = {}) => ({ environment: "live", freeLimit: 5, freeRemaining: 3, paidGranted: 10, paidConsumed: 2, paidRemaining: 8, paidAvailable: 8, ownedProfiles: 2, hold: false, commercialExempt: false, enabled: true, methods: [{ key: "venmo", label: "Venmo" }, { key: "cashapp", label: "Cash App" }], offers, approvalMessage: "We manually verify received payments.", directOrder: null, pendingOrder: null, ...patch });
const json = value => Response.json({ ok: true, ...value }), session = id => id ? { access_token: `token-${id}`, user: { id } } : null;
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { resolve, promise }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(predicate) { for (let i = 0; i < 300; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 1)); } assert.ok(predicate(), "condition did not settle"); }
function fixture(t, options = {}) {
  const f = { session: session(A), calls: [], stored: new Map(), status: snapshot(), uuidCalls: 0, queue: [order()], ...options }; let callback;
  const auth = { getSession: () => f.getSession ? f.getSession() : Promise.resolve({ data: { session: f.session } }), onAuthStateChange(fn) { callback = fn; return { data: { subscription: { unsubscribe() { f.unsubscribed = true; } } } }; } };
  f.respond = options.respond || (async (url, init) => {
    if (url.startsWith("/api/billing/direct/status")) return json(f.status);
    if (url.startsWith("/api/admin/payments") && init.method === "GET") return json({ environment: "live", orders: f.queue, hasMore: false });
    const body = JSON.parse(init.body);
    if (url.endsWith("/checkout")) { const next = order({ requestId: body.requestId, offerKey: body.offerKey, offer: offers.find(offer => offer.key === body.offerKey), method: body.method }); f.status = snapshot({ directOrder: next, pendingOrder: next }); return json({ order: next }); }
    if (url.endsWith("/claim")) { const next = order({ ...f.status.pendingOrder, status: "pending_review", payerReference: body.reference }); f.status = snapshot({ directOrder: next, pendingOrder: next }); return json({ order: next }); }
    const next = order({ status: body.action === "close" ? "closed" : "fulfilled" }); f.queue = [next]; return json({ order: next });
  });
  const factory = options.admin ? createAdminPaymentsClient : createDirectPaymentsClient;
  f.client = factory({ auth: () => auth, fetch: async (url, init) => { f.calls.push({ url, init }); return f.respond(url, init); }, timeoutMs: f.timeoutMs ?? 1000, orderId: f.orderId,
    randomUUID: () => { f.uuidCalls++; return f.uuidCalls === 1 ? ID : ID2; }, storage: () => { if (f.storageDenied) throw new Error("Storage denied"); return { getItem: key => f.stored.get(key) || null, setItem: (key, value) => f.stored.set(key, value), removeItem: key => f.stored.delete(key) }; } });
  f.change = id => { f.session = session(id); callback("SIGNED_IN", f.session); };
  f.ready = async () => { await f.client.start(); await until(() => ["ready", "signed-out", "error"].includes(f.client.getState().phase)); };
  f.posts = () => f.calls.filter(call => call.init.method === "POST"); t.after(() => f.client.dispose()); return f;
}

test("provider links reject lookalikes, personal schemes, credentials and explicit ports", () => {
  assert.equal(directPaymentUrl("cashapp", "https://cash.app/$qrguitar"), "https://cash.app/$qrguitar");
  assert.equal(directPaymentUrl("paypal", "https://www.paypal.com/ncp/payment/EXAMPLE"), "https://www.paypal.com/ncp/payment/EXAMPLE");
  assert.equal(directPaymentUrl("paypal", "https://www.sandbox.paypal.com/ncp/payment/EXAMPLE"), "https://www.sandbox.paypal.com/ncp/payment/EXAMPLE");
  assert.equal(directPaymentUrl("paypal", "https://www.paypal.com/paypalme/personal"), "");
  for (const value of ["javascript:alert(1)", "cashapp://cash.app/$qrguitar", "http://cash.app/$qrguitar", "https://cash.app.evil.test/pay", "https://cash.app:443/pay", "https://owner@cash.app/pay", " https://cash.app/pay", "https://cash.app/\\evil", null]) assert.equal(directPaymentUrl("cashapp", value), "", String(value));
  assert.equal(directPaymentUrl("applepay", "https://apple.com/pay"), "");
});
test("signed-out accounts make no payment requests", async t => { const f = fixture(t, { session: null }); await f.ready(); await f.client.checkout("profile_10", "venmo"); assert.equal(f.calls.length, 0); assert.equal(f.client.getState().phase, "signed-out"); });
test("verified free allowance and balances load without writing", async t => { const f = fixture(t); await f.ready(); assert.equal(f.client.getState().snapshot.freeLimit, 5); assert.equal(f.client.getState().snapshot.paidAvailable, 8); assert.equal(f.posts().length, 0); assert.equal(f.calls[0].init.cache, "no-store"); });
test("disabled, held, exempt and unconfigured accounts cannot open a new payment", async t => {
  for (const patch of [{ enabled: false }, { methods: [] }, { hold: true, paidAvailable: 0 }, { commercialExempt: true }]) { const f = fixture(t, { status: snapshot(patch) }); await f.ready(); await f.client.checkout("profile_10", "venmo"); assert.equal(f.posts().length, 0); }
});
test("tampered balance and price fail closed", async t => { for (const patch of [{ freeLimit: 4 }, { paidAvailable: 999 }, { offers: [{ ...offers[0], amount: 1 }] }]) { const f = fixture(t, { status: snapshot(patch) }); await f.ready(); assert.equal(f.client.getState().phase, "error"); assert.equal(f.client.getState().snapshot, null); } });
test("double tap creates one saved order with the exact approved pack", async t => {
  const f = fixture(t); await f.ready(); await Promise.all([f.client.checkout("profile_10", "venmo"), f.client.checkout("profile_10", "venmo")]);
  assert.equal(f.posts().length, 1); assert.deepEqual(JSON.parse(f.posts()[0].init.body), { requestId: ID, offerKey: "profile_10", method: "venmo" }); assert.equal(f.client.getState().snapshot.directOrder.status, "awaiting_payment"); assert.equal(f.client.getState().snapshot.paidAvailable, 8);
});
test("uncertain checkout keeps request UUID across reload and controller recreation", async t => {
  const f = fixture(t), respond = f.respond; f.respond = (url, init) => init.method === "POST" ? Promise.reject(new Error("Connection lost")) : respond(url, init);
  await f.ready(); await f.client.checkout("profile_10", "venmo"); await f.client.reload(); assert.equal(f.client.getState().intent.requestId, ID);
  await f.client.checkout("profile_25", "venmo"); assert.equal(f.posts().length, 1);
  const resumed = fixture(t, { stored: f.stored }); await resumed.ready(); await resumed.client.checkout(); assert.equal(resumed.uuidCalls, 0); assert.equal(resumed.posts()[0].init.body, f.posts()[0].init.body);
});
test("server pending order restores context with storage denied", async t => { const next = order(); const f = fixture(t, { storageDenied: true, status: snapshot({ directOrder: next, pendingOrder: next }) }); await f.ready(); assert.equal(f.client.getState().intent.orderId, ORDER); assert.equal(f.uuidCalls, 0); });
test("privacy-preserving Zelle uses hosted instructions with no recipient address", async t => {
  const next = order({ method: "zelle", recipient: { ...order().recipient, address: null, paymentUrl: "https://enroll.zellepay.com/qr-codes?data=business-issued-link" } });
  const f = fixture(t, { status: snapshot({ directOrder: next, pendingOrder: next }) }); await f.ready(); assert.equal(f.client.getState().phase, "ready"); assert.equal(f.client.getState().snapshot.directOrder.recipient.address, null);
});
test("saved request recovers a fulfilled order after its method was disabled", async t => {
  const stored = new Map([[`qrguitar:direct-payment:${A}`, JSON.stringify({ intent: { requestId: ID, orderId: "", offerKey: "profile_10", method: "venmo" }, claim: null })]]);
  const f = fixture(t, { stored, status: snapshot({ enabled: false, methods: [], offers: [] }) }), respond = f.respond;
  f.respond = (url, init) => { if (init.method === "POST") { f.status = snapshot({ enabled: false, methods: [], offers: [], directOrder: order({ status: "fulfilled" }) }); return json({ order: order({ status: "fulfilled" }) }); } return respond(url, init); };
  await f.ready(); await f.client.checkout(); assert.equal(f.posts().length, 1); assert.equal(f.client.getState().snapshot.directOrder.status, "fulfilled"); assert.equal(f.client.getState().intent, null); assert.equal(f.uuidCalls, 0);
});
test("reporting payment enters pending review without granting credits", async t => {
  const f = fixture(t); await f.ready(); await f.client.checkout("profile_10", "venmo"); await f.client.claim("Jane / transaction 123");
  assert.equal(f.client.getState().snapshot.directOrder.status, "pending_review"); assert.equal(f.client.getState().snapshot.paidAvailable, 8); assert.equal(f.client.getState().claim, null); assert.deepEqual(JSON.parse(f.posts()[1].init.body), { orderId: ORDER, requestId: ID2, reference: "Jane / transaction 123" });
});
test("uncertain payment report retries identical text and request UUID", async t => {
  const next = order(), f = fixture(t, { status: snapshot({ directOrder: next, pendingOrder: next }) }), respond = f.respond; let reject = true;
  f.respond = (url, init) => url.endsWith("/claim") && reject ? Promise.reject(new Error("Lost response")) : respond(url, init);
  await f.ready(); await f.client.claim("original payer reference"); await f.client.reload(); reject = false; await f.client.claim("different text");
  assert.equal(f.posts()[0].init.body, f.posts()[1].init.body); assert.equal(f.uuidCalls, 1); assert.equal(f.client.getState().snapshot.paidAvailable, 8);
});
test("a rejected customer reference can be corrected without resending money", async t => {
  const next = order(), f = fixture(t, { status: snapshot({ directOrder: next, pendingOrder: next }) }), respond = f.respond; let invalid = true;
  f.respond = (url, init) => url.endsWith("/claim") && invalid ? Response.json({ ok: false, message: "Invalid reference" }, { status: 400 }) : respond(url, init);
  await f.ready(); await f.client.claim("bad\nreference"); assert.equal(f.posts().length, 0); await f.client.claim("reference"); assert.equal(f.client.getState().claim, null); invalid = false;
  await f.client.claim("corrected reference"); assert.equal(f.client.getState().snapshot.directOrder.status, "pending_review"); assert.equal(f.client.getState().snapshot.paidAvailable, 8);
});
test("checkout response cannot fake a confirmed grant if authoritative GET is unavailable", async t => {
  const f = fixture(t), respond = f.respond; let wrote = false;
  f.respond = (url, init) => { if (init.method === "POST") { wrote = true; return json({ order: order({ status: "fulfilled" }) }); } return wrote ? Response.json({ ok: false, message: "Read unavailable" }, { status: 503 }) : respond(url, init); };
  await f.ready(); await f.client.checkout("profile_10", "venmo"); assert.equal(f.client.getState().phase, "error"); assert.equal(f.client.getState().snapshot, null); assert.equal(f.client.getState().intent.requestId, ID);
});
test("verified terminal order releases only its matched saved request", async t => {
  const next = order({ status: "fulfilled" }), stored = new Map([[`qrguitar:direct-payment:${A}`, JSON.stringify({ intent: { requestId: ID, orderId: ORDER, offerKey: "profile_10", method: "venmo" }, claim: null })]]);
  const f = fixture(t, { stored, status: snapshot({ directOrder: next }) }); await f.ready(); assert.equal(f.client.getState().intent, null); assert.equal(stored.size, 0); assert.equal(f.posts().length, 0);
});
test("old account checkout responses are ignored and balances clear immediately", async t => {
  const f = fixture(t), pending = deferred(), respond = f.respond; f.respond = (url, init) => init.method === "POST" ? pending.promise : respond(url, init);
  await f.ready(); const checkout = f.client.checkout("profile_10", "venmo"); await until(() => f.posts().length === 1); f.change(B); assert.equal(f.client.getState().snapshot, null);
  pending.resolve(json({ order: order() })); await checkout; await until(() => f.client.getState().phase === "ready"); assert.equal(f.client.getState().actorId, B); assert.equal(f.client.getState().intent, null);
});
test("silent account switch after a response prevents old account publication", async t => {
  const f = fixture(t), respond = f.respond; f.respond = async (url, init) => { const result = await respond(url, init); if (init.method === "POST") { f.session = session(B); f.status = snapshot(); } return result; };
  await f.ready(); await f.client.checkout("profile_10", "venmo"); await until(() => f.client.getState().phase === "ready"); assert.equal(f.client.getState().actorId, B); assert.equal(f.client.getState().snapshot.directOrder, null);
});
test("private orders belonging to another actor are rejected", async t => { const next = order({ ownerId: B }), f = fixture(t, { status: snapshot({ directOrder: next, pendingOrder: next }) }); await f.ready(); assert.equal(f.client.getState().phase, "error"); assert.equal(f.client.getState().snapshot, null); });
test("newer GET wins when requests arrive out of order", async t => {
  const f = fixture(t); await f.ready(); const earlier = deferred(); let reads = 0; f.respond = () => ++reads === 1 ? earlier.promise : json(snapshot({ freeRemaining: 1 }));
  const load = f.client.reload(); await until(() => reads === 1); await f.client.reload(); earlier.resolve(json(snapshot({ freeRemaining: 4 }))); await load; assert.equal(f.client.getState().snapshot.freeRemaining, 1);
});
test("bounded JSON read retains checkout UUID and stops busy state", async t => {
  const f = fixture(t, { timeoutMs: 15 }), respond = f.respond; f.respond = (url, init) => init.method === "POST" ? { ok: true, json: () => new Promise(() => {}) } : respond(url, init);
  await f.ready(); await f.client.checkout("profile_10", "venmo"); assert.equal(f.client.getState().busy, false); assert.equal(f.client.getState().intent.requestId, ID); assert.equal(f.client.getState().uncertain, true);
});
test("dispose cancels auth subscription and late publication", async t => {
  const f = fixture(t); await f.ready(); const pending = deferred(); f.respond = () => pending.promise; const reload = f.client.reload(); await tick(); let updates = 0; f.client.subscribe(() => updates++); f.client.dispose(); pending.resolve(json(snapshot())); await reload; assert.equal(updates, 0); assert.equal(f.unsubscribed, true);
});
test("admin denial exposes no queue", async t => { const f = fixture(t, { admin: true, respond: () => Response.json({ ok: false, message: "Admin access required" }, { status: 403 }) }); await f.ready(); assert.equal(f.client.getState().phase, "error"); assert.equal(f.client.getState().orders.length, 0); });
test("admin verification sends exact receipt and refreshes server queue", async t => {
  const f = fixture(t, { admin: true }); await f.ready(); const body = { action: "verify", orderId: ORDER, amount: 5000, currency: "usd", paymentReference: "PROVIDER-123", reason: "Matched received funds" };
  assert.equal(await f.client.decide(body), true); assert.deepEqual(JSON.parse(f.posts()[0].init.body), { ...body, requestId: ID }); assert.equal(f.client.getState().orders[0].status, "fulfilled"); assert.equal(f.client.getState().pendingDecision, null);
});
test("uncertain admin decisions survive refresh and retry exactly once with same identity", async t => {
  const f = fixture(t, { admin: true }), respond = f.respond; f.respond = (url, init) => init.method === "POST" ? Promise.reject(new Error("Lost response")) : respond(url, init);
  await f.ready(); await f.client.decide({ action: "verify", orderId: ORDER, amount: 5000, currency: "usd", paymentReference: "PROVIDER-123", reason: "Matched received funds" });
  await f.client.decide({ action: "close", orderId: ORDER, reason: "Different request" }); assert.equal(f.posts().length, 1);
  const resumed = fixture(t, { admin: true, stored: f.stored }); await resumed.ready(); await resumed.client.retryDecision(); assert.equal(f.posts()[0].init.body, resumed.posts()[0].init.body); assert.equal(resumed.uuidCalls, 0);
});
test("definitive admin validation failure permits corrected input", async t => {
  const f = fixture(t, { admin: true }), respond = f.respond; let invalid = true;
  f.respond = (url, init) => init.method === "POST" && invalid ? Response.json({ ok: false, message: "Check the payment details" }, { status: 400 }) : respond(url, init);
  await f.ready(); await f.client.decide({ action: "verify", orderId: ORDER, amount: 4900, currency: "usd", paymentReference: "PROVIDER-123", reason: "Matched received funds" });
  assert.equal(f.client.getState().pendingDecision, null); assert.match(f.client.getState().message, /correct the details/); invalid = false;
  await f.client.decide({ action: "verify", orderId: ORDER, amount: 5000, currency: "usd", paymentReference: "PROVIDER-123", reason: "Matched received funds" }); assert.equal(f.posts().length, 2); assert.equal(f.client.getState().orders[0].status, "fulfilled");
});
test("definitive admin conflict unlocks input without dropping unknown operations", async t => {
  const f = fixture(t, { admin: true }), respond = f.respond; f.respond = (url, init) => init.method === "POST" ? Response.json({ ok: false, message: "Payment reference already used" }, { status: 409 }) : respond(url, init);
  await f.ready(); await f.client.decide({ action: "verify", orderId: ORDER, amount: 5000, currency: "usd", paymentReference: "DUPLICATE-123", reason: "Matched received funds" }); assert.equal(f.client.getState().pendingDecision, null); assert.equal(f.stored.size, 0);
});
test("admin exact order search normalizes QRG reference and survives refresh and decisions", async t => {
  const f = fixture(t, { admin: true }); await f.ready(); await f.client.search(`QRG-${ORDER}`); assert.equal(f.client.getState().filterOrderId, ORDER); assert.equal(f.calls.at(-1).url, `/api/admin/payments?orderId=${ORDER}`);
  await f.client.decide({ action: "close", orderId: ORDER, reason: "Confirmed no payment received" }); assert.equal(f.calls.at(-1).url, `/api/admin/payments?orderId=${ORDER}`);
  await f.client.reload(); assert.equal(f.calls.at(-1).url, `/api/admin/payments?orderId=${ORDER}`); const before = f.calls.length; await f.client.search("not-a-valid-order"); assert.equal(f.calls.length, before);
  await f.client.search(""); assert.equal(f.calls.at(-1).url, "/api/admin/payments"); assert.equal(f.client.getState().filterOrderId, "");
});
test("admin account switch clears order details and abandons late decisions", async t => {
  const f = fixture(t, { admin: true }), pending = deferred(), respond = f.respond; f.respond = (url, init) => init.method === "POST" ? pending.promise : respond(url, init);
  await f.ready(); const writing = f.client.decide({ action: "close", orderId: ORDER, reason: "Unpaid request" }); await until(() => f.posts().length === 1); f.change(B); assert.equal(f.client.getState().orders.length, 0); assert.equal(f.client.getState().pendingDecision, null);
  pending.resolve(json({ order: order({ status: "closed" }) })); await writing; assert.equal(f.client.getState().actorId, B);
});

function renderBilling(state, query = "", choice = { actorId: "", offerKey: "" }, props = {}) {
  const React = require("react"), { renderToStaticMarkup } = require("react-dom/server"), component = { exports: {} }; let states = 0;
  const compiled = ts.transpileModule(fs.readFileSync(path.join(web, "app/billing/DirectBillingPage.tsx"), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function("require", "module", "exports", compiled)(specifier => {
    if (specifier === "react") return { ...React, useEffect() {}, useRef: () => ({ current: null }), useState(initial) { const index = states++; return [index === 0 ? state : index === 1 ? choice : typeof initial === "function" ? initial() : initial, () => {}]; } };
    if (specifier === "next/link" || specifier === "../../components/CheckoutAwareLink") return ({ children, ...props }) => React.createElement("a", props, children);
    if (specifier === "next/navigation") return { useSearchParams: () => new URLSearchParams(query) };
    if (specifier.endsWith("/Nav")) return { Nav: () => null };
    if (specifier.endsWith("/Footer")) return { Footer: () => null };
    if (specifier.endsWith("/supabase-browser")) return { createBrowserSupabaseClient: () => { throw new Error("No auth during render"); } };
    if (specifier.endsWith("/direct-payments-client")) return clientModule.exports;
    if (specifier.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_target, name) => String(name) }) };
    return require(specifier);
  }, component, component.exports);
  return renderToStaticMarkup(React.createElement(component.exports.default, props));
}
const ready = patch => ({ ...initialDirectPaymentsState(), phase: "ready", actorId: A, snapshot: snapshot(), ...patch });
test("real payer UI puts free capacity first and collapses optional packs", () => {
  const html = renderBilling(ready()); assert.match(html, /first 5 Profiles are free/); assert.match(html, /continue without buying a pack/); assert.match(html, /Create a Profile/); assert.match(html, /<details class="packDisclosure">/); assert.doesNotMatch(html, /Most popular|subscription plan|Stripe|Apple Pay/);
});
test("pack totals and unit prices are explicit with no unsupported popularity claim", () => {
  const html = renderBilling(ready({ snapshot: snapshot({ freeRemaining: 0, paidGranted: 0, paidConsumed: 0, paidRemaining: 0, paidAvailable: 0 }) }));
  assert.match(html, /one-time total · \$12 per Profile/); assert.match(html, /one-time total · \$5 per Profile/); assert.match(html, /one-time total · \$3.96 per Profile/); assert.match(html, /Suggested for collectors/); assert.match(html, /<details class="packDisclosure" open="">/);
});
test("disabled configuration has no active pack buttons", () => {
  const html = renderBilling(ready({ snapshot: snapshot({ enabled: false, methods: [] }) })); assert.match(html, /New payments aren’t open yet/); const buttons = html.match(/<button[^>]*aria-label="Choose[^>]*>/g); assert.equal(buttons.length, 3); assert.ok(buttons.every(button => button.includes("disabled")));
});
test("payment report never renders a success grant or personal receiving details", () => {
  const next = order({ status: "pending_review", recipient: { ...order().recipient, accountKey: "private-account-reference", address: "private-owner@example.com" } });
  const html = renderBilling(ready({ snapshot: snapshot({ directOrder: next, pendingOrder: next }) })); assert.match(html, /We’re checking your payment/); assert.match(html, /does not add credits/); assert.doesNotMatch(html, /credits have been recorded|private-owner|private-account-reference/);
});
test("actual payment page reveals only merchant name with provider button", () => {
  const next = order({ recipient: { ...order().recipient, address: "private-owner@example.com", accountKey: "private-account-reference" } }); const html = renderBilling(ready({ snapshot: snapshot({ directOrder: next, pendingOrder: next }) }));
  assert.match(html, /Open Venmo/); assert.match(html, /Confirm the recipient is <strong>QRguitar/); assert.match(html, /I sent the payment/); assert.doesNotMatch(html, /private-owner|private-account-reference|Copy.*recipient/);
});
test("PayPal shows one clear checkout path and copies required order reference first", () => {
  const methods = [{ key: "paypal", label: "Card or PayPal" }];
  const choices = renderBilling(ready({ snapshot: snapshot({ methods }) }), "", { actorId: A, offerKey: "profile_10" });
  assert.match(choices, /Continue to payment/); assert.match(choices, /Cards, Apple Pay, Venmo and PayPal; availability varies by device/);
  const next = order({ method: "paypal", recipient: { ...order().recipient, paymentUrl: "https://www.paypal.com/ncp/payment/EXAMPLE" } });
  const html = renderBilling(ready({ snapshot: snapshot({ methods, directOrder: next, pendingOrder: next }) }));
  assert.ok(html.indexOf('aria-label="Copy order reference"') < html.indexOf("Open secure checkout")); assert.match(html, /Paste this into the Order reference field/); assert.doesNotMatch(html, /Copy amount in usd|Amount in USD/);
});
test("legacy recovery route is status-only and cannot initiate or self-report a payment", () => {
  const next = order();
  const html = renderBilling(ready({ snapshot: snapshot({ directOrder: next, pendingOrder: next }) }), "", { actorId: "", offerKey: "" }, { existingOnly: true });
  assert.match(html, /Legacy payment recovery/); assert.match(html, /Contact QRguitar/); assert.match(html, /Don’t send another payment/);
  assert.doesNotMatch(html, /I sent the payment|Open Venmo|Copy order reference|Choose a one-time Profile pack/);
});
test("query flags alone never produce a payment success", () => {
  const html = renderBilling(ready(), "paid=true&success=true"); assert.doesNotMatch(html, /Payment confirmed|credits have been recorded/);
  const changing = renderBilling(ready({ snapshot: snapshot({ directOrder: order({ status: "fulfilled" }) }) }), `orderId=${ID2}`); assert.match(changing, /Loading your Profile balance/); assert.doesNotMatch(changing, /Payment confirmed/);
});
