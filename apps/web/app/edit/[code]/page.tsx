"use client";

import { ownerProfileHref } from "../../../lib/owner-profile";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Footer } from "../../../components/Footer";
import { InstrumentPreview } from "../../../components/InstrumentPreview";
import { Nav } from "../../../components/Nav";
import { PhotoOrganizer } from "../../../components/PhotoOrganizer";
import { getContentValue } from "../../../lib/content-registry";
import { createSubmissionFingerprint, isRepeatedBrowserSubmission, validateInstrumentSubmission } from "../../../lib/security";
import {
  defaultQrStyle,
  getInstrumentCondition,
  instrumentToProfileUrl,
  type DemoInstrument,
  type ExternalMediaItem,
  type QrStyle,
  type ServiceHistoryEntry
} from "../../../lib/local-demo";
import { defaultSiteSettings, fetchPublishedSiteSettings } from "../../../lib/site-settings";
import { createBrowserSupabaseClient, getSupabaseAccessToken } from "../../../lib/supabase-browser";
import { qrCodeFromSerial } from "../../../lib/qrguitar-id";
import { canonicalInstrumentBrand, establishedInstrumentBrands } from "../../../lib/instrument-brands";
import { useSiteContent } from "../../../lib/use-site-content";

const emptyForm = {
  name: "",
  brand: "",
  model: "",
  serial: "",
  serialNotUsed: false,
  year: "",
  instrumentType: "",
  builder: "",
  finish: "",
  weight: "",
  instrumentCondition: "used",
  saleStatus: "not_for_sale",
  originalityStatus: "unknown",
  owner: "",
  ownerStatus: "",
  location: "",
  heroImageDataUrl: "",
  summary: "",
  specsNotes: "",
  serviceNotes: "",
  visibility: "public"
};

const managedFieldLabels = new Set(["instrument type", "builder", "finish", "weight", "owner status", "specs notes", "service notes", "sale status", "originality"]);
const serviceEventTypes = ["Ownership", "Purchase", "Sale", "Service", "Setup", "Repair", "Modification", "Restoration", "Inspection", "Appraisal", "Verification", "Safety", "Media", "Documentation", "Other"];
const documentTypeOptions = [
  "Receipt",
  "Bill of Sale",
  "Dealer Invoice",
  "Appraisal",
  "Certificate",
  "Warranty",
  "Build Sheet",
  "Service Invoice",
  "Repair Documentation",
  "Insurance",
  "Manual",
  "Original Case Candy",
  "Ownership Evidence",
  "Other"
];
const oldVerifiedQrLabel = "Scan for verified QRguitar Profile";
const safeDefaultQrLabel = "Scan QRguitar Profile";
const staleDraftValueParts = [
  ["QA", "Lost", "Test"],
  ["PRIVATE", "SAFETY", "NOTE", "SHOULD", "NOT", "LEAK"],
  ["QA", "Public", "Service", "Test"],
  ["QA", "Private", "Service", "Test"],
  ["QA", "Public", "Proof", "Test"],
  ["QA", "Private", "Proof", "Test"],
  ["TEST", "LIVE", "SAVE"],
  ["Cross-Platform", "Live", "Test"]
];
const qaTestStrings = new Set(staleDraftValueParts.map((parts) => parts.join(" ")));
type DocumentDraft = {
  id: string;
  name: string;
  dataUrl: string;
  visibility: "public" | "hidden";
  documentType: string;
  issuerSource: string;
  documentDate: string;
  description: string;
  publicDescription: string;
  privateNotes: string;
  relatedTimelineEventId: string;
  relatedServiceEventId: string;
  createdAt?: string;
};
const emptyServiceForm = {
  serviceDate: "",
  datePrecision: "day",
  category: "Setup",
  eventType: "Setup",
  title: "",
  publicDescription: "",
  privateNotes: "",
  shopName: "",
  location: "",
  workOrderReference: "",
  partsInstalled: "",
  setupMeasurements: "",
  whoPerformed: "unknown",
  isPublic: false
};
const emptyMediaForm = { url: "", title: "", caption: "", isPublic: true };

export default function EditInstrumentPage() {
  const content = useSiteContent();
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
  const [documents, setDocuments] = useState<DocumentDraft[]>([]);
  const [qrStyle, setQrStyle] = useState<QrStyle>(defaultQrStyle);
  const [categoryOptions, setCategoryOptions] = useState(defaultSiteSettings.instrumentCategories);
  const [verificationStatus, setVerificationStatus] = useState<"verified" | "unverified">("unverified");
  const [authenticityStatus, setAuthenticityStatus] = useState<"confirmed" | "unconfirmed">("unconfirmed");
  const [showVerificationBadge, setShowVerificationBadge] = useState(true);
  const [showAuthenticityBadge, setShowAuthenticityBadge] = useState(true);
  const [showSerialPublic, setShowSerialPublic] = useState(false);
  const [serialExceptionApproved, setSerialExceptionApproved] = useState(false);
  const [internalVerificationNote, setInternalVerificationNote] = useState("");
  const [publicVerificationNote, setPublicVerificationNote] = useState("");
  const [internalAuthenticityNote, setInternalAuthenticityNote] = useState("");
  const [publicAuthenticityNote, setPublicAuthenticityNote] = useState("");
  const [canManageVerification, setCanManageVerification] = useState(false);
  const [safetyStatus, setSafetyStatus] = useState<"clear" | "lost" | "stolen" | "recovered">("clear");
  const [publicSafetyNote, setPublicSafetyNote] = useState("");
  const [safetyNote, setSafetyNote] = useState("");
  const [savingSafety, setSavingSafety] = useState(false);
  const [recordSaveAction, setRecordSaveAction] = useState<"save" | "view" | null>(null);
  const savingRecord = recordSaveAction !== null;
  const [serviceEvents, setServiceEvents] = useState<ServiceHistoryEntry[]>([]);
  const [serviceForm, setServiceForm] = useState(emptyServiceForm);
  const [editingServiceId, setEditingServiceId] = useState("");
  const [savingService, setSavingService] = useState(false);
  const [externalMedia, setExternalMedia] = useState<ExternalMediaItem[]>([]);
  const [mediaForm, setMediaForm] = useState(emptyMediaForm);
  const [savingMedia, setSavingMedia] = useState(false);
  const [activeEditorSection, setActiveEditorSection] = useState("identity");

  useEffect(() => {
    const syncSectionFromHash = () => {
      const section = window.location.hash.slice(1);
      if (section) setActiveEditorSection(section);
    };

    syncSectionFromHash();
    window.addEventListener("hashchange", syncSectionFromHash);
    return () => window.removeEventListener("hashchange", syncSectionFromHash);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void fetchPublishedSiteSettings().then((published) => {
      if (!cancelled && published?.instrumentCategories) {
        setCategoryOptions(published.instrumentCategories);
      }
    });

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
              serialNotUsed: !String(instrument.serial || "").trim(),
              year: instrument.year || "",
              instrumentType: readManagedField(instrument, "Instrument type", instrument.instrumentType),
              builder: readManagedField(instrument, "Builder", instrument.builder),
              finish: readManagedField(instrument, "Finish", instrument.finish),
              weight: readManagedField(instrument, "Weight"),
              instrumentCondition: getInstrumentCondition(instrument),
              saleStatus: instrument.saleStatus || "not_for_sale",
              originalityStatus: instrument.originalityStatus || "unknown",
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
            setQrStyle(normalizeQrStyle(instrument.qrStyle));
            setVerificationStatus(instrument.verificationStatus === "verified" ? "verified" : "unverified");
            setAuthenticityStatus(instrument.authenticityStatus === "confirmed" ? "confirmed" : "unconfirmed");
            setShowVerificationBadge(instrument.showVerificationBadge !== false);
            setShowAuthenticityBadge(instrument.showAuthenticityBadge !== false);
            setShowSerialPublic(instrument.showSerialPublic === true);
            setSerialExceptionApproved(instrument.serialExceptionApproved === true);
            setInternalVerificationNote(instrument.internalVerificationNote || "");
            setPublicVerificationNote(instrument.publicVerificationNote || "");
            setInternalAuthenticityNote(instrument.internalAuthenticityNote || "");
            setPublicAuthenticityNote(instrument.publicAuthenticityNote || "");
            setSafetyStatus(instrument.safetyStatus === "lost" || instrument.safetyStatus === "stolen" || instrument.safetyStatus === "recovered" ? instrument.safetyStatus : "clear");
            setPublicSafetyNote(stripQaTestString(instrument.publicSafetyNote || ""));
            setSafetyNote(stripQaTestString(instrument.safetyNote || ""));
            setCanManageVerification(Boolean(payload.canManageVerification));
            setServiceEvents(instrument.serviceEvents || []);
            setReady(true);
            void refreshServiceEvents(instrument.qrCode);
            void refreshExternalMedia(instrument.qrCode);
          }
          return;
        }

        if (!cancelled) {
          setForbidden(response.status === 403 || response.status === 404);
          setMessage(payload?.message || "This Profile was not found for your account.");
          setReady(true);
        }
      } catch {
        if (!cancelled) {
          setMessage("Could not load this Profile. Check your connection and try again.");
          setReady(true);
        }
      }
    }

    void loadInstrument();

    return () => {
      cancelled = true;
    };
  }, [code, router]);

  const profileHref = useMemo(() => {
    return original ? ownerProfileHref(original) : "/dashboard/profile/" + encodeURIComponent(code);
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

  async function refreshExternalMedia(qrCode: string) {
    const token = await getSupabaseAccessToken();
    const response = await fetch(`/api/external-media?scope=owner&code=${encodeURIComponent(qrCode)}`, {
      cache: "no-store",
      headers: { authorization: `Bearer ${token}` }
    });
    const payload = await response.json().catch(() => null) as { ok?: boolean; mediaItems?: ExternalMediaItem[] } | null;
    if (response.ok && payload?.ok) setExternalMedia(payload.mediaItems || []);
  }

  async function addExternalMedia() {
    if (!original) return;
    if (!mediaForm.url.trim() || !mediaForm.title.trim()) {
      setMessage("Media URL and title are required.");
      return;
    }
    setSavingMedia(true);
    setMessage("");
    try {
      const token = await getSupabaseAccessToken();
      const response = await fetch("/api/external-media", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ qrCode: original.qrCode, ...mediaForm, sortOrder: externalMedia.length })
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; mediaItem?: ExternalMediaItem; message?: string } | null;
      if (!response.ok || !payload?.ok || !payload.mediaItem) {
        setMessage(payload?.message || "Could not add media.");
        return;
      }
      setExternalMedia((current) => [...current, payload.mediaItem as ExternalMediaItem]);
      setMediaForm(emptyMediaForm);
      setMessage(payload.message || "Media added.");
    } finally {
      setSavingMedia(false);
    }
  }

  async function removeExternalMedia(item: ExternalMediaItem) {
    if (!original || !window.confirm(`Remove ${item.title}?`)) return;
    setSavingMedia(true);
    try {
      const token = await getSupabaseAccessToken();
      const response = await fetch(`/api/external-media?code=${encodeURIComponent(original.qrCode)}&id=${encodeURIComponent(item.id)}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` }
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; message?: string } | null;
      if (!response.ok || !payload?.ok) {
        setMessage(payload?.message || "Could not remove media.");
        return;
      }
      setExternalMedia((current) => current.filter((entry) => entry.id !== item.id));
      setMessage("Media removed.");
    } finally {
      setSavingMedia(false);
    }
  }

  async function updateExternalMedia(item: ExternalMediaItem, changes: Partial<Pick<ExternalMediaItem, "isPublic" | "sortOrder">>) {
    if (!original) return;
    setSavingMedia(true);
    setMessage("");
    try {
      const token = await getSupabaseAccessToken();
      const response = await fetch("/api/external-media", {
        method: "PATCH",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ qrCode: original.qrCode, id: item.id, ...changes })
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; mediaItem?: ExternalMediaItem; message?: string } | null;
      if (!response.ok || !payload?.ok || !payload.mediaItem) {
        setMessage(payload?.message || "Could not update media.");
        return;
      }
      setExternalMedia((current) => current.map((entry) => entry.id === item.id ? payload.mediaItem as ExternalMediaItem : entry).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)));
      setMessage(payload.message || "Media updated.");
    } finally {
      setSavingMedia(false);
    }
  }

  async function moveExternalMedia(item: ExternalMediaItem, direction: -1 | 1) {
    const index = externalMedia.findIndex((entry) => entry.id === item.id);
    const target = externalMedia[index + direction];
    if (index < 0 || !target) return;
    const currentOrder = item.sortOrder ?? index;
    const targetOrder = target.sortOrder ?? index + direction;
    await updateExternalMedia(item, { sortOrder: targetOrder });
    await updateExternalMedia(target, { sortOrder: currentOrder });
    await refreshExternalMedia(original?.qrCode || "");
  }

  function normalizeQrStyle(style?: QrStyle): QrStyle {
    const next = style || defaultQrStyle;
    return {
      ...next,
      labelText: next.labelText === oldVerifiedQrLabel ? safeDefaultQrLabel : next.labelText || safeDefaultQrLabel
    };
  }

  function stripQaTestString(value: string) {
    const trimmed = String(value || "").trim();
    return qaTestStrings.has(trimmed) ? "" : value;
  }

  function safetyStatusLabel(status: typeof safetyStatus) {
    if (status === "lost") {
      return "Reported Lost";
    }
    if (status === "stolen") {
      return "Reported Stolen";
    }
    if (status === "recovered") {
      return "Recovered";
    }
    return "No Alert";
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
      datePrecision: entry.datePrecision || (entry.serviceDate ? "day" : "unknown"),
      category: entry.category || entry.eventType || "Other",
      eventType: entry.category || entry.eventType || "Other",
      title: entry.title || "",
      publicDescription: entry.publicDescription || "",
      privateNotes: entry.privateNotes || "",
      shopName: entry.shopName || "",
      location: entry.location || "",
      workOrderReference: entry.workOrderReference || "",
      partsInstalled: entry.partsInstalled || "",
      setupMeasurements: entry.setupMeasurements || "",
      whoPerformed: entry.whoPerformed || "unknown",
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
        visibility: "hidden" as const,
        documentType: "Receipt",
        issuerSource: "",
        documentDate: "",
        description: "",
        publicDescription: "",
        privateNotes: "",
        relatedTimelineEventId: "",
        relatedServiceEventId: ""
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

  function movePhoto(fromIndex: number, toIndex: number) {
    setGalleryImages((current) => {
      if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= current.length || toIndex >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
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
      showSerialPublic,
      serialExceptionApproved,
      year: form.year,
      instrumentType: form.instrumentType,
      builder: form.builder,
      finish: form.finish,
      instrumentCondition: form.instrumentCondition === "new" ? "new" : "used",
      saleStatus: form.saleStatus === "for_sale" ? "for_sale" : "not_for_sale",
      originalityStatus: form.originalityStatus === "all_original" ? "all_original" : form.originalityStatus === "modified" ? "modified" : "unknown",
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
      documentFiles: documents.map((document) => ({
        name: document.name,
        url: document.dataUrl,
        visibility: document.visibility,
        documentType: document.documentType,
        issuerSource: document.issuerSource,
        documentDate: document.documentDate,
        description: document.description,
        publicDescription: document.publicDescription,
        privateNotes: document.privateNotes,
        createdAt: document.createdAt
      })),
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

    setRecordSaveAction(preview ? "view" : "save");
    setMessage("");

    try {
      if (!form.heroImageDataUrl && !galleryImages.length) {
        setMessage("Every QRguitar Profile needs at least one photo.");
        return;
      }

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
          serialNotUsed: form.serialNotUsed,
          year: form.year,
          instrumentType: form.instrumentType,
          builder: form.builder,
          finish: form.finish,
          condition: form.instrumentCondition as "new" | "used",
          saleStatus: form.saleStatus as "for_sale" | "not_for_sale",
          originalityStatus: form.originalityStatus as "all_original" | "modified" | "unknown",
          ownerName: form.owner || "",
          location: form.location,
          visibility: form.visibility as "public" | "private" | "unlisted",
          summary: form.summary || "",
          heroImageDataUrl: form.heroImageDataUrl,
          photos: galleryImages,
          documents: documents.map((document) => ({
            name: document.name,
            dataUrl: document.dataUrl,
            visibility: document.visibility,
            documentType: document.documentType,
            issuerSource: document.issuerSource,
            documentDate: document.documentDate,
            description: document.description,
            publicDescription: document.publicDescription,
            privateNotes: document.privateNotes,
            relatedTimelineEventId: document.relatedTimelineEventId,
            relatedServiceEventId: document.relatedServiceEventId
          })),
          customFields: [
            form.weight.trim() ? { label: "Weight", value: form.weight.trim() } : null,
            form.ownerStatus.trim() ? { label: "Owner status", value: form.ownerStatus.trim() } : null,
            form.specsNotes.trim() ? { label: "Specs notes", value: form.specsNotes.trim() } : null,
            form.serviceNotes.trim() ? { label: "Service notes", value: form.serviceNotes.trim() } : null,
            ...customFields
              .filter((field) => field.label.trim() && field.value.trim())
              .map((field) => ({ label: field.label.trim(), value: field.value.trim() }))
          ].filter(Boolean),
          customLinks: customLinks
            .filter((link) => link.label.trim() && link.url.trim())
            .map((link) => ({ label: link.label.trim(), url: link.url.trim() }))
        })
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; qrCode?: string; permanentPath?: string; message?: string } | null;

      if (!response.ok || !payload?.ok) {
        setMessage(`Profile details failed: ${payload?.message || "Could not save the Profile."}`);
        return;
      }

      const savedQrCode = payload.qrCode || original?.qrCode || code;
      const trustResult = await saveVerificationSettings(token || "", savedQrCode);
      if (!trustResult.ok) {
        setMessage(`Trust settings failed: ${trustResult.message}`);
        return;
      }

      const safetyResult = await saveSafetySettings(token || "", savedQrCode);
      if (!safetyResult.ok) {
        setMessage(`Safety status failed: ${safetyResult.message}`);
        return;
      }

      const freshRecord = await fetch(`/api/instruments?scope=mine&code=${encodeURIComponent(savedQrCode)}`, {
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache",
          authorization: `Bearer ${token}`
        }
      })
        .then((result) => result.json())
        .catch(() => null) as { ok?: boolean; instrument?: DemoInstrument } | null;

      const savedInstrument = freshRecord?.ok && freshRecord.instrument
        ? { ...freshRecord.instrument, qrStyle: normalizeQrStyle(freshRecord.instrument.qrStyle) }
        : {
          ...instrument,
          verificationStatus,
          authenticityStatus,
          showVerificationBadge,
          showAuthenticityBadge,
          showSerialPublic,
          serialExceptionApproved,
          internalVerificationNote,
          publicVerificationNote,
          internalAuthenticityNote,
          publicAuthenticityNote,
          safetyStatus,
          publicSafetyNote,
          safetyNote
        };

      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("qrguitar:catalog-updated"));
      }
      await fetch(`/api/instruments?code=${encodeURIComponent(savedQrCode)}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" }
      }).catch(() => null);
      router.refresh();

      if (preview) {
        router.push(savedInstrument.visibility === "public" ? instrumentToProfileUrl(savedInstrument) : "/dashboard");
        return;
      }

      setOriginal(savedInstrument);
      setMessage(savedQrCode !== (original?.qrCode || code)
        ? `Saved as ${savedQrCode}. Previous QR links still open this profile.`
        : "Saved.");
      if (savedQrCode !== code) {
        router.replace(`/edit/${savedQrCode}`);
      }
    } catch {
      setMessage("Profile details failed: check your connection and file sizes, then try again.");
    } finally {
      setRecordSaveAction(null);
    }
  }

  async function saveVerificationSettings(token: string, recordQrCode = original?.qrCode || code) {
    if (!original) {
      return { ok: false, message: "Profile was not loaded." };
    }

    try {
      const response = await fetch("/api/instruments", {
        method: "PATCH",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({
          qrCode: recordQrCode,
          verificationOnly: true,
          verificationStatus,
          authenticityStatus,
          showVerificationBadge,
          showAuthenticityBadge,
          showSerialPublic,
          serialExceptionApproved,
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
        showSerialPublic?: boolean;
        serialExceptionApproved?: boolean;
        internalVerificationNote?: string;
        publicVerificationNote?: string;
        internalAuthenticityNote?: string;
        publicAuthenticityNote?: string;
      } | null;

      if (!response.ok || !payload?.ok) {
        return { ok: false, message: payload?.message || "Could not update verification." };
      }

      const nextVerification = payload.verificationStatus || verificationStatus;
      const nextAuthenticity = payload.authenticityStatus || authenticityStatus;
      setVerificationStatus(nextVerification);
      setAuthenticityStatus(nextAuthenticity);
      setShowVerificationBadge(payload.showVerificationBadge !== false);
      setShowAuthenticityBadge(payload.showAuthenticityBadge !== false);
      setShowSerialPublic(payload.showSerialPublic === true);
      setSerialExceptionApproved(payload.serialExceptionApproved === true);
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
        showSerialPublic: payload.showSerialPublic === true,
        serialExceptionApproved: payload.serialExceptionApproved === true,
        internalVerificationNote: payload.internalVerificationNote || "",
        publicVerificationNote: payload.publicVerificationNote || "",
        internalAuthenticityNote: payload.internalAuthenticityNote || "",
        publicAuthenticityNote: payload.publicAuthenticityNote || ""
      });
      return { ok: true, message: "Trust settings saved." };
    } catch {
      return { ok: false, message: "Could not update verification. Check your connection and try again." };
    }
  }

  async function saveSafetySettings(token: string, recordQrCode = original?.qrCode || code) {
    if (!original) {
      return { ok: false, message: "Profile was not loaded." };
    }

    setSavingSafety(true);
    try {
      const response = await fetch("/api/safety-status", {
        method: "PATCH",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({
          qrCode: recordQrCode,
          safetyStatus,
          publicSafetyNote,
          safetyNote
        })
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; message?: string; safetyStatus?: "clear" | "lost" | "stolen" | "recovered"; publicSafetyNote?: string; safetyStatusUpdatedAt?: string }
        | null;

      if (!response.ok || !payload?.ok) {
        return { ok: false, message: payload?.message || "Could not update safety status." };
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
      return { ok: true, message: "Safety status saved." };
    } catch {
      return { ok: false, message: "Could not update safety status. Check your connection and try again." };
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
            <div className="eyebrow">Edit Profile</div>
            <h1>{getContentValue(content, "edit.hero.headline")}</h1>
            <p>{getContentValue(content, "edit.hero.body")}</p>
              <div className="permanent-id">
                <span>QRguitar ID</span>
                <strong>{qrCodeFromSerial(form.serial) || original?.qrCode || code}</strong>
                <small>When a Serial Number exists, the QRguitar ID uses the format QRG-SERIAL. Previous QR links remain active after approved corrections.</small>
              </div>
              <div className="privacy-toggle" aria-label="Profile visibility">
                <div>
                  <strong>
                    {form.visibility === "public"
                      ? "Public catalog"
                      : form.visibility === "unlisted"
                        ? "Unlisted direct link"
                        : "Private owner only"}
                  </strong>
                  <span>
                    {form.visibility === "public"
                      ? "Shows on the live homepage feed and catalog."
                      : form.visibility === "unlisted"
                        ? "Hidden from browsing, but anyone with the permanent link can view it."
                        : "Hidden from public browsing and direct public access."}
                  </span>
                </div>
                <label className="field visibility-field">
                  <span>Visibility</span>
                  <select value={form.visibility} onChange={(event) => updateField("visibility", event.target.value)}>
                    <option value="public">Public</option>
                    <option value="private">Private</option>
                    <option value="unlisted">Unlisted</option>
                  </select>
                </label>
              </div>
              <nav className="editor-section-nav" aria-label="Edit Profile sections">
                <a aria-current={activeEditorSection === "identity" ? "location" : undefined} href="#identity">Identity</a>
                <a aria-current={activeEditorSection === "photos" ? "location" : undefined} href="#photos">Photos</a>
                <a aria-current={activeEditorSection === "details" ? "location" : undefined} href="#details">Details</a>
                <a aria-current={activeEditorSection === "timeline" ? "location" : undefined} href="#timeline">Timeline &amp; Ownership</a>
                <a aria-current={activeEditorSection === "service" ? "location" : undefined} href="#service">Service</a>
                <a aria-current={activeEditorSection === "media" ? "location" : undefined} href="#media">Media</a>
                <a aria-current={activeEditorSection === "documents" ? "location" : undefined} href="#documents">Documents</a>
                <a aria-current={activeEditorSection === "privacy-safety" ? "location" : undefined} href="#privacy-safety">Privacy &amp; Safety</a>
                <a aria-current={activeEditorSection === "qr-print" ? "location" : undefined} href="#qr-print">QR &amp; Print</a>
              </nav>
              <label className="editor-section-select">
                <span>Current section</span>
                <select
                  aria-label="Edit Profile section"
                  value={activeEditorSection}
                  onChange={(event) => {
                    const section = event.target.value;
                    setActiveEditorSection(section);
                    window.history.replaceState(null, "", `#${section}`);
                    document.getElementById(section)?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                >
                  <option value="identity">Identity</option>
                  <option value="photos">Photos</option>
                  <option value="details">Details</option>
                  <option value="timeline">Timeline &amp; Ownership</option>
                  <option value="service">Service</option>
                  <option value="media">Media</option>
                  <option value="documents">Documents</option>
                  <option value="privacy-safety">Privacy &amp; Safety</option>
                  <option value="qr-print">QR &amp; Print</option>
                </select>
              </label>
              <section className="card verification-card" aria-label="Trust and verification">
                <div>
                  <span className="eyebrow">Trust & Verification</span>
                  <h3>{verificationStatus === "verified" ? "Verified by QRguitar" : "Unverified"}</h3>
                  <p>
                    {verificationStatus === "verified"
                      ? "This Profile is verified by QRguitar."
                      : "Verified Profiles are available with paid QRguitar verification. Paid verification is handled manually during beta."}
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
                    <div className="form-section-heading custom-wide">
                      <span className="eyebrow">Admin Trust Controls</span>
                      <p>Set binary trust badges and notes. These changes save through the main Save Changes button.</p>
                    </div>
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
                    <label className="toggle-field custom-wide">
                      <input type="checkbox" checked={serialExceptionApproved} onChange={(event) => setSerialExceptionApproved(event.target.checked)} />
                      Approve verification/authenticity exception for a no-serial brand, retailer, or build
                    </label>
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
                    Show authenticity status publicly
                  </label>
                  {authenticityStatus === "confirmed" && !showAuthenticityBadge ? <p className="field-note custom-wide">Authenticity is confirmed, but the public badge is currently hidden. Turn this on and use Save Changes to publish it.</p> : null}
                </div>
              </section>
              <section className="card verification-card" id="privacy-safety" aria-label="Lost or stolen alert">
                <div>
                  <span className="eyebrow">Lost / Stolen Alert</span>
                  <h3>{safetyStatusLabel(safetyStatus)}</h3>
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
                      <option value="clear">No Alert</option>
                      <option value="lost">Reported Lost</option>
                      <option value="stolen">Reported Stolen</option>
                      <option value="recovered">Recovered</option>
                    </select>
                  </div>
                  {safetyStatus === "clear" ? (
                    <div className="field custom-wide">
                      <label>No public safety alert</label>
                      <span className="fine-print">No public safety alert is shown while status is No Alert.</span>
                    </div>
                  ) : (
                    <div className="field custom-wide">
                      <label htmlFor="publicSafetyNote">Public safety note</label>
                      <textarea
                        id="publicSafetyNote"
                        rows={3}
                        value={publicSafetyNote}
                        onChange={(event) => setPublicSafetyNote(event.target.value)}
                        placeholder={safetyStatus === "lost" ? "Reported Lost: This instrument has been marked lost by the current owner." : safetyStatus === "stolen" ? "Reported Stolen: This instrument has been marked stolen by the current owner." : "Recovered status note."}
                      />
                    </div>
                  )}
                  <div className="field custom-wide">
                    <label htmlFor="safetyNote">Private/internal note</label>
                    <textarea
                      id="safetyNote"
                      rows={3}
                      value={safetyNote}
                      onChange={(event) => setSafetyNote(event.target.value)}
                    />
                  </div>
                </div>
              </section>
            <form className="card form" id="identity">
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
                <p>Make/model/serial are the main identity. Add anything else only when it helps the profile.</p>
              </div>
              <div className="form-grid" id="details">
                <Field
                  label="Make / brand"
                  id="brand"
                  value={form.brand}
                  list="qrguitar-known-brands"
                  placeholder="Start typing a brand"
                  onChange={(value) => updateField("brand", value)}
                  onBlur={(value) => updateField("brand", canonicalInstrumentBrand(value) || value.trim())}
                />
                <Field label="Model" id="model" value={form.model} onChange={(value) => updateField("model", value)} />
                <Field label="Serial Number" id="serial" value={form.serial} onChange={(value) => updateField("serial", value)} />
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
                <div className="field">
                  <label htmlFor="saleStatus">Availability</label>
                  <select
                    id="saleStatus"
                    value={form.saleStatus}
                    onChange={(event) => updateField("saleStatus", event.target.value)}
                    required
                  >
                    <option value="not_for_sale">Not for Sale</option>
                    <option value="for_sale">For Sale</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="originalityStatus">Originality</label>
                  <select
                    id="originalityStatus"
                    value={form.originalityStatus}
                    onChange={(event) => updateField("originalityStatus", event.target.value)}
                    required
                  >
                    <option value="unknown">Not Specified</option>
                    <option value="all_original">All Original</option>
                    <option value="modified">Modified</option>
                  </select>
                </div>
              </div>
              <datalist id="qrguitar-known-brands">
                {establishedInstrumentBrands.map((brand) => <option value={brand} key={brand} />)}
              </datalist>
              <div className="form-grid compact">
                <label className="toggle-field">
                  <input
                    type="checkbox"
                    checked={form.serialNotUsed}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        serialNotUsed: event.target.checked,
                        serial: event.target.checked ? "" : current.serial
                      }))
                    }
                  />
                  This instrument does not use a Serial Number
                </label>
                <label className="toggle-field">
                  <input type="checkbox" checked={showSerialPublic} onChange={(event) => setShowSerialPublic(event.target.checked)} />
                  Show Serial Number on public Profile
                </label>
              </div>
              <p className="fine-print">
                This hides only the Serial Number field. The permanent QR ID and URL may still include the serial. Choose a private Profile to restrict access. No-serial records require QRguitar approval before verification or authenticity confirmation.
              </p>
              <p className="fine-print">
                Originality is an owner-stated modification status for search and disclosure. It is not QRguitar authentication or verification.
              </p>
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
              <div className="field photo-field" id="documents">
                <label htmlFor="profileDocuments">Documents</label>
                <input
                  id="profileDocuments"
                  name="profileDocuments"
                  type="file"
                  accept="application/pdf,image/png,image/jpeg,image/webp"
                  multiple
                  onChange={(event) => void addDocuments(event.target.files)}
                />
                <span>Store receipts, invoices, build sheets, service slips, appraisal notes, and authenticity evidence with the QRguitar Profile. Up to 10 files.</span>
              </div>
              {documents.length ? (
                <section className="photo-manager proof-vault" aria-label="Proof Vault document manager">
                  <div className="photo-manager-header">
                    <strong>Documents</strong>
                    <span>{documents.length}/10 files. Private documents can support QRguitar verification and authenticity review during beta.</span>
                  </div>
                  <div className="proof-vault-list">
                    {documents.map((document) => (
                      <div className="proof-vault-item" key={document.id}>
                        <div className="proof-vault-item-header">
                          <strong>{document.name || "Untitled document"}</strong>
                          <span className={document.visibility === "public" ? "status-pill verified-pill" : "status-pill neutral-pill"}>
                            {document.visibility === "public" ? "Public" : "Private"}
                          </span>
                        </div>
                        <div className="form-grid compact">
                          <div className="field">
                            <label htmlFor={`${document.id}-title`}>Title</label>
                            <input
                              id={`${document.id}-title`}
                              value={document.name}
                              onChange={(event) =>
                                setDocuments((current) => current.map((item) => item.id === document.id ? { ...item, name: event.target.value } : item))
                              }
                            />
                          </div>
                          <div className="field">
                            <label htmlFor={`${document.id}-type`}>Document type</label>
                            <select
                              id={`${document.id}-type`}
                              value={document.documentType}
                              onChange={(event) =>
                                setDocuments((current) => current.map((item) => item.id === document.id ? { ...item, documentType: event.target.value } : item))
                              }
                            >
                              {documentTypeOptions.map((type) => <option value={type} key={type}>{type}</option>)}
                            </select>
                          </div>
                        </div>
                        <div className="form-grid compact">
                          <div className="field">
                            <label htmlFor={`${document.id}-issuer`}>Issuer or source</label>
                            <input id={`${document.id}-issuer`} value={document.issuerSource} onChange={(event) => setDocuments((current) => current.map((item) => item.id === document.id ? { ...item, issuerSource: event.target.value } : item))} placeholder="Dealer, shop, builder, or owner" />
                          </div>
                          <div className="field">
                            <label htmlFor={`${document.id}-date`}>Document date</label>
                            <input id={`${document.id}-date`} type="date" value={document.documentDate} onChange={(event) => setDocuments((current) => current.map((item) => item.id === document.id ? { ...item, documentDate: event.target.value } : item))} />
                          </div>
                        </div>
                        <div className="field">
                          <label htmlFor={`${document.id}-description`}>Description</label>
                          <textarea id={`${document.id}-description`} value={document.description} onChange={(event) => setDocuments((current) => current.map((item) => item.id === document.id ? { ...item, description: event.target.value } : item))} placeholder="What this document establishes or contains." />
                        </div>
                        <div className="field">
                          <label htmlFor={`${document.id}-timeline`}>Related Timeline entry</label>
                          <select
                            id={`${document.id}-timeline`}
                            value={document.relatedTimelineEventId}
                            onChange={(event) => {
                              const relatedId = event.target.value;
                              const isServiceEntry = serviceEvents.some((entry) => entry.id === relatedId);
                              setDocuments((current) => current.map((item) => item.id === document.id
                                ? { ...item, relatedTimelineEventId: relatedId, relatedServiceEventId: isServiceEntry ? relatedId : "" }
                                : item));
                            }}
                          >
                            <option value="">Not linked</option>
                            {(original?.timelineEvents || serviceEvents).map((entry) => (
                              <option value={entry.id} key={entry.id}>{entry.title}</option>
                            ))}
                          </select>
                        </div>
                        <div className="field">
                          <label htmlFor={`${document.id}-public-description`}>Public description</label>
                          <textarea
                            id={`${document.id}-public-description`}
                            value={document.publicDescription}
                            onChange={(event) =>
                              setDocuments((current) => current.map((item) => item.id === document.id ? { ...item, publicDescription: event.target.value } : item))
                            }
                            placeholder="Optional public context if this document is shared."
                          />
                        </div>
                        <div className="field">
                          <label htmlFor={`${document.id}-private-notes`}>Private notes</label>
                          <textarea
                            id={`${document.id}-private-notes`}
                            value={document.privateNotes}
                            onChange={(event) =>
                              setDocuments((current) => current.map((item) => item.id === document.id ? { ...item, privateNotes: event.target.value } : item))
                            }
                            placeholder="Owner-only document notes. Never shown on the public Profile."
                          />
                        </div>
                        <div className="proof-vault-actions">
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
                            {document.visibility === "public" ? "Make Private" : "Make Public"}
                          </button>
                          {document.dataUrl ? (
                            <a className="button secondary" href={document.dataUrl} target="_blank" rel="noreferrer">
                              Open
                            </a>
                          ) : null}
                          <button className="button secondary" type="button" onClick={() => setDocuments((current) => current.filter((item) => item.id !== document.id))}>
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
              <div id="photos">
                <PhotoOrganizer
                  images={galleryImages}
                  mainImage={form.heroImageDataUrl}
                  onSelectMain={selectMainPhoto}
                  onRemove={removePhoto}
                  onMove={movePhoto}
                />
              </div>
              <section className="qr-customizer" id="media" aria-label="External media">
                <div>
                  <span className="eyebrow">Media links</span>
                  <h3>Add Video or Audio</h3>
                  <p>Add a YouTube, Vimeo, SoundCloud, Bandcamp, or other safe HTTPS media link. QRguitar never accepts custom embed code.</p>
                </div>
                <div className="qr-controls">
                  <div className="field custom-wide">
                    <label htmlFor="externalMediaUrl">Media URL</label>
                    <input id="externalMediaUrl" type="url" value={mediaForm.url} onChange={(event) => setMediaForm((current) => ({ ...current, url: event.target.value }))} placeholder="https://..." />
                  </div>
                  <div className="field">
                    <label htmlFor="externalMediaTitle">Title</label>
                    <input id="externalMediaTitle" value={mediaForm.title} onChange={(event) => setMediaForm((current) => ({ ...current, title: event.target.value }))} placeholder="Clean demo" />
                  </div>
                  <div className="field custom-wide">
                    <label htmlFor="externalMediaCaption">Caption</label>
                    <textarea id="externalMediaCaption" rows={2} value={mediaForm.caption} onChange={(event) => setMediaForm((current) => ({ ...current, caption: event.target.value }))} />
                  </div>
                  <label className="toggle-field">
                    <input type="checkbox" checked={mediaForm.isPublic} onChange={(event) => setMediaForm((current) => ({ ...current, isPublic: event.target.checked }))} />
                    Show this media on the QRguitar Profile
                  </label>
                  <button className="button" type="button" onClick={() => void addExternalMedia()} disabled={savingMedia}>
                    {savingMedia ? "Saving..." : "Add Media"}
                  </button>
                </div>
                {externalMedia.length ? (
                  <div className="timeline-list">
                    {externalMedia.map((item, index) => (
                      <article className="timeline-item" key={item.id}>
                        <span>{item.provider} / {item.isPublic ? "Public" : "Private"}</span>
                        <h3>{item.title}</h3>
                        {item.caption ? <p>{item.caption}</p> : null}
                        <a href={item.canonicalUrl} target="_blank" rel="noreferrer">Preview link</a>
                        <div className="form-actions">
                          <button className="button secondary" type="button" onClick={() => void updateExternalMedia(item, { isPublic: !item.isPublic })} disabled={savingMedia}>{item.isPublic ? "Make Private" : "Show Publicly"}</button>
                          <button className="button secondary" type="button" onClick={() => void moveExternalMedia(item, -1)} disabled={savingMedia || index === 0} aria-label={`Move ${item.title} up`}>Move Up</button>
                          <button className="button secondary" type="button" onClick={() => void moveExternalMedia(item, 1)} disabled={savingMedia || index === externalMedia.length - 1} aria-label={`Move ${item.title} down`}>Move Down</button>
                          <button className="button secondary" type="button" onClick={() => void removeExternalMedia(item)} disabled={savingMedia}>Remove</button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : null}
              </section>
              <section className="qr-customizer" id="timeline" aria-label="Timeline and service history">
                <div>
                  <span className="eyebrow">Instrument history</span>
                  <h3 id="service">Timeline &amp; Service History</h3>
                  <p>Add the history you know - purchases, ownership, service, modifications, restoration, and important milestones.</p>
                </div>
                <div className="qr-controls">
                  <div className="field">
                    <label htmlFor="servicePrecision">Date precision</label>
                    <select id="servicePrecision" value={serviceForm.datePrecision} onChange={(event) => updateServiceField("datePrecision", event.target.value)}>
                      <option value="day">Exact day</option>
                      <option value="month">Month and year</option>
                      <option value="year">Year only</option>
                      <option value="unknown">Unknown date</option>
                    </select>
                  </div>
                  {serviceForm.datePrecision !== "unknown" ? (
                    <div className="field">
                      <label htmlFor="serviceDate">Date</label>
                      <input
                        id="serviceDate"
                        type={serviceForm.datePrecision === "year" ? "number" : serviceForm.datePrecision === "month" ? "month" : "date"}
                        min={serviceForm.datePrecision === "year" ? "1000" : undefined}
                        max={serviceForm.datePrecision === "year" ? "9999" : undefined}
                        value={serviceForm.serviceDate}
                        onChange={(event) => updateServiceField("serviceDate", event.target.value)}
                      />
                    </div>
                  ) : null}
                  <div className="field">
                    <label htmlFor="serviceType">Category</label>
                    <select id="serviceType" value={serviceForm.category} onChange={(event) => updateServiceField("category", event.target.value)}>
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
                  <div className="field">
                    <label htmlFor="servicePerformedBy">Who performed this work?</label>
                    <select id="servicePerformedBy" value={serviceForm.whoPerformed} onChange={(event) => updateServiceField("whoPerformed", event.target.value)}>
                      <option value="unknown">Not specified</option>
                      <option value="self">Owner / self</option>
                      <option value="shop">Shop or technician</option>
                    </select>
                    <small>Owner-entered history is labeled Owner-reported. Provider verification is controlled separately.</small>
                  </div>
                  <div className="field">
                    <label htmlFor="serviceWorkOrder">Work-order reference</label>
                    <input id="serviceWorkOrder" value={serviceForm.workOrderReference} onChange={(event) => updateServiceField("workOrderReference", event.target.value)} />
                  </div>
                  <div className="field custom-wide">
                    <label htmlFor="serviceParts">Parts installed</label>
                    <textarea id="serviceParts" rows={2} value={serviceForm.partsInstalled} onChange={(event) => updateServiceField("partsInstalled", event.target.value)} />
                  </div>
                  <div className="field custom-wide">
                    <label htmlFor="serviceMeasurements">Setup measurements</label>
                    <textarea id="serviceMeasurements" rows={2} value={serviceForm.setupMeasurements} onChange={(event) => updateServiceField("setupMeasurements", event.target.value)} />
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
                    Show this service entry on the QRguitar Profile
                  </label>
                  <div className="form-actions">
                    <button className="button" type="button" onClick={() => void saveServiceEntry()} disabled={savingService}>
                      {savingService ? "Saving..." : editingServiceId ? "Update Timeline Entry" : "Add Timeline Entry"}
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
                        <span>{entry.serviceDate || "Date unavailable"} · {entry.isPublic ? "Public" : "Private"}</span>
                        <h3>{entry.title}</h3>
                        <p className="service-provenance">
                          {entry.sourceKind === "provider_submitted_owner_approved"
                            ? `Provider-submitted · Owner-approved${entry.providerVerifiedAt ? " · Verified Service Provider" : ""}${entry.evidenceReviewedAt ? " · QRguitar-reviewed evidence" : ""}`
                            : "Owner-reported service"}
                        </p>
                        <p>{[entry.eventType, entry.shopName, entry.location].filter(Boolean).join(" · ") || "Service entry"}</p>
                        {entry.publicDescription ? <p>{entry.publicDescription}</p> : null}
                        {entry.privateNotes ? <p className="fine-print">Private: {entry.privateNotes}</p> : null}
                        {entry.canEdit === false ? (
                          <p className="fine-print">{entry.lockedReason || "Locked historical service entry. Contact QRguitar admin to correct provenance."}</p>
                        ) : (
                          <div className="form-actions">
                            <button className="button secondary" type="button" onClick={() => editServiceEvent(entry)}>
                              Edit Entry
                            </button>
                            <button className="button secondary" type="button" onClick={() => void deleteServiceEntry(entry)} disabled={savingService}>
                              Delete Entry
                            </button>
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="photo-manager empty">
                    <strong>No timeline entries yet</strong>
                    <span>Add known ownership, purchases, service, repairs, modifications, restoration, and milestones.</span>
                  </div>
                )}
              </section>
              <section className="qr-customizer" id="qr-print" aria-label="QR code customization">
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
              <div className="form-actions editor-save-bar">
                <button className="button" type="button" onClick={() => void saveChanges(false)} disabled={savingRecord || savingSafety} aria-busy={recordSaveAction === "save"}>
                  {recordSaveAction === "save" ? "Saving changes..." : getContentValue(content, "edit.actions.save")}
                </button>
                <button className="button secondary" type="button" onClick={() => void saveChanges(true)} disabled={savingRecord || savingSafety} aria-busy={recordSaveAction === "view"}>
                  {recordSaveAction === "view"
                    ? form.visibility === "public" ? "Saving and opening..." : "Saving and returning..."
                    : form.visibility === "public" ? getContentValue(content, "edit.actions.saveView") : "Save and Return to Dashboard"}
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
            <h2>{!ready ? "Checking account..." : forbidden ? "Owner access required." : "Sign in to edit this Profile."}</h2>
            <p>
              {!ready
                ? "Checking your Supabase session now."
                : forbidden
                  ? message || "Only the profile owner can edit this profile."
                  : message || "Sign in with the account that owns this QRguitar Profile."}
            </p>
            {!ready ? null : forbidden ? (
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
    visibility: file.visibility === "public" ? "public" as const : "hidden" as const,
    documentType: file.documentType || "Other",
    issuerSource: file.issuerSource || "",
    documentDate: file.documentDate || "",
    description: file.description || "",
    publicDescription: file.publicDescription || "",
    privateNotes: file.privateNotes || "",
    relatedTimelineEventId: file.relatedTimelineEventId || "",
    relatedServiceEventId: file.relatedServiceEventId || "",
    createdAt: file.createdAt || ""
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
  onChange,
  placeholder,
  list,
  onBlur
}: {
  label: string;
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  list?: string;
  onBlur?: (value: string) => void;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name={id}
        value={value}
        placeholder={placeholder}
        list={list}
        onChange={(event) => onChange(event.target.value)}
        onBlur={(event) => onBlur?.(event.target.value)}
      />
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
