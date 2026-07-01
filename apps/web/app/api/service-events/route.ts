import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient, getAuthenticatedUser } from "../../../lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate"
};

const EVENT_TYPES = new Set([
  "Setup",
  "Repair",
  "Modification",
  "Pickup Install",
  "Wiring",
  "Fretwork",
  "Inspection",
  "Appraisal/Review",
  "Cleaning",
  "Other"
]);

type ServerSupabaseClient = NonNullable<ReturnType<typeof createServerSupabaseClient>>;

type GuitarRow = {
  id: string;
  owner_id: string | null;
  qr_code: string;
  permanent_path: string | null;
};

type ServiceEventRow = {
  id: string;
  guitar_id: string;
  event_date: string | null;
  event_type: string | null;
  title: string;
  description: string | null;
  private_notes: string | null;
  shop_name: string | null;
  location: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string | null;
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

function needsMigration(message?: string) {
  return /column .* does not exist/i.test(message || "");
}

function migrationRequiredResponse() {
  return json(
    { ok: false, message: "Service history database update required. Run supabase/service-history-timeline.sql." },
    { status: 503 }
  );
}

function cleanText(value: unknown, maxLength = 2000) {
  return String(value || "").trim().slice(0, maxLength);
}

function cleanDate(value: unknown) {
  const text = cleanText(value, 20);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function cleanEventType(value: unknown) {
  const text = cleanText(value, 80);
  return EVENT_TYPES.has(text) ? text : "Other";
}

function mapServiceEvent(row: ServiceEventRow, includePrivate = false) {
  return {
    id: row.id,
    serviceDate: row.event_date || "",
    eventType: row.event_type || "",
    title: row.title,
    publicDescription: row.description || "",
    ...(includePrivate ? { privateNotes: row.private_notes || "" } : {}),
    shopName: row.shop_name || "",
    location: row.location || "",
    isPublic: row.is_public === true,
    createdAt: row.created_at,
    updatedAt: row.updated_at || undefined
  };
}

async function canAdminister(supabase: ServerSupabaseClient, user: User) {
  const profile = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle<{ role?: string | null }>();
  return profile.data?.role === "admin";
}

async function loadGuitarByCode(supabase: ServerSupabaseClient, qrCode: string) {
  const result = await supabase
    .from("guitars")
    .select("id,owner_id,qr_code,permanent_path")
    .eq("qr_code", qrCode)
    .maybeSingle<GuitarRow>();

  if (result.error) {
    throw new Error(result.error.message);
  }

  return result.data || null;
}

async function requireOwnerOrAdmin(request: Request, guitar: GuitarRow, supabase: ServerSupabaseClient) {
  const auth = await getAuthenticatedUser(request);
  if (!auth.user) {
    return { user: null, isAdmin: false, error: auth.error || "Sign in required." };
  }

  const isAdmin = await canAdminister(supabase, auth.user);
  if (guitar.owner_id !== auth.user.id && !isAdmin) {
    return { user: auth.user, isAdmin, error: "Only the record owner or QRguitar admin can manage service history." };
  }

  return { user: auth.user, isAdmin, error: "" };
}

function revalidateRecord(qrCode: string) {
  revalidatePath("/");
  revalidatePath("/catalog");
  revalidatePath("/api/instruments");
  revalidatePath(`/i/${qrCode.toUpperCase()}`);
}

export async function GET(request: Request) {
  const supabase = createServerSupabaseClient();
  if (!supabase) {
    return json({ ok: false, serviceEvents: [], message: "Supabase is not configured." }, { status: 500 });
  }

  const url = new URL(request.url);
  const qrCode = cleanText(url.searchParams.get("code"), 80).toUpperCase();
  const scope = cleanText(url.searchParams.get("scope"), 20);
  if (!qrCode) {
    return json({ ok: false, serviceEvents: [], message: "QRguitar ID is required." }, { status: 400 });
  }

  const guitar = await loadGuitarByCode(supabase, qrCode);
  if (!guitar) {
    return json({ ok: false, serviceEvents: [], message: "Instrument record was not found." }, { status: 404 });
  }

  let includePrivate = false;
  if (scope === "owner") {
    const access = await requireOwnerOrAdmin(request, guitar, supabase);
    if (access.error) {
      return json({ ok: false, serviceEvents: [], message: access.error }, { status: access.user ? 403 : 401 });
    }
    includePrivate = true;
  }

  let query = supabase
    .from("guitar_timeline_events")
    .select("id,guitar_id,event_date,event_type,title,description,private_notes,shop_name,location,is_public,created_at,updated_at")
    .eq("guitar_id", guitar.id)
    .order("event_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (!includePrivate) {
    query = query.eq("is_public", true);
  }

  const result = await query;
  if (result.error) {
    if (needsMigration(result.error.message)) {
      return json({ ok: true, serviceEvents: [], message: "Service history database update required." });
    }

    return json({ ok: false, serviceEvents: [], message: result.error.message }, { status: 500 });
  }

  return json({
    ok: true,
    serviceEvents: ((result.data || []) as ServiceEventRow[]).map((row) => mapServiceEvent(row, includePrivate))
  });
}

export async function POST(request: Request) {
  const supabase = createServerSupabaseClient();
  if (!supabase) {
    return json({ ok: false, message: "Supabase is not configured." }, { status: 500 });
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const qrCode = cleanText(body?.qrCode, 80).toUpperCase();
  const guitar = qrCode ? await loadGuitarByCode(supabase, qrCode) : null;
  if (!guitar) {
    return json({ ok: false, message: "Instrument record was not found." }, { status: 404 });
  }

  const access = await requireOwnerOrAdmin(request, guitar, supabase);
  if (access.error || !access.user) {
    return json({ ok: false, message: access.error }, { status: access.user ? 403 : 401 });
  }

  const title = cleanText(body?.title, 180);
  if (!title) {
    return json({ ok: false, message: "Service title is required." }, { status: 400 });
  }

  const created = await supabase
    .from("guitar_timeline_events")
    .insert({
      guitar_id: guitar.id,
      created_by_user_id: access.user.id,
      event_date: cleanDate(body?.serviceDate),
      event_type: cleanEventType(body?.eventType),
      title,
      description: cleanText(body?.publicDescription, 4000),
      private_notes: cleanText(body?.privateNotes, 4000),
      shop_name: cleanText(body?.shopName, 200),
      location: cleanText(body?.location, 200),
      is_public: body?.isPublic === true
    })
    .select("id,guitar_id,event_date,event_type,title,description,private_notes,shop_name,location,is_public,created_at,updated_at")
    .single<ServiceEventRow>();

  if (created.error || !created.data) {
    if (needsMigration(created.error?.message)) {
      return migrationRequiredResponse();
    }

    return json({ ok: false, message: created.error?.message || "Could not save service entry." }, { status: 500 });
  }

  revalidateRecord(qrCode);
  return json({ ok: true, serviceEvent: mapServiceEvent(created.data, true), message: "Service entry saved." });
}

export async function PATCH(request: Request) {
  const supabase = createServerSupabaseClient();
  if (!supabase) {
    return json({ ok: false, message: "Supabase is not configured." }, { status: 500 });
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const qrCode = cleanText(body?.qrCode, 80).toUpperCase();
  const id = cleanText(body?.id, 80);
  const guitar = qrCode ? await loadGuitarByCode(supabase, qrCode) : null;
  if (!guitar || !id) {
    return json({ ok: false, message: "Instrument record and service entry are required." }, { status: 400 });
  }

  const access = await requireOwnerOrAdmin(request, guitar, supabase);
  if (access.error) {
    return json({ ok: false, message: access.error }, { status: access.user ? 403 : 401 });
  }

  const title = cleanText(body?.title, 180);
  if (!title) {
    return json({ ok: false, message: "Service title is required." }, { status: 400 });
  }

  const update = await supabase
    .from("guitar_timeline_events")
    .update({
      event_date: cleanDate(body?.serviceDate),
      event_type: cleanEventType(body?.eventType),
      title,
      description: cleanText(body?.publicDescription, 4000),
      private_notes: cleanText(body?.privateNotes, 4000),
      shop_name: cleanText(body?.shopName, 200),
      location: cleanText(body?.location, 200),
      is_public: body?.isPublic === true,
      updated_at: new Date().toISOString()
    })
    .eq("id", id)
    .eq("guitar_id", guitar.id)
    .select("id,guitar_id,event_date,event_type,title,description,private_notes,shop_name,location,is_public,created_at,updated_at")
    .single<ServiceEventRow>();

  if (update.error || !update.data) {
    if (needsMigration(update.error?.message)) {
      return migrationRequiredResponse();
    }

    return json({ ok: false, message: update.error?.message || "Could not update service entry." }, { status: 500 });
  }

  revalidateRecord(qrCode);
  return json({ ok: true, serviceEvent: mapServiceEvent(update.data, true), message: "Service entry updated." });
}

export async function DELETE(request: Request) {
  const supabase = createServerSupabaseClient();
  if (!supabase) {
    return json({ ok: false, message: "Supabase is not configured." }, { status: 500 });
  }

  const url = new URL(request.url);
  const qrCode = cleanText(url.searchParams.get("code"), 80).toUpperCase();
  const id = cleanText(url.searchParams.get("id"), 80);
  const guitar = qrCode ? await loadGuitarByCode(supabase, qrCode) : null;
  if (!guitar || !id) {
    return json({ ok: false, message: "Instrument record and service entry are required." }, { status: 400 });
  }

  const access = await requireOwnerOrAdmin(request, guitar, supabase);
  if (access.error) {
    return json({ ok: false, message: access.error }, { status: access.user ? 403 : 401 });
  }

  const deleted = await supabase.from("guitar_timeline_events").delete().eq("id", id).eq("guitar_id", guitar.id);
  if (deleted.error) {
    return json({ ok: false, message: deleted.error.message || "Could not delete service entry." }, { status: 500 });
  }

  revalidateRecord(qrCode);
  return json({ ok: true, message: "Service entry deleted." });
}
