import { serialPatterns } from "./serialNumberGuidance";

export type BotIntent =
  | "identify"
  | "price-check"
  | "verify-record"
  | "create-listing"
  | "transfer-help"
  | "support"
  | "scope-block";

export type BotConfidence = "low" | "medium" | "high";

export const quickActions = [
  { label: "Identify", intent: "identify" as const, prompt: "Identify this instrument from the record" },
  { label: "Price Check", intent: "price-check" as const, prompt: "Give me a price range for this record" },
  { label: "Verify Record", intent: "verify-record" as const, prompt: "Check this record for missing proof" },
  { label: "Create Listing", intent: "create-listing" as const, prompt: "Build a strong listing from this record" }
];

export const botKnowledgePolicy = [
  "Use the linked QRguitar record first.",
  "Use member-provided photos/docs second.",
  "Use general gear knowledge only for guidance, not final proof.",
  "Never confirm authenticity without evidence. Use confidence and missing proof.",
  "Keep scope to guitars, amplifiers, pedals, builders, shops, sales, transfers, and ownership workflows."
];

function normalize(value: string) {
  return String(value || "").toLowerCase().trim();
}

export function isOutOfScope(message: string) {
  const text = normalize(message);
  if (!text) {
    return false;
  }

  const inScopeKeywords = [
    "qrguitar",
    "qr guitar",
    "qr",
    "record",
    "records",
    "verify",
    "guitar",
    "guitars",
    "amp",
    "amplifier",
    "amplifiers",
    "pedal",
    "pedals",
    "instrument",
    "serial",
    "serial number",
    "model",
    "brand",
    "builder verification",
    "authentication",
    "authentic",
    "authenticity",
    "order",
    "purchase",
    "builder",
    "shop",
    "repair",
    "service",
    "transfer",
    "ownership",
    "seller",
    "buyer",
    "value",
    "price",
    "market",
    "listing",
    "proof",
    "documentation",
    "document",
    "documents",
    "receipt",
    "cost",
    "plan",
    "plans",
    "free",
    "collector",
    "collectors",
    "neck plate",
    "under finish",
    "finish",
    "cranston",
    "proper instruments",
    "proper passive",
    "photos",
    "media",
    "provenance",
    "download",
    "contact",
    "support",
    "help"
  ];

  return inScopeKeywords.some((keyword) => text.includes(keyword));
}

function score(text: string, patterns: RegExp[]) {
  return patterns.reduce((total, pattern) => total + (pattern.test(text) ? 1 : 0), 0);
}

export function classifyIntent(message: string): BotIntent {
  const text = normalize(message);

  if (!isOutOfScope(text)) {
    return "scope-block";
  }

  if (/\b(order|checkout|payment|paid|invoice|receipt|login|account|password|email|support|contact|problem|issue)\b/.test(text)) {
    return "support";
  }

  if (/\b(how much does it cost|what does it cost|qrguitar.*(cost|pricing|plans?)|free plan|paid plan)\b/.test(text)) {
    return "support";
  }

  if (/\b(what photos|upload photos|main photo|media)\b/.test(text)) {
    return "support";
  }

  const intentScores: Array<{ intent: BotIntent; score: number; priority: number }> = [
    {
      intent: "price-check",
      priority: 100,
      score: score(text, [
        /\b(price|pricing|worth|value|valuation|market|estimate|appraisal|comparable|comps?|cost|plans?)\b/,
        /\b(how much does it cost)\b/,
        /\b(how much|what should i sell|what should i list|list this .* for|asking price|sale price)\b/,
        /\b(sold comps?|completed sales?|active listings?|fair market)\b/
      ])
    },
    {
      intent: "create-listing",
      priority: 90,
      score: score(text, [
        /\b(write|create|draft|build|help).*?\b(listing|for sale|sale copy|description)\b/,
        /\b(listing|sale copy|sale note|for sale|seller description|reverb listing)\b/,
        /\b(photos should i upload|prepare .* sale|sell this guitar)\b/
      ])
    },
    {
      intent: "verify-record",
      priority: 80,
      score: score(text, [
        /\b(verify|verification|proof|mismatch|missing proof|authentic|authenticity|inconsistent|evidence)\b/,
        /\b(fake|real|legit|counterfeit|provenance)\b/
      ])
    },
    {
      intent: "transfer-help",
      priority: 70,
      score: score(text, [
        /\b(transfer|handoff|ownership|new owner|claim ownership|change owner|sell the guitar)\b/,
        /\b(buyer claim|buyer email|owner transfer)\b/
      ])
    },
    {
      intent: "identify",
      priority: 60,
      score: score(text, [
        /\b(identify|who made|maker|brand|model|serial|serial number|decode|stamp|clue)\b/,
        /\b(what is this|what guitar|what amp|what pedal)\b/
      ])
    }
  ];

  if (/\b(why use qrguitar|what is qrguitar|what does qrguitar)\b/.test(text)) {
    return "support";
  }

  const winner = intentScores
    .filter((item) => item.score > 0)
    .sort((first, second) => second.score - first.score || second.priority - first.priority)[0];

  if (winner) {
    return winner.intent;
  }

  return "support";
}

export function detectBrandMention(message: string) {
  const text = normalize(message);
  for (const key of Object.keys(serialPatterns)) {
    if (text.includes(key)) {
      return key;
    }
  }
  return "";
}
