import type { DemoInstrument } from "./local-demo";

export type DiscoveryCategory = { id: string; label: string };
const primaryCategories: DiscoveryCategory[] = [
  { id: "guitars", label: "Guitars" }, { id: "amps", label: "Amps" }, { id: "pedals", label: "Pedals" }
];

/** Category navigation is derived from the same public types used by the Catalog. */
export function discoveryCategoryId(instrumentType: string) {
  const value = instrumentType.trim();
  if (/^(electric|acoustic|bass|other) guitar$/i.test(value) || /^guitar$/i.test(value)) return "guitars";
  if (/^(amplifier|amp)$/i.test(value)) return "amps";
  if (/^(pedal|effects pedal)$/i.test(value)) return "pedals";
  return value ? "type:" + value : "other";
}

export function discoveryCategoryLabel(id: string) {
  return primaryCategories.find(category => category.id === id)?.label
    || (id.startsWith("type:") ? id.slice(5) : id === "other" ? "Other instruments" : "All instruments");
}

export function discoveryCategories(records: Pick<DemoInstrument, "instrumentType">[]): DiscoveryCategory[] {
  const result = [...primaryCategories];
  const seen = new Set(result.map(category => category.id));
  for (const record of records) {
    const id = discoveryCategoryId(record.instrumentType || "");
    if (!seen.has(id)) { seen.add(id); result.push({ id, label: discoveryCategoryLabel(id) }); }
  }
  return result;
}

export function discoveryCategoryHref(id: string) {
  return "/catalog?" + new URLSearchParams({ category: id }).toString();
}

export function matchesDiscoveryCategory(record: Pick<DemoInstrument, "instrumentType">, category: string) {
  return category === "all" || discoveryCategoryId(record.instrumentType || "") === category;
}
