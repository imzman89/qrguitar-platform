"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BrandLogo } from "./BrandLogo";
import { defaultSiteSettings, fetchPublishedSiteSettings, type EditableSiteSettings } from "../lib/site-settings";
import { clearQrGuitarSessionState, createBrowserSupabaseClient } from "../lib/supabase-browser";

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
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/contact">Contact</Link>
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
