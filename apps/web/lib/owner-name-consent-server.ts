import { createServerSupabaseClientWithTimeout } from "./supabase-server";
import { cleanOwnerPublicName, ownerNameUuid } from "./owner-name-consent";

export async function readConfirmedPublicOwnerNames(eventIds: string[], allowUnlisted = false) {
  const names = new Map<string, string>(), ids = [...new Set(eventIds.filter(ownerNameUuid))];
  if (!ids.length) return names;
  try {
    const client = createServerSupabaseClientWithTimeout(4000);
    if (!client) return names;
    for (let i = 0; i < ids.length; i += 500) {
      const selected = ids.slice(i, i + 500), result = await client.rpc("read_public_owner_names", { p_event_ids: selected, p_allow_unlisted: allowUnlisted });
      if (result.error || !Array.isArray(result.data) || result.data.length > selected.length) throw new Error("Name projection unavailable.");
      for (const value of result.data) {
        if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(k => !["eventId", "publicName"].includes(k))
          || !ownerNameUuid(value.eventId) || !selected.includes(value.eventId) || names.has(value.eventId)
          || !cleanOwnerPublicName(value.publicName) || value.publicName !== cleanOwnerPublicName(value.publicName)) throw new Error("Name projection unavailable.");
        names.set(value.eventId, value.publicName);
      }
    }
    return names;
  } catch { return new Map<string, string>(); }
}

