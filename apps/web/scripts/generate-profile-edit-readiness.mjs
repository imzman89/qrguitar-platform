// Additive .10: preserve the complete .9 payment contract and bind the
// direct-to-Storage Profile edit upload functions and consumption triggers.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {PGlite} from '@electric-sql/pglite';
import {installRepositorySchema} from './security/postgres-fixture.mjs';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const normalize=value=>value.replaceAll('\r\n','\n');
const sha=value=>createHash('sha256').update(normalize(value)).digest('hex');
const read=relative=>normalize(fs.readFileSync(path.join(repo,relative),'utf8'));
const previousPath='supabase/migrations/20260918134000_release_readiness.sql';
const profileEditPath='supabase/migrations/20260918150000_profile_edit_staged_uploads.sql';
const outputPath='supabase/migrations/20260918160000_release_readiness.sql';
const previous=read(previousPath);
assert.equal(
  sha(previous),
  'e969e7ec9cb828294e85cb7c7e05feb8423dcb1c7500ab6f822d8c84f0bde0d4',
  'Historical .9 changed; review before generation.'
);
const embedded=previous.match(/\$manifest\$([\s\S]*?)\$manifest\$/);
assert.ok(embedded,'Historical .9 manifest is missing.');
const manifest=JSON.parse(embedded[1]);
assert.equal(manifest.releaseVersion,'2026-09-17.9');
const historical=structuredClone(manifest);
const profileEditSource=read(profileEditPath);
assert.equal(
  sha(profileEditSource),
  'f1d0ba57a3d19ceaef9f6ec216d31158267792cec19b85f48beee965b44dcee1',
  'Profile edit upload migration changed; review before repinning.'
);

const profileEditNames=[
  'cleanup_staged_instrument_edit_uploads',
  'consume_staged_instrument_edit_upload',
  'register_staged_instrument_edit_upload'
];
const serviceNames=new Set([
  'cleanup_staged_instrument_edit_uploads',
  'register_staged_instrument_edit_upload'
]);
const blockedNames=new Set(['consume_staged_instrument_edit_upload']);
const db=new PGlite();

try{
  // Load through .9, then apply the exact source whose hash is recorded in
  // the generated contract.
  await installRepositorySchema(db,repo,'20260918150000');
  await db.exec(profileEditSource);

  const functions=(await db.query(`
    select 'public.'||p.oid::regprocedure::text signature,p.proname,p.prosecdef,p.provolatile,p.proconfig,
      pg_get_function_arguments(p.oid) arguments,pg_get_function_result(p.oid) result,
      encode(sha256(convert_to(replace(p.prosrc,chr(13)||chr(10),chr(10)),'UTF8')),'hex') source_hash,
      pg_get_userbyid(p.proowner) owner,
      has_function_privilege('service_role',p.oid,'EXECUTE') service_execute,
      has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,
      has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute,
      exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        where a.grantee=0 and a.privilege_type='EXECUTE') public_execute,
      array(select coalesce(pg_get_userbyid(a.grantee),'PUBLIC')
        from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        where a.privilege_type='EXECUTE' and a.grantee<>p.proowner
        order by coalesce(pg_get_userbyid(a.grantee),'PUBLIC')) execute_grantees
    from pg_proc p
    where p.pronamespace='public'::regnamespace and p.proname=any($1)
    order by p.proname,p.oid::regprocedure::text
  `,[profileEditNames])).rows;
  assert.equal(functions.length,3,'Expected exactly three reviewed Profile edit upload functions.');
  assert.deepEqual(functions.map(item=>item.proname),profileEditNames);
  assert.ok(functions.every(item=>item.prosecdef),'Every Profile edit upload function must remain SECURITY DEFINER.');
  assert.ok(functions.every(item=>!['anon','authenticated','service_role'].includes(item.owner)),'API roles cannot own Profile edit upload functions.');
  for(const item of functions){
    assert.equal(item.anon_execute,false,item.signature+' cannot be executable by anon.');
    assert.equal(item.authenticated_execute,false,item.signature+' cannot be executable by authenticated.');
    assert.equal(item.public_execute,false,item.signature+' cannot be executable by PUBLIC.');
    assert.equal(item.service_execute,serviceNames.has(item.proname),item.signature+' has the wrong service-role ACL.');
    assert.deepEqual(item.execute_grantees,serviceNames.has(item.proname)?['service_role']:[],item.signature+' has an unreviewed direct grantee.');
    assert.ok(serviceNames.has(item.proname)||blockedNames.has(item.proname),'Every Profile edit upload function needs an explicit ACL class.');
  }

  const signatures=new Set(functions.map(item=>item.signature));
  const allowed=functions.filter(item=>serviceNames.has(item.proname)).map(item=>item.signature);
  const blocked=functions.filter(item=>blockedNames.has(item.proname)).map(item=>item.signature);
  assert.equal(allowed.length,2);
  assert.equal(blocked.length,1);
  manifest.releaseVersion='2026-09-17.10';
  manifest.serviceFunctions=[...historical.serviceFunctions.filter(signature=>!signatures.has(signature)),...allowed];
  manifest.blockedFunctions=[...historical.blockedFunctions.filter(signature=>!signatures.has(signature)),...blocked];
  manifest.fingerprints=[
    ...historical.fingerprints.filter(item=>!signatures.has(item.signature)),
    ...functions.map(item=>({
      signature:item.signature,
      source_hash:item.source_hash,
      arguments:item.arguments,
      result:item.result,
      definer:item.prosecdef,
      volatility:item.provolatile,
      settings:item.proconfig
    }))
  ];
  manifest.profileEditUploadFunctionSignatures=functions.map(item=>item.signature);
  manifest.profileEditUploadSourceSha256=sha(profileEditSource);

  const triggerNames=[
    'consume_staged_instrument_edit_document',
    'consume_staged_instrument_edit_media'
  ];
  const triggers=(await db.query(`
    select c.relname as table,t.tgname as name,pg_get_triggerdef(t.oid) definition,
      'public.'||t.tgfoid::regprocedure::text function_signature
    from pg_trigger t join pg_class c on c.oid=t.tgrelid
    where c.relnamespace='public'::regnamespace and t.tgname=any($1) and not t.tgisinternal
    order by c.relname,t.tgname
  `,[triggerNames])).rows;
  assert.equal(triggers.length,2,'Both Profile edit consumption triggers are required.');
  assert.deepEqual(triggers.map(item=>({table:item.table,name:item.name,function_signature:item.function_signature})),[
    {table:'guitar_documents',name:'consume_staged_instrument_edit_document',function_signature:'public.consume_staged_instrument_edit_upload()'},
    {table:'guitar_media',name:'consume_staged_instrument_edit_media',function_signature:'public.consume_staged_instrument_edit_upload()'}
  ],'Profile edit consumption triggers must remain mapped to the correct tables.');
  const triggerNameSet=new Set(triggerNames);
  manifest.provenanceTriggers=[
    ...historical.provenanceTriggers.filter(([,name])=>!triggerNameSet.has(name)),
    ...triggers.map(item=>[item.table,item.name,item.definition])
  ];

  // .10 is additive: all reviewed .9 objects must stay byte-for-byte intact.
  for(const item of historical.fingerprints){
    assert.deepEqual(manifest.fingerprints.find(entry=>entry.signature===item.signature),item,'Historical fingerprint changed: '+item.signature);
  }
  assert.deepEqual(manifest.checks,historical.checks);
  assert.deepEqual(manifest.rpcOnlyTables,historical.rpcOnlyTables);
  assert.deepEqual(manifest.billingConstraints,historical.billingConstraints);
  assert.deepEqual(manifest.billingIndexes,historical.billingIndexes);

  const previousHeader='-- Release 2026-09-17.9: all prior contracts plus the durable PayPal webhook and scheduler gate.';
  const currentHeader='-- Release 2026-09-17.10: all prior contracts plus direct Profile edit upload consumption.';
  const needle="  for signature in select jsonb_array_elements_text(manifest->'serviceFunctions') loop";
  const overloadGuard=`  -- Profile edit staging is limited to reviewed signatures and trusted function owners.
  for p in select oid,proowner from pg_proc where pronamespace='public'::regnamespace
    and proname in ('register_staged_instrument_edit_upload','cleanup_staged_instrument_edit_uploads','consume_staged_instrument_edit_upload') loop
    if not ((manifest->'profileEditUploadFunctionSignatures') ? ('public.'||p.oid::regprocedure::text))
      or pg_get_userbyid(p.proowner) in ('anon','authenticated','service_role')
      or exists(select 1 from pg_proc f
        cross join lateral aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a
        where f.oid=p.oid and a.privilege_type='EXECUTE' and a.grantee<>f.proowner
          and (not ((manifest->'serviceFunctions') ? ('public.'||p.oid::regprocedure::text))
            or coalesce(pg_get_userbyid(a.grantee),'')<>'service_role')) then
      flags:=jsonb_set(flags,'{function_security}','false');
    end if;
  end loop;
`;
  assert.equal(previous.split(previousHeader).length,2,'Historical release header changed; review before generation.');
  assert.equal(previous.split(needle).length,2,'Historical service-function insertion point changed; review before generation.');
  const generated=previous
    .replace(embedded[0],()=>'$manifest$'+JSON.stringify(manifest)+'$manifest$')
    .replace(previousHeader,currentHeader)
    .replaceAll('2026-09-17.9','2026-09-17.10')
    .replace(needle,overloadGuard+needle);

  await db.exec(generated);
  await db.exec("insert into storage.buckets(id,name,public) values('instrument-media','instrument-media',false),('instrument-documents','instrument-documents',false),('service-evidence','service-evidence',false) on conflict(id) do update set public=false;begin read only;set local role service_role");
  const ready=(await db.query('select qrguitar_release_readiness() value')).rows[0].value;
  await db.exec('rollback');
  assert.equal(ready.ready,true,JSON.stringify(ready));
  assert.equal(ready.releaseVersion,'2026-09-17.10');
  assert.equal(ready.checks.length,14);
  assert.ok(ready.checks.every(check=>check.ok));

  const files=[
    [outputPath,generated],
    ['apps/web/scripts/release-readiness-manifest.json',JSON.stringify(manifest,null,2)+'\n']
  ];
  for(const [relative,content] of files){
    const target=path.join(repo,relative);
    if(process.argv.includes('--write')) fs.writeFileSync(target,content);
    else assert.equal(normalize(fs.readFileSync(target,'utf8')),content,'Generated artifact drift: '+relative);
    console.log(sha(content)+'  '+relative);
  }
  console.log(`Readiness .10 binds ${functions.length} Profile edit upload functions and ${triggers.length} consumption triggers; all ${manifest.checks.length} checks pass.`);
}finally{
  await db.close();
}
