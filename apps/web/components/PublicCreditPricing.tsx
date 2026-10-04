"use client";

import { DIRECT_OFFERS } from "../lib/direct-payments";
import { useUiText } from "./UiTextProvider";
import styles from "./PublicCreditPricing.module.css";

const money = (amount: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount / 100);

/** Standard, non-promotional prices from the same approved contract as PayPal.
 * Informational only: no SDK, credentials, account lookup, or checkout action. */
export function PublicCreditPricing({ compact = false }: { compact?: boolean }) {
  const ui = useUiText("components.PublicCreditPricing");
  return <section className={compact ? `${styles.pricing} ${styles.compact}` : styles.pricing} aria-label={ui("ui.components.PublicCreditPricing.title", "Permanent Profile credit prices")}>
    {!compact ? <><h3>{ui("ui.components.PublicCreditPricing.title", "Permanent Profile credit prices")}</h3>
    <p>{ui("ui.components.PublicCreditPricing.terms", "Your first 5 Profiles are free. Additional credits are one-time purchases in USD, never expire, and are used after your free allowance. Ownership transfers are free.")}</p></> : null}
    <dl className={styles.packs}>{DIRECT_OFFERS.map(offer => <div key={offer.key}>
      <dt>{offer.credits === 1 ? ui("ui.components.PublicCreditPricing.single", "1 Profile credit") : ui("ui.components.PublicCreditPricing.pack", "{{credits}} Profile credits", { credits: offer.credits })}</dt>
      <dd>{money(offer.amount)}</dd>
    </div>)}</dl>
    <p className={styles.note}>{ui("ui.components.PublicCreditPricing.availability", "Standard prices in USD. Sign in to manage credits and see any eligible offers.")}</p>
  </section>;
}
