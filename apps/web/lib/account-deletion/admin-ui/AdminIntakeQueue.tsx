"use client";

import { useEffect, useRef, useState } from "react";
import { adminIntakeAuth } from "./admin-intake-auth";
import { createAdminIntakeClient, initialQueueState, type QueueAuth, type QueueState } from "./admin-intake-client";
import styles from "./admin-intake.module.css";

const blockerCopy: Record<string,string> = {
  administrator_account:"Transfer or remove administrator authority through a separately reviewed change.",
  unused_paid_credits:"Resolve the customer’s unused purchased credits or approved refund. Credits are never silently forfeited.",
  unresolved_payment_order:"Close or resolve the open payment order before retrying.",
  payment_hold_or_dispute:"Resolve the payment hold, refund, reversal, or dispute before retrying.",
  billing_retention_migration_required:"Apply a reviewed billing-retention pseudonymization migration; financial history is not erased or relinked automatically.",
  unused_profile_credits:"Resolve the account’s remaining Profile-credit balance before retrying.",
  storage_cleanup_required:"Review and remove or migrate the account-bound private files and storage receipts, then retry. No stored bytes are assumed deleted.",
  storage_quiescence_required:"Account writes are frozen and public content is hidden. Wait until the recorded storage deadline, then retry so QRguitar can rescan for uploads issued before the freeze.",
  active_ownership_transfer:"Finish or cancel the active ownership transfer before retrying.",
  active_ownership_claim:"Finish or cancel the active ownership claim before retrying.",
  active_service_workflow:"Finish or cancel the active service workflow before retrying.",
  service_record_migration_required:"Apply a reviewed service-record retention migration before retrying; approved instrument history must remain factual.",
  retained_personal_content_review_required:"Remove or privacy-migrate the recorded cross-account Site Editor or audit content, retain an audit receipt, then retry."
};

export function AdminIntakeQueueView({ state, onRefresh, onMore, onExecute }: { state: QueueState; onRefresh(): void; onMore(): void; onExecute(requestId:string): void }) {
  const visible = state.phase === "ready";
  return <section className={styles.queue} aria-labelledby="deletion-queue-title" aria-busy={state.busy}>
    <a className={styles.back} href="/admin">← Back to Admin</a>
    <header className={styles.heading}>
      <div><p className={styles.eyebrow}>Privacy operations</p><h1 id="deletion-queue-title">Deletion review requests</h1><p>Requests to remove personal information while preserving permanent instrument Profiles and factual history.</p></div>
      <span className={styles.mode}>Reviewed fulfillment</span>
    </header>
    <div className={styles.toolbar}>
      <p>{visible ? <><strong>{state.requests.length}</strong> pending request{state.requests.length === 1 ? "" : "s"} loaded · Newest first</> : "Current administrator access is required."}</p>
      <button className={styles.button} type="button" disabled={state.busy} onClick={onRefresh}>{state.busy ? "Checking queue…" : "Refresh queue"}</button>
    </div>
    {state.phase === "loading" && <p className={styles.notice} role="status">Checking the request queue…</p>}
    {state.phase === "signed-out" && <div className={styles.notice} role="status"><h2>Sign in to view requests</h2><p>Use your administrator account to continue.</p><a className={styles.button} href="/login?next=%2Fadmin%2Fdeletion-requests">Sign in</a></div>}
    {state.phase === "forbidden" && <div className={styles.notice} role="alert"><h2>Administrator access required</h2><p>This account is not authorized to view the private intake queue.</p></div>}
    {state.phase === "error" && <div className={styles.error} role="alert"><h2>Queue unavailable</h2><p>{state.error}</p></div>}
    {visible && <>
      <p className={styles.guidance}>A submitted request is not a deletion receipt. The safe check stops on paid credits, payment review, private storage, or unresolved workflows. A clear result anonymizes database identity, deletes Auth, and holds retained instrument Profiles private for a later custody review.</p>
      {state.actionMessage && <p className={styles.success} role="status">{state.actionMessage}</p>}
      {state.actionError && <p className={styles.error} role="alert">{state.actionError}</p>}
      {state.requests.length ? <ol className={styles.list} aria-label="Pending deletion review requests">
        {state.requests.map(row => <li className={styles.card} key={row.requestId}>
          <div className={styles.cardHeading}><h2>Review request</h2><span className={styles.status}>Requested</span></div>
          <dl><div><dt>Request reference</dt><dd><code>{row.requestId}</code></dd></div><div><dt>Actor ID</dt><dd>{row.actorId ? <code>{row.actorId}</code> : "Identity unlinked"}</dd></div><div className={styles.time}><dt>Requested at</dt><dd><time dateTime={row.requestedAt}>{row.requestedAt}</time></dd></div></dl>
          {(row.fulfillment?.state === "blocked" || row.fulfillment?.state === "quiescing_storage") && <div className={styles.blockers}>
            <strong>{row.fulfillment.state === "quiescing_storage" ? "Storage safety window" : "Blocked safely"}</strong>
            {row.fulfillment.state === "quiescing_storage" && row.fulfillment.storageQuiesceUntil ? <p>Retry after <time dateTime={row.fulfillment.storageQuiesceUntil}>{row.fulfillment.storageQuiesceUntil}</time>. The deadline is fixed and does not extend on retries.</p> : null}
            <ul>{row.fulfillment.blockers.map(code=><li key={code}>{blockerCopy[code] || "Resolve this recorded blocker before retrying."}</li>)}</ul>
          </div>}
          {row.fulfillment?.state === "ready_for_auth_deletion" && <p className={styles.warning}>Database anonymization finished, but Auth deletion is not confirmed. Retry to reconcile; do not tell the customer deletion is complete.</p>}
          <button className={styles.button} type="button" disabled={state.busy || Boolean(state.actionRequestId)} onClick={()=>onExecute(row.requestId)}>{state.actionRequestId===row.requestId?"Checking safely…":row.fulfillment?.state === "quiescing_storage"?"Rescan after deadline":row.fulfillment?"Retry fulfillment":"Review and fulfill"}</button>
        </li>)}
      </ol> : <div className={styles.empty}><h2>No pending requests</h2><p>No active review requests were returned by the latest successful check.</p></div>}
      <footer className={styles.pagination}>{state.hasMore ? <><span>Older requests may still be available.</span><button className={styles.button} type="button" disabled={state.busy} onClick={onMore}>{state.busy ? "Loading older requests…" : "Load older requests"}</button></> : state.requests.length > 0 ? <p>End of the loaded queue. Refresh to check for new or cancelled requests.</p> : null}</footer>
    </>}
  </section>;
}

export function AdminIntakeQueue({ auth = adminIntakeAuth }: { auth?: () => QueueAuth }) {
  const controller = useRef<ReturnType<typeof createAdminIntakeClient> | null>(null);
  const [state, setState] = useState(initialQueueState);
  useEffect(() => {
    const current = createAdminIntakeClient({ auth }); controller.current = current;
    const unsubscribe = current.subscribe(setState); setState(current.getState()); void current.start();
    return () => { unsubscribe(); current.dispose(); if (controller.current === current) controller.current = null; };
  }, [auth]);
  return <AdminIntakeQueueView state={state} onRefresh={() => { void controller.current?.refresh(); }} onMore={() => { void controller.current?.loadMore(); }} onExecute={(requestId) => {
    if (window.confirm("Run the fail-closed deletion check? A clear first review freezes writes and hides public content for a fixed storage safety window. A later review can anonymize the account and permanently delete its sign-in identity while retaining instrument Profiles in private custody.")) void controller.current?.execute(requestId);
  }} />;
}
