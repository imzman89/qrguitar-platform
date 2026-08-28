"use client";

import Link from "next/link";
import { LogOut, Menu, UserRound, X } from "lucide-react";
import { useEffect, useState } from "react";
import { BrandLogo } from "./BrandLogo";
import { clearQrGuitarSessionState, createBrowserSupabaseClient } from "../lib/supabase-browser";
import { defaultSiteSettings, fetchPublishedSiteSettings } from "../lib/site-settings";
import { getContentValue } from "../lib/content-registry";

export function Nav() {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [content, setContent] = useState(defaultSiteSettings.content);

  async function logout() {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    clearQrGuitarSessionState();
    setIsSignedIn(false);
    setIsOpen(false);
    setAccountMenuOpen(false);
  }

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    void fetchPublishedSiteSettings().then((settings) => {
      if (settings) setContent(settings.content);
    });
    supabase.auth.getSession().then(({ data }) => setIsSignedIn(Boolean(data.session?.user)));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsSignedIn(Boolean(session?.user));
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  return (
    <header className="shell nav">
      <Link className="brand" href="/" aria-label="QRguitar homepage">
        <BrandLogo className="brand-logo brand-logo--header" />
      </Link>
      <button
        className="nav-toggle"
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-controls="primary-navigation"
        aria-label={isOpen ? "Close navigation" : "Open navigation"}
      >
        {isOpen ? <X size={19} aria-hidden="true" /> : <Menu size={19} aria-hidden="true" />}
        <span className="sr-only">{isOpen ? "Close navigation" : "Open navigation"}</span>
      </button>
      <nav className={isOpen ? "nav-links open" : "nav-links"} id="primary-navigation" aria-label="Primary navigation">
        <Link href="/dashboard">{getContentValue(content, "global.navigation.dashboard")}</Link>
        <Link href="/catalog">{getContentValue(content, "global.navigation.catalog")}</Link>
        <Link href="/create">{getContentValue(content, "global.navigation.create")}</Link>
        <Link href="/how-it-works">{getContentValue(content, "global.navigation.howItWorks")}</Link>
        {isSignedIn ? (
          <div className="nav-account-menu">
            <button
              className="nav-account-button"
              type="button"
              aria-label="Account menu"
              aria-expanded={accountMenuOpen}
              onClick={() => setAccountMenuOpen((open) => !open)}
            >
              <UserRound size={17} aria-hidden="true" />
            </button>
            <div className={accountMenuOpen ? "nav-account-dropdown open" : "nav-account-dropdown"}>
              <Link href="/account" onClick={() => setAccountMenuOpen(false)}>Account</Link>
              <button type="button" onClick={() => void logout()}><LogOut size={14} /> Logout</button>
            </div>
          </div>
        ) : (
          <Link href="/login">Login</Link>
        )}
      </nav>
    </header>
  );
}
