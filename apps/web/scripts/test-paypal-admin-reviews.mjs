import { withUiTextTestContext } from "./ui-text-test-context.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), repo = path.resolve(web, "../.."), require = withUiTextTestContext(createRequire(path.join(repo, "package.json"))), ts = require("typescript"), modules = new Map();
function load(name) {
  if (modules.has(name)) return modules.get(name);
  const filename = path.join(web, "lib", name + ".ts"), js = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} }; modules.set(name, module.exports);
  new Function("require", "module", "exports", js)(id => id === "server-only" ? {} : id.startsWith("./") ? load(id.slice(2)) : require(id), module, module.exports);
  modules.set(name, module.exports); return module.exports;
}
const { createPayPalAdminReviewService } = load("paypal-admin-review-service"), { createPayPalAdminReviewHandlers } = load("paypal-admin-review-http");
const clientModule = load("paypal-admin-reviews-client"), { createPayPalAdminReviewsClient, initialPayPalAdminReviewsState } = clientModule;
const ADMIN = "11111111-1111-4111-8111-111111111111", OWNER = "22222222-2222-4222-8222-222222222222", ORDER = "33333333-3333-4333-8333-333333333333", DECISION = "44444444-4444-4444-8444-444444444444";
const review = (patch = {}) => ({ eventId: "paypal:review:WH-EXAMPLE:0", orderId: ORDER, ownerId: OWNER, reference: `QRG-${ORDER}`, holdReason: "refund", receiptKind: "refund",
  providerEventId: "WH-EXAMPLE", eventType: "PAYMENT.CAPTURE.REFUNDED", eventCursor: 0, resourceKind: "refund", resourceId: "REFUND-123", refundId: "REFUND-123", disputeId: null,
  paypalOrderId: "ORDER12345", captureId: "CAPTURE12345", caseId: "CASE-123", providerStatus: "COMPLETED", amount: 5000, currency: "USD", expectedAmount: 5000, expectedCurrency: "USD", credits: 10,
  createdAt: "2026-09-18T12:00:00.000Z", lastDecision: null, rawPayload: "must-not-leave-server", payerEmail: "private@example.test", ...patch });
const DELIVERY = "55555555-5555-4555-8555-555555555555";
const delivery = (patch = {}) => ({ deliveryId: DELIVERY, state: "retry", eventId: "WH-EXAMPLE", eventType: "PAYMENT.CAPTURE.REFUNDED", cursor: 0, totalItems: 1,
  attemptCount: 2, lastErrorCode: "provider_timeout", outcomeCode: null, rawAvailable: true, continuationAvailable: true, acknowledgedAt: null, nextAttemptAt: "2026-09-18T12:01:00.000Z", lockedUntil: null,
  receivedAt: "2026-09-18T12:00:00.000Z", updatedAt: "2026-09-18T12:00:30.000Z", rawBody: "must-not-leave-server", signatureHeaders: { secret: true }, ...patch });
const actors = { admin: { id: ADMIN, accountStatus: "active", role: "admin" }, owner: { id: OWNER, accountStatus: "active", role: "owner" }, locked: { id: ADMIN, accountStatus: "locked", role: "admin" } };
const calls = [];
const database = { async rpc(name, args) {
  calls.push([name, args]);
  if (name === "billing_paypal_list_reviews") return { data: { reviews: [review()], hasMore: false }, error: null };
  if (name === "billing_paypal_webhook_admin_list") return { data: [delivery()], error: null };
  if (name === "billing_paypal_webhook_admin_retry") return { data: { ...delivery({ state: "queued", attemptCount: 0, lastErrorCode: null }), advanceAllowed: true }, error: null };
  if (name === "billing_paypal_webhook_admin_acknowledge") return { data: delivery({ state: "quarantined", rawAvailable: undefined, continuationAvailable: undefined, acknowledgedAt: "2026-09-18T12:05:00.000Z" }), error: null };
  if (name === "billing_paypal_resolve_review") return { data: { eventId: args.p_event_id, orderId: args.p_order_id, ownerId: args.p_owner_id, decisionId: args.p_decision_id, action: args.p_action, hold: args.p_action !== "release" }, error: null };
  throw new Error("Unexpected RPC " + name);
} };
const service = createPayPalAdminReviewService({ environment: "test", database, authenticate: async context => actors[context] || null, advanceDelivery: async id => delivery({ deliveryId: id, state: "completed", cursor: 1, outcomeCode: "processed", lastErrorCode: null }) });
const rejects = (promise, code) => assert.rejects(promise, error => { assert.equal(error.code, code); return true; });

test("queue requires an active database administrator and returns only allowlisted evidence", async () => {
  await rejects(service.list("owner"), "admin_required"); await rejects(service.list("locked"), "admin_required");
  const value = await service.list("admin"); assert.equal(value.reviews.length, 1); assert.equal(value.reviews[0].providerEventId, "WH-EXAMPLE");
  assert.equal(value.deliveries.length, 1); assert.equal(value.deliveries[0].lastErrorCode, "provider_timeout");
  assert.equal(value.reviews[0].rawPayload, undefined); assert.equal(value.reviews[0].payerEmail, undefined); assert.doesNotMatch(JSON.stringify(value), /private@example|must-not-leave/);
  assert.deepEqual(calls.find(call => call[0] === "billing_paypal_list_reviews"), ["billing_paypal_list_reviews", { p_operator_id: ADMIN, p_environment: "test", p_order_id: null }]);
});

test("malformed provider evidence fails closed rather than reaching the browser", async () => {
  const broken = createPayPalAdminReviewService({ environment: "test", authenticate: async () => actors.admin, advanceDelivery: async () => delivery(), database: { rpc: async name => ({ data: name === "billing_paypal_list_reviews" ? { reviews: [review({ amount: -1 })], hasMore: false } : [], error: null }) } });
  await rejects(broken.list("admin"), "review_unavailable");
});

test("delivery retry is audited first and advances exactly one bounded item", async () => {
  calls.length = 0; const value = await service.decide("admin", { action: "retry_delivery", deliveryId: DELIVERY, decisionId: DECISION, reason: "Provider timeout cleared; retry this delivery." });
  assert.equal(value.delivery.state, "completed"); assert.equal(value.delivery.cursor, 1);
  assert.deepEqual(calls.map(call => call[0]), ["billing_paypal_webhook_admin_retry"]);
  await rejects(service.decide("admin", { action: "retry_delivery", deliveryId: "bad", decisionId: DECISION, reason: "Provider timeout cleared; retry this delivery." }), "invalid_review");
});

test("exact retry-action replay cannot consume the next webhook cursor", async () => {
  let cursor = 0, advances = 0, first = true;
  const fenced = createPayPalAdminReviewService({ environment: "test", authenticate: async () => actors.admin,
    database: { rpc: async name => {
      assert.equal(name, "billing_paypal_webhook_admin_retry");
      const advanceAllowed = first; first = false;
      return { data: { ...delivery({ state: "planned", cursor, totalItems: 2, lastErrorCode: null }), advanceAllowed }, error: null };
    } },
    advanceDelivery: async () => { advances++; cursor++; return delivery({ state: "planned", cursor, totalItems: 2, lastErrorCode: null }); }
  });
  const body = { action: "retry_delivery", deliveryId: DELIVERY, decisionId: DECISION, reason: "Continue the same reviewed event cursor." };
  assert.equal((await fenced.decide("admin", body)).delivery.cursor, 1);
  assert.equal((await fenced.decide("admin", body)).delivery.cursor, 1);
  assert.equal(advances, 1);
});

test("irrecoverable delivery acknowledgement is audited and never invokes processing", async () => {
  calls.length = 0; const value = await service.decide("admin", { action: "acknowledge_delivery", deliveryId: DELIVERY, decisionId: DECISION, reason: "Checked PayPal and ledger; no recoverable payload remains." });
  assert.equal(value.delivery.acknowledgedAt, "2026-09-18T12:05:00.000Z");
  assert.deepEqual(calls.map(call => call[0]), ["billing_paypal_webhook_admin_acknowledge"]);
});

test("review decisions call only the audited resolver and cannot create payments or credits", async () => {
  calls.length = 0; const body = { action: "release", eventId: review().eventId, orderId: ORDER, ownerId: OWNER, decisionId: DECISION, reason: "PayPal case closed in merchant dashboard." };
  const value = await service.decide("admin", body); assert.equal(value.decision.hold, false);
  assert.deepEqual(calls.map(call => call[0]), ["billing_paypal_resolve_review"]); assert.deepEqual(calls[0][1], { p_operator_id: ADMIN, p_environment: "test", p_event_id: body.eventId, p_order_id: ORDER, p_owner_id: OWNER, p_decision_id: DECISION, p_action: "release", p_reason: body.reason });
  for (const altered of [{ ...body, action: "grant" }, { ...body, credits: 100 }, { ...body, decisionId: "bad" }]) await rejects(service.decide("admin", altered), "invalid_review");
});

test("HTTP boundary rejects cross-origin, invalid queries, non-JSON and oversized decisions", async () => {
  const handlers = createPayPalAdminReviewHandlers({ service: () => service, bodyTimeoutMs: 30 });
  assert.equal((await handlers.list(new Request("https://www.qrguitar.com/api/admin/payment-reviews?eventId=x"))).status, 400);
  const post = (value, headers = {}) => new Request("https://www.qrguitar.com/api/admin/payment-reviews", { method: "POST", headers: { "content-type": "application/json", origin: "https://www.qrguitar.com", ...headers }, body: typeof value === "string" ? value : JSON.stringify(value) });
  assert.equal((await handlers.decide(post({}, { origin: "https://evil.invalid" }))).status, 403);
  assert.equal((await handlers.decide(new Request("https://www.qrguitar.com/api/admin/payment-reviews", { method: "POST", headers: { "content-type": "text/plain" }, body: "{}" }))).status, 415);
  assert.equal((await handlers.decide(post({ reason: "x".repeat(5000) }))).status, 413);
});

const session = id => id ? { access_token: `token-${id}`, user: { id } } : null;
const until = async predicate => { for (let i = 0; i < 300; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 1)); } assert.ok(predicate(), "condition did not settle"); };

test("older retained hold beyond 100 is retrieved by a validated GET without any financial operation", async t => {
  const older = "66666666-6666-4666-8666-666666666666", calls = [];
  const retained = { action: "retain_hold", reason: "Provider dispute remains unresolved.", createdAt: "2026-09-29T12:00:00Z" };
  const auth = { getSession: async () => ({ data: { session: session(ADMIN) } }), onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; } };
  const client = createPayPalAdminReviewsClient({ auth: () => auth, storage: () => ({ getItem: () => null, setItem() {}, removeItem() {} }),
    fetch: async (url, init) => {
      calls.push([url, init.method]); assert.equal(init.method, "GET", "lookup must not decide or advance anything");
      return Response.json({ ok: true, environment: "test", deliveries: [], hasMore: !String(url).includes("?"),
        reviews: String(url).includes("?") ? [review({ orderId: older, reference: "QRG-"+older, lastDecision: retained })]
          : Array.from({ length: 100 }, (_, i) => review({ eventId: "retained:hold:"+i, lastDecision: retained })) });
    } });
  t.after(() => client.dispose()); await client.start(); await until(() => client.getState().phase === "ready");
  assert.equal(client.getState().reviews.length, 100); assert.equal(client.getState().hasMore, true);
  await client.findOrder("QRG-"+older); assert.equal(client.getState().reviews[0].orderId, older); assert.equal(client.getState().orderId, older);
  assert.equal(calls.at(-1)[0], "/api/admin/payment-reviews?orderId="+older);
  const before = calls.length; await client.findOrder("not-an-order"); assert.equal(calls.length, before); assert.match(client.getState().message, /full QRG order reference/);
  await client.showAll(); assert.equal(client.getState().orderId, ""); assert.equal(client.getState().reviews.length, 100);
});
test("late order lookup cannot expose the previous actor's holds or lookup scope", async t => {
  let actor = ADMIN, observe, resolve; const pending = new Promise(r => { resolve = r; });
  const auth = { getSession: async () => ({ data: { session: session(actor) } }), onAuthStateChange(fn) { observe = fn; return { data: { subscription: { unsubscribe() {} } } }; } };
  const client = createPayPalAdminReviewsClient({ auth: () => auth, storage: () => ({ getItem: () => null, setItem() {}, removeItem() {} }),
    fetch: async (url) => String(url).includes("?") ? pending : Response.json({ ok: true, environment: "test", reviews: [], deliveries: [], hasMore: false }) });
  t.after(() => client.dispose()); await client.start(); await until(() => client.getState().phase === "ready");
  const lookup = client.findOrder(ORDER); actor = OWNER; observe("SIGNED_IN", session(actor)); await until(() => client.getState().actorId === OWNER && client.getState().phase === "ready");
  resolve(Response.json({ ok: true, environment: "test", reviews: [review()], deliveries: [], hasMore: false })); await lookup;
  assert.equal(client.getState().orderId, ""); assert.deepEqual(client.getState().reviews, []);
});
test("order lookup rejects a mismatched successful server result instead of showing another order", async t => {
  const auth = { getSession: async () => ({ data: { session: session(ADMIN) } }), onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; } };
  const client = createPayPalAdminReviewsClient({ auth: () => auth, storage: () => ({ getItem: () => null, setItem() {}, removeItem() {} }),
    fetch: async () => Response.json({ ok: true, environment: "test", reviews: [review()], deliveries: [], hasMore: false }) });
  t.after(() => client.dispose()); await client.start(); await until(() => client.getState().phase === "ready");
  await client.findOrder("66666666-6666-4666-8666-666666666666"); assert.equal(client.getState().phase, "error"); assert.deepEqual(client.getState().reviews, []);
});
test("client preserves an uncertain decision identity and retries it exactly", async t => {
  let current = session(ADMIN), callback, lose = true; const stored = new Map(), posts = [];
  const auth = { getSession: async () => ({ data: { session: current } }), onAuthStateChange(fn) { callback = fn; return { data: { subscription: { unsubscribe() {} } } }; } };
  const client = createPayPalAdminReviewsClient({ auth: () => auth, timeoutMs: 100, randomUUID: () => DECISION,
    storage: () => ({ getItem: key => stored.get(key) || null, setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key) }),
    fetch: async (url, init) => {
      if (init.method === "GET") return Response.json({ ok: true, environment: "test", reviews: [review()], deliveries: [delivery()], hasMore: false });
      posts.push(init.body); if (lose) { lose = false; throw new Error("lost reply"); }
      const body = JSON.parse(init.body); return Response.json({ ok: true, decision: { ...body, hold: false } });
    } });
  t.after(() => client.dispose()); await client.start(); await until(() => client.getState().phase === "ready");
  const input = { action: "release", eventId: review().eventId, orderId: ORDER, ownerId: OWNER, reason: "Verified PayPal case is closed." };
  assert.equal(await client.decide(input), false); assert.equal(client.getState().pendingDecision.decisionId, DECISION);
  assert.equal(await client.retryDecision(), true); assert.equal(posts.length, 2); assert.equal(posts[0], posts[1]); assert.equal(stored.size, 0);
  void callback; void current;
});

test("client sends one eligible delivery retry with an immutable audit identity", async t => {
  const stored = new Map(), posts = [], auth = { getSession: async () => ({ data: { session: session(ADMIN) } }), onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; } };
  const client = createPayPalAdminReviewsClient({ auth: () => auth, randomUUID: () => DECISION,
    storage: () => ({ getItem: key => stored.get(key) || null, setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key) }),
    fetch: async (_url, init) => {
      if (init.method === "GET") return Response.json({ ok: true, environment: "test", reviews: [], deliveries: [delivery({ state: "planned", cursor: 1, totalItems: 2, lastErrorCode: null, rawAvailable: false, continuationAvailable: true })], hasMore: false });
      const body = JSON.parse(init.body); posts.push(body); return Response.json({ ok: true, delivery: delivery({ state: "completed", cursor: 1, outcomeCode: "processed", lastErrorCode: null, rawAvailable: null, continuationAvailable: null }), decisionId: body.decisionId });
    } });
  t.after(() => client.dispose()); await client.start(); await until(() => client.getState().phase === "ready");
  assert.equal(await client.retryDelivery({ deliveryId: DELIVERY, reason: "Provider timeout cleared; retry now." }), true);
  assert.deepEqual(posts, [{ action: "retry_delivery", deliveryId: DELIVERY, reason: "Provider timeout cleared; retry now.", decisionId: DECISION }]); assert.equal(stored.size, 0);
});

test("client acknowledges only a quarantined delivery whose recovery payload expired", async t => {
  const posts = [], auth = { getSession: async () => ({ data: { session: session(ADMIN) } }), onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; } };
  const client = createPayPalAdminReviewsClient({ auth: () => auth, randomUUID: () => DECISION, storage: () => ({ getItem: () => null, setItem() {}, removeItem() {} }),
    fetch: async (_url, init) => {
      if (init.method === "GET") return Response.json({ ok: true, environment: "test", reviews: [], deliveries: [delivery({ state: "quarantined", rawAvailable: false, continuationAvailable: false })], hasMore: false });
      const body = JSON.parse(init.body); posts.push(body); return Response.json({ ok: true, delivery: delivery({ state: "quarantined", rawAvailable: null, continuationAvailable: null, acknowledgedAt: "2026-09-18T12:05:00.000Z" }), decisionId: body.decisionId });
    } });
  t.after(() => client.dispose()); await client.start(); await until(() => client.getState().phase === "ready");
  assert.equal(await client.acknowledgeDelivery({ deliveryId: DELIVERY, reason: "Checked PayPal and ledger; payload expired." }), true);
  assert.deepEqual(posts[0], { action: "acknowledge_delivery", deliveryId: DELIVERY, reason: "Checked PayPal and ledger; payload expired.", decisionId: DECISION });
});

test("admin UI exposes only retain/release controls and never renders raw provider payload", () => {
  const React = require("react"), { renderToStaticMarkup } = require("react-dom/server"), component = { exports: {} }; let stateIndex = 0;
  const ready = { ...initialPayPalAdminReviewsState(), phase: "ready", actorId: ADMIN, environment: "live", reviews: [review()], deliveries: [delivery()], hasMore: false };
  const compiled = ts.transpileModule(fs.readFileSync(path.join(web, "app/admin/payments/PayPalReviewQueue.tsx"), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function("require", "module", "exports", compiled)(specifier => {
    if (specifier === "react") return { ...React, useEffect() {}, useRef: () => ({ current: null }), useState(initial) { const index = stateIndex++; const values = [ready, { actorId: ADMIN, eventId: review().eventId }, { actorId: ADMIN, deliveryId: DELIVERY }, "", "Reviewed delivery retry", true, "retain_hold", "Reviewed provider evidence", true]; return [values[index] ?? (typeof initial === "function" ? initial() : initial), () => {}]; } };
    if (specifier.endsWith("supabase-browser")) return { createBrowserSupabaseClient() { throw new Error("no browser auth during static render"); } };
    if (specifier.endsWith("paypal-admin-reviews-client")) return clientModule;
    if (specifier.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) };
    return require(specifier);
  }, component, component.exports);
  const html = renderToStaticMarkup(React.createElement(component.exports.default));
  assert.match(html, /Keep paid credits on hold/); assert.match(html, /Release this hold/); assert.match(html, /PAYMENT\.CAPTURE\.REFUNDED/);
  assert.match(html, /Continue one delivery step/); assert.match(html, /provider_timeout/);
  assert.doesNotMatch(html, /must-not-leave|private@example|Add credits|Issue refund|Verify received payment/);
});
