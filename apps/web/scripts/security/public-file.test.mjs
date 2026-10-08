import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import test from "node:test";
import { createHash } from "node:crypto";
import { createMemoryDatabase, loadRoutes } from "./mock-routes.mjs";
const require = createRequire(import.meta.url);
const sharp = require("sharp");
const args = process.argv.slice(2);
const repo = path.resolve(args.includes("--repo") ? args[args.indexOf("--repo") + 1] : path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../.."));
const code = "QRG-FILETEST";
const storagePath = "owner/guitar/private-bucket-file";
const route = "apps/web/app/api/public-file/[code]/[kind]/[token]/route.ts";
function fixture(guitar = {}, owner = {}, isPublic = true, mime = "image/png", file = new Blob(["synthetic bytes"], { type: mime })) {
  const db = createMemoryDatabase({
    guitars: [{ id: "guitar", owner_id: "owner", qr_code: code, visibility: "public", hero_image_path: storagePath, admin_archived_at: null, owner_removed_at: null, ...guitar }],
    profiles: [{ id: "owner", account_status: "active", hide_public_content: false, ...owner }],
    guitar_media: [{ guitar_id: "guitar", storage_path: storagePath }],
    guitar_documents: [{ guitar_id: "guitar", storage_path: storagePath, is_public: isPublic }]
  });
  const downloads = [];
  db.storage = { from: (bucket) => ({ download: async (name) => { downloads.push({ bucket, name }); return { data: file, error: null }; } }) };
  const load = loadRoutes(repo, db, { modules: { sharp: { default: sharp } } });
  const tokenFor = load("apps/web/lib/public-file-url.ts").publicFileToken;
  return { db, downloads, get: (kind = "media", token = tokenFor(guitar.qr_code || code, kind, storagePath), search = "") => load(route).GET(new Request("https://fixture.invalid" + search), { params: Promise.resolve({ code: guitar.qr_code || code, kind, token }) }) };
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
  ["ownerless private deletion-custody Profile", { visibility: "private", owner_id: null }, {}],
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
  const item = fixture({}, {}, true, "text/html", {
    type: "text/html",
    stream: () => assert.fail("Unsupported content must be rejected before its stream opens."),
    arrayBuffer: () => assert.fail("Unsupported content must not be buffered.")
  });
  assert.equal((await item.get("media")).status, 404);
});

for (const kind of ["media", "document"]) {
  test("6MiB public " + kind + " uses the checked stream without buffering or a signed-URL redirect", async () => {
    const bytes = new Uint8Array(6 * 1024 * 1024).fill(0x51);
    const mime = kind === "document" ? "application/pdf" : "image/png";
    const blob = new Blob([bytes], { type: mime });
    let streamsOpened = 0;
    const item = fixture({}, {}, true, mime, {
      type: mime,
      stream: () => { streamsOpened++; return blob.stream(); },
      arrayBuffer: () => assert.fail("Large public files must not allocate an ArrayBuffer response.")
    });
    const response = await item.get(kind);
    assert.equal(response.status, 200);
    assert.equal(streamsOpened, 1);
    assert.deepEqual(item.downloads, [{ bucket: kind === "document" ? "instrument-documents" : "instrument-media", name: storagePath }]);
    assert.equal(response.headers.get("content-type"), mime);
    assert.equal(response.headers.get("content-disposition"), "inline");
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("location"), null);
    assert.equal(response.headers.get("content-length"), null);
    const reader = response.body.getReader();
    const receivedHash = createHash("sha256");
    let receivedBytes = 0;
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      receivedBytes += chunk.value.byteLength;
      receivedHash.update(chunk.value);
    }
    assert.equal(receivedBytes, bytes.byteLength);
    assert.equal(receivedHash.digest("hex"), createHash("sha256").update(bytes).digest("hex"));
  });
}

test("allowlisted media variants return bounded WebP dimensions after the public checks", async () => {
  const input = await sharp({
    create: { width: 320, height: 240, channels: 3, background: { r: 20, g: 80, b: 120 } }
  }).png().toBuffer();
  const item = fixture({}, {}, true, "image/png", new Blob([input], { type: "image/png" }));
  const response = await item.get("media", undefined, "?w=160&format=webp");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/webp");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  const output = Buffer.from(await response.arrayBuffer());
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 160);
  assert.equal(metadata.height, 120);
  assert.deepEqual(item.downloads, [{ bucket: "instrument-media", name: storagePath }]);
});

for (const search of [
  "?w=161&format=webp",
  "?w=160",
  "?format=webp",
  "?w=160&format=png",
  "?w=160&w=640&format=webp",
  "?w=160&format=webp&quality=1"
]) {
  test("invalid media variant query is rejected without downloading bytes: " + search, async () => {
    const item = fixture();
    const response = await item.get("media", undefined, search);
    assert.equal(response.status, 400);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(item.downloads.length, 0);
  });
}

test("document variants are rejected without changing original document streaming", async () => {
  const item = fixture({}, {}, true, "application/pdf");
  const response = await item.get("document", undefined, "?w=160&format=webp");
  assert.equal(response.status, 400);
  assert.equal(item.downloads.length, 0);
  const original = await item.get("document");
  assert.equal(original.status, 200);
  assert.equal(await original.text(), "synthetic bytes");
});

test("an invalid variant cannot reveal a private Profile or trigger a download", async () => {
  const item = fixture({ visibility: "private" });
  const response = await item.get("media", undefined, "?w=161&format=webp");
  assert.equal(response.status, 404);
  assert.equal(item.downloads.length, 0);
});

test("oversized variant input fails closed without buffering while original media still streams", async () => {
  const bytes = new Uint8Array([1, 2, 3]);
  let streamsOpened = 0;
  const item = fixture({}, {}, true, "image/png", {
    type: "image/png",
    size: 12 * 1024 * 1024 + 1,
    stream: () => { streamsOpened += 1; return new Blob([bytes], { type: "image/png" }).stream(); },
    arrayBuffer: () => assert.fail("Oversized variant input must not be buffered.")
  });
  assert.equal((await item.get("media", undefined, "?w=160&format=webp")).status, 404);
  assert.equal(streamsOpened, 0);
  const original = await item.get("media");
  assert.equal(original.status, 200);
  assert.equal(streamsOpened, 1);
  assert.deepEqual(new Uint8Array(await original.arrayBuffer()), bytes);
});
