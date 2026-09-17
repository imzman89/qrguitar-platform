import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

const require = createRequire(import.meta.url), ts = require("typescript");
const lib = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../lib");
const OWNER = "11111111-1111-4111-8111-111111111111", OTHER = "22222222-2222-4222-8222-222222222222", ORDER = "33333333-3333-4333-8333-333333333333", REQUEST = "44444444-4444-4444-8444-444444444444";
const live = "https://qvoruycxxrbarlafvhbi.supabase.co", sandbox = "https://isolated-example.supabase.co";
const version = "2026-08-26.dahlia";
const fullConfig = { STRIPE_ENVIRONMENT: "live", QRGUITAR_BILLING_ENABLED: "true", STRIPE_SECRET_KEY: "sk_live_synthetic_fixture", STRIPE_WEBHOOK_SECRET: "whsec_synthetic_fixture", STRIPE_WEBHOOK_API_VERSION: version, STRIPE_PRICE_PROFILE_1: "price_fixture" };
const balance = patch => ({ environment: "live", createEnvironment: "live", freeLimit: 25, freeRemaining: 17, ownedProfiles: 8, paidGranted: 12, paidConsumed: 3, paidRemaining: 9, paidAvailable: 9, hold: false, commercialExempt: false, unresolvedOrder: null, ...patch });
const order = patch => ({ orderId: ORDER, ownerId: OWNER, environment: "live", requestKey: REQUEST, status: "open", offer: { key: "profile_1", version: 1, currency: "usd", amount: 1200, credits: 1, priceId: "price_fixture" }, customerId: "cus_fixture", sessionId: "cs_fixture", paymentId: null, createdAt: "2026-09-18T12:00:00.000Z", updatedAt: "2026-09-18T12:00:00.000Z", ...patch });
const request = orderId => new Request(`https://www.qrguitar.com/api/billing/status${orderId ? `?orderId=${orderId}` : ""}`, { headers: { Authorization: "Bearer synthetic-token" } });
const post = (kind, body = { offerKey: "profile_1", requestId: REQUEST }) => new Request(`https://www.qrguitar.com/api/billing/${kind}`, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": "fixture-signature", authorization: "Bearer synthetic-token" }, body: JSON.stringify(body) });
function fixture(options = {}) {
  const f = { env: {}, configured: true, databaseUrl: live, user: { id: OWNER }, profile: { account_status: "active" }, account: balance(), order: order(), calls: [], providerCalls: [], gatewayConstructions: 0, databaseConstructions: 0, ...options };
  const cache = new Map();
  const database = {
    from(name) { assert.equal(name, "profiles"); return { select(columns) { assert.equal(columns, "account_status"); return { eq(column, value) { assert.equal(column, "id"); f.calls.push({ kind: "profile", ownerId: value }); return { async maybeSingle() { return { data: f.profile, error: f.profileError || null }; } }; } }; } }; },
    async rpc(name, args) {
      f.calls.push({ kind: "rpc", name, args: structuredClone(args) });
      if (f.rpc) return f.rpc(name, args);
      if (name === "billing_account_status") return { data: f.account, error: null };
      if (name === "billing_get_order") return { data: f.order, error: null };
      if (name === "billing_catalog") return { data: { environment: "live", createEnvironment: "live", offers: [order().offer] }, error: null };
      throw new Error(`Unexpected mutation RPC: ${name}`);
    }
  };
  function load(name) {
    if (cache.has(name)) return cache.get(name).exports;
    const module = { exports: {} }; cache.set(name, module);
    const output = ts.transpileModule(fs.readFileSync(path.join(lib, name + ".ts"), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
    new Function("require", "module", "exports", "process", output)(specifier => {
      if (specifier === "server-only") return {};
      if (specifier === "./supabase-server") return {
        getSupabaseEnvStatus() { if (f.loadEnvironment) f.loadEnvironment(f.env); return { isConfigured: f.configured, supabaseUrl: f.databaseUrl }; },
        createServerSupabaseClient() { f.databaseConstructions++; return f.noDatabase ? null : database; },
        async getAuthenticatedUser(req) { f.calls.push({ kind: "auth", request: req }); return { user: f.user }; }
      };
      if (specifier === "./stripe-sdk-gateway") return { STRIPE_API_VERSION: version, createOfficialStripeGateway(config) {
        f.gatewayConstructions++; f.gatewayConfig = structuredClone(config);
        return new Proxy({}, { get(_target, method) { return (...args) => {
          f.providerCalls.push({ method, args });
          if (method === "retrievePrice") return Promise.resolve({ id: "price_fixture", active: true, livemode: true, type: "one_time", currency: "usd", unit_amount: 1200, billing_scheme: "per_unit", recurring: null, custom_unit_amount: null, transform_quantity: null });
          if (method === "constructEvent") return { id: "evt_fixture", type: "unsupported.fixture", livemode: true, api_version: version, data: { object: { id: "unused" } } };
          throw new Error(`Unexpected provider operation: ${String(method)}`);
        }; } });
      } };
      return specifier.startsWith("./") ? load(specifier.slice(2)) : require(specifier);
    }, module, module.exports, { env: f.env });
    return module.exports;
  }
  const runtime = load("billing-runtime");
  f.service = runtime.getBillingService; f.handlers = runtime.billingHandlers;
  return f;
}
async function expectStatus(f, expected = 200, code) {
  const response = await f.handlers.status(request()), body = await response.json();
  assert.equal(response.status, expected); if (code) assert.equal(body.code, code);
  assert.equal(f.gatewayConstructions, 0); assert.equal(f.providerCalls.length, 0); return body;
}
async function expectPurchasesDisabled(f) {
  assert.deepEqual(await (await f.handlers.offers()).json(), { ok: true, offers: [] });
  const checkout = await f.handlers.checkout(post("checkout")), webhook = await f.handlers.webhook(post("webhook"));
  assert.equal(checkout.status, 503); assert.equal((await checkout.json()).code, "billing_disabled");
  assert.equal(webhook.status, 503); assert.equal((await webhook.json()).code, "billing_disabled");
  assert.equal(f.gatewayConstructions, 0); assert.equal(f.providerCalls.length, 0);
  assert.ok(f.calls.filter(call => call.kind === "rpc").every(call => call.name === "billing_account_status" || call.name === "billing_get_order"));
}
test("unconfigured payment provider still returns real authenticated LIVE ledger values", async () => {
  const f = fixture(), result = await expectStatus(f);
  assert.equal(result.environment, "live"); assert.equal(result.freeLimit, 25); assert.equal(result.freeRemaining, 17); assert.equal(result.paidAvailable, 9); assert.equal(result.ownedProfiles, 8);
  assert.deepEqual(f.calls.filter(call => call.kind === "rpc").map(call => call.args), [{ p_owner_id: OWNER, p_environment: "live" }]);
  await expectPurchasesDisabled(f);
});
for (const [label, patch] of [
  ["missing secret", { STRIPE_SECRET_KEY: undefined }], ["missing webhook secret", { STRIPE_WEBHOOK_SECRET: undefined }],
  ["missing version", { STRIPE_WEBHOOK_API_VERSION: undefined }], ["wrong version", { STRIPE_WEBHOOK_API_VERSION: "untrusted.version" }],
  ["wrong environment key", { STRIPE_SECRET_KEY: "sk_test_wrong_mode" }], ["malformed secret", { STRIPE_SECRET_KEY: "not-a-secret" }],
  ["malformed webhook secret", { STRIPE_WEBHOOK_SECRET: "not-a-webhook-secret" }], ["empty secret", { STRIPE_SECRET_KEY: "" }],
  ["unset mode", { STRIPE_ENVIRONMENT: undefined }]
]) test(`${label} permits only database status and never constructs provider`, async () => {
  const f = fixture({ env: { ...fullConfig, ...patch } }); assert.equal((await expectStatus(f)).paidRemaining, 9); await expectPurchasesDisabled(f);
});
test("exact blank mode reads LIVE ledger but cannot enable provider operations", async () => {
  const f = fixture({ env: { ...fullConfig, STRIPE_ENVIRONMENT: "" } }); assert.equal((await expectStatus(f)).environment, "live"); await expectPurchasesDisabled(f);
});
for (const mode of [" ", "LIVE", "Test", "demo", " live", "test "]) test(`explicit invalid mode ${JSON.stringify(mode)} fails closed before database access`, async () => {
  const f = fixture({ env: { ...fullConfig, STRIPE_ENVIRONMENT: mode } }); await expectStatus(f, 503, "billing_disabled"); assert.equal(f.databaseConstructions, 0); assert.equal(f.calls.length, 0); await expectPurchasesDisabled(f);
});
test("missing Supabase configuration does not fabricate a free balance", async () => {
  const f = fixture({ configured: false }); const body = await expectStatus(f, 503, "billing_disabled"); assert.equal(Object.hasOwn(body, "freeRemaining"), false); assert.equal(f.databaseConstructions, 0);
});
test("missing database client fails closed without provider construction", async () => {
  const f = fixture({ noDatabase: true }); await expectStatus(f, 503, "billing_disabled"); assert.equal(f.calls.length, 0);
});
test("local environment initialization happens before choosing the ledger scope", async () => {
  const f = fixture({ loadEnvironment: env => { env.STRIPE_ENVIRONMENT = "test"; env.QRGUITAR_BILLING_TEST_DATABASE_URL = sandbox; }, databaseUrl: sandbox, account: balance({ environment: "test", createEnvironment: "test" }) });
  assert.equal((await expectStatus(f)).environment, "test");
});
test("signed-out users cannot read the unconfigured ledger", async () => {
  const f = fixture({ user: null }); await expectStatus(f, 401, "sign_in_required"); assert.equal(f.calls.filter(call => call.kind === "rpc" || call.kind === "profile").length, 0);
});
test("invalid authenticated identity cannot reach the ledger RPC", async () => {
  const f = fixture({ user: { id: "bad-id" } }); await expectStatus(f, 401, "sign_in_required"); assert.equal(f.calls.filter(call => call.kind === "rpc").length, 0);
});
test("profile lookup dependency error remains 503 without a balance", async () => {
  const f = fixture({ profileError: { code: "unavailable" } }); const body = await expectStatus(f, 503, "account_unavailable"); assert.equal(Object.hasOwn(body, "paidAvailable"), false); assert.equal(f.calls.filter(call => call.kind === "rpc").length, 0);
});
for (const profile of [null, { account_status: "unknown" }]) test(`unverified profile ${JSON.stringify(profile)} is denied`, async () => {
  const f = fixture({ profile }); await expectStatus(f, 403, "account_unavailable"); assert.equal(f.calls.filter(call => call.kind === "rpc").length, 0);
});
test("SQL account restriction remains authoritative on ledger reads", async () => {
  const f = fixture({ profile: { account_status: "locked" }, rpc: async () => ({ data: null, error: { code: "42501" } }) }); await expectStatus(f, 403, "account_unavailable");
});
test("database dependency failure does not become a fabricated zero balance", async () => {
  const f = fixture({ rpc: async () => ({ data: null, error: { code: "XX000" } }) }); const body = await expectStatus(f, 503, "billing_unavailable"); assert.equal(Object.hasOwn(body, "paidAvailable"), false);
});
test("unconfigured LIVE scope must match database creation environment", async () => {
  const f = fixture({ account: balance({ createEnvironment: "test" }) }); await expectStatus(f, 503, "billing_environment_mismatch");
});
test("missing database creation scope fails closed", async () => {
  const f = fixture({ account: balance({ createEnvironment: undefined }) }); await expectStatus(f, 503, "billing_environment_mismatch");
});
test("explicit TEST mode cannot read the production project even when allowlisted", async () => {
  const f = fixture({ env: { STRIPE_ENVIRONMENT: "test", QRGUITAR_BILLING_TEST_DATABASE_URL: live } }); await expectStatus(f, 503, "billing_disabled"); assert.equal(f.databaseConstructions, 0);
});
for (const allowed of [undefined, live, "https://different-example.supabase.co", sandbox + "/path", "http://isolated-example.supabase.co"]) test(`TEST mode requires exact isolated database configuration ${String(allowed)}`, async () => {
  const f = fixture({ env: { STRIPE_ENVIRONMENT: "test", QRGUITAR_BILLING_TEST_DATABASE_URL: allowed }, databaseUrl: sandbox }); await expectStatus(f, 503, "billing_disabled"); assert.equal(f.databaseConstructions, 0);
});
test("explicit isolated TEST scope reads only TEST ledger without payment keys", async () => {
  const f = fixture({ env: { STRIPE_ENVIRONMENT: "test", QRGUITAR_BILLING_TEST_DATABASE_URL: sandbox }, databaseUrl: sandbox, account: balance({ environment: "test", createEnvironment: "test" }) });
  const body = await expectStatus(f); assert.equal(body.environment, "test"); assert.equal(f.calls.find(call => call.kind === "rpc").args.p_environment, "test"); await expectPurchasesDisabled(f);
});
test("isolated TEST URL still requires trusted SQL creation scope TEST", async () => {
  const f = fixture({ env: { STRIPE_ENVIRONMENT: "test", QRGUITAR_BILLING_TEST_DATABASE_URL: sandbox }, databaseUrl: sandbox, account: balance({ environment: "test", createEnvironment: "live" }) }); await expectStatus(f, 503, "billing_environment_mismatch");
});
test("configured paused purchases retain real order and pending recovery data", async () => {
  const f = fixture({ env: { ...fullConfig, QRGUITAR_BILLING_ENABLED: "false" }, account: balance({ unresolvedOrder: order() }) });
  const response = await f.handlers.status(request(ORDER)), body = await response.json(); assert.equal(response.status, 200); assert.equal(body.order.status, "open"); assert.equal(body.paidAvailable, 9); assert.equal(body.unresolvedOrder.requestId, REQUEST);
  assert.equal(f.gatewayConstructions, 0); assert.equal(f.providerCalls.length, 0); assert.doesNotMatch(JSON.stringify(body), /price_fixture|cus_fixture|cs_fixture|ownerId|secret/i);
  assert.deepEqual(await (await f.handlers.offers()).json(), { ok: true, offers: [] }); assert.equal((await f.handlers.checkout(post("checkout"))).status, 503); assert.equal(f.gatewayConstructions, 0);
});
test("unconfigured order lookup remains owner-bound", async () => {
  const f = fixture({ order: order({ ownerId: OTHER }) }); const response = await f.handlers.status(request(ORDER)); assert.equal(response.status, 503); assert.equal((await response.json()).code, "order_mismatch"); assert.equal(f.calls.find(call => call.name === "billing_get_order").args.p_owner_id, OWNER); assert.equal(f.gatewayConstructions, 0);
});
test("unconfigured held credit balance is retained rather than made spendable", async () => {
  const f = fixture({ account: balance({ hold: true, paidAvailable: 0 }) }); const body = await expectStatus(f); assert.equal(body.hold, true); assert.equal(body.paidGranted, 12); assert.equal(body.paidRemaining, 9); assert.equal(body.paidAvailable, 0);
});
test("fully configured status is also read-only and does not construct Stripe", async () => {
  const f = fixture({ env: { ...fullConfig } }); await expectStatus(f); assert.ok(f.calls.filter(call => call.kind === "rpc").every(call => call.name === "billing_account_status"));
});
test("lazy gateway is first constructed by a gated provider operation", async () => {
  const f = fixture({ env: { ...fullConfig } }); const service = f.service(); assert.equal(f.gatewayConstructions, 0); await service.status(request()); assert.equal(f.gatewayConstructions, 0);
  const offers = await service.offers(); assert.equal(offers.length, 1); assert.equal(f.gatewayConstructions, 1); assert.deepEqual(f.providerCalls.map(call => call.method), ["retrievePrice"]); await service.status(request()); assert.equal(f.gatewayConstructions, 1); assert.equal(f.providerCalls.length, 1);
});
test("paused sales still permit configured signature processing for earlier payments", async () => {
  const f = fixture({ env: { ...fullConfig, QRGUITAR_BILLING_ENABLED: "false" } }); const response = await f.handlers.webhook(post("webhook")); assert.equal(response.status, 200); assert.deepEqual(await response.json(), { received: true, status: "ignored" }); assert.deepEqual(f.providerCalls.map(call => call.method), ["constructEvent"]);
});
