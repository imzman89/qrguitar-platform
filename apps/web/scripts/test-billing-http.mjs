import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import test from 'node:test';
const require=createRequire(import.meta.url),ts=require('typescript');
const modules=new Map();
function load(name){
  if(modules.has(name))return modules.get(name);
  const source=fs.readFileSync(new URL('../lib/'+name+'.ts',import.meta.url),'utf8');
  const output=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const module={exports:{}};modules.set(name,module.exports);
  new Function('require','module','exports',output)(id=>id==='server-only'?{}:id.startsWith('./')?load(id.slice(2)):require(id),module,module.exports);
  modules.set(name,module.exports);return module.exports;
}
const {createBillingHandlers}=load('billing-http');
const {BillingError}=load('billing-service');
const origin='https://www.qrguitar.com';
function post(body,headers={},path='/api/billing/checkout'){
  return new Request(origin+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body,duplex:'half'});
}
function fixture(overrides={},options={}){
  const calls=[];
  const service={offers:async()=>[],status:async(...args)=>{calls.push(['status',...args]);return{freeLimit:5};},checkout:async(...args)=>{calls.push(['checkout',...args]);return{orderId:'order',status:'processing'};},webhook:async(...args)=>{calls.push(['webhook',...args]);return{received:true};},...overrides};
  return{calls,handlers:createBillingHandlers({service:()=>service,...options})};
}
test('unconfigured billing has empty offers and cannot initiate checkout',async()=>{
  const h=createBillingHandlers({service:()=>null});
  assert.deepEqual(await(await h.offers()).json(),{ok:true,offers:[]});
  const response=await h.checkout(post('{}'));assert.equal(response.status,503);assert.equal((await response.json()).code,'billing_disabled');
});
test('checkout passes the exact request and parsed payload to authenticated orchestration',async()=>{
  const {handlers,calls}=fixture(),request=post('{"offerKey":"profile_1","requestId":"exact"}',{Origin:origin,Authorization:'Bearer test-token'});
  const response=await handlers.checkout(request);assert.equal(response.status,200);assert.equal(calls[0][1],request);
  assert.deepEqual(calls[0][2],{offerKey:'profile_1',requestId:'exact'});
  assert.match(response.headers.get('cache-control'),/no-store/);assert.equal(response.headers.get('vary'),'Authorization');
});
for(const headers of [{Origin:'https://evil.test'},{Origin:'null'},{'Sec-Fetch-Site':'cross-site'}])test('cross-origin browser checkout is denied '+JSON.stringify(headers),async()=>{
  const {handlers,calls}=fixture();assert.equal((await handlers.checkout(post('{}',headers))).status,403);assert.equal(calls.length,0);
});
for(const body of ['{','null\u0000',new Uint8Array([0xff,0xfe])])test('malformed JSON/UTF-8 never reaches checkout '+String(body),async()=>{
  const {handlers,calls}=fixture();assert.equal((await handlers.checkout(post(body))).status,400);assert.equal(calls.length,0);
});
for(const headers of [{'Content-Type':'text/plain'},{'Content-Encoding':'gzip'}])test('unsupported request representation is denied '+JSON.stringify(headers),async()=>{
  const {handlers,calls}=fixture();assert.equal((await handlers.checkout(post('{}',headers))).status,415);assert.equal(calls.length,0);
});
test('declared huge request is rejected before reading or touching provider',async()=>{
  const {handlers,calls}=fixture();assert.equal((await handlers.checkout(post('{}',{'Content-Length':'999999999999999999999'}))).status,413);assert.equal(calls.length,0);
});
test('stream limit counts bytes even when Content-Length lies',async()=>{
  let cancelled=false;
  const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(1500));c.enqueue(new Uint8Array(600));},cancel(){cancelled=true;}});
  const {handlers,calls}=fixture();assert.equal((await handlers.checkout(post(stream,{'Content-Length':'2'}))).status,413);assert.equal(calls.length,0);assert.equal(cancelled,true);
});
test('a stalled request body times out and cancels its stream',async()=>{
  let cancelled=false;const stream=new ReadableStream({cancel(){cancelled=true;}});
  const {handlers,calls}=fixture({}, {bodyTimeoutMs:10});
  assert.equal((await handlers.checkout(post(stream))).status,408);assert.equal(calls.length,0);assert.equal(cancelled,true);
});
test('provider/internal errors are sanitized and remain retryable failures',async()=>{
  const {handlers}=fixture({checkout:async()=>{throw new Error('sk_live_secret provider raw response');}});
  const response=await handlers.checkout(post('{}'));assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/sk_live|raw response/);
});
test('authenticated orchestration errors preserve intended 401/403/409 status',async()=>{
  for(const status of [401,403,409]){
    const {handlers}=fixture({checkout:async()=>{throw new BillingError(status,'tested','Safe message','known-order');}});
    const response=await handlers.checkout(post('{}'));assert.equal(response.status,status);assert.deepEqual(await response.json(),{ok:false,code:'tested',message:'Safe message',orderId:'known-order'});
  }
});
test('status passes only one explicit order ID to owner-bound orchestration',async()=>{
  const {handlers,calls}=fixture(),request=new Request(origin+'/api/billing/status?orderId=order');
  assert.equal((await handlers.status(request)).status,200);assert.equal(calls[0][1],request);assert.equal(calls[0][2],'order');
});
for(const suffix of ['?orderId=a&orderId=b','?ownerId=foreign','?environment=test'])test('ambiguous or client-selected status scope is denied '+suffix,async()=>{
  const {handlers,calls}=fixture();assert.equal((await handlers.status(new Request(origin+'/api/billing/status'+suffix))).status,400);assert.equal(calls.length,0);
});
test('webhook retains exact whitespace, Unicode and raw byte sequence for SDK verification',async()=>{
  const bytes=new TextEncoder().encode(' { "text": "🎸é", "other":1 }\r\n'),{handlers,calls}=fixture();
  const response=await handlers.webhook(post(bytes,{'stripe-signature':'t=1,v1=signature'},'/api/billing/webhook'));
  assert.equal(response.status,200);assert.deepEqual(calls[0][1],bytes);assert.equal(calls[0][2],'t=1,v1=signature');
});
test('webhook rejects missing, oversized signatures and empty bodies',async()=>{
  for(const [signature,body] of [[null,'{}'],['x'.repeat(2049),'{}'],['valid','']]){
    const {handlers,calls}=fixture();const response=await handlers.webhook(post(body,signature?{'stripe-signature':signature}:{},'/api/billing/webhook'));
    assert.equal(response.status,400);assert.equal(calls.length,0);
  }
});
test('webhook body limit applies to actual bytes independently of declared length',async()=>{
  const {handlers,calls}=fixture();const response=await handlers.webhook(post(new Uint8Array(512*1024+1),{'stripe-signature':'valid','Content-Length':'1'},'/api/billing/webhook'));
  assert.equal(response.status,413);assert.equal(calls.length,0);
});
test('webhook fulfillment failure is not acknowledged as successful receipt',async()=>{
  const {handlers}=fixture({webhook:async()=>{throw new BillingError(503,'billing_unavailable','Try again.');}});
  const response=await handlers.webhook(post('{}',{'stripe-signature':'valid'},'/api/billing/webhook'));assert.equal(response.status,503);assert.equal((await response.json()).ok,false);
});
