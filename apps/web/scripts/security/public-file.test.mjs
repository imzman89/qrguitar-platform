import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createMemoryDatabase, loadRoutes } from "./mock-routes.mjs";
const args = process.argv.slice(2);
const repo = path.resolve(args.includes("--repo") ? args[args.indexOf("--repo") + 1] : path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../.."));
const code = "QRG-FILETEST";
const storagePath = "owner/guitar/private-bucket-file";
const route = "apps/web/app/api/public-file/[code]/[kind]/[token]/route.ts";
function fixture(guitar = {}, owner = {}, isPublic = true, mime = "image/png") {
  const db = createMemoryDatabase({
    guitars: [{ id: "guitar", owner_id: "owner", qr_code: code, visibility: "public", hero_image_path: storagePath, admin_archived_at: null, owner_removed_at: null, ...guitar }],
    profiles: [{ id: "owner", account_status: "active", hide_public_content: false, ...owner }],
    guitar_media: [{ guitar_id: "guitar", storage_path: storagePath }],
    guitar_documents: [{ guitar_id: "guitar", storage_path: storagePath, is_public: isPublic }]
  });
  const downloads = [];
  db.storage = { from: (bucket) => ({ download: async (name) => { downloads.push({ bucket, name }); return { data: new Blob(["synthetic bytes"], { type: mime }), error: null }; } }) };
  const load = loadRoutes(repo, db);
  const tokenFor = load("apps/web/lib/public-file-url.ts").publicFileToken;
  return { db, downloads, get: (kind = "media", token = tokenFor(guitar.qr_code || code, kind, storagePath)) => load(route).GET(new Request("https://fixture.invalid"), { params: Promise.resolve({ code: guitar.qr_code || code, kind, token }) }) };
}
for (const visibility of ["public", "unlisted"]) for (const kind of ["media", "document"]) {
  test(visibility + " " + kind + " is served through the checked server proxy from a private bucket", async () => {
    const item = fixture({ visibility }, {}, true, kind === "document" ? "application/pdf" : "image/png");
    const response = await item.get(kind);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "synthetic bytes");
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(item.downloads[0].bucket, kind === "document" ? "instrument-documents" : "instrument-media");
  });
}
for (const [label, guitar, owner] of [
  ["private profile", { visibility: "private" }, {}],
  ["archived profile", { admin_archived_at: "2026-09-01" }, {}],
  ["removed profile", { owner_removed_at: "2026-09-01" }, {}],
  ["retired QR", { qr_code: "QRG-0001" }, {}],
  ["banned owner", {}, { account_status: "banned" }],
  ["hidden owner", {}, { hide_public_content: true }]
]) {
  test(label + " cannot download even with the correct public-file token", async () => {
    const item = fixture(guitar, owner);
    assert.equal((await item.get()).status, 404);
    assert.equal(item.downloads.length, 0);
  });
}
test("a private document never downloads through the public proxy", async () => {
  const item = fixture({}, {}, false, "application/pdf");
  assert.equal((await item.get("document")).status, 404);
  assert.equal(item.downloads.length, 0);
});
test("a mismatched file token never triggers a storage download", async () => {
  const item = fixture();
  assert.equal((await item.get("media", "not-the-token")).status, 404);
  assert.equal(item.downloads.length, 0);
});
test("unsupported media type is never returned to the browser", async () => {
  const item = fixture({}, {}, true, "text/html");
  assert.equal((await item.get("media")).status, 404);
});
