import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { BillingError } from "./billing-service";
import type { PayPalWebhookCommand, PayPalWebhookPlanItem } from "./paypal-service";

type Json = Record<string, unknown>;
type Database = { rpc(name: string, args: Json): Promise<{ data: unknown; error: null | { code?: string } }> };
type Processor = {
  verifyWebhook(event: unknown, headers: Record<string, string>, raw: string): Promise<unknown>;
  prepareWebhook(event: unknown): Promise<PayPalWebhookPlanItem[]>;
  prepareWebhookItem(event: unknown, item: unknown, cursor: number): Promise<PayPalWebhookCommand>;
};
export type PayPalWebhookDelivery = {
  deliveryId: string; environment: "live" | "test"; state: "queued" | "verified" | "planned" | "retry" | "processing" | "completed" | "quarantined";
  eventId: string | null; eventType: string | null; canonicalDeliveryId: string | null; plan: PayPalWebhookPlanItem[] | null;
  cursor: number; totalItems: number | null; attemptCount: number; nextAttemptAt: string; leaseToken: string | null; lockedUntil: string | null;
  failureCount: number;
  lastErrorCode: string | null; outcomeCode: string | null; receivedAt: string; rawBody: string | null;
  updatedAt: string; acknowledgedAt: string | null;
  signatureHeaders: Record<string, string> | null; duplicate?: boolean; busy?: boolean;
};
type Dependencies = { environment: "live" | "test"; database: Database; processor: Processor; maxStages?: number; randomUUID?: () => string; now?: () => number };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT = /^[A-Za-z0-9_-]{8,100}$/, EVENT_TYPE = /^[A-Z0-9._-]{3,100}$/;
const obj = (value: unknown): Json => value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
const retryCode = (value: unknown) => typeof value === "string" && /^[a-z0-9_]{3,80}$/.test(value) ? value : "webhook_processing_failed";
function canonical(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") { if (!Number.isFinite(value)) throw new BillingError(400,"invalid_webhook","Invalid PayPal event."); return JSON.stringify(value); }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value as Json).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Json)[key])}`).join(",")}}`;
  throw new BillingError(400,"invalid_webhook","Invalid PayPal event.");
}
function signatureHeaders(value: unknown): Record<string,string> | null {
  const row = obj(value), keys = ["paypal-auth-algo","paypal-cert-url","paypal-transmission-id","paypal-transmission-sig","paypal-transmission-time"];
  if (Object.keys(row).length !== keys.length || keys.some(key => typeof row[key] !== "string" || !row[key] || String(row[key]).length > 2048 || /[\x00-\x1f\x7f]/.test(String(row[key])))) return null;
  return Object.fromEntries(keys.map(key => [key,String(row[key])]));
}
function delivery(value: unknown): PayPalWebhookDelivery {
  const row = obj(value), states = ["queued","verified","planned","retry","processing","completed","quarantined"], plan = row.plan;
  if (!UUID.test(String(row.deliveryId)) || !["live","test"].includes(String(row.environment)) || !states.includes(String(row.state))
    || !(row.eventId === null || EVENT.test(String(row.eventId))) || !(row.eventType === null || EVENT_TYPE.test(String(row.eventType)))
    || !(row.canonicalDeliveryId === null || UUID.test(String(row.canonicalDeliveryId))) || !(plan === null || (Array.isArray(plan) && plan.length >= 1 && plan.length <= 20))
    || !Number.isSafeInteger(row.cursor) || Number(row.cursor) < 0 || Number(row.cursor) > 20
    || !(row.totalItems === null || (Number.isSafeInteger(row.totalItems) && Number(row.totalItems) >= 1 && Number(row.totalItems) <= 20 && Number(row.cursor) <= Number(row.totalItems)))
    || ((plan === null) !== (row.totalItems === null)) || (Array.isArray(plan) && plan.length !== Number(row.totalItems))
    || !Number.isSafeInteger(row.attemptCount) || Number(row.attemptCount) < 0 || Number(row.attemptCount) > 2147483647
    || !Number.isSafeInteger(row.failureCount) || Number(row.failureCount) < 0 || Number(row.failureCount) > 32
    || typeof row.nextAttemptAt !== "string" || !Number.isFinite(Date.parse(row.nextAttemptAt))
    || !(row.leaseToken === null || UUID.test(String(row.leaseToken))) || !(row.lockedUntil === null || (typeof row.lockedUntil === "string" && Number.isFinite(Date.parse(row.lockedUntil))))
    || !(row.lastErrorCode === null || /^[a-z0-9_]{3,80}$/.test(String(row.lastErrorCode))) || !(row.outcomeCode === null || /^[a-z0-9_]{3,80}$/.test(String(row.outcomeCode)))
    || typeof row.receivedAt !== "string" || !Number.isFinite(Date.parse(row.receivedAt))
    || typeof row.updatedAt !== "string" || !Number.isFinite(Date.parse(row.updatedAt))
    || !(row.acknowledgedAt === null || (typeof row.acknowledgedAt === "string" && Number.isFinite(Date.parse(row.acknowledgedAt))))
    || !(row.rawBody === null || (typeof row.rawBody === "string" && Buffer.byteLength(row.rawBody) <= 65536))
    || !(row.signatureHeaders === null || signatureHeaders(row.signatureHeaders))) throw new BillingError(503,"webhook_queue_invalid","PayPal delivery state could not be verified.");
  return { deliveryId:String(row.deliveryId),environment:row.environment as "live"|"test",state:row.state as PayPalWebhookDelivery["state"],
    eventId:row.eventId as string|null,eventType:row.eventType as string|null,canonicalDeliveryId:row.canonicalDeliveryId as string|null,
    plan:plan as PayPalWebhookPlanItem[]|null,cursor:Number(row.cursor),totalItems:row.totalItems as number|null,attemptCount:Number(row.attemptCount),
    failureCount:Number(row.failureCount),
    nextAttemptAt:String(row.nextAttemptAt),leaseToken:row.leaseToken as string|null,lockedUntil:row.lockedUntil as string|null,
    lastErrorCode:row.lastErrorCode as string|null,outcomeCode:row.outcomeCode as string|null,receivedAt:String(row.receivedAt),
    updatedAt:String(row.updatedAt),acknowledgedAt:row.acknowledgedAt as string|null,
    rawBody:row.rawBody as string|null,signatureHeaders:row.signatureHeaders === null ? null : signatureHeaders(row.signatureHeaders),
    ...(typeof row.duplicate === "boolean" ? {duplicate:row.duplicate}:{}),...(typeof row.busy === "boolean" ? {busy:row.busy}:{}) };
}

export function createPayPalWebhookInbox(deps: Dependencies) {
  async function rpcResult(name: string, args: Json, nullable = false) {
    const result = await deps.database.rpc(name,args);
    if (result.error) {
      if (["PT409","23505"].includes(result.error.code || "")) throw new BillingError(409,"webhook_queue_conflict","PayPal delivery is already being processed.");
      if (result.error.code === "PT429") throw new BillingError(429,"webhook_queue_busy","PayPal delivery intake is temporarily full.");
      if (result.error.code === "P0002") throw new BillingError(404,"webhook_not_found","PayPal delivery was not found.");
      if (result.error.code === "22023") throw new BillingError(400,"invalid_webhook","Invalid PayPal delivery.");
      throw new BillingError(503,"webhook_queue_unavailable","PayPal delivery could not be saved.");
    }
    if (result.data == null && !nullable) throw new BillingError(503,"webhook_queue_unavailable","PayPal delivery could not be saved.");
    return result.data;
  }
  const rpc = (name: string,args: Json) => rpcResult(name,args);
  async function enqueue(rawBody: string, headers: Record<string,string>) {
    if (Buffer.byteLength(rawBody) < 2 || Buffer.byteLength(rawBody) > 65536 || !signatureHeaders(headers)) throw new BillingError(400,"invalid_webhook","Invalid PayPal delivery.");
    return delivery(await rpc("billing_paypal_webhook_enqueue",{p_environment:deps.environment,p_raw_body:rawBody,p_signature_headers:headers}));
  }
  async function claim(deliveryId: string) {
    const lease = (deps.randomUUID || randomUUID)();
    return delivery(await rpc("billing_paypal_webhook_claim",{p_environment:deps.environment,p_delivery_id:deliveryId,p_lease_token:lease}));
  }
  async function claimDue() {
    const lease=(deps.randomUUID || randomUUID)(),value=await rpcResult("billing_paypal_webhook_claim_due",{p_environment:deps.environment,p_lease_token:lease},true);
    return value == null ? null : delivery(value);
  }
  async function retry(row: PayPalWebhookDelivery, error: unknown) {
    if (!row.leaseToken) return row;
    const code = retryCode(error instanceof BillingError ? error.code : "webhook_processing_failed"), delay = Math.min(21600,5 * 2 ** Math.min(row.failureCount,13));
    return delivery(await rpc("billing_paypal_webhook_retry",{p_environment:deps.environment,p_delivery_id:row.deliveryId,p_lease_token:row.leaseToken,p_error_code:code,p_delay_seconds:delay}));
  }
  async function quarantine(row: PayPalWebhookDelivery, error: unknown) {
    if (!row.leaseToken) return row;
    return delivery(await rpc("billing_paypal_webhook_quarantine",{p_environment:deps.environment,p_delivery_id:row.deliveryId,p_lease_token:row.leaseToken,
      p_error_code:retryCode(error instanceof BillingError ? error.code : "invalid_webhook")}));
  }
  async function advanceFrom(inputDeliveryId: string, initial: PayPalWebhookDelivery | null = null): Promise<PayPalWebhookDelivery> {
    if (!UUID.test(inputDeliveryId)) throw new BillingError(400,"invalid_webhook","Invalid PayPal delivery.");
    let deliveryId = inputDeliveryId, current: PayPalWebhookDelivery | null = initial, effectProcessed = false;
    for (let stage=0;stage<(deps.maxStages ?? 3);stage++) {
      if (!current?.leaseToken) current = await claim(deliveryId); deliveryId = current.deliveryId;
      if (["completed","quarantined"].includes(current.state) || current.busy || !current.leaseToken) return current;
      try {
        let event: unknown;
        if (current.plan) {
          if (!current.eventId || !current.eventType) throw new BillingError(400,"invalid_webhook_plan","PayPal delivery plan has no verified event identity.");
          event={id:current.eventId,event_type:current.eventType,resource:{}};
        } else {
          const rawBody=current.rawBody,signedHeaders=current.signatureHeaders;
          if (!rawBody || !signedHeaders) throw new BillingError(400,"webhook_payload_expired","PayPal delivery payload is unavailable.");
          try { event=JSON.parse(rawBody); } catch { throw new BillingError(400,"invalid_webhook","Invalid PayPal event."); }
          if (!current.eventId) {
            await deps.processor.verifyWebhook(event,signedHeaders,rawBody);
            const parsed=obj(event),eventId=String(parsed.id || ""),eventType=String(parsed.event_type || ""),eventHash=createHash("sha256").update(canonical(event)).digest("hex");
            current=delivery(await rpc("billing_paypal_webhook_mark_verified",{p_environment:deps.environment,p_delivery_id:current.deliveryId,p_lease_token:current.leaseToken,
              p_event_id:eventId,p_event_type:eventType,p_event_hash:eventHash}));
            deliveryId=current.deliveryId;if (["completed","quarantined"].includes(current.state)) return current;continue;
          }
        }
        if (!current.plan) {
          const plan=await deps.processor.prepareWebhook(event);
          current=delivery(await rpc("billing_paypal_webhook_save_plan",{p_environment:deps.environment,p_delivery_id:current.deliveryId,p_lease_token:current.leaseToken,p_plan:plan}));
          continue;
        }
        if (effectProcessed) return current;
        const item=current.plan[current.cursor];if (!item) throw new BillingError(400,"invalid_webhook_plan","Invalid PayPal webhook plan.");
        effectProcessed=true;const command=await deps.processor.prepareWebhookItem(event,item,current.cursor);
        current=delivery(await rpc("billing_paypal_webhook_apply_item",{p_environment:deps.environment,p_delivery_id:current.deliveryId,p_lease_token:current.leaseToken,
          p_cursor:current.cursor,p_command:command}));
        return current;
      } catch (error) {
        if (error instanceof BillingError && error.status >= 400 && error.status < 500 && ![408,409,429].includes(error.status)) return quarantine(current,error);
        return retry(current,error);
      }
    }
    return current || claim(deliveryId);
  }
  async function advance(inputDeliveryId: string) { return advanceFrom(inputDeliveryId); }
  async function sweep(options: { maxItems?: number; deadlineMs?: number } = {}) {
    const maximum=Math.min(8,Math.max(1,options.maxItems ?? 8)),deadline=Math.min(45000,Math.max(1000,options.deadlineMs ?? 45000));
    const clock=deps.now || Date.now,started=clock(),latestSafeStart=Math.min(deadline,5000),results:PayPalWebhookDelivery[]=[];let applied=0;
    // A claimed unit may still need several independently timed provider/RPC
    // calls. Start additional work only near the beginning of a 60-second route;
    // an atomic lease makes a host termination after that point recoverable.
    while(results.length<maximum && (results.length===0 || clock()-started<latestSafeStart)) {
      const claimed=await claimDue();if(!claimed)break;
      const before=claimed.cursor,result=claimed.leaseToken ? await advanceFrom(claimed.deliveryId,claimed) : claimed;
      if(result.cursor>before)applied++;results.push(result);
    }
    // Checkout activation depends on an observed successful scheduler run, not
    // merely on a configured bearer secret. Record only after the bounded sweep
    // finishes; a claim/provider/database exception leaves the prior heartbeat.
    if(await rpc("billing_paypal_webhook_record_heartbeat",{p_environment:deps.environment})!==true)
      throw new BillingError(503,"webhook_sweep_unavailable","Webhook recovery could not be confirmed.");
    return { claimed:results.length,applied,completed:results.filter(value=>value.state==="completed").length,
      quarantined:results.filter(value=>value.state==="quarantined").length,deadlineReached:clock()-started>=latestSafeStart,deliveries:results };
  }
  return { enqueue, advance, claimDue, sweep };
}
