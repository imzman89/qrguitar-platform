import { revalidatePath } from "next/cache";
import { adminJson, cleanText, requireAdmin } from "../../_utils";
import { isAdminRole, logAdminAuditEvent, normalizeEmail, readAdminEmailList, type ServerSupabaseClient } from "../../../../../lib/admin-auth";
import { mergeRecordTrustSettings, recordTrustContentKey } from "../../../../../lib/record-trust";

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

async function loadDeleteEligibility(supabase: ServerSupabaseClient, targetUserId: string, targetIsEnvManaged: boolean) {
  const blockers: string[] = [];
  const [profileResult, guitarsResult, documentsResult, serviceResult, transfersResult] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", targetUserId).maybeSingle<{ role?: string | null }>(),
    supabase.from("guitars").select("id,qr_code,status").eq("owner_id", targetUserId),
    supabase.from("guitar_documents").select("id,guitars(owner_id)"),
    supabase.from("guitar_timeline_events").select("id,guitars(owner_id)"),
    supabase.from("ownership_transfers").select("id,from_owner_id,accepted_by").or(`from_owner_id.eq.${targetUserId},accepted_by.eq.${targetUserId}`)
  ]);

  const guitarRows = (guitarsResult.data || []) as Array<{ id?: string | null; qr_code?: string | null; status?: string | null }>;
  const ownedNestedCount = (rows: unknown[]) => {
    let count = 0;
    for (const row of rows as Array<{ guitars?: { owner_id?: string | null } | Array<{ owner_id?: string | null }> }>) {
      const guitar = Array.isArray(row.guitars) ? row.guitars[0] : row.guitars;
      if (guitar?.owner_id === targetUserId) {
        count += 1;
      }
    }
    return count;
  };
  const proofCount = ownedNestedCount(documentsResult.data || []);
  const serviceCount = ownedNestedCount(serviceResult.data || []);
  const transferCount = ((transfersResult.data || []) as Array<unknown>).length;
  const verifiedCount = guitarRows.filter((guitar) => guitar.status === "verified").length;
  let authenticityConfirmedCount = 0;

  const trustKeys = guitarRows.map((guitar) => guitar.qr_code ? recordTrustContentKey(guitar.qr_code) : "").filter(Boolean);
  if (trustKeys.length) {
    const trustResult = await supabase.from("site_content").select("content_value").in("content_key", trustKeys);
    authenticityConfirmedCount = ((trustResult.data || []) as Array<{ content_value?: unknown }>)
      .filter((row) => mergeRecordTrustSettings(row.content_value as Parameters<typeof mergeRecordTrustSettings>[0]).authenticityStatus === "confirmed").length;
  }

  if (targetIsEnvManaged) blockers.push("environment-managed admin");
  if (isAdminRole(profileResult.data?.role)) blockers.push("admin access");
  if (guitarRows.length) blockers.push("records");
  if (proofCount) blockers.push("proof documents");
  if (serviceCount) blockers.push("service history");
  if (transferCount) blockers.push("transfers");
  if (verifiedCount) blockers.push("verified records");
  if (authenticityConfirmedCount) blockers.push("authenticity-confirmed records");

  return { ok: blockers.length === 0, blockers };
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
  const now = new Date().toISOString();
  const targetUser = await supabase.auth.admin.getUserById(targetUserId);
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
    return adminJson({ ok: false, message: "This admin is managed by server environment settings." }, { status: 400 });
  }

  if (!reason) {
    return adminJson({ ok: false, message: "An operator reason is required for the audit trail." }, { status: 400 });
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
    const currentProfile = await supabase.from("profiles").select("role").eq("id", targetUserId).maybeSingle<{ role?: string | null }>();
    if (isAdminRole(currentProfile.data?.role)) {
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
    const eligibility = await loadDeleteEligibility(supabase, targetUserId, targetIsEnvManaged);
    if (!eligibility.ok) {
      return adminJson({ ok: false, message: `Cannot delete this user: ${eligibility.blockers.join(", ")}.` }, { status: 400 });
    }

    await logAdminAuditEvent(supabase, {
      actorUserId: admin.user?.id,
      actorEmail: admin.email,
      action: "empty_user_deleted",
      targetType: "profile",
      targetId: targetUserId,
      targetUserId,
      reason: auditReason || null,
      metadata: { email: targetEmail ? "redacted" : "" }
    });

    const authDelete = await supabase.auth.admin.deleteUser(targetUserId);
    if (authDelete.error) {
      return adminJson({ ok: false, message: authDelete.error.message || "Could not delete user." }, { status: 500 });
    }

    await supabase.from("profiles").delete().eq("id", targetUserId);
    revalidatePath("/");
    revalidatePath("/catalog");
    revalidatePath("/api/instruments");

    return adminJson({ ok: true, message: "Empty user deleted." });
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
