import { createServerSupabaseClient, getAuthenticatedUser } from "../../../../lib/supabase-server";
import { BusinessContactError, loadRecordedBusinessContact } from "../../../../lib/recorded-business-contact";
import { memberMessageJson } from "../../../../lib/member-messaging-http";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export async function GET(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (!auth.user) return memberMessageJson({ ok: false, message: "Sign in to view recorded business contact." }, 401);
  const code = new URL(request.url).searchParams.get("code") || "";
  if (!/^[A-Z0-9][A-Z0-9-]{2,80}$/i.test(code)) return memberMessageJson({ ok: false, message: "Profile unavailable." }, 400);
  try {
    const db = createServerSupabaseClient(); if (!db) throw new BusinessContactError(503, "Recorded business contact is temporarily unavailable.");
    const value = await loadRecordedBusinessContact(db, auth.user.id, { code });
    // The stable sender account is used internally for binding, never exposed in the customer projection.
    const contact = value ? { transferId: value.transferId, publicName: value.publicName, handle: value.handle,
      messageAllowed: value.messageAllowed, warrantyHelpUrl: value.warrantyHelpUrl } : null;
    return memberMessageJson({ ok: true, actorId: auth.user.id, contact });
  } catch (error) {
    return memberMessageJson({ ok: false, message: error instanceof BusinessContactError ? error.message : "Recorded business contact could not be checked. Try again." },
      error instanceof BusinessContactError ? error.status : 503);
  }
}
