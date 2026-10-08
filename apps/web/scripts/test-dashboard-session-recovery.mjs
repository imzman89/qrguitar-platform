import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const own=path.resolve(here,'../../..');
const require=createRequire(path.join(own,'apps/web/package.json'));
const ts=require('typescript'),React=require('react');
const sourcePath=path.resolve(process.argv[2]||path.join(own,'apps/web/app/dashboard/page.tsx'));
const source=fs.readFileSync(sourcePath,'utf8');
const ast=ts.createSourceFile('page.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='DashboardPage');
assert(fn,'Actual DashboardPage is required');
const mapFn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='mapSupabaseUser');
const slotNames=[];
for(const stmt of fn.body.statements)if(ts.isVariableStatement(stmt))for(const decl of stmt.declarationList.declarations){
  if(ts.isCallExpression(decl.initializer)&&['useState','useRef'].includes(decl.initializer.expression.getText(ast))){
    slotNames.push(ts.isArrayBindingPattern(decl.name)?decl.name.elements[0].getText(ast):decl.name.getText(ast));
  }
}
const authIndex=fn.body.statements.filter(n=>ts.isExpressionStatement(n)&&ts.isCallExpression(n.expression)&&n.expression.expression.getText(ast)==='useEffect')
.findIndex(n=>n.getText(ast).includes('createBrowserSupabaseClient'));
assert.equal(authIndex,2);
const helperNames=['matchesDashboardSearch','dashboardRecordTitle','dashboardRecordMeta','latestTransferForInstrument','sameText','DashboardServiceCorrectionAttention','DashboardInstrumentThumb','TransferPanel'];
const helpers=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&helperNames.includes(n.name?.text)).map(n=>n.getText(ast)).join('\n');
const preferenceIndex=fn.body.statements.filter(n=>ts.isExpressionStatement(n)&&ts.isCallExpression(n.expression)&&n.expression.expression.getText(ast)==='useEffect').findIndex(n=>n.getText(ast).includes('localStorage.getItem'));
const code=ts.transpileModule(fn.getText(ast).replace('export default ','')+'\n'+mapFn.getText(ast)+'\n'+helpers,{
 compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None},
 reportDiagnostics:true
});
assert.equal(code.diagnostics.length,0);
const unavailable='Account access is temporarily unavailable. Please reload.';
const failed='Could not check your session. Please reload.';
// Execute the installed SDK's actual method body, without constructing a client or touching storage/network.
const sdkRoot=process.argv[3]||own;
const sdkPath=path.join(sdkRoot,'node_modules/@supabase/auth-js/src/GoTrueClient.ts');
const sdkAst=ts.createSourceFile('GoTrueClient.ts',fs.readFileSync(sdkPath,'utf8'),ts.ScriptTarget.Latest,true);
const sdkClass=sdkAst.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='GoTrueClient');
const sdkMethod=sdkClass.members.find(n=>n.name?.getText(sdkAst)==='_emitInitialSession');
assert(sdkMethod,'Installed SDK initial emitter required');
const sdkContext={console:{warn:()=>{},error:()=>{}},isAuthRefreshDiscardedError:()=>false,isAuthSessionMissingError:()=>false,isAuthRetryableFetchError:()=>false,isAuthApiError:()=>false};
vm.createContext(sdkContext);
vm.runInContext(ts.transpileModule('class InstalledSdkInitialEmitter {'+sdkMethod.getText(sdkAst)+'};globalThis.installedInitialEmitter=InstalledSdkInitialEmitter.prototype._emitInitialSession;',{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}
}).outputText,sdkContext);
async function sdkInitial(f,error=true){
 const id='controlled-subscription';
 return sdkContext.installedInitialEmitter.call({_useSession:cb=>cb({data:{session:null},error:error?{message:'controlled SDK read error'}:null}),
  stateChangeEmitters:new Map([[id,{callback:(event,session)=>f.event(session,event)}]]),_debug:()=>{}},id);
}
const owner={user:{email:'owner@example.invalid',user_metadata:{display_name:'Test owner'}}};
const flush=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};
function fixture({constructorError=false,overrides={}}={}){
 let cursor=0,writes=0,reloads=0,listener,unsubscribed=false,cleanup;
 const slots=[],effects=[],timers=new Map();
 const storage={saved:null,reads:0,writes:[],throwRead:false,throwWrite:false};
 let resolve,reject;const read=new Promise((a,b)=>{resolve=a;reject=b;});
 const context={
  React,useUiText:()=>((key,fallback)=>overrides[key]??fallback),useSiteContent:()=>({}),
  useState:initial=>{const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],next=>{writes++;slots[i]=typeof next==='function'?next(slots[i]):next;}];},
  useRef:initial=>{const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];},
  useMemo:cb=>cb(),useEffect:cb=>effects.push(cb),
  createBrowserSupabaseClient:()=>{if(constructorError)throw Error('controlled construction failure');return{auth:{
   getSession:()=>read,onAuthStateChange:cb=>{listener=cb;return{data:{subscription:{unsubscribe:()=>{unsubscribed=true;}}}};}
  }};},
  defaultSiteSettings:{dashboard:{subtitle:'Dashboard subtitle'}},getWorkspace:()=>({label:'Collection',description:'Collection'}),
  getContentValue:(_content,key)=>key,styles:new Proxy({}, {get:(_target,key)=>String(key)}),authStyles:{},URLSearchParams,
  getInstrumentVerificationStatus:()=>"unverified",getInstrumentCondition:()=>"used",
  getProfilePhotoUrls:r=>r.photos||[],getServiceHistoryEntries:r=>r.serviceHistory||[],
  ownerProfileHref:r=>`/dashboard/profile/${r.qrCode}?returnTo=%2Fdashboard`,
  window:{localStorage:{getItem:key=>{assert.equal(key,"qrguitar.collection.view");storage.reads++;if(storage.throwRead)throw Error("Storage unavailable");return storage.saved;},setItem:(key,value)=>{assert.equal(key,"qrguitar.collection.view");if(storage.throwWrite)throw Error("Storage unavailable");storage.saved=value;storage.writes.push({key,value});}},setTimeout:(cb,ms)=>{assert.equal(ms,10000);timers.set(1,cb);return 1;},clearTimeout:id=>timers.delete(id),location:{reload:()=>{reloads++;}}},
 };
 for(const stmt of ast.statements)if(ts.isImportDeclaration(stmt)){
  const c=stmt.importClause;
  if(c?.name&&!(c.name.text in context))context[c.name.text]=c.name.text==='Link'?'a':'div';
  if(c?.namedBindings&&ts.isNamedImports(c.namedBindings))for(const e of c.namedBindings.elements)
    if(!e.isTypeOnly&&!(e.name.text in context))context[e.name.text]=e.name.text;
 }
 vm.createContext(context);vm.runInContext(code.outputText,context);
 function render(){cursor=0;effects.length=0;return context.DashboardPage();}
 function walk(node,visit){if(node===null||node===undefined||typeof node==='boolean')return;if(Array.isArray(node)){node.forEach(n=>walk(n,visit));return;}visit(node);if(typeof node==='object')walk(node.props?.children,visit);}
 function view(){const root=render();const texts=[],alerts=[],links=[],headings=[],buttons=[],nodes=[];walk(root,n=>{
  if(typeof n==='string'||typeof n==='number')texts.push(String(n));
  else{nodes.push(n);if(n.props?.role==='alert')alerts.push(n);if(n.type==='a')links.push(n.props.href);if(n.type==='h1')headings.push(n);if(n.type==='button')buttons.push(n);}
 });return{text:texts.join(' '),alerts,links,headings,buttons,nodes};}
 render();cleanup=effects[authIndex]();
 return{view,storage,runPreference:()=>{render();assert(preferenceIndex>=0,"Preference effect required");effects[preferenceIndex]();},resolve:session=>resolve({data:{session},error:null}),errorResult:()=>resolve({data:{session:null},error:{message:'controlled SDK failure'}}),
 reject:()=>reject(Error('controlled read failure')),event:(session,event=session?'SIGNED_IN':'SIGNED_OUT')=>listener(event,session),
 timeout:()=>{const cb=timers.get(1);assert(cb,'Expected 10s timer');timers.delete(1);cb();},
 set:(name,value)=>{const i=slotNames.indexOf(name);assert(i>=0,name);slots[i]=value;},
 state:name=>slots[slotNames.indexOf(name)],writes:()=>writes,timerCount:()=>timers.size,
 dispose:()=>cleanup?.(),unsubscribed:()=>unsubscribed,reloads:()=>reloads};
}
const cases=[];
function test(name,cb){cases.push({name,cb});}
const visible=(f,message)=>{const v=f.view();assert(v.text.includes(message),'Expected visible recovery guidance: '+message);assert.equal(v.alerts.length,1);assert.equal(v.headings.length,1);assert(v.links.includes('/login?next=%2Fdashboard'));};
const clean=f=>{const v=f.view();assert(!v.text.includes(unavailable)&&!v.text.includes(failed));assert.equal(v.alerts.length,0);assert(![unavailable,failed].includes(f.state('dashboardMessage')),'Auth guidance must not remain in owner feedback');if(f.state('sessionError')!==undefined)assert.equal(f.state('sessionError'),'');};
test('constructor failure visible',async f=>visible(f,unavailable));
test('rejected read visible',async f=>{f.reject();await flush();visible(f,failed);});
test('fulfilled SDK error visible, not confirmed guest',async f=>{f.errorResult();await flush();visible(f,failed);});
test('timeout visible at 10s',async f=>{f.timeout();visible(f,failed);});
test('confirmed guest has no session error',async f=>{f.resolve(null);await flush();clean(f);assert(f.view().text.includes('Sign in to manage'));});
test('late success after timeout clears recovery message',async f=>{f.timeout();f.resolve(owner);await flush();clean(f);assert.equal(f.state('user').email,owner.user.email);});
test('auth event after rejection clears recovery message',async f=>{f.reject();await flush();f.event(owner);clean(f);});
test('auth event after SDK error recovers owner',async f=>{f.errorResult();await flush();f.event(owner);clean(f);});
test('confirmed null event clears earlier failure',async f=>{f.reject();await flush();f.event(null);clean(f);});
test('private owner operation feedback hidden after logout',async f=>{f.event(owner);f.set('dashboardMessage','PRIVATE_OWNER_FEEDBACK');assert(f.view().text.includes('PRIVATE_OWNER_FEEDBACK'));f.event(null);assert(!f.view().text.includes('PRIVATE_OWNER_FEEDBACK'));clean(f);});
test('account switch clears prior owner feedback',async f=>{f.event(owner);f.set('dashboardMessage','PRIVATE_OWNER_A_FEEDBACK');f.event({user:{email:'owner-b@example.invalid'}});assert.equal(f.state('dashboardMessage'),'');assert(!f.view().text.includes('PRIVATE_OWNER_A_FEEDBACK'));});
test('logout then different account clears prior owner feedback',async f=>{f.event(owner);f.set('dashboardMessage','PRIVATE_OWNER_A_FEEDBACK');f.event(null);f.event({user:{email:'owner-b@example.invalid'}});assert.equal(f.state('dashboardMessage'),'');assert(!f.view().text.includes('PRIVATE_OWNER_A_FEEDBACK'));});
test('same-account refresh preserves owner operation feedback',async f=>{f.event(owner);f.set('dashboardMessage','CURRENT_OWNER_FEEDBACK');f.event(owner);assert(f.view().text.includes('CURRENT_OWNER_FEEDBACK'));});
test('newer owner event wins over stale null read',async f=>{f.event(owner);f.resolve(null);await flush();assert.equal(f.state('user').email,owner.user.email);clean(f);});
test('newer logout wins over stale owner read',async f=>{f.event(owner);f.event(null);f.resolve(owner);await flush();assert.equal(f.state('user'),null);clean(f);});
test('newer session event wins over stale rejection',async f=>{f.event(owner);f.reject();await flush();clean(f);});
test('newer session event wins over stale SDK error',async f=>{f.event(owner);f.errorResult();await flush();clean(f);});
test('unmount cancels timer, unsubscribes, ignores late read/event',async f=>{f.dispose();const w=f.writes();assert.equal(f.timerCount(),0);assert(f.unsubscribed());f.resolve(owner);await flush();f.event(null);assert.equal(f.writes(),w);});
test('unmount ignores late rejected read',async f=>{f.dispose();const w=f.writes();f.reject();await flush();assert.equal(f.writes(),w);});
test('unmount ignores late fulfilled SDK error',async f=>{f.dispose();const w=f.writes();f.errorResult();await flush();assert.equal(f.writes(),w);});
test('reload after constructor failure yields healthy guest',async f=>{f.dispose();const healthy=fixture();try{healthy.resolve(null);await flush();clean(healthy);}finally{healthy.dispose();}});
test('CMS override used for construction guidance',async f=>visible(f,'Published unavailable guidance'));
test('CMS override used for check failure guidance',async f=>{f.errorResult();await flush();visible(f,'Published check guidance');});
test('INITIAL_SESSION null before SDK error waits for explicit read',async f=>{await sdkInitial(f);assert.equal(f.state('authChecked'),false);assert.equal(f.timerCount(),1);f.errorResult();await flush();visible(f,failed);});
test('SDK error before INITIAL_SESSION null keeps visible failure',async f=>{f.errorResult();await flush();visible(f,failed);await sdkInitial(f);visible(f,failed);});
test('INITIAL_SESSION null before rejected read retains failure classification',async f=>{f.event(null,'INITIAL_SESSION');f.reject();await flush();visible(f,failed);});
test('rejected read before INITIAL_SESSION null keeps visible failure',async f=>{f.reject();await flush();f.event(null,'INITIAL_SESSION');visible(f,failed);});
test('INITIAL_SESSION null plus successful null read confirms guest',async f=>{await sdkInitial(f,false);f.resolve(null);await flush();clean(f);assert.equal(f.state('authChecked'),true);assert(f.view().text.includes('Sign in to manage'));});
test('timeout followed by INITIAL_SESSION null retains recovery guidance',async f=>{f.timeout();f.event(null,'INITIAL_SESSION');visible(f,failed);});
test('newer signed-in owner is not replaced by ambiguous INITIAL_SESSION null',async f=>{f.event(owner,'SIGNED_IN');f.event(null,'INITIAL_SESSION');f.errorResult();await flush();assert.equal(f.state('user').email,owner.user.email);clean(f);});
test('SIGNED_OUT remains authoritative after failed read and INITIAL_SESSION null',async f=>{f.errorResult();await flush();f.event(null,'INITIAL_SESSION');f.event(null,'SIGNED_OUT');clean(f);assert.equal(f.state('authChecked'),true);assert.equal(f.state('user'),null);});
test('signed-out event beats stale owner read and INITIAL_SESSION null',async f=>{f.event(owner,'SIGNED_IN');f.event(null,'SIGNED_OUT');f.event(null,'INITIAL_SESSION');f.resolve(owner);await flush();assert.equal(f.state('user'),null);clean(f);});
test('later nonnull event recovers after SDK error and INITIAL_SESSION null',async f=>{f.errorResult();await flush();f.event(null,'INITIAL_SESSION');f.event(owner,'SIGNED_IN');assert.equal(f.state('user').email,owner.user.email);clean(f);});
test('failed session uses a neutral heading and keeps safe sign-in access',async f=>{f.errorResult();await flush();const v=f.view();assert.equal(v.headings[0].props.children,'Dashboard');assert(v.links.includes('/login?next=%2Fdashboard'));assert(!v.links.includes('/login?mode=register&next=%2Fdashboard'));assert.equal(v.buttons.length+v.links.length,3);});
test('failed session retry invokes an actual page reload',async f=>{f.reject();await flush();const retry=f.view().buttons.find(n=>n.props.children==='Try again');assert(retry,'Visible retry action required');assert.equal(retry.props.type,'button');retry.props.onClick();assert.equal(f.reloads(),1);});
test('confirmed guest retains its existing three actions without an error retry',async f=>{f.resolve(null);await flush();const v=f.view();assert.equal(v.buttons.length,0);assert.equal(v.links.length,3);assert(v.links.includes('/login?mode=register&next=%2Fdashboard'));assert(v.headings[0].props.children.includes('Sign in to manage'));});
const personal=f=>{f.set("user",{email:"owner@example.invalid"});f.set("authChecked",true);f.set("collectionAccountType","player");f.set("workspaceStatus","ready");f.set("loadingRecords",false);f.set("recordsLoaded",true);};
const viewButton=(f,label)=>{const button=f.view().buttons.find(n=>n.props.children===label);assert(button,"View button required: "+label);assert.equal(button.props.type,"button");assert.equal(button.props["aria-controls"],"saved-profiles");return button;};
const presentation=f=>f.view().nodes.find(n=>n.props?.className?.split(" ").includes("instrumentList"));
test("collection defaults to gallery without writing a preference",async f=>{personal(f);f.runPreference();assert.equal(f.state("collectionView"),"gallery");assert.equal(viewButton(f,"Gallery").props["aria-pressed"],true);assert.equal(viewButton(f,"List").props["aria-pressed"],false);assert.equal(presentation(f).props.className,"instrumentList personalGallery");assert.equal(f.storage.writes.length,0);assert.equal(f.storage.reads,1);assert(f.view().nodes.some(n=>n.props?.role==="group"&&n.props["aria-label"]==="Collection view"));});
test("collection restores list without an initial gallery overwrite",async f=>{personal(f);f.storage.saved="list";f.runPreference();assert.equal(f.state("collectionView"),"list");assert.equal(viewButton(f,"List").props["aria-pressed"],true);assert.equal(presentation(f).props.className,"instrumentList personalRecords");assert.equal(f.storage.saved,"list");assert.equal(f.storage.writes.length,0);});
test("collection rejects unknown saved preferences",async f=>{personal(f);f.storage.saved="unexpected";f.runPreference();assert.equal(f.state("collectionView"),"gallery");assert.equal(f.storage.saved,"unexpected");assert.equal(f.storage.writes.length,0);});
test("collection read failure keeps usable in-memory gallery",async f=>{personal(f);f.storage.throwRead=true;f.runPreference();assert.equal(f.state("collectionView"),"gallery");viewButton(f,"List").props.onClick();assert.equal(f.state("collectionView"),"list");});
test("collection write failure still changes the actual view",async f=>{personal(f);f.storage.throwWrite=true;viewButton(f,"List").props.onClick();assert.equal(f.state("collectionView"),"list");assert.equal(presentation(f).props.className,"instrumentList personalRecords");assert.equal(f.storage.writes.length,0);});
test("collection writes only explicit choices and restores the last choice",async f=>{personal(f);viewButton(f,"List").props.onClick();assert.equal(f.storage.saved,"list");viewButton(f,"Gallery").props.onClick();assert.equal(f.storage.saved,"gallery");assert.deepEqual(f.storage.writes.map(w=>w.value),["list","gallery"]);const reload=fixture();try{personal(reload);reload.storage.saved=f.storage.saved;reload.runPreference();assert.equal(reload.state("collectionView"),"gallery");assert.equal(reload.storage.writes.length,0);}finally{reload.dispose();}});
test("collection view choice is limited to players and collectors",async f=>{personal(f);for(const role of ["player","collector"]){f.set("collectionAccountType",role);viewButton(f,"List").props.onClick();assert.equal(presentation(f).props.className,"instrumentList personalRecords");}for(const role of ["shop","luthier","builder","brand",""]){f.set("collectionAccountType",role);assert(!f.view().buttons.some(n=>["Gallery","List"].includes(n.props.children)));assert.equal(presentation(f).props.className,"instrumentList");assert.equal(presentation(f).props["data-collection-view"],undefined);}});
test("collection toggles preserve records search feedback and owner action targets",async f=>{personal(f);const records=[{qrCode:"QRG-COLLECTION-UNIT",name:"Stored guitar",brand:"Stored",model:"Guitar",serial:"UNIT",instrumentType:"Electric Guitar",createdAt:"2020-01-01",photos:["photo.jpg"],serviceHistory:[],documents:[]}];f.set("instruments",records);f.set("searchQuery","Stored");f.set("dashboardMessage","Existing owner feedback");const before=f.view();const targets=before.links.filter(h=>/QRG-COLLECTION-UNIT/.test(h));assert.equal(targets.length,3);assert(targets.includes("/dashboard/profile/QRG-COLLECTION-UNIT?returnTo=%2Fdashboard"));assert(targets.includes("/edit/QRG-COLLECTION-UNIT"));assert(targets.includes("/handout/QRG-COLLECTION-UNIT?returnTo=%2Fdashboard"));const revision=f.state("accountRevision").current,loads=f.state("loadAttempt");for(const label of ["List","Gallery"]){viewButton(f,label).props.onClick();assert.equal(f.state("instruments"),records);assert.equal(f.state("searchQuery"),"Stored");assert.equal(f.state("dashboardMessage"),"Existing owner feedback");assert.equal(f.state("accountRevision").current,revision);assert.equal(f.state("loadAttempt"),loads);assert.deepEqual(f.view().links.filter(h=>/QRG-COLLECTION-UNIT/.test(h)),targets);}assert.equal(f.view().nodes.filter(n=>n.type==="article"&&n.props["data-profile-code"]==="QRG-COLLECTION-UNIT").length,1);});
const results=[];
for(const c of cases){const f=fixture({constructorError:c.name.startsWith('constructor')||c.name.startsWith('reload')||c.name.startsWith('CMS override used for construction'),
 overrides:c.name.startsWith('CMS')?{'ui.app.dashboard.page.sessionUnavailable':'Published unavailable guidance','ui.app.dashboard.page.sessionCheckFailed':'Published check guidance'}:{}});
 try{await c.cb(f);results.push({name:c.name,pass:true});}catch(e){results.push({name:c.name,pass:false,error:e.message});}finally{f.dispose();}
}
console.log(JSON.stringify({source:sourcePath,method:'Actual AST-extracted DashboardPage + mapSupabaseUser with deterministic hook state and auth-only effect for prior cases, preference-only effect and actual view button handlers for new cases; actual JSX tree traversed; installed SDK _emitInitialSession method executed with controlled _useSession result/callback, no real client construction/storage/data effects/network/backend; preference cases use controlled mocked storage and record presentation helpers',sdkSource:sdkPath,sdkVersion:JSON.parse(fs.readFileSync(path.join(sdkRoot,'node_modules/@supabase/auth-js/package.json'),'utf8')).version,count:results.length,passed:results.filter(r=>r.pass).length,failed:results.filter(r=>!r.pass).length,results},null,2));
process.exitCode=results.some(r=>!r.pass)?1:0;

