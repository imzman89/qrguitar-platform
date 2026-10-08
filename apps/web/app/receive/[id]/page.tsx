"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Nav } from "../../../components/Nav";
import { Footer } from "../../../components/Footer";
import { createBrowserSupabaseClient } from "../../../lib/supabase-browser";
import { createEmailHandoffClient, type EmailHandoffState } from "../../../lib/email-handoff-client";
import { useAuthNavigation } from "../../../lib/use-auth-navigation";
import styles from "./receive.module.css";

export default function ReceiveProfilePage() {
  const { id } = useParams<{ id: string }>();
  const controller = useRef<ReturnType<typeof createEmailHandoffClient> | null>(null);
  const [state, setState] = useState<EmailHandoffState>({ phase: "checking", busy: false, signedIn: false, canAccept: false, uncertain: false, message: "", transfer: null, permanentPath: "" });
  const [email, setEmail] = useState(""), [code, setCode] = useState("");
  const { logout, signingOut, logoutError } = useAuthNavigation();
  useEffect(() => {
    setEmail(""); setCode("");
    try {
      const current = createEmailHandoffClient(String(id), createBrowserSupabaseClient(), setState);
      controller.current = current; void current.reload();
      return () => { current.dispose(); if (controller.current === current) controller.current = null; };
    } catch { setState(value => ({ ...value, phase: "unavailable", message: "Account access is temporarily unavailable. Please reload and try again." })); }
  }, [id]);
  const disabled = state.busy || signingOut || state.uncertain;
  const accepted = state.phase === "accepted";
  return <><Nav /><main className={styles.page}><section className={styles.sheet} aria-labelledby="receive-title">
    <span className={styles.eyebrow}>{accepted ? "Your instrument record" : "A Profile for your instrument"}</span>
    <h1 id="receive-title">{accepted ? "Yours to carry forward." : state.phase === "completed" ? "Its story continues." : state.transfer ? state.transfer.guitarName : "Keep its story with you."}</h1>
    <p className={styles.intro}>{state.transfer?.status === "cancelled" ? "This invitation is no longer available. Ask the seller for a new one." : accepted || state.phase === "completed" ? "The instrument, its identity, and its documented history remain connected." : "Accept the seller’s invitation. Your photos, service records, and instrument history stay together through every ownership change."}</p>
    {state.transfer ? <div className={styles.identity}><span>Permanent Profile</span><strong>{state.transfer.guitarQrCode}</strong></div> : null}
    {state.phase === "checking" ? <p role="status">Checking your invitation…</p> : accepted ? <div className={styles.actions}><Link className="button" href={state.transfer?.guitarQrCode ? "/dashboard/profile/" + encodeURIComponent(state.transfer.guitarQrCode) + "?returnTo=%2Fdashboard" : "/dashboard"}>Open your Profile</Link><Link className={styles.quietLink} href="/dashboard">Your collection</Link></div> : state.phase === "completed" ? <Link className="button secondary" href="/dashboard">Your collection</Link> : state.phase === "unavailable" ? <button className="button secondary" disabled={state.busy} onClick={() => void controller.current?.reload()}>Check invitation again</button> : state.canAccept ? <><button className="button" disabled={disabled} onClick={() => void controller.current?.accept()}>{state.busy ? "Accepting…" : "Accept this Profile"}</button><p className={styles.note}>Ownership moves to your signed-in account. The QRguitar ID, link, and history remain unchanged.</p></> : state.signedIn ? <button className="button secondary" disabled={disabled} onClick={async () => { if (await logout()) { setEmail(""); setCode(""); void controller.current?.reload(); } }}>Use the purchase email</button> : <form className={styles.form} onSubmit={event => { event.preventDefault(); void controller.current?.verifyAndAccept(email, code); }}>
      <label htmlFor="receive-email">Purchase email<input id="receive-email" type="email" autoComplete="email" required value={email} disabled={disabled} onChange={event => { setEmail(event.target.value); setCode(""); }} /></label>
      <label htmlFor="receive-code">One-time email code<input id="receive-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" minLength={6} maxLength={10} required value={code} disabled={disabled} onChange={event => setCode(event.target.value.replace(/\s/g, ""))} /></label>
      <button className="button" type="submit" disabled={disabled}>{state.busy ? "Checking…" : "Verify code and accept Profile"}</button>
      <button className={styles.resend} type="button" disabled={disabled || !email.trim()} onClick={() => void controller.current?.requestCode(email)}>Send a new email code</button>
      <p className={styles.note}>Your verified email becomes your account. No password is needed to accept this invitation.</p>
    </form>}
    {state.message ? <p className={styles.feedback} role="status" aria-live="polite">{state.message}</p> : null}
    {state.uncertain ? <button className="button secondary" disabled={state.busy} onClick={() => void controller.current?.reload()}>Check saved ownership status</button> : null}
    {state.signedIn && (state.phase === "ready" || state.phase === "email") && !state.canAccept && !state.uncertain ? <button className="button secondary" disabled={state.busy} onClick={() => void controller.current?.reload()}>Check invitation again</button> : null}
    {logoutError ? <p role="alert">{logoutError}</p> : null}
    <Link className={styles.exit} href="/">QRguitar</Link>
  </section></main><Footer /></>;
}
