import { cleanPublicCollection, defaultPublicCollectionSettings, type PublicCollectionSettings } from "./public-collections";

export type AccountSession = { access_token: string; user: { id: string; email?: string } } | null;
export type AccountAuth = {
  getSession(): Promise<{ data: { session: AccountSession }; error?: unknown }>;
  onAuthStateChange(callback: (event: string, session: AccountSession) => void): { data: { subscription: { unsubscribe(): void } } };
  resetPasswordForEmail(email: string, options: { redirectTo: string }): Promise<{ error?: unknown }>;
  signOut(): Promise<{ error?: unknown }>;
};
export type AccountSnapshot = {
  email: string; displayName: string; role: string; plan: string; accountStatus: string; settingsVersion: number;
  publicCollection: PublicCollectionSettings;
  stats: { records: number; publicRecords: number; privateRecords: number; unlistedRecords: number };
};
export type AccountDraft = { displayName: string; publicCollection: PublicCollectionSettings };
export type AccountSettingsState = {
  phase: "loading" | "ready" | "signed-out" | "error"; actorId: string;
  account: AccountSnapshot | null; draft: AccountDraft; busy: "" | "save" | "reset" | "signout";
  message: string; uncertainSave: boolean;
};
export function initialAccountSettings(): AccountSettingsState {
  return { phase: "loading", actorId: "", account: null, draft: { displayName: "", publicCollection: { ...defaultPublicCollectionSettings } }, busy: "", message: "", uncertainSave: false };
}
export function accountReturnPath(section: string) {
  return ["profile", "collection", "security", "notifications", "provider", "privacy"].includes(section) ? `/account?section=${section}` : "/account";
}
export function savedCollectionHref(account: AccountSnapshot | null) {
  const settings = account?.publicCollection;
  return settings?.enabled && settings.handle ? `/collections/${encodeURIComponent(settings.handle)}` : "";
}
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
function readCollection(value: unknown) {
  const row = object(value);
  if (["enabled", "allowIndexing", "allowMessages"].some((key) => typeof row[key] !== "boolean")
    || ["handle", "publicName", "accountType", "bio", "location", "websiteUrl", "avatarUrl"].some((key) => typeof row[key] !== "string")) throw new Error("Could not confirm the saved collection settings.");
  return cleanPublicCollection(row);
}
function readAccount(value: unknown, email: string): AccountSnapshot {
  const row = object(value), stats = object(row.stats);
  if (["email", "displayName", "role", "plan", "accountStatus"].some((key) => typeof row[key] !== "string") || String(row.email).toLowerCase() !== email.toLowerCase()
    || !Number.isSafeInteger(row.settingsVersion) || Number(row.settingsVersion) < 0
    || ["records", "publicRecords", "privateRecords", "unlistedRecords"].some((key) => !Number.isSafeInteger(stats[key]) || Number(stats[key]) < 0)) throw new Error("Could not confirm account details. Please reload your account.");
  return { ...(row as AccountSnapshot), publicCollection: readCollection(row.publicCollection), stats: stats as AccountSnapshot["stats"] };
}
class StaleAccount extends Error {}
class AccountFailure extends Error { constructor(message: string, readonly uncertain = false) { super(message); } }
type Lease = { actorId: string; revision: number };

/** Owns the account screen's authenticated reads and actions; server authorization is unchanged. */
export function createAccountSettings(deps: { auth: () => AccountAuth; fetch?: typeof fetch; timeoutMs?: number; onSaved?: () => void; onSignedOut?: () => void }) {
  let state = initialAccountSettings(), revision = 0, loadingRevision = 0;
  let disposed = false, actorKnown = false;
  let auth: AccountAuth | undefined, unsubscribe: (() => void) | undefined, lock: symbol | undefined;
  const listeners = new Set<(value: AccountSettingsState) => void>();
  const pending = new Set<AbortController>();
  const transport = deps.fetch || fetch;
  const publish = (patch: Partial<AccountSettingsState>) => { if (!disposed) { state = { ...state, ...patch }; listeners.forEach((listener) => listener(state)); } };
  const live = (lease: Lease) => !disposed && lease.revision === revision && lease.actorId === state.actorId;
  const check = (lease: Lease) => { if (!live(lease)) throw new StaleAccount(); };
  const abortPending = () => { pending.forEach((controller) => controller.abort()); pending.clear(); };
  async function bounded<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController(); pending.add(controller);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abort: () => void = () => undefined;
    try {
      return await Promise.race([Promise.resolve().then(() => run(controller.signal)), new Promise<never>((_, reject) => {
        abort = () => reject(new Error("The request was interrupted. Please retry."));
        controller.signal.addEventListener("abort", abort, { once: true });
        timer = setTimeout(() => { reject(new Error("The request timed out. Please retry.")); controller.abort(); }, deps.timeoutMs ?? 20_000);
      })]);
    } finally { if (timer) clearTimeout(timer); controller.signal.removeEventListener("abort", abort); pending.delete(controller); }
  }
  function changeActor(session: AccountSession) {
    if (disposed) return;
    const actorId = session?.access_token ? session.user.id : "";
    if (actorKnown && actorId === state.actorId) return;
    const wasSignedIn = Boolean(state.actorId);
    actorKnown = true; revision++; loadingRevision++; abortPending(); lock = undefined;
    publish({ ...initialAccountSettings(), actorId, phase: actorId ? "loading" : "signed-out" });
    if (actorId) void Promise.resolve().then(() => load());
    else if (wasSignedIn) {
      const signedOutRevision = revision;
      void Promise.resolve().then(() => { if (!disposed && revision === signedOutRevision && !state.actorId) { try { deps.onSignedOut?.(); } catch { /* Session has already cleared. */ } } });
    }
  }
  async function freshSession(lease: Lease) {
    check(lease);
    if (!auth) throw new Error("Sign-in is unavailable. Please retry.");
    const result = await bounded(() => auth!.getSession()); check(lease);
    if (result.error) throw new Error("Could not check your sign-in session. Please retry.");
    const session = result.data.session;
    if (!session?.access_token || session.user.id !== lease.actorId) { changeActor(session); throw new StaleAccount(); }
    return session;
  }
  async function request(lease: Lease, body?: AccountDraft & { expectedVersion: number }) {
    const session = await freshSession(lease);
    let response: Response, payload: Record<string, unknown>;
    try {
      ({ response, payload } = await bounded(async (signal) => {
        const response = await transport("/api/account", { method: body ? "PATCH" : "GET", cache: "no-store", signal,
          headers: { authorization: `Bearer ${session.access_token}`, ...(body ? { "content-type": "application/json" } : {}) },
          ...(body ? { body: JSON.stringify(body) } : {}) });
        return { response, payload: object(await response.json()) };
      }));
      check(lease); await freshSession(lease);
    } catch (error) {
      check(lease);
      throw new AccountFailure(body ? "Could not confirm the save. Reload your account before trying again." : "Could not load your account. Check your connection and try again.", Boolean(body));
    }
    if (!response.ok || payload.ok !== true) throw new AccountFailure(typeof payload.message === "string" ? payload.message : "Could not confirm account details. Please try again.", Boolean(body) && (response.status >= 500 || response.ok || payload.commitStatus === "unknown" || payload.reloadRequired === true));
    return { payload, email: session.user.email || "" };
  }
  async function load() {
    if (disposed || lock || !state.actorId) return;
    const lease = { actorId: state.actorId, revision }, attempt = ++loadingRevision;
    publish({ phase: "loading", message: "" });
    try {
      const { payload, email } = await request(lease);
      const account = readAccount(payload.account, email);
      check(lease); if (attempt !== loadingRevision) return;
      publish({ phase: "ready", account, draft: { displayName: account.displayName, publicCollection: { ...account.publicCollection } }, uncertainSave: false });
    } catch (error) {
      if (live(lease) && attempt === loadingRevision) publish({ phase: "error", message: error instanceof Error ? error.message : "Could not load account. Please try again." });
    }
  }
  async function start() {
    if (disposed) return;
    publish({ phase: "loading", message: "" });
    const started = revision;
    try {
      if (!auth) { auth = deps.auth(); const subscription = auth.onAuthStateChange((_event, session) => changeActor(session)); unsubscribe = () => subscription.data.subscription.unsubscribe(); }
      const result = await bounded(() => auth!.getSession());
      if (disposed || revision !== started) return;
      if (result.error) throw new Error("Could not check your sign-in session. Please retry.");
      if (actorKnown && state.actorId === (result.data.session?.access_token ? result.data.session.user.id : "")) {
        if (state.actorId) await load(); else publish({ phase: "signed-out" });
      } else changeActor(result.data.session);
    } catch (error) { if (!disposed && revision === started) publish({ phase: "error", message: error instanceof Error ? error.message : "Sign-in is unavailable. Please retry." }); }
  }
  async function action(label: AccountSettingsState["busy"], run: (lease: Lease) => Promise<void>) {
    if (disposed || lock || state.phase !== "ready" || !state.account || (label === "save" && state.uncertainSave)) return;
    const operation = Symbol(label), lease = { actorId: state.actorId, revision }; lock = operation;
    publish({ busy: label, message: "" });
    try { await run(lease); }
    catch (error) { if (live(lease)) publish({ message: error instanceof Error ? error.message : "Could not complete this request. Please retry.", ...(label === "save" ? { uncertainSave: error instanceof AccountFailure && error.uncertain } : {}) }); }
    finally { if (lock === operation) { lock = undefined; if (live(lease)) publish({ busy: "" }); } }
  }
  async function save() {
    return action("save", async (lease) => {
      const draft = { ...state.draft, publicCollection: { ...state.draft.publicCollection }, expectedVersion: state.account!.settingsVersion };
      const { payload, email } = await request(lease, draft);
      let account: AccountSnapshot;
      try {
        const saved = object(payload.account);
        if (payload.committed !== true || typeof saved.displayName !== "string" || saved.email !== email || !Number.isSafeInteger(saved.settingsVersion) || saved.settingsVersion !== draft.expectedVersion + 1) throw new Error();
        account = { ...state.account!, email, displayName: saved.displayName, publicCollection: readCollection(saved.publicCollection), settingsVersion: saved.settingsVersion as number };
      } catch { throw new AccountFailure("Could not confirm the saved settings. Reload your account before trying again.", true); }
      publish({ account, draft: { displayName: account.displayName, publicCollection: { ...account.publicCollection } }, message: typeof payload.message === "string" ? payload.message : "Account updated.", uncertainSave: false });
      try { deps.onSaved?.(); } catch { /* The committed save remains authoritative. */ }
    });
  }
  async function resetPassword(redirectTo: string) {
    return action("reset", async (lease) => {
      const session = await freshSession(lease);
      if (!session.user.email) throw new Error("Account email is missing.");
      try {
        const result = await bounded(() => auth!.resetPasswordForEmail(session.user.email!, { redirectTo }));
        check(lease);
        if (result.error) throw new Error("Could not send the password reset email. Please try again.");
        await freshSession(lease); publish({ message: "Password reset email sent." });
      } catch (error) { check(lease); throw new Error("Could not confirm the password reset email. Check your inbox before trying again."); }
    });
  }
  async function signOut() {
    return action("signout", async (lease) => {
      await freshSession(lease);
      let result: { error?: unknown };
      try { result = await bounded(() => auth!.signOut()); }
      catch { if (!state.actorId && revision === lease.revision + 1) return; check(lease); throw new Error("Could not sign out. Please try again."); }
      if (!live(lease)) return;
      if (result.error) throw new Error("Could not sign out. Please try again.");
      changeActor(null);
    });
  }
  return {
    getState: () => state,
    subscribe(listener: (value: AccountSettingsState) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    start, reload: () => state.actorId ? load() : start(), save, resetPassword, signOut,
    setDraft(patch: Partial<AccountDraft>) { if (!lock && state.phase === "ready" && !state.uncertainSave) publish({ draft: { ...state.draft, ...patch } }); },
    dispose() { disposed = true; revision++; abortPending(); unsubscribe?.(); listeners.clear(); state = initialAccountSettings(); }
  };
}
