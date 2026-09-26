import { cleanCollectionWebsite } from "./public-collections";

type SaleProfile = {
  saleStatus?: string;
  safetyStatus?: string;
  shopUrl?: string;
  reverbUrl?: string;
};

// Only item-specific seller links qualify; a member homepage is not a checkout.
export function profilePurchaseLink(profile: SaleProfile): { href: string; host: string } | null {
  if (profile.saleStatus !== "for_sale" || profile.safetyStatus === "lost" || profile.safetyStatus === "stolen") return null;
  const href = cleanCollectionWebsite(profile.shopUrl) || cleanCollectionWebsite(profile.reverbUrl);
  return href ? { href, host: new URL(href).hostname.replace(/^www\./, "") } : null;
}
