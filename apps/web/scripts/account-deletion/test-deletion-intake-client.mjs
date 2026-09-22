import { withUiTextTestContext } from "../ui-text-test-context.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

const testRoot = path.dirname(fileURLToPath(import.meta.url)), repo = path.resolve(process.argv[2] || path.join(testRoot, "../../../..")), here = path.join(repo, "apps/web/lib/account-deletion");
assert.ok(fs.existsSync(path.join(repo, "apps/web/package.json")), "Supply the canonical repository path for existing TypeScript/React dependencies.");
const require = withUiTextTestContext(createRequire(path.join(repo, "apps/web/package.json"))), ts = require("typescript"), React = require("react"), { renderToStaticMarkup } = require("react-dom/server");
const compile = filename => ts.transpileModule(fs.readFileSync(path.join(here, filename), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
function clientModule() { const module = { exports: {} }; new Function("module", "exports", compile("deletion-intake-client.ts"))(module, module.exports); return module.exports; }
const A = "10000000-0000-4000-8000-000000000001", B = "20000000-0000-4000-8000-000000000002";
const OP = "30000000-0000-4000-8000-000000000003", OP2 = "40000000-0000-4000-8000-000000000004";
const REQUEST = "50000000-0000-4000-8000-000000000005", NEWER = "60000000-0000-4000-8000-000000000006";
const time = "2026-09-17T12:00:00.123789+00:00", cancelledTime = "2026-09-17T13:00:00.987654+00:00";
const dto = (requestId = REQUEST, status = "requested") => ({ requestId, status, requestedAt: time, cancelledAt: status === "cancelled" ? cancelledTime : null });
const snapshot = (request, revision = "0", fulfillment = null) => ({ revision, activeRequest: request?.status === "requested" ? request : null, latestRequest: request || null, fulfillment });
const quiescing = { state: "quiescing_storage", blockers: ["storage_quiescence_required"], revision: "1", reviewedAt: time, storageQuiesceUntil: cancelledTime };
const session = id => id ? { access_token: "token-" + id, user: { id } } : null;
const json = value => Response.json({ ok: true, ...value });
const denial = (status, message = "Retry rejected") => ({ ok: false, code: ({ 400: "invalid_request", 401: "identity_required", 403: "origin_not_allowed", 404: "request_not_found", 409: "operation_conflict" })[status], uncertain: false, retryable: false, message, ...(status === 409 ? { operationId: OP } : {}) });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(predicate) { for (let i = 0; i < 300; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 1)); } assert.ok(predicate(), "Condition did not settle"); }
function fixture(t, options = {}) {
  const f = { module: clientModule(), session: session(A), calls: [], stored: new Map(), status: snapshot(), uuidCalls: 0, ...options };
  const listeners = new Set(), requests = new Map(), receipts = new Map();
  if (f.status.latestRequest) requests.set(f.status.latestRequest.requestId, f.status.latestRequest);
  if (f.status.activeRequest) requests.set(f.status.activeRequest.requestId, f.status.activeRequest);
  f.auth = {
    getSession: () => f.getSession ? f.getSession() : Promise.resolve({ data: { session: f.session } }),
    onAuthStateChange(callback) { listeners.add(callback); if (f.onSubscribe) f.onSubscribe(callback); return { data: { subscription: { unsubscribe() { listeners.delete(callback); f.unsubscribed = true; } } } }; }
  };
  f.respond = options.respond || (async (url, init) => {
    if (init.method === "GET") return json({ request: null, ...f.status });
    const body = JSON.parse(init.body), action = init.method === "POST" ? "submit" : "cancel";
    let receipt = receipts.get(body.operationId);
    if (!receipt) {
      if (body.expectedRevision !== f.status.revision) return Response.json({ ok: false, code: "intake_state_changed", message: "State changed", uncertain: false, retryable: false, operationId: body.operationId, expectedRevision: body.expectedRevision }, { status: 412 });
      const nextRevision = (BigInt(f.status.revision) + 1n).toString();
      let request;
      if (action === "submit") {
        request = f.status.activeRequest || dto(requests.has(REQUEST) ? NEWER : REQUEST);
        requests.set(request.requestId, request); f.status = snapshot(request, nextRevision);
      } else {
        const id = url.split("/").at(-1); request = requests.get(id);
        if (!request) return Response.json({ ok: false, message: "Request not found", uncertain: false }, { status: 404 });
        request = { ...request, status: "cancelled", cancelledAt: cancelledTime }; requests.set(id, request);
        if (f.status.activeRequest?.requestId === id || f.status.latestRequest?.requestId === id) f.status = snapshot(request, nextRevision);
      }
      receipt = { operationId: body.operationId, expectedRevision: body.expectedRevision, action, requestId: request.requestId, recordedAt: time }; receipts.set(body.operationId, receipt);
    }
    return json({ receipt, request: requests.get(receipt.requestId) });
  });
  f.create = actorId => f.module.createDeletionIntakeClient({ actorId, auth: () => { if (f.authError) throw new Error("Auth unavailable"); return f.auth; },
    fetch: async (url, init) => { f.calls.push({ url, init }); return f.respond(url, init); },
    storage: () => { if (f.storageDenied) throw new Error("Storage denied"); return { getItem: key => f.stored.get(key) || null, setItem: (key, value) => { if (f.writeDenied) throw new Error("Write denied"); if (!f.discardWrites) f.stored.set(key, value); }, removeItem: key => { if (f.removeDenied) throw new Error("Remove denied"); f.stored.delete(key); } }; },
    randomUUID: () => { f.uuidCalls++; return f.uuidCalls === 1 ? OP : OP2; }, timeoutMs: f.timeoutMs ?? 800 });
  f.client = f.create(options.actorId ?? A);
  f.change = id => { f.session = session(id); for (const listener of listeners) listener("SIGNED_IN", f.session); };
  f.ready = async () => { await f.client.start(); await until(() => ["ready", "error", "signed-out", "account-changed"].includes(f.client.getState().phase)); };
  f.writes = () => f.calls.filter(call => call.init.method !== "GET");
  t.after(() => f.client.dispose());
  return f;
}

test("signed-out or mismatched parent actor cannot read or submit another account", async t => {
  for (const options of [{ session: null }, { session: session(B) }, { actorId: "" }]) {
    const f = fixture(t, options); await f.ready(); f.client.prepareSubmit(); await f.client.confirm(); await f.client.retry(); assert.equal(f.calls.length, 0);
  }
});
test("mount and repeated status refresh make authenticated reads only", async t => {
  const f = fixture(t); await f.ready(); await f.client.reload(); await f.client.reload(); assert.equal(f.calls.length, 3); assert.equal(f.writes().length, 0);
  for (const { init } of f.calls) { assert.equal(init.headers.authorization, "Bearer token-" + A); assert.equal(init.cache, "no-store"); assert.equal(init.credentials, "omit"); assert.equal(init.redirect, "error"); }
});
test("prepare and dismissal do not submit; only explicit confirmation records an exact body", async t => {
  const f = fixture(t); await f.ready(); await f.client.confirm(); f.client.prepareSubmit(); assert.equal(f.writes().length, 0); f.client.dismissConfirmation(); await f.client.confirm(); assert.equal(f.writes().length, 0);
  f.client.prepareSubmit(); await f.client.confirm(); assert.deepEqual(JSON.parse(f.writes()[0].init.body), { operationId: OP, expectedRevision: "0", confirm: true });
  assert.equal(f.client.getState().snapshot.activeRequest.status, "requested"); assert.equal(f.client.getState().intent, null);
});
test("double confirmation sends one operation", async t => {
  const f = fixture(t); await f.ready(); f.client.prepareSubmit(); await Promise.all([f.client.confirm(), f.client.confirm()]); assert.equal(f.writes().length, 1); assert.equal(f.uuidCalls, 1);
});
test("cancellation targets only the confirmed active request with an exact body", async t => {
  const f = fixture(t, { status: snapshot(dto()) }); await f.ready(); f.client.prepareCancel(); assert.equal(f.writes().length, 0); await f.client.confirm();
  assert.equal(f.writes()[0].url, "/api/account/deletion-requests/" + REQUEST); assert.equal(f.writes()[0].init.method, "PATCH");
  assert.deepEqual(JSON.parse(f.writes()[0].init.body), { operationId: OP, expectedRevision: "0", action: "cancel" }); assert.equal(f.client.getState().snapshot.latestRequest.status, "cancelled");
});
test("status refresh invalidates an earlier cancellation confirmation", async t => {
  const f = fixture(t, { status: snapshot(dto()) }); await f.ready(); f.client.prepareCancel(); f.status = snapshot(dto(NEWER)); await f.client.reload(); await f.client.confirm(); assert.equal(f.writes().length, 0); assert.equal(f.client.getState().confirmation, null);
});
test("unknown submission retains the same UUID through empty refresh and explicit retry", async t => {
  const f = fixture(t); const respond = f.respond; let fail = true;
  f.respond = async (url, init) => { if (init.method === "POST" && fail) { fail = false; throw new Error("Response lost"); } return respond(url, init); };
  await f.ready(); f.client.prepareSubmit(); await f.client.confirm(); assert.equal(f.client.getState().intent.operationId, OP); await f.client.reload();
  assert.equal(f.client.getState().intent.operationId, OP); f.client.prepareCancel(); f.client.prepareSubmit(); await f.client.confirm(); assert.equal(f.writes().length, 1);
  await f.client.retry(); assert.equal(f.writes().length, 2); assert.equal(f.writes()[0].init.body, f.writes()[1].init.body); assert.equal(f.uuidCalls, 1);
});
test("unknown cancellation retains its target and operation after refresh", async t => {
  const f = fixture(t, { status: snapshot(dto()) }); const respond = f.respond; let fail = true;
  f.respond = async (url, init) => { if (init.method === "PATCH" && fail) { fail = false; return Response.json({ ok: false, uncertain: true, operationId: OP, message: "Could not confirm cancellation" }, { status: 503 }); } return respond(url, init); };
  await f.ready(); f.client.prepareCancel(); await f.client.confirm(); await f.client.reload(); await f.client.retry();
  assert.equal(f.writes()[0].url, f.writes()[1].url); assert.equal(f.writes()[0].init.body, f.writes()[1].init.body); assert.equal(f.client.getState().snapshot.activeRequest, null);
});
test("a delayed old submit cannot reopen a newer cancelled request and requires a fresh confirmation", async t => {
  const f = fixture(t), respond = f.respond, delayed = deferred(); let writes = 0;
  f.respond = async (url, init) => { if (init.method === "POST" && ++writes === 1) await delayed.promise; return respond(url, init); };
  await f.ready(); f.client.prepareSubmit(); const pending = f.client.confirm(); await until(() => f.writes().length === 1);
  // Another device submitted and cancelled after this browser's versioned read.
  f.status = snapshot(dto(NEWER, "cancelled"), "2"); delayed.resolve(); await pending;
  assert.equal(f.client.getState().intent, null); assert.equal(f.client.getState().confirmation, null);
  assert.equal(f.client.getState().snapshot.activeRequest, null); assert.equal(f.client.getState().snapshot.revision, "2");
  assert.match(f.client.getState().error, /Review the refreshed status and confirm a new action/);
  await f.client.retry(); await f.client.confirm(); assert.equal(f.writes().length, 1);
  f.client.prepareSubmit(); await f.client.confirm(); assert.equal(JSON.parse(f.writes()[1].init.body).expectedRevision, "2");
});
test("authoritative matching 412 settles an earlier unknown operation without upgrading its revision", async t => {
  const f = fixture(t), respond = f.respond; let writes = 0;
  f.respond = async (url, init) => { if (init.method === "POST" && ++writes === 1) throw new Error("Response lost"); return respond(url, init); };
  await f.ready(); f.client.prepareSubmit(); await f.client.confirm(); f.status = snapshot(dto(NEWER, "cancelled"), "2");
  await f.client.reload(); assert.equal(f.client.getState().intent.expectedRevision, "0"); await f.client.retry();
  assert.equal(f.writes()[0].init.body, f.writes()[1].init.body); assert.equal(f.client.getState().intent, null);
  assert.equal(f.client.getState().snapshot.revision, "2"); assert.equal(f.client.getState().confirmation, null); assert.equal(f.uuidCalls, 1);
});
for (const [name, change] of [
  ["wrong operation", p => { p.operationId = OP2; }], ["wrong revision", p => { p.expectedRevision = "1"; }],
  ["numeric revision", p => { p.expectedRevision = 0; }], ["missing revision", p => { delete p.expectedRevision; }],
  ["missing operation", p => { delete p.operationId; }], ["wrong code", p => { p.code = "operation_conflict"; }],
  ["missing uncertainty", p => { delete p.uncertain; }], ["retryable", p => { p.retryable = true; }],
  ["empty message", p => { p.message = ""; }]
]) test(`unverifiable 412 ${name} cannot settle an earlier unknown operation`, async t => {
  const f = fixture(t); let writes = 0;
  f.respond = async (_url, init) => {
    if (init.method === "GET") return json({ request: null, ...snapshot(undefined, "2") });
    if (++writes === 1) throw new Error("Unknown");
    const payload = { ok: false, code: "intake_state_changed", message: "State changed", uncertain: false, retryable: false, operationId: OP, expectedRevision: "2" };
    // This test starts from revision 2, so use a different revision for mismatch.
    change(payload); return Response.json(payload, { status: 412 });
  };
  await f.ready(); f.client.prepareSubmit(); await f.client.confirm(); await f.client.retry();
  assert.equal(f.client.getState().intent.operationId, OP); assert.equal(f.client.getState().intent.expectedRevision, "2"); assert.equal(f.writes()[0].init.body, f.writes()[1].init.body);
});
test("large revision strings survive confirmation, persistence, dispatch, and replay exactly", async t => {
  const large = "9007199254740993", f = fixture(t, { status: snapshot(undefined, large) }), respond = f.respond; let writes = 0;
  f.respond = async (url, init) => { const result = await respond(url, init); if (init.method === "POST" && ++writes === 1) throw new Error("Committed but response lost"); return result; };
  await f.ready(); f.client.prepareSubmit(); assert.equal(f.client.getState().confirmation.expectedRevision, large); await f.client.confirm();
  assert.equal(JSON.parse([...f.stored.values()][0]).expectedRevision, large); await f.client.reload(); await f.client.retry();
  assert.equal(JSON.parse(f.writes()[1].init.body).expectedRevision, large); assert.equal(f.client.getState().snapshot.revision, "9007199254740994"); assert.equal(f.client.getState().intent, null);
});
for (const value of [undefined, null, 0, "00", "01", "-1", "+1", " 1", "1e1", "1.0", "9223372036854775808"]) test(`invalid revision ${JSON.stringify(value)} disables confirmation and cannot be repaired by guessing`, async t => {
  const f = fixture(t, { status: { ...snapshot(), revision: value } }); await f.ready();
  assert.equal(f.client.getState().phase, "error"); f.client.prepareSubmit(); await f.client.confirm(); assert.equal(f.writes().length, 0);
});
test("legacy saved intent without revision is preserved in storage and blocked instead of dispatched with a new revision", async t => {
  const saved = JSON.stringify({ operationId: OP, action: "submit", requestId: "" }), key = "qrguitar:deletion-intake:" + A;
  const f = fixture(t, { stored: new Map([[key, saved]]) }); await f.ready(); await f.client.retry(); f.client.prepareSubmit(); await f.client.confirm();
  assert.equal(f.client.getState().recoveryBlocked, true); assert.equal(f.stored.get(key), saved); assert.equal(f.writes().length, 0);
});
test("verified definitive rejection requires a new explicit action instead of silently resubmitting", async t => {
  const f = fixture(t); f.respond = async (_url, init) => init.method === "POST" ? Response.json(denial(409, "Request rejected"), { status: 409 }) : json({ request: null, ...snapshot() });
  await f.ready(); f.client.prepareSubmit(); await f.client.confirm(); assert.equal(f.client.getState().intent, null); assert.match(f.client.getState().error, /Request rejected/); assert.equal(f.writes().length, 1); await f.client.retry(); assert.equal(f.writes().length, 1);
});
test("rate limiting preserves the original action for an explicit retry after waiting", async t => {
  const f = fixture(t), respond = f.respond; let limited = true;
  f.respond = async (url, init) => init.method === "POST" && limited ? Response.json({ ok: false, code: "intake_rate_limited", message: "Wait before retrying this same action.", retryable: true, uncertain: false, operationId: OP, expectedRevision: "0" }, { status: 429 }) : respond(url, init);
  await f.ready(); f.client.prepareSubmit(); await f.client.confirm(); assert.equal(f.client.getState().intent.operationId, OP);
  await f.client.reload(); f.client.prepareSubmit(); await f.client.confirm(); assert.equal(f.writes().length, 1);
  limited = false; await f.client.retry(); assert.equal(f.writes()[0].init.body, f.writes()[1].init.body); assert.equal(f.client.getState().intent, null); assert.equal(f.uuidCalls, 1);
});
for (const status of [401, 403, 404, 409, 400]) test(`known ${status} on retry cannot settle an earlier unknown operation`, async t => {
  const f = fixture(t); let writes = 0;
  f.respond = async (_url, init) => {
    if (init.method === "GET") return json({ request: null, ...snapshot() });
    if (++writes === 1) throw new Error("Original response was lost");
    return Response.json(denial(status), { status });
  };
  await f.ready(); f.client.prepareSubmit(); await f.client.confirm(); await f.client.retry(); await f.client.reload();
  assert.equal(f.client.getState().intent.operationId, OP); assert.equal(f.writes()[0].init.body, f.writes()[1].init.body);
  f.client.prepareSubmit(); await f.client.confirm(); assert.equal(f.writes().length, 2); assert.equal(f.uuidCalls, 1);
});
for (const [name, payload] of [
  ["empty", {}], ["partial", { ok: false }], ["foreign operation", { ...denial(409), operationId: OP2 }],
  ["unknown code", { ...denial(409), code: "unrecognized" }], ["wrong status for code", denial(401)],
  ["missing retryability", { ...denial(409), retryable: undefined }], ["missing operation for conflict", { ...denial(409), operationId: undefined }]
]) test(`commit followed by ${name} first 4xx error preserves the dispatched UUID`, async t => {
  const f = fixture(t), respond = f.respond; let writes = 0;
  f.respond = async (url, init) => { const result = await respond(url, init); return init.method !== "GET" && ++writes === 1 ? Response.json(payload, { status: 409 }) : result; };
  await f.ready(); f.client.prepareSubmit(); await f.client.confirm(); assert.equal(f.client.getState().intent.operationId, OP);
  f.client.prepareSubmit(); await f.client.confirm(); assert.equal(f.writes().length, 1); await f.client.reload(); assert.equal(f.client.getState().intent.operationId, OP);
  await f.client.retry(); assert.equal(f.writes()[0].init.body, f.writes()[1].init.body); assert.equal(f.uuidCalls, 1); assert.equal(f.client.getState().intent, null); assert.equal(f.client.getState().snapshot.activeRequest.requestId, REQUEST);
});
test("committed cancellation with a malformed first 4xx cannot lose its target or UUID", async t => {
  const f = fixture(t, { status: snapshot(dto()) }), respond = f.respond; let writes = 0;
  f.respond = async (url, init) => { const result = await respond(url, init); return init.method !== "GET" && ++writes === 1 ? Response.json({}, { status: 404 }) : result; };
  await f.ready(); f.client.prepareCancel(); await f.client.confirm(); await f.client.reload(); assert.equal(f.client.getState().intent.requestId, REQUEST);
  await f.client.retry(); assert.equal(f.writes()[0].url, f.writes()[1].url); assert.equal(f.writes()[0].init.body, f.writes()[1].init.body); assert.equal(f.uuidCalls, 1); assert.equal(f.client.getState().intent, null);
});
for (const broken of ["operation", "action", "revision", "request", "missing", "completed"]) test(`unverifiable ${broken} receipt never clears retry identity`, async t => {
  const f = fixture(t), respond = f.respond;
  f.respond = async (url, init) => { const response = await respond(url, init); if (init.method === "GET") return response; const body = await response.json();
    if (broken === "revision") body.receipt.expectedRevision = "1"; if (broken === "operation") body.receipt.operationId = OP2; if (broken === "action") body.receipt.action = "cancel";
    if (broken === "request") body.receipt.requestId = NEWER; if (broken === "missing") delete body.receipt; if (broken === "completed") body.request.status = "completed";
    return json(body);
  };
  await f.ready(); f.client.prepareSubmit(); await f.client.confirm(); assert.equal(f.client.getState().intent.operationId, OP); assert.equal(f.client.getState().feedback, "");
});
test("old submit receipt returning cancelled cannot replace a newer active request", async t => {
  const stored = new Map([["qrguitar:deletion-intake:" + A, JSON.stringify({ operationId: OP, expectedRevision: "0", action: "submit", requestId: "" })]]);
  const f = fixture(t, { stored, status: snapshot(dto(NEWER)) });
  f.respond = async (_url, init) => init.method === "GET" ? json({ request: null, ...f.status }) : json({ receipt: { operationId: OP, expectedRevision: "0", action: "submit", requestId: REQUEST, recordedAt: time }, request: dto(REQUEST, "cancelled") });
  await f.ready(); await f.client.retry(); assert.equal(f.client.getState().snapshot.activeRequest.requestId, NEWER); assert.equal(f.client.getState().intent, null); assert.match(f.client.getState().feedback, new RegExp(REQUEST));
});
test("old cancellation receipt refreshes current request instead of hiding a newer one", async t => {
  const stored = new Map([["qrguitar:deletion-intake:" + A, JSON.stringify({ operationId: OP, expectedRevision: "0", action: "cancel", requestId: REQUEST })]]);
  const f = fixture(t, { stored, status: snapshot(dto(NEWER)) });
  f.respond = async (_url, init) => init.method === "GET" ? json({ request: null, ...f.status }) : json({ receipt: { operationId: OP, expectedRevision: "0", action: "cancel", requestId: REQUEST, recordedAt: time }, request: dto(REQUEST, "cancelled") });
  await f.ready(); await f.client.retry(); assert.equal(f.client.getState().snapshot.activeRequest.requestId, NEWER); assert.equal(f.client.getState().intent, null);
});
test("server pending request recovers with denied storage and cannot create a duplicate submission", async t => {
  const f = fixture(t, { storageDenied: true, status: snapshot(dto()) }); await f.ready(); f.client.prepareSubmit(); await f.client.confirm(); assert.equal(f.writes().length, 0); assert.equal(f.client.getState().snapshot.activeRequest.requestId, REQUEST);
});
test("stored retry identity survives a fresh controller without writes on mount", async t => {
  const stored = new Map([["qrguitar:deletion-intake:" + A, JSON.stringify({ operationId: OP2, expectedRevision: "0", action: "submit", requestId: "" })]]), f = fixture(t, { stored });
  await f.ready(); assert.equal(f.client.getState().intent.operationId, OP2); assert.equal(f.writes().length, 0); await f.client.retry(); assert.equal(f.uuidCalls, 0); assert.equal(JSON.parse(f.writes()[0].init.body).operationId, OP2);
});
test("memory retry identity survives component remount while storage is denied", async t => {
  const f = fixture(t), respond = f.respond; f.respond = async (url, init) => { if (init.method !== "GET") { f.storageDenied = true; throw new Error("Offline"); } return respond(url, init); };
  await f.ready(); f.client.prepareSubmit(); await f.client.confirm(); f.client.dispose(); f.client = f.create(A); await f.ready(); assert.equal(f.client.getState().intent.operationId, OP); assert.equal(f.writes().length, 1);
});
test("a denied removal cannot resurrect a confirmed operation after storage recovers", async t => {
  const f = fixture(t); await f.ready(); f.client.prepareSubmit(); f.removeDenied = true; await f.client.confirm(); assert.equal(f.stored.size, 1); assert.equal(f.client.getState().intent, null);
  f.client.dispose(); f.removeDenied = false; f.client = f.create(A); await f.ready(); assert.equal(f.client.getState().intent, null); assert.equal(f.stored.size, 0);
});
test("a denied pending write is reconciled before restored storage can return an older intent", async t => {
  const f = fixture(t), respond = f.respond; f.respond = async (url, init) => { if (init.method !== "GET") throw new Error("Offline"); return respond(url, init); };
  await f.ready(); f.client.prepareSubmit(); f.storageDenied = true; await f.client.confirm(); assert.equal(f.writes().length, 0);
  f.stored.set("qrguitar:deletion-intake:" + A, JSON.stringify({ operationId: OP2, expectedRevision: "0", action: "cancel", requestId: NEWER }));
  f.client.dispose(); f.storageDenied = false; f.client = f.create(A); await f.ready(); assert.equal(f.client.getState().intent.operationId, OP); assert.equal(JSON.parse(f.stored.get("qrguitar:deletion-intake:" + A)).operationId, OP);
});
test("unreadable saved state after fresh-module reload permits status only until original identity is recovered", async t => {
  const stored = new Map([["qrguitar:deletion-intake:" + A, JSON.stringify({ operationId: OP2, expectedRevision: "0", action: "submit", requestId: "" })]]);
  const f = fixture(t, { stored, storageDenied: true }); await f.ready();
  assert.equal(f.client.getState().phase, "ready"); assert.equal(f.client.getState().recoveryBlocked, true);
  f.client.prepareSubmit(); await f.client.confirm(); await f.client.retry(); assert.equal(f.uuidCalls, 0); assert.equal(f.writes().length, 0);
  f.storageDenied = false; await f.client.reload(); assert.equal(f.client.getState().intent.operationId, OP2); assert.equal(f.client.getState().recoveryBlocked, false); assert.equal(f.writes().length, 0);
  await f.client.retry(); assert.equal(JSON.parse(f.writes()[0].init.body).operationId, OP2); assert.equal(f.uuidCalls, 0);
});
for (const failure of ["storageDenied", "writeDenied", "discardWrites"]) test(`${failure} before dispatch cannot send an unpersisted operation`, async t => {
  const f = fixture(t); await f.ready(); f.client.prepareSubmit(); f[failure] = true; await f.client.confirm();
  assert.equal(f.writes().length, 0); assert.equal(f.client.getState().recoveryBlocked, true); assert.equal(f.client.getState().intent.operationId, OP);
  await f.client.retry(); assert.equal(f.writes().length, 0); assert.equal(f.uuidCalls, 1);
  f[failure] = false; await f.client.reload(); assert.equal(f.client.getState().recoveryBlocked, false); assert.equal(f.writes().length, 0);
  await f.client.retry(); assert.equal(JSON.parse(f.writes()[0].init.body).operationId, OP); assert.equal(f.uuidCalls, 1);
});
test("storage becomes unavailable before unknown retry: preserve reference and make no second dispatch", async t => {
  const f = fixture(t), respond = f.respond; f.respond = async (url, init) => { if (init.method === "POST") throw new Error("Unknown"); return respond(url, init); };
  await f.ready(); f.client.prepareSubmit(); await f.client.confirm(); f.storageDenied = true; await f.client.retry();
  assert.equal(f.writes().length, 1); assert.equal(f.client.getState().intent.operationId, OP); assert.equal(f.client.getState().recoveryBlocked, true);
});
test("invalid persisted actions and targets cannot become requests", async t => {
  for (const value of [{ operationId: OP, expectedRevision: "0", action: "__proto__", requestId: "" }, { operationId: OP, expectedRevision: "0", action: "cancel", requestId: "../admin" }, { operationId: OP, expectedRevision: "0", action: "submit", requestId: REQUEST }]) {
    const f = fixture(t, { stored: new Map([["qrguitar:deletion-intake:" + A, JSON.stringify(value)]]) }); await f.ready(); await f.client.retry(); f.client.prepareSubmit(); await f.client.confirm(); assert.equal(f.client.getState().intent, null); assert.equal(f.client.getState().recoveryBlocked, true); assert.equal(f.writes().length, 0);
  }
});
test("late read response is discarded immediately when account changes", async t => {
  const f = fixture(t), old = deferred(); await f.ready(); f.respond = () => old.promise; const pending = f.client.reload(); await until(() => f.calls.length === 2); f.change(B);
  assert.equal(f.client.getState().snapshot, null); old.resolve(json({ request: null, ...snapshot(dto()) })); await pending; assert.equal(f.client.getState().phase, "account-changed"); assert.equal(f.client.getState().snapshot, null);
});
test("late mutation receipt cannot clear the former actor's intent after account changes", async t => {
  const f = fixture(t), old = deferred(), respond = f.respond; f.respond = (url, init) => init.method === "POST" ? old.promise : respond(url, init);
  await f.ready(); f.client.prepareSubmit(); const saving = f.client.confirm(); await until(() => f.writes().length === 1); f.change(B);
  old.resolve(json({ receipt: { operationId: OP, expectedRevision: "0", action: "submit", requestId: REQUEST, recordedAt: time }, request: dto() })); await saving; assert.equal(f.client.getState().phase, "account-changed"); assert.equal(f.client.getState().feedback, "");
  f.change(A); await until(() => f.client.getState().phase === "ready"); assert.equal(f.client.getState().intent.operationId, OP);
});
test("silent account change before POST is caught by current session checks", async t => {
  const f = fixture(t); await f.ready(); f.client.prepareSubmit(); f.session = session(B); await f.client.confirm(); assert.equal(f.writes().length, 0); assert.equal(f.client.getState().phase, "account-changed");
});
test("silent account change after POST cannot publish its receipt", async t => {
  const f = fixture(t), respond = f.respond; f.respond = async (url, init) => { const result = await respond(url, init); if (init.method === "POST") f.session = session(B); return result; };
  await f.ready(); f.client.prepareSubmit(); await f.client.confirm(); assert.equal(f.client.getState().phase, "account-changed"); assert.equal(f.client.getState().snapshot, null); assert.equal(f.client.getState().feedback, "");
});
test("same-actor token refresh preserves an unknown operation without writing again", async t => {
  const f = fixture(t), respond = f.respond; f.respond = async (url, init) => { if (init.method === "POST") throw new Error("Offline"); return respond(url, init); };
  await f.ready(); f.client.prepareSubmit(); await f.client.confirm(); f.change(A); await tick(); assert.equal(f.client.getState().intent.operationId, OP); assert.equal(f.writes().length, 1);
});
test("subscription event wins over an older initial session lookup", async t => {
  const old = deferred(), f = fixture(t, { getSession: () => old.promise }); const started = f.client.start(); f.change(B); old.resolve({ data: { session: session(A) } }); await started; assert.equal(f.client.getState().phase, "account-changed"); assert.equal(f.calls.length, 0);
});
test("newer refresh wins over an older response", async t => {
  const f = fixture(t); await f.ready(); const old = deferred(); let count = 0;
  f.respond = () => ++count === 1 ? old.promise : json({ request: null, ...snapshot(dto(NEWER)) });
  const older = f.client.reload(); await until(() => count === 1); await f.client.reload(); old.resolve(json({ request: null, ...snapshot(dto()) })); await older; assert.equal(f.client.getState().snapshot.activeRequest.requestId, NEWER);
});
test("Auth timeout is actionable and recoverable without mutation", async t => {
  const f = fixture(t, { timeoutMs: 12, getSession: () => new Promise(() => {}) }); await f.ready(); assert.equal(f.client.getState().phase, "error"); assert.equal(f.calls.length, 0); delete f.getSession; await f.client.reload(); await until(() => f.client.getState().phase === "ready"); assert.equal(f.writes().length, 0);
});
test("mutation JSON timeout preserves operation identity and releases the busy guard", async t => {
  const f = fixture(t, { timeoutMs: 12 }), respond = f.respond; f.respond = (url, init) => init.method === "POST" ? Promise.resolve({ ok: true, json: () => new Promise(() => {}) }) : respond(url, init);
  await f.ready(); f.client.prepareSubmit(); await f.client.confirm(); assert.equal(f.client.getState().intent.operationId, OP); assert.equal(f.client.getState().busy, false);
});
for (const state of [{ activeRequest: null, latestRequest: dto() }, { activeRequest: dto(), latestRequest: dto(REQUEST, "cancelled") }, { activeRequest: dto(REQUEST, "completed"), latestRequest: dto(REQUEST, "completed") }, {}]) test(`invalid status snapshot ${JSON.stringify(state)} is not a success or empty-state claim`, async t => {
  const f = fixture(t, { respond: async () => json({ request: null, revision: "0", ...state }) }); await f.ready(); assert.equal(f.client.getState().phase, "error"); assert.equal(f.client.getState().snapshot, null); f.client.prepareSubmit(); await f.client.confirm(); assert.equal(f.writes().length, 0);
});
test("full timestamp precision is preserved without affecting UI state", async t => {
  const f = fixture(t, { status: snapshot(dto()) }); await f.ready(); assert.equal(f.client.getState().snapshot.activeRequest.requestedAt, time);
});
test("disposal unsubscribes and prevents late publication", async t => {
  const f = fixture(t), old = deferred(); await f.ready(); let publications = 0; f.client.subscribe(() => publications++); f.respond = () => old.promise;
  const pending = f.client.reload(); await until(() => f.calls.length === 2); f.client.dispose(); const count = publications; old.resolve(json({ request: null, ...snapshot(dto()) })); await pending; assert.equal(publications, count); assert.equal(f.unsubscribed, true);
});

function renderSection(state, { actorId = A, approved = "" } = {}) {
  let hook = 0;
  const module = { exports: {} }, client = clientModule();
  new Function("require", "module", "exports", compile("AccountDeletionSection.tsx"))(name => {
    if (name === "react") return { ...React, useEffect() {}, useState() { return [hook++ === 0 ? state : approved, () => {}]; } };
    if (name === "./deletion-intake-client") return client;
    if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    return require(name);
  }, module, module.exports);
  return renderToStaticMarkup(React.createElement(module.exports.default, { actorId, auth: () => { throw new Error("No real Auth during render tests"); } }));
}
const ready = patch => ({ ...clientModule().initialIntakeState(), phase: "ready", actorId: A, snapshot: snapshot(), ...patch });
test("actual Account section explains approved policy and makes no completion or timing promises", () => {
  const html = renderSection(ready()); assert.match(html, /review removal of your personal information while preserving permanent instrument Profiles and factual history/);
  assert.match(html, /does not delete your account or personal information/); assert.match(html, /Request deletion review/);
  assert.doesNotMatch(html, /erasure complete|account deleted|refund|within \d|business days|account is locked/i);
});
test("actual request confirmation requires an unchecked explicit acknowledgement", () => {
  const html = renderSection(ready({ confirmation: { expectedRevision: "0", action: "submit", requestId: "" } }));
  assert.match(html, /type="checkbox"/); assert.doesNotMatch(html, /type="checkbox"[^>]*checked/);
  assert.match(html, /disabled=""[^>]*>Confirm review request/); assert.match(html, /leaves your current account access unchanged/);
});
test("actual cancellation confirmation names its request and stays disabled until acknowledged", () => {
  const html = renderSection(ready({ snapshot: snapshot(dto()), confirmation: { expectedRevision: "0", action: "cancel", requestId: REQUEST } }));
  assert.match(html, /Cancel this request/); assert.match(html, new RegExp(REQUEST)); assert.match(html, /disabled=""[^>]*>Confirm cancellation/); assert.doesNotMatch(html, /data restored/i);
});
test("actual pending action provides only exact retry and read-only refresh controls", () => {
  const html = renderSection(ready({ intent: { operationId: OP, expectedRevision: "0", action: "submit", requestId: "" } }));
  assert.match(html, /Retry same submission/); assert.match(html, /Refreshing checks status only/); assert.doesNotMatch(html, />Request deletion review<|>Request another review<|You have no recorded deletion request/);
});
test("actual unknown retry rejection keeps its reference secondary and offers the same retry", () => {
  const html = renderSection(ready({ intent: { operationId: OP, expectedRevision: "0", action: "submit", requestId: "" }, error: "Retry rejected. Retry the same saved action to confirm its result." }));
  assert.match(html, /Request not confirmed/); assert.match(html, /Retry to finish or check the same action/);
  assert.match(html, new RegExp(`<details[^>]*><summary>Action reference</summary><code>${OP}</code></details>`)); assert.match(html, /Retry same submission/); assert.match(html, /Retry rejected/);
});
test("actual storage failure keeps status visible and new action disabled", () => {
  const html = renderSection(ready({ recoveryBlocked: true, snapshot: snapshot(dto()) }));
  assert.match(html, /Request received/); assert.match(html, /Request recovery unavailable/); assert.match(html, /Restore site storage access/);
  assert.match(html, /disabled=""[^>]*>Cancel deletion request/); assert.match(html, /Refresh status/);
  assert.match(html, /href="\/contact"/); assert.ok(fs.existsSync(path.join(repo, "apps/web/app/contact/page.tsx")));
});
test("actual in-flight action is not described as a failed or unconfirmed previous action", () => {
  const html = renderSection(ready({ busy: true, intent: { operationId: OP, expectedRevision: "0", action: "submit", requestId: "" } }));
  assert.match(html, /Confirming your request action/); assert.doesNotMatch(html, /could not be confirmed|Previous action needs confirmation|Retry same submission/);
});
test("actual requested and cancelled states describe intake only", () => {
  const pending = renderSection(ready({ snapshot: snapshot(dto()) })); assert.match(pending, /Request received/); assert.match(pending, /Requested/); assert.match(pending, /Cancel deletion request/);
  const cancelled = renderSection(ready({ snapshot: snapshot(dto(REQUEST, "cancelled")) })); assert.match(cancelled, /Request cancelled/); assert.match(cancelled, /Request another review/); assert.doesNotMatch(cancelled, /data restored|erasure complete/);
});
test("quiescing status disables cancellation in the controller and explains the fixed freeze", async t => {
  const f = fixture(t, { status: snapshot(dto(), "1", quiescing) }); await f.ready();
  f.client.prepareCancel(); assert.equal(f.client.getState().confirmation, null); assert.equal(f.writes().length, 0);
  const html = renderSection(ready({ snapshot: snapshot(dto(), "1", quiescing) }));
  assert.match(html, /Account writes are frozen and public content is hidden/); assert.match(html, /can no longer be cancelled/);
  assert.doesNotMatch(html, /Cancel deletion request|leaves your current account access unchanged/);
});
test("actual status error does not invent an empty request or enable a new submission", () => {
  const html = renderSection(ready({ phase: "error", snapshot: null, error: "Status is unavailable" })); assert.match(html, /Status is unavailable/); assert.match(html, /Refresh status/); assert.doesNotMatch(html, /You have no recorded|>Request deletion review<|Request received/);
});
test("actual section hides the previous actor before prop-change effects run", () => {
  const html = renderSection(ready({ snapshot: snapshot(dto()), intent: { operationId: OP, expectedRevision: "0", action: "submit", requestId: "" }, feedback: "Private old account response" }), { actorId: B });
  assert.match(html, /Checking your request status/); assert.doesNotMatch(html, new RegExp(`${REQUEST}|${OP}|Private old account response|Retry same`));
});
test("actual signed-out section keeps only the fixed privacy return destination", () => {
  const html = renderSection({ ...clientModule().initialIntakeState(), phase: "signed-out" }, { actorId: "" });
  assert.match(html, /\/login\?next=%2Faccount%3Fsection%3Dprivacy/); assert.doesNotMatch(html, /Request received|>Request deletion review</);
});

test("actual stable auth adapter and component avoid restarts on parent render but cleanly remount for another actor", () => {
  const adapter = { exports: {} }, component = { exports: {} }, slots = [], effects = [];
  let factoryCalls = 0, starts = 0, disposals = 0, index = 0;
  const authObject = { getSession() {}, onAuthStateChange() {} };
  new Function("require", "module", "exports", compile("account-deletion-auth.ts"))(name => {
    assert.equal(name, "@/lib/supabase-browser"); return { createBrowserSupabaseClient() { factoryCalls++; return { auth: authObject }; } };
  }, adapter, adapter.exports);
  assert.equal(factoryCalls, 0);
  const stableAuth = adapter.exports.accountDeletionAuth;
  assert.equal(stableAuth(), authObject); assert.equal(stableAuth(), authObject);
  const hooks = { ...React,
    useRef(value) { const slot = index++; return slots[slot] ??= { current: value }; },
    useState(value) { const slot = index++; if (!(slot in slots)) slots[slot] = typeof value === "function" ? value() : value; return [slots[slot], next => { slots[slot] = next; }]; },
    useId() { return "fixture-id-" + index++; },
    useEffect(effect, deps) { const slot = index++, previous = slots[slot]; if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) effects.push(() => { previous?.cleanup?.(); slots[slot] = { deps, cleanup: effect() }; }); }
  };
  const client = clientModule();
  new Function("require", "module", "exports", compile("AccountDeletionSection.tsx"))(name => {
    if (name === "react") return hooks;
    if (name === "./deletion-intake-client") return { ...client, createDeletionIntakeClient({ actorId, auth }) {
      assert.equal(auth, stableAuth); return { subscribe: () => () => {}, getState: () => ready({ actorId }), start: async () => { starts++; auth(); }, dispose() { disposals++; } };
    } };
    if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    return require(name);
  }, component, component.exports);
  function render(actorId) { index = 0; component.exports.default({ actorId, auth: stableAuth }); while (effects.length) effects.shift()(); }
  render(A); render(A); render(A); assert.equal(starts, 1); assert.equal(disposals, 0);
  render(B); assert.equal(starts, 2); assert.equal(disposals, 1); assert.equal(factoryCalls, 4);
});

test("controller and actual component pass strict TypeScript without writing build artifacts", () => {
  const virtual = path.join(here, "qa-css.d.ts").replaceAll("\\", "/"), declaration = 'declare module "*.module.css" { const classes: Record<string, string>; export default classes; }';
  const options = { strict: true, noEmit: true, skipLibCheck: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, jsx: ts.JsxEmit.ReactJSX };
  const host = ts.createCompilerHost(options), getSource = host.getSourceFile.bind(host), exists = host.fileExists.bind(host), read = host.readFile.bind(host);
  host.fileExists = file => file === virtual || exists(file); host.readFile = file => file === virtual ? declaration : read(file);
  host.getSourceFile = (file, version, ...rest) => file === virtual ? ts.createSourceFile(file, declaration, version, true) : getSource(file, version, ...rest);
  host.resolveModuleNames = (names, containing) => names.map(name => ts.resolveModuleName(name, name.startsWith(".") ? containing : path.join(repo, "apps/web/qa-types.ts"), options, host).resolvedModule);
  const program = ts.createProgram([virtual, path.join(here, "deletion-intake-client.ts"), path.join(here, "AccountDeletionSection.tsx")], options, host);
  const errors = ts.getPreEmitDiagnostics(program).filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error);
  assert.deepEqual(errors.map(error => (error.file?.fileName || "") + ": " + ts.flattenDiagnosticMessageText(error.messageText, " ")), []);
});
