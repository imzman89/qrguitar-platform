"use client";
import { useUiText } from "../../components/UiTextProvider";


import Link from "../../components/CheckoutAwareLink";
import styles from "../../components/AuthForm.module.css";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Footer } from "../../components/Footer";
import { Nav } from "../../components/Nav";
import { createBrowserSupabaseClient } from "../../lib/supabase-browser";
import { getContentValue } from "../../lib/content-registry";
import { useSiteContent } from "../../lib/use-site-content";

import { safeAuthRedirect } from "../../lib/auth-redirect";
import { replaceWithCheckoutPolicy } from "../../lib/checkout-navigation";

async function readAuthSession(client: ReturnType<typeof createBrowserSupabaseClient>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([client.auth.getSession(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Sign-in check timed out. Please try again.")), 10000);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

export default function ResetPasswordPage() {
  const ui = useUiText("app.reset.password.page");
  const content = useSiteContent();
  const router = useRouter();
  const client = useRef<ReturnType<typeof createBrowserSupabaseClient> | null>(null);
  const lifetime = useRef({ active: false, epoch: 0, actor: "", revision: 0, known: false, readFailed: false });
  const pending = useRef<symbol | null>(null);
  const redirectTimer = useRef<number | undefined>(undefined);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState("");
  const [isWorking, setIsWorking] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [hasRecoveryLink, setHasRecoveryLink] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [safeNext, setSafeNext] = useState("/dashboard");
  const [authError, setAuthError] = useState(false);
  const [authAttempt, setAuthAttempt] = useState(0);
  const [invalidField, setInvalidField] = useState<"password" | "confirmPassword" | "">("");
  const passwordInput = useRef<HTMLInputElement>(null);
  const confirmPasswordInput = useRef<HTMLInputElement>(null);
  const renderedIdentity = { actor: lifetime.current.actor, revision: lifetime.current.revision, epoch: lifetime.current.epoch };
  const renderedCurrent = () => lifetime.current.active && lifetime.current.actor === renderedIdentity.actor
    && lifetime.current.revision === renderedIdentity.revision && lifetime.current.epoch === renderedIdentity.epoch;

  const applyIdentity = useCallback((actor: string) => {
    const life = lifetime.current;
    if (!life.active) return;
    if (actor !== life.actor) {
      life.revision++;
      setPassword(""); setConfirmPassword(""); setStatus(""); setIsComplete(false);
      setInvalidField("");
      window.clearTimeout(redirectTimer.current); redirectTimer.current = undefined;
    }
    life.known = true; life.actor = actor;
    if (life.readFailed) { life.readFailed = false; setStatus(""); }
    setHasSession(Boolean(actor)); setAuthChecked(true); setAuthError(false);
  }, []);

  useEffect(() => {
    const life = lifetime.current;
    life.active = true; const epoch = ++life.epoch;
    let eventRevision = 0, unsubscribe: (() => void) | undefined;
    const active = () => life.active && life.epoch === epoch;
    setAuthChecked(false); setAuthError(false);
    const params = new URLSearchParams(window.location.search);
    setSafeNext(safeAuthRedirect(params.get("next")));
    setHasRecoveryLink(
      params.has("code")
      || params.has("token_hash")
      || window.location.hash.includes("type=recovery")
      || window.location.hash.includes("access_token")
    );

    function failRead() {
      if (!active()) return;
      life.readFailed = true;
      setAuthChecked(true); setAuthError(true); setHasSession(false);
      setStatus("Your sign-in could not be checked. Please try again.");
    }
    try {
      const supabase = createBrowserSupabaseClient(); client.current = supabase;
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!active()) return;
        eventRevision++;
        applyIdentity(session?.user.id || "");
      });
      unsubscribe = () => data.subscription.unsubscribe();
      const initialRevision = eventRevision, hadEvent = eventRevision !== 0;
      void readAuthSession(supabase).then(({ data: initial, error }) => {
        if (!active() || hadEvent || eventRevision !== initialRevision) return;
        if (error) failRead(); else applyIdentity(initial.session?.user.id || "");
      }).catch(() => { if (!hadEvent && eventRevision === initialRevision) failRead(); });
    } catch { client.current = null; failRead(); }
    return () => {
      life.active = false; life.epoch++; client.current = null; unsubscribe?.();
      window.clearTimeout(redirectTimer.current); redirectTimer.current = undefined;
    };
  }, [authAttempt, applyIdentity]);

  async function savePassword() {
    const supabase = client.current, life = lifetime.current;
    if (!renderedCurrent() || pending.current) return;
    if (!hasSession || !life.actor || !supabase || authError) {
      setStatus("Open the password reset link from your email to continue.");
      return;
    }

    if (password.length < 8) {
      setInvalidField("password");
      setStatus(ui("ui.app.reset.password.page.minimumPassword", "Use at least 8 characters."));
      passwordInput.current?.focus();
      return;
    }

    if (password !== confirmPassword) {
      setInvalidField("confirmPassword");
      setStatus(ui("ui.app.reset.password.page.passwordMismatch", "Passwords do not match."));
      confirmPasswordInput.current?.focus();
      return;
    }

    const operation = Symbol("password-update"), actor = life.actor, revision = life.revision, epoch = life.epoch;
    const current = () => life.active && life.epoch === epoch && life.actor === actor && life.revision === revision;
    pending.current = operation; setIsWorking(true); setStatus(""); setInvalidField("");
    let timer: number | undefined, dispatched = false;
    try {
      const before = await readAuthSession(supabase);
      if (!current()) return;
      if (before.error) throw before.error;
      if (before.data.session?.user.id !== actor) { applyIdentity(before.data.session?.user.id || ""); return; }
      // The SDK cannot cancel this mutation. Do not permit overlapping retries.
      timer = window.setTimeout(() => {
        if (current()) setStatus("The password update is still pending. It may already have been saved; please wait before trying again.");
      }, 20000);
      dispatched = true;
      const { data, error } = await supabase.auth.updateUser({ password });
      window.clearTimeout(timer); timer = undefined;
      if (!current()) return;
      if (error) { setStatus(cleanAuthError(error.message)); return; }
      if (data.user?.id !== actor) throw new Error("Unconfirmed password update");
      const after = await readAuthSession(supabase);
      if (!current()) return;
      if (after.error) throw after.error;
      if (after.data.session?.user.id !== actor) { applyIdentity(after.data.session?.user.id || ""); return; }
      setPassword(""); setConfirmPassword(""); setIsComplete(true);
      redirectTimer.current = window.setTimeout(() => { if (current()) replaceWithCheckoutPolicy("/reset-password", safeNext, router, window.location); }, 900);
    } catch {
      if (current()) setStatus(dispatched
        ? "The password update could not be confirmed. It may already have been saved. Check your connection, then retry or request a fresh reset link."
        : "Your sign-in could not be checked. Check your connection and try again.");
    } finally {
      window.clearTimeout(timer);
      if (pending.current === operation) { pending.current = null; if (life.active) setIsWorking(false); }
    }
  }

  return (
    <>
      <Nav />
      <main className={styles.page}>
        <div className={styles.layout}>
          <header className={styles.heading}>
            <div className="eyebrow">{ui("ui.app.reset.password.page.2b291cd5cd2f", "Account recovery")}</div>
            <h1>{getContentValue(content, "resetPassword.hero.headline")}</h1>
            <p>{getContentValue(content, "resetPassword.hero.body")}</p>
          </header>

          <section className={styles.formPanel}>
            <div className={styles.stateHeading}>
              <span>{ui("ui.app.reset.password.page.359f68acb9b4", "Password reset")}</span>
              <strong>
                {!authChecked
                  ? ui("ui.app.reset.password.page.efbe5ce1a727", "Checking reset link.")
                  : authError
                    ? ui("ui.app.reset.password.page.60a5fa2747a0", "Sign-in check unavailable.")
                  : isComplete
                    ? ui("ui.app.reset.password.page.df01ff0dd6ed", "Password updated.")
                    : hasSession
                      ? ui("ui.app.reset.password.page.7aa2cb96c3c9", "Enter a new password.")
                      : hasRecoveryLink
                        ? ui("ui.app.reset.password.page.25747699557d", "Reset link invalid or expired.")
                        : ui("ui.app.reset.password.page.4f057eac4b08", "Reset link required.")}
              </strong>
            </div>

            {!authChecked ? <p className="form-message">{ui("ui.app.reset.password.page.302e28e1e830", "Validating your secure link.")}</p> : null}

            {authChecked && authError ? <div><p className="form-message error-message" role="alert">{status}</p><button className="button" type="button" disabled={isWorking} onClick={() => setAuthAttempt(value => value + 1)}>{ui("ui.app.reset.password.page.d8b8392e2c54", "Try again")}</button></div> : null}

            {authChecked && !authError && isComplete ? (
              <>
                <p className="form-message">{ui("ui.app.reset.password.page.a1d84018af6f", "Your new password is saved. Taking you back to QRguitar.")}</p>
                <Link className="button" href={safeNext}>{ui("ui.app.reset.password.page.31fbef162594", "Continue")}</Link>
              </>
            ) : null}

            {authChecked && !authError && !isComplete && !hasSession ? (
              <>
                <p className="form-message">
                  {hasRecoveryLink
                    ? ui("ui.app.reset.password.page.d070b9194f76", "This reset link is no longer valid. Request a fresh password reset email.")
                    : ui("ui.app.reset.password.page.58b2c6c10c7f", "Open the password reset link from your email to continue.")}
                </p>
                <Link className="button" href={`/login?mode=reset&next=${encodeURIComponent(safeNext)}`}>{ui("ui.app.reset.password.page.6ff84c62212a", "Request a new reset link")}</Link>
              </>
            ) : null}

            {authChecked && !authError && !isComplete && hasSession ? (
              <form method="post" noValidate onSubmit={(event) => { event.preventDefault(); void savePassword(); }} aria-busy={isWorking}>
                <div className="field">
                  <label htmlFor="password">{ui("ui.app.reset.password.page.3dd9df4441fb", "New password")}</label>
                  <input
                    id="password"
                    ref={passwordInput}
                    type="password"
                    required
                    minLength={8}
                    aria-invalid={invalidField === "password"}
                    aria-describedby={invalidField === "password" ? "reset-password-error" : undefined}
                    value={password}
                    onChange={(event) => { if (!renderedCurrent()) return; setPassword(event.target.value); if (invalidField) { setInvalidField(""); setStatus(""); } }}
                    autoComplete="new-password"
                    placeholder={ui("ui.app.reset.password.page.977f3b2676a9", "At least 8 characters")}
                  />
                  {invalidField === "password" ? <p id="reset-password-error" className="field-error" role="alert">{status}</p> : null}
                </div>

                <div className="field">
                  <label htmlFor="confirmPassword">{ui("ui.app.reset.password.page.5ac265f396a2", "Confirm password")}</label>
                  <input
                    id="confirmPassword"
                    ref={confirmPasswordInput}
                    type="password"
                    required
                    minLength={8}
                    aria-invalid={invalidField === "confirmPassword"}
                    aria-describedby={invalidField === "confirmPassword" ? "reset-confirm-password-error" : undefined}
                    value={confirmPassword}
                    onChange={(event) => { if (!renderedCurrent()) return; setConfirmPassword(event.target.value); if (invalidField) { setInvalidField(""); setStatus(""); } }}
                    autoComplete="new-password"
                    placeholder={ui("ui.app.reset.password.page.6bf1430d8550", "Re-enter new password")}
                  />
                  {invalidField === "confirmPassword" ? <p id="reset-confirm-password-error" className="field-error" role="alert">{status}</p> : null}
                </div>

                <div className="form-actions">
                  <button className="button" type="submit" disabled={isWorking}>
                    {isWorking ? ui("ui.app.reset.password.page.dc85af8f2b1d", "Saving...") : ui("ui.app.reset.password.page.1a145dd7125d", "Save new password")}
                  </button>
                  <Link className="button secondary" href={`/login?next=${encodeURIComponent(safeNext)}`}>{ui("ui.app.reset.password.page.71fe31ccd37c", "Back to sign in")}</Link>
                </div>
              </form>
            ) : null}

            {status && !invalidField && !authError && (!authChecked || hasSession) ? <p className="form-message error-message" role="status">{status}</p> : null}
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}

function cleanAuthError(message: string) {
  if (/weak password/i.test(message)) {
    return "Use a stronger password.";
  }

  return message || "Could not update password. Try the reset link again.";
}
