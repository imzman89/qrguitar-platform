import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const root=path.resolve(import.meta.dirname,'..');
const source=fs.readFileSync(path.join(root,'lib/action-email-operator.ts'),'utf8');
const module={exports:{}};new Function('module','exports',ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)(module,module.exports);
const {createActionEmailOperator}=module.exports;
const id='10000000-0000-4000-8000-000000000001',actorId='20000000-0000-4000-8000-000000000002';
const stamp='2026-09-27T10:15:00.123456+00:00';
const status={id,event:'claim.ownerReview',state:'unknown',attempts:1,claimId:actorId,submissionId:null,updatedAt:stamp,createdAt:stamp,nextAttemptAt:stamp,code:'provider_acceptance_unknown',canRetry:false,canReconcile:true};
const page={captureEnabled:false,dispatchEnabled:false,queued:0,unknown:1,failed:0,accepted:0,inFlight:0,suppressed:0,oldestPendingAt:null,total:1,offset:0,limit:50,items:[status]};
const input={intentId:id,expectedUpdatedAt:stamp,resolution:'confirmed_not_accepted',reason:'Provider log confirms no acceptance.'};
let passed=0;
async function test(name,run){await run();console.log('PASS '+name);passed++;}
function fixture({enabled=true,auth={actorId,envAdmin:false},data,fail=false,hang=false,hangAuth=false}={}){
 const calls=[];let authCalls=0,aborted=false;
 const operator=createActionEmailOperator({enabled,timeoutMs:10,authorize:async signal=>{authCalls++;if(hangAuth){signal.addEventListener('abort',()=>{aborted=true;});return new Promise(()=>{});}return auth;},database:{async rpc(name,args,signal){calls.push({name,args});if(hang){signal.addEventListener('abort',()=>{aborted=true;});return new Promise(()=>{});}return{data:data===undefined?(name==='action_email_admin_status'?page:{...status,state:'retry',canReconcile:false}):data,error:fail?{private:'secret error'}:null};}}});
 return{operator,calls,get authCalls(){return authCalls;},get aborted(){return aborted;}};
}
await test('default disabled touches no auth, DB or transport',async()=>{const f=fixture({enabled:false});assert.equal((await f.operator.list()).code,'disabled');assert.equal((await f.operator.reconcile(input)).code,'disabled');assert.equal(f.calls.length,0);assert.equal(f.authCalls,0);});
await test('missing administrator cannot list or reconcile',async()=>{const f=fixture({auth:null});assert.equal((await f.operator.list()).code,'forbidden');assert.equal((await f.operator.reconcile(input)).code,'forbidden');assert.equal(f.calls.length,0);});
await test('bad authenticated actor denied before DB',async()=>{const f=fixture({auth:{actorId:'bad',envAdmin:true}});assert.equal((await f.operator.reconcile(input)).code,'forbidden');assert.equal(f.calls.length,0);});
await test('status allowlist strips provider and private extras',async()=>{const f=fixture({data:{...page,credentials:'secret',items:[{...status,to:'private@example.invalid',note:'private'}]}});const r=await f.operator.list();assert.equal(r.ok,true);assert.equal(JSON.stringify(r).includes('secret'),false);assert.equal(JSON.stringify(r).includes('private'),false);});
await test('pagination rejects malformed offsets without DB',async()=>{const f=fixture();for(const offset of [-1,1.2,1000001,NaN,'1'])assert.equal((await f.operator.list(offset)).code,'invalid');assert.equal(f.calls.length,0);});
await test('status malformed page is not presented as healthy',async()=>{for(const data of [null,{...page,items:Array(51).fill(status)},{...page,unknown:-1},{...page,offset:50},{...page,items:[{...status,event:'unapproved'}]}])assert.equal((await fixture({data}).operator.list()).code,'unavailable');});
await test('operator supplies actor solely from server authorization',async()=>{const f=fixture();const r=await f.operator.reconcile({...input,actorId:id,envAdmin:true});assert.equal(r.ok,true);assert.equal(f.calls[0].args.p_actor_id,actorId);assert.equal(f.calls[0].args.p_env_admin,false);assert.equal(f.calls[0].args.p_expected_updated_at,stamp);});
await test('evidence and exact timestamp required before mutation',async()=>{for(const patch of [{reason:'short'},{reason:'x'.repeat(1001)},{reason:'line\nbreak text'},{intentId:'bad'},{expectedUpdatedAt:'today'},{resolution:'resend'},{providerMessageId:'unexpected'}]){const f=fixture();assert.equal((await f.operator.reconcile({...input,...patch})).code,'invalid');assert.equal(f.calls.length,0);}});
await test('provider acceptance needs bounded receipt',async()=>{for(const receipt of [undefined,' ','x'.repeat(301),'bad\r\nreceipt']){const f=fixture();assert.equal((await f.operator.reconcile({...input,resolution:'confirmed_accepted',providerMessageId:receipt})).code,'invalid');assert.equal(f.calls.length,0);}});
await test('accepted receipt projects status without claiming inbox delivery',async()=>{const f=fixture({data:{...status,state:'accepted',canReconcile:false,providerMessageId:'hidden-receipt'}});const r=await f.operator.reconcile({...input,resolution:'confirmed_accepted',providerMessageId:' external-receipt '});assert.equal(r.ok,true);assert.equal(f.calls[0].args.p_provider_message_id,'external-receipt');assert.equal('providerMessageId' in r.status,false);});
await test('mutation errors are unconfirmed and never auto-replayed',async()=>{const f=fixture({fail:true});const r=await f.operator.reconcile(input);assert.equal(r.code,'unconfirmed');assert.equal(f.calls.length,1);assert.equal(JSON.stringify(r).includes('secret'),false);});
await test('mutation timeout aborts adapter signal without retry',async()=>{const f=fixture({hang:true});assert.equal((await f.operator.reconcile(input)).code,'unconfirmed');assert.equal(f.aborted,true);assert.equal(f.calls.length,1);});
await test('auth timeout cannot enter mutation',async()=>{const f=fixture({hangAuth:true});assert.equal((await f.operator.reconcile(input)).code,'unavailable');assert.equal(f.calls.length,0);assert.equal(f.aborted,true);});
await test('status failure remains unavailable rather than zero counts',async()=>{assert.equal((await fixture({fail:true}).operator.list()).code,'unavailable');});
await test('invalid or wrong mutation receipt never produces success',async()=>{for(const data of [null,{...status,id:actorId},{...status,state:'unknown'},{...status,attempts:8}])assert.equal((await fixture({data}).operator.reconcile(input)).code,'unconfirmed');});
await test('historical suppression and exhausted budget receipts remain terminal',async()=>{for(const state of ['suppressed','failed']){const r=await fixture({data:{...status,state,canReconcile:false}}).operator.reconcile(input);assert.equal(r.ok,true);assert.equal(r.status.state,state);}});
for(const event of ['claim.approved','claim.declined','claim.expired']){
 await test(event+' operator receipt projects only safe claim identity and exact revision',async()=>{
  const receipt={...status,event,to:'private@example.invalid',evidenceUrl:'private-storage',decisionNote:'private-note',providerMessageId:'private-provider-receipt'};
  const f=fixture({data:{...page,items:[receipt]}}), result=await f.operator.list();
  assert.equal(result.ok,true);assert.equal(result.status.items[0].event,event);assert.equal(result.status.items[0].claimId,actorId);assert.equal(result.status.items[0].updatedAt,stamp);assert.doesNotMatch(JSON.stringify(result),/private/);
  const accepted=await fixture({data:{...receipt,state:'accepted',canReconcile:false}}).operator.reconcile({...input,resolution:'confirmed_accepted',providerMessageId:'synthetic-reviewed-receipt'});
  assert.equal(accepted.ok,true);assert.equal(accepted.status.event,event);assert.doesNotMatch(JSON.stringify(accepted),/private/);
 });
 await test(event+' invalid subject correlation cannot be exposed or acknowledged',async()=>{
  for(const patch of [{claimId:null},{claimId:'not-an-id'},{submissionId:id}]){
   assert.equal((await fixture({data:{...page,items:[{...status,event,...patch}]}}).operator.list()).code,'unavailable');
   assert.equal((await fixture({data:{...status,event,state:'accepted',...patch}}).operator.reconcile({...input,resolution:'confirmed_accepted',providerMessageId:'synthetic-reviewed-receipt'})).code,'unconfirmed');
  }
 });
}


for(const event of ['service.approved','service.declined','service.cancelled','ownership.transferAccepted','ownership.transferCancelled'])await test('safe terminal status projection '+event,async()=>{
 const service=event.startsWith('service.');const row={...status,event,claimId:null,submissionId:service?actorId:null,transferId:service?null:actorId,privateNote:'secret',to:'private@example.invalid'};
 const f=fixture({data:{...page,items:[row]}}),r=await f.operator.list();assert.equal(r.ok,true);assert.equal(r.status.items[0].transferId,service?null:actorId);assert.doesNotMatch(JSON.stringify(r),/secret|private@/);
 for(const patch of [{claimId:actorId},service?{transferId:actorId}:{submissionId:actorId},service?{submissionId:null}:{transferId:null}])assert.equal((await fixture({data:{...page,items:[{...row,...patch}]}}).operator.list()).code,'unavailable');
});

console.log(JSON.stringify({passed,scope:'default-disabled callable operator; synthetic authenticated adapter and RPC only; no route/provider'}));
