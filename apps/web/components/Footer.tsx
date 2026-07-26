"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BrandLogo } from "./BrandLogo";
import { defaultSiteSettings, fetchPublishedSiteSettings, type EditableSiteSettings } from "../lib/site-settings";
import { clearQrGuitarSessionState, createBrowserSupabaseClient } from "../lib/supabase-browser";
import { getContentValue } from "../lib/content-registry";

export function Footer() {
  const [settings, setSettings] = useState<EditableSiteSettings>(defaultSiteSettings);
  const [isSignedIn, setIsSignedIn] = useState(false);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    void fetchPublishedSiteSettings().then((published) => {
      if (published) {
        setSettings(published);
      }
    });
    supabase.auth.getSession().then(({ data }) => setIsSignedIn(Boolean(data.session?.user)));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsSignedIn(Boolean(session?.user));
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  async function logout() {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    clearQrGuitarSessionState();
    setIsSignedIn(false);
  }

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
            <button type="button" onClick={() => void logout()}>Logout</button>
          ) : (
            <Link href="/login">Login</Link>
          )}
          <a href="mailto:support@qrguitar.com">{getContentValue(settings.content, "global.footer.supportLabel")}: support@qrguitar.com</a>
        </nav>
      </div>
    </footer>
  );
}
