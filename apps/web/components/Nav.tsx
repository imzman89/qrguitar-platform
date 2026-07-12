"use client";

import Link from "next/link";
import { LogOut, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { BrandLogo } from "./BrandLogo";
import { clearQrGuitarSessionState, createBrowserSupabaseClient } from "../lib/supabase-browser";

export function Nav() {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

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
      <button className="nav-toggle" type="button" onClick={() => setIsOpen((open) => !open)} aria-expanded={isOpen} aria-controls="primary-navigation">
        Menu
      </button>
      <nav className={isOpen ? "nav-links open" : "nav-links"} id="primary-navigation" aria-label="Primary navigation">
        <Link href="/dashboard">Dashboard</Link>
        <Link href="/catalog">Catalog</Link>
        <Link href="/create">Create</Link>
        <Link href="/how-it-works">How It Works</Link>
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
