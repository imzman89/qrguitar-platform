// This tool deliberately supports one approved correction, not arbitrary CMS patches.
export const RECOVERY_COPY_KEY = "resetPassword.hero.body";
export const RECOVERY_COPY_VALUE = "Use the secure link from your email to choose a new password.";
export const RECOVERY_COPY_SOURCE = "recovery-copy-v1";

export type RecoveryRawState = {
  publishedValue: unknown; publishedAt?: string; publishedVersion: string;
  draftValue: unknown; draftUpdatedAt?: string; draftVersion: string;
};
export type RecoveryCopyRequest = {
  operation: "correct" | "restore"; field: typeof RECOVERY_COPY_KEY;
  value: string; expectedValue: string; priorRequestId?: string;
  expectedActorId: string; requestId: string; expectedPublishedVersion: string; expectedDraftVersion: "";
};
export type RecoveryCopyPreflight = RecoveryRawState & {
  editorActorId: string; field: typeof RECOVERY_COPY_KEY; before: string; after: string;
  operation: "correct" | "restore"; priorRequestId?: string; eligible: boolean; reason: string;
  publishedHash?: string;
};
export class RecoveryCopyError extends Error {
  constructor(message: string, public status = 400, public code = "recovery_copy_invalid") { super(message); }
}
export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function readRecoveryCopyRequest(body: unknown, actorId: string): RecoveryCopyRequest {
  if (!isJsonObject(body)) throw new RecoveryCopyError("Invalid recovery-copy request.");
  const keys = new Set(["operation", "field", "value", "expectedValue", "priorRequestId", "expectedActorId", "requestId", "expectedPublishedVersion", "expectedDraftVersion"]);
  if (Object.keys(body).some((key) => !keys.has(key)) || body.field !== RECOVERY_COPY_KEY
    || !["correct", "restore"].includes(String(body.operation))
    || typeof body.value !== "string" || typeof body.expectedValue !== "string"
    || body.value.length > 10000 || body.expectedValue.length > 10000) throw new RecoveryCopyError("Only the reviewed password-reset introduction can be changed here.");
  if (body.expectedActorId !== actorId) throw new RecoveryCopyError("The signed-in editor changed. Return to the original admin account.", 403, "QSE05");
  if (!uuid(body.requestId) || !uuid(body.expectedPublishedVersion) || body.expectedDraftVersion !== "") {
    throw new RecoveryCopyError("Review current published content with no shared draft before continuing.", 409, "QSE01");
  }
  if (body.operation === "correct" && (body.value !== RECOVERY_COPY_VALUE || body.priorRequestId !== undefined)) {
    throw new RecoveryCopyError("This tool only publishes the approved recovery introduction.");
  }
  if (body.operation === "restore" && !uuid(body.priorRequestId)) throw new RecoveryCopyError("Select the recorded correction before restoring its previous introduction.");
  return body as RecoveryCopyRequest;
}

export function recoveryCopyPreflight(raw: RecoveryRawState, actorId: string, target = RECOVERY_COPY_VALUE, priorRequestId?: string): RecoveryCopyPreflight {
  if (!raw || typeof raw.publishedVersion !== "string" || typeof raw.draftVersion !== "string"
    || !uuid(raw.publishedVersion) || !isJsonObject(raw.publishedValue)
    || !isJsonObject(raw.publishedValue.content) || typeof raw.publishedValue.content[RECOVERY_COPY_KEY] !== "string"
    || !("draftValue" in raw)) throw new RecoveryCopyError("The authoritative saved introduction or revision is unavailable. No content was changed.", 503);
  const before = raw.publishedValue.content[RECOVERY_COPY_KEY] as string;
  const draftPresent = raw.draftValue !== null || raw.draftVersion !== "";
  const reason = draftPresent ? "A shared draft exists. This correction will not publish or discard it."
    : before === target ? "The saved introduction already matches this value."
    : priorRequestId && before !== RECOVERY_COPY_VALUE ? "The introduction changed after this correction. Review that later change in Content Studio."
    : "";
  return { ...raw, editorActorId: actorId, field: RECOVERY_COPY_KEY, before, after: target,
    operation: priorRequestId ? "restore" : "correct", ...(priorRequestId ? { priorRequestId } : {}), eligible: !reason, reason };
}

export function prepareRecoveryCopySettings(raw: RecoveryRawState, request: RecoveryCopyRequest, target: string) {
  // An exact receipt replay must reach the RPC even if later state has changed.
  // With no receipt, the RPC rejects these stale versions before using settings.
  if (raw.publishedVersion !== request.expectedPublishedVersion || raw.draftVersion !== request.expectedDraftVersion) return null;
  const reviewed = recoveryCopyPreflight(raw, request.expectedActorId, target, request.priorRequestId);
  if (!reviewed.eligible || reviewed.before !== request.expectedValue || reviewed.after !== request.value) {
    throw new RecoveryCopyError(reviewed.reason || "The reviewed introduction no longer matches. Reload before continuing.", 409, "QSE01");
  }
  const published = raw.publishedValue as Record<string, unknown>;
  // Do not merge defaults, normalize strings, prune unknown keys, or rewrite other fields.
  return { ...published, content: { ...(published.content as Record<string, unknown>), [RECOVERY_COPY_KEY]: target } };
}

export function recoveryRollbackValue(receipt: unknown, requestId: string): string {
  if (!isJsonObject(receipt) || !isJsonObject(receipt.request_body) || !isJsonObject(receipt.result)) throw new RecoveryCopyError("The correction's restoration record is unavailable.", 404);
  const request = receipt.request_body, result = receipt.result;
  if (request.source !== RECOVERY_COPY_SOURCE || request.operation !== "correct" || request.field !== RECOVERY_COPY_KEY
    || request.value !== RECOVERY_COPY_VALUE || request.requestId !== requestId || result.requestId !== requestId
    || !Array.isArray(result.changedFields) || result.changedFields.length !== 1 || result.changedFields[0] !== RECOVERY_COPY_KEY
    || !isJsonObject(result.before) || !isJsonObject(result.before.content)
    || typeof result.before.content[RECOVERY_COPY_KEY] !== "string") throw new RecoveryCopyError("This record is not an eligible recovery-introduction correction.", 409);
  return result.before.content[RECOVERY_COPY_KEY] as string;
}
