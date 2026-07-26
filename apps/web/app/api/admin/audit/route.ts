import { adminJson, requireAdmin } from "../_utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const PRIVATE_METADATA_KEY = /(email|token|secret|password|storage.?path|signed.?url|authorization|cookie)/i;

function sanitizeAuditMetadata(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeAuditMetadata);
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      PRIVATE_METADATA_KEY.test(key) ? "[redacted]" : sanitizeAuditMetadata(item)
    ])
  );
}

export async function GET(request: Request) {
  const access = await requireAdmin(request);
  if (!access.ok) {
    return access.response;
  }

  const { supabase } = access;
  const result = await supabase
    .from("admin_audit_events")
    .select("id,actor_user_id,actor_email,action,target_type,target_id,target_user_id,reason,metadata,created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (result.error) {
    const needsMigration = /relation .* does not exist/i.test(result.error.message || "");
    return adminJson(
      {
        ok: false,
        auditEvents: [],
        message: needsMigration
          ? "Run supabase/admin-panel-foundation.sql to enable the admin audit log."
          : result.error.message || "Could not load audit log."
      },
      { status: needsMigration ? 503 : 500 }
    );
  }

  return adminJson({
    ok: true,
    auditEvents: (result.data || []).map((event) => ({
      ...event,
      actor_email: undefined,
      metadata: sanitizeAuditMetadata(event.metadata)
    }))
  });
}
