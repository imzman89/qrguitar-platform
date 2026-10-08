"use client";
import { useUiText } from "../../../components/UiTextProvider";


import workflow from "../../../components/WorkflowWorkspace.module.css";
import { ArrowLeft, CheckCircle2, FileLock2, Upload } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { Footer } from "../../../components/Footer";
import { ServiceCorrections } from "../../../components/ServiceCorrections";
import { Nav } from "../../../components/Nav";
import { getContentValue } from "../../../lib/content-registry";
import { createBrowserSupabaseClient } from "../../../lib/supabase-browser";
import { createServiceWorkbench, initialWorkbenchState, serviceResumePath, type ProviderForm, type ServiceForm } from "../../../lib/service-workbench";
import { useSiteContent } from "../../../lib/use-site-content";
import styles from "./service-evidence.module.css";

const categories = ["Setup", "Repair", "Electronics", "Fretwork", "Structural Repair", "Finish Work", "Restoration", "Modification", "Inspection", "Appraisal", "Amplifier Service", "Other"];

export default function ServiceWorkPage() {
  const ui = useUiText("app.service.work.code.page");
  return <Suspense fallback={<><Nav /><main className={`service-work-page ${workflow.service}`}><section className="section"><div className="shell service-work-shell"><p role="status">{ui("ui.app.service.work.code.page.af8ac9a88c4c", "Loading service work...")}</p></div></section></main><Footer /></>}><ServiceWorkRoute /></Suspense>;
}

function ServiceWorkRoute() {
  const params = useParams<{ code: string }>();
  const search = useSearchParams();
  const qrCode = (params.code || "").toUpperCase();
  const requestedId = search.get("submission") || "";
  return <ServiceWorkEditor key={`${qrCode}:${requestedId}`} qrCode={qrCode} requestedId={requestedId} />;
}

function ServiceWorkEditor({ qrCode, requestedId }: { qrCode: string; requestedId: string }) {
  const ui = useUiText("app.service.work.code.page");
  const content = useSiteContent();
  const controller = useRef<ReturnType<typeof createServiceWorkbench> | null>(null);
  const evidenceInput = useRef<HTMLInputElement | null>(null);
  const [state, setState] = useState(initialWorkbenchState);
  const [evidenceType, setEvidenceType] = useState("work_order");
  const [removalId, setRemovalId] = useState("");
  const [discardUploadId, setDiscardUploadId] = useState("");
  const { provider, form, submission, busy, message } = state;

  useEffect(() => {
    const current = createServiceWorkbench(qrCode, requestedId, { auth: () => createBrowserSupabaseClient().auth });
    controller.current = current;
    const unsubscribe = current.subscribe(setState);
    setState(current.getState());
    void current.start();
    return () => { unsubscribe(); current.dispose(); if (controller.current === current) controller.current = null; };
  }, [qrCode, requestedId]);

  useEffect(() => { setRemovalId(""); setDiscardUploadId(""); if (evidenceInput.current) evidenceInput.current.value = ""; }, [state.actorId, submission?.id]);
  useEffect(() => { setDiscardUploadId(""); }, [state.evidenceRecovery.attempt?.uploadId, state.evidenceRecovery.revision]);

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
  const recovery = state.evidenceRecovery;
  const recoveryBlocked = Boolean(submission && (recovery.phase !== "confirmed" || recovery.attempt || recovery.pendingCount > 0));
  const disabled = Boolean(busy) || closed || Boolean(state.uncertain) || recoveryBlocked;

  return <><Nav /><main className={`service-work-page ${workflow.service}`}><section className="section"><div className="shell service-work-shell">
    <Link className="text-link service-back" href={`/i/${encodeURIComponent(qrCode)}`}><ArrowLeft size={16} />{" "}{ui("ui.app.service.work.code.page.351f14c77161", "Back to Profile")}</Link>
    <p><Link className="text-link" href="/dashboard/service">{ui("ui.app.service.work.code.page.c90563b70285", "Recent service work")}</Link></p>
    <div className="service-work-heading"><div><div className="eyebrow">{ui("ui.app.service.work.code.page.2f5a5daaecd3", "Service provider workspace")}</div><h1>{getContentValue(content, "serviceProviders.hero.headline")}</h1><p>{getContentValue(content, "serviceProviders.hero.body")}</p></div><div className="service-privacy-note"><FileLock2 /><strong>{getContentValue(content, "serviceProviders.evidence.label")}</strong><span>{getContentValue(content, "serviceProviders.evidence.help")}</span></div></div>
    {message && <div className="service-message" role="status">{message}</div>}
    {state.phase === "loading" && <div className="app-panel" role="status">{ui("ui.app.service.work.code.page.d8e474288ebf", "Loading your provider account and saved service work...")}</div>}
    {state.phase === "error" && <div className="app-panel"><h2>{ui("ui.app.service.work.code.page.b2e871df303b", "Service work could not be loaded")}</h2><p>{ui("ui.app.service.work.code.page.b3de94fe0bf6", "Please retry loading before editing this request.")}</p><button className="button" onClick={() => void controller.current?.reload()}>{ui("ui.app.service.work.code.page.a0f859bc4db2", "Retry loading")}</button></div>}
    {state.phase === "signed-out" && <div className="app-panel"><h2>{ui("ui.app.service.work.code.page.255346f25669", "Sign in required")}</h2><p>{ui("ui.app.service.work.code.page.52b77bc36501", "Use the provider account that performed the work.")}</p><Link className="button" href={`/login?next=${encodeURIComponent(serviceResumePath(qrCode, requestedId))}`}>{ui("ui.app.service.work.code.page.bfd402b2f6f3", "Sign in")}</Link></div>}
    {state.phase === "ready" && <>
      {state.duplicateId && <div className="service-message"><p>{ui("ui.app.service.work.code.page.f03121878d3b", "Opening the existing work order replaces the form below with its saved contents.")}</p><Link className="text-link" href={serviceResumePath(qrCode, state.duplicateId)}>{ui("ui.app.service.work.code.page.63d82262033d", "Resume existing work order")}</Link></div>}
      {state.uncertain && <div className="service-message">{submission ? <><p>{ui("ui.app.service.work.code.page.647dec83704a", "Reloading replaces this form with the saved server version. Check its status before sending or uploading again.")}</p><button className="button secondary" disabled={Boolean(busy)} onClick={() => void controller.current?.reload()}>{ui("ui.app.service.work.code.page.3c845b491776", "Reload saved version")}</button></> : <Link className="text-link" href="/dashboard/service">{ui("ui.app.service.work.code.page.f031a55c8dec", "Check recent service work")}</Link>}</div>}
      {submission && <div className={`service-status service-status-${submission.status}`}><CheckCircle2 /><div><strong>{submission.status.replace(/_/g, " ")}</strong><span>{submission.evidenceCount}{" "}{ui("ui.app.service.work.code.page.af263b67ec8c", "private evidence file")}{submission.evidenceCount === 1 ? "" : ui("ui.app.service.work.code.page.043a718774c5", "s")}</span>{submission.emailDeliveryMessage && <span>{submission.emailDeliveryMessage}</span>}<Link className="text-link" href={serviceResumePath(qrCode, submission.id)}>{ui("ui.app.service.work.code.page.ee98de4be087", "Saved request link")}</Link></div></div>}
      {submission?.ownerReviewNote && <div className="service-message"><strong>{ui("ui.app.service.work.code.page.ece7f6e77050", "Owner review note")}</strong><p style={{ whiteSpace: "pre-wrap" }}>{submission.ownerReviewNote}</p></div>}
      {closed && <p>{ui("ui.app.service.work.code.page.b9ef7c86dae4", "This request is")}{" "}{submission?.status.replace(/_/g, " ")}{ui("ui.app.service.work.code.page.805e0758681e", ". Its work and evidence are read-only.")}</p>}
      <fieldset disabled={disabled} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <section className="service-form-section"><div className="service-form-title"><span>1</span><div><h2>{ui("ui.app.service.work.code.page.656eefd90b92", "Provider identity")}</h2><p>{ui("ui.app.service.work.code.page.61253b8818ee", "This public business identity appears with approved work. Verification can only be assigned by QRguitar admin.")}</p></div></div><div className="service-field-grid">
        <label>{ui("ui.app.service.work.code.page.843868d5fda4", "Provider or business name")}<input value={provider.publicDisplayName} onChange={(e) => setProvider({ ...provider, publicDisplayName: e.target.value })} maxLength={160} /></label>
        <label>{ui("ui.app.service.work.code.page.8a7723e9a0e9", "Legal/business name (optional)")}<input value={provider.businessName} onChange={(e) => setProvider({ ...provider, businessName: e.target.value })} maxLength={160} /></label>
        <label>{ui("ui.app.service.work.code.page.0682140845c0", "Website (optional)")}<input value={provider.website} onChange={(e) => setProvider({ ...provider, website: e.target.value })} placeholder="https://" /></label>
        <label>{ui("ui.app.service.work.code.page.9dc1bb315851", "Location (optional)")}<input value={provider.location} onChange={(e) => setProvider({ ...provider, location: e.target.value })} maxLength={240} /></label>
      </div></section>
      <section className="service-form-section"><div className="service-form-title"><span>2</span><div><h2>{ui("ui.app.service.work.code.page.3830f017faf4", "Completed work")}</h2><p>{ui("ui.app.service.work.code.page.171edb766e79", "Use the language you would put on a clear service invoice.")}</p></div></div><div className="service-field-grid">
        <label>{ui("ui.app.service.work.code.page.cdb70ebd5845", "Service date")}<input type="date" value={form.serviceDate} onChange={(e) => setForm({ ...form, serviceDate: e.target.value })} /></label>
        <label>{ui("ui.app.service.work.code.page.5844e6bad41d", "Service type")}<select value={form.serviceType} onChange={(e) => setForm({ ...form, serviceType: e.target.value })}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>{ui("ui.app.service.work.code.page.e3052fa34d51", "Work-order or invoice reference (optional)")}<input value={form.workOrderReference} onChange={(e) => setForm({ ...form, workOrderReference: e.target.value })} maxLength={120} /></label>
        <label>{ui("ui.app.service.work.code.page.0d142aa8971a", "Short title")}<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={ui("ui.app.service.work.code.page.ac529d44701c", "Full setup and fret dress")} maxLength={180} /></label>
        <label className="service-wide">{ui("ui.app.service.work.code.page.a303b38a9485", "Work performed")}<textarea value={form.workPerformed} onChange={(e) => setForm({ ...form, workPerformed: e.target.value })} rows={5} maxLength={5000} /></label>
        <label>{ui("ui.app.service.work.code.page.ab43f9b4bbad", "Parts installed (optional)")}<textarea value={form.partsInstalled} onChange={(e) => setForm({ ...form, partsInstalled: e.target.value })} rows={3} maxLength={3000} /></label>
        <label>{ui("ui.app.service.work.code.page.92af936ad363", "Setup measurements (optional)")}<textarea value={form.setupMeasurements} onChange={(e) => setForm({ ...form, setupMeasurements: e.target.value })} rows={3} maxLength={3000} /></label>
      </div></section>
      <section className="service-form-section"><div className="service-form-title"><span>3</span><div><h2>{ui("ui.app.service.work.code.page.78286bf630f4", "Owner review")}</h2><p>{ui("ui.app.service.work.code.page.88019ac51add", "Recommend what may appear publicly. The owner makes the final visibility choice.")}</p></div></div><div className="service-field-grid">
        <label className="service-wide">{ui("ui.app.service.work.code.page.503de46da32e", "Recommended public description")}<textarea value={form.recommendedPublicDescription} onChange={(e) => setForm({ ...form, recommendedPublicDescription: e.target.value })} rows={4} maxLength={4000} /></label>
        <label>{ui("ui.app.service.work.code.page.14064be012d6", "Requested visibility")}<select value={form.requestedVisibility} onChange={(e) => setForm({ ...form, requestedVisibility: e.target.value })}><option value="private">{ui("ui.app.service.work.code.page.db994c5da409", "Private service history")}</option><option value="public">{ui("ui.app.service.work.code.page.1c7c4d4247f6", "Public service history")}</option></select></label>
        <label>{getContentValue(content, "serviceProviders.privateNote.label")}{" "}{ui("ui.app.service.work.code.page.0059798b7f70", "(optional)")}<textarea value={form.privateProviderNote} onChange={(e) => setForm({ ...form, privateProviderNote: e.target.value })} rows={3} maxLength={4000} /><small>{getContentValue(content, "serviceProviders.privateNote.help")}</small></label>
      </div></section>
      </fieldset>
      <section className="service-form-section"><div className="service-form-title"><span>4</span><div><h2>{getContentValue(content, "serviceProviders.evidence.label")}</h2><p>{getContentValue(content, "serviceProviders.evidence.help")}</p></div></div>
        {submission && <div className={styles.recovery}>
          <div className={styles.evidenceHeading}><h3>{ui("ui.app.service.work.code.page.d2b7fa09d500", "Upload recovery")}</h3><button className="button secondary" type="button" disabled={Boolean(busy) || recovery.phase === "checking"} onClick={() => { setDiscardUploadId(""); void controller.current?.checkEvidenceRecovery(); }}>{recovery.phase === "checking" ? ui("ui.app.service.work.code.page.a89c75376072", "Checking upload status…") : ui("ui.app.service.work.code.page.102806ce5a89", "Check upload status")}</button></div>
          <p className={styles.help}>{ui("ui.app.service.work.code.page.b37b4aa78557", "Checking and reloading only read saved information. They never upload or attach a file.")}</p>
          {recovery.phase === "checking" && <p role="status">{ui("ui.app.service.work.code.page.c14f20525b7c", "Checking for an unfinished upload…")}</p>}
          {recovery.error && <p role="alert" className={styles.error}>{recovery.error}</p>}
          {recovery.phase === "confirmed" && !recovery.attempt && <p className={styles.help}>{ui("ui.app.service.work.code.page.72ff78047875", "No unfinished upload was found.")}</p>}
          {recovery.attempt && <div className={styles.pendingUpload}>
            <strong>{recovery.attempt.fileName}</strong>{recovery.attempt.size > 0 && <span>{recovery.attempt.evidenceType.replace(/_/g, " ")} · {Math.max(1, Math.round(recovery.attempt.size / 1024))}{" "}{ui("ui.app.service.work.code.page.59281a6b2935", "KB")}</span>}
            {recovery.pendingCount > 1 && <p>{recovery.pendingCount}{" "}{ui("ui.app.service.work.code.page.d6461ace970b", "unfinished uploads need review. Resolve this attempt to see the next one.")}</p>}
            <p>{!recovery.attempt.canDiscard ? ui("ui.app.service.work.code.page.fc5811d6512e", "This account cannot change this unfinished upload right now. Check upload status after account access is restored.") : recovery.attempt.bytes === "uploaded" ? closed ? ui("ui.app.service.work.code.page.228571deb201", "The file arrived, but this request is closed. You can discard the unfinished upload; it has not been attached.") : ui("ui.app.service.work.code.page.5e39ab87601b", "The file arrived and is waiting to be attached. Finish this upload or discard it before choosing another file.") : recovery.attempt.bytes === "missing" ? ui("ui.app.service.work.code.page.d241c6ace0a6", "The file has not arrived. Check again if an upload may still be running, or discard this attempt before choosing a file again.") : recovery.attempt.bytes === "mismatch" ? ui("ui.app.service.work.code.page.021cc0ab0131", "The saved file does not match this upload. Discard this unfinished attempt before choosing another file.") : ui("ui.app.service.work.code.page.0e606559fafc", "The result of this upload is not yet confirmed. Check its saved status before continuing.")}</p>
            <div className={styles.recoveryActions}>
              {!closed && recovery.attempt.canFinish && recovery.attempt.bytes === "uploaded" && <button className="button" type="button" disabled={Boolean(busy) || recovery.phase !== "confirmed"} onClick={() => void controller.current?.finishEvidence()}>{busy === "finish-evidence" ? ui("ui.app.service.work.code.page.47e171283955", "Finishing…") : ui("ui.app.service.work.code.page.d229d277ee62", "Finish existing upload")}</button>}
              {recovery.attempt.canDiscard && (discardUploadId === recovery.attempt.uploadId ? <div className={styles.confirmation}><span>{ui("ui.app.service.work.code.page.4bcdf27fbb3b", "Discard this unfinished attempt? It will not attach a file. Already attached evidence is kept.")}</span><button className="button secondary" type="button" disabled={Boolean(busy) || recovery.phase !== "confirmed"} onClick={() => { setDiscardUploadId(""); void controller.current?.discardEvidence(); }}>{ui("ui.app.service.work.code.page.9694c1461a09", "Confirm discard")}</button><button className="button secondary" type="button" disabled={Boolean(busy)} onClick={() => setDiscardUploadId("")}>{ui("ui.app.service.work.code.page.48d1780a0dd9", "Keep attempt")}</button></div> : <button className="button secondary" type="button" disabled={Boolean(busy) || recovery.phase !== "confirmed"} onClick={() => setDiscardUploadId(recovery.attempt!.uploadId)}>{ui("ui.app.service.work.code.page.32447065ae76", "Discard unfinished attempt")}</button>)}
            </div>
          </div>}
        </div>}
        <fieldset disabled={disabled || !recovery.canPrepare} className={styles.uploadFieldset}><div className="service-evidence-upload"><select aria-label={ui("ui.app.service.work.code.page.21656a8049a3", "Evidence type")} value={evidenceType} onChange={(e) => setEvidenceType(e.target.value)}><option value="work_order">{ui("ui.app.service.work.code.page.ce02285cc14e", "Work order")}</option><option value="invoice">{ui("ui.app.service.work.code.page.b832002da297", "Invoice")}</option><option value="service_slip">{ui("ui.app.service.work.code.page.4d5e6b5d893b", "Service slip")}</option><option value="before_photo">{ui("ui.app.service.work.code.page.de5a18e39fd7", "Before photo")}</option><option value="after_photo">{ui("ui.app.service.work.code.page.c1de40f77781", "After photo")}</option><option value="measurement_sheet">{ui("ui.app.service.work.code.page.d62ceba55a6b", "Measurement sheet")}</option><option value="receipt">{ui("ui.app.service.work.code.page.dad5a9692313", "Receipt")}</option><option value="other">{ui("ui.app.service.work.code.page.ce43a37b502e", "Other evidence")}</option></select><button className="button secondary" type="button" disabled={!submission || disabled || !recovery.canPrepare} onClick={() => evidenceInput.current?.click()}><Upload size={16} aria-hidden="true" /> {busy === "evidence" ? ui("ui.app.service.work.code.page.72cb29c90ccd", "Uploading...") : ui("ui.app.service.work.code.page.935c93c2d07d", "Upload evidence")}</button><input ref={evidenceInput} type="file" aria-label={ui("ui.app.service.work.code.page.1e9d76010c32", "Private evidence file")} accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => { const file = e.target.files?.[0] || null; e.target.value = ""; void uploadEvidence(file); }} hidden disabled={!submission || disabled || !recovery.canPrepare} /><span>{submission?.evidenceCount || 0}{" "}{ui("ui.app.service.work.code.page.4db1655483ed", "file(s)")}</span></div></fieldset>
        <p className={styles.help}>{ui("ui.app.service.work.code.page.9d30cfd321ce", "JPG, PNG, WebP, or PDF, up to 15 MB per file. Save a draft before attaching files.")}</p>
        {submission && <div className={styles.evidence}>
          <div className={styles.evidenceHeading}><h3>{ui("ui.app.service.work.code.page.69ffb2c8933d", "Attached evidence")}</h3><button className="button secondary" type="button" disabled={Boolean(busy) || state.evidenceLoading} onClick={() => { setRemovalId(""); void controller.current?.loadEvidence(); }}>{state.evidenceLoading ? ui("ui.app.service.work.code.page.4aed40d2ff15", "Loading files…") : state.evidence ? ui("ui.app.service.work.code.page.c0e24d416c0a", "Refresh file links") : ui("ui.app.service.work.code.page.de4e430f63d7", "Load attached files")}</button></div>
          {state.evidenceError && <p role="alert" className={styles.error}>{state.evidenceError}</p>}
          {state.evidenceLoading && <p role="status" className={styles.help}>{ui("ui.app.service.work.code.page.c3fdceb256b1", "Loading private attachments…")}</p>}
          {state.evidence?.length === 0 && <p className={styles.help}>{ui("ui.app.service.work.code.page.fa4f0e1212cc", "No evidence is attached to this request.")}</p>}
          {state.evidence && state.evidence.length > 0 && <><ul className={styles.files}>{state.evidence.map((file) => <li key={file.id}>
            <div className={styles.fileInfo}><strong>{file.fileName}</strong><span>{file.type.replace(/_/g, " ")} · {Math.max(1, Math.round(file.fileSizeBytes / 1024))}{" "}{ui("ui.app.service.work.code.page.59281a6b2935", "KB")}</span></div>
            <div className={styles.fileActions}><a className="button secondary" href={file.previewUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" aria-label={ui("ui.app.service.work.code.page.9d2666d6ec3b", "Open {{value1}} in a new tab", { value1: file.fileName })}>{ui("ui.app.service.work.code.page.4190c0c7ec72", "Open file")}</a>
              {!closed && (removalId === file.id ? <div className={styles.confirmation}><span>{ui("ui.app.service.work.code.page.c649d0e2fe03", "Remove this attachment?")}</span><button className="button secondary" type="button" disabled={disabled} onClick={() => { setRemovalId(""); void controller.current?.removeEvidence(file.id); }}>{ui("ui.app.service.work.code.page.bb0f9ad6dc33", "Confirm removal")}</button><button className="button secondary" type="button" disabled={Boolean(busy)} onClick={() => setRemovalId("")}>{ui("ui.app.service.work.code.page.cf00c0b1279c", "Keep file")}</button></div> : <button className="button secondary" type="button" disabled={disabled} aria-label={ui("ui.app.service.work.code.page.d2f6b9b77710", "Remove {{value1}}", { value1: file.fileName })} onClick={() => setRemovalId(file.id)}>{ui("ui.app.service.work.code.page.c3812fc4acb8", "Remove")}</button>)}
            </div>
          </li>)}</ul><p className={styles.help}>{ui("ui.app.service.work.code.page.54bd167a5111", "Private file links expire after five minutes. Refresh them here if a file no longer opens.")}</p></>}
        </div>}
      </section>
      {!closed && <div className="service-form-actions"><button className="button secondary" disabled={disabled} onClick={() => void saveSubmission("save_draft")}>{busy === "save_draft" ? ui("ui.app.service.work.code.page.dc85af8f2b1d", "Saving...") : getContentValue(content, "serviceProviders.actions.draft")}</button><button className="button" disabled={disabled} onClick={() => void saveSubmission(submission?.status === "changes_requested" ? "revise" : "submit")}>{busy === "submit" || busy === "revise" ? ui("ui.app.service.work.code.page.64115d5b9c79", "Submitting...") : submission?.status === "changes_requested" ? ui("ui.app.service.work.code.page.0435d1b361c0", "Send revised work") : getContentValue(content, "serviceProviders.actions.submit")}</button></div>}
      {submission?.status === "approved" && <ServiceCorrections key={submission.id} submissionId={submission.id} />}
    </>}
  </div></section></main><Footer /></>;
}
