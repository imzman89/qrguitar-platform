"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BrandLogo } from "./BrandLogo";
import { createBrowserSupabaseClient, getSupabaseAccessToken } from "../lib/supabase-browser";
import { useAuthNavigation } from "../lib/use-auth-navigation";
import { createEditorMutationController, type EditorMutationPayload } from "../lib/site-editor-client";
import { RECOVERY_COPY_KEY, RECOVERY_COPY_SOURCE, type RecoveryCopyPreflight } from "../lib/site-editor-recovery-copy";
import styles from "./RecoveryCopyCorrection.module.css";

const endpoint = "/api/site-editor/recovery-copy";
const loginHref = "/login?next=%2Fsite-editor%2Frecovery-copy";
const restorationStorageKey = (actorId: string) => `qrguitar.recovery-copy.last:${actorId}`;
type Controller = ReturnType<typeof createEditorMutationController>;

export function RecoveryCopyReview({ preflight }: { preflight: RecoveryCopyPreflight }) {
  return <div className={styles.review}>
    <dl><div><dt>Field</dt><dd>{RECOVERY_COPY_KEY}</dd></div><div><dt>Published revision</dt><dd>{preflight.publishedVersion}</dd></div><div><dt>Published snapshot SHA-256</dt><dd>{preflight.publishedHash || "Unavailable"}</dd></div><div><dt>Draft revision</dt><dd>{preflight.draftVersion || "Empty — no saved draft revision"}</dd></div><div><dt>Shared draft</dt><dd>{preflight.draftValue !== null || preflight.draftVersion !== "" ? "Present — publication is blocked" : "None"}</dd></div></dl>
    <div><h2>Currently saved</h2><p className={styles.exactValue}>{preflight.before}</p></div>
    <div><h2>{preflight.operation === "restore" ? "Restore this introduction" : "Approved introduction"}</h2><p className={styles.exactValue}>{preflight.after}</p></div>
    {preflight.reason ? <p role="status">{preflight.reason}</p> : null}
  </div>;
}

export function RecoveryCopyCorrection() {
  const router = useRouter();
  const { logout, signingOut, logoutError } = useAuthNavigation();
  const [access, setAccess] = useState<"checking" | "signed-out" | "expired" | "denied" | "unavailable" | "authorized">("checking");
  const [accessAttempt, setAccessAttempt] = useState(0);
  const actor = useRef("");
  const generation = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const controller = useRef<Controller | null>(null);
  const [preflight, setPreflight] = useState<RecoveryCopyPreflight | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [backupReady, setBackupReady] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [record, setRecord] = useState<unknown>(null);
  const [restorationId, setRestorationId] = useState("");
  const [message, setMessage] = useState("Checking your admin session…");
  const cancelRequests = useCallback(() => { generation.current++; abort.current?.abort(); }, []);
  const hideWorkspace = useCallback((state: "checking" | "signed-out" | "expired" | "denied" | "unavailable") => {
    cancelRequests(); controller.current = null; setPreflight(null); setRecord(null); setRestorationId("");
    setBackupReady(false); setReviewed(false); setBusy(false); setPending(false); setAccess(state);
    if (state === "signed-out") router.replace(loginHref);
  }, [cancelRequests, router]);

  const authorizedFetch = useCallback(async (expectedActor: string, url: string, body?: string) => {
    const requestGeneration = generation.current;
    const token = await getSupabaseAccessToken();
    if (!token || actor.current !== expectedActor || requestGeneration !== generation.current) {
      if (!token && actor.current === expectedActor && requestGeneration === generation.current) hideWorkspace("expired");
      throw new Error("Your admin session changed. Sign back into the original account.");
    }
    const requestAbort = new AbortController(); abort.current = requestAbort;
    const timer = window.setTimeout(() => requestAbort.abort(), 20000);
    try {
      const response = await fetch(url, { method: body === undefined ? "GET" : "POST", body,
        headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, cache: "no-store", signal: requestAbort.signal });
      const payload = await response.json().catch(() => ({})) as EditorMutationPayload;
      if (actor.current === expectedActor && requestGeneration === generation.current && (response.status === 401 || response.status === 403)) hideWorkspace(response.status === 401 ? "expired" : "denied");
      return { status: response.status, ok: response.ok, payload };
    } finally { window.clearTimeout(timer); if (abort.current === requestAbort) abort.current = null; }
  }, [hideWorkspace]);

  useEffect(() => {
    let mounted = true, authObserved = false;
    const updateActor = (next: string) => {
      if (!mounted || (next === actor.current && controller.current)) return;
      actor.current = next; hideWorkspace(next ? "checking" : "signed-out");
      if (!next) return;
      let recoveryStorage: Storage;
      try { recoveryStorage = window.sessionStorage; }
      catch { hideWorkspace("unavailable"); return; }
      const nextController = createEditorMutationController({ actorId: next, storageScope: "recovery-copy", storage: recoveryStorage,
        uuid: () => crypto.randomUUID(), send: async (body) => {
          const response = await authorizedFetch(next, endpoint, body);
          return { status: response.status, payload: response.payload };
        }
      });
      controller.current = nextController; setPending(Boolean(nextController.pending));
      try {
        const saved = window.sessionStorage.getItem(restorationStorageKey(next));
        if (saved && /^[0-9a-f-]{36}$/i.test(saved)) setRestorationId(saved);
      } catch { /* The committed correction also has a downloadable restoration record. */ }
      setMessage(nextController.pending ? "A previous correction needs confirmation. Retry that same request first."
        : nextController.storageProblem ? "Recovery storage is unavailable. Reload before making a change."
        : "Review the authoritative saved introduction before publishing any change.");
      const attempt = generation.current;
      void authorizedFetch(next, endpoint).then((response) => {
        if (!mounted || attempt !== generation.current || controller.current !== nextController) return;
        const payload = response.payload as { ok?: boolean; preflight?: RecoveryCopyPreflight };
        if (response.ok && payload.ok === true && payload.preflight?.editorActorId === next) setAccess("authorized");
        else hideWorkspace("unavailable");
      }).catch(() => { if (mounted && attempt === generation.current) hideWorkspace("unavailable"); });
    };
    let unsubscribe = () => {};
    try {
      const client = createBrowserSupabaseClient();
      const subscription = client.auth.onAuthStateChange((_event, session) => { authObserved = true; updateActor(session?.user.id || ""); });
      unsubscribe = () => subscription.data.subscription.unsubscribe();
      void client.auth.getSession().then(({ data }) => { if (!authObserved) updateActor(data.session?.user.id || ""); }).catch(() => { if (mounted && !authObserved) hideWorkspace("unavailable"); });
    } catch { hideWorkspace("unavailable"); }
    return () => { mounted = false; cancelRequests(); controller.current = null; unsubscribe(); };
    // Auth owns the lifecycle; no settings, drafts or business actions run here.
  }, [accessAttempt, authorizedFetch, cancelRequests, hideWorkspace]);

  async function loadReview(restore?: string) {
    if (access !== "authorized" || !actor.current || busy || controller.current?.pending) return;
    const expectedActor = actor.current, attempt = ++generation.current;
    setBusy(true); setPreflight(null); setBackupReady(false); setReviewed(false); setMessage("Reading current published content and draft state…");
    try {
      const response = await authorizedFetch(expectedActor, endpoint + (restore ? `?restore=${encodeURIComponent(restore)}` : ""));
      const payload = response.payload as { ok?: boolean; message?: string; preflight?: RecoveryCopyPreflight };
      if (attempt !== generation.current) return;
      if (!response.ok || payload.ok !== true || payload.preflight?.editorActorId !== expectedActor) throw new Error(payload.message || "Could not verify the saved content.");
      setPreflight(payload.preflight!); setMessage(payload.preflight!.reason || "Only the introduction below will change. Save the raw backup and review both values.");
    } catch (error) { if (attempt === generation.current) setMessage(error instanceof Error ? error.message : "Could not load the review."); }
    finally { if (attempt === generation.current) setBusy(false); }
  }

  function download(value: unknown, name: string) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
    try { const link = document.createElement("a"); link.href = url; link.download = name; link.click(); }
    finally { URL.revokeObjectURL(url); }
  }

  function downloadBackup() {
    if (access !== "authorized" || !preflight || busy || pending) return;
    try {
      download({ schema: RECOVERY_COPY_SOURCE, origin: window.location.origin, capturedAt: new Date().toISOString(), ...preflight }, `qrguitar-recovery-before-${preflight.publishedVersion}.json`);
      setBackupReady(true); setMessage("Backup download prepared. Confirm you saved it and reviewed the introduction before continuing.");
    } catch { setBackupReady(false); setMessage("The backup download could not start. No change was sent."); }
  }

  async function publish(retry = false) {
    const active = controller.current;
    if (access !== "authorized" || !active || busy || (!retry && (!preflight?.eligible || !backupReady || !reviewed))) return;
    const attempt = generation.current;
    setBusy(true); setMessage(retry ? "Confirming the original request…" : "Publishing only the reviewed introduction…");
    try {
      const result = await (retry ? active.retry() : active.mutate({ operation: preflight!.operation, field: RECOVERY_COPY_KEY,
        value: preflight!.after, expectedValue: preflight!.before, ...(preflight!.priorRequestId ? { priorRequestId: preflight!.priorRequestId } : {}) },
        { publishedVersion: preflight!.publishedVersion, draftVersion: "" }, JSON.stringify({ field: RECOVERY_COPY_KEY, before: preflight!.before, after: preflight!.after }))) as EditorMutationPayload;
      if (controller.current !== active || attempt !== generation.current) return;
      setPending(false); setPreflight(null); setBackupReady(false); setReviewed(false); setRecord(result.record);
      const savedRecord = result.record as { operation?: string } | undefined;
      const nextRestorationId = savedRecord?.operation === "correct" ? String(result.requestId) : "";
      setRestorationId(nextRestorationId);
      try {
        if (nextRestorationId) window.sessionStorage.setItem(restorationStorageKey(actor.current), nextRestorationId);
        else window.sessionStorage.removeItem(restorationStorageKey(actor.current));
      } catch { /* Downloadable record retains the correction request ID. */ }
      setMessage(String(result.message || "The request is committed.") + (result.superseded ? " A later change exists; reload before another action." : ""));
    } catch (error) {
      if (controller.current !== active || attempt !== generation.current) return;
      setPending(Boolean(active.pending)); setReviewed(false);
      setMessage(error instanceof Error ? error.message : "The result could not be confirmed. Retry the same request.");
    } finally { if (controller.current === active && attempt === generation.current) setBusy(false); }
  }

  if (access !== "authorized") return <section className={`${styles.root} ${styles.access}`} aria-labelledby="admin-access-title">
    <Link className={styles.adminBrand} href="/" aria-label="QRguitar home"><BrandLogo className={styles.logo} /></Link>
    <h1 id="admin-access-title">{access === "checking" ? "Checking admin access" : access === "signed-out" ? "Sign in to continue" : access === "expired" ? "Your session expired" : access === "denied" ? "Admin access required" : "Admin workspace unavailable"}</h1>
    <p role="status" aria-live="polite">{access === "checking" ? "Confirming your session…" : access === "signed-out" ? "Opening the sign-in page…" : access === "expired" ? logoutError || "Sign out of this expired session, then sign in again to continue." : access === "denied" ? "This account does not have access to this workspace." : "We couldn’t verify access right now. Please try again."}</p>
    <div className={styles.actions}>
      {access === "signed-out" ? <Link className="button" href={loginHref}>Sign in</Link> : null}
      {access === "expired" ? <button type="button" className="button" disabled={signingOut} onClick={() => { void logout().then((signedOut) => { if (signedOut) router.replace(loginHref); }); }}>{signingOut ? "Signing out…" : "Sign out and sign in again"}</button> : null}
      {access === "unavailable" ? <button type="button" className="button" onClick={() => { setAccess("checking"); setAccessAttempt((value) => value + 1); }}>Retry access check</button> : null}
      {access === "denied" ? <Link className="button secondary" href="/dashboard">Return to dashboard</Link> : null}
    </div>
  </section>;

  return <section className={styles.root}>
    <nav className={styles.adminNav} aria-label="Admin workspace"><Link className={styles.adminBrand} href="/admin" aria-label="QRguitar Admin"><BrandLogo className={styles.logo} /><span>Admin</span></Link><Link href="/site-editor">Content Studio</Link></nav>
    <header><p>Content recovery</p><h1>Password-reset introduction</h1><p>Review one saved sentence without importing defaults or publishing a shared draft. Other saved content remains unchanged.</p></header>
    <p className={styles.feedback} role="status" aria-live="polite">{message}</p>
    <div className={styles.actions}>
      <button type="button" className="button secondary" disabled={busy || pending} onClick={() => void loadReview()}>Review saved introduction</button>
      {pending ? <button type="button" className="button" disabled={busy} onClick={() => void publish(true)}>Retry the same request</button> : null}
      {restorationId ? <button type="button" className="button secondary" disabled={busy || pending} onClick={() => void loadReview(restorationId)}>Review rollback</button> : null}
      {record ? <button type="button" className="button secondary" disabled={busy} onClick={() => { try { download(record, "qrguitar-recovery-restoration-record.json"); } catch { setMessage("The restoration record could not be downloaded. Retry the download."); } }}>Download restoration record</button> : null}
    </div>
    {preflight ? <>
      <RecoveryCopyReview preflight={preflight} />
      <div className={styles.actions}><button type="button" className="button secondary" disabled={busy || pending} onClick={downloadBackup}>Download raw backup</button><a href="/reset-password" target="_blank" rel="noreferrer">Open password-reset page</a></div>
      {preflight.eligible ? <>
        <label className={styles.confirm}><input type="checkbox" checked={reviewed} disabled={!backupReady || busy || pending} onChange={(event) => setReviewed(event.target.checked)} /><span>I saved the backup and reviewed this single-field change.</span></label>
        <button type="button" className="button" disabled={!backupReady || !reviewed || busy || pending} onClick={() => void publish()}>{preflight.operation === "restore" ? "Restore only this introduction" : "Publish only this introduction"}</button>
      </> : null}
    </> : null}
  </section>;
}
