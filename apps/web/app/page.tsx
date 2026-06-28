import { HomePageClient } from "../components/HomePageClient";
import { getPublicInstruments } from "../lib/public-instruments";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const publicRecords = await getPublicInstruments();
  const latestPublicRecord = publicRecords[0] || null;

  return <HomePageClient initialLatestRecord={latestPublicRecord} />;
}
