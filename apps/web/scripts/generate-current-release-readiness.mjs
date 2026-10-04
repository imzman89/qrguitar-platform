// CURRENT source verification only. No export mode or file writes; not DB acceptance.
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
assert.ok(!process.argv.slice(2).some(arg=>arg==='--output-root'||arg.startsWith('--output-root=')),'Verification only; --output-root is unsupported.');
const option=name=>{const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1];};
const repo=path.resolve(option('--repo')||path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..'));
const norm=s=>s.replaceAll('\r\n','\n'),sha=s=>createHash('sha256').update(s).digest('hex');
const read=name=>norm(fs.readFileSync(path.join(repo,name),'utf8'));
const historicalSqlPath="supabase/migrations/20260923121000_release_readiness.sql",snapshotPath="apps/web/scripts/release-readiness-manifest-20260923.json",manifestPath="apps/web/scripts/release-readiness-manifest.json",currentSqlPath="supabase/migrations/20261004170000_release_readiness.sql";
const previous=read(historicalSqlPath);assert.equal(sha(previous),"9ff42ad4ee1f74b71062dd08775f5446f8954a7e11b1ce7491cb941022801c82");
const snapshot=read(snapshotPath);assert.equal(sha(snapshot),"d511e9d8c9c1f415b4693e6490bc8553914228fab4b1d1a819146a2d881e3fc7");
const embedded=previous.match(/\$manifest\$([\s\S]*?)\$manifest\$/);assert(embedded);const manifest=JSON.parse(embedded[1]);assert.deepEqual(manifest,JSON.parse(snapshot));assert.equal(manifest.releaseVersion,'2026-09-23.1');
const reviewedSources={"supabase/migrations/20261002180000_catalog_save_policy.sql":"b6880a39e316cd2b487e708a80677af4bfc3b5d11bfe2babab32857d4bea6a14","supabase/migrations/20261002181000_transfer_closes_previous_offer.sql":"3b514b6f87750d27746f8e38fb8bbdd6ced3cfe7e80a7463c262b1f135509587","supabase/migrations/20260930010000_member_message_upload_replay.sql":"b9470381ab6d011e9dee159f6a15bef033aa04bed9a0e56113475e7267801a16"};
for(const [name,expected]of Object.entries(reviewedSources))assert.equal(sha(read(name)),expected,name+' differs from final reviewed source');
function body(sql,name,tag=''){
 const rx=new RegExp('create(?: or replace)? function public\\.'+name+'\\([\\s\\S]*?as \\$'+tag+'\\$([\\s\\S]*?)\\$'+tag+'\\$;','ig');
 const found=[...sql.matchAll(rx)];assert.equal(found.length,1,name);return found[0][1];
}
const additions=[
  {
    "signature": "public.create_catalog_instrument_profile(uuid,text,text,jsonb,boolean,text,text)",
    "source_hash": "7616ddb6395cf3af69d0812bc18525987c78a84af2ff7ff76f875cebe82bd524",
    "arguments": "p_owner_id uuid, p_idempotency_key text, p_upload_id text, p_payload jsonb, p_launch_testing_access boolean DEFAULT false, p_owner_display_name text DEFAULT NULL::text, p_billing_environment text DEFAULT 'live'::text",
    "result": "jsonb",
    "definer": true,
    "volatility": "v",
    "settings": [
      "search_path=pg_catalog, public"
    ]
  },
  {
    "signature": "public.save_catalog_instrument_profile(uuid,uuid,timestamp with time zone,jsonb)",
    "source_hash": "3b5a23b862c48bb3cc1e7de22bf493f6a376695066d5e4f93922bca7effb821c",
    "arguments": "p_guitar_id uuid, p_owner_id uuid, p_expected_updated_at timestamp with time zone, p_payload jsonb",
    "result": "jsonb",
    "definer": true,
    "volatility": "v",
    "settings": [
      "search_path=pg_catalog, public"
    ]
  },
  {
    "signature": "public.prepare_member_message_upload(uuid,uuid,uuid,uuid,jsonb)",
    "source_hash": "298ef6a5e0b0e967bde93fc1958533982d8293715dbbcb5fe8a2f7b77c4eb839",
    "arguments": "p_conversation_id uuid, p_actor_id uuid, p_operation_id uuid, p_upload_id uuid, p_file jsonb",
    "result": "jsonb",
    "definer": true,
    "volatility": "v",
    "settings": [
      "search_path=pg_catalog, public"
    ]
  }
];
const catalog=read("supabase/migrations/20261002180000_catalog_save_policy.sql");
assert.equal(sha(body(catalog,'create_catalog_instrument_profile','catalog')),additions[0].source_hash);assert.equal(sha(body(catalog,'save_catalog_instrument_profile','catalog')),additions[1].source_hash);assert(!catalog.includes('_ensure_saved_instrument_collection'));
assert.equal(sha(body(read("supabase/migrations/20260930010000_member_message_upload_replay.sql"),'prepare_member_message_upload')),additions[2].source_hash);
const oldTransfer=body(read("supabase/migrations/20260911001500_atomic_ownership_transfers.sql"),"complete_ownership_transfer");assert.equal(sha(oldTransfer),"95288614642a410c6e380ea5379d10157a54103680ce783298a33ba67a31e559");
const transfer=read("supabase/migrations/20261002181000_transfer_closes_previous_offer.sql");
const oldBlock=transfer.match(/\$old_block\$([\s\S]*?)\$old_block\$/)[1],newBlock=transfer.match(/\$first_acceptance\$([\s\S]*?)\$first_acceptance\$/)[1];
assert.equal(oldTransfer.split(oldBlock).length,2);assert.equal(sha(oldTransfer.replace(oldBlock,newBlock)),"ee851211fa2dcd5dc4038852e1b2d9e8e3cc6a6af6408c33476a1f021a593ed9");
const index=manifest.fingerprints.findIndex(f=>f.signature==="public.complete_ownership_transfer(uuid,uuid,text,text,boolean,text)");assert(index>=0);assert.equal(manifest.fingerprints[index].source_hash,"95288614642a410c6e380ea5379d10157a54103680ce783298a33ba67a31e559");
manifest.fingerprints[index]={...manifest.fingerprints[index],source_hash:"ee851211fa2dcd5dc4038852e1b2d9e8e3cc6a6af6408c33476a1f021a593ed9"};
for(const f of additions){assert(!manifest.fingerprints.some(g=>g.signature===f.signature));manifest.fingerprints.push(f);manifest.serviceFunctions.push(f.signature);}
Object.assign(manifest,{
  "releaseVersion": "2026-10-04.1",
  "previousReleaseVersion": "2026-09-23.1",
  "previousReadinessSourceSha256": "9ff42ad4ee1f74b71062dd08775f5446f8954a7e11b1ce7491cb941022801c82",
  "catalogPolicySourceSha256": "b6880a39e316cd2b487e708a80677af4bfc3b5d11bfe2babab32857d4bea6a14",
  "catalogFunctionSignatures": [
    "public.create_catalog_instrument_profile(uuid,text,text,jsonb,boolean,text,text)",
    "public.save_catalog_instrument_profile(uuid,uuid,timestamp with time zone,jsonb)"
  ],
  "forbiddenCatalogFunctionNames": [
    "_ensure_saved_instrument_collection"
  ],
  "memberMessageUploadReplaySourceSha256": "b9470381ab6d011e9dee159f6a15bef033aa04bed9a0e56113475e7267801a16",
  "memberMessageUploadFunctionSignatures": [
    "public.prepare_member_message_upload(uuid,uuid,uuid,uuid,jsonb)"
  ],
  "transferOfferSourceSha256": "3b514b6f87750d27746f8e38fb8bbdd6ced3cfe7e80a7463c262b1f135509587",
  "currentFunctionNames": [
    "complete_ownership_transfer",
    "prepare_member_message_upload",
    "create_catalog_instrument_profile",
    "save_catalog_instrument_profile",
    "_ensure_saved_instrument_collection"
  ],
  "currentFunctionSignatures": [
    "public.complete_ownership_transfer(uuid,uuid)",
    "public.complete_ownership_transfer(uuid,uuid,text,text,boolean,text)",
    "public.create_catalog_instrument_profile(uuid,text,text,jsonb,boolean,text,text)",
    "public.save_catalog_instrument_profile(uuid,uuid,timestamp with time zone,jsonb)",
    "public.prepare_member_message_upload(uuid,uuid,uuid,uuid,jsonb)"
  ]
});
const guard="  -- Current release families admit reviewed signatures, reject API-role owners and restrict execution roles.\n  for p in select oid,proowner,proname from pg_proc where pronamespace='public'::regnamespace\n    and proname in (select jsonb_array_elements_text(manifest->'currentFunctionNames')) loop\n    signature:='public.'||p.oid::regprocedure::text;\n    if not ((manifest->'currentFunctionSignatures') ? signature)\n      or (manifest->'forbiddenCatalogFunctionNames') ? p.proname\n      or pg_get_userbyid(p.proowner) in ('anon','authenticated','service_role')\n      or exists(select 1 from pg_proc f\n        cross join lateral aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a\n        where f.oid=p.oid and a.privilege_type='EXECUTE' and a.grantee<>f.proowner\n          and (a.is_grantable or not ((manifest->'serviceFunctions') ? signature)\n            or coalesce(pg_get_userbyid(a.grantee),'')<>'service_role')) then\n      flags:=jsonb_set(flags,'{function_security}','false');\n    end if;\n  end loop;\n",anchor="  for signature in select jsonb_array_elements_text(manifest->'serviceFunctions') loop";assert.equal(previous.split(anchor).length,2);
const sql=previous.replace(/\$manifest\$[\s\S]*?\$manifest\$/,()=>'$manifest$'+JSON.stringify(manifest)+'$manifest$').replace(anchor,()=>guard+anchor).replace("-- Release 2026-09-23.1: all prior contracts plus five free owned Profiles.","-- Release 2026-10-04.1: prior contracts, reviewed offer closing, privacy-preserving Catalog wrappers and upload replay.");
const artifacts=new Map([[manifestPath,JSON.stringify(manifest,null,2)+'\n'],[currentSqlPath,sql]]);
for(const [name,text]of artifacts)assert.equal(read(name),text,name+' differs from explicit reviewed composition');
console.log('Current source contract composed/verified; full final DB readiness is the separate test-release-readiness-db gate.');
