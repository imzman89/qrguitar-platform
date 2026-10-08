import type { DemoInstrument, DemoUser } from "../local-demo";

export type TransferResult = {
  answer: string;
  confidence: "low" | "medium" | "high";
  evidenceUsed: string[];
  missingEvidence: string[];
  suggestedNextSteps: string[];
  warnings: string[];
};

function ownerDisplay(user: DemoUser | null) {
  if (!user?.email) {
    return "Unknown user";
  }
  return user.name || user.email.split("@")[0] || "Owner";
}

export function buildTransferHelp(instrument: DemoInstrument | null, user: DemoUser | null): TransferResult {
  if (!instrument) {
    return {
      answer:
        "Open the transfer flow from an instrument profile so this helper can point out the exact next transfer steps.",
      confidence: "low",
      evidenceUsed: ["No instrument loaded"],
      missingEvidence: ["Instrument record", "Buyer email", "Transfer timeline fields", "Ownership proof"],
      suggestedNextSteps: ["Open bot from profile", "Collect buyer email", "Prepare photos and condition notes"],
      warnings: ["Never hand over ownership until buyer identity is accepted."]
    };
  }

  const evidenceUsed = [
    `Instrument: ${instrument.brand} ${instrument.model}`,
    `Owner: ${instrument.owner || "not set"}`,
    `Current status: ${instrument.verificationStatus || "unverified"}`
  ];

  if (instrument.packageIncludesFirstTransfer) {
    evidenceUsed.push("First transfer included by record/package");
  }

  if (instrument.creatorAccountType) {
    evidenceUsed.push(`Account type: ${instrument.creatorAccountType}`);
  }

  const missingEvidence = [
    ...(!instrument.verificationStatus ? ["Verification status not set"] : []),
    ...(instrument.galleryImageDataUrls?.length ? [] : ["Missing transfer-ready photos"]),
    ...(instrument.documentFiles?.length ? [] : ["No transfer paperwork attached"]),
    "Buyer identity confirmation"
  ];

  const warnings: string[] = [];
  const canAutoTransfer = Boolean(instrument.packageIncludesFirstTransfer);
  const ownerLabel = ownerDisplay(user);

  if (!canAutoTransfer) {
    warnings.push("Transfer workflow may require manual fee handling unless plan allows it.");
  }

  if (instrument.owner && ownerLabel.toLowerCase() !== String(instrument.owner || "").toLowerCase()) {
    warnings.push("Current login and instrument owner may not match.");
  }

  return {
    answer:
      canAutoTransfer
        ? "This record appears ready for an ownership change if buyer identity is verified and transfer proof is added."
        : "Ownership can be prepared now; keep buyer confirmation steps explicit before final owner change.",
    confidence: missingEvidence.length > 3 ? "low" : "medium",
    evidenceUsed,
    missingEvidence,
    suggestedNextSteps: [
      "Verify buyer email and link confirmation.",
      "Add a transfer note with condition and included items.",
      "Use a single accepted transfer path and keep docs attached."
    ],
    warnings
  };
}
