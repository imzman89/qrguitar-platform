import { resolveInstrumentPresentation } from "./instrument-profile-contract";
import {
  instrumentDisplayName,
  instrumentToProfileUrl,
  type DemoInstrument
} from "./local-demo";
import { formatRecordLocation } from "./record-location";

export type CollectibleCardData = {
  code: string;
  profileUrl: string;
  typeLabel: string;
  title: string;
  factLine: string;
  summary: string;
  images: string[];
  publicSerial: string;
  photoCount: number;
  publicDocumentCount: number;
  publicHistoryCount: number;
  collection: DemoInstrument["publicCollection"] | null;
};

export function resolveCollectibleCard(record: DemoInstrument): CollectibleCardData {
  const presentation = resolveInstrumentPresentation(record, "public");
  const images = presentation.photos;
  const factLine = [record.brand, record.year, formatRecordLocation(record)]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(" \u2022 ");

  return {
    code: record.qrCode,
    profileUrl: instrumentToProfileUrl(record),
    typeLabel: String(record.instrumentType || "").trim() || "Profile",
    title: instrumentDisplayName(record),
    factLine,
    summary: cleanCardSummary(record.summary),
    images,
    publicSerial: presentation.serialNumber,
    photoCount: presentation.counts.photos,
    publicDocumentCount: presentation.counts.documents,
    publicHistoryCount: presentation.counts.timeline + presentation.counts.service,
    collection: record.publicCollection || null
  };
}

function cleanCardSummary(summary?: string | null) {
  const value = String(summary || "").trim();
  if (!value) return "";
  if (/^QRguitar Profile with photos, specs, and instrument details\.?$/i.test(value)) return "";
  if (/^Public QRguitar record\b/i.test(value) || /\bpublic record(s)?\b/i.test(value)) return "";
  return value;
}
