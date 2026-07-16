"use client";

import { QrCode } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Footer } from "../../components/Footer";
import { InstrumentPreview } from "../../components/InstrumentPreview";
import { Nav } from "../../components/Nav";
import { createSubmissionFingerprint, isRepeatedBrowserSubmission, validateInstrumentSubmission } from "../../lib/security";
import {
  defaultQrStyle,
  type CustomProfileField,
  type QrStyle
} from "../../lib/local-demo";
import { defaultSiteSettings, fetchPublishedSiteSettings } from "../../lib/site-settings";
import { createBrowserSupabaseClient, getSupabaseAccessToken } from "../../lib/supabase-browser";
import { makePreviewQrCode, qrCodeFromSerial } from "../../lib/qrguitar-id";
import { canonicalInstrumentBrand, establishedInstrumentBrands } from "../../lib/instrument-brands";

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
  "Ownership Proof",
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
};

export default function CreatePage() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [authChecked, setAuthChecked] = useState(true);
  const [user, setUser] = useState<{ email?: string; user_metadata?: Record<string, unknown> } | null>(null);
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
    serviceNotes: "",
    visibility: "public"
  });
  const [customFields, setCustomFields] = useState<{ id: string; label: string; value: string }[]>([]);
  const [customLinks, setCustomLinks] = useState([{ id: "link-1", label: "Website", url: "" }]);
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [documents, setDocuments] = useState<DocumentDraft[]>([]);
  const [qrCode, setQrCode] = useState(makePreviewQrCode);
  const [qrStyle, setQrStyle] = useState<QrStyle>(defaultQrStyle);
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

  function updateQrStyle(field: keyof QrStyle, value: string | boolean) {
    setQrStyle((current) => ({ ...current, [field]: value }));
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
    setGalleryImages((current) => {
      const next = current.filter((item) => item !== imageUrl);
      setForm((formCurrent) => ({
        ...formCurrent,
        heroImageDataUrl: formCurrent.heroImageDataUrl === imageUrl ? next[0] || "" : formCurrent.heroImageDataUrl
      }));
      return next;
    });
  }

  function movePhoto(imageUrl: string, direction: -1 | 1) {
    setGalleryImages((current) => {
      const index = current.indexOf(imageUrl);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  async function createRecordAndRedirect(showProfile = false) {
    type SaveResult = {
      ok?: boolean;
      qrCode?: string;
      permanentPath?: string;
      message?: string;
    };

    if (savingProfile) return;

    try {
      const validationMessage = validateInstrumentSubmission(form, honeypot);
      if (validationMessage) {
        setMessage(validationMessage);
        return;
      }

      if (!form.heroImageDataUrl && !galleryImages.length) {
        setMessage("Add at least one photo before creating a QRguitar Profile.");
        return;
      }

      if (
        typeof window !== "undefined" &&
        isRepeatedBrowserSubmission("qrguitar.lastCreateSubmission", createSubmissionFingerprint(form), window)
      ) {
        setMessage("That looks like a repeated submission. Wait a few seconds and try again.");
        return;
      }

      if (!user?.email) {
        setMessage("Sign in required to create QRguitar Profiles.");
        return;
      }

      setSavingProfile(true);
      setMessage("");

      const payload = {
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
            form.serviceNotes.trim() ? { label: "Service notes", value: form.serviceNotes.trim() } : null,
            ...customFields
              .filter((field) => field.label.trim() && field.value.trim())
              .map((field) => ({ label: field.label.trim(), value: field.value.trim() }))
          ].filter(Boolean)
        };

      const token = await getSupabaseAccessToken();
      const response = await fetch("/api/instruments", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      const result = (await response.json().catch(() => null)) as SaveResult | null;

      if (!response.ok || !result?.ok) {
        if (response.status === 402) {
          setMessage(result?.message || "Free public beta accounts can create up to 25 Profiles. Contact QRguitar for commercial setup.");
          return;
        }
        setMessage(result?.message || "Could not create this QRguitar Profile.");
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
      setCreatedCode(finalCode);
      setMessage("QRguitar Profile created.");

      if (showProfile) {
        router.push(`/i/${finalCode}`);
      }
    } catch {
      setMessage("Could not create this QRguitar Profile right now. Check your connection and try again.");
    } finally {
      setSavingProfile(false);
    }
  }

  function saveDraft() {
    void createRecordAndRedirect(false);
  }

  function saveAndPreview() {
    void createRecordAndRedirect(true);
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
                <Link className="button" href={`/i/${createdCode}`}>View Profile</Link>
                <Link className="button secondary" href={`/edit/${createdCode}?section=timeline`}>Add History</Link>
                <Link className="button secondary" href={`/edit/${createdCode}?section=media`}>Add Media</Link>
                <Link className="button secondary" href={`/edit/${createdCode}?section=documents`}>Add Documents</Link>
                <Link className="button secondary" href={`/handout/${createdCode}`}>Print or Download QR</Link>
                <Link className="button secondary" href="/dashboard">Back to Dashboard</Link>
              </div>
            </section>
          </div>
        ) : (
        <div className="shell">
          <header className="create-wizard-hero">
            <div>
              <div className="eyebrow">Create a QRguitar Profile</div>
              <h1>Start with the instrument. Build the history over time.</h1>
              <p>Add the identity and one real photo now. You can keep expanding the Profile with service, media, documents, and ownership history later.</p>
            </div>
            <div className="permanent-id create-id-preview">
              <span>QRguitar ID preview</span>
              <strong>{qrCode}</strong>
              <small>Your QRguitar ID is permanent. When a Serial Number is provided, the QRguitar ID uses that Serial Number.</small>
            </div>
          </header>


          <div className="create-wizard-layout">
            <form className="card form create-wizard-form" onSubmit={(event) => event.preventDefault()}>
              <input aria-hidden="true" autoComplete="off" name="company" style={{ display: "none" }} tabIndex={-1} value={honeypot} onChange={(event) => setHoneypot(event.target.value)} />
              <datalist id="qrguitar-known-brands">{establishedInstrumentBrands.map((brand) => <option value={brand} key={brand} />)}</datalist>


                <section className="create-step-panel" aria-labelledby="create-step-one">
                  <div className="form-section-heading"><span className="eyebrow">Required</span><h2 id="create-step-one">Instrument and photo</h2><p>Start with the facts that identify the instrument and the photo people will recognize.</p></div>
                  <div className="form-grid">
                    <Field label="Brand / Make" id="brand" value={form.brand} list="qrguitar-known-brands" placeholder="Start typing a brand" onChange={(value) => updateField("brand", value)} onBlur={(value) => updateField("brand", canonicalInstrumentBrand(value) || value.trim())} />
                    <Field label="Model" id="model" value={form.model} onChange={(value) => updateField("model", value)} />
                    <Field label="Serial Number" id="serial" value={form.serial} onChange={(value) => updateField("serial", value)} placeholder="Manufacturer or builder serial" disabled={form.serialNotUsed} />
                    <Field label="Year" id="year" value={form.year} onChange={(value) => updateField("year", value)} placeholder="If known" />
                    <CategoryField label="Instrument type" id="instrumentType" value={form.instrumentType} options={categoryOptions} onChange={(value) => updateField("instrumentType", value)} />
                  </div>
                  <label className="toggle-field create-inline-toggle">
                    <input type="checkbox" checked={form.serialNotUsed} onChange={(event) => setForm((current) => ({ ...current, serialNotUsed: event.target.checked, serial: event.target.checked ? "" : current.serial, showSerialPublic: event.target.checked ? false : current.showSerialPublic }))} />
                    This instrument has no Serial Number
                  </label>
                  <p className="fine-print">If no Serial Number exists, QRguitar assigns a secure generated ID. Verification without a Serial Number requires prior QRguitar approval.</p>
                  <label className="create-photo-drop" htmlFor="profilePhotos">
                    <strong>Add at least one real instrument photo</strong>
                    <span>Choose photos from your device or use your phone camera. JPG, PNG, or WebP up to 12MB each.</span>
                    <input id="profilePhotos" name="profilePhotos" type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(event) => void addProfilePhotos(event.target.files)} />
                  </label>
                  <PhotoManager images={galleryImages} mainImage={form.heroImageDataUrl} onSelectMain={selectMainPhoto} onRemove={removePhoto} onMove={movePhoto} />
                </section>


                <section className="create-step-panel" aria-labelledby="create-step-two">
                  <div className="form-section-heading"><span className="eyebrow">Visibility</span><h2 id="create-step-two">Owner context and privacy</h2><p>Choose where the Profile appears and add optional ownership context.</p></div>
                  <div className="form-grid">
                    <div className="field">
                      <label htmlFor="ownerStatus">How this instrument is connected to you (optional)</label>
                      <select id="ownerStatus" value={form.ownerStatus} onChange={(event) => updateField("ownerStatus", event.target.value)}>
                        <option value="">Not specified</option>
                        <option value="Original owner">Original owner</option>
                        <option value="Store inventory">Store inventory</option>
                        <option value="Subsequent owner">Subsequent owner</option>
                        <option value="Builder / Brand">Builder / Brand</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <Field label="Owner display" id="owner" value={form.owner} onChange={(value) => updateField("owner", value)} placeholder="Name or collection" />
                    <Field label="Acquisition date" id="acquisitionDate" value={form.acquisitionDate} onChange={(value) => updateField("acquisitionDate", value)} placeholder="YYYY, YYYY-MM, or YYYY-MM-DD" />
                    <Field label="Seller / store (optional)" id="seller" value={form.seller} onChange={(value) => updateField("seller", value)} />
                    <Field label="Location" id="location" value={form.location} onChange={(value) => updateField("location", value)} placeholder="City, region, country" />
                  </div>
                  <div className="privacy-toggle create-visibility-control" aria-label="Profile visibility">
                    <div><strong>{form.visibility === "public" ? "Visible Profile" : form.visibility === "unlisted" ? "Unlisted Profile" : "Private Profile"}</strong><span>{form.visibility === "public" ? "Appears in the Catalog and opens by direct QR or link." : form.visibility === "unlisted" ? "Does not appear in the Catalog, but opens by direct QR or link." : "Available only to you and authorized QRguitar administration."}</span></div>
                    <label className="field visibility-select" htmlFor="profileVisibility"><span>Visibility</span><select id="profileVisibility" value={form.visibility} onChange={(event) => updateField("visibility", event.target.value)}><option value="public">Visible</option><option value="unlisted">Unlisted</option><option value="private">Private</option></select></label>
                  </div>
                  <label className="toggle-field create-inline-toggle">
                    <input type="checkbox" disabled={!form.serial.trim()} checked={form.showSerialPublic && Boolean(form.serial.trim())} onChange={(event) => setForm((current) => ({ ...current, showSerialPublic: event.target.checked }))} />
                    Show the Serial Number on the visible Profile
                  </label>
                  <p className="fine-print">The signed-in owner and authorized admin retain the Serial Number even when its separate public field is hidden.</p>
                </section>


                <section className="create-step-panel" aria-labelledby="create-step-three">
                  <div className="form-section-heading"><span className="eyebrow">Optional details</span><h2 id="create-step-three">Instrument details</h2><p>Add what is useful now. History, service, media, and documents can continue growing after creation.</p></div>
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
                    <div className="field custom-wide"><label htmlFor="serviceNotes">Known service notes</label><textarea id="serviceNotes" rows={4} value={form.serviceNotes} onChange={(event) => updateField("serviceNotes", event.target.value)} placeholder="Setup, repair, fretwork, electronics, inspection, or restoration notes." /></div>
                    <div className="custom-list">
                      {customFields.map((field) => <div className="custom-row" key={field.id}><input aria-label="Specification label" placeholder="Specification" value={field.label} onChange={(event) => setCustomFields((current) => current.map((item) => item.id === field.id ? { ...item, label: event.target.value } : item))} /><input aria-label="Specification value" placeholder="Value" value={field.value} onChange={(event) => setCustomFields((current) => current.map((item) => item.id === field.id ? { ...item, value: event.target.value } : item))} /><button className="button secondary" type="button" onClick={() => setCustomFields((current) => current.filter((item) => item.id !== field.id))}>Remove</button></div>)}
                      <button className="button secondary" type="button" onClick={() => setCustomFields((current) => [...current, { id: `field-${Date.now()}`, label: "", value: "" }])}>Add specification</button>
                    </div>
                  </details>
                  <details className="advanced-panel">
                    <summary>Links and supporting documents</summary>
                    <div className="custom-list">
                      {customLinks.map((link) => <div className="custom-row" key={link.id}><input aria-label="Link label" placeholder="Link label" value={link.label} onChange={(event) => setCustomLinks((current) => current.map((item) => item.id === link.id ? { ...item, label: event.target.value } : item))} /><input aria-label="Link URL" placeholder="https://..." value={link.url} onChange={(event) => setCustomLinks((current) => current.map((item) => item.id === link.id ? { ...item, url: event.target.value } : item))} /><button className="button secondary" type="button" onClick={() => setCustomLinks((current) => current.filter((item) => item.id !== link.id))}>Remove</button></div>)}
                      <button className="button secondary" type="button" onClick={() => setCustomLinks((current) => [...current, { id: `link-${Date.now()}`, label: "", url: "" }])}>Add link</button>
                    </div>
                    <label className="create-photo-drop compact" htmlFor="profileDocuments"><strong>Add documents (optional)</strong><span>Receipts, appraisals, invoices, build sheets, or service slips. New documents stay private by default.</span><input id="profileDocuments" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" multiple onChange={(event) => void addDocuments(event.target.files)} /></label>
                    {documents.length ? <div className="create-document-list">{documents.map((document) => <div key={document.id}><div><strong>{document.name}</strong><span>{document.visibility === "public" ? "Visible document" : "Private document"}</span></div><select aria-label={`${document.name} visibility`} value={document.visibility} onChange={(event) => setDocuments((current) => current.map((item) => item.id === document.id ? { ...item, visibility: event.target.value as "public" | "hidden" } : item))}><option value="hidden">Private</option><option value="public">Visible</option></select><button type="button" onClick={() => setDocuments((current) => current.filter((item) => item.id !== document.id))}>Remove</button></div>)}</div> : null}
                  </details>
                  <p className="fine-print">Originality describes disclosed modification status. It does not mean QRguitar verification or authenticity confirmation.</p>
                </section>


                <section className="create-step-panel" aria-labelledby="create-step-four">
                  <div className="form-section-heading"><span className="eyebrow">Review</span><h2 id="create-step-four">Confirm and create</h2><p>Confirm the identity, photo, visibility, and ownership details before creating the permanent Profile.</p></div>
                  <div className="create-review-grid">
                    <div><span>QRguitar ID</span><strong>{qrCode}</strong></div>
                    <div><span>Serial Number</span><strong>{form.serial || "No serial number"}</strong></div>
                    <div><span>Visibility</span><strong>{form.visibility === "public" ? "Visible" : form.visibility === "unlisted" ? "Unlisted" : "Private"}</strong></div>
                    <div><span>Availability</span><strong>{form.saleStatus === "for_sale" ? "For Sale" : "Not for Sale"}</strong></div>
                    <div><span>Originality</span><strong>{form.originalityStatus === "all_original" ? "All Original" : form.originalityStatus === "modified" ? "Modified" : "Not Specified"}</strong></div>
                    <div><span>Ownership</span><strong>{form.ownerStatus || "Not specified"}</strong></div>
                  </div>
                  <details className="advanced-panel"><summary>Customize downloaded QR</summary><section className="qr-customizer" aria-label="QR code customization"><div><h3>QR appearance</h3><p>Keep strong contrast so stickers, tags, plates, and paperwork remain scannable.</p></div><div className="qr-controls"><ColorField label="QR color" value={qrStyle.foreground} onChange={(value) => updateQrStyle("foreground", value)} /><ColorField label="Background" value={qrStyle.background} onChange={(value) => updateQrStyle("background", value)} /><div className="field"><label htmlFor="qrLabel">Label</label><input id="qrLabel" value={qrStyle.labelText} onChange={(event) => updateQrStyle("labelText", event.target.value)} /></div><div className="field"><label htmlFor="qrShape">Style</label><select id="qrShape" value={qrStyle.shape} onChange={(event) => updateQrStyle("shape", event.target.value)}><option value="classic">Classic print</option><option value="soft">Soft premium</option></select></div><label className="toggle-field"><input type="checkbox" checked={qrStyle.includeLabel} onChange={(event) => updateQrStyle("includeLabel", event.target.checked)} />Include label on downloaded QR</label></div></section></details>
                  <p className="create-permanent-note"><QrCode aria-hidden="true" /> This QRguitar ID and Profile URL remain permanent. Editing the title, specifications, photos, or Serial Number later does not replace this identity.</p>
                </section>

              {message ? <p className="form-message" role="status">{message}</p> : null}
              <div className="create-wizard-actions">
                <Link className="button secondary" href="/dashboard">Cancel</Link>
                <button className="button" type="button" onClick={saveDraft} disabled={savingProfile}>{savingProfile ? "Creating Profile..." : "Create QRguitar Profile"}</button>
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
        <div className="shell">
          <section className="card auth-card">
            <div className="eyebrow">Create instrument</div>
            <h2>Sign in to create your first QRguitar Profile.</h2>
            <p>Create QRguitar Profiles from your account so the QR, photos, documents, and ownership stay tied to the right owner.</p>
            <div className="form-actions">
              <Link className="button" href={`/login?next=${encodeURIComponent("/create")}`}>
                Sign in
              </Link>
              <Link className="button secondary" href={`/login?next=${encodeURIComponent("/create")}`}>
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
  onRemove,
  onMove
}: {
  images: string[];
  mainImage: string;
  onSelectMain: (imageUrl: string) => void;
  onRemove: (imageUrl: string) => void;
  onMove: (imageUrl: string, direction: -1 | 1) => void;
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
                <button type="button" onClick={() => onSelectMain(imageUrl)}>{isMain ? "Main Photo" : "Set Main"}</button>
                <button type="button" disabled={index === 0} onClick={() => onMove(imageUrl, -1)} aria-label={`Move photo ${index + 1} earlier`}>Earlier</button>
                <button type="button" disabled={index === images.length - 1} onClick={() => onMove(imageUrl, 1)} aria-label={`Move photo ${index + 1} later`}>Later</button>
                <button type="button" onClick={() => onRemove(imageUrl)}>Remove</button>
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

