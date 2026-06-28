"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Footer } from "../../components/Footer";
import { Nav } from "../../components/Nav";
import { createBrowserSupabaseClient } from "../../lib/supabase-browser";

type LoginMode = "login" | "register";

export default function LoginPage() {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [mode, setMode] = useState<LoginMode>("login");
  const [safeNext, setSafeNext] = useState("/dashboard");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [isWorking, setIsWorking] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextPath = sanitizeNext(params.get("next"));
    setSafeNext(nextPath);
    if (params.get("reason") === "session-expired") {
      setStatus("Your session expired. Please sign in again.");
    }

    supabase.auth.getSession().then(({ data }) => {
      const signedIn = Boolean(data.session?.user);
      setIsSignedIn(signedIn);
      if (signedIn && nextPath !== "/login") {
        router.replace(nextPath);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsSignedIn(Boolean(session?.user));
      window.dispatchEvent(new CustomEvent("qrguitar:auth"));
    });

    return () => listener.subscription.unsubscribe();
  }, [router, supabase]);

  function switchMode(nextMode: LoginMode) {
    setMode(nextMode);
    setStatus("");
    setPassword("");
  }

  async function register() {
    if (!name.trim() || !email.trim() || !password.trim()) {
      setStatus("Name, email, and password are required.");
      return;
    }

    setIsWorking(true);
    setStatus("");

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          display_name: name.trim()
        },
        emailRedirectTo: `${window.location.origin}${safeNext}`
      }
    });

    setIsWorking(false);

    if (error) {
      setStatus(cleanAuthError(error.message));
      return;
    }

    if (data.session) {
      router.replace(safeNext);
      return;
    }

    setStatus("Account created. Check your email to confirm it, then sign in.");
  }

  async function login() {
    if (!email.trim() || !password.trim()) {
      setStatus("Email and password are required.");
      return;
    }

    setIsWorking(true);
    setStatus("");

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    });

    setIsWorking(false);

    if (error) {
      setStatus(cleanAuthError(error.message));
      return;
    }

    router.replace(safeNext);
  }

  async function logout() {
    setIsWorking(true);
    await supabase.auth.signOut();
    window.localStorage.removeItem("qrguitar.siteEditorUnlocked");
    setIsWorking(false);
    setIsSignedIn(false);
    setStatus("Signed out.");
  }

  return (
    <>
      <Nav />
      <main className="section auth-page">
        <div className="shell auth-layout">
          <section>
            <div className="eyebrow">Customer account</div>
            <h1>{mode === "register" ? "Create your QRguitar account." : "Sign in to QRguitar."}</h1>
            <p>
              {mode === "register"
                ? "Create an account so your records, QR links, photos, documents, and ownership tools stay tied to you."
                : "Sign in to manage your private records, create QRguitar IDs, and edit your instruments."}
            </p>
            <div className="auth-tabs" role="tablist" aria-label="Account mode">
              <button className={mode === "login" ? "active" : ""} type="button" onClick={() => switchMode("login")}>
                Login
              </button>
              <button className={mode === "register" ? "active" : ""} type="button" onClick={() => switchMode("register")}>
                Create account
              </button>
            </div>
          </section>

          <section className="card auth-card">
            {isSignedIn ? (
              <>
                <div className="eyebrow">Signed in</div>
                <h2>Your QRguitar session is active.</h2>
                <p>Go to your dashboard or sign out before using another account.</p>
                <div className="form-actions">
                  <Link className="button" href="/dashboard">
                    Dashboard
                  </Link>
                  <button className="button secondary" type="button" onClick={logout} disabled={isWorking}>
                    Sign out
                  </button>
                </div>
              </>
            ) : (
              <>
                {mode === "register" ? (
                  <div className="field">
                    <label htmlFor="name">Display name</label>
                    <input id="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Owner, builder, or shop name" />
                  </div>
                ) : null}

                <div className="field">
                  <label htmlFor="email">Email</label>
                  <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="you@example.com" />
                </div>

                <div className="field">
                  <label htmlFor="password">Password</label>
                  <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "register" ? "new-password" : "current-password"} placeholder={mode === "register" ? "Create a password" : "Enter your password"} />
                </div>

                <div className="form-actions">
                  {mode === "login" ? (
                    <button className="button" type="button" onClick={login} disabled={isWorking}>
                      Sign in
                    </button>
                  ) : null}
                  {mode === "register" ? (
                    <button className="button" type="button" onClick={register} disabled={isWorking}>
                      Create account
                    </button>
                  ) : null}
                </div>

                {mode !== "register" ? (
                  <p className="fine-print">
                    Need an account? <button className="link-button" type="button" onClick={() => switchMode("register")}>Create one</button>
                  </p>
                ) : null}
              </>
            )}

            {status ? <p className="form-message">{status}</p> : null}
            <p className="fine-print">
              <Link href="/">Back to homepage</Link>
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}

function sanitizeNext(path: string | null) {
  if (!path || path === "/login") {
    return "/dashboard";
  }

  return path.startsWith("/") ? path : "/dashboard";
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
