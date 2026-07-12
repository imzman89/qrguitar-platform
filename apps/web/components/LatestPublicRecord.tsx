"use client";

import { ArrowRight, Camera, Globe2, ShieldCheck, Siren } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getInstrumentCondition,
  getInstrumentVerificationStatus,
  instrumentDisplayName,
  instrumentSubtitle,
  instrumentToProfileUrl,
  type DemoInstrument
} from "../lib/local-demo";
import { RecordShareButton } from "./RecordShareButton";

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

  return <HomepageLatestProfileCard record={latest} />;
}

function pickHomepageRecord(records: DemoInstrument[]) {
  return records[0] || null;
}

function HomepageLatestProfileCard({ record }: { record: DemoInstrument }) {
  const title = instrumentDisplayName(record);
  const profileUrl = instrumentToProfileUrl(record);
  const imageUrl = record.heroImageDataUrl || record.galleryImageDataUrls?.find(Boolean) || "";
  const condition = getInstrumentCondition(record);
  const verificationStatus = getInstrumentVerificationStatus(record);
  const authenticityStatus = record.authenticityStatus === "confirmed" ? "confirmed" : "unconfirmed";
  const safetyStatus = record.safetyStatus === "lost" || record.safetyStatus === "stolen" || record.safetyStatus === "recovered"
    ? record.safetyStatus
    : "clear";
  const photoCount = Array.from(new Set([record.heroImageDataUrl, ...(record.galleryImageDataUrls || [])].filter(Boolean))).length;

  return (
    <article className="latest-profile-card" aria-label={`Latest QRguitar Profile: ${title}`}>
      <Link className="latest-profile-card-link" href={profileUrl} aria-label={`Open ${title} profile`}>
        <div className="latest-profile-card-media">
          {imageUrl ? (
            <img
              className="latest-profile-card-image"
              src={imageUrl}
              alt={`${title} main photo`}
              loading="eager"
              decoding="async"
            />
          ) : (
            <div className="latest-profile-card-empty-media">
              <strong>QRguitar</strong>
              <span>No profile photo yet</span>
            </div>
          )}

          <div className="latest-profile-card-topline">
            <span className="latest-profile-card-eyebrow"><Globe2 size={12} /> Latest Profile</span>
          </div>
          <span className="latest-profile-card-code">{record.qrCode}</span>
        </div>

        <div className="latest-profile-card-content">
          <div className="latest-profile-card-heading">
            <h3>{title}</h3>
            <p>{instrumentSubtitle(record)}</p>
          </div>

          <div className="record-badge-row latest-profile-card-badges" aria-label="Profile status">
            {record.showVerificationBadge !== false ? (
              <span className={`record-badge ${verificationStatus === "verified" ? "record-badge--verified" : "record-badge--unverified"}`}>
                <ShieldCheck size={12} /> <span className="record-badge-text">{verificationStatus === "verified" ? "Verified by QRguitar" : "Unverified"}</span>
              </span>
            ) : null}
            {record.showAuthenticityBadge !== false ? (
              <span className={`record-badge ${authenticityStatus === "confirmed" ? "record-badge--auth-confirmed" : "record-badge--auth-unconfirmed"}`}>
                <ShieldCheck size={12} /> <span className="record-badge-text">{authenticityStatus === "confirmed" ? "Authenticity Confirmed" : "Authenticity Unconfirmed"}</span>
              </span>
            ) : null}
            {safetyStatus !== "clear" ? (
              <span className={`record-badge ${safetyStatus === "recovered" ? "record-badge--recovered" : "record-badge--safety"}`}>
                <Siren size={12} /> <span className="record-badge-text">{safetyStatusLabel(safetyStatus)}</span>
              </span>
            ) : null}
          </div>

          <div className="latest-profile-card-facts">
            <span>{condition === "new" ? "New" : "Used"}</span>
            {photoCount ? <span><Camera size={12} /> {photoCount} photos</span> : null}
          </div>

          <span className="latest-profile-card-cta">Open Record <ArrowRight size={14} /></span>
        </div>
      </Link>

      <RecordShareButton className="latest-profile-card-share" code={record.qrCode} title={title} />
    </article>
  );
}

function safetyStatusLabel(status: "lost" | "stolen" | "recovered" | "clear") {
  if (status === "lost") {
    return "Reported Lost";
  }

  if (status === "stolen") {
    return "Reported Stolen";
  }

  if (status === "recovered") {
    return "Recovered";
  }

  return "No Alert";
}
