"use client";

import { Copy, Mail, Repeat2, ShieldCheck, Wrench } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BulkProfileImport } from "../../components/BulkProfileImport";
import { Footer } from "../../components/Footer";
import { Nav } from "../../components/Nav";
import { ProfileStatusBadges } from "../../components/ProfileStatusBadges";
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

type DashboardFilter = "all" | "public" | "private" | "transfers";

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
  const [user, setUser] = useState<DemoUser | null>(null);
  const [instruments, setInstruments] = useState<DemoInstrument[]>([]);
  const [transfers, setTransfers] = useState<DemoTransfer[]>([]);
  const [serviceRequests, setServiceRequests] = useState<ServiceRequestSummary[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(true);
  const [authChecked, setAuthChecked] = useState(true);
  const [dashboardMessage, setDashboardMessage] = useState("");
  const [dashboardCopy, setDashboardCopy] = useState(defaultSiteSettings.dashboard);
  const [activeFilter, setActiveFilter] = useState<DashboardFilter>("all");

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
      { label: "Service Requests", value: String(pendingServiceRequests), filter: "all" as const, helper: "Awaiting your review" }
    ],
    [instruments.length, pendingServiceRequests, pendingTransfers, privateRecords, publicRecords, unlistedRecords]
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
              <div className="eyebrow">{dashboardCopy.pageTitle}</div>
              <h2>{user ? `Welcome back, ${displayName}.` : "Manage profiles, QR codes, transfers, and visibility."}</h2>
              <p>
                {user
                  ? `${dashboardCopy.subtitle} ${accountSummary}`
                  : "Create a profile, manage QR downloads, and keep ownership history attached to the same QRguitar Profile."}
              </p>
            </div>
            <div className="dashboard-buttons">
              <Link className="button" href="/create">
                Create Profile
              </Link>
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

          <section className={`card ${styles.instrumentTable}`}>
            <div className={styles.tableHeader}>
              <div>
                <div className="eyebrow">Your instruments</div>
                <h3>Saved QRguitar Profiles</h3>
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
                  const publicDocs = instrument.documentFiles?.filter((file) => file.visibility !== "hidden").length || 0;
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
                      <Link
                        className={styles.instrumentBodyLink}
                        href={instrumentToProfileUrl(instrument)}
                        aria-label={`Open ${title} profile`}
                      >
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
                      <div className={styles.qrActionColumn}>
                        <div className={styles.qrPanel}>
                          <QrDownload
                            code={instrument.qrCode}
                            label={title}
                            qrStyle={instrument.qrStyle}
                            onStyleChange={(qrStyle) => setInstruments((current) => current.map((item) => item.qrCode === instrument.qrCode ? { ...item, qrStyle } : item))}
                          />
                        </div>
                        <div className={styles.instrumentActions}>
                          <Link className="button secondary" href={`/edit/${instrument.qrCode}`}>Edit Profile</Link>
                          <Link className="button secondary" href={instrumentToProfileUrl(instrument)}>View Profile</Link>
                          {instrument.serial ? (
                            <button className="button secondary" type="button" onClick={() => void updateSerialVisibility(instrument, !instrument.showSerialPublic)}>
                              {instrument.showSerialPublic ? "Hide Serial Publicly" : "Show Serial Publicly"}
                            </button>
                          ) : null}
                          <RecordShareButton className={styles.dashboardShare} code={instrument.qrCode} title={title} showLabel />
                        </div>
                        <button className={`button secondary ${styles.dangerAction}`} type="button" onClick={() => void removeFromCollection(instrument)}>
                          Remove Profile
                        </button>
                      </div>
                      <TransferPanel
                        className={styles.transferPanel}
                        bodyClassName={styles.transferPanelBody}
                        instrument={instrument}
                        user={user}
                        latestTransfer={latestTransferForInstrument(transfers, instrument.qrCode)}
                        onTransferCreated={(transfer) => {
                          setTransfers((current) => [transfer, ...current.filter((item) => item.id !== transfer.id)]);
                        }}
                        onTransferChanged={refreshInstruments}
                      />
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

          {instruments.length ? <BulkProfileImport ownerName={displayName} onComplete={refreshInstruments} /> : null}
        </div>
      </main>
      <Footer />
    </>
  );
}

function TransferPanel({
  className,
  bodyClassName,
  instrument,
  user,
  latestTransfer,
  onTransferCreated,
  onTransferChanged
}: {
  className: string;
  bodyClassName: string;
  instrument: DemoInstrument;
  user: DemoUser | null;
  latestTransfer?: DemoTransfer;
  onTransferCreated: (transfer: DemoTransfer) => void;
  onTransferChanged: () => void;
}) {
  const [toName, setToName] = useState("");
  const [toEmail, setToEmail] = useState("");
  const [message, setMessage] = useState("");
  const [lastCreatedClaimUrl, setLastCreatedClaimUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const claimUrl =
    typeof window !== "undefined" && latestTransfer ? `${window.location.origin}${latestTransfer.claimPath}` : "";
  const visibleClaimUrl = claimUrl || lastCreatedClaimUrl;
  const hasPendingTransfer = latestTransfer?.status === "sent";
  const transferStatus = latestTransfer ? transferStatusLabel(latestTransfer) : "Start a secure handoff";

  async function copyClaimLink() {
    if (!visibleClaimUrl) {
      return;
    }

    await window.navigator.clipboard?.writeText(visibleClaimUrl);
    setMessage("Claim link copied.");
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
          toName
        })
      });
      const result = (await response.json().catch(() => null)) as
        | { ok?: boolean; message?: string; transfer?: DemoTransfer }
        | null;

      if (!response.ok || !result?.ok || !result.transfer) {
        setMessage(result?.message || "Could not create transfer.");
        return;
      }

      const nextClaimUrl = typeof window !== "undefined" ? `${window.location.origin}${result.transfer.claimPath}` : result.transfer.claimPath;
      setLastCreatedClaimUrl(nextClaimUrl);
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
      if (result.transfer) {
        onTransferCreated(result.transfer);
      }
      setMessage(result.message || "Transfer cancelled.");
      onTransferChanged();
    } finally {
      setSaving(false);
    }
  }

  return (
    <details className={className} data-pending={hasPendingTransfer ? "true" : "false"}>
      <summary>
        <span>Transfer Ownership</span>
        <strong>{transferStatus}</strong>
      </summary>
      <div className={bodyClassName}>
        <div className="transfer-copy">
          <span className="mini-eyebrow">Ownership handoff</span>
          <strong>Email a claim link to the next owner.</strong>
          <p>The recipient signs in with the email below, opens the claim link, and accepts the same permanent QRguitar Profile.</p>
        </div>
        <div className="transfer-form">
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
            New owner email
            <input
              type="email"
              value={toEmail}
              onChange={(event) => setToEmail(event.target.value)}
              disabled={hasPendingTransfer}
              placeholder="new-owner@example.com"
            />
          </label>
          {hasPendingTransfer ? (
            <div className="transfer-actions">
              <button className="button secondary" type="button" onClick={() => void copyClaimLink()}>
                <Copy size={16} />
                Copy Claim Link
              </button>
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
              <Mail size={16} />
              {saving ? "Sending..." : "Send Transfer Email"}
            </button>
          )}
        </div>
        {latestTransfer ? (
          <div className="claim-link-box">
            <span>
              {latestTransfer.status === "accepted"
                ? "Claim received"
                : latestTransfer.status === "cancelled"
                  ? "Transfer cancelled"
                  : "Claim link created"}
            </span>
            <strong>{latestTransfer.toName} - {latestTransfer.toEmail}</strong>
            <code>{visibleClaimUrl}</code>
            {latestTransfer.status === "sent" ? (
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


