import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(process.argv[2] || path.join(here, "../../../.."));
const root = path.join(repo, "apps/web/lib/account-deletion");
const require = createRequire(path.join(repo, "apps/web/package.json"));
const ts = require("typescript"), cache = new Map();
function load(name) {
  if (cache.has(name)) return cache.get(name);
  const output = ts.transpileModule(fs.readFileSync(path.join(root, name + ".ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", output)(id => id.startsWith("./") ? load(id.slice(2)) : require(id), module, module.exports);
  cache.set(name, module.exports); return module.exports;
}
const { analyzeDeletionContainer } = load("container-inspection");
const sharp = require("sharp");
let passed = 0;
async function check(name, work) { await work(); passed += 1; console.log("PASS " + name); }

function jpegSegment(marker, payload) {
  const length = payload.length + 2;
  return Buffer.concat([Buffer.from([0xff, marker, length >> 8, length & 0xff]), payload]);
}
function insertAfterSoi(jpeg, segment) { return Buffer.concat([jpeg.subarray(0, 2), segment, jpeg.subarray(2)]); }
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const value of bytes) { crc ^= value; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(type, payload) {
  const name = Buffer.from(type, "latin1"), header = Buffer.alloc(4), checksum = Buffer.alloc(4);
  header.writeUInt32BE(payload.length); checksum.writeUInt32BE(crc32(Buffer.concat([name, payload])));
  return Buffer.concat([header, name, payload, checksum]);
}
function webpChunk(type, payload) {
  const header = Buffer.alloc(8); header.write(type, 0, 4, "latin1"); header.writeUInt32LE(payload.length, 4);
  return Buffer.concat([header, payload, ...(payload.length % 2 ? [Buffer.from([0])] : [])]);
}
function classicPdf() {
  const header = "%PDF-1.7\n";
  const object = "1 0 obj\n<< /Type /Catalog >>\nendobj\n";
  const objectOffset = Buffer.byteLength(header, "latin1");
  const prefix = header + object;
  const xrefOffset = Buffer.byteLength(prefix, "latin1");
  return Buffer.from(prefix + "xref\n0 2\n0000000000 65535 f \n" + String(objectOffset).padStart(10, "0")
    + " 00000 n \ntrailer\n<< /Size 2 /Root 1 0 R >>\nstartxref\n" + xrefOffset + "\n%%EOF\n", "latin1");
}

const jpeg = await sharp({ create: { width: 16, height: 16, channels: 3, background: { r: 20, g: 80, b: 120 } } }).jpeg().toBuffer();
await check("a fully decoded JPEG with no hidden metadata is retainable", async () => {
  const result = await analyzeDeletionContainer(jpeg, "image/jpeg");
  assert.equal(result.structureValid, true); assert.equal(result.safeToRetain, true); assert.deepEqual(result.metadataFindings, []);
});
await check("JPEG bytes appended after EOI are malformed and delete-only", async () => {
  const result = await analyzeDeletionContainer(Buffer.concat([jpeg, Buffer.from("SECRET=departing@example.test GPS=private")]), "image/jpeg");
  assert.equal(result.structureValid, false); assert.equal(result.safeToRetain, false); assert.ok(result.metadataFindings.includes("malformed-container"));
});
await check("a truncated JPEG entropy scan is malformed and delete-only", async () => {
  const result = await analyzeDeletionContainer(jpeg.subarray(0, jpeg.length - 2), "image/jpeg");
  assert.equal(result.structureValid, false); assert.equal(result.safeToRetain, false);
});
await check("JPEG ICC and application metadata are visible to the privacy gate", async () => {
  const withIcc = insertAfterSoi(jpeg, jpegSegment(0xe2, Buffer.concat([Buffer.from("ICC_PROFILE\0", "latin1"), Buffer.from([1, 1, 0, 1, 2, 3])])));
  const result = await analyzeDeletionContainer(withIcc, "image/jpeg");
  assert.equal(result.structureValid, true); assert.equal(result.safeToRetain, false); assert.ok(result.metadataFindings.includes("icc"));
});
await check("a valid PNG is fully consumed and decoded while ancillary data stays delete-only", async () => {
  const png = await sharp({ create: { width: 8, height: 8, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 1 } } }).png().toBuffer();
  const result = await analyzeDeletionContainer(png, "image/png");
  assert.equal(result.structureValid, true); assert.equal(result.safeToRetain, false); assert.ok(result.metadataFindings.includes("application-metadata"));
  const trailing = await analyzeDeletionContainer(Buffer.concat([png, Buffer.from("PRIVATE")]), "image/png");
  assert.equal(trailing.structureValid, false); assert.equal(trailing.safeToRetain, false);
});
await check("a private PNG ancillary chunk is metadata and delete-only", async () => {
  const png = await sharp({ create: { width: 8, height: 8, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 1 } } }).png().toBuffer();
  const hidden = pngChunk("prIv", Buffer.from("SECRET=departing@example.test GPS=private"));
  const withPrivateChunk = Buffer.concat([png.subarray(0, png.length - 12), hidden, png.subarray(png.length - 12)]);
  const result = await analyzeDeletionContainer(withPrivateChunk, "image/png");
  assert.equal(result.structureValid, true); assert.equal(result.safeToRetain, false); assert.ok(result.metadataFindings.includes("application-metadata"));
});
await check("a valid extended WebP alpha image is decoded but original bytes remain delete-only", async () => {
  const webp = await sharp({ create: { width: 8, height: 8, channels: 4, background: { r: 3, g: 4, b: 5, alpha: 0.5 } } }).webp().toBuffer();
  const result = await analyzeDeletionContainer(webp, "image/webp");
  assert.equal(result.structureValid, true); assert.equal(result.safeToRetain, false); assert.ok(result.metadataFindings.includes("webp-container"));
});
await check("an ALPH chunk appended to a simple WebP cannot hide private data", async () => {
  const webp = await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 3, g: 4, b: 5 } } }).webp().toBuffer();
  const withAlpha = Buffer.concat([webp, webpChunk("ALPH", Buffer.from("SECRET=departing@example.test GPS=private"))]);
  withAlpha.writeUInt32LE(withAlpha.length - 8, 4);
  const result = await analyzeDeletionContainer(withAlpha, "image/webp");
  assert.equal(result.structureValid, false); assert.equal(result.safeToRetain, false); assert.ok(result.metadataFindings.includes("malformed-container"));
});
await check("nonzero VP8X reserved bytes make the WebP malformed and delete-only", async () => {
  const webp = Buffer.from(await sharp({ create: { width: 8, height: 8, channels: 4, background: { r: 3, g: 4, b: 5, alpha: 0.5 } } }).webp().toBuffer());
  assert.equal(webp.toString("latin1", 12, 16), "VP8X");
  webp.set(Buffer.from("PII", "latin1"), 21);
  const result = await analyzeDeletionContainer(webp, "image/webp");
  assert.equal(result.structureValid, false); assert.equal(result.safeToRetain, false); assert.ok(result.metadataFindings.includes("malformed-container"));
});
await check("an unknown WebP RIFF chunk is metadata and delete-only", async () => {
  const webp = await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 3, g: 4, b: 5 } } }).webp().toBuffer();
  const withPrivateChunk = Buffer.concat([webp, webpChunk("PIII", Buffer.from("SECRET=departing@example.test GPS=private"))]);
  withPrivateChunk.writeUInt32LE(withPrivateChunk.length - 8, 4);
  const result = await analyzeDeletionContainer(withPrivateChunk, "image/webp");
  assert.equal(result.structureValid, false); assert.equal(result.safeToRetain, false); assert.ok(result.metadataFindings.includes("application-metadata"));
});
await check("a simple WebP is decoded but original container bytes remain delete-only", async () => {
  const webp = await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 3, g: 4, b: 5 } } }).webp().toBuffer();
  const result = await analyzeDeletionContainer(webp, "image/webp");
  assert.equal(result.structureValid, true); assert.equal(result.safeToRetain, false); assert.ok(result.metadataFindings.includes("webp-container"));
});
await check("a forged PDF with a fake xref footer is malformed and delete-only", async () => {
  const bytes = Buffer.from("%PDF-1.7\nSECRET=departing@example.test\nstartxref\n0\n%%EOF\n", "latin1");
  const result = await analyzeDeletionContainer(bytes, "application/pdf");
  assert.equal(result.structureValid, false); assert.equal(result.safeToRetain, false); assert.ok(result.metadataFindings.includes("malformed-container"));
});
await check("a bad PDF xref offset is rejected", async () => {
  const bytes = classicPdf();
  const corrupted = Buffer.from(bytes.toString("latin1").replace(/startxref\n\d+/, "startxref\n1"), "latin1");
  const result = await analyzeDeletionContainer(corrupted, "application/pdf");
  assert.equal(result.structureValid, false); assert.equal(result.safeToRetain, false);
});
await check("a structurally valid PDF remains delete-only because hidden document content cannot be visually disproved", async () => {
  const result = await analyzeDeletionContainer(classicPdf(), "application/pdf");
  assert.equal(result.structureValid, true); assert.equal(result.safeToRetain, false); assert.ok(result.metadataFindings.includes("document-container"));
});
console.log(`Container privacy checks passed: ${passed}`);
