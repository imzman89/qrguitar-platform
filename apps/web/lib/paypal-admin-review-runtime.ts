import "server-only";
import { BillingError } from "./billing-service";
import { profileBillingEnvironment } from "./billing-environment";
import { createServerSupabaseClient, getAuthenticatedUser, getSupabaseEnvStatus } from "./supabase-server";
import { createPayPalAdminReviewService } from "./paypal-admin-review-service";
import { createPayPalAdminReviewHandlers } from "./paypal-admin-review-http";
import { advancePayPalWebhookDelivery } from "./paypal-webhook-runtime";

export function getPayPalAdminReviewService() {
  const settings = getSupabaseEnvStatus();
  if (!settings.isConfigured) return null;
  const environment = profileBillingEnvironment(process.env, settings.supabaseUrl);
  if (!environment) return null;
  const database = createServerSupabaseClient();
  if (!database) return null;
  return createPayPalAdminReviewService<Request>({ environment, advanceDelivery: advancePayPalWebhookDelivery,
    database: { rpc: async (name, args) => await database.rpc(name, args) },
    authenticate: async request => {
      const auth = await getAuthenticatedUser(request);
      if (!auth.user) return null;
      const result = await database.from("profiles").select("account_status,role").eq("id", auth.user.id).maybeSingle<{ account_status: string; role: string }>();
      if (result.error) throw new BillingError(503, "review_unavailable", "Automatic payment reviews are unavailable. No hold was changed.");
      return result.data ? { id: auth.user.id, accountStatus: result.data.account_status, role: result.data.role } : null;
    }
  });
}
export const paypalAdminReviewHandlers = createPayPalAdminReviewHandlers({ service: getPayPalAdminReviewService });
