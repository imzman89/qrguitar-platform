import { createHash, randomUUID } from "node:crypto";
import { exactObject, uuid, validRevision, validTimestamp } from "./intake-service";

export const fulfillmentBlockers = [
  "administrator_account", "unused_paid_credits", "unresolved_payment_order", "payment_hold_or_dispute",
  "billing_retention_review_required", "unused_profile_credits", "storage_cleanup_required",
  "storage_quiescence_required",
  "active_ownership_transfer", "active_ownership_claim", "active_service_workflow", "service_history_privacy_review_required",
  "profile_history_privacy_review_required",
  "retained_personal_content_review_required"
] as const;
export type FulfillmentBlocker = typeof fulfillmentBlockers[number];
export type FulfillmentState = "blocked" | "quiescing_storage" | "ready_for_auth_deletion" | "completed";
export type FulfillmentDto = {
  requestId: string; state: FulfillmentState; blockers: FulfillmentBlocker[]; revision: string;
  startedAt: string; reviewedAt: string; storageQuiesceUntil: string | null;
  databaseAnonymizedAt: string | null; authDeletedAt: string | null; completedAt: string | null;
};
export type ProfileReviewDto = {
  guitarId: string; qrCode: string; permanentPath: string; relationshipCodes: string[]; policyVersion: 1;
  contentFingerprint: string; attested: boolean; attestedAt: string | null;
};
export type RetentionReviewDto = {
  domain: "billing" | "service"; policyVersion: 1; contentFingerprint: string; required: boolean;
  decisionCode: "lawful_financial_retention_reviewed" | "service_history_privacy_reviewed" | null;
  attested: boolean; attestedAt: string | null;
};
export type StorageReviewDto = {
  relocationId: string; bucket: "instrument-media" | "instrument-documents" | "service-evidence";
  disposition: "retain" | "delete"; sourceSize: number | null; sourceMimeType: string | null;
  sourceFingerprint: string; reviewRequired: boolean; decision: "retain" | "delete" | null;
  byteSha256: string | null; reviewedAt: string | null;
  state: "planned" | "copy_authorized" | "deletion_authorized" | "references_updated";
};
export type ReviewJson = null | boolean | number | string | ReviewJson[] | { [key: string]: ReviewJson };
export type ReviewSectionDto = { code: string; label: string; recordCount: number; contentDigest: string; records: ReviewJson[] };
export type ReviewSnapshotDto =
  | { kind: "profile"; policyVersion: 1; contentFingerprint: string; truncated: boolean; pageIndex:number; pageCount:number; pageDigest:string; deliveredPages:number; allPagesDelivered:boolean;
      profile: { guitarId: string; qrCode: string; relationshipCodes: string[]; sections: ReviewSectionDto[] } }
  | { kind: "retention"; policyVersion: 1; contentFingerprint: string; truncated: boolean; pageIndex:number; pageCount:number; pageDigest:string; deliveredPages:number; allPagesDelivered:boolean;
      retention: { domain: "billing" | "service"; sections: ReviewSectionDto[] } };
export type FulfillmentSnapshot = {
  fulfillment: FulfillmentDto | null; profileReviews: ProfileReviewDto[]; retentionReviews: RetentionReviewDto[];
  storageReviews: StorageReviewDto[];
};
export type FulfillmentAction =
  | { action: "prepare"; operationId: string }
  | { action: "attest_profile"; operationId: string; guitarId: string; expectedFingerprint: string }
  | { action: "attest_retention"; operationId: string; domain: "billing" | "service"; expectedFingerprint: string;
      decisionCode: "lawful_financial_retention_reviewed" | "service_history_privacy_reviewed" }
  | { action: "inspect_profile"; operationId: string; guitarId: string; expectedFingerprint: string; pageIndex:number }
  | { action: "inspect_retention"; operationId: string; domain: "billing" | "service"; expectedFingerprint: string; pageIndex:number }
  | { action: "redact_profile"; operationId: string; guitarId: string; expectedFingerprint: string; terms: string[] }
  | { action: "attest_storage"; operationId: string; relocationId: string; expectedFingerprint: string; decision: "retain" | "delete" }
  | { action: "inspect_custody"; operationId:string; claimId:string; expectedFingerprint:string; pageIndex:number }
  | { action: "attest_custody_evidence"; operationId:string; claimId:string; evidenceId:string; expectedFingerprint:string; expectedObjectFingerprint:string; pageIndex:number }
  | { action: "release_custody"; operationId: string; claimId: string; expectedFingerprint: string };

type RpcError = { code?: string; message?: string } | null;
type StorageError = { code?: string; error?: string; message?: string; status?: number; statusCode?: number | string } | null;
type StorageDownload = { arrayBuffer(): Promise<ArrayBuffer>; size?: number; type?: string };
type StorageBucket = {
  download(path: string): PromiseLike<{ data: StorageDownload | null; error: StorageError }>;
  upload(path: string, body: Uint8Array, options: { contentType: string; upsert: true;
    metadata: { sha256: string; accountDeletionRelocationId: string } }): PromiseLike<{ data?: unknown; error: StorageError }>;
  remove(paths: string[]): PromiseLike<{ data?: unknown; error: StorageError }>;
};
type AdminClient = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: RpcError }>;
  auth: { admin: { deleteUser(id: string): PromiseLike<{ data?: unknown; error: { code?: string; status?: number; message?: string } | null }> } };
  storage: { from(bucket: string): StorageBucket };
};
type AdminGate = (request: Request) => PromiseLike<
  { ok: true; supabase: AdminClient; admin: { user: { id: string; email?: string | null } | null; accessSource?: string; accountStatus: string } } |
  { ok: false; response: Response }
>;
export type FulfillmentDependencies = {
  requireAdmin: AdminGate;
  protectedAdminEmails?: () => string[];
  randomId?: () => string;
  timeoutMs?: number;
};

export class FulfillmentError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly retryable = false) { super(message); }
}

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const validTime = (value: unknown): value is string => typeof value === "string" && validTimestamp(value);
const nullableTime = (value: unknown): value is string | null => value === null || validTime(value);
const fingerprint = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
function memberMediaPath(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = value.match(/^([^/]+)\/([^/]+)\/([^/]+)\/([^/.]+)\.(jpg|png|webp|gif|mp4|webm)$/i);
  return Boolean(match && match.slice(1, 5).every(uuid));
}
const safeText = (value: unknown, max: number): value is string => typeof value === "string" && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
const relationshipCodes = new Set([
  "current_owner", "safety_author", "owner_removal_author", "archive_author", "transfer_from_owner", "transfer_recipient",
  "claim_participant", "claim_evidence_author", "claim_event_author", "document_author", "external_media_author", "serial_author",
  "timeline_author", "service_access", "service_participant", "service_evidence_author", "service_activity_author",
  "service_notification_recipient", "service_upload_author", "service_upload_scope", "service_discard_receipt", "create_receipt",
  "staged_upload", "site_content"
]);
const profileSectionCodes = new Set(["guitar", "redirects", "specs", "media", "documents", "externalMedia", "serialAliases", "timeline",
  "transfers", "claims", "claimEvidence", "claimEvents", "serviceAccess", "serviceSubmissions", "serviceEvidence", "serviceTokens",
  "serviceActivity", "serviceNotifications", "serviceUploads", "serviceUploadScopes", "serviceDiscardReceipts", "createReceipts",
  "stagedUploads", "siteContent"]);
const retentionSectionCodes = {
  billing: new Set(["customers", "orders", "receipts", "grants", "consumptions", "holds", "decisions", "promotions", "directOrders", "directClaims",
    "directPayments", "providerReferences", "paypalOrders", "paypalBindings", "webhookDeliveries", "webhookPayloads", "webhookOutcomes", "webhookActions"]),
  service: new Set(["submissions", "evidence", "uploads", "discards", "activity", "timeline"])
};
const forbiddenReviewKeys = new Set(["authActorId", "owner_id", "subject_id", "operator_id", "operator_subject_id", "provider_user_id",
  "provider_subject_id", "owner_user_id", "owner_subject_id", "uploaded_by_user_id", "uploaded_by_subject_id", "actor_user_id",
  "actor_subject_id", "actor_id", "created_by_user_id", "created_by_subject_id", "evidence_reviewed_by",
  "evidence_reviewed_by_subject_id", "recipient_user_id", "storage_path", "evidence_result", "ownerScope"]);
const retentionDecision = (domain: "billing" | "service") => domain === "billing"
  ? "lawful_financial_retention_reviewed" as const : "service_history_privacy_reviewed" as const;
const relocationBuckets = {
  "instrument-media": new Set(["image/jpeg", "image/png", "image/webp"]),
  "instrument-documents": new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
  "service-evidence": new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"])
} as const;
type RelocationBucket = keyof typeof relocationBuckets;
type StorageRelocation = {
  relocationId: string; bucket: RelocationBucket; sourcePath: string; disposition: "retain" | "delete"; destinationPath: string | null;
  sourceSize: number | null; sourceMimeType: string | null; sourceFingerprint: string;
  contentReviewRequired: boolean; contentReviewDecision: "retain" | "delete" | null; contentReviewedAt: string | null;
  state: "planned" | "copy_authorized" | "deletion_authorized" | "references_updated";
  byteSha256: string | null; authorizationOperationId: string | null;
};
type PreparedFulfillment = { fulfillment: FulfillmentDto; profileReviews: ProfileReviewDto[]; retentionReviews: RetentionReviewDto[];
  storageReviews: StorageReviewDto[]; storageRelocations: StorageRelocation[]; authActorId: string | null };
export type StorageInspection = { bytes: Uint8Array; mimeType: string; byteSize: number; byteSha256: string; sourceFingerprint: string;
  structureValid: boolean; metadataFindings: string[]; safeToRetain: boolean };
export type CustodyEvidenceItem = { evidenceId:string; objectFingerprint:string; byteSize:number; mimeType:string;
  reviewed:boolean; byteSha256:string|null; reviewedAt:string|null };
export type CustodyEvidenceInventory = { claimId:string; guitarId:string; profileFingerprint:string; inventoryFingerprint:string; pageIndex:number; pageCount:number; evidenceCount:number; reviewedCount:number; evidence:CustodyEvidenceItem[] };
export type CustodyInspection = StorageInspection & { claimId:string; evidenceId:string; objectFingerprint:string };
const storageRelocationLimit = 8;
const maxStorageReviewBytes = 16 * 1024 * 1024;

function profileReviewDto(value: unknown): ProfileReviewDto {
  if (!exactObject(value, ["guitarId", "qrCode", "permanentPath", "relationshipCodes", "policyVersion", "contentFingerprint", "attested", "attestedAt"])
    || !uuid(value.guitarId) || !safeText(value.qrCode, 200) || !safeText(value.permanentPath, 500) || !value.permanentPath.startsWith("/i/")
    || !Array.isArray(value.relationshipCodes) || value.relationshipCodes.length < 1 || value.relationshipCodes.length > 32
    || value.relationshipCodes.some(code => typeof code !== "string" || !relationshipCodes.has(code))
    || new Set(value.relationshipCodes).size !== value.relationshipCodes.length || value.policyVersion !== 1
    || !fingerprint(value.contentFingerprint) || typeof value.attested !== "boolean" || !nullableTime(value.attestedAt)
    || value.attested !== (value.attestedAt !== null)) {
    throw new FulfillmentError(503, "fulfillment_unavailable", "Deletion review details could not be verified. Try again.", true);
  }
  return { guitarId: value.guitarId.toLowerCase(), qrCode: value.qrCode, permanentPath: value.permanentPath,
    relationshipCodes: [...value.relationshipCodes], policyVersion: 1, contentFingerprint: value.contentFingerprint,
    attested: value.attested, attestedAt: value.attestedAt };
}

function retentionReviewDto(value: unknown): RetentionReviewDto {
  if (!exactObject(value, ["domain", "policyVersion", "contentFingerprint", "required", "decisionCode", "attested", "attestedAt"])
    || !["billing", "service"].includes(String(value.domain)) || value.policyVersion !== 1 || !fingerprint(value.contentFingerprint)
    || typeof value.required !== "boolean" || typeof value.attested !== "boolean" || !nullableTime(value.attestedAt)) {
    throw new FulfillmentError(503, "fulfillment_unavailable", "Deletion review details could not be verified. Try again.", true);
  }
  const domain = value.domain as "billing" | "service", decision = retentionDecision(domain);
  if ((!value.required && value.attested) || value.attested !== (value.attestedAt !== null) || (value.attested ? value.decisionCode !== decision : value.decisionCode !== null)) {
    throw new FulfillmentError(503, "fulfillment_unavailable", "Deletion review details could not be verified. Try again.", true);
  }
  return { domain, policyVersion: 1, contentFingerprint: value.contentFingerprint, required: value.required, decisionCode: value.decisionCode as RetentionReviewDto["decisionCode"],
    attested: value.attested, attestedAt: value.attestedAt };
}

function storageReviewDto(value: unknown): StorageReviewDto {
  if (!exactObject(value, ["relocationId", "bucket", "disposition", "sourceSize", "sourceMimeType", "sourceFingerprint",
    "reviewRequired", "decision", "byteSha256", "reviewedAt", "state"])
    || !uuid(value.relocationId) || !Object.hasOwn(relocationBuckets, String(value.bucket))
    || !["retain", "delete"].includes(String(value.disposition))
    || (value.sourceSize !== null && (!Number.isSafeInteger(value.sourceSize) || Number(value.sourceSize) < 0 || Number(value.sourceSize) > maxStorageReviewBytes))
    || (value.sourceMimeType !== null && (!safeText(value.sourceMimeType, 200)
      || !relocationBuckets[value.bucket as RelocationBucket].has(value.sourceMimeType as never)))
    || !fingerprint(value.sourceFingerprint) || typeof value.reviewRequired !== "boolean"
    || ![null, "retain", "delete"].includes(value.decision as null | string)
    || (value.byteSha256 !== null && !fingerprint(value.byteSha256)) || !nullableTime(value.reviewedAt)
    || !["planned", "copy_authorized", "deletion_authorized", "references_updated"].includes(String(value.state))) throw mapped(null);
  const decision = value.decision as "retain" | "delete" | null;
  if ((decision === null) !== (value.byteSha256 === null) || (decision === null) !== (value.reviewedAt === null)
    || value.reviewRequired !== (value.disposition === "retain")
    || (decision !== null && decision !== value.disposition)
    || (value.state === "copy_authorized" && (value.disposition !== "retain" || decision !== "retain"))
    || (value.state === "deletion_authorized" && value.disposition !== "delete")
    || (value.state === "references_updated" && (value.disposition !== "retain" || decision !== "retain"))) throw mapped(null);
  return { relocationId: value.relocationId.toLowerCase(), bucket: value.bucket as RelocationBucket,
    disposition: value.disposition as "retain" | "delete", sourceSize: value.sourceSize as number | null,
    sourceMimeType: value.sourceMimeType as string | null, sourceFingerprint: value.sourceFingerprint,
    reviewRequired: value.reviewRequired, decision, byteSha256: value.byteSha256 as string | null,
    reviewedAt: value.reviewedAt as string | null, state: value.state as StorageReviewDto["state"] };
}

function storageReviews(value: unknown): StorageReviewDto[] {
  if (!Array.isArray(value) || value.length > 10_000) throw mapped(null);
  const rows = value.map(storageReviewDto);
  if (new Set(rows.map(row => row.relocationId)).size !== rows.length) throw mapped(null);
  return rows;
}

function reviews(value: unknown, kind: "profile" | "retention") {
  if (!Array.isArray(value)) throw new FulfillmentError(503, "fulfillment_unavailable", "Deletion review details could not be verified. Try again.", true);
  const parsed = kind === "profile" ? value.map(profileReviewDto) : value.map(retentionReviewDto);
  const identities = parsed.map(row => kind === "profile" ? (row as ProfileReviewDto).guitarId : (row as RetentionReviewDto).domain);
  if (new Set(identities).size !== identities.length) throw new FulfillmentError(503, "fulfillment_unavailable", "Deletion review details could not be verified. Try again.", true);
  return parsed;
}

function storageRelocationDto(value: unknown): StorageRelocation {
  if (!exactObject(value, ["relocationId", "bucket", "sourcePath", "disposition", "destinationPath", "sourceSize", "sourceMimeType",
    "sourceFingerprint", "contentReviewRequired", "contentReviewDecision", "contentReviewedAt", "state", "byteSha256", "authorizationOperationId"])
    || !uuid(value.relocationId) || !Object.hasOwn(relocationBuckets, String(value.bucket))
    || !safeText(value.sourcePath, 1024) || value.sourcePath.startsWith("/")
    || !["retain", "delete"].includes(String(value.disposition))
    || (value.destinationPath !== null && (!safeText(value.destinationPath, 1024) || value.sourcePath === value.destinationPath))
    || (value.sourceSize !== null && (!Number.isSafeInteger(value.sourceSize) || Number(value.sourceSize) < 0 || Number(value.sourceSize) > maxStorageReviewBytes))
    || (value.sourceMimeType !== null && (!safeText(value.sourceMimeType, 200)
      || !relocationBuckets[value.bucket as RelocationBucket].has(value.sourceMimeType as never)))
    || !fingerprint(value.sourceFingerprint) || typeof value.contentReviewRequired !== "boolean"
    || ![null, "retain", "delete"].includes(value.contentReviewDecision as null | string) || !nullableTime(value.contentReviewedAt)
    || !["planned", "copy_authorized", "deletion_authorized", "references_updated"].includes(String(value.state))) throw mapped(null);
  const destination = value.destinationPath === null ? null : value.destinationPath.match(/^account-deletion\/([^/]+)\/([a-f0-9]{64})$/);
  const authorized = value.state !== "planned";
  if ((value.disposition === "retain" ? !destination || !uuid(destination[1]) : value.destinationPath !== null)
    || (value.disposition === "retain" && !["planned", "copy_authorized", "references_updated"].includes(String(value.state)))
    || (value.disposition === "delete" && !["planned", "deletion_authorized"].includes(String(value.state)))
    || value.contentReviewRequired !== (value.disposition === "retain" && value.contentReviewDecision === null)
    || ((value.contentReviewDecision === null) !== (value.contentReviewedAt === null))
    || (value.contentReviewDecision !== null && value.contentReviewDecision !== value.disposition)
    || (value.state === "copy_authorized" && value.contentReviewDecision !== "retain")
    || (value.state === "references_updated" && value.contentReviewDecision !== "retain")
    || (value.state === "references_updated" ? !fingerprint(value.byteSha256) : value.byteSha256 !== null)
    || (authorized ? !uuid(value.authorizationOperationId) : value.authorizationOperationId !== null)) throw mapped(null);
  return { relocationId: value.relocationId.toLowerCase(), bucket: value.bucket as RelocationBucket,
    sourcePath: value.sourcePath, disposition: value.disposition as "retain" | "delete", destinationPath: value.destinationPath as string | null,
    sourceSize: value.sourceSize as number | null, sourceMimeType: value.sourceMimeType as string | null,
    sourceFingerprint: value.sourceFingerprint, contentReviewRequired: value.contentReviewRequired,
    contentReviewDecision: value.contentReviewDecision as "retain" | "delete" | null,
    contentReviewedAt: value.contentReviewedAt as string | null, state: value.state as StorageRelocation["state"],
    byteSha256: value.byteSha256 as string | null,
    authorizationOperationId: value.authorizationOperationId === null ? null : String(value.authorizationOperationId).toLowerCase() };
}

function storageRelocations(value: unknown) {
  if (!Array.isArray(value) || value.length > 10_000) throw mapped(null);
  const rows = value.map(storageRelocationDto);
  const ids = rows.map(row => row.relocationId), sources = rows.map(row => `${row.bucket}\u0000${row.sourcePath}`),
    destinations = rows.filter(row => row.destinationPath !== null).map(row => `${row.bucket}\u0000${row.destinationPath}`);
  if (new Set(ids).size !== ids.length || new Set(sources).size !== sources.length || new Set(destinations).size !== destinations.length) throw mapped(null);
  return rows;
}

function preparedFulfillment(value: unknown, requestId: string): PreparedFulfillment {
  if (!exactObject(value, ["ok", "fulfillment", "profileReviews", "retentionReviews", "storageReviews", "storageRelocations", "authActorId"])
    || value.ok !== true) throw mapped(null);
  const fulfillment = fulfillmentDto(value.fulfillment);
  const profileReviews = reviews(value.profileReviews, "profile") as ProfileReviewDto[];
  const retentionReviews = reviews(value.retentionReviews, "retention") as RetentionReviewDto[];
  const safeStorageReviews = storageReviews(value.storageReviews), relocations = storageRelocations(value.storageRelocations);
  if (fulfillment.requestId !== requestId || (value.authActorId !== null && !uuid(value.authActorId))
    || (fulfillment.state !== "ready_for_auth_deletion" && value.authActorId !== null)
    || (relocations.length > 0 && (fulfillment.state !== "blocked" || !fulfillment.blockers.includes("storage_cleanup_required")))) throw mapped(null);
  const byId = new Map(safeStorageReviews.map(row => [row.relocationId, row]));
  for (const relocation of relocations) {
    const review = byId.get(relocation.relocationId);
    if (relocation.disposition === "retain" && (!review || review.sourceFingerprint !== relocation.sourceFingerprint
      || review.state !== relocation.state || review.decision !== relocation.contentReviewDecision)) throw mapped(null);
    if (review && (review.bucket !== relocation.bucket || review.disposition !== relocation.disposition
      || review.sourceFingerprint !== relocation.sourceFingerprint || review.state !== relocation.state
      || review.sourceSize !== relocation.sourceSize || review.sourceMimeType !== relocation.sourceMimeType
      || review.decision !== relocation.contentReviewDecision || review.reviewedAt !== relocation.contentReviewedAt)) throw mapped(null);
  }
  return { fulfillment, profileReviews, retentionReviews, storageReviews: safeStorageReviews, storageRelocations: relocations,
    authActorId: value.authActorId === null ? null : value.authActorId.toLowerCase() };
}

function authorizationReceipt(value: unknown, relocation: StorageRelocation, expectedState: "copy_authorized" | "deletion_authorized") {
  if (!exactObject(value, ["ok", "relocation"]) || value.ok !== true
    || !exactObject(value.relocation, ["relocationId", "disposition", "state"])
    || value.relocation.relocationId !== relocation.relocationId || value.relocation.disposition !== relocation.disposition
    || value.relocation.state !== expectedState) throw mapped(null);
}

function finalizeReceipt(value: unknown, relocation: StorageRelocation, expectedHash: string, expectedSize: number,
  expectedStates: ReadonlySet<"references_updated" | "completed">) {
  if (!exactObject(value, ["ok", "relocation"]) || value.ok !== true
    || !exactObject(value.relocation, ["relocationId", "state", "byteSha256", "copiedSize"])
    || value.relocation.relocationId !== relocation.relocationId || !expectedStates.has(value.relocation.state as "references_updated" | "completed")
    || value.relocation.byteSha256 !== expectedHash || !Number.isSafeInteger(value.relocation.copiedSize)
    || Number(value.relocation.copiedSize) !== expectedSize) throw mapped(null);
  return value.relocation.state as "references_updated" | "completed";
}

function completionReceipt(value: unknown, relocation: StorageRelocation, expectedHash: string | null, expectedSize: number | null) {
  if (!exactObject(value, ["ok", "relocation"]) || value.ok !== true
    || !exactObject(value.relocation, ["relocationId", "disposition", "state", "byteSha256", "copiedSize"])
    || value.relocation.relocationId !== relocation.relocationId || value.relocation.disposition !== relocation.disposition
    || value.relocation.state !== "completed" || value.relocation.byteSha256 !== expectedHash
    || value.relocation.copiedSize !== expectedSize) throw mapped(null);
}

function storageSource(value: unknown, requestRelocationId: string, expectedFingerprint: string) {
  if (!exactObject(value, ["ok", "source"]) || value.ok !== true
    || !exactObject(value.source, ["relocationId", "bucket", "sourcePath", "sourceFingerprint", "sourceSize", "sourceMimeType"])
    || value.source.relocationId !== requestRelocationId || !Object.hasOwn(relocationBuckets, String(value.source.bucket))
    || !safeText(value.source.sourcePath, 1024) || value.source.sourcePath.startsWith("/")
    || value.source.sourceFingerprint !== expectedFingerprint
    || (value.source.sourceSize !== null && (!Number.isSafeInteger(value.source.sourceSize) || Number(value.source.sourceSize) < 1
      || Number(value.source.sourceSize) > maxStorageReviewBytes))
    || typeof value.source.sourceMimeType !== "string"
    || !relocationBuckets[value.source.bucket as RelocationBucket].has(value.source.sourceMimeType as never)) throw mapped(null);
  return { relocationId: requestRelocationId, bucket: value.source.bucket as RelocationBucket, sourcePath: value.source.sourcePath,
    sourceFingerprint: expectedFingerprint, sourceSize: value.source.sourceSize as number | null, sourceMimeType: value.source.sourceMimeType };
}

function custodyEvidenceInventory(value:unknown,claimId:string,expectedFingerprint:string):CustodyEvidenceInventory {
  if(!exactObject(value,["ok","claim"])||value.ok!==true||!exactObject(value.claim,["claimId","guitarId","profileFingerprint","inventoryFingerprint","pageIndex","pageCount","evidenceCount","reviewedCount","evidence"])
    ||value.claim.claimId!==claimId||!uuid(value.claim.guitarId)||value.claim.profileFingerprint!==expectedFingerprint||!fingerprint(value.claim.inventoryFingerprint)
    ||!Number.isInteger(value.claim.pageIndex)||Number(value.claim.pageIndex)<0||!Number.isInteger(value.claim.pageCount)||Number(value.claim.pageCount)<1||Number(value.claim.pageIndex)>=Number(value.claim.pageCount)
    ||!Number.isInteger(value.claim.evidenceCount)||Number(value.claim.evidenceCount)<1||!Number.isInteger(value.claim.reviewedCount)||Number(value.claim.reviewedCount)<0||Number(value.claim.reviewedCount)>Number(value.claim.evidenceCount)
    ||!Array.isArray(value.claim.evidence)||value.claim.evidence.length<1||value.claim.evidence.length>32)throw mapped(null);
  const evidence=value.claim.evidence.map(item=>{
    if(!exactObject(item,["evidenceId","objectFingerprint","byteSize","mimeType","reviewed","byteSha256","reviewedAt"])
      ||!uuid(item.evidenceId)||!fingerprint(item.objectFingerprint)||!Number.isSafeInteger(item.byteSize)||Number(item.byteSize)<1
      ||Number(item.byteSize)>maxStorageReviewBytes||!relocationBuckets["instrument-documents"].has(item.mimeType as never)
      ||typeof item.reviewed!=="boolean"||(item.byteSha256!==null&&!fingerprint(item.byteSha256))||(item.reviewedAt!==null&&!validTime(item.reviewedAt))
      ||item.reviewed!==(item.byteSha256!==null)||item.reviewed!==(item.reviewedAt!==null))throw mapped(null);
    return{evidenceId:String(item.evidenceId).toLowerCase(),objectFingerprint:String(item.objectFingerprint),byteSize:Number(item.byteSize),
      mimeType:String(item.mimeType),reviewed:item.reviewed as boolean,byteSha256:item.byteSha256 as string|null,reviewedAt:item.reviewedAt as string|null};
  });
  if(new Set(evidence.map(item=>item.evidenceId)).size!==evidence.length||evidence.length>32||Number(value.claim.evidenceCount)>(Number(value.claim.pageCount)*32)||Number(value.claim.evidenceCount)<=((Number(value.claim.pageCount)-1)*32))throw mapped(null);
  return{claimId,guitarId:String(value.claim.guitarId).toLowerCase(),profileFingerprint:expectedFingerprint,inventoryFingerprint:String(value.claim.inventoryFingerprint),pageIndex:Number(value.claim.pageIndex),pageCount:Number(value.claim.pageCount),evidenceCount:Number(value.claim.evidenceCount),reviewedCount:Number(value.claim.reviewedCount),evidence};
}
function custodySource(value:unknown,claimId:string,evidenceId:string,expectedObjectFingerprint:string){
  if(!exactObject(value,["ok","source"])||value.ok!==true
    ||!exactObject(value.source,["claimId","evidenceId","bucket","sourcePath","objectFingerprint","sourceSize","sourceMimeType"])
    ||value.source.claimId!==claimId||value.source.evidenceId!==evidenceId||value.source.bucket!=="instrument-documents"
    ||!safeText(value.source.sourcePath,1024)||value.source.sourcePath.startsWith("/")||value.source.objectFingerprint!==expectedObjectFingerprint
    ||!Number.isSafeInteger(value.source.sourceSize)||Number(value.source.sourceSize)<1||Number(value.source.sourceSize)>maxStorageReviewBytes
    ||!relocationBuckets["instrument-documents"].has(value.source.sourceMimeType as never))throw mapped(null);
  return{bucket:"instrument-documents" as const,sourcePath:String(value.source.sourcePath),sourceSize:Number(value.source.sourceSize),
    sourceMimeType:String(value.source.sourceMimeType),objectFingerprint:expectedObjectFingerprint};
}
function storageReviewReceipt(value: unknown, action: Extract<FulfillmentAction, { action: "attest_storage" }>,
  expectedHash: string, expectedSize: number, expectedMime: string) {
  if (!exactObject(value, ["ok", "review", "storageReviews"]) || value.ok !== true
    || !exactObject(value.review, ["relocationId", "sourceFingerprint", "byteSha256", "byteSize", "mimeType", "decision", "reviewedAt"])
    || value.review.relocationId !== action.relocationId || value.review.sourceFingerprint !== action.expectedFingerprint
    || value.review.byteSha256 !== expectedHash || value.review.byteSize !== expectedSize || value.review.mimeType !== expectedMime
    || value.review.decision !== action.decision || !validTime(value.review.reviewedAt)) throw mapped(null);
  const rows = storageReviews(value.storageReviews), row = rows.find(item => item.relocationId === action.relocationId);
  if (!row || row.sourceFingerprint !== action.expectedFingerprint || row.decision !== action.decision
    || row.byteSha256 !== expectedHash || row.reviewedAt !== value.review.reviewedAt) throw mapped(null);
  return rows;
}

function reviewJson(value: unknown, budget: { nodes: number }, depth = 0): ReviewJson {
  if (++budget.nodes > 50_000 || depth > 12) throw mapped(null);
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(item => reviewJson(item, budget, depth + 1));
  if (!object(value)) throw mapped(null);
  const result: { [key: string]: ReviewJson } = {};
  for (const [key, item] of Object.entries(value)) {
    if (!key || key.length > 120 || forbiddenReviewKeys.has(key)
      || /(^|_)(token|secret|signature|hash)(_|$)/i.test(key)) throw mapped(null);
    result[key] = reviewJson(item, budget, depth + 1);
  }
  return result;
}

function reviewSections(value: unknown, expected: Set<string>, truncated: boolean, pageCount=1): ReviewSectionDto[] {
  if (!Array.isArray(value) || value.length !== expected.size) throw mapped(null);
  const seen = new Set<string>(), budget = { nodes: 0 }; let total = 0;
  const sections = value.map(section => {
    if (!exactObject(section, ["code", "label", "recordCount", "contentDigest", "records"])
      || typeof section.code !== "string" || !expected.has(section.code) || seen.has(section.code)
      || !safeText(section.label, 100) || !Number.isInteger(section.recordCount) || Number(section.recordCount) < 0
      || Number(section.recordCount) > 1_000_000 || !fingerprint(section.contentDigest) || !Array.isArray(section.records)) throw mapped(null);
    seen.add(section.code); total += Number(section.recordCount);
    if ((truncated && section.records.length !== 0) || (!truncated && (section.records.length > Number(section.recordCount) || (pageCount===1 && section.records.length !== Number(section.recordCount))))) throw mapped(null);
    return { code: section.code, label: section.label, recordCount: Number(section.recordCount), contentDigest: section.contentDigest,
      records: section.records.map(record => reviewJson(record, budget)) };
  });
  if ([...expected].some(code => !seen.has(code)) || (!truncated && pageCount===1 && total > 500)) throw mapped(null);
  return sections;
}

function reviewSnapshotDto(value: unknown, action: Extract<FulfillmentAction, { action: "inspect_profile" | "inspect_retention" }>): ReviewSnapshotDto {
  if (!object(value) || value.ok !== true || value.policyVersion !== 1 || value.contentFingerprint !== action.expectedFingerprint
    || typeof value.truncated !== "boolean" || !Number.isInteger(value.pageIndex) || Number(value.pageIndex)<0
    || !Number.isInteger(value.pageCount)||Number(value.pageCount)<1||Number(value.pageCount)>20_000||Number(value.pageIndex)>=Number(value.pageCount)
    || !fingerprint(value.pageDigest)||!Number.isInteger(value.deliveredPages)||Number(value.deliveredPages)<1||Number(value.deliveredPages)>Number(value.pageCount)
    || typeof value.allPagesDelivered!=="boolean"||value.allPagesDelivered!==(value.deliveredPages===value.pageCount)||action.pageIndex!==value.pageIndex) throw mapped(null);
  if (action.action === "inspect_profile") {
    if (!exactObject(value, ["ok", "kind", "policyVersion", "contentFingerprint", "truncated", "pageIndex", "pageCount", "pageDigest", "deliveredPages", "allPagesDelivered", "profile"]) || value.kind !== "profile"
      || !exactObject(value.profile, ["guitarId", "qrCode", "relationshipCodes", "sections"]) || value.profile.guitarId !== action.guitarId
      || !safeText(value.profile.qrCode, 200) || !Array.isArray(value.profile.relationshipCodes)
      || value.profile.relationshipCodes.length < 1 || value.profile.relationshipCodes.length > 32
      || value.profile.relationshipCodes.some(code => typeof code !== "string" || !relationshipCodes.has(code))
      || new Set(value.profile.relationshipCodes).size !== value.profile.relationshipCodes.length) throw mapped(null);
    return { kind: "profile", policyVersion: 1, contentFingerprint: action.expectedFingerprint, truncated: value.truncated, pageIndex:Number(value.pageIndex),pageCount:Number(value.pageCount),pageDigest:String(value.pageDigest),deliveredPages:Number(value.deliveredPages),allPagesDelivered:Boolean(value.allPagesDelivered),
      profile: { guitarId: action.guitarId, qrCode: value.profile.qrCode, relationshipCodes: [...value.profile.relationshipCodes],
        sections: reviewSections(value.profile.sections, profileSectionCodes, value.truncated,Number(value.pageCount)) } };
  }
  if (!exactObject(value, ["ok", "kind", "policyVersion", "contentFingerprint", "truncated", "pageIndex", "pageCount", "pageDigest", "deliveredPages", "allPagesDelivered", "retention"]) || value.kind !== "retention"
    || !exactObject(value.retention, ["domain", "sections"]) || value.retention.domain !== action.domain) throw mapped(null);
  return { kind: "retention", policyVersion: 1, contentFingerprint: action.expectedFingerprint, truncated: value.truncated, pageIndex:Number(value.pageIndex),pageCount:Number(value.pageCount),pageDigest:String(value.pageDigest),deliveredPages:Number(value.deliveredPages),allPagesDelivered:Boolean(value.allPagesDelivered),
    retention: { domain: action.domain, sections: reviewSections(value.retention.sections, retentionSectionCodes[action.domain], value.truncated,Number(value.pageCount)) } };
}

function snapshot(value: unknown, requestId: string): FulfillmentSnapshot {
  if (!exactObject(value, ["ok", "fulfillment", "profileReviews", "retentionReviews", "storageReviews"]) || value.ok !== true) throw mapped(null);
  const fulfillment = value.fulfillment === null ? null : fulfillmentDto(value.fulfillment);
  if (fulfillment && fulfillment.requestId !== requestId) throw mapped(null);
  return { fulfillment, profileReviews: reviews(value.profileReviews, "profile") as ProfileReviewDto[],
    retentionReviews: reviews(value.retentionReviews, "retention") as RetentionReviewDto[], storageReviews: storageReviews(value.storageReviews) };
}

function actionDto(value: unknown): FulfillmentAction {
  if (!object(value) || !uuid(value.operationId)) throw new FulfillmentError(400, "invalid_request", "A valid review operation is required.");
  const operationId = value.operationId.toLowerCase();
  if (value.action === "prepare" && exactObject(value, ["operationId", "action"])) return { action: "prepare", operationId };
  if (value.action === "attest_profile" && exactObject(value, ["operationId", "action", "guitarId", "expectedFingerprint"])
    && uuid(value.guitarId) && fingerprint(value.expectedFingerprint)) {
    return { action: "attest_profile", operationId, guitarId: value.guitarId.toLowerCase(), expectedFingerprint: value.expectedFingerprint };
  }
  if (value.action === "attest_retention" && exactObject(value, ["operationId", "action", "domain", "expectedFingerprint", "decisionCode"])
    && ["billing", "service"].includes(String(value.domain)) && fingerprint(value.expectedFingerprint)) {
    const domain = value.domain as "billing" | "service", decisionCode = retentionDecision(domain);
    if (value.decisionCode === decisionCode) return { action: "attest_retention", operationId, domain, expectedFingerprint: value.expectedFingerprint, decisionCode };
  }
  if (value.action === "inspect_profile" && exactObject(value, ["operationId", "action", "guitarId", "expectedFingerprint", "pageIndex"])
    && uuid(value.guitarId) && fingerprint(value.expectedFingerprint)&&Number.isInteger(value.pageIndex)&&Number(value.pageIndex)>=0) {
    return { action: "inspect_profile", operationId, guitarId: value.guitarId.toLowerCase(), expectedFingerprint: value.expectedFingerprint, pageIndex:Number(value.pageIndex) };
  }
  if (value.action === "inspect_retention" && exactObject(value, ["operationId", "action", "domain", "expectedFingerprint", "pageIndex"])
    && ["billing", "service"].includes(String(value.domain)) && fingerprint(value.expectedFingerprint)&&Number.isInteger(value.pageIndex)&&Number(value.pageIndex)>=0) {
    return { action: "inspect_retention", operationId, domain: value.domain as "billing" | "service", expectedFingerprint: value.expectedFingerprint, pageIndex:Number(value.pageIndex) };
  }
  if (value.action === "redact_profile" && exactObject(value, ["operationId", "action", "guitarId", "expectedFingerprint", "terms"])
    && uuid(value.guitarId) && fingerprint(value.expectedFingerprint) && Array.isArray(value.terms)) {
    const terms = [...new Set(value.terms.map(term => typeof term === "string" ? term.trim() : ""))].sort((a, b) => a.localeCompare(b));
    if (terms.length >= 1 && terms.length <= 32 && terms.every(term => [...term].length >= 3 && [...term].length <= 200 && !/[\u0000-\u001f\u007f]/.test(term))) {
      return { action: "redact_profile", operationId, guitarId: value.guitarId.toLowerCase(), expectedFingerprint: value.expectedFingerprint, terms };
    }
  }
  if (value.action === "attest_storage" && exactObject(value, ["operationId", "action", "relocationId", "expectedFingerprint", "decision"])
    && uuid(value.relocationId) && fingerprint(value.expectedFingerprint) && ["retain", "delete"].includes(String(value.decision))) {
    return { action: "attest_storage", operationId, relocationId: value.relocationId.toLowerCase(),
      expectedFingerprint: value.expectedFingerprint, decision: value.decision as "retain" | "delete" };
  }
  if (value.action === "inspect_custody" && exactObject(value,["operationId","action","claimId","expectedFingerprint","pageIndex"])
    && uuid(value.claimId) && fingerprint(value.expectedFingerprint)&&Number.isInteger(value.pageIndex)&&Number(value.pageIndex)>=0) {
    return { action:"inspect_custody", operationId, claimId:value.claimId.toLowerCase(), expectedFingerprint:value.expectedFingerprint, pageIndex:Number(value.pageIndex) };
  }
  if (value.action === "attest_custody_evidence" && exactObject(value,["operationId","action","claimId","evidenceId","expectedFingerprint","expectedObjectFingerprint","pageIndex"])
    && uuid(value.claimId) && uuid(value.evidenceId) && fingerprint(value.expectedFingerprint) && fingerprint(value.expectedObjectFingerprint)&&Number.isInteger(value.pageIndex)&&Number(value.pageIndex)>=0) {
    return { action:"attest_custody_evidence", operationId, claimId:value.claimId.toLowerCase(), evidenceId:value.evidenceId.toLowerCase(),
      expectedFingerprint:value.expectedFingerprint, expectedObjectFingerprint:value.expectedObjectFingerprint, pageIndex:Number(value.pageIndex) };
  }
  if (value.action === "release_custody" && exactObject(value, ["operationId", "action", "claimId", "expectedFingerprint"])
    && uuid(value.claimId) && fingerprint(value.expectedFingerprint)) {
    return { action: "release_custody", operationId, claimId: value.claimId.toLowerCase(), expectedFingerprint: value.expectedFingerprint };
  }
  throw new FulfillmentError(400, "invalid_request", "A valid review operation is required.");
}

export function fulfillmentDto(value: unknown): FulfillmentDto {
  if (!exactObject(value, ["requestId", "state", "blockers", "revision", "startedAt", "reviewedAt", "storageQuiesceUntil", "databaseAnonymizedAt", "authDeletedAt", "completedAt"])) {
    throw new FulfillmentError(503, "fulfillment_unavailable", "Deletion status could not be verified. Try again.", true);
  }
  const state = value.state;
  if (!uuid(value.requestId) || !["blocked", "quiescing_storage", "ready_for_auth_deletion", "completed"].includes(String(state))
    || !Array.isArray(value.blockers) || !validRevision(value.revision) || !validTime(value.startedAt) || !validTime(value.reviewedAt)
    || !nullableTime(value.storageQuiesceUntil) || !nullableTime(value.databaseAnonymizedAt) || !nullableTime(value.authDeletedAt) || !nullableTime(value.completedAt)) {
    throw new FulfillmentError(503, "fulfillment_unavailable", "Deletion status could not be verified. Try again.", true);
  }
  const blockers = value.blockers;
  if (new Set(blockers).size !== blockers.length || blockers.some(item => !fulfillmentBlockers.includes(item as FulfillmentBlocker))) {
    throw new FulfillmentError(503, "fulfillment_unavailable", "Deletion status could not be verified. Try again.", true);
  }
  if (((state === "blocked" || state === "quiescing_storage") !== (blockers.length > 0))
    || (state === "blocked" && (value.storageQuiesceUntil !== null || value.databaseAnonymizedAt !== null || value.authDeletedAt !== null || value.completedAt !== null))
    || (state === "quiescing_storage" && (value.storageQuiesceUntil === null || value.databaseAnonymizedAt !== null || value.authDeletedAt !== null || value.completedAt !== null))
    || (state === "ready_for_auth_deletion" && (value.storageQuiesceUntil === null || value.databaseAnonymizedAt === null || value.authDeletedAt !== null || value.completedAt !== null))
    || (state === "completed" && (value.storageQuiesceUntil === null || value.databaseAnonymizedAt === null || value.authDeletedAt === null || value.completedAt === null))) {
    throw new FulfillmentError(503, "fulfillment_unavailable", "Deletion status could not be verified. Try again.", true);
  }
  return { requestId: value.requestId.toLowerCase(), state: state as FulfillmentState, blockers: [...blockers] as FulfillmentBlocker[], revision: value.revision,
    startedAt: value.startedAt, reviewedAt: value.reviewedAt, storageQuiesceUntil: value.storageQuiesceUntil,
    databaseAnonymizedAt: value.databaseAnonymizedAt,
    authDeletedAt: value.authDeletedAt, completedAt: value.completedAt };
}

function mapped(error: RpcError) {
  if (error?.code === "PD401") return new FulfillmentError(401, "identity_required", "Sign in again to continue.");
  if (error?.code === "PD403") return new FulfillmentError(403, "admin_required", "Administrator access is required.");
  if (error?.code === "PD404") return new FulfillmentError(404, "request_not_found", "The deletion request was not found.");
  if (["PD409", "PD428"].includes(error?.code || "")) return new FulfillmentError(409, "fulfillment_not_ready", "Deletion cannot continue until the recorded blockers are resolved.");
  if (error?.code === "PD412") return new FulfillmentError(409, "review_stale", "The retained records changed. Review the latest fingerprint before confirming.");
  if (error?.code === "PD413") return new FulfillmentError(409, "review_too_large", "This review is too large for one verified inspection and cannot be confirmed from this screen.");
  if (error?.code === "PD423") return new FulfillmentError(409, "review_busy", "The retained records are changing. Retry the review safely.", true);
  if (error?.code === "22023") return new FulfillmentError(400, "invalid_request", "Check the deletion request details.");
  return new FulfillmentError(503, "fulfillment_unavailable", "Deletion status could not be confirmed. Retry safely.", true);
}

export function publicFulfillmentError(error: unknown) {
  const safe = error instanceof FulfillmentError ? error : new FulfillmentError(503, "fulfillment_unavailable", "Deletion status could not be confirmed. Retry safely.", true);
  return { status: safe.status, body: { ok: false, code: safe.code, message: safe.message, retryable: safe.retryable } };
}

export function createFulfillmentService(deps: FulfillmentDependencies) {
  const makeId = deps.randomId || randomUUID;
  const timeout = Math.max(1000, Math.min(deps.timeoutMs ?? 20_000, 30_000));
  const protectedAdminEmails = () => [...new Set((deps.protectedAdminEmails?.() || [])
    .map(value => String(value || "").trim().toLowerCase()).filter(Boolean))].sort();
  async function bounded<T>(work: () => PromiseLike<T>) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([Promise.resolve().then(work), new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new FulfillmentError(503, "fulfillment_unavailable", "Deletion status could not be confirmed. Retry safely.", true)), timeout);
      })]);
    } finally { if (timer) clearTimeout(timer); }
  }
  async function access(request: Request) {
    const gate = await bounded(() => deps.requireAdmin(request));
    if (!gate.ok) {
      const status = gate.response.status === 401 ? 401 : gate.response.status === 403 ? 403 : 503;
      throw new FulfillmentError(status, status === 401 ? "identity_required" : status === 403 ? "admin_required" : "fulfillment_unavailable",
        status === 401 ? "Sign in again to continue." : status === 403 ? "Administrator access is required." : "Deletion controls are temporarily unavailable.", status >= 500);
    }
    if (!gate.admin.user || !uuid(gate.admin.user.id)) throw new FulfillmentError(503, "fulfillment_unavailable", "Administrator identity could not be verified.", true);
    return { client: gate.supabase, adminId: gate.admin.user.id.toLowerCase(), environmentAdmin: gate.admin.accessSource === "env",
      accountStatus: gate.admin.accountStatus };
  }
  async function rpc(client: AdminClient, name: string, args: Record<string, unknown>) {
    let result: { data: unknown; error: RpcError };
    try { result = await bounded(() => client.rpc(name, args)); } catch (error) { if (error instanceof FulfillmentError) throw error; throw mapped(null); }
    if (!result || result.error) throw mapped(result?.error || null);
    if (!object(result.data) || result.data.ok !== true) throw mapped(null);
    return result.data;
  }
  async function removeMemberMessagingData(client: AdminClient, actorId: string) {
    const plan = await rpc(client, "prepare_member_messaging_account_deletion", { p_actor_id: actorId });
    if (!exactObject(plan, ["ok", "bucket", "paths"]) || plan.ok !== true || plan.bucket !== "member-message-media"
      || !Array.isArray(plan.paths) || !plan.paths.every(memberMediaPath)) throw mapped(null);
    const paths = plan.paths;
    if (new Set(paths).size !== paths.length) throw mapped(null);
    for (let index = 0; index < paths.length; index += 100) {
      let removed: { data?: unknown; error: StorageError };
      try { removed = await bounded(() => client.storage.from("member-message-media").remove(paths.slice(index, index + 100))); }
      catch (error) { if (error instanceof FulfillmentError) throw error; throw mapped(null); }
      if (!removed || removed.error) throw mapped(removed?.error || null);
    }
    const completed = await rpc(client, "complete_member_messaging_account_deletion", { p_actor_id: actorId });
    if (!exactObject(completed, ["ok", "removedConversations"]) || completed.ok !== true
      || !Number.isInteger(completed.removedConversations) || Number(completed.removedConversations) < 0) throw mapped(null);
  }
  type VerifiedAccess = { client: AdminClient; adminId: string; environmentAdmin: boolean; accountStatus: string };
  const env = (verified: VerifiedAccess, requestId: string) => ({ p_admin_id: verified.adminId, p_environment_admin: verified.environmentAdmin, p_request_id: requestId });
  const storagePending = () => new FulfillmentError(503, "storage_relocation_pending",
    "Private file cleanup is incomplete. Its durable state can be retried safely; completion was not assumed.", true);
  const storageNotFound = (error: StorageError) => {
    const status = Number(error?.statusCode ?? error?.status ?? 0);
    const code = `${error?.code || ""} ${error?.error || ""} ${error?.message || ""}`.toLowerCase();
    return status === 404 || /(^|\W)(not[_ -]?found|no[_ -]?such[_ -]?key|object[_ -]?not[_ -]?found)(\W|$)/.test(code);
  };
  const detectedMimeType = (bytes: Uint8Array) => {
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
    if (bytes.length >= 8 && [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a].every((value,index) => bytes[index] === value)) return "image/png";
    if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0,4)) === "RIFF" && String.fromCharCode(...bytes.slice(8,12)) === "WEBP") return "image/webp";
    if (bytes.length >= 5 && String.fromCharCode(...bytes.slice(0,5)) === "%PDF-") return "application/pdf";
    return "";
  };
  /* A visual preview cannot reveal container metadata. Malformed containers and
     EXIF/XMP/PDF properties are therefore deletion-only during privacy review. */
  const analyzeContainer = (bytes: Uint8Array, mimeType: string) => {
    const findings = new Set<string>(); let valid = true;
    const ascii = (from:number,to:number) => String.fromCharCode(...bytes.slice(from,to));
    if (mimeType === "image/jpeg") {
      let at=2, ended=false;
      while(at<bytes.length){if(bytes[at]!==0xff){valid=false;break;}while(bytes[at]===0xff)at++;const marker=bytes[at++];
        if(marker===0xd9){ended=true;break;}if(marker===0xda){const tail=bytes.lastIndexOf(0xff);ended=tail>=at&&bytes[tail+1]===0xd9;break;}
        if(marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;if(at+2>bytes.length){valid=false;break;}
        const length=(bytes[at]<<8)|bytes[at+1];if(length<2||at+length>bytes.length){valid=false;break;}
        if(marker===0xe1)findings.add(ascii(at+2,Math.min(at+32,at+length)).includes("Exif")?"exif":"xmp");
        if(marker===0xed)findings.add("iptc");if(marker===0xfe)findings.add("comment");at+=length;
      } valid=valid&&ended;
    } else if (mimeType === "image/png") {
      let at=8, ended=false;
      while(at+12<=bytes.length){const length=((bytes[at]<<24)>>>0)+(bytes[at+1]<<16)+(bytes[at+2]<<8)+bytes[at+3],type=ascii(at+4,at+8);
        if(length>bytes.length-at-12){valid=false;break;}if(["eXIf","iTXt","tEXt","zTXt"].includes(type))findings.add(type==="eXIf"?"exif":"text-metadata");
        at+=12+length;if(type==="IEND"){ended=true;break;}}
      valid=valid&&ended&&at===bytes.length;
    } else if (mimeType === "image/webp") {
      const declared=bytes.length>=12?(bytes[4]|bytes[5]<<8|bytes[6]<<16|bytes[7]<<24)>>>0:0;let at=12;
      valid=declared+8===bytes.length;
      while(valid&&at+8<=bytes.length){const type=ascii(at,at+4),length=(bytes[at+4]|bytes[at+5]<<8|bytes[at+6]<<16|bytes[at+7]<<24)>>>0;
        if(length>bytes.length-at-8){valid=false;break;}if(["EXIF","XMP ","ICCP"].includes(type))findings.add(type.trim().toLowerCase());at+=8+length+(length%2);}
      valid=valid&&at===bytes.length;
    } else if (mimeType === "application/pdf") {
      const text=new TextDecoder("latin1").decode(bytes),tail=text.slice(Math.max(0,text.length-4096));
      valid=/^%PDF-\d\.\d/.test(text)&&/%%EOF\s*$/.test(tail)&&/startxref\s+\d+\s+%%EOF\s*$/.test(tail);
      const tokens:[RegExp,string][]=[[/\/(Author|Creator|Producer|Title|Subject|Keywords)\b/,"document-properties"],[/\/(Metadata|PieceInfo)\b|<x:xmpmeta\b/i,"xmp"],[/\/(JavaScript|JS|OpenAction|AA)\b/,"active-content"],[/\/(EmbeddedFiles|Filespec)\b/,"embedded-files"]];
      for(const [pattern,label] of tokens)if(pattern.test(text))findings.add(label);
    }
    if(!valid)findings.add("malformed-container");
    return {structureValid:valid,metadataFindings:[...findings].sort(),safeToRetain:valid&&findings.size===0};
  };
  async function downloadBytes(bucket: StorageBucket, path: string, mimeType: string, expectedSize: number | null, missingAllowed = false) {
    let result: { data: StorageDownload | null; error: StorageError };
    try { result = await bounded(() => bucket.download(path)); } catch { throw storagePending(); }
    if (!result || result.error || !result.data) {
      if (missingAllowed && result?.error && storageNotFound(result.error)) return null;
      throw storagePending();
    }
    if (typeof result.data.arrayBuffer !== "function" || !Number.isSafeInteger(result.data.size) || Number(result.data.size) < 1
      || Number(result.data.size) > maxStorageReviewBytes || (expectedSize !== null && result.data.size !== expectedSize)) throw storagePending();
    let buffer: ArrayBuffer;
    try { buffer = await bounded(() => result.data!.arrayBuffer()); } catch { throw storagePending(); }
    if (!(buffer instanceof ArrayBuffer)) throw storagePending();
    const bytes = new Uint8Array(buffer);
    if (result.data.size !== bytes.byteLength || (result.data.type !== undefined && typeof result.data.type !== "string")
      || (result.data.type && result.data.type !== mimeType) || detectedMimeType(bytes) !== mimeType) throw storagePending();
    return bytes;
  }
  const byteHash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
  async function uploadCopy(bucket: StorageBucket, relocation: StorageRelocation, bytes: Uint8Array, digest: string, mimeType: string) {
    const destinationPath = relocation.destinationPath;
    if (!destinationPath) throw storagePending();
    let result: { data?: unknown; error: StorageError };
    try {
      result = await bounded(() => bucket.upload(destinationPath, bytes, { contentType: mimeType, upsert: true,
        metadata: { sha256: digest, accountDeletionRelocationId: relocation.relocationId } }));
    } catch { throw storagePending(); }
    if (!result || result.error) throw storagePending();
  }
  async function removeSource(bucket: StorageBucket, relocation: StorageRelocation, mimeType: string | null) {
    let result: { data?: unknown; error: StorageError };
    try { result = await bounded(() => bucket.remove([relocation.sourcePath])); } catch { throw storagePending(); }
    if (!result || result.error) {
      if (result?.error && storageNotFound(result.error)) return;
      if (!mimeType) throw storagePending();
      const source = await downloadBytes(bucket, relocation.sourcePath, mimeType, relocation.sourceSize, true);
      if (source === null) return;
      throw storagePending();
    }
  }
  async function inspectStorageSource(current: VerifiedAccess, requestId: string, relocationId: string, expectedFingerprint: string): Promise<StorageInspection> {
    if (current.accountStatus !== "active") throw new FulfillmentError(403, "admin_required", "An active administrator account is required.");
    const descriptor = storageSource(await rpc(current.client, "read_account_deletion_storage_review_source", {
      ...env(current, requestId), p_relocation_id: relocationId, p_expected_fingerprint: expectedFingerprint
    }), relocationId, expectedFingerprint);
    let bucket: StorageBucket;
    try { bucket = current.client.storage.from(descriptor.bucket); } catch { throw storagePending(); }
    if (!bucket || typeof bucket.download !== "function") throw storagePending();
    const bytes = await downloadBytes(bucket, descriptor.sourcePath, descriptor.sourceMimeType, descriptor.sourceSize);
    if (!bytes) throw storagePending();
    return { bytes, mimeType: descriptor.sourceMimeType, byteSize: bytes.byteLength, byteSha256: byteHash(bytes),
      sourceFingerprint: descriptor.sourceFingerprint, ...analyzeContainer(bytes,descriptor.sourceMimeType) };
  }
  async function inspectCustodySource(current:VerifiedAccess,requestId:string,claimId:string,evidenceId:string,expectedObjectFingerprint:string):Promise<CustodyInspection>{
    if(current.accountStatus!=="active")throw new FulfillmentError(403,"admin_required","An active administrator account is required.");
    const descriptor=custodySource(await rpc(current.client,"read_account_deletion_custody_evidence_source",{
      ...env(current,requestId),p_claim_id:claimId,p_evidence_id:evidenceId,p_expected_object_fingerprint:expectedObjectFingerprint
    }),claimId,evidenceId,expectedObjectFingerprint);
    let bucket:StorageBucket;try{bucket=current.client.storage.from(descriptor.bucket);}catch{throw storagePending();}
    if(!bucket||typeof bucket.download!=="function")throw storagePending();
    const bytes=await downloadBytes(bucket,descriptor.sourcePath,descriptor.sourceMimeType,descriptor.sourceSize);
    if(!bytes)throw storagePending();
    const analyzed=analyzeContainer(bytes,descriptor.sourceMimeType);if(!analyzed.structureValid)throw storagePending();
    return{bytes,mimeType:descriptor.sourceMimeType,byteSize:bytes.byteLength,byteSha256:byteHash(bytes),sourceFingerprint:expectedObjectFingerprint,...analyzed,
      claimId,evidenceId,objectFingerprint:expectedObjectFingerprint};
  }
  async function readSnapshot(current: VerifiedAccess, requestId: string) {
    const data = await rpc(current.client, "read_account_deletion_fulfillment", env(current, requestId));
    return snapshot(data, requestId);
  }
  return {
    async read(request: Request, requestId: string) {
      if (!uuid(requestId)) throw new FulfillmentError(400, "invalid_request", "A valid deletion request is required.");
      const normalizedRequest = requestId.toLowerCase(), current = await access(request);
      return { ok: true as const, ...await readSnapshot(current, normalizedRequest) };
    },
    async inspectStorage(request: Request, requestId: string, relocationId: string, expectedFingerprint: string) {
      if (!uuid(requestId) || !uuid(relocationId) || !fingerprint(expectedFingerprint)) {
        throw new FulfillmentError(400, "invalid_request", "A valid private-file review is required.");
      }
      const current = await access(request);
      return inspectStorageSource(current, requestId.toLowerCase(), relocationId.toLowerCase(), expectedFingerprint);
    },
    async inspectCustody(request:Request,requestId:string,claimId:string,evidenceId:string,expectedObjectFingerprint:string){
      if(!uuid(requestId)||!uuid(claimId)||!uuid(evidenceId)||!fingerprint(expectedObjectFingerprint))
        throw new FulfillmentError(400,"invalid_request","A valid custody proof review is required.");
      const current=await access(request);return inspectCustodySource(current,requestId.toLowerCase(),claimId.toLowerCase(),evidenceId.toLowerCase(),expectedObjectFingerprint);
    },
    async execute(request: Request, requestId: string, input: unknown) {
      if (!uuid(requestId)) throw new FulfillmentError(400, "invalid_request", "A valid deletion request is required.");
      const normalizedRequest = requestId.toLowerCase(), action = actionDto(input), current = await access(request);
      const operationIds = new Set([action.operationId]);
      const nextOperationId = () => {
        for (let attempt = 0; attempt < 16; attempt += 1) {
          let candidate: string;
          try { candidate = makeId(); } catch { throw mapped(null); }
          if (uuid(candidate) && !operationIds.has(candidate.toLowerCase())) {
            candidate = candidate.toLowerCase(); operationIds.add(candidate); return candidate;
          }
        }
        throw mapped(null);
      };
      const prepare = async (operationId: string) => preparedFulfillment(await rpc(current.client, "prepare_account_deletion_fulfillment", {
        ...env(current, normalizedRequest), p_operation_id: operationId, p_protected_admin_emails: protectedAdminEmails()
      }), normalizedRequest);
      const processRelocation = async (relocation: StorageRelocation, review: StorageReviewDto | undefined) => {
        let bucket: StorageBucket;
        try { bucket = current.client.storage.from(relocation.bucket); } catch { throw storagePending(); }
        if (!bucket || typeof bucket.download !== "function" || typeof bucket.upload !== "function" || typeof bucket.remove !== "function") throw storagePending();
        let state = relocation.state, authorizationOperationId = relocation.authorizationOperationId;
        const mimeType = relocation.sourceMimeType;
        let reviewedHash: string | null = null, reviewedSize: number | null = null;
        if (relocation.disposition === "retain") {
          if (!review || review.sourceFingerprint !== relocation.sourceFingerprint || review.decision !== "retain" || !review.byteSha256
            || review.sourceMimeType !== mimeType || !mimeType || !relocationBuckets[relocation.bucket].has(mimeType)) throw storagePending();
          reviewedHash = review.byteSha256;
          if (state === "planned") {
            const inspected = await downloadBytes(bucket, relocation.sourcePath, mimeType, relocation.sourceSize);
            if (!inspected || byteHash(inspected) !== reviewedHash) throw storagePending();
            reviewedSize = inspected.byteLength;
          }
        }
        if (state === "planned") {
          authorizationOperationId = nextOperationId();
          let authorized: Record<string, unknown>;
          try {
            authorized = await rpc(current.client, "authorize_account_deletion_storage_relocation", {
              ...env(current, normalizedRequest), p_operation_id: authorizationOperationId, p_relocation_id: relocation.relocationId,
              p_byte_sha256: relocation.disposition === "retain" ? reviewedHash : null,
              p_byte_size: relocation.disposition === "retain" ? reviewedSize : null,
              p_mime_type: relocation.disposition === "retain" ? mimeType : null
            });
          } catch { throw storagePending(); }
          state = relocation.disposition === "retain" ? "copy_authorized" : "deletion_authorized";
          authorizationReceipt(authorized, relocation, state);
        } else {
          if (!authorizationOperationId || operationIds.has(authorizationOperationId)) throw mapped(null);
          operationIds.add(authorizationOperationId);
        }
        if (relocation.disposition === "delete") {
          if (state !== "deletion_authorized") throw mapped(null);
          await removeSource(bucket, relocation, relocation.sourceMimeType);
          let completed: Record<string, unknown>;
          try {
            completed = await rpc(current.client, "complete_account_deletion_storage_relocation", {
              ...env(current, normalizedRequest), p_operation_id: nextOperationId(), p_relocation_id: relocation.relocationId
            });
          } catch { throw storagePending(); }
          completionReceipt(completed, relocation, null, null);
          return;
        }
        const allowedMimeTypes = relocationBuckets[relocation.bucket];
        if (!relocation.destinationPath || !mimeType || !allowedMimeTypes.has(mimeType) || !authorizationOperationId || !reviewedHash) throw storagePending();
        let expectedHash = relocation.byteSha256, expectedSize: number;
        if (state === "copy_authorized") {
          const source = await downloadBytes(bucket, relocation.sourcePath, mimeType, relocation.sourceSize);
          if (!source || (relocation.sourceSize !== null && relocation.sourceSize !== source.byteLength)) throw storagePending();
          expectedHash = byteHash(source); expectedSize = source.byteLength;
          if (expectedHash !== reviewedHash) throw storagePending();
          await uploadCopy(bucket, relocation, source, expectedHash, mimeType);
          const destination = await downloadBytes(bucket, relocation.destinationPath, mimeType, expectedSize);
          if (!destination || destination.byteLength !== expectedSize || byteHash(destination) !== expectedHash) throw storagePending();
          let finalized: Record<string, unknown>;
          try {
            finalized = await rpc(current.client, "finalize_account_deletion_storage_relocation", {
              ...env(current, normalizedRequest), p_operation_id: authorizationOperationId, p_relocation_id: relocation.relocationId,
              p_byte_sha256: expectedHash, p_copied_size: expectedSize
            });
          } catch { throw storagePending(); }
          if (finalizeReceipt(finalized, relocation, expectedHash, expectedSize, new Set(["references_updated", "completed"])) === "completed") return;
        } else {
          if (state !== "references_updated" || !expectedHash || expectedHash !== reviewedHash) throw mapped(null);
          const source = await downloadBytes(bucket, relocation.sourcePath, mimeType, relocation.sourceSize, true);
          if (source) {
            if (byteHash(source) !== expectedHash || (relocation.sourceSize !== null && source.byteLength !== relocation.sourceSize)) throw storagePending();
            await uploadCopy(bucket, relocation, source, expectedHash, mimeType);
          }
          const beforeRemoval = await downloadBytes(bucket, relocation.destinationPath, mimeType, relocation.sourceSize);
          if (!beforeRemoval || byteHash(beforeRemoval) !== expectedHash
            || (relocation.sourceSize !== null && beforeRemoval.byteLength !== relocation.sourceSize)) throw storagePending();
          expectedSize = beforeRemoval.byteLength;
        }
        await removeSource(bucket, relocation, mimeType);
        const retained = await downloadBytes(bucket, relocation.destinationPath, mimeType, expectedSize);
        if (!retained || retained.byteLength !== expectedSize || byteHash(retained) !== expectedHash) throw storagePending();
        let completed: Record<string, unknown>;
        try {
          completed = await rpc(current.client, "complete_account_deletion_storage_relocation", {
            ...env(current, normalizedRequest), p_operation_id: nextOperationId(), p_relocation_id: relocation.relocationId
          });
        } catch { throw storagePending(); }
        completionReceipt(completed, relocation, expectedHash, expectedSize);
      };
      if (action.action === "inspect_profile" || action.action === "inspect_retention") {
        const inspected = await rpc(current.client, "inspect_account_deletion_review_page", {
          ...env(current, normalizedRequest), p_kind: action.action === "inspect_profile" ? "profile" : "retention",
          p_guitar_id: action.action === "inspect_profile" ? action.guitarId : null,
          p_domain: action.action === "inspect_retention" ? action.domain : null,
          p_expected_fingerprint: action.expectedFingerprint, p_page_index:action.pageIndex,p_operation_id:action.operationId
        });
        const reviewSnapshot = reviewSnapshotDto(inspected, action);
        return { ok: true as const, ...await readSnapshot(current, normalizedRequest), reviewSnapshot };
      }
      if (action.action === "redact_profile") {
        const redacted = await rpc(current.client, "redact_account_deletion_profile_review", {
          ...env(current, normalizedRequest), p_operation_id: action.operationId, p_guitar_id: action.guitarId,
          p_expected_fingerprint: action.expectedFingerprint, p_terms: action.terms
        });
        if (!exactObject(redacted, ["ok", "redaction", "profileReviews"]) || redacted.ok !== true
          || !exactObject(redacted.redaction, ["guitarId", "policyVersion", "beforeFingerprint", "afterFingerprint", "termCount", "termsDigest"])
          || redacted.redaction.guitarId !== action.guitarId || redacted.redaction.policyVersion !== 1
          || redacted.redaction.beforeFingerprint !== action.expectedFingerprint || !fingerprint(redacted.redaction.afterFingerprint)
          || redacted.redaction.afterFingerprint === action.expectedFingerprint || !Number.isInteger(redacted.redaction.termCount)
          || redacted.redaction.termCount !== action.terms.length || !fingerprint(redacted.redaction.termsDigest)) throw mapped(null);
        reviews(redacted.profileReviews, "profile");
        return { ok: true as const, ...await readSnapshot(current, normalizedRequest) };
      }
      if (action.action === "attest_profile") {
        const attested = await rpc(current.client, "attest_account_deletion_profile_review", {
          ...env(current, normalizedRequest), p_operation_id: action.operationId, p_guitar_id: action.guitarId,
          p_expected_fingerprint: action.expectedFingerprint, p_confirm_personal_information_removed: true
        });
        if (!exactObject(attested, ["ok", "review", "profileReviews"]) || attested.ok !== true
          || !exactObject(attested.review, ["approved", "guitarId", "policyVersion", "contentFingerprint"])
          || attested.review.approved !== true || attested.review.guitarId !== action.guitarId || attested.review.policyVersion !== 1
          || attested.review.contentFingerprint !== action.expectedFingerprint) throw mapped(null);
        reviews(attested.profileReviews, "profile");
        return { ok: true as const, ...await readSnapshot(current, normalizedRequest) };
      }
      if (action.action === "attest_retention") {
        const attested = await rpc(current.client, "attest_account_deletion_retention_review", {
          ...env(current, normalizedRequest), p_operation_id: action.operationId, p_domain: action.domain,
          p_expected_fingerprint: action.expectedFingerprint, p_decision_code: action.decisionCode, p_confirm_reviewed: true
        });
        if (!exactObject(attested, ["ok", "review", "retentionReviews"]) || attested.ok !== true
          || !exactObject(attested.review, ["approved", "domain", "decisionCode", "policyVersion", "contentFingerprint"])
          || attested.review.approved !== true || attested.review.domain !== action.domain || attested.review.decisionCode !== action.decisionCode
          || attested.review.policyVersion !== 1 || attested.review.contentFingerprint !== action.expectedFingerprint) throw mapped(null);
        reviews(attested.retentionReviews, "retention");
        return { ok: true as const, ...await readSnapshot(current, normalizedRequest) };
      }
      if (action.action === "attest_storage") {
        const inspected = await inspectStorageSource(current, normalizedRequest, action.relocationId, action.expectedFingerprint);
        if(action.decision==="retain"&&!inspected.safeToRetain)throw new FulfillmentError(409,"unsafe_private_file","This file contains hidden metadata or malformed content. Delete it to finish the privacy review.");
        const attested = await rpc(current.client, "attest_account_deletion_storage_content", {
          ...env(current, normalizedRequest), p_operation_id: action.operationId, p_relocation_id: action.relocationId,
          p_expected_fingerprint: action.expectedFingerprint, p_byte_sha256: inspected.byteSha256,
          p_byte_size: inspected.byteSize, p_mime_type: inspected.mimeType, p_decision: action.decision, p_confirm_reviewed: true
        });
        storageReviewReceipt(attested, action, inspected.byteSha256, inspected.byteSize, inspected.mimeType);
        return { ok: true as const, ...await readSnapshot(current, normalizedRequest) };
      }
      if(action.action==="inspect_custody"){
        const inventory=custodyEvidenceInventory(await rpc(current.client,"read_account_deletion_custody_evidence_inventory",{
          ...env(current,normalizedRequest),p_claim_id:action.claimId,p_expected_profile_fingerprint:action.expectedFingerprint,p_page_index:action.pageIndex
        }),action.claimId,action.expectedFingerprint);
        return{ok:true as const,...await readSnapshot(current,normalizedRequest),custodyEvidence:inventory};
      }
      if(action.action==="attest_custody_evidence"){
        const inspected=await inspectCustodySource(current,normalizedRequest,action.claimId,action.evidenceId,action.expectedObjectFingerprint);
        const attested=await rpc(current.client,"attest_account_deletion_custody_evidence",{
          ...env(current,normalizedRequest),p_operation_id:action.operationId,p_claim_id:action.claimId,p_evidence_id:action.evidenceId,
          p_expected_profile_fingerprint:action.expectedFingerprint,p_expected_object_fingerprint:action.expectedObjectFingerprint,
          p_byte_sha256:inspected.byteSha256,p_byte_size:inspected.byteSize,p_mime_type:inspected.mimeType,p_confirm_reviewed:true
        });
        if(!exactObject(attested,["ok","review","evidence"])||attested.ok!==true
          ||!exactObject(attested.review,["claimId","evidenceId","profileFingerprint","objectFingerprint","byteSha256","byteSize","mimeType","reviewedAt"])
          ||attested.review.claimId!==action.claimId||attested.review.evidenceId!==action.evidenceId
          ||attested.review.profileFingerprint!==action.expectedFingerprint||attested.review.objectFingerprint!==action.expectedObjectFingerprint
          ||attested.review.byteSha256!==inspected.byteSha256||attested.review.byteSize!==inspected.byteSize||attested.review.mimeType!==inspected.mimeType
          ||!validTime(attested.review.reviewedAt))throw mapped(null);
        const inventory=custodyEvidenceInventory(await rpc(current.client,"read_account_deletion_custody_evidence_inventory",{
          ...env(current,normalizedRequest),p_claim_id:action.claimId,p_expected_profile_fingerprint:action.expectedFingerprint,p_page_index:action.pageIndex
        }),action.claimId,action.expectedFingerprint);
        return{ok:true as const,...await readSnapshot(current,normalizedRequest),custodyEvidence:inventory};
      }      if (action.action === "release_custody") {
        const released = await rpc(current.client, "release_account_deletion_profile_custody", {
          ...env(current, normalizedRequest), p_operation_id: action.operationId, p_claim_id: action.claimId,
          p_expected_fingerprint: action.expectedFingerprint, p_confirm_reviewed: true
        });
        if (!exactObject(released, ["ok", "release"]) || released.ok !== true
          || !exactObject(released.release, ["requestId", "claimId", "guitarId", "policyVersion", "contentFingerprint", "evidenceCount", "visibility", "releasedAt"])
          || released.release.requestId !== normalizedRequest || released.release.claimId !== action.claimId
          || !uuid(released.release.guitarId) || released.release.policyVersion !== 1
          || released.release.contentFingerprint !== action.expectedFingerprint
          || !Number.isSafeInteger(released.release.evidenceCount) || Number(released.release.evidenceCount) < 1
          || Number(released.release.evidenceCount) > 1_000_000 || released.release.visibility !== "private"
          || !validTime(released.release.releasedAt)) throw mapped(null);
        return { ok: true as const, ...await readSnapshot(current, normalizedRequest) };
      }
      let prepared = await prepare(action.operationId), processedRelocations = 0;
      while (prepared.storageRelocations.length > 0 && processedRelocations < storageRelocationLimit) {
        const available = prepared.storageRelocations
          .filter(relocation => !(relocation.disposition === "retain" && relocation.contentReviewRequired))
          .slice(0, storageRelocationLimit - processedRelocations);
        if (available.length === 0) break;
        for (const relocation of available) {
          await processRelocation(relocation, prepared.storageReviews.find(review => review.relocationId === relocation.relocationId));
          processedRelocations += 1;
        }
        prepared = await prepare(nextOperationId());
      }
      let { fulfillment, profileReviews, retentionReviews, storageReviews: safeStorageReviews } = prepared;
      if (fulfillment.state !== "ready_for_auth_deletion") return { ok: true as const, fulfillment, profileReviews, retentionReviews, storageReviews: safeStorageReviews };
      const actorId = prepared.authActorId;
      if (actorId) {
        // A provider failure is never treated as proof of deletion. The database
        // finalizer below independently requires the Auth row to be absent.
        const normalizedActor = actorId.toLowerCase();
        await removeMemberMessagingData(current.client, normalizedActor);
        try { await bounded(() => current.client.auth.admin.deleteUser(normalizedActor)); } catch { /* verified below */ }
      }
      try {
        const completed = await rpc(current.client, "complete_account_deletion_fulfillment", {
          ...env(current, normalizedRequest), p_operation_id: nextOperationId()
        });
        const completedSnapshot = snapshot(completed, normalizedRequest);
        if (!completedSnapshot.fulfillment) throw mapped(null);
        fulfillment = completedSnapshot.fulfillment;
        profileReviews = completedSnapshot.profileReviews;
        retentionReviews = completedSnapshot.retentionReviews;
        safeStorageReviews = completedSnapshot.storageReviews;
      } catch (error) {
        if (error instanceof FulfillmentError && error.code === "fulfillment_not_ready") {
          throw new FulfillmentError(503, "auth_deletion_pending", "Database anonymization is complete, but Auth deletion is not confirmed. Retry this operation; QRguitar will not report completion early.", true);
        }
        throw error;
      }
      if (fulfillment.state !== "completed") throw mapped(null);
      return { ok: true as const, fulfillment, profileReviews, retentionReviews, storageReviews: safeStorageReviews };
    }
  };
}
export type FulfillmentService = ReturnType<typeof createFulfillmentService>;
