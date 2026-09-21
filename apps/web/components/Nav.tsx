"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, MessageCircle, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BrandLogo } from "./BrandLogo";
import { useAuthNavigation } from "../lib/use-auth-navigation";
import { defaultSiteSettings, fetchPublishedSiteSettings } from "../lib/site-settings";
import { getContentValue } from "../lib/content-registry";
import styles from "./Nav.module.css";

export function Nav() {
  const pathname = usePathname();
  const { signedIn: isSignedIn, signingOut, logoutError, logout: signOut, clearLogoutError } = useAuthNavigation();
  const [isOpen, setIsOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [content, setContent] = useState(defaultSiteSettings.content);
  const headerRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const accountRef = useRef<HTMLButtonElement>(null);

  async function logout() {
    if (await signOut()) {
      setIsOpen(false);
      setAccountMenuOpen(false);
    }
  }

  useEffect(() => {
    let active = true;
    void fetchPublishedSiteSettings().then((settings) => {
      if (active && settings) setContent(settings.content);
    });
    return () => { active = false; };
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
    ...(isSignedIn ? [{ href: "/dashboard", label: getContentValue(content, "global.navigation.dashboard") }] : []),
    { href: "/catalog", label: getContentValue(content, "global.navigation.catalog") },
    { href: "/collections", label: "Collections" },
    { href: "/how-it-works", label: getContentValue(content, "global.navigation.howItWorks") },
    { href: "/create", label: getContentValue(content, "global.navigation.create"), primary: true }
  ];

  return (
    <header className={`brand-frame ${styles.header}`} ref={headerRef} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
        setIsOpen(false);
        setAccountMenuOpen(false);
      }
    }}>
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
                onClick={() => { setAccountMenuOpen((open) => !open); clearLogoutError(); }}>
                <UserRound size={18} aria-hidden="true" /><span>Account</span>
              </button>
              {accountMenuOpen ? <div className={styles.dropdown} id="account-navigation">
                <Link href="/messages" onClick={() => { setIsOpen(false); setAccountMenuOpen(false); }}><MessageCircle size={16} aria-hidden="true" /> Messages</Link>
                <Link href="/account" onClick={() => { setIsOpen(false); setAccountMenuOpen(false); }}>Account settings</Link>
                <button type="button" disabled={signingOut} onClick={() => void logout()}><LogOut size={16} aria-hidden="true" /> {signingOut ? "Signing out..." : "Sign out"}</button>
                {logoutError ? <p role="alert">{logoutError}</p> : null}
              </div> : null}
            </div>
          ) : <Link href="/login" onClick={() => setIsOpen(false)}>Sign in</Link>}
        </nav>
      </div>
      {!isSignedIn && logoutError ? <div className="shell"><p className={styles.sessionNotice} role="alert">{logoutError}</p></div> : null}
    </header>
  );
}
