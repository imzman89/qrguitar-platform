"use client";

import { useEffect, useRef, useState } from "react";
import { adminIntakeAuth } from "./admin-intake-auth";
import { createAdminIntakeClient, initialQueueState, type QueueAuth, type QueueState } from "./admin-intake-client";
import styles from "./admin-intake.module.css";

export function AdminIntakeQueueView({ state, onRefresh, onMore }: { state: QueueState; onRefresh(): void; onMore(): void }) {
  const visible = state.phase === "ready";
  return <section className={styles.queue} aria-labelledby="deletion-queue-title" aria-busy={state.busy}>
    <a className={styles.back} href="/admin">← Back to Admin</a>
    <header className={styles.heading}>
      <div><p className={styles.eyebrow}>Privacy operations</p><h1 id="deletion-queue-title">Deletion review requests</h1><p>Requests to remove personal information while preserving permanent instrument Profiles and factual history.</p></div>
      <span className={styles.mode}>Read-only intake</span>
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
      <p className={styles.guidance}>Submission records a request for review; it is not a deletion receipt. To inspect an account, <a href="/admin?section=users">open Users</a> and search its actor ID.</p>
      {state.requests.length ? <ol className={styles.list} aria-label="Pending deletion review requests">
        {state.requests.map(row => <li className={styles.card} key={row.requestId}>
          <div className={styles.cardHeading}><h2>Review request</h2><span className={styles.status}>Requested</span></div>
          <dl><div><dt>Request reference</dt><dd><code>{row.requestId}</code></dd></div><div><dt>Actor ID</dt><dd><code>{row.actorId}</code></dd></div><div className={styles.time}><dt>Requested at</dt><dd><time dateTime={row.requestedAt}>{row.requestedAt}</time></dd></div></dl>
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
  return <AdminIntakeQueueView state={state} onRefresh={() => { void controller.current?.refresh(); }} onMore={() => { void controller.current?.loadMore(); }} />;
}
