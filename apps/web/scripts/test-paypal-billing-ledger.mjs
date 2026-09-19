// Transactional SQL behavior; actual multi-connection races live in test-billing-concurrency.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {installRepositorySchema} from './security/postgres-fixture.mjs';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const db=new PGlite();await installRepositorySchema(db,repo);
const owner=randomUUID(),other=randomUUID(),admin=randomUUID(),merchant='SYNTHETICMERCHANT';
await db.query('insert into auth.users(id) values($1),($2),($3)',[owner,other,admin]);
await db.query("insert into profiles(id,display_name,role) values($1,'Synthetic owner','owner'),($2,'Synthetic other','owner'),($3,'Synthetic admin','admin')",[owner,other,admin]);
let passed=0;
async function test(name,fn){await db.exec('begin');try{await fn();passed++;console.log('PASS '+name);}finally{await db.exec('rollback');}}
async function rpc(name,args,role='service_role'){
  await db.exec('savepoint paypal_rpc;set local role '+role);
  try{const v=(await db.query('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') value',args)).rows[0].value;
    await db.exec('reset role;release savepoint paypal_rpc');return v;
  }catch(e){await db.exec('rollback to savepoint paypal_rpc;release savepoint paypal_rpc');throw e;}
}
const reject=(run,code)=>assert.rejects(run,e=>e.code===code,'Expected SQLSTATE '+code);
const id=()=>randomUUID().replaceAll('-','').toUpperCase();
const reserve=(actor=owner,key=randomUUID(),pack='profile_1',m=merchant)=>rpc('billing_paypal_reserve_order',[actor,'live',key,pack,m]);
const bind=(o,pp=id(),m=merchant,actor=o.ownerId)=>rpc('billing_paypal_bind_order',[actor,'live',o.orderId,pp,m]);
const ready=async(actor=owner,pack='profile_1')=>bind(await reserve(actor,randomUUID(),pack));
const receipt=(o,capture=id())=>({paypalOrderId:o.paypalOrderId,captureId:capture,merchantId:merchant,referenceId:o.orderId,customId:o.orderId,invoiceId:'QRG-'+o.orderId,amount:o.offer.amount,currency:'USD',status:'COMPLETED'});
const apply=(o,r=receipt(o),role='service_role')=>rpc('billing_paypal_apply_capture',['live',o.orderId,r],role);
const review=(o,r,event=id(),kind='refund')=>rpc('billing_paypal_record_review',['live',o.orderId,event,kind,r]);
const close=(o,status='VOIDED')=>rpc('billing_paypal_close_order',['live',o.orderId,o.paypalOrderId,merchant,status]);
const reverseApproval=(o,event=id())=>rpc('billing_paypal_reverse_approval',['live',o.orderId,o.paypalOrderId,merchant,event]);
const failure=(o,r)=>rpc('billing_paypal_record_failure',['live',o.orderId,r]);
const expire=(o,actor=o.ownerId)=>rpc('billing_paypal_expire_unbound',[actor,'live',o.orderId]);
async function aged(actor=owner){
  const orderId=randomUUID(),key=randomUUID(),offer={key:'profile_1',version:1,currency:'usd',amount:1200,credits:1};
  await db.query("insert into billing_orders(id,owner_id,environment,request_key,offer,created_at) values($1,$2,'live',$3,$4,'2000-01-01T00:00:00Z')",[orderId,actor,key,offer]);
  await db.query("insert into billing_paypal_orders(order_id,owner_id,environment,merchant_id) values($1,$2,'live',$3)",[orderId,actor,merchant]);
  return rpc('billing_paypal_get_order',[actor,'live',orderId]);
}
const status=(actor=owner,order=null)=>rpc('billing_paypal_status',[actor,'live',order]);
const direct=(actor=other)=>rpc('billing_direct_reserve_order',[actor,'live',randomUUID(),'profile_1','paypal',{accountKey:'synthetic-paypal',displayName:'Synthetic QRguitar',paymentUrl:'https://www.paypal.com/ncp/payment/SYNTHETIC',address:null}]);
const verify=(o,reference)=>rpc('billing_direct_verify_order',['live',o.orderId,admin,randomUUID(),reference,1200,'usd','Verified completed PayPal payment in the business account.']);
const count=async(table)=>(await db.query('select count(*)::int n from '+table)).rows[0].n;
try{
await test('all PayPal tables/helpers deny browser and direct service access',async()=>{
  for(const t of ['billing_paypal_orders','billing_paypal_bindings','billing_provider_references'])for(const role of ['anon','authenticated','service_role'])
    assert.equal((await db.query("select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') v",[role,t])).rows[0].v,false);
  const funcs=(await db.query("select oid::regprocedure::text signature,proname from pg_proc where pronamespace='public'::regnamespace and (proname like 'billing_paypal_%' or proname like '_billing_paypal_%')")).rows;
  for(const name of ['billing_paypal_reserve_order','billing_paypal_apply_capture','billing_paypal_webhook_enqueue','billing_paypal_webhook_apply_item','billing_paypal_webhook_admin_retry'])
    assert.ok(funcs.some(f=>f.proname===name),'Missing '+name);
  for(const f of funcs)for(const role of ['anon','authenticated','service_role'])
    assert.equal((await db.query("select has_function_privilege($1,$2,'EXECUTE') v",[role,f.signature])).rows[0].v,role==='service_role'&&f.proname.startsWith('billing_paypal_'));
});
for(const [pack,amount,credits]of[['profile_1',1200,1],['profile_10',5000,10],['profile_25',9900,25]])await test(pack+' pricing comes only from approved database pack',async()=>{
  const o=await reserve(owner,randomUUID(),pack);assert.deepEqual(o.offer,{key:pack,version:1,currency:'usd',amount,credits});
  assert.equal(o.status,'reserved');assert.equal(o.paypalOrderId,null);assert.equal(o.captureId,null);assert.equal(o.merchantId,merchant);
  assert.equal((await status()).account.freeLimit,25);assert.equal((await status()).account.paidGranted,0);
});
await test('reserve rejects invalid IDs, packs, wrong environment, inactive and exempt accounts',async()=>{
  await reject(()=>reserve(owner,randomUUID(),'profile_100'),'22023');await reject(()=>reserve(owner,randomUUID(),'profile_1',''),'22023');
  await reject(()=>rpc('billing_paypal_reserve_order',[owner,'test',randomUUID(),'profile_1',merchant]),'42501');
  for(const plan of['business','enterprise']){await db.query('update profiles set plan=$2 where id=$1',[owner,plan]);await reject(()=>reserve(),'PT409');}
  await db.query("update profiles set plan='single',account_status='locked' where id=$1",[owner]);await reject(()=>reserve(),'42501');
});
await test('reserve/find retries preserve request and merchant snapshots across configuration changes',async()=>{
  const key=randomUUID(),o=await reserve(owner,key);assert.deepEqual(await reserve(owner,key),o);
  await reject(()=>reserve(owner,key,'profile_10'),'PT409');await reject(()=>reserve(owner,key,'profile_1','OTHERCHANT'),'PT409');
  assert.deepEqual((await rpc('billing_paypal_find_order',[owner,'live',key])).order,o);assert.equal((await rpc('billing_paypal_find_order',[other,'live',key])).order,null);
  await reject(()=>rpc('billing_paypal_get_order',[other,'live',o.orderId]),'P0002');await reject(()=>status(other,o.orderId),'P0002');
});
await test('one unresolved purchase spans Stripe, manual and automatic PayPal without breaking legacy status',async()=>{
  const o=await reserve();await reject(()=>direct(owner),'PT409');await reject(()=>reserve(),'PT409');
  const offer={key:'profile_1',version:1,currency:'usd',amount:1200,credits:1,priceId:'price_synthetic'};
  await rpc('billing_register_offer',['live',offer]);await reject(()=>rpc('billing_reserve_order',[owner,'live',randomUUID(),offer]),'PT409');
  assert.equal((await rpc('billing_account_status',[owner,'live'])).unresolvedOrder,null);assert.equal((await status()).pendingOrder.orderId,o.orderId);
});
await test('automatic status exposes a direct pending order with its correct recovery provider',async()=>{
  const o=await direct(owner),s=await status();assert.equal(s.pendingOrder,null);assert.equal(s.account.unresolvedOrder,null);
  assert.deepEqual(s.otherPendingOrder,{orderId:o.orderId,provider:'direct'});assert.equal((await status(other)).otherPendingOrder,null);
  await reject(()=>reserve(),'PT409');
});
await test('automatic status labels Stripe pending orders separately from manual direct payments',async()=>{
  const offer={key:'profile_1',version:1,currency:'usd',amount:1200,credits:1,priceId:'price_synthetic'};
  await rpc('billing_register_offer',['live',offer]);const o=await rpc('billing_reserve_order',[owner,'live',randomUUID(),offer]),s=await status();
  assert.deepEqual(s.otherPendingOrder,{orderId:o.orderId,provider:'stripe'});assert.equal(s.pendingOrder,null);
});
await test('binding is owner scoped, exact, replayable and globally unique per PayPal order',async()=>{
  const o=await reserve(),pp=id();await reject(()=>bind(o,pp,'OTHERCHANT'),'22023');await reject(()=>bind(o,pp,merchant,other),'P0002');
  const b=await bind(o,pp);assert.equal(b.status,'open');assert.equal(b.sessionId,'paypal_order:'+pp);assert.deepEqual(await bind(o,pp),b);
  await reject(()=>bind(o,id()),'PT409');const second=await reserve(other);await reject(()=>bind(second,pp),'PT409');
  assert.equal(await count('billing_paypal_bindings'),1);
});
await test('unbound expiry uses authoritative age and owner checks and never closes a bound purchase',async()=>{
  const young=await reserve();await reject(()=>expire(young),'PT409');await reject(()=>expire(young,other),'P0002');
  const bound=await bind(young);assert.deepEqual(await expire(bound),bound);assert.equal(await count('billing_receipts'),0);
});
await test('old unbound purchase expires once with system audit and allows a fresh request',async()=>{
  const old=await aged(),expired=await expire(old);assert.equal(expired.status,'expired');assert.equal(expired.paypalOrderId,null);assert.deepEqual(await expire(old),expired);
  assert.equal(await count('billing_receipts'),1);assert.equal(await count('billing_credit_grants'),0);assert.equal((await status()).account.hold,false);
  const audit=(await db.query('select receipt from billing_receipts')).rows[0].receipt;assert.equal(audit.status,'UNBOUND_REQUEST_EXPIRED');assert.equal(audit.source,'qrguitar_recovery');
  assert.equal((await reserve()).status,'reserved');
});
await test('late verified binding stays expired and reconciles later money under hold',async()=>{
  const old=await aged();await expire(old);const next=await reserve();
  const correlated=await rpc('billing_paypal_find_correlated_order',['live',old.orderId,merchant]);assert.equal(correlated.order.orderId,old.orderId);
  assert.equal((await rpc('billing_paypal_find_correlated_order',['live',old.orderId,'OTHERCHANT'])).order,null);
  const bound=await bind(old);assert.equal(bound.status,'expired');assert.equal((await status()).pendingOrder.orderId,next.orderId);
  const paid=await apply(bound);assert.equal(paid.granted,true);assert.equal(paid.hold,true);assert.equal((await status()).account.paidAvailable,0);
});
await test('an unbound or browser-submitted capture cannot grant credits',async()=>{
  const o=await reserve(),r={...receipt(o),paypalOrderId:id()};await reject(()=>apply(o,r),'22023');
  for(const role of['anon','authenticated'])await reject(()=>apply(o,r,role),'42501');assert.equal(await count('billing_credit_grants'),0);
});
await test('every verified capture identity and exact gross amount is checked with no extra trusted fields',async()=>{
  const o=await ready(),r=receipt(o);
  const patches=[{paypalOrderId:id()},{captureId:''},{merchantId:'OTHERCHANT'},{referenceId:other},{customId:other},{invoiceId:'WRONG'},
    {amount:1199},{amount:1201},{amount:'1200'},{currency:'usd'},{currency:'EUR'},{status:'APPROVED'},{status:'PENDING'},{status:'DECLINED'},{credits:99}];
  for(const patch of patches)await reject(()=>apply(o,{...r,...patch}),'22023');
  assert.equal(await count('billing_credit_grants'),0);assert.equal(await count('billing_receipts'),0);assert.equal(await count('billing_provider_references'),0);
});
await test('completed capture grants once across response loss and webhook replay; no fabricated human actor',async()=>{
  const o=await ready(owner,'profile_10'),r=receipt(o),first=await apply(o,r);assert.equal(first.granted,true);assert.equal(first.captureId,r.captureId);
  const second=await apply(o,r);assert.equal(second.alreadyGranted,true);assert.equal(second.updatedAt,first.updatedAt);
  assert.equal((await status()).account.paidGranted,10);assert.equal((await status()).pendingOrder,null);
  for(const table of['billing_credit_grants','billing_receipts','billing_provider_references'])assert.equal(await count(table),1);
  const saved=(await db.query('select receipt from billing_receipts')).rows[0].receipt;assert.equal(saved.source,'paypal_api');assert.equal('operatorId'in saved,false);
  await reject(()=>apply(o,receipt(o)),'PT409');
});
await test('provider lookup matches environment and both identities without leaking to browser callers',async()=>{
  const o=await ready(),r=receipt(o);
  assert.equal((await rpc('billing_paypal_lookup_order',['live',o.paypalOrderId,null])).order.orderId,o.orderId);
  assert.equal((await rpc('billing_paypal_lookup_order',['live',null,r.captureId])).order,null);await apply(o,r);
  assert.equal((await rpc('billing_paypal_lookup_order',['live',null,r.captureId])).order.orderId,o.orderId);
  assert.equal((await rpc('billing_paypal_lookup_order',['live',id(),r.captureId])).order,null);
  await reject(()=>rpc('billing_paypal_lookup_order',['live',null,null]),'22023');await reject(()=>rpc('billing_paypal_lookup_order',['test',o.paypalOrderId,null]),'42501');
  await reject(()=>rpc('billing_paypal_lookup_order',['live',o.paypalOrderId,null],'authenticated'),'42501');
});
await test('automatic capture cannot be reused across owners/orders',async()=>{
  const a=await ready(),b=await ready(other),r=receipt(a);await apply(a,r);await reject(()=>apply(b,receipt(b,r.captureId)),'PT409');
  assert.equal((await status(other)).account.paidGranted,0);assert.equal(await count('billing_credit_grants'),1);
});
await test('automatic capture prevents manual receipt reuse even with punctuation/case normalization',async()=>{
  const a=await ready(),r=receipt(a);await apply(a,r);const b=await direct();await reject(()=>verify(b,r.captureId.slice(0,10)+'-'+r.captureId.slice(10).toLowerCase()),'PT409');
  assert.equal((await status(other)).account.paidGranted,0);
});
await test('manual verified PayPal receipt prevents automatic capture reuse',async()=>{
  const a=await direct(),capture=id();await verify(a,capture);const b=await ready();await reject(()=>apply(b,receipt(b,capture)),'PT409');
  assert.equal((await status()).account.paidGranted,0);assert.equal(await count('billing_provider_references'),1);
});
await test('customer cancellation, unknown outcome and nonterminal provider states cannot close a purchase',async()=>{
  const o=await ready();for(const s of['CANCELLED','UNKNOWN','CREATED','APPROVED','COMPLETED',null])await reject(()=>close(o,s),'22023');
  assert.equal((await status()).pendingOrder.orderId,o.orderId);await reject(()=>reserve(),'PT409');assert.equal(await count('billing_receipts'),0);
});
for(const failed of['DECLINED','DENIED','FAILED'])await test('ordinary '+failed+' closes its attempt without freezing earlier paid credits',async()=>{
  const paid=await ready(owner,'profile_10');await apply(paid);
  const o=await ready(),r={...receipt(o),status:failed},closed=await failure(o,r);
  assert.equal(closed.status,'expired');assert.equal(closed.hold,false);assert.equal(closed.captureId,null);assert.deepEqual(await failure(o,r),closed);
  const b=(await status()).account;assert.equal(b.paidGranted,10);assert.equal(b.paidAvailable,10);assert.equal(b.hold,false);
  assert.equal((await reserve()).status,'reserved');
});
await test('failed capture later completing grants only under hold',async()=>{
  const o=await ready(),r=receipt(o);await failure(o,{...r,status:'DENIED'});await apply(o,r);
  assert.equal((await status()).account.paidGranted,1);assert.equal((await status()).account.paidAvailable,0);
});
await test('failure after a known completed capture holds that grant and preserves history',async()=>{
  const o=await ready(),r=receipt(o);await apply(o,r);await failure(o,{...r,status:'FAILED'});await failure(o,{...r,status:'FAILED'});
  assert.equal((await status()).account.paidGranted,1);assert.equal((await status()).account.paidAvailable,0);assert.equal(await count('billing_credit_holds'),1);
});
await test('failure closure rejects unverified states and mismatched amounts without changing order',async()=>{
  const o=await ready(),r=receipt(o);await reject(()=>failure(o,r),'22023');await reject(()=>failure(o,{...r,status:'DENIED',amount:1}),'22023');
  assert.equal((await status()).pendingOrder.orderId,o.orderId);assert.equal(await count('billing_receipts'),0);
});
await test('authoritative void closes unpaid order; a later completed capture grants into a hold',async()=>{
  const o=await ready(),r=receipt(o);assert.equal((await close(o)).status,'expired');assert.equal((await close(o)).status,'expired');
  assert.equal((await status()).pendingOrder,null);const saved=await apply(o,r);assert.equal(saved.granted,true);assert.equal(saved.hold,true);
  const b=(await status()).account;assert.equal(b.paidGranted,1);assert.equal(b.paidAvailable,0);await reject(()=>close(o),'PT409');
  await apply(o,r);assert.equal(await count('billing_credit_holds'),1);
});
await test('signed approval reversal closes unpaid order idempotently and late capture stays held',async()=>{
  const o=await ready(),r=receipt(o),event=id();const first=await reverseApproval(o,event);assert.equal(first.status,'expired');assert.equal(first.hold,false);
  assert.deepEqual(await reverseApproval(o,event),first);assert.equal((await status()).pendingOrder,null);assert.equal(await count('billing_receipts'),1);
  const next=await reserve();assert.equal(next.status,'reserved');
  await apply(o,r);assert.equal((await status()).account.paidGranted,1);assert.equal((await status()).account.paidAvailable,0);
  await reverseApproval(o,event);assert.equal((await status()).account.hold,true);
  const audit=(await db.query("select receipt from billing_receipts where kind='expired'")).rows[0].receipt;
  assert.equal(audit.source,'paypal_webhook');assert.equal(audit.status,'PAYMENT_APPROVAL_REVERSED');assert.equal('operatorId'in audit,false);
});
await test('approval reversal after capture preserves one grant but blocks spending, including exact replay',async()=>{
  const o=await ready(),r=receipt(o),event=id();await apply(o,r);
  const first=await reverseApproval(o,event);assert.equal(first.status,'fulfilled');assert.equal(first.hold,true);
  assert.deepEqual(await reverseApproval(o,event),first);assert.equal(await count('billing_credit_holds'),1);assert.equal(await count('billing_credit_grants'),1);
  assert.equal((await status()).account.paidAvailable,0);assert.equal((await apply(o,r)).alreadyGranted,true);
});
await test('approval reversal requires exact bound merchant/order/environment and private service authority',async()=>{
  const o=await ready(),event=id();
  await reject(()=>rpc('billing_paypal_reverse_approval',['live',o.orderId,id(),merchant,event]),'22023');
  await reject(()=>rpc('billing_paypal_reverse_approval',['live',o.orderId,o.paypalOrderId,'OTHERCHANT',event]),'22023');
  await reject(()=>rpc('billing_paypal_reverse_approval',['test',o.orderId,o.paypalOrderId,merchant,event]),'42501');
  await reject(()=>rpc('billing_paypal_reverse_approval',['live',o.orderId,o.paypalOrderId,merchant,'bad:event']),'22023');
  for(const role of['anon','authenticated'])await reject(()=>rpc('billing_paypal_reverse_approval',['live',o.orderId,o.paypalOrderId,merchant,event],role),'42501');
  assert.equal((await status()).pendingOrder.orderId,o.orderId);assert.equal(await count('billing_receipts'),0);
});
await test('approval reversal event cannot be reassigned to another local or PayPal order',async()=>{
  const a=await ready(),b=await ready(other),event=id();await reverseApproval(a,event);await reject(()=>reverseApproval(b,event),'PT409');
  assert.equal((await status(other)).pendingOrder.orderId,b.orderId);assert.equal(await count('billing_receipts'),1);
});
await test('refund observed before capture fulfillment binds identity and holds the later grant',async()=>{
  const o=await ready(),r=receipt(o),event=id(),refunded={...r,status:'REFUNDED'};await review(o,refunded,event);await review(o,refunded,event);
  assert.equal((await status()).account.paidGranted,0);assert.equal((await status()).account.hold,true);await reject(()=>close(o),'PT409');
  await apply(o,r);assert.equal((await status()).account.paidGranted,1);assert.equal((await status()).account.paidAvailable,0);
  assert.equal(await count('billing_credit_holds'),1);await reject(()=>reserve(),'PT409');
});
await test('partial refund and dispute retain immutable grants and audited resolution',async()=>{
  const o=await ready(),r=receipt(o);await apply(o,r);const event=id();await review(o,{...r,status:'PARTIALLY_REFUNDED'},event);await review(o,r,id(),'dispute');
  assert.equal(await count('billing_credit_grants'),1);assert.equal(await count('billing_credit_holds'),2);assert.equal((await status()).account.paidAvailable,0);
  await reject(()=>review(o,{...r,status:'PENDING'},id(),'refund'),'22023');await reject(()=>review(o,{...r,amount:1},id(),'dispute'),'22023');
  await reject(()=>review(o,{...r,status:'REFUNDED'},event),'PT409');
});
await test('financial reconciliation continues for locked and deleted owners; new purchases stay blocked',async()=>{
  const o=await ready(),r=receipt(o);await db.query("update profiles set account_status='locked' where id=$1",[owner]);await apply(o,r);
  await reject(()=>reserve(),'42501');await db.query('delete from profiles where id=$1',[owner]);await db.query('delete from auth.users where id=$1',[owner]);
  assert.equal((await apply(o,r)).alreadyGranted,true);await review(o,{...r,status:'REFUNDED'});assert.equal(await count('billing_credit_grants'),1);
});
for(const kind of['reversal','refund_pending'])await test('verified '+kind+' holds credits before grant without inventing a human actor',async()=>{
  const o=await ready(),r=receipt(o);await review(o,r,id(),kind);
  assert.equal((await status()).account.paidGranted,0);assert.equal((await status()).account.hold,true);
  await apply(o,r);assert.equal((await status()).account.paidGranted,1);assert.equal((await status()).account.paidAvailable,0);
  const saved=(await db.query("select kind,receipt from billing_receipts where kind<>'payment'")).rows[0];
  assert.equal(saved.kind,kind==='reversal'?'dispute':'refund');assert.equal(saved.receipt.kind,kind);assert.equal('operatorId'in saved.receipt,false);
});
await test('verified completed refund holds before a lagging COMPLETED capture could grant',async()=>{
  const o=await ready(),r=receipt(o),event=id();await review(o,r,event,'refund');await review(o,r,event,'refund');
  assert.equal((await status()).account.paidGranted,0);assert.equal((await status()).account.hold,true);
  await apply(o,r);assert.equal((await status()).account.paidGranted,1);assert.equal((await status()).account.paidAvailable,0);
  assert.equal(await count('billing_credit_holds'),1);
});
for(const current of['PENDING','REFUNDED','PARTIALLY_REFUNDED','DECLINED','DENIED','FAILED','REVERSED'])await test('verified reversal holds while fresh capture is '+current,async()=>{
  const o=await ready(),r=receipt(o);await review(o,{...r,status:current},id(),'reversal');
  assert.equal((await status()).account.hold,true);assert.equal((await status()).account.paidGranted,0);
  await apply(o,r);assert.equal((await status()).account.paidGranted,1);assert.equal((await status()).account.paidAvailable,0);
  await reject(()=>review(o,{...r,status:'UNKNOWN'},id(),'reversal'),'22023');
});
await test('PayPal histories and provider registry cannot be rewritten or deleted',async()=>{
  const o=await ready(),r=receipt(o);await apply(o,r);
  for(const table of['billing_paypal_orders','billing_paypal_bindings','billing_provider_references']){
    await db.exec('savepoint history');try{await reject(()=>db.query('delete from '+table),'42501');}finally{await db.exec('rollback to savepoint history;release savepoint history');}
  }
});
await test('forward migration preserves historical manual grants and backfills capture reuse protection',async()=>{
  const upgrade=new PGlite();try{
    await installRepositorySchema(upgrade,repo,'20260918130000');
    await upgrade.query('insert into auth.users(id) values($1),($2),($3)',[owner,other,admin]);
    await upgrade.query("insert into profiles(id,display_name,role) values($1,'Old owner','owner'),($2,'New owner','owner'),($3,'Old admin','admin')",[owner,other,admin]);
    const call=async(name,args)=>(await upgrade.query('select '+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') v',args)).rows[0].v;
    const old=await call('billing_direct_reserve_order',[owner,'live',randomUUID(),'profile_1','paypal',{accountKey:'historical-merchant',displayName:'Historical business',paymentUrl:'https://www.paypal.com/ncp/payment/HISTORICAL',address:null}]);
    const capture=id();await call('billing_direct_verify_order',['live',old.orderId,admin,randomUUID(),capture,1200,'usd','Historical verification before the automatic PayPal upgrade.']);
    const snapshot=async()=>Promise.all(['billing_credit_grants','billing_receipts','billing_direct_payments'].map(async t=>(await upgrade.query('select to_jsonb(x) v from '+t+' x')).rows));
    const before=await snapshot();
    await upgrade.exec(fs.readFileSync(path.join(repo,'supabase/migrations/20260918130000_paypal_automatic_payments.sql'),'utf8').replaceAll('\r\n','\n'));
    assert.deepEqual(await snapshot(),before);
    assert.equal((await upgrade.query('select order_id from billing_provider_references')).rows[0].order_id,old.orderId);
    let automatic=await call('billing_paypal_reserve_order',[other,'live',randomUUID(),'profile_1',merchant]);
    automatic=await call('billing_paypal_bind_order',[other,'live',automatic.orderId,id(),merchant]);
    await reject(()=>call('billing_paypal_apply_capture',['live',automatic.orderId,receipt(automatic,capture)]),'PT409');
    assert.equal((await upgrade.query('select count(*)::int n from billing_credit_grants')).rows[0].n,1);
  }finally{await upgrade.close();}
});
console.log('Completed '+passed+' automatic PayPal ledger behavior tests.');
}finally{await db.close();}
