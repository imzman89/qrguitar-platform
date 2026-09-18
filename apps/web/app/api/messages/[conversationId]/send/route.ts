import { cleanMessageBody, isMessagingUuid } from "../../../../../lib/member-messaging";
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
  const operationId = body?.operationId;
  const message = cleanMessageBody(body?.message);
  if (!isMessagingUuid(conversationId) || !isMessagingUuid(operationId)) return memberMessageJson({ ok: false, message: "The message operation is invalid." }, 400);
  if (!await requireParticipantConversation(access.supabase, access.user.id, conversationId)) return memberMessageJson({ ok: false, message: "Conversation not found." }, 404);
  const result = await access.supabase.rpc("send_member_message", {
    p_conversation_id: conversationId,
    p_actor_id: access.user.id,
    p_operation_id: operationId,
    p_body: message
  });
  if (result.error) {
    const failure = messagingDatabaseError(result.error);
    return memberMessageJson({ ok: false, message: failure.message }, failure.status);
  }
  const value = result.data as { messageId?: string; replayed?: boolean } | null;
  return memberMessageJson({ ok: true, messageId: value?.messageId || "", replayed: value?.replayed === true });
}
