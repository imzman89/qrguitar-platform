"use client";
import { useUiText } from "./UiTextProvider";


import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { appendFailedImageSource, filterAvailableImageSources } from "../lib/image-fallback";
import { publicMediaVariantSrcSet, publicMediaVariantUrl } from "../lib/public-media-variant";
import styles from "./PhotoViewer.module.css";

type PhotoViewerProps = {
  images: string[];
  initialIndex?: number;
  title: string;
  onClose: () => void;
  onImageError?: (source: string) => void;
  onIndexChange?: (index: number) => void;
};

/** Shared photo experience for Profile pages, cards, and the home showcase. */
export function PhotoViewer({ images, initialIndex = 0, title, onClose, onImageError, onIndexChange }: PhotoViewerProps) {
  const ui = useUiText("components.PhotoViewer");
  const [selectedSource, setSelectedSource] = useState(() => images[Math.max(0, Math.min(initialIndex, images.length - 1))]);
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const [loadedSources, setLoadedSources] = useState<string[]>([]);
  const [zoomed, setZoomed] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const gestureRef = useRef<{ x: number; y: number; panX: number; panY: number; pointerId: number } | null>(null);
  const suppressClickRef = useRef(false);
  const callbacksRef = useRef({ onClose, onImageError, onIndexChange });
  callbacksRef.current = { onClose, onImageError, onIndexChange };
  const photos = filterAvailableImageSources(images, failedSources);
  const activeIndex = Math.max(0, photos.indexOf(selectedSource));
  const activeSource = photos[activeIndex];
  const previousSource = photos[activeIndex - 1];
  const nextSource = photos[activeIndex + 1];

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const previousPadding = document.body.style.paddingRight;
    const scrollbarWidth = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
    if (scrollbarWidth) document.body.style.paddingRight = (parseFloat(window.getComputedStyle(document.body).paddingRight) + scrollbarWidth) + "px";
    document.body.style.overflow = "hidden";
    dialog.showModal();
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPadding;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    if (!activeSource) callbacksRef.current.onClose();
    setZoomed(false);
    setPan({ x: 0, y: 0 });
    const currentThumbnail = stripRef.current?.querySelector<HTMLElement>('[aria-current="true"]');
    currentThumbnail?.scrollIntoView({ block: "nearest", inline: "center", behavior: "instant" });
  }, [activeSource]);

  useEffect(() => {
    const adjacentSources = [previousSource, nextSource].filter(Boolean);
    adjacentSources.forEach((source) => {
      const image = new window.Image();
      image.decoding = "async";
      image.fetchPriority = "low";
      image.referrerPolicy = "no-referrer";
      const srcSet = publicMediaVariantSrcSet(source);
      if (srcSet) {
        image.srcset = srcSet;
        image.sizes = "calc(100vw - 24px)";
      }
      image.src = publicMediaVariantUrl(source, 1200);
    });
  }, [previousSource, nextSource]);

  function selectPhoto(index: number) {
    const source = photos[index];
    if (!source) return;
    setSelectedSource(source);
    setZoomed(false);
    setPan({ x: 0, y: 0 });
    callbacksRef.current.onIndexChange?.(images.indexOf(source));
  }

  function movePhoto(direction: -1 | 1) {
    if (photos.length > 1) selectPhoto((activeIndex + direction + photos.length) % photos.length);
  }

  function markImageFailed(source: string) {
    if (source === activeSource) {
      const nextSource = photos[activeIndex + 1] || photos[activeIndex - 1];
      if (nextSource) setSelectedSource(nextSource);
    }
    setFailedSources((current) => appendFailedImageSource(current, source));
    callbacksRef.current.onImageError?.(source);
  }

  function toggleZoom() {
    setZoomed((value) => !value);
    setPan({ x: 0, y: 0 });
  }

  return (
    <dialog
      className={styles.viewer}
      ref={dialogRef}
      aria-label={title + " photos"}
      onCancel={(event) => { event.preventDefault(); callbacksRef.current.onClose(); }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          callbacksRef.current.onClose();
        } else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
          event.preventDefault();
          movePhoto(event.key === "ArrowRight" ? 1 : -1);
        } else if (event.key === "Tab" && dialogRef.current) {
          const controls = Array.from(dialogRef.current.querySelectorAll<HTMLButtonElement>("button:not([disabled])"));
          const first = controls[0];
          const last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault(); last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault(); first?.focus();
          }
        }
      }}
    >
      <header className={styles.header}>
        <div className={styles.caption}>
          <span className={styles.title}>{title}</span>
          <span className={styles.counter} aria-live="polite" aria-atomic="true">{activeIndex + 1} / {photos.length}</span>
        </div>
        <div className={styles.actions}>
          <button className={styles.control} type="button" onClick={toggleZoom} aria-label={zoomed ? ui("ui.components.PhotoViewer.bc7b631a689b", "Zoom out") : ui("ui.components.PhotoViewer.0e47f09a748f", "Zoom in")} aria-pressed={zoomed}>
            {zoomed ? <ZoomOut size={21} /> : <ZoomIn size={21} />}
          </button>
          <button className={styles.control} type="button" ref={closeRef} onClick={() => callbacksRef.current.onClose()} aria-label={ui("ui.components.PhotoViewer.a076bdea28fd", "Close photos")}>
            <X size={24} />
          </button>
        </div>
      </header>
      <div className={styles.stage}>
        <button
          className={styles.imageButton + (zoomed ? " " + styles.zoomed : "")}
          type="button"
          aria-label={zoomed ? ui("ui.components.PhotoViewer.d45c880eede6", "Zoom out of photo") : ui("ui.components.PhotoViewer.405d6e9235bb", "Zoom into photo")}
          onClick={() => {
            if (suppressClickRef.current) { suppressClickRef.current = false; return; }
            toggleZoom();
          }}
          onPointerDown={(event) => {
            if (!event.isPrimary || event.button !== 0) return;
            suppressClickRef.current = false;
            gestureRef.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y, pointerId: event.pointerId };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const gesture = gestureRef.current;
            if (!gesture || gesture.pointerId !== event.pointerId) return;
            const dx = event.clientX - gesture.x;
            const dy = event.clientY - gesture.y;
            if (Math.abs(dx) > 8 || Math.abs(dy) > 8) suppressClickRef.current = true;
            if (zoomed) {
              const bounds = event.currentTarget.getBoundingClientRect();
              const image = imageRef.current;
              if (!image?.naturalWidth || !image.naturalHeight) return;
              const fit = Math.min(bounds.width / image.naturalWidth, bounds.height / image.naturalHeight);
              const maxX = Math.max(0, (image.naturalWidth * fit * 2 - bounds.width) / 2);
              const maxY = Math.max(0, (image.naturalHeight * fit * 2 - bounds.height) / 2);
              setPan({ x: Math.max(-maxX, Math.min(maxX, gesture.panX + dx)), y: Math.max(-maxY, Math.min(maxY, gesture.panY + dy)) });
            }
          }}
          onPointerUp={(event) => {
            const gesture = gestureRef.current;
            if (!gesture || gesture.pointerId !== event.pointerId) return;
            gestureRef.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
            if (zoomed) return;
            const dx = event.clientX - gesture.x;
            const dy = event.clientY - gesture.y;
            if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.2) { suppressClickRef.current = true; movePhoto(dx < 0 ? 1 : -1); }
          }}
          onPointerCancel={() => { gestureRef.current = null; suppressClickRef.current = true; }}
        >
          {activeSource ? <img
            key={activeSource}
            className={styles.photo}
            ref={imageRef}
            src={publicMediaVariantUrl(activeSource, 1200)}
            srcSet={publicMediaVariantSrcSet(activeSource)}
            sizes="calc(100vw - 24px)"
            alt={title + " photo " + (activeIndex + 1) + " of " + photos.length}
            loading="eager"
            fetchPriority="high"
            decoding="async"
            width={1600}
            height={1200}
            referrerPolicy="no-referrer"
            draggable={false}
            style={{ transform: "translate(" + pan.x + "px, " + pan.y + "px) scale(" + (zoomed ? 2 : 1) + ")" }}
            onLoad={() => setLoadedSources((current) => current.includes(activeSource) ? current : [...current, activeSource])}
            onError={() => markImageFailed(activeSource)}
          /> : null}
        </button>
        {activeSource && !loadedSources.includes(activeSource) ? <span className={styles.loading} role="status">{ui("ui.components.PhotoViewer.49fba41bc3d1", "Loading photo…")}</span> : null}
        {photos.length > 1 ? <>
          <button className={styles.control + " " + styles.previous} type="button" onClick={() => movePhoto(-1)} aria-label={ui("ui.components.PhotoViewer.2f55863e032e", "Previous photo")}><ChevronLeft size={28} /></button>
          <button className={styles.control + " " + styles.next} type="button" onClick={() => movePhoto(1)} aria-label={ui("ui.components.PhotoViewer.894bb2b7ac07", "Next photo")}><ChevronRight size={28} /></button>
        </> : null}
      </div>
      {photos.length > 1 ? <div className={styles.filmstrip} ref={stripRef} aria-label={ui("ui.components.PhotoViewer.29afaa1f472b", "Choose a photograph")}>
        {photos.map((imageUrl, index) => <button
          className={styles.thumbnail}
          key={imageUrl}
          type="button"
          onClick={() => selectPhoto(index)}
          aria-label={"Show photo " + (index + 1)}
          aria-current={index === activeIndex ? "true" : undefined}
        >
          <img src={publicMediaVariantUrl(imageUrl, 160)} alt="" loading="lazy" fetchPriority="low" decoding="async" width={112} height={112} referrerPolicy="no-referrer" onError={() => markImageFailed(imageUrl)} />
        </button>)}
      </div> : <div className={styles.bottomSpace} />}
    </dialog>
  );
}
