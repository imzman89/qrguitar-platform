import { unstable_noStore as noStore } from "next/cache";
import { cookies, headers } from "next/headers";
import { createServerSupabaseClient } from "./supabase-server";
import { defaultSiteSettings, mergeSiteSettings, publishedSiteSettingsKey, type EditableSiteSettings } from "./site-settings";
import { isSitePreviewAuthorized } from "./site-preview-server";
import { sitePreviewCookie, sitePreviewDraftKey } from "./site-preview";

type SiteContentRow = {
  content_value: Partial<EditableSiteSettings> | null;
};

export type LoadedSiteSettings = {
  settings: EditableSiteSettings;
  source: "draft" | "published";
};

async function draftPreviewRequested() {
  try {
    return (await headers()).get("x-qrguitar-site-preview") === "draft";
  } catch {
    return false;
  }
}

export async function loadSiteSettingsRequest(): Promise<LoadedSiteSettings> {
  noStore();
  const supabase = createServerSupabaseClient();
  if (!supabase) {
    return { settings: defaultSiteSettings, source: "published" };
  }

  const requested = await draftPreviewRequested();
  const preview = requested && await isSitePreviewAuthorized((await cookies()).get(sitePreviewCookie)?.value, supabase);
  if (preview) {
    const draft = await supabase
      .from("site_content")
      .select("content_value")
      .eq("content_key", sitePreviewDraftKey)
      .maybeSingle<SiteContentRow>();
    const content = (draft.data?.content_value as { settings?: Partial<EditableSiteSettings> } | null)?.settings || null;
    if (!draft.error && content) return { settings: mergeSiteSettings(content), source: "draft" };
  }

  const published = await supabase
    .from("site_content")
    .select("content_value")
    .eq("content_key", publishedSiteSettingsKey)
    .maybeSingle<SiteContentRow>();

  if (published.error || !published.data?.content_value) return { settings: defaultSiteSettings, source: "published" };
  return { settings: mergeSiteSettings(published.data.content_value), source: "published" };
}

export async function loadPublishedSiteSettings() {
  return (await loadSiteSettingsRequest()).settings;
}
