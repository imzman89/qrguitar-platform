import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(web, "package.json"));
const ts = require("typescript"), modules = new Map();
function load(name) {
  if (modules.has(name)) return modules.get(name);
  const filename = path.join(web, "lib", `${name}.ts`);
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
  }).outputText;
  const module = { exports: {} }; modules.set(name, module.exports);
  new Function("require", "module", "exports", compiled)(specifier => specifier === "server-only" ? {} : specifier.startsWith("./") ? load(specifier.slice(2)) : require(specifier), module, module.exports);
  modules.set(name, module.exports); return module.exports;
}

const { createPayPalService } = load("paypal-service");
const { createPayPalGateway } = load("paypal-gateway");
const { createPayPalHandlers } = load("paypal-http");
const clientModule = load("paypal-payments-client");
const sdkModule = load("paypal-browser-sdk");
const appleModule = load("paypal-apple-pay");

const OWNER = "11111111-1111-4111-8111-111111111111";
const REQUEST = "22222222-2222-4222-8222-222222222222";
const ORDER = "33333333-3333-4333-8333-333333333333";
const PROMO = "44444444-4444-4444-8444-444444444444";
const PAYPAL = "5O190127TN364715T", CAPTURE = "7X12345678901234A", MERCHANT = "ABCDEFGHIJKLM";
const config = { configured: true, enabled: true, environment: "test", clientId: "public-test-client-id", secret: "fixture-secret",
  merchantId: MERCHANT, webhookId: "fixture-webhook", merchantName: "QRguitar", origin: "https://fixture.invalid", applePayEnabled: true };
const baseOffer = { key: "profile_10", version: 1, currency: "usd", amount: 5000, credits: 10, permanent: true, freeAllowance: 5 };
const promotion = { id: PROMO, code: "GARYWON", name: "Owner payment test", revision: 1, discountType: "fixed_total", discountValue: 30,
  classification: "internal_test", originalAmount: 5000, discountAmount: 4970, finalAmount: 30 };
const promotedOffer = { ...baseOffer, amount: 30, listAmount: 5000, promotion };
const databaseOffer = { key: "profile_10", version: 1, currency: "usd", amount: 30, credits: 10 };
const rawOrder = (patch = {}) => ({ orderId: ORDER, ownerId: OWNER, environment: "test", requestKey: REQUEST, status: "open",
  offer: databaseOffer, provider: "paypal", merchantId: MERCHANT, paypalOrderId: PAYPAL, captureId: null, hold: false,
  promotion, createdAt: new Date().toISOString(), ...patch });
const account = { environment: "test", createEnvironment: "test", freeLimit: 5, ownedProfiles: 5, freeRemaining: 0,
  paidGranted: 0, paidConsumed: 0, paidRemaining: 0, paidAvailable: 0, commercialExempt: false, hold: false, unresolvedOrder: null };
const unit = (amount = "0.30", captures) => ({ reference_id: ORDER, custom_id: ORDER, invoice_id: `QRG-${ORDER}`,
  payee: { merchant_id: MERCHANT }, amount: { currency_code: "USD", value: amount },
  ...(captures === undefined ? {} : { payments: { captures } }) });
const remoteOrder = (amount = "0.30", captureAmount, status = "COMPLETED") => ({ id: PAYPAL, intent: "CAPTURE", status,
  purchase_units: [unit(amount, captureAmount === undefined ? [] : [{ id: CAPTURE, status: "COMPLETED", final_capture: true, amount: { currency_code: "USD", value: captureAmount } }])] });
const remoteCapture = (amount = "0.30") => ({ id: CAPTURE, status: "COMPLETED", final_capture: true,
  amount: { currency_code: "USD", value: amount }, payee: { merchant_id: MERCHANT }, supplementary_data: { related_ids: { order_id: PAYPAL } },
  invoice_id: `QRG-${ORDER}`, custom_id: ORDER });
const rejectsCode = (promise, code) => assert.rejects(promise, error => error.code === code, `Expected ${code}`);

function serviceFixture({ rows = {}, gateway = {}, actor = { id: OWNER, accountStatus: "active", isAdmin: true } } = {}) {
  const calls = [], gatewayCalls = [];
  const defaults = {
    async createOrder(input) { gatewayCalls.push(["createOrder", input]); return { ...remoteOrder("0.30", undefined, "CREATED"), purchase_units: [unit("0.30")] }; },
    async getOrder() { gatewayCalls.push(["getOrder"]); return remoteOrder("0.30", "0.30"); },
    async captureOrder() { gatewayCalls.push(["captureOrder"]); return remoteOrder("0.30", "0.30"); },
    async getCapture() { gatewayCalls.push(["getCapture"]); return remoteCapture(); },
    async getRefund() { return {}; }, async getDispute() { return {}; }, async verifyWebhook() { return true; }
  };
  const database = { async rpc(name, args) {
    calls.push({ name, args });
    const handler = rows[name] ?? (name === "billing_paypal_webhook_scheduler_ready" ? true : undefined);
    if (handler === undefined) throw new Error(`Unexpected RPC ${name}`);
    try { return { data: typeof handler === "function" ? await handler(args) : structuredClone(handler), error: null }; }
    catch (error) { return { data: null, error: { code: error.code || "fixture" } }; }
  } };
  return { calls, gatewayCalls, service: createPayPalService({ config, database, gateway: { ...defaults, ...gateway }, authenticate: async () => actor }) };
}

test("service quotes GARYWON as an internal thirty-cent pack from the authoritative RPC", async () => {
  const fixture = serviceFixture({ rows: { billing_promo_quote: args => {
    assert.deepEqual(args, { p_owner_id: OWNER, p_environment: "test", p_offer_key: "profile_10", p_code: "GARYWON", p_internal_access: true });
    return { offer: databaseOffer, promotion };
  } } });
  assert.deepEqual(await fixture.service.quote({}, { offerKey: "profile_10", promoCode: "  garywon " }), { offer: promotedOffer });
});

test("service forwards quote identity and amount to atomic reservation and creates PayPal for $0.30", async () => {
  const reserved = rawOrder({ status: "reserved", paypalOrderId: null }), bound = rawOrder();
  const fixture = serviceFixture({ rows: {
    billing_paypal_find_order: { order: null }, billing_account_status: account,
    billing_paypal_reserve_promoted_order: args => {
      assert.equal(args.p_promo_code, "GARYWON"); assert.equal(args.p_promotion_id, PROMO); assert.equal(args.p_promotion_revision, 1);
      assert.equal(args.p_expected_amount, 30); assert.equal(args.p_internal_access, true); return reserved;
    },
    billing_paypal_bind_order: bound
  } });
  const result = await fixture.service.create({}, { offerKey: "profile_10", requestId: REQUEST, promoCode: "GARYWON",
    promoId: PROMO, promoRevision: 1, expectedAmount: 30 });
  assert.equal(result.paypalOrderId, PAYPAL); assert.deepEqual(result.offer, promotedOffer);
  assert.equal(fixture.gatewayCalls.length, 1); assert.equal(fixture.gatewayCalls[0][1].offer.amount, 30);
});

test("a stale promo quote fails before a provider order can be created", async () => {
  const stale = Object.assign(new Error("stale"), { code: "PT409" });
  const fixture = serviceFixture({ rows: { billing_paypal_find_order: { order: null }, billing_account_status: account,
    billing_paypal_reserve_promoted_order: () => { throw stale; } } });
  await rejectsCode(fixture.service.create({}, { offerKey: "profile_10", requestId: REQUEST, promoCode: "GARYWON",
    promoId: PROMO, promoRevision: 1, expectedAmount: 30 }), "payment_conflict");
  assert.equal(fixture.gatewayCalls.length, 0);
});

test("service rejects provider order and capture totals above or below the frozen thirty cents", async () => {
  for (const [orderAmount, captureAmount] of [["0.29", "0.30"], ["0.31", "0.30"], ["12.00", "0.30"], ["0.30", "0.29"], ["0.30", "0.31"], ["0.30", "12.00"]]) {
    const fixture = serviceFixture({ rows: { billing_paypal_get_order: rawOrder() }, gateway: { getOrder: async () => remoteOrder(orderAmount, captureAmount) } });
    await rejectsCode(fixture.service.reconcile({}, { orderId: ORDER }), "payment_mismatch");
    assert.equal(fixture.calls.some(call => call.name === "billing_paypal_apply_capture"), false);
  }
});

test("service accepts an exact thirty-cent order and capture and applies that receipt once", async () => {
  const fulfilled = rawOrder({ status: "fulfilled", captureId: CAPTURE });
  const fixture = serviceFixture({ rows: { billing_paypal_get_order: rawOrder(), billing_paypal_apply_capture: args => {
    assert.equal(args.p_receipt.amount, 30); return fulfilled;
  } } });
  const result = await fixture.service.reconcile({}, { orderId: ORDER });
  assert.equal(result.order.status, "fulfilled"); assert.equal(result.order.offer.amount, 30);
});

test("PayPal gateway serializes the promoted order as exactly 0.30 USD without exposing the code", async () => {
  const seen = [], responses = [Response.json({ access_token: "ACCESS_TOKEN", expires_in: 3600 }), Response.json({ id: PAYPAL, status: "CREATED" })];
  const gateway = createPayPalGateway(config, async (url, init) => { seen.push({ url, init }); return responses.shift(); });
  await gateway.createOrder({ orderId: ORDER, offer: promotedOffer });
  const body = JSON.parse(seen[1].init.body), purchase = body.purchase_units[0];
  assert.deepEqual(purchase.amount, { currency_code: "USD", value: "0.30" }); assert.equal(purchase.description, "10 QRguitar Profile credits");
  assert.doesNotMatch(seen[1].init.body, /GARYWON|Owner payment test|internal_test/);
});

const allOffers = [
  { key: "profile_1", amount: 1200, credits: 1 }, baseOffer, { key: "profile_25", amount: 9900, credits: 25 }
].map(value => ({ ...value, version: 1, currency: "usd", permanent: true, freeAllowance: 5 }));
const snapshot = (patch = {}) => ({ environment: "test", freeLimit: 5, freeRemaining: 0, paidGranted: 0, paidConsumed: 0,
  paidRemaining: 0, paidAvailable: 0, ownedProfiles: 5, hold: false, commercialExempt: false, enabled: true, applePayEnabled: true,
  clientId: "public-test-client-id", currency: "USD", merchantName: "QRguitar", offers: allOffers, order: null, pendingOrder: null,
  legacyOrderId: null, legacyOrderProvider: null, ...patch });
const json = value => Response.json({ ok: true, ...value });
const session = { access_token: "token-owner", user: { id: OWNER } };
async function until(predicate) { for (let index = 0; index < 300; index++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 1)); } assert.ok(predicate(), "condition did not settle"); }
function clientFixture(t, { storage = new Map(), responder } = {}) {
  const calls = []; let authCallback;
  const auth = { getSession: async () => ({ data: { session } }), onAuthStateChange(callback) { authCallback = callback; return { data: { subscription: { unsubscribe() {} } } }; } };
  const respond = responder || (async (url, init) => {
    if (url.includes("/status")) return json(snapshot());
    if (url.endsWith("/promo")) return json({ offer: promotedOffer });
    if (url.endsWith("/create")) return json({ orderId: ORDER, paypalOrderId: PAYPAL, status: "approval_pending", offer: promotedOffer });
    throw new Error(`Unexpected request ${url}`);
  });
  const client = clientModule.createPayPalPaymentsClient({ auth: () => auth, fetch: async (url, init) => { calls.push({ url, init }); return respond(url, init); },
    timeoutMs: 100, randomUUID: () => REQUEST, storage: () => ({ getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }) });
  t.after(() => client.dispose());
  return { client, calls, storage, authCallback, async ready() { await client.start(); await until(() => client.getState().phase !== "loading"); },
    posts() { return calls.filter(call => call.init.method === "POST"); } };
}

test("browser client applies the authoritative quote and binds its id, revision, and amount to create", async t => {
  const fixture = clientFixture(t); await fixture.ready();
  const quote = await fixture.client.quotePromotion("profile_10", " garywon ", OWNER); assert.deepEqual(quote, promotedOffer);
  assert.equal(await fixture.client.createOrder("profile_10", OWNER, quote), PAYPAL);
  assert.deepEqual(fixture.posts().map(call => JSON.parse(call.init.body)), [
    { offerKey: "profile_10", promoCode: "GARYWON" },
    { offerKey: "profile_10", requestId: REQUEST, promoCode: "GARYWON", promoId: PROMO, promoRevision: 1, expectedAmount: 30 }
  ]);
  assert.deepEqual(fixture.client.getState().intent, { requestId: REQUEST, offerKey: "profile_10", orderId: ORDER, paypalOrderId: PAYPAL,
    approvalObserved: false, promoCode: "GARYWON", promoId: PROMO, promoRevision: 1, expectedAmount: 30 });
});

test("a lost create response persists the exact promo preconditions for a safe retry", async t => {
  const storage = new Map();
  const first = clientFixture(t, { storage, responder: async (url) => {
    if (url.includes("/status")) return json(snapshot()); if (url.endsWith("/promo")) return json({ offer: promotedOffer });
    throw new Error("Lost response");
  } });
  await first.ready(); const quote = await first.client.quotePromotion("profile_10", "GARYWON", OWNER);
  await assert.rejects(first.client.createOrder("profile_10", OWNER, quote)); first.client.dispose();
  const resumed = clientFixture(t, { storage }); await resumed.ready(); assert.equal(await resumed.client.createOrder("profile_10", OWNER), PAYPAL);
  assert.deepEqual(JSON.parse(resumed.posts()[0].init.body), { offerKey: "profile_10", requestId: REQUEST, promoCode: "GARYWON",
    promoId: PROMO, promoRevision: 1, expectedAmount: 30 });
});

test("browser client rejects tampered promo quotes and changed create responses", async t => {
  const tamperedQuote = { ...promotedOffer, amount: 31 };
  const quoteFixture = clientFixture(t, { responder: async url => url.includes("/status") ? json(snapshot()) : json({ offer: tamperedQuote }) });
  await quoteFixture.ready(); await assert.rejects(quoteFixture.client.quotePromotion("profile_10", "GARYWON", OWNER), /promo could not be verified/);
  const createFixture = clientFixture(t, { responder: async (url) => {
    if (url.includes("/status")) return json(snapshot()); if (url.endsWith("/promo")) return json({ offer: promotedOffer });
    return json({ orderId: ORDER, paypalOrderId: PAYPAL, status: "approval_pending", offer: { ...promotedOffer, promotion: { ...promotion, revision: 2 } } });
  } });
  await createFixture.ready(); const quote = await createFixture.client.quotePromotion("profile_10", "GARYWON", OWNER);
  await assert.rejects(createFixture.client.createOrder("profile_10", OWNER, quote), /could not be verified/);
  assert.equal(createFixture.client.getState().intent.promoRevision, 1);
});

test("PayPal button adapter supplies the promoted offer to the controller", async () => {
  const calls = [], controller = { createOrder: async (...args) => { calls.push(args); return PAYPAL; }, capture: async () => "confirmed",
    cancelled: async () => {}, sdkError() {} };
  const options = sdkModule.paypalButtonOptions(controller, promotedOffer, OWNER);
  assert.equal(await options.createOrder(), PAYPAL); assert.deepEqual(calls[0], ["profile_10", OWNER, promotedOffer]);
});

test("Apple Pay opens a 0.30 sheet and uses the same promoted server preconditions after authorization", async () => {
  const calls = [], sessions = [], state = { actorId: OWNER };
  class Session {
    static STATUS_SUCCESS = 1; static STATUS_FAILURE = 0;
    constructor(version, request) { this.request = request; calls.push(["session", version, request]); sessions.push(this); }
    begin() { calls.push(["begin"]); } abort() { calls.push(["abort"]); }
    completeMerchantValidation(value) { calls.push(["validated", value]); } completePayment(status) { calls.push(["complete", status]); }
  }
  const controller = { getState: () => state, beginWalletCheckout: () => true,
    createOrder: async (...args) => { calls.push(["create", ...args]); return PAYPAL; },
    capture: async (...args) => { calls.push(["capture", ...args]); return "confirmed"; }, cancelled: async () => {}, sdkError() {} };
  const applepay = { config: async () => ({}), validateMerchant: async () => ({ merchantSession: {} }),
    confirmOrder: async input => { calls.push(["confirm", input]); return {}; } };
  const checkout = appleModule.createApplePayCheckout({ applepay, config: { isEligible: true, countryCode: "US", merchantCapabilities: ["supports3DS"], supportedNetworks: ["visa"] },
    Session, controller, actorId: OWNER, offer: promotedOffer, merchantName: "QRguitar", timeoutMs: 100 });
  try {
    assert.equal(checkout.start(), true); assert.deepEqual(sessions[0].request.total, { label: "QRguitar", type: "final", amount: "0.30" });
    sessions[0].onpaymentauthorized({ payment: { token: { encrypted: "PAYPAL_ONLY" } } });
    await until(() => calls.some(call => call[0] === "capture"));
    assert.deepEqual(calls.find(call => call[0] === "create"), ["create", "profile_10", OWNER, promotedOffer]);
    assert.deepEqual(calls.find(call => call[0] === "capture"), ["capture", PAYPAL, OWNER]);
  } finally { checkout.dispose(); }
});

test("promo HTTP endpoint preserves same-origin JSON and no-store boundaries", async () => {
  const calls = [], handlers = createPayPalHandlers({ service: () => ({
    async status() { return {}; }, async create() { return {}; }, async capture() { return {}; }, async reconcile() { return {}; },
    async quote(_request, input) { calls.push(input); return { offer: promotedOffer }; }
  }) });
  const request = (origin = "https://www.qrguitar.com", contentType = "application/json") => new Request("https://www.qrguitar.com/api/billing/paypal/promo", {
    method: "POST", headers: { origin, "content-type": contentType }, body: JSON.stringify({ offerKey: "profile_10", promoCode: "GARYWON" })
  });
  const response = await handlers.quote(request()), body = await response.json();
  assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store, no-cache, must-revalidate");
  assert.deepEqual(calls[0], { offerKey: "profile_10", promoCode: "GARYWON" }); assert.equal(body.offer.amount, 30);
  assert.equal((await handlers.quote(request("https://evil.invalid"))).status, 403);
  assert.equal((await handlers.quote(request("https://www.qrguitar.com", "text/plain"))).status, 415);
});
