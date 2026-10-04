"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient, getSupabaseAccessToken } from "../lib/supabase-browser";
import { useAuthNavigation } from "../lib/use-auth-navigation";
import { observeSessionIdentity } from "../lib/session-identity";
import { createEditorMutationController, type EditorMutationPayload } from "../lib/site-editor-client";
import { HOME_TITLE_KEY, HOME_TITLE_PRIOR, HOME_TITLE_TARGET, HOME_TITLE_SOURCE, type HomeTitlePreflight } from "../lib/site-editor-home-title-contract";
import styles from "./RecoveryCopyCorrection.module.css";

const endpoint = "/api/site-editor/home-title";
const loginHref = "/login?next=%2Fsite-editor%2Fhome-title";
type Access = "checking" | "signed-out" | "expired" | "denied" | "unavailable" | "authorized";
type Controller = ReturnType<typeof createEditorMutationController>;
export function HomeTitleReview({ preflight }: { preflight: HomeTitlePreflight }) {
  return <div className={styles.review}>
    <dl>
      <div><dt>Only editable field</dt><dd>{HOME_TITLE_KEY}</dd></div>
      <div><dt>Authorized editor</dt><dd>{preflight.editorActorId}</dd></div>
      <div><dt>Published revision</dt><dd>{preflight.publishedVersion}</dd></div>
      <div><dt>Raw published snapshot SHA-256</dt><dd>{preflight.publishedHash}</dd></div>
      <div><dt>Draft revision</dt><dd>{preflight.draftVersion || "Empty — no saved draft revision"}</dd></div>
      <div><dt>Shared draft</dt><dd>{preflight.draftValue === null && preflight.draftVersion === "" ? "None" : "Present — publication is blocked"}</dd></div>
    </dl>
    <div><h2>Currently saved title</h2><p className={styles.exactValue}>{preflight.before ?? "Unavailable"}</p></div>
    <div><h2>Human-approved title</h2><p className={styles.exactValue}>{HOME_TITLE_TARGET}</p></div>
    {preflight.reason ? <p role="status">{preflight.reason}</p> : null}
    {preflight.errors ? <ul>{Object.entries(preflight.errors).map(([key, message]) => <li key={key}>{key}: {message}</li>)}</ul> : null}
  </div>;
}
export function HomeTitleCorrection() {
  const router = useRouter();
  const { logout, signingOut, logoutError } = useAuthNavigation();
  const [access, setAccess] = useState<Access>("checking");
  const [accessAttempt, setAccessAttempt] = useState(0);
  const actor = useRef("");
  const generation = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const controller = useRef<Controller | null>(null);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [preflight, setPreflight] = useState<HomeTitlePreflight | null>(null);
  const [backupReady, setBackupReady] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [record, setRecord] = useState<unknown>(null);
  const [message, setMessage] = useState("Checking your admin session…");
  const cancelRequests = useCallback(() => { generation.current++; abort.current?.abort(); }, []);
  const hideWorkspace = useCallback((state: Exclude<Access, "authorized">) => {
    cancelRequests(); controller.current = null; setPreflight(null); setRecord(null);
    setBackupReady(false); setReviewed(false); setPending(false); setCompleted(false);
    busyRef.current = false; setBusy(false); setAccess(state);
    if (state === "signed-out") router.replace(loginHref);
  }, [cancelRequests, router]);
  const authorizedFetch = useCallback(async (expectedActor: string, body?: string) => {
    const started = generation.current;
    const token = await getSupabaseAccessToken();
    if (!token || actor.current !== expectedActor || started !== generation.current) {
      if (!token && actor.current === expectedActor && started === generation.current) hideWorkspace("expired");
      throw new Error("The admin session changed. Return to the original signed-in account.");
    }
    const task = new AbortController(); abort.current = task;
    const timer = window.setTimeout(() => task.abort(), 20000);
    try {
      const response = await fetch(endpoint, { method: body === undefined ? "GET" : "POST", body,
        headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, cache: "no-store", signal: task.signal });
      const payload = await response.json().catch(() => ({})) as EditorMutationPayload;
      if (actor.current === expectedActor && started === generation.current && (response.status === 401 || response.status === 403)) hideWorkspace(response.status === 401 ? "expired" : "denied");
      return { status: response.status, ok: response.ok, payload };
    } finally { window.clearTimeout(timer); if (abort.current === task) abort.current = null; }
  }, [hideWorkspace]);
  useEffect(() => {
    let mounted = true;
    const updateActor = (next: string) => {
      if (!mounted || (actor.current === next && controller.current)) return;
      actor.current = next; hideWorkspace(next ? "checking" : "signed-out");
      if (!next) return;
      let storage: Storage;
      try { storage = window.sessionStorage; } catch { hideWorkspace("unavailable"); return; }
      const active = createEditorMutationController({ actorId: next, storageScope: HOME_TITLE_SOURCE, storage,
        uuid: () => crypto.randomUUID(), send: async (body) => {
          const response = await authorizedFetch(next, body);
          return { status: response.status, payload: response.payload };
        }
      });
      controller.current = active; setPending(Boolean(active.pending));
      setMessage(active.pending ? "A previous title correction needs confirmation. Retry that exact request first."
        : active.storageProblem ? "Recovery storage is unavailable. Read and export are allowed, but no new correction can be sent."
        : "Review the raw saved title and revisions before sending the single approved correction.");
      const started = generation.current;
      void authorizedFetch(next).then((response) => {
        if (!mounted || started !== generation.current || controller.current !== active) return;
        const payload = response.payload as { ok?: boolean; preflight?: HomeTitlePreflight };
        if (response.ok && payload.ok === true && payload.preflight?.editorActorId === next) setAccess("authorized");
        else hideWorkspace("unavailable");
      }).catch(() => { if (mounted && started === generation.current) hideWorkspace("unavailable"); });
    };
    let unsubscribe = () => {};
    try {
      const auth = createBrowserSupabaseClient().auth;
      // Installed SDK can emit INITIAL_SESSION(null) after a refresh/read error.
      // Existing shared observer distinguishes that from a confirmed guest,
      // checks getSession.error, bounds startup, and gives newer Auth events priority.
      unsubscribe = observeSessionIdentity(auth, updateActor, {
        onResolving: () => { if (mounted) hideWorkspace("checking"); },
        onError: () => { if (mounted) hideWorkspace("unavailable"); }
      });
    } catch { hideWorkspace("unavailable"); }
    return () => { mounted = false; cancelRequests(); controller.current = null; unsubscribe(); };
    // Only Auth/read-only GET runs on entry. No autosave, preview, email or other business action.
  }, [accessAttempt, authorizedFetch, cancelRequests, hideWorkspace]);
  async function loadReview() {
    if (access !== "authorized" || !actor.current || busyRef.current || controller.current?.pending) return;
    const expectedActor = actor.current, started = ++generation.current;
    busyRef.current = true; setBusy(true); setPreflight(null); setBackupReady(false); setReviewed(false);
    try {
      const response = await authorizedFetch(expectedActor);
      const payload = response.payload as { ok?: boolean; message?: string; preflight?: HomeTitlePreflight };
      if (started !== generation.current) return;
      if (!response.ok || payload.ok !== true || payload.preflight?.editorActorId !== expectedActor) throw new Error(payload.message || "Could not read current published state.");
      setPreflight(payload.preflight!); setMessage(payload.preflight!.reason || "Only the displayed homepage title will change. Download the raw backup and confirm you saved and reviewed it.");
    } catch (error) { if (started === generation.current) setMessage(error instanceof Error ? error.message : "Review failed. No mutation was sent."); }
    finally { if (started === generation.current) { busyRef.current = false; setBusy(false); } }
  }
  function download(value: unknown, name: string) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
    try { const link = document.createElement("a"); link.href = url; link.download = name; link.click(); }
    finally { URL.revokeObjectURL(url); }
  }
  function downloadBackup() {
    if (access !== "authorized" || !preflight || busyRef.current || pending) return;
    try {
      download({ schema: HOME_TITLE_SOURCE, origin: window.location.origin, capturedAt: new Date().toISOString(), ...preflight }, `qrguitar-home-title-before-${preflight.publishedVersion}.json`);
      setBackupReady(true); setMessage("Backup download prepared. Confirm that you saved it and reviewed the exact old and new title.");
    } catch { setBackupReady(false); setMessage("The backup download could not start. No correction was sent."); }
  }
  async function publish(retry = false) {
    const active = controller.current;
    if (access !== "authorized" || !active || busyRef.current || completed || (!retry && (!preflight?.eligible || !backupReady || !reviewed || active.storageProblem))) return;
    const started = generation.current;
    busyRef.current = true; setBusy(true); setMessage(retry ? "Confirming the original title correction…" : "Publishing only the approved homepage title…");
    try {
      const result = await (retry ? active.retry() : active.mutate({ operation: "correct", field: HOME_TITLE_KEY,
        value: HOME_TITLE_TARGET, expectedValue: HOME_TITLE_PRIOR }, { publishedVersion: preflight!.publishedVersion, draftVersion: "" },
        JSON.stringify({ field: HOME_TITLE_KEY, before: HOME_TITLE_PRIOR, after: HOME_TITLE_TARGET }))) as EditorMutationPayload;
      if (controller.current !== active || started !== generation.current) return;
      setPending(false); setPreflight(null); setBackupReady(false); setReviewed(false); setCompleted(true); setRecord(result.record);
      setMessage(String(result.message || "The title correction is committed.") + (result.superseded ? " Later changes exist. No further mutation is offered here." : " Verify the actual public homepage title separately."));
    } catch (error) {
      if (controller.current !== active || started !== generation.current) return;
      setPending(Boolean(active.pending)); setPreflight(null); setBackupReady(false); setReviewed(false);
      setMessage(error instanceof Error ? error.message : "The result is unknown. Retry the exact original request.");
    } finally { if (controller.current === active && started === generation.current) { busyRef.current = false; setBusy(false); } }
  }
  if (access !== "authorized") return <section className={`${styles.root} ${styles.access}`}>
    <Link href="/">QRguitar</Link>
    <h1>{access === "checking" ? "Checking admin access" : access === "signed-out" ? "Sign in to continue" : access === "expired" ? "Your session expired" : access === "denied" ? "Admin access required" : "Admin workspace unavailable"}</h1>
    <p role="status">{access === "expired" ? logoutError || "Sign out normally, then sign in again to continue." : access === "denied" ? "This account has no access to this workspace." : access === "checking" ? "Confirming your session…" : "Use the normal sign-in flow or retry access."}</p>
    <div className={styles.actions}>
      {access === "signed-out" ? <Link href={loginHref}>Sign in</Link> : null}
      {access === "expired" ? <button className="button" type="button" disabled={signingOut} onClick={() => { void logout().then((ok) => { if (ok) router.replace(loginHref); }); }}>{signingOut ? "Signing out…" : "Sign out and sign in again"}</button> : null}
      {access === "unavailable" ? <button className="button" type="button" onClick={() => setAccessAttempt((value) => value + 1)}>Retry access check</button> : null}
      {access === "denied" ? <Link href="/dashboard">Return to dashboard</Link> : null}
    </div>
  </section>;
  return <section className={styles.root}>
    <nav className={styles.adminNav} aria-label="Admin workspace"><Link href="/admin">QRguitar Admin</Link></nav>
    <header><h1>Homepage title correction</h1><p>This explicit tool changes only the reviewed search title. It does not import defaults, save drafts, publish another draft, or offer arbitrary editing.</p></header>
    <p className={styles.feedback} role="status" aria-live="polite">{message}</p>
    <div className={styles.actions}>
      <button className="button secondary" type="button" disabled={busy || pending} onClick={() => void loadReview()}>Review saved title</button>
      {pending ? <button className="button" type="button" disabled={busy} onClick={() => void publish(true)}>Retry the same request</button> : null}
      {record ? <button className="button secondary" type="button" disabled={busy} onClick={() => { try { download(record, "qrguitar-home-title-transaction-record.json"); } catch { setMessage("Record download failed. Retry the download; the commit is unchanged."); } }}>Download transaction record</button> : null}
    </div>
    {preflight ? <>
      <HomeTitleReview preflight={preflight} />
      <button className="button secondary" type="button" disabled={busy || pending} onClick={downloadBackup}>Download raw backup</button>
      {preflight.eligible && !completed ? <>
        <label className={styles.confirm}><input type="checkbox" checked={reviewed} disabled={!backupReady || busy || pending || Boolean(controller.current?.storageProblem)} onChange={(event) => setReviewed(event.target.checked)} /><span>I saved the raw backup and reviewed this exact single-title change.</span></label>
        <button className="button" type="button" disabled={!backupReady || !reviewed || busy || pending || Boolean(controller.current?.storageProblem)} onClick={() => void publish()}>Publish only this title</button>
      </> : null}
    </> : null}
  </section>;
}
