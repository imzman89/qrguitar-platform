import { NextResponse } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import { createServerSupabaseClient } from "../../../../../../lib/supabase-server";
import { isEligiblePublicProfile, isRetiredPublicProfileCode, normalizePublicProfileCode } from "../../../../../../lib/public-profile-eligibility";
import { publicFileToken, type PublicFileKind } from "../../../../../../lib/public-file-url";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const ALLOWED_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_DOCUMENT_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

function notFound() {
  return NextResponse.json(
    { ok: false, message: "File not found." },
    { status: 404, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }
  );
}

export async function GET(
  _request: Request,
  { params: paramsPromise }: { params: Promise<{ code: string; kind: string; token: string }> }
) {
  noStore();
  const params = await paramsPromise;
  const code = normalizePublicProfileCode(params.code);
  const kind = params.kind === "media" || params.kind === "document" ? params.kind as PublicFileKind : null;
  if (!code || !kind || isRetiredPublicProfileCode(code)) return notFound();

  const supabase = createServerSupabaseClient();
  if (!supabase) return notFound();

  const guitarResult = await supabase
    .from("guitars")
    .select("id,owner_id,qr_code,visibility,hero_image_path,admin_archived_at,owner_removed_at")
    .eq("qr_code", code)
    .maybeSingle<{
      id: string;
      owner_id: string | null;
      qr_code: string;
      visibility: string | null;
      hero_image_path: string | null;
      admin_archived_at: string | null;
      owner_removed_at: string | null;
    }>();
  if (guitarResult.error || !guitarResult.data) return notFound();

  const guitar = guitarResult.data;
  const ownerResult = guitar.owner_id
    ? await supabase
        .from("profiles")
        .select("account_status,hide_public_content")
        .eq("id", guitar.owner_id)
        .maybeSingle<{ account_status: string | null; hide_public_content: boolean | null }>()
    : { data: null, error: null };

  if (
    ownerResult.error ||
    !isEligiblePublicProfile(guitar, { allowUnlisted: true, ownerProfile: ownerResult.data })
  ) {
    return notFound();
  }

  let bucket = "";
  let storagePaths: string[] = [];
  if (kind === "media") {
    const mediaResult = await supabase
      .from("guitar_media")
      .select("storage_path")
      .eq("guitar_id", guitar.id);
    if (mediaResult.error) return notFound();
    bucket = "instrument-media";
    storagePaths = [
      guitar.hero_image_path || "",
      ...((mediaResult.data || []) as Array<{ storage_path: string }>).map((item) => item.storage_path)
    ];
  } else {
    const documentResult = await supabase
      .from("guitar_documents")
      .select("storage_path")
      .eq("guitar_id", guitar.id)
      .eq("is_public", true);
    if (documentResult.error) return notFound();
    bucket = "instrument-documents";
    storagePaths = ((documentResult.data || []) as Array<{ storage_path: string }>).map((item) => item.storage_path);
  }

  const storagePath = Array.from(new Set(storagePaths.map((value) => String(value || "").trim()).filter(Boolean)))
    .find((value) => publicFileToken(code, kind, value) === params.token);
  if (!storagePath || /^(https?:|data:|blob:|\/)/i.test(storagePath)) return notFound();

  const download = await supabase.storage.from(bucket).download(storagePath);
  if (download.error || !download.data) return notFound();

  const contentType = String(download.data.type || "application/octet-stream").toLowerCase();
  const allowedTypes = kind === "media" ? ALLOWED_MEDIA_TYPES : ALLOWED_DOCUMENT_TYPES;
  if (!allowedTypes.has(contentType)) return notFound();

  return new NextResponse(download.data.stream(), {
    status: 200,
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": contentType,
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
