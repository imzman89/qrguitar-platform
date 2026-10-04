import { cleanCollectionWebsite } from "./public-collections";
import { cleanMerchantItemUrl, profilePurchaseLink, type SaleProfile } from "./profile-purchase-link";

export const saleDetailLabels = ["Asking price", "Currency", "Store name", "Store platform", "Store item ID", "Store cart URL"] as const;
export type SaleDetailLabel = typeof saleDetailLabels[number];
type Detail = { id: string; label: string; value: string };
type Profile = SaleProfile & {
  customFields?: Array<{ label?: string; value?: string }>;
  publicCollection?: { publicName: string; websiteUrl?: string };
};

export function isSaleDetail(label: string) {
  return saleDetailLabels.some((name) => name.toLowerCase() === label.trim().toLowerCase());
}

export function readSaleDetail(profile: Pick<Profile, "customFields">, label: SaleDetailLabel): string {
  const values = (profile.customFields || []).filter((field) => typeof field.label === "string" && field.label.trim().toLowerCase() === label.toLowerCase());
  // Conflicting mappings must not choose an arbitrary product or currency.
  return values.length === 1 && typeof values[0].value === "string" ? values[0].value.trim() : "";
}

export function updateSaleDetail(fields: Detail[], label: SaleDetailLabel, value: string): Detail[] {
  const existing = fields.find((field) => field.label.trim().toLowerCase() === label.toLowerCase());
  const remainder = fields.filter((field) => field.label.trim().toLowerCase() !== label.toLowerCase());
  return value ? [...remainder, { id: existing?.id || `sale-${label.toLowerCase().replaceAll(" ", "-")}`, label, value }] : remainder;
}

export function profileAskingPrice(profile: Profile): string | null {
  const amount = readSaleDetail(profile, "Asking price");
  const currency = readSaleDetail(profile, "Currency").toUpperCase();
  if (!/^(?:0|[1-9]\d{0,8})(?:\.\d{1,3})?$/.test(amount) || !/^[A-Z]{3}$/.test(currency) || Number(amount) <= 0) return null;
  if (!Intl.supportedValuesOf("currency").includes(currency)) return null;
  const format = new Intl.NumberFormat("en-US", { style: "currency", currency, currencyDisplay: "code" });
  const digits = format.resolvedOptions().maximumFractionDigits ?? 2;
  if ((amount.split(".")[1]?.length || 0) > digits) return null;
  return format.format(Number(amount));
}

function shopItem(profile: Profile) {
  return profilePurchaseLink({ ...profile, reverbUrl: undefined, customLinks: profile.customLinks?.filter((link) => link.label?.trim().toLowerCase() === "shop") });
}

/** Explicit WooCommerce mapping only: no platform inference from a hostname. */
export function wooCommerceCartLink(profile: Profile): { href: string; host: string } | null {
  if (profile.saleStatus !== "for_sale" || ["lost", "stolen"].includes(profile.safetyStatus || "")) return null;
  if (readSaleDetail(profile, "Store platform").toLowerCase() !== "woocommerce") return null;
  const listing = shopItem(profile);
  const cartHref = cleanCollectionWebsite(readSaleDetail(profile, "Store cart URL"));
  const id = readSaleDetail(profile, "Store item ID");
  if (!listing || !cartHref || !/^[1-9]\d{0,19}$/.test(id)) return null;
  const cart = new URL(cartHref);
  const item = new URL(listing.href);
  // Store owner supplies its cart page, including any WordPress installation path.
  // Refuse cross-store destinations and existing query strings rather than mixing mappings.
  if (cart.origin !== item.origin || cart.search || cart.hash || !cart.pathname || cart.pathname === "/"
    || /%(?:2f|5c|2e)/i.test(cart.pathname) || /\/(?:checkout|clear|update|change)(?:\/|$)/i.test(cart.pathname)) return null;
  cart.searchParams.set("add-to-cart", id);
  cart.searchParams.set("quantity", "1");
  return { href: cart.href, host: listing.host };
}

export function profileSaleOffer(profile: Profile) {
  if (profile.saleStatus !== "for_sale" || ["lost", "stolen"].includes(profile.safetyStatus || "")) return null;
  const listing = profilePurchaseLink(profile);
  const cart = wooCommerceCartLink(profile);
  const target = cart || listing;
  const collectionWebsite = cleanCollectionWebsite(profile.publicCollection?.websiteUrl);
  const sameStore = target && collectionWebsite && new URL(collectionWebsite).origin === new URL(target.href).origin;
  const savedName = readSaleDetail(profile, "Store name").replace(/\s+/g, " ").slice(0, 80);
  const shop = shopItem(profile);
  const storeName = (shop && listing?.href === shop.href ? savedName : "") || (sameStore ? profile.publicCollection?.publicName : "") || target?.host || "";
  return { target, listing, cart, storeName, price: profileAskingPrice(profile) };
}

export function profileSaleFieldsError(profile: Profile): string {
  if (profile.saleStatus !== "for_sale") return "";
  const hasPrice = (profile.customFields || []).some((field) => ["asking price", "currency"].includes(field.label?.trim().toLowerCase() || "") && field.value?.trim());
  if (hasPrice && !profileAskingPrice(profile)) return "Enter a positive asking price and choose its currency. Use the currency’s decimal places.";
  const shopLinks = (profile.customLinks || []).filter((link) => link.label?.trim().toLowerCase() === "shop" && link.url?.trim());
  if (shopLinks.length > 1 || shopLinks.some((link) => !cleanMerchantItemUrl(link.url))) return "Use one secure https:// instrument page for the Shop link, rather than a homepage or checkout link.";
  if (readSaleDetail(profile, "Store platform").toLowerCase() === "woocommerce" && !wooCommerceCartLink(profile)) return "Check the WooCommerce product or variation ID and cart page URL. The instrument page and cart must use the same store.";
  return "";
}
