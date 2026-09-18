import type { createPayPalPaymentsClient } from "./paypal-payments-client";
import type { PayPalApplePay } from "./paypal-apple-pay";

type Controller = ReturnType<typeof createPayPalPaymentsClient>;
export type PayPalButtonOptions = {
  style: { layout: "vertical"; color: "gold"; shape: "rect"; label: "pay"; height: number; tagline: false };
  createOrder(): Promise<string>;
  onApprove(data: { orderID: string }, actions: { restart?: () => Promise<void> }): Promise<void>;
  onCancel(): Promise<void>;
  onError(): void;
};
export type PayPalButtonInstance = { isEligible(): boolean; render(container: HTMLElement): Promise<void>; close(): Promise<void> };
export type PayPalBrowserSdk = { Buttons(options: PayPalButtonOptions): PayPalButtonInstance; Applepay?: () => PayPalApplePay };
type PayPalWindow = Window & { qrguitarPayPal?: PayPalBrowserSdk };

export function paypalSdkUrl(clientId: string, applePayEnabled = false): string {
  if (!/^[A-Za-z0-9_-]{10,256}$/.test(clientId)) throw new Error("Secure checkout isn’t configured yet.");
  const query = new URLSearchParams({ "client-id": clientId, currency: "USD", intent: "capture", components: applePayEnabled ? "buttons,applepay" : "buttons", commit: "true", vault: "false", "enable-funding": "venmo,card", "disable-funding": "paylater,credit" });
  return `https://www.paypal.com/sdk/js?${query.toString()}`;
}
const loads = new WeakMap<Document, { source: string; promise: Promise<PayPalBrowserSdk> }>();
/** Only the official PayPal SDK receives payment details; our application never handles card data. */
export function loadPayPalSdk(clientId: string, deps: { document?: Document; window?: PayPalWindow; timeoutMs?: number; applePayEnabled?: boolean } = {}): Promise<PayPalBrowserSdk> {
  const document = deps.document || globalThis.document, target = deps.window || window as PayPalWindow, existing = loads.get(document);
  const source = paypalSdkUrl(clientId, deps.applePayEnabled);
  if (existing) return existing.source === source ? existing.promise : Promise.reject(new Error("Payment settings changed. Reload this page to reconnect checkout."));
  const promise = new Promise<PayPalBrowserSdk>((resolve, reject) => {
    const script = document.createElement("script"); let settled = false;
    const finish = (error?: Error) => {
      if (settled) return; settled = true; clearTimeout(timer); script.onload = null; script.onerror = null;
      if (error || typeof target.qrguitarPayPal?.Buttons !== "function") { script.remove(); loads.delete(document); reject(error || new Error("Secure checkout could not load. Please try again.")); }
      else resolve(target.qrguitarPayPal);
    };
    const timer = setTimeout(() => finish(new Error("Secure checkout took too long to load. Check your connection and try again.")), deps.timeoutMs ?? 20_000);
    script.src = source; script.async = true; script.setAttribute("data-namespace", "qrguitarPayPal");
    script.onload = () => finish(); script.onerror = () => finish(new Error("Secure checkout could not load. Check your connection and try again."));
    document.head.appendChild(script);
  });
  loads.set(document, { source, promise }); return promise;
}
export function paypalButtonOptions(controller: Controller, offerKey: string, actorId: string): PayPalButtonOptions {
  return {
    style: { layout: "vertical", color: "gold", shape: "rect", label: "pay", height: 48, tagline: false },
    createOrder: () => controller.createOrder(offerKey, actorId),
    async onApprove(data, actions) { const result = await controller.capture(data.orderID, actorId); if (result === "restart" && actions.restart) await actions.restart(); },
    onCancel: () => controller.cancelled(actorId),
    onError: () => controller.sdkError(actorId)
  };
}
