"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Footer } from "../../components/Footer";
import { Nav } from "../../components/Nav";
import {
  authenticateDemoUserWithPassword,
  getDemoUser,
  loginDemoUserByEmail,
  registerDemoUser,
  sendDemoMagicCode,
  verifyDemoMagicCode,
  type DemoUser
} from "../../lib/local-demo";

type LoginMode = "register" | "login" | "magic";

export default function LoginPage() {
  const router = useRouter();

  const [mode, setMode] = useState<LoginMode>("register");
  const [safeNext, setSafeNext] = useState("/dashboard");
  const [form, setForm] = useState<DemoUser>({
    name: "Owner",
    email: "",
    role: "owner",
    plan: "free"
  });
  const [password, setPassword] = useState("");
  const [magicCode, setMagicCode] = useState("");
  const [websiteHoneypot, setWebsiteHoneypot] = useState("");
  const [isMagicCodeSent, setIsMagicCodeSent] = useState(false);
  const [status, setStatus] = useState("");
  const [note, setNote] = useState("");
  const [isWorking, setIsWorking] = useState(false);
  useEffect(() => {
    setSafeNext(sanitizeNext(new URLSearchParams(window.location.search).get("next")));
  }, []);

  useEffect(() => {
    const user = getDemoUser();
    if (user) {
      setForm(user);
      setStatus("You are already signed in.");
    }
  }, []);

  useEffect(() => {
    setStatus("");
    setMagicCode("");
    setIsMagicCodeSent(mode === "magic" ? isMagicCodeSent : false);
    setNote("");
  }, [mode]);

  useEffect(() => {
    if (mode === "magic" && !status) {
      setStatus("Enter your email and send a magic code.");
    }
  }, [mode, status]);

  function isLikelyBot() {
    if (websiteHoneypot.trim()) {
      return true;
    }

    return false;
  }

  function register() {
    if (isLikelyBot()) {
      setStatus("Submission blocked.");
      return;
    }

    const normalizedEmail = form.email.trim();
    if (!form.name.trim() || !normalizedEmail) {
      setStatus("Name and email are required.");
      return;
    }

    setIsWorking(true);
    const result = registerDemoUser({ ...form, email: normalizedEmail });
    if (!result.ok) {
      setStatus(result.reason ?? "Could not create account.");
      setIsWorking(false);
      return;
    }

    setStatus("Account created. You are signed in.");
    setIsWorking(false);
    router.replace(safeNext);
  }

  function login() {
    if (isLikelyBot()) {
      setStatus("Submission blocked.");
      return;
    }

    const normalizedEmail = form.email.trim();
    if (!normalizedEmail) {
      setStatus("Email is required.");
      return;
    }

    setIsWorking(true);
    if (password.trim()) {
      const passwordResult = authenticateDemoUserWithPassword(normalizedEmail, password);
      if (!passwordResult.ok) {
        setStatus(passwordResult.reason ?? "Could not sign in.");
        setIsWorking(false);
        return;
      }

      setStatus("Signed in with password.");
      setIsWorking(false);
      router.replace(safeNext);
      return;
    }

      const result = loginDemoUserByEmail(normalizedEmail);
    if (!result.ok) {
      setStatus(result.reason ?? "Could not sign in.");
      setIsWorking(false);
      return;
    }

    setStatus("Signed in.");
    setIsWorking(false);
    router.replace(safeNext);
  }

  function sendMagicCode() {
    if (isLikelyBot()) {
      setStatus("Submission blocked.");
      return;
    }

    const normalizedEmail = form.email.trim();
    if (!normalizedEmail) {
      setStatus("Email is required.");
      return;
    }

    setIsWorking(true);
    const result = sendDemoMagicCode(normalizedEmail);
    if (!result.ok) {
      setStatus(result.reason ?? "Could not send code.");
      setIsWorking(false);
      return;
    }

    setIsMagicCodeSent(true);
    const isBrowserPreview =
      typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname);
    setNote(isBrowserPreview ? `Verification code: ${result.code}` : "Check your email for the verification code.");
    setStatus("Magic code sent. Paste it above to verify.");
    setIsWorking(false);
  }

  function verifyMagic() {
    if (isLikelyBot()) {
      setStatus("Submission blocked.");
      return;
    }

    const normalizedEmail = form.email.trim();
    if (!normalizedEmail || !magicCode.trim()) {
      setStatus("Email and code are required.");
      return;
    }

    setIsWorking(true);
    const result = verifyDemoMagicCode(normalizedEmail, magicCode);
    if (!result.ok) {
      setStatus(result.reason ?? "Could not verify code.");
      setIsWorking(false);
      return;
    }

    setStatus("Magic code verified. You are signed in.");
    setIsWorking(false);
    router.replace(safeNext);
  }

  function switchMode(nextMode: LoginMode) {
    setMode(nextMode);
    setPassword("");
    setMagicCode("");
    setNote("");
    setStatus("");
    setIsMagicCodeSent(false);
    setWebsiteHoneypot("");
  }

  return (
    <>
      <Nav />
      <main className="section auth-page">
        <div className="shell auth-layout">
          <section>
            <div className="eyebrow">Customer account</div>
            <h1>{mode === "register" ? "Create your QRguitar account." : mode === "magic" ? "Sign in with a magic code." : "Sign in to your account."}</h1>
            <p>
              Manage instruments, QR codes, ownership history, transfers, photos, documents, and profile settings from one account.
            </p>
            <div className="auth-tabs" role="tablist" aria-label="Account mode">
              <button className={mode === "register" ? "active" : ""} type="button" onClick={() => switchMode("register")}>
                Register
              </button>
              <button className={mode === "login" ? "active" : ""} type="button" onClick={() => switchMode("login")}>
                Login
              </button>
              <button className={mode === "magic" ? "active" : ""} type="button" onClick={() => switchMode("magic")}>
                Magic link
              </button>
            </div>
          </section>

          <section className="card form auth-card">
            <div className="field">
              <label htmlFor="name">Display name</label>
              <input
                id="name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                disabled={mode !== "register"}
              />
            </div>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                autoComplete="email"
              />
            </div>
            <div className="field" style={{ position: "absolute", left: "-9999px", opacity: 0 }}>
              <label htmlFor="website">Website (leave empty)</label>
              <input
                id="website"
                type="text"
                value={websiteHoneypot}
                onChange={(event) => setWebsiteHoneypot(event.target.value)}
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
              />
            </div>

            {mode === "register" ? (
              <>
                <div className="field">
                  <label htmlFor="role">Account type</label>
                  <select
                    id="role"
                    value={form.role}
                    onChange={(event) => setForm({ ...form, role: event.target.value as DemoUser["role"] })}
                  >
                    <option value="owner">Owner / player</option>
                    <option value="builder">Builder</option>
                    <option value="shop">Shop / retailer</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="plan">Plan</label>
                  <select
                    id="plan"
                    value={form.plan || "free"}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        plan: event.target.value as DemoUser["plan"],
                        verificationStatus: event.target.value === "free" ? "unverified" : "verified"
                      })
                    }
                  >
                    <option value="free">Free</option>
                    <option value="paid">Paid</option>
                    <option value="brand">Brand</option>
                    <option value="commercial">Commercial</option>
                  </select>
                </div>
              </>
            ) : null}

            {mode === "login" ? (
              <div className="field">
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter password"
                />
              </div>
            ) : null}

            {mode === "magic" ? (
              <div className="field">
                <label htmlFor="magicCode">Magic code</label>
                <input
                  id="magicCode"
                  value={magicCode}
                  onChange={(event) => setMagicCode(event.target.value)}
                  placeholder={isMagicCodeSent ? "Enter 6-digit code" : "Send code first"}
                />
              </div>
            ) : null}

            <div className="form-actions">
              {mode === "register" ? (
                <button className="button" type="button" onClick={register} disabled={isWorking}>
                  Create account
                </button>
              ) : null}
              {mode === "login" ? (
                <button className="button" type="button" onClick={login} disabled={isWorking}>
                  Sign in
                </button>
              ) : null}
              {mode === "magic" ? (
                isMagicCodeSent ? (
                  <button className="button" type="button" onClick={verifyMagic} disabled={isWorking}>
                    Verify magic code
                  </button>
                ) : (
                  <button className="button" type="button" onClick={sendMagicCode} disabled={isWorking}>
                    Send magic code
                  </button>
                )
              ) : null}
            </div>

            {note ? <p className="fine-print">{note}</p> : null}
            {status ? <p className="form-message">{status}</p> : null}
            {mode === "magic" && !isMagicCodeSent ? (
              <p className="fine-print">Use the six-digit code to finish signing in.</p>
            ) : null}
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
  if (!path) {
    return "/dashboard";
  }

  return path.startsWith("/") ? path : "/dashboard";
}
