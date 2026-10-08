export const botSettingsKey = "qrguitar.botSettings";

export type EditableBotSettings = {
  knowledgeNotes: string;
  updateNotes: string;
  scopeRules: string;
};

export const defaultBotSettings: EditableBotSettings = {
  knowledgeNotes: [
    "Vintage and used guitar checks should include serial photos, logo details, hardware, routes, cavities, receipts, and service history.",
    "Acoustic checks should include neck angle, bridge and saddle height, humidity, top bellying, crack repair, and brace or bridge work.",
    "Amplifier checks should include transformer originality, speaker codes, cap job history, tube set, grounding, noise, and service dates.",
    "Pedal checks should include enclosure version, PCB or revision clues, power requirements, switch condition, and mod history.",
    "Sale and transfer prep should include main condition photos, serial photos, setup notes, included items, receipts, and ownership history."
  ].join("\n"),
  updateNotes: "Refresh maker notes, serial patterns, service checklists, and pricing logic as new records, repairs, and sales data come in.",
  scopeRules:
    "Stay focused on guitars, amplifiers, pedals, builders, shops, collectors, music gear, transfers, service, listings, records, and QRguitar support."
};

export function mergeBotSettings(settings?: Partial<EditableBotSettings> | null): EditableBotSettings {
  return {
    ...defaultBotSettings,
    ...(settings || {})
  };
}

export function readBotSettings() {
  if (typeof window === "undefined") {
    return defaultBotSettings;
  }

  try {
    const stored = window.localStorage.getItem(botSettingsKey);
    return stored ? mergeBotSettings(JSON.parse(stored) as Partial<EditableBotSettings>) : defaultBotSettings;
  } catch {
    return defaultBotSettings;
  }
}

export function saveBotSettings(settings: EditableBotSettings) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(botSettingsKey, JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent("qrguitar:bot-settings", { detail: settings }));
}

export function resetBotSettings() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(botSettingsKey);
  window.dispatchEvent(new CustomEvent("qrguitar:bot-settings", { detail: defaultBotSettings }));
}

export function getBotKnowledgeBullets(settings: EditableBotSettings, message: string, limit = 3) {
  const lines = settings.knowledgeNotes
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return [];
  }

  const normalizedMessage = String(message || "").toLowerCase();
  const matched = lines.filter((line) => {
    const words = line
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 3);

    return words.some((word) => normalizedMessage.includes(word));
  });

  const ordered = matched.length ? matched : lines;
  return ordered.slice(0, limit);
}
