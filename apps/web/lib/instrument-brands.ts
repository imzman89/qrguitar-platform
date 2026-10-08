export const establishedInstrumentBrands = [
  "Charvel", "Collings", "Dean", "Epiphone", "ESP", "Fender", "G&L", "Gibson", "Godin", "Gretsch",
  "Guild", "Hagstrom", "Heritage", "Ibanez", "Jackson", "Kramer", "LTD", "Martin", "Music Man",
  "Paul Reed Smith", "PRS", "Reverend", "Rickenbacker", "Schecter", "Seagull", "Squier",
  "Sterling by Music Man", "Suhr", "Taylor", "Tom Anderson", "Washburn", "Yamaha"
] as const;

export function instrumentBrandKey(value: string) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/gi, "")
    .toLowerCase();
}

export function canonicalInstrumentBrand(value: string) {
  const key = instrumentBrandKey(value);
  return establishedInstrumentBrands.find((brand) => instrumentBrandKey(brand) === key) || "";
}
