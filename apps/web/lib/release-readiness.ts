export const RELEASE_VERSION = "2026-09-17.2";
export const REQUIRED_DATABASE_CHECKS: readonly string[] = [
  "catalog_readable",
  "required_functions",
  "function_security",
  "blocked_function_grants",
  "private_tables",
  "private_table_grants",
  "server_only_policies",
  "private_storage_buckets",
  "private_storage_policy",
  "receipt_constraints",
  "editor_versioning",
  "schema_columns",
  "public_schema_create",
  "self_security"
];
export type ReleaseReadiness = { ready: true; releaseVersion: string; checks: {name: string; ok: true}[] };
export function isReleaseReady(value: unknown): value is ReleaseReadiness {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<ReleaseReadiness>;
  return result.ready === true && result.releaseVersion === RELEASE_VERSION &&
    Array.isArray(result.checks) && result.checks.length === REQUIRED_DATABASE_CHECKS.length &&
    result.checks.every(check => Boolean(check) && typeof check.name === "string" && check.ok === true) &&
    new Set(result.checks.map(check => check.name)).size === REQUIRED_DATABASE_CHECKS.length &&
    REQUIRED_DATABASE_CHECKS.every(name => result.checks?.some(check => check.name === name));
}
