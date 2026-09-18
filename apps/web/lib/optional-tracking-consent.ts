export const OPTIONAL_TRACKING_CONSENT_EVENT = "qrguitar:optional-tracking-consent";
export const OPTIONAL_TRACKING_CONSENT_STORAGE_PREFIX = "qrguitar.optionalTrackingConsent.v1";

export const optionalTrackingPurposes = ["analytics", "advertising"] as const;
export type OptionalTrackingPurpose = (typeof optionalTrackingPurposes)[number];

// Canonical, provider-neutral names for a future consent-gated integration.
// Defining names here does not emit events or load tracking code.
export const optionalTrackingProductEvents = {
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

type ConsentRuntime = Readonly<{
  config?: OptionalTrackingConfig;
  storage?: OptionalTrackingStorage | null;
  eventTarget?: OptionalTrackingEventTarget | null;
}>;

function browserStorage(): OptionalTrackingStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
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

function runtimeConfig(runtime?: ConsentRuntime) {
  return runtime?.config || configuredOptionalTracking;
}

function runtimeStorage(runtime?: ConsentRuntime) {
  return runtime && "storage" in runtime ? runtime.storage || null : browserStorage();
}

function runtimeEventTarget(runtime?: ConsentRuntime) {
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

export function readOptionalTrackingConsent(runtime?: ConsentRuntime): OptionalTrackingConsentState {
  const config = runtimeConfig(runtime);
  if (!config.enabled) return { status: "not-configured", purposes: [] };
  return {
    status: readStoredDecision(config, runtimeStorage(runtime)) || "pending",
    purposes: config.purposes
  };
}

export function canUseOptionalTracking(purpose: OptionalTrackingPurpose, runtime?: ConsentRuntime) {
  const state = readOptionalTrackingConsent(runtime);
  return state.status === "accepted" && state.purposes.includes(purpose);
}

function createConsentEvent(detail: OptionalTrackingConsentEventDetail) {
  if (typeof CustomEvent === "function") {
    return new CustomEvent<OptionalTrackingConsentEventDetail>(OPTIONAL_TRACKING_CONSENT_EVENT, { detail });
  }
  const event = new Event(OPTIONAL_TRACKING_CONSENT_EVENT) as Event & { detail: OptionalTrackingConsentEventDetail };
  Object.defineProperty(event, "detail", { value: detail });
  return event;
}

export function saveOptionalTrackingConsent(decision: OptionalTrackingDecision, runtime?: ConsentRuntime) {
  const config = runtimeConfig(runtime);
  const storage = runtimeStorage(runtime);
  if (!config.enabled || !storage) return false;

  try {
    const key = optionalTrackingConsentStorageKey(config);
    storage.setItem(key, decision);
    if (storage.getItem(key) !== decision) return false;
  } catch {
    return false;
  }

  runtimeEventTarget(runtime)?.dispatchEvent(createConsentEvent({ decision, purposes: config.purposes }));
  return true;
}

export function subscribeToOptionalTrackingConsent(
  listener: (state: OptionalTrackingConsentState) => void,
  runtime?: ConsentRuntime
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

export function activateOptionalTracking(
  purpose: OptionalTrackingPurpose,
  load: () => void | Promise<void>,
  runtime?: ConsentRuntime
) {
  let active = true;
  let loaded = false;

  const tryLoad = () => {
    if (!active || loaded || !canUseOptionalTracking(purpose, runtime)) return;
    loaded = true;
    try {
      void Promise.resolve(load()).catch(() => {
        // Loading failure must not loosen the consent gate or create an unhandled rejection.
      });
    } catch {
      // A provider failure must remain isolated from the product experience.
    }
  };

  tryLoad();
  const unsubscribe = subscribeToOptionalTrackingConsent(tryLoad, runtime);
  return () => {
    active = false;
    unsubscribe();
  };
}
