"use client";
import { useUiText } from "./UiTextProvider";


import Link from "./CheckoutAwareLink";
import { usePathname } from "next/navigation";
import { LogOut, Menu, MessageCircle, Search, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BrandLogo } from "./BrandLogo";
import { useAuthNavigation } from "../lib/use-auth-navigation";
import { safeAuthRedirect } from "../lib/auth-redirect";
import { defaultSiteSettings, fetchPublishedSiteSettings } from "../lib/site-settings";
import { getContentValue } from "../lib/content-registry";
import styles from "./Nav.module.css";

function signInReturnPath(pathname: string, search: string, hash: string) {
  if (/^\/(login|reset-password)\/?$/.test(pathname)) {
    // Only the validated destination survives; recovery codes and tokens do not.
    return safeAuthRedirect(new URLSearchParams(search).get("next"));
  }
  return safeAuthRedirect(`${pathname}${search}${hash}`);
}

export function Nav() {
  const ui = useUiText("components.Nav");
  const pathname = usePathname();
  const { signedIn: isSignedIn, authError, retrySession, signingOut, logoutError, logout: signOut, clearLogoutError } = useAuthNavigation();
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
    { href: "/catalog", label: getContentValue(content, "global.navigation.catalog") },
    { href: "/collections", label: ui("ui.components.Nav.collections", "Collections") },
    { href: "/how-it-works", label: getContentValue(content, "global.navigation.howItWorks") },
    { href: "/create", label: getContentValue(content, "global.navigation.create"), primary: true }
  ];
  const signInHref = `/login?next=${encodeURIComponent(signInReturnPath(pathname, typeof window === "undefined" ? "" : window.location.search, typeof window === "undefined" ? "" : window.location.hash))}`;

  return (
    <header className={`brand-frame ${styles.header}`} ref={headerRef} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
        setIsOpen(false);
        setAccountMenuOpen(false);
      }
    }}>
      <div className={`shell ${styles.inner}`}>
        <Link className={styles.brand} href="/" aria-label={ui("ui.components.Nav.33b14c935c51", "QRguitar homepage")}>
          <BrandLogo className={styles.logo} />
        </Link>
        <form action="/catalog" method="get" role="search" className={styles.search} aria-label={ui("ui.components.Nav.publicSearch", "Search public instruments")}>
          <label className={styles.searchLabel} htmlFor="global-instrument-search">{ui("ui.components.Nav.searchLabel", "Search instruments, brands and models")}</label>
          <input id="global-instrument-search" name="q" type="search" placeholder={ui("ui.components.Nav.searchPlaceholder", "Find your next discovery")} />
          <button type="submit" aria-label={ui("ui.components.Nav.searchSubmit", "Search instruments")}><Search size={18} aria-hidden="true" /></button>
        </form>
        <button ref={toggleRef} className={styles.toggle} type="button" onClick={() => setIsOpen((open) => !open)}
          aria-expanded={isOpen} aria-controls="primary-navigation" aria-label={isOpen ? ui("ui.components.Nav.99904db30de4", "Close navigation") : ui("ui.components.Nav.0ed77fd2619b", "Open navigation")}>
          {isOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
        </button>
        <nav className={`${styles.links} ${isOpen ? styles.open : ""}`} id="primary-navigation" aria-label={ui("ui.components.Nav.e1bfe7eccc45", "Primary navigation")}>
          {navigation.map((item) => (
            <Link key={item.href} href={item.href} className={item.primary ? styles.primary : undefined}
              aria-current={pathname === item.href || pathname.startsWith(`${item.href}/`) ? "page" : undefined}
              onClick={() => setIsOpen(false)}>{item.label}</Link>
          ))}
          {isSignedIn ? (
            <div className={styles.account}>
              <button ref={accountRef} className={styles.accountButton} type="button" aria-label={ui("ui.components.Nav.7fb5995bca43", "Account menu")}
                aria-expanded={accountMenuOpen} aria-controls="account-navigation"
                onClick={() => { setAccountMenuOpen((open) => !open); clearLogoutError(); }}>
                <UserRound size={18} aria-hidden="true" /><span>{ui("ui.components.Nav.7e1b0d5641f2", "Account")}</span>
              </button>
              {accountMenuOpen ? <div className={styles.dropdown} id="account-navigation">
                <Link href="/dashboard" onClick={() => { setIsOpen(false); setAccountMenuOpen(false); }}>{getContentValue(content, "global.navigation.dashboard")}</Link>
                <Link href="/messages" onClick={() => { setIsOpen(false); setAccountMenuOpen(false); }}><MessageCircle size={16} aria-hidden="true" />{" "}{ui("ui.components.Nav.04d7b4833927", "Messages")}</Link>
                <Link href="/account" onClick={() => { setIsOpen(false); setAccountMenuOpen(false); }}>{ui("ui.components.Nav.a587aa1f4ffc", "Account settings")}</Link>
                <button type="button" disabled={signingOut} onClick={() => void logout()}><LogOut size={16} aria-hidden="true" /> {signingOut ? ui("ui.components.Nav.0436231679a0", "Signing out...") : ui("ui.components.Nav.48f0d3d397d4", "Sign out")}</button>
                {logoutError ? <p role="alert">{logoutError}</p> : null}
              </div> : null}
            </div>
          ) : isSignedIn === false ? <Link href={signInHref} onClick={() => setIsOpen(false)}>{ui("ui.components.Nav.bfd402b2f6f3", "Sign in")}</Link>
            : authError ? <button className={styles.accountButton} type="button" onClick={retrySession}>{ui("ui.components.Nav.retrySignIn", "Retry sign-in check")}</button>
            : <Link className={styles.sessionStatus} href="/account" onClick={() => setIsOpen(false)}>{ui("ui.components.Nav.staticAccountAccess", "Account access")}</Link>}
          <noscript><Link className={styles.staticAccess} href="/account">{ui("ui.components.Nav.staticAccountAccess", "Account access")}</Link></noscript>
        </nav>
        <noscript><style>{`#primary-navigation { display:flex; flex-wrap:wrap; gap:8px; } #primary-navigation .${styles.sessionStatus} { display:none; } .${styles.toggle} { display:none; } @media(max-width:960px) { #primary-navigation { flex-direction:column; align-items:stretch; } }`}</style></noscript>
      </div>
      {!isSignedIn && logoutError ? <div className="shell"><p className={styles.sessionNotice} role="alert">{logoutError}</p></div> : null}
      {authError ? <div className="shell"><p className={styles.sessionNotice} role="alert">{ui("ui.components.Nav.signInCheckFailure", "Your sign-in could not be checked. Retry without signing in again.")}</p></div> : null}
    </header>
  );
}
