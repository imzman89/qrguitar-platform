type Session = { access_token: string; user: { id: string } } | null;
type Auth = { getSession(): Promise<{ data: { session: Session }; error?: unknown }>; onAuthStateChange(fn: (event: string, session: Session) => void): { data: { subscription: { unsubscribe(): void } } } };
export type MessageLease = { actorId: string; revision: number; scope: symbol };
export class MessageRequestError extends Error {
  constructor(message: string, readonly status = 0, readonly uncertain = false) { super(message); }
}
export function createMessageSession(auth: () => Auth) {
  const identity = Symbol("message-session");
  let actorId = "", revision = 0, disposed = false, observed = false;
  let client: Auth | undefined, unsubscribe = () => {};
  const pending = new Set<AbortController>();
  const listeners = new Set<(actor: string, phase: "ready" | "signed-out" | "error") => void>();
  const lease = (): MessageLease => ({ actorId, revision, scope: identity });
  const live = (value: MessageLease) => !disposed && value.scope === identity && value.revision === revision && value.actorId === actorId;
  function sync(session: Session) {
    const next = session?.user.id || "";
    if (disposed) return;
    if (next !== actorId || !observed) {
      observed = true; actorId = next; revision++;
      pending.forEach(controller => controller.abort());
    }
    listeners.forEach(fn => fn(actorId, actorId ? "ready" : "signed-out"));
  }
  async function bounded<T>(value: MessageLease, run: (signal: AbortSignal) => Promise<T>, uncertain = false, milliseconds = 15000): Promise<T> {
    if (!live(value)) throw new MessageRequestError("Your sign-in changed. Reopen Messages with your current account.");
    const controller = new AbortController(); pending.add(controller);
    let timer: ReturnType<typeof setTimeout> | undefined, abort = () => {};
    try {
      const result = await Promise.race([Promise.resolve().then(() => { if (!live(value) || controller.signal.aborted) throw new Error("Interrupted"); return run(controller.signal); }), new Promise<never>((_, reject) => {
        abort = () => reject(new MessageRequestError("The result could not be confirmed. Check your connection and try again.", 0, uncertain));
        controller.signal.addEventListener("abort", abort, { once: true });
        timer = setTimeout(() => controller.abort(), milliseconds);
      })]);
      if (!live(value) || controller.signal.aborted) throw new MessageRequestError("Your sign-in changed. Reopen Messages with your current account.");
      return result;
    } finally { if (timer !== undefined) clearTimeout(timer); controller.signal.removeEventListener("abort", abort); pending.delete(controller); }
  }
  async function sessionFor(value: MessageLease) {
    const { data, error } = await client!.getSession();
    if (!live(value)) throw new MessageRequestError("Your sign-in changed. Reopen Messages with your current account.");
    if (error) throw new MessageRequestError("Your sign-in could not be checked. Try again.");
    if ((data.session?.user.id || "") !== value.actorId) { sync(data.session); throw new MessageRequestError("Your sign-in changed. Reopen Messages with your current account."); }
    if (!data.session?.access_token) throw new MessageRequestError("Sign in to use QRguitar Messages.", 401);
    return data.session;
  }
  async function request<T>(value: MessageLease, url: string, init: RequestInit = {}) {
    const mutation = Boolean(init.method && init.method !== "GET");
    return bounded(value, async signal => {
      const session = await sessionFor(value);
      if (!live(value) || signal.aborted) throw new MessageRequestError("Message request interrupted.");
      let response: Response, payload: (T & { ok?: boolean; message?: string }) | null;
      try {
        response = await fetch(url, { ...init, cache: "no-store", signal, headers: { Authorization: `Bearer ${session.access_token}`, ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers } });
        payload = await response.json().catch(() => null);
      } catch { throw new MessageRequestError("The result could not be confirmed. Check your connection and try again.", 0, mutation); }
      try { await sessionFor(value); }
      catch (reason) { throw new MessageRequestError(reason instanceof Error ? reason.message : "Your sign-in could not be checked.", 0, mutation); }
      if (!response.ok || payload?.ok !== true) throw new MessageRequestError(payload?.message || "Messages could not complete that action.", response.status, mutation && (response.status >= 500 || response.status === 408 || response.ok));
      return payload;
    }, mutation);
  }
  async function upload<T>(value: MessageLease, run: () => Promise<T>) {
    return bounded(value, async signal => {
      await sessionFor(value);
      if (!live(value) || signal.aborted) throw new MessageRequestError("Message upload interrupted.");
      const result = await run();
      if (!live(value) || signal.aborted) throw new MessageRequestError("Message upload interrupted.");
      try { await sessionFor(value); }
      catch (reason) { throw new MessageRequestError(reason instanceof Error ? reason.message : "Your sign-in could not be checked.", 0, true); }
      return result;
    }, true, 30000);
  }
  async function start() {
    if (disposed) return;
    const value = lease();
    try {
      if (!client) {
        client = auth();
        const subscription = client.onAuthStateChange((event, session) => { if (event !== "INITIAL_SESSION") sync(session); });
        unsubscribe = () => subscription.data.subscription.unsubscribe();
      }
      const result = await bounded(value, () => client!.getSession());
      if (result.error) throw result.error;
      sync(result.data.session);
    } catch { if (live(value)) listeners.forEach(fn => fn(actorId, "error")); }
  }
  return { lease, live, bounded, request, upload, start, subscribe(fn: (actor: string, phase: "ready" | "signed-out" | "error") => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    dispose() { disposed = true; revision++; pending.forEach(controller => controller.abort()); unsubscribe(); listeners.clear(); } };
}
