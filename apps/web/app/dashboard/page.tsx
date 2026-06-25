"use client";

import { BadgeCheck, Copy, Eye, LogOut, Mail, QrCode, Repeat2, Settings2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Footer } from "../../components/Footer";
import { Nav } from "../../components/Nav";
import { QrDownload } from "../../components/QrDownload";
import styles from "./dashboard-records.module.css";
import {
  clearDemoUser,
  createDemoTransfer,
  deleteDemoInstrument,
  demoInstrument,
  getDemoInstruments,
  getDemoTransfers,
  getDemoUser,
  getAccountPlan,
  getAccountVerificationStatus,
  getInstrumentCondition,
  getInstrumentVerificationStatus,
  instrumentDisplayName,
  instrumentToProfileUrl,
  saveDemoInstrument,
  transferFeeLabel,
  transferHelperCopy,
  type DemoInstrument,
  type DemoTransfer,
  type DemoUser
} from "../../lib/local-demo";

const starterActions = [
  {
    title: "Register instrument",
    copy: "Create a profile, preview the public record, and generate the first QR link.",
    href: "/create",
    label: "Create Record"
  },
  {
    title: "View demo profile",
    copy: "Open the public-facing page a buyer, builder, or future owner would scan.",
    href: "/i/QRG-PI260001",
    label: "Open Profile"
  },
  {
    title: "Connect Supabase",
    copy: "Turn local demo records into real saved accounts, instruments, media, and transfers.",
    href: "/create",
    label: "Next Step"
  }
];

export default function DashboardPage() {
  const [user, setUser] = useState<DemoUser | null>(null);
  const [instruments, setInstruments] = useState<DemoInstrument[]>([]);
  const [transfers, setTransfers] = useState<DemoTransfer[]>([]);

  useEffect(() => {
    setUser(getDemoUser());
    setInstruments(getDemoInstruments());
    setTransfers(getDemoTransfers());
  }, []);

  const pendingTransfers = transfers.filter((transfer) => transfer.status === "sent").length;
  const verifiedRecords = instruments.filter((instrument) => getInstrumentVerificationStatus(instrument) === "verified").length;
  const accountPlan = getAccountPlan(user);
  const accountVerification = getAccountVerificationStatus(user);

  const stats = useMemo(
    () => [
      { label: "Registered instruments", value: String(Math.max(instruments.length, 1)) },
      { label: "Verified records", value: String(instruments.length ? verifiedRecords : 1) },
      { label: "Transfers pending", value: String(pendingTransfers) },
      { label: "Public scans", value: instruments.length ? String(24 + instruments.length * 3) : "24" }
    ],
    [instruments.length, pendingTransfers, verifiedRecords]
  );

  function logout() {
    clearDemoUser();
    setUser(null);
  }

  function deleteInstrument(qrCode: string) {
    deleteDemoInstrument(qrCode);
    setInstruments(getDemoInstruments());
  }

  function updateInstrumentQrStyle(updatedInstrument: DemoInstrument) {
    saveDemoInstrument(updatedInstrument);
    setInstruments(getDemoInstruments());
  }

  return (
    <>
      <Nav />
      <main className="section dashboard-page">
        <div className="shell">
          <div className="dashboard-hero">
            <div>
              <div className="eyebrow">Owner dashboard</div>
              <h2>{user ? `Welcome back, ${user.name}.` : "Manage records, QR codes, transfers, and public profiles."}</h2>
              <p>
                {user
                  ? `Signed in locally as ${user.email}. ${accountPlan.toUpperCase()} account: ${accountVerification === "verified" ? "verified" : accountVerification === "flagged" ? "flagged" : "unverified"}.`
                  : "Create a local demo account to test the customer flow before we connect real authentication."}
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
              {(instruments.length ? instruments : demoRows).map((instrument) => (
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
                  <div className={styles.qrPanel}>
                    <QrDownload
                      code={instrument.qrCode}
                      label={instrumentDisplayName(instrument)}
                      qrStyle={instrument.qrStyle}
                      onStyleChange={(qrStyle) => updateInstrumentQrStyle({ ...instrument, qrStyle })}
                    />
                  </div>
                  <div className={styles.instrumentActions}>
                    <Link className="button secondary" href={`/edit/${instrument.qrCode}`}>
                      Edit Profile
                    </Link>
                    <Link className="button secondary" href={instrumentToProfileUrl(instrument)}>
                      View Profile
                    </Link>
                    <button className="button secondary" type="button" onClick={() => deleteInstrument(instrument.qrCode)}>
                      Delete
                    </button>
                  </div>
                  <TransferPanel
                    className={styles.transferPanel}
                    bodyClassName={styles.transferPanelBody}
                    instrument={instrument}
                    user={user}
                    latestTransfer={transfers.find((transfer) => transfer.guitarQrCode === instrument.qrCode)}
                    onTransferCreated={(transfer) => {
                      if (!instruments.find((item) => item.qrCode === instrument.qrCode)) {
                        saveDemoInstrument(instrument);
                        setInstruments(getDemoInstruments());
                      }

                      setTransfers((current) => [transfer, ...current.filter((item) => item.id !== transfer.id)]);
                    }}
                  />
                </article>
              ))}
            </div>
          </section>

          <div className="grid three dashboard-actions">
            {starterActions.map((action) => (
              <article className="card" key={action.title}>
                <div className="icon">{action.title === "Register instrument" ? <QrCode /> : action.title === "View demo profile" ? <Eye /> : <Settings2 />}</div>
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
                <Activity icon={<QrCode size={18} />} title="QR profile ready" detail="Public profile links are working locally." />
                <Activity icon={<ShieldCheck size={18} />} title="Customer flow staged" detail="Login, dashboard, create, and public profile now connect." />
                <Activity icon={<Repeat2 size={18} />} title="Transfer rules ready" detail="New brand/package records can include a first handoff. Used records default to paid transfer." />
              </div>
            </section>
            <section className="card">
              <div className="icon"><Settings2 /></div>
              <h3>Build checklist</h3>
              <div className="check-list">
                <div className="check-item"><span>1</span> Local login and guitar registration</div>
                <div className="check-item"><span>2</span> Supabase auth and database saves</div>
                <div className="check-item"><span>3</span> QR image generation and download</div>
                <div className="check-item"><span>4</span> Stripe checkout and real transfer emails</div>
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
  onTransferCreated
}: {
  className: string;
  bodyClassName: string;
  instrument: DemoInstrument;
  user: DemoUser | null;
  latestTransfer?: DemoTransfer;
  onTransferCreated: (transfer: DemoTransfer) => void;
}) {
  const [toName, setToName] = useState("New owner");
  const [toEmail, setToEmail] = useState("buyer@example.com");
  const [message, setMessage] = useState("");

  const claimUrl =
    typeof window !== "undefined" && latestTransfer ? `${window.location.origin}${latestTransfer.claimPath}` : "";
  const includedFirstTransfer = transferFeeLabel(instrument).startsWith("$0");

  async function copyClaimLink() {
    if (!claimUrl) {
      return;
    }

    await window.navigator.clipboard?.writeText(claimUrl);
    setMessage("Claim link copied. Send it to the buyer so they can accept ownership.");
  }

  function createTransfer() {
    const transfer = createDemoTransfer(instrument, toEmail, toName, user?.name || instrument.owner || "Current owner");
    onTransferCreated(transfer);
    setMessage(
      transfer.feeCents === 0
        ? "Transfer link created. This record qualifies for an included first handoff."
        : "Transfer link created. This used/customer record is marked as a paid transfer."
    );
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
          <strong>{includedFirstTransfer ? "Included first transfer" : "Paid transfer required"}</strong>
          <p>{transferHelperCopy(instrument)}</p>
        </div>
        <div className="transfer-form">
          <label>
            Buyer name
            <input value={toName} onChange={(event) => setToName(event.target.value)} />
          </label>
          <label>
            Buyer email
            <input type="email" value={toEmail} onChange={(event) => setToEmail(event.target.value)} />
          </label>
          <button className="button" type="button" onClick={createTransfer}>
            <Mail size={16} />
            Create Claim Link
          </button>
        </div>
        {latestTransfer ? (
          <div className="claim-link-box">
            <span>{latestTransfer.status === "accepted" ? "Accepted transfer" : "Pending transfer"}</span>
            <strong>{latestTransfer.toName} - {latestTransfer.toEmail}</strong>
            <code>{claimUrl}</code>
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

const demoRows: DemoInstrument[] = [demoInstrument];

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
