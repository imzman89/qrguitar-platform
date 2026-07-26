"use client";

import { ArrowLeft, CheckCircle2, FileLock2, Upload, Wrench } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Footer } from "../../../components/Footer";
import { Nav } from "../../../components/Nav";
import { getContentValue } from "../../../lib/content-registry";
import { getSupabaseAccessToken } from "../../../lib/supabase-browser";
import { useSiteContent } from "../../../lib/use-site-content";

const categories = ["Setup", "Repair", "Electronics", "Fretwork", "Structural Repair", "Finish Work", "Restoration", "Modification", "Inspection", "Appraisal", "Amplifier Service", "Other"];
type Submission = { id: string; status: string; profileTitle: string; title: string; emailDeliveryStatus: string; emailDeliveryMessage: string; ownerReviewNote?: string; evidenceCount: number };

export default function ServiceWorkPage() {
  const content = useSiteContent();
  const params = useParams<{ code: string }>();
  const qrCode = decodeURIComponent(params.code || "").toUpperCase();
  const [token, setToken] = useState("");
  const [provider, setProvider] = useState({ businessName: "", publicDisplayName: "", website: "", location: "", serviceCategories: [] as string[] });
  const [form, setForm] = useState({ serviceDate: "", serviceType: "Setup", workOrderReference: "", title: "", workPerformed: "", partsInstalled: "", setupMeasurements: "", recommendedPublicDescription: "", privateProviderNote: "", requestedVisibility: "private" });
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [evidenceType, setEvidenceType] = useState("work_order");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    void getSupabaseAccessToken().then(async (accessToken) => {
      setToken(accessToken);
      if (!accessToken) return;
      const response = await fetch("/api/service-providers", { headers: { authorization: `Bearer ${accessToken}` }, cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (payload.provider) setProvider({ businessName: payload.provider.businessName || "", publicDisplayName: payload.provider.publicDisplayName || "", website: payload.provider.website || "", location: payload.provider.location || "", serviceCategories: payload.provider.serviceCategories || [] });
      if (!response.ok) setMessage(payload.message || "Could not load provider details.");
    });
  }, []);

  async function saveProvider() {
    if (!token) return setMessage("Sign in to create a service-provider profile.");
    setBusy("provider");
    const response = await fetch("/api/service-providers", { method: "PATCH", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(provider) });
    const payload = await response.json().catch(() => ({}));
    setBusy(""); setMessage(payload.message || "Provider details could not be saved.");
    return response.ok;
  }

  async function saveSubmission(action: "save_draft" | "submit" | "revise") {
    if (!token) return setMessage("Sign in as the service provider first.");
    if (!provider.publicDisplayName.trim()) return setMessage("Add the provider name shown to the owner before saving service work.");
    setBusy(action);
    if (!await saveProvider()) { setBusy(""); return; }
    let current = submission;
    if (!current) {
      const create = await fetch("/api/service-submissions", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ qrCode, ...form }) });
      const created = await create.json().catch(() => ({}));
      if (!create.ok) { setBusy(""); setMessage(created.message || "Could not create the private draft."); return; }
      current = created.submission;
      setSubmission(current);
    }
    const response = await fetch("/api/service-submissions", { method: "PATCH", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ id: current?.id, action, ...form }) });
    const payload = await response.json().catch(() => ({}));
    setBusy(""); setMessage(payload.message || "Service request could not be saved.");
    if (payload.submission) setSubmission(payload.submission);
  }

  async function uploadEvidence(file: File | null) {
    if (!file) return;
    if (!submission?.id) { setMessage("Save the private draft before uploading evidence."); return; }
    setBusy("evidence");
    const body = new FormData(); body.append("submissionId", submission.id); body.append("evidenceType", evidenceType); body.append("file", file);
    const response = await fetch("/api/service-evidence", { method: "POST", headers: { authorization: `Bearer ${token}` }, body });
    const payload = await response.json().catch(() => ({}));
    setBusy(""); setMessage(payload.message || "Evidence upload failed.");
    if (response.ok) setSubmission((current) => current ? { ...current, evidenceCount: current.evidenceCount + 1 } : current);
  }

  const closed = submission && !["draft", "changes_requested"].includes(submission.status);

  return <><Nav /><main className="service-work-page"><section className="section"><div className="shell service-work-shell">
    <Link className="text-link service-back" href={`/i/${encodeURIComponent(qrCode)}`}><ArrowLeft size={16} /> Back to Profile</Link>
    <div className="service-work-heading"><div><div className="eyebrow">Service provider workspace</div><h1>{getContentValue(content, "serviceProviders.hero.headline")}</h1><p>{getContentValue(content, "serviceProviders.hero.body")}</p></div><div className="service-privacy-note"><FileLock2 /><strong>Evidence stays private</strong><span>Invoices, slips, measurements, and photos are visible only to the provider, owner, and authorized QRguitar admin.</span></div></div>
    {!token ? <div className="app-panel"><h2>Sign in required</h2><p>Use the provider account that performed the work.</p><Link className="button" href={`/login?next=${encodeURIComponent(`/service-work/${qrCode}`)}`}>Sign in</Link></div> : <>
      {message && <div className="service-message" role="status">{message}</div>}
      {submission && <div className={`service-status service-status-${submission.status}`}><CheckCircle2 /><div><strong>{submission.status.replace(/_/g, " ")}</strong><span>{submission.emailDeliveryMessage || `${submission.evidenceCount} private evidence file${submission.evidenceCount === 1 ? "" : "s"}`}</span></div></div>}
      <section className="service-form-section"><div className="service-form-title"><span>1</span><div><h2>Provider identity</h2><p>This public business identity appears with approved work. Verification can only be assigned by QRguitar admin.</p></div></div><div className="service-field-grid">
        <label>Provider or business name<input value={provider.publicDisplayName} onChange={(e) => setProvider({ ...provider, publicDisplayName: e.target.value })} maxLength={160} /></label>
        <label>Legal/business name (optional)<input value={provider.businessName} onChange={(e) => setProvider({ ...provider, businessName: e.target.value })} maxLength={160} /></label>
        <label>Website (optional)<input value={provider.website} onChange={(e) => setProvider({ ...provider, website: e.target.value })} placeholder="https://" /></label>
        <label>Location (optional)<input value={provider.location} onChange={(e) => setProvider({ ...provider, location: e.target.value })} /></label>
      </div></section>
      <section className="service-form-section"><div className="service-form-title"><span>2</span><div><h2>Completed work</h2><p>Use the language you would put on a clear service invoice.</p></div></div><div className="service-field-grid">
        <label>Service date<input type="date" value={form.serviceDate} onChange={(e) => setForm({ ...form, serviceDate: e.target.value })} /></label>
        <label>Service type<select value={form.serviceType} onChange={(e) => setForm({ ...form, serviceType: e.target.value })}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Work-order or invoice reference (optional)<input value={form.workOrderReference} onChange={(e) => setForm({ ...form, workOrderReference: e.target.value })} maxLength={120} /></label>
        <label>Short title<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Full setup and fret dress" maxLength={180} /></label>
        <label className="service-wide">Work performed<textarea value={form.workPerformed} onChange={(e) => setForm({ ...form, workPerformed: e.target.value })} rows={5} /></label>
        <label>Parts installed (optional)<textarea value={form.partsInstalled} onChange={(e) => setForm({ ...form, partsInstalled: e.target.value })} rows={3} /></label>
        <label>Setup measurements (optional)<textarea value={form.setupMeasurements} onChange={(e) => setForm({ ...form, setupMeasurements: e.target.value })} rows={3} /></label>
      </div></section>
      <section className="service-form-section"><div className="service-form-title"><span>3</span><div><h2>Owner review</h2><p>Recommend what may appear publicly. The owner makes the final visibility choice.</p></div></div><div className="service-field-grid">
        <label className="service-wide">Recommended public description<textarea value={form.recommendedPublicDescription} onChange={(e) => setForm({ ...form, recommendedPublicDescription: e.target.value })} rows={4} /></label>
        <label>Requested visibility<select value={form.requestedVisibility} onChange={(e) => setForm({ ...form, requestedVisibility: e.target.value })}><option value="private">Private service history</option><option value="public">Public service history</option></select></label>
        <label>Private note to owner (optional)<textarea value={form.privateProviderNote} onChange={(e) => setForm({ ...form, privateProviderNote: e.target.value })} rows={3} /></label>
      </div></section>
      <section className="service-form-section"><div className="service-form-title"><span>4</span><div><h2>Private evidence</h2><p>JPG, PNG, WebP, or PDF. Maximum 15 MB per file.</p></div></div><div className="service-evidence-upload"><select value={evidenceType} onChange={(e) => setEvidenceType(e.target.value)}><option value="work_order">Work order</option><option value="invoice">Invoice</option><option value="service_slip">Service slip</option><option value="before_photo">Before photo</option><option value="after_photo">After photo</option><option value="measurement_sheet">Measurement sheet</option><option value="receipt">Receipt</option><option value="other">Other evidence</option></select><label className="button secondary"><Upload size={16} /> {busy === "evidence" ? "Uploading..." : "Upload evidence"}<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => void uploadEvidence(e.target.files?.[0] || null)} hidden disabled={!submission || Boolean(closed)} /></label><span>{submission?.evidenceCount || 0} file(s)</span></div></section>
      {!closed && <div className="service-form-actions"><button className="button secondary" disabled={Boolean(busy)} onClick={() => void saveSubmission("save_draft")}>{busy === "save_draft" ? "Saving..." : "Save private draft"}</button><button className="button" disabled={Boolean(busy)} onClick={() => void saveSubmission(submission?.status === "changes_requested" ? "revise" : "submit")}>{busy === "submit" || busy === "revise" ? "Submitting..." : submission?.status === "changes_requested" ? "Send revised work" : "Submit for owner approval"}</button></div>}
    </>}
  </div></section></main><Footer /></>;
}
