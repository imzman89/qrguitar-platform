/** Server-only request intake. No erasure, account restriction, email, or fulfillment actions. */
export type RpcClient = {
  auth: { getUser(token: string): PromiseLike<{ data: { user: { id: string; email?: string | null } | null }; error: { status?: number; code?: string } | null }> };
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string } | null }>;
};
type AdminGate = (request: Request) => PromiseLike<
  { ok: true; admin: { user: { id: string; email?: string | null } | null } } |
  { ok: false; response: Response }
>;
export type IntakeDependencies = {
  client(): RpcClient | null;
  requireAdmin: AdminGate;
  readAdminEmails(): string[];
  timeoutMs?: number;
};
export type RequestDto = { requestId: string; status: "requested" | "cancelled"; requestedAt: string; cancelledAt: string | null };
export type ReceiptDto = { operationId: string; expectedRevision: string; action: "submit" | "cancel"; requestId: string; recordedAt: string };
export type QueueFulfillmentDto = { state: "blocked" | "quiescing_storage" | "ready_for_auth_deletion" | "completed"; blockers: string[]; revision: string; reviewedAt: string; storageQuiesceUntil: string | null };
export type QueueProfileReviewDto = { guitarId: string; qrCode: string; permanentPath: string; relationshipCodes: string[]; policyVersion: 1; contentFingerprint: string; attested: boolean; attestedAt: string | null };
export type QueueRetentionReviewDto = { domain: "billing" | "service"; policyVersion: 1; contentFingerprint: string; required: boolean; decisionCode: "lawful_financial_retention_reviewed" | "service_history_privacy_reviewed" | null; attested: boolean; attestedAt: string | null };
export type QueueStorageReviewDto = { relocationId:string; bucket:"instrument-media"|"instrument-documents"|"service-evidence";
  disposition:"retain"|"delete"; sourceSize:number|null; sourceMimeType:string|null; sourceFingerprint:string;
  reviewRequired:boolean; decision:"retain"|"delete"|null; byteSha256:string|null; reviewedAt:string|null;
  state:"planned"|"copy_authorized"|"deletion_authorized"|"references_updated" };
export class IntakeError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly uncertain = false, readonly operationId?: string, readonly retryable = false, readonly expectedRevision?: string) { super(message); }
}
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function uuid(value: unknown): value is string { return typeof value === "string" && uuidPattern.test(value); }
export function validRevision(value: unknown): value is string {
  // Compare canonical decimal strings without rounding through a JavaScript number.
  return typeof value === "string" && /^(?:0|[1-9][0-9]{0,18})$/.test(value)
    && (value.length < 19 || value <= "9223372036854775807");
}
function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
export function exactObject(value: unknown, keys: string[]): value is Record<string, unknown> {
  return object(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
export function validTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) return false;
  const [year, month, day, hour, minute, second] = value.slice(0, 19).split(/[-T:]/).map(Number);
  return year >= 1000 && month >= 1 && month <= 12 && day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate() && hour < 24 && minute < 60 && second < 60;
}
function timestampMicros(value: string) {
  const fraction = /\.(\d+)/.exec(value)?.[1] || "";
  return BigInt(Date.parse(value.replace(/\.\d+/, ""))) * 1000n + BigInt(fraction.padEnd(6, "0"));
}
const queueBlockers = new Set(["administrator_account", "unused_paid_credits", "unresolved_payment_order", "payment_hold_or_dispute",
  "billing_retention_review_required", "unused_profile_credits", "storage_cleanup_required", "active_ownership_transfer",
  "storage_quiescence_required", "active_ownership_claim", "active_service_workflow", "service_history_privacy_review_required",
  "profile_history_privacy_review_required",
  "retained_personal_content_review_required"]);
const reviewRelationshipCodes = new Set(["current_owner", "safety_author", "owner_removal_author", "archive_author", "transfer_from_owner", "transfer_recipient", "claim_participant", "claim_evidence_author", "claim_event_author", "document_author", "external_media_author", "serial_author", "timeline_author", "service_access", "service_participant", "service_evidence_author", "service_activity_author", "service_notification_recipient", "service_upload_author", "service_upload_scope", "service_discard_receipt", "create_receipt", "staged_upload", "site_content"]);
const reviewFingerprint = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
function queueFulfillment(value: unknown): QueueFulfillmentDto | null {
  if (value === null) return null;
  if (!object(value) || !["blocked", "quiescing_storage", "ready_for_auth_deletion", "completed"].includes(String(value.state)) || !Array.isArray(value.blockers)
    || value.blockers.some(item => typeof item !== "string" || !queueBlockers.has(item)) || new Set(value.blockers).size !== value.blockers.length
    || !validRevision(value.revision) || !validTimestamp(value.reviewedAt)
    || (value.storageQuiesceUntil !== null && !validTimestamp(value.storageQuiesceUntil))) throw unavailable();
  if (((value.state === "blocked" || value.state === "quiescing_storage") !== (value.blockers.length > 0))
    || (value.state === "blocked" && value.storageQuiesceUntil !== null)
    || (value.state !== "blocked" && value.storageQuiesceUntil === null)) throw unavailable();
  return { state: value.state as QueueFulfillmentDto["state"], blockers: [...value.blockers], revision: value.revision,
    reviewedAt: value.reviewedAt, storageQuiesceUntil: value.storageQuiesceUntil as string | null };
}
function queueProfileReview(value: unknown): QueueProfileReviewDto {
  if (!exactObject(value,["guitarId","qrCode","permanentPath","relationshipCodes","policyVersion","contentFingerprint","attested","attestedAt"])
    || !uuid(value.guitarId) || typeof value.qrCode!=="string" || !value.qrCode || value.qrCode.length>200
    || typeof value.permanentPath!=="string" || !value.permanentPath.startsWith("/i/") || value.permanentPath.length>500
    || !Array.isArray(value.relationshipCodes) || value.relationshipCodes.length<1 || value.relationshipCodes.length>32
    || value.relationshipCodes.some(code=>typeof code!=="string"||!reviewRelationshipCodes.has(code)) || new Set(value.relationshipCodes).size!==value.relationshipCodes.length
    || value.policyVersion!==1 || !reviewFingerprint(value.contentFingerprint) || typeof value.attested!=="boolean"
    || (value.attestedAt!==null&&!validTimestamp(value.attestedAt)) || value.attested!==(value.attestedAt!==null)) throw unavailable();
  return { guitarId:value.guitarId.toLowerCase(),qrCode:value.qrCode,permanentPath:value.permanentPath,relationshipCodes:[...value.relationshipCodes],policyVersion:1,
    contentFingerprint:value.contentFingerprint,attested:value.attested,attestedAt:value.attestedAt as string|null };
}
function queueRetentionReview(value: unknown): QueueRetentionReviewDto {
  if (!exactObject(value,["domain","policyVersion","contentFingerprint","required","decisionCode","attested","attestedAt"])
    || !["billing","service"].includes(String(value.domain)) || value.policyVersion!==1 || !reviewFingerprint(value.contentFingerprint)
    || typeof value.required!=="boolean" || typeof value.attested!=="boolean" || (value.attestedAt!==null&&!validTimestamp(value.attestedAt))) throw unavailable();
  const domain=value.domain as "billing"|"service",decision=domain==="billing"?"lawful_financial_retention_reviewed":"service_history_privacy_reviewed";
  if((!value.required&&value.attested)||value.attested!==(value.attestedAt!==null)||(value.attested?value.decisionCode!==decision:value.decisionCode!==null))throw unavailable();
  return { domain,policyVersion:1,contentFingerprint:value.contentFingerprint,required:value.required,decisionCode:value.decisionCode as QueueRetentionReviewDto["decisionCode"],attested:value.attested,attestedAt:value.attestedAt as string|null };
}
const storageMimes={"instrument-media":new Set(["image/jpeg","image/png","image/webp"]),
  "instrument-documents":new Set(["image/jpeg","image/png","image/webp","application/pdf"]),
  "service-evidence":new Set(["image/jpeg","image/png","image/webp","application/pdf"])} as const;
function queueStorageReview(value:unknown):QueueStorageReviewDto{
  if(!exactObject(value,["relocationId","bucket","disposition","sourceSize","sourceMimeType","sourceFingerprint","reviewRequired","decision","byteSha256","reviewedAt","state"])
    ||!uuid(value.relocationId)||!Object.hasOwn(storageMimes,String(value.bucket))||!["retain","delete"].includes(String(value.disposition))
    ||(value.sourceSize!==null&&(!Number.isSafeInteger(value.sourceSize)||Number(value.sourceSize)<0||Number(value.sourceSize)>16*1024*1024))
    ||(value.sourceMimeType!==null&&(typeof value.sourceMimeType!=="string"||!storageMimes[value.bucket as keyof typeof storageMimes].has(value.sourceMimeType as never)))
    ||!reviewFingerprint(value.sourceFingerprint)||typeof value.reviewRequired!=="boolean"||![null,"retain","delete"].includes(value.decision as null|string)
    ||(value.byteSha256!==null&&!reviewFingerprint(value.byteSha256))||(value.reviewedAt!==null&&!validTimestamp(value.reviewedAt))
    ||!["planned","copy_authorized","deletion_authorized","references_updated"].includes(String(value.state)))throw unavailable();
  const decision=value.decision as "retain"|"delete"|null;
  if((decision===null)!==(value.byteSha256===null)||(decision===null)!==(value.reviewedAt===null)
    ||value.reviewRequired!==(value.disposition==="retain")||(decision!==null&&decision!==value.disposition)
    ||(value.state==="copy_authorized"&&(value.disposition!=="retain"||decision!=="retain"))
    ||(value.state==="deletion_authorized"&&value.disposition!=="delete")
    ||(value.state==="references_updated"&&(value.disposition!=="retain"||decision!=="retain")))throw unavailable();
  return{relocationId:value.relocationId.toLowerCase(),bucket:value.bucket as QueueStorageReviewDto["bucket"],disposition:value.disposition as "retain"|"delete",
    sourceSize:value.sourceSize as number|null,sourceMimeType:value.sourceMimeType as string|null,sourceFingerprint:value.sourceFingerprint,
    reviewRequired:value.reviewRequired,decision,byteSha256:value.byteSha256 as string|null,reviewedAt:value.reviewedAt as string|null,state:value.state as QueueStorageReviewDto["state"]};
}
function unavailable(operationId?: string) {
  return new IntakeError(503, operationId ? "intake_unconfirmed" : "intake_unavailable",
    operationId ? "This request operation is not confirmed. Retry the same operation ID; no deletion has been performed by this intake service." : "Account request information is temporarily unavailable. Try again.",
    Boolean(operationId), operationId, true);
}
function invalid() { return new IntakeError(400, "invalid_request", "Check the request fields and identifiers."); }
function bearer(request: Request) {
  const header = request.headers.get("authorization") || "";
  const match = /^Bearer ([^\s,]+)$/i.exec(header);
  if (!match || match[1].length > 16_384) throw new IntakeError(401, "identity_required", "Verify your account session and try again.");
  return match[1];
}
function requestDto(value: unknown): RequestDto {
  if (!object(value) || !uuid(value.requestId) || (value.status !== "requested" && value.status !== "cancelled") || !validTimestamp(value.requestedAt)
    || (value.status === "requested" ? value.cancelledAt !== null : !validTimestamp(value.cancelledAt) || timestampMicros(value.cancelledAt) < timestampMicros(value.requestedAt))) throw unavailable();
  // Select known fields; never forward an RPC's extra actor/email/private payload.
  return { requestId: value.requestId, status: value.status, requestedAt: value.requestedAt, cancelledAt: value.cancelledAt as string | null };
}
function sqlFailure(code: string | undefined, operationId?: string, expectedRevision?: string): IntakeError {
  if (code === "PD404") return new IntakeError(404, "request_not_found", "Account deletion request was not found.");
  if (code === "PD409") return new IntakeError(409, "operation_conflict", "This operation ID belongs to another action, request, or revision. Keep its original action, target, and revision.", false, operationId);
  if (code === "PD412" && operationId && validRevision(expectedRevision)) return new IntakeError(412, "intake_state_changed",
    "This operation was not recorded because account request state changed. Refresh its status before confirming a new action.", false, operationId, false, expectedRevision);
  if (code === "PD429" && operationId && validRevision(expectedRevision)) return new IntakeError(429, "intake_rate_limited",
    "Too many account request actions were recorded recently. Keep this same operation and try again later.", false, operationId, true, expectedRevision);
  if (code === "22023") return invalid();
  if (code === "PD401") return new IntakeError(401, "identity_required", "Verify your account session again before retrying this same operation.");
  if (code === "PD403") return new IntakeError(403, "admin_required", "Administrator access is required.");
  // PostgreSQL 42501 also signals missing RPC/table privileges. It is not evidence
  // of identity loss; after dispatch keep the original operation retryable.
  return unavailable(operationId);
}
export function publicIntakeError(error: unknown) {
  const failure = error instanceof IntakeError ? error : unavailable();
  return { status: failure.status, body: { ok: false, code: failure.code, message: failure.message, uncertain: failure.uncertain, retryable: failure.retryable,
    ...(failure.operationId ? { operationId: failure.operationId } : {}),
    ...(failure.expectedRevision !== undefined ? { expectedRevision: failure.expectedRevision } : {}) } };
}

export function createIntakeService(deps: IntakeDependencies) {
  const timeoutMs = Math.max(1, Math.min(deps.timeoutMs ?? 15_000, 30_000));
  async function bounded<T>(run: () => PromiseLike<T>, request: Request, operationId?: string): Promise<T> {
    if (request.signal.aborted) throw unavailable(operationId);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;
    const stop = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(unavailable(operationId)), timeoutMs);
      onAbort = () => reject(unavailable(operationId));
      request.signal.addEventListener("abort", onAbort, { once: true });
    });
    try { return await Promise.race([Promise.resolve().then(run), stop]); }
    catch (error) { if (error instanceof IntakeError) throw error; throw unavailable(operationId); }
    finally { if (timer) clearTimeout(timer); if (onAbort) request.signal.removeEventListener("abort", onAbort); }
  }
  async function actor(request: Request) {
    const token = bearer(request), client = deps.client();
    if (!client) throw unavailable();
    const result = await bounded(() => client.auth.getUser(token), request);
    if (!result || !object(result.data)) throw unavailable();
    if (result.error) {
      if ([400, 401, 403].includes(result.error.status || 0)) throw new IntakeError(401, "identity_required", "Verify your account session and try again.");
      throw unavailable();
    }
    if (!result.data.user) throw new IntakeError(401, "identity_required", "Verify your account session and try again.");
    if (!uuid(result.data.user.id)) throw unavailable();
    return { client, user: result.data.user, id: result.data.user.id.toLowerCase() };
  }
  async function rpc(client: RpcClient, request: Request, name: string, args: Record<string, unknown>, operationId?: string, expectedRevision?: string) {
    const response = await bounded(() => client.rpc(name, args), request, operationId);
    if (!response || typeof response !== "object") throw unavailable(operationId);
    if (response.error) throw sqlFailure(response.error.code, operationId, expectedRevision);
    if (!object(response.data) || response.data.ok !== true) throw unavailable(operationId);
    return response.data;
  }
  async function mutate(request: Request, input: unknown, action: "submit" | "cancel", requestId?: string) {
    if (!exactObject(input, action === "submit" ? ["operationId", "confirm", "expectedRevision"] : ["operationId", "action", "expectedRevision"]) || !uuid(input.operationId) || !validRevision(input.expectedRevision)
      || (action === "submit" ? input.confirm !== true : input.action !== "cancel" || !uuid(requestId))) throw invalid();
    const operationId = input.operationId.toLowerCase(), target = requestId?.toLowerCase(), expectedRevision = input.expectedRevision;
    const verified = await actor(request);
    const data = await rpc(verified.client, request, action === "submit" ? "submit_account_deletion_request" : "cancel_account_deletion_request",
      { p_actor_id: verified.id, p_operation_id: operationId, p_expected_revision: expectedRevision, ...(target ? { p_request_id: target } : {}) }, operationId, expectedRevision);
    try {
      const current = requestDto(data.request), receipt = data.receipt;
      if (!object(receipt) || receipt.operationId !== operationId || receipt.expectedRevision !== expectedRevision || receipt.action !== action || receipt.requestId !== current.requestId || !validTimestamp(receipt.recordedAt)
        || (target && (current.requestId !== target || current.status !== "cancelled"))) throw unavailable(operationId);
      return { ok: true as const, receipt: { operationId, expectedRevision, action, requestId: current.requestId, recordedAt: receipt.recordedAt } satisfies ReceiptDto, request: current };
    } catch { throw unavailable(operationId); }
  }
  return {
    submit: (request: Request, input: unknown) => mutate(request, input, "submit"),
    cancel: (request: Request, requestId: string, input: unknown) => mutate(request, input, "cancel", requestId),
    async read(request: Request, requestId?: string) {
      if (requestId !== undefined && !uuid(requestId)) throw invalid();
      const verified = await actor(request), target = requestId?.toLowerCase();
      const data = await rpc(verified.client, request, "read_account_deletion_requests", { p_actor_id: verified.id, p_request_id: target || null });
      const selected = data.request === null ? null : requestDto(data.request), active = data.activeRequest === null ? null : requestDto(data.activeRequest), latest = data.latestRequest === null ? null : requestDto(data.latestRequest);
      const fulfillment = queueFulfillment(data.fulfillment);
      if (!validRevision(data.revision) || (target ? selected?.requestId !== target : selected !== null) || (active && active.status !== "requested")
        || (fulfillment !== null && (!active || fulfillment.state === "completed"))) throw unavailable();
      return { ok: true as const, revision: data.revision, request: selected, activeRequest: active, latestRequest: latest, fulfillment };
    },
    async queue(request: Request, cursor: { beforeRequestedAt?: string; beforeId?: string; limit?: number }) {
      const limit = cursor.limit ?? 50;
      if (!Number.isInteger(limit) || limit < 1 || limit > 100 || ((cursor.beforeRequestedAt === undefined) !== (cursor.beforeId === undefined))
        || (cursor.beforeRequestedAt !== undefined && (!validTimestamp(cursor.beforeRequestedAt) || !uuid(cursor.beforeId)))) throw invalid();
      const verified = await actor(request), access = await bounded(() => deps.requireAdmin(request), request);
      if (!access.ok) {
        // The existing gate verifies Auth again and can collapse its dependency
        // failures to 401. After our verified identity, that disagreement is an
        // unavailable check, not proof that this person voluntarily signed out.
        if (access.response.status >= 500 || access.response.status === 429 || access.response.status === 401) throw unavailable();
        throw new IntakeError(403, "admin_required", "Administrator access is required.");
      }
      if (!access.admin.user || access.admin.user.id.toLowerCase() !== verified.id) throw unavailable();
      const email = (verified.user.email || "").trim().toLowerCase();
      const environmentAdmin = Boolean(email) && deps.readAdminEmails().some(value => value.trim().toLowerCase() === email);
      const data = await rpc(verified.client, request, "read_account_deletion_queue", {
        p_actor_id: verified.id, p_environment_admin: environmentAdmin, p_before_requested_at: cursor.beforeRequestedAt || null,
        p_before_id: cursor.beforeId?.toLowerCase() || null, p_limit: limit
      });
      if (!Array.isArray(data.requests) || data.requests.length > limit) throw unavailable();
      const ids = new Set<string>();
      const requests = data.requests.map(value => {
        const item = requestDto(value);
        if (!object(value) || (value.actorId !== null && !uuid(value.actorId)) || item.status !== "requested" || ids.has(item.requestId)
          || !Array.isArray(value.profileReviews) || !Array.isArray(value.retentionReviews) || value.retentionReviews.length>2
          || !Array.isArray(value.storageReviews) || value.storageReviews.length>10_000) throw unavailable();
        const profileReviews=value.profileReviews.map(queueProfileReview),retentionReviews=value.retentionReviews.map(queueRetentionReview),storageReviews=value.storageReviews.map(queueStorageReview);
        if(new Set(profileReviews.map(row=>row.guitarId)).size!==profileReviews.length||new Set(retentionReviews.map(row=>row.domain)).size!==retentionReviews.length
          ||new Set(storageReviews.map(row=>row.relocationId)).size!==storageReviews.length)throw unavailable();
        ids.add(item.requestId);
        return { ...item, actorId: value.actorId === null ? null : value.actorId.toLowerCase(), fulfillment: queueFulfillment(value.fulfillment), profileReviews, retentionReviews, storageReviews };
      });
      return { ok: true as const, requests };
    }
  };
}
export type IntakeService = ReturnType<typeof createIntakeService>;
