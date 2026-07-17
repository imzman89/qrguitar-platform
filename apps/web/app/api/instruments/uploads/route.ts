import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { assertAccountCanWrite } from "../../../../lib/admin-auth";
import { createServerSupabaseClient, getAuthenticatedUser } from "../../../../lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const MEDIA_BUCKET = "instrument-media";
const DOCUMENT_BUCKET = "instrument-documents";
const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_DOCUMENT_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
const MAX_STAGED_FILE_BYTES = 12 * 1024 * 1024;

type UploadKind = "image" | "document";

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate" }
  });
}

function cleanUploadId(value: unknown) {
  const uploadId = String(value || "").trim();
  return /^[a-zA-Z0-9-]{12,80}$/.test(uploadId) ? uploadId : "";
}

function parseDataUrl(value: unknown) {
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(String(value || ""));
  if (!match) return null;

  try {
    const bytes = Buffer.from(match[2], "base64");
    return { mimeType: match[1].toLowerCase(), bytes };
  } catch {
    return null;
  }
}

function extensionForMimeType(mimeType: string) {
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

export async function POST(request: Request) {
  const supabase = createServerSupabaseClient();
  if (!supabase) return json({ ok: false, code: "service_unavailable", message: "Profile uploads are temporarily unavailable.", retryable: true }, 503);

  const auth = await getAuthenticatedUser(request);
  if (!auth.user) return json({ ok: false, code: "auth_required", message: auth.error || "Sign in again before uploading.", retryable: false }, 401);

  const writeAccess = await assertAccountCanWrite(supabase, auth.user);
  if (!writeAccess.ok) return json({ ok: false, code: "account_write_blocked", message: writeAccess.message, retryable: false }, writeAccess.status);

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const uploadId = cleanUploadId(body?.uploadId);
  const kind: UploadKind = body?.kind === "document" ? "document" : "image";
  const parsed = parseDataUrl(body?.dataUrl);
  const index = Math.max(0, Math.min(99, Number(body?.index) || 0));

  if (!uploadId) return json({ ok: false, code: "invalid_upload", message: "This upload session is invalid. Refresh and try again.", retryable: false }, 400);
  if (!parsed) return json({ ok: false, code: "invalid_file", message: "The selected file could not be read.", retryable: false }, 400);
  if (parsed.bytes.length > MAX_STAGED_FILE_BYTES) return json({ ok: false, code: "file_too_large", message: "Use a file smaller than 12MB.", retryable: false }, 413);

  const allowedTypes = kind === "document" ? ALLOWED_DOCUMENT_MIME_TYPES : ALLOWED_IMAGE_MIME_TYPES;
  if (!allowedTypes.has(parsed.mimeType)) {
    return json({
      ok: false,
      code: "unsupported_file_type",
      message: kind === "document" ? "Use a PDF, JPG, PNG, or WebP document." : "Use a JPG, PNG, or WebP photo.",
      retryable: false
    }, 415);
  }

  const bucket = kind === "document" ? DOCUMENT_BUCKET : MEDIA_BUCKET;
  const objectPath = `${auth.user.id}/profile-uploads/${uploadId}/${kind}-${String(index + 1).padStart(2, "0")}-${randomUUID()}.${extensionForMimeType(parsed.mimeType)}`;
  const upload = await supabase.storage.from(bucket).upload(objectPath, parsed.bytes, {
    contentType: parsed.mimeType,
    upsert: false
  });

  if (upload.error) {
    return json({ ok: false, code: "storage_upload_failed", message: "That file could not be uploaded. Retry the failed file.", retryable: true }, 502);
  }

  return json({ ok: true, storagePath: objectPath, kind });
}

export async function DELETE(request: Request) {
  const supabase = createServerSupabaseClient();
  if (!supabase) return json({ ok: false, code: "service_unavailable", message: "Profile uploads are temporarily unavailable.", retryable: true }, 503);

  const auth = await getAuthenticatedUser(request);
  if (!auth.user) return json({ ok: false, code: "auth_required", message: auth.error || "Sign in required.", retryable: false }, 401);

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const uploadId = cleanUploadId(body?.uploadId);
  const paths = Array.isArray(body?.paths) ? body.paths.map(String).slice(0, 30) : [];
  const mediaPaths = paths.filter((path) => path.startsWith(`${auth.user.id}/profile-uploads/${uploadId}/image-`));
  const documentPaths = paths.filter((path) => path.startsWith(`${auth.user.id}/profile-uploads/${uploadId}/document-`));

  if (!uploadId || mediaPaths.length + documentPaths.length !== paths.length) {
    return json({ ok: false, code: "invalid_cleanup", message: "Upload cleanup was rejected.", retryable: false }, 400);
  }

  const errors: string[] = [];
  if (mediaPaths.length) {
    const result = await supabase.storage.from(MEDIA_BUCKET).remove(mediaPaths);
    if (result.error) errors.push(result.error.message);
  }
  if (documentPaths.length) {
    const result = await supabase.storage.from(DOCUMENT_BUCKET).remove(documentPaths);
    if (result.error) errors.push(result.error.message);
  }

  return errors.length
    ? json({ ok: false, code: "cleanup_failed", message: "Some staged files could not be removed.", retryable: true }, 502)
    : json({ ok: true });
}
