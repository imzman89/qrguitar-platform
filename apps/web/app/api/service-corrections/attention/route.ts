import { NextResponse } from "next/server";
import { createServerSupabaseClient, getAuthenticatedUser } from "../../../../lib/supabase-server";
export const dynamic = "force-dynamic";
export const revalidate = 0;
const uuid = (v: unknown) => typeof v === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
function json(body: unknown, status = 200) {
 return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } });
}
function unavailable(status = 503) {
 return json({ ok: false, message: "Service corrections could not be checked. Please try again." }, status);
}
export async function GET(request: Request) {
 try {
  const auth = await getAuthenticatedUser(request);
  if (!auth.user) return json({ ok: false }, 401);
  if (new URL(request.url).searchParams.size) return json({ ok: false }, 400);
  const db = createServerSupabaseClient();
  if (!db) return unavailable();
  const result = await db.rpc("read_owner_service_correction_attention", { p_actor_id: auth.user.id })
   .abortSignal(AbortSignal.timeout(10000));
  if (result.error) return unavailable(result.error.code === "42501" || result.error.code === "PD423" ? 403 : 503);
  if (!Array.isArray(result.data) || result.data.some(row => !uuid(row?.submissionId) ||
   typeof row.qrCode !== "string" || row.qrCode.length > 80 || !/^QRG-[A-Z0-9_-]+$/.test(row.qrCode) ||
   !Number.isSafeInteger(row.pendingCount) || row.pendingCount < 1)) return unavailable();
  return json({ ok: true, items: result.data.map(row => ({
   submissionId: row.submissionId, qrCode: row.qrCode, pendingCount: row.pendingCount
  })) });
 } catch { return unavailable(); }
}
