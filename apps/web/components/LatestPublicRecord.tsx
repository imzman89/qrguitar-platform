"use client";

import { Globe2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { DemoInstrument } from "../lib/local-demo";
import { CollectibleRecordCard } from "./CollectibleRecordCard";
import { selectHomeFeaturedProfile } from "../lib/home-featured-profile";
import { HomeProfileShowcase } from "./HomeProfileShowcase";

type InstrumentsResponse = {
  ok?: boolean;
  instruments?: DemoInstrument[];
};

export function LatestPublicRecord({ initialRecord = null, content, presentation = "card" }: { initialRecord?: DemoInstrument | null; content?: Record<string, string>; presentation?: "card" | "showcase" }) {
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
        const newest = payload?.ok && Array.isArray(payload.instruments) ? (presentation === "showcase" ? selectHomeFeaturedProfile(payload.instruments) : payload.instruments[0] || null) : null;

        if (active && payload?.ok && Array.isArray(payload.instruments)) setLatest(newest);
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
  }, [initialRecord, presentation]);

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

  if (presentation === "showcase") return <HomeProfileShowcase key={latest.qrCode} record={latest} />;

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
