import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { assertAccountCanWrite, getAdminContext } from "../../../lib/admin-auth";
import { createServerSupabaseClient, getAuthenticatedUser } from "../../../lib/supabase-server";
import {
  SERVICE_EVIDENCE_MAX_BYTES, SERVICE_EVIDENCE_MIME_TYPES, SERVICE_EVIDENCE_TYPES,
  cleanServiceText, sanitizeEvidenceFilename, serviceMigrationMessage, serviceMigrationMissing,
  type ServiceSubmissionRow
} from "../../../lib/service-workflow";

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
  const status = error.code === "40001" ? 409 : error.code === "42501" ? 403 : error.code === "P0002" ? 404 : error.code === "22023" ? 400 : 503;
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

export async function POST(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (!auth.user) return json({ ok: false, message: auth.error || "Sign in required." }, 401);
  const supabase = createServerSupabaseClient();
  if (!supabase) return json({ ok: false, message: "Evidence is temporarily unavailable." }, 503);
  const form = await request.formData().catch(() => null);
  const submissionId = cleanServiceText(form?.get("submissionId"), 80);
  const enteredType = cleanServiceText(form?.get("evidenceType"), 40);
  const evidenceType = (SERVICE_EVIDENCE_TYPES as readonly string[]).includes(enteredType) ? enteredType : "other";
  const file = form?.get("file");
  if (!(file instanceof File)) return json({ ok: false, message: "Choose a supported evidence file." }, 400);
  if (!SERVICE_EVIDENCE_MIME_TYPES.has(file.type)) return json({ ok: false, message: "Use a JPG, PNG, WebP, or PDF file." }, 415);
  if (!file.size || file.size > SERVICE_EVIDENCE_MAX_BYTES) return json({ ok: false, message: "Evidence files must be between 1 byte and 15 MB." }, 413);
  const submission = await supabase.from("service_submissions").select("*").eq("id", submissionId).maybeSingle<ServiceSubmissionRow>();
  if (submission.error) return json({ ok: false, message: "Evidence is temporarily unavailable." }, 503);
  if (!submission.data) return json({ ok: false, message: "Service submission was not found." }, 404);
  const access = await authorize(request, submission.data, "write");
  if (!access.allowed || !access.user) return json({ ok: false, message: access.message }, access.status);
  const safeName = sanitizeEvidenceFilename(file.name);
  const storagePath = `${submissionId}/${access.user.id}/${randomUUID()}-${safeName}`;
  const upload = await supabase.storage.from("service-evidence").upload(storagePath, file, { contentType: file.type, upsert: false });
  if (upload.error) return json({ ok: false, message: "Evidence upload failed. Please try again." }, 503);
  let committed;
  try {
    committed = await supabase.rpc("commit_service_evidence", { p_submission_id: submissionId, p_actor_id: access.user.id, p_is_admin: access.admin,
      p_action: "upload", p_evidence: { evidence_type: evidenceType, file_name: safeName, mime_type: file.type, file_size_bytes: file.size, storage_path: storagePath } });
  } catch { return unconfirmed(); }
  if (committed.error) {
    // A transport error may hide a committed insert. Only clean up after a confirmed database rejection.
    if (committed.error.code && !committed.error.code.startsWith("PGRST")) await supabase.storage.from("service-evidence").remove([storagePath]).catch(() => undefined);
    return rpcFailure(committed.error);
  }
  if (!committed.data?.id) return unconfirmed();
  return json({ ok: true, committed: true, evidence: evidenceResponse(committed.data as EvidenceRow), message: "Private evidence uploaded." });
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
