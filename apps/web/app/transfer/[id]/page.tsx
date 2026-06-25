"use client";

import { BadgeCheck, LogIn, Repeat2, ShieldCheck } from "lucide-react";
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
  saveDemoUser,
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
  const [account, setAccount] = useState<DemoUser>({
    name: "New owner",
    email: "buyer@example.com",
    role: "owner"
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
      role: "owner"
    };

    saveDemoUser(user);
    const accepted = acceptDemoTransfer(transfer.id, user);

    if (!accepted) {
      setMessage("This transfer is no longer available.");
      return;
    }

    setTransfer(accepted);
    setInstrument(findDemoInstrument(accepted.guitarQrCode));
    setMessage("Ownership accepted. This guitar is now attached to your local QRguitar account.");
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
              {transfer.feeCents === 0
                ? "This first-owner handoff is included with the seller's QRguitar code purchase. You do not pay a transfer fee, and the permanent QR link keeps working."
                : "This ownership handoff is marked as a paid transfer. The permanent QR link keeps working after the buyer accepts ownership."}
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
                <span>Fee</span>
                <strong>$0 included transfer</strong>
              </div>
            </div>
            <div className="claim-assurance">
              <span><ShieldCheck size={18} /> Permanent QR link stays the same</span>
              <span><BadgeCheck size={18} /> Builder provenance remains attached</span>
            </div>
          </section>

          <section className="card form auth-card">
            {transfer.status === "accepted" ? (
              <>
                <div className="icon"><BadgeCheck /></div>
                <h3>Ownership accepted.</h3>
                <p>This record now shows the new owner in the local demo data.</p>
                <Link className="button" href={profileHref}>
                  View Guitar Profile
                </Link>
                <Link className="button secondary" href="/dashboard">
                  Open Dashboard
                </Link>
              </>
            ) : (
              <>
                <div className="icon"><LogIn /></div>
                <h3>Create or confirm your account.</h3>
                <p>In the live app this will use secure email login. For today, enter the buyer details and accept.</p>
                <div className="field">
                  <label htmlFor="claimName">Your name</label>
                  <input
                    id="claimName"
                    value={account.name}
                    onChange={(event) => setAccount({ ...account, name: event.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="claimEmail">Your email</label>
                  <input
                    id="claimEmail"
                    type="email"
                    value={account.email}
                    onChange={(event) => setAccount({ ...account, email: event.target.value })}
                  />
                </div>
                <button className="button" type="button" onClick={acceptTransfer}>
                  Accept Ownership
                </button>
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
