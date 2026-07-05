"use client";

import { ArrowRight, Camera, ChevronLeft, ChevronRight, FileText, Globe2, ShieldCheck, Siren } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type MouseEvent } from "react";
import {
  getInstrumentCondition,
  getInstrumentVerificationStatus,
  instrumentDisplayName,
  instrumentSubtitle,
  instrumentToProfileUrl,
  type DemoInstrument
} from "../lib/local-demo";
import { formatRecordLocation } from "../lib/record-location";
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
  eyebrow = "Public record",
  createdLabel = "",
  ctaLabel = "View Record",
  secondaryHref = "",
  secondaryLabel = ""
}: CollectibleRecordCardProps) {
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const title = instrumentDisplayName(record);
  const galleryImages = useMemo(() => {
    const images = [record.heroImageDataUrl, ...(record.galleryImageDataUrls || [])]
      .filter((image): image is string => Boolean(image));
    return Array.from(new Set(images));
  }, [record.galleryImageDataUrls, record.heroImageDataUrl]);
  const imageUrl = galleryImages[activeImageIndex] || galleryImages[0] || "";
  const location = formatRecordLocation(record);
  const condition = getInstrumentCondition(record);
  const verificationStatus = getInstrumentVerificationStatus(record);
  const authenticityStatus = record.authenticityStatus === "confirmed" ? "confirmed" : "unconfirmed";
  const safetyStatus = record.safetyStatus === "lost" || record.safetyStatus === "stolen" || record.safetyStatus === "recovered"
    ? record.safetyStatus
    : "clear";
  const photoCount = record.galleryImageDataUrls?.length || (record.heroImageDataUrl ? 1 : 0);
  const publicDocCount = record.documentFiles?.filter((file) => file.visibility !== "hidden").length || 0;
  const profileUrl = instrumentToProfileUrl(record);
  const hasCarousel = galleryImages.length > 1;

  function cycleImage(event: MouseEvent<HTMLButtonElement>, direction: "previous" | "next") {
    event.preventDefault();
    event.stopPropagation();
    setActiveImageIndex((current) => {
      if (!galleryImages.length) {
        return 0;
      }

      if (direction === "previous") {
        return current <= 0 ? galleryImages.length - 1 : current - 1;
      }

      return current >= galleryImages.length - 1 ? 0 : current + 1;
    });
  }

  return (
    <article className={`collectible-card collectible-card--${variant}`} aria-label={`Open ${title} QRguitar record`}>
      <Link className="collectible-card-link" href={profileUrl} aria-label={`Open ${title} profile`}>
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
              <strong>No public photo yet</strong>
            </div>
          )}
          <div className="collectible-card-topline">
            <span className="collectible-card-eyebrow"><Globe2 size={13} /> {eyebrow}</span>
            {createdLabel ? <span className="collectible-card-age">{createdLabel}</span> : null}
          </div>
          <span className="collectible-card-code">{record.qrCode}</span>
          {hasCarousel ? (
            <span className="collectible-card-photo-count">
              {activeImageIndex + 1}/{galleryImages.length}
            </span>
          ) : null}
        </div>

        <div className="collectible-card-content">
          <div>
            <h3>{title}</h3>
            <p className="collectible-card-subtitle">{instrumentSubtitle(record)}</p>
            {record.summary ? <p className="collectible-card-summary">{record.summary}</p> : null}
          </div>

          <div className="record-badge-row" aria-label="Record status">
            <span className="record-badge record-badge--condition"><span className="record-badge-text">{condition === "new" ? "New" : "Used"}</span></span>
            {record.showVerificationBadge !== false ? (
              <span className={`record-badge ${verificationStatus === "verified" ? "record-badge--verified" : "record-badge--unverified"}`}>
                <ShieldCheck size={13} /> <span className="record-badge-text">{verificationStatus === "verified" ? "Verified by QRguitar" : "Unverified"}</span>
              </span>
            ) : null}
            {record.showAuthenticityBadge !== false ? (
              <span className={`record-badge ${authenticityStatus === "confirmed" ? "record-badge--auth-confirmed" : "record-badge--auth-unconfirmed"}`}>
                <ShieldCheck size={13} /> <span className="record-badge-text">{authenticityStatus === "confirmed" ? "Authenticity Confirmed" : "Authenticity Unconfirmed"}</span>
              </span>
            ) : null}
            {safetyStatus !== "clear" ? (
              <span className={`record-badge ${safetyStatus === "recovered" ? "record-badge--recovered" : "record-badge--safety"}`}>
                <Siren size={13} /> <span className="record-badge-text">{safetyStatusLabel(safetyStatus)}</span>
              </span>
            ) : null}
          </div>

          <div className="collectible-card-facts">
            {record.year ? <span>{record.year}</span> : null}
            {location ? <span>{location}</span> : null}
            <span><Camera size={13} /> {photoCount} photos</span>
            <span><FileText size={13} /> {publicDocCount} docs</span>
          </div>

          <div className="collectible-card-actions">
            <span className="collectible-card-cta">{ctaLabel} <ArrowRight size={14} /></span>
            {!secondaryHref && secondaryLabel ? <span className="collectible-card-secondary">{secondaryLabel}</span> : null}
          </div>
        </div>
      </Link>

      {hasCarousel ? (
        <div className="collectible-card-carousel" aria-label={`${title} photos`}>
          <button type="button" aria-label="Previous photo" onClick={(event) => cycleImage(event, "previous")}>
            <ChevronLeft size={16} />
          </button>
          <button type="button" aria-label="Next photo" onClick={(event) => cycleImage(event, "next")}>
            <ChevronRight size={16} />
          </button>
        </div>
      ) : null}

      <RecordShareButton className="collectible-card-share" code={record.qrCode} title={title} />
      {secondaryHref && secondaryLabel ? (
        <Link className="collectible-card-secondary-link" href={secondaryHref}>
          {secondaryLabel}
        </Link>
      ) : null}
    </article>
  );
}

function safetyStatusLabel(status: "lost" | "stolen" | "recovered" | "clear") {
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
