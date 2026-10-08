import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { installRepositorySchema } from "./security/postgres-fixture.mjs";

const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.resolve(here, "../../.."), require = createRequire(path.join(repo, "package.json")), { PGlite } = require("@electric-sql/pglite-pg17");
const db = new PGlite(); let passed = 0;
async function check(name, run) { await run(); passed++; console.log("PASS " + name); }
async function rpc(name, args, role = "service_role") {
  const entries = Object.entries(args); await db.exec(`begin; set local role ${role}`);
  try { const value = (await db.query(`select public.${name}(${entries.map(([key], index) => `${key}=>$${index + 1}`).join(",")}) value`, entries.map(([, value]) => value))).rows[0].value; await db.exec("commit"); return value; }
  catch (error) { await db.exec("rollback"); throw error; }
}
const OWNER = randomUUID(), ADMIN = randomUUID(), OTHER = randomUUID(), ORDER = randomUUID(), DELIVERY = randomUUID(), PENDING_DELIVERY = randomUUID(), EXPIRED_DELIVERY = randomUUID();
const EVENT = "paypal:review:WHADMIN123:0", PAYPAL_ORDER = "ORDER12345", CAPTURE = "CAPTURE12345";

try {
  await installRepositorySchema(db, repo); await db.exec("update billing_instance_config set create_environment='test' where singleton");
  for (const [id, role] of [[OWNER, "owner"], [ADMIN, "admin"], [OTHER, "owner"]]) {
    await db.query("insert into auth.users(id) values($1)", [id]); await db.query("insert into profiles(id,role) values($1,$2)", [id, role]);
  }
  const offer = { key: "profile_10", version: 1, currency: "usd", amount: 5000, credits: 10 };
  await db.query("insert into billing_orders(id,owner_id,environment,request_key,offer,status,session_id,payment_id) values($1,$2,'test',$3,$4::jsonb,'fulfilled',$5,$6)", [ORDER, OWNER, randomUUID(), JSON.stringify(offer), `paypal_order:${PAYPAL_ORDER}`, `paypal_capture:${CAPTURE}`]);
  await db.query("insert into billing_paypal_orders(order_id,owner_id,environment,merchant_id) values($1,$2,'test','MERCHANT12345')", [ORDER, OWNER]);
  await db.query("insert into billing_paypal_bindings(order_id,environment,paypal_order_id) values($1,'test',$2)", [ORDER, PAYPAL_ORDER]);
  const receipt = { eventId: EVENT, source: "paypal_api", kind: "refund", paypalOrderId: PAYPAL_ORDER, captureId: CAPTURE, status: "COMPLETED", amount: 5000, currency: "USD", payerEmail: "private@example.test", rawProviderDetail: { secret: true } };
  await db.query("insert into billing_receipts(environment,event_id,owner_id,order_id,kind,receipt) values('test',$1,$2,$3,'refund',$4::jsonb)", [EVENT, OWNER, ORDER, JSON.stringify(receipt)]);
  await db.query("insert into billing_credit_holds(environment,event_id,owner_id,reason) values('test',$1,$2,'refund')", [EVENT, OWNER]);
  await db.query("insert into billing_paypal_webhook_deliveries(id,environment,delivery_hash,body_hash,state,verified_event_id,event_type,event_hash,cursor,attempt_count,next_attempt_at,outcome_code,received_at,verified_at,completed_at,updated_at) values($1,'test',$2,$3,'completed','WHADMIN123','PAYMENT.CAPTURE.REFUNDED',$4,1,1,clock_timestamp(),'processed',clock_timestamp(),clock_timestamp(),clock_timestamp(),clock_timestamp())", [DELIVERY, "a".repeat(64), "b".repeat(64), "c".repeat(64)]);
  await db.query("insert into billing_paypal_webhook_outcomes(environment,event_id,event_cursor,delivery_id,event_type,action,resource_kind,resource_id,paypal_order_id,capture_id,provider_status,amount,currency,receipt_event_id,detail) values('test','WHADMIN123',0,$1,'PAYMENT.CAPTURE.REFUNDED','applied','refund','REFUND12345',$2,$3,'COMPLETED',5000,'USD',$4,$5::jsonb)", [DELIVERY, PAYPAL_ORDER, CAPTURE, EVENT, JSON.stringify({ refundId: "REFUND12345", bounded: true })]);

  await db.query("insert into billing_paypal_webhook_deliveries(id,environment,delivery_hash,body_hash,state,verified_event_id,event_type,event_hash,plan,cursor,total_items,attempt_count,next_attempt_at,received_at,verified_at,raw_purged_at,updated_at) values($1,'test',$2,$3,'planned','WHPENDING1','CUSTOMER.DISPUTE.CREATED',$4,$5::jsonb,0,2,1,clock_timestamp(),clock_timestamp(),clock_timestamp(),clock_timestamp(),clock_timestamp())", [PENDING_DELIVERY, "1".repeat(64), "2".repeat(64), "3".repeat(64), JSON.stringify([{ kind: "dispute" }, { kind: "dispute" }])]);
  await db.query("insert into billing_paypal_webhook_deliveries(id,environment,delivery_hash,body_hash,state,verified_event_id,event_type,event_hash,cursor,attempt_count,next_attempt_at,last_error_code,outcome_code,received_at,verified_at,completed_at,raw_purged_at,updated_at) values($1,'test',$2,$3,'quarantined','WHEXPIRED1','CUSTOMER.DISPUTE.CREATED',$4,0,32,clock_timestamp(),'retry_budget_exhausted','quarantined',clock_timestamp(),clock_timestamp(),clock_timestamp(),clock_timestamp(),clock_timestamp())", [EXPIRED_DELIVERY, "4".repeat(64), "5".repeat(64), "6".repeat(64)]);

  await check("webhook admin continuation is cursor-safe, idempotent, and actionable-first", async () => {
    const action = randomUUID(), args = { p_operator_id: ADMIN, p_environment: "test", p_delivery_id: PENDING_DELIVERY, p_action_id: action, p_reason: "Continue one reviewed item from the saved plan." };
    const first = await rpc("billing_paypal_webhook_admin_retry", args), replay = await rpc("billing_paypal_webhook_admin_retry", args);
    assert.equal(first.advanceAllowed, true); assert.equal(first.cursor, 0); assert.equal(replay.advanceAllowed, false); assert.equal(replay.cursor, 0);
    assert.ok(Number.isFinite(Date.parse(first.updatedAt))); assert.ok(Number.isFinite(Date.parse(replay.updatedAt)));
    const queue = await rpc("billing_paypal_webhook_admin_list", { p_operator_id: ADMIN, p_environment: "test" });
    assert.equal(queue[0].deliveryId, PENDING_DELIVERY); assert.equal(queue[0].rawAvailable, false); assert.equal(queue[0].continuationAvailable, true);
    assert.ok(queue.some(item => item.deliveryId === EXPIRED_DELIVERY && item.rawAvailable === false && item.continuationAvailable === false));
    assert.equal((await db.query("select count(*)::int n from billing_paypal_webhook_admin_actions where id=$1", [action])).rows[0].n, 1);
  });
  await check("irrecoverable quarantine acknowledgement hides only the delivery alert", async () => {
    const holds = (await db.query("select count(*)::int n from billing_credit_holds")).rows[0].n, action = randomUUID();
    const args = { p_operator_id: ADMIN, p_environment: "test", p_delivery_id: EXPIRED_DELIVERY, p_action_id: action, p_reason: "Checked the provider and ledger after payload expiry." };
    const first = await rpc("billing_paypal_webhook_admin_acknowledge", args), replay = await rpc("billing_paypal_webhook_admin_acknowledge", args);
    assert.ok(first.acknowledgedAt); assert.equal(replay.acknowledgedAt, first.acknowledgedAt);
    assert.ok(Number.isFinite(Date.parse(first.updatedAt))); assert.ok(Number.isFinite(Date.parse(replay.updatedAt)));
    assert.ok(!(await rpc("billing_paypal_webhook_admin_list", { p_operator_id: ADMIN, p_environment: "test" })).some(item => item.deliveryId === EXPIRED_DELIVERY));
    assert.equal((await db.query("select count(*)::int n from billing_credit_holds")).rows[0].n, holds);
  });

  await check("active admin sees allowlisted immutable provider evidence without raw receipt fields", async () => {
    const value = await rpc("billing_paypal_list_reviews", { p_operator_id: ADMIN, p_environment: "test", p_order_id: null });
    assert.equal(value.hasMore, false); assert.equal(value.reviews.length, 1); const item = value.reviews[0];
    assert.equal(item.eventId, EVENT); assert.equal(item.providerEventId, "WHADMIN123"); assert.equal(item.resourceId, "REFUND12345"); assert.equal(item.refundId, "REFUND12345");
    assert.equal(item.amount, 5000); assert.equal(item.currency, "USD"); assert.equal(item.expectedAmount, 5000); assert.equal(item.credits, 10);
    assert.doesNotMatch(JSON.stringify(value), /private@example|rawProviderDetail|secret|bounded/);
  });
  await check("browser and non-admin roles cannot read the PayPal hold queue", async () => {
    await assert.rejects(rpc("billing_paypal_list_reviews", { p_operator_id: ADMIN, p_environment: "test", p_order_id: null }, "authenticated"), error => error.code === "42501");
    await assert.rejects(rpc("billing_paypal_list_reviews", { p_operator_id: OWNER, p_environment: "test", p_order_id: null }), error => error.code === "42501");
  });
  const retain = randomUUID();
  await check("retain decision is audited, idempotent, and keeps the hold visible", async () => {
    const args = { p_operator_id: ADMIN, p_environment: "test", p_event_id: EVENT, p_order_id: ORDER, p_owner_id: OWNER, p_decision_id: retain, p_action: "retain_hold", p_reason: "Refund remains unsettled in PayPal." };
    const first = await rpc("billing_paypal_resolve_review", args), replay = await rpc("billing_paypal_resolve_review", args);
    assert.equal(first.hold, true); assert.deepEqual(replay, first);
    const queue = await rpc("billing_paypal_list_reviews", { p_operator_id: ADMIN, p_environment: "test", p_order_id: ORDER });
    assert.equal(queue.reviews[0].lastDecision.action, "retain_hold"); assert.equal(queue.reviews[0].lastDecision.reason, args.p_reason);
    await assert.rejects(rpc("billing_paypal_resolve_review", { ...args, p_action: "release" }), error => error.code === "PT409");
  });
  await check("cross-owner or cross-order input cannot resolve a hold", async () => {
    await assert.rejects(rpc("billing_paypal_resolve_review", { p_operator_id: ADMIN, p_environment: "test", p_event_id: EVENT, p_order_id: randomUUID(), p_owner_id: OWNER, p_decision_id: randomUUID(), p_action: "release", p_reason: "Invalid cross-order attempt for test." }), error => error.code === "P0002");
    await assert.rejects(rpc("billing_paypal_resolve_review", { p_operator_id: ADMIN, p_environment: "test", p_event_id: EVENT, p_order_id: ORDER, p_owner_id: OTHER, p_decision_id: randomUUID(), p_action: "release", p_reason: "Invalid cross-owner attempt for test." }), error => error.code === "P0002");
  });
  await check("release delegates to the audited resolver without creating money or credits", async () => {
    const before = (await db.query("select count(*)::int grants from billing_credit_grants")).rows[0].grants;
    const value = await rpc("billing_paypal_resolve_review", { p_operator_id: ADMIN, p_environment: "test", p_event_id: EVENT, p_order_id: ORDER, p_owner_id: OWNER, p_decision_id: randomUUID(), p_action: "release", p_reason: "PayPal confirms the refund case is closed." });
    assert.equal(value.hold, false); assert.equal((await rpc("billing_paypal_list_reviews", { p_operator_id: ADMIN, p_environment: "test", p_order_id: null })).reviews.length, 0);
    assert.equal((await db.query("select count(*)::int grants from billing_credit_grants")).rows[0].grants, before);
    assert.equal((await db.query("select payment_id,status from billing_orders where id=$1", [ORDER])).rows[0].payment_id, `paypal_capture:${CAPTURE}`);
  });
  await check("receipt evidence remains reviewable if outcome finalization was interrupted", async () => {
    const event = `paypal:webhook:${"d".repeat(64)}`, evidence = { version: 1, paypalEventId: "WHFALLBACK1", eventType: "CUSTOMER.DISPUTE.CREATED", cursor: 0,
      resourceKind: "dispute", resourceId: "CASE-FALLBACK", refundId: null, disputeId: "DISPUTE-FALLBACK", caseId: "CASE-FALLBACK",
      paypalOrderId: PAYPAL_ORDER, captureId: CAPTURE, providerStatus: "OPEN", amount: 5000, currency: "USD", detail: {} };
    const value = { eventId: event, source: "paypal_webhook", kind: "dispute", paypalOrderId: PAYPAL_ORDER, captureId: CAPTURE, status: "COMPLETED", amount: 5000, currency: "USD", providerEvidence: evidence };
    await db.query("insert into billing_receipts(environment,event_id,owner_id,order_id,kind,receipt) values('test',$1,$2,$3,'dispute',$4::jsonb)", [event, OWNER, ORDER, JSON.stringify(value)]);
    await db.query("insert into billing_credit_holds(environment,event_id,owner_id,reason) values('test',$1,$2,'dispute')", [event, OWNER]);
    const item = (await rpc("billing_paypal_list_reviews", { p_operator_id: ADMIN, p_environment: "test", p_order_id: ORDER })).reviews.find(row => row.eventId === event);
    assert.equal(item.providerEventId, "WHFALLBACK1"); assert.equal(item.disputeId, "DISPUTE-FALLBACK"); assert.equal(item.caseId, "CASE-FALLBACK"); assert.equal(item.amount, 5000);
  });
  await check("dispute, reversal, approval reversal, and late-capture holds remain visible", async () => {
    const cases = [
      { eventId: "paypal:webhook:" + "e".repeat(64), kind: "refund", reason: "reversal", evidence: { version: 1, paypalEventId: "WHREVERSE1", eventType: "PAYMENT.CAPTURE.REVERSED", cursor: 0, resourceKind: "capture", resourceId: CAPTURE, refundId: null, disputeId: null, caseId: null, paypalOrderId: PAYPAL_ORDER, captureId: CAPTURE, providerStatus: "REVERSED", amount: 5000, currency: "USD", detail: {} } },
      { eventId: "paypal:webhook:" + "f".repeat(64), kind: "expired", reason: "payment_approval_reversed", evidence: { version: 1, paypalEventId: "WHAPPROVAL1", eventType: "CHECKOUT.PAYMENT-APPROVAL.REVERSED", cursor: 0, resourceKind: "order", resourceId: PAYPAL_ORDER, refundId: null, disputeId: null, caseId: null, paypalOrderId: PAYPAL_ORDER, captureId: null, providerStatus: "PAYMENT_APPROVAL_REVERSED", amount: null, currency: null, detail: {} } },
      { eventId: `paypal:capture:${CAPTURE}`, kind: "payment", reason: "late_payment_after_expiry", evidence: null }
    ];
    for (const item of cases) {
      const receipt = item.evidence ? { eventId: item.eventId, source: "paypal_webhook", kind: item.reason, paypalOrderId: PAYPAL_ORDER, captureId: item.evidence.captureId, providerEvidence: item.evidence }
        : { eventId: item.eventId, source: "paypal_api", paypalOrderId: PAYPAL_ORDER, captureId: CAPTURE, status: "COMPLETED", amount: 5000, currency: "USD" };
      await db.query("insert into billing_receipts(environment,event_id,owner_id,order_id,kind,receipt) values('test',$1,$2,$3,$4,$5::jsonb)", [item.eventId, OWNER, ORDER, item.kind, JSON.stringify(receipt)]);
      await db.query("insert into billing_credit_holds(environment,event_id,owner_id,reason) values('test',$1,$2,$3)", [item.eventId, OWNER, item.reason]);
    }
    const reviews = (await rpc("billing_paypal_list_reviews", { p_operator_id: ADMIN, p_environment: "test", p_order_id: ORDER })).reviews;
    for (const reason of ["dispute", "reversal", "payment_approval_reversed", "late_payment_after_expiry"]) assert.ok(reviews.some(item => item.holdReason === reason));
    const late = reviews.find(item => item.holdReason === "late_payment_after_expiry"); assert.equal(late.captureId, CAPTURE); assert.equal(late.providerStatus, "COMPLETED");
  });
  await check("fresh unreviewed holds are not starved by one hundred retained cases", async () => {
    await db.query(`do $$declare i integer;e text;begin
      for i in 1..100 loop
        e:='paypal:review:OLDCASE'||lpad(i::text,3,'0');
        insert into billing_receipts(environment,event_id,owner_id,order_id,kind,receipt) values('test',e,'${OWNER}','${ORDER}','dispute',jsonb_build_object('eventId',e));
        insert into billing_credit_holds(environment,event_id,owner_id,reason) values('test',e,'${OWNER}','dispute');
        insert into billing_review_decisions(id,environment,event_id,owner_id,operator_id,action,reason)
          values(gen_random_uuid(),'test',e,'${OWNER}','${ADMIN}','retain_hold','Reviewed old provider case remains unresolved.');
      end loop;
      e:='paypal:review:FRESHCASE001';
      insert into billing_receipts(environment,event_id,owner_id,order_id,kind,receipt) values('test',e,'${OWNER}','${ORDER}','dispute',jsonb_build_object('eventId',e));
      insert into billing_credit_holds(environment,event_id,owner_id,reason) values('test',e,'${OWNER}','dispute');
    end$$`);
    const queue = await rpc("billing_paypal_list_reviews", { p_operator_id: ADMIN, p_environment: "test", p_order_id: null });
    assert.equal(queue.reviews.length, 100); assert.equal(queue.hasMore, true); assert.ok(queue.reviews.some(item => item.eventId === "paypal:review:FRESHCASE001"));
  });
  console.log(`${passed} PayPal admin review ledger checks passed.`);
} finally { await db.close(); }
