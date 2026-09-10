import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import nodeTest from "node:test";
const test = (name, callback) => nodeTest(name, { timeout: 3000 }, callback);

const here = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = process.env.QRGUITAR_SOURCE_ROOT;
const dependencyRequire = sourceRoot ? createRequire(path.join(sourceRoot, "package.json")) : createRequire(import.meta.url);
const ts = dependencyRequire("typescript");
const cache = new Map();
function loadTs(filename) {
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} }; cache.set(filename, module);
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  new Function("require", "module", "exports", compiled)((name) => {
    if (!name.startsWith(".")) return dependencyRequire(name);
    let resolved = path.resolve(path.dirname(filename), `${name}.ts`);
    if (!fs.existsSync(resolved) && sourceRoot) resolved = path.join(sourceRoot, "apps/web/lib", `${path.basename(name)}.ts`);
    return loadTs(resolved);
  }, module, module.exports);
  return module.exports;
}
const { acquireBulkImportLease } = loadTs(path.resolve(here, "../lib/bulk-import-lock.ts"));
const bulkFile = fs.existsSync(path.resolve(here, "../lib/bulk-import.ts")) ? path.resolve(here, "../lib/bulk-import.ts") : path.join(sourceRoot, "apps/web/lib/bulk-import.ts");
const { parseRows, runBulkImport, readBulkDraft } = loadTs(bulkFile);
const nextTurn = () => new Promise((resolve) => setImmediate(resolve));

// Portable standard-semantics adapter for Node 20 CI; native Web Locks run these same cases on Node 24+.
function portableLockManager() {
  const queues = new Map();
  return { request(name, options, callback) {
    return new Promise((resolve, reject) => {
      const queue = queues.get(name) || [];
      queues.set(name, queue);
      const request = { started: false, start: null };
      const pump = () => { if (queue.length && !queue[0].started) queue[0].start(); };
      const abort = () => {
        if (request.started) return;
        const index = queue.indexOf(request); if (index >= 0) queue.splice(index, 1);
        reject(new DOMException("Aborted", "AbortError")); pump();
      };
      request.start = () => {
        request.started = true;
        options.signal?.removeEventListener("abort", abort);
        Promise.resolve().then(() => callback({ name, mode: "exclusive" })).then(resolve, reject).finally(() => {
          queue.splice(queue.indexOf(request), 1); pump();
        });
      };
      if (options.signal?.aborted) { abort(); return; }
      options.signal?.addEventListener("abort", abort, { once: true });
      queue.push(request); queueMicrotask(pump);
    });
  } };
}
const managers = [["portable", () => portableLockManager()]];
if (globalThis.navigator?.locks) managers.push(["native", () => globalThis.navigator.locks]);
for (const [label, managerFactory] of managers) {
  test(`${label}: same-account tabs have one editor; released tab cannot write`, async (t) => {
    const manager = managerFactory(); const owner = `${label}-exclusive`;
    const first = acquireBulkImportLease(manager, owner); t.after(first.release);
    await first.ready;
    const second = acquireBulkImportLease(manager, owner); t.after(second.release);
    await nextTurn();
    assert.equal(first.isOwned(), true); assert.equal(second.isOwned(), false);
    assert.throws(second.assertOwned, /another tab or account/);
    first.release(); assert.throws(first.assertOwned, /another tab or account/);
    await second.ready; second.assertOwned();
  });
  test(`${label}: different accounts do not block one another`, async (t) => {
    const manager = managerFactory();
    const first = acquireBulkImportLease(manager, `${label}-a`), second = acquireBulkImportLease(manager, `${label}-b`);
    t.after(first.release); t.after(second.release);
    await Promise.all([first.ready, second.ready]); first.assertOwned(); second.assertOwned();
  });
  test(`${label}: cancelled queued account never acquires or overwrites a draft`, async (t) => {
    const manager = managerFactory(); const owner = `${label}-cancel`;
    const first = acquireBulkImportLease(manager, owner); t.after(first.release); await first.ready;
    const cancelled = acquireBulkImportLease(manager, owner); t.after(cancelled.release);
    cancelled.release(); await assert.rejects(cancelled.ready, /cancelled/);
    const third = acquireBulkImportLease(manager, owner); t.after(third.release);
    first.release(); await third.ready;
    assert.equal(cancelled.isOwned(), false); third.assertOwned();
  });
  test(`${label}: immediate mount/unmount cancellation is safe and releases the queue`, async (t) => {
    const manager = managerFactory(); const owner = `${label}-strict-mode`;
    const cancelled = acquireBulkImportLease(manager, owner); cancelled.release();
    await assert.rejects(cancelled.ready, /cancelled/);
    const next = acquireBulkImportLease(manager, owner); t.after(next.release); await next.ready; next.assertOwned();
  });
  test(`${label}: next tab loads fresh completed rows and replays the same uncertain no-serial request`, async (t) => {
    const manager = managerFactory(); const owner = `${label}-resume`;
    const first = acquireBulkImportLease(manager, owner); t.after(first.release); await first.ready;
    const second = acquireBulkImportLease(manager, owner); t.after(second.release);
    const text = "brand,model,serial,type,photo\nFender,Strat,No Serial,Electric Guitar,https://example.com/a.jpg\nFender,Strat,No Serial,Electric Guitar,https://example.com/a.jpg";
    const staleRowsInSecondTab = parseRows(text);
    let draft = { version: 2, ownerId: owner, text, rows: parseRows(text), columnMapping: {} };
    let sequence = 0, calls = 0;
    const records = new Map();
    const persistWith = (lease) => (rows) => { lease.assertOwned(); draft = { ...draft, rows: structuredClone(rows) }; };
    await runBulkImport(draft.rows, {
      ownerName: "Owner", makeKey: () => `test-key-${String(++sequence).padStart(12, "0")}`,
      persist: persistWith(first), upload: async (_row, id) => `${owner}/profile-uploads/${id}/image.jpg`,
      create: async (body) => {
        first.assertOwned(); records.set(body.idempotencyKey, structuredClone(body));
        if (++calls === 2) throw new Error("Commit succeeded but response was lost");
        return { ok: true, qrCode: "QRG-FIRST" };
      }
    });
    assert.equal(draft.rows[0].result, "Created"); assert.equal(draft.rows[1].attempt.phase, "uncertain");
    assert.equal(staleRowsInSecondTab[0].attempt, undefined);
    assert.throws(() => persistWith(second)(staleRowsInSecondTab), /another tab or account/);
    first.release(); await second.ready;
    // Component integration follows this ordering: acquire, then read shared localStorage, then enable controls.
    const fresh = readBulkDraft(JSON.stringify(draft), owner);
    const result = await runBulkImport(fresh.rows, {
      ownerName: "Renamed owner", makeKey: () => { throw new Error("Must not allocate another identity"); },
      persist: persistWith(second), upload: async () => { throw new Error("Must not reupload"); },
      create: async (body) => { second.assertOwned(); calls += 1; assert.deepEqual(body, records.get(body.idempotencyKey)); return { ok: true, qrCode: "QRG-SECOND" }; }
    });
    assert.equal(records.size, 2); assert.equal(calls, 3);
    assert.equal(result.rows.every((row) => row.result === "Created"), true);
    assert.throws(() => persistWith(first)(staleRowsInSecondTab), /another tab or account/);
  });
}
test("lock failures fail closed instead of permitting uncoordinated writes", async () => {
  const lease = acquireBulkImportLease({ request() { return Promise.reject(new Error("Lock unavailable")); } }, "owner");
  await assert.rejects(lease.ready, /unavailable/); assert.throws(lease.assertOwned, /another tab or account/); lease.release();
});
