import { CatalogClient } from "./CatalogClient";
import { unstable_noStore as noStore } from "next/cache";
import { getPublicInstruments } from "../../lib/public-instruments";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CatalogPage() {
  noStore();
  const initialRecords = await getPublicInstruments().catch(() => []);

  return <CatalogClient initialRecords={initialRecords} />;
}
