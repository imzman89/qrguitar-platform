export type QueueSession = { access_token: string; user: { id: string } } | null;
export type QueueAuth = {
  getSession(): Promise<{ data: { session: QueueSession }; error?: unknown }>;
  onAuthStateChange(callback: (event: string, session: QueueSession) => void): { data: { subscription: { unsubscribe(): void } } };
};
export type QueueRequest = { requestId: string; actorId: string; status: "requested"; requestedAt: string; cancelledAt: null };
export type QueueCursor = { requestedAt: string; requestId: string };
export type QueueState = {
  phase: "loading" | "ready" | "error" | "signed-out" | "forbidden";
  actorId: string; requests: QueueRequest[]; busy: boolean; hasMore: boolean; cursor: QueueCursor | null; error: string;
};
export const initialQueueState = (): QueueState => ({ phase: "loading", actorId: "", requests: [], busy: false, hasMore: false, cursor: null, error: "" });
const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
function readSession(value: unknown): QueueSession {
  if (value === null) return null;
  if (!object(value) || !object(value.user) || !uuid(value.user.id) || typeof value.access_token !== "string" || !value.access_token.trim()) throw new Error("Invalid session result");
  return { access_token: value.access_token, user: { id: value.user.id.toLowerCase() } };
}
function validTime(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) return false;
  const [year, month, day, hour, minute, second] = value.slice(0, 19).split(/[-T:]/).map(Number);
  return year >= 1000 && month >= 1 && month <= 12 && day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate() && hour < 24 && minute < 60 && second < 60;
}
function micros(value: string) { return BigInt(Date.parse(value.replace(/\.\d+/, ""))) * 1000n + BigInt((/\.(\d+)/.exec(value)?.[1] || "").padEnd(6, "0")); }
function older(row: QueueCursor, before: QueueCursor) {
  const left = micros(row.requestedAt), right = micros(before.requestedAt);
  return left < right || (left === right && row.requestId < before.requestId);
}
function page(value: unknown, limit: number, cursor: QueueCursor | null, existing: QueueRequest[]) {
  if (!object(value) || value.ok !== true || !Array.isArray(value.requests) || value.requests.length > limit) throw new Error("Invalid queue response");
  const seen = new Set(existing.map(row => row.requestId)); let before = cursor;
  return value.requests.map(value => {
    if (!object(value) || !uuid(value.requestId) || !uuid(value.actorId) || value.status !== "requested" || value.cancelledAt !== null || !validTime(value.requestedAt)) throw new Error("Invalid queue item");
    const row: QueueRequest = { requestId: value.requestId.toLowerCase(), actorId: value.actorId.toLowerCase(), status: "requested", requestedAt: value.requestedAt, cancelledAt: null };
    if (seen.has(row.requestId) || (before && !older(row, before))) throw new Error("Invalid queue cursor order");
    seen.add(row.requestId); before = row; return row;
  });
}
class Stale extends Error {}
class Denied extends Error { constructor(readonly status: 401 | 403) { super("Queue access denied"); } }

/** Read-only controller. The server verifies the bearer and administrator authority. */
export function createAdminIntakeClient(deps: { auth: () => QueueAuth; fetch?: typeof fetch; timeoutMs?: number; pageSize?: number }) {
  const transport = deps.fetch || fetch, limit = deps.pageSize ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Invalid queue page size");
  const timeout = Math.max(1, Math.min(deps.timeoutMs ?? 15000, 30000));
  let state = initialQueueState(), actor = "", observed = false, authRevision = 0, workRevision = 0, disposed = false, started = false;
  let auth: QueueAuth | undefined, unsubscribe: (() => void) | undefined;
  const listeners = new Set<(state: QueueState) => void>(), pending = new Set<AbortController>();
  function publish(patch: Partial<QueueState>) { if (!disposed) { state = { ...state, ...patch }; listeners.forEach(listener => listener(state)); } }
  function abort() { pending.forEach(controller => controller.abort()); pending.clear(); }
  const live = (authLease: number, workLease: number) => !disposed && authRevision === authLease && workRevision === workLease;
  function check(authLease: number, workLease: number) { if (!live(authLease, workLease)) throw new Stale(); }
  async function bounded<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController(); pending.add(controller);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stopped = new Promise<never>((_, reject) => {
      controller.signal.addEventListener("abort", () => reject(new Stale()), { once: true });
      timer = setTimeout(() => { reject(new Error("Queue check timed out")); controller.abort(); }, timeout);
    });
    try { return await Promise.race([Promise.resolve().then(() => run(controller.signal)), stopped]); }
    finally { if (timer) clearTimeout(timer); pending.delete(controller); }
  }
  function observe(session: QueueSession, schedule = true) {
    if (disposed) return;
    let parsed: QueueSession;
    try { parsed = readSession(session); } catch { authRevision++; workRevision++; abort(); publish({ ...initialQueueState(), phase: "error", error: "The admin session could not be verified. Refresh to try again." }); return; }
    const next = parsed?.user.id || "";
    if (observed && next === actor) return;
    observed = true; actor = next; authRevision++; workRevision++; abort();
    publish({ ...initialQueueState(), actorId: actor, phase: actor ? "loading" : "signed-out" });
    // Supabase auth callbacks must return before calling getSession again.
    if (actor && schedule) queueMicrotask(() => { if (!disposed && actor === next) void load(false); });
  }
  async function load(more: boolean) {
    if (disposed || !auth) return;
    if (more && (state.busy || !state.hasMore || !state.cursor || !actor)) return;
    const cursor = more ? state.cursor : null, existing = more ? state.requests : [];
    const authLease = authRevision, workLease = ++workRevision; abort();
    publish({ busy: true, error: "", ...(more ? {} : { phase: "loading", requests: [], hasMore: false, cursor: null }) });
    try {
      const result = await bounded(() => auth!.getSession()); check(authLease, workLease);
      if (!result || result.error || !result.data) throw new Error("Session check unavailable");
      const session = readSession(result.data.session);
      const current = session?.user.id || "";
      if (current !== actor || !observed) { observe(session); return; }
      if (!current || !session?.access_token) { publish({ ...initialQueueState(), phase: "signed-out" }); return; }
      const query = new URLSearchParams({ limit: String(limit) });
      if (cursor) { query.set("beforeRequestedAt", cursor.requestedAt); query.set("beforeId", cursor.requestId); }
      const payload = await bounded(async signal => {
        const response = await transport(`/api/admin/account-deletion-requests?${query}`, { method: "GET", cache: "no-store", credentials: "omit", redirect: "error", headers: { authorization: `Bearer ${session.access_token}` }, signal });
        if (response.status === 401 || response.status === 403) throw new Denied(response.status);
        if (!response.ok) throw new Error("Queue unavailable");
        return response.json();
      });
      check(authLease, workLease);
      // A storage/session change can precede its auth event. Recheck after the
      // entire response body before publishing this administrator's private data.
      const finalAuth = await bounded(() => auth!.getSession()); check(authLease, workLease);
      if (!finalAuth || finalAuth.error || !finalAuth.data) throw new Error("Session check unavailable");
      const finalSession = readSession(finalAuth.data.session);
      if ((finalSession?.user.id || "") !== actor) { observe(finalSession); return; }
      const rows = page(payload, limit, cursor, existing), last = rows.at(-1);
      publish({ phase: "ready", actorId: actor, requests: [...existing, ...rows], busy: false, error: "", hasMore: rows.length === limit, cursor: last ? { requestedAt: last.requestedAt, requestId: last.requestId } : cursor });
    } catch (error) {
      if (!live(authLease, workLease) || error instanceof Stale) return;
      if (error instanceof Denied) {
        publish({ ...initialQueueState(), actorId: actor, phase: error.status === 403 ? "forbidden" : "signed-out" });
      } else {
        // Retain neither unverified private rows nor a misleading empty success.
        publish({ phase: "error", busy: false, requests: [], hasMore: false, cursor: null,
          error: "The request queue could not be verified. Refresh to try again; this does not mean the queue is empty." });
      }
    }
  }
  async function start() {
    if (disposed || started) return; started = true;
    try {
      auth = deps.auth();
      const subscription = auth.onAuthStateChange((_event, session) => observe(session));
      unsubscribe = () => subscription.data.subscription.unsubscribe();
      // load handles a synchronous INITIAL_SESSION callback or a later event.
      await load(false);
    } catch {
      if (!disposed) { started = false; unsubscribe?.(); unsubscribe = undefined; auth = undefined; publish({ ...initialQueueState(), phase: "error", error: "The admin session could not be checked. Try again." }); }
    }
  }
  return {
    getState: () => state,
    subscribe(listener: (state: QueueState) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    start,
    refresh: () => auth ? load(false) : start(),
    loadMore: () => load(true),
    dispose() { if (disposed) return; disposed = true; authRevision++; workRevision++; abort(); unsubscribe?.(); listeners.clear(); }
  };
}
