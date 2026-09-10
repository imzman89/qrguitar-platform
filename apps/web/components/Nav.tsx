"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BrandLogo } from "./BrandLogo";
import { clearQrGuitarSessionState, createBrowserSupabaseClient } from "../lib/supabase-browser";
import { defaultSiteSettings, fetchPublishedSiteSettings } from "../lib/site-settings";
import { getContentValue } from "../lib/content-registry";
import styles from "./Nav.module.css";

export function Nav() {
  const pathname = usePathname();
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [content, setContent] = useState(defaultSiteSettings.content);
  const headerRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const accountRef = useRef<HTMLButtonElement>(null);

  async function logout() {
    try {
      const { error } = await createBrowserSupabaseClient().auth.signOut();
      if (error) throw error;
      clearQrGuitarSessionState();
      setIsSignedIn(false);
      setIsOpen(false);
      setAccountMenuOpen(false);
    } catch {
      setLogoutError("Could not sign out. Please try again.");
    }
  }

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    void fetchPublishedSiteSettings().then((settings) => {
      if (settings) setContent(settings.content);
    });
    void supabase.auth.getSession().then(({ data }) => setIsSignedIn(Boolean(data.session?.user)));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsSignedIn(Boolean(session?.user));
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    setIsOpen(false);
    setAccountMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    function dismiss(event: PointerEvent) {
      if (!headerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setAccountMenuOpen(false);
      }
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (accountMenuOpen) {
        setAccountMenuOpen(false);
        accountRef.current?.focus();
      } else if (isOpen) {
        setIsOpen(false);
        toggleRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [isOpen, accountMenuOpen]);

  const navigation = [
    { href: "/dashboard", label: getContentValue(content, "global.navigation.dashboard") },
    { href: "/catalog", label: getContentValue(content, "global.navigation.catalog") },
    { href: "/how-it-works", label: getContentValue(content, "global.navigation.howItWorks") },
    { href: "/create", label: getContentValue(content, "global.navigation.create"), primary: true }
  ];

  return (
    <header className={styles.header} ref={headerRef}>
      <div className={`shell ${styles.inner}`}>
        <Link className={styles.brand} href="/" aria-label="QRguitar homepage">
          <BrandLogo className={styles.logo} />
        </Link>
        <button ref={toggleRef} className={styles.toggle} type="button" onClick={() => setIsOpen((open) => !open)}
          aria-expanded={isOpen} aria-controls="primary-navigation" aria-label={isOpen ? "Close navigation" : "Open navigation"}>
          {isOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
        </button>
        <nav className={`${styles.links} ${isOpen ? styles.open : ""}`} id="primary-navigation" aria-label="Primary navigation">
          {navigation.map((item) => (
            <Link key={item.href} href={item.href} className={item.primary ? styles.primary : undefined}
              aria-current={pathname === item.href || pathname.startsWith(`${item.href}/`) ? "page" : undefined}
              onClick={() => setIsOpen(false)}>{item.label}</Link>
          ))}
          {isSignedIn ? (
            <div className={styles.account}>
              <button ref={accountRef} className={styles.accountButton} type="button" aria-label="Account menu"
                aria-expanded={accountMenuOpen} aria-controls="account-navigation"
                onClick={() => { setAccountMenuOpen((open) => !open); setLogoutError(""); }}>
                <UserRound size={18} aria-hidden="true" /><span>Account</span>
              </button>
              {accountMenuOpen ? <div className={styles.dropdown} id="account-navigation">
                <Link href="/account" onClick={() => { setIsOpen(false); setAccountMenuOpen(false); }}>Account settings</Link>
                <button type="button" onClick={() => void logout()}><LogOut size={16} aria-hidden="true" /> Sign out</button>
                {logoutError ? <p role="alert">{logoutError}</p> : null}
              </div> : null}
            </div>
          ) : <Link href="/login" onClick={() => setIsOpen(false)}>Sign in</Link>}
        </nav>
      </div>
    </header>
  );
}
