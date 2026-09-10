import { readAdminEmailList } from "./admin-auth";
import { readSitePreviewPayload } from "./site-preview";
import { createServerSupabaseClient } from "./supabase-server";

// A short-lived preview capability must still belong to an eligible editor now.
// This does not claim to establish the browser's current Supabase session.
export async function isSitePreviewAuthorized(
  token: string | null | undefined,
  supabase: ReturnType<typeof createServerSupabaseClient>,
  expectedActorId?: string
) {
  const payload = readSitePreviewPayload(token);
  if (!payload || !supabase || (expectedActorId !== undefined && payload.sub !== expectedActorId)) return false;
  try {
    const [account, profile] = await Promise.all([
      supabase.auth.admin.getUserById(payload.sub),
      supabase.from("profiles").select("role,account_status").eq("id", payload.sub)
        .maybeSingle<{ role?: string; account_status?: string }>()
    ]);
    if (account.error || !account.data.user || account.data.user.id !== payload.sub || profile.error) return false;
    if (profile.data && profile.data.account_status !== "active") return false;
    const email = String(account.data.user.email || "").trim().toLowerCase();
    return profile.data?.role === "admin" || readAdminEmailList().includes(email);
  } catch { return false; }
}
