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
type UploadIdentity = {
  protocolVersion: 2; expectedActorId: string; submissionId: string; uploadId: string;
};
export type ServiceEvidenceUpload = UploadIdentity & ({
  action: "prepare"; expectedRevision: string;
  evidenceType: typeof types[number]; fileName: string; mimeType: string; size: number;
} | { action: "complete" | "discard"; expectedRevision: string | null });
/** Postgres bigint revisions cross JSON as strings, including beyond JS safe integers. */
export function cleanServiceEvidenceRevision(value: unknown): string | null {
  return typeof value === "string" && /^(0|[1-9][0-9]{0,18})$/.test(value)
    && (value.length < 19 || value <= "9223372036854775807") ? value : null;
}
function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));
}
/** Exact control fields only; the name is display metadata, never a storage path. */
export function normalizeServiceEvidenceUpload(value: unknown): ServiceEvidenceUpload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const keys = ["protocolVersion", "action", "expectedActorId", "submissionId", "uploadId", "expectedRevision"];
  if (v.action === "prepare") keys.push("evidenceType", "fileName", "mimeType", "size");
  if (!exactKeys(v, keys) || v.protocolVersion !== 2) return null;
  const expectedActorId = cleanServiceEvidenceUploadId(v.expectedActorId), submissionId = cleanServiceEvidenceUploadId(v.submissionId), uploadId = cleanServiceEvidenceUploadId(v.uploadId);
  const expectedRevision = cleanServiceEvidenceRevision(v.expectedRevision);
  if (!expectedActorId || !submissionId || !uploadId || (expectedRevision === null && v.expectedRevision !== null)) return null;
  if (v.action === "complete" || v.action === "discard") return { protocolVersion: 2, action: v.action, expectedActorId, submissionId, uploadId, expectedRevision };
  if (v.action !== "prepare" || expectedRevision === null
    || !types.includes(v.evidenceType as typeof types[number]) || typeof v.fileName !== "string" || !v.fileName.trim() || v.fileName.length > 1024
    || typeof v.mimeType !== "string" || !Object.hasOwn(extensions, v.mimeType)
    || typeof v.size !== "number" || !Number.isSafeInteger(v.size) || v.size < 1 || v.size > SERVICE_EVIDENCE_UPLOAD_MAX_BYTES) return null;
  return { protocolVersion: 2, action: v.action, expectedActorId, submissionId, uploadId, expectedRevision, evidenceType: v.evidenceType as typeof types[number], fileName: serviceEvidenceFilename(v.fileName), mimeType: v.mimeType, size: v.size };
}

export type ServiceEvidenceUploadReceipt = {
  uploadId: string; submissionId: string; actorId: string; expectedRevision: string | null;
  state: "prepared" | "committed" | "deleted" | "discarded";
  bucket: "service-evidence"; storagePath: string | null;
  metadata: { evidence_type: typeof types[number]; file_name: string; mime_type: string; file_size_bytes: number } | null;
  evidence: { id: string; type: typeof types[number]; fileName: string; mimeType: string; fileSizeBytes: number; createdAt: string } | null;
  storageState: "missing" | "matching" | "mismatch" | "not_applicable";
  preparedAt: string | null; committedAt: string | null; deletedAt: string | null; discardedAt: string | null;
  canFinish: boolean; canDiscard: boolean;
};
export type ServiceEvidenceUploadDiscovery = {
  ok: true; protocolVersion: 2; actorId: string; submissionId: string; revision: string;
  pendingCount: number; pending: ServiceEvidenceUploadReceipt | null; latest: ServiceEvidenceUploadReceipt | null;
  requested: ServiceEvidenceUploadReceipt | null; canPrepare: boolean;
};
type ReceiptBinding = { actorId: string; submissionId: string; uploadId?: string; expectedRevision?: string | null };
function timestamp(value: unknown): value is string {
  return typeof value === "string" && value.length <= 64 && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
}
/** Validate all identities and state invariants; return only the documented safe DTO. */
export function parseServiceEvidenceUploadReceipt(value: unknown, binding?: ReceiptBinding): ServiceEvidenceUploadReceipt | null {
  const r = record(value);
  if (!r || !exactKeys(r, ["uploadId", "submissionId", "actorId", "expectedRevision", "state", "bucket", "storagePath", "metadata", "evidence", "storageState", "preparedAt", "committedAt", "deletedAt", "discardedAt", "canFinish", "canDiscard"])) return null;
  const actorId = cleanServiceEvidenceUploadId(r.actorId), submissionId = cleanServiceEvidenceUploadId(r.submissionId), uploadId = cleanServiceEvidenceUploadId(r.uploadId);
  if (!actorId || !submissionId || !uploadId || r.actorId !== actorId || r.submissionId !== submissionId || r.uploadId !== uploadId
    || (binding && (actorId !== binding.actorId || submissionId !== binding.submissionId || (binding.uploadId !== undefined && uploadId !== binding.uploadId)
      || (Object.hasOwn(binding, "expectedRevision") && r.expectedRevision !== binding.expectedRevision)))
    || (r.expectedRevision !== null && cleanServiceEvidenceRevision(r.expectedRevision) === null)
    || r.bucket !== SERVICE_EVIDENCE_UPLOAD_BUCKET || !["prepared", "committed", "deleted", "discarded"].includes(r.state as string)
    || !["missing", "matching", "mismatch", "not_applicable"].includes(r.storageState as string)
    || typeof r.canFinish !== "boolean" || typeof r.canDiscard !== "boolean"
    || [r.preparedAt, r.committedAt, r.deletedAt, r.discardedAt].some(v => v !== null && !timestamp(v))) return null;
  let metadata: ServiceEvidenceUploadReceipt["metadata"] = null;
  if (r.metadata !== null) {
    const m = record(r.metadata);
    if (!m || !exactKeys(m, ["evidence_type", "file_name", "mime_type", "file_size_bytes"])) return null;
    const normalized = normalizeServiceEvidenceUpload({ protocolVersion: 2, action: "prepare", expectedActorId: actorId, submissionId, uploadId, expectedRevision: "0",
      evidenceType: m.evidence_type, fileName: m.file_name, mimeType: m.mime_type, size: m.file_size_bytes });
    if (!normalized || normalized.action !== "prepare" || normalized.fileName !== m.file_name
      || r.storagePath !== serviceEvidenceStoragePath(submissionId, actorId, uploadId, normalized.mimeType)) return null;
    metadata = { evidence_type: normalized.evidenceType, file_name: normalized.fileName, mime_type: normalized.mimeType, file_size_bytes: normalized.size };
  } else if (r.storagePath !== null || r.preparedAt !== null || r.expectedRevision === null || r.state !== "discarded") return null;
  let evidence: ServiceEvidenceUploadReceipt["evidence"] = null;
  if (r.evidence !== null) {
    const e = record(r.evidence);
    if (!e || !metadata || !exactKeys(e, ["id", "type", "fileName", "mimeType", "fileSizeBytes", "createdAt"])
      || !cleanServiceEvidenceUploadId(e.id) || e.id !== cleanServiceEvidenceUploadId(e.id) || e.type !== metadata.evidence_type
      || e.fileName !== metadata.file_name || e.mimeType !== metadata.mime_type || e.fileSizeBytes !== metadata.file_size_bytes || !timestamp(e.createdAt)) return null;
    evidence = { id: e.id as string, type: metadata.evidence_type, fileName: metadata.file_name, mimeType: metadata.mime_type, fileSizeBytes: metadata.file_size_bytes, createdAt: e.createdAt };
  }
  if (metadata && !timestamp(r.preparedAt)) return null;
  if (r.state === "prepared") {
    if (!metadata || evidence || r.committedAt !== null || r.deletedAt !== null || r.discardedAt !== null || r.storageState === "not_applicable") return null;
    if (r.canFinish && (r.storageState !== "matching" || !r.canDiscard)) return null;
  } else {
    if (r.canFinish || r.canDiscard || r.storageState !== "not_applicable") return null;
    if (r.state === "discarded") {
      if (evidence || r.committedAt !== null || r.deletedAt !== null || !timestamp(r.discardedAt)) return null;
    } else if (!metadata || !timestamp(r.committedAt) || r.discardedAt !== null
      || (r.state === "committed" && (!evidence || r.deletedAt !== null))
      || (r.state === "deleted" && (!timestamp(r.deletedAt) || evidence !== null))) return null;
  }
  return { uploadId, submissionId, actorId, expectedRevision: r.expectedRevision as string | null, state: r.state as ServiceEvidenceUploadReceipt["state"],
    bucket: SERVICE_EVIDENCE_UPLOAD_BUCKET, storagePath: r.storagePath as string | null, metadata, evidence,
    storageState: r.storageState as ServiceEvidenceUploadReceipt["storageState"], preparedAt: r.preparedAt as string | null, committedAt: r.committedAt as string | null,
    deletedAt: r.deletedAt as string | null, discardedAt: r.discardedAt as string | null, canFinish: r.canFinish, canDiscard: r.canDiscard };
}
export function parseServiceEvidenceUploadDiscovery(value: unknown, binding: Omit<ReceiptBinding, "expectedRevision">): ServiceEvidenceUploadDiscovery | null {
  const r = record(value);
  if (!r || !exactKeys(r, ["ok", "protocolVersion", "actorId", "submissionId", "revision", "pendingCount", "pending", "latest", "requested", "canPrepare"])
    || r.ok !== true || r.protocolVersion !== 2 || r.actorId !== binding.actorId || r.submissionId !== binding.submissionId
    || cleanServiceEvidenceRevision(r.revision) === null || !Number.isSafeInteger(r.pendingCount) || (r.pendingCount as number) < 0 || typeof r.canPrepare !== "boolean") return null;
  const scope = { actorId: binding.actorId, submissionId: binding.submissionId };
  const pending = r.pending === null ? null : parseServiceEvidenceUploadReceipt(r.pending, scope);
  const latest = r.latest === null ? null : parseServiceEvidenceUploadReceipt(r.latest, scope);
  const requested = r.requested === null ? null : parseServiceEvidenceUploadReceipt(r.requested, binding);
  if ((r.pending !== null && !pending) || (r.latest !== null && !latest) || (r.requested !== null && !requested)
    || (r.pendingCount === 0 ? pending !== null : !pending || pending.state !== "prepared")
    || (pending && !latest) || (!binding.uploadId && requested) || (r.canPrepare && r.pendingCount !== 0)
    || [pending, latest, requested].some(receipt => receipt?.expectedRevision !== null && receipt?.expectedRevision !== undefined
      && BigInt(receipt.expectedRevision) >= BigInt(r.revision as string))) return null;
  return { ok: true, protocolVersion: 2, ...scope, revision: r.revision as string, pendingCount: r.pendingCount as number, pending, latest, requested, canPrepare: r.canPrepare };
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
