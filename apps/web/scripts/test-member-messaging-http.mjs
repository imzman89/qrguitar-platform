import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, "..");
const require = createRequire(path.join(web, "package.json"));
const ts = require("typescript");
const source = fs.readFileSync(path.join(web, "lib/member-messaging-http.ts"), "utf8");
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
new Function("require", "module", "exports", output)(require, module, module.exports);
const { memberMessageJson, memberMessageOriginAllowed, readMemberMessageJson } = module.exports;

const response = memberMessageJson({ ok: true });
assert.match(response.headers.get("cache-control"), /no-store/);
assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
assert.equal(response.headers.get("x-content-type-options"), "nosniff");
assert.equal(response.headers.get("vary"), "Authorization");

assert.equal(memberMessageOriginAllowed(new Request("https://www.qrguitar.com/api/messages", { headers: { origin: "https://www.qrguitar.com", "sec-fetch-site": "same-origin" } })), true);
assert.equal(memberMessageOriginAllowed(new Request("https://www.qrguitar.com/api/messages", { headers: { origin: "https://evil.invalid", "sec-fetch-site": "cross-site" } })), false);

const valid = new Request("https://www.qrguitar.com/api/messages", {
  method: "POST",
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify({ action: "read" })
});
assert.deepEqual(await readMemberMessageJson(valid, 128), { action: "read" });

let cancelled = false;
const oversized = new Request("https://www.qrguitar.com/api/messages", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode(`{"value":"${"x".repeat(80)}"}`)); },
    cancel() { cancelled = true; }
  }),
  duplex: "half"
});
assert.equal(await readMemberMessageJson(oversized, 32), null);
await new Promise((resolve) => setImmediate(resolve));
assert.equal(cancelled, true);

const encoded = new Request("https://www.qrguitar.com/api/messages", { method: "POST", headers: { "content-type": "application/json", "content-encoding": "gzip" }, body: "{}" });
assert.equal(await readMemberMessageJson(encoded), null);
const invalidUtf8 = new Request("https://www.qrguitar.com/api/messages", { method: "POST", headers: { "content-type": "application/json" }, body: new Uint8Array([0xff]) });
assert.equal(await readMemberMessageJson(invalidUtf8), null);

console.log("PASS member messaging HTTP boundaries and privacy headers");
