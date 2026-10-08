import type { SupabaseClient } from "@supabase/supabase-js";
import { isOwnedStagedPath } from "./staged-upload-cleanup";
import { ProfileSaveError, type VerifiedProfileUpload } from "./profile-save-assets";
import { MAX_PROFILE_UPLOAD_BYTES, allowedProfileUpload, profileUploadBucket, profileUploadExtension, type ProfileUploadKind } from "./profile-upload-protocol";

function strings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()) : [];
}

function requestedUploads(body: Record<string, unknown>, ownerId: string, guitarId: string, uploadId: string, existingPaths: ReadonlySet<string>) {
  const candidates: Array<{ path: string; kind: ProfileUploadKind }> = [];
  const add = (value: unknown, kind: ProfileUploadKind) => {
    if (typeof value !== "string") return;
    const path = value.trim();
    if (existingPaths.has(path)) return;
    if (isOwnedStagedPath(path, ownerId, uploadId, kind, guitarId)) candidates.push({ path, kind });
  };
  for (const photo of strings(body.photos)) add(photo, "image");
  add(body.heroImagePath, "image");
  add(body.heroImageDataUrl, "image");
  if (Array.isArray(body.documents)) {
    for (const raw of body.documents) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const document = raw as Record<string, unknown>;
      add(document.storagePath ?? document.dataUrl ?? document.url, "document");
    }
  }
  return [...new Map(candidates.map((candidate) => [candidate.path, candidate])).values()];
}

/** Recheck every edit upload after the browser handshake and immediately before the atomic save. */
export async function verifyProfileEditUploads(options: {
  supabase: SupabaseClient;
  body: Record<string, unknown>;
  ownerId: string;
  guitarId: string;
  uploadId: string;
  existingMediaPaths?: string[];
  existingDocumentPaths?: string[];
}) {
  const existingPaths = new Set([...(options.existingMediaPaths || []), ...(options.existingDocumentPaths || [])]);
  const uploads = requestedUploads(options.body, options.ownerId, options.guitarId, options.uploadId, existingPaths);
  const verified = new Map<string, VerifiedProfileUpload>();
  await Promise.all(uploads.map(async ({ path, kind }) => {
    const bucket = profileUploadBucket(kind);
    const registry = await options.supabase.from("instrument_staged_uploads")
      .select("owner_id,upload_id,state,guitar_id").eq("bucket_id", bucket).eq("storage_path", path).maybeSingle();
    if (registry.error) throw new ProfileSaveError("Uploads cannot be checked safely right now. Retry this save.", 503, "profile_upload_verification_unavailable");
    if (!registry.data || registry.data.owner_id !== options.ownerId || registry.data.upload_id !== options.uploadId || registry.data.state !== "staged") {
      throw new ProfileSaveError("A selected upload changed before this Profile was saved. Upload that file again.", 409, "profile_upload_changed");
    }
    const info = await options.supabase.storage.from(bucket).info(path);
    if (info.error || !info.data) throw new ProfileSaveError("An uploaded file is missing. Upload that file again.", 409, "profile_upload_missing");
    const size = info.data.size;
    const mimeType = info.data.contentType;
    const extension = typeof mimeType === "string" ? profileUploadExtension(mimeType) : "";
    if (typeof size !== "number" || !Number.isSafeInteger(size) || size < 1 || size > MAX_PROFILE_UPLOAD_BYTES ||
        typeof mimeType !== "string" || !allowedProfileUpload(kind, mimeType) || !extension ||
        info.data.name !== path || (info.data.bucketId !== undefined && info.data.bucketId !== bucket) || info.data.isDeleteMarker ||
        !path.toLowerCase().endsWith(`.${extension}`)) {
      throw new ProfileSaveError("An uploaded file no longer matches the selected file. Upload it again.", 409, "profile_upload_metadata_mismatch");
    }
    verified.set(path, { kind, mimeType, size: size as number });
  }));
  return verified;
}
