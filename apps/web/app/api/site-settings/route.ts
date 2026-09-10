import { PUT as mutateEditor } from "../site-editor/route";
import { NextResponse } from "next/server";
import { revalidatePath, unstable_noStore as noStore } from "next/cache";
import { createServerSupabaseClient, createServerSupabaseClientWithTimeout, getSupabaseEnvStatus } from "../../../lib/supabase-server";
import { defaultSiteSettings, mergeSiteSettings, publishedSiteSettingsKey, type EditableSiteSettings } from "../../../lib/site-settings";
import { getAdminContext } from "../../../lib/admin-auth";
import { isSitePreviewAuthorized } from "../../../lib/site-preview-server";
import { sitePreviewTokenFromCookie, sitePreviewDraftKey } from "../../../lib/site-preview";

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

  const preview = await isSitePreviewAuthorized(sitePreviewTokenFromCookie(request.headers.get("cookie") || ""), supabase);
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
  let body: Record<string, unknown>;
  try { body = await request.json(); if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error(); }
  catch { return noStoreJson({ ok: false, uncertain: false, message: "Invalid settings payload." }, { status: 400 }); }
  // Legacy clients without versions fail closed in the shared editor endpoint.
  const response = await mutateEditor(new Request(request.url, { method: "PUT", headers: request.headers,
    body: JSON.stringify({ ...body, action: "publish", source: "brand_logo_admin" }) }));
  const payload = await response.json();
  return noStoreJson({ ...payload, ...(payload.ok === true ? { settings: payload.published } : {}) }, { status: response.status });
}
export async function PATCH(request: Request) { return PUT(request); }
