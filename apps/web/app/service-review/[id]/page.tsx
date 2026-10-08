"use client";
import { useUiText } from "../../../components/UiTextProvider";


import workflow from "../../../components/WorkflowWorkspace.module.css";
import { ArrowLeft, CheckCircle2, FileLock2, ShieldCheck, Wrench } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Footer } from "../../../components/Footer";
import { ServiceCorrections } from "../../../components/ServiceCorrections";
import { Nav } from "../../../components/Nav";
import { getContentValue } from "../../../lib/content-registry";
import { createBrowserSupabaseClient } from "../../../lib/supabase-browser";
import { useSiteContent } from "../../../lib/use-site-content";

type Evidence = { id: string; type: string; fileName: string; mimeType: string; fileSizeBytes: number; previewUrl: string };
type Submission = { id: string; status: string; qrCode: string; profileTitle: string; serviceDate: string; serviceType: string; title: string; workPerformed: string; partsInstalled: string; setupMeasurements: string; workOrderReference: string; recommendedPublicDescription: string; privateProviderNote: string; ownerReviewNote: string; requestedVisibility: "public" | "private"; updatedAt: string; evidenceCount: number; provider?: { publicDisplayName: string; businessName: string; location: string; verificationStatus: string }; emailDeliveryStatus: string; activity: Array<{ action: string; note?: string; created_at?: string }> };

type ReviewPayload = { ok?: boolean; submission?: Submission; evidence?: Evidence[]; message?: string };

async function boundedReview<T>(run: (signal: AbortSignal) => Promise<T>, parent: AbortSignal, milliseconds = 15000) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectAbort: (reason: Error) => void = () => {};
  const abort = () => { controller.abort(); rejectAbort(new Error("Review request interrupted.")); };
  try {
    return await Promise.race([
      Promise.resolve().then(() => { if (parent.aborted) throw new Error("Review request interrupted."); return run(controller.signal); }),
      new Promise<never>((_, reject) => {
        rejectAbort = reject;
        parent.addEventListener("abort", abort, { once: true });
        timer = setTimeout(() => { controller.abort(); reject(new Error("Review request timed out.")); }, milliseconds);
      })
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    parent.removeEventListener("abort", abort);
  }
}

function reviewRequest(url: string, init: RequestInit, parent: AbortSignal) {
  return boundedReview(async (signal) => {
    const response = await fetch(url, { ...init, cache: "no-store", signal });
    const payload = await response.json().catch(() => null) as ReviewPayload | null;
    return { response, payload };
  }, parent);
}

export default function ServiceReviewPage() {
  const ui = useUiText("app.service.review.id.page");
  const content = useSiteContent();
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const id = decodeURIComponent(params.id || "");
  const reviewToken = search.get("token") || "";
  const [token, setToken] = useState("");
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [note, setNote] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("private");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [sessionPhase, setSessionPhase] = useState<"loading" | "ready" | "signed-out" | "error">("loading");
  const [evidencePhase, setEvidencePhase] = useState<"loading" | "ready" | "error">("loading");
  const [uncertain, setUncertain] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const sessionController = useRef<AbortController | null>(null);
  const actionLock = useRef(false);
  const uncertainLock = useRef(false);
  const evidenceLock = useRef(false);
  // Published wording may refresh independently of the private review session.
  // Keep registered copy current without restarting requests or decision locks.
  const loadFailure = useRef("");
  loadFailure.current = ui("ui.app.service.review.id.page.5300b43afac1", "Could not load this owner review.");
  const renderedController = sessionController.current;
  function currentReviewController() {
    // A callback belongs to the session that rendered it, not a replacement
    // session installed by an auth event before React commits the next render.
    return renderedController && renderedController === sessionController.current
      && !renderedController.signal.aborted && token && submission?.id === id
      ? renderedController : null;
  }

  const loadEvidence = useCallback(async (accessToken: string, signal: AbortSignal) => {
    if (evidenceLock.current || signal.aborted) return;
    evidenceLock.current = true;
    setEvidencePhase("loading");
    try {
      const { response, payload } = await reviewRequest(`/api/service-evidence?submissionId=${encodeURIComponent(id)}`, { headers: { authorization: `Bearer ${accessToken}` } }, signal);
      if (signal.aborted) return;
      if (!response.ok || payload?.ok !== true || !Array.isArray(payload.evidence)) throw new Error("Evidence unavailable.");
      setEvidence(payload.evidence);
      setEvidencePhase("ready");
    } catch {
      if (!signal.aborted) setEvidencePhase("error");
    } finally { if (!signal.aborted) evidenceLock.current = false; }
  }, [id]);

  const load = useCallback(async (accessToken: string, signal: AbortSignal) => {
    const { response, payload } = await reviewRequest(`/api/service-submissions?id=${encodeURIComponent(id)}`, { headers: { authorization: `Bearer ${accessToken}` } }, signal);
    if (signal.aborted) return;
    if (!response.ok || payload?.ok !== true || payload.submission?.id !== id) {
      setMessage(payload?.message || loadFailure.current);
      return;
    }
    setSubmission(payload.submission); setVisibility(payload.submission.status === "approved" && payload.submission.requestedVisibility === "public" ? "public" : "private");
    void loadEvidence(accessToken, signal);
    // Marking read is separate from the review decision; a failure must not hide the loaded request.
    void reviewRequest("/api/service-submissions", { method: "PATCH", headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" }, body: JSON.stringify({ id, action: "mark_read" }) }, signal).catch(() => undefined);
  }, [id, loadEvidence]);

  useEffect(() => {
    let disposed = false, observed = false;
    let actor: string | undefined;
    const startup = new AbortController();
    let unsubscribe = () => {};
    function sync(value: { access_token: string; user: { id: string } } | null) {
      if (disposed) return;
      const nextActor = value?.user.id || "";
      if (actor === nextActor) { setToken(value?.access_token || ""); return; }
      actor = nextActor;
      sessionController.current?.abort();
      const controller = new AbortController(); sessionController.current = controller;
      actionLock.current = false; uncertainLock.current = false; evidenceLock.current = false;
      setBusy(""); setUncertain(false); setSubmission(null); setEvidence([]); setNote(""); setVisibility("private"); setMessage(""); setEvidencePhase("loading");
      setToken(value?.access_token || ""); setSessionPhase(value ? "ready" : "signed-out");
      if (value) void load(value.access_token, controller.signal).catch(() => {
        if (!controller.signal.aborted) setMessage(loadFailure.current);
      });
    }
    setSessionPhase("loading");
    try {
      const auth = createBrowserSupabaseClient().auth;
      const { data: listener } = auth.onAuthStateChange((event, value) => {
        // getSession resolves startup; a stale initial snapshot must not replace
        // it or clear an established actor. Subsequent auth events remain live.
        if (event === "INITIAL_SESSION") return;
        observed = true; sync(value);
      });
      unsubscribe = () => listener.subscription.unsubscribe();
      void boundedReview(() => auth.getSession(), startup.signal).then(({ data, error }) => {
        if (disposed || observed) return;
        if (error) throw error;
        sync(data.session);
      }).catch(() => {
        if (!disposed && !observed) { setSessionPhase("error"); setMessage(loadFailure.current); }
      });
    } catch { setSessionPhase("error"); }
    return () => { disposed = true; startup.abort(); sessionController.current?.abort(); unsubscribe(); };
  }, [load, loadAttempt]);

  async function act(action: "approve" | "request_changes" | "decline") {
    const controller = currentReviewController();
    if (!controller || controller.signal.aborted || actionLock.current || uncertainLock.current || submission?.status !== "submitted") return;
    actionLock.current = true;
    setBusy(action);
    setMessage("");
    try {
      const { response, payload } = await reviewRequest("/api/service-submissions", { method: "PATCH", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ id, action, note, requestedVisibility: visibility, expectedUpdatedAt: submission.updatedAt, reviewToken }) }, controller.signal);
      if (controller.signal.aborted) return;
      const expectedStatus = action === "approve" ? "approved" : action === "request_changes" ? "changes_requested" : "declined";
      if (response.ok && payload?.ok === true && payload.submission?.id === id && payload.submission.status === expectedStatus) {
        setSubmission(payload.submission);
        setMessage(payload.message || ui("ui.app.service.review.id.page.decisionSaved", "Your decision has been saved. The review status is updated."));
      } else if (response.status >= 400 && response.status < 500 && response.status !== 408 && payload?.ok === false) {
        setMessage(payload.message || ui("ui.app.service.review.id.page.33c5da90a70d", "Review action failed."));
      } else { throw new Error("Review result unconfirmed."); }
    } catch {
      if (!controller.signal.aborted) {
        uncertainLock.current = true; setUncertain(true);
        setMessage(ui("ui.app.service.review.id.page.decisionUnconfirmed", "Your decision could not be confirmed. Check the saved review status before trying again."));
      }
    } finally {
      if (!controller.signal.aborted) { actionLock.current = false; setBusy(""); }
    }
  }

  async function checkReviewStatus() {
    const controller = currentReviewController();
    if (!controller || controller.signal.aborted || actionLock.current) return;
    actionLock.current = true; setBusy("checking");
    try {
      const { response, payload } = await reviewRequest(`/api/service-submissions?id=${encodeURIComponent(id)}`, { headers: { authorization: `Bearer ${token}` } }, controller.signal);
      if (controller.signal.aborted) return;
      if (!response.ok || payload?.ok !== true || payload.submission?.id !== id) throw new Error("Review status unavailable.");
      setSubmission(payload.submission); uncertainLock.current = false; setUncertain(false);
      setMessage(payload.submission.status === "submitted"
        ? ui("ui.app.service.review.id.page.decisionStillPending", "The saved review is still awaiting your decision. Review the details before trying again.")
        : ui("ui.app.service.review.id.page.statusChecked", "The saved review status is updated. No decision was sent again."));
    } catch {
      if (!controller.signal.aborted) setMessage(ui("ui.app.service.review.id.page.statusUnavailable", "The saved review status could not be checked. Your decision has not been sent again. Try checking once more."));
    } finally { if (!controller.signal.aborted) { actionLock.current = false; setBusy(""); } }
  }

  const decisionDisabled = Boolean(busy) || uncertain;

  const providerName = submission?.provider?.publicDisplayName || submission?.provider?.businessName || "Service provider";
  return <><Nav /><main className={`service-review-page ${workflow.service}`}><section className="section"><div className="shell service-review-shell">
    <Link className="text-link service-back" href="/dashboard"><ArrowLeft size={16} />{" "}{ui("ui.app.service.review.id.page.97ba1d394fab", "Back to Dashboard")}</Link>
    {sessionPhase === "loading" ? <div className="app-panel" role="status">{ui("ui.app.service.review.id.page.91615589fd8d", "Loading private submission...")}</div> : sessionPhase === "error" ? <div className="app-panel"><h1>{ui("ui.app.service.review.id.page.aefc059cfcc0", "Service review")}</h1><p role="alert">{ui("ui.app.service.review.id.page.5300b43afac1", "Could not load this owner review.")}</p><button className="button" onClick={() => setLoadAttempt(value => value + 1)}>{ui("ui.app.service.review.id.page.retryReview", "Try again")}</button></div> : !token ? <div className="app-panel"><h1>{ui("ui.app.service.review.id.page.0d05a9185174", "Owner sign-in required.")}</h1><p>{ui("ui.app.service.review.id.page.c73c1d43bb78", "This review is private and opens only for the current Profile owner.")}</p><Link className="button" href={`/login?next=${encodeURIComponent(`/service-review/${id}${reviewToken ? `?token=${encodeURIComponent(reviewToken)}` : ""}`)}`}>{ui("ui.app.service.review.id.page.bfd402b2f6f3", "Sign in")}</Link></div> : !submission ? <div className="app-panel"><h1>{ui("ui.app.service.review.id.page.aefc059cfcc0", "Service review")}</h1><p role={message ? "alert" : "status"}>{message || ui("ui.app.service.review.id.page.91615589fd8d", "Loading private submission...")}</p>{message ? <button className="button" onClick={() => setLoadAttempt(value => value + 1)}>{ui("ui.app.service.review.id.page.retryReview", "Try again")}</button> : null}</div> : <>
      <div className="service-review-heading"><div><div className="eyebrow">{ui("ui.app.service.review.id.page.59bef136e388", "Owner service review")}</div><h1>{getContentValue(content, "serviceReview.hero.headline")}</h1><p>{getContentValue(content, "serviceReview.hero.body")}</p><p><strong>{submission.title}</strong> / {submission.profileTitle} <span>({submission.qrCode})</span></p></div><div className={`service-status service-status-${submission.status}`}><Wrench /><div><strong>{submission.status.replace(/_/g, " ")}</strong><span>{submission.evidenceCount}{" "}{ui("ui.app.service.review.id.page.62fcc8c91a9e", "private evidence file(s)")}</span></div></div></div>
      {message && <div className="service-message" role="status">{message}</div>}
      {uncertain && <div className="service-message"><button type="button" className="button" disabled={Boolean(busy)} onClick={() => void checkReviewStatus()}>{busy === "checking" ? ui("ui.app.service.review.id.page.checkingStatus", "Checking status...") : ui("ui.app.service.review.id.page.checkStatus", "Check review status")}</button></div>}
      <div className="service-review-grid"><section className="service-form-section"><div className="service-review-provider"><ShieldCheck /><div><span>{ui("ui.app.service.review.id.page.1c84cbb4698b", "Submitted by")}</span><strong>{providerName}</strong><small>{submission.provider?.verificationStatus === "verified" ? ui("ui.app.service.review.id.page.b9a083114c72", "Verified Service Provider account") : ui("ui.app.service.review.id.page.9b66c02633ca", "Provider account not verified by QRguitar")}{submission.provider?.location ? ui("ui.app.service.review.id.page.972fd71db140", " - {{value1}}", { value1: submission.provider.location }) : ""}</small></div></div><dl className="service-review-facts"><div><dt>{ui("ui.app.service.review.id.page.cdb70ebd5845", "Service date")}</dt><dd>{submission.serviceDate || ui("ui.app.service.review.id.page.d83b9ff3c07a", "Not provided")}</dd></div><div><dt>{ui("ui.app.service.review.id.page.baaddf70fb5d", "Type")}</dt><dd>{submission.serviceType}</dd></div><div><dt>{ui("ui.app.service.review.id.page.ce02285cc14e", "Work order")}</dt><dd>{submission.workOrderReference || ui("ui.app.service.review.id.page.d83b9ff3c07a", "Not provided")}</dd></div><div><dt>{ui("ui.app.service.review.id.page.14064be012d6", "Requested visibility")}</dt><dd>{submission.requestedVisibility}</dd></div></dl><div className="service-review-copy"><h2>{ui("ui.app.service.review.id.page.a303b38a9485", "Work performed")}</h2><p>{submission.workPerformed}</p>{submission.partsInstalled && <><h3>{ui("ui.app.service.review.id.page.023fdc1bf85e", "Parts installed")}</h3><p>{submission.partsInstalled}</p></>}{submission.setupMeasurements && <><h3>{ui("ui.app.service.review.id.page.4821049b4d8b", "Setup measurements")}</h3><p>{submission.setupMeasurements}</p></>}{submission.privateProviderNote && <div className="service-private-copy"><FileLock2 /><div><strong>{ui("ui.app.service.review.id.page.5de4e74d2337", "Private note to owner")}</strong><p>{submission.privateProviderNote}</p></div></div>}</div></section>
      <aside className="service-form-section"><h2>{ui("ui.app.service.review.id.page.d9f533ca8b8b", "Private evidence")}</h2><p>{ui("ui.app.service.review.id.page.79f2364fa7bc", "Evidence is never public automatically.")}</p><p>{ui("ui.app.service.review.id.page.evidenceLinkExpiry", "Private file links expire after five minutes. Refresh the links here if a file no longer opens.")}</p>{evidencePhase === "ready" && <button type="button" className="button secondary" onClick={() => { const controller = currentReviewController(); if (controller) void loadEvidence(token, controller.signal); }}>{ui("ui.app.service.review.id.page.refreshEvidence", "Refresh evidence links")}</button>}<div className="service-evidence-list">{evidencePhase === "loading" ? <p role="status">{ui("ui.app.service.review.id.page.loadingEvidence", "Loading private evidence...")}</p> : evidencePhase === "error" ? <div><p role="alert">{ui("ui.app.service.review.id.page.evidenceUnavailable", "Private evidence could not be loaded. This does not mean no files were uploaded.")}</p><button type="button" className="button secondary" onClick={() => { const controller = currentReviewController(); if (controller) void loadEvidence(token, controller.signal); }}>{ui("ui.app.service.review.id.page.retryEvidence", "Retry evidence")}</button></div> : evidence.length ? evidence.map((file) => <a href={file.previewUrl} target="_blank" rel="noreferrer" key={file.id}><FileLock2 /><span><strong>{file.fileName}</strong><small>{file.type.replace(/_/g, " ")} - {Math.ceil(file.fileSizeBytes / 1024)}{" "}{ui("ui.app.service.review.id.page.59281a6b2935", "KB")}</small></span></a>) : <span>{ui("ui.app.service.review.id.page.33d7d67febd9", "No private evidence uploaded.")}</span>}</div></aside></div>
      {submission.status === "submitted" ? (
      <section className="service-approval-panel"><div><h2>{ui("ui.app.service.review.id.page.82be8fb0e713", "Choose what happens next.")}</h2><p>{ui("ui.app.service.review.id.page.privateDefaultHelp", "Confirm the work to add it to the instrument’s history. Only the recorded service date is public unless you choose to share the report.")}</p></div><label><input type="checkbox" checked={visibility === "public"} onChange={(e) => { if (currentReviewController()) setVisibility(e.target.checked ? "public" : "private"); }} disabled={decisionDisabled} />{ui("ui.app.service.review.id.page.shareDetails", "Share service details on the public Profile")}</label><p>{ui("ui.app.service.review.id.page.privateDefaultNote", "Leave unchecked to keep the report private. Evidence files remain private.")}</p><label>{ui("ui.app.service.review.id.page.863302c01fba", "Owner note")}<textarea value={note} onChange={(e) => { if (currentReviewController()) setNote(e.target.value); }} rows={3} disabled={submission.status !== "submitted" || decisionDisabled} placeholder={ui("ui.app.service.review.id.page.892f746118d8", "Required when requesting changes")} /></label>{submission.status === "submitted" && <div className="service-owner-actions"><button className="button" disabled={decisionDisabled} onClick={() => void act("approve")}>{busy === "approve" ? ui("ui.app.service.review.id.page.cee0e61bdf8c", "Approving...") : getContentValue(content, "serviceReview.actions.approve")}</button><button className="button secondary" disabled={decisionDisabled} onClick={() => void act("request_changes")}>{busy === "request_changes" ? ui("ui.app.service.review.id.page.286a3af7348e", "Sending...") : getContentValue(content, "serviceReview.actions.revise")}</button><button className="button danger" disabled={decisionDisabled} onClick={() => void act("decline")}>{busy === "decline" ? ui("ui.app.service.review.id.page.4b1846c7199c", "Declining...") : getContentValue(content, "serviceReview.actions.decline")}</button></div>}</section>
      ) : (
        <section className="service-approval-panel" aria-labelledby="service-review-outcome-heading">
          <div>
            <h2 id="service-review-outcome-heading">{ui("ui.app.service.review.id.page.savedReviewHeading", "Saved review details")}</h2>
            {submission.status === "approved" ? <div className="service-approved-note"><CheckCircle2 />{" "}{ui("ui.app.service.review.id.page.4c1775dd782f", "Approved service history is now attached to the Profile.")}</div>
              : <p>{submission.status === "changes_requested"
                ? ui("ui.app.service.review.id.page.changesRequestedNext", "Changes requested. The provider can revise and resubmit this request. You can review it again after resubmission.")
                : submission.status === "declined"
                  ? ui("ui.app.service.review.id.page.declinedNext", "This request was declined. No approval can be sent from this review.")
                  : submission.status === "expired"
                    ? ui("ui.app.service.review.id.page.expiredNext", "This request expired. No approval can be sent from this review.")
                    : submission.status === "cancelled"
                      ? ui("ui.app.service.review.id.page.cancelledNext", "This request was cancelled. No approval can be sent from this review.")
                      : ui("ui.app.service.review.id.page.notReviewableNext", "This request is not awaiting an owner decision. Its saved details are shown below.")}</p>}
          </div>
          <div className="service-review-copy">
            <dl className="service-review-facts"><div><dt>{ui("ui.app.service.review.id.page.savedVisibility", "Saved visibility choice")}</dt><dd>{submission.requestedVisibility === "public" ? ui("ui.app.service.review.id.page.1c7c4d4247f6", "Public service history") : ui("ui.app.service.review.id.page.db994c5da409", "Private service history")}</dd></div></dl>
            <h3>{ui("ui.app.service.review.id.page.863302c01fba", "Owner note")}</h3>
            <p>{submission.ownerReviewNote || ui("ui.app.service.review.id.page.noSavedOwnerNote", "No saved owner note.")}</p>
          </div>
          <div><Link className="button" href="/dashboard">{ui("ui.app.service.review.id.page.97ba1d394fab", "Back to Dashboard")}</Link></div>
        </section>
      )}
      {submission?.status === "approved" && <ServiceCorrections key={submission.id} submissionId={submission.id} />}
    </>}
  </div></section></main><Footer /></>;
}
