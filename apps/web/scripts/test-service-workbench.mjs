import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const overlayRoot = process.argv.includes("--source") ? path.resolve(process.argv[process.argv.indexOf("--source") + 1]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = process.argv.includes("--repo") ? path.resolve(process.argv[process.argv.indexOf("--repo") + 1]) : overlayRoot;
const require = createRequire(path.join(root, "package.json"));
const ts = require("typescript");
function loadTs(relative) {
  const local = path.join(overlayRoot, relative);
  const source = fs.readFileSync(fs.existsSync(local) ? local : path.join(root, relative), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  new Function("exports", "require", compiled)(exports, name => name.startsWith("./") ? loadTs(path.join(path.dirname(relative), name + ".ts")) : require(name));
  return exports;
}
const moduleExports = loadTs("lib/service-workbench.ts");
const { serviceEvidenceStoragePath } = loadTs("lib/service-evidence-upload.ts");
const storageOrigin = "https://synthetic-project.supabase.co";
const { createServiceWorkbench, emptyProvider, emptyServiceForm, initialWorkbenchState, readWorkSubmission, readWorkEvidence, serviceResumePath } = moduleExports;
const sessionFor = id => id ? { access_token: `token-${id}`, user: { id } } : null;
const providerFor = id => ({ ...emptyProvider(), userId: id, publicDisplayName: `Repair shop ${id}` });
const submissionFor = (overrides = {}) => ({ ...emptyServiceForm(), id: "33333333-3333-4333-8333-333333333333", qrCode: "QRG-TEST", provider: { userId: "11111111-1111-4111-8111-111111111111" }, profileTitle: "Test guitar", status: "draft", title: "Fret work", serviceDate: "2026-09-17", workPerformed: "Leveled frets", privateProviderNote: "Private original note", ownerReviewNote: "Please clarify the measurements.", evidenceCount: 2, emailDeliveryStatus: "not_attempted", emailDeliveryMessage: "", ...overrides });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(predicate) { for (let i = 0; i < 100; i++) { if (predicate()) return; await tick(); } assert.ok(predicate(), "condition did not settle"); }
const ok = value => Response.json({ ok: true, ...value });
const file = () => new Blob(["synthetic evidence"], { type: "application/pdf" });
const evidenceFor = id => ({ id, type: "invoice", fileName: `${id}.pdf`, mimeType: "application/pdf", fileSizeBytes: 1250, createdAt: "2026-09-17T12:00:00Z", previewUrl: `https://storage.example.invalid/private/${id}?synthetic-token=local-test` });
let count = 0;
async function test(name, run) { await run(); console.log("PASS " + name); count++; }
function harness(options = {}) {
  const h = { session: sessionFor("11111111-1111-4111-8111-111111111111"), row: submissionFor(), calls: [], authCalls: 0, unsubscribed: false, ...options };
  h.evidence = Array.from({ length: h.row?.evidenceCount || 0 }, (_, index) => evidenceFor(`evidence-${index + 1}`));
  let callback;
  h.respond = async (url, init) => {
    const method = init.method || "GET";
    const body = typeof init.body === "string" ? JSON.parse(init.body) : null;
    if (url === "/api/service-providers") return ok({ provider: providerFor(h.session?.user.id || "") });
    if (url.startsWith("/api/service-submissions?") && method === "GET") return ok({ submission: h.row, submissions: h.row ? [h.row] : [] });
    if (url.startsWith("/api/service-evidence?") && method === "GET") return ok({ evidence: h.evidence });
    if (url === "/api/service-submissions" && method === "POST") { h.row = submissionFor({ ...body, id: "55555555-5555-4555-8555-555555555555", provider: { userId: h.session.user.id } }); return ok({ submission: h.row }); }
    if (url === "/api/service-submissions" && method === "PATCH") { h.row = { ...h.row, ...body, status: body.action === "save_draft" ? h.row.status : "submitted" }; return ok({ submission: h.row, message: "Saved confirmed work." }); }
    if (url === "/api/service-evidence" && method === "DELETE") { h.evidence = h.evidence.filter(item => item.id !== body.evidenceId); h.row.evidenceCount = h.evidence.length; return ok({ committed: true, message: "Evidence removed." }); }
    if (url.startsWith(storageOrigin + "/")) return new Response("", { status: 200 });
    if (url === "/api/service-evidence" && method === "POST") {
      const binding = { uploadId: body.uploadId, submissionId: body.submissionId, actorId: body.expectedActorId, bucket: "service-evidence",
        storagePath: serviceEvidenceStoragePath(body.submissionId, body.expectedActorId, body.uploadId, body.mimeType) };
      if (body.action === "prepare") return ok({ ...binding, phase: "upload", signedUrl: `${storageOrigin}/storage/v1/object/upload/sign/service-evidence/${binding.storagePath}?token=synthetic-local-test` });
      const evidenceId = `evidence-${body.uploadId}`;
      if (!h.evidence.some(item => item.id === evidenceId)) h.evidence.push(evidenceFor(evidenceId));
      h.row.evidenceCount = h.evidence.length;
      return ok({ ...binding, phase: "committed", committed: true, evidence: { id: evidenceId } });
    }
    throw new Error("Unexpected request " + url);
  };
  h.client = createServiceWorkbench("QRG-TEST", h.id || "", {
    timeoutMs: h.timeoutMs || 1000,
    uploadTimeoutMs: h.uploadTimeoutMs || 1000,
    supabaseUrl: storageOrigin,
    auth: () => {
      if (h.constructError) throw new Error("Auth configuration unavailable");
      return {
        getSession: async () => { h.authCalls++; return h.getSession ? h.getSession() : { data: { session: h.session } }; },
        onAuthStateChange: listener => { callback = listener; return { data: { subscription: { unsubscribe: () => { h.unsubscribed = true; } } } }; },
      };
    },
    fetch: async (url, init) => { h.calls.push({ url, ...init }); return h.reply ? h.reply(url, init) : h.respond(url, init); },
  });
  h.change = (session, event = "SIGNED_IN") => { h.session = session; callback(event, session); };
  h.mount = async () => { await h.client.start(); await until(() => h.client.getState().phase !== "loading"); return h; };
  h.writes = () => h.calls.filter(call => call.method && call.method !== "GET");
  h.fill = () => h.client.setForm({ ...h.client.getState().form, serviceDate: "2026-09-17", title: "New work", workPerformed: "Adjusted relief", workOrderReference: "WO-1" });
  return h;
}

await test("delayed completion plus reload and second file selection keeps one upload identity", async () => {
  const h = await harness({ id: submissionFor().id, timeoutMs: 30 }).mount();
  const completions = [];
  h.reply = (url, init) => {
    if (url === "/api/service-evidence" && JSON.parse(init.body).action === "complete") {
      const gate = deferred(); completions.push({ init, gate }); return gate.promise;
    }
    return h.respond(url, init);
  };
  await h.client.upload(file(), "invoice");
  assert.equal(h.client.getState().uncertain, "change");
  const recovering = h.client.reload();
  await until(() => h.client.getState().phase === "ready");
  const selecting = h.client.upload(new File(["different"], "replacement.pdf", { type: "application/pdf" }), "receipt");
  await until(() => completions.length === 2);
  assert.equal(new Set(completions.map(item => JSON.parse(item.init.body).uploadId)).size, 1, "reload must reconcile the first UUID instead of allowing a replacement upload");
  completions[1].gate.resolve(await h.respond("/api/service-evidence", completions[1].init));
  await recovering; await selecting;
  completions[0].gate.resolve(await h.respond("/api/service-evidence", completions[0].init)); await tick();
  assert.equal(h.evidence.length, 3); assert.equal(h.client.getState().uncertain, "");
  assert.deepEqual(JSON.parse(completions[0].init.body), JSON.parse(completions[1].init.body)); h.client.dispose();
});
await test("missing bytes retry the original File and identity within the same actor generation", async () => {
  const h = await harness({ id: submissionFor().id }).mount(); const original = new File(["original"], "original.pdf", { type: "application/pdf" });
  let arrived = false, failed = false;
  h.reply = (url, init) => {
    if (init.method === "PUT") { if (!failed) { failed = true; return Promise.reject(new Error("Connection lost before upload")); } arrived = true; }
    if (url === "/api/service-evidence" && JSON.parse(init.body).action === "complete" && !arrived) return Response.json({ ok: false, code: "upload_not_ready", message: "File has not arrived.", retryable: true }, { status: 409 });
    return h.respond(url, init);
  };
  await h.client.upload(original, "invoice"); assert.equal(h.client.getState().uncertain, "change");
  await h.client.reload();
  const puts = h.writes().filter(call => call.method === "PUT"); assert.equal(puts.length, 2); assert.ok(puts.every(call => call.body === original));
  assert.equal(new Set(h.writes().filter(call => call.url === "/api/service-evidence").map(call => JSON.parse(call.body).uploadId)).size, 1);
  assert.equal(h.evidence.length, 3); assert.equal(h.client.getState().uncertain, ""); h.client.dispose();
});
await test("known initial prepare rejection releases the attempt before any possible evidence commit", async () => {
  for (const status of [400, 403]) {
    const h = await harness({ id: submissionFor().id }).mount();
    h.reply = (url, init) => url === "/api/service-evidence" ? Response.json({ ok: false, message: "Prepare rejected" }, { status }) : h.respond(url, init);
    await h.client.upload(file(), "invoice"); assert.equal(h.client.getState().uncertain, ""); assert.equal(h.writes().length, 1);
    h.reply = undefined; await h.client.upload(file(), "invoice"); assert.equal(h.evidence.length, 3); assert.equal(h.client.getState().uncertain, ""); h.client.dispose();
  }
});
await test("committed response loss replays the original receipt even after submission closes", async () => {
  const h = await harness({ id: submissionFor().id }).mount(); let receipt;
  h.reply = async (url, init) => {
    if (url === "/api/service-evidence") {
      const body = JSON.parse(init.body);
      if (body.action === "prepare" && receipt) { assert.equal(body.uploadId, receipt.uploadId); return ok(receipt); }
      if (body.action === "complete") { receipt = await (await h.respond(url, init)).json(); throw new Error("Commit response lost"); }
    }
    return h.respond(url, init);
  };
  await h.client.upload(file(), "invoice"); assert.equal(h.client.getState().uncertain, "change");
  h.row.status = "submitted"; await h.client.reload();
  assert.equal(h.client.getState().submission.status, "submitted"); assert.equal(h.client.getState().uncertain, ""); assert.equal(h.evidence.length, 3);
  assert.equal(h.writes().filter(call => call.method === "PUT").length, 1); h.client.dispose();
});
await test("account leave and rejoin hides private state but retains original metadata for explicit receipt recovery", async () => {
  const h = await harness({ id: submissionFor().id }).mount(); let receipt;
  h.reply = async (url, init) => {
    if (url === "/api/service-evidence") {
      const body = JSON.parse(init.body);
      if (body.action === "prepare" && receipt) { assert.equal(body.expectedActorId, receipt.actorId); assert.equal(body.uploadId, receipt.uploadId); return ok(receipt); }
      if (body.action === "complete") { receipt = await (await h.respond(url, init)).json(); throw new Error("Commit response lost"); }
    }
    return h.respond(url, init);
  };
  await h.client.upload(file(), "invoice"); const writes = h.writes().length;
  h.change(null, "SIGNED_OUT"); assert.equal(h.client.getState().submission, null); assert.equal(h.client.getState().evidence, null); assert.equal(h.client.getState().form.privateProviderNote, "");
  h.change(sessionFor("22222222-2222-4222-8222-222222222222")); await until(() => h.client.getState().phase !== "loading");
  assert.equal(h.client.getState().submission, null); assert.equal(h.client.getState().uncertain, ""); assert.equal(h.writes().length, writes);
  h.change(sessionFor("11111111-1111-4111-8111-111111111111")); await until(() => h.client.getState().phase === "ready");
  assert.equal(h.client.getState().uncertain, "change"); assert.equal(h.writes().length, writes, "account events must not finalize evidence automatically");
  await h.client.reload(); assert.equal(h.client.getState().uncertain, ""); assert.equal(h.evidence.length, 3); assert.equal(h.writes().filter(call => call.method === "PUT").length, 1); h.client.dispose();
});
await test("sign-out clears retained bytes and missing original upload stays blocked after rejoin", async () => {
  const h = await harness({ id: submissionFor().id }).mount(); const gate = deferred();
  h.reply = (url, init) => init.method === "PUT" ? gate.promise : h.respond(url, init);
  const uploading = h.client.upload(file(), "invoice"); await until(() => h.writes().some(call => call.method === "PUT"));
  h.change(null, "SIGNED_OUT"); await uploading; gate.resolve(new Response(""));
  h.change(sessionFor("11111111-1111-4111-8111-111111111111")); await until(() => h.client.getState().phase === "ready");
  await h.client.reload(); assert.equal(h.client.getState().uncertain, "change"); assert.match(h.client.getState().message, /bytes were cleared/);
  const writes = h.writes().length; await h.client.upload(new File(["replacement"], "replacement.pdf", { type: "application/pdf" }), "receipt");
  assert.equal(h.writes().length, writes); assert.equal(h.writes().filter(call => call.method === "PUT").length, 1); assert.equal(h.evidence.length, 2); h.client.dispose();
});
await test("a later known denial cannot discard an earlier unknown completion identity", async () => {
  const h = await harness({ id: submissionFor().id }).mount();
  h.reply = (url, init) => url === "/api/service-evidence" && JSON.parse(init.body).action === "complete" ? Promise.reject(new Error("Commit response lost")) : h.respond(url, init);
  await h.client.upload(file(), "invoice"); const firstId = JSON.parse(h.writes()[0].body).uploadId;
  h.reply = (url, init) => url === "/api/service-evidence" ? Response.json({ ok: false, message: "Permission changed" }, { status: 403 }) : h.respond(url, init);
  await h.client.reload(); assert.equal(h.client.getState().uncertain, "change");
  h.reply = undefined; await h.client.reload();
  assert.equal(new Set(h.writes().filter(call => call.url === "/api/service-evidence").map(call => JSON.parse(call.body).uploadId)).size, 1);
  assert.equal(JSON.parse(h.writes().filter(call => call.url === "/api/service-evidence").at(-1).body).uploadId, firstId); assert.equal(h.client.getState().uncertain, ""); h.client.dispose();
});
await test("exact terminal tombstone settles unknown evidence without recreating removed attachment", async () => {
  const h = await harness({ id: submissionFor().id }).mount();
  h.reply = (url, init) => url === "/api/service-evidence" && JSON.parse(init.body).action === "complete" ? Promise.reject(new Error("Commit response lost")) : h.respond(url, init);
  await h.client.upload(file(), "invoice"); const original = JSON.parse(h.writes()[0].body);
  h.reply = (url, init) => url === "/api/service-evidence" ? Response.json({ ok: false, code: "upload_deleted", message: "Removed", uncertain: false, retryable: false, uploadId: original.uploadId, submissionId: original.submissionId, actorId: original.expectedActorId }, { status: 409 }) : h.respond(url, init);
  await h.client.reload(); assert.equal(h.client.getState().uncertain, ""); assert.match(h.client.getState().message, /was removed/); assert.equal(h.evidence.length, 2);
  assert.equal(h.writes().filter(call => call.method === "PUT").length, 1); h.client.dispose();
});
await test("unbound or incomplete tombstone errors cannot release an unknown upload identity", async () => {
  for (const override of [{ uploadId: "44444444-4444-4444-8444-444444444444" }, { actorId: "22222222-2222-4222-8222-222222222222" }, { submissionId: "55555555-5555-4555-8555-555555555555" }, { uncertain: undefined }, { retryable: true }]) {
    const h = await harness({ id: submissionFor().id }).mount();
    h.reply = (url, init) => url === "/api/service-evidence" && JSON.parse(init.body).action === "complete" ? Promise.reject(new Error("Commit response lost")) : h.respond(url, init);
    await h.client.upload(file(), "invoice"); const original = JSON.parse(h.writes()[0].body);
    h.reply = (url, init) => url === "/api/service-evidence" ? Response.json({ ok: false, code: "upload_deleted", message: "Removed", uncertain: false, retryable: false, uploadId: original.uploadId, submissionId: original.submissionId, actorId: original.expectedActorId, ...override }, { status: 409 }) : h.respond(url, init);
    await h.client.reload(); assert.equal(h.client.getState().uncertain, "change"); const writes = h.writes().length; await h.client.upload(file(), "invoice"); assert.equal(h.writes().length, writes); h.client.dispose();
  }
});
await test("new editor mount only reads provider identity", async () => {
  const h = await harness().mount();
  assert.equal(h.client.getState().phase, "ready"); assert.equal(h.client.getState().submission, null);
  assert.deepEqual(h.calls.map(call => call.url), ["/api/service-providers"]); assert.equal(h.writes().length, 0); h.client.dispose();
});
await test("resume restores all form fields and owner review note without writes", async () => {
  const h = await harness({ id: "33333333-3333-4333-8333-333333333333", row: submissionFor({ status: "changes_requested", partsInstalled: "Bone nut", setupMeasurements: "Relief 0.2 mm", requestedVisibility: "public", recommendedPublicDescription: "Completed setup" }) }).mount();
  const state = h.client.getState();
  for (const key of Object.keys(emptyServiceForm())) assert.equal(state.form[key], h.row[key]);
  assert.equal(state.submission.ownerReviewNote, h.row.ownerReviewNote); assert.equal(state.submission.status, "changes_requested"); assert.equal(h.writes().length, 0); h.client.dispose();
});
for (const [name, override] of [["different provider", { provider: { userId: "22222222-2222-4222-8222-222222222222" } }], ["different Profile", { qrCode: "QRG-OTHER" }], ["different request", { id: "44444444-4444-4444-8444-444444444444" }], ["missing evidence count", { evidenceCount: undefined }]]) {
  await test("resume rejects " + name + " before hydration or editing", async () => {
    const h = await harness({ id: "33333333-3333-4333-8333-333333333333", row: submissionFor(override) }).mount();
    assert.equal(h.client.getState().phase, "error"); assert.equal(h.client.getState().submission, null); assert.equal(h.client.getState().form.privateProviderNote, "");
    await h.client.save("save_draft"); assert.equal(h.writes().length, 0); h.client.dispose();
  });
}
await test("missing request and read failure are errors rather than empty editable drafts", async () => {
  for (const reply of [async url => url.includes("?") ? ok({ submission: null, submissions: [] }) : ok({ provider: providerFor("11111111-1111-4111-8111-111111111111") }), async () => Response.json({ ok: false, message: "Database unavailable" }, { status: 503 }), async () => new Response("invalid json")]) {
    const h = await harness({ id: "33333333-3333-4333-8333-333333333333", reply }).mount(); assert.equal(h.client.getState().phase, "error"); assert.equal(h.client.getState().submission, null); h.client.dispose();
  }
});
await test("null provider is a valid empty provider form", async () => {
  const h = await harness({ reply: async () => ok({ provider: null }) }).mount(); assert.equal(h.client.getState().phase, "ready"); assert.deepEqual(h.client.getState().provider, emptyProvider()); h.client.dispose();
});
await test("auth construction and session rejection end loading with retryable errors", async () => {
  for (const options of [{ constructError: true }, { getSession: async () => { throw new Error("Session unavailable"); } }, { getSession: async () => ({ data: { session: sessionFor("11111111-1111-4111-8111-111111111111") }, error: new Error("Expired") }) }]) {
    const h = await harness(options).mount(); assert.equal(h.client.getState().phase, "error"); assert.equal(h.calls.length, 0); h.client.dispose();
  }
});
await test("session deadline ends loading even if the auth promise ignores cancellation", async () => {
  const h = await harness({ timeoutMs: 8, getSession: () => new Promise(() => {}) }).mount(); assert.equal(h.client.getState().phase, "error"); assert.match(h.client.getState().message, /timed out/); h.client.dispose();
});
await test("same-actor refresh preserves unsaved form and does not reload", async () => {
  const h = await harness().mount(); h.fill(); const calls = h.calls.length;
  h.change({ ...sessionFor("11111111-1111-4111-8111-111111111111"), access_token: "refreshed-token" }, "TOKEN_REFRESHED"); await tick();
  assert.equal(h.client.getState().form.title, "New work"); assert.equal(h.calls.length, calls); h.client.dispose();
});
await test("sign-out immediately clears private form and ignores a late read", async () => {
  const gate = deferred(); const h = harness({ id: "33333333-3333-4333-8333-333333333333", reply: (url, init) => url.includes("?") ? gate.promise : h.respond(url, init) });
  await h.client.start(); await until(() => h.calls.some(call => call.url.includes("?")));
  h.change(null, "SIGNED_OUT"); assert.equal(h.client.getState().phase, "signed-out"); assert.equal(h.client.getState().form.privateProviderNote, "");
  gate.resolve(ok({ submission: submissionFor() })); await tick(); assert.equal(h.client.getState().submission, null); assert.equal(h.client.getState().phase, "signed-out"); h.client.dispose();
});
await test("fresh token lookup detects account changes even without an auth event", async () => {
  const h = await harness().mount(); h.fill(); h.session = sessionFor("22222222-2222-4222-8222-222222222222"); await h.client.save("save_draft");
  await until(() => h.client.getState().phase !== "loading"); assert.equal(h.writes().length, 0); assert.equal(h.client.getState().actorId, "22222222-2222-4222-8222-222222222222"); assert.equal(h.client.getState().form.title, ""); h.client.dispose();
});
await test("account switch during token lookup never sends the previous form", async () => {
  const h = await harness().mount(); h.fill(); const gate = deferred(); h.getSession = () => gate.promise;
  const saving = h.client.save("save_draft"); await tick(); h.getSession = undefined; h.change(sessionFor("22222222-2222-4222-8222-222222222222")); gate.resolve({ data: { session: sessionFor("11111111-1111-4111-8111-111111111111") } }); await saving;
  await until(() => h.client.getState().phase !== "loading"); assert.equal(h.writes().length, 0); assert.equal(h.client.getState().actorId, "22222222-2222-4222-8222-222222222222"); h.client.dispose();
});
await test("account switch after provider write discards its response and prevents create", async () => {
  const h = await harness().mount(); h.fill(); const gate = deferred();
  h.reply = (url, init) => init.method === "PATCH" ? gate.promise : h.respond(url, init);
  const saving = h.client.save("save_draft"); await until(() => h.writes().length === 1); h.change(sessionFor("22222222-2222-4222-8222-222222222222")); gate.resolve(ok({ provider: providerFor("11111111-1111-4111-8111-111111111111") })); await saving; await tick();
  assert.equal(h.writes().length, 1); assert.equal(h.client.getState().submission, null); assert.equal(h.client.getState().actorId, "22222222-2222-4222-8222-222222222222"); h.client.dispose();
});
await test("one lock covers provider save, create, submit and duplicate clicks", async () => {
  const h = await harness().mount(); h.fill(); const gate = deferred();
  h.reply = (url, init) => url === "/api/service-providers" && init.method === "PATCH" ? gate.promise : h.respond(url, init);
  const saving = h.client.save("submit"); await until(() => h.writes().length === 1);
  await h.client.save("submit"); await h.client.upload(file(), "invoice"); assert.equal(h.writes().length, 1); assert.equal(h.client.getState().busy, "submit");
  gate.resolve(ok({ provider: providerFor("11111111-1111-4111-8111-111111111111") })); await saving;
  assert.deepEqual(h.writes().map(call => [call.url, call.method]), [["/api/service-providers", "PATCH"], ["/api/service-submissions", "POST"], ["/api/service-submissions", "PATCH"]]);
  assert.equal(h.client.getState().submission.status, "submitted"); assert.equal(h.client.getState().busy, ""); h.client.dispose();
});
await test("new draft save uses the confirmed POST without an unnecessary second write", async () => {
  const h = await harness().mount(); h.fill(); await h.client.save("save_draft");
  assert.equal(h.writes().length, 2); assert.equal(h.client.getState().submission.id, "55555555-5555-4555-8555-555555555555"); assert.equal(h.client.getState().submission.status, "draft"); h.client.dispose();
});
await test("incomplete submission is rejected before any write", async () => {
  const h = await harness().mount(); await h.client.save("submit"); assert.equal(h.writes().length, 0); assert.match(h.client.getState().message, /service date/); assert.equal(h.client.getState().busy, ""); h.client.dispose();
});
await test("provider failure never starts a service draft and releases the lock", async () => {
  const h = await harness().mount(); h.fill(); h.reply = async () => { throw new Error("Network down"); };
  await h.client.save("save_draft"); assert.equal(h.writes().length, 1); assert.equal(h.client.getState().submission, null); assert.equal(h.client.getState().busy, "");
  h.reply = undefined; await h.client.save("save_draft"); assert.equal(h.client.getState().submission.id, "55555555-5555-4555-8555-555555555555"); h.client.dispose();
});
await test("duplicate work-order offers an ID without hydrating or discarding unsaved fields", async () => {
  const h = await harness().mount(); h.fill(); h.reply = (url, init) => init.method === "POST" ? Response.json({ ok: false, message: "Existing work order", existingSubmissionId: "previous-request" }, { status: 409 }) : h.respond(url, init);
  await h.client.save("save_draft"); const state = h.client.getState(); assert.equal(state.duplicateId, "previous-request"); assert.equal(state.form.title, "New work"); assert.equal(state.submission, null); assert.equal(state.uncertain, ""); assert.equal(h.calls.filter(call => call.url.includes("previous-request")).length, 0); h.client.dispose();
});
await test("unconfirmed POST blocks blind retry and keeps the original form", async () => {
  const h = await harness().mount(); h.fill(); h.reply = (url, init) => init.method === "POST" ? Promise.reject(new Error("Response lost")) : h.respond(url, init);
  await h.client.save("save_draft"); const calls = h.calls.length; assert.equal(h.client.getState().uncertain, "create"); assert.equal(h.client.getState().form.title, "New work");
  await h.client.save("save_draft"); assert.equal(h.calls.length, calls); await h.client.reload(); assert.equal(h.client.getState().uncertain, "create"); h.client.dispose();
});
await test("HTTP success without a valid confirmed submission is uncertain, never saved", async () => {
  const h = await harness().mount(); h.fill(); h.reply = (url, init) => init.method === "POST" ? ok({ submission: { id: "made-up" } }) : h.respond(url, init);
  await h.client.save("save_draft"); assert.equal(h.client.getState().uncertain, "create"); assert.equal(h.client.getState().submission, null); assert.equal(h.client.getState().busy, ""); h.client.dispose();
});
await test("confirmed draft survives a lost submit response and reload recovers actual status", async () => {
  const h = await harness().mount(); h.fill();
  h.reply = async (url, init) => { if (url === "/api/service-submissions" && init.method === "PATCH") { await h.respond(url, init); throw new Error("Reply lost after commit"); } return h.respond(url, init); };
  await h.client.save("submit"); assert.equal(h.client.getState().submission.id, "55555555-5555-4555-8555-555555555555"); assert.equal(h.client.getState().uncertain, "change"); assert.equal(h.client.getState().busy, "");
  await h.client.reload(); assert.equal(h.client.getState().submission.status, "submitted"); assert.equal(h.client.getState().uncertain, ""); const writes = h.writes().length; await h.client.save("submit"); assert.equal(h.writes().length, writes); h.client.dispose();
});
await test("changes_requested saves or revises the existing ID without another create", async () => {
  const h = await harness({ id: "33333333-3333-4333-8333-333333333333", row: submissionFor({ status: "changes_requested" }) }).mount(); h.fill(); await h.client.save("revise");
  assert.equal(h.writes().some(call => call.method === "POST"), false); const body = JSON.parse(h.writes().at(-1).body); assert.equal(body.id, "33333333-3333-4333-8333-333333333333"); assert.equal(body.action, "revise"); assert.equal(h.client.getState().submission.status, "submitted"); h.client.dispose();
});
await test("closed requests never permit saves or evidence uploads", async () => {
  for (const status of ["submitted", "approved", "declined", "cancelled", "expired"]) {
    const h = await harness({ id: "33333333-3333-4333-8333-333333333333", row: submissionFor({ status }) }).mount(); await h.client.save("save_draft"); await h.client.upload(file(), "invoice"); assert.equal(h.writes().length, 0); h.client.dispose();
  }
});
await test("evidence lock rejects overlapping writes and counts only one confirmed upload", async () => {
  const h = await harness({ id: "33333333-3333-4333-8333-333333333333" }).mount(); const gate = deferred(); h.reply = (url, init) => url === "/api/service-evidence" && JSON.parse(init.body).action === "prepare" ? gate.promise : h.respond(url, init);
  const uploading = h.client.upload(file(), "invoice"); await until(() => h.writes().length === 1); await h.client.upload(file(), "invoice"); await h.client.save("submit"); assert.equal(h.writes().length, 1);
  gate.resolve(await h.respond("/api/service-evidence", h.writes()[0])); await uploading; assert.equal(h.client.getState().submission.evidenceCount, 3); assert.equal(h.writes().length, 3); assert.equal(h.client.getState().busy, ""); h.client.dispose();
});
await test("unconfirmed evidence response does not inflate count and requires reload", async () => {
  const h = await harness({ id: "33333333-3333-4333-8333-333333333333" }).mount(); h.reply = async () => ok({ evidence: { id: "evidence-unconfirmed" } });
  await h.client.upload(file(), "invoice"); assert.equal(h.client.getState().submission.evidenceCount, 2); assert.equal(h.client.getState().uncertain, "change"); assert.equal(h.client.getState().busy, ""); h.client.dispose();
});
await test("JSON parsing deadline bounds a mutation and rejects a later result", async () => {
  const h = await harness({ timeoutMs: 8 }).mount(); h.fill(); const gate = deferred();
  h.reply = (url, init) => init.method === "POST" ? Promise.resolve({ ok: true, status: 201, json: () => gate.promise }) : h.respond(url, init);
  await h.client.save("save_draft"); assert.equal(h.client.getState().uncertain, "create"); assert.equal(h.client.getState().busy, "");
  gate.resolve({ ok: true, submission: submissionFor({ id: "late" }) }); await tick(); assert.equal(h.client.getState().submission, null); h.client.dispose();
});
await test("dispose unsubscribes, clears private state and suppresses late callbacks", async () => {
  const h = await harness({ id: "33333333-3333-4333-8333-333333333333" }).mount(); const gate = deferred(); h.reply = () => gate.promise; let notifications = 0; h.client.subscribe(() => notifications++);
  const saving = h.client.save("save_draft"); await until(() => h.writes().length === 1); h.client.dispose(); const before = notifications;
  gate.resolve(ok({ provider: providerFor("11111111-1111-4111-8111-111111111111") })); await saving; assert.equal(h.unsubscribed, true); assert.equal(notifications, before); assert.equal(h.client.getState().form.privateProviderNote, ""); assert.equal(h.client.getState().submission, null);
});
await test("resume paths encode user-controlled values and strict reader rejects owner-only access", () => {
  assert.equal(serviceResumePath("QRG/A", "id&other=1"), "/service-work/QRG%2FA?submission=id%26other%3D1");
  assert.throws(() => readWorkSubmission(submissionFor({ provider: { userId: "provider" } }), "owner", "QRG-TEST", "33333333-3333-4333-8333-333333333333"), /does not belong/);
});
// Execute the page effect against the installed Next history adapter, not a plain browser stub.
const pageSource = fs.readFileSync(path.join(root, "app/service-work/[code]/page.tsx"), "utf8");
const pageTree = ts.createSourceFile("page.tsx", pageSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const nextSource = fs.readFileSync(require.resolve("next/dist/client/components/app-router.js"), "utf8");
const nextTree = ts.createSourceFile("router.js", nextSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
let routeEffect, routeComponent, editorComponent, historyAdapter, copyHistory;
function visitPage(node) {
  if (ts.isCallExpression(node) && node.expression.getText(pageTree) === "useEffect" && node.arguments[0]?.getText(pageTree).includes("history.replaceState")) routeEffect = node.arguments[0].getText(pageTree);
  if (ts.isFunctionDeclaration(node) && node.name?.text === "ServiceWorkRoute") routeComponent = node.getText(pageTree);
  if (ts.isFunctionDeclaration(node) && node.name?.text === "ServiceWorkEditor") editorComponent = node.getText(pageTree);
  ts.forEachChild(node, visitPage);
}
function visitNext(node) {
  if (ts.isBinaryExpression(node) && node.left.getText(nextTree) === "window.history.replaceState" && ts.isFunctionExpression(node.right)) historyAdapter = node.right.getText(nextTree);
  if (ts.isFunctionDeclaration(node) && node.name?.text === "copyNextJsInternalHistoryState") copyHistory = node.getText(nextTree);
  ts.forEachChild(node, visitNext);
}
visitPage(pageTree); visitNext(nextTree);
assert.ok(routeEffect && routeComponent && historyAdapter && copyHistory, "page and installed Next route adapters must be available");
function routeHarness() {
  let routerUrl = "https://test.invalid/service-work/QRG-TEST";
  let addressUrl = routerUrl;
  const window = { history: { state: { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: {} } } };
  window.history.replaceState = new Function("window", "originalReplaceState", "applyUrlFromHistoryPushReplace", copyHistory + "\nreturn (" + historyAdapter + ");")(
    window, (data, _unused, url) => { window.history.state = data; addressUrl = new URL(url, addressUrl).href; }, url => { routerUrl = new URL(url, routerUrl).href; }
  );
  const routeJs = ts.transpileModule(routeComponent, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  const route = new Function("React", "ServiceWorkEditor", "useParams", "useSearchParams", routeJs + "\nreturn ServiceWorkRoute;")(
    { createElement: (type, props) => ({ type, props }) }, () => null, () => ({ code: "QRG-TEST" }), () => new URL(routerUrl).searchParams
  );
  return {
    route,
    address: () => addressUrl,
    run(state) { return new Function("window", "qrCode", "requestedId", "submission", "busy", "state", "serviceResumePath", "return (" + routeEffect + ")();")(
      window, "QRG-TEST", new URL(routerUrl).searchParams.get("submission") || "", state.submission, state.busy, state, serviceResumePath
    ); }
  };
}
await test("confirmed draft updates Next route identity and survives sign-out/sign-in recovery", async () => {
  const h = await harness().mount(); h.fill(); await h.client.save("save_draft");
  const routed = routeHarness(); const original = routed.route(); routed.run(h.client.getState());
  const next = routed.route();
  assert.notEqual(next.props.key, original.props.key);
  assert.equal(next.props.requestedId, "55555555-5555-4555-8555-555555555555");
  assert.equal(new URL(routed.address()).searchParams.get("submission"), "55555555-5555-4555-8555-555555555555");
  const resumed = await harness({ id: next.props.requestedId, row: h.row }).mount();
  h.client.dispose(); resumed.change(null, "SIGNED_OUT");
  assert.equal(resumed.client.getState().phase, "signed-out");
  assert.equal(serviceResumePath(next.props.qrCode, next.props.requestedId), "/service-work/QRG-TEST?submission=55555555-5555-4555-8555-555555555555");
  resumed.change(sessionFor("11111111-1111-4111-8111-111111111111")); await until(() => resumed.client.getState().phase === "ready");
  assert.equal(resumed.client.getState().submission.id, "55555555-5555-4555-8555-555555555555");
  assert.equal(resumed.client.getState().form.title, "New work"); resumed.client.dispose();
});
await test("pending and unconfirmed writes never remount away their recovery state", () => {
  for (const override of [{ busy: "submit" }, { uncertain: "change" }, { phase: "error" }]) {
    const route = routeHarness(); route.run({ phase: "ready", submission: submissionFor(), busy: "", uncertain: "", ...override });
    assert.equal(route.route().props.requestedId, "");
    assert.equal(new URL(route.address()).search, "");
  }
});
await test("saved evidence is loaded on demand without writes, including closed statuses", async () => {
  for (const status of ["draft", "changes_requested", "submitted", "approved", "declined", "cancelled", "expired"]) {
    const h = await harness({ id: "33333333-3333-4333-8333-333333333333", row: submissionFor({ status }) }).mount();
    assert.equal(h.calls.some(call => call.url.startsWith("/api/service-evidence")), false);
    await h.client.loadEvidence(); assert.equal(h.client.getState().evidence.length, 2); assert.equal(h.client.getState().evidenceLoading, false); assert.equal(h.writes().length, 0);
    if (!["draft", "changes_requested"].includes(status)) { await h.client.removeEvidence("evidence-1"); assert.equal(h.writes().length, 0); }
    h.client.dispose();
  }
});
await test("evidence read failure remains an error and does not report zero attachments", async () => {
  const h = await harness({ id: "33333333-3333-4333-8333-333333333333" }).mount();
  h.reply = (url, init) => url.startsWith("/api/service-evidence?") ? Response.json({ ok: false, message: "Evidence unavailable" }, { status: 503 }) : h.respond(url, init);
  await h.client.loadEvidence(); assert.equal(h.client.getState().evidence, null); assert.equal(h.client.getState().submission.evidenceCount, 2); assert.match(h.client.getState().evidenceError, /unavailable/); assert.equal(h.client.getState().phase, "ready"); h.client.dispose();
});
await test("malformed evidence and unsafe links cannot reach the file list", () => {
  for (const value of [null, {}, [evidenceFor("one"), evidenceFor("one")], [{ ...evidenceFor("one"), fileSizeBytes: -1 }], [{ ...evidenceFor("one"), previewUrl: "javascript:alert(1)" }], [{ ...evidenceFor("one"), previewUrl: "https://user:password@example.invalid/" }]]) assert.throws(() => readWorkEvidence(value));
  assert.deepEqual(readWorkEvidence([]), []); assert.equal(readWorkEvidence([evidenceFor("one")])[0].id, "one");
});
await test("account change clears private evidence and suppresses a late signed-link response", async () => {
  const h = await harness({ id: "33333333-3333-4333-8333-333333333333" }).mount(); const gate = deferred();
  h.reply = (url, init) => url.startsWith("/api/service-evidence?") ? gate.promise : h.respond(url, init);
  const loading = h.client.loadEvidence(); await until(() => h.calls.some(call => call.url.startsWith("/api/service-evidence?")));
  h.change(null, "SIGNED_OUT"); gate.resolve(ok({ evidence: [evidenceFor("private-old-account")] })); await loading;
  assert.equal(h.client.getState().evidence, null); assert.equal(h.client.getState().phase, "signed-out"); h.client.dispose();
});
await test("evidence load deadline releases controls even if transport ignores cancellation", async () => {
  const h = await harness({ id: "33333333-3333-4333-8333-333333333333", timeoutMs: 8 }).mount(); h.reply = () => new Promise(() => {});
  await h.client.loadEvidence(); assert.equal(h.client.getState().evidenceLoading, false); assert.match(h.client.getState().evidenceError, /timed out/); assert.equal(h.client.getState().submission.evidenceCount, 2); h.client.dispose();
});
await test("confirmed removal updates only the selected attachment and guards duplicate clicks", async () => {
  const h = await harness({ id: "33333333-3333-4333-8333-333333333333" }).mount(); await h.client.loadEvidence(); const gate = deferred();
  h.reply = (url, init) => init.method === "DELETE" ? gate.promise : h.respond(url, init);
  const removal = h.client.removeEvidence("evidence-1"); await until(() => h.writes().length === 1); await h.client.removeEvidence("evidence-1"); assert.equal(h.writes().length, 1);
  assert.deepEqual(JSON.parse(h.writes()[0].body), { evidenceId: "evidence-1" });
  gate.resolve(ok({ committed: true })); await removal;
  assert.deepEqual(h.client.getState().evidence.map(item => item.id), ["evidence-2"]); assert.equal(h.client.getState().submission.evidenceCount, 1); h.client.dispose();
});
await test("unknown attachment removal never sends a write", async () => {
  const h = await harness({ id: "33333333-3333-4333-8333-333333333333" }).mount(); await h.client.removeEvidence("unknown"); assert.equal(h.writes().length, 0);
  await h.client.loadEvidence(); await h.client.removeEvidence("unknown"); assert.equal(h.writes().length, 0); h.client.dispose();
});
await test("unconfirmed removal keeps evidence visible and blocks blind repetition", async () => {
  const h = await harness({ id: "33333333-3333-4333-8333-333333333333" }).mount(); await h.client.loadEvidence(); h.reply = async () => { throw new Error("Delete response lost"); };
  await h.client.removeEvidence("evidence-1"); assert.equal(h.client.getState().uncertain, "change"); assert.equal(h.client.getState().evidence.length, 2); assert.equal(h.client.getState().submission.evidenceCount, 2);
  await h.client.removeEvidence("evidence-1"); assert.equal(h.writes().length, 1); h.client.dispose();
});
await test("evidence list response started before a mutation cannot restore stale attachments", async () => {
  const h = await harness({ id: "33333333-3333-4333-8333-333333333333" }).mount(); const gate = deferred();
  let firstRead = true;
  h.reply = (url, init) => { if (url.startsWith("/api/service-evidence?") && firstRead) { firstRead = false; return gate.promise; } return h.respond(url, init); };
  const loading = h.client.loadEvidence(); await until(() => h.calls.some(call => call.url.startsWith("/api/service-evidence?")));
  await h.client.upload(file(), "invoice"); gate.resolve(ok({ evidence: [evidenceFor("old")] })); await loading;
  assert.equal(h.client.getState().evidence.length, 3); assert.equal(h.client.getState().submission.evidenceCount, 3); h.client.dispose();
});
await test("unsupported or oversized attachments fail locally before upload", async () => {
  const h = await harness({ id: "33333333-3333-4333-8333-333333333333" }).mount();
  for (const file of [{ type: "text/html", size: 10 }, { type: "application/pdf", size: 0 }, { type: "application/pdf", size: 15 * 1024 * 1024 + 1 }]) { await h.client.upload(file, "invoice"); assert.equal(h.writes().length, 0); }
  h.client.dispose();
});
await test("15 MB evidence bytes go directly to bound private Storage with small control requests", async () => {
  const h = await harness({ id: submissionFor().id }).mount();
  const attachment = new File([new Uint8Array(15 * 1024 * 1024)], "service invoice.pdf", { type: "application/pdf" });
  await h.client.upload(attachment, "invoice");
  const writes = h.writes();
  assert.deepEqual(writes.map(call => call.method), ["POST", "PUT", "POST"]);
  assert.deepEqual(writes.filter(call => call.method === "POST").map(call => JSON.parse(call.body).action), ["prepare", "complete"]);
  for (const call of writes.filter(call => call.method === "POST")) {
    assert.ok(Buffer.byteLength(call.body) < 16384); assert.equal(JSON.parse(call.body).size, attachment.size);
    assert.equal(call.headers.authorization, `Bearer token-${h.session.user.id}`);
  }
  const upload = writes[1]; assert.equal(upload.body, attachment); assert.equal(upload.credentials, "omit"); assert.equal(upload.redirect, "error");
  assert.equal(upload.headers.authorization, undefined); assert.equal(upload.headers["x-upsert"], "false");
  assert.equal(h.client.getState().submission.evidenceCount, 3); assert.equal(h.client.getState().uncertain, ""); h.client.dispose();
});
await test("untrusted signed destinations never receive evidence bytes", async () => {
  for (const tamper of [url => url.replace(storageOrigin, "https://attacker.invalid"), url => url.replace("/direct/", "/other/"), url => url + "&redirect=unsafe", url => url.replace("?token=", "?token=&extra=")]) {
    const h = await harness({ id: submissionFor().id }).mount();
    h.reply = async (url, init) => { const response = await h.respond(url, init); if (url === "/api/service-evidence") { const payload = await response.json(); return ok({ ...payload, signedUrl: tamper(payload.signedUrl) }); } return response; };
    await h.client.upload(file(), "invoice"); assert.equal(h.writes().length, 1); assert.match(h.client.getState().message, /destination/); assert.equal(h.client.getState().submission.evidenceCount, 2); h.client.dispose();
  }
});
await test("a switched account cannot upload bytes using a previously prepared capability", async () => {
  const h = await harness({ id: submissionFor().id }).mount();
  h.reply = async (url, init) => { const response = await h.respond(url, init); if (url === "/api/service-evidence") h.session = sessionFor("22222222-2222-4222-8222-222222222222"); return response; };
  await h.client.upload(file(), "invoice"); assert.equal(h.writes().length, 1); assert.equal(h.client.getState().actorId, "22222222-2222-4222-8222-222222222222"); h.client.dispose();
});
await test("sign-out during the direct upload prevents finalization and clears private state", async () => {
  const h = await harness({ id: submissionFor().id }).mount(); const gate = deferred();
  h.reply = (url, init) => init.method === "PUT" ? gate.promise : h.respond(url, init);
  const uploading = h.client.upload(file(), "invoice"); await until(() => h.writes().some(call => call.method === "PUT"));
  h.change(null, "SIGNED_OUT"); gate.resolve(new Response("")); await uploading;
  assert.equal(h.writes().length, 2); assert.equal(h.client.getState().phase, "signed-out"); assert.equal(h.client.getState().evidence, null); h.client.dispose();
});
await test("lost Storage response is reconciled through the authoritative complete endpoint", async () => {
  const h = await harness({ id: submissionFor().id }).mount();
  h.reply = (url, init) => init.method === "PUT" ? Promise.reject(new Error("Reply lost after upload")) : h.respond(url, init);
  await h.client.upload(file(), "invoice"); assert.equal(h.writes().length, 3); assert.equal(h.client.getState().submission.evidenceCount, 3); assert.equal(h.client.getState().uncertain, ""); h.client.dispose();
});
await test("unknown complete result blocks duplicate writes until saved state is reloaded", async () => {
  const h = await harness({ id: submissionFor().id }).mount();
  h.reply = (url, init) => url === "/api/service-evidence" && JSON.parse(init.body).action === "complete" ? Promise.reject(new Error("Commit response lost")) : h.respond(url, init);
  await h.client.upload(file(), "invoice"); assert.equal(h.client.getState().uncertain, "change"); assert.equal(h.client.getState().submission.evidenceCount, 2);
  await h.client.upload(file(), "invoice"); assert.equal(h.writes().length, 3); await h.client.reload(); assert.equal(h.client.getState().uncertain, "change");
  assert.equal(new Set(h.writes().filter(call => call.url === "/api/service-evidence").map(call => JSON.parse(call.body).uploadId)).size, 1); h.client.dispose();
});
for (const phase of ["uploaded", "committed"]) {
  await test(`${phase} preparation skips byte upload and reloads the authoritative evidence count`, async () => {
    const h = await harness({ id: submissionFor().id }).mount();
    h.reply = async (url, init) => {
      const response = await h.respond(url, init);
      if (url === "/api/service-evidence" && JSON.parse(init.body).action === "prepare") return ok({ ...await response.json(), phase, committed: phase === "committed", evidence: { id: "evidence-1" }, signedUrl: undefined });
      return response;
    };
    await h.client.upload(file(), "invoice"); assert.equal(h.writes().some(call => call.method === "PUT"), false);
    assert.equal(h.writes().length, phase === "uploaded" ? 2 : 1); assert.equal(h.client.getState().submission.evidenceCount, phase === "uploaded" ? 3 : 2); h.client.dispose();
  });
}
await test("evidence list failure after a confirmed upload offers read retry without reporting a failed commit", async () => {
  const h = await harness({ id: submissionFor().id }).mount();
  h.reply = (url, init) => url.startsWith("/api/service-evidence?") ? Response.json({ ok: false, message: "File list temporarily unavailable" }, { status: 503 }) : h.respond(url, init);
  await h.client.upload(file(), "invoice"); assert.equal(h.client.getState().message, "Private evidence uploaded."); assert.match(h.client.getState().evidenceError, /unavailable/); assert.equal(h.client.getState().uncertain, "");
  h.reply = undefined; await h.client.loadEvidence(); assert.equal(h.client.getState().evidence.length, 3); h.client.dispose();
});
function renderEditor(status, removalId = "", phase = "ready") {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const submission = submissionFor({ status });
  const values = [{ ...initialWorkbenchState(), phase, actorId: "11111111-1111-4111-8111-111111111111", submission, provider: providerFor("11111111-1111-4111-8111-111111111111"), form: { ...emptyServiceForm(), ...submission }, evidence: [evidenceFor("invoice-one")] }, "invoice", removalId];
  let index = 0;
  const empty = () => null;
  const env = { React, useState: () => [values[index++], () => {}], useRef: () => ({ current: null }), useEffect() {}, useSiteContent: () => ({}), initialWorkbenchState, categories: ["Setup"], getContentValue: (_, key) => key, serviceResumePath,
    Nav: empty, Footer: empty, ArrowLeft: empty, CheckCircle2: empty, FileLock2: empty, Upload: empty,
    Link: ({ children, ...props }) => React.createElement("a", props, children), styles: new Proxy({}, { get: (_, name) => name }) };
  const code = ts.transpileModule(editorComponent, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  const Component = new Function(...Object.keys(env), code + "\nreturn ServiceWorkEditor;")(...Object.values(env));
  return renderToStaticMarkup(React.createElement(Component, { qrCode: "QRG-TEST", requestedId: "33333333-3333-4333-8333-333333333333" }));
}
await test("closed editor renders private file access outside disabled editing controls", () => {
  const html = renderEditor("approved");
  assert.match(html, /Open invoice-one.pdf in a new tab/); assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /referrerPolicy="no-referrer"/);
  assert.doesNotMatch(html, /Remove invoice-one.pdf|Confirm removal/);
  assert.ok(html.lastIndexOf("</fieldset>") < html.indexOf("Attached evidence"));
});
await test("editable evidence asks for confirmation and signed-out page reveals no file link", () => {
  assert.match(renderEditor("draft", "invoice-one"), /Remove this attachment\?/);
  assert.match(renderEditor("draft", "invoice-one"), /Confirm removal/);
  assert.match(renderEditor("draft", "invoice-one"), /Keep file/);
  const html = renderEditor("draft", "", "signed-out");
  assert.doesNotMatch(html, /storage.example.invalid|invoice-one.pdf/); assert.match(html, /Sign in required/);
});
console.log(`Service workbench: ${count} behavior tests passed.`);
