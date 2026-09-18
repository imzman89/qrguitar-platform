import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { installRepositorySchema } from "./security/postgres-fixture.mjs";

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../.."),db=new PGlite();let passed=0;
const ADMIN=randomUUID(),OWNER=randomUUID(),ENV="test",MERCHANT="MERCHANT12345",DETAIL={stage:null,reason:null,outcome:null,captureStatus:null};
const signed=n=>({"paypal-auth-algo":"SHA256withRSA","paypal-cert-url":"https://api-m.sandbox.paypal.com/cert.pem","paypal-transmission-id":"T"+n,"paypal-transmission-sig":"signature-"+n,"paypal-transmission-time":"2026-09-18T00:00:00Z"});
const raw=(id,type="CATALOG.EVENT.IGNORED")=>JSON.stringify({id,event_type:type,resource:{id:"RESOURCE123"}});
const hash=value=>createHash("sha256").update(value).digest("hex"),receiptId=(event,cursor)=>`paypal:webhook:${hash(`${event}:${cursor}`)}`;
const ignorePlan=id=>({action:"ignore",resourceKind:"event",resourceId:id,captureId:null,refundId:null,disputeId:null,caseId:null,providerStatus:"IGNORED",amount:null,currency:null,detail:DETAIL});
const capturePlan=(id,status="PENDING")=>({action:"capture",resourceKind:"capture",resourceId:id,captureId:id,refundId:null,disputeId:null,caseId:null,providerStatus:status,amount:1200,currency:"USD",detail:{...DETAIL,captureStatus:status}});
const disputePlan=(captureId,disputeId="PP-D-123")=>({action:"dispute",resourceKind:"dispute",resourceId:disputeId,captureId,refundId:null,disputeId,caseId:disputeId,providerStatus:"OPEN",amount:1200,currency:"USD",detail:{...DETAIL,stage:"INQUIRY"}});
const outcome=(event,type,cursor,item,receiptEventId=null)=>({eventId:event,eventType:type,cursor,action:item.action==="ignore"?"ignored":"applied",resourceKind:item.resourceKind,resourceId:item.resourceId,paypalOrderId:item.action==="ignore"?null:"ORDER12345",captureId:item.captureId,providerStatus:item.providerStatus,amount:item.amount,currency:item.currency,receiptEventId,detail:item.detail});
const noEffect=result=>({effect:"none",orderId:null,reviewKind:null,paypalOrderId:result.paypalOrderId,merchantId:null,receipt:null,evidence:null,outcome:result});
const captureReceipt=(orderId,paypalOrderId,captureId,status)=>({paypalOrderId,captureId,merchantId:MERCHANT,referenceId:orderId,customId:orderId,invoiceId:`QRG-${orderId}`,amount:1200,currency:"USD",status});
const command=(effect,orderId,result,receipt=null,extra={})=>({effect,orderId,reviewKind:null,paypalOrderId:result.paypalOrderId,merchantId:null,receipt,evidence:null,outcome:result,...extra});
async function rpc(name,args,role="service_role"){await db.exec(`savepoint webhook_rpc;set local role ${role}`);try{const value=(await db.query(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(",")}) value`,args)).rows[0].value;await db.exec("reset role;release savepoint webhook_rpc");return value;}catch(error){await db.exec("rollback to savepoint webhook_rpc;release savepoint webhook_rpc");throw error;}}
const reject=(run,code)=>assert.rejects(run,error=>error.code===code,`Expected SQLSTATE ${code}`);
async function check(name,run){await db.exec("begin");try{await run();passed++;console.log("PASS "+name);}finally{await db.exec("rollback");}}
const enqueue=(event,signature)=>rpc("billing_paypal_webhook_enqueue",[ENV,event,signature]);
const claim=(id,lease=randomUUID())=>rpc("billing_paypal_webhook_claim",[ENV,id,lease]);
async function boundOrder(paypalOrderId) {
  const order=await rpc("billing_paypal_reserve_order",[OWNER,ENV,randomUUID(),"profile_1",MERCHANT]);
  await rpc("billing_paypal_bind_order",[OWNER,ENV,order.orderId,paypalOrderId,MERCHANT]);return order;
}
async function plannedDelivery(event,type,item,signatureNumber,claimFinal=true) {
  const body=raw(event,type),queued=await enqueue(body,signed(signatureNumber));let lease=randomUUID();await claim(queued.deliveryId,lease);
  await rpc("billing_paypal_webhook_mark_verified",[ENV,queued.deliveryId,lease,event,type,hash(body)]);lease=randomUUID();await claim(queued.deliveryId,lease);
  await rpc("billing_paypal_webhook_save_plan",[ENV,queued.deliveryId,lease,[item]]);lease=randomUUID();if(claimFinal)await claim(queued.deliveryId,lease);
  return {deliveryId:queued.deliveryId,lease};
}

try{
  await installRepositorySchema(db,repo);await db.exec("update billing_instance_config set create_environment='test' where singleton");
  await db.query("insert into auth.users(id) values($1),($2)",[ADMIN,OWNER]);await db.query("insert into profiles(id,role) values($1,'admin'),($2,'owner')",[ADMIN,OWNER]);

  await check("first enqueue, exact transport duplicate, and distinct transmission are unambiguous",async()=>{
    const body=raw("WHQUEUE123"),first=await enqueue(body,signed(1)),duplicate=await enqueue(body,signed(1)),other=await enqueue(body,signed(2));
    assert.equal(first.duplicate,false);assert.equal(duplicate.duplicate,true);assert.equal(duplicate.deliveryId,first.deliveryId);assert.notEqual(other.deliveryId,first.deliveryId);
    assert.equal((await db.query("select count(*)::int n from billing_paypal_webhook_payloads")).rows[0].n,2);
  });

  await check("verified identity canonicalizes exact retries and quarantines collisions without leaking raw",async()=>{
    const event="WHCANONICAL123",body=raw(event),a=await enqueue(body,signed(3)),b=await enqueue(body,signed(4));
    let lease=randomUUID();await claim(a.deliveryId,lease);await rpc("billing_paypal_webhook_mark_verified",[ENV,a.deliveryId,lease,event,"CATALOG.EVENT.IGNORED",hash(body)]);
    lease=randomUUID();await claim(b.deliveryId,lease);const canonical=await rpc("billing_paypal_webhook_mark_verified",[ENV,b.deliveryId,lease,event,"CATALOG.EVENT.IGNORED",hash(body)]);
    assert.equal(canonical.deliveryId,a.deliveryId);const duplicate=(await db.query("select state,canonical_delivery_id,raw_purged_at from billing_paypal_webhook_deliveries where id=$1",[b.deliveryId])).rows[0];
    assert.equal(duplicate.state,"completed");assert.equal(duplicate.canonical_delivery_id,a.deliveryId);assert.ok(duplicate.raw_purged_at);
    const conflict=await enqueue(raw(event,"CATALOG.EVENT.CHANGED"),signed(5));lease=randomUUID();await claim(conflict.deliveryId,lease);
    const quarantined=await rpc("billing_paypal_webhook_mark_verified",[ENV,conflict.deliveryId,lease,event,"CATALOG.EVENT.CHANGED",hash("changed")]);
    assert.equal(quarantined.state,"quarantined");assert.equal(quarantined.lastErrorCode,"verified_event_conflict");
    assert.equal((await db.query("select count(*)::int n from billing_paypal_webhook_payloads where delivery_id in ($1,$2)",[b.deliveryId,conflict.deliveryId])).rows[0].n,0);
  });

  await check("a duplicate verified delivery cannot observe or use the canonical processor lease",async()=>{
    const event="WHLEASECANON123",body=raw(event),canonical=await enqueue(body,signed(70)),duplicate=await enqueue(body,signed(71));
    let lease=randomUUID();await claim(canonical.deliveryId,lease);await rpc("billing_paypal_webhook_mark_verified",[ENV,canonical.deliveryId,lease,event,"CATALOG.EVENT.IGNORED",hash(body)]);
    const canonicalLease=randomUUID();await claim(canonical.deliveryId,canonicalLease);const duplicateLease=randomUUID();await claim(duplicate.deliveryId,duplicateLease);
    const result=await rpc("billing_paypal_webhook_mark_verified",[ENV,duplicate.deliveryId,duplicateLease,event,"CATALOG.EVENT.IGNORED",hash(body)]);
    assert.equal(result.deliveryId,canonical.deliveryId);assert.equal(result.state,"processing");assert.equal(result.leaseToken,null);assert.equal(result.lockedUntil,null);
    const stored=(await db.query("select state,lease_token from billing_paypal_webhook_deliveries where id=$1",[canonical.deliveryId])).rows[0];
    assert.equal(stored.state,"processing");assert.equal(stored.lease_token,canonicalLease);
    await reject(()=>rpc("billing_paypal_webhook_quarantine",[ENV,canonical.deliveryId,duplicateLease,"invalid_webhook"]),"PT409");
    const busy=await claim(duplicate.deliveryId,randomUUID());assert.equal(busy.busy,true);assert.equal(busy.leaseToken,null);
  });

  await check("saved plan purges raw immediately and final completion retains only immutable outcome evidence",async()=>{
    const event="WHCOMPLETE123",type="CATALOG.EVENT.IGNORED",queued=await enqueue(raw(event,type),signed(6));let lease=randomUUID();await claim(queued.deliveryId,lease);
    await rpc("billing_paypal_webhook_mark_verified",[ENV,queued.deliveryId,lease,event,type,hash(raw(event,type))]);lease=randomUUID();await claim(queued.deliveryId,lease);
    const item=ignorePlan(null),planned=await rpc("billing_paypal_webhook_save_plan",[ENV,queued.deliveryId,lease,[item]]);assert.equal(planned.state,"planned");
    assert.equal((await db.query("select count(*)::int n from billing_paypal_webhook_payloads where delivery_id=$1",[queued.deliveryId])).rows[0].n,0);
    lease=randomUUID();const processing=await claim(queued.deliveryId,lease);assert.ok(new Date(processing.lockedUntil)-Date.now()>110000);
    await reject(()=>rpc("billing_paypal_webhook_apply_item",[ENV,queued.deliveryId,lease,0,noEffect({...outcome(event,type,0,item),resourceKind:"capture"})]),"22023");
    const done=await rpc("billing_paypal_webhook_apply_item",[ENV,queued.deliveryId,lease,0,noEffect(outcome(event,type,0,item))]);
    assert.equal(done.state,"completed");assert.equal(done.plan,null);assert.equal(done.totalItems,null);assert.equal(done.cursor,1);
    assert.equal((await db.query("select count(*)::int n from billing_paypal_webhook_outcomes where delivery_id=$1",[queued.deliveryId])).rows[0].n,1);
  });

  await check("terminal capture cannot no-op, mismatched commands apply nothing, and response-loss replay returns the first capture",async()=>{
    const paypalOrderId="ORDER12345",captureId="CAPTURE12345",event="WHCAPTURE123",type="PAYMENT.CAPTURE.COMPLETED";
    const order=await boundOrder(paypalOrderId),item=capturePlan(captureId,"COMPLETED"),planned=await plannedDelivery(event,type,item,20);
    const result=outcome(event,type,0,item,`paypal:capture:${captureId}`);result.paypalOrderId=paypalOrderId;
    await reject(()=>rpc("billing_paypal_webhook_apply_item",[ENV,planned.deliveryId,planned.lease,0,noEffect({...result,receiptEventId:null})]),"22023");
    const badReceipt=captureReceipt(order.orderId,paypalOrderId,"CAPTURE99999","COMPLETED");
    await reject(()=>rpc("billing_paypal_webhook_apply_item",[ENV,planned.deliveryId,planned.lease,0,command("capture",order.orderId,result,badReceipt)]),"22023");
    assert.equal((await db.query("select count(*)::int n from billing_paypal_webhook_outcomes where delivery_id=$1",[planned.deliveryId])).rows[0].n,0);
    assert.equal((await db.query("select count(*)::int n from billing_credit_grants where order_id=$1",[order.orderId])).rows[0].n,0);
    const receipt=captureReceipt(order.orderId,paypalOrderId,captureId,"COMPLETED"),first=await rpc("billing_paypal_webhook_apply_item",[ENV,planned.deliveryId,planned.lease,0,command("capture",order.orderId,result,receipt)]);
    assert.equal(first.state,"completed");assert.equal(first.itemApplied,true);
    const changedReceipt=captureReceipt(order.orderId,paypalOrderId,captureId,"FAILED"),changed={...result,receiptEventId:`paypal:failed:${captureId}:FAILED`};
    const replay=await rpc("billing_paypal_webhook_apply_item",[ENV,planned.deliveryId,randomUUID(),0,command("failure",order.orderId,changed,changedReceipt)]);
    assert.equal(replay.itemApplied,false);assert.equal(replay.outcome.receiptEventId,`paypal:capture:${captureId}`);
    assert.equal((await db.query("select count(*)::int n from billing_paypal_webhook_outcomes where delivery_id=$1",[planned.deliveryId])).rows[0].n,1);
    assert.equal((await db.query("select count(*)::int n from billing_receipts where order_id=$1",[order.orderId])).rows[0].n,1);
    assert.equal((await db.query("select count(*)::int n from billing_credit_grants where order_id=$1",[order.orderId])).rows[0].n,1);
    assert.equal((await db.query("select count(*)::int n from billing_credit_holds where owner_id=$1",[OWNER])).rows[0].n,0);
  });

  await check("response-loss replay cannot replace the first failed-capture effect with a later completion",async()=>{
    const paypalOrderId="ORDER67890",captureId="CAPTURE67890",event="WHFAILURE123",type="PAYMENT.CAPTURE.DENIED";
    const order=await boundOrder(paypalOrderId),item=capturePlan(captureId,"DENIED"),planned=await plannedDelivery(event,type,item,21);
    const result=outcome(event,type,0,item,`paypal:failed:${captureId}:DENIED`);result.paypalOrderId=paypalOrderId;
    const denied=captureReceipt(order.orderId,paypalOrderId,captureId,"DENIED");await rpc("billing_paypal_webhook_apply_item",[ENV,planned.deliveryId,planned.lease,0,command("failure",order.orderId,result,denied)]);
    const completed=captureReceipt(order.orderId,paypalOrderId,captureId,"COMPLETED"),changed={...result,receiptEventId:`paypal:capture:${captureId}`};
    const replay=await rpc("billing_paypal_webhook_apply_item",[ENV,planned.deliveryId,randomUUID(),0,command("capture",order.orderId,changed,completed)]);
    assert.equal(replay.itemApplied,false);assert.equal(replay.outcome.receiptEventId,`paypal:failed:${captureId}:DENIED`);
    assert.equal((await db.query("select count(*)::int n from billing_credit_grants where order_id=$1",[order.orderId])).rows[0].n,0);
    assert.equal((await db.query("select count(*)::int n from billing_receipts where order_id=$1",[order.orderId])).rows[0].n,1);
  });

  await check("review evidence must exactly match the frozen item before a hold or receipt is written",async()=>{
    const paypalOrderId="ORDER54321",captureId="CAPTURE54321",event="WHDISPUTE123",type="CUSTOMER.DISPUTE.CREATED";
    const order=await boundOrder(paypalOrderId),item=disputePlan(captureId),planned=await plannedDelivery(event,type,item,22);
    const rid=receiptId(event,0),result=outcome(event,type,0,item,rid);result.paypalOrderId=paypalOrderId;
    const receipt=captureReceipt(order.orderId,paypalOrderId,captureId,"COMPLETED"),evidence={version:1,paypalEventId:event,eventType:type,cursor:0,
      resourceKind:item.resourceKind,resourceId:item.resourceId,refundId:item.refundId,disputeId:item.disputeId,caseId:item.caseId,
      paypalOrderId,captureId,providerStatus:item.providerStatus,amount:item.amount,currency:item.currency,detail:item.detail};
    const bad={...evidence,caseId:"PP-D-DIFFERENT"};
    await reject(()=>rpc("billing_paypal_webhook_apply_item",[ENV,planned.deliveryId,planned.lease,0,command("review",order.orderId,result,receipt,{reviewKind:"dispute",evidence:bad})]),"22023");
    assert.equal((await db.query("select count(*)::int n from billing_credit_holds where owner_id=$1",[OWNER])).rows[0].n,0);
    const applied=await rpc("billing_paypal_webhook_apply_item",[ENV,planned.deliveryId,planned.lease,0,command("review",order.orderId,result,receipt,{reviewKind:"dispute",evidence})]);
    assert.equal(applied.outcome.receiptEventId,rid);assert.equal((await db.query("select count(*)::int n from billing_credit_holds where event_id=$1",[rid])).rows[0].n,1);
  });

  await check("partial multi-item quarantine preserves its frozen order and admin action replay advances at most once",async()=>{
    const event="WHMULTI123",type="CUSTOMER.DISPUTE.CREATED",queued=await enqueue(raw(event,type),signed(7));let lease=randomUUID();await claim(queued.deliveryId,lease);
    await rpc("billing_paypal_webhook_mark_verified",[ENV,queued.deliveryId,lease,event,type,hash(raw(event,type))]);const plan=[ignorePlan("TXN-A"),ignorePlan("TXN-B")];
    lease=randomUUID();await claim(queued.deliveryId,lease);await rpc("billing_paypal_webhook_save_plan",[ENV,queued.deliveryId,lease,plan]);
    lease=randomUUID();await claim(queued.deliveryId,lease);let row=await rpc("billing_paypal_webhook_apply_item",[ENV,queued.deliveryId,lease,0,noEffect(outcome(event,type,0,plan[0]))]);assert.equal(row.cursor,1);
    lease=randomUUID();await claim(queued.deliveryId,lease);row=await rpc("billing_paypal_webhook_quarantine",[ENV,queued.deliveryId,lease,"provider_rejected"]);assert.equal(row.state,"quarantined");assert.equal(row.plan.length,2);
    const action=randomUUID(),args=[ADMIN,ENV,queued.deliveryId,action,"Continue the frozen second dispute transaction."];
    const first=await rpc("billing_paypal_webhook_admin_retry",args),replay=await rpc("billing_paypal_webhook_admin_retry",args);assert.equal(first.advanceAllowed,true);assert.equal(replay.advanceAllowed,false);assert.equal(replay.cursor,1);
    lease=randomUUID();await claim(queued.deliveryId,lease);row=await rpc("billing_paypal_webhook_apply_item",[ENV,queued.deliveryId,lease,1,noEffect(outcome(event,type,1,plan[1]))]);assert.equal(row.state,"completed");assert.equal(row.plan,null);
  });

  await check("expired leases fence retry and quarantine mutations",async()=>{
    const queued=await enqueue(raw("WHLEASE123"),signed(8)),lease=randomUUID();await claim(queued.deliveryId,lease);
    await db.query("update billing_paypal_webhook_deliveries set locked_until=clock_timestamp()-interval '1 second' where id=$1",[queued.deliveryId]);
    await reject(()=>rpc("billing_paypal_webhook_retry",[ENV,queued.deliveryId,lease,"provider_timeout",5]),"PT409");
    await reject(()=>rpc("billing_paypal_webhook_quarantine",[ENV,queued.deliveryId,lease,"invalid_webhook"]),"PT409");
  });

  await check("audited stale invalid delivery survives cleanup, cannot retry, and can be acknowledged",async()=>{
    const queued=await enqueue(raw("WHSTALE123"),signed(9));let lease=randomUUID();await claim(queued.deliveryId,lease);await rpc("billing_paypal_webhook_quarantine",[ENV,queued.deliveryId,lease,"invalid_webhook"]);
    await reject(()=>rpc("billing_paypal_webhook_admin_retry",[ADMIN,ENV,queued.deliveryId,randomUUID(),"The invalid envelope has no recoverable provider payload."]),"PT409");
    await db.query("insert into billing_paypal_webhook_admin_actions(id,environment,delivery_id,operator_id,action,reason) values($1,$2,$3,$4,'retry',$5)",
      [randomUUID(),ENV,queued.deliveryId,ADMIN,"Historical audited retry retained for cleanup regression coverage."]);
    await db.query("update billing_paypal_webhook_deliveries set received_at=clock_timestamp()-interval '9 days',completed_at=clock_timestamp()-interval '8 days' where id=$1",[queued.deliveryId]);
    await rpc("billing_paypal_webhook_admin_list",[ADMIN,ENV]);assert.equal((await db.query("select count(*)::int n from billing_paypal_webhook_deliveries where id=$1",[queued.deliveryId])).rows[0].n,1);
    assert.equal((await db.query("select count(*)::int n from billing_paypal_webhook_payloads where delivery_id=$1",[queued.deliveryId])).rows[0].n,0);
    await reject(()=>rpc("billing_paypal_webhook_admin_retry",[ADMIN,ENV,queued.deliveryId,randomUUID(),"Payload expired; retry must remain impossible."]),"PT409");
    const acknowledged=await rpc("billing_paypal_webhook_admin_acknowledge",[ADMIN,ENV,queued.deliveryId,randomUUID(),"Reviewed the provider and ledger after payload expiry."]);assert.ok(acknowledged.acknowledgedAt);
    assert.ok(!(await rpc("billing_paypal_webhook_admin_list",[ADMIN,ENV])).some(value=>value.deliveryId===queued.deliveryId));
  });

  await check("due claims use independent leases, skip locked work, and stop when no delivery is available",async()=>{
    const first=await enqueue(raw("WHDUEFIRST1"),signed(30)),second=await enqueue(raw("WHDUESECOND"),signed(31));
    const a=await rpc("billing_paypal_webhook_claim_due",[ENV,randomUUID()]),b=await rpc("billing_paypal_webhook_claim_due",[ENV,randomUUID()]);
    assert.equal(a.state,"processing");assert.equal(b.state,"processing");assert.notEqual(a.deliveryId,b.deliveryId);
    assert.deepEqual(new Set([a.deliveryId,b.deliveryId]),new Set([first.deliveryId,second.deliveryId]));assert.equal(await rpc("billing_paypal_webhook_claim_due",[ENV,randomUUID()]),null);
  });

  await check("due sweep prioritizes verified frozen work ahead of an older unverified intake flood",async()=>{
    for(let i=0;i<12;i++)await enqueue(raw(`WHFLOOD${String(i).padStart(4,"0")}`),signed(40+i));
    const planned=await plannedDelivery("WHPRIORITY12","CATALOG.EVENT.IGNORED",ignorePlan("priority"),60,false);
    const due=await rpc("billing_paypal_webhook_claim_due",[ENV,randomUUID()]);assert.equal(due.deliveryId,planned.deliveryId);assert.equal(due.state,"processing");
  });

  await check("a frozen 20-item plan remains recoverable for 30 days without a claim-count cutoff",async()=>{
    const event="WHLONGPLAN123",type="CATALOG.EVENT.IGNORED",body=raw(event,type),queued=await enqueue(body,signed(70));let lease=randomUUID();await claim(queued.deliveryId,lease);
    await rpc("billing_paypal_webhook_mark_verified",[ENV,queued.deliveryId,lease,event,type,hash(body)]);const plan=Array.from({length:20},(_,i)=>ignorePlan(`work-${i}`));
    lease=randomUUID();await claim(queued.deliveryId,lease);await rpc("billing_paypal_webhook_save_plan",[ENV,queued.deliveryId,lease,plan]);
    await db.query("update billing_paypal_webhook_deliveries set received_at=clock_timestamp()-interval '29 days' where id=$1",[queued.deliveryId]);
    let row;for(let cursor=0;cursor<20;cursor++){row=await rpc("billing_paypal_webhook_claim_due",[ENV,randomUUID()]);assert.equal(row.deliveryId,queued.deliveryId);
      row=await rpc("billing_paypal_webhook_apply_item",[ENV,queued.deliveryId,row.leaseToken,cursor,noEffect(outcome(event,type,cursor,plan[cursor]))]);}
    assert.equal(row.state,"completed");assert.equal(row.cursor,20);assert.equal(row.attemptCount,22);
  });

  await check("checkout readiness requires an observed scheduler heartbeat from the last fifteen minutes",async()=>{
    assert.equal(await rpc("billing_paypal_webhook_scheduler_ready",[ENV]),false);
    assert.equal(await rpc("billing_paypal_webhook_record_heartbeat",[ENV]),true);
    assert.equal(await rpc("billing_paypal_webhook_scheduler_ready",[ENV]),true);
    await db.query("update billing_paypal_webhook_heartbeats set last_success_at=clock_timestamp()-interval '16 minutes' where environment=$1",[ENV]);
    assert.equal(await rpc("billing_paypal_webhook_scheduler_ready",[ENV]),false);
    assert.equal((await db.query("select count(*)::int n from billing_paypal_webhook_heartbeats")).rows[0].n,1);
  });

  await check("bounded unverified quota accepts exact retry and immediately releases permanently invalid raw storage",async()=>{
    await db.exec("delete from billing_paypal_webhook_payloads;delete from billing_paypal_webhook_deliveries");const body=raw("WHQUOTA123"),first=await enqueue(body,signed(10));
    await db.exec("insert into billing_paypal_webhook_deliveries(environment,delivery_hash,body_hash) select 'test',encode(sha256(convert_to('quota-'||i::text,'UTF8')),'hex'),encode(sha256(convert_to('body-'||i::text,'UTF8')),'hex') from generate_series(1,999) i");
    assert.equal((await enqueue(body,signed(10))).deliveryId,first.deliveryId);
    await reject(()=>enqueue(raw("WHQUOTA999"),signed(11)),"PT429");
    const lease=randomUUID();await claim(first.deliveryId,lease);const invalid=await rpc("billing_paypal_webhook_quarantine",[ENV,first.deliveryId,lease,"invalid_webhook_signature"]);
    assert.equal(invalid.state,"quarantined");assert.equal((await db.query("select count(*)::int n from billing_paypal_webhook_payloads where delivery_id=$1",[first.deliveryId])).rows[0].n,0);
    assert.ok((await db.query("select raw_purged_at from billing_paypal_webhook_deliveries where id=$1",[first.deliveryId])).rows[0].raw_purged_at);
    assert.ok((await enqueue(raw("WHQUOTA999"),signed(11))).deliveryId);
  });

  for(const table of ["billing_paypal_webhook_deliveries","billing_paypal_webhook_payloads","billing_paypal_webhook_outcomes","billing_paypal_webhook_admin_actions","billing_paypal_webhook_heartbeats"])
    await check(`${table} has no browser or direct service table access`,async()=>{for(const role of ["anon","authenticated","service_role"])assert.equal((await db.query("select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') v",[role,table])).rows[0].v,false);});
}finally{await db.close();}

console.log(`Durable PayPal webhook ledger: ${passed} checks passed.`);
