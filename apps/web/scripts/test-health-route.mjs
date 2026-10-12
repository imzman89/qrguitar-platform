import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as contract from "../lib/release-readiness.ts";
const web=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),require=createRequire(import.meta.url),ts=require("typescript");
const source=fs.readFileSync(path.join(web,"app/api/health/route.ts"),"utf8");
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function route(db){const module={exports:{}};new Function("require","module","exports",code)(name=>name==="next/server"?{NextResponse:Response}:name.endsWith("/supabase-server")?{createServerSupabaseClientWithTimeout:timeout=>{assert.equal(timeout,8000);return db;}}:contract,module,module.exports);return module.exports;}
const valid=()=>({ready:true,releaseVersion:contract.RELEASE_VERSION,checks:contract.REQUIRED_DATABASE_CHECKS.map(name=>({name,ok:true}))});
test("healthy deployed app checks its own service database and reveals only readiness",async()=>{
 let call;const db={rpc:name=>({abortSignal:async signal=>{call={name,signal};return{data:valid(),error:null};}})};
 const res=await route(db).GET();assert.equal(res.status,200);assert.equal(call.name,"qrguitar_release_readiness");assert.ok(call.signal instanceof AbortSignal);
 assert.deepEqual(await res.json(),{status:"ready",releaseVersion:contract.RELEASE_VERSION});assert.match(res.headers.get("cache-control"),/no-store/);
});
for(const [name,result]of [["missing migration",{error:{code:"PGRST202",message:"private server detail"}}],["historical five-free version",{data:{...valid(),releaseVersion:"2026-09-23.1"}}],["false readiness",{data:{...valid(),ready:false}}],["missing check",{data:{...valid(),checks:[]}}],["bad version",{data:{...valid(),releaseVersion:"old"}}]])test("health fails closed for "+name,async()=>{
 const res=await route({rpc:()=>({abortSignal:async()=>result})}).GET();assert.equal(res.status,503);assert.equal(res.headers.get("retry-after"),"30");assert.deepEqual(await res.json(),{status:"unavailable",releaseVersion:contract.RELEASE_VERSION});
});
test("missing configuration and database transport outage return sanitized503",async()=>{
 for(const db of [null,{rpc:()=>{throw Error("private secret");}}]){const res=await route(db).GET();assert.equal(res.status,503);assert.equal((await res.text()).includes("secret"),false);}
});
test("all documented release entrypoints use the guarded command",()=>{
 const root=path.resolve(web,"../.."),pkg=JSON.parse(fs.readFileSync(path.join(root,"package.json")));
 assert.equal(pkg.scripts["deploy:web"],"npm run push:live");assert.equal(pkg.scripts["push:live"],"node scripts/push-live.mjs");
 const batch=fs.readFileSync(path.join(root,"push-live.cmd"),"utf8");assert.match(batch,/call npm.cmd run push:live/);assert.doesNotMatch(batch,/SUPABASE_SERVICE_ROLE_KEY|vercel.*--prod|Set-Content/);
});

test("health works through a read-only RPC gateway using the actual SDK transport",async()=>{
 const {PostgrestClient}=require("@supabase/postgrest-js");
 const calls=[];
 const db=new PostgrestClient("https://readiness.invalid/rest/v1",{fetch:async(input,init)=>{
  const url=new URL(String(input));calls.push({method:init.method,path:url.pathname,search:url.search,body:init.body});
  if(init.method!=="GET")return Response.json({code:"READ_ONLY_GATEWAY",message:"Writes are not admitted"},{status:405});
  assert.equal(url.pathname,"/rest/v1/rpc/qrguitar_release_readiness");assert.equal(url.search,"");
  return Response.json(valid());
 }});
 const res=await route(db).GET();assert.equal(res.status,200);
 assert.deepEqual(calls,[{method:"GET",path:"/rest/v1/rpc/qrguitar_release_readiness",search:"",body:undefined}]);
 assert.deepEqual(await res.json(),{status:"ready",releaseVersion:contract.RELEASE_VERSION});
});
