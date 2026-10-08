import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
let stage='install';
process.on('uncaughtException',e=>{console.error(JSON.stringify({stage,message:e.message,code:e.code,position:e.position,where:e.where,internalPosition:e.internalPosition,actual:e.actual,expected:e.expected}));process.exit(1);});
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..'),req=createRequire(root+'/package.json'),{PGlite}=req('@electric-sql/pglite');
const {installRepositorySchema}=await import(pathToFileURL(root+'/apps/web/scripts/security/postgres-fixture.mjs'));
const db=new PGlite(),migration=fs.readFileSync(root+'/supabase/migrations/20261007010000_free_instrument_profiles.sql','utf8'),readiness=fs.readFileSync(root+'/supabase/migrations/20261007011000_free_profiles_readiness.sql','utf8');
let passed=0;
async function test(name,run){await run();passed++;console.log('PASS '+name);}
async function rpc(name,args,role='service_role'){await db.exec('begin;set local role '+role);try{const r=(await db.query('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') value',args)).rows[0].value;await db.exec('commit');return r;}catch(e){await db.exec('rollback');throw e;}}
async function rows(){const names=(await db.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows.map(r=>r.tablename),out={};for(const n of names)out[n]=(await db.query(`select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]'::jsonb) value from public."${n}" r`)).rows[0].value;return out;}
let sequence=0;
async function owner(plan,count){const id='73300000-0000-4000-8000-'+String(++sequence).padStart(12,'0');await db.query('insert into auth.users(id)values($1)',[id]);await db.query("insert into public.profiles(id,plan,display_name)values($1,$2,'Free-policy fixture')",[id,plan]);for(let i=0;i<count;i++)await db.query("insert into public.guitars(owner_id,qr_code,permanent_path,name,brand)values($1,$2,$3,'Existing','Fixture')",[id,`QRG-FREE-${sequence}-${i}`,`/i/QRG-FREE-${sequence}-${i}`]);return id;}
async function staged(id){const n=++sequence,upload='free-profile-upload-'+n,key='free-profile-create-'+n,photo=id+'/profile-uploads/'+upload+'/image-01-fixture.jpg';await db.query("insert into storage.objects(bucket_id,name,metadata)values('instrument-media',$1,'{\"size\":100,\"mimetype\":\"image/jpeg\"}')",[photo]);await rpc('register_staged_instrument_upload',[id,upload,'instrument-media',photo]);return{id,upload,key,payload:{guitar:{name:'Free-policy fixture',brand:'Fixture',model:'Model',serial_number:null,visibility:'private',hero_image_path:photo},media:[{storage_path:photo,alt:'Fixture',sort_order:0}],documents:[],specs:[],service:null,show_serial_public:false,owner_name:''}};}
const create=f=>rpc('create_instrument_profile',[f.id,f.key,f.upload,f.payload,false,null,'live']);
const definition=async()=>(await db.query("select pg_get_functiondef('public.create_instrument_profile_credited(uuid,text,text,jsonb,boolean,text,text)'::regprocedure) value")).rows[0].value;
try{
 await installRepositorySchema(db,root,'20261006231000');
 await db.exec("insert into storage.buckets(id,name,public)values('instrument-media','instrument-media',false),('instrument-documents','instrument-documents',false),('service-evidence','service-evidence',false)on conflict(id)do update set public=false");
 await db.exec('alter default privileges grant execute on functions to anon,authenticated,service_role');
 for(const name of fs.readdirSync(root+'/supabase/migrations').filter(n=>n>='20261006231000'&&n<'20261007010000'&&n.endsWith('.sql')).sort()){stage=name;await db.exec(fs.readFileSync(root+'/supabase/migrations/'+name,'utf8'));}
 await db.exec("insert into storage.buckets(id,name,public)values('instrument-media','instrument-media',false),('instrument-documents','instrument-documents',false),('service-evidence','service-evidence',false)on conflict(id)do update set public=false");
 const oldDefinition=await definition(),before=await rows();
 await test('free policy migration preserves every existing row and payment ledger',async()=>{stage='free migration';await db.exec(migration);assert.deepEqual(await rows(),before);});
 const newDefinition=await definition();
 await test('migration exact retry is a no-op',async()=>{await db.exec(migration);assert.equal(await definition(),newDefinition);assert.deepEqual(await rows(),before);});
 await test('readiness retains all fourteen security checks',async()=>{await db.exec(readiness);const r=(await db.query('select public.qrguitar_release_readiness() value')).rows[0].value;assert.equal(r.ready,true);assert.equal(r.releaseVersion,'2026-10-06.1');assert.equal(r.checks.length,14);await db.exec(readiness);});
 for(const[plan,count]of [['single',5],['pack_25',25],['business',100]])await test(plan+' can create beyond former limits without consuming a paid credit',async()=>{const id=await owner(plan,count),f=await staged(id),ledger=await rows();const r=await create(f);assert.ok(r.guitarId||r.guitar_id||r.id||r.qrCode);assert.equal((await db.query('select count(*)::int n from guitars where owner_id=$1',[id])).rows[0].n,count+1);assert.deepEqual((await rows()).billing_credit_consumptions,ledger.billing_credit_consumptions);});
 const id=await owner('single',30),f=await staged(id);let saved;
 await test('identical retries retain one permanent identity',async()=>{saved=await create(f);const again=await create(f);assert.equal(again.guitarId,saved.guitarId);assert.equal(again.qrCode,saved.qrCode);assert.equal((await db.query('select count(*)::int n from guitars where owner_id=$1',[id])).rows[0].n,31);});
 await test('same request key cannot create changed instrument details',async()=>{await assert.rejects(()=>create({...f,payload:{...f.payload,guitar:{...f.payload.guitar,model:'Changed'}}}),e=>e.code==='QG004');});
 await test('anonymous and signed-in clients still cannot call server creation directly',async()=>{const fresh=await staged(id);for(const role of ['anon','authenticated'])await assert.rejects(()=>rpc('create_instrument_profile',[fresh.id,fresh.key,fresh.upload,fresh.payload,false,null,'live'],role),e=>e.code==='42501');});
 await test('another owner cannot reuse staged media',async()=>{const other=await owner('single',0),fresh=await staged(id);await assert.rejects(()=>create({...fresh,id:other}),e=>e.code==='42501');});
 await test('baseline negative control requires a paid credit beyond the old cap',async()=>{const fresh=await staged(id);await db.exec(oldDefinition);await assert.rejects(()=>create(fresh),e=>e.code==='QG001');await db.exec(newDefinition);await create(fresh);});
 await test('creation never grants verification or authenticity',async()=>{const row=(await db.query('select to_jsonb(g) value from guitars g where owner_id=$1 order by created_at desc limit 1',[id])).rows[0].value;assert.equal(row.status,'unverified');assert.doesNotMatch(JSON.stringify(row),/"authenticity(?:Status|_status)":"confirmed"/);});
 await test('readiness detects reopened private helper permission',async()=>{await db.exec('grant execute on function public.create_instrument_profile_credited(uuid,text,text,jsonb,boolean,text,text) to anon');assert.equal((await db.query('select public.qrguitar_release_readiness() value')).rows[0].value.ready,false);await db.exec('revoke execute on function public.create_instrument_profile_credited(uuid,text,text,jsonb,boolean,text,text) from anon');assert.equal((await db.query('select public.qrguitar_release_readiness() value')).rows[0].value.ready,true);});
 console.log(JSON.stringify({passed,scope:'Actual repository PostgreSQL semantics; isolated in-memory fixture; no customer database mutations'}));
}finally{await db.close();}
