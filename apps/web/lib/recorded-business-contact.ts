import type { ServerSupabaseClient } from "./admin-auth";
import { cleanPublicCollection, publicCollectionHandleKey, publicCollectionOwnerKey } from "./public-collections";

export type RecordedBusinessContact = { transferId: string; publicName: string; handle: string; messageAllowed: boolean; warrantyHelpUrl: string };
export class BusinessContactError extends Error { constructor(readonly status: number, message: string) { super(message); } }
const unavailable = () => new BusinessContactError(404, "Recorded business unavailable. Refresh your Profile.");
const requireRead = (error: unknown) => { if (error) throw new BusinessContactError(503, "Recorded business contact could not be checked. Try again."); };

/** Only the current owner and their latest accepted handoff; no private fields leave this projection. */
export async function loadRecordedBusinessContact(db: ServerSupabaseClient, actorId: string, input: { code?: string; transferId?: string }): Promise<(RecordedBusinessContact & { senderId: string }) | null> {
  const actor = await db.from("profiles").select("account_status").eq("id", actorId).maybeSingle();
  requireRead(actor.error); if (actor.data?.account_status !== "active") throw unavailable();
  let guitarId = "";
  if (input.transferId) {
    const receipt = await db.from("ownership_transfers").select("guitar_id").eq("id", input.transferId).eq("status", "accepted").eq("accepted_by", actorId).maybeSingle();
    requireRead(receipt.error); if (!receipt.data) throw unavailable(); guitarId = receipt.data.guitar_id;
  }
  let query = db.from("guitars").select("id").eq("owner_id", actorId).is("owner_removed_at", null).is("admin_archived_at", null);
  query = guitarId ? query.eq("id", guitarId) : query.eq("qr_code", String(input.code || "").trim().toUpperCase());
  const guitar = await query.maybeSingle(); requireRead(guitar.error); if (!guitar.data) throw unavailable();
  const handoff = await db.from("ownership_transfers").select("id,from_owner_id").eq("guitar_id", guitar.data.id).eq("status", "accepted").eq("accepted_by", actorId)
    .order("accepted_at", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle();
  requireRead(handoff.error);
  if (!handoff.data?.from_owner_id) { if (input.transferId) throw unavailable(); return null; }
  if (input.transferId && handoff.data.id !== input.transferId) throw unavailable();
  const senderId = handoff.data.from_owner_id;
  const profile = await db.from("profiles").select("account_status,hide_public_content").eq("id", senderId).maybeSingle();
  requireRead(profile.error);
  if (!profile.data || profile.data.account_status !== "active" || profile.data.hide_public_content === true) return null;
  const ownerRow = await db.from("site_content").select("content_value").eq("content_key", publicCollectionOwnerKey(senderId)).maybeSingle();
  requireRead(ownerRow.error);
  const raw = ownerRow.data?.content_value;
  if (raw?.ownerId !== undefined && raw.ownerId !== senderId) return null;
  const collection = cleanPublicCollection(raw);
  if (!["shop", "builder"].includes(collection.accountType) || !collection.enabled || !collection.handle || !collection.publicName) return null;
  const handleRow = await db.from("site_content").select("content_value").eq("content_key", publicCollectionHandleKey(collection.handle)).maybeSingle();
  requireRead(handleRow.error); if (handleRow.data?.content_value?.ownerId !== senderId) return null;
  return { senderId, transferId: handoff.data.id, publicName: collection.publicName, handle: collection.handle,
    messageAllowed: collection.allowMessages, warrantyHelpUrl: collection.allowWarrantyHelp ? collection.warrantyHelpUrl : "" };
}
