import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import test from 'node:test';
const root=path.resolve(import.meta.dirname,'..');
const id='11111111-1111-4111-8111-111111111111',provider='22222222-2222-4222-8222-222222222222',owner='33333333-3333-4333-8333-333333333333',other='44444444-4444-4444-8444-444444444444',guitar='55555555-5555-4555-8555-555555555555';
function fixture(config={}){
 const calls=[],writes=[];const submission={id,guitar_id:guitar,provider_user_id:provider,owner_user_id:owner,status:config.status||'submitted'};
 const saved={...submission,status:'cancelled'};const profile={id:guitar,owner_id:owner,qr_code:'QRG-SYNTHETIC'};
 const auth=config.auth===null?null:{id:config.actor||provider};
 const db={from(table){return{select(){return this;},eq(){return this;},async maybeSingle(){return{data:table==='service_submissions'?submission:profile,error:null};},async in(){if(config.readError)return{data:null,error:{message:'private read details'}};return{data:table==='guitars'?[profile]:[],error:null};},update(){writes.push(table);throw Error('No direct status writes');},insert(){writes.push(table);throw Error('No separate notification/activity writes');}};},rpc(name,args){calls.push({name,args});return{async abortSignal(signal){assert.ok(signal instanceof AbortSignal);if(config.rpcThrow)throw Error('private RPC diagnostic');return{data:config.receipt===undefined?{ok:true,submission:saved,alreadyCancelled:submission.status==='cancelled'}:config.receipt,error:config.rpcError?{message:'private SQL error'}:null};}};}};
 const imports={'next/server':{NextResponse:Response},'next/cache':{revalidatePath(){throw Error('Cancellation cannot publish');}},'../../../lib/admin-auth':{getAdminContext:async()=>({ok:!!config.admin,user:{id:config.adminActor||auth?.id},accessSource:config.adminSource||'role'}),assertAccountCanWrite:async()=>config.locked?{ok:false,status:403,message:'Locked'}:{ok:true},logAdminAuditEvent(){throw Error('Not a separate cancellation write');}},'../../../lib/supabase-server':{createServerSupabaseClient:()=>db,getAuthenticatedUser:async()=>({user:auth})},'../../../lib/transactional-email':{sendServiceReviewEmail(){throw Error('No email from HTTP');}},'../../../lib/service-email-status':{serviceEmailDeliveryView:()=>({})},'../../../lib/service-workflow':{cleanServiceText:(v,n)=>typeof v==='string'?v.trim().slice(0,n):'',serviceMigrationMissing:()=>false,mapServiceSubmission:row=>({id:row.id,status:row.status}),serviceMigrationMessage:()=>'',ACTIVE_SERVICE_STATUSES:['draft','submitted','changes_requested']}};
 const e={};new Function('exports','require',ts.transpileModule(fs.readFileSync(path.join(root,'app/api/service-submissions/route.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)(e,name=>{if(name in imports)return imports[name];throw Error('Unexpected import '+name);});
 return{calls,writes,async patch(extra={}){const response=await e.PATCH(new Request('https://local.invalid/api/service-submissions',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({id,action:'cancel',note:'  synthetic cancellation  ',...extra})}));assert.match(response.headers.get('cache-control'),/no-store/);return{status:response.status,body:await response.json()};}};
}
for(const config of [{auth:null},{locked:true},{actor:other},{actor:owner},{actor:other,admin:true,adminActor:owner}])test('authorization blocks cancellation before writes '+JSON.stringify(config),async()=>{const f=fixture(config);assert.ok([401,403].includes((await f.patch()).status));assert.equal(f.calls.length,0);assert.equal(f.writes.length,0);});
for(const status of ['draft','submitted','changes_requested','cancelled'])test('provider cancellation/replay uses one atomic RPC from '+status,async()=>{const f=fixture({status});const r=await f.patch({p_actor_id:other,p_env_admin:true});assert.equal(r.status,200);assert.equal(r.body.committed,true);assert.equal(r.body.alreadyCancelled,status==='cancelled');assert.deepEqual(f.calls,[{name:'cancel_service_submission',args:{p_submission_id:id,p_actor_id:provider,p_env_admin:false,p_note:'synthetic cancellation'}}]);assert.equal(f.writes.length,0);});
for(const adminSource of ['env','role'])test('verified administrator supplies server-derived '+adminSource+' authority',async()=>{const f=fixture({actor:other,admin:true,adminSource});assert.equal((await f.patch()).status,200);assert.equal(f.calls[0].args.p_actor_id,other);assert.equal(f.calls[0].args.p_env_admin,adminSource==='env');});
for(const status of ['approved','declined','expired'])test('closed '+status+' does not enter cancellation RPC',async()=>{const f=fixture({status});assert.equal((await f.patch()).status,409);assert.equal(f.calls.length,0);});
for(const config of [{rpcError:true},{rpcThrow:true},{readError:true},{receipt:null},{receipt:{ok:true}},{receipt:{ok:true,alreadyCancelled:false,submission:{id,status:'cancelled'}}}])test('unknown or malformed receipt remains unconfirmed '+JSON.stringify(config),async()=>{const f=fixture(config);const r=await f.patch();assert.equal(r.status,503);assert.equal(r.body.code,'unconfirmed');assert.doesNotMatch(JSON.stringify(r),/private|SQL/);assert.equal(f.calls.length,1);assert.equal(f.writes.length,0);});

// Exercise the distinct endpoint actually used by the Admin service workspace.
function adminFixture(config={}) {
 const calls=[],writes=[],audits=[];
 const row={id,guitar_id:guitar,provider_user_id:provider,owner_user_id:owner,status:config.status||'submitted'};
 const context=config.context||{ok:true,status:200,user:{id:other},email:'synthetic-admin@example.invalid',accountStatus:'active',accessSource:'role'};
 let commits=0;
 const db={from(table){assert.equal(table,'service_submissions');return{
  select(){return this;},eq(key,value){assert.equal(key,'id');assert.equal(value,id);return this;},abortSignal(signal){assert.ok(signal instanceof AbortSignal);return this;},
  async maybeSingle(){if(config.readThrow)throw Error('private read failure');return{data:config.missing?null:{...row},error:config.readError?{message:'private SQL failure'}:null};},
  update(){writes.push(table);throw Error('Admin cancellation cannot directly write status');},insert(){writes.push(table);throw Error('Admin cancellation cannot separately write activity');}
 };},rpc(name,args){calls.push({name,args});assert.equal(name,'cancel_service_submission');return{async abortSignal(signal){
  assert.ok(signal instanceof AbortSignal);
  if(config.rpcThrow)throw Error('private cancellation failure');
  if(config.concurrentApproval){row.status='approved';return{data:null,error:{code:'40001',message:'private stale operation'}};}
  if(config.rpcError)return{data:null,error:{code:config.rpcError,message:'private SQL failure'}};
  if(Object.hasOwn(config,'receipt'))return{data:config.receipt,error:null};
  const alreadyCancelled=row.status==='cancelled';
  if(!alreadyCancelled){row.status='cancelled';row.service_cancel_recipient_role=context.user.id===provider?'owner':'provider';commits++;}
  return{data:{ok:true,submission:{...row},alreadyCancelled},error:null};
 }};}};
 const imports={'next/server':{NextResponse:Response},'../../../../lib/admin-auth':{
  getAdminContext:async()=>context,
  logAdminAuditEvent:async(_db,event)=>{audits.push(event);if(config.auditThrow)throw Error('private audit failure');return{ok:!config.auditError};}
 },'../../../../lib/supabase-server':{createServerSupabaseClient:()=>config.noDatabase?null:db},
 '../../../../lib/service-email-status':{serviceEmailDeliveryView:()=>({})},
 '../../../../lib/service-workflow':{cleanServiceText:(v,n)=>typeof v==='string'?v.trim().slice(0,n):'',mapProviderProfile:()=>({}),serviceMigrationMessage:()=>'',serviceMigrationMissing:()=>false}};
 const e={};new Function('exports','require',ts.transpileModule(fs.readFileSync(path.join(root,'app/api/admin/service-workflow/route.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)(e,name=>{if(name in imports)return imports[name];throw Error('Unexpected import '+name);});
 return{calls,writes,audits,row,get commits(){return commits;},async patch(extra={}){
  const response=await e.PATCH(new Request('https://local.invalid/api/admin/service-workflow',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({action:'cancel_submission',submissionId:id,note:'  Reviewed cancellation reason  ',...extra})}));
  assert.match(response.headers.get('cache-control'),/no-store/);return{status:response.status,body:await response.json()};
 }};
}
for(const [label,context,status] of [
 ['anonymous',{ok:false,status:401,user:null},401],['member',{ok:false,status:403,user:{id:owner}},403],
 ...['locked','banned','removed'].map(accountStatus=>[accountStatus,{ok:true,status:200,user:{id:other},accountStatus,accessSource:'env'},403]),
 ['missing authority',{ok:true,status:200,user:{id:other},accountStatus:'active',accessSource:'none'},403]
])test('Admin cancellation refuses '+label+' before RPC',async()=>{const f=adminFixture({context});assert.equal((await f.patch()).status,status);assert.equal(f.calls.length,0);assert.equal(f.writes.length,0);assert.equal(f.audits.length,0);});
for(const source of ['role','env'])test('Admin cancellation uses verified '+source+' actor and atomic receipt, replay does not repeat audit',async()=>{
 const f=adminFixture({context:{ok:true,status:200,user:{id:other},accountStatus:'active',accessSource:source}});
 const first=await f.patch({p_actor_id:owner,p_env_admin:source!=='env',actorId:owner});
 assert.equal(first.status,200);assert.equal(first.body.committed,true);assert.equal(first.body.alreadyCancelled,false);assert.equal(first.body.auditRecorded,true);
 assert.deepEqual(f.calls[0],{name:'cancel_service_submission',args:{p_submission_id:id,p_actor_id:other,p_env_admin:source==='env',p_note:'Reviewed cancellation reason'}});
 assert.equal(f.row.service_cancel_recipient_role,'provider');assert.equal(f.audits[0].reason,'Reviewed cancellation reason');assert.equal(f.audits[0].actorUserId,other);assert.equal(f.audits[0].action,'service_submission.cancelled');
 const replay=await f.patch();assert.equal(replay.status,200);assert.equal(replay.body.alreadyCancelled,true);assert.equal(f.commits,1);assert.equal(f.audits.length,1);assert.equal(f.calls.length,2);assert.equal(f.writes.length,0);
});
test('Admin who is also the provider retains provider-priority cancellation role',async()=>{const f=adminFixture({context:{ok:true,status:200,user:{id:provider},accountStatus:'active',accessSource:'role'}});assert.equal((await f.patch()).status,200);assert.equal(f.row.service_cancel_recipient_role,'owner');});
for(const status of ['approved','declined','expired'])test('Admin cancellation refuses closed '+status+' before RPC',async()=>{const f=adminFixture({status});assert.equal((await f.patch()).status,409);assert.equal(f.calls.length,0);assert.equal(f.audits.length,0);assert.equal(f.row.status,status);});
test('Admin cancellation rechecks approval committed after the read without fallback or audit',async()=>{const f=adminFixture({concurrentApproval:true});const result=await f.patch();assert.equal(result.status,503);assert.equal(result.body.code,'unconfirmed');assert.notEqual(result.body.committed,true);assert.equal(f.row.status,'approved');assert.equal(f.commits,0);assert.equal(f.writes.length,0);assert.equal(f.audits.length,0);});
for(const config of [{noDatabase:true},{readError:true},{readThrow:true},{rpcError:'42501'},{rpcError:'40001'},{rpcThrow:true},{receipt:null},{receipt:{ok:true}},{receipt:{ok:true,alreadyCancelled:false,submission:{id,status:'cancelled'}}},{receipt:{ok:true,alreadyCancelled:false,submission:{id,status:'cancelled',guitar_id:guitar,provider_user_id:owner,owner_user_id:owner}}}])test('Admin cancellation fails closed on unavailable or invalid result '+JSON.stringify(config),async()=>{const f=adminFixture(config);const result=await f.patch();assert.equal(result.status,503);assert.notEqual(result.body.committed,true);assert.doesNotMatch(JSON.stringify(result),/private|SQL/);assert.equal(f.audits.length,0);assert.equal(f.writes.length,0);});
for(const config of [{auditError:true},{auditThrow:true}])test('Admin audit failure reports committed cancellation without prompting a duplicate '+JSON.stringify(config),async()=>{const f=adminFixture(config);const result=await f.patch();assert.equal(result.status,200);assert.equal(result.body.committed,true);assert.equal(result.body.auditRecorded,false);assert.match(result.body.message,/audit entry could not be confirmed/);assert.doesNotMatch(result.body.message,/private/);assert.equal((await f.patch()).body.alreadyCancelled,true);assert.equal(f.commits,1);assert.equal(f.audits.length,1);});
for(const extra of [{submissionId:''},{note:'x'.repeat(2001)}])test('Admin cancellation rejects invalid input without losing a reason '+JSON.stringify(extra).slice(0,35),async()=>{const f=adminFixture();assert.equal((await f.patch(extra)).status,400);assert.equal(f.calls.length,0);assert.equal(f.audits.length,0);});
