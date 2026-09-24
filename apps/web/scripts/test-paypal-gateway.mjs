import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, "../../..");
const require = createRequire(path.join(root, "package.json")), ts = require("typescript"), modules = new Map();
function load(name) {
  if (modules.has(name)) return modules.get(name);
  const filename = path.join(root, "apps/web/lib", name + ".ts"), js = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} }; modules.set(name, module.exports);
  new Function("require", "module", "exports", js)(id => id === "server-only" ? {} : id.startsWith("./") ? load(id.slice(2)) : require(id), module, module.exports);
  modules.set(name, module.exports); return module.exports;
}
const { createPayPalGateway } = load("paypal-gateway");
const ORDER = "11111111-1111-4111-8111-111111111111", PAYPAL = "5O190127TN364715T", MERCHANT = "ABCDEFGHIJKLM";
const offer = { key: "profile_1", version: 1, currency: "usd", amount: 1200, credits: 1, permanent: true, freeAllowance: 5 };
const config = { enabled: true, environment: "test", clientId: "CLIENT_ID_123456", secret: "fixture-secret", merchantId: MERCHANT,
  webhookId: "WH-FIXTURE", merchantName: "QRguitar", origin: "https://fixture.invalid", applePayEnabled: false };
const response = (value, status = 200) => new Response(typeof value === "string" ? value : JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
let passed = 0;
async function check(name, fn) { await fn(); passed++; console.log("PASS " + name); }
const rejects = (promise, code) => assert.rejects(promise, error => { assert.equal(error.code, code); return true; });
function sequence(values, seen = []) {
  return { seen, fetch: async (url, init) => { seen.push({ url, init }); const next = values.shift(); if (!next) throw new Error("Unexpected fetch"); return typeof next === "function" ? next(url, init) : next; } };
}

await check("creates an exact own-merchant order through sandbox with one OAuth token", async () => {
  const stub = sequence([response({ access_token: "ACCESS_TOKEN", expires_in: 3600 }), response({ id: PAYPAL, status: "CREATED" })]);
  const gateway = createPayPalGateway(config, stub.fetch);
  assert.equal((await gateway.createOrder({ orderId: ORDER, offer })).id, PAYPAL);
  assert.equal(stub.seen[0].url, "https://api-m.sandbox.paypal.com/v1/oauth2/token");
  assert.equal(stub.seen[0].init.redirect, "error"); assert.equal(stub.seen[0].init.cache, "no-store");
  const request = stub.seen[1], body = JSON.parse(request.init.body);
  assert.equal(request.url, "https://api-m.sandbox.paypal.com/v2/checkout/orders");
  assert.equal(request.init.headers["PayPal-Request-Id"], "qgc-11111111111141118111111111111111"); assert.ok(Buffer.byteLength(request.init.headers["PayPal-Request-Id"]) <= 38); assert.equal(request.init.headers.Prefer, "return=representation");
  assert.equal(body.purchase_units.length, 1); assert.equal(body.purchase_units[0].payee.merchant_id, MERCHANT);
  assert.equal(body.purchase_units[0].reference_id, ORDER); assert.equal(body.purchase_units[0].custom_id, ORDER); assert.equal(body.purchase_units[0].invoice_id, `QRG-${ORDER}`);
  assert.deepEqual(body.purchase_units[0].amount, { currency_code: "USD", value: "12.00" });
  assert.equal(body.application_context.return_url, `https://fixture.invalid/billing/paypal/return?orderId=${ORDER}`);
});

await check("capture uses a deterministic retry key and an empty JSON object", async () => {
  const stub = sequence([response({ access_token: "ACCESS_TOKEN", expires_in: 3600 }), response({ id: PAYPAL, status: "COMPLETED" })]);
  await createPayPalGateway(config, stub.fetch).captureOrder(PAYPAL, ORDER);
  assert.equal(stub.seen[1].init.headers["PayPal-Request-Id"], "qgp-11111111111141118111111111111111"); assert.ok(Buffer.byteLength(stub.seen[1].init.headers["PayPal-Request-Id"]) <= 38); assert.equal(stub.seen[1].init.body, "{}");
});

await check("instrument declines produce the only restartable public error", async () => {
  const stub = sequence([response({ access_token: "ACCESS_TOKEN", expires_in: 3600 }), response({ details: [{ issue: "INSTRUMENT_DECLINED" }] }, 422)]);
  await rejects(createPayPalGateway(config, stub.fetch).captureOrder(PAYPAL, ORDER), "instrument_declined");
});

await check("malformed token values and nonfinite expiries fail closed", async () => {
  for (const token of ["", " ", "BAD\nTOKEN"]) {
    const stub = sequence([response({ access_token: token, expires_in: 3600 })]);
    await rejects(createPayPalGateway(config, stub.fetch).getOrder(PAYPAL), "paypal_unavailable");
  }
  const stub = sequence([response('{"access_token":"ACCESS_TOKEN","expires_in":1e999}')]);
  await rejects(createPayPalGateway(config, stub.fetch).getOrder(PAYPAL), "paypal_unavailable");
});

await check("order and capture IDs reject characters or lengths outside the ledger contract", async () => {
  const gateway = createPayPalGateway(config, async () => { throw new Error("must not fetch"); });
  for (const id of ["abcd1", "ABC-123", "ABC_123", "ABCD", "A".repeat(65)]) await rejects(Promise.resolve().then(() => gateway.getOrder(id)), "paypal_unavailable");
});

await check("dispute IDs accept the documented hyphenated 255-character boundary", async () => {
  const id = "A" + "-".repeat(253) + "Z", stub = sequence([response({ access_token: "ACCESS_TOKEN", expires_in: 3600 }), response({ dispute_id: id })]);
  assert.equal((await createPayPalGateway(config, stub.fetch).getDispute(id)).dispute_id, id);
  assert.match(stub.seen[1].url, /\/v1\/customer\/disputes\//);
});

await check("webhook verification forwards all signed transport fields and requires SUCCESS", async () => {
  const stub = sequence([response({ access_token: "ACCESS_TOKEN", expires_in: 3600 }), response({ verification_status: "SUCCESS" })]);
  const event = { id: "WH123", event_type: "PAYMENT.CAPTURE.COMPLETED" }, headers = {
    "paypal-auth-algo": "SHA256withRSA", "paypal-cert-url": "https://api.paypal.com/cert.pem", "paypal-transmission-id": "T1",
    "paypal-transmission-sig": "signature", "paypal-transmission-time": "2026-09-18T00:00:00Z"
  };
  assert.equal(await createPayPalGateway(config, stub.fetch).verifyWebhook(event, headers), true);
  const body = JSON.parse(stub.seen[1].init.body); assert.equal(body.webhook_id, config.webhookId); assert.deepEqual(body.webhook_event, event); assert.equal(body.transmission_id, "T1");
});

await check("webhook verification preserves the original event JSON subtree", async () => {
  const stub = sequence([response({ access_token: "ACCESS_TOKEN", expires_in: 3600 }), response({ verification_status: "SUCCESS" })]);
  const raw = '{ "resource" : { "amount" : 1.00 }, "id" : "WH123" }', event = JSON.parse(raw), headers = {
    "paypal-auth-algo": "SHA256withRSA", "paypal-cert-url": "https://api.paypal.com/cert.pem", "paypal-transmission-id": "T1",
    "paypal-transmission-sig": "signature", "paypal-transmission-time": "2026-09-18T00:00:00Z"
  };
  assert.equal(await createPayPalGateway(config, stub.fetch).verifyWebhook(event, headers, raw), true);
  assert.ok(stub.seen[1].init.body.endsWith(`,"webhook_event":${raw}}`)); assert.ok(stub.seen[1].init.body.includes("1.00"));
});

await check("oversized provider responses fail without exposing their body", async () => {
  const stub = sequence([new Response("{}", { status: 200, headers: { "content-length": String(1024 * 1024 + 1) } })]);
  await rejects(createPayPalGateway(config, stub.fetch).getOrder(PAYPAL), "paypal_unavailable");
});

console.log(`Automatic PayPal gateway: ${passed} checks passed.`);
