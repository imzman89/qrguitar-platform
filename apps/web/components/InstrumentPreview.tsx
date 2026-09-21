import { Camera, ExternalLink } from "lucide-react";
import { type CustomProfileField, type CustomProfileLink } from "../lib/local-demo";
import { formatRecordLocation } from "../lib/record-location";

type InstrumentPreviewProps = {
  qrCode: string;
  name: string;
  brand: string;
  model: string;
  serial: string;
  year: string;
  owner: string;
  location?: string;
  summary?: string;
  heroImageDataUrl?: string;
  customFields?: CustomProfileField[];
  customLinks?: CustomProfileLink[];
};

export function InstrumentPreview({
  qrCode,
  name,
  brand,
  model,
  serial,
  year,
  owner,
  location,
  summary,
  heroImageDataUrl,
  customFields = [],
  customLinks = []
}: InstrumentPreviewProps) {
  const customTitle = name.trim();
  const makeModel = [brand.trim(), model.trim()].filter(Boolean).join(" ");
  const title = customTitle || makeModel || "Untitled instrument";
  const metadata = customTitle
    ? [makeModel, year.trim(), formatRecordLocation({ location })].filter(Boolean).join(" • ")
    : [year.trim(), formatRecordLocation({ location })].filter(Boolean).join(" • ");
  const formattedLocation = formatRecordLocation({ location });
  const shownTypes = new Set<string>();
  const visibleFields = customFields.filter((field) => {
    if (!field.label.trim() || !field.value.trim()) return false;
    if (["type", "instrument type"].includes(field.label.trim().toLowerCase())) {
      const value = field.value.trim().toLowerCase();
      if (shownTypes.has(value)) return false;
      shownTypes.add(value);
    }
    return true;
  }).slice(0, 4);
  const visibleLinks = customLinks.filter((link) => link.label.trim() && link.url.trim()).slice(0, 3);

  return (
    <article className="instrument-preview" aria-label="Live instrument profile preview">
      <div className="instrument-preview-photo">
        {heroImageDataUrl ? <img src={heroImageDataUrl} alt={title} width={800} height={600} decoding="async" /> : <span><Camera size={26} aria-hidden="true" />Add a photo to preview your Profile</span>}
      </div>
      <div className="instrument-preview-hero">
        <div className="preview-topline">
          <span>QRguitar Profile</span>
          <strong>{qrCode}</strong>
        </div>
        <h3>{title}</h3>
        <p>{metadata || "Add the instrument details"}</p>
      </div>

      <div className="preview-identity-grid">
        <PreviewMeta label="Serial" value={serial || "Add detail"} />
        <PreviewMeta label="Year" value={year || "Add detail"} />
        <PreviewMeta label="Owner" value={owner || "Unclaimed"} />
        <PreviewMeta label="Location" value={formattedLocation || "Add detail"} />
      </div>

      {summary ? <p className="preview-summary">{summary}</p> : null}

      {visibleFields.length ? (
        <div className="preview-chip-list">
          {visibleFields.map((field) => (
            <span key={field.id}>
              <strong>{field.label}</strong>
              {field.value}
            </span>
          ))}
        </div>
      ) : null}

      {visibleLinks.length ? (
        <div className="preview-link-list">
          {visibleLinks.map((link) => (
            <span key={link.id}>
              <ExternalLink size={14} />
              {link.label}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function PreviewMeta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
