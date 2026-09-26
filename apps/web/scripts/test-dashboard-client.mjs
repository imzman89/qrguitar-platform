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
  const state={visibilityPendingCodes:[],user:null,authChecked:false,dashboardMessage:"",instruments:[{private:"old"}],transfers:[{private:"old"}],serviceRequests:[],quickEditRecord:{private:"old"},actionRecord:{private:"old"},collectionHandle:"old",collectionAccountType:"shop",searchQuery:"old private serial",recordsLoaded:true,recordsError:""};
  const env={visibilityRequests:{current:new Map()},removalRequests:{current:new Map()},...stateSetters(state),sessionEmail:{current:"old"},accountRevision:{current:0},window:{setTimeout:()=>1,clearTimeout:()=>{}},mapSupabaseUser:compile(functions.get("mapSupabaseUser"),{},"mapSupabaseUser"),createBrowserSupabaseClient:()=>({auth:{getSession:()=>initial.promise,onAuthStateChange:cb=>{listener=cb;return{data:{subscription:{unsubscribe:()=>{unsubscribed=true}}}}}}})};
  const dispose=compile("const effect="+authEffect+";",env,"effect")();
  listener("SIGNED_IN",{user:{email:"new@example.invalid"}});
  assert.equal(state.user.email,"new@example.invalid");assert.deepEqual(state.instruments,[]);assert.equal(state.actionRecord,null);assert.equal(state.quickEditRecord,null);assert.equal(state.collectionHandle,"");assert.equal(state.searchQuery,"");
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
await test("collection search finds identity fields and composes with visibility without searching private notes",async()=>{
  const matches=compile(functions.get("matchesDashboardSearch"),{},"matchesDashboardSearch");
  const visible=compile(functions.get("matchesDashboardFilter"),{},"matchesDashboardFilter");
  const records=[{name:"Stage amplifier",brand:"Fender",model:"Vibroverb",serial:"AB-001",qrCode:"QRG-EXAMPLE",instrumentType:"Amplifier",visibility:"private",summary:"Private repair note"},{name:"Travel acoustic",brand:"Martin",model:"D-18",serial:"CD002",qrCode:"QRG-OTHER",instrumentType:"Acoustic Guitar",visibility:"public"}];
  for(const query of ["FENDER vibro", "ab-001", "qrg-example", "AMPlifier", "  "])assert.equal(matches(records[0],query),true);
  assert.equal(matches(records[0],"Private repair note"),false);
  assert.deepEqual(records.filter(r=>visible(r,"public")&&matches(r,"fender")),[]);
  assert.deepEqual(records.filter(r=>visible(r,"private")&&matches(r,"amp")),[records[0]]);
});
await test("Profile cards keep Edit and Print Suite direct while Quick Edit lives in More",async()=>{
  const cardStart=source.indexOf('<aside className={styles.qrActionColumn}');
  const cardEnd=source.indexOf('</aside>',cardStart);
  const card=source.slice(cardStart,cardEnd);
  assert.match(card,/href=\{`\/edit\/\$\{instrument\.qrCode\}`\}/);
  assert.match(card,/href=\{`\/handout\/\$\{instrument\.qrCode\}`\}/);
  assert.doesNotMatch(card,/setQuickEditRecord\(instrument\)/);
  assert.match(source,/className=\{styles\.drawerQuickEdit\}[\s\S]*setQuickEditRecord\(actionRecord\); setActionRecord\(null\)/);
});
await test("Needs your attention counts only owner-reviewable submissions",async()=>{
  const countStart=source.indexOf("const ownerReviewRequests");
  const countEnd=source.indexOf("const publicRecords",countStart);
  const countSource=source.slice(countStart,countEnd);
  assert.match(countSource,/request\.status === "submitted"/);
  assert.doesNotMatch(countSource,/changes_requested/);
  const panelStart=source.indexOf("{recordsLoaded && ownerReviewRequests > 0");
  const panelEnd=source.indexOf('<div className={styles.collectionControls}>',panelStart);
  assert.doesNotMatch(source.slice(panelStart,panelEnd),/pendingTransfers/);
});
await test("Workspace tools stays closed until an actionable service shortcut opens and focuses it",async()=>{
  const toolsStart=source.indexOf('<details className={styles.toolsArea} id="workspace-tools">');
  const toolsSummary=source.indexOf('<summary>{ui("ui.app.dashboard.page.98d395c5face", "Workspace tools")}</summary>',toolsStart);
  assert.ok(toolsStart>=0&&toolsSummary>toolsStart);assert.doesNotMatch(source.slice(toolsStart,toolsSummary),/\sopen(?:=|\s|>)/);
  assert.match(source,/id="service-requests"[^>]*tabIndex=\{-1\}/);
  const events=[];class Element {}
  class Details { set open(value){this.isOpen=value;events.push("open");} }
  class Region extends Element { focus(options){this.focusOptions=options;events.push("focus");} scrollIntoView(options){this.scrollOptions=options;events.push(`scroll:${options.behavior}`);} }
  const tools=new Details(),region=new Region(),state={dashboardMessage:"old"};
  const focus=compile(functions.get("focusServiceRequests"),{...stateSetters(state),recordsLoaded:true,recordsError:"",ownerReviewRequests:2,document:{getElementById:id=>id==="workspace-tools"?tools:region},window:{matchMedia:()=>({matches:true})},HTMLDetailsElement:Details,HTMLElement:Element},"focusServiceRequests");
  focus();assert.equal(tools.isOpen,true);assert.deepEqual(region.focusOptions,{preventScroll:true});assert.deepEqual(region.scrollOptions,{behavior:"auto",block:"start"});assert.deepEqual(events,["open","focus","scroll:auto"]);
});
await test("ownership activity opens details, focuses its summary, and scrolls smoothly",async()=>{
  class Element {}
  class Summary extends Element { focus(options){this.focusOptions=options;} }
  class Details { constructor(){this.open=false;this.summary=new Summary();} querySelector(value){assert.equal(value,"summary");return this.summary;} scrollIntoView(options){this.options=options;} }
  const section=new Details();const state={dashboardMessage:"old"};
  const focus=compile(functions.get("focusOwnershipTransfers"),{...stateSetters(state),ui:(_key,fallback)=>fallback,recordsLoaded:true,recordsError:"",pendingTransfers:2,document:{getElementById:id=>{assert.equal(id,"ownership-transfers");return section;}},window:{matchMedia:()=>({matches:false})},HTMLElement:Element,HTMLDetailsElement:Details},"focusOwnershipTransfers");
  focus();assert.equal(state.dashboardMessage,"");assert.equal(section.open,true);assert.deepEqual(section.summary.focusOptions,{preventScroll:true});assert.deepEqual(section.options,{behavior:"smooth",block:"start"});
});
await test("ownership activity honors reduced motion and keeps feedback CMS-editable",async()=>{
  class Element {}
  class Summary extends Element { focus(){} }
  class Details { constructor(){this.summary=new Summary();} querySelector(){return this.summary;} scrollIntoView(options){this.options=options;} }
  const section=new Details();const state={dashboardMessage:"old"};const keys=[];
  const env={...stateSetters(state),ui:(key,fallback)=>{keys.push(key);return `Edited: ${fallback}`;},recordsLoaded:true,recordsError:"",pendingTransfers:1,document:{getElementById:()=>section},window:{matchMedia:query=>{assert.equal(query,"(prefers-reduced-motion: reduce)");return{matches:true};}},HTMLElement:Element,HTMLDetailsElement:Details};
  compile(functions.get("focusOwnershipTransfers"),env,"focusOwnershipTransfers")();assert.equal(section.options.behavior,"auto");
  env.pendingTransfers=0;compile(functions.get("focusOwnershipTransfers"),env,"focusOwnershipTransfers")();assert.deepEqual(keys,["ui.app.dashboard.page.f3ccb68e0839"]);assert.match(state.dashboardMessage,/^Edited:/);
});
console.log(count+" dashboard behavior cases passed.");
