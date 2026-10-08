import { calculateMarketEstimate, formatMoney, getComparableSalesForInstrument } from "../pricing-intelligence";
import type { DemoInstrument } from "../local-demo";

export type PriceEstimateResponse = {
  answer: string;
  confidence: "low" | "medium" | "high";
  evidenceUsed: string[];
  missingEvidence: string[];
  suggestedNextSteps: string[];
  warnings: string[];
  estimate?: {
    low: number | null;
    fair: number | null;
    high: number | null;
    median: number | null;
    average: number | null;
    compCount: number;
    soldCompCount: number;
    activeListingCount: number;
  };
};

function parseManualComps(message: string) {
  const matches = String(message || "").match(/\$?\d{2,7}(?:\.\d{1,2})?/g) || [];
  return matches
    .map((value) => Number(value.replace(/[,$]/g, "")))
    .filter((value) => Number.isFinite(value) && value > 0)
    .slice(0, 20);
}

export function buildPriceEstimate(instrument: DemoInstrument | null, message: string): PriceEstimateResponse {
  if (!instrument) {
    const manualComps = parseManualComps(message);
    const compLine = manualComps.length
      ? ` I found ${manualComps.length} price number${manualComps.length === 1 ? "" : "s"} in your message, but I still need the instrument facts before turning them into a useful range.`
      : "";

    return {
      answer:
        `I can help price it, but I need the facts before I give a range: brand, model, year, country, serial, condition, originality, modifications, case, docs, photos, location, and recent sold comps.${compLine} I do not invent live prices.`,
      confidence: "low",
      evidenceUsed: ["No record attached"],
      missingEvidence: ["Brand", "Model", "Year", "Condition", "Originality/mods", "Location", "Sold comparable sales"],
      suggestedNextSteps: [
        "Tell me the brand/model/year/condition first.",
        "Paste sold comps, not just active asking prices.",
        "Mention changed pickups, refrets, repairs, case, and paperwork."
      ],
      warnings: ["No live price feed is used; this is guidance only."]
    };
  }

  const manualComps = parseManualComps(message);
  const comparableRows = getComparableSalesForInstrument(instrument);
  const estimate = calculateMarketEstimate(instrument, comparableRows);
  const soldComps = comparableRows.filter(
    (comp) => comp.sourceType === "sold-comp" || comp.sourceType === "manual-shop-comp" || comp.sourceType === "verified-qrguitar-sale"
  ).length;
  const activeListings = comparableRows.filter(
    (comp) => comp.sourceType === "active-listing" || comp.sourceType === "asking-price"
  ).length;

  const evidenceUsed = [
    `${instrument.brand || "Instrument maker"} ${instrument.model || ""}`,
    `Condition: ${instrument.instrumentCondition || "not specified"}`,
    `Location: ${instrument.location || "not specified"}`
  ];

  if (soldComps) evidenceUsed.push(`${soldComps} sold/manual comps found`);
  if (activeListings) evidenceUsed.push(`${activeListings} active/asking comps found`);
  if (manualComps.length) evidenceUsed.push(`${manualComps.length} manual comps from your message`);

  const missingEvidence = [
    ...(!soldComps && !manualComps.length ? ["No sold comparables yet"] : []),
    ...(!instrument.serial ? ["Serial missing"] : []),
    ...(!instrument.year ? ["Year missing"] : []),
    ...(!instrument.location ? ["Location missing"] : []),
    ...(!instrument.customFields?.length ? ["Spec fields missing"] : [])
  ];

  const confidence =
    soldComps + manualComps.length >= 5
      ? "high"
      : soldComps + manualComps.length >= 2
        ? "medium"
        : "low";

  const { low, fair, high } = estimate;

  const answer = low && fair && high
    ? `Estimated market range is ${formatMoney(low)} to ${formatMoney(high)}, fair point ${formatMoney(fair)}.`
    : "Needs fresh sold comparables before QRguitar can suggest a useful market range.";

  return {
    answer: `${answer} This is guidance only. Use sold comps first and separate asking prices from completed sales.`,
    confidence,
    evidenceUsed,
    missingEvidence: missingEvidence.length ? missingEvidence : ["Evidence is adequate for an estimate frame."],
    suggestedNextSteps: [
      "Prioritize sold comps over active asks.",
      "Separate seller asks from completed sales when comparing range.",
      "Add condition, modifications, and originality notes before quoting a final range."
    ],
    warnings: [
      soldComps < 5 ? "Fewer than 5 sold comps keeps confidence low." : "Compare sold comps against this record’s condition and ownership history.",
      "This is not an official appraisal or authentication certificate."
    ],
    estimate: {
      low: estimate.low,
      fair: estimate.fair,
      high: estimate.high,
      median: estimate.median,
      average: estimate.average,
      compCount: estimate.compCount,
      soldCompCount: soldComps,
      activeListingCount: activeListings
    }
  };
}
