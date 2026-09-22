"use client";
import { useUiText } from "./UiTextProvider";


import Link from "./CheckoutAwareLink";
import { useEffect, useState } from "react";
import { BrandLogo } from "./BrandLogo";
import { defaultSiteSettings, fetchPublishedSiteSettings, type EditableSiteSettings } from "../lib/site-settings";
import { useAuthNavigation } from "../lib/use-auth-navigation";
import { getContentValue } from "../lib/content-registry";

import styles from "./Footer.module.css";

export function Footer() {
  const ui = useUiText("components.Footer");
  const [settings, setSettings] = useState<EditableSiteSettings>(defaultSiteSettings);
  const { signedIn: isSignedIn, signingOut, logoutError, logout } = useAuthNavigation();

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

  return (
    <footer className={`footer ${styles.footer}`}>
      <div className="shell footer-grid">
        <div className="footer-brand-block">
          <BrandLogo className="brand-logo brand-logo--footer" />
          <p>{getContentValue(settings.content, "global.footer.description") || settings.tagline}</p>
        </div>
        <nav className="footer-links" aria-label={ui("ui.components.Footer.76363a64dcfa", "Footer navigation")}>
          {footerLinks.filter((item) => isSignedIn || item.ctaUrl !== "/dashboard").map((item) => <Link href={item.ctaUrl || "/"} key={item.id}>{item.ctaLabel || item.title}</Link>)}
          {isSignedIn ? (
            <button type="button" disabled={signingOut} onClick={() => void logout()}>{signingOut ? ui("ui.components.Footer.0436231679a0", "Signing out...") : ui("ui.components.Footer.d0527e4b3d65", "Logout")}</button>
          ) : (
            <Link href="/login">{ui("ui.components.Footer.9d6322c1f4d9", "Login")}</Link>
          )}
          {logoutError ? <p role="alert">{logoutError}</p> : null}
          <a href="mailto:support@qrguitar.com">{getContentValue(settings.content, "global.footer.supportLabel")}{ui("ui.components.Footer.7f508ae575ac", ": support@qrguitar.com")}</a>
        </nav>
      </div>
    </footer>
  );
}
