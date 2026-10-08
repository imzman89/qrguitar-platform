// Proposal .5 generator. Never edits historical migrations or uses hosted services.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { fileURLToPath,pathToFileURL } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const option=name=>{const index=process.argv.indexOf(name);return index<0?null:process.argv[index+1];};
const repo=path.resolve(option('--repo')||path.resolve(here,'../../..'));
const output=path.resolve(option('--migration-root')||repo);
const normalized=value=>value.replaceAll('\r\n','\n');
const digest=value=>createHash('sha256').update(value).digest('hex');
const previous=normalized(fs.readFileSync(path.join(repo,'supabase/migrations/20260917201000_release_readiness.sql'),'utf8'));
assert.equal(digest(previous),'aa05d7e7c61bd4052e7f78922e93ebf9af96b3bd18a04aafa8a5b1fb2ac3280e','Historical .4 changed; do not regenerate around source drift.');
const embedded=previous.match(/\$manifest\$([\s\S]*?)\$manifest\$/);assert(embedded);
const manifest=JSON.parse(embedded[1]);assert.equal(manifest.releaseVersion,'2026-09-17.4');
const historicalChecks=[...manifest.checks],historicalFingerprints=structuredClone(manifest.fingerprints);
const sourcePath=path.resolve(option('--upload-sql')||path.join(output,'supabase/migrations/20260917210000_service_evidence_uploads.sql'));
const upload=normalized(fs.readFileSync(sourcePath,'utf8'));
assert.equal(digest(upload),'a24e44c5d96f50caf678eb3f7ff16f6e45ef9b27ae4551e7db3c0351549fe943','Reviewed upload SQL changed; review before changing the pinned input.');
const {PGlite}=createRequire(path.join(repo,'package.json'))('@electric-sql/pglite');
const {installRepositorySchema}=await import(pathToFileURL(path.join(repo,'apps/web/scripts/security/postgres-fixture.mjs')).href);
const db=new PGlite(),savedFetch=globalThis.fetch;
globalThis.fetch=async()=>{throw new Error('External network is forbidden in the readiness generator.');};
try{
  await installRepositorySchema(db,repo,'20260917210000');
  await db.exec('alter table storage.objects add column if not exists metadata jsonb');
  await db.exec(upload);
  const names=['service_evidence_uploads'];
  const functions=(await db.query("select 'public.'||oid::regprocedure::text signature,proname,prosecdef,provolatile,proconfig,pg_get_function_arguments(oid) arguments,pg_get_function_result(oid) result,encode(sha256(convert_to(replace(prosrc,chr(13)||chr(10),chr(10)),'UTF8')),'hex') source_hash from pg_proc where pronamespace='public'::regnamespace and proname like '%service_evidence_upload%' order by proname,pronargs")).rows;
  assert.equal(functions.length,7);
  const allowed=functions.filter(fn=>!fn.proname.startsWith('_')).map(fn=>fn.signature);
  const blocked=functions.filter(fn=>fn.proname.startsWith('_')).map(fn=>fn.signature);
  assert.equal(allowed.length,2);assert.equal(blocked.length,5);
  for(const signature of [...allowed,...blocked])assert(!manifest.fingerprints.some(fn=>fn.signature===signature));
  manifest.releaseVersion='2026-09-17.5';
  manifest.serviceFunctions.push(...allowed);manifest.blockedFunctions.push(...blocked);
  manifest.fingerprints.push(...functions.map(fn=>({signature:fn.signature,source_hash:fn.source_hash,arguments:fn.arguments,result:fn.result,definer:fn.prosecdef,volatility:fn.provolatile,settings:fn.proconfig})));
  manifest.serviceEvidenceTables=names;
  manifest.serviceEvidenceFunctionSignatures=functions.map(fn=>fn.signature);
  manifest.serviceEvidenceSourceSha256=digest(upload);
  manifest.serviceEvidenceBucket={id:'service-evidence',public:false,fileSizeLimit:15728640,allowedMimeTypes:['application/pdf','image/jpeg','image/png','image/webp']};
  const columns=(await db.query("select c.relname as table,a.attname as name,format_type(a.atttypid,a.atttypmod) type,a.attnotnull not_null from pg_attribute a join pg_class c on c.oid=a.attrelid where c.relnamespace='public'::regnamespace and c.relname=any($1) and a.attnum>0 and not a.attisdropped order by c.relname,a.attnum",[names])).rows;
  assert.equal(columns.length,14);manifest.columns.push(...columns);
  manifest.serviceEvidenceDefaults=(await db.query("select c.relname as table,a.attname as name,pg_get_expr(d.adbin,d.adrelid) expression from pg_attribute a join pg_class c on c.oid=a.attrelid left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where c.relnamespace='public'::regnamespace and c.relname=any($1) and a.attnum>0 and not a.attisdropped order by c.relname,a.attnum",[names])).rows;
  // PG17 uses pg_attribute.attnotnull; exclude PG18's additional NOT NULL constraint rows.
  manifest.serviceEvidenceConstraints=(await db.query("select t.relname as table,c.conname as name,pg_get_constraintdef(c.oid) definition,c.contype::text type from pg_constraint c join pg_class t on t.oid=c.conrelid where t.relnamespace='public'::regnamespace and t.relname=any($1) and c.contype<>'n' order by t.relname,c.conname",[names])).rows;
  manifest.serviceEvidenceIndexes=(await db.query("select t.relname as table,c.relname as name,pg_get_indexdef(i.indexrelid) definition,i.indisunique as unique from pg_index i join pg_class c on c.oid=i.indexrelid join pg_class t on t.oid=i.indrelid where t.relnamespace='public'::regnamespace and t.relname=any($1) order by t.relname,c.relname",[names])).rows;
  assert.equal(manifest.serviceEvidenceIndexes.length,4);
  manifest.serviceEvidencePolicies=(await db.query("select c.relname as table,p.polname as name from pg_policy p join pg_class c on c.oid=p.polrelid where c.relnamespace='public'::regnamespace and c.relname=any($1) and not p.polpermissive and p.polcmd='*' and p.polroles=array[0::oid] and pg_get_expr(p.polqual,p.polrelid)='false' and pg_get_expr(p.polwithcheck,p.polrelid)='false' order by c.relname,p.polname",[names])).rows;
  assert.equal(manifest.serviceEvidencePolicies.length,1);
  const triggers=(await db.query("select c.relname as table,t.tgname as name,pg_get_triggerdef(t.oid) definition from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace and t.tgname in ('service_evidence_upload_identity','service_evidence_upload_tombstone') and not t.tgisinternal order by c.relname,t.tgname")).rows;
  assert.equal(triggers.length,2);manifest.provenanceTriggers.push(...triggers.map(t=>[t.table,t.name,t.definition]));
  // Reuse the exact reviewed catalog guards from pinned .4, with separate new manifest fields.
  const between=(start,end)=>{assert.equal(previous.split(start).length,2);assert.equal(previous.split(end).length,2);const begin=previous.indexOf(start),finish=previous.indexOf(end,begin);assert(finish>begin);return previous.slice(begin,finish);};
  const privateGuard=between('  -- Private intake tables never grant direct access, including service_role.',"  for table_name in select jsonb_array_elements_text(manifest->'baseTables') loop")
    .replaceAll('intakeTables','serviceEvidenceTables').replaceAll('intakePolicies','serviceEvidencePolicies').replace('Private intake tables','Private service-evidence upload receipts');
  const integrityGuard=between('  -- Intake revision, ownership linkage, state/receipt constraints and indexes',"  for item in select value from jsonb_array_elements(manifest->'columns') loop")
    .replaceAll('intakeConstraints','serviceEvidenceConstraints').replaceAll('intakeIndexes','serviceEvidenceIndexes').replaceAll('intakeDefaults','serviceEvidenceDefaults').replace('Intake revision, ownership linkage','Evidence upload identity, ownership linkage');
  const functionGuard=String.raw`  -- Reject unreviewed upload RPC overloads and API-owned helpers.
  for p in select oid,proowner from pg_proc where pronamespace='public'::regnamespace and proname like '%service_evidence_upload%' loop
    if not ((manifest->'serviceEvidenceFunctionSignatures') ? ('public.'||p.oid::regprocedure::text))
      or pg_get_userbyid(p.proowner) in ('anon','authenticated','service_role') then
      flags:=jsonb_set(flags,'{function_security}','false');
    end if;
  end loop;
`;
  const bucketGuard=String.raw`  -- Signed direct upload is constrained by the existing private bucket.
  if not exists(select 1 from storage.buckets b where b.id=manifest->'serviceEvidenceBucket'->>'id'
    and b.public is false and to_jsonb(b.file_size_limit)=manifest->'serviceEvidenceBucket'->'fileSizeLimit'
    and b.allowed_mime_types @> array(select jsonb_array_elements_text(manifest->'serviceEvidenceBucket'->'allowedMimeTypes'))
    and b.allowed_mime_types <@ array(select jsonb_array_elements_text(manifest->'serviceEvidenceBucket'->'allowedMimeTypes'))) then
    flags:=jsonb_set(flags,'{private_storage_buckets}','false');
  end if;
  if not exists(select 1 from pg_attribute where attrelid=to_regclass('storage.objects')
    and attname='metadata' and atttypid='jsonb'::regtype and attnum>0 and not attisdropped) then
    flags:=jsonb_set(flags,'{schema_columns}','false');
  end if;
`;
  const once=(text,needle,addition)=>{assert.equal(text.split(needle).length,2,'Reviewed insertion point changed');return text.replace(needle,()=>addition+needle);};
  let sql=previous.replace(/\$manifest\$[\s\S]*?\$manifest\$/,()=>'$manifest$'+JSON.stringify(manifest)+'$manifest$');
  sql=once(sql,"  for signature in select jsonb_array_elements_text(manifest->'serviceFunctions') loop",functionGuard);
  sql=once(sql,"  for table_name in select jsonb_array_elements_text(manifest->'baseTables') loop",privateGuard);
  sql=once(sql,"  for item in select value from jsonb_array_elements(manifest->'columns') loop",integrityGuard);
  sql=once(sql,"  if not exists(select 1 from pg_policy where polrelid=to_regclass('storage.objects')",bucketGuard);
  sql=sql.replace(/^--[\s\S]*?(?=create or replace function)/,'-- Release 2026-09-17.5: all .4 contracts plus durable direct service-evidence uploads.\n-- Read-only catalog, bucket configuration and existing billing-instance checks.\nbegin;\n');
  assert.deepEqual(manifest.checks,historicalChecks);
  assert.deepEqual(manifest.fingerprints.slice(0,historicalFingerprints.length),historicalFingerprints,'Historical function fingerprint changed');
  await db.exec(sql);
  await db.exec("insert into storage.buckets(id,name,public) values('instrument-media','instrument-media',false),('instrument-documents','instrument-documents',false) on conflict(id) do update set public=false");
  await db.exec('begin read only; set local role service_role');
  const result=(await db.query('select public.qrguitar_release_readiness() result')).rows[0].result;
  await db.exec('rollback');
  assert.equal(result.releaseVersion,'2026-09-17.5');assert.equal(result.ready,true,JSON.stringify(result));
  assert.deepEqual(result.checks.map(check=>check.name),historicalChecks);assert(result.checks.every(check=>check.ok));
  const outputs=new Map([
    ['supabase/migrations/20260917211000_release_readiness.sql',sql]
  ]);
  for(const [relative,content] of outputs){const destination=path.join(output,relative);
    if(process.argv.includes('--write')){fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,content);}
    else assert.equal(normalized(fs.readFileSync(destination,'utf8')),content,'Generated .5 artifact drift: '+relative);
    console.log(digest(content)+'  '+relative);
  }
  console.log('Readiness .5 compiled and passed all14 checks; 14 new receipt columns, 7 exact functions, 2 triggers and bucket configuration bound.');
}finally{await db.close();globalThis.fetch=savedFetch;}
