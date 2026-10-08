// In-memory private-document qualification. No network or filesystem writes.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {Blob} from "node:buffer";
import {createRequire} from "node:module";
import {pathToFileURL,fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
const hash = value => createHash("sha256").update(value).digest("hex");
const uid = n => "10000000-0000-4000-8000-"+String(n).padStart(12,"0");
export async function qualify({repo,sql,installSchema,only=()=>true,read=relative=>fs.readFileSync(path.join(repo,relative),"utf8"),log=console.log}) {
  const require=createRequire(path.join(repo,"package.json"));
  const {PGlite}=require("@electric-sql/pglite-pg17"),ts=require("typescript");
  const installRepositorySchema=installSchema || (await import(pathToFileURL(path.join(repo,"apps/web/scripts/security/postgres-fixture.mjs")))).installRepositorySchema;
  const db=new PGlite(),oldFetch=globalThis.fetch,results=[];
  globalThis.fetch=async()=>{throw Error("No network permitted in document qualification");};
  const seller=uid(1),buyer=uid(2),third=uid(3),admin=uid(4);
  let sequence=0;
  // Compare every serialized field across PGlite/VM realms, including Date values.
  const same=(a,b)=>assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)));
  const q=async(text,values=[])=> (await db.query(text,values)).rows;
  const one=async(text,values=[])=> (await q(text,values))[0];
  const role=async name=>db.exec("reset role; set local role "+name);
  const state=async()=>{
    await db.exec("reset role");
    const value={};
    for(const table of ["profiles","guitars","guitar_documents","guitar_media","ownership_transfers",
      "ownership_transfer_document_selections","guitar_timeline_events","ownership_claims",
      "ownership_claim_events","admin_audit_events","site_content","instrument_staged_uploads"])
      value[table]=(await one("select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text),'[]'::jsonb) value from public."+table+" x")).value;
    return value;
  };
  const failure=async(action,codes)=>{
    await db.exec("savepoint expected_failure");
    try { await assert.rejects(action,e=>[].concat(codes).includes(e.code)); }
    finally { await db.exec("rollback to savepoint expected_failure"); }
  };
  const test=async(name,run)=>{
    if(!only(name))return;
    await db.exec("reset role; begin");
    try{await run();results.push({name,ok:true});log("PASS "+name);}
    catch(e){results.push({name,ok:false,code:e.code||null,message:e.message});log("FAIL "+name+": "+e.message);}
    finally{await db.exec("rollback; reset role");}
  };
  const fixture=async()=>{
    const n=++sequence;
    const g=await one("insert into guitars(owner_id,qr_code,permanent_path,name,brand,model,visibility,updated_at) values($1,$2,$3,'Guitar','Fender','Strat','public','2026-01-01') returning *",[seller,"DOC-QA"+n,"/i/DOC-QA"+n]);
    const documents=[];
    for(let k=0;k<3;k++) documents.push(await one("insert into guitar_documents(guitar_id,uploaded_by_user_id,name,storage_path,is_public,mime_type,file_size_bytes,updated_at) values($1,$2,$3,$4,$5,'application/pdf',4,'2026-01-01') returning *",[g.id,seller,["selected","kept","public"][k],seller+"/"+g.id+"/"+k+".pdf",k===2]));
    for(const d of documents) await q("insert into storage.objects(bucket_id,name,metadata) values('instrument-documents',$1,'{\"size\":4,\"mimetype\":\"application/pdf\"}')",[d.storage_path]);
    const media=await one("insert into guitar_media(guitar_id,storage_path,alt,sort_order) values($1,$2,'Photo',0) returning *",[g.id,seller+"/"+g.id+"/photo.jpg"]);
    await q("update guitars set hero_image_path=$1 where id=$2",[media.storage_path,g.id]);
    return {g:await one("select * from guitars where id=$1",[g.id]),documents,media};
  };
  const expected=async f=>(await q("select id,updated_at from guitar_documents where guitar_id=$1 and not retained_private order by id",[f.g.id])).map(d=>({id:d.id,updatedAt:d.updated_at}));
  const prepare=async(f,selected=[],options={})=>{
    const docs=options.docs??await expected(f),version=options.version??f.g.updated_at;
    await role("service_role");
    return (await one("select public.prepare_ownership_transfer_with_documents($1,$2,$3,'Recipient',null,null,7,false,'Actor',$4,$5::jsonb,$6::uuid[]) value",[options.actor||seller,f.g.qr_code,options.email||"buyer@example.test",version,JSON.stringify(docs),selected])).value;
  };
  const complete=async(t,actor=buyer)=>{
    await role("service_role");
    return (await one("select public.complete_ownership_transfer_with_documents($1,$2,null,null,false,'Recipient') value",[t.id,actor])).value;
  };
  const retained=async actor=>(await one("select public.read_retained_private_documents($1,0,null) value",[actor])).value.documents;
  const savePayload=async f=>{
    await db.exec("reset role");
    const g=await one("select * from guitars where id=$1",[f.g.id]);
    const docs=await q("select * from guitar_documents where guitar_id=$1 and not retained_private order by id",[f.g.id]);
    return {guitar:{qr_code:g.qr_code,name:"Edited",brand:g.brand,model:g.model,serial_number:g.serial_number,visibility:g.visibility,hero_image_path:f.media.storage_path},
      media:[{id:f.media.id,storage_path:f.media.storage_path,alt:"Photo",sort_order:0}],specs:[],
      documents:docs,expected_documents:docs.map(d=>({id:d.id,updated_at:d.updated_at})),
      expected_media:[{id:f.media.id,storage_path:f.media.storage_path,sort_order:0}]};
  };
  const save=async(f,payload)=>{
    const g=await one("select updated_at from guitars where id=$1",[f.g.id]);
    await role("service_role");
    return (await one("select public.save_instrument_profile($1,$2,$3,$4::jsonb) value",[f.g.id,buyer,g.updated_at,JSON.stringify(payload)])).value;
  };
  try{
    // Insert this additive proposal at its real migration position exactly once.
    // This also works after Main materializes the same file in the canonical tree.
    const documentMigration="20261005220000_private_document_handoff.sql";
    await installRepositorySchema(db,repo,"20261005220000");
    await db.exec(sql);
    for(const name of fs.readdirSync(path.join(repo,"supabase/migrations")).filter(n=>n.endsWith(".sql")&&n>documentMigration).sort())
      await db.exec(fs.readFileSync(path.join(repo,"supabase/migrations",name),"utf8").replaceAll("\r\n","\n").replace(/create extension if not exists "?pgcrypto"?;/gi,""));
    for(const [id,email,name,r] of [[seller,"seller@example.test","Seller","shop"],[buyer,"buyer@example.test","Buyer","shop"],[third,"third@example.test","Third","shop"],[admin,"admin@example.test","Admin","admin"]]){
      await q("insert into auth.users(id,email)values($1,$2)",[id,email]);
      await q("insert into profiles(id,display_name,role,plan,account_status)values($1,$2,$3,'business','active')",[id,name,r]);
    }
    await db.exec("insert into storage.buckets(id,name,public)values('instrument-documents','instrument-documents',false),('instrument-media','instrument-media',false) on conflict(id)do nothing");
    await test("old bypasses revoked; wrappers service-only; direct metadata/Storage denied",async()=>{
      for(const signature of ["prepare_ownership_transfer(uuid,text,text,text,text,text,integer,boolean,text)","complete_ownership_transfer(uuid,uuid,text,text,boolean,text)"])
        assert.equal((await one("select has_function_privilege('service_role',$1,'EXECUTE') value",["public."+signature])).value,false);
      for(const signature of ["read_retained_private_documents(uuid,integer,uuid)","complete_ownership_transfer_with_documents(uuid,uuid,text,text,boolean,text)","prepare_ownership_transfer_with_documents(uuid,text,text,text,text,text,integer,boolean,text,timestamptz,jsonb,uuid[])"]){
        const rows=await q("select r,has_function_privilege(r,$1,'EXECUTE') value from unnest(array['anon','authenticated','service_role'])r",["public."+signature]);
        same(rows.map(x=>x.value),[false,false,true]);
      }
      const f=await fixture();await complete((await prepare(f,[f.documents[0].id])).transfer);
      for(const actor of [buyer,third])for(const r of ["anon","authenticated"]){
        await role(r);await q("select set_config('request.jwt.claim.sub',$1,true)",[actor]);
        await failure(()=>q("select private_notes from guitar_documents"),"42501");
        await failure(()=>q("select read_retained_private_documents($1,0,null)",[seller]),"42501");
        await failure(()=>q("select name from storage.objects where bucket_id='instrument-documents'"),"42501");
      }
    });
    await test("mixed selection moves only chosen private file; public visibility and details preserved",async()=>{
      const f=await fixture(),before=await state(),t=(await prepare(f,[f.documents[0].id])).transfer;
      const result=await complete(t);assert.equal(result.replayed,false);
      const docs=await q("select * from guitar_documents where guitar_id=$1",[f.g.id]);
      for(const d of f.documents){const actual=docs.find(x=>x.id===d.id),kept=d.id===f.documents[1].id;
        same(actual,{...d,retained_private:kept,retained_by_user_id:kept?seller:null});
      }
      assert.equal((await one("select visibility from guitars where id=$1",[f.g.id])).visibility,"public");
      same((await retained(seller)).map(d=>d.id),[f.documents[1].id]);
      assert.equal((await retained(buyer)).length,0);
      assert.equal((await one("select count(*)::int n from ownership_transfer_document_selections where transfer_id=$1",[t.id])).n,1);
      assert.equal(before.profiles.length,(await state()).profiles.length);
    });
    await test("empty selection retains every private file and no private file is silently public",async()=>{
      const f=await fixture();await complete((await prepare(f,[])).transfer);
      assert.equal((await q("select id from guitar_documents where guitar_id=$1 and retained_private and not is_public",[f.g.id])).length,2);
      assert.equal((await retained(buyer)).length,0);
    });
    for(const mode of ["foreign","public","duplicate","null","tooMany","duplicateExpected"])await test("invalid selection is atomic: "+mode,async()=>{
      const f=await fixture(),foreign=await fixture(),before=await state();
      const ids=mode==="foreign"?[foreign.documents[0].id]:mode==="public"?[f.documents[2].id]:mode==="duplicate"?[f.documents[0].id,f.documents[0].id]:mode==="null"?[null]:mode==="tooMany"?Array(11).fill(f.documents[0].id):[];
      const options=mode==="duplicateExpected"?{docs:[...(await expected(f)),(await expected(f))[0]]}:{};
      await failure(()=>prepare(f,ids,options),mode==="foreign"||mode==="public"||mode==="duplicateExpected"?"QT002":"22023");
      same(await state(),before);
    });
    for(const mode of ["edit","add","remove","profileVersion"])await test("prepared snapshot drift rejects acceptance atomically: "+mode,async()=>{
      const f=await fixture(),t=(await prepare(f,[f.documents[0].id])).transfer;await db.exec("reset role");
      if(mode==="edit")await q("update guitar_documents set private_notes='changed',updated_at=clock_timestamp() where id=$1",[f.documents[1].id]);
      if(mode==="add")await q("insert into guitar_documents(guitar_id,name,storage_path)values($1,'new',$2)",[f.g.id,seller+"/"+f.g.id+"/new.pdf"]);
      if(mode==="remove")await q("delete from guitar_documents where id=$1",[f.documents[1].id]);
      if(mode==="profileVersion")await q("update guitars set updated_at=clock_timestamp() where id=$1",[f.g.id]);
      const before=await state();await failure(()=>complete(t),"QT002");same(await state(),before);
    });
    await test("prepare replay retains immutable receipt and refuses changed file selection",async()=>{
      const f=await fixture(),first=await prepare(f,[f.documents[0].id]),before=await state();
      assert.equal((await prepare(f,[f.documents[0].id])).replayed,true);
      same(await state(),before);
      await failure(()=>prepare(f,[]),"QT002");same(await state(),before);
      await failure(()=>q("update ownership_transfer_document_selections set selected_private_ids='{}' where transfer_id=$1",[first.transfer.id]),"42501");
    });
    await test("accepted replay after later handoff changes no owner, custody, receipt or timeline",async()=>{
      const f=await fixture(),t=(await prepare(f,[f.documents[0].id])).transfer;await complete(t);
      await db.exec("reset role");f.g=await one("select * from guitars where id=$1",[f.g.id]);
      const later=await prepare(f,[],{actor:buyer,email:"third@example.test"});await complete(later.transfer,third);
      const before=await state(),result=await complete(t);
      assert.equal(result.replayed,true);same(await state(),before);
      assert.equal((await one("select owner_id from guitars where id=$1",[f.g.id])).owner_id,third);
    });
    await test("buyer Profile save omits retained rows without deleting or editing them",async()=>{
      const f=await fixture();await complete((await prepare(f,[f.documents[0].id])).transfer);
      const before=await one("select to_jsonb(d) value from guitar_documents d where id=$1",[f.documents[1].id]);
      const p=await savePayload(f);assert.equal(p.documents.length,2);
      assert.equal((await save(f,p)).ok,true);
      same(await one("select to_jsonb(d) value from guitar_documents d where id=$1",[f.documents[1].id]),before);
      p.documents=[];p.expected_documents=(await savePayload(f)).expected_documents;
      await save(f,p);
      assert.equal((await q("select id from guitar_documents where guitar_id=$1",[f.g.id])).length,1);
    });
    await test("buyer cannot submit a retained ID or clone its original path",async()=>{
      const f=await fixture();await complete((await prepare(f,[])).transfer);
      const p=await savePayload(f);p.documents.push(f.documents[1]);
      const before=await state();await failure(()=>save(f,p),"PT409");same(await state(),before);
      p.documents[p.documents.length-1]={...f.documents[1],id:null};
      await failure(()=>save(f,p),"42501");same(await state(),before);
    });
    await test("all retained paths block direct fresh attachment and redirected active files",async()=>{
      const f=await fixture();await complete((await prepare(f,[])).transfer);await db.exec("reset role");
      const before=await state();
      await failure(()=>q("insert into guitar_documents(guitar_id,name,storage_path)values($1,'clone',$2)",[f.g.id,f.documents[1].storage_path]),"42501");
      await failure(()=>q("update guitar_documents set storage_path=$1 where id=$2",[f.documents[1].storage_path,f.documents[2].id]),"42501");
      same(await state(),before);
      assert.equal((await one("select _account_deletion_storage_disposition('instrument-documents',$1) value",[f.documents[1].storage_path])).value,"retain");
    });
    await test("actual alternate ownership claim defaults to retaining private files",async()=>{
      const f=await fixture(),c=await one("insert into ownership_claims(guitar_id,claim_type,status,current_owner_id,claimant_user_id)values($1,'owner_transfer','awaiting_owner',$2,$3) returning id",[f.g.id,seller,buyer]);
      await role("service_role");
      const result=(await one("select approve_ownership_claim($1,$2,'Reviewed request',false) value",[c.id,seller])).value;
      assert.equal(result.ok,true);
      assert.equal((await q("select id from guitar_documents where guitar_id=$1 and retained_private",[f.g.id])).length,2);
      assert.equal((await retained(buyer)).length,0);
    });
    await test("custodian is inventoried and pending deletion fences retained file access and writes",async()=>{
      const f=await fixture();await complete((await prepare(f,[])).transfer);await db.exec("reset role");
      // Make custody the only document identity to prove the added relationship itself.
      await q("update guitar_documents set uploaded_by_user_id=null,retained_by_user_id=$1 where id=$2",[third,f.documents[1].id]);
      const request=await one("insert into account_deletion_requests(actor_id)values($1) returning id",[third]);
      await q("select prepare_account_deletion_fulfillment($1,false,$2,$3,'{}'::text[]) value",[admin,request.id,uid(7777)]);
      await q("select _account_deletion_sync_profile_review_scope($1,$2,'')",[request.id,third]);
      const scope=await one("select relationship_codes from account_deletion_profile_review_scopes where request_id=$1 and guitar_id=$2",[request.id,f.g.id]);
      assert.ok(scope.relationship_codes.includes("document_custodian"));
      assert.equal((await one("select _account_deletion_retained_pii($1,$2,'') value",[request.id,third])).value,true);
      await role("service_role");await failure(()=>retained(third),"42501");
      await failure(()=>q("update guitar_documents set retained_by_user_id=null where id=$1",[f.documents[1].id]),"PD423");
      await failure(()=>q("delete from guitars where id=$1",[f.g.id]),["42501","PD423"]);
    });
    await test("account removal denies custodian RPC without publishing retained bytes",async()=>{
      const f=await fixture();await complete((await prepare(f,[])).transfer);await db.exec("reset role");
      await q("update profiles set account_status='removed' where id=$1",[seller]);
      await role("service_role");await failure(()=>retained(seller),"42501");
      assert.equal((await q("select id from guitar_documents where guitar_id=$1 and retained_private and is_public",[f.g.id])).length,0);
    });
    await test("injected release failure rolls back accepted transfer, owner, files and timeline",async()=>{
      const f=await fixture(),t=(await prepare(f,[f.documents[0].id])).transfer;await db.exec("reset role");
      await db.exec("create function public.qa_doc_fail()returns trigger language plpgsql as $$begin if old.retained_private and not new.retained_private then raise exception using errcode='ZD001',message='injected release failure';end if;return new;end$$;create trigger qa_doc_fail before update on guitar_documents for each row execute function qa_doc_fail()");
      const before=await state();await failure(()=>complete(t),"ZD001");same(await state(),before);
    });
    await test("existing previous-owner sale-offer closeout still commits in the same transfer",async()=>{
      const f=await fixture();await q("insert into guitar_specs(guitar_id,label,value,sort_order)values($1,'Availability','for_sale',0)",[f.g.id]);
      await complete((await prepare(f,[])).transfer);
      const value=(await one("select value from guitar_specs where guitar_id=$1 and label='Availability'",[f.g.id])).value;
      assert.equal(value,"not_for_sale");
    });

    const rpcCalls=[],downloads=[];
    function loadRoute(relative,actor) {
      const client={
        async rpc(name,p) {
          rpcCalls.push({name,params:p});await role("service_role");await db.exec("savepoint api_request");
          try{
            let value;
            if(name==="read_retained_private_documents")value=(await one("select read_retained_private_documents($1,$2,$3) value",[p.p_actor_id,p.p_offset,p.p_document_id])).value;
            else if(name==="prepare_ownership_transfer_with_documents")value=(await one("select prepare_ownership_transfer_with_documents($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::uuid[]) value",[p.p_actor_id,p.p_qr_code,p.p_to_email,p.p_to_name,p.p_buyer_code_hash,p.p_order_reference_hash,p.p_expires_in_days,p.p_env_admin,p.p_display_name,p.p_expected_updated_at,JSON.stringify(p.p_expected_documents),p.p_selected_private_ids])).value;
            else if(name==="complete_ownership_transfer_with_documents")value=(await one("select complete_ownership_transfer_with_documents($1,$2,$3,$4,$5,$6) value",[p.p_transfer_id,p.p_new_owner_id,p.p_buyer_code_hash,p.p_order_reference_hash,p.p_env_admin,p.p_display_name])).value;
            else throw Error("Unexpected RPC: "+name);
            await db.exec("release savepoint api_request");return {data:value,error:null};
          }catch(e){await db.exec("rollback to savepoint api_request;release savepoint api_request");return {data:null,error:{code:e.code||"fixture",message:e.message}};}
        },
        storage:{from(bucket){assert.equal(bucket,"instrument-documents");return{async download(storagePath){
          downloads.push(storagePath);return{data:new Blob(["file"],{type:"application/pdf"}),error:null};
        }};}}
      };
      class NextResponse extends Response {
        static json(body,init={}){return new Response(JSON.stringify(body),{...init,headers:{"Content-Type":"application/json",...init.headers}});}
      }
      const context={exports:{},Response,Request,URL,Blob,Buffer,
        process:{env:{}},require:name=>{
          if(name==="next/server")return{NextResponse};
          if(name==="node:crypto")return require("node:crypto");
          if(name==="@supabase/supabase-js")return{createClient(){throw Error("No email transport permitted");}};
          if(name.endsWith("supabase-server"))return{
            createServerSupabaseClient:()=>client,
            getAuthenticatedUser:async()=>({user:actor?{id:actor,email:actor===seller?"seller@example.test":actor===buyer?"buyer@example.test":"third@example.test",user_metadata:{}}:null}),
            getSupabaseEnvStatus:()=>({hasAnonKey:false})
          };
          if(name.endsWith("admin-auth"))return{assertAccountCanWrite:async()=>({ok:true}),readAdminEmailList:()=>[],normalizeEmail:s=>String(s||"").toLowerCase(),isAdminRole:r=>r==="admin"};
          throw Error("Unexpected route import: "+name);
        }};
      vm.runInNewContext(ts.transpileModule(read(relative),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
      return context.exports;
    }
    const get=(id,offset="0")=>new Request("https://fixture.invalid/api/retained-documents?offset="+offset+(id?"&id="+id:""));
    const request=(method,body)=>new Request("https://fixture.invalid/api/transfers",{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    const handoffBody=async f=>({qrCode:f.g.qr_code,toEmail:"buyer@example.test",expectedUpdatedAt:f.g.updated_at,expectedDocuments:await expected(f),selectedPrivateDocumentIds:[]});
    await test("actual retained API whitelists metadata and downloads only seller custody",async()=>{
      const f=await fixture();await complete((await prepare(f,[f.documents[0].id])).transfer);
      const endpoint=loadRoute("apps/web/app/api/retained-documents/route.ts",seller);
      const list=await endpoint.GET(get());assert.equal(list.status,200);
      const value=await list.json();same(value.documents.map(d=>d.id),[f.documents[1].id]);
      same(Object.keys(value.documents[0]).sort(),["createdAt","fileName","id","name"]);
      const before=downloads.length,file=await endpoint.GET(get(f.documents[1].id));
      assert.equal(file.status,200);assert.equal(await file.text(),"file");
      assert.equal(file.headers.get("Content-Disposition"),"attachment");
      assert.match(file.headers.get("Cache-Control"),/private, no-store/);
      assert.equal(downloads.length,before+1);assert.equal(downloads.at(-1),f.documents[1].storage_path);
    });
    await test("actual retained API denies buyer/anonymous/foreign ID without reading file bytes",async()=>{
      const f=await fixture();await complete((await prepare(f,[])).transfer);const before=downloads.length;
      assert.equal((await loadRoute("apps/web/app/api/retained-documents/route.ts",buyer).GET(get(f.documents[0].id))).status,404);
      assert.equal((await loadRoute("apps/web/app/api/retained-documents/route.ts",null).GET(get(f.documents[0].id))).status,401);
      assert.equal((await loadRoute("apps/web/app/api/retained-documents/route.ts",seller).GET(get(uid(999)))).status,404);
      assert.equal(downloads.length,before);
    });
    await test("actual retained API rejects invalid query and removed account",async()=>{
      const endpoint=loadRoute("apps/web/app/api/retained-documents/route.ts",seller),before=rpcCalls.length;
      assert.equal((await endpoint.GET(get("not-a-uuid"))).status,400);
      assert.equal((await endpoint.GET(get(null,"100001"))).status,400);assert.equal(rpcCalls.length,before);
      await db.exec("reset role");await q("update profiles set account_status='removed' where id=$1",[seller]);
      assert.equal((await endpoint.GET(get())).status,403);
    });
    await test("actual transfer API requires current snapshot and rejects duplicate selections before RPC",async()=>{
      const f=await fixture(),endpoint=loadRoute("apps/web/app/api/transfers/route.ts",seller),before=rpcCalls.length;
      assert.equal((await endpoint.POST(request("POST",{qrCode:f.g.qr_code,toEmail:"buyer@example.test"}))).status,400);
      const body=await handoffBody(f);body.selectedPrivateDocumentIds=[f.documents[0].id,f.documents[0].id];
      assert.equal((await endpoint.POST(request("POST",body))).status,400);assert.equal(rpcCalls.length,before);
    });
    await test("actual POST and PATCH invoke guarded SQL wrappers with exact reviewed selection",async()=>{
      const f=await fixture(),body=await handoffBody(f);body.selectedPrivateDocumentIds=[f.documents[0].id];
      const response=await loadRoute("apps/web/app/api/transfers/route.ts",seller).POST(request("POST",body));
      assert.equal(response.status,200);const prepared=await response.json();
      assert.equal(rpcCalls.at(-1).name,"prepare_ownership_transfer_with_documents");
      same(rpcCalls.at(-1).params.p_selected_private_ids,body.selectedPrivateDocumentIds);
      const accepted=await loadRoute("apps/web/app/api/transfers/route.ts",buyer).PATCH(request("PATCH",{id:prepared.transfer.id,action:"accept"}));
      assert.equal(accepted.status,200);assert.equal(rpcCalls.at(-1).name,"complete_ownership_transfer_with_documents");
      assert.equal((await accepted.json()).transfer.status,"accepted");
      same((await retained(seller)).map(d=>d.id),[f.documents[1].id]);
    });
    await test("actual transfer API maps child-file drift to 409 without prepared receipt",async()=>{
      const f=await fixture(),body=await handoffBody(f);await q("update guitar_documents set updated_at=clock_timestamp() where id=$1",[f.documents[0].id]);
      const response=await loadRoute("apps/web/app/api/transfers/route.ts",seller).POST(request("POST",body));
      assert.equal(response.status,409);await db.exec("reset role");
      assert.equal((await one("select count(*)::int n from ownership_transfer_document_selections where guitar_id=$1",[f.g.id])).n,0);
    });
    const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
    const tick=()=>new Promise(r=>setTimeout(r,0));
    const elements=tree=>{
      if(tree===null||tree===undefined||typeof tree!=="object")return[];
      if(Array.isArray(tree))return tree.flatMap(elements);
      return [tree,...elements(tree.props?.children)];
    };
    const text=tree=>typeof tree==="string"?tree:Array.isArray(tree)?tree.map(text).join(""):tree&&typeof tree==="object"?text(tree.props?.children):"";
    function componentHarness(source,name,{token=async()=>"mock-token",fetch=async()=>{throw Error("Unexpected UI request");}}={}) {
      let cursor=0,urls=0;const hooks=[],pending=[];let rendered;
      const react={
        useState(initial){const i=cursor++;if(!hooks[i])hooks[i]={value:typeof initial==="function"?initial():initial};
          return[hooks[i].value,value=>hooks[i].value=typeof value==="function"?value(hooks[i].value):value];},
        useRef(initial){const i=cursor++;if(!hooks[i])hooks[i]={current:initial};return hooks[i];},
        useEffect(effect,deps){const i=cursor++,prior=hooks[i];if(!prior||deps.some((d,n)=>!Object.is(d,prior.deps[n]))){hooks[i]={deps,cleanup:prior?.cleanup};pending.push(()=>{hooks[i].cleanup?.();hooks[i].cleanup=effect();});}}
      };
      const jsx=(type,props)=>({type,props}),ui=(_key,fallback)=>fallback;
      const context={exports:{},...react,useUiText:()=>ui,getSupabaseAccessToken:token,fetch,
        transferStatusLabel:()=>"",Mail:()=>null,Copy:()=>null,
        URL:{createObjectURL(){urls++;return "blob:fixture-only";},revokeObjectURL(){}},
        document:{createElement:()=>({click(){}})},
        setTimeout,console,window:{location:{origin:"https://fixture.invalid"}},
        require:name=>name==="react"?react:name==="react/jsx-runtime"?{jsx,jsxs:jsx,Fragment:"fragment"}:name.endsWith("supabase-browser")?{getSupabaseAccessToken:token}:name.endsWith("UiTextProvider")?{useUiText:()=>ui}:(()=>{throw Error("Unexpected component import "+name);})()
      };
      const compiled=ts.transpileModule(source+"\nexports.Component="+name+";",{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
      vm.runInNewContext(compiled,context);
      return{render(props){cursor=0;rendered=context.exports.Component(props);return rendered;},flush(){while(pending.length)pending.shift()();},hooks,get objectURLs(){return urls;}};
    }
    await test("actual retained UI scrubs account change and makes no same-lease read loop",async()=>{
      let calls=0,current=true;const check=()=>current;
      const h=componentHarness(read("apps/web/components/RetainedPrivateDocuments.tsx"),"RetainedPrivateDocuments",{fetch:async()=>{calls++;return{ok:true,json:async()=>({ok:true,documents:[{id:uid(90),name:"PRIVATE_ROW",fileName:"kept.pdf"}]})};}});
      const props={actorEmail:"seller@example.test",isSessionCurrent:check};
      h.render(props);h.flush();await tick();
      assert.match(text(h.render(props)),/PRIVATE_ROW/);h.flush();await tick();assert.equal(calls,1);
      current=false;const next={actorEmail:"buyer@example.test",isSessionCurrent:()=>true};
      assert.doesNotMatch(text(h.render(next)),/PRIVATE_ROW/);
    });
    await test("actual retained UI discards stale token without sending old-account request",async()=>{
      const token=deferred();let calls=0,current=true;
      const h=componentHarness(read("apps/web/components/RetainedPrivateDocuments.tsx"),"RetainedPrivateDocuments",{token:()=>token.promise,fetch:async()=>{calls++;throw Error("Unexpected stale request");}});
      h.render({actorEmail:"seller@example.test",isSessionCurrent:()=>current});h.flush();
      current=false;token.resolve("stale");await tick();assert.equal(calls,0);
    });

    await test("actual retained UI rejects a blob completed after account change",async()=>{
      const blob=deferred();let current=true;const check=()=>current;
      const h=componentHarness(read("apps/web/components/RetainedPrivateDocuments.tsx"),"RetainedPrivateDocuments",{fetch:async url=>url.includes("?id=")?{ok:true,blob:()=>blob.promise}:{ok:true,json:async()=>({ok:true,documents:[{id:uid(90),name:"PRIVATE_ROW",fileName:"kept.pdf"}]})}});
      const props={actorEmail:"seller@example.test",isSessionCurrent:check};
      h.render(props);h.flush();await tick();
      const tree=h.render(props);h.flush();
      elements(tree).find(n=>n.type==="button"&&text(n)==="Download").props.onClick();await tick();
      current=false;h.render({actorEmail:"buyer@example.test",isSessionCurrent:()=>true});h.flush();
      blob.resolve(new Blob(["file"],{type:"application/pdf"}));await tick();
      assert.equal(h.objectURLs,0);
    });
    const dashboard=read("apps/web/app/dashboard/page.tsx");
    const ast=ts.createSourceFile("dashboard.tsx",dashboard,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    const panel=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==="TransferPanel");
    assert.ok(panel,"Actual TransferPanel declaration missing");
    const panelSource=panel.getText(ast);
    const panelProps=()=>({instrument:{qrCode:"QRG-TEST",updatedAt:"2026-01-01",documentFiles:[
      {id:uid(91),name:"Private 1",updatedAt:"2026-01-01",visibility:"private"},
      {id:uid(92),name:"Private 2",updatedAt:"2026-01-01",visibility:"private"},
      {id:uid(93),name:"Public",updatedAt:"2026-01-01",visibility:"public"}]},
      user:{email:"seller@example.test"},sessionRevision:1,isSessionCurrent:()=>true,
      className:"panel",bodyClassName:"body",allowBuyerCode:true,onTransferCreated:()=>{},onTransferChanged:()=>{}});
    await test("actual transfer UI starts unchecked, sends reviewed IDs and resets on session generation",async()=>{
      const sent=[],props=panelProps(),h=componentHarness(panelSource,"TransferPanel",{fetch:async(_url,options)=>{sent.push(JSON.parse(options.body));return{ok:true,json:async()=>({ok:true,transfer:{id:uid(100),claimPath:"/receive/test"}})};}});
      let tree=h.render(props);h.flush();
      let boxes=elements(tree).filter(n=>n.type==="input"&&n.props.type==="checkbox");
      assert.equal(boxes.length,2);assert.ok(boxes.every(n=>n.props.checked===false));
      boxes[0].props.onChange({target:{checked:true}});
      tree=h.render(props);h.flush();
      elements(tree).find(n=>n.type==="input"&&n.props.type==="email").props.onChange({target:{value:"buyer@example.test"}});
      tree=h.render(props);h.flush();
      elements(tree).find(n=>n.type==="form").props.onSubmit({preventDefault(){}});await tick();
      same(sent[0].selectedPrivateDocumentIds,[uid(91)]);
      assert.equal(sent[0].expectedDocuments.length,3);
      tree=h.render({...props,sessionRevision:2});
      assert.ok(elements(tree).filter(n=>n.type==="input"&&n.props.type==="checkbox").every(n=>n.props.checked===false));
    });
    await test("actual transfer UI discards token resolved after session change",async()=>{
      const token=deferred();let calls=0,current=true;const props={...panelProps(),isSessionCurrent:()=>current};
      const h=componentHarness(panelSource,"TransferPanel",{token:()=>token.promise,fetch:async()=>{calls++;throw Error("Unexpected stale transfer");}});
      const tree=h.render(props);h.flush();
      elements(tree).find(n=>n.type==="form").props.onSubmit({preventDefault(){}});
      current=false;h.render({...props,sessionRevision:2,isSessionCurrent:()=>true});h.flush();
      token.resolve("stale");await tick();assert.equal(calls,0);
    });
    return{passed:results.filter(r=>r.ok).length,failed:results.filter(r=>!r.ok).length,results,sqlSha256:hash(sql),
      limits:["single-connection PGlite; no real Storage bytes, multi-connection scheduling or hydrated browser acceptance","readiness replacement is intentionally absent; Main must compose all14 checks and service fingerprints"]};
  }finally{globalThis.fetch=oldFetch;await db.close();}
}
if(import.meta.url.startsWith("file:") && process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const option=name=>{const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1];};
  const repo=path.resolve(option("--repo")||path.join(path.dirname(fileURLToPath(import.meta.url)),"../../../.."));
  const proposal=option("--proposal"),sql=fs.readFileSync(option("--sql")||path.join(proposal||repo,"supabase/migrations/20261005220000_private_document_handoff.sql"),"utf8");
  const read=relative=>fs.readFileSync(proposal&&fs.existsSync(path.join(proposal,relative))?path.join(proposal,relative):path.join(repo,relative),"utf8");
  const result=await qualify({repo,sql,read});console.log(JSON.stringify(result,null,2));
  if(result.failed)process.exitCode=1;
}
