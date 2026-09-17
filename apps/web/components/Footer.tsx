"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BrandLogo } from "./BrandLogo";
import { defaultSiteSettings, fetchPublishedSiteSettings, type EditableSiteSettings } from "../lib/site-settings";
import { useAuthNavigation } from "../lib/use-auth-navigation";
import { getContentValue } from "../lib/content-registry";

export function Footer() {
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
    <footer className="footer">
      <div className="shell footer-grid">
        <div className="footer-brand-block">
          <BrandLogo className="brand-logo brand-logo--footer" />
          <p>{getContentValue(settings.content, "global.footer.description") || settings.tagline}</p>
        </div>
        <nav className="footer-links" aria-label="Footer navigation">
          {footerLinks.map((item) => <Link href={item.ctaUrl || "/"} key={item.id}>{item.ctaLabel || item.title}</Link>)}
          {isSignedIn ? (
            <button type="button" disabled={signingOut} onClick={() => void logout()}>{signingOut ? "Signing out..." : "Logout"}</button>
          ) : (
            <Link href="/login">Login</Link>
          )}
          {logoutError ? <p role="alert">{logoutError}</p> : null}
          <a href="mailto:support@qrguitar.com">{getContentValue(settings.content, "global.footer.supportLabel")}: support@qrguitar.com</a>
        </nav>
      </div>
    </footer>
  );
}
