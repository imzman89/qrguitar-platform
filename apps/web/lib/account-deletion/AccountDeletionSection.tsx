"use client";
import { useUiText } from "../../components/UiTextProvider";


import { useEffect, useId, useRef, useState } from "react";
import { RefreshCw, ShieldCheck } from "lucide-react";
import { createDeletionIntakeClient, initialIntakeState, type IntakeAuth, type IntakeState } from "./deletion-intake-client";
import styles from "./account-deletion.module.css";

export default function AccountDeletionSection({ actorId, auth }: { actorId: string; auth: () => IntakeAuth }) {
  const ui = useUiText("lib.account.deletion.AccountDeletionSection");
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
  const fulfillment = view.snapshot?.fulfillment;
  const cancellationLocked = fulfillment?.state === "quiescing_storage" || fulfillment?.state === "ready_for_auth_deletion";
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
    <div className={styles.header}><span className={styles.icon}><ShieldCheck size={22} aria-hidden="true" /></span><div><p className={styles.eyebrow}>{ui("ui.lib.account.deletion.AccountDeletionSection.ade3e28bc653", "Privacy & Data")}</p><h2 id={headingId}>{ui("ui.lib.account.deletion.AccountDeletionSection.6914ba38bf46", "Request account deletion")}</h2></div></div>
    <p className={styles.intro}>{ui("ui.lib.account.deletion.AccountDeletionSection.cea974129f65", "Ask us to review removal of your personal information while preserving permanent instrument Profiles and factual history.")}</p>
    <p className={styles.explanation}>{ui("ui.lib.account.deletion.AccountDeletionSection.e00f97d66b3c", "This sends a request for review. Submitting it does not delete your account or personal information.")}</p>

    {view.phase === "loading" && <p className={styles.muted} role="status">{ui("ui.lib.account.deletion.AccountDeletionSection.ad202c3d2a9a", "Checking your request status…")}</p>}
    {view.phase === "signed-out" && <div className={styles.notice}><p>{ui("ui.lib.account.deletion.AccountDeletionSection.05b1b03a62ae", "Sign in to review or manage your own deletion request.")}</p><a className={styles.primary} href="/login?next=%2Faccount%3Fsection%3Dprivacy">{ui("ui.lib.account.deletion.AccountDeletionSection.bfd402b2f6f3", "Sign in")}</a></div>}
    {view.phase === "account-changed" && <div className={styles.notice} role="status"><p>{ui("ui.lib.account.deletion.AccountDeletionSection.85619e51261a", "Your signed-in account changed. Open the current account before continuing.")}</p><a className={styles.secondary} href="/account?section=privacy">{ui("ui.lib.account.deletion.AccountDeletionSection.b1c630f317ed", "Open current account")}</a></div>}

    {view.busy && <p className={styles.muted} role="status">{ui("ui.lib.account.deletion.AccountDeletionSection.703768ef7366", "Confirming your request action…")}</p>}
    {view.intent && !view.busy && <div className={styles.pending} role="status"><h3>{view.intent.action === "submit" ? ui("ui.lib.account.deletion.AccountDeletionSection.fb77f71f37c4", "Request not confirmed") : ui("ui.lib.account.deletion.AccountDeletionSection.0f2d057ac075", "Cancellation not confirmed")}</h3><p>{ui("ui.lib.account.deletion.AccountDeletionSection.ce678498e948", "Retry to finish or check the same action.")}</p><button className={styles.primary} type="button" disabled={view.refreshing || view.recoveryBlocked} onClick={() => void controller.current?.retry()}>{view.intent.action === "submit" ? ui("ui.lib.account.deletion.AccountDeletionSection.3dbca56138ea", "Retry same submission") : ui("ui.lib.account.deletion.AccountDeletionSection.d0bc4f1c409d", "Retry same cancellation")}</button><details className={styles.referenceDetails}><summary>{ui("ui.lib.account.deletion.AccountDeletionSection.366e6e4e1dd4", "Action reference")}</summary><code>{view.intent.operationId}</code></details></div>}
    {view.recoveryBlocked && <div className={styles.notice} role="alert"><h3>{ui("ui.lib.account.deletion.AccountDeletionSection.05863f5bcc2d", "Request recovery unavailable")}</h3><p>{ui("ui.lib.account.deletion.AccountDeletionSection.bc07e3ed87b7", "Status is still available. Restore site storage access, then refresh before sending an action. If this continues,")}{" "}<a href="/contact">{ui("ui.lib.account.deletion.AccountDeletionSection.d80b08242b0c", "contact support")}</a>.</p></div>}

    {view.error && <p className={styles.error} role="alert">{view.error}</p>}
    {view.feedback && <p className={styles.feedback} role="status">{view.feedback}</p>}

    {view.phase === "ready" && view.snapshot && <>
      {latest ? <div className={styles.request}>
        <div className={styles.requestHeading}><h3>{active ? ui("ui.lib.account.deletion.AccountDeletionSection.4f2273f73624", "Request received") : ui("ui.lib.account.deletion.AccountDeletionSection.7108183f1888", "Request cancelled")}</h3><span className={active ? styles.requested : styles.cancelled}>{active ? ui("ui.lib.account.deletion.AccountDeletionSection.2d9e28289fac", "Requested") : ui("ui.lib.account.deletion.AccountDeletionSection.d353a99eb455", "Cancelled")}</span></div>
        <p>{active ? fulfillment?.state === "quiescing_storage"
          ? ui("ui.lib.account.deletion.AccountDeletionSection.7f8d29af322d", "Account writes are frozen and public content is hidden while the storage safety window drains{{value1}}. This request can no longer be cancelled.", { value1: fulfillment.storageQuiesceUntil ? ` until ${new Date(fulfillment.storageQuiesceUntil).toLocaleString()}` : "" })
          : fulfillment?.state === "ready_for_auth_deletion"
            ? ui("ui.lib.account.deletion.AccountDeletionSection.ad8878cbfeaf", "Database personal-information removal is complete and sign-in deletion is being reconciled. This request can no longer be cancelled.")
            : ui("ui.lib.account.deletion.AccountDeletionSection.bebef336a8e6", "Your personal-information deletion request is awaiting review. The request preserves the direction to keep instrument history.")
          : ui("ui.lib.account.deletion.AccountDeletionSection.fd56ab71296e", "This deletion request is no longer active. No account or personal information was deleted by this request flow.")}</p>
        <dl><div><dt>{ui("ui.lib.account.deletion.AccountDeletionSection.28302fc68b7f", "Request reference")}</dt><dd><code>{latest.requestId}</code></dd></div><div><dt>{ui("ui.lib.account.deletion.AccountDeletionSection.2d9e28289fac", "Requested")}</dt><dd><time dateTime={latest.requestedAt}>{new Date(latest.requestedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</time></dd></div>{latest.cancelledAt && <div><dt>{ui("ui.lib.account.deletion.AccountDeletionSection.d353a99eb455", "Cancelled")}</dt><dd><time dateTime={latest.cancelledAt}>{new Date(latest.cancelledAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</time></dd></div>}</dl>
      </div> : !view.intent && <p className={styles.muted}>{ui("ui.lib.account.deletion.AccountDeletionSection.ba315b2930f7", "You have no recorded deletion request.")}</p>}

      {!view.confirmation && !view.intent && <div className={styles.actions}>{active && !cancellationLocked
        ? <button className={styles.secondary} type="button" disabled={blocked} onClick={() => prepare("cancel")}>{ui("ui.lib.account.deletion.AccountDeletionSection.c6869022ffb1", "Cancel deletion request")}</button>
        : !active ? <button className={styles.primary} type="button" disabled={blocked} onClick={() => prepare("submit")}>{latest ? ui("ui.lib.account.deletion.AccountDeletionSection.56028ffdcd1e", "Request another review") : ui("ui.lib.account.deletion.AccountDeletionSection.fb70d5541e6a", "Request deletion review")}</button> : null}</div>}

      {view.confirmation && <div className={styles.confirmation}>
        <h3>{view.confirmation.action === "submit" ? ui("ui.lib.account.deletion.AccountDeletionSection.94b33ef05ab1", "Confirm your review request") : ui("ui.lib.account.deletion.AccountDeletionSection.1046a5651648", "Cancel this request?")}</h3>
        <p>{view.confirmation.action === "submit" ? ui("ui.lib.account.deletion.AccountDeletionSection.00abec7b9ab5", "You are asking for review of personal-information deletion while keeping instrument history. Submitting a request leaves your current account access unchanged.") : ui("ui.lib.account.deletion.AccountDeletionSection.9e36292d48f8", "This stops the selected review request. It does not restore or change account data.")}</p>
        {view.confirmation.action === "cancel" && <p className={styles.reference}>{ui("ui.lib.account.deletion.AccountDeletionSection.59f03d642b41", "Request")}{" "}<code>{view.confirmation.requestId}</code></p>}
        <label className={styles.check} htmlFor={confirmationId}><input id={confirmationId} type="checkbox" checked={approved === confirmationKey} onChange={event => setApproved(event.target.checked ? confirmationKey : "")} />{view.confirmation.action === "submit" ? ui("ui.lib.account.deletion.AccountDeletionSection.e03623406120", "I want to request review of deleting my personal information while preserving instrument history.") : ui("ui.lib.account.deletion.AccountDeletionSection.6a2ad5ceaaa7", "I want to cancel this deletion request.")}</label>
        <div className={styles.actions}><button className={styles.primary} type="button" disabled={blocked || approved !== confirmationKey} onClick={confirm}>{view.confirmation.action === "submit" ? ui("ui.lib.account.deletion.AccountDeletionSection.629b254abba9", "Confirm review request") : ui("ui.lib.account.deletion.AccountDeletionSection.040f7f9e4c20", "Confirm cancellation")}</button><button className={styles.secondary} type="button" disabled={view.busy} onClick={dismiss}>{ui("ui.lib.account.deletion.AccountDeletionSection.6aadac2f2b7a", "Go back")}</button></div>
      </div>}
    </>}

    {view.actorId === expectedActor && (view.phase === "ready" || view.phase === "error") && <div className={styles.footer}><button className={styles.refresh} type="button" disabled={view.busy || view.refreshing} onClick={() => { setApproved(""); void controller.current?.reload(); }}><RefreshCw size={15} aria-hidden="true" />{view.refreshing ? ui("ui.lib.account.deletion.AccountDeletionSection.4279e5ed88f6", "Refreshing status…") : ui("ui.lib.account.deletion.AccountDeletionSection.442c4b893915", "Refresh status")}</button><span>{ui("ui.lib.account.deletion.AccountDeletionSection.574eb64ca776", "Refreshing checks status only.")}</span></div>}
    {view.phase === "error" && !view.actorId && <button className={styles.secondary} type="button" onClick={() => void controller.current?.reload()}>{ui("ui.lib.account.deletion.AccountDeletionSection.b72989690e0a", "Retry sign-in check")}</button>}
  </section>;
}
