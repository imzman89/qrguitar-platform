import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getAdminContext } from "../../../lib/admin-auth";
import { createServerSupabaseClient, getAuthenticatedUser } from "../../../lib/supabase-server";
import {
  SERVICE_EVIDENCE_MAX_BYTES,
  SERVICE_EVIDENCE_MIME_TYPES,
  SERVICE_EVIDENCE_TYPES,
  cleanServiceText,
  sanitizeEvidenceFilename,
  serviceMigrationMessage,
  serviceMigrationMissing,
  type ServiceSubmissionRow
} from "../../../lib/service-workflow";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } });
}

async function authorize(request: Request, submission: ServiceSubmissionRow, action: "read" | "write") {
  const auth = await getAuthenticatedUser(request);
  if (!auth.user) return { user: null, allowed: false, status: 401, message: auth.error || "Sign in required." };
  const admin = await getAdminContext(request);
  const participant = auth.user.id === submission.provider_user_id || auth.user.id === submission.owner_user_id;
  const writeAllowed = auth.user.id === submission.provider_user_id && (submission.status === "draft" || submission.status === "changes_requested");
  const allowed = admin.ok || (action === "read" ? participant : writeAllowed);
  return { user: auth.user, allowed, status: allowed ? 200 : 403, message: allowed ? "" : "You cannot access this private evidence." };
}

export async function GET(request: Request) {
  const earlyAuth = await getAuthenticatedUser(request);
  if (!earlyAuth.user) return json({ ok: false, message: earlyAuth.error || "Sign in required." }, 401);
  const supabase = createServerSupabaseClient();
  if (!supabase) return json({ ok: false, message: "Supabase is not configured." }, 503);
  const url = new URL(request.url);
  const submissionId = cleanServiceText(url.searchParams.get("submissionId"), 80);
  const evidenceId = cleanServiceText(url.searchParams.get("evidenceId"), 80);
  const submissionResult = await supabase.from("service_submissions").select("*").eq("id", submissionId).maybeSingle<ServiceSubmissionRow>();
  if (submissionResult.error) return json({ ok: false, message: serviceMigrationMissing(submissionResult.error.message) ? serviceMigrationMessage() : submissionResult.error.message }, serviceMigrationMissing(submissionResult.error.message) ? 503 : 500);
  if (!submissionResult.data) return json({ ok: false, message: "Service submission was not found." }, 404);
  const access = await authorize(request, submissionResult.data, "read");
  if (!access.allowed) return json({ ok: false, message: access.message }, access.status);

  let query = supabase.from("service_submission_evidence").select("id,submission_id,evidence_type,file_name,mime_type,file_size_bytes,storage_path,created_at").eq("submission_id", submissionId).order("created_at");
  if (evidenceId) query = query.eq("id", evidenceId);
  const evidence = await query;
  if (evidence.error) return json({ ok: false, message: evidence.error.message }, 500);
  const rows = await Promise.all((evidence.data || []).map(async (row) => {
    const signed = await supabase.storage.from("service-evidence").createSignedUrl(row.storage_path, 300);
    return { id: row.id, type: row.evidence_type, fileName: row.file_name, mimeType: row.mime_type, fileSizeBytes: row.file_size_bytes, createdAt: row.created_at, previewUrl: signed.data?.signedUrl || "" };
  }));
  return json({ ok: true, evidence: rows });
}

export async function POST(request: Request) {
  const earlyAuth = await getAuthenticatedUser(request);
  if (!earlyAuth.user) return json({ ok: false, message: earlyAuth.error || "Sign in required." }, 401);
  const supabase = createServerSupabaseClient();
  if (!supabase) return json({ ok: false, message: "Supabase is not configured." }, 503);
  const form = await request.formData().catch(() => null);
  const submissionId = cleanServiceText(form?.get("submissionId"), 80);
  const evidenceTypeRaw = cleanServiceText(form?.get("evidenceType"), 40);
  const evidenceType = (SERVICE_EVIDENCE_TYPES as readonly string[]).includes(evidenceTypeRaw) ? evidenceTypeRaw : "other";
  const file = form?.get("file");
  if (!(file instanceof File)) return json({ ok: false, message: "Choose a supported evidence file." }, 400);
  if (!SERVICE_EVIDENCE_MIME_TYPES.has(file.type)) return json({ ok: false, message: "Use a JPG, PNG, WebP, or PDF file." }, 415);
  if (!file.size || file.size > SERVICE_EVIDENCE_MAX_BYTES) return json({ ok: false, message: "Evidence files must be between 1 byte and 15 MB." }, 413);

  const submissionResult = await supabase.from("service_submissions").select("*").eq("id", submissionId).maybeSingle<ServiceSubmissionRow>();
  if (submissionResult.error) return json({ ok: false, message: serviceMigrationMissing(submissionResult.error.message) ? serviceMigrationMessage() : submissionResult.error.message }, serviceMigrationMissing(submissionResult.error.message) ? 503 : 500);
  if (!submissionResult.data) return json({ ok: false, message: "Service submission was not found." }, 404);
  const access = await authorize(request, submissionResult.data, "write");
  if (!access.allowed || !access.user) return json({ ok: false, message: access.message }, access.status);

  const safeName = sanitizeEvidenceFilename(file.name);
  const storagePath = `${submissionId}/${access.user.id}/${randomUUID()}-${safeName}`;
  const upload = await supabase.storage.from("service-evidence").upload(storagePath, file, { contentType: file.type, upsert: false });
  if (upload.error) return json({ ok: false, message: `Evidence upload failed: ${upload.error.message}` }, 500);
  const created = await supabase.from("service_submission_evidence").insert({ submission_id: submissionId, uploaded_by_user_id: access.user.id, evidence_type: evidenceType, file_name: safeName, mime_type: file.type, file_size_bytes: file.size, storage_path: storagePath }).select("id,evidence_type,file_name,mime_type,file_size_bytes,created_at").single();
  if (created.error) {
    await supabase.storage.from("service-evidence").remove([storagePath]);
    return json({ ok: false, message: created.error.message }, 500);
  }
  await supabase.from("service_submission_activity").insert({ submission_id: submissionId, actor_user_id: access.user.id, action: "evidence_uploaded", metadata: { evidenceId: created.data.id, type: evidenceType } });
  return json({ ok: true, evidence: { id: created.data.id, type: created.data.evidence_type, fileName: created.data.file_name, mimeType: created.data.mime_type, fileSizeBytes: created.data.file_size_bytes, createdAt: created.data.created_at }, message: "Private evidence uploaded." });
}

export async function DELETE(request: Request) {
  const earlyAuth = await getAuthenticatedUser(request);
  if (!earlyAuth.user) return json({ ok: false, message: earlyAuth.error || "Sign in required." }, 401);
  const supabase = createServerSupabaseClient();
  if (!supabase) return json({ ok: false, message: "Supabase is not configured." }, 503);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const evidenceId = cleanServiceText(body?.evidenceId, 80);
  const row = await supabase.from("service_submission_evidence").select("id,submission_id,storage_path").eq("id", evidenceId).maybeSingle<{ id: string; submission_id: string; storage_path: string }>();
  if (row.error || !row.data) return json({ ok: false, message: row.error?.message || "Evidence was not found." }, row.error ? 500 : 404);
  const submission = await supabase.from("service_submissions").select("*").eq("id", row.data.submission_id).maybeSingle<ServiceSubmissionRow>();
  if (!submission.data) return json({ ok: false, message: "Service submission was not found." }, 404);
  const access = await authorize(request, submission.data, "write");
  if (!access.allowed || !access.user) return json({ ok: false, message: access.message }, access.status);
  const removed = await supabase.storage.from("service-evidence").remove([row.data.storage_path]);
  if (removed.error) return json({ ok: false, message: removed.error.message }, 500);
  await supabase.from("service_submission_evidence").delete().eq("id", evidenceId).eq("submission_id", row.data.submission_id);
  await supabase.from("service_submission_activity").insert({ submission_id: row.data.submission_id, actor_user_id: access.user.id, action: "evidence_removed", metadata: { evidenceId } });
  return json({ ok: true, message: "Evidence removed." });
}
