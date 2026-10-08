import { NextResponse } from "next/server";
import { assertAccountCanWrite } from "../../../lib/admin-auth";
import { cleanPublicCollection, publicCollectionOwnerKey } from "../../../lib/public-collections";
import { canUsePrivateServiceSlips, isSlipId, readServiceSlip, readSavedServiceSlip } from "../../../lib/service-slips";
import { createServerSupabaseClient, getAuthenticatedUser } from "../../../lib/supabase-server";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store, max-age=0", "Vary": "Authorization" } });
}
async function context(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (!auth.user) return { error: json({ ok: false, message: "Sign in to open your service slips." }, 401) };
  const db = createServerSupabaseClient();
  if (!db) return { error: json({ ok: false, message: "Service slips are temporarily unavailable." }, 503) };
  const access = await assertAccountCanWrite(db, auth.user);
  if (!access.ok) return { error: json({ ok: false, message: access.message }, access.status) };
  const settings = await db.from("site_content").select("content_value").eq("content_key", publicCollectionOwnerKey(auth.user.id)).maybeSingle();
  if (settings.error) return { error: json({ ok: false, message: "Could not check your workspace. Try again." }, 503) };
  const collection = cleanPublicCollection(settings.data?.content_value);
  if (!canUsePrivateServiceSlips(collection.accountType)) return { error: json({ ok: false, message: "Service slips are available in store and luthier workspaces." }, 403) };
  return { db, actor: auth.user.id };
}
const columns = "id,owner_id,revision,data,created_at,updated_at";
export async function GET(request: Request) {
  try {
    const ctx = await context(request); if (ctx.error) return ctx.error;
    const url = new URL(request.url), id = url.searchParams.get("id");
    if (id !== null) {
      if (!isSlipId(id)) return json({ ok: false, message: "Invalid service slip link." }, 400);
      const row = await ctx.db.from("private_service_slips").select(columns).eq("owner_id", ctx.actor).eq("id", id).maybeSingle();
      if (row.error) return json({ ok: false, message: "Could not load this slip. Try again." }, 503);
      if (!row.data) return json({ ok: false, message: "This slip is not available in your account." }, 404);
      return json({ ok: true, actorId: ctx.actor, slip: readSavedServiceSlip(row.data, ctx.actor) });
    }
    const rawOffset = url.searchParams.get("offset") || "0";
    if (!/^\d{1,6}$/.test(rawOffset)) return json({ ok: false, message: "Invalid page." }, 400);
    const offset = Number(rawOffset);
    const result = await ctx.db.from("private_service_slips").select(columns).eq("owner_id", ctx.actor)
      .order("updated_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + 50);
    if (result.error || !Array.isArray(result.data)) return json({ ok: false, message: "Could not load your slips. Try again." }, 503);
    const slips = result.data.slice(0, 50).map(row => readSavedServiceSlip(row, ctx.actor));
    return json({ ok: true, actorId: ctx.actor, slips, hasMore: result.data.length > 50 });
  } catch { return json({ ok: false, message: "Service slips could not be loaded. Try again." }, 503); }
}
export async function PUT(request: Request) {
  try {
    const ctx = await context(request); if (ctx.error) return ctx.error;
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 65536) return json({ ok: false, message: "This slip is too long." }, 413);
    let body: Record<string, unknown>;
    try { body = JSON.parse(raw); } catch { return json({ ok: false, message: "Invalid slip details." }, 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ ok: false, message: "Invalid slip details." }, 400);
    if (body.expectedActorId !== ctx.actor) return json({ ok: false, message: "Your account changed. Reload before saving." }, 409);
    if (!isSlipId(body.id) || !Number.isSafeInteger(body.expectedRevision) || Number(body.expectedRevision) < 0 || Number(body.expectedRevision) >= 2147483646) {
      return json({ ok: false, message: "Reload the slip before saving." }, 400);
    }
    let data;
    try { data = readServiceSlip(body.data); } catch (error) { return json({ ok: false, message: error instanceof Error ? error.message : "Check the slip details." }, 400); }
    const saved = await ctx.db.rpc("save_private_service_slip", { p_actor: ctx.actor, p_id: body.id, p_expected_revision: body.expectedRevision, p_data: data });
    if (saved.error) {
      const code = saved.error.code;
      if (code === "PD423") return json({ ok: false, message: "Service slip changes are paused while your account privacy request is being processed." }, 423);
      if (code === "40001") return json({ ok: false, conflict: true, message: "A newer version was saved. Reload before editing again." }, 409);
      if (code === "P0002") return json({ ok: false, message: "This slip is not available in your account." }, 404);
      if (code === "42501") return json({ ok: false, message: "Your workspace cannot save service slips." }, 403);
      return json({ ok: false, uncertain: true, message: "The save could not be confirmed. Retry the same save or reload the saved slip." }, 503);
    }
    const slip = readSavedServiceSlip(saved.data, ctx.actor);
    if (slip.id !== body.id || slip.revision !== Number(body.expectedRevision) + 1 || JSON.stringify(slip.data) !== JSON.stringify(data)) {
      return json({ ok: false, uncertain: true, message: "The save could not be confirmed. Reload the saved slip." }, 503);
    }
    return json({ ok: true, committed: true, actorId: ctx.actor, slip });
  } catch { return json({ ok: false, uncertain: true, message: "The save could not be confirmed. Retry the same save or reload the saved slip." }, 503); }
}
