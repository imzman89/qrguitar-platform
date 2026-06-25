"use client";

import { ArrowRight, Globe2, QrCode } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  demoInstrument,
  getPublicDemoInstruments,
  instrumentDisplayName,
  instrumentToProfileUrl,
  type DemoInstrument
} from "../lib/local-demo";

const fallbackLatest: DemoInstrument = demoInstrument;

export function LatestPublicRecord() {
  const [latest, setLatest] = useState<DemoInstrument>(fallbackLatest);

  useEffect(() => {
    const newestPublic = getPublicDemoInstruments()
      .slice()
      .sort((a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || ""))[0];

    if (newestPublic) {
      setLatest(newestPublic);
    }
  }, []);

  const location = latest.location || "Location private";
  const title = instrumentDisplayName(latest);
  const href = instrumentToProfileUrl(latest);
  const createdLabel = useMemo(() => formatCreatedAt(latest.createdAt), [latest.createdAt]);

  return (
    <article className="latest-record-card" aria-label="Latest public QRguitar record">
      <div
        className="latest-record-hero"
        style={
          latest.heroImageDataUrl
            ? { backgroundImage: `linear-gradient(180deg, rgba(3,5,6,.05), rgba(3,5,6,.88)), url(${latest.heroImageDataUrl})` }
            : undefined
        }
      >
        <div className="latest-live-row">
          <span><Globe2 size={14} /> Latest public record</span>
          <strong>{createdLabel}</strong>
        </div>
        <h2>{title}</h2>
        <p>{latest.brand} - {latest.serial}</p>
      </div>
      <div className="latest-record-meta">
        <div>
          <span>QRguitar ID</span>
          <strong>{latest.qrCode}</strong>
        </div>
        <div>
          <span>Region</span>
          <strong>{location}</strong>
        </div>
        <div>
          <span>Year</span>
          <strong>{latest.year || "Not listed"}</strong>
        </div>
        <div>
          <span>Status</span>
          <strong>Public</strong>
        </div>
      </div>
      <div className="latest-record-actions">
        <Link className="button" href={href}>
          View Record <ArrowRight size={16} />
        </Link>
        <Link className="button secondary" href="/catalog">
          Browse Catalog
        </Link>
        <span><QrCode size={14} /> Updates from public records</span>
      </div>
    </article>
  );
}

function formatCreatedAt(value: string) {
  const date = Date.parse(value);

  if (!Number.isFinite(date)) {
    return "Just now";
  }

  const minutes = Math.max(0, Math.round((Date.now() - date) / 60000));

  if (minutes < 1) {
    return "Just now";
  }

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);

  if (days < 30) {
    return `${days}d ago`;
  }

  const months = Math.floor(days / 30);

  if (months < 12) {
    return `${months}mo ago`;
  }

  const years = Math.floor(days / 365);
  return `${years}y ago`;
}
