import type { DemoInstrument } from "./local-demo";

export type PrintMode = "label" | "hangtag" | "handout" | "service" | "qr";
export type PrintSize = "letter" | "a4" | "4x6" | "compact" | "qr25" | "qr32" | "qr38" | "qr381";
export type PrintOrientation = "portrait" | "landscape";

export type FormatConfig = { sizes: PrintSize[]; defaultSize: PrintSize; orientations: PrintOrientation[]; photo: boolean; availability: boolean; attribution: boolean; specifications: boolean; timeline: boolean };

export const printFormats: Record<PrintMode, FormatConfig> = {
  label: { sizes: ["compact"], defaultSize: "compact", orientations: ["portrait"], photo: false, availability: false, attribution: false, specifications: false, timeline: false },
  hangtag: { sizes: ["4x6"], defaultSize: "4x6", orientations: ["portrait", "landscape"], photo: true, availability: true, attribution: true, specifications: true, timeline: false },
  handout: { sizes: ["letter", "a4"], defaultSize: "letter", orientations: ["portrait"], photo: true, availability: true, attribution: true, specifications: true, timeline: true },
  service: { sizes: ["letter", "a4"], defaultSize: "letter", orientations: ["portrait"], photo: true, availability: false, attribution: false, specifications: false, timeline: false },
  qr: { sizes: ["qr25", "qr32", "qr38", "qr381"], defaultSize: "qr381", orientations: ["portrait"], photo: false, availability: false, attribution: false, specifications: false, timeline: false }
};

export function qrSideMillimeters(size: PrintSize) {
  return size === "qr25" ? 25 : size === "qr38" ? 38 : size === "qr381" ? 38.1 : 32;
}

export function printGeometry(size: PrintSize, orientation: PrintOrientation) {
  const qrSide = qrSideMillimeters(size) / 25.4;
  const dimensions = { letter: [8.5, 11], a4: [210 / 25.4, 297 / 25.4], "4x6": [4, 6], compact: [3.5, 2.25], qr25: [qrSide, qrSide], qr32: [qrSide, qrSide], qr38: [qrSide, qrSide], qr381: [qrSide, qrSide] }[size];
  const [width, height] = orientation === "landscape" ? [...dimensions].reverse() : dimensions;
  // QR-only stock already includes the four-module white quiet zone in the asset.
  const margin = size.startsWith("qr") ? 0 : size === "compact" ? 0.1 : size === "4x6" ? 0.2 : 0.3;
  return { width, height, margin, contentWidth: width - margin * 2, contentHeight: height - margin * 2 };
}

type PrintInstrument = Pick<DemoInstrument, "instrumentType" | "finish" | "bodyWood" | "neckWood" | "pickups" | "customFields" | "saleStatus" | "safetyStatus">;

const salePrintLabels = new Set(["asking price", "currency", "store name"]);
const storeMappingLabels = new Set(["store platform", "store item id", "store cart url"]);
const normalizeLabel = (label: string) => label.trim().toLowerCase().replace(/\s+/g, " ");

function printableSaleFacts(instrument: PrintInstrument): [string, string][] {
  if (instrument.saleStatus !== "for_sale" || ["lost", "stolen"].includes(instrument.safetyStatus || "")) return [];
  const read = (label: string) => {
    const fields = (instrument.customFields || []).filter(field => normalizeLabel(field.label) === label);
    return fields.length === 1 ? fields[0].value.trim() : "";
  };
  const amount = read("asking price"), currency = read("currency").toUpperCase(), store = read("store name");
  const facts: [string, string][] = [];
  if (/^(?:0|[1-9]\d{0,8})(?:\.\d{1,3})?$/.test(amount) && Number(amount) > 0 && /^[A-Z]{3}$/.test(currency) && Intl.supportedValuesOf("currency").includes(currency)) {
    const format = new Intl.NumberFormat("en-US", { style: "currency", currency, currencyDisplay: "code" });
    if ((amount.split(".")[1]?.length || 0) <= (format.resolvedOptions().maximumFractionDigits ?? 2)) {
      // One atomic fact: a field cap can never detach the amount from its currency.
      facts.push(["Asking price", format.format(Number(amount))]);
    }
  }
  if (store) facts.push(["Store name", store]);
  return facts;
}

/** Input must already be resolved for the selected document sharing scope. */
export function printSpecifications(instrument: PrintInstrument): [string, string][] {
  const type = (instrument.instrumentType || "").trim();
  const electronics = ["pedal", "amplifier"].includes(type.toLowerCase());
  const fields = instrument.customFields || [];
  const custom: [string, string][] = fields.filter(field => {
    const label = normalizeLabel(field.label);
    return !storeMappingLabels.has(label) && !salePrintLabels.has(label);
  }).map(field => [field.label, field.value]);
  const facts: [string, string | undefined][] = [
    ["Type", type],
    ...printableSaleFacts(instrument),
    ...(electronics ? custom : [["Finish", instrument.finish], ["Body", instrument.bodyWood], ["Neck", instrument.neckWood], ["Pickups", instrument.pickups], ...custom] as [string, string | undefined][]),
    ...(electronics ? [["Finish", instrument.finish]] as [string, string | undefined][] : [])
  ];
  const seen = new Set<string>();
  return facts.flatMap(([label, value]) => {
    const cleanLabel = label.trim(), cleanValue = (value || "").trim();
    const key = cleanLabel.toLowerCase();
    if (!cleanLabel || !cleanValue || seen.has(key)) return [];
    seen.add(key);
    return [[cleanLabel, cleanValue] as [string, string]];
  }).slice(0, 8);
}

export function printPlacement(instrumentType?: string) {
  switch ((instrumentType || "").trim().toLowerCase()) {
    case "pedal": return "Use a case label or tag. Keep controls, jacks and the battery compartment clear.";
    case "amplifier": return "Use a case label or tag. Keep vents, controls and safety markings clear.";
    case "electric guitar":
    case "acoustic guitar":
    case "bass guitar":
    case "other guitar": return "Use a case label or hang tag. Check adhesive compatibility before applying to a guitar, bass or pickguard.";
    default: return "Use a case label or tag. Check the surface and adhesive manufacturer's guidance before applying.";
  }
}

export function hangTagSpecifications(specifications: [string, string][]) {
  // Sale facts are already atomic and prioritized before the specification cap.
  return [...specifications.filter(([label]) => salePrintLabels.has(normalizeLabel(label))),
    ...specifications.filter(([label, value]) => normalizeLabel(label) !== "type" && !salePrintLabels.has(normalizeLabel(label)) && value.length <= 72)].slice(0, 3);
}

export function normalizePrintOptions(mode: PrintMode, size: string | null, orientation: string | null) {
  const config = printFormats[mode];
  return {
    size: (config.sizes as string[]).includes(size || "") ? size as PrintSize : config.defaultSize,
    orientation: (config.orientations as string[]).includes(orientation || "") ? orientation as PrintOrientation : "portrait" as const
  };
}

export function printDetailFacts(condition: string, originality: string, availability: string, includeAvailability: boolean) {
  return [condition, originality, includeAvailability ? availability : ""].filter(Boolean);
}

export function printReadiness(images: { complete: boolean; naturalWidth: number }[], overflowing: boolean, timedOut = false) {
  if (images.some((image) => image.complete && !image.naturalWidth)) return "An image could not load. Choose another photograph or turn Photograph off.";
  if (images.some((image) => !image.complete)) return timedOut ? "A photograph is taking too long to load. Choose another photograph or turn Photograph off." : "Loading the photograph and QR code.";
  if (overflowing) return "This content exceeds one page. Shorten the print title or note, use larger paper, or turn off optional fields.";
  return "Ready to print.";
}
