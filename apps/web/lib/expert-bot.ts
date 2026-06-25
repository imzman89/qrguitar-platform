import {
  demoInstrument,
  getAccountPlan,
  getInstrumentVerificationStatus,
  instrumentDisplayName,
  type DemoInstrument,
  type DemoUser
} from "./local-demo";
import {
  calculateMarketEstimate,
  formatMoney,
  getComparableSalesForInstrument,
  type MarketEstimate
} from "./pricing-intelligence";

export type BotIntent =
  | "identify"
  | "proof-check"
  | "sale-prep"
  | "serial"
  | "transfer"
  | "market-value"
  | "support";

export type BotResponse = {
  intent: BotIntent;
  title: string;
  answer: string;
  confidence: "Needs evidence" | "Low" | "Moderate" | "High";
  evidenceFound: string[];
  missingEvidence: string[];
  nextSteps: string[];
  marketEstimate?: MarketEstimate;
  paidContext?: string;
};

export const expertStarterQuestions = [
  "Help me identify this guitar",
  "Check this record for missing proof",
  "Prepare this guitar for sale",
  "Explain this serial number",
  "What should I document before transfer?",
  "Price check this instrument"
];

export const expertBotKnowledgePolicy = [
  "Use verified QRguitar records first.",
  "Use user-provided evidence second.",
  "Use general guitar knowledge only as guidance.",
  "Never invent serial databases or private manufacturer data.",
  "Never call an instrument authentic unless QRguitar has verified evidence.",
  "Always show confidence, evidence found, missing proof, and next steps.",
  "For pricing, prefer sold/completed comps over active listings and clearly label asking prices."
];

export function classifyBotIntent(message: string): BotIntent {
  const normalized = message.toLowerCase();

  if (/(price|value|market|worth|comp|comparable|appraisal)/.test(normalized)) {
    return "market-value";
  }

  if (/(identify|what is|model|brand|year|origin)/.test(normalized)) {
    return "identify";
  }

  if (/(missing|proof|evidence|verify|authentic|fake|mismatch|suspicious)/.test(normalized)) {
    return "proof-check";
  }

  if (/(sell|listing|listing copy|prepare|reverb|buyer)/.test(normalized)) {
    return "sale-prep";
  }

  if (/(serial|number|date code)/.test(normalized)) {
    return "serial";
  }

  if (/(transfer|ownership|handoff|claim|warranty)/.test(normalized)) {
    return "transfer";
  }

  return "support";
}

export function buildExpertBotResponse(message: string, instrument: DemoInstrument = demoInstrument, user?: DemoUser | null): BotResponse {
  const intent = classifyBotIntent(message);
  const title = instrumentDisplayName(instrument);
  const verification = getInstrumentVerificationStatus(instrument);
  const baseEvidence = [
    instrument.brand ? `Brand recorded as ${instrument.brand}` : "",
    instrument.model ? `Model recorded as ${instrument.model}` : "",
    instrument.serial ? `Serial recorded as ${instrument.serial}` : "",
    instrument.year ? `Year recorded as ${instrument.year}` : "",
    verification === "verified" ? "QRguitar record is marked verified" : "QRguitar record is not verified"
  ].filter(Boolean);

  if (intent === "market-value") {
    const comps = getComparableSalesForInstrument(instrument);
    const marketEstimate = calculateMarketEstimate(instrument, comps);
    const plan = getAccountPlan(user);
    const paidContext =
      plan === "free"
        ? "Free accounts get basic pricing guidance. Paid, brand, shop, and commercial accounts can use detailed saved comps when live data is connected."
        : "Detailed pricing tools are available for this account type when real comp sources are connected.";

    return {
      intent,
      title: "Estimated market range",
      answer: marketEstimate.fair
        ? `${title} currently shows an estimated demo range of ${formatMoney(marketEstimate.low)} to ${formatMoney(marketEstimate.high)}, with ${formatMoney(marketEstimate.fair)} as the fair-market center. This is not an official appraisal. It is based on manually entered demo comps, not live marketplace scraping.`
        : `I cannot give a defensible market range for ${title} yet because fresh completed-sale comps are missing.`,
      confidence: marketEstimate.confidence === "Moderate" ? "Moderate" : marketEstimate.confidence === "High" ? "High" : "Low",
      evidenceFound: marketEstimate.evidenceFound,
      missingEvidence: marketEstimate.missingEvidence,
      nextSteps: [
        "Add recent completed sold comps before quoting a buyer.",
        "Separate active asking prices from sold prices.",
        "Add photos proving condition, originality, hardware, electronics, and case contents.",
        "Record any repairs, setup work, or modifications that change value."
      ],
      marketEstimate,
      paidContext
    };
  }

  if (intent === "identify") {
    return {
      intent,
      title: "Identification check",
      answer: `Based on the current QRguitar record, this appears to be ${title}. I would not call that definitive authentication from the record alone. For a stronger read, compare the serial, photos, hardware, finish, pickup route, neck markings, and any shop or builder documents against the claim.`,
      confidence: verification === "verified" ? "Moderate" : "Low",
      evidenceFound: baseEvidence,
      missingEvidence: [
        "Clear serial photo",
        "Front, back, neck, headstock, bridge, pickups, electronics, and case photos",
        "Receipts, build sheet, warranty card, or shop paperwork"
      ],
      nextSteps: [
        "Upload clear photos before making a buyer-facing claim.",
        "Add country of origin, weight, pickup set, neck shape, finish, and case contents.",
        "Use QRguitar verification only when evidence has been reviewed."
      ]
    };
  }

  if (intent === "proof-check") {
    return {
      intent,
      title: "Missing proof check",
      answer: `${title} has a usable record, but a serious buyer or admin review needs proof that supports the seller's claims. I can flag gaps; I cannot authenticate it without verified evidence.`,
      confidence: verification === "verified" ? "Moderate" : "Low",
      evidenceFound: baseEvidence,
      missingEvidence: [
        "Document photos for serial and ownership",
        "Repair/service documents",
        "Pickup and hardware originality notes",
        "Transfer history after first sale"
      ],
      nextSteps: [
        "Add a certificate or build sheet if available.",
        "Add service history with dates and shop names.",
        "Mark any changed pickups, tuners, bridge, finish work, or refret clearly."
      ]
    };
  }

  if (intent === "sale-prep") {
    return {
      intent,
      title: "Sale prep",
      answer: `For a clean listing, lead with the make, model, year, serial, condition, originality, included case/case candy, service history, and the permanent QRguitar record. Buyers should see what is original, what changed, and what proof exists.`,
      confidence: "Moderate",
      evidenceFound: baseEvidence,
      missingEvidence: ["Fresh condition photos", "Current setup measurements", "Clear sale notes and included items"],
      nextSteps: [
        "Pick the best main photo.",
        "Add honest condition notes.",
        "Attach receipts and service records as private or public documents.",
        "Create the transfer before pickup or shipping."
      ]
    };
  }

  if (intent === "serial") {
    return {
      intent,
      title: "Serial number guidance",
      answer: `The recorded serial is ${instrument.serial || "missing"}. I can explain patterns when a brand is known, but I should not invent a serial database. Serial format is a clue, not proof by itself.`,
      confidence: instrument.serial ? "Low" : "Needs evidence",
      evidenceFound: baseEvidence,
      missingEvidence: ["Serial photo", "Brand/model-specific serial reference", "Neck/body/electronics photos"],
      nextSteps: [
        "Upload a clear serial photo.",
        "Compare serial format against public manufacturer guidance or builder records.",
        "Check whether the year, model, hardware, and finish line up with the serial claim."
      ]
    };
  }

  if (intent === "transfer") {
    return {
      intent,
      title: "Transfer and ownership",
      answer: `Ownership transfer should keep the permanent QR link intact while moving the record to the next verified buyer account. The buyer should verify email before ownership changes.`,
      confidence: "High",
      evidenceFound: baseEvidence,
      missingEvidence: ["Buyer email confirmation", "Sale note or receipt", "Final condition photos before handoff"],
      nextSteps: [
        "Confirm buyer email.",
        "Add final photos and sale notes.",
        "Send the transfer link.",
        "Keep private documents private unless the owner chooses otherwise."
      ]
    };
  }

  return {
    intent,
    title: "QRguitar support",
    answer: "I can review records, specs, serial clues, proof gaps, repairs, transfers, sale prep, and pricing. I will show what evidence exists, what is missing, and what to do next.",
    confidence: "Moderate",
    evidenceFound: baseEvidence,
    missingEvidence: ["Ask a specific question or add more instrument evidence"],
    nextSteps: expertStarterQuestions.slice(0, 5)
  };
}
