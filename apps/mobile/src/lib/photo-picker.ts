import * as ImagePicker from "expo-image-picker";
import * as Crypto from "expo-crypto";
import IdentifiedPickerModule from "../../modules/qrguitar-photo-picker";
import { makeIdentifiedNativePhotoPicker, type IdentifiedPhotoBridge } from "./identified-photo-picker";
import { getNativeAuth, getNativeStorage, NativeSessionChangedError, type AuthLease, type NativeAuth, type PersistentStorage } from "./auth";
import { MAX_NATIVE_PHOTOS, photoFromPickerAsset, type NativePhoto, type NativePhotoSelectionTarget, type NativeProfileDraftController, type NativeProfileInput } from "./profile-draft";

type PickerResult = ImagePicker.ImagePickerResult | ImagePicker.ImagePickerErrorResult | null;
type PendingSelection = NativePhotoSelectionTarget & { version: 1; selectionId: string; photos?: NativePhoto[]; resultReceived?: true };
const STORAGE_KEY = "qrguitar.android-photo-selection.v1";
const KEY = /^[a-zA-Z0-9-]{12,80}$/;
const archiveKey = (actorId: string) => STORAGE_KEY + ".saved." + actorId;
const unresolvedMessage = "The earlier photo selection has not returned yet. Return to the system photo picker to finish it, then try again. Your draft and selection have been kept.";

/** Android's pending result has no caller identity and is consumed by the bridge.
 * Bind it before launch, checkpoint it before application, and keep the receipt
 * atomic with the photos in the original account's encrypted draft. */
export function makeNativePhotoPicker(deps: {
  auth: NativeAuth; storage: PersistentStorage; randomId(): string;
  launch(options: ImagePicker.ImagePickerOptions): Promise<ImagePicker.ImagePickerResult>;
  pending(): Promise<PickerResult>;
  /** Only the new ID-aware facade may retire legacy anonymous work. It never
   * launches another anonymous Android selection that could receive old bytes. */
  retiredAnonymousChannel?: true;
}) {
  let busy = false;
  let unsaved: PendingSelection | null = null;
  const check = (lease: AuthLease, signal?: AbortSignal) => {
    if (!deps.auth.isCurrent(lease) || signal?.aborted) throw new NativeSessionChangedError();
  };
  async function read(key = STORAGE_KEY) {
    const raw = await deps.storage.getItem(key);
    if (raw === null) return null;
    const unreadable = () => new Error("The saved photo selection is unreadable. It has been kept; do not start another selection.");
    let value: PendingSelection;
    try { value = JSON.parse(raw) as PendingSelection; } catch { throw unreadable(); }
    if (!value || value.version !== 1 || !KEY.test(value.selectionId) || !KEY.test(value.actorId) || !KEY.test(value.uploadId) || !KEY.test(value.idempotencyKey)
      || (value.resultReceived !== undefined && value.resultReceived !== true)
      || !Array.isArray(value.photoIds) || value.photoIds.length > MAX_NATIVE_PHOTOS || value.photoIds.some(id => !KEY.test(id))
      || (value.photos !== undefined && (!Array.isArray(value.photos) || value.photos.length > MAX_NATIVE_PHOTOS || value.photos.some(photo => !photo || !KEY.test(photo.id) || typeof photo.dataUrl !== "string"))))
      throw unreadable();
    return value;
  }
  async function checkpoint(value: PendingSelection) {
    unsaved = value;
    await deps.storage.setItem(STORAGE_KEY, JSON.stringify(value));
    unsaved = null;
  }
  async function clear(value: PendingSelection, lease: AuthLease, signal?: AbortSignal, key = STORAGE_KEY) {
    check(lease, signal);
    const saved = await read(key); check(lease, signal);
    if (saved?.selectionId !== value.selectionId) throw new Error("The saved photo selection changed. Reopen this draft.");
    await deps.storage.removeItem(key); check(lease, signal);
    if (unsaved?.selectionId === value.selectionId) unsaved = null;
  }
  async function apply(value: PendingSelection, controller: NativeProfileDraftController, lease: AuthLease, signal?: AbortSignal, key = STORAGE_KEY) {
    check(lease, signal);
    const draft = await controller.applyPhotoSelection(value.selectionId, value, value.photos!);
    check(lease, signal);
    try { await clear(value, lease, signal, key); }
    catch {
      // Photos and receipt are already durable. Show that committed draft even
      // if optional marker cleanup fails; retrying its receipt is idempotent.
      check(lease, signal);
    }
    return draft;
  }
  async function receive(value: PendingSelection, result: PickerResult, controller: NativeProfileDraftController, lease: AuthLease, signal?: AbortSignal) {
    // Null only describes the current native slot, not a completed selection.
    // A later anonymous callback must retain this original binding.
    if (!result) return null;
    if ("canceled" in result && result.canceled) {
      await checkpoint({ ...value, resultReceived: true });
      await clear(value, lease, signal); return null;
    }
    if ("code" in result) {
      await checkpoint({ ...value, resultReceived: true });
      await clear(value, lease, signal);
      throw new Error("The photo picker could not recover that selection. Please choose the photos again.");
    }
    // Checkpoint even if the original screen/session has since retired. The
    // encrypted result remains bound to that actor; application still needs a lease.
    let photos: NativePhoto[];
    try {
      if (!Array.isArray(result.assets) || result.assets.length < 1 || result.assets.length > MAX_NATIVE_PHOTOS - value.photoIds.length)
        throw new Error("Invalid photo count");
      photos = result.assets.map(photoFromPickerAsset);
    }
    catch {
      // The native result was consumed even when an asset is unsupported. Keep
      // that terminal receipt so its owner can deliberately discard/reselect.
      await checkpoint({ ...value, resultReceived: true });
      throw new Error("The selected photos could not be read. Discard the pending photo selection to choose them again.");
    }
    const received = { ...value, photos };
    await checkpoint(received);
    return apply(received, controller, lease, signal);
  }
  async function recoverCurrent(actorId: string, controller: NativeProfileDraftController, lease: AuthLease, signal?: AbortSignal) {
    let key = STORAGE_KEY, value = await read(); check(lease, signal);
    if (!value || value.actorId !== actorId) { key = archiveKey(actorId); value = await read(key); check(lease, signal); }
    if (!value) return null;
    if (value.actorId !== actorId) throw new Error("This saved photo selection belongs to another account. It has not been attached.");
    if (key === STORAGE_KEY && unsaved?.selectionId === value.selectionId) { value = unsaved; await checkpoint(value); check(lease, signal); }
    if (value.photos) return apply(value, controller, lease, signal, key);
    if (value.resultReceived) throw new Error("The earlier photo selection finished but could not be restored. Discard the pending photo selection to choose photos again.");
    if (key !== STORAGE_KEY) throw new Error("The saved photo selection is incomplete. It has been kept for recovery.");
    // Do not consume the unbound native result for a replaced/frozen draft.
    const draft = await controller.loadDraft(); check(lease, signal);
    if (!draft || draft.uploadId !== value.uploadId || draft.idempotencyKey !== value.idempotencyKey || draft.frozenBody || draft.uncertain || draft.result)
      throw new Error("A photo selection belongs to an earlier or saved draft. It has been kept for recovery.");
    return receive(value, await deps.pending(), controller, lease, signal);
  }
  async function run<T>(work: () => Promise<T>): Promise<T> {
    if (busy) throw new Error("A photo selection is already being handled. Please wait.");
    busy = true;
    try { return await work(); } finally { busy = false; }
  }
  return {
    hasPending: async (actorId: string, signal?: AbortSignal) => {
      const lease = await deps.auth.acquireSession(actorId); check(lease, signal);
      const global = await read(); check(lease, signal);
      if (global?.actorId === actorId) return true;
      const archived = await read(archiveKey(actorId)); check(lease, signal);
      if (archived && archived.actorId !== actorId) throw new Error("The saved photo selection account is invalid.");
      return Boolean(archived);
    },
    discard: (actorId: string, signal?: AbortSignal) => run(async () => {
      const lease = await deps.auth.acquireSession(actorId); check(lease, signal);
      let key = STORAGE_KEY, value = await read(); check(lease, signal);
      if (!value || value.actorId !== actorId) { key = archiveKey(actorId); value = await read(key); check(lease, signal); }
      if (!value) return;
      if (value.actorId !== actorId) throw new Error("Return to the original account to discard its pending photo selection.");
      if (key === STORAGE_KEY && unsaved?.selectionId === value.selectionId) { value = unsaved; await checkpoint(value); check(lease, signal); }
      // Only an explicit user confirmation may discard a quarantined selection.
      if (key === STORAGE_KEY && !value.photos && !value.resultReceived && !deps.retiredAnonymousChannel) {
        const result = await deps.pending();
        if (!result) { check(lease, signal); throw new Error(unresolvedMessage); }
        // This read consumed a known result even if the screen/account retired.
        // Preserve its original binding before checking whether cleanup is allowed.
        await checkpoint({ ...value, resultReceived: true }); check(lease, signal);
      }
      await clear(value, lease, signal, key);
    }),
    recover: (actorId: string, controller: NativeProfileDraftController, signal?: AbortSignal) => run(async () => {
      const lease = await deps.auth.acquireSession(actorId); check(lease, signal);
      return recoverCurrent(actorId, controller, lease, signal);
    }),
    pick: (actorId: string, controller: NativeProfileDraftController, input: NativeProfileInput, photos: NativePhoto[], signal?: AbortSignal) => run(async () => {
      const lease = await deps.auth.acquireSession(actorId); check(lease, signal);
      let previous = await read(); check(lease, signal);
      if (previous && unsaved?.selectionId === previous.selectionId && (unsaved.photos || unsaved.resultReceived)) {
        previous = unsaved; await checkpoint(previous); check(lease, signal);
      }
      if (previous && previous.actorId !== actorId) {
        if (!previous.photos && !previous.resultReceived) throw new Error("An interrupted photo selection is still tied to a previous account. Sign back into that account to resolve it. Its photos have not been attached or discarded.");
        // Only an already checkpointed result can leave the anonymous native slot.
        // Retain the exact encrypted actor/draft binding before freeing that slot.
        const key = archiveKey(previous.actorId), archived = await read(key); check(lease, signal);
        if (archived && archived.selectionId !== previous.selectionId) throw new Error("Earlier photo selections need recovery in their original account before choosing more photos.");
        await deps.storage.setItem(key, JSON.stringify(previous)); check(lease, signal);
        await clear(previous, lease, signal); previous = null;
      }
      const archived = await read(archiveKey(actorId)); check(lease, signal);
      if (archived) return recoverCurrent(actorId, controller, lease, signal);
      if (previous) {
        const recovered = await recoverCurrent(actorId, controller, lease, signal);
        if (recovered) return recovered;
        if (await read()) throw new Error(unresolvedMessage);
        check(lease, signal);
      } else {
        // Orphaned native results have no trusted actor binding. Drain them before
        // recording a new intent so they can never attach to the next account.
        await deps.pending(); check(lease, signal);
      }
      const draft = await controller.saveDraft(input, photos); check(lease, signal);
      if (draft.photos.length >= MAX_NATIVE_PHOTOS) throw new Error("This draft already has the maximum number of photos.");
      const intent: PendingSelection = { version: 1, selectionId: deps.randomId(), actorId, uploadId: draft.uploadId, idempotencyKey: draft.idempotencyKey, photoIds: draft.photos.map(photo => photo.id) };
      await checkpoint(intent); check(lease, signal);
      let result: ImagePicker.ImagePickerResult;
      try { result = await deps.launch({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: MAX_NATIVE_PHOTOS - photos.length, quality: 0.85, base64: true, exif: false }); }
      catch (error) {
        // A native exception may follow activity destruction. Keep its binding so
        // a later pending-result read can recover instead of attributing it anew.
        throw error;
      }
      return receive(intent, result, controller, lease, signal);
    })
  };
}
const identifiedBridge: IdentifiedPhotoBridge = {
  isAvailable: () => {
    const module = IdentifiedPickerModule;
    if (!module || module.protocolVersion !== 1) return false;
    return ["startSelectionAsync", "readSelectionAsync", "acknowledgeSelectionAsync", "discardSelectionAsync", "addListener"].every(key => typeof module[key as keyof typeof module] === "function");
  },
  startSelectionAsync: (id, options) => IdentifiedPickerModule!.startSelectionAsync(id, options),
  readSelectionAsync: id => IdentifiedPickerModule!.readSelectionAsync(id),
  acknowledgeSelectionAsync: (id, resultId) => IdentifiedPickerModule!.acknowledgeSelectionAsync(id, resultId),
  discardSelectionAsync: id => IdentifiedPickerModule!.discardSelectionAsync(id),
  subscribe: listener => {
    const subscription = IdentifiedPickerModule!.addListener("onSelectionChanged", listener);
    return () => subscription.remove();
  },
};
let sharedPicker: ReturnType<typeof makeIdentifiedNativePhotoPicker> | undefined;
export function getNativePhotoPicker() {
  if (sharedPicker) return sharedPicker;
  const auth = getNativeAuth(), storage = getNativeStorage();
  const legacy = makeNativePhotoPicker({ auth, storage, randomId: () => Crypto.randomUUID(), retiredAnonymousChannel: true,
    launch: async () => { throw new Error("Legacy Android selections can only be recovered or discarded."); },
    pending: () => ImagePicker.getPendingResultAsync() });
  return sharedPicker = makeIdentifiedNativePhotoPicker({ auth, storage, randomId: () => Crypto.randomUUID(), bridge: identifiedBridge, legacy });
}
