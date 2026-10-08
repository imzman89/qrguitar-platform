import assert from "node:assert/strict";
import { createHash } from "node:crypto";
export const supportFunctionFacts = [
  {
    "signature": "public.save_account_settings(uuid,text,jsonb,bigint)",
    "source_hash": "ec79eaa202fed80a50de39c0431298b9ac32080e844cac7b1e535acee5f25e69",
    "arguments": "p_user_id uuid, p_display_name text, p_collection jsonb, p_expected_version bigint",
    "result": "jsonb",
    "definer": true,
    "volatility": "v",
    "settings": [
      "search_path=pg_catalog, public"
    ]
  },
  {
    "signature": "public._member_assert_conversation(uuid,uuid,boolean)",
    "source_hash": "cad2a77a2414fbc0a86712f12ee66a0b11d7284698f4af371da8c4ec91344941",
    "arguments": "p_conversation_id uuid, p_actor_id uuid, p_require_send boolean DEFAULT false",
    "result": "member_conversations",
    "definer": true,
    "volatility": "v",
    "settings": [
      "search_path=pg_catalog, public"
    ]
  },
  {
    "signature": "public.ensure_member_conversation(uuid,uuid,uuid)",
    "source_hash": "068050d7ec46f1e3059891c13de5714a27ea6536e107ead8a3377258970878dd",
    "arguments": "p_actor_id uuid, p_target_id uuid, p_context_guitar_id uuid DEFAULT NULL::uuid",
    "result": "jsonb",
    "definer": true,
    "volatility": "v",
    "settings": [
      "search_path=pg_catalog, public"
    ]
  },
  {
    "signature": "public.send_member_message(uuid,uuid,uuid,text)",
    "source_hash": "19e993bea511c610bebd9b298072f51461837037a31ed161fdd2688373d1319d",
    "arguments": "p_conversation_id uuid, p_actor_id uuid, p_operation_id uuid, p_body text",
    "result": "jsonb",
    "definer": true,
    "volatility": "v",
    "settings": [
      "search_path=pg_catalog, public"
    ]
  },
  {
    "signature": "public._member_require_business_message_consent(uuid)",
    "source_hash": "111b617701e60f23ec2a9434234c9c1ddc924524a0bd71193c050c833edcc1f2",
    "arguments": "p_target_id uuid",
    "result": "void",
    "definer": true,
    "volatility": "v",
    "settings": [
      "search_path=pg_catalog, public"
    ]
  },
  {
    "signature": "public.ensure_recorded_business_conversation(uuid,uuid,uuid,text)",
    "source_hash": "05569cd3f3c2d15d8adc14264f269158208b20b6a07f41e7b32d7174d762f3a5",
    "arguments": "p_actor_id uuid, p_target_id uuid, p_transfer_id uuid, p_handle text",
    "result": "jsonb",
    "definer": true,
    "volatility": "v",
    "settings": [
      "search_path=pg_catalog, public"
    ]
  }
];
const hash=value=>createHash("sha256").update(value).digest("hex");
const normalized=value=>value.replaceAll("\r\n","\n");
/** Inert composition only. No file or database operations. Main reviews/applies the returned artifacts together. */
export function composeSupportReadiness(manifestText,readinessText,migrationSha256){
 manifestText=normalized(manifestText);readinessText=normalized(readinessText);
 assert.equal(hash(manifestText),"ec33ebac6ceb939428690739a0a58f55612fd05558ab233096dbf482061cf92d","Unsupported current manifest");
 assert.equal(hash(readinessText),"a441e98bf1b95367a2c30eeaea1b03c0e349e93bcf820aeb97abe500a1dc4474","Unsupported current readiness SQL");
 const before=JSON.parse(manifestText),manifest=structuredClone(before);
 assert.equal(before.releaseVersion,"2026-10-04.1");
 const account=supportFunctionFacts[0],index=manifest.fingerprints.findIndex(item=>item.signature===account.signature);
 assert.ok(index>=0);assert.equal(manifest.fingerprints[index].source_hash,"1beee0b381bf308147d8e0afee278040196d18cf42fd8aea15e1607800b86c42");
 const {source_hash:oldHash,...oldMetadata}=manifest.fingerprints[index],{source_hash:newHash,...newMetadata}=account;
 assert.deepEqual(newMetadata,oldMetadata);manifest.fingerprints[index]=account;
 for(const fact of supportFunctionFacts.slice(1)){assert.ok(!manifest.fingerprints.some(item=>item.signature===fact.signature));manifest.fingerprints.push(fact);}
 const privateFunctions=supportFunctionFacts.filter(item=>item.signature.includes("._member_")).map(item=>item.signature);
 const services=supportFunctionFacts.slice(1).filter(item=>!privateFunctions.includes(item.signature)).map(item=>item.signature);
 const append=(field,values)=>{for(const value of values)if(!manifest[field].includes(value))manifest[field].push(value);};
 append("blockedFunctions",privateFunctions);append("serviceFunctions",services);
 append("currentFunctionSignatures",supportFunctionFacts.slice(1).map(item=>item.signature));
 append("currentFunctionNames",supportFunctionFacts.slice(1).map(item=>item.signature.slice(7).split("(")[0]));
 manifest.releaseVersion="2026-10-05.1";
 manifest.previousReleaseVersion=before.releaseVersion;
 manifest.previousReadinessSourceSha256=hash(readinessText);
 manifest.recordedBusinessSupportSourceSha256=migrationSha256;
 assert.deepEqual(manifest.checks,before.checks);assert.equal(manifest.checks.length,14);
 assert.deepEqual(manifest.fingerprints.filter(item=>!supportFunctionFacts.some(fact=>fact.signature===item.signature)),before.fingerprints.filter(item=>item.signature!==account.signature));
 for(const key of Object.keys(before))if(!["fingerprints","blockedFunctions","serviceFunctions","currentFunctionSignatures","currentFunctionNames","releaseVersion","previousReleaseVersion","previousReadinessSourceSha256"].includes(key))assert.deepEqual(manifest[key],before[key],key+" changed");
 const embedded=readinessText.match(/\$manifest\$([\s\S]*?)\$manifest\$/);
 assert.ok(embedded);assert.deepEqual(JSON.parse(embedded[1]),before);
 const body=readinessText.match(/as \$readiness\$([\s\S]*?)\$readiness\$/)[1];
 assert.equal(hash(body),"699a81caecd0a30b2298bc893d5460cd5116581e6b32933445cc26f5d729bdb0");
 const oldToken="$manifest$"+embedded[1]+"$manifest$",newToken="$manifest$"+JSON.stringify(manifest)+"$manifest$";
 const nextBody=body.replace(oldToken,()=>newToken);
 assert.equal(nextBody.replace(newToken,()=>oldToken),body,"No readiness guard may change");
 const sql=`begin;
do $guard$
declare definition text; source text; configuration text[]; definer boolean; volatility "char";
begin
 select pg_get_functiondef(oid),prosrc,proconfig,prosecdef,provolatile into definition,source,configuration,definer,volatility
   from pg_proc where oid='public.qrguitar_release_readiness()'::regprocedure;
 if encode(sha256(convert_to(replace(source,E'\\r\\n',E'\\n'),'UTF8')),'hex') is distinct from '699a81caecd0a30b2298bc893d5460cd5116581e6b32933445cc26f5d729bdb0'
   or not definer or volatility<>'s' or configuration is distinct from array['search_path=pg_catalog, public'] then
   raise exception 'Unsupported readiness predecessor.';
 end if;
 execute replace(definition,$before$${oldToken}$before$,$after$${newToken}$after$);
end $guard$;
notify pgrst,'reload schema';
commit;
`;
 return {manifest:JSON.stringify(manifest,null,2)+"\n",readinessSql:sql,readinessBodySha256:hash(nextBody),unchangedFingerprints:before.fingerprints.length-1,checks:manifest.checks,
   activationBoundary:"Apply guarded support and readiness definitions together before the matching web version; separate Main/operator authority, never this composer."};
}
