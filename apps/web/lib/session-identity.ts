type IdentitySession = { user?: { id?: string } } | null;

export type IdentityAuth = {
  getSession: () => Promise<{ data: { session: IdentitySession }; error?: unknown }>;
  onAuthStateChange: (callback: (event: string, session: IdentitySession) => void) => {
    data: { subscription: { unsubscribe: () => void } };
  };
};

/** Auth events outrank an initial read, including when that read later fails. */
export function observeSessionIdentity(auth: IdentityAuth, onIdentity: (actorId: string) => void) {
  let active = true;
  let revision = 0;
  const initialRevision = revision;
  const { data } = auth.onAuthStateChange((_event, session) => {
    if (!active) return;
    revision++;
    onIdentity(session?.user?.id || "");
  });
  const current = () => active && revision === initialRevision;
  try {
    void auth.getSession().then(
      ({ data: initial, error }) => { if (current()) onIdentity(error ? "" : initial.session?.user?.id || ""); },
      () => { if (current()) onIdentity(""); },
    );
  } catch {
    if (current()) onIdentity("");
  }
  return () => {
    active = false;
    revision++;
    data.subscription.unsubscribe();
  };
}
