import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFileSync}from"node:child_process";
import {test}from"node:test";
import {assertSameCommit,deploymentUrl,parseCurlProbe,stageAndPromote,verifyProduction,verifyDeploymentIdentity,RELEASE_VERSION,RELEASE_CHECKS,releaseMode,runLocalReleaseChecks,stageReleaseForLater,promoteStagedRelease}from"../../../scripts/release-policy.mjs";
import {createReleaseSnapshot,removeReleaseSnapshot}from"../../../scripts/release-snapshot.mjs";
import {PRODUCTION_PROJECT_ID,createStageRecord,validateStageRecord}from"../../../scripts/release-stage-record.mjs";
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
 assert.equal(saved.databaseReadiness,"required-before-promotion");assert.equal(saved.domainAssignment,"skipped");
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
