import type { ServerSupabaseClient } from "./admin-auth";
import { isAdminRole } from "./admin-auth";
import { publicCollectionOwnerKey } from "./public-collections";

export { ACCOUNT_DELETION_UNAVAILABLE } from "./admin-account-deletion-status";

export function isAccountDeletionTarget(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Read-only diagnostics, never permission to delete. Each query asks only whether
 * an association exists, so PostgREST row limits cannot turn a large history into
 * an empty account. This inventory must grow with new account-bearing tables.
 *
 * Auth deletion runs in a different transaction from these reads. Existing create
 * and billing advisory locks are transaction-scoped; claims and staged uploads
 * use other row locks. Neither another eligibility read nor setting account_status
 * closes every in-flight writer. Keep the route disabled until a database-backed
 * deletion protocol covers every writer and has explicit data-retention rules.
 */
export async function inspectAccountDeletion(
  supabase: ServerSupabaseClient,
  targetUserId: string,
  targetEmail: string,
  targetIsEnvManaged: boolean
): Promise<{ readable: boolean; blockers: string[] }> {
  if (!isAccountDeletionTarget(targetUserId)) return { readable: false, blockers: [] };

  const blockers = new Set<string>();
  if (targetIsEnvManaged) blockers.add("environment-managed admin");
  type Check = { label: string; run: () => PromiseLike<{ data: unknown; error: unknown }> };
  const checks: Check[] = [];
  const association = (label: string, table: string, columns: string[]) => {
    checks.push({
      label,
      run: () => supabase.from(table).select(columns[0]).or(columns.map((column) => `${column}.eq.${targetUserId}`).join(",")).limit(1)
    });
  };

  association("instrument ownership or safety history", "guitars", ["owner_id", "safety_status_updated_by"]);
  association("uploaded documents", "guitar_documents", ["uploaded_by_user_id"]);
  association("instrument history", "guitar_timeline_events", ["created_by_user_id", "provider_user_id", "evidence_reviewed_by"]);
  association("serial history", "guitar_serial_aliases", ["created_by"]);
  association("external media", "guitar_external_media", ["created_by"]);
  association("ownership transfers", "ownership_transfers", ["from_owner_id", "accepted_by"]);
  if (targetEmail) checks.push({
    label: "ownership transfers",
    run: () => supabase.from("ownership_transfers").select("id").eq("to_email", targetEmail).limit(1)
  });
  association("ownership claims", "ownership_claims", ["current_owner_id", "claimant_user_id", "decided_by"]);
  association("claim evidence", "ownership_claim_evidence", ["uploaded_by"]);
  association("claim history", "ownership_claim_events", ["actor_user_id"]);
  association("provider records", "service_provider_profiles", ["user_id", "verified_by"]);
  association("provider access", "service_provider_profile_access", ["provider_user_id", "granted_by_user_id"]);
  association("service submissions", "service_submissions", ["provider_user_id", "owner_user_id"]);
  association("service evidence", "service_submission_evidence", ["uploaded_by_user_id"]);
  association("service activity", "service_submission_activity", ["actor_user_id"]);
  association("service notifications", "service_submission_notifications", ["recipient_user_id"]);
  association("staged or consumed uploads", "instrument_staged_uploads", ["owner_id"]);
  association("Profile creation receipts", "instrument_create_receipts", ["owner_id"]);
  association("site editor receipts", "site_editor_receipts", ["actor_user_id"]);
  checks.push({
    label: "public collection or site content",
    run: () => supabase.from("site_content").select("content_key").or([
      `updated_by.eq.${targetUserId}`,
      `content_key.eq.${publicCollectionOwnerKey(targetUserId)}`,
      `content_value->>ownerId.eq.${targetUserId}`,
      `content_key.like.create_submission:${targetUserId}:%`
    ].join(",")).limit(1)
  });
  for (const table of [
    "billing_customers", "billing_orders", "billing_receipts", "billing_credit_grants",
    "billing_credit_consumptions", "billing_credit_holds"
  ]) association("billing records", table, ["owner_id"]);
  association("billing review history", "billing_review_decisions", ["owner_id", "operator_id"]);

  const results = await Promise.allSettled([
    Promise.resolve().then(() => supabase.from("profiles").select("role").eq("id", targetUserId).maybeSingle<{ role?: string | null }>()),
    ...checks.map((check) => Promise.resolve().then(check.run))
  ]);
  const profile = results[0];
  if (profile.status !== "fulfilled" || profile.value.error) return { readable: false, blockers: [] };
  const profileData = profile.value.data as { role?: string | null } | null;
  if (profileData !== null && (typeof profileData !== "object" || Array.isArray(profileData))) return { readable: false, blockers: [] };
  if (isAdminRole(profileData?.role)) blockers.add("admin access");
  for (let index = 0; index < checks.length; index += 1) {
    const result = results[index + 1];
    if (result.status !== "fulfilled" || result.value.error || !Array.isArray(result.value.data)) {
      return { readable: false, blockers: [] };
    }
    if (result.value.data.length) blockers.add(checks[index].label);
  }
  return { readable: true, blockers: [...blockers] };
}
