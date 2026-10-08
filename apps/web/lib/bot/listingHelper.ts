import type { DemoInstrument } from "../local-demo";

export type ListingResult = {
  answer: string;
  confidence: "low" | "medium" | "high";
  evidenceUsed: string[];
  missingEvidence: string[];
  suggestedNextSteps: string[];
  warnings: string[];
};

export function buildListingHelp(instrument: DemoInstrument | null): ListingResult {
  if (!instrument) {
    return {
      answer:
        "I can help build a listing structure, but I need a record. Open this helper from the instrument page first.",
      confidence: "low",
      evidenceUsed: ["No record loaded"],
      missingEvidence: ["Brand", "Model", "Serial", "Year", "Condition", "Ownership status", "Main photos"],
      suggestedNextSteps: ["Open the instrument record", "Add photos and condition notes", "Add transfer and sale notes in one flow"],
      warnings: ["Without a record, sale text should stay generic and conservative."]
    };
  }

  const evidenceUsed = [
    `${instrument.brand} ${instrument.model}`,
    `Condition: ${instrument.instrumentCondition || "not set"}`,
    `Location: ${instrument.location || "not set"}`,
    `Visibility: ${instrument.visibility || "public"}`
  ];

  if (instrument.year) evidenceUsed.push(`Year: ${instrument.year}`);
  if (instrument.builder) evidenceUsed.push(`Builder: ${instrument.builder}`);
  if (instrument.verificationStatus === "verified") evidenceUsed.push("Verified status present");
  if (instrument.galleryImageDataUrls?.length) evidenceUsed.push(`Photos: ${instrument.galleryImageDataUrls.length}`);

  const missingEvidence = [
    ...(!instrument.summary ? ["No clean listing summary"] : []),
    ...(!instrument.websiteUrl && !instrument.instagramUrl ? ["No social/documentation links added"] : []),
    ...(!instrument.serial ? ["Serial missing"] : []),
    ...((instrument.customFields?.length || 0) < 3 ? ["Limited spec details"] : []),
    ...(!instrument.documentFiles?.length ? ["No docs attached (invoice/build sheet optional for trust)"] : [])
  ];

  const warnings: string[] = [];
  if (!instrument.documentFiles?.length) {
    warnings.push("No documents attached; listing will feel weaker to buyers.");
  }

  if (!instrument.galleryImageDataUrls?.length) {
    warnings.push("Add a strong main photo first.");
  }

  const confidence =
    missingEvidence.length <= 2 && (instrument.galleryImageDataUrls?.length || 0) > 0
      ? "high"
      : missingEvidence.length <= 4
        ? "medium"
        : "low";

  const suggestionSeed = instrument.instrumentCondition === "new" ? "new build transfer" : "used instrument";

  return {
    answer:
      `Ready-to-use listing scaffold for a ${suggestionSeed}: keep one clean paragraph, one condition summary, and one ownership/transfer note. This helps buyers and keeps your story consistent.`,
    confidence,
    evidenceUsed,
    missingEvidence: missingEvidence.length ? missingEvidence : ["Core fields present."],
    suggestedNextSteps: [
      "Paste a clean title: brand + model + year + pickup/setup tag.",
      "Add one hero photo + serial photo + serial hardware close-ups.",
      "Add repairs and ownership notes before publishing listing.",
      "Include return/transfer plan and included extras."
    ],
    warnings
  };
}
