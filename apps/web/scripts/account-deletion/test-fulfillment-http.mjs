import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(process.argv[2] || path.join(here, "../../../.."));
const root = path.join(repo, "apps/web/lib/account-deletion");
const require = createRequire(path.join(repo, "apps/web/package.json"));
const ts = require("typescript"), cache = new Map();
function load(name) {
  if (cache.has(name)) return cache.get(name);
  const output = ts.transpileModule(fs.readFileSync(path.join(root, name + ".ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", output)(id => id.startsWith("./") ? load(id.slice(2)) : require(id), module, module.exports);
  cache.set(name, module.exports); return module.exports;
}
const { createFulfillmentService } = load("fulfillment-service");
const { createFulfillmentHandlers } = load("fulfillment-http");
const ADMIN = "30000000-0000-4000-8000-000000000003", ACTOR = "10000000-0000-4000-8000-000000000001", REQUEST = "50000000-0000-4000-8000-000000000005";
const CLAIM = "71000000-0000-4000-8000-000000000071";
const endpoint = `https://www.qrguitar.com/api/admin/account-deletion-requests/${REQUEST}/fulfill`;
const now = "2026-09-18T18:00:00.123456+00:00";
const profileFingerprint = "a".repeat(64), billingFingerprint = "b".repeat(64), serviceFingerprint = "c".repeat(64);
const SUBJECT = "90000000-0000-4000-8000-000000000009";
const profileReviews = [{ guitarId: "70000000-0000-4000-8000-000000000007", qrCode: "QRG-REVIEW", permanentPath: "/i/QRG-REVIEW",
  relationshipCodes: ["transfer_from_owner"], policyVersion: 1, contentFingerprint: profileFingerprint, attested: false, attestedAt: null }];
const retentionReviews = [
  { domain: "billing", policyVersion: 1, contentFingerprint: billingFingerprint, required: true, decisionCode: null, attested: false, attestedAt: null },
  { domain: "service", policyVersion: 1, contentFingerprint: serviceFingerprint, required: true, decisionCode: null, attested: false, attestedAt: null }
];
const reviews = { profileReviews, retentionReviews, storageReviews: [] };
const profileSectionCodes = ["guitar","redirects","specs","media","documents","externalMedia","serialAliases","timeline","transfers","claims","claimEvidence","claimEvents","serviceAccess","serviceSubmissions","serviceEvidence","serviceTokens","serviceActivity","serviceNotifications","serviceUploads","serviceUploadScopes","serviceDiscardReceipts","createReceipts","stagedUploads","siteContent"];
const billingSectionCodes = ["customers","orders","receipts","grants","consumptions","holds","decisions","promotions","directOrders","directClaims","directPayments","providerReferences","paypalOrders","paypalBindings","webhookDeliveries","webhookPayloads","webhookOutcomes","webhookActions"];
const serviceSectionCodes = ["submissions","evidence","uploads","discards","activity","timeline"];
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const reviewHashes = new WeakMap();
const relocation = (overrides = {}) => { const { reviewByteSha256 = "9".repeat(64), ...values } = overrides,
  disposition = values.disposition || "retain", reviewed = disposition === "retain";
  const plan = { relocationId: "80000000-0000-4000-8000-000000000008", bucket: "instrument-documents",
    sourcePath: `${ACTOR}/private.pdf`, disposition: "retain", destinationPath: `account-deletion/${SUBJECT}/${"8".repeat(64)}`,
    sourceSize: null, sourceMimeType: "application/pdf", sourceFingerprint: "7".repeat(64),
    contentReviewRequired: disposition === "retain" && !reviewed, contentReviewDecision: reviewed ? "retain" : null, contentReviewedAt: reviewed ? now : null,
    state: "planned", byteSha256: null, authorizationOperationId: null, ...values };
  reviewHashes.set(plan, reviewByteSha256); return plan; };
const storageReview = plan => ({ relocationId: plan.relocationId, bucket: plan.bucket, disposition: plan.disposition,
  sourceSize: plan.sourceSize, sourceMimeType: plan.sourceMimeType, sourceFingerprint: plan.sourceFingerprint,
  reviewRequired: plan.disposition === "retain", decision: plan.contentReviewDecision,
  byteSha256: plan.contentReviewDecision ? reviewHashes.get(plan) : null, reviewedAt: plan.contentReviewedAt, state: plan.state });
const preparedWith = (storageRelocations, blockers = ["storage_cleanup_required"]) => ({ ok: true,
  fulfillment: job("blocked", blockers), profileReviews, retentionReviews,
  storageReviews: storageRelocations.filter(plan => plan.disposition === "retain" || plan.contentReviewDecision !== null).map(storageReview),
  storageRelocations, authActorId: null });
const section = (code, records = []) => ({ code, label: code, recordCount: records.length, contentDigest: "d".repeat(64), records });
const profileSnapshot = (overrides = {}) => ({ ok:true, kind:"profile", policyVersion:1, contentFingerprint:profileFingerprint, truncated:false, pageIndex:0,pageCount:1,pageDigest:"1".repeat(64),deliveredPages:1,allPagesDelivered:true,
  profile:{ guitarId:profileReviews[0].guitarId, qrCode:"QRG-REVIEW", relationshipCodes:["current_owner"], sections:profileSectionCodes.map(code=>section(code,
    code==="guitar"?[{name:"1965 Stratocaster",location:"Nashville",safety_note:"Private owner note"}]:code==="media"?[{alt:"Front of the instrument",mime_type:"image/jpeg"}]:code==="documents"?[{name:"Purchase receipt",private_notes:"Original paper copy"}]:code==="siteContent"?[{content_value:{internalVerificationNote:"Inspected finish and neck stamp"}}]:[])) },...overrides });
const retentionSnapshot = (domain="billing", overrides={}) => ({ ok:true, kind:"retention", policyVersion:1, contentFingerprint:domain==="billing"?billingFingerprint:serviceFingerprint, truncated:false, pageIndex:0,pageCount:1,pageDigest:"2".repeat(64),deliveredPages:1,allPagesDelivered:true,
  retention:{domain,sections:(domain==="billing"?billingSectionCodes:serviceSectionCodes).map(code=>section(code,code===(domain==="billing"?"orders":"submissions")?[{status:"settled",note:"Factual retained record"}]:[]))},...overrides });
const job = (state, blockers = []) => ({ requestId: REQUEST, state, blockers, revision: state === "completed" ? "2" : "1", startedAt: now, reviewedAt: now,
  storageQuiesceUntil: state === "blocked" ? null : now, databaseAnonymizedAt: ["blocked", "quiescing_storage"].includes(state) ? null : now,
  authDeletedAt: state === "completed" ? now : null, completedAt: state === "completed" ? now : null });
const inspect = async response => {
  assert.match(response.headers.get("cache-control"), /no-store/); assert.equal(response.headers.get("vary"), "Authorization");
  const body = await response.json(); assert.ok(!JSON.stringify(body).includes(ACTOR), "Target Auth UUID reached HTTP JSON"); return { status: response.status, body, headers: response.headers };
};
function fixture(options = {}) {
  const calls = { rpc: [], storage: [], events: [], deleted: [], admin: 0 },
    prepared = options.prepared || { ok: true, fulfillment: job("blocked", ["storage_cleanup_required"]), ...reviews, storageRelocations: [], authActorId: null },
    objects = new Map((options.objects || []).map(row => [`${row.bucket}\0${row.path}`, { bytes: Buffer.from(row.bytes), type: row.type }]));
  const objectKey = (bucket, objectPath) => `${bucket}\0${objectPath}`;
  const storage = {
    from(bucket) {
      return {
        async download(objectPath) {
          const event = { action: "download", bucket, path: objectPath }; calls.storage.push(event); calls.events.push(event);
          if (options.storage?.download) { const handled = await options.storage.download(bucket, objectPath, { objects, calls }); if (handled !== undefined) return handled; }
          const value = objects.get(objectKey(bucket, objectPath));
          return value ? { data: new Blob([value.bytes], { type: value.type }), error: null }
            : { data: null, error: { statusCode: 404, code: "NoSuchKey", message: "missing" } };
        },
        async upload(objectPath, body, uploadOptions) {
          const event = { action: "upload", bucket, path: objectPath, body: Buffer.from(body), options: uploadOptions }; calls.storage.push(event); calls.events.push(event);
          if (options.storage?.upload) { const handled = await options.storage.upload(bucket, objectPath, body, uploadOptions, { objects, calls }); if (handled !== undefined) return handled; }
          objects.set(objectKey(bucket, objectPath), { bytes: Buffer.from(body), type: uploadOptions.contentType });
          return { data: { path: objectPath }, error: null };
        },
        async remove(paths) {
          const event = { action: "remove", bucket, paths: [...paths] }; calls.storage.push(event); calls.events.push(event);
          if (options.storage?.remove) { const handled = await options.storage.remove(bucket, paths, { objects, calls }); if (handled !== undefined) return handled; }
          for (const objectPath of paths) objects.delete(objectKey(bucket, objectPath));
          return { data: [], error: null };
        }
      };
    }
  };
  const client = {
    rpc: async (name, args) => {
      calls.rpc.push({ name, args });
      calls.events.push({ action: "rpc", name, args });
      if (name === "prepare_member_messaging_account_deletion") return options.messagingPrepare || { data: { ok: true, bucket: "member-message-media", paths: [] }, error: null };
      if (name === "complete_member_messaging_account_deletion") return options.messagingComplete || { data: { ok: true, removedConversations: 0 }, error: null };
      if (options.rpc) return options.rpc(name, args, calls);
      if (name === "prepare_account_deletion_fulfillment") return { data: prepared, error: null };
      if (name === "authorize_account_deletion_storage_relocation") {
        const plan = prepared.storageRelocations?.find(row => row.relocationId === args.p_relocation_id);
        if (!plan) throw new Error("Unexpected Storage authorization");
        return { data: { ok: true, relocation: { relocationId: plan.relocationId, disposition: plan.disposition,
          state: plan.disposition === "retain" ? "copy_authorized" : "deletion_authorized" } }, error: null };
      }
      if (name === "complete_account_deletion_fulfillment") return { data: { ok: true, fulfillment: job("completed"), ...reviews }, error: null };
      if (name === "read_account_deletion_fulfillment") return { data: { ok: true, fulfillment: prepared.fulfillment, profileReviews, retentionReviews,
        storageReviews: prepared.storageReviews || [] }, error: null };
      if (name === "inspect_account_deletion_review_page") return { data: args.p_kind === "profile" ? profileSnapshot() : retentionSnapshot(args.p_domain), error: null };
      if (name === "redact_account_deletion_profile_review") return { data: { ok:true, redaction:{ guitarId:args.p_guitar_id, policyVersion:1,
        beforeFingerprint:args.p_expected_fingerprint, afterFingerprint:"e".repeat(64), termCount:args.p_terms.length, termsDigest:"f".repeat(64) }, profileReviews }, error:null };
      if (name === "attest_account_deletion_profile_review") return { data: { ok: true, review: { approved: true, guitarId: args.p_guitar_id, policyVersion: 1, contentFingerprint: args.p_expected_fingerprint }, profileReviews }, error: null };
      if (name === "attest_account_deletion_retention_review") return { data: { ok: true, review: { approved: true, domain: args.p_domain, decisionCode: args.p_decision_code, policyVersion: 1, contentFingerprint: args.p_expected_fingerprint }, retentionReviews }, error: null };
      throw new Error("Unexpected RPC " + name);
    }, storage,
    auth: { admin: { deleteUser: async id => { calls.deleted.push(id); return options.authDelete ? options.authDelete(id) : { data: {}, error: null }; } } }
  };
  const requireAdmin = async request => { calls.admin += 1; return options.denied || { ok: true, supabase: client, admin: { user: { id: ADMIN, email: "admin@example.test" }, accessSource: options.environmentAdmin ? "env" : "role", accountStatus:options.accountStatus||"active" } }; };
  let nextId = 6;
  const service = createFulfillmentService({ requireAdmin, protectedAdminEmails: () => options.protectedAdminEmails || ["Owner@Example.Test", "owner@example.test"],
    randomId: options.randomId || (() => `60000000-0000-4000-8000-${String(nextId++).padStart(12,"0")}`), timeoutMs: options.timeoutMs || 1000 });
  const handlers = createFulfillmentHandlers({ service: () => options.disabled ? null : service, bodyTimeoutMs: options.bodyTimeoutMs || 1000 });
  const request = (method = "POST", input = { operationId: randomUUID(), action: "prepare" }, extra = {}) => new Request(extra.url || endpoint, { method,
    headers: { authorization: "Bearer synthetic", ...(input !== undefined ? { "content-type": "application/json" } : {}), ...extra.headers },
    ...(input !== undefined ? { body: typeof input === "string" ? input : JSON.stringify(input) } : {}), ...(extra.signal ? { signal: extra.signal } : {}) });
  return { calls, client, service, handlers, request, objects, objectKey };
}
let passed = 0;
async function check(name, work) { await work(); passed += 1; console.log("PASS " + name); }

await check("blocked inventory is truthful and never calls Auth deletion", async () => {
  const f = fixture(), result = await inspect(await f.handlers.item(f.request(), REQUEST));
  assert.equal(result.status, 200); assert.equal(result.body.fulfillment.state, "blocked"); assert.deepEqual(result.body.fulfillment.blockers, ["storage_cleanup_required"]);
  assert.deepEqual(f.calls.deleted, []); assert.deepEqual(f.calls.rpc.map(call => call.name), ["prepare_account_deletion_fulfillment"]);
  assert.deepEqual(f.calls.rpc[0].args.p_protected_admin_emails, ["owner@example.test"]);
});

await check("storage quiescence returns its fixed deadline and never calls Auth deletion", async () => {
  const f = fixture({ prepared: { ok: true, fulfillment: job("quiescing_storage", ["storage_quiescence_required"]), ...reviews, storageRelocations: [], authActorId: null } });
  const result = await inspect(await f.handlers.item(f.request(), REQUEST));
  assert.equal(result.status, 200); assert.equal(result.body.fulfillment.state, "quiescing_storage"); assert.equal(result.body.fulfillment.storageQuiesceUntil, now);
  assert.deepEqual(f.calls.deleted, []); assert.deepEqual(f.calls.rpc.map(call => call.name), ["prepare_account_deletion_fulfillment"]);
});

await check("planned Storage retry verifies an existing destination, finalizes references, deletes source, re-verifies, and completes", async () => {
  const bytes = Buffer.from("%PDF-1.7\nprivate evidence\n"), digest = sha256(bytes), plan = relocation({ sourceSize: bytes.length, reviewByteSha256: digest }); let completed = false, authorizationOperation;
  const f = fixture({ objects: [
    { bucket: plan.bucket, path: plan.sourcePath, bytes, type: plan.sourceMimeType },
    { bucket: plan.bucket, path: plan.destinationPath, bytes, type: plan.sourceMimeType }
  ], rpc: async (name, args) => {
    if (name === "prepare_account_deletion_fulfillment") return { data: completed ? preparedWith([], ["profile_history_privacy_review_required"]) : preparedWith([plan]), error: null };
    if (name === "authorize_account_deletion_storage_relocation") { authorizationOperation = args.p_operation_id; assert.equal(args.p_byte_sha256,digest);assert.equal(args.p_byte_size,bytes.length);assert.equal(args.p_mime_type,"application/pdf");return { data: { ok: true,
      relocation: { relocationId: plan.relocationId, disposition: "retain", state: "copy_authorized" } }, error: null }; }
    if (name === "finalize_account_deletion_storage_relocation") { assert.equal(args.p_operation_id, authorizationOperation); return { data: { ok: true, relocation: {
      relocationId: plan.relocationId, state: "references_updated", byteSha256: args.p_byte_sha256, copiedSize: args.p_copied_size } }, error: null };
    }
    if (name === "complete_account_deletion_storage_relocation") { completed = true; return { data: { ok: true, relocation: {
      relocationId: plan.relocationId, disposition: "retain", state: "completed", byteSha256: digest, copiedSize: bytes.length } }, error: null }; }
    throw new Error(`Unexpected RPC ${name}`);
  } });
  const result = await inspect(await f.handlers.item(f.request(), REQUEST));
  assert.equal(result.status, 200); assert.deepEqual(result.body.fulfillment.blockers, ["profile_history_privacy_review_required"]);
  assert.equal(f.objects.has(f.objectKey(plan.bucket, plan.sourcePath)), false); assert.deepEqual(f.objects.get(f.objectKey(plan.bucket, plan.destinationPath)).bytes, bytes);
  const upload = f.calls.storage.find(call => call.action === "upload");
  assert.deepEqual(upload.options, { contentType: "application/pdf", upsert: true, metadata: { sha256: digest, accountDeletionRelocationId: plan.relocationId } });
  const authorized = f.calls.events.findIndex(event => event.action === "rpc" && event.name === "authorize_account_deletion_storage_relocation");
  const firstDownload = f.calls.events.findIndex(event => event.action === "download");
  const finalized = f.calls.events.findIndex(event => event.action === "rpc" && event.name === "finalize_account_deletion_storage_relocation");
  const removed = f.calls.events.findIndex(event => event.action === "remove");
  const completedAt = f.calls.events.findIndex(event => event.action === "rpc" && event.name === "complete_account_deletion_storage_relocation");
  assert.ok(firstDownload >= 0 && firstDownload < authorized && authorized < finalized && finalized < removed && removed < completedAt);
  assert.equal(f.calls.storage.filter(call => call.action === "download" && call.path === plan.destinationPath).length, 2);
  assert.ok(!JSON.stringify(result.body).includes(plan.sourcePath)); assert.ok(!JSON.stringify(result.body).includes(plan.destinationPath));
});

await check("references-updated retry tolerates an absent source and completes only after destination verification", async () => {
  const bytes = Buffer.from("%PDF-1.7\ndurable copy\n"), digest = sha256(bytes),
    plan = relocation({ sourceSize: bytes.length, reviewByteSha256:digest, state: "references_updated", byteSha256: digest,
      authorizationOperationId: "81000000-0000-4000-8000-000000000001" }); let completed = false;
  const f = fixture({ objects: [{ bucket: plan.bucket, path: plan.destinationPath, bytes, type: plan.sourceMimeType }],
    storage: { remove: async () => ({ data: null, error: { statusCode: 404, code: "NoSuchKey", message: "already absent" } }) },
    rpc: async (name) => {
      if (name === "prepare_account_deletion_fulfillment") return { data: completed ? preparedWith([], ["profile_history_privacy_review_required"]) : preparedWith([plan]), error: null };
      if (name === "complete_account_deletion_storage_relocation") { completed = true; return { data: { ok: true, relocation: {
        relocationId: plan.relocationId, disposition: "retain", state: "completed", byteSha256: digest, copiedSize: bytes.length } }, error: null }; }
      throw new Error(`Unexpected RPC ${name}`);
    } });
  const result = await inspect(await f.handlers.item(f.request(), REQUEST));
  assert.equal(result.status, 200); assert.equal(f.calls.storage.some(call => call.action === "upload"), false);
  assert.equal(f.calls.rpc.some(call => call.name === "finalize_account_deletion_storage_relocation"), false);
  assert.equal(f.calls.rpc.filter(call => call.name === "complete_account_deletion_storage_relocation").length, 1);
});

await check("copy-authorized retry resumes with the durable authorization operation and never authorizes twice", async () => {
  const bytes = Buffer.from("%PDF-1.7\nresume copy\n"), digest = sha256(bytes), authorizationOperationId = "81000000-0000-4000-8000-000000000002",
    plan = relocation({ sourceSize: bytes.length, reviewByteSha256:digest, state: "copy_authorized", authorizationOperationId }); let completed = false;
  const f = fixture({ objects: [{ bucket: plan.bucket, path: plan.sourcePath, bytes, type: plan.sourceMimeType }], rpc: async (name, args) => {
    if (name === "prepare_account_deletion_fulfillment") return { data: completed ? preparedWith([], ["profile_history_privacy_review_required"]) : preparedWith([plan]), error: null };
    if (name === "finalize_account_deletion_storage_relocation") { assert.equal(args.p_operation_id, authorizationOperationId); return { data: { ok: true, relocation: {
      relocationId: plan.relocationId, state: "references_updated", byteSha256: digest, copiedSize: bytes.length } }, error: null }; }
    if (name === "complete_account_deletion_storage_relocation") { completed = true; return { data: { ok: true, relocation: {
      relocationId: plan.relocationId, disposition: "retain", state: "completed", byteSha256: digest, copiedSize: bytes.length } }, error: null }; }
    throw new Error(`Unexpected RPC ${name}`);
  } });
  const result = await inspect(await f.handlers.item(f.request(), REQUEST));
  assert.equal(result.status, 200); assert.equal(f.calls.rpc.some(call => call.name === "authorize_account_deletion_storage_relocation"), false);
  assert.equal(f.objects.has(f.objectKey(plan.bucket, plan.sourcePath)), false);
});

await check("authorized orphan deletion survives a lost completion response and replays without copying", async () => {
  const bytes = Buffer.from("orphaned private bytes"), base = relocation({ disposition: "delete", destinationPath: null,
    sourceSize: bytes.length, sourceMimeType: null }), state = { authorizationOperationId: null, completeCalls: 0, completed: false };
  const currentPlan = () => state.authorizationOperationId ? { ...base, state: "deletion_authorized", authorizationOperationId: state.authorizationOperationId } : base;
  const f = fixture({ objects: [{ bucket: base.bucket, path: base.sourcePath, bytes, type: "" }], rpc: async (name, args) => {
    if (name === "prepare_account_deletion_fulfillment") return { data: state.completed ? preparedWith([], ["profile_history_privacy_review_required"]) : preparedWith([currentPlan()]), error: null };
    if (name === "authorize_account_deletion_storage_relocation") { state.authorizationOperationId = args.p_operation_id; return { data: { ok: true,
      relocation: { relocationId: base.relocationId, disposition: "delete", state: "deletion_authorized" } }, error: null }; }
    if (name === "complete_account_deletion_storage_relocation") {
      state.completeCalls += 1;
      if (state.completeCalls === 1) return { data: null, error: { code: "PD503", message: `PRIVATE ${base.sourcePath}` } };
      assert.notEqual(args.p_operation_id, state.authorizationOperationId); state.completed = true;
      return { data: { ok: true, relocation: { relocationId: base.relocationId, disposition: "delete", state: "completed", byteSha256: null, copiedSize: null } }, error: null };
    }
    throw new Error(`Unexpected RPC ${name}`);
  } });
  const first = await inspect(await f.handlers.item(f.request(), REQUEST));
  assert.equal(first.status, 503); assert.equal(first.body.code, "storage_relocation_pending");
  assert.equal(f.objects.has(f.objectKey(base.bucket, base.sourcePath)), false); assert.equal(f.calls.storage.some(call => call.action === "upload" || call.action === "download"), false);
  const second = await inspect(await f.handlers.item(f.request(), REQUEST));
  assert.equal(second.status, 200); assert.deepEqual(second.body.fulfillment.blockers, ["profile_history_privacy_review_required"]);
  assert.equal(f.calls.rpc.filter(call => call.name === "authorize_account_deletion_storage_relocation").length, 1);
  assert.equal(f.calls.rpc.some(call => call.name === "finalize_account_deletion_storage_relocation"), false);
  assert.ok(!JSON.stringify(first.body).includes(base.sourcePath)); assert.ok(!JSON.stringify(second.body).includes(base.sourcePath));
});

await check("Storage authorization failure or malformed receipt performs no byte mutation", async () => {
  const bytes = Buffer.from("%PDF-1.7\nsource\n"), digest=sha256(bytes), plan = relocation({ sourceSize: bytes.length,reviewByteSha256:digest });
  for (const authorize of [
    { data: null, error: { code: "PD412", message: `PRIVATE ${plan.sourcePath}` } },
    { data: { ok: true, relocation: { relocationId: plan.relocationId, disposition: "delete", state: "copy_authorized" } }, error: null },
    { data: { ok: true, relocation: { relocationId: plan.relocationId, disposition: "retain", state: "copy_authorized", extra: "PRIVATE" } }, error: null }
  ]) {
    const f = fixture({ objects: [{ bucket: plan.bucket, path: plan.sourcePath, bytes, type: plan.sourceMimeType }], rpc: async name => {
      if (name === "prepare_account_deletion_fulfillment") return { data: preparedWith([plan]), error: null };
      if (name === "authorize_account_deletion_storage_relocation") return authorize;
      throw new Error(`Unexpected RPC ${name}`);
    } });
    const result = await inspect(await f.handlers.item(f.request(), REQUEST));
    assert.equal(result.status, 503); assert.ok(f.calls.storage.every(call=>call.action==="download")); assert.equal(f.objects.has(f.objectKey(plan.bucket, plan.sourcePath)), true);
  }
});

await check("destination hash mismatch leaves the source and never finalizes", async () => {
  const bytes = Buffer.from("%PDF-1.7\nsource\n"), digest=sha256(bytes), plan = relocation({ sourceSize: bytes.length,reviewByteSha256:digest });
  const f = fixture({ prepared: preparedWith([plan]), objects: [{ bucket: plan.bucket, path: plan.sourcePath, bytes, type: plan.sourceMimeType }],
    storage: { upload: async (bucket, objectPath, body, uploadOptions, context) => {
      context.objects.set(`${bucket}\0${objectPath}`, { bytes: Buffer.from("corrupt"), type: uploadOptions.contentType });
      return { data: { path: objectPath }, error: null };
    } } });
  const result = await inspect(await f.handlers.item(f.request(), REQUEST));
  assert.equal(result.status, 503); assert.equal(result.body.code, "storage_relocation_pending");
  assert.equal(f.objects.has(f.objectKey(plan.bucket, plan.sourcePath)), true);
  assert.equal(f.calls.storage.some(call => call.action === "remove"), false);
  assert.equal(f.calls.rpc.some(call => call.name === "finalize_account_deletion_storage_relocation"), false);
});

await check("post-delete destination mismatch leaves the durable journal unfinished and never calls completion", async () => {
  const bytes = Buffer.from("%PDF-1.7\nsource\n"), digest = sha256(bytes), plan = relocation({ sourceSize: bytes.length,reviewByteSha256:digest });
  const f = fixture({ objects: [{ bucket: plan.bucket, path: plan.sourcePath, bytes, type: plan.sourceMimeType }],
    storage: { remove: async (bucket, paths, context) => {
      for (const objectPath of paths) context.objects.delete(`${bucket}\0${objectPath}`);
      context.objects.set(`${bucket}\0${plan.destinationPath}`, { bytes: Buffer.from("corrupt-after-delete"), type: plan.sourceMimeType });
      return { data: [], error: null };
    } }, rpc: async (name, args) => {
      if (name === "prepare_account_deletion_fulfillment") return { data: preparedWith([plan]), error: null };
      if (name === "authorize_account_deletion_storage_relocation") return { data: { ok: true,
        relocation: { relocationId: plan.relocationId, disposition: "retain", state: "copy_authorized" } }, error: null };
      if (name === "finalize_account_deletion_storage_relocation") return { data: { ok: true, relocation: {
        relocationId: plan.relocationId, state: "references_updated", byteSha256: digest, copiedSize: args.p_copied_size } }, error: null };
      throw new Error(`Unexpected RPC ${name}`);
    } });
  const result = await inspect(await f.handlers.item(f.request(), REQUEST));
  assert.equal(result.status, 503); assert.equal(result.body.code, "storage_relocation_pending");
  assert.equal(f.objects.has(f.objectKey(plan.bucket, plan.sourcePath)), false);
  assert.equal(f.calls.rpc.some(call => call.name === "complete_account_deletion_storage_relocation"), false);
});

await check("Storage MIME disagreement fails closed before authorization, copy, or deletion", async () => {
  const bytes = Buffer.from("%PDF-1.7\nsource\n"), plan = relocation({ sourceSize: bytes.length,reviewByteSha256:sha256(bytes) });
  const f = fixture({ prepared: preparedWith([plan]), objects: [{ bucket: plan.bucket, path: plan.sourcePath, bytes, type: "image/png" }] });
  const result = await inspect(await f.handlers.item(f.request(), REQUEST));
  assert.equal(result.status, 503); assert.equal(result.body.code, "storage_relocation_pending");
  assert.equal(f.calls.rpc.filter(call => call.name === "authorize_account_deletion_storage_relocation").length, 0);
  assert.equal(f.calls.storage.some(call => call.action === "upload" || call.action === "remove"), false);
  assert.equal(f.objects.has(f.objectKey(plan.bucket, plan.sourcePath)), true);
});

await check("malformed Storage plan states and disposition fields fail before authorization or byte access", async () => {
  const authorizationOperationId = "81000000-0000-4000-8000-000000000003", digest = "9".repeat(64);
  const malformed = [
    relocation({ disposition: "delete", destinationPath: `account-deletion/${SUBJECT}/${"1".repeat(64)}` }),
    relocation({ destinationPath: null }),
    relocation({ state: "planned", authorizationOperationId }),
    relocation({ state: "copy_authorized", authorizationOperationId: null }),
    relocation({ state: "references_updated", authorizationOperationId, byteSha256: null }),
    relocation({ disposition: "delete", destinationPath: null, state: "deletion_authorized", authorizationOperationId, byteSha256: digest })
  ];
  for (const plan of malformed) {
    const f = fixture({ prepared: preparedWith([plan]) }), result = await inspect(await f.handlers.item(f.request(), REQUEST));
    assert.equal(result.status, 503); assert.equal(f.calls.rpc.length, 1); assert.equal(f.calls.storage.length, 0);
  }
});

await check("Storage upload failure leaves the source and never finalizes", async () => {
  const bytes = Buffer.from("%PDF-1.7\nsource\n"), plan = relocation({ sourceSize: bytes.length,reviewByteSha256:sha256(bytes) });
  const f = fixture({ prepared: preparedWith([plan]), objects: [{ bucket: plan.bucket, path: plan.sourcePath, bytes, type: plan.sourceMimeType }],
    storage: { upload: async () => ({ data: null, error: { statusCode: 503, message: `PRIVATE ${plan.sourcePath}` } }) } });
  const result = await inspect(await f.handlers.item(f.request(), REQUEST));
  assert.equal(result.status, 503); assert.equal(result.body.code, "storage_relocation_pending"); assert.ok(!JSON.stringify(result.body).includes(plan.sourcePath));
  assert.equal(f.objects.has(f.objectKey(plan.bucket, plan.sourcePath)), true);
  assert.equal(f.calls.storage.some(call => call.action === "remove"), false);
  assert.equal(f.calls.rpc.some(call => call.name === "finalize_account_deletion_storage_relocation"), false);
});

await check("Storage finalization failure never deletes the source", async () => {
  const bytes = Buffer.from("%PDF-1.7\nsource\n"), plan = relocation({ sourceSize: bytes.length,reviewByteSha256:sha256(bytes) });
  const f = fixture({ objects: [{ bucket: plan.bucket, path: plan.sourcePath, bytes, type: plan.sourceMimeType }], rpc: async (name) => {
    if (name === "prepare_account_deletion_fulfillment") return { data: preparedWith([plan]), error: null };
    if (name === "authorize_account_deletion_storage_relocation") return { data: { ok: true,
      relocation: { relocationId: plan.relocationId, disposition: "retain", state: "copy_authorized" } }, error: null };
    if (name === "finalize_account_deletion_storage_relocation") return { data: null, error: { code: "PD412", message: `PRIVATE ${plan.sourcePath}` } };
    throw new Error(`Unexpected RPC ${name}`);
  } });
  const result = await inspect(await f.handlers.item(f.request(), REQUEST));
  assert.equal(result.status, 503); assert.equal(result.body.code, "storage_relocation_pending"); assert.ok(!JSON.stringify(result.body).includes(plan.sourcePath));
  assert.equal(f.objects.has(f.objectKey(plan.bucket, plan.sourcePath)), true);
  assert.equal(f.calls.storage.some(call => call.action === "remove"), false);
});

await check("one fulfillment request relocates at most eight files and returns a safe current blocker for the remainder", async () => {
  const rows = Array.from({ length: 9 }, (_, index) => {
    const bytes = Buffer.from(`%PDF-1.7\nfile ${index}\n`);
    return { bytes, digest: sha256(bytes), plan: relocation({
      relocationId: `80000000-0000-4000-8000-${String(index + 10).padStart(12,"0")}`,
      sourcePath: `${ACTOR}/private-${index}.pdf`, destinationPath: `account-deletion/${SUBJECT}/${index.toString(16).padStart(64,"0")}`,
      sourceSize: bytes.length,reviewByteSha256:sha256(bytes)
    }) };
  });
  const completed = new Set(), authorizationOperations = new Map(), byId = new Map(rows.map(row => [row.plan.relocationId, row]));
  const f = fixture({ objects: rows.map(row => ({ bucket: row.plan.bucket, path: row.plan.sourcePath, bytes: row.bytes, type: row.plan.sourceMimeType })),
    rpc: async (name, args) => {
      if (name === "prepare_account_deletion_fulfillment") return { data: preparedWith(rows.filter(row => !completed.has(row.plan.relocationId)).map(row => row.plan)), error: null };
      const row = byId.get(args.p_relocation_id); assert.ok(row);
      if (name === "authorize_account_deletion_storage_relocation") { authorizationOperations.set(row.plan.relocationId, args.p_operation_id); return { data: { ok: true,
        relocation: { relocationId: row.plan.relocationId, disposition: "retain", state: "copy_authorized" } }, error: null }; }
      if (name === "finalize_account_deletion_storage_relocation") { assert.equal(args.p_operation_id, authorizationOperations.get(row.plan.relocationId)); return { data: { ok: true, relocation: {
        relocationId: row.plan.relocationId, state: "references_updated", byteSha256: row.digest, copiedSize: row.bytes.length } }, error: null };
      }
      if (name === "complete_account_deletion_storage_relocation") { completed.add(row.plan.relocationId); return { data: { ok: true, relocation: {
        relocationId: row.plan.relocationId, disposition: "retain", state: "completed", byteSha256: row.digest, copiedSize: row.bytes.length } }, error: null }; }
      throw new Error(`Unexpected RPC ${name}`);
    } });
  const result = await inspect(await f.handlers.item(f.request(), REQUEST));
  assert.equal(result.status, 200); assert.deepEqual(result.body.fulfillment.blockers, ["storage_cleanup_required"]); assert.equal(completed.size, 8);
  assert.equal(f.calls.rpc.filter(call => call.name === "complete_account_deletion_storage_relocation").length, 8);
  assert.equal(f.objects.has(f.objectKey(rows[8].plan.bucket, rows[8].plan.sourcePath)), true);
  assert.ok(rows.slice(0, 8).every(row => !f.objects.has(f.objectKey(row.plan.bucket, row.plan.sourcePath))));
  assert.ok(!JSON.stringify(result.body).includes("storageRelocations")); assert.ok(!JSON.stringify(result.body).includes(rows[8].plan.sourcePath));
});

await check("ready database state deletes the exact server-side actor and finalizes without exposing it", async () => {
  const f = fixture({ prepared: { ok: true, fulfillment: job("ready_for_auth_deletion"), ...reviews, storageRelocations: [], authActorId: ACTOR } });
  const result = await inspect(await f.handlers.item(f.request(), REQUEST));
  assert.equal(result.status, 200); assert.equal(result.body.fulfillment.state, "completed"); assert.deepEqual(f.calls.deleted, [ACTOR]);
  assert.deepEqual(f.calls.rpc.map(call => call.name), ["prepare_account_deletion_fulfillment", "prepare_member_messaging_account_deletion", "complete_member_messaging_account_deletion", "complete_account_deletion_fulfillment"]);
  assert.equal(f.calls.rpc[3].args.p_operation_id, "60000000-0000-4000-8000-000000000006");
});


await check("private message media cleanup fails closed before Auth deletion", async () => {
  const path = "60000000-0000-4000-8000-000000000006/" + ACTOR + "/70000000-0000-4000-8000-000000000007/80000000-0000-4000-8000-000000000008.jpg";
  const f = fixture({
    prepared: { ok: true, fulfillment: job("ready_for_auth_deletion"), ...reviews, storageRelocations: [], authActorId: ACTOR },
    messagingPrepare: { data: { ok: true, bucket: "member-message-media", paths: [path] }, error: null },
    storage: { remove: async () => ({ data: null, error: { message: "PRIVATE STORAGE" } }) }
  });
  const result = await inspect(await f.handlers.item(f.request(), REQUEST));
  assert.equal(result.status, 503); assert.equal(result.body.retryable, true);
  assert.deepEqual(f.calls.deleted, []);
  assert.deepEqual(f.calls.rpc.map(call => call.name), ["prepare_account_deletion_fulfillment", "prepare_member_messaging_account_deletion"]);
});

await check("private message bytes are physically removed and cleanup retries safely", async () => {
  const conversation = "60000000-0000-4000-8000-000000000006";
  const peer = "20000000-0000-4000-8000-000000000002";
  const actorPath = conversation + "/" + ACTOR + "/70000000-0000-4000-8000-000000000007/81000000-0000-4000-8000-000000000008.jpg";
  const peerPath = conversation + "/" + peer + "/70000000-0000-4000-8000-000000000007/82000000-0000-4000-8000-000000000008.png";
  const unrelatedPath = "90000000-0000-4000-8000-000000000009/" + peer + "/70000000-0000-4000-8000-000000000007/83000000-0000-4000-8000-000000000008.jpg";
  let attempts = 0;
  const f = fixture({
    prepared: { ok: true, fulfillment: job("ready_for_auth_deletion"), ...reviews, storageRelocations: [], authActorId: ACTOR },
    objects: [
      { bucket: "member-message-media", path: actorPath, bytes: "actor-private-image-bytes", type: "image/jpeg" },
      { bucket: "member-message-media", path: peerPath, bytes: "peer-private-image-bytes", type: "image/png" },
      { bucket: "member-message-media", path: unrelatedPath, bytes: "unrelated-image-bytes", type: "image/jpeg" }
    ],
    messagingPrepare: { data: { ok: true, bucket: "member-message-media", paths: [actorPath, peerPath] }, error: null },
    storage: { remove: async (bucket, paths, { objects }) => {
      attempts += 1;
      if (attempts === 1) return { data: null, error: { message: "TRANSIENT PRIVATE STORAGE FAILURE" } };
      for (const objectPath of paths) objects.delete(bucket + String.fromCharCode(0) + objectPath);
      return { data: paths.map(name => ({ name })), error: null };
    } }
  });
  const first = await inspect(await f.handlers.item(f.request(), REQUEST));
  assert.equal(first.status, 503); assert.equal(first.body.retryable, true); assert.deepEqual(f.calls.deleted, []);
  const retried = await inspect(await f.handlers.item(f.request(), REQUEST));
  assert.equal(retried.status, 200); assert.equal(retried.body.fulfillment.state, "completed");
  assert.equal(f.objects.has(f.objectKey("member-message-media", actorPath)), false);
  assert.equal(f.objects.has(f.objectKey("member-message-media", peerPath)), false);
  assert.equal(f.objects.get(f.objectKey("member-message-media", unrelatedPath))?.bytes.toString(), "unrelated-image-bytes");
  assert.deepEqual(f.calls.deleted, [ACTOR]);
});
await check("provider failure is never completion proof and remains safely retryable", async () => {
  const f = fixture({ prepared: { ok: true, fulfillment: job("ready_for_auth_deletion"), ...reviews, storageRelocations: [], authActorId: ACTOR }, authDelete: async () => ({ error: { status: 503, message: "PRIVATE PROVIDER" } }),
    rpc: async name => name === "prepare_account_deletion_fulfillment" ? { data: { ok: true, fulfillment: job("ready_for_auth_deletion"), ...reviews, storageRelocations: [], authActorId: ACTOR }, error: null }
      : { data: null, error: { code: "PD428", message: "PRIVATE DATABASE" } } });
  const result = await inspect(await f.handlers.item(f.request(), REQUEST));
  assert.equal(result.status, 503); assert.equal(result.body.code, "auth_deletion_pending"); assert.equal(result.body.retryable, true); assert.deepEqual(f.calls.deleted, [ACTOR]);
});

await check("lost Auth response can still finalize only from the database's independent absence proof", async () => {
  const f = fixture({ prepared: { ok: true, fulfillment: job("ready_for_auth_deletion"), ...reviews, storageRelocations: [], authActorId: ACTOR }, authDelete: async () => { throw new Error("PRIVATE LOST RESPONSE"); } });
  const result = await inspect(await f.handlers.item(f.request(), REQUEST)); assert.equal(result.status, 200); assert.equal(result.body.fulfillment.state, "completed");
});

await check("completed replay with no actor performs no Auth call and stays completed", async () => {
  const f = fixture({ prepared: { ok: true, fulfillment: job("completed"), ...reviews, storageRelocations: [], authActorId: null } });
  const result = await inspect(await f.handlers.item(f.request(), REQUEST)); assert.equal(result.status, 200); assert.equal(result.body.fulfillment.state, "completed");
  assert.deepEqual(f.calls.deleted, []); assert.deepEqual(f.calls.rpc.map(call => call.name), ["prepare_account_deletion_fulfillment"]);
});

await check("malformed SQL DTO or target actor stops before provider deletion", async () => {
  for (const prepared of [
    { ok: true, fulfillment: { ...job("ready_for_auth_deletion"), secret: "PRIVATE" }, ...reviews, storageRelocations: [], authActorId: ACTOR },
    { ok: true, fulfillment: job("ready_for_auth_deletion"), ...reviews, storageRelocations: [], authActorId: "not-a-uuid" },
    { ok: true, fulfillment: { ...job("ready_for_auth_deletion"), requestId: randomUUID() }, ...reviews, storageRelocations: [], authActorId: ACTOR },
    { ok: true, fulfillment: job("blocked", ["profile_history_privacy_review_required"]), profileReviews: [{ ...profileReviews[0], contentFingerprint: "bad" }], retentionReviews, storageRelocations: [], authActorId: null }
  ]) {
    const f = fixture({ prepared }), result = await inspect(await f.handlers.item(f.request(), REQUEST)); assert.equal(result.status, 503); assert.deepEqual(f.calls.deleted, []);
  }
});

await check("profile and retention attestations bind exact reviewed fingerprints then return a fresh safe snapshot", async () => {
  const f = fixture({ prepared: { ok: true, fulfillment: job("blocked", ["profile_history_privacy_review_required", "billing_retention_review_required"]), ...reviews, storageRelocations: [], authActorId: null } });
  const profile = await inspect(await f.handlers.item(f.request("POST", { operationId: randomUUID(), action: "attest_profile", guitarId: profileReviews[0].guitarId, expectedFingerprint: profileFingerprint }), REQUEST));
  const billing = await inspect(await f.handlers.item(f.request("POST", { operationId: randomUUID(), action: "attest_retention", domain: "billing", expectedFingerprint: billingFingerprint, decisionCode: "lawful_financial_retention_reviewed" }), REQUEST));
  assert.equal(profile.status, 200); assert.equal(billing.status, 200);
  assert.deepEqual(f.calls.rpc.map(call=>call.name), ["attest_account_deletion_profile_review","read_account_deletion_fulfillment","attest_account_deletion_retention_review","read_account_deletion_fulfillment"]);
  assert.equal(f.calls.rpc[0].args.p_confirm_personal_information_removed, true); assert.equal(f.calls.rpc[2].args.p_confirm_reviewed, true);
  assert.equal(f.calls.rpc[2].args.p_decision_code, "lawful_financial_retention_reviewed");
  for (const result of [profile,billing]) { assert.deepEqual(Object.keys(result.body).sort(), ["fulfillment","ok","profileReviews","retentionReviews","storageReviews"]); assert.equal(Object.hasOwn(result.body,"authActorId"),false); }
});

await check("custody release binds the inspected fingerprint and returns only a fresh safe fulfillment snapshot", async () => {
  const completed = { ok:true, fulfillment:job("completed"), ...reviews, storageRelocations:[], authActorId:null }, operationId=randomUUID();
  const f=fixture({prepared:completed,rpc:async(name,args)=>{
    if(name==="release_account_deletion_profile_custody")return{data:{ok:true,release:{requestId:REQUEST,claimId:CLAIM,guitarId:profileReviews[0].guitarId,policyVersion:1,contentFingerprint:profileFingerprint,evidenceCount:2,visibility:"private",releasedAt:now}},error:null};
    if(name==="read_account_deletion_fulfillment")return{data:{ok:true,fulfillment:job("completed"),...reviews},error:null};
    throw new Error(`Unexpected RPC ${name}`);
  }});
  const result=await inspect(await f.handlers.item(f.request("POST",{operationId,action:"release_custody",claimId:CLAIM,expectedFingerprint:profileFingerprint}),REQUEST));
  assert.equal(result.status,200);assert.deepEqual(Object.keys(result.body).sort(),["fulfillment","ok","profileReviews","retentionReviews","storageReviews"]);
  assert.deepEqual(f.calls.rpc.map(call=>call.name),["release_account_deletion_profile_custody","read_account_deletion_fulfillment"]);
  assert.deepEqual(f.calls.rpc[0].args,{p_admin_id:ADMIN,p_environment_admin:false,p_request_id:REQUEST,p_operation_id:operationId,p_claim_id:CLAIM,p_expected_fingerprint:profileFingerprint,p_confirm_reviewed:true});
  assert.doesNotMatch(JSON.stringify(result.body),new RegExp(CLAIM));
});

await check("custody release rejects malformed receipts and never reports a handoff", async () => {
  for(const release of [
    {requestId:REQUEST,claimId:CLAIM,guitarId:profileReviews[0].guitarId,policyVersion:1,contentFingerprint:profileFingerprint,evidenceCount:0,visibility:"private",releasedAt:now},
    {requestId:REQUEST,claimId:CLAIM,guitarId:profileReviews[0].guitarId,policyVersion:1,contentFingerprint:profileFingerprint,evidenceCount:1,visibility:"public",releasedAt:now},
    {requestId:REQUEST,claimId:CLAIM,guitarId:profileReviews[0].guitarId,policyVersion:1,contentFingerprint:profileFingerprint,evidenceCount:1,visibility:"private",releasedAt:now,actorId:ACTOR}
  ]){
    const f=fixture({rpc:async(name)=>name==="release_account_deletion_profile_custody"?{data:{ok:true,release},error:null}:{data:null,error:{code:"XX"}}});
    const result=await inspect(await f.handlers.item(f.request("POST",{operationId:randomUUID(),action:"release_custody",claimId:CLAIM,expectedFingerprint:profileFingerprint}),REQUEST));
    assert.equal(result.status,503);assert.equal(f.calls.rpc.some(call=>call.name==="read_account_deletion_fulfillment"),false);
  }
});

await check("private Profile and retention inspections expose complete fingerprint-bound ordinary and nested review content", async () => {
  const f=fixture();
  const profile=await inspect(await f.handlers.item(f.request("POST",{operationId:randomUUID(),action:"inspect_profile",guitarId:profileReviews[0].guitarId,expectedFingerprint:profileFingerprint,pageIndex:0}),REQUEST));
  const billing=await inspect(await f.handlers.item(f.request("POST",{operationId:randomUUID(),action:"inspect_retention",domain:"billing",expectedFingerprint:billingFingerprint,pageIndex:0}),REQUEST));
  assert.equal(profile.status,200);assert.equal(billing.status,200);assert.equal(profile.body.reviewSnapshot.kind,"profile");assert.equal(billing.body.reviewSnapshot.kind,"retention");
  const profileSections=new Map(profile.body.reviewSnapshot.profile.sections.map(item=>[item.code,item]));
  assert.equal(profileSections.get("guitar").records[0].name,"1965 Stratocaster");assert.equal(profileSections.get("media").records[0].alt,"Front of the instrument");
  assert.equal(profileSections.get("documents").records[0].private_notes,"Original paper copy");assert.equal(profileSections.get("siteContent").records[0].content_value.internalVerificationNote,"Inspected finish and neck stamp");
  assert.equal(profile.body.reviewSnapshot.profile.sections.length,profileSectionCodes.length);assert.equal(billing.body.reviewSnapshot.retention.sections.length,billingSectionCodes.length);
  assert.deepEqual(f.calls.rpc.map(call=>call.name),["inspect_account_deletion_review_page","read_account_deletion_fulfillment","inspect_account_deletion_review_page","read_account_deletion_fulfillment"]);
  assert.equal(f.calls.rpc[0].args.p_admin_id,ADMIN);assert.equal(f.calls.rpc[0].args.p_operation_id,profile.body.reviewSnapshot?f.calls.rpc[0].args.p_operation_id:null);assert.equal(f.calls.rpc[0].args.p_page_index,0);assert.equal(f.calls.rpc[0].args.p_kind,"profile");
});

await check("Profile redaction sends exact normalized terms and requires a fresh fulfillment read", async()=>{
  const f=fixture(),operation=randomUUID();
  const result=await inspect(await f.handlers.item(f.request("POST",{operationId:operation,action:"redact_profile",guitarId:profileReviews[0].guitarId,expectedFingerprint:profileFingerprint,terms:[" Home Address ","Jane Example","Jane Example"]}),REQUEST));
  assert.equal(result.status,200);assert.equal(Object.hasOwn(result.body,"reviewSnapshot"),false);
  assert.deepEqual(f.calls.rpc.map(call=>call.name),["redact_account_deletion_profile_review","read_account_deletion_fulfillment"]);
  assert.deepEqual(f.calls.rpc[0].args.p_terms,["Home Address","Jane Example"]);assert.equal(f.calls.rpc[0].args.p_operation_id,operation);
});

await check("truncated or unsafe review snapshots cannot become an attestable browser view",async()=>{
  for(const snapshot of [profileSnapshot({truncated:true,profile:{...profileSnapshot().profile,sections:profileSnapshot().profile.sections.map(item=>({...item,records:[]}))}}),
    profileSnapshot({profile:{...profileSnapshot().profile,sections:profileSnapshot().profile.sections.map(item=>item.code==="documents"?{...item,records:[{name:"Unsafe",storage_path:"private/path"}],recordCount:1}:item)}}),
    profileSnapshot({profile:{...profileSnapshot().profile,sections:profileSnapshot().profile.sections.map(item=>item.code==="guitar"?{...item,records:[{name:"Unsafe",ownerScope:"20000000-0000-4000-8000-000000000002"}],recordCount:1}:item)}})]){
    const f=fixture({rpc:async(name)=>name==="inspect_account_deletion_review_page"?{data:snapshot,error:null}:name==="read_account_deletion_fulfillment"?{data:{ok:true,fulfillment:job("blocked",["profile_history_privacy_review_required"]),...reviews},error:null}:{data:null,error:{code:"XX"}}});
    const result=await inspect(await f.handlers.item(f.request("POST",{operationId:randomUUID(),action:"inspect_profile",guitarId:profileReviews[0].guitarId,expectedFingerprint:profileFingerprint,pageIndex:0}),REQUEST));
    if(snapshot.truncated){assert.equal(result.status,200);assert.equal(result.body.reviewSnapshot.truncated,true);assert.ok(result.body.reviewSnapshot.profile.sections.every(item=>item.records.length===0));}
    else{assert.equal(result.status,503);assert.equal(Object.hasOwn(result.body,"reviewSnapshot"),false);}
  }
});

await check("missing privilege fails closed as unavailable rather than inventing administrator denial", async () => {
  const f = fixture({ rpc: async () => ({ data: null, error: { code: "42501", message: "PRIVATE PRIVILEGE" } }) });
  const result = await inspect(await f.handlers.item(f.request(), REQUEST)); assert.equal(result.status, 503); assert.equal(result.body.code, "fulfillment_unavailable");
});

await check("HTTP validates exact action, path, method, origin, encoding and query before mutation", async () => {
  const f = fixture();
  const cases = [
    f.handlers.item(f.request("DELETE"), REQUEST),
    f.handlers.item(f.request("POST", { operationId: randomUUID(), action: "complete" }), REQUEST),
    f.handlers.item(f.request("POST", { operationId: randomUUID(), action: "prepare", actorId: ACTOR }), REQUEST),
    f.handlers.item(f.request("POST", { operationId: "bad", action: "prepare" }), REQUEST),
    f.handlers.item(f.request("POST", { operationId: randomUUID(), action: "attest_profile", guitarId: profileReviews[0].guitarId, expectedFingerprint: "A".repeat(64) }), REQUEST),
    f.handlers.item(f.request("POST", { operationId: randomUUID(), action: "attest_retention", domain: "billing", expectedFingerprint: billingFingerprint, decisionCode: "service_history_privacy_reviewed" }), REQUEST),
    f.handlers.item(f.request("POST", { operationId: randomUUID(), action: "inspect_retention", domain: "other", expectedFingerprint: billingFingerprint }), REQUEST),
    f.handlers.item(f.request("POST", { operationId: randomUUID(), action: "redact_profile", guitarId: profileReviews[0].guitarId, expectedFingerprint: profileFingerprint, terms: ["x"] }), REQUEST),
    f.handlers.item(f.request("POST", { operationId: randomUUID(), action: "release_custody", claimId: "bad", expectedFingerprint: profileFingerprint }), REQUEST),
    f.handlers.item(f.request("POST", { operationId: randomUUID(), action: "release_custody", claimId: CLAIM, expectedFingerprint: profileFingerprint, evidenceCount: 1 }), REQUEST),
    f.handlers.item(f.request("POST", undefined, { headers: { "content-type": "text/plain" } }), REQUEST),
    f.handlers.item(f.request("POST", undefined, { headers: { "content-encoding": "gzip", "content-type": "application/json" } }), REQUEST),
    f.handlers.item(f.request("POST", undefined, { headers: { origin: "https://evil.invalid", "content-type": "application/json" } }), REQUEST),
    f.handlers.item(f.request("POST", undefined, { url: endpoint + "?actorId=" + ACTOR, headers: { "content-type": "application/json" } }), REQUEST),
    f.handlers.item(new Request(endpoint), "bad")
  ];
  const results = await Promise.all(cases); assert.deepEqual(results.map(response => response.status), [405, 400, 400, 400, 400, 400, 400, 400, 400, 400, 415, 415, 403, 400, 400]);
  assert.equal(f.calls.rpc.length, 0); assert.equal(f.calls.admin, 0);
});

await check("finite body reader accepts maximum multibyte redaction terms and rejects controls or one byte over its cap",async()=>{
  const f=fixture(),terms=Array.from({length:32},(_,index)=>"🙂".repeat(196)+String(index).padStart(4,"0"));
  const body={operationId:randomUUID(),action:"redact_profile",guitarId:profileReviews[0].guitarId,expectedFingerprint:profileFingerprint,terms},bytes=Buffer.byteLength(JSON.stringify(body));
  assert.ok(bytes>8192);assert.ok(bytes<=65536);const accepted=await inspect(await f.handlers.item(f.request("POST",body),REQUEST));assert.equal(accepted.status,200);
  const controlled=await f.handlers.item(f.request("POST",{...body,operationId:randomUUID(),terms:["bad\tterm"]}),REQUEST);assert.equal(controlled.status,400);
  const over=new Request(endpoint,{method:"POST",headers:{"content-type":"application/json"},body:" ".repeat(65537)});assert.equal((await f.handlers.item(over,REQUEST)).status,413);
});

await check("duplicate fields, invalid UTF-8 and actual bytes beyond a lying Content-Length are rejected", async () => {
  const f = fixture(), operation = randomUUID();
  const duplicate = f.request("POST", `{"operationId":"${operation}","operationId":"${randomUUID()}","action":"prepare"}`);
  assert.equal((await f.handlers.item(duplicate, REQUEST)).status, 400);
  const utf8 = new Request(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: new Uint8Array([0xff]) });
  assert.equal((await f.handlers.item(utf8, REQUEST)).status, 400);
  const lying = new Request(endpoint, { method: "POST", headers: { "content-type": "application/json", "content-length": "1" }, body: "x".repeat(65537) });
  assert.equal((await f.handlers.item(lying, REQUEST)).status, 413); assert.equal(f.calls.rpc.length, 0);
});

await check("stalled and broken chunked bodies terminate and never dispatch fulfillment", async () => {
  const f = fixture({ bodyTimeoutMs: 15 }); let cancelled = false;
  const stalled = new Request(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: new ReadableStream({ cancel() { cancelled = true; } }), duplex: "half" });
  assert.equal((await f.handlers.item(stalled, REQUEST)).status, 408); await new Promise(resolve => setImmediate(resolve)); assert.equal(cancelled, true);
  const broken = new Request(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: new ReadableStream({ start(controller) { controller.error(new Error("PRIVATE")); } }), duplex: "half" });
  assert.equal((await f.handlers.item(broken, REQUEST)).status, 400); assert.equal(f.calls.rpc.length, 0);
});

await check("admin and runtime outages have bounded sanitized responses", async () => {
  for (const options of [{ disabled: true }, { denied: { ok: false, response: Response.json({ secret: "PRIVATE" }, { status: 403 }) } }]) {
    const f = fixture(options), result = await inspect(await f.handlers.item(new Request(endpoint), REQUEST)); assert.equal(result.status, options.disabled ? 503 : 403);
  }
  let resolve; const pending = new Promise(done => { resolve = done; }); const f = fixture({ timeoutMs: 15, denied: undefined });
  f.service = createFulfillmentService({ requireAdmin: () => pending, timeoutMs: 15 });
  const response = await f.service.read(new Request(endpoint), REQUEST).then(() => null, error => error); assert.equal(response.status, 503); resolve?.({ ok: false, response: new Response(null, { status: 403 }) });
});

console.log(`Account deletion fulfillment HTTP/service tests passed (${passed}).`);
