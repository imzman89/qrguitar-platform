"use client";
import { useUiText } from "../../../components/UiTextProvider";


import workflow from "../../../components/WorkflowWorkspace.module.css";
import { BadgeCheck, Copy, LogIn, Repeat2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Footer } from "../../../components/Footer";
import { Nav } from "../../../components/Nav";
import { transferStatusLabel, type DemoTransfer } from "../../../lib/local-demo";
import { createBrowserSupabaseClient, getSupabaseAccessToken } from "../../../lib/supabase-browser";
import { dispatchOptionalTrackingProductEvent, optionalTrackingProductEvents } from "../../../lib/optional-tracking-consent";
import { useAuthNavigation } from "../../../lib/use-auth-navigation";

type TransferPayload = {
  ok?: boolean;
  message?: string;
  transfer?: DemoTransfer;
  permanentPath?: string;
  requiresSignIn?: boolean;
};

export default function TransferClaimPage() {
  const ui = useUiText("app.transfer.id.page");
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
  const feedbackRevision = useRef(0);
  const acceptMutation = useRef<{ revision: number } | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [acceptUncertain, setAcceptUncertain] = useState(false);
  const uncertainLock = useRef(false);
  const acceptController = useRef<AbortController | null>(null);
  const { logout: logoutForSwitch, signingOut: switchingAccount, logoutError: switchError } = useAuthNavigation();
  const renderedAuthRevision = authRevision.current;

  async function switchRecipientAccount() {
    if (renderedAuthRevision !== authRevision.current || accepting || acceptMutation.current || switchingAccount) return;
    if (await logoutForSwitch()) window.location.assign(`/login?next=${encodeURIComponent(`/transfer/${transferId}`)}`);
  }

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
      clearTimeout(authTimer); controller?.abort(); acceptController.current?.abort(); unsubscribe();
    }
    let supabase: ReturnType<typeof createBrowserSupabaseClient>;
    try { supabase = createBrowserSupabaseClient(); }
    catch { failSession("Account access is temporarily unavailable. Try again."); return cleanup; }
    async function loadTransfer(token: string, hasSession: boolean) {
      if (cancelled) return;
      authResolved = true; clearTimeout(authTimer);
      const request = ++generation;
      authRevision.current++;
      if (acceptMutation.current) { uncertainLock.current = true; setAcceptUncertain(true); }
      acceptController.current?.abort();
      setAccepting(false);
      controller?.abort();
      const requestController = new AbortController();
      controller = requestController;
      const timer = setTimeout(() => {
        requestController.abort();
        if (!cancelled && request === generation) {
          setLoadError(true); setMessage(ui("ui.app.transfer.id.page.fdee411bbf65", "Loading this transfer took too long. Try again.")); setLoading(false);
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
          setRequiresAccess(true); setMessage(ui("ui.app.transfer.id.page.68c903e92912", "Use the recipient account or the current owner account to view this handoff."));
        } else if (!response.ok || !payload?.ok || !payload.transfer || payload.transfer.id !== transferId || !["sent", "accepted", "cancelled"].includes(payload.transfer.status)) {
          setMessage(payload?.message || ui("ui.app.transfer.id.page.34e5b6deb1c9", "We could not load this transfer.")); setLoadError(response.status >= 500 || response.ok);
        } else {
          setTransfer(payload.transfer); setMessage("");
          if (!acceptMutation.current) { uncertainLock.current = false; setAcceptUncertain(false); }
          else setLoadError(true);
        }
      } catch {
        if (!cancelled && request === generation && !requestController.signal.aborted) {
          setLoadError(true); setMessage(ui("ui.app.transfer.id.page.66e1da988511", "We could not load this transfer. Check your connection and try again."));
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
    if (renderedAuthRevision !== authRevision.current || !signedIn || !transfer || transfer.id !== transferId || transfer.status !== "sent" || accepting || uncertainLock.current || acceptMutation.current) {
      return;
    }

    const revision = renderedAuthRevision;
    const mutation = { revision }; acceptMutation.current = mutation;
    const feedback = ++feedbackRevision.current;
    setAccepting(true);
    setMessage("");
    const controller = new AbortController(); acceptController.current = controller;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let abort = () => {};
    try {
      const payload = await Promise.race([Promise.resolve().then(async () => {
      const token = await getSupabaseAccessToken();
      if (authRevision.current !== revision || controller.signal.aborted) throw new Error("Interrupted");
      const response = await fetch("/api/transfers", {
        method: "PATCH",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ id: transfer.id, action: "accept" })
      });
      const payload = (await response.json().catch(() => null)) as TransferPayload | null;
      if (authRevision.current !== revision || controller.signal.aborted) throw new Error("Interrupted");
      if (response.status >= 500 || response.status === 408 || (response.ok && (!payload?.ok || payload.transfer?.id !== transfer.id || payload.transfer.status !== "accepted"))) throw new Error("Unconfirmed");
      if (!response.ok || !payload?.ok || !payload.transfer) {
        if (feedbackRevision.current === feedback) setMessage(payload?.message || ui("ui.app.transfer.id.page.d311b7c2186b", "Could not accept this transfer."));
        return null;
      }
      return payload;
      }), new Promise<never>((_, reject) => {
        abort = () => reject(new Error("Unconfirmed"));
        controller.signal.addEventListener("abort", abort, { once: true });
        timeout = setTimeout(() => controller.abort(), 20000);
      })]);
      if (authRevision.current !== revision || controller.signal.aborted || !payload?.transfer) return;

      setTransfer(payload.transfer);
      setPermanentPath(payload.permanentPath || "");
      if (payload.transfer.status === "accepted") {
        void dispatchOptionalTrackingProductEvent({
          name: optionalTrackingProductEvents.ownershipTransferCompleted,
          properties: { method: "email_link" }
        }, { dedupeKey: payload.transfer.id });
      }
      if (feedbackRevision.current === feedback) setMessage(payload.message || ui("ui.app.transfer.id.page.60ae02829abd", "Ownership accepted. The permanent QRguitar URL stayed the same."));
    } catch {
      if (authRevision.current !== revision) return;
      uncertainLock.current = true; setAcceptUncertain(true);
      setLoadError(true);
      if (feedbackRevision.current === feedback) setMessage(ui("ui.app.transfer.id.page.dbf639836efe", "We could not confirm the transfer. Reload its status before trying again."));
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
      controller.signal.removeEventListener("abort", abort);
      if (acceptController.current === controller) acceptController.current = null;
      if (acceptMutation.current === mutation) acceptMutation.current = null;
      if (authRevision.current === revision) setAccepting(false);
    }
  }

  async function copyProfileLink() {
    if (renderedAuthRevision !== authRevision.current || transfer?.id !== transferId || typeof window === "undefined" || accepting || acceptMutation.current?.revision === authRevision.current) {
      return;
    }

    const revision = authRevision.current;
    const feedback = ++feedbackRevision.current;
    const current = () => authRevision.current === revision && feedbackRevision.current === feedback;
    setMessage("");
    try {
      if (!window.navigator.clipboard) throw new Error("Clipboard unavailable");
      await window.navigator.clipboard.writeText(`${window.location.origin}${profileHref}`);
      if (current()) setMessage(ui("ui.app.transfer.id.page.3a1b86ed2e8b", "Profile link copied."));
    } catch {
      if (current()) setMessage(ui("ui.app.transfer.id.page.6f055fbdab66", "Could not copy the link. Open the Profile and copy its address from your browser."));
    }
  }

  if (loading) {
    return (
      <>
        <Nav />
        <main className={`section auth-page ${workflow.transfer}`}>
          <div className="shell auth-layout">
            <section className="card auth-card">
              <div className="eyebrow">{ui("ui.app.transfer.id.page.cbfa6a5b513b", "Ownership transfer")}</div>
              <h1>{ui("ui.app.transfer.id.page.779107766b60", "Checking claim link.")}</h1>
              <p>{ui("ui.app.transfer.id.page.b9077ab4b6f2", "Loading this ownership transfer now.")}</p>
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
        <main className={`section auth-page ${workflow.transfer}`}>
          <div className="shell auth-layout">
            <section className="card auth-card">
              <div className="eyebrow">{ui("ui.app.transfer.id.page.cbfa6a5b513b", "Ownership transfer")}</div>
              <h1>{loadError ? ui("ui.app.transfer.id.page.64384260ddf0", "Unable to load this transfer") : requiresAccess ? ui("ui.app.transfer.id.page.06ca975631d1", "Sign in with the recipient account") : ui("ui.app.transfer.id.page.ba00298cf2c9", "This transfer is unavailable")}</h1>
              <p>{loadError ? ui("ui.app.transfer.id.page.42c72206d5cf", "Your instrument and transfer have not been changed by this check.") : ui("ui.app.transfer.id.page.227180c6db35", "Check the link and the account you are signed in to, or ask the current owner for help.")}</p>
              {loadError ? <button type="button" className="button" onClick={() => { if (renderedAuthRevision === authRevision.current) setLoadAttempt(value => value + 1); }}>{ui("ui.app.transfer.id.page.d8b8392e2c54", "Try again")}</button> : null}
              {!signedIn ? <Link className="button" href={"/login?next=" + encodeURIComponent("/transfer/" + transferId)}>{ui("ui.app.transfer.id.page.bfd402b2f6f3", "Sign in")}</Link> : null}
              {requiresAccess && signedIn ? <button type="button" className="button" disabled={switchingAccount} onClick={() => void switchRecipientAccount()}>{switchingAccount ? ui("ui.app.transfer.id.page.switchingAccount", "Signing out...") : ui("ui.app.transfer.id.page.useAnotherAccount", "Use another account")}</button> : null}
              {requiresAccess && signedIn ? <p>{ui("ui.app.transfer.id.page.switchAccountHint", "This signs you out first, then returns you to this transfer after you sign in with the recipient account.")}</p> : null}
              {switchError ? <p className="form-message" role="alert">{switchError}</p> : null}
              <Link className="button secondary" href="/dashboard">{ui("ui.app.transfer.id.page.73aefc65d247", "Go to Dashboard")}</Link>
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
      <main className={`section auth-page ${workflow.transfer}`}>
        <div className="shell transfer-claim-layout">
          <section>
            <div className="eyebrow">{ui("ui.app.transfer.id.page.cbfa6a5b513b", "Ownership transfer")}</div>
            <h1>{transfer.status === "accepted"
              ? ui("ui.app.transfer.id.page.acceptedHeadline", "Ownership accepted for")
              : transfer.status === "cancelled"
                ? ui("ui.app.transfer.id.page.cancelledHeadline", "Ownership transfer cancelled for")
                : ui("ui.app.transfer.id.page.a8c70c41dc7c", "Accept ownership of")}{" "}{transfer.guitarName}.</h1>
            <p>
              {transfer.status === "accepted"
                ? ui("ui.app.transfer.id.page.2ff08141880b", "This transfer has already been accepted. The permanent QR link stays with the instrument.")
                : transfer.status === "cancelled"
                  ? ui("ui.app.transfer.id.page.907670850268", "This transfer was cancelled. Ask the current owner for a fresh transfer link.")
                  : ui("ui.app.transfer.id.page.723adcd00002", "Sign in with the recipient email on this transfer to accept ownership. The QRguitar URL will not change.")}
            </p>
            <div className="transfer-summary card">
              <div className="icon">
                <Repeat2 />
              </div>
              <div>
                <span>{ui("ui.app.transfer.id.page.d696a35bdd18", "Profile")}</span>
                <strong>{transfer.guitarName}</strong>
              </div>
              <div>
                <span>{ui("ui.app.transfer.id.page.a6c8f92c19f4", "QRguitar ID")}</span>
                <strong>{transfer.guitarQrCode}</strong>
              </div>
              <div>
                <span>{ui("ui.app.transfer.id.page.920e413c7d41", "Status")}</span>
                <strong>{transferStatusLabel(transfer)}</strong>
              </div>
            </div>
            <div className="claim-assurance">
              <span><ShieldCheck size={18} />{" "}{ui("ui.app.transfer.id.page.63fab8557311", "Permanent QR link stays the same")}</span>
              <span><BadgeCheck size={18} />{" "}{ui("ui.app.transfer.id.page.8e8a07a66720", "Recipient must be signed in")}</span>
            </div>
          </section>

          <section className="card form auth-card">
            {transfer.status === "accepted" ? (
              <>
                <div className="icon"><BadgeCheck /></div>
                <h3>{ui("ui.app.transfer.id.page.85595a4753c6", "Ownership accepted.")}</h3>
                <p>{ui("ui.app.transfer.id.page.ca9a513b8ad6", "This Profile now belongs to the accepting account and keeps the same permanent QRguitar link.")}</p>
                <Link className="button" href="/dashboard">{ui("ui.app.transfer.id.page.f6a3dab2fa61", "Open Dashboard")}</Link>
                <button className="button secondary" type="button" disabled={accepting} onClick={() => void copyProfileLink()}>
                  <Copy size={16} />{ui("ui.app.transfer.id.page.8b812d5b9e9b", "Copy Profile Link")}</button>
                <p>{ui("ui.app.transfer.id.page.completedAccountHint", "The new owner can manage this Profile from their Dashboard. Previous owners no longer have access to its private details.")}</p>
              </>
            ) : transfer.status === "cancelled" ? (
              <>
                <div className="icon"><Repeat2 /></div>
                <h3>{ui("ui.app.transfer.id.page.8b1575320b31", "This transfer was cancelled.")}</h3>
                <p>{ui("ui.app.transfer.id.page.02adc8f89c56", "The current owner needs to create a new transfer link before this instrument can be handed off.")}</p>
                <Link className="button" href={profileHref}>{ui("ui.app.transfer.id.page.41a634bed373", "View Profile")}</Link>
              </>
            ) : !signedIn ? (
              <>
                <div className="icon"><LogIn /></div>
                <h3>{ui("ui.app.transfer.id.page.0da9392c3f27", "Sign in to accept ownership.")}</h3>
                <p>{ui("ui.app.transfer.id.page.33706bc1fbce", "Create an account or sign in with the recipient email on this transfer. Then return to this transfer link to accept it.")}</p>
                <Link className="button" href={`/login?next=${encodeURIComponent(`/transfer/${transfer.id}`)}`}>{ui("ui.app.transfer.id.page.bfd402b2f6f3", "Sign in")}</Link>
                <Link className="button secondary" href={`/login?mode=register&next=${encodeURIComponent(`/transfer/${transfer.id}`)}`}>{ui("ui.app.transfer.id.page.798ca2ce18bf", "Create account")}</Link>
              </>
            ) : (
              <>
                <div className="icon"><LogIn /></div>
                <h3>{ui("ui.app.transfer.id.page.730cc4aa8fa6", "Ready to accept.")}</h3>
                <p>{ui("ui.app.transfer.id.page.cf41c2f3aef3", "Accepting transfers ownership of this QRguitar Profile to your signed-in account. The permanent QR URL stays unchanged.")}</p>
                <button className="button" type="button" onClick={() => void acceptTransfer()} disabled={accepting || acceptUncertain}>
                  {accepting ? ui("ui.app.transfer.id.page.31409c77894f", "Accepting...") : ui("ui.app.transfer.id.page.8441cefbd0ef", "Accept Ownership")}
                </button>
                <Link className="button secondary" href={profileHref}>{ui("ui.app.transfer.id.page.d52572393b42", "Preview Profile First")}</Link>
              </>
            )}
            {message ? <p className="form-message" role="status">{message}</p> : null}
            {loadError ? <button type="button" className="button secondary" onClick={() => { if (renderedAuthRevision === authRevision.current) setLoadAttempt(value => value + 1); }}>{ui("ui.app.transfer.id.page.a5e2e77428e7", "Reload transfer status")}</button> : null}
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
