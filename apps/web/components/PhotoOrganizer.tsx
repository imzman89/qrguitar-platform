"use client";

import { ChevronLeft, ChevronRight, GripVertical, Star, Trash2 } from "lucide-react";
import { useRef, useState, type DragEvent, type PointerEvent } from "react";

export type PhotoOrganizerStatus = {
  state: "ready" | "uploading" | "uploaded" | "error";
  progress?: number;
  message?: string;
};

type PhotoOrganizerProps = {
  images: string[];
  mainImage: string;
  onSelectMain: (imageUrl: string) => void;
  onRemove: (imageUrl: string) => void;
  onMove: (fromIndex: number, toIndex: number) => void;
  statusByImage?: Record<string, PhotoOrganizerStatus>;
  maxPhotos?: number;
};

export function PhotoOrganizer({
  images,
  mainImage,
  onSelectMain,
  onRemove,
  onMove,
  statusByImage = {},
  maxPhotos = 20
}: PhotoOrganizerProps) {
  const dragIndex = useRef<number | null>(null);
  const pointerIndex = useRef<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");

  function movePhoto(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= images.length || toIndex >= images.length) return;
    onMove(fromIndex, toIndex);
    pointerIndex.current = toIndex;
    dragIndex.current = toIndex;
    setDropIndex(toIndex);
    setAnnouncement(`Photo moved to position ${toIndex + 1}.`);
  }

  function handleDragStart(event: DragEvent<HTMLElement>, index: number) {
    dragIndex.current = index;
    setDropIndex(index);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(index));
  }

  function handlePointerMove(event: PointerEvent<HTMLButtonElement>) {
    if (pointerIndex.current == null || event.pointerType === "mouse") return;
    event.preventDefault();
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-photo-index]");
    const targetIndex = Number(target?.dataset.photoIndex);
    if (Number.isInteger(targetIndex)) movePhoto(pointerIndex.current, targetIndex);
  }

  if (!images.length) {
    return (
      <div className="photo-organizer empty">
        <strong>No photos added</strong>
        <span>Add a clear full-instrument photo first, then detail, serial, condition, and case photos.</span>
      </div>
    );
  }

  return (
    <section className="photo-organizer" aria-label="Profile photo organizer">
      <div className="photo-organizer-header">
        <div><strong>{images.length}/{maxPhotos} photos</strong><span>Drag to reorder. The starred photo leads the Profile and Catalog card.</span></div>
        <span className="photo-organizer-key"><Star size={13} aria-hidden="true" /> Main photo</span>
      </div>
      <div className="photo-organizer-grid">
        {images.map((imageUrl, index) => {
          const isMain = imageUrl === mainImage || (!mainImage && index === 0);
          const status = statusByImage[imageUrl];
          return (
            <article
              className={`photo-organizer-tile${isMain ? " is-main" : ""}${dropIndex === index ? " is-drop-target" : ""}`}
              data-photo-index={index}
              draggable
              key={`${imageUrl}-${index}`}
              onDragStart={(event) => handleDragStart(event, index)}
              onDragEnter={(event) => {
                event.preventDefault();
                if (dragIndex.current != null) movePhoto(dragIndex.current, index);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragEnd={() => { dragIndex.current = null; setDropIndex(null); }}
              onDrop={(event) => { event.preventDefault(); dragIndex.current = null; setDropIndex(null); }}
            >
              <img src={imageUrl} alt={`Instrument photo ${index + 1}`} />
              <span className="photo-organizer-number">{String(index + 1).padStart(2, "0")}</span>
              {isMain ? <span className="photo-organizer-main">Main</span> : null}
              <div className="photo-organizer-controls">
                <button
                  className="photo-drag-handle"
                  type="button"
                  aria-label={`Drag photo ${index + 1} to reorder`}
                  title="Drag to reorder"
                  onPointerDown={(event) => {
                    if (event.pointerType === "mouse") return;
                    pointerIndex.current = index;
                    event.currentTarget.setPointerCapture(event.pointerId);
                    setDropIndex(index);
                  }}
                  onPointerMove={handlePointerMove}
                  onPointerUp={(event) => {
                    pointerIndex.current = null;
                    setDropIndex(null);
                    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                  }}
                  onPointerCancel={() => { pointerIndex.current = null; setDropIndex(null); }}
                >
                  <GripVertical size={16} aria-hidden="true" />
                </button>
                <button
                  className={isMain ? "is-active" : ""}
                  type="button"
                  aria-label={isMain ? `Photo ${index + 1} is the main photo` : `Set photo ${index + 1} as main`}
                  title={isMain ? "Main photo" : "Set as main"}
                  onClick={() => { onSelectMain(imageUrl); setAnnouncement(`Photo ${index + 1} set as main.`); }}
                >
                  <Star size={15} fill={isMain ? "currentColor" : "none"} aria-hidden="true" />
                </button>
                <button
                  className="is-danger"
                  type="button"
                  aria-label={`Remove photo ${index + 1}`}
                  title="Remove photo"
                  onClick={() => { onRemove(imageUrl); setAnnouncement(`Photo ${index + 1} removed.`); }}
                >
                  <Trash2 size={15} aria-hidden="true" />
                </button>
              </div>
              {status?.state && status.state !== "ready" ? (
                <div className={`photo-organizer-status is-${status.state}`} role={status.state === "error" ? "alert" : undefined}>
                  <span>{status.state === "uploading" ? `Uploading ${Math.max(1, Math.round(status.progress || 1))}%` : status.state === "uploaded" ? "Uploaded" : status.message || "Upload failed"}</span>
                  {status.state === "uploading" ? <i style={{ width: `${Math.max(2, status.progress || 2)}%` }} /> : null}
                </div>
              ) : null}
              <details className="photo-organizer-menu">
                <summary aria-label={`More options for photo ${index + 1}`}>More</summary>
                <div>
                  <button type="button" disabled={index === 0} onClick={() => movePhoto(index, index - 1)}><ChevronLeft size={14} /> Move earlier</button>
                  <button type="button" disabled={index === images.length - 1} onClick={() => movePhoto(index, index + 1)}>Move later <ChevronRight size={14} /></button>
                </div>
              </details>
            </article>
          );
        })}
      </div>
      <p className="sr-only" aria-live="polite">{announcement}</p>
    </section>
  );
}
