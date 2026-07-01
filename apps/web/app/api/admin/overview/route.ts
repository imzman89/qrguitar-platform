import { requireAdmin, adminJson } from "../_utils";
import type { ServerSupabaseClient } from "../../../../lib/admin-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

async function tableCount(supabase: ServerSupabaseClient, table: string, filters: Array<[string, string | boolean]> = []) {
  let query = supabase.from(table).select("id", { count: "exact", head: true });
  for (const [column, value] of filters) {
    query = query.eq(column, value);
  }
  const result = await query;
  return result.error ? null : result.count || 0;
}

export async function GET(request: Request) {
  const access = await requireAdmin(request);
  if (!access.ok) {
    return access.response;
  }

  const { supabase, admin } = access;
  const authUsers = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const users = authUsers.data?.users || [];
  const activeUsers = users.filter((user) => user.last_sign_in_at).length;

  const [
    totalRecords,
    publicRecords,
    privateRecords,
    verifiedRecords,
    lostRecords,
    stolenRecords,
    pendingTransfers,
    serviceEntries,
    proofDocuments,
    lockedUsers,
    bannedUsers
  ] = await Promise.all([
    tableCount(supabase, "guitars"),
    tableCount(supabase, "guitars", [["visibility", "public"]]),
    tableCount(supabase, "guitars", [["visibility", "private"]]),
    tableCount(supabase, "guitars", [["status", "verified"]]),
    tableCount(supabase, "guitars", [["safety_status", "lost"]]),
    tableCount(supabase, "guitars", [["safety_status", "stolen"]]),
    tableCount(supabase, "ownership_transfers", [["status", "sent"]]),
    tableCount(supabase, "guitar_timeline_events"),
    tableCount(supabase, "guitar_documents"),
    tableCount(supabase, "profiles", [["account_status", "locked"]]),
    tableCount(supabase, "profiles", [["account_status", "banned"]])
  ]);

  return adminJson({
    ok: true,
    admin: {
      email: admin.email,
      role: admin.role || "env allowlist",
      accessSource: admin.accessSource,
      accountStatus: admin.accountStatus
    },
    counts: {
      totalUsers: users.length,
      activeUsers,
      lockedUsers,
      bannedUsers,
      totalRecords,
      publicRecords,
      privateRecords,
      verifiedRecords,
      authenticityConfirmedRecords: null,
      lostRecords,
      stolenRecords,
      pendingTransfers,
      serviceEntries,
      proofDocuments
    },
    migrationNotice: admin.message
  });
}
