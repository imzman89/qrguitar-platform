export type SerialGuidance = {
  maker: string;
  clues: string[];
  serialClues: string[];
  caveats: string[];
};

export const serialPatterns: Record<string, SerialGuidance> = {
  fender: {
    maker: "Fender",
    clues: ["headstock/logo style", "neck heel shape", "bridge and pickup routing"],
    serialClues: ["Serial area format and era clues", "Body route and hardware match same period", "Case candy and paperwork help confirm maker batch"],
    caveats: ["Serial is a clue, not proof.", "Always compare with photos and ownership chain."]
  },
  gibson: {
    maker: "Gibson",
    clues: ["Bridge and neck joint cues", "Control cavity style", "Finish aging and hardware layout"],
    serialClues: ["Factory/location clues change by model period", "Serial alone cannot confirm authenticity"],
    caveats: ["Use repair receipts and transfer notes too.", "Document changed pickups/hardware clearly."]
  },
  prsg: {
    maker: "PRS",
    clues: ["Body style and neck carve", "Electronics configuration", "Routing and neck heel details"],
    serialClues: ["Serial clues are best paired with invoice/model notes"],
    caveats: ["No single serial pattern applies across all periods.", "Keep photos of logos, bridge, and neck heel."]
  },
  prs: {
    maker: "PRS",
    clues: ["Body style and neck carve", "Electronics configuration", "Routing and neck heel details"],
    serialClues: ["Serial clues are best paired with invoice/model notes"],
    caveats: ["No single serial pattern applies across all periods.", "Keep photos of logos, bridge, and neck heel."]
  },
  ibanez: {
    maker: "Ibanez",
    clues: ["Body style, neck profile, and hardware", "Bridge type and pickguard generation"],
    serialClues: ["Serial style varies by series and era"],
    caveats: ["Many series use similar shapes and decals.", "Use photos and ownership notes for confidence."]
  },
  epiphone: {
    maker: "Epiphone",
    clues: ["Case candy, logo treatment, hardware variants", "Neck profile and pickup layout"],
    serialClues: ["Serial family often changes by factory/series"],
    caveats: ["Country/factory clues can shift inside series", "Do not treat serial as a final verdict."]
  },
  suhr: {
    maker: "Suhr",
    clues: ["High-end routing/hardware consistency", "Bridge and pickup routing"],
    serialClues: ["Check electronics/route notes with serial clue"],
    caveats: ["Custom notes and receipts are strong proof sources.", "Confirm buyer-facing facts from paperwork."]
  },
  martin: {
    maker: "Martin",
    clues: ["Top/back build details", "Neck/body joint and bridge", "Case candy and finish notes"],
    serialClues: ["Serial format and year mapping are model-period dependent"],
    caveats: ["Humidity/condition history impacts value more than appearance alone."]
  },
  taylor: {
    maker: "Taylor",
    clues: ["Bracing clues", "Bridge/saddle style", "Series-specific hardware details"],
    serialClues: ["Serial should be cross-checked with model-era clues"],
    caveats: ["Use service and ownership timeline for confidence."]
  },
  squier: {
    maker: "Squier",
    clues: ["Series-specific hardware", "Headstock logo details", "Series-specific bridge and pickups"],
    serialClues: ["Serial format changes heavily by series/factory", "Use photo evidence for era and build clues"],
    caveats: ["Series-level differences can shift resale context", "Ask for seller proof before claiming anything."]
  }
};

export function guidanceForBrand(brand = "") {
  const match = serialPatterns[(brand || "").toLowerCase().trim()] || null;
  if (match) {
    return match;
  }

  return {
    maker: brand || "Instrument maker",
    clues: ["Match serial, body/neck/hardware clues and receipts for best confidence.", "Use photos from multiple angles."],
    serialClues: ["Serial format is a clue, not proof.", "A serial cannot stand alone."],
    caveats: ["Never mark the instrument as verified without proof set."]
  };
}

export function buildSerialAnalysis(brand: string, serial = "") {
  const guidance = guidanceForBrand(brand);
  const serialPresent = Boolean(serial && serial.trim());
  return {
    maker: guidance.maker,
    serialPresent,
    serialValue: serial || "not provided",
    serialClues: guidance.serialClues,
    clues: guidance.clues,
    caveats: guidance.caveats
  };
}
