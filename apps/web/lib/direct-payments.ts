/** Public payment contract. Receiving details come only from a server-created order. */
export type DirectMethodKey = "venmo" | "cashapp" | "zelle" | "paypal";
export type DirectOfferKey = "profile_1" | "profile_10" | "profile_25";
export type DirectMethod = { key: DirectMethodKey; label: string };
export type DirectOffer = { key: DirectOfferKey; version: 1; currency: "usd"; amount: number; credits: number; permanent: true; freeAllowance: 5 };
export type DirectRecipient = { accountKey: string; displayName: string; paymentUrl: string | null; address: string | null };
export type DirectOrder = {
  orderId: string; ownerId: string; requestId: string; offerKey: DirectOfferKey;
  method: DirectMethodKey; status: "awaiting_payment" | "pending_review" | "fulfilled" | "closed";
  reference: string; offer: DirectOffer; recipient: DirectRecipient; createdAt: string; payerReference: string | null;
};
export const DIRECT_METHOD_LABELS: Record<DirectMethodKey, string> = { paypal: "Card or PayPal", venmo: "Venmo", cashapp: "Cash App", zelle: "Zelle" };
export const DIRECT_OFFERS: readonly DirectOffer[] = Object.freeze([
  Object.freeze({ key: "profile_1", version: 1, currency: "usd", amount: 1200, credits: 1, permanent: true, freeAllowance: 5 }),
  Object.freeze({ key: "profile_10", version: 1, currency: "usd", amount: 5000, credits: 10, permanent: true, freeAllowance: 5 }),
  Object.freeze({ key: "profile_25", version: 1, currency: "usd", amount: 9900, credits: 25, permanent: true, freeAllowance: 5 })
]);
export function isDirectMethod(value: unknown): value is DirectMethodKey {
  return typeof value === "string" && Object.hasOwn(DIRECT_METHOD_LABELS, value);
}
export function directPaymentUrl(method: DirectMethodKey, value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2000 || /[\\\s]/.test(value) || !/^https:\/\//i.test(value)) return null;
  try {
    const url = new URL(value);
    const hosts: Record<DirectMethodKey, string[]> = {
      venmo: ["venmo.com", "www.venmo.com", "account.venmo.com"],
      cashapp: ["cash.app"],
      zelle: ["zelle.com", "www.zelle.com", "zellepay.com", "www.zellepay.com", "enroll.zellepay.com"],
      paypal: ["paypal.com", "www.paypal.com", "www.sandbox.paypal.com", "sandbox.paypal.com"]
    };
    if (url.protocol !== "https:" || url.username || url.password || url.port || !hosts[method].includes(url.hostname)
      || !/^https:\/\/[^/:?#]+(?:\/|\?|#|$)/i.test(value)) return null;
    if (method === "paypal" && !/^\/(?:ncp\/payment|pay|checkoutnow)\//.test(url.pathname) && !/^\/checkoutnow$/.test(url.pathname)) return null;
    return url.href;
  } catch { return null; }
}
