import assert from "node:assert/strict";
import ts from "typescript";
import { readRepo } from "./atomic-test-support.mjs";

async function load(relative) {
  const source = readRepo(relative);
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);
}

const bodyReader = await load("apps/web/lib/bounded-json-body.ts");
const protocol = await load("apps/web/lib/profile-upload-protocol.ts");
const limit = protocol.MAX_PROFILE_EDIT_JSON_BYTES;
const emptyBytes = Buffer.byteLength(JSON.stringify({ padding: "" }));
const jsonWithBytes = (bytes) => JSON.stringify({ padding: "x".repeat(bytes - emptyBytes) });
let passed = 0;
async function test(name, run) { await run(); passed++; console.log(`PASS ${name}`); }

await test("Profile edit metadata one byte below the application limit is parsed", async () => {
  const body = jsonWithBytes(limit - 1);
  assert.equal(Buffer.byteLength(body), limit - 1);
  const result = await bodyReader.readBoundedJsonBody(new Request("https://qrguitar.test/api/instruments", {
    method: "PATCH", headers: { "content-type": "application/json" }, body
  }), limit);
  assert.equal(result.ok, true);
  assert.equal(result.bytes, limit - 1);
});

await test("Profile edit metadata one byte above the limit is rejected as too large", async () => {
  const body = jsonWithBytes(limit + 1);
  assert.equal(Buffer.byteLength(body), limit + 1);
  const result = await bodyReader.readBoundedJsonBody(new Request("https://qrguitar.test/api/instruments", {
    method: "PATCH", headers: { "content-type": "application/json" }, body
  }), limit);
  assert.deepEqual({ ok: result.ok, reason: result.reason }, { ok: false, reason: "too_large" });
});

await test("an oversized declared length is rejected before reading its stream", async () => {
  let pulled = false;
  const request = { headers: new Headers({ "content-length": String(limit + 1) }), get body() { pulled = true; throw new Error("body must not be read"); } };
  const result = await bodyReader.readBoundedJsonBody(request, limit);
  assert.deepEqual({ ok: result.ok, reason: result.reason }, { ok: false, reason: "too_large" });
  assert.equal(pulled, false);
});

await test("the PATCH route turns the bounded-reader result into a predictable 413", async () => {
  const route = readRepo("apps/web/app/api/instruments/route.ts");
  const patch = route.slice(route.indexOf("export async function PATCH"));
  assert.match(patch, /readBoundedJsonBody\(request, MAX_PROFILE_EDIT_JSON_BYTES\)/);
  assert.match(patch, /profile_metadata_too_large/);
  assert.match(patch, /status: parsedBody\.reason === "too_large" \? 413 : 400/);
});

await test("the edit client stages bytes first and its PATCH contains paths instead of data URLs", async () => {
  const page = readRepo("apps/web/app/edit/[code]/page.tsx");
  const save = page.slice(page.indexOf("async function saveChanges"), page.indexOf("async function saveVerificationSettings"));
  assert.ok(save.indexOf("await stageSelectedFiles()") < save.indexOf('fetch("/api/instruments"'));
  assert.match(save, /heroImagePath: staged\.photoPaths/);
  assert.match(save, /photos: staged\.photoPaths/);
  assert.match(save, /storagePath: staged\.documentPaths\[index\]/);
  assert.doesNotMatch(save, /dataUrl:\s*document\.dataUrl/);
  assert.doesNotMatch(save, /heroImageDataUrl:\s*form\.heroImageDataUrl/);
});

console.log(`Completed ${passed} Profile edit request-boundary tests.`);
