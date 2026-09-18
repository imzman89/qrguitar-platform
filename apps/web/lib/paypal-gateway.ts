import "server-only";
import { BillingError } from "./billing-service";
import type { PayPalConfig } from "./paypal-config";
import type { DirectOffer } from "./direct-payments";

type Json = Record<string, unknown>;
export interface PayPalGateway {
  createOrder(order: { orderId: string; offer: DirectOffer }): Promise<Json>;
  getOrder(id: string): Promise<Json>;
  captureOrder(id: string, localOrderId: string): Promise<Json>;
  getCapture(id: string): Promise<Json>;
  getRefund(id: string): Promise<Json>;
  getDispute(id: string): Promise<Json>;
  verifyWebhook(event: Json, headers: Record<string, string>, rawEvent?: string): Promise<boolean>;
}
const object = (value: unknown): Json => value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
const problem = () => new BillingError(503, "paypal_unavailable", "PayPal could not confirm the result. Check payment status before trying again.");
const providerId = (value: string) => { if (!/^[A-Z0-9]{5,64}$/.test(value)) throw problem(); return encodeURIComponent(value); };
const requestId = (prefix: "qgc" | "qgp", value: string) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw problem();
  return `${prefix}-${value.replaceAll("-", "").toLowerCase()}`;
};
const disputeId = (value: string) => { if (!/^[A-Za-z0-9-]{1,255}$/.test(value)) throw problem(); return encodeURIComponent(value); };
export function createPayPalGateway(config: PayPalConfig, fetchImpl: typeof fetch = fetch, requestTimeoutMs = 10000): PayPalGateway {
  const base = config.environment === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
  let token: { value: string; expires: number } | null = null, tokenRequest: Promise<string> | null = null;
  async function send(path: string, init: RequestInit): Promise<{ response: Response; data: Json }> {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const response = await fetchImpl(base + path, { ...init, cache: "no-store", redirect: "error", signal: controller.signal });
      if (Number(response.headers.get("content-length")) > 1024 * 1024 || !response.body) throw problem();
      const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
      try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 1024 * 1024) { void reader.cancel().catch(() => {}); throw problem(); } chunks.push(value); } }
      finally { reader.releaseLock(); }
      const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      const data = object(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
      return { response, data };
    } catch { throw problem(); } finally { clearTimeout(timer); }
  }
  async function accessToken(): Promise<string> {
    if (token && token.expires > Date.now()) return token.value;
    if (!tokenRequest) tokenRequest = (async () => {
      if (!config.clientId || !config.secret) throw problem();
      const { response, data } = await send("/v1/oauth2/token", { method: "POST", headers: { Authorization: "Basic " + Buffer.from(config.clientId + ":" + config.secret).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials" });
      if (!response.ok || typeof data.access_token !== "string" || !data.access_token || /[\s\x00-\x1f\x7f]/.test(data.access_token)
        || data.access_token.length > 8192 || typeof data.expires_in !== "number" || !Number.isFinite(data.expires_in) || data.expires_in < 1) throw problem();
      token = { value: data.access_token, expires: Date.now() + Math.min(Math.max(data.expires_in - 60, 0), 3600) * 1000 }; return token.value;
    })().finally(() => { tokenRequest = null; });
    return tokenRequest;
  }
  async function api(path: string, method = "GET", body?: Json | string, key?: string): Promise<Json> {
    const { response, data } = await send(path, { method, headers: { Authorization: "Bearer " + await accessToken(), "Content-Type": "application/json", Prefer: "return=representation", ...(key ? { "PayPal-Request-Id": key } : {}) }, ...(body ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}) });
    if (response.status === 401) token = null;
    if (!response.ok) {
      const issues = Array.isArray(data.details) ? data.details.map(value => object(value).issue) : [];
      if (issues.includes("INSTRUMENT_DECLINED")) throw new BillingError(422, "instrument_declined", "That payment method was declined. Choose another method in PayPal.");
      if (issues.includes("ORDER_NOT_APPROVED")) throw new BillingError(409, "payment_not_approved", "Finish approving your payment in PayPal.");
      if (issues.includes("ORDER_ALREADY_CAPTURED")) throw new BillingError(409, "payment_already_captured", "Payment was already submitted. Checking its result.");
      throw problem();
    }
    return data;
  }
  return {
    createOrder: ({ orderId, offer }) => api("/v2/checkout/orders", "POST", {
      intent: "CAPTURE",
      purchase_units: [{ reference_id: orderId, custom_id: orderId, invoice_id: `QRG-${orderId}`,
        description: `${offer.credits} QRguitar Profile ${offer.credits === 1 ? "credit" : "credits"}`,
        payee: { merchant_id: config.merchantId }, amount: { currency_code: "USD", value: (offer.amount / 100).toFixed(2) }, soft_descriptor: "QRGUITAR" }],
      application_context: { brand_name: config.merchantName, shipping_preference: "NO_SHIPPING", user_action: "PAY_NOW",
        return_url: `${config.origin}/billing/paypal/return?orderId=${orderId}`, cancel_url: `${config.origin}/billing/paypal/cancel?orderId=${orderId}` }
    }, requestId("qgc", orderId)),
    getOrder: id => api(`/v2/checkout/orders/${providerId(id)}`),
    captureOrder: (id, localOrderId) => api(`/v2/checkout/orders/${providerId(id)}/capture`, "POST", {}, requestId("qgp", localOrderId)),
    getCapture: id => api(`/v2/payments/captures/${providerId(id)}`),
    getRefund: id => api(`/v2/payments/refunds/${providerId(id)}`),
    getDispute: id => api(`/v1/customer/disputes/${disputeId(id)}`),
    verifyWebhook: async (event, headers, rawEvent) => {
      const envelope = JSON.stringify({
        auth_algo: headers["paypal-auth-algo"], cert_url: headers["paypal-cert-url"], transmission_id: headers["paypal-transmission-id"],
        transmission_sig: headers["paypal-transmission-sig"], transmission_time: headers["paypal-transmission-time"], webhook_id: config.webhookId
      });
      const original = rawEvent ?? JSON.stringify(event);
      // Keep PayPal's bounded webhook JSON bytes unchanged inside the verification
      // postback. The handler separately parses the same bytes for business logic.
      const result = await api("/v1/notifications/verify-webhook-signature", "POST", `${envelope.slice(0, -1)},"webhook_event":${original}}`);
      return result.verification_status === "SUCCESS";
    }
  };
}
