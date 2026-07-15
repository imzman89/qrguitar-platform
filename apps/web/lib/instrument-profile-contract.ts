import type { DemoInstrument, OriginalityStatus, SaleStatus, ServiceHistoryEntry } from "./local-demo";

export type InstrumentSpecLike = { label: string; value: string };

const MANAGED_SPEC_LABELS = new Set([
  "condition",
  "type",
  "finish",
  "sale status",
  "availability",
  "originality"
]);

export function normalizeSerialBuildId(value: string) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^QRG-/, "")
    .replace(/[^A-Z0-9]/g, "");
}

export function specValue(specs: InstrumentSpecLike[], label: string) {
  const normalizedLabel = label.trim().toLowerCase();
  return specs.find((spec) => spec.label.trim().toLowerCase() === normalizedLabel)?.value?.trim() || "";
}

export function isManagedInstrumentSpec(label: string) {
  return MANAGED_SPEC_LABELS.has(label.trim().toLowerCase());
}

export function availabilityFromSpecs(specs: InstrumentSpecLike[]): SaleStatus {
  const value = (specValue(specs, "Availability") || specValue(specs, "Sale status"))
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return value === "for_sale" ? "for_sale" : "not_for_sale";
}

export function originalityFromSpecs(specs: InstrumentSpecLike[]): OriginalityStatus {
  const value = specValue(specs, "Originality").toLowerCase().replace(/[\s-]+/g, "_");
  if (value === "all_original") return "all_original";
  if (value === "modified") return "modified";
  return "unknown";
}

export function availabilityLabel(value?: SaleStatus) {
  return value === "for_sale" ? "For Sale" : "Not for Sale";
}

export function originalityLabel(value?: OriginalityStatus) {
  if (value === "all_original") return "All Original";
  if (value === "modified") return "Modified";
  return "Not Specified";
}

const SERVICE_HISTORY_CATEGORIES = new Set([
  "service",
  "setup",
  "repair",
  "modification",
  "restoration",
  "inspection",
  "appraisal"
]);

export function isServiceHistoryEvent(event: Pick<ServiceHistoryEntry, "category" | "eventType" | "isSystem">) {
  if (event.isSystem) return false;
  const category = String(event.category || event.eventType || "").trim().toLowerCase();
  return SERVICE_HISTORY_CATEGORIES.has(category);
}

export function getTimelineEvents(instrument: Pick<DemoInstrument, "timelineEvents" | "serviceEvents">) {
  const events = [...(instrument.timelineEvents || []), ...(instrument.serviceEvents || [])];
  const seen = new Set<string>();
  return events.filter((event) => {
    const key = event.id || [event.title, event.serviceDate, event.createdAt].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getServiceHistoryEntries(instrument: Pick<DemoInstrument, "timelineEvents" | "serviceEvents">) {
  return getTimelineEvents(instrument).filter(isServiceHistoryEvent);
}

export function getProfilePhotoUrls(instrument: Pick<DemoInstrument, "heroImageDataUrl" | "galleryImageDataUrls">) {
  return Array.from(new Set([
    instrument.heroImageDataUrl,
    ...(instrument.galleryImageDataUrls || [])
  ].filter((value): value is string => Boolean(value))));
}

export function getPublicDocumentCount(instrument: Pick<DemoInstrument, "documentFiles">) {
  return (instrument.documentFiles || []).filter((document) => document.visibility === "public").length;
}

export function getProfileCompleteness(instrument: DemoInstrument) {
  const checks = {
    identity: Boolean(instrument.serial?.trim()) || instrument.serialNotUsed === true,
    photo: getProfilePhotoUrls(instrument).length > 0,
    description: Boolean(instrument.summary?.trim()),
    history: getTimelineEvents(instrument).some((event) => !event.isSystem),
    availability: instrument.saleStatus === "for_sale" || instrument.saleStatus === "not_for_sale",
    originality: instrument.originalityStatus === "all_original" || instrument.originalityStatus === "modified" || instrument.originalityStatus === "unknown",
    visibility: instrument.visibility === "public" || instrument.visibility === "private" || instrument.visibility === "unlisted"
  };
  const completed = Object.values(checks).filter(Boolean).length;
  const total = Object.keys(checks).length;
  return { checks, completed, total, percent: Math.round((completed / total) * 100) };
}

export function sanitizePublicInstrument(instrument: DemoInstrument): DemoInstrument {
  const {
    ownerUserEmail: _ownerUserEmail,
    internalVerificationNote: _internalVerificationNote,
    internalAuthenticityNote: _internalAuthenticityNote,
    safetyNote: _safetyNote,
    collectionRemovedAt: _collectionRemovedAt,
    collectionRemovedReason: _collectionRemovedReason,
    ...publicInstrument
  } = instrument;

  if (publicInstrument.showSerialPublic !== true) {
    publicInstrument.serial = "";
  }

  publicInstrument.documentFiles = (publicInstrument.documentFiles || [])
    .filter((document) => document.visibility === "public")
    .map(({ privateNotes: _privateNotes, ...document }) => document);

  publicInstrument.timelineEvents = getTimelineEvents(publicInstrument)
    .filter((event) => event.isPublic === true)
    .map(({ privateNotes: _privateNotes, canEdit: _canEdit, lockedReason: _lockedReason, ...event }) => event);

  publicInstrument.serviceEvents = publicInstrument.timelineEvents.filter(isServiceHistoryEvent);

  publicInstrument.externalMedia = (publicInstrument.externalMedia || []).filter((item) => item.isPublic === true);

  return publicInstrument;
}
