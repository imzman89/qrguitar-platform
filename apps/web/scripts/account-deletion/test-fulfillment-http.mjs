import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(process.argv[2] || path.join(here, "../../../.."));
const root = path.join(repo, "apps/web/lib/account-deletion");
const require = createRequire(path.join(repo, "apps/web/package.json"));
const ts = require("typescript"), cache = new Map();
function load(name) {
  if (cache.has(name)) return cache.get(name);
  const output = ts.transpileModule(fs.readFileSync(path.join(root, name + ".ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", output)(id => id.startsWith("./") ? load(id.slice(2)) : require(id), module, module.exports);
  cache.set(name, module.exports); return module.exports;
}
const { createFulfillmentService } = load("fulfillment-service");
const { createFulfillmentHandlers } = load("fulfillment-http");
const ADMIN = "30000000-0000-4000-8000-000000000003", ACTOR = "10000000-0000-4000-8000-000000000001", REQUEST = "50000000-0000-4000-8000-000000000005";
const endpoint = `https://www.qrguitar.com/api/admin/account-deletion-requests/${REQUEST}/fulfill`;
const now = "2026-09-18T18:00:00.123456+00:00";
const job = (state, blockers = []) => ({ requestId: REQUEST, state, blockers, revision: state === "completed" ? "2" : "1", startedAt: now, reviewedAt: now,
  storageQuiesceUntil: state === "blocked" ? null : now, databaseAnonymizedAt: ["blocked", "quiescing_storage"].includes(state) ? null : now,
  authDeletedAt: state === "completed" ? now : null, completedAt: state === "completed" ? now : null });
const inspect = async response => {
  assert.match(response.headers.get("cache-control"), /no-store/); assert.equal(response.headers.get("vary"), "Authorization");
  const body = await response.json(); assert.ok(!JSON.stringify(body).includes(ACTOR), "Target Auth UUID reached HTTP JSON"); return { status: response.status, body, headers: response.headers };
};
function fixture(options = {}) {
  const calls = { rpc: [], deleted: [], admin: 0 }, prepared = options.prepared || { ok: true, fulfillment: job("blocked", ["storage_cleanup_required"]), authActorId: null };
  const client = {
    rpc: async (name, args) => {
      calls.rpc.push({ name, args });
      if (options.rpc) return options.rpc(name, args, calls);
      if (name === "prepare_account_deletion_fulfillment") return { data: prepared, error: null };
      if (name === "complete_account_deletion_fulfillment") return { data: { ok: true, fulfillment: job("completed") }, error: null };
      if (name === "read_account_deletion_fulfillment") return { data: { ok: true, fulfillment: prepared.fulfillment }, error: null };
      throw new Error("Unexpected RPC " + name);
    },
    auth: { admin: { deleteUser: async id => { calls.deleted.push(id); return options.authDelete ? options.authDelete(id) : { data: {}, error: null }; } } }
  };
  const requireAdmin = async request => { calls.admin += 1; return options.denied || { ok: true, supabase: client, admin: { user: { id: ADMIN, email: "admin@example.test" }, accessSource: options.environmentAdmin ? "env" : "role" } }; };
  const service = createFulfillmentService({ requireAdmin, protectedAdminEmails: () => options.protectedAdminEmails || ["Owner@Example.Test", "owner@example.test"],
    randomId: () => "60000000-0000-4000-8000-000000000006", timeoutMs: options.timeoutMs || 1000 });
  const handlers = createFulfillmentHandlers({ service: () => options.disabled ? null : service, bodyTimeoutMs: options.bodyTimeoutMs || 1000 });
  const request = (method = "POST", input = { operationId: randomUUID(), action: "prepare" }, extra = {}) => new Request(extra.url || endpoint, { method,
    headers: { authorization: "Bearer synthetic", ...(input !== undefined ? { "content-type": "application/json" } : {}), ...extra.headers },
    ...(input !== undefined ? { body: typeof input === "string" ? input : JSON.stringify(input) } : {}), ...(extra.signal ? { signal: extra.signal } : {}) });
  return { calls, client, service, handlers, request };
}
let passed = 0;
async function check(name, work) { await work(); passed += 1; console.log("PASS " + name); }

await check("blocked inventory is truthful and never calls Auth deletion", async () => {
  const f = fixture(), result = await inspect(await f.handlers.item(f.request(), REQUEST));
  assert.equal(result.status, 200); assert.equal(result.body.fulfillment.state, "blocked"); assert.deepEqual(result.body.fulfillment.blockers, ["storage_cleanup_required"]);
  assert.deepEqual(f.calls.deleted, []); assert.deepEqual(f.calls.rpc.map(call => call.name), ["prepare_account_deletion_fulfillment"]);
  assert.deepEqual(f.calls.rpc[0].args.p_protected_admin_emails, ["owner@example.test"]);
});

await check("storage quiescence returns its fixed deadline and never calls Auth deletion", async () => {
  const f = fixture({ prepared: { ok: true, fulfillment: job("quiescing_storage", ["storage_quiescence_required"]), authActorId: null } });
  const result = await inspect(await f.handlers.item(f.request(), REQUEST));
  assert.equal(result.status, 200); assert.equal(result.body.fulfillment.state, "quiescing_storage"); assert.equal(result.body.fulfillment.storageQuiesceUntil, now);
  assert.deepEqual(f.calls.deleted, []); assert.deepEqual(f.calls.rpc.map(call => call.name), ["prepare_account_deletion_fulfillment"]);
});

await check("ready database state deletes the exact server-side actor and finalizes without exposing it", async () => {
  const f = fixture({ prepared: { ok: true, fulfillment: job("ready_for_auth_deletion"), authActorId: ACTOR } });
  const result = await inspect(await f.handlers.item(f.request(), REQUEST));
  assert.equal(result.status, 200); assert.equal(result.body.fulfillment.state, "completed"); assert.deepEqual(f.calls.deleted, [ACTOR]);
  assert.deepEqual(f.calls.rpc.map(call => call.name), ["prepare_account_deletion_fulfillment", "complete_account_deletion_fulfillment"]);
  assert.equal(f.calls.rpc[1].args.p_operation_id, "60000000-0000-4000-8000-000000000006");
});

await check("provider failure is never completion proof and remains safely retryable", async () => {
  const f = fixture({ prepared: { ok: true, fulfillment: job("ready_for_auth_deletion"), authActorId: ACTOR }, authDelete: async () => ({ error: { status: 503, message: "PRIVATE PROVIDER" } }),
    rpc: async name => name === "prepare_account_deletion_fulfillment" ? { data: { ok: true, fulfillment: job("ready_for_auth_deletion"), authActorId: ACTOR }, error: null }
      : { data: null, error: { code: "PD428", message: "PRIVATE DATABASE" } } });
  const result = await inspect(await f.handlers.item(f.request(), REQUEST));
  assert.equal(result.status, 503); assert.equal(result.body.code, "auth_deletion_pending"); assert.equal(result.body.retryable, true); assert.deepEqual(f.calls.deleted, [ACTOR]);
});

await check("lost Auth response can still finalize only from the database's independent absence proof", async () => {
  const f = fixture({ prepared: { ok: true, fulfillment: job("ready_for_auth_deletion"), authActorId: ACTOR }, authDelete: async () => { throw new Error("PRIVATE LOST RESPONSE"); } });
  const result = await inspect(await f.handlers.item(f.request(), REQUEST)); assert.equal(result.status, 200); assert.equal(result.body.fulfillment.state, "completed");
});

await check("completed replay with no actor performs no Auth call and stays completed", async () => {
  const f = fixture({ prepared: { ok: true, fulfillment: job("completed"), authActorId: null } });
  const result = await inspect(await f.handlers.item(f.request(), REQUEST)); assert.equal(result.status, 200); assert.equal(result.body.fulfillment.state, "completed");
  assert.deepEqual(f.calls.deleted, []); assert.deepEqual(f.calls.rpc.map(call => call.name), ["prepare_account_deletion_fulfillment"]);
});

await check("malformed SQL DTO or target actor stops before provider deletion", async () => {
  for (const prepared of [
    { ok: true, fulfillment: { ...job("ready_for_auth_deletion"), secret: "PRIVATE" }, authActorId: ACTOR },
    { ok: true, fulfillment: job("ready_for_auth_deletion"), authActorId: "not-a-uuid" },
    { ok: true, fulfillment: { ...job("ready_for_auth_deletion"), requestId: randomUUID() }, authActorId: ACTOR }
  ]) {
    const f = fixture({ prepared }), result = await inspect(await f.handlers.item(f.request(), REQUEST)); assert.equal(result.status, 503); assert.deepEqual(f.calls.deleted, []);
  }
});

await check("missing privilege fails closed as unavailable rather than inventing administrator denial", async () => {
  const f = fixture({ rpc: async () => ({ data: null, error: { code: "42501", message: "PRIVATE PRIVILEGE" } }) });
  const result = await inspect(await f.handlers.item(f.request(), REQUEST)); assert.equal(result.status, 503); assert.equal(result.body.code, "fulfillment_unavailable");
});

await check("HTTP validates exact action, path, method, origin, encoding and query before mutation", async () => {
  const f = fixture();
  const cases = [
    f.handlers.item(f.request("DELETE"), REQUEST),
    f.handlers.item(f.request("POST", { operationId: randomUUID(), action: "complete" }), REQUEST),
    f.handlers.item(f.request("POST", { operationId: randomUUID(), action: "prepare", actorId: ACTOR }), REQUEST),
    f.handlers.item(f.request("POST", { operationId: "bad", action: "prepare" }), REQUEST),
    f.handlers.item(f.request("POST", undefined, { headers: { "content-type": "text/plain" } }), REQUEST),
    f.handlers.item(f.request("POST", undefined, { headers: { "content-encoding": "gzip", "content-type": "application/json" } }), REQUEST),
    f.handlers.item(f.request("POST", undefined, { headers: { origin: "https://evil.invalid", "content-type": "application/json" } }), REQUEST),
    f.handlers.item(f.request("POST", undefined, { url: endpoint + "?actorId=" + ACTOR, headers: { "content-type": "application/json" } }), REQUEST),
    f.handlers.item(new Request(endpoint), "bad")
  ];
  const results = await Promise.all(cases); assert.deepEqual(results.map(response => response.status), [405, 400, 400, 400, 415, 415, 403, 400, 400]);
  assert.equal(f.calls.rpc.length, 0); assert.equal(f.calls.admin, 0);
});

await check("duplicate fields, invalid UTF-8 and actual bytes beyond a lying Content-Length are rejected", async () => {
  const f = fixture(), operation = randomUUID();
  const duplicate = f.request("POST", `{"operationId":"${operation}","operationId":"${randomUUID()}","action":"prepare"}`);
  assert.equal((await f.handlers.item(duplicate, REQUEST)).status, 400);
  const utf8 = new Request(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: new Uint8Array([0xff]) });
  assert.equal((await f.handlers.item(utf8, REQUEST)).status, 400);
  const lying = new Request(endpoint, { method: "POST", headers: { "content-type": "application/json", "content-length": "1" }, body: "x".repeat(513) });
  assert.equal((await f.handlers.item(lying, REQUEST)).status, 413); assert.equal(f.calls.rpc.length, 0);
});

await check("stalled and broken chunked bodies terminate and never dispatch fulfillment", async () => {
  const f = fixture({ bodyTimeoutMs: 15 }); let cancelled = false;
  const stalled = new Request(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: new ReadableStream({ cancel() { cancelled = true; } }), duplex: "half" });
  assert.equal((await f.handlers.item(stalled, REQUEST)).status, 408); await new Promise(resolve => setImmediate(resolve)); assert.equal(cancelled, true);
  const broken = new Request(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: new ReadableStream({ start(controller) { controller.error(new Error("PRIVATE")); } }), duplex: "half" });
  assert.equal((await f.handlers.item(broken, REQUEST)).status, 400); assert.equal(f.calls.rpc.length, 0);
});

await check("admin and runtime outages have bounded sanitized responses", async () => {
  for (const options of [{ disabled: true }, { denied: { ok: false, response: Response.json({ secret: "PRIVATE" }, { status: 403 }) } }]) {
    const f = fixture(options), result = await inspect(await f.handlers.item(new Request(endpoint), REQUEST)); assert.equal(result.status, options.disabled ? 503 : 403);
  }
  let resolve; const pending = new Promise(done => { resolve = done; }); const f = fixture({ timeoutMs: 15, denied: undefined });
  f.service = createFulfillmentService({ requireAdmin: () => pending, timeoutMs: 15 });
  const response = await f.service.read(new Request(endpoint), REQUEST).then(() => null, error => error); assert.equal(response.status, 503); resolve?.({ ok: false, response: new Response(null, { status: 403 }) });
});

console.log(`Account deletion fulfillment HTTP/service tests passed (${passed}).`);
