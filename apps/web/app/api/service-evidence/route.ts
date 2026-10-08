import { NextResponse } from "next/server";
import { assertAccountCanWrite, getAdminContext } from "../../../lib/admin-auth";
import { createServerSupabaseClient, getAuthenticatedUser, getSupabaseEnvStatus } from "../../../lib/supabase-server";
import {
  cleanServiceText, serviceMigrationMessage, serviceMigrationMissing,
  type ServiceSubmissionRow
} from "../../../lib/service-workflow";
import {
  SERVICE_EVIDENCE_UPLOAD_CONTROL_BYTES, SERVICE_EVIDENCE_UPLOAD_MAX_BYTES, SERVICE_EVIDENCE_UPLOAD_BUCKET,
  cleanServiceEvidenceUploadId, cleanServiceEvidenceRevision, normalizeServiceEvidenceUpload, validServiceEvidenceSignedUploadUrl,
  parseServiceEvidenceUploadReceipt, parseServiceEvidenceUploadDiscovery,
  type ServiceEvidenceUpload, type ServiceEvidenceUploadReceipt
} from "../../../lib/service-evidence-upload";

export const dynamic = "force-dynamic";
export const revalidate = 0;
function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } });
}
type EvidenceRow = { id: string; evidence_type: string; file_name: string; mime_type: string; file_size_bytes: number; created_at: string; storage_path: string };
function evidenceResponse(row: EvidenceRow) {
  return { id: row.id, type: row.evidence_type, fileName: row.file_name, mimeType: row.mime_type, fileSizeBytes: row.file_size_bytes, createdAt: row.created_at };
}
function unconfirmed() { return json({ ok: false, commitStatus: "unknown", message: "Could not confirm the evidence change. Reload the submission before trying again." }, 503); }
function rpcFailure(error: { code?: string; message?: string }) {
  if (!error.code) return unconfirmed();
  const status = error.code === "PT409" || error.code === "40001" ? 409 : error.code === "42501" ? 403 : error.code === "P0002" ? 404 : error.code === "22023" ? 400 : 503;
  return json({ ok: false, message: status === 409 ? "The submission changed. Reload before editing evidence." : status === 403 ? "You cannot change this evidence." : status === 404 ? "Evidence or submission was not found." : "Could not save the evidence change. Please try again." }, status);
}
async function authorize(request: Request, submission: ServiceSubmissionRow, action: "read" | "write") {
  const auth = await getAuthenticatedUser(request);
  if (!auth.user) return { user: null, admin: false, allowed: false, status: 401, message: auth.error || "Sign in required." };
  const admin = await getAdminContext(request);
  const participant = auth.user.id === submission.provider_user_id || auth.user.id === submission.owner_user_id;
  const writeAllowed = auth.user.id === submission.provider_user_id && (submission.status === "draft" || submission.status === "changes_requested");
  const allowed = admin.ok || (action === "read" ? participant : writeAllowed);
  if (allowed && action === "write") {
    const client = createServerSupabaseClient();
    if (!client) return { user: auth.user, admin: false, allowed: false, status: 503, message: "Evidence is temporarily unavailable." };
    const access = await assertAccountCanWrite(client, auth.user);
    if (!access.ok) return { user: auth.user, admin: admin.ok, allowed: false, status: access.status, message: access.message };
  }
  return { user: auth.user, admin: admin.ok, allowed, status: allowed ? 200 : 403, message: allowed ? "" : "You cannot access this private evidence." };
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  if (requestUrl.searchParams.has("uploadState") || requestUrl.searchParams.has("uploadId")) return discoverUploads(request, requestUrl);
  const auth = await getAuthenticatedUser(request);
  if (!auth.user) return json({ ok: false, message: auth.error || "Sign in required." }, 401);
  const supabase = createServerSupabaseClient();
  if (!supabase) return json({ ok: false, message: "Evidence is temporarily unavailable." }, 503);
  const url = new URL(request.url);
  const submissionId = cleanServiceText(url.searchParams.get("submissionId"), 80);
  const evidenceId = cleanServiceText(url.searchParams.get("evidenceId"), 80);
  const submission = await supabase.from("service_submissions").select("*").eq("id", submissionId).maybeSingle<ServiceSubmissionRow>();
  if (submission.error) return json({ ok: false, message: serviceMigrationMissing(submission.error.message) ? serviceMigrationMessage() : "Could not load evidence." }, 503);
  if (!submission.data) return json({ ok: false, message: "Service submission was not found." }, 404);
  const access = await authorize(request, submission.data, "read");
  if (!access.allowed) return json({ ok: false, message: access.message }, access.status);
  let query = supabase.from("service_submission_evidence").select("id,submission_id,evidence_type,file_name,mime_type,file_size_bytes,storage_path,created_at").eq("submission_id", submissionId).order("created_at");
  if (evidenceId) query = query.eq("id", evidenceId);
  const evidence = await query;
  if (evidence.error) return json({ ok: false, message: "Could not load evidence." }, 503);
  try {
    const rows = await Promise.all(((evidence.data || []) as EvidenceRow[]).map(async (row) => {
      const signed = await supabase.storage.from("service-evidence").createSignedUrl(row.storage_path, 300);
      if (signed.error || !signed.data?.signedUrl) throw new Error("Evidence signing unavailable");
      return { ...evidenceResponse(row), previewUrl: signed.data.signedUrl };
    }));
    return json({ ok: true, evidence: rows });
  } catch { return json({ ok: false, message: "Evidence previews are temporarily unavailable. Please try again." }, 503); }
}

async function bounded<T>(work: PromiseLike<T>, milliseconds = 10_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([Promise.resolve(work), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Evidence operation timed out")), milliseconds); })]); }
  finally { if (timer) clearTimeout(timer); }
}
async function uploadBody(request: Request): Promise<{ body?: unknown; status?: number }> {
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > SERVICE_EVIDENCE_UPLOAD_CONTROL_BYTES)) return { status: 413 };
  const reader = request.body?.getReader();
  if (!reader) return { status: 400 };
  let bytes = 0, text = "";
  const decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    return await bounded((async () => {
      for (;;) {
        const next = await reader.read(); if (next.done) break;
        bytes += next.value.byteLength;
        if (bytes > SERVICE_EVIDENCE_UPLOAD_CONTROL_BYTES) { void reader.cancel().catch(() => undefined); return { status: 413 }; }
        text += decoder.decode(next.value, { stream: true });
      }
      return { body: JSON.parse(text + decoder.decode()) as unknown };
    })(), 5_000);
  } catch { void reader.cancel().catch(() => undefined); return { status: 400 }; }
  finally { reader.releaseLock(); }
}
type UploadBinding = { expectedActorId: string; submissionId: string; uploadId?: string; expectedRevision?: string | null; action?: string };
function uploadFailure(code: string, message: string, status: number, input?: UploadBinding, retryable = false, uncertain = false) {
  return json({ ok: false, protocolVersion: 2, code, message, retryable, uncertain,
    ...(uncertain && input?.action === "complete" ? { commitStatus: "unknown" } : {}),
    ...(input ? { uploadId: input.uploadId, submissionId: input.submissionId, actorId: input.expectedActorId,
      ...(Object.hasOwn(input, "expectedRevision") ? { expectedRevision: input.expectedRevision } : {}) } : {}) }, status);
}
function uploadRpcFailure(error: { code?: string }, input?: UploadBinding) {
  const code = error.code;
  if (code === "SE426") return uploadFailure("upload_upgrade_required", "Refresh the full page to continue with the updated upload recovery tools.", 426, input);
  if (code === "SE403") return uploadFailure("evidence_write_forbidden", "You cannot access or change this private upload.", 403, input);
  if (code === "SE412") return uploadFailure("upload_revision_changed", "Another upload changed this submission. Check upload status before continuing.", 412, input);
  if (code === "SE428") return uploadFailure("upload_pending", "Resolve the unfinished upload before choosing another file.", 409, input);
  if (code === "SE409") return uploadFailure("upload_deleted", "This evidence upload was removed. Choose the file again to start a new upload.", 409, input);
  if (code === "SE410") return uploadFailure("upload_discarded", "This unfinished upload was discarded. Choose the file again to start a new upload.", 409, input);
  if (code === "SE404") return uploadFailure("upload_not_ready", "The file has not arrived yet. Retry this same upload.", 409, input, true);
  if (code === "SE422") return uploadFailure("upload_metadata_mismatch", "The stored file does not match this upload. Check its status and discard the unfinished attempt before choosing another file.", 409, input);
  if (code === "PT409") return uploadFailure("upload_conflict", "The upload identity or submission changed. Check upload status before continuing.", 409, input);
  if (code === "P0002") return uploadFailure("submission_not_found", "The service submission was not found.", 404, input);
  if (code === "22023") return uploadFailure("invalid_upload", "This evidence upload is invalid. Select the file again.", 400, input);
  return uploadFailure("upload_unconfirmed", "This upload could not be confirmed. Check upload status before continuing.", 503, input, true, true);
}
function uploadResult(value: unknown, input: ServiceEvidenceUpload): { revision: string; receipt: ServiceEvidenceUploadReceipt } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result = value as Record<string, unknown>, revision = cleanServiceEvidenceRevision(result.revision);
  if (result.ok !== true || revision === null || Object.keys(result).length !== 3 || !Object.hasOwn(result, "receipt")
    || (input.expectedRevision !== null && BigInt(revision) <= BigInt(input.expectedRevision))) return null;
  const receipt = parseServiceEvidenceUploadReceipt(result.receipt, { actorId: input.expectedActorId, submissionId: input.submissionId, uploadId: input.uploadId, expectedRevision: input.expectedRevision });
  if (!receipt || (input.action === "prepare" && (!receipt.metadata || receipt.metadata.evidence_type !== input.evidenceType
    || receipt.metadata.file_name !== input.fileName || receipt.metadata.mime_type !== input.mimeType || receipt.metadata.file_size_bytes !== input.size))) return null;
  return { revision, receipt };
}
function uploadBinding(receipt: ServiceEvidenceUploadReceipt, revision: string) {
  return { protocolVersion: 2, uploadId: receipt.uploadId, submissionId: receipt.submissionId, actorId: receipt.actorId,
    expectedRevision: receipt.expectedRevision, revision, bucket: receipt.bucket, storagePath: receipt.storagePath };
}
function uploadCommitted(receipt: ServiceEvidenceUploadReceipt, revision: string) {
  return json({ ok: true, phase: "committed", committed: true, ...uploadBinding(receipt, revision), evidence: receipt.evidence, message: "Private evidence uploaded." });
}
async function discoverUploads(request: Request, url: URL) {
  let binding: UploadBinding | undefined;
  try {
    const auth = await bounded(getAuthenticatedUser(request));
    if (!auth.user) return uploadFailure("auth_required", "Sign in again to check your unfinished uploads.", 401);
    const actorId = cleanServiceEvidenceUploadId(auth.user.id), submissionId = cleanServiceEvidenceUploadId(url.searchParams.get("submissionId"));
    const uploadId = url.searchParams.has("uploadId") ? cleanServiceEvidenceUploadId(url.searchParams.get("uploadId")) : undefined;
    const keys = [...url.searchParams.keys()];
    if (!actorId || !submissionId || uploadId === "" || url.searchParams.get("uploadState") !== "1"
      || new Set(keys).size !== keys.length || keys.some(key => !["submissionId", "uploadState", "uploadId"].includes(key))) return uploadFailure("invalid_upload", "Use a valid submission and upload identity to check upload status.", 400);
    binding = { expectedActorId: actorId, submissionId, ...(uploadId ? { uploadId } : {}) };
    const supabase = createServerSupabaseClient();
    if (!supabase) return uploadFailure("evidence_unavailable", "Upload status is temporarily unavailable.", 503, binding, true);
    const admin = await bounded(getAdminContext(request));
    const read = await bounded(supabase.rpc("read_service_evidence_uploads", { p_submission_id: submissionId, p_actor_id: actorId,
      p_is_admin: admin.ok && admin.user?.id === auth.user.id, p_upload_id: uploadId || null }));
    if (read.error) return uploadRpcFailure(read.error, binding);
    const discovery = parseServiceEvidenceUploadDiscovery(read.data, { actorId, submissionId, ...(uploadId ? { uploadId } : {}) });
    if (!discovery) return uploadFailure("upload_unconfirmed", "Upload status could not be confirmed. Check again before continuing.", 503, binding, true, true);
    return json(discovery);
  } catch { return uploadFailure("upload_unconfirmed", "Upload status could not be confirmed. Check again before continuing.", 503, binding, true, true); }
}
export async function POST(request: Request) {
  let input: ServiceEvidenceUpload | undefined;
  try {
    const auth = await bounded(getAuthenticatedUser(request));
    if (!auth.user) return uploadFailure("auth_required", "Sign in again before uploading evidence.", 401);
    const supabase = createServerSupabaseClient();
    if (!supabase) return uploadFailure("evidence_unavailable", "Evidence is temporarily unavailable.", 503, undefined, true);
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return uploadFailure("direct_upload_required", "Reload the service editor to upload files directly. This endpoint accepts only small JSON upload instructions.", 415);
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return uploadFailure("origin_forbidden", "This upload request came from another site.", 403);
    const parsed = await uploadBody(request);
    if (parsed.status) return uploadFailure(parsed.status === 413 ? "upload_control_too_large" : "invalid_upload", "Upload instructions must be valid JSON no larger than 16 KiB. File bytes must be uploaded directly.", parsed.status);
    if (parsed.body && typeof parsed.body === "object" && !Array.isArray(parsed.body) && (parsed.body as Record<string, unknown>).protocolVersion !== 2)
      return uploadFailure("upload_upgrade_required", "Refresh the full page to continue with the updated upload recovery tools.", 426);
    input = normalizeServiceEvidenceUpload(parsed.body) || undefined;
    if (!input) {
      const body = parsed.body as { size?: unknown; mimeType?: unknown } | null;
      if (body && typeof body.size === "number" && body.size > SERVICE_EVIDENCE_UPLOAD_MAX_BYTES) return uploadFailure("file_too_large", "Use an evidence file no larger than 15 MiB.", 413);
      return uploadFailure("invalid_upload", "Choose a nonempty JPG, PNG, WebP, or PDF file and a valid evidence type.", 400);
    }
    if (cleanServiceEvidenceUploadId(auth.user.id) !== input.expectedActorId) return uploadFailure("upload_actor_changed", "The signed-in account changed. Return to the original account before retrying this upload.", 409, input);
    const access = await bounded(assertAccountCanWrite(supabase, auth.user));
    if (!access.ok) return uploadFailure("account_write_blocked", access.message, access.status, input);
    const admin = await bounded(getAdminContext(request));
    const isAdmin = admin.ok && admin.user?.id === auth.user.id;
    const args = { p_submission_id: input.submissionId, p_actor_id: auth.user.id, p_is_admin: isAdmin, p_upload_id: input.uploadId, p_expected_revision: input.expectedRevision };
    if (input.action !== "prepare") {
      // Finishing/discarding uses only the original durable identity. It never prepares,
      // replaces file bytes, or signs a new upload as a side effect of recovery.
      const result = await bounded(supabase.rpc(input.action === "complete" ? "commit_service_evidence_upload" : "discard_service_evidence_upload", args));
      if (result.error) return uploadRpcFailure(result.error, input);
      const final = uploadResult(result.data, input);
      if (!final || (input.action === "complete" ? final.receipt.state !== "committed" : final.receipt.state === "prepared"))
        return uploadFailure("upload_unconfirmed", "The upload change could not be confirmed. Check its status before continuing.", 503, input, true, true);
      if (input.action === "complete") return uploadCommitted(final.receipt, final.revision);
      return json({ ok: true, phase: final.receipt.state, ...uploadBinding(final.receipt, final.revision), receipt: final.receipt,
        message: final.receipt.state === "discarded" ? "Unfinished upload discarded. You can choose a file again." : final.receipt.state === "committed" ? "This upload was already attached. Its evidence has been kept." : "This upload was already removed." });
    }
    const prepared = await bounded(supabase.rpc("prepare_service_evidence_upload", { ...args,
      p_evidence: { evidence_type: input.evidenceType, file_name: input.fileName, mime_type: input.mimeType, file_size_bytes: input.size } }));
    if (prepared.error) return uploadRpcFailure(prepared.error, input);
    const result = uploadResult(prepared.data, input), receipt = result?.receipt;
    if (!result || !receipt || (receipt.state !== "prepared" && receipt.state !== "committed") || !receipt.storagePath || !receipt.metadata)
      return uploadFailure("upload_unconfirmed", "The saved upload identity could not be confirmed. Check upload status before continuing.", 503, input, true, true);
    if (receipt.state === "committed") return uploadCommitted(receipt, result.revision);
    const storage = supabase.storage.from(receipt.bucket), info = await bounded(storage.info(receipt.storagePath));
    if (!info.error && info.data) {
      const actual = info.data, expected = receipt.metadata;
      if (actual.name !== receipt.storagePath || actual.bucketId !== receipt.bucket || actual.size !== expected.file_size_bytes || actual.contentType !== expected.mime_type || actual.isDeleteMarker) return uploadFailure("upload_metadata_mismatch", "The stored file does not match this upload. Check its status and discard the unfinished attempt before choosing another file.", 409, input);
      return json({ ok: true, phase: "uploaded", ...uploadBinding(receipt, result.revision) });
    }
    const error = info.error as { status?: number; statusCode?: string; code?: string } | null;
    const missing = error?.status === 404 || error?.statusCode === "404" || error?.code === "NoSuchKey" || error?.code === "not_found";
    if (!missing) return uploadFailure("upload_verification_unavailable", "The stored file could not be checked. Retry this same upload.", 503, input, true, true);
    const signed = await bounded(storage.createSignedUploadUrl(receipt.storagePath, { upsert: false }));
    if (signed.error || !signed.data || signed.data.path !== receipt.storagePath || !validServiceEvidenceSignedUploadUrl(signed.data.signedUrl, getSupabaseEnvStatus().supabaseUrl, receipt.storagePath)) return uploadFailure("signed_upload_unavailable", "A secure upload could not be prepared. Retry this same file.", 503, input, true, true);
    return json({ ok: true, phase: "upload", ...uploadBinding(receipt, result.revision), signedUrl: signed.data.signedUrl });
  } catch { return uploadFailure("upload_unconfirmed", "This upload could not be confirmed. Reload the submission before retrying this same file.", 503, input, true, Boolean(input)); }
}

export async function DELETE(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (!auth.user) return json({ ok: false, message: auth.error || "Sign in required." }, 401);
  const supabase = createServerSupabaseClient();
  if (!supabase) return json({ ok: false, message: "Evidence is temporarily unavailable." }, 503);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const evidenceId = cleanServiceText(body?.evidenceId, 80);
  const row = await supabase.from("service_submission_evidence").select("id,submission_id").eq("id", evidenceId).maybeSingle<{ id: string; submission_id: string }>();
  if (row.error) return json({ ok: false, message: "Could not load evidence." }, 503);
  if (!row.data) return json({ ok: false, message: "Evidence was not found." }, 404);
  const submission = await supabase.from("service_submissions").select("*").eq("id", row.data.submission_id).maybeSingle<ServiceSubmissionRow>();
  if (submission.error) return json({ ok: false, message: "Could not load the submission." }, 503);
  if (!submission.data) return json({ ok: false, message: "Service submission was not found." }, 404);
  const access = await authorize(request, submission.data, "write");
  if (!access.allowed || !access.user) return json({ ok: false, message: access.message }, access.status);
  let committed;
  try {
    committed = await supabase.rpc("commit_service_evidence", { p_submission_id: row.data.submission_id, p_actor_id: access.user.id, p_is_admin: access.admin, p_action: "delete", p_evidence: { id: evidenceId } });
  } catch { return unconfirmed(); }
  if (committed.error) return rpcFailure(committed.error);
  if (!committed.data?.id || !committed.data?.storage_path) return unconfirmed();
  let cleanupPending = true;
  try { const removed = await supabase.storage.from("service-evidence").remove([committed.data.storage_path]); cleanupPending = Boolean(removed.error); } catch { /* The metadata removal is committed; the private object is not returned by this API. */ }
  return json({ ok: true, committed: true, cleanupPending, message: cleanupPending ? "Evidence removed from the submission. Private file cleanup is pending." : "Evidence removed." });
}
