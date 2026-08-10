"use client";

import { ArrowLeft, CheckCircle2, FileLock2, ShieldCheck, Wrench } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Footer } from "../../../components/Footer";
import { Nav } from "../../../components/Nav";
import { getContentValue } from "../../../lib/content-registry";
import { getSupabaseAccessToken } from "../../../lib/supabase-browser";
import { useSiteContent } from "../../../lib/use-site-content";

type Evidence = { id: string; type: string; fileName: string; mimeType: string; fileSizeBytes: number; previewUrl: string };
type Submission = { id: string; status: string; qrCode: string; profileTitle: string; serviceDate: string; serviceType: string; title: string; workPerformed: string; partsInstalled: string; setupMeasurements: string; workOrderReference: string; recommendedPublicDescription: string; privateProviderNote: string; ownerReviewNote: string; requestedVisibility: "public" | "private"; evidenceCount: number; provider?: { publicDisplayName: string; businessName: string; location: string; verificationStatus: string }; emailDeliveryStatus: string; activity: Array<{ action: string; note?: string; created_at?: string }> };

export default function ServiceReviewPage() {
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

  async function load(accessToken: string) {
    const response = await fetch(`/api/service-submissions?id=${encodeURIComponent(id)}`, { headers: { authorization: `Bearer ${accessToken}` }, cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { setMessage(payload.message || "Could not load this owner review."); return; }
    setSubmission(payload.submission); setVisibility(payload.submission?.requestedVisibility || "private");
    const files = await fetch(`/api/service-evidence?submissionId=${encodeURIComponent(id)}`, { headers: { authorization: `Bearer ${accessToken}` }, cache: "no-store" });
    const filesPayload = await files.json().catch(() => ({})); if (files.ok) setEvidence(filesPayload.evidence || []);
    await fetch("/api/service-submissions", { method: "PATCH", headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" }, body: JSON.stringify({ id, action: "mark_read" }) });
  }

  useEffect(() => { void getSupabaseAccessToken().then((value) => { setToken(value); if (value) void load(value); }); }, [id]);

  async function act(action: "approve" | "request_changes" | "decline") {
    setBusy(action);
    const response = await fetch("/api/service-submissions", { method: "PATCH", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ id, action, note, requestedVisibility: visibility, reviewToken }) });
    const payload = await response.json().catch(() => ({})); setBusy(""); setMessage(payload.message || "Review action failed.");
    if (payload.submission) setSubmission(payload.submission);
  }

  const providerName = submission?.provider?.publicDisplayName || submission?.provider?.businessName || "Service provider";
  return <><Nav /><main className="service-review-page"><section className="section"><div className="shell service-review-shell">
    <Link className="text-link service-back" href="/dashboard"><ArrowLeft size={16} /> Back to Dashboard</Link>
    {!token ? <div className="app-panel"><h1>Owner sign-in required.</h1><p>This review is private and opens only for the current Profile owner.</p><Link className="button" href={`/login?next=${encodeURIComponent(`/service-review/${id}${reviewToken ? `?token=${reviewToken}` : ""}`)}`}>Sign in</Link></div> : !submission ? <div className="app-panel"><h1>Service review</h1><p>{message || "Loading private submission..."}</p></div> : <>
      <div className="service-review-heading"><div><div className="eyebrow">Owner service review</div><h1>{getContentValue(content, "serviceReview.hero.headline")}</h1><p>{getContentValue(content, "serviceReview.hero.body")}</p><p><strong>{submission.title}</strong> / {submission.profileTitle} <span>({submission.qrCode})</span></p></div><div className={`service-status service-status-${submission.status}`}><Wrench /><div><strong>{submission.status.replace(/_/g, " ")}</strong><span>{submission.evidenceCount} private evidence file(s)</span></div></div></div>
      {message && <div className="service-message" role="status">{message}</div>}
      <div className="service-review-grid"><section className="service-form-section"><div className="service-review-provider"><ShieldCheck /><div><span>Submitted by</span><strong>{providerName}</strong><small>{submission.provider?.verificationStatus === "verified" ? "Verified Service Provider account" : "Provider account not verified by QRguitar"}{submission.provider?.location ? ` - ${submission.provider.location}` : ""}</small></div></div><dl className="service-review-facts"><div><dt>Service date</dt><dd>{submission.serviceDate || "Not provided"}</dd></div><div><dt>Type</dt><dd>{submission.serviceType}</dd></div><div><dt>Work order</dt><dd>{submission.workOrderReference || "Not provided"}</dd></div><div><dt>Requested visibility</dt><dd>{submission.requestedVisibility}</dd></div></dl><div className="service-review-copy"><h2>Work performed</h2><p>{submission.workPerformed}</p>{submission.partsInstalled && <><h3>Parts installed</h3><p>{submission.partsInstalled}</p></>}{submission.setupMeasurements && <><h3>Setup measurements</h3><p>{submission.setupMeasurements}</p></>}{submission.privateProviderNote && <div className="service-private-copy"><FileLock2 /><div><strong>Private note to owner</strong><p>{submission.privateProviderNote}</p></div></div>}</div></section>
      <aside className="service-form-section"><h2>Private evidence</h2><p>Evidence is never public automatically.</p><div className="service-evidence-list">{evidence.length ? evidence.map((file) => <a href={file.previewUrl} target="_blank" rel="noreferrer" key={file.id}><FileLock2 /><span><strong>{file.fileName}</strong><small>{file.type.replace(/_/g, " ")} - {Math.ceil(file.fileSizeBytes / 1024)} KB</small></span></a>) : <span>No private evidence uploaded.</span>}</div></aside></div>
      <section className="service-approval-panel"><div><h2>Choose what happens next.</h2><p>Approving attaches one canonical service entry to this QRguitar Profile. It confirms that you authorize the entry to appear; it is not an independent guarantee by QRguitar.</p></div><label>Visibility after approval<select value={visibility} onChange={(e) => setVisibility(e.target.value as "public" | "private")} disabled={submission.status !== "submitted"}><option value="private">Private service history</option><option value="public">Public service history</option></select></label><label>Owner note<textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Required when requesting changes" /></label>{submission.status === "submitted" && <div className="service-owner-actions"><button className="button" disabled={Boolean(busy)} onClick={() => void act("approve")}>{busy === "approve" ? "Approving..." : getContentValue(content, "serviceReview.actions.approve")}</button><button className="button secondary" disabled={Boolean(busy)} onClick={() => void act("request_changes")}>{busy === "request_changes" ? "Sending..." : getContentValue(content, "serviceReview.actions.revise")}</button><button className="button danger" disabled={Boolean(busy)} onClick={() => void act("decline")}>{busy === "decline" ? "Declining..." : getContentValue(content, "serviceReview.actions.decline")}</button></div>}{submission.status === "approved" && <div className="service-approved-note"><CheckCircle2 /> Approved service history is now attached to the Profile.</div>}</section>
    </>}
  </div></section></main><Footer /></>;
}
