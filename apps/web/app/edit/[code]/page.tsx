"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Footer } from "../../../components/Footer";
import { InstrumentPreview } from "../../../components/InstrumentPreview";
import { Nav } from "../../../components/Nav";
import { createSubmissionFingerprint, isRepeatedBrowserSubmission, validateInstrumentSubmission } from "../../../lib/security";
import {
  defaultQrStyle,
  getInstrumentCondition,
  instrumentToProfileUrl,
  type DemoInstrument,
  type QrStyle,
  type ServiceHistoryEntry
} from "../../../lib/local-demo";
import { defaultSiteSettings, readSiteSettings } from "../../../lib/site-settings";
import { createBrowserSupabaseClient, getSupabaseAccessToken } from "../../../lib/supabase-browser";

const emptyForm = {
  name: "",
  brand: "",
  model: "",
  serial: "",
  year: "",
  instrumentType: "",
  builder: "",
  finish: "",
  weight: "",
  instrumentCondition: "used",
  owner: "",
  ownerStatus: "",
  location: "",
  heroImageDataUrl: "",
  summary: "",
  specsNotes: "",
  serviceNotes: "",
  visibility: "public"
};

const managedFieldLabels = new Set(["instrument type", "builder", "finish", "weight", "owner status", "specs notes", "service notes"]);
const serviceEventTypes = ["Setup", "Repair", "Modification", "Pickup Install", "Wiring", "Fretwork", "Inspection", "Appraisal/Review", "Cleaning", "Other"];
const emptyServiceForm = {
  serviceDate: "",
  eventType: "Setup",
  title: "",
  publicDescription: "",
  privateNotes: "",
  shopName: "",
  location: "",
  isPublic: false
};

export default function EditInstrumentPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = params.code?.toUpperCase() || "";
  const [message, setMessage] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [ready, setReady] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [original, setOriginal] = useState<DemoInstrument | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [customFields, setCustomFields] = useState([{ id: "field-1", label: "", value: "" }]);
  const [customLinks, setCustomLinks] = useState([{ id: "link-1", label: "", url: "" }]);
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [documents, setDocuments] = useState<{ id: string; name: string; dataUrl: string; visibility: "public" | "hidden" }[]>([]);
  const [qrStyle, setQrStyle] = useState<QrStyle>(defaultQrStyle);
  const [categoryOptions, setCategoryOptions] = useState(defaultSiteSettings.instrumentCategories);
  const [verificationStatus, setVerificationStatus] = useState<"verified" | "unverified">("unverified");
  const [authenticityStatus, setAuthenticityStatus] = useState<"confirmed" | "unconfirmed">("unconfirmed");
  const [showVerificationBadge, setShowVerificationBadge] = useState(true);
  const [showAuthenticityBadge, setShowAuthenticityBadge] = useState(true);
  const [internalVerificationNote, setInternalVerificationNote] = useState("");
  const [publicVerificationNote, setPublicVerificationNote] = useState("");
  const [internalAuthenticityNote, setInternalAuthenticityNote] = useState("");
  const [publicAuthenticityNote, setPublicAuthenticityNote] = useState("");
  const [canManageVerification, setCanManageVerification] = useState(false);
  const [safetyStatus, setSafetyStatus] = useState<"clear" | "lost" | "stolen" | "recovered">("clear");
  const [publicSafetyNote, setPublicSafetyNote] = useState("");
  const [safetyNote, setSafetyNote] = useState("");
  const [savingSafety, setSavingSafety] = useState(false);
  const [serviceEvents, setServiceEvents] = useState<ServiceHistoryEntry[]>([]);
  const [serviceForm, setServiceForm] = useState(emptyServiceForm);
  const [editingServiceId, setEditingServiceId] = useState("");
  const [savingService, setSavingService] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const syncCategoryOptions = () => setCategoryOptions(readSiteSettings().instrumentCategories);

    syncCategoryOptions();
    window.addEventListener("qrguitar:site-settings", syncCategoryOptions);

    async function loadInstrument() {
      try {
        const supabase = createBrowserSupabaseClient();
        const sessionResult = await supabase.auth.getSession();
        if (!sessionResult.data.session?.user) {
          if (!cancelled) {
            setReady(true);
          }
          return;
        }

        const token = await getSupabaseAccessToken();
        const response = await fetch(`/api/instruments?scope=mine&code=${encodeURIComponent(code)}`, {
          headers: { authorization: `Bearer ${token}` }
        });
        const payload = (await response.json().catch(() => null)) as
          | { ok?: boolean; instrument?: DemoInstrument; message?: string; canManageVerification?: boolean }
          | null;

        if (response.ok && payload?.ok && payload.instrument) {
          const instrument = payload.instrument;

          if (!cancelled) {
            setOriginal(instrument);
            setForm({
              name: instrument.name || "",
              brand: instrument.brand || "",
              model: instrument.model || "",
              serial: instrument.serial || "",
              year: instrument.year || "",
              instrumentType: readManagedField(instrument, "Instrument type", instrument.instrumentType),
              builder: readManagedField(instrument, "Builder", instrument.builder),
              finish: readManagedField(instrument, "Finish", instrument.finish),
              weight: readManagedField(instrument, "Weight"),
              instrumentCondition: getInstrumentCondition(instrument),
              owner: instrument.owner || "",
              ownerStatus: readManagedField(instrument, "Owner status"),
              location: instrument.location || "",
              heroImageDataUrl: instrument.heroImageDataUrl || "",
              summary: instrument.summary || "",
              specsNotes: readManagedField(instrument, "Specs notes"),
              serviceNotes: readManagedField(instrument, "Service notes"),
              visibility: instrument.visibility || "public"
            });
            setCustomFields(normalizeCustomFields(instrument));
            setCustomLinks(normalizeCustomLinks(instrument));
            setGalleryImages(normalizeGalleryImages(instrument));
            setDocuments(normalizeDocumentFiles(instrument));
            setQrStyle(instrument.qrStyle || defaultQrStyle);
            setVerificationStatus(instrument.verificationStatus === "verified" ? "verified" : "unverified");
            setAuthenticityStatus(instrument.authenticityStatus === "confirmed" ? "confirmed" : "unconfirmed");
            setShowVerificationBadge(instrument.showVerificationBadge !== false);
            setShowAuthenticityBadge(instrument.showAuthenticityBadge !== false);
            setInternalVerificationNote(instrument.internalVerificationNote || "");
            setPublicVerificationNote(instrument.publicVerificationNote || "");
            setInternalAuthenticityNote(instrument.internalAuthenticityNote || "");
            setPublicAuthenticityNote(instrument.publicAuthenticityNote || "");
            setSafetyStatus(instrument.safetyStatus === "lost" || instrument.safetyStatus === "stolen" || instrument.safetyStatus === "recovered" ? instrument.safetyStatus : "clear");
            setPublicSafetyNote(instrument.publicSafetyNote || "");
            setSafetyNote(instrument.safetyNote || "");
            setCanManageVerification(Boolean(payload.canManageVerification));
            setServiceEvents(instrument.serviceEvents || []);
            setReady(true);
            void refreshServiceEvents(instrument.qrCode);
          }
          return;
        }

        if (!cancelled) {
          setForbidden(response.status === 403 || response.status === 404);
          setMessage(payload?.message || "This record was not found for your account.");
          setReady(true);
        }
      } catch {
        if (!cancelled) {
          setMessage("Could not load this record. Check your connection and try again.");
          setReady(true);
        }
      }
    }

    void loadInstrument();

    return () => {
      cancelled = true;
      window.removeEventListener("qrguitar:site-settings", syncCategoryOptions);
    };
  }, [code, router]);

  const profileHref = useMemo(() => {
    return original ? instrumentToProfileUrl(original) : `/i/${code}`;
  }, [code, original]);

  function updateField(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateQrStyle(field: keyof QrStyle, value: string | boolean) {
    setQrStyle((current) => ({ ...current, [field]: value }));
  }

  function updateServiceField(field: keyof typeof serviceForm, value: string | boolean) {
    setServiceForm((current) => ({ ...current, [field]: value }));
  }

  async function refreshServiceEvents(qrCode = original?.qrCode || code) {
    if (!qrCode) {
      return;
    }

    const token = await getSupabaseAccessToken();
    const response = await fetch(`/api/service-events?scope=owner&code=${encodeURIComponent(qrCode)}`, {
      cache: "no-store",
      headers: { authorization: `Bearer ${token}` }
    });
    const payload = (await response.json().catch(() => null)) as
      | { ok?: boolean; serviceEvents?: ServiceHistoryEntry[]; message?: string }
      | null;

    if (response.ok && payload?.ok) {
      setServiceEvents(payload.serviceEvents || []);
    }
  }

  function editServiceEvent(entry: ServiceHistoryEntry) {
    setEditingServiceId(entry.id);
    setServiceForm({
      serviceDate: entry.serviceDate || "",
      eventType: entry.eventType || "Other",
      title: entry.title || "",
      publicDescription: entry.publicDescription || "",
      privateNotes: entry.privateNotes || "",
      shopName: entry.shopName || "",
      location: entry.location || "",
      isPublic: entry.isPublic === true
    });
  }

  function resetServiceForm() {
    setEditingServiceId("");
    setServiceForm(emptyServiceForm);
  }

  async function saveServiceEntry() {
    if (!original) {
      return;
    }

    if (!serviceForm.title.trim()) {
      setMessage("Service entry title is required.");
      return;
    }

    setSavingService(true);
    setMessage("");
    try {
      const token = await getSupabaseAccessToken();
      const response = await fetch("/api/service-events", {
        method: editingServiceId ? "PATCH" : "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({
          id: editingServiceId,
          qrCode: original.qrCode,
          ...serviceForm
        })
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; serviceEvent?: ServiceHistoryEntry; message?: string }
        | null;

      if (!response.ok || !payload?.ok || !payload.serviceEvent) {
        setMessage(payload?.message || "Could not save service entry.");
        return;
      }

      setServiceEvents((current) => {
        const next = [payload.serviceEvent as ServiceHistoryEntry, ...current.filter((item) => item.id !== payload.serviceEvent?.id)];
        return sortServiceEvents(next);
      });
      resetServiceForm();
      setMessage(payload.message || "Service entry saved. The permanent QRguitar URL stayed the same.");
    } finally {
      setSavingService(false);
    }
  }

  async function deleteServiceEntry(entry: ServiceHistoryEntry) {
    if (!original) {
      return;
    }

    setSavingService(true);
    setMessage("");
    try {
      const token = await getSupabaseAccessToken();
      const response = await fetch(`/api/service-events?code=${encodeURIComponent(original.qrCode)}&id=${encodeURIComponent(entry.id)}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` }
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;

      if (!response.ok || !payload?.ok) {
        setMessage(payload?.message || "Could not delete service entry.");
        return;
      }

      setServiceEvents((current) => current.filter((item) => item.id !== entry.id));
      if (editingServiceId === entry.id) {
        resetServiceForm();
      }
      setMessage(payload.message || "Service entry deleted.");
    } finally {
      setSavingService(false);
    }
  }

  async function addProfilePhotos(files: FileList | null) {
    if (!files?.length) {
      return;
    }

    const remainingSlots = Math.max(0, 20 - galleryImages.length);
    const selectedFiles = Array.from(files).slice(0, remainingSlots);
    const validation = validateImageFiles(selectedFiles);
    if (!validation.files.length) {
      setMessage(validation.message);
      return;
    }

    const dataUrls = await Promise.all(validation.files.map(fileToCompressedDataUrl));

    setGalleryImages((current) => {
      const next = [...current, ...dataUrls].slice(0, 20);
      setForm((formCurrent) => ({ ...formCurrent, heroImageDataUrl: formCurrent.heroImageDataUrl || next[0] || "" }));
      return next;
    });
    setMessage(`${dataUrls.length} photo${dataUrls.length === 1 ? "" : "s"} added. Choose any photo as the main image.${validation.message ? ` ${validation.message}` : ""}`);
  }

  async function addDocuments(files: FileList | null) {
    if (!files?.length) {
      return;
    }

    const remainingSlots = Math.max(0, 10 - documents.length);
    const selectedFiles = Array.from(files).slice(0, remainingSlots);
    const nextDocs = await Promise.all(
      selectedFiles.map(async (file, index) => ({
        id: `doc-${Date.now()}-${index}`,
        name: file.name,
        dataUrl: await fileToDataUrl(file),
        visibility: "hidden" as const
      }))
    );

    setDocuments((current) => [...current, ...nextDocs].slice(0, 10));
    setMessage(`${nextDocs.length} document${nextDocs.length === 1 ? "" : "s"} added.`);
  }

  function selectMainPhoto(imageUrl: string) {
    setForm((current) => ({ ...current, heroImageDataUrl: imageUrl }));
  }

  function removePhoto(imageUrl: string) {
    setGalleryImages((current) => {
      const next = current.filter((item) => item !== imageUrl);
      setForm((formCurrent) => ({
        ...formCurrent,
        heroImageDataUrl: formCurrent.heroImageDataUrl === imageUrl ? next[0] || "" : formCurrent.heroImageDataUrl
      }));
      return next;
    });
  }

  function buildInstrument(): DemoInstrument | null {
    if (!original) {
      return null;
    }

    return {
      ...original,
      name: form.name.trim() || [form.brand, form.model].filter(Boolean).join(" "),
      brand: form.brand,
      model: form.model,
      serial: form.serial,
      year: form.year,
      instrumentType: form.instrumentType,
      builder: form.builder,
      finish: form.finish,
      instrumentCondition: form.instrumentCondition === "new" ? "new" : "used",
      owner: form.owner,
      location: form.location,
      summary: form.summary,
      visibility: form.visibility === "private" ? "private" : "public",
      galleryImageDataUrls: galleryImages,
      heroImageDataUrl: form.heroImageDataUrl || galleryImages[0] || "",
      customFields: [
        form.weight.trim() ? { id: "weight", label: "Weight", value: form.weight.trim() } : null,
        form.ownerStatus.trim() ? { id: "owner-status", label: "Owner status", value: form.ownerStatus.trim() } : null,
        form.specsNotes.trim() ? { id: "specs-notes", label: "Specs notes", value: form.specsNotes.trim() } : null,
        form.serviceNotes.trim() ? { id: "service-notes", label: "Service notes", value: form.serviceNotes.trim() } : null,
        ...customFields.filter((field) => field.label.trim() && field.value.trim())
      ].filter((field): field is NonNullable<DemoInstrument["customFields"]>[number] => Boolean(field)),
      customLinks: customLinks.filter((link) => link.label.trim() && link.url.trim()),
      documentFiles: documents.map((document) => ({ name: document.name, url: document.dataUrl, visibility: document.visibility })),
      qrStyle,
      qrCode: original.qrCode,
      permanentPath: original.permanentPath,
      ownerUserEmail: original.ownerUserEmail,
      createdAt: original.createdAt
    };
  }

  async function saveChanges(preview = false) {
    const validationMessage = validateInstrumentSubmission(form, honeypot);
    if (validationMessage) {
      setMessage(validationMessage);
      return;
    }

    if (
      typeof window !== "undefined" &&
      isRepeatedBrowserSubmission(`qrguitar.lastEditSubmission.${code}`, createSubmissionFingerprint(form), window)
    ) {
      setMessage("That looks like a repeated submission. Wait a few seconds and try again.");
      return;
    }

    const instrument = buildInstrument();

    if (!instrument) {
      setMessage("This guitar cannot be edited because it was not found.");
      return;
    }

    try {
      const token = await getSupabaseAccessToken();
      const response = await fetch("/api/instruments", {
        method: "PATCH",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({
          qrCode: original?.qrCode || code,
          name: form.name.trim() || [form.brand, form.model].filter(Boolean).join(" "),
          brand: form.brand,
          model: form.model,
          serial: form.serial,
          year: form.year,
          instrumentType: form.instrumentType,
          builder: form.builder,
          finish: form.finish,
          condition: form.instrumentCondition as "new" | "used",
          ownerName: form.owner || "",
          location: form.location,
          visibility: form.visibility as "public" | "private" | "unlisted",
          summary: form.summary || "",
          heroImageDataUrl: form.heroImageDataUrl,
          photos: galleryImages,
          documents: documents.map((document) => ({ name: document.name, dataUrl: document.dataUrl, visibility: document.visibility })),
          customFields: [
            form.weight.trim() ? { label: "Weight", value: form.weight.trim() } : null,
            form.ownerStatus.trim() ? { label: "Owner status", value: form.ownerStatus.trim() } : null,
            form.specsNotes.trim() ? { label: "Specs notes", value: form.specsNotes.trim() } : null,
            form.serviceNotes.trim() ? { label: "Service notes", value: form.serviceNotes.trim() } : null,
            ...customFields
              .filter((field) => field.label.trim() && field.value.trim())
              .map((field) => ({ label: field.label.trim(), value: field.value.trim() }))
          ].filter(Boolean)
        })
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; qrCode?: string; permanentPath?: string; message?: string } | null;

      if (!response.ok || !payload?.ok) {
        setMessage(payload?.message || "Could not save record.");
        return;
      }

      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("qrguitar:catalog-updated"));
      }
      await fetch(`/api/instruments?code=${encodeURIComponent(original?.qrCode || code)}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" }
      }).catch(() => null);
      router.refresh();

      if (preview) {
        router.push(instrumentToProfileUrl(instrument));
        return;
      }

      setOriginal(instrument);
      setMessage("Changes saved. The permanent QRguitar ID and URL stayed the same.");
    } catch {
      setMessage("That photo is too large for browser test storage. Try a smaller image for now.");
    }
  }

  async function saveVerification() {
    if (!original) {
      return;
    }

    try {
      const token = await getSupabaseAccessToken();
      const response = await fetch("/api/instruments", {
        method: "PATCH",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({
          qrCode: original.qrCode || code,
          verificationOnly: true,
          verificationStatus,
          authenticityStatus,
          showVerificationBadge,
          showAuthenticityBadge,
          internalVerificationNote,
          publicVerificationNote,
          internalAuthenticityNote,
          publicAuthenticityNote
        })
      });
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
        verificationStatus?: "verified" | "unverified";
        authenticityStatus?: "confirmed" | "unconfirmed";
        showVerificationBadge?: boolean;
        showAuthenticityBadge?: boolean;
        internalVerificationNote?: string;
        publicVerificationNote?: string;
        internalAuthenticityNote?: string;
        publicAuthenticityNote?: string;
      } | null;

      if (!response.ok || !payload?.ok) {
        setMessage(payload?.message || "Could not update verification.");
        return;
      }

      const nextVerification = payload.verificationStatus || verificationStatus;
      const nextAuthenticity = payload.authenticityStatus || authenticityStatus;
      setVerificationStatus(nextVerification);
      setAuthenticityStatus(nextAuthenticity);
      setShowVerificationBadge(payload.showVerificationBadge !== false);
      setShowAuthenticityBadge(payload.showAuthenticityBadge !== false);
      setInternalVerificationNote(payload.internalVerificationNote || "");
      setPublicVerificationNote(payload.publicVerificationNote || "");
      setInternalAuthenticityNote(payload.internalAuthenticityNote || "");
      setPublicAuthenticityNote(payload.publicAuthenticityNote || "");
      setOriginal({
        ...original,
        verificationStatus: nextVerification,
        authenticityStatus: nextAuthenticity,
        showVerificationBadge: payload.showVerificationBadge !== false,
        showAuthenticityBadge: payload.showAuthenticityBadge !== false,
        internalVerificationNote: payload.internalVerificationNote || "",
        publicVerificationNote: payload.publicVerificationNote || "",
        internalAuthenticityNote: payload.internalAuthenticityNote || "",
        publicAuthenticityNote: payload.publicAuthenticityNote || ""
      });
      setMessage("Trust settings updated. The permanent QRguitar ID and URL stayed the same.");
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("qrguitar:catalog-updated"));
      }
    } catch {
      setMessage("Could not update verification. Check your connection and try again.");
    }
  }

  async function saveSafetyStatus() {
    if (!original) {
      return;
    }

    setSavingSafety(true);
    setMessage("");
    try {
      const token = await getSupabaseAccessToken();
      const response = await fetch("/api/safety-status", {
        method: "PATCH",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({
          qrCode: original.qrCode || code,
          safetyStatus,
          publicSafetyNote,
          safetyNote
        })
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; message?: string; safetyStatus?: "clear" | "lost" | "stolen" | "recovered"; publicSafetyNote?: string; safetyStatusUpdatedAt?: string }
        | null;

      if (!response.ok || !payload?.ok) {
        setMessage(payload?.message || "Could not update safety status.");
        return;
      }

      const nextSafetyStatus = payload.safetyStatus || safetyStatus;
      setSafetyStatus(nextSafetyStatus);
      setPublicSafetyNote(payload.publicSafetyNote || "");
      setOriginal({
        ...original,
        safetyStatus: nextSafetyStatus,
        publicSafetyNote: payload.publicSafetyNote || "",
        safetyStatusUpdatedAt: payload.safetyStatusUpdatedAt || ""
      });
      setMessage("Safety status updated. The permanent QRguitar ID and URL stayed the same.");
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("qrguitar:catalog-updated"));
      }
    } catch {
      setMessage("Could not update safety status. Check your connection and try again.");
    } finally {
      setSavingSafety(false);
    }
  }

  return ready && original && !forbidden ? (
    <>
      <Nav />
      <main className="section create-page">
        <div className="shell split create-layout">
          <div>
            <div className="eyebrow">Edit QRguitar record</div>
            <h2>Edit the profile without changing the permanent QR link.</h2>
            <p>
              Update make, model, serial, optional nickname, specs, links, photos, and QR appearance. The QRguitar ID
              stays locked so printed codes never break.
            </p>
              <div className="permanent-id">
                <span>Locked permanent QRguitar ID</span>
                <strong>{original?.qrCode || code}</strong>
                <small>Editing profile details will not change this URL.</small>
              </div>
              <div className="privacy-toggle" aria-label="Profile visibility">
                <div>
                  <strong>{form.visibility === "public" ? "Public catalog" : "Private link only"}</strong>
                  <span>{form.visibility === "public" ? "Shows on the live homepage feed and catalog." : "Hidden from public browsing. The permanent QR link still works."}</span>
                </div>
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => updateField("visibility", form.visibility === "public" ? "private" : "public")}
                >
                  {form.visibility === "public" ? "Make Private" : "Make Public"}
                </button>
              </div>
              <section className="card verification-card" aria-label="Trust and verification">
                <div>
                  <span className="eyebrow">Trust & Verification</span>
                  <h3>{verificationStatus === "verified" ? "Verified by QRguitar" : "Unverified"}</h3>
                  <p>
                    {verificationStatus === "verified"
                      ? "This record is verified by QRguitar."
                      : "Verified records are available with paid QRguitar verification. Paid verification is handled manually during beta."}
                  </p>
                  <p>
                    {authenticityStatus === "confirmed"
                      ? "Authenticity confirmed by QRguitar from available evidence."
                      : "Authenticity confirmation is available as a paid review feature. Paid verification and authenticity review are handled manually during beta."}
                  </p>
                </div>
                <div className="form-grid">
                  {canManageVerification ? (
                    <>
                    <div className="field">
                      <label htmlFor="verificationStatus">Admin verification status</label>
                      <select
                        id="verificationStatus"
                        value={verificationStatus}
                        onChange={(event) => setVerificationStatus(event.target.value === "verified" ? "verified" : "unverified")}
                      >
                        <option value="unverified">Unverified</option>
                        <option value="verified">Verified</option>
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="authenticityStatus">Admin authenticity status</label>
                      <select
                        id="authenticityStatus"
                        value={authenticityStatus}
                        onChange={(event) => setAuthenticityStatus(event.target.value === "confirmed" ? "confirmed" : "unconfirmed")}
                      >
                        <option value="unconfirmed">Authenticity Unconfirmed</option>
                        <option value="confirmed">Authenticity Confirmed</option>
                      </select>
                    </div>
                    <div className="field custom-wide">
                      <label htmlFor="internalVerificationNote">Internal verification note</label>
                      <textarea id="internalVerificationNote" rows={3} value={internalVerificationNote} onChange={(event) => setInternalVerificationNote(event.target.value)} />
                    </div>
                    <div className="field custom-wide">
                      <label htmlFor="publicVerificationNote">Public verification note</label>
                      <textarea id="publicVerificationNote" rows={3} value={publicVerificationNote} onChange={(event) => setPublicVerificationNote(event.target.value)} />
                    </div>
                    <div className="field custom-wide">
                      <label htmlFor="internalAuthenticityNote">Internal authenticity note</label>
                      <textarea id="internalAuthenticityNote" rows={3} value={internalAuthenticityNote} onChange={(event) => setInternalAuthenticityNote(event.target.value)} />
                    </div>
                    <div className="field custom-wide">
                      <label htmlFor="publicAuthenticityNote">Public authenticity note</label>
                      <textarea id="publicAuthenticityNote" rows={3} value={publicAuthenticityNote} onChange={(event) => setPublicAuthenticityNote(event.target.value)} />
                    </div>
                    </>
                  ) : null}
                  <label className="toggle-field">
                    <input type="checkbox" checked={showVerificationBadge} onChange={(event) => setShowVerificationBadge(event.target.checked)} />
                    Show verification badge publicly
                  </label>
                  <label className="toggle-field">
                    <input type="checkbox" checked={showAuthenticityBadge} onChange={(event) => setShowAuthenticityBadge(event.target.checked)} />
                    Show authenticity badge publicly
                  </label>
                  <button className="button secondary" type="button" onClick={() => void saveVerification()}>
                    Save trust settings
                  </button>
                </div>
              </section>
              <section className="card verification-card" aria-label="Safety status">
                <div>
                  <span className="eyebrow">Safety Status</span>
                  <h3>{safetyStatus === "lost" ? "Reported Lost" : safetyStatus === "stolen" ? "Reported Stolen" : safetyStatus === "recovered" ? "Recovered" : "Clear"}</h3>
                  <p>Mark a record lost or stolen so anyone who scans the QR can see the alert.</p>
                </div>
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="safetyStatus">Current status</label>
                    <select
                      id="safetyStatus"
                      value={safetyStatus}
                      onChange={(event) => setSafetyStatus(event.target.value === "lost" || event.target.value === "stolen" || event.target.value === "recovered" ? event.target.value : "clear")}
                    >
                      <option value="clear">Clear</option>
                      <option value="lost">Lost</option>
                      <option value="stolen">Stolen</option>
                      <option value="recovered">Recovered</option>
                    </select>
                  </div>
                  <div className="field custom-wide">
                    <label htmlFor="publicSafetyNote">Public safety note</label>
                    <textarea
                      id="publicSafetyNote"
                      rows={3}
                      value={publicSafetyNote}
                      onChange={(event) => setPublicSafetyNote(event.target.value)}
                    />
                  </div>
                  <div className="field custom-wide">
                    <label htmlFor="safetyNote">Private/internal note</label>
                    <textarea
                      id="safetyNote"
                      rows={3}
                      value={safetyNote}
                      onChange={(event) => setSafetyNote(event.target.value)}
                    />
                  </div>
                  <button className="button secondary" type="button" onClick={() => void saveSafetyStatus()} disabled={savingSafety}>
                    {savingSafety ? "Saving..." : "Save Safety Status"}
                  </button>
                </div>
              </section>
            <form className="card form">
              <input
                aria-hidden="true"
                autoComplete="off"
                name="company"
                style={{ display: "none" }}
                tabIndex={-1}
                value={honeypot}
                onChange={(event) => setHoneypot(event.target.value)}
              />
              <div className="form-section-heading">
                <span className="eyebrow">Core identity</span>
                <p>Make/model/serial are the main identity. Add anything else only when it helps the record.</p>
              </div>
              <div className="form-grid">
                <Field label="Make / brand" id="brand" value={form.brand} onChange={(value) => updateField("brand", value)} />
                <Field label="Model" id="model" value={form.model} onChange={(value) => updateField("model", value)} />
                <Field label="Serial number" id="serial" value={form.serial} onChange={(value) => updateField("serial", value)} />
                <Field label="Year" id="year" value={form.year} onChange={(value) => updateField("year", value)} />
                <CategoryField
                  label="Type / category"
                  id="instrumentType"
                  value={form.instrumentType}
                  options={categoryOptions}
                  onChange={(value) => updateField("instrumentType", value)}
                />
                <div className="field">
                  <label htmlFor="instrumentCondition">Condition / status</label>
                  <select
                    id="instrumentCondition"
                    value={form.instrumentCondition}
                    onChange={(event) => updateField("instrumentCondition", event.target.value)}
                    required
                  >
                    <option value="new">New</option>
                    <option value="used">Used</option>
                  </select>
                </div>
              </div>
              <details className="advanced-panel">
                <summary>Add Profile Basics</summary>
                <div className="form-grid">
                  <Field label="Display title / nickname" id="name" value={form.name} onChange={(value) => updateField("name", value)} />
                  <Field label="Builder (optional)" id="builder" value={form.builder} onChange={(value) => updateField("builder", value)} />
                  <Field label="Finish" id="finish" value={form.finish} onChange={(value) => updateField("finish", value)} />
                  <Field label="Weight" id="weight" value={form.weight} onChange={(value) => updateField("weight", value)} />
                  <Field label="Owner display" id="owner" value={form.owner} onChange={(value) => updateField("owner", value)} />
                  <Field label="Owner status" id="ownerStatus" value={form.ownerStatus} onChange={(value) => updateField("ownerStatus", value)} />
                  <Field label="Location" id="location" value={form.location} onChange={(value) => updateField("location", value)} />
                </div>
                <div className="field custom-wide">
                  <label htmlFor="summary">Public story</label>
                  <textarea
                    id="summary"
                    name="summary"
                    rows={5}
                    value={form.summary}
                    onChange={(event) => updateField("summary", event.target.value)}
                  />
                </div>
                <div className="field custom-wide">
                  <label htmlFor="specsNotes">Specs notes</label>
                  <textarea
                    id="specsNotes"
                    rows={4}
                    value={form.specsNotes}
                    onChange={(event) => updateField("specsNotes", event.target.value)}
                  />
                </div>
                <div className="field custom-wide">
                  <label htmlFor="serviceNotes">Service notes</label>
                  <textarea
                    id="serviceNotes"
                    rows={4}
                    value={form.serviceNotes}
                    onChange={(event) => updateField("serviceNotes", event.target.value)}
                  />
                </div>
              </details>
              <details className="advanced-panel" open>
                <summary>Add Any Details</summary>
                <div className="custom-list">
                  {customFields.map((field) => (
                    <div className="custom-row" key={field.id}>
                      <input
                        aria-label="Field label"
                        placeholder="Field label, e.g. Builder"
                        value={field.label}
                        onChange={(event) =>
                          setCustomFields((current) =>
                            current.map((item) => item.id === field.id ? { ...item, label: event.target.value } : item)
                          )
                        }
                      />
                      <input
                        aria-label="Field value"
                        placeholder="Value"
                        value={field.value}
                        onChange={(event) =>
                          setCustomFields((current) =>
                            current.map((item) => item.id === field.id ? { ...item, value: event.target.value } : item)
                          )
                        }
                      />
                      <button className="button secondary" type="button" onClick={() => setCustomFields((current) => current.filter((item) => item.id !== field.id))}>
                        Remove
                      </button>
                    </div>
                  ))}
                  <button className="button secondary" type="button" onClick={() => setCustomFields((current) => [...current, { id: `field-${Date.now()}`, label: "", value: "" }])}>
                    Add Detail
                  </button>
                </div>
              </details>
              <details className="advanced-panel" open>
                <summary>Add Website or Social Links</summary>
                <div className="custom-list">
                  {customLinks.map((link) => (
                    <div className="custom-row" key={link.id}>
                      <input
                        aria-label="Link label"
                        placeholder="Label, e.g. Instagram"
                        value={link.label}
                        onChange={(event) =>
                          setCustomLinks((current) =>
                            current.map((item) => item.id === link.id ? { ...item, label: event.target.value } : item)
                          )
                        }
                      />
                      <input
                        aria-label="Link URL"
                        placeholder="https://..."
                        value={link.url}
                        onChange={(event) =>
                          setCustomLinks((current) =>
                            current.map((item) => item.id === link.id ? { ...item, url: event.target.value } : item)
                          )
                        }
                      />
                      <button className="button secondary" type="button" onClick={() => setCustomLinks((current) => current.filter((item) => item.id !== link.id))}>
                        Remove
                      </button>
                    </div>
                  ))}
                  <button className="button secondary" type="button" onClick={() => setCustomLinks((current) => [...current, { id: `link-${Date.now()}`, label: "", url: "" }])}>
                    Add Link
                  </button>
                </div>
              </details>
              <div className="field photo-field">
                <label htmlFor="profilePhotos">Profile photos</label>
                <input
                  id="profilePhotos"
                  name="profilePhotos"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  onChange={(event) => void addProfilePhotos(event.target.files)}
                />
                <span>Upload up to 20 photos. Pick one as the main image for dashboard cards, catalog listings, and the public profile hero.</span>
              </div>
              <div className="field photo-field">
                <label htmlFor="profileDocuments">Documents</label>
                <input
                  id="profileDocuments"
                  name="profileDocuments"
                  type="file"
                  accept="application/pdf,image/png,image/jpeg,image/webp"
                  multiple
                  onChange={(event) => void addDocuments(event.target.files)}
                />
                <span>Upload certificates, receipts, spec sheets, or setup notes. Up to 10 files.</span>
              </div>
              {documents.length ? (
                <section className="photo-manager" aria-label="Document manager">
                  <div className="photo-manager-header">
                    <strong>{documents.length}/10 documents</strong>
                    <span>Documents stay hidden on public listings unless you mark them public.</span>
                  </div>
                  <div className="check-list">
                    {documents.map((document) => (
                      <div className="check-item" key={document.id}>
                        <span>•</span>
                        {document.name}
                        <button
                          className="button secondary"
                          type="button"
                          onClick={() =>
                            setDocuments((current) =>
                              current.map((item) =>
                                item.id === document.id
                                  ? { ...item, visibility: item.visibility === "public" ? "hidden" : "public" }
                                  : item
                              )
                            )
                          }
                        >
                          {document.visibility === "public" ? "Public" : "Hidden"}
                        </button>
                        <button className="button secondary" type="button" onClick={() => setDocuments((current) => current.filter((item) => item.id !== document.id))}>
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
              <PhotoManager
                images={galleryImages}
                mainImage={form.heroImageDataUrl}
                onSelectMain={selectMainPhoto}
                onRemove={removePhoto}
              />
              <section className="qr-customizer" aria-label="Service history">
                <div>
                  <span className="eyebrow">Service history</span>
                  <h3>Service History Timeline</h3>
                  <p>Service history helps keep setups, repairs, modifications, inspections, and ownership records organized over the life of the instrument.</p>
                </div>
                <div className="qr-controls">
                  <div className="field">
                    <label htmlFor="serviceDate">Date</label>
                    <input id="serviceDate" type="date" value={serviceForm.serviceDate} onChange={(event) => updateServiceField("serviceDate", event.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="serviceType">Type</label>
                    <select id="serviceType" value={serviceForm.eventType} onChange={(event) => updateServiceField("eventType", event.target.value)}>
                      {serviceEventTypes.map((type) => <option value={type} key={type}>{type}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="serviceTitle">Title</label>
                    <input id="serviceTitle" value={serviceForm.title} onChange={(event) => updateServiceField("title", event.target.value)} placeholder="Setup, repair, inspection..." />
                  </div>
                  <div className="field">
                    <label htmlFor="serviceShop">Shop/tech/business name</label>
                    <input id="serviceShop" value={serviceForm.shopName} onChange={(event) => updateServiceField("shopName", event.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="serviceLocation">Location</label>
                    <input id="serviceLocation" value={serviceForm.location} onChange={(event) => updateServiceField("location", event.target.value)} />
                  </div>
                  <div className="field custom-wide">
                    <label htmlFor="servicePublicDescription">Public description</label>
                    <textarea id="servicePublicDescription" rows={3} value={serviceForm.publicDescription} onChange={(event) => updateServiceField("publicDescription", event.target.value)} />
                  </div>
                  <div className="field custom-wide">
                    <label htmlFor="servicePrivateNotes">Private notes</label>
                    <textarea id="servicePrivateNotes" rows={3} value={serviceForm.privateNotes} onChange={(event) => updateServiceField("privateNotes", event.target.value)} />
                  </div>
                  <label className="toggle-field">
                    <input type="checkbox" checked={serviceForm.isPublic} onChange={(event) => updateServiceField("isPublic", event.target.checked)} />
                    Show this service entry on the public record
                  </label>
                  <div className="form-actions">
                    <button className="button" type="button" onClick={() => void saveServiceEntry()} disabled={savingService}>
                      {savingService ? "Saving..." : editingServiceId ? "Update Service Entry" : "Save Service Entry"}
                    </button>
                    {editingServiceId ? (
                      <button className="button secondary" type="button" onClick={resetServiceForm}>
                        Cancel Edit
                      </button>
                    ) : null}
                  </div>
                </div>
                {serviceEvents.length ? (
                  <div className="timeline-list">
                    {serviceEvents.map((entry) => (
                      <article className="timeline-item" key={entry.id}>
                        <span>{entry.serviceDate || "Date not listed"} · {entry.isPublic ? "Public" : "Private"}</span>
                        <h3>{entry.title}</h3>
                        <p>{[entry.eventType, entry.shopName, entry.location].filter(Boolean).join(" · ") || "Service entry"}</p>
                        {entry.publicDescription ? <p>{entry.publicDescription}</p> : null}
                        {entry.privateNotes ? <p className="fine-print">Private: {entry.privateNotes}</p> : null}
                        <div className="form-actions">
                          <button className="button secondary" type="button" onClick={() => editServiceEvent(entry)}>
                            Edit Entry
                          </button>
                          <button className="button secondary" type="button" onClick={() => void deleteServiceEntry(entry)} disabled={savingService}>
                            Delete Entry
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="photo-manager empty">
                    <strong>No service history yet</strong>
                    <span>Add setups, repairs, modifications, inspections, cleaning, and maintenance notes here.</span>
                  </div>
                )}
              </section>
              <section className="qr-customizer" aria-label="QR code customization">
                <div>
                  <span className="eyebrow">QR appearance</span>
                  <h3>Customize QR Appearance</h3>
                  <p>Customize the code customers download.</p>
                  <p className="fine-print">Keep strong contrast so the QR remains scannable on stickers, hang tags, plates, and certificates.</p>
                </div>
                <div className="qr-controls">
                  <ColorField label="QR color" value={qrStyle.foreground} onChange={(value) => updateQrStyle("foreground", value)} />
                  <ColorField label="Background" value={qrStyle.background} onChange={(value) => updateQrStyle("background", value)} />
                  <div className="field">
                    <label htmlFor="qrLabel">Label</label>
                    <input id="qrLabel" value={qrStyle.labelText} onChange={(event) => updateQrStyle("labelText", event.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="qrShape">Style</label>
                    <select id="qrShape" value={qrStyle.shape} onChange={(event) => updateQrStyle("shape", event.target.value)}>
                      <option value="classic">Classic print</option>
                      <option value="soft">Soft premium</option>
                    </select>
                  </div>
                  <label className="toggle-field">
                    <input type="checkbox" checked={qrStyle.includeLabel} onChange={(event) => updateQrStyle("includeLabel", event.target.checked)} />
                    Include label on downloaded QR
                  </label>
                </div>
              </section>
              {message ? <p className="form-message">{message}</p> : null}
              <div className="form-actions">
                <button className="button" type="button" onClick={() => void saveChanges(false)}>
                  Save Changes
                </button>
                <button className="button" type="button" onClick={() => void saveChanges(true)}>
                  Save and View Profile
                </button>
                <Link className="button secondary" href="/dashboard">
                  Back to Dashboard
                </Link>
              </div>
            </form>
          </div>

          <aside className="record-preview">
            <InstrumentPreview
              qrCode={original?.qrCode || code}
              name={form.name}
              brand={form.brand}
              model={form.model}
              serial={form.serial}
              year={form.year}
              owner={form.owner}
              location={form.location}
              summary={form.summary}
              heroImageDataUrl={form.heroImageDataUrl}
              customFields={[
                form.instrumentType.trim() ? { id: "preview-type", label: "Type", value: form.instrumentType.trim() } : null,
                form.finish.trim() ? { id: "preview-finish", label: "Finish", value: form.finish.trim() } : null,
                form.weight.trim() ? { id: "preview-weight", label: "Weight", value: form.weight.trim() } : null,
                form.ownerStatus.trim() ? { id: "preview-owner-status", label: "Owner status", value: form.ownerStatus.trim() } : null,
                ...customFields
              ].filter((field): field is NonNullable<DemoInstrument["customFields"]>[number] => Boolean(field))}
              customLinks={customLinks}
            />
          </aside>
        </div>
      </main>
      <Footer />
    </>
  ) : (
    <>
      <Nav />
      <main className="section auth-page">
        <div className="shell">
          <section className="card auth-card">
            <div className="eyebrow">Edit instrument</div>
            <h2>{!ready ? "Checking account..." : forbidden ? "Owner access required." : "Sign in to edit this record."}</h2>
            <p>
              {!ready
                ? "Checking your Supabase session now."
                : forbidden
                  ? message || "Only the record owner can edit this record."
                  : message || "Sign in with the account that owns this QRguitar record."}
            </p>
            {forbidden ? (
              <Link className="button" href="/dashboard">
                Back to Dashboard
              </Link>
            ) : (
              <Link className="button" href={`/login?next=${encodeURIComponent(`/edit/${code}`)}`}>
                Sign in
              </Link>
            )}
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="field color-field">
      <label>{label}</label>
      <div>
        <input type="color" value={value} onChange={(event) => onChange(event.target.value)} aria-label={label} />
        <input value={value} onChange={(event) => onChange(event.target.value)} aria-label={`${label} hex value`} />
      </div>
    </div>
  );
}

function PhotoManager({
  images,
  mainImage,
  onSelectMain,
  onRemove
}: {
  images: string[];
  mainImage: string;
  onSelectMain: (imageUrl: string) => void;
  onRemove: (imageUrl: string) => void;
}) {
  if (!images.length) {
    return (
      <div className="photo-manager empty">
        <strong>No photos yet</strong>
        <span>Add the main instrument photo first, then detail shots, case candy, serials, certificates, and condition photos.</span>
      </div>
    );
  }

  return (
    <section className="photo-manager" aria-label="Profile photo manager">
      <div className="photo-manager-header">
        <strong>{images.length}/20 photos</strong>
        <span>Main photo controls the profile hero and listings.</span>
      </div>
      <div className="photo-grid">
        {images.map((imageUrl, index) => {
          const isMain = imageUrl === mainImage || (!mainImage && index === 0);

          return (
            <article className={isMain ? "photo-tile main" : "photo-tile"} key={`${imageUrl}-${index}`}>
              <img src={imageUrl} alt={`Instrument photo ${index + 1}`} />
              <div>
                <button type="button" onClick={() => onSelectMain(imageUrl)}>
                  {isMain ? "Main Photo" : "Set Main"}
                </button>
                <button type="button" onClick={() => onRemove(imageUrl)}>
                  Remove
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

const MAX_IMAGE_FILE_SIZE = 12 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function validateImageFiles(files: File[]) {
  const valid = files.filter((file) => ACCEPTED_IMAGE_TYPES.has(file.type) && file.size <= MAX_IMAGE_FILE_SIZE);
  const rejected = files.filter((file) => !ACCEPTED_IMAGE_TYPES.has(file.type) || file.size > MAX_IMAGE_FILE_SIZE);

  return {
    files: valid,
    message: rejected.length
      ? `${rejected.length} photo${rejected.length === 1 ? "" : "s"} skipped. Use JPG, PNG, or WebP under 12MB each.`
      : ""
  };
}

function fileToCompressedDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const maxSide = 2000;
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        const context = canvas.getContext("2d");

        if (!context) {
          reject(new Error("Could not prepare image."));
          return;
        }

        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL(file.type === "image/webp" ? "image/webp" : "image/jpeg", 0.88));
      };
      image.onerror = () => reject(new Error("Could not load image."));
      image.src = String(reader.result);
    };

    reader.onerror = () => reject(new Error("Could not read image."));
    reader.readAsDataURL(file);
  });
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

function normalizeGalleryImages(instrument: DemoInstrument) {
  const images = instrument.galleryImageDataUrls?.length
    ? instrument.galleryImageDataUrls
    : instrument.heroImageDataUrl
      ? [instrument.heroImageDataUrl]
      : [];

  return Array.from(new Set(images)).slice(0, 20);
}

function normalizeCustomFields(instrument: DemoInstrument) {
  const legacyFields = [
    { label: "Instrument type", value: instrument.instrumentType },
    { label: "Builder", value: instrument.builder },
    { label: "Finish", value: instrument.finish },
    { label: "Body wood", value: instrument.bodyWood },
    { label: "Neck wood", value: instrument.neckWood },
    { label: "Pickups", value: instrument.pickups }
  ].filter((field) => field.value);

  const fields = instrument.customFields?.length
    ? instrument.customFields.filter((field) => !managedFieldLabels.has(field.label.trim().toLowerCase()))
    : legacyFields.map((field, index) => ({ id: `legacy-field-${index}`, label: field.label, value: String(field.value) }));

  return fields.length ? fields : [{ id: "field-1", label: "", value: "" }];
}

function readManagedField(instrument: DemoInstrument, label: string, fallback = "") {
  const value = instrument.customFields?.find((field) => field.label.trim().toLowerCase() === label.toLowerCase())?.value?.trim();
  return value || fallback || "";
}

function normalizeCustomLinks(instrument: DemoInstrument) {
  const legacyLinks = [
    { label: "Website", url: instrument.websiteUrl },
    { label: "Instagram", url: instrument.instagramUrl },
    { label: "Facebook", url: instrument.facebookUrl },
    { label: "YouTube", url: instrument.youtubeUrl },
    { label: "Reverb", url: instrument.reverbUrl },
    { label: "Shop", url: instrument.shopUrl }
  ].filter((link) => link.url);

  const links = instrument.customLinks?.length
    ? instrument.customLinks
    : legacyLinks.map((link, index) => ({ id: `legacy-link-${index}`, label: link.label, url: String(link.url) }));

  return links.length ? links : [{ id: "link-1", label: "", url: "" }];
}

function normalizeDocumentFiles(instrument: DemoInstrument) {
  const files = instrument.documentFiles?.length
    ? instrument.documentFiles
    : [];

  return files.map((file, index) => ({
    id: `document-${index}`,
    name: file.name,
    dataUrl: file.url,
    visibility: file.visibility === "public" ? "public" as const : "hidden" as const
  }));
}

function sortServiceEvents(events: ServiceHistoryEntry[]) {
  return [...events].sort((first, second) => {
    const firstDate = Date.parse(first.serviceDate || first.createdAt || "");
    const secondDate = Date.parse(second.serviceDate || second.createdAt || "");
    return (Number.isNaN(secondDate) ? 0 : secondDate) - (Number.isNaN(firstDate) ? 0 : firstDate);
  });
}

function Field({
  label,
  id,
  value,
  onChange
}: {
  label: string;
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} name={id} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function CategoryField({
  label,
  id,
  value,
  options,
  onChange
}: {
  label: string;
  id: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const cleanedValue = value.trim();
  const hasCustomValue = cleanedValue && !options.some((option) => option.toLowerCase() === cleanedValue.toLowerCase());

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} name={id} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Select category</option>
        {hasCustomValue ? <option value={cleanedValue}>{cleanedValue}</option> : null}
        {options.map((option) => (
          <option value={option} key={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

