import { cleanCollectionWebsite } from "./public-collections";
export { cleanCollectionWebsite as cleanProfileSupportingUrl } from "./public-collections";

export type SaleProfile = {
  saleStatus?: string;
  safetyStatus?: string;
  shopUrl?: string;
  reverbUrl?: string;
  customLinks?: Array<{ label?: string; url?: string }>;
};

export function isPurchaseProfileLink(label: unknown) {
  return typeof label === "string" && ["shop", "reverb"].includes(label.trim().toLowerCase());
}

/** A store homepage is useful context, but cannot identify this instrument. */
export function cleanMerchantItemUrl(value: unknown): string {
  const href = cleanCollectionWebsite(value);
  if (!href) return "";
  const url = new URL(href);
  const path = url.pathname.replace(/\/+$/, "").toLowerCase();
  if (!path || /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(?:cart|checkout|checkouts|my-account)(?:\/.*)?$/.test(path)
    || /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(?:shop|store|products|collections)$/.test(path)) return "";
  if (url.searchParams.has("add-to-cart")) return "";
  return href;
}

// Only item-specific seller links qualify; a member homepage is not a checkout.
export function profilePurchaseLink(profile: SaleProfile): { href: string; host: string } | null {
  if (profile.saleStatus !== "for_sale" || profile.safetyStatus === "lost" || profile.safetyStatus === "stolen") return null;
  const savedLink = (label: string) => {
    const links = (profile.customLinks || []).filter((link) => typeof link?.label === "string" && link.label.trim().toLowerCase() === label);
    if (links.length > 1) return "";
    for (const link of links) {
      const href = cleanMerchantItemUrl(link.url);
      if (href) return href;
    }
    return "";
  };
  const href = cleanMerchantItemUrl(profile.shopUrl) || cleanMerchantItemUrl(profile.reverbUrl) || savedLink("shop") || savedLink("reverb");
  return href ? { href, host: new URL(href).hostname.replace(/^www\./, "") } : null;
}
