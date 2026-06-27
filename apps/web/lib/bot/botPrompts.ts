import type { DemoInstrument, DemoUser } from "../local-demo";
import { buildAuthenticationChecklist, type AuthenticationCheckResult } from "./authenticationChecklist";
import { buildListingHelp, type ListingResult } from "./listingHelper";
import { buildKnowledgeAnswer, supportEmail } from "./knowledgeBase";
import { buildPriceEstimate, type PriceEstimateResponse } from "./pricingRules";
import { buildSerialAnalysis } from "./serialNumberGuidance";
import { buildTransferHelp, type TransferResult } from "./transferHelper";

export type BotResultPayload = {
  answer: string;
  confidence: "low" | "medium" | "high";
  evidenceUsed: string[];
  missingEvidence: string[];
  suggestedNextSteps: string[];
  warnings: string[];
};

export function buildIdentifyPrompt(message: string, instrument: DemoInstrument | null): BotResultPayload {
  if (!instrument) {
    return {
      answer:
        "I can help identify the instrument, but I need at least brand/model/year/serial and clear photos. Paste those details and I will run a maker-aware checklist.",
      confidence: "low",
      evidenceUsed: ["General identification knowledge"],
      missingEvidence: ["Brand", "Model", "Serial", "Photo angles", "Build/hardware notes"],
      suggestedNextSteps: ["Attach/open the instrument record", "Add front/back/headstock/serial photos", "Share builder/body/neck/electronics clues"],
      warnings: ["Identification is a best-effort check until proof is matched."]
    };
  }

  const serial = buildSerialAnalysis(instrument.brand, instrument.serial);
  const confidence =
    instrument.verificationStatus === "verified" && Boolean(instrument.serial) && Boolean(instrument.year)
      ? "medium"
      : "low";

  return {
    answer:
      `This record is loaded as ${instrument.brand} ${instrument.model} (${instrument.year || "year not set"}). Treat this as a cross-check: serial clues, hardware, finish, and build notes should all align.`,
    confidence,
    evidenceUsed: [
      `Brand: ${instrument.brand || "not set"}`,
      `Model: ${instrument.model || "not set"}`,
      `Serial: ${serial.serialValue}`,
      ...serial.clues,
      ...serial.serialClues
    ],
    missingEvidence: [
      ...(instrument.serial ? [] : ["Serial missing"]),
      ...(instrument.galleryImageDataUrls?.length ? [] : ["No instrument photos"]),
      ...(instrument.documentFiles?.length ? [] : ["No paperwork/docs attached"]),
      "Ownership and service timeline"
    ],
    suggestedNextSteps: [
      "Compare headstock, serial, and neck heel notes with the seller claim.",
      "Add invoice or build/sales paperwork.",
      "Add transfer notes and latest setup/repair evidence."
    ],
    warnings: serial.serialPresent ? [] : ["No serial makes identity checks weaker."]
  };
}

export function buildPricePrompt(message: string, instrument: DemoInstrument | null): PriceEstimateResponse {
  return buildPriceEstimate(instrument, message);
}

export function buildVerifyRecordPrompt(message: string, instrument: DemoInstrument | null): AuthenticationCheckResult {
  return buildAuthenticationChecklist(instrument);
}

export function buildCreateListingPrompt(message: string, instrument: DemoInstrument | null): ListingResult {
  return buildListingHelp(instrument);
}

export function buildTransferPrompt(message: string, instrument: DemoInstrument | null, user: DemoUser | null): TransferResult {
  return buildTransferHelp(instrument, user);
}

export function buildSupportPrompt(message: string, instrument: DemoInstrument | null): BotResultPayload {
  const knowledge = buildKnowledgeAnswer(message);

  if (knowledge) {
    return {
      answer: knowledge.answer,
      confidence: "medium",
      evidenceUsed: knowledge.evidenceUsed,
      missingEvidence: instrument ? [] : ["No specific QRguitar record is attached."],
      suggestedNextSteps: knowledge.suggestedNextSteps,
      warnings: ["I will not expose private records, hidden documents, or private owner details."]
    };
  }

  if (!instrument) {
    return {
      answer:
        `Ask about guitars, amps, pedals, QRguitar records, visibility, repairs, listings, serials, transfers, pricing, or documentation. For account or order help, email ${supportEmail}.`,
      confidence: "low",
      evidenceUsed: ["No scoped record"],
      missingEvidence: ["Specific instrument details or scope"],
      suggestedNextSteps: ["Ask a specific guitar or QRguitar question.", "Open the bot from a record page for record-aware checks.", `Email ${supportEmail} for account support.`],
      warnings: ["General suggestions are still valid but not proof."]
    };
  }

  return {
    answer:
      `For ${instrument.brand} ${instrument.model}, keep your data in one record: build notes, service notes, ownership changes, photos, and docs. This keeps audits and buyer communication easier.`,
    confidence: "medium",
    evidenceUsed: ["Active instrument record", "Profile + docs + history context"],
    missingEvidence: ["Current repair notes", "Recent service entry", "Ownership/transfer status"],
    suggestedNextSteps: [
      "Use Identify for maker/serial checks.",
      "Use Verify Record for proof gaps.",
      "Use Price Check before setting an ask."
    ],
    warnings: ["No check is absolute unless matching proof is complete."]
  };
}

export function buildScopeBlockPrompt(message: string): BotResultPayload {
  return {
    answer:
      "I can help with guitars, amps, pedals, builders, shops, sales, transfers, repairs, records, and QRguitar workflows only. Ask me inside that lane.",
    confidence: "low" as const,
    evidenceUsed: ["Question topic"],
    missingEvidence: ["A guitar or QRguitar-related question"],
    suggestedNextSteps: ["Ask about an instrument record", "Ask to identify a serial", "Ask for a verification checklist"],
    warnings: ["This bot is intentionally scoped to guitar-world tasks."]
  };
}

