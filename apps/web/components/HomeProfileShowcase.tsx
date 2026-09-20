"use client";

import Link from "next/link";
import { ArrowUpRight, Camera, FileText, Maximize2 } from "lucide-react";
import { useState } from "react";
import { resolveCollectibleCard } from "../lib/collectible-card";
import type { DemoInstrument } from "../lib/local-demo";
import { publicMediaVariantSrcSet, publicMediaVariantUrl } from "../lib/public-media-variant";
import { PhotoViewer } from "./PhotoViewer";
import styles from "./HomeProfileShowcase.module.css";

export function HomeProfileShowcase({ record }: { record: DemoInstrument }) {
  const card = resolveCollectibleCard(record);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(0);
  const [failedPhotos, setFailedPhotos] = useState<string[]>([]);
  const photos = card.images.filter((photo) => !failedPhotos.includes(photo));
  const activePhoto = Math.min(selectedPhoto, Math.max(0, photos.length - 1));

  return (
    <article className={styles.showcase} aria-label={"Explore the public Profile for " + card.title}>
      <div className={styles.topline}>
        <span>QRguitar Profile</span>
        <Link href={card.profileUrl} aria-label={"Open " + card.title + " Profile"}><ArrowUpRight size={19} aria-hidden="true" /></Link>
      </div>
      <button type="button" className={styles.photoStage} onClick={() => setViewerOpen(true)} disabled={!photos.length} aria-label={"View photos of " + card.title}>
        {photos.length ? <img className={styles.mainPhoto} src={publicMediaVariantUrl(photos[activePhoto], 1200)} srcSet={publicMediaVariantSrcSet(photos[activePhoto])} sizes="(max-width: 760px) calc(100vw - 40px), (max-width: 900px) 720px, 620px" alt={card.title + ", photo " + (activePhoto + 1) + " of " + photos.length} loading="eager" fetchPriority="high" decoding="async" width={1200} height={900} referrerPolicy="no-referrer" onError={() => setFailedPhotos((current) => current.includes(photos[activePhoto]) ? current : [...current, photos[activePhoto]])} />
          : <div className={styles.noPhoto}><Camera size={36} aria-hidden="true" /><span>Photos are currently unavailable</span></div>}
        {photos.length ? <span className={styles.expand}><Maximize2 size={16} aria-hidden="true" /><span>View photos</span></span> : null}
      </button>
      {photos.length > 1 ? <div className={styles.photoSelector} aria-label={"Choose a photo of " + card.title}>
          {photos.slice(0, 8).map((photo, index) => <button key={photo} type="button" className={index === activePhoto ? styles.selectedPhoto : undefined} aria-label={"Show photo " + (index + 1) + " of " + card.title} aria-pressed={index === activePhoto} onClick={() => setSelectedPhoto(index)}><img src={publicMediaVariantUrl(photo, 160)} alt="" loading="lazy" fetchPriority="low" decoding="async" width={92} height={92} referrerPolicy="no-referrer" onError={() => setFailedPhotos((current) => current.includes(photo) ? current : [...current, photo])} /></button>)}
        </div> : null}
      <div className={styles.details}>
        <div className={styles.identity}>
          <span className={styles.kicker}>{card.typeLabel}</span>
          <h2><Link href={card.profileUrl}>{card.title}</Link></h2>
          {card.factLine ? <p>{card.factLine}</p> : null}
        </div>
        <div className={styles.contents} aria-label="Public Profile contents">
          <span><Camera size={15} aria-hidden="true" />{card.photoCount} {card.photoCount === 1 ? "photo" : "photos"}</span>
          {card.publicDocumentCount > 0 ? <span><FileText size={15} aria-hidden="true" />{card.publicDocumentCount} {card.publicDocumentCount === 1 ? "document" : "documents"}</span> : null}
        </div>
      </div>
      <Link className={styles.passportLink} href={card.profileUrl}>
        <span>{card.code}</span><span className={styles.openLabel}>Explore Profile <ArrowUpRight size={17} aria-hidden="true" /></span>
      </Link>
      {viewerOpen ? <PhotoViewer images={photos} initialIndex={activePhoto} title={card.title} onClose={() => setViewerOpen(false)} onIndexChange={setSelectedPhoto} onImageError={(photo) => setFailedPhotos((current) => current.includes(photo) ? current : [...current, photo])} /> : null}
    </article>
  );
}
