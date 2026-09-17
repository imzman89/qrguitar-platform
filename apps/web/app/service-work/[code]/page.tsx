"use client";

import { ArrowLeft, CheckCircle2, FileLock2, Upload } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { Footer } from "../../../components/Footer";
import { Nav } from "../../../components/Nav";
import { getContentValue } from "../../../lib/content-registry";
import { createBrowserSupabaseClient } from "../../../lib/supabase-browser";
import { createServiceWorkbench, initialWorkbenchState, serviceResumePath, type ProviderForm, type ServiceForm } from "../../../lib/service-workbench";
import { useSiteContent } from "../../../lib/use-site-content";
import styles from "./service-evidence.module.css";

const categories = ["Setup", "Repair", "Electronics", "Fretwork", "Structural Repair", "Finish Work", "Restoration", "Modification", "Inspection", "Appraisal", "Amplifier Service", "Other"];

export default function ServiceWorkPage() {
  return <Suspense fallback={<><Nav /><main className="service-work-page"><section className="section"><div className="shell service-work-shell"><p role="status">Loading service work...</p></div></section></main><Footer /></>}><ServiceWorkRoute /></Suspense>;
}

function ServiceWorkRoute() {
  const params = useParams<{ code: string }>();
  const search = useSearchParams();
  const qrCode = (params.code || "").toUpperCase();
  const requestedId = search.get("submission") || "";
  return <ServiceWorkEditor key={`${qrCode}:${requestedId}`} qrCode={qrCode} requestedId={requestedId} />;
}

function ServiceWorkEditor({ qrCode, requestedId }: { qrCode: string; requestedId: string }) {
  const content = useSiteContent();
  const controller = useRef<ReturnType<typeof createServiceWorkbench> | null>(null);
  const evidenceInput = useRef<HTMLInputElement | null>(null);
  const [state, setState] = useState(initialWorkbenchState);
  const [evidenceType, setEvidenceType] = useState("work_order");
  const [removalId, setRemovalId] = useState("");
  const { provider, form, submission, busy, message } = state;

  useEffect(() => {
    const current = createServiceWorkbench(qrCode, requestedId, { auth: () => createBrowserSupabaseClient().auth });
    controller.current = current;
    const unsubscribe = current.subscribe(setState);
    setState(current.getState());
    void current.start();
    return () => { unsubscribe(); current.dispose(); if (controller.current === current) controller.current = null; };
  }, [qrCode, requestedId]);

  useEffect(() => { setRemovalId(""); }, [state.actorId, submission?.id]);

  useEffect(() => {
    if (!requestedId && submission?.id && !busy && !state.uncertain && state.phase === "ready") {
      window.history.replaceState(null, "", serviceResumePath(qrCode, submission.id));
    }
  }, [qrCode, requestedId, submission?.id, busy, state.phase, state.uncertain]);

  const setProvider = (value: ProviderForm) => controller.current?.setProvider(value);
  const setForm = (value: ServiceForm) => controller.current?.setForm(value);
  const saveSubmission = (action: "save_draft" | "submit" | "revise") => controller.current?.save(action);
  const uploadEvidence = (file: File | null) => controller.current?.upload(file, evidenceType);
  const closed = Boolean(submission && !["draft", "changes_requested"].includes(submission.status));
  const disabled = Boolean(busy) || closed || Boolean(state.uncertain);

  return <><Nav /><main className="service-work-page"><section className="section"><div className="shell service-work-shell">
    <Link className="text-link service-back" href={`/i/${encodeURIComponent(qrCode)}`}><ArrowLeft size={16} /> Back to Profile</Link>
    <p><Link className="text-link" href="/dashboard/service">Recent service work</Link></p>
    <div className="service-work-heading"><div><div className="eyebrow">Service provider workspace</div><h1>{getContentValue(content, "serviceProviders.hero.headline")}</h1><p>{getContentValue(content, "serviceProviders.hero.body")}</p></div><div className="service-privacy-note"><FileLock2 /><strong>{getContentValue(content, "serviceProviders.evidence.label")}</strong><span>{getContentValue(content, "serviceProviders.evidence.help")}</span></div></div>
    {message && <div className="service-message" role="status">{message}</div>}
    {state.phase === "loading" && <div className="app-panel" role="status">Loading your provider account and saved service work...</div>}
    {state.phase === "error" && <div className="app-panel"><h2>Service work could not be loaded</h2><p>Please retry loading before editing this request.</p><button className="button" onClick={() => void controller.current?.reload()}>Retry loading</button></div>}
    {state.phase === "signed-out" && <div className="app-panel"><h2>Sign in required</h2><p>Use the provider account that performed the work.</p><Link className="button" href={`/login?next=${encodeURIComponent(serviceResumePath(qrCode, requestedId))}`}>Sign in</Link></div>}
    {state.phase === "ready" && <>
      {state.duplicateId && <div className="service-message"><p>Opening the existing work order replaces the form below with its saved contents.</p><Link className="text-link" href={serviceResumePath(qrCode, state.duplicateId)}>Resume existing work order</Link></div>}
      {state.uncertain && <div className="service-message">{submission ? <><p>Reloading replaces this form with the saved server version. Check its status before sending or uploading again.</p><button className="button secondary" disabled={Boolean(busy)} onClick={() => void controller.current?.reload()}>Reload saved version</button></> : <Link className="text-link" href="/dashboard/service">Check recent service work</Link>}</div>}
      {submission && <div className={`service-status service-status-${submission.status}`}><CheckCircle2 /><div><strong>{submission.status.replace(/_/g, " ")}</strong><span>{submission.evidenceCount} private evidence file{submission.evidenceCount === 1 ? "" : "s"}</span>{submission.emailDeliveryMessage && <span>{submission.emailDeliveryMessage}</span>}<Link className="text-link" href={serviceResumePath(qrCode, submission.id)}>Saved request link</Link></div></div>}
      {submission?.ownerReviewNote && <div className="service-message"><strong>Owner review note</strong><p style={{ whiteSpace: "pre-wrap" }}>{submission.ownerReviewNote}</p></div>}
      {closed && <p>This request is {submission?.status.replace(/_/g, " ")}. Its work and evidence are read-only.</p>}
      <fieldset disabled={disabled} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <section className="service-form-section"><div className="service-form-title"><span>1</span><div><h2>Provider identity</h2><p>This public business identity appears with approved work. Verification can only be assigned by QRguitar admin.</p></div></div><div className="service-field-grid">
        <label>Provider or business name<input value={provider.publicDisplayName} onChange={(e) => setProvider({ ...provider, publicDisplayName: e.target.value })} maxLength={160} /></label>
        <label>Legal/business name (optional)<input value={provider.businessName} onChange={(e) => setProvider({ ...provider, businessName: e.target.value })} maxLength={160} /></label>
        <label>Website (optional)<input value={provider.website} onChange={(e) => setProvider({ ...provider, website: e.target.value })} placeholder="https://" /></label>
        <label>Location (optional)<input value={provider.location} onChange={(e) => setProvider({ ...provider, location: e.target.value })} maxLength={240} /></label>
      </div></section>
      <section className="service-form-section"><div className="service-form-title"><span>2</span><div><h2>Completed work</h2><p>Use the language you would put on a clear service invoice.</p></div></div><div className="service-field-grid">
        <label>Service date<input type="date" value={form.serviceDate} onChange={(e) => setForm({ ...form, serviceDate: e.target.value })} /></label>
        <label>Service type<select value={form.serviceType} onChange={(e) => setForm({ ...form, serviceType: e.target.value })}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Work-order or invoice reference (optional)<input value={form.workOrderReference} onChange={(e) => setForm({ ...form, workOrderReference: e.target.value })} maxLength={120} /></label>
        <label>Short title<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Full setup and fret dress" maxLength={180} /></label>
        <label className="service-wide">Work performed<textarea value={form.workPerformed} onChange={(e) => setForm({ ...form, workPerformed: e.target.value })} rows={5} maxLength={5000} /></label>
        <label>Parts installed (optional)<textarea value={form.partsInstalled} onChange={(e) => setForm({ ...form, partsInstalled: e.target.value })} rows={3} maxLength={3000} /></label>
        <label>Setup measurements (optional)<textarea value={form.setupMeasurements} onChange={(e) => setForm({ ...form, setupMeasurements: e.target.value })} rows={3} maxLength={3000} /></label>
      </div></section>
      <section className="service-form-section"><div className="service-form-title"><span>3</span><div><h2>Owner review</h2><p>Recommend what may appear publicly. The owner makes the final visibility choice.</p></div></div><div className="service-field-grid">
        <label className="service-wide">Recommended public description<textarea value={form.recommendedPublicDescription} onChange={(e) => setForm({ ...form, recommendedPublicDescription: e.target.value })} rows={4} maxLength={4000} /></label>
        <label>Requested visibility<select value={form.requestedVisibility} onChange={(e) => setForm({ ...form, requestedVisibility: e.target.value })}><option value="private">Private service history</option><option value="public">Public service history</option></select></label>
        <label>{getContentValue(content, "serviceProviders.privateNote.label")} (optional)<textarea value={form.privateProviderNote} onChange={(e) => setForm({ ...form, privateProviderNote: e.target.value })} rows={3} maxLength={4000} /><small>{getContentValue(content, "serviceProviders.privateNote.help")}</small></label>
      </div></section>
      </fieldset>
      <section className="service-form-section"><div className="service-form-title"><span>4</span><div><h2>{getContentValue(content, "serviceProviders.evidence.label")}</h2><p>{getContentValue(content, "serviceProviders.evidence.help")}</p></div></div>
        <fieldset disabled={disabled} className={styles.uploadFieldset}><div className="service-evidence-upload"><select aria-label="Evidence type" value={evidenceType} onChange={(e) => setEvidenceType(e.target.value)}><option value="work_order">Work order</option><option value="invoice">Invoice</option><option value="service_slip">Service slip</option><option value="before_photo">Before photo</option><option value="after_photo">After photo</option><option value="measurement_sheet">Measurement sheet</option><option value="receipt">Receipt</option><option value="other">Other evidence</option></select><button className="button secondary" type="button" disabled={!submission || disabled} onClick={() => evidenceInput.current?.click()}><Upload size={16} aria-hidden="true" /> {busy === "evidence" ? "Uploading..." : "Upload evidence"}</button><input ref={evidenceInput} type="file" aria-label="Private evidence file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => { const file = e.target.files?.[0] || null; e.target.value = ""; void uploadEvidence(file); }} hidden disabled={!submission || disabled} /><span>{submission?.evidenceCount || 0} file(s)</span></div></fieldset>
        <p className={styles.help}>JPG, PNG, WebP, or PDF, up to 15 MB per file. Save a draft before attaching files.</p>
        {submission && <div className={styles.evidence}>
          <div className={styles.evidenceHeading}><h3>Attached evidence</h3><button className="button secondary" type="button" disabled={Boolean(busy) || state.evidenceLoading} onClick={() => { setRemovalId(""); void controller.current?.loadEvidence(); }}>{state.evidenceLoading ? "Loading files…" : state.evidence ? "Refresh file links" : "Load attached files"}</button></div>
          {state.evidenceError && <p role="alert" className={styles.error}>{state.evidenceError}</p>}
          {state.evidenceLoading && <p role="status" className={styles.help}>Loading private attachments…</p>}
          {state.evidence?.length === 0 && <p className={styles.help}>No evidence is attached to this request.</p>}
          {state.evidence && state.evidence.length > 0 && <><ul className={styles.files}>{state.evidence.map((file) => <li key={file.id}>
            <div className={styles.fileInfo}><strong>{file.fileName}</strong><span>{file.type.replace(/_/g, " ")} · {Math.max(1, Math.round(file.fileSizeBytes / 1024))} KB</span></div>
            <div className={styles.fileActions}><a className="button secondary" href={file.previewUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" aria-label={`Open ${file.fileName} in a new tab`}>Open file</a>
              {!closed && (removalId === file.id ? <div className={styles.confirmation}><span>Remove this attachment?</span><button className="button secondary" type="button" disabled={disabled} onClick={() => { setRemovalId(""); void controller.current?.removeEvidence(file.id); }}>Confirm removal</button><button className="button secondary" type="button" disabled={Boolean(busy)} onClick={() => setRemovalId("")}>Keep file</button></div> : <button className="button secondary" type="button" disabled={disabled} aria-label={`Remove ${file.fileName}`} onClick={() => setRemovalId(file.id)}>Remove</button>)}
            </div>
          </li>)}</ul><p className={styles.help}>Private file links expire after five minutes. Refresh them here if a file no longer opens.</p></>}
        </div>}
      </section>
      {!closed && <div className="service-form-actions"><button className="button secondary" disabled={disabled} onClick={() => void saveSubmission("save_draft")}>{busy === "save_draft" ? "Saving..." : getContentValue(content, "serviceProviders.actions.draft")}</button><button className="button" disabled={disabled} onClick={() => void saveSubmission(submission?.status === "changes_requested" ? "revise" : "submit")}>{busy === "submit" || busy === "revise" ? "Submitting..." : submission?.status === "changes_requested" ? "Send revised work" : getContentValue(content, "serviceProviders.actions.submit")}</button></div>}
    </>}
  </div></section></main><Footer /></>;
}
