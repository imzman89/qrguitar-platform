import { randomUUID } from "node:crypto";

export type ServiceEmailIntent = { id: string; leaseToken: string };
export type ServiceEmailDispatch = { to: string; profileTitle: string; providerName: string; submissionId: string };
export type ServiceEmailOutcome = {
  outcome: "accepted" | "rejected" | "unknown";
  providerMessageId?: string;
  retryable?: boolean;
  retryAfterSeconds?: number;
};
export type ServiceEmailReceipt = { state: "accepted" | "retry" | "failed" | "unknown"; providerMessageId?: string; retryAfterSeconds?: number };
export type ServiceEmailOutboxStore = {
  claim(leaseToken: string): Promise<ServiceEmailIntent | null>;
  begin(intent: ServiceEmailIntent): Promise<ServiceEmailDispatch | null>;
  settle(intent: ServiceEmailIntent, receipt: ServiceEmailReceipt): Promise<void>;
};
const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

/** Bounded transport worker; runtime and database dispatch gates default to disabled. */
export function createServiceEmailOutboxWorker(deps: {
  store: ServiceEmailOutboxStore;
  send(input: ServiceEmailDispatch & { reviewUrl: string; idempotencyKey: string }, signal: AbortSignal): Promise<ServiceEmailOutcome>;
  origin: string;
  mode?: "production" | "isolated";
  now?: () => number;
  uuid?: () => string;
  databaseTimeoutMs?: number;
  sendTimeoutMs?: number;
}) {
  const site = new URL(deps.origin);
  const allowedOrigin = deps.mode === "isolated"
    ? ["127.0.0.1", "[::1]"].includes(site.hostname) && ["http:", "https:"].includes(site.protocol) && Number(site.port) >= 1024
    : site.origin === "https://www.qrguitar.com";
  if (!allowedOrigin || site.pathname !== "/" || site.search || site.hash || site.username || site.password) throw new Error("Invalid service email origin.");
  const clock = deps.now || Date.now;
  async function bounded<T>(run: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([Promise.resolve().then(() => run(controller.signal)), new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error("Service email operation timed out.")); }, timeoutMs);
      })]);
    } finally { if (timer) clearTimeout(timer); }
  }
  const db = <T>(run: () => Promise<T>) => bounded(run, deps.databaseTimeoutMs ?? 5000);
  return {
    async run() {
      const counts = { claimed: 0, accepted: 0, retry: 0, failed: 0, unknown: 0, suppressed: 0 };
      const started = clock();
      // A single run is intentionally small; persisted intents, not request lifetime, own recovery.
      while (counts.claimed < 3 && clock() - started < 15000) {
        const leaseToken = (deps.uuid || randomUUID)();
        if (!uuid(leaseToken)) throw new Error("Invalid service email lease.");
        const intent = await db(() => deps.store.claim(leaseToken));
        if (!intent) break;
        if (!uuid(intent.id) || intent.leaseToken !== leaseToken) throw new Error("Invalid service email claim.");
        counts.claimed++;
        // Unknown begin result must never trigger a send. Lease recovery handles the ambiguity.
        const delivery = await db(() => deps.store.begin(intent));
        if (!delivery) { counts.suppressed++; continue; }
        let receipt: ServiceEmailReceipt;
        if (!uuid(delivery.submissionId) || !delivery.to || /[\r\n]/.test(delivery.to)
          || typeof delivery.profileTitle !== "string" || typeof delivery.providerName !== "string") {
          receipt = { state: "failed" };
        } else {
          let result: ServiceEmailOutcome;
          try {
            result = await bounded(signal => deps.send({ ...delivery,
              reviewUrl: `${site.origin}/service-review/${encodeURIComponent(delivery.submissionId)}`,
              idempotencyKey: intent.id
            }, signal), deps.sendTimeoutMs ?? 12000);
          } catch { result = { outcome: "unknown" }; }
          const messageId = typeof result?.providerMessageId === "string" && result.providerMessageId.length <= 300 && !/[\r\n\x00-\x1f]/.test(result.providerMessageId) ? result.providerMessageId : undefined;
          if (result?.outcome === "accepted" && messageId) receipt = { state: "accepted", providerMessageId: messageId };
          else if (result?.outcome === "rejected") receipt = result.retryable ? {
            state: "retry", retryAfterSeconds: Number.isFinite(result.retryAfterSeconds) ? Math.min(21600, Math.max(60, Math.ceil(result.retryAfterSeconds!))) : 60
          } : { state: "failed" };
          else receipt = { state: "unknown" };
        }
        // A receipt write failure fails the run. Never announce success or resend after uncertain acceptance.
        await db(() => deps.store.settle(intent, receipt));
        counts[receipt.state]++;
      }
      return counts;
    }
  };
}

/** RPC adapter keeps delivery payloads out of worker logs and browser-facing status. */
export function createServiceEmailOutboxStore(database: { rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }> }): ServiceEmailOutboxStore {
  async function rpc(name: string, args: Record<string, unknown>) {
    const result = await database.rpc(name, args);
    if (result.error) throw new Error("Service email persistence is unavailable.");
    return result.data;
  }
  return {
    async claim(leaseToken) {
      const value = await rpc("claim_service_email_intent", { p_lease_token: leaseToken });
      if (value === null) return null;
      const row = value as ServiceEmailIntent;
      if (!uuid(row?.id) || row.leaseToken !== leaseToken) throw new Error("Invalid service email claim receipt.");
      return row;
    },
    async begin(intent) {
      const value = await rpc("begin_service_email_dispatch", { p_intent_id: intent.id, p_lease_token: intent.leaseToken });
      if (value === null) return null;
      return value as ServiceEmailDispatch;
    },
    async settle(intent, receipt) {
      const result = await rpc("settle_service_email_intent", { p_intent_id: intent.id, p_lease_token: intent.leaseToken,
        p_state: receipt.state, p_provider_message_id: receipt.providerMessageId || null, p_retry_after_seconds: receipt.retryAfterSeconds ?? 60 });
      if (result !== true) throw new Error("Service email outcome could not be confirmed.");
    }
  };
}
