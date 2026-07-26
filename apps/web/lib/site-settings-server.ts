import { unstable_noStore as noStore } from "next/cache";
import { cookies } from "next/headers";
import { createServerSupabaseClient } from "./supabase-server";
import { defaultSiteSettings, mergeSiteSettings, publishedSiteSettingsKey, type EditableSiteSettings } from "./site-settings";
import { sitePreviewCookie, sitePreviewDraftKey, verifySitePreviewToken } from "./site-preview";

type SiteContentRow = {
  content_value: Partial<EditableSiteSettings> | null;
};

export async function loadPublishedSiteSettings() {
  noStore();
  const supabase = createServerSupabaseClient();
  if (!supabase) {
    return defaultSiteSettings;
  }

  const preview = verifySitePreviewToken(cookies().get(sitePreviewCookie)?.value);
  const { data, error } = await supabase
    .from("site_content")
    .select("content_value")
    .eq("content_key", preview ? sitePreviewDraftKey : publishedSiteSettingsKey)
    .maybeSingle<SiteContentRow>();

  if (error || !data?.content_value) {
    return defaultSiteSettings;
  }

  const content = preview
    ? ((data.content_value as { settings?: Partial<EditableSiteSettings> } | null)?.settings || null)
    : data.content_value;
  return content ? mergeSiteSettings(content) : defaultSiteSettings;
}
