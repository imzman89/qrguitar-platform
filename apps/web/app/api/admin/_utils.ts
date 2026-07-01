import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../lib/supabase-server";
import { getAdminContext, type AdminContext, type ServerSupabaseClient } from "../../../lib/admin-auth";

export const adminNoStoreHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate"
};

export function adminJson<T>(body: T, init: ResponseInit = {}) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...adminNoStoreHeaders,
      ...(init.headers || {})
    }
  });
}

export async function requireAdmin(request: Request): Promise<
  | { ok: true; supabase: ServerSupabaseClient; admin: AdminContext }
  | { ok: false; response: NextResponse }
> {
  const supabase = createServerSupabaseClient();
  if (!supabase) {
    return {
      ok: false,
      response: adminJson({ ok: false, message: "Supabase server configuration is required for admin." }, { status: 503 })
    };
  }

  const admin = await getAdminContext(request);
  if (!admin.ok) {
    return { ok: false, response: adminJson({ ok: false, message: admin.message }, { status: admin.status }) };
  }

  return { ok: true, supabase, admin };
}

export function cleanText(value: unknown, maxLength = 2000) {
  return String(value || "").trim().slice(0, maxLength);
}

export function cleanAccountStatus(value: unknown) {
  const status = cleanText(value, 20).toLowerCase();
  return status === "locked" || status === "banned" ? status : "active";
}

export function safeDate(value?: string | null) {
  return value || "";
}
