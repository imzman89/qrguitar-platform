import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,"../../..");
const require=createRequire(path.join(root,"package.json")),ts=require("typescript"),modules=new Map();
function load(name){if(modules.has(name))return modules.get(name);const filename=path.join(root,"apps/web/lib",name+".ts");
  const js=ts.transpileModule(fs.readFileSync(filename,"utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const module={exports:{}};modules.set(name,module.exports);new Function("require","module","exports",js)(id=>id==="server-only"?{}:id.startsWith("./")?load(id.slice(2)):require(id),module,module.exports);
  modules.set(name,module.exports);return module.exports;}
const {createPayPalWebhookHandler}=load("paypal-webhook-http"),{BillingError}=load("billing-service");
const DELIVERY="11111111-1111-4111-8111-111111111111",RAW='{"id":"WHHTTP123","event_type":"PAYMENT.CAPTURE.COMPLETED","resource":{"id":"CAPTURE123"}}';
const signed={"paypal-auth-algo":"SHA256withRSA","paypal-cert-url":"https://api-m.sandbox.paypal.com/cert.pem","paypal-transmission-id":"T1","paypal-transmission-sig":"signed","paypal-transmission-time":"2026-09-18T00:00:00Z"};
const request=(raw=RAW,headers={})=>new Request("https://www.qrguitar.com/api/billing/paypal/webhook",{method:"POST",headers:{"content-type":"application/json",...signed,...headers},body:raw});
let passed=0;async function check(name,run){await run();passed++;console.log("PASS "+name);}
function fixture(result={state:"completed",lastErrorCode:null}){const calls=[];const inbox={async enqueue(raw,headers){calls.push({kind:"enqueue",raw,headers});return{deliveryId:DELIVERY};},async advance(id){calls.push({kind:"advance",id});return result;}};return{calls,post:createPayPalWebhookHandler({inbox:()=>inbox,bodyTimeoutMs:100})};}

await check("exact raw bytes and signature metadata are durably enqueued before processing",async()=>{const f=fixture(),response=await f.post(request());assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true,received:true});assert.equal(f.calls[0].raw,RAW);assert.deepEqual(f.calls[0].headers,signed);assert.equal(f.calls[1].id,DELIVERY);});
await check("every durably queued incomplete cursor state is accepted for the bounded sweep",async()=>{for(const state of ["queued","verified","planned","retry","processing"]){const f=fixture({state,lastErrorCode:"provider_timeout"}),response=await f.post(request());assert.equal(response.status,202,state);assert.deepEqual(await response.json(),{ok:true,received:true,processing:true});assert.equal(response.headers.get("retry-after"),null);}});
await check("inline processing failure after durable enqueue is still accepted for sweep recovery",async()=>{const calls=[],post=createPayPalWebhookHandler({inbox:()=>({async enqueue(){calls.push("enqueue");return{deliveryId:DELIVERY};},async advance(){calls.push("advance");throw new BillingError(503,"provider_timeout","retry");}})}),response=await post(request());assert.equal(response.status,202);assert.deepEqual(calls,["enqueue","advance"]);});
await check("verified conflict and invalid signature quarantine terminate with 400",async()=>{for(const code of ["verified_event_conflict","invalid_webhook_signature"]){const response=await fixture({state:"quarantined",lastErrorCode:code}).post(request());assert.equal(response.status,400);}});
await check("database intake failure stays non-2xx for PayPal retry",async()=>{const post=createPayPalWebhookHandler({inbox:()=>({async enqueue(){throw new BillingError(503,"webhook_queue_unavailable","retry");},async advance(){throw new Error("unreachable");}})}),response=await post(request());assert.equal(response.status,503);assert.equal(response.headers.get("retry-after"),"5");});
await check("quota pressure returns 429 with an explicit retry signal",async()=>{const post=createPayPalWebhookHandler({inbox:()=>({async enqueue(){throw new BillingError(429,"webhook_queue_busy","retry");},async advance(){throw new Error("unreachable");}})}),response=await post(request());assert.equal(response.status,429);assert.equal(response.headers.get("retry-after"),"5");});
await check("missing signatures and unsupported encodings never reach storage",async()=>{const f=fixture();const missing=await f.post(new Request("https://www.qrguitar.com/api/billing/paypal/webhook",{method:"POST",headers:{"content-type":"application/json"},body:RAW}));assert.equal(missing.status,400);const encoded=await f.post(request(RAW,{"content-encoding":"gzip"}));assert.equal(encoded.status,415);assert.equal(f.calls.length,0);});

console.log(`PayPal webhook HTTP boundary: ${passed} checks passed.`);
