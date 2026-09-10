import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

// Runs with the repository's existing TypeScript dependency; no browser, database, network or emitted files.
const here = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = process.env.QRGUITAR_SOURCE_ROOT;
const dependencyRequire = sourceRoot ? createRequire(path.join(sourceRoot, "package.json")) : createRequire(import.meta.url);
const ts = dependencyRequire("typescript");
const cache = new Map();
function loadTs(filename) {
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} };
  cache.set(filename, module);
  const source = fs.readFileSync(filename, "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const localRequire = (name) => {
    if (!name.startsWith(".")) return dependencyRequire(name);
    let resolved = path.resolve(path.dirname(filename), `${name}.ts`);
    if (!fs.existsSync(resolved) && sourceRoot) resolved = path.join(sourceRoot, "apps/web/lib", `${path.basename(name)}.ts`);
    return loadTs(resolved);
  };
  new Function("require", "module", "exports", compiled)(localRequire, module, module.exports);
  return module.exports;
}
const { parseDelimited, parseRows, autoColumnMapping, runBulkImport, readBulkCreateResponse, readBulkDraft, bulkDraftKey, MAX_BULK_ROWS } = loadTs(path.resolve(here, "../lib/bulk-import.ts"));
const header = "brand,model,serial,type,photo";
const basic = "Fender,Stratocaster,No Serial,Electric Guitar,https://example.com/photo.jpg";
const row = () => parseRows(`${header}\n${basic}`)[0];
const copy = (value) => structuredClone(value);
function harness(overrides = {}) {
  let current = [], counter = 0;
  const writes = [], creates = [], uploads = [];
  const ports = {
    ownerName: "Owner A", makeKey: () => `test-key-${String(++counter).padStart(12, "0")}`,
    persist: (rows) => { current = copy(rows); writes.push(copy(rows)); },
    upload: async (row, uploadId) => {
      assert.equal(current.find((item) => item.rowNumber === row.rowNumber)?.attempt.uploadId, uploadId, "persist identity before upload");
      uploads.push(uploadId); return `owner/profile-uploads/${uploadId}/image-01.jpg`;
    },
    create: async (body) => {
      const saved = current.find((item) => item.attempt?.idempotencyKey === body.idempotencyKey);
      assert.equal(saved?.attempt.phase, "submitting", "persist submission intent before POST");
      assert.deepEqual(saved?.attempt.body, body, "persist exact body before POST");
      creates.push(copy(body)); return { ok: true, qrCode: `QRG-${creates.length}` };
    },
    ...overrides
  };
  return { ports, writes, creates, uploads, saved: () => copy(current) };
}

test("CSV retains quoted multiline text, commas, escaped quotes, and physical row numbers", () => {
  const source = `${header},summary\r\n${basic},"First, line\r\nA ""quoted"" note"\r\n${basic},Second`;
  const rows = parseRows(source);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].summary, 'First, line\nA "quoted" note');
  assert.equal(rows[0].rowNumber, 2);
  assert.equal(rows[1].rowNumber, 4);
});
test("quoted TSV supports tabs and newlines inside cells", () => {
  const rows = parseRows(`${header.replaceAll(",", "\t")}\tsummary\n${basic.replaceAll(",", "\t")}\t"First\tpart\nsecond part"`);
  assert.equal(rows.length, 1); assert.equal(rows[0].summary, "First\tpart\nsecond part");
});
test("UTF-8 BOM and leading/trailing blank records preserve first heading", () => {
  const source = `\uFEFF\r\n${header}\r\n${basic}\r\n\r\n`;
  assert.equal(parseRows(source)[0].brand, "Fender");
  assert.equal(autoColumnMapping(source).brand, "brand");
});
test("delimiter detection ignores punctuation inside a quoted header", () => {
  assert.deepEqual(parseDelimited('"notes, example"\tbrand\n"one, two"\tFender')[0].cells, ["notes, example", "brand"]);
});
test("trailing empty cells are preserved", () => {
  const rows = parseRows(`${header},show_serial,summary\n${basic},,`);
  assert.equal(rows[0].summary, ""); assert.equal(rows[0].showSerialPublic, false);
});
test("malformed quoting and column counts block the whole batch", () => {
  assert.throws(() => parseRows(`${header},summary\n${basic},"unfinished`), /not closed/);
  assert.throws(() => parseRows(`${header},summary\n${basic},"closed"oops`), /unexpected text/);
  assert.throws(() => parseRows(`${header},summary\n${basic},bare"quote`), /quote the whole field/);
  assert.throws(() => parseRows(`${header}\n${basic},extra`), /6 columns/);
});
test("duplicate or empty source headings and duplicate target mappings block import", () => {
  assert.throws(() => parseRows(`brand,brand\nFender,Fender`), /unique/);
  assert.throws(() => parseRows(`brand,\nFender,Strat`), /nonempty/);
  assert.throws(() => parseRows(`brand,make\nFender,Fender`), /same field/);
});
test("exactly 50 records are accepted; 51 explicitly rejected with true count", () => {
  assert.equal(parseRows(`${header}\n${Array(MAX_BULK_ROWS).fill(basic).join("\n")}`).length, 50);
  assert.throws(() => parseRows(`${header}\n${Array(51).fill(basic).join("\n")}`), /contains 51.*limit is 50.*No rows were imported/);
});
test("record limit counts logical records, not physical quoted lines", () => {
  const multi = `${basic},"one\ntwo\nthree"`;
  assert.equal(parseRows(`${header},summary\n${Array(50).fill(multi).join("\n")}`).length, 50);
});
test("missing, blank, false, no, and unknown show_serial values stay hidden", () => {
  const serialRow = basic.replace("No Serial", "ABC123");
  assert.equal(parseRows(`${header}\n${serialRow}`)[0].showSerialPublic, false);
  for (const choice of ["", "no", "false", "0", "unknown", "private"]) assert.equal(parseRows(`${header},show_serial\n${serialRow},${choice}`)[0].showSerialPublic, false);
});
test("serial visibility only uses affirmative opt-in, never a no-serial marker", () => {
  for (const choice of ["yes", "TRUE", "1", "public"]) assert.equal(parseRows(`${header},show_serial\n${basic.replace("No Serial", "ABC123")},${choice}`)[0].showSerialPublic, true);
  assert.equal(parseRows(`${header},show_serial\n${basic},yes`)[0].showSerialPublic, false);
});
test("missing Type is a visible validation error, not an invented instrument type", () => {
  const rows = parseRows("brand,model,serial,photo\nFender,Strat,ABC,https://example.com/p.jpg");
  assert.match(rows[0].error, /Type is required/);
});
test("mapped aliases and explicit ignored columns retain field values", () => {
  const source = "make,model,serial_number,instrument_type,image_url,description,extra\nfender,Strat,ABC,Electric Guitar,https://example.com/p.jpg,Notes,ignore me";
  const rows = parseRows(source, autoColumnMapping(source));
  assert.equal(rows[0].brand, "Fender"); assert.equal(rows[0].summary, "Notes"); assert.equal(rows[0].error, "");
});
test("request identity and full body persist before writes; completion is incremental", async () => {
  const h = harness();
  const result = await runBulkImport([row(), { ...row(), rowNumber: 3 }], h.ports);
  assert.equal(result.created, 2);
  assert.equal(h.creates.length, 2);
  assert.notEqual(h.creates[0].idempotencyKey, h.creates[1].idempotencyKey);
  assert.equal(h.writes.find((rows) => rows[1].attempt)?.[0].result, "Created");
  assert.equal(result.rows[0].attempt.qrCode, "QRG-1");
});
test("lost POST response resumes the same no-serial request without reupload or duplicate", async () => {
  const h = harness();
  const committed = new Map(); let requests = 0;
  h.ports.create = async (body) => {
    requests += 1;
    if (!committed.has(body.idempotencyKey)) committed.set(body.idempotencyKey, { body: copy(body), qrCode: "QRG-ONCE" });
    if (requests === 1) throw new Error("Response lost after commit");
    assert.deepEqual(body, committed.get(body.idempotencyKey).body);
    return { ok: true, qrCode: committed.get(body.idempotencyKey).qrCode };
  };
  const first = await runBulkImport([row()], h.ports);
  assert.equal(first.rows[0].attempt.phase, "uncertain");
  const draft = readBulkDraft(JSON.stringify({ version: 2, ownerId: "owner", text: `${header}\n${basic}`, rows: h.saved(), columnMapping: {} }), "owner");
  h.ports.ownerName = "Renamed account";
  const resumed = await runBulkImport(draft.rows, h.ports);
  assert.equal(resumed.rows[0].result, "Created"); assert.equal(committed.size, 1); assert.equal(h.uploads.length, 1);
});
test("partial batch failure keeps earlier completions and leaves later rows untouched", async () => {
  const h = harness(); let calls = 0;
  h.ports.create = async () => { if (++calls === 2) throw new Error("offline"); return { ok: true, qrCode: "QRG-FIRST" }; };
  const result = await runBulkImport([row(), { ...row(), rowNumber: 3 }, { ...row(), rowNumber: 4 }], h.ports);
  assert.equal(result.rows[0].result, "Created"); assert.equal(result.rows[1].attempt.phase, "uncertain");
  assert.equal(result.rows[2].attempt, undefined); assert.equal(result.created, 1);
  let retryCalls = 0;
  h.ports.create = async () => ({ ok: true, qrCode: `QRG-RESUME-${++retryCalls}` });
  const resumed = await runBulkImport(h.saved(), h.ports);
  assert.equal(retryCalls, 2); assert.equal(resumed.rows.every((item) => item.result === "Created"), true);
});
test("in-progress server response retains request for later reconciliation", async () => {
  const h = harness({ create: async () => ({ ok: false, code: "request_in_progress" }) });
  const first = await runBulkImport([row()], h.ports);
  const body = copy(first.rows[0].attempt.body);
  const second = await runBulkImport(h.saved(), h.ports);
  assert.equal(second.rows[0].attempt.phase, "uncertain"); assert.deepEqual(second.rows[0].attempt.body, body); assert.equal(h.uploads.length, 1);
});
test("lookup/auth failure on uncertain retry does not unlock or replace its request", async () => {
  const h = harness({ create: async () => ({ ok: false, uncertain: true }) });
  await runBulkImport([row()], h.ports);
  const prior = h.saved()[0].attempt.body;
  h.ports.create = async () => ({ ok: false, code: "request_lookup_failed", cleanupUploads: false });
  const result = await runBulkImport(h.saved(), h.ports);
  assert.equal(result.rows[0].attempt.phase, "uncertain"); assert.deepEqual(result.rows[0].attempt.body, prior);
});
test("definitive precommit upload reset restages with the same request identities", async () => {
  const h = harness({ create: async () => ({ ok: false, code: "upload_session_changed", status: 409, resetUploads: true }) });
  const first = await runBulkImport([row()], h.ports);
  const attempt = first.rows[0].attempt;
  assert.equal(attempt.body, undefined);
  h.ports.create = async (body) => { assert.equal(body.idempotencyKey, attempt.idempotencyKey); return { ok: true }; };
  const second = await runBulkImport(h.saved(), h.ports);
  assert.equal(second.created, 1); assert.deepEqual(h.uploads, [attempt.uploadId, attempt.uploadId]);
});
test("storage failure before write prevents upload and create", async () => {
  let writes = 0;
  await assert.rejects(runBulkImport([row()], { ...harness().ports, persist: () => { throw new Error("quota"); }, upload: async () => { writes += 1; return "path"; }, create: async () => { writes += 1; return { ok: true }; } }), /quota/);
  assert.equal(writes, 0);
});
test("crash after commit but before saving completion resumes persisted submitting body", async () => {
  const h = harness(); const persist = h.ports.persist; let stored = [];
  h.ports.persist = (rows) => { if (rows[0].result === "Created") throw new Error("disk full after commit"); persist(rows); stored = copy(rows); };
  await assert.rejects(runBulkImport([row()], h.ports), /disk full/);
  assert.equal(stored[0].attempt.phase, "submitting");
  const originalBody = copy(stored[0].attempt.body);
  h.ports.persist = persist;
  h.ports.create = async (body) => { assert.deepEqual(body, originalBody); return { ok: true, qrCode: "QRG-SAME" }; };
  const resumed = await runBulkImport(stored, h.ports);
  assert.equal(resumed.rows[0].attempt.qrCode, "QRG-SAME"); assert.equal(h.uploads.length, 1);
});
test("completed/invalid rows are skipped without external writes", async () => {
  const h = harness();
  const result = await runBulkImport([{ ...row(), result: "Created" }, { ...row(), rowNumber: 3, error: "Missing photo" }], h.ports);
  assert.equal(result.created, 0); assert.equal(h.creates.length, 0); assert.equal(h.uploads.length, 0);
});
test("draft restore is owner-scoped and rejects incompatible or corrupt retry identity", () => {
  assert.notEqual(bulkDraftKey("owner-a"), bulkDraftKey("owner-b"));
  const draft = { version: 2, ownerId: "owner-a", text: "", rows: [row()], columnMapping: {} };
  assert.throws(() => readBulkDraft(JSON.stringify(draft), "owner-b"), /restored safely/);
  assert.throws(() => readBulkDraft(JSON.stringify({ ...draft, version: 1 }), "owner-a"), /restored safely/);
  assert.throws(() => readBulkDraft(JSON.stringify({ ...draft, rows: [{ ...row(), attempt: { uploadId: "valid-upload-identity", idempotencyKey: "valid-request-identity", phase: "submitting" } }] }), "owner-a"), /missing its original request/);
});

test("response decoder accepts upload reset only for the exact definitive 409 contract", async () => {
  const valid = { ok: false, code: "upload_session_changed", resetUploads: true, retryable: true };
  for (const [status, payload, expected] of [
    [409, valid, true], [500, valid, false], [200, valid, false],
    [409, { ...valid, code: "request_in_progress" }, false],
    [409, { ...valid, resetUploads: false }, false],
    [409, { ...valid, resetUploads: "true" }, false],
    [409, { ...valid, ok: true }, false],
    [409, { ...valid, uncertain: true }, false],
    [409, { ...valid, status: 200 }, true]
  ]) {
    const result = await readBulkCreateResponse(new Response(JSON.stringify(payload), { status }));
    assert.equal(result.resetUploads, expected, JSON.stringify({ status, payload }));
    assert.equal(result.status, status, "payload cannot spoof the HTTP status");
  }
  const malformed = await readBulkCreateResponse(new Response("not JSON", { status: 503 }));
  assert.equal(malformed.uncertain, true); assert.equal(malformed.resetUploads, undefined);
});

test("definitive no-commit reset recovers an uncertain row and keeps completed rows, data, and both identities", async () => {
  let createCount = 0;
  const h = harness({ create: async () => ++createCount === 1 ? { ok: true, qrCode: "QRG-DONE" } : { ok: false, uncertain: true } });
  await runBulkImport([row(), { ...row(), rowNumber: 3, serial: "SECOND" }], h.ports);
  const saved = h.saved(), completed = copy(saved[0]), original = copy(saved[1]);
  h.ports.makeKey = () => { throw new Error("A retry must retain its identity"); };
  h.ports.create = async (body) => {
    assert.deepEqual(body, original.attempt.body, "the uncertain request must first replay exactly");
    return { ok: false, status: 409, code: "upload_session_changed", resetUploads: true };
  };
  const reset = await runBulkImport(saved, h.ports);
  assert.deepEqual(reset.rows[0], completed); assert.equal(reset.rows[1].attempt.phase, "failed");
  assert.equal(reset.rows[1].attempt.body, undefined); assert.equal(reset.rows[1].photo, original.photo);
  assert.equal(reset.rows[1].serial, original.serial); assert.equal(reset.rows[1].summary, original.summary);
  assert.equal(reset.rows[1].attempt.uploadId, original.attempt.uploadId); assert.equal(reset.rows[1].attempt.idempotencyKey, original.attempt.idempotencyKey);
  assert.equal(h.uploads.length, 2, "reset does not upload before its state is durably saved");
  const draft = readBulkDraft(JSON.stringify({ version: 2, ownerId: "owner-a", text: "source", rows: h.saved(), columnMapping: {} }), "owner-a");
  const upload = h.ports.upload;
  h.ports.upload = async (current, uploadId) => {
    assert.equal(uploadId, original.attempt.uploadId);
    assert.equal(h.saved()[1].attempt.body, undefined);
    await upload(current, uploadId); return `owner/profile-uploads/${uploadId}/replacement.jpg`;
  };
  h.ports.create = async (body) => {
    assert.equal(body.idempotencyKey, original.attempt.idempotencyKey); assert.equal(body.uploadId, original.attempt.uploadId);
    assert.match(body.photos[0], /replacement\.jpg$/); assert.equal(body.serial, original.attempt.body.serial);
    return { ok: true, qrCode: "QRG-RECOVERED" };
  };
  const done = await runBulkImport(draft.rows, h.ports);
  assert.equal(done.created, 1); assert.equal(done.rows[1].attempt.phase, "complete"); assert.deepEqual(done.rows[0], completed);
  assert.equal(h.uploads.length, 3);
});

for (const failure of [
  { ok: false, code: "publish_failed", cleanupUploads: true },
  { ok: false, status: 503, code: "upload_session_changed", resetUploads: true },
  { ok: false, status: 409, code: "request_in_progress", resetUploads: true },
  { ok: false, status: 409, code: "upload_session_changed" },
  { ok: false, status: 409, code: "upload_session_changed", resetUploads: true, uncertain: true }
]) test(`ambiguous or incomplete reset cannot replace frozen payload: ${JSON.stringify(failure)}`, async () => {
  const h = harness({ create: async () => ({ ok: false, uncertain: true }) });
  await runBulkImport([row()], h.ports); const original = copy(h.saved()[0].attempt);
  h.ports.create = async body => { assert.deepEqual(body, original.body); return failure; };
  const retry = await runBulkImport(h.saved(), h.ports);
  assert.equal(retry.rows[0].attempt.phase, "uncertain"); assert.deepEqual(retry.rows[0].attempt.body, original.body);
  assert.equal(h.uploads.length, 1); assert.ok(retry.stoppedReason);
});

test("failure persisting a definitive reset stops before restaging and leaves the durable request replayable", async () => {
  const h = harness({ create: async () => ({ ok: false, uncertain: true }) });
  await runBulkImport([row()], h.ports); const original = copy(h.saved()[0].attempt.body), persist = h.ports.persist;
  h.ports.create = async body => { assert.deepEqual(body, original); return { ok: false, status: 409, code: "upload_session_changed", resetUploads: true }; };
  h.ports.persist = rows => { if (rows[0].attempt.phase === "failed" && !rows[0].attempt.body) throw new Error("disk full on reset"); persist(rows); };
  await assert.rejects(runBulkImport(h.saved(), h.ports), /disk full on reset/);
  assert.deepEqual(h.saved()[0].attempt.body, original); assert.equal(h.saved()[0].attempt.phase, "submitting"); assert.equal(h.uploads.length, 1);
});
