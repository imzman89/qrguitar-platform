import type { DirectOffer } from "./direct-payments";
import type { PayPalBrowserSdk } from "./paypal-browser-sdk";
import type { createPayPalPaymentsClient } from "./paypal-payments-client";

export type ApplePayConfig = { isEligible: boolean; countryCode: string; merchantCapabilities: string[]; supportedNetworks: string[] };
export type PayPalApplePay = {
  config(): Promise<ApplePayConfig>;
  validateMerchant(input: { validationUrl: string; displayName: string }): Promise<{ merchantSession: unknown }>;
  confirmOrder(input: { orderId: string; token: unknown; billingContact?: unknown }): Promise<unknown>;
};
export type ApplePaySessionInstance = {
  onvalidatemerchant: ((event: { validationURL: string }) => void) | null;
  onpaymentauthorized: ((event: { payment: { token: unknown; billingContact?: unknown } }) => void) | null;
  oncancel: (() => void) | null;
  begin(): void; abort(): void; completeMerchantValidation(value: unknown): void; completePayment(status: number): void;
};
export type ApplePaySessionConstructor = {
  new(version: number, request: { countryCode: string; merchantCapabilities: string[]; supportedNetworks: string[]; currencyCode: "USD"; requiredBillingContactFields: ["postalAddress"]; total: { label: string; type: "final"; amount: string } }): ApplePaySessionInstance;
  canMakePayments(): boolean; supportsVersion?(version: number): boolean; STATUS_SUCCESS: number; STATUS_FAILURE: number;
};
type ApplePayWindow = Window & { ApplePaySession?: ApplePaySessionConstructor; ApplePayWebOptions?: { set(options: { environment: "sandbox" | "prod" }): void } };
const scripts = new WeakMap<Document, Promise<void>>();
async function bounded<T>(value: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([value, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Apple Pay did not respond in time.")), timeoutMs); })]); }
  finally { if (timer) clearTimeout(timer); }
}
export function loadApplePaySdk(deps: { document?: Document; timeoutMs?: number } = {}): Promise<void> {
  const document = deps.document || globalThis.document, existing = scripts.get(document); if (existing) return existing;
  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script"); let settled = false;
    const finish = (failed = false) => {
      if (settled) return; settled = true; clearTimeout(timer); script.onload = null; script.onerror = null;
      if (failed) { script.remove(); scripts.delete(document); reject(new Error("Apple Pay is unavailable in this browser.")); } else resolve();
    };
    const timer = setTimeout(() => finish(true), deps.timeoutMs ?? 20_000);
    script.src = "https://applepay.cdn-apple.com/jsapi/1.latest/apple-pay-sdk.js"; script.async = true; script.crossOrigin = "anonymous";
    script.onload = () => finish(); script.onerror = () => finish(true); document.head.appendChild(script);
  });
  scripts.set(document, promise); return promise;
}
export async function eligibleApplePay(sdk: PayPalBrowserSdk, enabled: boolean, deps: { window?: ApplePayWindow; timeoutMs?: number; environment?: "test" | "live" } = {}) {
  if (!enabled) return null;
  const target = deps.window || window as ApplePayWindow, Session = target.ApplePaySession;
  try {
    target.ApplePayWebOptions?.set({ environment: deps.environment === "test" ? "sandbox" : "prod" });
    if (!Session || !Session.canMakePayments() || (Session.supportsVersion && !Session.supportsVersion(4)) || !sdk.Applepay) return null;
    const applepay = sdk.Applepay(), config = await bounded(applepay.config(), deps.timeoutMs ?? 10_000);
    if (config.isEligible !== true || !/^[A-Z]{2}$/.test(config.countryCode)
      || [config.merchantCapabilities, config.supportedNetworks].some(values => !Array.isArray(values) || values.length === 0 || values.length > 20 || values.some(value => typeof value !== "string" || !/^[A-Za-z0-9]{1,50}$/.test(value)))) return null;
    return { applepay, config, Session };
  } catch { return null; }
}
type Controller = Pick<ReturnType<typeof createPayPalPaymentsClient>, "beginWalletCheckout" | "createOrder" | "capture" | "cancelled" | "sdkError" | "getState">;
/** Apple payment tokens and contacts go straight to PayPal; they never enter our API or storage. */
export function createApplePayCheckout(deps: {
  applepay: PayPalApplePay; config: ApplePayConfig; Session: ApplePaySessionConstructor; controller: Controller;
  actorId: string; offer: DirectOffer; merchantName: string; onBusy?(busy: boolean): void; timeoutMs?: number;
}) {
  let disposed = false, active: ApplePaySessionInstance | null = null, nativeComplete = false, authorized = false;
  const live = (session: ApplePaySessionInstance) => !disposed && active === session && deps.controller.getState().actorId === deps.actorId;
  function close(session: ApplePaySessionInstance, abort = false) {
    if (active !== session) return;
    if (abort && !nativeComplete) try { session.abort(); } catch { /* The browser may already have closed its sheet. */ }
    active = null; if (!disposed) deps.onBusy?.(false);
  }
  function failed(session: ApplePaySessionInstance) {
    if (!live(session)) return;
    deps.controller.sdkError(deps.actorId); close(session, true);
  }
  return {
    // This is synchronous so ApplePaySession is created inside the buyer's click gesture.
    start() {
      if (disposed || active || !deps.controller.beginWalletCheckout(deps.offer.key, deps.actorId)) return false;
      let session: ApplePaySessionInstance;
      try {
        session = new deps.Session(4, { countryCode: deps.config.countryCode, merchantCapabilities: deps.config.merchantCapabilities, supportedNetworks: deps.config.supportedNetworks, currencyCode: "USD", requiredBillingContactFields: ["postalAddress"], total: { label: deps.merchantName, type: "final", amount: (deps.offer.amount / 100).toFixed(2) } });
        active = session; nativeComplete = false; authorized = false; deps.onBusy?.(true);
        session.onvalidatemerchant = event => {
          if (!live(session)) return;
          void bounded(Promise.resolve().then(() => live(session) ? deps.applepay.validateMerchant({ validationUrl: event.validationURL, displayName: deps.merchantName }) : null), deps.timeoutMs ?? 12_000)
            .then(result => { if (result && live(session)) session.completeMerchantValidation(result.merchantSession); }).catch(() => failed(session));
        };
        session.onpaymentauthorized = event => {
          if (!live(session) || authorized) return; authorized = true;
          void (async () => {
            const orderId = await deps.controller.createOrder(deps.offer.key, deps.actorId); if (!live(session)) return;
            await bounded(deps.applepay.confirmOrder({ orderId, token: event.payment.token, ...(event.payment.billingContact === undefined ? {} : { billingContact: event.payment.billingContact }) }), deps.timeoutMs ?? 12_000);
            if (!live(session)) return;
            // This closes Apple's authorization sheet. Only the server's ledger read can show Profile credits.
            session.completePayment(deps.Session.STATUS_SUCCESS); nativeComplete = true;
            await deps.controller.capture(orderId, deps.actorId);
            if (live(session)) close(session);
          })().catch(() => {
            if (!live(session)) return;
            if (!nativeComplete) { try { session.completePayment(deps.Session.STATUS_FAILURE); nativeComplete = true; } catch { /* The native sheet may have ended already. */ } }
            failed(session);
          });
        };
        session.oncancel = () => { if (live(session) && !nativeComplete) { close(session); void deps.controller.cancelled(deps.actorId); } };
        session.begin(); return true;
      } catch { if (active) close(active, true); deps.controller.sdkError(deps.actorId); return false; }
    },
    dispose() { const cancel = active && !nativeComplete && deps.controller.getState().actorId === deps.actorId; disposed = true; if (active) close(active, true); if (cancel) void deps.controller.cancelled(deps.actorId); }
  };
}
