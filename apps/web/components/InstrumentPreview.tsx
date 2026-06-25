import { ExternalLink } from "lucide-react";
import type { CustomProfileField, CustomProfileLink } from "../lib/local-demo";

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
  const nickname = name.trim();
  const makeModel = [brand, model].filter(Boolean).join(" ");
  const title = nickname || makeModel || serial || "Untitled instrument";
  const subtitle = nickname
    ? makeModel
    : [
        year ? `Year ${year}` : "",
        serial ? `Serial ${serial}` : ""
      ].filter(Boolean).join(" - ");
  const visibleFields = customFields.filter((field) => field.label.trim() && field.value.trim()).slice(0, 4);
  const visibleLinks = customLinks.filter((link) => link.label.trim() && link.url.trim()).slice(0, 3);

  return (
    <article className="instrument-preview" aria-label="Live instrument profile preview">
      <div
        className="instrument-preview-hero"
        style={
          heroImageDataUrl
            ? { backgroundImage: `linear-gradient(180deg, rgba(3,5,6,.14), rgba(3,5,6,.86)), url(${heroImageDataUrl})` }
            : undefined
        }
      >
        <div className="preview-topline">
          <span>Live profile preview</span>
          <strong>{qrCode}</strong>
        </div>
        <h3>{title}</h3>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>

      <div className="preview-identity-grid">
        <PreviewMeta label="Serial" value={serial || "Not listed"} />
        <PreviewMeta label="Year" value={year || "Not listed"} />
        <PreviewMeta label="Owner" value={owner || "Unclaimed"} />
        <PreviewMeta label="Location" value={location || "Not listed"} />
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
