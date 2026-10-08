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
const { createPayPalHandlers } = load("paypal-http"), { BillingError } = load("billing-service");
const ORDER = "11111111-1111-4111-8111-111111111111";
let passed = 0;
async function check(name, fn) { await fn(); passed++; console.log("PASS " + name); }
const body = async response => ({ response, json: await response.json() });
function fixture(overrides = {}) {
  const calls = [], service = {
    async status(_request, orderId) { calls.push(["status", orderId]); return { orderId }; },
    async create(_request, value) { calls.push(["create", value]); return { orderId: ORDER }; },
    async capture(_request, value) { calls.push(["capture", value]); return { order: value }; },
    async reconcile(_request, value) { calls.push(["reconcile", value]); return { order: value }; }, ...overrides
  };
  return { calls, handlers: createPayPalHandlers({ service: () => service, bodyTimeoutMs: 20 }) };
}
const post = (path, value, headers = {}) => new Request(`https://www.qrguitar.com${path}`, { method: "POST", headers: { "content-type": "application/json", origin: "https://www.qrguitar.com", ...headers }, body: typeof value === "string" ? value : JSON.stringify(value) });

await check("status accepts only one optional local order query and is never cached", async () => {
  const f = fixture(), ok = await body(await f.handlers.status(new Request(`https://www.qrguitar.com/api/billing/paypal/status?orderId=${ORDER}`)));
  assert.equal(ok.response.status, 200); assert.equal(ok.response.headers.get("cache-control"), "no-store, no-cache, must-revalidate"); assert.equal(ok.response.headers.get("vary"), "Authorization"); assert.equal(ok.json.ok, true); assert.equal(f.calls[0][1], ORDER);
  for (const query of ["?other=x", `?orderId=${ORDER}&orderId=${ORDER}`]) assert.equal((await f.handlers.status(new Request("https://www.qrguitar.com/api/billing/paypal/status" + query))).status, 400);
});

await check("create forwards only parsed JSON through the authenticated service boundary", async () => {
  const f = fixture(), input = { offerKey: "profile_10", requestId: ORDER }, result = await body(await f.handlers.create(post("/api/billing/paypal/create", input)));
  assert.equal(result.response.status, 200); assert.equal(result.json.ok, true); assert.deepEqual(f.calls[0], ["create", input]);
});

await check("cross-site, non-JSON and encoded browser mutations fail before service", async () => {
  const f = fixture();
  assert.equal((await f.handlers.capture(post("/api/billing/paypal/capture", { orderId: ORDER }, { origin: "https://evil.invalid" }))).status, 403);
  assert.equal((await f.handlers.capture(new Request("https://www.qrguitar.com/api/billing/paypal/capture", { method: "POST", headers: { "content-type": "text/plain" }, body: "{}" }))).status, 415);
  assert.equal((await f.handlers.capture(post("/api/billing/paypal/capture", { orderId: ORDER }, { "content-encoding": "gzip" }))).status, 415);
  assert.equal(f.calls.length, 0);
});

await check("invalid and oversized bodies are bounded", async () => {
  const f = fixture();
  assert.equal((await f.handlers.reconcile(post("/api/billing/paypal/reconcile", "{"))).status, 400);
  assert.equal((await f.handlers.reconcile(post("/api/billing/paypal/reconcile", JSON.stringify({ data: "x".repeat(5000) })))).status, 413);
  assert.equal(f.calls.length, 0);
});

await check("service errors expose only reviewed public messages", async () => {
  const f = fixture({ async capture() { throw new BillingError(409, "payment_not_approved", "Finish approving your payment in PayPal."); } });
  const result = await body(await f.handlers.capture(post("/api/billing/paypal/capture", { orderId: ORDER })));
  assert.equal(result.response.status, 409); assert.deepEqual(result.json, { ok: false, code: "payment_not_approved", message: "Finish approving your payment in PayPal." });
});

await check("missing runtime configuration fails closed", async () => {
  const handlers = createPayPalHandlers({ service: () => null }); const result = await body(await handlers.status(new Request("https://www.qrguitar.com/api/billing/paypal/status")));
  assert.equal(result.response.status, 503); assert.equal(result.json.code, "billing_disabled");
});

console.log(`Automatic PayPal HTTP boundary: ${passed} checks passed.`);
