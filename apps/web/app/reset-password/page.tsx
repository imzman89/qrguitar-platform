"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Footer } from "../../components/Footer";
import { Nav } from "../../components/Nav";
import { createBrowserSupabaseClient } from "../../lib/supabase-browser";

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState("");
  const [isWorking, setIsWorking] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [safeNext, setSafeNext] = useState("/dashboard");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSafeNext(sanitizeNext(params.get("next")));

    supabase.auth.getSession().then(({ data }) => {
      const ready = Boolean(data.session?.user);
      setHasSession(ready);
      setAuthChecked(true);
      setStatus(ready ? "" : "Open the password reset link from your email to continue.");
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

    setStatus("Password updated.");
    router.replace(safeNext);
  }

  return (
    <>
      <Nav />
      <main className="section auth-page">
        <div className="shell auth-layout">
          <section>
            <div className="eyebrow">Account recovery</div>
            <h1>Create a new QRguitar password.</h1>
            <p>Use the secure reset link from your email, then set a new password for your account.</p>
          </section>

          <section className="card auth-card">
            <div className="auth-card-head">
              <span>Password reset</span>
              <strong>{!authChecked ? "Checking reset link." : hasSession ? "Enter a new password." : "Reset link required."}</strong>
            </div>

            <div className="field">
              <label htmlFor="password">New password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                placeholder="At least 8 characters"
                disabled={!authChecked || !hasSession}
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
                disabled={!authChecked || !hasSession}
              />
            </div>

            <div className="form-actions">
              <button className="button" type="button" onClick={savePassword} disabled={isWorking || !authChecked || !hasSession}>
                {isWorking ? "Saving..." : "Save new password"}
              </button>
              <Link className="button secondary" href="/login">
                Back to sign in
              </Link>
            </div>

            {status ? <p className="form-message">{status}</p> : null}
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}

function sanitizeNext(path: string | null) {
  if (!path || path === "/login" || path === "/reset-password") {
    return "/dashboard";
  }

  return path.startsWith("/") ? path : "/dashboard";
}

function cleanAuthError(message: string) {
  if (/weak password/i.test(message)) {
    return "Use a stronger password.";
  }

  return message || "Could not update password. Try the reset link again.";
}
