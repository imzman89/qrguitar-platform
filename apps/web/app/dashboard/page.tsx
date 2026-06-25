"use client";

import { BadgeCheck, Bot, Copy, Eye, LogOut, Mail, QrCode, Repeat2, Settings2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Footer } from "../../components/Footer";
import { Nav } from "../../components/Nav";
import { QrDownload } from "../../components/QrDownload";
import styles from "./dashboard-records.module.css";
import {
  clearDemoUser,
  cancelDemoTransfer,
  createDemoTransfer,
  deleteDemoInstrument,
  getDemoInstruments,
  getDemoTransfers,
  getDemoUser,
  getAccountPlan,
  getAccountVerificationStatus,
  getInstrumentCondition,
  getInstrumentVerificationStatus,
  getLatestDemoTransferForInstrument,
  instrumentDisplayName,
  instrumentToProfileUrl,
  saveDemoInstrument,
  transferFeeLabel,
  transferHelperCopy,
  userCanEditInstrument,
  type DemoInstrument,
  type DemoTransfer,
  type DemoUser
} from "../../lib/local-demo";
import { useRouter } from "next/navigation";

const starterActions = [
  {
    title: "Register instrument",
    copy: "Create a profile, preview the public record, and generate the first QR link.",
    href: "/create",
    label: "Create Record"
  },
  {
    title: "Open public profile",
    copy: "See exactly what a buyer, builder, shop, or future owner sees when the QR is scanned.",
    href: "/i/QRG-PI260001",
    label: "Open Profile"
  },
  {
    title: "QRguitar Bot",
    copy: "Get practical guidance on missing proof, transfer notes, and sale prep for a selected instrument.",
    href: "/bot",
    label: "QRguitar Bot"
  },
  {
    title: "Review transfers",
    copy: "Create buyer claim links, verify handoffs, and keep the ownership trail attached to the instrument.",
    href: "/dashboard#saved-records",
    label: "Manage Transfers"
  }
];

export default function DashboardPage() {
  const [user, setUser] = useState<DemoUser | null>(null);
  const [instruments, setInstruments] = useState<DemoInstrument[]>([]);
  const [transfers, setTransfers] = useState<DemoTransfer[]>([]);
  const [ready, setReady] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const currentUser = getDemoUser();
    if (!currentUser) {
      router.replace(`/login?next=${encodeURIComponent("/dashboard")}`);
      return;
    }

  setUser(currentUser);
    setInstruments(getUserOwnedInstruments(currentUser));
    setTransfers(getUserOwnedTransfers(currentUser, getDemoTransfers()));
    setReady(true);
  }, [router]);

  const pendingTransfers = transfers.filter((transfer) => transfer.status === "sent").length;
  const verifiedRecords = instruments.filter((instrument) => getInstrumentVerificationStatus(instrument) === "verified").length;
  const accountPlan = getAccountPlan(user);
  const accountVerification = getAccountVerificationStatus(user);

  const stats = useMemo(
    () => [
      { label: "Registered instruments", value: String(instruments.length) },
      { label: "Verified records", value: String(verifiedRecords) },
      { label: "Transfers pending", value: String(pendingTransfers) },
      { label: "Public scans", value: instruments.length ? String(24 + instruments.length * 3) : "0" }
    ],
    [instruments.length, pendingTransfers, verifiedRecords]
  );

  function logout() {
    clearDemoUser();
    setUser(null);
    router.replace("/login?next=%2Fdashboard");
  }

  if (!ready) {
    return (
      <>
        <Nav />
        <main className="section auth-page">
          <div className="shell">
            <section className="card auth-card">
              <div className="eyebrow">Owner dashboard</div>
              <h2>Checking your session...</h2>
              <p>Please sign in to access dashboard tools.</p>
              <Link className="button" href={`/login?next=${encodeURIComponent("/dashboard")}`}>
                Go to login
              </Link>
            </section>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  function deleteInstrument(qrCode: string) {
    deleteDemoInstrument(qrCode);
    setInstruments(getUserOwnedInstruments(user));
  }

  function updateInstrumentQrStyle(updatedInstrument: DemoInstrument) {
    saveDemoInstrument(updatedInstrument);
    setInstruments(getUserOwnedInstruments(user));
  }

  return (
    <>
      <Nav />
      <main className="section dashboard-page">
        <div className="shell">
          <div className="dashboard-hero">
            <div>
              <div className="eyebrow">Owner dashboard</div>
              <h2>{user ? `Welcome back, ${user.name}.` : "Manage instrument records, QR downloads, ownership transfers, and public profiles."}</h2>
              <p>
                {user
                  ? `Signed in as ${user.email}. ${accountPlan.toUpperCase()} account: ${accountVerification === "verified" ? "verified" : accountVerification === "flagged" ? "flagged" : "unverified"}.`
                  : "Sign in to manage instrument records, QR downloads, transfers, and public profile visibility."}
              </p>
            </div>
            <div className="dashboard-buttons">
              {user ? (
                <button className="button secondary" type="button" onClick={logout}>
                  <LogOut size={17} />
                  Logout
                </button>
              ) : (
                <Link className="button secondary" href="/login">
                  Login
                </Link>
              )}
              <Link className="button" href="/create">
                Register Instrument
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

          <section className={`card ${styles.instrumentTable}`} id="saved-records">
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
              {instruments.length ? instruments.map((instrument) => {
                const canEditInstrument = userCanEditInstrument(user, instrument);

                return (
                <article className={styles.instrumentRow} key={instrument.qrCode}>
                  <div
                    className={styles.instrumentThumb}
                    style={
                      instrument.heroImageDataUrl
                        ? { backgroundImage: `linear-gradient(180deg, rgba(3,5,6,.08), rgba(3,5,6,.74)), url(${instrument.heroImageDataUrl})` }
                        : undefined
                    }
                    aria-hidden="true"
                  >
                    {!instrument.heroImageDataUrl ? <span>QR</span> : null}
                  </div>
                  <div className={styles.instrumentDetails}>
                    <div className={styles.instrumentInfo}>
                      <strong>{instrumentDisplayName(instrument)}</strong>
                      <span>{instrument.brand} - {instrument.serial}</span>
                      <small>{instrument.galleryImageDataUrls?.length || (instrument.heroImageDataUrl ? 1 : 0)} photos</small>
                    </div>
                    <div className={styles.instrumentMeta}>
                      <span>{instrument.model}</span>
                      <span>{instrument.year}</span>
                      <span>{getInstrumentCondition(instrument) === "new" ? "New" : "Used"}</span>
                      <span>{getInstrumentVerificationStatus(instrument) === "verified" ? "Verified record" : "Unverified record"}</span>
                    </div>
                  </div>
                  <div className={styles.qrActionColumn}>
                    <div className={styles.qrPanel}>
                      <QrDownload
                        code={instrument.qrCode}
                        label={instrumentDisplayName(instrument)}
                        qrStyle={instrument.qrStyle}
                        onStyleChange={(qrStyle) => {
                          if (canEditInstrument) {
                            updateInstrumentQrStyle({ ...instrument, qrStyle });
                          }
                        }}
                      />
                    </div>
                    <div className={styles.instrumentActions}>
                      {canEditInstrument ? (
                        <Link className="button secondary" href={`/edit/${instrument.qrCode}`}>
                          Edit Profile
                        </Link>
                      ) : (
                        <Link className="button secondary" href={instrumentToProfileUrl(instrument)}>
                          View Only
                        </Link>
                      )}
                      <Link className="button secondary" href={instrumentToProfileUrl(instrument)}>
                        View Profile
                      </Link>
                      {canEditInstrument ? (
                        <button className="button secondary" type="button" onClick={() => deleteInstrument(instrument.qrCode)}>
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {canEditInstrument ? (
                    <TransferPanel
                      className={styles.transferPanel}
                      bodyClassName={styles.transferPanelBody}
                      instrument={instrument}
                      user={user}
                      latestTransfer={transfers.find((transfer) => transfer.id === getLatestDemoTransferForInstrument(instrument.qrCode)?.id)}
                      onTransferCreated={(transfer) => {
                        if (!instruments.find((item) => item.qrCode === instrument.qrCode)) {
                          saveDemoInstrument(instrument);
                          setInstruments(getUserOwnedInstruments(user));
                        }

                        setTransfers((current) => [transfer, ...current.filter((item) => item.id !== transfer.id)]);
                      }}
                      onTransferChanged={() => setTransfers(getUserOwnedTransfers(user, getDemoTransfers()))}
                    />
                  ) : (
                    <div className={styles.transferPanel}>
                      <div className={styles.lockedOwnerTools}>
                        <span>Owner tools locked</span>
                        <strong>View-only record</strong>
                      </div>
                    </div>
                  )}
                </article>
              );
              }) : (
                <div className={styles.emptyState}>
                  <strong>No instruments yet.</strong>
                  <p>Register your first instrument.</p>
                  <Link className="button" href="/create">
                    Register Instrument
                  </Link>
                </div>
              )}
            </div>
          </section>

          <div className="grid three dashboard-actions">
            {starterActions.map((action) => (
              <article className="card" key={action.title}>
                <div className="icon">
                  {action.title === "Register instrument" ? <QrCode /> : action.title === "Open public profile" ? <Eye /> : action.title === "QRguitar Bot" ? <Bot /> : <Repeat2 />}
                </div>
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
              <h3>Recent instrument activity</h3>
              <div className="activity-list">
                <Activity icon={<QrCode size={18} />} title="QR links are active" detail="Each record has a permanent public URL for scans, sale listings, print cards, and case documentation." />
                <Activity icon={<ShieldCheck size={18} />} title="Records can be edited" detail="Create, update, preview, and publish instrument profiles from the same dashboard." />
                <Activity icon={<Repeat2 size={18} />} title="Transfer rules are set" detail="New brand/package records can include a first handoff. Used records default to a paid transfer." />
              </div>
            </section>
            <section className="card">
              <div className="icon"><Settings2 /></div>
              <h3>Launch checklist</h3>
              <div className="check-list">
                <div className="check-item"><span>1</span> Create an account and register an instrument</div>
                <div className="check-item"><span>2</span> Choose public catalog visibility or private-link access</div>
                <div className="check-item"><span>3</span> Style, preview, and download the QR image</div>
                <div className="check-item"><span>4</span> Start payment, ownership transfer, and buyer claim flow</div>
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

  const claimUrl =
    typeof window !== "undefined" && latestTransfer ? `${window.location.origin}${latestTransfer.claimPath}` : "";
  const visibleClaimUrl = claimUrl || lastCreatedClaimUrl;
  const includedFirstTransfer = transferFeeLabel(instrument).startsWith("$0");
  const hasPendingTransfer = latestTransfer?.status === "sent";

  async function copyClaimLink() {
    if (!visibleClaimUrl) {
      return;
    }

    await window.navigator.clipboard?.writeText(visibleClaimUrl);
    setMessage("Claim link copied. Send it to the buyer so they can accept ownership.");
  }

  function createTransfer() {
    const result = createDemoTransfer(
      instrument,
      toEmail,
      toName,
      user?.name || instrument.owner || "Current owner",
      user?.email || ""
    );

    if (!result.ok) {
      setMessage(result.reason);
      return;
    }

    const { transfer } = result;
    const nextClaimUrl = typeof window !== "undefined" ? `${window.location.origin}${transfer.claimPath}` : transfer.claimPath;
    setLastCreatedClaimUrl(nextClaimUrl);
    onTransferCreated(transfer);
    setMessage(
      transfer.feeCents === 0
        ? "Transfer link created. Copy it and send it to the buyer. They will verify email before ownership changes."
        : "Transfer link created. Buyer must complete payment and verify email before ownership changes."
    );
  }

  function cancelTransfer() {
    if (!latestTransfer) {
      return;
    }

    const result = cancelDemoTransfer(latestTransfer.id);
    if (!result.ok) {
      setMessage(result.reason);
      return;
    }

    setLastCreatedClaimUrl("");
    setMessage("Pending transfer cancelled.");
    onTransferChanged();
  }

  return (
    <details className={className}>
      <summary>
        <span>Transfer ownership</span>
        <strong>{transferFeeLabel(instrument)}</strong>
      </summary>
      <div className={bodyClassName}>
        <div className="transfer-copy">
          <span className="mini-eyebrow">Ownership handoff</span>
          <strong>
            {hasPendingTransfer
              ? "Pending buyer claim"
              : latestTransfer?.status === "accepted"
                ? "Transfer accepted"
                : includedFirstTransfer ? "Included first transfer" : "Paid transfer required"}
          </strong>
          <p>{transferHelperCopy(instrument)}</p>
        </div>
        <div className="transfer-form">
          <label>
            Buyer name
            <input value={toName} onChange={(event) => setToName(event.target.value)} disabled={hasPendingTransfer} />
          </label>
          <label>
            Buyer email
            <input type="email" value={toEmail} onChange={(event) => setToEmail(event.target.value)} disabled={hasPendingTransfer} />
          </label>
          {hasPendingTransfer ? (
            <button className="button secondary" type="button" onClick={cancelTransfer}>
              Cancel Pending
            </button>
          ) : (
            <button className="button" type="button" onClick={createTransfer}>
              <Mail size={16} />
              Create Claim Link
            </button>
          )}
        </div>
        {latestTransfer ? (
          <div className="claim-link-box">
            <span>
              {latestTransfer.status === "accepted"
                ? "Accepted transfer"
                : latestTransfer.status === "cancelled"
                  ? "Cancelled transfer"
                  : "Pending transfer"}
            </span>
            <strong>{latestTransfer.toName} - {latestTransfer.toEmail}</strong>
            <code>{visibleClaimUrl}</code>
            {latestTransfer.status === "sent" ? (
              <button className="button secondary" type="button" onClick={() => void copyClaimLink()}>
                <Copy size={16} />
                Copy Link
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
              Copy Link
            </button>
          </div>
        ) : null}
        {message ? <p className="form-message">{message}</p> : null}
      </div>
    </details>
  );
}

function getUserOwnedInstruments(user: DemoUser | null) {
  if (!user?.email) {
    return [];
  }

  return getDemoInstruments().filter((instrument) => userCanEditInstrument(user, instrument));
}

function getUserOwnedTransfers(user: DemoUser | null, transfers: DemoTransfer[]) {
  if (!user?.email) {
    return [];
  }

  const ownedCodes = new Set(getUserOwnedInstruments(user).map((instrument) => instrument.qrCode.toUpperCase()));
  return transfers.filter((transfer) => ownedCodes.has(transfer.guitarQrCode.toUpperCase()));
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
