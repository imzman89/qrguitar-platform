"use client";
import { useUiText } from "./UiTextProvider";


import Link from "./CheckoutAwareLink";
import { useEffect, useState } from "react";
import { BrandLogo } from "./BrandLogo";
import { defaultSiteSettings, fetchPublishedSiteSettings, type EditableSiteSettings } from "../lib/site-settings";
import { useAuthNavigation } from "../lib/use-auth-navigation";
import { safeAuthRedirect } from "../lib/auth-redirect";
import { usePathname } from "next/navigation";
import { getContentValue } from "../lib/content-registry";

import styles from "./Footer.module.css";

export function Footer() {
  const ui = useUiText("components.Footer");
  const pathname = usePathname();
  const [settings, setSettings] = useState<EditableSiteSettings>(defaultSiteSettings);
  const { signedIn: isSignedIn, authError, retrySession, signingOut, logoutError, logout } = useAuthNavigation();

  useEffect(() => {
    let active = true;
    void fetchPublishedSiteSettings().then((published) => {
      if (active && published) {
        setSettings(published);
      }
    });
    return () => { active = false; };
  }, []);

  const footerLinks = settings.composition.footer.sections
    .find((section) => section.id === "links")
    ?.blocks.filter((block) => block.visible) || [];
  const hasInstallerLink = settings.composition.footer.sections.some(section => section.blocks.some(block => block.ctaUrl === "/installers"));
  const signInHref = `/login?next=${encodeURIComponent(safeAuthRedirect(`${pathname}${typeof window === "undefined" ? "" : window.location.search + window.location.hash}`))}`;

  return (
    <footer className={`footer ${styles.footer}`}>
      <div className="shell footer-grid">
        <div className="footer-brand-block">
          <BrandLogo className="brand-logo brand-logo--footer" />
          <p>{getContentValue(settings.content, "global.footer.description") || settings.tagline}</p>
          <p>{ui("ui.components.Footer.copyright", "Copyright {{year}} QRguitar. All rights reserved.", { year: new Date().getFullYear() })}</p>
        </div>
        <nav className="footer-links" aria-label={ui("ui.components.Footer.76363a64dcfa", "Footer navigation")}>
          {footerLinks.filter((item) => isSignedIn || item.ctaUrl !== "/dashboard").map((item) => <Link href={item.ctaUrl || "/"} key={item.id}>{item.ctaLabel || item.title}</Link>)}
          {!hasInstallerLink ? <Link href="/installers">{ui("ui.components.Footer.installers", "Installer program")}</Link> : null}
          {isSignedIn ? (
            <button type="button" disabled={signingOut} onClick={() => void logout()}>{signingOut ? ui("ui.components.Footer.0436231679a0", "Signing out...") : ui("ui.components.Footer.d0527e4b3d65", "Logout")}</button>
          ) : isSignedIn === false ? (
            <Link href={signInHref}>{ui("ui.components.Footer.9d6322c1f4d9", "Login")}</Link>
          ) : authError ? <button type="button" onClick={retrySession}>{ui("ui.components.Footer.retrySignIn", "Retry sign-in check")}</button>
            : <Link href="/account">{ui("ui.components.Footer.accountAccess", "Account access")}</Link>}
          {authError ? <p className={styles.sessionNotice} role="alert">{ui("ui.components.Footer.signInCheckFailure", "Your sign-in could not be checked. Retry without signing in again.")}</p> : null}
          {logoutError ? <p className={styles.sessionNotice} role="alert">{logoutError}</p> : null}
          <a href="mailto:support@qrguitar.com">{getContentValue(settings.content, "global.footer.supportLabel")}{ui("ui.components.Footer.7f508ae575ac", ": support@qrguitar.com")}</a>
        </nav>
      </div>
    </footer>
  );
}
