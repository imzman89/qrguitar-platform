"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Footer } from "../../components/Footer";
import { Nav } from "../../components/Nav";
import { createBrowserSupabaseClient } from "../../lib/supabase-browser";
import { getContentValue } from "../../lib/content-registry";
import { useSiteContent } from "../../lib/use-site-content";

import { safeAuthRedirect } from "../../lib/auth-redirect";

async function readAuthSession(client: ReturnType<typeof createBrowserSupabaseClient>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([client.auth.getSession(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Sign-in check timed out. Please try again.")), 10000);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

export default function ResetPasswordPage() {
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

  const applyIdentity = useCallback((actor: string) => {
    const life = lifetime.current;
    if (!life.active) return;
    if (actor !== life.actor) {
      life.revision++;
      setPassword(""); setConfirmPassword(""); setStatus(""); setIsComplete(false);
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
    if (!life.active || pending.current) return;
    if (!hasSession || !life.actor || !supabase || authError) {
      setStatus("Open the password reset link from your email to continue.");
      return;
    }

    if (password.length < 8) {
      setStatus("Use at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setStatus("Passwords do not match.");
      return;
    }

    const operation = Symbol("password-update"), actor = life.actor, revision = life.revision, epoch = life.epoch;
    const current = () => life.active && life.epoch === epoch && life.actor === actor && life.revision === revision;
    pending.current = operation; setIsWorking(true); setStatus("");
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
      redirectTimer.current = window.setTimeout(() => { if (current()) router.replace(safeNext); }, 900);
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
      <main className="section auth-page">
        <div className="shell auth-layout">
          <section>
            <div className="eyebrow">Account recovery</div>
            <h1>{getContentValue(content, "resetPassword.hero.headline")}</h1>
            <p>{getContentValue(content, "resetPassword.hero.body")}</p>
          </section>

          <section className="card auth-card">
            <div className="auth-card-head">
              <span>Password reset</span>
              <strong>
                {!authChecked
                  ? "Checking reset link."
                  : authError
                    ? "Sign-in check unavailable."
                  : isComplete
                    ? "Password updated."
                    : hasSession
                      ? "Enter a new password."
                      : hasRecoveryLink
                        ? "Reset link invalid or expired."
                        : "Reset link required."}
              </strong>
            </div>

            {!authChecked ? <p className="form-message">Validating your secure link.</p> : null}

            {authChecked && authError ? <div><p className="form-message error-message" role="alert">{status}</p><button className="button" type="button" disabled={isWorking} onClick={() => setAuthAttempt(value => value + 1)}>Try again</button></div> : null}

            {authChecked && !authError && isComplete ? (
              <>
                <p className="form-message">Your new password is saved. Taking you back to QRguitar.</p>
                <Link className="button" href={safeNext}>Continue</Link>
              </>
            ) : null}

            {authChecked && !authError && !isComplete && !hasSession ? (
              <>
                <p className="form-message">
                  {hasRecoveryLink
                    ? "This reset link is no longer valid. Request a fresh password reset email."
                    : "Open the password reset link from your email to continue."}
                </p>
                <Link className="button" href={`/login?mode=reset&next=${encodeURIComponent(safeNext)}`}>Request a new reset link</Link>
              </>
            ) : null}

            {authChecked && !authError && !isComplete && hasSession ? (
              <>
                <div className="field">
                  <label htmlFor="password">New password</label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                  />
                </div>

                <div className="field">
                  <label htmlFor="confirmPassword">Confirm password</label>
                  <input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                    placeholder="Re-enter new password"
                  />
                </div>

                <div className="form-actions">
                  <button className="button" type="button" onClick={savePassword} disabled={isWorking}>
                    {isWorking ? "Saving..." : "Save new password"}
                  </button>
                  <Link className="button secondary" href={`/login?next=${encodeURIComponent(safeNext)}`}>Back to sign in</Link>
                </div>
              </>
            ) : null}

            {status && !authError && (!authChecked || hasSession) ? <p className="form-message error-message" role="status">{status}</p> : null}
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
