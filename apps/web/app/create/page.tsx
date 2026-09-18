"use client";

import { uploadProfileFile, dataUrlToProfileFile } from "../../lib/profile-upload-client";
import { ownerProfileHref } from "../../lib/owner-profile";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Footer } from "../../components/Footer";
import { InstrumentPreview } from "../../components/InstrumentPreview";
import { Nav } from "../../components/Nav";
import { PhotoOrganizer, type PhotoOrganizerStatus } from "../../components/PhotoOrganizer";
import { type CustomProfileField } from "../../lib/local-demo";
import { defaultSiteSettings, fetchPublishedSiteSettings } from "../../lib/site-settings";
import { createBrowserSupabaseClient, getSupabaseAccessToken } from "../../lib/supabase-browser";
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

export default function CreatePage() {
  const content = useSiteContent();
  const router = useRouter();
  const uploadFileIds = useRef(new Map<string,string>());
  const [message, setMessage] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState<{ id: string; email?: string; user_metadata?: Record<string, unknown> } | null>(null);
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
    const supabase = createBrowserSupabaseClient();
    let cancelled = false;

    void fetchPublishedSiteSettings().then((published) => {
      if (!cancelled && published?.instrumentCategories) {
        setCategoryOptions(published.instrumentCategories);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) {
        return;
      }

      const sessionUser = data.session?.user || null;
      setUser(sessionUser);
      if (sessionUser) {
        setForm((current) => ({
          ...current,
          owner: current.owner || String(sessionUser.user_metadata?.display_name || sessionUser.email?.split("@")[0] || "")
        }));
      }
      setAuthChecked(true);
    });

    const timeout = window.setTimeout(() => {
      if (!cancelled) {
        setAuthChecked(true);
      }
    }, 5000);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, []);

  function updateField(field: keyof typeof form, value: string) {
    setForm((current) => {
      if (field === "serial") {
        const firstSerialEntry = !current.serial.trim() && Boolean(value.trim());
        return { ...current, serial: value, showSerialPublic: value.trim() ? (firstSerialEntry ? true : current.showSerialPublic) : false };
      }
      return { ...current, [field]: value };
    });
  }

  async function addProfilePhotos(files: FileList | null) {
    if (!files?.length) {
      return;
    }

    const remainingSlots = Math.max(0, 20 - galleryImages.length);
    const selectedFiles = Array.from(files).slice(0, remainingSlots);
    const omittedCount = Math.max(0, files.length - selectedFiles.length);
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
    setMessage(`${dataUrls.length} photo${dataUrls.length === 1 ? "" : "s"} added. Choose any photo as the main image.${omittedCount ? ` ${omittedCount} photo${omittedCount === 1 ? " was" : "s were"} not added because each Profile supports up to 20.` : ""}${validation.message ? ` ${validation.message}` : ""}`);
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
        privateNotes: ""
      }))
    );

    setDocuments((current) => [...current, ...nextDocs].slice(0, 10));
    setMessage(`${nextDocs.length} document${nextDocs.length === 1 ? "" : "s"} added.`);
  }

  function selectMainPhoto(imageUrl: string) {
    setForm((current) => ({ ...current, heroImageDataUrl: imageUrl }));
  }

  function removePhoto(imageUrl: string) {
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
    setGalleryImages((current) => {
      if (fromIndex < 0 || toIndex < 0 || fromIndex >= current.length || toIndex >= current.length || fromIndex === toIndex) return current;
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }

  async function cleanupStagedPaths(paths: string[]) {
    if (!paths.length) return;
    const token = await getSupabaseAccessToken();
    await fetch("/api/instruments/uploads", {
      method: "DELETE",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ uploadId, paths })
    }).catch(() => null);
  }

  async function uploadStagedFile(kind: "image" | "document", dataUrl: string, _index: number) {
    const expectedOwnerId = user?.id;
    if (!expectedOwnerId) throw new Error("Sign in again before uploading.");
    const identity = kind + ":" + dataUrl;
    let fileId = uploadFileIds.current.get(identity);
    if (!fileId) { fileId = crypto.randomUUID(); uploadFileIds.current.set(identity,fileId); }
    return uploadProfileFile({file:dataUrlToProfileFile(dataUrl),uploadId,fileId,kind,expectedOwnerId,
      tokenForOwner:async()=>{
        const {data} = await createBrowserSupabaseClient().auth.getSession();
        if (data.session?.user.id !== expectedOwnerId) throw new Error("The account changed. Return to the original account before retrying.");
        return data.session.access_token;
      }});
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
    const photoPaths = galleryImages.map((imageUrl) => photoUploads[imageUrl]?.storagePath || "");
    const failedPhotos: string[] = [];
    await uploadWithConcurrency(galleryImages, async (imageUrl, index) => {
      if (photoPaths[index]) return;
      setPhotoUploads((current) => ({ ...current, [imageUrl]: { ...current[imageUrl], state: "uploading", progress: 15 } }));
      try {
        const storagePath = await uploadStagedFile("image", imageUrl, index);
        photoPaths[index] = storagePath;
        setPhotoUploads((current) => ({ ...current, [imageUrl]: { state: "uploaded", progress: 100, storagePath } }));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Upload failed. Retry this photo.";
        failedPhotos.push(imageUrl);
        setPhotoUploads((current) => ({ ...current, [imageUrl]: { state: "error", message } }));
      }
    });

    const documentPaths = documents.map((document) => document.storagePath || "");
    const failedDocuments: string[] = [];
    await uploadWithConcurrency(documents, async (document, index) => {
      if (documentPaths[index]) return;
      setDocuments((current) => current.map((item) => item.id === document.id ? { ...item, uploadState: "uploading", uploadMessage: "Uploading" } : item));
      try {
        const storagePath = await uploadStagedFile("document", document.dataUrl, index);
        documentPaths[index] = storagePath;
        setDocuments((current) => current.map((item) => item.id === document.id ? { ...item, storagePath, uploadState: "uploaded", uploadMessage: "Uploaded" } : item));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Upload failed. Retry this document.";
        failedDocuments.push(document.id);
        setDocuments((current) => current.map((item) => item.id === document.id ? { ...item, uploadState: "error", uploadMessage: message } : item));
      }
    });

    if (failedPhotos.length || failedDocuments.length) {
      throw new Error("Some files could not be uploaded. Retry the files marked in red; successful uploads are preserved.");
    }
    return { photoPaths, documentPaths };
  }

  function clearStagedPathsAfterServerCleanup() {
    uploadFileIds.current.clear();
    setPhotoUploads((current) => Object.fromEntries(Object.entries(current).map(([key]) => [key, { state: "ready" }])));
    setDocuments((current) => current.map((document) => ({ ...document, storagePath: undefined, uploadState: "ready", uploadMessage: undefined })));
  }

  async function createRecordAndRedirect(showProfile = false) {
    if (savingProfile) return;

    try {
      const nextFieldErrors: Record<string, string> = {};
      if (honeypot.trim()) nextFieldErrors.form = "Submission blocked.";
      if (!form.brand.trim()) nextFieldErrors.brand = "Choose the instrument brand.";
      if (!form.model.trim()) nextFieldErrors.model = "Enter the model or build name.";
      if (!form.instrumentType.trim()) nextFieldErrors.instrumentType = "Choose the instrument type.";
      if (!form.serial.trim() && !form.serialNotUsed) nextFieldErrors.serial = "Enter the Serial Number or confirm that this instrument has no serial.";
      if (!galleryImages.length) nextFieldErrors.photos = "Add at least one clear instrument photo.";
      if (galleryImages.length > 20) nextFieldErrors.photos = "Choose no more than 20 photos.";
      if (form.acquisitionDate && !/^\d{4}-\d{2}-\d{2}$/.test(form.acquisitionDate)) nextFieldErrors.acquisitionDate = "Choose a valid acquisition date.";
      if (customLinks.some((link) => (link.label.trim() || link.url.trim()) && (!link.label.trim() || !/^https:\/\//i.test(link.url.trim())))) {
        nextFieldErrors.customLinks = "Add both a label and a secure https:// URL, or remove the incomplete link.";
      }
      if (Object.keys(nextFieldErrors).length) {
        setFieldErrors(nextFieldErrors);
        setMessage("Review the highlighted fields before creating this Profile.");
        focusFirstError(nextFieldErrors);
        return;
      }

      if (!user?.email) {
        setMessage("Sign in required to create QRguitar Profiles.");
        return;
      }

      setSavingProfile(true);
      setMessage("");
      setBillingHelp(false);
      setFieldErrors({});
      setLastErrorRetryable(false);
      setExistingProfileHref("");
      setClaimHref("");

      const staged = await stageSelectedFiles();
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
          ownerName: form.owner || String(user.user_metadata?.display_name || user.email || ""),
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

      const token = await getSupabaseAccessToken();
      const response = await fetch("/api/instruments", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      const result = (await response.json().catch(() => null)) as CreateErrorResponse | null;

      if (!response.ok || !result?.ok) {
        if (response.status === 409 && result?.ok === false && result?.code === "upload_session_changed" && result?.resetUploads === true && result?.uncertain !== true) clearStagedPathsAfterServerCleanup();
        setFieldErrors(result?.fieldErrors || {});
        setLastErrorRetryable(Boolean(result?.retryable));
        setExistingProfileHref(result?.existingProfileHref || "");
        setClaimHref(result?.claimHref || "");
        setBillingHelp(result?.code === "profile_limit_reached" || result?.code === "billing_review_required");
        if (response.status === 402) {
          setMessage(result?.message || "Your free Profile allowance is full. Check Profile credits in your account, or contact QRguitar for help.");
          return;
        }
        if (response.status === 401) {
          setMessage("Your session expired. Sign in again, then return to this page. Your form and selected files are still here.");
        } else {
          setMessage(result?.message || `The server returned ${response.status}. Your form and selected files are preserved.`);
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
        properties: { visibility: form.visibility as "public" | "private" | "unlisted" }
      }, { dedupeKey: finalCode });
      setCreatedCode(finalCode);
      setMessage("QRguitar Profile created.");

      if (showProfile) {
        router.push(ownerProfileHref({ qrCode: finalCode, visibility: form.visibility as "public" | "private" }));
      }
    } catch (error) {
      setLastErrorRetryable(true);
      setMessage(error instanceof Error ? error.message : "The network request failed. Your form and selected files are preserved; try again.");
    } finally {
      setSavingProfile(false);
    }
  }

  function focusFirstError(errors: Record<string, string>) {
    const firstField = ["brand", "model", "serial", "instrumentType", "photos", "acquisitionDate", "customLinks", "documents"].find((field) => errors[field]);
    window.setTimeout(() => {
      const target = firstField === "photos"
        ? document.getElementById("profilePhotos")
        : firstField === "customLinks"
          ? document.querySelector<HTMLElement>('[aria-label="Link URL"]')
          : document.getElementById(firstField || "");
      target?.focus();
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
  }

  function saveDraft() {
    void createRecordAndRedirect(false);
  }

  return authChecked && user ? (
    <>
      <Nav />
      <main className="section create-page create-wizard-page">
        {createdCode ? (
          <div className="shell create-success-shell">
            <section className="card create-success-card">
              <div className="eyebrow">Profile created</div>
              <h1>Your permanent QRguitar Profile is ready.</h1>
              <p>The Profile can keep growing with history, media, documents, service, and ownership while its QRguitar ID and URL stay the same.</p>
              <div className="create-success-id"><span>QRguitar ID</span><strong>{createdCode}</strong></div>
              <div className="create-success-actions">
                <Link className="button" href={ownerProfileHref({ qrCode: createdCode, visibility: form.visibility as "public" | "private" })}>View Profile</Link>
                <Link className="button secondary" href={`/edit/${createdCode}?section=timeline`}>Add History</Link>
                <Link className="button secondary" href={`/edit/${createdCode}?section=media`}>Add Media</Link>
                <Link className="button secondary" href={`/edit/${createdCode}?section=documents`}>Add Documents</Link>
                <Link className="button secondary" href={`/handout/${createdCode}`}>Open Print Suite</Link>
                <Link className="button secondary" href="/dashboard">Back to Dashboard</Link>
              </div>
            </section>
          </div>
        ) : (
        <div className="shell">
          <header className="create-wizard-hero">
            <div>
              <div className="eyebrow">Create Profile</div>
              <h1>{getContentValue(content, "create.hero.headline")}</h1>
              <p>{getContentValue(content, "create.hero.body")}</p>
            </div>
            <div className="permanent-id create-id-preview">
              <span>QRguitar ID preview</span>
              <strong>{qrCode}</strong>
              <small>{getContentValue(content, "create.serial.help")}</small>
            </div>
          </header>


          <div className="create-wizard-layout">
            <form className="card form create-wizard-form" onSubmit={(event) => event.preventDefault()}>
              <input aria-hidden="true" autoComplete="off" name="company" style={{ display: "none" }} tabIndex={-1} value={honeypot} onChange={(event) => setHoneypot(event.target.value)} />
              <datalist id="qrguitar-known-brands">{establishedInstrumentBrands.map((brand) => <option value={brand} key={brand} />)}</datalist>


                <section className="create-step-panel" aria-labelledby="create-step-one">
                  <div className="form-section-heading"><span className="eyebrow">Step 1</span><h2 id="create-step-one">Instrument</h2><p>{getContentValue(content, "create.identity.body")}</p></div>
                  <div className="form-grid">
                    <Field required error={fieldErrors.brand} label="Brand / Make" id="brand" value={form.brand} list="qrguitar-known-brands" placeholder="Start typing a brand" onChange={(value) => updateField("brand", value)} onBlur={(value) => updateField("brand", canonicalInstrumentBrand(value) || value.trim())} />
                    <Field required error={fieldErrors.model} label="Model" id="model" value={form.model} onChange={(value) => updateField("model", value)} />
                    <Field required={!form.serialNotUsed} error={fieldErrors.serial} label="Serial Number" id="serial" value={form.serial} onChange={(value) => updateField("serial", value)} placeholder="Manufacturer or builder serial" disabled={form.serialNotUsed} />
                    <Field label="Year (optional)" id="year" value={form.year} onChange={(value) => updateField("year", value)} placeholder="Leave blank if unknown" />
                    <CategoryField required error={fieldErrors.instrumentType} label="Instrument type" id="instrumentType" value={form.instrumentType} options={categoryOptions} onChange={(value) => updateField("instrumentType", value)} />
                  </div>
                  <label className="toggle-field create-inline-toggle">
                    <input type="checkbox" checked={form.serialNotUsed} onChange={(event) => setForm((current) => ({ ...current, serialNotUsed: event.target.checked, serial: event.target.checked ? "" : current.serial, showSerialPublic: event.target.checked ? false : current.showSerialPublic }))} />
                    This instrument has no Serial Number
                  </label>
                  <p className="fine-print">{getContentValue(content, "create.serial.generatedHelp")} Verification without a Serial Number requires prior QRguitar approval.</p>
                </section>


                <section className="create-step-panel" aria-labelledby="create-step-two">
                  <div className="form-section-heading"><span className="eyebrow">Step 2</span><h2 id="create-step-two">{getContentValue(content, "create.photos.heading")}</h2><p>{getContentValue(content, "create.photos.body")}</p></div>
                  <label className="create-photo-drop" htmlFor="profilePhotos">
                    <strong>{getContentValue(content, "create.photo.help")}</strong>
                    <span>Choose photos from your device or use your phone camera. Files can be up to 12MB each.</span>
                    <input id="profilePhotos" name="profilePhotos" type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(event) => void addProfilePhotos(event.target.files)} />
                  </label>
                  {fieldErrors.photos ? <p className="field-error" role="alert">{fieldErrors.photos}</p> : null}
                  <PhotoOrganizer images={galleryImages} mainImage={form.heroImageDataUrl} onSelectMain={selectMainPhoto} onRemove={removePhoto} onMove={movePhoto} statusByImage={photoUploads} />
                </section>


                <section className="create-step-panel" aria-labelledby="create-step-three">
                  <div className="form-section-heading"><span className="eyebrow">Step 3</span><h2 id="create-step-three">{getContentValue(content, "create.ownership.heading")}</h2><p>{getContentValue(content, "create.ownership.body")}</p></div>
                  <div className="form-grid">
                    <div className="field">
                      <label htmlFor="ownerStatus">Relationship (optional)</label>
                      <select id="ownerStatus" value={form.ownerStatus} onChange={(event) => updateField("ownerStatus", event.target.value)}>
                        <option value="">Not specified</option>
                        <option value="Original owner">Original owner</option>
                        <option value="Current owner">Current owner</option>
                        <option value="Store inventory">Store inventory</option>
                        <option value="Builder / Brand">Builder / Brand</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <Field label="Owner display" id="owner" value={form.owner} onChange={(value) => updateField("owner", value)} placeholder="Name or collection" />
                    <div className={`field${fieldErrors.acquisitionDate ? " has-error" : ""}`}><label htmlFor="acquisitionDate">Acquisition date</label><input id="acquisitionDate" type="date" value={form.acquisitionDate} onChange={(event) => updateField("acquisitionDate", event.target.value)} aria-invalid={Boolean(fieldErrors.acquisitionDate)} />{fieldErrors.acquisitionDate ? <span className="field-error">{fieldErrors.acquisitionDate}</span> : null}</div>
                    <Field label="Seller / store (optional)" id="seller" value={form.seller} onChange={(value) => updateField("seller", value)} />
                    <Field label="Location" id="location" value={form.location} onChange={(value) => updateField("location", value)} placeholder="City, region, country" />
                  </div>
                  <div className="privacy-toggle create-visibility-control" aria-label="Profile visibility">
                    <div><strong>{form.visibility === "public" ? "Public" : form.visibility === "unlisted" ? "Unlisted" : "Private"}</strong><span>{form.visibility === "public" ? "Listed in the Catalog and available by QR or direct link." : form.visibility === "unlisted" ? "Hidden from the Catalog but available by QR or direct link." : "Available only to the signed-in owner and authorized admin."}</span></div>
                    <label className="field visibility-select" htmlFor="profileVisibility"><span>Visibility</span><select id="profileVisibility" value={form.visibility} onChange={(event) => updateField("visibility", event.target.value)}><option value="public">Public</option><option value="unlisted">Unlisted</option><option value="private">Private</option></select></label>
                  </div>
                  <label className="toggle-field create-inline-toggle">
                    <input type="checkbox" disabled={!form.serial.trim()} checked={form.showSerialPublic && Boolean(form.serial.trim())} onChange={(event) => setForm((current) => ({ ...current, showSerialPublic: event.target.checked }))} />
                    Show Serial Number publicly
                  </label>
                  <p className="fine-print">This hides only the Serial Number field. The permanent QR ID and URL may still include the serial. Choose a private Profile to restrict access to the signed-in owner and authorized admin.</p>
                </section>


                <section className="create-step-panel" aria-labelledby="create-step-four">
                  <div className="form-section-heading"><span className="eyebrow">Step 4</span><h2 id="create-step-four">Details</h2><p>{getContentValue(content, "create.details.body")}</p></div>
                  <div className="form-grid">
                    <Field label="Display title / nickname" id="name" value={form.name} onChange={(value) => updateField("name", value)} placeholder="Defaults to Brand + Model" />
                    <div className="field"><label htmlFor="instrumentCondition">Condition</label><select id="instrumentCondition" value={form.instrumentCondition} onChange={(event) => updateField("instrumentCondition", event.target.value)}><option value="new">New</option><option value="used">Used</option></select></div>
                    <div className="field"><label htmlFor="saleStatus">Availability</label><select id="saleStatus" value={form.saleStatus} onChange={(event) => updateField("saleStatus", event.target.value)}><option value="not_for_sale">Not for Sale</option><option value="for_sale">For Sale</option></select></div>
                    <div className="field"><label htmlFor="originalityStatus">Originality</label><select id="originalityStatus" value={form.originalityStatus} onChange={(event) => updateField("originalityStatus", event.target.value)}><option value="unknown">Not Specified</option><option value="all_original">All Original</option><option value="modified">Modified</option></select></div>
                    <Field label="Builder (optional)" id="builder" value={form.builder} onChange={(value) => updateField("builder", value)} />
                    <Field label="Finish" id="finish" value={form.finish} onChange={(value) => updateField("finish", value)} />
                    <Field label="Weight" id="weight" value={form.weight} onChange={(value) => updateField("weight", value)} />
                    <Field label="Neck profile" id="neckProfile" value={form.neckProfile} onChange={(value) => updateField("neckProfile", value)} />
                    <Field label="Pickups / electronics" id="pickups" value={form.pickups} onChange={(value) => updateField("pickups", value)} />
                  </div>
                  <div className="field custom-wide"><label htmlFor="summary">Profile story</label><textarea id="summary" rows={5} value={form.summary} onChange={(event) => updateField("summary", event.target.value)} placeholder="What makes this instrument useful, interesting, or important?" /></div>
                  <details className="advanced-panel">
                    <summary>Advanced specifications and notes</summary>
                    <div className="field custom-wide"><label htmlFor="specsNotes">Specification notes</label><textarea id="specsNotes" rows={4} value={form.specsNotes} onChange={(event) => updateField("specsNotes", event.target.value)} placeholder="Hardware, wiring, neck carve, fretwire, case details, or other specifications." /></div>
                    <div className="custom-list">
                      {customFields.map((field) => <div className="custom-row" key={field.id}><input aria-label="Specification label" placeholder="Specification" value={field.label} onChange={(event) => setCustomFields((current) => current.map((item) => item.id === field.id ? { ...item, label: event.target.value } : item))} /><input aria-label="Specification value" placeholder="Value" value={field.value} onChange={(event) => setCustomFields((current) => current.map((item) => item.id === field.id ? { ...item, value: event.target.value } : item))} /><button className="button secondary" type="button" onClick={() => setCustomFields((current) => current.filter((item) => item.id !== field.id))}>Remove</button></div>)}
                      <button className="button secondary" type="button" onClick={() => setCustomFields((current) => [...current, { id: `field-${Date.now()}`, label: "", value: "" }])}>Add specification</button>
                    </div>
                  </details>
                  <details className="advanced-panel">
                    <summary>Add known service work</summary>
                    <p className="fine-print">This creates a real Timeline service entry, not a loose specification.</p>
                    <div className="form-grid">
                      <div className="field"><label htmlFor="serviceDate">Service date</label><input id="serviceDate" type="date" value={form.serviceDate} onChange={(event) => updateField("serviceDate", event.target.value)} /></div>
                      <div className="field"><label htmlFor="serviceType">Service type</label><select id="serviceType" value={form.serviceType} onChange={(event) => updateField("serviceType", event.target.value)}><option>Setup</option><option>Repair</option><option>Inspection</option><option>Restoration</option><option>Electronics</option><option>Fretwork</option><option>Other</option></select></div>
                      <Field label="Entry title" id="serviceTitle" value={form.serviceTitle} onChange={(value) => updateField("serviceTitle", value)} placeholder="Example: Full setup and inspection" />
                    </div>
                    <div className="field custom-wide"><label htmlFor="servicePublicDescription">Service description</label><textarea id="servicePublicDescription" rows={3} value={form.servicePublicDescription} onChange={(event) => updateField("servicePublicDescription", event.target.value)} /></div>
                    <div className="field custom-wide"><label htmlFor="servicePrivateNotes">Private owner notes</label><textarea id="servicePrivateNotes" rows={3} value={form.servicePrivateNotes} onChange={(event) => updateField("servicePrivateNotes", event.target.value)} /></div>
                    <label className="toggle-field"><input type="checkbox" checked={form.serviceIsPublic} onChange={(event) => setForm((current) => ({ ...current, serviceIsPublic: event.target.checked }))} />Show this service entry on the public Timeline</label>
                  </details>
                  <details className="advanced-panel">
                    <summary>Links and supporting documents</summary>
                    <div className="custom-list">
                      {customLinks.map((link) => <div className="custom-row" key={link.id}><input aria-label="Link label" placeholder="Link label" value={link.label} onChange={(event) => setCustomLinks((current) => current.map((item) => item.id === link.id ? { ...item, label: event.target.value } : item))} /><input aria-label="Link URL" placeholder="https://..." value={link.url} onChange={(event) => setCustomLinks((current) => current.map((item) => item.id === link.id ? { ...item, url: event.target.value } : item))} /><button className="button secondary" type="button" onClick={() => setCustomLinks((current) => current.filter((item) => item.id !== link.id))}>Remove</button></div>)}
                      <button className="button secondary" type="button" onClick={() => setCustomLinks((current) => [...current, { id: `link-${Date.now()}`, label: "", url: "" }])}>Add link</button>
                      {fieldErrors.customLinks ? <span className="field-error" role="alert">{fieldErrors.customLinks}</span> : null}
                    </div>
                    <label className="create-photo-drop compact" htmlFor="profileDocuments"><strong>Add documents (optional)</strong><span>Receipts, appraisals, invoices, build sheets, or service slips. New documents stay private by default.</span><input id="profileDocuments" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" multiple onChange={(event) => void addDocuments(event.target.files)} /></label>
                    {documents.length ? <div className="create-document-list">{documents.map((document) => <div key={document.id}><div><strong>{document.name}</strong><span>{document.uploadMessage || (document.visibility === "public" ? "Public document" : "Private document")}</span></div><select aria-label={`${document.name} visibility`} value={document.visibility} onChange={(event) => setDocuments((current) => current.map((item) => item.id === document.id ? { ...item, visibility: event.target.value as "public" | "hidden" } : item))}><option value="hidden">Private</option><option value="public">Public</option></select><button type="button" onClick={() => { uploadFileIds.current.delete("document:" + document.dataUrl); if (document.storagePath) void cleanupStagedPaths([document.storagePath]); setDocuments((current) => current.filter((item) => item.id !== document.id)); }}>Remove</button></div>)}</div> : null}
                  </details>
                  <p className="fine-print">Originality describes disclosed modification status. It does not mean QRguitar verification or authenticity confirmation.</p>
                </section>


                <section className="create-step-panel" aria-labelledby="create-step-five">
                  <div className="form-section-heading"><span className="eyebrow">Step 5</span><h2 id="create-step-five">{getContentValue(content, "create.review.heading")}</h2><p>{getContentValue(content, "create.review.body")}</p></div>
                  <div className="create-review-grid">
                    <div><span>QRguitar ID</span><strong>{qrCode}</strong></div>
                    <div><span>Serial Number</span><strong>{form.serial || "No serial number"}</strong></div>
                    <div><span>Visibility</span><strong>{form.visibility === "public" ? "Public" : form.visibility === "unlisted" ? "Unlisted" : "Private"}</strong></div>
                    <div><span>Availability</span><strong>{form.saleStatus === "for_sale" ? "For Sale" : "Not for Sale"}</strong></div>
                    <div><span>Originality</span><strong>{form.originalityStatus === "all_original" ? "All Original" : form.originalityStatus === "modified" ? "Modified" : "Not Specified"}</strong></div>
                    <div><span>Ownership</span><strong>{form.ownerStatus || "Not specified"}</strong></div>
                  </div>
                  <p className="create-permanent-note">This QRguitar ID and Profile URL remain permanent. Customize the downloadable QR later from your Dashboard.</p>
                </section>

              {message ? <div className="form-message" role={fieldErrors && Object.keys(fieldErrors).length ? "alert" : "status"}><strong>{message}</strong>{existingProfileHref || claimHref ? <div className="form-actions">{existingProfileHref ? <Link className="button secondary" href={existingProfileHref}>View existing Profile</Link> : null}{claimHref ? <Link className="button secondary" href={claimHref}>Request ownership</Link> : null}</div> : null}{billingHelp ? <div className="form-actions"><Link className="button secondary" href="/billing" target="_blank" rel="noopener noreferrer">Check Profile credits in a new tab</Link><span>Keep this form open, then return to create your Profile.</span></div> : null}{lastErrorRetryable ? <button className="button secondary" type="button" onClick={() => void createRecordAndRedirect(false)} disabled={savingProfile}>Retry safely</button> : null}</div> : null}
              <div className="create-wizard-actions">
                <Link className="button secondary" href="/dashboard">Cancel</Link>
                <button className="button" type="button" onClick={saveDraft} disabled={savingProfile}>{savingProfile ? "Creating Profile..." : getContentValue(content, "create.actions.submit")}</button>
              </div>
            </form>

            <aside className="record-preview create-sticky-preview" aria-label="Live Profile preview">
              <div className="eyebrow">Live preview</div>
              <InstrumentPreview qrCode={qrCode} name={form.name} brand={form.brand} model={form.model} serial={form.serial} year={form.year} owner={form.owner} location={form.location} summary={form.summary} heroImageDataUrl={form.heroImageDataUrl} customFields={previewFields} customLinks={customLinks} />
            </aside>
          </div>
        </div>
        )}
      </main>
      <Footer />
    </>
  ) : (
    <>
      <Nav />
      <main className="section auth-page">
        <div className="shell create-welcome">
          <section className="card auth-card">
            <div className="eyebrow">Create instrument</div>
            <h1>Give your instrument a permanent home.</h1>
            <p>Create QRguitar Profiles from your account so the QR, photos, documents, and ownership stay tied to the right owner.</p>
            <div className="form-actions">
              <Link className="button" href={`/login?next=${encodeURIComponent("/create")}`}>
                Sign in
              </Link>
              <Link className="button secondary" href={`/login?mode=register&next=${encodeURIComponent("/create")}`}>
                Create account
              </Link>
              <Link className="button secondary" href="/catalog">
                Browse catalog
              </Link>
            </div>
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
  const cleanedValue = value.trim();
  const hasCustomValue = cleanedValue && !options.some((option) => option.toLowerCase() === cleanedValue.toLowerCase());

  return (
    <div className={`field${error ? " has-error" : ""}`}>
      <label htmlFor={id}>{label}{required ? <span aria-hidden="true"> *</span> : null}</label>
      <select id={id} name={id} value={value} required={required} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} onChange={(event) => onChange(event.target.value)}>
        <option value="">Select category</option>
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
