import type { DemoInstrument } from "./local-demo";

export function matchesCatalogQuery(record: DemoInstrument, query: string) {
  // Use only public discovery fields. Hidden serials are handled by the separate exact lookup.
  const haystack = [record.qrCode, record.name, record.brand, record.model, record.year, record.location,
    record.instrumentType, record.saleStatus, record.originalityStatus].join(" ").toLowerCase();
  return haystack.includes(query.trim().toLowerCase());
}
