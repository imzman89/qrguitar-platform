import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
const file=path.resolve(import.meta.dirname,'../app/api/service-submissions/route.ts');
const source=fs.readFileSync(file,'utf8'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
const node=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='sendOwnerReview');
const js=ts.transpileModule(node.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const now=Date.now();
function fixture(options={}) {
  const submission={id:'submission-a',guitar_id:'guitar-a',owner_user_id:'owner-a',provider_user_id:'provider-a',provider_revision:1,status:'submitted',expires_at:new Date(now+3600000).toISOString()};
  const guitar={id:'guitar-a',owner_id:'owner-a',name:'Synthetic Profile',admin_archived_at:null,owner_removed_at:null};
  const h={submission,guitar,fresh:{...submission},currentGuitar:{...guitar},db:[],sent:[],activities:[],...options};
  const supabase={auth:{admin:{getUserById:async id=>({data:{user:h.noEmail?null:{email:'owner@example.invalid'}},error:h.ownerLookupError?Error('private auth failure'):null})}},from(table){
    const call={table,filters:[]};
    const result=()=>{if(call.kind==='update'&&!h.noUpdateRow&&!h.updateError)h.fresh={...h.fresh,...call.value};return {data:h.noUpdateRow?null:call.value?.email_delivery_status?{id:submission.id}:{...h.fresh},error:h.updateError?Error('private database failure'):null};};
    const builder={delete(){call.kind='delete';h.db.push(call);return builder;},insert(value){call.kind='insert';call.value=value;h.db.push(call);return builder;},update(value){call.kind='update';call.value=value;h.db.push(call);return builder;},eq(k,v){call.filters.push([k,v]);return builder;},is(k,v){call.filters.push([k,v]);return builder;},select(){return builder;},maybeSingle:async()=>result(),then(resolve,reject){return Promise.resolve(result()).then(resolve,reject);}};
    return builder;
  }};
  const env={createReviewToken:()=>({token:'synthetic-new-token',hash:'synthetic-new-hash'}),loadSubmission:async()=>{if(h.readError)throw Error('private read failure');return h.fresh;},loadGuitarById:async()=>h.currentGuitar,
    serviceTitle:g=>g.name,addActivity:async(...args)=>{h.activities.push(args);return {error:h.activityError?Error('private activity failure'):null};},
    sendServiceReviewEmail:async input=>{h.sent.push(input);if(h.send) return h.send();return {ok:true,status:'sent',outcome:'accepted',message:'Provider accepted',providerMessageId:'provider-id'};},
    process:{env:{NEXT_PUBLIC_SITE_URL:'http://127.0.0.1:55440'}}};
  h.rpcs=[];h.notifications=0;
  supabase.rpc=async(name,args)=>{h.rpcs.push({name,args});return {data:name==='service_email_submission_status'?{id:'intent-a',canRetry:h.canRetry===true}:true,error:h.rpcError?Error('Private database failure'):null};};
  const sender=new Function(...Object.keys(env),js+'\nreturn sendOwnerReview;')(...Object.values(env));
  h.run=()=>sender(supabase,submission,guitar,{public_display_name:'Synthetic provider'});
  h.patch=async(body)=>{
    const declaration=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='PATCH');
    const routeJs=ts.transpileModule(declaration.getText(ast).replace(/^export /,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
    const routeEnv={...env,createServerSupabaseClient:()=>supabase,getAuthenticatedUser:async()=>({user:h.anonymous?null:{id:h.actor||'provider-a'}}),assertAccountCanWrite:async()=>({ok:true}),
      getAdminContext:async()=>({ok:false,user:null}),cleanServiceText:v=>String(v||''),cleanServiceDate:v=>v,cleanServiceCategory:v=>v,cleanServiceVisibility:v=>v,
      loadProviderProfile:async()=>({public_display_name:'Synthetic provider'}),sendOwnerReview:sender,
      addNotification:async()=>{h.notifications++;return {error:h.notificationError?Error('private notification error'):null};},serializeSubmissions:async(_db,rows)=>rows,
      json:(data,status=200)=>({data,status}),errorResponse:(message,status=500)=>({data:{ok:false,message},status})};
    const run=new Function(...Object.keys(routeEnv),routeJs+'\nreturn PATCH;')(...Object.values(routeEnv));
    return run({json:async()=>body});
  };
  return h;
}
let passed=0,failed=0;
async function test(name,run){try{await run();passed++;console.log('PASS '+name);}catch(e){failed++;console.log('FAIL '+name+': '+e.message);}}
await test('successful send never rotates old token or extends existing deadline',async()=>{const h=fixture(),r=await h.run();assert.equal(r.ok,true);assert.equal(h.db.some(c=>c.table==='service_submission_tokens'),false);assert.equal(h.db.some(c=>'expires_at' in (c.value||{})),false);assert.equal(h.sent[0].reviewUrl,'http://127.0.0.1:55440/service-review/submission-a');});
await test('changed current owner suppresses stale recipient',async()=>{const h=fixture();h.currentGuitar.owner_id='owner-b';const r=await h.run();assert.equal(r.ok,false);assert.equal(h.sent.length,0);});
for(const failure of ['updateError','noUpdateRow','activityError'])await test(failure+' cannot report fully recorded acceptance',async()=>{const h=fixture({[failure]:true}),r=await h.run();assert.equal(r.ok,false);assert.match(r.message,/accepted|record|confirm/i);assert.equal(h.sent.length,1);});
for(const patch of [{status:'approved'},{expires_at:new Date(now-1).toISOString()},{expires_at:null},{expires_at:'invalid'},{owner_user_id:'owner-b'},{provider_user_id:'provider-b'},{provider_revision:2}])await test('stale or expired request suppresses '+JSON.stringify(patch),async()=>{const h=fixture();Object.assign(h.fresh,patch);const r=await h.run();assert.equal(r.ok,false);assert.equal(h.sent.length,0);assert.equal(h.db.length,0);});
for(const mode of ['readError','ownerLookupError','noEmail'])await test(mode+' fails before send',async()=>{const h=fixture({[mode]:true});assert.equal((await h.run()).ok,false);assert.equal(h.sent.length,0);});
for(const field of ['admin_archived_at','owner_removed_at'])await test(field+' suppresses email',async()=>{const h=fixture();h.currentGuitar[field]=new Date().toISOString();assert.equal((await h.run()).ok,false);assert.equal(h.sent.length,0);});
for(const send of [async()=>{throw Error('private send error');},async()=>({ok:false,status:'failed',outcome:'unknown'}),async()=>({ok:true,status:'sent',outcome:'accepted'})])await test('unconfirmed provider acceptance is honest and not automatically retryable',async()=>{const h=fixture({send}),r=await h.run();assert.equal(r.ok,false);assert.equal(r.outcome,'unknown');assert.equal(r.retryable,false);assert.match(r.message,/could not be confirmed/i);assert.equal(h.db.some(c=>c.table==='service_submission_tokens'),false);assert.equal(h.db.some(c=>'expires_at' in(c.value||{})),false);});
await test('definitive provider rejection retains retry classification',async()=>{const h=fixture({send:async()=>({ok:false,status:'failed',outcome:'rejected',retryable:true})});const r=await h.run();assert.equal(r.outcome,'rejected');assert.equal(r.retryable,true);assert.equal(r.recorded,true);});
await test('legacy sender receipt is provider acceptance only',async()=>{const h=fixture({send:async()=>({ok:true,status:'sent',providerMessageId:'legacy-receipt'})}),r=await h.run();assert.equal(r.outcome,'accepted');assert.match(r.message,/Inbox delivery is not yet confirmed/);});
await test('delivery update is conditional on unchanged owner revision state and deadline',async()=>{const h=fixture();await h.run();const update=h.db.find(c=>c.kind==='update');for(const pair of [['id','submission-a'],['status','submitted'],['owner_user_id','owner-a'],['provider_revision',1],['expires_at',h.submission.expires_at]])assert.ok(update.filters.some(p=>JSON.stringify(p)===JSON.stringify(pair)));});
await test('retry API exposes uncertain acceptance without claiming success',async()=>{const h=fixture({send:async()=>({ok:false,status:'failed',outcome:'unknown'})});const r=await h.patch({id:'submission-a',action:'retry_email'});assert.equal(r.status,502);assert.equal(r.data.emailOutcome,'unknown');assert.equal(r.data.retryable,false);});
for(const patch of [{anonymous:true},{actor:'other-a'},{actor:'owner-a'}])await test('retry API keeps provider/admin boundary '+JSON.stringify(patch),async()=>{const h=fixture(patch),r=await h.patch({id:'submission-a',action:'retry_email'});assert.equal(r.status,patch.anonymous?401:403);assert.equal(h.sent.length,0);});
await test('committed submit truthfully reports notification and activity failures',async()=>{const h=fixture({notificationError:true,activityError:true});h.fresh.status='draft';h.submission.status='draft';const r=await h.patch({id:'submission-a',action:'submit',serviceDate:'2026-09-26',title:'Setup',workPerformed:'Setup completed'});assert.equal(r.data.ok,true);assert.equal(r.data.committed,true);assert.equal(h.sent.length,1);assert.match(r.data.message,/in-app owner notification could not be confirmed/);assert.match(r.data.message,/activity entry could not be confirmed/);});
await test('successful submit sends once and retains committed 14-day expiry',async()=>{const h=fixture();h.fresh.status='draft';h.submission.status='draft';const before=Date.now(),r=await h.patch({id:'submission-a',action:'submit',serviceDate:'2026-09-26',title:'Setup',workPerformed:'Setup completed'});assert.equal(r.data.emailOutcome,'accepted');assert.equal(h.sent.length,1);const expiry=Date.parse(h.fresh.expires_at);assert.ok(expiry>=before+14*86400000&&expiry<=Date.now()+14*86400000);assert.equal(h.db.filter(c=>'expires_at' in(c.value||{})).length,1);});
await test('submit after ownership change creates no notification or email',async()=>{const h=fixture();h.fresh.status='draft';h.currentGuitar.owner_id='owner-b';const r=await h.patch({id:'submission-a',action:'submit',serviceDate:'2026-09-26',title:'Setup',workPerformed:'Setup completed'});assert.equal(r.status,409);assert.equal(h.sent.length,0);assert.equal(h.db.length,0);});
await test('atomic outbox receipt skips inline send and duplicate notification',async()=>{const h=fixture();h.fresh.status='draft';h.fresh.email_dispatch_mode='outbox';const r=await h.patch({id:'submission-a',action:'submit',serviceDate:'2026-09-26',title:'Setup',workPerformed:'Done'});assert.equal(r.data.ok,true);assert.equal(r.data.emailOutcome,'queued');assert.equal(h.sent.length,0);assert.equal(h.notifications,0);});
await test('durable retry queues an eligible intent without calling transport',async()=>{const h=fixture({canRetry:true});h.fresh.email_dispatch_mode='outbox';const r=await h.patch({id:'submission-a',action:'retry_email'});assert.equal(r.status,200);assert.equal(r.data.emailOutcome,'queued');assert.equal(h.sent.length,0);assert.equal(h.rpcs.length,2);assert.equal(h.rpcs[1].args.p_actor_id,'provider-a');});
await test('durable unknown has no automatic retry or legacy fallback',async()=>{const h=fixture();h.fresh.email_dispatch_mode='outbox';const r=await h.patch({id:'submission-a',action:'retry_email'});assert.equal(r.status,409);assert.equal(h.sent.length,0);assert.equal(h.rpcs.length,1);});
await test('outbox RPC failure never falls back to inline sending',async()=>{const h=fixture({rpcError:true});h.fresh.email_dispatch_mode='outbox';const r=await h.patch({id:'submission-a',action:'retry_email'});assert.equal(r.status,503);assert.equal(h.sent.length,0);});
console.log(JSON.stringify({passed,failed}));if(failed)process.exitCode=1;
