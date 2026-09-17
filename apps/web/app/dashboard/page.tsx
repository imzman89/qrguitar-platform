"use client";

import { ownerProfileHref } from "../../lib/owner-profile";

import { BookOpenText, Copy, Ellipsis, EyeOff, FileSpreadsheet, FileText, ImagePlus, Mail, Printer, Repeat2, ShieldCheck, UsersRound, Wrench } from "lucide-react";
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
        <span>{title.slice(0, 2).toUpperCase() || "QR"}</span>
      )}
    </div>
  );
}

export default function DashboardPage() {
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
  const workspace = getWorkspace(collectionAccountType);
  const [actionRecord, setActionRecord] = useState<DemoInstrument | null>(null);
  const [actionTrigger, setActionTrigger] = useState<HTMLElement | null>(null);

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
        accountRevision.current++;
        visibilityRequests.current.clear(); removalRequests.current.clear(); setVisibilityPendingCodes([]);
        setInstruments([]); setTransfers([]); setServiceRequests([]);
        setQuickEditRecord(null); setActionRecord(null);
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
    return () => { cancelled = true; accountRevision.current++; window.clearTimeout(timeout); listener.subscription.unsubscribe(); };
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
  const pendingServiceRequests = serviceRequests.filter(
    (request) => request.status === "submitted" || request.status === "changes_requested"
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
    () => chronologicalInstruments.filter((instrument) => matchesDashboardFilter(instrument, activeFilter)),
    [activeFilter, chronologicalInstruments]
  );

  function refreshInstruments() { setLoadAttempt(value => value + 1); }

  function focusServiceRequests() {
    setDashboardMessage("");
    if (!recordsLoaded || recordsError) { setDashboardMessage("Service requests could not be checked. Reload your collection first."); return; }
    if (!pendingServiceRequests) {
      setDashboardMessage("No service requests need review.");
      return;
    }
    document.getElementById("service-requests")?.scrollIntoView({ behavior: "smooth", block: "start" });
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

  if (!authChecked) return <><Nav /><main className="section auth-page"><div className="shell"><section className="card auth-card"><div className="eyebrow">Your collection</div><h1>Opening your dashboard…</h1><p role="status">Checking your account.</p></section></div></main><Footer /></>;

  if (!user) {
    return (
      <>
        <Nav />
        <main className="section auth-page">
          <div className="shell">
            <section className="card auth-card sign-in-required-card dashboard-signin-card">
              <div className="dashboard-signin-icon"><ShieldCheck size={24} /></div>
              <div className="eyebrow">Dashboard</div>
              <h2>Sign in to manage your QRguitar Profiles.</h2>
              <p>{dashboardCopy.subtitle}</p>
              <div className="dashboard-signin-points">
                <span>Private inventory</span>
                <span>QR downloads</span>
                <span>Photos and documents</span>
              </div>
              <div className="form-actions">
                <Link className="button" href={`/login?next=${encodeURIComponent("/dashboard")}`}>
                  Sign in
                </Link>
                <Link className="button secondary" href={`/login?mode=register&next=${encodeURIComponent("/dashboard")}`}>
                  Create account
                </Link>
                <Link className="button secondary" href="/catalog">
                  Browse catalog
                </Link>
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
      <main className="section dashboard-page">
        <div className="shell">
          <div className="dashboard-hero">
            <div>
              <div className="eyebrow">{workspace.label}</div>
              <h1>{collectionAccountType ? workspace.title : getContentValue(content, "dashboard.hero.headline")}</h1>
              <p>{collectionAccountType ? workspace.description : getContentValue(content, "dashboard.hero.body")}</p>
            </div>
            <div className="dashboard-buttons">
              {collectionAccountType === "luthier" ? <Link className="button" href="/dashboard/service"><Wrench size={16} /> Open service workbench</Link> : <Link className="button" href="/create">{getContentValue(content, "dashboard.actions.create")}</Link>}
              {collectionAccountType === "shop" || collectionAccountType === "builder" ? <Link className="button secondary" href="/dashboard/import"><FileSpreadsheet size={16} /> {getContentValue(content, "dashboard.actions.bulk")}</Link> : <Link className="button secondary" href={collectionAccountType === "luthier" ? "/create" : "/account?section=collection"}>{collectionAccountType === "luthier" ? "Add your own instrument" : "Set up public collection"}</Link>}
            </div>
          </div>
          <nav className="dashboard-workspace-links" aria-label="Owner tools">
            <button type="button" onClick={focusServiceRequests}><Wrench size={15} /> Service review <span>{recordsLoaded ? pendingServiceRequests : "—"}</span></button>
            <Link href="/ownership-claim">Ownership claims</Link>
            <a href="#ownership-transfers">Ownership transfers <span>{recordsLoaded ? pendingTransfers : "—"}</span></a>
            <Link href="/account?section=collection" title="Publish your public Profiles together and control member inquiries"><UsersRound size={15} /> Collection &amp; inquiries <span>{collectionHandle ? "Live" : "Set up"}</span></Link>
          </nav>
          {dashboardMessage ? <div className="admin-message" role="status">{dashboardMessage}</div> : null}
          {recordsError ? <div className="profile-refresh-notice" role="alert"><p>{recordsError} {recordsLoaded ? "Previously loaded Profiles are shown below." : "Your collection is not yet loaded."}</p><button type="button" className="button secondary" onClick={refreshInstruments}>Try again</button></div> : null}
          <WorkspaceActions accountType={collectionAccountType} />

          <div className="stats-grid dashboard-metric-grid" aria-label="Collection overview">
            {stats.map((stat) => (
              <button
                className={`stat-card dashboard-metric ${activeFilter === stat.filter ? "is-active" : ""}`}
                type="button"
                key={stat.label}
                aria-pressed={activeFilter === stat.filter}
                onClick={() => setActiveFilter(stat.filter)}
              >
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
                <small>{stat.helper}</small>
              </button>
            ))}
          </div>
          <div className="dashboard-trust-summary" aria-label="Trust summary">
            <span><b>{recordsLoaded ? verifiedRecords : "—"}</b> Verified</span>
            <span><b>{recordsLoaded ? authenticityConfirmedRecords : "—"}</b> Authenticity Confirmed</span>
            {activeFilter !== "all" ? <button type="button" onClick={() => setActiveFilter("all")}>Clear filter</button> : null}
          </div>

          {serviceRequests.length ? (
            <section className="card service-request-inbox" id="service-requests" aria-labelledby="service-requests-title">
              <div className="service-request-inbox__header">
                <div>
                  <div className="eyebrow"><Wrench aria-hidden="true" /> Service</div>
                  <h3 id="service-requests-title">Service requests</h3>
                  <p>Review provider-submitted work before it is added to the Profile.</p>
                </div>
                <span>{pendingServiceRequests} awaiting review</span>
              </div>
              <div className="service-request-list">
                {serviceRequests.slice(0, 8).map((request) => {
                  const providerName = request.provider?.publicDisplayName || request.provider?.businessName || "Service provider";
                  return (
                    <article className="service-request-card" key={request.id}>
                      <div>
                        <span className={`service-status service-status--${request.status}`}>{serviceRequestStatusLabel(request.status)}</span>
                        <h4>{request.title || request.serviceType}</h4>
                        <p>{request.profileTitle || request.qrCode} · {providerName}{request.serviceDate ? ` · ${request.serviceDate}` : ""}</p>
                        <small>{request.evidenceCount} private evidence file{request.evidenceCount === 1 ? "" : "s"}</small>
                      </div>
                      <Link className="button secondary" href={`/service-review/${request.id}`}>Review service</Link>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}

          <details className="card dashboard-transfer-overview" id="ownership-transfers">
            <summary>Ownership transfers <span>{recordsLoaded ? pendingTransfers : "—"} pending</span></summary>
            <p>To send an instrument to a new owner, open its More menu below and choose Transfer Ownership. The instrument keeps its QRguitar ID, QR link, and history.</p>
            {transfers.filter((transfer) => transfer.status === "sent" && instrumentCodes.has(transfer.guitarQrCode.toUpperCase())).map((transfer) => {
              const record = instruments.find((instrument) => instrument.qrCode.toUpperCase() === transfer.guitarQrCode.toUpperCase());
              return record ? <div className="dashboard-transfer-row" key={transfer.id}>
                <span><strong>{dashboardRecordTitle(record)}</strong><small>{transferStatusLabel(transfer)}</small></span>
                <button className="button secondary" type="button" onClick={(event) => { setActionTrigger(event.currentTarget); setActionRecord(record); }}>Manage transfer</button>
              </div> : null;
            })}
          </details>
          <section className={`card ${styles.instrumentTable}`} id="saved-profiles">
            <div className={styles.tableHeader}>
              <div>
                <div className="eyebrow">Your instruments</div>
                <h3>{getContentValue(content, "dashboard.collection.title")}</h3>
              </div>
              <Link className="button secondary" href="/create">Create Profile</Link>
            </div>
            <div className={styles.instrumentList}>
              {loadingRecords ? (
                <div className="card auth-card">
                  <h3>Loading your Profiles...</h3>
                  <p>Pulling your saved Profiles now.</p>
                </div>
              ) : !recordsLoaded && recordsError ? (
                <div className="card auth-card"><h3>Collection unavailable</h3><p>Use Try again above to reload your Profiles.</p></div>
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
                    <article className={styles.instrumentRow} key={instrument.qrCode}>
                      <span className={styles.profileNumber} aria-label={`Collection profile ${profileNumber}`}>
                        {String(profileNumber).padStart(2, "0")}
                      </span>
                      <Link className={styles.instrumentBodyLink} href={ownerProfileHref(instrument)} aria-label={`Open ${title} profile`}>
                        <DashboardInstrumentThumb sources={imageSources} title={title} />
                        <div className={styles.instrumentDetails}>
                          <div className={styles.instrumentInfo}>
                            <strong>{title}</strong>
                            <span title={meta}>{meta}</span>
                            <div className={styles.dashboardIdentity} aria-label="Profile identity">
                              <span><b>QRguitar ID</b> {instrument.qrCode}</span>
                              <span><b>Serial Number</b> {instrument.serial || "No serial number"}</span>
                            </div>
                            <ProfileStatusBadges record={instrument} includeCategory />
                          </div>
                          <div className={styles.instrumentMeta}>
                            {imageSources.length ? <span>{imageSources.length} {imageSources.length === 1 ? "photo" : "photos"}</span> : null}
                            {serviceEntries.length ? <span>{serviceEntries.length} service {serviceEntries.length === 1 ? "entry" : "entries"}</span> : null}
                            {totalDocs ? <span>{publicDocs} public {publicDocs === 1 ? "document" : "documents"}{hiddenDocs ? `, ${hiddenDocs} private` : ""}</span> : null}
                            <span>{instrument.visibility === "private" ? "Private" : instrument.visibility === "unlisted" ? "Unlisted" : "Public"}</span>
                          </div>
                        </div>
                      </Link>
                      <aside className={styles.qrActionColumn}>
                        <div className={styles.compactQr}><CompactQr code={instrument.qrCode} label={title} /><span>{instrument.qrCode}</span></div>
                        <div className={styles.primaryActions}>
                          <Link className="button" href={ownerProfileHref(instrument)}>{getContentValue(content, "dashboard.card.open")}</Link>
                          <Link className="button secondary" href={`/edit/${instrument.qrCode}`}>{getContentValue(content, "dashboard.card.edit")}</Link>
                          <button className="button secondary" type="button" onClick={() => setQuickEditRecord(instrument)}>Quick Edit</button>
                        </div>
                        <button
                          className={styles.moreButton}
                          type="button"
                          aria-haspopup="dialog"
                          onClick={(event) => {
                            setActionTrigger(event.currentTarget);
                            setActionRecord(instrument);
                          }}
                        ><Ellipsis size={18} /> {getContentValue(content, "dashboard.card.more")}</button>
                      </aside>
                    </article>
                  );
                })
              ) : (
                <div className="card auth-card">
                  <h3>{instruments.length ? "No Profiles match this filter." : dashboardCopy.emptyCollectionTitle}</h3>
                  <p>{instruments.length ? "Choose another collection metric or clear the filter." : dashboardCopy.emptyCollectionBody}</p>
                  {instruments.length ? (
                    <button className="button" type="button" onClick={() => setActiveFilter("all")}>Show All Profiles</button>
                  ) : (
                    <Link className="button" href="/create">{dashboardCopy.firstRecordCtaLabel}</Link>
                  )}
                </div>
              )}
            </div>
          </section>

        </div>
      </main>
      {quickEditRecord ? <ProfileQuickEdit key={`${renderedAccountRevision}:${quickEditRecord.qrCode}`} record={quickEditRecord} isSessionCurrent={() => accountRevision.current === renderedAccountRevision} onClose={() => { if (accountRevision.current === renderedAccountRevision) setQuickEditRecord(null); }} onSaved={(saved) => { if (accountRevision.current !== renderedAccountRevision) return; setInstruments((current) => current.map((item) => item.qrCode === saved.qrCode ? saved : item)); setQuickEditRecord(null); setDashboardMessage("Quick Edit saved."); }} /> : null}
      {actionRecord ? (
        <ActionDrawer eyebrow="Profile actions" title={dashboardRecordTitle(actionRecord)} returnFocusTo={actionTrigger} onClose={() => setActionRecord(null)}>
          <div className={styles.drawerIdentity}>
            <DashboardInstrumentThumb sources={getProfilePhotoUrls(actionRecord)} title={dashboardRecordTitle(actionRecord)} />
            <div><b>{actionRecord.qrCode}</b><span>{actionRecord.serial ? `Serial Number ${actionRecord.serial}` : "No Serial Number"}</span></div>
          </div>
          <div className={styles.drawerSections}>
            <section>
              <b>QR, print &amp; sharing</b>
              <QrDownload code={actionRecord.qrCode} label={dashboardRecordTitle(actionRecord)} qrStyle={actionRecord.qrStyle} showPrintHandout={false} onStyleChange={(qrStyle) => { setInstruments((current) => current.map((item) => item.qrCode === actionRecord.qrCode ? { ...item, qrStyle } : item)); setActionRecord((current) => current ? { ...current, qrStyle } : current); }} />
              <Link href={`/handout/${actionRecord.qrCode}`}><Printer size={15} /> Open Print Suite</Link>
              <RecordShareButton className={styles.dashboardShare} code={actionRecord.qrCode} title={dashboardRecordTitle(actionRecord)} showLabel />
            </section>
            <section>
              <b>History &amp; files</b>
              <Link href={`/edit/${actionRecord.qrCode}#timeline`}><BookOpenText size={15} /> Timeline event</Link>
              <Link href={`/edit/${actionRecord.qrCode}#service`}><Wrench size={15} /> Service entry</Link>
              <Link href={`/edit/${actionRecord.qrCode}#media`}><ImagePlus size={15} /> Photos &amp; media</Link>
              <Link href={`/edit/${actionRecord.qrCode}#documents`}><FileText size={15} /> Documents</Link>
            </section>
            <section>
              <b>Privacy &amp; safety</b>
              {actionRecord.serial ? <p className="fine-print">Hiding the serial field does not change the permanent QR ID or URL, which may contain the serial. Use private visibility to restrict access.</p> : null}
              {actionRecord.serial ? <button type="button" disabled={visibilityPendingCodes.includes(actionRecord.qrCode)} aria-busy={visibilityPendingCodes.includes(actionRecord.qrCode)} onClick={() => void updateSerialVisibility(actionRecord, !actionRecord.showSerialPublic)}><EyeOff size={15} /> {actionRecord.showSerialPublic ? "Hide Serial Number" : "Show Serial Number"}</button> : null}
              <Link href={`/edit/${actionRecord.qrCode}#privacy-safety`}><ShieldCheck size={15} /> Visibility &amp; safety</Link>
            </section>
            <TransferPanel className={styles.transferPanel} bodyClassName={styles.transferPanelBody} instrument={actionRecord} user={user} allowBuyerCode={collectionAccountType === "shop" || collectionAccountType === "builder"} latestTransfer={latestTransferForInstrument(transfers, actionRecord.qrCode)} onTransferCreated={(transfer) => { if (sessionEmail.current === user?.email) setTransfers((current) => [transfer, ...current.filter((item) => item.id !== transfer.id)]); }} onTransferChanged={refreshInstruments} />
            <section className={styles.drawerDanger}><b>Danger zone</b><button className={styles.dangerAction} type="button" onClick={() => void removeFromCollection(actionRecord)}>{getContentValue(content, "dashboard.card.remove")}</button></section>
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
  allowBuyerCode,
  latestTransfer,
  onTransferCreated,
  onTransferChanged
}: {
  className: string;
  bodyClassName: string;
  instrument: DemoInstrument;
  user: DemoUser | null;
  allowBuyerCode: boolean;
  latestTransfer?: DemoTransfer;
  onTransferCreated: (transfer: DemoTransfer) => void;
  onTransferChanged: () => void;
}) {
  const [toName, setToName] = useState("");
  const [toEmail, setToEmail] = useState("");
  const [message, setMessage] = useState("");
  const [lastCreatedClaimUrl, setLastCreatedClaimUrl] = useState("");
  const [handoffMode, setHandoffMode] = useState<"email" | "buyer_code">("email");
  const [expiresInDays, setExpiresInDays] = useState("7");
  const [buyerCode, setBuyerCode] = useState("");
  const [orderReference, setOrderReference] = useState("");
  const [saving, setSaving] = useState(false);

  const claimUrl =
    typeof window !== "undefined" && latestTransfer ? `${window.location.origin}${latestTransfer.claimPath}` : "";
  const visibleClaimUrl = claimUrl || lastCreatedClaimUrl;
  const hasPendingTransfer = latestTransfer?.status === "sent";
  const transferStatus = latestTransfer ? transferStatusLabel(latestTransfer) : null;

  async function copyClaimLink() {
    if (!visibleClaimUrl) {
      return;
    }

    try {
      if (!window.navigator.clipboard) throw new Error("Clipboard unavailable");
      await window.navigator.clipboard.writeText(visibleClaimUrl);
      setMessage("Claim link copied.");
    } catch { setMessage("Could not copy the claim link. Select and copy the displayed link."); }
  }

  async function copyBuyerCode() {
    if (!buyerCode) return;
    try {
      if (!window.navigator.clipboard) throw new Error("Clipboard unavailable");
      await window.navigator.clipboard.writeText(buyerCode);
      setMessage("Private buyer code copied.");
    } catch { setMessage("Could not copy the code. Select and copy the displayed buyer code."); }
  }

  async function createTransfer() {
    setMessage("");
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
        setMessage(result?.message || "Could not create transfer.");
        return;
      }

      const nextClaimUrl = handoffMode === "email"
        ? typeof window !== "undefined" ? `${window.location.origin}${result.transfer.claimPath}` : result.transfer.claimPath
        : "";
      setLastCreatedClaimUrl(nextClaimUrl);
      setBuyerCode(String(result.buyerCode || ""));
      onTransferCreated(result.transfer);
      setMessage(result.message || "Transfer prepared. Check its invitation status before sharing.");
    } catch {
      setMessage("We could not confirm that action. Reload your collection to check its status before trying again.");
      onTransferChanged();
    } finally {
      setSaving(false);
    }
  }

  async function cancelTransfer() {
    if (!latestTransfer) {
      return;
    }

    setMessage("");
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
        setMessage(result?.message || "Could not cancel transfer.");
        return;
      }

      setLastCreatedClaimUrl("");
      setBuyerCode("");
      setOrderReference("");
      if (result.transfer) {
        onTransferCreated(result.transfer);
      }
      setMessage(result.message || "Transfer cancelled.");
      onTransferChanged();
    } catch {
      setMessage("We could not confirm that action. Reload your collection to check its status before trying again.");
      onTransferChanged();
    } finally {
      setSaving(false);
    }
  }

  async function resendBuyerInvitation() {
    if (!latestTransfer) return;
    setSaving(true);
    setMessage("");
    try {
      const token = await getSupabaseAccessToken();
      const response = await fetch("/api/transfers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: latestTransfer.id, action: "resend" })
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; message?: string } | null;
      setMessage(result?.message || (response.ok && result?.ok ? "Invitation resent." : "Could not confirm the invitation. Check its status before trying again."));
    } catch {
      setMessage("We could not confirm that action. Reload your collection to check its status before trying again.");
      onTransferChanged();
    } finally {
      setSaving(false);
    }
  }

  return (
    <details className={className} data-pending={hasPendingTransfer ? "true" : "false"}>
      <summary>
        <span>Transfer Ownership<small>Start a secure handoff to the next owner.</small></span>
        {transferStatus ? <strong>{transferStatus}</strong> : null}
      </summary>
      <div className={bodyClassName}>
        <div className="transfer-copy">
          <span className="mini-eyebrow">Ownership handoff</span>
          <strong>{handoffMode === "buyer_code" ? "Prepare a private code for an in-person buyer." : "Email a claim link to the next owner."}</strong>
          <p>{handoffMode === "buyer_code" ? "Use this at checkout or pickup. The code expires, works once, and can be bound to the buyer's email." : "The recipient signs in with the email below, opens the claim link, and accepts the same permanent QRguitar Profile."}</p>
        </div>
        <div className="transfer-form">
          {allowBuyerCode && !hasPendingTransfer ? (
            <div className="transfer-mode" role="group" aria-label="Handoff method">
              <button type="button" aria-pressed={handoffMode === "email"} onClick={() => { setHandoffMode("email"); setBuyerCode(""); }}>Email invitation</button>
              <button type="button" aria-pressed={handoffMode === "buyer_code"} onClick={() => { setHandoffMode("buyer_code"); setBuyerCode(""); }}>Private buyer code</button>
            </div>
          ) : null}
          <label>
            New owner name
            <input
              value={toName}
              onChange={(event) => setToName(event.target.value)}
              disabled={hasPendingTransfer}
              placeholder="New owner name"
            />
          </label>
          <label>
            {handoffMode === "buyer_code" ? "Buyer email (optional, recommended)" : "New owner email"}
            <input
              type="email"
              value={toEmail}
              onChange={(event) => setToEmail(event.target.value)}
              disabled={hasPendingTransfer}
              placeholder="new-owner@example.com"
            />
          </label>
          {handoffMode === "buyer_code" && !hasPendingTransfer ? (
            <>
              <label>
                Order or receipt reference (optional)
                <input value={orderReference} onChange={(event) => setOrderReference(event.target.value)} placeholder="Order 1048 or receipt 6812" />
                <small>If entered, the buyer must match it. QRguitar stores only a one-way check.</small>
              </label>
              <label>
                Code expires
                <select value={expiresInDays} onChange={(event) => setExpiresInDays(event.target.value)}>
                  <option value="1">After 24 hours</option><option value="3">After 3 days</option><option value="7">After 7 days</option><option value="14">After 14 days</option><option value="30">After 30 days</option>
                </select>
              </label>
            </>
          ) : null}
          {hasPendingTransfer ? (
            <div className="transfer-actions">
              {!latestTransfer?.handoffPrepared ? <button className="button secondary" type="button" onClick={() => void copyClaimLink()}><Copy size={16} />Copy Claim Link</button> : null}
              {latestTransfer?.handoffPrepared && latestTransfer.toEmail ? <button className="button secondary" type="button" onClick={() => void resendBuyerInvitation()} disabled={saving}><Mail size={16} />Resend Sign-in Email</button> : null}
              {latestTransfer ? (
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => void cancelTransfer()}
                  disabled={saving}
                >
                  Cancel Transfer
                </button>
              ) : null}
            </div>
          ) : (
            <button className="button" type="button" onClick={() => void createTransfer()} disabled={saving}>
              {handoffMode === "email" ? <Mail size={16} /> : <Copy size={16} />}
              {saving ? "Preparing..." : handoffMode === "email" ? "Send Transfer Email" : "Prepare for Buyer"}
            </button>
          )}
          {buyerCode ? (
            <div className="buyer-code-box" role="status">
              <span>Copy this code now</span><strong>{buyerCode}</strong><small>It is shown once. {orderReference ? "Give the buyer the matching order or receipt reference too. " : ""}Cancelling the handoff revokes it.</small>
              <button className="button secondary" type="button" onClick={() => void copyBuyerCode()}><Copy size={16} /> Copy Buyer Code</button>
            </div>
          ) : null}
        </div>
        {latestTransfer ? (
          <div className="claim-link-box">
            <span>
              {latestTransfer.status === "accepted"
                ? "Claim received"
                : latestTransfer.status === "cancelled"
                  ? "Transfer cancelled"
                  : latestTransfer.handoffPrepared ? "Private buyer handoff prepared" : "Claim link created"}
            </span>
            <strong>{[latestTransfer.toName, latestTransfer.toEmail].filter(Boolean).join(" - ") || "Recipient not email-bound"}</strong>
            {latestTransfer.handoffPrepared ? <small>{latestTransfer.expiresAt ? `Expires ${new Date(latestTransfer.expiresAt).toLocaleString()}. ` : ""}The private code is never stored in readable form. Revoke and prepare a new handoff if it was not copied.</small> : <code>{visibleClaimUrl}</code>}
            {latestTransfer.status === "sent" && !latestTransfer.handoffPrepared ? (
              <button className="button secondary" type="button" onClick={() => void copyClaimLink()}>
                <Copy size={16} />
                Copy Claim Link
              </button>
            ) : null}
          </div>
        ) : lastCreatedClaimUrl ? (
          <div className="claim-link-box">
            <span>Pending transfer</span>
            <strong>{toName} - {toEmail}</strong>
            <code>{lastCreatedClaimUrl}</code>
            <button className="button secondary" type="button" onClick={() => void copyClaimLink()}>
              <Copy size={16} />
              Copy Claim Link
            </button>
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
    instrument.brand,
    instrument.year,
    condition === "new" ? "New" : "Used"
  ].filter(Boolean).join(" / ");
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
