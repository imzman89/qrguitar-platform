import { NextResponse } from "next/server";
import { assertAccountCanWrite } from "../../../lib/admin-auth";
import {
  cleanPublicCollection,
  cleanCollectionWebsite,
  defaultPublicCollectionSettings,
  publicCollectionOwnerKey,
  type PublicCollectionSettings
} from "../../../lib/public-collections";
import { createServerSupabaseClient, getAuthenticatedUser } from "../../../lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

function json<T>(body: T, init: ResponseInit = {}) {
  return NextResponse.json(body, {
    ...init,
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate", ...(init.headers || {}) }
  });
}

function cleanDisplayName(value: unknown) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 80);
}

export async function GET(request: Request) {
  const supabase = createServerSupabaseClient();
  if (!supabase) return json({ ok: false, message: "Account service is unavailable." }, { status: 503 });
  const auth = await getAuthenticatedUser(request);
  if (!auth.user) return json({ ok: false, message: auth.error || "Sign in required." }, { status: 401 });

  try {
    // HEAD with exact counts is unaffected by PostgREST's maximum returned-row setting.
    const records = () => supabase.from("guitars").select("id", { count: "exact", head: true })
      .eq("owner_id", auth.user.id).is("owner_removed_at", null);
    // Ordered version reads prevent combining an old collection with a new
    // version, which would otherwise permit a stale overwrite on the next save.
    const profile = await supabase.from("profiles").select("display_name,role,plan,account_status,account_settings_version").eq("id", auth.user.id)
      .maybeSingle<{ display_name?: string | null; role?: string | null; plan?: string | null; account_status?: string | null; account_settings_version?: number }>();
    const [collection, total, publicCount, privateCount, unlistedCount] = await Promise.all([
      supabase.from("site_content").select("content_value").eq("content_key", publicCollectionOwnerKey(auth.user.id))
        .maybeSingle<{ content_value?: Partial<PublicCollectionSettings> }>(),
      records(), records().eq("visibility", "public"), records().eq("visibility", "private"),
      records().eq("visibility", "unlisted")
    ]);
    const current = await supabase.from("profiles").select("account_settings_version").eq("id", auth.user.id)
      .maybeSingle<{ account_settings_version?: number }>();
    const settingsVersion = profile.data ? profile.data.account_settings_version : 0;
    const currentVersion = current.data ? current.data.account_settings_version : 0;
    const counts = [total, publicCount, privateCount, unlistedCount];
    if (profile.error || current.error || collection.error || !Number.isSafeInteger(settingsVersion) || Number(settingsVersion) < 0 || currentVersion !== settingsVersion
      || counts.some((result) => result.error || result.count == null || !Number.isSafeInteger(result.count))) {
      return json({ ok: false, message: "Could not load account. Please try again." }, { status: 503 });
    }
    return json({
      ok: true,
      account: {
        email: auth.user.email || "",
        displayName: profile.data?.display_name || auth.user.user_metadata?.display_name || auth.user.email?.split("@")[0] || "",
        role: profile.data?.role || "user", plan: profile.data?.plan || "free",
        accountStatus: profile.data?.account_status || "active",
        settingsVersion,
        publicCollection: cleanPublicCollection(collection.data?.content_value || defaultPublicCollectionSettings),
        stats: { records: total.count, publicRecords: publicCount.count, privateRecords: privateCount.count,
          unlistedRecords: unlistedCount.count }
      }
    });
  } catch {
    return json({ ok: false, message: "Could not load account. Please try again." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  const supabase = createServerSupabaseClient();
  if (!supabase) return json({ ok: false, message: "Account service is unavailable." }, { status: 503 });
  const auth = await getAuthenticatedUser(request);
  if (!auth.user) return json({ ok: false, message: auth.error || "Sign in required." }, { status: 401 });

  const body = await request.json().catch(() => null) as { displayName?: string; publicCollection?: Partial<PublicCollectionSettings>; expectedVersion?: number } | null;
  const displayName = typeof body?.displayName === "string" ? cleanDisplayName(body.displayName) : "";
  if (displayName.length < 2) return json({ ok: false, message: "Display name must be at least 2 characters." }, { status: 400 });
  const expectedVersion = body?.expectedVersion;
  if (!Number.isSafeInteger(expectedVersion) || Number(expectedVersion) < 0 || Number(expectedVersion) >= Number.MAX_SAFE_INTEGER) {
    return json({ ok: false, message: "Reload your account before saving again.", reloadRequired: true }, { status: 400 });
  }
  let publicCollection: PublicCollectionSettings | null = null;
  if (body && Object.prototype.hasOwnProperty.call(body, "publicCollection")) {
    if (!body.publicCollection || typeof body.publicCollection !== "object" || Array.isArray(body.publicCollection)) {
      return json({ ok: false, message: "Invalid public collection settings." }, { status: 400 });
    }
    const website = body.publicCollection.websiteUrl;
    if (website !== undefined && (typeof website !== "string" || (website.trim() && !cleanCollectionWebsite(website)))) {
      return json({ ok: false, message: "Use a complete website address starting with https://, or leave Website blank." }, { status: 400 });
    }
    publicCollection = cleanPublicCollection({ ...body.publicCollection,
      enabled: true,
      publicName: body.publicCollection.publicName,
      ownerId: auth.user.id
    });
    if (!publicCollection.publicName) {
      return json({ ok: false, message: "Choose a collection name. It does not have to be your real name." }, { status: 400 });
    }
    if (publicCollection.enabled && publicCollection.handle.length < 3) {
      return json({ ok: false, message: "Choose a collection handle with at least 3 letters or numbers." }, { status: 400 });
    }
  }
  const writeAccess = await assertAccountCanWrite(supabase, auth.user);
  if (!writeAccess.ok) return json({ ok: false, message: writeAccess.message }, { status: writeAccess.status });

  let saved;
  try {
    saved = await supabase.rpc("save_account_settings", {
      p_user_id: auth.user.id, p_display_name: displayName, p_collection: publicCollection, p_expected_version: expectedVersion
    });
  } catch {
    return json({ ok: false, commitStatus: "unknown", message: "Could not confirm the save. Reload your account before trying again." }, { status: 503 });
  }
  if (saved.error) {
    const code = saved.error.code;
    if (code === "PT409" || code === "40001") return json({ ok: false, reloadRequired: true, message: "Your account settings changed since they were loaded. Reload your account before saving again." }, { status: 409 });
    if (!code) return json({ ok: false, commitStatus: "unknown", message: "Could not confirm the save. Reload your account before trying again." }, { status: 503 });
    const status = code === "23505" ? 409 : code === "42501" ? 403 : code === "22023" ? 400 : 503;
    const message = status === 409 ? "That public collection handle is already in use."
      : status === 403 ? "This account cannot make changes."
      : status === 400 ? "Check your display name and collection settings."
      : "Could not save account. Please try again.";
    return json({ ok: false, message }, { status });
  }
  const account = saved.data as { displayName: string; publicCollection?: Partial<PublicCollectionSettings> | null; settingsVersion?: number } | null;
  if (!account || account.displayName !== displayName || account.settingsVersion !== Number(expectedVersion) + 1) {
    return json({ ok: false, commitStatus: "unknown", message: "Could not confirm the save. Reload your account before trying again." }, { status: 503 });
  }

  // The database has committed. An Auth API failure must not be reported as a rolled-back account save.
  let authMetadataSynced = false;
  try {
    const result = await supabase.auth.admin.updateUserById(auth.user.id, {
      user_metadata: { display_name: displayName }
    });
    authMetadataSynced = !result.error;
  } catch { /* The committed account remains authoritative. */ }
  return json({
    ok: true, committed: true, authMetadataSynced,
    account: { email: auth.user.email || "", displayName, publicCollection: cleanPublicCollection(account.publicCollection), settingsVersion: account.settingsVersion },
    message: authMetadataSynced ? "Account updated." : "Account saved. Your sign-in display name could not be synchronized. Save again to retry that step."
  });
}
