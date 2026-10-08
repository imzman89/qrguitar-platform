import "server-only";
import { DIRECT_METHOD_LABELS, DIRECT_OFFERS, directPaymentUrl, isDirectMethod, type DirectMethodKey, type DirectOfferKey, type DirectRecipient } from "./direct-payments";

type ConfiguredMethod = { key: DirectMethodKey; label: string; recipient: Omit<DirectRecipient, "paymentUrl">; links: Partial<Record<DirectOfferKey, string>> };
export type DirectPaymentsConfig = { enabled: boolean; methods: ConfiguredMethod[]; approvalMessage: string };
const text = (value: unknown, maximum: number) => typeof value === "string" && value.trim().length <= maximum && !/[\x00-\x1f\x7f]/.test(value) ? value.trim() : "";
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export function readDirectPaymentsConfig(env: Record<string, string | undefined>): DirectPaymentsConfig {
  const fallback = "Payments are checked manually. Your credits appear after QRguitar confirms receipt. Keep your order reference if you need help.";
  const config: DirectPaymentsConfig = { enabled: false, methods: [], approvalMessage: text(env.QRGUITAR_DIRECT_APPROVAL_MESSAGE, 400) || fallback };
  const merchant = text(env.QRGUITAR_DIRECT_MERCHANT_NAME, 120);
  if (!merchant || !env.QRGUITAR_DIRECT_PAYMENT_METHODS || env.QRGUITAR_DIRECT_PAYMENT_METHODS.length > 16000) return config;
  try {
    const rows: unknown = JSON.parse(env.QRGUITAR_DIRECT_PAYMENT_METHODS);
    if (!Array.isArray(rows) || rows.length < 1 || rows.length > 4) return config;
    for (const input of rows) {
      const row = object(input);
      if (!isDirectMethod(row.key) || config.methods.some(method => method.key === row.key)) return { ...config, methods: [] };
      const accountKey = text(row.accountKey, 120).toLowerCase(), address = text(row.address, 200);
      if (!/^[a-z0-9][a-z0-9_.:-]{2,119}$/.test(accountKey)) return { ...config, methods: [] };
      const links: Partial<Record<DirectOfferKey, string>> = {};
      for (const offer of DIRECT_OFFERS) {
        const inputLink = object(row.paymentUrls)[offer.key] ?? (row.key === "paypal" ? undefined : row.paymentUrl);
        if (inputLink !== undefined && inputLink !== null && inputLink !== "") {
          const link = directPaymentUrl(row.key, inputLink);
          if (!link) return { ...config, methods: [] };
          links[offer.key] = link;
        }
        // Customer privacy: a private phone/email alone is never a public payment method.
        if (!links[offer.key]) return { ...config, methods: [] };
      }
      // Hosted PayPal products have fixed prices; one reusable URL cannot represent three packs.
      if (row.key === "paypal" && new Set(Object.values(links)).size !== DIRECT_OFFERS.length) return { ...config, methods: [] };
      if (row.key === "zelle" && !address) return { ...config, methods: [] };
      config.methods.push({ key: row.key, label: DIRECT_METHOD_LABELS[row.key], recipient: { accountKey, displayName: merchant, address: address || null }, links });
    }
    config.enabled = env.QRGUITAR_DIRECT_PAYMENTS_ENABLED === "true";
  } catch { config.methods = []; }
  return config;
}
