import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";

const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, "../../..");
const require = createRequire(path.join(root, "package.json")), ts = require("typescript"), modules = new Map();
function load(name) {
  if (modules.has(name)) return modules.get(name);
  const filename = path.join(root, "apps/web/lib", name + ".ts");
  const js = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} }; modules.set(name, module.exports);
  new Function("require", "module", "exports", js)(id => id === "server-only" ? {} : id.startsWith("./") ? load(id.slice(2)) : require(id), module, module.exports);
  modules.set(name, module.exports); return module.exports;
}
const { createPayPalService } = load("paypal-service");
const OWNER = randomUUID(), OTHER = randomUUID(), REQUEST = randomUUID(), ORDER = randomUUID(), ORDER2 = randomUUID();
const PAYPAL = "5O190127TN364715T", CAPTURE = "7X12345678901234A", CAPTURE2 = "8Y12345678901234B", MERCHANT = "ABCDEFGHIJKLM";
const offer = { key: "profile_1", version: 1, currency: "usd", amount: 1200, credits: 1 };
const raw = (overrides = {}) => ({ orderId: ORDER, ownerId: OWNER, environment: "test", requestKey: REQUEST, status: "open", offer,
  provider: "paypal", merchantId: MERCHANT, paypalOrderId: PAYPAL, captureId: null, hold: false, createdAt: new Date().toISOString(), ...overrides });
const account = (overrides = {}) => ({ environment: "test", createEnvironment: "test", freeLimit: 5, ownedProfiles: 5, freeRemaining: 0,
  paidGranted: 0, paidConsumed: 0, paidRemaining: 0, paidAvailable: 0, commercialExempt: false, hold: false, unresolvedOrder: null, ...overrides });
const unit = (overrides = {}) => ({ reference_id: ORDER, custom_id: ORDER, invoice_id: `QRG-${ORDER}`, payee: { merchant_id: MERCHANT },
  amount: { currency_code: "USD", value: "12.00" }, ...overrides });
const orderView = (status = "COMPLETED", captures = [{ id: CAPTURE, status: "COMPLETED", final_capture: true, amount: { currency_code: "USD", value: "12.00" } }], overrides = {}) => ({
  id: PAYPAL, intent: "CAPTURE", status, purchase_units: [{ ...unit(), ...(captures === null ? {} : { payments: { captures } }) }], ...overrides });
const captureView = (id = CAPTURE, status = "COMPLETED", orderId = PAYPAL) => ({ id, status, final_capture: true, amount: { currency_code: "USD", value: "12.00" },
  payee: { merchant_id: MERCHANT }, supplementary_data: { related_ids: { order_id: orderId } }, invoice_id: `QRG-${ORDER}`, custom_id: ORDER });
const config = { configured: true, enabled: true, environment: "test", clientId: "CLIENT_ID_123456", secret: "fixture-secret", merchantId: MERCHANT,
  webhookId: "fixture-webhook", merchantName: "QRguitar", origin: "https://fixture.invalid", applePayEnabled: false };
const webhookReceiptId = (eventId, cursor) => `paypal:webhook:${createHash("sha256").update(`${eventId}:${cursor}`).digest("hex")}`;
async function planned(service,event) {
  await service.verifyWebhook(event,{},JSON.stringify(event));
  return service.prepareWebhook(event);
}
async function processOne(service,event,cursor=0,plan) {
  const work=plan || await planned(service,event);
  return service.prepareWebhookItem({id:event.id,event_type:event.event_type},work[cursor],cursor);
}
let passed = 0;
async function check(name, fn) { await fn(); passed++; console.log("PASS " + name); }
const rejects = (promise, code) => assert.rejects(promise, error => { assert.equal(error.code, code); return true; });
function make({ rows = {}, gateway = {}, actor = { id: OWNER, accountStatus: "active" }, now } = {}) {
  const calls = [], defaults = {
    async createOrder() { return orderView("CREATED", []); }, async getOrder() { return orderView(); }, async captureOrder() { return orderView(); },
    async getCapture(id) { return captureView(id); }, async getRefund(id) { return { id, status: "COMPLETED", links: [{ rel: "up", href: `https://api-m.sandbox.paypal.com/v2/payments/captures/${CAPTURE}` }] }; },
    async getDispute(id) { return { dispute_id: id, disputed_transactions: [{ seller_transaction_id: CAPTURE }] }; }, async verifyWebhook() { return true; }
  };
  const database = { async rpc(name, args) {
    calls.push({ name, args }); const handler = rows[name]??(name==="billing_paypal_webhook_scheduler_ready"?true:undefined);
    if (!handler) throw new Error("Unexpected RPC " + name);
    try { return { data: typeof handler === "function" ? await handler(args, calls) : structuredClone(handler), error: null }; }
    catch (error) { return { data: null, error: { code: error.code || "fixture" } }; }
  } };
  return { calls, service: createPayPalService({ config, gateway: { ...defaults, ...gateway }, database, authenticate: async () => actor, timeoutMs: 1000, now }) };
}

await check("create reserves, validates and binds one approved pack", async () => {
  const reserved = raw({ status: "reserved", paypalOrderId: null }), bound = raw(); let creates = 0;
  const { service, calls } = make({ rows: {
    billing_paypal_find_order: { order: null }, billing_account_status: account(), billing_paypal_reserve_order: reserved,
    billing_paypal_bind_order: args => { assert.equal(args.p_paypal_order_id, PAYPAL); return bound; }
  }, gateway: { createOrder: async value => { creates++; assert.equal(value.orderId, ORDER); return orderView("CREATED", []); } } });
  assert.deepEqual(await service.create({}, { offerKey: "profile_1", requestId: REQUEST }), { orderId: ORDER, paypalOrderId: PAYPAL, status: "approval_pending" });
  assert.equal(creates, 1); assert.deepEqual(calls.map(call => call.name), ["billing_paypal_find_order", "billing_paypal_webhook_scheduler_ready", "billing_account_status", "billing_paypal_reserve_order", "billing_paypal_bind_order"]);
});

await check("same request resumes its bound provider order without creating another", async () => {
  let creates = 0; const { service } = make({ rows: { billing_paypal_find_order: { order: raw() } }, gateway: { createOrder: async () => { creates++; return {}; } } });
  assert.equal((await service.create({}, { offerKey: "profile_1", requestId: REQUEST })).paypalOrderId, PAYPAL); assert.equal(creates, 0);
});

await check("lost create response can recover a terminal order without reopening or charging", async () => {
  let providerCalls = 0; const done = raw({ status: "fulfilled", captureId: CAPTURE });
  const { service } = make({ rows: { billing_paypal_find_order: { order: done } }, gateway: { createOrder: async () => { providerCalls++; return {}; } } });
  assert.deepEqual(await service.create({}, { offerKey: "profile_1", requestId: REQUEST }), { orderId: ORDER, paypalOrderId: PAYPAL, status: "fulfilled" });
  assert.equal(providerCalls, 0);
});

await check("old unbound reservation expires safely without another provider create", async () => {
  const old = raw({ status: "reserved", paypalOrderId: null, createdAt: new Date(0).toISOString() }); let creates = 0;
  const { service } = make({ rows: { billing_paypal_find_order: { order: old }, billing_paypal_expire_unbound: { ...old, status: "expired" } }, gateway: { createOrder: async () => { creates++; return {}; } }, now: () => 6 * 60 * 60 * 1000 });
  assert.deepEqual(await service.create({}, { offerKey: "profile_1", requestId: REQUEST }),{orderId:ORDER,paypalOrderId:null,status:"cancelled"});assert.equal(creates, 0);
});
await check("racing bind wins unbound expiry and resumes the same provider order",async()=>{
  let creates=0;const old=raw({status:"reserved",paypalOrderId:null,createdAt:new Date(0).toISOString()});
  const {service}=make({rows:{billing_paypal_find_order:{order:old},billing_paypal_expire_unbound:raw()},gateway:{createOrder:async()=>{creates++;return{};}},now:()=>6*60*60*1000});
  assert.equal((await service.create({},{offerKey:"profile_1",requestId:REQUEST})).paypalOrderId,PAYPAL);assert.equal(creates,0);
});
await check("terminal unbound replay returns its identity so the client can clear saved intent",async()=>{
  const {service}=make({rows:{billing_paypal_find_order:{order:raw({status:"expired",paypalOrderId:null})}}});
  assert.deepEqual(await service.create({},{offerKey:"profile_1",requestId:REQUEST}),{orderId:ORDER,paypalOrderId:null,status:"cancelled"});
});
for(const provider of["direct","stripe"])await check("status provides correct "+provider+" recovery route metadata",async()=>{
  const {service}=make({rows:{billing_paypal_status:{account:account(),order:null,pendingOrder:null,otherPendingOrder:{orderId:ORDER,provider}}}});
  const value=await service.status({});assert.equal(value.legacyOrderId,ORDER);assert.equal(value.legacyOrderProvider,provider);
});
await check("a recent scheduler heartbeat gates only new checkout while saved payments remain recoverable",async()=>{
  const pending=raw(),stale=make({rows:{billing_paypal_status:{account:account(),order:pending,pendingOrder:pending,otherPendingOrder:null},billing_paypal_webhook_scheduler_ready:false,
    billing_paypal_find_order:{order:null}}});
  const status=await stale.service.status({},ORDER);assert.equal(status.enabled,false);assert.equal(status.offers.length,0);assert.equal(status.order.orderId,ORDER);assert.equal(status.pendingOrder.orderId,ORDER);
  await rejects(stale.service.create({},{offerKey:"profile_1",requestId:REQUEST}),"billing_disabled");
  assert.equal(stale.calls.some(call=>call.name==="billing_paypal_reserve_order"),false);
  const existing=make({rows:{billing_paypal_find_order:{order:pending},billing_paypal_webhook_scheduler_ready:false}});
  assert.equal((await existing.service.create({},{offerKey:"profile_1",requestId:REQUEST})).paypalOrderId,PAYPAL);
  assert.equal(existing.calls.some(call=>call.name==="billing_paypal_webhook_scheduler_ready"),false);
});
for(const failed of["DECLINED","DENIED","FAILED"])await check(failed+" capture closes its unpaid attempt without classifying it as reversal",async()=>{
  const {service,calls}=make({rows:{billing_paypal_get_order:raw(),billing_paypal_record_failure:raw({status:"expired"})},gateway:{getCapture:async()=>captureView(CAPTURE,failed)}});
  assert.equal((await service.reconcile({},{orderId:ORDER})).order.status,"cancelled");assert.equal(calls.some(c=>c.name==="billing_paypal_record_review"),false);
});
await check("verified webhook recovers a late unbound provider order by exact local reference before grant",async()=>{
  const expired=raw({status:"expired",paypalOrderId:null});
  const {service,calls}=make({rows:{billing_paypal_lookup_order:{order:null},billing_paypal_find_correlated_order:{order:expired},
    billing_paypal_bind_order:raw({status:"expired"}),billing_paypal_apply_capture:raw({status:"fulfilled",captureId:CAPTURE,hold:true})}});
  const outcome=await processOne(service,{id:"WHLATECAPTURE123",event_type:"PAYMENT.CAPTURE.COMPLETED",resource:{id:CAPTURE}});
  assert.deepEqual(calls.map(c=>c.name),["billing_paypal_lookup_order","billing_paypal_find_correlated_order","billing_paypal_bind_order"]);
  assert.equal(outcome.effect,"capture");assert.equal(outcome.outcome.captureId,CAPTURE);assert.equal(outcome.outcome.receiptEventId,`paypal:capture:${CAPTURE}`);
});
await check("lost binding recovery never trusts a wrong merchant or modified provider amount",async()=>{
  const expired=raw({status:"expired",paypalOrderId:null});
  const wrongMerchant=make({rows:{billing_paypal_lookup_order:{order:null}},gateway:{getOrder:async()=>orderView("COMPLETED",[],{purchase_units:[unit({payee:{merchant_id:"OTHERCHANT"}})]})}});
  await rejects(processOne(wrongMerchant.service,{id:"WHWRONG123",event_type:"PAYMENT.CAPTURE.COMPLETED",resource:{id:CAPTURE}}),"webhook_unmatched");
  assert.equal(wrongMerchant.calls.some(c=>c.name==="billing_paypal_bind_order"),false);
  const wrongAmount=make({rows:{billing_paypal_lookup_order:{order:null},billing_paypal_find_correlated_order:{order:expired}},gateway:{getOrder:async()=>orderView("COMPLETED",[],{purchase_units:[unit({amount:{currency_code:"USD",value:"11.99"}})]})}});
  await rejects(processOne(wrongAmount.service,{id:"WHWRONG123",event_type:"PAYMENT.CAPTURE.COMPLETED",resource:{id:CAPTURE}}),"payment_mismatch");
  assert.equal(wrongAmount.calls.some(c=>c.name==="billing_paypal_bind_order"),false);
});

await check("fresh completed capture grants even while Orders top status is stale", async () => {
  const fulfilled = raw({ status: "fulfilled", captureId: CAPTURE });
  const { service, calls } = make({ rows: { billing_paypal_get_order: raw(), billing_paypal_apply_capture: args => { assert.equal(args.p_receipt.captureId, CAPTURE); return fulfilled; } },
    gateway: { getOrder: async () => orderView("APPROVED"), getCapture: async () => captureView() } });
  const result = await service.capture({}, { orderId: ORDER }); assert.equal(result.order.status, "fulfilled");
  assert.equal(calls.filter(call => call.name === "billing_paypal_apply_capture").length, 1);
});

await check("saved-payment reconciliation captures a provider-approved order idempotently", async () => {
  const fulfilled = raw({ status: "fulfilled", captureId: CAPTURE }); let captures = 0;
  const { service } = make({ rows: { billing_paypal_get_order: raw(), billing_paypal_apply_capture: fulfilled }, gateway: {
    getOrder: async () => orderView("APPROVED", []), captureOrder: async () => { captures++; return orderView("COMPLETED"); }, getCapture: async () => captureView()
  } });
  const result = await service.reconcile({}, { orderId: ORDER }); assert.equal(result.order.status, "fulfilled"); assert.equal(captures, 1);
});

await check("webhook completes from standalone capture while Orders nested payments lag", async () => {
  const fulfilled = raw({ status: "fulfilled", captureId: CAPTURE });
  const { service, calls } = make({ rows: {
    billing_paypal_lookup_order: { order: raw() }, billing_paypal_apply_capture: fulfilled
  }, gateway: { getOrder: async () => orderView("APPROVED", null), getCapture: async () => captureView(), verifyWebhook: async () => true } });
  const result = await processOne(service,{ id: "WH12345678", event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { id: CAPTURE } });
  assert.equal(result.effect,"capture");assert.equal(result.outcome.receiptEventId,`paypal:capture:${CAPTURE}`);assert.equal(calls.some(call=>call.name==="billing_paypal_apply_capture"),false);
});

await check("approved checkout webhook captures and fulfills a redirect payment", async () => {
  const fulfilled = raw({ status: "fulfilled", captureId: CAPTURE }); let captures = 0;
  const { service, calls } = make({ rows: { billing_paypal_lookup_order: { order: raw() }, billing_paypal_apply_capture: fulfilled }, gateway: {
    getOrder: async () => orderView("APPROVED", []), captureOrder: async () => { captures++; return orderView("COMPLETED"); }, getCapture: async () => captureView()
  } });
  const result=await processOne(service,{ id: "WHAPPROVED123", event_type: "CHECKOUT.ORDER.APPROVED", resource: { id: PAYPAL } });
  assert.equal(captures,1);assert.equal(calls.some(call=>call.name==="billing_paypal_apply_capture"),false);
  assert.equal(result.effect,"capture");assert.equal(result.outcome.captureId,CAPTURE);assert.equal(result.outcome.receiptEventId,`paypal:capture:${CAPTURE}`);
});

await check("approved checkout with a pending capture stays retryable and later prepares the completed capture", async () => {
  let captureReads=0;const {service,calls}=make({rows:{billing_paypal_lookup_order:{order:raw()}},gateway:{
    getOrder:async()=>orderView("APPROVED",[]),captureOrder:async()=>orderView("COMPLETED",[{id:CAPTURE,status:"PENDING",final_capture:true,amount:{currency_code:"USD",value:"12.00"}}]),
    getCapture:async()=>captureView(CAPTURE,++captureReads===1?"PENDING":"COMPLETED")
  }});const event={id:"WHPENDING123",event_type:"CHECKOUT.ORDER.APPROVED",resource:{id:PAYPAL}};
  await rejects(processOne(service,event),"approval_capture_pending");const result=await processOne(service,event);
  assert.equal(result.effect,"capture");assert.equal(result.outcome.receiptEventId,`paypal:capture:${CAPTURE}`);
  assert.equal(calls.some(call=>call.name==="billing_paypal_apply_capture"),false);
});

await check("approval reversal expires safely before any late capture reconciliation", async () => {
  const expired = raw({ status: "expired" });
  const { service, calls } = make({ rows: { billing_paypal_lookup_order: { order: raw() } }, gateway: { getOrder: async () => orderView("VOIDED", []) } });
  const result=await processOne(service,{ id: "WHREVERSED123", event_type: "CHECKOUT.PAYMENT-APPROVAL.REVERSED", resource: { order_id: PAYPAL } });
  assert.equal(calls.at(-1).name,"billing_paypal_lookup_order");assert.equal(result.effect,"approval_reversed");assert.equal(result.outcome.receiptEventId,webhookReceiptId("WHREVERSED123",0));
});

await check("tampered amount is rejected before any grant", async () => {
  const { service, calls } = make({ rows: { billing_paypal_get_order: raw() }, gateway: { getOrder: async () => orderView("COMPLETED", [{ id: CAPTURE, status: "COMPLETED", final_capture: true, amount: { currency_code: "USD", value: "11.99" } }]) } });
  await rejects(service.reconcile({}, { orderId: ORDER }), "payment_mismatch"); assert.equal(calls.some(call => call.name === "billing_paypal_apply_capture"), false);
});

await check("cross-account order is rejected before provider access", async () => {
  let providerReads = 0; const { service } = make({ rows: { billing_paypal_get_order: raw({ ownerId: OTHER }) }, gateway: { getOrder: async () => { providerReads++; return {}; } } });
  await rejects(service.reconcile({}, { orderId: ORDER }), "invalid_order"); assert.equal(providerReads, 0);
});

await check("completed refund holds immediately while capture view still says completed", async () => {
  const { service, calls } = make({ rows: { billing_paypal_lookup_order: { order: raw() } }, gateway: { getRefund: async id => ({ id, status: "COMPLETED", links: [{ rel: "up", href: `https://api-m.sandbox.paypal.com/v2/payments/captures/${CAPTURE}` }] }),
    getCapture: async () => captureView(), getOrder: async () => orderView() } });
  const result=await processOne(service,{ id: "WHREFUND123", event_type: "PAYMENT.CAPTURE.REFUNDED", resource: { id: "9Z12345678901234C" } });
  assert.equal(result.effect,"review");assert.equal(result.reviewKind,"refund");assert.equal(result.outcome.receiptEventId,webhookReceiptId("WHREFUND123",0));assert.equal(calls.some(call => call.name === "billing_paypal_apply_capture"), false);
});

await check("one dispute spanning two captures records two stable distinct holds", async () => {
  const first = raw(), second = raw({ orderId: ORDER2, requestKey: randomUUID(), paypalOrderId: "6P190127TN364715U" });
  const { service } = make({ rows: {
    billing_paypal_lookup_order: args => ({ order: args.p_paypal_order_id === PAYPAL ? first : second })
  }, gateway: {
    getDispute: async id => ({ dispute_id: id, disputed_transactions: [{ seller_transaction_id: CAPTURE }, { seller_transaction_id: CAPTURE2 }] }),
    getCapture: async id => id === CAPTURE ? captureView(CAPTURE) : { ...captureView(CAPTURE2, "COMPLETED", second.paypalOrderId), invoice_id: `QRG-${ORDER2}`, custom_id: ORDER2 },
    getOrder: async id => id === PAYPAL ? orderView() : { ...orderView("COMPLETED", [{ id: CAPTURE2, status: "COMPLETED", final_capture: true, amount: { currency_code: "USD", value: "12.00" } }]), id, purchase_units: [{ ...unit({ reference_id: ORDER2, custom_id: ORDER2, invoice_id: `QRG-${ORDER2}` }), payments: { captures: [{ id: CAPTURE2, status: "COMPLETED", final_capture: true, amount: { currency_code: "USD", value: "12.00" } }] } }] }
  } });
  const event={ id: "WHDISPUTE123", event_type: "CUSTOMER.DISPUTE.CREATED", resource: { dispute_id: "PP-D-12345" } },plan=await planned(service,event);
  const firstOutcome=await processOne(service,event,0,plan),secondOutcome=await processOne(service,event,1,plan);
  assert.equal(firstOutcome.effect,"review");assert.equal(secondOutcome.effect,"review");assert.notEqual(firstOutcome.outcome.receiptEventId,secondOutcome.outcome.receiptEventId);
});

await check("invalid webhook signature cannot reach provider or ledger reconciliation", async () => {
  let reads = 0; const { service, calls } = make({ rows: {}, gateway: { verifyWebhook: async () => false, getCapture: async () => { reads++; return {}; } } });
  const event={ id: "WH12345678", event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { id: CAPTURE } };
  await rejects(service.verifyWebhook(event,{},JSON.stringify(event)), "invalid_webhook_signature");
  assert.equal(reads, 0); assert.equal(calls.length, 0);
});

console.log(`Automatic PayPal service: ${passed} checks passed.`);
