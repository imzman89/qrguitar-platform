import { unstable_noStore as noStore } from "next/cache";
import { createServerSupabaseClientWithTimeout } from "./supabase-server";
import { defaultSiteSettings, mergeSiteSettings, publishedSiteSettingsKey, type EditableSiteSettings } from "./site-settings";

type SiteContentRow = {
  content_value: Partial<EditableSiteSettings> | null;
};

export async function loadPublishedSiteSettings() {
  noStore();
  const supabase = createServerSupabaseClientWithTimeout(3000);
  if (!supabase) {
    return defaultSiteSettings;
  }

  const { data, error } = await supabase
    .from("site_content")
    .select("content_value")
    .eq("content_key", publishedSiteSettingsKey)
    .maybeSingle<SiteContentRow>();

  if (error || !data?.content_value) {
    return defaultSiteSettings;
  }

  return mergeSiteSettings(data.content_value);
}
