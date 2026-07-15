import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabase-server";
import { normalizeSerialBuildId } from "../../../../lib/instrument-profile-contract";
import { getPublicInstrumentByCode } from "../../../../lib/public-instruments";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 12;
const NO_STORE_HEADERS = { "Cache-Control": "no-store, no-cache, must-revalidate" };

type SerialAliasRow = { guitar_id: string };
type GuitarMatchRow = {
  id: string;
  qr_code: string;
  visibility: string;
  admin_archived_at?: string | null;
  owner_removed_at?: string | null;
};

function response(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

function requestKey(request: Request) {
  return (request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown")
    .split(",")[0]
    .trim();
}

function rateLimited(key: string) {
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > MAX_ATTEMPTS;
}

export async function POST(request: Request) {
  if (rateLimited(requestKey(request))) {
    return response({ ok: false, message: "Too many serial lookups. Try again in a few minutes." }, 429);
  }

  let rawSerial = "";
  try {
    const body = await request.json() as { serial?: string };
    rawSerial = String(body.serial || "");
  } catch {
    return response({ ok: false, message: "Enter an exact Serial Number." }, 400);
  }

  const normalized = normalizeSerialBuildId(rawSerial);
  if (normalized.length < 4) {
    return response({ ok: false, message: "Enter at least four letters or numbers from the exact Serial Number." }, 400);
  }

  const supabase = createServerSupabaseClient();
  if (!supabase) {
    return response({ ok: false, message: "Serial lookup is temporarily unavailable." }, 503);
  }

  let guitarId = "";
  const aliasResult = await supabase
    .from("guitar_serial_aliases")
    .select("guitar_id")
    .eq("serial_normalized", normalized)
    .maybeSingle<SerialAliasRow>();

  if (!aliasResult.error && aliasResult.data?.guitar_id) {
    guitarId = aliasResult.data.guitar_id;
  } else if (aliasResult.error && !/does not exist|schema cache/i.test(aliasResult.error.message)) {
    return response({ ok: false, message: "Serial lookup is temporarily unavailable." }, 503);
  }

  if (!guitarId) {
    const fallback = await supabase
      .from("guitars")
      .select("id,serial_number")
      .not("serial_number", "is", null)
      .limit(5000);
    if (fallback.error) {
      return response({ ok: false, message: "Serial lookup is temporarily unavailable." }, 503);
    }
    guitarId = (fallback.data || []).find((row) => normalizeSerialBuildId(String(row.serial_number || "")) === normalized)?.id || "";
  }

  if (!guitarId) {
    return response({ ok: true, match: "none", message: "No QRguitar Profile matches that exact serial." });
  }

  const guitarResult = await supabase
    .from("guitars")
    .select("id,qr_code,visibility,admin_archived_at,owner_removed_at")
    .eq("id", guitarId)
    .maybeSingle<GuitarMatchRow>();
  const guitar = guitarResult.data;
  if (guitarResult.error || !guitar || guitar.admin_archived_at || guitar.owner_removed_at) {
    return response({ ok: true, match: "none", message: "No QRguitar Profile matches that exact serial." });
  }

  if (guitar.visibility === "public") {
    const instrument = await getPublicInstrumentByCode(guitar.qr_code).catch(() => null);
    if (instrument) {
      return response({ ok: true, match: "public", instrument, exactSerialMatch: true });
    }
  }

  return response({
    ok: true,
    match: "protected",
    message: "An existing QRguitar Profile matches this serial. Sign in to request ownership without exposing its private details."
  });
}
