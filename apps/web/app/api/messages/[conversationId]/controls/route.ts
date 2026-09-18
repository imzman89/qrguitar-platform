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
  const targetId = conversation.user_a === access.user.id ? conversation.user_b : conversation.user_a;
  let result;
  if (action === "read") result = await access.supabase.rpc("mark_member_conversation_read", { p_conversation_id: conversationId, p_actor_id: access.user.id });
  else if (action === "archive" || action === "unarchive") result = await access.supabase.rpc("set_member_conversation_archived", { p_conversation_id: conversationId, p_actor_id: access.user.id, p_archived: action === "archive" });
  else if (action === "block" || action === "unblock") result = await access.supabase.rpc("set_member_message_block", { p_actor_id: access.user.id, p_target_id: targetId, p_blocked: action === "block" });
  else if (action === "report") {
    const messageId = body?.messageId;
    const reason = String(body?.reason || "");
    const details = String(body?.details || "").trim().slice(0, 1000);
    if (!isMessagingUuid(messageId) || !["spam", "harassment", "fraud", "unsafe_content", "other"].includes(reason)) {
      return memberMessageJson({ ok: false, message: "Choose a message and report reason." }, 400);
    }
    result = await access.supabase.rpc("report_member_message", {
      p_conversation_id: conversationId,
      p_actor_id: access.user.id,
      p_message_id: messageId,
      p_reason: reason,
      p_details: details
    });
  } else return memberMessageJson({ ok: false, message: "Unsupported conversation action." }, 400);
  if (result.error) {
    const failure = messagingDatabaseError(result.error);
    return memberMessageJson({ ok: false, message: failure.message }, failure.status);
  }
  return memberMessageJson({ ok: true });
}
