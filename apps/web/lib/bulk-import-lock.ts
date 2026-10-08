/** One account's draft has one editor across all same-origin tabs, including autosave. */
export type BulkImportLease = {
  ownerId: string;
  ready: Promise<void>;
  isOwned: () => boolean;
  assertOwned: () => void;
  release: () => void;
};

export const bulkImportLockName = (ownerId: string) => `qrguitar.bulkImportDraft.lock.v1:${ownerId}`;

/** Native locks have no guessed expiration; closing a tab releases ownership automatically. */
export function acquireBulkImportLease(manager: Pick<LockManager, "request">, ownerId: string): BulkImportLease {
  if (!ownerId) throw new Error("Sign in before opening an import draft.");
  const abort = new AbortController();
  let owned = false;
  let released = false;
  let settled = false;
  let resolveReady!: () => void;
  let rejectReady!: (error: Error) => void;
  let resolveHold!: () => void;
  const hold = new Promise<void>((resolve) => { resolveHold = resolve; });
  const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  // A cancelled lease may be released by React cleanup before its caller attaches a handler.
  void ready.catch(() => undefined);
  const fail = (error: unknown) => {
    owned = false;
    if (!settled) { settled = true; rejectReady(error instanceof Error ? error : new Error("The import workspace could not be locked.")); }
  };
  try {
    void manager.request(bulkImportLockName(ownerId), { mode: "exclusive", signal: abort.signal }, async (lock) => {
      if (!lock || released) { fail(new Error("The import workspace lock was cancelled.")); return; }
      owned = true; settled = true; resolveReady();
      await hold;
      owned = false;
    }).catch(fail);
  } catch (error) { fail(error); }
  return {
    ownerId, ready,
    isOwned: () => owned && !released,
    assertOwned: () => {
      if (!owned || released) throw new Error("This import is controlled by another tab or account. Wait for this tab to reopen the saved draft.");
    },
    release: () => {
      if (released) return;
      released = true; owned = false;
      abort.abort(); resolveHold();
      if (!settled) fail(new Error("The import workspace lock was cancelled."));
    }
  };
}
