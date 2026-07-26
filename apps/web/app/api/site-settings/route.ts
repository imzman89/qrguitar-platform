import { NextResponse } from "next/server";
import { revalidatePath, unstable_noStore as noStore } from "next/cache";
import { createServerSupabaseClient, createServerSupabaseClientWithTimeout, getSupabaseEnvStatus } from "../../../lib/supabase-server";
import { defaultSiteSettings, mergeSiteSettings, publishedSiteSettingsKey, type EditableSiteSettings } from "../../../lib/site-settings";
import { getAdminContext } from "../../../lib/admin-auth";
import { sitePreviewCookie, sitePreviewDraftKey, verifySitePreviewToken } from "../../../lib/site-preview";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate"
};

type SiteContentRow = {
  content_value: Partial<EditableSiteSettings> | null;
};

function noStoreJson<T>(body: T, init: ResponseInit = {}) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...NO_STORE_HEADERS,
      ...(init.headers || {})
    }
  });
}

export async function GET(request: Request) {
  noStore();
  const supabase = createServerSupabaseClientWithTimeout(3000);
  if (!supabase) {
    const status = getSupabaseEnvStatus();
    return noStoreJson({
      ok: false,
      settings: defaultSiteSettings,
      message: status.missing.length ? "Supabase site settings are not configured." : "Site settings are unavailable."
    });
  }

  const cookieHeader = request.headers.get("cookie") || "";
  const previewToken = cookieHeader.match(new RegExp(`(?:^|;\\s*)${sitePreviewCookie}=([^;]+)`))?.[1];
  const preview = verifySitePreviewToken(previewToken ? decodeURIComponent(previewToken) : "");
  const { data, error } = await supabase
    .from("site_content")
    .select("content_value")
    .eq("content_key", preview ? sitePreviewDraftKey : publishedSiteSettingsKey)
    .maybeSingle<SiteContentRow>();

  if (error) {
    return noStoreJson({ ok: false, settings: defaultSiteSettings, message: "Published site settings are unavailable." });
  }

  const content = preview
    ? ((data?.content_value as { settings?: Partial<EditableSiteSettings> } | null)?.settings || null)
    : data?.content_value;
  return noStoreJson({ ok: true, preview: preview ? "draft" : "published", settings: content ? mergeSiteSettings(content) : null });
}

export async function PUT(request: Request) {
  noStore();
  const supabase = createServerSupabaseClient();
  if (!supabase) {
    return noStoreJson({ ok: false, message: "Supabase site settings are not configured." }, { status: 503 });
  }

  const admin = await getAdminContext(request);
  if (!admin.ok) {
    return noStoreJson({ ok: false, message: admin.message }, { status: admin.status });
  }

  let body: { settings?: Partial<EditableSiteSettings> };
  try {
    body = (await request.json()) as { settings?: Partial<EditableSiteSettings> };
  } catch {
    return noStoreJson({ ok: false, message: "Invalid settings payload." }, { status: 400 });
  }

  const settings = mergeSiteSettings(body.settings);
  const { error: saveError } = await supabase.from("site_content").upsert(
    {
      content_key: publishedSiteSettingsKey,
      content_value: settings,
      updated_at: new Date().toISOString()
    },
    { onConflict: "content_key" }
  );

  if (saveError) {
    return noStoreJson({ ok: false, message: `Could not publish site settings: ${saveError.message}` }, { status: 500 });
  }

  revalidatePath("/");
  revalidatePath("/api/site-settings");

  return noStoreJson({ ok: true, message: "Published globally.", contentKey: publishedSiteSettingsKey, settings });
}

export async function PATCH(request: Request) {
  return PUT(request);
}
