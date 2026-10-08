import { NextResponse } from "next/server";
import { isSafetyContentUnchanged } from "../../../lib/profile-metadata-preservation";
import type { User } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient, getAuthenticatedUser } from "../../../lib/supabase-server";
import { assertAccountCanWrite, isAdminRole, normalizeEmail, readAdminEmailList } from "../../../lib/admin-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate"
};

const SAFETY_STATUSES = new Set(["clear", "lost", "stolen", "recovered"]);

type ServerSupabaseClient = NonNullable<ReturnType<typeof createServerSupabaseClient>>;

type GuitarRow = {
  id: string;
  owner_id: string | null;
  qr_code: string;
  permanent_path: string | null;
  updated_at: string;
  safety_status?: string | null;
  safety_status_updated_at?: string | null;
  public_safety_note?: string | null;
  safety_note?: string | null;
};

function json<T>(body: T, init: ResponseInit = {}) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...NO_STORE_HEADERS,
      ...(init.headers || {})
    }
  });
}

function cleanText(value: unknown, maxLength = 2000) {
  return String(value || "").trim().slice(0, maxLength);
}

function cleanSafetyStatus(value: unknown) {
  const status = cleanText(value, 20).toLowerCase();
  return SAFETY_STATUSES.has(status) ? status : "clear";
}

function needsMigration(message?: string) {
  return /column .* does not exist/i.test(message || "");
}

async function canAdminister(supabase: ServerSupabaseClient, user: User) {
  if (readAdminEmailList().includes(normalizeEmail(user.email))) {
    return true;
  }

  const profile = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle<{ role?: string | null }>();
  return isAdminRole(profile.data?.role);
}

async function loadGuitarByCode(supabase: ServerSupabaseClient, qrCode: string) {
  const result = await supabase
    .from("guitars")
    .select("id,owner_id,qr_code,permanent_path,updated_at,safety_status,safety_status_updated_at,public_safety_note,safety_note")
    .eq("qr_code", qrCode)
    .maybeSingle<GuitarRow>();

  if (result.error) {
    if (needsMigration(result.error.message)) {
      return { guitar: null, migrationRequired: true, error: "" };
    }

    return { guitar: null, migrationRequired: false, error: result.error.message };
  }

  return { guitar: result.data || null, migrationRequired: false, error: "" };
}

async function requireOwnerOrAdmin(request: Request, guitar: GuitarRow, supabase: ServerSupabaseClient) {
  const auth = await getAuthenticatedUser(request);
  if (!auth.user) {
    return { user: null, isAdmin: false, error: auth.error || "Sign in required." };
  }

  const isAdmin = await canAdminister(supabase, auth.user);
  if (guitar.owner_id !== auth.user.id && !isAdmin) {
    return { user: auth.user, isAdmin, error: "Only the profile owner or QRguitar admin can update safety status." };
  }

  return { user: auth.user, isAdmin, error: "" };
}

function revalidateRecord(qrCode: string) {
  const code = qrCode.toUpperCase();
  revalidatePath("/");
  revalidatePath("/catalog");
  revalidatePath("/api/instruments");
  revalidatePath(`/i/${code}`);
}

export async function PATCH(request: Request) {
  const supabase = createServerSupabaseClient();
  if (!supabase) {
    return json({ ok: false, message: "Supabase is not configured." }, { status: 500 });
  }

  const auth = await getAuthenticatedUser(request);
  if (!auth.user) {
    return json({ ok: false, message: auth.error || "Sign in required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { qrCode?: string; safetyStatus?: string; publicSafetyNote?: string; safetyNote?: string }
    | null;
  const qrCode = cleanText(body?.qrCode, 80).toUpperCase();
  if (!qrCode) {
    return json({ ok: false, message: "QRguitar ID is required." }, { status: 400 });
  }

  if (!SAFETY_STATUSES.has(cleanText(body?.safetyStatus, 20).toLowerCase())) {
    return json({ ok: false, message: "Choose a valid safety status." }, { status: 400 });
  }

  const loaded = await loadGuitarByCode(supabase, qrCode);
  if (loaded.migrationRequired) {
    return json({ ok: false, message: "Safety status database update required. Run supabase/lost-stolen-safety-status.sql." }, { status: 503 });
  }

  if (loaded.error) {
    return json({ ok: false, message: loaded.error }, { status: 500 });
  }

  if (!loaded.guitar) {
    return json({ ok: false, message: "QRguitar Profile was not found." }, { status: 404 });
  }

  const access = await requireOwnerOrAdmin(request, loaded.guitar, supabase);
  if (access.error) {
    return json({ ok: false, message: access.error }, { status: access.user ? 403 : 401 });
  }

  if (access.user) {
    const writeAccess = await assertAccountCanWrite(supabase, access.user);
    if (!writeAccess.ok) {
      return json({ ok: false, message: writeAccess.message }, { status: writeAccess.status });
    }
  }

  const safetyStatus = cleanSafetyStatus(body?.safetyStatus);
  const nextSafety = { safetyStatus, publicSafetyNote: cleanText(body?.publicSafetyNote, 1000), safetyNote: cleanText(body?.safetyNote, 2000) };
  if (isSafetyContentUnchanged({ safetyStatus: loaded.guitar.safety_status, publicSafetyNote: loaded.guitar.public_safety_note, safetyNote: loaded.guitar.safety_note }, nextSafety)) {
    return json({ ok: true, committed: true, noOp: true, refreshPending: false, qrCode,
      permanentPath: loaded.guitar.permanent_path || `/i/${qrCode}`,
      safetyStatus: loaded.guitar.safety_status || "clear", publicSafetyNote: loaded.guitar.public_safety_note || "",
      safetyStatusUpdatedAt: loaded.guitar.safety_status_updated_at || "", message: "Safety status unchanged." });
  }
  const now = new Date().toISOString();
  const statusChanged = safetyStatus !== (loaded.guitar.safety_status || "clear");
  let update = supabase
    .from("guitars")
    .update({
      safety_status: safetyStatus,
      public_safety_note: cleanText(body?.publicSafetyNote, 1000) || null,
      safety_note: cleanText(body?.safetyNote, 2000) || null,
      ...(statusChanged ? { safety_status_updated_at: now, safety_status_updated_by: access.user?.id || null } : {}),
      updated_at: now
    })
    .eq("id", loaded.guitar.id).eq("updated_at", loaded.guitar.updated_at);
  if (!access.isAdmin) update = update.eq("owner_id", auth.user.id);
  const result = await update.select("qr_code,permanent_path,safety_status,safety_status_updated_at,public_safety_note")
    .maybeSingle<Pick<GuitarRow, "qr_code" | "permanent_path" | "safety_status" | "safety_status_updated_at" | "public_safety_note">>();

  if (result.error) {
    if (needsMigration(result.error.message)) {
      return json({ ok: false, message: "Safety status database update required. Run supabase/lost-stolen-safety-status.sql." }, { status: 503 });
    }

    return json({ ok: false, message: result.error.message || "Could not update safety status." }, { status: 500 });
  }

  if (!result.data) return json({ ok: false, message: "Profile ownership changed or the Profile is unavailable. Reload before trying again." }, { status: 409 });

  let refreshPending = false;
  try { revalidateRecord(qrCode); } catch { refreshPending = true; }

  return json({
    ok: true, committed: true, refreshPending,
    qrCode,
    permanentPath: loaded.guitar.permanent_path || `/i/${qrCode}`,
    safetyStatus: result.data?.safety_status || "clear",
    publicSafetyNote: result.data?.public_safety_note || "",
    safetyStatusUpdatedAt: result.data?.safety_status_updated_at || "",
    message: refreshPending ? "Safety status saved. Reload the Profile to see the change." : "Safety status updated."
  });
}
