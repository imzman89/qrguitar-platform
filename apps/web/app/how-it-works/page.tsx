import { getPublicInstruments } from "../../lib/public-instruments";
import { selectHomeFeaturedProfile } from "../../lib/home-featured-profile";
import { unstable_noStore as noStore } from "next/cache";
import { loadPublishedSiteSettings } from "../../lib/site-settings-server";
import { HowItWorksClient } from "./HowItWorksClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HowItWorksPage() {
  noStore();
  const [settings, records] = await Promise.all([loadPublishedSiteSettings(), getPublicInstruments()]);
  return <HowItWorksClient settings={settings} example={selectHomeFeaturedProfile(records)} />;
}
