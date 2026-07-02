import { revalidatePath } from "next/cache";
import { adminJson, cleanAccountStatus, cleanText, requireAdmin } from "../../_utils";
import { isAdminRole, logAdminAuditEvent, normalizeEmail, readAdminEmailList, type ServerSupabaseClient } from "../../../../../lib/admin-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type Body = {
  action?: string;
  reason?: string;
  role?: string;
  adminNotes?: string;
};

function roleValue(value: unknown) {
  const role = cleanText(value, 20);
  return role === "admin" || role === "owner" || role === "builder" || role === "shop" ? role : null;
}

async function countOtherAdminAccess(supabase: ServerSupabaseClient, targetUserId: string) {
  const [profilesResult, usersResult] = await Promise.all([
    supabase.from("profiles").select("id,role").neq("id", targetUserId),
    supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  ]);

  const roleAdmins = ((profilesResult.data || []) as Array<{ id?: string | null; role?: string | null }>)
    .filter((profile) => isAdminRole(profile.role)).length;
  const envEmails = readAdminEmailList();
  const envAdmins = (usersResult.data?.users || [])
    .filter((user) => user.id !== targetUserId && envEmails.includes(normalizeEmail(user.email))).length;

  return roleAdmins + envAdmins;
}

export async function PATCH(request: Request, context: { params: { id: string } }) {
  const access = await requireAdmin(request);
  if (!access.ok) {
    return access.response;
  }

  const { supabase, admin } = access;
  const targetUserId = cleanText(context.params.id, 100);
  if (!targetUserId) {
    return adminJson({ ok: false, message: "User ID is required." }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as Body | null;
  const action = cleanText(body?.action, 60);
  const reason = cleanText(body?.reason, 1000);
  const now = new Date().toISOString();
  const targetUser = await supabase.auth.admin.getUserById(targetUserId);
  const targetEmail = normalizeEmail(targetUser.data?.user?.email);
  const targetIsEnvManaged = readAdminEmailList().includes(targetEmail);
  const selfDestructiveAction = ["lock", "ban", "change_role"].includes(action);

  if (targetUser.error || !targetUser.data?.user) {
    return adminJson({ ok: false, message: "User was not found." }, { status: 404 });
  }

  if (admin.user?.id === targetUserId && selfDestructiveAction) {
    return adminJson({ ok: false, message: "You cannot remove your own admin access from this panel." }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  let auditAction = action;
  let auditReason = reason;

  if (action === "lock") {
    Object.assign(update, {
      account_status: "locked",
      account_locked_at: now,
      account_locked_by: admin.email,
      account_lock_reason: reason || null
    });
  } else if (action === "unlock") {
    Object.assign(update, {
      account_status: "active",
      account_locked_at: null,
      account_locked_by: null,
      account_lock_reason: null
    });
  } else if (action === "ban") {
    Object.assign(update, {
      account_status: "banned",
      account_banned_at: now,
      account_banned_by: admin.email,
      account_ban_reason: reason || null,
      hide_public_content: true
    });
  } else if (action === "unban") {
    Object.assign(update, {
      account_status: "active",
      account_banned_at: null,
      account_banned_by: null,
      account_ban_reason: null,
      hide_public_content: false
    });
  } else if (action === "hide_public_content") {
    Object.assign(update, { hide_public_content: true });
    auditAction = "hide_public_content";
  } else if (action === "restore_public_content") {
    Object.assign(update, { hide_public_content: false });
    auditAction = "restore_public_content";
  } else if (action === "change_role") {
    const nextRole = roleValue(body?.role);
    if (!nextRole) {
      return adminJson({ ok: false, message: "Valid role is required." }, { status: 400 });
    }

    if (targetIsEnvManaged && !isAdminRole(nextRole)) {
      return adminJson({ ok: false, message: "This admin is managed by server environment settings." }, { status: 400 });
    }

    const currentProfile = await supabase.from("profiles").select("role").eq("id", targetUserId).maybeSingle<{ role?: string | null }>();
    if (isAdminRole(currentProfile.data?.role) && !isAdminRole(nextRole)) {
      const otherAdmins = await countOtherAdminAccess(supabase, targetUserId);
      if (otherAdmins < 1) {
        return adminJson({ ok: false, message: "At least one owner or admin must remain." }, { status: 400 });
      }
    }

    Object.assign(update, { role: nextRole });
    auditReason = reason || `Role changed to ${nextRole}.`;
  } else if (action === "admin_note") {
    Object.assign(update, { admin_notes: cleanText(body?.adminNotes, 4000) });
    auditAction = "admin_note";
  } else {
    const status = cleanAccountStatus(body?.action);
    Object.assign(update, { account_status: status });
  }

  const saved = await supabase.from("profiles").update(update).eq("id", targetUserId).select("id,role,account_status,hide_public_content,admin_notes").maybeSingle();
  if (saved.error) {
    const needsMigration = /column .* does not exist|relation .* does not exist/i.test(saved.error.message || "");
    return adminJson(
      {
        ok: false,
        message: needsMigration
          ? "Run supabase/admin-panel-foundation.sql before using account controls."
          : saved.error.message || "Could not update user."
      },
      { status: needsMigration ? 503 : 500 }
    );
  }

  await logAdminAuditEvent(supabase, {
    actorUserId: admin.user?.id,
    actorEmail: admin.email,
    action: auditAction || "user_update",
    targetType: "profile",
    targetId: targetUserId,
    targetUserId,
    reason: auditReason || null,
    metadata: { updateKeys: Object.keys(update) }
  });

  revalidatePath("/");
  revalidatePath("/catalog");
  revalidatePath("/api/instruments");

  return adminJson({ ok: true, user: saved.data, message: "User updated." });
}
