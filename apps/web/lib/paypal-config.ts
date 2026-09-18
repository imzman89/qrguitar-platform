import "server-only";

export type PayPalConfig = {
  configured: boolean; enabled: boolean; environment: "live" | "test"; clientId: string; secret: string; merchantId: string;
  webhookId: string; merchantName: string; origin: string; applePayEnabled: boolean;
};
export function readPayPalWebhookSweepSecret(env: Record<string,string|undefined>) {
  const value=env.CRON_SECRET||"";
  return value.length>=32&&value.length<=256&&!/[\s\x00-\x1f\x7f]/.test(value)?value:"";
}
export function readPayPalConfig(env: Record<string, string | undefined>, environment: "live" | "test"): PayPalConfig {
  const text = (key: string, max: number) => {
    const value = env[key] || ""; return value.length <= max && !/[\s\x00-\x1f\x7f]/.test(value) ? value : "";
  };
  const clientId = text("PAYPAL_CLIENT_ID", 256), secret = text("PAYPAL_CLIENT_SECRET", 512), merchantId = text("PAYPAL_MERCHANT_ID", 32), webhookId = text("PAYPAL_WEBHOOK_ID", 128);
  let origin = "https://www.qrguitar.com";
  if (environment === "test") {
    try { const url = new URL(env.QRGUITAR_BILLING_TEST_APP_URL || "");
      if ((url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) || url.username || url.password || url.pathname !== "/" || url.search || url.hash || ["qrguitar.com", "www.qrguitar.com"].includes(url.hostname)) origin = "";
      else origin = url.origin;
    } catch { origin = ""; }
  }
  const ready = Boolean(/^[A-Za-z0-9_-]{10,256}$/.test(clientId) && secret && /^[A-Z0-9]{13}$/.test(merchantId) && webhookId
    && readPayPalWebhookSweepSecret(env) && origin && env.PAYPAL_ENVIRONMENT === environment);
  return { configured:ready,enabled: ready && env.QRGUITAR_PAYPAL_ENABLED === "true", environment, clientId: ready ? clientId : "", secret: ready ? secret : "",
    merchantId: ready ? merchantId : "", webhookId: ready ? webhookId : "", merchantName: "QRguitar", origin,
    applePayEnabled: ready && env.QRGUITAR_PAYPAL_APPLE_PAY_ENABLED === "true" };
}
