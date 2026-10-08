import sharp from "sharp";
import { NextResponse } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import { createServerSupabaseClient } from "../../../../../../lib/supabase-server";
import { isEligiblePublicProfile, isRetiredPublicProfileCode, normalizePublicProfileCode } from "../../../../../../lib/public-profile-eligibility";
import { publicFileToken, type PublicFileKind } from "../../../../../../lib/public-file-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const ALLOWED_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_DOCUMENT_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
const VARIANT_WIDTHS = new Set([160, 400, 640, 1200]);
const MAX_VARIANT_INPUT_BYTES = 12 * 1024 * 1024;
const MAX_VARIANT_INPUT_PIXELS = 40_000_000;

function notFound() {
  return NextResponse.json(
    { ok: false, message: "File not found." },
    { status: 404, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }
  );
}

function invalidVariant() {
  return NextResponse.json(
    { ok: false, message: "Invalid image variant." },
    { status: 400, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } }
  );
}

function requestedVariant(request: Request, kind: PublicFileKind) {
  const searchParams = new URL(request.url).searchParams;
  const entries = Array.from(searchParams.entries());
  if (!entries.length) return null;
  if (
    kind !== "media" ||
    entries.length !== 2 ||
    entries.filter(([key]) => key === "w").length !== 1 ||
    entries.filter(([key]) => key === "format").length !== 1
  ) {
    return false;
  }

  const widthValue = searchParams.get("w") || "";
  const width = /^\d+$/.test(widthValue) ? Number(widthValue) : 0;
  if (!VARIANT_WIDTHS.has(width) || searchParams.get("format") !== "webp") return false;
  return { width };
}

function responseHeaders(contentType: string) {
  return {
    "Cache-Control": "private, no-store",
    "Content-Type": contentType,
    "Content-Disposition": "inline",
    "X-Content-Type-Options": "nosniff"
  };
}

export async function GET(
  request: Request,
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
      .select("storage_path").eq("retained_private", false)
      .eq("guitar_id", guitar.id)
      .eq("is_public", true);
    if (documentResult.error) return notFound();
    bucket = "instrument-documents";
    storagePaths = ((documentResult.data || []) as Array<{ storage_path: string }>).map((item) => item.storage_path);
  }

  const storagePath = Array.from(new Set(storagePaths.map((value) => String(value || "").trim()).filter(Boolean)))
    .find((value) => publicFileToken(code, kind, value) === params.token);
  if (!storagePath || /^(https?:|data:|blob:|\/)/i.test(storagePath)) return notFound();

  const variant = requestedVariant(request, kind);
  if (variant === false) return invalidVariant();

  const download = await supabase.storage.from(bucket).download(storagePath);
  if (download.error || !download.data) return notFound();

  const contentType = String(download.data.type || "application/octet-stream").toLowerCase();
  const allowedTypes = kind === "media" ? ALLOWED_MEDIA_TYPES : ALLOWED_DOCUMENT_TYPES;
  if (!allowedTypes.has(contentType)) return notFound();

  if (variant) {
    if (!Number.isSafeInteger(download.data.size) || download.data.size < 1 || download.data.size > MAX_VARIANT_INPUT_BYTES) {
      return notFound();
    }
    try {
      const input = Buffer.from(await download.data.arrayBuffer());
      if (input.byteLength !== download.data.size) return notFound();
      const output = await sharp(input, {
        failOn: "error",
        limitInputPixels: MAX_VARIANT_INPUT_PIXELS,
        sequentialRead: true
      })
        .rotate()
        .resize({ width: variant.width, height: variant.width, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82, effort: 4 })
        .toBuffer();
      return new NextResponse(new Uint8Array(output), {
        status: 200,
        headers: responseHeaders("image/webp")
      });
    } catch {
      return notFound();
    }
  }

  return new NextResponse(download.data.stream(), {
    status: 200,
    headers: responseHeaders(contentType)
  });
}
