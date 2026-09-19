import { memberMessageJson } from "../../../lib/member-messaging-http";
import { listMemberConversations, requireMessagingAccess } from "../../../lib/member-messaging-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(request: Request) {
  const access = await requireMessagingAccess(request);
  if (!access.ok) return memberMessageJson({ ok: false, message: access.message }, access.status);
  const url = new URL(request.url);
  if ([...url.searchParams.keys()].length) return memberMessageJson({ ok: false, message: "Unsupported message filter." }, 400);
  try {
    const conversations = await listMemberConversations(access.supabase, access.user.id);
    return memberMessageJson({ ok: true, conversations });
  } catch {
    return memberMessageJson({ ok: false, message: "Messages are temporarily unavailable. Try again." }, 503);
  }
}
