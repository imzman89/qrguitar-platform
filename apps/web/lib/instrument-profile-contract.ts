import type { CustomProfileLink, DemoInstrument, OriginalityStatus, SaleStatus, ServiceHistoryEntry } from "./local-demo";

export type InstrumentSpecLike = { label: string; value: string };

const MANAGED_SPEC_LABELS = new Set([
  "condition",
  "type",
  "finish",
  "sale status",
  "availability",
  "originality"
]);

const PROFILE_LINK_SPEC_PREFIX = "Profile link: ";

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
  return MANAGED_SPEC_LABELS.has(label.trim().toLowerCase()) || isProfileLinkSpec(label);
}

export function isProfileLinkSpec(label: string) {
  return label.trim().toLowerCase().startsWith(PROFILE_LINK_SPEC_PREFIX.toLowerCase());
}

export function profileLinkSpecLabel(label: string) {
  return `${PROFILE_LINK_SPEC_PREFIX}${label.trim() || "Link"}`;
}

export function profileLinksFromSpecs(specs: InstrumentSpecLike[]): CustomProfileLink[] {
  return specs
    .filter((spec) => isProfileLinkSpec(spec.label) && /^https:\/\//i.test(spec.value.trim()))
    .slice(0, 6)
    .map((spec, index) => ({
      id: `profile-link-${index}`,
      label: spec.label.trim().slice(PROFILE_LINK_SPEC_PREFIX.length).trim() || "Link",
      url: spec.value.trim()
    }));
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

export function isLegacyServiceField(field: InstrumentSpecLike) {
  const label = field.label.trim().toLowerCase();
  const value = field.value.trim();
  if (!value) return false;
  if (label === "service notes" || label === "service note" || label === "setup notes" || label === "repair notes") return true;
  return label === "specs notes" && /\b(setup|service|repair|restor|inspection|fretwork|electronics)\b/i.test(value);
}

export function getServiceHistoryEntries(
  instrument: Pick<DemoInstrument, "timelineEvents" | "serviceEvents" | "customFields" | "createdAt">
) {
  const structured = getTimelineEvents(instrument).filter(isServiceHistoryEvent);
  const existingText = new Set(structured.flatMap((event) => [event.title, event.publicDescription || ""])
    .map((value) => value.trim().toLowerCase()).filter(Boolean));
  const legacy = (instrument.customFields || []).filter(isLegacyServiceField).filter((field) => {
    const value = field.value.trim().toLowerCase();
    return !existingText.has(value);
  }).map((field): ServiceHistoryEntry => {
    const value = field.value.trim();
    const category = /\bsetup\b/i.test(value) ? "Setup" : /\brepair\b/i.test(value) ? "Repair" : "Service";
    return {
      id: `legacy-service-${field.id}`,
      datePrecision: "unknown",
      category,
      eventType: category.toLowerCase(),
      title: `${category} note`,
      publicDescription: value,
      isPublic: true,
      isSystem: false,
      createdAt: instrument.createdAt
    };
  });
  return [...structured, ...legacy];
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
