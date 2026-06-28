"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Footer } from "../../components/Footer";
import { InstrumentPreview } from "../../components/InstrumentPreview";
import { Nav } from "../../components/Nav";
import { createSubmissionFingerprint, isRepeatedBrowserSubmission, validateInstrumentSubmission } from "../../lib/security";
import {
  defaultQrStyle,
  generatePermanentQrCode,
  getDemoInstruments,
  type CustomProfileField,
  type QrStyle
} from "../../lib/local-demo";
import { defaultSiteSettings, readSiteSettings } from "../../lib/site-settings";
import { createBrowserSupabaseClient, getSupabaseAccessToken } from "../../lib/supabase-browser";

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
  });
  const [customFields, setCustomFields] = useState<{ id: string; label: string; value: string }[]>([]);
  const [customLinks, setCustomLinks] = useState([{ id: "link-1", label: "Website", url: "" }]);
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [documents, setDocuments] = useState<{ id: string; name: string; dataUrl: string; visibility: "public" | "hidden" }[]>([]);
  const [qrCode, setQrCode] = useState(() => generatePermanentQrCode(getDemoInstruments().map((instrument) => instrument.qrCode), ""));
  const [qrStyle, setQrStyle] = useState<QrStyle>(defaultQrStyle);
  const [categoryOptions, setCategoryOptions] = useState(defaultSiteSettings.instrumentCategories);

  const profileHref = useMemo(() => {
    return `/i/${qrCode}`;
  }, [qrCode]);

  const previewFields = useMemo<CustomProfileField[]>(
    () =>
      [
        form.instrumentType.trim() ? { id: "preview-type", label: "Type", value: form.instrumentType.trim() } : null,
        form.finish.trim() ? { id: "preview-finish", label: "Finish", value: form.finish.trim() } : null,
        form.weight.trim() ? { id: "preview-weight", label: "Weight", value: form.weight.trim() } : null,
        form.ownerStatus.trim() ? { id: "preview-owner-status", label: "Owner status", value: form.ownerStatus.trim() } : null,
        ...customFields.filter((field) => field.label.trim() && field.value.trim())
      ].filter((field): field is CustomProfileField => Boolean(field)),
    [customFields, form.finish, form.instrumentType, form.ownerStatus, form.weight]
  );

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    let cancelled = false;
    const syncCategoryOptions = () => setCategoryOptions(readSiteSettings().instrumentCategories);

    syncCategoryOptions();
    window.addEventListener("qrguitar:site-settings", syncCategoryOptions);

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
      window.removeEventListener("qrguitar:site-settings", syncCategoryOptions);
    };
  }, []);

  function updateField(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
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

  async function createRecordAndRedirect(showProfile = false) {
    type SaveResult = {
      ok?: boolean;
      qrCode?: string;
      permanentPath?: string;
      message?: string;
    };

    try {
      const validationMessage = validateInstrumentSubmission(form, honeypot);
      if (validationMessage) {
        setMessage(validationMessage);
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
        setMessage("Sign in required to create records.");
        return;
      }

        const payload = {
          name: form.name.trim() || [form.brand, form.model].filter(Boolean).join(" "),
          brand: form.brand,
          model: form.model,
          serial: form.serial,
          year: form.year,
          instrumentType: form.instrumentType,
          builder: form.builder,
          finish: form.finish,
          condition: form.instrumentCondition as "new" | "used",
          ownerName: form.owner || String(user.user_metadata?.display_name || user.email || ""),
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
          setMessage(result?.message || "Free public beta accounts can create up to 25 records. Contact QRguitar for commercial setup.");
          return;
        }
        setMessage(result?.message || "Could not save this record to Supabase.");
        return;
      } else {
        if (result.qrCode && result.permanentPath) {
          setQrCode(result.qrCode);
        }
      }

      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("qrguitar:catalog-updated"));
      }

      if (showProfile) {
        const finalCode = (result && result.ok ? result.qrCode : qrCode) || qrCode;
        const targetParams = new URLSearchParams({
          name: form.name,
          brand: form.brand,
          model: form.model,
          serial: form.serial,
          year: form.year,
          location: form.location,
          summary: form.summary || ""
        });
        router.push(`/i/${finalCode}?${targetParams.toString()}`);
        return;
      }

      if (result?.ok) {
        setMessage("Record saved in Supabase.");
      }

      router.push("/dashboard");
    } catch {
      setMessage("Could not save this record right now. Check your connection and Supabase settings, then try again.");
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
      <main className="section create-page">
        <div className="shell split create-layout">
          <div>
            <div className="eyebrow">Create a QRguitar record</div>
            <h2>Register an instrument and preview the public profile.</h2>
            <p>
                This creates a permanent QRguitar record for your signed-in account and keeps the QR link stable.
              </p>
              <div className="permanent-id">
                <span>Permanent QRguitar ID</span>
                <strong>{qrCode}</strong>
                <small>This ID is separate from the serial number and locks forever when the record is created.</small>
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
                <span className="eyebrow">Register basics</span>
                <p>Just enough to create the permanent record. Everything else can be added after.</p>
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
                  <Field label="Owner display" id="owner" value={form.owner} onChange={(value) => updateField("owner", value)} placeholder="Your name or collection name" />
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
                    placeholder="Add provenance, build story, service notes, or anything useful later."
                  />
                </div>
                <div className="field custom-wide">
                  <label htmlFor="specsNotes">Specs notes</label>
                  <textarea
                    id="specsNotes"
                    rows={4}
                    value={form.specsNotes}
                    onChange={(event) => updateField("specsNotes", event.target.value)}
                    placeholder="Pickup set, neck carve, fretwire, wiring, case candy, or any bench detail worth keeping with the record."
                  />
                </div>
                <div className="field custom-wide">
                  <label htmlFor="serviceNotes">Service notes</label>
                  <textarea
                    id="serviceNotes"
                    rows={4}
                    value={form.serviceNotes}
                    onChange={(event) => updateField("serviceNotes", event.target.value)}
                    placeholder="Setup work, repairs, fretwork, electronics changes, inspections, or warranty work."
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
                        placeholder="Field label, e.g. Finish"
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
              <details className="advanced-panel">
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
                        <button
                          className="button secondary"
                          type="button"
                          onClick={() => setDocuments((current) => current.filter((item) => item.id !== document.id))}
                        >
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
              <section className="qr-customizer" aria-label="QR code customization">
                <div>
                  <span className="eyebrow">QR appearance</span>
                  <h3>Customize QR Appearance</h3>
                  <p>Customize the code customers download.</p>
                  <p className="fine-print">Keep strong contrast so the QR remains scannable on stickers, hang tags, plates, and certificates.</p>
                </div>
                <div className="qr-controls">
                  <ColorField
                    label="QR color"
                    value={qrStyle.foreground}
                    onChange={(value) => updateQrStyle("foreground", value)}
                  />
                  <ColorField
                    label="Background"
                    value={qrStyle.background}
                    onChange={(value) => updateQrStyle("background", value)}
                  />
                  <div className="field">
                    <label htmlFor="qrLabel">Label</label>
                    <input
                      id="qrLabel"
                      value={qrStyle.labelText}
                      onChange={(event) => updateQrStyle("labelText", event.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="qrShape">Style</label>
                    <select
                      id="qrShape"
                      value={qrStyle.shape}
                      onChange={(event) => updateQrStyle("shape", event.target.value)}
                    >
                      <option value="classic">Classic print</option>
                      <option value="soft">Soft premium</option>
                    </select>
                  </div>
                  <label className="toggle-field">
                    <input
                      type="checkbox"
                      checked={qrStyle.includeLabel}
                      onChange={(event) => updateQrStyle("includeLabel", event.target.checked)}
                    />
                    Include label on downloaded QR
                  </label>
                </div>
              </section>
              {message ? <p className="form-message">{message}</p> : null}
              <div className="form-actions">
                <button className="button" type="button" onClick={saveDraft}>
                  Save to Dashboard
                </button>
                <button className="button" type="button" onClick={saveAndPreview}>
                  Save and Preview Profile
                </button>
                <Link className="button secondary" href="/dashboard">
                  Back to Dashboard
                </Link>
              </div>
            </form>
          </div>

          <aside className="record-preview">
            <InstrumentPreview
              qrCode={qrCode}
              name={form.name}
              brand={form.brand}
              model={form.model}
              serial={form.serial}
              year={form.year}
              owner={form.owner}
              location={form.location}
              summary={form.summary}
              heroImageDataUrl={form.heroImageDataUrl}
              customFields={previewFields}
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
            <div className="eyebrow">Create instrument</div>
            <h2>Sign in to create your first QRguitar record.</h2>
            <p>Create records from your account so the QR, photos, documents, and ownership stay tied to the right owner.</p>
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

function Field({
  label,
  id,
  value,
  onChange,
  placeholder
}: {
  label: string;
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} name={id} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
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

