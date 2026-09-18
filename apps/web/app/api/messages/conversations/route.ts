import { cleanCollectionHandle } from "../../../../lib/public-collections";
import { loadPublicCollectionSettings } from "../../../../lib/public-collection-page";
import { memberMessageJson, memberMessageOriginAllowed, readMemberMessageJson } from "../../../../lib/member-messaging-http";
import { messagingDatabaseError, requireMessagingAccess } from "../../../../lib/member-messaging-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  if (!memberMessageOriginAllowed(request)) return memberMessageJson({ ok: false, message: "Open Messages from QRguitar to continue." }, 403);
  const access = await requireMessagingAccess(request);
  if (!access.ok) return memberMessageJson({ ok: false, message: access.message }, access.status);
  const body = await readMemberMessageJson(request);
  const handle = cleanCollectionHandle(body?.handle);
  const profileCode = String(body?.profileCode || "").trim().toUpperCase();
  if (!handle || (profileCode && !/^QRG-[A-Z0-9-]{4,40}$/.test(profileCode))) {
    return memberMessageJson({ ok: false, message: "Choose an available member Profile." }, 400);
  }
  try {
    const collection = await loadPublicCollectionSettings(handle);
    if (!collection) return memberMessageJson({ ok: false, message: "Member Profile not found." }, 404);
    if (!collection.allowMessages) return memberMessageJson({ ok: false, message: "This member is not accepting messages." }, 403);
    let contextGuitarId: string | null = null;
    if (profileCode) {
      const profile = await access.supabase.from("guitars").select("id").eq("owner_id", collection.ownerId)
        .eq("qr_code", profileCode).eq("visibility", "public").is("owner_removed_at", null).is("admin_archived_at", null)
        .maybeSingle<{ id: string }>();
      if (profile.error || !profile.data) return memberMessageJson({ ok: false, message: "The selected Profile is unavailable." }, 400);
      contextGuitarId = profile.data.id;
    }
    const result = await access.supabase.rpc("ensure_member_conversation", {
      p_actor_id: access.user.id,
      p_target_id: collection.ownerId,
      p_context_guitar_id: contextGuitarId
    });
    if (result.error) {
      const failure = messagingDatabaseError(result.error);
      return memberMessageJson({ ok: false, message: failure.message }, failure.status);
    }
    const value = result.data as { conversationId?: string; created?: boolean } | null;
    if (!value?.conversationId) return memberMessageJson({ ok: false, message: "The conversation could not be confirmed." }, 503);
    return memberMessageJson({ ok: true, conversationId: value.conversationId, created: value.created === true });
  } catch {
    return memberMessageJson({ ok: false, message: "Messages are temporarily unavailable. Try again." }, 503);
  }
}
