import { adminJson, requireAdmin } from "../_utils";
import { normalizeEmail, readAdminEmailList } from "../../../../lib/admin-auth";

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
    supabase.from("guitars").select("id,owner_id,visibility"),
    supabase.from("guitar_documents").select("id,guitars(owner_id)"),
    supabase.from("guitar_timeline_events").select("id,guitars(owner_id)"),
    supabase.from("ownership_transfers").select("id,from_owner_id,accepted_by")
  ]);

  const guitarRows = (guitars.data || []) as Array<{ id: string; owner_id: string | null; visibility: string | null }>;
  const recordCounts = countByOwner(guitarRows, "owner_id");
  const publicRecordCounts = countByOwner(guitarRows.filter((item) => item.visibility === "public"), "owner_id");
  const privateRecordCounts = countByOwner(guitarRows.filter((item) => item.visibility === "private"), "owner_id");
  const transferCounts = new Map<string, number>();
  for (const transfer of (transfers.data || []) as Array<{ from_owner_id?: string | null; accepted_by?: string | null }>) {
    for (const key of [transfer.from_owner_id, transfer.accepted_by]) {
      if (key) {
        transferCounts.set(key, (transferCounts.get(key) || 0) + 1);
      }
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
    const accountStatus = profile?.account_status === "locked" || profile?.account_status === "banned" ? profile.account_status : "active";
    return {
      id: user.id,
      email: user.email || "",
      envManaged: envAdminEmails.includes(normalizeEmail(user.email)),
      createdAt: user.created_at || "",
      lastSignInAt: user.last_sign_in_at || "",
      role: profile?.role || "owner",
      accountStatus,
      hidePublicContent: profile?.hide_public_content === true,
      adminNotes: profile?.admin_notes || "",
      recordCount: recordCounts.get(user.id) || 0,
      publicRecordCount: publicRecordCounts.get(user.id) || 0,
      privateRecordCount: privateRecordCounts.get(user.id) || 0,
      proofDocumentCount: documentCounts.get(user.id) || 0,
      serviceEventCount: serviceCounts.get(user.id) || 0,
      transferCount: transferCounts.get(user.id) || 0
    };
  });

  if (search) {
    users = users.filter((user) => user.email.toLowerCase().includes(search) || user.id.toLowerCase().includes(search));
  }

  if (status === "active" || status === "locked" || status === "banned") {
    users = users.filter((user) => user.accountStatus === status);
  } else if (status === "admin") {
    users = users.filter((user) => user.role === "admin");
  } else if (status === "inactive") {
    users = users.filter((user) => !user.lastSignInAt);
  }

  return adminJson({
    ok: true,
    users,
    migrationNotice: profileResult.error && /column .* does not exist/i.test(profileResult.error.message)
      ? "Run supabase/admin-panel-foundation.sql to enable lock, ban, notes, and hide-public-content controls."
      : ""
  });
}
