import type { BillingAuth } from "./billing-client";
import { createPaymentSessionScope, PaymentRequestError, directOrderId } from "./direct-payments-client";
import type { PayPalAdminReview, PayPalReviewAction, PayPalWebhookDelivery } from "./paypal-admin-reviews";

type Value = Record<string, unknown>;
type HoldDecision = { action: PayPalReviewAction; eventId: string; orderId: string; ownerId: string; decisionId: string; reason: string };
type DeliveryDecision = { action: "retry_delivery"; deliveryId: string; decisionId: string; reason: string };
type AcknowledgeDecision = { action: "acknowledge_delivery"; deliveryId: string; decisionId: string; reason: string };
type Decision = HoldDecision | DeliveryDecision | AcknowledgeDecision;
type DecisionInput = Omit<HoldDecision, "decisionId"> | Omit<DeliveryDecision, "decisionId"> | Omit<AcknowledgeDecision, "decisionId">;
type Dependencies = { auth: () => BillingAuth; fetch?: typeof fetch; timeoutMs?: number; randomUUID?: () => string; storage?: () => Pick<Storage, "getItem" | "setItem" | "removeItem"> };
const EVENT_ID = /^[A-Za-z0-9_:-]{3,200}$/;
const PROVIDER_ID = /^[A-Za-z0-9_.:-]{1,255}$/;
const object = (value: unknown): Value => value && typeof value === "object" && !Array.isArray(value) ? value as Value : {};
const safeText = (value: unknown, max: number, min = 1) => typeof value === "string" && value.trim().length >= min && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);
const nullableId = (value: unknown) => value === null || (typeof value === "string" && PROVIDER_ID.test(value));
function readReview(value: unknown): PayPalAdminReview {
  const row = object(value), decision = row.lastDecision === null ? null : object(row.lastDecision);
  if (!EVENT_ID.test(String(row.eventId)) || !directOrderId(row.orderId) || !directOrderId(row.ownerId)
    || row.reference !== `QRG-${row.orderId}` || !safeText(row.holdReason, 100)
    || !["payment", "refund", "dispute", "expired", "error"].includes(String(row.receiptKind))
    || !(row.providerEventId === null || (typeof row.providerEventId === "string" && PROVIDER_ID.test(row.providerEventId)))
    || !(row.eventType === null || (typeof row.eventType === "string" && /^[A-Z0-9_.-]{3,100}$/.test(row.eventType)))
    || !(row.eventCursor === null || (Number.isSafeInteger(row.eventCursor) && Number(row.eventCursor) >= 0))
    || !(row.resourceKind === null || ["capture", "refund", "dispute", "order"].includes(String(row.resourceKind)))
    || !nullableId(row.resourceId) || !nullableId(row.refundId) || !nullableId(row.disputeId) || !nullableId(row.caseId)
    || !nullableId(row.paypalOrderId) || !nullableId(row.captureId)
    || !(row.providerStatus === null || safeText(row.providerStatus, 100))
    || !(row.amount === null || (Number.isSafeInteger(row.amount) && Number(row.amount) >= 0))
    || !(row.currency === null || (typeof row.currency === "string" && /^[A-Z]{3}$/.test(row.currency)))
    || !Number.isSafeInteger(row.expectedAmount) || Number(row.expectedAmount) <= 0 || row.expectedCurrency !== "USD"
    || !Number.isSafeInteger(row.credits) || Number(row.credits) <= 0
    || typeof row.createdAt !== "string" || !Number.isFinite(Date.parse(row.createdAt))) throw new Error("The PayPal review queue could not be verified.");
  if (decision && (!["release", "retain_hold"].includes(String(decision.action)) || !safeText(decision.reason, 1000, 10)
    || typeof decision.createdAt !== "string" || !Number.isFinite(Date.parse(decision.createdAt)))) throw new Error("The PayPal review queue could not be verified.");
  return {
    eventId: String(row.eventId), orderId: String(row.orderId), ownerId: String(row.ownerId), reference: String(row.reference),
    holdReason: String(row.holdReason), receiptKind: row.receiptKind as PayPalAdminReview["receiptKind"],
    providerEventId: row.providerEventId as string | null, eventType: row.eventType as string | null, eventCursor: row.eventCursor as number | null,
    resourceKind: row.resourceKind as PayPalAdminReview["resourceKind"], resourceId: row.resourceId as string | null,
    refundId: row.refundId as string | null, disputeId: row.disputeId as string | null, caseId: row.caseId as string | null,
    paypalOrderId: row.paypalOrderId as string | null, captureId: row.captureId as string | null,
    providerStatus: row.providerStatus as string | null, amount: row.amount as number | null, currency: row.currency as string | null,
    expectedAmount: Number(row.expectedAmount), expectedCurrency: "USD", credits: Number(row.credits), createdAt: String(row.createdAt),
    lastDecision: decision ? { action: decision.action as PayPalReviewAction, reason: String(decision.reason), createdAt: String(decision.createdAt) } : null
  };
}

function readDelivery(value: unknown): PayPalWebhookDelivery {
  const row = object(value);
  if (!directOrderId(row.deliveryId) || !["queued", "verified", "planned", "retry", "processing", "completed", "quarantined"].includes(String(row.state))
    || !(row.eventId === null || (typeof row.eventId === "string" && /^[A-Za-z0-9_-]{8,100}$/.test(row.eventId)))
    || !(row.eventType === null || (typeof row.eventType === "string" && /^[A-Z0-9_.-]{3,100}$/.test(row.eventType)))
    || !Number.isSafeInteger(row.cursor) || Number(row.cursor) < 0 || Number(row.cursor) > 20
    || !(row.totalItems === null || (Number.isSafeInteger(row.totalItems) && Number(row.totalItems) >= 1 && Number(row.totalItems) <= 20 && Number(row.cursor) <= Number(row.totalItems)))
    || !Number.isSafeInteger(row.attemptCount) || Number(row.attemptCount) < 0 || Number(row.attemptCount) > 2147483647
    || !(row.lastErrorCode === null || (typeof row.lastErrorCode === "string" && /^[a-z0-9_]{3,80}$/.test(row.lastErrorCode)))
    || !(row.outcomeCode === null || (typeof row.outcomeCode === "string" && /^[a-z0-9_]{3,80}$/.test(row.outcomeCode)))
    || !(row.rawAvailable === undefined || row.rawAvailable === null || typeof row.rawAvailable === "boolean")
    || !(row.continuationAvailable === undefined || row.continuationAvailable === null || typeof row.continuationAvailable === "boolean")
    || !(row.acknowledgedAt === undefined || row.acknowledgedAt === null || (typeof row.acknowledgedAt === "string" && Number.isFinite(Date.parse(row.acknowledgedAt))))
    || typeof row.nextAttemptAt !== "string" || !Number.isFinite(Date.parse(row.nextAttemptAt))
    || !(row.lockedUntil === null || (typeof row.lockedUntil === "string" && Number.isFinite(Date.parse(row.lockedUntil))))
    || typeof row.receivedAt !== "string" || !Number.isFinite(Date.parse(row.receivedAt))
    || typeof row.updatedAt !== "string" || !Number.isFinite(Date.parse(row.updatedAt))) throw new Error("The PayPal delivery queue could not be verified.");
  return {
    deliveryId: String(row.deliveryId), state: row.state as PayPalWebhookDelivery["state"], eventId: row.eventId as string | null,
    eventType: row.eventType as string | null, cursor: Number(row.cursor), totalItems: row.totalItems as number | null,
    attemptCount: Number(row.attemptCount), lastErrorCode: row.lastErrorCode as string | null, outcomeCode: row.outcomeCode as string | null,
    rawAvailable: typeof row.rawAvailable === "boolean" ? row.rawAvailable : null,
    continuationAvailable: typeof row.continuationAvailable === "boolean" ? row.continuationAvailable : null,
    acknowledgedAt: typeof row.acknowledgedAt === "string" ? row.acknowledgedAt : null,
    nextAttemptAt: String(row.nextAttemptAt), lockedUntil: row.lockedUntil as string | null,
    receivedAt: String(row.receivedAt), updatedAt: String(row.updatedAt)
  };
}

export type PayPalAdminReviewsState = {
  phase: "loading" | "signed-out" | "ready" | "error"; actorId: string; environment: "live" | "test" | "";
  reviews: PayPalAdminReview[]; deliveries: PayPalWebhookDelivery[]; hasMore: boolean; busy: boolean; refreshing: boolean; message: string; pendingDecision: Decision | null;
};
export const initialPayPalAdminReviewsState = (): PayPalAdminReviewsState => ({ phase: "loading", actorId: "", environment: "", reviews: [], deliveries: [], hasMore: false, busy: false, refreshing: false, message: "", pendingDecision: null });

export function createPayPalAdminReviewsClient(deps: Dependencies) {
  let state = initialPayPalAdminReviewsState(), disposed = false, attempt = 0, lock: symbol | undefined;
  const listeners = new Set<(state: PayPalAdminReviewsState) => void>(), memory = new Map<string, Decision | null>();
  const storage = () => deps.storage ? deps.storage() : window.sessionStorage;
  const storageKey = () => `qrguitar:paypal-review:${state.actorId}`;
  const publish = (patch: Partial<PayPalAdminReviewsState>) => { if (!disposed) { state = { ...state, ...patch }; listeners.forEach(listener => listener(state)); } };
  function validDecision(value: unknown): Decision | null {
    const row = object(value);
    if (!directOrderId(row.decisionId) || !safeText(row.reason, 1000, 10)) return null;
    if (["retry_delivery", "acknowledge_delivery"].includes(String(row.action)) && directOrderId(row.deliveryId)) return row as unknown as DeliveryDecision | AcknowledgeDecision;
    return ["release", "retain_hold"].includes(String(row.action)) && EVENT_ID.test(String(row.eventId)) && directOrderId(row.orderId)
      && directOrderId(row.ownerId) ? row as unknown as HoldDecision : null;
  }
  function save(value: Decision | null) {
    memory.set(state.actorId, value); publish({ pendingDecision: value });
    try { if (value) storage().setItem(storageKey(), JSON.stringify(value)); else storage().removeItem(storageKey()); } catch { /* The exact decision remains in memory for this session. */ }
  }
  const scope = createPaymentSessionScope(deps, actorId => {
    attempt++; lock = undefined; publish({ ...initialPayPalAdminReviewsState(), actorId, phase: actorId ? "loading" : "signed-out" });
    if (!actorId) return;
    if (memory.has(actorId)) publish({ pendingDecision: memory.get(actorId) || null });
    else try { const value = validDecision(JSON.parse(storage().getItem(storageKey()) || "null")); if (value) publish({ pendingDecision: value }); } catch { /* Invalid or unavailable storage confers no authority. */ }
    void Promise.resolve().then(load);
  });
  async function load() {
    if (disposed || lock || !state.actorId) return;
    const lease = scope.lease(), current = ++attempt; publish({ refreshing: true, message: "" });
    try {
      const result = await scope.request(lease, "/api/admin/payment-reviews");
      if (!scope.live(lease) || current !== attempt) return;
      if (!Array.isArray(result.reviews) || result.reviews.length > 100 || !Array.isArray(result.deliveries) || result.deliveries.length > 100
        || typeof result.hasMore !== "boolean" || !["live", "test"].includes(String(result.environment))) throw new Error("The PayPal review queue could not be verified.");
      const reviews = result.reviews.map(readReview), deliveries = result.deliveries.map(readDelivery);
      if (new Set(reviews.map(review => review.eventId)).size !== reviews.length || new Set(deliveries.map(delivery => delivery.deliveryId)).size !== deliveries.length
        || deliveries.some(delivery => delivery.state === "completed" || delivery.rawAvailable === null || delivery.continuationAvailable === null)) throw new Error("The PayPal review queue could not be verified.");
      publish({ phase: "ready", environment: result.environment as "live" | "test", reviews, deliveries, hasMore: result.hasMore, refreshing: false });
    } catch (error) {
      if (scope.live(lease) && current === attempt) publish({ phase: "error", reviews: [], deliveries: [], refreshing: false, message: error instanceof Error ? error.message : "The PayPal review queue is unavailable." });
    }
  }
  async function start() { const lease = scope.lease(); try { await scope.start(); } catch (error) { if (scope.live(lease)) publish({ phase: "error", message: error instanceof Error ? error.message : "Sign-in is unavailable." }); } }
  async function mutate(input?: DecisionInput) {
    if (disposed || lock || state.phase !== "ready" || state.refreshing || (input && state.pendingDecision)) return false;
    const pending = state.pendingDecision;
    const selected = input?.action === "retry_delivery"
      ? state.deliveries.find(delivery => delivery.deliveryId === input.deliveryId && delivery.continuationAvailable === true
        && (["queued", "verified", "planned", "retry", "quarantined"].includes(delivery.state)
          || (delivery.state === "processing" && Boolean(delivery.lockedUntil) && Date.parse(delivery.lockedUntil!) <= Date.now())))
      : input?.action === "acknowledge_delivery"
        ? state.deliveries.find(delivery => delivery.deliveryId === input.deliveryId && delivery.state === "quarantined" && delivery.continuationAvailable === false)
      : input ? state.reviews.find(review => review.eventId === input.eventId && review.orderId === input.orderId && review.ownerId === input.ownerId) : undefined;
    if (!pending && (!input || !selected)) return false;
    const decisionId = pending?.decisionId || directOrderId(deps.randomUUID ? deps.randomUUID() : crypto.randomUUID());
    if (!decisionId) return false;
    const body = pending || { ...input!, decisionId };
    const lease = scope.lease(), operation = Symbol("paypal-review"); lock = operation; attempt++; publish({ busy: true, message: "" });
    let success = false;
    try {
      save(body); const result = await scope.request(lease, "/api/admin/payment-reviews", body);
      if (body.action === "retry_delivery" || body.action === "acknowledge_delivery") {
        const delivery = readDelivery(result.delivery);
        if (delivery.deliveryId !== body.deliveryId || result.decisionId !== body.decisionId) throw new Error("The saved delivery operation could not be verified. Refresh before continuing.");
      } else {
        const decision = object(result.decision);
        if (decision.eventId !== body.eventId || decision.orderId !== body.orderId || decision.ownerId !== body.ownerId
          || decision.decisionId !== body.decisionId || decision.action !== body.action || typeof decision.hold !== "boolean") throw new Error("The saved review decision could not be verified. Refresh before continuing.");
      }
      save(null); success = true;
    } catch (error) {
      if (scope.live(lease)) {
        const rejected = error instanceof PaymentRequestError && [400, 404, 409].includes(error.status);
        if (rejected) save(null);
        publish({ message: `${error instanceof Error ? error.message : "The decision could not be confirmed."} ${rejected ? "Refresh the queue before choosing again." : "Retry the saved decision with the same identity."}` });
      }
    } finally {
      if (lock === operation) { lock = undefined; if (scope.live(lease)) { publish({ busy: false }); if (success) await load(); } }
    }
    return success;
  }
  return {
    getState: () => state,
    subscribe(listener: (state: PayPalAdminReviewsState) => void) { listeners.add(listener); return () => listeners.delete(listener); },
    start, reload: () => state.actorId ? load() : start(),
    decide: (input: Omit<HoldDecision, "decisionId">) => mutate(input),
    retryDelivery: (input: Omit<DeliveryDecision, "decisionId" | "action">) => mutate({ action: "retry_delivery", ...input }),
    acknowledgeDelivery: (input: Omit<AcknowledgeDecision, "decisionId" | "action">) => mutate({ action: "acknowledge_delivery", ...input }),
    retryDecision: () => mutate(),
    dispose() { disposed = true; scope.dispose(); listeners.clear(); state = initialPayPalAdminReviewsState(); }
  };
}
