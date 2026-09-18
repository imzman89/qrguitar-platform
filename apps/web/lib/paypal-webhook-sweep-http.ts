import { createHash, timingSafeEqual } from "node:crypto";
import { BillingError, publicBillingError } from "./billing-service";

type SweepResult = { claimed:number;applied:number;completed:number;quarantined:number;deadlineReached:boolean };
const headers={"Cache-Control":"no-store, no-cache, must-revalidate","X-Content-Type-Options":"nosniff"};
const json=(value:unknown,status=200,extra:Record<string,string>={})=>Response.json(value,{status,headers:{...headers,...extra}});
function sameSecret(candidate:string,expected:string) {
  // Compare fixed-size digests so malformed token lengths do not bypass the
  // constant-time comparison. The byte-length check preserves exact matching.
  const left=createHash("sha256").update(candidate).digest(),right=createHash("sha256").update(expected).digest();
  return timingSafeEqual(left,right)&&Buffer.byteLength(candidate)===Buffer.byteLength(expected);
}

export function createPayPalWebhookSweepHandler(deps:{secret():string|null;sweep():Promise<SweepResult>}) {
  return async function sweep(request:Request) {
    try {
      const secret=deps.secret(),authorization=request.headers.get("authorization")||"";
      if(!secret||secret.length<32||secret.length>256||/[\s\x00-\x1f\x7f]/.test(secret))throw new BillingError(503,"webhook_sweep_disabled","Webhook recovery is unavailable.");
      if(!authorization.startsWith("Bearer ")||!sameSecret(authorization.slice(7),secret))throw new BillingError(401,"webhook_sweep_unauthorized","Authentication is required.");
      const result=await deps.sweep(),values=[result.claimed,result.applied,result.completed,result.quarantined];
      if(values.some(value=>!Number.isSafeInteger(value)||value<0||value>8)||typeof result.deadlineReached!=="boolean")throw new BillingError(503,"webhook_sweep_invalid","Webhook recovery result is unavailable.");
      return json({ok:true,claimed:result.claimed,applied:result.applied,completed:result.completed,quarantined:result.quarantined,deadlineReached:result.deadlineReached});
    } catch(error) {
      const result=publicBillingError(error);return json(result.body,result.status,result.status>=500?{"Retry-After":"60"}:{});
    }
  };
}
