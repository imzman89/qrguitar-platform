import { ArrowRight, Globe2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { instrumentDisplayName, type DemoInstrument } from "../lib/local-demo";
import { formatRecordLocation } from "../lib/record-location";

type HomepageRecordSpotlightProps = {
  promotedQrCode?: string;
};

function normalizeCode(value: string) {
  return String(value || "").trim().toUpperCase();
}

export function HomepageRecordSpotlight({ promotedQrCode = "" }: HomepageRecordSpotlightProps) {
  const [records, setRecords] = useState<DemoInstrument[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadRecords() {
      try {
        const response = await fetch("/api/instruments", { cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as {
          ok?: boolean;
          instruments?: DemoInstrument[];
        } | null;

        if (cancelled) {
          return;
        }

        if (!response.ok || !payload?.ok || !Array.isArray(payload.instruments)) {
          return;
        }

        setRecords(dedupeByCodeAndDate(payload.instruments));
      } catch {
        return;
      }
    }

    void loadRecords();

    return () => {
      cancelled = true;
    };
  }, []);

  const orderedRecords = useMemo(() => {
    if (!records.length) {
      return { featured: null as DemoInstrument | null };
    }

    const latest = records[0];
    const promotedCode = normalizeCode(promotedQrCode);
    const promotedMatch = promotedCode
      ? records.find((record) => normalizeCode(record.qrCode) === promotedCode)
      : null;
    const isPromotedLatest = !!promotedMatch && normalizeCode(promotedMatch.qrCode) === normalizeCode(latest.qrCode);
    const featuredCandidate = promotedMatch && !isPromotedLatest ? promotedMatch : records[1] || null;

    return {
      featured: featuredCandidate
    };
  }, [records, promotedQrCode]);

  const spotlightRecord = orderedRecords.featured ?? null;

  if (!spotlightRecord) {
    return null;
  }

  return (
    <article className="homepage-record-spotlight" aria-label="Secondary spotlight record">
      <div
        className="homepage-record-hero app-panel"
        style={spotlightRecord?.heroImageDataUrl ? { backgroundImage: `url(${spotlightRecord.heroImageDataUrl})` } : undefined}
      >
        <div className="homepage-record-meta">
          <span><Globe2 size={14} /> {promotedQrCode ? "Promoted spotlight" : "Latest public records"}</span>
          <span>{spotlightRecord ? spotlightRecord.visibility === "private" ? "Private" : "Public" : "Ready"}</span>
        </div>

        <div className="homepage-record-body">
          <h3>{instrumentDisplayName(spotlightRecord)}</h3>
          <p>{spotlightRecord.brand} - {spotlightRecord.serial || spotlightRecord.model}</p>
          <div className="homepage-record-facts">
            <span>{spotlightRecord.qrCode}</span>
            <span>{spotlightRecord.year || "Year unknown"}</span>
            <span>{formatRecordLocation(spotlightRecord) || "Location private"}</span>
          </div>
          <Link className="button" href={spotlightRecord.permanentPath || `/i/${spotlightRecord.qrCode}`}>
            Open record <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </article>
  );
}

  function parseCreatedAt(value: string) {
  const time = Date.parse(value || "");
  return Number.isFinite(time) ? time : 0;
}

function dedupeByCodeAndDate(instruments: DemoInstrument[]) {
  const latestByCode = new Map<string, DemoInstrument>();

  for (const record of instruments.filter((instrument) => instrument?.qrCode)) {
    const key = normalizeCode(record.qrCode);
    if (!key) {
      continue;
    }

    const existing = latestByCode.get(key);
    const candidate = {
      ...record,
      qrCode: key,
      permanentPath: record.permanentPath || `/i/${key}`,
      createdAt: record.createdAt || new Date(0).toISOString()
    };

    if (
      !existing ||
      parseCreatedAt(candidate.createdAt) > parseCreatedAt(existing.createdAt || "")
    ) {
      latestByCode.set(key, candidate);
    }
  }

  return Array.from(latestByCode.values()).sort(
    (first, second) => parseCreatedAt(second.createdAt) - parseCreatedAt(first.createdAt)
  );
}
