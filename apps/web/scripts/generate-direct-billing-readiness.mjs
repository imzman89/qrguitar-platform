// Additive .7: preserve the pinned .6 contract and bind every direct-payment mutation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {PGlite} from '@electric-sql/pglite';
import {installRepositorySchema} from './security/postgres-fixture.mjs';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const normalize=s=>s.replaceAll('\r\n','\n'),sha=s=>createHash('sha256').update(normalize(s)).digest('hex');
const previous=normalize(fs.readFileSync(path.join(repo,'supabase/migrations/20260917221000_release_readiness.sql'),'utf8'));
assert.equal(sha(previous),'07b070b9d5ee436f8764b6f6876be9f06872b7c7f0684816bbc352402b639437','Historical .6 changed; review before generation.');
const embedded=previous.match(/\$manifest\$([\s\S]*?)\$manifest\$/);assert(embedded);
const manifest=JSON.parse(embedded[1]);assert.equal(manifest.releaseVersion,'2026-09-17.6');
const historical=structuredClone(manifest);
const source=normalize(fs.readFileSync(path.join(repo,'supabase/migrations/20260918120000_direct_business_payments.sql'),'utf8'));
const db=new PGlite();
try{
  await installRepositorySchema(db,repo,'20260918120000');await db.exec(source);
  const functions=(await db.query("select 'public.'||oid::regprocedure::text signature,proname,prosecdef,provolatile,proconfig,pg_get_function_arguments(oid) arguments,pg_get_function_result(oid) result,encode(sha256(convert_to(replace(prosrc,chr(13)||chr(10),chr(10)),'UTF8')),'hex') source_hash from pg_proc where pronamespace='public'::regnamespace and (proname like 'billing_direct_%' or proname like '_billing_direct_%' or proname in ('billing_account_status','create_instrument_profile_credited')) order by proname,pronargs")).rows;
  assert.equal(functions.length,14);
  const allowed=functions.filter(f=>f.proname.startsWith('billing_')).map(f=>f.signature);
  const blocked=functions.filter(f=>!allowed.includes(f.signature)).map(f=>f.signature);
  const all=new Set(functions.map(f=>f.signature));
  manifest.releaseVersion='2026-09-17.7';
  manifest.serviceFunctions=[...manifest.serviceFunctions.filter(f=>!all.has(f)),...allowed];
  manifest.blockedFunctions=[...manifest.blockedFunctions.filter(f=>!all.has(f)),...blocked];
  manifest.fingerprints=[...manifest.fingerprints.filter(f=>!all.has(f.signature)),...functions.map(f=>({signature:f.signature,source_hash:f.source_hash,arguments:f.arguments,result:f.result,definer:f.prosecdef,volatility:f.provolatile,settings:f.proconfig}))];
  manifest.directBillingFunctionSignatures=functions.filter(f=>f.proname.includes('billing_direct_')).map(f=>f.signature);
  manifest.directBillingSourceSha256=sha(source);
  const names=['billing_direct_orders','billing_direct_claims','billing_direct_payments'].sort();
  manifest.rpcOnlyTables=[...manifest.rpcOnlyTables,...names];
  const columns=(await db.query("select c.relname as table,a.attname as name,format_type(a.atttypid,a.atttypmod) type,a.attnotnull not_null from pg_attribute a join pg_class c on c.oid=a.attrelid where c.relnamespace='public'::regnamespace and c.relname=any($1) and a.attnum>0 and not a.attisdropped order by c.relname,a.attnum",[names])).rows;
  manifest.columns.push(...columns);
  manifest.billingDefaults.push(...(await db.query("select c.relname as table,a.attname as name,pg_get_expr(d.adbin,d.adrelid) expression from pg_attribute a join pg_class c on c.oid=a.attrelid left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where c.relnamespace='public'::regnamespace and c.relname=any($1) and a.attnum>0 and not a.attisdropped order by c.relname,a.attnum",[names])).rows);
  manifest.billingConstraints.push(...(await db.query("select t.relname as table,c.conname as name,pg_get_constraintdef(c.oid) definition,c.contype::text type from pg_constraint c join pg_class t on t.oid=c.conrelid where t.relnamespace='public'::regnamespace and t.relname=any($1) and c.contype<>'n' order by t.relname,c.conname",[names])).rows);
  manifest.billingIndexes.push(...(await db.query("select t.relname as table,c.relname as name,pg_get_indexdef(i.indexrelid) definition from pg_index i join pg_class c on c.oid=i.indexrelid join pg_class t on t.oid=i.indrelid where t.relnamespace='public'::regnamespace and t.relname=any($1) and i.indisunique order by t.relname,c.relname",[names])).rows);
  const triggers=(await db.query("select c.relname as table,t.tgname as name,pg_get_triggerdef(t.oid) definition from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace and c.relname=any($1) and not t.tgisinternal order by c.relname,t.tgname",[names])).rows;
  assert.equal(triggers.length,3);manifest.provenanceTriggers.push(...triggers.map(t=>[t.table,t.name,t.definition]));
  for(const f of historical.fingerprints.filter(f=>!all.has(f.signature)))assert.deepEqual(manifest.fingerprints.find(g=>g.signature===f.signature),f,'Unrelated fingerprint changed');
  const overloadGuard=`  -- Direct billing is limited to reviewed RPC signatures and trusted function owners.
  for p in select oid,proowner from pg_proc where pronamespace='public'::regnamespace and (proname like 'billing_direct_%' or proname like '_billing_direct_%') loop
    if not ((manifest->'directBillingFunctionSignatures') ? ('public.'||p.oid::regprocedure::text))
      or pg_get_userbyid(p.proowner) in ('anon','authenticated','service_role') then
      flags:=jsonb_set(flags,'{function_security}','false');
    end if;
  end loop;
`;
  const needle="  for signature in select jsonb_array_elements_text(manifest->'serviceFunctions') loop";
  assert.equal(previous.split(needle).length,2);
  const generated=previous.replace(embedded[0],()=>'$manifest$'+JSON.stringify(manifest)+'$manifest$')
    .replaceAll('2026-09-17.6','2026-09-17.7').replace(needle,overloadGuard+needle);
  await db.exec(generated);
  await db.exec("insert into storage.buckets(id,name,public) values('instrument-media','instrument-media',false),('instrument-documents','instrument-documents',false) on conflict(id) do update set public=false;begin read only;set local role service_role");
  const ready=(await db.query('select qrguitar_release_readiness() value')).rows[0].value;
  await db.exec('rollback');assert.equal(ready.ready,true,JSON.stringify(ready));assert.equal(ready.releaseVersion,'2026-09-17.7');
  const files=[['supabase/migrations/20260918121000_release_readiness.sql',generated],['apps/web/scripts/release-readiness-manifest.json',JSON.stringify(manifest,null,2)+'\n']];
  for(const [relative,content] of files){const target=path.join(repo,relative);
    if(process.argv.includes('--write'))fs.writeFileSync(target,content);else assert.equal(normalize(fs.readFileSync(target,'utf8')),content,'Generated artifact drift: '+relative);
    console.log(sha(content)+'  '+relative);
  }
  console.log('Readiness .7 binds 12 direct-payment functions, 3 private tables and five-free credited creation; all 14 checks pass.');
}finally{await db.close();}
