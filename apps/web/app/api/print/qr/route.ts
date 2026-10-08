import { NextResponse } from "next/server";
import { createServerSupabaseClient, getAuthenticatedUser } from "../../../../lib/supabase-server";
import { supabasePagedRows } from "../../../../lib/supabase-pagination";
import { isEligiblePublicProfile } from "../../../../lib/public-profile-eligibility";
import { validateQrBatchRecords } from "../../../../lib/qr-batch-client";
import { createQrBatchPdf } from "../../../../lib/qr-batch-pdf";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Authorization" } });
}
type PrintRow = { qr_code: string; name: string | null; brand: string | null; model: string | null; serial_number?: string | null; visibility: string | null; admin_archived_at: string | null; owner_removed_at: string | null };

async function readInventory(request: Request) {
    const auth = await getAuthenticatedUser(request);
    if (!auth.user) return json({ ok: false, message: "Sign in to print labels from your inventory." }, 401);
    const db = createServerSupabaseClient();
    if (!db) throw new Error("Inventory unavailable");
    const profile = await db.from("profiles").select("id,account_status,hide_public_content").eq("id", auth.user.id).maybeSingle();
    if (profile.error || !profile.data) throw new Error("Account check unavailable");
    if (profile.data.hide_public_content === true || ["banned", "removed"].includes(profile.data.account_status || "")) return json({ ok: false, message: "Customer-facing labels are unavailable for this account." }, 403);
    const query = new URL("/rest/v1/guitars", "https://supabase.invalid");
    query.searchParams.set("select", "qr_code,name,brand,model,serial_number,visibility,admin_archived_at,owner_removed_at");
    query.searchParams.set("owner_id", `eq.${auth.user.id}`);
    query.searchParams.set("admin_archived_at", "is.null");
    query.searchParams.set("owner_removed_at", "is.null");
    query.searchParams.set("order", "created_at.desc,id.asc");
    const rows = await supabasePagedRows<PrintRow>(query.pathname + query.search, { serviceRole: true });
    const instruments = rows.map(row => ({ qrCode: row.qr_code,
      title: row.name?.trim() || [row.brand, row.model].filter(Boolean).join(" ") || row.qr_code,
      ...(row.serial_number ? { serial: row.serial_number } : {}),
      isPublic: isEligiblePublicProfile(row, { ownerProfile: profile.data }) }));
    return { actorId: auth.user.id, instruments };
}

export async function GET(request: Request) {
  try {
    const inventory = await readInventory(request);
    return inventory instanceof Response ? inventory : json({ ok: true, ...inventory });
  } catch { return json({ ok: false, message: "Your saved inventory could not be checked. Try again." }, 503); }
}

export async function POST(request: Request) {
  try {
    const inventory = await readInventory(request);
    if (inventory instanceof Response) return inventory;
    const raw = await request.text();
    if (raw.length > 128000) return json({ ok: false, message: "This batch is too large." }, 413);
    let body;
    try { body = JSON.parse(raw); } catch { return json({ ok: false, message: "Check the label batch details." }, 400); }
    if (body?.expectedActorId !== inventory.actorId) return json({ ok: false, message: "Your account changed. Prepare a new batch." }, 409);
    if (!Array.isArray(body.requests) || !body.settings) return json({ ok: false, message: "Choose instruments and paper before downloading." }, 400);
    try {
      // The server independently checks the entire saved selection before producing bytes.
      validateQrBatchRecords(inventory.instruments, body.requests);
      const pdf = createQrBatchPdf(body.requests, body.settings);
      const bytes = new ArrayBuffer(pdf.byteLength); new Uint8Array(bytes).set(pdf);
      return new NextResponse(bytes, { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="qrguitar-qr-labels.pdf"', "Cache-Control": "private, no-store, max-age=0", Vary: "Authorization", "X-Content-Type-Options": "nosniff" } });
    } catch (error) { return json({ ok: false, message: error instanceof Error ? error.message : "Check your selected Profiles and paper settings." }, 400); }
  } catch { return json({ ok: false, message: "Your saved inventory could not be checked. Try downloading again." }, 503); }
}
