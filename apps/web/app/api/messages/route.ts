import { memberMessageJson } from "../../../lib/member-messaging-http";
import { decodeMemberConversationCursor, listMemberConversations, requireMessagingAccess } from "../../../lib/member-messaging-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(request: Request) {
  const access = await requireMessagingAccess(request);
  if (!access.ok) return memberMessageJson({ ok: false, message: access.message }, access.status);
  const url = new URL(request.url);
  const keys = [...url.searchParams.keys()];
  const cursorValues = url.searchParams.getAll("cursor");
  if (keys.some((key) => key !== "cursor") || cursorValues.length > 1) return memberMessageJson({ ok: false, message: "Unsupported message filter." }, 400);
  const cursor = cursorValues.length === 1 ? decodeMemberConversationCursor(cursorValues[0]) : null;
  if (cursorValues.length === 1 && !cursor) return memberMessageJson({ ok: false, message: "Invalid conversation cursor." }, 400);
  try {
    const page = await listMemberConversations(access.supabase, access.user.id, cursor);
    return memberMessageJson({ ok: true, ...page });
  } catch {
    return memberMessageJson({ ok: false, message: "Messages are temporarily unavailable. Try again." }, 503);
  }
}
