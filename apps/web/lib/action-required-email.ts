import { randomUUID } from "node:crypto";
import type { ServiceEmailOutcome, ServiceEmailReceipt } from "./service-email-outbox";

export type ActionEmailFamily = "claim.ownerReview" | "claim.moreInfo" | "claim.approved" | "claim.declined" | "claim.expired" | "service.revisionRequested" | "service.approved" | "service.declined" | "service.cancelled" | "ownership.transferAccepted" | "ownership.transferCancelled";
export type ActionEmailInput = { event: ActionEmailFamily; to: string; profileTitle: string; actionUrl: string; claimUrl?: string; idempotencyKey: string };
type Intent = { id: string; leaseToken: string };
type Dispatch = { event: ActionEmailFamily; to: string; profileTitle: string; subjectId: string; qrCode?: string | null; serviceRole?: "provider" | "owner" | null };
type Database = { rpc(name: string, args: Record<string, unknown>, signal: AbortSignal): Promise<{ data: unknown; error: unknown }> };
const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export function actionEmailInput(value: unknown, intentId: string): ActionEmailInput {
  const row = value as Dispatch;
  if (!uuid(intentId) || !uuid(row?.subjectId) || !["claim.ownerReview", "claim.moreInfo", "claim.approved", "claim.declined", "claim.expired", "service.revisionRequested", "service.approved", "service.declined", "service.cancelled", "ownership.transferAccepted", "ownership.transferCancelled"].includes(row?.event)
    || typeof row.to !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.to) || /[\x00-\x1f]/.test(row.to)
    || typeof row.profileTitle !== "string" || row.profileTitle.length > 500) throw new Error("Invalid action email payload.");
  const serviceOutcome = ["service.approved", "service.declined", "service.cancelled"].includes(row.event);
  const transferOutcome = ["ownership.transferAccepted", "ownership.transferCancelled"].includes(row.event);
  if (serviceOutcome ? !["provider", "owner"].includes(String(row.serviceRole)) || (row.event !== "service.cancelled" && row.serviceRole !== "provider") : row.serviceRole != null) throw new Error("Invalid service recipient role.");
  if (transferOutcome && row.qrCode !== null) throw new Error("Invalid transfer destination.");
  if ((["service.revisionRequested", "claim.approved"].includes(row.event) || (serviceOutcome && row.serviceRole === "provider"))
    && (typeof row.qrCode !== "string" || !/^QRG-[A-Z0-9][A-Z0-9-]{0,75}$/.test(row.qrCode))) throw new Error("Invalid Profile path.");
  if (serviceOutcome && row.serviceRole === "owner" && row.qrCode !== null) throw new Error("Invalid owner service destination.");
  const claimUrl = row.event === "claim.approved" ? `https://www.qrguitar.com/ownership-claim?claim=${row.subjectId}` : undefined;
  const path = row.event === "service.revisionRequested" || (serviceOutcome && row.serviceRole === "provider")
    ? `/service-work/${encodeURIComponent(row.qrCode!)}?submission=${row.subjectId}`
    : serviceOutcome ? `/service-review/${row.subjectId}`
    : transferOutcome ? `/transfer/${row.subjectId}`
    : row.event === "claim.approved" ? `/i/${encodeURIComponent(row.qrCode!)}`
    : `/ownership-claim?claim=${row.subjectId}`;
  // Return a strict allowlist. Private source notes and evidence never reach the renderer.
  return { event: row.event, to: row.to, profileTitle: row.profileTitle, actionUrl: `https://www.qrguitar.com${path}`, ...(claimUrl ? { claimUrl } : {}), idempotencyKey: intentId };
}

/** Callable integration adapter, not a live route. Capture and dispatch require separate DB gates. */
export function createActionEmailWorker(deps: {
  enabled?: boolean;
  database: Database;
  send(input: ActionEmailInput, signal: AbortSignal): Promise<ServiceEmailOutcome>;
  prepare?(input: ActionEmailInput, signal: AbortSignal): Promise<(signal: AbortSignal) => Promise<ServiceEmailOutcome>>;
  now?: () => number;
  uuid?: () => string;
  databaseTimeoutMs?: number;
  prepareTimeoutMs?: number;
  sendTimeoutMs?: number;
}) {
  async function bounded<T>(run: (signal: AbortSignal) => Promise<T>, milliseconds: number): Promise<T> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([Promise.resolve().then(() => run(controller.signal)), new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error("Action email operation timed out.")); }, milliseconds);
      })]);
    } finally { if (timer) clearTimeout(timer); }
  }
  async function rpc(name: string, args: Record<string, unknown>) {
    const result = await bounded(signal => deps.database.rpc(name, args, signal), deps.databaseTimeoutMs ?? 5000);
    if (result.error) throw new Error("Action email persistence unavailable.");
    return result.data;
  }
  return { async run() {
    const counts = { claimed: 0, accepted: 0, retry: 0, failed: 0, unknown: 0, suppressed: 0 };
    if (deps.enabled !== true) return { ...counts, disabled: true };
    const clock = deps.now || Date.now, start = clock();
    while (counts.claimed < 3 && clock() - start < 15000) {
      const lease = (deps.uuid || randomUUID)();
      if (!uuid(lease)) throw new Error("Invalid action email lease.");
      const intent = await rpc("claim_action_email", { p_lease_token: lease }) as Intent | null;
      if (!intent) break;
      if (!uuid(intent.id) || intent.leaseToken !== lease) throw new Error("Invalid action email claim.");
      counts.claimed++;
      const dispatch = await rpc("begin_action_email", { p_intent_id: intent.id, p_lease_token: lease });
      if (!dispatch) { counts.suppressed++; continue; }
      let receipt: ServiceEmailReceipt;
      let input: ActionEmailInput | null = null;
      try { input = actionEmailInput(dispatch, intent.id); } catch { /* A malformed persisted payload is a definite no-send. */ }
      if (!input) receipt = { state: "failed" };
      else {
        let prepared: ((signal: AbortSignal) => Promise<ServiceEmailOutcome>) | null = signal => deps.send(input!, signal);
        if (deps.prepare) {
          // Preparation may load content/render only. A timed-out closure is never invoked.
          try {
            prepared = await bounded(signal => deps.prepare!(input!, signal), deps.prepareTimeoutMs ?? 5000);
            if (typeof prepared !== "function") prepared = null;
          } catch { prepared = null; }
        }
        if (!prepared) receipt = { state: "retry", retryAfterSeconds: 60 };
        else {
        let result: ServiceEmailOutcome;
        try { result = await bounded(prepared, deps.sendTimeoutMs ?? 12000); }
        catch { result = { outcome: "unknown" }; }
        const messageId = typeof result?.providerMessageId === "string" && result.providerMessageId.trim() && result.providerMessageId.length <= 300 && !/[\x00-\x1f]/.test(result.providerMessageId) ? result.providerMessageId : undefined;
        if (result?.outcome === "accepted" && messageId) receipt = { state: "accepted", providerMessageId: messageId };
        else if (result?.outcome === "rejected") receipt = result.retryable ? { state: "retry", retryAfterSeconds: Number.isFinite(result.retryAfterSeconds) ? Math.min(21600, Math.max(60, Math.ceil(result.retryAfterSeconds!))) : 60 } : { state: "failed" };
        else receipt = { state: "unknown" };
        }
      }
      const saved = await rpc("settle_action_email", { p_intent_id: intent.id, p_lease_token: lease, p_state: receipt.state, p_provider_message_id: receipt.providerMessageId || null, p_retry_after_seconds: receipt.retryAfterSeconds || 60 });
      if (saved !== true) throw new Error("Action email receipt unavailable; do not resend.");
      counts[receipt.state]++;
    }
    return { ...counts, disabled: false };
  } };
}
