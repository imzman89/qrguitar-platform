import { requireAdmin, adminJson } from "../_utils";
import { isZohoSmtpConfigured } from "../../../../lib/zoho-smtp-transport";
import type { ServerSupabaseClient } from "../../../../lib/admin-auth";
import { resolveBuildIdentity } from "../../../../lib/build-identity.mjs";
import { mergeRecordTrustSettings } from "../../../../lib/record-trust";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

async function tableCount(
  supabase: ServerSupabaseClient,
  table: string,
  filters: Array<[string, string | boolean]> = [],
  exclusions: Array<[string, string | boolean]> = []
) {
  let query = supabase.from(table).select("id", { count: "exact", head: true });
  for (const [column, value] of filters) {
    query = query.eq(column, value);
  }
  for (const [column, value] of exclusions) {
    query = query.neq(column, value);
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
  const [
    activeUsers,
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
    bannedUsers,
    removedUsers
  ] = await Promise.all([
    tableCount(supabase, "profiles", [["account_status", "active"]]),
    tableCount(supabase, "guitars"),
    tableCount(supabase, "guitars", [["visibility", "public"]]),
    tableCount(supabase, "guitars", [["visibility", "private"]]),
    tableCount(supabase, "guitars", [["status", "verified"]]),
    tableCount(supabase, "guitars", [["safety_status", "lost"]]),
    tableCount(supabase, "guitars", [["safety_status", "stolen"]]),
    tableCount(supabase, "ownership_transfers", [["status", "sent"]]),
    tableCount(supabase, "guitar_timeline_events", [], [["event_type", "profile_created"]]),
    tableCount(supabase, "guitar_documents"),
    tableCount(supabase, "profiles", [["account_status", "locked"]]),
    tableCount(supabase, "profiles", [["account_status", "banned"]]),
    tableCount(supabase, "profiles", [["account_status", "removed"]])
  ]);
  const trustResult = await supabase
    .from("site_content")
    .select("content_value")
    .like("content_key", "record_trust:%");
  const authenticityConfirmedRecords = trustResult.error
    ? null
    : ((trustResult.data || []) as Array<{ content_value?: unknown }>).filter((row) =>
        mergeRecordTrustSettings(row.content_value as Parameters<typeof mergeRecordTrustSettings>[0]).authenticityStatus === "confirmed"
      ).length;
  const [adminAuditCheck, serviceWorkflowCheck, storageCheck] = await Promise.all([
    supabase.from("admin_audit_events").select("id", { count: "exact", head: true }),
    supabase.from("service_provider_profiles").select("user_id", { count: "exact", head: true }),
    supabase.storage.listBuckets()
  ]);
  const bucketNames = new Set((storageCheck.data || []).map((bucket) => bucket.name));
  const requiredBuckets = ["instrument-media", "instrument-documents", "service-evidence"];
  const missingBuckets = requiredBuckets.filter((bucket) => !bucketNames.has(bucket));
  const buildIdentity = resolveBuildIdentity(process.env, { deploymentIdentifier: "local-review" });

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
      removedUsers,
      totalRecords,
      publicRecords,
      privateRecords,
      verifiedRecords,
      authenticityConfirmedRecords,
      lostRecords,
      stolenRecords,
      pendingTransfers,
      serviceEntries,
      proofDocuments
    },
    systemHealth: {
      build: {
        gitCommitSha: buildIdentity.gitCommitSha,
        buildTimestamp: buildIdentity.buildTimestamp,
        dirtyWorkingTree: buildIdentity.dirtyWorkingTree
      },
      deployment: {
        environment: buildIdentity.environment,
        identifier: buildIdentity.deploymentIdentifier
      },
      supabase: {
        configured: Boolean(
          process.env.NEXT_PUBLIC_SUPABASE_URL &&
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
          process.env.SUPABASE_SERVICE_ROLE_KEY
        ),
        responding: !authUsers.error
      },
      migrations: {
        adminFoundation: !adminAuditCheck.error,
        serviceWorkflow: !serviceWorkflowCheck.error
      },
      email: {
        provider: "Zoho SMTP",
        configured: isZohoSmtpConfigured(),
        senderConfigured: Boolean(process.env.SMTP_FROM)
      },
      storage: {
        responding: !storageCheck.error,
        requiredBucketsReady: missingBuckets.length === 0,
        missingBuckets
      }
    },
    migrationNotice: admin.message
  });
}
