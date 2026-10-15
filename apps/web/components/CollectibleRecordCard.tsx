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
import { RecordShareButton } from "./RecordShareButton";
import styles from "./CollectibleRecordCard.module.css";

type CollectibleRecordCardProps = {
  record: DemoInstrument;
  variant?: "latest" | "catalog" | "spotlight" | "archive";
  homeFeatured?: boolean;
  prioritizeLeadImage?: boolean;
  compactMobilePhotos?: boolean;
  deferAdjacentPhotos?: boolean;
  eyebrow?: string;
  createdLabel?: string;
  ctaLabel?: string;
  returnTo?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  content?: Record<string, string>;
};

type CardGalleryState = {
  key: string;
  activeImageIndex: number;
  loadedImages: number[];
  failedImages: number[];
  adjacentPhotosReady: boolean;
};

function freshCardGallery(key: string): CardGalleryState {
  return { key, activeImageIndex: 0, loadedImages: [], failedImages: [], adjacentPhotosReady: false };
}

export function CollectibleRecordCard({
  record,
  variant = "catalog",
  homeFeatured = false,
  prioritizeLeadImage = false,
  compactMobilePhotos = false,
  deferAdjacentPhotos = false,
  eyebrow = "",
  createdLabel = "",
  ctaLabel = "Open Profile",
  returnTo,
  secondaryHref = "",
  secondaryLabel = ""
}: CollectibleRecordCardProps) {
  const router = useRouter();
  const card = useMemo(() => resolveCollectibleCard(record), [record]);
  const localProfileHref = useMemo(() => {
    if (!returnTo) return card.profileUrl;
    const url = new URL(card.profileUrl, "https://qrguitar.invalid");
    url.searchParams.set("returnTo", returnTo);
    return url.pathname + url.search + url.hash;
  }, [card.profileUrl, returnTo]);
  const galleryKey = JSON.stringify([record.qrCode, card.images]);
  const [storedGallery, setStoredGallery] = useState(() => freshCardGallery(galleryKey));
  // New records never reuse an old gallery's selection or loading state.
  if (storedGallery.key !== galleryKey) setStoredGallery(freshCardGallery(galleryKey));
  const gallery = storedGallery.key === galleryKey ? storedGallery : freshCardGallery(galleryKey);
  const { activeImageIndex, failedImages, loadedImages } = gallery;
  const adjacentPhotosReady = variant !== "catalog" || !deferAdjacentPhotos || gallery.adjacentPhotosReady;
  const updateGallery = useCallback((change: (current: CardGalleryState) => CardGalleryState) => {
    setStoredGallery((current) => current.key === galleryKey ? change(current) : current);
  }, [galleryKey]);
  const unlockAdjacentPhotos = useCallback(() => {
    updateGallery((current) => current.adjacentPhotosReady ? current : { ...current, adjacentPhotosReady: true });
  }, [updateGallery]);
  const selectGalleryPhoto = useCallback((index: number) => {
    updateGallery((current) => ({ ...current, activeImageIndex: index, adjacentPhotosReady: true }));
  }, [updateGallery]);
  const markImageFailed = useCallback((index: number) => {
    updateGallery((current) => current.failedImages.includes(index) && current.adjacentPhotosReady ? current : {
      ...current, failedImages: current.failedImages.includes(index) ? current.failedImages : [...current.failedImages, index], adjacentPhotosReady: true
    });
  }, [updateGallery]);
  const railRef = useRef<HTMLAnchorElement | null>(null);
  const dragState = useRef({ galleryKey, pointerId: -1, startX: 0, scrollLeft: 0, moved: false, userScrollPending: false });
  const previewOnly = variant === "archive" || variant === "latest";
  const isHomeFeatured = variant === "latest" && homeFeatured;
  const galleryImages = previewOnly ? card.images.slice(0, 1) : card.images;
  const showSecondaryAction = variant !== "latest" && secondaryHref && secondaryLabel;
  const showSecondaryText = variant !== "latest" && !secondaryHref && secondaryLabel;
  const summary = variant === "spotlight" ? card.summary : "";
  const showGalleryControls = galleryImages.length > 1;
  useEffect(() => {
    const rail = railRef.current;
    rail?.scrollTo({ left: 0, behavior: "instant" });
    const pointerId = dragState.current.pointerId;
    if (pointerId >= 0 && rail?.hasPointerCapture?.(pointerId)) rail.releasePointerCapture(pointerId);
    dragState.current = { galleryKey, pointerId: -1, startX: 0, scrollLeft: 0, moved: false, userScrollPending: false };
  }, [galleryKey]);

  const markImageReady = useCallback((index: number, node: HTMLImageElement | null) => {
    if (!node?.complete) return;
    if (node.naturalWidth > 0) {
      updateGallery((current) => current.loadedImages.includes(index) && current.adjacentPhotosReady ? current : {
        ...current, loadedImages: current.loadedImages.includes(index) ? current.loadedImages : [...current.loadedImages, index], adjacentPhotosReady: true
      });
      return;
    }
    markImageFailed(index);
  }, [markImageFailed, updateGallery]);

  function moveGallery(direction: -1 | 1) {
    const rail = railRef.current;
    if (!rail || galleryImages.length < 2) return;
    const next = (activeImageIndex + direction + galleryImages.length) % galleryImages.length;
    rail.scrollTo({ left: next * rail.clientWidth, behavior: "smooth" });
    selectGalleryPhoto(next);
  }

  function handlePointerDown(event: PointerEvent<HTMLAnchorElement>) {
    if (isHomeFeatured) return;
    if (event.pointerType !== "mouse") {
      dragState.current = { galleryKey, pointerId: -1, startX: 0, scrollLeft: 0, moved: false, userScrollPending: true };
      return;
    }
    const rail = railRef.current;
    if (!rail) return;
    dragState.current = { galleryKey, pointerId: event.pointerId, startX: event.clientX, scrollLeft: rail.scrollLeft, moved: false, userScrollPending: false };
    rail.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLAnchorElement>) {
    if (event.pointerType !== "mouse") return;
    const rail = railRef.current;
    const drag = dragState.current;
    if (!rail || drag.galleryKey !== galleryKey || drag.pointerId !== event.pointerId) return;
    const distance = event.clientX - drag.startX;
    if (Math.abs(distance) > 8) drag.moved = true;
    if (drag.moved) {
      unlockAdjacentPhotos();
      rail.scrollLeft = drag.scrollLeft - distance;
    }
  }

  function handlePointerEnd(event: PointerEvent<HTMLAnchorElement>) {
    if (event.pointerType !== "mouse") return;
    const rail = railRef.current;
    if (!rail || dragState.current.galleryKey !== galleryKey || dragState.current.pointerId !== event.pointerId) return;
    if (rail.hasPointerCapture?.(event.pointerId)) rail.releasePointerCapture(event.pointerId);
    dragState.current.pointerId = -1;
    const next = Math.max(0, Math.min(galleryImages.length - 1, Math.round(rail.scrollLeft / Math.max(1, rail.clientWidth))));
    rail.scrollTo({ left: next * rail.clientWidth, behavior: "smooth" });
    selectGalleryPhoto(next);
  }

  function handleRailClick(event: MouseEvent<HTMLAnchorElement>) {
    if (dragState.current.moved) {
      dragState.current.moved = false;
      event.preventDefault();
    }
  }

  function handleContentClick(event: MouseEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("a, button, details")) return;
    router.push(localProfileHref);
  }

  function handleWheel(event: WheelEvent<HTMLAnchorElement>) {
    if (isHomeFeatured) return;
    if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
    event.preventDefault();
    unlockAdjacentPhotos();
    railRef.current?.scrollBy({ left: event.deltaX, behavior: "auto" });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLAnchorElement>) {
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.key === "Enter") return;
    if (event.key === " ") {
      event.preventDefault();
      router.push(localProfileHref);
      return;
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    if (isHomeFeatured) return;
    event.preventDefault();
    moveGallery(event.key === "ArrowRight" ? 1 : -1);
  }

  return (
    <article className={styles["collectible-card"]} data-card-variant={variant} data-home-featured={isHomeFeatured ? "true" : undefined} aria-label={`Open ${card.title} QRguitar Profile`}>
      <div className={styles["collectible-card-link"]}>
        <div className={styles["collectible-card-gallery"]}>
        <div className={styles["collectible-card-media"]}>
          <Link
            href={localProfileHref}
            ref={railRef}
            className={styles["collectible-card-media-rail"]}
            aria-label={`Open ${card.title} Profile${galleryImages.length ? `. Photo ${activeImageIndex + 1} of ${card.photoCount}` : ""}`}
            onClick={handleRailClick}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
            onWheel={handleWheel}
            onKeyDown={handleKeyDown}
            onScroll={(event) => {
              const rail = event.currentTarget;
              const next = Math.max(0, Math.min(galleryImages.length - 1, Math.round(rail.scrollLeft / Math.max(1, rail.clientWidth))));
              const userScroll = dragState.current.galleryKey === galleryKey && (dragState.current.moved || dragState.current.userScrollPending);
              if (next !== activeImageIndex && (adjacentPhotosReady || userScroll)) selectGalleryPhoto(next);
            }}
          >
            {galleryImages.length ? (
              galleryImages.map((imageUrl, index) => (
                <div className={styles["collectible-card-media-slide"]} key={`${imageUrl}-${index}`} aria-hidden={index !== activeImageIndex}>
                  {failedImages.includes(index) ? (
                    <div className={styles["collectible-card-empty-media"]}><span>QRguitar</span><strong>Photo unavailable</strong></div>
                  ) : Math.abs(index - activeImageIndex) <= 1 && (index === activeImageIndex || adjacentPhotosReady) ? (
                    <>
                      {!loadedImages.includes(index) ? <div className={styles["collectible-card-loading-media"]} aria-hidden="true">Loading photo...</div> : null}
                      <picture style={{ display: "contents" }}>
                        {compactMobilePhotos && publicMediaVariantUrl(imageUrl, 400) !== imageUrl ? (
                          <source media="(max-width: 430px) and (max-resolution: 1dppx)" srcSet={publicMediaVariantUrl(imageUrl, 400)} />
                        ) : null}
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
                        onError={() => markImageFailed(index)}
                      />
                      </picture>
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

          </Link>


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
        </div>

        </div>
        <div className={styles["collectible-card-content"]} onClick={handleContentClick}>
          {eyebrow || createdLabel ? <div className={styles["collectible-card-topline"]}>
            {eyebrow ? <span className={styles["collectible-card-eyebrow"]}><Globe2 size={13} aria-hidden="true" /> {eyebrow}</span> : null}
            {createdLabel ? <span className={styles["collectible-card-age"]}>{createdLabel}</span> : null}
          </div> : null}
          <Link className={styles["collectible-card-profile-link"]} href={localProfileHref}>
            <span className={styles["collectible-card-type"]}>{card.typeLabel}</span>
            <h3>{isHomeFeatured ? <><span>{card.title}</span><ArrowRight size={16} aria-hidden="true" /></> : card.title}</h3>
            <p className={styles["collectible-card-subtitle"]}>{card.factLine}</p>
            {summary ? <p className={styles["collectible-card-summary"]}>{summary}</p> : null}
          </Link>

          <ProfileStatusBadges record={record} includeCondition={false} ownerCollection={card.collection || undefined} />

          {card.publicHistoryCount ? <p className={styles["collectible-card-provenance"]}>{card.publicHistoryCount} {card.publicHistoryCount === 1 ? "recorded history entry" : "recorded history entries"}</p> : null}


          {!isHomeFeatured ? <div className={styles["collectible-card-actions"]}>
            <Link className={styles["collectible-card-cta"]} href={localProfileHref}>{ctaLabel} <ArrowRight size={14} /></Link>
            {showSecondaryText ? <span className={styles["collectible-card-secondary"]}>{secondaryLabel}</span> : null}
          </div> : null}
          {!isHomeFeatured ? <details className={styles["collectible-card-details"]}><summary>Record details</summary><div className={styles["collectible-card-facts"]} aria-label="Profile contents">
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
          </div>
            <div className={styles["collectible-card-utilities"]}>
              <RecordShareButton className={styles["collectible-card-share"]} showLabel={variant === "catalog"} code={card.code} title={card.title} />
            </div>
            {variant === "catalog" ? <span className={styles["collectible-card-code"]}>{card.code}</span> : null}
          </details> : null}
          {variant !== "catalog" ? <span className={styles["collectible-card-code"]}>{card.code}</span> : null}
        </div>
      </div>

      {showSecondaryAction ? (
        <Link className={styles["collectible-card-secondary-link"]} href={secondaryHref}>
          {secondaryLabel}
        </Link>
      ) : null}
    </article>
  );
}
