"use client";

import { ArrowRight, Camera, ChevronLeft, ChevronRight, FileText, Globe2, Hash } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type MouseEvent,
  useCallback,
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
import { publicMediaVariantUrl } from "../lib/public-media-variant";
import { ProfileStatusBadges } from "./ProfileStatusBadges";
import { PhotoViewer } from "./PhotoViewer";
import { RecordShareButton } from "./RecordShareButton";
import styles from "./CollectibleRecordCard.module.css";

type CollectibleRecordCardProps = {
  record: DemoInstrument;
  variant?: "latest" | "catalog" | "spotlight" | "archive";
  prioritizeLeadImage?: boolean;
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
  prioritizeLeadImage = false,
  eyebrow = "",
  createdLabel = "",
  ctaLabel = "Open Profile",
  secondaryHref = "",
  secondaryLabel = ""
}: CollectibleRecordCardProps) {
  const router = useRouter();
  const card = useMemo(() => resolveCollectibleCard(record), [record]);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [failedImages, setFailedImages] = useState<number[]>([]);
  const [loadedImages, setLoadedImages] = useState<number[]>([]);
  const railRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef({ pointerId: -1, startX: 0, scrollLeft: 0, moved: false });
  const previewOnly = variant === "archive" || variant === "latest";
  const galleryImages = previewOnly ? card.images.slice(0, 1) : card.images;
  const showSecondaryAction = variant !== "latest" && secondaryHref && secondaryLabel;
  const showSecondaryText = variant !== "latest" && !secondaryHref && secondaryLabel;
  const summary = variant === "latest" || variant === "archive" ? "" : card.summary;
  const showGalleryControls = galleryImages.length > 1;
  const gallerySourceKey = card.images.join("\u001f");

  useEffect(() => {
    setActiveImageIndex(0);
    setFailedImages([]);
    setLoadedImages([]);
    railRef.current?.scrollTo({ left: 0, behavior: "instant" });
  }, [record.qrCode, gallerySourceKey]);

  const markImageReady = useCallback((index: number, node: HTMLImageElement | null) => {
    if (!node?.complete) return;
    if (node.naturalWidth > 0) {
      setLoadedImages((current) => current.includes(index) ? current : [...current, index]);
      return;
    }
    setFailedImages((current) => current.includes(index) ? current : [...current, index]);
  }, []);

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
    if (rail.hasPointerCapture?.(event.pointerId)) rail.releasePointerCapture(event.pointerId);
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
    if (card.images.length) setViewerOpen(true);
  }

  function handleContentClick(event: MouseEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("a, button")) return;
    router.push(card.profileUrl);
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
    event.preventDefault();
    railRef.current?.scrollBy({ left: event.deltaX, behavior: "auto" });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (card.images.length) setViewerOpen(true);
      return;
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    moveGallery(event.key === "ArrowRight" ? 1 : -1);
  }

  return (
    <article className={styles["collectible-card"]} data-card-variant={variant} aria-label={`Open ${card.title} QRguitar Profile`}>
      <div className={styles["collectible-card-link"]}>
        <div className={styles["collectible-card-media"]}>
          <div
            ref={railRef}
            className={styles["collectible-card-media-rail"]}
            role="region"
            aria-roledescription="carousel"
            aria-label={galleryImages.length ? (previewOnly ? `${card.title} photo preview. ${card.photoCount} ${card.photoCount === 1 ? "photo" : "photos"} available. Press Enter to view photos.` : `${card.title} photos. Image ${activeImageIndex + 1} of ${galleryImages.length}. Press Enter to view photos.`) : `${card.title}. Photos unavailable.`}
            tabIndex={galleryImages.length ? 0 : -1}
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
                <div className={styles["collectible-card-media-slide"]} key={`${imageUrl}-${index}`} aria-hidden={index !== activeImageIndex}>
                  {failedImages.includes(index) ? (
                    <div className={styles["collectible-card-empty-media"]}><span>QRguitar</span><strong>Photo unavailable</strong></div>
                  ) : Math.abs(index - activeImageIndex) <= 1 ? (
                    <>
                      {!loadedImages.includes(index) ? <div className={styles["collectible-card-loading-media"]} aria-hidden="true">Loading photo...</div> : null}
                      <img
                        ref={(node) => markImageReady(index, node)}
                        className={styles["collectible-card-image"]}
                        src={publicMediaVariantUrl(imageUrl, 640)}
                        alt={`${card.title} ${previewOnly ? "preview photo" : "photo"} ${index + 1} of ${card.photoCount}`}
                        loading={prioritizeLeadImage && index === 0 ? "eager" : "lazy"}
                        fetchPriority={prioritizeLeadImage && index === 0 ? "high" : "low"}
                        decoding="async"
                        width={1200}
                        height={900}
                        referrerPolicy="no-referrer"
                        draggable={false}
                        onLoad={(event) => markImageReady(index, event.currentTarget)}
                        onError={() => setFailedImages((current) => current.includes(index) ? current : [...current, index])}
                      />
                    </>
                  ) : <div className={styles["collectible-card-loading-media"]} aria-hidden="true" />}
                </div>
              ))
            ) : (
              <div className={styles["collectible-card-empty-media"]}>
                <span>QRguitar</span>
                <strong>Photo unavailable</strong>
              </div>
            )}

          </div>

            <div className={styles["collectible-card-topline"]}>
              {eyebrow ? <span className={styles["collectible-card-eyebrow"]}><Globe2 size={13} /> {eyebrow}</span> : null}
              {createdLabel ? <span className={styles["collectible-card-age"]}>{createdLabel}</span> : null}
            </div>
        </div>

        <div className={styles["collectible-card-media-toolbar"]}>
            {card.photoCount > 1 ? <span className={styles["collectible-card-image-count"]}><Camera size={12} aria-hidden="true" /> {showGalleryControls ? `${activeImageIndex + 1}/${card.photoCount}` : `${card.photoCount} photos`}</span> : null}

          {showGalleryControls ? (
            <div className={styles["collectible-card-gallery-controls"]} aria-label={`${card.title} photo controls`}>
              <button type="button" onClick={() => moveGallery(-1)} aria-label={`Previous photo of ${card.title}`}>
                <ChevronLeft size={16} aria-hidden="true" />
              </button>
              <button type="button" onClick={() => moveGallery(1)} aria-label={`Next photo of ${card.title}`}>
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </div>
          ) : null}
          <RecordShareButton className={styles["collectible-card-share"]} code={card.code} title={card.title} />
        </div>

        <div className={styles["collectible-card-content"]} onClick={handleContentClick}>
          <Link className={styles["collectible-card-profile-link"]} href={card.profileUrl}>
            <span className={styles["collectible-card-type"]}>{card.typeLabel}</span>
            <h3>{card.title}</h3>
            <p className={styles["collectible-card-subtitle"]}>{card.factLine}</p>
            {summary ? <p className={styles["collectible-card-summary"]}>{summary}</p> : null}
          </Link>

          <ProfileStatusBadges record={record} includeCondition={false} ownerCollection={card.collection || undefined} />

          {card.publicSerial || card.publicDocumentCount ? <div className={styles["collectible-card-facts"]} aria-label="Profile contents">
            {card.publicSerial ? (
              <span className={styles["collectible-card-serial"]}>
                <Hash size={13} aria-hidden="true" />
                <span>
                  <small>Serial Number</small>
                  <strong>{card.publicSerial}</strong>
                </span>
              </span>
            ) : null}
            {card.publicDocumentCount ? <span><FileText size={13} /> {card.publicDocumentCount} {card.publicDocumentCount === 1 ? "document" : "documents"}</span> : null}
          </div> : null}

          <div className={styles["collectible-card-actions"]}>
            <Link className={styles["collectible-card-cta"]} href={card.profileUrl}>{ctaLabel} <ArrowRight size={14} /></Link>
            <span className={styles["collectible-card-code"]}>{card.code}</span>
            {showSecondaryText ? <span className={styles["collectible-card-secondary"]}>{secondaryLabel}</span> : null}
          </div>
        </div>
      </div>

      {viewerOpen ? <PhotoViewer images={card.images} initialIndex={activeImageIndex} title={card.title} onClose={() => setViewerOpen(false)} /> : null}
      {showSecondaryAction ? (
        <Link className={styles["collectible-card-secondary-link"]} href={secondaryHref}>
          {secondaryLabel}
        </Link>
      ) : null}
    </article>
  );
}
