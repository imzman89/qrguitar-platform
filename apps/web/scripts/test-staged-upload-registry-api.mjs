import assert from"node:assert/strict";import fs from"node:fs";import os from"node:os";import path from"node:path";import{pathToFileURL}from"node:url";import ts from"typescript";import{readRepo}from"./atomic-test-support.mjs";
const runtime=fs.mkdtempSync(path.join(os.tmpdir(),"qrguitar-registry-api-"));
function compile(source,name){const file=path.join(runtime,name+".mjs");fs.writeFileSync(file,ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);return pathToFileURL(file).href;}
const{removeUnreferencedStagedUploads}=await import(compile(readRepo("apps/web/lib/staged-upload-cleanup.ts"),"cleanup-helper"));
const owner="10000000-0000-4000-8000-000000000001",upload="registry-session-1234",photo=owner+"/profile-uploads/"+upload+"/image-01-test.jpg",doc=owner+"/profile-uploads/"+upload+"/document-01-test.pdf";
let passed=0;async function test(name,fn){await fn();console.log("PASS "+name);passed++;}
function backend({rpcError=null,rpcThrows=false,data={ok:true,mediaPaths:[photo],documentPaths:[]},removeError=null}={}){
 const events=[];return{events,from(){throw new Error("Cleanup must use registry RPC rather than racy direct reference checks");},
 async rpc(name,args){events.push({kind:"rpc",name,args});if(rpcThrows)throw new Error("unknown RPC");return{error:rpcError,data};},
 storage:{from(bucket){return{async remove(paths){events.push({kind:"remove",bucket,paths});return{error:removeError};}}}}};
}
await test("cleanup obtains committed tombstone plan before removing only authorized files",async()=>{
 const db=backend();assert.equal(await removeUnreferencedStagedUploads(db,owner,upload,[photo],[doc]),true);
 assert.deepEqual(db.events.map(e=>e.kind),["rpc","remove"]);assert.equal(db.events[0].name,"cleanup_staged_instrument_uploads");
 assert.deepEqual(db.events[1],{kind:"remove",bucket:"instrument-media",paths:[photo]});
});
await test("missing registry RPC never falls back to deleting files",async()=>{
 const db=backend({rpcError:{code:"PGRST202"}});assert.equal(await removeUnreferencedStagedUploads(db,owner,upload,[photo],[doc]),false);assert.equal(db.events.length,1);
});
await test("unknown cleanup commit outcome retains Storage objects",async()=>{
 const db=backend({rpcThrows:true});assert.equal(await removeUnreferencedStagedUploads(db,owner,upload,[photo],[]),false);assert.equal(db.events.length,1);
});
await test("consumed and unregistered paths are retained without HTTP deletion",async()=>{
 const db=backend({data:{ok:true,mediaPaths:[],documentPaths:[],retainedCount:1,unregisteredCount:1}});
 assert.equal(await removeUnreferencedStagedUploads(db,owner,upload,[photo],[doc]),true);assert.equal(db.events.length,1);
});
await test("malformed or broadened cleanup response never broadens authorization",async()=>{
 const db=backend({data:{ok:true,mediaPaths:[photo+"-foreign"],documentPaths:[]}});
 assert.equal(await removeUnreferencedStagedUploads(db,owner,upload,[photo],[]),false);assert.equal(db.events.length,1);
});
await test("Storage failure reports failure without reversing the tombstone",async()=>{
 const db=backend({removeError:{message:"HTTP timeout"}});assert.equal(await removeUnreferencedStagedUploads(db,owner,upload,[photo],[]),false);assert.deepEqual(db.events.map(e=>e.kind),["rpc","remove"]);
});
const uploaderSource=readRepo("apps/web/app/api/instruments/uploads/route.ts").replace(/^import .*$/gm,"");
const prelude=`
import{isOwnedStagedPath,removeUnreferencedStagedUploads}from"./cleanup-helper.mjs";
let current;export function setBackend(db){current=db;}
const randomUUID=()=>"generated-unique-file";
const NextResponse={json:(body,options={})=>({body,status:options.status||200})};
const createServerSupabaseClient=()=>current;
const getAuthenticatedUser=async()=>({user:{id:"${owner}"}});
const assertAccountCanWrite=async()=>({ok:true});
`;
const uploader=await import(compile(prelude+uploaderSource,"uploader"));
function uploadBackend({uploadError=null,registrationError=null,registrationThrows=false}={}){
 const events=[];return{events,storage:{from(bucket){return{async upload(path,bytes,options){events.push({kind:"upload",bucket,path});return{error:uploadError};},remove(){throw new Error("Registration failure must retain the object");}}}},
 async rpc(name,args){events.push({kind:"register",name,args});if(registrationThrows)throw new Error("timeout");return{error:registrationError,data:{ok:true,state:"staged"}};}};
}
async function uploadRequest(db){uploader.setBackend(db);return uploader.POST({json:async()=>({uploadId:upload,kind:"image",dataUrl:"data:image/jpeg;base64,/9j/4A==",index:0})});}
await test("upload response is successful only after object upload and registry registration",async()=>{
 const db=uploadBackend(),result=await uploadRequest(db);assert.equal(result.body.ok,true);assert.deepEqual(db.events.map(e=>e.kind),["upload","register"]);
 assert.equal(db.events[1].name,"register_staged_instrument_upload");assert.equal(db.events[1].args.p_storage_path,result.body.storagePath);
});
await test("registration failure keeps uploaded bytes and reports file not ready",async()=>{
 const db=uploadBackend({registrationError:{code:"PGRST202"}}),result=await uploadRequest(db);assert.equal(result.status,503);assert.equal(result.body.ok,false);assert.equal(result.body.code,"upload_registration_failed");assert.deepEqual(db.events.map(e=>e.kind),["upload","register"]);
});
await test("unknown registration outcome preserves file instead of compensating deletion",async()=>{
 const db=uploadBackend({registrationThrows:true}),result=await uploadRequest(db);assert.equal(result.status,503);assert.equal(result.body.ok,false);assert.deepEqual(db.events.map(e=>e.kind),["upload","register"]);
});
await test("failed upload never registers a nonexistent object",async()=>{
 const db=uploadBackend({uploadError:{message:"failed"}}),result=await uploadRequest(db);assert.equal(result.status,502);assert.equal(result.body.ok,false);assert.deepEqual(db.events.map(e=>e.kind),["upload"]);
});
console.log("Completed "+passed+" registry helper/uploader API tests.");

