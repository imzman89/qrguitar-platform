type Database = {
  rpc(name: string, args: Record<string, unknown>, signal: AbortSignal): Promise<{ data: unknown; error: unknown }>;
};
type Administrator = { actorId: string; envAdmin: boolean };
type Result = { ok: true; status: unknown } | { ok: false; code: string; message: string };
const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const timestamp = (value: unknown): value is string => typeof value === "string" && value.length <= 40
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
const unavailable = (code = "unavailable"): Result => ({ ok: false, code, message: code === "unconfirmed"
  ? "Review outcome is unconfirmed. Refresh delivery status before taking another action."
  : "Delivery review is unavailable. Refresh and try again." });

// Explicit projection prevents database diagnostics, private notes or recipients reaching a future UI.
function item(value: unknown) {
  if (!record(value) || !uuid(value.id) || !["claim.ownerReview", "claim.moreInfo", "service.revisionRequested"].includes(String(value.event))
    || !["queued", "leased", "dispatching", "retry", "accepted", "failed", "unknown", "suppressed"].includes(String(value.state))
    || !Number.isInteger(value.attempts) || Number(value.attempts) < 0 || Number(value.attempts) > 6
    || !timestamp(value.updatedAt) || !timestamp(value.createdAt) || !timestamp(value.nextAttemptAt)
    || typeof value.canRetry !== "boolean" || typeof value.canReconcile !== "boolean"
    || (value.code !== null && (typeof value.code !== "string" || !/^[a-z_]{1,100}$/.test(value.code)))
    || (value.event === "service.revisionRequested" ? !uuid(value.submissionId) || value.claimId !== null : !uuid(value.claimId) || value.submissionId !== null)) {
    throw new Error("Invalid operator receipt");
  }
  return { id: value.id, event: value.event, state: value.state, attempts: value.attempts,
    claimId: value.claimId, submissionId: value.submissionId, updatedAt: value.updatedAt, createdAt: value.createdAt,
    nextAttemptAt: value.nextAttemptAt, code: value.code, canRetry: value.canRetry, canReconcile: value.canReconcile };
}
function page(value: unknown) {
  if (!record(value) || !Array.isArray(value.items) || value.items.length > 50 || value.limit !== 50
    || typeof value.captureEnabled !== "boolean" || typeof value.dispatchEnabled !== "boolean"
    || (value.oldestPendingAt !== null && !timestamp(value.oldestPendingAt))) throw new Error("Invalid operator page");
  const counts: Record<string, number> = {};
  for (const key of ["queued", "unknown", "failed", "accepted", "inFlight", "suppressed", "total", "offset"]) {
    if (!Number.isSafeInteger(value[key]) || Number(value[key]) < 0) throw new Error("Invalid operator counts");
    counts[key] = Number(value[key]);
  }
  return { ...counts, offset: counts.offset, captureEnabled: value.captureEnabled, dispatchEnabled: value.dispatchEnabled,
    oldestPendingAt: value.oldestPendingAt, limit: 50, items: value.items.map(item) };
}

/** Preparation only: no mounted route, environment activation or transport dependency. */
export function createActionEmailOperator(deps: {
  enabled?: boolean;
  // Server boundary must authenticate and authorize the actual caller; never populate from request JSON.
  authorize(signal: AbortSignal): Promise<Administrator | null>;
  database: Database;
  timeoutMs?: number;
}) {
  async function bounded<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([Promise.resolve().then(() => run(controller.signal)), new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error("Operator operation timed out")); }, deps.timeoutMs ?? 5000);
      })]);
    } finally { if (timer) clearTimeout(timer); }
  }
  async function actor() {
    const auth = await bounded(signal => deps.authorize(signal));
    return auth && uuid(auth.actorId) && typeof auth.envAdmin === "boolean" ? auth : null;
  }
  const disabled: Result = { ok: false, code: "disabled", message: "Action-email operator controls are not enabled." };
  const forbidden: Result = { ok: false, code: "forbidden", message: "Administrator access is required." };
  return {
    async list(offset = 0): Promise<Result> {
      if (deps.enabled !== true) return disabled;
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) return { ok: false, code: "invalid", message: "Invalid delivery page." };
      try {
        if (!await actor()) return forbidden;
        const result = await bounded(signal => deps.database.rpc("action_email_admin_status", { p_offset: offset }, signal));
        if (result.error) return unavailable();
        const status = page(result.data);
        if (status.offset !== offset) return unavailable();
        return { ok: true, status };
      } catch { return unavailable(); }
    },
    async reconcile(input: unknown): Promise<Result> {
      if (deps.enabled !== true) return disabled;
      if (!record(input) || !uuid(input.intentId) || !timestamp(input.expectedUpdatedAt)
        || !["retry", "confirmed_accepted", "confirmed_not_accepted"].includes(String(input.resolution))
        || typeof input.reason !== "string" || input.reason.trim().length < 10 || input.reason.length > 1000 || /[\x00-\x1f\x7f]/.test(input.reason)
        || (input.resolution === "confirmed_accepted"
          ? typeof input.providerMessageId !== "string" || !input.providerMessageId.trim() || input.providerMessageId.length > 300 || /[\x00-\x1f\x7f]/.test(input.providerMessageId)
          : input.providerMessageId != null)) {
        return { ok: false, code: "invalid", message: "Record provider evidence without personal information. Confirmed acceptance requires the provider receipt." };
      }
      let auth: Administrator | null;
      try { auth = await actor(); } catch { return unavailable(); }
      if (!auth) return forbidden;
      const reason = input.reason.trim();
      try {
        const result = await bounded(signal => deps.database.rpc("reconcile_action_email", {
          p_intent_id: input.intentId, p_actor_id: auth.actorId, p_env_admin: auth.envAdmin,
          p_resolution: input.resolution, p_reason: reason,
          p_provider_message_id: input.resolution === "confirmed_accepted" ? (input.providerMessageId as string).trim() : null,
          p_expected_updated_at: input.expectedUpdatedAt
        }, signal));
        // Transport loss can follow commit; no automatic replay or optimistic success.
        if (result.error) return unavailable("unconfirmed");
        const status = item(result.data);
        if (status.id !== input.intentId || (input.resolution === "confirmed_accepted"
          ? status.state !== "accepted" : !["retry", "failed", "suppressed"].includes(String(status.state)))) return unavailable("unconfirmed");
        return { ok: true, status };
      } catch { return unavailable("unconfirmed"); }
    }
  };
}
