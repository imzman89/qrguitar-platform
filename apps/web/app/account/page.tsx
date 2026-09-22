"use client";
import { useUiText } from "../../components/UiTextProvider";


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
import { cleanCollectionHandle, type PublicCollectionSettings } from "../../lib/public-collections";
import { accountReturnPath, createAccountSettings, initialAccountSettings, savedCollectionHref } from "../../lib/account-settings";
import { PUBLIC_SITE_ORIGIN } from "../../lib/profile-url";
import { getContentValue } from "../../lib/content-registry";
import { useSiteContent } from "../../lib/use-site-content";
import { getWorkspace, workspaceOptionLabel, WORKSPACE_OPTIONS } from "../../lib/workspace-tools";
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
  const ui = useUiText("app.account.page");
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
  const stats = state.account?.stats || { records: 0, publicRecords: 0, privateRecords: 0, unlistedRecords: 0 };
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

  if (state.phase === "error") return <><Nav /><main className={authStyles.page}><div className={authStyles.layout}><section className={authStyles.formPanel} role="alert"><div className="eyebrow">{ui("ui.app.account.page.7e1b0d5641f2", "Account")}</div><h1>{ui("ui.app.account.page.3e76d93749b3", "Your account could not be loaded.")}</h1><p>{status}</p><button className="button" type="button" onClick={() => void controller.current?.reload()}>{ui("ui.app.account.page.d8b8392e2c54", "Try again")}</button></section>{state.actorId && <AccountDeletionSection actorId={state.actorId} auth={accountDeletionAuth} />}</div></main><Footer /></>;

  if (state.phase === "signed-out") {
    return (
      <>
        <Nav />
        <main className={authStyles.page}>
          <div className={authStyles.layout}>
            <section className={authStyles.formPanel}>
              <div className="eyebrow">{ui("ui.app.account.page.7e1b0d5641f2", "Account")}</div>
              <h1>{ui("ui.app.account.page.ebdc08b7dca0", "Sign in to manage your account.")}</h1>
              <p>{ui("ui.app.account.page.fd2eec9f1a8b", "Update your display name, password access, and account details from one place.")}</p>
              <div className="form-actions">
                <Link className="button" href={`/login?next=${encodeURIComponent(returnPath)}`}>{ui("ui.app.account.page.bfd402b2f6f3", "Sign in")}</Link>
                <Link className="button secondary" href={`/login?mode=register&next=${encodeURIComponent(returnPath)}`}>{ui("ui.app.account.page.798ca2ce18bf", "Create account")}</Link>
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
            <label className={styles.mobileSectionNav}><span>{ui("ui.app.account.page.settingsSection", "Settings section")}</span><select value={activeSection} onChange={(event) => setActiveSection(event.target.value as AccountSection)}>{accountSections.map((section) => <option key={section.id} value={section.id}>{(section.label === "Overview" ? ui("ui.app.account.page.d4b1ea5708dd", "Overview") : section.label === "Public Collection" ? ui("ui.app.account.page.81d7c837c3e8", "Collection page") : section.label === "Profile & Identity" ? ui("ui.app.account.page.999fcfbc4384", "Profile & Identity") : section.label === "Security" ? ui("ui.app.account.page.8f6fb4eb7f42", "Security") : section.label === "Notifications" ? ui("ui.app.account.page.788011833a5a", "Notifications") : section.label === "Provider / Business" ? ui("ui.app.account.page.963dc63cbd9f", "Provider / Business") : section.label === "Privacy & Data" ? ui("ui.app.account.page.ade3e28bc653", "Privacy & Data") : section.label)}</option>)}</select></label>
            <nav className={styles.sectionNav} aria-label={ui("ui.app.account.page.baa77cb99154", "Account sections")}>
              {accountSections.map((section) => (
                <button
                  aria-current={activeSection === section.id ? "page" : undefined}
                  className={activeSection === section.id ? styles.active : undefined}
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  type="button"
                >
                  {(section.label === "Overview" ? ui("ui.app.account.page.d4b1ea5708dd", "Overview") : section.label === "Public Collection" ? ui("ui.app.account.page.81d7c837c3e8", "Collection page") : section.label === "Profile & Identity" ? ui("ui.app.account.page.999fcfbc4384", "Profile & Identity") : section.label === "Security" ? ui("ui.app.account.page.8f6fb4eb7f42", "Security") : section.label === "Notifications" ? ui("ui.app.account.page.788011833a5a", "Notifications") : section.label === "Provider / Business" ? ui("ui.app.account.page.963dc63cbd9f", "Provider / Business") : section.label === "Privacy & Data" ? ui("ui.app.account.page.ade3e28bc653", "Privacy & Data") : section.label)}
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
                  <div><h2>{displayName || ui("ui.app.account.page.dbb5f6371b6a", "Your account")}</h2><p>{email}</p><small>{accountStatus || ui("ui.app.account.page.96879611650f", "active")} · {plan || ui("ui.app.account.page.ad95d5fa651b", "free")} · {role || ui("ui.app.account.page.04f8996da763", "user")}</small></div>
                </div>
                <div className={styles.metrics} aria-label={ui("ui.app.account.page.c8c1af060b0c", "Collection summary")}>
                  <div><strong>{stats.records}</strong><span>{ui("ui.app.account.page.535e52e4a261", "Profiles")}</span></div>
                  <div><strong>{stats.publicRecords}</strong><span>{ui("ui.app.account.page.591935b15b1c", "Public")}</span></div>
                  <div><strong>{stats.privateRecords + stats.unlistedRecords}</strong><span>{ui("ui.app.account.page.658ed7b26eff", "Private or unlisted")}</span></div>
                </div>
                <div className={styles.overviewRows}>
                  <div><span><b>{ui("ui.app.account.page.73949bb1bdba", "Profile details")}</b><small>{ui("ui.app.account.page.53babca0609e", "Your name and the tools you use.")}</small></span><button type="button" className="button secondary" onClick={() => setActiveSection("profile")}>{ui("ui.app.account.page.fd9c61ac500e", "Edit details")}</button></div>
                  <div><span><b>{ui("ui.app.account.page.8ca6da5bcd1b", "Public collection")}</b><small>{publishedHref ? ui("ui.app.account.page.a5b70b30efb9", "Your saved collection is ready to share.") : ui("ui.app.account.page.e7a081e4c5a2", "Bring your public Profiles together on one page.")}</small></span><button type="button" className="button secondary" onClick={() => setActiveSection("collection")}>{publishedHref ? ui("ui.app.account.page.b751505accb1", "Manage collection") : ui("ui.app.account.page.67aa727721b2", "Set up collection")}</button></div>
                  <div><span><b>{ui("ui.app.account.page.3386f588f0c2", "Account access")}</b><small>{ui("ui.app.account.page.9880be836d93", "Manage your password and active sign-in.")}</small></span><button type="button" className="button secondary" onClick={() => setActiveSection("security")}>{ui("ui.app.account.page.8f6fb4eb7f42", "Security")}</button></div>
                </div>
                <Link className={styles.textLink} href="/dashboard">{ui("ui.app.account.page.a1464d30c916", "Open your collection")}{" "}<span aria-hidden="true">↗</span></Link>
              </section>
            ) : null}

            {activeSection === "profile" ? <section className={styles.panel}>
              <div className={styles.panelHeading}>
                <span>{ui("ui.app.account.page.d696a35bdd18", "Profile")}</span>
                <strong><UserRound size={18} aria-hidden="true" /> {getContentValue(content, "account.profile.heading")}</strong>
              </div>

              <div className="field">
                <label htmlFor="accountEmail">{ui("ui.app.account.page.9934aa3adf5c", "Login email")}</label>
                <input id="accountEmail" value={email} readOnly />
                <p className="field-note">{ui("ui.app.account.page.5f91dc127d12", "This email receives password reset and ownership-transfer messages.")}</p>
              </div>

              <div className="field">
                <label htmlFor="displayName">{ui("ui.app.account.page.2b7f6a84de91", "Display name")}</label>
                <input id="displayName" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder={ui("ui.app.account.page.b4412569c09e", "Owner, shop, or builder name")} />
                <p className="field-note">{ui("ui.app.account.page.d034a5030b9c", "Shown on private tools and used as your default owner/shop label.")}</p>
              </div>

              <div className="field">
                <label htmlFor="workspaceType">{ui("ui.app.account.page.6fb83029b2c0", "How you use QRguitar")}</label>
                <select id="workspaceType" value={publicCollection.accountType} onChange={(event) => setPublicCollection((current) => ({ ...current, accountType: event.target.value as PublicCollectionSettings["accountType"] }))}>{WORKSPACE_OPTIONS.map((option) => <option value={option.value} key={option.value}>{workspaceOptionLabel(option.label, content)}</option>)}</select>
                <p className="field-note">{ui("ui.app.account.page.17c18130884e", "Choose the daily tools shown on your dashboard. You can save this preference with your public collection turned off. Provider verification is reviewed separately.")}</p>
              </div>

              <div className="form-actions">
                <button className="button" type="button" onClick={saveAccount} disabled={isWorking}>
                  {isWorking ? ui("ui.app.account.page.dc85af8f2b1d", "Saving...") : getContentValue(content, "account.actions.save")}
                </button>
              </div>
            </section> : null}

            {activeSection === "collection" ? <section className={styles.panel} id="public-collection">
              <div className={styles.panelHeading}>
                <strong><UsersRound size={18} aria-hidden="true" />{" "}{ui("ui.app.account.page.bfc93ccce3d7", "Your collection page")}</strong>
              </div>
              <p className={styles.copy}>{ui("ui.app.account.page.d5e138183dc3", "Give people one link to your instruments, with your name and a short introduction.")}</p>
              <div className={styles.preferenceGroup}>
              <label className="toggle-field">
                <input type="checkbox" checked={publicCollection.enabled} aria-describedby="collection-visibility-help" onChange={(event) => setPublicCollection((current) => ({ ...current, enabled: event.target.checked }))} />{ui("ui.app.account.page.390ed0ea84e0", "Enable my collection page")}</label>
              <p className="field-note" id="collection-visibility-help">{ui("ui.app.account.page.collectionVisibilityHelp", "Only Public Profiles appear here. Your page joins Member Collections once it has a Public Profile. Turning this off hides the collection page, without changing any Profile’s visibility.")}</p>
              </div>
              <div className="form-grid compact">
                <label className="field"><span>{ui("ui.app.account.page.8bb1664e67fa", "Page name")}</span><input value={publicCollection.publicName} onChange={(event) => setPublicCollection((current) => ({ ...current, publicName: event.target.value }))} placeholder={displayName} /></label>
                <label className="field"><span>{ui("ui.app.account.page.178b790b1cb2", "Custom link")}</span><input aria-describedby="collection-url-preview" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={publicCollection.handle} onChange={(event) => setPublicCollection((current) => ({ ...current, handle: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") }))} placeholder={ui("ui.app.account.page.6f61c615337a", "my-collection")} /><small className={styles.urlPreview} id="collection-url-preview">{PUBLIC_SITE_ORIGIN}/collections/{cleanCollectionHandle(publicCollection.handle) || "your-link-name"}</small></label>
                <label className="field"><span>{ui("ui.app.account.page.9dc1bb315851", "Location (optional)")}</span><input value={publicCollection.location} onChange={(event) => setPublicCollection((current) => ({ ...current, location: event.target.value }))} placeholder={ui("ui.app.account.page.fef8ce3a04b7", "City, region, country")} /></label>
                <label className="field custom-wide"><span>{ui("ui.app.account.page.81aa4ccb029d", "About you or your collection")}</span><textarea rows={3} value={publicCollection.bio} onChange={(event) => setPublicCollection((current) => ({ ...current, bio: event.target.value }))} placeholder={ui("ui.app.account.page.42e359637e9e", "What you collect, build, repair, or sell.")} /></label>
                <label className="field"><span>{ui("ui.app.account.page.5fec9267ba07", "Your website (optional)")}</span><input type="url" aria-describedby="collection-website-help" value={publicCollection.websiteUrl} onChange={(event) => setPublicCollection((current) => ({ ...current, websiteUrl: event.target.value }))} placeholder="https://your-website.com" maxLength={500} /><small id="collection-website-help" className="field-note">{ui("ui.app.account.page.2a5191a8ca1b", "Use the full HTTPS address. When your public collection is enabled, visitors can open this website from the collection and its instrument Profiles. Purchases and bookings take place on your website.")}</small></label>
                <label className="field"><span>{ui("ui.app.account.page.ea3c6074a51b", "Profile photo link (optional)")}</span><input type="url" value={publicCollection.avatarUrl} onChange={(event) => setPublicCollection((current) => ({ ...current, avatarUrl: event.target.value }))} placeholder="https://" /></label>
              </div>
              <div className={styles.preferenceGroup}>
              <label className="toggle-field"><input type="checkbox" aria-describedby="collection-search-help" checked={publicCollection.allowIndexing} onChange={(event) => setPublicCollection((current) => ({ ...current, allowIndexing: event.target.checked }))} />{" "}{ui("ui.app.account.page.27f7d9074b31", "Allow search engines to list my collection page")}</label>
              <p className="field-note" id="collection-search-help">{ui("ui.app.account.page.collectionSearchHelp", "Controls Google and other search engines. Turning this off does not hide your page from visitors.")}</p>
              </div>
              <div className={styles.preferenceGroup}>
              <label className="toggle-field">
                <input type="checkbox" checked={publicCollection.allowMessages} onChange={(event) => setPublicCollection((current) => ({ ...current, allowMessages: event.target.checked }))} />{ui("ui.app.account.page.bf5f93866b44", "Allow signed-in members to message you in QRguitar")}</label>
              <p className="field-note">{ui("ui.app.account.page.a9fc610e616e", "Your email stays private. Conversations stay inside QRguitar and can include up to four photos or short videos per message.")}</p>
              </div>
              <div className="form-actions">
                <button className="button" type="button" onClick={saveAccount} disabled={isWorking}>{isWorking ? ui("ui.app.account.page.dc85af8f2b1d", "Saving...") : ui("ui.app.account.page.a7f1e189ad7b", "Save collection settings")}</button>
                {publishedHref ? <Link className="button secondary" href={publishedHref} target="_blank" rel="noopener noreferrer">{ui("ui.app.account.page.693b86cbac84", "View collection page")}{" "}<ExternalLink size={15} /></Link> : null}
                <Link className="button secondary" href="/collections">{ui("ui.app.account.page.1fbba5113528", "Browse member collections")}</Link>
              </div>
              {(publicCollection.handle !== state.account?.publicCollection.handle || publicCollection.enabled !== state.account?.publicCollection.enabled) && <p className="field-note">{ui("ui.app.account.page.9fb466124379", "Save to apply these changes. View collection page opens the version you last saved.")}</p>}
            </section> : null}

            {activeSection === "security" ? <section className={styles.panel}>
              <div className={styles.panelHeading}>
                <span>{getContentValue(content, "account.security.heading")}</span>
                <strong><LockKeyhole size={18} aria-hidden="true" />{" "}{ui("ui.app.account.page.13399ccf0950", "Password access")}</strong>
              </div>
              <p className={styles.copy}>{ui("ui.app.account.page.9b5781f988de", "Send yourself a secure reset link any time. QRguitar never shows or stores your password in this dashboard.")}</p>
              <div className="form-actions">
                <button className="button secondary" type="button" onClick={sendPasswordReset} disabled={isWorking}>
                  {getContentValue(content, "account.actions.reset")}
                </button>
                <button className="button secondary" type="button" onClick={signOut} disabled={isWorking}>
                  <LogOut size={16} aria-hidden="true" />{" "}{ui("ui.app.account.page.48f0d3d397d4", "Sign out")}</button>
              </div>
            </section> : null}

            {activeSection === "notifications" ? <section className={styles.panel}>
              <div className={styles.panelHeading}>
                <span>{ui("ui.app.account.page.788011833a5a", "Notifications")}</span>
                <strong><ShieldCheck size={18} aria-hidden="true" />{" "}{ui("ui.app.account.page.ff52142d2401", "Account notices")}</strong>
              </div>
              <p className={styles.copy}>{ui("ui.app.account.page.b7d24faecb5a", "Security, transfer, claim, and service-review notices are sent to your account email when action is required.")}</p>
              <div className={styles.statusGrid}>
                <div><span>{ui("ui.app.account.page.1efeceaedae0", "Delivery email")}</span><strong>{email}</strong></div>
                <div><span>{ui("ui.app.account.page.c9aae06952ae", "Required notices")}</span><strong>{ui("ui.app.account.page.92c1cdfdf4cb", "Enabled")}</strong></div>
              </div>
              <p className="field-note">{ui("ui.app.account.page.e16273f1c0f6", "Required account and ownership notices cannot be disabled during public beta.")}</p>
            </section> : null}

            {activeSection === "provider" ? <section className={styles.panel}>
              <div className={styles.panelHeading}>
                <span>{ui("ui.app.account.page.963dc63cbd9f", "Provider / Business")}</span>
                <strong><ShieldCheck size={18} aria-hidden="true" />{" "}{ui("ui.app.account.page.6ba0be9a0111", "Business tools")}</strong>
              </div>
              <div className={styles.statusGrid}>
                <div><span>{ui("ui.app.account.page.920e413c7d41", "Status")}</span><strong>{accountStatus || ui("ui.app.account.page.96879611650f", "active")}</strong></div>
                <div><span>{ui("ui.app.account.page.fa8ed0bdabdd", "Plan")}</span><strong>{plan || ui("ui.app.account.page.ad95d5fa651b", "free")}</strong></div>
                <div><span>{ui("ui.app.account.page.14736a2eb9f4", "Role")}</span><strong>{role || ui("ui.app.account.page.04f8996da763", "user")}</strong></div>
              </div>
              <p className={styles.copy}>{getWorkspace(publicCollection.accountType, content).description}</p>
              <div className="form-actions">
                <Link className="button" href="/dashboard/service">{ui("ui.app.account.page.61669a91a83b", "Open service workbench")}</Link>
                <Link className="button secondary" href="/dashboard/import">{ui("ui.app.account.page.7150f79bc954", "Open Bulk Import")}</Link>
                <Link className="button secondary" href="/installers">{ui("ui.app.account.page.78a5a284fa46", "Service Provider Network")}</Link>
              </div>
            </section> : null}

            {activeSection === "privacy" ? <section className={styles.panel}>
              <div className={styles.panelHeading}>
                <span>{ui("ui.app.account.page.ade3e28bc653", "Privacy & Data")}</span>
                <strong><ShieldCheck size={18} aria-hidden="true" />{" "}{ui("ui.app.account.page.a4f145526932", "Profile controls")}</strong>
              </div>
              <p className={styles.copy}>{ui("ui.app.account.page.ff8634e1b9dd", "Each Profile controls visibility, private documents, service history, Serial Number display, and QR downloads from its editor.")}</p>
              <div className="form-actions">
                <Link className="button secondary" href="/dashboard">{ui("ui.app.account.page.98f4a6a50399", "Manage Profiles")}</Link>
                <Link className="button secondary" href="/contact">{ui("ui.app.account.page.eb39d7ae9ff5", "Get support")}</Link>
              </div>
            </section> : null}

            </fieldset>
            {activeSection === "privacy" && <AccountDeletionSection actorId={state.actorId} auth={accountDeletionAuth} />}
            {status ? <p className="form-message" role="status">{status}</p> : null}
            {state.uncertainSave && <div className="form-message"><p>{ui("ui.app.account.page.bddc85940d45", "Reload the saved settings before editing again; reloading replaces the form with the server version.")}</p><button className="button secondary" type="button" onClick={() => void controller.current?.reload()}>{ui("ui.app.account.page.d848587486e8", "Reload saved account")}</button></div>}
            </div>
          </div>
        </div>
      </OwnerWorkspace>
      <Footer />
    </>
  );
}

function AccountLoading() {
  const ui = useUiText("app.account.page");
  return <><Nav /><main className={authStyles.page}><div className={authStyles.layout}><section className={authStyles.formPanel} aria-live="polite" aria-busy="true"><div className="eyebrow">{ui("ui.app.account.page.7e1b0d5641f2", "Account")}</div><h1>{ui("ui.app.account.page.a851f033716c", "Loading your account...")}</h1><p>{ui("ui.app.account.page.67f2c270991d", "Checking your QRguitar session and owner workspace.")}</p></section></div></main><Footer /></>;
}
