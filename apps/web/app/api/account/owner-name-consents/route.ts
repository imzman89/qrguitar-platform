import { NextResponse } from "next/server";
import { createServerSupabaseClientWithTimeout, getAuthenticatedUser } from "../../../../lib/supabase-server";
import { cleanOwnerPublicName, ownerNameUuid, ownerNameVersion, readOwnerNameItem } from "../../../../lib/owner-name-consent";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
const json = (v: unknown, status = 200) => NextResponse.json(v, { status, headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } });
const fail = (message: string, status: number, unknown = false) => json({ ok: false, message, ...(unknown ? { commitStatus: "unknown" } : {}) }, status);
async function body(request: Request) {
  if (!request.body) return null;
  const reader = request.body.getReader(), chunks: Uint8Array[] = []; let bytes = 0;
  try { while (true) { const r = await reader.read(); if (r.done) break; bytes += r.value.length; if (bytes > 4096) { await reader.cancel(); return null; } chunks.push(r.value); } }
  finally { reader.releaseLock(); }
  const buffer = new Uint8Array(bytes); let i = 0; for (const c of chunks) { buffer.set(c, i); i += c.length; }
  try { const v: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer)); return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null; } catch { return null; }
}
export async function GET(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (!auth.user) return fail("Sign in to review your own name settings.", 401);
  const client = createServerSupabaseClientWithTimeout(8000);
  if (!client) return fail("Name settings are unavailable. Please retry.", 503);
  const search = new URL(request.url).searchParams, cursor = search.get("cursor");
  if ([...search.keys()].some(k => k !== "cursor") || search.getAll("cursor").length > 1 || (cursor !== null && !ownerNameUuid(cursor))) return fail("Invalid event page.", 400);
  try {
    const r = await client.rpc("list_owner_name_consents", { p_actor_id: auth.user.id, p_cursor: cursor, p_limit: 100 });
    if (r.error) return fail("Could not load your name settings.", r.error.code === "42501" ? 403 : 503);
    const p = r.data as Record<string, unknown> | null;
    if (!p || p.ok !== true || p.actorId !== auth.user.id || !Array.isArray(p.items) || p.items.length > 100
        || (p.nextCursor !== null && !ownerNameUuid(p.nextCursor))) return fail("Could not verify your name settings.", 503);
    const items = p.items.map(readOwnerNameItem);
    if (new Set(items.map(x => x.eventId)).size !== items.length || items.some((x, i) => (cursor && x.eventId <= cursor) || (i > 0 && x.eventId <= items[i - 1].eventId))
      || (p.nextCursor !== null && p.nextCursor !== items.at(-1)?.eventId)) return fail("Could not verify your name settings.", 503);
    return json({ ok: true, actorId: auth.user.id, items, nextCursor: p.nextCursor });
  } catch { return fail("Could not verify your name settings. Please retry.", 503); }
}
export async function PATCH(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (!auth.user) return fail("Sign in to change your own name setting.", 401);
  let p: Record<string, unknown> | null;
  try { p = await body(request); } catch { return fail("Could not read the requested name setting.", 400); }
  if (!p || Object.keys(p).some(k => !["expectedActorId", "eventId", "enabled", "publicName", "expectedVersion"].includes(k))
    || !ownerNameUuid(p.expectedActorId) || p.expectedActorId !== auth.user.id || !ownerNameUuid(p.eventId)
    || typeof p.enabled !== "boolean" || !ownerNameVersion(p.expectedVersion)
    || (p.enabled ? !cleanOwnerPublicName(p.publicName) || p.publicName !== cleanOwnerPublicName(p.publicName) : p.publicName !== null)) return fail("Check your name setting or reload the current account.", 400);
  const client = createServerSupabaseClientWithTimeout(8000);
  if (!client) return fail("Name settings are unavailable. Please retry.", 503);
  try {
    const r = await client.rpc("save_owner_name_consent", { p_actor_id: auth.user.id, p_event_id: p.eventId, p_enabled: p.enabled, p_public_name: p.publicName, p_expected_version: p.expectedVersion });
    if (r.error) {
      const code = r.error.code;
      if (code === "PT409") return fail("This saved setting changed. Reload before sharing a name.", 409);
      if (code === "PD423") return fail("A privacy change is in progress. Retry removal or reload before sharing a name.", 423);
      if (code === "42501") return fail("Only your own outgoing-owner name can be changed.", 403);
      if (code === "22023") return fail("Check the explicit name and reload the saved setting.", 400);
      return fail("The save is not confirmed. Reload before sharing a name.", 503, true);
    }
    const result = r.data as Record<string, unknown> | null;
    if (!result || result.ok !== true || result.actorId !== auth.user.id) return fail("The save is not confirmed. Reload before sharing a name.", 503, true);
    const item = readOwnerNameItem(result.item);
    if (item.eventId !== p.eventId || item.enabled !== p.enabled || item.publicName !== p.publicName || BigInt(item.version) <= BigInt(p.expectedVersion)) return fail("The save is not confirmed. Reload before sharing a name.", 503, true);
    return json({ ok: true, actorId: auth.user.id, item });
  } catch { return fail("The save is not confirmed. Reload before sharing a name.", 503, true); }
}

