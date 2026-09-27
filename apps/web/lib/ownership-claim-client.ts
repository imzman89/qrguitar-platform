export type ClaimSession = { access_token: string; user: { id: string } } | null;
export type ClaimAuth = { getSession(): Promise<{ data: { session: ClaimSession }; error?: unknown }>; onAuthStateChange(callback: (event: string, session: ClaimSession) => void): { data: { subscription: { unsubscribe(): void } } } };
export type ClaimLease = { actorId: string; revision: number; operation?: symbol };
export type ClaimSessionState = { phase: "loading" | "ready" | "signed-out" | "error"; actorId: string; revision: number; busy: boolean; error: string };
const CLAIM_LINK_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function verifiedClaimId(value: unknown) {
  return typeof value === "string" && CLAIM_LINK_ID_PATTERN.test(value) ? value.toLowerCase() : "";
}
export class StaleClaimRequest extends Error {}
export class ClaimRequestError extends Error { constructor(message: string, readonly uncertain = false, readonly claimId = "") { super(message); } }
export const MAX_CLAIM_EVIDENCE_BYTES = 3_000_000;
export const MAX_CLAIM_BODY_BYTES = 4_200_000;
export function claimReturnPath(params: Pick<URLSearchParams, "get">) {
  const next = new URLSearchParams();
  for (const key of ["code", "serial", "handoff"]) { const value = params.get(key); if (value) next.set(key, value.slice(0, 120)); }
  const claim = claimLinkId(params.get("claim"));
  if (claim) next.set("claim", claim);
  return `/ownership-claim${next.size ? `?${next.toString()}` : ""}`;
}
export function serializeClaimBody(body: unknown) {
  const value = JSON.stringify(body);
  if (new TextEncoder().encode(value).byteLength > MAX_CLAIM_BODY_BYTES) throw new ClaimRequestError("These files exceed the current secure upload limit. Use smaller files, with no more than 3 MB combined, and try again.");
  return value;
}
export function confirmedClaimMutation(kind: "claim" | "evidence" | "buyer", payload: Record<string, unknown>) {
  const claim = payload.claim as { id?: unknown; status?: unknown } | undefined;
  const transfer = payload.transfer as { id?: unknown; status?: unknown } | undefined;
  const valid = payload.ok === true && (kind === "claim" ? typeof claim?.id === "string" && Boolean(claim.id) && ["awaiting_owner", "admin_review"].includes(String(claim.status)) : kind === "evidence" ? ["awaiting_owner", "admin_review"].includes(String(payload.status)) : typeof transfer?.id === "string" && Boolean(transfer.id) && transfer.status === "accepted");
  if (!valid) throw new ClaimRequestError("The server did not confirm the outcome. Check your request status or collection before trying again.", true);
}
export function readClaimEvidence(file: File, timeoutMs = 20_000) {
  if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.type) || !file.size || file.size > MAX_CLAIM_EVIDENCE_BYTES) return Promise.reject(new Error("Use a PDF, JPG, PNG or WEBP file. Evidence must total 3 MB or less."));
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    const timer = setTimeout(() => { reader.abort(); reject(new Error("Reading the evidence timed out. Please choose the file again.")); }, timeoutMs);
    reader.onload = () => { clearTimeout(timer); resolve(String(reader.result || "")); };
    reader.onerror = () => { clearTimeout(timer); reject(new Error("Could not read that file.")); };
    reader.onabort = () => { clearTimeout(timer); reject(new Error("Reading the evidence was interrupted. Please choose the file again.")); };
    try { reader.readAsDataURL(file); } catch (error) { clearTimeout(timer); reject(error); }
  });
}
export function createClaimSessionGuard(deps: { auth: () => ClaimAuth; fetch?: typeof fetch; timeoutMs?: number }) {
  let state: ClaimSessionState = { phase: "loading", actorId: "", revision: 0, busy: false, error: "" };
  let auth: ClaimAuth | undefined;
  let unsubscribe: (() => void) | undefined;
  let known = false;
  let disposed = false;
  let lock: symbol | undefined;
  const pending = new Set<AbortController>();
  const listeners = new Set<(state: ClaimSessionState) => void>();
  const publish = (patch: Partial<ClaimSessionState>) => { if (!disposed) { state = { ...state, ...patch }; listeners.forEach(listener => listener(state)); } };
  const isCurrent = (lease: ClaimLease) => !disposed && state.phase === "ready" && state.actorId === lease.actorId && state.revision === lease.revision;
  const check = (lease: ClaimLease) => { if (!isCurrent(lease)) throw new StaleClaimRequest(); };
  const abort = () => { pending.forEach(controller => controller.abort()); pending.clear(); };
  async function bounded<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController(); pending.add(controller);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort = () => undefined as void;
    try {
      return await Promise.race([Promise.resolve().then(() => run(controller.signal)), new Promise<never>((_, reject) => {
        onAbort = () => reject(new Error("The request was interrupted."));
        controller.signal.addEventListener("abort", onAbort, { once: true });
        timer = setTimeout(() => { reject(new Error("The request timed out. Please retry.")); controller.abort(); }, deps.timeoutMs ?? 20_000);
      })]);
    } finally { if (timer) clearTimeout(timer); controller.signal.removeEventListener("abort", onAbort); pending.delete(controller); }
  }
  function change(session: ClaimSession) {
    if (disposed) return;
    const actorId = session?.access_token ? session.user.id : "";
    if (known && actorId === state.actorId) return;
    known = true; lock = undefined; abort();
    publish({ phase: actorId ? "ready" : "signed-out", actorId, revision: state.revision + 1, busy: false, error: "" });
  }
  async function start() {
    if (disposed) return;
    const revision = state.revision;
    publish({ phase: "loading", error: "" });
    try {
      if (!auth) { auth = deps.auth(); const result = auth.onAuthStateChange((event, session) => { if (event !== "INITIAL_SESSION") change(session); }); unsubscribe = () => result.data.subscription.unsubscribe(); }
      const result = await bounded(() => auth!.getSession());
      if (disposed || revision !== state.revision) return;
      if (result.error) throw new Error("Could not check your sign-in session. Please retry.");
      if (known && state.actorId === (result.data.session?.access_token ? result.data.session.user.id : "")) publish({ phase: state.actorId ? "ready" : "signed-out" }); else change(result.data.session);
    } catch (error) { if (!disposed && revision === state.revision) publish({ phase: "error", error: error instanceof Error ? error.message : "Sign-in is unavailable. Please retry." }); }
  }
  async function fresh(lease: ClaimLease) {
    check(lease);
    const result = await bounded(() => auth!.getSession());
    check(lease);
    if (result.error) throw new Error("Could not check your sign-in session. Please retry.");
    if (!result.data.session?.access_token || result.data.session.user.id !== lease.actorId) { change(result.data.session); throw new StaleClaimRequest(); }
    return result.data.session.access_token;
  }
  async function request(lease: ClaimLease, url: string, init: RequestInit = {}) {
    const token = await fresh(lease); check(lease);
    const mutation = Boolean(init.method && init.method !== "GET");
    try {
      const { response, payload } = await bounded(async signal => {
        const response = await (deps.fetch || fetch)(url, { ...init, signal, cache: "no-store", headers: { ...init.headers, Authorization: `Bearer ${token}` } });
        const value: unknown = await response.json();
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("The server returned an unreadable response.");
        return { response, payload: value as Record<string, unknown> };
      });
      check(lease); await fresh(lease); check(lease);
      if (!response.ok || payload.ok !== true) throw new ClaimRequestError(typeof payload.message === "string" ? payload.message : "The server did not confirm this request.", mutation && (response.status >= 500 || response.ok || payload.uncertain === true), verifiedClaimId(payload.claimId));
      return payload;
    } catch (error) {
      check(lease);
      if (error instanceof ClaimRequestError) throw error;
      throw new ClaimRequestError(error instanceof Error ? error.message : "The request could not be completed.", mutation);
    }
  }
  return {
    getState: () => state, start, request, isCurrent,
    subscribe(listener: (state: ClaimSessionState) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    lease(): ClaimLease | null { return !disposed && state.phase === "ready" ? { actorId: state.actorId, revision: state.revision } : null; },
    beginWrite(): ClaimLease | null { if (disposed || state.phase !== "ready" || lock) return null; lock = Symbol("claim-write"); publish({ busy: true }); return { actorId: state.actorId, revision: state.revision, operation: lock }; },
    finishWrite(lease: ClaimLease) { if (lock === lease.operation && isCurrent(lease)) { lock = undefined; publish({ busy: false }); } },
    dispose() { disposed = true; abort(); unsubscribe?.(); listeners.clear(); state = { phase: "loading", actorId: "", revision: state.revision + 1, busy: false, error: "" }; },
  };
}

export function claimLinkId(value: string | null) {
  return verifiedClaimId(value);
}
export function visibleClaimRequests<T extends { id: string }>(claims: T[], requestedId: string) {
  const selected = claims.find(claim => claim.id.toLowerCase() === requestedId);
  return selected ? [selected, ...claims.filter(claim => claim !== selected).slice(0, 5)] : claims.slice(0, 6);
}
