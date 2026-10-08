"use client";
import { useUiText } from "./UiTextProvider";


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
  const ui = useUiText("components.RecoveryCopyCorrection");
  return <div className={styles.review}>
    <dl><div><dt>{ui("ui.components.RecoveryCopyCorrection.f45fc1dfdc96", "Field")}</dt><dd>{RECOVERY_COPY_KEY}</dd></div><div><dt>{ui("ui.components.RecoveryCopyCorrection.5120e705e4b2", "Published revision")}</dt><dd>{preflight.publishedVersion}</dd></div><div><dt>{ui("ui.components.RecoveryCopyCorrection.d02e3d1642cf", "Published snapshot SHA-256")}</dt><dd>{preflight.publishedHash || ui("ui.components.RecoveryCopyCorrection.ca1844969742", "Unavailable")}</dd></div><div><dt>{ui("ui.components.RecoveryCopyCorrection.eb00feffb3b5", "Draft revision")}</dt><dd>{preflight.draftVersion || ui("ui.components.RecoveryCopyCorrection.cad993370313", "Empty — no saved draft revision")}</dd></div><div><dt>{ui("ui.components.RecoveryCopyCorrection.9f03d34eb73f", "Shared draft")}</dt><dd>{preflight.draftValue !== null || preflight.draftVersion !== "" ? ui("ui.components.RecoveryCopyCorrection.f941ca5b8cd2", "Present — publication is blocked") : ui("ui.components.RecoveryCopyCorrection.dc937b598926", "None")}</dd></div></dl>
    <div><h2>{ui("ui.components.RecoveryCopyCorrection.fd1a535735a9", "Currently saved")}</h2><p className={styles.exactValue}>{preflight.before}</p></div>
    <div><h2>{preflight.operation === "restore" ? ui("ui.components.RecoveryCopyCorrection.f4a5811bd13d", "Restore this introduction") : ui("ui.components.RecoveryCopyCorrection.59804df893cb", "Approved introduction")}</h2><p className={styles.exactValue}>{preflight.after}</p></div>
    {preflight.reason ? <p role="status">{preflight.reason}</p> : null}
  </div>;
}

export function RecoveryCopyCorrection() {
  const ui = useUiText("components.RecoveryCopyCorrection");
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
      setMessage(nextController.pending ? ui("ui.components.RecoveryCopyCorrection.aaffba64417d", "A previous correction needs confirmation. Retry that same request first.")
        : nextController.storageProblem ? ui("ui.components.RecoveryCopyCorrection.71fb849ec7a0", "Recovery storage is unavailable. Reload before making a change.")
        : ui("ui.components.RecoveryCopyCorrection.8b9e035960fe", "Review the authoritative saved introduction before publishing any change."));
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
    setBusy(true); setPreflight(null); setBackupReady(false); setReviewed(false); setMessage(ui("ui.components.RecoveryCopyCorrection.a3bb7ead4055", "Reading current published content and draft state…"));
    try {
      const response = await authorizedFetch(expectedActor, endpoint + (restore ? `?restore=${encodeURIComponent(restore)}` : ""));
      const payload = response.payload as { ok?: boolean; message?: string; preflight?: RecoveryCopyPreflight };
      if (attempt !== generation.current) return;
      if (!response.ok || payload.ok !== true || payload.preflight?.editorActorId !== expectedActor) throw new Error(payload.message || "Could not verify the saved content.");
      setPreflight(payload.preflight!); setMessage(payload.preflight!.reason || ui("ui.components.RecoveryCopyCorrection.1a2cc45a435d", "Only the introduction below will change. Save the raw backup and review both values."));
    } catch (error) { if (attempt === generation.current) setMessage(error instanceof Error ? error.message : ui("ui.components.RecoveryCopyCorrection.209b2a74b727", "Could not load the review.")); }
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
      setBackupReady(true); setMessage(ui("ui.components.RecoveryCopyCorrection.804d790a82c8", "Backup download prepared. Confirm you saved it and reviewed the introduction before continuing."));
    } catch { setBackupReady(false); setMessage(ui("ui.components.RecoveryCopyCorrection.1d74897ba2e0", "The backup download could not start. No change was sent.")); }
  }

  async function publish(retry = false) {
    const active = controller.current;
    if (access !== "authorized" || !active || busy || (!retry && (!preflight?.eligible || !backupReady || !reviewed))) return;
    const attempt = generation.current;
    setBusy(true); setMessage(retry ? ui("ui.components.RecoveryCopyCorrection.524f615f6cc7", "Confirming the original request…") : ui("ui.components.RecoveryCopyCorrection.67764127fda3", "Publishing only the reviewed introduction…"));
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
      setMessage(error instanceof Error ? error.message : ui("ui.components.RecoveryCopyCorrection.a300dc0718c5", "The result could not be confirmed. Retry the same request."));
    } finally { if (controller.current === active && attempt === generation.current) setBusy(false); }
  }

  if (access !== "authorized") return <section className={`${styles.root} ${styles.access}`} aria-labelledby="admin-access-title">
    <Link className={styles.adminBrand} href="/" aria-label={ui("ui.components.RecoveryCopyCorrection.1d4c7ec8aae3", "QRguitar home")}><BrandLogo className={styles.logo} /></Link>
    <h1 id="admin-access-title">{access === "checking" ? ui("ui.components.RecoveryCopyCorrection.a5af24c9f4f4", "Checking admin access") : access === "signed-out" ? ui("ui.components.RecoveryCopyCorrection.607a80121c65", "Sign in to continue") : access === "expired" ? ui("ui.components.RecoveryCopyCorrection.3a6573ba3009", "Your session expired") : access === "denied" ? ui("ui.components.RecoveryCopyCorrection.812fc8371083", "Admin access required") : ui("ui.components.RecoveryCopyCorrection.62e232ca1846", "Admin workspace unavailable")}</h1>
    <p role="status" aria-live="polite">{access === "checking" ? ui("ui.components.RecoveryCopyCorrection.de9bb8feda72", "Confirming your session…") : access === "signed-out" ? ui("ui.components.RecoveryCopyCorrection.6eb2121fc2c3", "Opening the sign-in page…") : access === "expired" ? logoutError || ui("ui.components.RecoveryCopyCorrection.e59df9499d3b", "Sign out of this expired session, then sign in again to continue.") : access === "denied" ? ui("ui.components.RecoveryCopyCorrection.005eb65d5e98", "This account does not have access to this workspace.") : ui("ui.components.RecoveryCopyCorrection.c4c6859aef65", "We couldn’t verify access right now. Please try again.")}</p>
    <div className={styles.actions}>
      {access === "signed-out" ? <Link className="button" href={loginHref}>{ui("ui.components.RecoveryCopyCorrection.bfd402b2f6f3", "Sign in")}</Link> : null}
      {access === "expired" ? <button type="button" className="button" disabled={signingOut} onClick={() => { void logout().then((signedOut) => { if (signedOut) router.replace(loginHref); }); }}>{signingOut ? ui("ui.components.RecoveryCopyCorrection.08c6bd357b7d", "Signing out…") : ui("ui.components.RecoveryCopyCorrection.897c73053d5d", "Sign out and sign in again")}</button> : null}
      {access === "unavailable" ? <button type="button" className="button" onClick={() => { setAccess("checking"); setAccessAttempt((value) => value + 1); }}>{ui("ui.components.RecoveryCopyCorrection.8cda64dffe43", "Retry access check")}</button> : null}
      {access === "denied" ? <Link className="button secondary" href="/dashboard">{ui("ui.components.RecoveryCopyCorrection.1bb548bc8507", "Return to dashboard")}</Link> : null}
    </div>
  </section>;

  return <section className={styles.root}>
    <nav className={styles.adminNav} aria-label={ui("ui.components.RecoveryCopyCorrection.1300ecbecd41", "Admin workspace")}><Link className={styles.adminBrand} href="/admin" aria-label={ui("ui.components.RecoveryCopyCorrection.e145db962517", "QRguitar Admin")}><BrandLogo className={styles.logo} /><span>{ui("ui.components.RecoveryCopyCorrection.c1c224b03cd9", "Admin")}</span></Link><Link href="/site-editor">{ui("ui.components.RecoveryCopyCorrection.06c85ff37596", "Content Studio")}</Link></nav>
    <header><p>{ui("ui.components.RecoveryCopyCorrection.454a2f1f26f9", "Content recovery")}</p><h1>{ui("ui.components.RecoveryCopyCorrection.f5e7e725b4d9", "Password-reset introduction")}</h1><p>{ui("ui.components.RecoveryCopyCorrection.c5a8bdb730c1", "Review one saved sentence without importing defaults or publishing a shared draft. Other saved content remains unchanged.")}</p></header>
    <p className={styles.feedback} role="status" aria-live="polite">{message}</p>
    <div className={styles.actions}>
      <button type="button" className="button secondary" disabled={busy || pending} onClick={() => void loadReview()}>{ui("ui.components.RecoveryCopyCorrection.0f4cb195dc94", "Review saved introduction")}</button>
      {pending ? <button type="button" className="button" disabled={busy} onClick={() => void publish(true)}>{ui("ui.components.RecoveryCopyCorrection.925e2db79845", "Retry the same request")}</button> : null}
      {restorationId ? <button type="button" className="button secondary" disabled={busy || pending} onClick={() => void loadReview(restorationId)}>{ui("ui.components.RecoveryCopyCorrection.0e9d87919f79", "Review rollback")}</button> : null}
      {record ? <button type="button" className="button secondary" disabled={busy} onClick={() => { try { download(record, "qrguitar-recovery-restoration-record.json"); } catch { setMessage(ui("ui.components.RecoveryCopyCorrection.eab1eeffc8a9", "The restoration record could not be downloaded. Retry the download.")); } }}>{ui("ui.components.RecoveryCopyCorrection.1203d6838bcb", "Download restoration record")}</button> : null}
    </div>
    {preflight ? <>
      <RecoveryCopyReview preflight={preflight} />
      <div className={styles.actions}><button type="button" className="button secondary" disabled={busy || pending} onClick={downloadBackup}>{ui("ui.components.RecoveryCopyCorrection.b2993ead56b7", "Download raw backup")}</button><a href="/reset-password" target="_blank" rel="noreferrer">{ui("ui.components.RecoveryCopyCorrection.95e883340c62", "Open password-reset page")}</a></div>
      {preflight.eligible ? <>
        <label className={styles.confirm}><input type="checkbox" checked={reviewed} disabled={!backupReady || busy || pending} onChange={(event) => setReviewed(event.target.checked)} /><span>{ui("ui.components.RecoveryCopyCorrection.ecc849ee139a", "I saved the backup and reviewed this single-field change.")}</span></label>
        <button type="button" className="button" disabled={!backupReady || !reviewed || busy || pending} onClick={() => void publish()}>{preflight.operation === "restore" ? ui("ui.components.RecoveryCopyCorrection.f41afacddad1", "Restore only this introduction") : ui("ui.components.RecoveryCopyCorrection.5117dc6c0ea4", "Publish only this introduction")}</button>
      </> : null}
    </> : null}
  </section>;
}
