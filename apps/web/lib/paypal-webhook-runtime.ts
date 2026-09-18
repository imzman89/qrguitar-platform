import "server-only";
import { BillingError } from "./billing-service";
import { profileBillingEnvironment } from "./billing-environment";
import { createServerSupabaseClientWithTimeout, getSupabaseEnvStatus } from "./supabase-server";
import { readPayPalConfig, readPayPalWebhookSweepSecret } from "./paypal-config";
import { createPayPalGateway } from "./paypal-gateway";
import { createPayPalService } from "./paypal-service";
import { createPayPalWebhookInbox } from "./paypal-webhook-inbox";
import { createPayPalWebhookHandler } from "./paypal-webhook-http";
import { createPayPalWebhookSweepHandler } from "./paypal-webhook-sweep-http";

const STEP_TIMEOUT_MS=5500;
export function getPayPalWebhookInbox() {
  const settings=getSupabaseEnvStatus();if(!settings.isConfigured)return null;
  const environment=profileBillingEnvironment(process.env,settings.supabaseUrl);if(!environment)return null;
  const database=createServerSupabaseClientWithTimeout(STEP_TIMEOUT_MS);if(!database)return null;
  const config=readPayPalConfig(process.env,environment);if(!config.configured)return null;
  const gateway=createPayPalGateway(config,fetch,STEP_TIMEOUT_MS),rpc=async(name:string,args:Record<string,unknown>)=>await database.rpc(name,args);
  const processor=createPayPalService<never>({config,gateway,database:{rpc},authenticate:async()=>null,timeoutMs:STEP_TIMEOUT_MS});
  return createPayPalWebhookInbox({environment,database:{rpc},processor,maxStages:2});
}
export async function advancePayPalWebhookDelivery(deliveryId:string) {
  const inbox=getPayPalWebhookInbox();if(!inbox)throw new BillingError(503,"billing_disabled","Payments are not available right now.");
  return inbox.advance(deliveryId);
}
export async function sweepPayPalWebhookDeliveries(options:{maxItems?:number;deadlineMs?:number}={}) {
  const inbox=getPayPalWebhookInbox();if(!inbox)throw new BillingError(503,"billing_disabled","Payments are not available right now.");
  return inbox.sweep(options);
}
export const paypalWebhookPOST=createPayPalWebhookHandler({inbox:getPayPalWebhookInbox});
export const paypalWebhookSweep=createPayPalWebhookSweepHandler({
  secret:()=>readPayPalWebhookSweepSecret(process.env)||null,
  sweep:()=>sweepPayPalWebhookDeliveries({maxItems:8,deadlineMs:5000})
});
