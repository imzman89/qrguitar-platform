import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createMemoryDatabase, loadRoutes } from "./mock-routes.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const provider = { id: "provider-one", email: "provider@example.invalid" };
const owner = { id: "owner-one", email: "owner@example.invalid" };
const request = (query = "scope=provider") => new Request(`https://test.invalid/api/service-submissions?${query}`);
function fixture(hooks = {}, user = provider) {
  const tables = {
    service_submissions: [
      { id: "own-request", guitar_id: "guitar-one", owner_user_id: owner.id, provider_user_id: provider.id, title: "Fret dress", status: "draft", email_delivery_status: "not_attempted", provider_revision: 0 },
      { id: "other-request", guitar_id: "guitar-two", owner_user_id: owner.id, provider_user_id: "other-provider", title: "Other provider work", status: "submitted" }
    ],
    guitars: [{ id: "guitar-one", owner_id: owner.id, qr_code: "QRG-ONE", name: "Workshop guitar" }, { id: "guitar-two", owner_id: owner.id, qr_code: "QRG-TWO" }],
    service_provider_profiles: [{ user_id: provider.id, public_display_name: "Test provider", verification_status: "unverified" }],
    service_submission_evidence: [{ id: "e1", submission_id: "own-request" }, { id: "e2", submission_id: "own-request" }, { id: "foreign-evidence", submission_id: "other-request" }],
    service_submission_activity: [{ id: "a1", submission_id: "own-request", action: "draft_created", created_at: "2026-09-17T00:00:00Z" }]
  };
  const db = createMemoryDatabase(tables, hooks);
  const route = loadRoutes(repo, db, { user })("apps/web/app/api/service-submissions/route.ts");
  return { tables, db, route };
}
let passes = 0;
async function test(name, run) { await run(); passes++; console.log("PASS " + name); }
await test("provider list contains only the authenticated provider's work and actual evidence count", async () => {
  const f = fixture();
  const response = await f.route.GET(request());
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /no-store/);
  const body = await response.json();
  assert.deepEqual(body.submissions.map((row) => row.id), ["own-request"]);
  assert.equal(body.submissions[0].qrCode, "QRG-ONE");
  assert.equal(body.submissions[0].evidenceCount, 2);
  assert.equal(body.submissions[0].status, "draft");
  assert.equal(body.submissions[0].emailDeliveryStatus, "not_attempted");
  assert.equal(f.db.calls.every((call) => call.operation === "select"), true);
});
for (const table of ["guitars", "service_provider_profiles", "service_submission_evidence", "service_submission_activity"]) {
  await test(`${table} failure cannot become missing metadata, zero evidence, or empty activity`, async () => {
    const f = fixture({ before(query) { if (query.table === table) return { data: null, error: { message: "Synthetic related-read outage" } }; } });
    const response = await f.route.GET(request("id=own-request"));
    assert.equal(response.status, 500);
    const body = await response.json();
    assert.equal(body.ok, false);
    assert.equal(body.submissions, undefined);
    assert.match(body.message, /outage/);
    assert.equal(f.db.calls.every((call) => call.operation === "select"), true);
  });
}
await test("list does not request activity that it does not display", async () => {
  const f = fixture({ before(query) { if (query.table === "service_submission_activity") throw new Error("Unexpected activity read"); } });
  assert.equal((await f.route.GET(request())).status, 200);
});
await test("empty provider account is a successful empty list without related reads", async () => {
  const f = fixture(); f.tables.service_submissions = [];
  const response = await f.route.GET(request());
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).submissions, []);
  assert.deepEqual(f.db.calls.map((call) => call.table), ["service_submissions"]);
});
await test("an unrelated provider cannot inspect a request by ID", async () => {
  const f = fixture();
  assert.equal((await f.route.GET(request("id=other-request"))).status, 403);
  assert.deepEqual(f.db.calls.map((call) => call.table), ["service_submissions"]);
});
await test("owner scope still returns owner requests across providers", async () => {
  const f = fixture({}, owner);
  const response = await f.route.GET(request("scope=owner"));
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).submissions.map((row) => row.id), ["own-request", "other-request"]);
});
await test("unauthenticated requests do not read any service data", async () => {
  const f = fixture({}, null);
  assert.equal((await f.route.GET(request())).status, 401);
  assert.equal(f.db.calls.length, 0);
});

function privateAccessFixture(hooks = {}) {
  const guitar = { id: "grant-guitar", owner_id: owner.id, visibility: "private" };
  const grant = {
    id: "grant-one", guitar_id: guitar.id, provider_user_id: provider.id,
    granted_by_user_id: owner.id, expires_at: null, revoked_at: null
  };
  const tables = { service_provider_profile_access: [grant] };
  const db = createMemoryDatabase(tables, hooks);
  const workflow = loadRoutes(repo, db, { user: provider })("apps/web/lib/service-workflow.ts");
  return { guitar, grant, db, workflow };
}
await test("private provider consent does not carry from the old owner to a new owner", async () => {
  const f = privateAccessFixture();
  assert.equal(await f.workflow.canProviderAccessGuitar(f.db, f.guitar, provider), true);
  f.guitar.owner_id = "owner-two";
  assert.equal(await f.workflow.canProviderAccessGuitar(f.db, f.guitar, provider), false);
  assert.equal(f.db.calls.every((call) => call.operation === "select"), true);
});
await test("the new owner's explicit private provider grant permits a new request", async () => {
  const f = privateAccessFixture();
  f.guitar.owner_id = "owner-two"; f.grant.granted_by_user_id = "owner-two";
  assert.equal(await f.workflow.canProviderAccessGuitar(f.db, f.guitar, provider), true);
  assert.equal(f.db.calls.every((call) => call.operation === "select"), true);
});
await test("private provider consent remains scoped to the exact Profile and provider", async () => {
  const f = privateAccessFixture();
  f.grant.guitar_id = "other-guitar";
  assert.equal(await f.workflow.canProviderAccessGuitar(f.db, f.guitar, provider), false);
  f.grant.guitar_id = f.guitar.id; f.grant.provider_user_id = "other-provider";
  assert.equal(await f.workflow.canProviderAccessGuitar(f.db, f.guitar, provider), false);
});
await test("current-owner private grants still require nonrevoked and unexpired access", async () => {
  const f = privateAccessFixture();
  f.grant.revoked_at = "2026-09-01T00:00:00Z";
  assert.equal(await f.workflow.canProviderAccessGuitar(f.db, f.guitar, provider), false);
  f.grant.revoked_at = null; f.grant.expires_at = new Date(Date.now() - 60_000).toISOString();
  assert.equal(await f.workflow.canProviderAccessGuitar(f.db, f.guitar, provider), false);
  f.grant.expires_at = new Date(Date.now() + 60_000).toISOString();
  assert.equal(await f.workflow.canProviderAccessGuitar(f.db, f.guitar, provider), true);
  f.grant.expires_at = null;
  assert.equal(await f.workflow.canProviderAccessGuitar(f.db, f.guitar, provider), true);
});
await test("ownerless Profiles and owner self-submissions remain ineligible without grant reads", async () => {
  const f = privateAccessFixture();
  f.guitar.owner_id = null;
  assert.equal(await f.workflow.canProviderAccessGuitar(f.db, f.guitar, provider), false);
  f.guitar.owner_id = provider.id;
  assert.equal(await f.workflow.canProviderAccessGuitar(f.db, f.guitar, provider), false);
  assert.equal(f.db.calls.length, 0);
});
await test("public and unlisted provider submissions retain their existing no-grant contract", async () => {
  const f = privateAccessFixture();
  f.guitar.owner_id = "owner-two";
  for (const visibility of ["public", "unlisted"]) {
    f.guitar.visibility = visibility;
    assert.equal(await f.workflow.canProviderAccessGuitar(f.db, f.guitar, provider), true);
  }
  assert.equal(f.db.calls.length, 0);
});
await test("a private access read failure never becomes permission", async () => {
  const f = privateAccessFixture({ before() { return { data: null, error: { message: "Synthetic grant read outage" } }; } });
  await assert.rejects(() => f.workflow.canProviderAccessGuitar(f.db, f.guitar, provider), /grant read outage/);
});
console.log(`${passes} service submission read cases passed.`);
