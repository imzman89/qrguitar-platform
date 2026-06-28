import { HomePageClient } from "../components/HomePageClient";
import { getPublicInstruments } from "../lib/public-instruments";
import { loadPublishedSiteSettings } from "../lib/site-settings-server";
import { unstable_noStore as noStore } from "next/cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HomePage() {
  noStore();
  const [publicRecords, publishedSettings] = await Promise.all([getPublicInstruments(), loadPublishedSiteSettings()]);
  const latestPublicRecord = publicRecords[0] || null;

  return <HomePageClient initialLatestRecord={latestPublicRecord} initialSettings={publishedSettings} />;
}
