import type { BillingAuth } from "./billing-client";
import type { DirectOffer } from "./direct-payments";
import type { PayPalOrder, PayPalPaymentsSnapshot } from "./paypal-payments";
import { createPaymentSessionScope, directOrderId, PaymentRequestError } from "./direct-payments-client";

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const packs: Record<string, [number, number]> = { profile_1: [1200, 1], profile_10: [5000, 10], profile_25: [9900, 25] };
export const paypalProviderOrderId = (value: unknown) => typeof value === "string" && /^[A-Z0-9]{5,64}$/.test(value) ? value : "";
const terminal = (status: string) => ["fulfilled", "cancelled", "needs_review"].includes(status);
export type PayPalClientOrder = PayPalOrder;
export type PayPalSnapshot = PayPalPaymentsSnapshot;
export type PayPalIntent = { requestId: string; offerKey: string; orderId: string; paypalOrderId: string; approvalObserved: boolean };
export type PayPalPaymentsState = {
  phase: "loading" | "ready" | "signed-out" | "error"; actorId: string; snapshot: PayPalSnapshot | null;
  intent: PayPalIntent | null; busy: "" | "creating" | "capturing" | "reconciling"; refreshing: boolean;
  message: string; uncertain: boolean; polling: boolean; checkoutOpen: boolean;
};
export const initialPayPalPaymentsState = (): PayPalPaymentsState => ({ phase: "loading", actorId: "", snapshot: null, intent: null, busy: "", refreshing: false, message: "", uncertain: false, polling: false, checkoutOpen: false });
function readOffer(value: unknown): DirectOffer {
  const row = record(value), spec = typeof row.key === "string" && Object.hasOwn(packs, row.key) ? packs[row.key] : null;
  if (!spec || row.amount !== spec[0] || row.credits !== spec[1] || row.currency !== "usd" || row.version !== 1 || row.permanent !== true || row.freeAllowance !== 5) throw new Error("The selected Profile pack could not be verified. Refresh to try again.");
  return row as DirectOffer;
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
  return directOrderId(row.requestId) && typeof row.offerKey === "string" && Object.hasOwn(packs, row.offerKey)
    && (row.orderId === "" || directOrderId(row.orderId)) && (row.paypalOrderId === "" || paypalProviderOrderId(row.paypalOrderId))
    && typeof row.approvalObserved === "boolean" ? row as PayPalIntent : null;
}
export function createPayPalPaymentsClient(deps: {
  auth: () => BillingAuth; fetch?: typeof fetch; timeoutMs?: number; storage?: () => Pick<Storage, "getItem" | "setItem" | "removeItem">;
  randomUUID?: () => string; orderId?: string; returnFlow?: boolean; pollMs?: number; maxPolls?: number;
}) {
  let state = initialPayPalPaymentsState(), disposed = false, loadRevision = 0, lock: symbol | undefined, timer: ReturnType<typeof setTimeout> | undefined, polls = 0;
  const observations = new Map<string, "processing" | "needs_review">();
  const listeners = new Set<(state: PayPalPaymentsState) => void>(), memory = new Map<string, PayPalIntent | null>(), queryOrder = directOrderId(deps.orderId);
  const publish = (patch: Partial<PayPalPaymentsState>) => { if (!disposed) { state = { ...state, ...patch }; listeners.forEach(listener => listener(state)); } };
  const storage = () => deps.storage ? deps.storage() : window.sessionStorage, storageKey = () => `qrguitar:paypal-checkout:${state.actorId}`;
  function remember(intent: PayPalIntent | null) { memory.set(state.actorId, intent); publish({ intent }); try { if (intent) storage().setItem(storageKey(), JSON.stringify(intent)); else storage().removeItem(storageKey()); } catch { /* Server pendingOrder also recovers established checkouts. */ } }
  function stopPolling() { if (timer) clearTimeout(timer); timer = undefined; publish({ polling: false }); }
  const scope = createPaymentSessionScope(deps, actorId => {
    loadRevision++; lock = undefined; polls = 0; observations.clear(); stopPolling(); publish({ ...initialPayPalPaymentsState(), actorId, phase: actorId ? "loading" : "signed-out" });
    if (!actorId) return;
    if (memory.has(actorId)) publish({ intent: memory.get(actorId) || null });
    else try { publish({ intent: readIntent(JSON.parse(storage().getItem(storageKey()) || "null")) }); } catch { /* No credentials are stored in checkout state. */ }
    void Promise.resolve().then(load);
  });
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
        remember({ requestId: pending.requestId, offerKey: pending.offerKey, orderId: pending.orderId, paypalOrderId: pending.paypalOrderId || "", approvalObserved: Boolean(approved) });
      } else if (state.intent?.orderId && order?.orderId === state.intent.orderId && terminal(order.status)) remember(null);
      publish({ phase: "ready", snapshot, refreshing: false, uncertain: Boolean(state.intent && !snapshot.pendingOrder), ...(order && terminal(order.status) ? { checkoutOpen: false, message: "" } : {}) }); schedulePoll();
    } catch (error) { if (scope.live(lease) && attempt === loadRevision) { stopPolling(); publish({ phase: "error", snapshot: null, refreshing: false, message: error instanceof Error ? error.message : "Could not check payment status." }); } }
  }
  async function start() { const lease = scope.lease(); try { await scope.start(); } catch (error) { if (scope.live(lease)) publish({ phase: "error", message: error instanceof Error ? error.message : "Sign-in is unavailable." }); } }
  async function createOrder(offerKey: string, expectedActor: string): Promise<string> {
    const snapshot = state.snapshot;
    if (disposed || lock || state.refreshing || state.phase !== "ready" || !snapshot || !state.actorId || expectedActor !== state.actorId
      || (!state.intent && (!snapshot.enabled || snapshot.hold || snapshot.commercialExempt || snapshot.legacyOrderId || !snapshot.offers.some(offer => offer.key === offerKey)))
      || (state.intent && state.intent.offerKey !== offerKey)) throw new Error("Refresh your account before opening checkout.");
    const lease = scope.lease(), operation = Symbol("create-paypal"); let resolved = false; lock = operation; loadRevision++; stopPolling(); publish({ busy: "creating", message: "", checkoutOpen: true });
    try {
      if (!state.intent) { const requestId = directOrderId(deps.randomUUID ? deps.randomUUID() : crypto.randomUUID()); if (!requestId) throw new Error("Could not save your checkout. Please try again."); remember({ requestId, offerKey, orderId: "", paypalOrderId: "", approvalObserved: false }); }
      const intent = state.intent!;
      const result = await scope.request(lease, "/api/billing/paypal/create", { offerKey: intent.offerKey, requestId: intent.requestId });
      const orderId = directOrderId(result.orderId), paypalOrderId = paypalProviderOrderId(result.paypalOrderId), status = result.status;
      if ((status !== undefined && !["reserved", "approval_pending", "processing", "fulfilled", "cancelled", "needs_review"].includes(String(status)))
        || !orderId || (!paypalOrderId && !(terminal(String(status)) && result.paypalOrderId === null))
        || (intent.orderId && orderId !== intent.orderId) || (intent.paypalOrderId && paypalOrderId !== intent.paypalOrderId)) throw new Error("The checkout response could not be verified. Check its status before trying again.");
      remember({ ...intent, orderId, paypalOrderId }); publish({ uncertain: false });
      if (terminal(String(status))) { resolved = true; throw new Error("This payment is already resolved. Check its status above."); }
      return paypalOrderId;
    } catch (error) { if (scope.live(lease)) publish({ checkoutOpen: false, uncertain: !resolved && Boolean(state.intent), message: resolved ? "This payment is already resolved. Check its status above." : `${error instanceof Error ? error.message : "Checkout could not open."} Your checkout is saved for a safe retry.` }); throw error; }
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
  return { getState: () => state, subscribe(listener: (state: PayPalPaymentsState) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }, start, createOrder, capture, reconcile, completeReturn, beginWalletCheckout, cancelled, sdkError,
    reload: () => { polls = 0; stopPolling(); return state.actorId ? load() : start(); },
    dispose() { disposed = true; stopPolling(); scope.dispose(); listeners.clear(); state = initialPayPalPaymentsState(); }
  };
}
