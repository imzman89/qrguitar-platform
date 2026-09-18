import { isMessagingUuid } from "../../../../lib/member-messaging";
import { memberMessageJson } from "../../../../lib/member-messaging-http";
import { loadMemberConversation, requireMessagingAccess } from "../../../../lib/member-messaging-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(request: Request, context: { params: Promise<{ conversationId: string }> }) {
  const access = await requireMessagingAccess(request);
  if (!access.ok) return memberMessageJson({ ok: false, message: access.message }, access.status);
  const conversationId = (await context.params).conversationId;
  if (!isMessagingUuid(conversationId)) return memberMessageJson({ ok: false, message: "Conversation not found." }, 404);
  try {
    const conversation = await loadMemberConversation(access.supabase, access.user.id, conversationId);
    if (!conversation) return memberMessageJson({ ok: false, message: "Conversation not found." }, 404);
    return memberMessageJson({ ok: true, conversation });
  } catch {
    return memberMessageJson({ ok: false, message: "Messages are temporarily unavailable. Try again." }, 503);
  }
}
