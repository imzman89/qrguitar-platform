import type { DemoInstrument } from "../local-demo";

export type AuthenticationCheckResult = {
  answer: string;
  confidence: "low" | "medium" | "high";
  evidenceUsed: string[];
  missingEvidence: string[];
  suggestedNextSteps: string[];
  warnings: string[];
};

export function buildAuthenticationChecklist(instrument: DemoInstrument | null): AuthenticationCheckResult {
  if (!instrument) {
    return {
      answer:
        "No QRguitar Profile is attached. Open the bot from an instrument page first, or paste the minimum profile details so I can check it.",
      confidence: "low",
      evidenceUsed: ["General QRguitar authentication workflow only"],
      missingEvidence: ["Instrument brand", "Model", "Serial", "Year", "Ownership timeline", "Photos", "Receipts or transfer records"],
      suggestedNextSteps: ["Open the bot from /i/[QR ID]", "Add serial, photos, and proof documents", "Attach ownership and repair history"],
      warnings: ["No verification can be confirmed without an attached instrument record."]
    };
  }

  const evidenceUsed = [
    `Record loaded: ${instrument.brand} ${instrument.model} (${instrument.qrCode})`,
    `Serial ${instrument.serial ? "provided" : "missing"}`,
    `Verification status: ${instrument.verificationStatus || "unverified"}`
  ];

  if (instrument.galleryImageDataUrls?.length) {
    evidenceUsed.push(`${instrument.galleryImageDataUrls.length} profile images attached`);
  }

  if (instrument.customFields?.length) {
    evidenceUsed.push("Custom profile fields are populated");
  }

  const requiredGaps: string[] = [];
  if (!instrument.serial) requiredGaps.push("Serial missing");
  if (!instrument.year) requiredGaps.push("Year missing");
  if (!instrument.builder) requiredGaps.push("Builder info missing");
  if (!instrument.location) requiredGaps.push("Location missing");
  if (!instrument.documentFiles?.length) requiredGaps.push("No supporting docs uploaded");
  if (!instrument.galleryImageDataUrls?.length) requiredGaps.push("No close-up photos");
  if (!instrument.customFields?.length) requiredGaps.push("Specs not fully recorded");

  const warnings: string[] = [];
  if (instrument.verificationStatus !== "verified") {
    warnings.push("Record is not marked verified.");
    warnings.push("Findings are consistency checks, not definitive authentication.");
  }

  if (requiredGaps.length > 4) {
    warnings.push("Large proof gap; likely needs additional photos and paperwork.");
  }

  const confidence =
    requiredGaps.length <= 2 ? "high" : requiredGaps.length <= 4 ? "medium" : "low";

  return {
    answer:
      requiredGaps.length
        ? "This record can be consistent with the claimed instrument, but proof is incomplete."
        : "This record is internally consistent with the supplied data. Still keep evidence checks before any authentication claim.",
    confidence,
    evidenceUsed,
    missingEvidence: requiredGaps.length ? requiredGaps : ["No critical missing fields at the moment."],
    suggestedNextSteps: [
      "Attach clear serial and headstock photos.",
      "Add ownership chain and transfer proof.",
      "Upload receipts, setup notes, and repair notes.",
      "Set document visibility intentionally for buyer workflow."
    ],
    warnings
  };
}
