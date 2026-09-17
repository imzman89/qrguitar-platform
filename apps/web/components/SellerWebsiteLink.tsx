import { ArrowUpRight } from "lucide-react";
import { cleanCollectionWebsite } from "../lib/public-collections";
import styles from "./SellerWebsiteLink.module.css";

export function SellerWebsiteLink({ websiteUrl, publicName, accountType }: { websiteUrl?: string; publicName: string; accountType: string }) {
  const href = cleanCollectionWebsite(websiteUrl);
  if (!href) return null;
  const host = new URL(href).hostname.replace(/^www\./, "");
  const label = accountType === "shop" ? "Visit shop website"
    : accountType === "builder" ? "Visit builder website"
    : accountType === "luthier" ? "Visit service website" : "Visit owner website";
  return <a className={styles.link} href={href} target="_blank" rel="noopener noreferrer" aria-label={`${label}: ${publicName} (${host}, opens in a new tab)`}>
    <span><strong>{label}</strong><small>{host}</small></span><ArrowUpRight size={19} aria-hidden="true" />
  </a>;
}
