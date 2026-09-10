"use client";

import { PwaInstall } from "../../components/PwaInstall";

import Link from "next/link";
import { ExternalLink, LockKeyhole, LogOut, ShieldCheck, UserRound, UsersRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Footer } from "../../components/Footer";
import { Nav } from "../../components/Nav";
import { clearQrGuitarSessionState, createBrowserSupabaseClient, getSupabaseAccessToken } from "../../lib/supabase-browser";
import { defaultPublicCollectionSettings, type PublicCollectionSettings } from "../../lib/public-collections";
import { getContentValue } from "../../lib/content-registry";
import { useSiteContent } from "../../lib/use-site-content";

type AccountPayload = {
  ok?: boolean;
  message?: string;
  account?: {
    email: string;
    displayName: string;
    role: string;
    plan: string;
    accountStatus: string;
    publicCollection?: PublicCollectionSettings;
    stats?: {
      records: number;
      publicRecords: number;
      privateRecords: number;
      unlistedRecords: number;
      recordsWithPhotos: number;
    };
  };
};

type AccountSection = "overview" | "profile" | "collection" | "security" | "notifications" | "provider" | "privacy";

const accountSections: Array<{ id: AccountSection; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "collection", label: "Public Collection" },
  { id: "profile", label: "Profile & Identity" },
  { id: "security", label: "Security" },
  { id: "notifications", label: "Notifications" },
  { id: "provider", label: "Provider / Business" },
  { id: "privacy", label: "Privacy & Data" }
];

export default function AccountPage() {
  const content = useSiteContent();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState("");
  const [plan, setPlan] = useState("");
  const [accountStatus, setAccountStatus] = useState("");
  const [stats, setStats] = useState({ records: 0, publicRecords: 0, privateRecords: 0, unlistedRecords: 0, recordsWithPhotos: 0 });
  const [status, setStatus] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [publicCollection, setPublicCollection] = useState<PublicCollectionSettings>(defaultPublicCollectionSettings);
  const [activeSection, setActiveSection] = useState<AccountSection>("overview");

  useEffect(() => {
    let cancelled = false;

    async function loadAccount() {
      try {
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
        setPublicCollection(payload.account.publicCollection || { ...defaultPublicCollectionSettings, publicName: payload.account.displayName });
        setStats(payload.account.stats || { records: 0, publicRecords: 0, privateRecords: 0, unlistedRecords: 0, recordsWithPhotos: 0 });
        setStatus("");
      } catch {
        if (!cancelled) {
          setSignedIn(false);
          setStatus("Could not load account. Check your connection and try again.");
        }
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    }

    void loadAccount();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const requestedSection = new URLSearchParams(window.location.search).get("section");
    if (accountSections.some((section) => section.id === requestedSection)) {
      setActiveSection(requestedSection as AccountSection);
    }
  }, []);

  async function saveAccount() {
    setIsWorking(true);
    setStatus("");
    try {
      const token = await getSupabaseAccessToken();
      const response = await fetch("/api/account", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ displayName, publicCollection })
      });
      const payload = (await response.json().catch(() => null)) as AccountPayload | null;
      if (!response.ok || !payload?.ok) {
        setStatus(payload?.message || "Could not confirm the save. Reload your account before trying again.");
        return;
      }
      setStatus(payload.message || "Account updated.");
      if (payload.account?.publicCollection) setPublicCollection(payload.account.publicCollection);
      window.dispatchEvent(new CustomEvent("qrguitar:auth"));
    } catch {
      setStatus("Could not confirm the save. Check your connection and reload your account before trying again.");
    } finally {
      setIsWorking(false);
    }
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

  if (!authReady) {
    return (
      <>
        <Nav />
        <main className="section auth-page">
          <div className="shell auth-layout">
            <section className="card auth-card sign-in-required-card" aria-live="polite" aria-busy="true">
              <div className="eyebrow">Account</div>
              <h1>Loading your account...</h1>
              <p>Checking your QRguitar session and owner workspace.</p>
            </section>
          </div>
        </main>
        <Footer />
      </>
    );
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
                <Link className="button secondary" href="/login?mode=register&next=/account">Create account</Link>
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
        <div className="shell auth-layout account-layout">
          <section className="account-hero-copy">
            <div className="eyebrow">Account</div>
            <h1>{getContentValue(content, "account.hero.headline")}</h1>
            <p>{getContentValue(content, "account.hero.body")}</p>
            <div className="mini-chip-row">
              <span>{accountStatus || "active"}</span>
              <span>{plan || "free"}</span>
              <span>{role || "user"}</span>
            </div>
            <div className="account-quick-links">
              <Link href="/dashboard">Dashboard</Link>
              <Link href="/create">Create Profile</Link>
              <Link href="/catalog">Explore the Catalog</Link>
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
            <nav className="account-section-nav" aria-label="Account sections">
              {accountSections.map((section) => (
                <button
                  aria-current={activeSection === section.id ? "page" : undefined}
                  className={activeSection === section.id ? "active" : ""}
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  type="button"
                >
                  {section.label}
                </button>
              ))}
            </nav>

            {activeSection === "overview" ? <PwaInstall /> : null}

            {activeSection === "overview" ? (
              <section className="card auth-card account-settings-card account-overview-card">
                <div className="auth-card-head">
                  <span>Workspace</span>
                  <strong><ShieldCheck size={18} aria-hidden="true" /> Account overview</strong>
                </div>
                <p className="account-card-copy">Manage your identity, public collection, access, and privacy without leaving your owner workspace.</p>
                <div className="account-overview-actions">
                  <button type="button" onClick={() => setActiveSection("profile")}><UserRound size={17} aria-hidden="true" /><span><b>Profile details</b><small>Update the name connected to your Profiles.</small></span></button>
                  <button type="button" onClick={() => setActiveSection("collection")}><UsersRound size={17} aria-hidden="true" /><span><b>Public collection</b><small>Group your public Profiles under one shareable link.</small></span></button>
                  <button type="button" onClick={() => setActiveSection("security")}><LockKeyhole size={17} aria-hidden="true" /><span><b>Security</b><small>Reset your password or sign out securely.</small></span></button>
                  <Link href="/dashboard"><ShieldCheck size={17} aria-hidden="true" /><span><b>Profile controls</b><small>Manage visibility, serial display, documents, and QR tools.</small></span></Link>
                </div>
              </section>
            ) : null}

            {activeSection === "profile" ? <section className="card auth-card account-settings-card">
              <div className="auth-card-head">
                <span>Profile</span>
                <strong><UserRound size={18} aria-hidden="true" /> {getContentValue(content, "account.profile.heading")}</strong>
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
                  {isWorking ? "Saving..." : getContentValue(content, "account.actions.save")}
                </button>
              </div>
            </section> : null}

            {activeSection === "collection" ? <section className="card auth-card account-settings-card" id="public-collection">
              <div className="auth-card-head">
                <span>Public collection</span>
                <strong><UsersRound size={18} aria-hidden="true" /> Your public collection</strong>
              </div>
              <p className="account-card-copy">Create one shareable page for your public QRguitar Profiles. Private and unlisted Profiles never appear there.</p>
              <label className="toggle-field">
                <input type="checkbox" checked={publicCollection.enabled} onChange={(event) => setPublicCollection((current) => ({ ...current, enabled: event.target.checked }))} />
                Show my public Profiles together on a public collection page
              </label>
              <div className="form-grid compact">
                <label className="field"><span>Public name</span><input value={publicCollection.publicName} onChange={(event) => setPublicCollection((current) => ({ ...current, publicName: event.target.value }))} placeholder={displayName} /></label>
                <label className="field"><span>Public link</span><input value={publicCollection.handle} onChange={(event) => setPublicCollection((current) => ({ ...current, handle: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") }))} placeholder="my-collection" /></label>
                <label className="field"><span>Collection type</span><select value={publicCollection.accountType} onChange={(event) => setPublicCollection((current) => ({ ...current, accountType: event.target.value as PublicCollectionSettings["accountType"] }))}><option value="player">Player</option><option value="collector">Collector</option><option value="shop">Shop / retailer</option><option value="builder">Builder / brand</option><option value="luthier">Luthier / technician</option><option value="other">Other</option></select></label>
                <label className="field"><span>Location (optional)</span><input value={publicCollection.location} onChange={(event) => setPublicCollection((current) => ({ ...current, location: event.target.value }))} placeholder="City, region, country" /></label>
                <label className="field custom-wide"><span>Short bio</span><textarea rows={3} value={publicCollection.bio} onChange={(event) => setPublicCollection((current) => ({ ...current, bio: event.target.value }))} placeholder="What you collect, build, repair, or sell." /></label>
                <label className="field"><span>Website (optional)</span><input type="url" value={publicCollection.websiteUrl} onChange={(event) => setPublicCollection((current) => ({ ...current, websiteUrl: event.target.value }))} placeholder="https://" /></label>
                <label className="field"><span>Avatar URL (optional)</span><input type="url" value={publicCollection.avatarUrl} onChange={(event) => setPublicCollection((current) => ({ ...current, avatarUrl: event.target.value }))} placeholder="https://" /></label>
              </div>
              <label className="toggle-field"><input type="checkbox" checked={publicCollection.allowIndexing} onChange={(event) => setPublicCollection((current) => ({ ...current, allowIndexing: event.target.checked }))} /> Allow search engines to index this collection</label>
              <label className="toggle-field">
                <input type="checkbox" checked={publicCollection.allowMessages} onChange={(event) => setPublicCollection((current) => ({ ...current, allowMessages: event.target.checked }))} />
                Allow signed-in members to send private inquiries
              </label>
              <p className="field-note">Your email stays private. QRguitar relays the first message, and you decide whether to reply.</p>
              <div className="form-actions">
                <button className="button" type="button" onClick={saveAccount} disabled={isWorking}>{isWorking ? "Saving..." : "Save public collection"}</button>
                {publicCollection.enabled && publicCollection.handle ? <Link className="button secondary" href={`/collections/${publicCollection.handle}`} target="_blank">View public collection <ExternalLink size={15} /></Link> : null}
              </div>
            </section> : null}

            {activeSection === "security" ? <section className="card auth-card account-settings-card">
              <div className="auth-card-head">
                <span>{getContentValue(content, "account.security.heading")}</span>
                <strong><LockKeyhole size={18} aria-hidden="true" /> Password access</strong>
              </div>
              <p className="account-card-copy">Send yourself a secure reset link any time. QRguitar never shows or stores your password in this dashboard.</p>
              <div className="form-actions">
                <button className="button secondary" type="button" onClick={sendPasswordReset} disabled={isWorking}>
                  {getContentValue(content, "account.actions.reset")}
                </button>
                <button className="button secondary" type="button" onClick={signOut} disabled={isWorking}>
                  <LogOut size={16} aria-hidden="true" /> Sign out
                </button>
              </div>
            </section> : null}

            {activeSection === "notifications" ? <section className="card auth-card account-settings-card">
              <div className="auth-card-head">
                <span>Notifications</span>
                <strong><ShieldCheck size={18} aria-hidden="true" /> Account notices</strong>
              </div>
              <p className="account-card-copy">Security, transfer, claim, and service-review notices are sent to your account email when action is required.</p>
              <div className="account-status-grid">
                <div><span>Delivery email</span><strong>{email}</strong></div>
                <div><span>Required notices</span><strong>Enabled</strong></div>
              </div>
              <p className="field-note">Required account and ownership notices cannot be disabled during public beta.</p>
            </section> : null}

            {activeSection === "provider" ? <section className="card auth-card account-settings-card">
              <div className="auth-card-head">
                <span>Provider / Business</span>
                <strong><ShieldCheck size={18} aria-hidden="true" /> Business tools</strong>
              </div>
              <div className="account-status-grid">
                <div><span>Status</span><strong>{accountStatus || "active"}</strong></div>
                <div><span>Plan</span><strong>{plan || "free"}</strong></div>
                <div><span>Role</span><strong>{role || "user"}</strong></div>
              </div>
              <p className="account-card-copy">Use business tools when you manage inventory at scale or document work for an instrument owner.</p>
              <div className="form-actions">
                <Link className="button secondary" href="/dashboard/import">Open Bulk Import</Link>
                <Link className="button secondary" href="/installers">Service Provider Network</Link>
              </div>
            </section> : null}

            {activeSection === "privacy" ? <section className="card auth-card account-settings-card">
              <div className="auth-card-head">
                <span>Privacy &amp; Data</span>
                <strong><ShieldCheck size={18} aria-hidden="true" /> Profile controls</strong>
              </div>
              <p className="account-card-copy">
                Each Profile controls visibility, private documents, service history, Serial Number display, and QR downloads from its editor.
              </p>
              <div className="form-actions">
                <Link className="button secondary" href="/dashboard">Manage Profiles</Link>
                <Link className="button secondary" href="/contact">Get support</Link>
              </div>
            </section> : null}

            {status ? <p className="form-message account-form-message">{status}</p> : null}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
