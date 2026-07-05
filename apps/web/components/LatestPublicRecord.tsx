"use client";

import { Globe2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CollectibleRecordCard } from "./CollectibleRecordCard";
import {
  type DemoInstrument
} from "../lib/local-demo";

type InstrumentsResponse = {
  ok?: boolean;
  instruments?: DemoInstrument[];
};

export function LatestPublicRecord({ initialRecord = null }: { initialRecord?: DemoInstrument | null }) {
  const [latest, setLatest] = useState<DemoInstrument | null>(initialRecord);
  const [loaded, setLoaded] = useState(Boolean(initialRecord));

  useEffect(() => {
    let active = true;

    async function loadLatestPublicRecord() {
      try {
        const response = await fetch("/api/instruments", {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" }
        });
        const payload = (await response.json().catch(() => null)) as InstrumentsResponse | null;
        const newestPublicRecord = payload?.ok && Array.isArray(payload.instruments) ? pickHomepageRecord(payload.instruments) : null;

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

  const createdLabel = formatCreatedAt(latest.createdAt);

  return (
    <CollectibleRecordCard
      record={latest}
      variant="latest"
      eyebrow="Latest public record"
      createdLabel={createdLabel}
      ctaLabel="Open Record"
      secondaryHref="/catalog"
      secondaryLabel="Browse Catalog"
    />
  );
}

function pickHomepageRecord(records: DemoInstrument[]) {
  return records.find((record) => isHomepageSafeRecord(record)) || null;
}

function isHomepageSafeRecord(record: DemoInstrument) {
  return record.safetyStatus !== "lost" && record.safetyStatus !== "stolen";
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
