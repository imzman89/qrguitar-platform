import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { test } from "node:test";

const require = createRequire(import.meta.url), ts = require("typescript");
const source = fs.readFileSync(new URL("../app/.well-known/apple-developer-merchantid-domain-association/route.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function handler(environment = {}) {
  const module = { exports: {} };
  const env = new Proxy(environment, { get(target, key) { assert.ok(["PAYPAL_ENVIRONMENT", "QRGUITAR_BILLING_ENVIRONMENT"].includes(key), "Association must not read secrets or other configuration"); return target[key]; } });
  new Function("require", "module", "exports", "process", "fetch", code)(() => { throw new Error("Association route must not import runtime dependencies"); }, module, module.exports, { env }, () => { throw new Error("Association route must not fetch"); });
  return module.exports;
}
async function verify(response, sandbox = false) {
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/octet-stream");
  assert.equal(response.headers.get("content-length"), "9094");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("location"), null);
  assert.equal(response.headers.get("set-cookie"), null);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.length, 9094);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), sandbox ? "5b972a09172f34fe71b19d306b0c0c11b2071013175063fa8f154849c099302a" : "cdb19c18ab558f50994fb98413eaad9d495b552a2fdf07505e4fb4f5777e4969");
}
test("Live Apple Pay association serves the exact approved provider bytes as binary without redirect", async () => {
  const route = handler();
  assert.equal(route.runtime, "nodejs");
  assert.equal(route.dynamic, "force-dynamic");
  await verify(route.GET());
});
test("verification bytes require no authentication and cannot be changed by query or headers", async () => {
  const route = handler();
  const request = new Request("https://www.qrguitar.com/.well-known/apple-developer-merchantid-domain-association?environment=test&merchantId=untrusted", {
    headers: { authorization: "Bearer fixture-only", cookie: "qrguitar_site_preview=fixture", "x-forwarded-host": "untrusted.invalid" }
  });
  await verify(route.GET(request));
});
test("repeated verification requests return complete identical bytes", async () => {
  const route = handler();
  await verify(route.GET());
  await verify(route.GET());
});
test("Sandbox association requires both exact server test settings", async () => {
  await verify(handler({ PAYPAL_ENVIRONMENT: "test", QRGUITAR_BILLING_ENVIRONMENT: "test" }).GET(), true);
  for (const environment of [
    { PAYPAL_ENVIRONMENT: "test" }, { QRGUITAR_BILLING_ENVIRONMENT: "test" },
    { PAYPAL_ENVIRONMENT: "test", QRGUITAR_BILLING_ENVIRONMENT: "live" },
    { PAYPAL_ENVIRONMENT: "live", QRGUITAR_BILLING_ENVIRONMENT: "test" },
    { PAYPAL_ENVIRONMENT: "TEST", QRGUITAR_BILLING_ENVIRONMENT: "test" },
    { PAYPAL_ENVIRONMENT: "test", QRGUITAR_BILLING_ENVIRONMENT: "invalid" },
    { PAYPAL_ENVIRONMENT: "live", QRGUITAR_BILLING_ENVIRONMENT: "live" }
  ]) await verify(handler(environment).GET());
});
test("request parameters cannot switch Sandbox to Live and mode changes do not reuse cached bytes", async () => {
  const env = { PAYPAL_ENVIRONMENT: "test", QRGUITAR_BILLING_ENVIRONMENT: "test" }, route = handler(env);
  await verify(route.GET(new Request("https://sandbox.example.test/.well-known/apple-developer-merchantid-domain-association?environment=live", { headers: { "x-forwarded-host": "www.qrguitar.com" } })), true);
  env.PAYPAL_ENVIRONMENT = "live";
  await verify(route.GET());
});
