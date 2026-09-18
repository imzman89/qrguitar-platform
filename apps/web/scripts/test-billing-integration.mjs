// Offline integration: actual canonical HTTP/runtime/service/SDK + actual PostgreSQL SQL.
// Only Supabase Auth transport and Stripe HTTP responses are injected. No ledger mocks.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID, createHash } from "node:crypto";

const here = path.dirname(fileURLToPath(import.meta.url));
const candidateRoot = path.resolve(here, "../../..");
const repo = path.resolve(process.argv[2] || candidateRoot);
assert.ok(fs.existsSync(path.join(repo, "supabase/schema.sql")), "Run from the repository scripts directory or supply the repository root");
const canonicalSql = path.join(repo, "supabase/migrations/20260917190000_billing_credits.sql");
const sqlPath = process.argv[3] || (fs.existsSync(canonicalSql) ? canonicalSql : path.resolve(here, "../billing-credit-integration/supabase/migrations/20260917190000_billing_credits.sql"));
const require = createRequire(path.join(repo, "package.json")), ts = require("typescript"), { PGlite } = require("@electric-sql/pglite");
const webRequire = createRequire(path.join(repo, "apps/web/package.json")), Stripe = webRequire("stripe");
const { installRepositorySchema } = await import(pathToFileURL(path.join(repo, "apps/web/scripts/security/postgres-fixture.mjs")));
const savedFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("External network is forbidden by this offline fixture"); };
const db = new PGlite();
await installRepositorySchema(db, repo, "20260917190000");
await db.exec("alter table storage.objects add column if not exists metadata jsonb; alter table storage.objects alter column metadata set default '{}'::jsonb, alter column metadata set not null");
await db.exec(fs.readFileSync(sqlPath, "utf8").replaceAll("\r\n", "\n"));
// Keep the real payment-to-Profile fixture on the current allowance contract,
// including later migrations when a historical billing candidate is overlaid.
for (const name of fs.readdirSync(path.join(repo, "supabase/migrations")).filter(name => name.endsWith(".sql") && name > "20260917190000_billing_credits.sql").sort()) {
  await db.exec(fs.readFileSync(path.join(repo, "supabase/migrations", name), "utf8").replaceAll("\r\n", "\n"));
}
// A separate, empty in-memory TEST database is configured before any actor/history.
await db.exec("update billing_instance_config set create_environment='test' where singleton");
const OWNER = "10000000-0000-4000-8000-000000000001", OTHER = "20000000-0000-4000-8000-000000000002";
const origin = "https://offline-billing-app.example.invalid", secret = "whsec_offline_integration_fixture";
await db.query("insert into auth.users(id) values($1),($2)", [OWNER, OTHER]);
await db.query("insert into profiles(id,display_name,role) values($1,'Offline owner','owner'),($2,'Offline other','owner')", [OWNER, OTHER]);
await db.exec("insert into storage.buckets(id,name,public) values('instrument-media','instrument-media',false),('instrument-documents','instrument-documents',false),('service-evidence','service-evidence',false) on conflict(id) do nothing");
const offer = (n = 1) => ({ key: "profile_" + n, version: 1, currency: "usd", amount: { 1: 1200, 10: 5000, 25: 9900 }[n], credits: n, priceId: "price_pack" + n });
async function directRpc(name, args) {
  assert.match(name, /^[a-z_]+$/);
  const entries = Object.entries(args); entries.forEach(([key]) => assert.match(key, /^p_[a-z_]+$/));
  await db.exec("savepoint billing_rpc; set local role service_role");
  try {
    const sql = "select public." + name + "(" + entries.map(([key], i) => key + " => $" + (i + 1)).join(",") + ") value";
    const result = (await db.query(sql, entries.map(([, value]) => value))).rows[0].value;
    await db.exec("reset role; release savepoint billing_rpc"); return result;
  } catch (error) {
    await db.exec("rollback to savepoint billing_rpc; release savepoint billing_rpc"); throw error;
  }
}
await db.exec("begin");
for (const n of [1, 10, 25]) await directRpc("billing_register_offer", { p_environment: "test", p_offer: offer(n) });
await db.exec("commit");

const configuredEnv = {
  QRGUITAR_BILLING_ENABLED: "true", STRIPE_ENVIRONMENT: "test", STRIPE_SECRET_KEY: "sk_test_offline_fixture_no_account",
  STRIPE_WEBHOOK_SECRET: secret, STRIPE_WEBHOOK_API_VERSION: "2026-08-26.dahlia",
  STRIPE_PRICE_PROFILE_1: "price_pack1", STRIPE_PRICE_PROFILE_10: "price_pack10", STRIPE_PRICE_PROFILE_25: "price_pack25",
  NEXT_PUBLIC_SUPABASE_URL: "https://offline-billing-sandbox.supabase.co", QRGUITAR_BILLING_TEST_DATABASE_URL: "https://offline-billing-sandbox.supabase.co", QRGUITAR_BILLING_TEST_APP_URL: origin
};
const originalEnv = Object.fromEntries(Object.keys(configuredEnv).map(key => [key, process.env[key]]));
Object.assign(process.env, configuredEnv);
const sourceDigests = Object.fromEntries(["billing-runtime", "billing-http", "billing-service", "stripe-sdk-gateway", "billing-environment"].map(name =>
  [name, createHash("sha256").update(fs.readFileSync(path.join(repo, "apps/web/lib", name + ".ts"))).digest("hex")]));
sourceDigests.billingSql = createHash("sha256").update(fs.readFileSync(sqlPath)).digest("hex");
function metadata(form, prefix = "metadata") {
  return Object.fromEntries([...form.entries()].filter(([key]) => key.startsWith(prefix + "[")).map(([key, value]) => [key.slice(prefix.length + 1, -1), value]));
}
const clone = value => structuredClone(value);
const list = (data, has_more = false) => ({ object: "list", data, has_more, url: "/offline" });

function fixture() {
  const f = { trace: [], customers: new Map(), sessions: new Map(), idem: new Map(), createFailureReplies: 0, sequence: 1, loseRpcReply: null, gatewayConstructions: 0 };
  const price = id => { const spec = [1, 10, 25].map(offer).find(value => value.priceId === id); assert.ok(spec, "known fixture price");
    return { id, object: "price", active: true, livemode: false, type: "one_time", currency: "usd", unit_amount: spec.amount, billing_scheme: "per_unit", recurring: null, custom_unit_amount: null, transform_quantity: null }; };
  f.httpClient = {
    getClientName: () => "OfflineBillingIntegration",
    async makeRequest(host, port, route, method, headers, body, protocol, timeout) {
      assert.equal(host, "api.stripe.com"); assert.equal(protocol, "https"); assert.ok(timeout > 0 && timeout <= 2500);
      const url = new URL(route, "https://api.stripe.com"), form = new URLSearchParams(body), request = { route: url.pathname, method, body, headers };
      f.trace.push({ kind: "stripe", ...request }); let result, status = 200;
      const key = Object.entries(headers).find(([name]) => name.toLowerCase() === "idempotency-key")?.[1];
      if (method === "POST" && ["/v1/customers", "/v1/checkout/sessions"].includes(url.pathname)) {
        assert.ok(key, "all provider creates have stable keys");
        const previous = f.idem.get(key); if (previous) { assert.equal(previous.body, body); result = previous.result; }
        else if (url.pathname === "/v1/customers") {
          const meta = metadata(form);
          const persisted = await db.query("select count(*)::integer n from billing_orders where owner_id=$1 and status='reserved'", [meta.qrguitar_owner_id]);
          assert.equal(persisted.rows[0].n, 1, "durable SQL order exists before first provider write");
          assert.equal(form.has("email"), false);
          result = { id: "cus_offline" + f.sequence++, object: "customer", livemode: false, metadata: meta };
          f.customers.set(result.id, result); f.idem.set(key, { body, result });
        } else {
          const meta = metadata(form), identity = form.get("customer"), amount = price(form.get("line_items[0][price]")).unit_amount;
          const mapping = await db.query("select customer_id from billing_customers where owner_id=$1 and environment='test'", [meta.qrguitar_owner_id]);
          assert.equal(mapping.rows[0]?.customer_id, identity, "SQL customer binding exists before Checkout");
          assert.equal(form.get("mode"), "payment"); assert.equal(form.get("line_items[0][quantity]"), "1");
          assert.equal(form.get("allow_promotion_codes"), "false"); assert.equal(form.get("automatic_tax[enabled]"), "false");
          assert.equal(form.get("success_url"), origin + "/billing/return?orderId=" + meta.qrguitar_order_id);
          assert.equal(form.get("cancel_url"), origin + "/billing/cancel?orderId=" + meta.qrguitar_order_id);
          assert.deepEqual(metadata(form, "payment_intent_data[metadata]"), meta);
          result = { id: "cs_test_offline" + f.sequence++, object: "checkout.session", livemode: false, mode: "payment", customer: identity,
            client_reference_id: meta.qrguitar_order_id, metadata: meta, status: "open", payment_status: "unpaid", payment_intent: null,
            currency: "usd", amount_total: amount, amount_subtotal: amount, total_details: { amount_discount: 0, amount_shipping: null, amount_tax: 0 }, subscription: null,
            url: "https://checkout.stripe.com/c/pay/offline", _priceId: form.get("line_items[0][price]") };
          f.sessions.set(result.id, result); f.idem.set(key, { body, result });
        }
        if (url.pathname === "/v1/checkout/sessions" && f.createFailureReplies > 0) { f.createFailureReplies--; status = 500; result = { error: { type: "api_error", message: "Offline lost Checkout response" } }; }
      } else if (url.pathname.startsWith("/v1/prices/")) result = price(url.pathname.split("/").at(-1));
      else if (url.pathname === "/v1/customers") result = list([...f.customers.values()]);
      else if (url.pathname.startsWith("/v1/customers/")) result = f.customers.get(url.pathname.split("/").at(-1));
      else if (url.pathname === "/v1/checkout/sessions") result = list([...f.sessions.values()].filter(value => value.customer === url.searchParams.get("customer")));
      else if (url.pathname.endsWith("/line_items")) {
        const session = f.sessions.get(url.pathname.split("/").at(-2));
        result = list([{ id: "li_offline", object: "item", quantity: 1, price: price(session._priceId), currency: "usd", amount_subtotal: session.amount_subtotal,
          amount_total: session.amount_total, amount_discount: 0, amount_tax: 0 }]);
      } else if (url.pathname.startsWith("/v1/checkout/sessions/")) result = f.sessions.get(url.pathname.split("/").at(-1));
      else if (url.pathname.startsWith("/v1/payment_intents/")) result = f.payment;
      else if (url.pathname.startsWith("/v1/charges/")) result = f.charge;
      else if (url.pathname.startsWith("/v1/refunds/")) result = f.refund;
      else throw new Error("Unimplemented local SDK fixture request " + method + " " + route);
      assert.ok(result, "local SDK fixture returns requested object"); const raw = {};
      return { getStatusCode: () => status, getHeaders: () => ({ "content-type": "application/json", "request-id": "req_offline" }), getRawResponse: () => raw,
        toJSON: async () => clone(result), toStream: () => { throw new Error("Streaming unused"); } };
    }
  };
  const database = {
    async rpc(name, args) {
      f.trace.push({ kind: "rpc", name, args: clone(args) });
      try {
        const data = await directRpc(name, args);
        if (f.loseRpcReply === name) { f.loseRpcReply = null; return { data: null, error: { code: "XX000" } }; }
        return { data, error: null };
      } catch (error) { f.lastRpcError = { name, code: error.code, message: error.message }; if (process.env.BILLING_TEST_DIAGNOSTICS === "true") console.error(f.lastRpcError); return { data: null, error: { code: error.code || "XX000" } }; }
    },
    from(table) {
      assert.equal(table, "profiles"); let owner;
      const query = { select(fields) { assert.equal(fields, "account_status"); return query; }, eq(field, value) { assert.equal(field, "id"); owner = value; return query; },
        async maybeSingle() { const result = await db.query("select account_status from profiles where id=$1", [owner]); return { data: result.rows[0] || null, error: null }; } };
      return query;
    }
  };
  // Token verification is the only Auth transport substitution. Identity never comes from body/query fields.
  const supabaseBoundary = {
    createServerSupabaseClient: () => database,
    getSupabaseEnvStatus: () => ({ isConfigured: true, supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL }),
    getAuthenticatedUser: async request => { const value = request.headers.get("authorization");
      return { user: value === "Bearer offline-owner-token" ? { id: OWNER } : value === "Bearer offline-other-token" ? { id: OTHER } : null }; }
  };
  const modules = new Map();
  function load(name) {
    if (modules.has(name)) return modules.get(name);
    const source = fs.readFileSync(path.join(repo, "apps/web/lib", name + ".ts"), "utf8");
    const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
    const module = { exports: {} }; modules.set(name, module.exports);
    new Function("require", "module", "exports", compiled)(id => {
      if (id === "server-only") return {};
      if (id === "./supabase-server") return supabaseBoundary;
      if (id === "./stripe-sdk-gateway" && name === "billing-runtime") { const sdk = load("stripe-sdk-gateway"); return { ...sdk, createOfficialStripeGateway: config => { f.gatewayConstructions++; return sdk.createOfficialStripeGateway(config, { httpClient: f.httpClient }); } }; }
      return id.startsWith("./") ? load(id.slice(2)) : webRequire(id);
    }, module, module.exports);
    modules.set(name, module.exports); return module.exports;
  }
  f.runtime = load("billing-runtime"); f.handlers = f.runtime.billingHandlers;
  f.requestId = randomUUID();
  f.request = (endpoint, body, token = "offline-owner-token", headers = {}) => new Request(origin + "/api/billing/" + endpoint, {
    method: body === undefined ? "GET" : "POST", headers: { Authorization: "Bearer " + token, Origin: origin, ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers },
    ...(body === undefined ? {} : { body: typeof body === "string" || body instanceof Uint8Array ? body : JSON.stringify(body) })
  });
  f.checkout = (extra = {}, token) => f.handlers.checkout(f.request("checkout", { offerKey: "profile_1", requestId: f.requestId, ...extra }, token));
  f.status = (orderId, token) => f.handlers.status(f.request("status" + (orderId ? "?orderId=" + orderId : ""), undefined, token));
  f.session = () => [...f.sessions.values()][0];
  f.paid = () => { const session = f.session(); session.status = "complete"; session.payment_status = "paid"; session.payment_intent = "pi_offline";
    f.payment = { id: "pi_offline", object: "payment_intent", livemode: false, customer: session.customer, metadata: clone(session.metadata), status: "succeeded", amount: session.amount_total,
      amount_received: session.amount_total, currency: "usd", latest_charge: "ch_offline" };
    f.charge = { id: "ch_offline", object: "charge", livemode: false, customer: session.customer, payment_intent: f.payment.id, status: "succeeded", paid: true, captured: true,
      amount: session.amount_total, amount_captured: session.amount_total, currency: "usd", amount_refunded: 0, disputed: false }; };
  f.webhook = async ({ id = "evt_offline", type = "checkout.session.completed", objectId = f.session()?.id, patch = {}, tamper = false } = {}) => {
    const event = { id, object: "event", type, livemode: false, api_version: configuredEnv.STRIPE_WEBHOOK_API_VERSION, data: { object: { id: objectId, description: "Offline Café 🎸" } }, ...patch };
    const raw = " \n" + JSON.stringify(event) + "\n", signature = Stripe.webhooks.generateTestHeaderString({ payload: raw, secret });
    const bytes = new TextEncoder().encode(raw + (tamper ? " " : ""));
    return f.handlers.webhook(f.request("webhook", bytes, "unused", { "stripe-signature": signature }));
  };
  return f;
}

async function seedOwned(n = 5) {
  for (let i = 0; i < n; i++) { const code = "QRG-OFFLINE" + String(i).padStart(3, "0");
    await db.query("insert into guitars(owner_id,qr_code,permanent_path,name,brand) values($1,$2,$3,'Offline guitar','Fixture')", [OWNER, code, "/i/" + code]); }
}
async function newProfile() {
  const upload = "upload-" + randomUUID(), key = "create-" + randomUUID(), photo = OWNER + "/profile-uploads/" + upload + "/image-" + randomUUID() + ".jpg";
  await db.query("insert into storage.objects(bucket_id,name,metadata) values('instrument-media',$1,'{\"size\":100,\"mimetype\":\"image/jpeg\"}')", [photo]);
  await directRpc("register_staged_instrument_upload", { p_owner_id: OWNER, p_upload_id: upload, p_bucket_id: "instrument-media", p_storage_path: photo });
  return { p_owner_id: OWNER, p_idempotency_key: key, p_upload_id: upload, p_launch_testing_access: false, p_owner_display_name: "Offline owner", p_billing_environment: "test",
    p_payload: { guitar: { name: "Offline guitar", brand: "Fixture", model: "Instrument", year: null, serial_number: null, builder: null, location: null, visibility: "private", summary: "", hero_image_path: photo },
      media: [{ storage_path: photo, alt: "Offline photo", sort_order: 0 }], documents: [], specs: [], service: null, show_serial_public: false, owner_name: "" } };
}
async function counts() { return (await db.query("select (select count(*) from billing_orders)::integer orders,(select count(*) from billing_credit_grants)::integer grants,(select count(*) from billing_credit_consumptions)::integer uses,(select count(*) from billing_receipts)::integer receipts,(select count(*) from guitars)::integer profiles")).rows[0]; }
async function response(response, expected = 200) { const body = await response.json(); assert.equal(response.status, expected, JSON.stringify(body)); return body; }
const tests = [];
const test = (name, run) => tests.push({ name, run });

test("authenticated HTTP -> durable SQL order -> real SDK Checkout -> signed webhook -> one grant -> sixth Profile consumes once", async () => {
  await seedOwned(); const f = fixture();
  const offers = await response(await f.handlers.offers()); assert.deepEqual(offers.offers.map(value => [value.amount, value.credits]), [[1200, 1], [5000, 10], [9900, 25]]);
  const checkout = await response(await f.checkout()); assert.equal(checkout.status, "checkout");
  assert.deepEqual(await counts(), { orders: 1, grants: 0, uses: 0, receipts: 0, profiles: 5 });
  const before = await response(await f.status(checkout.orderId)); assert.equal(before.paidAvailable, 0); assert.equal(before.ownedProfiles, 5);
  assert.deepEqual(before.unresolvedOrder, { orderId: checkout.orderId, requestId: f.requestId, offerKey: "profile_1", status: "open" });
  assert.doesNotMatch(JSON.stringify(before), /cus_|cs_test_|pi_|price_|ownerId|requestKey/);
  f.paid(); assert.equal((await response(await f.webhook())).status, "fulfilled");
  const profile = await newProfile(), created = await directRpc("create_instrument_profile", profile); assert.equal(created.ok, true);
  assert.equal((await directRpc("create_instrument_profile", profile)).qrCode, created.qrCode);
  const after = await response(await f.status(checkout.orderId)); assert.equal(after.paidGranted, 1); assert.equal(after.paidConsumed, 1); assert.equal(after.paidAvailable, 0); assert.equal(after.ownedProfiles, 6);
  await response(await f.webhook()); await response(await f.webhook({ id: "evt_later_success", type: "checkout.session.async_payment_succeeded" }));
  await response(await f.webhook({ id: "evt_old_failure", type: "checkout.session.async_payment_failed" })); await response(await f.webhook({ id: "evt_old_expiry", type: "checkout.session.expired" }));
  assert.equal((await counts()).grants, 1); assert.equal((await counts()).uses, 1); assert.equal((await counts()).profiles, 6);
  const exhausted = await newProfile(); await assert.rejects(directRpc("create_instrument_profile", exhausted), error => error.code === "QG001");
});
test("unpaid completion grants zero; later current paid evidence grants exactly once", async () => {
  const f = fixture(); await response(await f.checkout()); f.session().status = "complete";
  assert.equal((await response(await f.webhook())).status, "processing"); assert.equal((await counts()).grants, 0);
  f.paid(); await response(await f.webhook({ id: "evt_delayed", type: "checkout.session.async_payment_succeeded" })); assert.equal((await counts()).grants, 1);
});
test("client owner/amount/environment tampering and unauthenticated checkout never reserve SQL or call Stripe", async () => {
  const f = fixture();
  for (const extra of [{ ownerId: OTHER }, { amount: 1 }, { environment: "live" }]) await response(await f.checkout(extra), 400);
  await response(await f.checkout({}, "invalid-token"), 401);
  assert.equal((await counts()).orders, 0); assert.equal(f.trace.length, 0);
});
test("other authenticated owner cannot read or resume this durable purchase", async () => {
  const f = fixture(), checkout = await response(await f.checkout());
  await response(await f.status(checkout.orderId, "offline-other-token"), 404);
  const status = await response(await f.status(undefined, "offline-other-token")); assert.equal(status.unresolvedOrder, null); assert.equal(status.paidGranted, 0);
});
test("tampered signed bytes fail before any SQL receipt or Stripe retrieval", async () => {
  const f = fixture(); await response(await f.checkout()); f.paid(); const trace = f.trace.length;
  await response(await f.webhook({ tamper: true }), 400); assert.equal(f.trace.length, trace); assert.equal((await counts()).receipts, 0);
});
test("signed wrong payment environment, wrong owner metadata, and wrong amount cannot grant", async () => {
  const f = fixture(); await response(await f.checkout()); f.paid();
  await response(await f.webhook({ patch: { livemode: true } }), 503);
  f.session().metadata.qrguitar_owner_id = OTHER; await response(await f.webhook(), 404); f.session().metadata.qrguitar_owner_id = OWNER;
  f.payment.amount_received = 1199; await response(await f.webhook(), 503); assert.equal((await counts()).grants, 0);
});
test("real SQL transaction failure rolls back receipt/grant; provider event retry succeeds once", async () => {
  const f = fixture(); await response(await f.checkout()); f.paid();
  await db.exec("create function public.offline_fail_grant() returns trigger language plpgsql as $$ begin raise exception 'offline database failure' using errcode='XX000'; end $$; create trigger offline_fail_grant before insert on billing_credit_grants for each row execute function public.offline_fail_grant()");
  await response(await f.webhook(), 503); assert.equal((await counts()).grants, 0); assert.equal((await counts()).receipts, 0);
  await db.exec("drop trigger offline_fail_grant on billing_credit_grants; drop function public.offline_fail_grant()");
  await response(await f.webhook()); await response(await f.webhook()); assert.equal((await counts()).grants, 1);
});
test("lost post-commit SQL response returns retryable error and exact retry cannot grant twice", async () => {
  const f = fixture(); await response(await f.checkout()); f.paid(); f.loseRpcReply = "billing_fulfill_order";
  await response(await f.webhook(), 503); assert.equal((await counts()).grants, 1); await response(await f.webhook()); assert.equal((await counts()).grants, 1);
});
test("unknown Stripe create response retains one durable order and resumes exact idempotent Checkout", async () => {
  const f = fixture(); f.createFailureReplies = 2; await response(await f.checkout(), 503);
  const status = await response(await f.status()); assert.equal(status.unresolvedOrder.requestId, f.requestId); assert.equal(status.unresolvedOrder.status, "reserved");
  assert.equal(f.sessions.size, 1); await response(await f.checkout()); assert.equal(f.sessions.size, 1); assert.equal((await counts()).orders, 1);
  const calls = f.trace.filter(value => value.route === "/v1/checkout/sessions" && value.method === "POST"); assert.ok(calls.length >= 3); assert.ok(calls.every(value => value.body === calls[0].body));
});
test("refund detected on current payment holds credits before grant and SQL create reports QG008", async () => {
  await seedOwned(); const f = fixture(); await response(await f.checkout()); f.paid(); f.charge.amount_refunded = 100;
  assert.equal((await response(await f.webhook())).status, "review");
  const status = await response(await f.status()); assert.equal(status.paidGranted, 1); assert.equal(status.hold, true); assert.equal(status.paidAvailable, 0);
  const profile = await newProfile(); await assert.rejects(directRpc("create_instrument_profile", profile), error => error.code === "QG008");
  assert.equal((await counts()).uses, 0); assert.equal((await counts()).profiles, 5);
});
test("runtime cannot use test mode against production or an unapproved sandbox database", async () => {
  const f = fixture();
  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://qvoruycxxrbarlafvhbi.supabase.co";
    assert.equal(f.runtime.getBillingService(), null); assert.deepEqual((await response(await f.handlers.offers())).offers, []); await response(await f.checkout(), 503);
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://different-sandbox.supabase.co"; assert.equal(f.runtime.getBillingService(), null);
  } finally { process.env.NEXT_PUBLIC_SUPABASE_URL = configuredEnv.NEXT_PUBLIC_SUPABASE_URL; }
  assert.equal(f.trace.length, 0); assert.equal((await counts()).orders, 0);
});
test("Stripe live config on test database hides offers and rejects checkout/status before writes", async () => {
  const f = fixture();
  try {
    process.env.STRIPE_ENVIRONMENT = "live"; process.env.STRIPE_SECRET_KEY = "sk_live_synthetic_offline_only";
    assert.deepEqual((await response(await f.handlers.offers())).offers, []);
    assert.equal((await response(await f.checkout(), 503)).code, "billing_environment_mismatch"); await response(await f.status(), 503);
  } finally { process.env.STRIPE_ENVIRONMENT = configuredEnv.STRIPE_ENVIRONMENT; process.env.STRIPE_SECRET_KEY = configuredEnv.STRIPE_SECRET_KEY; }
  assert.equal(f.trace.filter(value => value.kind === "stripe").length, 0); assert.equal((await counts()).orders, 0);
});
test("locked authoritative SQL account cannot purchase even with a valid fixture Auth token", async () => {
  await db.query("update profiles set account_status='locked' where id=$1", [OWNER]); const f = fixture();
  await response(await f.checkout(), 403); assert.equal((await counts()).orders, 0); assert.equal(f.trace.length, 0);
});
test("already-linked expired unpaid Checkout reconciles while the account is temporarily locked", async () => {
  const f = fixture(); await response(await f.checkout()); f.session().status = "expired";
  await db.query("update profiles set account_status='locked' where id=$1", [OWNER]);
  assert.equal((await response(await f.webhook({ type: "checkout.session.expired" }))).status, "expired");
  assert.equal((await counts()).grants, 0); assert.equal((await response(await f.status())).unresolvedOrder, null);
});
test("lost Checkout link plus locked account can still reconcile verified expired unpaid Session", async () => {
  const f = fixture(); f.createFailureReplies = 2; await response(await f.checkout(), 503);
  assert.equal((await response(await f.status())).unresolvedOrder.status, "reserved"); assert.equal(f.sessions.size, 1);
  await db.query("update profiles set account_status='locked' where id=$1", [OWNER]); f.session().status = "expired";
  assert.equal((await response(await f.webhook({ type: "checkout.session.expired" }))).status, "expired");
  assert.equal((await counts()).grants, 0); assert.equal((await response(await f.status())).unresolvedOrder, null);
});
test("unknown Checkout beyond the idempotency retention window only discovers the existing Session", async () => {
  const f = fixture(); f.createFailureReplies = 2; await response(await f.checkout(), 503);
  const writes = f.trace.filter(value => value.kind === "stripe" && value.method === "POST").length, originalNow = Date.now;
  try {
    Date.now = () => originalNow() + 25 * 60 * 60 * 1000;
    assert.equal((await response(await f.checkout())).status, "checkout");
  } finally { Date.now = originalNow; }
  assert.equal(f.trace.filter(value => value.kind === "stripe" && value.method === "POST").length, writes);
  assert.ok(f.trace.some(value => value.route === "/v1/checkout/sessions" && value.method === "GET")); assert.equal((await counts()).orders, 1); assert.equal(f.sessions.size, 1);
});
test("missing test app origin closes new purchases while old signed payment reconciliation and status still work", async () => {
  const f = fixture(), checkout = await response(await f.checkout()); f.paid(); const before = f.trace.filter(value => value.kind === "stripe").length;
  try {
    delete process.env.QRGUITAR_BILLING_TEST_APP_URL;
    assert.deepEqual((await response(await f.handlers.offers())).offers, []); await response(await f.checkout(), 503);
    assert.equal(f.trace.filter(value => value.kind === "stripe").length, before);
    await response(await f.webhook()); assert.equal((await response(await f.status(checkout.orderId))).paidAvailable, 1);
  } finally { process.env.QRGUITAR_BILLING_TEST_APP_URL = configuredEnv.QRGUITAR_BILLING_TEST_APP_URL; }
});
test("removing payment keys leaves authenticated real ledger status readable without constructing Stripe", async () => {
  const purchase = fixture(), checkout = await response(await purchase.checkout()); purchase.paid(); await response(await purchase.webhook());
  const missing = Object.keys(configuredEnv).filter(key => (key.startsWith("STRIPE_") && key !== "STRIPE_ENVIRONMENT") || key === "QRGUITAR_BILLING_ENABLED");
  try {
    missing.forEach(key => delete process.env[key]); const f = fixture();
    const status = await response(await f.status(checkout.orderId)); assert.equal(status.paidGranted, 1); assert.equal(status.order.status, "fulfilled"); assert.equal(status.environment, "test");
    await response(await f.status(checkout.orderId, "offline-other-token"), 404);
    await response(await f.status(undefined, "invalid-token"), 401);
    assert.deepEqual((await response(await f.handlers.offers())).offers, []); await response(await f.checkout(), 503);
    await response(await f.webhook({ objectId: "cs_test_offline" }), 503);
    assert.equal(f.gatewayConstructions, 0); assert.equal(f.trace.filter(value => value.kind === "stripe").length, 0);
    assert.equal((await counts()).orders, 1); assert.equal((await counts()).grants, 1);
  } finally { missing.forEach(key => process.env[key] = configuredEnv[key]); }
});

for (const plan of ["business", "enterprise"]) test("protected " + plan + " plan blocks unnecessary direct checkout before any order or provider call", async () => {
  await db.query("update profiles set plan=$1 where id=$2", [plan, OWNER]);
  const f = fixture(), result = await response(await f.checkout(), 409);
  assert.equal(result.code, "profile_access_included");
  assert.equal((await counts()).orders, 0); assert.equal(f.gatewayConstructions, 0);
  assert.equal((await response(await f.status())).commercialExempt, true);
});

let passed = 0;
try {
  for (const { name, run } of tests) {
    await db.exec("begin");
    try { await run(); passed++; console.log("PASS " + name); }
    catch (error) { console.error("FAIL " + name); throw error; }
    finally { await db.exec("rollback"); }
  }
  console.log(JSON.stringify({ passed, failed: 0, database: "real PGlite SQL", sdk: Stripe.PACKAGE_VERSION, externalRequests: 0, sourceDigests }));
} finally {
  await db.close(); globalThis.fetch = savedFetch;
  for (const [key, value] of Object.entries(originalEnv)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
}
