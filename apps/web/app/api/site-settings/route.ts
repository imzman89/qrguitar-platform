import { PUT as mutateEditor } from "../site-editor/route";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { revalidatePath, unstable_noStore as noStore } from "next/cache";
import { createServerSupabaseClient, createServerSupabaseClientWithTimeout, getSupabaseEnvStatus } from "../../../lib/supabase-server";
import { defaultSiteSettings, mergeSiteSettings, publishedSiteSettingsKey, type EditableSiteSettings } from "../../../lib/site-settings";
import { getAdminContext } from "../../../lib/admin-auth";
import { isSitePreviewAuthorized } from "../../../lib/site-preview-server";
import { sitePreviewTokenFromCookie, sitePreviewDraftKey } from "../../../lib/site-preview";
import { defaultContentValues } from "../../../lib/content-registry";
import { compactSiteSettingsForClient } from "../../../lib/client-site-settings";

const CONTENT_DEFAULTS_HASH = createHash("sha256")
  .update(JSON.stringify(defaultContentValues)).digest("hex");

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
  const compact = new URL(request.url).searchParams.get("defaults") === CONTENT_DEFAULTS_HASH;
  const project = (settings: EditableSiteSettings) =>
    compact ? compactSiteSettingsForClient(settings) : settings;
  const supabase = createServerSupabaseClientWithTimeout(3000);
  if (!supabase) {
    const status = getSupabaseEnvStatus();
    return noStoreJson({
      ok: false,
      settings: defaultSiteSettings,
      message: status.missing.length ? "Supabase site settings are not configured." : "Site settings are unavailable."
    });
  }

  const previewRequested = new URL(request.url).searchParams.get("cmsPreview") === "draft";
  const preview = previewRequested && await isSitePreviewAuthorized(sitePreviewTokenFromCookie(request.headers.get("cookie") || ""), supabase);
  if (preview) {
    const draft = await supabase
      .from("site_content")
      .select("content_value")
      .eq("content_key", sitePreviewDraftKey)
      .maybeSingle<SiteContentRow>();
    const draftContent = (draft.data?.content_value as { settings?: Partial<EditableSiteSettings> } | null)?.settings || null;
    if (!draft.error && draftContent) {
      return noStoreJson({ ok: true, preview: "draft", settings: project(mergeSiteSettings(draftContent)) });
    }
  }

  const published = await supabase
    .from("site_content")
    .select("content_value")
    .eq("content_key", publishedSiteSettingsKey)
    .maybeSingle<SiteContentRow>();

  if (published.error) {
    return noStoreJson({ ok: false, settings: defaultSiteSettings, message: "Published site settings are unavailable." });
  }

  return noStoreJson({ ok: true, preview: "published", settings: project(published.data?.content_value ? mergeSiteSettings(published.data.content_value) : defaultSiteSettings) });
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
