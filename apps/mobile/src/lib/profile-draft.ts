import * as Crypto from "expo-crypto";
import {
  getNativeAuth,
  getNativeStorage,
  NativeSessionChangedError,
  type AuthLease,
  type NativeAuth,
  type PersistentStorage,
} from "./auth";
import {
  getNativeApi,
  NativeApiError,
  MAX_NATIVE_UPLOAD_BYTES,
  type NativeApi,
  type NativeCreateResult,
} from "./api";
export type { NativeCreateResult } from "./api";

export type NativePhoto = { id: string; dataUrl: string };
export type NativeProfileInput = {
  name?: string;
  brand: string;
  model: string;
  serial: string;
  serialNotUsed: boolean;
  instrumentType: string;
  year?: string;
  builder?: string;
  finish?: string;
  condition?: "new" | "used";
  saleStatus?: "for_sale" | "not_for_sale";
  location?: string;
  summary?: string;
  visibility: "private" | "unlisted" | "public";
  showSerialPublic?: boolean;
  ownerName?: string;
};
export type NativeProfileDraft = {
  actorId: string;
  input: NativeProfileInput;
  photos: NativePhoto[];
  uploadId: string;
  idempotencyKey: string;
  uploadFileIds: string[];
  stagedPaths: string[];
  frozenBody: string | null;
  uncertain: boolean;
  result: NativeCreateResult | null;
};
export type NativeProfileDraftState = {
  draft: NativeProfileDraft | null;
  busy: boolean;
  error: string;
};
export interface NativeProfileDraftController {
  subscribe(listener: (state: NativeProfileDraftState) => void): () => void;
  getState(): NativeProfileDraftState;
  loadDraft(): Promise<NativeProfileDraft | null>;
  saveDraft(
    input: NativeProfileInput,
    photos: NativePhoto[],
  ): Promise<NativeProfileDraft>;
  createOrRetry(
    input?: NativeProfileInput,
    photos?: NativePhoto[],
  ): Promise<NativeCreateResult>;
  discardDraft(): Promise<void>;
  dispose(): void;
}
export const MAX_NATIVE_PHOTOS = 8;
export const NATIVE_PHOTO_LIMIT = MAX_NATIVE_PHOTOS;
export const MAX_NATIVE_IMAGE_BYTES = MAX_NATIVE_UPLOAD_BYTES;
const MAX_PHOTO_BYTES = MAX_NATIVE_IMAGE_BYTES;
const MAX_TOTAL_PHOTO_BYTES = 16 * 1024 * 1024;
const KEY = /^[a-zA-Z0-9-]{12,80}$/;
function imageInfo(dataUrl: string): { bytes: number; mimeType: string } {
  const match =
    /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(
      dataUrl,
    );
  if (!match || match[2].length % 4 !== 0)
    throw new Error("Choose a JPEG, PNG, or WebP photo.");
  const base64 = match[2];
  const bytes =
    (base64.length / 4) * 3 -
    (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0);
  const magic = globalThis.atob(base64.slice(0, 32));
  const mimeType = magic.startsWith("\xff\xd8\xff")
    ? "image/jpeg"
    : magic.startsWith("\x89PNG\r\n\x1a\n")
      ? "image/png"
      : magic.startsWith("RIFF") && magic.slice(8, 12) === "WEBP"
        ? "image/webp"
        : "";
  if (mimeType !== match[1] || bytes < 12 || bytes > MAX_PHOTO_BYTES)
    throw new Error("Choose a valid photo no larger than 12 MiB.");
  return { bytes, mimeType };
}
export function photoFromPickerAsset(asset: {
  base64?: string | null;
  mimeType?: string | null;
  uri?: string;
}): NativePhoto {
  if (!asset.base64)
    throw new Error("This photo could not be read. Choose it again.");
  const magic = globalThis.atob(asset.base64.slice(0, 32));
  // Expo may return JPEG bytes even when the original asset has another MIME type.
  const mime = magic.startsWith("\xff\xd8\xff")
    ? "image/jpeg"
    : magic.startsWith("\x89PNG\r\n\x1a\n")
      ? "image/png"
      : magic.startsWith("RIFF") && magic.slice(8, 12) === "WEBP"
        ? "image/webp"
        : "";
  const dataUrl = "data:" + mime + ";base64," + asset.base64;
  imageInfo(dataUrl);
  return { id: Crypto.randomUUID(), dataUrl };
}
export function validatePartialNativeProfile(
  input: NativeProfileInput,
  photos: NativePhoto[],
): void {
  if (
    !input ||
    typeof input !== "object" ||
    typeof input.serialNotUsed !== "boolean"
  )
    throw new Error("The draft details are invalid.");
  for (const required of [
    "brand",
    "model",
    "serial",
    "instrumentType",
  ] as const)
    if (typeof input[required] !== "string")
      throw new Error("The draft details are invalid.");
  if (!["private", "unlisted", "public"].includes(input.visibility))
    throw new Error("Choose who can see this profile.");
  const limits: [keyof NativeProfileInput, number][] = [
    ["name", 200],
    ["brand", 120],
    ["model", 180],
    ["serial", 120],
    ["instrumentType", 100],
    ["year", 30],
    ["builder", 180],
    ["finish", 180],
    ["location", 200],
    ["summary", 5000],
    ["ownerName", 160],
  ];
  for (const [key, limit] of limits)
    if (
      input[key] !== undefined &&
      (typeof input[key] !== "string" || (input[key] as string).length > limit)
    )
      throw new Error(`${key} is too long or invalid.`);
  if (!Array.isArray(photos) || photos.length > NATIVE_PHOTO_LIMIT)
    throw new Error("Choose up to 8 photos.");
  if (
    new Set(photos.map((photo) => photo.id)).size !== photos.length ||
    photos.some((photo) => !KEY.test(photo.id))
  )
    throw new Error("Choose each photo once.");
  if (
    photos.reduce((total, photo) => total + imageInfo(photo.dataUrl).bytes, 0) >
    MAX_TOTAL_PHOTO_BYTES
  )
    throw new Error(
      "The selected photos exceed 16 MiB. Choose smaller photos.",
    );
}
export function validateNativeProfile(
  input: NativeProfileInput,
  photos: NativePhoto[],
): void {
  validatePartialNativeProfile(input, photos);
  if (
    !input.brand.trim() ||
    !input.model.trim() ||
    !input.instrumentType.trim()
  )
    throw new Error("Enter the brand, model, and instrument type.");
  if (
    !input.serialNotUsed &&
    input.serial.replace(/[^a-z0-9]/gi, "").length < 4
  )
    throw new Error(
      "Enter the serial number, or mark that this instrument has no serial number.",
    );
  if (!photos.length)
    throw new Error("Choose at least one photo before creating a profile.");
}
export function freezeNativeCreateBody(draft: NativeProfileDraft): string {
  validateNativeProfile(draft.input, draft.photos);
  if (draft.stagedPaths.length !== draft.photos.length)
    throw new Error("Finish uploading every selected photo before saving.");
  const input = draft.input;
  return JSON.stringify({
    uploadId: draft.uploadId,
    idempotencyKey: draft.idempotencyKey,
    name:
      input.name?.trim() || [input.brand.trim(), input.model.trim()].join(" "),
    brand: input.brand.trim(),
    model: input.model.trim(),
    serial: input.serial.trim(),
    serialNotUsed: input.serialNotUsed === true,
    instrumentType: input.instrumentType.trim(),
    year: input.year?.trim() || "",
    builder: input.builder?.trim() || "",
    finish: input.finish?.trim() || "",
    condition: input.condition === "new" ? "new" : "used",
    saleStatus: input.saleStatus === "for_sale" ? "for_sale" : "not_for_sale",
    originalityStatus: "unknown",
    location: input.location?.trim() || "",
    summary: input.summary?.trim() || "",
    ownerName: input.ownerName?.trim() || "",
    visibility: input.visibility,
    showSerialPublic: input.showSerialPublic === true,
    heroImagePath: draft.stagedPaths[0],
    photos: draft.stagedPaths,
    customFields: [],
    customLinks: [],
    documents: [],
  });
}
const freezeDraft = (draft: NativeProfileDraft): NativeProfileDraft => {
  Object.freeze(draft.input);
  draft.photos.forEach(Object.freeze);
  Object.freeze(draft.photos);
  Object.freeze(draft.uploadFileIds);
  Object.freeze(draft.stagedPaths);
  if (draft.result) Object.freeze(draft.result);
  return Object.freeze(draft);
};
function parseDraft(raw: string, actorId: string): NativeProfileDraft {
  const envelope = JSON.parse(raw) as {
    version?: unknown;
    draft?: NativeProfileDraft;
  };
  const draft = envelope.draft;
  if (
    envelope.version !== 1 ||
    !draft ||
    draft.actorId !== actorId ||
    !KEY.test(draft.uploadId) ||
    !KEY.test(draft.idempotencyKey) ||
    !Array.isArray(draft.stagedPaths) ||
    typeof draft.uncertain !== "boolean" ||
    !(draft.frozenBody === null || typeof draft.frozenBody === "string")
  )
    throw new Error(
      "This saved draft is unreadable. Keep it for support; it has not been deleted.",
    );
  validatePartialNativeProfile(draft.input, draft.photos);
  draft.uploadFileIds ??= draft.photos.map((photo) => photo.id);
  if (
    !Array.isArray(draft.uploadFileIds) ||
    draft.uploadFileIds.length !== draft.photos.length ||
    draft.uploadFileIds.some(
      (id) =>
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          id,
        ),
    )
  )
    throw new Error("The saved upload identities are invalid.");
  if (
    draft.stagedPaths.length > draft.photos.length ||
    draft.stagedPaths.some(
      (path) =>
        typeof path !== "string" ||
        !path.startsWith(
          actorId + "/profile-uploads/" + draft.uploadId + "/image-",
        ) ||
        !/^[a-zA-Z0-9/_.-]+$/.test(path) ||
        path.includes("..") ||
        path.split("/").length !== 4,
    )
  )
    throw new Error("The saved photo references are invalid.");
  if (
    draft.frozenBody !== null &&
    draft.frozenBody !== freezeNativeCreateBody(draft)
  )
    throw new Error(
      "The saved request has changed. Keep this draft for support; do not start a duplicate attempt.",
    );
  if (draft.uncertain && !draft.frozenBody)
    throw new Error(
      "The saved attempt is incomplete. Keep this draft for support.",
    );
  if (
    draft.result &&
    (!/^QRG-[A-Z0-9]{1,64}$/.test(draft.result.qrCode) ||
      draft.result.permanentPath !== "/i/" + draft.result.qrCode)
  )
    throw new Error("The saved confirmation is invalid.");
  return freezeDraft(draft);
}

export function makeProfileDraftController(
  actorId: string,
  deps: {
    auth: NativeAuth;
    api: NativeApi;
    storage: PersistentStorage;
    randomId(): string;
  },
): NativeProfileDraftController {
  if (!KEY.test(actorId)) throw new Error("Invalid account identity.");
  const storageKey = "qrguitar.profile-draft.v1." + actorId;
  let state: NativeProfileDraftState = { draft: null, busy: false, error: "" };
  let loaded = false;
  let disposed = false;
  const listeners = new Set<(next: NativeProfileDraftState) => void>();
  const emit = (next: NativeProfileDraftState) => {
    if (disposed) return;
    state = Object.freeze(next);
    listeners.forEach((listener) => listener(state));
  };
  const check = (lease: AuthLease) => {
    if (disposed || !deps.auth.isCurrent(lease))
      throw new NativeSessionChangedError();
  };
  const persist = async (draft: NativeProfileDraft, lease: AuthLease) => {
    check(lease);
    await deps.storage.setItem(
      storageKey,
      JSON.stringify({ version: 1, draft }),
    );
    check(lease);
    const saved = freezeDraft(draft);
    emit({ ...state, draft: saved });
    return saved;
  };
  const load = async (lease: AuthLease) => {
    if (loaded) return state.draft;
    const raw = await deps.storage.getItem(storageKey);
    check(lease);
    const draft = raw === null ? null : parseDraft(raw, actorId);
    loaded = true;
    emit({ ...state, draft });
    return draft;
  };
  const run = async <T>(work: (lease: AuthLease) => Promise<T>): Promise<T> => {
    if (disposed) throw new NativeSessionChangedError();
    if (state.busy) throw new Error("A draft request is already in progress.");
    emit({ ...state, busy: true, error: "" });
    try {
      const lease = await deps.auth.acquireSession(actorId);
      return await work(lease);
    } catch (error) {
      const currentActor = deps.auth.getSnapshot().session?.user.id;
      emit({
        ...state,
        ...(currentActor !== actorId ? { draft: null } : {}),
        error:
          currentActor !== actorId
            ? ""
            : error instanceof Error
              ? error.message
              : "The draft request failed. Try again.",
      });
      throw error;
    } finally {
      emit({ ...state, busy: false });
    }
  };
  const save = async (
    input: NativeProfileInput,
    photos: NativePhoto[],
    lease: AuthLease,
  ) => {
    const previous = await load(lease);
    if (previous?.frozenBody || previous?.uncertain)
      throw new Error(
        "Retry the saved attempt before changing this draft. Its result may already exist.",
      );
    if (previous?.result)
      throw new Error(
        "This profile is already created. Clear its confirmed draft to start another.",
      );
    validatePartialNativeProfile(input, photos);
    const copiedInput = {
      ...input,
      showSerialPublic: input.showSerialPublic === true,
    };
    const copiedPhotos = photos.map((photo) => ({ ...photo }));
    const samePhotos =
      previous &&
      previous.photos.length === photos.length &&
      photos.every(
        (photo, index) =>
          photo.id === previous.photos[index].id &&
          photo.dataUrl === previous.photos[index].dataUrl,
      );
    const uploadFileIds = photos.map((photo) => {
      const priorIndex =
        previous?.photos.findIndex(
          (prior) => prior.id === photo.id && prior.dataUrl === photo.dataUrl,
        ) ?? -1;
      return priorIndex >= 0 ? previous!.uploadFileIds[priorIndex] : photo.id;
    });
    return persist(
      {
        actorId,
        input: copiedInput,
        photos: copiedPhotos,
        uploadFileIds,
        uploadId: previous?.uploadId || deps.randomId(),
        idempotencyKey: previous?.idempotencyKey || deps.randomId(),
        stagedPaths: samePhotos ? [...previous.stagedPaths] : [],
        frozenBody: null,
        uncertain: false,
        result: null,
      },
      lease,
    );
  };
  // Returning to another account never exposes this account's in-memory draft.
  const unsubscribeAuth = deps.auth.subscribe((snapshot) => {
    if (snapshot.session?.user.id !== actorId) {
      loaded = false;
      emit({ ...state, draft: null, error: "" });
    }
  });
  return {
    subscribe(listener) {
      if (disposed) throw new NativeSessionChangedError();
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getState: () => state,
    loadDraft: () => run((lease) => load(lease)),
    saveDraft: (input, photos) => run((lease) => save(input, photos, lease)),
    createOrRetry: (input, photos) =>
      run(async (lease) => {
        let draft = await load(lease);
        if (draft?.result) return draft.result;
        if (input || photos) {
          if (!input || !photos)
            throw new Error(
              "Provide the profile and all selected photos together.",
            );
          draft = await save(input, photos, lease);
        }
        if (!draft) throw new Error("Add profile details and a photo first.");
        validateNativeProfile(draft.input, draft.photos);
        if (!draft.frozenBody) {
          for (
            let index = draft.stagedPaths.length;
            index < draft.photos.length;
            index++
          ) {
            const path = await deps.api.uploadPhoto(
              actorId,
              draft.uploadId,
              draft.photos[index].dataUrl,
              index,
              draft.uploadFileIds[index],
            );
            check(lease);
            draft = await persist(
              { ...draft, stagedPaths: [...draft.stagedPaths, path] },
              lease,
            );
          }
          draft = await persist(
            { ...draft, frozenBody: freezeNativeCreateBody(draft) },
            lease,
          );
        }
        const wasUncertain = draft.uncertain;
        // Persist before dispatch. A crash at any later point always resumes the same request identity/body.
        draft = await persist({ ...draft, uncertain: true }, lease);
        let result: NativeCreateResult;
        try {
          result = await deps.api.createProfile(actorId, draft.frozenBody!);
          check(lease);
        } catch (error) {
          check(lease);
          const reset =
            error instanceof NativeApiError &&
            error.status === 409 &&
            error.code === "upload_session_changed" &&
            error.resetUploads;
          if (reset) {
            await persist(
              {
                ...draft,
                uploadFileIds: draft.photos.map(() => deps.randomId()),
                stagedPaths: [],
                frozenBody: null,
                uncertain: false,
              },
              lease,
            );
          } else if (
            !wasUncertain &&
            error instanceof NativeApiError &&
            !error.uncertain &&
            error.status >= 400 &&
            error.status < 500 &&
            ![
              "create_request_conflict",
              "legacy_request_needs_review",
            ].includes(error.code)
          ) {
            // A first attempt's definitive rejection can be edited. An earlier unknown result stays frozen.
            await persist(
              { ...draft, frozenBody: null, uncertain: false },
              lease,
            );
          }
          throw error;
        }
        const confirmed = { ...draft, result, uncertain: false };
        try {
          await persist(confirmed, lease);
        } catch {
          check(lease);
          // The server confirmation is authoritative. The durable frozen request safely replays if local save failed.
          emit({
            ...state,
            draft: freezeDraft(confirmed),
            error:
              "Profile created. Local confirmation could not be saved; retry this same draft if it reappears.",
          });
        }
        return result;
      }),
    discardDraft: () =>
      run(async (lease) => {
        const draft = await load(lease);
        if (draft?.uncertain)
          throw new Error(
            "This save is unconfirmed. Retry the existing attempt before discarding it.",
          );
        await deps.storage.removeItem(storageKey);
        check(lease);
        loaded = true;
        emit({ ...state, draft: null });
        // Staged files are not deleted here. An uncertain server outcome must never lose its media.
      }),
    dispose() {
      disposed = true;
      unsubscribeAuth();
      listeners.clear();
      loaded = false;
      state = { draft: null, busy: false, error: "" };
    },
  };
}
const controllers = new Map<string, NativeProfileDraftController>();
export function createProfileDraftController(
  actorId: string,
): NativeProfileDraftController {
  let controller = controllers.get(actorId);
  if (!controller) {
    controller = makeProfileDraftController(actorId, {
      auth: getNativeAuth(),
      api: getNativeApi(),
      storage: getNativeStorage(),
      randomId: () => Crypto.randomUUID(),
    });
    const originalDispose = controller.dispose.bind(controller);
    controller.dispose = () => {
      originalDispose();
      if (controllers.get(actorId) === controller) controllers.delete(actorId);
    };
    controllers.set(actorId, controller);
  }
  return controller;
}
