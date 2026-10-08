export type BusySource = {
  getState(): { busy: boolean };
  subscribe(listener: () => void): () => void;
};
export function waitForDraftIdle(
  source: BusySource,
  signal?: AbortSignal,
  timeoutMs = 30000,
): Promise<void> {
  if (signal?.aborted)
    return Promise.reject(new Error("This screen is no longer active."));
  if (!source.getState().busy) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let settled = false;
    let unsubscribe = () => {};
    let timer: ReturnType<typeof setTimeout>;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      signal?.removeEventListener("abort", cancel);
      if (error) reject(error);
      else resolve();
    };
    const cancel = () => finish(new Error("This screen is no longer active."));
    timer = setTimeout(
      () =>
        finish(
          new Error(
            "Your draft is still being saved. Please try again in a moment.",
          ),
        ),
      timeoutMs,
    );
    signal?.addEventListener("abort", cancel, { once: true });
    unsubscribe = source.subscribe(() => {
      if (!source.getState().busy) finish();
    });
    if (settled) unsubscribe();
    if (signal?.aborted) cancel();
    else if (!source.getState().busy) finish();
  });
}

/** Serializes explicit UI mutations; queued navigation cannot unlock an active save. */
export function createUiMutationQueue() {
  let pending = 0;
  let tail: Promise<unknown> = Promise.resolve();
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((listener) => listener());
  return {
    getBusy: () => pending > 0,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    run<T>(action: () => Promise<T>): Promise<T> {
      pending++;
      emit();
      const result = tail.then(action);
      tail = result.then(
        () => undefined,
        () => undefined,
      );
      return result.finally(() => {
        pending--;
        emit();
      });
    },
  };
}
