export type EditorVersions = { publishedVersion: string; draftVersion: string };
export type EditorMutationPayload = Partial<EditorVersions> & { ok?: boolean; committed?: boolean; uncertain?: boolean; conflict?: boolean; superseded?: boolean; requestId?: string; message?: string; errors?: Record<string, string>; [key: string]: unknown };
export type EditorAttempt = { body: string; localSnapshot: string; uncertain?: boolean };
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export class EditorMutationError extends Error {
  constructor(message: string, public payload: EditorMutationPayload = {}, public uncertain = false) { super(message); }
}
export function editorResponseIsCommitted(payload: EditorMutationPayload, requestId: string) {
  return payload.ok === true && payload.committed === true && payload.requestId === requestId && typeof payload.publishedVersion === "string" && typeof payload.draftVersion === "string";
}
export function shouldReplaceEditorContent(currentSnapshot: string, submittedSnapshot: string) { return currentSnapshot === submittedSnapshot; }
export function createEditorMutationController(options: {
  actorId: string; storageScope?: string; storage: StorageLike; uuid: () => string;
  send: (body: string) => Promise<{ status: number; payload: EditorMutationPayload }>;
}) {
  const key = `qrguitar.site-editor.pending.v1:${options.actorId}${options.storageScope ? `:${options.storageScope}` : ""}`;
  let attempt: EditorAttempt | null = null;
  let active: Promise<EditorMutationPayload> | null = null;
  let storageProblem = false;
  try {
    const saved = options.storage.getItem(key);
    if (saved) {
      const parsed = JSON.parse(saved) as EditorAttempt;
      const body = JSON.parse(parsed.body) as Record<string, unknown>;
      if (typeof parsed.localSnapshot !== "string" || body.expectedActorId !== options.actorId || typeof body.requestId !== "string" || typeof body.expectedPublishedVersion !== "string" || typeof body.expectedDraftVersion !== "string") throw new Error();
      attempt = { ...parsed, uncertain: true };
    }
  } catch { storageProblem = true; }
  function clearConfirmedAttempt() {
    attempt = null;
    // A confirmed commit stays successful if local storage cleanup fails. An old
    // persisted attempt can only replay its completed database receipt after reload.
    try { options.storage.removeItem(key); } catch { /* exact replay remains safe */ }
  }
  async function perform() {
    const current = attempt!;
    const request = JSON.parse(current.body) as { requestId: string };
    try {
      const response = await options.send(current.body);
      if (response.status >= 200 && response.status < 300 && editorResponseIsCommitted(response.payload, request.requestId)) {
        clearConfirmedAttempt(); return response.payload;
      }
      if (response.payload.ok === false && response.payload.uncertain === false && (!current.uncertain || ["QSE01", "QSE02", "QSE04"].includes(String(response.payload.code)))) {
        clearConfirmedAttempt();
        throw new EditorMutationError(response.payload.message || "The change was rejected before it was saved.", response.payload);
      }
      throw new EditorMutationError(response.payload.message || "The save result is unknown. Retry the same request.", response.payload, true);
    } catch (error) {
      if (error instanceof EditorMutationError && !error.uncertain) throw error;
      if (attempt) { attempt.uncertain = true; try { options.storage.setItem(key, JSON.stringify(attempt)); } catch { /* the frozen request remains in memory and its prior durable entry */ } }
      if (error instanceof EditorMutationError) throw error;
      throw new EditorMutationError("The connection ended before the save was confirmed. Retry the same request.", {}, true);
    }
  }
  function execute() {
    const operation = perform(); active = operation;
    void operation.finally(() => { if (active === operation) active = null; }).catch(() => {});
    return operation;
  }
  return {
    get pending() { return attempt; }, get busy() { return !!active; }, get storageProblem() { return storageProblem; },
    async idle() { try { await active; } catch { /* caller reconciles pending before a new mutation */ } },
    mutate(input: Record<string, unknown>, versions: EditorVersions, localSnapshot: string) {
      if (active) return Promise.reject(new EditorMutationError("Wait for the current save to finish."));
      if (attempt) return Promise.reject(new EditorMutationError("Resolve the previous save before making another change.", {}, true));
      if (storageProblem) return Promise.reject(new EditorMutationError("Recovery storage is unavailable. Export your local changes and reload before saving."));
      const next = { body: JSON.stringify({ ...input, expectedActorId: options.actorId, requestId: options.uuid(), expectedPublishedVersion: versions.publishedVersion, expectedDraftVersion: versions.draftVersion }), localSnapshot };
      try { options.storage.setItem(key, JSON.stringify(next)); }
      catch { storageProblem = true; return Promise.reject(new EditorMutationError("Recovery storage is unavailable. The request was not sent.")); }
      attempt = next;
      return execute();
    },
    retry() {
      if (active) return Promise.reject(new EditorMutationError("Wait for the current save to finish."));
      if (!attempt) return Promise.reject(new EditorMutationError("There is no pending save to retry."));
      return execute();
    }
  };
}


