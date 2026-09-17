export type PrintMode = "label" | "hangtag" | "handout" | "service";
export type PrintSize = "letter" | "a4" | "4x6" | "compact";
export type PrintOrientation = "portrait" | "landscape";

export type FormatConfig = { sizes: PrintSize[]; defaultSize: PrintSize; orientations: PrintOrientation[]; photo: boolean; availability: boolean; attribution: boolean; specifications: boolean; timeline: boolean };

export const printFormats: Record<PrintMode, FormatConfig> = {
  label: { sizes: ["letter", "a4", "compact"], defaultSize: "letter", orientations: ["portrait"], photo: false, availability: false, attribution: false, specifications: false, timeline: false },
  hangtag: { sizes: ["letter", "a4", "4x6"], defaultSize: "letter", orientations: ["portrait", "landscape"], photo: true, availability: true, attribution: true, specifications: false, timeline: false },
  handout: { sizes: ["letter", "a4"], defaultSize: "letter", orientations: ["portrait"], photo: true, availability: true, attribution: true, specifications: true, timeline: true },
  service: { sizes: ["letter", "a4"], defaultSize: "letter", orientations: ["portrait"], photo: true, availability: false, attribution: false, specifications: false, timeline: false }
};

export function printGeometry(size: PrintSize, orientation: PrintOrientation) {
  const dimensions = { letter: [8.5, 11], a4: [210 / 25.4, 297 / 25.4], "4x6": [4, 6], compact: [3.5, 2.25] }[size];
  const [width, height] = orientation === "landscape" ? [...dimensions].reverse() : dimensions;
  const margin = size === "compact" ? 0.1 : size === "4x6" ? 0.2 : 0.3;
  return { width, height, margin, contentWidth: width - margin * 2, contentHeight: height - margin * 2 };
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
