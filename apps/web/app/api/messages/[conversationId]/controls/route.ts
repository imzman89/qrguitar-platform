import { isMessagingUuid } from "../../../../../lib/member-messaging";
import { memberMessageJson, memberMessageOriginAllowed, readMemberMessageJson } from "../../../../../lib/member-messaging-http";
import { messagingDatabaseError, requireMessagingAccess, requireParticipantConversation } from "../../../../../lib/member-messaging-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request, context: { params: Promise<{ conversationId: string }> }) {
  if (!memberMessageOriginAllowed(request)) return memberMessageJson({ ok: false, message: "Open Messages from QRguitar to continue." }, 403);
  const access = await requireMessagingAccess(request);
  if (!access.ok) return memberMessageJson({ ok: false, message: access.message }, access.status);
  const conversationId = (await context.params).conversationId;
  const body = await readMemberMessageJson(request);
  const action = String(body?.action || "");
  if (!isMessagingUuid(conversationId)) return memberMessageJson({ ok: false, message: "Conversation not found." }, 404);
  const conversation = await requireParticipantConversation(access.supabase, access.user.id, conversationId);
  if (!conversation) return memberMessageJson({ ok: false, message: "Conversation not found." }, 404);
  if (action !== "read") return memberMessageJson({ ok: false, message: "Conversation history cannot be archived, blocked, or deleted." }, 400);
  const result = await access.supabase.rpc("mark_member_conversation_read", { p_conversation_id: conversationId, p_actor_id: access.user.id });
  if (result.error) {
    const failure = messagingDatabaseError(result.error);
    return memberMessageJson({ ok: false, message: failure.message }, failure.status);
  }
  return memberMessageJson({ ok: true });
}
