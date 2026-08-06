"use client";

import { ArrowRight, Camera, ChevronLeft, ChevronRight, FileText, Globe2, Hash } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type WheelEvent
} from "react";
import { resolveCollectibleCard } from "../lib/collectible-card";
import type { DemoInstrument } from "../lib/local-demo";
import { ProfileStatusBadges } from "./ProfileStatusBadges";
import { RecordShareButton } from "./RecordShareButton";

type CollectibleRecordCardProps = {
  record: DemoInstrument;
  variant?: "latest" | "catalog" | "spotlight" | "archive";
  eyebrow?: string;
  createdLabel?: string;
  ctaLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  content?: Record<string, string>;
};

export function CollectibleRecordCard({
  record,
  variant = "catalog",
  eyebrow = "",
  createdLabel = "",
  ctaLabel = "Open Profile",
  secondaryHref = "",
  secondaryLabel = "",
  content
}: CollectibleRecordCardProps) {
  const router = useRouter();
  const card = useMemo(() => resolveCollectibleCard(record), [record]);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [failedImages, setFailedImages] = useState<number[]>([]);
  const railRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef({ pointerId: -1, startX: 0, scrollLeft: 0, moved: false });
  const galleryImages = variant === "archive" ? card.images.slice(0, 1) : card.images;
  const showSecondaryAction = variant !== "latest" && secondaryHref && secondaryLabel;
  const showSecondaryText = variant !== "latest" && !secondaryHref && secondaryLabel;
  const summary = variant === "latest" || variant === "archive" ? "" : card.summary;
  const showGalleryControls = galleryImages.length > 1;
  const attributionPrefix = content?.["cards.attribution.collection"] || "From the collection of";

  useEffect(() => {
    setActiveImageIndex(0);
    setFailedImages([]);
  }, [record.qrCode]);

  function moveGallery(direction: -1 | 1) {
    const rail = railRef.current;
    if (!rail || galleryImages.length < 2) return;
    const next = (activeImageIndex + direction + galleryImages.length) % galleryImages.length;
    rail.scrollTo({ left: next * rail.clientWidth, behavior: "smooth" });
    setActiveImageIndex(next);
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse") return;
    const rail = railRef.current;
    if (!rail) return;
    dragState.current = { pointerId: event.pointerId, startX: event.clientX, scrollLeft: rail.scrollLeft, moved: false };
    rail.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse") return;
    const rail = railRef.current;
    const drag = dragState.current;
    if (!rail || drag.pointerId !== event.pointerId) return;
    const distance = event.clientX - drag.startX;
    if (Math.abs(distance) > 8) drag.moved = true;
    if (drag.moved) rail.scrollLeft = drag.scrollLeft - distance;
  }

  function handlePointerEnd(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse") return;
    const rail = railRef.current;
    if (!rail || dragState.current.pointerId !== event.pointerId) return;
    rail.releasePointerCapture(event.pointerId);
    dragState.current.pointerId = -1;
    const next = Math.max(0, Math.min(galleryImages.length - 1, Math.round(rail.scrollLeft / Math.max(1, rail.clientWidth))));
    rail.scrollTo({ left: next * rail.clientWidth, behavior: "smooth" });
    setActiveImageIndex(next);
  }

  function handleRailClick() {
    if (dragState.current.moved) {
      dragState.current.moved = false;
      return;
    }
    router.push(card.profileUrl);
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
    event.preventDefault();
    railRef.current?.scrollBy({ left: event.deltaX, behavior: "auto" });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    moveGallery(event.key === "ArrowRight" ? 1 : -1);
  }

  return (
    <article className={`collectible-card collectible-card--${variant}`} aria-label={`Open ${card.title} QRguitar Profile`}>
      <div className="collectible-card-link">
        <div className="collectible-card-media">
          <div
            ref={railRef}
            className="collectible-card-media-rail"
            role="region"
            aria-roledescription="carousel"
            aria-label={`${card.title} photos. Image ${activeImageIndex + 1} of ${Math.max(1, galleryImages.length)}.`}
            tabIndex={0}
            onClick={handleRailClick}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
            onWheel={handleWheel}
            onKeyDown={handleKeyDown}
            onScroll={(event) => {
              const rail = event.currentTarget;
              setActiveImageIndex(Math.max(0, Math.min(galleryImages.length - 1, Math.round(rail.scrollLeft / Math.max(1, rail.clientWidth)))));
            }}
          >
            {galleryImages.length ? (
              galleryImages.map((imageUrl, index) => (
                <div className="collectible-card-media-slide" key={`${imageUrl}-${index}`} aria-hidden={index !== activeImageIndex}>
                  {failedImages.includes(index) ? (
                    <div className="collectible-card-empty-media"><span>QRguitar</span><strong>Photo unavailable</strong></div>
                  ) : (
                    <img
                      className="collectible-card-image"
                      src={imageUrl}
                      alt={`${card.title} photo ${index + 1} of ${galleryImages.length}`}
                      loading={variant === "latest" && index === 0 ? "eager" : "lazy"}
                      decoding="async"
                      draggable={false}
                      onError={() => setFailedImages((current) => current.includes(index) ? current : [...current, index])}
                    />
                  )}
                </div>
              ))
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
            <span className="collectible-card-code">{card.code}</span>
            {showGalleryControls ? <span className="collectible-card-image-count">{activeImageIndex + 1}/{galleryImages.length}</span> : null}
          </div>

          {showGalleryControls ? (
            <div className="collectible-card-gallery-controls" aria-label={`${card.title} photo controls`}>
              <button type="button" onClick={() => moveGallery(-1)} aria-label={`Previous photo of ${card.title}`}>
                <ChevronLeft size={16} aria-hidden="true" />
              </button>
              <button type="button" onClick={() => moveGallery(1)} aria-label={`Next photo of ${card.title}`}>
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </div>

        <div className="collectible-card-content">
          <Link className="collectible-card-profile-link" href={card.profileUrl} aria-label={`Open ${card.title} Profile`}>
            <h3>{card.title}</h3>
            <p className="collectible-card-subtitle">{card.factLine}</p>
            {summary ? <p className="collectible-card-summary">{summary}</p> : null}
          </Link>

          <ProfileStatusBadges record={record} maxBadges={3} />

          <div className="collectible-card-facts" aria-label="Profile contents">
            {card.publicSerial ? (
              <span className="collectible-card-serial">
                <Hash size={13} aria-hidden="true" />
                <span>
                  <small>Serial Number</small>
                  <strong>{card.publicSerial}</strong>
                </span>
              </span>
            ) : null}
            {card.photoCount ? <span><Camera size={13} /> {card.photoCount} {card.photoCount === 1 ? "photo" : "photos"}</span> : null}
            {card.publicDocumentCount ? <span><FileText size={13} /> {card.publicDocumentCount} {card.publicDocumentCount === 1 ? "document" : "documents"}</span> : null}
          </div>

          {card.collection ? (
            <Link className="collectible-card-collection-link" href={`/collections/${card.collection.handle}`} aria-label={`Open ${card.collection.publicName} collection`}>
              {attributionPrefix} {card.collection.publicName}
            </Link>
          ) : null}

          <div className="collectible-card-actions">
            <Link className="collectible-card-cta" href={card.profileUrl}>{ctaLabel} <ArrowRight size={14} /></Link>
            {showSecondaryText ? <span className="collectible-card-secondary">{secondaryLabel}</span> : null}
          </div>
        </div>
      </div>

      <RecordShareButton className="collectible-card-share" code={card.code} title={card.title} />
      {showSecondaryAction ? (
        <Link className="collectible-card-secondary-link" href={secondaryHref}>
          {secondaryLabel}
        </Link>
      ) : null}
    </article>
  );
}
