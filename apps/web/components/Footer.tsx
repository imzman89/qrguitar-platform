"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BrandLogo } from "./BrandLogo";
import { defaultSiteSettings, fetchPublishedSiteSettings, type EditableSiteSettings } from "../lib/site-settings";
import { createBrowserSupabaseClient } from "../lib/supabase-browser";

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

    function onSettings(event: Event) {
      const detail = (event as CustomEvent<EditableSiteSettings>).detail;
      if (detail) {
        setSettings(detail);
      }
    }

    window.addEventListener("qrguitar:site-settings", onSettings);
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsSignedIn(Boolean(session?.user));
    });

    return () => {
      window.removeEventListener("qrguitar:site-settings", onSettings);
      listener.subscription.unsubscribe();
    };
  }, []);

  async function logout() {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    window.localStorage.removeItem("qrguitar.siteEditorUnlocked");
    setIsSignedIn(false);
  }

  return (
    <footer className="footer">
      <div className="shell footer-grid">
        <div className="footer-brand-block">
          <BrandLogo className="brand-logo brand-logo--footer" />
          <p>{settings.tagline}</p>
        </div>
        <nav className="footer-links" aria-label="Footer navigation">
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/catalog">Catalog</Link>
          <Link href="/create">Create</Link>
          {isSignedIn ? (
            <button type="button" onClick={() => void logout()}>Logout</button>
          ) : (
            <Link href="/login">Login</Link>
          )}
          <a href="mailto:support@qrguitar.com">support@qrguitar.com</a>
        </nav>
      </div>
    </footer>
  );
}
