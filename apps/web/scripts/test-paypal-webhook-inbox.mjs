import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,"../../..");
const require=createRequire(path.join(root,"package.json")),ts=require("typescript"),modules=new Map();
function load(name){if(modules.has(name))return modules.get(name);const filename=path.join(root,"apps/web/lib",name+".ts");
  const js=ts.transpileModule(fs.readFileSync(filename,"utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const module={exports:{}};modules.set(name,module.exports);new Function("require","module","exports",js)(id=>id==="server-only"?{}:id.startsWith("./")?load(id.slice(2)):require(id),module,module.exports);
  modules.set(name,module.exports);return module.exports;}
const {createPayPalWebhookInbox}=load("paypal-webhook-inbox"),{BillingError}=load("billing-service");
const DELIVERY=randomUUID(),LEASES=Array.from({length:40},()=>randomUUID()),EVENT={id:"WHDURABLE123",event_type:"CUSTOMER.DISPUTE.CREATED",resource:{dispute_id:"PP-D-123"}};
const RAW=JSON.stringify(EVENT),SIGNED={"paypal-auth-algo":"SHA256withRSA","paypal-cert-url":"https://api-m.sandbox.paypal.com/cert.pem","paypal-transmission-id":"T1","paypal-transmission-sig":"signed","paypal-transmission-time":"2026-09-18T00:00:00Z"};
const detail={stage:null,reason:null,outcome:null,captureStatus:null};
const item=id=>({action:"dispute",resourceKind:"dispute",resourceId:"PP-D-123",captureId:id,refundId:null,disputeId:"PP-D-123",caseId:"PP-D-123",providerStatus:"OPEN",amount:1200,currency:"USD",detail});
const PLAN=[item("CAPTURE12345"),item("CAPTURE67890")];
let passed=0;async function check(name,run){await run();passed++;console.log("PASS "+name);}

function fixture({processor:processorOverrides={},initial={},loseApplyResponse=false,heartbeatError=false,now}={}){
  let leaseIndex=0,payload=true,lost=false;const calls=[],outcomes=[];
  const state={deliveryId:DELIVERY,environment:"test",state:"queued",eventId:null,eventType:null,canonicalDeliveryId:null,plan:null,cursor:0,totalItems:null,
    attemptCount:0,failureCount:0,nextAttemptAt:new Date().toISOString(),leaseToken:null,lockedUntil:null,lastErrorCode:null,outcomeCode:null,
    receivedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),acknowledgedAt:null,...initial};
  const view=includePayload=>({...structuredClone(state),rawBody:includePayload&&payload?RAW:null,signatureHeaders:includePayload&&payload?SIGNED:null});
  const database={async rpc(name,args){calls.push({name,args:structuredClone(args)});switch(name){
    case "billing_paypal_webhook_enqueue": return {data:{...view(false),duplicate:false},error:null};
    case "billing_paypal_webhook_claim":
      if(["completed","quarantined"].includes(state.state))return {data:view(false),error:null};
      state.state="processing";state.attemptCount++;state.leaseToken=args.p_lease_token;state.lockedUntil=new Date(Date.now()+120000).toISOString();state.updatedAt=new Date().toISOString();return {data:view(true),error:null};
    case "billing_paypal_webhook_claim_due":
      if(["completed","quarantined"].includes(state.state)||new Date(state.nextAttemptAt)>new Date()||(state.lockedUntil&&new Date(state.lockedUntil)>new Date()))return {data:null,error:null};
      state.state="processing";state.attemptCount++;state.leaseToken=args.p_lease_token;state.lockedUntil=new Date(Date.now()+120000).toISOString();state.updatedAt=new Date().toISOString();return {data:view(true),error:null};
    case "billing_paypal_webhook_mark_verified":
      assert.equal(args.p_lease_token,state.leaseToken);state.eventId=args.p_event_id;state.eventType=args.p_event_type;state.state="verified";state.failureCount=0;state.leaseToken=null;state.lockedUntil=null;return {data:view(false),error:null};
    case "billing_paypal_webhook_save_plan":
      assert.equal(args.p_lease_token,state.leaseToken);state.plan=structuredClone(args.p_plan);state.totalItems=state.plan.length;state.state="planned";state.failureCount=0;state.leaseToken=null;state.lockedUntil=null;payload=false;return {data:view(false),error:null};
    case "billing_paypal_webhook_apply_item":
      assert.equal(args.p_cursor,state.cursor);outcomes.push(structuredClone(args.p_command.outcome));state.cursor++;state.failureCount=0;state.leaseToken=null;state.lockedUntil=null;
      if(state.cursor===state.totalItems){state.state="completed";state.outcomeCode="processed";state.plan=null;state.totalItems=null;}else state.state="planned";
      if(loseApplyResponse&&!lost){lost=true;throw new Error("response lost after commit");}return {data:view(false),error:null};
    case "billing_paypal_webhook_retry":
      if(state.state!=="processing"||state.leaseToken!==args.p_lease_token)return {data:null,error:{code:"PT409"}};
      state.state="retry";state.lastErrorCode=args.p_error_code;state.failureCount++;state.leaseToken=null;state.lockedUntil=null;return {data:view(false),error:null};
    case "billing_paypal_webhook_quarantine":
      state.state="quarantined";state.lastErrorCode=args.p_error_code;state.outcomeCode="quarantined";state.leaseToken=null;state.lockedUntil=null;return {data:view(false),error:null};
    case "billing_paypal_webhook_record_heartbeat": return heartbeatError?{data:null,error:{code:"fixture"}}:{data:true,error:null};
    default:throw new Error("Unexpected RPC "+name);
  }}};
  const processor={async verifyWebhook(){},async prepareWebhook(){return PLAN;},async prepareWebhookItem(identity,work,cursor){const result={eventId:identity.id,eventType:identity.event_type,cursor,action:"applied",resourceKind:work.resourceKind,resourceId:work.resourceId,paypalOrderId:"ORDER12345",captureId:work.captureId,providerStatus:work.providerStatus,amount:work.amount,currency:work.currency,receiptEventId:`paypal:webhook:${cursor}`,detail:work.detail};return{effect:"review",orderId:randomUUID(),reviewKind:"dispute",paypalOrderId:result.paypalOrderId,merchantId:null,receipt:{},evidence:{},outcome:result};},...processorOverrides};
  const inbox=createPayPalWebhookInbox({environment:"test",database,processor,maxStages:3,randomUUID:()=>LEASES[leaseIndex++],now});
  return {inbox,state,calls,outcomes,setPlanned(value){Object.assign(state,{state:"planned",eventId:EVENT.id,eventType:EVENT.event_type,plan:structuredClone(PLAN),totalItems:2,leaseToken:null,lockedUntil:null,...value});payload=false;}};
}

await check("new delivery verifies, freezes a plan, purges raw use, and applies only one item",async()=>{
  const seen={verify:0,prepare:0,effects:[]},f=fixture({processor:{
    async verifyWebhook(event,headers,raw){seen.verify++;assert.deepEqual(event,EVENT);assert.deepEqual(headers,SIGNED);assert.equal(raw,RAW);},
    async prepareWebhook(event){seen.prepare++;assert.deepEqual(event,EVENT);return PLAN;},
    async prepareWebhookItem(identity,work,cursor){seen.effects.push({identity,work,cursor});const result={eventId:identity.id,eventType:identity.event_type,cursor,action:"applied",resourceKind:work.resourceKind,resourceId:work.resourceId,paypalOrderId:"ORDER12345",captureId:work.captureId,providerStatus:work.providerStatus,amount:work.amount,currency:work.currency,receiptEventId:`paypal:webhook:${cursor}`,detail:work.detail};return{effect:"review",orderId:randomUUID(),reviewKind:"dispute",paypalOrderId:result.paypalOrderId,merchantId:null,receipt:{},evidence:{},outcome:result};}
  }});
  const queued=await f.inbox.enqueue(RAW,SIGNED),first=await f.inbox.advance(queued.deliveryId);
  assert.equal(first.state,"planned");assert.equal(first.cursor,1);assert.equal(seen.verify,1);assert.equal(seen.prepare,1);assert.equal(seen.effects.length,1);
  assert.deepEqual(seen.effects[0].identity,{id:EVENT.id,event_type:EVENT.event_type,resource:{}});
  assert.equal(f.calls.filter(v=>v.name==="billing_paypal_webhook_apply_item").length,1);
  const second=await f.inbox.advance(queued.deliveryId);assert.equal(second.state,"completed");assert.equal(second.cursor,2);assert.equal(seen.effects.length,2);
});

await check("consecutive-failure backoff is independent of normal multi-item claim count",async()=>{
  const f=fixture({processor:{async prepareWebhookItem(){throw new BillingError(503,"provider_timeout","retry");}}});
  f.setPlanned({attemptCount:22,failureCount:0});await f.inbox.advance(DELIVERY);
  assert.equal(f.calls.filter(v=>v.name==="billing_paypal_webhook_retry").at(-1).args.p_delay_seconds,5);assert.equal(f.state.failureCount,1);
  f.setPlanned({attemptCount:23,failureCount:1});await f.inbox.advance(DELIVERY);
  assert.equal(f.calls.filter(v=>v.name==="billing_paypal_webhook_retry").at(-1).args.p_delay_seconds,10);
  f.setPlanned({attemptCount:500,failureCount:13});await f.inbox.advance(DELIVERY);
  assert.equal(f.calls.filter(v=>v.name==="billing_paypal_webhook_retry").at(-1).args.p_delay_seconds,21600);
});

await check("invalid signature is durably quarantined before any plan or effect",async()=>{
  let planned=0,effects=0;const f=fixture({processor:{async verifyWebhook(){throw new BillingError(400,"invalid_webhook_signature","invalid");},async prepareWebhook(){planned++;return PLAN;},async prepareWebhookItem(){effects++;}}});
  const result=await f.inbox.advance(DELIVERY);assert.equal(result.state,"quarantined");assert.equal(result.lastErrorCode,"invalid_webhook_signature");assert.equal(planned,0);assert.equal(effects,0);
});

await check("response loss after atomic apply cannot prepare or commit a second effect",async()=>{
  let prepared=0;const f=fixture({loseApplyResponse:true,processor:{async prepareWebhookItem(identity,work,cursor){prepared++;const result={eventId:identity.id,eventType:identity.event_type,cursor,action:"applied",resourceKind:work.resourceKind,resourceId:work.resourceId,paypalOrderId:"ORDER12345",captureId:work.captureId,providerStatus:work.providerStatus,amount:work.amount,currency:work.currency,receiptEventId:"paypal:capture:"+work.captureId,detail:work.detail};return{effect:"capture",orderId:randomUUID(),reviewKind:null,paypalOrderId:result.paypalOrderId,merchantId:null,receipt:{},evidence:null,outcome:result};}}});
  f.setPlanned({plan:[structuredClone(PLAN[0])],totalItems:1});await assert.rejects(()=>f.inbox.advance(DELIVERY));assert.equal(f.state.state,"completed");assert.equal(f.outcomes.length,1);
  const recovered=await f.inbox.advance(DELIVERY);assert.equal(recovered.state,"completed");assert.equal(prepared,1);assert.equal(f.outcomes.length,1);
});

await check("bounded sweep retries a pending approval and applies it after provider completion",async()=>{
  let pending=true;const f=fixture({processor:{async prepareWebhookItem(identity,work,cursor){if(pending)throw new BillingError(503,"approval_capture_pending","retry");const result={eventId:identity.id,eventType:identity.event_type,cursor,action:"applied",resourceKind:work.resourceKind,resourceId:work.resourceId,paypalOrderId:"ORDER12345",captureId:work.captureId,providerStatus:work.providerStatus,amount:work.amount,currency:work.currency,receiptEventId:"paypal:capture:"+work.captureId,detail:work.detail};return{effect:"capture",orderId:randomUUID(),reviewKind:null,paypalOrderId:result.paypalOrderId,merchantId:null,receipt:{},evidence:null,outcome:result};}}});
  f.setPlanned({plan:[structuredClone(PLAN[0])],totalItems:1});const first=await f.inbox.sweep({maxItems:1});assert.equal(first.applied,0);assert.equal(f.state.state,"retry");
  pending=false;f.state.nextAttemptAt=new Date(0).toISOString();const second=await f.inbox.sweep({maxItems:1});assert.equal(second.applied,1);assert.equal(f.state.state,"completed");assert.equal(f.outcomes.length,1);
  assert.equal(f.calls.filter(value=>value.name==="billing_paypal_webhook_record_heartbeat").length,2);
});

await check("sweep stops starting new units after its five-second route safety window",async()=>{
  let clockCalls=0;const f=fixture({now:()=>clockCalls++===0?0:6000});f.setPlanned({plan:structuredClone(PLAN),totalItems:2});
  const result=await f.inbox.sweep({maxItems:8,deadlineMs:45000});assert.equal(result.claimed,1);assert.equal(result.applied,1);assert.equal(result.deadlineReached,true);
  assert.equal(f.calls.filter(value=>value.name==="billing_paypal_webhook_claim_due").length,1);assert.equal(f.state.cursor,1);
});

await check("only a fully successful bounded sweep records its scheduler heartbeat",async()=>{
  const idle=fixture();idle.state.state="completed";const result=await idle.inbox.sweep({maxItems:1});assert.equal(result.claimed,0);
  assert.equal(idle.calls.at(-1).name,"billing_paypal_webhook_record_heartbeat");
  const failed=fixture({heartbeatError:true});failed.state.state="completed";
  await assert.rejects(()=>failed.inbox.sweep({maxItems:1}),error=>error.code==="webhook_queue_unavailable");
});

console.log(`Durable PayPal webhook inbox: ${passed} checks passed.`);
