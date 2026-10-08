import assert from "node:assert/strict";
import ts from "typescript";
import {readRepo} from "./atomic-test-support.mjs";
const source=readRepo("apps/web/app/api/instruments/route.ts");
function section(start,end){const at=source.indexOf(start),until=source.indexOf(end,at);assert.ok(at>=0&&until>at);return source.slice(at,until);}
async function moduleFor(text){const js=ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;return import("data:text/javascript;base64,"+Buffer.from(js).toString("base64"));}
const authModule=await moduleFor('let allowed=[];const readAdminEmailList=()=>allowed;const normalizeLookupEmail=(v)=>v.toLowerCase();\n'+section("async function canManageRecordVerification","async function canApproveSerialCorrection")+'\nexport{canManageRecordVerification};export function allow(email){allowed=[email];}');
const db=(role)=>({from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{role}})})})})});
assert.equal(await authModule.canManageRecordVerification(db("owner"),{email:"member@example.test",id:"member"}),false);
assert.equal(await authModule.canManageRecordVerification(db("admin"),{email:"admin@example.test",id:"admin"}),true);
console.log("PASS default member role owner cannot approve verification; admin can");
authModule.allow("operator@example.test");
assert.equal(await authModule.canManageRecordVerification(db("owner"),{email:"operator@example.test",id:"operator"}),true);
console.log("PASS explicit server-configured operator allowlist remains authorized");
const rest=await moduleFor('const getSupabaseEnvStatus=()=>({supabaseUrl:"https://test.invalid",hasServiceRoleKey:true,hasAnonKey:false});const supabaseHttpsJson=async(path,options)=>({path,options});\n'+section("async function restGet<T>","async function loadPublicRecordsFast")+'\nexport{restGet};');
const result=await rest.restGet("qr_redirects?select=guitar_id",500,1);
assert.equal(result.options.serviceRole,true);assert.equal(result.path,"/rest/v1/qr_redirects?select=guitar_id");
console.log("PASS route server reads work with service credentials and no anon key");
const document=await moduleFor('const DOCUMENT_BUCKET="instrument-documents";const supabaseSignedStorageUrl=async(bucket,source,ttl)=>({bucket,source,ttl});\n'+section("async function resolveDocumentSource","async function resolveImageSources")+'\nexport{resolveDocumentSource};');
assert.deepEqual(await document.resolveDocumentSource({}, "owner/guitar/private.pdf"),{bucket:"instrument-documents",source:"owner/guitar/private.pdf",ttl:3600});
console.log("PASS owner document links are signed for the private bucket");

