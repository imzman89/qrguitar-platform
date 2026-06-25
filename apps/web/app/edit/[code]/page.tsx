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
  findDemoInstrument,
  getInstrumentCondition,
  instrumentToProfileUrl,
  saveDemoInstrument,
  type DemoInstrument,
  type QrStyle
} from "../../../lib/local-demo";

const emptyForm = {
  name: "",
  brand: "",
  model: "",
  serial: "",
  year: "",
  instrumentCondition: "used",
  owner: "",
  location: "",
  heroImageDataUrl: "",
  summary: "",
  visibility: "public"
};

export default function EditInstrumentPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = params.code?.toUpperCase() || "";
  const [message, setMessage] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [original, setOriginal] = useState<DemoInstrument | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [customFields, setCustomFields] = useState([{ id: "field-1", label: "", value: "" }]);
  const [customLinks, setCustomLinks] = useState([{ id: "link-1", label: "", url: "" }]);
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [qrStyle, setQrStyle] = useState<QrStyle>(defaultQrStyle);

  useEffect(() => {
    const instrument = findDemoInstrument(code);
    if (!instrument) {
      setMessage("This record was not found in this browser. Create or save the guitar first.");
      return;
    }

    setOriginal(instrument);
    setForm({
      name: instrument.name || "",
      brand: instrument.brand || "",
      model: instrument.model || "",
      serial: instrument.serial || "",
      year: instrument.year || "",
      instrumentCondition: getInstrumentCondition(instrument),
      owner: instrument.owner || "",
      location: instrument.location || "",
      heroImageDataUrl: instrument.heroImageDataUrl || "",
      summary: instrument.summary || "",
      visibility: instrument.visibility || "public"
    });
    setCustomFields(normalizeCustomFields(instrument));
    setCustomLinks(normalizeCustomLinks(instrument));
    setGalleryImages(normalizeGalleryImages(instrument));
    setQrStyle(instrument.qrStyle || defaultQrStyle);
  }, [code]);

  const profileHref = useMemo(() => {
    return original ? instrumentToProfileUrl(original) : `/i/${code}`;
  }, [code, original]);

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
    const dataUrls = await Promise.all(selectedFiles.map(fileToCompressedDataUrl));

    setGalleryImages((current) => {
      const next = [...current, ...dataUrls].slice(0, 20);
      setForm((formCurrent) => ({ ...formCurrent, heroImageDataUrl: formCurrent.heroImageDataUrl || next[0] || "" }));
      return next;
    });
    setMessage(`${dataUrls.length} photo${dataUrls.length === 1 ? "" : "s"} added. Choose any photo as the main image.`);
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
      ...form,
      instrumentCondition: form.instrumentCondition === "new" ? "new" : "used",
      visibility: form.visibility === "private" ? "private" : "public",
      galleryImageDataUrls: galleryImages,
      heroImageDataUrl: form.heroImageDataUrl || galleryImages[0] || "",
      builder: "",
      instrumentType: "",
      finish: "",
      bodyWood: "",
      neckWood: "",
      pickups: "",
      websiteUrl: "",
      instagramUrl: "",
      facebookUrl: "",
      youtubeUrl: "",
      reverbUrl: "",
      shopUrl: "",
      customFields: customFields.filter((field) => field.label.trim() && field.value.trim()),
      customLinks: customLinks.filter((link) => link.label.trim() && link.url.trim()),
      qrStyle,
      qrCode: original.qrCode,
      permanentPath: original.permanentPath,
      createdAt: original.createdAt
    };
  }

  function saveChanges(preview = false) {
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
      saveDemoInstrument(instrument);
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

  return (
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
                <summary>Profile basics</summary>
                <div className="form-grid">
                  <Field label="Display title / nickname" id="name" value={form.name} onChange={(value) => updateField("name", value)} />
                  <Field label="Owner display" id="owner" value={form.owner} onChange={(value) => updateField("owner", value)} />
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
              </details>
              <details className="advanced-panel" open>
                <summary>Custom details</summary>
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
                <summary>Links</summary>
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
              <PhotoManager
                images={galleryImages}
                mainImage={form.heroImageDataUrl}
                onSelectMain={selectMainPhoto}
                onRemove={removePhoto}
              />
              <section className="qr-customizer" aria-label="QR code customization">
                <div>
                  <span className="eyebrow">QR appearance</span>
                  <h3>Customize the downloaded QR.</h3>
                  <p>Changing QR colors does not change the permanent QRguitar ID or URL.</p>
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
                <button className="button" type="button" onClick={() => saveChanges(false)}>
                  Save Changes
                </button>
                <button className="button" type="button" onClick={() => saveChanges(true)}>
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
              customFields={customFields}
              customLinks={customLinks}
            />
          </aside>
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

function fileToCompressedDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const maxSide = 1000;
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
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      image.onerror = () => reject(new Error("Could not load image."));
      image.src = String(reader.result);
    };

    reader.onerror = () => reject(new Error("Could not read image."));
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
    ? instrument.customFields
    : legacyFields.map((field, index) => ({ id: `legacy-field-${index}`, label: field.label, value: String(field.value) }));

  return fields.length ? fields : [{ id: "field-1", label: "", value: "" }];
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
