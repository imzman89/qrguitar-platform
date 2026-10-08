// Real SQL behavior in PGlite; isolated memory database and no provider/network calls.
// One connection proves transactions/constraints/replays, not concurrent scheduling.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite-pg17';
import { installRepositorySchema } from './security/postgres-fixture.mjs';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const db=new PGlite();
await installRepositorySchema(db,repo,'20261007010000'); // Historical paid-Profile contract; current full-schema unlimited free creation and unchanged ledgers are tested in beta-entitlement-transaction.test.mjs.
const owner=randomUUID(),other=randomUUID(),admin=randomUUID();
await db.query('insert into auth.users(id) values($1),($2),($3)',[owner,other,admin]);
await db.query("insert into profiles(id,display_name,role) values($1,'Synthetic owner','owner'),($2,'Synthetic other','owner'),($3,'Synthetic admin','admin')",[owner,other,admin]);
await db.exec("insert into storage.buckets(id,name,public) values('instrument-media','instrument-media',false) on conflict do nothing");
const recipient={accountKey:'synthetic-business',displayName:'Synthetic QRguitar',paymentUrl:'https://venmo.com/synthetic-fixture',address:'synthetic-fixture'};
async function rpc(name,args,role='service_role'){
  await db.exec('savepoint direct_rpc;set local role '+role);
  try{const value=(await db.query('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') value',args)).rows[0].value;
    await db.exec('reset role;release savepoint direct_rpc');return value;
  }catch(error){await db.exec('rollback to savepoint direct_rpc;release savepoint direct_rpc');throw error;}
}
const reject=(run,code)=>assert.rejects(run,error=>error.code===code,'Expected SQLSTATE '+code);
const reserve=(actor=owner,method='venmo',key=randomUUID(),pack='profile_1',account=method==='paypal'?{...recipient,paymentUrl:'https://www.paypal.com/ncp/payment/SYNTHETIC'}:recipient)=>rpc('billing_direct_reserve_order',[actor,'live',key,pack,method,account]);
const status=(actor=owner)=>rpc('billing_direct_status',[actor,'live',null]);
const verify=(order,overrides={})=>rpc('billing_direct_verify_order',['live',order.orderId,overrides.operator??admin,overrides.id??randomUUID(),overrides.reference??('REF-'+order.orderId),overrides.amount??order.offer.amount,overrides.currency??'usd',overrides.reason??'Verified completed gross amount in receiving business account.']);
const review=(order,kind='refund',id=randomUUID(),reference='REF-'+order.orderId)=>rpc('billing_direct_record_review',['live',order.orderId,admin,id,kind,reference,'Verified incoming payment requires a billing review.']);
const close=(order,id=randomUUID())=>rpc('billing_direct_close_order',['live',order.orderId,admin,id,'Checked receiving account; this order remains unpaid.']);
const snapshot=async()=>(await db.query("select jsonb_build_object('orders',(select jsonb_agg(to_jsonb(x) order by id) from billing_orders x),'direct',(select jsonb_agg(to_jsonb(x) order by order_id) from billing_direct_orders x),'payments',(select jsonb_agg(to_jsonb(x) order by order_id) from billing_direct_payments x),'receipts',(select jsonb_agg(to_jsonb(x) order by event_id) from billing_receipts x),'grants',(select jsonb_agg(to_jsonb(x) order by order_id) from billing_credit_grants x),'uses',(select jsonb_agg(to_jsonb(x) order by guitar_id) from billing_credit_consumptions x),'guitars',(select jsonb_agg(to_jsonb(x) order by id) from guitars x),'creates',(select jsonb_agg(to_jsonb(x) order by idempotency_key) from instrument_create_receipts x),'uploads',(select jsonb_agg(to_jsonb(x) order by storage_path) from instrument_staged_uploads x)) value")).rows[0].value;
async function owned(n){for(let i=0;i<n;i++){const code='QRG-SYNTH-'+randomUUID();await db.query("insert into guitars(owner_id,qr_code,permanent_path,name,brand) values($1,$2,$3,'Synthetic existing Profile','Fixture')",[owner,code,'/i/'+code]);}}
async function profile(){const upload='upload-'+randomUUID(),key='create-'+randomUUID(),photo=owner+'/profile-uploads/'+upload+'/image-'+randomUUID()+'.jpg';
  await db.query("insert into storage.objects(bucket_id,name,metadata) values('instrument-media',$1,'{\"size\":100,\"mimetype\":\"image/jpeg\"}')",[photo]);
  await rpc('register_staged_instrument_upload',[owner,upload,'instrument-media',photo]);
  return {key,upload,payload:{guitar:{name:'Synthetic Guitar',brand:'Fixture',model:'Fixture',year:null,serial_number:null,builder:null,location:null,visibility:'private',summary:'',hero_image_path:photo},media:[{storage_path:photo,alt:'Synthetic photo',sort_order:0}],documents:[],specs:[],service:null,show_serial_public:false,owner_name:''}};
}
const create=f=>rpc('create_instrument_profile',[owner,f.key,f.upload,f.payload,false,'Synthetic owner','live']);
let passed=0;async function test(name,fn){await db.exec('begin');try{await fn();passed++;console.log('PASS '+name);}finally{await db.exec('rollback');}}
try{
await test('every direct table and helper is private; only explicit RPCs are service executable',async()=>{
  for(const table of ['billing_direct_orders','billing_direct_claims','billing_direct_payments'])for(const role of ['anon','authenticated','service_role']){
    assert.equal((await db.query("select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') allowed",[role,'public.'+table])).rows[0].allowed,false);
  }
  const funcs=(await db.query("select oid::regprocedure::text signature,proname from pg_proc where pronamespace='public'::regnamespace and (proname like 'billing_direct_%' or proname like '_billing_direct_%')")).rows;
  for(const f of funcs)for(const role of ['anon','authenticated','service_role'])assert.equal((await db.query("select has_function_privilege($1,$2,'EXECUTE') allowed",[role,f.signature])).rows[0].allowed,role==='service_role'&&f.proname.startsWith('billing_direct_'));
});
for(const method of ['venmo','cashapp','zelle','paypal'])for(const [pack,amount,credits] of [['profile_1',1200,1],['profile_10',5000,10],['profile_25',9900,25]])await test(method+' '+pack+' derives approved permanent pack from key',async()=>{
  const o=await reserve(owner,method,randomUUID(),pack);assert.deepEqual(o.offer,{key:pack,version:1,currency:'usd',amount,credits});
  assert.equal(o.provider,method);assert.equal(o.status,'open');assert.equal(o.verification,null);
  assert.equal((await status()).account.paidGranted,0);assert.equal((await status()).account.freeLimit,5);
});
await test('malformed receiver, unsupported provider/pack and wrong DB environment fail closed',async()=>{
  for(const account of [{...recipient,accountKey:''},{...recipient,paymentUrl:'javascript:alert(1)'},{...recipient,address:null,paymentUrl:null},{...recipient,extra:true}])await reject(()=>reserve(owner,'venmo',randomUUID(),'profile_1',account),'22023');
  await reject(()=>reserve(owner,'unsupported'),'22023');await reject(()=>reserve(owner,'venmo',randomUUID(),'profile_100'),'22023');
  await reject(()=>reserve(owner,'paypal',randomUUID(),'profile_1',{...recipient,paymentUrl:'https://paypal.me/personal'}),'22023');
  await reject(()=>reserve(owner,'paypal',randomUUID(),'profile_1',{...recipient,paymentUrl:'https://sandbox.paypal.com/ncp/payment/SYNTHETIC'}),'22023');
  await reject(()=>rpc('billing_direct_reserve_order',[owner,'test',randomUUID(),'profile_1','venmo',recipient]),'42501');assert.equal((await status()).pendingOrder,null);
});
await test('same request replays, changes conflict, and find recovers original after config rotation',async()=>{
  const key=randomUUID(),o=await reserve(owner,'venmo',key);assert.deepEqual(await reserve(owner,'venmo',key),o);
  await reject(()=>reserve(owner,'cashapp',key),'PT409');await reject(()=>reserve(owner,'venmo',key,'profile_10'),'PT409');
  await reject(()=>reserve(owner,'venmo',key,'profile_1',{...recipient,displayName:'Changed'}),'PT409');
  assert.deepEqual((await rpc('billing_direct_find_order',[owner,'live',key])).order,o);
  assert.equal((await rpc('billing_direct_find_order',[other,'live',key])).order,null);
  await reject(()=>rpc('billing_direct_get_order',[other,'live',o.orderId]),'P0002');
  await reject(()=>rpc('billing_direct_status',[other,'live',o.orderId]),'P0002');
});
await test('single unresolved order spans direct methods and Stripe; legacy account status stays parseable',async()=>{
  const o=await reserve();await reject(()=>reserve(owner,'cashapp'),'PT409');
  const offer={key:'profile_1',version:1,amount:1200,credits:1,currency:'usd',priceId:'price_synthetic'};
  await rpc('billing_register_offer',['live',offer]);await reject(()=>rpc('billing_reserve_order',[owner,'live',randomUUID(),offer]),'PT409');
  assert.equal((await rpc('billing_account_status',[owner,'live'])).unresolvedOrder,null);
  assert.equal((await status()).pendingOrder.orderId,o.orderId);
});
await test('payment claims are owner scoped, append-only, and never grant credits or payment identities',async()=>{
  const o=await reserve(),id=randomUUID();await reject(()=>rpc('billing_direct_claim_order',[other,'live',o.orderId,id,'Untrusted claim']),'P0002');
  const claimed=await rpc('billing_direct_claim_order',[owner,'live',o.orderId,id,'Customer says sent']);
  assert.equal(claimed.claim.reference,'Customer says sent');assert.equal(claimed.verification,null);
  assert.deepEqual(await rpc('billing_direct_claim_order',[owner,'live',o.orderId,id,'Customer says sent']),claimed);
  await reject(()=>rpc('billing_direct_claim_order',[owner,'live',o.orderId,id,'Changed details']),'PT409');
  for(const reference of ['Customer says sent','Different note',''])await reject(()=>rpc('billing_direct_claim_order',[owner,'live',o.orderId,randomUUID(),reference]),'PT409');
  await db.exec('savepoint unique_claim');
  try{await reject(()=>db.query('insert into billing_direct_claims(id,order_id,reference) values($1,$2,$3)',[randomUUID(),o.orderId,'Bypass attempt']),'23505');}
  finally{await db.exec('rollback to savepoint unique_claim;release savepoint unique_claim');}
  assert.equal((await db.query('select count(*)::int n from billing_direct_claims where order_id=$1',[o.orderId])).rows[0].n,1);
  assert.equal((await status()).account.paidGranted,0);assert.equal((await snapshot()).payments,null);assert.equal((await snapshot()).receipts,null);
});
await test('an empty optional claim note is accepted once and original request replays after verification',async()=>{
  const o=await reserve(),id=randomUUID();const empty=await rpc('billing_direct_claim_order',[owner,'live',o.orderId,id,'']);assert.equal(empty.claim.reference,'');
  await verify(o);const replay=await rpc('billing_direct_claim_order',[owner,'live',o.orderId,id,'']);assert.equal(replay.claim.claimId,id);assert.equal(replay.status,'fulfilled');
  await reject(()=>rpc('billing_direct_claim_order',[owner,'live',o.orderId,randomUUID(),'']),'PT409');assert.equal((await status()).account.paidGranted,1);
});
await test('approved business/enterprise plans cannot be sold unnecessary credits at SQL boundary',async()=>{
  for(const plan of ['business','enterprise']){await db.query('update profiles set plan=$2 where id=$1',[owner,plan]);await reject(()=>reserve(),'PT409');}
  assert.equal((await status()).account.commercialExempt,true);assert.equal((await status()).pendingOrder,null);
});
await test('isolated test database accepts only PayPal sandbox recipients',async()=>{
  await db.query('delete from profiles where id in ($1,$2,$3)',[owner,other,admin]);await db.query('delete from auth.users where id in ($1,$2,$3)',[owner,other,admin]);
  await db.exec("update billing_instance_config set create_environment='test' where singleton");await db.query('insert into auth.users(id) values($1)',[owner]);
  await reject(()=>rpc('billing_direct_reserve_order',[owner,'test',randomUUID(),'profile_1','paypal',{...recipient,paymentUrl:'https://www.paypal.com/ncp/payment/SYNTHETIC'}]),'22023');
  const order=await rpc('billing_direct_reserve_order',[owner,'test',randomUUID(),'profile_1','paypal',{...recipient,paymentUrl:'https://www.sandbox.paypal.com/ncp/payment/SYNTHETIC'}]);assert.equal(order.environment,'test');
});
await test('only active real admin can approve exact gross amount with actual reference and reason',async()=>{
  const o=await reserve();for(const patch of [{operator:owner},{operator:randomUUID()}])await reject(()=>verify(o,patch),'42501');
  for(const patch of [{amount:1199},{amount:1201},{currency:'eur'},{reference:'-'},{reason:'ok'}])await reject(()=>verify(o,patch),'22023');
  await db.query("update profiles set account_status='locked' where id=$1",[admin]);await reject(()=>verify(o),'42501');
  assert.equal((await status()).account.paidGranted,0);assert.equal((await snapshot()).payments,null);
});
await test('same/different verification retries grant once and preserve first admin audit',async()=>{
  const o=await reserve(owner,'venmo',randomUUID(),'profile_10'),id=randomUUID();const a=await verify(o,{id});assert.equal(a.granted,true);
  assert.equal((await verify(o,{id})).alreadyGranted,true);assert.equal((await verify(o)).alreadyGranted,true);
  assert.equal(a.verification.operatorId,admin);assert.equal((await status()).account.paidGranted,10);assert.equal((await status()).pendingOrder,null);
  await reject(()=>verify(o,{id,reason:'Changed audit explanation'}),'PT409');await reject(()=>verify(o,{reference:'DIFFERENT'}),'PT409');
  assert.equal((await db.query('select count(*)::int n from billing_credit_grants')).rows[0].n,1);
});
await test('normalized receipt cannot grant another owner/order even after receiving-account key rotation',async()=>{
  const a=await reserve();await verify(a,{reference:'Receipt-ABC 123'});
  const b=await reserve(other,'venmo',randomUUID(),'profile_1',{...recipient,accountKey:'rotated-key'});
  await reject(()=>verify(b,{reference:'receiptabc123'}),'PT409');assert.equal((await status(other)).account.paidGranted,0);
});
await test('provider namespace permits unrelated providers to use same reference',async()=>{
  const a=await reserve();await verify(a,{reference:'provider-ref-123'});const b=await reserve(other,'cashapp');
  await verify(b,{reference:'provider-ref-123'});assert.equal((await status(other)).account.paidGranted,1);
});
await test('verification decision identity cannot be reused across orders',async()=>{
  const id=randomUUID(),a=await reserve();await verify(a,{id});const b=await reserve(other);
  await reject(()=>verify(b,{id}),'PT409');assert.equal((await status(other)).account.paidGranted,0);
});
await test('close is audited and replayable; late verified money grants once into a hold',async()=>{
  const o=await reserve(),id=randomUUID();assert.equal((await close(o,id)).status,'expired');assert.equal((await close(o,id)).status,'expired');
  assert.equal((await status()).pendingOrder,null);const result=await verify(o);assert.equal(result.status,'fulfilled');assert.equal(result.hold,true);
  await verify(o);assert.equal((await status()).account.paidGranted,1);assert.equal((await status()).account.paidAvailable,0);
  await reject(()=>close(o),'PT409');
});
await test('refund before verification binds original receipt and keeps eventual grant held',async()=>{
  const o=await reserve(),id=randomUUID();await review(o,'refund',id);await review(o,'refund',id);
  await verify(o);const s=await status();assert.equal(s.account.paidGranted,1);assert.equal(s.account.paidAvailable,0);assert.equal(s.account.hold,true);
  await reject(()=>reserve(),'PT409');await reject(()=>close(o),'PT409');
});
await test('refund/dispute holds use existing audited resolution and do not erase consumed history',async()=>{
  await owned(5);const o=await reserve(owner,'venmo',randomUUID(),'profile_10');await verify(o);await create(await profile());
  const before=await snapshot(),id=randomUUID();await review(o,'refund',id);const after=await snapshot();assert.deepEqual(after.uses,before.uses);assert.deepEqual(after.guitars,before.guitars);
  assert.equal((await status()).account.paidRemaining,9);assert.equal((await status()).account.paidAvailable,0);
  await rpc('billing_resolve_review',[owner,'live','direct:review:'+id,admin,randomUUID(),'release','Reviewed and resolved original payment issue.']);
  assert.equal((await status()).account.paidAvailable,9);await review(o,'refund',id);assert.equal((await status()).account.hold,false);
});
await test('5th Profile is free; 6th consumes one credit; successful create replay never spends twice',async()=>{
  await owned(4);await verify(await reserve());await create(await profile());assert.equal((await status()).account.paidConsumed,0);
  const f=await profile(),result=await create(f);assert.equal((await status()).account.paidConsumed,1);assert.equal((await create(f)).qrCode,result.qrCode);
  assert.equal((await create({...f,key:'create-'+randomUUID()})).qrCode,result.qrCode);assert.equal((await status()).account.paidConsumed,1);
  const exhausted=await profile(),before=await snapshot();await reject(()=>create(exhausted),'QG001');assert.deepEqual(await snapshot(),before);
});
await test('owners at the free allowance keep every Profile but need credit for the next create',async()=>{
  await owned(5);const f=await profile(),before=await snapshot();await reject(()=>create(f),'QG001');assert.deepEqual(await snapshot(),before);
  assert.equal((await status()).account.ownedProfiles,5);assert.equal((await status()).account.freeRemaining,0);
  await verify(await reserve());await create(f);assert.equal((await status()).account.ownedProfiles,6);
});
await test('ownership transfer never spends or restores a purchased credit',async()=>{
  await owned(5);await verify(await reserve());const created=await create(await profile());
  await db.query('update guitars set owner_id=$2 where qr_code=$1',[created.qrCode,other]);
  assert.equal((await status()).account.paidConsumed,1);assert.equal((await status(other)).account.paidConsumed,0);assert.equal((await status(other)).account.paidGranted,0);
});
await test('downstream grant failure rolls back verified identity, receipt and order atomically',async()=>{
  const o=await reserve(),before=await snapshot();await db.exec("create function qa_direct_failure() returns trigger language plpgsql as $$begin raise exception 'synthetic failure';end$$;create trigger qa_direct_failure before insert on billing_credit_grants for each row execute function qa_direct_failure()");
  await assert.rejects(()=>verify(o),/synthetic failure/);assert.deepEqual(await snapshot(),before);
});
await test('admin queue is bounded and UUID lookup reaches older closed orders without leaking across environments',async()=>{
  const old=await reserve();await close(old);await reject(()=>rpc('billing_direct_list_orders',[owner,'live']),'42501');
  const queue=await rpc('billing_direct_list_orders',[admin,'live']);assert.equal(queue.orders.length,1);assert.equal(queue.hasMore,false);
  for(let i=0;i<100;i++){const id=randomUUID();await db.query('insert into auth.users(id) values($1)',[id]);await reserve(id);}
  const limited=await rpc('billing_direct_list_orders',[admin,'live']);assert.equal(limited.orders.length,100);assert.equal(limited.hasMore,true);
  assert.equal(limited.orders.some(order=>order.orderId===old.orderId),false);
  await reject(()=>rpc('billing_direct_list_orders',[owner,'live',old.orderId]),'42501');
  const exact=await rpc('billing_direct_list_orders',[admin,'live',old.orderId]);assert.equal(exact.orders.length,1);assert.equal(exact.orders[0].orderId,old.orderId);assert.equal(exact.orders[0].status,'expired');assert.equal(exact.hasMore,false);
  assert.deepEqual(await rpc('billing_direct_list_orders',[admin,'live',randomUUID()]),{orders:[],hasMore:false});
  assert.deepEqual(await rpc('billing_direct_list_orders',[admin,'test',old.orderId]),{orders:[],hasMore:false});
});
console.log('Completed '+passed+' direct billing SQL behavior cases. No live/provider calls.');
}finally{await db.close();}
