import {spawnSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";
import assert from "node:assert/strict";
import { test } from "node:test";
import { RELEASE_CHECKS, RELEASE_VERSION, REQUIRED_DATABASE_CHECKS, checkBackendReadiness, runReleaseChecks, validateReadiness, verifyProduction } from "../../../scripts/release-policy.mjs";

const valid = () => ({ready:true,releaseVersion:RELEASE_VERSION,checks:REQUIRED_DATABASE_CHECKS.map(name=>({name,ok:true}))});
test("release gate runs all local checks in order before database readiness",async()=>{
 const calls=[];await runReleaseChecks(async args=>calls.push(args),async()=>calls.push("database"));
 assert.deepEqual(calls,[...RELEASE_CHECKS,"database"]);
});
for(let i=0;i<RELEASE_CHECKS.length;i++)test("failed local gate "+i+" prevents later checks and deployment readiness",async()=>{
 const calls=[];await assert.rejects(runReleaseChecks(async args=>{calls.push(args);if(args===RELEASE_CHECKS[i])throw Error("failed");},async()=>calls.push("database")));
 assert.deepEqual(calls,RELEASE_CHECKS.slice(0,i+1));
});
test("all exact current readiness checks pass",()=>assert.equal(validateReadiness(valid()).ready,true));
test('historical five-free response cannot satisfy current release gate',()=>{assert.throws(()=>validateReadiness({...valid(),releaseVersion:'2026-09-23.1'}));});
for(const child of ['','.qr4-rejected-export'])test('current verifier rejects candidate export root: '+(child||'exact repo'),()=>{
 const repo=fileURLToPath(new URL('../../../',import.meta.url)),generator=fileURLToPath(new URL('./generate-current-release-readiness.mjs',import.meta.url));
 const result=spawnSync(process.execPath,[generator,'--repo',repo,'--output-root',path.resolve(repo,child)],{encoding:'utf8'});
 assert.equal(result.status,1);assert.match(result.stderr,/Verification only; --output-root is unsupported/);
});
for(const [name,mutate] of [
 ["version mismatch",v=>v.releaseVersion="old"],["false readiness",v=>v.ready=false],
 ["empty checks",v=>v.checks=[]],["missing check",v=>v.checks.pop()],
 ["duplicate check",v=>v.checks.push(v.checks[0])],["string boolean",v=>v.checks[0].ok="true"],
 ["failed grant check",v=>v.checks.find(c=>c.name==="private_table_grants").ok=false]
])test("readiness rejects "+name,()=>{const v=valid();mutate(v);assert.throws(()=>validateReadiness(v));});
test("missing credentials make no outgoing request",async()=>{
 let called=false;await assert.rejects(checkBackendReadiness({url:"https://example.supabase.co",serviceKey:"",fetchImpl:async()=>{called=true;}}));assert.equal(called,false);
});
test("readiness sends an empty authenticated read-only RPC request without redirect",async()=>{
 let captured;await checkBackendReadiness({url:"https://example.supabase.co",serviceKey:"fixture-secret",fetchImpl:async(url,init)=>{captured={url:String(url),init};return Response.json(valid());}});
 assert.equal(captured.url,"https://example.supabase.co/rest/v1/rpc/qrguitar_release_readiness");
 assert.equal(captured.init.body,"{}");assert.equal(captured.init.redirect,"error");
 assert.equal(captured.init.headers.Authorization,"Bearer fixture-secret");
});
test("missing migration response never prints server body or credentials",async()=>{
 await assert.rejects(checkBackendReadiness({url:"https://example.supabase.co",serviceKey:"fixture-secret",fetchImpl:async()=>new Response("sensitive server detail",{status:404})}),e=>e.message.includes("HTTP 404")&&!e.message.includes("sensitive")&&!e.message.includes("fixture-secret"));
});
test("network failures and malformed readiness responses fail closed",async()=>{
 for(const fetchImpl of [async()=>{throw Error("sensitive");},async()=>new Response("bad-json")])await assert.rejects(checkBackendReadiness({url:"https://example.supabase.co",serviceKey:"fixture-secret",fetchImpl}),e=>!e.message.includes("sensitive"));
});
test("production must identify the exact expected committed release",async()=>{
 let n=0;await assert.rejects(verifyProduction({sha:"expected",fetchImpl:async()=>{n++;return Response.json({gitCommitSha:"old",environment:"production",origin:"https://qrguitar.com"});}}));assert.equal(n,1);
});
test("production identity and public app resources must all pass",async()=>{
 const calls=[];await verifyProduction({sha:"expected",fetchImpl:async url=>{calls.push(String(url));if(calls.length===1)return Response.json({gitCommitSha:"expected",environment:"production",origin:"https://qrguitar.com",dirtyWorkingTree:false});if(String(url).endsWith("/api/health"))return Response.json({status:"ready",releaseVersion:RELEASE_VERSION});const type=String(url).endsWith(".webmanifest")?"application/manifest+json":String(url).endsWith(".js")?"application/javascript":"text/html";return new Response("ok",{headers:{"content-type":type}});}});
 assert.equal(calls.length,6);
});
test("bad production resource response does not report release completion",async()=>{
 let n=0;await assert.rejects(verifyProduction({sha:"expected",fetchImpl:async()=>++n===1?Response.json({gitCommitSha:"expected",environment:"production",origin:"https://qrguitar.com"}):new Response("failure",{status:503})}));
});
