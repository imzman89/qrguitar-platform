import { BotIntent, BotConfidence, botKnowledgePolicy, classifyIntent, detectBrandMention } from "./bot/botRules";
import { getBotKnowledgeBullets, readBotSettings } from "./bot-settings";
import {
  buildCreateListingPrompt,
  buildIdentifyPrompt,
  buildPricePrompt,
  buildScopeBlockPrompt,
  buildSupportPrompt,
  buildTransferPrompt,
  buildVerifyRecordPrompt
} from "./bot/botPrompts";
import { calculateMarketEstimate, getComparableSalesForInstrument } from "./pricing-intelligence";
import { type DemoInstrument, type DemoUser } from "./local-demo";
import { type PriceEstimateResponse } from "./bot/pricingRules";

export type BotResponse = {
  intent: BotIntent;
  title: string;
  answer: string;
  confidence: BotConfidence;
  evidenceUsed: string[];
  missingEvidence: string[];
  suggestedNextSteps: string[];
  warnings: string[];
  evidenceFound?: string[];
  nextSteps?: string[];
  marketEstimate?: {
    low: number | null;
    fair: number | null;
    high: number | null;
    average: number | null;
    median: number | null;
    trimmedAverage: number | null;
    compCount: number;
    soldCompCount: number;
    activeListingCount: number;
    confidence: "Needs fresh comps" | "Low" | "Moderate" | "High";
    notes: string;
    valueUp?: string[];
    valueDown?: string[];
    missingEvidence?: string[];
    evidenceFound?: string[];
  };
  paidContext?: string;
};

export const expertStarterQuestions = [
  "Help me identify this instrument",
  "Check this record for missing proof",
  "Prepare this guitar for sale",
  "Explain this serial number",
  "What should I add before transfer?",
  "Price check this instrument"
];

export const expertBotKnowledgePolicy = botKnowledgePolicy;

function asCompatible(response: {
  answer: string;
  confidence: BotConfidence;
  evidenceUsed: string[];
  missingEvidence: string[];
  suggestedNextSteps: string[];
  warnings: string[];
}) {
  return {
    ...response,
    evidenceFound: response.evidenceUsed,
    nextSteps: response.suggestedNextSteps
  };
}

function starterScopeEvidence(message: string, instrument?: DemoInstrument | null) {
  const base = ["QRguitar context", `Message topic: ${String(message || "general question").trim()}`];
  base.push(instrument ? `Record: ${instrument.qrCode}` : "No attached record");
  const settings = readBotSettings();
  return [...base, ...getBotKnowledgeBullets(settings, message || "", 2)];
}

function responseWithEstimateFromMarket(instrument: DemoInstrument, response: PriceEstimateResponse): BotResponse {
  const fullEstimate = calculateMarketEstimate(instrument, getComparableSalesForInstrument(instrument));

  return {
    intent: "price-check",
    title: "Market value guidance",
    ...asCompatible(response),
    paidContext: "Pricing is estimated guidance; use sold comps and record proof for confidence.",
    marketEstimate: {
      low: response.estimate?.low ?? null,
      fair: response.estimate?.fair ?? null,
      high: response.estimate?.high ?? null,
      average: response.estimate?.average ?? null,
      median: response.estimate?.median ?? null,
      trimmedAverage: fullEstimate.trimmedAverage,
      compCount: response.estimate?.compCount ?? 0,
      soldCompCount: response.estimate?.soldCompCount ?? 0,
      activeListingCount: response.estimate?.activeListingCount ?? 0,
      confidence: fullEstimate.confidence,
      notes: fullEstimate.notes,
      valueUp: fullEstimate.valueUp,
      valueDown: fullEstimate.valueDown,
      missingEvidence: response.missingEvidence,
      evidenceFound: response.evidenceUsed
    }
  };
}

function supportFallback(message: string, instrument: DemoInstrument | null) {
  const response = buildSupportPrompt(message, instrument);
  return {
    ...asCompatible(response),
    intent: "support" as const,
    title: "QRguitar Assistant"
  };
}

export function buildExpertBotResponse(message: string, instrument?: DemoInstrument | null, user?: DemoUser | null): BotResponse {
  const text = String(message || "").trim();

  if (!text) {
    return {
      intent: "support",
      title: "QRguitar Bot",
      answer: "Share one clear request and I will run a practical check.",
      confidence: "low",
      evidenceUsed: ["No message provided"],
      missingEvidence: ["A question or request"],
      suggestedNextSteps: ["Try: identify, price check, verify record, or create listing."],
      warnings: ["No input yet."]
    };
  }

  const detectedIntent = classifyIntent(text);
  const evidenceSeed = starterScopeEvidence(text, instrument);
  const brandMention = detectBrandMention(text);
  const brandLine = brandMention ? `Maker mention detected: ${brandMention}` : null;

  if (detectedIntent === "scope-block") {
    const blocked = buildScopeBlockPrompt(text);
    return {
      ...asCompatible(blocked),
      intent: "scope-block",
      title: "QRguitar Bot",
      evidenceUsed: evidenceSeed,
      evidenceFound: evidenceSeed,
      missingEvidence: blocked.missingEvidence,
      nextSteps: blocked.suggestedNextSteps,
      paidContext: "Scope is limited to guitar/gear workflows."
    };
  }

  if (detectedIntent === "identify") {
    const result = buildIdentifyPrompt(text, instrument || null);
    const evidenceUsed = brandLine ? [brandLine, ...result.evidenceUsed] : result.evidenceUsed;
    return {
      ...asCompatible(result),
      intent: "identify",
      title: "Identify",
      evidenceUsed: [...evidenceSeed, ...evidenceUsed],
      evidenceFound: [...evidenceSeed, ...evidenceUsed],
      confidence: result.confidence
    };
  }

  if (detectedIntent === "price-check") {
    const result = buildPricePrompt(text, instrument || null);
    if (!instrument) {
      return {
        ...asCompatible(result),
        intent: "price-check",
        title: "Price Check",
        evidenceUsed: [...evidenceSeed, ...result.evidenceUsed],
        evidenceFound: [...evidenceSeed, ...result.evidenceUsed]
      };
    }

    const priced = responseWithEstimateFromMarket(instrument, result);
    const evidenceUsed = brandLine ? [brandLine, ...result.evidenceUsed] : result.evidenceUsed;
    return {
      ...priced,
      evidenceUsed: [...evidenceSeed, ...evidenceUsed],
      evidenceFound: [...evidenceSeed, ...evidenceUsed]
    };
  }

  if (detectedIntent === "verify-record") {
    const result = buildVerifyRecordPrompt(text, instrument || null);
    return {
      ...asCompatible(result),
      intent: "verify-record",
      title: "Verify Record",
      evidenceUsed: [...evidenceSeed, ...result.evidenceUsed],
      evidenceFound: [...evidenceSeed, ...result.evidenceUsed]
    };
  }

  if (detectedIntent === "create-listing") {
    const result = buildCreateListingPrompt(text, instrument || null);
    return {
      ...asCompatible(result),
      intent: "create-listing",
      title: "Create Listing",
      evidenceUsed: [...evidenceSeed, ...result.evidenceUsed],
      evidenceFound: [...evidenceSeed, ...result.evidenceUsed]
    };
  }

  if (detectedIntent === "transfer-help") {
    const result = buildTransferPrompt(text, instrument || null, user || null);
    return {
      ...asCompatible(result),
      intent: "support",
      title: "Transfer Help",
      evidenceUsed: [...evidenceSeed, ...result.evidenceUsed],
      evidenceFound: [...evidenceSeed, ...result.evidenceUsed]
    };
  }

  const fallback = supportFallback(text, instrument || null);
  const finalEvidence = brandLine ? [brandLine, ...evidenceSeed, ...fallback.evidenceUsed] : [...evidenceSeed, ...fallback.evidenceUsed];
  const needsRecordPrompt = !instrument && fallback.evidenceUsed.includes("No instrument record attached");
  return {
    ...fallback,
    intent: "support",
    evidenceUsed: finalEvidence,
    evidenceFound: finalEvidence,
    paidContext: !instrument ? "Attach an instrument record for record-aware guidance." : expertBotKnowledgePolicy[0],
    answer: fallback.answer + (needsRecordPrompt ? " Open me from an instrument page if you want me to use that record." : ""),
    title: instrument ? fallback.title : "General QRguitar guidance"
  };
}
