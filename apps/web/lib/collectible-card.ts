import { getProfilePhotoUrls, getPublicDocumentCount } from "./instrument-profile-contract";
import {
  instrumentDisplayName,
  instrumentToProfileUrl,
  type DemoInstrument
} from "./local-demo";
import { formatRecordLocation } from "./record-location";

export type CollectibleCardData = {
  code: string;
  profileUrl: string;
  title: string;
  factLine: string;
  summary: string;
  images: string[];
  publicSerial: string;
  photoCount: number;
  publicDocumentCount: number;
  collection: DemoInstrument["publicCollection"] | null;
};

export function resolveCollectibleCard(record: DemoInstrument): CollectibleCardData {
  const images = getProfilePhotoUrls(record);
  const factLine = [record.brand, record.year, formatRecordLocation(record)]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(" \u2022 ");

  return {
    code: record.qrCode,
    profileUrl: instrumentToProfileUrl(record),
    title: instrumentDisplayName(record),
    factLine,
    summary: cleanCardSummary(record.summary),
    images,
    publicSerial: record.showSerialPublic === true ? String(record.serial || "").trim() : "",
    photoCount: images.length,
    publicDocumentCount: getPublicDocumentCount(record),
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
