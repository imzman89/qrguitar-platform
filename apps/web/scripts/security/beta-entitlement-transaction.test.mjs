import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
const repo=path.resolve(process.env.QRGUITAR_REPO || process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)),'../../../..'));
const {PGlite}=createRequire(path.join(repo,'apps/web/package.json'))('@electric-sql/pglite');
const {installRepositorySchema}=await import(pathToFileURL(path.join(repo,'apps/web/scripts/security/postgres-fixture.mjs')).href);
process.on('uncaughtException',e=>{console.error({message:e.message,code:e.code,where:e.where});process.exit(1);});
const db=new PGlite();
let n=0,passed=0;
async function test(name,fn){await fn();console.log('PASS '+name);passed++;}
async function owner(plan,count=5){
 n++;const id='70000000-0000-4000-8000-'+String(n).padStart(12,'0');
 await db.query('insert into auth.users(id)values($1)',[id]);
 await db.query('insert into profiles(id,plan,purchased_code_count,remaining_code_count)values($1,$2,73,5)',[id,plan]);
 for(let i=0;i<count;i++)await db.query("insert into guitars(owner_id,qr_code,permanent_path,name,brand)values($1,$2,$3,'Existing','Fixture')",[id,'QRG-BETA-'+n+'-'+i,'/i/QRG-BETA-'+n+'-'+i]);
 return id;
}
async function staged(id){
 n++;const upload='beta-upload-session-'+n,key='beta-request-key-'+n,photo=id+'/profile-uploads/'+upload+'/image-01-fixture.jpg';
 await db.query("insert into storage.objects(bucket_id,name,metadata)values('instrument-media',$1,'{\"size\":10,\"mimetype\":\"image/jpeg\"}')",[photo]);
 await db.query("select register_staged_instrument_upload($1,$2,'instrument-media',$3)",[id,upload,photo]);
 return{id,upload,key,payload:{guitar:{name:'Beta fixture',brand:'Fixture',model:'Model',serial_number:null,visibility:'private',hero_image_path:photo},media:[{storage_path:photo,alt:'Fixture',sort_order:0}],documents:[],specs:[],service:null,show_serial_public:false,owner_name:''}};
}
async function create(f,launch=false){
 await db.exec('set role service_role');
 try{return(await db.query('select create_instrument_profile($1,$2,$3,$4::jsonb,$5,null)as result',[f.id,f.key,f.upload,JSON.stringify(f.payload),launch])).rows[0].result;}
 finally{await db.exec('reset role');}
}
async function snapshot(){const result={};for(const t of ['profiles','guitars','guitar_media','guitar_documents','guitar_specs','guitar_timeline_events','guitar_serial_aliases','site_content','instrument_create_receipts','instrument_staged_uploads','billing_credit_grants','billing_credit_consumptions'])result[t]=(await db.query(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb)as rows from public.${t} t`)).rows[0].rows;return result;}
try{
 await installRepositorySchema(db,repo);
 await db.exec("alter table storage.objects add column if not exists metadata jsonb; insert into storage.buckets(id,name,public)values('instrument-media','instrument-media',false),('instrument-documents','instrument-documents',false)on conflict(id)do nothing;");
 // Exercise the current complete schema. Reapplying the historical beta-quota
 // migration here would bypass the reviewed billing wrapper and its ledger.
 for(const plan of ['single','pack_10','pack_25','bulk_50'])await test(plan+' at beta limit cannot create and leaves every row pristine',async()=>{const f=await staged(await owner(plan)),before=await snapshot();await assert.rejects(create(f),e=>e.code==='QG001');assert.deepEqual(await snapshot(),before);});
 for(const plan of ['business','enterprise'])await test(plan+' retains approved commercial access and counters',async()=>{const id=await owner(plan),f=await staged(id),before=(await db.query('select to_jsonb(p)as p from profiles p where id=$1',[id])).rows[0].p;assert.equal((await create(f)).ok,true);assert.deepEqual((await db.query('select to_jsonb(p)as p from profiles p where id=$1',[id])).rows[0].p,before);});
 for(const plan of ['single','pack_25'])await test(plan+' retains explicit server launch exception',async()=>{assert.equal((await create(await staged(await owner(plan)),true)).ok,true);});
 await test('paid label at four creates the fifth once; replay consumes no credits; sixth request needs a real credit',async()=>{const id=await owner('pack_10',4),f=await staged(id);const result=await create(f),before=await snapshot();assert.equal(result.ok,true);assert.equal((await create(f)).qrCode,result.qrCode);assert.deepEqual(await snapshot(),before);const g=await staged(id),stagedBefore=await snapshot();await assert.rejects(create(g),e=>e.code==='QG001');assert.deepEqual(await snapshot(),stagedBefore);const p=(await db.query('select purchased_code_count,remaining_code_count from profiles where id=$1',[id])).rows[0];assert.deepEqual(p,{purchased_code_count:73,remaining_code_count:5});});
 await test('existing account above five retains every Profile and credit history when another create is declined',async()=>{const id=await owner('single',25),f=await staged(id),before=await snapshot();await assert.rejects(create(f),e=>e.code==='QG001');assert.deepEqual(await snapshot(),before);const status=(await db.query("select billing_account_status($1,'live') as result",[id])).rows[0].result;assert.equal(status.freeLimit,5);assert.equal(status.ownedProfiles,25);assert.equal(status.freeRemaining,0);assert.equal(status.paidConsumed,0);});
 await test('commercial and launch exceptions never override banned account',async()=>{const id=await owner('business'),f=await staged(id);await db.query("update profiles set account_status='banned' where id=$1",[id]);const before=await snapshot();await assert.rejects(create(f,true),e=>e.code==='42501');assert.deepEqual(await snapshot(),before);});
 await test('service can use registered wrapper; nobody can call unsafe backing routine',async()=>{const rows=(await db.query("select r,has_function_privilege(r,'public.create_instrument_profile(uuid,text,text,jsonb,boolean,text)','EXECUTE')as allowed,has_function_privilege(r,'public.create_instrument_profile_unregistered(uuid,text,text,jsonb,boolean,text)','EXECUTE')as unsafe from unnest(array['anon','authenticated','service_role'])r")).rows;assert.deepEqual(rows.map(r=>[r.r,r.allowed,r.unsafe]),[['anon',false,false],['authenticated',false,false],['service_role',true,false]]);});
 console.log('Completed '+passed+' beta entitlement PostgreSQL tests.');
}finally{await db.close();}
