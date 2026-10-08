import assert from "node:assert/strict";
import{createTestDb,readRepo}from"./atomic-test-support.mjs";
process.on("uncaughtException",error=>{console.error({message:error.message,code:error.code,where:error.where,position:error.position});process.exit(1);});
const db=await createTestDb(["20260910230000_atomic_instrument_create.sql"]);
const owner="10000000-0000-4000-8000-000000000001",other="10000000-0000-4000-8000-000000000002";
await db.exec(`insert into auth.users values('${owner}'),('${other}');
insert into public.profiles(id,display_name,plan)values('${owner}','Owner','business'),('${other}','Other','business');`);
let serial=0,passed=0;
async function fixture(){
 serial++;const upload="registry-session-"+serial,key="registry-request-"+serial;
 const photo=owner+"/profile-uploads/"+upload+"/image-01-test.jpg",doc=owner+"/profile-uploads/"+upload+"/document-01-test.pdf";
 await db.query("insert into storage.objects(bucket_id,name,metadata)values('instrument-media',$1,'{\"size\":10,\"mimetype\":\"image/jpeg\"}'),('instrument-documents',$2,'{\"size\":20,\"mimetype\":\"application/pdf\"}')",[photo,doc]);
 return{upload,key,photo,doc,payload:{guitar:{name:"Test instrument",brand:"Test",model:"Model",year:null,serial_number:null,builder:null,location:null,visibility:"public",summary:"",hero_image_path:photo},
 media:[{storage_path:photo,alt:"Test Model photo 1",sort_order:0}],
 documents:[{storage_path:doc,name:"Receipt",is_public:false,document_type:"Other",public_description:null,private_notes:null,issuer_source:null,document_date:null,description:null,related_timeline_event_id:null,related_service_event_id:null}],
 specs:[{label:"Condition",value:"used",sort_order:1}],service:null,owner_name:"",show_serial_public:false}};
}
async function create(f){return(await db.query("select public.create_instrument_profile($1::uuid,$2,$3,$4::jsonb,false,null) as r",[owner,f.key,f.upload,JSON.stringify(f.payload)])).rows[0].r;}
async function register(f,bucket,path){return(await db.query("select public.register_staged_instrument_upload($1::uuid,$2,$3,$4)as r",[owner,f.upload,bucket,path])).rows[0].r;}
async function registerAll(f){await register(f,"instrument-media",f.photo);await register(f,"instrument-documents",f.doc);}
async function cleanup(f,media=[f.photo],documents=[f.doc],actor=owner){return(await db.query("select public.cleanup_staged_instrument_uploads($1::uuid,$2,$3::text[],$4::text[])as r",[actor,f.upload,media,documents])).rows[0].r;}
async function rows(){return(await db.query("select to_jsonb(r)as r from public.instrument_staged_uploads r order by bucket_id,storage_path")).rows.map(r=>r.r);}
async function files(){return(await db.query("select to_jsonb(o)as o from storage.objects o order by bucket_id,name")).rows.map(r=>r.o);}
async function guitarCount(){return(await db.query("select count(*)::integer as n from public.guitars")).rows[0].n;}
async function test(name,fn){await fn();console.log("PASS "+name);passed++;}
// Existing committed profile and a fully published legacy pending request predate registry deployment.
const saved=await fixture();const savedResult=await create(saved);
const legacy=await fixture();const legacyResult=await create(legacy);
await db.query("delete from public.instrument_create_receipts where owner_id=$1 and idempotency_key=$2",[owner,legacy.key]);
await db.query("insert into public.site_content(content_key,content_value)values($1,$2::jsonb)",["create_submission:"+owner+":"+legacy.key,JSON.stringify({status:"pending",uploadId:legacy.upload,startedAt:"2000-01-01"})]);
await db.exec(readRepo("supabase/migrations/20260910233000_staged_upload_registry.sql"));
await test("registry and cleanup/register RPCs are service-only; unsafe internal create is not callable",async()=>{
 const grants=(await db.query("select r,has_function_privilege(r,'public.create_instrument_profile(uuid,text,text,jsonb,boolean,text)','EXECUTE')as create,has_function_privilege(r,'public.create_instrument_profile_unregistered(uuid,text,text,jsonb,boolean,text)','EXECUTE')as bypass,has_table_privilege(r,'public.instrument_staged_uploads','SELECT')as read from unnest(array['anon','authenticated','service_role'])r")).rows;
 assert.deepEqual(grants.map(r=>[r.r,r.create,r.bypass,r.read]),[["anon",false,false,false],["authenticated",false,false,false],["service_role",true,false,true]]);
});
await test("migration backfills saved file references as consumed and cleanup retains them",async()=>{
 const existing=(await rows()).filter(r=>r.upload_id===saved.upload);assert.equal(existing.length,2);assert.ok(existing.every(r=>r.state==="consumed"));
 const before=await files(),result=await cleanup(saved);assert.deepEqual(result.mediaPaths,[]);assert.deepEqual(result.documentPaths,[]);assert.equal(result.retainedCount,2);assert.deepEqual(await files(),before);
});
await test("cleanup first tombstones a path before HTTP deletion; later create cannot bind it",async()=>{
 const f=await fixture();await registerAll(f);const before=await files(),count=await guitarCount();
 const plan=await cleanup(f,[f.photo],[]);assert.deepEqual(plan.mediaPaths,[f.photo]);
 await assert.rejects(create(f),e=>e.code==="QG007");assert.equal(await guitarCount(),count);
 assert.equal((await rows()).find(r=>r.storage_path===f.photo).state,"tombstoned");
 assert.deepEqual(await files(),before); // RPC never writes storage.objects or deletes object bytes.
});
await test("create first consumes files and later cleanup never schedules their deletion",async()=>{
 const f=await fixture();await registerAll(f);
 await db.exec("set role service_role");const result=await create(f);await db.exec("reset role");
 assert.equal(result.ok,true);const state=(await rows()).filter(r=>r.upload_id===f.upload);assert.ok(state.every(r=>r.state==="consumed"&&r.guitar_id));
 const before=await files(),plan=await cleanup(f);assert.deepEqual(plan.mediaPaths,[]);assert.deepEqual(plan.documentPaths,[]);assert.equal(plan.retainedCount,2);assert.deepEqual(await files(),before);
});
await test("failed or unknown Storage deletion can retry tombstoned paths without reopening create",async()=>{
 const f=await fixture();await registerAll(f);const first=await cleanup(f);const again=await cleanup(f);
 assert.deepEqual(again.mediaPaths,first.mediaPaths);assert.deepEqual(again.documentPaths,first.documentPaths);
 await assert.rejects(create(f),e=>e.code==="QG007");
 await assert.rejects(register(f,"instrument-media",f.photo),e=>e.code==="QG007");
});
await test("per-file cleanup leaves other files in the same session usable",async()=>{
 const f=await fixture();await registerAll(f);
 const second=owner+"/profile-uploads/"+f.upload+"/image-02-test.jpg";
 await db.query("insert into storage.objects(bucket_id,name,metadata)values('instrument-media',$1,'{\"size\":10,\"mimetype\":\"image/jpeg\"}')",[second]);
 await register(f,"instrument-media",second);
 const plan=await cleanup(f,[second],[]);assert.deepEqual(plan.mediaPaths,[second]);
 assert.equal((await rows()).find(r=>r.storage_path===f.photo).state,"staged");
 assert.equal((await create(f)).ok,true);assert.equal((await rows()).find(r=>r.storage_path===second).state,"tombstoned");
});
await test("unregistered historical uploads are retained and fail closed for new create",async()=>{
 const f=await fixture(),before=await files();const plan=await cleanup(f);
 assert.equal(plan.unregisteredCount,2);assert.deepEqual(plan.mediaPaths,[]);assert.deepEqual(plan.documentPaths,[]);
 await assert.rejects(create(f),e=>e.code==="QG007");assert.deepEqual(await files(),before);
});
await test("consumption and receipt roll back together after a late database failure",async()=>{
 const f=await fixture();await registerAll(f);const before=await rows(),count=await guitarCount();
 await db.exec("create function public.qa_registry_fail()returns trigger language plpgsql as $$begin raise exception 'receipt failure';end$$;create trigger qa_registry_fail before insert on public.instrument_create_receipts for each row execute function public.qa_registry_fail();");
 await assert.rejects(create(f),/receipt failure/);assert.deepEqual(await rows(),before);assert.equal(await guitarCount(),count);
 await db.exec("drop trigger qa_registry_fail on public.instrument_create_receipts;drop function public.qa_registry_fail();");
 assert.equal((await create(f)).ok,true);
});
await test("a consumed-registry update failure also rolls back the already-created receipt and profile",async()=>{
 const f=await fixture();await registerAll(f);const before=await rows(),count=await guitarCount();
 await db.exec("create function public.qa_registry_fail()returns trigger language plpgsql as $$begin raise exception 'registry consumption failure';end$$;create trigger qa_registry_fail before update on public.instrument_staged_uploads for each row execute function public.qa_registry_fail();");
 await assert.rejects(create(f),/registry consumption failure/);assert.deepEqual(await rows(),before);assert.equal(await guitarCount(),count);
 assert.equal((await db.query("select count(*)::integer as n from public.instrument_create_receipts where owner_id=$1 and idempotency_key=$2",[owner,f.key])).rows[0].n,0);
 await db.exec("drop trigger qa_registry_fail on public.instrument_staged_uploads;drop function public.qa_registry_fail();");
});
await test("cleanup refuses another owner's registration",async()=>{
 const before=await rows();await assert.rejects(cleanup(saved,[saved.photo],[],other),e=>e.code==="42501");assert.deepEqual(await rows(),before);
});
await test("transferring a profile never gives its old uploader permission to delete evidence",async()=>{
 await db.query("update public.guitars set owner_id=$1 where qr_code=$2",[other,savedResult.qrCode]);
 const plan=await cleanup(saved);assert.deepEqual(plan.mediaPaths,[]);assert.deepEqual(plan.documentPaths,[]);assert.equal(plan.retainedCount,2);
});
await test("legacy completed pending reconciles through consumed backfilled registrations",async()=>{
 const count=await guitarCount(),result=await create(legacy);assert.equal(result.qrCode,legacyResult.qrCode);assert.equal(result.alreadyCreated,true);assert.equal(await guitarCount(),count);
});
await test("completed receipt replay needs no live staged object or registry access",async()=>{
 const f=await fixture();await registerAll(f);const first=await create(f);
 await db.query("delete from storage.objects where name=$1",[f.photo]); // Simulates later legitimate replacement/removal, outside this implementation.
 const again=await create(f);assert.equal(again.qrCode,first.qrCode);assert.equal(again.alreadyCreated,true);
});
await test("registration cannot revive tombstoned files and migration reruns remain safe",async()=>{
 const beforeCount=await guitarCount();await db.exec(readRepo("supabase/migrations/20260910233000_staged_upload_registry.sql"));assert.equal(await guitarCount(),beforeCount);
 const tombstone=(await rows()).find(r=>r.state==="tombstoned");
 await assert.rejects(register({upload:tombstone.upload_id},tombstone.bucket_id,tombstone.storage_path),e=>e.code==="QG007");
});
await test("missing registered object uses definitive no-commit reset code",async()=>{
 const f=await fixture();await registerAll(f);const count=await guitarCount();
 await db.query("delete from storage.objects where name=$1",[f.photo]);
 await assert.rejects(create(f),e=>e.code==="QG007");assert.equal(await guitarCount(),count);
 assert.ok((await rows()).filter(r=>r.upload_id===f.upload).every(r=>r.state==="staged"));
});
await test("legacy writer references are promoted to consumed; a new key cannot reuse that session",async()=>{
 const f=await fixture();await registerAll(f);
 await db.query("select public.create_instrument_profile_unregistered($1::uuid,$2,$3,$4::jsonb,false,null)",[owner,f.key,f.upload,JSON.stringify(f.payload)]);
 await db.query("delete from public.instrument_create_receipts where owner_id=$1 and idempotency_key=$2",[owner,f.key]);
 const plan=await cleanup(f);assert.equal(plan.retainedCount,2);assert.deepEqual(plan.mediaPaths,[]);assert.deepEqual(plan.documentPaths,[]);
 f.key+="-new";const count=await guitarCount();await assert.rejects(create(f),e=>e.code==="QG003");assert.equal(await guitarCount(),count);
});
await test("legacy pending with a missing consumed file requires review, never an automatic upload reset",async()=>{
 const f=await fixture();await registerAll(f);await create(f);
 await db.query("delete from public.instrument_create_receipts where owner_id=$1 and idempotency_key=$2",[owner,f.key]);
 await db.query("insert into public.site_content(content_key,content_value)values($1,$2::jsonb)",["create_submission:"+owner+":"+f.key,JSON.stringify({status:"pending",uploadId:f.upload})]);
 await db.query("delete from storage.objects where name=$1",[f.photo]);
 const count=await guitarCount();await assert.rejects(create(f),e=>e.code==="QG003");assert.equal(await guitarCount(),count);
});
console.log("Completed "+passed+" staged upload registry PostgreSQL tests.");
await db.close();


