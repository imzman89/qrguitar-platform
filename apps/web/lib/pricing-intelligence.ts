import { demoInstrument, type DemoInstrument } from "./local-demo";

export type ComparableSale = {
  id: string;
  instrumentQrCode: string;
  title: string;
  price: number;
  currency: "USD";
  date: string;
  condition: "new" | "excellent" | "very-good" | "good" | "fair";
  sourceType: "verified-qrguitar-sale" | "sold-comp" | "active-listing" | "asking-price" | "builder-msrp" | "manual-shop-comp";
  sourceLabel: string;
  notes?: string;
};

export type MarketEstimate = {
  low: number | null;
  fair: number | null;
  high: number | null;
  average: number | null;
  median: number | null;
  trimmedAverage: number | null;
  confidence: "Needs fresh comps" | "Low" | "Moderate" | "High";
  compCount: number;
  soldCompCount: number;
  activeListingCount: number;
  evidenceFound: string[];
  missingEvidence: string[];
  valueUp: string[];
  valueDown: string[];
  notes: string;
  soldComps: ComparableSale[];
  activeListings: ComparableSale[];
};

export const demoComparableSales: ComparableSale[] = [
  {
    id: "comp-pi-01",
    instrumentQrCode: demoInstrument.qrCode,
    title: "Proper Instruments custom offset, boutique single-builder sale",
    price: 2450,
    currency: "USD",
    date: "2026-05-18",
    condition: "excellent",
    sourceType: "manual-shop-comp",
    sourceLabel: "Manual shop-entered sold comp",
    notes: "Comparable boutique offset build with documented specs."
  },
  {
    id: "comp-pi-02",
    instrumentQrCode: demoInstrument.qrCode,
    title: "Handbuilt offset, relic finish, boutique pickups",
    price: 2750,
    currency: "USD",
    date: "2026-04-27",
    condition: "excellent",
    sourceType: "sold-comp",
    sourceLabel: "Owner-entered sold comp",
    notes: "Similar build level, no QRguitar transfer data."
  },
  {
    id: "comp-pi-03",
    instrumentQrCode: demoInstrument.qrCode,
    title: "Custom boutique S-style/offset hybrid with case",
    price: 2200,
    currency: "USD",
    date: "2026-03-12",
    condition: "very-good",
    sourceType: "sold-comp",
    sourceLabel: "Owner-entered sold comp",
    notes: "Lower because of fewer documents and non-original pickups."
  },
  {
    id: "comp-pi-04",
    instrumentQrCode: demoInstrument.qrCode,
    title: "Proper Instruments builder MSRP reference",
    price: 2995,
    currency: "USD",
    date: "2026-06-01",
    condition: "new",
    sourceType: "builder-msrp",
    sourceLabel: "Builder MSRP reference",
    notes: "Asking/reference price, not a completed sale."
  },
  {
    id: "comp-pi-05",
    instrumentQrCode: demoInstrument.qrCode,
    title: "Active boutique custom offset listing",
    price: 3199,
    currency: "USD",
    date: "2026-06-20",
    condition: "new",
    sourceType: "active-listing",
    sourceLabel: "Active listing context",
    notes: "Asking price only. Not proof of sale value."
  }
];

export function getComparableSalesForInstrument(instrument: Pick<DemoInstrument, "qrCode">) {
  return demoComparableSales.filter((comp) => comp.instrumentQrCode.toUpperCase() === instrument.qrCode.toUpperCase());
}

export function calculateMarketEstimate(instrument: DemoInstrument, comps: ComparableSale[]): MarketEstimate {
  const soldComps = comps.filter((comp) => isSoldComp(comp));
  const activeListings = comps.filter((comp) => comp.sourceType === "active-listing" || comp.sourceType === "asking-price");
  const prices = soldComps.map((comp) => comp.price).filter((price) => Number.isFinite(price) && price > 0);
  const trimmedPrices = trimOutliers(prices);
  const compCount = prices.length;
  const average = averagePrice(prices);
  const median = medianPrice(prices);
  const trimmedAverage = averagePrice(trimmedPrices);
  const fair = trimmedAverage ?? median ?? average;
  const low = fair ? Math.round(fair * 0.86) : null;
  const high = fair ? Math.round(fair * 1.16) : null;

  return {
    low,
    fair: fair ? Math.round(fair) : null,
    high,
    average: average ? Math.round(average) : null,
    median: median ? Math.round(median) : null,
    trimmedAverage: trimmedAverage ? Math.round(trimmedAverage) : null,
    confidence: confidenceForCompSet(instrument, soldComps, activeListings),
    compCount,
    soldCompCount: soldComps.length,
    activeListingCount: activeListings.length,
    evidenceFound: buildEvidenceFound(instrument, soldComps),
    missingEvidence: buildMissingEvidence(instrument, soldComps),
    valueUp: [
      "Original pickups, hardware, finish, and case candy documented",
      "Clear photos of serial, neck pocket, electronics, finish, frets, and wear",
      "Recent setup or service notes from a known shop",
      "Clean ownership transfer history inside QRguitar"
    ],
    valueDown: [
      "Undocumented modifications or changed electronics",
      "No serial/photo proof",
      "Unexplained ownership gaps",
      "Active asking prices without completed sold comps"
    ],
    notes:
      compCount > 0
        ? "This is an estimated market range from available demo/manual comps, not an official appraisal."
        : "Needs fresh sold comps before QRguitar can produce a useful range.",
    soldComps,
    activeListings
  };
}

export function formatMoney(value: number | null) {
  if (!value) {
    return "Needs comps";
  }

  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

export function medianPrice(values: number[]) {
  if (!values.length) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function averagePrice(values: number[]) {
  if (!values.length) {
    return null;
  }

  return values.reduce((sum, price) => sum + price, 0) / values.length;
}

export function trimmedAveragePrice(values: number[]) {
  return averagePrice(trimOutliers(values));
}

function trimOutliers(values: number[]) {
  if (values.length < 5) {
    return values;
  }

  const sorted = [...values].sort((a, b) => a - b);
  return sorted.slice(1, -1);
}

function isSoldComp(comp: ComparableSale) {
  return comp.sourceType === "verified-qrguitar-sale" || comp.sourceType === "sold-comp" || comp.sourceType === "manual-shop-comp";
}

function confidenceForCompSet(instrument: DemoInstrument, soldComps: ComparableSale[], activeListings: ComparableSale[]) {
  if (soldComps.length >= 12 && instrument.verificationStatus === "verified") {
    return "High";
  }

  if (soldComps.length >= 4 && instrument.verificationStatus === "verified") {
    return "Moderate";
  }

  if (soldComps.length >= 1 || activeListings.length >= 1) {
    return "Low";
  }

  return "Needs fresh comps";
}

function buildEvidenceFound(instrument: DemoInstrument, soldComps: ComparableSale[]) {
  return [
    instrument.serial ? `Serial recorded: ${instrument.serial}` : "",
    instrument.verificationStatus === "verified" ? "QRguitar record marked verified" : "",
    instrument.galleryImageDataUrls?.length ? `${instrument.galleryImageDataUrls.length} profile photos attached` : "",
    instrument.customFields?.length ? "Build/spec fields are present" : "",
    soldComps.length ? `${soldComps.length} sold/manual comparable records available` : ""
  ].filter(Boolean);
}

function buildMissingEvidence(instrument: DemoInstrument, soldComps: ComparableSale[]) {
  return [
    soldComps.length < 20 ? `Only ${soldComps.length} sold/manual comps available; 20 is better for a stronger range` : "",
    instrument.verificationStatus !== "verified" ? "Record is not verified" : "",
    !instrument.galleryImageDataUrls?.length ? "Add photos of serial, body, neck, hardware, electronics, and case" : "",
    "Fresh completed-sale comps should be added before quoting a buyer"
  ].filter(Boolean);
}

