import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFileSync}from"node:child_process";
import {test}from"node:test";
import {assertSameCommit,deploymentUrl,parseCurlProbe,stageAndPromote,verifyProduction,RELEASE_VERSION}from"../../../scripts/release-policy.mjs";
import {createReleaseSnapshot,removeReleaseSnapshot}from"../../../scripts/release-snapshot.mjs";
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
