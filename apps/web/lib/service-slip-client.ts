import { isSlipId, readServiceSlip, readSavedServiceSlip, type ServiceSlip } from "./service-slips";
export class ServiceSlipSaveError extends Error {
  constructor(message: string, public kind: "uncertain" | "conflict" | "invalid" | "session") { super(message); }
}
type Reply = { status: number; payload: unknown };
/** One frozen save at a time; never silently turns a lost response into a new slip. */
export function createServiceSlipSaveController(actor: string, send: (body: string) => Promise<Reply>) {
  let valid = true, busy = false, pending: string | null = null;
  async function attempt(body: string) {
    if (!valid) throw new ServiceSlipSaveError("Your session changed. Reload your slips.", "session");
    if (busy) throw new ServiceSlipSaveError("A save is already in progress.", "invalid");
    busy = true;
    try {
      let reply: Reply;
      try { reply = await send(body); } catch { throw new ServiceSlipSaveError("Save not confirmed. Retry the same save or reload this slip.", "uncertain"); }
      if (!valid) throw new ServiceSlipSaveError("Your session changed. Reload your slips.", "session");
      const payload = reply.payload as { ok?: boolean; committed?: boolean; actorId?: string; slip?: unknown; message?: string; conflict?: boolean } | null;
      if (reply.status === 409 && payload?.conflict === true) {
        pending = null;
        throw new ServiceSlipSaveError("A newer version was saved. Reload before editing again.", "conflict");
      }
      if (reply.status !== 200 || payload?.ok !== true || payload.committed !== true || payload.actorId !== actor) {
        throw new ServiceSlipSaveError(typeof payload?.message === "string" ? payload.message : "Save not confirmed. Retry the same save or reload this slip.", "uncertain");
      }
      try {
        const request = JSON.parse(body);
        const saved = readSavedServiceSlip(payload.slip, actor);
        if (saved.id !== request.id || saved.revision !== request.expectedRevision + 1 || JSON.stringify(saved.data) !== JSON.stringify(request.data)) throw new Error("Unmatched save");
        pending = null;
        return saved;
      } catch { throw new ServiceSlipSaveError("Could not verify the save. Retry the same save or reload this slip.", "uncertain"); }
    } finally { busy = false; }
  }
  return {
    save(id: string, expectedRevision: number, data: ServiceSlip) {
      if (!valid) return Promise.reject(new ServiceSlipSaveError("Your session changed.", "session"));
      if (pending || busy) return Promise.reject(new ServiceSlipSaveError("Resolve the previous save before making changes.", "uncertain"));
      if (!isSlipId(id) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) return Promise.reject(new ServiceSlipSaveError("Reload the slip before saving.", "invalid"));
      const normalized = readServiceSlip(data);
      pending = JSON.stringify({ id, expectedRevision, expectedActorId: actor, data: normalized });
      return attempt(pending);
    },
    retry() {
      if (!pending) return Promise.reject(new ServiceSlipSaveError("There is no pending save.", "invalid"));
      return attempt(pending);
    },
    invalidate() { valid = false; pending = null; },
    hasPending() { return pending !== null; }
  };
}
