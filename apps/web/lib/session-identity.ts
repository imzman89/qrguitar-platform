type IdentitySession = { user?: { id?: string } } | null;

export type IdentityAuth = {
  getSession: () => Promise<{ data: { session: IdentitySession }; error?: unknown }>;
  onAuthStateChange: (callback: (event: string, session: IdentitySession) => void) => {
    data: { subscription: { unsubscribe: () => void } };
  };
};

/** Auth events outrank an initial read, including when that read later fails. */
export function observeSessionIdentity(auth: IdentityAuth, onIdentity: (actorId: string) => void, options: { onResolving?: () => void; onError?: () => void; timeoutMs?: number } = {}) {
  let active = true;
  let revision = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clearTimer = () => { if (timer) clearTimeout(timer); timer = undefined; };
  const { data } = auth.onAuthStateChange((_event, session) => {
    // INITIAL_SESSION(null) can mean a failed initial refresh, not logout.
    if (!active || (options.onError && _event === "INITIAL_SESSION")) return;
    revision++;
    clearTimer();
    onIdentity(session?.user?.id || "");
  });
  function read() {
    const readRevision = revision;
    const current = () => active && revision === readRevision;
    const failed = () => { if (!current()) return; revision++; clearTimer(); if (options.onError) options.onError(); else onIdentity(""); };
    options.onResolving?.();
    clearTimer();
    if (options.onError) timer = setTimeout(failed, options.timeoutMs ?? 10_000);
    try {
      void auth.getSession().then(
        ({ data: initial, error }) => { if (!current()) return; if (error) { failed(); return; } revision++; clearTimer(); onIdentity(initial.session?.user?.id || ""); },
        failed,
      );
    } catch { failed(); }
  }
  // A synchronous subscription event also outranks an initial read.
  if (revision === 0) read();
  const stop = () => {
    active = false;
    revision++;
    clearTimer();
    data.subscription.unsubscribe();
  };
  stop.refresh = () => { if (active) { revision++; read(); } };
  return stop;
}
