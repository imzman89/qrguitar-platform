import { unstable_noStore as noStore } from "next/cache";
import { loadPublishedSiteSettings } from "../../lib/site-settings-server";
import { HowItWorksClient } from "./HowItWorksClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HowItWorksPage() {
  noStore();
  const settings = await loadPublishedSiteSettings();
  return <HowItWorksClient settings={settings} />;
}
