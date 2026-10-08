import "server-only";
import { createHash } from "node:crypto";
import { BillingError } from "./billing-service";
import { DIRECT_OFFERS, type AppliedPromotion, type DirectOffer } from "./direct-payments";
import type { PayPalConfig } from "./paypal-config";
import type { PayPalGateway } from "./paypal-gateway";
import type { PayPalOrder, PayPalPaymentsSnapshot } from "./paypal-payments";

type Json = Record<string, unknown>;
type StoredOrder = PayPalOrder & { merchantId: string; captureId: string | null; hold: boolean };
type Dependencies<Context> = {
  config: PayPalConfig; gateway: PayPalGateway;
  database: { rpc(name: string, args: Json): Promise<{ data: unknown; error: null | { code?: string } }> };
  authenticate(context: Context): Promise<{ id: string; accountStatus: string; isAdmin?: boolean } | null>;
  timeoutMs?: number; now?: () => number;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROVIDER_ID = /^[A-Z0-9]{5,64}$/;
const obj = (value: unknown): Json => value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
const uuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);
const providerId = (value: unknown): value is string => typeof value === "string" && PROVIDER_ID.test(value);
const disputeId = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9-]{1,255}$/.test(value);
const fail = (code = "payment_unavailable", message = "Payment could not be confirmed. Check its status before trying again."): never => { throw new BillingError(503, code, message); };
const webhookReceiptId = (eventId: string, cursor: number) => `paypal:webhook:${createHash("sha256").update(`${eventId}:${cursor}`).digest("hex")}`;
const boundedText = (value: unknown, maximum = 100): string | null => typeof value === "string" && value.length > 0 && value.length <= maximum && !/[\x00-\x1f\x7f]/.test(value) ? value : null;
function cents(value: unknown): number {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,7})\.[0-9]{2}$/.test(value)) return fail("payment_mismatch");
  const [whole, fraction] = value.split("."); return Number(whole) * 100 + Number(fraction);
}

export type PayPalWebhookPlanItem = {
  action: "order_approved" | "approval_reversed" | "capture" | "capture_reversed" | "refund" | "dispute" | "ignore";
  resourceKind: "order" | "capture" | "refund" | "dispute" | "event"; resourceId: string | null;
  captureId: string | null; refundId: string | null; disputeId: string | null; caseId: string | null;
  providerStatus: string | null; amount: number | null; currency: "USD" | null;
  detail: { stage: string | null; reason: string | null; outcome: string | null; captureStatus: string | null };
};
export type PayPalWebhookOutcome = {
  eventId: string; eventType: string; cursor: number; action: "applied" | "ignored";
  resourceKind: PayPalWebhookPlanItem["resourceKind"]; resourceId: string | null; paypalOrderId: string | null; captureId: string | null;
  providerStatus: string | null; amount: number | null; currency: "USD" | null; receiptEventId: string | null;
  detail: PayPalWebhookPlanItem["detail"];
};
export type PayPalWebhookCommand = {
  effect: "none" | "capture" | "failure" | "close" | "review" | "approval_reversed";
  orderId: string | null; reviewKind: "refund" | "dispute" | "reversal" | "refund_pending" | null;
  paypalOrderId: string | null; merchantId: string | null; receipt: Json | null; evidence: Json | null;
  outcome: PayPalWebhookOutcome;
};

export function createPayPalService<Context>(deps: Dependencies<Context>) {
  const config = structuredClone(deps.config), environment = config.environment;
  const scope = (ownerId: string) => ({ p_owner_id: ownerId, p_environment: environment });
  async function bounded<T>(operation: () => Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([Promise.resolve().then(operation), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new BillingError(503, "payment_timeout", "The result is still being checked. Refresh the same payment.")), deps.timeoutMs ?? 12000); })]); }
    finally { if (timer) clearTimeout(timer); }
  }
  async function rpc(name: string, args: Json) {
    const result = await bounded(() => deps.database.rpc(name, args));
    if (result.error) {
      if (["PT409", "23505"].includes(result.error.code || "")) throw new BillingError(409, "payment_conflict", "Check your existing payment before starting another purchase.");
      if (["PT404", "PT403", "PT410"].includes(result.error.code || ""))
        throw new BillingError(400, "promo_unavailable", "That promo code isn’t available.");
      if (result.error.code === "42501") throw new BillingError(403, "payment_forbidden", "This account cannot make that payment request.");
      if (result.error.code === "P0002") throw new BillingError(404, "payment_not_found", "Payment order not found.");
      if (result.error.code === "22023") throw new BillingError(400, "invalid_payment", "Check the payment details and try again.");
      return fail();
    }
    if (result.data == null) return fail();
    return result.data;
  }
  async function actor(context: Context, writing = false) {
    const value = await bounded(() => deps.authenticate(context));
    if (!value || !uuid(value.id)) throw new BillingError(401, "sign_in_required", "Sign in to continue.");
    if (writing && value.accountStatus !== "active") throw new BillingError(403, "account_unavailable", "This account cannot make a payment.");
    return value;
  }
  function pricedOffer(input: unknown, promotionInput: unknown): DirectOffer {
    const offer = obj(input), approved = DIRECT_OFFERS.find(value => value.key === offer.key), promotion = promotionInput == null ? null : obj(promotionInput);
    if (!approved || offer.credits !== approved.credits || offer.currency !== "usd" || offer.version !== 1
      || !Number.isSafeInteger(offer.amount) || Number(offer.amount) < 30 || Number(offer.amount) > approved.amount) return fail("invalid_order");
    if (!promotion) {
      if (offer.amount !== approved.amount) return fail("invalid_order");
      return { ...approved };
    }
    if (!uuid(promotion.id) || typeof promotion.code !== "string" || !/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(promotion.code)
      || typeof promotion.name !== "string" || promotion.name.length < 1 || promotion.name.length > 80
      || !Number.isSafeInteger(promotion.revision) || Number(promotion.revision) < 1
      || !["fixed_total", "amount_off", "percent_off"].includes(String(promotion.discountType))
      || !Number.isSafeInteger(promotion.discountValue) || Number(promotion.discountValue) < 1
      || !["promotion", "internal_test"].includes(String(promotion.classification))
      || promotion.originalAmount !== approved.amount || promotion.finalAmount !== offer.amount
      || !Number.isSafeInteger(promotion.discountAmount) || Number(promotion.discountAmount) < 1
      || Number(promotion.originalAmount) - Number(promotion.discountAmount) !== Number(promotion.finalAmount)
      || Number(promotion.finalAmount) >= approved.amount) return fail("invalid_order");
    return { ...approved, amount: Number(offer.amount), listAmount: approved.amount, promotion: { ...promotion } as AppliedPromotion };
  }
  function stored(input: unknown, ownerId?: string): StoredOrder {
    const row = obj(input), offer = obj(row.offer), approved = DIRECT_OFFERS.find(value => value.key === offer.key);
    if (!uuid(row.orderId) || !uuid(row.ownerId) || (ownerId && row.ownerId !== ownerId) || !uuid(row.requestKey)
      || row.environment !== environment || row.provider !== "paypal" || !approved
      || !["reserved", "open", "fulfilled", "expired"].includes(String(row.status)) || typeof row.merchantId !== "string" || !/^[A-Z0-9]{13}$/.test(row.merchantId)
      || !(row.paypalOrderId === null || providerId(row.paypalOrderId)) || !(row.captureId === null || providerId(row.captureId)) || typeof row.hold !== "boolean"
      || typeof row.createdAt !== "string" || !Number.isFinite(Date.parse(row.createdAt))) return fail("invalid_order");
    const priced = pricedOffer(offer, row.promotion);
    return { orderId: row.orderId, ownerId: row.ownerId, requestId: row.requestKey, offerKey: approved.key, paypalOrderId: row.paypalOrderId as string | null,
      status: row.hold ? "needs_review" : row.status === "fulfilled" ? "fulfilled" : row.status === "expired" ? "cancelled" : row.paypalOrderId ? "approval_pending" : "reserved",
      offer: priced, createdAt: row.createdAt, merchantId: row.merchantId, captureId: row.captureId as string | null, hold: row.hold };
  }
  function publicOrder(row: StoredOrder): PayPalOrder {
    const { merchantId: _merchant, captureId: _capture, hold: _hold, ...result } = row; return result;
  }
  function balance(input: unknown) {
    const row = obj(input);
    if (row.environment !== environment || row.createEnvironment !== environment || row.freeLimit !== 5 || typeof row.commercialExempt !== "boolean" || typeof row.hold !== "boolean"
      || ["ownedProfiles", "freeRemaining", "paidGranted", "paidConsumed", "paidRemaining", "paidAvailable"].some(key => !Number.isSafeInteger(row[key]) || Number(row[key]) < 0)
      || Number(row.freeRemaining) > 5 || row.paidRemaining !== Number(row.paidGranted) - Number(row.paidConsumed)
      || row.paidAvailable !== (row.hold ? 0 : row.paidRemaining)) return fail("balance_unavailable", "Your balance could not be verified. Refresh before continuing.");
    const unresolved = row.unresolvedOrder == null ? null : obj(row.unresolvedOrder);
    if (unresolved && !uuid(unresolved.orderId)) return fail("balance_unavailable");
    return { freeLimit: 5 as const, ownedProfiles: row.ownedProfiles as number, freeRemaining: row.freeRemaining as number,
      paidGranted: row.paidGranted as number, paidConsumed: row.paidConsumed as number, paidRemaining: row.paidRemaining as number,
      paidAvailable: row.paidAvailable as number, commercialExempt: row.commercialExempt, hold: row.hold, legacyOrderId: unresolved ? unresolved.orderId as string : null };
  }
  function ready(order?: StoredOrder) {
    if (!config.clientId || !config.secret || !config.merchantId || !config.webhookId || (order && order.merchantId !== config.merchantId)) return fail("billing_disabled", "Payment verification is temporarily unavailable. Your purchase remains recoverable.");
  }
  async function schedulerReady() {
    if (!config.enabled) return false;
    try {
      const result=await bounded(()=>deps.database.rpc("billing_paypal_webhook_scheduler_ready",{p_environment:environment}));
      return result.error===null&&result.data===true;
    } catch { return false; }
  }
  function remoteUnit(remote: Json, order: StoredOrder, creating = false): Json {
    if (!providerId(remote.id) || (!creating && remote.id !== order.paypalOrderId) || remote.intent !== "CAPTURE"
      || !Array.isArray(remote.purchase_units) || remote.purchase_units.length !== 1) return fail("payment_mismatch");
    const unit = obj(remote.purchase_units[0]), amount = obj(unit.amount);
    if (unit.reference_id !== order.orderId || unit.custom_id !== order.orderId || unit.invoice_id !== `QRG-${order.orderId}`
      || obj(unit.payee).merchant_id !== order.merchantId || amount.currency_code !== "USD" || cents(amount.value) !== order.offer.amount) return fail("payment_mismatch");
    return unit;
  }
  function receipt(remote: Json, order: StoredOrder, expectedCapture?: string): Json | null {
    const unit = remoteUnit(remote, order), payments = obj(unit.payments), captures = payments.captures;
    if (captures === undefined || (Array.isArray(captures) && captures.length === 0)) return null;
    if (!Array.isArray(captures) || captures.length !== 1) return fail("payment_mismatch");
    const capture = obj(captures[0]), amount = obj(capture.amount);
    if (!providerId(capture.id) || (expectedCapture && capture.id !== expectedCapture) || (order.captureId && capture.id !== order.captureId)
      || amount.currency_code !== "USD" || cents(amount.value) !== order.offer.amount || capture.final_capture !== true
      || !["COMPLETED", "PENDING", "DECLINED", "DENIED", "FAILED", "REVERSED", "REFUNDED", "PARTIALLY_REFUNDED"].includes(String(capture.status))) return fail("payment_mismatch");
    return { paypalOrderId: remote.id, captureId: capture.id, merchantId: order.merchantId, referenceId: unit.reference_id,
      customId: unit.custom_id, invoiceId: unit.invoice_id, amount: order.offer.amount, currency: "USD", status: capture.status };
  }
  async function freshReceipt(remote: Json, order: StoredOrder, expectedCapture?: string): Promise<Json | null> {
    const unit = remoteUnit(remote, order), nested = receipt(remote, order, expectedCapture);
    const captureId = expectedCapture || order.captureId || nested?.captureId;
    if (!providerId(captureId)) return null;
    const capture = await deps.gateway.getCapture(captureId), amount = obj(capture.amount);
    if (capture.id !== captureId || obj(obj(capture.supplementary_data).related_ids).order_id !== order.paypalOrderId
      || obj(capture.payee).merchant_id !== order.merchantId || amount.currency_code !== "USD" || cents(amount.value) !== order.offer.amount
      || capture.final_capture !== true
      || (capture.invoice_id !== undefined && capture.invoice_id !== unit.invoice_id)
      || (capture.custom_id !== undefined && capture.custom_id !== unit.custom_id)
      || !["COMPLETED", "PENDING", "DECLINED", "DENIED", "FAILED", "REVERSED", "REFUNDED", "PARTIALLY_REFUNDED"].includes(String(capture.status))) return fail("payment_mismatch");
    return { paypalOrderId: remote.id, captureId, merchantId: order.merchantId, referenceId: unit.reference_id,
      customId: unit.custom_id, invoiceId: unit.invoice_id, amount: order.offer.amount, currency: "USD", status: capture.status };
  }
  async function load(ownerId: string, orderId: string) { const order = stored(await rpc("billing_paypal_get_order", { ...scope(ownerId), p_order_id: orderId }), ownerId); if (order.orderId !== orderId) return fail("invalid_order"); return order; }
  async function status(context: Context, orderId?: string): Promise<PayPalPaymentsSnapshot> {
    const owner = await actor(context);
    if (orderId !== undefined && !uuid(orderId)) throw new BillingError(400, "invalid_payment", "Invalid payment order.");
    const data = obj(await rpc("billing_paypal_status", { ...scope(owner.id), p_order_id: orderId || null }));
    const account = balance(data.account), order = data.order == null ? null : stored(data.order, owner.id), pending = data.pendingOrder == null ? null : stored(data.pendingOrder, owner.id);
    const other = data.otherPendingOrder == null ? (account.legacyOrderId ? { orderId: account.legacyOrderId, provider: "stripe" } : null) : obj(data.otherPendingOrder);
    if (other && (!uuid(other.orderId) || !["direct", "stripe"].includes(String(other.provider)) || pending
      || (account.legacyOrderId && (other.orderId !== account.legacyOrderId || other.provider !== "stripe")))) return fail("invalid_order");
    if (orderId && order?.orderId !== orderId) return fail("invalid_order");
    const checkoutEnabled=await schedulerReady();
    return { ...account, environment, enabled: checkoutEnabled, applePayEnabled: checkoutEnabled && config.applePayEnabled, clientId: config.clientId || null, currency: "USD", merchantName: config.merchantName,
      offers: checkoutEnabled ? DIRECT_OFFERS.map(value => ({ ...value })) : [], order: order ? publicOrder(order) : null, pendingOrder: pending ? publicOrder(pending) : null,
      legacyOrderId: other ? other.orderId as string : null, legacyOrderProvider: other ? other.provider as "direct" | "stripe" : null };
  }
  async function quote(context: Context, input: unknown) {
    const owner = await actor(context, true), body = obj(input);
    if (Object.keys(body).some(key => !["offerKey", "promoCode"].includes(key))
      || !DIRECT_OFFERS.some(value => value.key === body.offerKey) || typeof body.promoCode !== "string")
      throw new BillingError(400, "promo_unavailable", "That promo code isn’t available.");
    const promoCode = body.promoCode.trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(promoCode)) throw new BillingError(400, "promo_unavailable", "That promo code isn’t available.");
    const result = obj(await rpc("billing_promo_quote", { ...scope(owner.id), p_offer_key: body.offerKey,
      p_code: promoCode, p_internal_access: owner.isAdmin === true }));
    if (result.rateLimited === true) throw new BillingError(429, "promo_rate_limited", "Too many promo attempts. Wait five minutes and try again.");
    if (result.available !== true) throw new BillingError(400, "promo_unavailable", "That promo code isn’t available.");
    const offer = pricedOffer(result.offer, result.promotion);
    if (!offer.promotion || offer.promotion.code !== promoCode || offer.key !== body.offerKey) return fail("invalid_order");
    return { offer };
  }
  async function create(context: Context, input: unknown) {
    const owner = await actor(context, true), body = obj(input);
    if (Object.keys(body).some(key => !["offerKey", "requestId", "promoCode", "promoId", "promoRevision", "expectedAmount"].includes(key))
      || !uuid(body.requestId) || !DIRECT_OFFERS.some(value => value.key === body.offerKey)) throw new BillingError(400, "invalid_payment", "Choose a Profile pack to continue.");
    const promoCode = body.promoCode == null ? "" : typeof body.promoCode === "string" ? body.promoCode.trim().toUpperCase() : "!";
    const promoted = promoCode.length > 0;
    if ((promoted && (!/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(promoCode) || !uuid(body.promoId)
        || !Number.isSafeInteger(body.promoRevision) || Number(body.promoRevision) < 1
        || !Number.isSafeInteger(body.expectedAmount) || Number(body.expectedAmount) < 30))
      || (!promoted && [body.promoId, body.promoRevision, body.expectedAmount].some(value => value != null)))
      throw new BillingError(400, "promo_invalid", "Apply the promo code again before checkout.");
    const existing = obj(await rpc("billing_paypal_find_order", { ...scope(owner.id), p_request_key: body.requestId }));
    let order: StoredOrder;
    if (existing.order) {
      order = stored(existing.order, owner.id);
      if (order.offerKey !== body.offerKey || order.requestId !== body.requestId
        || (order.offer.promotion?.code || "") !== promoCode
        || (promoted && (order.offer.promotion?.id !== body.promoId || order.offer.promotion?.revision !== body.promoRevision
          || order.offer.amount !== body.expectedAmount))) throw new BillingError(409, "payment_conflict", "Continue with the original Profile pack.");
    } else {
      if (!config.enabled||!await schedulerReady()) throw new BillingError(503, "billing_disabled", "Checkout is not available right now.");
      ready();
      const account = balance(await rpc("billing_account_status", scope(owner.id)));
      if (account.commercialExempt) throw new BillingError(409, "profile_access_included", "Your approved plan already includes expanded Profile access.");
      if (account.hold) throw new BillingError(409, "billing_review_required", "Purchases are paused while your billing is reviewed.");
      order = stored(await rpc("billing_paypal_reserve_promoted_order", { ...scope(owner.id), p_request_key: body.requestId,
        p_offer_key: body.offerKey, p_merchant_id: config.merchantId, p_promo_code: promoCode || null,
        p_promotion_id: promoted ? body.promoId : null, p_promotion_revision: promoted ? body.promoRevision : null,
        p_expected_amount: promoted ? body.expectedAmount : null, p_internal_access: owner.isAdmin === true }), owner.id);
    }
    if (order.requestId !== body.requestId || order.offerKey !== body.offerKey) return fail("invalid_order");
    if (["fulfilled", "cancelled", "needs_review"].includes(order.status)) {
      return { orderId: order.orderId, paypalOrderId: order.paypalOrderId, status: order.status, offer: order.offer };
    }
    ready(order);
    // Stop remote create retries before PayPal's default six-hour key retention
    // ends. The database decides whether an unbound reservation is old enough;
    // a racing successful bind wins and remains the same recoverable purchase.
    if (!order.paypalOrderId && (deps.now?.() ?? Date.now()) - Date.parse(order.createdAt) >= 5 * 60 * 60 * 1000) {
      order = stored(await rpc("billing_paypal_expire_unbound", { ...scope(owner.id), p_order_id: order.orderId }), owner.id);
      if (["fulfilled", "cancelled", "needs_review"].includes(order.status)) return { orderId: order.orderId, paypalOrderId: order.paypalOrderId, status: order.status, offer: order.offer };
      if (!order.paypalOrderId) return fail("payment_review_required", "This unfinished payment is still being checked. Retry this saved payment.");
    }
    if (!order.paypalOrderId) {
      const remote = await deps.gateway.createOrder({ orderId: order.orderId, offer: order.offer });
      remoteUnit(remote, order, true);
      if (!["CREATED", "SAVED", "APPROVED", "PAYER_ACTION_REQUIRED", "COMPLETED"].includes(String(remote.status))) return fail("payment_mismatch");
      const providerOrderId = remote.id;
      order = stored(await rpc("billing_paypal_bind_order", { ...scope(owner.id), p_order_id: order.orderId, p_paypal_order_id: providerOrderId, p_merchant_id: order.merchantId }), owner.id);
      if (order.paypalOrderId !== providerOrderId || order.requestId !== body.requestId) return fail("invalid_order");
    }
    return { orderId: order.orderId, paypalOrderId: order.paypalOrderId, status: order.status, offer: order.offer };
  }
  async function review(order: StoredOrder, incoming: Json, eventId: string, kind: "refund" | "dispute" | "reversal" | "refund_pending") {
    return stored(await rpc("billing_paypal_record_review", { p_environment: environment, p_order_id: order.orderId, p_event_id: eventId, p_kind: kind, p_receipt: incoming }), order.ownerId);
  }
  async function settleDetailed(order: StoredOrder, remote: Json, expectedCapture?: string): Promise<{ order: PayPalOrder; captureId: string | null; receiptEventId: string | null }> {
    const incoming = await freshReceipt(remote, order, expectedCapture);
    if (incoming?.status === "REFUNDED" || incoming?.status === "PARTIALLY_REFUNDED") {
      const eventId = `reconcile-${incoming.captureId}-${incoming.status}`;
      return { order: publicOrder(await review(order, incoming, eventId, "refund")), captureId: incoming.captureId as string, receiptEventId: `paypal:review:${eventId}` };
    }
    if (incoming?.status === "REVERSED") {
      const eventId = `reconcile-${incoming.captureId}-REVERSED`;
      return { order: publicOrder(await review(order, incoming, eventId, "reversal")), captureId: incoming.captureId as string, receiptEventId: `paypal:review:${eventId}` };
    }
    if (incoming && ["DECLINED", "DENIED", "FAILED"].includes(String(incoming.status))) {
      const result = publicOrder(stored(await rpc("billing_paypal_record_failure", { p_environment: environment, p_order_id: order.orderId, p_receipt: incoming }), order.ownerId));
      return { order: result, captureId: incoming.captureId as string, receiptEventId: `paypal:failed:${incoming.captureId}:${incoming.status}` };
    }
    // A separately fetched capture is the authoritative money state. Orders can
    // briefly retain APPROVED/PAYER_ACTION_REQUIRED after its capture completes.
    if (incoming?.status === "COMPLETED") {
      const result = publicOrder(stored(await rpc("billing_paypal_apply_capture", { p_environment: environment, p_order_id: order.orderId, p_receipt: incoming }), order.ownerId));
      return { order: result, captureId: incoming.captureId as string, receiptEventId: `paypal:capture:${incoming.captureId}` };
    }
    if (remote.status === "VOIDED" && !incoming) {
      const result = publicOrder(stored(await rpc("billing_paypal_close_order", { p_environment: environment, p_order_id: order.orderId, p_paypal_order_id: order.paypalOrderId, p_merchant_id: order.merchantId, p_status: "VOIDED" }), order.ownerId));
      return { order: result, captureId: null, receiptEventId: `paypal:closed:${order.paypalOrderId}` };
    }
    if (incoming) return { order: { ...publicOrder(order), status: incoming.status === "PENDING" ? "processing" : "needs_review" }, captureId: incoming.captureId as string, receiptEventId: null };
    if (!["CREATED", "SAVED", "APPROVED", "PAYER_ACTION_REQUIRED"].includes(String(remote.status))) return fail("payment_mismatch");
    return { order: publicOrder(order), captureId: null, receiptEventId: null };
  }
  async function settle(order: StoredOrder, remote: Json, expectedCapture?: string): Promise<PayPalOrder> {
    return (await settleDetailed(order,remote,expectedCapture)).order;
  }
  async function payment(context: Context, input: unknown, capture: boolean) {
    const owner = await actor(context, capture), body = obj(input);
    if (Object.keys(body).some(key => key !== "orderId") || !uuid(body.orderId)) throw new BillingError(400, "invalid_payment", "Invalid payment order.");
    const order = await load(owner.id, body.orderId); ready(order);
    if (!order.paypalOrderId) return { order: publicOrder(order) };
    let remote = await deps.gateway.getOrder(order.paypalOrderId);
    const existingReceipt = receipt(remote, order);
    if (capture && remote.status === "APPROVED" && !existingReceipt && !order.hold && order.status !== "cancelled" && order.status !== "fulfilled") {
      try { remote = await deps.gateway.captureOrder(order.paypalOrderId, order.orderId); }
      catch (error) { if (!(error instanceof BillingError) || error.code !== "payment_already_captured") throw error; remote = await deps.gateway.getOrder(order.paypalOrderId); }
    }
    return { order: await settle(order, remote) };
  }
  async function lookupFromProviderOrder(paypalOrderId: string): Promise<StoredOrder | null> {
    const result = obj(await rpc("billing_paypal_lookup_order", { p_environment: environment, p_paypal_order_id: paypalOrderId, p_capture_id: null }));
    if (result.order != null) return stored(result.order);
    // A create response can be lost before its provider ID is bound locally.
    // Only an authenticated provider GET may recover the local correlation;
    // webhook/browser metadata alone cannot establish this association.
    const remote = await deps.gateway.getOrder(paypalOrderId), units = remote.purchase_units;
    if (remote.id !== paypalOrderId || remote.intent !== "CAPTURE" || !Array.isArray(units) || units.length !== 1) return null;
    const unit = obj(units[0]);
    if (!uuid(unit.custom_id) || unit.reference_id !== unit.custom_id || unit.invoice_id !== `QRG-${unit.custom_id}`
      || obj(unit.payee).merchant_id !== config.merchantId) return null;
    const correlated = obj(await rpc("billing_paypal_find_correlated_order", { p_environment: environment, p_order_id: unit.custom_id, p_merchant_id: config.merchantId }));
    if (correlated.order == null) return null;
    const order = stored(correlated.order); ready(order); remoteUnit(remote, order, true);
    if (order.paypalOrderId && order.paypalOrderId !== paypalOrderId) return fail("payment_mismatch");
    return stored(await rpc("billing_paypal_bind_order", { ...scope(order.ownerId), p_order_id: order.orderId,
      p_paypal_order_id: paypalOrderId, p_merchant_id: order.merchantId }), order.ownerId);
  }
  async function lookupFromCapture(captureId: string): Promise<StoredOrder | null> {
    const capture = await deps.gateway.getCapture(captureId);
    if (capture.id !== captureId) return fail("payment_mismatch");
    const paypalOrderId = obj(obj(capture.supplementary_data).related_ids).order_id;
    if (!providerId(paypalOrderId)) return fail("payment_mismatch");
    // Resolve by provider order before the capture has been applied to our ledger.
    return lookupFromProviderOrder(paypalOrderId);
  }
  function captureLink(resource: Json): string | null {
    if (!Array.isArray(resource.links)) return null;
    const bases = environment === "live" ? ["https://api-m.paypal.com", "https://api.paypal.com"] : ["https://api-m.sandbox.paypal.com", "https://api.sandbox.paypal.com"];
    for (const item of resource.links) { const link = obj(item); if (link.rel !== "up" || typeof link.href !== "string") continue;
      try { const url = new URL(link.href); const match = /^\/v2\/payments\/captures\/([A-Z0-9]{5,64})$/.exec(url.pathname);
        if (bases.includes(url.origin) && !url.username && !url.password && !url.search && !url.hash && match) return match[1]; } catch { /* malformed provider link */ }
    }
    return null;
  }
  function webhookEvent(eventInput: unknown) {
    const event = obj(eventInput), resource = obj(event.resource);
    if (typeof event.id !== "string" || !/^[A-Za-z0-9_-]{8,100}$/.test(event.id)
      || typeof event.event_type !== "string" || !/^[A-Z0-9._-]{3,100}$/.test(event.event_type) || !Object.keys(resource).length) {
      throw new BillingError(400, "invalid_webhook", "Invalid PayPal event.");
    }
    return { event, eventId: event.id, eventType: event.event_type, resource };
  }
  function providerStatus(value: unknown, fallback: string): string {
    const candidate = boundedText(value, 80) || fallback;
    if (!/^[A-Z0-9._-]{2,80}$/.test(candidate)) return fail("payment_mismatch");
    return candidate;
  }
  function providerMoney(value: unknown): { amount: number; currency: "USD" } | null {
    const money = obj(value);
    if (!Object.keys(money).length) return null;
    if (money.currency_code !== "USD") return fail("payment_mismatch");
    return { amount: cents(money.value), currency: "USD" };
  }
  const detail = (stage: unknown = null, reason: unknown = null, outcome: unknown = null, captureStatus: unknown = null) => ({
    stage: boundedText(stage), reason: boundedText(reason), outcome: boundedText(outcome), captureStatus: boundedText(captureStatus)
  });
  function planItem(input: unknown): PayPalWebhookPlanItem {
    const item = obj(input), info = obj(item.detail), keys = ["action","resourceKind","resourceId","captureId","refundId","disputeId","caseId","providerStatus","amount","currency","detail"];
    if (Object.keys(item).length !== keys.length || keys.some(key => !(key in item)) || Object.keys(info).length !== 4
      || ["stage","reason","outcome","captureStatus"].some(key => !(key in info))
      || !["order_approved","approval_reversed","capture","capture_reversed","refund","dispute","ignore"].includes(String(item.action))
      || !["order","capture","refund","dispute","event"].includes(String(item.resourceKind))
      || !(item.resourceId === null || boundedText(item.resourceId, 255)) || !(item.captureId === null || providerId(item.captureId))
      || !(item.refundId === null || providerId(item.refundId)) || !(item.disputeId === null || disputeId(item.disputeId))
      || !(item.caseId === null || disputeId(item.caseId)) || !(item.providerStatus === null || /^[A-Z0-9._-]{2,80}$/.test(String(item.providerStatus)))
      || !(item.amount === null || (Number.isSafeInteger(item.amount) && Number(item.amount) >= 0 && Number(item.amount) <= 999999999))
      || !(item.currency === null || item.currency === "USD") || [info.stage,info.reason,info.outcome,info.captureStatus].some(value => value !== null && !boundedText(value))) return fail("invalid_webhook_plan");
    return item as PayPalWebhookPlanItem;
  }
  async function verifyWebhook(eventInput: unknown, headers: Record<string, string>, rawEvent: string) {
    ready(); const { event } = webhookEvent(eventInput);
    if (!await deps.gateway.verifyWebhook(event, headers, rawEvent)) throw new BillingError(400, "invalid_webhook_signature", "Invalid PayPal signature.");
    return { verified: true } as const;
  }
  async function prepareWebhook(eventInput: unknown): Promise<PayPalWebhookPlanItem[]> {
    ready(); const { eventType: kind, resource } = webhookEvent(eventInput);
    const basic = (action: PayPalWebhookPlanItem["action"], resourceKind: PayPalWebhookPlanItem["resourceKind"], resourceId: string | null,
      captureId: string | null, status: string, extra: Partial<PayPalWebhookPlanItem> = {}): PayPalWebhookPlanItem => ({ action, resourceKind, resourceId,
      captureId, refundId: null, disputeId: null, caseId: null, providerStatus: status, amount: null, currency: null, detail: detail(), ...extra });
    if (kind === "CHECKOUT.ORDER.APPROVED") {
      if (!providerId(resource.id)) throw new BillingError(400, "invalid_webhook", "Invalid PayPal order.");
      return [basic("order_approved","order",resource.id,null,providerStatus(resource.status,"APPROVED"))];
    }
    if (kind === "CHECKOUT.PAYMENT-APPROVAL.REVERSED") {
      if (!providerId(resource.order_id)) throw new BillingError(400, "invalid_webhook", "Invalid reversed PayPal order.");
      return [basic("approval_reversed","order",resource.order_id,null,"PAYMENT_APPROVAL_REVERSED")];
    }
    if (["PAYMENT.CAPTURE.COMPLETED","PAYMENT.CAPTURE.PENDING","PAYMENT.CAPTURE.DENIED","PAYMENT.CAPTURE.DECLINED","PAYMENT.CAPTURE.REVERSED"].includes(kind)) {
      if (!providerId(resource.id)) throw new BillingError(400, "invalid_webhook", "Invalid capture.");
      const status = providerStatus(resource.status,kind.slice("PAYMENT.CAPTURE.".length)), money = providerMoney(resource.amount);
      return [basic(kind === "PAYMENT.CAPTURE.REVERSED" ? "capture_reversed" : "capture","capture",resource.id,resource.id,status,
        { amount: money?.amount ?? null, currency: money?.currency ?? null, detail: detail(null,null,null,status) })];
    }
    if (["PAYMENT.CAPTURE.REFUNDED","PAYMENT.REFUND.PENDING","PAYMENT.REFUND.FAILED"].includes(kind)) {
      if (!providerId(resource.id)) throw new BillingError(400, "invalid_webhook", "Invalid refund.");
      const refund = await deps.gateway.getRefund(resource.id), status = providerStatus(refund.status,"");
      if (refund.id !== resource.id || !["COMPLETED","PENDING","FAILED","CANCELLED"].includes(status)) return fail("refund_unconfirmed");
      const captureId = captureLink(refund); if (!captureId) return fail("payment_mismatch"); const money = providerMoney(refund.amount);
      return [basic("refund","refund",resource.id,captureId,status,{ refundId: resource.id, amount: money?.amount ?? null,
        currency: money?.currency ?? null, detail: detail(null,null,status,null) })];
    }
    if (["CUSTOMER.DISPUTE.CREATED","CUSTOMER.DISPUTE.UPDATED","CUSTOMER.DISPUTE.RESOLVED"].includes(kind)) {
      if (!disputeId(resource.dispute_id)) throw new BillingError(400, "invalid_webhook", "Invalid dispute.");
      const disputeKey = resource.dispute_id, dispute = await deps.gateway.getDispute(disputeKey), transactions = dispute.disputed_transactions;
      if (dispute.dispute_id !== disputeKey || !Array.isArray(transactions) || transactions.length > 20) return fail("payment_mismatch");
      const status = providerStatus(dispute.status,"DISPUTE"), money = providerMoney(dispute.dispute_amount), info = detail(dispute.dispute_life_cycle_stage,dispute.reason,obj(dispute.dispute_outcome).outcome_code,null);
      if (!transactions.length) return [basic("ignore","dispute",disputeKey,null,status,{ disputeId: disputeKey,caseId: disputeKey,detail: info })];
      return transactions.map(value => { const captureId = obj(value).seller_transaction_id; if (!providerId(captureId)) return fail("payment_mismatch");
        return basic("dispute","dispute",disputeKey,captureId,status,{ disputeId: disputeKey,caseId: disputeKey,
          amount: money?.amount ?? null,currency: money?.currency ?? null,detail: info }); });
    }
    return [basic("ignore","event",null,null,"IGNORED")];
  }
  function webhookEvidence(eventId: string, eventType: string, cursor: number, item: PayPalWebhookPlanItem, paypalOrderId: string | null, captureId: string | null) {
    return { version: 1, paypalEventId: eventId, eventType, cursor, resourceKind: item.resourceKind, resourceId: item.resourceId,
      refundId: item.refundId, disputeId: item.disputeId, caseId: item.caseId, paypalOrderId, captureId,
      providerStatus: item.providerStatus, amount: item.amount, currency: item.currency, detail: { ...item.detail } };
  }
  async function prepareWebhookItem(eventInput: unknown, itemInput: unknown, cursor: number): Promise<PayPalWebhookCommand> {
    ready(); const identity=obj(eventInput),eventId=String(identity.id || ""),kind=String(identity.event_type || ""),item=planItem(itemInput);
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(eventId) || !/^[A-Z0-9._-]{3,100}$/.test(kind)) throw new BillingError(400,"invalid_webhook","Invalid PayPal webhook identity.");
    if (!Number.isInteger(cursor) || cursor < 0 || cursor > 19) throw new BillingError(400,"invalid_webhook","Invalid PayPal webhook cursor.");
    const outcome = (action: "applied" | "ignored", paypalOrderId: string | null, captureId: string | null, receiptEventId: string | null): PayPalWebhookOutcome => ({
      eventId,eventType:kind,cursor,action,resourceKind:item.resourceKind,resourceId:item.resourceId,paypalOrderId,captureId,
      providerStatus:item.providerStatus,amount:item.amount,currency:item.currency,receiptEventId,detail:{...item.detail} });
    const command = (effect: PayPalWebhookCommand["effect"],result: PayPalWebhookOutcome,orderId: string | null=null,extra: Partial<PayPalWebhookCommand>={}): PayPalWebhookCommand => ({
      effect,orderId,reviewKind:null,paypalOrderId:result.paypalOrderId,merchantId:null,receipt:null,evidence:null,outcome:result,...extra });
    const review = (order: StoredOrder,incoming: Json,reviewKind: NonNullable<PayPalWebhookCommand["reviewKind"]>) => {
      const evidence=webhookEvidence(eventId,kind,cursor,item,order.paypalOrderId,item.captureId),rid=webhookReceiptId(eventId,cursor);
      return command("review",outcome("applied",order.paypalOrderId,item.captureId,rid),order.orderId,{reviewKind,receipt:incoming,evidence});
    };
    const settlement = async (order: StoredOrder,remote: Json,expectedCapture?: string): Promise<PayPalWebhookCommand> => {
      const incoming=await freshReceipt(remote,order,expectedCapture);
      if (incoming?.status === "REFUNDED" || incoming?.status === "PARTIALLY_REFUNDED") return review(order,incoming,"refund");
      if (incoming?.status === "REVERSED") return review(order,incoming,"reversal");
      if (incoming && ["DECLINED","DENIED","FAILED"].includes(String(incoming.status))) {
        const captureId=incoming.captureId as string,rid=`paypal:failed:${captureId}:${incoming.status}`;
        return command("failure",outcome("applied",order.paypalOrderId,captureId,rid),order.orderId,{receipt:incoming});
      }
      if (incoming?.status === "COMPLETED") {
        const captureId=incoming.captureId as string,rid=`paypal:capture:${captureId}`;
        return command("capture",outcome("applied",order.paypalOrderId,captureId,rid),order.orderId,{receipt:incoming});
      }
      if (remote.status === "VOIDED" && !incoming) return command("close",outcome("applied",order.paypalOrderId,null,`paypal:closed:${order.paypalOrderId}`),order.orderId,
        {paypalOrderId:order.paypalOrderId,merchantId:order.merchantId});
      if (incoming) return command("none",outcome("applied",order.paypalOrderId,incoming.captureId as string,null));
      if (!["CREATED","SAVED","APPROVED","PAYER_ACTION_REQUIRED"].includes(String(remote.status))) return fail("payment_mismatch");
      return command("none",outcome("applied",order.paypalOrderId,null,null));
    };
    if (item.action === "ignore") return command("none",outcome("ignored",null,item.captureId,null));
    if (item.action === "order_approved") {
      if (kind !== "CHECKOUT.ORDER.APPROVED" || !providerId(item.resourceId)) return fail("invalid_webhook_plan");
      const order = await lookupFromProviderOrder(item.resourceId); if (!order) return fail("webhook_unmatched"); ready(order);
      let remote = await deps.gateway.getOrder(item.resourceId), existing = receipt(remote,order);
      if (remote.status === "APPROVED" && !existing && !order.hold && order.status !== "cancelled" && order.status !== "fulfilled") {
        try { remote = await deps.gateway.captureOrder(item.resourceId,order.orderId); }
        catch (error) { if (!(error instanceof BillingError) || error.code !== "payment_already_captured") throw error; remote = await deps.gateway.getOrder(item.resourceId); }
      }
      const prepared=await settlement(order,remote);if(prepared.effect==="none")return fail(prepared.outcome.captureId?"approval_capture_pending":"approval_unconfirmed");return prepared;
    }
    if (item.action === "approval_reversed") {
      if (kind !== "CHECKOUT.PAYMENT-APPROVAL.REVERSED" || !providerId(item.resourceId)) return fail("invalid_webhook_plan");
      const order = await lookupFromProviderOrder(item.resourceId); if (!order) return fail("webhook_unmatched"); ready(order);
      const remote = await deps.gateway.getOrder(item.resourceId); remoteUnit(remote,order);
      const evidence=webhookEvidence(eventId,kind,cursor,item,order.paypalOrderId,null),result=outcome("applied",order.paypalOrderId,null,webhookReceiptId(eventId,cursor));
      return command("approval_reversed",result,order.orderId,{paypalOrderId:item.resourceId,merchantId:order.merchantId,evidence});
    }
    if (!providerId(item.captureId)) return fail("invalid_webhook_plan");
    const order = await lookupFromCapture(item.captureId); if (!order) return fail("webhook_unmatched"); ready(order);
    if (item.action === "capture") {
      if (!["PAYMENT.CAPTURE.COMPLETED","PAYMENT.CAPTURE.PENDING","PAYMENT.CAPTURE.DENIED","PAYMENT.CAPTURE.DECLINED"].includes(kind)) return fail("invalid_webhook_plan");
      const prepared=await settlement(order,await deps.gateway.getOrder(order.paypalOrderId!),item.captureId);
      if (prepared.effect==="none" && kind!=="PAYMENT.CAPTURE.PENDING") return fail(kind==="PAYMENT.CAPTURE.COMPLETED"?"capture_unconfirmed":"failure_unconfirmed");
      return prepared;
    }
    const incoming = await freshReceipt(await deps.gateway.getOrder(order.paypalOrderId!),order,item.captureId); if (!incoming) return fail("payment_mismatch");
    if (item.action === "capture_reversed") {
      if (kind !== "PAYMENT.CAPTURE.REVERSED") return fail("invalid_webhook_plan");
      const reviewKind = ["REFUNDED","PARTIALLY_REFUNDED"].includes(String(incoming.status)) ? "refund" : "reversal";
      return review(order,incoming,reviewKind);
    }
    if (item.action === "refund") {
      if (!["PAYMENT.CAPTURE.REFUNDED","PAYMENT.REFUND.PENDING","PAYMENT.REFUND.FAILED"].includes(kind)) return fail("invalid_webhook_plan");
      if (["FAILED","CANCELLED"].includes(String(item.providerStatus))) return command("none",outcome("ignored",order.paypalOrderId,item.captureId,null));
      const reviewKind = ["REFUNDED","PARTIALLY_REFUNDED"].includes(String(incoming.status)) || item.providerStatus === "COMPLETED" ? "refund" : "refund_pending";
      return review(order,incoming,reviewKind);
    }
    if (item.action === "dispute") {
      if (!["CUSTOMER.DISPUTE.CREATED","CUSTOMER.DISPUTE.UPDATED","CUSTOMER.DISPUTE.RESOLVED"].includes(kind)) return fail("invalid_webhook_plan");
      const reviewKind = ["REFUNDED","PARTIALLY_REFUNDED"].includes(String(incoming.status)) ? "refund" : "dispute";
      return review(order,incoming,reviewKind);
    }
    return fail("invalid_webhook_plan");
  }
  return { status, quote, create, capture: (context: Context, input: unknown) => payment(context, input, true), reconcile: (context: Context, input: unknown) => payment(context, input, true),
    verifyWebhook, prepareWebhook, prepareWebhookItem };
}
