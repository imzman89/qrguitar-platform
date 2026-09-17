import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {pathToFileURL} from "node:url";
import ts from "typescript";
import {readRepo} from "./atomic-test-support.mjs";
const runtime=fs.mkdtempSync(path.join(os.tmpdir(),"qrguitar-create-tests-"));
function compile(source,name){
 const dest=path.join(runtime,name+".mjs");fs.writeFileSync(dest,ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);return pathToFileURL(dest).href;
}
const {buildCreateProfilePayload,CreateProfileError}=await import(compile(readRepo("apps/web/lib/profile-create.ts"),"create-helper"));
compile(readRepo("apps/web/lib/staged-upload-cleanup.ts"),"cleanup-helper");
compile(readRepo("apps/web/lib/billing-environment.ts"),"billing-environment");
const owner="10000000-0000-4000-8000-000000000001",upload="upload-session-1234",key="request-key-1234";
const photo=owner+"/profile-uploads/"+upload+"/image-01-test.jpg",doc=owner+"/profile-uploads/"+upload+"/document-01-test.pdf";
const body=(extra={})=>({brand:"Fender",model:"Strat",instrumentType:"Electric Guitar",serialNotUsed:true,
  uploadId:upload,idempotencyKey:key,photos:[photo],documents:[{name:"Receipt",storagePath:doc,visibility:"hidden"}],ownerName:"",...extra});
const payload=(b,fallback="Fallback")=>buildCreateProfilePayload(b,"Fender",fallback,label=>"Profile link: "+label);
let passed=0;
async function test(name,fn){await fn();console.log("PASS "+name);passed++;}
await test("canonical create payload stays identical when auth display fallback changes",async()=>{
 assert.deepEqual(payload(body(),"Old"),payload(body(),"New"));assert.equal(payload(body()).owner_name,"");
});
await test("invalid calendar date fails before RPC",async()=>{
 assert.throws(()=>payload(body({documents:[{name:"Receipt",storagePath:doc,documentDate:"2026-02-30"}]})),CreateProfileError);
});
await test("partial or non-HTTPS links fail instead of being silently omitted",async()=>{
 assert.throws(()=>payload(body({customLinks:[{label:"Proof",url:""}]})),CreateProfileError);
 assert.throws(()=>payload(body({customLinks:[{label:"Proof",url:"javascript:alert(1)"}]})),CreateProfileError);
});
await test("foreign timeline references cannot enter a newly created profile",async()=>{
 assert.throws(()=>payload(body({documents:[{name:"Receipt",storagePath:doc,relatedTimelineEventId:"50000000-0000-4000-8000-000000000001"}]})),CreateProfileError);
});
const source=readRepo("apps/web/app/api/instruments/route.ts");
const start=source.indexOf("export async function POST(request: Request)"),end=source.indexOf("export async function PATCH(request: Request)",start);
assert.ok(start>=0&&end>start,"Actual POST handler is present");
const prelude=`
import {buildCreateProfilePayload,createProfileFailure,CreateProfileError} from "./create-helper.mjs";
import {isOwnedStagedPath,removeUnreferencedStagedUploads} from "./cleanup-helper.mjs";
import {profileBillingEnvironment} from "./billing-environment.mjs";
let current;
export function setDb(db){current=db;}
let databaseUrl="https://qvoruycxxrbarlafvhbi.supabase.co";
export function setDatabaseUrl(url){databaseUrl=url;}
const getSupabaseEnvStatus=()=>({supabaseUrl:databaseUrl});
const noStore=()=>{};
const createServerSupabaseClient=()=>current;
const getAuthenticatedUser=async()=>({user:{id:"${owner}",email:"owner@example.test",user_metadata:{display_name:"Current fallback"}}});
const assertAccountCanWrite=async()=>({ok:true});
const noStoreJson=(body,options={})=>({body,status:options.status||200});
const createFailure=(status,code,message,options={})=>noStoreJson({ok:false,code,message,retryable:false,...options},{status});
const supabaseWriteUnavailableResponse=()=>createFailure(503,"service_unavailable","Unavailable");
const cleanCreateKey=(value)=>/^[A-Za-z0-9-]{12,100}$/.test(String(value||""))?String(value):"";
const createSubmissionContentKey=(id,key)=>"create_submission:"+id+":"+key;
const resolveCanonicalBrand=async(_db,brand)=>({brand,suggestion:""});
const profileLinkSpecLabel=(label)=>"Profile link: "+label;
const hasLaunchTestingAccess=()=>false;
const revalidatePublicRecordSurfaces=()=>{};
`;
const route=await import(compile(prelude+source.slice(start,end),"post-handler"));
function db({error=null,data={ok:true,qrCode:"QRG-123456",permanentPath:"/i/QRG-123456"},throws=false}={}){
 const calls={rpc:[],deletes:0};
 return{calls,from(){throw new Error("Unexpected non-atomic database access");},storage:{from(){return{remove(){calls.deletes++;throw new Error("Files must be retained");}}}},
 async rpc(name,args){calls.rpc.push({name,args});if(throws)throw new Error("Network lost");return{data,error};}};
}
async function request(b,backend){route.setDb(backend);return route.POST({json:async()=>b});}
await test("null request returns validation failure without deleting or calling RPC",async()=>{
 const backend=db(),result=await request(null,backend);assert.equal(result.status,400);assert.equal(backend.calls.rpc.length,0);assert.equal(backend.calls.deletes,0);
});
await test("malformed retry preserves receipt and staged files",async()=>{
 const backend=db(),result=await request(body({photos:Array(21).fill(photo)}),backend);
 assert.equal(result.status,400);assert.equal(backend.calls.rpc.length,0);assert.equal(backend.calls.deletes,0);
});
await test("foreign staged path is rejected before an atomic create call",async()=>{
 const backend=db(),result=await request(body({photos:["foreign/profile-uploads/"+upload+"/image-01-test.jpg"]}),backend);
 assert.equal(result.status,400);assert.equal(backend.calls.rpc.length,0);assert.equal(backend.calls.deletes,0);
});
await test("missing create RPC returns503 without fallback row writes or cleanup",async()=>{
 const backend=db({error:{code:"PGRST202"}}),result=await request(body(),backend);
 assert.equal(result.status,503);assert.equal(result.body.ok,false);assert.equal(result.body.cleanupUploads,false);assert.equal(backend.calls.deletes,0);
});
await test("unknown outcome preserves exact request for safe receipt retry",async()=>{
 const backend=db({throws:true}),result=await request(body(),backend);
 assert.equal(result.status,502);assert.equal(result.body.code,"create_unconfirmed");assert.equal(result.body.cleanupUploads,false);assert.equal(backend.calls.deletes,0);
});
await test("conflicting receipt returns409 and never reports success",async()=>{
 const backend=db({error:{code:"QG004"}}),result=await request(body(),backend);
 assert.equal(result.status,409);assert.equal(result.body.ok,false);assert.equal(result.body.retryable,false);
});
await test("legacy ambiguous pending requests say review required instead of retrying forever",async()=>{
 const backend=db({error:{code:"QG003"}}),result=await request(body(),backend);
 assert.equal(result.status,409);assert.equal(result.body.code,"legacy_request_needs_review");assert.equal(result.body.retryable,false);
});
await test("create success is returned only from committed RPC receipt",async()=>{
 const backend=db(),result=await request(body(),backend);
 assert.equal(result.status,200);assert.equal(result.body.ok,true);assert.equal(backend.calls.rpc.length,1);
 assert.equal(backend.calls.rpc[0].name,"create_instrument_profile");assert.equal(backend.calls.rpc[0].args.p_owner_id,owner);
 assert.equal(backend.calls.rpc[0].args.p_payload.owner_name,"");assert.equal(backend.calls.rpc[0].args.p_owner_display_name,"Current fallback");
});
await test("removed registered upload returns definitive no-commit reset contract",async()=>{
 const backend=db({error:{code:"QG007"}}),result=await request(body(),backend);
 assert.equal(result.status,409);assert.equal(result.body.ok,false);assert.equal(result.body.code,"upload_session_changed");
 assert.equal(result.body.resetUploads,true);assert.equal(result.body.retryable,true);assert.equal(result.body.cleanupUploads,false);
});
await test("paid credit hold is a clear nonretryable conflict while form/uploads remain",async()=>{
 const backend=db({error:{code:"QG008"}}),result=await request(body(),backend);
 assert.equal(result.status,409);assert.equal(result.body.code,"billing_review_required");assert.equal(result.body.retryable,false);
 assert.equal(result.body.cleanupUploads,false);assert.equal(backend.calls.deletes,0);
});
await test("client-selected test environment cannot alter live creation or owner",async()=>{
 const backend=db(),result=await request(body({billingEnvironment:"test",p_billing_environment:"test",ownerId:"foreign"}),backend);
 assert.equal(result.status,200);assert.equal(backend.calls.rpc[0].args.p_billing_environment,undefined);assert.equal(backend.calls.rpc[0].args.p_owner_id,owner);
});
await test("test configuration on the production database fails before create RPC",async()=>{
 const old=process.env.STRIPE_ENVIRONMENT,oldUrl=process.env.QRGUITAR_BILLING_TEST_DATABASE_URL;
 try{process.env.STRIPE_ENVIRONMENT="test";process.env.QRGUITAR_BILLING_TEST_DATABASE_URL="https://qvoruycxxrbarlafvhbi.supabase.co/";
 const backend=db(),result=await request(body(),backend);assert.equal(result.status,503);assert.equal(result.body.code,"create_configuration_unavailable");assert.equal(backend.calls.rpc.length,0);assert.equal(backend.calls.deletes,0);
 }finally{if(old===undefined)delete process.env.STRIPE_ENVIRONMENT;else process.env.STRIPE_ENVIRONMENT=old;if(oldUrl===undefined)delete process.env.QRGUITAR_BILLING_TEST_DATABASE_URL;else process.env.QRGUITAR_BILLING_TEST_DATABASE_URL=oldUrl;}
});
await test("explicitly isolated test creation uses the environment-bound SQL overload",async()=>{
 const old=process.env.STRIPE_ENVIRONMENT,oldUrl=process.env.QRGUITAR_BILLING_TEST_DATABASE_URL;
 try{process.env.STRIPE_ENVIRONMENT="test";process.env.QRGUITAR_BILLING_TEST_DATABASE_URL="https://isolated-example.supabase.co";route.setDatabaseUrl(process.env.QRGUITAR_BILLING_TEST_DATABASE_URL);
 const backend=db(),result=await request(body(),backend);assert.equal(result.status,200);assert.equal(backend.calls.rpc[0].args.p_billing_environment,"test");
 }finally{route.setDatabaseUrl("https://qvoruycxxrbarlafvhbi.supabase.co");if(old===undefined)delete process.env.STRIPE_ENVIRONMENT;else process.env.STRIPE_ENVIRONMENT=old;if(oldUrl===undefined)delete process.env.QRGUITAR_BILLING_TEST_DATABASE_URL;else process.env.QRGUITAR_BILLING_TEST_DATABASE_URL=oldUrl;}
});
console.log("Completed "+passed+" create payload/route tests.");

