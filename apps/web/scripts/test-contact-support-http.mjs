import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url), ts = require("typescript");
const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function load(relative, dependencies = {}, environment = {}) {
  const module = { exports: {} };
  const result = ts.transpileModule(fs.readFileSync(path.join(web, relative), "utf8"), { fileName: relative, reportDiagnostics: true, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  assert.equal((result.diagnostics || []).filter(item => item.category === ts.DiagnosticCategory.Error).length, 0);
  new Function("require", "module", "exports", "process", "fetch", result.outputText)(name => {
    if (name in dependencies) return dependencies[name];
    throw new Error(`Unexpected dependency ${name}`);
  }, module, module.exports, { env: environment }, () => { throw new Error("Live network forbidden in tests"); });
  return module.exports;
}
const helper = load("lib/support-email-draft.ts");
const renderer = load("lib/transactional-email-renderer.ts");
const bounded = load("lib/bounded-json-body.ts");
const { createContactSupportHandler } = load("lib/contact-support-http.ts", {
  "node:crypto": crypto, "./support-email-draft": helper, "./transactional-email-renderer": renderer, "./bounded-json-body": bounded
});
const accepted = { ok: true, status: "sent", outcome: "accepted", providerMessageId: "synthetic-receipt", message: "Synthetic accepted" };
const input = { name: "Synthetic tester", email: "fixture@example.invalid", topic: "Profile", message: "Synthetic support request", website: "", idempotencyKey: "b93276e0-471a-4a2d-8b20-3df1c3d8d389" };
function request(body = input, headers = {}, method = "POST") {
  return new Request("https://www.qrguitar.com/api/contact", { method, headers: { origin: "https://www.qrguitar.com", "sec-fetch-site": "same-origin", "content-type": "application/json", ...headers }, ...(method === "GET" ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }) });
}
function fixture(delivery = accepted, options = {}) {
  const calls = [];
  const handler = createContactSupportHandler({ ...options, deliver: async (...args) => { calls.push(args); return typeof delivery === "function" ? delivery(...args) : delivery; } });
  return { handler, calls };
}
test("public contact passes fixed recipient, escaped full message and opaque operation ID to existing transport", async () => {
  const h = fixture();
  const body = { ...input, name: "<img src=x onerror=fixture>", message: "<script>fixture</script> & 'quote'\nSecond line" };
  const response = await h.handler(request(body)), receipt = await response.json();
  assert.equal(response.status, 202); assert.deepEqual(receipt, { ok: true, code: "provider_accepted", outcome: "accepted", requestId: input.idempotencyKey });
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0][0], "support@qrguitar.com");
  const document = h.calls[0][1];
  assert.ok(document.htmlContent.includes("&lt;script&gt;fixture&lt;/script&gt;"));
  assert.ok(!document.htmlContent.includes("<script>fixture</script>"));
  assert.ok(document.textContent.includes(body.message)); assert.ok(document.textContent.includes(input.email));
  assert.equal(h.calls[0][2].idempotencyKey, input.idempotencyKey);
  assert.equal(response.headers.get("cache-control"), "no-store, no-cache, must-revalidate");
  assert.equal(receipt.providerMessageId, undefined);
});
for (const [name, result, status, outcome, code] of [
  ["configuration absent", { ok: false, status: "failed", outcome: "rejected", message: "Brevo delivery is not configured for application messages." }, 503, "rejected", "delivery_unavailable"],
  ["configuration invalid", { ok: false, status: "failed", outcome: "rejected", message: "Email delivery configuration is invalid." }, 503, "rejected", "delivery_unavailable"],
  ["provider rejects", { ok: false, status: "failed", outcome: "rejected", message: "synthetic reject" }, 502, "rejected", "provider_rejected"],
  ["receipt missing", { ok: true, status: "sent", outcome: "accepted", message: "synthetic missing receipt" }, 502, "unknown", "delivery_unconfirmed"],
  ["provider unknown", { ok: false, status: "failed", outcome: "unknown", message: "synthetic timeout" }, 502, "unknown", "delivery_unconfirmed"],
  ["transport throws", () => { throw new Error("synthetic transport failure"); }, 502, "unknown", "delivery_unconfirmed"]
]) {
  test(`HTTP truth: ${name}`, async () => {
    const h = fixture(result), response = await h.handler(request()), receipt = await response.json();
    assert.equal(response.status, status); assert.equal(receipt.ok, false); assert.equal(receipt.outcome, outcome); assert.equal(receipt.code, code);
    assert.equal(h.calls.length, 1);
    assert.ok(!JSON.stringify(receipt).includes("synthetic"));
  });
}
test("HTTP rejects missing/cross-site/sibling/null Origin and unsupported method before transport", async () => {
  const h = fixture();
  for (const headers of [{ origin: "" }, { origin: "null" }, { origin: "https://qrguitar.com" }, { origin: "https://other.invalid" }, { "sec-fetch-site": "cross-site" }]) assert.equal((await h.handler(request(input, headers))).status, 403);
  assert.equal((await h.handler(request(input, {}, "GET"))).status, 405); assert.equal(h.calls.length, 0);
});
test("HTTP rejects wrong content type, compressed body, forged length and malformed JSON", async () => {
  const h = fixture();
  assert.equal((await h.handler(request(input, { "content-type": "text/plain" }))).status, 415);
  assert.equal((await h.handler(request(input, { "content-encoding": "gzip" }))).status, 415);
  for (const value of ["-1", "invalid", "12001"]) assert.equal((await h.handler(request(input, { "content-length": value }))).status, 413);
  for (const body of ["{", "null", "[]", "42"]) assert.equal((await h.handler(request(body))).status, 400);
  assert.equal(h.calls.length, 0);
});
test("HTTP rejects real over-limit streamed bytes despite small declared length and cancels stalled bodies", async () => {
  const h = fixture(accepted, { bodyTimeoutMs: 15 });
  const huge = new Request("https://www.qrguitar.com/api/contact", { method: "POST", headers: { origin: "https://www.qrguitar.com", "content-type": "application/json", "content-length": "1" }, body: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("x".repeat(12001))); } }), duplex: "half" });
  assert.equal((await h.handler(huge)).status, 413);
  let cancelled = false;
  const slow = new Request("https://www.qrguitar.com/api/contact", { method: "POST", headers: { origin: "https://www.qrguitar.com", "content-type": "application/json" }, body: new ReadableStream({ cancel() { cancelled = true; } }), duplex: "half" });
  const response = await h.handler(slow); assert.equal(response.status, 408); await Promise.resolve(); assert.equal(cancelled, true); assert.equal(h.calls.length, 0);
});
test("HTTP rejects honeypot, missing/extra/spoofed transport controls, bad email, controls and field limits", async () => {
  const h = fixture();
  const cases = [{ ...input, website: "bot" }, { ...input, to: "other@example.invalid" }, { ...input, replyTo: "other@example.invalid" }, { ...input, idempotencyKey: "bad" }, { ...input, email: "fixture" }, { ...input, name: "a\r\nBcc:fixture" }, { ...input, topic: "a\nheader" }, { ...input, message: "\u0000" }, { ...input, message: " " }, { ...input, message: "a".repeat(1601) }, { ...input, name: "a".repeat(101) }, { ...input, email: 42 }];
  const { name, ...missing } = input; cases.push(missing);
  for (const body of cases) assert.equal((await h.handler(request(body))).status, 400);
  assert.equal(h.calls.length, 0);
});
test("HTTP maximum accepted fields are complete, not silently truncated by renderer", async () => {
  const h = fixture(); const body = { ...input, name: "n".repeat(100), email: "e".repeat(236) + "@example.invalid", topic: "t".repeat(160), message: "m".repeat(1600) };
  assert.equal((await h.handler(request(body))).status, 202);
  assert.ok(h.calls[0][1].textContent.includes(body.message)); assert.ok(h.calls[0][1].textContent.includes(body.email));
});
test("HTTP repeated/in-flight same operation dispatches once, changed body conflicts, unknown remains unknown", async () => {
  let release; const waiting = new Promise(done => { release = done; });
  const h = fixture(async () => { await waiting; return { ok: false, status: "failed", outcome: "unknown", message: "synthetic" }; });
  const one = h.handler(request()), two = h.handler(request());
  await new Promise(done => setTimeout(done, 10)); assert.equal(h.calls.length, 1); release();
  for (const response of await Promise.all([one, two])) { assert.equal(response.status, 502); assert.equal((await response.json()).outcome, "unknown"); }
  assert.equal((await h.handler(request({ ...input, message: "Changed" }))).status, 409);
  await h.handler(request()); assert.equal(h.calls.length, 1);
});
test("HTTP instance-local email and global quotas bound sends and reset, without trusting forwarded IP", async () => {
  let now = 1000; const h = fixture(accepted, { now: () => now });
  for (let i = 0; i < 3; i++) assert.equal((await h.handler(request({ ...input, idempotencyKey: crypto.randomUUID() }, { "x-forwarded-for": "synthetic-rotating" + i }))).status, 202);
  const denied = await h.handler(request({ ...input, idempotencyKey: crypto.randomUUID() })); assert.equal(denied.status, 429); assert.ok(Number(denied.headers.get("retry-after")) > 0); assert.equal(h.calls.length, 3);
  for (let i = 0; i < 17; i++) assert.equal((await h.handler(request({ ...input, email: `fixture${i}@example.invalid`, idempotencyKey: crypto.randomUUID() }))).status, 202);
  assert.equal((await h.handler(request({ ...input, email: "other@example.invalid", idempotencyKey: crypto.randomUUID() }))).status, 429); assert.equal(h.calls.length, 20);
  now += 3_600_001; assert.equal((await h.handler(request({ ...input, idempotencyKey: crypto.randomUUID() }))).status, 202);
});
test("real exported Brevo gateway uses existing sender/Reply-To only, with injected fetch and no live values", async () => {
  const transport = load("lib/transactional-email.ts", { "./content-registry": {}, "./transactional-email-renderer": renderer, "./site-settings-server": {} }, { BREVO_API_KEY: "synthetic-key", SMTP_FROM: "sender@example.invalid", SMTP_REPLY_TO: "reply@example.invalid" });
  const calls = [];
  const h = fixture((to, document, options) => transport.deliverBrevoEmail(to, document, { ...options, fetcher: async (url, init) => { calls.push({ url, init }); return Response.json({ messageId: "synthetic-receipt" }); } }));
  assert.equal((await h.handler(request())).status, 202);
  const payload = JSON.parse(calls[0].init.body);
  assert.deepEqual(payload.to, [{ email: "support@qrguitar.com" }]); assert.equal(payload.sender.email, "sender@example.invalid"); assert.equal(payload.replyTo.email, "reply@example.invalid");
  assert.ok(payload.textContent.includes(input.email)); assert.equal(calls.length, 1);
  const missing = load("lib/transactional-email.ts", { "./content-registry": {}, "./transactional-email-renderer": renderer, "./site-settings-server": {} });
  const unavailable = fixture((to, document, options) => missing.deliverBrevoEmail(to, document, options));
  assert.equal((await unavailable.handler(request())).status, 503);
});
test("route binds exactly the existing exported transport; no database, logs, autoreply or alternate vendor", () => {
  const route = fs.readFileSync(path.join(web, "app/api/contact/route.ts"), "utf8"), source = fs.readFileSync(path.join(web, "lib/contact-support-http.ts"), "utf8");
  assert.match(route, /createContactSupportHandler\(\{ deliver: deliverBrevoEmail \}\)/);
  assert.doesNotMatch(route + source, /console\.|supabase|\.from\(|\.rpc\(|writeFile|localStorage|sessionStorage|to:\s*input|replyTo:\s*input/);
});

const { NextRequest: ActualNextRequest } = require("next/server");
const { NextRequestAdapter } = require("next/dist/server/web/spec-extension/adapters/next-request");
const { addRequestMeta } = require("next/dist/server/request-meta");
function nextContact(url, headers = {}, body = input) {
  const target = new URL(url);
  return new ActualNextRequest(url, { method: "POST", headers: {
    origin: target.origin, host: target.host, "sec-fetch-site": "same-origin", "content-type": "application/json", ...headers
  }, body: JSON.stringify(body) });
}
function proxyContact(initURL, headers = {}) {
  // Original helper uses external HTTPS port55440 as Next port, while HTTP listens on55441.
  const nodeRequest = { method: "POST", url: "/api/contact", body: JSON.stringify(input), headers: {
    origin: "https://localhost:55440", host: "localhost:55440", "sec-fetch-site": "same-origin",
    "content-type": "application/json", "x-forwarded-host": "localhost:55440",
    "x-forwarded-proto": "https", "x-forwarded-port": "55440", ...headers
  } };
  addRequestMeta(nodeRequest, "initURL", initURL);
  return NextRequestAdapter.fromNodeNextRequest(nodeRequest, new AbortController().signal);
}
test("origin normalization: installed NextRequest preserves exact browser authority after normalization", async () => {
  for (const url of ["http://127.0.0.1:3004/api/contact", "http://[::1]:3004/api/contact", "https://127.0.0.1:55440/api/contact", "https://www.qrguitar.com/api/contact"]) {
    const h = fixture(), incoming = nextContact(url);
    if (new URL(url).hostname !== "www.qrguitar.com") {
      assert.equal(new URL(incoming.url).hostname, "localhost");
      assert.notEqual(incoming.headers.get("origin"), new URL(incoming.url).origin);
    }
    assert.equal((await h.handler(incoming)).status, 202, url);
    assert.equal(h.calls.length, 1); assert.equal(h.calls[0][0], "support@qrguitar.com");
  }
});
test("origin normalization: raw Origin Host protocol port and Fetch Metadata fail closed", async () => {
  const cases = [
    { origin: "" }, { origin: "null" }, { origin: "invalid" }, { origin: "http://127.0.0.1:3004/" },
    { origin: "http://user@127.0.0.1:3004" }, { origin: "http://127.0.0.1:3004?x=1" },
    { origin: "http://127.0.0.1:3004#x" }, { origin: "https://127.0.0.1:3004" },
    { origin: "http://127.0.0.1:3003", host: "127.0.0.1:3003" },
    { origin: "http://127.0.0.2:3004", host: "127.0.0.2:3004" },
    { origin: "http://127.0.0.1.evil.invalid:3004", host: "127.0.0.1.evil.invalid:3004" },
    { host: "" }, { host: "localhost:3004" }, { host: "[::1]:3004" },
    { host: "127.0.0.1:3004,evil.invalid" }, { host: "127.0.0.1:3004/" },
    { "sec-fetch-site": "cross-site" }, { "sec-fetch-site": "same-site" },
    { origin: "https://www.qrguitar.com", host: "www.qrguitar.com", "x-forwarded-host": "www.qrguitar.com", "x-forwarded-proto": "https" },
    { origin: "http://127.0.0.1:3004", host: "evil.invalid", "x-forwarded-host": "127.0.0.1:3004" }
  ];
  for (const headers of cases) {
    const h = fixture(), response = await h.handler(nextContact("http://127.0.0.1:3004/api/contact", headers));
    assert.equal(response.status, 403, JSON.stringify(headers));
    assert.equal((await response.json()).code, "origin_not_allowed"); assert.equal(h.calls.length, 0);
  }
  const missingOrigin = nextContact("http://127.0.0.1:3004/api/contact"); missingOrigin.headers.delete("origin");
  const missingHost = nextContact("http://127.0.0.1:3004/api/contact"); missingHost.headers.delete("host");
  for (const incoming of [missingOrigin, missingHost]) { const h = fixture(); assert.equal((await h.handler(incoming)).status, 403); assert.equal(h.calls.length, 0); }
  for (const site of ["none", "same-origin"]) { const h = fixture(); assert.equal((await h.handler(nextContact("http://127.0.0.1:3004/api/contact", { "sec-fetch-site": site }))).status, 202); }
  const noSite = nextContact("http://127.0.0.1:3004/api/contact"); noSite.headers.delete("sec-fetch-site");
  assert.equal((await fixture().handler(noSite)).status, 202);
});
test("origin normalization: original HTTPS proxy adapter does not trust forwarded authority or internal port", async () => {
  const incoming = proxyContact("https://localhost:55440/api/contact");
  assert.equal(incoming.url, "https://localhost:55440/api/contact");
  const h = fixture(); assert.equal((await h.handler(incoming)).status, 202); assert.equal(h.calls.length, 1);
  const ipv4 = proxyContact("https://localhost:55440/api/contact", { origin: "https://127.0.0.1:55440", host: "127.0.0.1:55440" });
  assert.equal((await fixture().handler(ipv4)).status, 202);
  const wrongPort = proxyContact("https://localhost:55441/api/contact");
  const wrongProtocol = proxyContact("http://localhost:55440/api/contact");
  for (const bad of [wrongPort, wrongProtocol]) { const rejected = fixture(); assert.equal((await rejected.handler(bad)).status, 403); assert.equal(rejected.calls.length, 0); }
});
