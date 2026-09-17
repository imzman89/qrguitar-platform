import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = path.dirname(fileURLToPath(import.meta.url)), args = process.argv.slice(2);
const runtime = args.includes("--runtime") ? args[args.indexOf("--runtime") + 1] : process.env.QRGUITAR_SOURCE_ROOT || process.cwd();
const runtimeRequire = createRequire(path.join(runtime, "package.json")), localRequire = createRequire(import.meta.url), ts = runtimeRequire("typescript"), Stripe = localRequire("stripe");
const module = { exports: {} }, source = fs.readFileSync(path.join(here, "../lib/stripe-sdk-gateway.ts"), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
new Function("require", "module", "exports", js)(name => name === "server-only" ? {} : localRequire(name), module, module.exports);
const { createOfficialStripeGateway, STRIPE_API_VERSION, STRIPE_SDK_VERSION, STRIPE_REQUEST_TIMEOUT_MS, STRIPE_NETWORK_RETRIES } = module.exports;
const config = { environment: "test", secretKey: "sk_test_local_fixture_no_real_account", webhookSecret: "whsec_local_fixture_no_real_endpoint", webhookApiVersion: STRIPE_API_VERSION };
const meta = { qrguitar_billing_version: "1", qrguitar_owner_id: "owner", qrguitar_environment: "test", qrguitar_order_id: "order" };
const customer = (id = "cus_owner", metadata = meta) => ({ id, object: "customer", livemode: false, metadata, email: "synthetic-unused@example.invalid" });
const price = () => ({ id: "price_one", object: "price", active: true, livemode: false, type: "one_time", currency: "usd", unit_amount: 1200, billing_scheme: "per_unit", recurring: null, custom_unit_amount: null, transform_quantity: null });
const session = (extra = {}) => ({ id: "cs_test_one", object: "checkout.session", livemode: false, mode: "payment", customer: "cus_owner", client_reference_id: "order", metadata: meta, status: "open", payment_status: "unpaid", payment_intent: null, currency: "usd", amount_total: 1200, amount_subtotal: 1200, total_details: { amount_discount: 0, amount_shipping: null, amount_tax: 0 }, subscription: null, url: "https://checkout.stripe.com/c/pay/local-fixture", ...extra });
const payment = (extra = {}) => ({ id: "pi_one", object: "payment_intent", livemode: false, customer: "cus_owner", metadata: meta, status: "succeeded", amount: 1200, amount_received: 1200, currency: "usd", latest_charge: "ch_one", ...extra });
const charge = (extra = {}) => ({ id: "ch_one", object: "charge", livemode: false, customer: "cus_owner", payment_intent: "pi_one", status: "succeeded", paid: true, captured: true, amount: 1200, amount_captured: 1200, currency: "usd", amount_refunded: 0, disputed: false, ...extra });
const list = (data, has_more = false) => ({ object: "list", data, has_more, url: "/local-fixture" });
const getHeader = (headers, name) => Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
function fixture(handler = () => { throw new Error("Unexpected SDK request"); }, options = {}, settings = config) {
  const requests = [];
  const httpClient = {
    getClientName: () => "LocalOnlyBillingFixture",
    async makeRequest(host, port, requestPath, method, headers, body, protocol, timeout) {
      const request = { host, port, path: requestPath, method, headers, body, protocol, timeout }; requests.push(request);
      const response = await handler(request, requests.length), status = response.status || 200, rawResponse = {};
      return { getStatusCode: () => status, getHeaders: () => ({ "content-type": "application/json", "request-id": "req_local_fixture", ...response.headers }),
        getRawResponse: () => rawResponse, toStream: () => { throw new Error("Streaming is not used"); }, toJSON: async () => structuredClone(response.body) };
    }
  };
  return { requests, gateway: createOfficialStripeGateway(settings, { ...options, httpClient }) };
}
const rawEvent = () => ' { "id": "evt_local", "object": "event", "type": "checkout.session.completed", "livemode": false, "api_version": "' + STRIPE_API_VERSION + '", "data": {"object":{"id":"cs_test_one","description":"Café 🎸"}} }\n';
function sign(payload, extra = {}) { return Stripe.webhooks.generateTestHeaderString({ payload, secret: config.webhookSecret, ...extra }); }

test("official SDK and API versions are exactly pinned", () => {
  assert.equal(Stripe.PACKAGE_VERSION, STRIPE_SDK_VERSION); assert.equal(Stripe.API_VERSION, STRIPE_API_VERSION);
  assert.equal(JSON.parse(fs.readFileSync(path.join(here, "../package.json"), "utf8")).dependencies.stripe, STRIPE_SDK_VERSION);
});
test("gateway is lazy with disabled/missing configuration and refuses incompatible calls", async () => {
  const f = fixture(undefined, {}, {}); await assert.rejects(f.gateway.retrievePrice("price_one"), /configuration/); assert.equal(f.requests.length, 0);
  const wrong = fixture(undefined, {}, { ...config, webhookApiVersion: "wrong" }); await assert.rejects(wrong.gateway.retrievePrice("price_one"), /configuration/); assert.equal(wrong.requests.length, 0);
});
for (const bytes of [false, true]) test("real SDK validates the untouched locally signed " + (bytes ? "UTF-8 bytes" : "string"), () => {
  const f = fixture(), raw = rawEvent(), payload = bytes ? new TextEncoder().encode(raw) : raw;
  const event = f.gateway.constructEvent(payload, sign(raw), config.webhookSecret);
  assert.equal(event.id, "evt_local"); assert.equal(event.data.object.id, "cs_test_one"); assert.equal(event.api_version, STRIPE_API_VERSION); assert.equal(f.requests.length, 0);
});
for (const kind of ["changed whitespace", "changed content", "wrong secret", "stale signature", "missing signature", "malformed body"]) test("real SDK rejects " + kind + " locally without network", () => {
  const f = fixture(), raw = rawEvent(); let payload = raw, signature = sign(raw), secret = config.webhookSecret;
  if (kind === "changed whitespace") payload = JSON.stringify(JSON.parse(raw));
  if (kind === "changed content") payload = raw.replace("cs_test_one", "cs_test_other");
  if (kind === "wrong secret") secret = "whsec_other_local_fixture";
  if (kind === "stale signature") signature = sign(raw, { timestamp: Math.floor(Date.now() / 1000) - 3600 });
  if (kind === "missing signature") signature = "";
  if (kind === "malformed body") { payload = "{"; signature = sign(payload); }
  assert.throws(() => f.gateway.constructEvent(payload, signature, secret)); assert.equal(f.requests.length, 0);
});
test("customer creation preserves stable metadata/idempotency without adding customer email", async () => {
  const f = fixture(() => ({ body: customer() })); await f.gateway.createCustomer({ metadata: { ...meta, absent: undefined } }, { idempotencyKey: "stable_customer_key" });
  const request = f.requests[0], body = new URLSearchParams(request.body);
  assert.equal(request.method, "POST"); assert.equal(request.path, "/v1/customers"); assert.equal(body.get("metadata[qrguitar_owner_id]"), "owner");
  assert.equal(body.has("email"), false); assert.equal(body.has("metadata[absent]"), false); assert.equal(getHeader(request.headers, "Idempotency-Key"), "stable_customer_key");
  assert.equal(getHeader(request.headers, "Stripe-Version"), STRIPE_API_VERSION); assert.equal(request.timeout, STRIPE_REQUEST_TIMEOUT_MS); assert.equal(request.host, "api.stripe.com"); assert.equal(request.protocol, "https");
});
test("real SDK serializes the exact supported one-time Checkout parameters", async () => {
  const f = fixture(() => ({ body: session() }));
  const params = { mode: "payment", customer: "cus_owner", client_reference_id: "order", metadata: meta, payment_intent_data: { metadata: meta }, line_items: [{ price: "price_one", quantity: 1 }],
    success_url: "https://www.qrguitar.com/billing/return?orderId=order", cancel_url: "https://www.qrguitar.com/billing/cancel?orderId=order", allow_promotion_codes: false,
    automatic_tax: { enabled: false }, adaptive_pricing: { enabled: false }, after_expiration: { recovery: { enabled: false } } };
  const before = structuredClone(params); const result = await f.gateway.createSession(params, { idempotencyKey: "stable_session_key" }); assert.deepEqual(params, before);
  const request = f.requests[0], body = new URLSearchParams(request.body); assert.equal(request.path, "/v1/checkout/sessions");
  for (const [key, value] of Object.entries({ mode: "payment", customer: "cus_owner", "line_items[0][price]": "price_one", "line_items[0][quantity]": "1", "allow_promotion_codes": "false", "automatic_tax[enabled]": "false", "adaptive_pricing[enabled]": "false", "after_expiration[recovery][enabled]": "false", "payment_intent_data[metadata][qrguitar_order_id]": "order" })) assert.equal(body.get(key), value);
  assert.equal(getHeader(request.headers, "Idempotency-Key"), "stable_session_key"); assert.equal(body.get("success_url"), params.success_url); assert.equal(body.get("cancel_url"), params.cancel_url); assert.equal(body.has("customer_email"), false); assert.equal(result.total_details.amount_shipping, null);
});
test("actual SDK retries remain bounded and use the same idempotency key/body", async () => {
  const f = fixture((_request, attempt) => attempt === 1 ? { status: 503, body: { error: { type: "api_error", message: "Local synthetic unavailable" } } } : { body: customer() });
  await f.gateway.createCustomer({ metadata: meta }, { idempotencyKey: "stable_retry" }); assert.equal(STRIPE_NETWORK_RETRIES, 1); assert.equal(f.requests.length, 2);
  assert.equal(f.requests[0].body, f.requests[1].body); assert.equal(getHeader(f.requests[0].headers, "Idempotency-Key"), getHeader(f.requests[1].headers, "Idempotency-Key")); assert.ok(f.requests.every(request => request.timeout === 2500));
});
test("SDK exhausts its configured retry bound on repeated API failure", async () => {
  const f = fixture(() => ({ status: 503, body: { error: { type: "api_error", message: "Local synthetic unavailable" } } }));
  await assert.rejects(f.gateway.retrievePrice("price_one")); assert.equal(f.requests.length, 2);
});
test("expandable references normalize without exposing nested customer/card data", async () => {
  const fixtures = new Map([
    ["/v1/prices/price_one", price()], ["/v1/customers/cus_owner", customer()],
    ["/v1/checkout/sessions/cs_test_one", session({ customer: customer(), payment_intent: { id: "pi_one", private: "do not expose" }, subscription: { id: "sub_one" } })],
    ["/v1/payment_intents/pi_one", payment({ customer: customer(), latest_charge: { id: "ch_one", private: "card details" } })],
    ["/v1/charges/ch_one", charge({ customer: customer(), payment_intent: { id: "pi_one" } })],
    ["/v1/refunds/re_one", { id: "re_one", object: "refund", charge: { id: "ch_one" }, payment_intent: { id: "pi_one" }, amount: 100, currency: "usd", status: "succeeded" }],
    ["/v1/disputes/dp_one", { id: "dp_one", object: "dispute", livemode: false, charge: { id: "ch_one" }, payment_intent: { id: "pi_one" }, amount: 100, currency: "usd", status: "needs_response" }]
  ]);
  const f = fixture(request => ({ body: fixtures.get(request.path) }));
  const result = await Promise.all([f.gateway.retrievePrice("price_one"), f.gateway.retrieveCustomer("cus_owner"), f.gateway.retrieveSession("cs_test_one"), f.gateway.retrievePayment("pi_one"), f.gateway.retrieveCharge("ch_one"), f.gateway.retrieveRefund("re_one"), f.gateway.retrieveDispute("dp_one")]);
  assert.equal(result[2].customer, "cus_owner"); assert.equal(result[2].payment_intent, "pi_one"); assert.equal(result[2].subscription, "sub_one"); assert.equal(result[3].latest_charge, "ch_one"); assert.equal(result[4].payment_intent, "pi_one"); assert.equal(result[5].charge, "ch_one"); assert.equal(result[6].payment_intent, "pi_one");
  assert.doesNotMatch(JSON.stringify(result), /synthetic-unused|do not expose|card details/);
});
test("deleted customers remain explicitly deleted and absent payment references stay absent", async () => {
  const f = fixture(request => ({ body: request.path.startsWith("/v1/customers/") ? { id: "cus_deleted", object: "customer", deleted: true } : { id: "re_null", object: "refund", charge: null, payment_intent: null, amount: 100, currency: "usd", status: "failed" } }));
  assert.equal((await f.gateway.retrieveCustomer("cus_deleted")).deleted, true); assert.equal((await f.gateway.retrieveRefund("re_null")).payment_intent, null);
});
test("missing Session amount evidence fails closed instead of inventing zeros", async () => {
  const f = fixture(() => ({ body: session({ total_details: null }) })); await assert.rejects(f.gateway.retrieveSession("cs_test_one"), /Incomplete/);
});
test("line items retain full-price evidence and pagination truth", async () => {
  const item = { id: "li_one", object: "item", quantity: 1, price: price(), currency: "usd", amount_subtotal: 1200, amount_total: 1200, amount_discount: 0, amount_tax: 0 };
  const f = fixture(() => ({ body: list([item], true) })); const result = await f.gateway.listLineItems("cs_test_one");
  assert.equal(result.has_more, true); assert.equal(result.data[0].price.unit_amount, 1200); assert.equal(new URL("https://local.invalid" + f.requests[0].path).searchParams.get("limit"), "2");
});
test("customer recovery paginates the authoritative list and filters metadata locally", async () => {
  const f = fixture(request => { const url = new URL("https://local.invalid" + request.path); assert.equal(url.searchParams.get("limit"), "100");
    return { body: url.searchParams.has("starting_after") ? list([customer("cus_match")]) : list([customer("cus_foreign", { ...meta, qrguitar_owner_id: "other" })], true) }; });
  const result = await f.gateway.findCustomers(meta); assert.equal(result.complete, true); assert.deepEqual(result.data.map(value => value.id), ["cus_match"]); assert.equal(f.requests.length, 2); assert.match(f.requests[1].path, /starting_after=cus_foreign/);
});
test("customer recovery page cap never reports an incomplete match as authoritative", async () => {
  const f = fixture(() => ({ body: list([customer()], true) }), { maxRecoveryPages: 1 }); const result = await f.gateway.findCustomers(meta);
  assert.equal(result.complete, false); assert.equal(result.data.length, 1); assert.equal(f.requests.length, 1);
});
test("duplicate recovery records/cursors fail closed", async () => {
  const f = fixture(() => ({ body: list([customer()], true) })); const result = await f.gateway.findCustomers(meta); assert.equal(result.complete, false); assert.equal(f.requests.length, 2);
});
test("recovery time budget stops scheduling more SDK pages", async () => {
  let now = 0; const f = fixture(() => { now += 7_000; return { body: list([customer()], true) }; }, { now: () => now });
  const result = await f.gateway.findCustomers(meta); assert.equal(result.complete, false); assert.equal(f.requests.length, 1); assert.ok(f.requests[0].timeout <= 2500);
});
test("two matching customers are retained as ambiguous instead of choosing one", async () => {
  const f = fixture(() => ({ body: list([customer("cus_one"), customer("cus_two")]) })); const result = await f.gateway.findCustomers(meta);
  assert.equal(result.complete, true); assert.equal(result.data.length, 2);
});
test("session recovery scopes customer and time, then verifies exact order metadata locally", async () => {
  const query = { customerId: "cus_owner", orderId: "order", ownerId: "owner", environment: "test", createdAt: "2026-09-18T12:00:00Z" };
  const f = fixture(request => { const url = new URL("https://local.invalid" + request.path); assert.equal(url.searchParams.get("customer"), "cus_owner"); assert.equal(url.searchParams.get("created[gte]"), String(Date.parse(query.createdAt) / 1000 - 300));
    assert.equal(url.searchParams.has("metadata"), false); return { body: list([session({ id: "cs_wrong", metadata: { ...meta, qrguitar_order_id: "other" } }), session()]) }; });
  const result = await f.gateway.findSessions(query); assert.equal(result.complete, true); assert.deepEqual(result.data.map(value => value.id), ["cs_test_one"]);
});
for (const options of [{ maxRecoveryPages: 0 }, { maxRecoveryPages: 101 }, { recoveryBudgetMs: 0 }, { recoveryBudgetMs: 60_000 }]) test("invalid recovery bounds are rejected: " + JSON.stringify(options), () => { assert.throws(() => fixture(undefined, options), /bounds/); });
