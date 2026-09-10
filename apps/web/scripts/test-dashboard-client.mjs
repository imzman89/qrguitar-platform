import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const ts=createRequire(process.env.QRGUITAR_SOURCE_ROOT ? path.join(process.env.QRGUITAR_SOURCE_ROOT,"package.json") : import.meta.url)("typescript");
const source=fs.readFileSync(path.join(root,"app/dashboard/page.tsx"),"utf8");
const ast=ts.createSourceFile("dashboard.tsx",source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const functions=new Map(),effects=[];
function visit(n){if(ts.isFunctionDeclaration(n)&&n.name)functions.set(n.name.text,n.getText(ast));if(ts.isCallExpression(n)&&n.expression.getText(ast)==="useEffect")effects.push(n.arguments[0].getText(ast));ts.forEachChild(n,visit);}visit(ast);
function compile(code,env,ret){const js=ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;return new Function(...Object.keys(env),js+"\nreturn "+ret)(...Object.values(env));}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}};
let count=0;async function test(name,fn){await fn();count++;console.log("PASS "+name);}
for(const [name,key] of [["loadDashboardInstruments","instruments"],["loadDashboardTransfers","transfers"],["loadOwnerServiceRequests","submissions"]]){
  for(const outcome of ["empty","503","malformed","missing-token"]){
    await test(name+" "+outcome+" distinguishes empty data from failure",async()=>{
      let called=false,seenSignal;const controller=new AbortController();
      const fn=compile(functions.get(name),{fetch:async(_url,init)=>{called=true;seenSignal=init.signal;assert.equal(init.cache,"no-store");return outcome==="empty"?Response.json({ok:true,[key]:[]}):outcome==="503"?Response.json({ok:false},{status:503}):Response.json({ok:true});}},name);
      const args=name==="loadDashboardInstruments"?[outcome==="missing-token"?"":"token",false,controller.signal]:[outcome==="missing-token"?"":"token",controller.signal];
      if(outcome==="empty")assert.deepEqual(await fn(...args),[]);else await assert.rejects(fn(...args));
      if(outcome==="missing-token")assert.equal(called,false);else assert.equal(seenSignal,controller.signal);
    });
  }
}
function stateSetters(state){const setters={};for(const key of Object.keys(state))setters["set"+key[0].toUpperCase()+key.slice(1)]=value=>{state[key]=typeof value==="function"?value(state[key]):value};return setters;}
const authEffect=effects.find(e=>e.includes("let authResolved"));
const recordsEffect=effects.find(e=>e.includes("loadDashboardInstruments(token"));
await test("late initial session cannot replace a newer account event",async()=>{
  const initial=deferred();let listener,unsubscribed=false;
  const state={visibilityPendingCodes:[],user:null,authChecked:false,dashboardMessage:"",instruments:[{private:"old"}],transfers:[{private:"old"}],serviceRequests:[],quickEditRecord:{private:"old"},actionRecord:{private:"old"},collectionHandle:"old",collectionAccountType:"shop",recordsLoaded:true,recordsError:""};
  const env={visibilityRequests:{current:new Map()},removalRequests:{current:new Map()},...stateSetters(state),sessionEmail:{current:"old"},accountRevision:{current:0},window:{setTimeout:()=>1,clearTimeout:()=>{}},mapSupabaseUser:compile(functions.get("mapSupabaseUser"),{},"mapSupabaseUser"),createBrowserSupabaseClient:()=>({auth:{getSession:()=>initial.promise,onAuthStateChange:cb=>{listener=cb;return{data:{subscription:{unsubscribe:()=>{unsubscribed=true}}}}}}})};
  const dispose=compile("const effect="+authEffect+";",env,"effect")();
  listener("SIGNED_IN",{user:{email:"new@example.invalid"}});
  assert.equal(state.user.email,"new@example.invalid");assert.deepEqual(state.instruments,[]);assert.equal(state.actionRecord,null);assert.equal(state.quickEditRecord,null);assert.equal(state.collectionHandle,"");
  initial.resolve({data:{session:{user:{email:"old@example.invalid"}}}});await tick();assert.equal(state.user.email,"new@example.invalid");
  listener("SIGNED_OUT",null);assert.equal(state.user,null);assert.deepEqual(state.transfers,[]);assert.equal(state.recordsLoaded,false);dispose();assert.equal(unsubscribed,true);
});
function recordsHarness(overrides={}){
  const state={loadingRecords:false,recordsError:"",instruments:[{id:"last-loaded"}],transfers:[],serviceRequests:[],recordsLoaded:true};
  const revision={current:1};let timer;
  const env={...stateSetters(state),user:{email:"owner@example.invalid"},accountRevision:revision,AbortController,
    window:{setTimeout:cb=>{timer=cb;return 1},clearTimeout:()=>{}},getSupabaseAccessToken:async()=>"token",
    loadDashboardInstruments:async()=>[{id:"new"}],loadDashboardTransfers:async()=>[],loadOwnerServiceRequests:async()=>[],mergeDashboardRecords:value=>value,...overrides};
  const dispose=compile("const effect="+recordsEffect+";",env,"effect")();return{state,revision,dispose,timeout:()=>timer()};
}
await test("failed refresh preserves last loaded collection and exposes failure",async()=>{
  const h=recordsHarness({loadDashboardInstruments:async()=>{throw new Error("Profiles unavailable");}});await tick();
  assert.deepEqual(h.state.instruments,[{id:"last-loaded"}]);assert.equal(h.state.recordsError,"Profiles unavailable");assert.equal(h.state.loadingRecords,false);h.dispose();
});
await test("service outage cannot be counted as zero service requests",async()=>{
  const h=recordsHarness({loadOwnerServiceRequests:async()=>{throw new Error("Service unavailable");}});await tick();
  assert.equal(h.state.recordsError,"Service unavailable");assert.deepEqual(h.state.instruments,[{id:"last-loaded"}]);h.dispose();
});
await test("old account collection response cannot populate the new account",async()=>{
  const d=deferred();const h=recordsHarness({loadDashboardInstruments:async()=>d.promise});
  h.revision.current++;h.state.instruments=[];d.resolve([{private:"old-account"}]);await tick();assert.deepEqual(h.state.instruments,[]);h.dispose();
});
await test("deadline aborts and ignores even a late successful response",async()=>{
  const d=deferred();let signal;
  const h=recordsHarness({loadDashboardInstruments:async(_t,_r,s)=>{signal=s;return d.promise;}});await tick();h.timeout();
  assert.equal(signal.aborted,true);assert.equal(h.state.loadingRecords,false);assert.match(h.state.recordsError,/too long/);
  d.resolve([{private:"late"}]);await tick();assert.deepEqual(h.state.instruments,[{id:"last-loaded"}]);h.dispose();
});
await test("completed collection snapshot updates all counts together",async()=>{
  const h=recordsHarness();await tick();assert.deepEqual(h.state.instruments,[{id:"new"}]);assert.equal(h.state.recordsLoaded,true);assert.equal(h.state.recordsError,"");assert.equal(h.state.loadingRecords,false);h.dispose();
});
console.log(count+" dashboard behavior cases passed.");
