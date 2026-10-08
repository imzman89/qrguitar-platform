import { BillingError, publicBillingError } from "./billing-service";
import { readBillingBody } from "./billing-http";

type Inbox = { enqueue(raw: string, headers: Record<string,string>): Promise<{deliveryId:string}>; advance(deliveryId:string): Promise<{state:string;lastErrorCode:string|null}> };
const responseHeaders = { "Cache-Control":"no-store, no-cache, must-revalidate", "X-Content-Type-Options":"nosniff", Vary:"PayPal-Transmission-Id" };
const json = (value: unknown,status=200,extra:Record<string,string>={}) => Response.json(value,{status,headers:{...responseHeaders,...extra}});
const signatureNames = ["paypal-auth-algo","paypal-cert-url","paypal-transmission-id","paypal-transmission-sig","paypal-transmission-time"];
function failure(error: unknown) { const result=publicBillingError(error);return json(result.body,result.status,result.status>=500||result.status===429?{"Retry-After":"5"}:{}); }

export function createPayPalWebhookHandler(deps:{inbox():Inbox|null;bodyTimeoutMs?:number}) {
  return async function POST(request:Request) {
    try {
      if (request.headers.get("content-type")?.split(";",1)[0].trim().toLowerCase()!=="application/json"
        || (request.headers.has("content-encoding")&&request.headers.get("content-encoding")!=="identity")) throw new BillingError(415,"invalid_content_type","Send a JSON request.");
      const headers:Record<string,string>={};for(const name of signatureNames){const value=request.headers.get(name);
        if(!value||value.length>2048||/[\x00-\x1f\x7f]/.test(value))throw new BillingError(400,"invalid_webhook_signature","Missing PayPal signature.");headers[name]=value;}
      const bytes=await readBillingBody(request,65536,deps.bodyTimeoutMs),raw=new TextDecoder("utf-8",{fatal:true}).decode(bytes);
      const inbox=deps.inbox();if(!inbox)throw new BillingError(503,"billing_disabled","Payments are not available right now.");
      // The exact untrusted delivery is committed before any signature/provider
      // work. Database failure remains non-2xx so PayPal retains responsibility.
      const queued=await inbox.enqueue(raw,headers);let result:{state:string;lastErrorCode:string|null};
      try { result=await inbox.advance(queued.deliveryId); }
      catch { return json({ok:true,received:true,processing:true},202); }
      if(result.state==="completed")return json({ok:true,received:true});
      if(result.state==="quarantined"&&["invalid_webhook","invalid_webhook_signature","invalid_webhook_plan","webhook_payload_expired","verified_event_conflict"].includes(result.lastErrorCode||""))
        return json({ok:false,code:"invalid_webhook",message:"The PayPal event could not be verified."},400);
      // Durable intake transfers continuation responsibility to the bounded
      // sweep/admin queue. PayPal can release this delivery after any 2xx.
      return json({ok:true,received:true,processing:true},202);
    } catch(error){return failure(error);}
  };
}
