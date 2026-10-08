import { cleanOwnerPublicName } from "./owner-name-consent";
import type {
  CustomDocumentFile,
  CustomProfileLink,
  DemoInstrument,
  ExternalMediaItem,
  OriginalityStatus,
  SaleStatus,
  ServiceHistoryEntry
} from "./local-demo";

export type InstrumentSpecLike = { label: string; value: string };

// Reserved owner purchase fields written by Create and Bulk Import. A Profile
// being listed does not make acquisition/contact metadata part of its public specs.
const OWNER_ONLY_SPEC_LABELS = new Set(["seller / source", "acquired"]);
export function isOwnerOnlyInstrumentSpec(label: string) {
  return OWNER_ONLY_SPEC_LABELS.has(label.trim().toLowerCase().replace(/\s+/g, " "));
}

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
  "electronics",
  "fretwork",
  "structural repair",
  "finish work",
  "amplifier service",
  "modification",
  "restoration",
  "inspection"
]);

export function isServiceHistoryEvent(event: Pick<ServiceHistoryEntry, "category" | "eventType" | "isSystem" | "sourceKind">) {
  if (event.isSystem) return false;
  const kind = String(event.eventType || "").trim().toLowerCase();
  const category = String(event.category || kind).trim().toLowerCase();
  const excluded = ["ownership", "purchase", "sale", "verification", "safety", "media", "documentation", "profile_created", "creation", "registration", "appraisal"];
  if (excluded.includes(kind) || excluded.includes(category)) return false;
  if (SERVICE_HISTORY_CATEGORIES.has(category) || SERVICE_HISTORY_CATEGORIES.has(kind)) return true;
  return event.sourceKind === "provider_submitted_owner_approved" && kind === "other" && category === "other";
}

export type RecordedServiceDate = { date: string; datePrecision: "day" | "month" | "year" };

export function normalizeRecordedServiceDate(value: unknown, precision: unknown): RecordedServiceDate | undefined {
  if (typeof value !== "string" || !["day", "month", "year"].includes(String(precision))) return undefined;
  const pattern = precision === "year" ? /^\d{4}$/ : precision === "month" ? /^\d{4}-\d{2}$/ : /^\d{4}-\d{2}-\d{2}$/;
  if (!pattern.test(value) && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const anchor = value.length === 4 ? value + "-01-01" : value.length === 7 ? value + "-01" : value;
  const parsed = new Date(anchor + "T00:00:00.000Z");
  if (Number(anchor.slice(0, 4)) < 1 || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== anchor) return undefined;
  const length = precision === "year" ? 4 : precision === "month" ? 7 : 10;
  const date = value.slice(0, length);
  if (date > new Date().toISOString().slice(0, length)) return undefined;
  return { date, datePrecision: precision as RecordedServiceDate["datePrecision"] };
}

export function getLatestRecordedServiceDate(
  events: readonly Pick<ServiceHistoryEntry, "serviceDate" | "datePrecision" | "category" | "eventType" | "isSystem" | "sourceKind">[],
  projected?: { date?: unknown; datePrecision?: unknown }
): RecordedServiceDate | undefined {
  const dates = [
    normalizeRecordedServiceDate(projected?.date, projected?.datePrecision),
    ...events.filter(isServiceHistoryEvent).map((event) => normalizeRecordedServiceDate(event.serviceDate, event.datePrecision))
  ].filter((date): date is RecordedServiceDate => Boolean(date));
  // Ordering keys only: overlapping periods retain their coarser precision,
  // never an inferred January 1 or first-of-month service day.
  const endKey = (date: RecordedServiceDate) => date.date + (date.datePrecision === "year" ? "-99-99" : date.datePrecision === "month" ? "-99" : "");
  return dates.reduce<RecordedServiceDate | undefined>((latest, date) => !latest || endKey(date) > endKey(latest) ? date : latest, undefined);
}

export function formatRecordedServiceDate(value: RecordedServiceDate): string {
  if (value.datePrecision === "year") return value.date;
  const anchor = value.datePrecision === "month" ? value.date + "-01" : value.date;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC", month: value.datePrecision === "month" ? "long" : "short", year: "numeric",
    ...(value.datePrecision === "day" ? { day: "numeric" } : {})
  }).format(new Date(anchor + "T00:00:00.000Z"));
}

export function isProfileCreationEvent(event: Pick<ServiceHistoryEntry, "eventType" | "title">) {
  return String(event.eventType || "").trim().toLowerCase() === "profile_created" || /^(qrguitar )?profile created$/i.test(event.title.trim());
}

export function isRecordedOwnershipEvent(event: Pick<ServiceHistoryEntry, "eventType" | "isSystem">) {
  return event.isSystem === true && String(event.eventType || "").trim().toLowerCase() === "ownership";
}

export function isMeaningfulTimelineEvent(event: ServiceHistoryEntry) {
  return !isProfileCreationEvent(event) && (!event.isSystem || isRecordedOwnershipEvent(event)) && !isServiceHistoryEvent(event);
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
      title: category === "Service" ? "Service history" : category,
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

export type InstrumentPresentationScope = "public" | "owner";

export type InstrumentPresentation = {
  scope: InstrumentPresentationScope;
  photos: string[];
  documents: CustomDocumentFile[];
  supplementalMedia: ExternalMediaItem[];
  timelineEvents: ServiceHistoryEntry[];
  meaningfulTimelineEvents: ServiceHistoryEntry[];
  serviceEntries: ServiceHistoryEntry[];
  profileOrigin: ServiceHistoryEntry | null;
  serialNumber: string;
  counts: {
    photos: number;
    documents: number;
    supplementalMedia: number;
    timeline: number;
    service: number;
    privateDocuments: number;
  };
  tabs: {
    overview: true;
    specifications: boolean;
    timeline: boolean;
    service: boolean;
    media: boolean;
    documents: boolean;
  };
};

export function isAllowedSupplementalMedia(item: ExternalMediaItem) {
  let parsed: URL;
  try {
    parsed = new URL(item.canonicalUrl);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:") return false;
  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");

  if (item.provider === "youtube") {
    return hostname === "youtube.com" || hostname === "youtu.be" || hostname === "youtube-nocookie.com";
  }
  if (item.provider === "vimeo") {
    return hostname === "vimeo.com" || hostname === "player.vimeo.com";
  }
  if (item.provider === "audio") {
    return /\.(mp3|m4a|aac|wav|ogg|oga)(?:$|[?#])/i.test(parsed.pathname + parsed.search + parsed.hash);
  }

  return item.provider === "link";
}

export function resolveInstrumentPresentation(
  instrument: DemoInstrument,
  scope: InstrumentPresentationScope = "public"
): InstrumentPresentation {
  const isOwner = scope === "owner";
  const documents = (instrument.documentFiles || []).filter((document) =>
    isOwner || document.visibility === "public"
  );
  const supplementalMedia = (instrument.externalMedia || []).filter((item) =>
    (isOwner || item.isPublic === true) && isAllowedSupplementalMedia(item)
  );
  const timelineEvents = getTimelineEvents(instrument).filter((event) =>
    isOwner || event.isPublic === true
  );
  const meaningfulTimelineEvents = timelineEvents.filter(isMeaningfulTimelineEvent);
  const recordedOwnershipCount = meaningfulTimelineEvents.filter(isRecordedOwnershipEvent).length;
  const legacyOwnershipCount = Math.max(0, Number(instrument.ownershipTransferCount || 0) - recordedOwnershipCount);
  const profileOrigin = timelineEvents.find(isProfileCreationEvent) || null;
  const serviceEntries = getServiceHistoryEntries(instrument).filter((event) =>
    isOwner || event.isPublic === true
  );
  const serialNumber = isOwner || instrument.showSerialPublic === true
    ? String(instrument.serial || "").trim()
    : "";
  const photos = getProfilePhotoUrls(instrument).slice(0, 20);
  const specifications = [
    instrument.brand,
    instrument.model,
    instrument.year,
    instrument.instrumentType,
    instrument.finish,
    instrument.bodyWood,
    instrument.neckWood,
    instrument.pickups,
    ...(instrument.customFields || []).map((field) => field.value)
  ].some((value) => Boolean(String(value || "").trim()));
  const privateDocuments = isOwner
    ? (instrument.documentFiles || []).filter((document) => document.visibility !== "public").length
    : 0;

  return {
    scope,
    photos,
    documents,
    supplementalMedia,
    timelineEvents,
    meaningfulTimelineEvents,
    serviceEntries,
    profileOrigin,
    serialNumber,
    counts: {
      photos: photos.length,
      documents: documents.length,
      supplementalMedia: supplementalMedia.length,
      timeline: meaningfulTimelineEvents.length + legacyOwnershipCount,
      service: serviceEntries.length,
      privateDocuments
    },
    tabs: {
      overview: true,
      specifications,
      timeline: meaningfulTimelineEvents.length > 0 || Number(instrument.ownershipTransferCount || 0) > 0,
      service: serviceEntries.length > 0,
      media: supplementalMedia.length > 0,
      documents: documents.length > 0
    }
  };
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
  return sanitizePublicInstrumentInternal(instrument,false);
}
export function sanitizePublicInstrumentWithConfirmedOwnerNames(instrument: DemoInstrument): DemoInstrument {
  return sanitizePublicInstrumentInternal(instrument,true);
}
function sanitizePublicInstrumentInternal(instrument: DemoInstrument, includeConfirmedOwnerNames: boolean): DemoInstrument {
  const latestService = getLatestRecordedServiceDate([...(instrument.timelineEvents || []), ...(instrument.serviceEvents || [])], {
    date: instrument.latestServiceDate, datePrecision: instrument.latestServiceDatePrecision
  });
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
    delete (publicInstrument as Partial<DemoInstrument>).serial;
  }

  delete publicInstrument.latestServiceDate;
  delete publicInstrument.latestServiceDatePrecision;
  if (latestService) {
    publicInstrument.latestServiceDate = latestService.date;
    publicInstrument.latestServiceDatePrecision = latestService.datePrecision;
  }

  publicInstrument.owner = publicInstrument.publicCollection?.publicName || "Collection";
  publicInstrument.customFields = (publicInstrument.customFields || [])
    .filter((field) => !isOwnerOnlyInstrumentSpec(field.label));

  publicInstrument.documentFiles = (publicInstrument.documentFiles || [])
    .filter((document) => document.visibility === "public")
    .map(({ privateNotes: _privateNotes, ...document }) => document);

  publicInstrument.timelineEvents = getTimelineEvents(publicInstrument)
    .filter((event) => event.isPublic === true)
    .map(({ privateNotes: _privateNotes, canEdit: _canEdit, lockedReason: _lockedReason, previousOwnerPublicName, ...event }) => ({
      ...event,
      ...(includeConfirmedOwnerNames && event.isSystem === true && event.eventType === "ownership" && cleanOwnerPublicName(previousOwnerPublicName)
        ? {previousOwnerPublicName: cleanOwnerPublicName(previousOwnerPublicName)} : {})
    }));

  publicInstrument.serviceEvents = publicInstrument.timelineEvents.filter(isServiceHistoryEvent);

  publicInstrument.externalMedia = (publicInstrument.externalMedia || []).filter((item) => item.isPublic === true);

  return publicInstrument;
}
