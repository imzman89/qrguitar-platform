import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), runtime = args.includes("--runtime") ? args[args.indexOf("--runtime") + 1] : process.env.QRGUITAR_SOURCE_ROOT || process.cwd();
const require = createRequire(path.join(runtime, "package.json")), ts = require("typescript");
const source = fs.readFileSync(path.join(here, "../lib/billing-service.ts"), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const module = { exports: {} };
new Function("require", "module", "exports", js)(name => name === "server-only" ? {} : require(name), module, module.exports);
const { createBillingService, readBillingConfig, BillingError, publicBillingError, CREATE_RETRY_WINDOW_MS, APPROVED_OFFERS, BILLING_ORIGIN } = module.exports;
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const OWNER = uuid(1), OTHER = uuid(2), REQUEST = uuid(10);
const clone = value => structuredClone(value);
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const fail = code => { const error = new Error("Synthetic private diagnostic"); error.code = code; throw error; };
async function rejectsCode(promise, code) { await assert.rejects(promise, error => { assert.equal(error.code, code); return true; }); }

function fixture(options = {}) {
  const f = { now: Date.parse("2026-09-18T12:00:00Z"), actor: { id: OWNER, accountStatus: "active" }, trace: [], orders: new Map(), mappings: new Map(), receipts: new Map(), grants: new Map(), holds: new Set(), customers: new Map(), sessions: new Map(), lines: new Map(), payments: new Map(), charges: new Map(), refunds: new Map(), disputes: new Map(), customerKeys: new Map(), sessionKeys: new Map(), rawCalls: [], recoveryComplete: true, sequence: 100, ...options };
  f.config = { enabled: true, environment: "test", secretKey: "sk_test_synthetic_not_a_real_key", webhookSecret: "whsec_synthetic_not_a_real_secret", webhookApiVersion: "fixture.version", testAppUrl: "https://billing-fixture.example", prices: { profile_1: "price_one", profile_10: "price_ten", profile_25: "price_twentyfive" }, ...options.config };
  f.prices = new Map(Object.entries(APPROVED_OFFERS).map(([key, offer]) => [f.config.prices?.[key], { id: f.config.prices?.[key], active: true, livemode: f.config.environment === "live", type: "one_time", currency: "usd", unit_amount: offer.amount, billing_scheme: "per_unit", recurring: null, custom_unit_amount: null, transform_quantity: null }]));
  const current = args => { const order = f.orders.get(args.p_order_id); if (!order || order.ownerId !== args.p_owner_id || order.environment !== args.p_environment) fail("P0002"); return order; };
  const mappingKey = (owner, env) => `${env}:${owner}`;
  const receipt = (order, value) => { const key = order.environment + ":" + value.eventId; const before = f.receipts.get(key); if (before && JSON.stringify(before) !== JSON.stringify(value)) fail("PT409"); f.receipts.set(key, clone(value)); };
  const bind = (order, value) => {
    assert.equal(value.customerId, f.mappings.get(mappingKey(order.ownerId, order.environment)));
    assert.ok(!order.sessionId || order.sessionId === value.sessionId); assert.ok(!order.paymentId || order.paymentId === value.paymentId);
    order.customerId = value.customerId; order.sessionId = value.sessionId; if (value.paymentId) order.paymentId = value.paymentId;
  };
  const database = { async rpc(name, args) {
    f.trace.push({ kind: "db", name, args: clone(args) });
    if (f.rpcBefore) { const result = await f.rpcBefore(name, args); if (result !== undefined) return result; }
    let data;
    try {
      const scope = mappingKey(args.p_owner_id, args.p_environment);
      if (name === "billing_reserve_order") {
        let order = [...f.orders.values()].find(item => item.ownerId === args.p_owner_id && item.environment === args.p_environment && item.requestKey === args.p_request_key);
        if (order) { if (JSON.stringify(order.offer) !== JSON.stringify(args.p_offer)) fail("PT409"); }
        else {
          if (f.holds.has(scope) || [...f.orders.values()].some(item => item.ownerId === args.p_owner_id && item.environment === args.p_environment && ["reserved", "open"].includes(item.status))) fail("PT409");
          order = { orderId: uuid(f.sequence++), ownerId: args.p_owner_id, environment: args.p_environment, requestKey: args.p_request_key, offer: clone(args.p_offer), status: "reserved", customerId: null, sessionId: null, paymentId: null, lastError: null, createdAt: new Date(f.now).toISOString(), updatedAt: new Date(f.now).toISOString() }; f.orders.set(order.orderId, order);
        }
        data = order;
      } else if (name === "billing_get_customer") data = { customerId: f.mappings.get(scope) || null };
      else if (name === "billing_link_customer") { if (f.mappings.has(scope) && f.mappings.get(scope) !== args.p_customer_id) fail("PT409"); f.mappings.set(scope, args.p_customer_id); data = { customerId: args.p_customer_id }; }
      else if (name === "billing_get_order") data = current(args);
      else if (name === "billing_catalog") data = { environment: args.p_environment, createEnvironment: f.createEnvironment || "test", offers: f.registeredOffers || Object.entries(APPROVED_OFFERS).map(([key, spec]) => ({ key, version: 1, currency: "usd", ...spec, priceId: f.config.prices[key] })).filter(value => value.priceId) };
      else if (name === "billing_account_status") {
        const granted = [...f.grants.values()].filter(item => item.ownerId === args.p_owner_id && item.environment === args.p_environment).reduce((sum, item) => sum + item.credits, 0);
        data = { environment: args.p_environment, createEnvironment: f.createEnvironment || "test", freeLimit: 5, ownedProfiles: 0, commercialExempt: false, freeRemaining: 5, paidGranted: granted, paidConsumed: 0, paidRemaining: granted, paidAvailable: f.holds.has(scope) ? 0 : granted, hold: f.holds.has(scope),
          unresolvedOrder: [...f.orders.values()].find(item => item.ownerId === args.p_owner_id && item.environment === args.p_environment && ["reserved", "open"].includes(item.status)) || null };
      } else if (name === "billing_link_checkout") { const order = current(args); bind(order, { sessionId: args.p_session_id, customerId: args.p_customer_id }); if (order.status === "reserved") order.status = "open"; data = order; }
      else if (name === "billing_mark_order_error") { const order = current(args); receipt(order, { eventId: args.p_receipt_id, code: args.p_code }); order.lastError = args.p_code; data = order; }
      else if (name === "billing_record_review") { const order = current(args); bind(order, args.p_receipt); receipt(order, args.p_receipt); f.holds.add(scope); if (order.status === "reserved") order.status = "open"; data = { ...order, hold: true }; }
      else if (name === "billing_record_checkout_expired") { const order = current(args); bind(order, args.p_receipt); receipt(order, args.p_receipt); if (order.status !== "fulfilled") order.status = "expired"; data = order; }
      else if (name === "billing_fulfill_order") {
        const order = current(args); bind(order, args.p_receipt); receipt(order, args.p_receipt);
        assert.equal(args.p_receipt.amount, order.offer.amount); assert.equal(args.p_receipt.credits, order.offer.credits); assert.equal(args.p_receipt.quantity, 1);
        const exists = f.grants.has(order.orderId); if (!exists) f.grants.set(order.orderId, { ownerId: order.ownerId, environment: order.environment, credits: order.offer.credits });
        if (order.status === "expired") f.holds.add(scope); order.status = "fulfilled"; data = { ...order, granted: !exists, alreadyGranted: exists, hold: f.holds.has(scope) };
      } else throw new Error("Unknown RPC " + name);
    } catch (error) { if (error.code) return { data: null, error: { code: error.code } }; throw error; }
    if (f.rpcAfter) { const result = await f.rpcAfter(name, args, data); if (result !== undefined) return result; }
    return { data: clone(data), error: null };
  } };
  const provider = (name, run) => async (...args) => { f.trace.push({ kind: "stripe", name, args: clone(args) }); if (f.providerBefore) { const value = await f.providerBefore(name, args); if (value !== undefined) return value; } return run(...args); };
  const stripe = {
    retrievePrice: provider("retrievePrice", key => clone(f.prices.get(key))),
    createCustomer: provider("createCustomer", (params, opts) => {
      assert.ok(f.orders.size, "durable order precedes provider creation");
      let value = f.customerKeys.get(opts.idempotencyKey); if (value) assert.deepEqual(value.params, params);
      else { const customer = { id: "cus_" + f.sequence++, livemode: f.config.environment === "live", metadata: clone(params.metadata) }; f.customers.set(customer.id, customer); value = { params: clone(params), customer }; f.customerKeys.set(opts.idempotencyKey, value); }
      if (f.customerAfterCreate) f.customerAfterCreate(); return clone(value.customer);
    }),
    retrieveCustomer: provider("retrieveCustomer", key => clone(f.customers.get(key))),
    findCustomers: provider("findCustomers", expected => ({ complete: f.recoveryComplete, data: [...f.customers.values()].filter(item => Object.entries(expected).every(([key, value]) => item.metadata[key] === value)).map(clone) })),
    createSession: provider("createSession", (params, opts) => {
      assert.ok([...f.mappings.values()].includes(params.customer), "customer mapping commits before Checkout creation");
      let value = f.sessionKeys.get(opts.idempotencyKey); if (value) assert.deepEqual(value.params, params);
      else {
        const price = f.prices.get(params.line_items[0].price), session = { id: "cs_test_" + f.sequence++, livemode: f.config.environment === "live", mode: params.mode, customer: params.customer, client_reference_id: params.client_reference_id, metadata: clone(params.metadata), status: "open", payment_status: "unpaid", payment_intent: null, currency: "usd", amount_total: price.unit_amount, amount_subtotal: price.unit_amount, total_details: { amount_discount: 0, amount_shipping: 0, amount_tax: 0 }, subscription: null, url: "https://checkout.stripe.com/c/pay/synthetic" };
        f.sessions.set(session.id, session); f.lines.set(session.id, { has_more: false, data: [{ quantity: 1, price: clone(price), currency: "usd", amount_subtotal: price.unit_amount, amount_total: price.unit_amount, amount_discount: 0, amount_tax: 0 }] });
        value = { params: clone(params), session }; f.sessionKeys.set(opts.idempotencyKey, value);
      }
      if (f.sessionAfterCreate) f.sessionAfterCreate(); return clone(value.session);
    }),
    retrieveSession: provider("retrieveSession", key => clone(f.sessions.get(key))),
    listLineItems: provider("listLineItems", key => clone(f.lines.get(key))),
    findSessions: provider("findSessions", query => ({ complete: f.recoveryComplete, data: [...f.sessions.values()].filter(item => item.customer === query.customerId && item.metadata.qrguitar_order_id === query.orderId && item.metadata.qrguitar_owner_id === query.ownerId && item.metadata.qrguitar_environment === query.environment).map(clone) })),
    retrievePayment: provider("retrievePayment", key => clone(f.payments.get(key))), retrieveCharge: provider("retrieveCharge", key => clone(f.charges.get(key))),
    retrieveRefund: provider("retrieveRefund", key => clone(f.refunds.get(key))), retrieveDispute: provider("retrieveDispute", key => clone(f.disputes.get(key))),
    constructEvent(raw, signature, secret) { f.rawCalls.push({ raw, signature, secret }); if (signature !== "fixture_signature" || secret !== f.config.webhookSecret) throw new Error("Sensitive signature diagnostic"); return JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw)); }
  };
  f.deps = { config: f.config, stripe, database, authenticate: async () => f.actor, now: () => f.now, timeoutMs: options.timeoutMs || 500, diagnosticId: () => uuid(f.sequence++) };
  f.service = createBillingService(f.deps);
  f.start = (extra = {}) => f.service.checkout("opaque-authenticated-request", { offerKey: "profile_1", requestId: REQUEST, ...extra });
  f.order = () => [...f.orders.values()][0]; f.session = () => [...f.sessions.values()][0];
  f.calls = name => f.trace.filter(call => call.name === name);
  f.paid = () => {
    const session = f.session(); session.status = "complete"; session.payment_status = "paid"; session.payment_intent = "pi_paid";
    const payment = { id: "pi_paid", livemode: f.config.environment === "live", customer: session.customer, metadata: clone(session.metadata), status: "succeeded", amount: session.amount_total, amount_received: session.amount_total, currency: "usd", latest_charge: "ch_paid" };
    f.payments.set(payment.id, payment); f.charges.set("ch_paid", { id: "ch_paid", livemode: f.config.environment === "live", customer: session.customer, payment_intent: payment.id, status: "succeeded", paid: true, captured: true, amount: payment.amount, amount_captured: payment.amount, currency: "usd", amount_refunded: 0, disputed: false }); return payment;
  };
  f.event = (type = "checkout.session.completed", objectId = f.session()?.id, eventId = "evt_" + f.sequence++, extra = {}) => ({ id: eventId, type, livemode: f.config.environment === "live", api_version: f.config.webhookApiVersion, data: { object: { id: objectId } }, ...extra });
  f.send = (event = f.event()) => f.service.webhook(JSON.stringify(event), "fixture_signature");
  return f;
}

test("configuration is disabled by default and secrets are never public offer fields", async () => {
  assert.equal(readBillingConfig({}).enabled, false); assert.equal(readBillingConfig({ QRGUITAR_BILLING_ENABLED: "TRUE" }).enabled, false);
  const f = fixture(); const offers = await f.service.offers(); assert.deepEqual(offers.map(item => [item.key, item.amount, item.credits]), [["profile_1", 1200, 1], ["profile_10", 5000, 10], ["profile_25", 9900, 25]]);
  assert.ok(offers.every(item => item.permanent && item.freeAllowance === 5)); assert.doesNotMatch(JSON.stringify(offers), /price_|sk_|whsec_|customer/);
});
for (const patch of [{ enabled: false }, { secretKey: undefined }, { webhookSecret: undefined }, { webhookApiVersion: undefined }, { environment: undefined }, { secretKey: "sk_live_wrong_environment" }]) test("incomplete/disabled config never offers or creates payment: " + JSON.stringify(patch), async () => {
  const f = fixture({ config: patch }); assert.deepEqual(await f.service.offers(), []); await rejectsCode(f.start(), "billing_disabled"); assert.equal(f.trace.length, 0);
});
test("an unconfigured offer is never exposed or reserved", async () => {
  const f = fixture({ config: { prices: { profile_1: "price_one" } } }); assert.deepEqual((await f.service.offers()).map(item => item.key), ["profile_1"]);
  await rejectsCode(f.start({ offerKey: "profile_10" }), "offer_unavailable"); assert.equal(f.orders.size, 0);
});
for (const patch of [{ active: false }, { livemode: true }, { type: "recurring" }, { recurring: { interval: "month" } }, { currency: "eur" }, { unit_amount: 1199 }, { unit_amount: null }, { billing_scheme: "tiered" }, { custom_unit_amount: { enabled: true } }, { transform_quantity: { divide_by: 10 } }, { id: "price_wrong" }]) test("configured Price mismatch prevents offers and Checkout creation: " + JSON.stringify(patch), async () => {
  const f = fixture(); Object.assign(f.prices.get("price_one"), patch); assert.ok(!(await f.service.offers()).some(item => item.key === "profile_1"));
  await rejectsCode(f.start(), "checkout_unconfirmed"); assert.equal(f.calls("createCustomer").length, 0); assert.equal(f.calls("createSession").length, 0); assert.equal(f.grants.size, 0);
});
for (const actor of [null, { id: "not-an-authenticated-uuid", accountStatus: "active" }, { id: OWNER, accountStatus: "locked" }]) test("checkout requires a signed-in active owner: " + JSON.stringify(actor), async () => {
  const f = fixture({ actor }); await assert.rejects(f.start(), error => error.status === (actor?.accountStatus === "locked" ? 403 : 401)); assert.equal(f.trace.length, 0);
});
for (const extra of [{ amount: 1 }, { credits: 1000 }, { currency: "eur" }, { ownerId: OTHER }, { customerId: "cus_victim" }, { priceId: "price_cheap" }, { success_url: "https://attacker.example" }, { cancel_url: "https://attacker.example" }, { quantity: 10 }, { offerKey: "__proto__" }, { offerKey: "monthly" }, { requestId: "bad" }]) test("client-controlled billing fields are rejected before storage/provider writes: " + JSON.stringify(extra), async () => {
  const f = fixture(); await rejectsCode(f.start(extra), "invalid_purchase"); assert.equal(f.trace.length, 0);
});
test("durable order and customer mapping precede Checkout with fixed server parameters", async () => {
  const f = fixture(); const result = await f.start(); assert.equal(result.status, "checkout"); assert.match(result.url, /^https:\/\/checkout\.stripe\.com\//);
  const names = f.trace.map(call => call.name); assert.ok(names.indexOf("billing_reserve_order") < names.indexOf("createCustomer")); assert.ok(names.indexOf("billing_link_customer") < names.indexOf("createSession"));
  const [params, opts] = f.calls("createSession")[0].args;
  assert.deepEqual(params.line_items, [{ price: "price_one", quantity: 1 }]); assert.equal(params.mode, "payment"); assert.equal(params.allow_promotion_codes, false);
  assert.equal(params.automatic_tax.enabled, false); assert.equal(params.adaptive_pricing.enabled, false); assert.equal(params.after_expiration.recovery.enabled, false);
  assert.equal(params.success_url, `${f.config.testAppUrl}/billing/return?orderId=${result.orderId}`); assert.equal(params.cancel_url, `${f.config.testAppUrl}/billing/cancel?orderId=${result.orderId}`);
  assert.deepEqual(params.metadata, params.payment_intent_data.metadata); assert.equal(params.client_reference_id, result.orderId); assert.match(opts.idempotencyKey, /^qrguitar:checkout:v1:[a-f0-9]{64}$/);
  assert.equal(Object.hasOwn(params, "customer_email"), false); assert.equal(f.grants.size, 0);
});
test("same request replays its order; a new pending request or changed offer cannot create another purchase", async () => {
  const f = fixture(); const first = await f.start(); assert.equal((await f.start()).orderId, first.orderId); assert.equal(f.calls("createSession").length, 1);
  await rejectsCode(f.start({ requestId: uuid(11) }), "billing_conflict"); await rejectsCode(f.start({ offerKey: "profile_10" }), "billing_conflict"); assert.equal(f.orders.size, 1); assert.equal(f.sessions.size, 1);
});
for (const stage of ["customer", "session"]) test("lost " + stage + " create response retries the same identity and exact parameters", async () => {
  const f = fixture(); f[stage + "AfterCreate"] = () => { f[stage + "AfterCreate"] = null; throw new Error("Lost response after creation"); };
  await rejectsCode(f.start(), "checkout_unconfirmed"); assert.equal(f.orders.size, 1); await f.start();
  const calls = f.calls(stage === "customer" ? "createCustomer" : "createSession"); assert.equal(calls.length, 2); assert.deepEqual(calls[0].args, calls[1].args);
  assert.equal(f.customers.size, 1); assert.equal(f.sessions.size, 1); assert.equal(f.grants.size, 0);
});
test("failed order commit makes no provider request", async () => {
  const f = fixture(); f.rpcBefore = name => name === "billing_reserve_order" ? { data: null, error: { code: "XX000" } } : undefined;
  await rejectsCode(f.start(), "billing_unavailable"); assert.equal(f.trace.filter(call => call.kind === "stripe").length, 0);
});
test("failed customer mapping commit prevents session creation and safely retries", async () => {
  const f = fixture(); f.rpcBefore = name => name === "billing_link_customer" ? { data: null, error: { code: "XX000" } } : undefined;
  await rejectsCode(f.start(), "checkout_unconfirmed"); assert.equal(f.calls("createSession").length, 0); f.rpcBefore = undefined; await f.start(); assert.equal(f.customers.size, 1); assert.equal(f.sessions.size, 1);
});
test("failed session-link commit recovers the same canonical Session", async () => {
  const f = fixture(); f.rpcBefore = name => name === "billing_link_checkout" ? { data: null, error: { code: "XX000" } } : undefined;
  await rejectsCode(f.start(), "checkout_unconfirmed"); assert.equal(f.order().sessionId, null); f.rpcBefore = undefined; await f.start(); assert.equal(f.sessions.size, 1); assert.equal(f.order().sessionId, f.session().id);
});
test("unknown attempt older than 24h only reconciles existing objects and never recreates", async () => {
  const f = fixture(); f.sessionAfterCreate = () => { throw new Error("Lost create response"); }; await rejectsCode(f.start(), "checkout_unconfirmed");
  f.sessionAfterCreate = null; f.now += 25 * 60 * 60 * 1000; const before = f.calls("createSession").length; const result = await f.start();
  assert.equal(result.status, "checkout"); assert.equal(f.calls("createSession").length, before); assert.equal(f.calls("findSessions").length, 1); assert.equal(f.sessions.size, 1);
});
test("older unknown customer creation is reconciled but missing Checkout never gets recreated", async () => {
  const f = fixture(); f.customerAfterCreate = () => { throw new Error("Lost customer response"); }; await rejectsCode(f.start(), "checkout_unconfirmed"); f.now += CREATE_RETRY_WINDOW_MS;
  await rejectsCode(f.start(), "reconciliation_required"); assert.equal(f.calls("createCustomer").length, 1); assert.equal(f.calls("createSession").length, 0); assert.equal(f.calls("findCustomers").length, 1); assert.equal(f.order().status, "reserved");
});
test("no or incomplete older recovery result keeps the order unresolved without releasing it", async () => {
  for (const incomplete of [false, true]) { const f = fixture(); f.providerBefore = name => name === "createSession" ? Promise.reject(new Error("Unknown transport")) : undefined;
    await rejectsCode(f.start(), "checkout_unconfirmed"); f.providerBefore = undefined; f.now += 25 * 60 * 60 * 1000; f.recoveryComplete = !incomplete;
    await rejectsCode(f.start(), "reconciliation_required"); assert.equal(f.calls("createSession").length, 1); assert.equal(f.order().status, "reserved"); await rejectsCode(f.start({ requestId: uuid(11) }), "billing_conflict"); }
});
test("global hold blocks resuming an earlier request as well as new purchases", async () => {
  const f = fixture(); await f.start(); f.holds.add("test:" + OWNER); const before = f.trace.filter(call => call.kind === "stripe").length;
  await rejectsCode(f.start(), "billing_review_required"); await rejectsCode(f.start({ requestId: uuid(11) }), "billing_conflict"); assert.equal(f.trace.filter(call => call.kind === "stripe").length, before);
});
test("returned Checkout URLs must be HTTPS on the exact Stripe host", async () => {
  for (const url of ["javascript:alert(1)", "https://checkout.stripe.com.attacker.test", "https://user@checkout.stripe.com/pay", "http://checkout.stripe.com/pay"]) { const f = fixture(); await f.start(); f.session().url = url; await rejectsCode(f.start(), "checkout_unconfirmed"); }
});
test("status is owner-bound and browser returns cannot grant or expire anything", async () => {
  const f = fixture(); const { orderId } = await f.start(), before = f.trace.filter(call => call.kind === "stripe").length;
  const status = await f.service.status("request", orderId); assert.equal(status.order.status, "open"); assert.equal(status.paidAvailable, 0); assert.equal(f.grants.size, 0);
  assert.equal(f.trace.filter(call => call.kind === "stripe").length, before); assert.doesNotMatch(JSON.stringify(status), /cus_|cs_test_|pi_|requestKey|ownerId/);
  f.actor = { id: OTHER, accountStatus: "active" }; await rejectsCode(f.service.status("request", orderId), "order_not_found"); f.actor = null; await rejectsCode(f.service.status("request", orderId), "sign_in_required");
});
test("raw webhook bytes and signature go unchanged to the official-SDK boundary", async () => {
  const f = fixture(); const raw = new TextEncoder().encode(' { "id": "evt_other", "type": "unrelated.event", "livemode": false, "api_version": "fixture.version", "data": {"object":{"id":"thing"}} }\n');
  assert.equal((await f.service.webhook(raw, "fixture_signature")).status, "ignored"); assert.equal(f.rawCalls[0].raw, raw); assert.equal(f.rawCalls[0].signature, "fixture_signature"); assert.equal(f.rawCalls[0].secret, f.config.webhookSecret);
  await rejectsCode(f.service.webhook(raw, "forged_signature"), "invalid_signature"); await rejectsCode(f.service.webhook(raw, null), "invalid_signature"); assert.equal(f.trace.length, 0);
  assert.doesNotMatch(JSON.stringify(publicBillingError(new Error("sk_secret internal details"))), /sk_secret|internal details/);
});
for (const patch of [{ livemode: true }, { api_version: "wrong.version" }, { account: "acct_connected" }]) test("wrong webhook environment/version/account is not acknowledged as fulfilled: " + JSON.stringify(patch), async () => {
  const f = fixture(); await rejectsCode(f.send(f.event("unrelated", "thing", "evt_bad", patch)), "event_configuration_mismatch"); assert.equal(f.trace.length, 0);
});
test("unpaid completion grants zero; delayed success grants only after fresh provider confirmation", async () => {
  const f = fixture(); await f.start(); f.session().status = "complete";
  assert.equal((await f.send()).status, "processing"); assert.equal(f.grants.size, 0); assert.equal(f.calls("billing_fulfill_order").length, 0);
  f.paid(); assert.equal((await f.send(f.event("checkout.session.async_payment_succeeded"))).status, "fulfilled"); assert.equal((await f.service.status("request")).paidAvailable, 1);
});
test("completed paid Session requires matching successful PaymentIntent and captured Charge", async () => {
  for (const [target, patch] of [["payment", { status: "processing" }], ["payment", { amount_received: 1 }], ["payment", { customer: "cus_foreign" }], ["payment", { livemode: true }], ["charge", { paid: false }], ["charge", { captured: false }], ["charge", { amount_captured: 1 }], ["charge", { payment_intent: "pi_foreign" }]]) {
    const f = fixture(); await f.start(); f.paid(); Object.assign(target === "payment" ? f.payments.get("pi_paid") : f.charges.get("ch_paid"), patch);
    await assert.rejects(f.send()); assert.equal(f.calls("billing_fulfill_order").length, 0); assert.equal(f.grants.size, 0);
  }
});
for (const [label, mutate] of [
  ["wrong customer", f => { f.session().customer = "cus_foreign"; }], ["wrong reference", f => { f.session().client_reference_id = uuid(900); }],
  ["wrong metadata owner", f => { f.session().metadata.qrguitar_owner_id = OTHER; }], ["wrong mode", f => { f.session().mode = "subscription"; }],
  ["wrong environment", f => { f.session().livemode = true; }], ["discount", f => { f.session().total_details.amount_discount = 1; }],
  ["tax", f => { f.session().total_details.amount_tax = 1; }], ["wrong amount", f => { f.session().amount_total = 1; }],
  ["wrong currency", f => { f.session().currency = "eur"; }], ["wrong quantity", f => { f.lines.get(f.session().id).data[0].quantity = 2; }],
  ["extra line", f => { f.lines.get(f.session().id).data.push(clone(f.lines.get(f.session().id).data[0])); }], ["truncated lines", f => { f.lines.get(f.session().id).has_more = true; }],
  ["wrong Price", f => { f.lines.get(f.session().id).data[0].price.id = "price_foreign"; }], ["wrong line amount", f => { f.lines.get(f.session().id).data[0].amount_total = 1; }]
]) test("canonical payment mismatch cannot grant: " + label, async () => {
  const f = fixture(); await f.start(); f.paid(); mutate(f); await assert.rejects(f.send()); assert.equal(f.calls("billing_fulfill_order").length, 0); assert.equal(f.grants.size, 0);
});
test("historical approved payment still fulfills after its Price is deactivated", async () => {
  const f = fixture(); await f.start(); f.paid(); f.lines.get(f.session().id).data[0].price.active = false; await f.send(); assert.equal(f.grants.size, 1);
});
test("same and different events for one payment grant once; stale failure/expiry event uses current paid Session", async () => {
  const f = fixture(); await f.start(); f.paid(); const event = f.event(); await f.send(event); await f.send(event);
  await f.send(f.event("checkout.session.async_payment_succeeded")); await f.send(f.event("checkout.session.async_payment_failed")); await f.send(f.event("checkout.session.expired"));
  assert.equal(f.grants.size, 1); assert.equal((await f.service.status("request")).paidGranted, 1); assert.equal(f.order().status, "fulfilled");
});
test("grant failure is retryable, and lost post-commit response never grants twice", async () => {
  const f = fixture(); await f.start(); f.paid(); const event = f.event();
  f.rpcBefore = name => name === "billing_fulfill_order" ? { data: null, error: { code: "XX000" } } : undefined;
  await rejectsCode(f.send(event), "billing_unavailable"); assert.equal(f.grants.size, 0); f.rpcBefore = undefined;
  f.rpcAfter = name => { if (name === "billing_fulfill_order") { f.rpcAfter = undefined; throw new Error("Commit response lost"); } };
  await assert.rejects(f.send(event)); assert.equal(f.grants.size, 1); await f.send(event); assert.equal(f.grants.size, 1);
});
test("missing session-link response can be recovered directly by verified payment webhook", async () => {
  const f = fixture(); f.rpcBefore = name => name === "billing_link_checkout" ? { data: null, error: { code: "XX000" } } : undefined;
  await rejectsCode(f.start(), "checkout_unconfirmed"); assert.equal(f.order().sessionId, null); f.rpcBefore = undefined; f.paid(); await f.send(); assert.equal(f.order().sessionId, f.session().id); assert.equal(f.grants.size, 1);
});
test("canonical expired/unpaid event alone resolves a pending order without credits", async () => {
  const f = fixture(); await f.start(); f.session().status = "expired"; await f.send(f.event("checkout.session.expired")); assert.equal(f.order().status, "expired"); assert.equal(f.grants.size, 0);
  await f.start({ requestId: uuid(11) }); assert.equal(f.orders.size, 2);
});
test("disabled new sales still verify and fulfill earlier paid orders", async () => {
  const f = fixture(); await f.start(); f.paid(); f.service = createBillingService({ ...f.deps, config: { ...f.config, enabled: false } });
  assert.deepEqual(await f.service.offers(), []); await f.send(); assert.equal(f.grants.size, 1);
});
for (const kind of ["refund", "dispute"]) test("fresh " + kind + " during payment fulfillment freezes BEFORE granting, with separate stable receipts", async () => {
  const f = fixture(); await f.start(); f.paid(); if (kind === "refund") f.charges.get("ch_paid").amount_refunded = 100; else f.charges.get("ch_paid").disputed = true;
  const event = f.event(); assert.equal((await f.send(event)).status, "review"); await f.send(event);
  const calls = f.trace.map(call => call.name); assert.ok(calls.indexOf("billing_record_review") < calls.indexOf("billing_fulfill_order"));
  assert.equal(f.calls("billing_record_review")[0].args.p_receipt.eventId, event.id + ":review:" + kind);
  assert.equal(f.grants.size, 1); const status = await f.service.status("request"); assert.equal(status.hold, true); assert.equal(status.paidGranted, 1); assert.equal(status.paidAvailable, 0); assert.equal(status.freeRemaining, 5);
});
test("hold remains durable if grant fails after refund detection; later retry cannot expose credits", async () => {
  const f = fixture(); await f.start(); f.paid(); f.charges.get("ch_paid").amount_refunded = 1200;
  f.rpcBefore = name => name === "billing_fulfill_order" ? { data: null, error: { code: "XX000" } } : undefined; const event = f.event(); await rejectsCode(f.send(event), "billing_unavailable");
  assert.equal(f.holds.has("test:" + OWNER), true); assert.equal(f.grants.size, 0); f.rpcBefore = undefined; await f.send(event); assert.equal((await f.service.status("request")).paidAvailable, 0);
});
for (const kind of ["refund", "dispute"]) test("verified " + kind + " before completion binds the payment and prevents later paid spending", async () => {
  const f = fixture(); await f.start(); f.paid(); const reference = kind === "refund" ? "re_review" : "dp_review";
  const reversal = { id: reference, livemode: false, charge: "ch_paid", payment_intent: "pi_paid", amount: 100, currency: "usd", status: kind === "refund" ? "pending" : "needs_response" };
  (kind === "refund" ? f.refunds : f.disputes).set(reference, reversal); const event = f.event(kind === "refund" ? "refund.created" : "charge.dispute.created", reference);
  await f.send(event); assert.equal(f.grants.size, 0); assert.equal(f.holds.has("test:" + OWNER), true); await f.send(); assert.equal(f.grants.size, 1); assert.equal((await f.service.status("request")).paidAvailable, 0);
  reversal.status = kind === "refund" ? "failed" : "won"; await f.send(f.event(kind === "refund" ? "refund.updated" : "charge.dispute.closed", reference)); assert.equal(f.holds.has("test:" + OWNER), true);
});
test("foreign or wrong-amount reversal cannot freeze another account", async () => {
  const f = fixture(); await f.start(); f.paid(); f.refunds.set("re_bad", { id: "re_bad", charge: "ch_paid", payment_intent: "pi_foreign", amount: 1200, currency: "usd", status: "succeeded" });
  await assert.rejects(f.send(f.event("refund.updated", "re_bad"))); assert.equal(f.holds.size, 0); assert.equal(f.calls("billing_record_review").length, 0);
});
test("charge.refunded retrieves current charge and freezes only its verified paid order", async () => {
  const f = fixture(); await f.start(); f.paid(); await f.send(); f.charges.get("ch_paid").amount_refunded = 1200;
  await f.send(f.event("charge.refunded", "ch_paid")); assert.equal(f.holds.has("test:" + OWNER), true); assert.equal(f.grants.size, 1);
});
test("signature-valid unrelated objects are ignored without touching an order", async () => {
  const f = fixture(); await f.start(); f.session().metadata = {}; const before = f.calls("billing_get_order").length;
  assert.equal((await f.send()).status, "ignored"); assert.equal(f.calls("billing_get_order").length, before); assert.equal(f.grants.size, 0);
});
test("finite provider deadline preserves the durable order and same-key retry", async () => {
  const f = fixture({ timeoutMs: 8 }), gate = deferred(); f.providerBefore = name => name === "createSession" ? gate.promise : undefined;
  await rejectsCode(f.start(), "checkout_unconfirmed"); assert.equal(f.order().status, "reserved"); assert.equal(f.grants.size, 0);
  f.providerBefore = undefined; await f.start(); assert.equal(f.orders.size, 1); assert.equal(f.sessions.size, 1); gate.resolve(clone(f.session()));
});

test("database creation environment is checked before reservation or any provider request", async () => {
  const f = fixture({ createEnvironment: "live" });
  await rejectsCode(f.start(), "billing_environment_mismatch");
  await rejectsCode(f.service.status("request"), "billing_environment_mismatch");
  assert.deepEqual(await f.service.offers(), []);
  assert.equal(f.orders.size, 0); assert.equal(f.calls("billing_reserve_order").length, 0); assert.equal(f.trace.filter(call => call.kind === "stripe").length, 0);
});
test("catalog outage and registered offer mismatch expose no purchasable offers", async () => {
  const f = fixture(); f.rpcBefore = name => name === "billing_catalog" ? { data: null, error: { code: "XX000" } } : undefined;
  assert.deepEqual(await f.service.offers(), []); assert.equal(f.calls("retrievePrice").length, 0);
  f.rpcBefore = undefined; f.registeredOffers = [{ key: "profile_1", version: 1, currency: "usd", amount: 1200, credits: 1, priceId: "price_old" }];
  assert.deepEqual(await f.service.offers(), []); assert.equal(f.calls("retrievePrice").length, 0);
});
test("only immutable registered exact offers are validated with Stripe and publicly exposed", async () => {
  const f = fixture(); f.registeredOffers = [{ priceId: "price_one", credits: 1, amount: 1200, currency: "usd", version: 1, key: "profile_1" }];
  const result = await f.service.offers(); assert.deepEqual(result.map(value => value.key), ["profile_1"]);
  assert.deepEqual(f.calls("retrievePrice").map(call => call.args[0]), ["price_one"]); assert.doesNotMatch(JSON.stringify(result), /price_|createEnvironment|sk_/);
});
test("status exposes safe purchase recovery identity after storage loss and hides Stripe identities", async () => {
  const f = fixture(); await f.start(); const result = await f.service.status("new-device-request");
  assert.deepEqual(result.unresolvedOrder, { orderId: f.order().orderId, requestId: REQUEST, offerKey: "profile_1", status: "open" });
  assert.equal(result.ownedProfiles, 0); assert.equal(result.commercialExempt, false);
  assert.doesNotMatch(JSON.stringify(result), /cus_|cs_test_|pi_|price_|ownerId|requestKey/);
  f.actor = { id: OTHER, accountStatus: "active" }; assert.equal((await f.service.status("other-device")).unresolvedOrder, null);
  f.actor = { id: OWNER, accountStatus: "active" }; f.paid(); await f.send(); assert.equal((await f.service.status("return")).unresolvedOrder, null);
});
for (const [field, value] of [["createEnvironment", undefined], ["ownedProfiles", -1], ["ownedProfiles", 1.5], ["commercialExempt", "true"], ["unresolvedOrder", undefined]]) test("status fails closed on invalid database field " + field + "=" + value, async () => {
  const f = fixture(); f.rpcAfter = (name, _args, data) => name === "billing_account_status" ? { data: { ...data, [field]: value }, error: null } : undefined;
  await assert.rejects(f.service.status("request")); assert.equal(f.trace.filter(call => call.kind === "stripe").length, 0);
});
test("foreign unresolved snapshot never leaks another owner's purchase recovery identity", async () => {
  const f = fixture(); await f.start(); f.rpcAfter = (name, _args, data) => name === "billing_account_status" ? { data: { ...data, unresolvedOrder: { ...f.order(), ownerId: OTHER } }, error: null } : undefined;
  await rejectsCode(f.service.status("request"), "order_mismatch");
});
test("SDK nullable shipping with exact zero-tax totals still fulfills canonical payment", async () => {
  const f = fixture(); await f.start(); f.paid(); f.session().total_details.amount_shipping = null;
  assert.equal((await f.send()).status, "fulfilled"); assert.equal(f.grants.size, 1);
});
for (const absent of ["charge", "payment_intent"]) test("refund nullable " + absent + " resolves the remaining verified payment chain before holding", async () => {
  const f = fixture(); await f.start(); f.paid(); f.refunds.set("re_nullable", { id: "re_nullable", charge: "ch_paid", payment_intent: "pi_paid", amount: 100, currency: "usd", status: "pending", [absent]: null });
  assert.equal((await f.send(f.event("refund.created", "re_nullable"))).status, "review"); assert.equal(f.holds.has("test:" + OWNER), true); assert.equal(f.grants.size, 0);
});
test("unassociated refund and legacy charge cannot affect this account", async () => {
  const f = fixture(); f.refunds.set("re_unrelated", { id: "re_unrelated", charge: null, payment_intent: null, amount: 100, currency: "usd", status: "pending" });
  assert.equal((await f.send(f.event("refund.created", "re_unrelated"))).status, "ignored");
  f.charges.set("ch_legacy", { id: "ch_legacy", payment_intent: null }); assert.equal((await f.send(f.event("charge.refunded", "ch_legacy"))).status, "ignored");
  assert.equal(f.calls("billing_record_review").length, 0); assert.equal(f.calls("billing_get_order").length, 0);
});

for (const testAppUrl of [undefined, "", "http://sandbox.example", "https://qrguitar.com", "https://www.qrguitar.com/", "https://user:pass@sandbox.example", "https://sandbox.example/path", "https://sandbox.example/?owner=other", "https://sandbox.example/#return", "https://sandbox.example:443", "https://sandbox.example:3003", "//sandbox.example"]) test("test checkout rejects unsafe/unconfigured return origin " + String(testAppUrl), async () => {
  const f = fixture({ config: { testAppUrl } });
  assert.deepEqual(await f.service.offers(), []); await rejectsCode(f.start(), "billing_disabled"); assert.equal(f.trace.length, 0);
  assert.equal((await f.service.status("authenticated-owner")).freeRemaining, 5);
});
test("test checkout normalizes only a trailing slash and preserves retry parameters", async () => {
  const f = fixture({ config: { testAppUrl: "https://isolated-checkout.example/" } }); await f.start(); await f.start();
  const [params] = f.calls("createSession")[0].args;
  assert.equal(params.success_url, `https://isolated-checkout.example/billing/return?orderId=${f.order().orderId}`);
  assert.equal(params.cancel_url, `https://isolated-checkout.example/billing/cancel?orderId=${f.order().orderId}`);
  assert.equal(f.calls("createSession").length, 1);
});
test("LIVE checkout ignores test origin and uses the production return destination", async () => {
  const f = fixture({ createEnvironment: "live", config: { environment: "live", secretKey: "sk_live_synthetic_fixture", testAppUrl: "https://ignored.example" } });
  const result = await f.start(), [params] = f.calls("createSession")[0].args;
  assert.equal(params.success_url, `${BILLING_ORIGIN}/billing/return?orderId=${result.orderId}`);
  assert.equal(params.cancel_url, `${BILLING_ORIGIN}/billing/cancel?orderId=${result.orderId}`);
});
test("missing test return origin never disables signed reconciliation of earlier purchases", async () => {
  const f = fixture(); await f.start(); f.paid();
  f.service = createBillingService({ ...f.deps, config: { ...f.config, testAppUrl: undefined } });
  assert.equal((await f.send()).status, "fulfilled"); assert.equal(f.grants.size, 1);
  assert.equal(readBillingConfig({ QRGUITAR_BILLING_TEST_APP_URL: "https://isolated-checkout.example" }).testAppUrl, "https://isolated-checkout.example");
});

test("a failed balance read does not tell a user to retry a nonexistent purchase", async () => {
  const f = fixture(); f.rpcBefore = () => ({ data: null, error: { code: "PGRST202" } });
  await assert.rejects(f.service.status("authenticated-owner"), error => error.code === "billing_unavailable" && error.message === "Your credit balance could not be loaded. Refresh to try again.");
  assert.equal(f.calls("createSession").length, 0);
});

test("approved expanded Profile access cannot buy unnecessary credits through a direct API request", async () => {
  const f = fixture(); f.rpcAfter = (name, _args, data) => name === "billing_account_status" ? {data:{...data,commercialExempt:true},error:null} : undefined;
  await rejectsCode(f.start(), "profile_access_included");
  assert.equal(f.calls("billing_reserve_order").length, 0); assert.equal(f.trace.filter(call => call.kind === "stripe").length, 0);
});
