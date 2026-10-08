import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createMemoryDatabase, loadRoutes } from "./mock-routes.mjs";

const args = process.argv.slice(2);
const repo = path.resolve(args.includes("--repo") ? args[args.indexOf("--repo") + 1] : path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../.."));
const overlay = args.includes("--overlay") ? path.resolve(args[args.indexOf("--overlay") + 1]) : null;
const route = "apps/web/app/api/service-events/route.ts";
const code = "QRG-SAFE0001";
function fixture(patch = {}, profile = {}) {
  return createMemoryDatabase({
    guitars: [{ id: "g-1", owner_id: "owner", qr_code: code, permanent_path: "/i/" + code, visibility: "public", admin_archived_at: null, owner_removed_at: null, ...patch }],
    profiles: [{ id: "owner", account_status: "active", hide_public_content: false, ...profile }],
    guitar_timeline_events: [
      { id: "e-1", guitar_id: "g-1", title: "Public repair", description: "Public narrative", private_notes: "PRIVATE RECEIPT", is_public: true, created_at: "2026-09-01", created_by_user_id: "owner" },
      { id: "e-2", guitar_id: "g-1", title: "Private repair", description: "Secret details", private_notes: "SECRET", is_public: false, created_at: "2026-09-01", created_by_user_id: "owner" }
    ]
  });
}
for (const [label, patch, profile] of [
  ["private", { visibility: "private" }, {}],
  ["archived", { admin_archived_at: "2026-09-01" }, {}],
  ["removed", { owner_removed_at: "2026-09-01" }, {}],
  ["retired", { qr_code: "QRG-0001" }, {}],
  ["hidden owner", {}, { hide_public_content: true }],
  ["banned owner", {}, { account_status: "banned" }],
  ["removed owner", {}, { account_status: "removed" }]
]) {
  test("public service route hides " + label + " profiles before reading timeline", async () => {
    const db = fixture(patch, profile);
    const load = loadRoutes(repo, db, { overlay });
    const response = await load(route).GET(new Request("https://mock.invalid/api/service-events?code=" + (patch.qr_code || code)));
    assert.equal(response.status, 404);
    assert.equal((await response.json()).serviceEvents.length, 0);
    assert.ok(!db.calls.some((call) => call.table === "guitar_timeline_events"));
  });
}
for (const visibility of ["public", "unlisted"]) {
  test("eligible " + visibility + " direct QR service history includes only public fields", async () => {
    const db = fixture({ visibility });
    const response = await loadRoutes(repo, db, { overlay })(route).GET(new Request("https://mock.invalid/api/service-events?code=" + code));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.serviceEvents.length, 1);
    assert.equal(body.serviceEvents[0].title, "Public repair");
    assert.ok(!Object.hasOwn(body.serviceEvents[0], "privateNotes"));
  });
}
test("owner scope can read private history of their own private profile", async () => {
  const db = fixture({ visibility: "private" });
  const response = await loadRoutes(repo, db, { overlay, user: { id: "owner", email: "owner@example.test" } })(route).GET(new Request("https://mock.invalid/api/service-events?scope=owner&code=" + code));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.serviceEvents.length, 2);
  assert.equal(body.serviceEvents[0].privateNotes, "PRIVATE RECEIPT");
});
test("unrelated signed-in user cannot read owner scope", async () => {
  const db = fixture();
  const response = await loadRoutes(repo, db, { overlay, user: { id: "stranger" } })(route).GET(new Request("https://mock.invalid/api/service-events?scope=owner&code=" + code));
  assert.equal(response.status, 403);
});
test("owner moderation lookup failure fails closed", async () => {
  const db = fixture();
  const original = db.from;
  db.from = (table) => table === "profiles" ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ error: { message: "offline" }, data: null }) }) }) } : original(table);
  const response = await loadRoutes(repo, db, { overlay })(route).GET(new Request("https://mock.invalid/api/service-events?code=" + code));
  assert.equal(response.status, 503);
  assert.ok(!db.calls.some((call) => call.table === "guitar_timeline_events"));
});

