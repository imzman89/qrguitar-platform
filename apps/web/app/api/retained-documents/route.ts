import { NextResponse } from "next/server";
import { createServerSupabaseClient, getAuthenticatedUser } from "../../../lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
type DocumentRow = { id: string; guitar_id: string; name: string; file_name: string | null;
  storage_path: string; mime_type: string | null; file_size_bytes: number | null; created_at: string };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });
const unavailable = () => json({ ok: false, message: "Private files could not be loaded." }, 503);

export async function GET(request: Request) {
  const client = createServerSupabaseClient();
  if (!client) return unavailable();
  const auth = await getAuthenticatedUser(request);
  if (!auth.user) return json({ ok: false, message: "Sign in required." }, 401);
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const rawOffset = url.searchParams.get("offset") || "0";
  if (!/^\d{1,6}$/.test(rawOffset) || Number(rawOffset) > 100000
    || (id !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)))
    return json({ ok: false, message: "Invalid file query." }, 400);
  try {
    const result = await client.rpc("read_retained_private_documents", {
      p_actor_id: auth.user.id, p_offset: id ? 0 : Number(rawOffset), p_document_id: id
    });
    if (result.error) return result.error.code === "42501"
      ? json({ ok: false, message: "This account cannot access private files." }, 403) : unavailable();
    const payload = result.data as { ok?: boolean; documents?: DocumentRow[] } | null;
    if (payload?.ok !== true || !Array.isArray(payload.documents)) return unavailable();
    if (!id) return json({ ok: true, hasMore: payload.documents.length > 50,
      documents: payload.documents.slice(0, 50).map(d => ({
        id: d.id, name: d.name, fileName: d.file_name || d.name, createdAt: d.created_at
      })) });
    const document = payload.documents.find(d => d.id === id);
    if (!document || !document.storage_path || /^(https?:|data:|blob:|\/)/i.test(document.storage_path))
      return json({ ok: false, message: "File not found." }, 404);
    const download = await client.storage.from("instrument-documents").download(document.storage_path);
    if (download.error || !download.data) return unavailable();
    const type = download.data.type.toLowerCase();
    if (!allowedTypes.has(type) || !Number.isSafeInteger(download.data.size)
      || download.data.size < 1 || download.data.size > 16 * 1024 * 1024
      || (document.mime_type && document.mime_type.toLowerCase() !== type)
      || (document.file_size_bytes !== null && Number(document.file_size_bytes) !== download.data.size))
      return unavailable();
    // No signed Storage capability: every file request is authenticated against its custodian.
    return new NextResponse(download.data.stream(), { headers: {
      ...headers, "Content-Type": type, "Content-Disposition": "attachment"
    } });
  } catch { return unavailable(); }
}
