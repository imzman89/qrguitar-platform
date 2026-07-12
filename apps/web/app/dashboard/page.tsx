"use client";

import { BadgeCheck, Copy, Mail, QrCode, Repeat2, Settings2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Footer } from "../../components/Footer";
import { Nav } from "../../components/Nav";
import { QrDownload } from "../../components/QrDownload";
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
import { clearQrGuitarSessionState, createBrowserSupabaseClient, getSupabaseAccessToken } from "../../lib/supabase-browser";
import { useRouter } from "next/navigation";

const starterActions = [
  {
    title: "New record",
    copy: "Register an instrument, add photos, and generate a permanent QRguitar link.",
    href: "/create",
    label: "Create Profile"
  },
  {
    title: "Public catalog",
    copy: "Review how visible QRguitar Profiles appear to buyers, shops, and future owners.",
    href: "/catalog",
    label: "Open Catalog"
  }
];

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
  const [loadingRecords, setLoadingRecords] = useState(true);
  const [authChecked, setAuthChecked] = useState(true);
  const [dashboardMessage, setDashboardMessage] = useState("");
  const [dashboardCopy, setDashboardCopy] = useState(defaultSiteSettings.dashboard);
  const router = useRouter();

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
      const [records, transferRecords] = await Promise.all([
        loadDashboardInstruments(token, false),
        loadDashboardTransfers(token)
      ]);

        if (!cancelled) {
          setInstruments(mergeDashboardRecords(records, user));
        setTransfers(transferRecords);
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
  const verifiedRecords = instruments.filter((instrument) => getInstrumentVerificationStatus(instrument) === "verified").length;
  const pendingTransfers = transfers.filter(
    (transfer) => transfer.status === "sent" && instrumentCodes.has(transfer.guitarQrCode.toUpperCase())
  ).length;
  const accountPlan = getAccountPlan(user);
  const displayName = useMemo(() => getDisplayName(user), [user?.name, user?.email, user?.role]);
  const accountSummary = accountPlan === "free" ? "Beta access." : `${accountPlan.charAt(0).toUpperCase()}${accountPlan.slice(1)} account.`;
  const publicRecords = instruments.filter((instrument) => instrument.visibility === "public").length;
  const privateRecords = instruments.filter((instrument) => instrument.visibility === "private").length;
  const unlistedRecords = instruments.filter((instrument) => instrument.visibility === "unlisted").length;
  const recordsWithPhotos = instruments.filter((instrument) => instrument.heroImageDataUrl || instrument.galleryImageDataUrls?.length).length;
  const hiddenDocumentCount = instruments.reduce((total, instrument) => total + (instrument.documentFiles?.filter((file) => file.visibility === "hidden").length || 0), 0);

  function refreshInstruments() {
    if (!user?.email) {
      setInstruments([]);
      return;
    }

    getSupabaseAccessToken()
      .then(async (token) => {
        const [records, transferRecords] = await Promise.all([
          loadDashboardInstruments(token, false),
          loadDashboardTransfers(token)
        ]);
        return { records, transferRecords };
      })
      .then(({ records, transferRecords }) => {
        setInstruments(mergeDashboardRecords(records, user));
        setTransfers(transferRecords);
      });
  }

  const stats = useMemo(
    () => [
      { label: "Registered instruments", value: String(instruments.length) },
      { label: "Verified records", value: String(verifiedRecords) },
      { label: "Transfers pending", value: String(pendingTransfers) },
      { label: "Catalog profiles", value: String(publicRecords) }
    ],
    [instruments, pendingTransfers, publicRecords, verifiedRecords]
  );

  async function logout() {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    clearQrGuitarSessionState();
    setUser(null);
    router.replace("/login?next=%2Fdashboard");
  }

  async function removeFromCollection(instrument: DemoInstrument) {
    const allowed = getInstrumentVerificationStatus(instrument) !== "verified" && instrument.authenticityStatus !== "confirmed";
    if (!allowed) {
      setDashboardMessage("Verified and authenticity-confirmed records are preserved for provenance. Transfer ownership or contact QRguitar admin for permanent removal.");
      return;
    }

    const confirmed = window.confirm("Permanently delete this record from your QRguitar dashboard? This cannot be undone. The QRguitar ID stays reserved, but the record will be removed from your active account and hidden from public view.");
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
    setDashboardMessage(payload.message || (response.ok ? "Record permanently deleted from your dashboard." : "Could not delete this record."));
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
              <h2>{user ? `Welcome back, ${displayName}.` : "Manage records, QR codes, transfers, and public profiles."}</h2>
              <p>
                {user
                  ? `${dashboardCopy.subtitle} ${accountSummary}`
                  : "Create a record, manage QR downloads, and keep ownership history attached to the same instrument record."}
              </p>
            </div>
            <div className="dashboard-buttons">
              <Link className="button" href="/create">
                Create Profile
              </Link>
            </div>
          </div>
          {dashboardMessage ? <div className="admin-message">{dashboardMessage}</div> : null}

          <div className="stats-grid">
            {stats.map((stat) => (
              <article className="stat-card" key={stat.label}>
                <h3>{stat.value}</h3>
                <p>{stat.label}</p>
              </article>
            ))}
          </div>

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
                  <h3>Loading your records...</h3>
                  <p>Pulling your saved records now.</p>
                </div>
              ) : instruments.length ? (
                instruments.map((instrument) => {
                  const totalDocs = instrument.documentFiles?.length || 0;
                  const publicDocs = instrument.documentFiles?.filter((file) => file.visibility !== "hidden").length || 0;
                  const hiddenDocs = Math.max(0, totalDocs - publicDocs);
                  const imageSources = [instrument.heroImageDataUrl || "", ...(instrument.galleryImageDataUrls || [])];
                  const condition = getInstrumentCondition(instrument);
                  const verificationStatus = getInstrumentVerificationStatus(instrument);
                  const authenticityStatus = instrument.authenticityStatus === "confirmed" ? "confirmed" : "unconfirmed";
                  const safetyStatus = instrument.safetyStatus === "lost" || instrument.safetyStatus === "stolen" ? instrument.safetyStatus : "clear";
                  const title = dashboardRecordTitle(instrument);
                  const meta = dashboardRecordMeta(instrument, condition);
                  const category = instrument.instrumentType || "Instrument";
                  const saleStatus = instrument.saleStatus === "for_sale" ? "For sale" : "";
                  const originalityStatus = instrument.originalityStatus === "all_original" ? "All original" : instrument.originalityStatus === "modified" ? "Modified" : "";

                  return (
                    <article className={styles.instrumentRow} key={instrument.qrCode}>
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
                            <div className="record-badge-row" aria-label="Profile status">
                              {instrument.showVerificationBadge !== false ? (
                                <small className={`record-badge ${verificationStatus === "verified" ? "record-badge--verified" : "record-badge--unverified"}`}>
                                  <span className="record-badge-text">{verificationStatus === "verified" ? "Verified by QRguitar" : "Unverified"}</span>
                                </small>
                              ) : null}
                              {instrument.showAuthenticityBadge !== false ? (
                                <small className={`record-badge ${authenticityStatus === "confirmed" ? "record-badge--auth-confirmed" : "record-badge--auth-unconfirmed"}`}>
                                  <span className="record-badge-text">{authenticityStatus === "confirmed" ? "Authenticity Confirmed" : "Authenticity Unconfirmed"}</span>
                                </small>
                              ) : null}
                              {safetyStatus === "lost" ? <small className="record-badge record-badge--safety"><span className="record-badge-text">Reported Lost</span></small> : null}
                              {safetyStatus === "stolen" ? <small className="record-badge record-badge--safety"><span className="record-badge-text">Reported Stolen</span></small> : null}
                              {saleStatus ? <small className="record-badge record-badge--sale"><span className="record-badge-text">{saleStatus}</span></small> : null}
                              {originalityStatus ? <small className="record-badge record-badge--disclosure"><span className="record-badge-text">{originalityStatus}</span></small> : null}
                              <small className="record-badge record-badge--disclosure"><span className="record-badge-text">{category}</span></small>
                            </div>
                          </div>
                          <div className={styles.instrumentMeta}>
                            {(() => {
                              const photoCount = instrument.galleryImageDataUrls?.length || (instrument.heroImageDataUrl ? 1 : 0);
                              return <span>{photoCount} {photoCount === 1 ? "photo" : "photos"}</span>;
                            })()}
                            <span>{instrument.serviceEvents?.length ? `${instrument.serviceEvents.length} service ${instrument.serviceEvents.length === 1 ? "entry" : "entries"}` : "No service history yet"}</span>
                            <span>{totalDocs ? `${publicDocs} public docs${hiddenDocs ? `, ${hiddenDocs} hidden` : ""}` : "No documents yet"}</span>
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
                          <Link className="button secondary" href={`/edit/${instrument.qrCode}`}>
                            Edit Profile
                          </Link>
                          <Link className="button secondary" href={instrumentToProfileUrl(instrument)}>
                            View Profile
                          </Link>
                          <button className="button secondary" type="button" onClick={() => void removeFromCollection(instrument)}>
                            Delete Record
                          </button>
                        </div>
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
                  <h3>{dashboardCopy.emptyCollectionTitle}</h3>
                  <p>{dashboardCopy.emptyCollectionBody}</p>
                  <Link className="button" href="/create">
                    {dashboardCopy.firstRecordCtaLabel}
                  </Link>
                </div>
              )}
            </div>
          </section>

      <div className="grid three dashboard-actions">
              {starterActions.map((action) => (
              <article className="card" key={action.title}>
                <div className="icon">{action.href === "/create" ? <QrCode /> : <Settings2 />}</div>
                <h3>{action.title}</h3>
                <p>{action.copy}</p>
                <Link className="button secondary" href={action.href}>
                  {action.label}
                </Link>
              </article>
            ))}
          </div>

          <div className="split dashboard-split dashboard-owner-tools">
            <section className="card dashboard-health-card">
              <div className="icon"><BadgeCheck /></div>
              <h3>{dashboardCopy.collectionHealthTitle}</h3>
              <p>{dashboardCopy.collectionHealthHelper}</p>
              <div className="dashboard-health-grid">
                <div>
                  <strong>{recordsWithPhotos}/{instruments.length || 0}</strong>
                  <span>Records with photos</span>
                </div>
                <div>
                  <strong>{publicRecords}</strong>
                  <span>Public</span>
                </div>
                <div>
                  <strong>{privateRecords}</strong>
                  <span>Private</span>
                </div>
                <div>
                  <strong>{hiddenDocumentCount}</strong>
                  <span>Hidden docs</span>
                </div>
              </div>
              <div className="activity-list compact">
                <Activity icon={<QrCode size={18} />} title={dashboardCopy.qrGuidanceTitle} detail={dashboardCopy.qrGuidanceBody} />
                <Activity icon={<ShieldCheck size={18} />} title={dashboardCopy.privacyGuidanceTitle} detail={`${dashboardCopy.privacyGuidanceBody} Current: ${publicRecords} public, ${privateRecords} private${unlistedRecords ? `, ${unlistedRecords} unlisted` : ""}.`} />
                <Activity icon={<Copy size={18} />} title={dashboardCopy.proofGuidanceTitle} detail={dashboardCopy.proofGuidanceBody} />
                <Activity icon={<Settings2 size={18} />} title={dashboardCopy.serviceGuidanceTitle} detail={dashboardCopy.serviceGuidanceBody} />
              </div>
            </section>
            <section className="card dashboard-next-card">
              <div className="icon"><Settings2 /></div>
              <h3>{dashboardCopy.nextActionsTitle}</h3>
              <p>{dashboardCopy.nextActionsHelper}</p>
              <div className="dashboard-action-list">
                <Link href="/create">
                  <strong>Add another record</strong>
                  <span>Register another guitar, amp, pedal, or build.</span>
                </Link>
                <Link href="/catalog">
                  <strong>Review public catalog</strong>
                  <span>See what buyers and shops can view.</span>
                </Link>
                <a href="mailto:support@qrguitar.com?subject=QRguitar%20verification%20help">
                  <strong>{dashboardCopy.verificationGuidanceTitle}</strong>
                  <span>{dashboardCopy.verificationGuidanceBody}</span>
                </a>
                <a href="mailto:support@qrguitar.com?subject=QRguitar%20ownership%20transfer%20help">
                  <strong>{dashboardCopy.transferGuidanceTitle}</strong>
                  <span>{dashboardCopy.transferGuidanceBody}</span>
                </a>
              </div>
            </section>
          </div>
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
  const transferStatus = latestTransfer ? transferStatusLabel(latestTransfer) : "No transfer is pending.";

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
    <details className={className}>
      <summary>
        <span>Ownership transfer beta</span>
        <strong>{transferStatus}</strong>
      </summary>
      <div className={bodyClassName}>
        <div className="transfer-copy">
          <span className="mini-eyebrow">Ownership transfer beta</span>
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
    condition === "new" ? "New" : "Used",
    `QRguitar ID / Instrument ID: ${instrument.qrCode}`,
    instrument.serial ? `Serial / Build ID: ${instrument.serial}` : ""
  ].filter(Boolean).join(" • ");
}

function sameText(first: string, second: string) {
  return first.trim().toLowerCase() === second.trim().toLowerCase();
}

function Activity({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
  return (
    <div className="activity-item">
      <span>{icon}</span>
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
    </div>
  );
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


