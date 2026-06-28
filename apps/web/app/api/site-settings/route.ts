import { NextResponse } from "next/server";
import { revalidatePath, unstable_noStore as noStore } from "next/cache";
import { createServerSupabaseClient, getAuthenticatedUser, getSupabaseEnvStatus } from "../../../lib/supabase-server";
import { defaultSiteSettings, mergeSiteSettings, publishedSiteSettingsKey, type EditableSiteSettings } from "../../../lib/site-settings";

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

function normalizeEmail(value?: string | null) {
  return String(value || "").trim().toLowerCase();
}

function readAdminEmails() {
  return (process.env.QRGUITAR_ADMIN_EMAILS || "")
    .split(",")
    .map((item) => normalizeEmail(item))
    .filter(Boolean);
}

async function canPublishSettings(userId: string, email?: string | null) {
  const adminEmails = readAdminEmails();
  if (adminEmails.includes(normalizeEmail(email))) {
    return true;
  }

  const supabase = createServerSupabaseClient();
  if (!supabase) {
    return false;
  }

  const { data } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle<{ role: string | null }>();
  return data?.role === "admin";
}

export async function GET() {
  noStore();
  const supabase = createServerSupabaseClient();
  if (!supabase) {
    const status = getSupabaseEnvStatus();
    return noStoreJson({
      ok: false,
      settings: defaultSiteSettings,
      message: status.missing.length ? "Supabase site settings are not configured." : "Site settings are unavailable."
    });
  }

  const { data, error } = await supabase
    .from("site_content")
    .select("content_value")
    .eq("content_key", publishedSiteSettingsKey)
    .maybeSingle<SiteContentRow>();

  if (error) {
    return noStoreJson({ ok: false, settings: defaultSiteSettings, message: "Published site settings are unavailable." });
  }

  return noStoreJson({ ok: true, settings: data?.content_value ? mergeSiteSettings(data.content_value) : null });
}

export async function PUT(request: Request) {
  noStore();
  const supabase = createServerSupabaseClient();
  if (!supabase) {
    return noStoreJson({ ok: false, message: "Supabase site settings are not configured." }, { status: 503 });
  }

  const { user, error } = await getAuthenticatedUser(request);
  if (!user) {
    return noStoreJson({ ok: false, message: error || "Sign in required." }, { status: 401 });
  }

  const allowed = await canPublishSettings(user.id, user.email);
  if (!allowed) {
    return noStoreJson({ ok: false, message: "Only the QRguitar owner can publish site settings." }, { status: 403 });
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
    return noStoreJson({ ok: false, message: "Could not publish site settings." }, { status: 500 });
  }

  revalidatePath("/");
  revalidatePath("/api/site-settings");

  return noStoreJson({ ok: true, settings });
}
