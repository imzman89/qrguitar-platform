"use client";

import { BadgeCheck, Copy, LogIn, Repeat2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Footer } from "../../../components/Footer";
import { Nav } from "../../../components/Nav";
import {
  acceptDemoTransfer,
  findDemoInstrument,
  findDemoTransfer,
  getDemoUser,
  instrumentToProfileUrl,
  sendDemoTransferClaimCode,
  saveDemoUser,
  transferStatusLabel,
  verifyDemoTransferClaimCode,
  type DemoInstrument,
  type DemoTransfer,
  type DemoUser
} from "../../../lib/local-demo";

export default function TransferClaimPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [transfer, setTransfer] = useState<DemoTransfer | null>(null);
  const [instrument, setInstrument] = useState<DemoInstrument | null>(null);
  const [message, setMessage] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [localCodeNotice, setLocalCodeNotice] = useState("");
  const [account, setAccount] = useState<DemoUser>({
    name: "",
    email: "",
    role: "owner",
    plan: "free",
    verificationStatus: "unverified"
  });

  useEffect(() => {
    const foundTransfer = findDemoTransfer(params.id);
    setTransfer(foundTransfer);

    if (foundTransfer) {
      setInstrument(findDemoInstrument(foundTransfer.guitarQrCode));
      setAccount((current) => ({
        ...current,
        name: foundTransfer.toName || current.name,
        email: foundTransfer.toEmail || current.email
      }));
    }

    const user = getDemoUser();
    if (user) {
      setAccount(user);
    }
  }, [params.id]);

  const profileHref = useMemo(() => {
    if (instrument) {
      return instrumentToProfileUrl(instrument);
    }

    return transfer ? `/i/${transfer.guitarQrCode}` : "/dashboard";
  }, [instrument, transfer]);

  function acceptTransfer() {
    if (!transfer) {
      return;
    }

    const user: DemoUser = {
      ...account,
      name: account.name.trim() || transfer.toName || "New owner",
      email: account.email.trim() || transfer.toEmail,
      role: "owner",
      plan: account.plan || "free",
      verificationStatus: account.verificationStatus || "unverified"
    };

    saveDemoUser(user);
    const accepted = acceptDemoTransfer(transfer.id, user);

    if (!accepted.ok) {
      setMessage(accepted.reason);
      return;
    }

    setTransfer(accepted.transfer);
    setInstrument(findDemoInstrument(accepted.transfer.guitarQrCode));
    setMessage("Ownership accepted. This guitar is now attached to your local QRguitar account.");
  }

  function sendVerificationCode() {
    if (!transfer) {
      return;
    }

    const result = sendDemoTransferClaimCode(transfer.id, account.email);
    if (!result.ok) {
      setMessage(result.reason);
      return;
    }

    setTransfer(result.transfer);
    setLocalCodeNotice(`Local test code: ${result.code}`);
    setMessage("Verification code sent. Paste it below to unlock ownership acceptance.");
  }

  function verifyClaimEmail() {
    if (!transfer) {
      return;
    }

    const result = verifyDemoTransferClaimCode(transfer.id, account.email, verificationCode);
    if (!result.ok) {
      setMessage(result.reason);
      return;
    }

    setTransfer(result.transfer);
    setLocalCodeNotice("");
    setMessage("Buyer email verified. You can accept ownership now.");
  }

  async function copyProfileLink() {
    if (typeof window === "undefined") {
      return;
    }

    await window.navigator.clipboard?.writeText(`${window.location.origin}${profileHref}`);
    setMessage("Profile link copied.");
  }

  if (!transfer) {
    return (
      <>
        <Nav />
        <main className="section auth-page">
          <div className="shell auth-layout">
            <section>
              <div className="eyebrow">Ownership transfer</div>
              <h1>This claim link was not found.</h1>
              <p>Ask the seller, builder, or shop to create a fresh QRguitar ownership transfer link.</p>
              <Link className="button" href="/dashboard">
                Go to Dashboard
              </Link>
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
      <main className="section auth-page">
        <div className="shell transfer-claim-layout">
          <section>
            <div className="eyebrow">Ownership transfer</div>
              <h1>Accept ownership of {transfer.guitarName}.</h1>
            <p>
              {transfer.status === "accepted"
                ? "This claim has already been received. The permanent QR link stays with the instrument."
              : transfer.status === "cancelled"
                  ? "This transfer was cancelled. Ask the seller, builder, or shop for a fresh transfer link."
                  : "Owner transfer tools are in beta. Verify your email so the current owner has a clean claim request to review."}
            </p>
            <div className="transfer-summary card">
              <div className="icon">
                <Repeat2 />
              </div>
              <div>
                <span>From</span>
                <strong>{transfer.fromOwnerName}</strong>
              </div>
              <div>
                <span>To</span>
                <strong>{transfer.toName || transfer.toEmail}</strong>
              </div>
              <div>
                <span>Status</span>
                <strong>{transferStatusLabel(transfer)}</strong>
              </div>
            </div>
            <div className="claim-assurance">
              <span><ShieldCheck size={18} /> Permanent QR link stays the same</span>
              <span><BadgeCheck size={18} /> New owner email must be verified</span>
            </div>
          </section>

          <section className="card form auth-card">
            {transfer.status === "accepted" ? (
              <>
                <div className="icon"><BadgeCheck /></div>
                <h3>Ownership accepted.</h3>
                <p>This record now reflects the new owner and keeps the same permanent QRguitar link.</p>
                <Link className="button" href={profileHref}>
                  View Guitar Profile
                </Link>
                <button className="button secondary" type="button" onClick={() => void copyProfileLink()}>
                  <Copy size={16} />
                  Copy Profile Link
                </button>
                <Link className="button secondary" href="/dashboard">
                  Open Dashboard
                </Link>
              </>
            ) : transfer.status === "cancelled" ? (
              <>
                <div className="icon"><Repeat2 /></div>
                <h3>This transfer was cancelled.</h3>
                <p>The current owner needs to create a new claim link before this instrument can be handed off.</p>
                <Link className="button" href={profileHref}>
                  View Guitar Profile
                </Link>
              </>
            ) : (
              <>
                <div className="icon"><LogIn /></div>
                <h3>Verify your email.</h3>
                <p>Enter the details from the ownership transfer, send the verification code, then submit the claim for the current owner to review.</p>
                <div className="field">
                  <label htmlFor="claimName">Your name</label>
                  <input
                    id="claimName"
                    value={account.name}
                    onChange={(event) => setAccount({ ...account, name: event.target.value })}
                    placeholder="Your name"
                  />
                </div>
                <div className="field">
                  <label htmlFor="claimEmail">Your email</label>
                  <input
                    id="claimEmail"
                    type="email"
                    value={account.email}
                    onChange={(event) => setAccount({ ...account, email: event.target.value })}
                    placeholder="you@example.com"
                  />
                </div>
                <div className="field">
                  <label htmlFor="claimCode">Verification code</label>
                  <input
                    id="claimCode"
                    value={verificationCode}
                    onChange={(event) => setVerificationCode(event.target.value)}
                    placeholder={transfer.claimEmailVerifiedAt ? "Email verified" : "Send code first"}
                    disabled={Boolean(transfer.claimEmailVerifiedAt)}
                  />
                </div>
                {localCodeNotice ? <p className="fine-print">{localCodeNotice}</p> : null}
                {transfer.claimEmailVerifiedAt ? (
                  <button className="button" type="button" onClick={acceptTransfer}>
                    Submit Ownership Claim
                  </button>
                ) : (
                  <>
                    <button className="button" type="button" onClick={sendVerificationCode}>
                      Send Verification Code
                    </button>
                    <button className="button secondary" type="button" onClick={verifyClaimEmail}>
                      Verify Email
                    </button>
                  </>
                )}
                <button className="button secondary" type="button" onClick={() => router.push(profileHref)}>
                  Preview Profile First
                </button>
              </>
            )}
            {message ? <p className="form-message">{message}</p> : null}
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
