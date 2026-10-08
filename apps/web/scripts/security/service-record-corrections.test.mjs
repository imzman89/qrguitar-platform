import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
export async function qualifyServiceCorrections({repo,sql,read,only}){
 const require=createRequire(path.join(repo,"apps/web/package.json")),ts=require("typescript"),{PGlite}=require("@electric-sql/pglite");
 const db=new PGlite(),results=[];let seq=100;const id=()=>"aaaaaaaa-aaaa-4aaa-8aaa-"+String(++seq).padStart(12,"0");
 const owner=id(),other=id();let provider=id();
 const cache=new Map();
 function module(relative,overrides={}){
  if(cache.has(relative)&&!Object.keys(overrides).length)return cache.get(relative);
  const out={};const source=read(relative);
  const native=name=>{if(Object.hasOwn(overrides,name))return overrides[name];
   if(name.startsWith(".")){const target=path.posix.normalize(path.posix.join(path.posix.dirname(relative),name));
    return module(target.endsWith(".mjs")?target:target+".ts");}return require(name);};
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX}}).outputText,
   {exports:out,require:native,console,Date,JSON,URL,Request,Response,Headers,AbortController,AbortSignal,TextEncoder,TextDecoder,setTimeout,clearTimeout,crypto:require("node:crypto").webcrypto});
  if(!Object.keys(overrides).length)cache.set(relative,out);return out;
 }
 const q=(s,p=[])=>db.query(s,p),one=async(s,p=[])=>(await q(s,p)).rows[0];
 const same=(a,b)=>assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)));
 async function test(name,run){if(only&&!name.includes(only))return;try{await run();results.push({name,ok:true});}catch(error){results.push({name,ok:false,code:error.code,message:error.message});}}
 async function approved(publicly=false){const guitar=id(),sid=id();
  await q("insert into guitars(id,owner_id,qr_code,permanent_path,name,brand) values($1,$2,$3,$4,'Fixture','Fixture')",[guitar,owner,"QRG-"+guitar.toUpperCase(),"/i/QRG-"+guitar]);
  await q("insert into service_submissions(id,guitar_id,provider_user_id,owner_user_id,title,work_performed,service_date,status) values($1,$2,$3,$4,'PRIVATE_ORIGINAL_TITLE','PRIVATE_ORIGINAL_DETAILS','2026-09-01','submitted')",[sid,guitar,provider,owner]);
  const version=await one("select updated_at::text version from service_submissions where id=$1",[sid]);
  await q("select * from confirm_service_submission($1,$2,null,$3,$4)",[sid,owner,publicly?"public":"private",version.version]);
  return{guitar,sid,code:"QRG-"+guitar.toUpperCase()};
 }
 const state=async(f,actor=provider)=>(await one("select read_service_corrections($1,$2) value",[actor,f.sid])).value;
 const mutate=async(actor,body)=>(await one("select mutate_service_correction($1,$2::jsonb) value",[actor,JSON.stringify(body)])).value;
 async function proposal(f,text="Corrected part description",requestId=id()){const s=await state(f);return{action:"propose",requestId,submissionId:f.sid,expectedRevision:s.revision,expectedEventUpdatedAt:s.eventUpdatedAt,details:text};}
 async function decision(f,c,action="accept",share=false,requestId=id()){const s=await state(f,owner);return{action,requestId,submissionId:f.sid,expectedRevision:s.revision,correctionId:c,sharePublicly:share};}
 const visible=async f=>(await one("select read_public_service_corrections($1) value",[f.code])).value;
 const original=async f=>(await one("select jsonb_build_object('submission',(select to_jsonb(s) from service_submissions s where id=$1),'event',(select to_jsonb(e) from guitar_timeline_events e join service_submissions s on s.resulting_service_event_id=e.id where s.id=$1),'evidence',(select coalesce(jsonb_agg(to_jsonb(e)),'[]') from service_submission_evidence e where submission_id=$1)) value",[f.sid])).value;
 const ledger=async()=>{await db.exec("reset role");try{return (await one("select jsonb_build_object('corrections',(select coalesce(jsonb_agg(to_jsonb(c) order by id),'[]') from service_record_corrections c),'decisions',(select coalesce(jsonb_agg(to_jsonb(d) order by id),'[]') from service_record_correction_decisions d)) value")).value;}finally{await db.exec("set role service_role");}};
 const rejects=(run,code)=>assert.rejects(run,e=>e.code===code);
 const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
 const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
 try{
  await module("apps/web/scripts/security/postgres-fixture.mjs").installRepositorySchema(db,repo,"20261006230000");await db.exec(sql);
  await q("insert into auth.users(id,email) values($1,'owner@example.test'),($2,'provider@example.test'),($3,'other@example.test')",[owner,provider,other]);
  await q("insert into profiles(id,display_name) values($1,'Owner'),($2,'Provider'),($3,'Other')",[owner,provider,other]);
  await db.exec("set role service_role");await q("select set_config('request.jwt.claim.role','service_role',false)");
  await test("default accepted correction preserves original approved record and stays private",async()=>{const f=await approved(),before=await original(f),body=await proposal(f),c=await mutate(provider,body);
   await mutate(owner,await decision(f,c.id));same(await original(f),before);same(await visible(f),[]);
   const saved=await state(f,owner);assert.equal(saved.corrections[0].outcome,"accepted");assert.equal(saved.corrections[0].isPublic,false);});
  await test("explicit sharing reveals correction text without private original title details or evidence",async()=>{const f=await approved(),c=await mutate(provider,await proposal(f,"Owner-approved correction"));await mutate(owner,await decision(f,c.id,"accept",true));
   const rows=await visible(f);assert.equal(rows.length,1);assert.equal(rows[0].details,"Owner-approved correction");assert.equal(rows[0].originalServiceDate,"2026-09-01");
   assert.equal(rows[0].originalTitle,"Approved service record");assert.doesNotMatch(JSON.stringify(rows),/PRIVATE_ORIGINAL|private_notes|storage_path|provider_user_id|owner_user_id/);});
  await test("rejected and pending notes never appear publicly",async()=>{const f=await approved(true),c=await mutate(provider,await proposal(f));same(await visible(f),[]);await mutate(owner,await decision(f,c.id,"reject"));same(await visible(f),[]);});
  await test("provider cannot review or choose sharing; owner cannot submit provider correction",async()=>{const f=await approved(),body=await proposal(f);await rejects(mutate(owner,body),"42501");await rejects(mutate(provider,{...body,sharePublicly:true}),"22023");
   const c=await mutate(provider,body);await rejects(mutate(provider,await decision(f,c.id)),"42501");});
  await test("foreign and inactive actors cannot read or mutate a private correction",async()=>{const f=await approved(),body=await proposal(f);await rejects(state(f,other),"P0002");await rejects(mutate(other,body),"42501");
   await db.exec("reset role");await q("update profiles set account_status='locked' where id=$1",[provider]);await db.exec("set role service_role");await rejects(mutate(provider,body),"42501");await rejects(state(f),"42501");await db.exec("reset role");await q("update profiles set account_status='active' where id=$1",[provider]);await db.exec("set role service_role");});
  await test("proposal request replay is byte-equivalent and conflicting identity is rejected",async()=>{const f=await approved(),body=await proposal(f),first=await mutate(provider,body),before=await ledger();const again=await mutate(provider,body);assert.equal(again.id,first.id);assert.equal(again.replayed,true);same(await ledger(),before);await rejects(mutate(provider,{...body,details:"Different text"}),"PT409");same(await ledger(),before);});
  await test("decision replay cannot change private choice or append another receipt",async()=>{const f=await approved(),c=await mutate(provider,await proposal(f)),body=await decision(f,c.id);await mutate(owner,body);const before=await ledger();assert.equal((await mutate(owner,body)).replayed,true);same(await ledger(),before);await rejects(mutate(owner,{...body,sharePublicly:true}),"PT409");same(await ledger(),before);});
  await test("colliding pending submission and stale revision reject atomically",async()=>{const f=await approved(),a=await proposal(f),b=await proposal(f);await mutate(provider,a);const before=await ledger();await rejects(mutate(provider,b),"PT409");same(await ledger(),before);b.expectedRevision=1;await rejects(mutate(provider,b),"PT409");same(await ledger(),before);});
  await test("cross-table request identity cannot be reused",async()=>{const f=await approved(),c=await mutate(provider,await proposal(f));await rejects(mutate(owner,await decision(f,c.id,"accept",false,c.id)),"PT409");});
  await test("changed original revision rejects a provider proposal",async()=>{const f=await approved(),body=await proposal(f);await db.exec("reset role");await q("update guitar_timeline_events set updated_at=clock_timestamp() where id=(select resulting_service_event_id from service_submissions where id=$1)",[f.sid]);await db.exec("set role service_role");const before=await ledger();await rejects(mutate(provider,body),"PT409");same(await ledger(),before);});
  await test("changed original details reject acceptance but allow explicit rejection and fresh proposal",async()=>{const f=await approved(),c=await mutate(provider,await proposal(f));await db.exec("reset role");await q("update guitar_timeline_events set description='Later server change' where id=(select resulting_service_event_id from service_submissions where id=$1)",[f.sid]);await db.exec("set role service_role");await rejects(mutate(owner,await decision(f,c.id)),"PT409");await mutate(owner,await decision(f,c.id,"reject"));await mutate(provider,await proposal(f,"Fresh correction after reload"));});
  await test("ownership change denies old owner and blocks new-owner acceptance of old review",async()=>{const f=await approved(),c=await mutate(provider,await proposal(f)),d=await decision(f,c.id);await db.exec("reset role");await q("update guitars set owner_id=$1 where id=$2",[other,f.guitar]);await db.exec("set role service_role");await rejects(mutate(owner,d),"42501");await rejects(mutate(other,d),"PT409");await mutate(other,{...d,action:"reject"});const next=await proposal(f);await mutate(provider,next);assert.equal((await state(f,other)).corrections[0].canAccept,true);});
  await test("double decision and foreign correction ID reject without ledger drift",async()=>{const f=await approved(),c=await mutate(provider,await proposal(f));await mutate(owner,await decision(f,c.id,"reject"));const before=await ledger();await rejects(mutate(owner,await decision(f,c.id)),"PT409");same(await ledger(),before);const otherF=await approved();await rejects(mutate(owner,await decision(otherF,c.id)),"P0002");});
  await test("later correction appends independent dated record and leaves previous decision unchanged",async()=>{const f=await approved(),a=await mutate(provider,await proposal(f,"First correction"));await mutate(owner,await decision(f,a.id,"accept",true));const before=(await state(f,owner)).corrections[0];const b=await mutate(provider,await proposal(f,"Later correction"));await mutate(owner,await decision(f,b.id));same((await state(f,owner)).corrections.find(c=>c.id===a.id),before);assert.equal((await state(f)).revision,4);assert.equal((await visible(f)).length,1);});
  await test("correction/upload timestamps cannot advance actual-source last service date",async()=>{const f=await approved(),before=await original(f),c=await mutate(provider,await proposal(f));await mutate(owner,await decision(f,c.id,"accept",true));
   const events=(await q("select event_date::text date,date_precision as recorded_precision,category,event_type,source_kind,is_system,created_at from guitar_timeline_events where guitar_id=$1",[f.guitar])).rows;
   const contract=module("apps/web/lib/instrument-profile-contract.ts"),mapped=events.map(e=>({serviceDate:e.date||"",datePrecision:e.recorded_precision,category:e.category,eventType:e.event_type,sourceKind:e.source_kind,isSystem:e.is_system}));
   same(contract.getLatestRecordedServiceDate(mapped),{date:"2026-09-01",datePrecision:"day"});same(await original(f),before);});
  await test("original authenticated provenance trigger still blocks direct approved event editing",async()=>{const f=await approved();await db.exec("reset role");await q("select set_config('request.jwt.claim.role','authenticated',false)");await rejects(q("update guitar_timeline_events set description='Overwrite' where id=(select resulting_service_event_id from service_submissions where id=$1)",[f.sid]),"P0001");await q("select set_config('request.jwt.claim.role','service_role',false)");await db.exec("set role service_role");});
  await test("correction text and decision rows are immutable even for database owner",async()=>{const f=await approved(),c=await mutate(provider,await proposal(f)),d=await mutate(owner,await decision(f,c.id));await db.exec("reset role");await rejects(q("update service_record_corrections set details='Overwrite' where id=$1",[c.id]),"42501");await rejects(q("delete from service_record_corrections where id=$1",[c.id]),"42501");await rejects(q("update service_record_correction_decisions set is_public=true where id=$1",[d.id]),"42501");await rejects(q("delete from service_record_correction_decisions where id=$1",[d.id]),"42501");await db.exec("set role service_role");});
  await test("anonymous/authenticated roles cannot bypass server functions or tables",async()=>{for(const role of ["anon","authenticated"]){await db.exec("reset role;set role "+role);await rejects(q("select * from service_record_corrections"),"42501");await rejects(q("select read_public_service_corrections('QRG-NONE')"),"42501");await rejects(q("select mutate_service_correction(null,'{}')"),"42501");}await db.exec("reset role;set role service_role");});
  await test("private/hidden/archived Profile suppresses explicitly shared corrections",async()=>{const f=await approved(),c=await mutate(provider,await proposal(f));await mutate(owner,await decision(f,c.id,"accept",true));assert.equal((await visible(f)).length,1);await db.exec("reset role");await q("update guitars set visibility='private' where id=$1",[f.guitar]);await db.exec("set role service_role");same(await visible(f),[]);await db.exec("reset role");await q("update guitars set visibility='public',admin_archived_at=clock_timestamp() where id=$1",[f.guitar]);await db.exec("set role service_role");same(await visible(f),[]);});
  await test("forced transaction rollback leaves neither proposal nor decision",async()=>{const f=await approved(),body=await proposal(f),before=await ledger();await db.exec("begin");await mutate(provider,body);await db.exec("rollback");same(await ledger(),before);});
  await test("malformed dates unexpected fields blank text and implicit sharing are rejected",async()=>{const f=await approved(),body=await proposal(f);for(const [extra,code] of [[{details:"   "},"22023"],[{serviceDate:"2026-10-06"},"22023"],[{expectedEventUpdatedAt:"invalid"},"22007"]])await rejects(mutate(provider,{...body,...extra}),code);const c=await mutate(provider,body),d=await decision(f,c.id);delete d.sharePublicly;await rejects(mutate(owner,d),"22023");});

  await test("ownerless approved record cannot start an unreviewable correction",async()=>{const f=await approved(),body=await proposal(f);await db.exec("reset role");await q("update guitars set owner_id=null where id=$1",[f.guitar]);await db.exec("set role service_role");await rejects(state(f),"P0002");await rejects(mutate(provider,body),"P0002");});
  provider=id();await db.exec("reset role");await q("insert into auth.users(id,email) values($1,'new-provider@example.test')",[provider]);await q("insert into profiles(id,display_name) values($1,'New provider')",[provider]);await db.exec("set role service_role");
  const calls=[];
  function route(actor){return module("apps/web/app/api/service-corrections/route.ts",{
   "next/server":{NextResponse:{json:(body,options)=>new Response(JSON.stringify(body),options)}},
   "../../../lib/supabase-server":{getAuthenticatedUser:async()=>({user:actor?{id:actor}:null}),createServerSupabaseClient:()=>({rpc(name,params){calls.push({name,params});return{async abortSignal(){await db.exec("savepoint api_request");try{const args=name==="read_public_service_corrections"?[params.p_qr_code]:name==="read_service_corrections"?[params.p_actor_id,params.p_submission_id]:[params.p_actor_id,JSON.stringify(params.p_request)];const placeholders=args.map((_,i)=>"$"+(i+1)+(name==="mutate_service_correction"&&i===1?"::jsonb":"")).join(",");const value=(await one("select "+name+"("+placeholders+") value",args)).value;await db.exec("release savepoint api_request");return{data:value,error:null};}catch(error){await db.exec("rollback to savepoint api_request;release savepoint api_request");return{data:null,error:{code:error.code}};}}};}})},
   "../../../lib/admin-auth":{assertAccountCanWrite:async(_db,user)=>({ok:(await one("select account_status from profiles where id=$1",[user.id]))?.account_status==="active",status:403,message:"Account blocked."})}
  });}
  const get=id=>new Request("https://fixture.invalid/api/service-corrections?submissionId="+id),post=body=>new Request("https://fixture.invalid/api/service-corrections",{method:"POST",body:typeof body==="string"?body:JSON.stringify(body)});
  await test("actual API denies anonymous private reads and writes before RPC",async()=>{const before=calls.length,r=route(null);assert.equal((await r.GET(get(id()))).status,401);assert.equal((await r.POST(post({}))).status,401);assert.equal(calls.length,before);});
  await test("actual API authenticates actor server-side and rejects actor spoofing",async()=>{const f=await approved(),body=await proposal(f),r=route(provider);await db.exec("begin");try{assert.equal((await r.GET(get(f.sid))).status,200);assert.equal(calls.at(-1).params.p_actor_id,provider);const response=await r.POST(post({...body,actorId:owner}));assert.equal(response.status,400);assert.equal(calls.at(-1).params.p_actor_id,provider);}finally{await db.exec("rollback");}});
  await test("actual API commits private default with original SQL and reports source conflict as 409",async()=>{const f=await approved(),body=await proposal(f),r=route(provider);await db.exec("begin");try{const response=await r.POST(post(body));assert.equal(response.status,200);assert.equal((await response.json()).receipt.committed,true);}finally{await db.exec("rollback");}await db.exec("reset role");await q("update guitar_timeline_events set updated_at=clock_timestamp() where id=(select resulting_service_event_id from service_submissions where id=$1)",[f.sid]);await db.exec("set role service_role;begin");try{assert.equal((await r.POST(post(body))).status,409);}finally{await db.exec("rollback");}});
  await test("actual API bounds body and rejects malformed JSON or identity before SQL",async()=>{const r=route(provider),before=calls.length;assert.equal((await r.POST(post("bad JSON"))).status,400);assert.equal((await r.POST(post(" ".repeat(24577)))).status,413);assert.equal((await r.POST(post({requestId:"bad",submissionId:id(),expectedRevision:0}))).status,400);assert.equal((await r.GET(new Request("https://fixture.invalid/api/service-corrections?submissionId="+id()+"&actorId="+owner))).status,400);assert.equal(calls.length,before);});
  await test("actual public API does not invoke authentication or expose unshared corrections",async()=>{const f=await approved(),r=route(null);await db.exec("begin");try{const response=await r.GET(new Request("https://fixture.invalid/api/service-corrections?qrCode="+f.code.toUpperCase()));assert.equal(response.status,200);same((await response.json()).corrections,[]);assert.equal(calls.at(-1).name,"read_public_service_corrections");}finally{await db.exec("rollback");}});
  function clientFixture(options={}){
   let session={access_token:"fixture-token",user:{id:provider}},callback;const sent=[],tokens=[];
   const record={submissionId:id(),revision:0,eventUpdatedAt:"2026-09-01T00:00:00Z",canPropose:true,canReview:false,original:{id:id(),title:"Original",details:"Original details",serviceDate:"2026-09-01"},corrections:[]};
   const auth={getSession:()=>options.getSession?options.getSession(session):Promise.resolve({data:{session}}),onAuthStateChange(fn){callback=fn;return{data:{subscription:{unsubscribe(){}}}};}};
   let nextId=0;
   const client=module("apps/web/lib/service-corrections-client.ts").createServiceCorrectionClient(record.submissionId,{auth,requestId:()=>"fixture-request-"+(++nextId),fetch:async(url,init)=>{tokens.push(init.headers.authorization);if(init.method==="POST"){sent.push(JSON.parse(init.body));return options.write?options.write(sent.at(-1)):new Response(JSON.stringify({ok:true,receipt:{committed:true}}),{status:200});}return new Response(JSON.stringify({ok:true,state:record}),{status:200});}});
   return{client,sent,tokens,record,auth,change(user=other,event="SIGNED_IN"){session=user?{access_token:"replacement-token",user:{id:user}}:null;callback(event,session);},lease(){const s=client.getState();return{actorId:s.actorId,sessionRevision:s.sessionRevision};}};
  }
  await test("actual client starts private selection and sends exact reviewed revision",async()=>{const f=clientFixture();try{await f.client.start();await tick();await f.client.act("propose",{details:"Correction"},f.lease());assert.equal(f.sent.length,1);assert.equal(f.sent[0].expectedRevision,0);assert.equal(f.sent[0].expectedEventUpdatedAt,f.record.eventUpdatedAt);assert.equal(f.sent[0].details,"Correction");assert.ok(!Object.hasOwn(f.sent[0],"sharePublicly"));}finally{f.client.dispose();}});
  await test("actual client retries identical uncertain request and blocks a replacement action",async()=>{let n=0;const f=clientFixture({write:async()=>++n===1?new Response(JSON.stringify({ok:false,uncertain:true}),{status:503}):new Response(JSON.stringify({ok:true,receipt:{committed:true}}),{status:200})});try{await f.client.start();await tick();const lease=f.lease();await f.client.act("propose",{details:"Original correction"},lease);assert.equal(f.client.getState().uncertain,true);await f.client.act("propose",{details:"Different correction"},lease);assert.equal(f.sent.length,1);await f.client.retry(lease);assert.equal(f.sent.length,2);same(f.sent[1],f.sent[0]);assert.equal(f.client.getState().uncertain,false);}finally{f.client.dispose();}});
  await test("actual client double click sends one request and only explicit sharing is public",async()=>{const write=deferred(),f=clientFixture({write:()=>write.promise});f.record.canPropose=false;f.record.canReview=true;f.record.corrections=[{id:id(),outcome:"pending",canAccept:true,canReject:true}];try{await f.client.start();await tick();const lease=f.lease(),c=f.record.corrections[0].id,p=f.client.act("accept",{correctionId:c},lease);void f.client.act("accept",{correctionId:c,sharePublicly:true},lease);await tick();assert.equal(f.sent.length,1);assert.equal(f.sent[0].sharePublicly,false);write.resolve(new Response(JSON.stringify({ok:true,receipt:{committed:true}}),{status:200}));await p;}finally{f.client.dispose();}});
  await test("actual client stale rendered callback cannot submit or retry in replacement session",async()=>{const f=clientFixture();try{await f.client.start();await tick();const lease=f.lease();f.change();await tick();await f.client.act("propose",{details:"Old actor text"},lease);await f.client.retry(lease);assert.equal(f.sent.length,0);assert.notEqual(f.client.getState().actorId,lease.actorId);}finally{f.client.dispose();}});
  await test("actual client discards token resolved after account change",async()=>{let gate=null;const f=clientFixture({getSession:session=>gate?gate.promise:Promise.resolve({data:{session}})});try{await f.client.start();await tick();const lease=f.lease();gate=deferred();const save=f.client.act("propose",{details:"Old correction"},lease);f.change();gate.resolve({data:{session:{access_token:"old-token",user:{id:provider}}}});await save;await tick();assert.equal(f.sent.length,0);assert.equal(f.client.getState().uncertain,false);}finally{f.client.dispose();}});
  await test("actual client ignores late mutation success and does not loop reads on token refresh",async()=>{const write=deferred(),f=clientFixture({write:()=>write.promise});try{await f.client.start();await tick();const lease=f.lease(),p=f.client.act("propose",{details:"Old correction"},lease);await tick();f.change();await tick();const count=f.tokens.length;write.resolve(new Response(JSON.stringify({ok:true,receipt:{committed:true}}),{status:200}));await p;await tick();assert.equal(f.tokens.length,count);f.change(other,"TOKEN_REFRESHED");await tick();assert.equal(f.tokens.length,count);}finally{f.client.dispose();}});
  await test("actual client definitive conflict requires reload before another write",async()=>{const f=clientFixture({write:async()=>new Response(JSON.stringify({ok:false,uncertain:false,message:"Conflict"}),{status:409})});try{await f.client.start();await tick();const lease=f.lease();await f.client.act("propose",{details:"Correction"},lease);assert.equal(f.client.getState().phase,"error");assert.equal(f.client.getState().record,null);await f.client.act("propose",{details:"Another correction"},lease);assert.equal(f.sent.length,1);}finally{f.client.dispose();}});
  await test("integration preserves read-only approved work evidence and owner review guards",async()=>{const api=read("apps/web/app/api/service-submissions/route.ts"),evidence=read("apps/web/app/api/service-evidence/route.ts");assert.match(api,/save_draft[\s\S]*?\["draft", "changes_requested"\]\.includes\(submission.status\)/);assert.match(evidence,/submission.status === "draft" \|\| submission.status === "changes_requested"/);
   for(const relative of ["apps/web/app/service-work/[code]/page.tsx","apps/web/app/service-review/[id]/page.tsx"]){const source=read(relative);assert.match(source,/submission\?\.status === "approved" && <ServiceCorrections/);}assert.match(read("apps/web/app/i/[code]/ProfileClient.tsx"),/!publicReviewSnapshot && <PublicServiceCorrections qrCode=\{instrument.qrCode\}/);});

  const elementNodes=tree=>!tree||typeof tree!=="object"?[]:Array.isArray(tree)?tree.flatMap(elementNodes):[tree,...elementNodes(tree.props?.children)];
  const elementText=tree=>typeof tree==="string"?tree:Array.isArray(tree)?tree.map(elementText).join(""):tree&&typeof tree==="object"?elementText(tree.props?.children):"";
  function renderCorrectionUi(state,live=state){const acts=[],values=[state,"",{}];let cursor=0;const react={useRef:()=>({current:{getState:()=>live,act:(...args)=>acts.push(args)}}),useState:()=>[values[cursor++],()=>{}],useEffect:()=>{}};
   const jsx=(type,props)=>({type,props}),out=module("apps/web/components/ServiceCorrections.tsx",{
    react,"react/jsx-runtime":{jsx,jsxs:jsx,Fragment:"fragment"},"./UiTextProvider":{useUiText:()=>((_key,fallback)=>fallback)},
    "../lib/supabase-browser":{createBrowserSupabaseClient:()=>{throw Error("No UI auth effect in render-only qualification");}},
    "../lib/service-corrections-client":{createServiceCorrectionClient:()=>{throw Error("Controller is qualified separately");}}});
   return{tree:out.ServiceCorrections({submissionId:state.record.submissionId}),acts};
  }
  await test("actual UI owner sharing defaults unchecked and handler carries rendered session lease",async()=>{const c={id:id(),details:"Correction",outcome:"pending",canAccept:true,canReject:true,submittedAt:"2026-10-06T00:00:00Z"};const state={actorId:owner,sessionRevision:7,phase:"ready",busy:false,uncertain:false,record:{submissionId:id(),canReview:true,canPropose:false,original:{title:"Original",details:"Saved details",serviceDate:"2026-09-01"},corrections:[c]}};
   const rendered=renderCorrectionUi(state),nodes=elementNodes(rendered.tree),box=nodes.find(n=>n.type==="input"&&n.props.type==="checkbox");assert.equal(box.props.checked,false);
   nodes.find(n=>n.type==="button"&&elementText(n)==="Accept correction").props.onClick();assert.equal(rendered.acts[0][1].sharePublicly,false);same(rendered.acts[0][2],{actorId:owner,sessionRevision:7});assert.match(elementText(rendered.tree),/2026-09-01/);});
  await test("actual UI hides prior-account original text before a replacement session render",async()=>{const state={actorId:owner,sessionRevision:1,phase:"ready",record:{submissionId:id(),original:{title:"PRIVATE_OLD_ACCOUNT",details:"PRIVATE_OLD_DETAILS"},corrections:[]}};assert.equal(renderCorrectionUi(state,{...state,actorId:other,sessionRevision:2}).tree,null);});
  await test("actual UI stale correction cannot be accepted but offers explicit rejection",async()=>{const state={actorId:owner,sessionRevision:1,phase:"ready",busy:false,uncertain:false,record:{submissionId:id(),canReview:true,original:{title:"Original",details:"Original"},corrections:[{id:id(),details:"Stale",outcome:"pending",canAccept:false,canReject:true}]}};const nodes=elementNodes(renderCorrectionUi(state).tree);assert.equal(nodes.find(n=>n.type==="button"&&elementText(n)==="Accept correction").props.disabled,true);assert.equal(nodes.find(n=>n.type==="button"&&elementText(n)==="Reject correction").props.disabled,false);});

  // Added lifecycle/privacy cases. The preceding 38 assertions are unchanged.
  const ownerQuery=async(s,p=[])=>{await db.exec("reset role");try{return await one(s,p);}finally{await db.exec("set role service_role");}};
  async function privacyFixture(publicly=false,text="Factual correction"){
   const target=id(),customer=id(),buyer=id(),admin=id(),guitar=id(),sid=id();
   const email="privacy-"+target+"@example.test";
   await db.exec("reset role");
   try{
    for(const [actor,mail,role] of [[target,email,"shop"],[customer,"customer-"+customer+"@example.test","owner"],[buyer,"buyer-"+buyer+"@example.test","owner"],[admin,"admin-"+admin+"@example.test","admin"]]){
     await q("insert into auth.users(id,email) values($1,$2)",[actor,mail]);
     await q("insert into profiles(id,display_name,role) values($1,$3,$2)",[actor,role,"Actor "+actor]);
    }
    await q("insert into guitars(id,owner_id,qr_code,permanent_path,name,brand) values($1,$2,$3,$4,'Fixture','Fixture')",[guitar,customer,"QRG-"+guitar.toUpperCase(),"/i/QRG-"+guitar]);
    await q("insert into service_submissions(id,guitar_id,provider_user_id,owner_user_id,title,work_performed,service_date,status) values($1,$2,$3,$4,'Original factual title','Original factual work','2026-09-01','submitted')",[sid,guitar,target,customer]);
    const v=await one("select updated_at::text v from service_submissions where id=$1",[sid]);
    await q("select * from confirm_service_submission($1,$2,null,$3,$4)",[sid,customer,publicly?"public":"private",v.v]);
   }finally{await db.exec("set role service_role");}
   const f={guitar,sid,target,customer,buyer,admin,email,code:"QRG-"+guitar.toUpperCase()};
   const s=await state(f,target);
   f.propose={action:"propose",requestId:id(),submissionId:sid,expectedRevision:s.revision,expectedEventUpdatedAt:s.eventUpdatedAt,details:text};
   return f;
  }
  async function freshDecision(f,c,action="accept",share=false){const s=await state(f,f.customer);return{action,requestId:id(),submissionId:f.sid,expectedRevision:s.revision,correctionId:c,sharePublicly:share};}
  async function beginPrivacy(f,actor=f.target){
   const submitted=(await one("select submit_account_deletion_request($1,$2,0) value",[actor,id()])).value;
   const requestId=submitted.request.requestId;
   const prepared=(await one("select prepare_account_deletion_fulfillment($1,false,$2,$3,'{}') value",[f.admin,requestId,id()])).value;
   assert.equal(prepared.fulfillment.state,"blocked");return{requestId,prepared};
  }
  const fingerprint=async(f,p)=>(await ownerQuery("select encode(_account_deletion_profile_fingerprint($1,$2),'hex') value",[p.requestId,f.guitar])).value;
  const rpcJson=async(name,args)=>(await one("select "+name+"("+args.map((_,i)=>"$"+(i+1)).join(",")+") value",args)).value;
  function deletionService(f){
   const source=module("apps/web/lib/account-deletion/fulfillment-service.ts");
   const client={rpc(name,params){return{async then(resolve,reject){try{const entries=Object.entries(params);const result=await one("select "+name+"("+entries.map(([k],i)=>k+"=>$"+(i+1)).join(",")+") value",entries.map(([,v])=>v));return resolve({data:result.value,error:null});}catch(error){return resolve({data:null,error:{code:error.code}});}}};},
    auth:{admin:{deleteUser(){throw Error("Auth provider must not be called in review qualification");}}},storage:{from(){throw Error("Storage must not be called in review qualification");}}};
   return source.createFulfillmentService({randomId:id,requireAdmin:async()=>({ok:true,supabase:client,admin:{user:{id:f.admin},accessSource:"role",accountStatus:"active"}})});
  }
  const deletionRequest=new Request("https://fixture.invalid/api/admin/account-deletion");
  async function inspectAndAttest(f,p){
   const service=deletionService(f),current=await service.read(deletionRequest,p.requestId);
   for(const review of current.profileReviews){
    let pages=1;for(let page=0;page<pages;page++){
     const out=await service.execute(deletionRequest,p.requestId,{action:"inspect_profile",operationId:id(),guitarId:review.guitarId,expectedFingerprint:review.contentFingerprint,pageIndex:page});
     pages=out.reviewSnapshot.pageCount;
     if(review.guitarId===f.guitar&&page===0){assert.ok(out.reviewSnapshot.profile.sections.some(s=>s.code==="serviceCorrections"));assert.ok(out.reviewSnapshot.profile.sections.some(s=>s.code==="serviceCorrectionDecisions"));}
    }
    await service.execute(deletionRequest,p.requestId,{action:"attest_profile",operationId:id(),guitarId:review.guitarId,expectedFingerprint:review.contentFingerprint});
   }
   for(const review of current.retentionReviews.filter(r=>r.required)){
    let pages=1;for(let page=0;page<pages;page++){
     const out=await service.execute(deletionRequest,p.requestId,{action:"inspect_retention",operationId:id(),domain:review.domain,expectedFingerprint:review.contentFingerprint,pageIndex:page});pages=out.reviewSnapshot.pageCount;
     if(review.domain==="service"&&page===0){assert.ok(out.reviewSnapshot.retention.sections.some(s=>s.code==="corrections"));assert.ok(out.reviewSnapshot.retention.sections.some(s=>s.code==="correctionDecisions"));}
    }
    await service.execute(deletionRequest,p.requestId,{action:"attest_retention",operationId:id(),domain:review.domain,expectedFingerprint:review.contentFingerprint,decisionCode:review.domain==="service"?"service_history_privacy_reviewed":"lawful_financial_retention_reviewed"});
   }
   return service;
  }
  async function advanceFixtureClock(requestId){
   // Disposable fixture only: use the existing transaction-scoped protocol capability; no trigger is disabled.
   await db.exec("reset role;begin");try{
    await q("select set_config('qrguitar.account_deletion_request',$1,true)",[requestId]);
    const updated=await q("update account_deletion_fulfillments set storage_quiesce_until=clock_timestamp()-interval '1 second' where request_id=$1 and state='quiescing_storage' returning request_id",[requestId]);assert.equal(updated.rows.length,1);
    await db.exec("commit");
   }catch(error){await db.exec("rollback");throw error;}finally{await db.exec("set role service_role");}
  }
  await test("hash-only ledger retains no full original private event snapshot",async()=>{
   const f=await privacyFixture(),c=await mutate(f.target,f.propose);
   const row=await ownerQuery("select to_jsonb(c) row,encode(sha256(convert_to(to_jsonb(e)::text,'UTF8')),'hex') expected from service_record_corrections c join guitar_timeline_events e on e.id=c.original_event_id where c.id=$1",[c.id]);
   assert.ok(!Object.hasOwn(row.row,"original_event"));assert.match(row.row.original_event_hash,/^[a-f0-9]{64}$/);assert.equal(row.row.original_event_hash,row.expected);assert.ok(!Object.hasOwn(row.row,"private_notes"));
  });
  await test("public correction uses current live title and masks a now-private original",async()=>{
   const f=await privacyFixture(true),c=await mutate(f.target,f.propose);await mutate(f.customer,await freshDecision(f,c.id,"accept",true));
   await ownerQuery("update guitar_timeline_events set title='Redacted current title' where service_submission_id=$1 returning id",[f.sid]);
   assert.equal((await visible(f))[0].originalTitle,"Redacted current title");
   await ownerQuery("update guitar_timeline_events set is_public=false where service_submission_id=$1 returning id",[f.sid]);
   assert.equal((await visible(f))[0].originalTitle,"Approved service record");assert.equal((await visible(f))[0].details,"Factual correction");
  });
  await test("missing original event suppresses previously shared correction",async()=>{
   const f=await privacyFixture(true),c=await mutate(f.target,f.propose);await mutate(f.customer,await freshDecision(f,c.id,"accept",true));
   await ownerQuery("delete from guitar_timeline_events where service_submission_id=$1 returning id",[f.sid]);same(await visible(f),[]);
  });
  await test("buyer API can reject inherited pending note and review a reissue without old evidence access",async()=>{
   const f=await privacyFixture(),c=await mutate(f.target,f.propose),body=await freshDecision(f,c.id);
   await ownerQuery("update guitars set owner_id=$1 where id=$2 returning id",[f.buyer,f.guitar]);
   await db.exec("begin");try{const response=await route(f.buyer).GET(get(f.sid));assert.equal(response.status,200);const loaded=(await response.json()).state;assert.equal(loaded.canReview,true);assert.equal(loaded.corrections[0].canAccept,false);assert.equal(loaded.corrections[0].canReject,true);}finally{await db.exec("rollback");}
   await rejects(mutate(f.customer,body),"42501");await rejects(mutate(f.buyer,body),"PT409");
   await mutate(f.buyer,{...body,action:"reject"});const loaded=await state(f,f.target);
   const reissue={...f.propose,requestId:id(),expectedRevision:loaded.revision,expectedEventUpdatedAt:loaded.eventUpdatedAt,details:"Reissued for buyer"};
   const next=await mutate(f.target,reissue);await mutate(f.buyer,{...body,requestId:id(),correctionId:next.id,expectedRevision:(await state(f,f.buyer)).revision});
   assert.equal((await state(f,f.buyer)).corrections[0].outcome,"accepted");
   assert.match(read("apps/web/app/api/service-evidence/route.ts"),/auth.user.id === submission.provider_user_id || auth.user.id === submission.owner_user_id/);
  });
  await test("pending actor deletion fences proposals atomically and actual API returns definitive403",async()=>{
   const f=await privacyFixture();await rpcJson("submit_account_deletion_request",[f.target,id(),0]);const before=await ledger();await rejects(mutate(f.target,f.propose),"PD423");same(await ledger(),before);
   await db.exec("begin");try{const response=await route(f.target).POST(post(f.propose));assert.equal(response.status,403);assert.equal((await response.json()).uncertain,false);}finally{await db.exec("rollback");}
  });
  await test("pending current-owner deletion fences decisions and proposal association",async()=>{
   const f=await privacyFixture(),c=await mutate(f.target,f.propose),body=await freshDecision(f,c.id);await rpcJson("submit_account_deletion_request",[f.customer,id(),0]);const before=await ledger();await rejects(mutate(f.customer,body),"PD423");same(await ledger(),before);
   const second={...f.propose,requestId:id(),expectedRevision:1};await rejects(mutate(f.target,second),"PT409");
  });
  await test("correction content is included in exact profile and service retention fingerprints",async()=>{
   const f=await privacyFixture(),c=await mutate(f.target,f.propose);await mutate(f.customer,await freshDecision(f,c.id));const p=await beginPrivacy(f);
   const graphs=await ownerQuery("select _account_deletion_profile_review_graph($1,$2) profile,_account_deletion_service_graph($3,null) service,encode(_account_deletion_retention_fingerprint($1,'service'),'hex') retention",[p.requestId,f.guitar,f.target]);
   assert.equal(graphs.profile.serviceCorrections[0].id,c.id);assert.equal(graphs.profile.serviceCorrectionDecisions.length,1);assert.equal(graphs.service.corrections[0].id,c.id);assert.equal(graphs.service.correctionDecisions.length,1);
   const a=await fingerprint(f,p);await rpcJson("redact_account_deletion_profile_review",[f.admin,false,p.requestId,id(),f.guitar,a,["Factual correction"]]);const b=await fingerprint(f,p);assert.notEqual(a,b);
   const after=await ownerQuery("select encode(_account_deletion_retention_fingerprint($1,'service'),'hex') value",[p.requestId]);assert.notEqual(graphs.retention,after.value);
  });
  await test("actual deletion review API accepts complete correction sections without raw identity keys",async()=>{
   const f=await privacyFixture(),c=await mutate(f.target,f.propose);await mutate(f.customer,await freshDecision(f,c.id));const p=await beginPrivacy(f);await inspectAndAttest(f,p);
   const service=deletionService(f),snapshot=await service.read(deletionRequest,p.requestId);assert.ok(snapshot.profileReviews.every(r=>r.attested));assert.ok(snapshot.retentionReviews.filter(r=>r.required).every(r=>r.attested));
  });
  await test("nonadministrator and stale fingerprint cannot authorize ledger redaction",async()=>{
   const f=await privacyFixture(false,"PRIVATE_NAME"),c=await mutate(f.target,f.propose);await mutate(f.customer,await freshDecision(f,c.id));const p=await beginPrivacy(f),before=await ledger(),fp=await fingerprint(f,p);
   await rejects(rpcJson("redact_account_deletion_profile_review",[f.customer,false,p.requestId,id(),f.guitar,fp,["PRIVATE_NAME"]]),"PD403");
   await rejects(rpcJson("redact_account_deletion_profile_review",[f.admin,false,p.requestId,id(),f.guitar,"0".repeat(64),["PRIVATE_NAME"]]),"PD412");same(await ledger(),before);
  });
  await test("verified scoped redaction scrubs both note and duplicate request body and consumes capabilities",async()=>{
   const f=await privacyFixture(false,"PRIVATE_NAME"),c=await mutate(f.target,f.propose);const d=await mutate(f.customer,await freshDecision(f,c.id));const p=await beginPrivacy(f),before=await ownerQuery("select to_jsonb(c) row from service_record_corrections c where id=$1",[c.id]);
   await rpcJson("redact_account_deletion_profile_review",[f.admin,false,p.requestId,id(),f.guitar,await fingerprint(f,p),["PRIVATE_NAME"]]);
   const after=await ownerQuery("select to_jsonb(c) row from service_record_corrections c where id=$1",[c.id]);assert.doesNotMatch(JSON.stringify(after.row),/PRIVATE_NAME/);
   for(const key of Object.keys(before.row).filter(k=>!["details","request_body"].includes(k)))same(after.row[key],before.row[key]);
   assert.equal((await ownerQuery("select count(*)::int value from service_correction_cleanup_authorizations")).value,0);
   await rejects(ownerQuery("update service_record_correction_decisions set is_public=true where id=$1 returning id",[d.id]),"42501");
  });
  await test("forged privacy settings alone cannot unlock immutable ledger or cleanup helper",async()=>{
   const f=await privacyFixture(false,"PRIVATE_NAME"),c=await mutate(f.target,f.propose),p=await beginPrivacy(f),before=await ledger();
   await q("select set_config('qrguitar.account_deletion_request',$1,false),set_config('qrguitar.account_deletion_profile_redaction',$1,false)",[p.requestId]);
   try{await rejects(q("select _redact_service_corrections($1,$2,$3)",[p.requestId,f.guitar,["PRIVATE_NAME"]]),"42501");await rejects(q("select * from service_correction_cleanup_authorizations"),"42501");await rejects(ownerQuery("update service_record_corrections set details='Forged replacement' where id=$1 returning id",[c.id]),"42501");same(await ledger(),before);}
   finally{await q("select set_config('qrguitar.account_deletion_request','',false),set_config('qrguitar.account_deletion_profile_redaction','',false)");}
  });
  await test("invalid identity-migration grant cannot change event hash outcome or participant",async()=>{
   const f=await privacyFixture(),c=await mutate(f.target,f.propose),d=await mutate(f.customer,await freshDecision(f,c.id)),p=await beginPrivacy(f),before=await ledger();
   await q("select set_config('qrguitar.account_deletion_identity_migration',$1,false)",[p.requestId]);
   try{await rejects(ownerQuery("update service_record_corrections set original_event_hash=repeat('0',64) where id=$1 returning id",[c.id]),"42501");await rejects(ownerQuery("update service_record_correction_decisions set outcome='rejected' where id=$1 returning id",[d.id]),"42501");await rejects(ownerQuery("update service_record_corrections set provider_user_id=$1 where id=$2 returning id",[f.buyer,c.id]),"PD423");same(await ledger(),before);}
   finally{await q("select set_config('qrguitar.account_deletion_identity_migration','',false)");}
  });
  await test("third-party identity text creates review scope and cannot bypass Profile graph freeze",async()=>{
   const f=await privacyFixture(),email="buyer-"+f.buyer+"@example.test";f.propose.details="Custody contact "+email;const c=await mutate(f.target,f.propose),p=await beginPrivacy(f,f.buyer),body=await freshDecision(f,c.id);
   assert.ok(p.prepared.profileReviews.some(r=>r.guitarId===f.guitar));
   await rpcJson("redact_account_deletion_profile_review",[f.admin,false,p.requestId,id(),f.guitar,await fingerprint(f,p),[email]]);await inspectAndAttest(f,p);const frozen=await rpcJson("prepare_account_deletion_fulfillment",[f.admin,false,p.requestId,id(),[]]);assert.equal(frozen.fulfillment.state,"quiescing_storage");
   await rejects(mutate(f.customer,body),"PD423");
  });
  await test("retained PII gate detects correction-only personal content",async()=>{
   const f=await privacyFixture();f.propose.details="Contact "+f.email;await mutate(f.target,f.propose);const p=await beginPrivacy(f);
   assert.equal((await ownerQuery("select _account_deletion_retained_pii($1,$2,$3) value",[p.requestId,f.target,f.email])).value,true);
  });
  await test("full reviewed fixture deletion pseudonymizes ledger and verifies Auth absence before complete",async()=>{
   const f=await privacyFixture(true);f.propose.details="PRIVATE_NAME "+f.email;const c=await mutate(f.target,f.propose);await mutate(f.customer,await freshDecision(f,c.id,"accept",true));const p=await beginPrivacy(f);
   await rpcJson("redact_account_deletion_profile_review",[f.admin,false,p.requestId,id(),f.guitar,await fingerprint(f,p),["PRIVATE_NAME"]]);await inspectAndAttest(f,p);
   const freeze=await rpcJson("prepare_account_deletion_fulfillment",[f.admin,false,p.requestId,id(),[]]);assert.equal(freeze.fulfillment.state,"quiescing_storage");
   // Fixture clock acceleration only; this is not evidence of an operational three-hour wait.
   await advanceFixtureClock(p.requestId);
   const ready=await rpcJson("prepare_account_deletion_fulfillment",[f.admin,false,p.requestId,id(),[]]);assert.equal(ready.fulfillment.state,"ready_for_auth_deletion");
   const row=(await ownerQuery("select to_jsonb(c) row from service_record_corrections c where id=$1",[c.id])).row;assert.equal(row.provider_user_id,null);assert.ok(row.provider_subject_id);for(const secret of [f.target,"PRIVATE_NAME",f.email])assert.equal(JSON.stringify(row).includes(secret),false);
   assert.equal((await ownerQuery("select _account_deletion_retained_pii($1,$2,$3) value",[p.requestId,f.target,f.email])).value,false);
   await rejects(rpcJson("complete_account_deletion_fulfillment",[f.admin,false,p.requestId,id()]),"PD428");
   await ownerQuery("delete from auth.users where id=$1 returning id",[f.target]);
   const completed=await rpcJson("complete_account_deletion_fulfillment",[f.admin,false,p.requestId,id()]);assert.equal(completed.fulfillment.state,"completed");assert.equal((await ownerQuery("select count(*)::int value from auth.users where id=$1",[f.target])).value,0);
   assert.equal((await visible(f)).length,1);const shown=JSON.stringify(await visible(f));for(const secret of [f.target,"PRIVATE_NAME",f.email])assert.equal(shown.includes(secret),false);assert.ok(shown.includes("[personal information removed]"));
  });
  await test("owner-decision identity is retained only as verified service subject after cleanup",async()=>{
   const f=await privacyFixture(),c=await mutate(f.target,f.propose),d=await mutate(f.customer,await freshDecision(f,c.id));const p=await beginPrivacy(f,f.customer);await inspectAndAttest(f,p);
   const freeze=await rpcJson("prepare_account_deletion_fulfillment",[f.admin,false,p.requestId,id(),[]]);assert.equal(freeze.fulfillment.state,"quiescing_storage");await advanceFixtureClock(p.requestId);
   const ready=await rpcJson("prepare_account_deletion_fulfillment",[f.admin,false,p.requestId,id(),[]]);assert.equal(ready.fulfillment.state,"ready_for_auth_deletion");const row=await ownerQuery("select owner_user_id,owner_subject_id,outcome,is_public from service_record_correction_decisions where id=$1",[d.id]);assert.equal(row.owner_user_id,null);assert.ok(row.owner_subject_id);assert.equal(row.outcome,"accepted");assert.equal(row.is_public,false);
  });
  function correctionEntryRender(entries){const jsx=(type,props)=>({type,props});const out=module("apps/web/components/ServiceCorrections.tsx",{react:{useEffect:()=>{},useRef:()=>({current:null}),useState:()=>[null,()=>{}]},"react/jsx-runtime":{jsx,jsxs:jsx,Fragment:"fragment"},"next/link":function Link(){},"./UiTextProvider":{useUiText:()=>((_key,fallback)=>fallback)},"../lib/supabase-browser":{createBrowserSupabaseClient:()=>{throw Error("No auth in entry render");}},"../lib/service-corrections-client":{createServiceCorrectionClient:()=>{throw Error("No controller in entry render");}}});return out.OwnerServiceCorrectionLinks({entries});}
  await test("actual owner entry deduplicates approved submission links and excludes foreign kinds or malformed IDs",async()=>{
   const sid=id(),entry={sourceKind:"provider_submitted_owner_approved",serviceSubmissionId:sid,title:"Approved work"};const tree=correctionEntryRender([entry,entry,{...entry,serviceSubmissionId:"../private"},{...entry,sourceKind:"owner_reported",serviceSubmissionId:id()}]),links=elementNodes(tree).filter(n=>n.props?.href);
   assert.equal(links.length,1);assert.equal(links[0].props.href,"/service-corrections/"+sid);assert.equal(correctionEntryRender([]),null);assert.match(read("apps/web/app/i/[code]/ProfileClient.tsx"),/!publicReviewSnapshot && canEdit && <OwnerServiceCorrectionLinks/);
  });
  await test("actual buyer page mounts correction controller without old submission or evidence loader",async()=>{
   const jsx=(type,props)=>({type,props}),sid=id();function Correction(){}const source="apps/web/app/service-corrections/[id]/page.tsx";
   const render=param=>module(source,{"next/navigation":{useParams:()=>({id:param})},"../../../components/WorkflowWorkspace.module.css":{default:{corrections:"corrections"}},"next/link":function Link(){},"../../../components/Nav":{Nav:function Nav(){}},"../../../components/Footer":{Footer:function Footer(){}},"../../../components/ServiceCorrections":{ServiceCorrections:Correction},"../../../components/UiTextProvider":{useUiText:()=>((_key,fallback)=>fallback)},"react/jsx-runtime":{jsx,jsxs:jsx,Fragment:"fragment"}}).default();
   const nodes=elementNodes(render(sid));assert.equal(nodes.find(n=>n.type===Correction).props.submissionId,sid);assert.equal(elementNodes(render("../wrong")).filter(n=>n.type===Correction).length,0);assert.doesNotMatch(read(source),/service-submissions|service-evidence/);assert.equal(read(source).includes("fetch("),false);
  });

  return{passed:results.filter(x=>x.ok).length,failed:results.filter(x=>!x.ok).length,results,
   limits:["single-connection PGlite, actual source through in-memory adapters; no production/PostgREST/browser/Storage acceptance","correction notes only; existing approved event and evidence are never overwritten"]};
 }finally{await db.close();}
}
if(import.meta.url.startsWith("file:")&&process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const option=name=>{const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1];};
 const repo=path.resolve(option("--repo")||path.join(path.dirname(fileURLToPath(import.meta.url)),"../../../..")),proposal=option("--proposal");
 const read=relative=>fs.readFileSync(proposal&&fs.existsSync(path.join(proposal,relative))?path.join(proposal,relative):path.join(repo,relative),"utf8");
 const sql=fs.readFileSync(option("--sql")||path.join(proposal||repo,"supabase/migrations/20261006230000_append_only_service_corrections.sql"),"utf8");
 const result=await qualifyServiceCorrections({repo,sql,read});console.log(JSON.stringify(result,null,2));if(result.failed)process.exitCode=1;
}
