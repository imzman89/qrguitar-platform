"use client";

import { Globe2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { DemoInstrument } from "../lib/local-demo";
import { CollectibleRecordCard } from "./CollectibleRecordCard";

type InstrumentsResponse = {
  ok?: boolean;
  instruments?: DemoInstrument[];
};

export function LatestPublicRecord({ initialRecord = null, content }: { initialRecord?: DemoInstrument | null; content?: Record<string, string> }) {
  const [latest, setLatest] = useState<DemoInstrument | null>(initialRecord);
  const [loaded, setLoaded] = useState(Boolean(initialRecord));

  useEffect(() => {
    let active = true;

    async function loadLatestProfile() {
      try {
        const response = await fetch("/api/instruments", {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" }
        });
        const payload = (await response.json().catch(() => null)) as InstrumentsResponse | null;
        const newest = payload?.ok && Array.isArray(payload.instruments) ? payload.instruments[0] || null : null;

        if (active && (newest || !initialRecord)) setLatest(newest);
      } catch {
        if (active && !initialRecord) setLatest(null);
      } finally {
        if (active) setLoaded(true);
      }
    }

    void loadLatestProfile();
    return () => {
      active = false;
    };
  }, [initialRecord]);

  if (!loaded) {
    return <div className="latest-record-card--skeleton" aria-label="Loading latest QRguitar Profile" aria-busy="true" />;
  }

  if (!latest) {
    return (
      <article className="latest-record-message" aria-label="Latest QRguitar Profile">
        <Globe2 size={14} />
        <span>No public Profiles yet.</span>
      </article>
    );
  }

  return (
    <CollectibleRecordCard
      record={latest}
      variant="latest"
      eyebrow="Latest QRguitar Profile"
      ctaLabel="Open Profile"
      content={content}
    />
  );
}
