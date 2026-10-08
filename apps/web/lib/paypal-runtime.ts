import "server-only";
import { BillingError } from "./billing-service";
import { profileBillingEnvironment } from "./billing-environment";
import { createServerSupabaseClient, getAuthenticatedUser, getSupabaseEnvStatus } from "./supabase-server";
import { readPayPalConfig } from "./paypal-config";
import { createPayPalGateway } from "./paypal-gateway";
import { createPayPalService } from "./paypal-service";
import { createPayPalHandlers } from "./paypal-http";
import { normalizeEmail, readAdminEmailList } from "./admin-auth";

export function getPayPalService() {
  const settings = getSupabaseEnvStatus();
  if (!settings.isConfigured) return null;
  const environment = profileBillingEnvironment(process.env, settings.supabaseUrl);
  if (!environment) return null;
  const database = createServerSupabaseClient();
  if (!database) return null;
  const config = readPayPalConfig(process.env, environment);
  return createPayPalService<Request>({ config, gateway: createPayPalGateway(config),
    database: { rpc: async (name, args) => await database.rpc(name, args) },
    authenticate: async request => {
      const auth = await getAuthenticatedUser(request);
      if (!auth.user) return null;
      const result = await database.from("profiles").select("account_status,role").eq("id", auth.user.id).maybeSingle<{ account_status: string; role: string | null }>();
      if (result.error) throw new BillingError(503, "account_unavailable", "Your account could not be verified. Try again.");
      if (!result.data || !["active", "locked", "banned", "removed"].includes(result.data.account_status)) throw new BillingError(403, "account_unavailable", "This account cannot use payments.");
      return { id: auth.user.id, accountStatus: result.data.account_status,
        isAdmin: result.data.role === "admin" || readAdminEmailList().includes(normalizeEmail(auth.user.email)) };
    }
  });
}
export const paypalHandlers = createPayPalHandlers({ service: getPayPalService });
