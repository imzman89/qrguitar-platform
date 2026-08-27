"use client";

import { BadgeCheck, Copy, LogIn, Repeat2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Footer } from "../../../components/Footer";
import { Nav } from "../../../components/Nav";
import { transferStatusLabel, type DemoTransfer } from "../../../lib/local-demo";
import { createBrowserSupabaseClient, getSupabaseAccessToken } from "../../../lib/supabase-browser";

type TransferPayload = {
  ok?: boolean;
  message?: string;
  transfer?: DemoTransfer;
  permanentPath?: string;
  requiresSignIn?: boolean;
};

export default function TransferClaimPage() {
  const params = useParams<{ id: string }>();
  const transferId = String(params.id || "");
  const [transfer, setTransfer] = useState<DemoTransfer | null>(null);
  const [permanentPath, setPermanentPath] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadTransfer() {
      setLoading(true);
      const supabase = createBrowserSupabaseClient();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token || "";
      const response = await fetch(`/api/transfers?id=${encodeURIComponent(transferId)}`, {
        headers: token ? { authorization: `Bearer ${token}` } : undefined
      });
      const payload = (await response.json().catch(() => null)) as TransferPayload | null;

      if (cancelled) {
        return;
      }

      setSignedIn(Boolean(data.session?.user));
      if (!response.ok || !payload?.ok || !payload.transfer) {
        setTransfer(null);
        setMessage(payload?.message || "This claim link was not found.");
      } else {
        setTransfer(payload.transfer);
        setMessage("");
      }
      setLoading(false);
    }

    void loadTransfer();

    return () => {
      cancelled = true;
    };
  }, [transferId]);

  const profileHref = useMemo(() => {
    if (permanentPath) {
      return permanentPath;
    }

    return transfer?.guitarQrCode ? `/i/${transfer.guitarQrCode}` : "/dashboard";
  }, [permanentPath, transfer?.guitarQrCode]);

  async function acceptTransfer() {
    if (!transfer) {
      return;
    }

    setAccepting(true);
    setMessage("");
    try {
      const token = await getSupabaseAccessToken();
      const response = await fetch("/api/transfers", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ id: transfer.id, action: "accept" })
      });
      const payload = (await response.json().catch(() => null)) as TransferPayload | null;

      if (!response.ok || !payload?.ok || !payload.transfer) {
        setMessage(payload?.message || "Could not accept this transfer.");
        return;
      }

      setTransfer(payload.transfer);
      setPermanentPath(payload.permanentPath || "");
      setMessage(payload.message || "Ownership accepted. The permanent QRguitar URL stayed the same.");
    } finally {
      setAccepting(false);
    }
  }

  async function copyProfileLink() {
    if (typeof window === "undefined") {
      return;
    }

    await window.navigator.clipboard?.writeText(`${window.location.origin}${profileHref}`);
    setMessage("Profile link copied.");
  }

  if (loading) {
    return (
      <>
        <Nav />
        <main className="section auth-page">
          <div className="shell auth-layout">
            <section className="card auth-card">
              <div className="eyebrow">Ownership transfer</div>
              <h1>Checking claim link.</h1>
              <p>Loading this ownership transfer now.</p>
            </section>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  if (!transfer) {
    return (
      <>
        <Nav />
        <main className="section auth-page">
          <div className="shell auth-layout">
            <section className="card auth-card">
              <div className="eyebrow">Ownership transfer</div>
              <h1>This claim link was not found.</h1>
              <p>Ask the seller, builder, or shop to create a fresh QRguitar ownership transfer link.</p>
              <Link className="button" href="/dashboard">
                Go to Dashboard
              </Link>
              {message ? <p className="form-message">{message}</p> : null}
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
                ? "This claim has already been accepted. The permanent QR link stays with the instrument."
                : transfer.status === "cancelled"
                  ? "This transfer was cancelled. Ask the current owner for a fresh transfer link."
                  : "Sign in with the recipient email on this transfer to accept ownership. The QRguitar URL will not change."}
            </p>
            <div className="transfer-summary card">
              <div className="icon">
                <Repeat2 />
              </div>
              <div>
                <span>Record</span>
                <strong>{transfer.guitarName}</strong>
              </div>
              <div>
                <span>QRguitar ID</span>
                <strong>{transfer.guitarQrCode}</strong>
              </div>
              <div>
                <span>Status</span>
                <strong>{transferStatusLabel(transfer)}</strong>
              </div>
            </div>
            <div className="claim-assurance">
              <span><ShieldCheck size={18} /> Permanent QR link stays the same</span>
              <span><BadgeCheck size={18} /> Recipient must be signed in</span>
            </div>
          </section>

          <section className="card form auth-card">
            {transfer.status === "accepted" ? (
              <>
                <div className="icon"><BadgeCheck /></div>
                <h3>Ownership accepted.</h3>
                <p>This Profile now belongs to the accepting account and keeps the same permanent QRguitar link.</p>
                <Link className="button" href={profileHref}>
                  View Profile
                </Link>
                <button className="button secondary" type="button" onClick={() => void copyProfileLink()}>
                  <Copy size={16} />
                  Copy Record Link
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
                  View Profile
                </Link>
              </>
            ) : !signedIn ? (
              <>
                <div className="icon"><LogIn /></div>
                <h3>Sign in to accept ownership.</h3>
                <p>Create an account or sign in with the recipient email on this transfer. Then return to this claim link to accept it.</p>
                <Link className="button" href={`/login?next=${encodeURIComponent(`/transfer/${transfer.id}`)}`}>
                  Sign in
                </Link>
                <Link className="button secondary" href={`/login?next=${encodeURIComponent(`/transfer/${transfer.id}`)}`}>
                  Create account
                </Link>
              </>
            ) : (
              <>
                <div className="icon"><LogIn /></div>
                <h3>Ready to accept.</h3>
                <p>Accepting transfers ownership of this QRguitar Profile to your signed-in account. The permanent QR URL stays unchanged.</p>
                <button className="button" type="button" onClick={() => void acceptTransfer()} disabled={accepting}>
                  {accepting ? "Accepting..." : "Accept Ownership"}
                </button>
                <Link className="button secondary" href={profileHref}>
                  Preview Profile First
                </Link>
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
