"use client";

import Link from "next/link";
import { LockKeyhole, LogOut, ShieldCheck, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Footer } from "../../components/Footer";
import { Nav } from "../../components/Nav";
import { clearQrGuitarSessionState, createBrowserSupabaseClient, getSupabaseAccessToken } from "../../lib/supabase-browser";

type AccountPayload = {
  ok?: boolean;
  message?: string;
  account?: {
    email: string;
    displayName: string;
    role: string;
    plan: string;
    accountStatus: string;
    stats?: {
      records: number;
      publicRecords: number;
      privateRecords: number;
      unlistedRecords: number;
      recordsWithPhotos: number;
    };
  };
};

export default function AccountPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState("");
  const [plan, setPlan] = useState("");
  const [accountStatus, setAccountStatus] = useState("");
  const [stats, setStats] = useState({ records: 0, publicRecords: 0, privateRecords: 0, unlistedRecords: 0, recordsWithPhotos: 0 });
  const [status, setStatus] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const [isWorking, setIsWorking] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadAccount() {
      const token = await getSupabaseAccessToken();
      if (!token) {
        if (!cancelled) {
          setSignedIn(false);
          setStatus("");
        }
        return;
      }

      const response = await fetch("/api/account", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store"
      });
      const payload = (await response.json().catch(() => null)) as AccountPayload | null;

      if (cancelled) {
        return;
      }

      if (!response.ok || !payload?.ok || !payload.account) {
        setSignedIn(false);
        setStatus(payload?.message || "Could not load account.");
        return;
      }

      setSignedIn(true);
      setEmail(payload.account.email);
      setDisplayName(payload.account.displayName);
      setRole(payload.account.role);
      setPlan(payload.account.plan);
      setAccountStatus(payload.account.accountStatus);
      setStats(payload.account.stats || { records: 0, publicRecords: 0, privateRecords: 0, unlistedRecords: 0, recordsWithPhotos: 0 });
      setStatus("");
    }

    void loadAccount();

    return () => {
      cancelled = true;
    };
  }, []);

  async function saveAccount() {
    setIsWorking(true);
    setStatus("");
    const token = await getSupabaseAccessToken();
    const response = await fetch("/api/account", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ displayName })
    });
    const payload = (await response.json().catch(() => null)) as AccountPayload | null;
    setIsWorking(false);

    if (!response.ok || !payload?.ok) {
      setStatus(payload?.message || "Could not save account.");
      return;
    }

    setStatus(payload.message || "Account updated.");
    window.dispatchEvent(new CustomEvent("qrguitar:auth"));
  }

  async function sendPasswordReset() {
    if (!email) {
      setStatus("Account email is missing.");
      return;
    }

    setIsWorking(true);
    setStatus("");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password?next=/account`
    });
    setIsWorking(false);

    if (error) {
      setStatus(error.message || "Could not send password reset email.");
      return;
    }

    setStatus("Password reset email sent.");
  }

  async function signOut() {
    setIsWorking(true);
    await supabase.auth.signOut();
    clearQrGuitarSessionState();
    window.dispatchEvent(new CustomEvent("qrguitar:auth"));
    window.location.href = "/";
  }

  if (!signedIn) {
    return (
      <>
        <Nav />
        <main className="section auth-page">
          <div className="shell auth-layout">
            <section className="card auth-card sign-in-required-card">
              <div className="eyebrow">Account</div>
              <h1>Sign in to manage your account.</h1>
              <p>Update your display name, password access, and account details from one place.</p>
              <div className="form-actions">
                <Link className="button" href="/login?next=/account">Sign in</Link>
                <Link className="button secondary" href="/login?next=/account">Create account</Link>
              </div>
              {status ? <p className="form-message">{status}</p> : null}
            </section>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Nav />
      <main className="section auth-page">
        <div className="shell auth-layout">
          <section className="account-hero-copy">
            <div className="eyebrow">Account</div>
            <h1>Your QRguitar account.</h1>
            <p>Keep your profile, collection, transfers, and private tools tied to the right account.</p>
            <div className="mini-chip-row">
              <span>{accountStatus || "active"}</span>
              <span>{plan || "free"}</span>
              <span>{role || "user"}</span>
            </div>
            <div className="account-quick-links">
              <Link href="/dashboard">Dashboard</Link>
              <Link href="/create">Create profile</Link>
              <Link href="/catalog">Browse profiles</Link>
              <Link href="/contact">Support</Link>
            </div>
            <div className="account-summary-grid">
              <div>
                <strong>{stats.records}</strong>
                <span>Total profiles</span>
              </div>
              <div>
                <strong>{stats.publicRecords}</strong>
                <span>Public</span>
              </div>
              <div>
                <strong>{stats.privateRecords + stats.unlistedRecords}</strong>
                <span>Private or unlisted</span>
              </div>
              <div>
                <strong>{stats.recordsWithPhotos}/{stats.records}</strong>
                <span>With photos</span>
              </div>
            </div>
          </section>

          <div className="account-settings-stack">
            <section className="card auth-card account-settings-card">
              <div className="auth-card-head">
                <span>Profile</span>
                <strong><UserRound size={18} aria-hidden="true" /> Account details</strong>
              </div>

              <div className="field">
                <label htmlFor="accountEmail">Login email</label>
                <input id="accountEmail" value={email} readOnly />
                <p className="field-note">This email receives password reset and ownership-transfer messages.</p>
              </div>

              <div className="field">
                <label htmlFor="displayName">Display name</label>
                <input id="displayName" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Owner, shop, or builder name" />
                <p className="field-note">Shown on private tools and used as your default owner/shop label.</p>
              </div>

              <div className="form-actions">
                <button className="button" type="button" onClick={saveAccount} disabled={isWorking}>
                  {isWorking ? "Saving..." : "Save account"}
                </button>
              </div>
            </section>

            <section className="card auth-card account-settings-card">
              <div className="auth-card-head">
                <span>Security</span>
                <strong><LockKeyhole size={18} aria-hidden="true" /> Password access</strong>
              </div>
              <p className="account-card-copy">Send yourself a secure reset link any time. QRguitar never shows or stores your password in this dashboard.</p>
              <div className="form-actions">
                <button className="button secondary" type="button" onClick={sendPasswordReset} disabled={isWorking}>
                  Email password reset
                </button>
                <button className="button secondary" type="button" onClick={signOut} disabled={isWorking}>
                  <LogOut size={16} aria-hidden="true" /> Sign out
                </button>
              </div>
            </section>

            <section className="card auth-card account-settings-card">
              <div className="auth-card-head">
                <span>Access</span>
                <strong><ShieldCheck size={18} aria-hidden="true" /> Current account level</strong>
              </div>
              <div className="account-status-grid">
                <div>
                  <span>Status</span>
                  <strong>{accountStatus || "active"}</strong>
                </div>
                <div>
                  <span>Plan</span>
                  <strong>{plan || "free"}</strong>
                </div>
                <div>
                  <span>Role</span>
                  <strong>{role || "user"}</strong>
                </div>
              </div>
              <p className="account-card-copy">Verification, commercial access, and manual review are handled by QRguitar during beta.</p>
            </section>

            <section className="card auth-card account-settings-card">
              <div className="auth-card-head">
                <span>Privacy</span>
                <strong><ShieldCheck size={18} aria-hidden="true" /> Record controls</strong>
              </div>
              <p className="account-card-copy">
                Each profile controls visibility, hidden proof documents, service history, serial display, and QR downloads from its editor.
              </p>
              <div className="form-actions">
                <Link className="button secondary" href="/dashboard">Manage profiles</Link>
                <Link className="button secondary" href="/contact">Get support</Link>
              </div>
            </section>

            {status ? <p className="form-message account-form-message">{status}</p> : null}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
