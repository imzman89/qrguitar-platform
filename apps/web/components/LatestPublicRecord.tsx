"use client";
import { useUiText } from "./UiTextProvider";


import { Globe2 } from "lucide-react";
import { requestPublicProfiles } from "../lib/public-profile-request";
import { useEffect, useState } from "react";
import type { DemoInstrument } from "../lib/local-demo";
import { CollectibleRecordCard } from "./CollectibleRecordCard";
import { selectHomeFeaturedProfile } from "../lib/home-featured-profile";
import { HomeProfileShowcase } from "./HomeProfileShowcase";

export function LatestPublicRecord({ initialRecord = null, content, presentation = "card" }: { initialRecord?: DemoInstrument | null; content?: Record<string, string>; presentation?: "card" | "showcase" }) {
  const ui = useUiText("components.LatestPublicRecord");
  const [latest, setLatest] = useState<DemoInstrument | null>(initialRecord);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(Boolean(initialRecord));

  useEffect(() => {
    let active = true;

    async function loadLatestProfile() {
      try {
        const records = await requestPublicProfiles();
        const newest = presentation === "showcase" ? selectHomeFeaturedProfile(records) : records[0] || null;
        if (active) { setLatest(newest); setFailed(false); }

      } catch {
        if (active) setFailed(true);
      } finally {
        if (active) setLoaded(true);
      }
    }

    void loadLatestProfile();
    return () => {
      active = false;
    };
  }, [initialRecord, presentation, attempt]);

  if (!loaded) {
    return <div className="latest-record-card--skeleton" aria-label={ui("ui.components.LatestPublicRecord.feef6ffa93b4", "Loading latest QRguitar Profile")} aria-busy="true" />;
  }

  if (!latest && failed) return <article className="latest-record-message" role="alert">
    <span>{ui("ui.components.LatestPublicRecord.unavailable", "The Profile example is temporarily unavailable.")}</span>
    <button className="button secondary" type="button" onClick={() => { setLoaded(false); setAttempt(current => current + 1); }}>{ui("ui.components.LatestPublicRecord.retry", "Retry")}</button>
  </article>;

  if (!latest) {
    return (
      <article className="latest-record-message" aria-label={ui("ui.components.LatestPublicRecord.b4a345555f15", "Latest QRguitar Profile")}>
        <Globe2 size={14} />
        <span>{ui("ui.components.LatestPublicRecord.bf94b5d71589", "No public Profiles yet.")}</span>
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
