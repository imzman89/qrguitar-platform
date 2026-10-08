"use client";
import { useUiText } from "./UiTextProvider";
import styles from "./PublicCreditPricing.module.css";
/** Informational access policy; no account lookup or new Profile-credit purchase. */
export function PublicCreditPricing({ compact=false }: { compact?:boolean }) {
 const ui=useUiText("components.PublicCreditPricing");
 return <section className={compact?`${styles.pricing} ${styles.compact}`:styles.pricing} aria-label={ui("ui.components.PublicCreditPricing.freeAccess","Profiles are always free")}><h3>{ui("ui.components.PublicCreditPricing.freeAccess","Profiles are always free")}</h3><p>{ui("ui.components.PublicCreditPricing.optionalServices","Verification and authentication are optional paid services. Creating a Profile does not grant either status.")}</p></section>;
}
