import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
// Usage: node test-preview-cleanup-policy.mjs [route.ts] --repo repository-root
// Positional repository-root remains supported; otherwise use QRGUITAR_REPO or the current repository directory.
const args=process.argv.slice(2),repoFlag=args.indexOf('--repo');
if(repoFlag>=0&&!args[repoFlag+1])throw Error('--repo requires a repository-root');
const positional=args.filter((_arg,index)=>repoFlag<0||(index!==repoFlag&&index!==repoFlag+1));
const repo=path.resolve((repoFlag>=0?args[repoFlag+1]:undefined)||positional[1]||process.env.QRGUITAR_REPO||path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..'));
const require=createRequire(path.join(repo,'apps/web/package.json')),ts=require('typescript');
const routePath=path.resolve(positional[0]||path.join(repo,'apps/web/app/api/site-editor/preview/route.ts'));
const {NextRequest}=require('next/server');
const clientPath=path.join(repo,'apps/web/lib/site-preview-client.ts');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function compile(p,modules={},extras={}){
 const source=fs.readFileSync(p,'utf8'),module={exports:{}};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{
 module,exports:module.exports,require:name=>{assert(name in modules,'Unexpected import '+name);return modules[name];},
 Request,Response,Headers,URL,AbortSignal,...extras
 });return module.exports;
}
const forbidden=()=>{throw Error('Auth/backend dependency unexpectedly called');};
const cookieWrites=[];
const route=compile(routePath,{
 'next/server':{NextResponse:{json(body,init){const r=Response.json(body,init);r.cookies={set:(name,value,options)=>cookieWrites.push({name,empty:value==='',...options})};return r;}}},
 '../../../../lib/admin-auth':{getAdminContext:forbidden},
 '../../../../lib/site-preview':{sitePreviewCookie:'qrguitar_site_preview',createSitePreviewToken:forbidden,safePreviewPath:forbidden,sitePreviewMaxAge:300},
 '../../../../lib/site-preview-server':{isSitePreviewAuthorized:forbidden},
 '../../../../lib/supabase-server':{createServerSupabaseClient:forbidden}
});
const cases=[
 {name:'same-origin1273004 legitimate cleanup',url:'http://127.0.0.1:3004',origin:'http://127.0.0.1:3004',site:'same-origin',expected:200},
 {name:'same-originlocalhost3004 legitimate cleanup',url:'http://localhost:3004',origin:'http://localhost:3004',site:'same-origin',expected:200},
 {name:'originalHTTPS55440 same-origin cleanup',url:'https://localhost:55440',origin:'https://localhost:55440',site:'same-origin',expected:200},
 {name:'foreign explicit origin intentionally denied',url:'http://127.0.0.1:3004',origin:'https://foreign.example.invalid',site:'cross-site',expected:403},
 {name:'cross-site metadata denied even matchingOrigin',url:'http://127.0.0.1:3004',origin:'http://127.0.0.1:3004',site:'cross-site',expected:403},
 {name:'opaque null origin intentionally denied',url:'http://127.0.0.1:3004',origin:'null',site:'same-origin',expected:403},
 {name:'differentloopbackalias is distinct origin',url:'http://127.0.0.1:3004',origin:'http://localhost:3004',site:'same-site',expected:403},
 {name:'hypotheticalinternalURLrewrite causes denial despitefrontend sameOrigin',url:'http://localhost:3004',origin:'http://127.0.0.1:3004',site:'same-origin',expected:403},
 {name:'sameOrigin metadata noOrigin header cleanup allowed',url:'http://127.0.0.1:3004',site:'same-origin',expected:200}
];
const results=[];
for(const c of cases){
 cookieWrites.length=0;
 const headers={'sec-fetch-site':c.site};if(c.origin)headers.origin=c.origin;
 const response=await route.DELETE(new Request(c.url+'/api/site-editor/preview',{method:'DELETE',headers}));
 assert.equal(response.status,c.expected,c.name);
 const body=await response.json();assert.equal(body.ok,c.expected===200);
 if(c.expected===200){
  assert.equal(cookieWrites.length,1);assert.equal(cookieWrites[0].maxAge,0);assert.equal(cookieWrites[0].empty,true);
  assert.equal(cookieWrites[0].httpOnly,true);assert.equal(cookieWrites[0].sameSite,'strict');
  assert.equal(cookieWrites[0].secure,c.url.startsWith('https:'));
 }else assert.equal(cookieWrites.length,0);
 results.push({name:c.name,pass:true,status:response.status,requestUrlOrigin:c.url,browserOrigin:c.origin||null,secFetchSite:c.site,cookieMutation:c.expected===200?'synthetic expiration only':'none'});
}
const frameworkCases=[
 {name:'realNextRequest1273004 legitimate cleanup',url:'http://127.0.0.1:3004',host:'127.0.0.1:3004',origin:'http://127.0.0.1:3004',site:'same-origin',expected:200},
 {name:'realNextRequestIPv6 matching exactHost',url:'https://[::1]:55440',host:'[::1]:55440',origin:'https://[::1]:55440',site:'same-origin',expected:200},
 {name:'realNextRequestlocalhost actualOrigin remains normal',url:'http://localhost:3004',host:'localhost:3004',origin:'http://localhost:3004',site:'same-origin',expected:200},
 {name:'realNextRequest127target rejectslocalhostOrigin notcoalescedalias',url:'http://127.0.0.1:3004',host:'127.0.0.1:3004',origin:'http://localhost:3004',site:'same-site',expected:403},
 {name:'realNextRequestlocalhosttarget rejects127Origin',url:'http://localhost:3004',host:'localhost:3004',origin:'http://127.0.0.1:3004',site:'same-site',expected:403},
 {name:'realNextRequestcrosssite remainsdenied matchingorigin',url:'http://127.0.0.1:3004',host:'127.0.0.1:3004',origin:'http://127.0.0.1:3004',site:'cross-site',expected:403},
 {name:'realNextRequestforeignOrigin remainsdenied',url:'http://127.0.0.1:3004',host:'127.0.0.1:3004',origin:'https://foreign.example.invalid',site:'same-origin',expected:403},
 {name:'differentportHost cannotrebase normalizedURL',url:'http://127.0.0.1:3004',host:'127.0.0.1:3005',origin:'http://127.0.0.1:3005',site:'same-origin',expected:403},
 {name:'foreignHost cannotrebase normalizedURL',url:'http://127.0.0.1:3004',host:'foreign.example.invalid:3004',origin:'http://foreign.example.invalid:3004',site:'same-origin',expected:403},
 {name:'forgedforwardedHost cannotrebase normalizedURL',url:'http://127.0.0.1:3004',host:'127.0.0.1:3004',origin:'https://foreign.example.invalid',site:'same-origin',forwarded:'foreign.example.invalid',expected:403},
 {name:'missingHost doesnotrestore normalized127origin',url:'http://127.0.0.1:3004',origin:'http://127.0.0.1:3004',site:'same-origin',expected:403},
 {name:'malformedcommaHost doesnotrestore normalized127origin',url:'http://127.0.0.1:3004',host:'127.0.0.1:3004,foreign.example.invalid',origin:'http://127.0.0.1:3004',site:'same-origin',expected:403},
 {name:'schemebearingHost doesnotrestore normalized127origin',url:'http://127.0.0.1:3004',host:'http://127.0.0.1:3004',origin:'http://127.0.0.1:3004',site:'same-origin',expected:403},
 {name:'mismatchedOriginProtocol stillrejected',url:'http://127.0.0.1:3004',host:'127.0.0.1:3004',origin:'https://127.0.0.1:3004',site:'same-origin',expected:403},
 {name:'realNextRequestnullOrigin stillrejected',url:'http://127.0.0.1:3004',host:'127.0.0.1:3004',origin:'null',site:'same-origin',expected:403},
 {name:'forgedforwardedProtocol cannotrebase realOrigin',url:'http://127.0.0.1:3004',host:'127.0.0.1:3004',origin:'https://127.0.0.1:3004',site:'same-origin',forwardedProtocol:'https',expected:403},
 {name:'ordinaryproductionwww sameorigincleanup unchanged',url:'https://www.qrguitar.com',host:'www.qrguitar.com',origin:'https://www.qrguitar.com',site:'same-origin',expected:200},
 {name:'productionURL rawloopbackHost cannotrebase',url:'https://www.qrguitar.com',host:'127.0.0.1',origin:'https://127.0.0.1',site:'same-origin',expected:403}
];
for(const c of frameworkCases){
 cookieWrites.length=0;const headers={origin:c.origin,'sec-fetch-site':c.site};if(c.host!==undefined)headers.host=c.host;if(c.forwarded)headers['x-forwarded-host']=c.forwarded;if(c.forwardedProtocol)headers['x-forwarded-proto']=c.forwardedProtocol;
 const request=new NextRequest(c.url+'/api/site-editor/preview',{method:'DELETE',headers});
 const response=await route.DELETE(request);const body=await response.json();
 const pass=response.status===c.expected&&body.ok===(c.expected===200)&&cookieWrites.length===(c.expected===200?1:0);
 results.push({name:c.name,pass,status:response.status,expectedStatus:c.expected,requestUrlOrigin:new URL(request.url).origin,browserOrigin:c.origin,host:c.host,secFetchSite:c.site});
}
for(const c of [
 {name:'legitimate127 POST stillrequiresadminauth',admin:{ok:false,status:401,message:'Admin access required'},body:{expectedActorId:'actor-a'},expected:401,message:'Admin access required'},
 {name:'legitimate127 POST rejectsstaleactor',admin:{ok:true,status:200,user:{id:'actor-a'}},body:{expectedActorId:'actor-b'},expected:403,message:'The signed-in editor changed. Reload Site Editor.'},
 {name:'legitimate127 POST rejectscurrentauthorizationrevocation',admin:{ok:true,status:200,user:{id:'actor-a'}},body:{expectedActorId:'actor-a'},expected:403,message:'Preview access could not be confirmed. Reload Site Editor.'}
]){
 cookieWrites.length=0;let created=0;
 const post=compile(routePath,{
  'next/server':{NextResponse:{json(body,init){const r=Response.json(body,init);r.cookies={set:()=>cookieWrites.push('synthetic-set')};return r;}}},
  '../../../../lib/admin-auth':{getAdminContext:async()=>c.admin},
  '../../../../lib/site-preview':{sitePreviewCookie:'qrguitar_site_preview',createSitePreviewToken:()=>{created++;return 'synthetic-not-real-capability';},safePreviewPath:forbidden,sitePreviewMaxAge:300},
  '../../../../lib/site-preview-server':{isSitePreviewAuthorized:async()=>false},
  '../../../../lib/supabase-server':{createServerSupabaseClient:()=>({synthetic:true})}
 });
 const request=new NextRequest('http://127.0.0.1:3004/api/site-editor/preview',{method:'POST',headers:{host:'127.0.0.1:3004',origin:'http://127.0.0.1:3004','sec-fetch-site':'same-origin','content-type':'application/json'},body:JSON.stringify(c.body)});
 const response=await post.POST(request),body=await response.json();
 results.push({name:c.name,pass:response.status===c.expected&&body.message===c.message&&cookieWrites.length===0&&created===(c.name.includes('revocation')?1:0),status:response.status,expectedStatus:c.expected,cookieWrites:cookieWrites.length});
}
const calls=[];let denyCleanup=true;
const client=compile(clientPath,{},{
 fetch:async(_url,init)=>{
  calls.push(init.method);
  if(init.method==='DELETE')return Response.json({ok:!denyCleanup},{status:denyCleanup?403:200});
  return Response.json({ok:true,path:'/',editorActorId:'synthetic-editor'});
 },
 window:{dispatchEvent:()=>{}},CustomEvent:class {constructor(type){this.type=type;}}
});
await assert.rejects(client.invalidateSitePreviewSession(),/Could not clear/);
await assert.rejects(client.openSiteDraftPreview('/','synthetic-editor',async()=>({userId:'synthetic-editor',accessToken:'synthetic-test-placeholder'})),/Could not clear/);
assert.deepEqual(calls,['DELETE','DELETE']);
denyCleanup=false;
const preview=await client.openSiteDraftPreview('/','synthetic-editor',async()=>({userId:'synthetic-editor',accessToken:'synthetic-test-placeholder'}));
assert.equal(preview,'/?cmsPreview=draft');assert.deepEqual(calls.slice(-2),['DELETE','POST']);
results.push({name:'deniedcleanup keepsfailclosed queue; issuanceblockeduntilsuccessfulcleanup',pass:true});
console.log(JSON.stringify({at:new Date().toISOString(),scope:'Actualsource DELETE handler/clientqueue plus installedrealNextRequest with syntheticRequests/stubbedresponsecookies/fetch. NoHTTP/backend/browser/cookie/credentialoperations.',installedNextVersion:require('next/package.json').version,source:{routePath,routeSha256:sha(routePath),clientPath,clientSha256:sha(clientPath)},count:results.length,passed:results.filter(r=>r.pass).length,failed:results.filter(r=>!r.pass).length,results,classification:'RealNextRequest loopbacknormalization reproduced; Senior safeheaders independently confirm legitimate1273004same-originrequest. No authoritativechanges.'},null,2));
process.exitCode=results.some(r=>!r.pass)?1:0;

