import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { assertAccountCanWrite, isAdminRole, normalizeEmail, readAdminEmailList } from "../../../lib/admin-auth";
import { createServerSupabaseClient, getAuthenticatedUser } from "../../../lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const HEADERS = { "Cache-Control": "no-store, no-cache, must-revalidate" };
type Client = NonNullable<ReturnType<typeof createServerSupabaseClient>>;

type Guitar = { id: string; owner_id: string | null; visibility: string; admin_archived_at?: string | null; owner_removed_at?: string | null };
type MediaRow = {
  id: string;
  guitar_id: string;
  provider: "youtube" | "vimeo" | "audio" | "link";
  canonical_url: string;
  provider_id: string | null;
  title: string;
  caption: string;
  thumbnail_url: string | null;
  is_public: boolean;
  sort_order: number;
  created_at: string;
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: HEADERS });
}

function clean(value: unknown, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function mapRow(row: MediaRow) {
  return {
    id: row.id,
    provider: row.provider,
    canonicalUrl: row.canonical_url,
    providerId: row.provider_id || undefined,
    title: row.title,
    caption: row.caption,
    thumbnailUrl: row.thumbnail_url || undefined,
    isPublic: row.is_public,
    sortOrder: row.sort_order,
    createdAt: row.created_at
  };
}

function parseMediaUrl(input: unknown) {
  const raw = clean(input, 1000);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  let provider: MediaRow["provider"] = "link";
  let providerId = "";

  if (host === "youtu.be") {
    provider = "youtube";
    providerId = url.pathname.split("/").filter(Boolean)[0] || "";
  } else if (host === "youtube.com" || host === "m.youtube.com") {
    provider = "youtube";
    providerId = url.pathname.startsWith("/shorts/") || url.pathname.startsWith("/embed/")
      ? url.pathname.split("/").filter(Boolean)[1] || ""
      : url.searchParams.get("v") || "";
  } else if (host === "vimeo.com" || host === "player.vimeo.com") {
    provider = "vimeo";
    providerId = url.pathname.split("/").filter(Boolean).find((part) => /^\d+$/.test(part)) || "";
  } else if (host === "soundcloud.com" || host.endsWith(".bandcamp.com")) {
    provider = "audio";
  }

  if ((provider === "youtube" || provider === "vimeo") && !/^[A-Za-z0-9_-]{6,20}$/.test(providerId)) {
    return null;
  }

  const canonicalUrl = provider === "youtube"
    ? `https://www.youtube.com/watch?v=${providerId}`
    : provider === "vimeo"
      ? `https://vimeo.com/${providerId}`
      : url.toString();

  return { provider, providerId: providerId || null, canonicalUrl };
}

async function loadGuitar(client: Client, code: string) {
  const result = await client.from("guitars").select("id,owner_id,visibility,admin_archived_at,owner_removed_at").eq("qr_code", code).maybeSingle<Guitar>();
  if (result.error) throw new Error(result.error.message);
  return result.data || null;
}

async function isAdmin(client: Client, user: User) {
  if (readAdminEmailList().includes(normalizeEmail(user.email))) return true;
  const profile = await client.from("profiles").select("role").eq("id", user.id).maybeSingle<{ role?: string | null }>();
  return isAdminRole(profile.data?.role);
}

async function requireManager(request: Request, client: Client, guitar: Guitar) {
  const auth = await getAuthenticatedUser(request);
  if (!auth.user) return { user: null, admin: false, error: auth.error || "Sign in required.", status: 401 };
  const admin = await isAdmin(client, auth.user);
  if (guitar.owner_id !== auth.user.id && !admin) return { user: auth.user, admin, error: "Only the Profile owner or QRguitar admin can manage media.", status: 403 };
  const write = await assertAccountCanWrite(client, auth.user);
  if (!write.ok) return { user: auth.user, admin, error: write.message, status: write.status };
  return { user: auth.user, admin, error: "", status: 200 };
}

export async function GET(request: Request) {
  const client = createServerSupabaseClient();
  if (!client) return json({ ok: false, mediaItems: [], message: "Supabase is not configured." }, 500);
  const url = new URL(request.url);
  const code = clean(url.searchParams.get("code"), 80).toUpperCase();
  const ownerScope = url.searchParams.get("scope") === "owner";
  const guitar = code ? await loadGuitar(client, code) : null;
  if (!guitar) return json({ ok: false, mediaItems: [], message: "QRguitar Profile not found." }, 404);

  if (!ownerScope && (guitar.visibility === "private" || guitar.admin_archived_at || guitar.owner_removed_at)) {
    return json({ ok: false, mediaItems: [], message: "QRguitar Profile not found." }, 404);
  }
  if (ownerScope) {
    const access = await requireManager(request, client, guitar);
    if (access.error) return json({ ok: false, mediaItems: [], message: access.error }, access.status);
  }

  let query = client.from("guitar_external_media").select("id,guitar_id,provider,canonical_url,provider_id,title,caption,thumbnail_url,is_public,sort_order,created_at").eq("guitar_id", guitar.id).order("sort_order").order("created_at");
  if (!ownerScope) query = query.eq("is_public", true);
  const result = await query;
  if (result.error) return json({ ok: false, mediaItems: [], message: result.error.message }, /does not exist/i.test(result.error.message) ? 503 : 500);
  return json({ ok: true, mediaItems: ((result.data || []) as MediaRow[]).map(mapRow) });
}

export async function POST(request: Request) {
  const client = createServerSupabaseClient();
  if (!client) return json({ ok: false, message: "Supabase is not configured." }, 500);
  const auth = await getAuthenticatedUser(request);
  if (!auth.user) return json({ ok: false, message: auth.error || "Sign in required." }, 401);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const code = clean(body?.qrCode, 80).toUpperCase();
  const guitar = code ? await loadGuitar(client, code) : null;
  if (!guitar) return json({ ok: false, message: "QRguitar Profile not found." }, 404);
  const access = await requireManager(request, client, guitar);
  if (access.error || !access.user) return json({ ok: false, message: access.error }, access.status);
  const parsed = parseMediaUrl(body?.url);
  if (!parsed) return json({ ok: false, message: "Use a valid HTTPS YouTube, Vimeo, audio, or media URL." }, 400);
  const title = clean(body?.title, 180);
  if (!title) return json({ ok: false, message: "Media title is required." }, 400);

  const created = await client.from("guitar_external_media").insert({
    guitar_id: guitar.id,
    provider: parsed.provider,
    canonical_url: parsed.canonicalUrl,
    provider_id: parsed.providerId,
    title,
    caption: clean(body?.caption, 1000),
    is_public: body?.isPublic === true,
    sort_order: Math.max(0, Number(body?.sortOrder || 0)),
    created_by: access.user.id
  }).select("id,guitar_id,provider,canonical_url,provider_id,title,caption,thumbnail_url,is_public,sort_order,created_at").single<MediaRow>();
  if (created.error || !created.data) return json({ ok: false, message: created.error?.message || "Could not add media." }, 500);
  return json({ ok: true, mediaItem: mapRow(created.data), message: "Media added." });
}

export async function PATCH(request: Request) {
  const client = createServerSupabaseClient();
  if (!client) return json({ ok: false, message: "Supabase is not configured." }, 500);
  const auth = await getAuthenticatedUser(request);
  if (!auth.user) return json({ ok: false, message: auth.error || "Sign in required." }, 401);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const code = clean(body?.qrCode, 80).toUpperCase();
  const id = clean(body?.id, 80);
  const guitar = code ? await loadGuitar(client, code) : null;
  if (!guitar || !id) return json({ ok: false, message: "Profile and media item are required." }, 400);
  const access = await requireManager(request, client, guitar);
  if (access.error) return json({ ok: false, message: access.error }, access.status);

  const updates: Record<string, unknown> = {};
  if (Object.prototype.hasOwnProperty.call(body, "title")) {
    const title = clean(body?.title, 180);
    if (!title) return json({ ok: false, message: "Media title is required." }, 400);
    updates.title = title;
  }
  if (Object.prototype.hasOwnProperty.call(body, "caption")) updates.caption = clean(body?.caption, 1000);
  if (typeof body?.isPublic === "boolean") updates.is_public = body.isPublic;
  if (Number.isFinite(Number(body?.sortOrder))) updates.sort_order = Math.max(0, Math.floor(Number(body?.sortOrder)));
  if (!Object.keys(updates).length) return json({ ok: false, message: "No media changes were provided." }, 400);

  const updated = await client.from("guitar_external_media").update(updates).eq("id", id).eq("guitar_id", guitar.id)
    .select("id,guitar_id,provider,canonical_url,provider_id,title,caption,thumbnail_url,is_public,sort_order,created_at").maybeSingle<MediaRow>();
  if (updated.error || !updated.data) return json({ ok: false, message: updated.error?.message || "Could not update media." }, 500);
  return json({ ok: true, mediaItem: mapRow(updated.data), message: "Media updated." });
}

export async function DELETE(request: Request) {
  const client = createServerSupabaseClient();
  if (!client) return json({ ok: false, message: "Supabase is not configured." }, 500);
  const auth = await getAuthenticatedUser(request);
  if (!auth.user) return json({ ok: false, message: auth.error || "Sign in required." }, 401);
  const url = new URL(request.url);
  const code = clean(url.searchParams.get("code"), 80).toUpperCase();
  const id = clean(url.searchParams.get("id"), 80);
  const guitar = code ? await loadGuitar(client, code) : null;
  if (!guitar || !id) return json({ ok: false, message: "Profile and media item are required." }, 400);
  const access = await requireManager(request, client, guitar);
  if (access.error) return json({ ok: false, message: access.error }, access.status);
  const deleted = await client.from("guitar_external_media").delete().eq("id", id).eq("guitar_id", guitar.id);
  if (deleted.error) return json({ ok: false, message: deleted.error.message }, 500);
  return json({ ok: true, message: "Media removed." });
}
