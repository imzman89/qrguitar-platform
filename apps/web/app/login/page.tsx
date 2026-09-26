"use client";
import { useUiText } from "../../components/UiTextProvider";


import Link from "next/link";
import styles from "../../components/AuthForm.module.css";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Footer } from "../../components/Footer";
import { Nav } from "../../components/Nav";
import { clearQrGuitarSessionState, createBrowserSupabaseClient, readSessionStorage, removeSessionStorage, sessionExpiredMessageKey } from "../../lib/supabase-browser";
import { getContentValue } from "../../lib/content-registry";
import { useSiteContent } from "../../lib/use-site-content";

import { safeAuthRedirect } from "../../lib/auth-redirect";
import { replaceWithCheckoutPolicy } from "../../lib/checkout-navigation";
import { dispatchOptionalTrackingProductEvent, optionalTrackingProductEvents } from "../../lib/optional-tracking-consent";

type LoginMode = "login" | "register" | "reset";
type AuthOperation = { epoch: number; actor: string; revision: number };

async function readAuthSession(client: ReturnType<typeof createBrowserSupabaseClient>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([client.auth.getSession(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Sign-in check timed out. Please try again.")), 10000);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

export default function LoginPage() {
  const ui = useUiText("app.login.page");
  const content = useSiteContent();
  const sessionExpiredCopy = getContentValue(content, "login.sessionExpired");
  const router = useRouter();
  const client = useRef<ReturnType<typeof createBrowserSupabaseClient> | null>(null);
  const lifetime = useRef({ active: false, epoch: 0, actor: "", revision: 0, known: false, operationRevision: 0 });
  const pending = useRef<AuthOperation | null>(null);
  const initialized = useRef(false);
  const loginTabRef = useRef<HTMLButtonElement>(null);
  const registerTabRef = useRef<HTMLButtonElement>(null);
  const [mode, setMode] = useState<LoginMode>("login");
  const [safeNext, setSafeNext] = useState("/dashboard");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [isWorking, setIsWorking] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false);

  const applyIdentity = useCallback((actor: string) => {
    const life = lifetime.current;
    if (!life.active) return;
    if (actor !== life.actor) {
      life.revision++;
      setName(""); setEmail(""); setPassword(""); setStatus("");
    }
    life.known = true; life.actor = actor;
    setIsSignedIn(Boolean(actor));
  }, []);
  function current(operation: AuthOperation) {
    const life = lifetime.current;
    return life.active && life.epoch === operation.epoch && pending.current === operation;
  }
  function sameActor(operation: AuthOperation) {
    const life = lifetime.current;
    return current(operation) && life.actor === operation.actor && life.revision === operation.revision;
  }
  function signedInBy(operation: AuthOperation, actor: string) {
    const life = lifetime.current;
    return current(operation) && Boolean(actor) && (sameActor(operation)
      || (!operation.actor && life.actor === actor && life.revision === operation.revision + 1));
  }
  function signedOutBy(operation: AuthOperation) {
    const life = lifetime.current;
    return sameActor(operation) || (current(operation) && !life.actor && life.revision === operation.revision + 1);
  }
  async function mutation<T>(operation: AuthOperation, run: () => Promise<T>) {
    // Auth mutations cannot be cancelled. Keep the operation lock until settlement.
    const timer = window.setTimeout(() => {
      if (sameActor(operation) || (operation.actor && signedOutBy(operation))) setStatus("This request is still pending. Its outcome is not confirmed; please wait before trying again.");
    }, 20000);
    try { return await run(); } finally { window.clearTimeout(timer); }
  }

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const params = new URLSearchParams(window.location.search);
    const nextPath = safeAuthRedirect(params.get("next"));
    setSafeNext(nextPath);
    if (params.get("mode") === "register" || params.get("mode") === "reset") setMode(params.get("mode") as LoginMode);
    const expiredMessage = readSessionStorage(sessionExpiredMessageKey);
    if (params.get("reason") === "session-expired" || expiredMessage) {
      setStatus(expiredMessage || sessionExpiredCopy);
      removeSessionStorage(sessionExpiredMessageKey);
    }

  }, [sessionExpiredCopy]);

  useEffect(() => {
    const life = lifetime.current;
    life.active = true; const epoch = ++life.epoch;
    const operationRevision = life.operationRevision;
    let eventRevision = 0, unsubscribe: (() => void) | undefined;
    const active = () => life.active && life.epoch === epoch;
    try {
      const supabase = createBrowserSupabaseClient(); client.current = supabase;
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!active()) return;
        eventRevision++;
        const initial = !life.known;
        applyIdentity(session?.user.id || "");
        window.dispatchEvent(new CustomEvent("qrguitar:auth"));
        if (initial && session?.user.id && !pending.current) replaceWithCheckoutPolicy("/login", safeAuthRedirect(new URLSearchParams(window.location.search).get("next")), router, window.location);
      });
      unsubscribe = () => data.subscription.unsubscribe();
      const initialRevision = eventRevision;
      // A synchronous subscription event also outranks the initial read.
      const hadEvent = eventRevision !== 0;
      void readAuthSession(supabase).then(({ data: initial, error }) => {
        if (!active() || hadEvent || eventRevision !== initialRevision || life.operationRevision !== operationRevision) return;
        if (error) { setStatus("Your sign-in could not be checked. You can try signing in again."); return; }
        const actor = initial.session?.user.id || "";
        applyIdentity(actor);
        if (actor) replaceWithCheckoutPolicy("/login", safeAuthRedirect(new URLSearchParams(window.location.search).get("next")), router, window.location);
      }).catch(() => { if (active() && !hadEvent && eventRevision === initialRevision && life.operationRevision === operationRevision) setStatus("Your sign-in could not be checked. You can try signing in again."); });
    } catch { client.current = null; setStatus("Sign-in is temporarily unavailable. Please reload and try again."); }
    return () => { life.active = false; life.epoch++; client.current = null; unsubscribe?.(); };
  }, [router, applyIdentity]);

  function switchMode(nextMode: LoginMode) {
    if (pending.current) return;
    setMode(nextMode);
    setStatus("");
    setPassword("");
    const url = new URL(window.location.href);
    url.searchParams.set("mode", nextMode);
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, tab: "login" | "register") {
    if (event.altKey || event.ctrlKey || event.metaKey || pending.current) return;
    const nextMode = event.key === "Home" ? "login" : event.key === "End" ? "register"
      : event.key === "ArrowLeft" || event.key === "ArrowRight" ? (tab === "login" ? "register" : "login") : null;
    if (!nextMode) return;
    event.preventDefault();
    if (nextMode !== mode) switchMode(nextMode);
    (nextMode === "login" ? loginTabRef : registerTabRef).current?.focus();
  }

  async function submitAccountAction() {
    const supabase = client.current, life = lifetime.current;
    if (!life.active || pending.current) return;
    if (!supabase) { setStatus("Sign-in is temporarily unavailable. Please reload and try again."); return; }
    if (mode === "register" && (!name.trim() || !email.trim() || !password.trim())) {
      setStatus("Name, email, and password are required.");
      return;
    }
    if (mode === "register" && password.length < 8) {
      setStatus("Use at least 8 characters for your password.");
      return;
    }
    if (mode === "login" && (!email.trim() || !password.trim())) {
      setStatus("Email and password are required.");
      return;
    }
    if (!email.trim()) {
      setStatus("Enter your email first.");
      return;
    }
    const operation = { epoch: life.epoch, actor: life.actor, revision: life.revision };
    life.operationRevision++;
    pending.current = operation; setIsWorking(true); setStatus("");
    let signedInActor = "";
    try {
      const before = await readAuthSession(supabase);
      if (!sameActor(operation)) return;
      if (before.error) throw before.error;
      const beforeActor = before.data.session?.user.id || "";
      if (beforeActor !== operation.actor) { applyIdentity(beforeActor); return; }
      if (mode === "reset") {
        const { error } = await mutation(operation, () => supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password?next=${encodeURIComponent(safeNext)}`
        }));
        if (sameActor(operation)) setStatus(error ? cleanAuthError(error.message) : "Password reset email sent. Check your inbox, then follow the secure reset link.");
        return;
      }
      const { data, error } = await mutation(operation, () => mode === "register"
        ? supabase.auth.signUp({ email: email.trim(), password, options: { data: { display_name: name.trim() }, emailRedirectTo: `${window.location.origin}${safeNext}` } })
        : supabase.auth.signInWithPassword({ email: email.trim(), password }));
      if (error) { if (sameActor(operation)) setStatus(cleanAuthError(error.message)); return; }
      if (mode === "register" && data.user?.id && Array.isArray(data.user.identities) && data.user.identities.length > 0) {
        void dispatchOptionalTrackingProductEvent({
          name: optionalTrackingProductEvents.registrationCompleted,
          properties: { confirmation: data.session ? "session_ready" : "email_pending" }
        }, { dedupeKey: data.user.id });
      }
      if (mode === "register" && !data.session) {
        if (sameActor(operation)) setStatus("Account created. Check your email to confirm it, then sign in.");
        return;
      }
      const actor = data.session?.user.id || "";
      if (!signedInBy(operation, actor)) {
        if (sameActor(operation)) setStatus("Sign-in could not be confirmed. Please check your account and try again.");
        return;
      }
      signedInActor = actor;
      const after = await readAuthSession(supabase);
      if (!signedInBy(operation, actor)) return;
      if (after.error) throw after.error;
      if (after.data.session?.user.id !== actor) { applyIdentity(after.data.session?.user.id || ""); return; }
      applyIdentity(actor);
      removeSessionStorage(sessionExpiredMessageKey); replaceWithCheckoutPolicy("/login", safeNext, router, window.location);
    } catch {
      if (sameActor(operation) || (signedInActor && signedInBy(operation, signedInActor))) setStatus("The request could not be confirmed. Check your connection and account status before trying again.");
    } finally {
      if (pending.current === operation) { pending.current = null; if (life.active) setIsWorking(false); }
    }
  }

  async function logout() {
    const supabase = client.current, life = lifetime.current;
    if (!life.active || !life.actor || !supabase || pending.current) return;
    const operation = { epoch: life.epoch, actor: life.actor, revision: life.revision };
    life.operationRevision++;
    pending.current = operation; setIsWorking(true); setStatus("");
    try {
      const before = await readAuthSession(supabase);
      if (!sameActor(operation)) return;
      if (before.error) throw before.error;
      if (before.data.session?.user.id !== operation.actor) { applyIdentity(before.data.session?.user.id || ""); return; }
      const { error } = await mutation(operation, () => supabase.auth.signOut());
      if (error) throw error;
      if (!signedOutBy(operation)) return;
      clearQrGuitarSessionState(); applyIdentity(""); setStatus("Signed out.");
    } catch {
      if (sameActor(operation)) setStatus("Could not sign out. Please try again.");
      else if (signedOutBy(operation) && !life.actor) {
        clearQrGuitarSessionState();
        setStatus("You are signed out on this device. Sign-out on other devices could not be confirmed.");
      }
    } finally {
      if (pending.current === operation) { pending.current = null; if (life.active) setIsWorking(false); }
    }
  }

  return (
    <>
      <Nav />
      <main className={styles.page}>
        <div className={styles.layout}>
          <header className={styles.heading}>
            <div className="eyebrow">{isSignedIn ? ui("ui.app.login.page.ff66ee6c3c61", "Account ready") : getContentValue(content, "login.hero.eyebrow")}</div>
            <h1>{isSignedIn ? ui("ui.app.login.page.dfdbca16342f", "Welcome back.") : mode === "register" ? ui("ui.app.login.page.9e373b49e769", "Create your QRguitar account.") : mode === "reset" ? ui("ui.app.login.page.132b49a565d6", "Reset your QRguitar password.") : getContentValue(content, "login.hero.headline")}</h1>
            <p>
              {isSignedIn
                ? ui("ui.app.login.page.a97312811b00", "Your Profiles and owner tools are ready in the dashboard.")
                : mode === "register"
                ? ui("ui.app.login.page.67f8e71ebeaa", "Create an account so your Profiles, QR links, photos, documents, and ownership tools stay tied to you.")
                : mode === "reset"
                  ? ui("ui.app.login.page.2fc495cd0ae7", "Enter your account email and QRguitar will send a secure password reset link.")
                : getContentValue(content, "login.hero.body")}
            </p>
          </header>

          <section className={styles.formPanel}>
            {isSignedIn ? (
              <>
                <div className="form-actions">
                  <Link className="button" href="/dashboard">{ui("ui.app.login.page.803f2313cdf4", "Open dashboard")}</Link>
                  <Link className="button secondary" href="/account">{ui("ui.app.login.page.a587aa1f4ffc", "Account settings")}</Link>
                </div>
                <button className="link-button auth-signout-link" type="button" onClick={logout} disabled={isWorking}>{ui("ui.app.login.page.48f0d3d397d4", "Sign out")}</button>
              </>
            ) : (
              <>
                {mode !== "reset" ? (
                  <div className={styles.modeSwitch} role="tablist" aria-label={ui("ui.app.login.page.3386f588f0c2", "Account access")}>
                    <button ref={loginTabRef} id="auth-login-tab" className={mode === "login" ? styles.active : undefined} type="button" role="tab" aria-selected={mode === "login"} aria-controls="auth-access-panel" tabIndex={mode === "login" ? 0 : -1} disabled={isWorking} onClick={() => switchMode("login")} onKeyDown={(event) => handleTabKeyDown(event, "login")}>{ui("ui.app.login.page.bfd402b2f6f3", "Sign in")}</button>
                    <button ref={registerTabRef} id="auth-register-tab" className={mode === "register" ? styles.active : undefined} type="button" role="tab" aria-selected={mode === "register"} aria-controls="auth-access-panel" tabIndex={mode === "register" ? 0 : -1} disabled={isWorking} onClick={() => switchMode("register")} onKeyDown={(event) => handleTabKeyDown(event, "register")}>{ui("ui.app.login.page.798ca2ce18bf", "Create account")}</button>
                  </div>
                ) : null}


                <div id="auth-access-panel" role={mode === "reset" ? undefined : "tabpanel"} aria-labelledby={mode === "reset" ? undefined : `auth-${mode}-tab`}>
                <form method="post" onSubmit={(event) => { event.preventDefault(); void submitAccountAction(); }} aria-busy={isWorking}>
                {mode === "register" ? (
                  <div className="field">
                    <label htmlFor="name">{ui("ui.app.login.page.2b7f6a84de91", "Display name")}</label>
                    <input id="name" name="name" autoComplete="nickname" required value={name} onChange={(event) => setName(event.target.value)} placeholder={ui("ui.app.login.page.d4b8227dbd30", "Owner, builder, or shop name")} />
                  </div>
                ) : null}

                <div className="field">
                  <label htmlFor="email">{ui("ui.app.login.page.969ccbd3cf63", "Email")}</label>
                  <input id="email" name="email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder={ui("ui.app.login.page.53e6cdc30765", "you@example.com")} />
                </div>

                {mode !== "reset" ? (
                  <div className="field">
                    <label htmlFor="password">{ui("ui.app.login.page.e7cf3ef4f17c", "Password")}</label>
                    <input id="password" name="password" type="password" required minLength={mode === "register" ? 8 : undefined} aria-describedby={mode === "register" ? "password-hint" : undefined} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "register" ? "new-password" : "current-password"} placeholder={mode === "register" ? ui("ui.app.login.page.4defceba0862", "Create a password") : ui("ui.app.login.page.c06bf9670174", "Enter your password")} />
                    {mode === "register" ? <p className="fine-print" id="password-hint">{ui("ui.app.login.page.9b15ce9e25e9", "Use at least 8 characters.")}</p> : null}
                  </div>
                ) : null}

                <div className="form-actions">
                  {mode === "login" ? (
                    <button className="button" type="submit" disabled={isWorking}>
                      {isWorking ? ui("ui.app.login.page.1f96f5d016bd", "Signing in...") : getContentValue(content, "login.actions.submit")}
                    </button>
                  ) : null}
                  {mode === "register" ? (
                    <button className="button" type="submit" disabled={isWorking}>
                      {isWorking ? ui("ui.app.login.page.7dd3701aa3f1", "Creating account...") : getContentValue(content, "login.actions.create")}
                    </button>
                  ) : null}
                  {mode === "reset" ? (
                    <button className="button" type="submit" disabled={isWorking}>
                      {isWorking ? ui("ui.app.login.page.286a3af7348e", "Sending...") : ui("ui.app.login.page.708c5d67ba8e", "Send reset link")}
                    </button>
                  ) : null}
                </div>

                </form>
                </div>
                <div className="auth-card-link-row">
                  {mode === "login" ? (
                    <button className="link-button" type="button" disabled={isWorking} onClick={() => switchMode("reset")}>
                      {getContentValue(content, "login.actions.forgot")}
                    </button>
                  ) : null}
                  {mode === "reset" ? (
                    <button className="link-button" type="button" disabled={isWorking} onClick={() => switchMode("login")}>{ui("ui.app.login.page.71fe31ccd37c", "Back to sign in")}</button>
                  ) : null}
                </div>
              </>
            )}

            {status ? <p className="form-message" role="status" aria-live="polite">{status}</p> : null}
            <p className="fine-print">
              <Link href="/">{ui("ui.app.login.page.cb35f7332137", "Back to homepage")}</Link>
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}

function cleanAuthError(message: string) {
  if (/invalid login/i.test(message)) {
    return "Email or password is not correct.";
  }

  if (/email not confirmed/i.test(message)) {
    return "Check your email to confirm this account before signing in.";
  }

  return message || "Authentication failed. Try again.";
}
