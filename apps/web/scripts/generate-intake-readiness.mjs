// Verify or generate only release .4 artifacts from reviewed .3 and intake SQL.
// No database credentials or hosted service are used. --write affects only the
// named .4 migration and active manifest below the selected migration root.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const option = name => { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1]; };
const repo = path.resolve(option('--repo') || path.resolve(here, '../../..'));
const output = path.resolve(option('--migration-root') || repo);
const normalized = value => value.replaceAll('\r\n', '\n');
const digest = value => createHash('sha256').update(value).digest('hex');
const previous = normalized(fs.readFileSync(path.join(repo, 'supabase/migrations/20260917191000_release_readiness.sql'), 'utf8'));
assert.equal(digest(previous), '85ab7180e197add1fd7ecd5235410873fd040df9d7f14e65fcc27baf2dfbed92', 'Reviewed .3 readiness changed; review rather than regenerate around drift.');
const embedded = previous.match(/\$manifest\$([\s\S]*?)\$manifest\$/);
assert.ok(embedded, 'Reviewed .3 manifest missing');
const manifest = JSON.parse(embedded[1]);
assert.equal(manifest.releaseVersion, '2026-09-17.3');
const originalChecks = [...manifest.checks];
const intakePath = path.resolve(option('--intake-sql') || path.join(output, 'supabase/migrations/20260917200000_account_deletion_intake.sql'));
const intake = normalized(fs.readFileSync(intakePath, 'utf8'));
assert.equal(digest(intake), '10683aafd633ced3f72ceb72cb10536f4e0a95f4b59aed3e09d7d6987a49430b', 'Reviewed intake SQL changed; explicitly review before changing the fingerprint input.');
const { PGlite } = createRequire(path.join(repo, 'package.json'))('@electric-sql/pglite');
const { installRepositorySchema } = await import(pathToFileURL(path.join(repo, 'apps/web/scripts/security/postgres-fixture.mjs')));
const db = new PGlite(), savedFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('External network is forbidden in the readiness generator.'); };

try {
  await installRepositorySchema(db, repo, '20260917200000');
  await db.exec(intake);
  const names = ['account_deletion_requests', 'account_deletion_request_receipts', 'account_deletion_actor_revisions'];
  const functions = (await db.query("select 'public.'||oid::regprocedure::text signature,proname,prosecdef,provolatile,proconfig,pg_get_function_arguments(oid) arguments,pg_get_function_result(oid) result,encode(sha256(convert_to(replace(prosrc,chr(13)||chr(10),chr(10)),'UTF8')),'hex') source_hash from pg_proc where pronamespace='public'::regnamespace and proname like '%account_deletion%' order by proname,pronargs")).rows;
  assert.equal(functions.length, 8);
  const allowed = functions.filter(fn => !fn.proname.startsWith('_')).map(fn => fn.signature);
  const blocked = functions.filter(fn => fn.proname.startsWith('_')).map(fn => fn.signature);
  assert.equal(allowed.length, 4); assert.equal(blocked.length, 4);
  for (const signature of [...allowed, ...blocked]) assert.ok(!manifest.fingerprints.some(fn => fn.signature === signature), 'Unexpected intake object in historical .3');
  manifest.releaseVersion = '2026-09-17.4';
  manifest.serviceFunctions.push(...allowed);
  manifest.blockedFunctions.push(...blocked);
  manifest.fingerprints.push(...functions.map(fn => ({ signature: fn.signature, source_hash: fn.source_hash, arguments: fn.arguments, result: fn.result, definer: fn.prosecdef, volatility: fn.provolatile, settings: fn.proconfig })));
  manifest.intakeTables = names;
  manifest.intakeFunctionSignatures = functions.map(fn => fn.signature);
  manifest.intakeSourceSha256 = digest(intake);
  const columns = (await db.query("select c.relname as table,a.attname as name,format_type(a.atttypid,a.atttypmod) as type,a.attnotnull as not_null from pg_attribute a join pg_class c on c.oid=a.attrelid where c.relnamespace='public'::regnamespace and c.relname=any($1) and a.attnum>0 and not a.attisdropped order by c.relname,a.attnum", [names])).rows;
  assert.equal(columns.length, 13);
  manifest.columns.push(...columns);
  manifest.intakeDefaults = (await db.query("select c.relname as table,a.attname as name,pg_get_expr(d.adbin,d.adrelid) expression from pg_attribute a join pg_class c on c.oid=a.attrelid left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where c.relnamespace='public'::regnamespace and c.relname=any($1) and a.attnum>0 and not a.attisdropped order by c.relname,a.attnum", [names])).rows;
  // PG17 relation NOT NULL lives in attnotnull; PG18 adds contype='n'. The
  // existing schema_columns guard covers exact nullability on all 13 columns.
  manifest.intakeConstraints = (await db.query("select t.relname as table,c.conname as name,pg_get_constraintdef(c.oid) definition,c.contype::text as type from pg_constraint c join pg_class t on t.oid=c.conrelid where t.relnamespace='public'::regnamespace and t.relname=any($1) and c.contype<>'n' order by t.relname,c.conname", [names])).rows;
  manifest.intakeIndexes = (await db.query("select t.relname as table,c.relname as name,pg_get_indexdef(i.indexrelid) definition,i.indisunique as unique from pg_index i join pg_class c on c.oid=i.indexrelid join pg_class t on t.oid=i.indrelid where t.relnamespace='public'::regnamespace and t.relname=any($1) order by t.relname,c.relname", [names])).rows;
  assert.equal(manifest.intakeIndexes.length, 8);
  manifest.intakePolicies = (await db.query("select c.relname as table,p.polname as name from pg_policy p join pg_class c on c.oid=p.polrelid where c.relnamespace='public'::regnamespace and c.relname=any($1) and not p.polpermissive and p.polcmd='*' and p.polroles=array[0::oid] and pg_get_expr(p.polqual,p.polrelid)='false' and pg_get_expr(p.polwithcheck,p.polrelid)='false' order by c.relname,p.polname", [names])).rows;
  assert.equal(manifest.intakePolicies.length, 3);
  const triggers = (await db.query("select c.relname as table,t.tgname as name,pg_get_triggerdef(t.oid) definition from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace and c.relname=any($1) and not t.tgisinternal order by c.relname,t.tgname", [names])).rows;
  assert.equal(triggers.length, 2);
  manifest.provenanceTriggers.push(...triggers.map(trigger => [trigger.table, trigger.name, trigger.definition]));

  const privateGuard = String.raw`  -- Private intake tables never grant direct access, including service_role.
  for table_name in select jsonb_array_elements_text(manifest->'intakeTables') loop
    table_oid:=to_regclass('public.'||table_name);
    if table_oid is null or not exists(select 1 from pg_class where oid=table_oid and relkind='r' and relrowsecurity) then
      flags:=jsonb_set(flags,'{private_tables}','false');
    end if;
    if table_oid is null then flags:=jsonb_set(flags,'{private_table_grants}','false');
    else
      foreach role_name in array array['anon','authenticated','service_role'] loop
        if has_table_privilege(role_name,table_oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
          or has_any_column_privilege(role_name,table_oid,'SELECT,INSERT,UPDATE,REFERENCES') then
          flags:=jsonb_set(flags,'{private_table_grants}','false');
        end if;
      end loop;
    end if;
    if (select count(*) from pg_attribute where attrelid=table_oid and attnum>0 and not attisdropped)
      <> (select count(*) from jsonb_array_elements(manifest->'columns') c where c->>'table'=table_name) then
      flags:=jsonb_set(flags,'{schema_columns}','false');
    end if;
  end loop;
  for item in select value from jsonb_array_elements(manifest->'intakePolicies') loop
    if not exists(select 1 from pg_policy where polrelid=to_regclass('public.'||(item->>'table'))
      and polname=item->>'name' and not polpermissive and polcmd='*' and polroles=array[0::oid]
      and pg_get_expr(polqual,polrelid)='false' and pg_get_expr(polwithcheck,polrelid)='false') then
      flags:=jsonb_set(flags,'{server_only_policies}','false');
    end if;
  end loop;
`;
  const integrityGuard = String.raw`  -- Intake revision, ownership linkage, state/receipt constraints and indexes
  -- are exact reviewed catalog contracts, not merely similarly named objects.
  for item in select value from jsonb_array_elements(manifest->'intakeConstraints') loop
    if not exists(select 1 from pg_constraint c where c.conrelid=to_regclass('public.'||(item->>'table'))
      and c.conname=item->>'name' and c.contype::text=item->>'type' and c.convalidated and not c.condeferrable
      and pg_get_constraintdef(c.oid)=item->>'definition') then flags:=jsonb_set(flags,'{receipt_constraints}','false'); end if;
  end loop;
  for item in select value from jsonb_array_elements(manifest->'intakeIndexes') loop
    if not exists(select 1 from pg_index i where i.indexrelid=to_regclass('public.'||(item->>'name'))
      and i.indrelid=to_regclass('public.'||(item->>'table')) and to_jsonb(i.indisunique)=item->'unique'
      and i.indisvalid and i.indisready and pg_get_indexdef(i.indexrelid)=item->>'definition') then
      flags:=jsonb_set(flags,'{receipt_constraints}','false');
    end if;
  end loop;
  for item in select value from jsonb_array_elements(manifest->'intakeDefaults') loop
    if not exists(select 1 from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
      where a.attrelid=to_regclass('public.'||(item->>'table')) and a.attname=item->>'name' and not a.attisdropped
      and coalesce(to_jsonb(pg_get_expr(d.adbin,d.adrelid)),'null'::jsonb)=item->'expression') then
      flags:=jsonb_set(flags,'{schema_columns}','false');
    end if;
  end loop;
`;
  const functionGuard = String.raw`  -- No old mutation overload can bypass the required expected revision.
  -- Exact source hashes above cover actor lock namespace/order, receipt replay
  -- identity, expected-revision comparison and atomic revision increments.
  for p in select oid,proowner from pg_proc where pronamespace='public'::regnamespace and proname like '%account_deletion%' loop
    if not ((manifest->'intakeFunctionSignatures') ? ('public.'||p.oid::regprocedure::text))
      or pg_get_userbyid(p.proowner) in ('anon','authenticated','service_role') then
      flags:=jsonb_set(flags,'{function_security}','false');
    end if;
  end loop;
`;
  const once = (text, needle, addition) => { assert.equal(text.split(needle).length, 2, 'Reviewed insertion point changed'); return text.replace(needle, () => addition + needle); };
  let sql = previous.replace(/\$manifest\$[\s\S]*?\$manifest\$/, () => '$manifest$' + JSON.stringify(manifest) + '$manifest$');
  sql = once(sql, "  for signature in select jsonb_array_elements_text(manifest->'serviceFunctions') loop", functionGuard);
  sql = once(sql, "  for table_name in select jsonb_array_elements_text(manifest->'baseTables') loop", privateGuard);
  sql = once(sql, "  for item in select value from jsonb_array_elements(manifest->'columns') loop", integrityGuard);
  sql = sql.replace(/^--[\s\S]*?(?=create or replace function)/, '-- Release 2026-09-17.4: all .3 checks plus private revision-fenced account request intake.\n-- Read-only service RPC: catalogs, protected bucket metadata and the existing billing-instance row.\nbegin;\n');
  assert.deepEqual(manifest.checks, originalChecks, 'Historical .3 check names were lost or changed');
  // Verify the candidate actually compiles and passes against its source schema.
  await db.exec(sql);
  await db.exec("insert into storage.buckets(id,name,public) values('instrument-media','instrument-media',false),('instrument-documents','instrument-documents',false),('service-evidence','service-evidence',false) on conflict(id) do update set public=false");
  await db.exec('begin read only; set local role service_role');
  const result = (await db.query('select public.qrguitar_release_readiness() result')).rows[0].result;
  await db.exec('rollback');
  assert.equal(result.releaseVersion, '2026-09-17.4'); assert.equal(result.ready, true, JSON.stringify(result));
  assert.deepEqual(result.checks.map(check => check.name), originalChecks); assert.ok(result.checks.every(check => check.ok));
  const outputs = new Map([
    ['supabase/migrations/20260917201000_release_readiness.sql', sql],
    ['apps/web/scripts/release-readiness-manifest.json', JSON.stringify(manifest, null, 2) + '\n']
  ]);
  for (const [relative, content] of outputs) {
    const destination = path.join(output, relative);
    if (process.argv.includes('--write')) { fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, content); }
    else assert.equal(normalized(fs.readFileSync(destination, 'utf8')), content, 'Generated .4 artifact drift: ' + relative);
    console.log(digest(content) + '  ' + relative);
  }
  console.log('Readiness ' + manifest.releaseVersion + ': all ' + originalChecks.length + ' historical checks, ' + names.length + ' intake tables, ' + columns.length + ' intake columns and ' + functions.length + ' exact intake functions.');
} finally { await db.close(); globalThis.fetch = savedFetch; }
