import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createMemoryDatabase, loadRoutes } from "./mock-routes.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const routePath = "apps/web/app/api/ownership-claims/route.ts";
const owner = { id: "owner", email: "owner@example.invalid" }, claimant = { id: "claimant", email: "claimant@example.invalid" };
const evidence = (bytes = 1, patch = {}) => ({ name: "synthetic.pdf", dataUrl: "data:application/pdf;base64," + Buffer.alloc(bytes, 97).toString("base64"), type: "ownership_document", ...patch });
const claimBody = (files = [evidence()]) => ({ identifier: "QRG-TEST", claimType: "store_purchase", acquisitionDetails: "Bought from a store with a matching invoice.", ownershipDeclaration: "I own this instrument and can provide the purchase records.", evidence: files });
const request = (method = "GET", body) => new Request("https://test.invalid/api/ownership-claims", { method, ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}) });
function fixture({ user = owner, adminSource = "none", hooks = {}, fresh = false, signer, rpc } = {}) {
  const tables = {
    ownership_claims: fresh ? [] : [{ id: "claim-one", guitar_id: "guitar-one", status: "awaiting_owner", current_owner_id: owner.id, claimant_user_id: claimant.id, expires_at: "2099-01-01T00:00:00Z", decided_by: null }],
    guitars: [{ id: "guitar-one", owner_id: owner.id, qr_code: "QRG-TEST", name: "Synthetic instrument", admin_archived_at: null, owner_removed_at: null }],
    ownership_claim_evidence: fresh ? [] : [{ id: "evidence-one", claim_id: "claim-one", evidence_type: "invoice", file_name: "synthetic.pdf", storage_path: "claims/claim-one/claimant/synthetic.pdf", created_at: "2026-09-17T00:00:00Z" }]
  };
  const db = createMemoryDatabase(tables, hooks);
  // The shared fixture does not need PostgREST OR elsewhere. Keep this route-specific extension local.
  const from = db.from;
  db.from = (table) => {
    const query = from(table);
    query.or = (expression) => {
      const conditions = expression.split(",").map((value) => value.split(".eq."));
      query.filters.push((row) => conditions.some(([key, value]) => row[key] === value)); return query;
    };
    return query;
  };
  const uploads = [], removals = [], rpcCalls = [];
  db.storage = { from: () => ({
    upload: async (name, bytes) => { uploads.push({ name, size: bytes.length }); return { error: null }; },
    remove: async (names) => { removals.push(...names); return { error: null }; },
    createSignedUrl: signer || (async (name) => ({ data: { signedUrl: "https://storage.example.invalid/" + name }, error: null }))
  }) };
  db.rpc = async (name, args) => { rpcCalls.push({ name, args }); return rpc ? rpc(name, args) : { data: { ok: true, claim_id: args.p_claim_id }, error: null }; };
  const route = loadRoutes(repo, db, { user, modules: { "apps/web/lib/admin-auth.ts": {
    assertAccountCanWrite: async () => ({ ok: true }),
    getAdminContext: async () => ({ ok: adminSource !== "none", accessSource: adminSource })
  } } })(routePath);
  return { db, tables, uploads, removals, rpcCalls, route, writes: () => db.calls.filter((call) => call.operation !== "select") };
}

for (const method of ["GET", "POST", "PATCH"]) test(`${method} requires authentication before accessing ownership data`, async () => {
  const f = fixture({ user: null });
  assert.equal((await f.route[method](request(method, method === "GET" ? undefined : {}))).status, 401);
  assert.equal(f.db.calls.length, 0); assert.equal(f.uploads.length, 0);
});
test("owner list exposes its private review evidence and excludes unrelated claims", async () => {
  const f = fixture(); f.tables.ownership_claims.push({ id: "foreign", guitar_id: "guitar-one", current_owner_id: "other", claimant_user_id: "stranger" });
  const response = await f.route.GET(request());
  assert.equal(response.status, 200); assert.match(response.headers.get("cache-control"), /no-store/);
  const body = await response.json(); assert.deepEqual(body.claims.map((item) => item.id), ["claim-one"]); assert.equal(body.claims[0].evidenceCount, 1); assert.equal(body.claims[0].evidence.length, 1);
});
for (const status of ["awaiting_claimant", "awaiting_owner", "admin_review", "approved", "denied", "cancelled", "expired", "unknown"]) {
  for (const actor of ["claimant", "owner", "admin"]) test(`GET canWithdraw is server-derived for ${actor} / ${status}`, async () => {
    const user = actor === "claimant" ? claimant : actor === "owner" ? owner : { id: "reviewer", email: "reviewer@example.invalid" };
    const f = fixture({ user, adminSource: actor === "admin" ? "role" : "none" });
    f.tables.ownership_claims[0].status = status;
    const response = await f.route.GET(request()); assert.equal(response.status, 200);
    const { claims } = await response.json(); assert.equal(claims.length, 1);
    assert.equal(claims[0].canWithdraw, actor === "claimant" && ["awaiting_claimant", "awaiting_owner", "admin_review"].includes(status));
    assert.equal(claims[0].claimant_user_id, undefined); assert.equal(claims[0].claimantUserId, undefined);
    assert.equal(claims[0].current_owner_id, undefined); assert.equal(f.writes().length, 0);
  });
}
test("claimant who is also admin retains claimant-only withdrawal eligibility", async () => {
  const f = fixture({ user: claimant, adminSource: "role" });
  const body = await (await f.route.GET(request())).json(); assert.equal(body.claims[0].canWithdraw, true);
});
test("unrelated non-admin sees no claim or withdrawal eligibility", async () => {
  const f = fixture({ user: { id: "stranger", email: "stranger@example.invalid" } });
  assert.deepEqual((await (await f.route.GET(request())).json()).claims, []); assert.equal(f.writes().length, 0);
});
test("POST receipt includes claimant withdrawal eligibility without exposing claimant identity", async () => {
  const f = fixture({ user: claimant, fresh: true });
  const response = await f.route.POST(request("POST", claimBody())); assert.equal(response.status, 201);
  const { claim } = await response.json(); assert.equal(claim.canWithdraw, true); assert.equal(claim.claimant_user_id, undefined);
});
for (const actor of ["owner", "admin"]) test(`PATCH cancel still denies ${actor} even with forged eligibility`, async () => {
  const f = fixture({ user: actor === "owner" ? owner : { id: "reviewer", email: "reviewer@example.invalid" }, adminSource: actor === "admin" ? "role" : "none" });
  const response = await f.route.PATCH(request("PATCH", { id: "claim-one", action: "cancel", canWithdraw: true }));
  assert.equal(response.status, 403); assert.equal(f.writes().length, 0); assert.equal(f.tables.ownership_claims[0].status, "awaiting_owner");
});
test("claimant cancellation closes request without changing Profile or evidence; closed replay stays conflict", async () => {
  const f = fixture({ user: claimant });
  const before = JSON.stringify({ guitars: f.tables.guitars, evidence: f.tables.ownership_claim_evidence });
  assert.equal((await f.route.PATCH(request("PATCH", { id: "claim-one", action: "cancel" }))).status, 200);
  assert.equal(f.tables.ownership_claims[0].status, "cancelled");
  assert.equal(JSON.stringify({ guitars: f.tables.guitars, evidence: f.tables.ownership_claim_evidence }), before);
  assert.equal((await (await f.route.GET(request())).json()).claims[0].canWithdraw, false);
  const writes = f.writes().length;
  assert.equal((await f.route.PATCH(request("PATCH", { id: "claim-one", action: "cancel" }))).status, 409);
  assert.equal(f.writes().length, writes);
});

for (const table of ["guitars", "ownership_claim_evidence"]) test(`${table} read failure is not missing metadata or zero evidence`, async () => {
  const f = fixture({ hooks: { before(query) { if (query.table === table) return { data: null, error: { message: "Synthetic read failure" } }; } } });
  const response = await f.route.GET(request()); assert.equal(response.status, 503); assert.equal((await response.json()).claims, undefined);
});
for (const failure of ["error", "missing", "throw"]) test(`private evidence signing ${failure} remains a retryable read failure`, async () => {
  const f = fixture({ signer: async () => { if (failure === "throw") throw new Error("Signing unavailable"); return failure === "error" ? { data: null, error: { message: "Signing unavailable" } } : { data: {} }; } });
  const response = await f.route.GET(request()); assert.equal(response.status, 503); assert.equal((await response.json()).claims, undefined);
});
test("claim lookup outage is unavailable, while genuinely missing claim is not found", async () => {
  const f = fixture({ hooks: { before(query) { if (query.table === "ownership_claims") return { data: null, error: { message: "Synthetic outage" } }; } } });
  assert.equal((await f.route.PATCH(request("PATCH", { id: "claim-one", action: "approve" }))).status, 503);
  const missing = fixture({ fresh: true }); assert.equal((await missing.route.PATCH(request("PATCH", { id: "missing", action: "approve" }))).status, 404);
});
test("POST duplicate-check failure cannot create another request or upload evidence", async () => {
  const f = fixture({ user: claimant, fresh: true, hooks: { before(query) { if (query.table === "ownership_claims") return { data: null, error: { message: "Synthetic duplicate check outage" } }; } } });
  assert.equal((await f.route.POST(request("POST", claimBody()))).status, 503); assert.equal(f.writes().length, 0); assert.equal(f.uploads.length, 0);
});
test("POST matching Profile read outage is not a false not-found result", async () => {
  const f = fixture({ user: claimant, fresh: true, hooks: { before(query) { if (query.table === "guitars" && query.columns !== "id") return { data: null, error: { message: "Synthetic Profile outage" } }; } } });
  assert.equal((await f.route.POST(request("POST", claimBody()))).status, 503); assert.equal(f.writes().length, 0);
});
for (const field of ["admin_archived_at", "owner_removed_at"]) test(`POST refuses ${field} Profile without storing files`, async () => {
  const f = fixture({ user: claimant, fresh: true }); f.tables.guitars[0][field] = "2026-09-17T00:00:00Z";
  assert.equal((await f.route.POST(request("POST", claimBody()))).status, 404); assert.equal(f.writes().length, 0); assert.equal(f.uploads.length, 0);
});
for (const method of ["POST", "PATCH"]) for (const sizes of [[3_000_001], [1_500_001, 1_500_000]]) test(`${method} rejects ${sizes.join("+")} bytes before any evidence or claim write`, async () => {
  const f = fixture({ user: claimant, fresh: method === "POST" }); if (method === "PATCH") f.tables.ownership_claims[0].status = "awaiting_claimant";
  const body = method === "POST" ? claimBody(sizes.map((size) => evidence(size))) : { id: "claim-one", action: "resubmit", evidence: sizes.map((size) => evidence(size)) };
  const response = await f.route[method](request(method, body)); assert.equal(response.status, 400); assert.match((await response.json()).message, /3 MB/);
  assert.equal(f.writes().length, 0); assert.equal(f.uploads.length, 0);
});
test("3 MB combined evidence is accepted and all files retain their intended bytes", async () => {
  const f = fixture({ user: claimant, fresh: true });
  const response = await f.route.POST(request("POST", claimBody([evidence(1_500_000), evidence(1_500_000)])));
  assert.equal(response.status, 201); assert.deepEqual(f.uploads.map(({ size }) => size), [1_500_000, 1_500_000]); assert.equal(f.tables.ownership_claims.length, 1);
});
for (const action of ["approve", "resubmit"]) test(`${action} rejects expired request before RPC or upload`, async () => {
  const f = fixture({ user: action === "approve" ? owner : claimant });
  Object.assign(f.tables.ownership_claims[0], { status: action === "approve" ? "awaiting_owner" : "awaiting_claimant", expires_at: "2000-01-01T00:00:00Z" });
  assert.equal((await f.route.PATCH(request("PATCH", { id: "claim-one", action, evidence: [evidence()] }))).status, 409);
  assert.equal(f.rpcCalls.length, 0); assert.equal(f.uploads.length, 0); assert.equal(f.writes().length, 0);
});
for (const adminSource of ["none", "role", "env"]) test(`approval passes authenticated reviewer and server-derived ${adminSource} admin source`, async () => {
  const f = fixture({ adminSource });
  const response = await f.route.PATCH(request("PATCH", { id: "claim-one", action: "approve", note: "Reviewed synthetic evidence", decidedBy: "forged", envAdmin: true, p_env_admin: true }));
  assert.equal(response.status, 200); assert.equal(f.rpcCalls.length, 1); assert.equal(f.rpcCalls[0].name, "approve_ownership_claim");
  assert.deepEqual(JSON.parse(JSON.stringify(f.rpcCalls[0].args)), { p_claim_id: "claim-one", p_decided_by: owner.id, p_decision_note: "Reviewed synthetic evidence", p_env_admin: adminSource === "env" });
});
test("committed approval replays only for original reviewer even after expiry", async () => {
  const f = fixture(); Object.assign(f.tables.ownership_claims[0], { status: "approved", decided_by: owner.id, expires_at: "2000-01-01T00:00:00Z" });
  assert.equal((await f.route.PATCH(request("PATCH", { id: "claim-one", action: "approve" }))).status, 200); assert.equal(f.rpcCalls.length, 1);
  const other = fixture({ user: claimant }); Object.assign(other.tables.ownership_claims[0], { status: "approved", decided_by: owner.id });
  assert.equal((await other.route.PATCH(request("PATCH", { id: "claim-one", action: "approve" }))).status, 409); assert.equal(other.rpcCalls.length, 0);
});
for (const result of [null, {}, { ok: true, claim_id: "other" }]) test(`missing or mismatched approval receipt ${JSON.stringify(result)} is unconfirmed`, async () => {
  const f = fixture({ rpc: async () => ({ data: result, error: null }) });
  const response = await f.route.PATCH(request("PATCH", { id: "claim-one", action: "approve" })); assert.equal(response.status, 503); assert.equal((await response.json()).uncertain, true);
});
for (const failure of ["throw", "transport-error"]) test(`approval ${failure} returns unconfirmed state for safe recovery`, async () => {
  const f = fixture({ rpc: async () => { if (failure === "throw") throw new Error("Reply lost after commit"); return { data: null, error: { message: "fetch failed" } }; } });
  const response = await f.route.PATCH(request("PATCH", { id: "claim-one", action: "approve" })); assert.equal(response.status, 503); assert.equal((await response.json()).uncertain, true);
});
