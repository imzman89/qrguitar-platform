export const defaultInstrumentCategories = [
  "Electric Guitar",
  "Acoustic Guitar",
  "Bass Guitar",
  "Other Guitar",
  "Amplifier",
  "Pedal",
  "Custom Build",
  "Brand Asset"
];

export function normalizeInstrumentCategories(categories?: string[] | null, includeDefaults = true) {
  const cleaned = (categories || [])
    .map((category) => String(category || "").trim())
    .filter(Boolean);

  const merged = includeDefaults ? [...defaultInstrumentCategories, ...cleaned] : cleaned;
  return Array.from(new Set(merged));
}
