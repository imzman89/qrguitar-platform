"use client";

import { ArrowRight, Camera, FileText, Globe2, Hash } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import {
  instrumentDisplayName,
  instrumentSubtitle,
  instrumentToProfileUrl,
  type DemoInstrument
} from "../lib/local-demo";
import { getProfilePhotoUrls, getPublicDocumentCount } from "../lib/instrument-profile-contract";
import { ProfileStatusBadges } from "./ProfileStatusBadges";
import { RecordShareButton } from "./RecordShareButton";

type CollectibleRecordCardProps = {
  record: DemoInstrument;
  variant?: "latest" | "catalog" | "spotlight";
  eyebrow?: string;
  createdLabel?: string;
  ctaLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
};

export function CollectibleRecordCard({
  record,
  variant = "catalog",
  eyebrow = "",
  createdLabel = "",
  ctaLabel = "Open Profile",
  secondaryHref = "",
  secondaryLabel = ""
}: CollectibleRecordCardProps) {
  const title = instrumentDisplayName(record);
  const galleryImages = useMemo(() => {
    const images = [record.heroImageDataUrl, ...(record.galleryImageDataUrls || [])]
      .filter((image): image is string => Boolean(image));
    return Array.from(new Set(images));
  }, [record.galleryImageDataUrls, record.heroImageDataUrl]);
  const imageUrl = galleryImages[0] || "";
  const photoCount = getProfilePhotoUrls(record).length;
  const publicDocCount = getPublicDocumentCount(record);
  const publicSerial = record.showSerialPublic === true ? String(record.serial || "").trim() : "";
  const profileUrl = instrumentToProfileUrl(record);
  const showSecondaryAction = variant !== "latest" && secondaryHref && secondaryLabel;
  const showSecondaryText = variant !== "latest" && !secondaryHref && secondaryLabel;
  const summary = variant === "latest" ? "" : cleanCardSummary(record.summary);

  return (
    <article className={`collectible-card collectible-card--${variant}`} aria-label={`Open ${title} QRguitar Profile`}>
      <Link className="collectible-card-link" href={profileUrl} aria-label={`Open ${title} Profile`}>
        <div className="collectible-card-media">
          {imageUrl ? (
            <img
              className="collectible-card-image"
              src={imageUrl}
              alt={`${title} main photo`}
              loading={variant === "latest" ? "eager" : "lazy"}
              decoding="async"
            />
          ) : (
            <div className="collectible-card-empty-media">
              <span>QRguitar</span>
              <strong>No visible photo</strong>
            </div>
          )}
          <div className="collectible-card-topline">
            {eyebrow ? <span className="collectible-card-eyebrow"><Globe2 size={13} /> {eyebrow}</span> : null}
            {createdLabel ? <span className="collectible-card-age">{createdLabel}</span> : null}
          </div>
          <span className="collectible-card-code">{record.qrCode}</span>
        </div>

        <div className="collectible-card-content">
          <div>
            <h3>{title}</h3>
            <p className="collectible-card-subtitle">{instrumentSubtitle(record)}</p>
            {summary ? <p className="collectible-card-summary">{summary}</p> : null}
          </div>

          <ProfileStatusBadges record={record} />

          <div className="collectible-card-facts" aria-label="Profile contents">
            {publicSerial ? <span><Hash size={13} /> Serial {publicSerial}</span> : null}
            {photoCount ? <span><Camera size={13} /> {photoCount} {photoCount === 1 ? "photo" : "photos"}</span> : null}
            {publicDocCount ? <span><FileText size={13} /> {publicDocCount} {publicDocCount === 1 ? "document" : "documents"}</span> : null}
          </div>

          <div className="collectible-card-actions">
            <span className="collectible-card-cta">{ctaLabel} <ArrowRight size={14} /></span>
            {showSecondaryText ? <span className="collectible-card-secondary">{secondaryLabel}</span> : null}
          </div>
        </div>
      </Link>

      <RecordShareButton className="collectible-card-share" code={record.qrCode} title={title} />
      {showSecondaryAction ? (
        <Link className="collectible-card-secondary-link" href={secondaryHref}>
          {secondaryLabel}
        </Link>
      ) : null}
    </article>
  );
}

function cleanCardSummary(summary?: string | null) {
  const value = String(summary || "").trim();
  if (!value) return "";
  if (/^QRguitar Profile with photos, specs, and instrument details\.?$/i.test(value)) return "";
  if (/^Public QRguitar record\b/i.test(value) || /\bpublic record(s)?\b/i.test(value)) return "";
  return value;
}
