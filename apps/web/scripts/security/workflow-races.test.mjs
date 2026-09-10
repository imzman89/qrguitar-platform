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
  return createMemoryDatabase({
    service_submissions: [{ id: "submission", guitar_id: "guitar", status, owner_user_id: "owner", provider_user_id: "provider", title: "Approved description", service_date: "2026-09-01", service_type: "Repair", work_performed: "Original work" }],
    guitars: [{ id: "guitar", owner_id: "owner", qr_code: "QRG-SYNTH001", name: "Synthetic", visibility: "public" }],
    guitar_timeline_events: []
  });
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
    assert.equal(response.status, 409);
    assert.equal(db.tables.service_submissions[0].status, "approved");
    assert.equal(db.tables.service_submissions[0].title, "Approved description");
    assert.equal(db.tables.guitar_timeline_events.length, 1);
    assert.equal((db.tables.service_submission_notifications || []).length, 0);
    assert.equal((db.tables.service_submission_activity || []).length, 0);
  });
}
test("successful service cancellation has no public event and records the actual cancellation", async () => {
  const db = serviceFixture();
  const response = await loadRoutes(repo, db, { overlay, user: { id: "provider" } })(serviceFile).PATCH(request({ id: "submission", action: "cancel" }));
  assert.equal(response.status, 200);
  assert.equal(db.tables.service_submissions[0].status, "cancelled");
  assert.equal(db.tables.guitar_timeline_events.length, 0);
  assert.equal(db.tables.service_submission_activity[0].action, "cancelled");
});
test("unrelated actors still cannot cancel claims or provider submissions", async () => {
  for (const [file, db, id] of [[claimFile, claimFixture(), "claim"], [serviceFile, serviceFixture(), "submission"]]) {
    const response = await loadRoutes(repo, db, { overlay, user: { id: "stranger" } })(file).PATCH(request({ id, action: "cancel" }));
    assert.equal(response.status, 403);
  }
});
