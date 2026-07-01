"use client";

import { BadgeCheck, Copy, LogOut, Mail, QrCode, Repeat2, Settings2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Footer } from "../../components/Footer";
import { Nav } from "../../components/Nav";
import { QrDownload } from "../../components/QrDownload";
import styles from "./dashboard-records.module.css";
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
import { useRouter } from "next/navigation";

const starterActions = [
  {
    title: "Register instrument",
    copy: "Create a profile, preview the public record, and generate the first QR link.",
    href: "/create",
    label: "Create Record"
  },
  {
    title: "Browse public catalog",
    copy: "See how public records look to buyers, shops, and future owners.",
    href: "/catalog",
    label: "Open Catalog"
  }
];

function mergeDashboardRecords(records: DemoInstrument[], user: DemoUser | null) {
  void user;
  return records;
}

export default function DashboardPage() {
  const [user, setUser] = useState<DemoUser | null>(null);
  const [instruments, setInstruments] = useState<DemoInstrument[]>([]);
  const [transfers, setTransfers] = useState<DemoTransfer[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(true);
  const [authChecked, setAuthChecked] = useState(true);
  const router = useRouter();

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
        loadDashboardInstruments(token),
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

  function refreshInstruments() {
    if (!user?.email) {
      setInstruments([]);
      return;
    }

    getSupabaseAccessToken()
      .then(async (token) => {
        const [records, transferRecords] = await Promise.all([
          loadDashboardInstruments(token),
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
      { label: "Public records", value: String(instruments.filter((instrument) => instrument.visibility !== "private").length) }
    ],
    [instruments, pendingTransfers, verifiedRecords]
  );

  async function logout() {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    window.localStorage.removeItem("qrguitar.siteEditorUnlocked");
    setUser(null);
    router.replace("/login?next=%2Fdashboard");
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
              <h2>Sign in to manage your QRguitar records.</h2>
              <p>Manage your records, photos, documents, visibility, and QR downloads from your dashboard.</p>
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
              <h2>Sign in to manage your QRguitar records.</h2>
              <p>Manage your records, photos, documents, visibility, and QR downloads from your dashboard.</p>
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
              <div className="eyebrow">Owner dashboard</div>
              <h2>{user ? `Welcome back, ${displayName}.` : "Manage records, QR codes, transfers, and public profiles."}</h2>
              <p>
                {user
                  ? `Signed in as ${user.email}. ${accountSummary}`
                  : "Create a record, manage QR downloads, and keep ownership history attached to the same instrument record."}
              </p>
            </div>
            <div className="dashboard-buttons">
              {user ? (
                <button className="button secondary" type="button" onClick={() => void logout()}>
                  <LogOut size={17} />
                  Logout
                </button>
              ) : (
                <Link className="button secondary" href="/login">
                  Login
                </Link>
              )}
              <Link className="button" href="/create">
                Create Record
              </Link>
            </div>
          </div>

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
                <h3>Saved QRguitar records</h3>
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
                  const imageUrl = instrument.heroImageDataUrl || instrument.galleryImageDataUrls?.[0] || "";
                  const condition = getInstrumentCondition(instrument);
                  const verificationStatus = getInstrumentVerificationStatus(instrument);
                  const authenticityStatus = instrument.authenticityStatus === "confirmed" ? "confirmed" : "unconfirmed";
                  const safetyStatus = instrument.safetyStatus === "lost" || instrument.safetyStatus === "stolen" ? instrument.safetyStatus : "clear";
                  const title = dashboardRecordTitle(instrument);
                  const meta = dashboardRecordMeta(instrument, condition);
                  const category = instrument.instrumentType || "Instrument";

                  return (
                    <article className={styles.instrumentRow} key={instrument.qrCode}>
                      <Link
                        className={styles.instrumentBodyLink}
                        href={instrumentToProfileUrl(instrument)}
                        aria-label={`Open ${title} profile`}
                      >
                        <div className={styles.instrumentThumb} aria-hidden="true">
                          {imageUrl ? <img src={imageUrl} alt="" loading="lazy" /> : <span>QR</span>}
                        </div>
                        <div className={styles.instrumentDetails}>
                          <div className={styles.instrumentInfo}>
                            <strong>{title}</strong>
                            <span title={meta}>{meta}</span>
                            <div className={styles.instrumentBadges}>
                              {instrument.showVerificationBadge !== false ? (
                                <small>{verificationStatus === "verified" ? "Verified by QRguitar" : "Unverified"}</small>
                              ) : null}
                              {instrument.showAuthenticityBadge !== false ? (
                                <small>{authenticityStatus === "confirmed" ? "Authenticity Confirmed" : "Authenticity Unconfirmed"}</small>
                              ) : null}
                              {safetyStatus === "lost" ? <small>Reported Lost</small> : null}
                              {safetyStatus === "stolen" ? <small>Reported Stolen</small> : null}
                              <small>{category}</small>
                            </div>
                          </div>
                          <div className={styles.instrumentMeta}>
                            <span>{instrument.galleryImageDataUrls?.length || (instrument.heroImageDataUrl ? 1 : 0)} photos</span>
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
                            Edit Record
                          </Link>
                          <Link className="button secondary" href={instrumentToProfileUrl(instrument)}>
                            View Record
                          </Link>
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
                  <h3>No instruments yet.</h3>
                  <p>No instruments yet. Register your first instrument.</p>
                  <Link className="button" href="/create">
                    Register your first instrument
                  </Link>
                </div>
              )}
            </div>
          </section>

      <div className="grid three dashboard-actions">
              {starterActions.map((action) => (
              <article className="card" key={action.title}>
                <div className="icon">{action.title === "Register instrument" ? <QrCode /> : <Settings2 />}</div>
                <h3>{action.title}</h3>
                <p>{action.copy}</p>
                <Link className="button secondary" href={action.href}>
                  {action.label}
                </Link>
              </article>
            ))}
          </div>

          <div className="split dashboard-split">
            <section className="card">
              <div className="icon"><BadgeCheck /></div>
              <h3>What is working</h3>
              <div className="activity-list">
                <Activity icon={<QrCode size={18} />} title="Permanent record links" detail="Every instrument keeps one QRguitar URL that stays the same as details are updated." />
                <Activity icon={<ShieldCheck size={18} />} title="Owner account flow" detail="Sign in, create records, edit details, and manage public or private visibility from one dashboard." />
                <Activity icon={<ShieldCheck size={18} />} title="Why verify?" detail="Paid verification and authenticity review are handled manually during beta." />
              </div>
              <div className="check-list">
                <div className="check-item"><span>1</span> Builds trust when selling</div>
                <div className="check-item"><span>2</span> Helps shops and builders stand behind records</div>
                <div className="check-item"><span>3</span> Keeps provenance cleaner over time</div>
                <div className="check-item"><span>4</span> Helps collectors organize proof, receipts, photos, and service history</div>
                <div className="check-item"><span>5</span> Adds an optional authenticity review layer for higher-value instruments</div>
              </div>
            </section>
            <section className="card">
              <div className="icon"><Settings2 /></div>
              <h3>What to do next</h3>
              <div className="check-list">
                <div className="check-item"><span>1</span> Register the instrument with its core details and photos</div>
                <div className="check-item"><span>2</span> Review the public record the buyer or shop will actually see</div>
                <div className="check-item"><span>3</span> Download the QR in the format you want to use</div>
                <div className="check-item"><span>4</span> Contact support@qrguitar.com if you need manual ownership help during launch</div>
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
  const [transferNote, setTransferNote] = useState("");
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
    setMessage("Claim link copied. Send this link to the next owner.");
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
      setTransferNote("");
      onTransferCreated(result.transfer);
      setMessage(result.message || "Claim link created. Send this link to the next owner.");
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
          <strong>Create a claim link for the next owner.</strong>
          <p>Owner-transfer tools are in beta. Use this only when you are ready to invite the next owner.</p>
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
          <label>
            Optional note
            <input
              value={transferNote}
              onChange={(event) => setTransferNote(event.target.value)}
              disabled={hasPendingTransfer}
              placeholder="Short private note for this beta transfer"
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
              {saving ? "Creating..." : "Create Claim Link"}
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

async function loadDashboardInstruments(token: string) {
  if (!token) {
    return [];
  }

  const response = await fetch("/api/instruments?scope=mine", { headers: { authorization: `Bearer ${token}` } });
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
    instrument.serial || instrument.qrCode,
    instrument.year,
    condition === "new" ? "New" : "Used"
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


