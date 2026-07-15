import type { DemoInstrument, OriginalityStatus, SaleStatus } from "./local-demo";

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

  publicInstrument.serviceEvents = (publicInstrument.serviceEvents || [])
    .filter((event) => event.isPublic === true)
    .map(({ privateNotes: _privateNotes, canEdit: _canEdit, lockedReason: _lockedReason, ...event }) => event);

  publicInstrument.externalMedia = (publicInstrument.externalMedia || []).filter((item) => item.isPublic === true);

  return publicInstrument;
}
