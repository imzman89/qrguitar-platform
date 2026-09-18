export const OPTIONAL_TRACKING_CONSENT_EVENT = "qrguitar:optional-tracking-consent";
export const OPTIONAL_TRACKING_PRODUCT_EVENT = "qrguitar:optional-tracking-product-event";
export const OPTIONAL_TRACKING_CONSENT_STORAGE_PREFIX = "qrguitar.optionalTrackingConsent.v1";
const OPTIONAL_TRACKING_DEDUPE_STORAGE_PREFIX = "qrguitar.optionalTrackingEvents.v1";
const MAX_DEDUPE_MARKERS = 128;

export const optionalTrackingPurposes = ["analytics", "advertising"] as const;
export type OptionalTrackingPurpose = (typeof optionalTrackingPurposes)[number];

// Canonical provider-neutral names. qrLandingViewed stays reserved until a
// trustworthy QR-origin marker exists; the dispatcher deliberately rejects it.
export const optionalTrackingProductEvents = {
  publicProfileViewed: "public_profile_viewed",
  qrLandingViewed: "qr_landing_viewed",
  registrationCompleted: "account_registration_completed",
  profileCreated: "profile_creation_completed",
  checkoutStarted: "credit_checkout_started",
  purchaseCompleted: "credit_purchase_completed",
  ownershipTransferCompleted: "ownership_transfer_completed"
} as const;
export type OptionalTrackingProductEvent =
  (typeof optionalTrackingProductEvents)[keyof typeof optionalTrackingProductEvents];
export type OptionalTrackingDecision = "accepted" | "denied";
export type OptionalTrackingConsentStatus = "not-configured" | "pending" | OptionalTrackingDecision;

type ProfileVisibility = "public" | "unlisted" | "private";
type RegistrationConfirmation = "email_pending" | "session_ready";
type CreditPackSize = 1 | 10 | 25;
type CreditPackValueUsd = 12 | 50 | 99;
type TransferMethod = "email_link" | "buyer_code" | "review";

export type OptionalTrackingProductEventInput =
  | Readonly<{ name: typeof optionalTrackingProductEvents.publicProfileViewed; properties: Readonly<{ visibility: Exclude<ProfileVisibility, "private"> }> }>
  | Readonly<{ name: typeof optionalTrackingProductEvents.registrationCompleted; properties: Readonly<{ confirmation: RegistrationConfirmation }> }>
  | Readonly<{ name: typeof optionalTrackingProductEvents.profileCreated; properties: Readonly<{ visibility: ProfileVisibility }> }>
  | Readonly<{ name: typeof optionalTrackingProductEvents.checkoutStarted; properties: Readonly<{ credits: CreditPackSize; valueUsd: CreditPackValueUsd }> }>
  | Readonly<{ name: typeof optionalTrackingProductEvents.purchaseCompleted; properties: Readonly<{ credits: CreditPackSize; valueUsd: CreditPackValueUsd }> }>
  | Readonly<{ name: typeof optionalTrackingProductEvents.ownershipTransferCompleted; properties: Readonly<{ method: TransferMethod }> }>;

export type OptionalTrackingProductEventDetail = OptionalTrackingProductEventInput;

export type OptionalTrackingConfig = Readonly<{
  enabled: boolean;
  purposes: readonly OptionalTrackingPurpose[];
}>;

export type OptionalTrackingConsentState = Readonly<{
  status: OptionalTrackingConsentStatus;
  purposes: readonly OptionalTrackingPurpose[];
}>;

export type OptionalTrackingConsentEventDetail = Readonly<{
  decision: OptionalTrackingDecision;
  purposes: readonly OptionalTrackingPurpose[];
}>;

export interface OptionalTrackingStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface OptionalTrackingEventTarget {
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
  dispatchEvent(event: Event): boolean;
}

export type OptionalTrackingRuntime = Readonly<{
  config?: OptionalTrackingConfig;
  storage?: OptionalTrackingStorage | null;
  dedupeStorage?: OptionalTrackingStorage | null;
  eventTarget?: OptionalTrackingEventTarget | null;
}>;

export type OptionalTrackingCleanup = () => void | Promise<void>;
export type OptionalTrackingLoader = () => void | OptionalTrackingCleanup | Promise<void | OptionalTrackingCleanup>;

const pageDeniedConfigurations = new Set<string>();
const inMemoryEventDedupe = new Set<string>();

function browserStorage(): OptionalTrackingStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function browserDedupeStorage(): OptionalTrackingStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function browserEventTarget(): OptionalTrackingEventTarget | null {
  return typeof window === "undefined" ? null : window;
}

export function parseOptionalTrackingConfig(raw: string | undefined): OptionalTrackingConfig {
  const requested = (raw || "")
    .split(",")
    .map((purpose) => purpose.trim().toLowerCase())
    .filter(Boolean);

  if (!requested.length || requested.some((purpose) => !optionalTrackingPurposes.includes(purpose as OptionalTrackingPurpose))) {
    return { enabled: false, purposes: [] };
  }

  const purposes = optionalTrackingPurposes.filter((purpose) => requested.includes(purpose));
  return { enabled: purposes.length > 0, purposes };
}

export const configuredOptionalTracking = parseOptionalTrackingConfig(
  process.env.NEXT_PUBLIC_OPTIONAL_TRACKING_PURPOSES
);

export function optionalTrackingConsentStorageKey(config: OptionalTrackingConfig = configuredOptionalTracking) {
  return `${OPTIONAL_TRACKING_CONSENT_STORAGE_PREFIX}.${config.purposes.join("-")}`;
}

function optionalTrackingDedupeStorageKey(config: OptionalTrackingConfig) {
  return `${OPTIONAL_TRACKING_DEDUPE_STORAGE_PREFIX}.${config.purposes.join("-")}`;
}

function runtimeConfig(runtime?: OptionalTrackingRuntime) {
  return runtime?.config || configuredOptionalTracking;
}

function runtimeStorage(runtime?: OptionalTrackingRuntime) {
  return runtime && "storage" in runtime ? runtime.storage || null : browserStorage();
}

function runtimeDedupeStorage(runtime?: OptionalTrackingRuntime) {
  return runtime && "dedupeStorage" in runtime ? runtime.dedupeStorage || null : browserDedupeStorage();
}

function runtimeEventTarget(runtime?: OptionalTrackingRuntime) {
  return runtime && "eventTarget" in runtime ? runtime.eventTarget || null : browserEventTarget();
}

function readStoredDecision(config: OptionalTrackingConfig, storage: OptionalTrackingStorage | null) {
  if (!config.enabled || !storage) return null;
  try {
    const value = storage.getItem(optionalTrackingConsentStorageKey(config));
    return value === "accepted" || value === "denied" ? value : null;
  } catch {
    return null;
  }
}

export function readOptionalTrackingConsent(runtime?: OptionalTrackingRuntime): OptionalTrackingConsentState {
  const config = runtimeConfig(runtime);
  if (!config.enabled) return { status: "not-configured", purposes: [] };
  if (pageDeniedConfigurations.has(optionalTrackingConsentStorageKey(config))) {
    return { status: "denied", purposes: config.purposes };
  }
  return {
    status: readStoredDecision(config, runtimeStorage(runtime)) || "pending",
    purposes: config.purposes
  };
}

export function canUseOptionalTracking(purpose: OptionalTrackingPurpose, runtime?: OptionalTrackingRuntime) {
  const state = readOptionalTrackingConsent(runtime);
  return state.status === "accepted" && state.purposes.includes(purpose);
}

function createDetailEvent<T>(name: string, detail: T) {
  if (typeof CustomEvent === "function") return new CustomEvent<T>(name, { detail });
  const event = new Event(name) as Event & { detail: T };
  Object.defineProperty(event, "detail", { value: detail });
  return event;
}

function clearEventDedupe(config: OptionalTrackingConfig, runtime?: OptionalTrackingRuntime) {
  const scope = `${config.purposes.join("-")}:`;
  for (const value of inMemoryEventDedupe) if (value.startsWith(scope)) inMemoryEventDedupe.delete(value);
  try {
    runtimeDedupeStorage(runtime)?.setItem(optionalTrackingDedupeStorageKey(config), "[]");
  } catch {
    // Withdrawal still gates dispatch and provider activation when storage is blocked.
  }
}

export function saveOptionalTrackingConsent(decision: OptionalTrackingDecision, runtime?: OptionalTrackingRuntime) {
  const config = runtimeConfig(runtime);
  const storage = runtimeStorage(runtime);
  if (!config.enabled) return false;
  const key = optionalTrackingConsentStorageKey(config);

  if (decision === "denied") pageDeniedConfigurations.add(key);
  let persisted = false;
  if (storage) {
    try {
      storage.setItem(key, decision);
      persisted = storage.getItem(key) === decision;
    } catch {
      persisted = false;
    }
  }

  if (decision === "accepted") {
    if (!persisted) return false;
    pageDeniedConfigurations.delete(key);
  } else {
    clearEventDedupe(config, runtime);
  }

  runtimeEventTarget(runtime)?.dispatchEvent(createDetailEvent(OPTIONAL_TRACKING_CONSENT_EVENT, { decision, purposes: config.purposes }));
  return persisted;
}

export function subscribeToOptionalTrackingConsent(
  listener: (state: OptionalTrackingConsentState) => void,
  runtime?: OptionalTrackingRuntime
) {
  const target = runtimeEventTarget(runtime);
  if (!target) return () => {};

  const update: EventListener = () => listener(readOptionalTrackingConsent(runtime));
  const storageUpdate: EventListener = (event) => {
    const config = runtimeConfig(runtime);
    const key = "key" in event ? (event as StorageEvent).key : null;
    if (key === null || key === optionalTrackingConsentStorageKey(config)) update(event);
  };
  target.addEventListener(OPTIONAL_TRACKING_CONSENT_EVENT, update);
  target.addEventListener("storage", storageUpdate);
  return () => {
    target.removeEventListener(OPTIONAL_TRACKING_CONSENT_EVENT, update);
    target.removeEventListener("storage", storageUpdate);
  };
}

function runCleanup(cleanup: OptionalTrackingCleanup | undefined) {
  if (!cleanup) return;
  try {
    void Promise.resolve(cleanup()).catch(() => {
      // A provider cleanup failure must remain isolated from the product experience.
    });
  } catch {
    // A provider cleanup failure must remain isolated from the product experience.
  }
}

export function activateOptionalTracking(
  purpose: OptionalTrackingPurpose,
  load: OptionalTrackingLoader,
  runtime?: OptionalTrackingRuntime
) {
  let subscribed = true;
  let generation = 0;
  let loading = false;
  let loaded = false;
  let cleanup: OptionalTrackingCleanup | undefined;

  const deactivate = () => {
    generation++;
    loading = false;
    if (cleanup) {
      const current = cleanup;
      cleanup = undefined;
      loaded = false;
      runCleanup(current);
    }
  };

  const reconcile = () => {
    if (!subscribed) return;
    if (!canUseOptionalTracking(purpose, runtime)) {
      deactivate();
      return;
    }
    if (loading || loaded) return;
    const attempt = ++generation;
    loading = true;
    try {
      void Promise.resolve(load()).then((result) => {
        const returnedCleanup = typeof result === "function" ? result : undefined;
        if (!subscribed || attempt !== generation || !canUseOptionalTracking(purpose, runtime)) {
          runCleanup(returnedCleanup);
          return;
        }
        cleanup = returnedCleanup;
        loading = false;
        loaded = true;
      }).catch(() => {
        if (attempt === generation) loading = false;
      });
    } catch {
      if (attempt === generation) loading = false;
    }
  };

  reconcile();
  const unsubscribe = subscribeToOptionalTrackingConsent(reconcile, runtime);
  return () => {
    if (!subscribed) return;
    subscribed = false;
    deactivate();
    unsubscribe();
  };
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const present = Object.keys(value).sort();
  const expected = [...keys].sort();
  return present.length === expected.length && expected.every((key, index) => key === present[index]);
}

function productEventDetail(value: unknown): OptionalTrackingProductEventDetail | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as { name?: unknown; properties?: unknown };
  if (!exactKeys(input as Record<string, unknown>, ["name", "properties"]) || !input.properties || typeof input.properties !== "object" || Array.isArray(input.properties)) return null;
  const properties = input.properties as Record<string, unknown>;
  const name = input.name;

  if (name === optionalTrackingProductEvents.publicProfileViewed && exactKeys(properties, ["visibility"]) && ["public", "unlisted"].includes(properties.visibility as string)) {
    return Object.freeze({ name, properties: Object.freeze({ visibility: properties.visibility as "public" | "unlisted" }) });
  }
  if (name === optionalTrackingProductEvents.registrationCompleted && exactKeys(properties, ["confirmation"]) && ["email_pending", "session_ready"].includes(properties.confirmation as string)) {
    return Object.freeze({ name, properties: Object.freeze({ confirmation: properties.confirmation as RegistrationConfirmation }) });
  }
  if (name === optionalTrackingProductEvents.profileCreated && exactKeys(properties, ["visibility"]) && ["public", "unlisted", "private"].includes(properties.visibility as string)) {
    return Object.freeze({ name, properties: Object.freeze({ visibility: properties.visibility as ProfileVisibility }) });
  }
  if ((name === optionalTrackingProductEvents.checkoutStarted || name === optionalTrackingProductEvents.purchaseCompleted)
    && exactKeys(properties, ["credits", "valueUsd"])
    && typeof properties.credits === "number" && typeof properties.valueUsd === "number"
    && [1, 10, 25].includes(properties.credits) && [12, 50, 99].includes(properties.valueUsd)) {
    const expectedValue = { 1: 12, 10: 50, 25: 99 }[properties.credits as CreditPackSize];
    if (properties.valueUsd !== expectedValue) return null;
    return Object.freeze({ name, properties: Object.freeze({ credits: properties.credits as CreditPackSize, valueUsd: properties.valueUsd as CreditPackValueUsd }) }) as OptionalTrackingProductEventDetail;
  }
  if (name === optionalTrackingProductEvents.ownershipTransferCompleted && exactKeys(properties, ["method"]) && ["email_link", "buyer_code", "review"].includes(properties.method as string)) {
    return Object.freeze({ name, properties: Object.freeze({ method: properties.method as TransferMethod }) });
  }
  return null;
}

async function dedupeDigest(value: string) {
  try {
    if (!globalThis.crypto?.subtle) return null;
    const bytes = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(bytes), (item) => item.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

async function firstEventForKey(name: OptionalTrackingProductEventInput["name"], key: string, runtime?: OptionalTrackingRuntime) {
  const config = runtimeConfig(runtime);
  const rawMemoryKey = `${config.purposes.join("-")}:${name}:${key}`;
  if (inMemoryEventDedupe.has(rawMemoryKey)) return false;
  const digest = await dedupeDigest(`${name}:${key}`);
  if (!canUseOptionalTracking("analytics", runtime)) return false;
  if (digest) {
    const storage = runtimeDedupeStorage(runtime);
    const storageKey = optionalTrackingDedupeStorageKey(config);
    try {
      const parsed = JSON.parse(storage?.getItem(storageKey) || "[]");
      const markers = Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string" && /^[a-f0-9]{64}$/.test(item)).slice(-MAX_DEDUPE_MARKERS) : [];
      if (markers.includes(digest)) {
        inMemoryEventDedupe.add(rawMemoryKey);
        return false;
      }
      storage?.setItem(storageKey, JSON.stringify([...markers, digest].slice(-MAX_DEDUPE_MARKERS)));
    } catch {
      // In-memory dedupe still prevents React/effect replays for this page lifetime.
    }
  }
  inMemoryEventDedupe.add(rawMemoryKey);
  return true;
}

export async function dispatchOptionalTrackingProductEvent(
  input: OptionalTrackingProductEventInput,
  options: Readonly<{ dedupeKey?: string; runtime?: OptionalTrackingRuntime }> = {}
) {
  const detail = productEventDetail(input);
  const runtime = options.runtime;
  if (!detail || !canUseOptionalTracking("analytics", runtime)) return false;
  if (options.dedupeKey) {
    if (options.dedupeKey.length > 256 || !await firstEventForKey(detail.name, options.dedupeKey, runtime)) return false;
  }
  if (!canUseOptionalTracking("analytics", runtime)) return false;
  const target = runtimeEventTarget(runtime);
  if (!target) return false;
  target.dispatchEvent(createDetailEvent(OPTIONAL_TRACKING_PRODUCT_EVENT, detail));
  return true;
}

export function subscribeToOptionalTrackingProductEvents(
  listener: (event: OptionalTrackingProductEventDetail) => void,
  runtime?: OptionalTrackingRuntime
) {
  const target = runtimeEventTarget(runtime);
  if (!target) return () => {};
  const receive: EventListener = (event) => {
    if (!canUseOptionalTracking("analytics", runtime)) return;
    const detail = productEventDetail((event as Event & { detail?: unknown }).detail);
    if (detail) listener(detail);
  };
  target.addEventListener(OPTIONAL_TRACKING_PRODUCT_EVENT, receive);
  return () => target.removeEventListener(OPTIONAL_TRACKING_PRODUCT_EVENT, receive);
}
