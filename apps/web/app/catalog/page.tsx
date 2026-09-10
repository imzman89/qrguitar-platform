import { CatalogClient } from "./CatalogClient";
import { unstable_noStore as noStore } from "next/cache";
import { getPublicInstruments } from "../../lib/public-instruments";
import { loadPublishedSiteSettings } from "../../lib/site-settings-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CatalogPage() {
  noStore();
  const [initialRecords, settings] = await Promise.all([getPublicInstruments(), loadPublishedSiteSettings()]);

  return <CatalogClient initialRecords={initialRecords} content={settings.content} composition={settings.composition.catalog} />;
}
