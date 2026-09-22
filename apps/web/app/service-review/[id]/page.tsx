"use client";
import { useUiText } from "../../../components/UiTextProvider";


import workflow from "../../../components/WorkflowWorkspace.module.css";
import { ArrowLeft, CheckCircle2, FileLock2, ShieldCheck, Wrench } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Footer } from "../../../components/Footer";
import { Nav } from "../../../components/Nav";
import { getContentValue } from "../../../lib/content-registry";
import { getSupabaseAccessToken } from "../../../lib/supabase-browser";
import { useSiteContent } from "../../../lib/use-site-content";

type Evidence = { id: string; type: string; fileName: string; mimeType: string; fileSizeBytes: number; previewUrl: string };
type Submission = { id: string; status: string; qrCode: string; profileTitle: string; serviceDate: string; serviceType: string; title: string; workPerformed: string; partsInstalled: string; setupMeasurements: string; workOrderReference: string; recommendedPublicDescription: string; privateProviderNote: string; ownerReviewNote: string; requestedVisibility: "public" | "private"; evidenceCount: number; provider?: { publicDisplayName: string; businessName: string; location: string; verificationStatus: string }; emailDeliveryStatus: string; activity: Array<{ action: string; note?: string; created_at?: string }> };

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

  const load = useCallback(async (accessToken: string, signal: AbortSignal) => {
    const response = await fetch(`/api/service-submissions?id=${encodeURIComponent(id)}`, { headers: { authorization: `Bearer ${accessToken}` }, cache: "no-store", signal });
    const payload = await response.json().catch(() => ({}));
    if (signal.aborted) return;
    if (!response.ok) { setMessage(payload.message || ui("ui.app.service.review.id.page.5300b43afac1", "Could not load this owner review.")); return; }
    setSubmission(payload.submission); setVisibility(payload.submission?.requestedVisibility || "private");
    const files = await fetch(`/api/service-evidence?submissionId=${encodeURIComponent(id)}`, { headers: { authorization: `Bearer ${accessToken}` }, cache: "no-store", signal });
    const filesPayload = await files.json().catch(() => ({}));
    if (signal.aborted) return;
    if (files.ok) setEvidence(filesPayload.evidence || []);
    await fetch("/api/service-submissions", { method: "PATCH", headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" }, body: JSON.stringify({ id, action: "mark_read" }), signal });
  }, [id]);

  useEffect(() => {
    const controller = new AbortController();
    setSubmission(null);
    setEvidence([]);
    setMessage("");
    void getSupabaseAccessToken()
      .then(async (value) => {
        if (controller.signal.aborted) return;
        setToken(value);
        if (value) await load(value, controller.signal);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : ui("ui.app.service.review.id.page.5300b43afac1", "Could not load this owner review."));
      });
    return () => controller.abort();
  }, [load]);

  async function act(action: "approve" | "request_changes" | "decline") {
    setBusy(action);
    const response = await fetch("/api/service-submissions", { method: "PATCH", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ id, action, note, requestedVisibility: visibility, reviewToken }) });
    const payload = await response.json().catch(() => ({})); setBusy(""); setMessage(payload.message || ui("ui.app.service.review.id.page.33c5da90a70d", "Review action failed."));
    if (payload.submission) setSubmission(payload.submission);
  }

  const providerName = submission?.provider?.publicDisplayName || submission?.provider?.businessName || "Service provider";
  return <><Nav /><main className={`service-review-page ${workflow.service}`}><section className="section"><div className="shell service-review-shell">
    <Link className="text-link service-back" href="/dashboard"><ArrowLeft size={16} />{" "}{ui("ui.app.service.review.id.page.97ba1d394fab", "Back to Dashboard")}</Link>
    {!token ? <div className="app-panel"><h1>{ui("ui.app.service.review.id.page.0d05a9185174", "Owner sign-in required.")}</h1><p>{ui("ui.app.service.review.id.page.c73c1d43bb78", "This review is private and opens only for the current Profile owner.")}</p><Link className="button" href={`/login?next=${encodeURIComponent(`/service-review/${id}${reviewToken ? `?token=${reviewToken}` : ""}`)}`}>{ui("ui.app.service.review.id.page.bfd402b2f6f3", "Sign in")}</Link></div> : !submission ? <div className="app-panel"><h1>{ui("ui.app.service.review.id.page.aefc059cfcc0", "Service review")}</h1><p>{message || ui("ui.app.service.review.id.page.91615589fd8d", "Loading private submission...")}</p></div> : <>
      <div className="service-review-heading"><div><div className="eyebrow">{ui("ui.app.service.review.id.page.59bef136e388", "Owner service review")}</div><h1>{getContentValue(content, "serviceReview.hero.headline")}</h1><p>{getContentValue(content, "serviceReview.hero.body")}</p><p><strong>{submission.title}</strong> / {submission.profileTitle} <span>({submission.qrCode})</span></p></div><div className={`service-status service-status-${submission.status}`}><Wrench /><div><strong>{submission.status.replace(/_/g, " ")}</strong><span>{submission.evidenceCount}{" "}{ui("ui.app.service.review.id.page.62fcc8c91a9e", "private evidence file(s)")}</span></div></div></div>
      {message && <div className="service-message" role="status">{message}</div>}
      <div className="service-review-grid"><section className="service-form-section"><div className="service-review-provider"><ShieldCheck /><div><span>{ui("ui.app.service.review.id.page.1c84cbb4698b", "Submitted by")}</span><strong>{providerName}</strong><small>{submission.provider?.verificationStatus === "verified" ? ui("ui.app.service.review.id.page.b9a083114c72", "Verified Service Provider account") : ui("ui.app.service.review.id.page.9b66c02633ca", "Provider account not verified by QRguitar")}{submission.provider?.location ? ui("ui.app.service.review.id.page.972fd71db140", " - {{value1}}", { value1: submission.provider.location }) : ""}</small></div></div><dl className="service-review-facts"><div><dt>{ui("ui.app.service.review.id.page.cdb70ebd5845", "Service date")}</dt><dd>{submission.serviceDate || ui("ui.app.service.review.id.page.d83b9ff3c07a", "Not provided")}</dd></div><div><dt>{ui("ui.app.service.review.id.page.baaddf70fb5d", "Type")}</dt><dd>{submission.serviceType}</dd></div><div><dt>{ui("ui.app.service.review.id.page.ce02285cc14e", "Work order")}</dt><dd>{submission.workOrderReference || ui("ui.app.service.review.id.page.d83b9ff3c07a", "Not provided")}</dd></div><div><dt>{ui("ui.app.service.review.id.page.14064be012d6", "Requested visibility")}</dt><dd>{submission.requestedVisibility}</dd></div></dl><div className="service-review-copy"><h2>{ui("ui.app.service.review.id.page.a303b38a9485", "Work performed")}</h2><p>{submission.workPerformed}</p>{submission.partsInstalled && <><h3>{ui("ui.app.service.review.id.page.023fdc1bf85e", "Parts installed")}</h3><p>{submission.partsInstalled}</p></>}{submission.setupMeasurements && <><h3>{ui("ui.app.service.review.id.page.4821049b4d8b", "Setup measurements")}</h3><p>{submission.setupMeasurements}</p></>}{submission.privateProviderNote && <div className="service-private-copy"><FileLock2 /><div><strong>{ui("ui.app.service.review.id.page.5de4e74d2337", "Private note to owner")}</strong><p>{submission.privateProviderNote}</p></div></div>}</div></section>
      <aside className="service-form-section"><h2>{ui("ui.app.service.review.id.page.d9f533ca8b8b", "Private evidence")}</h2><p>{ui("ui.app.service.review.id.page.79f2364fa7bc", "Evidence is never public automatically.")}</p><div className="service-evidence-list">{evidence.length ? evidence.map((file) => <a href={file.previewUrl} target="_blank" rel="noreferrer" key={file.id}><FileLock2 /><span><strong>{file.fileName}</strong><small>{file.type.replace(/_/g, " ")} - {Math.ceil(file.fileSizeBytes / 1024)}{" "}{ui("ui.app.service.review.id.page.59281a6b2935", "KB")}</small></span></a>) : <span>{ui("ui.app.service.review.id.page.33d7d67febd9", "No private evidence uploaded.")}</span>}</div></aside></div>
      <section className="service-approval-panel"><div><h2>{ui("ui.app.service.review.id.page.82be8fb0e713", "Choose what happens next.")}</h2><p>{ui("ui.app.service.review.id.page.9ed1aca5fa71", "Approving attaches one canonical service entry to this QRguitar Profile. It confirms that you authorize the entry to appear; it is not an independent guarantee by QRguitar.")}</p></div><label>{ui("ui.app.service.review.id.page.521b694737f0", "Visibility after approval")}<select value={visibility} onChange={(e) => setVisibility(e.target.value as "public" | "private")} disabled={submission.status !== "submitted"}><option value="private">{ui("ui.app.service.review.id.page.db994c5da409", "Private service history")}</option><option value="public">{ui("ui.app.service.review.id.page.1c7c4d4247f6", "Public service history")}</option></select></label><label>{ui("ui.app.service.review.id.page.863302c01fba", "Owner note")}<textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder={ui("ui.app.service.review.id.page.892f746118d8", "Required when requesting changes")} /></label>{submission.status === "submitted" && <div className="service-owner-actions"><button className="button" disabled={Boolean(busy)} onClick={() => void act("approve")}>{busy === "approve" ? ui("ui.app.service.review.id.page.cee0e61bdf8c", "Approving...") : getContentValue(content, "serviceReview.actions.approve")}</button><button className="button secondary" disabled={Boolean(busy)} onClick={() => void act("request_changes")}>{busy === "request_changes" ? ui("ui.app.service.review.id.page.286a3af7348e", "Sending...") : getContentValue(content, "serviceReview.actions.revise")}</button><button className="button danger" disabled={Boolean(busy)} onClick={() => void act("decline")}>{busy === "decline" ? ui("ui.app.service.review.id.page.4b1846c7199c", "Declining...") : getContentValue(content, "serviceReview.actions.decline")}</button></div>}{submission.status === "approved" && <div className="service-approved-note"><CheckCircle2 />{" "}{ui("ui.app.service.review.id.page.4c1775dd782f", "Approved service history is now attached to the Profile.")}</div>}</section>
    </>}
  </div></section></main><Footer /></>;
}
