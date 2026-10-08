import { getAdminContext } from "../../../../lib/admin-auth";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";

export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request) {
  const auth = await getAdminContext(request);
  if (!auth.ok) return json({ ok: false, message: auth.message }, auth.status);
  const db = createServerSupabaseClient();
  if (!db) return json({ ok: false, message: "Delivery status is unavailable." }, 503);
  const offset = Number(new URL(request.url).searchParams.get("offset") || 0);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) return json({ ok: false, message: "Invalid delivery page." }, 400);
  const result = await db.rpc("service_email_admin_status", { p_offset: offset });
  if (result.error || !result.data) return json({ ok: false, message: "The service email outbox is not installed or is unavailable." }, 503);
  return json({ ok: true, status: result.data });
}

export async function POST(request: Request) {
  const auth = await getAdminContext(request);
  if (!auth.ok || !auth.user) return json({ ok: false, message: auth.message }, auth.status);
  const body = await request.json().catch(() => null);
  if (!body || !/^[a-f0-9-]{36}$/i.test(body.intentId || "") || !["retry", "confirmed_accepted", "confirmed_not_accepted"].includes(body.resolution)
    || typeof body.reason !== "string" || body.reason.trim().length < 10 || body.reason.length > 1000
    || (body.providerMessageId !== undefined && (typeof body.providerMessageId !== "string" || body.providerMessageId.length > 300))) {
    return json({ ok: false, message: "Select a delivery and record the evidence supporting this decision." }, 400);
  }
  const db = createServerSupabaseClient();
  if (!db) return json({ ok: false, message: "Delivery status is unavailable." }, 503);
  const result = await db.rpc("retry_service_email_intent", { p_intent_id: body.intentId, p_actor_id: auth.user.id, p_admin: true,
    p_resolution: body.resolution, p_reason: body.reason.trim(), p_provider_message_id: body.providerMessageId?.trim() || null });
  if (result.error || result.data !== true) return json({ ok: false, message: "The delivery is not eligible for that action or has changed. Refresh its status." }, 409);
  const receipt = await db.rpc("service_email_intent_status", { p_intent_id: body.intentId });
  if (receipt.error || !receipt.data) return json({ ok: false, committed: true, message: "The review was saved, but its current status is unavailable. Refresh before taking another action." }, 503);
  return json({ ok: true, message: receipt.data.state === "accepted" ? "Provider acceptance recorded. No new email was sent."
    : receipt.data.state === "retry" ? "Retry queued. No email was sent by this action." : "Delivery review recorded. This email will not be sent again." });
}
