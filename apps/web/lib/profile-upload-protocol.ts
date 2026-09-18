export type ProfileUploadKind = "image" | "document";
export const MAX_PROFILE_UPLOAD_BYTES = 12 * 1024 * 1024;
export const MAX_INLINE_PROFILE_UPLOAD_BYTES = 3 * 1024 * 1024;
export const MAX_PROFILE_UPLOAD_JSON_BYTES = 4 * 1024 * 1024 + 32 * 1024;
export const MAX_PROFILE_UPLOAD_CONTROL_BYTES = 16 * 1024;
// Stay comfortably below Netlify's fixed 6 MB request ceiling. Profile edits
// contain metadata and verified Storage paths only; file bytes never use it.
export const MAX_PROFILE_EDIT_JSON_BYTES = 4 * 1024 * 1024;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function cleanProfileUploadId(value: unknown) { return typeof value === "string" && /^[a-zA-Z0-9-]{12,80}$/.test(value) ? value : ""; }
export function cleanProfileFileId(value: unknown) { return typeof value === "string" && uuidPattern.test(value) ? value.toLowerCase() : ""; }
export function profileUploadExtension(mimeType: string) { return ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" } as Record<string,string>)[mimeType] || ""; }
export function allowedProfileUpload(kind: ProfileUploadKind, mimeType: string) { return Boolean(profileUploadExtension(mimeType)) && (kind === "document" || mimeType !== "application/pdf"); }
export function profileUploadBucket(kind: ProfileUploadKind) { return kind === "document" ? "instrument-documents" : "instrument-media"; }
export function profileUploadPath(ownerId: string, uploadId: string, fileId: string, kind: ProfileUploadKind, mimeType: string, targetGuitarId = "") {
  if (!cleanProfileFileId(ownerId) || !cleanProfileUploadId(uploadId) || !cleanProfileFileId(fileId) || !allowedProfileUpload(kind,mimeType) ||
      (targetGuitarId && !cleanProfileFileId(targetGuitarId))) return "";
  const root = targetGuitarId
    ? `${ownerId.toLowerCase()}/${targetGuitarId.toLowerCase()}/profile-uploads/${uploadId}`
    : `${ownerId.toLowerCase()}/profile-uploads/${uploadId}`;
  return `${root}/${kind}-${fileId.toLowerCase()}.${profileUploadExtension(mimeType)}`;
}
/** A signed upload is a capability for this one object, never an arbitrary upload destination. */
export function validProfileSignedUploadUrl(value: unknown, supabaseUrl: string, bucket: string, storagePath: string) {
  if (typeof value !== "string" || value.length > 10000 || !storagePath) return false;
  try {
    const expected = new URL(supabaseUrl), actual = new URL(value);
    return expected.protocol === "https:" && actual.protocol === "https:" && actual.origin === expected.origin && !actual.username && !actual.password && !actual.hash
      && actual.pathname === `/storage/v1/object/upload/sign/${bucket}/${storagePath}`
      && actual.searchParams.getAll("token").length === 1 && Boolean(actual.searchParams.get("token"))
      && [...actual.searchParams.keys()].every((key) => key === "token");
  } catch { return false; }
}
