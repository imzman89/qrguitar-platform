import { revalidatePath } from "next/cache";
import { adminJson, cleanText, requireAdmin } from "../../_utils";
import { logAdminAuditEvent } from "../../../../../lib/admin-auth";
import { mergeRecordTrustSettings, recordTrustContentKey } from "../../../../../lib/record-trust";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type Body = {
  action?: string;
  reason?: string;
  visibility?: string;
  verificationStatus?: string;
  authenticityStatus?: string;
  showVerificationBadge?: boolean;
  showAuthenticityBadge?: boolean;
  safetyStatus?: string;
  publicSafetyNote?: string;
  safetyNote?: string;
  internalVerificationNote?: string;
  publicVerificationNote?: string;
  internalAuthenticityNote?: string;
  publicAuthenticityNote?: string;
};

function cleanVisibility(value: unknown) {
  const visibility = cleanText(value, 20);
  return visibility === "public" || visibility === "unlisted" || visibility === "private" ? visibility : null;
}

function cleanVerification(value: unknown) {
  return cleanText(value, 20) === "verified" ? "verified" : "unverified";
}

function cleanAuthenticity(value: unknown) {
  return cleanText(value, 20) === "confirmed" ? "confirmed" : "unconfirmed";
}

function cleanSafety(value: unknown) {
  const safety = cleanText(value, 20);
  return safety === "lost" || safety === "stolen" || safety === "recovered" ? safety : "clear";
}

function hasBodyField(body: Body | null, key: keyof Body) {
  return Boolean(body && Object.prototype.hasOwnProperty.call(body, key));
}

export async function PATCH(request: Request, context: { params: { id: string } }) {
  const access = await requireAdmin(request);
  if (!access.ok) {
    return access.response;
  }

  const { supabase, admin } = access;
  const recordId = cleanText(context.params.id, 100);
  const body = (await request.json().catch(() => null)) as Body | null;
  const action = cleanText(body?.action, 60);
  const reason = cleanText(body?.reason, 1000);
  const now = new Date().toISOString();

  if (!reason) {
    return adminJson({ ok: false, message: "An operator reason is required for the audit trail." }, { status: 400 });
  }

  const existing = await supabase
    .from("guitars")
    .select("id,owner_id,qr_code,permanent_path,name,brand,model,status,visibility,safety_status,public_safety_note,admin_archived_at,owner_removed_at")
    .eq("id", recordId)
    .maybeSingle<{
      id: string;
      owner_id?: string | null;
      qr_code: string;
      permanent_path?: string | null;
      name?: string | null;
      brand?: string | null;
      model?: string | null;
      status?: string | null;
      visibility?: string | null;
      safety_status?: string | null;
      public_safety_note?: string | null;
      admin_archived_at?: string | null;
      owner_removed_at?: string | null;
    }>();

  if (existing.error) {
    return adminJson({ ok: false, message: existing.error.message || "Could not load Profile." }, { status: 500 });
  }

  if (!existing.data) {
    return adminJson({ ok: false, message: "Profile was not found." }, { status: 404 });
  }

  const record = existing.data;
  const updates: Record<string, unknown> = { updated_at: now };
  let auditAction = action || "record_update";
  let auditReason = reason || null;

  if (action === "archive") {
    Object.assign(updates, {
      visibility: "private",
      admin_archived_at: now,
      admin_archived_by: admin.email,
      admin_archive_reason: reason || null
    });
    auditAction = "record_archived";
  } else if (action === "restore_archive") {
    Object.assign(updates, {
      visibility: "private",
      admin_archived_at: null,
      admin_archived_by: null,
      admin_archive_reason: null
    });
    auditAction = "record_restored";
  } else if (action === "restore_to_collection") {
    return adminJson({ ok: false, message: "Deleted dashboard Profiles cannot be restored. Create a new Profile instead." }, { status: 410 });
  } else if (action === "set_visibility") {
    const nextVisibility = cleanVisibility(body?.visibility);
    if (!nextVisibility) {
      return adminJson({ ok: false, message: "Valid visibility is required." }, { status: 400 });
    }
    Object.assign(updates, { visibility: nextVisibility });
    auditAction = "record_visibility_updated";
    auditReason = reason || `Visibility changed to ${nextVisibility}.`;
  } else if (action === "set_verification") {
    const nextVerification = cleanVerification(body?.verificationStatus);
    Object.assign(updates, { status: nextVerification });
    auditAction = "trust_status_updated";
    auditReason = reason || `Verification set to ${nextVerification}.`;
  } else if (action === "set_safety") {
    const nextSafety = cleanSafety(body?.safetyStatus);
    Object.assign(updates, {
      safety_status: nextSafety,
      safety_status_updated_at: now,
      public_safety_note: nextSafety === "clear" ? "" : cleanText(body?.publicSafetyNote, 1000),
      safety_note: cleanText(body?.safetyNote, 2000)
    });
    auditAction = "safety_status_updated";
    auditReason = reason || `Safety status set to ${nextSafety}.`;
  } else if (action === "set_authenticity" || action === "set_trust_badge_visibility") {
    const trustKey = recordTrustContentKey(record.qr_code);
    const current = await supabase.from("site_content").select("content_value").eq("content_key", trustKey).maybeSingle<{ content_value?: unknown }>();
    const merged = mergeRecordTrustSettings(current.data?.content_value as Parameters<typeof mergeRecordTrustSettings>[0]);
    const nextTrust = mergeRecordTrustSettings({
      ...merged,
      authenticityStatus: action === "set_authenticity" ? cleanAuthenticity(body?.authenticityStatus) : merged.authenticityStatus,
      showVerificationBadge: typeof body?.showVerificationBadge === "boolean" ? body.showVerificationBadge : merged.showVerificationBadge,
      showAuthenticityBadge: typeof body?.showAuthenticityBadge === "boolean" ? body.showAuthenticityBadge : merged.showAuthenticityBadge,
      internalVerificationNote: hasBodyField(body, "internalVerificationNote") ? cleanText(body?.internalVerificationNote, 2000) : merged.internalVerificationNote,
      publicVerificationNote: hasBodyField(body, "publicVerificationNote") ? cleanText(body?.publicVerificationNote, 1000) : merged.publicVerificationNote,
      internalAuthenticityNote: hasBodyField(body, "internalAuthenticityNote") ? cleanText(body?.internalAuthenticityNote, 2000) : merged.internalAuthenticityNote,
      publicAuthenticityNote: hasBodyField(body, "publicAuthenticityNote") ? cleanText(body?.publicAuthenticityNote, 1000) : merged.publicAuthenticityNote
    });
    const trustSaved = await supabase.from("site_content").upsert(
      {
        content_key: trustKey,
        content_value: nextTrust,
        updated_by: admin.user?.id || null,
        updated_at: now
      },
      { onConflict: "content_key" }
    );

    if (trustSaved.error) {
      return adminJson({ ok: false, message: trustSaved.error.message || "Could not update trust settings." }, { status: 500 });
    }

    await logAdminAuditEvent(supabase, {
      actorUserId: admin.user?.id,
      actorEmail: admin.email,
      action: action === "set_authenticity" ? "authenticity_status_updated" : "trust_badge_visibility_updated",
      targetType: "guitar",
      targetId: record.qr_code,
      targetUserId: record.owner_id || null,
      reason: reason || null,
      metadata: { qrCode: record.qr_code }
    });

    revalidatePath("/");
    revalidatePath("/catalog");
    revalidatePath(`/i/${record.qr_code}`);
    return adminJson({ ok: true, message: "Trust settings updated.", record: { ...record, trust: nextTrust } });
  } else {
    return adminJson({ ok: false, message: "Unsupported Profile action." }, { status: 400 });
  }

  const saved = await supabase.from("guitars").update(updates).eq("id", record.id).select("id,qr_code,permanent_path,status,visibility,safety_status,public_safety_note,updated_at").maybeSingle();
  if (saved.error) {
    return adminJson({ ok: false, message: saved.error.message || "Could not update Profile." }, { status: 500 });
  }

  if (action === "set_verification" && ["internalVerificationNote", "publicVerificationNote", "internalAuthenticityNote", "publicAuthenticityNote"].some((key) => hasBodyField(body, key as keyof Body))) {
    const trustKey = recordTrustContentKey(record.qr_code);
    const current = await supabase.from("site_content").select("content_value").eq("content_key", trustKey).maybeSingle<{ content_value?: unknown }>();
    const merged = mergeRecordTrustSettings(current.data?.content_value as Parameters<typeof mergeRecordTrustSettings>[0]);
    const nextTrust = mergeRecordTrustSettings({
      ...merged,
      internalVerificationNote: hasBodyField(body, "internalVerificationNote") ? cleanText(body?.internalVerificationNote, 2000) : merged.internalVerificationNote,
      publicVerificationNote: hasBodyField(body, "publicVerificationNote") ? cleanText(body?.publicVerificationNote, 1000) : merged.publicVerificationNote,
      internalAuthenticityNote: hasBodyField(body, "internalAuthenticityNote") ? cleanText(body?.internalAuthenticityNote, 2000) : merged.internalAuthenticityNote,
      publicAuthenticityNote: hasBodyField(body, "publicAuthenticityNote") ? cleanText(body?.publicAuthenticityNote, 1000) : merged.publicAuthenticityNote
    });
    const trustSaved = await supabase.from("site_content").upsert(
      {
        content_key: trustKey,
        content_value: nextTrust,
        updated_by: admin.user?.id || null,
        updated_at: now
      },
      { onConflict: "content_key" }
    );
    if (trustSaved.error) {
      return adminJson({ ok: false, message: trustSaved.error.message || "Could not save trust notes." }, { status: 500 });
    }
  }

  await logAdminAuditEvent(supabase, {
    actorUserId: admin.user?.id,
    actorEmail: admin.email,
    action: auditAction,
    targetType: "guitar",
    targetId: record.qr_code,
    targetUserId: record.owner_id || null,
    reason: auditReason,
    metadata: { updateKeys: Object.keys(updates), qrCode: record.qr_code }
  });

  revalidatePath("/");
  revalidatePath("/catalog");
  revalidatePath(`/i/${record.qr_code}`);
  revalidatePath("/api/instruments");

  return adminJson({ ok: true, message: "Profile updated.", record: saved.data });
}
