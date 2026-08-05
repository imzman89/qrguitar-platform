"use client";

import { Copy, Ellipsis, FileSpreadsheet, Mail, Repeat2, ShieldCheck, Wrench } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ActionDrawer } from "../../components/ActionDrawer";
import { CompactQr } from "../../components/CompactQr";
import { Footer } from "../../components/Footer";
import { Nav } from "../../components/Nav";
import { ProfileStatusBadges } from "../../components/ProfileStatusBadges";
import { ProfileQuickEdit } from "../../components/ProfileQuickEdit";
import { QrDownload } from "../../components/QrDownload";
import { RecordShareButton } from "../../components/RecordShareButton";
import styles from "./dashboard-records.module.css";
import { defaultSiteSettings, fetchPublishedSiteSettings } from "../../lib/site-settings";
import {
  getAccountPlan,
  getDisplayName,
  getInstrumentCondition,
  getInstrumentVerificationStatus,
  instrumentToProfileUrl,
  transferStatusLabel,
  type DemoInstrument,
  type DemoTransfer,
  type DemoUser
} from "../../lib/local-demo";
import { createBrowserSupabaseClient, getSupabaseAccessToken } from "../../lib/supabase-browser";
import { getProfilePhotoUrls, getServiceHistoryEntries } from "../../lib/instrument-profile-contract";
import { getContentValue } from "../../lib/content-registry";
import { useSiteContent } from "../../lib/use-site-content";

type DashboardFilter = "all" | "public" | "private" | "transfers" | "service" | "safety";

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

function mergeDashboardRecords(records: DemoInstrument[], user: DemoUser | null) {
  void user;
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

  useEffect(() => {
    setImageIndex(0);
    setFailedAllImages(false);
  }, [imageSources.join("|")]);

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
  const [authChecked, setAuthChecked] = useState(true);
  const [dashboardMessage, setDashboardMessage] = useState("");
  const [dashboardCopy, setDashboardCopy] = useState(defaultSiteSettings.dashboard);
  const [activeFilter, setActiveFilter] = useState<DashboardFilter>("all");
  const [quickEditRecord, setQuickEditRecord] = useState<DemoInstrument | null>(null);
  const [collectionHandle, setCollectionHandle] = useState("");
  const [collectionAccountType, setCollectionAccountType] = useState("");
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
    const supabase = createBrowserSupabaseClient();
    let cancelled = false;
    let authResolved = false;
    const timeout = window.setTimeout(() => {
      if (!cancelled && !authResolved) {
        setUser(null);
        setAuthChecked(true);
      }
    }, 5000);

    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) {
        authResolved = true;
        window.clearTimeout(timeout);
        setUser(data.session?.user ? mapSupabaseUser(data.session.user) : null);
        setAuthChecked(true);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      authResolved = true;
      window.clearTimeout(timeout);
      setUser(session?.user ? mapSupabaseUser(session.user) : null);
      setAuthChecked(true);
    });

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user?.email) {
      setInstruments([]);
      setLoadingRecords(false);
      return;
    }

    let cancelled = false;
    setLoadingRecords(true);

    getSupabaseAccessToken().then(async (token) => {
      const [records, transferRecords, requests] = await Promise.all([
        loadDashboardInstruments(token, false),
        loadDashboardTransfers(token),
        loadOwnerServiceRequests(token)
      ]);

      if (!cancelled) {
        setInstruments(mergeDashboardRecords(records, user));
        setTransfers(transferRecords);
        setServiceRequests(requests);
      }
    })
      .finally(() => {
        if (!cancelled) {
          setLoadingRecords(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user?.email]);

  useEffect(() => {
    if (!user?.email) return;
    getSupabaseAccessToken().then(async (token) => {
      const response = await fetch("/api/account", { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
      const payload = await response.json().catch(() => null) as { account?: { publicCollection?: { enabled?: boolean; handle?: string; accountType?: string } } } | null;
      const collection = payload?.account?.publicCollection;
      setCollectionHandle(collection?.enabled ? String(collection.handle || "") : "");
      setCollectionAccountType(String(collection?.accountType || ""));
    }).catch(() => { setCollectionHandle(""); setCollectionAccountType(""); });
  }, [user?.email]);

  const instrumentCodes = useMemo(() => new Set(instruments.map((instrument) => instrument.qrCode.toUpperCase())), [instruments]);
  const pendingTransfers = transfers.filter(
    (transfer) => transfer.status === "sent" && instrumentCodes.has(transfer.guitarQrCode.toUpperCase())
  ).length;
  const pendingServiceRequests = serviceRequests.filter(
    (request) => request.status === "submitted" || request.status === "changes_requested"
  ).length;
  const accountPlan = getAccountPlan(user);
  const displayName = useMemo(() => getDisplayName(user), [user?.name, user?.email, user?.role]);
  const accountSummary = accountPlan === "free" ? "Beta access." : `${accountPlan.charAt(0).toUpperCase()}${accountPlan.slice(1)} account.`;
  const publicRecords = instruments.filter((instrument) => instrument.visibility === "public").length;
  const privateRecords = instruments.filter((instrument) => instrument.visibility === "private").length;
  const unlistedRecords = instruments.filter((instrument) => instrument.visibility === "unlisted").length;
  const safetyAlerts = instruments.filter((instrument) => instrument.safetyStatus === "lost" || instrument.safetyStatus === "stolen").length;

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
    () => chronologicalInstruments.filter((instrument) => matchesDashboardFilter(instrument, activeFilter, transfers)),
    [activeFilter, chronologicalInstruments, transfers]
  );

  function refreshInstruments() {
    if (!user?.email) {
      setInstruments([]);
      return;
    }

    getSupabaseAccessToken()
      .then(async (token) => {
        const [records, transferRecords, requests] = await Promise.all([
          loadDashboardInstruments(token, false),
          loadDashboardTransfers(token),
          loadOwnerServiceRequests(token)
        ]);
        return { records, transferRecords, requests };
      })
      .then(({ records, transferRecords, requests }) => {
        setInstruments(mergeDashboardRecords(records, user));
        setTransfers(transferRecords);
        setServiceRequests(requests);
      });
  }

  const stats = useMemo(
    () => [
      { label: "Total Profiles", value: String(instruments.length), filter: "all" as const, helper: "Every active Profile" },
      { label: "Public in Catalog", value: String(publicRecords), filter: "public" as const, helper: "Discoverable Profiles" },
      { label: "Private / Unlisted", value: String(privateRecords + unlistedRecords), filter: "private" as const, helper: "Limited visibility" },
      { label: "Pending Transfers / Claims", value: String(pendingTransfers), filter: "transfers" as const, helper: "Awaiting completion" },
      { label: "Service Requests", value: String(pendingServiceRequests), filter: "service" as const, helper: "Awaiting your review" },
      { label: "Lost / Stolen", value: String(safetyAlerts), filter: "safety" as const, helper: "Active safety alerts" }
    ],
    [instruments.length, pendingServiceRequests, pendingTransfers, privateRecords, publicRecords, safetyAlerts, unlistedRecords]
  );

  async function updateSerialVisibility(instrument: DemoInstrument, showSerialPublic: boolean) {
    if (!instrument.serial) {
      setDashboardMessage("This Profile does not have a Serial Number to display.");
      return;
    }

    const token = await getSupabaseAccessToken();
    const response = await fetch("/api/instruments", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        authorization: "Bearer " + token
      },
      body: JSON.stringify({
        qrCode: instrument.qrCode,
        verificationOnly: true,
        verificationStatus: getInstrumentVerificationStatus(instrument),
        authenticityStatus: instrument.authenticityStatus === "confirmed" ? "confirmed" : "unconfirmed",
        showSerialPublic
      })
    });
    const payload = await response.json().catch(() => null) as { ok?: boolean; message?: string } | null;
    if (!response.ok || !payload?.ok) {
      setDashboardMessage(payload?.message || "Could not update Serial Number visibility.");
      return;
    }

    setInstruments((current) => current.map((item) => item.qrCode === instrument.qrCode ? { ...item, showSerialPublic } : item));
    setActionRecord((current) => current?.qrCode === instrument.qrCode ? { ...current, showSerialPublic } : current);
    setDashboardMessage(showSerialPublic ? "Serial Number is now shown on the public Profile." : "Serial Number is now hidden from the public Profile.");
  }

  async function removeFromCollection(instrument: DemoInstrument) {
    const allowed = getInstrumentVerificationStatus(instrument) !== "verified" && instrument.authenticityStatus !== "confirmed";
    if (!allowed) {
      setDashboardMessage("Verified and authenticity-confirmed Profiles are preserved for provenance. Transfer ownership or contact QRguitar support for permanent removal.");
      return;
    }

    const confirmed = window.confirm("Permanently delete this QRguitar Profile? This cannot be undone. The QRguitar ID stays reserved, but the Profile will be removed from your active account and hidden from public view.");
    if (!confirmed) {
      return;
    }

    const token = await getSupabaseAccessToken();
    const response = await fetch("/api/instruments", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        qrCode: instrument.qrCode,
        action: "remove_from_collection",
        reason: "Owner permanently deleted record from dashboard."
      })
    });
    const payload = await response.json().catch(() => ({}));
    setDashboardMessage(payload.message || (response.ok ? "Profile permanently deleted from your dashboard." : "Could not delete this Profile."));
    if (response.ok) {
      refreshInstruments();
    }
  }

  if (!authChecked) {
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
                <Link className="button secondary" href={`/login?next=${encodeURIComponent("/dashboard")}`}>
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
                <Link className="button secondary" href={`/login?next=${encodeURIComponent("/dashboard")}`}>
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
              <div className="eyebrow">{getContentValue(content, "dashboard.hero.headline")}</div>
              <h2>{user ? `Welcome back, ${displayName}.` : "Your QRguitar workspace."}</h2>
              <p>
                {user
                  ? `${getContentValue(content, "dashboard.hero.body")} ${accountSummary}`
                  : "Create a profile, manage QR downloads, and keep ownership history attached to the same QRguitar Profile."}
              </p>
            </div>
            <div className="dashboard-buttons">
              <Link className="button" href="/create">{getContentValue(content, "dashboard.actions.create")}</Link>
              <Link className="button secondary" href="/dashboard/import"><FileSpreadsheet size={16} /> {getContentValue(content, "dashboard.actions.bulk")}</Link>
              <button className="button secondary" type="button" onClick={() => setActiveFilter("service")}>Service Requests</button>
              <Link className="button secondary" href="/ownership-claim">{getContentValue(content, "dashboard.actions.claims")}</Link>
              {collectionHandle ? <Link className="button secondary" href={`/collections/${collectionHandle}`}>View Public Collection</Link> : null}
            </div>
          </div>
          {dashboardMessage ? <div className="admin-message">{dashboardMessage}</div> : null}

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
            <span><b>{verifiedRecords}</b> Verified</span>
            <span><b>{authenticityConfirmedRecords}</b> Authenticity Confirmed</span>
            {activeFilter !== "all" ? <button type="button" onClick={() => setActiveFilter("all")}>Clear filter</button> : null}
          </div>

          {serviceRequests.length ? (
            <section className="card service-request-inbox" aria-labelledby="service-requests-title">
              <div className="service-request-inbox__header">
                <div>
                  <div className="eyebrow"><Wrench aria-hidden="true" /> Service records</div>
                  <h3 id="service-requests-title">Service requests</h3>
                  <p>Review provider-submitted work before it becomes part of the instrument's permanent history.</p>
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

          <section className={`card ${styles.instrumentTable}`} id="saved-profiles">
            <div className={styles.tableHeader}>
              <div>
                <div className="eyebrow">Your instruments</div>
                <h3>{getContentValue(content, "dashboard.collection.title")}</h3>
              </div>
              <Link className="button secondary" href="/create">
                Add Guitar
              </Link>
            </div>
            <div className={styles.instrumentList}>
              {loadingRecords ? (
                <div className="card auth-card">
                  <h3>Loading your Profiles...</h3>
                  <p>Pulling your saved Profiles now.</p>
                </div>
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
                      <Link className={styles.instrumentBodyLink} href={instrumentToProfileUrl(instrument)} aria-label={`Open ${title} profile`}>
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
                          <Link className="button" href={instrumentToProfileUrl(instrument)}>{getContentValue(content, "dashboard.card.open")}</Link>
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
      {quickEditRecord ? <ProfileQuickEdit record={quickEditRecord} onClose={() => setQuickEditRecord(null)} onSaved={(saved) => { setInstruments((current) => current.map((item) => item.qrCode === saved.qrCode ? saved : item)); setQuickEditRecord(null); setDashboardMessage("Quick Edit saved."); }} /> : null}
      {actionRecord ? (
        <ActionDrawer eyebrow="Profile actions" title={dashboardRecordTitle(actionRecord)} returnFocusTo={actionTrigger} onClose={() => setActionRecord(null)}>
          <div className={styles.drawerIdentity}>
            <DashboardInstrumentThumb sources={getProfilePhotoUrls(actionRecord)} title={dashboardRecordTitle(actionRecord)} />
            <div><b>{actionRecord.qrCode}</b><span>{actionRecord.serial ? `Serial Number ${actionRecord.serial}` : "No Serial Number"}</span></div>
          </div>
          <div className={styles.drawerSections}>
            <section><b>QR tools</b><QrDownload code={actionRecord.qrCode} label={dashboardRecordTitle(actionRecord)} qrStyle={actionRecord.qrStyle} showPrintHandout={false} onStyleChange={(qrStyle) => { setInstruments((current) => current.map((item) => item.qrCode === actionRecord.qrCode ? { ...item, qrStyle } : item)); setActionRecord((current) => current ? { ...current, qrStyle } : current); }} /><Link href={`/handout/${actionRecord.qrCode}`}>Open Print Suite</Link><RecordShareButton className={styles.dashboardShare} code={actionRecord.qrCode} title={dashboardRecordTitle(actionRecord)} showLabel /></section>
            <section><b>History</b><Link href={`/edit/${actionRecord.qrCode}#timeline`}>Add Timeline Event</Link><Link href={`/edit/${actionRecord.qrCode}#service`}>Add Service Entry</Link><Link href={`/edit/${actionRecord.qrCode}#media`}>Add Supplemental Media</Link><Link href={`/edit/${actionRecord.qrCode}#documents`}>Add Document</Link></section>
            <section><b>Privacy & safety</b>{actionRecord.serial ? <button type="button" onClick={() => void updateSerialVisibility(actionRecord, !actionRecord.showSerialPublic)}>{actionRecord.showSerialPublic ? "Hide Serial Number" : "Show Serial Number"}</button> : null}<Link href={`/edit/${actionRecord.qrCode}#privacy-safety`}>Visibility and safety</Link></section>
            <TransferPanel className={styles.transferPanel} bodyClassName={styles.transferPanelBody} instrument={actionRecord} user={user} allowBuyerCode={collectionAccountType === "shop" || collectionAccountType === "builder"} latestTransfer={latestTransferForInstrument(transfers, actionRecord.qrCode)} onTransferCreated={(transfer) => setTransfers((current) => [transfer, ...current.filter((item) => item.id !== transfer.id)])} onTransferChanged={refreshInstruments} />
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

    await window.navigator.clipboard?.writeText(visibleClaimUrl);
    setMessage("Claim link copied.");
  }

  async function copyBuyerCode() {
    if (!buyerCode) return;
    await window.navigator.clipboard?.writeText(buyerCode);
    setMessage("Private buyer code copied.");
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
      setMessage(result.message || "Transfer email sent. You can also copy the claim link.");
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
      setMessage(result?.message || (response.ok ? "Invitation resent." : "Could not resend invitation."));
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

function matchesDashboardFilter(instrument: DemoInstrument, filter: DashboardFilter, transfers: DemoTransfer[]) {
  if (filter === "public") return instrument.visibility === "public";
  if (filter === "private") return instrument.visibility === "private" || instrument.visibility === "unlisted";
  if (filter === "service") return getServiceHistoryEntries(instrument).length > 0;
  if (filter === "safety") return instrument.safetyStatus === "lost" || instrument.safetyStatus === "stolen";

  if (filter === "transfers") {
    return transfers.some((transfer) =>
      transfer.status === "sent" && transfer.guitarQrCode.toUpperCase() === instrument.qrCode.toUpperCase()
    );
  }
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

async function loadDashboardInstruments(token: string, includeRemoved = false) {
  if (!token) {
    return [];
  }

  const response = await fetch(`/api/instruments?scope=mine${includeRemoved ? "&includeRemoved=1" : ""}`, { headers: { authorization: `Bearer ${token}` } });
  const payload = (await response.json().catch(() => null)) as
    | { ok?: boolean; instruments?: DemoInstrument[]; count?: number; message?: string }
    | null;

  if (!response.ok || !payload?.ok) {
    return [];
  }

  return payload.instruments || [];
}

async function loadDashboardTransfers(token: string) {
  if (!token) {
    return [];
  }

  const response = await fetch("/api/transfers?scope=mine", { headers: { authorization: `Bearer ${token}` } });
  const payload = (await response.json().catch(() => null)) as
    | { ok?: boolean; transfers?: DemoTransfer[]; message?: string }
    | null;

  if (!response.ok || !payload?.ok) {
    return [];
  }

  return payload.transfers || [];
}

async function loadOwnerServiceRequests(token: string): Promise<ServiceRequestSummary[]> {
  if (!token) return [];
  const response = await fetch("/api/service-submissions?scope=owner", {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store"
  });
  const payload = (await response.json().catch(() => null)) as { ok?: boolean; submissions?: ServiceRequestSummary[] } | null;
  return response.ok && payload?.ok ? payload.submissions || [] : [];
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


