import "server-only";
import { BillingError } from "./billing-service";
import type { PayPalAdminReview, PayPalReviewAction, PayPalWebhookDelivery } from "./paypal-admin-reviews";

type Actor = { id: string; accountStatus: string; role: string };
type Database = { rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: null | { code?: string } }> };
type Dependencies<Context> = { environment: "test" | "live"; database: Database; authenticate(context: Context): Promise<Actor | null>; advanceDelivery(deliveryId: string): Promise<unknown>; timeoutMs?: number };
type Value = Record<string, unknown>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_ID = /^[A-Za-z0-9_:-]{3,200}$/;
const PROVIDER_ID = /^[A-Za-z0-9_.:-]{1,255}$/;
const EVENT_TYPE = /^[A-Z0-9_.-]{3,100}$/;
const RECEIPT_KINDS = new Set(["payment", "refund", "dispute", "expired", "error"]);
const ACTIONS = new Set<PayPalReviewAction>(["release", "retain_hold"]);
const RESOURCE_KINDS = new Set(["capture", "refund", "dispute", "order"]);
const DELIVERY_STATES = new Set(["queued", "verified", "planned", "retry", "processing", "completed", "quarantined"]);
const object = (value: unknown): Value => value && typeof value === "object" && !Array.isArray(value) ? value as Value : {};
const uuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);
const text = (value: unknown, max: number, min = 1): value is string => typeof value === "string" && value.trim().length >= min && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);
const nullableId = (value: unknown) => value === null || (typeof value === "string" && PROVIDER_ID.test(value));
const unavailable = (): never => { throw new BillingError(503, "review_unavailable", "Automatic payment reviews are unavailable. No hold was changed."); };

export function readPayPalAdminReview(value: unknown): PayPalAdminReview {
  const row = object(value), decision = row.lastDecision === null ? null : object(row.lastDecision);
  if (!EVENT_ID.test(String(row.eventId)) || !uuid(row.orderId) || !uuid(row.ownerId)
    || row.reference !== `QRG-${row.orderId}` || !text(row.holdReason, 100)
    || !RECEIPT_KINDS.has(String(row.receiptKind))
    || !(row.providerEventId === null || (typeof row.providerEventId === "string" && PROVIDER_ID.test(row.providerEventId)))
    || !(row.eventType === null || (typeof row.eventType === "string" && EVENT_TYPE.test(row.eventType)))
    || !(row.eventCursor === null || (Number.isSafeInteger(row.eventCursor) && Number(row.eventCursor) >= 0))
    || !(row.resourceKind === null || RESOURCE_KINDS.has(String(row.resourceKind)))
    || !nullableId(row.resourceId) || !nullableId(row.refundId) || !nullableId(row.disputeId) || !nullableId(row.caseId)
    || !nullableId(row.paypalOrderId) || !nullableId(row.captureId)
    || !(row.providerStatus === null || text(row.providerStatus, 100))
    || !(row.amount === null || (Number.isSafeInteger(row.amount) && Number(row.amount) >= 0))
    || !(row.currency === null || (typeof row.currency === "string" && /^[A-Z]{3}$/.test(row.currency)))
    || !Number.isSafeInteger(row.expectedAmount) || Number(row.expectedAmount) <= 0 || row.expectedCurrency !== "USD"
    || !Number.isSafeInteger(row.credits) || Number(row.credits) <= 0
    || typeof row.createdAt !== "string" || !Number.isFinite(Date.parse(row.createdAt))) unavailable();
  if (decision && (!ACTIONS.has(String(decision.action) as PayPalReviewAction) || !text(decision.reason, 1000, 10)
    || typeof decision.createdAt !== "string" || !Number.isFinite(Date.parse(decision.createdAt)))) unavailable();
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

export function readPayPalWebhookDelivery(value: unknown): PayPalWebhookDelivery {
  const row = object(value);
  if (!uuid(row.deliveryId) || !DELIVERY_STATES.has(String(row.state))
    || !(row.eventId === null || (typeof row.eventId === "string" && /^[A-Za-z0-9_-]{8,100}$/.test(row.eventId)))
    || !(row.eventType === null || (typeof row.eventType === "string" && EVENT_TYPE.test(row.eventType)))
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
    || typeof row.updatedAt !== "string" || !Number.isFinite(Date.parse(row.updatedAt))) unavailable();
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

export function createPayPalAdminReviewService<Context>(deps: Dependencies<Context>) {
  async function bounded<T>(run: () => Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([Promise.resolve().then(run), new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new BillingError(503, "review_timeout", "The review result could not be confirmed. Refresh before retrying the saved decision.")), deps.timeoutMs ?? 8000);
      })]);
    } finally { if (timer) clearTimeout(timer); }
  }
  async function actor(context: Context) {
    const value = await bounded(() => deps.authenticate(context));
    if (!value || !uuid(value.id)) throw new BillingError(401, "sign_in_required", "Sign in to continue.");
    if (value.accountStatus !== "active" || value.role !== "admin") throw new BillingError(403, "admin_required", "Automatic payment review requires an active administrator account.");
    return value;
  }
  async function rpc(name: string, args: Record<string, unknown>) {
    const result = await bounded(() => deps.database.rpc(name, args));
    if (result.error) {
      if (["PT409", "23505"].includes(result.error.code || "")) throw new BillingError(409, "review_conflict", "This review changed or was already decided. Refresh before continuing.");
      if (result.error.code === "42501") throw new BillingError(403, "admin_required", "Automatic payment review requires an active administrator account.");
      if (result.error.code === "P0002") throw new BillingError(404, "review_not_found", "This PayPal hold is no longer awaiting review. Refresh the queue.");
      if (result.error.code === "22023") throw new BillingError(400, "invalid_review", "Check the review decision and reason.");
      return unavailable();
    }
    if (result.data == null) return unavailable();
    return result.data;
  }
  async function list(context: Context, orderId?: string) {
    const admin = await actor(context);
    if (orderId !== undefined && !uuid(orderId)) throw new BillingError(400, "invalid_review", "Enter a complete QRguitar order reference.");
    const [reviewValue, deliveryValue] = await Promise.all([
      rpc("billing_paypal_list_reviews", { p_operator_id: admin.id, p_environment: deps.environment, p_order_id: orderId || null }),
      orderId ? Promise.resolve([]) : rpc("billing_paypal_webhook_admin_list", { p_operator_id: admin.id, p_environment: deps.environment })
    ]);
    const result = object(reviewValue);
    if (!Array.isArray(result.reviews) || result.reviews.length > 100 || typeof result.hasMore !== "boolean") return unavailable();
    const reviews = result.reviews.map(readPayPalAdminReview);
    if (!Array.isArray(deliveryValue) || deliveryValue.length > 100) return unavailable();
    const deliveries = deliveryValue.map(readPayPalWebhookDelivery);
    if (new Set(reviews.map(review => review.eventId)).size !== reviews.length
      || new Set(deliveries.map(delivery => delivery.deliveryId)).size !== deliveries.length
      || deliveries.some(delivery => delivery.state === "completed")
      || deliveries.some(delivery => delivery.rawAvailable === null || delivery.continuationAvailable === null)
      || (orderId && (reviews.some(review => review.orderId !== orderId) || result.hasMore))) return unavailable();
    return { environment: deps.environment, reviews, deliveries, hasMore: result.hasMore };
  }
  async function decide(context: Context, input: unknown) {
    const admin = await actor(context), body = object(input);
    if (body.action === "acknowledge_delivery") {
      if (Object.keys(body).some(key => !["action", "deliveryId", "decisionId", "reason"].includes(key))
        || !uuid(body.deliveryId) || !uuid(body.decisionId) || !text(body.reason, 1000, 10)) {
        throw new BillingError(400, "invalid_review", "Choose an expired quarantined delivery and include an audit reason of 10–1000 characters.");
      }
      const acknowledged = readPayPalWebhookDelivery(await rpc("billing_paypal_webhook_admin_acknowledge", {
        p_operator_id: admin.id, p_environment: deps.environment, p_delivery_id: body.deliveryId,
        p_action_id: body.decisionId, p_reason: String(body.reason).trim()
      }));
      if (acknowledged.deliveryId !== body.deliveryId || !acknowledged.acknowledgedAt) return unavailable();
      return { delivery: acknowledged, decisionId: body.decisionId };
    }
    if (body.action === "retry_delivery") {
      if (Object.keys(body).some(key => !["action", "deliveryId", "decisionId", "reason"].includes(key))
        || !uuid(body.deliveryId) || !uuid(body.decisionId) || !text(body.reason, 1000, 10)) {
        throw new BillingError(400, "invalid_review", "Choose a failed PayPal delivery and include an audit reason of 10–1000 characters.");
      }
      const queuedValue = object(await rpc("billing_paypal_webhook_admin_retry", {
        p_operator_id: admin.id, p_environment: deps.environment, p_delivery_id: body.deliveryId,
        p_action_id: body.decisionId, p_reason: String(body.reason).trim()
      }));
      if (typeof queuedValue.advanceAllowed !== "boolean") return unavailable();
      const queued = readPayPalWebhookDelivery(queuedValue);
      if (queued.deliveryId !== body.deliveryId) return unavailable();
      // The database fences this action ID to the cursor it first reviewed. An
      // exact response-loss replay may recover that same cursor, but can never
      // consume the next item after the cursor has advanced.
      if (!queuedValue.advanceAllowed) return { delivery: queued, decisionId: body.decisionId };
      const advanced = readPayPalWebhookDelivery(await bounded(() => deps.advanceDelivery(String(body.deliveryId))));
      if (advanced.deliveryId !== body.deliveryId) return unavailable();
      return { delivery: advanced, decisionId: body.decisionId };
    }
    if (Object.keys(body).some(key => !["action", "eventId", "orderId", "ownerId", "decisionId", "reason"].includes(key))
      || !ACTIONS.has(String(body.action) as PayPalReviewAction) || !EVENT_ID.test(String(body.eventId))
      || !uuid(body.orderId) || !uuid(body.ownerId) || !uuid(body.decisionId) || !text(body.reason, 1000, 10)) {
      throw new BillingError(400, "invalid_review", "Choose a PayPal hold, decision, and audit reason of 10–1000 characters.");
    }
    const result = object(await rpc("billing_paypal_resolve_review", {
      p_operator_id: admin.id, p_environment: deps.environment, p_event_id: body.eventId,
      p_order_id: body.orderId, p_owner_id: body.ownerId, p_decision_id: body.decisionId,
      p_action: body.action, p_reason: String(body.reason).trim()
    }));
    if (result.eventId !== body.eventId || result.orderId !== body.orderId || result.ownerId !== body.ownerId
      || result.decisionId !== body.decisionId || result.action !== body.action || typeof result.hold !== "boolean") return unavailable();
    return { decision: result };
  }
  return { list, decide };
}
