import assert from "node:assert/strict";
import {createTestDb} from "./atomic-test-support.mjs";
process.on("uncaughtException",error=>{console.error({message:error.message,code:error.code,where:error.where,position:error.position});process.exit(1);});
const db=await createTestDb(["20260910230000_atomic_instrument_create.sql"]);
const owner="10000000-0000-4000-8000-000000000001",other="10000000-0000-4000-8000-000000000002";
await db.exec(`insert into auth.users values('${owner}'),('${other}');
 insert into public.profiles(id,display_name,created_at) values('${owner}','Existing account name','2026-01-01'),('${other}','Other account','2026-01-01');`);
let counter=0,passed=0;
const tables=["profiles","guitars","guitar_media","guitar_documents","guitar_specs","guitar_timeline_events","guitar_serial_aliases","site_content","instrument_create_receipts"];
async function snapshot(){
  const result={};
  for(const table of tables)result[table]=(await db.query(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) as rows from public.${table} t`)).rows[0].rows;
  return result;
}
async function fixture(serial=null){
  counter++;
  const upload="upload-session-"+String(counter).padStart(4,"0"),key="request-key-"+String(counter).padStart(4,"0");
  const photo=`${owner}/profile-uploads/${upload}/image-01-test.jpg`,document=`${owner}/profile-uploads/${upload}/document-01-test.pdf`;
  await db.query("insert into storage.objects(bucket_id,name,metadata) values('instrument-media',$1,$3::jsonb),('instrument-documents',$2,$4::jsonb)",
    [photo,document,JSON.stringify({size:100,mimetype:"image/jpeg"}),JSON.stringify({size:300,mimetype:"application/pdf"})]);
  return {key,upload,payload:{
    guitar:{name:"Fender Strat",brand:"Fender",model:"Strat",year:null,serial_number:serial,builder:null,location:null,visibility:"public",summary:"Test profile",hero_image_path:photo},
    media:[{storage_path:photo,alt:"Fender Strat photo 1",sort_order:0}],
    documents:[{name:"Receipt",storage_path:document,is_public:false,document_type:"Receipt",public_description:null,private_notes:"Private receipt",
      issuer_source:null,document_date:null,description:null,related_timeline_event_id:null,related_service_event_id:null}],
    specs:[{label:"Condition",value:"used",sort_order:1},{label:"Type",value:"Electric Guitar",sort_order:2}],
    service:{event_date:"2026-01-01",event_type:"Service",title:"Setup",description:"Setup",private_notes:null,shop_name:null,location:null,is_public:true},
    show_serial_public:Boolean(serial),owner_name:""
  }};
}
async function save(f,{actor=owner,expanded=false,fallback="Fallback owner"}={}){
  return (await db.query("select public.create_instrument_profile($1::uuid,$2,$3,$4::jsonb,$5::boolean,$6) as receipt",
    [actor,f.key,f.upload,JSON.stringify(f.payload),expanded,fallback])).rows[0].receipt;
}
async function test(name,fn){await fn();console.log("PASS "+name);passed++;}
await test("only service_role can call the RPC or access receipts",async()=>{
 const r=(await db.query("select r,has_function_privilege(r,'public.create_instrument_profile(uuid,text,text,jsonb,boolean,text)','EXECUTE') as execute,has_table_privilege(r,'public.instrument_create_receipts','SELECT') as read from unnest(array['anon','authenticated','service_role']) r")).rows;
 assert.deepEqual(r.map(x=>[x.r,x.execute,x.read]),[["anon",false,false],["authenticated",false,false],["service_role",true,true]]);
});
for(const [table,event] of [["guitar_media","insert"],["guitar_documents","insert"],["guitar_specs","insert"],["guitar_timeline_events","insert"],["site_content","insert"],["instrument_create_receipts","insert"]]){
 await test(table+" failure rolls back profile, every related row, and receipt",async()=>{
  const f=await fixture("SERIAL"+counter+"XYZ"),before=await snapshot();
  await db.exec(`create function public.qa_fail_create() returns trigger language plpgsql as $$begin raise exception 'injected create failure';end$$;
   create trigger qa_fail_create before ${event} on public.${table} for each row execute function public.qa_fail_create();`);
  await assert.rejects(save(f),/injected create failure/);
  assert.deepEqual(await snapshot(),before);
  await db.exec(`drop trigger qa_fail_create on public.${table};drop function public.qa_fail_create();`);
  const result=await save(f);assert.equal(result.ok,true); // Same exact key is usable after rollback; no pending marker survived.
 });
}
await test("lost success response and changed display fallback replay one exact receipt",async()=>{
 const f=await fixture(),before=await snapshot();
 await db.exec("set role service_role");const first=await save(f);await db.exec("reset role");const committed=await snapshot();
 const replay=await save(f,{fallback:"Changed account display"});
 assert.equal(replay.ok,true);assert.equal(replay.alreadyCreated,true);assert.equal(replay.qrCode,first.qrCode);
 assert.deepEqual(await snapshot(),committed);assert.equal(committed.guitars.length,before.guitars.length+1);
 assert.equal(committed.site_content.filter(x=>x.content_key.startsWith("create_submission:")).length,0);
 assert.equal(committed.profiles.find(x=>x.id===owner).created_at,before.profiles.find(x=>x.id===owner).created_at);
});
await test("same key with changed body fails without another profile",async()=>{
 const f=await fixture();await save(f);const before=await snapshot();f.payload.guitar.name="Changed";
 await assert.rejects(save(f),e=>e.code==="QG004");assert.deepEqual(await snapshot(),before);
});
await test("same upload session with new key replays instead of duplicating a no-serial Profile",async()=>{
 const f=await fixture();const original=await save(f),before=await snapshot();f.key="another-request-key";
 const replay=await save(f);assert.equal(replay.qrCode,original.qrCode);assert.deepEqual(await snapshot(),before);
});
await test("foreign staged paths are rejected with no write",async()=>{
 const f=await fixture(),before=await snapshot();
 await assert.rejects(save(f,{actor:other}),e=>e.code==="42501");assert.deepEqual(await snapshot(),before);
});
await test("a missing or invalid uploaded object rejects with no write",async()=>{
 const f=await fixture(),before=await snapshot();
 await db.query("delete from storage.objects where name=$1",[f.payload.media[0].storage_path]);
 await assert.rejects(save(f),e=>e.code==="QG005");assert.deepEqual(await snapshot(),before);
});
await test("traversal in a staged object name is rejected even when object exists",async()=>{
 const f=await fixture(),before=await snapshot();const bad=f.payload.media[0].storage_path.replace("image-01-test","image-../test");
 f.payload.media[0].storage_path=bad;f.payload.guitar.hero_image_path=bad;
 await db.query("insert into storage.objects(bucket_id,name,metadata)values('instrument-media',$1,'{\"size\":100,\"mimetype\":\"image/jpeg\"}')",[bad]);
 await assert.rejects(save(f),e=>e.code==="42501");assert.deepEqual(await snapshot(),before);
});
await test("duplicate serial rejects transactionally",async()=>{
 const a=await fixture("UNIQUE12345");await save(a);const b=await fixture("unique-12345"),before=await snapshot();
 await assert.rejects(save(b),e=>e.code==="QG002");assert.deepEqual(await snapshot(),before);
});
await test("legacy empty pending never expires or silently deletes evidence",async()=>{
 const f=await fixture();
 await db.query("insert into public.site_content(content_key,content_value)values($1,$2::jsonb)",["create_submission:"+owner+":"+f.key,JSON.stringify({status:"pending",uploadId:f.upload,startedAt:"2000-01-01"})]);
 const before=await snapshot();await assert.rejects(save(f),e=>e.code==="QG003");assert.deepEqual(await snapshot(),before);
});
await test("legacy fully committed pending reconciles only matching relational state",async()=>{
 const f=await fixture("LEGACY123");const original=await save(f);
 // Model the historical crash after publication but before a completion receipt.
 await db.query("delete from public.instrument_create_receipts where owner_id=$1 and idempotency_key=$2",[owner,f.key]);
 await db.query("insert into public.site_content(content_key,content_value)values($1,$2::jsonb)",["create_submission:"+owner+":"+f.key,JSON.stringify({status:"pending",uploadId:f.upload,startedAt:"2000-01-01"})]);
 const before=await snapshot(),result=await save(f),after=await snapshot();
 assert.equal(result.qrCode,original.qrCode);assert.equal(result.alreadyCreated,true);assert.deepEqual(after.guitars,before.guitars);
 assert.equal(after.site_content.find(x=>x.content_key==="create_submission:"+owner+":"+f.key).content_value.status,"complete");
});
await test("legacy partially saved profile is preserved and requires review",async()=>{
 const f=await fixture();const original=await save(f);
 await db.query("delete from public.instrument_create_receipts where owner_id=$1 and idempotency_key=$2",[owner,f.key]);
 await db.query("delete from public.guitar_specs where guitar_id=(select id from public.guitars where qr_code=$1)",[original.qrCode]);
 await db.query("insert into public.site_content(content_key,content_value)values($1,$2::jsonb)",["create_submission:"+owner+":"+f.key,JSON.stringify({status:"pending",uploadId:f.upload,startedAt:"2000-01-01"})]);
 const before=await snapshot();await assert.rejects(save(f),e=>e.code==="QG003");assert.deepEqual(await snapshot(),before);
});
await test("free plan limit is read and enforced under owner lock; receipt replay still succeeds",async()=>{
 const f=await fixture();const original=await save(f);
 const count=(await db.query("select count(*)::integer as count from public.guitars where owner_id=$1",[owner])).rows[0].count;
 for(let i=count;i<25;i++)await db.query("insert into public.guitars(owner_id,qr_code,permanent_path,name,brand)values($1,$2,$3,'Limit fixture','Test')",[owner,"QRG-LIMIT"+i,"/i/QRG-LIMIT"+i]);
 const next=await fixture(),before=await snapshot();await assert.rejects(save(next),e=>e.code==="QG001");assert.deepEqual(await snapshot(),before);
 assert.equal((await save(f)).qrCode,original.qrCode);assert.equal((await save(next,{expanded:true})).ok,true);
});
console.log("Completed "+passed+" atomic create PostgreSQL tests.");
await db.close();

