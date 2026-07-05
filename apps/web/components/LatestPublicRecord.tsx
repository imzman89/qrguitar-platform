"use client";

import { Globe2 } from "lucide-react";
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
          if (newestPublicRecord || !initialRecord) {
            setLatest(newestPublicRecord);
          }
        }
      } catch {
        if (active && !initialRecord) {
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
      <article className="latest-record-message" aria-label="Latest QRguitar Profile">
        <Globe2 size={14} />
        <span>Loading latest QRguitar Profile...</span>
      </article>
    );
  }

  if (!latest) {
    return (
      <article className="latest-record-message" aria-label="Latest QRguitar Profile">
        <Globe2 size={14} />
        <span>QRguitar Profiles are loading.</span>
      </article>
    );
  }

  const createdLabel = formatCreatedAt(latest.createdAt);

  return (
    <CollectibleRecordCard
      record={latest}
      variant="latest"
      eyebrow="Latest QRguitar Profile"
      createdLabel={createdLabel}
      ctaLabel="Open Record"
    />
  );
}

function pickHomepageRecord(records: DemoInstrument[]) {
  return records[0] || null;
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
