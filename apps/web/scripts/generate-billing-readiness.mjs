// Generates only the new billing readiness contract from historical reviewed SQL and real PGlite catalogs.
// Default mode verifies the complete historical .3 SQL, including its embedded
// manifest. --write emits that historical SQL only. The active release manifest
// belongs to the newest readiness generator and must not be reverted to .3.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const option=name=>{const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1];};
const repo=path.resolve(option('--repo')||path.resolve(here,'../../..'));
const output=path.resolve(option('--migration-root')||repo);
const normalized=value=>value.replaceAll('\r\n','\n');
const digest=value=>createHash('sha256').update(value).digest('hex');
const previous=normalized(fs.readFileSync(path.join(repo,'supabase/migrations/20260917175000_release_readiness.sql'),'utf8'));
assert.equal(digest(previous),'71f48d109603b47f4add5fb3e8b09139fcfc5afb4659bbd60b0cdd3558ff8b2d','Historical readiness source changed; review instead of regenerating around drift.');
const match=previous.match(/\$manifest\$([\s\S]*?)\$manifest\$/);
assert.ok(match,'Historical manifest missing');
const manifest=JSON.parse(match[1]);
assert.equal(manifest.releaseVersion,'2026-09-17.2');
const {PGlite}=createRequire(path.join(repo,'package.json'))('@electric-sql/pglite');
const {installRepositorySchema}=await import(pathToFileURL(path.join(repo,'apps/web/scripts/security/postgres-fixture.mjs')));
const db=new PGlite();
try {
  await installRepositorySchema(db,repo,'20260917190000');
  // The billing migration itself checks both reviewed create bodies before changing any implementation.
  const migration=normalized(fs.readFileSync(path.join(output,'supabase/migrations/20260917190000_billing_credits.sql'),'utf8'));
  await db.exec(migration);
  const functions=(await db.query("select 'public.'||oid::regprocedure::text signature,proname,prosecdef,provolatile,proconfig,pg_get_function_arguments(oid) arguments,pg_get_function_result(oid) result,encode(sha256(convert_to(replace(prosrc,chr(13)||chr(10),chr(10)),'UTF8')),'hex') source_hash from pg_proc where pronamespace='public'::regnamespace and (proname like 'billing_%' or proname like '_billing_%' or proname like 'create_instrument_profile%') order by proname,pronargs")).rows;
  assert.equal(functions.length,29);
  manifest.releaseVersion='2026-09-17.3';
  const allowed=functions.filter(f=>f.proname.startsWith('billing_')||f.proname==='create_instrument_profile').map(f=>f.signature);
  const blocked=functions.filter(f=>!allowed.includes(f.signature)).map(f=>f.signature);
  manifest.serviceFunctions=[...new Set([...manifest.serviceFunctions,...allowed])];
  manifest.blockedFunctions=[...new Set([...manifest.blockedFunctions,...blocked])];
  for(const f of functions){
    const value={signature:f.signature,source_hash:f.source_hash,arguments:f.arguments,result:f.result,definer:f.prosecdef,volatility:f.provolatile,settings:f.proconfig};
    const index=manifest.fingerprints.findIndex(item=>item.signature===f.signature);
    if(index<0)manifest.fingerprints.push(value);
    else if(f.signature==='public.create_instrument_profile(uuid,text,text,jsonb,boolean,text)')manifest.fingerprints[index]=value;
    else assert.deepEqual(value,manifest.fingerprints[index],'Historical function fingerprint unexpectedly changed: '+f.signature);
  }
  manifest.rpcOnlyTables=['billing_instance_config','billing_offers','billing_customers','billing_orders','billing_receipts','billing_credit_grants','billing_credit_consumptions','billing_credit_holds','billing_review_decisions'];
  const names=manifest.rpcOnlyTables;
  const columns=(await db.query("select c.relname as table,a.attname as name,format_type(a.atttypid,a.atttypmod) as type,a.attnotnull as not_null from pg_attribute a join pg_class c on c.oid=a.attrelid where c.relnamespace='public'::regnamespace and c.relname=any($1) and a.attnum>0 and not a.attisdropped order by c.relname,a.attnum",[names])).rows;
  manifest.columns.push(...columns);
  manifest.billingDefaults=(await db.query("select c.relname as table,a.attname as name,pg_get_expr(d.adbin,d.adrelid) expression from pg_attribute a join pg_class c on c.oid=a.attrelid left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where c.relnamespace='public'::regnamespace and c.relname=any($1) and a.attnum>0 and not a.attisdropped order by c.relname,a.attnum",[names])).rows;
  // PostgreSQL17 stores relation NOT NULL only in pg_attribute.attnotnull; PostgreSQL18 adds contype='n' rows.
  // Every column's exact attnotnull value remains in manifest.columns and the schema_columns readiness check.
  // https://www.postgresql.org/docs/17/catalog-pg-constraint.html
  // https://www.postgresql.org/docs/17/catalog-pg-attribute.html
  manifest.billingConstraints=(await db.query("select t.relname as table,c.conname as name,pg_get_constraintdef(c.oid) definition,c.contype::text as type from pg_constraint c join pg_class t on t.oid=c.conrelid where t.relnamespace='public'::regnamespace and t.relname=any($1) and c.contype<>'n' order by t.relname,c.conname",[names])).rows;
  manifest.billingIndexes=(await db.query("select t.relname as table,c.relname as name,pg_get_indexdef(i.indexrelid) definition from pg_index i join pg_class c on c.oid=i.indexrelid join pg_class t on t.oid=i.indrelid where t.relnamespace='public'::regnamespace and c.relname='billing_one_unresolved_checkout' order by c.relname")).rows;
  assert.equal(manifest.billingIndexes.length,1);
  const triggers=(await db.query("select c.relname as table,t.tgname as name,pg_get_triggerdef(t.oid) definition from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace and c.relname=any($1) and not t.tgisinternal order by c.relname,t.tgname",[names])).rows;
  assert.equal(triggers.length,9);
  manifest.provenanceTriggers.push(...triggers.map(t=>[t.table,t.name,t.definition]));
  manifest.billingInstance={environment:'live'};
  const tableGuard=String.raw`  -- Billing uses definer RPCs exclusively: even service_role has no direct table/column access.
  for table_name in select jsonb_array_elements_text(manifest->'rpcOnlyTables') loop
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
    if not exists(select 1 from pg_policy where polrelid=table_oid
      and polname='qrguitar_billing_server_only' and not polpermissive and polcmd='*'
      and polroles @> role_ids and polroles <@ role_ids
      and pg_get_expr(polqual,polrelid)='false' and pg_get_expr(polwithcheck,polrelid)='false') then
      flags:=jsonb_set(flags,'{server_only_policies}','false');
    end if;
  end loop;
`;
  const integrityGuard=String.raw`  -- Require exact immutable ledger constraints, including FK ownership and check expressions.
  for item in select value from jsonb_array_elements(manifest->'billingConstraints') loop
    if not exists(select 1 from pg_constraint c where c.conrelid=to_regclass('public.'||(item->>'table'))
      and c.conname=item->>'name' and c.contype::text=item->>'type' and c.convalidated and not c.condeferrable
      and pg_get_constraintdef(c.oid)=item->>'definition') then flags:=jsonb_set(flags,'{receipt_constraints}','false'); end if;
  end loop;
  for item in select value from jsonb_array_elements(manifest->'billingIndexes') loop
    if not exists(select 1 from pg_index i where i.indexrelid=to_regclass('public.'||(item->>'name'))
      and i.indrelid=to_regclass('public.'||(item->>'table')) and i.indisunique and i.indisvalid and i.indisready
      and pg_get_indexdef(i.indexrelid)=item->>'definition') then flags:=jsonb_set(flags,'{receipt_constraints}','false'); end if;
  end loop;
  for item in select value from jsonb_array_elements(manifest->'billingDefaults') loop
    if not exists(select 1 from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
      where a.attrelid=to_regclass('public.'||(item->>'table')) and a.attname=item->>'name' and not a.attisdropped
      and coalesce(to_jsonb(pg_get_expr(d.adbin,d.adrelid)),'null'::jsonb)=item->'expression') then
      flags:=jsonb_set(flags,'{schema_columns}','false');
    end if;
  end loop;
  -- This release gate is for production; sandbox databases intentionally fail the LIVE contract.
  if (select count(*) from public.billing_instance_config)<>1
    or not exists(select 1 from public.billing_instance_config where singleton and create_environment=manifest->'billingInstance'->>'environment') then
    flags:=jsonb_set(flags,'{receipt_constraints}','false');
  end if;
`;
  const once=(text,needle,value)=>{assert.equal(text.split(needle).length,2,'Readiness insertion point changed');return text.replace(needle,()=>value+needle);};
  let sql=previous.replace(/\$manifest\$[\s\S]*?\$manifest\$/,()=>'$manifest$'+JSON.stringify(manifest)+'$manifest$');
  sql=once(sql,"  for table_name in select jsonb_array_elements_text(manifest->'baseTables') loop",tableGuard);
  sql=once(sql,"  for item in select value from jsonb_array_elements(manifest->'columns') loop",integrityGuard);
  sql=sql.replace(/^--[\s\S]*?(?=create or replace function)/,"-- Release 2026-09-17.3: private permanent-credit ledger and LIVE database boundary.\n-- Read-only service RPC: catalogs, protected bucket metadata and one billing-instance configuration row.\nbegin;\n");
  sql=sql.trimEnd()+'\ncommit;\n';
  const outputs=new Map([
    ['supabase/migrations/20260917191000_release_readiness.sql',sql]
  ]);
  for(const [relative,content] of outputs){
    const destination=path.join(output,relative);
    if(process.argv.includes('--write')){fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,content);}
    else assert.equal(normalized(fs.readFileSync(destination,'utf8')),content,'Generated contract drift: '+relative);
    console.log(digest(content)+'  '+relative);
  }
  console.log('Readiness contract: '+manifest.releaseVersion+', '+manifest.checks.length+' checks, '+names.length+' private billing tables, '+functions.length+' billing/create function fingerprints.');
} finally {await db.close();}
