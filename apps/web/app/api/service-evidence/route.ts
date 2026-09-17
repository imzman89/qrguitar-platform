import { NextResponse } from "next/server";
import { assertAccountCanWrite, getAdminContext } from "../../../lib/admin-auth";
import { createServerSupabaseClient, getAuthenticatedUser, getSupabaseEnvStatus } from "../../../lib/supabase-server";
import {
  cleanServiceText, serviceMigrationMessage, serviceMigrationMissing,
  type ServiceSubmissionRow
} from "../../../lib/service-workflow";
import {
  SERVICE_EVIDENCE_UPLOAD_CONTROL_BYTES, SERVICE_EVIDENCE_UPLOAD_MAX_BYTES, SERVICE_EVIDENCE_UPLOAD_BUCKET,
  cleanServiceEvidenceUploadId, normalizeServiceEvidenceUpload, serviceEvidenceStoragePath, validServiceEvidenceSignedUploadUrl,
  type ServiceEvidenceUpload
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
function uploadFailure(code: string, message: string, status: number, input?: ServiceEvidenceUpload, retryable = false, uncertain = false) {
  return json({ ok: false, code, message, retryable, uncertain,
    ...(uncertain && input?.action === "complete" ? { commitStatus: "unknown" } : {}),
    ...(input ? { uploadId: input.uploadId, submissionId: input.submissionId, actorId: input.expectedActorId } : {}) }, status);
}
function uploadRpcFailure(error: { code?: string }, input: ServiceEvidenceUpload) {
  const code = error.code;
  if (code === "SE409") return uploadFailure("upload_deleted", "This evidence upload was removed. Choose the file again to start a new upload.", 409, input);
  if (code === "SE404") return uploadFailure("upload_not_ready", "The file has not arrived yet. Retry this same upload.", 409, input, true);
  if (code === "SE422") return uploadFailure("upload_metadata_mismatch", "The stored file does not match this upload. Keep this attempt for review and select a new file.", 409, input);
  if (code === "PT409" || code === "40001") return uploadFailure("upload_conflict", "The upload or submission changed. Reload before continuing.", 409, input);
  if (code === "42501") return uploadFailure("evidence_write_forbidden", "You cannot change this private evidence.", 403, input);
  if (code === "P0002") return uploadFailure("submission_not_found", "The service submission was not found.", 404, input);
  if (code === "22023") return uploadFailure("invalid_upload", "This evidence upload is invalid. Select the file again.", 400, input);
  return uploadFailure("upload_unconfirmed", "This upload could not be confirmed. Reload the submission before retrying this same file.", 503, input, true, true);
}
type UploadReceipt = {
  ok: true; uploadId: string; submissionId: string; actorId: string; state: "prepared" | "committed";
  bucket: string; storagePath: string; metadata: { evidence_type: string; file_name: string; mime_type: string; file_size_bytes: number };
  evidence: (EvidenceRow & { submission_id: string; uploaded_by_user_id: string }) | null; deletedAt: null;
};
function uploadReceipt(value: unknown, input: ServiceEvidenceUpload): UploadReceipt | null {
  if (!value || typeof value !== "object") return null;
  const row = value as UploadReceipt, metadata = row.metadata;
  if (row.ok !== true || row.uploadId !== input.uploadId || row.submissionId !== input.submissionId || row.actorId !== input.expectedActorId
    || row.bucket !== SERVICE_EVIDENCE_UPLOAD_BUCKET || row.storagePath !== serviceEvidenceStoragePath(input.submissionId, input.expectedActorId, input.uploadId, input.mimeType)
    || !metadata || metadata.evidence_type !== input.evidenceType || metadata.file_name !== input.fileName || metadata.mime_type !== input.mimeType || metadata.file_size_bytes !== input.size
    || row.deletedAt !== null || (row.state !== "prepared" && row.state !== "committed")) return null;
  if (row.state === "committed") {
    const evidence = row.evidence;
    if (!evidence || !cleanServiceEvidenceUploadId(evidence.id) || evidence.submission_id !== input.submissionId || evidence.uploaded_by_user_id !== input.expectedActorId
      || evidence.evidence_type !== metadata.evidence_type || evidence.file_name !== metadata.file_name
      || evidence.mime_type !== metadata.mime_type || evidence.file_size_bytes !== metadata.file_size_bytes || evidence.storage_path !== row.storagePath
      || typeof evidence.created_at !== "string" || !Number.isFinite(Date.parse(evidence.created_at))) return null;
  } else if (row.evidence !== null) return null;
  return row;
}
function uploadBinding(receipt: UploadReceipt) {
  return { uploadId: receipt.uploadId, submissionId: receipt.submissionId, actorId: receipt.actorId, bucket: receipt.bucket, storagePath: receipt.storagePath };
}
function uploadCommitted(receipt: UploadReceipt, replayed: boolean) {
  return json({ ok: true, phase: "committed", committed: true, replayed, ...uploadBinding(receipt), evidence: evidenceResponse(receipt.evidence!), message: "Private evidence uploaded." });
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
    const args = { p_submission_id: input.submissionId, p_actor_id: auth.user.id, p_is_admin: isAdmin, p_upload_id: input.uploadId };
    // The locked RPC authorizes the provider/submission and immutable metadata. It can
    // return a committed receipt after submission closes, without creating another row.
    const prepared = await bounded(supabase.rpc("prepare_service_evidence_upload", { ...args,
      p_evidence: { evidence_type: input.evidenceType, file_name: input.fileName, mime_type: input.mimeType, file_size_bytes: input.size } }));
    if (prepared.error) return uploadRpcFailure(prepared.error, input);
    const receipt = uploadReceipt(prepared.data, input);
    if (!receipt) return uploadFailure("upload_unconfirmed", "The saved upload identity could not be confirmed. Retry this same upload.", 503, input, true, true);
    if (receipt.state === "committed") return uploadCommitted(receipt, true);
    const storage = supabase.storage.from(receipt.bucket), info = await bounded(storage.info(receipt.storagePath));
    if (!info.error && info.data) {
      const actual = info.data, expected = receipt.metadata;
      if (actual.name !== receipt.storagePath || actual.bucketId !== receipt.bucket || actual.size !== expected.file_size_bytes || actual.contentType !== expected.mime_type || actual.isDeleteMarker) return uploadFailure("upload_metadata_mismatch", "The stored file does not match this upload. Keep this attempt for review and select a new file.", 409, input);
      if (input.action === "prepare") return json({ ok: true, phase: "uploaded", ...uploadBinding(receipt) });
      const committed = await bounded(supabase.rpc("commit_service_evidence_upload", args));
      if (committed.error) return uploadRpcFailure(committed.error, input);
      const final = uploadReceipt(committed.data, input);
      if (!final || final.state !== "committed") return uploadFailure("upload_unconfirmed", "The evidence save could not be confirmed. Reload the submission before retrying this same file.", 503, input, true, true);
      return uploadCommitted(final, false);
    }
    const error = info.error as { status?: number; statusCode?: string; code?: string } | null;
    const missing = error?.status === 404 || error?.statusCode === "404" || error?.code === "NoSuchKey" || error?.code === "not_found";
    if (!missing) return uploadFailure("upload_verification_unavailable", "The stored file could not be checked. Retry this same upload.", 503, input, true, true);
    if (input.action === "complete") return uploadFailure("upload_not_ready", "The file has not arrived yet. Retry this same upload.", 409, input, true);
    const signed = await bounded(storage.createSignedUploadUrl(receipt.storagePath, { upsert: false }));
    if (signed.error || !signed.data || signed.data.path !== receipt.storagePath || !validServiceEvidenceSignedUploadUrl(signed.data.signedUrl, getSupabaseEnvStatus().supabaseUrl, receipt.storagePath)) return uploadFailure("signed_upload_unavailable", "A secure upload could not be prepared. Retry this same file.", 503, input, true, true);
    return json({ ok: true, phase: "upload", ...uploadBinding(receipt), signedUrl: signed.data.signedUrl });
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
