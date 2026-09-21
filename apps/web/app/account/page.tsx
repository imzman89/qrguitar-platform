"use client";

import { OwnerWorkspace } from "../../components/OwnerWorkspace";
import authStyles from "../../components/AuthForm.module.css";
import styles from "./account.module.css";

import { PwaInstall } from "../../components/PwaInstall";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ExternalLink, LockKeyhole, LogOut, ShieldCheck, UserRound, UsersRound } from "lucide-react";
import { Suspense, useEffect, useRef, useState } from "react";
import { Footer } from "../../components/Footer";
import { Nav } from "../../components/Nav";
import { clearQrGuitarSessionState, createBrowserSupabaseClient } from "../../lib/supabase-browser";
import { type PublicCollectionSettings } from "../../lib/public-collections";
import { accountReturnPath, createAccountSettings, initialAccountSettings, savedCollectionHref } from "../../lib/account-settings";
import { getContentValue } from "../../lib/content-registry";
import { useSiteContent } from "../../lib/use-site-content";
import { getWorkspace, WORKSPACE_OPTIONS } from "../../lib/workspace-tools";
import AccountDeletionSection from "../../lib/account-deletion/AccountDeletionSection";
import { accountDeletionAuth } from "../../lib/account-deletion/account-deletion-auth";

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
  return <Suspense fallback={<AccountLoading />}><AccountSettingsPage /></Suspense>;
}

function AccountSettingsPage() {
  const content = useSiteContent();
  const search = useSearchParams();
  const controller = useRef<ReturnType<typeof createAccountSettings> | null>(null);
  const [state, setState] = useState(initialAccountSettings);
  const [activeSection, setActiveSection] = useState<AccountSection>("overview");
  const { displayName, publicCollection } = state.draft;
  const email = state.account?.email || "";
  const role = state.account?.role || "";
  const plan = state.account?.plan || "";
  const accountStatus = state.account?.accountStatus || "";
  const stats = state.account?.stats || { records: 0, publicRecords: 0, privateRecords: 0, unlistedRecords: 0, recordsWithPhotos: 0 };
  const status = state.message;
  const isWorking = Boolean(state.busy);
  const publishedHref = savedCollectionHref(state.account);
  const returnPath = accountReturnPath(activeSection);
  const setDisplayName = (value: string) => controller.current?.setDraft({ displayName: value });
  const setPublicCollection = (update: (current: PublicCollectionSettings) => PublicCollectionSettings) => {
    if (controller.current) controller.current.setDraft({ publicCollection: update(controller.current.getState().draft.publicCollection) });
  };

  useEffect(() => {
    const current = createAccountSettings({
      auth: () => createBrowserSupabaseClient().auth,
      onSaved: () => window.dispatchEvent(new CustomEvent("qrguitar:auth")),
      onSignedOut: () => { clearQrGuitarSessionState(); window.dispatchEvent(new CustomEvent("qrguitar:auth")); }
    });
    controller.current = current;
    const unsubscribe = current.subscribe(setState);
    setState(current.getState());
    void current.start();
    return () => { unsubscribe(); current.dispose(); if (controller.current === current) controller.current = null; };
  }, []);

  useEffect(() => {
    const requestedSection = search.get("section");
    setActiveSection(accountSections.some((section) => section.id === requestedSection) ? requestedSection as AccountSection : "overview");
  }, [search]);

  async function saveAccount() {
    await controller.current?.save();
  }
  async function sendPasswordReset() {
    await controller.current?.resetPassword(`${window.location.origin}/reset-password?next=${encodeURIComponent(returnPath)}`);
  }

  async function signOut() {
    await controller.current?.signOut();
  }

  if (state.phase === "loading") return <AccountLoading />;

  if (state.phase === "error") return <><Nav /><main className={authStyles.page}><div className={authStyles.layout}><section className={authStyles.formPanel} role="alert"><div className="eyebrow">Account</div><h1>Your account could not be loaded.</h1><p>{status}</p><button className="button" type="button" onClick={() => void controller.current?.reload()}>Try again</button></section>{state.actorId && <AccountDeletionSection actorId={state.actorId} auth={accountDeletionAuth} />}</div></main><Footer /></>;

  if (state.phase === "signed-out") {
    return (
      <>
        <Nav />
        <main className={authStyles.page}>
          <div className={authStyles.layout}>
            <section className={authStyles.formPanel}>
              <div className="eyebrow">Account</div>
              <h1>Sign in to manage your account.</h1>
              <p>Update your display name, password access, and account details from one place.</p>
              <div className="form-actions">
                <Link className="button" href={`/login?next=${encodeURIComponent(returnPath)}`}>Sign in</Link>
                <Link className="button secondary" href={`/login?mode=register&next=${encodeURIComponent(returnPath)}`}>Create account</Link>
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
      <OwnerWorkspace current="account">
        <div className={styles.account}>
          <header className={styles.header}>
            <h1>{getContentValue(content, "account.hero.headline")}</h1>
            <p>{getContentValue(content, "account.hero.body")}</p>
          </header>

          <div className={styles.settings}>
            <nav className={styles.sectionNav} aria-label="Account sections">
              {accountSections.map((section) => (
                <button
                  aria-current={activeSection === section.id ? "page" : undefined}
                  className={activeSection === section.id ? styles.active : undefined}
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  type="button"
                >
                  {section.label}
                </button>
              ))}
            </nav>

            <div className={styles.content}>
            {activeSection === "overview" ? <PwaInstall /> : null}

            <fieldset disabled={isWorking || (state.uncertainSave && (activeSection === "profile" || activeSection === "collection"))} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
            {activeSection === "overview" ? (
              <section className={styles.panel}>
                <div className={styles.identity}>
                  <div className={styles.avatar} aria-hidden="true">{(displayName || email || "Q").slice(0, 1).toUpperCase()}</div>
                  <div><h2>{displayName || "Your account"}</h2><p>{email}</p><small>{accountStatus || "active"} · {plan || "free"} · {role || "user"}</small></div>
                </div>
                <div className={styles.metrics} aria-label="Collection summary">
                  <div><strong>{stats.records}</strong><span>Profiles</span></div>
                  <div><strong>{stats.publicRecords}</strong><span>Public</span></div>
                  <div><strong>{stats.privateRecords + stats.unlistedRecords}</strong><span>Private or unlisted</span></div>
                  <div><strong>{stats.recordsWithPhotos}/{stats.records}</strong><span>With photos</span></div>
                </div>
                <div className={styles.overviewRows}>
                  <div><span><b>Profile details</b><small>Your name and the tools you use.</small></span><button type="button" className="button secondary" onClick={() => setActiveSection("profile")}>Edit details</button></div>
                  <div><span><b>Public collection</b><small>{publishedHref ? "Your saved collection is ready to share." : "Bring your public Profiles together on one page."}</small></span><button type="button" className="button secondary" onClick={() => setActiveSection("collection")}>{publishedHref ? "Manage collection" : "Set up collection"}</button></div>
                  <div><span><b>Account access</b><small>Manage your password and active sign-in.</small></span><button type="button" className="button secondary" onClick={() => setActiveSection("security")}>Security</button></div>
                </div>
                <Link className={styles.textLink} href="/dashboard">Open your collection <span aria-hidden="true">↗</span></Link>
              </section>
            ) : null}

            {activeSection === "profile" ? <section className={styles.panel}>
              <div className={styles.panelHeading}>
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

              <div className="field">
                <label htmlFor="workspaceType">How you use QRguitar</label>
                <select id="workspaceType" value={publicCollection.accountType} onChange={(event) => setPublicCollection((current) => ({ ...current, accountType: event.target.value as PublicCollectionSettings["accountType"] }))}>{WORKSPACE_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select>
                <p className="field-note">Choose the daily tools shown on your dashboard. You can save this preference with your public collection turned off. Provider verification is reviewed separately.</p>
              </div>

              <div className="form-actions">
                <button className="button" type="button" onClick={saveAccount} disabled={isWorking}>
                  {isWorking ? "Saving..." : getContentValue(content, "account.actions.save")}
                </button>
              </div>
            </section> : null}

            {activeSection === "collection" ? <section className={styles.panel} id="public-collection">
              <div className={styles.panelHeading}>
                <span>Public collection</span>
                <strong><UsersRound size={18} aria-hidden="true" /> Your public collection</strong>
              </div>
              <p className={styles.copy}>Create one shareable page for your public QRguitar Profiles. Enable your collection and make at least one instrument Profile public to appear in Member Collections. Private and unlisted Profiles never appear there.</p>
              <label className="toggle-field">
                <input type="checkbox" checked={publicCollection.enabled} onChange={(event) => setPublicCollection((current) => ({ ...current, enabled: event.target.checked }))} />
                Show my public Profiles together on a public collection page
              </label>
              <div className="form-grid compact">
                <label className="field"><span>Public name</span><input value={publicCollection.publicName} onChange={(event) => setPublicCollection((current) => ({ ...current, publicName: event.target.value }))} placeholder={displayName} /></label>
                <label className="field"><span>Public link</span><input value={publicCollection.handle} onChange={(event) => setPublicCollection((current) => ({ ...current, handle: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") }))} placeholder="my-collection" /></label>
                <label className="field"><span>Workspace / collection type</span><select value={publicCollection.accountType} onChange={(event) => setPublicCollection((current) => ({ ...current, accountType: event.target.value as PublicCollectionSettings["accountType"] }))}>{WORKSPACE_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
                <label className="field"><span>Location (optional)</span><input value={publicCollection.location} onChange={(event) => setPublicCollection((current) => ({ ...current, location: event.target.value }))} placeholder="City, region, country" /></label>
                <label className="field custom-wide"><span>Short bio</span><textarea rows={3} value={publicCollection.bio} onChange={(event) => setPublicCollection((current) => ({ ...current, bio: event.target.value }))} placeholder="What you collect, build, repair, or sell." /></label>
                <label className="field"><span>Your website (optional)</span><input type="url" aria-describedby="collection-website-help" value={publicCollection.websiteUrl} onChange={(event) => setPublicCollection((current) => ({ ...current, websiteUrl: event.target.value }))} placeholder="https://your-website.com" maxLength={500} /><small id="collection-website-help" className="field-note">Use the full HTTPS address. When your public collection is enabled, visitors can open this website from the collection and its instrument Profiles. Purchases and bookings take place on your website.</small></label>
                <label className="field"><span>Avatar URL (optional)</span><input type="url" value={publicCollection.avatarUrl} onChange={(event) => setPublicCollection((current) => ({ ...current, avatarUrl: event.target.value }))} placeholder="https://" /></label>
              </div>
              <label className="toggle-field"><input type="checkbox" checked={publicCollection.allowIndexing} onChange={(event) => setPublicCollection((current) => ({ ...current, allowIndexing: event.target.checked }))} /> Allow search engines to index this collection</label>
              <label className="toggle-field">
                <input type="checkbox" checked={publicCollection.allowMessages} onChange={(event) => setPublicCollection((current) => ({ ...current, allowMessages: event.target.checked }))} />
                Allow signed-in members to message you in QRguitar
              </label>
              <p className="field-note">Your email stays private. Conversations stay inside QRguitar and can include up to four photos or short videos per message.</p>
              <div className="form-actions">
                <button className="button" type="button" onClick={saveAccount} disabled={isWorking}>{isWorking ? "Saving..." : "Save public collection"}</button>
                {publishedHref ? <Link className="button secondary" href={publishedHref} target="_blank" rel="noopener noreferrer">View saved public collection <ExternalLink size={15} /></Link> : null}
                <Link className="button secondary" href="/collections">Browse member collections</Link>
              </div>
              {(publicCollection.handle !== state.account?.publicCollection.handle || publicCollection.enabled !== state.account?.publicCollection.enabled) && <p className="field-note">Save your changes to update the public collection link. The preview opens your last saved collection.</p>}
            </section> : null}

            {activeSection === "security" ? <section className={styles.panel}>
              <div className={styles.panelHeading}>
                <span>{getContentValue(content, "account.security.heading")}</span>
                <strong><LockKeyhole size={18} aria-hidden="true" /> Password access</strong>
              </div>
              <p className={styles.copy}>Send yourself a secure reset link any time. QRguitar never shows or stores your password in this dashboard.</p>
              <div className="form-actions">
                <button className="button secondary" type="button" onClick={sendPasswordReset} disabled={isWorking}>
                  {getContentValue(content, "account.actions.reset")}
                </button>
                <button className="button secondary" type="button" onClick={signOut} disabled={isWorking}>
                  <LogOut size={16} aria-hidden="true" /> Sign out
                </button>
              </div>
            </section> : null}

            {activeSection === "notifications" ? <section className={styles.panel}>
              <div className={styles.panelHeading}>
                <span>Notifications</span>
                <strong><ShieldCheck size={18} aria-hidden="true" /> Account notices</strong>
              </div>
              <p className={styles.copy}>Security, transfer, claim, and service-review notices are sent to your account email when action is required.</p>
              <div className={styles.statusGrid}>
                <div><span>Delivery email</span><strong>{email}</strong></div>
                <div><span>Required notices</span><strong>Enabled</strong></div>
              </div>
              <p className="field-note">Required account and ownership notices cannot be disabled during public beta.</p>
            </section> : null}

            {activeSection === "provider" ? <section className={styles.panel}>
              <div className={styles.panelHeading}>
                <span>Provider / Business</span>
                <strong><ShieldCheck size={18} aria-hidden="true" /> Business tools</strong>
              </div>
              <div className={styles.statusGrid}>
                <div><span>Status</span><strong>{accountStatus || "active"}</strong></div>
                <div><span>Plan</span><strong>{plan || "free"}</strong></div>
                <div><span>Role</span><strong>{role || "user"}</strong></div>
              </div>
              <p className={styles.copy}>{getWorkspace(publicCollection.accountType).description}</p>
              <div className="form-actions">
                <Link className="button" href="/dashboard/service">Open service workbench</Link>
                <Link className="button secondary" href="/dashboard/import">Open Bulk Import</Link>
                <Link className="button secondary" href="/installers">Service Provider Network</Link>
              </div>
            </section> : null}

            {activeSection === "privacy" ? <section className={styles.panel}>
              <div className={styles.panelHeading}>
                <span>Privacy &amp; Data</span>
                <strong><ShieldCheck size={18} aria-hidden="true" /> Profile controls</strong>
              </div>
              <p className={styles.copy}>
                Each Profile controls visibility, private documents, service history, Serial Number display, and QR downloads from its editor.
              </p>
              <div className="form-actions">
                <Link className="button secondary" href="/dashboard">Manage Profiles</Link>
                <Link className="button secondary" href="/contact">Get support</Link>
              </div>
            </section> : null}

            </fieldset>
            {activeSection === "privacy" && <AccountDeletionSection actorId={state.actorId} auth={accountDeletionAuth} />}
            {status ? <p className="form-message" role="status">{status}</p> : null}
            {state.uncertainSave && <div className="form-message"><p>Reload the saved settings before editing again; reloading replaces the form with the server version.</p><button className="button secondary" type="button" onClick={() => void controller.current?.reload()}>Reload saved account</button></div>}
            </div>
          </div>
        </div>
      </OwnerWorkspace>
      <Footer />
    </>
  );
}

function AccountLoading() {
  return <><Nav /><main className={authStyles.page}><div className={authStyles.layout}><section className={authStyles.formPanel} aria-live="polite" aria-busy="true"><div className="eyebrow">Account</div><h1>Loading your account...</h1><p>Checking your QRguitar session and owner workspace.</p></section></div></main><Footer /></>;
}
