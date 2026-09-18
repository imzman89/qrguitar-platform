export const OPTIONAL_TRACKING_CONSENT_EVENT = "qrguitar:optional-tracking-consent";
export const OPTIONAL_TRACKING_PRODUCT_EVENT = "qrguitar:optional-tracking-product-event";
export const OPTIONAL_TRACKING_CONSENT_STORAGE_PREFIX = "qrguitar.optionalTrackingConsent.v1";
const OPTIONAL_TRACKING_DEDUPE_STORAGE_PREFIX = "qrguitar.optionalTrackingEvents.v1";
const MAX_DEDUPE_MARKERS = 128;
const OPTIONAL_TRACKING_IDEMPOTENCY_PREFIX = "qrg_evt_v1_";
const OPTIONAL_TRACKING_LOCK_PREFIX = "qrguitar.optionalTrackingEvent.v1";

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
type CreditPackPricing = "standard" | "promotion" | "internal_test";
type TransferMethod = "email_link" | "buyer_code" | "review";
export type OptionalTrackingCreditPack = Readonly<{ credits: CreditPackSize; valueUsd: number; pricing: CreditPackPricing }>;

type RepeatableProductEventInput =
  Readonly<{ name: typeof optionalTrackingProductEvents.publicProfileViewed; properties: Readonly<{ visibility: Exclude<ProfileVisibility, "private"> }> }>;

type BusinessProductEventInput =
  | Readonly<{ name: typeof optionalTrackingProductEvents.registrationCompleted; properties: Readonly<{ confirmation: RegistrationConfirmation }> }>
  | Readonly<{ name: typeof optionalTrackingProductEvents.profileCreated; properties: Readonly<{ visibility: ProfileVisibility }> }>
  | Readonly<{ name: typeof optionalTrackingProductEvents.checkoutStarted; properties: OptionalTrackingCreditPack }>
  | Readonly<{ name: typeof optionalTrackingProductEvents.purchaseCompleted; properties: OptionalTrackingCreditPack }>
  | Readonly<{ name: typeof optionalTrackingProductEvents.ownershipTransferCompleted; properties: Readonly<{ method: TransferMethod }> }>;

export type OptionalTrackingProductEventInput = RepeatableProductEventInput | BusinessProductEventInput;
export type OptionalTrackingProductEventDetail = RepeatableProductEventInput | (BusinessProductEventInput & Readonly<{ idempotencyToken: string }>);

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

export interface OptionalTrackingLockManager {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

export type OptionalTrackingRuntime = Readonly<{
  config?: OptionalTrackingConfig;
  storage?: OptionalTrackingStorage | null;
  dedupeStorage?: OptionalTrackingStorage | null;
  eventTarget?: OptionalTrackingEventTarget | null;
  lockManager?: OptionalTrackingLockManager | null;
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
    return window.localStorage;
  } catch {
    return null;
  }
}

function browserLockManager(): OptionalTrackingLockManager | null {
  if (typeof navigator === "undefined" || !navigator.locks) return null;
  const locks = navigator.locks;
  async function request<T>(name: string, callback: () => Promise<T>): Promise<T> {
    return await locks.request<Promise<T>>(name, () => callback());
  }
  return { request };
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

function runtimeLockManager(runtime?: OptionalTrackingRuntime) {
  return runtime && "lockManager" in runtime ? runtime.lockManager || null : browserLockManager();
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

function clearEventDedupe(runtime?: OptionalTrackingRuntime) {
  inMemoryEventDedupe.clear();
  const storage = runtimeDedupeStorage(runtime);
  for (const purposes of [["analytics"], ["advertising"], ["analytics", "advertising"]] as const) {
    try {
      storage?.setItem(optionalTrackingDedupeStorageKey({ enabled: true, purposes }), "[]");
    } catch {
      // Withdrawal still gates dispatch and provider activation when storage is blocked.
    }
  }
}

function persistOptionalTrackingConsent(
  decision: OptionalTrackingDecision,
  runtime: OptionalTrackingRuntime | undefined,
  notify: boolean
) {
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
    clearEventDedupe(runtime);
  }

  if (notify) {
    runtimeEventTarget(runtime)?.dispatchEvent(createDetailEvent(OPTIONAL_TRACKING_CONSENT_EVENT, { decision, purposes: config.purposes }));
  }
  return persisted;
}

export function saveOptionalTrackingConsent(decision: OptionalTrackingDecision, runtime?: OptionalTrackingRuntime) {
  return persistOptionalTrackingConsent(decision, runtime, true);
}

// Re-enabling after withdrawal reloads the document. Persist first without
// notifying providers in the denied document; the fresh document then starts
// providers from a verified accepted state and a new consent epoch.
export function saveOptionalTrackingConsentForReload(runtime?: OptionalTrackingRuntime) {
  return persistOptionalTrackingConsent("accepted", runtime, false);
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
    if (key === null || key === optionalTrackingConsentStorageKey(config)) {
      if (readOptionalTrackingConsent(runtime).status === "denied") clearEventDedupe(runtime);
      update(event);
    }
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

export function sanitizeOptionalTrackingCreditPack(value: unknown): OptionalTrackingCreditPack | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const properties = value as Record<string, unknown>;
  if (!exactKeys(properties, ["credits", "pricing", "valueUsd"]) || typeof properties.credits !== "number"
    || typeof properties.valueUsd !== "number" || typeof properties.pricing !== "string"
    || (properties.credits !== 1 && properties.credits !== 10 && properties.credits !== 25)
    || (properties.pricing !== "standard" && properties.pricing !== "promotion" && properties.pricing !== "internal_test")
    || !Number.isFinite(properties.valueUsd)) return null;
  const valueCents = Math.round(properties.valueUsd * 100);
  if (!Number.isSafeInteger(valueCents) || Math.abs(properties.valueUsd - valueCents / 100) > 1e-9) return null;
  const listValueCents = { 1: 1200, 10: 5000, 25: 9900 }[properties.credits];
  const validValue = properties.pricing === "standard"
    ? valueCents === listValueCents
    : valueCents >= 30 && valueCents < listValueCents;
  if (!validValue) return null;
  return Object.freeze({ credits: properties.credits, valueUsd: valueCents / 100, pricing: properties.pricing });
}

function productEventInput(value: unknown): OptionalTrackingProductEventInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as { name?: unknown; properties?: unknown };
  if (!exactKeys(input as Record<string, unknown>, ["name", "properties"]) || !input.properties || typeof input.properties !== "object" || Array.isArray(input.properties)) return null;
  const properties = input.properties as Record<string, unknown>;
  const name = input.name;

  if (name === optionalTrackingProductEvents.publicProfileViewed && exactKeys(properties, ["visibility"])
    && typeof properties.visibility === "string" && ["public", "unlisted"].includes(properties.visibility)) {
    return Object.freeze({ name, properties: Object.freeze({ visibility: properties.visibility as "public" | "unlisted" }) });
  }
  if (name === optionalTrackingProductEvents.registrationCompleted && exactKeys(properties, ["confirmation"])
    && typeof properties.confirmation === "string" && ["email_pending", "session_ready"].includes(properties.confirmation)) {
    return Object.freeze({ name, properties: Object.freeze({ confirmation: properties.confirmation as RegistrationConfirmation }) });
  }
  if (name === optionalTrackingProductEvents.profileCreated && exactKeys(properties, ["visibility"])
    && typeof properties.visibility === "string" && ["public", "unlisted", "private"].includes(properties.visibility)) {
    return Object.freeze({ name, properties: Object.freeze({ visibility: properties.visibility as ProfileVisibility }) });
  }
  if ((name === optionalTrackingProductEvents.checkoutStarted || name === optionalTrackingProductEvents.purchaseCompleted)
    && exactKeys(properties, ["credits", "pricing", "valueUsd"])) {
    const pack = sanitizeOptionalTrackingCreditPack(properties);
    return pack ? Object.freeze({ name, properties: pack }) as BusinessProductEventInput : null;
  }
  if (name === optionalTrackingProductEvents.ownershipTransferCompleted && exactKeys(properties, ["method"])
    && typeof properties.method === "string" && ["email_link", "buyer_code", "review"].includes(properties.method)) {
    return Object.freeze({ name, properties: Object.freeze({ method: properties.method as TransferMethod }) });
  }
  return null;
}

function validIdempotencyToken(value: unknown): value is string {
  return typeof value === "string" && new RegExp(`^${OPTIONAL_TRACKING_IDEMPOTENCY_PREFIX}[a-f0-9]{64}$`).test(value);
}

function productEventDetail(value: unknown): OptionalTrackingProductEventDetail | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const name = record.name;
  const repeatable = name === optionalTrackingProductEvents.publicProfileViewed;
  if (!exactKeys(record, repeatable ? ["name", "properties"] : ["idempotencyToken", "name", "properties"])) return null;
  const input = productEventInput({ name, properties: record.properties });
  if (!input) return null;
  if (repeatable) return input as RepeatableProductEventInput;
  if (!validIdempotencyToken(record.idempotencyToken)) return null;
  return Object.freeze({ ...input, idempotencyToken: record.idempotencyToken }) as OptionalTrackingProductEventDetail;
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

async function idempotencyToken(name: BusinessProductEventInput["name"], key: string) {
  const digest = await dedupeDigest(`qrguitar:optional-tracking:v1:${name}:${key}`);
  return digest ? `${OPTIONAL_TRACKING_IDEMPOTENCY_PREFIX}${digest}` : null;
}

async function withDedupeLock<T>(token: string, work: () => T | Promise<T>, runtime?: OptionalTrackingRuntime) {
  const locks = runtimeLockManager(runtime);
  if (!locks) return work();
  let entered = false;
  try {
    return await locks.request(`${OPTIONAL_TRACKING_LOCK_PREFIX}:${token}`, async () => {
      entered = true;
      return await work();
    });
  } catch {
    // If lock acquisition itself is unavailable, same-context memory and durable
    // storage still provide best-effort dedupe. Never repeat work that had entered.
    return entered ? null : work();
  }
}

async function firstEventForToken(token: string, runtime?: OptionalTrackingRuntime) {
  const config = runtimeConfig(runtime);
  const memoryKey = `${config.purposes.join("-")}:${token}`;
  const claimed = await withDedupeLock(token, () => {
    if (!canUseOptionalTracking("analytics", runtime) || inMemoryEventDedupe.has(memoryKey)) return false;
    const storage = runtimeDedupeStorage(runtime);
    const storageKey = optionalTrackingDedupeStorageKey(config);
    try {
      const parsed = JSON.parse(storage?.getItem(storageKey) || "[]");
      const markers = Array.isArray(parsed) ? parsed.filter(validIdempotencyToken).slice(-MAX_DEDUPE_MARKERS) : [];
      if (markers.includes(token)) {
        inMemoryEventDedupe.add(memoryKey);
        return false;
      }
      storage?.setItem(storageKey, JSON.stringify([...markers, token].slice(-MAX_DEDUPE_MARKERS)));
    } catch {
      // In-memory dedupe still prevents same-page replays when durable storage fails.
    }
    inMemoryEventDedupe.add(memoryKey);
    return true;
  }, runtime);
  return claimed === true;
}

export function dispatchOptionalTrackingProductEvent(
  input: RepeatableProductEventInput,
  options?: Readonly<{ runtime?: OptionalTrackingRuntime; dedupeKey?: never }>
): Promise<boolean>;
export function dispatchOptionalTrackingProductEvent(
  input: BusinessProductEventInput,
  options: Readonly<{ dedupeKey: string; runtime?: OptionalTrackingRuntime }>
): Promise<boolean>;
export async function dispatchOptionalTrackingProductEvent(
  input: OptionalTrackingProductEventInput,
  options: Readonly<{ dedupeKey?: string; runtime?: OptionalTrackingRuntime }> = {}
) {
  const sanitized = productEventInput(input);
  const runtime = options.runtime;
  if (!sanitized || !canUseOptionalTracking("analytics", runtime)) return false;
  const target = runtimeEventTarget(runtime);
  if (!target) return false;

  let detail: OptionalTrackingProductEventDetail;
  if (sanitized.name === optionalTrackingProductEvents.publicProfileViewed) {
    if (options.dedupeKey !== undefined) return false;
    detail = sanitized as RepeatableProductEventInput;
  } else {
    const key = options.dedupeKey;
    if (!key || key.length > 256) return false;
    const token = await idempotencyToken(sanitized.name, key);
    if (!token || !canUseOptionalTracking("analytics", runtime) || !await firstEventForToken(token, runtime)) return false;
    detail = Object.freeze({ ...sanitized, idempotencyToken: token }) as OptionalTrackingProductEventDetail;
  }
  if (!canUseOptionalTracking("analytics", runtime)) return false;
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
