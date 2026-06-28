"use client";

import { ArrowRight, Globe2, QrCode } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { RecordShareButton } from "./RecordShareButton";
import {
  instrumentDisplayName,
  type DemoInstrument
} from "../lib/local-demo";

type InstrumentsResponse = {
  ok?: boolean;
  instruments?: DemoInstrument[];
};

export function LatestPublicRecord() {
  const [latest, setLatest] = useState<DemoInstrument | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadLatestPublicRecord() {
      try {
        const response = await fetch("/api/instruments", {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" }
        });
        const payload = (await response.json().catch(() => null)) as InstrumentsResponse | null;
        const newestPublicRecord = payload?.ok && Array.isArray(payload.instruments) ? payload.instruments[0] || null : null;

        if (active) {
          setLatest(newestPublicRecord);
        }
      } catch {
        if (active) {
          setLatest(null);
        }
      } finally {
        if (active) {
          setLoaded(true);
        }
      }
    }

    loadLatestPublicRecord();

    return () => {
      active = false;
    };
  }, []);

  if (!loaded) {
    return (
      <article className="latest-record-card latest-record-card--skeleton" aria-label="Latest public QRguitar record">
        <div className="latest-record-hero">
          <div className="latest-live-row">
            <span><Globe2 size={14} /> Latest public record</span>
          </div>
          <div className="latest-skeleton-line latest-skeleton-line--title" aria-hidden="true" />
          <div className="latest-skeleton-line latest-skeleton-line--copy" aria-hidden="true" />
        </div>
        <div className="latest-record-meta" aria-hidden="true">
          {["id", "region", "year", "status"].map((item) => (
            <div key={item}>
              <span className="latest-skeleton-line latest-skeleton-line--label" />
              <strong className="latest-skeleton-line latest-skeleton-line--value" />
            </div>
          ))}
        </div>
        <div className="latest-record-actions" aria-hidden="true">
          <span className="latest-skeleton-line latest-skeleton-line--button" />
          <span className="latest-skeleton-line latest-skeleton-line--button latest-skeleton-line--button-secondary" />
        </div>
      </article>
    );
  }

  if (!latest) {
    return (
      <article className="latest-record-card latest-record-card--empty" aria-label="No public QRguitar records yet">
        <div className="latest-record-empty">
          <span><Globe2 size={14} /> Latest public record</span>
          <h2>No public records yet.</h2>
          <p>Create the first public QRguitar record.</p>
          <Link className="button" href="/create">
            Create Record
          </Link>
        </div>
      </article>
    );
  }

  const location = latest.location || "Location private";
  const title = instrumentDisplayName(latest);
  const createdLabel = formatCreatedAt(latest.createdAt);

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
          <span className="latest-live-actions">
            <strong>{createdLabel}</strong>
            <RecordShareButton code={latest.qrCode} title={title} />
          </span>
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
        <Link className="button" href={latest.permanentPath || `/i/${latest.qrCode}`}>
          Open Record <ArrowRight size={16} />
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
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }

  const months = Math.floor(days / 30);

  if (months < 12) {
    return `${months} month${months === 1 ? "" : "s"} ago`;
  }

  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}
