import type { User } from "@supabase/supabase-js";
import { createServerSupabaseClient, getAuthenticatedUser } from "./supabase-server";

export type AccountStatus = "active" | "locked" | "banned" | "removed";

export type AdminAccessSource = "role" | "env" | "none";

export type AdminContext = {
  ok: boolean;
  status: number;
  message: string;
  user: User | null;
  email: string;
  role: string;
  accountStatus: AccountStatus;
  hidePublicContent: boolean;
  accessSource: AdminAccessSource;
};

type ProfileAccessRow = {
  id?: string | null;
  role?: string | null;
  account_status?: string | null;
  hide_public_content?: boolean | null;
};

type AdminAuditPayload = {
  actorUserId?: string | null;
  actorEmail?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  targetUserId?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type ServerSupabaseClient = NonNullable<ReturnType<typeof createServerSupabaseClient>>;

export function normalizeEmail(value?: string | null) {
  return String(value || "").trim().toLowerCase();
}

export function readAdminEmailList() {
  return `${process.env.QRGUITAR_OWNER_EMAILS || ""},${process.env.QRGUITAR_ADMIN_EMAILS || ""}`
    .split(",")
    .map((item) => normalizeEmail(item))
    .filter(Boolean);
}

function cleanAccountStatus(value?: string | null): AccountStatus {
  return value === "locked" || value === "banned" || value === "removed" ? value : "active";
}

export function isAdminRole(role?: string | null) {
  return role === "admin";
}

async function loadProfileAccess(
  supabase: ServerSupabaseClient,
  userId: string
): Promise<{ profile: ProfileAccessRow | null; migrationMissing: boolean; error: string }> {
  const full = await supabase
    .from("profiles")
    .select("id,role,account_status,hide_public_content")
    .eq("id", userId)
    .maybeSingle<ProfileAccessRow>();

  if (!full.error) {
    return { profile: full.data || null, migrationMissing: false, error: "" };
  }

  if (/column .* does not exist/i.test(full.error.message || "")) {
    const fallback = await supabase.from("profiles").select("id,role").eq("id", userId).maybeSingle<ProfileAccessRow>();
    if (fallback.error) {
      return { profile: null, migrationMissing: true, error: fallback.error.message };
    }

    return { profile: fallback.data || null, migrationMissing: true, error: "" };
  }

  return { profile: null, migrationMissing: false, error: full.error.message };
}

export async function getAdminContext(request: Request): Promise<AdminContext> {
  const supabase = createServerSupabaseClient();
  if (!supabase) {
    return {
      ok: false,
      status: 503,
      message: "Supabase server configuration is required for admin access.",
      user: null,
      email: "",
      role: "",
      accountStatus: "active",
      hidePublicContent: false,
      accessSource: "none"
    };
  }

  const auth = await getAuthenticatedUser(request);
  if (!auth.user) {
    return {
      ok: false,
      status: 401,
      message: auth.error || "Sign in required.",
      user: null,
      email: "",
      role: "",
      accountStatus: "active",
      hidePublicContent: false,
      accessSource: "none"
    };
  }

  const email = normalizeEmail(auth.user.email);
  const profileResult = await loadProfileAccess(supabase, auth.user.id);
  const role = profileResult.profile?.role || "";
  const accountStatus = cleanAccountStatus(profileResult.profile?.account_status);
  const envAllowed = readAdminEmailList().includes(email);
  const roleAllowed = isAdminRole(role);

  if (!envAllowed && !roleAllowed) {
    return {
      ok: false,
      status: 403,
      message: "Admin access required.",
      user: auth.user,
      email,
      role,
      accountStatus,
      hidePublicContent: profileResult.profile?.hide_public_content === true,
      accessSource: "none"
    };
  }

  if (!envAllowed && (accountStatus === "locked" || accountStatus === "banned" || accountStatus === "removed")) {
    return {
      ok: false,
      status: 403,
      message: "Admin account is not active.",
      user: auth.user,
      email,
      role,
      accountStatus,
      hidePublicContent: profileResult.profile?.hide_public_content === true,
      accessSource: "none"
    };
  }

  return {
    ok: true,
    status: 200,
    message: profileResult.migrationMissing ? "Admin account controls need the admin foundation migration." : "",
    user: auth.user,
    email,
    role,
    accountStatus,
    hidePublicContent: profileResult.profile?.hide_public_content === true,
    accessSource: roleAllowed ? "role" : "env"
  };
}

export async function assertAccountCanWrite(supabase: ServerSupabaseClient, user: User) {
  const profileResult = await loadProfileAccess(supabase, user.id);
  if (profileResult.error && !profileResult.migrationMissing) {
    return { ok: false, status: 500, message: "Could not verify account status." };
  }

  const accountStatus = cleanAccountStatus(profileResult.profile?.account_status);
  if (accountStatus === "locked") {
    return { ok: false, status: 403, message: "This account is locked. Contact QRguitar support for help." };
  }

  if (accountStatus === "banned") {
    return { ok: false, status: 403, message: "This account cannot make changes. Contact QRguitar support for help." };
  }

  if (accountStatus === "removed") {
    return { ok: false, status: 403, message: "This account has been removed. Contact QRguitar support for help." };
  }

  return { ok: true, status: 200, message: "" };
}

export async function logAdminAuditEvent(supabase: ServerSupabaseClient, event: AdminAuditPayload) {
  const result = await supabase.from("admin_audit_events").insert({
    actor_user_id: event.actorUserId || null,
    actor_email: normalizeEmail(event.actorEmail),
    action: event.action,
    target_type: event.targetType || null,
    target_id: event.targetId || null,
    target_user_id: event.targetUserId || null,
    reason: event.reason || null,
    metadata: event.metadata || null
  });

  return { ok: !result.error, error: result.error?.message || "" };
}
