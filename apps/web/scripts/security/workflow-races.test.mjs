import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createMemoryDatabase, loadRoutes } from "./mock-routes.mjs";
const args = process.argv.slice(2);
const repo = path.resolve(args.includes("--repo") ? args[args.indexOf("--repo") + 1] : path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../.."));
const overlay = args.includes("--overlay") ? path.resolve(args[args.indexOf("--overlay") + 1]) : null;
const claimFile = "apps/web/app/api/ownership-claims/route.ts";
const serviceFile = "apps/web/app/api/service-submissions/route.ts";
function request(body) { return new Request("https://fixture.invalid", { method: "PATCH", body: JSON.stringify(body) }); }
test("memory RPC remains lazy, single-execution and fail-closed without an explicit handler", async () => {
  const absent = createMemoryDatabase({});
  const unsupported = absent.rpc("unsupported", {}).abortSignal(AbortSignal.timeout(1000));
  assert.equal(absent.calls.length, 0);
  await assert.rejects(async () => await unsupported, /Unexpected RPC/);
  let executions = 0;
  const db = createMemoryDatabase({}, { rpc: () => { executions++; return { data: true, error: null }; } });
  const query = db.rpc("explicit_fixture", {}).abortSignal(AbortSignal.timeout(1000));
  assert.deepEqual(await query, { data: true, error: null });
  assert.deepEqual(await query, { data: true, error: null });
  assert.equal(executions, 1);
  assert.equal(db.calls.length, 1);
});
test("aborted memory RPC never reaches its handler", async () => {
  let executions = 0;
  const db = createMemoryDatabase({}, { rpc: () => { executions++; } });
  const query = db.rpc("explicit_fixture", {}).abortSignal(AbortSignal.abort());
  await assert.rejects(async () => await query, { name: "AbortError" });
  assert.equal(executions, 0);
  assert.equal(db.calls.length, 0);
});
function claimFixture(status = "awaiting_owner") {
  return createMemoryDatabase({
    ownership_claims: [{ id: "claim", guitar_id: "guitar", status, current_owner_id: "owner", claimant_user_id: "claimant" }],
    guitars: [{ id: "guitar", owner_id: "owner" }]
  });
}
for (const action of ["cancel", "deny", "request_information", "expire"]) {
  test("claim " + action + " cannot overwrite a concurrent completed approval", async () => {
    const db = claimFixture();
    const user = { id: action === "cancel" ? "claimant" : "owner" };
    const load = loadRoutes(repo, db, {
      overlay, user, isAdmin: ["request_information", "expire"].includes(action),
      afterAdmin: () => {
        db.tables.ownership_claims[0].status = "approved";
        db.tables.guitars[0].owner_id = "claimant";
      }
    });
    const response = await load(claimFile).PATCH(request({ id: "claim", action, note: "Concurrent review fixture" }));
    assert.equal(response.status, 409);
    assert.equal(db.tables.ownership_claims[0].status, "approved");
    assert.equal(db.tables.guitars[0].owner_id, "claimant");
    assert.equal((db.tables.ownership_claim_events || []).length, 0);
  });
}
test("a successful claim cancellation reflects an actual updated row", async () => {
  const db = claimFixture();
  const response = await loadRoutes(repo, db, { overlay, user: { id: "claimant" } })(claimFile).PATCH(request({ id: "claim", action: "cancel" }));
  assert.equal(response.status, 200);
  assert.equal(db.tables.ownership_claims[0].status, "cancelled");
  assert.equal(db.tables.ownership_claim_events.length, 1);
});
test("an unsupported claim action never falls through to ownership approval", async () => {
  const db = claimFixture();
  const response = await loadRoutes(repo, db, { overlay, user: { id: "owner" } })(claimFile).PATCH(request({ id: "claim", action: "aprove" }));
  assert.equal(response.status, 400);
  assert.equal(db.tables.ownership_claims[0].status, "awaiting_owner");
});
test("conflicting evidence resubmission returns 409 and cleans up only new uploads", async () => {
  const db = claimFixture("awaiting_claimant");
  const uploaded = [], removed = [];
  db.storage = { from: () => ({ upload: async (name) => { uploaded.push(name); return { error: null }; }, remove: async (names) => { removed.push(...names); return { error: null }; } }) };
  const load = loadRoutes(repo, db, { overlay, user: { id: "claimant" }, afterAdmin: () => { db.tables.ownership_claims[0].status = "cancelled"; } });
  const response = await load(claimFile).PATCH(request({ id: "claim", action: "resubmit", evidence: [{ name: "current-photo.png", dataUrl: "data:image/png;base64,YQ==" }] }));
  assert.equal(response.status, 409);
  assert.equal(db.tables.ownership_claims[0].status, "cancelled");
  assert.equal(uploaded.length, 1);
  assert.deepEqual(removed, uploaded);
  assert.equal(db.tables.ownership_claim_evidence.length, 0);
});
function serviceFixture(status = "submitted") {
  const tables = {
    service_submissions: [{ id: "submission", guitar_id: "guitar", status, owner_user_id: "owner", provider_user_id: "provider", title: "Approved description", service_date: "2026-09-01", service_type: "Repair", work_performed: "Original work" }],
    guitars: [{ id: "guitar", owner_id: "owner", qr_code: "QRG-SYNTH001", name: "Synthetic", visibility: "public" }],
    guitar_timeline_events: [],
    profiles: [{ id: "provider", account_status: "active", role: "owner" }],
    auth_users: [{ id: "provider" }], account_deletion_requests: []
  };
  return createMemoryDatabase(tables, { rpc(name, args, signal) {
    assert.equal(name, "cancel_service_submission");
    assert.ok(signal instanceof AbortSignal);
    assert.equal(signal.aborted, false);
    const fail = (code) => ({ data: null, error: { code, message: "Synthetic cancellation rejected" } });
    // Model the current locked-row decisions and atomic receipt, not a stale HTTP snapshot.
    // PostgreSQL locking and trigger behavior are covered by the native database suites.
    const row = tables.service_submissions.find(value => value.id === args.p_submission_id);
    if (!row || !tables.guitars.some(value => value.id === row.guitar_id)) return fail("22023");
    const actor = tables.profiles.find(value => value.id === args.p_actor_id);
    if (!actor || actor.account_status !== "active" || !tables.auth_users.some(value => value.id === args.p_actor_id)
      || tables.account_deletion_requests.some(value => value.actor_id === args.p_actor_id && value.status === "requested")) return fail("42501");
    const provider = row.provider_user_id === args.p_actor_id;
    if (!provider && actor.role !== "admin" && args.p_env_admin !== true) return fail("42501");
    if (row.status === "cancelled") return { data: { ok: true, submission: structuredClone(row), alreadyCancelled: true }, error: null };
    if (!["draft", "submitted", "changes_requested"].includes(row.status)) return fail("40001");
    if ((args.p_note || "").length > 2000) return fail("22023");
    Object.assign(row, { status: "cancelled", cancelled_at: "2026-09-27T00:00:00.000Z", updated_at: "2026-09-27T00:00:00.000Z", service_cancel_recipient_role: provider ? "owner" : "provider" });
    (tables.service_submission_activity ||= []).push({ submission_id: row.id, actor_user_id: args.p_actor_id, action: "cancelled", note: args.p_note?.trim() || null });
    const recipient = provider ? row.owner_user_id : row.provider_user_id;
    if (recipient) (tables.service_submission_notifications ||= []).push({ submission_id: row.id, recipient_user_id: recipient, notification_type: "cancelled" });
    return { data: { ok: true, submission: structuredClone(row), alreadyCancelled: false }, error: null };
  } });
}
for (const [action, status] of [["cancel", "submitted"], ["save_draft", "draft"], ["submit", "draft"], ["revise", "changes_requested"]]) {
  test("service " + action + " cannot alter an approval committed after its initial read", async () => {
    const db = serviceFixture(status);
    const load = loadRoutes(repo, db, {
      overlay, user: { id: "provider" },
      afterAdmin: () => {
        Object.assign(db.tables.service_submissions[0], { status: "approved", resulting_timeline_event_id: "published", resulting_service_event_id: "published" });
        db.tables.guitar_timeline_events.push({ id: "published", guitar_id: "guitar", is_public: true });
      }
    });
    const response = await load(serviceFile).PATCH(request({ id: "submission", action, title: "Unapproved replacement", workPerformed: "Unapproved changes" }));
    assert.equal(response.status, action === "cancel" ? 503 : 409);
    if (action === "cancel") {
      const body = await response.json();
      assert.equal(body.ok, false);
      assert.equal(body.code, "unconfirmed");
      assert.notEqual(body.committed, true);
      const rpc = db.calls.filter(call => call.operation === "rpc");
      assert.equal(rpc.length, 1);
      assert.equal(rpc[0].name, "cancel_service_submission");
      assert.equal(db.calls.some(call => ["update", "insert"].includes(call.operation)), false);
    }
    assert.equal(db.tables.service_submissions[0].status, "approved");
    assert.equal(db.tables.service_submissions[0].title, "Approved description");
    assert.equal(db.tables.guitar_timeline_events.length, 1);
    assert.equal((db.tables.service_submission_notifications || []).length, 0);
    assert.equal((db.tables.service_submission_activity || []).length, 0);
  });
}
test("successful service cancellation has no public event and records the actual cancellation", async () => {
  const db = serviceFixture();
  const route = loadRoutes(repo, db, { overlay, user: { id: "provider" } })(serviceFile);
  const response = await route.PATCH(request({ id: "submission", action: "cancel", note: "  private cancellation  ", p_actor_id: "owner", p_env_admin: true }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.committed, true);
  assert.equal(body.alreadyCancelled, false);
  assert.equal(db.tables.service_submissions[0].status, "cancelled");
  assert.equal(db.tables.guitar_timeline_events.length, 0);
  assert.equal(db.tables.service_submission_activity[0].action, "cancelled");
  assert.equal(db.tables.service_submission_notifications[0].recipient_user_id, "owner");
  assert.deepEqual(db.calls.find(call => call.operation === "rpc").args, { p_submission_id: "submission", p_actor_id: "provider", p_env_admin: false, p_note: "private cancellation" });
  const replay = await route.PATCH(request({ id: "submission", action: "cancel" }));
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).alreadyCancelled, true);
  assert.equal(db.tables.service_submission_activity.length, 1);
  assert.equal(db.tables.service_submission_notifications.length, 1);
  assert.equal(db.calls.filter(call => call.operation === "rpc").length, 2);
  assert.equal(db.calls.some(call => ["update", "insert"].includes(call.operation)), false);
});

for (const status of ["approved", "declined", "expired"]) test("already closed service " + status + " returns conflict without RPC", async () => {
  const db = serviceFixture(status);
  const response = await loadRoutes(repo, db, { overlay, user: { id: "provider" } })(serviceFile).PATCH(request({ id: "submission", action: "cancel" }));
  assert.equal(response.status, 409);
  assert.equal(db.calls.some(call => call.operation === "rpc" || ["update", "insert"].includes(call.operation)), false);
  assert.equal(db.tables.service_submissions[0].status, status);
});

for (const change of ["locked", "deleting"]) test("atomic service cancellation rechecks actor " + change + " after initial authorization", async () => {
  const db = serviceFixture();
  const route = loadRoutes(repo, db, { overlay, user: { id: "provider" }, afterAdmin: () => {
    if (change === "locked") db.tables.profiles[0].account_status = "locked";
    else db.tables.account_deletion_requests.push({ actor_id: "provider", status: "requested" });
  } })(serviceFile);
  const response = await route.PATCH(request({ id: "submission", action: "cancel" }));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "unconfirmed");
  assert.equal(db.calls.filter(call => call.operation === "rpc").length, 1);
  assert.equal(db.tables.service_submissions[0].status, "submitted");
  assert.equal((db.tables.service_submission_activity || []).length, 0);
  assert.equal((db.tables.service_submission_notifications || []).length, 0);
});
test("unrelated actors still cannot cancel claims or provider submissions", async () => {
  for (const [file, db, id] of [[claimFile, claimFixture(), "claim"], [serviceFile, serviceFixture(), "submission"]]) {
    const response = await loadRoutes(repo, db, { overlay, user: { id: "stranger" } })(file).PATCH(request({ id, action: "cancel" }));
    assert.equal(response.status, 403);
  }
});
