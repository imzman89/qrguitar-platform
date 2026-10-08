import type { BillingAuth } from "./billing-client";
import type { AppliedPromotion, DirectOffer } from "./direct-payments";
import type { PayPalOrder, PayPalPaymentsSnapshot } from "./paypal-payments";
import { createPaymentSessionScope, directOrderId, PaymentRequestError } from "./direct-payments-client";
import {
  canUseOptionalTracking,
  dispatchOptionalTrackingProductEvent,
  optionalTrackingProductEvents,
  subscribeToOptionalTrackingConsent,
  type OptionalTrackingRuntime
} from "./optional-tracking-consent";

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const packs: Record<string, [number, number]> = { profile_1: [1200, 1], profile_10: [5000, 10], profile_25: [9900, 25] };
export const paypalProviderOrderId = (value: unknown) => typeof value === "string" && /^[A-Z0-9]{5,64}$/.test(value) ? value : "";
const terminal = (status: string) => ["fulfilled", "cancelled", "needs_review"].includes(status);
type PurchaseTrackingArm = Readonly<{ actorId: string; consentEpoch: string; orderId: string; offerKey: string }>;
export function paypalTrackingProperties(offer: DirectOffer) {
  const specification = packs[offer.key];
  const pricing = offer.promotion?.classification || "standard";
  if (!specification || offer.credits !== specification[1] || !Number.isSafeInteger(offer.amount) || offer.amount < 30 || offer.amount > specification[0]
    || !["standard", "promotion", "internal_test"].includes(pricing)
    || (pricing === "standard") !== (offer.amount === specification[0])) return null;
  return { credits: specification[1] as 1 | 10 | 25, valueUsd: offer.amount / 100,
    pricing: pricing as "standard" | "promotion" | "internal_test" };
}
function readPurchaseTrackingArm(value: unknown): PurchaseTrackingArm | null {
  const row = record(value);
  return Object.keys(row).length === 4 && directOrderId(row.actorId) && directOrderId(row.consentEpoch) && directOrderId(row.orderId)
    && typeof row.offerKey === "string" && Object.hasOwn(packs, row.offerKey)
    ? { actorId: row.actorId as string, consentEpoch: row.consentEpoch as string, orderId: row.orderId as string, offerKey: row.offerKey }
    : null;
}
export type PayPalClientOrder = PayPalOrder;
export type PayPalSnapshot = PayPalPaymentsSnapshot;
export type PayPalIntent = {
  requestId: string; offerKey: string; orderId: string; paypalOrderId: string; approvalObserved: boolean;
  promoCode: string; promoId: string; promoRevision: number | null; expectedAmount: number | null;
};
export type PayPalPaymentsState = {
  phase: "loading" | "ready" | "signed-out" | "error"; actorId: string; snapshot: PayPalSnapshot | null;
  intent: PayPalIntent | null; busy: "" | "creating" | "capturing" | "reconciling"; refreshing: boolean;
  message: string; uncertain: boolean; polling: boolean; checkoutOpen: boolean;
};
export const initialPayPalPaymentsState = (): PayPalPaymentsState => ({ phase: "loading", actorId: "", snapshot: null, intent: null, busy: "", refreshing: false, message: "", uncertain: false, polling: false, checkoutOpen: false });
function readOffer(value: unknown): DirectOffer {
  const row = record(value), spec = typeof row.key === "string" && Object.hasOwn(packs, row.key) ? packs[row.key] : null;
  if (!spec || !Number.isSafeInteger(row.amount) || Number(row.amount) < 30 || Number(row.amount) > spec[0]
    || row.credits !== spec[1] || row.currency !== "usd" || row.version !== 1 || row.permanent !== true || row.freeAllowance !== 5)
    throw new Error("The selected Profile pack could not be verified. Refresh to try again.");
  if (row.promotion == null) {
    if (row.amount !== spec[0] || row.listAmount !== undefined) throw new Error("The selected Profile pack could not be verified. Refresh to try again.");
    return row as DirectOffer;
  }
  const promotion = record(row.promotion);
  if (!directOrderId(promotion.id) || typeof promotion.code !== "string" || !/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(promotion.code)
    || typeof promotion.name !== "string" || promotion.name.length < 1 || promotion.name.length > 80
    || !Number.isSafeInteger(promotion.revision) || Number(promotion.revision) < 1
    || !["fixed_total", "amount_off", "percent_off"].includes(String(promotion.discountType))
    || !Number.isSafeInteger(promotion.discountValue) || Number(promotion.discountValue) < 1
    || !["promotion", "internal_test"].includes(String(promotion.classification))
    || promotion.originalAmount !== spec[0] || row.listAmount !== spec[0] || promotion.finalAmount !== row.amount
    || !Number.isSafeInteger(promotion.discountAmount) || Number(promotion.discountAmount) < 1
    || Number(promotion.originalAmount) - Number(promotion.discountAmount) !== Number(promotion.finalAmount)
    || Number(promotion.finalAmount) >= spec[0]) throw new Error("The applied promo could not be verified. Apply it again.");
  return { ...row, promotion: promotion as AppliedPromotion } as DirectOffer;
}
function readOrder(value: unknown, ownerId: string, requestedOrder = ""): PayPalClientOrder {
  const row = record(value), offer = readOffer(row.offer);
  if (!directOrderId(row.orderId) || row.ownerId !== ownerId || !directOrderId(row.requestId) || row.offerKey !== offer.key
    || (requestedOrder && row.orderId !== requestedOrder) || (row.paypalOrderId !== null && !paypalProviderOrderId(row.paypalOrderId))
    || !["reserved", "approval_pending", "processing", "fulfilled", "cancelled", "needs_review"].includes(String(row.status))
    || typeof row.createdAt !== "string" || !Number.isFinite(Date.parse(row.createdAt))) throw new Error("Your payment could not be verified. Refresh before trying again.");
  return { ...row, offer } as PayPalClientOrder;
}
function readSnapshot(value: unknown, ownerId: string, requestedOrder: string): PayPalSnapshot {
  const row = record(value);
  if (!["test", "live"].includes(String(row.environment)) || row.freeLimit !== 5 || row.currency !== "USD"
    || ["freeRemaining", "paidGranted", "paidConsumed", "paidRemaining", "paidAvailable", "ownedProfiles"].some(key => !Number.isSafeInteger(row[key]) || Number(row[key]) < 0)
    || Number(row.freeRemaining) > 5 || row.paidRemaining !== Number(row.paidGranted) - Number(row.paidConsumed)
    || typeof row.hold !== "boolean" || typeof row.commercialExempt !== "boolean" || row.paidAvailable !== (row.hold ? 0 : row.paidRemaining)
    || typeof row.enabled !== "boolean" || typeof row.applePayEnabled !== "boolean" || !Array.isArray(row.offers) || typeof row.merchantName !== "string" || !row.merchantName.trim()
    || (row.clientId !== null && (typeof row.clientId !== "string" || !/^[A-Za-z0-9_-]{10,256}$/.test(row.clientId)))
    || (row.enabled && !row.clientId)) throw new Error("Your credit balance or payment settings could not be verified. Refresh to try again.");
  const offers = row.offers.map(readOffer);
  if (new Set(offers.map(offer => offer.key)).size !== offers.length) throw new Error("Available Profile packs could not be verified.");
  const order = row.order === null ? null : readOrder(row.order, ownerId, requestedOrder), pendingOrder = row.pendingOrder === null ? null : readOrder(row.pendingOrder, ownerId);
  if ((requestedOrder && !order) || (pendingOrder && ["fulfilled", "cancelled"].includes(pendingOrder.status))) throw new Error("Your pending payment could not be verified.");
  const legacyOrderId = row.legacyOrderId == null ? null : directOrderId(row.legacyOrderId);
  const legacyOrderProvider = row.legacyOrderProvider == null ? null : row.legacyOrderProvider;
  if ((row.legacyOrderId != null && !legacyOrderId)
    || (legacyOrderProvider !== null && legacyOrderProvider !== "direct" && legacyOrderProvider !== "stripe")
    || Boolean(legacyOrderId) !== Boolean(legacyOrderProvider)) throw new Error("Your earlier payment could not be verified.");
  return { ...row, offers, order, pendingOrder, legacyOrderId, legacyOrderProvider } as PayPalSnapshot;
}
function readIntent(value: unknown): PayPalIntent | null {
  const row = record(value);
  const promoCode = row.promoCode == null ? "" : row.promoCode, promoId = row.promoId == null ? "" : row.promoId;
  const hasPromo = typeof promoCode === "string" && promoCode.length > 0;
  return directOrderId(row.requestId) && typeof row.offerKey === "string" && Object.hasOwn(packs, row.offerKey)
    && (row.orderId === "" || directOrderId(row.orderId)) && (row.paypalOrderId === "" || paypalProviderOrderId(row.paypalOrderId))
    && typeof row.approvalObserved === "boolean"
    && ((!hasPromo && promoCode === "" && promoId === "" && row.promoRevision == null && row.expectedAmount == null)
      || (hasPromo && /^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(promoCode as string) && directOrderId(promoId)
        && Number.isSafeInteger(row.promoRevision) && Number(row.promoRevision) > 0
        && Number.isSafeInteger(row.expectedAmount) && Number(row.expectedAmount) >= 30))
    ? { requestId: row.requestId as string, offerKey: row.offerKey as string, orderId: row.orderId as string,
        paypalOrderId: row.paypalOrderId as string, approvalObserved: row.approvalObserved as boolean,
        promoCode: promoCode as string, promoId: promoId as string,
        promoRevision: hasPromo ? row.promoRevision as number : null, expectedAmount: hasPromo ? row.expectedAmount as number : null }
    : null;
}
export function createPayPalPaymentsClient(deps: {
  auth: () => BillingAuth; fetch?: typeof fetch; timeoutMs?: number; storage?: () => Pick<Storage, "getItem" | "setItem" | "removeItem">;
  randomUUID?: () => string; orderId?: string; returnFlow?: boolean; pollMs?: number; maxPolls?: number;
  trackingRuntime?: OptionalTrackingRuntime;
}) {
  let state = initialPayPalPaymentsState(), disposed = false, loadRevision = 0, lock: symbol | undefined, timer: ReturnType<typeof setTimeout> | undefined, polls = 0;
  let purchaseTrackingArm: PurchaseTrackingArm | null = null;
  const observations = new Map<string, "processing" | "needs_review">();
  const listeners = new Set<(state: PayPalPaymentsState) => void>(), memory = new Map<string, PayPalIntent | null>(), queryOrder = directOrderId(deps.orderId);
  const publish = (patch: Partial<PayPalPaymentsState>) => { if (!disposed) { state = { ...state, ...patch }; listeners.forEach(listener => listener(state)); } };
  const storage = () => deps.storage ? deps.storage() : window.sessionStorage, storageKey = () => `qrguitar:paypal-checkout:${state.actorId}`;
  const trackingStorageKey = "qrguitar:paypal-purchase-tracking:v1";
  const trackingEpochStorageKey = "qrguitar:paypal-purchase-tracking-epoch:v1";
  const analyticsAllowed = () => canUseOptionalTracking("analytics", deps.trackingRuntime);
  function consentEpoch() {
    if (!analyticsAllowed()) return "";
    try {
      const existing = directOrderId(storage().getItem(trackingEpochStorageKey));
      if (existing) return existing;
      const created = crypto.randomUUID();
      storage().setItem(trackingEpochStorageKey, created);
      return storage().getItem(trackingEpochStorageKey) === created ? created : "";
    } catch { return ""; }
  }
  function clearPurchaseTrackingArm() {
    purchaseTrackingArm = null;
    try { storage().removeItem(trackingStorageKey); } catch { /* Consent gating does not depend on storage cleanup succeeding. */ }
  }
  function rememberPurchaseTrackingArm(arm: PurchaseTrackingArm | null) {
    if (!arm || !analyticsAllowed()) { clearPurchaseTrackingArm(); return; }
    purchaseTrackingArm = arm;
    try { storage().setItem(trackingStorageKey, JSON.stringify(arm)); } catch { /* The current controller still keeps its consent-epoch arm in memory. */ }
  }
  function restorePurchaseTrackingArm() {
    purchaseTrackingArm = null;
    if (!state.actorId) return;
    if (!analyticsAllowed()) { clearPurchaseTrackingArm(); return; }
    try {
      const epoch = consentEpoch();
      const stored = readPurchaseTrackingArm(JSON.parse(storage().getItem(trackingStorageKey) || "null"));
      purchaseTrackingArm = stored && epoch && stored.actorId === state.actorId && stored.consentEpoch === epoch ? stored : null;
      if (!purchaseTrackingArm) storage().removeItem(trackingStorageKey);
    } catch { clearPurchaseTrackingArm(); }
  }
  function remember(intent: PayPalIntent | null) { memory.set(state.actorId, intent); publish({ intent }); try { if (intent) storage().setItem(storageKey(), JSON.stringify(intent)); else storage().removeItem(storageKey()); } catch { /* Server pendingOrder also recovers established checkouts. */ } }
  function stopPolling() { if (timer) clearTimeout(timer); timer = undefined; publish({ polling: false }); }
  const scope = createPaymentSessionScope(deps, actorId => {
    const previousActor = state.actorId;
    if (previousActor && previousActor !== actorId) clearPurchaseTrackingArm();
    loadRevision++; lock = undefined; polls = 0; observations.clear(); stopPolling(); publish({ ...initialPayPalPaymentsState(), actorId, phase: actorId ? "loading" : "signed-out" });
    restorePurchaseTrackingArm();
    if (!actorId) return;
    if (memory.has(actorId)) publish({ intent: memory.get(actorId) || null });
    else try { publish({ intent: readIntent(JSON.parse(storage().getItem(storageKey()) || "null")) }); } catch { /* No credentials are stored in checkout state. */ }
    void Promise.resolve().then(load);
  });
  const unsubscribeTrackingConsent = subscribeToOptionalTrackingConsent((consent) => {
    if (consent.status !== "accepted" || !consent.purposes.includes("analytics")) {
      clearPurchaseTrackingArm();
      try { storage().removeItem(trackingEpochStorageKey); } catch { /* A stale arm cannot dispatch while consent remains denied. */ }
    }
  }, deps.trackingRuntime);
  function observe(value: unknown, ownerId: string, orderId: string) {
    const order = readOrder(value, ownerId, orderId), intent = state.intent;
    if (intent?.orderId === orderId && intent.paypalOrderId && intent.paypalOrderId !== order.paypalOrderId) throw new Error("Your payment could not be verified. Check its status before trying again.");
    if (order.status === "processing" || order.status === "needs_review") observations.set(orderId, order.status);
    else observations.delete(orderId);
    if (intent?.orderId === orderId) remember({ ...intent, approvalObserved: !["approval_pending", "reserved", "needs_review"].includes(order.status) });
  }
  function displayObservation(order: PayPalClientOrder | null): PayPalClientOrder | null {
    if (!order) return null;
    if (terminal(order.status)) { observations.delete(order.orderId); return order; }
    const observed = observations.get(order.orderId); return observed ? { ...order, status: observed } : order;
  }
  function schedulePoll() {
    const order = state.snapshot?.order || state.snapshot?.pendingOrder;
    if (disposed || lock || state.phase !== "ready" || !state.actorId || polls >= (deps.maxPolls ?? 5) || (order && terminal(order.status))
      || !(deps.returnFlow || state.intent?.approvalObserved || order?.status === "processing")) { stopPolling(); return; }
    if (timer) return; const lease = scope.lease(); publish({ polling: true });
    timer = setTimeout(() => { timer = undefined; if (!scope.live(lease)) return; polls++; void load(); }, deps.pollMs ?? 2500);
  }
  async function load() {
    if (disposed || lock || !state.actorId) return;
    const lease = scope.lease(), attempt = ++loadRevision, intentOrder = state.intent?.orderId || "", orderId = queryOrder || intentOrder;
    publish({ refreshing: true });
    try {
      const result = await scope.request(lease, `/api/billing/paypal/status${orderId ? `?orderId=${encodeURIComponent(orderId)}` : ""}`);
      if (!scope.live(lease) || attempt !== loadRevision) return;
      const authoritative = readSnapshot(result, lease.actorId, orderId);
      const snapshot = { ...authoritative, order: displayObservation(authoritative.order), pendingOrder: displayObservation(authoritative.pendingOrder) }, order = snapshot.order;
      if (snapshot.pendingOrder) {
        const pending = snapshot.pendingOrder, approved = state.intent?.orderId === pending.orderId && state.intent.approvalObserved;
        remember({ requestId: pending.requestId, offerKey: pending.offerKey, orderId: pending.orderId, paypalOrderId: pending.paypalOrderId || "", approvalObserved: Boolean(approved),
          promoCode: pending.offer.promotion?.code || "", promoId: pending.offer.promotion?.id || "",
          promoRevision: pending.offer.promotion?.revision || null, expectedAmount: pending.offer.promotion ? pending.offer.amount : null });
      } else if (state.intent?.orderId && order?.orderId === state.intent.orderId && terminal(order.status)) remember(null);
      publish({ phase: "ready", snapshot, refreshing: false, uncertain: Boolean(state.intent && !snapshot.pendingOrder), ...(order && terminal(order.status) ? { checkoutOpen: false, message: "" } : {}) }); schedulePoll();
      const currentConsentEpoch = purchaseTrackingArm && analyticsAllowed() ? consentEpoch() : "";
      const armed = order?.status === "fulfilled" && currentConsentEpoch
        && purchaseTrackingArm?.actorId === lease.actorId
        && purchaseTrackingArm.consentEpoch === currentConsentEpoch
        && purchaseTrackingArm.orderId === order.orderId
        && purchaseTrackingArm.offerKey === order.offerKey;
      const completedPack = order && armed ? paypalTrackingProperties(order.offer) : null;
      if (order && completedPack) {
        clearPurchaseTrackingArm();
        void dispatchOptionalTrackingProductEvent({
        name: optionalTrackingProductEvents.purchaseCompleted,
        properties: completedPack
        }, { dedupeKey: order.orderId, runtime: deps.trackingRuntime });
      }
    } catch (error) { if (scope.live(lease) && attempt === loadRevision) { stopPolling(); publish({ phase: "error", snapshot: null, refreshing: false, message: error instanceof Error ? error.message : "Could not check payment status." }); } }
  }
  async function start() { const lease = scope.lease(); try { await scope.start(); } catch (error) { if (scope.live(lease)) publish({ phase: "error", message: error instanceof Error ? error.message : "Sign-in is unavailable." }); } }
  async function quotePromotion(offerKey: string, promoCodeInput: string, expectedActor: string): Promise<DirectOffer> {
    const snapshot = state.snapshot, promoCode = promoCodeInput.trim().toUpperCase();
    if (disposed || lock || state.refreshing || state.phase !== "ready" || !snapshot || expectedActor !== state.actorId || state.intent
      || !snapshot.enabled || snapshot.hold || snapshot.commercialExempt || snapshot.legacyOrderId
      || !snapshot.offers.some(offer => offer.key === offerKey) || !/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(promoCode))
      throw new Error("Enter a valid promo code and try again.");
    const lease = scope.lease(), result = await scope.request(lease, "/api/billing/paypal/promo", { offerKey, promoCode });
    if (!scope.live(lease)) throw new Error("Your sign-in changed. Apply the promo code again.");
    const offer = readOffer(result.offer);
    if (offer.key !== offerKey || offer.promotion?.code !== promoCode) throw new Error("The applied promo could not be verified. Apply it again.");
    return offer;
  }
  async function createOrder(offerKey: string, expectedActor: string, pricedOffer?: DirectOffer): Promise<string> {
    const snapshot = state.snapshot;
    if (disposed || lock || state.refreshing || state.phase !== "ready" || !snapshot || !state.actorId || expectedActor !== state.actorId
      || (!state.intent && (!snapshot.enabled || snapshot.hold || snapshot.commercialExempt || snapshot.legacyOrderId || !snapshot.offers.some(offer => offer.key === offerKey)))
      || (state.intent && state.intent.offerKey !== offerKey)) throw new Error("Refresh your account before opening checkout.");
    const suppliedPromotion = pricedOffer?.promotion;
    if (!state.intent && pricedOffer && (pricedOffer.key !== offerKey || (suppliedPromotion ? pricedOffer.amount !== suppliedPromotion.finalAmount : pricedOffer.amount !== packs[offerKey]?.[0])))
      throw new Error("Apply the promo code again before checkout.");
    const lease = scope.lease(), operation = Symbol("create-paypal"); let resolved = false; lock = operation; loadRevision++; stopPolling(); publish({ busy: "creating", message: "", checkoutOpen: true });
    try {
      if (!state.intent) { const requestId = directOrderId(deps.randomUUID ? deps.randomUUID() : crypto.randomUUID()); if (!requestId) throw new Error("Could not save your checkout. Please try again."); remember({ requestId, offerKey, orderId: "", paypalOrderId: "", approvalObserved: false,
        promoCode: suppliedPromotion?.code || "", promoId: suppliedPromotion?.id || "",
        promoRevision: suppliedPromotion?.revision || null, expectedAmount: suppliedPromotion ? pricedOffer!.amount : null }); }
      const intent = state.intent!;
      const result = await scope.request(lease, "/api/billing/paypal/create", { offerKey: intent.offerKey, requestId: intent.requestId,
        ...(intent.promoCode ? { promoCode: intent.promoCode, promoId: intent.promoId, promoRevision: intent.promoRevision, expectedAmount: intent.expectedAmount } : {}) });
      const orderId = directOrderId(result.orderId), paypalOrderId = paypalProviderOrderId(result.paypalOrderId), status = result.status;
      const returnedOffer = result.offer === undefined && !intent.promoCode
        ? snapshot.offers.find(offer => offer.key === intent.offerKey)
          || (snapshot.pendingOrder?.offerKey === intent.offerKey ? snapshot.pendingOrder.offer : undefined)
          || (snapshot.order?.offerKey === intent.offerKey ? snapshot.order.offer : undefined)
        : readOffer(result.offer);
      if ((status !== undefined && !["reserved", "approval_pending", "processing", "fulfilled", "cancelled", "needs_review"].includes(String(status)))
        || !orderId || (!paypalOrderId && !(terminal(String(status)) && result.paypalOrderId === null))
        || !returnedOffer || returnedOffer.key !== intent.offerKey || (returnedOffer.promotion?.code || "") !== intent.promoCode
        || (intent.promoCode && (returnedOffer.promotion?.id !== intent.promoId || returnedOffer.promotion?.revision !== intent.promoRevision || returnedOffer.amount !== intent.expectedAmount))
        || (intent.orderId && orderId !== intent.orderId) || (intent.paypalOrderId && paypalOrderId !== intent.paypalOrderId)) throw new Error("The checkout response could not be verified. Check its status before trying again.");
      remember({ ...intent, orderId, paypalOrderId }); publish({ uncertain: false });
      if (terminal(String(status))) { resolved = true; throw new Error("This payment is already resolved. Check its status above."); }
      const epoch = consentEpoch();
      const startedPack = paypalTrackingProperties(returnedOffer);
      if (startedPack && epoch) rememberPurchaseTrackingArm({ actorId: state.actorId, consentEpoch: epoch, orderId, offerKey: intent.offerKey });
      if (startedPack) void dispatchOptionalTrackingProductEvent({
        name: optionalTrackingProductEvents.checkoutStarted,
        properties: startedPack
      }, { dedupeKey: orderId, runtime: deps.trackingRuntime });
      return paypalOrderId;
    } catch (error) {
      if (scope.live(lease)) {
        const rejected = error instanceof PaymentRequestError && error.status >= 400 && error.status < 500;
        if (rejected) remember(null);
        publish({ checkoutOpen: false, uncertain: !resolved && !rejected && Boolean(state.intent), message: resolved
          ? "This payment is already resolved. Check its status above."
          : rejected
            ? `${error.message} Refresh your account or reapply the promo before trying again.`
            : `${error instanceof Error ? error.message : "Checkout could not open."} Your checkout is saved for a safe retry.` });
      }
      throw error;
    }
    finally { if (lock === operation) { lock = undefined; if (scope.live(lease)) { publish({ busy: "" }); if (resolved) await load(); } } }
  }
  async function capture(paypalOrderId: string, expectedActor: string): Promise<"confirmed" | "pending" | "restart"> {
    const intent = state.intent;
    if (disposed || lock || !intent?.orderId || !intent.paypalOrderId || paypalOrderId !== intent.paypalOrderId || expectedActor !== state.actorId) throw new Error("This payment does not match your current checkout. Refresh to check its status.");
    const lease = scope.lease(), operation = Symbol("capture-paypal"); lock = operation; loadRevision++; stopPolling(); remember({ ...intent, approvalObserved: true }); publish({ busy: "capturing", checkoutOpen: false, message: "Confirming your payment…", uncertain: false });
    let response: "pending" | "restart" = "pending", reload = false;
    try { const result = await scope.request(lease, "/api/billing/paypal/capture", { orderId: intent.orderId }); observe(result.order, lease.actorId, intent.orderId); reload = true; }
    catch (error) {
      if (scope.live(lease)) {
        if (error instanceof PaymentRequestError && ["instrument_declined", "INSTRUMENT_DECLINED"].includes(error.code)) { remember({ ...intent, approvalObserved: false }); publish({ message: "Choose another payment method to finish checkout.", uncertain: false }); response = "restart"; }
        else publish({ uncertain: true, message: "We couldn’t confirm the latest payment status. Check this saved payment before paying again." });
      }
    } finally { if (lock === operation) { lock = undefined; if (scope.live(lease)) { publish({ busy: "" }); if (reload) await load(); } } }
    if (!scope.live(lease)) throw new Error("Your sign-in changed. Check payment status in the original account.");
    return state.snapshot?.order?.status === "fulfilled" ? "confirmed" : response;
  }
  async function reconcile() {
    if (disposed || lock || !state.actorId) return;
    if (!state.intent?.orderId && !queryOrder) {
      if (state.intent) { try { await createOrder(state.intent.offerKey, state.actorId); } catch { return; } }
      else { await load(); return; }
    }
    const orderId = queryOrder || state.intent?.orderId;
    if (!orderId) return;
    const lease = scope.lease(), operation = Symbol("reconcile-paypal"); lock = operation; loadRevision++; stopPolling(); publish({ busy: "reconciling", message: "Checking your saved payment…" }); let success = false;
    try { const result = await scope.request(lease, "/api/billing/paypal/reconcile", { orderId }); observe(result.order, lease.actorId, orderId); success = true; }
    catch (error) { if (scope.live(lease)) publish({ uncertain: true, message: error instanceof Error ? error.message : "Could not check payment yet. Please try again." }); }
    finally { if (lock === operation) { lock = undefined; if (scope.live(lease)) { publish({ busy: "", checkoutOpen: false }); if (success) { publish({ message: "" }); polls = 0; await load(); } } } }
  }
  async function cancelled(expectedActor: string) { if (disposed || expectedActor !== state.actorId) return; publish({ checkoutOpen: false, message: "Checkout closed. You can resume when you’re ready.", uncertain: Boolean(state.intent?.approvalObserved) }); await load(); }
  async function completeReturn() {
    const order = state.snapshot?.order, intent = state.intent;
    if (!deps.returnFlow || !queryOrder || state.phase !== "ready" || !order || order.orderId !== queryOrder || terminal(order.status)) return;
    if (!order.paypalOrderId || !intent || intent.orderId !== order.orderId || intent.paypalOrderId !== order.paypalOrderId) return;
    await capture(order.paypalOrderId, state.actorId);
  }
  function beginWalletCheckout(offerKey: string, expectedActor: string) {
    const snapshot = state.snapshot;
    if (disposed || lock || state.refreshing || state.checkoutOpen || state.intent?.approvalObserved || state.phase !== "ready" || expectedActor !== state.actorId || !snapshot?.applePayEnabled
      || snapshot.hold || snapshot.commercialExempt || snapshot.legacyOrderId || (state.intent ? state.intent.offerKey !== offerKey : !snapshot.enabled || !snapshot.offers.some(offer => offer.key === offerKey))) return false;
    publish({ checkoutOpen: true, message: "" }); return true;
  }
  function sdkError(expectedActor: string) { if (!disposed && expectedActor === state.actorId) { const resolved = terminal(state.snapshot?.order?.status || ""); publish({ checkoutOpen: false, message: resolved ? "This payment is already resolved. Check its status above." : state.message || "Checkout couldn’t finish. Try again, or check the status of your saved payment.", uncertain: !resolved && Boolean(state.intent) }); } }
  return { getState: () => state, subscribe(listener: (state: PayPalPaymentsState) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }, start, quotePromotion, createOrder, capture, reconcile, completeReturn, beginWalletCheckout, cancelled, sdkError,
    reload: () => { polls = 0; stopPolling(); return state.actorId ? load() : start(); },
    dispose() { disposed = true; stopPolling(); unsubscribeTrackingConsent(); scope.dispose(); listeners.clear(); state = initialPayPalPaymentsState(); purchaseTrackingArm = null; }
  };
}
