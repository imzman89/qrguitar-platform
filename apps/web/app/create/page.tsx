"use client";
import { useUiText } from "../../components/UiTextProvider";


import { OwnerWorkspace } from "../../components/OwnerWorkspace";
import authStyles from "../../components/AuthForm.module.css";
import styles from "./create.module.css";

import { uploadProfileFile, dataUrlToProfileFile } from "../../lib/profile-upload-client";
import { prepareProfilePhotos } from "../../lib/prepare-profile-photos";
import { ownerProfileHref } from "../../lib/owner-profile";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Footer } from "../../components/Footer";
import { InstrumentPreview } from "../../components/InstrumentPreview";
import { ProfileSaleFields } from "../../components/ProfileSaleFields";
import { isSaleDetail, profileSaleFieldsError } from "../../lib/profile-sale";
import { Nav } from "../../components/Nav";
import { PhotoOrganizer, type PhotoOrganizerStatus } from "../../components/PhotoOrganizer";
import { type CustomProfileField } from "../../lib/local-demo";
import { defaultSiteSettings, fetchPublishedSiteSettings } from "../../lib/site-settings";
import { createBrowserSupabaseClient } from "../../lib/supabase-browser";
import { makePreviewQrCode, qrCodeFromSerial } from "../../lib/qrguitar-id";
import { canonicalInstrumentBrand, establishedInstrumentBrands } from "../../lib/instrument-brands";
import { getContentValue } from "../../lib/content-registry";
import { useSiteContent } from "../../lib/use-site-content";
import { dispatchOptionalTrackingProductEvent, optionalTrackingProductEvents } from "../../lib/optional-tracking-consent";

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
  storagePath?: string;
  uploadState?: PhotoOrganizerStatus["state"];
  uploadMessage?: string;
};

type CreateErrorResponse = {
  ok?: boolean;
  qrCode?: string;
  permanentPath?: string;
  message?: string;
  code?: string;
  fieldErrors?: Record<string, string>;
  retryable?: boolean;
  cleanupUploads?: boolean;
  resetUploads?: boolean;
  uncertain?: boolean;
  existingProfileFound?: boolean;
  existingProfileHref?: string;
  claimHref?: string;
};

type StagedPhoto = PhotoOrganizerStatus & { storagePath?: string };

function makeClientKey() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

type CreateOwner = { id: string; email?: string; user_metadata?: Record<string, unknown> };

export default function CreatePage() {
  const identity = useRef({ actor: "", epoch: 0, active: true });
  const [owner, setOwner] = useState<CreateOwner | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  useEffect(() => {
    identity.current.active = true;
    let revision = 0;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const clearTimer = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; };
    const auth = createBrowserSupabaseClient().auth;
    const apply = (next: CreateOwner | null) => {
      if (cancelled || !identity.current.active) return;
      clearTimer();
      if (identity.current.actor !== (next?.id || "")) {
        identity.current.actor = next?.id || "";
        identity.current.epoch++;
      }
      setOwner(next);
      setAuthChecked(true);
    };
    const { data } = auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION") return;
      revision++;
      apply(session?.user || null);
    });
    const readRevision = revision;
    if (revision === 0) {
      timer = setTimeout(() => { if (!cancelled && identity.current.active && revision === readRevision) setAuthChecked(true); }, 5000);
      void auth.getSession().then(({ data: initial, error }) => {
        if (!cancelled && revision === readRevision) { if (!error) apply(initial.session?.user || null); else { clearTimer(); setAuthChecked(true); } }
      }, () => { if (!cancelled && identity.current.active && revision === readRevision) { clearTimer(); setAuthChecked(true); } });
    }
    return () => { cancelled = true; clearTimer(); identity.current.active = false; identity.current.epoch++; data.subscription.unsubscribe(); };
  }, []);
  const epoch = identity.current.epoch;
  const actor = owner?.id || "";
  return <CreateOwnerDraft key={epoch} user={owner} authChecked={authChecked} isCurrent={() => identity.current.active && identity.current.epoch === epoch && identity.current.actor === actor} />;
}

function CreateOwnerDraft({ user, authChecked, isCurrent }: { user: CreateOwner | null; authChecked: boolean; isCurrent: () => boolean }) {
  const ui = useUiText("app.create.page");
  const sessionUi = useUiText("components.Nav");
  const content = useSiteContent();
  const router = useRouter();
  const uploadFileIds = useRef(new Map<string,string>());
  const saveInFlight = useRef(false);
  const collectionNameEdited = useRef(false);
  const fileSelectionPending = useRef(false);
  const [preparingFiles, setPreparingFiles] = useState(false);
  const [photoFeedback, setPhotoFeedback] = useState("");
  const [documentFeedback, setDocumentFeedback] = useState("");
  const [message, setMessage] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [form, setForm] = useState({
    name: "",
    brand: "",
    model: "",
    serial: "",
    serialNotUsed: false,
    showSerialPublic: false,
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
    acquisitionDate: "",
    seller: "",
    neckProfile: "",
    pickups: "",
    location: "",
    heroImageDataUrl: "",
    summary: "",
    specsNotes: "",
    serviceDate: "",
    serviceType: "Setup",
    serviceTitle: "",
    servicePublicDescription: "",
    servicePrivateNotes: "",
    serviceIsPublic: false,
    visibility: "public"
  });
  const [savedCollectionName, setSavedCollectionName] = useState("");
  useEffect(() => {
    if (!user?.id) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 5000);
    void (async () => {
      const { data } = await createBrowserSupabaseClient().auth.getSession();
      if (controller.signal.aborted || !isCurrent() || data.session?.user.id !== user.id) return;
      const response = await fetch("/api/account", { cache: "no-store", signal: controller.signal,
        headers: { authorization: `Bearer ${data.session.access_token}` } });
      const payload = await response.json();
      if (controller.signal.aborted || !isCurrent() || !response.ok || payload?.ok !== true) return;
      const name = typeof payload.account?.publicCollection?.publicName === "string"
        ? payload.account.publicCollection.publicName.trim() : "";
      if (!name || collectionNameEdited.current || saveInFlight.current) return;
      setSavedCollectionName(name);
      setForm((current) => ({ ...current, owner: name }));
    })().catch(() => { /* The owner can explicitly choose a collection name below. */ })
      .finally(() => window.clearTimeout(timer));
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [user?.id]);

  const [customFields, setCustomFields] = useState<{ id: string; label: string; value: string }[]>([]);
  const [customLinks, setCustomLinks] = useState([{ id: "link-1", label: "", url: "" }]);
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [documents, setDocuments] = useState<DocumentDraft[]>([]);
  const [photoUploads, setPhotoUploads] = useState<Record<string, StagedPhoto>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [lastErrorRetryable, setLastErrorRetryable] = useState(false);
  const [existingProfileHref, setExistingProfileHref] = useState("");
  const [claimHref, setClaimHref] = useState("");
  const [billingHelp, setBillingHelp] = useState(false);
  const [uploadId] = useState(makeClientKey);
  const [idempotencyKey] = useState(makeClientKey);
  const [qrCode, setQrCode] = useState(makePreviewQrCode);
  const [categoryOptions, setCategoryOptions] = useState(defaultSiteSettings.instrumentCategories);
  const [createdCode, setCreatedCode] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const profileHref = useMemo(() => {
    return `/i/${qrCode}`;
  }, [qrCode]);


  useEffect(() => {
    const serialCode = qrCodeFromSerial(form.serial);
    if (serialCode) {
      setQrCode(serialCode);
    } else if (form.serialNotUsed) {
      setQrCode(makePreviewQrCode());
    }
  }, [form.serial, form.serialNotUsed]);

  const previewFields = useMemo<CustomProfileField[]>(
    () =>
      [
        form.instrumentType.trim() ? { id: "preview-type", label: "Type", value: form.instrumentType.trim() } : null,
        { id: "preview-sale-status", label: "Availability", value: form.saleStatus === "for_sale" ? "For Sale" : "Not for Sale" },
        { id: "preview-originality", label: "Originality", value: form.originalityStatus === "all_original" ? "All Original" : form.originalityStatus === "modified" ? "Modified" : "Not Specified" },
        form.finish.trim() ? { id: "preview-finish", label: "Finish", value: form.finish.trim() } : null,
        form.weight.trim() ? { id: "preview-weight", label: "Weight", value: form.weight.trim() } : null,
        form.ownerStatus.trim() ? { id: "preview-owner-status", label: "Ownership", value: form.ownerStatus.trim() } : null,
        form.neckProfile.trim() ? { id: "preview-neck", label: "Neck profile", value: form.neckProfile.trim() } : null,
        form.pickups.trim() ? { id: "preview-pickups", label: "Pickups / electronics", value: form.pickups.trim() } : null,
        ...customFields.filter((field) => field.label.trim() && field.value.trim())
      ].filter((field): field is CustomProfileField => Boolean(field)),
    [customFields, form.finish, form.instrumentType, form.neckProfile, form.originalityStatus, form.ownerStatus, form.pickups, form.saleStatus, form.weight]
  );

  useEffect(() => {
    let cancelled = false;

    void fetchPublishedSiteSettings().then((published) => {
      if (!cancelled && published?.instrumentCategories) {
        setCategoryOptions(published.instrumentCategories);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  function updateField(field: keyof typeof form, value: string) {
    if (!isCurrent()) return;
    if (field === "owner") collectionNameEdited.current = true;
    setForm((current) => {
      if (field === "serial") {
        const firstSerialEntry = !current.serial.trim() && Boolean(value.trim());
        return { ...current, serial: value, showSerialPublic: value.trim() ? (firstSerialEntry ? true : current.showSerialPublic) : false };
      }
      return { ...current, [field]: value };
    });
  }

  async function addProfilePhotos(files: FileList | null) {
    if (!isCurrent()) return;
    if (!files?.length || saveInFlight.current || fileSelectionPending.current) return;
    fileSelectionPending.current = true;
    setPreparingFiles(true);
    setPhotoFeedback("");
    try {
      const remainingSlots = Math.max(0, 20 - galleryImages.length);
      const validation = validateImageFiles(Array.from(files));
      const selectedFiles = validation.files.slice(0, remainingSlots);
      const omittedCount = Math.max(0, validation.files.length - selectedFiles.length);
      const prepared = await prepareProfilePhotos(selectedFiles, fileToCompressedDataUrl, galleryImages);
      if (!isCurrent()) return;
      const dataUrls = prepared.images;
      if (dataUrls.length) {
        setPhotoUploads((current) => ({ ...current, ...Object.fromEntries(dataUrls.map((url) => [url, { state: "ready" as const }])) }));
        setGalleryImages((current) => [...current, ...dataUrls].slice(0, 20));
        setForm((current) => ({ ...current, heroImageDataUrl: current.heroImageDataUrl || dataUrls[0] }));
        setFieldErrors((current) => { const next = { ...current }; delete next.photos; return next; });
      }
      const feedback = [ui("ui.app.create.page.08c41bf0de08", "{{value1}} photo{{value2}} added. Choose any photo as the main image.{{value3}}{{value4}}", {value1: dataUrls.length, value2: dataUrls.length === 1 ? "" : "s", value3: omittedCount ? " " + omittedCount + " photos were not added because each Profile supports up to 20." : "", value4: validation.message ? " " + validation.message : ""})];
      if (prepared.failedNames.length) feedback.push(ui("ui.app.create.page.photoReadFailed", "Could not open: {{files}}. Choose those photos again or try another JPG, PNG, or WebP. Your other photos and details are still here.", { files: prepared.failedNames.join(", ") }));
      if (prepared.duplicateCount) feedback.push(ui("ui.app.create.page.duplicatePhotos", "Photos already selected were skipped."));
      setPhotoFeedback(feedback.join(" "));
    } finally {
      if (isCurrent()) {
        fileSelectionPending.current = false;
        setPreparingFiles(false);
      }
    }
  }

  async function addDocuments(files: FileList | null) {
    if (!isCurrent()) return;
    if (!files?.length || saveInFlight.current || fileSelectionPending.current) return;
    fileSelectionPending.current = true;
    setPreparingFiles(true);
    setDocumentFeedback("");
    try {
      const selection = Array.from(files);
      const selectedFiles = selection.slice(0, Math.max(0, 10 - documents.length));
      const results = await Promise.allSettled(selectedFiles.map(async (file) => {
        if (!["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > MAX_IMAGE_FILE_SIZE || file.size === 0) throw new Error("Unsupported document");
        return { id: makeClientKey(), name: file.name, dataUrl: await fileToDataUrl(file), visibility: "hidden" as const, documentType: "Receipt", issuerSource: "", documentDate: "", description: "", publicDescription: "", privateNotes: "" };
      }));
      if (!isCurrent()) return;
      const nextDocs = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
      setDocuments((current) => [...current, ...nextDocs].slice(0, 10));
      const skipped = selection.length - nextDocs.length;
      setDocumentFeedback(ui("ui.app.create.page.7e22ae7ac922", "{{value1}} document{{value2}} added.", {value1: nextDocs.length, value2: nextDocs.length === 1 ? "" : "s"}) + (skipped ? " " + ui("ui.app.create.page.documentsSkipped", "{{count}} not added. Choose readable PDF, JPG, PNG, or WebP files up to 12MB each, with up to 10 documents per Profile. Your other files and details are still here.", { count: skipped }) : ""));
    } finally {
      if (isCurrent()) {
        fileSelectionPending.current = false;
        setPreparingFiles(false);
      }
    }
  }

  function selectMainPhoto(imageUrl: string) {
    if (!isCurrent()) return;
    setForm((current) => ({ ...current, heroImageDataUrl: imageUrl }));
  }

  function removePhoto(imageUrl: string) {
    if (!isCurrent()) return;
    setPhotoFeedback("");
    uploadFileIds.current.delete("image:" + imageUrl);
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
    if (!isCurrent()) return;
    setGalleryImages((current) => {
      if (fromIndex < 0 || toIndex < 0 || fromIndex >= current.length || toIndex >= current.length || fromIndex === toIndex) return current;
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }

  async function tokenForDraftOwner() {
    if (!isCurrent() || !user?.id) throw new Error("Sign in again before continuing.");
    const { data, error } = await createBrowserSupabaseClient().auth.getSession();
    if (!isCurrent() || error || data.session?.user.id !== user.id) throw new Error("The account changed. Return to the original account before retrying.");
    return data.session.access_token;
  }

  async function cleanupStagedPaths(paths: string[]) {
    if (!paths.length || !isCurrent()) return;
    let token: string;
    try { token = await tokenForDraftOwner(); } catch { return; }
    if (!isCurrent()) return;
    await fetch("/api/instruments/uploads", {
      method: "DELETE",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ uploadId, paths })
    }).catch(() => null);
  }

  async function uploadStagedFile(kind: "image" | "document", dataUrl: string, identityKey: string) {
    if (!isCurrent()) throw new Error("The account changed.");
    const expectedOwnerId = user?.id;
    if (!expectedOwnerId) throw new Error("Sign in again before uploading.");
    const identity = kind + ":" + identityKey;
    let fileId = uploadFileIds.current.get(identity);
    if (!fileId) { fileId = crypto.randomUUID(); uploadFileIds.current.set(identity,fileId); }
    return uploadProfileFile({file:dataUrlToProfileFile(dataUrl),uploadId,fileId,kind,expectedOwnerId,
      tokenForOwner: tokenForDraftOwner});
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
    if (!isCurrent()) throw new Error("The account changed.");
    const photoPaths = galleryImages.map((imageUrl) => photoUploads[imageUrl]?.storagePath || "");
    const failedPhotos: string[] = [];
    await uploadWithConcurrency(galleryImages, async (imageUrl, index) => {
      if (!isCurrent()) return;
      if (photoPaths[index]) return;
      setPhotoUploads((current) => ({ ...current, [imageUrl]: { ...current[imageUrl], state: "uploading", progress: 15 } }));
      try {
        const storagePath = await uploadStagedFile("image", imageUrl, imageUrl);
        if (!isCurrent()) return;
        photoPaths[index] = storagePath;
        setPhotoUploads((current) => ({ ...current, [imageUrl]: { state: "uploaded", progress: 100, storagePath } }));
      } catch (error) {
        if (!isCurrent()) return;
        const message = error instanceof Error ? error.message : "Upload failed. Retry this photo.";
        failedPhotos.push(imageUrl);
        setPhotoUploads((current) => ({ ...current, [imageUrl]: { state: "error", message } }));
      }
    });

    if (!isCurrent()) throw new Error("The account changed.");

    const documentPaths = documents.map((document) => document.storagePath || "");
    const failedDocuments: string[] = [];
    await uploadWithConcurrency(documents, async (document, index) => {
      if (!isCurrent()) return;
      if (documentPaths[index]) return;
      setDocuments((current) => current.map((item) => item.id === document.id ? { ...item, uploadState: "uploading", uploadMessage: "Uploading" } : item));
      try {
        const storagePath = await uploadStagedFile("document", document.dataUrl, document.id);
        if (!isCurrent()) return;
        documentPaths[index] = storagePath;
        setDocuments((current) => current.map((item) => item.id === document.id ? { ...item, storagePath, uploadState: "uploaded", uploadMessage: "Uploaded" } : item));
      } catch (error) {
        if (!isCurrent()) return;
        const message = error instanceof Error ? error.message : "Upload failed. Retry this document.";
        failedDocuments.push(document.id);
        setDocuments((current) => current.map((item) => item.id === document.id ? { ...item, uploadState: "error", uploadMessage: message } : item));
      }
    });

    if (!isCurrent()) throw new Error("The account changed.");

    if (failedPhotos.length || failedDocuments.length) {
      throw new Error(ui("ui.app.create.page.uploadRetry", "Some files could not be uploaded. Choose Retry safely below. Your details and successful uploads are kept."));
    }
    return { photoPaths, documentPaths };
  }

  function clearStagedPathsAfterServerCleanup() {
    uploadFileIds.current.clear();
    setPhotoUploads((current) => Object.fromEntries(Object.entries(current).map(([key]) => [key, { state: "ready" }])));
    setDocuments((current) => current.map((document) => ({ ...document, storagePath: undefined, uploadState: "ready", uploadMessage: undefined })));
  }

  async function createRecordAndRedirect(showProfile = false) {
    if (!isCurrent()) return;
    if (savingProfile || saveInFlight.current || fileSelectionPending.current) return;

    try {
      const nextFieldErrors: Record<string, string> = {};
      const saleError = profileSaleFieldsError({ saleStatus: form.saleStatus, customFields, customLinks });
      if (saleError) { setMessage(saleError); document.getElementById("sale-details")?.scrollIntoView({ block: "center" }); return; }
      if (honeypot.trim()) nextFieldErrors.form = "Submission blocked.";
      if (!form.brand.trim()) nextFieldErrors.brand = "Choose the instrument brand.";
      if (!form.model.trim()) nextFieldErrors.model = "Enter the model or build name.";
      if (!form.instrumentType.trim()) nextFieldErrors.instrumentType = "Choose the instrument type.";
      if (!form.owner.trim() || form.owner.trim().length > 80) nextFieldErrors.owner = "Choose a collection name of 1 to 80 characters. It does not have to be your real name.";
      if (!form.serial.trim() && !form.serialNotUsed) nextFieldErrors.serial = "Enter the Serial Number or confirm that this instrument has no serial.";
      if (!galleryImages.length) nextFieldErrors.photos = "Add at least one clear instrument photo.";
      if (galleryImages.length > 20) nextFieldErrors.photos = "Choose no more than 20 photos.";
      if (form.acquisitionDate && !/^\d{4}-\d{2}-\d{2}$/.test(form.acquisitionDate)) nextFieldErrors.acquisitionDate = "Choose a valid acquisition date.";
      if (customLinks.some((link) => (link.label.trim() || link.url.trim()) && (!link.label.trim() || !/^https:\/\//i.test(link.url.trim())))) {
        nextFieldErrors.customLinks = "Add both a label and a secure https:// URL, or remove the incomplete link.";
      }
      if (Object.keys(nextFieldErrors).length) {
        setFieldErrors(nextFieldErrors);
        setMessage(ui("ui.app.create.page.998db4cfad8a", "Review the highlighted fields before creating this Profile."));
        focusFirstError(nextFieldErrors);
        return;
      }

      if (!user?.email) {
        setMessage(ui("ui.app.create.page.2be1862301b7", "Sign in required to create QRguitar Profiles."));
        return;
      }

      saveInFlight.current = true;
      setSavingProfile(true);
      setMessage("");
      setBillingHelp(false);
      setFieldErrors({});
      setLastErrorRetryable(false);
      setExistingProfileHref("");
      setClaimHref("");

      const staged = await stageSelectedFiles();
      if (!isCurrent()) return;
      const mainPhotoIndex = Math.max(0, galleryImages.indexOf(form.heroImageDataUrl));

      const payload = {
          uploadId,
          idempotencyKey,
          name: form.name.trim() || [form.brand, form.model].filter(Boolean).join(" "),
          brand: form.brand,
          model: form.model,
          serial: form.serial,
          serialNotUsed: form.serialNotUsed,
          showSerialPublic: form.showSerialPublic,
          year: form.year,
          instrumentType: form.instrumentType,
          builder: form.builder,
          finish: form.finish,
          condition: form.instrumentCondition as "new" | "used",
          saleStatus: form.saleStatus as "for_sale" | "not_for_sale",
          originalityStatus: form.originalityStatus as "all_original" | "modified" | "unknown",
          ownerName: form.owner.trim(),
          location: form.location,
          visibility: "public" as const,
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
            privateNotes: document.privateNotes
          })),
          customFields: [
            form.weight.trim() ? { label: "Weight", value: form.weight.trim() } : null,
            form.ownerStatus.trim() ? { label: "Ownership", value: form.ownerStatus.trim() } : null,
            form.acquisitionDate.trim() ? { label: "Acquired", value: form.acquisitionDate.trim() } : null,
            form.seller.trim() ? { label: "Seller / source", value: form.seller.trim() } : null,
            form.neckProfile.trim() ? { label: "Neck profile", value: form.neckProfile.trim() } : null,
            form.pickups.trim() ? { label: "Pickups / electronics", value: form.pickups.trim() } : null,
            form.specsNotes.trim() ? { label: "Specs notes", value: form.specsNotes.trim() } : null,
            ...customFields
              .filter((field) => field.label.trim() && field.value.trim())
              .map((field) => ({ label: field.label.trim(), value: field.value.trim() }))
          ].filter(Boolean),
          customLinks: customLinks
            .filter((link) => link.label.trim() && link.url.trim())
            .map((link) => ({ label: link.label.trim(), url: link.url.trim() })),
          serviceEntry: form.serviceTitle.trim() || form.servicePublicDescription.trim() || form.servicePrivateNotes.trim() ? {
            serviceDate: form.serviceDate,
            eventType: form.serviceType,
            title: form.serviceTitle.trim() || `${form.serviceType} service`,
            publicDescription: form.servicePublicDescription,
            privateNotes: form.servicePrivateNotes,
            shopName: form.seller,
            location: form.location,
            isPublic: form.serviceIsPublic
          } : undefined
        };

      const token = await tokenForDraftOwner();
      if (!isCurrent()) return;
      const response = await fetch("/api/instruments", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      const result = (await response.json().catch(() => null)) as CreateErrorResponse | null;
      if (!isCurrent()) return;

      if (!response.ok || !result?.ok) {
        if (response.status === 409 && result?.ok === false && result?.code === "upload_session_changed" && result?.resetUploads === true && result?.uncertain !== true) clearStagedPathsAfterServerCleanup();
        setFieldErrors(result?.fieldErrors || {});
        setLastErrorRetryable(Boolean(result?.retryable));
        setExistingProfileHref(result?.existingProfileHref || "");
        setClaimHref(result?.claimHref || "");
        setBillingHelp(result?.code === "profile_limit_reached" || result?.code === "billing_review_required");
        if (response.status === 402) {
          setMessage(result?.message || ui("ui.app.create.page.c4bdda3b6f0c", "Your free Profile allowance is full. Check Profile credits in your account, or contact QRguitar for help."));
          return;
        }
        if (response.status === 401) {
          setMessage(ui("ui.app.create.page.87e4b9e285f0", "Your session expired. Sign in again, then return to this page. Your form and selected files are still here."));
        } else {
          setMessage(result?.message || ui("ui.app.create.page.f873682ea460", "The server returned {{value1}}. Your form and selected files are preserved.", {value1: response.status}));
        }
        if (result?.fieldErrors) focusFirstError(result.fieldErrors);
        return;
      } else {
        if (result.qrCode && result.permanentPath) {
          setQrCode(result.qrCode);
        }
      }

      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("qrguitar:catalog-updated"));
      }

      const finalCode = result.qrCode || qrCode;
      void dispatchOptionalTrackingProductEvent({
        name: optionalTrackingProductEvents.profileCreated,
        properties: { visibility: "public" }
      }, { dedupeKey: finalCode });
      setCreatedCode(finalCode);
      setMessage(ui("ui.app.create.page.8063b8ce1a81", "QRguitar Profile created."));

      if (showProfile) {
        router.push(ownerProfileHref({ qrCode: finalCode, visibility: "public" }));
      }
    } catch (error) {
      if (!isCurrent()) return;
      setLastErrorRetryable(true);
      setMessage(error instanceof Error ? error.message : ui("ui.app.create.page.7becb15765b7", "The network request failed. Your form and selected files are preserved; try again."));
    } finally {
      if (isCurrent()) {
        saveInFlight.current = false;
        setSavingProfile(false);
      }
    }
  }

  function focusFirstError(errors: Record<string, string>) {
    const firstField = ["brand", "model", "serial", "instrumentType", "photos", "acquisitionDate", "customLinks", "documents"].find((field) => errors[field]);
    window.setTimeout(() => {
      const target = firstField === "photos"
        ? document.getElementById("profilePhotos")
        : firstField === "customLinks"
          ? document.querySelector<HTMLElement>('[data-create-link-url]')
          : document.getElementById(firstField === "documents" ? "profileDocuments" : firstField || "");
      let disclosure = target?.closest("details");
      while (disclosure) { disclosure.open = true; disclosure = disclosure.parentElement?.closest("details"); }
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    }, 0);
  }

  function saveDraft() {
    void createRecordAndRedirect(false);
  }

  return authChecked && user ? (
    <>
      <Nav />
      <OwnerWorkspace current="create">
        {createdCode ? (
          <div className={styles.success}>
            <section className={styles.successContent}>
              <div className="eyebrow">{ui("ui.app.create.page.9bb4a8d57a82", "Profile created")}</div>
              <h1>{ui("ui.app.create.page.5e16a39b804d", "Profile created.")}</h1>
              <p>{ui("ui.app.create.page.de62112c6b17", "The Profile can keep growing with history, media, documents, service, and ownership while its QRguitar ID and URL stay the same.")}</p>
              <div className="create-success-id"><span>{ui("ui.app.create.page.a6c8f92c19f4", "QRguitar ID")}</span><strong>{createdCode}</strong></div>
              <div className="create-success-actions">
                <Link className="button" href={ownerProfileHref({ qrCode: createdCode, visibility: "public" })}>{ui("ui.app.create.page.41a634bed373", "View Profile")}</Link>
                <Link className="button secondary" href={`/handout/${createdCode}`}>{ui("ui.app.create.page.5ee3796350c7", "Open Print Suite")}</Link>
              </div>
              <details className={styles.moreSuccessActions}>
                <summary>{ui("ui.app.create.page.moreAfterCreate", "Add more to this Profile")}</summary>
                <div className="create-success-actions">
                  <Link className="button secondary" href={`/edit/${createdCode}?section=timeline`}>{ui("ui.app.create.page.c36438fa50cf", "Add History")}</Link>
                  <Link className="button secondary" href={`/edit/${createdCode}?section=media`}>{ui("ui.app.create.page.a078fb55c65a", "Add Media")}</Link>
                  <Link className="button secondary" href={`/edit/${createdCode}?section=documents`}>{ui("ui.app.create.page.764f7a87c4b2", "Add Documents")}</Link>
                  <Link className="button secondary" href="/dashboard">{ui("ui.app.create.page.97ba1d394fab", "Back to Dashboard")}</Link>
                </div>
              </details>
            </section>
          </div>
        ) : (
        <div className={styles.create}>
          <header className={styles.header}>
            <div>
              <div className="eyebrow">{ui("ui.app.create.page.bb758aff6f87", "Create Profile")}</div>
              <h1>{getContentValue(content, "create.hero.headline")}</h1>
              <p>{getContentValue(content, "create.hero.body")}</p>
            </div>

          </header>



          <div className={styles.editor}>
            <form className={styles.form} noValidate onSubmit={(event) => { event.preventDefault(); saveDraft(); }} aria-busy={savingProfile || preparingFiles}>
              <fieldset className={styles.fields} disabled={savingProfile || preparingFiles}>
              <input aria-hidden="true" autoComplete="off" name="company" style={{ display: "none" }} tabIndex={-1} value={honeypot} onChange={(event) => setHoneypot(event.target.value)} />
              <datalist id="qrguitar-known-brands">{establishedInstrumentBrands.map((brand) => <option value={brand} key={brand} />)}</datalist>


                <section className={styles.section} aria-labelledby="create-step-one">
                  <div className={styles.sectionHeading}><h2 id="create-step-one">{ui("ui.app.create.page.6fdf3c9bc618", "Instrument")}</h2><p>{getContentValue(content, "create.identity.body")}</p></div>
                  <div className="form-grid">
                    <Field required error={fieldErrors.brand} label={ui("ui.app.create.page.f48393f8afb1", "Brand / Make")} id="brand" value={form.brand} list="qrguitar-known-brands" placeholder={ui("ui.app.create.page.dbb3572478eb", "Start typing a brand")} onChange={(value) => updateField("brand", value)} onBlur={(value) => updateField("brand", canonicalInstrumentBrand(value) || value.trim())} />
                    <Field required error={fieldErrors.model} label={ui("ui.app.create.page.5e2c614c23f0", "Model")} id="model" value={form.model} onChange={(value) => updateField("model", value)} />
                    <Field required={!form.serialNotUsed} error={fieldErrors.serial} label={ui("ui.app.create.page.14b1b3c5b151", "Serial Number")} id="serial" value={form.serial} onChange={(value) => updateField("serial", value)} placeholder={ui("ui.app.create.page.fe94933d7dde", "Manufacturer or builder serial")} disabled={form.serialNotUsed} />
                    <Field label={ui("ui.app.create.page.246c90b63eac", "Year (optional)")} id="year" value={form.year} onChange={(value) => updateField("year", value)} placeholder={ui("ui.app.create.page.862e62134ba9", "Leave blank if unknown")} />
                    <CategoryField required error={fieldErrors.instrumentType} label={ui("ui.app.create.page.29df4f02b24a", "Instrument type")} id="instrumentType" value={form.instrumentType} options={categoryOptions} onChange={(value) => updateField("instrumentType", value)} />
                  </div>
                  <label className="toggle-field create-inline-toggle">
                    <input type="checkbox" checked={form.serialNotUsed} onChange={(event) => setForm((current) => ({ ...current, serialNotUsed: event.target.checked, serial: event.target.checked ? "" : current.serial, showSerialPublic: event.target.checked ? false : current.showSerialPublic }))} />{ui("ui.app.create.page.eb8fe6031206", "This instrument has no Serial Number")}</label>
                  <p className="fine-print">{getContentValue(content, "create.serial.generatedHelp")}{" "}{ui("ui.app.create.page.d9b8971b5432", "Verification without a Serial Number requires prior QRguitar approval.")}</p>
                </section>


                <section className={styles.section} aria-labelledby="create-step-two">
                  <div className={styles.sectionHeading}><h2 id="create-step-two">{getContentValue(content, "create.photos.heading")}</h2><p>{getContentValue(content, "create.photos.body")}</p></div>
                  <label className="create-photo-drop" htmlFor="profilePhotos">
                    <strong>{getContentValue(content, "create.photo.help")}</strong>
                    <span>{ui("ui.app.create.page.b20d74653b53", "Choose photos from your device or use your phone camera. Files can be up to 12MB each.")}</span>
                    <span className={styles.photoChoose}>{ui("ui.app.create.page.choosePhotos", "Choose photos")}</span>
                    <input className={styles.photoInput} id="profilePhotos" name="profilePhotos" type="file" accept="image/png,image/jpeg,image/webp" multiple aria-describedby="photo-feedback" aria-invalid={Boolean(fieldErrors.photos)} onChange={(event) => { const files = event.currentTarget.files; void addProfilePhotos(files); event.currentTarget.value = ""; }} />
                  </label>
                  {fieldErrors.photos ? <p className="field-error" role="alert">{fieldErrors.photos}</p> : null}
                  <p id="photo-feedback" className={styles.photoFeedback} role="status">{preparingFiles ? ui("ui.app.create.page.preparingFiles", "Preparing your files…") : photoFeedback}</p>
                  {galleryImages.length ? <PhotoOrganizer images={galleryImages} mainImage={form.heroImageDataUrl} onSelectMain={selectMainPhoto} onRemove={removePhoto} onMove={movePhoto} statusByImage={photoUploads} disabled={savingProfile || preparingFiles} /> : null}
                </section>


                <section className={styles.section} aria-labelledby="create-step-three">
                  <div className={styles.sectionHeading}><h2 id="create-step-three">{getContentValue(content, "create.ownership.heading")}</h2><p>{getContentValue(content, "create.ownership.body")}</p></div>
                  <details className={styles.disclosure}>
                    <summary>{ui("ui.app.create.page.ownerDetailsOptional", "Owner and purchase details (optional)")}</summary>
                  <div className="form-grid">
                    <div className="field">
                      <label htmlFor="ownerStatus">{ui("ui.app.create.page.aaf826b59e24", "Relationship (optional)")}</label>
                      <select id="ownerStatus" value={form.ownerStatus} onChange={(event) => updateField("ownerStatus", event.target.value)}>
                        <option value="">{ui("ui.app.create.page.dc12bec5d71f", "Not specified")}</option>
                        <option value="Original owner">{ui("ui.app.create.page.f031d5439d81", "Original owner")}</option>
                        <option value="Current owner">{ui("ui.app.create.page.0abf1fda3294", "Current owner")}</option>
                        <option value="Store inventory">{ui("ui.app.create.page.d6b9af527351", "Store inventory")}</option>
                        <option value="Builder / Brand">{ui("ui.app.create.page.27dae2bdfc65", "Builder / Brand")}</option>
                        <option value="Other">{ui("ui.app.create.page.f97e9da0e3b8", "Other")}</option>
                      </select>
                    </div>
                    <Field label={ui("ui.app.create.page.collectionName", "Collection name")} id="owner" value={form.owner} onChange={(value) => updateField("owner", value)} disabled={Boolean(savedCollectionName)} required error={fieldErrors.owner || ""} placeholder={ui("ui.app.create.page.collectionNamePlaceholder", "A name you choose")} />
                    <p className="field-note">{ui("ui.app.create.page.collectionNameHelp", "Use a name you choose, not necessarily your real name. Change an existing collection name in Account.")} <Link href="/account?section=collection">{ui("ui.app.create.page.collectionSettings", "Collection settings")}</Link></p>
                    <div className={`field${fieldErrors.acquisitionDate ? " has-error" : ""}`}><label htmlFor="acquisitionDate">{ui("ui.app.create.page.0b0489074742", "Acquisition date")}</label><input id="acquisitionDate" type="date" value={form.acquisitionDate} onChange={(event) => updateField("acquisitionDate", event.target.value)} aria-invalid={Boolean(fieldErrors.acquisitionDate)} />{fieldErrors.acquisitionDate ? <span className="field-error">{fieldErrors.acquisitionDate}</span> : null}</div>
                    <Field label={ui("ui.app.create.page.5e553fd3aa01", "Seller / store (optional)")} id="seller" value={form.seller} onChange={(value) => updateField("seller", value)} />
                    <Field label={ui("ui.app.create.page.15b61974b270", "Location")} id="location" value={form.location} onChange={(value) => updateField("location", value)} placeholder={ui("ui.app.create.page.fef8ce3a04b7", "City, region, country")} />
                  </div>
                  </details>
                  <div className={styles.visibility} aria-label={ui("ui.app.create.page.catalogListing", "Catalog listing")}>
                    <div><strong>{ui("ui.app.create.page.catalogIncluded", "Included in Catalog")}</strong><span>{ui("ui.app.create.page.catalogSavePolicy", "Saving adds this instrument and its photos to Catalog and links your collection. You choose which documents to share.")}</span></div>
                  </div>
                  <label className="toggle-field create-inline-toggle">
                    <input type="checkbox" disabled={!form.serial.trim()} checked={form.showSerialPublic && Boolean(form.serial.trim())} onChange={(event) => setForm((current) => ({ ...current, showSerialPublic: event.target.checked }))} />{ui("ui.app.create.page.ee21436940da", "Show Serial Number publicly")}</label>
                  <p className="fine-print">{ui("ui.app.create.page.serialIdNotice", "This hides only the Serial Number field. The permanent QR ID and URL may still include the serial.")}</p>
                </section>


                <details className={styles.disclosure} id="create-step-four">
                  <summary>{ui("ui.app.create.page.optionalDetails", "More instrument details (optional)")}</summary>
                  <div className={styles.sectionHeading}><h2>{ui("ui.app.create.page.45989de49fb7", "Details")}</h2><p>{getContentValue(content, "create.details.body")}</p></div>
                  <div className="form-grid">
                    <Field label={ui("ui.app.create.page.e69702d5925c", "Display title / nickname")} id="name" value={form.name} onChange={(value) => updateField("name", value)} placeholder={ui("ui.app.create.page.1c2552da9e8f", "Defaults to Brand + Model")} />
                    <div className="field"><label htmlFor="instrumentCondition">{ui("ui.app.create.page.39b36d38d6eb", "Condition")}</label><select id="instrumentCondition" value={form.instrumentCondition} onChange={(event) => updateField("instrumentCondition", event.target.value)}><option value="new">{ui("ui.app.create.page.18fdd549b2ed", "New")}</option><option value="used">{ui("ui.app.create.page.ae7d8dfac9ff", "Used")}</option></select></div>
                    <div className="field"><label htmlFor="saleStatus">{ui("ui.app.create.page.12f67f8539c4", "Availability")}</label><select id="saleStatus" value={form.saleStatus} onChange={(event) => updateField("saleStatus", event.target.value)}><option value="not_for_sale">{ui("ui.app.create.page.e063cbea64ad", "Not for Sale")}</option><option value="for_sale">{ui("ui.app.create.page.1a83dec1476e", "For Sale")}</option></select></div>
                    <div className="field"><label htmlFor="originalityStatus">{ui("ui.app.create.page.faafda16cc4c", "Originality")}</label><select id="originalityStatus" value={form.originalityStatus} onChange={(event) => updateField("originalityStatus", event.target.value)}><option value="unknown">{ui("ui.app.create.page.2604d337dc13", "Not Specified")}</option><option value="all_original">{ui("ui.app.create.page.8894d64075bf", "All Original")}</option><option value="modified">{ui("ui.app.create.page.e8ce5dcaf408", "Modified")}</option></select></div>
                    <Field label={ui("ui.app.create.page.cf846c3fbd33", "Builder (optional)")} id="builder" value={form.builder} onChange={(value) => updateField("builder", value)} />
                    <Field label={ui("ui.app.create.page.a6c7a84baa67", "Finish")} id="finish" value={form.finish} onChange={(value) => updateField("finish", value)} />
                    <Field label={ui("ui.app.create.page.81d27ef6d503", "Weight")} id="weight" value={form.weight} onChange={(value) => updateField("weight", value)} />
                    <Field label={ui("ui.app.create.page.14287aa826e9", "Neck profile")} id="neckProfile" value={form.neckProfile} onChange={(value) => updateField("neckProfile", value)} />
                    <Field label={ui("ui.app.create.page.b170628a88a7", "Pickups / electronics")} id="pickups" value={form.pickups} onChange={(value) => updateField("pickups", value)} />
                  </div>
                  {form.saleStatus === "for_sale" ? <ProfileSaleFields fields={customFields} links={customLinks} onFieldsChange={setCustomFields} onLinksChange={setCustomLinks} /> : null}
                  <div className="field custom-wide"><label htmlFor="summary">{ui("ui.app.create.page.ca6f44db47d0", "Profile story")}</label><textarea id="summary" rows={5} value={form.summary} onChange={(event) => updateField("summary", event.target.value)} placeholder={ui("ui.app.create.page.0619a067e490", "What makes this instrument useful, interesting, or important?")} /></div>
                  <details className={styles.disclosure}>
                    <summary>{ui("ui.app.create.page.70c12f95c8df", "Advanced specifications and notes")}</summary>
                    <div className="field custom-wide"><label htmlFor="specsNotes">{ui("ui.app.create.page.0a0d88394619", "Specification notes")}</label><textarea id="specsNotes" rows={4} value={form.specsNotes} onChange={(event) => updateField("specsNotes", event.target.value)} placeholder={ui("ui.app.create.page.49036df3fcb1", "Hardware, wiring, neck carve, fretwire, case details, or other specifications.")} /></div>
                    <div className="custom-list">
                      {customFields.filter((field) => form.saleStatus !== "for_sale" || !isSaleDetail(field.label)).map((field) => <div className="custom-row" key={field.id}><input aria-label={ui("ui.app.create.page.1c65310c2efa", "Specification label")} placeholder={ui("ui.app.create.page.397324160ebb", "Specification")} value={field.label} onChange={(event) => setCustomFields((current) => current.map((item) => item.id === field.id ? { ...item, label: event.target.value } : item))} /><input aria-label={ui("ui.app.create.page.b29700bd3dc8", "Specification value")} placeholder={ui("ui.app.create.page.8e37953d23da", "Value")} value={field.value} onChange={(event) => setCustomFields((current) => current.map((item) => item.id === field.id ? { ...item, value: event.target.value } : item))} /><button className="button secondary" type="button" onClick={() => setCustomFields((current) => current.filter((item) => item.id !== field.id))}>{ui("ui.app.create.page.c3812fc4acb8", "Remove")}</button></div>)}
                      <button className="button secondary" type="button" onClick={() => setCustomFields((current) => [...current, { id: `field-${Date.now()}`, label: "", value: "" }])}>{ui("ui.app.create.page.66a793b2bedd", "Add specification")}</button>
                    </div>
                  </details>
                  <details className={styles.disclosure}>
                    <summary>{ui("ui.app.create.page.66e2ee1daefc", "Add known service work")}</summary>
                    <p className="fine-print">{ui("ui.app.create.page.e83ee74ec617", "This creates a real Timeline service entry, not a loose specification.")}</p>
                    <div className="form-grid">
                      <div className="field"><label htmlFor="serviceDate">{ui("ui.app.create.page.cdb70ebd5845", "Service date")}</label><input id="serviceDate" type="date" value={form.serviceDate} onChange={(event) => updateField("serviceDate", event.target.value)} /></div>
                      <div className="field"><label htmlFor="serviceType">{ui("ui.app.create.page.5844e6bad41d", "Service type")}</label><select id="serviceType" value={form.serviceType} onChange={(event) => updateField("serviceType", event.target.value)}><option value="Setup">{ui("ui.app.create.page.7013af4c42fe", "Setup")}</option><option value="Repair">{ui("ui.app.create.page.1196b6c538ec", "Repair")}</option><option value="Inspection">{ui("ui.app.create.page.6e4fa13da486", "Inspection")}</option><option value="Restoration">{ui("ui.app.create.page.6a3c6c77892d", "Restoration")}</option><option value="Electronics">{ui("ui.app.create.page.7ae9c23d6592", "Electronics")}</option><option value="Fretwork">{ui("ui.app.create.page.8e5078530b61", "Fretwork")}</option><option value="Other">{ui("ui.app.create.page.f97e9da0e3b8", "Other")}</option></select></div>
                      <Field label={ui("ui.app.create.page.e54c593a4afc", "Entry title")} id="serviceTitle" value={form.serviceTitle} onChange={(value) => updateField("serviceTitle", value)} placeholder={ui("ui.app.create.page.c3fdfbe623ce", "Example: Full setup and inspection")} />
                    </div>
                    <div className="field custom-wide"><label htmlFor="servicePublicDescription">{ui("ui.app.create.page.7b004f180b64", "Service description")}</label><textarea id="servicePublicDescription" rows={3} value={form.servicePublicDescription} onChange={(event) => updateField("servicePublicDescription", event.target.value)} /></div>
                    <div className="field custom-wide"><label htmlFor="servicePrivateNotes">{ui("ui.app.create.page.ownerServiceNotes", "Owner notes")}</label><textarea id="servicePrivateNotes" rows={3} value={form.servicePrivateNotes} onChange={(event) => updateField("servicePrivateNotes", event.target.value)} /></div>
                    <label className="toggle-field"><input type="checkbox" checked={form.serviceIsPublic} onChange={(event) => setForm((current) => ({ ...current, serviceIsPublic: event.target.checked }))} />{ui("ui.app.create.page.shareServiceEntry", "Show this service entry on Timeline")}</label>
                  </details>
                  <details className={styles.disclosure}>
                    <summary>{ui("ui.app.create.page.f9397a00eca8", "Links and supporting documents")}</summary>
                    <div className="custom-list">
                      {customLinks.filter((link) => form.saleStatus !== "for_sale" || link.label.trim().toLowerCase() !== "shop").map((link) => <div className="custom-row" key={link.id}><input aria-label={ui("ui.app.create.page.acaa9ea6688f", "Link label")} placeholder={ui("ui.app.create.page.acaa9ea6688f", "Link label")} value={link.label} onChange={(event) => setCustomLinks((current) => current.map((item) => item.id === link.id ? { ...item, label: event.target.value } : item))} /><input data-create-link-url aria-label={ui("ui.app.create.page.9dfd0b9f8f42", "Link URL")} placeholder="https://..." value={link.url} onChange={(event) => setCustomLinks((current) => current.map((item) => item.id === link.id ? { ...item, url: event.target.value } : item))} /><button className="button secondary" type="button" onClick={() => setCustomLinks((current) => current.filter((item) => item.id !== link.id))}>{ui("ui.app.create.page.c3812fc4acb8", "Remove")}</button></div>)}
                      <button className="button secondary" type="button" onClick={() => setCustomLinks((current) => [...current, { id: `link-${Date.now()}`, label: "", url: "" }])}>{ui("ui.app.create.page.dfe9ca4d0f96", "Add link")}</button>
                      {fieldErrors.customLinks ? <span className="field-error" role="alert">{fieldErrors.customLinks}</span> : null}
                    </div>
                    <label className="create-photo-drop compact" htmlFor="profileDocuments"><strong>{ui("ui.app.create.page.37b809b43319", "Add documents (optional)")}</strong><span>{ui("ui.app.create.page.documentDefaultSharing", "Receipts, appraisals, invoices, build sheets, or service slips. New documents are not shared until you choose Share on Profile.")}</span><input id="profileDocuments" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" multiple aria-invalid={Boolean(fieldErrors.documents)} aria-describedby={fieldErrors.documents ? "document-feedback document-error" : "document-feedback"} onChange={(event) => { const files = event.currentTarget.files; void addDocuments(files); event.currentTarget.value = ""; }} /></label>
                    {fieldErrors.documents ? <p id="document-error" className="field-error" role="alert">{fieldErrors.documents}</p> : null}
                    <p id="document-feedback" className={styles.photoFeedback} role="status">{documentFeedback}</p>
                    {documents.length ? <div className="create-document-list">{documents.map((document) => <div key={document.id}><div><strong>{document.name}</strong><span>{document.uploadMessage || (document.visibility === "public" ? ui("ui.app.create.page.documentShared", "Shared on Profile") : ui("ui.app.create.page.documentNotShared", "Not shared"))}</span></div><select aria-label={ui("ui.app.create.page.documentSharing", "{{value1}} sharing", { value1: document.name })} value={document.visibility} onChange={(event) => setDocuments((current) => current.map((item) => item.id === document.id ? { ...item, visibility: event.target.value as "public" | "hidden" } : item))}><option value="hidden">{ui("ui.app.create.page.documentNotShared", "Not shared")}</option><option value="public">{ui("ui.app.create.page.documentShareAction", "Share on Profile")}</option></select><button type="button" onClick={() => { uploadFileIds.current.delete("document:" + document.id); if (document.storagePath) void cleanupStagedPaths([document.storagePath]); setDocuments((current) => current.filter((item) => item.id !== document.id)); }}>{ui("ui.app.create.page.c3812fc4acb8", "Remove")}</button></div>)}</div> : null}
                  </details>
                  <p className="fine-print">{ui("ui.app.create.page.03dc3eccc380", "Originality describes disclosed modification status. It does not mean QRguitar verification or authenticity confirmation.")}</p>
                </details>


            <details className={styles.preview}>
              <summary>{ui("ui.app.create.page.f06c99a84731", "Preview your Profile")}</summary>
              <InstrumentPreview qrCode={qrCode} name={form.name} brand={form.brand} model={form.model} serial={form.serial} year={form.year} owner={form.owner} location={form.location} summary={form.summary} heroImageDataUrl={form.heroImageDataUrl} customFields={previewFields} customLinks={customLinks} />

                <section className={styles.section} aria-labelledby="create-step-five">
                  <div className={styles.sectionHeading}><h2 id="create-step-five">{getContentValue(content, "create.review.heading")}</h2><p>{getContentValue(content, "create.review.body")}</p></div>
                  <div className={styles.review}>
                    <div><span>{ui("ui.app.create.page.a6c8f92c19f4", "QRguitar ID")}</span><strong>{qrCode}</strong></div>
                    <div><span>{ui("ui.app.create.page.14b1b3c5b151", "Serial Number")}</span><strong>{form.serial || ui("ui.app.create.page.8ca6af960b9f", "No serial number")}</strong></div>
                    <div><span>{ui("ui.app.create.page.catalogListing", "Catalog listing")}</span><strong>{ui("ui.app.create.page.catalogIncluded", "Included in Catalog")}</strong></div>
                    <div><span>{ui("ui.app.create.page.12f67f8539c4", "Availability")}</span><strong>{form.saleStatus === "for_sale" ? ui("ui.app.create.page.1a83dec1476e", "For Sale") : ui("ui.app.create.page.e063cbea64ad", "Not for Sale")}</strong></div>
                    <div><span>{ui("ui.app.create.page.faafda16cc4c", "Originality")}</span><strong>{form.originalityStatus === "all_original" ? ui("ui.app.create.page.8894d64075bf", "All Original") : form.originalityStatus === "modified" ? ui("ui.app.create.page.e8ce5dcaf408", "Modified") : ui("ui.app.create.page.2604d337dc13", "Not Specified")}</strong></div>
                    <div><span>{ui("ui.app.create.page.c7d3acc826a8", "Ownership")}</span><strong>{form.ownerStatus || ui("ui.app.create.page.dc12bec5d71f", "Not specified")}</strong></div>
                  </div>
                  <p className="create-permanent-note">{ui("ui.app.create.page.fec85e780f9d", "This QRguitar ID and Profile URL remain permanent. Customize the downloadable QR later from your Dashboard.")}</p>
                </section>

              </details>
              </fieldset>
              {message ? <div className="form-message" role={fieldErrors && Object.keys(fieldErrors).length ? "alert" : "status"}><strong>{message}</strong>{existingProfileHref || claimHref ? <div className="form-actions">{existingProfileHref ? <Link className="button secondary" href={existingProfileHref}>{ui("ui.app.create.page.24ccf710b746", "View existing Profile")}</Link> : null}{claimHref ? <Link className="button secondary" href={claimHref}>{ui("ui.app.create.page.b819c86a0d98", "Request ownership")}</Link> : null}</div> : null}{billingHelp ? <div className="form-actions"><Link className="button secondary" href="/billing" target="_blank" rel="noopener noreferrer">{ui("ui.app.create.page.8090fdcc6209", "Check Profile credits in a new tab")}</Link><span>{ui("ui.app.create.page.19e972d95676", "Keep this form open, then return to create your Profile.")}</span></div> : null}{lastErrorRetryable ? <button className="button secondary" type="button" onClick={() => void createRecordAndRedirect(false)} disabled={savingProfile || preparingFiles}>{ui("ui.app.create.page.aea7359da3eb", "Retry safely")}</button> : null}</div> : null}
              <div className={styles.actions}>
                <Link className="button secondary" href="/dashboard" aria-disabled={savingProfile || preparingFiles} onClick={(event) => { if (saveInFlight.current || fileSelectionPending.current) event.preventDefault(); }}>{ui("ui.app.create.page.19766ed6ccb2", "Cancel")}</Link>
                <button className="button" type="submit" disabled={savingProfile || preparingFiles}>{savingProfile ? ui("ui.app.create.page.aeb7e60a2efa", "Creating Profile...") : getContentValue(content, "create.actions.submit")}</button>
              </div>
            </form>


          </div>
        </div>
        )}
      </OwnerWorkspace>
      <Footer />
    </>
  ) : (
    <>
      <Nav />
      <main className={authStyles.page}>
        <div className={authStyles.layout}>
          <section className={authStyles.formPanel}>
            <div className="eyebrow">{ui("ui.app.create.page.de02ab7a9a50", "Create instrument")}</div>
            <h1>{ui("ui.app.create.page.d7f3b884c97a", "Sign in to create a Profile")}</h1>
            {!authChecked ? (
              <p role="status" aria-live="polite" aria-busy="true">{sessionUi("ui.components.Nav.checkingSignIn", "Checking sign-in...")}</p>
            ) : (
              <>
            <p>{ui("ui.app.create.page.325a8c093318", "Create QRguitar Profiles from your account so the QR, photos, documents, and ownership stay tied to the right owner.")}</p>
            <div className="form-actions">
              <Link className="button" href={`/login?next=${encodeURIComponent("/create")}`}>{ui("ui.app.create.page.bfd402b2f6f3", "Sign in")}</Link>
              <Link className="button secondary" href={`/login?mode=register&next=${encodeURIComponent("/create")}`}>{ui("ui.app.create.page.798ca2ce18bf", "Create account")}</Link>
              <Link className="button secondary" href="/catalog">{ui("ui.app.create.page.4d05dc6da837", "Browse catalog")}</Link>
            </div>
              </>
            )}
          </section>
        </div>
      </main>
      <Footer />
    </>
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

        try {
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          const prepared = canvas.toDataURL(file.type === "image/webp" ? "image/webp" : "image/jpeg", 0.88);
          if (!prepared.startsWith("data:image/")) throw new Error("Could not prepare image.");
          resolve(prepared);
        } catch (error) { reject(error); }
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

function Field({
  label,
  id,
  value,
  onChange,
  placeholder,
  list,
  onBlur,
  disabled = false,
  required = false,
  error = ""
}: {
  label: string;
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  list?: string;
  onBlur?: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  error?: string;
}) {
  return (
    <div className={`field${error ? " has-error" : ""}`}>
      <label htmlFor={id}>{label}{required ? <span aria-hidden="true"> *</span> : null}</label>
      <input
        id={id}
        name={id}
        value={value}
        placeholder={placeholder}
        list={list}
        disabled={disabled}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onChange(event.target.value)}
        onBlur={(event) => onBlur?.(event.target.value)}
      />
      {error ? <span className="field-error" id={`${id}-error`}>{error}</span> : null}
    </div>
  );
}

function CategoryField({
  label,
  id,
  value,
  options,
  onChange,
  required = false,
  error = ""
}: {
  label: string;
  id: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  required?: boolean;
  error?: string;
}) {
  const ui = useUiText("app.create.page");
  const cleanedValue = value.trim();
  const hasCustomValue = cleanedValue && !options.some((option) => option.toLowerCase() === cleanedValue.toLowerCase());

  return (
    <div className={`field${error ? " has-error" : ""}`}>
      <label htmlFor={id}>{label}{required ? <span aria-hidden="true"> *</span> : null}</label>
      <select id={id} name={id} value={value} required={required} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} onChange={(event) => onChange(event.target.value)}>
        <option value="">{ui("ui.app.create.page.e26788c57413", "Select category")}</option>
        {hasCustomValue ? <option value={cleanedValue}>{cleanedValue}</option> : null}
        {options.map((option) => (
          <option value={option} key={option}>
            {option}
          </option>
        ))}
      </select>
      {error ? <span className="field-error" id={`${id}-error`}>{error}</span> : null}
    </div>
  );
}

function normalizeBulkHeader(value: string) {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (normalized === "make" || normalized === "brandname") {
    return "brand";
  }
  if (normalized === "serialnumber" || normalized === "serialbuildid" || normalized === "buildid") {
    return "serial";
  }
  if (normalized === "instrumenttype" || normalized === "category") {
    return "type";
  }
  if (normalized === "salestatus" || normalized === "forsale" || normalized === "available" || normalized === "availability") {
    return "sale_status";
  }
  if (normalized === "originalitystatus" || normalized === "original" || normalized === "mods" || normalized === "modificationstatus") {
    return "originality";
  }
  if (normalized === "photo" || normalized === "photourl" || normalized === "image" || normalized === "imageurl" || normalized === "mainphoto") {
    return "photo";
  }
  if (normalized === "description" || normalized === "notes") {
    return "summary";
  }
  return normalized;
}

function splitBulkLine(line: string, delimiter: string) {
  if (delimiter === "\t") {
    return line.split("\t").map((cell) => cell.trim());
  }

  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (const char of line) {
    if (char === "\"") {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}
