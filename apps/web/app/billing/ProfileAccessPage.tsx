"use client";
import Link from "../../components/CheckoutAwareLink";
import { Nav } from "../../components/Nav";
import { OwnerWorkspace } from "../../components/OwnerWorkspace";
import { Footer } from "../../components/Footer";
import { useUiText } from "../../components/UiTextProvider";
import styles from "./profile-access.module.css";
export default function ProfileAccessPage() {
 const ui=useUiText("app.billing.ProfileAccessPage");
 return <><Nav/><OwnerWorkspace current="billing"><div className={styles.page}><div className={styles.shell}>
 <header className={styles.hero}><p className={styles.eyebrow}>{ui("ui.app.billing.ProfileAccessPage.eyebrow", "PROFILE ACCESS")}</p><h1>{ui("ui.app.billing.ProfileAccessPage.title", "A home for every instrument.")}</h1><p>{ui("ui.app.billing.ProfileAccessPage.body", "Profiles are always free. Document your instruments, build their history and pass the same Profile to the next owner.")}</p></header>
 <section className={styles.free}><h2>{ui("ui.app.billing.ProfileAccessPage.freeTitle", "Your Profile. Your history.")}</h2><p>{ui("ui.app.billing.ProfileAccessPage.freeBody", "Create and maintain basic Profiles without a count limit. Photos, specifications, privacy controls, QR downloads and ownership handoffs stay connected.")}</p><div className={styles.actions}><Link className={styles.primary} href="/create">{ui("ui.app.billing.ProfileAccessPage.create", "Create a free Profile")} <span aria-hidden="true">↗</span></Link><Link href="/dashboard">{ui("ui.app.billing.ProfileAccessPage.collection", "My collection")} <span aria-hidden="true">→</span></Link></div></section>
 <section className={styles.optional}><p className={styles.eyebrow}>{ui("ui.app.billing.ProfileAccessPage.optional", "OPTIONAL PAID SERVICES")}</p><div className={styles.reviews}><article><h2>{ui("ui.app.billing.ProfileAccessPage.verification", "Verification")}</h2><p>{ui("ui.app.billing.ProfileAccessPage.verificationBody", "Request a review of the information and evidence recorded in a Profile. Creating a free Profile does not grant verified status.")}</p></article><article><h2>{ui("ui.app.billing.ProfileAccessPage.authentication", "Authentication")}</h2><p>{ui("ui.app.billing.ProfileAccessPage.authenticationBody", "Request a separate authenticity review for the instrument. A Profile or verification alone does not confirm authenticity.")}</p></article></div><div className={styles.actions}><Link className={styles.primary} href="/contact">{ui("ui.app.billing.ProfileAccessPage.contact", "Discuss a review")} <span aria-hidden="true">↗</span></Link><p>{ui("ui.app.billing.ProfileAccessPage.terms", "Service availability, scope and price are confirmed before you agree to a paid review.")}</p></div></section>
 <Link className={styles.earlier} href="/contact">{ui("ui.app.billing.ProfileAccessPage.earlier", "Questions about an earlier payment? Contact QRguitar.")}</Link>
 </div></div></OwnerWorkspace><Footer/></>;
}
