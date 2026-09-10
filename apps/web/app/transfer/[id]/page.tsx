"use client";

import { BadgeCheck, Copy, LogIn, Repeat2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
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
  const [loadError, setLoadError] = useState(false);
  const [requiresAccess, setRequiresAccess] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const authRevision = useRef(0);
  const [signedIn, setSignedIn] = useState(false);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let generation = 0;
    let authResolved = false;
    let controller: AbortController | undefined;
    let unsubscribe = () => {};
    setLoading(true); setLoadError(false); setRequiresAccess(false);
    setTransfer(null); setPermanentPath(""); setSignedIn(false);
    const authTimer = setTimeout(() => failSession("Could not check your session in time. Try again."), 10000);
    function failSession(reason: string) {
      if (cancelled || authResolved) return;
      authResolved = true; generation++; authRevision.current++;
      clearTimeout(authTimer); controller?.abort();
      setAccepting(false); setLoadError(true); setMessage(reason); setLoading(false);
    }
    function cleanup() {
      cancelled = true; generation++; authRevision.current++;
      clearTimeout(authTimer); controller?.abort(); unsubscribe();
    }
    let supabase: ReturnType<typeof createBrowserSupabaseClient>;
    try { supabase = createBrowserSupabaseClient(); }
    catch { failSession("Account access is temporarily unavailable. Try again."); return cleanup; }
    async function loadTransfer(token: string, hasSession: boolean) {
      if (cancelled) return;
      authResolved = true; clearTimeout(authTimer);
      const request = ++generation;
      authRevision.current++;
      setAccepting(false);
      controller?.abort();
      const requestController = new AbortController();
      controller = requestController;
      const timer = setTimeout(() => {
        requestController.abort();
        if (!cancelled && request === generation) {
          setLoadError(true); setMessage("Loading this transfer took too long. Try again."); setLoading(false);
        }
      }, 20000);
      setLoading(true); setLoadError(false); setRequiresAccess(false);
      setTransfer(null); setPermanentPath(""); setSignedIn(hasSession);
      try {
        const response = await fetch("/api/transfers?id=" + encodeURIComponent(transferId), {
          cache: "no-store", headers: token ? { authorization: "Bearer " + token } : undefined, signal: requestController.signal
        });
        const payload = await response.json().catch(() => null) as TransferPayload | null;
        if (cancelled || request !== generation || requestController.signal.aborted) return;
        if (response.ok && payload?.requiresSignIn) {
          setRequiresAccess(true); setMessage("Use the recipient account or the current owner account to view this handoff.");
        } else if (!response.ok || !payload?.ok || !payload.transfer) {
          setMessage(payload?.message || "We could not load this transfer."); setLoadError(response.status >= 500 || response.ok);
        } else { setTransfer(payload.transfer); setMessage(""); }
      } catch {
        if (!cancelled && request === generation && !requestController.signal.aborted) {
          setLoadError(true); setMessage("We could not load this transfer. Check your connection and try again.");
        }
      } finally {
        clearTimeout(timer);
        if (!cancelled && request === generation) setLoading(false);
      }
    }
    try {
      void supabase.auth.getSession().then(({ data }) => {
        if (!cancelled && !authResolved) void loadTransfer(data.session?.access_token || "", Boolean(data.session?.user));
      }).catch(() => failSession("Could not check your session. Try again."));
      const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!cancelled) void loadTransfer(session?.access_token || "", Boolean(session?.user));
      });
      unsubscribe = () => listener.subscription.unsubscribe();
    } catch { failSession("Account access is temporarily unavailable. Try again."); }
    return cleanup;
  }, [transferId, loadAttempt]);

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

    const revision = authRevision.current;
    setAccepting(true);
    setMessage("");
    try {
      const token = await getSupabaseAccessToken();
      if (authRevision.current !== revision) return;
      const response = await fetch("/api/transfers", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ id: transfer.id, action: "accept" })
      });
      const payload = (await response.json().catch(() => null)) as TransferPayload | null;
      if (authRevision.current !== revision) return;

      if (!response.ok || !payload?.ok || !payload.transfer) {
        setMessage(payload?.message || "Could not accept this transfer.");
        return;
      }

      setTransfer(payload.transfer);
      setPermanentPath(payload.permanentPath || "");
      setMessage(payload.message || "Ownership accepted. The permanent QRguitar URL stayed the same.");
    } catch {
      if (authRevision.current !== revision) return;
      setLoadError(true);
      setMessage("We could not confirm the transfer. Reload its status before trying again.");
    } finally {
      if (authRevision.current === revision) setAccepting(false);
    }
  }

  async function copyProfileLink() {
    if (typeof window === "undefined") {
      return;
    }

    try {
      if (!window.navigator.clipboard) throw new Error("Clipboard unavailable");
      await window.navigator.clipboard.writeText(`${window.location.origin}${profileHref}`);
      setMessage("Profile link copied.");
    } catch {
      setMessage("Could not copy the link. Open the Profile and copy its address from your browser.");
    }
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
              <h1>{loadError ? "Unable to load this transfer" : requiresAccess ? "Sign in with the recipient account" : "This transfer is unavailable"}</h1>
              <p>{loadError ? "Your instrument and transfer have not been changed by this check." : "Check the link and the account you are signed in to, or ask the current owner for help."}</p>
              {loadError ? <button type="button" className="button" onClick={() => setLoadAttempt(value => value + 1)}>Try again</button> : null}
              {!signedIn ? <Link className="button" href={"/login?next=" + encodeURIComponent("/transfer/" + transferId)}>Sign in</Link> : null}
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
                <Link className="button" href={"/dashboard/profile/" + encodeURIComponent(transfer.guitarQrCode)}>
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
                <Link className="button secondary" href={`/login?mode=register&next=${encodeURIComponent(`/transfer/${transfer.id}`)}`}>
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
            {message ? <p className="form-message" role="status">{message}</p> : null}
            {loadError ? <button type="button" className="button secondary" onClick={() => setLoadAttempt(value => value + 1)}>Reload transfer status</button> : null}
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
