import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { installRepositorySchema } from './security/postgres-fixture.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const require=createRequire(root+'/apps/web/package.json'),{PGlite}=require('@electric-sql/pglite');
const migration=fs.readFileSync(root+'/supabase/migrations/20261007022000_workspace_signup.sql','utf8');
const db=new PGlite();let passed=0,sequence=0,stage='repository fixture';
async function test(name,run){stage=name;await run();passed++;console.log('PASS '+name);}
const nextId=()=>`77400000-0000-4000-8000-${String(++sequence).padStart(12,'0')}`;
async function signup(metadata,id=nextId()){await db.query('insert into auth.users(id,raw_user_meta_data)values($1,$2)',[id,metadata]);return id;}
async function profile(id){return (await db.query('select to_jsonb(p) as value from public.profiles p where id=$1',[id])).rows[0]?.value;}
async function settings(id){return (await db.query('select content_value as value from public.site_content where content_key=$1',['public_collection_owner:'+id])).rows[0]?.value;}
async function counts(){return (await db.query('select (select count(*) from auth.users)::int as users,(select count(*) from public.profiles)::int as profiles,(select count(*) from public.site_content)::int as content')).rows[0];}
try{
  // Match the existing free-Profile fixture's Supabase bucket/default-grant
  // scaffold before the actual later readiness migrations inspect it.
  await installRepositorySchema(db,root,'20261006231000');
  await db.exec("insert into storage.buckets(id,name,public)values('instrument-media','instrument-media',false),('instrument-documents','instrument-documents',false),('service-evidence','service-evidence',false)on conflict(id)do update set public=false;");
  await db.exec('alter default privileges grant execute on functions to anon,authenticated,service_role;');
  for(const name of fs.readdirSync(root+'/supabase/migrations').filter(n=>n>='20261006231000'&&n<'20261007022000'&&n.endsWith('.sql')).sort()){
    stage=name;await db.exec(fs.readFileSync(root+'/supabase/migrations/'+name,'utf8'));
  }
  await db.exec("alter table auth.users add column raw_user_meta_data jsonb,add column email_confirmed_at timestamptz;");
  const initial=await counts();await db.exec(migration);assert.deepEqual(await counts(),initial);

  for(const role of ['player','collector','shop','builder','luthier','other'])await test('new signup stores private workspace '+role,async()=>{
    const id=await signup({display_name:'My instrument account',qrguitar_workspace_type:role}),p=await profile(id),s=await settings(id);
    assert.equal(p.role,'owner');assert.equal(p.plan,'single');assert.equal(p.account_status,'active');assert.equal(p.account_settings_version,0);assert.equal(p.purchased_code_count,0);assert.equal(p.remaining_code_count,0);assert.equal(p.business_branding_enabled,false);assert.equal(p.bulk_handoff_enabled,false);
    assert.equal(p.display_name,'My instrument account');assert.equal(s.accountType,role);assert.equal(s.publicName,p.display_name);assert.equal(s.ownerId,id);assert.equal(s.enabled,false);assert.equal(s.handle,'');assert.equal(s.allowMessages,false);assert.equal(s.allowWarrantyHelp,false);assert.equal(s.warrantyHelpUrl,'');assert.equal(s.avatarUrl,'');
    assert.equal((await db.query("select count(*)::int as n from public.site_content where content_key like 'public_collection_handle:%' and content_value->>'ownerId'=$1",[id])).rows[0].n,0);
  });
  await test('supplied privilege, billing, identity and publication fields cannot alter defaults',async()=>{
    const id=await signup({display_name:'Unprivileged signup',qrguitar_workspace_type:'shop',role:'admin',plan:'enterprise',ownerId:'other-user',business_branding_enabled:true,bulk_handoff_enabled:true,remaining_code_count:999,enabled:true,handle:'forged',allowMessages:true,allowWarrantyHelp:true,verified:true}),p=await profile(id),s=await settings(id);
    assert.equal(p.role,'owner');assert.equal(p.plan,'single');assert.equal(p.remaining_code_count,0);assert.equal(p.business_branding_enabled,false);assert.equal(p.bulk_handoff_enabled,false);assert.equal(s.ownerId,id);assert.equal(s.enabled,false);assert.equal(s.handle,'');assert.equal(s.allowMessages,false);assert.equal(s.allowWarrantyHelp,false);
  });
  for(const metadata of [null,{},[],{display_name:'Legacy buyer'},{display_name:'Invalid',qrguitar_workspace_type:'admin'},{display_name:'Invalid',qrguitar_workspace_type:'brand'},{display_name:'Invalid',qrguitar_workspace_type:' shop '},{display_name:'Invalid',qrguitar_workspace_type:5},{display_name:'Invalid',qrguitar_workspace_type:{value:'shop'}},{display_name:[],qrguitar_workspace_type:'shop'}])await test('legacy or malformed metadata is ignored '+(++sequence),async()=>{
    const before=await counts(),id=await signup(metadata);assert.equal(await profile(id),undefined);assert.equal(await settings(id),undefined);assert.deepEqual(await counts(),{...before,users:before.users+1});
  });
  await test('business names normalize spaces and keep at most eighty characters',async()=>{
    const id=await signup({display_name:'\t  Cranston\n  Guitars  \t',qrguitar_workspace_type:'shop'});assert.equal((await profile(id)).display_name,'Cranston Guitars');assert.equal((await settings(id)).publicName,'Cranston Guitars');
    const long=await signup({display_name:'é'.repeat(100),qrguitar_workspace_type:'builder'});assert.equal((await settings(long)).publicName,'é'.repeat(80));
    const short=await signup({display_name:'🎸',qrguitar_workspace_type:'collector'});assert.equal(await settings(short),undefined);
  });
  await test('confirmation and subsequent metadata changes never reinitialize saved preferences',async()=>{
    const id=await signup({display_name:'First name',qrguitar_workspace_type:'collector'}),before=await settings(id);
    await db.query('update auth.users set email_confirmed_at=now(),raw_user_meta_data=$2 where id=$1',[id,{display_name:'Changed metadata',qrguitar_workspace_type:'builder',enabled:true}]);
    assert.deepEqual(await settings(id),before);assert.equal((await profile(id)).display_name,'First name');
  });
  await test('existing profile and collection rows are not overwritten by signup initialization',async()=>{
    await db.exec(`create function public.signup_fixture_preseed() returns trigger language plpgsql as $$ begin
      if new.raw_user_meta_data->>'fixturePreseed'='yes' then
        insert into public.profiles(id,display_name,role,plan,remaining_code_count)values(new.id,'Earlier saved name','admin','enterprise',13);
        insert into public.site_content(content_key,content_value,updated_by) values('public_collection_owner:'||new.id::text,jsonb_build_object('enabled',true,'handle','previous','accountType','collector','publicName','Earlier collection','ownerId',new.id,'allowMessages',true),new.id);
      end if;return new;end $$;
      create trigger aaa_signup_fixture_preseed after insert on auth.users for each row execute function public.signup_fixture_preseed();`);
    const id=await signup({display_name:'New proposed name',qrguitar_workspace_type:'builder',fixturePreseed:'yes'}),p=await profile(id),s=await settings(id);
    assert.equal(p.display_name,'Earlier saved name');assert.equal(p.role,'admin');assert.equal(p.plan,'enterprise');assert.equal(p.remaining_code_count,13);assert.equal(s.publicName,'Earlier collection');assert.equal(s.enabled,true);assert.equal(s.accountType,'collector');assert.equal(s.allowMessages,true);assert.equal(s.handle,'previous');
    await db.exec('drop trigger aaa_signup_fixture_preseed on auth.users;drop function public.signup_fixture_preseed();');
  });
  await test('initializer privileges are restricted and search path is fixed',async()=>{
    const p=(await db.query("select prosecdef,proconfig from pg_proc where oid='public.initialize_signup_workspace()'::regprocedure")).rows[0];assert.equal(p.prosecdef,true);assert.deepEqual(p.proconfig,['search_path=pg_catalog, public']);
    for(const role of ['anon','authenticated','service_role'])assert.equal((await db.query("select has_function_privilege($1,'public.initialize_signup_workspace()','EXECUTE') as allowed",[role])).rows[0].allowed,false);
  });
  await test('a database failure atomically rolls back auth, profile and collection insertion',async()=>{
    await db.exec("alter table public.site_content add constraint signup_fixture_failure check(content_value->>'publicName' is distinct from 'ForceFailure');");const before=await counts(),id=nextId();
    await assert.rejects(signup({display_name:'ForceFailure',qrguitar_workspace_type:'shop'},id),e=>e.code==='23514');assert.deepEqual(await counts(),before);assert.equal(await profile(id),undefined);assert.equal(await settings(id),undefined);
    await db.exec('alter table public.site_content drop constraint signup_fixture_failure;');
  });
  await test('migration is definition-only and its DDL rolls back exactly',async()=>{
    await db.exec('drop trigger qrguitar_signup_workspace on auth.users;drop function public.initialize_signup_workspace();');const before=await counts();
    const transactionBody=migration.replace(/^begin;\s*/,'').replace(/\s*commit;\s*$/,'');await db.exec('begin;');await db.exec(transactionBody);await db.exec('rollback;');
    assert.equal((await db.query("select to_regprocedure('public.initialize_signup_workspace()')::text as value")).rows[0].value,null);assert.equal((await db.query("select count(*)::int as n from pg_trigger where tgname='qrguitar_signup_workspace'")).rows[0].n,0);assert.deepEqual(await counts(),before);
  });
  await test('unreviewed existing auth INSERT hooks fail installation before new definitions',async()=>{
    await db.exec('create function public.signup_fixture_other_hook()returns trigger language plpgsql as $$begin return new;end $$;create trigger signup_fixture_other_hook after insert on auth.users for each row execute function public.signup_fixture_other_hook();');
    await assert.rejects(db.exec(migration),/Review existing auth INSERT hooks/);await db.exec('rollback;');assert.equal((await db.query("select to_regprocedure('public.initialize_signup_workspace()')::text as value")).rows[0].value,null);
  });
  console.log(JSON.stringify({passed,failed:0,scope:'Repository PostgreSQL in-memory fixture; no GoTrue/native email confirmation or customer mutations',productionChanged:false}));
}catch(error){console.error(JSON.stringify({stage,message:error.message,code:error.code,where:error.where,actual:error.actual,expected:error.expected}));process.exitCode=1;}finally{await db.close();}
