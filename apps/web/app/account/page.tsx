"use client";
import { useUiText } from "../../components/UiTextProvider";


import { OwnerWorkspace } from "../../components/OwnerWorkspace";
import authStyles from "../../components/AuthForm.module.css";
import styles from "./account.module.css";

import { PwaInstall } from "../../components/PwaInstall";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ExternalLink, LockKeyhole, LogOut, ShieldCheck, UserRound, UsersRound } from "lucide-react";
import { Suspense, useEffect, useRef, useState } from "react";
import { Footer } from "../../components/Footer";
import { Nav } from "../../components/Nav";
import { clearQrGuitarSessionState, createBrowserSupabaseClient } from "../../lib/supabase-browser";
import { cleanCollectionHandle, type PublicCollectionSettings } from "../../lib/public-collections";
import { accountReturnPath, createAccountSettings, initialAccountSettings, savedCollectionHref, type AccountDraft, type AccountSnapshot } from "../../lib/account-settings";
import { PUBLIC_SITE_ORIGIN } from "../../lib/profile-url";
import { getContentValue } from "../../lib/content-registry";
import { useSiteContent } from "../../lib/use-site-content";
import { getWorkspace, workspaceOptionLabel, WORKSPACE_OPTIONS } from "../../lib/workspace-tools";
import OwnerNameConsentSection from "../../components/OwnerNameConsentSection";
import AccountDeletionSection from "../../lib/account-deletion/AccountDeletionSection";
import { accountDeletionAuth } from "../../lib/account-deletion/account-deletion-auth";

type AccountSection = "overview" | "profile" | "collection" | "security" | "notifications" | "provider" | "privacy";

function changedAccountSections(draft: AccountDraft, saved: AccountSnapshot | null): Array<"profile" | "collection"> {
  if (!saved) return [];
  const sections: Array<"profile" | "collection"> = [];
  if (draft.displayName !== saved.displayName || draft.publicCollection.accountType !== saved.publicCollection.accountType) sections.push("profile");
  const collectionFields: Array<keyof PublicCollectionSettings> = ["enabled", "handle", "publicName", "bio", "location", "websiteUrl", "avatarUrl", "allowIndexing", "allowMessages", "allowWarrantyHelp", "warrantyHelpUrl"];
  if (collectionFields.some((key) => draft.publicCollection[key] !== saved.publicCollection[key])) sections.push("collection");
  return sections;
}

function accountValidationTarget(message: string): { section: "profile" | "collection"; id: string } | null {
  if (/^Display name must be/.test(message)) return { section: "profile", id: "displayName" };
  if (/^Use a complete website address/.test(message)) return { section: "collection", id: "collectionWebsite" };
  if (/^(Choose a collection handle|That public collection handle)/.test(message)) return { section: "collection", id: "collectionHandle" };
  if (/^Choose a collection name/.test(message)) return { section: "collection", id: "collectionName" };
  if (/^Invalid public collection settings/.test(message)) return { section: "collection", id: "public-collection" };
  return null;
}

const accountSections: Array<{ id: AccountSection; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "collection", label: "Public Collection" },
  { id: "profile", label: "Account details" },
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
  const router = useRouter();
  const controller = useRef<ReturnType<typeof createAccountSettings> | null>(null);
  const [state, setState] = useState(initialAccountSettings);
  const [activeSection, setActiveSection] = useState<AccountSection>("overview");
  const [validationFocus, setValidationFocus] = useState<{ section: "profile" | "collection"; id: string; actorId: string } | null>(null);
  const { displayName, publicCollection } = state.draft;
  const email = state.account?.email || "";
  const role = state.account?.role || "";
  const plan = state.account?.plan || "";
  const accountStatus = state.account?.accountStatus || "";
  const stats = state.account?.stats || { records: 0, publicRecords: 0, privateRecords: 0, unlistedRecords: 0 };
  const status = state.message;
  const isWorking = Boolean(state.busy);
  const workspaceAccountType = state.account?.publicCollection.accountType || "player";
  const professionalWorkspace = ["shop", "builder", "brand", "luthier"].includes(workspaceAccountType);
  const visibleAccountSections = accountSections.filter(section => section.id !== "provider" || professionalWorkspace);
  const publishedHref = savedCollectionHref(state.account);
  const returnPath = accountReturnPath(activeSection);
  const dirtySections = changedAccountSections(state.draft, state.account);
  const dirtySectionNames = dirtySections.map((section) => section === "profile"
    ? ui("ui.app.account.page.999fcfbc4384", "Account details")
    : ui("ui.app.account.page.81d7c837c3e8", "Collection page")).join(", ");
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
    setActiveSection(accountSections.some((section) => section.id === requestedSection && (section.id !== "provider" || professionalWorkspace)) ? requestedSection as AccountSection : "overview");
  }, [search, professionalWorkspace]);

  function navigateSection(section: AccountSection) {
    if (section === activeSection) return;
    const query = new URLSearchParams(search.toString());
    if (section === "overview") query.delete("section");
    else query.set("section", section);
    setActiveSection(section);
    router.push(`/account${query.size ? `?${query}` : ""}`, { scroll: false });
  }

  useEffect(() => {
    if (!validationFocus) return;
    if (validationFocus.actorId !== state.actorId || state.phase !== "ready") { setValidationFocus(null); return; }
    if (activeSection !== validationFocus.section) return;
    const target = document.getElementById(validationFocus.id);
    if (target) { target.focus(); setValidationFocus(null); }
  }, [validationFocus, activeSection, state.actorId, state.phase]);

  async function saveAccount() {
    const current = controller.current;
    const actorId = current?.getState().actorId;
    await current?.save();
    const result = current?.getState();
    if (controller.current !== current || !result || result.actorId !== actorId || result.phase !== "ready" || result.uncertainSave) return;
    const target = accountValidationTarget(result.message);
    if (target) {
      setValidationFocus({ ...target, actorId: result.actorId });
      navigateSection(target.section);
    }
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
      <OwnerWorkspace current="account" accountType={workspaceAccountType}>
        <div className={styles.account}>
          <header className={styles.header}>
            <h1>{getContentValue(content, "account.hero.headline")}</h1>
            <p>{getContentValue(content, "account.hero.body")}</p>
          </header>

          <div className={styles.settings}>
            <label className={styles.mobileSectionNav}><span>{ui("ui.app.account.page.settingsSection", "Settings section")}</span><select aria-label={ui("ui.app.account.page.settingsSection", "Settings section")} value={activeSection} onChange={(event) => navigateSection(event.target.value as AccountSection)}>{visibleAccountSections.map((section) => <option key={section.id} value={section.id}>{(section.label === "Overview" ? ui("ui.app.account.page.d4b1ea5708dd", "Overview") : section.label === "Public Collection" ? ui("ui.app.account.page.81d7c837c3e8", "Collection page") : section.label === "Account details" ? ui("ui.app.account.page.999fcfbc4384", "Account details") : section.label === "Security" ? ui("ui.app.account.page.8f6fb4eb7f42", "Security") : section.label === "Notifications" ? ui("ui.app.account.page.788011833a5a", "Notifications") : section.label === "Provider / Business" ? ui("ui.app.account.page.963dc63cbd9f", "Provider / Business") : section.label === "Privacy & Data" ? ui("ui.app.account.page.ade3e28bc653", "Privacy & Data") : section.label)}</option>)}</select></label>
            <nav className={styles.sectionNav} aria-label={ui("ui.app.account.page.baa77cb99154", "Account sections")}>
              {visibleAccountSections.map((section) => (
                <button
                  aria-current={activeSection === section.id ? "page" : undefined}
                  className={activeSection === section.id ? styles.active : undefined}
                  key={section.id}
                  onClick={() => navigateSection(section.id)}
                  type="button"
                >
                  {(section.label === "Overview" ? ui("ui.app.account.page.d4b1ea5708dd", "Overview") : section.label === "Public Collection" ? ui("ui.app.account.page.81d7c837c3e8", "Collection page") : section.label === "Account details" ? ui("ui.app.account.page.999fcfbc4384", "Account details") : section.label === "Security" ? ui("ui.app.account.page.8f6fb4eb7f42", "Security") : section.label === "Notifications" ? ui("ui.app.account.page.788011833a5a", "Notifications") : section.label === "Provider / Business" ? ui("ui.app.account.page.963dc63cbd9f", "Provider / Business") : section.label === "Privacy & Data" ? ui("ui.app.account.page.ade3e28bc653", "Privacy & Data") : section.label)}
                </button>
              ))}
            </nav>

            <div className={styles.content}>


            {(activeSection === "profile" || activeSection === "collection" || dirtySections.length > 0) ? <div className={styles.saveFeedback}>
            {(activeSection === "profile" || activeSection === "collection" || dirtySections.length > 0) ? <p className="field-note" id="account-save-scope">{ui("ui.app.account.page.catalogSaveScope", "Saving updates Account details and your named collection together. Password and sign-out actions are separate.")}</p> : null}
            {dirtySections.length > 0 ? <p className="field-note" role="status" aria-live="polite">{ui("ui.app.account.page.unsavedSections", "Unsaved changes: {{value1}}. Nothing is applied until you save.", { value1: dirtySectionNames })}</p> : null}
            </div> : null}

            <fieldset disabled={isWorking || (state.uncertainSave && (activeSection === "profile" || activeSection === "collection"))} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
            {activeSection === "overview" ? (
              <section className={styles.panel}>
                <div className={styles.identity}>
                  <div className={styles.avatar} aria-hidden="true">{(displayName || email || "Q").slice(0, 1).toUpperCase()}</div>
                  <div><h2>{displayName || ui("ui.app.account.page.dbb5f6371b6a", "Your account")}</h2><p>{email}</p><small>{accountStatus || ui("ui.app.account.page.96879611650f", "active")} · {plan || ui("ui.app.account.page.ad95d5fa651b", "free")} · {role || ui("ui.app.account.page.04f8996da763", "user")}</small></div>
                </div>
                <div className={styles.metrics} aria-label={ui("ui.app.account.page.c8c1af060b0c", "Collection summary")}>
                  <div><strong>{stats.records}</strong><span>{ui("ui.app.account.page.535e52e4a261", "Profiles")}</span></div>
                </div>
                <div className={styles.overviewRows}>
                  <div><span><b>{ui("ui.app.account.page.73949bb1bdba", "Profile details")}</b><small>{ui("ui.app.account.page.53babca0609e", "Your name and the tools you use.")}</small></span><button type="button" className="button secondary" onClick={() => navigateSection("profile")}>{ui("ui.app.account.page.fd9c61ac500e", "Edit details")}</button></div>
                  <div><span><b>{ui("ui.app.account.page.namedCollection", "Collection page")}</b><small>{publishedHref ? ui("ui.app.account.page.a5b70b30efb9", "Collection page enabled.") : ui("ui.app.account.page.namedCollectionSetup", "Choose the name and introduction linked from your instruments.")}</small></span><button type="button" className="button secondary" onClick={() => navigateSection("collection")}>{publishedHref ? ui("ui.app.account.page.b751505accb1", "Manage collection") : ui("ui.app.account.page.67aa727721b2", "Set up collection")}</button></div>
                  <div><span><b>{ui("ui.app.account.page.3386f588f0c2", "Account access")}</b><small>{ui("ui.app.account.page.9880be836d93", "Manage your password and active sign-in.")}</small></span><button type="button" className="button secondary" onClick={() => navigateSection("security")}>{ui("ui.app.account.page.8f6fb4eb7f42", "Security")}</button></div>
                </div>
                <Link className={styles.textLink} href="/dashboard">{ui("ui.app.account.page.a1464d30c916", "Open your collection")}{" "}<span aria-hidden="true">↗</span></Link>
              </section>
            ) : null}

            {activeSection === "overview" ? <PwaInstall /> : null}

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
                <p className="field-note">{ui("ui.app.account.page.accountDisplayHelp", "Used in your signed-in workspace. Your instruments show the collection name you choose separately.")}</p>
              </div>

              <div className="field">
                <label htmlFor="workspaceType">{ui("ui.app.account.page.6fb83029b2c0", "Dashboard tools")}</label>
                <select id="workspaceType" value={publicCollection.accountType} onChange={(event) => setPublicCollection((current) => ({ ...current, accountType: event.target.value as PublicCollectionSettings["accountType"] }))}>{WORKSPACE_OPTIONS.map((option) => <option value={option.value} key={option.value}>{workspaceOptionLabel(option.label, content)}</option>)}</select>
                <p className="field-note">{ui("ui.app.account.page.workspaceTypeHelp", "Choose the daily tools shown in My collection. Provider verification is reviewed separately.")}</p>
              </div>

              <div className="form-actions">
                <button className="button" type="button" onClick={saveAccount} disabled={isWorking} aria-describedby="account-save-scope">
                  {isWorking ? ui("ui.app.account.page.dc85af8f2b1d", "Saving...") : getContentValue(content, "account.actions.save")}
                </button>
              </div>
            </section> : null}

            {activeSection === "collection" ? <section className={styles.panel} id="public-collection" tabIndex={-1}>
              <div className={styles.panelHeading}>
                <strong><UsersRound size={18} aria-hidden="true" />{" "}{ui("ui.app.account.page.bfc93ccce3d7", "Your collection page")}</strong>
              </div>
              <p className={styles.copy}>{ui("ui.app.account.page.d5e138183dc3", "Give people one link to your instruments, with your name and a short introduction.")}</p>
              <div className={styles.preferenceGroup}>
              <label className="toggle-field"><input id="collectionEnabled" type="checkbox" aria-describedby="collection-visibility-help" checked={publicCollection.enabled} onChange={(event) => setPublicCollection((current) => ({ ...current, enabled: event.target.checked }))} />{" "}{ui("ui.app.account.page.collectionPublicationChoice", "Make my collection page public")}</label>
              <p className="field-note" id="collection-visibility-help">{ui("ui.app.account.page.collectionPublicationHelp", "Only your public Profiles appear here. Private and unlisted Profiles stay off this page. Save to apply your choice.")}</p>
              </div>
              <div className="form-grid compact">
                <label className="field"><span>{ui("ui.app.account.page.collectionName", "Collection name")}</span><input id="collectionName" value={publicCollection.publicName} onChange={(event) => setPublicCollection((current) => ({ ...current, publicName: event.target.value }))} placeholder={ui("ui.app.account.page.collectionNamePlaceholder", "A name you choose")} maxLength={80} /></label>
                <label className="field"><span>{ui("ui.app.account.page.178b790b1cb2", "Custom link")}</span><input id="collectionHandle" aria-describedby="collection-url-preview" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={publicCollection.handle} onChange={(event) => setPublicCollection((current) => ({ ...current, handle: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") }))} placeholder={ui("ui.app.account.page.6f61c615337a", "my-collection")} /><small className={styles.urlPreview} id="collection-url-preview">{PUBLIC_SITE_ORIGIN}/collections/{cleanCollectionHandle(publicCollection.handle) || "your-link-name"}</small></label>
                <label className="field"><span>{ui("ui.app.account.page.9dc1bb315851", "Location (optional)")}</span><input value={publicCollection.location} onChange={(event) => setPublicCollection((current) => ({ ...current, location: event.target.value }))} placeholder={ui("ui.app.account.page.fef8ce3a04b7", "City, region, country")} /></label>
                <label className="field custom-wide"><span>{ui("ui.app.account.page.81aa4ccb029d", "About you or your collection")}</span><textarea rows={3} value={publicCollection.bio} onChange={(event) => setPublicCollection((current) => ({ ...current, bio: event.target.value }))} placeholder={ui("ui.app.account.page.42e359637e9e", "A short description.")} /></label>
                <label className="field"><span>{ui("ui.app.account.page.5fec9267ba07", "Your website (optional)")}</span><input id="collectionWebsite" type="url" aria-describedby="collection-website-help" value={publicCollection.websiteUrl} onChange={(event) => setPublicCollection((current) => ({ ...current, websiteUrl: event.target.value }))} placeholder="https://your-website.com" maxLength={500} /><small id="collection-website-help" className="field-note">{ui("ui.app.account.page.collectionWebsiteHelp", "Use the full HTTPS address. Visitors can open this website from your collection and its instruments. Purchases and bookings take place on your website.")}</small></label>
                <label className="field"><span>{publicCollection.accountType === "shop" || publicCollection.accountType === "builder" ? ui("ui.app.account.page.companyLogoLink", "Company logo link (optional)") : ui("ui.app.account.page.ea3c6074a51b", "Profile photo link (optional)")}</span><input type="url" value={publicCollection.avatarUrl} onChange={(event) => setPublicCollection((current) => ({ ...current, avatarUrl: event.target.value }))} placeholder="https://" /></label>
              </div>
              <div className={styles.preferenceGroup}>
              <label className="toggle-field"><input type="checkbox" aria-describedby="collection-search-help" checked={publicCollection.allowIndexing} onChange={(event) => setPublicCollection((current) => ({ ...current, allowIndexing: event.target.checked }))} />{" "}{ui("ui.app.account.page.27f7d9074b31", "Allow search engines to list my collection page")}</label>
              <p className="field-note" id="collection-search-help">{ui("ui.app.account.page.collectionSearchHelp", "Controls Google and other search engines. Turning this off does not hide your page from visitors.")}</p>
              </div>
              <div className={styles.preferenceGroup}>
              <label className="toggle-field">
                <input type="checkbox" checked={publicCollection.allowMessages} onChange={(event) => setPublicCollection((current) => ({ ...current, allowMessages: event.target.checked }))} />{ui("ui.app.account.page.bf5f93866b44", "Allow signed-in members to message you in QRguitar")}</label>
              <p className="field-note">{ui("ui.app.account.page.contactProtectionHelp", "Your email is not shown on your collection or instruments. Conversations stay inside QRguitar and can include up to four photos or short videos per message.")}</p>
              </div>
              {["shop", "builder"].includes(publicCollection.accountType) ? <div className={styles.preferenceGroup}>
                <label className="toggle-field"><input type="checkbox" checked={publicCollection.allowWarrantyHelp} onChange={event => setPublicCollection(current => ({ ...current, allowWarrantyHelp: event.target.checked }))} />{ui("ui.app.account.page.allowWarrantyHelp", "Offer warranty assistance through your website")}</label>
                <label className="field"><span>{ui("ui.app.account.page.warrantyHelpUrl", "Warranty assistance address")}</span><input type="url" maxLength={500} value={publicCollection.warrantyHelpUrl} onChange={event => setPublicCollection(current => ({ ...current, warrantyHelpUrl: event.target.value }))} placeholder="https://" /></label>
                <p className="field-note">{ui("ui.app.account.page.warrantyHelpExplanation", "Separate from QRguitar messaging. This offers assistance, not a guarantee of coverage. Save to apply your choice.")}</p>
              </div> : null}
              <div className="form-actions">
                <button className="button" type="button" onClick={saveAccount} disabled={isWorking} aria-describedby="account-save-scope">{isWorking ? ui("ui.app.account.page.dc85af8f2b1d", "Saving...") : ui("ui.app.account.page.a7f1e189ad7b", "Save account changes")}</button>
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
              <p className={styles.copy}>{ui("ui.app.account.page.b7d24faecb5a", "Email updates can cover account security, service reviews, ownership claims and transfer outcomes. Check your QRguitar workspace for the latest status. PayPal sends its own payment notices.")}</p>
              <div className={styles.statusGrid}>
                <div><span>{ui("ui.app.account.page.1efeceaedae0", "Delivery email")}</span><strong>{email}</strong></div>
                <div><span>{ui("ui.app.account.page.c9aae06952ae", "QRguitar workflow emails")}</span><strong>{ui("ui.app.account.page.92c1cdfdf4cb", "Service, claims and transfers")}</strong></div>
              </div>
              <p className="field-note">{ui("ui.app.account.page.e16273f1c0f6", "Claim, transfer, service, message, deletion-request, and billing updates stay available in their QRguitar workspaces while account access exists.")}</p>
            </section> : null}

            {activeSection === "provider" && professionalWorkspace ? <section className={styles.panel}>
              <div className={styles.panelHeading}>
                <span>{ui("ui.app.account.page.963dc63cbd9f", "Provider / Business")}</span>
                <strong><ShieldCheck size={18} aria-hidden="true" />{" "}{ui("ui.app.account.page.6ba0be9a0111", "Business tools")}</strong>
              </div>
              <div className={styles.statusGrid}>
                <div><span>{ui("ui.app.account.page.920e413c7d41", "Status")}</span><strong>{accountStatus || ui("ui.app.account.page.96879611650f", "active")}</strong></div>
                <div><span>{ui("ui.app.account.page.fa8ed0bdabdd", "Plan")}</span><strong>{plan || ui("ui.app.account.page.ad95d5fa651b", "free")}</strong></div>
                <div><span>{ui("ui.app.account.page.14736a2eb9f4", "Role")}</span><strong>{role || ui("ui.app.account.page.04f8996da763", "user")}</strong></div>
              </div>
              <p className={styles.copy}>{getWorkspace(workspaceAccountType, content).description}</p>
              <div className="form-actions">
                {getWorkspace(workspaceAccountType, content).actions.map((action, index) => <Link key={action.href} className={index === 0 ? "button" : "button secondary"} href={action.href}>{action.title}</Link>)}
              </div>
            </section> : null}

            {activeSection === "privacy" ? <section className={styles.panel}>
              <div className={styles.panelHeading}>
                <span>{ui("ui.app.account.page.ade3e28bc653", "Privacy & Data")}</span>
                <strong><ShieldCheck size={18} aria-hidden="true" />{" "}{ui("ui.app.account.page.a4f145526932", "Profile controls")}</strong>
              </div>
              <p className={styles.copy}>{ui("ui.app.account.page.savedInstrumentPrivacyHelp", "New Profiles enter Catalog. Existing Private and Unlisted access is preserved when you edit. Collection visibility and document sharing remain separate.")}</p>
              <div className="form-actions">
                <Link className="button secondary" href="/dashboard">{ui("ui.app.account.page.98f4a6a50399", "Manage Profiles")}</Link>
                <Link className="button secondary" href="/contact">{ui("ui.app.account.page.eb39d7ae9ff5", "Get support")}</Link>
              </div>
            </section> : null}

            </fieldset>
            {activeSection === "privacy" && <><OwnerNameConsentSection actorId={state.actorId} auth={accountDeletionAuth} /><AccountDeletionSection actorId={state.actorId} auth={accountDeletionAuth} /></>}
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
