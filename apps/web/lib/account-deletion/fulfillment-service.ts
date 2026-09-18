import { randomUUID } from "node:crypto";
import { exactObject, uuid, validRevision, validTimestamp } from "./intake-service";

export const fulfillmentBlockers = [
  "administrator_account", "unused_paid_credits", "unresolved_payment_order", "payment_hold_or_dispute",
  "billing_retention_migration_required", "unused_profile_credits", "storage_cleanup_required",
  "storage_quiescence_required",
  "active_ownership_transfer", "active_ownership_claim", "active_service_workflow", "service_record_migration_required",
  "retained_personal_content_review_required"
] as const;
export type FulfillmentBlocker = typeof fulfillmentBlockers[number];
export type FulfillmentState = "blocked" | "quiescing_storage" | "ready_for_auth_deletion" | "completed";
export type FulfillmentDto = {
  requestId: string; state: FulfillmentState; blockers: FulfillmentBlocker[]; revision: string;
  startedAt: string; reviewedAt: string; storageQuiesceUntil: string | null;
  databaseAnonymizedAt: string | null; authDeletedAt: string | null; completedAt: string | null;
};

type RpcError = { code?: string; message?: string } | null;
type AdminClient = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: RpcError }>;
  auth: { admin: { deleteUser(id: string): PromiseLike<{ data?: unknown; error: { code?: string; status?: number; message?: string } | null }> } };
};
type AdminGate = (request: Request) => PromiseLike<
  { ok: true; supabase: AdminClient; admin: { user: { id: string; email?: string | null } | null; accessSource?: string } } |
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
    return { client: gate.supabase, adminId: gate.admin.user.id.toLowerCase(), environmentAdmin: gate.admin.accessSource === "env" };
  }
  async function rpc(client: AdminClient, name: string, args: Record<string, unknown>) {
    let result: { data: unknown; error: RpcError };
    try { result = await bounded(() => client.rpc(name, args)); } catch (error) { if (error instanceof FulfillmentError) throw error; throw mapped(null); }
    if (!result || result.error) throw mapped(result?.error || null);
    if (!object(result.data) || result.data.ok !== true) throw mapped(null);
    return result.data;
  }
  type VerifiedAccess = { client: AdminClient; adminId: string; environmentAdmin: boolean };
  const env = (verified: VerifiedAccess, requestId: string) => ({ p_admin_id: verified.adminId, p_environment_admin: verified.environmentAdmin, p_request_id: requestId });
  return {
    async read(request: Request, requestId: string) {
      if (!uuid(requestId)) throw new FulfillmentError(400, "invalid_request", "A valid deletion request is required.");
      const current = await access(request), data = await rpc(current.client, "read_account_deletion_fulfillment", env(current, requestId.toLowerCase()));
      return { ok: true as const, fulfillment: data.fulfillment === null ? null : fulfillmentDto(data.fulfillment) };
    },
    async execute(request: Request, requestId: string, input: unknown) {
      if (!uuid(requestId) || !exactObject(input, ["operationId", "action"]) || input.action !== "prepare" || !uuid(input.operationId)) {
        throw new FulfillmentError(400, "invalid_request", "A valid prepare operation is required.");
      }
      const normalizedRequest = requestId.toLowerCase(), normalizedOperation = input.operationId.toLowerCase(), current = await access(request);
      const prepared = await rpc(current.client, "prepare_account_deletion_fulfillment", {
        ...env(current, normalizedRequest), p_operation_id: normalizedOperation,
        p_protected_admin_emails: protectedAdminEmails()
      });
      let fulfillment = fulfillmentDto(prepared.fulfillment);
      if (fulfillment.requestId !== normalizedRequest) throw mapped(null);
      if (fulfillment.state !== "ready_for_auth_deletion") return { ok: true as const, fulfillment };
      const actorId = prepared.authActorId;
      if (actorId !== null && !uuid(actorId)) throw mapped(null);
      if (actorId) {
        // A provider failure is never treated as proof of deletion. The database
        // finalizer below independently requires the Auth row to be absent.
        try { await bounded(() => current.client.auth.admin.deleteUser(actorId.toLowerCase())); } catch { /* verified below */ }
      }
      try {
        const completed = await rpc(current.client, "complete_account_deletion_fulfillment", {
          ...env(current, normalizedRequest), p_operation_id: makeId()
        });
        fulfillment = fulfillmentDto(completed.fulfillment);
      } catch (error) {
        if (error instanceof FulfillmentError && error.code === "fulfillment_not_ready") {
          throw new FulfillmentError(503, "auth_deletion_pending", "Database anonymization is complete, but Auth deletion is not confirmed. Retry this operation; QRguitar will not report completion early.", true);
        }
        throw error;
      }
      if (fulfillment.state !== "completed") throw mapped(null);
      return { ok: true as const, fulfillment };
    }
  };
}
export type FulfillmentService = ReturnType<typeof createFulfillmentService>;
