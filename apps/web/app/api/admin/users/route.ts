import { adminJson, requireAdmin } from "../_utils";
import { isAdminRole, normalizeEmail, readAdminEmailList } from "../../../../lib/admin-auth";
import { mergeRecordTrustSettings, recordTrustContentKey } from "../../../../lib/record-trust";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type ProfileRow = {
  id: string;
  display_name?: string | null;
  role?: string | null;
  account_status?: string | null;
  hide_public_content?: boolean | null;
  admin_notes?: string | null;
  created_at?: string | null;
};

function countByOwner<T extends Record<string, unknown>>(rows: T[], ownerKey: keyof T) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const ownerId = String(row[ownerKey] || "");
    if (ownerId) {
      counts.set(ownerId, (counts.get(ownerId) || 0) + 1);
    }
  }
  return counts;
}

export async function GET(request: Request) {
  const access = await requireAdmin(request);
  if (!access.ok) {
    return access.response;
  }

  const { supabase } = access;
  const url = new URL(request.url);
  const search = String(url.searchParams.get("search") || "").trim().toLowerCase();
  const status = String(url.searchParams.get("status") || "").trim();

  const authUsers = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (authUsers.error) {
    return adminJson({ ok: false, message: authUsers.error.message || "Could not list auth users." }, { status: 500 });
  }

  const profileResult = await supabase
    .from("profiles")
    .select("id,display_name,role,account_status,hide_public_content,admin_notes,created_at");
  const profileRows = profileResult.error ? [] : ((profileResult.data || []) as ProfileRow[]);
  const profiles = new Map(profileRows.map((profile) => [profile.id, profile]));
  const envAdminEmails = readAdminEmailList();

  const [guitars, documents, serviceEvents, transfers] = await Promise.all([
    supabase.from("guitars").select("id,owner_id,qr_code,status,visibility"),
    supabase.from("guitar_documents").select("id,guitars(owner_id)"),
    supabase.from("guitar_timeline_events").select("id,guitars(owner_id)"),
    supabase.from("ownership_transfers").select("id,from_owner_id,accepted_by,status")
  ]);

  const guitarRows = (guitars.data || []) as Array<{ id: string; owner_id: string | null; qr_code?: string | null; status?: string | null; visibility: string | null }>;
  const recordCounts = countByOwner(guitarRows, "owner_id");
  const publicRecordCounts = countByOwner(guitarRows.filter((item) => item.visibility === "public"), "owner_id");
  const privateRecordCounts = countByOwner(guitarRows.filter((item) => item.visibility === "private"), "owner_id");
  const verifiedRecordCounts = countByOwner(guitarRows.filter((item) => item.status === "verified"), "owner_id");
  const transferCounts = new Map<string, number>();
  const pendingTransferCounts = new Map<string, number>();
  const acceptedTransferCounts = new Map<string, number>();
  for (const transfer of (transfers.data || []) as Array<{ from_owner_id?: string | null; accepted_by?: string | null; status?: string | null }>) {
    for (const key of [transfer.from_owner_id, transfer.accepted_by]) {
      if (key) {
        transferCounts.set(key, (transferCounts.get(key) || 0) + 1);
        if (transfer.status === "sent") pendingTransferCounts.set(key, (pendingTransferCounts.get(key) || 0) + 1);
        if (transfer.status === "accepted") acceptedTransferCounts.set(key, (acceptedTransferCounts.get(key) || 0) + 1);
      }
    }
  }
  const trustKeys = guitarRows.map((guitar) => guitar.qr_code ? recordTrustContentKey(guitar.qr_code) : "").filter(Boolean);
  const trustResult = trustKeys.length
    ? await supabase.from("site_content").select("content_key,content_value").in("content_key", trustKeys)
    : { data: [], error: null };
  const ownerByTrustKey = new Map(guitarRows.map((guitar) => [recordTrustContentKey(guitar.qr_code || ""), guitar.owner_id || ""]));
  const authenticityConfirmedCounts = new Map<string, number>();
  for (const row of (trustResult.data || []) as Array<{ content_key?: string | null; content_value?: unknown }>) {
    const trust = mergeRecordTrustSettings(row.content_value as Parameters<typeof mergeRecordTrustSettings>[0]);
    const ownerId = ownerByTrustKey.get(row.content_key || "") || "";
    if (ownerId && trust.authenticityStatus === "confirmed") {
      authenticityConfirmedCounts.set(ownerId, (authenticityConfirmedCounts.get(ownerId) || 0) + 1);
    }
  }

  const nestedOwnerCount = (rows: unknown[]) => {
    const counts = new Map<string, number>();
    for (const row of rows as Array<{ guitars?: { owner_id?: string | null } | Array<{ owner_id?: string | null }> }>) {
      const guitar = Array.isArray(row.guitars) ? row.guitars[0] : row.guitars;
      const ownerId = guitar?.owner_id || "";
      if (ownerId) {
        counts.set(ownerId, (counts.get(ownerId) || 0) + 1);
      }
    }
    return counts;
  };
  const documentCounts = nestedOwnerCount(documents.data || []);
  const serviceCounts = nestedOwnerCount(serviceEvents.data || []);

  let users = (authUsers.data.users || []).map((user) => {
    const profile = profiles.get(user.id);
    const accountStatus =
      profile?.account_status === "locked" || profile?.account_status === "banned" || profile?.account_status === "removed"
        ? profile.account_status
        : "active";
    const role = profile?.role || "user";
    const roleIsAdmin = isAdminRole(role);
    const envManaged = envAdminEmails.includes(normalizeEmail(user.email));
    const emptyCounts = {
      recordCount: recordCounts.get(user.id) || 0,
      proofDocumentCount: documentCounts.get(user.id) || 0,
      serviceEventCount: serviceCounts.get(user.id) || 0,
      transferCount: transferCounts.get(user.id) || 0,
      verifiedRecordCount: verifiedRecordCounts.get(user.id) || 0,
      authenticityConfirmedRecordCount: authenticityConfirmedCounts.get(user.id) || 0
    };
    const deleteBlockers = [
      envManaged ? "environment-managed admin" : "",
      roleIsAdmin ? "admin access" : "",
      emptyCounts.recordCount ? "records" : "",
      emptyCounts.proofDocumentCount ? "proof documents" : "",
      emptyCounts.serviceEventCount ? "service history" : "",
      emptyCounts.transferCount ? "transfers" : "",
      emptyCounts.verifiedRecordCount ? "verified records" : "",
      emptyCounts.authenticityConfirmedRecordCount ? "authenticity-confirmed records" : ""
    ].filter(Boolean);
    return {
      id: user.id,
      email: user.email || "",
      envManaged,
      createdAt: user.created_at || "",
      lastSignInAt: user.last_sign_in_at || "",
      role,
      accountStatus,
      hidePublicContent: profile?.hide_public_content === true,
      adminNotes: profile?.admin_notes || "",
      isEmpty: deleteBlockers.length === 0,
      deleteEligible: deleteBlockers.length === 0,
      deleteDisabledReason: deleteBlockers.length ? `Cannot delete: ${deleteBlockers.join(", ")}.` : "",
      recordCount: emptyCounts.recordCount,
      publicRecordCount: publicRecordCounts.get(user.id) || 0,
      privateRecordCount: privateRecordCounts.get(user.id) || 0,
      proofDocumentCount: emptyCounts.proofDocumentCount,
      serviceEventCount: emptyCounts.serviceEventCount,
      transferCount: emptyCounts.transferCount,
      pendingTransferCount: pendingTransferCounts.get(user.id) || 0,
      acceptedTransferCount: acceptedTransferCounts.get(user.id) || 0,
      verifiedRecordCount: emptyCounts.verifiedRecordCount,
      authenticityConfirmedRecordCount: emptyCounts.authenticityConfirmedRecordCount
    };
  });

  if (search) {
    users = users.filter((user) => user.email.toLowerCase().includes(search) || user.id.toLowerCase().includes(search));
  }

  if (status === "active" || status === "locked" || status === "banned" || status === "removed") {
    users = users.filter((user) => user.accountStatus === status);
  } else if (status === "admin") {
    users = users.filter((user) => user.role === "admin");
  } else if (status === "normal") {
    users = users.filter((user) => user.role !== "admin" && user.envManaged !== true);
  } else if (status === "empty") {
    users = users.filter((user) => user.isEmpty);
  } else if (status === "has-records") {
    users = users.filter((user) => user.recordCount > 0);
  }

  return adminJson({
    ok: true,
    users,
    migrationNotice: profileResult.error && /column .* does not exist/i.test(profileResult.error.message)
      ? "Run supabase/admin-panel-foundation.sql to enable lock, ban, notes, and hide-public-content controls."
      : ""
  });
}
