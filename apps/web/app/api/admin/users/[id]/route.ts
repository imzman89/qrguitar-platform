import { revalidatePath } from "next/cache";
import { adminJson, cleanText, requireAdmin } from "../../_utils";
import { isAdminRole, logAdminAuditEvent, normalizeEmail, readAdminEmailList, type ServerSupabaseClient } from "../../../../../lib/admin-auth";
import { ACCOUNT_DELETION_UNAVAILABLE, inspectAccountDeletion, isAccountDeletionTarget } from "../../../../../lib/admin-account-deletion";

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
  if (role === "user") return "owner";
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

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requireAdmin(request);
  if (!access.ok) {
    return access.response;
  }

  const { supabase, admin } = access;
  const targetUserId = cleanText((await context.params).id, 100);
  if (!targetUserId) {
    return adminJson({ ok: false, message: "User ID is required." }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as Body | null;
  const action = cleanText(body?.action, 60);
  const reason = cleanText(body?.reason, 1000);
  if (action === "delete_empty_user" && !isAccountDeletionTarget(targetUserId)) {
    return adminJson({ ok: false, message: "A valid account ID is required." }, { status: 400 });
  }
  const now = new Date().toISOString();
  const targetUser = await supabase.auth.admin.getUserById(targetUserId).catch(() => null);
  if (!targetUser || (targetUser.error && targetUser.error.status !== 404 && targetUser.error.code !== "user_not_found")) {
    return adminJson({ ok: false, message: "Account lookup is unavailable. No account controls were changed." }, { status: 503 });
  }
  const targetEmail = normalizeEmail(targetUser.data?.user?.email);
  const targetIsEnvManaged = readAdminEmailList().includes(targetEmail);
  const selfDestructiveAction = ["lock", "ban", "remove", "delete_empty_user", "change_role"].includes(action);

  if (targetUser.error || !targetUser.data?.user) {
    return adminJson({ ok: false, message: "User was not found." }, { status: 404 });
  }

  if (admin.user?.id === targetUserId && selfDestructiveAction) {
    return adminJson({ ok: false, message: "You cannot remove your own admin access from this panel." }, { status: 400 });
  }

  if (targetIsEnvManaged && ["lock", "ban", "remove", "delete_empty_user", "change_role"].includes(action)) {
    return adminJson({ ok: false, message: "This environment-managed admin is protected by server settings." }, { status: 400 });
  }

  if (!reason) {
    return adminJson({ ok: false, message: "An operator reason is required for the audit trail." }, { status: 400 });
  }

  const guardedActions = ["lock", "unlock", "ban", "unban", "remove", "restore_user", "change_role"];
  let profileSnapshot: { role?: string | null; account_status?: string | null } | null = null;
  if (guardedActions.includes(action)) {
    const currentProfile = await supabase
      .from("profiles")
      .select("role,account_status")
      .eq("id", targetUserId)
      .maybeSingle<{ role?: string | null; account_status?: string | null }>();
    if (currentProfile.error) {
      return adminJson({ ok: false, message: "Account status could not be verified. No account controls were changed." }, { status: 503 });
    }
    profileSnapshot = currentProfile.data || null;
  }

  const currentStatus = profileSnapshot?.account_status || "active";
  const allowedStatuses: Partial<Record<string, string[]>> = {
    lock: ["active"],
    unlock: ["locked"],
    ban: ["active", "locked"],
    unban: ["banned"],
    remove: ["active", "locked", "banned"],
    restore_user: ["removed"]
  };
  if (allowedStatuses[action] && !allowedStatuses[action]!.includes(currentStatus)) {
    return adminJson({ ok: false, message: `The ${action.replaceAll("_", " ")} action is unavailable while this account is ${currentStatus}. Refresh the user and choose an available action.` }, { status: 409 });
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
      account_locked_at: null,
      account_locked_by: null,
      account_lock_reason: null,
      account_banned_at: now,
      account_banned_by: admin.email,
      account_ban_reason: reason || null,
      hide_public_content: true
    });
    auditAction = "user_banned";
  } else if (action === "unban") {
    Object.assign(update, {
      account_status: "active",
      account_banned_at: null,
      account_banned_by: null,
      account_ban_reason: null,
      hide_public_content: false
    });
    auditAction = "user_unbanned";
  } else if (action === "remove") {
    if (isAdminRole(profileSnapshot?.role)) {
      const otherAdmins = await countOtherAdminAccess(supabase, targetUserId);
      if (otherAdmins < 1) {
        return adminJson({ ok: false, message: "At least one admin must remain." }, { status: 400 });
      }
    }

    Object.assign(update, {
      account_status: "removed",
      account_locked_at: null,
      account_locked_by: null,
      account_lock_reason: null,
      account_banned_at: null,
      account_banned_by: null,
      account_ban_reason: null,
      hide_public_content: true
    });
    auditAction = "user_removed";
  } else if (action === "restore_user") {
    Object.assign(update, {
      account_status: "active",
      account_locked_at: null,
      account_locked_by: null,
      account_lock_reason: null,
      account_banned_at: null,
      account_banned_by: null,
      account_ban_reason: null,
      hide_public_content: false
    });
    auditAction = "user_restored";
  } else if (action === "delete_empty_user") {
    const eligibility = await inspectAccountDeletion(supabase, targetUserId, targetEmail, targetIsEnvManaged);
    if (!eligibility.readable) {
      return adminJson({ ok: false, code: "account_deletion_checks_unavailable", message: "Account deletion checks are unavailable. No account or data was deleted. Restore access to all required account-history tables before reviewing this account." }, { status: 503 });
    }
    if (eligibility.blockers.length) {
      return adminJson({ ok: false, code: "account_deletion_retained_records", message: `Cannot delete this account: retained ${eligibility.blockers.join(", ")}. No account or data was deleted.` }, { status: 409 });
    }
    // An empty snapshot cannot authorize a later, separate Auth transaction.
    // Do not emit a success audit or invoke deleteUser while this gap remains.
    return adminJson({ ok: false, code: "account_deletion_disabled", message: ACCOUNT_DELETION_UNAVAILABLE }, { status: 503 });
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

    if (isAdminRole(profileSnapshot?.role) && !isAdminRole(nextRole)) {
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
    return adminJson({ ok: false, message: "Unsupported user action." }, { status: 400 });
  }

  const profilePayload = {
    id: targetUserId,
    ...update
  };
  const saved = await supabase
    .from("profiles")
    .upsert(profilePayload, { onConflict: "id" })
    .select("id,role,account_status,hide_public_content,admin_notes")
    .maybeSingle();
  if (saved.error) {
    const needsMigration = /column .* does not exist|relation .* does not exist|profiles_account_status_check|check constraint/i.test(saved.error.message || "");
    return adminJson(
      {
        ok: false,
        message: needsMigration
          ? "Run the updated supabase/admin-panel-foundation.sql before using removed-account controls."
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
