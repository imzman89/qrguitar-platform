import { withUiTextTestContext } from "../ui-text-test-context.mjs";
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const args=process.argv.slice(2); const option=(name)=>args[args.indexOf(name)+1];
const inferredRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const repo=path.resolve(args.includes('--repo')?option('--repo'):process.env.QRGUITAR_TEST_REPO||inferredRoot);
const proposal=path.resolve(args.includes('--proposal')?option('--proposal'):inferredRoot);
const ts=createRequire(path.join(repo,'package.json'))('typescript');
function compile(source,deps={}){const module={exports:{}};const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext(code,{module,exports:module.exports,require:n=>{if(!(n in deps))throw Error('Unexpected import '+n);return deps[n];},Request,Response,URL,console,Blob,setTimeout,clearTimeout,crypto:globalThis.crypto,ui:withUiTextTestContext(()=>{throw new Error("Unexpected module");})("UiTextProvider").useUiText("app.site.editor.page")});return module.exports;}
const client=compile(fs.readFileSync(path.join(proposal,'apps/web/lib/site-editor-client.ts'),'utf8'));
const {createEditorMutationController,EditorLoadError,loadSiteEditorState,selectCompleteSectionSchema,selectEditorEntries,shouldReplaceEditorContent}=client;
function storage(){const values=new Map();return {values,getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};}
let serial=0;const uuid=()=>`00000000-0000-4000-8000-${String(++serial).padStart(12,'0')}`;
const versions={publishedVersion:'p1',draftVersion:'d1'};
const ok=(body,extra={})=>({status:200,payload:{ok:true,committed:true,requestId:JSON.parse(body).requestId,publishedVersion:'p2',draftVersion:'d2',...extra}});
const deferred=()=>{let resolve;let reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
let passes=0;async function test(name,fn){await fn();passes++;console.log('PASS '+name);}
await test('mutation persists a complete frozen request before any network call',async()=>{
 const local=storage();let captured;const c=createEditorMutationController({actorId:'a',storage:local,uuid,send:async body=>{captured=body;assert.equal(JSON.parse([...local.values.values()][0]).body,body);return ok(body);}});
 await c.mutate({action:'publish',settings:{name:'A'}},versions,'local A');const request=JSON.parse(captured);assert.equal(request.expectedDraftVersion,'d1');assert.equal(request.expectedPublishedVersion,'p1');assert.equal(local.values.size,0);
});
await test('storage denial sends zero network requests',async()=>{let sends=0;const c=createEditorMutationController({actorId:'a',uuid,storage:{getItem:()=>null,setItem:()=>{throw Error('quota');},removeItem(){}},send:async()=>{sends++;}});await assert.rejects(c.mutate({},versions,'a'),/not sent/);assert.equal(sends,0);});
await test('corrupted persisted attempts fail closed without network activity',async()=>{const local=storage();local.values.set('qrguitar.site-editor.pending.v1:a','bad JSON');const c=createEditorMutationController({actorId:'a',storage:local,uuid,send:()=>{throw Error('must not send');}});assert.equal(c.storageProblem,true);await assert.rejects(c.mutate({},versions,'a'),/Recovery storage/);});
await test('one in-flight mutation rejects a second; it is never sent concurrently',async()=>{const gate=deferred();let sends=0;const c=createEditorMutationController({actorId:'a',storage:storage(),uuid,send:body=>{sends++;return gate.promise.then(()=>ok(body));}});const first=c.mutate({action:'save_draft'},versions,'a');await assert.rejects(c.mutate({action:'publish'},versions,'b'),/Wait/);gate.resolve();await first;assert.equal(sends,1);});
await test('connection loss preserves exact body and blocks new writes until retry',async()=>{const bodies=[];let fail=true;const c=createEditorMutationController({actorId:'a',storage:storage(),uuid,send:async body=>{bodies.push(body);if(fail)throw Error('lost');return ok(body);}});await assert.rejects(c.mutate({action:'publish',settings:{text:'one'}},versions,'a'),e=>e.uncertain);await assert.rejects(c.mutate({action:'publish',settings:{text:'two'}},versions,'b'),e=>e.uncertain);fail=false;await c.retry();assert.equal(bodies.length,2);assert.equal(bodies[0],bodies[1]);assert.equal(c.pending,null);});
await test('refresh recovers actor-scoped exact-body attempt and original local snapshot',async()=>{const local=storage();const c=createEditorMutationController({actorId:'a',storage:local,uuid,send:async()=>{throw Error('lost');}});await assert.rejects(c.mutate({action:'publish'},versions,'original local'));const saved=c.pending.body;const reloaded=createEditorMutationController({actorId:'a',storage:local,uuid,send:async body=>{assert.equal(body,saved);return ok(body);}});assert.equal(reloaded.pending.localSnapshot,'original local');const other=createEditorMutationController({actorId:'other',storage:local,uuid,send:()=>{throw Error();}});assert.equal(other.pending,null);await reloaded.retry();});
await test('401 after an uncertain attempt cannot erase a possibly committed request',async()=>{let status='lost';const local=storage();const c=createEditorMutationController({actorId:'a',storage:local,uuid,send:async body=>{if(status==='lost')throw Error();if(status==='auth')return{status:401,payload:{ok:false,uncertain:false,message:'Sign in'}};return ok(body);}});await assert.rejects(c.mutate({},versions,'a'));const body=c.pending.body;status='auth';await assert.rejects(c.retry(),e=>e.uncertain);assert.equal(c.pending.body,body);status='ok';await c.retry();});
await test('known database conflict after receipt check clears pending but reports conflict',async()=>{const c=createEditorMutationController({actorId:'a',storage:storage(),uuid,send:async()=>({status:409,payload:{ok:false,uncertain:false,conflict:true,code:'QSE01'}})});await assert.rejects(c.mutate({},versions,'a'),e=>e.payload.conflict&&!e.uncertain);assert.equal(c.pending,null);});
await test('fresh validation rejection clears attempt and is not called a successful save',async()=>{const c=createEditorMutationController({actorId:'a',storage:storage(),uuid,send:async()=>({status:400,payload:{ok:false,uncertain:false,errors:{name:'required'}}})});await assert.rejects(c.mutate({},versions,'a'),e=>!e.uncertain&&e.payload.errors.name==='required');assert.equal(c.pending,null);});
for(const response of [{status:200,payload:{}},{status:200,payload:{ok:true,committed:true,requestId:'wrong',...versions}},{status:503,payload:{ok:false}},{status:502,payload:{ok:true}}])await test('malformed or unconfirmed HTTP '+response.status+' response retains exact pending request',async()=>{const c=createEditorMutationController({actorId:'a',storage:storage(),uuid,send:async()=>response});await assert.rejects(c.mutate({},versions,'a'),e=>e.uncertain);assert.ok(c.pending);});
await test('storage cleanup failure after confirmed commit does not report save failure',async()=>{const local=storage();local.removeItem=()=>{throw Error('blocked');};const c=createEditorMutationController({actorId:'a',storage:local,uuid,send:async body=>ok(body)});const result=await c.mutate({},versions,'a');assert.equal(result.committed,true);assert.equal(c.pending,null);});
await test('typing during a save is preserved; unchanged input may accept server normalization',async()=>{assert.equal(shouldReplaceEditorContent('newer','submitted'),false);assert.equal(shouldReplaceEditorContent('submitted','submitted'),true);});
await test('initial load distinguishes authorization from retryable service failures',async()=>{
 let requests=0;
 await assert.rejects(loadSiteEditorState(async()=>null,async()=>{requests++;}),error=>error instanceof EditorLoadError&&error.kind==='authorization');
 assert.equal(requests,0);
 await assert.rejects(loadSiteEditorState(async()=>'token',async()=>Response.json({ok:false,message:'Forbidden'},{status:403})),error=>error.kind==='authorization');
 await assert.rejects(loadSiteEditorState(async()=>'token',async()=>{throw Error('offline');}),error=>error.kind==='unavailable'&&/retry/i.test(error.message));
 await assert.rejects(loadSiteEditorState(async()=>'token',async()=>Response.json({ok:false,message:'Storage offline'},{status:503})),error=>error.kind==='unavailable');
 const payload=await loadSiteEditorState(async()=>'token',async()=>Response.json({ok:true,editorActorId:'actor'}));assert.equal(payload.editorActorId,'actor');
});
await test('search remains on the selected page and active schema stays complete',async()=>{
 const entries=[
  {area:'Emails',page:'Service',section:'Submitted',key:'email.service.submitted.subject',label:'Subject',help:'subject'},
  {area:'Emails',page:'Service',section:'Submitted',key:'email.service.submitted.body',label:'Body',help:'body'},
  {area:'Emails',page:'Security',section:'Account',key:'email.security.account.subject',label:'Subject',help:'subject'}
 ];
 const scoped=selectEditorEntries(entries,{area:'Emails',page:'Service'},'subject');
 assert.deepEqual(scoped.results.map(entry=>entry.key),['email.service.submitted.subject']);
 assert.deepEqual(selectCompleteSectionSchema(scoped.currentPage,scoped.results,'Submitted').map(entry=>entry.key),['email.service.submitted.subject','email.service.submitted.body']);
});

const base={brandName:'QRguitar',content:{title:'Before'},composition:{},colors:{background:'#000000',panel:'#111111',gold:'#f0a12b',cream:'#ffffff',text:'#ffffff'},seo:{canonicalUrl:'https://www.qrguitar.com'}};
const merge=value=>({...base,...value});
const server=compile(fs.readFileSync(path.join(proposal,'apps/web/lib/site-editor-server.ts'),'utf8'),{'./site-settings':{mergeSiteSettings:merge}});
const raw={publishedValue:base,publishedAt:'date',publishedVersion:'p2',draftValue:null,draftVersion:'',revisionRows:[]};
await test('cache invalidation failure returns confirmed success with a warning',async()=>{const result=await server.finishEditorCommit({committed:true},()=>{throw Error('cache');});assert.equal(result.result.committed,true);assert.match(result.warning,/Saved successfully/);});
await test('unrecognized database failure is explicitly uncertain',async()=>{assert.equal(server.editorFailure('PGRST000').body.uncertain,true);assert.equal(server.editorFailure('QSE01').body.uncertain,false);});
function routeHarness({error=null,throws=false,cacheThrows=false}={}){let calls=0;const rpcCalls=[];const supabase={rpc:async name=>{calls++;rpcCalls.push(name);if(name==='read_site_editor_state')return{error:null,data:raw};assert.equal(name,'mutate_site_editor');if(throws)throw Error('connection');return{error,data:{state:raw,before:base,changedFields:['content.title'],requestId:'00000000-0000-4000-8000-000000000001'}};},from:()=>{throw Error('No post-commit reload allowed');}};const route=compile(fs.readFileSync(path.join(proposal,'apps/web/app/api/site-editor/route.ts'),'utf8'),{
 'next/cache':{unstable_noStore(){},revalidatePath(){if(cacheThrows)throw Error('cache');}},'next/server':{NextResponse:{json:(body,init)=>Response.json(body,init)}},
 '../../../lib/admin-auth':{getAdminContext:async()=>({ok:true,user:{id:'actor'},email:'editor@example.test'}),readAdminEmailList:()=>[]},
 '../../../lib/content-registry':{validateContentValues:()=>({}),validateProtectedContentValues:()=>({})},'../../../lib/site-settings':{mergeSiteSettings:merge,publishedSiteSettingsKey:'homepage',validateEditorialComposition:()=>({}),validateSiteThemeContrast:colors=>colors.gold==='#555555'?{'colors.gold':'Accent text needs at least 3:1 contrast against the background.'}:{},validateBrandLogoEntries:value=>{const errors={};for(const [brand,url] of Object.entries(value||{})){const candidate=String(url||'').trim();let safe=candidate.startsWith('/')?!candidate.startsWith('//')&&!candidate.includes('\\'):false;if(!candidate.startsWith('/'))try{const parsed=new URL(candidate);safe=parsed.protocol==='https:'&&!parsed.username&&!parsed.password;}catch{}if(!safe)errors['brandLogos.'+brand]='Use an HTTPS URL or a site-relative path beginning with one slash.';}return errors;}},
 '../../../lib/supabase-server':{createServerSupabaseClientWithTimeout:()=>supabase},'../../../lib/site-editor-server':server,
 '../../../lib/site-editor-copy-reconciliation':{localCopyReconciliationSource:'local_exact_copy_reconciliation_v1',allowLocalCopyReconciliation(){throw Error('Local copy branch must remain closed in ordinary fixtures; use the dedicated source tests.');},prepareLocalCopyMutation(){throw Error('Local copy mutation must not run in ordinary fixtures; use the dedicated source tests.');},CopyReconciliationError:class extends Error{}}
 });return{route,rpcCalls,get calls(){return calls;}};}
const wire={expectedActorId:'actor',action:'publish',requestId:'00000000-0000-4000-8000-000000000001',expectedPublishedVersion:'p1',expectedDraftVersion:'d1',settings:base};
const req=body=>new Request('https://www.qrguitar.com/api/site-editor',{method:'PUT',body:JSON.stringify(body)});
await test('API returns committed transaction snapshot without any post-commit reload',async()=>{const h=routeHarness();const response=await h.route.PUT(req(wire));const payload=await response.json();assert.equal(response.status,200);assert.equal(payload.committed,true);assert.equal(payload.publishedVersion,'p2');assert.equal(h.calls,2);assert.deepEqual(h.rpcCalls,['read_site_editor_state','mutate_site_editor']);});
await test('API cache failure still reports successful committed publish',async()=>{const h=routeHarness({cacheThrows:true});const response=await h.route.PUT(req(wire));const payload=await response.json();assert.equal(response.status,200);assert.equal(payload.committed,true);assert.match(payload.message,/Saved successfully/);});
await test('API transport failure is an uncertain retryable 503',async()=>{const h=routeHarness({throws:true});const response=await h.route.PUT(req(wire));assert.equal(response.status,503);assert.equal((await response.json()).uncertain,true);});
await test('API rejects legacy unversioned writes before any mutation',async()=>{const h=routeHarness();const response=await h.route.PUT(req({action:'publish',settings:base}));assert.equal(response.status,428);assert.equal(h.calls,0);});
await test('API rejects a different signed-in actor before any transaction',async()=>{const h=routeHarness();const response=await h.route.PUT(req({...wire,expectedActorId:'previous-account'}));assert.equal(response.status,403);assert.equal(h.calls,0);});
await test('legacy brand logo publisher cannot discard an existing shared draft',async()=>{const h=routeHarness();const response=await h.route.PUT(req({...wire,source:'brand_logo_admin'}));assert.equal(response.status,409);assert.equal(h.calls,0);});
for(const logoUrl of ['http://assets.example.test/logo.svg','//assets.example.test/logo.svg','javascript:alert(1)','/brands\\logo.svg'])await test('API rejects unsafe brand logo '+logoUrl,async()=>{const h=routeHarness();const response=await h.route.PUT(req({...wire,settings:{...base,brandLogos:{fender:logoUrl}}}));const payload=await response.json();assert.equal(response.status,400);assert.match(payload.errors['brandLogos.fender'],/HTTPS URL/);assert.equal(h.calls,0);});
for(const logoUrl of ['https://assets.example.test/logo.svg','/brands/fender.svg'])await test('API accepts safe brand logo '+logoUrl,async()=>{const h=routeHarness();const response=await h.route.PUT(req({...wire,settings:{...base,brandLogos:{fender:logoUrl}}}));assert.equal(response.status,200);assert.equal(h.calls,2);});
await test('API publish gate rejects an accent below 3:1 before mutation',async()=>{const h=routeHarness();const response=await h.route.PUT(req({...wire,settings:{...base,colors:{...base.colors,gold:'#555555'}}}));const payload=await response.json();assert.equal(response.status,400);assert.match(payload.errors['colors.gold'],/3:1/);assert.equal(h.calls,0);});

const emailEntries=['subject','preheader','heading','body','cta','footer'].map(suffix=>({key:`email.service.submitted.${suffix}`,area:'Emails',maxLength:700,allowedVariables:[]}));
const otherEmail={key:'email.service.approved.subject',area:'Emails',maxLength:120,allowedVariables:[]};
let emailSends=0;
const emailRoute=compile(fs.readFileSync(path.join(proposal,'apps/web/app/api/site-editor/test-email/route.ts'),'utf8'),{
 'next/cache':{unstable_noStore(){}},'next/server':{NextResponse:{json:(body,init)=>Response.json(body,init)}},
 '../../../../lib/admin-auth':{getAdminContext:async()=>({ok:true,user:{id:'actor'},email:'editor@example.test'}),logAdminAuditEvent:async()=>{}},
 '../../../../lib/content-registry':{contentRegistryByKey:new Map([...emailEntries,otherEmail].map(entry=>[entry.key,entry])),validateVariables:()=>undefined},
 '../../../../lib/transactional-email':{sendAdminTemplateTestEmail:async()=>{emailSends++;return{ok:true,status:200,message:'Sent'};}},
 '../../../../lib/supabase-server':{createServerSupabaseClient:()=>null}
});
const emailRequest=fields=>new Request('https://www.qrguitar.com/api/site-editor/test-email',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({fields})});
await test('email test endpoint requires exactly one complete registered template',async()=>{
 emailSends=0;
 let response=await emailRoute.POST(emailRequest({'email.service.submitted.subject':'Subject','email.service.submitted.body':'Body'}));assert.equal(response.status,400);
 response=await emailRoute.POST(emailRequest(Object.fromEntries(emailEntries.map(entry=>[entry.key,entry.key.endsWith('.subject')?'Subject':entry.key.endsWith('.body')?'Body':'Value']))));assert.equal(response.status,200);assert.equal(emailSends,1);
 response=await emailRoute.POST(emailRequest({...Object.fromEntries(emailEntries.map(entry=>[entry.key,'Value'])),'email.service.approved.subject':'Other'}));assert.equal(response.status,400);assert.equal(emailSends,1);
});

// Execute the actual component persistence region with state/network dependencies,
// rather than mirroring its behavior in a separate model.
const page=fs.readFileSync(path.join(proposal,'apps/web/app/site-editor/page.tsx'),'utf8');
const functions=page.slice(page.indexOf('  const applyPayload = useCallback('),page.indexOf('  async function issueDraftPreview('));
const harnessModule=compile(`export function harness(d:any){ const {settingsRef,versionsRef,actorRef,mutationsRef,manualPending,writeTask,issueRef,lastServerDraft,setSettings,setPublished,setPublishedAt,setAdvancedJson,applyThemeSettings,setDraftMeta,setRevisions,setWriteBusy,setStatus,setMessage,setEditorIssue,setErrors,setPreviewVersion,hydrateLegacyContent,mergeSiteSettings,shouldReplaceEditorContent,validateEditorSettings,siteColorContrastRatio,EditorMutationError,window,useCallback}=d; const crashRecoveryKey='test'; ${functions} return {executeEditor,applyPayload}; }`);
function ui(send){const current={...base,content:{title:'Submitted'}};const d={settingsRef:{current},versionsRef:{current:{...versions}},actorRef:{current:'a'},mutationsRef:{current:createEditorMutationController({actorId:'a',storage:storage(),uuid,send})},manualPending:{current:false},writeTask:{current:null},issueRef:{current:''},lastServerDraft:{current:''},messages:[],statuses:[],useCallback:callback=>callback,setSettings(v){d.settingsRef.current=v;},setPublished(){},setPublishedAt(){},setAdvancedJson(){},applyThemeSettings(){},setDraftMeta(){},setRevisions(){},setWriteBusy(){},setStatus(v){d.statuses.push(v);},setMessage(v){d.messages.push(v);},setEditorIssue(v){d.issueRef.current=v;},setErrors(){},setPreviewVersion(){},hydrateLegacyContent:v=>v,mergeSiteSettings:merge,shouldReplaceEditorContent,validateEditorSettings:()=>({}),siteColorContrastRatio:()=>10,EditorMutationError:client.EditorMutationError,window:{localStorage:{removeItem(){}}}};return{d,...harnessModule.harness(d)};}
const uiOk=body=>ok(body,{published:base,draft:JSON.parse(body).settings||null,draftMeta:{},revisions:[]});
await test('actual UI preserves edits typed while autosave is in flight',async()=>{const gate=deferred();const h=ui(body=>gate.promise.then(()=>uiOk(body)));const save=h.executeEditor('save_draft');h.d.settingsRef.current={...base,content:{title:'Typed later'}};gate.resolve();await save;assert.equal(h.d.settingsRef.current.content.title,'Typed later');assert.equal(h.d.statuses.at(-1),'dirty');assert.equal(h.d.versionsRef.current.draftVersion,'d2');});
await test('manual publish waits for autosave and uses its resulting versions',async()=>{const gate=deferred(),bodies=[];const h=ui(async body=>{bodies.push(JSON.parse(body));if(bodies.length===1)await gate.promise;return uiOk(body);});const save=h.executeEditor('save_draft');const publish=h.executeEditor('publish',{},true);assert.equal(bodies.length,1);gate.resolve();await Promise.all([save,publish]);assert.equal(bodies.length,2);assert.equal(bodies[1].expectedDraftVersion,'d2');});
await test('actual UI uncertainty blocks a different manual mutation until exact retry',async()=>{let fail=true;const bodies=[];const h=ui(async body=>{bodies.push(body);if(fail)throw Error('lost');return uiOk(body);});await h.executeEditor('save_draft');assert.equal(h.d.issueRef.current,'uncertain');await h.executeEditor('publish',{},true);assert.equal(bodies.length,1);assert.match(h.d.messages.at(-1),/Resolve the current save issue with the recovery controls/);fail=false;await h.executeEditor('',{},true,true);assert.equal(bodies[0],bodies[1]);assert.equal(h.d.issueRef.current,'');});
await test('superseded successful replay remains saved but blocks automatic overwrite',async()=>{const h=ui(async body=>({...uiOk(body),payload:{...uiOk(body).payload,superseded:true}}));await h.executeEditor('save_draft');assert.equal(h.d.issueRef.current,'conflict');assert.match(h.d.messages.at(-1),/was saved/);await h.executeEditor('publish',{},true);assert.equal(h.d.issueRef.current,'conflict');});
console.log(`\n${passes} client/API control-flow tests passed.`);

