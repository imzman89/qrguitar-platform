"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BrandLogo } from "./BrandLogo";
import { createBrowserSupabaseClient } from "../lib/supabase-browser";

export function Nav() {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  async function logout() {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    setIsSignedIn(false);
    setIsOpen(false);
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
        {isSignedIn ? (
          <button type="button" onClick={() => void logout()}>Logout</button>
        ) : (
          <Link href="/login">Login</Link>
        )}
      </nav>
    </header>
  );
}
