import {
  canUseOptionalTracking,
  optionalTrackingProductEvents,
  sanitizeOptionalTrackingCreditPack,
  subscribeToOptionalTrackingProductEvents,
  type OptionalTrackingProductEventDetail,
  type OptionalTrackingRuntime
} from "./optional-tracking-consent";
import {
  configuredGoogleAnalytics,
  type GoogleAnalyticsConfig
} from "./google-analytics-config";

export const GOOGLE_ANALYTICS_SCRIPT_ID = "qrguitar-google-analytics";
export const GOOGLE_ANALYTICS_SCRIPT_ORIGIN = "https://www.googletagmanager.com";
export const GOOGLE_ANALYTICS_SYNTHETIC_ORIGIN = "https://www.qrguitar.com";
const GOOGLE_ANALYTICS_RUNTIME_STATE = "__qrguitarGoogleAnalyticsRuntime";

const IDEMPOTENCY_TOKEN_PATTERN = /^qrg_evt_v1_[a-f0-9]{64}$/;
const GA_COOKIE_PATTERN = /^_ga(?:_[a-z0-9]+)?$/i;

export type GoogleAnalyticsRouteCategory =
  | "home"
  | "catalog"
  | "how_it_works"
  | "installers"
  | "collections"
  | "public_collection"
  | "public_profile"
  | "profile_handout"
  | "contact"
  | "privacy"
  | "terms"
  | "authentication"
  | "account"
  | "dashboard"
  | "profile_creator"
  | "profile_editor"
  | "owner_profile"
  | "bulk_import"
  | "service_workspace"
  | "ownership_claim"
  | "ownership_transfer"
  | "billing"
  | "administration"
  | "site_editor"
  | "assistant"
  | "other";

export type GoogleAnalyticsEvent = Readonly<{
  name: string;
  parameters: Readonly<Record<string, unknown>>;
}>;

type GoogleAnalyticsCommand = IArguments;
type ScriptPort = {
  async: boolean;
  id: string;
  referrerPolicy: string;
  src: string;
  remove(): void;
};
type DocumentPort = {
  cookie: string;
  createElement(name: "script"): ScriptPort;
  getElementById(id: string): { remove(): void } | null;
  head: { appendChild(script: ScriptPort): unknown };
};
type WindowPort = {
  location: { hostname: string; pathname: string };
  [key: string]: unknown;
};
type GoogleAnalyticsOwnedRuntime = Readonly<{
  layer: GoogleAnalyticsCommand[];
  previousLayer: unknown;
  token: symbol;
}>;

export type GoogleAnalyticsRuntime = Readonly<{
  document?: DocumentPort | null;
  now?: () => Date;
  trackingRuntime?: OptionalTrackingRuntime;
  window?: WindowPort | null;
}>;

function exactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return actual.length === sorted.length && sorted.every((key, index) => key === actual[index]);
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function businessToken(value: unknown) {
  return typeof value === "string" && IDEMPOTENCY_TOKEN_PATTERN.test(value) ? value : null;
}

function creditPack(properties: Record<string, unknown>) {
  const sanitized = sanitizeOptionalTrackingCreditPack(properties);
  if (!sanitized) return null;
  const { credits, pricing, valueUsd: value } = sanitized;
  return Object.freeze({
    credits,
    pricing,
    value,
    items: Object.freeze([Object.freeze({
      item_id: `profile_credit_pack_${credits}`,
      item_name: `${credits} Profile credit${credits === 1 ? "" : "s"}`,
      item_category: "profile_credits",
      price: value,
      quantity: 1
    })])
  });
}

export function mapOptionalTrackingEventToGoogleAnalytics(value: unknown): GoogleAnalyticsEvent | null {
  const event = record(value);
  if (!event) return null;
  const properties = record(event.properties);
  if (!properties || typeof event.name !== "string") return null;

  if (event.name === optionalTrackingProductEvents.publicProfileViewed) {
    if (!exactKeys(event, ["name", "properties"]) || !exactKeys(properties, ["visibility"])) return null;
    if (properties.visibility !== "public" && properties.visibility !== "unlisted") return null;
    return Object.freeze({
      name: "public_profile_viewed",
      parameters: Object.freeze({ profile_visibility: properties.visibility })
    });
  }

  if (!exactKeys(event, ["idempotencyToken", "name", "properties"])) return null;
  const eventId = businessToken(event.idempotencyToken);
  if (!eventId) return null;

  if (event.name === optionalTrackingProductEvents.registrationCompleted) {
    if (!exactKeys(properties, ["confirmation"]) || (properties.confirmation !== "email_pending" && properties.confirmation !== "session_ready")) return null;
    return Object.freeze({
      name: "sign_up",
      parameters: Object.freeze({ method: "email", confirmation_status: properties.confirmation, event_id: eventId })
    });
  }

  if (event.name === optionalTrackingProductEvents.profileCreated) {
    if (!exactKeys(properties, ["visibility"]) || typeof properties.visibility !== "string"
      || !["public", "unlisted", "private"].includes(properties.visibility)) return null;
    const visibility = properties.visibility;
    return Object.freeze({
      name: "profile_created",
      parameters: Object.freeze({ profile_visibility: visibility, event_id: eventId })
    });
  }

  if (event.name === optionalTrackingProductEvents.checkoutStarted || event.name === optionalTrackingProductEvents.purchaseCompleted) {
    const pack = creditPack(properties);
    if (!pack) return null;
    const shared = {
      currency: "USD",
      value: pack.value,
      profile_credits: pack.credits,
      pricing_tier: pack.pricing,
      items: pack.items,
      event_id: eventId
    };
    return Object.freeze({
      name: event.name === optionalTrackingProductEvents.checkoutStarted ? "begin_checkout" : "purchase",
      parameters: Object.freeze(event.name === optionalTrackingProductEvents.purchaseCompleted
        ? { ...shared, transaction_id: eventId }
        : shared)
    });
  }

  if (event.name === optionalTrackingProductEvents.ownershipTransferCompleted) {
    if (!exactKeys(properties, ["method"]) || typeof properties.method !== "string"
      || !["email_link", "buyer_code", "review"].includes(properties.method)) return null;
    const method = properties.method;
    return Object.freeze({
      name: "ownership_transfer_completed",
      parameters: Object.freeze({ transfer_method: method, event_id: eventId })
    });
  }

  return null;
}

export function categorizeGoogleAnalyticsRoute(pathname: unknown): GoogleAnalyticsRouteCategory | null {
  if (typeof pathname !== "string" || pathname.length < 1 || pathname.length > 2048) return null;
  if (!pathname.startsWith("/") || pathname.includes("?") || pathname.includes("#") || pathname.includes("\\")) return null;
  const path = pathname !== "/" ? pathname.replace(/\/+$/, "") : pathname;
  if (path === "/") return "home";
  if (path === "/catalog") return "catalog";
  if (path === "/how-it-works") return "how_it_works";
  if (path === "/installers") return "installers";
  if (path === "/collections") return "collections";
  if (/^\/collections\/[^/]+$/.test(path)) return "public_collection";
  if (/^\/i\/[^/]+$/.test(path)) return "public_profile";
  if (/^\/handout\/[^/]+$/.test(path)) return "profile_handout";
  if (path === "/contact") return "contact";
  if (path === "/privacy") return "privacy";
  if (path === "/terms") return "terms";
  if (path === "/login" || path === "/reset-password") return "authentication";
  if (path === "/account") return "account";
  if (path === "/dashboard") return "dashboard";
  if (path === "/create") return "profile_creator";
  if (/^\/edit\/[^/]+$/.test(path)) return "profile_editor";
  if (/^\/dashboard\/profile\/[^/]+$/.test(path)) return "owner_profile";
  if (path === "/dashboard/import") return "bulk_import";
  if (path === "/dashboard/service" || /^\/service-work\/[^/]+$/.test(path) || /^\/service-review\/[^/]+$/.test(path)) return "service_workspace";
  if (path === "/ownership-claim") return "ownership_claim";
  if (/^\/transfer\/[^/]+$/.test(path)) return "ownership_transfer";
  if (path === "/billing" || path.startsWith("/billing/")) return "billing";
  if (path === "/admin" || path.startsWith("/admin/")) return "administration";
  if (path === "/site-editor") return "site_editor";
  if (path === "/bot") return "assistant";
  return "other";
}

export function googleAnalyticsPageContext(category: GoogleAnalyticsRouteCategory) {
  return Object.freeze({
    page_location: `${GOOGLE_ANALYTICS_SYNTHETIC_ORIGIN}/_measurement/${category}`,
    page_referrer: "",
    page_title: `QRguitar | ${category.replaceAll("_", " ")}`,
    route_category: category
  });
}

function browserWindow(): WindowPort | null {
  return typeof window === "undefined" ? null : window as unknown as WindowPort;
}

function browserDocument(): DocumentPort | null {
  return typeof document === "undefined" ? null : document as unknown as DocumentPort;
}

function removeGoogleAnalyticsCookies(documentPort: DocumentPort, hostname: string) {
  let names: string[] = [];
  try {
    names = documentPort.cookie.split(";")
      .map((entry) => entry.split("=", 1)[0]?.trim() || "")
      .filter((name) => GA_COOKIE_PATTERN.test(name));
  } catch {
    return;
  }
  const host = hostname.toLowerCase().replace(/^\.+/, "");
  const domains = host === "qrguitar.com" || host.endsWith(".qrguitar.com")
    ? ["", "qrguitar.com", ".qrguitar.com", host]
    : [""];
  for (const name of new Set(names)) {
    for (const domain of new Set(domains)) {
      try {
        documentPort.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax${domain ? `; Domain=${domain}` : ""}`;
      } catch {
        // Consent remains denied even when the browser blocks cookie cleanup.
      }
    }
  }
}

let routeDispatcher: ((category: GoogleAnalyticsRouteCategory) => boolean) | null = null;

export function dispatchGoogleAnalyticsRoute(pathname: unknown) {
  const category = categorizeGoogleAnalyticsRoute(pathname);
  return category ? routeDispatcher?.(category) === true : false;
}

export function startGoogleAnalytics(
  config: GoogleAnalyticsConfig = configuredGoogleAnalytics,
  runtime: GoogleAnalyticsRuntime = {}
) {
  const windowPort = runtime.window === undefined ? browserWindow() : runtime.window;
  const documentPort = runtime.document === undefined ? browserDocument() : runtime.document;
  const trackingRuntime = runtime.trackingRuntime;
  if (!config.enabled || !config.measurementId || !windowPort || !documentPort) return undefined;
  if (!canUseOptionalTracking("analytics", trackingRuntime)) return undefined;

  const measurementId = config.measurementId;
  const disableKey = `ga-disable-${measurementId}`;
  const priorOwnedRuntime = windowPort[GOOGLE_ANALYTICS_RUNTIME_STATE] as GoogleAnalyticsOwnedRuntime | undefined;
  const previousLayer = priorOwnedRuntime ? priorOwnedRuntime.previousLayer : windowPort.dataLayer;
  const layer: GoogleAnalyticsCommand[] = [];
  const ownedRuntime = Object.freeze({ layer, previousLayer, token: Symbol("qrguitar-ga4-runtime") });
  windowPort[GOOGLE_ANALYTICS_RUNTIME_STATE] = ownedRuntime;
  windowPort.dataLayer = layer;
  windowPort[disableKey] = false;
  const command: (...values: unknown[]) => void = function () {
    // gtag.js reads the Arguments objects queued by the canonical gtag wrapper.
    // Keeping this exact shape is required by the real provider script.
    layer.push(arguments);
  };
  const deniedConsent = Object.freeze({
    ad_personalization: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    analytics_storage: "denied"
  });
  command("consent", "default", deniedConsent);
  command("consent", "update", Object.freeze({ ...deniedConsent, analytics_storage: "granted" }));
  command("set", "allow_google_signals", false);
  command("set", "allow_ad_personalization_signals", false);
  command("set", "ads_data_redaction", true);
  command("js", (runtime.now || (() => new Date()))());

  const initialCategory = categorizeGoogleAnalyticsRoute(windowPort.location.pathname) || "other";
  command("config", measurementId, Object.freeze({
    ...googleAnalyticsPageContext(initialCategory),
    allow_ad_personalization_signals: false,
    allow_google_signals: false,
    send_page_view: false
  }));

  let active = true;
  const send = (name: string, parameters: Readonly<Record<string, unknown>>) => {
    if (!active || !canUseOptionalTracking("analytics", trackingRuntime)) return false;
    command("event", name, Object.freeze({ ...parameters, send_to: measurementId }));
    return true;
  };
  const unsubscribe = subscribeToOptionalTrackingProductEvents((detail: OptionalTrackingProductEventDetail) => {
    const mapped = mapOptionalTrackingEventToGoogleAnalytics(detail);
    if (!mapped) return;
    const category = categorizeGoogleAnalyticsRoute(windowPort.location.pathname) || "other";
    send(mapped.name, Object.freeze({ ...googleAnalyticsPageContext(category), ...mapped.parameters }));
  }, trackingRuntime);

  const ownRouteDispatcher = (category: GoogleAnalyticsRouteCategory) => {
    if (!active || !canUseOptionalTracking("analytics", trackingRuntime)) return false;
    const context = googleAnalyticsPageContext(category);
    command("config", measurementId, Object.freeze({ ...context, send_page_view: false }));
    return send("page_view", context);
  };
  routeDispatcher = ownRouteDispatcher;

  documentPort.getElementById(GOOGLE_ANALYTICS_SCRIPT_ID)?.remove();
  const script = documentPort.createElement("script");
  script.id = GOOGLE_ANALYTICS_SCRIPT_ID;
  script.async = true;
  script.referrerPolicy = "strict-origin-when-cross-origin";
  script.src = `${GOOGLE_ANALYTICS_SCRIPT_ORIGIN}/gtag/js?id=${encodeURIComponent(measurementId)}`;
  documentPort.head.appendChild(script);

  return () => {
    if (!active) return;
    active = false;
    unsubscribe();
    if (routeDispatcher === ownRouteDispatcher) routeDispatcher = null;
    script.remove();
    if (windowPort[GOOGLE_ANALYTICS_RUNTIME_STATE] !== ownedRuntime) return;
    command("consent", "update", deniedConsent);
    windowPort[disableKey] = true;
    const currentScript = documentPort.getElementById(GOOGLE_ANALYTICS_SCRIPT_ID);
    if (currentScript === script) currentScript.remove();
    removeGoogleAnalyticsCookies(documentPort, windowPort.location.hostname);
    delete windowPort[GOOGLE_ANALYTICS_RUNTIME_STATE];
    if (previousLayer === undefined) delete windowPort.dataLayer;
    else windowPort.dataLayer = previousLayer;
  };
}
