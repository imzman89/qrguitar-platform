import { Platform } from "react-native";
import {
  getNativeAuth,
  NativeSessionChangedError,
  type AuthLease,
  type NativeAuth,
} from "./auth";
import {
  getNativeRuntimeEnvironment,
  runtimeFetch,
} from "./runtime-environment";

export type NativeInstrument = {
  qrCode: string;
  permanentPath: string;
  name: string;
  brand: string;
  model: string;
  serial: string;
  serialNotUsed?: boolean;
  year: string;
  summary: string;
  owner: string;
  visibility: "private" | "unlisted" | "public";
  location: string;
  instrumentType?: string;
  builder?: string;
  finish?: string;
  createdAt?: string;
  heroImageDataUrl?: string;
  galleryImageDataUrls: string[];
  customFields: { id: string; label: string; value: string }[];
  customLinks: { id: string; label: string; url: string }[];
  timelineEvents: {
    id: string;
    title: string;
    serviceDate?: string;
    category?: string;
    publicDescription?: string;
    privateNotes?: string;
    shopName?: string;
    isPublic: boolean;
  }[];
  documentFiles: {
    id?: string;
    name: string;
    url: string;
    mimeType?: string;
    visibility?: "public" | "hidden";
    publicDescription?: string;
  }[];
  verificationStatus: "verified" | "unverified";
  authenticityStatus: "confirmed" | "unconfirmed";
  showVerificationBadge?: boolean;
  showAuthenticityBadge?: boolean;
  showSerialPublic?: boolean;
  publicVerificationNote?: string;
  publicAuthenticityNote?: string;
  safetyStatus: "clear" | "lost" | "stolen" | "recovered";
  publicSafetyNote?: string;
  instrumentCondition?: "new" | "used";
  saleStatus?: "for_sale" | "not_for_sale";
  ownershipTransferCount?: number;
};
export class NativeApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryable: boolean;
  readonly uncertain: boolean;
  readonly fieldErrors: Record<string, string>;
  readonly resetUploads: boolean;
  constructor(
    message: string,
    details: {
      status?: number;
      code?: string;
      retryable?: boolean;
      uncertain?: boolean;
      fieldErrors?: Record<string, string>;
      resetUploads?: boolean;
    } = {},
  ) {
    super(message);
    this.name = "NativeApiError";
    this.status = details.status || 0;
    this.code = details.code || "request_failed";
    this.retryable = details.retryable ?? false;
    this.uncertain = details.uncertain ?? false;
    this.fieldErrors = details.fieldErrors || {};
    this.resetUploads = details.resetUploads === true;
  }
}
export function resolveNativeApiOrigin(
  configured: string | undefined,
  development: boolean,
  platform: string,
): string {
  if (!configured) return "https://www.qrguitar.com";
  const value = configured.replace(/\/$/, "");
  if (value === "https://qrguitar.com" || value === "https://www.qrguitar.com")
    return "https://www.qrguitar.com";
  if (development && platform === "web" && value === "http://127.0.0.1:3014")
    return value;
  throw new NativeApiError("This build has an invalid QRguitar API origin.", {
    code: "invalid_configuration",
  });
}
export function safeNativeReferenceUrl(value: unknown): string | undefined {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > 12000 ||
    /[\u0000-\u0020\u007f\\]/.test(value)
  )
    return undefined;
  try {
    if (value.startsWith("//")) return undefined;
    const url = new URL(value, "https://qrguitar.com");
    if (url.protocol !== "https:" || url.username || url.password || url.port)
      return undefined;
    const host = url.hostname.toLowerCase();
    // Image/link requests never carry a bearer token. Reject local-network and non-web schemes.
    if (
      !host.includes(".") ||
      /^(?:\d+\.){3}\d+$/.test(host) ||
      host.includes(":") ||
      /\.(?:localhost|local|internal|test|invalid)$/.test(host)
    )
      return undefined;
    if (!value.startsWith("https://") && !value.startsWith("/"))
      return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}
export function safeNativeImageUrl(value: unknown): string | undefined {
  // Server records use signed HTTPS URLs. Local picker previews are handled separately as validated data URLs.
  return safeNativeReferenceUrl(value);
}
const codePattern = /^QRG-[A-Z0-9]{1,64}$/;
export function normalizeNativeCode(value: string): string {
  const code = value.trim().toUpperCase();
  if (!codePattern.test(code))
    throw new NativeApiError("Enter a valid QRguitar ID.", {
      code: "invalid_code",
    });
  return code;
}
const recordObject = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new NativeApiError(
      "The server returned an unreadable response. Try again.",
      { code: "invalid_response", retryable: true },
    );
  return value as Record<string, unknown>;
};
const string = (value: unknown) => (typeof value === "string" ? value : "");
const array = (value: unknown): unknown[] => {
  if (value == null) return [];
  if (!Array.isArray(value))
    throw new NativeApiError("The profile response is incomplete. Try again.", {
      code: "invalid_response",
      retryable: true,
    });
  return value;
};
export function parseNativeInstrument(value: unknown): NativeInstrument {
  const raw = recordObject(value);
  if (
    typeof raw.qrCode !== "string" ||
    !codePattern.test(raw.qrCode) ||
    typeof raw.name !== "string" ||
    typeof raw.brand !== "string" ||
    typeof raw.model !== "string" ||
    !["private", "unlisted", "public"].includes(string(raw.visibility))
  ) {
    throw new NativeApiError("The profile response is incomplete. Try again.", {
      code: "invalid_response",
      retryable: true,
    });
  }
  return {
    qrCode: raw.qrCode,
    permanentPath: "/i/" + raw.qrCode,
    name: raw.name,
    brand: raw.brand,
    model: raw.model,
    serial: string(raw.serial),
    serialNotUsed: raw.serialNotUsed === true,
    year: string(raw.year),
    summary: string(raw.summary),
    owner: string(raw.owner),
    visibility: raw.visibility as NativeInstrument["visibility"],
    location: string(raw.location),
    instrumentType: string(raw.instrumentType),
    builder: string(raw.builder),
    finish: string(raw.finish),
    createdAt: string(raw.createdAt),
    heroImageDataUrl: safeNativeImageUrl(raw.heroImageDataUrl),
    galleryImageDataUrls: array(raw.galleryImageDataUrls)
      .map(safeNativeImageUrl)
      .filter((url): url is string => !!url),
    customFields: array(raw.customFields).map((item) => {
      const entry = recordObject(item);
      return {
        id: string(entry.id),
        label: string(entry.label),
        value: string(entry.value),
      };
    }),
    customLinks: array(raw.customLinks).flatMap((item) => {
      const entry = recordObject(item);
      const url = safeNativeReferenceUrl(entry.url);
      return url
        ? [{ id: string(entry.id), label: string(entry.label), url }]
        : [];
    }),
    timelineEvents: array(raw.timelineEvents ?? raw.serviceEvents).map(
      (item) => {
        const entry = recordObject(item);
        return {
          id: string(entry.id),
          title: string(entry.title),
          serviceDate: string(entry.serviceDate),
          category: string(entry.category),
          publicDescription: string(entry.publicDescription),
          privateNotes: string(entry.privateNotes),
          shopName: string(entry.shopName),
          isPublic: entry.isPublic === true,
        };
      },
    ),
    documentFiles: array(raw.documentFiles).map((item) => {
      const entry = recordObject(item);
      return {
        id: string(entry.id) || undefined,
        name: string(entry.name),
        url: safeNativeReferenceUrl(entry.url) || "",
        mimeType: string(entry.mimeType),
        visibility: entry.visibility === "hidden" ? "hidden" : "public",
        publicDescription: string(entry.publicDescription),
      };
    }),
    verificationStatus:
      raw.verificationStatus === "verified" ? "verified" : "unverified",
    authenticityStatus:
      raw.authenticityStatus === "confirmed" ? "confirmed" : "unconfirmed",
    showVerificationBadge: raw.showVerificationBadge !== false,
    showAuthenticityBadge: raw.showAuthenticityBadge !== false,
    showSerialPublic: raw.showSerialPublic === true,
    publicVerificationNote: string(raw.publicVerificationNote),
    publicAuthenticityNote: string(raw.publicAuthenticityNote),
    safetyStatus: ["lost", "stolen", "recovered"].includes(
      string(raw.safetyStatus),
    )
      ? (raw.safetyStatus as NativeInstrument["safetyStatus"])
      : "clear",
    publicSafetyNote: string(raw.publicSafetyNote),
    instrumentCondition: raw.instrumentCondition === "new" ? "new" : "used",
    saleStatus: raw.saleStatus === "for_sale" ? "for_sale" : "not_for_sale",
    ownershipTransferCount:
      typeof raw.ownershipTransferCount === "number"
        ? raw.ownershipTransferCount
        : undefined,
  };
}
export const MAX_NATIVE_UPLOAD_BYTES = 12 * 1024 * 1024;
export function validateNativeSignedUploadUrl(
  value: unknown,
  storageOrigin: string | undefined,
  storagePath: string,
): string {
  try {
    if (typeof value !== "string" || !storageOrigin) throw new Error();
    const origin = new URL(storageOrigin);
    const url = new URL(value);
    if (
      origin.protocol !== "https:" ||
      origin.username ||
      origin.password ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash ||
      origin.port
    )
      throw new Error();
    if (
      url.protocol !== "https:" ||
      url.origin !== origin.origin ||
      url.username ||
      url.password ||
      url.hash ||
      decodeURIComponent(url.pathname) !==
        "/storage/v1/object/upload/sign/instrument-media/" + storagePath
    )
      throw new Error();
    const params = [...url.searchParams.entries()];
    if (params.length !== 1 || params[0][0] !== "token" || !params[0][1])
      throw new Error();
    return url.href;
  } catch {
    throw new NativeApiError(
      "The secure photo upload address is invalid. Try again.",
      { code: "invalid_upload_response", retryable: true },
    );
  }
}
export type NativeCreateResult = {
  qrCode: string;
  permanentPath: string;
  message: string;
};
export interface NativeApi {
  listPublic(signal?: AbortSignal): Promise<NativeInstrument[]>;
  readPublic(code: string, signal?: AbortSignal): Promise<NativeInstrument>;
  listMine(signal?: AbortSignal): Promise<NativeInstrument[]>;
  readMine(code: string, signal?: AbortSignal): Promise<NativeInstrument>;
  uploadPhoto(
    actorId: string,
    uploadId: string,
    dataUrl: string,
    index: number,
    fileId: string,
  ): Promise<string>;
  createProfile(
    actorId: string,
    frozenBody: string,
  ): Promise<NativeCreateResult>;
}
export function createNativeApi(deps: {
  auth: NativeAuth;
  fetch: typeof fetch;
  origin: string;
  storageOrigin?: string;
  timeoutMs?: number;
}): NativeApi {
  const request = async (
    path: string,
    options: {
      owner?: boolean;
      actorId?: string;
      signal?: AbortSignal;
      body?: string;
      create?: boolean;
    } = {},
  ) => {
    let lease: AuthLease | undefined;
    if (options.owner) lease = await deps.auth.acquireSession(options.actorId);
    if (lease && !deps.auth.isCurrent(lease))
      throw new NativeSessionChangedError();
    const controller = new AbortController();
    const abort = () => controller.abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) controller.abort();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let sent = false;
    const check = () => {
      if (lease && !deps.auth.isCurrent(lease))
        throw new NativeSessionChangedError();
    };
    try {
      const operation = (async () => {
        if (controller.signal.aborted)
          throw new NativeApiError("Request cancelled.", { code: "cancelled" });
        sent = true;
        const response = await deps.fetch(deps.origin + path, {
          method: options.body === undefined ? "GET" : "POST",
          headers: {
            Accept: "application/json",
            ...(options.body === undefined
              ? {}
              : { "Content-Type": "application/json" }),
            ...(lease ? { Authorization: "Bearer " + lease.accessToken } : {}),
          },
          body: options.body,
          signal: controller.signal,
          redirect: "error",
          credentials: "omit",
          cache: "no-store",
        });
        check();
        if (
          response.redirected ||
          (response.url && new URL(response.url).origin !== deps.origin)
        )
          throw new Error("Unexpected API redirect.");
        const raw = recordObject(await response.json());
        check();
        if (!response.ok || raw.ok !== true) {
          const fieldErrors: Record<string, string> = {};
          if (raw.fieldErrors && typeof raw.fieldErrors === "object")
            for (const [key, value] of Object.entries(raw.fieldErrors))
              if (typeof value === "string") fieldErrors[key] = value;
          const resetUploads =
            response.status === 409 &&
            raw.ok === false &&
            raw.code === "upload_session_changed" &&
            raw.resetUploads === true &&
            raw.uncertain !== true;
          throw new NativeApiError(
            string(raw.message) ||
              "The request could not be completed. Try again.",
            {
              status: response.status,
              code: string(raw.code) || "request_failed",
              retryable: raw.retryable === true || response.status >= 500,
              uncertain:
                options.create === true &&
                !resetUploads &&
                (response.status < 400 ||
                  response.status >= 500 ||
                  raw.uncertain === true ||
                  raw.code === "legacy_request_needs_review" ||
                  raw.code === "create_request_conflict"),
              fieldErrors,
              resetUploads,
            },
          );
        }
        return raw;
      })();
      return await Promise.race([
        operation,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(
              new NativeApiError(
                "The request timed out. Check your connection and try again.",
                {
                  code: "timeout",
                  retryable: true,
                  uncertain: options.create === true && sent,
                },
              ),
            );
          }, deps.timeoutMs ?? 25000);
        }),
      ]);
    } catch (error) {
      check();
      if (error instanceof NativeSessionChangedError) throw error;
      if (error instanceof NativeApiError) {
        if (options.create && sent && error.code === "invalid_response")
          throw new NativeApiError(
            "The save response could not be confirmed. Retry this saved attempt.",
            { code: "create_unconfirmed", retryable: true, uncertain: true },
          );
        throw error;
      }
      throw new NativeApiError(
        options.create
          ? "The save response could not be confirmed. Retry this saved attempt to check the result."
          : "QRguitar could not be reached. Check your connection and try again.",
        {
          code: "network_error",
          retryable: true,
          uncertain: options.create === true && sent,
        },
      );
    } finally {
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
    }
  };
  const list = async (owner: boolean, signal?: AbortSignal) => {
    const raw = await request(
      "/api/instruments" + (owner ? "?scope=mine" : ""),
      { owner, signal },
    );
    if (
      !Array.isArray(raw.instruments) ||
      (typeof raw.count === "number" && raw.count !== raw.instruments.length)
    )
      throw new NativeApiError(
        "The collection response is incomplete. Try again.",
        { code: "invalid_response", retryable: true },
      );
    const records = raw.instruments.map(parseNativeInstrument);
    if (!owner && records.some((record) => record.visibility !== "public"))
      throw new NativeApiError(
        "The catalog response contains a restricted profile. Try again.",
        { code: "invalid_response", retryable: true },
      );
    if (new Set(records.map((record) => record.qrCode)).size !== records.length)
      throw new NativeApiError(
        "The collection response contains duplicate records. Try again.",
        { code: "invalid_response", retryable: true },
      );
    return records;
  };
  const read = async (code: string, owner: boolean, signal?: AbortSignal) => {
    const normalized = normalizeNativeCode(code);
    const raw = await request(
      "/api/instruments?" +
        (owner ? "scope=mine&" : "") +
        "code=" +
        encodeURIComponent(normalized),
      { owner, signal },
    );
    const instrument = parseNativeInstrument(raw.instrument);
    if (!owner && instrument.visibility === "private")
      throw new NativeApiError(
        "The public response contains a private profile. Try again.",
        { code: "invalid_response", retryable: true },
      );
    if (owner && instrument.qrCode !== normalized)
      throw new NativeApiError(
        "The server returned a different profile. Try again.",
        { code: "invalid_response", retryable: true },
      );
    return instrument;
  };
  return {
    listPublic: (signal) => list(false, signal),
    readPublic: (code, signal) => read(code, false, signal),
    listMine: (signal) => list(true, signal),
    readMine: (code, signal) => read(code, true, signal),
    async uploadPhoto(actorId, uploadId, dataUrl, _index, fileId) {
      const image =
        /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(
          dataUrl,
        );
      const encoded = image?.[2];
      const byteCount = encoded
        ? (encoded.length / 4) * 3 -
          (encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0)
        : Infinity;
      if (
        !image ||
        !encoded ||
        encoded.length % 4 !== 0 ||
        byteCount < 12 ||
        byteCount > MAX_NATIVE_UPLOAD_BYTES
      )
        throw new NativeApiError(
          "Choose a valid photo no larger than 12 MiB.",
          { code: "photo_too_large" },
        );
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          fileId,
        ) ||
        !/^[a-zA-Z0-9-]{12,80}$/.test(uploadId)
      )
        throw new NativeApiError("The saved photo identity is invalid.", {
          code: "invalid_upload",
        });
      const mimeType = image[1];
      const extension =
        mimeType === "image/jpeg"
          ? "jpg"
          : mimeType === "image/png"
            ? "png"
            : "webp";
      const storagePath =
        actorId +
        "/profile-uploads/" +
        uploadId +
        "/image-" +
        fileId.toLowerCase() +
        "." +
        extension;
      const lease = await deps.auth.acquireSession(actorId);
      const check = () => {
        if (!deps.auth.isCurrent(lease)) throw new NativeSessionChangedError();
      };
      const metadata = {
        uploadId,
        fileId: fileId.toLowerCase(),
        kind: "image",
        mimeType,
        size: byteCount,
        expectedOwnerId: actorId,
      };
      const handshake = async (action: "prepare" | "complete") => {
        check();
        const raw = await request("/api/instruments/uploads", {
          owner: true,
          actorId,
          body: JSON.stringify({ action, ...metadata }),
        });
        check();
        if (
          raw.storagePath !== storagePath ||
          raw.kind !== "image" ||
          !["upload", "complete"].includes(string(raw.phase)) ||
          (action === "complete" && raw.phase !== "complete")
        )
          throw new NativeApiError(
            "The photo upload could not be confirmed. Retry this saved photo.",
            { code: "invalid_upload_response", retryable: true },
          );
        return raw;
      };
      const prepared = await handshake("prepare");
      if (prepared.phase === "complete") return storagePath;
      const signedUrl = validateNativeSignedUploadUrl(
        prepared.signedUrl,
        deps.storageOrigin,
        storagePath,
      );
      const binary = globalThis.atob(encoded);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index++)
        bytes[index] = binary.charCodeAt(index);
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        check();
        const upload = deps.fetch(signedUrl, {
          method: "PUT",
          headers: { "Content-Type": mimeType, "x-upsert": "false" },
          body: bytes.buffer,
          signal: controller.signal,
          redirect: "error",
          credentials: "omit",
        });
        const response = await Promise.race([
          upload,
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => {
              controller.abort();
              reject(new Error("Photo upload timed out."));
            }, deps.timeoutMs ?? 60000);
          }),
        ]);
        check();
        if (
          response.redirected ||
          (response.url &&
            new URL(response.url).origin !== new URL(signedUrl).origin)
        )
          throw new NativeApiError(
            "The secure upload was redirected. Try again.",
            { code: "invalid_upload_response", retryable: true },
          );
        // Complete is authoritative even when PUT's response was lost or says the stable object already exists.
      } catch (error) {
        check();
        if (error instanceof NativeApiError) throw error;
      } finally {
        if (timer) clearTimeout(timer);
      }
      await handshake("complete");
      return storagePath;
    },
    async createProfile(actorId, frozenBody) {
      const raw = await request("/api/instruments", {
        owner: true,
        actorId,
        body: frozenBody,
        create: true,
      });
      if (
        typeof raw.qrCode !== "string" ||
        !codePattern.test(raw.qrCode) ||
        raw.permanentPath !== "/i/" + raw.qrCode
      )
        throw new NativeApiError(
          "The saved profile response could not be confirmed. Retry this attempt.",
          { code: "create_unconfirmed", retryable: true, uncertain: true },
        );
      return {
        qrCode: raw.qrCode,
        permanentPath: raw.permanentPath,
        message: string(raw.message) || "Profile created.",
      };
    },
  };
}
let nativeApi: NativeApi | undefined;
export function getNativeApi(): NativeApi {
  if (!nativeApi) {
    const environment = getNativeRuntimeEnvironment();
    nativeApi = createNativeApi({
      auth: getNativeAuth(),
      fetch: runtimeFetch(
        environment,
        globalThis.fetch.bind(globalThis),
        Platform.OS,
      ),
      storageOrigin: environment.supabaseUrl,
      origin: resolveNativeApiOrigin(
        environment.apiOrigin,
        typeof __DEV__ !== "undefined" && __DEV__,
        Platform.OS,
      ),
    });
  }
  return nativeApi;
}
