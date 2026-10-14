"use client";
import { useUiText } from "./UiTextProvider";


import Link from "next/link";
import { ArrowUpRight, Camera } from "lucide-react";
import { useState } from "react";
import { resolveCollectibleCard } from "../lib/collectible-card";
import type { DemoInstrument } from "../lib/local-demo";
import { publicMediaVariantSrcSet, publicMediaVariantUrl } from "../lib/public-media-variant";
import { PhotoViewer } from "./PhotoViewer";
import styles from "./HomeProfileShowcase.module.css";

export function HomeProfileShowcase({ record, variant = "hero" }: { record: DemoInstrument; variant?: "hero" | "gallery" }) {
  const ui = useUiText("components.HomeProfileShowcase");
  const card = resolveCollectibleCard(record);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(0);
  const [failedPhotos, setFailedPhotos] = useState<string[]>([]);
  const photos = card.images.filter((photo) => !failedPhotos.includes(photo));
  const activePhoto = Math.min(selectedPhoto, Math.max(0, photos.length - 1));

  return (
    <article className={styles.showcase + (variant === "gallery" ? " " + styles.gallery : "")} aria-label={"Explore the public Profile for " + card.title}>
      <button type="button" className={styles.photoStage} onClick={() => setViewerOpen(true)} disabled={!photos.length} aria-label={"View photos of " + card.title}>
        {photos.length ? <img className={styles.mainPhoto} src={publicMediaVariantUrl(photos[activePhoto], 1200)} srcSet={publicMediaVariantSrcSet(photos[activePhoto])} sizes={variant === "gallery" ? "(max-width: 540px) calc(100vw - 40px), (max-width: 760px) 50vw, 400px" : "(max-width: 760px) calc(100vw - 40px), (max-width: 900px) 720px, 620px"} alt={card.title + ", photo " + (activePhoto + 1) + " of " + photos.length} loading={variant === "hero" ? "eager" : "lazy"} fetchPriority={variant === "hero" ? "high" : "low"} decoding="async" width={1200} height={900} referrerPolicy="no-referrer" onError={() => setFailedPhotos((current) => current.includes(photos[activePhoto]) ? current : [...current, photos[activePhoto]])} />
          : <div className={styles.noPhoto}><Camera size={36} aria-hidden="true" /><span>{ui("ui.components.HomeProfileShowcase.44cebddc8ad6", "Photos are currently unavailable")}</span></div>}
      </button>
      <div className={styles.details}>
        <div className={styles.identity}>
          <span className={styles.kicker}>{ui("ui.components.HomeProfileShowcase.1dd0ddc0cf78", "QRguitar Profile ·")}{" "}{card.typeLabel}</span>
          <h3><Link href={card.profileUrl}>{card.title}<ArrowUpRight size={19} aria-hidden="true" /></Link></h3>
          {card.factLine ? <p>{card.factLine}</p> : null}
        </div>
        {photos.length ? <button className={styles.galleryLink} type="button" onClick={() => setViewerOpen(true)} aria-label={(photos.length < card.photoCount ? "View available photos of " : "View all photos of ") + card.title}><Camera size={16} aria-hidden="true" />{photos.length} {photos.length === 1 ? ui("ui.components.HomeProfileShowcase.55c64d0fcd6f", "photo") : ui("ui.components.HomeProfileShowcase.84a6dae49cf0", "photos")}{photos.length < card.photoCount ? ui("ui.components.HomeProfileShowcase.033eefff7069", " available") : ""}</button> : null}
      </div>
      {viewerOpen ? <PhotoViewer images={photos} initialIndex={activePhoto} title={card.title} onClose={() => setViewerOpen(false)} onIndexChange={setSelectedPhoto} onImageError={(photo) => setFailedPhotos((current) => current.includes(photo) ? current : [...current, photo])} /> : null}
    </article>
  );
}
