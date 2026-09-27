import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
const root=path.resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url);
function load(file,imports={},processStub){const exports={};new Function('exports','require','process',ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,name=>{if(name in imports)return imports[name];throw Error('Unexpected runtime dependency: '+name);},processStub);return exports;}
const http=load('lib/action-email-sweep-http.ts',{'node:crypto':require('node:crypto')});
const registry=load('lib/content-registry.ts',{'./ui-text-registry':{uiTextEntries:[]},'./ui-text-protection':{protectedUiTextKeys:new Set()}});
const renderer=load('lib/transactional-email-renderer.ts');
const worker=load('lib/action-required-email.ts',{'node:crypto':require('node:crypto')});
const pipeline=load('lib/action-required-email-delivery.ts',{'./content-registry':registry,'./transactional-email-renderer':renderer,'./action-required-email':worker});
const endpoint='https://www.qrguitar.com/api/internal/action-email-sweep',id='11111111-1111-4111-8111-111111111111';
const base={QRGUITAR_ACTION_EMAIL_WORKER_ENABLED:'true',QRGUITAR_ACTION_EMAIL_TRANSPORT_ENABLED:'true',VERCEL:'1',VERCEL_ENV:'production',NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co',QRGUITAR_ACTION_EMAIL_EXPECTED_SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co',VERCEL_GIT_COMMIT_SHA:'a'.repeat(40),QRGUITAR_ACTION_EMAIL_APPROVED_COMMIT:'a'.repeat(40),QRGUITAR_ACTION_EMAIL_CRON_SECRET:'synthetic-test-only-'.repeat(3)};
const request=(url=endpoint,secret=base.QRGUITAR_ACTION_EMAIL_CRON_SECRET,method='POST')=>new Request(url,{method,headers:{authorization:'Bearer '+secret}});
let passed=0;
async function test(name,fn){await fn();console.log('PASS '+name);passed++;}
function fixture({event="claim.ownerReview",serviceRole="provider",env={...base},ready=true,version=http.actionEmailOperationsVersion,content={},cmsError=false,cmsDelay=false,providerHang=false,heartbeatError=false,mutateAdmission=false}={}){
 const calls=[],sent=[];let clients=0,claimed=false,finishCms;
 const db={rpc(name,args){calls.push({name,args});return{async abortSignal(signal){assert.ok(signal instanceof AbortSignal);
  if(name==='action_email_readiness')return{data:{ready,version},error:null};
  if(name==='action_email_worker_heartbeat')return{data:!heartbeatError,error:heartbeatError?{}:null};
  if(name==='claim_action_email'){if(claimed)return{data:null,error:null};claimed=true;return{data:{id,leaseToken:args.p_lease_token},error:null};}
  if(name==='begin_action_email')return{data:{event,to:'synthetic@example.invalid',profileTitle:'Synthetic',subjectId:id,qrCode:event==='claim.approved'||(event.startsWith('service.')&&serviceRole==='provider')?'QRG-SYNTHETIC-OUTCOME':null,...(event.startsWith('service.')&&event!=='service.revisionRequested'?{serviceRole}:{})},error:null};
  if(name==='settle_action_email')return{data:true,error:null};throw Error('Unexpected RPC');
 }};},from(table){assert.equal(table,'site_content');return{select(columns){assert.equal(columns,'content_value');return this;},eq(key,value){assert.equal(key,'content_key');assert.equal(value,'homepage');return this;},abortSignal(signal){assert.ok(signal instanceof AbortSignal);return this;},async maybeSingle(){if(cmsDelay)await new Promise(r=>finishCms=r);if(mutateAdmission)env.QRGUITAR_ACTION_EMAIL_TRANSPORT_ENABLED='false';return{data:{content_value:{content}},error:cmsError?{}:null};}};}};
 const runtime=load('lib/action-email-runtime.ts',{'./supabase-server':{createServerSupabaseClient(){clients++;return db;}},'./action-required-email-delivery':{createActionRequiredEmailPipeline:deps=>pipeline.createActionRequiredEmailPipeline({...deps,databaseTimeoutMs:20,prepareTimeoutMs:10,sendTimeoutMs:15})},'./transactional-email':{async deliverBrevoEmail(...args){sent.push(args);if(providerHang)return new Promise(()=>{});return{ok:true,status:'sent',outcome:'accepted',providerMessageId:'synthetic-receipt'};}},'./site-settings':{publishedSiteSettingsKey:'homepage'},'./action-email-sweep-http':http},{env});
 return{handler:runtime.actionEmailSweep,calls,sent,get clients(){return clients;},finishCms:()=>finishCms?.()};
}
await test('default environment has no DB or provider activity',async()=>{const f=fixture({env:{}});assert.equal((await f.handler(request())).status,503);assert.equal(f.clients,0);});
for(const patch of [{QRGUITAR_ACTION_EMAIL_WORKER_ENABLED:'false'},{QRGUITAR_ACTION_EMAIL_TRANSPORT_ENABLED:'false'},{VERCEL_ENV:'preview'},{VERCEL:'0'},{NODE_ENV:'development'},{NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54321'},{NEXT_PUBLIC_SUPABASE_URL:'https://evil.example'},{QRGUITAR_ACTION_EMAIL_EXPECTED_SUPABASE_URL:'https://otherprojectnotmatching.supabase.co'},{QRGUITAR_ACTION_EMAIL_APPROVED_COMMIT:'b'.repeat(40)},{VERCEL_GIT_COMMIT_SHA:undefined}])await test('runtime refuses misbound admission '+Object.keys(patch)[0],async()=>{const f=fixture({env:{...base,...patch}});assert.equal((await f.handler(request())).status,503);assert.equal(f.clients,0);});
await test('GET and wrong origin/path/query cannot trigger work',async()=>{const f=fixture();for(const req of [request(endpoint,undefined,'GET'),request(endpoint+'?x=1'),request('http://127.0.0.1:3008/api/internal/action-email-sweep'),request('https://preview.vercel.app/api/internal/action-email-sweep')])assert.notEqual((await f.handler(req)).status,200);assert.equal(f.clients,0);});
await test('missing malformed and wrong secrets fail before DB',async()=>{for(const secret of ['', 'short', 'x'.repeat(257),'contains space'.repeat(3)]){const f=fixture({env:{...base,QRGUITAR_ACTION_EMAIL_CRON_SECRET:secret}});assert.equal((await f.handler(request())).status,503);assert.equal(f.clients,0);}const f=fixture();assert.equal((await f.handler(request(endpoint,'wrong'))).status,401);assert.equal(f.clients,0);});
await test('readiness false or wrong version prevents claim and CMS/provider entry',async()=>{for(const cfg of [{ready:false},{version:'old'}]){const f=fixture(cfg);assert.equal((await f.handler(request())).status,503);assert.deepEqual(f.calls.map(c=>c.name),['action_email_readiness']);assert.equal(f.sent.length,0);}});
await test('actual runtime pipeline uses captured transport and persists receipt',async()=>{const f=fixture();const res=await f.handler(request());assert.equal(res.status,200);assert.equal(res.headers.get('cache-control'),'no-store');assert.equal((await res.json()).accepted,1);assert.equal(f.sent.length,1);assert.equal(f.calls.find(c=>c.name==='settle_action_email').args.p_state,'accepted');assert.equal(f.calls.at(-1).name,'action_email_worker_heartbeat');});
await test('CMS error is definite no-send retry',async()=>{const f=fixture({cmsError:true});assert.equal((await (await f.handler(request())).json()).retry,1);assert.equal(f.sent.length,0);});
await test('late published content cannot invoke provider after preparation timeout',async()=>{const f=fixture({cmsDelay:true});assert.equal((await (await f.handler(request())).json()).retry,1);f.finishCms();await new Promise(r=>setImmediate(r));assert.equal(f.sent.length,0);});
await test('transport stall remains unknown with no repeat send',async()=>{const f=fixture({providerHang:true});assert.equal((await (await f.handler(request())).json()).unknown,1);assert.equal(f.sent.length,1);});
await test('transport flag changing during CMS prevents provider entry',async()=>{const f=fixture({mutateAdmission:true});assert.equal((await (await f.handler(request())).json()).retry,1);assert.equal(f.sent.length,0);});
await test('heartbeat loss does not claim success or resend accepted mail',async()=>{const f=fixture({heartbeatError:true});assert.equal((await f.handler(request())).status,503);assert.equal(f.sent.length,1);assert.equal(f.calls.filter(c=>c.name==='settle_action_email').length,1);});
await test('malformed counts and thrown private diagnostics are not exposed',async()=>{for(const run of [async()=>({claimed:0,accepted:1,retry:0,failed:0,unknown:0,suppressed:0}),async()=>{throw Error('secret');}]){const h=http.createActionEmailSweepHandler({environment:()=>base,run});const res=await h(request());assert.equal(res.status,503);assert.equal((await res.text()).includes('secret'),false);}});
await test('pre-outcome database readiness cannot enter the new worker',async()=>{
 const f=fixture({version:'2026-09-27.action-email.1'});assert.equal((await f.handler(request())).status,503);assert.deepEqual(f.calls.map(c=>c.name),['action_email_readiness']);assert.equal(f.sent.length,0);
});
for(const event of ['claim.approved','claim.declined','claim.expired'])await test('actual pipeline prepares '+event+' with canonical outcome destination',async()=>{
 const f=fixture({event});const response=await f.handler(request());assert.equal(response.status,200);assert.equal((await response.json()).accepted,1);assert.equal(f.sent.length,1);assert.equal(f.sent[0][0],'synthetic@example.invalid');
 const document=f.sent[0][1];const expected=event==='claim.approved'?'https://www.qrguitar.com/i/QRG-SYNTHETIC-OUTCOME':'https://www.qrguitar.com/ownership-claim?claim='+id;
 assert.ok(document.htmlContent.includes(expected));assert.ok(document.textContent.includes(expected));assert.equal(f.calls.find(c=>c.name==='settle_action_email').args.p_state,'accepted');
});


await test('pre service-transfer readiness prevents any queue/CMS/provider entry',async()=>{const f=fixture({version:'2026-09-27.action-email.2'});assert.equal((await f.handler(request())).status,503);assert.deepEqual(f.calls.map(c=>c.name),['action_email_readiness']);assert.equal(f.sent.length,0);});
for(const event of ['service.approved','service.declined','service.cancelled','ownership.transferAccepted','ownership.transferCancelled'])await test('actual pipeline prepares '+event+' with recipient status destination',async()=>{
 const f=fixture({event});const response=await f.handler(request());assert.equal(response.status,200);assert.equal((await response.json()).accepted,1);assert.equal(f.sent.length,1);
 const expected=event.startsWith('service.')?'https://www.qrguitar.com/service-work/QRG-SYNTHETIC-OUTCOME?submission='+id:'https://www.qrguitar.com/transfer/'+id;
 assert.ok(f.sent[0][1].textContent.includes(expected));assert.equal(f.calls.find(c=>c.name==='settle_action_email').args.p_state,'accepted');
});
await test('provider cancellation reaches owner service-review destination without private Profile context',async()=>{const f=fixture({event:'service.cancelled',serviceRole:'owner'});assert.equal((await(await f.handler(request())).json()).accepted,1);assert.ok(f.sent[0][1].textContent.includes('https://www.qrguitar.com/service-review/'+id));});
console.log(JSON.stringify({passed,scope:'actual HTTP/runtime/pipeline source with injected process env, captured transport and synthetic DB; no network or real environment mutation'}));
