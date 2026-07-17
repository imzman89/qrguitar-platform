"use client";

import { ArrowRight, Camera, ChevronLeft, ChevronRight, FileText, Globe2, Hash } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
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
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const swipeStartX = useRef<number | null>(null);
  const suppressNextMediaClick = useRef(false);
  const imageUrl = galleryImages[activeImageIndex] || galleryImages[0] || "";
  const photoCount = getProfilePhotoUrls(record).length;
  const publicDocCount = getPublicDocumentCount(record);
  const publicSerial = record.showSerialPublic === true ? String(record.serial || "").trim() : "";
  const profileUrl = instrumentToProfileUrl(record);
  const showSecondaryAction = variant !== "latest" && secondaryHref && secondaryLabel;
  const showSecondaryText = variant !== "latest" && !secondaryHref && secondaryLabel;
  const summary = variant === "latest" ? "" : cleanCardSummary(record.summary);
  const showGalleryControls = variant === "catalog" && galleryImages.length > 1;

  useEffect(() => {
    setActiveImageIndex(0);
  }, [record.qrCode]);

  function moveGallery(direction: -1 | 1) {
    setActiveImageIndex((current) => {
      const next = current + direction;
      if (next < 0) return galleryImages.length - 1;
      if (next >= galleryImages.length) return 0;
      return next;
    });
  }

  function handleMediaLinkClick(event: MouseEvent<HTMLAnchorElement>) {
    if (!suppressNextMediaClick.current) return;
    event.preventDefault();
    suppressNextMediaClick.current = false;
  }

  return (
    <article className={`collectible-card collectible-card--${variant}`} aria-label={`Open ${title} QRguitar Profile`}>
      <div className="collectible-card-link">
        <div className="collectible-card-media">
          <Link
            className="collectible-card-media-link"
            href={profileUrl}
            aria-label={`Open ${title} Profile`}
            onClick={handleMediaLinkClick}
            onTouchStart={(event) => { swipeStartX.current = event.changedTouches[0]?.clientX ?? null; }}
            onTouchEnd={(event) => {
              const start = swipeStartX.current;
              const end = event.changedTouches[0]?.clientX;
              swipeStartX.current = null;
              if (!showGalleryControls || start == null || end == null || Math.abs(end - start) < 48) return;
              suppressNextMediaClick.current = true;
              moveGallery(end < start ? 1 : -1);
            }}
          >
            {imageUrl ? (
              <img
                className="collectible-card-image"
                src={imageUrl}
                alt={`${title} photo ${activeImageIndex + 1} of ${galleryImages.length}`}
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
          </Link>

          {showGalleryControls ? (
            <div className="collectible-card-gallery-controls" aria-label={`${title} photo controls`}>
              <button type="button" onClick={() => moveGallery(-1)} aria-label={`Previous photo of ${title}`}>
                <ChevronLeft size={16} aria-hidden="true" />
              </button>
              <button type="button" onClick={() => moveGallery(1)} aria-label={`Next photo of ${title}`}>
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </div>

        <Link className="collectible-card-content" href={profileUrl} aria-label={`Open ${title} Profile`}>
          <div>
            <h3>{title}</h3>
            <p className="collectible-card-subtitle">{instrumentSubtitle(record)}</p>
            {summary ? <p className="collectible-card-summary">{summary}</p> : null}
          </div>

          <ProfileStatusBadges record={record} />

          <div className="collectible-card-facts" aria-label="Profile contents">
            {publicSerial ? (
              <span className="collectible-card-serial">
                <Hash size={13} aria-hidden="true" />
                <span>
                  <small>Serial Number</small>
                  <strong>{publicSerial}</strong>
                </span>
              </span>
            ) : null}
            {photoCount ? <span><Camera size={13} /> {photoCount} {photoCount === 1 ? "photo" : "photos"}</span> : null}
            {publicDocCount ? <span><FileText size={13} /> {publicDocCount} {publicDocCount === 1 ? "document" : "documents"}</span> : null}
          </div>

          <div className="collectible-card-actions">
            <span className="collectible-card-cta">{ctaLabel} <ArrowRight size={14} /></span>
            {showSecondaryText ? <span className="collectible-card-secondary">{secondaryLabel}</span> : null}
          </div>
        </Link>
      </div>

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
