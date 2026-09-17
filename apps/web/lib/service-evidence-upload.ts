/** Shared browser/server protocol. Never import server-only workflow or Auth code here. */
export const SERVICE_EVIDENCE_UPLOAD_CONTROL_BYTES = 16 * 1024;
export const SERVICE_EVIDENCE_UPLOAD_MAX_BYTES = 15 * 1024 * 1024;
export const SERVICE_EVIDENCE_UPLOAD_BUCKET = "service-evidence";
const types = ["invoice", "work_order", "service_slip", "before_photo", "after_photo", "measurement_sheet", "receipt", "other"] as const;
const extensions: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function cleanServiceEvidenceUploadId(value: unknown): string {
  return typeof value === "string" && uuid.test(value) ? value.toLowerCase() : "";
}
export function serviceEvidenceFilename(value: string): string {
  const base = value.split(/[\\/]/).pop() || "evidence";
  const safe = base.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-{2,}/g, "-").replace(/^[-.]+|[-.]+$/g, "");
  return (safe || "evidence").slice(0, 120);
}
export type ServiceEvidenceUpload = {
  action: "prepare" | "complete"; expectedActorId: string; submissionId: string; uploadId: string;
  evidenceType: typeof types[number]; fileName: string; mimeType: string; size: number;
};
/** Exact control fields only; the name is display metadata, never a storage path. */
export function normalizeServiceEvidenceUpload(value: unknown): ServiceEvidenceUpload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const keys = ["action", "expectedActorId", "submissionId", "uploadId", "evidenceType", "fileName", "mimeType", "size"];
  if (Object.keys(v).length !== keys.length || Object.keys(v).some(key => !keys.includes(key))) return null;
  const expectedActorId = cleanServiceEvidenceUploadId(v.expectedActorId), submissionId = cleanServiceEvidenceUploadId(v.submissionId), uploadId = cleanServiceEvidenceUploadId(v.uploadId);
  if (!expectedActorId || !submissionId || !uploadId || (v.action !== "prepare" && v.action !== "complete")
    || !types.includes(v.evidenceType as typeof types[number]) || typeof v.fileName !== "string" || !v.fileName.trim() || v.fileName.length > 1024
    || typeof v.mimeType !== "string" || !Object.hasOwn(extensions, v.mimeType)
    || typeof v.size !== "number" || !Number.isSafeInteger(v.size) || v.size < 1 || v.size > SERVICE_EVIDENCE_UPLOAD_MAX_BYTES) return null;
  return { action: v.action, expectedActorId, submissionId, uploadId, evidenceType: v.evidenceType as typeof types[number], fileName: serviceEvidenceFilename(v.fileName), mimeType: v.mimeType, size: v.size };
}
export function serviceEvidenceStoragePath(submissionId: string, actorId: string, uploadId: string, mimeType: string): string {
  const submission = cleanServiceEvidenceUploadId(submissionId), actor = cleanServiceEvidenceUploadId(actorId), upload = cleanServiceEvidenceUploadId(uploadId);
  return submission && actor && upload && Object.hasOwn(extensions, mimeType) ? `${submission}/${actor}/direct/${upload}.${extensions[mimeType]}` : "";
}
export function validServiceEvidenceSignedUploadUrl(value: unknown, supabaseUrl: string, storagePath: string): boolean {
  if (typeof value !== "string" || value.length > 10000 || !storagePath) return false;
  try {
    const expected = new URL(supabaseUrl), actual = new URL(value);
    return expected.protocol === "https:" && expected.pathname === "/" && !expected.username && !expected.password && !expected.search && !expected.hash
      && actual.protocol === "https:" && actual.origin === expected.origin && !actual.username && !actual.password && !actual.hash
      && actual.pathname === `/storage/v1/object/upload/sign/${SERVICE_EVIDENCE_UPLOAD_BUCKET}/${storagePath}`
      && actual.searchParams.getAll("token").length === 1 && Boolean(actual.searchParams.get("token"))
      && [...actual.searchParams.keys()].every(key => key === "token");
  } catch { return false; }
}
