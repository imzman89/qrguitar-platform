import { CatalogClient } from "./CatalogClient";
import { getPublicInstruments } from "../../lib/public-instruments";
import type { DemoInstrument } from "../../lib/local-demo";
import { unstable_noStore as noStore } from "next/cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CatalogPage() {
  noStore();

  let records: DemoInstrument[] = [];

  try {
    records = await getPublicInstruments();
  } catch {
    records = [];
  }

  return <CatalogClient initialRecords={records} />;
}
