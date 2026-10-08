import { NextResponse } from "next/server";
import { assertAccountCanWrite, getAdminContext } from "../../../lib/admin-auth";
import { createServerSupabaseClient, getAuthenticatedUser } from "../../../lib/supabase-server";
import {
  SERVICE_CATEGORIES,
  cleanServiceText,
  cleanServiceUrl,
  loadProviderProfile,
  mapProviderProfile,
  serviceMigrationMessage,
  serviceMigrationMissing
} from "../../../lib/service-workflow";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } });
}

export async function GET(request: Request) {
  const supabase = createServerSupabaseClient();
  if (!supabase) return json({ ok: false, message: "Supabase is not configured." }, 503);
  const auth = await getAuthenticatedUser(request);
  if (!auth.user) return json({ ok: false, message: auth.error || "Sign in required." }, 401);

  try {
    const own = await loadProviderProfile(supabase, auth.user.id);
    return json({ ok: true, provider: mapProviderProfile(own, true), categories: SERVICE_CATEGORIES });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load provider profile.";
    return json({ ok: false, message: serviceMigrationMissing(message) ? serviceMigrationMessage() : message }, serviceMigrationMissing(message) ? 503 : 500);
  }
}

export async function PATCH(request: Request) {
  const supabase = createServerSupabaseClient();
  if (!supabase) return json({ ok: false, message: "Supabase is not configured." }, 503);
  const auth = await getAuthenticatedUser(request);
  if (!auth.user) return json({ ok: false, message: auth.error || "Sign in required." }, 401);
  const access = await assertAccountCanWrite(supabase, auth.user);
  if (!access.ok) return json({ ok: false, message: access.message }, access.status);

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const businessName = cleanServiceText(body?.businessName, 160);
  const publicDisplayName = cleanServiceText(body?.publicDisplayName, 160) || businessName;
  if (!publicDisplayName) return json({ ok: false, message: "Provider display name is required." }, 400);
  const requestedCategories = Array.isArray(body?.serviceCategories) ? body?.serviceCategories : [];
  const serviceCategories = requestedCategories.map((value) => cleanServiceText(value, 80)).filter((value) => (SERVICE_CATEGORIES as readonly string[]).includes(value));

  const result = await supabase.from("service_provider_profiles").upsert({
    user_id: auth.user.id,
    business_name: businessName,
    public_display_name: publicDisplayName,
    website: cleanServiceUrl(body?.website) || null,
    location: cleanServiceText(body?.location, 240) || null,
    service_categories: serviceCategories,
    updated_at: new Date().toISOString()
  }, { onConflict: "user_id" }).select("*").single();

  if (result.error) {
    const migrationMissing = serviceMigrationMissing(result.error.message);
    return json({ ok: false, message: migrationMissing ? serviceMigrationMessage() : result.error.message }, migrationMissing ? 503 : 500);
  }

  return json({ ok: true, provider: mapProviderProfile(result.data, true), message: "Service-provider profile saved." });
}
