import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createMemoryDatabase, loadRoutes } from "./mock-routes.mjs";
const args = process.argv.slice(2);
const option = (name) => args[args.indexOf(name) + 1];
const repo = path.resolve(args.includes("--repo") ? option("--repo") : path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../.."));
const overlay = args.includes("--overlay") ? path.resolve(option("--overlay")) : null;
const user = { id: "11111111-1111-4111-8111-111111111111", email: "synthetic@example.test", user_metadata: { display_name: "Old", unchanged: "metadata" } };
const collection = { enabled: true, handle: "valid-handle", publicName: "Collection", accountType: "collector" };
const req = (body) => new Request("https://test.invalid/api/account", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
function fixture(hooks = {}) {
  const tables = {
    profiles: [{ id: user.id, display_name: "Old", role: "shop", plan: "business", account_status: "active" }],
    site_content: [{ content_key: "public_collection_owner:" + user.id, content_value: collection }],
    guitars: Array.from({ length: 3306 }, (_, i) => ({ id: String(i), owner_id: user.id,
      owner_removed_at: null, visibility: ["public", "private", "unlisted"][i % 3], hero_image_path: i % 2 === 0 ? "image.jpg" : null }))
      .concat([{ id: "foreign", owner_id: "someone-else", visibility: "public", hero_image_path: "photo" }, { id: "removed", owner_id: user.id, visibility: "public", owner_removed_at: "2026-01-01", hero_image_path: "photo" }])
  };
  const db = createMemoryDatabase(tables, hooks);
  const rpcCalls = [], metadataCalls = [];
  db.rpc = async (name, args) => { rpcCalls.push({ name, args }); return { data: { displayName: args.p_display_name, publicCollection: args.p_collection || collection }, error: null }; };
  db.auth.admin.updateUserById = async (...args) => { metadataCalls.push(args); return { error: null }; };
  const routes = loadRoutes(repo, db, { user, overlay })("apps/web/app/api/account/route.ts");
  return { tables, db, rpcCalls, metadataCalls, routes };
}
let passes = 0;
async function test(name, run) { await run(); passes++; console.log("PASS " + name); }
await test("exact count includes more than the REST row cap and excludes removed/foreign records", async () => {
  const f = fixture({ after(query, result) { if (query.table === "guitars" && result.data) result.data = result.data.slice(0, 1000); } });
  const response = await f.routes.GET(new Request("https://test.invalid/api/account"));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.deepEqual((await response.json()).account.stats, { records: 3306, publicRecords: 1102, privateRecords: 1102, unlistedRecords: 1102, recordsWithPhotos: 1653 });
  for (const query of f.db.calls.filter((item) => item.table === "guitars")) assert.deepEqual(JSON.parse(JSON.stringify(query.selectOptions)), { count: "exact", head: true });
});
for (const table of ["profiles", "site_content"]) await test(table + " read errors are not an empty/default account", async () => {
  const f = fixture({ before(query) { if (query.table === table) return { data: null, error: { message: "synthetic outage" } }; } });
  const response = await f.routes.GET(new Request("https://test.invalid/api/account"));
  assert.equal(response.status, 503); assert.equal((await response.json()).account, undefined);
});
for (const failedIndex of [0, 1, 2, 3, 4]) await test("record count " + failedIndex + " read error is surfaced", async () => {
  let countIndex = 0;
  const f = fixture({ before(query) { if (query.table === "guitars" && countIndex++ === failedIndex) return { data: null, count: null, error: { message: "synthetic outage" } }; } });
  assert.equal((await f.routes.GET(new Request("https://test.invalid/api/account"))).status, 503);
});
await test("missing exact count is unavailable, while a genuine zero count succeeds", async () => {
  const f = fixture({ after(query, result) { if (query.table === "guitars") result.count = null; } });
  assert.equal((await f.routes.GET(new Request("https://test.invalid/api/account"))).status, 503);
  const empty = fixture(); empty.tables.guitars = [];
  assert.equal((await (await empty.routes.GET(new Request("https://test.invalid/api/account"))).json()).account.stats.records, 0);
});
await test("thrown GET transport error returns a retryable response", async () => {
  const f = fixture({ before() { throw new Error("network unavailable"); } });
  assert.equal((await f.routes.GET(new Request("https://test.invalid/api/account"))).status, 503);
});
for (const body of [{ displayName: "x", publicCollection: collection }, { displayName: "Valid name", publicCollection: { enabled: true, handle: "x" } }, { displayName: "Valid name", publicCollection: [] }, { displayName: "Valid name", publicCollection: null }, { displayName: { object: "wrong type" } }]) await test("invalid request validates before database/Auth writes: " + JSON.stringify(body), async () => {
  const f = fixture();
  assert.equal((await f.routes.PATCH(req(body))).status, 400);
  assert.equal(f.rpcCalls.length, 0); assert.equal(f.metadataCalls.length, 0); assert.equal(f.db.calls.length, 0);
});
await test("one RPC uses only the authenticated actor and normalized settings; Auth runs after commit", async () => {
  const f = fixture();
  const original = f.db.rpc;
  f.db.rpc = async (...args) => { assert.equal(f.metadataCalls.length, 0); return original(...args); };
  const response = await f.routes.PATCH(req({ displayName: "  Valid   name ", publicCollection: { ...collection, ownerId: "victim", handle: "  Valid HANDLE  " }, role: "admin", plan: "enterprise" }));
  const result = await response.json();
  assert.equal(response.status, 200); assert.equal(result.committed, true); assert.equal(result.authMetadataSynced, true);
  assert.equal(f.rpcCalls.length, 1); assert.equal(f.rpcCalls[0].name, "save_account_settings");
  assert.equal(f.rpcCalls[0].args.p_user_id, user.id); assert.equal(f.rpcCalls[0].args.p_collection.ownerId, user.id);
  assert.equal(f.rpcCalls[0].args.p_collection.handle, "valid-handle"); assert.equal(f.rpcCalls[0].args.p_display_name, "Valid name");
  assert.deepEqual(Object.keys(f.rpcCalls[0].args).sort(), ["p_collection", "p_display_name", "p_user_id"]);
  assert.deepEqual(JSON.parse(JSON.stringify(f.metadataCalls)), [[user.id, { user_metadata: { display_name: "Valid name" } }]]);
  assert.equal(f.db.calls.filter((item) => item.operation !== "select").length, 0);
});
await test("name-only save returns the unchanged committed collection", async () => {
  const f = fixture();
  const result = await (await f.routes.PATCH(req({ displayName: "Name only" }))).json();
  assert.equal(f.rpcCalls[0].args.p_collection, null);
  assert.equal(result.account.publicCollection.handle, collection.handle);
});
for (const [code, status] of [["23505", 409], ["42501", 403], ["22023", 400], ["57014", 503], ["PGRST202", 503]]) await test("RPC error " + code + " maps to " + status + " and prevents Auth writes", async () => {
  const f = fixture(); f.db.rpc = async () => ({ data: null, error: { code, message: "synthetic database rejection" } });
  const response = await f.routes.PATCH(req({ displayName: "Valid name", publicCollection: collection }));
  assert.equal(response.status, status); assert.equal((await response.json()).ok, false); assert.equal(f.metadataCalls.length, 0);
});
for (const failure of ["throw", "error", "missing response"]) await test("unconfirmed RPC " + failure + " reports unknown commit and does not sync Auth", async () => {
  const f = fixture();
  f.db.rpc = async () => { if (failure === "throw") throw new Error("Connection dropped"); return failure === "error" ? { data: null, error: { code: "", message: "fetch failed" } } : { data: null, error: null }; };
  const response = await f.routes.PATCH(req({ displayName: "Valid name" }));
  assert.equal(response.status, 503); assert.equal((await response.json()).commitStatus, "unknown"); assert.equal(f.metadataCalls.length, 0);
});
for (const failure of ["error", "throw"]) await test("Auth sync " + failure + " reports the database commit honestly", async () => {
  const f = fixture();
  f.db.auth.admin.updateUserById = async () => { if (failure === "throw") throw new Error("Auth transport failed"); return { error: { message: "Auth unavailable" } }; };
  const response = await f.routes.PATCH(req({ displayName: "Valid name", publicCollection: collection }));
  const result = await response.json();
  assert.equal(response.status, 200); assert.equal(result.ok, true); assert.equal(result.committed, true); assert.equal(result.authMetadataSynced, false);
  assert.match(result.message, /Account saved/); assert.match(result.message, /could not be synchronized/);
  assert.equal(result.account.publicCollection.handle, collection.handle);
});
await test("unauthenticated reads and writes do not reach account data", async () => {
  const f = fixture(); const route = loadRoutes(repo, f.db, { overlay })("apps/web/app/api/account/route.ts");
  assert.equal((await route.GET(new Request("https://test.invalid/api/account"))).status, 401);
  assert.equal((await route.PATCH(req({ displayName: "Valid name" }))).status, 401);
  assert.equal(f.db.calls.length, 0); assert.equal(f.rpcCalls.length, 0); assert.equal(f.metadataCalls.length, 0);
});
console.log(passes + " mocked account route tests passed.");

