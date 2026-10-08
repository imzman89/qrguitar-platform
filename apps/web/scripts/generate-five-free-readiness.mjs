// Generate the next readiness contract from the reviewed .13 contract and isolated schema.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {PGlite} from '@electric-sql/pglite-pg17';
import {installRepositorySchema} from './security/postgres-fixture.mjs';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const read=name=>fs.readFileSync(path.join(repo,name),'utf8').replaceAll('\r\n','\n');
const sha=value=>createHash('sha256').update(value).digest('hex');
const previous=read('supabase/migrations/20260919102000_release_readiness.sql');
assert.equal(sha(previous),'a76f894f9c488dc04ae24df9017c678c88bd46d63a13787d4990395a6baafcfd');
const transition=read('supabase/migrations/20260923120000_five_free_profiles.sql');
assert.equal(sha(transition),'54645cd8d9994a574f390bcc358aa1ba51cdd1017b12f87bea565dd2247b498f');
const embedded=previous.match(/\$manifest\$([\s\S]*?)\$manifest\$/);
assert.ok(embedded);
const manifest=JSON.parse(embedded[1]);
assert.equal(manifest.releaseVersion,'2026-09-17.13');
const signatures=new Set([
 'public.billing_account_status(uuid,text)',
 'public.create_instrument_profile_credited(uuid,text,text,jsonb,boolean,text,text)'
]);
const db=new PGlite();
try {
 await installRepositorySchema(db,repo,'20260923120100');
 const functions=(await db.query(`select 'public.'||p.oid::regprocedure::text signature,
   encode(sha256(convert_to(replace(p.prosrc,chr(13)||chr(10),chr(10)),'UTF8')),'hex') source_hash,
   pg_get_function_arguments(p.oid) arguments,pg_get_function_result(p.oid) result,
   p.prosecdef definer,p.provolatile volatility,p.proconfig settings
   from pg_proc p where p.pronamespace='public'::regnamespace
   and p.proname=any($1) order by 1`,[['billing_account_status','create_instrument_profile_credited']])).rows;
 assert.equal(functions.length,2);
 for(const fn of functions){
  assert.ok(signatures.has(fn.signature));
  const index=manifest.fingerprints.findIndex(item=>item.signature===fn.signature);
  assert.ok(index>=0);
  const before=manifest.fingerprints[index];
  assert.notEqual(before.source_hash,fn.source_hash);
  for(const key of ['arguments','result','definer','volatility','settings'])assert.deepEqual(fn[key],before[key],fn.signature+' '+key);
  manifest.fingerprints[index]={...before,source_hash:fn.source_hash};
 }
 manifest.releaseVersion='2026-09-23.1';
 manifest.fiveFreeProfilesSourceSha256=sha(transition);
 let generated=previous.replace(embedded[0],()=>'$manifest$'+JSON.stringify(manifest)+'$manifest$');
 generated=generated.replace('Release 2026-09-17.13: all prior contracts plus 25 free Profiles and stable member conversation pagination.',
   'Release 2026-09-23.1: all prior contracts plus five free owned Profiles.');
 generated=generated.replaceAll('2026-09-17.13','2026-09-23.1');
 await db.exec(generated);
 await db.exec("insert into storage.buckets(id,name,public) values('instrument-media','instrument-media',false),('instrument-documents','instrument-documents',false),('service-evidence','service-evidence',false) on conflict(id) do update set public=false");
 const ready=(await db.query('select public.qrguitar_release_readiness() result')).rows[0].result;
 assert.equal(ready.ready,true,JSON.stringify(ready));
 assert.equal(ready.releaseVersion,'2026-09-23.1');
 // Historical verification only: never rewrite old migrations or the active manifest.
 assert.equal(read('supabase/migrations/20260923121000_release_readiness.sql'),generated);
 assert.deepEqual(JSON.parse(read('apps/web/scripts/release-readiness-manifest-20260923.json')),manifest);
 console.log('Verified historical 2026-09-23.1 five-free contract; not current release acceptance.');
}catch(error){console.error(error.message,error.code);process.exitCode=1;}finally{await db.close();}