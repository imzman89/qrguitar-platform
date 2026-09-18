export type IntakeSession = { access_token: string; user: { id: string } } | null;
export type IntakeAuth = {
  getSession(): Promise<{ data: { session: IntakeSession }; error?: unknown }>;
  onAuthStateChange(callback: (event: string, session: IntakeSession) => void): { data: { subscription: { unsubscribe(): void } } };
};
export type DeletionRequest = { requestId: string; status: "requested" | "cancelled"; requestedAt: string; cancelledAt: string | null };
export type IntakeFulfillment = { state: "blocked" | "quiescing_storage" | "ready_for_auth_deletion"; blockers: string[]; revision: string; reviewedAt: string; storageQuiesceUntil: string | null };
export type IntakeSnapshot = { revision: string; activeRequest: DeletionRequest | null; latestRequest: DeletionRequest | null; fulfillment: IntakeFulfillment | null };
export type IntakeIntent = { operationId: string; expectedRevision: string; action: "submit" | "cancel"; requestId: string };
export type IntakeConfirmation = { expectedRevision: string; action: "submit" | "cancel"; requestId: string };
export type IntakeState = {
  phase: "loading" | "ready" | "error" | "signed-out" | "account-changed";
  actorId: string; snapshot: IntakeSnapshot | null; intent: IntakeIntent | null;
  confirmation: IntakeConfirmation | null; busy: boolean; refreshing: boolean; recoveryBlocked: boolean; feedback: string; error: string;
};
export function initialIntakeState(): IntakeState {
  return { phase: "loading", actorId: "", snapshot: null, intent: null, confirmation: null, busy: false, refreshing: false, recoveryBlocked: false, feedback: "", error: "" };
}
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const uuid = (value: unknown) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value.toLowerCase() : "";
const intakeRevision = (value: unknown): value is string => typeof value === "string" && /^(0|[1-9][0-9]{0,18})$/.test(value) && (value.length < 19 || value <= "9223372036854775807");
const timestamp = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
function readRequest(value: unknown): DeletionRequest {
  const row = record(value), id = uuid(row.requestId);
  if (!id || !["requested", "cancelled"].includes(String(row.status)) || !timestamp(row.requestedAt)
    || (row.status === "requested" ? row.cancelledAt !== null : !timestamp(row.cancelledAt) || Date.parse(row.cancelledAt) < Date.parse(row.requestedAt))) throw new Error("The request status could not be verified. Refresh to try again.");
  return { requestId: id, status: row.status as DeletionRequest["status"], requestedAt: row.requestedAt, cancelledAt: row.cancelledAt as string | null };
}
const fulfillmentBlockers = new Set(["administrator_account", "unused_paid_credits", "unresolved_payment_order", "payment_hold_or_dispute", "billing_retention_review_required", "unused_profile_credits", "storage_cleanup_required", "storage_quiescence_required", "active_ownership_transfer", "active_ownership_claim", "active_service_workflow", "service_history_privacy_review_required", "profile_history_privacy_review_required", "retained_personal_content_review_required"]);
function readFulfillment(value: unknown): IntakeFulfillment | null {
  if (value === null) return null;
  const row = record(value), state = row.state;
  if (!["blocked", "quiescing_storage", "ready_for_auth_deletion"].includes(String(state)) || !Array.isArray(row.blockers)
    || row.blockers.some(code => typeof code !== "string" || !fulfillmentBlockers.has(code)) || new Set(row.blockers).size !== row.blockers.length
    || !intakeRevision(row.revision) || !timestamp(row.reviewedAt) || (row.storageQuiesceUntil !== null && !timestamp(row.storageQuiesceUntil))
    || (((state === "blocked" || state === "quiescing_storage") !== (row.blockers.length > 0))
      || (state === "blocked" && row.storageQuiesceUntil !== null) || (state !== "blocked" && row.storageQuiesceUntil === null))) {
    throw new Error("The request status could not be verified. Refresh to try again.");
  }
  return { state: state as IntakeFulfillment["state"], blockers: [...row.blockers], revision: row.revision,
    reviewedAt: row.reviewedAt, storageQuiesceUntil: row.storageQuiesceUntil as string | null };
}
function readSnapshot(value: unknown): IntakeSnapshot {
  const row = record(value);
  if (row.ok !== true || row.request !== null || !intakeRevision(row.revision)) throw new Error("The request status could not be verified. Refresh to try again.");
  const activeRequest = row.activeRequest === null ? null : readRequest(row.activeRequest);
  const latestRequest = row.latestRequest === null ? null : readRequest(row.latestRequest);
  const fulfillment = readFulfillment(row.fulfillment);
  if ((activeRequest && (activeRequest.status !== "requested" || latestRequest?.requestId !== activeRequest.requestId
    || latestRequest.status !== "requested" || latestRequest.requestedAt !== activeRequest.requestedAt))
    || (latestRequest?.status === "requested" && activeRequest?.requestId !== latestRequest.requestId)
    || (fulfillment !== null && !activeRequest)) throw new Error("The request status could not be verified. Refresh to try again.");
  return { revision: row.revision, activeRequest, latestRequest, fulfillment };
}
function readIntent(value: unknown): IntakeIntent | null {
  const row = record(value), operationId = uuid(row.operationId), requestId = uuid(row.requestId);
  if (!operationId || !intakeRevision(row.expectedRevision) || (row.action !== "submit" && row.action !== "cancel")
    || (row.action === "submit" ? row.requestId !== "" : !requestId)) return null;
  return { operationId, expectedRevision: row.expectedRevision, action: row.action, requestId };
}
function readReceipt(value: unknown, intent: IntakeIntent) {
  const body = record(value), receipt = record(body.receipt), request = readRequest(body.request);
  if (body.ok !== true || uuid(receipt.operationId) !== intent.operationId || receipt.expectedRevision !== intent.expectedRevision || receipt.action !== intent.action
    || uuid(receipt.requestId) !== request.requestId || !timestamp(receipt.recordedAt)
    || (intent.action === "cancel" && (request.requestId !== intent.requestId || request.status !== "cancelled"))) {
    throw new Error("The action receipt could not be verified. Retry the same saved action.");
  }
  return request;
}
const denialStatus: Record<string, number> = {
  invalid_request: 400, invalid_query: 400, invalid_body: 400, identity_required: 401,
  admin_required: 403, origin_not_allowed: 403, request_not_found: 404, operation_conflict: 409,
  method_not_allowed: 405, body_timeout: 408, body_too_large: 413, invalid_content_type: 415, invalid_encoding: 415
};
function definitiveDenial(payload: Record<string, unknown>, status: number, intent: IntakeIntent) {
  return payload.ok === false && payload.uncertain === false && payload.retryable === false
    && typeof payload.message === "string" && Boolean(payload.message.trim()) && payload.message.length <= 1200
    && typeof payload.code === "string" && Object.hasOwn(denialStatus, payload.code) && denialStatus[payload.code] === status
    && (!Object.hasOwn(payload, "operationId") || uuid(payload.operationId) === intent.operationId)
    && (payload.code !== "operation_conflict" || uuid(payload.operationId) === intent.operationId);
}
function definitiveRevisionConflict(payload: Record<string, unknown>, status: number, intent: IntakeIntent) {
  // The server checks this operation's immutable receipt under its actor lock
  // before checking revision. A matching 412 proves this original intent can
  // never commit, including a delayed attempt from another tab or device.
  return status === 412 && payload.ok === false && payload.code === "intake_state_changed"
    && payload.uncertain === false && payload.retryable === false
    && typeof payload.message === "string" && Boolean(payload.message.trim()) && payload.message.length <= 1200
    && uuid(payload.operationId) === intent.operationId && payload.expectedRevision === intent.expectedRevision;
}
class StaleIntake extends Error {}
class IntakeFailure extends Error { constructor(message: string, readonly uncertain: boolean, readonly settlesOriginal = false) { super(message); } }
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
// Minimal retry identity only. Memory also prevents a failed storage removal
// resurrecting an old operation during a component remount in this page session.
const memoryIntents = new Map<string, IntakeIntent | null>();

export function createDeletionIntakeClient(deps: {
  actorId: string; auth: () => IntakeAuth; fetch?: typeof fetch; storage?: () => StorageLike;
  randomUUID?: () => string; timeoutMs?: number;
}) {
  const expectedActor = uuid(deps.actorId), transport = deps.fetch || fetch;
  let state = initialIntakeState(), revision = 0, loadRevision = 0, disposed = false;
  let observedActor: string | undefined, auth: IntakeAuth | undefined, unsubscribe: (() => void) | undefined, lock: symbol | undefined;
  const listeners = new Set<(state: IntakeState) => void>(), pending = new Set<AbortController>();
  const publish = (patch: Partial<IntakeState>) => { if (!disposed) { state = { ...state, ...patch }; listeners.forEach(listener => listener(state)); } };
  const live = (lease: number) => !disposed && revision === lease && state.actorId === expectedActor && Boolean(expectedActor);
  const check = (lease: number) => { if (!live(lease)) throw new StaleIntake(); };
  const storage = () => deps.storage ? deps.storage() : window.sessionStorage;
  const storageKey = `qrguitar:deletion-intake:${expectedActor}`;
  function persist(intent: IntakeIntent | null) {
    try {
      const saved = intent ? JSON.stringify(intent) : null, target = storage();
      if (saved) target.setItem(storageKey, saved); else target.removeItem(storageKey);
      return target.getItem(storageKey) === saved;
    } catch { return false; }
  }
  function remember(intent: IntakeIntent | null) {
    memoryIntents.set(expectedActor, intent);
    const stored = persist(intent);
    publish({ intent, recoveryBlocked: !stored });
    return stored;
  }
  function restoreIntent() {
    if (memoryIntents.has(expectedActor)) {
      const intent = memoryIntents.get(expectedActor) || null;
      // Reconcile memory first if storage became available after a denied write/remove.
      return { intent, recoveryBlocked: !persist(intent) };
    }
    try {
      const raw = storage().getItem(storageKey), intent = raw === null ? null : readIntent(JSON.parse(raw));
      if (raw !== null && !intent) return { intent: null, recoveryBlocked: true };
      memoryIntents.set(expectedActor, intent);
      return { intent, recoveryBlocked: false };
    } catch { return { intent: null, recoveryBlocked: true }; }
  }
  function abortPending() { pending.forEach(controller => controller.abort()); pending.clear(); }
  async function bounded<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController(); pending.add(controller);
    let timer: ReturnType<typeof setTimeout> | undefined, onAbort = () => {};
    try {
      return await Promise.race([Promise.resolve().then(() => run(controller.signal)), new Promise<never>((_, reject) => {
        onAbort = () => reject(new Error("The request was interrupted."));
        controller.signal.addEventListener("abort", onAbort, { once: true });
        timer = setTimeout(() => { reject(new Error("The request timed out. Please retry.")); controller.abort(); }, deps.timeoutMs ?? 20_000);
      })]);
    } finally { if (timer) clearTimeout(timer); controller.signal.removeEventListener("abort", onAbort); pending.delete(controller); }
  }
  function observe(session: IntakeSession) {
    const actorId = session?.access_token ? uuid(session.user.id) : "";
    if (disposed || observedActor === actorId) return;
    observedActor = actorId; revision++; loadRevision++; abortPending(); lock = undefined;
    if (actorId && actorId === expectedActor) {
      publish({ ...initialIntakeState(), actorId, ...restoreIntent() });
      void Promise.resolve().then(() => load());
    } else publish({ ...initialIntakeState(), phase: actorId ? "account-changed" : "signed-out" });
  }
  async function freshSession(lease: number) {
    check(lease);
    if (!auth) throw new Error("Sign-in is unavailable. Refresh to try again.");
    const result = await bounded(() => auth!.getSession()); check(lease);
    if (result.error) throw new Error("Could not check your sign-in session. Refresh to try again.");
    if (!result.data.session?.access_token || uuid(result.data.session.user.id) !== expectedActor) { observe(result.data.session); throw new StaleIntake(); }
    return result.data.session;
  }
  async function request(lease: number, intent?: IntakeIntent) {
    const session = await freshSession(lease);
    const path = "/api/account/deletion-requests" + (intent?.action === "cancel" ? "/" + encodeURIComponent(intent.requestId) : "");
    const body = intent ? intent.action === "submit" ? { operationId: intent.operationId, expectedRevision: intent.expectedRevision, confirm: true } : { operationId: intent.operationId, expectedRevision: intent.expectedRevision, action: "cancel" } : undefined;
    let result: { response: Response; payload: Record<string, unknown> };
    try {
      result = await bounded(async signal => {
        const response = await transport(path, { method: intent ? intent.action === "submit" ? "POST" : "PATCH" : "GET", signal,
          cache: "no-store", credentials: "omit", redirect: "error",
          headers: { authorization: `Bearer ${session.access_token}`, ...(intent ? { "content-type": "application/json" } : {}) },
          ...(body ? { body: JSON.stringify(body) } : {}) });
        return { response, payload: record(await response.json()) };
      });
      check(lease); await freshSession(lease);
    } catch (error) { check(lease); throw new IntakeFailure(error instanceof Error ? error.message : "The response could not be confirmed.", Boolean(intent)); }
    const { response, payload } = result;
    if (!response.ok || payload.ok !== true) {
      const settled = Boolean(intent) && definitiveRevisionConflict(payload, response.status, intent!);
      throw new IntakeFailure(settled ? "Your request status changed before this action was accepted. Review the refreshed status and confirm a new action if needed." : typeof payload.message === "string" && payload.message.length <= 1200 ? payload.message : "Request information is unavailable. Refresh to try again.", Boolean(intent) && !settled && !definitiveDenial(payload, response.status, intent!), settled);
    }
    return payload;
  }
  async function load() {
    if (disposed || lock || state.actorId !== expectedActor || !expectedActor) return;
    const lease = revision, attempt = ++loadRevision;
    publish({ ...restoreIntent(), refreshing: true, confirmation: null, error: "" });
    try {
      const snapshot = readSnapshot(await request(lease)); check(lease); if (attempt !== loadRevision) return;
      // An empty status snapshot does not prove an earlier timed-out operation failed.
      publish({ phase: "ready", snapshot, refreshing: false });
    } catch (error) {
      if (live(lease) && attempt === loadRevision) publish({ phase: "error", snapshot: null, refreshing: false, error: error instanceof Error ? error.message : "Could not load request status. Refresh to try again." });
    }
  }
  async function start() {
    if (disposed) return;
    if (!expectedActor) { publish({ phase: "signed-out" }); return; }
    const started = revision;
    try {
      if (!auth) { auth = deps.auth(); const subscription = auth.onAuthStateChange((_event, session) => observe(session)); unsubscribe = () => subscription.data.subscription.unsubscribe(); }
      const result = await bounded(() => auth!.getSession());
      if (disposed || revision !== started) return;
      if (result.error) throw new Error("Could not check your sign-in session. Refresh to try again.");
      const actorId = result.data.session?.access_token ? uuid(result.data.session.user.id) : "";
      if (observedActor === actorId) { if (actorId === expectedActor) await load(); }
      else observe(result.data.session);
    } catch (error) { if (!disposed && revision === started) publish({ phase: "error", error: error instanceof Error ? error.message : "Sign-in is unavailable." }); }
  }
  function prepare(action: "submit" | "cancel") {
    if (disposed || lock || state.phase !== "ready" || state.refreshing || state.recoveryBlocked || state.intent || !state.snapshot || state.actorId !== expectedActor) return;
    const active = state.snapshot.activeRequest;
    if (action === "submit" ? Boolean(active) : !active || (state.snapshot.fulfillment !== null && state.snapshot.fulfillment.state !== "blocked")) return;
    publish({ confirmation: { expectedRevision: state.snapshot.revision, action, requestId: action === "cancel" ? active!.requestId : "" }, feedback: "", error: "" });
  }
  async function mutate(retry: boolean) {
    if (disposed || lock || state.refreshing || state.recoveryBlocked || state.actorId !== expectedActor || !expectedActor) return;
    const confirmation = state.confirmation;
    if (retry ? !state.intent : (state.intent || !confirmation || state.phase !== "ready" || !state.snapshot)) return;
    if (!retry && (confirmation!.expectedRevision !== state.snapshot!.revision || (confirmation!.action === "submit" ? Boolean(state.snapshot!.activeRequest) : state.snapshot!.activeRequest?.requestId !== confirmation!.requestId))) return;
    const lease = revision, operation = Symbol("privacy-intake"), unresolvedBefore = Boolean(state.intent); lock = operation; loadRevision++;
    publish({ busy: true, confirmation: null, error: "", feedback: "" });
    let refresh = false;
    try {
      await freshSession(lease);
      if (!state.intent) {
        const operationId = uuid(deps.randomUUID ? deps.randomUUID() : crypto.randomUUID());
        if (!operationId) throw new Error("A secure operation reference could not be created. Refresh to try again.");
        if (!remember({ operationId, expectedRevision: confirmation!.expectedRevision, action: confirmation!.action, requestId: confirmation!.requestId })) throw new Error("Your action reference could not be saved. Restore site storage access, then refresh status before retrying.");
      } else if (!remember(state.intent)) {
        throw new Error("Your saved action reference is unavailable. Restore site storage access, then refresh status before retrying.");
      }
      const intent = state.intent!, payload = await request(lease, intent), currentRequest = readReceipt(payload, intent); check(lease);
      remember(null);
      publish({ feedback: `${currentRequest.status === "cancelled" ? "Cancellation confirmed" : "Request recorded"} for request ${currentRequest.requestId}. Refreshing current status…` });
      refresh = true;
    } catch (error) {
      if (live(lease)) {
        // Other retry denials cannot settle an earlier unknown attempt. A
        // matching receipt or the locked revision fence can settle it.
        if (error instanceof IntakeFailure && !error.uncertain && (!unresolvedBefore || error.settlesOriginal)) { remember(null); refresh = true; }
        publish({ error: `${error instanceof Error ? error.message : "The action could not be confirmed."}${state.intent ? " Retry the same saved action to confirm its result." : ""}` });
      }
    } finally {
      if (lock === operation) {
        lock = undefined;
        if (live(lease)) {
          publish({ busy: false });
          if (refresh) { const error = state.error; await load(); if (live(lease)) publish({ feedback: state.feedback.replace(" Refreshing current status…", ""), ...(error ? { error } : {}) }); }
        }
      }
    }
  }
  return {
    getState: () => state,
    subscribe(listener: (state: IntakeState) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    start, reload: () => state.actorId === expectedActor && expectedActor ? load() : start(),
    prepareSubmit: () => prepare("submit"), prepareCancel: () => prepare("cancel"),
    dismissConfirmation: () => { if (!lock) publish({ confirmation: null }); },
    confirm: () => mutate(false), retry: () => mutate(true),
    dispose() { disposed = true; revision++; abortPending(); unsubscribe?.(); listeners.clear(); }
  };
}
