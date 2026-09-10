"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Footer } from "../../components/Footer";
import { Nav } from "../../components/Nav";
import { createBrowserSupabaseClient } from "../../lib/supabase-browser";
import { getContentValue } from "../../lib/content-registry";
import { useSiteContent } from "../../lib/use-site-content";

import { safeAuthRedirect } from "../../lib/auth-redirect";

export default function ResetPasswordPage() {
  const content = useSiteContent();
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState("");
  const [isWorking, setIsWorking] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [hasRecoveryLink, setHasRecoveryLink] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [safeNext, setSafeNext] = useState("/dashboard");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSafeNext(safeAuthRedirect(params.get("next")));
    setHasRecoveryLink(
      params.has("code")
      || params.has("token_hash")
      || window.location.hash.includes("type=recovery")
      || window.location.hash.includes("access_token")
    );

    supabase.auth.getSession().then(({ data, error }) => {
      const ready = Boolean(data.session?.user);
      setHasSession(ready);
      setAuthChecked(true);
      setStatus(error ? cleanAuthError(error.message) : "");
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const ready = Boolean(session?.user);
      setHasSession(ready);
      if (ready) {
        setStatus("");
      }
    });

    return () => listener.subscription.unsubscribe();
  }, [supabase]);

  async function savePassword() {
    if (!hasSession) {
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

    setIsWorking(true);
    setStatus("");
    const { error } = await supabase.auth.updateUser({ password });
    setIsWorking(false);

    if (error) {
      setStatus(cleanAuthError(error.message));
      return;
    }

    setIsComplete(true);
    window.setTimeout(() => router.replace(safeNext), 900);
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

            {authChecked && isComplete ? (
              <>
                <p className="form-message">Your new password is saved. Taking you back to QRguitar.</p>
                <Link className="button" href={safeNext}>Continue</Link>
              </>
            ) : null}

            {authChecked && !isComplete && !hasSession ? (
              <>
                <p className="form-message">
                  {hasRecoveryLink
                    ? "This reset link is no longer valid. Request a fresh password reset email."
                    : "Open the password reset link from your email to continue."}
                </p>
                <Link className="button" href="/login">Back to sign in</Link>
              </>
            ) : null}

            {authChecked && !isComplete && hasSession ? (
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
                  <Link className="button secondary" href="/login">Back to sign in</Link>
                </div>
              </>
            ) : null}

            {status && (!authChecked || hasSession) ? <p className="form-message error-message">{status}</p> : null}
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
