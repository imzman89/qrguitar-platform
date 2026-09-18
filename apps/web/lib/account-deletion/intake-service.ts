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
  "billing_retention_migration_required", "unused_profile_credits", "storage_cleanup_required", "active_ownership_transfer",
  "storage_quiescence_required", "active_ownership_claim", "active_service_workflow", "service_record_migration_required",
  "retained_personal_content_review_required"]);
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
        if (!object(value) || (value.actorId !== null && !uuid(value.actorId)) || item.status !== "requested" || ids.has(item.requestId)) throw unavailable();
        ids.add(item.requestId);
        return { ...item, actorId: value.actorId === null ? null : value.actorId.toLowerCase(), fulfillment: queueFulfillment(value.fulfillment) };
      });
      return { ok: true as const, requests };
    }
  };
}
export type IntakeService = ReturnType<typeof createIntakeService>;
