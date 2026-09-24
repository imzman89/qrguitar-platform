"use client";
import { useUiText } from "../../../components/UiTextProvider";


import { ownerProfileHref } from "../../../lib/owner-profile";
import { dataUrlToProfileFile, uploadProfileFile } from "../../../lib/profile-upload-client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Footer } from "../../../components/Footer";
import { InstrumentPreview } from "../../../components/InstrumentPreview";
import { EditorTimelineEntry } from "../../../components/EditorTimelineEntry";
import { Nav } from "../../../components/Nav";
import { PhotoOrganizer, type PhotoOrganizerStatus } from "../../../components/PhotoOrganizer";
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
import styles from "./edit.module.css";

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
  storagePath?: string;
  mimeType?: string;
  fileSizeBytes?: number;
  uploadState?: PhotoOrganizerStatus["state"];
  uploadMessage?: string;
};
type StagedPhoto = PhotoOrganizerStatus & { storagePath?: string };

function makeClientKey() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
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
  const ui = useUiText("app.edit.code.page");
  const content = useSiteContent();
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = params.code?.toUpperCase() || "";
  const uploadFileIds = useRef(new Map<string, string>());
  const [uploadId] = useState(makeClientKey);
  const [ownerId, setOwnerId] = useState("");
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
  const [photoUploads, setPhotoUploads] = useState<Record<string, StagedPhoto>>({});
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
        if (!cancelled) setOwnerId(sessionResult.data.session.user.id);

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
            setPhotoUploads({});
            uploadFileIds.current.clear();
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
          setMessage(payload?.message || ui("ui.app.edit.code.page.2f0a4b105931", "This Profile was not found for your account."));
          setReady(true);
        }
      } catch {
        if (!cancelled) {
          setMessage(ui("ui.app.edit.code.page.e58b3c4b0eeb", "Could not load this Profile. Check your connection and try again."));
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
      setMessage(ui("ui.app.edit.code.page.8c23311d31e4", "Media URL and title are required."));
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
        setMessage(payload?.message || ui("ui.app.edit.code.page.a60687ec3498", "Could not add media."));
        return;
      }
      setExternalMedia((current) => [...current, payload.mediaItem as ExternalMediaItem]);
      setMediaForm(emptyMediaForm);
      setMessage(payload.message || ui("ui.app.edit.code.page.39e3cbd0722a", "Media added."));
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
        setMessage(payload?.message || ui("ui.app.edit.code.page.d09487f73f3b", "Could not remove media."));
        return;
      }
      setExternalMedia((current) => current.filter((entry) => entry.id !== item.id));
      setMessage(ui("ui.app.edit.code.page.90fb34ab44a1", "Media removed."));
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
        setMessage(payload?.message || ui("ui.app.edit.code.page.94de5baedf39", "Could not update media."));
        return;
      }
      setExternalMedia((current) => current.map((entry) => entry.id === item.id ? payload.mediaItem as ExternalMediaItem : entry).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)));
      setMessage(payload.message || ui("ui.app.edit.code.page.50e60486b114", "Media updated."));
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

  async function refreshServiceEvents(qrCode: string) {
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
      setMessage(ui("ui.app.edit.code.page.89cd6d97aa20", "Service entry title is required."));
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
        setMessage(payload?.message || ui("ui.app.edit.code.page.5f2daa5a67f7", "Could not save service entry."));
        return;
      }

      setServiceEvents((current) => {
        const next = [payload.serviceEvent as ServiceHistoryEntry, ...current.filter((item) => item.id !== payload.serviceEvent?.id)];
        return sortServiceEvents(next);
      });
      resetServiceForm();
      setMessage(payload.message || ui("ui.app.edit.code.page.6cb9aa0fcb13", "Service entry saved. The permanent QRguitar URL stayed the same."));
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
        setMessage(payload?.message || ui("ui.app.edit.code.page.a858c19c2e1d", "Could not delete service entry."));
        return;
      }

      setServiceEvents((current) => current.filter((item) => item.id !== entry.id));
      if (editingServiceId === entry.id) {
        resetServiceForm();
      }
      setMessage(payload.message || ui("ui.app.edit.code.page.fef49344ff0b", "Service entry deleted."));
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

    setPhotoUploads((current) => {
      const next = { ...current };
      dataUrls.forEach((dataUrl) => { next[dataUrl] = { state: "ready" }; });
      return next;
    });

    setGalleryImages((current) => {
      const next = [...current, ...dataUrls].slice(0, 20);
      setForm((formCurrent) => ({ ...formCurrent, heroImageDataUrl: formCurrent.heroImageDataUrl || next[0] || "" }));
      return next;
    });
    setMessage(ui("ui.app.edit.code.page.004308492583", "{{value1}} photo{{value2}} added. Choose any photo as the main image.{{value3}}", {value1: dataUrls.length, value2: dataUrls.length === 1 ? "" : "s", value3: validation.message ? ` ${validation.message}` : ""}));
  }

  async function addDocuments(files: FileList | null) {
    if (!files?.length) {
      return;
    }

    const remainingSlots = Math.max(0, 10 - documents.length);
    const selectedFiles = Array.from(files).slice(0, remainingSlots);
    const validation = validateDocumentFiles(selectedFiles);
    if (!validation.files.length) {
      setMessage(validation.message);
      return;
    }
    const nextDocs = await Promise.all(
      validation.files.map(async (file, index) => ({
        id: `doc-${Date.now()}-${index}`,
        name: file.name,
        dataUrl: await fileToDataUrl(file),
        mimeType: file.type,
        fileSizeBytes: file.size,
        uploadState: "ready" as const,
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
    setMessage(ui("ui.app.edit.code.page.fb7a2f840893", "{{value1}} document{{value2}} added.{{value3}}", {value1: nextDocs.length, value2: nextDocs.length === 1 ? "" : "s", value3: validation.message ? ` ${validation.message}` : ""}));
  }

  function selectMainPhoto(imageUrl: string) {
    setForm((current) => ({ ...current, heroImageDataUrl: imageUrl }));
  }

  function removePhoto(imageUrl: string) {
    uploadFileIds.current.delete(`image:${imageUrl}`);
    const stagedPath = photoUploads[imageUrl]?.storagePath;
    setGalleryImages((current) => {
      const next = current.filter((item) => item !== imageUrl);
      setForm((formCurrent) => ({
        ...formCurrent,
        heroImageDataUrl: formCurrent.heroImageDataUrl === imageUrl ? next[0] || "" : formCurrent.heroImageDataUrl
      }));
      return next;
    });
    setPhotoUploads((current) => {
      const next = { ...current };
      delete next[imageUrl];
      return next;
    });
    if (stagedPath) void cleanupStagedPaths([stagedPath]);
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

  async function cleanupStagedPaths(paths: string[]) {
    if (!paths.length || !original?.recordId) return;
    const token = await getSupabaseAccessToken();
    await fetch("/api/instruments/uploads", {
      method: "DELETE",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ uploadId, targetGuitarId: original.recordId, paths })
    }).catch(() => null);
  }

  async function uploadStagedFile(kind: "image" | "document", dataUrl: string) {
    const targetGuitarId = original?.recordId;
    if (!ownerId || !targetGuitarId) throw new Error("Reload this Profile before uploading files.");
    const identity = `${kind}:${dataUrl}`;
    let fileId = uploadFileIds.current.get(identity);
    if (!fileId) {
      fileId = crypto.randomUUID();
      uploadFileIds.current.set(identity, fileId);
    }
    return uploadProfileFile({
      file: dataUrlToProfileFile(dataUrl), uploadId, fileId, kind, expectedOwnerId: ownerId, targetGuitarId,
      tokenForOwner: async () => {
        const { data } = await createBrowserSupabaseClient().auth.getSession();
        if (data.session?.user.id !== ownerId) throw new Error("The account changed. Return to the original account before retrying.");
        return data.session.access_token;
      }
    });
  }

  async function uploadWithConcurrency<T>(items: T[], worker: (item: T, index: number) => Promise<void>, concurrency = 3) {
    let cursor = 0;
    async function run() {
      while (cursor < items.length) {
        const index = cursor++;
        await worker(items[index], index);
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  }

  async function stageSelectedFiles() {
    const photoPaths = galleryImages.map((imageUrl) => /^data:/i.test(imageUrl) ? photoUploads[imageUrl]?.storagePath || "" : imageUrl);
    const failedPhotos: string[] = [];
    await uploadWithConcurrency(galleryImages, async (imageUrl, index) => {
      if (photoPaths[index]) return;
      setPhotoUploads((current) => ({ ...current, [imageUrl]: { ...current[imageUrl], state: "uploading", progress: 15 } }));
      try {
        const storagePath = await uploadStagedFile("image", imageUrl);
        photoPaths[index] = storagePath;
        setPhotoUploads((current) => ({ ...current, [imageUrl]: { state: "uploaded", progress: 100, storagePath } }));
      } catch (error) {
        failedPhotos.push(imageUrl);
        setPhotoUploads((current) => ({ ...current, [imageUrl]: { state: "error", message: error instanceof Error ? error.message : "Upload failed. Retry this photo." } }));
      }
    });

    const documentPaths = documents.map((document) => document.storagePath || (/^data:/i.test(document.dataUrl) ? "" : document.dataUrl));
    const failedDocuments: string[] = [];
    await uploadWithConcurrency(documents, async (document, index) => {
      if (documentPaths[index]) return;
      setDocuments((current) => current.map((item) => item.id === document.id ? { ...item, uploadState: "uploading", uploadMessage: "Uploading" } : item));
      try {
        const storagePath = await uploadStagedFile("document", document.dataUrl);
        documentPaths[index] = storagePath;
        setDocuments((current) => current.map((item) => item.id === document.id ? { ...item, storagePath, uploadState: "uploaded", uploadMessage: "Uploaded" } : item));
      } catch (error) {
        failedDocuments.push(document.id);
        setDocuments((current) => current.map((item) => item.id === document.id ? { ...item, uploadState: "error", uploadMessage: error instanceof Error ? error.message : "Upload failed. Retry this document." } : item));
      }
    });
    if (failedPhotos.length || failedDocuments.length) {
      throw new Error("Some files could not be uploaded. Retry the files marked in red; successful uploads are preserved.");
    }
    return { photoPaths, documentPaths };
  }

  function removeDocument(document: DocumentDraft) {
    uploadFileIds.current.delete(`document:${document.dataUrl}`);
    setDocuments((current) => current.filter((item) => item.id !== document.id));
    if (document.storagePath?.startsWith(`${ownerId}/${original?.recordId}/profile-uploads/${uploadId}/`)) {
      void cleanupStagedPaths([document.storagePath]);
    }
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
      setMessage(ui("ui.app.edit.code.page.49e43361459d", "That looks like a repeated submission. Wait a few seconds and try again."));
      return;
    }

    const instrument = buildInstrument();

    if (!instrument) {
      setMessage(ui("ui.app.edit.code.page.02131b53c6b7", "This guitar cannot be edited because it was not found."));
      return;
    }

    setRecordSaveAction(preview ? "view" : "save");
    setMessage("");

    try {
      if (!form.heroImageDataUrl && !galleryImages.length) {
        setMessage(ui("ui.app.edit.code.page.cd1a49c2c343", "Every QRguitar Profile needs at least one photo."));
        return;
      }

      const staged = await stageSelectedFiles();
      const mainPhotoIndex = Math.max(0, galleryImages.indexOf(form.heroImageDataUrl));
      const token = await getSupabaseAccessToken();
      const response = await fetch("/api/instruments", {
        method: "PATCH",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({
          uploadId,
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
          heroImagePath: staged.photoPaths[mainPhotoIndex] || staged.photoPaths[0],
          photos: staged.photoPaths,
          documents: documents.map((document, index) => ({
            name: document.name,
            storagePath: staged.documentPaths[index],
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
        setMessage(ui("ui.app.edit.code.page.d0c04254acb6", "Profile details failed: {{value1}}", {value1: payload?.message || "Could not save the Profile."}));
        return;
      }

      const savedQrCode = payload.qrCode || original?.qrCode || code;
      const trustResult = await saveVerificationSettings(token || "", savedQrCode);
      if (!trustResult.ok) {
        setMessage(ui("ui.app.edit.code.page.b60a79b1ba9d", "Trust settings failed: {{value1}}", {value1: trustResult.message}));
        return;
      }

      const safetyResult = await saveSafetySettings(token || "", savedQrCode);
      if (!safetyResult.ok) {
        setMessage(ui("ui.app.edit.code.page.dd99fa7bf17d", "Safety status failed: {{value1}}", {value1: safetyResult.message}));
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
        ? ui("ui.app.edit.code.page.7dbbf757ae78", "Saved as {{value1}}. Previous QR links still open this profile.", {value1: savedQrCode})
        : ui("ui.app.edit.code.page.fca046ccd586", "Saved."));
      if (savedQrCode !== code) {
        router.replace(`/edit/${savedQrCode}`);
      }
    } catch (error) {
      setMessage(ui("ui.app.edit.code.page.d0c04254acb6", "Profile details failed: {{value1}}", {value1: error instanceof Error ? error.message : "Check your connection and file sizes, then try again."}));
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
      <main className={`${styles.page} section create-page`}>
        <div className={`${styles.layout} shell create-layout`}>
          <div>
            <div className="eyebrow">{ui("ui.app.edit.code.page.fec2ac0f4cf1", "Edit Profile")}</div>
            <h1>{getContentValue(content, "edit.hero.headline")}</h1>
            <p>{getContentValue(content, "edit.hero.body")}</p>
            {original.safetyStatus === "lost" || original.safetyStatus === "stolen" ? (
              <div className={styles.safetyNotice}>
                <strong>{safetyStatusLabel(original.safetyStatus)}</strong>
                <span>{ui("ui.app.edit.code.page.44a43c5ad757", "This Profile has an active safety alert.")}</span>
                <a href="#privacy-safety">{ui("ui.app.edit.code.page.48d5a8281410", "Review safety status")}</a>
              </div>
            ) : null}
              <div className="permanent-id">
                <span>{ui("ui.app.edit.code.page.a6c8f92c19f4", "QRguitar ID")}</span>
                <strong>{qrCodeFromSerial(form.serial) || original?.qrCode || code}</strong>
                <small>{ui("ui.app.edit.code.page.379e7e78d21e", "When a Serial Number exists, the QRguitar ID uses the format QRG-SERIAL. Previous QR links remain active after approved corrections.")}</small>
              </div>
              <div className="privacy-toggle" aria-label={ui("ui.app.edit.code.page.1c47f10cc99e", "Profile visibility")}>
                <div>
                  <strong>
                    {form.visibility === "public"
                      ? ui("ui.app.edit.code.page.c6e88acaaf6f", "Public catalog")
                      : form.visibility === "unlisted"
                        ? ui("ui.app.edit.code.page.b94392a1943c", "Unlisted direct link")
                        : ui("ui.app.edit.code.page.d666dd40b98c", "Private owner only")}
                  </strong>
                  <span>
                    {form.visibility === "public"
                      ? ui("ui.app.edit.code.page.c1acbedb643a", "Shows on the live homepage feed and catalog.")
                      : form.visibility === "unlisted"
                        ? ui("ui.app.edit.code.page.2bfd63b89729", "Hidden from browsing, but anyone with the permanent link can view it.")
                        : ui("ui.app.edit.code.page.44692a3804f6", "Hidden from public browsing and direct public access.")}
                  </span>
                </div>
                <label className="field visibility-field">
                  <span>{ui("ui.app.edit.code.page.7448611d5f93", "Visibility")}</span>
                  <select value={form.visibility} onChange={(event) => updateField("visibility", event.target.value)}>
                    <option value="public">{ui("ui.app.edit.code.page.591935b15b1c", "Public")}</option>
                    <option value="private">{ui("ui.app.edit.code.page.c63eb6720c6e", "Private")}</option>
                    <option value="unlisted">{ui("ui.app.edit.code.page.bc96567e77ca", "Unlisted")}</option>
                  </select>
                </label>
              </div>
              <nav className="editor-section-nav" aria-label={ui("ui.app.edit.code.page.bf60214d782d", "Edit Profile sections")}>
                <a aria-current={activeEditorSection === "identity" ? "location" : undefined} href="#identity">{ui("ui.app.edit.code.page.999f23fcd7be", "Identity")}</a>
                <a aria-current={activeEditorSection === "photos" ? "location" : undefined} href="#photos">{ui("ui.app.edit.code.page.5e3147ab51e0", "Photos")}</a>
                <a aria-current={activeEditorSection === "details" ? "location" : undefined} href="#details">{ui("ui.app.edit.code.page.45989de49fb7", "Details")}</a>
                <a aria-current={activeEditorSection === "timeline" ? "location" : undefined} href="#timeline">{ui("ui.app.edit.code.page.23099ed0a502", "Timeline & Ownership")}</a>
                <a aria-current={activeEditorSection === "service" ? "location" : undefined} href="#service">{ui("ui.app.edit.code.page.d677190e0a99", "Service")}</a>
                <a aria-current={activeEditorSection === "media" ? "location" : undefined} href="#media">{ui("ui.app.edit.code.page.d357175cfe89", "Media")}</a>
                <a aria-current={activeEditorSection === "documents" ? "location" : undefined} href="#documents">{ui("ui.app.edit.code.page.b4e929d8bcfe", "Documents")}</a>
                <a aria-current={activeEditorSection === "trust-verification" ? "location" : undefined} href="#trust-verification">{ui("ui.app.edit.code.page.ade9248e0132", "Trust")}</a>
                <a aria-current={activeEditorSection === "privacy-safety" ? "location" : undefined} href="#privacy-safety">{ui("ui.app.edit.code.page.f096950eacff", "Privacy & Safety")}</a>
                <a aria-current={activeEditorSection === "qr-print" ? "location" : undefined} href="#qr-print">{ui("ui.app.edit.code.page.347d28dfa602", "QR & Print")}</a>
              </nav>
              <label className="editor-section-select">
                <span>{ui("ui.app.edit.code.page.b9920fd79715", "Current section")}</span>
                <select
                  aria-label={ui("ui.app.edit.code.page.c5a754da6b5d", "Edit Profile section")}
                  value={activeEditorSection}
                  onChange={(event) => {
                    const section = event.target.value;
                    setActiveEditorSection(section);
                    window.history.replaceState(null, "", `#${section}`);
                    document.getElementById(section)?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                >
                  <option value="identity">{ui("ui.app.edit.code.page.999f23fcd7be", "Identity")}</option>
                  <option value="photos">{ui("ui.app.edit.code.page.5e3147ab51e0", "Photos")}</option>
                  <option value="details">{ui("ui.app.edit.code.page.45989de49fb7", "Details")}</option>
                  <option value="timeline">{ui("ui.app.edit.code.page.23099ed0a502", "Timeline & Ownership")}</option>
                  <option value="service">{ui("ui.app.edit.code.page.d677190e0a99", "Service")}</option>
                  <option value="media">{ui("ui.app.edit.code.page.d357175cfe89", "Media")}</option>
                  <option value="documents">{ui("ui.app.edit.code.page.b4e929d8bcfe", "Documents")}</option>
                  <option value="trust-verification">{ui("ui.app.edit.code.page.ade9248e0132", "Trust")}</option>
                  <option value="privacy-safety">{ui("ui.app.edit.code.page.f096950eacff", "Privacy & Safety")}</option>
                  <option value="qr-print">{ui("ui.app.edit.code.page.347d28dfa602", "QR & Print")}</option>
                </select>
              </label>
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
                <span className="eyebrow">{ui("ui.app.edit.code.page.7708c49ad0e2", "Core identity")}</span>
                <p>{ui("ui.app.edit.code.page.ff958113cf77", "Make/model/serial are the main identity. Add anything else only when it helps the profile.")}</p>
              </div>
              <div className="form-grid" id="details">
                <Field
                  label={ui("ui.app.edit.code.page.df417ce45d01", "Make / brand")}
                  id="brand"
                  value={form.brand}
                  list="qrguitar-known-brands"
                  placeholder={ui("ui.app.edit.code.page.dbb3572478eb", "Start typing a brand")}
                  onChange={(value) => updateField("brand", value)}
                  onBlur={(value) => updateField("brand", canonicalInstrumentBrand(value) || value.trim())}
                />
                <Field label={ui("ui.app.edit.code.page.5e2c614c23f0", "Model")} id="model" value={form.model} onChange={(value) => updateField("model", value)} />
                <Field label={ui("ui.app.edit.code.page.14b1b3c5b151", "Serial Number")} id="serial" value={form.serial} onChange={(value) => updateField("serial", value)} />
                <Field label={ui("ui.app.edit.code.page.89f6832560de", "Year")} id="year" value={form.year} onChange={(value) => updateField("year", value)} />
                <CategoryField
                  label={ui("ui.app.edit.code.page.d974d8298159", "Type / category")}
                  id="instrumentType"
                  value={form.instrumentType}
                  options={categoryOptions}
                  onChange={(value) => updateField("instrumentType", value)}
                />
                <div className="field">
                  <label htmlFor="instrumentCondition">{ui("ui.app.edit.code.page.9228c34bf053", "Condition / status")}</label>
                  <select
                    id="instrumentCondition"
                    value={form.instrumentCondition}
                    onChange={(event) => updateField("instrumentCondition", event.target.value)}
                    required
                  >
                    <option value="new">{ui("ui.app.edit.code.page.18fdd549b2ed", "New")}</option>
                    <option value="used">{ui("ui.app.edit.code.page.ae7d8dfac9ff", "Used")}</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="saleStatus">{ui("ui.app.edit.code.page.12f67f8539c4", "Availability")}</label>
                  <select
                    id="saleStatus"
                    value={form.saleStatus}
                    onChange={(event) => updateField("saleStatus", event.target.value)}
                    required
                  >
                    <option value="not_for_sale">{ui("ui.app.edit.code.page.e063cbea64ad", "Not for Sale")}</option>
                    <option value="for_sale">{ui("ui.app.edit.code.page.1a83dec1476e", "For Sale")}</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="originalityStatus">{ui("ui.app.edit.code.page.faafda16cc4c", "Originality")}</label>
                  <select
                    id="originalityStatus"
                    value={form.originalityStatus}
                    onChange={(event) => updateField("originalityStatus", event.target.value)}
                    required
                  >
                    <option value="unknown">{ui("ui.app.edit.code.page.2604d337dc13", "Not Specified")}</option>
                    <option value="all_original">{ui("ui.app.edit.code.page.8894d64075bf", "All Original")}</option>
                    <option value="modified">{ui("ui.app.edit.code.page.e8ce5dcaf408", "Modified")}</option>
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
                  />{ui("ui.app.edit.code.page.bc2663d3963d", "This instrument does not use a Serial Number")}</label>
                <label className="toggle-field">
                  <input type="checkbox" checked={showSerialPublic} onChange={(event) => setShowSerialPublic(event.target.checked)} />{ui("ui.app.edit.code.page.6456778444bd", "Show Serial Number on public Profile")}</label>
              </div>
              <p className="fine-print">{ui("ui.app.edit.code.page.a8782c988bf8", "This hides only the Serial Number field. The permanent QR ID and URL may still include the serial. Choose a private Profile to restrict access. No-serial records require QRguitar approval before verification or authenticity confirmation.")}</p>
              <p className="fine-print">{ui("ui.app.edit.code.page.50cccc48b0dc", "Originality is an owner-stated modification status for search and disclosure. It is not QRguitar authentication or verification.")}</p>
              <details className="advanced-panel">
                <summary>{ui("ui.app.edit.code.page.7c2e45c2972e", "Add Profile Basics")}</summary>
                <div className="form-grid">
                  <Field label={ui("ui.app.edit.code.page.e69702d5925c", "Display title / nickname")} id="name" value={form.name} onChange={(value) => updateField("name", value)} />
                  <Field label={ui("ui.app.edit.code.page.cf846c3fbd33", "Builder (optional)")} id="builder" value={form.builder} onChange={(value) => updateField("builder", value)} />
                  <Field label={ui("ui.app.edit.code.page.a6c7a84baa67", "Finish")} id="finish" value={form.finish} onChange={(value) => updateField("finish", value)} />
                  <Field label={ui("ui.app.edit.code.page.81d27ef6d503", "Weight")} id="weight" value={form.weight} onChange={(value) => updateField("weight", value)} />
                  <Field label={ui("ui.app.edit.code.page.a896221d5946", "Owner display")} id="owner" value={form.owner} onChange={(value) => updateField("owner", value)} />
                  <Field label={ui("ui.app.edit.code.page.74d91b61ae60", "Owner status")} id="ownerStatus" value={form.ownerStatus} onChange={(value) => updateField("ownerStatus", value)} />
                  <Field label={ui("ui.app.edit.code.page.15b61974b270", "Location")} id="location" value={form.location} onChange={(value) => updateField("location", value)} />
                </div>
                <div className="field custom-wide">
                  <label htmlFor="summary">{ui("ui.app.edit.code.page.7b364544e11f", "Public story")}</label>
                  <textarea
                    id="summary"
                    name="summary"
                    rows={5}
                    value={form.summary}
                    onChange={(event) => updateField("summary", event.target.value)}
                  />
                </div>
                <div className="field custom-wide">
                  <label htmlFor="specsNotes">{ui("ui.app.edit.code.page.9dea0cff2a8f", "Specs notes")}</label>
                  <textarea
                    id="specsNotes"
                    rows={4}
                    value={form.specsNotes}
                    onChange={(event) => updateField("specsNotes", event.target.value)}
                  />
                </div>
                <div className="field custom-wide">
                  <label htmlFor="serviceNotes">{ui("ui.app.edit.code.page.3929e139c666", "Service notes")}</label>
                  <textarea
                    id="serviceNotes"
                    rows={4}
                    value={form.serviceNotes}
                    onChange={(event) => updateField("serviceNotes", event.target.value)}
                  />
                </div>
              </details>
              <details className="advanced-panel" open>
                <summary>{ui("ui.app.edit.code.page.814602d348e0", "Add Any Details")}</summary>
                <div className="custom-list">
                  {customFields.map((field) => (
                    <div className="custom-row" key={field.id}>
                      <input
                        aria-label={ui("ui.app.edit.code.page.8f5e3a6a7a8a", "Field label")}
                        placeholder={ui("ui.app.edit.code.page.c401f87933bd", "Field label, e.g. Builder")}
                        value={field.label}
                        onChange={(event) =>
                          setCustomFields((current) =>
                            current.map((item) => item.id === field.id ? { ...item, label: event.target.value } : item)
                          )
                        }
                      />
                      <input
                        aria-label={ui("ui.app.edit.code.page.ca3653fa9b78", "Field value")}
                        placeholder={ui("ui.app.edit.code.page.8e37953d23da", "Value")}
                        value={field.value}
                        onChange={(event) =>
                          setCustomFields((current) =>
                            current.map((item) => item.id === field.id ? { ...item, value: event.target.value } : item)
                          )
                        }
                      />
                      <button className="button secondary" type="button" onClick={() => setCustomFields((current) => current.filter((item) => item.id !== field.id))}>{ui("ui.app.edit.code.page.c3812fc4acb8", "Remove")}</button>
                    </div>
                  ))}
                  <button className="button secondary" type="button" onClick={() => setCustomFields((current) => [...current, { id: `field-${Date.now()}`, label: "", value: "" }])}>{ui("ui.app.edit.code.page.d9e3cfc7246e", "Add Detail")}</button>
                </div>
              </details>
              <details className="advanced-panel" open>
                <summary>{ui("ui.app.edit.code.page.5482252391a3", "Add Website or Social Links")}</summary>
                <div className="custom-list">
                  {customLinks.map((link) => (
                    <div className="custom-row" key={link.id}>
                      <input
                        aria-label={ui("ui.app.edit.code.page.acaa9ea6688f", "Link label")}
                        placeholder={ui("ui.app.edit.code.page.02234b0f736c", "Label, e.g. Instagram")}
                        value={link.label}
                        onChange={(event) =>
                          setCustomLinks((current) =>
                            current.map((item) => item.id === link.id ? { ...item, label: event.target.value } : item)
                          )
                        }
                      />
                      <input
                        aria-label={ui("ui.app.edit.code.page.9dfd0b9f8f42", "Link URL")}
                        placeholder="https://..."
                        value={link.url}
                        onChange={(event) =>
                          setCustomLinks((current) =>
                            current.map((item) => item.id === link.id ? { ...item, url: event.target.value } : item)
                          )
                        }
                      />
                      <button className="button secondary" type="button" onClick={() => setCustomLinks((current) => current.filter((item) => item.id !== link.id))}>{ui("ui.app.edit.code.page.c3812fc4acb8", "Remove")}</button>
                    </div>
                  ))}
                  <button className="button secondary" type="button" onClick={() => setCustomLinks((current) => [...current, { id: `link-${Date.now()}`, label: "", url: "" }])}>{ui("ui.app.edit.code.page.b8c42654c8ce", "Add Link")}</button>
                </div>
              </details>
              <div className="field photo-field">
                <label htmlFor="profilePhotos">{ui("ui.app.edit.code.page.215ed206acf2", "Profile photos")}</label>
                <input
                  id="profilePhotos"
                  name="profilePhotos"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  onChange={(event) => void addProfilePhotos(event.target.files)}
                />
                <span>{ui("ui.app.edit.code.page.d7aea5f0f7db", "Upload up to 20 photos, 12MB each. Pick one as the main image for dashboard cards, catalog listings, and the public profile hero.")}</span>
              </div>
              <div className="field photo-field" id="documents">
                <label htmlFor="profileDocuments">{ui("ui.app.edit.code.page.b4e929d8bcfe", "Documents")}</label>
                <input
                  id="profileDocuments"
                  name="profileDocuments"
                  type="file"
                  accept="application/pdf,image/png,image/jpeg,image/webp"
                  multiple
                  onChange={(event) => void addDocuments(event.target.files)}
                />
                <span>{ui("ui.app.edit.code.page.aaa80d91c45c", "Store receipts, invoices, build sheets, service slips, appraisal notes, and authenticity evidence with the QRguitar Profile. Up to 10 files, 12MB each.")}</span>
              </div>
              {documents.length ? (
                <section className="photo-manager proof-vault" aria-label={ui("ui.app.edit.code.page.fe07a483e3c2", "Proof Vault document manager")}>
                  <div className="photo-manager-header">
                    <strong>{ui("ui.app.edit.code.page.b4e929d8bcfe", "Documents")}</strong>
                    <span>{documents.length}{ui("ui.app.edit.code.page.61008da8ad24", "/10 files. Private documents can support QRguitar verification and authenticity review.")}</span>
                  </div>
                  <div className="proof-vault-list">
                    {documents.map((document) => (
                      <div className="proof-vault-item" key={document.id}>
                        <div className="proof-vault-item-header">
                          <strong>{document.name || ui("ui.app.edit.code.page.9f6d7cb28b64", "Untitled document")}</strong>
                          <span className={document.visibility === "public" ? "status-pill verified-pill" : "status-pill neutral-pill"}>
                            {document.uploadState === "uploading" ? ui("ui.app.edit.code.page.8b898ca34ce7", "Uploading") : document.uploadState === "error" ? ui("ui.app.edit.code.page.6efc5d27f30b", "Upload failed") : document.visibility === "public" ? ui("ui.app.edit.code.page.591935b15b1c", "Public") : ui("ui.app.edit.code.page.c63eb6720c6e", "Private")}
                          </span>
                        </div>
                        <div className="form-grid compact">
                          <div className="field">
                            <label htmlFor={`${document.id}-title`}>{ui("ui.app.edit.code.page.7e8cd2056da7", "Title")}</label>
                            <input
                              id={`${document.id}-title`}
                              value={document.name}
                              onChange={(event) =>
                                setDocuments((current) => current.map((item) => item.id === document.id ? { ...item, name: event.target.value } : item))
                              }
                            />
                          </div>
                          <div className="field">
                            <label htmlFor={`${document.id}-type`}>{ui("ui.app.edit.code.page.5b81f70d59bd", "Document type")}</label>
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
                            <label htmlFor={`${document.id}-issuer`}>{ui("ui.app.edit.code.page.1d0e10a4efff", "Issuer or source")}</label>
                            <input id={`${document.id}-issuer`} value={document.issuerSource} onChange={(event) => setDocuments((current) => current.map((item) => item.id === document.id ? { ...item, issuerSource: event.target.value } : item))} placeholder={ui("ui.app.edit.code.page.de02d7e9d9ed", "Dealer, shop, builder, or owner")} />
                          </div>
                          <div className="field">
                            <label htmlFor={`${document.id}-date`}>{ui("ui.app.edit.code.page.331b273e05e4", "Document date")}</label>
                            <input id={`${document.id}-date`} type="date" value={document.documentDate} onChange={(event) => setDocuments((current) => current.map((item) => item.id === document.id ? { ...item, documentDate: event.target.value } : item))} />
                          </div>
                        </div>
                        <div className="field">
                          <label htmlFor={`${document.id}-description`}>{ui("ui.app.edit.code.page.526e0087cc3f", "Description")}</label>
                          <textarea id={`${document.id}-description`} value={document.description} onChange={(event) => setDocuments((current) => current.map((item) => item.id === document.id ? { ...item, description: event.target.value } : item))} placeholder={ui("ui.app.edit.code.page.fe239cf0a2cf", "What this document establishes or contains.")} />
                        </div>
                        <div className="field">
                          <label htmlFor={`${document.id}-timeline`}>{ui("ui.app.edit.code.page.2a750061dd1a", "Related Timeline entry")}</label>
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
                            <option value="">{ui("ui.app.edit.code.page.1e31d9596d67", "Not linked")}</option>
                            {(original?.timelineEvents || serviceEvents).map((entry) => (
                              <option value={entry.id} key={entry.id}>{entry.title}</option>
                            ))}
                          </select>
                        </div>
                        <div className="field">
                          <label htmlFor={`${document.id}-public-description`}>{ui("ui.app.edit.code.page.05a15f069975", "Public description")}</label>
                          <textarea
                            id={`${document.id}-public-description`}
                            value={document.publicDescription}
                            onChange={(event) =>
                              setDocuments((current) => current.map((item) => item.id === document.id ? { ...item, publicDescription: event.target.value } : item))
                            }
                            placeholder={ui("ui.app.edit.code.page.75652484cfdf", "Optional public context if this document is shared.")}
                          />
                        </div>
                        <div className="field">
                          <label htmlFor={`${document.id}-private-notes`}>{ui("ui.app.edit.code.page.72ff78fb2fd5", "Private notes")}</label>
                          <textarea
                            id={`${document.id}-private-notes`}
                            value={document.privateNotes}
                            onChange={(event) =>
                              setDocuments((current) => current.map((item) => item.id === document.id ? { ...item, privateNotes: event.target.value } : item))
                            }
                            placeholder={ui("ui.app.edit.code.page.7f4f8adde79a", "Owner-only document notes. Never shown on the public Profile.")}
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
                            {document.visibility === "public" ? ui("ui.app.edit.code.page.ffab73178509", "Make Private") : ui("ui.app.edit.code.page.24139936d627", "Make Public")}
                          </button>
                          {document.dataUrl ? (
                            <a className="button secondary" href={document.dataUrl} target="_blank" rel="noreferrer">{ui("ui.app.edit.code.page.ed077f3d8125", "Open")}</a>
                          ) : null}
                          {document.uploadMessage ? <span className="fine-print">{document.uploadMessage}</span> : null}
                          <button className="button secondary" type="button" onClick={() => removeDocument(document)}>{ui("ui.app.edit.code.page.c3812fc4acb8", "Remove")}</button>
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
                  statusByImage={photoUploads}
                />
              </div>
              <section className="qr-customizer" id="media" aria-label={ui("ui.app.edit.code.page.3e3ac8296196", "External media")}>
                <div>
                  <span className="eyebrow">{ui("ui.app.edit.code.page.dc600f6490d8", "Media links")}</span>
                  <h3>{ui("ui.app.edit.code.page.55444bb1a4b8", "Add Video or Audio")}</h3>
                  <p>{ui("ui.app.edit.code.page.b2620027b28f", "Add a YouTube, Vimeo, SoundCloud, Bandcamp, or other safe HTTPS media link. QRguitar never accepts custom embed code.")}</p>
                </div>
                <div className="qr-controls">
                  <div className="field custom-wide">
                    <label htmlFor="externalMediaUrl">{ui("ui.app.edit.code.page.a56a654b3cce", "Media URL")}</label>
                    <input id="externalMediaUrl" type="url" value={mediaForm.url} onChange={(event) => setMediaForm((current) => ({ ...current, url: event.target.value }))} placeholder="https://..." />
                  </div>
                  <div className="field">
                    <label htmlFor="externalMediaTitle">{ui("ui.app.edit.code.page.7e8cd2056da7", "Title")}</label>
                    <input id="externalMediaTitle" value={mediaForm.title} onChange={(event) => setMediaForm((current) => ({ ...current, title: event.target.value }))} placeholder={ui("ui.app.edit.code.page.b72cc3763093", "Clean demo")} />
                  </div>
                  <div className="field custom-wide">
                    <label htmlFor="externalMediaCaption">{ui("ui.app.edit.code.page.87d296ec9489", "Caption")}</label>
                    <textarea id="externalMediaCaption" rows={2} value={mediaForm.caption} onChange={(event) => setMediaForm((current) => ({ ...current, caption: event.target.value }))} />
                  </div>
                  <label className="toggle-field">
                    <input type="checkbox" checked={mediaForm.isPublic} onChange={(event) => setMediaForm((current) => ({ ...current, isPublic: event.target.checked }))} />{ui("ui.app.edit.code.page.1b163a070bcb", "Show this media on the QRguitar Profile")}</label>
                  <button className="button" type="button" onClick={() => void addExternalMedia()} disabled={savingMedia}>
                    {savingMedia ? ui("ui.app.edit.code.page.dc85af8f2b1d", "Saving...") : ui("ui.app.edit.code.page.a078fb55c65a", "Add Media")}
                  </button>
                </div>
                {externalMedia.length ? (
                  <div className="timeline-list">
                    {externalMedia.map((item, index) => (
                      <article className="timeline-item" key={item.id}>
                        <span>{item.provider} / {item.isPublic ? ui("ui.app.edit.code.page.591935b15b1c", "Public") : ui("ui.app.edit.code.page.c63eb6720c6e", "Private")}</span>
                        <h3>{item.title}</h3>
                        {item.caption ? <p>{item.caption}</p> : null}
                        <a href={item.canonicalUrl} target="_blank" rel="noreferrer">{ui("ui.app.edit.code.page.50f38c2c40b0", "Preview link")}</a>
                        <div className="form-actions">
                          <button className="button secondary" type="button" onClick={() => void updateExternalMedia(item, { isPublic: !item.isPublic })} disabled={savingMedia}>{item.isPublic ? ui("ui.app.edit.code.page.ffab73178509", "Make Private") : ui("ui.app.edit.code.page.7bcb38b3067a", "Show Publicly")}</button>
                          <button className="button secondary" type="button" onClick={() => void moveExternalMedia(item, -1)} disabled={savingMedia || index === 0} aria-label={ui("ui.app.edit.code.page.740ebe32a73f", "Move {{value1}} up", { value1: item.title })}>{ui("ui.app.edit.code.page.1359626e7b69", "Move Up")}</button>
                          <button className="button secondary" type="button" onClick={() => void moveExternalMedia(item, 1)} disabled={savingMedia || index === externalMedia.length - 1} aria-label={ui("ui.app.edit.code.page.a1ae739bcef6", "Move {{value1}} down", { value1: item.title })}>{ui("ui.app.edit.code.page.b58330ac2505", "Move Down")}</button>
                          <button className="button secondary" type="button" onClick={() => void removeExternalMedia(item)} disabled={savingMedia}>{ui("ui.app.edit.code.page.c3812fc4acb8", "Remove")}</button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : null}
              </section>
              <section className="qr-customizer" id="timeline" aria-label={ui("ui.app.edit.code.page.92777e2212a7", "Timeline and service history")}>
                <div>
                  <span className="eyebrow">{ui("ui.app.edit.code.page.08e02c90e8fa", "Instrument history")}</span>
                  <h3 id="service">{ui("ui.app.edit.code.page.480686c56fb4", "Timeline & Service History")}</h3>
                  <p>{ui("ui.app.edit.code.page.bb53b6bbcc71", "Add the history you know - purchases, ownership, service, modifications, restoration, and important milestones.")}</p>
                </div>
                <div className="qr-controls">
                  <div className="field">
                    <label htmlFor="servicePrecision">{ui("ui.app.edit.code.page.1ac020fb3ee0", "Date precision")}</label>
                    <select id="servicePrecision" value={serviceForm.datePrecision} onChange={(event) => updateServiceField("datePrecision", event.target.value)}>
                      <option value="day">{ui("ui.app.edit.code.page.0bbaffa5aa37", "Exact day")}</option>
                      <option value="month">{ui("ui.app.edit.code.page.6d6c35d44e7c", "Month and year")}</option>
                      <option value="year">{ui("ui.app.edit.code.page.676258d2226f", "Year only")}</option>
                      <option value="unknown">{ui("ui.app.edit.code.page.ad224bb89c8a", "Unknown date")}</option>
                    </select>
                  </div>
                  {serviceForm.datePrecision !== "unknown" ? (
                    <div className="field">
                      <label htmlFor="serviceDate">{ui("ui.app.edit.code.page.99c40ab40592", "Date")}</label>
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
                    <label htmlFor="serviceType">{ui("ui.app.edit.code.page.292c06f0045a", "Category")}</label>
                    <select id="serviceType" value={serviceForm.category} onChange={(event) => updateServiceField("category", event.target.value)}>
                      {serviceEventTypes.map((type) => <option value={type} key={type}>{type}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="serviceTitle">{ui("ui.app.edit.code.page.7e8cd2056da7", "Title")}</label>
                    <input id="serviceTitle" value={serviceForm.title} onChange={(event) => updateServiceField("title", event.target.value)} placeholder={ui("ui.app.edit.code.page.b7019e901e94", "Setup, repair, inspection...")} />
                  </div>
                  <div className="field">
                    <label htmlFor="serviceShop">{ui("ui.app.edit.code.page.b77903e21e3a", "Shop/tech/business name")}</label>
                    <input id="serviceShop" value={serviceForm.shopName} onChange={(event) => updateServiceField("shopName", event.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="serviceLocation">{ui("ui.app.edit.code.page.15b61974b270", "Location")}</label>
                    <input id="serviceLocation" value={serviceForm.location} onChange={(event) => updateServiceField("location", event.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="servicePerformedBy">{ui("ui.app.edit.code.page.3baa01e20a22", "Who performed this work?")}</label>
                    <select id="servicePerformedBy" value={serviceForm.whoPerformed} onChange={(event) => updateServiceField("whoPerformed", event.target.value)}>
                      <option value="unknown">{ui("ui.app.edit.code.page.dc12bec5d71f", "Not specified")}</option>
                      <option value="self">{ui("ui.app.edit.code.page.118de3932441", "Owner / self")}</option>
                      <option value="shop">{ui("ui.app.edit.code.page.1fbc3028ac4f", "Shop or technician")}</option>
                    </select>
                    <small>{ui("ui.app.edit.code.page.6995609bcfca", "Owner-entered history is labeled Owner-reported. Provider verification is controlled separately.")}</small>
                  </div>
                  <div className="field">
                    <label htmlFor="serviceWorkOrder">{ui("ui.app.edit.code.page.1c784546c251", "Work-order reference")}</label>
                    <input id="serviceWorkOrder" value={serviceForm.workOrderReference} onChange={(event) => updateServiceField("workOrderReference", event.target.value)} />
                  </div>
                  <div className="field custom-wide">
                    <label htmlFor="serviceParts">{ui("ui.app.edit.code.page.023fdc1bf85e", "Parts installed")}</label>
                    <textarea id="serviceParts" rows={2} value={serviceForm.partsInstalled} onChange={(event) => updateServiceField("partsInstalled", event.target.value)} />
                  </div>
                  <div className="field custom-wide">
                    <label htmlFor="serviceMeasurements">{ui("ui.app.edit.code.page.4821049b4d8b", "Setup measurements")}</label>
                    <textarea id="serviceMeasurements" rows={2} value={serviceForm.setupMeasurements} onChange={(event) => updateServiceField("setupMeasurements", event.target.value)} />
                  </div>
                  <div className="field custom-wide">
                    <label htmlFor="servicePublicDescription">{ui("ui.app.edit.code.page.05a15f069975", "Public description")}</label>
                    <textarea id="servicePublicDescription" rows={3} value={serviceForm.publicDescription} onChange={(event) => updateServiceField("publicDescription", event.target.value)} />
                  </div>
                  <div className="field custom-wide">
                    <label htmlFor="servicePrivateNotes">{ui("ui.app.edit.code.page.72ff78fb2fd5", "Private notes")}</label>
                    <textarea id="servicePrivateNotes" rows={3} value={serviceForm.privateNotes} onChange={(event) => updateServiceField("privateNotes", event.target.value)} />
                  </div>
                  <label className="toggle-field">
                    <input type="checkbox" checked={serviceForm.isPublic} onChange={(event) => updateServiceField("isPublic", event.target.checked)} />{ui("ui.app.edit.code.page.0b8658a6a0c1", "Show this service entry on the QRguitar Profile")}</label>
                  <div className="form-actions">
                    <button className="button" type="button" onClick={() => void saveServiceEntry()} disabled={savingService}>
                      {savingService ? ui("ui.app.edit.code.page.dc85af8f2b1d", "Saving...") : editingServiceId ? ui("ui.app.edit.code.page.c1fa1a200083", "Update Timeline Entry") : ui("ui.app.edit.code.page.d9cf5b8885ab", "Add Timeline Entry")}
                    </button>
                    {editingServiceId ? (
                      <button className="button secondary" type="button" onClick={resetServiceForm}>{ui("ui.app.edit.code.page.fddcfdf8d5f4", "Cancel Edit")}</button>
                    ) : null}
                  </div>
                </div>
                {serviceEvents.length ? (
                  <div className="timeline-list">
                    {serviceEvents.map((entry) => (
                      <EditorTimelineEntry key={entry.id} entry={entry} saving={savingService} onEdit={editServiceEvent} onDelete={(event) => void deleteServiceEntry(event)} />
                    ))}
                  </div>
                ) : (
                  <div className="photo-manager empty">
                    <strong>{ui("ui.app.edit.code.page.e4c12bc75682", "No timeline entries yet")}</strong>
                    <span>{ui("ui.app.edit.code.page.e3fe0f1dad4c", "Add known ownership, purchases, service, repairs, modifications, restoration, and milestones.")}</span>
                  </div>
                )}
              </section>
              <section className="qr-customizer" id="qr-print" aria-label={ui("ui.app.edit.code.page.5604505e7254", "QR code customization")}>
                <div>
                  <span className="eyebrow">{ui("ui.app.edit.code.page.29ea42609e75", "QR appearance")}</span>
                  <h3>{ui("ui.app.edit.code.page.1863981d2631", "Customize QR Appearance")}</h3>
                  <p>{ui("ui.app.edit.code.page.6a3fe397be58", "Customize the code customers download.")}</p>
                  <p className="fine-print">{ui("ui.app.edit.code.page.639563ea399f", "Keep strong contrast so the QR remains scannable on stickers, hang tags, plates, and certificates.")}</p>
                </div>
                <div className="qr-controls">
                  <ColorField label={ui("ui.app.edit.code.page.7c1b8917efdc", "QR color")} value={qrStyle.foreground} onChange={(value) => updateQrStyle("foreground", value)} />
                  <ColorField label={ui("ui.app.edit.code.page.ea2b8a878841", "Background")} value={qrStyle.background} onChange={(value) => updateQrStyle("background", value)} />
                  <div className="field">
                    <label htmlFor="qrLabel">{ui("ui.app.edit.code.page.0e66373f45dc", "Label")}</label>
                    <input id="qrLabel" value={qrStyle.labelText} onChange={(event) => updateQrStyle("labelText", event.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="qrShape">{ui("ui.app.edit.code.page.7e744141b40e", "Style")}</label>
                    <select id="qrShape" value={qrStyle.shape} onChange={(event) => updateQrStyle("shape", event.target.value)}>
                      <option value="classic">{ui("ui.app.edit.code.page.3e9c8175439b", "Classic print")}</option>
                      <option value="soft">{ui("ui.app.edit.code.page.e6296a9d0a3b", "Soft premium")}</option>
                    </select>
                  </div>
                  <label className="toggle-field">
                    <input type="checkbox" checked={qrStyle.includeLabel} onChange={(event) => updateQrStyle("includeLabel", event.target.checked)} />{ui("ui.app.edit.code.page.affe6276c345", "Include label on downloaded QR")}</label>
                </div>
              </section>
            </form>
            <div className={styles.secondarySections}>
              <section className="card verification-card" id="trust-verification" aria-label={ui("ui.app.edit.code.page.3dc74ca2612b", "Trust and verification")}>
                <div>
                  <span className="eyebrow">{ui("ui.app.edit.code.page.5f500bb66024", "Trust & Verification")}</span>
                  <h3>{verificationStatus === "verified" ? ui("ui.app.edit.code.page.d8d9a98cd0e8", "Verified by QRguitar") : ui("ui.app.edit.code.page.33c8e8de41c3", "Unverified")}</h3>
                  <p>
                    {verificationStatus === "verified"
                      ? ui("ui.app.edit.code.page.df6ad347b1a1", "This Profile is verified by QRguitar.")
                      : ui("ui.app.edit.code.page.d7b92d4468d9", "After you add a Profile, QRguitar may verify its details at no charge when the information is sufficient. Verification does not confirm authenticity.")}
                  </p>
                  <p>
                    {authenticityStatus === "confirmed"
                      ? ui("ui.app.edit.code.page.ec2f3a7e401c", "Authenticity confirmed by QRguitar from available evidence.")
                      : ui("ui.app.edit.code.page.9572b2a7a2c2", "Authenticity confirmation is a separate paid review handled by QRguitar staff. A free Profile is not automatically authenticity confirmed.")}
                  </p>
                </div>
                <div className="form-grid">
                  {canManageVerification ? (
                    <>
                    <div className="form-section-heading custom-wide">
                      <span className="eyebrow">{ui("ui.app.edit.code.page.b58c42dbfcd4", "Admin Trust Controls")}</span>
                      <p>{ui("ui.app.edit.code.page.fff509a567cd", "Set binary trust badges and notes. These changes save through the main Save Changes button.")}</p>
                    </div>
                    <div className="field">
                      <label htmlFor="verificationStatus">{ui("ui.app.edit.code.page.d949c0cb61f0", "Admin verification status")}</label>
                      <select
                        id="verificationStatus"
                        value={verificationStatus}
                        onChange={(event) => setVerificationStatus(event.target.value === "verified" ? "verified" : "unverified")}
                      >
                        <option value="unverified">{ui("ui.app.edit.code.page.33c8e8de41c3", "Unverified")}</option>
                        <option value="verified">{ui("ui.app.edit.code.page.4f7838402f37", "Verified")}</option>
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="authenticityStatus">{ui("ui.app.edit.code.page.75e0ca128662", "Admin authenticity status")}</label>
                      <select
                        id="authenticityStatus"
                        value={authenticityStatus}
                        onChange={(event) => setAuthenticityStatus(event.target.value === "confirmed" ? "confirmed" : "unconfirmed")}
                      >
                        <option value="unconfirmed">{ui("ui.app.edit.code.page.a54f9b625886", "Authenticity Unconfirmed")}</option>
                        <option value="confirmed">{ui("ui.app.edit.code.page.eb95c24a9590", "Authenticity Confirmed")}</option>
                      </select>
                    </div>
                    <label className="toggle-field custom-wide">
                      <input type="checkbox" checked={serialExceptionApproved} onChange={(event) => setSerialExceptionApproved(event.target.checked)} />{ui("ui.app.edit.code.page.cfac951791e6", "Approve verification/authenticity exception for a no-serial brand, retailer, or build")}</label>
                    <div className="field custom-wide">
                      <label htmlFor="internalVerificationNote">{ui("ui.app.edit.code.page.f4a130abf8de", "Internal verification note")}</label>
                      <textarea id="internalVerificationNote" rows={3} value={internalVerificationNote} onChange={(event) => setInternalVerificationNote(event.target.value)} />
                    </div>
                    <div className="field custom-wide">
                      <label htmlFor="publicVerificationNote">{ui("ui.app.edit.code.page.118e1524b882", "Public verification note")}</label>
                      <textarea id="publicVerificationNote" rows={3} value={publicVerificationNote} onChange={(event) => setPublicVerificationNote(event.target.value)} />
                    </div>
                    <div className="field custom-wide">
                      <label htmlFor="internalAuthenticityNote">{ui("ui.app.edit.code.page.010edcad212d", "Internal authenticity note")}</label>
                      <textarea id="internalAuthenticityNote" rows={3} value={internalAuthenticityNote} onChange={(event) => setInternalAuthenticityNote(event.target.value)} />
                    </div>
                    <div className="field custom-wide">
                      <label htmlFor="publicAuthenticityNote">{ui("ui.app.edit.code.page.42af0e4ee0c2", "Public authenticity note")}</label>
                      <textarea id="publicAuthenticityNote" rows={3} value={publicAuthenticityNote} onChange={(event) => setPublicAuthenticityNote(event.target.value)} />
                    </div>
                    </>
                  ) : null}
                  <label className="toggle-field">
                    <input type="checkbox" checked={showVerificationBadge} onChange={(event) => setShowVerificationBadge(event.target.checked)} />{ui("ui.app.edit.code.page.ebb5eff4953a", "Show verification badge publicly")}</label>
                  <label className="toggle-field">
                    <input type="checkbox" checked={showAuthenticityBadge} onChange={(event) => setShowAuthenticityBadge(event.target.checked)} />{ui("ui.app.edit.code.page.a678af9b1c0a", "Show authenticity status publicly")}</label>
                  {authenticityStatus === "confirmed" && !showAuthenticityBadge ? <p className="field-note custom-wide">{ui("ui.app.edit.code.page.51e39f20046d", "Authenticity is confirmed, but the public badge is currently hidden. Turn this on and use Save Changes to publish it.")}</p> : null}
                </div>
              </section>
              <section className="card verification-card" id="privacy-safety" aria-label={ui("ui.app.edit.code.page.852068b96459", "Lost or stolen alert")}>
                <div>
                  <span className="eyebrow">{ui("ui.app.edit.code.page.d4607c4f0b10", "Lost / Stolen Alert")}</span>
                  <h3>{safetyStatusLabel(safetyStatus)}</h3>
                  <p>{ui("ui.app.edit.code.page.cd3177a2e0e4", "Mark a record lost or stolen so anyone who scans the QR can see the alert.")}</p>
                </div>
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="safetyStatus">{ui("ui.app.edit.code.page.2f5d50add626", "Current status")}</label>
                    <select
                      id="safetyStatus"
                      value={safetyStatus}
                      onChange={(event) => setSafetyStatus(event.target.value === "lost" || event.target.value === "stolen" || event.target.value === "recovered" ? event.target.value : "clear")}
                    >
                      <option value="clear">{ui("ui.app.edit.code.page.3b1c46e7fb2b", "No Alert")}</option>
                      <option value="lost">{ui("ui.app.edit.code.page.299f098db192", "Reported Lost")}</option>
                      <option value="stolen">{ui("ui.app.edit.code.page.44d0eeb2a64d", "Reported Stolen")}</option>
                      <option value="recovered">{ui("ui.app.edit.code.page.37ce0a91ee27", "Recovered")}</option>
                    </select>
                  </div>
                  {safetyStatus === "clear" ? (
                    <div className="field custom-wide">
                      <label>{ui("ui.app.edit.code.page.2f02e4974dd6", "No public safety alert")}</label>
                      <span className="fine-print">{ui("ui.app.edit.code.page.44c111b254e9", "No public safety alert is shown while status is No Alert.")}</span>
                    </div>
                  ) : (
                    <div className="field custom-wide">
                      <label htmlFor="publicSafetyNote">{ui("ui.app.edit.code.page.804f3c9e9556", "Public safety note")}</label>
                      <textarea
                        id="publicSafetyNote"
                        rows={3}
                        value={publicSafetyNote}
                        onChange={(event) => setPublicSafetyNote(event.target.value)}
                        placeholder={safetyStatus === "lost" ? ui("ui.app.edit.code.page.3b9415ed93f2", "Reported Lost: This instrument has been marked lost by the current owner.") : safetyStatus === "stolen" ? ui("ui.app.edit.code.page.893a5b5361ad", "Reported Stolen: This instrument has been marked stolen by the current owner.") : ui("ui.app.edit.code.page.e9aac867db4e", "Recovered status note.")}
                      />
                    </div>
                  )}
                  <div className="field custom-wide">
                    <label htmlFor="safetyNote">{ui("ui.app.edit.code.page.5816362f2633", "Private/internal note")}</label>
                    <textarea
                      id="safetyNote"
                      rows={3}
                      value={safetyNote}
                      onChange={(event) => setSafetyNote(event.target.value)}
                    />
                  </div>
                </div>
              </section>
            </div>
              {message ? <p className="form-message">{message}</p> : null}
              <div className="form-actions editor-save-bar">
                <button className="button" type="button" onClick={() => void saveChanges(false)} disabled={savingRecord || savingSafety} aria-busy={recordSaveAction === "save"}>
                  {recordSaveAction === "save" ? ui("ui.app.edit.code.page.86c6e0d74cc9", "Saving changes...") : getContentValue(content, "edit.actions.save")}
                </button>
                <button className="button secondary" type="button" onClick={() => void saveChanges(true)} disabled={savingRecord || savingSafety} aria-busy={recordSaveAction === "view"}>
                  {recordSaveAction === "view"
                    ? form.visibility === "public" ? ui("ui.app.edit.code.page.caae18bd705d", "Saving and opening...") : ui("ui.app.edit.code.page.4a87047e033b", "Saving and returning...")
                    : form.visibility === "public" ? getContentValue(content, "edit.actions.saveView") : ui("ui.app.edit.code.page.3c53caf4d68d", "Save and Return to Dashboard")}
                </button>
                <Link className="button secondary" href="/dashboard">{ui("ui.app.edit.code.page.97ba1d394fab", "Back to Dashboard")}</Link>
              </div>

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
            <div className="eyebrow">{ui("ui.app.edit.code.page.3cbc146d86cb", "Edit instrument")}</div>
            <h2>{!ready ? ui("ui.app.edit.code.page.4e0d5600059d", "Checking account...") : forbidden ? ui("ui.app.edit.code.page.3d8a710de98a", "Owner access required.") : ui("ui.app.edit.code.page.b2a4948798a5", "Sign in to edit this Profile.")}</h2>
            <p>
              {!ready
                ? ui("ui.app.edit.code.page.4e2bce183e1c", "Checking your Supabase session now.")
                : forbidden
                  ? message || ui("ui.app.edit.code.page.c2321cba55d7", "Only the profile owner can edit this profile.")
                  : message || ui("ui.app.edit.code.page.4bfdf5db3c0d", "Sign in with the account that owns this QRguitar Profile.")}
            </p>
            {!ready ? null : forbidden ? (
              <Link className="button" href="/dashboard">{ui("ui.app.edit.code.page.97ba1d394fab", "Back to Dashboard")}</Link>
            ) : (
              <Link className="button" href={`/login?next=${encodeURIComponent(`/edit/${code}`)}`}>{ui("ui.app.edit.code.page.bfd402b2f6f3", "Sign in")}</Link>
            )}
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const ui = useUiText("app.edit.code.page");
  return (
    <div className="field color-field">
      <label>{label}</label>
      <div>
        <input type="color" value={value} onChange={(event) => onChange(event.target.value)} aria-label={label} />
        <input value={value} onChange={(event) => onChange(event.target.value)} aria-label={ui("ui.app.edit.code.page.14a999b1f8b0", "{{value1}} hex value", { value1: label })} />
      </div>
    </div>
  );
}

const MAX_PROFILE_FILE_SIZE = 12 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ACCEPTED_DOCUMENT_TYPES = new Set([...ACCEPTED_IMAGE_TYPES, "application/pdf"]);

function validateImageFiles(files: File[]) {
  const valid = files.filter((file) => ACCEPTED_IMAGE_TYPES.has(file.type) && file.size > 0 && file.size <= MAX_PROFILE_FILE_SIZE);
  const rejected = files.filter((file) => !ACCEPTED_IMAGE_TYPES.has(file.type) || file.size < 1 || file.size > MAX_PROFILE_FILE_SIZE);

  return {
    files: valid,
    message: rejected.length
      ? `${rejected.length} photo${rejected.length === 1 ? "" : "s"} skipped. Use JPG, PNG, or WebP under 12MB each.`
      : ""
  };
}

function validateDocumentFiles(files: File[]) {
  const valid = files.filter((file) => ACCEPTED_DOCUMENT_TYPES.has(file.type) && file.size > 0 && file.size <= MAX_PROFILE_FILE_SIZE);
  const rejected = files.filter((file) => !ACCEPTED_DOCUMENT_TYPES.has(file.type) || file.size < 1 || file.size > MAX_PROFILE_FILE_SIZE);
  return {
    files: valid,
    message: rejected.length
      ? `${rejected.length} document${rejected.length === 1 ? "" : "s"} skipped. Use PDF, JPG, PNG, or WebP files up to 12MB each.`
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
    storagePath: file.url,
    mimeType: file.mimeType || "",
    fileSizeBytes: file.fileSizeBytes,
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
  const ui = useUiText("app.edit.code.page");
  const cleanedValue = value.trim();
  const hasCustomValue = cleanedValue && !options.some((option) => option.toLowerCase() === cleanedValue.toLowerCase());

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} name={id} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{ui("ui.app.edit.code.page.e26788c57413", "Select category")}</option>
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
