import { NativeSessionChangedError, type AuthLease, type NativeAuth, type PersistentStorage } from "./auth";
import { MAX_NATIVE_PHOTOS, validatePartialNativeProfile, type NativePhoto, type NativePhotoSelectionTarget, type NativeProfileDraft, type NativeProfileDraftController, type NativeProfileInput } from "./profile-draft";

export type IdentifiedPhotoSnapshot =
  | { selectionId: string; status: "missing" | "pending" | "cancelled" | "discarded" | "acknowledged" }
  | { selectionId: string; status: "failed"; code: string }
  | { selectionId: string; status: "ready"; resultId: string; photos: NativePhoto[] };
export interface IdentifiedPhotoBridge {
  isAvailable(): boolean;
  startSelectionAsync(selectionId: string, options: { maxAssets: number; remainingBytes: number }): Promise<IdentifiedPhotoSnapshot>;
  readSelectionAsync(selectionId: string): Promise<IdentifiedPhotoSnapshot>;
  acknowledgeSelectionAsync(selectionId: string, resultId: string): Promise<IdentifiedPhotoSnapshot>;
  discardSelectionAsync(selectionId: string): Promise<IdentifiedPhotoSnapshot>;
  subscribe(listener: (event: { selectionId: string; status: string }) => void): () => void;
}
export interface LegacyPhotoRecovery {
  hasPending(actorId: string, signal?: AbortSignal): Promise<boolean>;
  recover(actorId: string, controller: NativeProfileDraftController, signal?: AbortSignal): Promise<NativeProfileDraft | null>;
  discard(actorId: string, signal?: AbortSignal): Promise<void>;
}
type Selection = NativePhotoSelectionTarget & { version: 2; selectionId: string; maxAssets: number; remainingBytes: number };
const KEY = /^[a-zA-Z0-9-]{12,80}$/;
const isId = (value: unknown): value is string => typeof value === "string" && KEY.test(value);
const PREFIX = "qrguitar.android-photo-selection.v2.";
const MAX_TOTAL_BYTES = 16 * 1024 * 1024;
const pendingMessage = "Your earlier photo selection is still pending. Finish it or discard that selection before choosing photos again. Your draft has been kept.";
const missingModule = "This app build cannot safely recover Android photo selections. Install the updated QRguitar app to choose photos. Your saved draft has been kept.";
const markerKey = (actorId: string) => {
  if (!KEY.test(actorId)) throw new Error("The photo selection account is invalid.");
  return PREFIX + actorId;
};

/** Native reads are repeatable. The draft receipt commits before native ack;
 * no replacement selection starts until ack and marker removal are reconciled. */
export function makeIdentifiedNativePhotoPicker(deps: {
  auth: NativeAuth; storage: PersistentStorage; randomId(): string;
  bridge: IdentifiedPhotoBridge; legacy?: LegacyPhotoRecovery;
}) {
  let busy = false;
  const available = () => { if (!deps.bridge.isAvailable()) throw new Error(missingModule); };
  const check = (lease: AuthLease, signal?: AbortSignal) => {
    if (!deps.auth.isCurrent(lease) || signal?.aborted) throw new NativeSessionChangedError();
  };
  async function read(actorId: string): Promise<Selection | null> {
    const raw = await deps.storage.getItem(markerKey(actorId));
    if (raw === null) return null;
    const unreadable = () => new Error("The saved photo selection is unreadable. It has been kept for recovery.");
    let value: Selection;
    try { value = JSON.parse(raw) as Selection; } catch { throw unreadable(); }
    if (!value || value.version !== 2 || value.actorId !== actorId || !isId(value.selectionId)
      || !isId(value.uploadId) || !isId(value.idempotencyKey)
      || !Array.isArray(value.photoIds) || value.photoIds.length > MAX_NATIVE_PHOTOS
      || new Set(value.photoIds).size !== value.photoIds.length || value.photoIds.some(id => !isId(id))
      || !Number.isInteger(value.maxAssets) || value.maxAssets < 1 || value.maxAssets > MAX_NATIVE_PHOTOS
      || value.maxAssets !== MAX_NATIVE_PHOTOS - value.photoIds.length
      || !Number.isInteger(value.remainingBytes) || value.remainingBytes < 1 || value.remainingBytes > MAX_TOTAL_BYTES)
      throw unreadable();
    return value;
  }
  function snapshot(value: unknown, selection: Selection): IdentifiedPhotoSnapshot {
    if (!value || typeof value !== "object") throw new Error("The photo picker returned an invalid result. Your selection has been kept.");
    const result = value as IdentifiedPhotoSnapshot;
    if (result.selectionId !== selection.selectionId || !["missing", "pending", "cancelled", "discarded", "acknowledged", "failed", "ready"].includes(result.status))
      throw new Error("The photo picker returned a different selection. No photos were attached.");
    if (result.status === "ready" && (!isId(result.resultId) || !Array.isArray(result.photos)
      || result.photos.length < 1 || result.photos.length > selection.maxAssets
      || new Set(result.photos.map(photo => photo?.id)).size !== result.photos.length
      || result.photos.some(photo => !photo || !isId(photo.id) || typeof photo.dataUrl !== "string")))
      throw new Error("The selected photos could not be read. Discard that selection to choose photos again.");
    return result;
  }
  async function clear(selection: Selection, lease: AuthLease, signal?: AbortSignal) {
    check(lease, signal);
    const saved = await read(selection.actorId); check(lease, signal);
    if (!saved || saved.selectionId !== selection.selectionId) throw new Error("The saved photo selection changed. Reopen this draft.");
    await deps.storage.removeItem(markerKey(selection.actorId)); check(lease, signal);
  }
  async function receive(selection: Selection, raw: unknown, controller: NativeProfileDraftController, lease: AuthLease, signal?: AbortSignal) {
    check(lease, signal);
    const result = snapshot(raw, selection);
    if (result.status === "pending" || result.status === "missing") return null;
    if (result.status === "failed") throw new Error("The photo picker could not finish this selection. Discard it and choose the photos again. Your draft has been kept.");
    if (result.status === "cancelled" || result.status === "discarded") { await clear(selection, lease, signal); return null; }
    if (result.status === "acknowledged") {
      const draft = await controller.loadDraft(); check(lease, signal);
      if (!draft || draft.actorId !== selection.actorId || draft.uploadId !== selection.uploadId
        || draft.idempotencyKey !== selection.idempotencyKey || draft.lastPhotoSelectionId !== selection.selectionId)
        throw new Error("The completed photo selection could not be matched to this saved draft. Discard only that selection to continue.");
      await clear(selection, lease, signal);
      return draft;
    }
    if (result.status !== "ready") throw new Error("The photo picker returned an invalid result. Your selection has been kept.");
    // The controller validates bytes, photo identity and the original draft,
    // then commits the photos and selection receipt in one encrypted write.
    // Invalid native data is never copied into the durable intent marker.
    const draft = await controller.applyPhotoSelection(selection.selectionId, selection, result.photos);
    check(lease, signal);
    try {
      const acknowledged = snapshot(await deps.bridge.acknowledgeSelectionAsync(selection.selectionId, result.resultId), selection);
      check(lease, signal);
      if (acknowledged.status !== "acknowledged") throw new Error("Photo selection cleanup is not confirmed.");
      await clear(selection, lease, signal);
    } catch {
      // Committed draft is useful even if native cleanup lost its response.
      // Retain the marker: future picks reconcile this ID before making a new one.
      check(lease, signal);
    }
    return draft;
  }
  async function recoverCurrent(actorId: string, controller: NativeProfileDraftController, lease: AuthLease, signal?: AbortSignal) {
    const selection = await read(actorId); check(lease, signal);
    if (selection) {
      available();
      return receive(selection, await deps.bridge.readSelectionAsync(selection.selectionId), controller, lease, signal);
    }
    if (deps.legacy && await deps.legacy.hasPending(actorId, signal)) {
      check(lease, signal);
      return deps.legacy.recover(actorId, controller, signal);
    }
    return null;
  }
  async function run<T>(work: () => Promise<T>): Promise<T> {
    if (busy) throw new Error("A photo selection is already being handled. Please wait.");
    busy = true;
    try { return await work(); } finally { busy = false; }
  }
  return {
    subscribe(actorId: string, listener: () => void) {
      if (!deps.bridge.isAvailable()) return () => {};
      let active = true;
      const unsubscribe = deps.bridge.subscribe(event => {
        if (!event || !isId(event.selectionId) || event.status === "pending") return;
        void (async () => {
          const lease = await deps.auth.acquireSession(actorId);
          if (!active || !deps.auth.isCurrent(lease)) return;
          const selection = await read(actorId);
          if (active && deps.auth.isCurrent(lease) && selection?.selectionId === event.selectionId) listener();
        })().catch(() => { /* Foreground/manual recovery still reads the durable ID. */ });
      });
      return () => { active = false; unsubscribe(); };
    },
    recover: (actorId: string, controller: NativeProfileDraftController, signal?: AbortSignal) => run(async () => {
      const lease = await deps.auth.acquireSession(actorId); check(lease, signal);
      return recoverCurrent(actorId, controller, lease, signal);
    }),
    discard: (actorId: string, signal?: AbortSignal) => run(async () => {
      const lease = await deps.auth.acquireSession(actorId); check(lease, signal);
      const selection = await read(actorId); check(lease, signal);
      if (!selection) {
        if (deps.legacy && await deps.legacy.hasPending(actorId, signal)) {
          check(lease, signal); await deps.legacy.discard(actorId, signal);
        }
        return;
      }
      available();
      // A tombstone is durable even if start had not reached native code.
      // A late callback/start for this ID cannot attach to a replacement.
      const discarded = snapshot(await deps.bridge.discardSelectionAsync(selection.selectionId), selection);
      check(lease, signal);
      if (discarded.status !== "discarded" && discarded.status !== "acknowledged") throw new Error("The photo selection could not be discarded. Please try again.");
      await clear(selection, lease, signal);
    }),
    pick: (actorId: string, controller: NativeProfileDraftController, input: NativeProfileInput, photos: NativePhoto[], signal?: AbortSignal) => run(async () => {
      available();
      const lease = await deps.auth.acquireSession(actorId); check(lease, signal);
      if (await read(actorId) || (deps.legacy && await deps.legacy.hasPending(actorId, signal))) {
        check(lease, signal);
        const recovered = await recoverCurrent(actorId, controller, lease, signal);
        if (recovered) return recovered;
        if (await read(actorId) || (deps.legacy && await deps.legacy.hasPending(actorId, signal))) throw new Error(pendingMessage);
        check(lease, signal);
      }
      const draft = await controller.saveDraft(input, photos); check(lease, signal);
      validatePartialNativeProfile(draft.input, draft.photos);
      if (draft.photos.length >= MAX_NATIVE_PHOTOS) throw new Error("This draft already has the maximum number of photos.");
      const usedBytes = draft.photos.reduce((sum, photo) => {
        const bytes = photo.dataUrl.slice(photo.dataUrl.indexOf(",") + 1);
        return sum + bytes.length / 4 * 3 - (bytes.endsWith("==") ? 2 : bytes.endsWith("=") ? 1 : 0);
      }, 0);
      if (usedBytes >= MAX_TOTAL_BYTES) throw new Error("The saved photos already use the 16 MiB draft limit. Remove a photo before choosing more.");
      const selection: Selection = { version: 2, selectionId: deps.randomId(), actorId,
        uploadId: draft.uploadId, idempotencyKey: draft.idempotencyKey, photoIds: draft.photos.map(photo => photo.id),
        maxAssets: MAX_NATIVE_PHOTOS - draft.photos.length, remainingBytes: MAX_TOTAL_BYTES - usedBytes };
      if (!KEY.test(selection.selectionId)) throw new Error("A photo selection identity could not be created.");
      await deps.storage.setItem(markerKey(actorId), JSON.stringify(selection)); check(lease, signal);
      // A failed/ambiguous dispatch preserves its exact marker. Only an explicit
      // discard retires that ID; retries never create a second native selection.
      return receive(selection, await deps.bridge.startSelectionAsync(selection.selectionId, {
        maxAssets: selection.maxAssets, remainingBytes: selection.remainingBytes,
      }), controller, lease, signal);
    }),
  };
}
