"use client";
import { useUiText } from "../../components/UiTextProvider";


import { OwnerWorkspace } from "../../components/OwnerWorkspace";
import authStyles from "../../components/AuthForm.module.css";

import { ownerProfileHref } from "../../lib/owner-profile";

import { BookOpenText, Copy, Ellipsis, EyeOff, FileSpreadsheet, FileText, ImagePlus, Mail, Printer, Repeat2, Search, ShieldCheck, UsersRound, Wrench } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActionDrawer } from "../../components/ActionDrawer";
import { CompactQr } from "../../components/CompactQr";
import { Footer } from "../../components/Footer";
import { Nav } from "../../components/Nav";
import { ProfileStatusBadges } from "../../components/ProfileStatusBadges";
import { ProfileQuickEdit } from "../../components/ProfileQuickEdit";
import { QrDownload } from "../../components/QrDownload";
import { RecordShareButton } from "../../components/RecordShareButton";
import { WorkspaceActions } from "../../components/WorkspaceActions";
import { getWorkspace } from "../../lib/workspace-tools";
import styles from "./dashboard-records.module.css";
import { defaultSiteSettings, fetchPublishedSiteSettings } from "../../lib/site-settings";
import {
  getInstrumentCondition,
  getInstrumentVerificationStatus,
  transferStatusLabel,
  type DemoInstrument,
  type DemoTransfer,
  type DemoUser
} from "../../lib/local-demo";
import { createBrowserSupabaseClient, getSupabaseAccessToken } from "../../lib/supabase-browser";
import { getProfilePhotoUrls, getServiceHistoryEntries } from "../../lib/instrument-profile-contract";
import { getContentValue } from "../../lib/content-registry";
import { useSiteContent } from "../../lib/use-site-content";

type DashboardFilter = "all" | "public" | "private";

type ServiceRequestSummary = {
  id: string;
  qrCode: string;
  profileTitle: string;
  status: "draft" | "submitted" | "changes_requested" | "approved" | "declined" | "cancelled" | "expired";
  title: string;
  serviceType: string;
  serviceDate: string;
  evidenceCount: number;
  updatedAt: string;
  provider?: { publicDisplayName?: string; businessName?: string; verificationStatus?: "verified" | "unverified" } | null;
};

function mergeDashboardRecords(records: DemoInstrument[]) {
  return records;
}

function DashboardInstrumentThumb({ sources, title }: { sources: string[]; title: string }) {
  const ui = useUiText("app.dashboard.page");
  const imageSources = useMemo(
    () => Array.from(new Set(sources.map((source) => String(source || "").trim()).filter(Boolean))),
    [sources]
  );
  const [imageIndex, setImageIndex] = useState(0);
  const [failedAllImages, setFailedAllImages] = useState(false);
  const imageUrl = imageSources[imageIndex] || "";
  const imageSourceKey = imageSources.join("|");

  useEffect(() => {
    setImageIndex(0);
    setFailedAllImages(false);
  }, [imageSourceKey]);

  return (
    <div className={styles.instrumentThumb} aria-hidden="true">
      {imageUrl && !failedAllImages ? (
        <img
          key={imageUrl}
          src={imageUrl}
          alt=""
          loading="lazy"
          fetchPriority="low"
          decoding="async"
          width={1200}
          height={900}
          referrerPolicy="no-referrer"
          onError={() => {
            setImageIndex((current) => {
              const next = current + 1;
              if (next >= imageSources.length) {
                setFailedAllImages(true);
                return current;
              }

              return next;
            });
          }}
        />
      ) : (
        <span>{title.slice(0, 2).toUpperCase() || ui("ui.app.dashboard.page.a439fba430a3", "QR")}</span>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const ui = useUiText("app.dashboard.page");
  const content = useSiteContent();
  const [user, setUser] = useState<DemoUser | null>(null);
  const [instruments, setInstruments] = useState<DemoInstrument[]>([]);
  const [transfers, setTransfers] = useState<DemoTransfer[]>([]);
  const [serviceRequests, setServiceRequests] = useState<ServiceRequestSummary[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const sessionEmail = useRef("");
  const accountRevision = useRef(0);
  const renderedAccountRevision = accountRevision.current;
  const visibilityRequests = useRef(new Map<string, { revision: number }>());
  const removalRequests = useRef(new Map<string, { revision: number }>());
  const [visibilityPendingCodes, setVisibilityPendingCodes] = useState<string[]>([]);
  const [recordsLoaded, setRecordsLoaded] = useState(false);
  const [recordsError, setRecordsError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [dashboardMessage, setDashboardMessage] = useState("");
  const [dashboardCopy, setDashboardCopy] = useState(defaultSiteSettings.dashboard);
  const [activeFilter, setActiveFilter] = useState<DashboardFilter>("all");
  const [quickEditRecord, setQuickEditRecord] = useState<DemoInstrument | null>(null);
  const [collectionHandle, setCollectionHandle] = useState("");
  const [collectionAccountType, setCollectionAccountType] = useState("");
  const workspace = getWorkspace(collectionAccountType, content);
  const [actionRecord, setActionRecord] = useState<DemoInstrument | null>(null);
  const [actionTrigger, setActionTrigger] = useState<HTMLElement | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    void fetchPublishedSiteSettings().then((published) => {
      if (published?.dashboard) {
        setDashboardCopy(published.dashboard);
      }
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    let authResolved = false;
    const accountRevisionRef = accountRevision;
    let supabase: ReturnType<typeof createBrowserSupabaseClient>;
    try { supabase = createBrowserSupabaseClient(); } catch {
      setAuthChecked(true);
      setDashboardMessage("Account access is temporarily unavailable. Please reload.");
      return;
    }
    const timeout = window.setTimeout(() => {
      if (!cancelled && !authResolved) {
        setUser(null); setAuthChecked(true);
        setDashboardMessage("Could not check your session. Please reload.");
      }
    }, 10000);
    function applySession(session: { user: { email?: string; user_metadata?: Record<string, unknown> } } | null) {
      if (cancelled) return;
      authResolved = true;
      window.clearTimeout(timeout);
      const email = session?.user.email || "";
      if (sessionEmail.current !== email) {
        sessionEmail.current = email;
        accountRevisionRef.current++;
        visibilityRequests.current.clear(); removalRequests.current.clear(); setVisibilityPendingCodes([]);
        setInstruments([]); setTransfers([]); setServiceRequests([]);
        setQuickEditRecord(null); setActionRecord(null); setSearchQuery("");
        setCollectionHandle(""); setCollectionAccountType("");
        setRecordsLoaded(false); setRecordsError("");
      }
      setUser(session?.user ? mapSupabaseUser(session.user) : null);
      setAuthChecked(true);
    }
    void supabase.auth.getSession().then(({ data }) => {
      if (!authResolved) applySession(data.session);
    }).catch(() => {
      if (!cancelled && !authResolved) { setAuthChecked(true); setDashboardMessage("Could not check your session. Please reload."); }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => applySession(session));
    return () => { cancelled = true; accountRevisionRef.current++; window.clearTimeout(timeout); listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!user?.email) { setLoadingRecords(false); return; }
    let cancelled = false;
    const revision = accountRevision.current;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      controller.abort();
      if (!cancelled && revision === accountRevision.current) {
        setRecordsError("Loading your collection took too long. Please try again.");
        setLoadingRecords(false);
      }
    }, 20000);
    setLoadingRecords(true);
    setRecordsError("");
    void getSupabaseAccessToken().then(async token => {
      const [records, transferRecords, requests] = await Promise.all([
        loadDashboardInstruments(token, false, controller.signal),
        loadDashboardTransfers(token, controller.signal),
        loadOwnerServiceRequests(token, controller.signal)
      ]);
      if (!cancelled && revision === accountRevision.current && !controller.signal.aborted) {
        setInstruments(mergeDashboardRecords(records)); setTransfers(transferRecords); setServiceRequests(requests);
        setRecordsLoaded(true);
      }
    }).catch(error => {
      if (!cancelled && revision === accountRevision.current) setRecordsError(error instanceof Error ? error.message : "Could not load your collection. Please try again.");
    }).finally(() => {
      window.clearTimeout(timeout);
      if (!cancelled && revision === accountRevision.current) setLoadingRecords(false);
    });
    return () => { cancelled = true; controller.abort(); window.clearTimeout(timeout); };
  }, [user?.email, loadAttempt]);

  useEffect(() => {
    if (!user?.email) return;
    let cancelled = false;
    const revision = accountRevision.current;
    void getSupabaseAccessToken().then(async token => {
      const response = await fetch("/api/account", { headers: { authorization: "Bearer " + token }, cache: "no-store" });
      const payload = await response.json().catch(() => null) as { ok?: boolean; account?: { publicCollection?: { enabled?: boolean; handle?: string; accountType?: string } } } | null;
      if (cancelled || revision !== accountRevision.current) return;
      if (!response.ok || !payload?.ok) { setCollectionHandle(""); setCollectionAccountType(""); return; }
      const collection = payload.account?.publicCollection;
      setCollectionHandle(collection?.enabled ? String(collection.handle || "") : "");
      setCollectionAccountType(String(collection?.accountType || ""));
    }).catch(() => { if (!cancelled && revision === accountRevision.current) { setCollectionHandle(""); setCollectionAccountType(""); } });
    return () => { cancelled = true; };
  }, [user?.email, loadAttempt]);

  const instrumentCodes = useMemo(() => new Set(instruments.map((instrument) => instrument.qrCode.toUpperCase())), [instruments]);
  const pendingTransfers = transfers.filter(
    (transfer) => transfer.status === "sent" && instrumentCodes.has(transfer.guitarQrCode.toUpperCase())
  ).length;
  const ownerReviewRequests = serviceRequests.filter(
    (request) => request.status === "submitted"
  ).length;
  const publicRecords = instruments.filter((instrument) => instrument.visibility === "public").length;
  const privateRecords = instruments.filter((instrument) => instrument.visibility === "private").length;
  const unlistedRecords = instruments.filter((instrument) => instrument.visibility === "unlisted").length;
  const verifiedRecords = instruments.filter((instrument) => getInstrumentVerificationStatus(instrument) === "verified").length;
  const authenticityConfirmedRecords = instruments.filter((instrument) => instrument.authenticityStatus === "confirmed").length;
  const chronologicalInstruments = useMemo(
    () => [...instruments].sort((first, second) => Date.parse(first.createdAt || "") - Date.parse(second.createdAt || "")),
    [instruments]
  );
  const profileNumbers = useMemo(
    () => new Map(chronologicalInstruments.map((instrument, index) => [instrument.qrCode, index + 1])),
    [chronologicalInstruments]
  );
  const displayedInstruments = useMemo(
    () => chronologicalInstruments.filter((instrument) => matchesDashboardFilter(instrument, activeFilter) && matchesDashboardSearch(instrument, searchQuery)),
    [activeFilter, chronologicalInstruments, searchQuery]
  );

  function refreshInstruments() { setLoadAttempt(value => value + 1); }

  function focusServiceRequests() {
    setDashboardMessage("");
    if (!recordsLoaded || recordsError) { setDashboardMessage("Service requests could not be checked. Reload your collection first."); return; }
    if (!ownerReviewRequests) {
      setDashboardMessage("No service requests need review.");
      return;
    }
    const workspaceTools = document.getElementById("workspace-tools");
    if (workspaceTools instanceof HTMLDetailsElement) workspaceTools.open = true;
    const serviceRequestRegion = document.getElementById("service-requests");
    if (serviceRequestRegion instanceof HTMLElement) serviceRequestRegion.focus({ preventScroll: true });
    const scrollBehavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    serviceRequestRegion?.scrollIntoView({ behavior: scrollBehavior, block: "start" });
  }

  function focusOwnershipTransfers() {
    setDashboardMessage("");
    if (!recordsLoaded || recordsError) { setDashboardMessage(ui("ui.app.dashboard.page.1127784eea0a", "Ownership transfers could not be checked. Reload your collection first.")); return; }
    if (!pendingTransfers) {
      setDashboardMessage(ui("ui.app.dashboard.page.f3ccb68e0839", "No ownership transfers need your attention."));
      return;
    }
    const transferSection = document.getElementById("ownership-transfers");
    if (transferSection instanceof HTMLDetailsElement) {
      transferSection.open = true;
      const summary = transferSection.querySelector("summary");
      if (summary instanceof HTMLElement) summary.focus({ preventScroll: true });
    }
    const scrollBehavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    transferSection?.scrollIntoView({ behavior: scrollBehavior, block: "start" });
  }

  const stats = useMemo(
    () => [
      { label: "Profiles", value: recordsLoaded ? String(instruments.length) : "—", filter: "all" as const, helper: "Active instruments" },
      { label: "Public", value: recordsLoaded ? String(publicRecords) : "—", filter: "public" as const, helper: "Listed in the Catalog" },
      { label: "Private / Unlisted", value: recordsLoaded ? String(privateRecords + unlistedRecords) : "—", filter: "private" as const, helper: "Limited visibility" }
    ],
    [instruments.length, privateRecords, publicRecords, unlistedRecords, recordsLoaded]
  );

  async function updateSerialVisibility(instrument: DemoInstrument, showSerialPublic: boolean) {
    const revision = accountRevision.current;
    if (sessionEmail.current !== user?.email) return;
    if (!instrument.serial) { setDashboardMessage("This Profile does not have a Serial Number to display."); return; }
    const code = instrument.qrCode;
    if (visibilityRequests.current.has(code)) return;
    const operation = { revision };
    visibilityRequests.current.set(code, operation);
    setVisibilityPendingCodes(Array.from(visibilityRequests.current.keys()));
    try {
      const token = await getSupabaseAccessToken();
      if (revision !== accountRevision.current) return;
      if (!token) throw new Error("Sign in again before changing visibility.");
      const response = await fetch("/api/instruments", {
        method: "PATCH", headers: { "Content-Type": "application/json", authorization: "Bearer " + token },
        body: JSON.stringify({ qrCode: code, verificationOnly: true, showSerialPublic })
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; qrCode?: string; showSerialPublic?: boolean; message?: string } | null;
      if (revision !== accountRevision.current) return;
      if (!response.ok || payload?.ok !== true || payload.qrCode !== code || typeof payload.showSerialPublic !== "boolean") {
        setDashboardMessage(payload?.message || "Could not confirm visibility. Reload the Profile before trying again."); return;
      }
      const confirmedVisibility = payload.showSerialPublic;
      setInstruments((current) => current.map((item) => item.qrCode === code ? { ...item, showSerialPublic: confirmedVisibility } : item));
      setActionRecord((current) => current?.qrCode === code ? { ...current, showSerialPublic: confirmedVisibility } : current);
      setDashboardMessage(confirmedVisibility ? "Serial Number is now shown on the public Profile." : "Serial Number is now hidden from the public Profile.");
    } catch (error) {
      if (revision === accountRevision.current) setDashboardMessage(error instanceof Error && error.message === "Sign in again before changing visibility." ? error.message : "Could not confirm visibility. Reload the Profile before trying again.");
    } finally {
      if (visibilityRequests.current.get(code) === operation) visibilityRequests.current.delete(code);
      if (revision === accountRevision.current) setVisibilityPendingCodes(Array.from(visibilityRequests.current.keys()));
    }
  }

  async function removeFromCollection(instrument: DemoInstrument) {
    const revision = accountRevision.current;
    if (sessionEmail.current !== user?.email || removalRequests.current.has(instrument.qrCode)) return;
    const allowed = getInstrumentVerificationStatus(instrument) !== "verified" && instrument.authenticityStatus !== "confirmed";
    if (!allowed) { setDashboardMessage("Verified and authenticity-confirmed Profiles are preserved for provenance. Transfer ownership or contact QRguitar support for permanent removal."); return; }
    if (!window.confirm("Permanently delete this QRguitar Profile? This cannot be undone. The QRguitar ID stays reserved, but the Profile will be removed from your active account and hidden from public view.")) return;
    const operation = { revision }; const code = instrument.qrCode;
    removalRequests.current.set(code, operation);
    try {
      const token = await getSupabaseAccessToken();
      if (revision !== accountRevision.current) return;
      if (!token) throw new Error("Sign in required.");
      const response = await fetch("/api/instruments", { method: "PATCH",
        headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ qrCode: code, action: "remove_from_collection", reason: "Owner permanently deleted Profile from dashboard." })
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; qrCode?: string; message?: string } | null;
      if (revision !== accountRevision.current) return;
      if (!response.ok || payload?.ok !== true || payload.qrCode !== code) {
        setDashboardMessage(payload?.message || "Could not confirm removal. Reload your collection before trying again."); return;
      }
      setDashboardMessage(payload.message || "Profile permanently deleted from your dashboard.");
      setActionRecord((current) => current?.qrCode === code ? null : current);
      refreshInstruments();
    } catch {
      if (revision === accountRevision.current) setDashboardMessage("Could not confirm removal. Reload your collection before trying again.");
    } finally {
      if (removalRequests.current.get(code) === operation) removalRequests.current.delete(code);
    }
  }

  if (!authChecked) return <><Nav /><main className={authStyles.page}><div className={authStyles.layout}><section className={authStyles.formPanel}><div className="eyebrow">{ui("ui.app.dashboard.page.9b28be3dc6ed", "Your collection")}</div><h1>{ui("ui.app.dashboard.page.8dcf9115336c", "Opening your dashboard…")}</h1><p role="status">{ui("ui.app.dashboard.page.daf79b219dc5", "Checking your account.")}</p></section></div></main><Footer /></>;

  if (!user) {
    return (
      <>
        <Nav />
        <main className={authStyles.page}>
          <div className={authStyles.layout}>
            <section className={authStyles.formPanel}>
              <div className="dashboard-signin-icon"><ShieldCheck size={24} /></div>
              <div className="eyebrow">{ui("ui.app.dashboard.page.67b696468610", "Dashboard")}</div>
              <h2>{ui("ui.app.dashboard.page.16b87f28c419", "Sign in to manage your QRguitar Profiles.")}</h2>
              <p>{dashboardCopy.subtitle}</p>
              <div className="dashboard-signin-points">
                <span>{ui("ui.app.dashboard.page.81321b8462a6", "Private inventory")}</span>
                <span>{ui("ui.app.dashboard.page.f0f8d70e904e", "QR downloads")}</span>
                <span>{ui("ui.app.dashboard.page.eba6da9f51a2", "Photos and documents")}</span>
              </div>
              <div className="form-actions">
                <Link className="button" href={`/login?next=${encodeURIComponent("/dashboard")}`}>{ui("ui.app.dashboard.page.bfd402b2f6f3", "Sign in")}</Link>
                <Link className="button secondary" href={`/login?mode=register&next=${encodeURIComponent("/dashboard")}`}>{ui("ui.app.dashboard.page.798ca2ce18bf", "Create account")}</Link>
                <Link className="button secondary" href="/catalog">{ui("ui.app.dashboard.page.4d05dc6da837", "Browse catalog")}</Link>
              </div>
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
      <OwnerWorkspace current="collection">
        <div className={styles.dashboard}>
          <div className={styles.header}>
            <div>
              <div className="eyebrow">{workspace.label}</div>
              <h1>{getContentValue(content, "dashboard.hero.headline")}</h1>
              <p>{collectionAccountType ? workspace.description : getContentValue(content, "dashboard.hero.body")}</p>
            </div>
            <div className={styles.headerActions}>
              {collectionAccountType === "luthier" ? <Link className="button" href="/dashboard/service"><Wrench size={16} />{" "}{ui("ui.app.dashboard.page.61669a91a83b", "Open service workbench")}</Link> : <Link className="button" href="/create">{getContentValue(content, "dashboard.actions.create")}</Link>}
              {collectionAccountType === "shop" || collectionAccountType === "builder" ? <Link className="button secondary" href="/dashboard/import"><FileSpreadsheet size={16} /> {getContentValue(content, "dashboard.actions.bulk")}</Link> : <Link className="button secondary" href={collectionAccountType === "luthier" ? "/create" : "/account?section=collection"}>{collectionAccountType === "luthier" ? ui("ui.app.dashboard.page.3880eee7e45c", "Add your own instrument") : ui("ui.app.dashboard.page.e4ecedd588e1", "Set up public collection")}</Link>}
            </div>
          </div>

          {dashboardMessage ? <div className="admin-message" role="status">{dashboardMessage}</div> : null}
          {recordsError ? <div className="profile-refresh-notice" role="alert"><p>{recordsError} {recordsLoaded ? ui("ui.app.dashboard.page.6fe48008e091", "Previously loaded Profiles are shown below.") : ui("ui.app.dashboard.page.65dc6018f43f", "Your collection is not yet loaded.")}</p><button type="button" className="button secondary" onClick={refreshInstruments}>{ui("ui.app.dashboard.page.d8b8392e2c54", "Try again")}</button></div> : null}

          {recordsLoaded && ownerReviewRequests > 0 ? (
            <section className={styles.taskPanel} aria-labelledby="dashboard-tasks-title">
              <div className={styles.taskHeading}>
                <span className={styles.taskIndicator} aria-hidden="true" />
                <h2 id="dashboard-tasks-title">{ui("ui.app.dashboard.page.11de928b330a", "Needs your attention")}</h2>
              </div>
              <div className={styles.taskActions}>
                <button type="button" title={ui("ui.app.dashboard.page.aefc059cfcc0", "Service review")} onClick={focusServiceRequests}>
                  <Wrench size={17} aria-hidden="true" />
                  <span><b>{ui("ui.app.dashboard.page.f97efc02c5d2", "Service requests")}</b><small>{ownerReviewRequests} {ui("ui.app.dashboard.page.0f503c13fb6a", "awaiting review")}</small></span>
                </button>
              </div>
            </section>
          ) : null}

          <div className={styles.collectionControls}>
          <div className={styles.filters} aria-label={ui("ui.app.dashboard.page.c4e6f5e2cc0b", "Collection overview")}>
            {stats.map((stat) => (
              <button
                className={activeFilter === stat.filter ? styles.filterActive : undefined}
                type="button"
                key={stat.label}
                title={stat.helper}
                aria-pressed={activeFilter === stat.filter}
                onClick={() => setActiveFilter(stat.filter)}
              >
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>

              </button>
            ))}
          </div>
          <label className={styles.search}>
            <Search size={17} aria-hidden="true" />
            <input type="search" aria-label={ui("ui.app.dashboard.page.61d5a3e9beca", "Search your collection")} placeholder={ui("ui.app.dashboard.page.61d5a3e9beca", "Search your collection")} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />
          </label>
          </div>
          <section className={styles.instrumentTable} id="saved-profiles">
            <div className={styles.tableHeader}>
              <div>
                <h3>{getContentValue(content, "dashboard.collection.title")}</h3>
              </div>

            </div>
            <div className={styles.instrumentList}>
              {loadingRecords ? (
                <div className="card auth-card">
                  <h3>{ui("ui.app.dashboard.page.139a32beaa54", "Loading your Profiles...")}</h3>
                  <p>{ui("ui.app.dashboard.page.b4694d08f7e0", "Pulling your saved Profiles now.")}</p>
                </div>
              ) : !recordsLoaded && recordsError ? (
                <div className="card auth-card"><h3>{ui("ui.app.dashboard.page.1561734f82a6", "Collection unavailable")}</h3><p>{ui("ui.app.dashboard.page.5d4de079afd4", "Use Try again above to reload your Profiles.")}</p></div>
              ) : displayedInstruments.length ? (
                displayedInstruments.map((instrument) => {
                  const totalDocs = instrument.documentFiles?.length || 0;
                  const publicDocs = instrument.documentFiles?.filter((file) => file.visibility === "public").length || 0;
                  const hiddenDocs = Math.max(0, totalDocs - publicDocs);
                  const imageSources = getProfilePhotoUrls(instrument);
                  const serviceEntries = getServiceHistoryEntries(instrument);
                  const condition = getInstrumentCondition(instrument);
                  const title = dashboardRecordTitle(instrument);
                  const meta = dashboardRecordMeta(instrument, condition);
                  const profileNumber = profileNumbers.get(instrument.qrCode) || 1;

                  return (
                    <article className={styles.instrumentRow} key={instrument.qrCode} aria-label={ui("ui.app.dashboard.page.c9a11cf01443", "Collection profile {{value1}}: {{value2}}", { value1: profileNumber, value2: title })}>
                      <Link className={styles.instrumentBodyLink} href={ownerProfileHref(instrument)} aria-label={ui("ui.app.dashboard.page.ca7577d56ebc", "{{value1}}: {{value2}}", { value1: getContentValue(content, "dashboard.card.open"), value2: title })}>
                        <DashboardInstrumentThumb sources={imageSources} title={title} />
                        <div className={styles.instrumentDetails}>
                          <div className={styles.instrumentInfo}>
                            <strong>{title}</strong>
                            <span title={meta}>{meta}</span>
                            <ProfileStatusBadges record={instrument} includeCondition={false} />
                          </div>
                          <div className={styles.instrumentMeta}>
                            {imageSources.length ? <span>{imageSources.length} {imageSources.length === 1 ? ui("ui.app.dashboard.page.55c64d0fcd6f", "photo") : ui("ui.app.dashboard.page.84a6dae49cf0", "photos")}</span> : null}
                            {serviceEntries.length ? <span>{serviceEntries.length}{" "}{ui("ui.app.dashboard.page.9df6b026a8c6", "service")}{" "}{serviceEntries.length === 1 ? ui("ui.app.dashboard.page.923fe53966c6", "entry") : ui("ui.app.dashboard.page.87d05cd08817", "entries")}</span> : null}
                            {totalDocs ? <span>{publicDocs}{" "}{ui("ui.app.dashboard.page.efa1f375d761", "public")}{" "}{publicDocs === 1 ? ui("ui.app.dashboard.page.43cc23fa52b8", "document") : ui("ui.app.dashboard.page.9b16b44d0e0a", "documents")}{hiddenDocs ? ui("ui.app.dashboard.page.1bef30db15b5", ", {{value1}} private", { value1: hiddenDocs }) : ""}</span> : null}
                            <span>{instrument.visibility === "private" ? ui("ui.app.dashboard.page.c63eb6720c6e", "Private") : instrument.visibility === "unlisted" ? ui("ui.app.dashboard.page.bc96567e77ca", "Unlisted") : ui("ui.app.dashboard.page.591935b15b1c", "Public")}</span>
                          </div>
                          <div className={styles.recordIdentity}>
                            <div className={styles.compactQr}><CompactQr code={instrument.qrCode} label={title} /></div>
                            <div className={styles.dashboardIdentity} aria-label={ui("ui.app.dashboard.page.9b7e3e571ecb", "Profile identity")}>
                              <span><b>{ui("ui.app.dashboard.page.a6c8f92c19f4", "QRguitar ID")}</b> {instrument.qrCode}</span>
                              <span><b>{ui("ui.app.dashboard.page.14b1b3c5b151", "Serial Number")}</b> {instrument.serial || ui("ui.app.dashboard.page.8ca6af960b9f", "No serial number")}</span>
                            </div>
                          </div>
                        </div>
                      </Link>
                      <aside className={styles.qrActionColumn} aria-label={ui("ui.app.dashboard.page.34e14d665e15", "Actions for {{value1}}", { value1: title })}>
                        <div className={styles.primaryActions}>
                          <Link className={`button ${styles.editAction}`} href={`/edit/${instrument.qrCode}`}>{getContentValue(content, "dashboard.card.edit")}</Link>
                          <Link className={`button secondary ${styles.printAction}`} href={`/handout/${instrument.qrCode}`}><Printer size={15} aria-hidden="true" /> {ui("ui.app.dashboard.page.d6d8303655f5", "Print Suite")}</Link>
                        </div>
                        <button
                          className={styles.moreButton}
                          type="button"
                          aria-haspopup="dialog"
                          aria-label={ui("ui.app.dashboard.page.53e5110624dd", "{{value1}} for {{value2}}", { value1: getContentValue(content, "dashboard.card.more"), value2: title })}
                          title={getContentValue(content, "dashboard.card.more")}
                          onClick={(event) => {
                            setActionTrigger(event.currentTarget);
                            setActionRecord(instrument);
                          }}
                        ><Ellipsis size={20} aria-hidden="true" /></button>
                      </aside>
                    </article>
                  );
                })
              ) : (
                <div className="card auth-card">
                  <h3>{instruments.length ? ui("ui.app.dashboard.page.197f9e60605d", "No matching Profiles.") : dashboardCopy.emptyCollectionTitle}</h3>
                  <p>{instruments.length ? ui("ui.app.dashboard.page.9f7551ac4715", "Try a different search or visibility filter.") : dashboardCopy.emptyCollectionBody}</p>
                  {instruments.length ? (
                    <button className="button" type="button" onClick={() => { setActiveFilter("all"); setSearchQuery(""); }}>{ui("ui.app.dashboard.page.8157452810db", "Show All Profiles")}</button>
                  ) : (
                    <Link className="button" href="/create">{dashboardCopy.firstRecordCtaLabel}</Link>
                  )}
                </div>
              )}
            </div>
          </section>
          <details className={styles.toolsArea} id="workspace-tools">
          <summary>{ui("ui.app.dashboard.page.98d395c5face", "Workspace tools")}</summary>
          <div className={styles.toolsBody} role="region" aria-label={ui("ui.app.dashboard.page.4dc38afcfa8e", "Ownership and workspace tools")}>
          <nav className={styles.toolLinks} aria-label={ui("ui.app.dashboard.page.832fd327544b", "Owner tools")}>
            <Link href="/ownership-claim">{ui("ui.app.dashboard.page.1d5aee2be8a0", "Ownership claims")}</Link>
            <button type="button" onClick={focusOwnershipTransfers}><Repeat2 size={15} aria-hidden="true" /> {ui("ui.app.dashboard.page.48920b5ab551", "Ownership transfers")} <span>{recordsLoaded ? pendingTransfers : "—"} {ui("ui.app.dashboard.page.ab405a433d94", "waiting on recipient")}</span></button>
            <Link href="/account?section=collection" title={ui("ui.app.dashboard.page.073f22d50013", "Publish your public Profiles together and control member inquiries")}><UsersRound size={15} />{" "}{ui("ui.app.dashboard.page.2c8274b24de5", "Collection & inquiries")}{" "}<span>{collectionHandle ? ui("ui.app.dashboard.page.b64ac05f17e6", "Live") : ui("ui.app.dashboard.page.4da10f1fbb17", "Set up")}</span></Link>
          </nav>
          <div className={styles.trustSummary} aria-label={ui("ui.app.dashboard.page.9aab2ecb991d", "Trust summary")}>
            <span><b>{recordsLoaded ? verifiedRecords : "—"}</b>{" "}{ui("ui.app.dashboard.page.4f7838402f37", "Verified")}</span>
            <span><b>{recordsLoaded ? authenticityConfirmedRecords : "—"}</b>{" "}{ui("ui.app.dashboard.page.eb95c24a9590", "Authenticity Confirmed")}</span>
            {activeFilter !== "all" ? <button type="button" onClick={() => setActiveFilter("all")}>{ui("ui.app.dashboard.page.ba59e2d4a5e3", "Clear filter")}</button> : null}
          </div>

          {serviceRequests.length ? (
            <section className="card service-request-inbox" id="service-requests" aria-labelledby="service-requests-title" tabIndex={-1}>
              <div className="service-request-inbox__header">
                <div>
                  <div className="eyebrow"><Wrench aria-hidden="true" />{" "}{ui("ui.app.dashboard.page.d677190e0a99", "Service")}</div>
                  <h3 id="service-requests-title">{ui("ui.app.dashboard.page.f97efc02c5d2", "Service requests")}</h3>
                  <p>{ui("ui.app.dashboard.page.b2df16574d8f", "Review provider-submitted work before it is added to the Profile.")}</p>
                </div>
                <span>{ownerReviewRequests}{" "}{ui("ui.app.dashboard.page.0f503c13fb6a", "awaiting review")}</span>
              </div>
              <div className="service-request-list">
                {serviceRequests.slice(0, 8).map((request) => {
                  const providerName = request.provider?.publicDisplayName || request.provider?.businessName || "Service provider";
                  return (
                    <article className="service-request-card" key={request.id}>
                      <div>
                        <span className={`service-status service-status--${request.status}`}>{serviceRequestStatusLabel(request.status)}</span>
                        <h4>{request.title || request.serviceType}</h4>
                        <p>{request.profileTitle || request.qrCode} · {providerName}{request.serviceDate ? ui("ui.app.dashboard.page.25b1fe3f0719", " · {{value1}}", { value1: request.serviceDate }) : ""}</p>
                        <small>{request.evidenceCount}{" "}{ui("ui.app.dashboard.page.af263b67ec8c", "private evidence file")}{request.evidenceCount === 1 ? "" : ui("ui.app.dashboard.page.043a718774c5", "s")}</small>
                      </div>
                      <Link className="button secondary" href={`/service-review/${request.id}`}>{ui("ui.app.dashboard.page.f3bfa948a110", "Review service")}</Link>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}

          <details className={styles.transfers} id="ownership-transfers">
            <summary>{ui("ui.app.dashboard.page.48920b5ab551", "Ownership transfers")}{" "}<span>{recordsLoaded ? pendingTransfers : "—"}{" "}{ui("ui.app.dashboard.page.62a2fed3d6e0", "pending")}</span></summary>
            <p>{ui("ui.app.dashboard.page.29f32c3200b7", "To send an instrument to a new owner, open its More menu below and choose Transfer Ownership. The instrument keeps its QRguitar ID, QR link, and history.")}</p>
            {transfers.filter((transfer) => transfer.status === "sent" && instrumentCodes.has(transfer.guitarQrCode.toUpperCase())).map((transfer) => {
              const record = instruments.find((instrument) => instrument.qrCode.toUpperCase() === transfer.guitarQrCode.toUpperCase());
              return record ? <div className="dashboard-transfer-row" key={transfer.id}>
                <span><strong>{dashboardRecordTitle(record)}</strong><small>{transferStatusLabel(transfer)}</small></span>
                <button className="button secondary" type="button" onClick={(event) => { setActionTrigger(event.currentTarget); setActionRecord(record); }}>{ui("ui.app.dashboard.page.80751a738167", "Manage transfer")}</button>
              </div> : null;
            })}
          </details>
          <WorkspaceActions accountType={collectionAccountType} />
          </div>
          </details>

        </div>
      </OwnerWorkspace>
      {quickEditRecord ? <ProfileQuickEdit key={`${renderedAccountRevision}:${quickEditRecord.qrCode}`} record={quickEditRecord} isSessionCurrent={() => accountRevision.current === renderedAccountRevision} onClose={() => { if (accountRevision.current === renderedAccountRevision) setQuickEditRecord(null); }} onSaved={(saved) => { if (accountRevision.current !== renderedAccountRevision) return; setInstruments((current) => current.map((item) => item.qrCode === saved.qrCode ? saved : item)); setQuickEditRecord(null); setDashboardMessage("Quick Edit saved."); }} /> : null}
      {actionRecord ? (
        <ActionDrawer eyebrow="Profile actions" title={dashboardRecordTitle(actionRecord)} returnFocusTo={actionTrigger} onClose={() => setActionRecord(null)}>
          <div className={styles.drawerIdentity}>
            <DashboardInstrumentThumb sources={getProfilePhotoUrls(actionRecord)} title={dashboardRecordTitle(actionRecord)} />
            <div><b>{actionRecord.qrCode}</b><span>{actionRecord.serial ? ui("ui.app.dashboard.page.78b42b116d41", "Serial Number {{value1}}", { value1: actionRecord.serial }) : ui("ui.app.dashboard.page.0006179f0706", "No Serial Number")}</span></div>
          </div>
          <button className={styles.drawerQuickEdit} type="button" onClick={() => { setQuickEditRecord(actionRecord); setActionRecord(null); }}>{ui("ui.app.dashboard.page.d4e63f569f33", "Quick Edit")}</button>
          <div className={styles.drawerSections}>
            <section>
              <b>{ui("ui.app.dashboard.page.9af3e044122c", "QR, print & sharing")}</b>
              <QrDownload code={actionRecord.qrCode} label={dashboardRecordTitle(actionRecord)} qrStyle={actionRecord.qrStyle} showPrintHandout={false} onStyleChange={(qrStyle) => { setInstruments((current) => current.map((item) => item.qrCode === actionRecord.qrCode ? { ...item, qrStyle } : item)); setActionRecord((current) => current ? { ...current, qrStyle } : current); }} />
              <Link href={`/handout/${actionRecord.qrCode}`}><Printer size={15} />{" "}{ui("ui.app.dashboard.page.5ee3796350c7", "Open Print Suite")}</Link>
              <RecordShareButton className={styles.dashboardShare} code={actionRecord.qrCode} title={dashboardRecordTitle(actionRecord)} showLabel />
            </section>
            <section>
              <b>{ui("ui.app.dashboard.page.de8413ab464c", "History & files")}</b>
              <Link href={`/edit/${actionRecord.qrCode}#timeline`}><BookOpenText size={15} />{" "}{ui("ui.app.dashboard.page.b4d8cb7570b7", "Timeline event")}</Link>
              <Link href={`/edit/${actionRecord.qrCode}#service`}><Wrench size={15} />{" "}{ui("ui.app.dashboard.page.ef49d7a68372", "Service entry")}</Link>
              <Link href={`/edit/${actionRecord.qrCode}#media`}><ImagePlus size={15} />{" "}{ui("ui.app.dashboard.page.f8e0207ec66e", "Photos & media")}</Link>
              <Link href={`/edit/${actionRecord.qrCode}#documents`}><FileText size={15} />{" "}{ui("ui.app.dashboard.page.b4e929d8bcfe", "Documents")}</Link>
            </section>
            <section>
              <b>{ui("ui.app.dashboard.page.3538d701131e", "Privacy & safety")}</b>
              {actionRecord.serial ? <p className="fine-print">{ui("ui.app.dashboard.page.e5d3af1efed5", "Hiding the serial field does not change the permanent QR ID or URL, which may contain the serial. Use private visibility to restrict access.")}</p> : null}
              {actionRecord.serial ? <button type="button" disabled={visibilityPendingCodes.includes(actionRecord.qrCode)} aria-busy={visibilityPendingCodes.includes(actionRecord.qrCode)} onClick={() => void updateSerialVisibility(actionRecord, !actionRecord.showSerialPublic)}><EyeOff size={15} /> {actionRecord.showSerialPublic ? ui("ui.app.dashboard.page.c43c36e3acf6", "Hide Serial Number") : ui("ui.app.dashboard.page.7e8e1732f6a0", "Show Serial Number")}</button> : null}
              <Link href={`/edit/${actionRecord.qrCode}#privacy-safety`}><ShieldCheck size={15} />{" "}{ui("ui.app.dashboard.page.91d623e6ce72", "Visibility & safety")}</Link>
            </section>
            <TransferPanel className={styles.transferPanel} bodyClassName={styles.transferPanelBody} instrument={actionRecord} user={user} isSessionCurrent={() => accountRevision.current === renderedAccountRevision} allowBuyerCode={collectionAccountType === "shop" || collectionAccountType === "builder"} latestTransfer={latestTransferForInstrument(transfers, actionRecord.qrCode)} onTransferCreated={(transfer) => { if (sessionEmail.current === user?.email) setTransfers((current) => [transfer, ...current.filter((item) => item.id !== transfer.id)]); }} onTransferChanged={refreshInstruments} />
            <section className={styles.drawerDanger}><b>{ui("ui.app.dashboard.page.fd8b8dae4421", "Danger zone")}</b><button className={styles.dangerAction} type="button" onClick={() => void removeFromCollection(actionRecord)}>{getContentValue(content, "dashboard.card.remove")}</button></section>
          </div>
        </ActionDrawer>
      ) : null}
      <Footer />
    </>
  );
}

function TransferPanel({
  className,
  bodyClassName,
  instrument,
  user,
  isSessionCurrent,
  allowBuyerCode,
  latestTransfer,
  onTransferCreated,
  onTransferChanged
}: {
  className: string;
  bodyClassName: string;
  instrument: DemoInstrument;
  user: DemoUser | null;
  isSessionCurrent: () => boolean;
  allowBuyerCode: boolean;
  latestTransfer?: DemoTransfer;
  onTransferCreated: (transfer: DemoTransfer) => void;
  onTransferChanged: () => void;
}) {
  const ui = useUiText("app.dashboard.page");
  const [toName, setToName] = useState("");
  const [toEmail, setToEmail] = useState("");
  const [message, setMessage] = useState("");
  const [lastCreatedClaimUrl, setLastCreatedClaimUrl] = useState("");
  const [handoffMode, setHandoffMode] = useState<"email" | "buyer_code">("email");
  const [expiresInDays, setExpiresInDays] = useState("7");
  const [buyerCode, setBuyerCode] = useState("");
  const [orderReference, setOrderReference] = useState("");
  const [saving, setSaving] = useState(false);
  const feedbackLifetime = useRef({ active: false, revision: 0 });
  const transferMutation = useRef<symbol | null>(null);

  const claimUrl =
    typeof window !== "undefined" && latestTransfer ? `${window.location.origin}${latestTransfer.claimPath}` : "";
  const visibleClaimUrl = claimUrl || lastCreatedClaimUrl;
  const hasPendingTransfer = latestTransfer?.status === "sent";
  const transferStatus = latestTransfer ? transferStatusLabel(latestTransfer) : null;

  useEffect(() => {
    const lifetime = feedbackLifetime.current;
    lifetime.active = true; lifetime.revision++;
    return () => { lifetime.active = false; lifetime.revision++; };
  }, [instrument.qrCode, user?.email, latestTransfer?.id, latestTransfer?.status, visibleClaimUrl, buyerCode, handoffMode]);

  function beginFeedback() {
    const lifetime = feedbackLifetime.current;
    const revision = ++lifetime.revision;
    return (nextMessage: string) => {
      if (lifetime.active && lifetime.revision === revision && isSessionCurrent()) setMessage(nextMessage);
    };
  }

  async function copyClaimLink() {
    if (!visibleClaimUrl || saving || transferMutation.current || !isSessionCurrent()) {
      return;
    }

    const feedback = beginFeedback();
    feedback("");
    try {
      if (!window.navigator.clipboard) throw new Error("Clipboard unavailable");
      await window.navigator.clipboard.writeText(visibleClaimUrl);
      feedback("Claim link copied.");
    } catch { feedback("Could not copy the claim link. Select and copy the displayed link."); }
  }

  async function copyBuyerCode() {
    if (!buyerCode || saving || transferMutation.current || !isSessionCurrent()) return;
    const feedback = beginFeedback();
    feedback("");
    try {
      if (!window.navigator.clipboard) throw new Error("Clipboard unavailable");
      await window.navigator.clipboard.writeText(buyerCode);
      feedback("Private buyer code copied.");
    } catch { feedback("Could not copy the code. Select and copy the displayed buyer code."); }
  }

  async function createTransfer() {
    if (transferMutation.current) return;
    const mutation = Symbol(); transferMutation.current = mutation;
    const feedback = beginFeedback();
    feedback("");
    setSaving(true);
    try {
      const token = await getSupabaseAccessToken();
      const response = await fetch("/api/transfers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          qrCode: instrument.qrCode,
          toEmail,
          toName,
          mode: handoffMode,
          expiresInDays: Number(expiresInDays),
          orderReference
        })
      });
      const result = (await response.json().catch(() => null)) as
        | { ok?: boolean; message?: string; transfer?: DemoTransfer; buyerCode?: string }
        | null;

      if (!response.ok || !result?.ok || !result.transfer) {
        feedback(result?.message || "Could not create transfer.");
        return;
      }

      const nextClaimUrl = handoffMode === "email"
        ? typeof window !== "undefined" ? `${window.location.origin}${result.transfer.claimPath}` : result.transfer.claimPath
        : "";
      setLastCreatedClaimUrl(nextClaimUrl);
      setBuyerCode(String(result.buyerCode || ""));
      onTransferCreated(result.transfer);
      feedback(result.message || "Transfer prepared. Check its invitation status before sharing.");
    } catch {
      feedback("We could not confirm that action. Reload your collection to check its status before trying again.");
      onTransferChanged();
    } finally {
      if (transferMutation.current === mutation) transferMutation.current = null;
      setSaving(false);
    }
  }

  async function cancelTransfer() {
    if (!latestTransfer || transferMutation.current) {
      return;
    }

    const mutation = Symbol(); transferMutation.current = mutation;
    const feedback = beginFeedback();
    feedback("");
    setSaving(true);
    try {
      const token = await getSupabaseAccessToken();
      const response = await fetch("/api/transfers", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ id: latestTransfer.id, action: "cancel" })
      });
      const result = (await response.json().catch(() => null)) as
        | { ok?: boolean; message?: string; transfer?: DemoTransfer }
        | null;

      if (!response.ok || !result?.ok) {
        feedback(result?.message || "Could not cancel transfer.");
        return;
      }

      setLastCreatedClaimUrl("");
      setBuyerCode("");
      setOrderReference("");
      if (result.transfer) {
        onTransferCreated(result.transfer);
      }
      feedback(result.message || "Transfer cancelled.");
      onTransferChanged();
    } catch {
      feedback("We could not confirm that action. Reload your collection to check its status before trying again.");
      onTransferChanged();
    } finally {
      if (transferMutation.current === mutation) transferMutation.current = null;
      setSaving(false);
    }
  }

  async function resendBuyerInvitation() {
    if (!latestTransfer || transferMutation.current) return;
    const mutation = Symbol(); transferMutation.current = mutation;
    const feedback = beginFeedback();
    setSaving(true);
    feedback("");
    try {
      const token = await getSupabaseAccessToken();
      const response = await fetch("/api/transfers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: latestTransfer.id, action: "resend" })
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; message?: string } | null;
      feedback(result?.message || (response.ok && result?.ok ? "Invitation resent." : "Could not confirm the invitation. Check its status before trying again."));
    } catch {
      feedback("We could not confirm that action. Reload your collection to check its status before trying again.");
      onTransferChanged();
    } finally {
      if (transferMutation.current === mutation) transferMutation.current = null;
      setSaving(false);
    }
  }

  return (
    <details className={className} data-pending={hasPendingTransfer ? "true" : "false"}>
      <summary>
        <span>{ui("ui.app.dashboard.page.f49cda3a003c", "Transfer Ownership")}<small>{ui("ui.app.dashboard.page.169f2da401df", "Start a secure handoff to the next owner.")}</small></span>
        {transferStatus ? <strong>{transferStatus}</strong> : null}
      </summary>
      <div className={bodyClassName}>
        <p className="field-note" role="status">
          {!latestTransfer
            ? ui("ui.app.dashboard.page.noHandoff", "No handoff started. Choose a method below when you are ready.")
            : latestTransfer.status === "accepted"
              ? ui("ui.app.dashboard.page.handoffCompleted", "Handoff completed. The next owner accepted the Profile.")
              : latestTransfer.status === "cancelled"
                ? ui("ui.app.dashboard.page.handoffCancelled", "Handoff cancelled. Start a new transfer if needed.")
                : latestTransfer.handoffPrepared
                  ? ui("ui.app.dashboard.page.buyerActionRequired", "Give the private buyer code to the recipient. You remain the owner until they accept.")
                  : ui("ui.app.dashboard.page.recipientActionRequired", "Recipient action required. The next owner must sign in and accept the Profile. You remain the owner until then.")}
        </p>
        <div className="transfer-copy">
          <span className="mini-eyebrow">{ui("ui.app.dashboard.page.5f74589ff706", "Ownership handoff")}</span>
          <strong>{handoffMode === "buyer_code" ? ui("ui.app.dashboard.page.5989eea16b52", "Prepare a private code for an in-person buyer.") : ui("ui.app.dashboard.page.a55829ebe2f6", "Email a claim link to the next owner.")}</strong>
          <p>{handoffMode === "buyer_code" ? ui("ui.app.dashboard.page.605c3c2813aa", "Use this at checkout or pickup. The code expires, works once, and can be bound to the buyer's email.") : ui("ui.app.dashboard.page.4060ac58871b", "The recipient signs in with the email below, opens the claim link, and accepts the same permanent QRguitar Profile.")}</p>
        </div>
        <div className="transfer-form">
          {allowBuyerCode && !hasPendingTransfer ? (
            <div className="transfer-mode" role="group" aria-label={ui("ui.app.dashboard.page.84650f6c3f73", "Handoff method")}>
              <button type="button" aria-pressed={handoffMode === "email"} onClick={() => { setHandoffMode("email"); setBuyerCode(""); }}>{ui("ui.app.dashboard.page.91c5b0010aa1", "Email invitation")}</button>
              <button type="button" aria-pressed={handoffMode === "buyer_code"} onClick={() => { setHandoffMode("buyer_code"); setBuyerCode(""); }}>{ui("ui.app.dashboard.page.c0bba41e5ae5", "Private buyer code")}</button>
            </div>
          ) : null}
          <label>{ui("ui.app.dashboard.page.db2f662af00b", "New owner name")}<input
              value={toName}
              onChange={(event) => setToName(event.target.value)}
              disabled={hasPendingTransfer}
              placeholder={ui("ui.app.dashboard.page.db2f662af00b", "New owner name")}
            />
          </label>
          <label>
            {handoffMode === "buyer_code" ? ui("ui.app.dashboard.page.f15b921cee8c", "Buyer email (optional, recommended)") : ui("ui.app.dashboard.page.1a188a2a4288", "New owner email")}
            <input
              type="email"
              value={toEmail}
              onChange={(event) => setToEmail(event.target.value)}
              disabled={hasPendingTransfer}
              placeholder={ui("ui.app.dashboard.page.4680d9cb3265", "new-owner@example.com")}
            />
          </label>
          {handoffMode === "buyer_code" && !hasPendingTransfer ? (
            <>
              <label>{ui("ui.app.dashboard.page.7a388472fdd9", "Order or receipt reference (optional)")}<input value={orderReference} onChange={(event) => setOrderReference(event.target.value)} placeholder={ui("ui.app.dashboard.page.db963ae6d517", "Order 1048 or receipt 6812")} />
                <small>{ui("ui.app.dashboard.page.0907f3c17b11", "If entered, the buyer must match it. QRguitar stores only a one-way check.")}</small>
              </label>
              <label>{ui("ui.app.dashboard.page.40a35cf6c6bf", "Code expires")}<select value={expiresInDays} onChange={(event) => setExpiresInDays(event.target.value)}>
                  <option value="1">{ui("ui.app.dashboard.page.f64edb0fb007", "After 24 hours")}</option><option value="3">{ui("ui.app.dashboard.page.21b6268b43ba", "After 3 days")}</option><option value="7">{ui("ui.app.dashboard.page.a166017f5868", "After 7 days")}</option><option value="14">{ui("ui.app.dashboard.page.646cf904ed78", "After 14 days")}</option><option value="30">{ui("ui.app.dashboard.page.16e515568d66", "After 30 days")}</option>
                </select>
              </label>
            </>
          ) : null}
          {hasPendingTransfer ? (
            <div className="transfer-actions">
              {!latestTransfer?.handoffPrepared ? <button className="button secondary" type="button" disabled={saving} onClick={() => void copyClaimLink()}><Copy size={16} />{ui("ui.app.dashboard.page.222e0344a18c", "Copy Claim Link")}</button> : null}
              {latestTransfer?.handoffPrepared && latestTransfer.toEmail ? <button className="button secondary" type="button" onClick={() => void resendBuyerInvitation()} disabled={saving}><Mail size={16} />{ui("ui.app.dashboard.page.1e11da231ca3", "Resend Sign-in Email")}</button> : null}
              {latestTransfer ? (
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => void cancelTransfer()}
                  disabled={saving}
                >{ui("ui.app.dashboard.page.dc5324346ff0", "Cancel Transfer")}</button>
              ) : null}
            </div>
          ) : (
            <button className="button" type="button" onClick={() => void createTransfer()} disabled={saving}>
              {handoffMode === "email" ? <Mail size={16} /> : <Copy size={16} />}
              {saving ? ui("ui.app.dashboard.page.74a6b5348c06", "Preparing...") : handoffMode === "email" ? ui("ui.app.dashboard.page.a94ebe414853", "Send Transfer Email") : ui("ui.app.dashboard.page.fc3fb992308f", "Prepare for Buyer")}
            </button>
          )}
          {buyerCode ? (
            <div className="buyer-code-box" role="status">
              <span>{ui("ui.app.dashboard.page.7cb698b4afcc", "Copy this code now")}</span><strong>{buyerCode}</strong><small>{ui("ui.app.dashboard.page.a2502e17f908", "It is shown once.")}{" "}{orderReference ? ui("ui.app.dashboard.page.417ce1bcc824", "Give the buyer the matching order or receipt reference too. ") : ""}{ui("ui.app.dashboard.page.b9b0a3e8738f", "Cancelling the handoff revokes it.")}</small>
              <button className="button secondary" type="button" disabled={saving} onClick={() => void copyBuyerCode()}><Copy size={16} />{" "}{ui("ui.app.dashboard.page.7e554bec7cf4", "Copy Buyer Code")}</button>
            </div>
          ) : null}
        </div>
        {latestTransfer ? (
          <div className="claim-link-box">
            <span>
              {latestTransfer.status === "accepted"
                ? ui("ui.app.dashboard.page.e393c52d89bf", "Claim received")
                : latestTransfer.status === "cancelled"
                  ? ui("ui.app.dashboard.page.b6321ee9a4a7", "Transfer cancelled")
                  : latestTransfer.handoffPrepared ? ui("ui.app.dashboard.page.17b626d63a07", "Private buyer handoff prepared") : ui("ui.app.dashboard.page.5d2356016d09", "Claim link created")}
            </span>
            <strong>{[latestTransfer.toName, latestTransfer.toEmail].filter(Boolean).join(" - ") || ui("ui.app.dashboard.page.b90f83fb529f", "Recipient not email-bound")}</strong>
            {latestTransfer.handoffPrepared ? <small>{latestTransfer.expiresAt ? ui("ui.app.dashboard.page.c6d4108974a1", "Expires {{value1}}. ", { value1: new Date(latestTransfer.expiresAt).toLocaleString() }) : ""}{ui("ui.app.dashboard.page.53f58d61b305", "The private code is never stored in readable form. Revoke and prepare a new handoff if it was not copied.")}</small> : <code>{visibleClaimUrl}</code>}
            {latestTransfer.status === "sent" && !latestTransfer.handoffPrepared ? (
              <button className="button secondary" type="button" disabled={saving} onClick={() => void copyClaimLink()}>
                <Copy size={16} />{ui("ui.app.dashboard.page.222e0344a18c", "Copy Claim Link")}</button>
            ) : null}
          </div>
        ) : lastCreatedClaimUrl ? (
          <div className="claim-link-box">
            <span>{ui("ui.app.dashboard.page.18ed36f2100f", "Pending transfer")}</span>
            <strong>{toName} - {toEmail}</strong>
            <code>{lastCreatedClaimUrl}</code>
            <button className="button secondary" type="button" onClick={() => void copyClaimLink()}>
              <Copy size={16} />{ui("ui.app.dashboard.page.222e0344a18c", "Copy Claim Link")}</button>
          </div>
        ) : null}
        {message ? <p className="form-message">{message}</p> : null}
      </div>
    </details>
  );
}

function matchesDashboardFilter(instrument: DemoInstrument, filter: DashboardFilter) {
  if (filter === "public") return instrument.visibility === "public";
  if (filter === "private") return instrument.visibility === "private" || instrument.visibility === "unlisted";
  return true;
}

function matchesDashboardSearch(instrument: DemoInstrument, query: string) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const searchable = [instrument.name, instrument.brand, instrument.model, instrument.serial, instrument.qrCode, instrument.instrumentType]
    .map((value) => String(value || "").toLocaleLowerCase()).join(" ");
  return terms.every((term) => searchable.includes(term));
}

function dashboardRecordTitle(instrument: DemoInstrument) {
  const explicitName = String(instrument.name || "").trim();
  const brand = String(instrument.brand || "").trim();
  const model = String(instrument.model || "").trim();

  if (explicitName && !sameText(explicitName, brand) && !sameText(explicitName, model)) {
    return explicitName;
  }

  if (brand && model) {
    return model.toLowerCase().startsWith(`${brand.toLowerCase()} `) ? model : `${brand} ${model}`;
  }

  return brand || model || instrument.serial || instrument.qrCode || "Untitled instrument";
}

async function loadDashboardInstruments(token: string, includeRemoved = false, signal?: AbortSignal): Promise<DemoInstrument[]> {
  if (!token) throw new Error("Your session expired. Sign in again to load your collection.");
  const response = await fetch("/api/instruments?scope=mine" + (includeRemoved ? "&includeRemoved=1" : ""), { headers: { authorization: "Bearer " + token }, cache: "no-store", signal });
  const payload = await response.json().catch(() => null) as { ok?: boolean; instruments?: DemoInstrument[] } | null;
  if (!response.ok || !payload?.ok || !Array.isArray(payload.instruments)) throw new Error("We could not load your Profiles. Please try again.");
  return payload.instruments;
}

async function loadDashboardTransfers(token: string, signal?: AbortSignal): Promise<DemoTransfer[]> {
  if (!token) throw new Error("Your session expired. Sign in again to load your transfers.");
  const response = await fetch("/api/transfers?scope=mine", { headers: { authorization: "Bearer " + token }, cache: "no-store", signal });
  const payload = await response.json().catch(() => null) as { ok?: boolean; transfers?: DemoTransfer[] } | null;
  if (!response.ok || !payload?.ok || !Array.isArray(payload.transfers)) throw new Error("We could not load ownership transfers. Please try again.");
  return payload.transfers;
}

async function loadOwnerServiceRequests(token: string, signal?: AbortSignal): Promise<ServiceRequestSummary[]> {
  if (!token) throw new Error("Your session expired. Sign in again to load service requests.");
  const response = await fetch("/api/service-submissions?scope=owner", { headers: { authorization: "Bearer " + token }, cache: "no-store", signal });
  const payload = await response.json().catch(() => null) as { ok?: boolean; submissions?: ServiceRequestSummary[] } | null;
  if (!response.ok || !payload?.ok || !Array.isArray(payload.submissions)) throw new Error("We could not load service requests. Please try again.");
  return payload.submissions;
}

function serviceRequestStatusLabel(status: ServiceRequestSummary["status"]) {
  if (status === "submitted") return "Review requested";
  if (status === "changes_requested") return "Changes requested";
  if (status === "approved") return "Approved";
  if (status === "declined") return "Declined";
  if (status === "cancelled") return "Cancelled";
  if (status === "expired") return "Expired";
  return "Draft";
}

function latestTransferForInstrument(transfers: DemoTransfer[], qrCode: string) {
  return transfers
    .filter((transfer) => transfer.guitarQrCode.toUpperCase() === qrCode.toUpperCase())
    .sort((first, second) => {
      if (first.status === "sent" && second.status !== "sent") {
        return -1;
      }
      if (first.status !== "sent" && second.status === "sent") {
        return 1;
      }
      return Date.parse(second.createdAt || "") - Date.parse(first.createdAt || "");
    })[0];
}

function dashboardRecordMeta(instrument: DemoInstrument, condition: "new" | "used") {
  return [
    instrument.instrumentType,
    instrument.year,
    condition === "new" ? "New" : "Used"
  ].filter(Boolean).join(" · ");
}

function sameText(first: string, second: string) {
  return first.trim().toLowerCase() === second.trim().toLowerCase();
}

function mapSupabaseUser(user: { email?: string; user_metadata?: Record<string, unknown> }): DemoUser {
  const email = user.email || "";
  const displayName = String(user.user_metadata?.display_name || user.user_metadata?.name || email.split("@")[0] || "Owner");

  return {
    name: displayName,
    email,
    role: "owner",
    plan: "free",
    verificationStatus: "unverified"
  };
}
