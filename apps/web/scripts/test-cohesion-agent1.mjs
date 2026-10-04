import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import { withUiTextTestContext } from "./ui-text-test-context.mjs";
const require = createRequire(import.meta.url), ts = require("typescript");
const web = path.resolve(import.meta.dirname, "..");
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };
const nodes = v => Array.isArray(v) ? v.flatMap(nodes) : v && typeof v === "object" ? [v, ...nodes(v.props?.children)] : [];
const words = v => Array.isArray(v) ? v.map(words).join("") : typeof v === "string" || typeof v === "number" ? String(v) : v && typeof v === "object" ? words(v.props?.children) : "";
const same = (a,b) => a && b && a.length === b.length && a.every((v,i) => Object.is(v,b[i]));
// These fixtures run actual TSX component/effect/handler source. Only DOM, Auth,
// clocks and network are synthetic. They are not browser/persistence acceptance.
function runtime() {
  let cursor=0, dirty=true, tree, Component, props={}, mounted=true, late=0, writes=0; const slots=[], effects=[];
  const hooks = {
    useState(initial) { const i=cursor++; if (!(i in slots)) slots[i]={value:typeof initial==="function"?initial():initial}; return [slots[i].value, next => { if(!mounted){late++;return;} writes++; const v=typeof next==="function"?next(slots[i].value):next; if(!Object.is(v,slots[i].value)){slots[i].value=v;dirty=true;} }]; },
    useRef(initial) { const i=cursor++; return slots[i] ||= { current:initial }; },
    useMemo(fn,deps) { const i=cursor++; if(!same(slots[i]?.deps,deps)) slots[i]={value:fn(),deps}; return slots[i].value; },
    useCallback(fn,deps) { return hooks.useMemo(()=>fn,deps); },
    useEffect(run,deps) { const i=cursor++; slots[i] ||= {}; if(!same(slots[i].deps,deps)) effects.push(()=>{ slots[i].cleanup?.();slots[i].deps=deps;slots[i].cleanup=run(); }); }
  };
  const f={ hooks, mount(fn,p={}){Component=fn;props=p;f.render();}, render(){for(let n=0;n<40;n++){if(dirty){dirty=false;cursor=0;tree=Component(props);} effects.splice(0).forEach(fn=>fn());if(!dirty)return;}throw Error("Unsettled effects");},
    update(p){props=p;dirty=true;f.render();}, async flush(){for(let n=0;n<20;n++){await new Promise(resolve=>setImmediate(resolve));f.render();}},
    all:()=>nodes(tree), text:()=>words(tree), find(fn){const value=nodes(tree).find(fn);assert.ok(value,"Expected rendered control");return value;},
    button(label){const b=f.all().find(n=>n.type==="button"&&words(n).trim()===label);assert.ok(b,"Missing "+label+"; available: "+f.all().filter(n=>n.type==="button").map(words).join(" | "));return b;}, click(label){const b=f.button(label);assert.ok(!b.props.disabled,label+" enabled");b.props.onClick();f.render();},
    change(id,value){const n=f.find(n=>n.props?.id===id&&n.props.onChange);n.props.onChange(typeof n.type==="function"?value:{target:{value}});f.render();},
    dispose(){mounted=false;slots.forEach(s=>s.cleanup?.());}, late:()=>late, stateWrites:()=>writes, slots
  };return f;
}
function fixture(t, relative, options={}) {
  const f=runtime(), storage=options.storage || new Map(), timers=new Map(), events=new Map(), callbacks=new Set(), requests=[], readers=[]; let timer=0, clock=1000;
  let session={user:{id:"actor-a"},access_token:"token-a"}, routeCode="FIXTURE";
  const auth={getSession:()=>options.session?.() ?? Promise.resolve({data:{session}}),onAuthStateChange(fn){callbacks.add(fn);return {data:{subscription:{unsubscribe(){callbacks.delete(fn);}}}};}};
  const store={getItem:k=>storage.get(k) ?? null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
  const win={sessionStorage:store,localStorage:store,innerWidth:1280,location:{hash:"",search:options.search || "",pathname:"/edit/FIXTURE",origin:"https://fixture.invalid"},
    history:{replaceState(){}},confirm:()=>true,dispatchEvent(){},addEventListener(k,fn){if(!events.has(k))events.set(k,new Set());events.get(k).add(fn);},removeEventListener(k,fn){events.get(k)?.delete(fn);},
    setTimeout(fn,delay){timers.set(++timer,{fn,delay});return timer;},clearTimeout(id){timers.delete(id);},matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}})};
  const doc={activeElement:null,body:{style:{}},documentElement:{clientWidth:1280},getElementById:()=>null,querySelector:()=>null,
    addEventListener(){},removeEventListener(){},createElement:()=>({click(){}})};
  const record={recordId:"11111111-1111-4111-8111-111111111111",qrCode:"FIXTURE",name:"Saved instrument",brand:"Fender",model:"Stratocaster",serial:"ABC123",instrumentType:"Electric Guitar",condition:"used",visibility:"private",heroImageDataUrl:"https://fixture.invalid/photo.jpg",galleryImages:["https://fixture.invalid/photo.jpg"],customFields:[],customLinks:[],serviceEvents:[],documentFiles:[],ownerId:"actor-a",createdAt:"2026-09-01",updatedAt:"2026-09-01T00:00:00.000Z"};
  const fetcher=async(url,init={})=>{const request={url:String(url),method:init.method||"GET",body:init.body?JSON.parse(init.body):undefined,signal:init.signal};requests.push(request);
    const custom=options.fetch?.(request);if(custom!==undefined)return custom;
    if(request.url.startsWith("/api/instruments?"))return Response.json({ok:true,instrument:{...record,qrCode:routeCode,ownerId:session?.user.id},canManageVerification:true});
    if(request.url.startsWith("/api/external-media"))return Response.json({ok:true,mediaItems:[]});
    if(request.url.startsWith("/api/service-events"))return Response.json({ok:true,serviceEvents:[]});
    if(request.url.startsWith("/api/admin/service-workflow"))return Response.json({ok:true,providers:[],submissions:[]});
    if(request.url==="/api/ownership-claims")return Response.json({ok:true,claims:[]});
    if(request.url==="/api/admin/overview")return Response.json({ok:true,stats:{},health:{systems:[],migrations:{}}});
    if(request.url.startsWith("/api/admin/"))return Response.json({ok:true,users:[],records:[],auditEvents:[]});
    if(request.url==="/api/instruments"&&request.method==="PATCH"&&!request.body?.verificationOnly){
      record.updatedAt=new Date(Date.parse(record.updatedAt)+1000).toISOString();
      return Response.json({ok:true,qrCode:request.body.qrCode,updatedAt:record.updatedAt});
    }
    return Response.json({ok:true,qrCode:"FIXTURE",verificationStatus:"unverified",authenticityStatus:"unconfirmed",safetyStatus:"clear"});
  };
  const cache=new Map(), icons=new Proxy({}, {get:()=>"icon"}), jsx=(type,props,key)=>({type,props,key});
  const router={refresh(){},replace(){},push(){}};
  class FixtureDate extends Date {constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}toLocaleTimeString(){return String(this.getTime());}}
  class TextArea {value="";validity="";setCustomValidity(v){this.validity=v;}reportValidity(){return !this.validity;}}
  class Reader {readAsDataURL(){readers.push(this);}}
  function load(file) {
    file=path.resolve(web,file); if(cache.has(file))return cache.get(file).exports; const module={exports:{}};cache.set(file,module);
    const extra=file.endsWith(path.normalize("app/admin/page.tsx"))?"\nexport { AdminWorkspace };":file.endsWith(path.normalize("app/admin/service-workflow/page.tsx"))?"\nexport { ServiceWorkflowWorkspace };":"";
    const js=ts.transpileModule(fs.readFileSync(file,"utf8")+extra,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
    const local=withUiTextTestContext(name=>{
      if(options.imports?.[name])return options.imports[name];
      if(name==="react")return f.hooks;if(name==="react/jsx-runtime")return {jsx,jsxs:jsx,Fragment:"fragment"};
      if(name==="lucide-react")return icons;if(name==="next/link")return {__esModule:true,default:"a"};
      if(name==="next/navigation")return {useParams:()=>({code:routeCode}),useRouter:()=>router,usePathname:()=>"/admin",useSearchParams:()=>new URLSearchParams()};
      if(name.endsWith(".module.css"))return {__esModule:true,default:new Proxy({}, {get:(_,k)=>k})};
      if(name.endsWith("/supabase-browser"))return {createBrowserSupabaseClient:()=>({auth}),getSupabaseAccessToken:async()=>session?.access_token};
      if(name.endsWith("/use-site-content"))return {useSiteContent:()=>load("lib/content-registry.ts").defaultContentValues};
      if(name.endsWith("/profile-upload-client"))return {};
      if(name.endsWith("/security"))return {...load("lib/security.ts"),isRepeatedBrowserSubmission:()=>false};
      if(name.endsWith("/site-settings"))return {...load("lib/site-settings.ts"),fetchPublishedSiteSettings:async()=>load("lib/site-settings.ts").defaultSiteSettings,applyThemeSettings(){}};
      if(/\/(Nav|Footer|InstrumentPreview|PhotoOrganizer|EditorTimelineEntry|AdminWorkspaceGate|ServiceEmailStatus|ActionEmailStatus)$/.test(name)){const key=name.split("/").at(-1);return {[key]:key};}
      if(name==="./admin-intake-auth"||name==="./admin-intake-client")return {};
      if(!name.startsWith("."))return require(name);
      const base=path.resolve(path.dirname(file),name);return load([".ts",".tsx",""].map(ext=>base+ext).find(fs.existsSync));
    });
    new Function("require","module","exports","window","document","fetch","setTimeout","clearTimeout","Date","HTMLTextAreaElement","HTMLElement","FileReader",js)(local,module,module.exports,win,doc,fetcher,win.setTimeout,win.clearTimeout,FixtureDate,TextArea,class {},Reader);
    return module.exports;
  }
  const module=load(relative);
  f.mount(options.component?module[options.component]:module.default,options.props);
  t.after(()=>f.dispose());
  return Object.assign(f,{storage,timers,requests,record,doc,win,load,TextArea,readers,
    actor(id,render=true){session=id?{user:{id},access_token:"token-"+id}:null;[...callbacks].forEach(fn=>fn("CHANGED",session));if(render)f.render();},
    code(value){routeCode=value;f.update(options.props || {});},
    time(value){clock=value;}, expire(){const current=[...timers.values()];current.forEach(v=>v.fn());f.render();}
  });
}
const edit=(t,o={})=>fixture(t,"app/edit/[code]/page.tsx",o);
const writeCount=f=>f.requests.filter(r=>r.method!=="GET").length;

test("Edit authenticated read failure gets a local retry, not sign-in",async t=>{
  let failed=true;const f=edit(t,{fetch:r=>r.url.startsWith("/api/instruments?")&&failed?Response.json({ok:false,message:"offline"},{status:503}):undefined});await f.flush();
  assert.match(f.text(),/Profile temporarily unavailable/);assert.ok(f.button("Retry Profile load"));assert.doesNotMatch(f.text(),/Sign in to edit/);
  failed=false;f.click("Retry Profile load");await f.flush();assert.ok(f.button("Add Media"));assert.equal(writeCount(f),0);
});
for(const [label,fields,button,kind] of [
  ["media",[["externalMediaUrl","https://fixture.invalid/demo"],["externalMediaTitle","Retained demo"]],"Add Media","media"],
  ["history",[["serviceTitle","Retained history"]],"Add Timeline Entry","history"]
]) test("Edit "+label+" lost write retains draft, locks duplicate and checks by read only",async t=>{
  let failed=true;const f=edit(t,{fetch:r=>r.method==="POST"&&failed?Promise.reject(Error("lost receipt")):undefined});await f.flush();fields.forEach(([id,v])=>f.change(id,v));
  const stale=f.button(button).props.onClick;f.click(button);await f.flush();assert.match(f.text(),/not fully confirmed/);assert.equal(f.button(button).props.disabled,true);assert.equal(writeCount(f),1);
  stale();await f.flush();assert.equal(writeCount(f),1);assert.equal(f.find(n=>n.props?.id===fields.at(-1)[0]).props.value,fields.at(-1)[1]);
  assert.equal(f.storage.get("qrguitar.editor.pending.actor-a.FIXTURE."+kind),"FIXTURE");
  f.click("Check saved result");await f.flush();assert.equal(writeCount(f),1);assert.ok(f.find(n=>n.type==="input"&&n.props.type==="checkbox"&&n.props.onChange&& !("checked" in n.props)));
});
test("Edit pending write and returning actor cannot overwrite or silently unlock another account",async t=>{
  const pending=deferred();const f=edit(t,{fetch:r=>r.method==="POST"?pending.promise:undefined});await f.flush();f.change("externalMediaUrl","https://fixture.invalid/demo");f.change("externalMediaTitle","Private A draft");const oldHandler=f.button("Add Media").props.onClick;f.click("Add Media");await f.flush();
  f.actor("actor-b");await f.flush();oldHandler();await f.flush();assert.equal(writeCount(f),1);assert.equal(f.find(n=>n.props?.id==="externalMediaTitle").props.value,"");assert.doesNotMatch(f.text(),/Private A draft/);
  pending.resolve(Response.json({ok:true,mediaItem:{id:"a",title:"Private saved A"}}));await f.flush();assert.doesNotMatch(f.text(),/Private saved A/);
  f.actor("actor-a");await f.flush();assert.equal(f.button("Add Media").props.disabled,true);assert.ok(f.button("Check saved result"));assert.equal(writeCount(f),1);
});
for(const stage of ["trust","safety"]) test("Edit confirmed details followed by "+stage+" failure has an honest partial receipt",async t=>{
  const f=edit(t,{fetch:r=>r.method==="PATCH"&&((stage==="trust"&&r.body?.verificationOnly)||(stage==="safety"&&r.url==="/api/safety-status"))?Promise.reject(Error("lost stage")):undefined});await f.flush();const observedUpdatedAt=f.record.updatedAt;f.change("summary","Retained new draft");
  f.click("Save Changes");await f.flush();assert.match(f.text(),stage==="trust"?/Profile details were saved.*Trust settings were not confirmed; safety was not sent/:/Profile details and trust settings were saved.*Safety status was not confirmed/);
  const details=f.requests.find(r=>r.url==="/api/instruments"&&r.method==="PATCH"&&!r.body?.verificationOnly);assert.ok(details);
  assert.equal(details.body.expectedUpdatedAt,observedUpdatedAt);assert.deepEqual(details.body.expectedDocuments,[]);
  assert.doesNotMatch(f.text(),/Profile details failed:/);assert.equal(f.button("Save Changes").props.disabled,true);
  if(stage==="trust")assert.equal(f.requests.some(r=>r.url==="/api/safety-status"),false);
  const before=writeCount(f);f.click("Check saved result");await f.flush();assert.equal(writeCount(f),before);assert.equal(f.find(n=>n.props?.id==="summary").props.value,"Retained new draft");assert.match(f.text(),/Saved Profile result/);
});
test("Edit whole auth and response-body waiting are bounded, late failure after unmount is ignored",async t=>{
  const pending=deferred();const f=edit(t,{session:()=>pending.promise});await f.flush();f.expire();await f.flush();assert.match(f.text(),/Profile temporarily unavailable/);assert.equal(writeCount(f),0);
  const g=edit(t,{fetch:r=>r.method==="POST"?Promise.reject(Error("offline")):undefined});await g.flush();g.change("externalMediaUrl","https://fixture.invalid/demo");g.change("externalMediaTitle","demo");g.click("Add Media");g.dispose();await g.flush();assert.equal(g.late(),0);
});
test("Service filters remain rendered throughout same-actor reads and old actor results are fenced",async t=>{
  const pending=deferred();let wait=false;const f=fixture(t,"app/admin/service-workflow/page.tsx",{component:"ServiceWorkflowWorkspace",fetch:r=>wait&&r.url.startsWith("/api/admin/service-workflow?")?pending.promise:undefined});await f.flush();
  const input=f.find(n=>n.type==="input"&&n.props["aria-label"]==="Search providers and submissions");wait=true;input.props.onChange({target:{value:"Fen"}});f.render();await f.flush();
  assert.equal(f.find(n=>n.type==="input"&&n.props["aria-label"]==="Search providers and submissions").props.value,"Fen");
  f.actor("");pending.resolve(Response.json({ok:true,providers:[{userId:"private-a",businessName:"Private A"}],submissions:[]}));await f.flush();assert.doesNotMatch(f.text(),/Private A/);
});
test("Promo cross-field errors explain disabled Save and disappear after correction",async t=>{
  const value={code:"SAVE20",name:"Fixture",eligibleOfferKeys:["profile_1"],discountType:"percent_off",discountValue:1000,minimumAmount:0,maxRedemptions:2,maxRedemptionsPerOwner:3,startsAt:"2026-10-02",endsAt:"2026-10-01",audience:"everyone",status:"paused",description:""};
  const props={editing:{id:null,revision:null,value},busy:false,error:"",onClose(){},onChange(){},onSave(){}};const f=fixture(t,"app/admin/promotions/PromoCodesPage.tsx",{component:"PromotionEditor",props});
  assert.match(f.text(),/per-account limit cannot exceed the total/);assert.match(f.text(),/end after the start/);assert.equal(f.button("Create promo code").props.disabled,true);
  f.update({...props,editing:{...props.editing,value:{...value,maxRedemptionsPerOwner:1,endsAt:"2026-10-03"}}});assert.equal(f.button("Create promo code").props.disabled,false);assert.doesNotMatch(f.text(),/per-account limit cannot/);
});
test("Deletion textarea correction clears native custom validity and still enforces exact phrase rules",t=>{
  const calls=[];const state={phase:"ready",busy:false,requests:[{requestId:"request-a",actorId:"actor-a",requestedAt:"2026-09-01",storageReviews:[],retentionReviews:[],profileReviews:[{guitarId:"guitar-a",contentFingerprint:"fingerprint-a",required:true,attested:false,reasonCodes:[]}]}],reviewRequestId:"request-a",reviewSnapshot:{kind:"profile",requestId:"request-a",guitarId:"guitar-a",contentFingerprint:"fingerprint-a",pageIndex:0,pageCount:1,deliveredPages:1,truncated:false,allPagesDelivered:true,profile:{sections:[]}}};
  state.requests[0].profileReviews[0].relationshipCodes=["former_owner"];state.reviewSnapshot.profile.guitarId="guitar-a";
  const f=fixture(t,"lib/account-deletion/admin-ui/AdminIntakeQueue.tsx",{component:"AdminIntakeQueueView",props:{state,onRefresh(){},onMore(){},onExecute:(...v)=>calls.push(v),onInspectStorage(){},onInspectCustody(){}}});
  const textarea=f.find(n=>n.type==="textarea"&&n.props.name==="terms"),form=f.find(n=>n.type==="form"&&n.props.onSubmit);const field=new f.TextArea();field.value="ab";const event={preventDefault(){},currentTarget:{elements:{namedItem:()=>field}}};
  form.props.onSubmit(event);assert.ok(field.validity);assert.equal(calls.length,0);field.value="valid phrase";textarea.props.onInput({currentTarget:field});assert.equal(field.validity,"");form.props.onSubmit(event);
  assert.equal(calls.length,1);assert.equal(calls[0][1].expectedFingerprint,"fingerprint-a");assert.deepEqual(calls[0][1].terms,["valid phrase"]);
});
test("Admin section search is singular/contextual, Claims retry reads only, Last check is stable on rerender",async t=>{
  let claimsFail=true;const f=fixture(t,"app/admin/page.tsx",{component:"AdminWorkspace",fetch:r=>r.url==="/api/ownership-claims"&&claimsFail?Response.json({ok:false,message:"Claims unavailable"},{status:503}):undefined});await f.flush();
  assert.equal(f.all().some(n=>n.props?.["aria-label"]==="Search users, Profiles, or IDs"),false);
  f.click("Claims");await f.flush();assert.ok(f.button("Retry ownership claims"));claimsFail=false;f.click("Retry ownership claims");await f.flush();assert.equal(writeCount(f),0);
  f.click("System Health");await f.flush();const last=()=>words(f.find(n=>n.type==="div"&&nodes(n).some(x=>x.type==="dt"&&words(x)==="Last check")));const before=last();
  f.time(9000);f.click("Overview");f.click("System Health");assert.equal(last(),before);f.click("Run checks");await f.flush();assert.notEqual(last(),before);
  f.click("Users");assert.equal(f.all().filter(n=>n.type==="input"&&n.props["aria-label"]==="Search users").length,1);
});
test("Visible focus trap includes summaries, excludes closed descendants, and wraps from container",t=>{
  const f=fixture(t,"app/admin/promotions/PromoCodesPage.tsx",{component:"PromotionEditor",props:{editing:{id:null,value:{code:"ABC",name:"n",discountType:"percent_off",discountValue:100,minimumAmount:0,eligibleOfferKeys:["profile_1"],maxRedemptions:null,maxRedemptionsPerOwner:null,startsAt:null,endsAt:null}},busy:false,onClose(){},onChange(){},onSave(){}}});
  const {trapVisibleFocus}=f.load("lib/modal-focus.ts");let focus,prevented=0;const container={querySelectorAll:()=>[first,summary,hidden],focus(){focus=this;}};
  const item=()=>({tabIndex:0,closest:()=>null,getClientRects:()=>[{}],parentElement:null,focus(){focus=this;}});const first=item(),summary=item(),closed={tagName:"DETAILS",open:false,parentElement:container,querySelector:()=>summary};summary.parentElement=closed;const hidden=item();hidden.parentElement=closed;
  // Supply computed style through a scoped global only for this pure DOM helper.
  const prior=globalThis.getComputedStyle;globalThis.getComputedStyle=()=>({visibility:"visible"});t.after(()=>{globalThis.getComputedStyle=prior;});
  f.doc.activeElement=first;trapVisibleFocus(container,{key:"Tab",shiftKey:true,preventDefault(){prevented++;}});assert.equal(focus,summary);
  f.doc.activeElement=summary;trapVisibleFocus(container,{key:"Tab",shiftKey:false,preventDefault(){prevented++;}});assert.equal(focus,first);
  f.doc.activeElement=container;trapVisibleFocus(container,{key:"Tab",shiftKey:true,preventDefault(){prevented++;}});assert.equal(focus,summary);assert.equal(prevented,3);
});
test("Edit a stalled write response body times out honestly and ignores its eventual receipt",async t=>{
  const body=deferred();const f=edit(t,{fetch:r=>r.method==="POST"?{ok:true,status:200,json:()=>body.promise}:undefined});await f.flush();
  f.change("externalMediaUrl","https://fixture.invalid/demo");f.change("externalMediaTitle","Kept draft");f.click("Add Media");await f.flush();
  f.expire();await f.flush();assert.match(f.text(),/not fully confirmed/);assert.equal(f.button("Add Media").props.disabled,true);
  body.resolve({ok:true,mediaItem:{id:"late",title:"Late result"}});await f.flush();assert.doesNotMatch(f.text(),/Late result/);assert.equal(f.find(n=>n.props?.id==="externalMediaTitle").props.value,"Kept draft");assert.equal(writeCount(f),1);
});
test("Edit actor change between confirmed details and trust receipt stops the safety stage",async t=>{
  const pending=deferred();const f=edit(t,{fetch:r=>r.method==="PATCH"&&r.body?.verificationOnly?pending.promise:undefined});await f.flush();f.change("summary","Only A's draft");
  f.click("Save Changes");await f.flush();assert.ok(f.requests.some(r=>r.body?.verificationOnly));
  f.actor("actor-b");await f.flush();pending.resolve(Response.json({ok:true,verificationStatus:"verified",internalVerificationNote:"A private note"}));await f.flush();
  assert.equal(f.requests.some(r=>r.url==="/api/safety-status"),false);assert.doesNotMatch(f.text(),/A private note|Only A's draft/);
  assert.equal(f.find(n=>n.props?.id==="summary").props.value,"");
});
test("Edit two-position reorder stops on the failed second receipt and retains its recovery lock",async t=>{
  const media=[{id:"first",title:"First",url:"https://fixture.invalid/a",sortOrder:0,isPublic:false},{id:"second",title:"Second",url:"https://fixture.invalid/b",sortOrder:1,isPublic:false}];let patch=0;
  const f=edit(t,{fetch:r=>r.url.startsWith("/api/external-media")?(r.method==="GET"?Response.json({ok:true,mediaItems:media}):++patch===1?Response.json({ok:true,mediaItem:{...media[0],sortOrder:1}}):Promise.reject(Error("lost second"))):undefined});await f.flush();
  f.click("Move Down");await f.flush();assert.equal(patch,2);assert.match(f.text(),/first media position was saved; the second was not confirmed/);assert.equal(f.button("Add Media").props.disabled,true);
});
test("PayPal lookup form and Back to queue call read-only controller navigation",async t=>{
  const operations=[];const state={phase:"ready",actorId:"actor-a",reviews:[],deliveries:[],busy:false,refreshing:false,environment:"test",message:"",pendingDecision:null,hasMore:true,orderId:"33333333-3333-4333-8333-333333333333"};
  const client={subscribe:()=>()=>{},getState:()=>state,start(){},dispose(){},findOrder:v=>operations.push(["read",v]),showAll:()=>operations.push(["all"]),reload(){}};
  const f=fixture(t,"app/admin/payments/PayPalReviewQueue.tsx",{imports:{"../../../lib/paypal-admin-reviews-client":{initialPayPalAdminReviewsState:()=>state,createPayPalAdminReviewsClient:()=>client}}});await f.flush();
  const input=f.find(n=>n.type==="input"&&n.props.placeholder?.startsWith("QRG-"));input.props.onChange({target:{value:"QRG-"+state.orderId}});f.render();
  f.find(n=>n.type==="form").props.onSubmit({preventDefault(){}});f.click("Back to all holds");
  assert.deepEqual(operations,[["read","QRG-"+state.orderId],["all"]]);assert.match(f.text(),/no hold needs to be released/);
});
test("CMS composition error target opens the exact hidden section/item and focuses its control",t=>{
  let focused=0;const f=fixture(t,"components/SiteCompositionEditor.tsx",{component:"SiteCompositionEditor",props:{pageKey:"home",sections:[],errors:{},onChange(){}}});
  const defaults=f.load("lib/site-settings.ts").defaultEditorialComposition.home.sections;const section=defaults.find(s=>s.blocks.length>1)||defaults.find(s=>s.blocks.length);
  const block=section.blocks.at(-1),key="composition.home."+section.id+"."+block.id+".title";
  const focusError={key};
  f.doc.getElementById=id=>id==="composition-input-"+key.replace(/[^a-z0-9]+/gi,"-")?{focus(){focused++;},scrollIntoView(){}}:null;
  f.update({pageKey:"home",sections:defaults,errors:{[key]:"Title required."},focusError,onChange(){}});
  assert.ok(f.find(n=>n.props?.id==="composition-input-"+key.replace(/[^a-z0-9]+/gi,"-")));assert.equal(focused,1);
  f.update({pageKey:"home",sections:defaults.map(s=>({...s})),errors:{[key]:"Title required."},focusError,onChange(){}});
  assert.equal(focused,1,"an unrelated data edit must not refocus the field");
});
test("Edit failed history read is not presented as an empty saved timeline and can retry",async t=>{
  let failed=true;const f=edit(t,{fetch:r=>r.url.startsWith("/api/service-events")&&failed?Promise.reject(Error("offline")):undefined});await f.flush();
  assert.match(f.text(),/Saved history could not be loaded/);assert.doesNotMatch(f.text(),/No timeline entries yet/);assert.ok(f.button("Retry saved-history read"));
  failed=false;f.click("Retry saved-history read");await f.flush();assert.match(f.text(),/No timeline entries yet/);assert.equal(writeCount(f),0);
});
test("Edit recovery storage unavailable prevents dispatch and keeps the entered draft",async t=>{
  const f=edit(t);await f.flush();f.change("externalMediaUrl","https://fixture.invalid/demo");f.change("externalMediaTitle","Kept draft");
  f.win.sessionStorage.setItem=()=>{throw Error("storage denied");};f.click("Add Media");await f.flush();assert.equal(writeCount(f),0);assert.match(f.text(),/could not be started/);assert.equal(f.find(n=>n.props?.id==="externalMediaTitle").props.value,"Kept draft");
});
test("Edit a late selected document cannot enter a different actor's draft",async t=>{
  const f=edit(t);await f.flush();f.find(n=>n.props?.id==="profileDocuments").props.onChange({target:{files:[{name:"Private A.pdf",size:100,type:"application/pdf"}]}});await f.flush();
  assert.equal(f.readers.length,1);f.actor("actor-b");await f.flush();f.readers[0].result="data:application/pdf;base64,cHJpdmF0ZQ==";f.readers[0].onload();await f.flush();
  assert.doesNotMatch(f.text(),/Private A.pdf/);assert.equal(writeCount(f),0);
});
for(const actors of [["actor-b"],[""],["actor-b","actor-a"]]) test("Edit old rendered Save/media/history callbacks after auth event before rerender are inert: "+actors.join("→"),async t=>{
  const f=edit(t);await f.flush();f.change("externalMediaUrl","https://fixture.invalid/demo");f.change("externalMediaTitle","Old A media");f.change("serviceTitle","Old A history");f.change("summary","Old A summary");
  const handlers=["Save Changes","Add Media","Add Timeline Entry"].map(label=>f.button(label).props.onClick);
  const main=f.find(n=>n.type==="main"),oldField=f.find(n=>n.props?.id==="brand");
  actors.forEach(actor=>f.actor(actor,false));
  const beforeRequests=f.requests.length,beforeWrites=f.stateWrites();
  handlers.forEach(handler=>handler());oldField.props.onChange("An old-render draft value");
  assert.equal(f.requests.length,beforeRequests,"no old-control request before rerender");assert.equal(f.stateWrites(),beforeWrites,"no old-control draft or status mutation");
  let prevented=0,stopped=0;main.props.onChangeCapture({preventDefault(){prevented++;},stopPropagation(){stopped++;}});main.props.onClickCapture({preventDefault(){prevented++;},stopPropagation(){stopped++;}});
  assert.equal(prevented,2);assert.equal(stopped,2);
  await f.flush();assert.equal(writeCount(f),0);assert.doesNotMatch(f.text(),/Old A media|Old A history|Old A summary/);
});

test("Edit resolved auth error is unavailable with retry; a real null session is signed out",async t=>{
  let failed=true;
  const f=edit(t,{session:()=>Promise.resolve(failed?{data:{session:null},error:Error("Auth unavailable")}:{data:{session:{user:{id:"actor-a"},access_token:"token-a"}},error:null})});
  await f.flush();assert.match(f.text(),/Profile temporarily unavailable/);assert.ok(f.button("Retry Profile load"));assert.doesNotMatch(f.text(),/Sign in to edit/);assert.equal(f.requests.length,0);
  failed=false;f.click("Retry Profile load");await f.flush();assert.ok(f.button("Save Changes"));
  const g=edit(t,{session:()=>Promise.resolve({data:{session:null},error:null})});await g.flush();assert.match(g.text(),/Sign in to edit/);assert.doesNotMatch(g.text(),/Profile temporarily unavailable/);assert.equal(g.requests.length,0);
});

async function selectFixtureDocuments(f,count=1) {
  f.find(n=>n.props?.id==="profileDocuments").props.onChange({target:{files:Array.from({length:count},(_,i)=>({name:`Fixture ${i}.pdf`,size:100,type:"application/pdf"}))}});
  await f.flush();
  f.readers.forEach((reader,i)=>{reader.result="data:application/pdf;base64,"+Buffer.from("fixture "+i).toString("base64");reader.onload();});
  await f.flush();
}
for(const succeeds of [true,false]) test("Edit upload deadline retains save lock until late worker "+(succeeds?"success":"failure")+" and explicit retry preserves identity",async t=>{
  const pending=deferred(),uploads=[];
  const f=edit(t,{imports:{"../../../lib/profile-upload-client":{dataUrlToProfileFile:v=>v,uploadProfileFile:o=>{uploads.push(o);return uploads.length===1?pending.promise:Promise.resolve("saved-document-path");}}}});
  await f.flush();await selectFixtureDocuments(f);const oldSave=f.button("Save Changes").props.onClick;f.click("Save Changes");await f.flush();assert.equal(uploads.length,1);
  const timeout=[...f.timers.values()].find(v=>v.delay===30000);assert.ok(timeout);timeout.fn();await f.flush();
  assert.equal(f.button("Saving changes...").props.disabled,true);oldSave();await f.flush();assert.equal(uploads.length,1);assert.equal(writeCount(f),0,"no Profile write at deadline or stale retry");
  if(succeeds)pending.resolve("saved-document-path");else pending.reject(Error("lost upload receipt"));await f.flush();
  assert.equal(writeCount(f),0,"timed-out staging must not auto-continue into Profile save");assert.match(f.text(),/Profile details failed/);assert.equal(f.button("Save Changes").props.disabled,false);
  f.click("Save Changes");await f.flush();assert.equal(uploads.length,succeeds?1:2);
  if(!succeeds){assert.equal(uploads[1].fileId,uploads[0].fileId);assert.equal(uploads[1].uploadId,uploads[0].uploadId);assert.equal(uploads[1].targetGuitarId,uploads[0].targetGuitarId);}
  const details=f.requests.find(r=>r.method==="PATCH"&&r.url==="/api/instruments"&&!r.body.verificationOnly);assert.ok(details);assert.equal(details.body.documents[0].storagePath,"saved-document-path");
});

for(const change of ["actor","code"]) test("Edit upload batch late worker callbacks after "+change+" change cannot mutate the new draft",async t=>{
  const workers=[deferred(),deferred()];let uploads=0;
  const f=edit(t,{imports:{"../../../lib/profile-upload-client":{dataUrlToProfileFile:v=>v,uploadProfileFile:()=>workers[uploads++].promise}}});
  await f.flush();await selectFixtureDocuments(f,2);f.click("Save Changes");await f.flush();assert.equal(uploads,2);
  const timeout=[...f.timers.values()].find(v=>v.delay===30000);assert.ok(timeout);timeout.fn();await f.flush();assert.match(f.text(),/Waiting for active uploads to settle/);
  if(change==="actor")f.actor("actor-b");else f.code("SECOND");await f.flush();
  assert.equal(f.button("Save Changes").props.disabled,false);assert.doesNotMatch(f.text(),/Fixture 0.pdf|Fixture 1.pdf|Waiting for active uploads to settle/);
  const before=f.stateWrites();workers[0].reject(Error("old upload failed"));await f.flush();assert.equal(f.stateWrites(),before);workers[1].resolve("old-upload-path");await f.flush();
  assert.equal(f.stateWrites(),before);assert.equal(writeCount(f),0);assert.equal(f.button("Save Changes").props.disabled,false);
});

for(const kind of ["media","history","details","safety"]) test("Edit same-actor retained route changes reset "+kind+" busy state and keep prior recovery receipt",async t=>{
  const pending=deferred();
  const f=edit(t,{fetch:r=>r.method!=="GET"&&((kind==="media"&&r.url==="/api/external-media")||(kind==="history"&&r.url==="/api/service-events")||(kind==="details"&&r.url==="/api/instruments"&&!r.body?.verificationOnly)||(kind==="safety"&&r.url==="/api/safety-status"))?pending.promise:undefined});
  await f.flush();
  if(kind==="media"){f.change("externalMediaUrl","https://fixture.invalid/demo");f.change("externalMediaTitle","A media");f.click("Add Media");}
  else if(kind==="history"){f.change("serviceTitle","A history");f.click("Add Timeline Entry");}
  else f.click("Save Changes");
  await f.flush();const markerKind=kind==="safety"?"details":kind,key="qrguitar.editor.pending.actor-a.FIXTURE."+markerKind;assert.equal(f.storage.get(key),"FIXTURE");
  f.code("SECOND");await f.flush();assert.equal(f.button("Save Changes").props.disabled,false);assert.equal(f.button("Add Media").props.disabled,false);assert.equal(f.button("Add Timeline Entry").props.disabled,false);
  assert.equal(f.storage.get(key),"FIXTURE");assert.equal(f.all().some(n=>n.type==="button"&&words(n)==="Check saved result"),false);
  const before=f.stateWrites();pending.resolve(Response.json({ok:true,mediaItem:{id:"old",title:"Old media"},serviceEvent:{id:"old",title:"Old history"},qrCode:"FIXTURE",safetyStatus:"lost"}));await f.flush();
  assert.equal(f.stateWrites(),before,"old operation cannot finish into the next route");assert.equal(f.button("Save Changes").props.disabled,false);assert.equal(f.storage.get(key),"FIXTURE");
  f.code("FIXTURE");await f.flush();assert.equal(f.button(kind==="media"?"Add Media":kind==="history"?"Add Timeline Entry":"Save Changes").props.disabled,true);assert.ok(f.button("Check saved result"));
});

test("Edit eight-photo staging deadline stops queued photos/documents, waits for all active workers and requires explicit retry",async t=>{
  const photos=Array.from({length:8},(_,i)=>"data:image/jpeg;base64,"+Buffer.from("photo "+i).toString("base64")),workers=[deferred(),deferred(),deferred()],uploads=[];
  const f=edit(t,{fetch:r=>r.url.startsWith("/api/instruments?")?Response.json({ok:true,instrument:{...f.record,galleryImageDataUrls:photos,heroImageDataUrl:photos[0]},canManageVerification:true}):undefined,
    imports:{"../../../lib/profile-upload-client":{dataUrlToProfileFile:v=>v,uploadProfileFile:o=>{uploads.push(o);return uploads.length<=3?workers[uploads.length-1].promise:Promise.resolve("saved-"+o.file);}}}});
  await f.flush();await selectFixtureDocuments(f);const oldSave=f.button("Save Changes").props.onClick;f.click("Save Changes");await f.flush();assert.equal(uploads.length,3);
  const timeout=[...f.timers.values()].find(v=>v.delay===30000);assert.ok(timeout);timeout.fn();await f.flush();assert.equal(writeCount(f),0);assert.match(f.text(),/Waiting for active uploads to settle/);assert.equal(f.button("Saving changes...").props.disabled,true);
  workers[0].resolve("confirmed-first-photo");await f.flush();assert.equal(uploads.length,3,"no queued upload may start when an active worker settles after deadline");assert.equal(f.button("Saving changes...").props.disabled,true);
  workers[1].resolve("confirmed-second-photo");await f.flush();assert.equal(uploads.length,3);assert.equal(f.button("Saving changes...").props.disabled,true);
  assert.match(f.text(),/Waiting for active uploads to settle\. Queued files are kept for your next explicit save; no Profile change has been sent\./);
  oldSave();await f.flush();assert.equal(uploads.length,3);assert.equal(writeCount(f),0);
  workers[2].resolve("confirmed-third-photo");await f.flush();assert.equal(uploads.length,3,"neither queued photos nor the document phase may start");assert.equal(writeCount(f),0);assert.equal(f.button("Save Changes").props.disabled,false);
  const organizer=f.find(n=>n.type==="PhotoOrganizer");assert.deepEqual(organizer.props.images,photos);assert.equal(organizer.props.statusByImage[photos[0]].storagePath,"confirmed-first-photo");assert.match(f.text(),/Fixture 0.pdf/);
  f.click("Save Changes");await f.flush();assert.equal(uploads.length,9,"explicit retry uploads five remaining photos and one document, not the confirmed three");
  assert.equal(uploads.filter(o=>photos.slice(0,3).includes(o.file)).length,3);assert.equal(uploads.filter(o=>o.kind==="document").length,1);
  const details=f.requests.find(r=>r.method==="PATCH"&&r.url==="/api/instruments"&&!r.body.verificationOnly);assert.ok(details);assert.equal(details.body.photos.length,8);assert.deepEqual(details.body.photos.slice(0,3),["confirmed-first-photo","confirmed-second-photo","confirmed-third-photo"]);
});


function connectAdminHeading(f, toolbarHeight=76) {
  const headingNode=f.find(n=>n.type==="h1"&&words(n)==="Overview");
  assert.ok(headingNode.props.ref,"Section heading must be the navigation focus target");
  assert.equal(headingNode.props.tabIndex,-1,"Heading is programmatically focusable, not an extra tab stop");
  const focused=[],scrolled=[],query=[],listeners=new Map();
  const heading={isConnected:true,getBoundingClientRect:()=>({top:-723.4}),focus(options){focused.push(options);f.doc.activeElement=this;}};
  headingNode.props.ref.current=heading;
  const bar=f.find(n=>n.props?.className==="admin-command-bar");assert.ok(bar.props.ref);bar.props.ref.current={offsetHeight:toolbarHeight};
  f.win.scrollY=924;f.win.scrollTo=options=>{scrolled.push(options);f.win.scrollY=options.top;};
  f.win.history.replaceState=(_state,_unused,url)=>query.push(url);
  f.doc.addEventListener=(type,fn)=>listeners.set(type,fn);f.doc.removeEventListener=(type,fn)=>{if(listeners.get(type)===fn)listeners.delete(type);};
  const zero=()=>{for(const [id,timer]of [...f.timers])if(timer.delay===0){f.timers.delete(id);timer.fn();}f.render();};
  return {heading,focused,scrolled,query,listeners,zero};
}

test("Admin explicit section navigation focuses visible heading without disturbing updates",async t=>{
  const f=fixture(t,"app/admin/page.tsx",{component:"AdminWorkspace",fetch:r=>r.url==="/api/admin/audit"?Response.json({ok:true,auditEvents:[{id:"event-a",action:"site_content_published",created_at:"2026-09-27T12:00:00Z"}]}):undefined});await f.flush();
  const nav=connectAdminHeading(f);assert.equal(nav.focused.length,0);assert.equal(nav.scrolled.length,0);
  const recent=f.find(n=>n.type==="button"&&words(n).startsWith("Website content published -"));recent.props.onClick();f.render();nav.zero();
  assert.equal(words(f.find(n=>n.type==="h1")),"Audit Log");assert.equal(f.doc.activeElement,nav.heading);
  assert.deepEqual(nav.focused,[{preventScroll:true}]);assert.equal(nav.scrolled.length,1);assert.ok(Math.abs(nav.scrolled[0].top-108.6)<0.01);assert.equal(nav.scrolled[0].behavior,"auto");assert.equal(nav.query.at(-1),"/admin?section=audit");
  const search=f.find(n=>n.type==="input"&&n.props.onChange);search.props.onChange({target:{value:"kept search"}});f.render();f.update({});nav.zero();
  assert.equal(nav.focused.length,1,"Typing and ordinary rerenders must not steal focus");assert.equal(nav.scrolled.length,1);assert.equal(writeCount(f),0);
});

test("Admin explicit section navigation wins drawer cleanup while Escape returns to menu",async t=>{
  const f=fixture(t,"app/admin/page.tsx",{component:"AdminWorkspace"});await f.flush();const nav=connectAdminHeading(f,150);f.win.innerWidth=390;
  const opener=f.find(n=>n.type==="button"&&n.props["aria-label"]==="Open admin navigation"),returns=[];
  opener.props.ref.current={isConnected:true,focus(){returns.push("menu");f.doc.activeElement=this;}};
  const sidebar=f.find(n=>n.type==="aside"&&n.props.ref);sidebar.props.ref.current={querySelector:()=>({focus(){}}),querySelectorAll:()=>[],focus(){}};
  opener.props.onClick();f.render();nav.zero();f.click("Audit Log");nav.zero();
  assert.equal(f.doc.activeElement,nav.heading);assert.equal(returns.length,0,"Stale drawer return must not replace new heading focus");assert.equal(nav.focused.length,1);assert.ok(Math.abs(nav.scrolled[0].top-34.6)<0.01);
  opener.props.onClick();f.render();nav.zero();assert.ok(nav.listeners.has("keydown"));nav.listeners.get("keydown")({key:"Escape",preventDefault(){}});f.render();nav.zero();
  assert.deepEqual(returns,["menu"]);assert.equal(f.doc.activeElement,opener.props.ref.current);assert.equal(nav.focused.length,1);assert.notEqual(f.doc.body.style.overflow,"hidden");assert.equal(writeCount(f),0);
});


test("Admin explicit section navigation cannot focus after its account departs",async t=>{
  const f=fixture(t,"app/admin/page.tsx",{component:"AdminWorkspace"});await f.flush();const nav=connectAdminHeading(f);
  f.click("Audit Log");f.actor("actor-b");await f.flush();nav.zero();
  assert.equal(nav.focused.length,0,"Queued departed-account navigation must not capture the new account");assert.equal(nav.scrolled.length,0);assert.equal(writeCount(f),0);
});

test("Admin explicit section navigation applies only the most recent section request",async t=>{
  const f=fixture(t,"app/admin/page.tsx",{component:"AdminWorkspace"});await f.flush();const nav=connectAdminHeading(f);
  f.click("Audit Log");f.click("Profiles");nav.zero();
  assert.equal(nav.focused.length,1);assert.equal(nav.scrolled.length,1);assert.equal(nav.query.at(-1),"/admin?section=records");assert.equal(writeCount(f),0);
});

for (const updatedAt of [undefined, "not-a-version"]) test("Edit absent or malformed observed revision blocks staging and all writes: " + String(updatedAt), async t => {
  let uploads = 0;
  const f = edit(t, { fetch: r => r.url.startsWith("/api/instruments?") ? Response.json({ ok: true, instrument: { ...f.record, updatedAt }, canManageVerification: true }) : undefined,
    imports: { "../../../lib/profile-upload-client": { dataUrlToProfileFile: v => v, uploadProfileFile: async () => { uploads++; return "unexpected-upload-path"; } } } });
  await f.flush(); f.change("summary", "Retained revision-blocked draft"); await selectFixtureDocuments(f);
  f.click("Save Changes"); await f.flush();
  assert.match(f.text(), /Profile details failed: Reload this Profile before saving again\./);
  assert.equal(uploads, 0); assert.equal(writeCount(f), 0);
  assert.equal(f.find(n => n.props?.id === "summary").props.value, "Retained revision-blocked draft");
});
test("Edit successful details response without a revision stays unconfirmed and sends no trust or safety", async t => {
  const f = edit(t, { fetch: r => r.url === "/api/instruments" && r.method === "PATCH" && !r.body?.verificationOnly ? Response.json({ ok: true, qrCode: "FIXTURE" }) : undefined });
  await f.flush(); f.change("summary", "Retained unconfirmed draft"); f.click("Save Changes"); await f.flush();
  const details = f.requests.filter(r => r.url === "/api/instruments" && r.method === "PATCH" && !r.body?.verificationOnly);
  assert.equal(details.length, 1); assert.equal(details[0].body.expectedUpdatedAt, "2026-09-01T00:00:00.000Z");
  assert.deepEqual(details[0].body.expectedDocuments, []);
  assert.match(f.text(), /saved result is not fully confirmed/);
  assert.equal(f.button("Save Changes").props.disabled, true); assert.equal(writeCount(f), 1);
  assert.equal(f.requests.some(r => r.body?.verificationOnly || r.url === "/api/safety-status"), false);
  assert.equal(f.find(n => n.props?.id === "summary").props.value, "Retained unconfirmed draft");
});
