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
function variableInitializer(name){const matches=[];function find(node){if(ts.isVariableDeclaration(node)&&node.name.getText(ast)===name)matches.push(node);ts.forEachChild(node,find);}find(ast);assert.equal(matches.length,1,"Exactly one "+name+" declaration must exist");assert.ok(matches[0].initializer,name+" must have an initializer");return matches[0].initializer;}
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
function stateSetters(state){const setters={};for(const key of new Set([...Object.keys(state),"loadingRecords"]))setters["set"+key[0].toUpperCase()+key.slice(1)]=value=>{state[key]=typeof value==="function"?value(state[key]):value};return setters;}
const authEffect=effects.find(e=>e.includes("let authResolved"));
const recordsEffect=effects.find(e=>e.includes("loadDashboardInstruments(token"));
await test("late initial session cannot replace a newer account event",async()=>{
  const initial=deferred();let listener,unsubscribed=false;
  const state={visibilityPendingCodes:[],user:null,authChecked:false,sessionError:"check-failed",dashboardMessage:"",instruments:[{private:"old"}],transfers:[{private:"old"}],serviceRequests:[],quickEditRecord:{private:"old"},actionRecord:{private:"old"},collectionHandle:"old",collectionAccountType:"shop",workspaceStatus:"ready",searchQuery:"old private serial",recordsLoaded:true,recordsError:""};
  const env={visibilityRequests:{current:new Map()},removalRequests:{current:new Map()},...stateSetters(state),sessionEmail:{current:"old"},accountRevision:{current:0},window:{setTimeout:()=>1,clearTimeout:()=>{}},mapSupabaseUser:compile(functions.get("mapSupabaseUser"),{},"mapSupabaseUser"),createBrowserSupabaseClient:()=>({auth:{getSession:()=>initial.promise,onAuthStateChange:cb=>{listener=cb;return{data:{subscription:{unsubscribe:()=>{unsubscribed=true}}}}}}})};
  const dispose=compile("const effect="+authEffect+";",env,"effect")();
  listener("SIGNED_IN",{user:{email:"new@example.invalid"}});
  assert.equal(state.user.email,"new@example.invalid");assert.equal(state.sessionError,"");assert.equal(state.authChecked,true);assert.deepEqual(state.instruments,[]);assert.equal(state.actionRecord,null);assert.equal(state.quickEditRecord,null);assert.equal(state.collectionHandle,"");assert.equal(state.searchQuery,"");assert.equal(state.collectionAccountType,"");
assert.equal(state.workspaceStatus,"pending");

  initial.resolve({data:{session:{user:{email:"old@example.invalid"}}}});await tick();assert.equal(state.user.email,"new@example.invalid");
  listener("SIGNED_OUT",null);assert.equal(state.user,null);assert.equal(state.sessionError,"");assert.deepEqual(state.transfers,[]);assert.equal(state.recordsLoaded,false);dispose();assert.equal(unsubscribed,true);
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
await test("all saved instruments remain searchable regardless of legacy visibility without searching private notes",async()=>{
  const matches=compile(functions.get("matchesDashboardSearch"),{},"matchesDashboardSearch");
  const initializer=variableInitializer("displayedInstruments");
  assert.ok(ts.isCallExpression(initializer)&&initializer.expression.getText(ast)==="useMemo","Displayed instruments must use the actual memoized pipeline");
  const callback=initializer.arguments[0];assert.ok(ts.isArrowFunction(callback),"Display pipeline must have an explicit callback");
  assert.doesNotMatch(callback.getText(ast),/instrument\.visibility|matchesDashboardFilter/,"Instrument publication must not filter the saved collection");
  const records=[
    {name:"Stage amplifier",brand:"Fender",model:"Vibroverb",serial:"AB-001",qrCode:"QRG-EXAMPLE",instrumentType:"Amplifier",visibility:"private",summary:"Private repair note"},
    {name:"Travel acoustic",brand:"Martin",model:"D-18",serial:"CD002",qrCode:"QRG-OTHER",instrumentType:"Acoustic Guitar",visibility:"public"},
    {name:"Studio amplifier",brand:"Fender",model:"Princeton",serial:"EF003",qrCode:"QRG-THIRD",instrumentType:"Amplifier",visibility:"unlisted",summary:"Private acquisition note"}
  ];
  const displayed=query=>compile("const select="+callback.getText(ast)+";",{chronologicalInstruments:records,searchQuery:query,matchesDashboardSearch:matches},"select")();
  for(const query of ["FENDER vibro", "ab-001", "qrg-example", "AMPlifier", "  "])assert.equal(matches(records[0],query),true);
  assert.equal(matches(records[0],"Private repair note"),false);
  assert.deepEqual(displayed("  "),records);
  assert.deepEqual(displayed("fender"),[records[0],records[2]]);
  assert.deepEqual(displayed("martin"),[records[1]]);
  assert.deepEqual(displayed("Private repair note"),[]);
  assert.deepEqual(displayed("not-an-instrument"),[]);
});
await test("Profile cards keep Edit and Print Suite direct while Quick Edit lives in More",async()=>{
  const cardStart=source.indexOf('<aside className={styles.qrActionColumn}');
  const cardEnd=source.indexOf('</aside>',cardStart);
  const card=source.slice(cardStart,cardEnd);
  assert.match(card,/href=\{`\/edit\/\$\{instrument\.qrCode\}`\}/);
  assert.match(card,/href=\{`\/handout\/\$\{instrument\.qrCode\}\?returnTo=%2Fdashboard`\}/);
  assert.doesNotMatch(card,/setQuickEditRecord\(instrument\)/);
  assert.match(source,/className=\{styles\.drawerQuickEdit\}[\s\S]*setQuickEditRecord\(actionRecord\); setActionRecord\(null\)/);
});
await test("Needs your attention counts only owner-reviewable submissions",async()=>{
  const countSource=variableInitializer("ownerReviewRequests").getText(ast);
  assert.match(countSource,/request\.status === "submitted"/);
  assert.doesNotMatch(countSource,/changes_requested/);
  const countReview=serviceRequests=>compile("const count="+countSource+";",{serviceRequests},"count");
  assert.equal(countReview([]),0);
  assert.equal(countReview(["draft","submitted","changes_requested","approved","declined","cancelled","expired","submitted"].map(status=>({status}))),2);
  const panelStart=source.indexOf("{recordsLoaded && ownerReviewRequests > 0");
  const panelEnd=source.indexOf('<div className={styles.collectionControls}>',panelStart);
  assert.ok(panelStart>=0&&panelEnd>panelStart,"Attention panel boundaries must exist");
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
const workspaceEffects=effects.filter(e=>e.includes('fetch("/api/account"'));
assert.equal(workspaceEffects.length,1,"Exactly one actual workspace account effect is required");
function workspaceHarness(options={}){
  const state={collectionHandle:"saved",collectionAccountType:"builder",workspaceStatus:"ready",...options.state};
  const revision={current:1},timers=new Map(),calls=[];
  const env={...stateSetters(state),user:{email:"owner@example.invalid"},accountRevision:revision,AbortController,
    window:{setTimeout:fn=>{timers.set(1,fn);return 1;},clearTimeout:id=>timers.delete(id)},
    getSupabaseAccessToken:options.token||(()=>Promise.resolve("token")),
    fetch:async(url,init)=>{calls.push({url,...init});return options.reply?options.reply():Response.json({ok:true,account:{publicCollection:{accountType:"collector",enabled:true,handle:"confirmed"}}});}};
  const dispose=compile("const effect="+workspaceEffects[0]+";",env,"effect")();
  return{state,revision,timers,calls,dispose,timeout:()=>{assert.equal(timers.size,1);timers.values().next().value();}};
}
for(const kind of ["503","rejected","malformed"])await test("workspace "+kind+" exposes failure and retains same-actor confirmed tools",async()=>{
  const h=workspaceHarness({reply:()=>kind==="rejected"?Promise.reject(Error("offline")):Response.json(kind==="malformed"?{ok:true}:{ok:false},{status:kind==="503"?503:200})});
  assert.equal(h.state.workspaceStatus,"pending");await tick();
  assert.equal(h.state.workspaceStatus,"error");assert.equal(h.state.collectionAccountType,"builder");assert.equal(h.state.collectionHandle,"saved");assert.equal(h.timers.size,0);h.dispose();
});
await test("initial workspace failure remains unknown instead of confirming a player preference",async()=>{
  const h=workspaceHarness({state:{collectionAccountType:"",collectionHandle:""},reply:()=>Response.json({ok:false},{status:503})});
  await tick();assert.equal(h.state.workspaceStatus,"error");assert.equal(h.state.collectionAccountType,"");assert.equal(h.state.collectionHandle,"");h.dispose();
});
await test("confirmed workspace response updates saved preference and completes pending status",async()=>{
  const h=workspaceHarness();await tick();assert.equal(h.state.workspaceStatus,"ready");assert.equal(h.state.collectionAccountType,"collector");assert.equal(h.state.collectionHandle,"confirmed");assert.equal(h.calls[0].url,"/api/account");assert.equal(h.calls[0].cache,"no-store");assert.ok(h.calls[0].signal instanceof AbortSignal);assert.equal(h.timers.size,0);h.dispose();
});
await test("workspace token deadline settles visibly and a late token sends no request",async()=>{
  const gate=deferred(),h=workspaceHarness({token:()=>gate.promise});h.timeout();assert.equal(h.state.workspaceStatus,"error");
  gate.resolve("late-token");await tick();assert.equal(h.calls.length,0);assert.equal(h.state.collectionAccountType,"builder");h.dispose();
});
await test("workspace deadline aborts fetch and rejects even an abort-ignoring late success",async()=>{
  const gate=deferred(),h=workspaceHarness({reply:()=>gate.promise});await tick();h.timeout();assert.equal(h.calls[0].signal.aborted,true);assert.equal(h.state.workspaceStatus,"error");
  gate.resolve(Response.json({ok:true,account:{publicCollection:{accountType:"player",enabled:true,handle:"late"}}}));await tick();
  assert.equal(h.state.workspaceStatus,"error");assert.equal(h.state.collectionAccountType,"builder");assert.equal(h.state.collectionHandle,"saved");h.dispose();
});
await test("workspace deadline covers response JSON, not just HTTP headers",async()=>{
  const gate=deferred(),h=workspaceHarness({reply:()=>({ok:true,json:()=>gate.promise})});await tick();h.timeout();
  gate.resolve({ok:true,account:{publicCollection:{accountType:"player",enabled:true,handle:"late"}}});await tick();
  assert.equal(h.state.workspaceStatus,"error");assert.equal(h.state.collectionAccountType,"builder");assert.equal(h.calls[0].signal.aborted,true);h.dispose();
});
await test("workspace actor switch before token resolution sends no request",async()=>{
  const gate=deferred(),h=workspaceHarness({token:()=>gate.promise});h.revision.current++;h.state.collectionAccountType="";h.state.collectionHandle="";h.state.workspaceStatus="pending";
  gate.resolve("old-token");await tick();assert.equal(h.calls.length,0);assert.equal(h.state.workspaceStatus,"pending");assert.equal(h.state.collectionAccountType,"");h.dispose();
});
for(const outcome of ["success","rejection"])await test("workspace stale actor "+outcome+" cannot replace next actor state",async()=>{
  const gate=deferred(),h=workspaceHarness({reply:()=>gate.promise});await tick();h.revision.current++;
  Object.assign(h.state,{collectionAccountType:"player",collectionHandle:"next",workspaceStatus:"ready"});const expected={...h.state};
  if(outcome==="rejection")gate.reject(Error("old request"));else gate.resolve(Response.json({ok:true,account:{publicCollection:{accountType:"builder",enabled:true,handle:"old"}}}));
  await tick();assert.deepEqual(h.state,expected);h.dispose();
});
await test("workspace cleanup aborts request, clears deadline and ignores late completion",async()=>{
  const gate=deferred(),h=workspaceHarness({reply:()=>gate.promise});await tick();h.dispose();const expected={...h.state};
  assert.equal(h.calls[0].signal.aborted,true);assert.equal(h.timers.size,0);gate.reject(Error("abort"));await tick();assert.deepEqual(h.state,expected);
});
await test("workspace error renders its own retry; pending announces loading; neither changes role",async()=>{
  const expressions=[];function visitUi(n){if(ts.isJsxExpression(n)&&n.expression)expressions.push(n.expression);ts.forEachChild(n,visitUi);}visitUi(ast);
  const state={workspaceAttempt:4};
  function view(prefix,status){
    const matches=expressions.filter(n=>n.getText(ast).startsWith(prefix));assert.equal(matches.length,1,"Actual workspace notice must exist once");
    const code=ts.transpileModule("const view="+matches[0].getText(ast)+";",{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
    const jsx=(type,props)=>({type,props});
    return new Function("require","exports","workspaceStatus","setWorkspaceAttempt","ui",code+";return view;")(
      name=>{assert.equal(name,"react/jsx-runtime");return{jsx,jsxs:jsx};},{},status,v=>state.workspaceAttempt=v(state.workspaceAttempt),(_key,fallback)=>fallback);
  }
  const error=view('workspaceStatus === "error"',"error");assert.equal(error.props.role,"alert");
  const button=error.props.children.find(n=>n.type==="button");assert.equal(button.props.type,"button");assert.equal(button.props.children,"Try again");button.props.onClick();assert.equal(state.workspaceAttempt,5);
  const pending=view('workspaceStatus === "pending"',"pending");assert.equal(pending.props.role,"status");assert.equal(pending.props["aria-busy"],"true");
  assert.equal(view('workspaceStatus === "error"',"ready"),null);assert.equal(view('workspaceStatus === "pending"',"ready"),null);
  assert.match(source,/collectionAccountType \? workspace\.label : ui\(/);
  assert.match(source,/collectionAccountType \? <WorkspaceActions accountType=\{collectionAccountType\} \/> : null/);
});

function actualCollectionView(state){
  const expressions=[];function find(node){if(ts.isJsxExpression(node)&&node.expression)expressions.push(node.expression);ts.forEachChild(node,find);}find(ast);
  const matches=expressions.filter(node=>ts.isConditionalExpression(node)&&node.whenTrue.getText(ast).includes('ui.app.dashboard.page.139a32beaa54')&&node.whenFalse.getText(ast).includes('Collection unavailable'));
  assert.equal(matches.length,1,'Render the actual collection result branch');
  const env={loadingRecords:false,recordsLoaded:false,recordsError:'',displayedInstruments:[],instruments:[],ui:(_key,fallback)=>fallback,dashboardCopy:{emptyCollectionTitle:'No instruments yet.',emptyCollectionBody:'Use a real photo.',firstRecordCtaLabel:'Register your first instrument'},Link:'a',styles:{},setSearchQuery:()=>{},...state};
  const code=ts.transpileModule('const view='+matches[0].getText(ast)+';',{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const jsx=(type,props)=>({type,props});
  return new Function('require','exports',...Object.keys(env),code+';return view;')(name=>{assert.equal(name,'react/jsx-runtime');return{jsx,jsxs:jsx};},{},...Object.values(env));
}
function resultText(node){if(node==null)return'';if(typeof node==='string'||typeof node==='number')return String(node);if(Array.isArray(node))return node.map(resultText).join(' ');return resultText(node.props?.children);}
await test('an unconfirmed first collection never renders a false empty result',async()=>{
  const view=actualCollectionView({loadingRecords:false,recordsLoaded:false});
  assert.equal(view.props.role,'status');assert.equal(view.props['aria-busy'],'true');assert.match(resultText(view),/Loading your Profiles/);assert.doesNotMatch(resultText(view),/No instruments yet|Register your first/);
  const refresh=actualCollectionView({loadingRecords:true,recordsLoaded:true});assert.equal(refresh.props.role,'status');assert.doesNotMatch(resultText(refresh),/No instruments yet/);
});
await test('confirmed empty, search miss and initial failure stay distinct',async()=>{
  const empty=actualCollectionView({recordsLoaded:true});assert.match(resultText(empty),/No instruments yet/);assert.match(resultText(empty),/Register your first instrument/);assert.doesNotMatch(resultText(empty),/Loading your Profiles/);
  let query='no match';const miss=actualCollectionView({recordsLoaded:true,instruments:[{qrCode:'existing-private'}],setSearchQuery:value=>query=value});assert.match(resultText(miss),/No matching Profiles/);assert.doesNotMatch(resultText(miss),/Register your first/);miss.props.children.find(node=>node.type==='button').props.onClick();assert.equal(query,'');
  const failure=actualCollectionView({recordsLoaded:false,recordsError:'Unavailable'});assert.match(resultText(failure),/Collection unavailable/);assert.doesNotMatch(resultText(failure),/No instruments yet|Loading your Profiles/);
});
await test('actor arrival marks loading synchronously and sign-out clears it',async()=>{
  const initial=deferred();let listener;
  const state={visibilityPendingCodes:[],user:null,authChecked:false,sessionError:'',dashboardMessage:'',instruments:[{private:'old'}],transfers:[],serviceRequests:[],quickEditRecord:null,actionRecord:null,collectionHandle:'',collectionAccountType:'player',workspaceStatus:'ready',searchQuery:'',recordsLoaded:true,recordsError:'',loadingRecords:false};
  const env={visibilityRequests:{current:new Map()},removalRequests:{current:new Map()},...stateSetters(state),sessionEmail:{current:'old@example.invalid'},accountRevision:{current:0},window:{setTimeout:()=>1,clearTimeout:()=>{}},mapSupabaseUser:compile(functions.get('mapSupabaseUser'),{},'mapSupabaseUser'),createBrowserSupabaseClient:()=>({auth:{getSession:()=>initial.promise,onAuthStateChange:cb=>{listener=cb;return{data:{subscription:{unsubscribe:()=>{}}}}}}})};
  const dispose=compile('const effect='+authEffect+';',env,'effect')();listener('SIGNED_IN',{user:{email:'next@example.invalid'}});assert.equal(state.loadingRecords,true);assert.equal(state.recordsLoaded,false);assert.deepEqual(state.instruments,[]);assert.equal(state.collectionAccountType,'');
  listener('SIGNED_OUT',null);assert.equal(state.loadingRecords,false);assert.equal(state.user,null);initial.resolve({data:{session:{user:{email:'old@example.invalid'}}}});await tick();assert.equal(state.user,null);assert.equal(state.loadingRecords,false);dispose();
});

console.log(count+" dashboard behavior cases passed.");
