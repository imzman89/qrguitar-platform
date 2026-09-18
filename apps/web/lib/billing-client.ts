export type BillingSession = { access_token: string; user: { id: string } } | null;
export type BillingAuth = {
  getSession(): Promise<{ data: { session: BillingSession }; error?: unknown }>;
  onAuthStateChange(callback: (event: string, session: BillingSession) => void): { data: { subscription: { unsubscribe(): void } } };
};
export type BillingOffer = { key: string; version: 1; currency: "usd"; amount: number; credits: number; permanent: true; freeAllowance: 5 };
export type BillingIntent = { requestId: string; offerKey: string; orderId: string };
export type BillingOrder = { orderId: string; status: "reserved" | "open" | "fulfilled" | "expired"; offer: Pick<BillingOffer, "key" | "amount" | "currency" | "credits"> };
export type BillingSnapshot = {
  environment: "test" | "live"; freeLimit: 5; freeRemaining: number; paidGranted: number; paidConsumed: number;
  paidRemaining: number; paidAvailable: number; hold: boolean; commercialExempt: boolean; ownedProfiles: number;
  unresolvedOrder: (BillingIntent & { status: "reserved" | "open" }) | null; order: BillingOrder | null;
};
export type BillingState = {
  phase: "loading" | "ready" | "signed-out" | "error"; actorId: string; snapshot: BillingSnapshot | null;
  offers: BillingOffer[]; offersMessage: string; intent: BillingIntent | null; busy: boolean; refreshing: boolean;
  message: string; uncertain: boolean; polling: boolean;
};
export function initialBillingState(): BillingState {
  return { phase: "loading", actorId: "", snapshot: null, offers: [], offersMessage: "", intent: null, busy: false, refreshing: false, message: "", uncertain: false, polling: false };
}
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const tuples: Record<string, [number, number]> = { profile_1: [1200, 1], profile_10: [5000, 10], profile_25: [9900, 25] };
export const billingOrderId = (value: unknown) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : "";
export function billingCheckoutUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    // Reject explicit ports too: URL.port normalizes the default :443 away.
    if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com" || url.username || url.password || url.port
      || !/^https:\/\/checkout\.stripe\.com\//i.test(value)) return "";
    return url.href;
  } catch { return ""; }
}
function readOffer(value: unknown, full = true): BillingOffer {
  const row = record(value), tuple = typeof row.key === "string" && Object.hasOwn(tuples, row.key) ? tuples[row.key] : undefined;
  if (!tuple || row.currency !== "usd" || row.amount !== tuple[0] || row.credits !== tuple[1]
    || (full && (row.version !== 1 || row.permanent !== true || row.freeAllowance !== 5))) throw new Error("The available credit packs could not be verified. Refresh to try again.");
  return { key: row.key as string, currency: "usd", amount: tuple[0], credits: tuple[1], version: 1, permanent: true, freeAllowance: 5 };
}
function readIntent(value: unknown): BillingIntent | null {
  const row = record(value);
  return billingOrderId(row.requestId) && typeof row.offerKey === "string" && Object.hasOwn(tuples, row.offerKey)
    && (row.orderId === "" || billingOrderId(row.orderId)) ? { requestId: row.requestId as string, offerKey: row.offerKey, orderId: row.orderId as string } : null;
}
function readSnapshot(value: unknown, requestedOrder: string): BillingSnapshot {
  const row = record(value);
  if (!["test", "live"].includes(String(row.environment)) || row.freeLimit !== 5
    || ["freeRemaining", "paidGranted", "paidConsumed", "paidRemaining", "paidAvailable", "ownedProfiles"].some(key => !Number.isSafeInteger(row[key]) || Number(row[key]) < 0)
    || typeof row.hold !== "boolean" || typeof row.commercialExempt !== "boolean"
    || Number(row.freeRemaining) > 5 || row.paidRemaining !== Number(row.paidGranted) - Number(row.paidConsumed)
    || row.paidAvailable !== (row.hold ? 0 : row.paidRemaining)) throw new Error("Your credit balance could not be verified. Refresh before continuing.");
  let unresolvedOrder: BillingSnapshot["unresolvedOrder"] = null, order: BillingOrder | null = null;
  if (requestedOrder && row.order === null) throw new Error("The requested order could not be verified. Refresh to try again.");
  if (row.unresolvedOrder !== null) {
    const unresolved = record(row.unresolvedOrder), intent = readIntent(unresolved);
    if (!intent?.orderId || !["reserved", "open"].includes(String(unresolved.status))) throw new Error("Your pending checkout could not be verified.");
    unresolvedOrder = { ...intent, status: unresolved.status as "reserved" | "open" };
  }
  if (row.order !== null) {
    const item = record(row.order);
    if (!billingOrderId(item.orderId) || !["reserved", "open", "fulfilled", "expired"].includes(String(item.status))
      || (requestedOrder && item.orderId !== requestedOrder)) throw new Error("Your order could not be verified.");
    order = { orderId: item.orderId as string, status: item.status as BillingOrder["status"], offer: readOffer(item.offer, false) };
  }
  return { ...(row as BillingSnapshot), unresolvedOrder, order };
}
class StaleBilling extends Error {}
class BillingFailure extends Error { constructor(message: string, readonly orderId = "") { super(message); } }
type Lease = { actorId: string; revision: number };
type StoragePort = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** One account-scoped purchase intent survives uncertain responses. Only server reads confirm a grant. */
export function createBillingClient(deps: {
  auth: () => BillingAuth; fetch?: typeof fetch; storage?: () => StoragePort; randomUUID?: () => string;
  navigate?: (url: string) => void; orderId?: string; returnFlow?: boolean; timeoutMs?: number; pollMs?: number; maxPolls?: number;
}) {
  let state = initialBillingState(), revision = 0, loadRevision = 0, actorKnown = false, disposed = false;
  let auth: BillingAuth | undefined, unsubscribe: (() => void) | undefined, lock: symbol | undefined;
  let pollTimer: ReturnType<typeof setTimeout> | undefined, polls = 0;
  const queryOrder = billingOrderId(deps.orderId), transport = deps.fetch || fetch;
  const listeners = new Set<(state: BillingState) => void>(), pending = new Set<AbortController>();
  const memoryIntents = new Map<string, BillingIntent | null>();
  const publish = (patch: Partial<BillingState>) => { if (!disposed) { state = { ...state, ...patch }; listeners.forEach(listener => listener(state)); } };
  const live = (lease: Lease) => !disposed && revision === lease.revision && state.actorId === lease.actorId;
  const check = (lease: Lease) => { if (!live(lease)) throw new StaleBilling(); };
  const storageKey = () => `qrguitar:billing-intent:${state.actorId}`;
  const storage = () => deps.storage ? deps.storage() : window.sessionStorage;
  const persist = (intent: BillingIntent | null) => {
    memoryIntents.set(state.actorId, intent);
    try { if (intent) storage().setItem(storageKey(), JSON.stringify(intent)); else storage().removeItem(storageKey()); } catch { /* Server unresolvedOrder remains the recovery authority. */ }
  };
  const remember = (intent: BillingIntent | null) => { publish({ intent }); persist(intent); };
  const abortPending = () => { pending.forEach(controller => controller.abort()); pending.clear(); };
  function stopPolling() { if (pollTimer) clearTimeout(pollTimer); pollTimer = undefined; publish({ polling: false }); }
  async function bounded<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController(); pending.add(controller);
    let timer: ReturnType<typeof setTimeout> | undefined, abort = () => {};
    try {
      return await Promise.race([Promise.resolve().then(() => run(controller.signal)), new Promise<never>((_, reject) => {
        abort = () => reject(new Error("The request was interrupted. Refresh to try again."));
        controller.signal.addEventListener("abort", abort, { once: true });
        timer = setTimeout(() => { reject(new Error("The request timed out. Refresh to try again.")); controller.abort(); }, deps.timeoutMs ?? 20_000);
      })]);
    } finally { if (timer) clearTimeout(timer); controller.signal.removeEventListener("abort", abort); pending.delete(controller); }
  }
  function changeActor(session: BillingSession) {
    const actorId = session?.access_token ? session.user.id : "";
    if (disposed || (actorKnown && actorId === state.actorId)) return;
    actorKnown = true; revision++; loadRevision++; abortPending(); stopPolling(); lock = undefined; polls = 0;
    publish({ ...initialBillingState(), actorId, phase: actorId ? "loading" : "signed-out" });
    if (actorId) {
      if (memoryIntents.has(actorId)) publish({ intent: memoryIntents.get(actorId) || null });
      else try { publish({ intent: readIntent(JSON.parse(storage().getItem(storageKey()) || "null")) }); } catch { /* Storage is optional. */ }
      void Promise.resolve().then(() => load());
    }
  }
  async function freshSession(lease: Lease) {
    check(lease);
    const result = await bounded(() => auth!.getSession()); check(lease);
    if (result.error) throw new Error("Could not check your sign-in session. Refresh to try again.");
    const session = result.data.session;
    if (!session?.access_token || session.user.id !== lease.actorId) { changeActor(session); throw new StaleBilling(); }
    return session;
  }
  async function request(lease: Lease, path: string, body?: { offerKey: string; requestId: string }) {
    const session = await freshSession(lease);
    const { response, payload } = await bounded(async signal => {
      const response = await transport(path, { method: body ? "POST" : "GET", signal, cache: "no-store",
        headers: { authorization: `Bearer ${session.access_token}`, ...(body ? { "content-type": "application/json" } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}) });
      return { response, payload: record(await response.json()) };
    });
    check(lease); await freshSession(lease);
    if (!response.ok || payload.ok !== true) throw new BillingFailure(typeof payload.message === "string" ? payload.message : "Billing is unavailable. Please refresh to try again.", billingOrderId(payload.orderId));
    return payload;
  }
  function schedulePoll() {
    if (!deps.returnFlow || disposed || !state.actorId || state.phase !== "ready" || lock || polls >= (deps.maxPolls ?? 5)
      || ["fulfilled", "expired"].includes(state.snapshot?.order?.status || "")) { stopPolling(); return; }
    if (pollTimer) return;
    const lease = { actorId: state.actorId, revision };
    publish({ polling: true });
    pollTimer = setTimeout(() => { pollTimer = undefined; if (!live(lease)) return; polls++; void load(); }, deps.pollMs ?? 2500);
  }
  async function load() {
    if (disposed || lock || !state.actorId) return;
    const lease = { actorId: state.actorId, revision }, attempt = ++loadRevision;
    const intentOrderId = state.intent?.orderId || "", orderId = queryOrder || intentOrderId;
    publish({ refreshing: true, message: "" });
    try {
      const [balanceResult, offersResult, intentResult] = await Promise.allSettled([
        request(lease, `/api/billing/status${orderId ? `?orderId=${encodeURIComponent(orderId)}` : ""}`),
        request(lease, "/api/billing/offers"),
        intentOrderId && intentOrderId !== orderId ? request(lease, `/api/billing/status?orderId=${encodeURIComponent(intentOrderId)}`) : Promise.resolve(null)
      ]);
      check(lease); if (attempt !== loadRevision) return;
      if (balanceResult.status === "rejected") throw balanceResult.reason;
      const snapshot = readSnapshot(balanceResult.value, orderId);
      let offers: BillingOffer[] = [], offersMessage = "";
      try {
        if (offersResult.status === "rejected") throw offersResult.reason;
        if (!Array.isArray(offersResult.value.offers)) throw new Error("Credit packs are temporarily unavailable.");
        offers = offersResult.value.offers.map(value => readOffer(value));
        if (new Set(offers.map(offer => offer.key)).size !== offers.length) throw new Error("Credit packs could not be verified.");
      } catch (error) { offers = []; offersMessage = error instanceof Error ? error.message : "Credit packs are temporarily unavailable."; }
      let intentOrder = snapshot.order;
      if (intentOrderId && intentOrderId !== orderId && intentResult.status === "fulfilled" && intentResult.value) {
        try { intentOrder = readSnapshot(intentResult.value, intentOrderId).order; } catch { /* Keep the saved intent until its own order can be confirmed. */ }
      }
      if (snapshot.unresolvedOrder) remember({ requestId: snapshot.unresolvedOrder.requestId, offerKey: snapshot.unresolvedOrder.offerKey, orderId: snapshot.unresolvedOrder.orderId });
      else if (state.intent?.orderId && intentOrder?.orderId === state.intent.orderId && ["fulfilled", "expired"].includes(intentOrder.status)) remember(null);
      // A missing unresolved order cannot prove an interrupted POST failed. Keep its request UUID.
      publish({ phase: "ready", snapshot, offers, offersMessage, refreshing: false, uncertain: Boolean(state.intent && !snapshot.unresolvedOrder), message: "" });
      schedulePoll();
    } catch (error) {
      if (live(lease) && attempt === loadRevision) { stopPolling(); publish({ phase: "error", snapshot: null, offers: [], refreshing: false, message: error instanceof Error ? error.message : "Could not load billing. Refresh to try again." }); }
    }
  }
  async function start() {
    if (disposed) return;
    const started = revision;
    publish({ phase: "loading", message: "" });
    try {
      if (!auth) { auth = deps.auth(); const subscription = auth.onAuthStateChange((_event, session) => changeActor(session)); unsubscribe = () => subscription.data.subscription.unsubscribe(); }
      const result = await bounded(() => auth!.getSession());
      if (disposed || started !== revision) return;
      if (result.error) throw new Error("Could not check your sign-in session. Refresh to try again.");
      if (actorKnown && state.actorId === (result.data.session?.access_token ? result.data.session.user.id : "")) {
        if (state.actorId) await load(); else publish({ phase: "signed-out" });
      } else changeActor(result.data.session);
    } catch (error) { if (!disposed && started === revision) publish({ phase: "error", message: error instanceof Error ? error.message : "Sign-in is unavailable." }); }
  }
  async function checkout(offerKey?: string) {
    if (disposed || lock || state.phase !== "ready" || state.refreshing || !state.actorId || !state.snapshot || state.snapshot.hold || state.snapshot.commercialExempt) return;
    if (state.intent && offerKey && state.intent.offerKey !== offerKey) return;
    if (!state.intent && !state.offers.some(offer => offer.key === offerKey)) return;
    const lease = { actorId: state.actorId, revision }, operation = Symbol("checkout"); lock = operation; stopPolling(); loadRevision++;
    publish({ busy: true, message: "" });
    let refreshAfter = false;
    try {
      await freshSession(lease);
      if (!state.intent) {
        const requestId = deps.randomUUID ? deps.randomUUID() : crypto.randomUUID();
        if (!billingOrderId(requestId)) throw new Error("Could not prepare a secure checkout. Please refresh.");
        remember({ requestId, offerKey: offerKey!, orderId: "" });
      }
      const intent = state.intent!;
      const payload = await request(lease, "/api/billing/checkout", { offerKey: intent.offerKey, requestId: intent.requestId });
      const orderId = billingOrderId(payload.orderId);
      if (!orderId || (intent.orderId && orderId !== intent.orderId)) throw new Error("Could not verify this checkout. Refresh its status before continuing.");
      remember({ ...intent, orderId });
      if (payload.status === "checkout") {
        const url = billingCheckoutUrl(payload.url);
        if (!url) throw new Error("The checkout link could not be verified. Refresh and retry this checkout.");
        check(lease); publish({ uncertain: false, message: "Opening secure checkout…" });
        if (deps.navigate) deps.navigate(url); else window.location.assign(url);
      } else if (["processing", "processing_expiry", "fulfilled", "expired"].includes(String(payload.status))) {
        publish({ message: "Checking the latest order and credit balance…" }); refreshAfter = true;
      } else throw new Error("Could not confirm the checkout outcome. Refresh or retry this same checkout.");
    } catch (error) {
      if (live(lease)) {
        if (error instanceof BillingFailure && error.orderId && state.intent && (!state.intent.orderId || state.intent.orderId === error.orderId)) remember({ ...state.intent, orderId: error.orderId });
        publish({ uncertain: Boolean(state.intent), message: `${error instanceof Error ? error.message : "Could not confirm checkout."}${state.intent ? " Your checkout request is saved. Refresh its status or retry the same checkout." : ""}` });
      }
    } finally {
      if (lock === operation) { lock = undefined; if (live(lease)) { publish({ busy: false }); if (refreshAfter) await load(); } }
    }
  }
  return {
    getState: () => state,
    subscribe(listener: (state: BillingState) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    start, checkout,
    reload: () => { polls = 0; stopPolling(); return state.actorId ? load() : start(); },
    dispose() { disposed = true; revision++; abortPending(); stopPolling(); unsubscribe?.(); listeners.clear(); state = initialBillingState(); }
  };
}
