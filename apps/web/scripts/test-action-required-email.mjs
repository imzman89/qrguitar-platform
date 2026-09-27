import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url),root=path.resolve(import.meta.dirname,'..');
const source=fs.readFileSync(path.join(root,'lib/action-required-email.ts'),'utf8');
const module={exports:{}};new Function('module','exports','require',ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)(module,module.exports,require);
const {createActionEmailWorker,actionEmailInput}=module.exports;
const id='10000000-0000-4000-8000-000000000001',subject='20000000-0000-4000-8000-000000000002',lease='30000000-0000-4000-8000-000000000003';
const payload={event:'claim.ownerReview',to:'owner@example.invalid',profileTitle:'Synthetic Profile',subjectId:subject};
let passed=0;
async function test(name,run){await run();console.log('PASS '+name);passed++;}
function fixture({enabled=true,dispatch=payload,result={outcome:'accepted',providerMessageId:'synthetic-receipt'},fail='',hang='',repeat=false,prepare}={}){
 const calls=[],sent=[];let claimed=false;
 const worker=createActionEmailWorker({enabled,uuid:()=>lease,databaseTimeoutMs:20,sendTimeoutMs:20,prepareTimeoutMs:10,prepare,database:{async rpc(name,args,signal){calls.push({name,args});assert.ok(signal instanceof AbortSignal);if(name===fail)return{error:{private:'not exposed'},data:null};if(name===hang)return new Promise(()=>{});if(name==='claim_action_email'){if(claimed&&!repeat)return{data:null,error:null};claimed=true;return{data:{id,leaseToken:lease},error:null};}if(name==='begin_action_email')return{data:dispatch,error:null};return{data:true,error:null};}},send:async(input,signal)=>{sent.push(input);assert.ok(signal instanceof AbortSignal);if(hang==='send')return new Promise(()=>{});if(result==='throw')throw Error('private provider detail');return result;}});
 return{worker,calls,sent};
}
await test('default disabled adapter never touches database or transport',async()=>{const f=fixture({enabled:undefined});const d=createActionEmailWorker({database:{rpc:async()=>{throw Error('Must not run');}},send:async()=>{throw Error('Must not send');}});assert.equal((await d.run()).disabled,true);assert.equal((await fixture({enabled:false}).worker.run()).disabled,true);});
for(const event of ['claim.ownerReview','claim.moreInfo','claim.approved','claim.declined','claim.expired','service.revisionRequested'])await test('strict safe payload and actionable canonical URL '+event,async()=>{
 const p=actionEmailInput({...payload,event,qrCode:'QRG-TEST',privateNote:'secret',evidence:['secret'],ownerName:'secret',token:'secret'},id),destination=new URL(p.actionUrl);
 assert.equal(destination.origin,'https://www.qrguitar.com');
 if(event==='service.revisionRequested'){assert.equal(destination.pathname,'/service-work/QRG-TEST');assert.equal(destination.searchParams.get('submission'),subject);assert.equal(p.claimUrl,undefined);assert.deepEqual(Object.keys(p).sort(),['actionUrl','event','idempotencyKey','profileTitle','to']);}
 else if(event==='claim.approved'){assert.equal(p.claimUrl,'https://www.qrguitar.com/ownership-claim?claim='+subject);assert.deepEqual(Object.keys(p).sort(),['actionUrl','claimUrl','event','idempotencyKey','profileTitle','to']);assert.equal(destination.pathname,'/i/QRG-TEST');assert.equal(destination.search,'');}
 else{assert.equal(p.claimUrl,undefined);assert.deepEqual(Object.keys(p).sort(),['actionUrl','event','idempotencyKey','profileTitle','to']);assert.equal(destination.pathname,'/ownership-claim');assert.equal(destination.searchParams.get('claim'),subject);}
 assert.doesNotMatch(JSON.stringify(p),/secret/);
});
const outcomeCases=[
 {event:'service.approved',serviceRole:'provider',qrCode:'QRG-TEST',pathname:'/service-work/QRG-TEST',parameter:'submission'},
 {event:'service.declined',serviceRole:'provider',qrCode:'QRG-TEST',pathname:'/service-work/QRG-TEST',parameter:'submission'},
 {event:'service.cancelled',serviceRole:'provider',qrCode:'QRG-TEST',pathname:'/service-work/QRG-TEST',parameter:'submission'},
 {event:'service.cancelled',serviceRole:'owner',qrCode:null,pathname:'/service-review/'+subject,parameter:null},
 {event:'ownership.transferAccepted',qrCode:null,pathname:'/transfer/'+subject,parameter:null},
 {event:'ownership.transferCancelled',qrCode:null,pathname:'/transfer/'+subject,parameter:null}
];
for(const dispatch of outcomeCases)await test('terminal service or transfer URL '+dispatch.event+' '+(dispatch.serviceRole||'participant'),async()=>{
 const p=actionEmailInput({...payload,...dispatch,privateNote:'secret',evidence:['secret'],token:'secret'},id),destination=new URL(p.actionUrl);
 assert.equal(destination.origin,'https://www.qrguitar.com');assert.equal(destination.pathname,dispatch.pathname);assert.equal(destination.searchParams.size,dispatch.parameter?1:0);if(dispatch.parameter)assert.equal(destination.searchParams.get(dispatch.parameter),subject);
 assert.equal(p.claimUrl,undefined);assert.deepEqual(Object.keys(p).sort(),['actionUrl','event','idempotencyKey','profileTitle','to']);assert.doesNotMatch(JSON.stringify(p),/secret|serviceRole/);
});
for(const dispatch of [
 {event:'service.approved',qrCode:'QRG-TEST'},
 {event:'service.approved',serviceRole:'owner',qrCode:null},
 {event:'service.declined',serviceRole:'owner',qrCode:null},
 {event:'service.cancelled',serviceRole:'owner',qrCode:'QRG-TEST'},
 {event:'service.cancelled',serviceRole:'provider',qrCode:null},
 {event:'ownership.transferAccepted',qrCode:'QRG-TEST'},
 {event:'ownership.transferCancelled',qrCode:null,serviceRole:'provider'},
 {event:'service.revisionRequested',qrCode:'QRG-TEST',serviceRole:'provider'}
])await test('invalid outcome contract cannot reach transport '+dispatch.event+' '+(dispatch.serviceRole||'missing'),async()=>{const f=fixture({dispatch:{...payload,...dispatch}});assert.equal((await f.worker.run()).failed,1);assert.equal(f.sent.length,0);});
for(const patch of [{event:'service.resubmitted'},{subjectId:'bad'},{to:'victim@invalid\r\nBcc:other@example.invalid'},{event:'service.revisionRequested',qrCode:'../../admin'},{event:'claim.approved',qrCode:null},{profileTitle:undefined}])await test('invalid dispatch cannot reach transport '+Object.keys(patch).join(','),async()=>{const f=fixture({dispatch:{...payload,...patch}});const r=await f.worker.run();assert.equal(r.failed,1);assert.equal(f.sent.length,0);});
await test('current-authority suppression never calls sender',async()=>{const f=fixture({dispatch:null});assert.equal((await f.worker.run()).suppressed,1);assert.equal(f.sent.length,0);});
for(const event of ['service.revisionRequested','claim.approved'])for(const qrCode of ['qrg-test','QRG-test','QRG--TEST','QRG-'+ 'X'.repeat(77)])await test('renderer-incompatible QR path fails before transport '+event+' '+qrCode.length,async()=>{const f=fixture({dispatch:{...payload,event,qrCode}});assert.equal((await f.worker.run()).failed,1);assert.equal(f.sent.length,0);});
await test('accepted requires provider receipt and persists before success count',async()=>{const f=fixture();assert.equal((await f.worker.run()).accepted,1);assert.equal(f.sent.length,1);assert.equal(f.calls.find(c=>c.name==='settle_action_email').args.p_provider_message_id,'synthetic-receipt');});
for(const result of [{outcome:'accepted'},{outcome:'accepted',providerMessageId:' '},{outcome:'accepted',providerMessageId:'bad\r\nreceipt'},{outcome:'unknown'},'throw'])await test('ambiguous outcome remains unknown '+JSON.stringify(result),async()=>{const f=fixture({result});assert.equal((await f.worker.run()).unknown,1);assert.equal(f.sent.length,1);});
await test('definite rejection alone can request bounded retry',async()=>{const f=fixture({result:{outcome:'rejected',retryable:true,retryAfterSeconds:999999}});assert.equal((await f.worker.run()).retry,1);assert.equal(f.calls.find(c=>c.name==='settle_action_email').args.p_retry_after_seconds,21600);});
await test('provider timeout quarantines unknown',async()=>{const f=fixture({hang:'send'});assert.equal((await f.worker.run()).unknown,1);assert.equal(f.sent.length,1);});
for(const fail of ['claim_action_email','begin_action_email','settle_action_email'])await test('failed persistence never announces success '+fail,async()=>{const f=fixture({fail});await assert.rejects(f.worker.run(),/persistence unavailable/);assert.equal(f.sent.length,fail==='settle_action_email'?1:0);});
await test('database timeout bounded before transport',async()=>{const f=fixture({hang:'begin_action_email'});await assert.rejects(f.worker.run(),/timed out/);assert.equal(f.sent.length,0);});
await test('worker run processes at most three intents',async()=>{const f=fixture({repeat:true});assert.equal((await f.worker.run()).claimed,3);assert.equal(f.sent.length,3);});
await test('preflight failure is definite no-send retry',async()=>{const f=fixture({prepare:async()=>{throw Error('Content unavailable');}});assert.equal((await f.worker.run()).retry,1);assert.equal(f.sent.length,0);});
await test('late preflight resolution is aborted and never invokes transport closure',async()=>{let resolve,transport=0,signal;const f=fixture({prepare:async(_,s)=>{signal=s;return new Promise(r=>{resolve=r;});}});assert.equal((await f.worker.run()).retry,1);assert.equal(signal.aborted,true);resolve(async()=>{transport++;return{outcome:'accepted',providerMessageId:'too-late'};});await new Promise(r=>setTimeout(r,25));assert.equal(transport,0);assert.equal(f.sent.length,0);});
await test('prepared provider timeout is still unknown, never a preflight retry',async()=>{let transport=0;const f=fixture({prepare:async()=>async()=>{transport++;return new Promise(()=>{});}});assert.equal((await f.worker.run()).unknown,1);assert.equal(transport,1);});
console.log(JSON.stringify({passed,scope:'actual TypeScript worker with synthetic transport and DB receipts; no runtime launch/provider'}));
