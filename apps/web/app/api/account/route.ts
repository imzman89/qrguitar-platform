import { NextResponse } from "next/server";
import { assertAccountCanWrite } from "../../../lib/admin-auth";
import { createServerSupabaseClient, getAuthenticatedUser } from "../../../lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate"
};

function json<T>(body: T, init: ResponseInit = {}) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...NO_STORE_HEADERS,
      ...(init.headers || {})
    }
  });
}

function cleanDisplayName(value: unknown) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 80);
}

export async function GET(request: Request) {
  const supabase = createServerSupabaseClient();
  if (!supabase) {
    return json({ ok: false, message: "Supabase is not configured." }, { status: 500 });
  }

  const auth = await getAuthenticatedUser(request);
  if (!auth.user) {
    return json({ ok: false, message: auth.error || "Sign in required." }, { status: 401 });
  }

  const profile = await supabase
    .from("profiles")
    .select("display_name,role,plan,account_status")
    .eq("id", auth.user.id)
    .maybeSingle<{ display_name?: string | null; role?: string | null; plan?: string | null; account_status?: string | null }>();

  if (profile.error) {
    return json({ ok: false, message: profile.error.message || "Could not load account." }, { status: 500 });
  }

  return json({
    ok: true,
    account: {
      email: auth.user.email || "",
      displayName: profile.data?.display_name || auth.user.user_metadata?.display_name || auth.user.email?.split("@")[0] || "",
      role: profile.data?.role || "user",
      plan: profile.data?.plan || "free",
      accountStatus: profile.data?.account_status || "active"
    }
  });
}

export async function PATCH(request: Request) {
  const supabase = createServerSupabaseClient();
  if (!supabase) {
    return json({ ok: false, message: "Supabase is not configured." }, { status: 500 });
  }

  const auth = await getAuthenticatedUser(request);
  if (!auth.user) {
    return json({ ok: false, message: auth.error || "Sign in required." }, { status: 401 });
  }

  const writeAccess = await assertAccountCanWrite(supabase, auth.user);
  if (!writeAccess.ok) {
    return json({ ok: false, message: writeAccess.message }, { status: writeAccess.status });
  }

  const body = await request.json().catch(() => null) as { displayName?: string } | null;
  const displayName = cleanDisplayName(body?.displayName);
  if (displayName.length < 2) {
    return json({ ok: false, message: "Display name must be at least 2 characters." }, { status: 400 });
  }

  const current = await supabase.from("profiles").select("role,plan").eq("id", auth.user.id).maybeSingle<{ role?: string | null; plan?: string | null }>();
  const profileSaved = await supabase.from("profiles").upsert({
    id: auth.user.id,
    display_name: displayName,
    role: current.data?.role || "user",
    plan: current.data?.plan || "free"
  }, { onConflict: "id" });

  if (profileSaved.error) {
    return json({ ok: false, message: profileSaved.error.message || "Could not save account." }, { status: 500 });
  }

  const userSaved = await supabase.auth.admin.updateUserById(auth.user.id, {
    user_metadata: {
      ...auth.user.user_metadata,
      display_name: displayName
    }
  });

  if (userSaved.error) {
    return json({ ok: false, message: userSaved.error.message || "Could not update account login profile." }, { status: 500 });
  }

  return json({ ok: true, account: { email: auth.user.email || "", displayName }, message: "Account updated." });
}
