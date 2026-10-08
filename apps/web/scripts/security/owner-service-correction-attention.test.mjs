import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { installRepositorySchema } from "./postgres-fixture.mjs";

export async function qualifyOwnerServiceCorrectionAttention({ repo, read, sql }) {
 const require = createRequire(path.join(repo,"apps/web/package.json")), ts = require("typescript"), { PGlite } = require("@electric-sql/pglite-pg17");
 const results = [], db = new PGlite();
 const same = (a,b) => assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)));
 const tick = () => new Promise(resolve => setImmediate(resolve));
 const deferred = () => { let resolve; const promise = new Promise(r => resolve=r); return { promise, resolve }; };
 async function test(name,run) { try { await run(); results.push({name,ok:true}); } catch(error) { results.push({name,ok:false,message:error.message,code:error.code}); } }
 let seq=500; const id=()=>"aaaaaaaa-aaaa-4aaa-8aaa-"+String(++seq).padStart(12,"0"), owner=id(), provider=id(), buyer=id();
 const q=(s,args=[])=>db.query(s,args), one=async(s,args=[])=>(await q(s,args)).rows[0];
 const summary=async actor=>(await one("select read_owner_service_correction_attention($1) value",[actor])).value;
 const privatePattern=/PRIVATE_|details|request_body|provider_user_id|owner_user_id|storage_path|evidence/;
 async function asOwner(run) { await db.exec("reset role"); let failed=false; try { return await run(); } catch(error) { failed=true;throw error; } finally { try { await db.exec("set role service_role"); } catch(error) { if(!failed)throw error; } } }
 async function fixture() {
  const guitar=id(),sid=id(),code="QRG-"+guitar.toUpperCase();
  await q("insert into guitars(id,owner_id,qr_code,permanent_path,name,brand,visibility) values($1,$2,$3,$4,'Fixture','Fixture','private')",[guitar,owner,code,"/i/"+code]);
  await q("insert into service_submissions(id,guitar_id,provider_user_id,owner_user_id,title,work_performed,service_date,status) values($1,$2,$3,$4,'PRIVATE_TITLE','PRIVATE_REPORT','2026-09-01','submitted')",[sid,guitar,provider,owner]);
  const version=await one("select updated_at::text v from service_submissions where id=$1",[sid]);
  await q("select * from confirm_service_submission($1,$2,null,'private',$3)",[sid,owner,version.v]);
  const current=(await one("select read_service_corrections($1,$2) value",[provider,sid])).value;
  const correctionId=id(),body={action:"propose",requestId:correctionId,submissionId:sid,expectedRevision:current.revision,expectedEventUpdatedAt:current.eventUpdatedAt,details:"PRIVATE_CORRECTION_MESSAGE"};
  await q("select mutate_service_correction($1,$2::jsonb)",[provider,JSON.stringify(body)]);
  return { guitar,sid,code,correctionId };
 }
 async function decide(f,action) {
  const s=(await one("select read_service_corrections($1,$2) value",[owner,f.sid])).value;
  await q("select mutate_service_correction($1,$2::jsonb)",[owner,JSON.stringify({action,requestId:id(),submissionId:f.sid,expectedRevision:s.revision,correctionId:f.correctionId,sharePublicly:false})]);
 }
 const source=read("apps/web/app/dashboard/page.tsx"), ast=ts.createSourceFile("dashboard.tsx",source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const functions=new Map(),effects=[],expressions=[],variables=[];
 function visit(n) {
  if(ts.isFunctionDeclaration(n)&&n.name)functions.set(n.name.text,n.getText(ast));
  if(ts.isCallExpression(n)&&n.expression.getText(ast)==="useEffect")effects.push(n.arguments[0].getText(ast));
  if(ts.isJsxExpression(n)&&n.expression)expressions.push(n.expression);
  if(ts.isVariableDeclaration(n))variables.push(n);
  ts.forEachChild(n,visit);
 } visit(ast);
 const effect=effects.filter(e=>e.includes("loadOwnerServiceCorrectionAttention(token"));
 assert.equal(effect.length,1,"Exactly one actual correction attention effect is required");
 for(const name of ["loadOwnerServiceCorrectionAttention","DashboardServiceCorrectionAttention"])assert.ok(functions.has(name),"Missing actual function "+name);
 function initializer(name) { const found=variables.filter(n=>n.name.getText(ast)===name);assert.equal(found.length,1,"Actual initializer "+name+" must be unique");return found[0].initializer.getText(ast); }
 function compile(code,env,ret,jsx=false) {
  const result=ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX},reportDiagnostics:true});
  assert.equal(result.diagnostics.length,0,"Actual source must compile");
  const native=specifier=>{assert.equal(specifier,"react/jsx-runtime");const jsx=(type,props)=>({type,props});return{jsx,jsxs:jsx};};
  return new Function(...Object.keys(env),"require","exports",result.outputText+"\nreturn "+ret)(...Object.values(env),native,{});
 }
 const apiSource=read("apps/web/app/api/service-corrections/attention/route.ts"), calls=[];
 function route(actor,{dbAvailable=true,reply,throwAuth=false}={}) {
  const out={};
  vm.runInNewContext(ts.transpileModule(apiSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{
   exports:out,URL,AbortSignal,Request,Response,
   require(name) {
    if(name==="next/server")return{NextResponse:Response};
    assert.equal(name,"../../../../lib/supabase-server");
    return{
     getAuthenticatedUser:async()=>{if(throwAuth)throw Error("PRIVATE_AUTH_FAILURE");return{user:actor?{id:actor}:null};},
     createServerSupabaseClient:()=>dbAvailable?{rpc(name,params){calls.push({name,params});return{async abortSignal(signal){
      assert.ok(signal instanceof AbortSignal); if(reply)return reply();
      try{return{data:await summary(params.p_actor_id),error:null};}catch(error){return{data:null,error:{code:error.code,message:"PRIVATE_DATABASE_MESSAGE"}};}
     }};}}:null
    };
   }
  }); return out;
 }
 const get=query=>new Request("https://fixture.invalid/api/service-corrections/attention"+(query||""));
 const safeRow={submissionId:"aaaaaaaa-aaaa-4aaa-8aaa-000000000999",qrCode:"QRG-FIXTURE",pendingCount:1};
 const nodes=tree=>!tree||typeof tree!=="object"?[]:Array.isArray(tree)?tree.flatMap(nodes):[tree,...nodes(tree.props?.children)];
 const text=tree=>typeof tree==="string"||typeof tree==="number"?String(tree):Array.isArray(tree)?tree.map(text).join(" "):tree&&typeof tree==="object"?text(tree.props?.children):"";
 function render(state,{requests=0,overrides={}}={}) {
  let retries=0; const ui=(key,fallback)=>overrides[key]??fallback, env={useUiText:()=>ui,styles:{taskActions:"actions",taskPanel:"attention"},Link:"a",Wrench:"icon"};
  const component=compile(functions.get("DashboardServiceCorrectionAttention"),env,"DashboardServiceCorrectionAttention",true);
  const attention=expressions.filter(n=>n.getText(ast).startsWith("recordsLoaded && ownerReviewRequests > 0"));
  assert.equal(attention.length,1,"Actual Dashboard attention branch is required");
  const tree=compile("const tree="+attention[0].getText(ast)+";",{
   ...env,ui,DashboardServiceCorrectionAttention:props=>component(props),recordsLoaded:true,ownerReviewRequests:requests,
   focusServiceRequests(){},currentCorrectionAttention:state,setCorrectionAttentionAttempt:fn=>{retries=fn(retries);}
  },"tree",true);
  function expand(n) { if(!n||typeof n!=="object")return n;if(Array.isArray(n))return n.map(expand);if(typeof n.type==="function")return expand(n.type(n.props));return{...n,props:{...n.props,children:expand(n.props.children)}}; }
  return{tree:expand(tree),retries:()=>retries};
 }
 function loadFixture(outcome,token="token") {
  const called=[];
  const fn=compile(functions.get("loadOwnerServiceCorrectionAttention"),{fetch:async(url,init)=>{called.push({url,...init});return typeof outcome==="function"?outcome():Response.json(outcome);}},"loadOwnerServiceCorrectionAttention");
  return{called,load:signal=>fn(token,signal)};
 }
 function effectFixture(options={}) {
  const state={revision:1,phase:"ready",rows:[safeRow]},revision={current:1},calls=[],timers=new Map();let cleanup;
  const env={user:{email:"owner@example.test"},accountRevision:revision,AbortController,
   setCorrectionAttention:value=>Object.assign(state,value),
   window:{setTimeout:fn=>{timers.set(1,fn);return 1;},clearTimeout:key=>timers.delete(key)},
   getSupabaseAccessToken:options.token||(()=>Promise.resolve("token")),
   loadOwnerServiceCorrectionAttention:async(token,signal)=>{calls.push({token,signal});return options.load?options.load():[safeRow];}};
  const run=()=>{cleanup=compile("const effect="+effect[0]+";",env,"effect")();};
  run();return{state,revision,calls,run,dispose:()=>cleanup?.(),timeout:()=>{assert.equal(timers.size,1);timers.get(1)();},timers};
 }
 try {
  // The current .4 guard is intentionally not executed or modified in this proposal qualification.
  await installRepositorySchema(db,repo,"20261006231000");
  await db.exec("alter default privileges in schema public grant execute on functions to anon,authenticated,service_role");
  await db.exec(sql);
  await q("insert into auth.users(id,email) values($1,'owner@example.test'),($2,'provider@example.test'),($3,'buyer@example.test')",[owner,provider,buyer]);
  await q("insert into profiles(id,display_name,role) values($1,'Owner','owner'),($2,'Provider','shop'),($3,'Buyer','owner')",[owner,provider,buyer]);
  await db.exec("set role service_role");await q("select set_config('request.jwt.claim.role','service_role',false)");
  const f=await fixture();
  const catalog=await one("select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as source_hash, pg_get_function_arguments(p.oid) as arguments, pg_get_function_result(p.oid) as result, p.prosecdef as definer, p.provolatile as volatility, p.proconfig as settings, has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute, has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute, has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute from pg_proc p where p.oid=to_regprocedure('public.read_owner_service_correction_attention(uuid)')");
  await test("SQL actual definition and ACL remain service-role only under Supabase default grants",async()=>{assert.equal(catalog.arguments,"p_actor_id uuid");assert.equal(catalog.result,"jsonb");assert.equal(catalog.definer,true);assert.equal(catalog.volatility,"s");same(catalog.settings,["search_path=pg_catalog, public"]);assert.equal(catalog.anon_execute,false);assert.equal(catalog.authenticated_execute,false);assert.equal(catalog.service_execute,true);});

  await test("SQL current owner sees only pending IDs counts and QR code, never private reports",async()=>{
   const rows=await summary(owner);same(rows,[{submissionId:f.sid,qrCode:f.code,pendingCount:1}]);assert.doesNotMatch(JSON.stringify(rows),privatePattern);
  });
  await test("SQL provider and unrelated active business actor get no other-owner summary",async()=>{same(await summary(provider),[]);same(await summary(buyer),[]);});
  await test("SQL ownership change removes old-owner entry and exposes current-owner rejection route",async()=>{
   await db.exec("begin");try{await asOwner(()=>q("update guitars set owner_id=$1 where id=$2",[buyer,f.guitar]));same(await summary(owner),[]);same(await summary(buyer),[{submissionId:f.sid,qrCode:f.code,pendingCount:1}]);
    const s=(await one("select read_service_corrections($1,$2) value",[buyer,f.sid])).value;
    assert.equal(s.canReview,true);assert.equal(s.corrections[0].canAccept,false);assert.equal(s.corrections[0].canReject,true);
   }finally{await db.exec("rollback");}
  });
  await test("SQL original provider becoming owner cannot review their own correction",async()=>{
   await db.exec("begin");try{await asOwner(()=>q("update guitars set owner_id=$1 where id=$2",[provider,f.guitar]));same(await summary(provider),[]);}finally{await db.exec("rollback");}
  });
  for(const field of ["admin_archived_at","owner_removed_at","owner_id"])await test("SQL excludes "+field+" inactive Profile",async()=>{
   await db.exec("begin");try{await asOwner(()=>q("update guitars set "+field+"="+(field==="owner_id"?"null":"clock_timestamp()")+" where id=$1",[f.guitar]));same(await summary(owner),[]);}finally{await db.exec("rollback");}
  });
  await test("SQL accepts and rejects remove decided corrections without modifying original service",async()=>{
   await db.exec("begin");try{const before=(await one("select to_jsonb(s) value from service_submissions s where id=$1",[f.sid])).value;await decide(f,"accept");same(await summary(owner),[]);same((await one("select to_jsonb(s) value from service_submissions s where id=$1",[f.sid])).value,before);}finally{await db.exec("rollback");}
   await db.exec("begin");try{await decide(f,"reject");same(await summary(owner),[]);}finally{await db.exec("rollback");}
  });
  for(const status of ["locked","banned","removed"])await test("SQL "+status+" owner fails closed instead of confirming zero",async()=>{
   await db.exec("begin");try{await asOwner(()=>q("update profiles set account_status=$1 where id=$2",[status,owner]));await assert.rejects(summary(owner),e=>e.code==="42501");}finally{await db.exec("rollback");}
  });
  await test("SQL pending owner deletion returns PD423 not an empty confirmed queue",async()=>{
   await db.exec("begin");try{await q("select submit_account_deletion_request($1,$2,0)",[owner,id()]);await assert.rejects(summary(owner),e=>e.code==="PD423");}finally{await db.exec("rollback");}
  });
  await test("SQL null actor and API roles cannot invoke the service-role-only owner summary",async()=>{
   await assert.rejects(summary(null),e=>e.code==="42501");
   for(const role of ["anon","authenticated"]){await db.exec("reset role;set role "+role);await assert.rejects(summary(owner),e=>e.code==="42501");}
   await db.exec("reset role;set role service_role");
  });
  await test("SQL private public correction API still returns no pending private message",async()=>{same((await one("select read_public_service_corrections($1) value",[f.code])).value,[]);});
  await test("SQL frozen Profile graph returns unavailable rather than falsely zero",async()=>{
   await db.exec("begin");try{
    // Memory-only lifecycle fixture; no trigger is disabled or real fulfillment advanced.
    const requestId=id(),subject=id();
    await asOwner(async()=>{
     await q("insert into account_deletion_requests(id,actor_id) values($1,$2)",[requestId,provider]);
     await q("insert into account_deletion_fulfillments(request_id,actor_id,subject_token,actor_fingerprint,target_email,state,blockers,storage_quiesce_until) values($1,$2::uuid,$3::uuid,sha256(convert_to($2::uuid::text||':'||$3::uuid::text,'UTF8')),'provider@example.test','quiescing_storage','[{}]',clock_timestamp())",[requestId,provider,subject]);
     await q("insert into account_deletion_profile_review_scopes(request_id,guitar_id,relationship_codes) values($1,$2,array['service_participant'])",[requestId,f.guitar]);
    });await assert.rejects(summary(owner),e=>e.code==="PD423");
   }finally{await db.exec("rollback");}
  });
  await test("API anonymous denial happens before database creation or owner RPC",async()=>{const before=calls.length;assert.equal((await route(null).GET(get())).status,401);assert.equal(calls.length,before);});
  await test("API binds verified owner and returns actual SQL private-safe projection no-store",async()=>{
   const response=await route(owner).GET(get());assert.equal(response.status,200);assert.match(response.headers.get("cache-control"),/no-store/);
   same((await response.json()).items,[{submissionId:f.sid,qrCode:f.code,pendingCount:1}]);same(calls.at(-1),{name:"read_owner_service_correction_attention",params:{p_actor_id:owner}});
  });
  await test("API business provider receives empty current-owner result not another owner queue",async()=>{same((await (await route(provider).GET(get())).json()).items,[]);});
  await test("API query actor injection rejected before RPC",async()=>{const before=calls.length;assert.equal((await route(provider).GET(get("?actorId="+owner))).status,400);assert.equal(calls.length,before);});
  await test("API strips unexpected report and identity fields even from dependency payload",async()=>{
   const response=await route(owner,{reply:()=>({data:[{...safeRow,details:"PRIVATE_REPORT",provider_user_id:provider}],error:null})}).GET(get());assert.equal(response.status,200);
   same((await response.json()).items,[safeRow]);assert.doesNotMatch(JSON.stringify(safeRow),privatePattern);
  });
  for(const kind of ["database-unavailable","database-error","malformed","auth-throws"])await test("API "+kind+" is unavailable not false empty",async()=>{
   const options=kind==="database-unavailable"?{dbAvailable:false}:kind==="auth-throws"?{throwAuth:true}:{reply:()=>kind==="malformed"?{data:null,error:null}:{data:[],error:{code:"XX000",message:"PRIVATE_ERROR"}}};
   const response=await route(owner,options).GET(get());assert.equal(response.status,503);const body=await response.json();assert.equal(body.ok,false);assert.ok(!Object.hasOwn(body,"items"));assert.doesNotMatch(JSON.stringify(body),privatePattern);
  });
  await test("API actual pending deletion is 403 sanitized unavailable not zero",async()=>{
   await db.exec("begin");try{await q("select submit_account_deletion_request($1,$2,0)",[owner,id()]);const r=await route(owner).GET(get());assert.equal(r.status,403);assert.ok(!Object.hasOwn(await r.json(),"items"));}finally{await db.exec("rollback");}
  });

  await test("client exact authenticated no-store request preserves cancellation and strips private extras",async()=>{
   const h=loadFixture({ok:true,items:[{...safeRow,details:"PRIVATE_MESSAGE"}]}),c=new AbortController();
   same(await h.load(c.signal),[safeRow]);assert.equal(h.called[0].url,"/api/service-corrections/attention");assert.equal(h.called[0].headers.authorization,"Bearer token");assert.equal(h.called[0].cache,"no-store");assert.equal(h.called[0].signal,c.signal);
  });
  for(const items of [null,[{...safeRow,submissionId:"../foreign"}],[{...safeRow,pendingCount:0}],[{...safeRow,pendingCount:1.5}],[{...safeRow,qrCode:"PRIVATE_REPORT"}]])await test("client rejects malformed summary "+JSON.stringify(items),async()=>{await assert.rejects(loadFixture({ok:true,items}).load());});
  await test("client confirmed empty remains distinct from 503 or missing token",async()=>{
   same(await loadFixture({ok:true,items:[]}).load(),[]);
   await assert.rejects(loadFixture(()=>Response.json({ok:false},{status:503})).load());
   const missing=loadFixture({ok:true,items:[]},"");await assert.rejects(missing.load());assert.equal(missing.called.length,0);
  });
  await test("client actual effect loads independent ready queue without changing collection",async()=>{
   const h=effectFixture();try{assert.equal(h.state.phase,"loading");await tick();assert.equal(h.state.phase,"ready");same(h.state.rows,[safeRow]);assert.equal(h.timers.size,0);}finally{h.dispose();}
  });
  await test("client read error clears stale queue and retry can recover",async()=>{
   let fail=true;const h=effectFixture({load:()=>fail?Promise.reject(Error("offline")):[safeRow]});try{await tick();assert.equal(h.state.phase,"error");same(h.state.rows,[]);h.dispose();fail=false;h.run();await tick();assert.equal(h.state.phase,"ready");same(h.state.rows,[safeRow]);}finally{h.dispose();}
  });
  await test("client account change rejects old token before any summary request",async()=>{
   const token=deferred(),h=effectFixture({token:()=>token.promise});try{h.revision.current++;token.resolve("old-token");await tick();assert.equal(h.calls.length,0);}finally{h.dispose();}
  });
  await test("client account change rejects late successful old-owner response",async()=>{
   const result=deferred(),h=effectFixture({load:()=>result.promise});try{await tick();h.revision.current++;result.resolve([safeRow]);await tick();assert.equal(h.state.phase,"loading");same(h.state.rows,[]);}finally{h.dispose();}
  });
  await test("client deadline aborts even an abort-ignoring late success and exposes error",async()=>{
   const result=deferred(),h=effectFixture({load:()=>result.promise});try{await tick();h.timeout();assert.equal(h.calls[0].signal.aborted,true);assert.equal(h.state.phase,"error");result.resolve([safeRow]);await tick();assert.equal(h.state.phase,"error");same(h.state.rows,[]);}finally{h.dispose();}
  });
  await test("client dispose prevents late results and revision binding masks stale rendered queue",async()=>{
   const result=deferred(),h=effectFixture({load:()=>result.promise});await tick();h.dispose();result.resolve([safeRow]);await tick();same(h.state.rows,[]);
   const selected=compile("const value="+initializer("currentCorrectionAttention")+";",{correctionAttention:{revision:1,phase:"ready",rows:[safeRow]},renderedAccountRevision:2},"value");assert.equal(selected.phase,"loading");same(selected.rows,[]);
  });
  await test("render pending correction alone is discoverable direct review with no private message",async()=>{
   const h=render({phase:"ready",rows:[safeRow]});assert.match(text(h.tree),/Needs your attention/);assert.match(text(h.tree),/Review service correction/);
   const link=nodes(h.tree).find(n=>n.type==="a");assert.equal(link.props.href,"/service-corrections/"+safeRow.submissionId);assert.equal(link.props.className,"text-link");assert.doesNotMatch(text(h.tree),privatePattern);
  });
  await test("render correction links share existing attention heading with original requests",async()=>{
   const h=render({phase:"ready",rows:[safeRow]},{requests:2});assert.equal(nodes(h.tree).filter(n=>n.type==="h2").length,1);assert.match(text(h.tree),/Service requests/);assert.equal(nodes(h.tree).filter(n=>n.type==="a").length,1);
  });
  await test("render unavailable exposes accessible retry and never zero or private text",async()=>{
   const h=render({phase:"error",rows:[]});assert.equal(nodes(h.tree).filter(n=>n.props.role==="alert").length,1);const button=nodes(h.tree).find(n=>n.type==="button");assert.equal(text(button),"Try again");button.props.onClick();assert.equal(h.retries(),1);assert.doesNotMatch(text(h.tree),/0 awaiting|PRIVATE_/);
  });
  await test("render loading announces unresolved check; confirmed empty adds no attention panel",async()=>{
   const h=render({phase:"loading",rows:[]});assert.equal(nodes(h.tree).filter(n=>n.props.role==="status").length,1);assert.equal(render({phase:"ready",rows:[]}).tree,null);
  });
  await test("render presentation copy remains CMS-connected without treating QR IDs as authored copy",async()=>{
   const h=render({phase:"ready",rows:[safeRow]},{overrides:{"ui.components.ServiceCorrections.ownerEntry":"Edited correction link"}});assert.match(text(h.tree),/Edited correction link/);assert.match(text(h.tree),/QRG-FIXTURE/);
  });
  return {passed:results.filter(r=>r.ok).length,failed:results.filter(r=>!r.ok).length,results,catalog,
   limits:["actual repository schema/forward SQL/API/effect/render in memory only","single-connection fixture, no production/PostgREST/hydrated browser acceptance","no readiness change; current-owner read snapshot, existing correction page rechecks decisions"]};
 } finally { await db.close(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
 const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../../..");
 const read=relative=>fs.readFileSync(path.join(repo,relative),"utf8");
 const sql=read("supabase/migrations/20261006234000_owner_service_correction_attention.sql");
 const result=await qualifyOwnerServiceCorrectionAttention({repo,read,sql});
 console.log(JSON.stringify(result,null,2));if(result.failed)process.exitCode=1;
}
