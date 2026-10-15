"use client";
import { useUiText } from "../../../components/UiTextProvider";
import { existingProfileSpecId, isSafetyContentUnchanged } from "../../../lib/profile-metadata-preservation";


import { ownerProfileHref } from "../../../lib/owner-profile";
import { dataUrlToProfileFile, uploadProfileFile } from "../../../lib/profile-upload-client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Footer } from "../../../components/Footer";
import { InstrumentPreview } from "../../../components/InstrumentPreview";
import { ProfileSaleFields } from "../../../components/ProfileSaleFields";
import { isSaleDetail, profileSaleFieldsError } from "../../../lib/profile-sale";
import { EditorTimelineEntry } from "../../../components/EditorTimelineEntry";
import { Nav } from "../../../components/Nav";
import { OwnerWorkspace } from "../../../components/OwnerWorkspace";
import { PhotoOrganizer, type PhotoOrganizerStatus } from "../../../components/PhotoOrganizer";
import { getContentValue } from "../../../lib/content-registry";
import { createSubmissionFingerprint, isRepeatedBrowserSubmission, validateInstrumentSubmission } from "../../../lib/security";
import {
  defaultQrStyle,
  getInstrumentCondition,
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
import { editorDeadline, editorRequest } from "../../../lib/editor-request";
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
  visibility: "public" as NonNullable<DemoInstrument["visibility"]>
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

function editorValidationTarget(input: typeof emptyForm, message: string) {
  if (message === "Make and model are required.") return input.brand.trim() ? "model" : "brand";
  if (message === "Enter a Serial Number, or mark that this instrument does not use one." || message === "Serial number can only use letters, numbers, dots, slashes, dashes, and underscores.") return "serial";
  if (message === "One or more fields is too long. Shorten the text and try again.") return input.brand.trim().length > 80 ? "brand" : input.model.trim().length > 80 ? "model" : "summary";
  if (message === "Make and model can only use normal letters, numbers, spaces, and basic punctuation.") return /^[a-zA-Z0-9 .,'&+/_-]+$/.test(input.brand) ? "model" : "brand";
  if (message === "Enter a four-digit year, or leave year blank if it is unknown.") return "year";
  return "identity";
}
function isKnownEditorSection(section: string) {
  return ["identity", "photos", "details", "timeline", "service", "media", "documents", "trust-verification", "privacy-safety", "qr-print"].includes(section);
}

function requestedEditorSection() {
  const hashSection = window.location.hash.slice(1);
  if (isKnownEditorSection(hashSection)) return hashSection;
  const querySection = new URLSearchParams(window.location.search).get("section") || "";
  return isKnownEditorSection(querySection) ? querySection : "";
}

function scrollToEditorSection(section: string) {
  if (!isKnownEditorSection(section)) return false;
  return revealEditorTarget(section);
}

function revealEditorTarget(id: string) {
  const target = document.getElementById(id);
  if (!target) return false;
  const disclosures: HTMLDetailsElement[] = [];
  for (let ancestor: HTMLElement | null = target; ancestor; ancestor = ancestor.parentElement) {
    if (ancestor instanceof HTMLDetailsElement) disclosures.unshift(ancestor);
  }
  for (const disclosure of disclosures) disclosure.open = true;
  const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  target.scrollIntoView({ behavior, block: "start" });
  const focusTarget = target instanceof HTMLDetailsElement
    ? target.querySelector<HTMLElement>(":scope > summary")
    : target.matches("input, select, textarea, button, a[href]")
      ? target
      : target.querySelector<HTMLElement>("input:not([type=hidden]):not([tabindex='-1']), select, textarea, button, a[href]") || target;
  if (focusTarget) {
    if (!focusTarget.matches("summary, input, select, textarea, button, a[href]")) focusTarget.tabIndex = -1;
    focusTarget.focus({ preventScroll: true });
  }
  return true;
}

function retainEditorSectionArrivalOnWidthChange(section: string) {
  if (!isKnownEditorSection(section)) return;
  const target = document.getElementById(section);
  if (!(target instanceof HTMLDetailsElement) || !target.open) return;
  const summary = target.querySelector<HTMLElement>(":scope > summary");
  if (!summary || document.activeElement !== summary) return;
  let width = window.innerWidth;
  const margin = parseFloat(window.getComputedStyle(target).scrollMarginTop) || 0;
  const padding = parseFloat(window.getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
  const maximumY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  let arrivalY = Math.min(maximumY, Math.max(0, target.getBoundingClientRect().top + window.scrollY - margin - padding));
  const atArrival = () => Math.abs(window.scrollY - arrivalY) <= 2;
  let arrived = atArrival();
  let following = true;
  const stopFollowing = () => { following = false; };
  const onScroll = () => {
    if (!following || window.innerWidth !== width) return;
    if (!arrived) { arrived = atArrival(); return; }
    if (!atArrival()) stopFollowing();
  };
  const onResize = () => {
    if (!following || window.innerWidth === width) return;
    width = window.innerWidth;
    if (!arrived || !target.isConnected || !target.open || document.activeElement !== summary || !atArrival()) {
      stopFollowing();
      return;
    }
    const bounds = summary.getBoundingClientRect();
    if (bounds.top >= 0 && bounds.bottom <= window.innerHeight) return;
    target.scrollIntoView({ behavior: "instant", block: "start" });
    arrivalY = window.scrollY;
  };
  const onFocus = (event: FocusEvent) => {
    if (event.target !== summary) stopFollowing();
  };
  const intentEvents = ["wheel", "touchstart", "pointerdown", "keydown", "input"];
  window.addEventListener("scroll", onScroll);
  window.addEventListener("resize", onResize);
  window.addEventListener("focusin", onFocus, true);
  for (const event of intentEvents) window.addEventListener(event, stopFollowing, true);
  return () => {
    stopFollowing();
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onResize);
    window.removeEventListener("focusin", onFocus, true);
    for (const event of intentEvents) window.removeEventListener(event, stopFollowing, true);
  };
}

function replaceEditorSectionHash(section: string) {
  if (!isKnownEditorSection(section)) return false;
  window.history.replaceState(window.history.state, "", `#${section}`);
  return scrollToEditorSection(section);
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
  const scope = useRef({ actor: "", generation: 0, active: true });
  const operationLocks = useRef(new Set<string>());
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [unavailable, setUnavailable] = useState(false);
  const [readErrors, setReadErrors] = useState({ media: "", history: "" });
  const [recovery, setRecovery] = useState<Record<string, { checked: boolean; code: string }>>({});
  const [savedSnapshot, setSavedSnapshot] = useState<DemoInstrument | null>(null);
  const recoveryRef = useRef(recovery);
  recoveryRef.current = recovery;
  // This lease belongs to the rendered controls, not whichever actor happens
  // to be current when an old queued handler eventually runs (including A→B→A).
  const renderedOperation = { ...scope.current, actor: ownerId };

  function currentOperation() { return { ...scope.current }; }
  function isCurrent(operation: ReturnType<typeof currentOperation>) {
    return scope.current.active && operation.generation === scope.current.generation && operation.actor === scope.current.actor;
  }
  async function editorToken(operation = currentOperation()) {
    const { data } = await editorDeadline(createBrowserSupabaseClient().auth.getSession());
    if (!isCurrent(operation) || !data.session || data.session.user.id !== operation.actor) throw new Error("The account changed.");
    return data.session.access_token;
  }
  function markRecovery(kind: string, qrCode: string) {
    // Persist before dispatch so reloading cannot silently permit a duplicate POST.
    window.sessionStorage.setItem(`qrguitar.editor.pending.${scope.current.actor}.${code}.${kind}`, qrCode);
    recoveryRef.current = { ...recoveryRef.current, [kind]: { checked: false, code: qrCode } };
    setRecovery(recoveryRef.current);
  }
  function clearRecovery(kind: string) {
    try { window.sessionStorage.removeItem(`qrguitar.editor.pending.${scope.current.actor}.${code}.${kind}`); }
    catch { setMessage(ui("ui.app.edit.code.page.recoveryStorageFailed", "The recovery lock could not be cleared. Your saved result and draft are kept; resolve browser storage before another change.")); return false; }
    const next = { ...recoveryRef.current }; delete next[kind];
    recoveryRef.current = next; setRecovery(next);
    return true;
  }
  function recoveryMessage() {
    return ui("ui.app.edit.code.page.resultUnconfirmed", "The saved result is not fully confirmed. Your draft is kept. Check the saved result before making another change.");
  }
  async function immediateWrite(kind: "media" | "history", url: string, init: RequestInit, accept: (payload: any) => boolean) {
    if (!original || !isCurrent(renderedOperation) || operationLocks.current.has(kind) || recoveryRef.current[kind]) return false;
    const operation = currentOperation();
    operationLocks.current.add(kind);
    (kind === "media" ? setSavingMedia : setSavingService)(true); setMessage("");
    let dispatched = false;
    try {
      const token = await editorToken(operation);
      markRecovery(kind, original.qrCode);
      dispatched = true;
      const { response, payload } = await editorRequest(url, { ...init, headers: { "content-type": "application/json", authorization: `Bearer ${token}` } });
      if (!isCurrent(operation)) return false;
      if (!response.ok || !payload?.ok) {
        // Only an explicit rejection is a negative receipt. A missing/5xx receipt
        // may follow a committed write and must not permit automatic retry.
        if (response.status >= 400 && response.status < 500 && payload?.ok === false) {
          clearRecovery(kind); setMessage(payload.message || ui("ui.app.edit.code.page.changeRejected", "This change was not accepted. Correct the draft before trying again."));
        } else setMessage(recoveryMessage());
        return false;
      }
      if (!accept(payload)) throw new Error("Missing saved result.");
      return clearRecovery(kind);
    } catch {
      if (isCurrent(operation)) setMessage(dispatched ? recoveryMessage() : ui("ui.app.edit.code.page.changeNotStarted", "This change could not be started. Check your session and recovery storage, then try again."));
      return false;
    } finally {
      if (isCurrent(operation)) { operationLocks.current.delete(kind); (kind === "media" ? setSavingMedia : setSavingService)(false); }
    }
  }
  // Same-actor retries retain drafts. Actor changes invalidate late callbacks
  // and hide every prior-actor private field before a new read is allowed.
  useEffect(() => {
    scope.current.active = true;
    setOriginal(null); setReady(false); setUnavailable(false); setForbidden(false);
    // A retained component can change QR code without changing account. Retire
    // the old route's transient work; its persisted recovery receipt stays put.
    operationLocks.current.clear(); setSavingMedia(false); setSavingService(false); setSavingSafety(false); setRecordSaveAction(null);
    setMessage(""); setReadErrors({ media: "", history: "" }); setRecovery({}); recoveryRef.current = {}; setSavedSnapshot(null);
    const { data } = createBrowserSupabaseClient().auth.onAuthStateChange((_event, session) => {
      const actor = session?.user.id || "";
      if (actor === scope.current.actor) return;
      scope.current = { actor, generation: scope.current.generation + 1, active: true };
      setOriginal(null); setOwnerId(actor); setReady(false); setForbidden(false); setUnavailable(false);
      setForm(emptyForm); setCustomFields([]); setCustomLinks([]); setGalleryImages([]); setDocuments([]);
      setPhotoUploads({}); uploadFileIds.current.clear(); setServiceEvents([]); setExternalMedia([]);
      setServiceForm(emptyServiceForm); setEditingServiceId(""); setMediaForm(emptyMediaForm);
      setInternalVerificationNote(""); setPublicVerificationNote(""); setInternalAuthenticityNote(""); setPublicAuthenticityNote("");
      setSafetyNote(""); setPublicSafetyNote(""); setCanManageVerification(false);
      operationLocks.current.clear(); setSavingMedia(false); setSavingService(false); setSavingSafety(false); setRecordSaveAction(null);
      setMessage(""); setReadErrors({ media: "", history: "" }); setRecovery({}); recoveryRef.current = {}; setSavedSnapshot(null);
      setLoadAttempt(value => value + 1);
    });
    return () => { scope.current.active = false; scope.current.generation++; data.subscription.unsubscribe(); };
  }, [code]);

  useEffect(() => {
    const syncSectionFromHash = () => {
      const section = requestedEditorSection();
      if (isKnownEditorSection(section)) {
        scrollToEditorSection(section);
      }
    };

    syncSectionFromHash();
    window.addEventListener("hashchange", syncSectionFromHash);
    return () => window.removeEventListener("hashchange", syncSectionFromHash);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const section = requestedEditorSection();
    if (!isKnownEditorSection(section)) return;
    scrollToEditorSection(section);
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    return retainEditorSectionArrivalOnWidthChange(requestedEditorSection());
  }, [ready, code]);

  useEffect(() => {
    let cancelled = false;

    void fetchPublishedSiteSettings().then((published) => {
      if (!cancelled && published?.instrumentCategories) {
        setCategoryOptions(published.instrumentCategories);
      }
    });

    async function loadInstrument() {
      const generation = scope.current.generation;
      try {
        const supabase = createBrowserSupabaseClient();
        const sessionResult = await editorDeadline(supabase.auth.getSession());
        if (cancelled || generation !== scope.current.generation) return;
        if (sessionResult.error) throw sessionResult.error;
        if (!sessionResult.data.session?.user) {
          if (!cancelled) {
            setReady(true);
          }
          return;
        }
        scope.current.actor = sessionResult.data.session.user.id;
        const operation = currentOperation();
        if (!cancelled) setOwnerId(operation.actor);
        const pending: typeof recovery = {};
        for (const kind of ["media", "history", "details"]) {
          const pendingCode = window.sessionStorage.getItem(`qrguitar.editor.pending.${operation.actor}.${code}.${kind}`);
          if (pendingCode) pending[kind] = { checked: false, code: pendingCode };
        }
        recoveryRef.current = pending; setRecovery(pending);

        const token = sessionResult.data.session.access_token;
        const { response, payload } = await editorRequest(`/api/instruments?scope=mine&code=${encodeURIComponent(code)}`, {
          headers: { authorization: `Bearer ${token}` }
        });
        if (cancelled || !isCurrent(operation)) return;

        if (response.ok && payload?.ok && payload.instrument) {
          const instrument = payload.instrument;
          if (instrument.visibility !== "public" && instrument.visibility !== "private" && instrument.visibility !== "unlisted") {
            throw new Error("Reload this Profile before saving again.");
          }

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
              visibility: instrument.visibility
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
          setUnavailable(response.status !== 401 && response.status !== 403 && response.status !== 404);
          setMessage(payload?.message || ui("ui.app.edit.code.page.2f0a4b105931", "This Profile was not found for your account."));
          setReady(true);
        }
      } catch {
        if (!cancelled && generation === scope.current.generation) {
          setUnavailable(true);
          setMessage(ui("ui.app.edit.code.page.e58b3c4b0eeb", "Could not load this Profile. Check your connection and try again."));
          setReady(true);
        }
      }
    }

    void loadInstrument();

    return () => {
      cancelled = true;
    };
  }, [code, router, loadAttempt]);

  const profileHref = useMemo(() => {
    return original ? ownerProfileHref(original, "/dashboard") : "/dashboard/profile/" + encodeURIComponent(code);
  }, [code, original]);

  function updateField(field: keyof typeof form, value: string) {
    if (!isCurrent(renderedOperation)) return;
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateQrStyle(field: keyof QrStyle, value: string | boolean) {
    if (!isCurrent(renderedOperation)) return;
    setQrStyle((current) => ({ ...current, [field]: value }));
  }

  function updateServiceField(field: keyof typeof serviceForm, value: string | boolean) {
    if (!isCurrent(renderedOperation)) return;
    setServiceForm((current) => ({ ...current, [field]: value }));
  }

  async function refreshExternalMedia(qrCode: string) {
    const operation = currentOperation();
    try {
      const token = await editorToken(operation);
      const { response, payload } = await editorRequest(`/api/external-media?scope=owner&code=${encodeURIComponent(qrCode)}`, {
        cache: "no-store", headers: { authorization: `Bearer ${token}` }
      });
      if (!isCurrent(operation)) return false;
      if (!response.ok || !payload?.ok || !Array.isArray(payload.mediaItems)) throw new Error("Media read failed.");
      setExternalMedia(payload.mediaItems); setReadErrors(current => ({ ...current, media: "" })); return true;
    } catch {
      if (isCurrent(operation)) setReadErrors(current => ({ ...current, media: ui("ui.app.edit.code.page.mediaReadFailed", "Saved media could not be loaded. This is not an empty list.") }));
      return false;
    }
  }

  async function addExternalMedia() {
    if (!isCurrent(renderedOperation)) return;
    if (!original) return;
    if (!mediaForm.url.trim() || !mediaForm.title.trim()) {
      setMessage(ui("ui.app.edit.code.page.8c23311d31e4", "Media URL and title are required."));
      return;
    }
    await immediateWrite("media", "/api/external-media", {
      method: "POST", body: JSON.stringify({ qrCode: original.qrCode, ...mediaForm, sortOrder: externalMedia.length })
    }, payload => {
      if (!payload.mediaItem) return false;
      setExternalMedia((current) => [...current, payload.mediaItem as ExternalMediaItem]);
      setMediaForm(emptyMediaForm);
      setMessage(payload.message || ui("ui.app.edit.code.page.39e3cbd0722a", "Media added."));
      return true;
    });
  }

  async function removeExternalMedia(item: ExternalMediaItem) {
    if (!isCurrent(renderedOperation)) return;
    if (!original || !window.confirm(`Remove ${item.title}?`)) return;
    await immediateWrite("media", `/api/external-media?code=${encodeURIComponent(original.qrCode)}&id=${encodeURIComponent(item.id)}`, { method: "DELETE" }, () => {
      setExternalMedia((current) => current.filter((entry) => entry.id !== item.id));
      setMessage(ui("ui.app.edit.code.page.90fb34ab44a1", "Media removed."));
      return true;
    });
  }

  async function updateExternalMedia(item: ExternalMediaItem, changes: Partial<Pick<ExternalMediaItem, "isPublic" | "sortOrder">>) {
    if (!original) return false;
    return immediateWrite("media", "/api/external-media", {
      method: "PATCH", body: JSON.stringify({ qrCode: original.qrCode, id: item.id, ...changes })
    }, payload => {
      if (!payload.mediaItem) return false;
      setExternalMedia((current) => current.map((entry) => entry.id === item.id ? payload.mediaItem as ExternalMediaItem : entry).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)));
      setMessage(payload.message || ui("ui.app.edit.code.page.50e60486b114", "Media updated."));
      return true;
    });
  }

  async function moveExternalMedia(item: ExternalMediaItem, direction: -1 | 1) {
    const index = externalMedia.findIndex((entry) => entry.id === item.id);
    const target = externalMedia[index + direction];
    if (index < 0 || !target) return;
    const currentOrder = item.sortOrder ?? index;
    const targetOrder = target.sortOrder ?? index + direction;
    const operation = currentOperation();
    if (!await updateExternalMedia(item, { sortOrder: targetOrder }) || !isCurrent(operation)) return;
    if (!await updateExternalMedia(target, { sortOrder: currentOrder }) && isCurrent(operation)) {
      markRecovery("media", original?.qrCode || code);
      setMessage(ui("ui.app.edit.code.page.mediaPartiallyMoved", "The first media position was saved; the second was not confirmed. Check saved media before changing the order again."));
    }
    if (isCurrent(operation)) await refreshExternalMedia(original?.qrCode || "");
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

    const operation = currentOperation();
    try {
      const token = await editorToken(operation);
      const { response, payload } = await editorRequest(`/api/service-events?scope=owner&code=${encodeURIComponent(qrCode)}`, {
        cache: "no-store", headers: { authorization: `Bearer ${token}` }
      });
      if (!isCurrent(operation)) return false;
      if (!response.ok || !payload?.ok || !Array.isArray(payload.serviceEvents)) throw new Error("History read failed.");
      setServiceEvents(payload.serviceEvents); setReadErrors(current => ({ ...current, history: "" })); return true;
    } catch {
      if (isCurrent(operation)) setReadErrors(current => ({ ...current, history: ui("ui.app.edit.code.page.historyReadFailed", "Saved history could not be loaded. This is not an empty list.") }));
      return false;
    }
  }

  function editServiceEvent(entry: ServiceHistoryEntry) {
    if (!isCurrent(renderedOperation)) return;
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
    replaceEditorSectionHash("service");
  }

  function resetServiceForm() {
    setEditingServiceId("");
    setServiceForm(emptyServiceForm);
  }

  async function saveServiceEntry() {
    if (!isCurrent(renderedOperation)) return;
    if (!original) {
      return;
    }

    if (!serviceForm.title.trim()) {
      setMessage(ui("ui.app.edit.code.page.89cd6d97aa20", "Service entry title is required."));
      return;
    }

    await immediateWrite("history", "/api/service-events", {
      method: editingServiceId ? "PATCH" : "POST",
      body: JSON.stringify({ id: editingServiceId, qrCode: original.qrCode, ...serviceForm })
    }, payload => {
      if (!payload.serviceEvent) return false;
      setServiceEvents((current) => {
        const next = [payload.serviceEvent as ServiceHistoryEntry, ...current.filter((item) => item.id !== payload.serviceEvent?.id)];
        return sortServiceEvents(next);
      });
      resetServiceForm();
      setMessage(payload.message || ui("ui.app.edit.code.page.6cb9aa0fcb13", "Service entry saved. The permanent QRguitar URL stayed the same."));
      return true;
    });
  }

  async function deleteServiceEntry(entry: ServiceHistoryEntry) {
    if (!original) {
      return;
    }

    await immediateWrite("history", `/api/service-events?code=${encodeURIComponent(original.qrCode)}&id=${encodeURIComponent(entry.id)}`, { method: "DELETE" }, payload => {
      setServiceEvents((current) => current.filter((item) => item.id !== entry.id));
      if (editingServiceId === entry.id) {
        resetServiceForm();
      }
      setMessage(payload.message || ui("ui.app.edit.code.page.fef49344ff0b", "Service entry deleted."));
      return true;
    });
  }

  async function checkSavedResult(kind: string) {
    if (!isCurrent(renderedOperation)) return;
    const pending = recoveryRef.current[kind];
    if (!pending || operationLocks.current.has(kind)) return;
    const operation = currentOperation();
    operationLocks.current.add(kind);
    try {
      let checked = false;
      if (kind === "media") checked = await refreshExternalMedia(pending.code);
      else if (kind === "history") checked = Boolean(await refreshServiceEvents(pending.code));
      else {
        const token = await editorToken(operation);
        const { response, payload } = await editorRequest(`/api/instruments?scope=mine&code=${encodeURIComponent(pending.code)}`, { cache: "no-store", headers: { authorization: `Bearer ${token}` } });
        if (!isCurrent(operation)) return;
        if (response.ok && payload?.ok && payload.instrument) {
          // Show a saved snapshot separately; never overwrite the retained draft.
          setSavedSnapshot(payload.instrument); checked = true;
        }
      }
      if (!isCurrent(operation)) return;
      if (checked) {
        recoveryRef.current = { ...recoveryRef.current, [kind]: { ...pending, checked: true } };
        setRecovery(recoveryRef.current);
        setMessage(ui("ui.app.edit.code.page.resultChecked", "The saved result is displayed. No change was sent again. Review it before allowing another change."));
        if (kind === "media") scrollToEditorSection("media");
        if (kind === "history") scrollToEditorSection("timeline");
      } else setMessage(ui("ui.app.edit.code.page.resultCheckFailed", "The saved result could not be checked. Your draft and recovery lock are kept. Try checking again."));
    } catch {
      if (isCurrent(operation)) setMessage(ui("ui.app.edit.code.page.resultCheckFailed", "The saved result could not be checked. Your draft and recovery lock are kept. Try checking again."));
    } finally { if (isCurrent(operation)) operationLocks.current.delete(kind); }
  }

  async function addProfilePhotos(files: FileList | null) {
    if (!isCurrent(renderedOperation)) return;
    const operation = currentOperation();
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

    let dataUrls: string[];
    try { dataUrls = await editorDeadline(Promise.all(validation.files.map(fileToCompressedDataUrl))); }
    catch { if (isCurrent(operation)) setMessage(ui("ui.app.edit.code.page.filesReadFailed", "The selected files could not be read. Your existing draft is kept. Try selecting the files again.")); return; }
    if (!isCurrent(operation)) return;

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
    if (!isCurrent(renderedOperation)) return;
    const operation = currentOperation();
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
    const nextDocs = await editorDeadline(Promise.all(
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
    )).catch(() => null);
    if (!isCurrent(operation)) return;
    if (!nextDocs) { setMessage(ui("ui.app.edit.code.page.filesReadFailed", "The selected files could not be read. Your existing draft is kept. Try selecting the files again.")); return; }

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
    const operation = currentOperation();
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
        return editorToken(operation);
      }
    });
  }

  async function uploadWithConcurrency<T>(items: T[], worker: (item: T, index: number) => Promise<void>, canStart: () => boolean, concurrency = 3) {
    let cursor = 0;
    async function run() {
      while (cursor < items.length && canStart()) {
        const index = cursor++;
        await worker(items[index], index);
      }
    }
    // A rejected worker must not release the batch while its siblings still run.
    const results = await Promise.allSettled(Array.from({ length: Math.min(concurrency, items.length) }, run));
    const failed = results.find((result) => result.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
  }

  async function stageSelectedFiles(canStart: () => boolean) {
    const operation = currentOperation();
    const photoPaths = galleryImages.map((imageUrl) => /^data:/i.test(imageUrl) ? photoUploads[imageUrl]?.storagePath || "" : imageUrl);
    const failedPhotos: string[] = [];
    await uploadWithConcurrency(galleryImages, async (imageUrl, index) => {
      if (!isCurrent(operation)) throw new Error("The account changed.");
      if (photoPaths[index]) return;
      setPhotoUploads((current) => ({ ...current, [imageUrl]: { ...current[imageUrl], state: "uploading", progress: 15 } }));
      try {
        const storagePath = await uploadStagedFile("image", imageUrl);
        if (!isCurrent(operation)) throw new Error("The account changed.");
        photoPaths[index] = storagePath;
        setPhotoUploads((current) => ({ ...current, [imageUrl]: { state: "uploaded", progress: 100, storagePath } }));
      } catch (error) {
        if (!isCurrent(operation)) throw error;
        failedPhotos.push(imageUrl);
        setPhotoUploads((current) => ({ ...current, [imageUrl]: { state: "error", message: error instanceof Error ? error.message : "Upload failed. Retry this photo." } }));
      }
    }, canStart);

    const documentPaths = documents.map((document) => document.storagePath || (/^data:/i.test(document.dataUrl) ? "" : document.dataUrl));
    const failedDocuments: string[] = [];
    await uploadWithConcurrency(documents, async (document, index) => {
      if (!isCurrent(operation)) throw new Error("The account changed.");
      if (documentPaths[index]) return;
      setDocuments((current) => current.map((item) => item.id === document.id ? { ...item, uploadState: "uploading", uploadMessage: "Uploading" } : item));
      try {
        const storagePath = await uploadStagedFile("document", document.dataUrl);
        if (!isCurrent(operation)) throw new Error("The account changed.");
        documentPaths[index] = storagePath;
        setDocuments((current) => current.map((item) => item.id === document.id ? { ...item, storagePath, uploadState: "uploaded", uploadMessage: "Uploaded" } : item));
      } catch (error) {
        if (!isCurrent(operation)) throw error;
        failedDocuments.push(document.id);
        setDocuments((current) => current.map((item) => item.id === document.id ? { ...item, uploadState: "error", uploadMessage: error instanceof Error ? error.message : "Upload failed. Retry this document." } : item));
      }
    }, canStart);
    if (failedPhotos.length || failedDocuments.length) {
      scrollToEditorSection(failedPhotos.length ? "photos" : "documents");
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
      visibility: form.visibility,
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
    if (!isCurrent(renderedOperation) || operationLocks.current.has("details") || recoveryRef.current.details) return;
    const operation = currentOperation();
    const versionPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
    if (typeof original?.updatedAt !== "string" || !versionPattern.test(original.updatedAt) || !Number.isFinite(Date.parse(original.updatedAt))) {
      setMessage(ui("ui.app.edit.code.page.d0c04254acb6", "Profile details failed: {{value1}}", { value1: "Reload this Profile before saving again." }));
      return;
    }
    const documentIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!Array.isArray(original.documentFiles) || original.documentFiles.some((document) =>
        !document || typeof document.id !== "string" || !documentIdPattern.test(document.id) ||
        typeof document.updatedAt !== "string" || !versionPattern.test(document.updatedAt) || !Number.isFinite(Date.parse(document.updatedAt)))) {
      setMessage(ui("ui.app.edit.code.page.d0c04254acb6", "Profile details failed: {{value1}}", { value1: "Reload this Profile and its documents before saving again." }));
      return;
    }
    const saleError = profileSaleFieldsError({ saleStatus: form.saleStatus, customFields, customLinks });
    if (saleError) { setMessage(saleError); revealEditorTarget("sale-details"); return; }
    const validationMessage = validateInstrumentSubmission(form, honeypot);
    if (validationMessage) {
      setMessage(validationMessage);
      revealEditorTarget(editorValidationTarget(form, validationMessage));
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
    operationLocks.current.add("details");
    setMessage("");
    let dispatched = false, detailsSaved = false, trustSaved = false;

    try {
      if (!form.heroImageDataUrl && !galleryImages.length) {
        setMessage(ui("ui.app.edit.code.page.cd1a49c2c343", "Every QRguitar Profile needs at least one photo."));
        scrollToEditorSection("photos");
        return;
      }

      // This signal only closes the queue's start gate; it never aborts the
      // already-dispatched Storage workers or discards their confirmed paths.
      const stagingLease = new AbortController();
      const staging = stageSelectedFiles(() => !stagingLease.signal.aborted && isCurrent(operation));
      let staged: Awaited<typeof staging>;
      try { staged = await editorDeadline(staging, 30000, stagingLease); }
      catch (error) {
        if (stagingLease.signal.aborted && isCurrent(operation)) {
          setMessage(ui("ui.app.edit.code.page.uploadsSettling", "Waiting for active uploads to settle. Queued files are kept for your next explicit save; no Profile change has been sent."));
        }
        // The deadline does not cancel Storage workers. Keep this save locked
        // until they settle, retaining successful paths and stable file IDs.
        // A timed-out batch never continues into a Profile write automatically.
        await staging.catch(() => undefined);
        throw error;
      }
      if (!isCurrent(operation)) return;
      const mainPhotoIndex = Math.max(0, galleryImages.indexOf(form.heroImageDataUrl));
      const token = await editorToken(operation);
      markRecovery("details", original?.qrCode || code); dispatched = true;
      const { response, payload } = await editorRequest("/api/instruments", {
        method: "PATCH",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({
          uploadId,
          expectedUpdatedAt: original?.updatedAt,
          expectedDocuments: original.documentFiles.map(({ id, updatedAt }) => ({ id, updatedAt })),
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
          location: form.location,
          visibility: form.visibility,
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
              .map((field) => ({ ...(existingProfileSpecId(field.id) ? { id: field.id } : {}), label: field.label.trim(), value: field.value.trim() }))
          ].filter(Boolean),
          customLinks: customLinks
            .filter((link) => link.label.trim() && link.url.trim())
            .map((link) => ({ label: link.label.trim(), url: link.url.trim() }))
        })
      });
      if (!isCurrent(operation)) return;

      if (!response.ok || !payload?.ok) {
        if (response.status >= 400 && response.status < 500 && payload?.ok === false) {
          clearRecovery("details");
          setMessage(ui("ui.app.edit.code.page.d0c04254acb6", "Profile details failed: {{value1}}", {value1: payload?.message || "Could not save the Profile."}));
        } else setMessage(recoveryMessage());
        return;
      }

      if (typeof payload.updatedAt !== "string" || !versionPattern.test(payload.updatedAt) || !Number.isFinite(Date.parse(payload.updatedAt))) {
        setMessage(recoveryMessage());
        return;
      }
      const savedQrCode = payload.qrCode || original?.qrCode || code;
      detailsSaved = true; markRecovery("details", savedQrCode);
      const trustResult = await saveVerificationSettings(token || "", savedQrCode, operation);
      if (!isCurrent(operation)) return;
      if (!trustResult.ok) {
        setMessage(ui("ui.app.edit.code.page.trustPartial", "Profile details were saved. Trust settings were not confirmed; safety was not sent. Your draft is kept. Check the saved result before another save."));
        scrollToEditorSection("trust-verification");
        return;
      }

      trustSaved = true;
      const safetyResult = await saveSafetySettings(token || "", savedQrCode, operation);
      if (!isCurrent(operation)) return;
      if (!safetyResult.ok) {
        setMessage(ui("ui.app.edit.code.page.safetyPartial", "Profile details and trust settings were saved. Safety status was not confirmed. Your draft is kept. Check the saved result before another save."));
        scrollToEditorSection("privacy-safety");
        return;
      }

      const freshRecord = await editorRequest(`/api/instruments?scope=mine&code=${encodeURIComponent(savedQrCode)}`, {
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache",
          authorization: `Bearer ${token}`
        }
      })
        .then((result) => result.response.ok ? result.payload : null)
        .catch(() => null) as { ok?: boolean; instrument?: DemoInstrument } | null;

      if (!isCurrent(operation)) return;
      if (!freshRecord?.ok || !freshRecord.instrument ||
          typeof freshRecord.instrument.updatedAt !== "string" || !versionPattern.test(freshRecord.instrument.updatedAt) || !Number.isFinite(Date.parse(freshRecord.instrument.updatedAt)) ||
          !Array.isArray(freshRecord.instrument.documentFiles) || freshRecord.instrument.documentFiles.some((document) =>
            !document || typeof document.id !== "string" || !documentIdPattern.test(document.id) ||
            typeof document.updatedAt !== "string" || !versionPattern.test(document.updatedAt) || !Number.isFinite(Date.parse(document.updatedAt)))) {
        // New documents receive server IDs. Never advance a snapshot using local placeholder IDs.
        setMessage(recoveryMessage());
        return;
      }
      const savedInstrument = { ...freshRecord.instrument, qrStyle: normalizeQrStyle(freshRecord.instrument.qrStyle) };
      clearRecovery("details");

      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("qrguitar:catalog-updated"));
      }
      await editorRequest(`/api/instruments?code=${encodeURIComponent(savedQrCode)}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" }
      }).catch(() => null);
      if (!isCurrent(operation)) return;
      router.refresh();

      if (preview) {
        router.push(ownerProfileHref(savedInstrument, "/dashboard"));
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
      if (isCurrent(operation)) setMessage(trustSaved
        ? ui("ui.app.edit.code.page.safetyPartial", "Profile details and trust settings were saved. Safety status was not confirmed. Your draft is kept. Check the saved result before another save.")
        : detailsSaved
          ? ui("ui.app.edit.code.page.trustPartial", "Profile details were saved. Trust settings were not confirmed; safety was not sent. Your draft is kept. Check the saved result before another save.")
          : dispatched ? recoveryMessage()
            : ui("ui.app.edit.code.page.d0c04254acb6", "Profile details failed: {{value1}}", {value1: error instanceof Error ? error.message : "Check your connection and file sizes, then try again."}));
    } finally {
      if (isCurrent(operation)) { operationLocks.current.delete("details"); setRecordSaveAction(null); }
    }
  }

  async function saveVerificationSettings(token: string, recordQrCode = original?.qrCode || code, operation = currentOperation()) {
    if (!original) {
      return { ok: false, message: "Profile was not loaded." };
    }

    try {
      token = await editorToken(operation);
      const { response, payload } = await editorRequest("/api/instruments", {
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
      if (!isCurrent(operation)) return { ok: false, message: "The account changed." };

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
      setOriginal(current => current && ({
        ...current,
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
      }));
      return { ok: true, message: "Trust settings saved." };
    } catch {
      return { ok: false, message: "Could not update verification. Check your connection and try again." };
    }
  }

  async function saveSafetySettings(token: string, recordQrCode = original?.qrCode || code, operation = currentOperation()) {
    if (!original) {
      return { ok: false, message: "Profile was not loaded." };
    }
    if (!isCurrent(operation)) return { ok: false, message: "The account changed." };
    if (isSafetyContentUnchanged(original, { safetyStatus, publicSafetyNote, safetyNote })) {
      return { ok: true, message: "Safety status unchanged." };
    }

    setSavingSafety(true);
    try {
      token = await editorToken(operation);
      const { response, payload } = await editorRequest("/api/safety-status", {
        method: "PATCH",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({
          qrCode: recordQrCode,
          safetyStatus,
          publicSafetyNote,
          safetyNote
        })
      });
      if (!isCurrent(operation)) return { ok: false, message: "The account changed." };

      if (!response.ok || !payload?.ok) {
        return { ok: false, message: payload?.message || "Could not update safety status." };
      }

      const nextSafetyStatus = payload.safetyStatus || safetyStatus;
      setSafetyStatus(nextSafetyStatus);
      setPublicSafetyNote(payload.publicSafetyNote || "");
      setOriginal(current => current && ({
        ...current,
        safetyStatus: nextSafetyStatus,
        publicSafetyNote: payload.publicSafetyNote || "",
        safetyStatusUpdatedAt: payload.safetyStatusUpdatedAt || ""
      }));
      return { ok: true, message: "Safety status saved." };
    } catch {
      return { ok: false, message: "Could not update safety status. Check your connection and try again." };
    } finally {
      if (isCurrent(operation)) setSavingSafety(false);
    }
  }

  return ready && original && !forbidden ? (
    <>
      <Nav />
      <OwnerWorkspace current="collection"><div className={`${styles.page} section create-page`} aria-label={ui("ui.app.edit.code.page.fec2ac0f4cf1", "Edit Profile")}
        onClickCapture={event => { if (!isCurrent(renderedOperation)) { event.preventDefault(); event.stopPropagation(); } }}
        onChangeCapture={event => { if (!isCurrent(renderedOperation)) { event.preventDefault(); event.stopPropagation(); } }}>
        <div className={`${styles.layout} shell create-layout`}>
          <div>
            <Link className={styles.backLink} href="/dashboard">{ui("ui.app.edit.code.page.97ba1d394fab", "Back to Dashboard")}</Link>
            <h1>{getContentValue(content, "edit.hero.headline")}</h1>
            <p>{getContentValue(content, "edit.hero.body")}</p>
            <div className={styles.saveBar}>
              {message ? <p className="form-message" role="status" aria-live="polite">{message}</p> : null}
              {Object.entries(recovery).filter(([kind]) => !(kind === "details" ? savingRecord : kind === "media" ? savingMedia : kind === "history" ? savingService : false)).map(([kind, pending]) => <section className="card" key={kind} aria-label={ui("ui.app.edit.code.page.recoveryTitle", "Saved-result recovery")}>
                <strong>{kind === "details" ? ui("ui.app.edit.code.page.savedDetails", "Profile details, trust and safety") : kind === "media" ? ui("ui.app.edit.code.page.savedMedia", "Media") : ui("ui.app.edit.code.page.savedHistory", "History")}</strong>
                <p>{recoveryMessage()}</p>
                <button className="button secondary" type="button" disabled={savingRecord || savingMedia || savingService} onClick={() => void checkSavedResult(kind)}>{ui("ui.app.edit.code.page.checkSaved", "Check saved result")}</button>
                {pending.checked ? <label className="toggle-field"><input type="checkbox" onChange={event => { if (event.target.checked && isCurrent(renderedOperation)) clearRecovery(kind); }} />{ui("ui.app.edit.code.page.reviewedSaved", "I reviewed the saved result and will not add or send a duplicate change. Allow another change.")}</label> : null}
                {kind === "details" && savedSnapshot ? <details><summary>{ui("ui.app.edit.code.page.savedSnapshot", "Saved Profile result (your draft is unchanged)")}</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(savedSnapshot, null, 2)}</pre></details> : null}
              </section>)}
              <div className="form-actions editor-save-bar">
                <button className="button" type="button" onClick={() => void saveChanges(false)} disabled={savingRecord || savingSafety || Boolean(recovery.details)} aria-busy={recordSaveAction === "save"}>
                  {recordSaveAction === "save" ? ui("ui.app.edit.code.page.86c6e0d74cc9", "Saving changes...") : getContentValue(content, "edit.actions.save")}
                </button>
                <button className="button secondary" type="button" onClick={() => void saveChanges(true)} disabled={savingRecord || savingSafety || Boolean(recovery.details)} aria-busy={recordSaveAction === "view"}>
                  {recordSaveAction === "view"
                    ? ui("ui.app.edit.code.page.caae18bd705d", "Saving and opening...")
                    : getContentValue(content, "edit.actions.saveView")}
                </button>

              </div>
            </div>
            {original.safetyStatus === "lost" || original.safetyStatus === "stolen" ? (
              <div className={styles.safetyNotice}>
                <strong>{safetyStatusLabel(original.safetyStatus)}</strong>
                <span>{ui("ui.app.edit.code.page.44a43c5ad757", "This Profile has an active safety alert.")}</span>
                <a href="#privacy-safety" onClick={(event) => { event.preventDefault(); replaceEditorSectionHash("privacy-safety"); }}>{ui("ui.app.edit.code.page.48d5a8281410", "Review safety status")}</a>
              </div>
            ) : null}
              <details className={`${styles.identityHelp} permanent-id`}>
                <summary>
                  <span>{ui("ui.app.edit.code.page.a6c8f92c19f4", "QRguitar ID")}</span>{" "}
                  <strong>{qrCodeFromSerial(form.serial) || original?.qrCode || code}</strong>
                </summary>
                <small>{ui("ui.app.edit.code.page.379e7e78d21e", "When a Serial Number exists, the QRguitar ID uses the format QRG-SERIAL. Previous QR links remain active after approved corrections.")}</small>
              </details>
              <div className="privacy-toggle" aria-label={ui("ui.app.edit.code.page.catalogListing", "Catalog listing")}>
                <div><strong>{ui("ui.app.edit.code.page.savedVisibility", "Profile visibility")}: {form.visibility}</strong>
                  <span>{ui("ui.app.edit.code.page.savePreservesVisibility", "Saving updates this instrument without changing its visibility or publishing your collection. You choose which documents to share.")}</span></div>
              </div>
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
              <div className="form-grid">
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
              {form.saleStatus === "for_sale" ? <ProfileSaleFields fields={customFields} links={customLinks} onFieldsChange={setCustomFields} onLinksChange={setCustomLinks} /> : null}
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
                  <input type="checkbox" checked={showSerialPublic} onChange={(event) => setShowSerialPublic(event.target.checked)} />{ui("ui.app.edit.code.page.serialShareLabel", "Show Serial Number on Profile")}</label>
              </div>
              <p className="fine-print">{ui("ui.app.edit.code.page.serialIdNotice", "This hides only the Serial Number field. The permanent QR ID and URL may still include the serial. No-serial records require QRguitar approval before verification or authenticity confirmation.")}</p>
              <p className="fine-print">{ui("ui.app.edit.code.page.50cccc48b0dc", "Originality is an owner-stated modification status for search and disclosure. It is not QRguitar authentication or verification.")}</p>
              <section className={styles.photoSection} id="photos">
                <div className="field photo-field">
                  <label id="profile-photos-label" htmlFor="profilePhotos">{ui("ui.app.edit.code.page.215ed206acf2", "Profile photos")}</label>
                  <label className={styles.photoPicker} htmlFor="profilePhotos">
                  <span id="profile-photos-help" className={styles.photoHelp}>{ui("ui.app.edit.code.page.catalogPhotosHelp", "Upload up to 20 photos, 12MB each. Pick one as the main image for collection cards, Catalog listings, and the Profile hero.")}</span>
                  <span className={styles.photoChoose}>{ui("ui.app.edit.code.page.choosePhotos", "Choose photos")}</span>
                  <input
                    className={styles.photoInput}
                    aria-labelledby="profile-photos-label"
                    aria-describedby="profile-photos-help"
                    id="profilePhotos"
                    name="profilePhotos"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    multiple
                    onChange={(event) => void addProfilePhotos(event.target.files)}
                  />
                  </label>
                </div>
                <PhotoOrganizer
                  images={galleryImages}
                  mainImage={form.heroImageDataUrl}
                  onSelectMain={selectMainPhoto}
                  onRemove={removePhoto}
                  onMove={movePhoto}
                  statusByImage={photoUploads}
                />
              </section>
              <div className={styles.tools}>
              <details className={styles.optionalSection} id="details">
                <summary>{ui("ui.app.edit.code.page.45989de49fb7", "Details")}</summary>
              <section className="advanced-panel">
                <h3>{ui("ui.app.edit.code.page.7c2e45c2972e", "Add Profile Basics")}</h3>
                <div className="form-grid">
                  <Field label={ui("ui.app.edit.code.page.e69702d5925c", "Display title / nickname")} id="name" value={form.name} onChange={(value) => updateField("name", value)} />
                  <Field label={ui("ui.app.edit.code.page.cf846c3fbd33", "Builder (optional)")} id="builder" value={form.builder} onChange={(value) => updateField("builder", value)} />
                  <Field label={ui("ui.app.edit.code.page.a6c7a84baa67", "Finish")} id="finish" value={form.finish} onChange={(value) => updateField("finish", value)} />
                  <Field label={ui("ui.app.edit.code.page.81d27ef6d503", "Weight")} id="weight" value={form.weight} onChange={(value) => updateField("weight", value)} />
                  <p className="field-note"><Link href="/account?section=collection" target="_blank" rel="noopener noreferrer">{ui("ui.app.edit.code.page.collectionSettingsNewTab", "Collection settings (opens in a new tab)")}</Link></p>
                  <Field label={ui("ui.app.edit.code.page.74d91b61ae60", "Owner status")} id="ownerStatus" value={form.ownerStatus} onChange={(value) => updateField("ownerStatus", value)} />
                  <Field label={ui("ui.app.edit.code.page.15b61974b270", "Location")} id="location" value={form.location} onChange={(value) => updateField("location", value)} />
                </div>
                <div className="field custom-wide">
                  <label htmlFor="summary">{ui("ui.app.edit.code.page.profileStory", "Profile story")}</label>
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
              </section>
              <section className="advanced-panel">
                <h3>{ui("ui.app.edit.code.page.814602d348e0", "Add Any Details")}</h3>
                <div className="custom-list">
                  {customFields.filter((field) => form.saleStatus !== "for_sale" || !isSaleDetail(field.label)).map((field) => (
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
              </section>
              <section className="advanced-panel">
                <h3>{ui("ui.app.edit.code.page.5482252391a3", "Add Website or Social Links")}</h3>
                <div className="custom-list">
                  {customLinks.filter((link) => form.saleStatus !== "for_sale" || link.label.trim().toLowerCase() !== "shop").map((link) => (
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
              </section>
              </details>
              <details className={styles.optionalSection} id="documents">
                <summary>{ui("ui.app.edit.code.page.b4e929d8bcfe", "Documents")} <span className={styles.sectionCount}>{documents.length}/10</span></summary>
              <div className="field photo-field">
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
                    <span>{documents.length}{ui("ui.app.edit.code.page.documentReviewHelp", "/10 files. Unshared documents can support QRguitar verification and authenticity review.")}</span>
                  </div>
                  <div className="proof-vault-list">
                    {documents.map((document) => (
                      <div className="proof-vault-item" key={document.id}>
                        <div className="proof-vault-item-header">
                          <strong>{document.name || ui("ui.app.edit.code.page.9f6d7cb28b64", "Untitled document")}</strong>
                          <span className={document.visibility === "public" ? "status-pill verified-pill" : "status-pill neutral-pill"}>
                            {document.uploadState === "uploading" ? ui("ui.app.edit.code.page.8b898ca34ce7", "Uploading") : document.uploadState === "error" ? ui("ui.app.edit.code.page.6efc5d27f30b", "Upload failed") : document.visibility === "public" ? ui("ui.app.edit.code.page.documentShared", "Shared on Profile") : ui("ui.app.edit.code.page.documentNotShared", "Not shared")}
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
                          <label htmlFor={`${document.id}-public-description`}>{ui("ui.app.edit.code.page.sharedDescription", "Profile description")}</label>
                          <textarea
                            id={`${document.id}-public-description`}
                            value={document.publicDescription}
                            onChange={(event) =>
                              setDocuments((current) => current.map((item) => item.id === document.id ? { ...item, publicDescription: event.target.value } : item))
                            }
                            placeholder={ui("ui.app.edit.code.page.sharedDocumentContext", "Optional context shown when this document is shared.")}
                          />
                        </div>
                        <div className="field">
                          <label htmlFor={`${document.id}-private-notes`}>{ui("ui.app.edit.code.page.ownerNotes", "Owner notes")}</label>
                          <textarea
                            id={`${document.id}-private-notes`}
                            value={document.privateNotes}
                            onChange={(event) =>
                              setDocuments((current) => current.map((item) => item.id === document.id ? { ...item, privateNotes: event.target.value } : item))
                            }
                            placeholder={ui("ui.app.edit.code.page.ownerDocumentNotesHelp", "Owner document notes are not shared on Profile.")}
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
                            {document.visibility === "public" ? ui("ui.app.edit.code.page.documentStopSharing", "Stop sharing") : ui("ui.app.edit.code.page.documentShareAction", "Share on Profile")}
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

              </details>
              <details className={styles.optionalSection} id="media">
                <summary>{ui("ui.app.edit.code.page.d357175cfe89", "Media")} <span className={styles.sectionCount}>{externalMedia.length}</span></summary>
              <section className="qr-customizer" aria-label={ui("ui.app.edit.code.page.3e3ac8296196", "External media")}>
                <div>
                  <span className="eyebrow">{ui("ui.app.edit.code.page.dc600f6490d8", "Media links")}</span>
                  <h3>{ui("ui.app.edit.code.page.55444bb1a4b8", "Add Video or Audio")}</h3>
                  <p>{ui("ui.app.edit.code.page.b2620027b28f", "Add a YouTube, Vimeo, SoundCloud, Bandcamp, or other safe HTTPS media link. QRguitar never accepts custom embed code.")}</p>
                  <p className="fine-print">{ui("ui.app.edit.code.page.mediaSaveHint", "Media changes save immediately using the controls in this section. Save Changes does not add an unfinished media entry.")}</p>
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
                  {readErrors.media ? <p role="alert">{readErrors.media}<button type="button" className="button secondary" onClick={() => void refreshExternalMedia(original.qrCode)}>{ui("ui.app.edit.code.page.retryMediaRead", "Retry saved-media read")}</button></p> : null}
                  <button className="button" type="button" onClick={() => void addExternalMedia()} disabled={savingMedia || Boolean(recovery.media)}>
                    {savingMedia ? ui("ui.app.edit.code.page.dc85af8f2b1d", "Saving...") : ui("ui.app.edit.code.page.a078fb55c65a", "Add Media")}
                  </button>
                </div>
                {externalMedia.length ? (
                  <div className="timeline-list">
                    {externalMedia.map((item, index) => (
                      <article className="timeline-item" key={item.id}>
                        <span>{item.provider} / {item.isPublic ? ui("ui.app.edit.code.page.mediaShared", "Shared on Profile") : ui("ui.app.edit.code.page.mediaNotShared", "Not shared")}</span>
                        <h3>{item.title}</h3>
                        {item.caption ? <p>{item.caption}</p> : null}
                        <a href={item.canonicalUrl} target="_blank" rel="noreferrer">{ui("ui.app.edit.code.page.50f38c2c40b0", "Preview link")}</a>
                        <div className="form-actions">
                          <button className="button secondary" type="button" onClick={() => void updateExternalMedia(item, { isPublic: !item.isPublic })} disabled={savingMedia || Boolean(recovery.media)}>{item.isPublic ? ui("ui.app.edit.code.page.mediaStopSharing", "Stop sharing") : ui("ui.app.edit.code.page.mediaShareAction", "Share on Profile")}</button>
                          <button className="button secondary" type="button" onClick={() => void moveExternalMedia(item, -1)} disabled={savingMedia || Boolean(recovery.media) || index === 0} aria-label={ui("ui.app.edit.code.page.740ebe32a73f", "Move {{value1}} up", { value1: item.title })}>{ui("ui.app.edit.code.page.1359626e7b69", "Move Up")}</button>
                          <button className="button secondary" type="button" onClick={() => void moveExternalMedia(item, 1)} disabled={savingMedia || Boolean(recovery.media) || index === externalMedia.length - 1} aria-label={ui("ui.app.edit.code.page.a1ae739bcef6", "Move {{value1}} down", { value1: item.title })}>{ui("ui.app.edit.code.page.b58330ac2505", "Move Down")}</button>
                          <button className="button secondary" type="button" onClick={() => void removeExternalMedia(item)} disabled={savingMedia || Boolean(recovery.media)}>{ui("ui.app.edit.code.page.c3812fc4acb8", "Remove")}</button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : null}
              </section>
              </details>
              <details className={styles.optionalSection} id="timeline">
                <summary>{ui("ui.app.edit.code.page.23099ed0a502", "Timeline & Ownership")} <span className={styles.sectionCount}>{serviceEvents.length}</span></summary>
              <section className="qr-customizer" aria-label={ui("ui.app.edit.code.page.92777e2212a7", "Timeline and service history")}>
                <div>
                  <span className="eyebrow">{ui("ui.app.edit.code.page.08e02c90e8fa", "Instrument history")}</span>
                  <h3>{ui("ui.app.edit.code.page.480686c56fb4", "Timeline & Service History")}</h3>
                  <p>{ui("ui.app.edit.code.page.bb53b6bbcc71", "Add the history you know - purchases, ownership, service, modifications, restoration, and important milestones.")}</p>
                  <p className="fine-print">{ui("ui.app.edit.code.page.historySaveHint", "History entries save separately when you add or update an entry. Save Changes does not add an unfinished history entry.")}</p>
                </div>
                {readErrors.history ? <p role="alert">{readErrors.history}<button type="button" className="button secondary" onClick={() => void refreshServiceEvents(original.qrCode)}>{ui("ui.app.edit.code.page.retryHistoryRead", "Retry saved-history read")}</button></p> : null}
                {serviceEvents.length ? (
                  <div className="timeline-list">
                    {serviceEvents.map((entry) => (
                      <EditorTimelineEntry key={entry.id} entry={entry} saving={savingService || Boolean(recovery.history)} onEdit={editServiceEvent} onDelete={(event) => void deleteServiceEntry(event)} />
                    ))}
                  </div>
                ) : readErrors.history ? null : (
                  <div className="photo-manager empty">
                    <strong>{ui("ui.app.edit.code.page.e4c12bc75682", "No timeline entries yet")}</strong>
                    <span>{ui("ui.app.edit.code.page.e3fe0f1dad4c", "Add known ownership, purchases, service, repairs, modifications, restoration, and milestones.")}</span>
                  </div>
                )}
                <details className="advanced-panel" id="service">
                  <summary>{editingServiceId ? ui("ui.app.edit.code.page.c1fa1a200083", "Update Timeline Entry") : ui("ui.app.edit.code.page.d9cf5b8885ab", "Add Timeline Entry")}</summary>
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
                    <label htmlFor="servicePublicDescription">{ui("ui.app.edit.code.page.sharedDescription", "Profile description")}</label>
                    <textarea id="servicePublicDescription" rows={3} value={serviceForm.publicDescription} onChange={(event) => updateServiceField("publicDescription", event.target.value)} />
                  </div>
                  <div className="field custom-wide">
                    <label htmlFor="servicePrivateNotes">{ui("ui.app.edit.code.page.ownerNotes", "Owner notes")}</label>
                    <textarea id="servicePrivateNotes" rows={3} value={serviceForm.privateNotes} onChange={(event) => updateServiceField("privateNotes", event.target.value)} />
                  </div>
                  <label className="toggle-field">
                    <input type="checkbox" checked={serviceForm.isPublic} onChange={(event) => updateServiceField("isPublic", event.target.checked)} />{ui("ui.app.edit.code.page.0b8658a6a0c1", "Show this service entry on the QRguitar Profile")}</label>
                  <div className="form-actions">
                    <button className="button" type="button" onClick={() => void saveServiceEntry()} disabled={savingService || Boolean(recovery.history)}>
                      {savingService ? ui("ui.app.edit.code.page.dc85af8f2b1d", "Saving...") : editingServiceId ? ui("ui.app.edit.code.page.c1fa1a200083", "Update Timeline Entry") : ui("ui.app.edit.code.page.d9cf5b8885ab", "Add Timeline Entry")}
                    </button>
                    {editingServiceId ? (
                      <button className="button secondary" type="button" onClick={resetServiceForm}>{ui("ui.app.edit.code.page.fddcfdf8d5f4", "Cancel Edit")}</button>
                    ) : null}
                  </div>
                </div>
                </details>
              </section>
              </details>
              <details className={styles.optionalSection} id="qr-print">
                <summary>{ui("ui.app.edit.code.page.347d28dfa602", "QR & Print")}</summary>
              <section className="qr-customizer" aria-label={ui("ui.app.edit.code.page.5604505e7254", "QR code customization")}>
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
              </details>
              </div>
            </form>
            <div className={styles.secondarySections}>
              <details className={styles.optionalSection} id="trust-verification">
                <summary>{ui("ui.app.edit.code.page.ade9248e0132", "Trust")}</summary>
              <section className="card verification-card" aria-label={ui("ui.app.edit.code.page.3dc74ca2612b", "Trust and verification")}>
                <div>
                  <span className="eyebrow">{ui("ui.app.edit.code.page.5f500bb66024", "Trust & Verification")}</span>
                  <h3>{verificationStatus === "verified" ? ui("ui.app.edit.code.page.d8d9a98cd0e8", "Verified by QRguitar") : ui("ui.app.edit.code.page.33c8e8de41c3", "Unverified")}</h3>
                  <p>
                    {verificationStatus === "verified"
                      ? ui("ui.app.edit.code.page.df6ad347b1a1", "This Profile is verified by QRguitar.")
                      : ui("ui.app.edit.code.page.d7b92d4468d9", "Profile verification is an optional paid review of the recorded information and evidence. A free Profile does not receive verified status automatically. Verification does not confirm authenticity.")}
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
                      <label htmlFor="publicVerificationNote">{ui("ui.app.edit.code.page.profileVerificationNote", "Profile verification note")}</label>
                      <textarea id="publicVerificationNote" rows={3} value={publicVerificationNote} onChange={(event) => setPublicVerificationNote(event.target.value)} />
                    </div>
                    <div className="field custom-wide">
                      <label htmlFor="internalAuthenticityNote">{ui("ui.app.edit.code.page.010edcad212d", "Internal authenticity note")}</label>
                      <textarea id="internalAuthenticityNote" rows={3} value={internalAuthenticityNote} onChange={(event) => setInternalAuthenticityNote(event.target.value)} />
                    </div>
                    <div className="field custom-wide">
                      <label htmlFor="publicAuthenticityNote">{ui("ui.app.edit.code.page.profileAuthenticityNote", "Profile authenticity note")}</label>
                      <textarea id="publicAuthenticityNote" rows={3} value={publicAuthenticityNote} onChange={(event) => setPublicAuthenticityNote(event.target.value)} />
                    </div>
                    </>
                  ) : null}
                  <label className="toggle-field">
                    <input type="checkbox" checked={showVerificationBadge} onChange={(event) => setShowVerificationBadge(event.target.checked)} />{ui("ui.app.edit.code.page.ebb5eff4953a", "Show verification badge publicly")}</label>
                  <label className="toggle-field">
                    <input type="checkbox" checked={showAuthenticityBadge} onChange={(event) => setShowAuthenticityBadge(event.target.checked)} />{ui("ui.app.edit.code.page.a678af9b1c0a", "Show authenticity status publicly")}</label>
                  {authenticityStatus === "confirmed" && !showAuthenticityBadge ? <p className="field-note custom-wide">{ui("ui.app.edit.code.page.authenticityBadgeHelp", "Authenticity is confirmed, but its Profile badge is currently hidden. Turn this on and use Save Changes to show it.")}</p> : null}
                </div>
              </section>
              </details>
              <details className={styles.optionalSection} id="privacy-safety">
                <summary>{ui("ui.app.edit.code.page.f096950eacff", "Privacy & Safety")} <span className={styles.sectionCount}>{safetyStatusLabel(safetyStatus)}</span></summary>
              <section className="card verification-card" aria-label={ui("ui.app.edit.code.page.852068b96459", "Lost or stolen alert")}>
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
                      <label>{ui("ui.app.edit.code.page.noSafetyAlert", "No safety alert")}</label>
                      <span className="fine-print">{ui("ui.app.edit.code.page.noSafetyAlertHelp", "No safety alert is shown on Profile while status is No Alert.")}</span>
                    </div>
                  ) : (
                    <div className="field custom-wide">
                      <label htmlFor="publicSafetyNote">{ui("ui.app.edit.code.page.profileSafetyNote", "Profile safety note")}</label>
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
                    <label htmlFor="safetyNote">{ui("ui.app.edit.code.page.internalSafetyNote", "Internal note")}</label>
                    <textarea
                      id="safetyNote"
                      rows={3}
                      value={safetyNote}
                      onChange={(event) => setSafetyNote(event.target.value)}
                    />
                  </div>
                </div>
              </section>
              </details>
          <details className={`${styles.optionalSection} ${styles.previewDisclosure}`}>
            <summary>{ui("ui.app.edit.code.page.previewDetails", "Preview details")}</summary>
            <p className="fine-print">{ui("ui.app.edit.code.page.previewHint", "This previews your instrument details. Open the saved Profile to review its complete layout and visibility.")}</p>
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
          </details>
            </div>

          </div>


        </div>
      </div></OwnerWorkspace>
      <Footer />
    </>
  ) : (
    <>
      <Nav />
      <main className="section auth-page">
        <div className="shell">
          <section className="card auth-card">
            <div className="eyebrow">{ui("ui.app.edit.code.page.3cbc146d86cb", "Edit instrument")}</div>
            <h2>{!ready ? ui("ui.app.edit.code.page.4e0d5600059d", "Checking account...") : unavailable ? ui("ui.app.edit.code.page.loadUnavailable", "Profile temporarily unavailable") : forbidden ? ui("ui.app.edit.code.page.3d8a710de98a", "Owner access required.") : ui("ui.app.edit.code.page.b2a4948798a5", "Sign in to edit this Profile.")}</h2>
            <p>
              {!ready
                ? ui("ui.app.edit.code.page.4e2bce183e1c", "Checking your account now.")
                : forbidden
                  ? message || ui("ui.app.edit.code.page.c2321cba55d7", "Only the profile owner can edit this profile.")
                  : message || ui("ui.app.edit.code.page.4bfdf5db3c0d", "Sign in with the account that owns this QRguitar Profile.")}
            </p>
            {!ready ? null : unavailable ? <button className="button" type="button" onClick={() => { setReady(false); setUnavailable(false); setMessage(""); setLoadAttempt(value => value + 1); }}>{ui("ui.app.edit.code.page.retryLoad", "Retry Profile load")}</button> : forbidden ? (
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
  onBlur,
  disabled = false
}: {
  label: string;
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  list?: string;
  onBlur?: (value: string) => void;
  disabled?: boolean;
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
        disabled={disabled}
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
