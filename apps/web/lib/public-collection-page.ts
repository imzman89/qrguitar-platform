import { cleanCollectionHandle, cleanPublicCollection, publicCollectionHandleKey, publicCollectionOwnerKey } from "./public-collections";
import { createServerSupabaseClient } from "./supabase-server";

/** Resolve only a published collection belonging to a publicly visible account. */
export async function loadPublicCollectionSettings(handleValue: string) {
  const handle = cleanCollectionHandle(handleValue);
  if (!handle) return null;
  const supabase = createServerSupabaseClient();
  if (!supabase) throw new Error("Public collections are temporarily unavailable.");
  const handleRow = await supabase.from("site_content").select("content_value").eq("content_key", publicCollectionHandleKey(handle))
    .maybeSingle<{ content_value?: { ownerId?: string } }>();
  if (handleRow.error) throw new Error("Public collections are temporarily unavailable.");
  const ownerId = handleRow.data?.content_value?.ownerId;
  if (typeof ownerId !== "string" || !ownerId) return null;
  const ownerProfile = await supabase.from("profiles").select("account_status,hide_public_content").eq("id", ownerId)
    .maybeSingle<{ account_status?: string | null; hide_public_content?: boolean | null }>();
  if (ownerProfile.error) throw new Error("Public collections are temporarily unavailable.");
  if (!ownerProfile.data || ownerProfile.data.hide_public_content === true || ["banned", "removed"].includes(ownerProfile.data.account_status || "")) return null;
  const ownerRow = await supabase.from("site_content").select("content_value").eq("content_key", publicCollectionOwnerKey(ownerId))
    .maybeSingle<{ content_value?: Record<string, unknown> }>();
  if (ownerRow.error) throw new Error("Public collections are temporarily unavailable.");
  const settings = cleanPublicCollection({ ...(ownerRow.data?.content_value || {}), ownerId });
  if (!settings.enabled || settings.handle !== handle || !settings.publicName) return null;
  return { ...settings, ownerId };
}
