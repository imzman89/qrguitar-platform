import "server-only";
import { BillingError } from "./billing-service";
import { profileBillingEnvironment } from "./billing-environment";
import { createServerSupabaseClient, getAuthenticatedUser, getSupabaseEnvStatus } from "./supabase-server";
import { readDirectPaymentsConfig } from "./direct-payments-config";
import { createDirectPaymentsService } from "./direct-payments-service";
import { createDirectPaymentsHandlers } from "./direct-payments-http";

export function getDirectPaymentsService() {
  const settings = getSupabaseEnvStatus();
  if (!settings.isConfigured) return null;
  const environment = profileBillingEnvironment(process.env, settings.supabaseUrl);
  if (!environment) return null;
  const database = createServerSupabaseClient();
  if (!database) return null;
  const config = readDirectPaymentsConfig(process.env);
  // Do not send sandbox users to a live PayPal account or vice versa.
  for (const method of config.methods) if (method.key === "paypal") {
    if (Object.values(method.links).some(link => new URL(link!).hostname.includes("sandbox") !== (environment === "test"))) config.enabled = false;
  }
  return createDirectPaymentsService<Request>({ config, environment,
    database: { rpc: async (name, args) => await database.rpc(name, args) },
    authenticate: async request => {
      const auth = await getAuthenticatedUser(request);
      if (!auth.user) return null;
      const result = await database.from("profiles").select("account_status,role").eq("id", auth.user.id).maybeSingle<{ account_status: string; role: string }>();
      if (result.error) throw new BillingError(503, "account_unavailable", "Your account could not be verified. Please try again.");
      if (!result.data || !["active", "locked", "banned", "removed"].includes(result.data.account_status)) throw new BillingError(403, "account_unavailable", "This account cannot use payments.");
      return { id: auth.user.id, accountStatus: result.data.account_status, role: result.data.role };
    }
  });
}
export const directPaymentsHandlers = createDirectPaymentsHandlers({ service: getDirectPaymentsService });
