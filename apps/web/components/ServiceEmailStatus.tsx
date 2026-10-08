"use client";

import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createBrowserSupabaseClient } from "../lib/supabase-browser";
import { serviceEmailSessionChanged } from "../lib/service-email-status";
import styles from "./ServiceEmailStatus.module.css";

type Item = { id: string; submissionId: string; state: string; attempts: number; canRetry: boolean; code?: string };
type Status = { enabled: boolean; dispatchEnabled: boolean; queued: number; failed: number; unknown: number; lastSuccessAt: string | null; oldestPendingAt: string | null; items: Item[] };

export function ServiceEmailStatus() {
  const [status, setStatus] = useState<Status | null>(null), [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [offset, setOffset] = useState(0);
  const revision = useRef(0), actor = useRef(""), action = useRef(false);
  const perform = useCallback(async (body?: Record<string, string>) => {
    if (action.current) return;
    action.current = true; setBusy(true);
    const run = ++revision.current;
    try {
      const auth = createBrowserSupabaseClient().auth;
      const session = await auth.getSession();
      if (session.error || !session.data.session) throw new Error("Sign in with an authorized admin account.");
      if (run !== revision.current) return;
      actor.current = session.data.session.user.id;
      const headers = { authorization: `Bearer ${session.data.session.access_token}`, "content-type": "application/json" };
      if (body) {
        const response = await fetch("/api/admin/service-email", { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
        const result = await response.json();
        if (run !== revision.current) return;
        if (!response.ok || !result.ok) throw new Error(result.message || "Delivery action could not be confirmed. Refresh before trying again.");
        setMessage(result.message);
      }
      const response = await fetch(`/api/admin/service-email?offset=${offset}`, { headers, cache: "no-store", signal: AbortSignal.timeout(15000) });
      const result = await response.json();
      if (run !== revision.current) return;
      if (!response.ok || !result.ok) throw new Error(result.message || "Delivery status is unavailable.");
      setStatus(result.status);
      if (!body) setMessage("");
    } catch (error) {
      if (run === revision.current) { setStatus(null); setMessage(error instanceof Error ? error.message : "Delivery status is unavailable."); }
    } finally { action.current = false; if (run === revision.current) setBusy(false); }
  }, [offset]);
  useEffect(() => {
    const requestRevision = revision;
    let active = true;
    // Let Strict Mode discard its trial effect before starting the initial request.
    queueMicrotask(() => { if (active) void perform(); });
    const subscription = createBrowserSupabaseClient().auth.onAuthStateChange((_event, session) => {
      if (serviceEmailSessionChanged(_event, actor.current, session?.user.id)) {
        ++revision.current; actor.current = ""; setStatus(null); setMessage("Account changed. Refresh delivery status."); setBusy(false);
      }
    });
    return () => { active = false; ++requestRevision.current; subscription.data.subscription.unsubscribe(); };
  }, [perform]);
  const stale = status?.enabled && status.dispatchEnabled && (!status.lastSuccessAt || Date.now() - Date.parse(status.lastSuccessAt) > 15 * 60000);
  return <section className={styles.section} aria-labelledby="service-email-heading">
    <header className={styles.header}><h2 id="service-email-heading">Review emails</h2><button type="button" title="Refresh delivery status" aria-label="Refresh delivery status" disabled={busy} onClick={() => void perform()}><RefreshCw size={17} /></button></header>
    {message ? <p role="status">{message}</p> : null}
    {status ? <>
      <p>{!status.enabled ? "Outbox disabled. Existing delivery remains unchanged." : status.dispatchEnabled ? "Delivery active" : "Delivery paused. New review emails are still queued."}</p>
      {stale ? <p role="alert">Worker heartbeat is overdue. Queued emails need attention.</p> : null}
      <dl className={styles.metrics}><div><dt>Queued</dt><dd>{status.queued}</dd></div><div><dt>Failed</dt><dd>{status.failed}</dd></div><div><dt>Outcome unknown</dt><dd>{status.unknown}</dd></div></dl>
      {status.oldestPendingAt ? <p>Oldest queued: {new Date(status.oldestPendingAt).toLocaleString()}</p> : null}
      {status.items.map(item => <Delivery key={item.id} item={item} busy={busy} submit={perform} />)}
      {offset > 0 || status.items.length === 50 ? <div className={styles.pages}><button disabled={busy || offset === 0} onClick={() => setOffset(value => Math.max(0, value - 50))}>Previous</button><button disabled={busy || status.items.length < 50} onClick={() => setOffset(value => value + 50)}>Next</button></div> : null}
    </> : busy ? <p role="status">Loading delivery status...</p> : null}
  </section>;
}

function Delivery({ item, busy, submit }: { item: Item; busy: boolean; submit(body: Record<string, string>): Promise<void> }) {
  const [resolution, setResolution] = useState(""), [reason, setReason] = useState(""), [receipt, setReceipt] = useState("");
  return <details className={styles.delivery}>
    <summary>{item.state.replaceAll("_", " ")} <span>{item.attempts} / 6 attempts</span></summary>
    <Link href={`/service-review/${item.submissionId}`}>Open service request</Link>
    {item.state === "unknown" || item.canRetry ? <form className={styles.form} onSubmit={event => { event.preventDefault(); void submit({ intentId: item.id, resolution: item.canRetry ? "retry" : resolution, reason, providerMessageId: receipt }); }}>
      {item.state === "unknown" ? <><p>No automatic retry. Confirm the provider outcome first.</p><label>Provider outcome
        <select required value={resolution} onChange={e => setResolution(e.target.value)}>
          <option value="">Choose confirmed outcome</option>
          <option value="confirmed_accepted">Accepted: record receipt, do not resend</option>
          <option value="confirmed_not_accepted">Not accepted: retry only if eligible</option>
        </select></label></> : null}
      <label>Review evidence<textarea required minLength={10} maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} /></label>
      {resolution === "confirmed_accepted" ? <label>Provider message ID<input required maxLength={300} value={receipt} onChange={e => setReceipt(e.target.value)} /></label> : null}
      <button type="submit" disabled={busy || (!item.canRetry && !resolution)}>{item.canRetry ? "Queue retry" : resolution === "confirmed_not_accepted" ? "Record non-acceptance" : "Record acceptance"}</button>
    </form> : <p>{item.code?.replaceAll("_", " ") || "No manual action is available."}</p>}
  </details>;
}
