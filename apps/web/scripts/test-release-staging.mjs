import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFileSync}from"node:child_process";
import {test}from"node:test";
import {assertSameCommit,deploymentUrl,parseDeploymentJson,parseCurlProbe,stageAndPromote,verifyProduction,verifyDeploymentIdentity,RELEASE_VERSION,RELEASE_CHECKS,releaseMode,runLocalReleaseChecks,stageReleaseForLater,promoteStagedRelease}from"../../../scripts/release-policy.mjs";
import {createReleaseSnapshot,removeReleaseSnapshot,cleanupReleaseSnapshot}from"../../../scripts/release-snapshot.mjs";
import {PRODUCTION_PROJECT_ID,createStageRecord,validateStageRecord}from"../../../scripts/release-stage-record.mjs";
import {VERCEL_VERSION,findVercelEntrypoint,validateVercelEntrypoint,resolveVercelCli}from"../../../scripts/vercel-cli.mjs";
test("changed commit cannot pass a clean-tree-only release guard",()=>assert.throws(()=>assertSameCommit("new","old")));
test("staging is verified before domain promotion",async()=>{const events=[];await stageAndPromote({unchanged:()=>events.push("check"),stage:()=>{events.push("stage");return"https://fixture.vercel.app";},verify:url=>events.push("verify:"+url),promote:url=>events.push("promote:"+url)});assert.deepEqual(events,["check","stage","check","verify:https://fixture.vercel.app","check","promote:https://fixture.vercel.app"]);});
for(const failed of ["stage","verify","changedAfterStage","changedAfterVerify"])test(failed+" never promotes",async()=>{
 let n=0,promoted=false;await assert.rejects(stageAndPromote({unchanged:()=>{n++;if((failed==="changedAfterStage"&&n===2)||(failed==="changedAfterVerify"&&n===3))throw Error("commit changed");},stage:()=>{if(failed==="stage")throw Error();return"https://fixture.vercel.app";},verify:()=>{if(failed==="verify")throw Error("wrong database");},promote:()=>{promoted=true;}}));assert.equal(promoted,false);
});
test("only a single HTTPS Vercel deployment URL is accepted",()=>{assert.equal(deploymentUrl("https://fixture.vercel.app\n"),"https://fixture.vercel.app");for(const input of ["https://evil.invalid","https://u:p@fixture.vercel.app","http://fixture.vercel.app","https://fixture.vercel.app/path","https://fixture.vercel.app?secret=x","multiple\nhttps://fixture.vercel.app"])assert.throws(()=>deploymentUrl(input));});
test("staged probe preserves HTTP status and content type without printing body",async()=>{
 const res=parseCurlProbe('{"status":"ready"}\n__QRG_STATUS__:200\n__QRG_TYPE__:application/json\n');
 assert.equal(res.status,200);assert.equal(res.headers.get("content-type"),"application/json");assert.deepEqual(await res.json(),{status:"ready"});
 assert.throws(()=>parseCurlProbe("not a framed HTTP response"));
});
test("staged identity cannot silently be satisfied by the current live site",async()=>{
 await assert.rejects(verifyProduction({sha:"expected",staged:true,origin:"https://fixture.vercel.app",fetchImpl:async()=>Response.json({gitCommitSha:"expected",environment:"production",origin:"https://qrguitar.com"})}));
});
test("staged production backend failure stops smoke verification",async()=>{
 let n=0;await assert.rejects(verifyProduction({sha:"expected",staged:true,origin:"https://fixture.vercel.app",fetchImpl:async()=>++n===1?Response.json({gitCommitSha:"expected",environment:"production",origin:"https://fixture.vercel.app"}):Response.json({status:"unavailable",releaseVersion:RELEASE_VERSION},{status:503})}));
});
test("immutable archive excludes ignored secrets and concurrent checkout edits",()=>{
 const fixture=fs.mkdtempSync(path.join(os.tmpdir(),"qrguitar-snapshot-test-"));let snapshot;
 try{
  const git=(...args)=>execFileSync("git",args,{cwd:fixture,encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();
  git("init");fs.writeFileSync(path.join(fixture,".gitignore"),".env.local\n");fs.writeFileSync(path.join(fixture,"tracked.txt"),"reviewed");git("add",".");git("-c","user.name=QA","-c","user.email=qa@example.invalid","commit","-m","fixture");const sha=git("rev-parse","HEAD");
  fs.writeFileSync(path.join(fixture,"tracked.txt"),"concurrent edit");fs.writeFileSync(path.join(fixture,".env.local"),"fixture-secret");fs.writeFileSync(path.join(fixture,"untracked.txt"),"unreviewed");
  snapshot=createReleaseSnapshot(fixture,sha,'{"projectId":"fixture"}');
  assert.equal(fs.readFileSync(path.join(snapshot,"tracked.txt"),"utf8"),"reviewed");assert.equal(fs.existsSync(path.join(snapshot,".env.local")),false);assert.equal(fs.existsSync(path.join(snapshot,"untracked.txt")),false);assert.equal(fs.existsSync(path.join(snapshot,".git")),false);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(snapshot,".vercel/project.json"))),{projectId:"fixture"});
  assert.throws(()=>removeReleaseSnapshot(fixture));assert.equal(fs.existsSync(fixture),true);
 }finally{
  if(snapshot)removeReleaseSnapshot(snapshot);
  const target=path.resolve(fixture);if(path.dirname(target)!==path.resolve(os.tmpdir())||!path.basename(target).startsWith("qrguitar-snapshot-test-"))throw Error("Unsafe fixture cleanup");fs.rmSync(target,{recursive:true,force:true});
 }
});

const fixtureSha="a".repeat(40);
const fixtureUrl="https://fixture.vercel.app";
const fixtureTimestamp="2026-09-14T12:00:00.000Z";
const recordContext={projectId:PRODUCTION_PROJECT_ID,gitSha:fixtureSha};
const validRecord=()=>createStageRecord({...recordContext,url:fixtureUrl,
 releaseEnvironment:{QRGUITAR_BUILD_ENV:"production",QRGUITAR_GIT_SHA:fixtureSha,QRGUITAR_BUILD_TIMESTAMP:fixtureTimestamp,QRGUITAR_BUILD_DIRTY:"false",NEXT_PUBLIC_SITE_URL:"https://qrguitar.com"},
 startedAt:fixtureTimestamp,completedAt:"2026-09-14T12:01:00.000Z",stagedAt:"2026-09-14T12:02:00.000Z"});

test("release modes are explicit and conflicting or unknown arguments fail closed",()=>{
 assert.equal(releaseMode([]),"normal");assert.equal(releaseMode(["--stage-only"]),"stage-only");assert.equal(releaseMode(["--promote-staged"]),"promote-staged");
 for(const args of [["--stage-only","--promote-staged"],["--skip-checks"],["--promote-staged",fixtureUrl],["--stage-only","--stage-only"]])assert.throws(()=>releaseMode(args));
});

test("stage-only runs every local gate, verifies identity, and records a deployment without database or promotion",async()=>{
 const events=[];let saved;
 await stageReleaseForLater({unchanged:()=>events.push("unchanged"),
  runChecks:()=>runLocalReleaseChecks(args=>events.push(args)),stage:()=>{events.push("stage");return fixtureUrl;},
  verifyIdentity:url=>events.push("identity:"+url),saveRecord:url=>{events.push("record");saved=validRecord();assert.equal(saved.deploymentUrl,url);},
  checkBackend:()=>assert.fail("stage-only must defer the database"),promote:()=>assert.fail("stage-only must not assign domains")});
 assert.deepEqual(events,["unchanged",...RELEASE_CHECKS,"unchanged","stage","unchanged","identity:"+fixtureUrl,"unchanged","record"]);
 assert.equal(saved.databaseReadiness,"required-before-promotion");assert.equal(saved.domainAssignment,"custom-domains-skipped");
});

for(const failure of ["checks","stage","identity","changedAfterChecks","changedAfterStage","changedAfterIdentity"])test("stage-only "+failure+" never writes a promotable record",async()=>{
 let guard=0,saved=false;
 await assert.rejects(stageReleaseForLater({unchanged:()=>{guard++;if((failure==="changedAfterChecks"&&guard===2)||(failure==="changedAfterStage"&&guard===3)||(failure==="changedAfterIdentity"&&guard===4))throw Error("changed");},
  runChecks:()=>{if(failure==="checks")throw Error("checks");},stage:()=>{if(failure==="stage")throw Error("stage");return fixtureUrl;},
  verifyIdentity:()=>{if(failure==="identity")throw Error("identity");},saveRecord:()=>{saved=true;}}));
 assert.equal(saved,false);
});

test("stage-only identity can pass before database migration without probing health",async()=>{
 const calls=[];await verifyDeploymentIdentity({sha:fixtureSha,buildTimestamp:fixtureTimestamp,origin:fixtureUrl,staged:true,fetchImpl:async url=>{
  calls.push(String(url));return Response.json({gitCommitSha:fixtureSha,buildTimestamp:fixtureTimestamp,environment:"production",origin:fixtureUrl,dirtyWorkingTree:false});}});
 assert.deepEqual(calls,[fixtureUrl+"/api/build-info?release="+fixtureSha]);
});

test("same-SHA deployment with a different recorded build timestamp is rejected",async()=>{
 await assert.rejects(verifyProduction({sha:fixtureSha,buildTimestamp:fixtureTimestamp,origin:fixtureUrl,staged:true,fetchImpl:async()=>
  Response.json({gitCommitSha:fixtureSha,buildTimestamp:"2026-09-14T13:00:00.000Z",environment:"production",origin:fixtureUrl})}));
});

test("stage record contains exact successful local checks and no credentials",()=>{
 const record=validRecord();assert.equal(validateStageRecord(JSON.parse(JSON.stringify(record)),recordContext).gitSha,fixtureSha);
 assert.deepEqual(record.checks.commands,RELEASE_CHECKS);assert.equal(Object.keys(record.releaseEnvironment).length,5);
});

for(const [name,mutate]of[
 ["missing record",()=>null],["wrong project",r=>({...r,projectId:"other"})],["wrong SHA",r=>({...r,gitSha:"b".repeat(40)})],
 ["abbreviated SHA",r=>({...r,gitSha:fixtureSha.slice(0,7)})],["foreign deployment URL",r=>({...r,deploymentUrl:"https://evil.invalid"})],
 ["domain already assigned",r=>({...r,domainAssignment:"assigned"})],["missing audit check",r=>({...r,checks:{...r.checks,commands:r.checks.commands.slice(0,-1)}})],
 ["failed checks",r=>({...r,checks:{...r.checks,status:"failed"}})],["invalid timestamp order",r=>({...r,stagedAt:fixtureTimestamp})],
 ["wrong runtime SHA",r=>({...r,releaseEnvironment:{...r.releaseEnvironment,QRGUITAR_GIT_SHA:"b".repeat(40)}})],
 ["preview environment",r=>({...r,releaseEnvironment:{...r.releaseEnvironment,QRGUITAR_BUILD_ENV:"preview"}})],
 ["credential in environment",r=>({...r,releaseEnvironment:{...r.releaseEnvironment,SUPABASE_SERVICE_ROLE_KEY:"fixture-secret"}})]
])test("invalid saved "+name+" cannot reach database or promotion",async()=>{
 const events=[];await assert.rejects(promoteStagedRelease({unchanged:()=>{},loadRecord:()=>validateStageRecord(mutate(structuredClone(validRecord())),recordContext),
  checkBackend:()=>events.push("database"),verify:()=>events.push("verify"),promote:()=>events.push("promote"),verifyLive:()=>events.push("public")}));
 assert.deepEqual(events,[]);
});

test("promotion verifies database and exact saved deployment before assigning domains, then verifies public production",async()=>{
 const events=[];await promoteStagedRelease({unchanged:()=>events.push("unchanged"),loadRecord:()=>{events.push("record");return validateStageRecord(validRecord(),recordContext);},
  checkBackend:()=>events.push("database"),verify:url=>events.push("verify:"+url),promote:url=>events.push("promote:"+url),verifyLive:()=>events.push("public")});
 assert.deepEqual(events,["unchanged","record","database","unchanged","verify:"+fixtureUrl,"unchanged","promote:"+fixtureUrl,"public"]);
});

for(const failure of ["database","verify","changedAfterDatabase","changedAfterVerify"])test("staged promotion "+failure+" never assigns domains",async()=>{
 let guard=0,promoted=false,publicProbe=false;await assert.rejects(promoteStagedRelease({unchanged:()=>{guard++;if((failure==="changedAfterDatabase"&&guard===2)||(failure==="changedAfterVerify"&&guard===3))throw Error("changed");},
  loadRecord:()=>validRecord(),checkBackend:()=>{if(failure==="database")throw Error("not ready");},verify:()=>{if(failure==="verify")throw Error("wrong deployment");},
  promote:()=>{promoted=true;},verifyLive:()=>{publicProbe=true;}}));assert.equal(promoted,false);assert.equal(publicProbe,false);
});

test("public verification failure is reported after promotion rather than claiming domains were unchanged",async()=>{
 let promoted=false;await assert.rejects(promoteStagedRelease({unchanged:()=>{},loadRecord:()=>validRecord(),checkBackend:()=>{},verify:()=>{},promote:()=>{promoted=true;},verifyLive:()=>{throw Error("public verification failed");}}));
 assert.equal(promoted,true);
});

const deploymentJson=()=>({id:"dpl_Fixture123",url:fixtureUrl,inspectorUrl:"https://vercel.com/team/project/Fixture123",readyState:"READY",target:"production",deploymentApiUrl:"https://api.vercel.com/v13/deployments/dpl_Fixture123"});
test("CLI59.15.1 deployment JSON is accepted directly and in its agent envelope",()=>{
 const expected={id:"dpl_Fixture123",url:fixtureUrl};
 assert.deepEqual(parseDeploymentJson(JSON.stringify(deploymentJson())),expected);
 assert.deepEqual(parseDeploymentJson(JSON.stringify({status:"ok",deployment:deploymentJson(),message:"Deployment ready.",next:[]})),expected);
});
for(const [name,change]of[
 ["building",d=>({...d,readyState:"BUILDING"})],["canceled",d=>({...d,readyState:"CANCELED"})],
 ["preview",d=>({...d,target:"preview"})],["missing ID",d=>({...d,id:undefined})],
 ["bad API identity",d=>({...d,deploymentApiUrl:"https://api.vercel.com/v13/deployments/dpl_Other"})],
 ["foreign API",d=>({...d,deploymentApiUrl:"https://other.invalid/v13/deployments/"+d.id})],
 ["custom domain",d=>({...d,url:"https://qrguitar.com"})],["foreign URL",d=>({...d,url:"https://other.invalid"})],
 ["multiple URL lines",d=>({...d,url:fixtureUrl+"\nhttps://other.vercel.app"})],
 ["failed checks",d=>({...d,error:{name:"CHECKS_FAILED",message:"fixture failure"}})],
 ["failed agent envelope",d=>({status:"error",deployment:d})]
])test("structured "+name+" deployment never creates a staged release record",async()=>{
 let saved=false;await assert.rejects(stageReleaseForLater({unchanged:()=>{},runChecks:()=>{},stage:()=>parseDeploymentJson(JSON.stringify(change(deploymentJson()))).url,
  verifyIdentity:()=>assert.fail("Invalid deployment cannot reach identity checks."),saveRecord:()=>{saved=true;}}));assert.equal(saved,false);
});
test("human output or mixed JSON output cannot be mistaken for a deployment",()=>{
 for(const input of ["▲ Production "+fixtureUrl,fixtureUrl,"null","[]",JSON.stringify(deploymentJson())+"\n▲ Aliased https://stable.vercel.app",JSON.stringify(deploymentJson())+JSON.stringify(deploymentJson())])assert.throws(()=>parseDeploymentJson(input));
});
test("snapshot cleanup permission failure keeps the primary release error and identifies only the verified retained directory",()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),"qrguitar-release-"));
 try{
  const primary=Error("Primary deployment parsing failed");const warnings=[];
  assert.throws(()=>{try{throw primary;}finally{
   assert.equal(cleanupReleaseSnapshot(directory,{remove:()=>{throw Object.assign(Error("fixture permission failure"),{code:"EPERM"});},warn:message=>warnings.push(message)}),false);
  }},error=>error===primary);
  assert.equal(warnings.length,1);assert.ok(warnings[0].includes(path.resolve(directory)));assert.equal(fs.existsSync(directory),true);
 }finally{removeReleaseSnapshot(directory);}
});
test("cleanup never calls removal for an unverified path and tolerates an already removed owned snapshot",()=>{
 let removed=false;const warnings=[];
 assert.equal(cleanupReleaseSnapshot(path.join(os.tmpdir(),"unrelated-release"),{remove:()=>{removed=true;},warn:message=>warnings.push(message)}),false);
 assert.equal(removed,false);assert.equal(warnings.length,1);
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),"qrguitar-release-"));
 assert.equal(cleanupReleaseSnapshot(directory),true);assert.equal(fs.existsSync(directory),false);assert.equal(cleanupReleaseSnapshot(directory),true);
});

function withCliFixture(fn) {
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),"qrguitar-cli-test-"));
 try {
  const bins=path.join(directory,"node_modules",".bin"),packageRoot=path.join(directory,"node_modules","vercel"),entrypoint=path.join(packageRoot,"dist","vc.js");
  fs.mkdirSync(bins,{recursive:true});fs.mkdirSync(path.dirname(entrypoint),{recursive:true});
  fs.writeFileSync(path.join(packageRoot,"package.json"),JSON.stringify({name:"vercel",version:VERCEL_VERSION,bin:{vercel:"./dist/vc.js"}}));
  fs.writeFileSync(entrypoint,"process.stdout.write(JSON.stringify(process.argv.slice(2)));\n");
  return fn({directory,bins,packageRoot,entrypoint:fs.realpathSync(entrypoint)});
 } finally {
  const target=path.resolve(directory);if(path.dirname(target)!==path.resolve(os.tmpdir())||!path.basename(target).startsWith("qrguitar-cli-test-"))throw Error("Unsafe fixture cleanup");
  fs.rmSync(target,{recursive:true,force:true,maxRetries:3,retryDelay:200});
 }
}

test("pinned CLI discovery and direct execution preserve curl separators, newlines, percent templates, and spaced arguments",()=>withCliFixture(({bins,entrypoint})=>{
 const resolved=resolveVercelCli("fixture-npx",args=>{
  assert.deepEqual(args.slice(0,6),["fixture-npx","--yes","--package","vercel@"+VERCEL_VERSION,"--","node"]);
  assert.ok(path.isAbsolute(args[6]));assert.equal(args.length,7);
  return execFileSync(process.execPath,[args[6]],{env:{...process.env,PATH:bins},encoding:"utf8"});
 });
 assert.equal(resolved,entrypoint);
 const args=["curl","/api/build-info?release=fixture","--deployment","https://fixture.vercel.app","--","--header","Cache-Control: no-cache","--write-out","\n__QRG_STATUS__:%{http_code}\n__QRG_TYPE__:%{content_type}\n"];
 assert.deepEqual(JSON.parse(execFileSync(process.execPath,[resolved,...args],{encoding:"utf8"})),args);
}));

test("CLI discovery rejects missing or unpinned packages and unsafe entrypoints",()=>withCliFixture(({bins,packageRoot,entrypoint})=>{
 assert.equal(findVercelEntrypoint(bins),entrypoint);
 assert.throws(()=>findVercelEntrypoint(""));assert.throws(()=>validateVercelEntrypoint("relative/vc.js"));
 for(const metadata of [{name:"other",version:VERCEL_VERSION,bin:{vercel:"./dist/vc.js"}},{name:"vercel",version:"0.0.0",bin:{vercel:"./dist/vc.js"}},{name:"vercel",version:VERCEL_VERSION,bin:{vercel:"../../unrelated.js"}}]) {
  fs.writeFileSync(path.join(packageRoot,"package.json"),JSON.stringify(metadata));assert.throws(()=>findVercelEntrypoint(bins));assert.throws(()=>validateVercelEntrypoint(entrypoint));
 }
}));

test("CLI resolver rejects ambiguous output or unpinned metadata before commands can run",()=>withCliFixture(({entrypoint})=>{
 for(const output of ["not json",JSON.stringify({version:"0.0.0",entrypoint}),JSON.stringify({version:VERCEL_VERSION,entrypoint,other:true}),JSON.stringify({version:VERCEL_VERSION,entrypoint:"relative.js"})])assert.throws(()=>resolveVercelCli("fixture-npx",()=>output));
 assert.throws(()=>resolveVercelCli("fixture-npx",()=>{throw Error("npm resolution failed");}),/npm resolution failed/);
}));

test("native Git snapshot preserves exact reviewed identity without ignored secrets or source hooks",()=>{
 const fixture=fs.mkdtempSync(path.join(os.tmpdir(),"qrguitar-snapshot-test-"));let snapshot;
 try{
  const git=(...args)=>execFileSync("git",args,{cwd:fixture,encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();
  git("init","--template=");git("remote","add","origin","https://github.com/imzman89/qrguitar-platform-live.git");
  fs.writeFileSync(path.join(fixture,".gitignore"),".env.local\n");fs.writeFileSync(path.join(fixture,"tracked.txt"),"reviewed");
  git("add",".");git("-c","user.name=QA","-c","user.email=qa@example.invalid","commit","-m","reviewed");const sha=git("rev-parse","HEAD"),tree=git("rev-parse","HEAD^{tree}");
  // Even a later source commit must not change which tree the snapshot contains.
  fs.writeFileSync(path.join(fixture,"tracked.txt"),"later commit");git("add",".");git("-c","user.name=QA","-c","user.email=qa@example.invalid","commit","-m","later");
  fs.writeFileSync(path.join(fixture,"tracked.txt"),"uncommitted work");fs.writeFileSync(path.join(fixture,".env.local"),"fixture-secret");fs.writeFileSync(path.join(fixture,"untracked.txt"),"unreviewed");
  git("config","private.fixture","not-for-deployment");const before=git("status","--porcelain");
  snapshot=createReleaseSnapshot(fixture,sha,'{"projectId":"fixture"}',{includeGitMetadata:true});
  const snapGit=(...args)=>execFileSync("git",args,{cwd:snapshot,encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();
  assert.equal(snapGit("rev-parse","HEAD"),sha);assert.equal(snapGit("rev-parse","HEAD^{tree}"),tree);
  assert.equal(snapGit("remote","get-url","origin"),"https://github.com/imzman89/qrguitar-platform-live.git");
  assert.equal(snapGit("status","--porcelain","--untracked-files=all"),"");
  assert.equal(fs.readFileSync(path.join(snapshot,"tracked.txt"),"utf8"),"reviewed");
  for(const file of [".env.local","untracked.txt"])assert.equal(fs.existsSync(path.join(snapshot,file)),false);
  assert.doesNotMatch(fs.readFileSync(path.join(snapshot,".git/config"),"utf8"),/not-for-deployment|private\.fixture/);
  assert.deepEqual(fs.readdirSync(snapGit("config","core.hooksPath")),[]);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(snapshot,".vercel/project.json"))),{projectId:"fixture"});
  assert.equal(git("status","--porcelain"),before);assert.equal(fs.readFileSync(path.join(fixture,"tracked.txt"),"utf8"),"uncommitted work");
  removeReleaseSnapshot(snapshot);snapshot=undefined;
  git("remote","set-url","origin","https://github.com/imzman89/qrguitar-platform.git");
  assert.throws(()=>createReleaseSnapshot(fixture,sha,undefined,{includeGitMetadata:true}),/Unexpected QRguitar release remote/);
 }finally{
  if(snapshot)removeReleaseSnapshot(snapshot);
  const target=path.resolve(fixture);if(path.dirname(target)!==path.resolve(os.tmpdir())||!path.basename(target).startsWith("qrguitar-snapshot-test-"))throw Error("Unsafe fixture cleanup");fs.rmSync(target,{recursive:true,force:true});
 }
});

test("Vercel staging independently requires the native platform SHA",async()=>{
 const sha="a".repeat(40),base={gitCommitSha:sha,environment:"production",origin:fixtureUrl,dirtyWorkingTree:false};
 for(const platformGitCommitSha of [undefined,"b".repeat(40)])await assert.rejects(verifyDeploymentIdentity({sha,platformGitCommitSha:sha,origin:fixtureUrl,staged:true,fetchImpl:async()=>Response.json({...base,platformGitCommitSha})}));
 const identity=await verifyDeploymentIdentity({sha,platformGitCommitSha:sha,origin:fixtureUrl,staged:true,fetchImpl:async()=>Response.json({...base,platformGitCommitSha:sha})});assert.equal(identity.platformGitCommitSha,sha);
 let healthProbed=false;
 await assert.rejects(verifyProduction({sha,platformGitCommitSha:sha,origin:fixtureUrl,staged:true,fetchImpl:async url=>{if(String(url).includes('/api/health'))healthProbed=true;return Response.json(base)}}));assert.equal(healthProbed,false);
});
