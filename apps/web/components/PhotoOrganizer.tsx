"use client";
import { useUiText } from "./UiTextProvider";


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
  const ui = useUiText("components.PhotoOrganizer");
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
        <strong>{ui("ui.components.PhotoOrganizer.d7c54b3b1ce7", "No photos added")}</strong>
        <span>{ui("ui.components.PhotoOrganizer.a73e7c9c2caf", "Add a clear full-instrument photo first, then detail, serial, condition, and case photos.")}</span>
      </div>
    );
  }

  return (
    <section className="photo-organizer" aria-label={ui("ui.components.PhotoOrganizer.4d0e02a0fca6", "Profile photo organizer")}>
      <div className="photo-organizer-header">
        <div><strong>{images.length}/{maxPhotos}{" "}{ui("ui.components.PhotoOrganizer.84a6dae49cf0", "photos")}</strong><span>{ui("ui.components.PhotoOrganizer.6ab8e2b748a8", "Drag to reorder. The starred photo leads the Profile and Catalog card.")}</span></div>
        <span className="photo-organizer-key"><Star size={13} aria-hidden="true" />{" "}{ui("ui.components.PhotoOrganizer.14b29400712f", "Main photo")}</span>
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
              <img
                src={imageUrl}
                alt={ui("ui.components.PhotoOrganizer.f04fbba80f5f", "Instrument photo {{value1}}", { value1: index + 1 })}
                loading="lazy"
                fetchPriority="low"
                decoding="async"
                width={1200}
                height={900}
                referrerPolicy="no-referrer"
              />
              <span className="photo-organizer-number">{String(index + 1).padStart(2, "0")}</span>
              {isMain ? <span className="photo-organizer-main">{ui("ui.components.PhotoOrganizer.eb814be3ca3b", "Main")}</span> : null}
              <div className="photo-organizer-controls">
                <button
                  className="photo-drag-handle"
                  type="button"
                  aria-label={ui("ui.components.PhotoOrganizer.829f729dbe1d", "Drag photo {{value1}} to reorder", { value1: index + 1 })}
                  title={ui("ui.components.PhotoOrganizer.ef86a0ed9287", "Drag to reorder")}
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
                  aria-label={isMain ? ui("ui.components.PhotoOrganizer.daaaffa5d6f6", "Photo {{value1}} is the main photo", { value1: index + 1 }) : ui("ui.components.PhotoOrganizer.3fa930326917", "Set photo {{value1}} as main", { value1: index + 1 })}
                  title={isMain ? ui("ui.components.PhotoOrganizer.14b29400712f", "Main photo") : ui("ui.components.PhotoOrganizer.d35820958872", "Set as main")}
                  onClick={() => { onSelectMain(imageUrl); setAnnouncement(`Photo ${index + 1} set as main.`); }}
                >
                  <Star size={15} fill={isMain ? "currentColor" : "none"} aria-hidden="true" />
                </button>
                <button
                  className="is-danger"
                  type="button"
                  aria-label={ui("ui.components.PhotoOrganizer.83b5debd0495", "Remove photo {{value1}}", { value1: index + 1 })}
                  title={ui("ui.components.PhotoOrganizer.f46512ab2099", "Remove photo")}
                  onClick={() => { onRemove(imageUrl); setAnnouncement(`Photo ${index + 1} removed.`); }}
                >
                  <Trash2 size={15} aria-hidden="true" />
                </button>
              </div>
              {status?.state && status.state !== "ready" ? (
                <div className={`photo-organizer-status is-${status.state}`} role={status.state === "error" ? "alert" : undefined}>
                  <span>{status.state === "uploading" ? ui("ui.components.PhotoOrganizer.2ad1142c1f1c", "Uploading {{value1}}%", { value1: Math.max(1, Math.round(status.progress || 1)) }) : status.state === "uploaded" ? ui("ui.components.PhotoOrganizer.3cc3767e7032", "Uploaded") : status.message || ui("ui.components.PhotoOrganizer.6efc5d27f30b", "Upload failed")}</span>
                  {status.state === "uploading" ? <i style={{ width: `${Math.max(2, status.progress || 2)}%` }} /> : null}
                </div>
              ) : null}
              <details className="photo-organizer-menu">
                <summary aria-label={ui("ui.components.PhotoOrganizer.c7dbb502bdce", "More options for photo {{value1}}", { value1: index + 1 })}>{ui("ui.components.PhotoOrganizer.d47d7cb0e4f8", "More")}</summary>
                <div>
                  <button type="button" disabled={index === 0} onClick={() => movePhoto(index, index - 1)}><ChevronLeft size={14} />{" "}{ui("ui.components.PhotoOrganizer.736612d4d0a9", "Move earlier")}</button>
                  <button type="button" disabled={index === images.length - 1} onClick={() => movePhoto(index, index + 1)}>{ui("ui.components.PhotoOrganizer.d6e856081ebe", "Move later")}{" "}<ChevronRight size={14} /></button>
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
