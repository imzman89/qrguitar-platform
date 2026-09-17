const productionDatabaseOrigin = "https://qvoruycxxrbarlafvhbi.supabase.co";
function databaseOrigin(value: string | undefined): string | null {
  try {
    const url = new URL(value || "");
    return url.protocol === "https:" && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash ? url.origin : null;
  } catch { return null; }
}

export function isIsolatedBillingTestDatabase(environment: Record<string, string | undefined>, supabaseUrl: string) {
  const actual = databaseOrigin(supabaseUrl), intended = databaseOrigin(environment.QRGUITAR_BILLING_TEST_DATABASE_URL);
  return actual !== null && actual !== productionDatabaseOrigin && actual === intended;
}

/** Server configuration only. Never accept environment selection from a Profile request. */
export function profileBillingEnvironment(environment: Record<string, string | undefined>, supabaseUrl: string): "live" | "test" | null {
  if (!environment.STRIPE_ENVIRONMENT || environment.STRIPE_ENVIRONMENT === "live") return "live";
  return environment.STRIPE_ENVIRONMENT === "test" && isIsolatedBillingTestDatabase(environment, supabaseUrl) ? "test" : null;
}
