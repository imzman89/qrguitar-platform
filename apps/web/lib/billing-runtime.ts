import "server-only";
import { createBillingService, readBillingConfig, BillingError } from "./billing-service";
import { createOfficialStripeGateway, STRIPE_API_VERSION } from "./stripe-sdk-gateway";
import { createServerSupabaseClient, getAuthenticatedUser, getSupabaseEnvStatus } from "./supabase-server";
import { createBillingHandlers } from "./billing-http";
import { profileBillingEnvironment } from "./billing-environment";

export function getBillingService() {
  // This loads local configuration when needed before reading billing settings.
  const databaseSettings = getSupabaseEnvStatus();
  const config = readBillingConfig(process.env);
  if (!databaseSettings.isConfigured) return null;
  // Blank/unset payment mode retains the existing LIVE ledger. Invalid modes fail closed.
  const configuredMode = process.env.STRIPE_ENVIRONMENT;
  if (configuredMode !== undefined && configuredMode !== "" && configuredMode !== "live" && configuredMode !== "test") return null;
  const ledgerEnvironment = profileBillingEnvironment(process.env, databaseSettings.supabaseUrl);
  if (!ledgerEnvironment) return null;
  // Preserve the exact SDK-version gate for offers, Checkout and webhooks. Ledger reads
  // need only authentication and a matching database scope, never payment credentials.
  if (config.webhookApiVersion !== STRIPE_API_VERSION) config.webhookApiVersion = undefined;
  const database = createServerSupabaseClient();
  if (!database) return null;
  let gateway: ReturnType<typeof createOfficialStripeGateway> | undefined;
  const stripe = new Proxy({} as ReturnType<typeof createOfficialStripeGateway>, {
    get(_target, property) {
      gateway ??= createOfficialStripeGateway(config);
      const value = Reflect.get(gateway, property);
      return typeof value === "function" ? value.bind(gateway) : value;
    }
  });
  return createBillingService<Request>({
    config, ledgerEnvironment, stripe,
    database: { rpc: async (name, args) => await database.rpc(name, args) },
    authenticate: async request => {
      const auth = await getAuthenticatedUser(request);
      if (!auth.user) return null;
      const result = await database.from("profiles").select("account_status").eq("id", auth.user.id).maybeSingle<{ account_status: string }>();
      if (result.error) throw new BillingError(503, "account_unavailable", "Your account could not be verified. Please try again.");
      if (!result.data || !["active", "locked", "banned", "removed"].includes(result.data.account_status)) {
        throw new BillingError(403, "account_unavailable", "This account cannot use billing. Contact QRguitar support.");
      }
      return { id: auth.user.id, accountStatus: result.data.account_status };
    }
  });
}

export const billingHandlers = createBillingHandlers({ service: getBillingService });
