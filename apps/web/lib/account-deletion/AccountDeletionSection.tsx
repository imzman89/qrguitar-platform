"use client";

import { useEffect, useId, useRef, useState } from "react";
import { RefreshCw, ShieldCheck } from "lucide-react";
import { createDeletionIntakeClient, initialIntakeState, type IntakeAuth, type IntakeState } from "./deletion-intake-client";
import styles from "./account-deletion.module.css";

export default function AccountDeletionSection({ actorId, auth }: { actorId: string; auth: () => IntakeAuth }) {
  const controller = useRef<ReturnType<typeof createDeletionIntakeClient> | null>(null);
  const [state, setState] = useState(initialIntakeState);
  const [approved, setApproved] = useState("");
  const headingId = useId(), confirmationId = useId();
  const expectedActor = actorId.toLowerCase();
  // Parent context may change before effect cleanup. Never paint the old account.
  const view: IntakeState = !expectedActor ? { ...initialIntakeState(), phase: "signed-out" }
    : state.actorId && state.actorId !== expectedActor ? initialIntakeState() : state;
  const confirmationKey = view.confirmation ? `${expectedActor}:${view.confirmation.action}:${view.confirmation.requestId}:${view.confirmation.expectedRevision}` : "";
  const active = view.snapshot?.activeRequest, latest = active || view.snapshot?.latestRequest;
  const blocked = view.busy || view.refreshing || view.recoveryBlocked || Boolean(view.intent);

  useEffect(() => {
    setApproved("");
    const current = createDeletionIntakeClient({ actorId, auth });
    controller.current = current;
    const unsubscribe = current.subscribe(setState); setState(current.getState()); void current.start();
    return () => { unsubscribe(); current.dispose(); if (controller.current === current) controller.current = null; };
  }, [actorId, auth]);

  function prepare(action: "submit" | "cancel") {
    setApproved("");
    if (action === "submit") controller.current?.prepareSubmit(); else controller.current?.prepareCancel();
  }
  function dismiss() { setApproved(""); controller.current?.dismissConfirmation(); }
  function confirm() {
    if (!confirmationKey || approved !== confirmationKey) return;
    setApproved(""); void controller.current?.confirm();
  }

  return <section className={styles.section} aria-labelledby={headingId} aria-busy={view.busy || view.refreshing}>
    <div className={styles.header}><span className={styles.icon}><ShieldCheck size={22} aria-hidden="true" /></span><div><p className={styles.eyebrow}>Privacy &amp; Data</p><h2 id={headingId}>Request account deletion</h2></div></div>
    <p className={styles.intro}>Ask us to review removal of your personal information while preserving permanent instrument Profiles and factual history.</p>
    <p className={styles.explanation}>This sends a request for review. Submitting it does not delete your account or personal information.</p>

    {view.phase === "loading" && <p className={styles.muted} role="status">Checking your request status…</p>}
    {view.phase === "signed-out" && <div className={styles.notice}><p>Sign in to review or manage your own deletion request.</p><a className={styles.primary} href="/login?next=%2Faccount%3Fsection%3Dprivacy">Sign in</a></div>}
    {view.phase === "account-changed" && <div className={styles.notice} role="status"><p>Your signed-in account changed. Open the current account before continuing.</p><a className={styles.secondary} href="/account?section=privacy">Open current account</a></div>}

    {view.busy && <p className={styles.muted} role="status">Confirming your request action…</p>}
    {view.intent && !view.busy && <div className={styles.pending} role="status"><h3>{view.intent.action === "submit" ? "Request not confirmed" : "Cancellation not confirmed"}</h3><p>Retry to finish or check the same action.</p><button className={styles.primary} type="button" disabled={view.refreshing || view.recoveryBlocked} onClick={() => void controller.current?.retry()}>{view.intent.action === "submit" ? "Retry same submission" : "Retry same cancellation"}</button><details className={styles.referenceDetails}><summary>Action reference</summary><code>{view.intent.operationId}</code></details></div>}
    {view.recoveryBlocked && <div className={styles.notice} role="alert"><h3>Request recovery unavailable</h3><p>Status is still available. Restore site storage access, then refresh before sending an action. If this continues, <a href="/contact">contact support</a>.</p></div>}

    {view.error && <p className={styles.error} role="alert">{view.error}</p>}
    {view.feedback && <p className={styles.feedback} role="status">{view.feedback}</p>}

    {view.phase === "ready" && view.snapshot && <>
      {latest ? <div className={styles.request}>
        <div className={styles.requestHeading}><h3>{active ? "Request received" : "Request cancelled"}</h3><span className={active ? styles.requested : styles.cancelled}>{active ? "Requested" : "Cancelled"}</span></div>
        <p>{active ? "Your personal-information deletion request is awaiting review. The request preserves the direction to keep instrument history." : "This deletion request is no longer active. No account or personal information was deleted by this request flow."}</p>
        <dl><div><dt>Request reference</dt><dd><code>{latest.requestId}</code></dd></div><div><dt>Requested</dt><dd><time dateTime={latest.requestedAt}>{new Date(latest.requestedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</time></dd></div>{latest.cancelledAt && <div><dt>Cancelled</dt><dd><time dateTime={latest.cancelledAt}>{new Date(latest.cancelledAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</time></dd></div>}</dl>
      </div> : !view.intent && <p className={styles.muted}>You have no recorded deletion request.</p>}

      {!view.confirmation && !view.intent && <div className={styles.actions}>{active
        ? <button className={styles.secondary} type="button" disabled={blocked} onClick={() => prepare("cancel")}>Cancel deletion request</button>
        : <button className={styles.primary} type="button" disabled={blocked} onClick={() => prepare("submit")}>{latest ? "Request another review" : "Request deletion review"}</button>}</div>}

      {view.confirmation && <div className={styles.confirmation}>
        <h3>{view.confirmation.action === "submit" ? "Confirm your review request" : "Cancel this request?"}</h3>
        <p>{view.confirmation.action === "submit" ? "You are asking for review of personal-information deletion while keeping instrument history. Submitting a request leaves your current account access unchanged." : "This stops the selected review request. It does not restore or change account data."}</p>
        {view.confirmation.action === "cancel" && <p className={styles.reference}>Request <code>{view.confirmation.requestId}</code></p>}
        <label className={styles.check} htmlFor={confirmationId}><input id={confirmationId} type="checkbox" checked={approved === confirmationKey} onChange={event => setApproved(event.target.checked ? confirmationKey : "")} />{view.confirmation.action === "submit" ? "I want to request review of deleting my personal information while preserving instrument history." : "I want to cancel this deletion request."}</label>
        <div className={styles.actions}><button className={styles.primary} type="button" disabled={blocked || approved !== confirmationKey} onClick={confirm}>{view.confirmation.action === "submit" ? "Confirm review request" : "Confirm cancellation"}</button><button className={styles.secondary} type="button" disabled={view.busy} onClick={dismiss}>Go back</button></div>
      </div>}
    </>}

    {view.actorId === expectedActor && (view.phase === "ready" || view.phase === "error") && <div className={styles.footer}><button className={styles.refresh} type="button" disabled={view.busy || view.refreshing} onClick={() => { setApproved(""); void controller.current?.reload(); }}><RefreshCw size={15} aria-hidden="true" />{view.refreshing ? "Refreshing status…" : "Refresh status"}</button><span>Refreshing checks status only.</span></div>}
    {view.phase === "error" && !view.actorId && <button className={styles.secondary} type="button" onClick={() => void controller.current?.reload()}>Retry sign-in check</button>}
  </section>;
}
