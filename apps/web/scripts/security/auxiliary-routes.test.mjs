import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createMemoryDatabase, loadRoutes } from "./mock-routes.mjs";
const args=process.argv.slice(2), option=(name)=>args[args.indexOf(name)+1];
const repo=path.resolve(args.includes("--repo")?option("--repo"):path.join(path.dirname(fileURLToPath(import.meta.url)),"../../../.."));
const overlay=args.includes("--overlay")?path.resolve(option("--overlay")):null;
const owner="11111111-1111-4111-8111-111111111111",provider="22222222-2222-4222-8222-222222222222",stranger="33333333-3333-4333-8333-333333333333",guitar="44444444-4444-4444-8444-444444444444",submission="55555555-5555-4555-8555-555555555555",evidence="66666666-6666-4666-8666-666666666666";
function request(route, method="GET", body) { return new Request("https://test.invalid/api/"+route,{method,...(body===undefined?{}:{headers:{"content-type":"application/json"},body:JSON.stringify(body)})}); }
function fixture({actor=owner,hooks={},modules={},realAdmin=false}={}) {
  const tables={profiles:[{id:owner,role:"owner",account_status:"active",hide_public_content:false,display_name:"Owner"},{id:provider,role:"owner",account_status:"active",display_name:"Provider"},{id:stranger,role:"owner",account_status:"active",display_name:"Stranger"}],
    guitars:[{id:guitar,qr_code:"QRG-AUDIT",owner_id:owner,visibility:"public",safety_status:"clear"}],
    guitar_external_media:[{id:"media",guitar_id:guitar,provider:"youtube",canonical_url:"https://www.youtube.com/watch?v=abcdefghijk",title:"Synthetic media",is_public:true,sort_order:0}],
    service_submissions:[{id:submission,guitar_id:guitar,provider_user_id:provider,owner_user_id:owner,status:"draft"}],
    service_submission_evidence:[{id:evidence,submission_id:submission,evidence_type:"receipt",file_name:"private.pdf",mime_type:"application/pdf",file_size_bytes:5,storage_path:submission+"/"+provider+"/private.pdf",created_at:"2026-01-01"}],
    service_submission_activity:[],
    service_provider_profiles:[{user_id:provider,public_display_name:"Provider",business_name:"Provider",verification_status:"verified",verified_at:"2026-01-01",verified_by:owner,internal_review_note:"Keep private review",service_categories:[]}],
    site_content:[{content_key:"public_collection_handle:audited",content_value:{ownerId:owner}},{content_key:"public_collection_owner:"+owner,content_value:{enabled:true,handle:"audited",publicName:"Audited collection",allowMessages:true,ownerId:owner}}]};
  const db=createMemoryDatabase(tables,hooks),storageCalls=[],rpcCalls=[],emails=[];
  db.storage={from:(bucket)=>({upload:async(storagePath,file)=>{storageCalls.push({action:"upload",bucket,path:storagePath,file});return {data:{path:storagePath},error:null};},remove:async(paths)=>{storageCalls.push({action:"remove",bucket,paths});return {error:null};},createSignedUrl:async(storagePath)=>{storageCalls.push({action:"sign",bucket,path:storagePath});return {data:{signedUrl:"https://signed.invalid/private-token"},error:null};}})};
  db.auth.admin.getUserById=async()=>({data:{user:{email:"recipient@example.test"}},error:null});
  db.rpc=async(name,values)=>{rpcCalls.push({name,values});if(name==="commit_service_evidence")return {data:values.p_action==="upload"?{id:"new-evidence",...values.p_evidence}:tables.service_submission_evidence[0],error:null};return {data:tables.guitar_external_media[0],error:null};};
  const user=actor?{id:actor,email:actor+"@example.test",user_metadata:{}}:null;
  const route=loadRoutes(repo,db,{user,overlay,realAdmin,modules:{"apps/web/lib/security.ts":{checkServerRateLimit:()=>true},"apps/web/lib/transactional-email.ts":{sendCollectionInquiryEmail:async(value)=>{emails.push(value);return {ok:true,message:"Sent"};}},...modules}});
  return {tables,db,storageCalls,rpcCalls,emails,route};
}
function uploadRequest() {return request("service-evidence","POST",{action:"complete",expectedActorId:provider,submissionId:submission,uploadId:"77777777-7777-4777-8777-777777777777",evidenceType:"receipt",fileName:"new.pdf",mimeType:"application/pdf",size:5});}
let passes=0;
async function test(name,run){if(args.includes("--match")&&!name.includes(option("--match")))return;await run();passes++;console.log("PASS "+name);}
for(const method of ["GET","POST","DELETE"]) await test("evidence signed-out "+method+" rejects before parsing or lookup",async()=>{
  const f=fixture({actor:null}); const req=request("service-evidence?submissionId="+submission,method,method==="GET"?undefined:{evidenceId:evidence});
  req.json=()=>{throw Error("must not parse");}; req.formData=()=>{throw Error("must not parse");};
  const result=await f.route("apps/web/app/api/service-evidence/route.ts")[method](req);
  assert.equal(result.status,401); assert.equal(f.db.calls.length,0); assert.equal(f.storageCalls.length,0); assert.equal(f.rpcCalls.length,0);
});
for(const [name,patch,ownerPatch] of [["private",{visibility:"private"},{}],["archived",{admin_archived_at:"2026-01-01"},{}],["removed",{owner_removed_at:"2026-01-01"},{}],["retired",{qr_code:"QRG-0001"},{}],["hidden",{},{hide_public_content:true}],["banned",{},{account_status:"banned"}],["removed owner",{},{account_status:"removed"}]]) await test("external media hides "+name+" profiles before fetching media",async()=>{
  const f=fixture();Object.assign(f.tables.guitars[0],patch);Object.assign(f.tables.profiles[0],ownerPatch);
  const response=await f.route("apps/web/app/api/external-media/route.ts").GET(request("external-media?code="+f.tables.guitars[0].qr_code));
  assert.equal(response.status,404);assert.equal(f.db.calls.some(x=>x.table==="guitar_external_media"),false);
});
for(const visibility of ["public","unlisted"])await test("external media remains available for eligible "+visibility+" profiles",async()=>{
  const f=fixture();f.tables.guitars[0].visibility=visibility;
  assert.equal((await f.route("apps/web/app/api/external-media/route.ts").GET(request("external-media?code=QRG-AUDIT"))).status,200);
});
await test("external media owner moderation error fails closed",async()=>{
  const f=fixture({hooks:{before:q=>q.table==="profiles"?{data:null,error:{message:"outage"}}:null}});
  assert.equal((await f.route("apps/web/app/api/external-media/route.ts").GET(request("external-media?code=QRG-AUDIT"))).status,503);
});
await test("media mutation uses authenticated RPC actor and ignores client admin override",async()=>{
  const f=fixture();const response=await f.route("apps/web/app/api/external-media/route.ts").PATCH(request("external-media","PATCH",{qrCode:"QRG-AUDIT",id:"media",title:"Updated",isAdmin:true,ownerId:stranger}));
  assert.equal(response.status,200);assert.equal(f.rpcCalls.length,1);assert.equal(f.rpcCalls[0].values.p_actor_id,owner);assert.equal(f.rpcCalls[0].values.p_is_admin,false);
  assert.equal(f.db.calls.some(q=>q.table==="guitar_external_media"&&q.operation!=="select"),false);
});
await test("unrelated account cannot mutate media even with an admin flag",async()=>{
  const f=fixture({actor:stranger});assert.equal((await f.route("apps/web/app/api/external-media/route.ts").PATCH(request("external-media","PATCH",{qrCode:"QRG-AUDIT",id:"media",title:"Updated",isAdmin:true}))).status,403);assert.equal(f.rpcCalls.length,0);
});
await test("a missing media deletion does not report success",async()=>{
  const f=fixture();f.db.rpc=async()=>({data:null,error:{code:"P0002"}});assert.equal((await f.route("apps/web/app/api/external-media/route.ts").DELETE(request("external-media?code=QRG-AUDIT&id=missing","DELETE"))).status,404);
});
await test("safety update cannot change a transferred instrument after stale owner authorization",async()=>{
  let f;f=fixture({hooks:{before(q){if(q.table==="guitars"&&q.operation==="update")f.tables.guitars[0].owner_id=stranger;}}});
  const response=await f.route("apps/web/app/api/safety-status/route.ts").PATCH(request("safety-status","PATCH",{qrCode:"QRG-AUDIT",safetyStatus:"stolen"}));
  assert.equal(response.status,409);assert.equal(f.tables.guitars[0].safety_status,"clear");
});
await test("safety update reports a concurrently removed row as conflict",async()=>{
  let f;f=fixture({hooks:{before(q){if(q.table==="guitars"&&q.operation==="update")f.tables.guitars=[];}}});
  assert.equal((await f.route("apps/web/app/api/safety-status/route.ts").PATCH(request("safety-status","PATCH",{qrCode:"QRG-AUDIT",safetyStatus:"lost"}))).status,409);
});
await test("invalid safety state cannot silently clear a stolen flag",async()=>{
  const f=fixture();f.tables.guitars[0].safety_status="stolen";
  assert.equal((await f.route("apps/web/app/api/safety-status/route.ts").PATCH(request("safety-status","PATCH",{qrCode:"QRG-AUDIT",safetyStatus:"typo"}))).status,400);assert.equal(f.tables.guitars[0].safety_status,"stolen");
});
await test("committed safety change remains successful when cache refresh fails",async()=>{
 const f=fixture({modules:{"next/cache":{revalidatePath(){throw Error("cache unavailable");}}}});
 const response=await f.route("apps/web/app/api/safety-status/route.ts").PATCH(request("safety-status","PATCH",{qrCode:"QRG-AUDIT",safetyStatus:"lost"}));
 assert.equal(response.status,200);const body=await response.json();assert.equal(body.ok,true);assert.equal(body.committed,true);assert.equal(body.refreshPending,true);assert.equal(body.safetyStatus,"lost");assert.equal(f.tables.guitars[0].safety_status,"lost");
});
await test("normal owner safety update succeeds",async()=>{
  const f=fixture();assert.equal((await f.route("apps/web/app/api/safety-status/route.ts").PATCH(request("safety-status","PATCH",{qrCode:"QRG-AUDIT",safetyStatus:"lost"}))).status,200);assert.equal(f.tables.guitars[0].safety_status,"lost");
});
await test("provider self-save cannot restore stale verification or overwrite a concurrent admin review",async()=>{
  let f;f=fixture({actor:provider,hooks:{before(q){if(q.table==="service_provider_profiles"&&q.operation==="upsert")Object.assign(f.tables.service_provider_profiles[0],{verification_status:"unverified",verified_at:null,verified_by:null,internal_review_note:"New admin review"});}}});
  const response=await f.route("apps/web/app/api/service-providers/route.ts").PATCH(request("service-providers","PATCH",{publicDisplayName:"Changed provider",verificationStatus:"verified",internalReviewNote:"Erase note"}));
  assert.equal(response.status,200);assert.equal(f.tables.service_provider_profiles[0].verification_status,"unverified");assert.equal(f.tables.service_provider_profiles[0].internal_review_note,"New admin review");
  const mutation=f.db.calls.find(q=>q.table==="service_provider_profiles"&&q.operation==="upsert");for(const column of ["verification_status","verified_at","verified_by","internal_review_note"])assert.equal(Object.hasOwn(mutation.value,column),false);
});
await test("evidence DB delete failure never deletes its physical object or claims success",async()=>{
  const f=fixture({actor:provider,hooks:{before:q=>q.operation==="delete"?{data:null,error:{message:"database failure"}}:null}});f.db.rpc=async()=>({data:null,error:{code:"57014",message:"database failure"}});
  const response=await f.route("apps/web/app/api/service-evidence/route.ts").DELETE(request("service-evidence","DELETE",{evidenceId:evidence}));
  assert.equal(response.status,503);assert.equal(f.storageCalls.length,0);
});
await test("confirmed evidence delete precedes physical cleanup and reports cleanup failure honestly",async()=>{
  const f=fixture({actor:provider});let committed=false;
  f.db.rpc=async()=>{assert.equal(f.storageCalls.length,0);committed=true;return {data:f.tables.service_submission_evidence[0],error:null};};
  f.db.storage.from=()=>({remove:async()=>{assert.equal(committed,true);return {error:{message:"storage outage"}};}});
  const response=await f.route("apps/web/app/api/service-evidence/route.ts").DELETE(request("service-evidence","DELETE",{evidenceId:evidence}));const payload=await response.json();
  assert.equal(response.status,200);assert.equal(payload.committed,true);assert.equal(payload.cleanupPending,true);assert.match(payload.message,/cleanup is pending/);
});
for(const code of ["PT409","40001"]) await test("stale evidence upload "+code+" rejects submitted status without uploading or deleting private bytes",async()=>{
  const f=fixture({actor:provider});f.db.rpc=async()=>({data:null,error:{code}});
  const response=await f.route("apps/web/app/api/service-evidence/route.ts").POST(uploadRequest());assert.equal(response.status,409);
  assert.equal(f.storageCalls.some(x=>x.action==="upload"||x.action==="remove"),false);assert.equal(f.tables.service_submission_evidence.length,1);
});
await test("unconfirmed evidence upload never deletes a potentially committed file",async()=>{
  const f=fixture({actor:provider});f.db.rpc=async()=>{throw new Error("RPC response lost");};
  const response=await f.route("apps/web/app/api/service-evidence/route.ts").POST(uploadRequest());assert.equal(response.status,503);assert.equal((await response.json()).commitStatus,"unknown");assert.equal(f.storageCalls.some(x=>x.action==="remove"),false);
});
await test("banned provider cannot upload evidence",async()=>{
  const f=fixture({actor:provider,realAdmin:true});f.tables.profiles.find(x=>x.id===provider).account_status="banned";
  assert.equal((await f.route("apps/web/app/api/service-evidence/route.ts").POST(uploadRequest())).status,403);assert.equal(f.storageCalls.length,0);
});
await test("evidence signing failure is not successful blank previews",async()=>{
  const f=fixture({actor:provider});f.db.storage.from=()=>({createSignedUrl:async()=>({data:null,error:{message:"signing outage"}})});
  assert.equal((await f.route("apps/web/app/api/service-evidence/route.ts").GET(request("service-evidence?submissionId="+submission))).status,503);
});
await test("private evidence read requires a participant and omits raw storage paths",async()=>{
  const denied=fixture({actor:stranger});assert.equal((await denied.route("apps/web/app/api/service-evidence/route.ts").GET(request("service-evidence?submissionId="+submission))).status,403);assert.equal(denied.storageCalls.length,0);
  const allowed=fixture({actor:owner});const payload=await(await allowed.route("apps/web/app/api/service-evidence/route.ts").GET(request("service-evidence?submissionId="+submission))).json();assert.equal(payload.ok,true);assert.equal(payload.evidence[0].previewUrl,"https://signed.invalid/private-token");assert.equal(JSON.stringify(payload).includes("storage_path"),false);
});
for(const [name,patch] of [["hidden",{hide_public_content:true}],["banned",{account_status:"banned"}],["removed",{account_status:"removed"}]])await test("inquiry does not contact a "+name+" collection owner",async()=>{
  const f=fixture({actor:provider});Object.assign(f.tables.profiles[0],patch);
  assert.equal((await f.route("apps/web/app/api/collection-inquiries/route.ts").POST(request("collection-inquiries","POST",{handle:"audited",message:"This is a sufficiently detailed synthetic inquiry."}))).status,404);assert.equal(f.emails.length,0);
});
await test("inquiry owner moderation failure prevents delivery",async()=>{
  const f=fixture({actor:provider,hooks:{before:q=>q.table==="profiles"?{data:null,error:{message:"outage"}}:null}});
  assert.equal((await f.route("apps/web/app/api/collection-inquiries/route.ts").POST(request("collection-inquiries","POST",{handle:"audited",message:"This is a sufficiently detailed synthetic inquiry."}))).status,503);assert.equal(f.emails.length,0);
});
await test("enabled eligible collection inquiry preserves normal mocked delivery",async()=>{
  const f=fixture({actor:provider});assert.equal((await f.route("apps/web/app/api/collection-inquiries/route.ts").POST(request("collection-inquiries","POST",{handle:"audited",message:"This is a sufficiently detailed synthetic inquiry."}))).status,200);assert.equal(f.emails.length,1);
});
console.log(passes+" mocked auxiliary API tests passed.");
