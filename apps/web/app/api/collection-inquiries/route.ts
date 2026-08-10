import { NextResponse } from "next/server";
import { assertAccountCanWrite } from "../../../lib/admin-auth";
import { cleanCollectionHandle, cleanPublicCollection, publicCollectionHandleKey, publicCollectionOwnerKey } from "../../../lib/public-collections";
import { checkServerRateLimit } from "../../../lib/security";
import { createServerSupabaseClient, getAuthenticatedUser } from "../../../lib/supabase-server";
import { sendCollectionInquiryEmail } from "../../../lib/transactional-email";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } });
}

export async function POST(request: Request) {
  const supabase = createServerSupabaseClient();
  if (!supabase) return json({ ok: false, message: "Member inquiries are temporarily unavailable." }, 503);

  const auth = await getAuthenticatedUser(request);
  if (!auth.user) return json({ ok: false, message: auth.error || "Sign in required." }, 401);
  const access = await assertAccountCanWrite(supabase, auth.user);
  if (!access.ok) return json({ ok: false, message: access.message }, access.status);

  const body = await request.json().catch(() => null) as { handle?: unknown; message?: unknown; profileCode?: unknown } | null;
  const handle = cleanCollectionHandle(body?.handle);
  const message = String(body?.message || "").trim().replace(/\r\n/g, "\n").slice(0, 1200);
  const profileCode = String(body?.profileCode || "").trim().toUpperCase();
  if (!handle || message.length < 20) return json({ ok: false, message: "Write at least 20 characters so the collection owner has enough context." }, 400);
  if (!checkServerRateLimit(`collection-inquiry:${auth.user.id}:${handle}`, 4, 60 * 60 * 1000)) {
    return json({ ok: false, message: "Inquiry limit reached. Try again later." }, 429);
  }

  const handleRow = await supabase.from("site_content").select("content_value").eq("content_key", publicCollectionHandleKey(handle)).maybeSingle<{ content_value?: { ownerId?: string } }>();
  const ownerId = String(handleRow.data?.content_value?.ownerId || "");
  if (!ownerId) return json({ ok: false, message: "This collection is unavailable." }, 404);
  if (ownerId === auth.user.id) return json({ ok: false, message: "This is your collection. Use Account to manage its contact settings." }, 400);

  const ownerRow = await supabase.from("site_content").select("content_value").eq("content_key", publicCollectionOwnerKey(ownerId)).maybeSingle<{ content_value?: Record<string, unknown> }>();
  const collection = cleanPublicCollection({ ...(ownerRow.data?.content_value || {}), ownerId });
  if (!collection.enabled || collection.handle !== handle || !collection.allowMessages) {
    return json({ ok: false, message: "Private inquiries are not enabled for this collection." }, 403);
  }

  const [recipient, senderProfile] = await Promise.all([
    supabase.auth.admin.getUserById(ownerId),
    supabase.from("profiles").select("display_name").eq("id", auth.user.id).maybeSingle<{ display_name?: string | null }>()
  ]);
  const recipientEmail = String(recipient.data.user?.email || "");
  const senderEmail = String(auth.user.email || "");
  if (!recipientEmail || !senderEmail) return json({ ok: false, message: "The inquiry could not be delivered." }, 500);

  let profileContext = "";
  if (/^QRG-[A-Z0-9-]{4,40}$/.test(profileCode)) {
    const record = await supabase.from("guitars").select("qr_code,name,brand,model").eq("qr_code", profileCode).eq("owner_id", ownerId).eq("visibility", "public").is("owner_removed_at", null).maybeSingle<{ qr_code?: string; name?: string | null; brand?: string | null; model?: string | null }>();
    if (record.data?.qr_code) profileContext = `${record.data.name || [record.data.brand, record.data.model].filter(Boolean).join(" ") || "QRguitar Profile"} (${record.data.qr_code})`;
  }

  const delivery = await sendCollectionInquiryEmail({
    to: recipientEmail,
    collectionName: collection.publicName,
    senderName: senderProfile.data?.display_name || auth.user.user_metadata?.display_name || "A QRguitar member",
    senderEmail,
    message,
    profileContext
  });
  return json({ ok: delivery.ok, message: delivery.message }, delivery.ok ? 200 : 502);
}
