import type { BillingAuth, BillingSession } from "./billing-client";
import type { DirectMethod, DirectOffer, DirectOrder } from "./direct-payments";

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
export const directOrderId = (value: unknown): string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : "";
const packs: Record<string, [number, number]> = { profile_1: [1200, 1], profile_10: [5000, 10], profile_25: [9900, 25] };
const isMethod = (value: unknown): value is DirectMethod["key"] => ["venmo", "cashapp", "zelle", "paypal"].includes(String(value));
export function directPaymentUrl(method: string, value: unknown): string {
  if (typeof value !== "string" || value.length > 2048 || /[\\\s]/.test(value)) return "";
  try {
    const url = new URL(value), hosts = method === "cashapp" ? ["cash.app"] : method === "venmo" ? ["venmo.com", "www.venmo.com", "account.venmo.com"] : method === "paypal" ? ["www.paypal.com", "paypal.com", "www.sandbox.paypal.com", "sandbox.paypal.com"] : method === "zelle" ? ["zelle.com", "www.zelle.com", "zellepay.com", "www.zellepay.com", "enroll.zellepay.com"] : [];
    if (url.protocol !== "https:" || !hosts.includes(url.hostname) || url.username || url.password || url.port
      || !/^https:\/\/[a-z.]+\//i.test(value)) return "";
    if (method === "paypal" && !/^\/(?:ncp\/payment|pay|checkoutnow)\//.test(url.pathname) && !/^\/checkoutnow$/.test(url.pathname)) return "";
    return url.href;
  } catch { return ""; }
}
function readOffer(value: unknown): DirectOffer {
  const row = record(value), spec = typeof row.key === "string" && Object.hasOwn(packs, row.key) ? packs[row.key] : null;
  if (!spec || row.currency !== "usd" || row.amount !== spec[0] || row.credits !== spec[1] || row.version !== 1 || row.permanent !== true || row.freeAllowance !== 5) throw new Error("The Profile pack could not be verified. Refresh to try again.");
  return row as DirectOffer;
}
export function readDirectOrder(value: unknown, ownerId?: string, requestedOrder?: string): DirectOrder {
  const row = record(value), recipient = record(row.recipient), offer = readOffer(row.offer);
  if (!directOrderId(row.orderId) || !directOrderId(row.requestId) || !directOrderId(row.ownerId) || (ownerId && row.ownerId !== ownerId)
    || (requestedOrder && row.orderId !== requestedOrder) || row.offerKey !== offer.key || !isMethod(row.method)
    || !["awaiting_payment", "pending_review", "fulfilled", "closed"].includes(String(row.status))
    || typeof row.reference !== "string" || !row.reference.trim() || row.reference.length > 100
    || typeof row.createdAt !== "string" || !Number.isFinite(Date.parse(row.createdAt))
    || typeof recipient.accountKey !== "string" || !recipient.accountKey.trim() || typeof recipient.displayName !== "string" || !recipient.displayName.trim()
    || (recipient.address !== null && (typeof recipient.address !== "string" || !recipient.address.trim()))
    || (recipient.paymentUrl !== null && !directPaymentUrl(String(row.method), recipient.paymentUrl))
    || (row.payerReference !== null && typeof row.payerReference !== "string")) throw new Error("Payment instructions could not be verified. Refresh before sending money.");
  return { ...row, offer } as DirectOrder;
}
export type DirectSnapshot = {
  environment: "live" | "test"; freeLimit: 5; freeRemaining: number; paidGranted: number; paidConsumed: number;
  paidRemaining: number; paidAvailable: number; ownedProfiles: number; hold: boolean; commercialExempt: boolean;
  enabled: boolean; methods: DirectMethod[]; offers: DirectOffer[]; approvalMessage: string;
  directOrder: DirectOrder | null; pendingOrder: DirectOrder | null;
};
function readSnapshot(value: unknown, ownerId: string, requestedOrder: string): DirectSnapshot {
  const row = record(value);
  if (!["live", "test"].includes(String(row.environment)) || row.freeLimit !== 5
    || ["freeRemaining", "paidGranted", "paidConsumed", "paidRemaining", "paidAvailable", "ownedProfiles"].some(key => !Number.isSafeInteger(row[key]) || Number(row[key]) < 0)
    || Number(row.freeRemaining) > 5 || row.paidRemaining !== Number(row.paidGranted) - Number(row.paidConsumed)
    || typeof row.hold !== "boolean" || typeof row.commercialExempt !== "boolean" || row.paidAvailable !== (row.hold ? 0 : row.paidRemaining)
    || typeof row.enabled !== "boolean" || !Array.isArray(row.methods) || !Array.isArray(row.offers) || typeof row.approvalMessage !== "string") throw new Error("Your Profile balance could not be verified. Refresh to try again.");
  const methods = row.methods.map(value => { const method = record(value); if (!isMethod(method.key) || typeof method.label !== "string" || !method.label.trim()) throw new Error("Payment methods could not be verified."); return method as DirectMethod; });
  const offers = row.offers.map(readOffer);
  if (new Set(methods.map(method => method.key)).size !== methods.length || new Set(offers.map(offer => offer.key)).size !== offers.length) throw new Error("Payment options could not be verified.");
  const directOrder = row.directOrder === null ? null : readDirectOrder(row.directOrder, ownerId, requestedOrder);
  const pendingOrder = row.pendingOrder === null ? null : readDirectOrder(row.pendingOrder, ownerId);
  if ((requestedOrder && !directOrder) || (pendingOrder && !["awaiting_payment", "pending_review"].includes(pendingOrder.status))) throw new Error("Your saved payment could not be verified.");
  return { ...row, offers, methods, directOrder, pendingOrder } as DirectSnapshot;
}

type Lease = { actorId: string; revision: number };
type SessionDependencies = { auth: () => BillingAuth; fetch?: typeof fetch; timeoutMs?: number };
class StalePayment extends Error {}
export class PaymentRequestError extends Error { constructor(message: string, readonly status: number, readonly code = "") { super(message); } }
/** Authentication is checked before and after each bounded request; old-account responses never publish. */
export function createPaymentSessionScope(deps: SessionDependencies, onActor: (actorId: string) => void) {
  let actorId = "", revision = 0, known = false, disposed = false, auth: BillingAuth | undefined, unsubscribe: (() => void) | undefined;
  const pending = new Set<AbortController>();
  const live = (lease: Lease) => !disposed && lease.actorId === actorId && lease.revision === revision;
  const check = (lease: Lease) => { if (!live(lease)) throw new StalePayment(); };
  const bounded = async <T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    const controller = new AbortController(); pending.add(controller); let timer: ReturnType<typeof setTimeout> | undefined, abort = () => {};
    try { return await Promise.race([Promise.resolve().then(() => run(controller.signal)), new Promise<never>((_, reject) => {
      abort = () => reject(new Error("The request was interrupted. Refresh to try again.")); controller.signal.addEventListener("abort", abort, { once: true });
      timer = setTimeout(() => { reject(new Error("The request timed out. Refresh to check its status.")); controller.abort(); }, deps.timeoutMs ?? 20_000);
    })]); } finally { if (timer) clearTimeout(timer); controller.signal.removeEventListener("abort", abort); pending.delete(controller); }
  };
  function change(session: BillingSession) {
    const next = session?.access_token ? session.user.id : "";
    if (disposed || (known && next === actorId)) return;
    known = true; actorId = next; revision++; pending.forEach(controller => controller.abort()); pending.clear(); onActor(actorId);
  }
  async function session(lease: Lease) {
    check(lease); const result = await bounded(() => auth!.getSession()); check(lease);
    if (result.error) throw new Error("Sign-in could not be checked. Refresh to try again.");
    if (!result.data.session?.access_token || result.data.session.user.id !== lease.actorId) { change(result.data.session); throw new StalePayment(); }
    return result.data.session;
  }
  return {
    lease: () => ({ actorId, revision }), live,
    async start() {
      const started = revision;
      if (!auth) { auth = deps.auth(); const subscription = auth.onAuthStateChange((_event, value) => change(value)); unsubscribe = () => subscription.data.subscription.unsubscribe(); }
      const result = await bounded(() => auth!.getSession());
      if (disposed || revision !== started) return;
      if (result.error) throw new Error("Sign-in could not be checked. Refresh to try again.");
      if (known && actorId === (result.data.session?.access_token ? result.data.session.user.id : "")) onActor(actorId); else change(result.data.session);
    },
    async request(lease: Lease, url: string, body?: RecordValue) {
      const current = await session(lease);
      const result = await bounded(async signal => { const response = await (deps.fetch || fetch)(url, { method: body ? "POST" : "GET", cache: "no-store", signal,
        headers: { authorization: `Bearer ${current.access_token}`, ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
        return { response, payload: record(await response.json()) };
      });
      check(lease); await session(lease);
      if (!result.response.ok || result.payload.ok !== true) throw new PaymentRequestError(typeof result.payload.message === "string" ? result.payload.message : "Payment status is unavailable. Refresh to try again.", result.response.status, typeof result.payload.code === "string" ? result.payload.code : "");
      return result.payload;
    },
    dispose() { disposed = true; revision++; pending.forEach(controller => controller.abort()); pending.clear(); unsubscribe?.(); }
  };
}

type Intent = { requestId: string; offerKey: string; method: DirectMethod["key"]; orderId: string };
type Claim = { orderId: string; requestId: string; reference: string };
export type DirectPaymentsState = { phase: "loading" | "signed-out" | "ready" | "error"; actorId: string; snapshot: DirectSnapshot | null; intent: Intent | null; claim: Claim | null; busy: boolean; refreshing: boolean; message: string; uncertain: boolean };
export const initialDirectPaymentsState = (): DirectPaymentsState => ({ phase: "loading", actorId: "", snapshot: null, intent: null, claim: null, busy: false, refreshing: false, message: "", uncertain: false });
function readIntent(value: unknown): Intent | null { const row = record(value); return directOrderId(row.requestId) && typeof row.offerKey === "string" && Object.hasOwn(packs, row.offerKey) && isMethod(row.method) && (row.orderId === "" || directOrderId(row.orderId)) ? row as Intent : null; }
function readClaim(value: unknown): Claim | null { const row = record(value); return directOrderId(row.orderId) && directOrderId(row.requestId) && typeof row.reference === "string" && row.reference.length <= 200 ? row as Claim : null; }
export function createDirectPaymentsClient(deps: SessionDependencies & { storage?: () => Pick<Storage, "getItem" | "setItem" | "removeItem">; randomUUID?: () => string; orderId?: string }) {
  let state = initialDirectPaymentsState(), disposed = false, loadRevision = 0, lock: symbol | undefined;
  const listeners = new Set<(state: DirectPaymentsState) => void>(), memory = new Map<string, { intent: Intent | null; claim: Claim | null }>();
  const queryOrder = directOrderId(deps.orderId), publish = (patch: Partial<DirectPaymentsState>) => { if (!disposed) { state = { ...state, ...patch }; listeners.forEach(listener => listener(state)); } };
  const storage = () => deps.storage ? deps.storage() : window.sessionStorage;
  const key = () => `qrguitar:direct-payment:${state.actorId}`;
  function remember(intent: Intent | null, claim = state.claim) {
    publish({ intent, claim }); const value = { intent, claim }; memory.set(state.actorId, value);
    try { if (intent || claim) storage().setItem(key(), JSON.stringify(value)); else storage().removeItem(key()); } catch { /* The server also recovers the account's pending order. */ }
  }
  const scope = createPaymentSessionScope(deps, actorId => {
    loadRevision++; lock = undefined; publish({ ...initialDirectPaymentsState(), actorId, phase: actorId ? "loading" : "signed-out" });
    if (!actorId) return;
    const saved = memory.get(actorId); if (saved) publish(saved);
    else try { const saved = record(JSON.parse(storage().getItem(key()) || "null")); publish({ intent: readIntent(saved.intent), claim: readClaim(saved.claim) }); } catch { /* Storage is optional and contains no credentials. */ }
    void Promise.resolve().then(load);
  });
  const uuid = () => { const value = deps.randomUUID ? deps.randomUUID() : crypto.randomUUID(); if (!directOrderId(value)) throw new Error("Could not save a secure payment reference. Refresh to try again."); return value; };
  async function load() {
    if (disposed || lock || !state.actorId) return;
    const lease = scope.lease(), attempt = ++loadRevision, orderId = queryOrder || state.intent?.orderId || state.claim?.orderId || "";
    publish({ refreshing: true, message: "" });
    try {
      const result = await scope.request(lease, `/api/billing/direct/status${orderId ? `?orderId=${encodeURIComponent(orderId)}` : ""}`);
      if (!scope.live(lease) || attempt !== loadRevision) return;
      const snapshot = readSnapshot(result, lease.actorId, orderId), order = snapshot.directOrder;
      if (snapshot.pendingOrder) { const pending = snapshot.pendingOrder; remember({ orderId: pending.orderId, requestId: pending.requestId, offerKey: pending.offerKey, method: pending.method }, state.claim?.orderId === pending.orderId && pending.status === "awaiting_payment" ? state.claim : null); }
      else if (order && ["fulfilled", "closed"].includes(order.status) && state.intent?.orderId === order.orderId) remember(null, null);
      publish({ phase: "ready", snapshot, refreshing: false, uncertain: Boolean(state.intent && !snapshot.pendingOrder) || Boolean(state.claim), message: "" });
    } catch (error) { if (scope.live(lease) && attempt === loadRevision) publish({ phase: "error", snapshot: null, refreshing: false, message: error instanceof Error ? error.message : "Payment status could not be loaded." }); }
  }
  async function start() { const lease = scope.lease(); try { await scope.start(); } catch (error) { if (scope.live(lease)) publish({ phase: "error", message: error instanceof Error ? error.message : "Sign-in is unavailable." }); } }
  async function checkout(offerKey?: string, method?: DirectMethod["key"]) {
    const snapshot = state.snapshot;
    if (disposed || lock || state.refreshing || state.phase !== "ready" || !snapshot) return;
    if (state.intent && ((offerKey && offerKey !== state.intent.offerKey) || (method && method !== state.intent.method))) return;
    const selectedOffer = state.intent?.offerKey || offerKey, selectedMethod = state.intent?.method || method;
    if (!state.intent && (!snapshot.enabled || snapshot.hold || snapshot.commercialExempt || !snapshot.offers.some(offer => offer.key === selectedOffer) || !snapshot.methods.some(item => item.key === selectedMethod))) return;
    const lease = scope.lease(), operation = Symbol("checkout"); lock = operation; loadRevision++; publish({ busy: true, message: "" });
    let refresh = false;
    try {
      if (!state.intent) remember({ requestId: uuid(), offerKey: selectedOffer!, method: selectedMethod!, orderId: "" });
      const intent = state.intent!;
      const result = await scope.request(lease, "/api/billing/direct/checkout", { requestId: intent.requestId, offerKey: intent.offerKey, method: intent.method });
      const order = readDirectOrder(result.order, lease.actorId, intent.orderId);
      if (order.requestId !== intent.requestId || order.offerKey !== intent.offerKey || order.method !== intent.method) throw new Error("This payment did not match the saved request. Refresh its status.");
      remember({ ...intent, orderId: order.orderId });
      // A POST never increases the displayed balance or claims that credits were granted.
      publish({ uncertain: false }); refresh = true;
    } catch (error) { if (scope.live(lease)) publish({ uncertain: Boolean(state.intent), message: `${error instanceof Error ? error.message : "Payment could not be prepared."} Your request is saved. Refresh or retry the same request.` }); }
    finally { if (lock === operation) { lock = undefined; if (scope.live(lease)) { publish({ busy: false }); if (refresh) await load(); } } }
  }
  async function claim(reference: string) {
    const snapshot = state.snapshot, order = snapshot?.pendingOrder || snapshot?.directOrder;
    if (disposed || lock || state.refreshing || state.phase !== "ready" || !snapshot || !order || order.status !== "awaiting_payment" || reference.length > 200) return;
    if (!state.claim && /[\x00-\x1f\x7f]/.test(reference)) { publish({ message: "Use a single line of plain text for the optional payment reference." }); return; }
    const lease = scope.lease(), operation = Symbol("claim"); lock = operation; loadRevision++; publish({ busy: true, message: "" });
    let refresh = false;
    try {
      const existing = state.claim;
      if (existing && existing.orderId !== order.orderId) throw new Error("Refresh the earlier payment before submitting another.");
      const draft = existing || { orderId: order.orderId, requestId: uuid(), reference: reference.trim() };
      remember(state.intent, draft);
      const result = await scope.request(lease, "/api/billing/direct/claim", draft);
      readDirectOrder(result.order, lease.actorId, order.orderId); refresh = true;
    } catch (error) { if (scope.live(lease)) { const rejected = error instanceof PaymentRequestError && [400, 409].includes(error.status); if (rejected) remember(state.intent, null); publish({ uncertain: !rejected, message: `${error instanceof Error ? error.message : "Payment report could not be confirmed."} ${rejected ? "Refresh the status or correct your reference." : "Refresh or retry this report."} Do not send another payment.` }); } }
    finally { if (lock === operation) { lock = undefined; if (scope.live(lease)) { publish({ busy: false }); if (refresh) await load(); } } }
  }
  return { getState: () => state, subscribe(listener: (state: DirectPaymentsState) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }, start, checkout, claim,
    reload: () => state.actorId ? load() : start(),
    dispose() { disposed = true; scope.dispose(); listeners.clear(); state = initialDirectPaymentsState(); }
  };
}

export type AdminPaymentsState = { phase: "loading" | "signed-out" | "ready" | "error"; actorId: string; orders: DirectOrder[]; environment: string; hasMore: boolean; busy: boolean; refreshing: boolean; message: string; pendingDecision: RecordValue | null; filterOrderId: string };
export const initialAdminPaymentsState = (): AdminPaymentsState => ({ phase: "loading", actorId: "", orders: [], environment: "", hasMore: false, busy: false, refreshing: false, message: "", pendingDecision: null, filterOrderId: "" });
export function createAdminPaymentsClient(deps: SessionDependencies & { randomUUID?: () => string; storage?: () => Pick<Storage, "getItem" | "setItem" | "removeItem"> }) {
  let state = initialAdminPaymentsState(), disposed = false, attempt = 0, lock: symbol | undefined;
  const listeners = new Set<(state: AdminPaymentsState) => void>();
  const publish = (patch: Partial<AdminPaymentsState>) => { if (!disposed) { state = { ...state, ...patch }; listeners.forEach(listener => listener(state)); } };
  const memory = new Map<string, RecordValue | null>(), storage = () => deps.storage ? deps.storage() : window.sessionStorage, storageKey = () => `qrguitar:payment-review:${state.actorId}`;
  function saveDecision(value: RecordValue | null) {
    memory.set(state.actorId, value); publish({ pendingDecision: value });
    try { if (value) storage().setItem(storageKey(), JSON.stringify(value)); else storage().removeItem(storageKey()); } catch { /* Preserve the same operation in memory when storage is denied. */ }
  }
  const scope = createPaymentSessionScope(deps, actorId => {
    attempt++; lock = undefined; publish({ ...initialAdminPaymentsState(), actorId, phase: actorId ? "loading" : "signed-out" });
    if (!actorId) return;
    if (memory.has(actorId)) publish({ pendingDecision: memory.get(actorId) || null });
    else try { const saved = record(JSON.parse(storage().getItem(storageKey()) || "null")); if (directOrderId(saved.orderId) && directOrderId(saved.requestId) && ["verify", "close", "review"].includes(String(saved.action)) && typeof saved.reason === "string") publish({ pendingDecision: saved }); } catch { /* Invalid storage never grants authority. */ }
    void Promise.resolve().then(load);
  });
  async function load() {
    if (disposed || lock || !state.actorId) return;
    const lease = scope.lease(), current = ++attempt; publish({ refreshing: true, message: "" });
    try {
      const filterOrderId = state.filterOrderId;
      const result = await scope.request(lease, `/api/admin/payments${filterOrderId ? `?orderId=${encodeURIComponent(filterOrderId)}` : ""}`);
      if (!scope.live(lease) || current !== attempt) return;
      if (!Array.isArray(result.orders) || typeof result.hasMore !== "boolean" || !["test", "live"].includes(String(result.environment))) throw new Error("The payment queue could not be verified.");
      const orders = result.orders.map(value => readDirectOrder(value, undefined, filterOrderId));
      if (new Set(orders.map(order => order.orderId)).size !== orders.length) throw new Error("The payment queue could not be verified.");
      publish({ phase: "ready", orders, environment: String(result.environment), hasMore: result.hasMore, refreshing: false });
    } catch (error) { if (scope.live(lease) && current === attempt) publish({ phase: "error", orders: [], refreshing: false, message: error instanceof Error ? error.message : "The payment queue is unavailable." }); }
  }
  async function start() { const lease = scope.lease(); try { await scope.start(); } catch (error) { if (scope.live(lease)) publish({ phase: "error", message: error instanceof Error ? error.message : "Sign-in is unavailable." }); } }
  async function decide(body?: RecordValue) {
    if (disposed || lock || state.phase !== "ready" || state.refreshing || (body && state.pendingDecision) || (!state.pendingDecision && (!body || !state.orders.some(order => order.orderId === body.orderId)))) return false;
    const saved = state.pendingDecision;
    const requestId = saved?.requestId || directOrderId(deps.randomUUID ? deps.randomUUID() : crypto.randomUUID()); if (!requestId) return false;
    const operationBody = saved || { ...body, requestId };
    const lease = scope.lease(), operation = Symbol("admin-payment"); lock = operation; attempt++; publish({ busy: true, message: "" });
    let success = false;
    try { saveDecision(operationBody); const result = await scope.request(lease, "/api/admin/payments", operationBody); readDirectOrder(result.order, undefined, String(operationBody.orderId)); saveDecision(null); success = true; }
    catch (error) { if (scope.live(lease)) { const rejected = error instanceof PaymentRequestError && [400, 409].includes(error.status); if (rejected) saveDecision(null); publish({ message: `${error instanceof Error ? error.message : "The decision could not be confirmed."} ${rejected ? "Refresh the queue and correct the details before trying again." : "Refresh the queue before retrying."}` }); } }
    finally { if (lock === operation) { lock = undefined; if (scope.live(lease)) { publish({ busy: false }); if (success) await load(); } } }
    return success;
  }
  return { getState: () => state, subscribe(listener: (state: AdminPaymentsState) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }, start, decide, retryDecision: () => decide(),
    search(value: string) { if (disposed || lock || !state.actorId) return; const cleaned = value.trim().replace(/^QRG-/i, ""), filterOrderId = directOrderId(cleaned); if (cleaned && !filterOrderId) { publish({ message: "Enter the full QRG order reference or order UUID." }); return; } publish({ filterOrderId, orders: [], message: "" }); return load(); },
    reload: () => state.actorId ? load() : start(), dispose() { disposed = true; scope.dispose(); listeners.clear(); state = initialAdminPaymentsState(); }
  };
}
