import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(process.argv[2] || path.join(here, "../../../.."));
const require = createRequire(path.join(repo, "apps/web/package.json"));
const { PGlite } = require("@electric-sql/pglite");
const { installRepositorySchema } = await import(pathToFileURL(path.join(repo, "apps/web/scripts/security/postgres-fixture.mjs")));
const source = fs.readFileSync(path.join(repo, "supabase/migrations/20260918170000_account_deletion_fulfillment.sql"), "utf8");
const db = new PGlite();
const ACTOR = "10000000-0000-4000-8000-000000000001";
const OTHER = "20000000-0000-4000-8000-000000000002";
const ADMIN = "30000000-0000-4000-8000-000000000003";
const UNKNOWN = "40000000-0000-4000-8000-000000000004";
let passed = 0, savepoint = 0;

async function fail(work, code) {
  const point = "expected_failure_" + ++savepoint;
  await db.exec("savepoint " + point);
  try { await assert.rejects(work, error => error?.code === code, `Expected PostgreSQL error ${code}`); }
  finally { await db.exec(`rollback to savepoint ${point}; release savepoint ${point}`); }
}
async function check(name, work) {
  await db.exec("begin");
  try { await work(); passed += 1; console.log("PASS " + name); }
  finally { await db.exec("rollback"); }
}
async function seed({ actorRole = "owner", credits = 0 } = {}) {
  await db.query("insert into auth.users(id,email) values($1,'private.person@example.test'),($2,'other@example.test'),($3,'admin@example.test')", [ACTOR, OTHER, ADMIN]);
  await db.query("insert into profiles(id,display_name,role,purchased_code_count,remaining_code_count) values($1,'Private Person',$4,$5,$5),($2,'Other Person','owner',0,0),($3,'Admin','admin',0,0)", [ACTOR, OTHER, ADMIN, actorRole, credits]);
}
async function request(actor = ACTOR) {
  const revision = (await db.query("select coalesce((select revision from account_deletion_actor_revisions where actor_id=$1),0)::text value", [actor])).rows[0].value;
  return (await db.query("select public.submit_account_deletion_request($1,$2,$3) result", [actor, randomUUID(), revision])).rows[0].result;
}
async function prepare(requestId, operationId = randomUUID(), admin = ADMIN, environmentAdmin = false) {
  return (await db.query("select public.prepare_account_deletion_fulfillment($1,$2,$3,$4) result", [admin, environmentAdmin, requestId, operationId])).rows[0].result;
}
async function expireStorageQuiescence(requestId) {
  await db.query("select set_config('qrguitar.account_deletion_request',$1,true)", [requestId]);
  await db.query("update account_deletion_fulfillments set storage_quiesce_until=clock_timestamp()-interval '1 second' where request_id=$1 and state='quiescing_storage'", [requestId]);
  await db.exec("select set_config('qrguitar.account_deletion_request','',true)");
}
async function prepareReady(requestId) {
  let result = await prepare(requestId);
  if (result.fulfillment.state === "quiescing_storage") {
    assert.deepEqual(result.fulfillment.blockers, ["storage_quiescence_required"]);
    await expireStorageQuiescence(requestId);
    result = await prepare(requestId);
  }
  return result;
}
async function complete(requestId, operationId = randomUUID()) {
  return (await db.query("select public.complete_account_deletion_fulfillment($1,false,$2,$3) result", [ADMIN, requestId, operationId])).rows[0].result;
}
async function guitar() {
  return (await db.query(`insert into guitars(owner_id,qr_code,permanent_path,name,brand,model,year,serial_number,builder,location,visibility,summary,safety_note,public_safety_note)
    values($1,'QRG-DELETE','/i/QRG-DELETE','Private Person personal guitar','Synthetic','Archive','1962','SERIAL-DELETE','Private Person','Private home','public','private.person@example.test lives here','Private Person note','Call Private Person') returning *`, [ACTOR])).rows[0];
}

try {
  await installRepositorySchema(db, repo, "20260918170000");
  await db.exec(source);

  await check("private state, receipts and custody expose no direct grants", async () => {
    for (const table of ["account_deletion_fulfillments", "account_deletion_fulfillment_receipts", "account_deletion_profile_custody"]) {
      assert.equal((await db.query("select relrowsecurity from pg_class where oid=$1::regclass", ["public." + table])).rows[0].relrowsecurity, true);
      for (const role of ["anon", "authenticated", "service_role"]) for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
        assert.equal((await db.query("select has_table_privilege($1,$2,$3) allowed", [role, "public." + table, privilege])).rows[0].allowed, false);
      }
    }
    const boundary = [
      "public.prepare_account_deletion_fulfillment(uuid,boolean,uuid,uuid,text[])",
      "public.complete_account_deletion_fulfillment(uuid,boolean,uuid,uuid)",
      "public.read_account_deletion_fulfillment(uuid,boolean,uuid)"
    ];
    for (const signature of boundary) for (const role of ["anon", "authenticated", "service_role"]) {
      assert.equal((await db.query("select has_function_privilege($1,$2,'EXECUTE') allowed", [role, signature])).rows[0].allowed, role === "service_role");
    }
    const helpers = (await db.query("select oid::regprocedure::text signature from pg_proc where pronamespace='public'::regnamespace and proname like '\\_account_deletion\\_%' escape '\\'")).rows;
    assert.ok(helpers.length >= 8);
    for (const helper of helpers) for (const role of ["anon", "authenticated", "service_role"]) {
      assert.equal((await db.query("select has_function_privilege($1,$2,'EXECUTE') allowed", [role, helper.signature])).rows[0].allowed, false);
    }
  });

  await check("only a verified active administrator can inspect or prepare another account", async () => {
    await seed(); const created = await request(); const id = created.request.requestId;
    await fail(() => prepare(id, randomUUID(), UNKNOWN, true), "PD401");
    await fail(() => prepare(id, randomUUID(), OTHER, false), "PD403");
    await fail(() => prepare(id, randomUUID(), ACTOR, true), "PD409");
    await fail(() => db.query("select public.read_account_deletion_fulfillment($1,false,$2)", [OTHER, id]), "PD403");
    assert.equal((await db.query("select count(*)::int n from account_deletion_fulfillments")).rows[0].n, 0);
  });

  await check("environment-managed administrator identities are durable blockers", async () => {
    await seed(); const id = (await request()).request.requestId;
    const result = (await db.query("select public.prepare_account_deletion_fulfillment($1,false,$2,$3,$4::text[]) result",
      [ADMIN, id, randomUUID(), ["private.person@example.test"]])).rows[0].result;
    assert.equal(result.fulfillment.state, "blocked");
    assert.deepEqual(result.fulfillment.blockers, ["administrator_account"]);
    assert.equal((await db.query("select account_status from profiles where id=$1", [ACTOR])).rows[0].account_status, "active");
  });

  await check("normal ownership changes remain available without a deletion request", async () => {
    await seed(); const g = await guitar();
    await db.query("update guitars set owner_id=$1 where id=$2", [OTHER, g.id]);
    assert.equal((await db.query("select owner_id from guitars where id=$1", [g.id])).rows[0].owner_id, OTHER);
  });

  await check("paid credits and unresolved billing are explicit blockers and never forfeited", async () => {
    await seed({ credits: 2 });
    const order = randomUUID();
    await db.query("insert into billing_orders(id,owner_id,environment,request_key,offer,status) values($1,$2,'live',$3,$4,'reserved')", [order, ACTOR, randomUUID(), { key: "profile_1", version: 1, currency: "usd", amount: 1200, credits: 1, priceId: "price_fixture" }]);
    await db.query("insert into billing_credit_grants(order_id,owner_id,environment,session_id,payment_id,credits) values($1,$2,'live','session_fixture','payment_fixture',3)", [order, ACTOR]);
    const id = (await request()).request.requestId, operation = randomUUID();
    const first = await prepare(id, operation);
    assert.equal(first.fulfillment.state, "blocked");
    assert.deepEqual(first.fulfillment.blockers, ["billing_retention_migration_required", "unresolved_payment_order", "unused_paid_credits", "unused_profile_credits"].sort());
    assert.equal(first.authActorId, null);
    assert.deepEqual(await prepare(id, operation), first);
    assert.equal((await db.query("select account_status,remaining_code_count from profiles where id=$1", [ACTOR])).rows[0].account_status, "active");
    assert.equal((await db.query("select count(*)::int n from billing_credit_grants where owner_id=$1", [ACTOR])).rows[0].n, 1);
    assert.equal((await db.query("select count(*)::int n from auth.users where id=$1", [ACTOR])).rows[0].n, 1);
  });

  await check("storage and active workflow blockers are resumable and do not start anonymization", async () => {
    await seed(); const g = await guitar();
    const otherGuitar = (await db.query("insert into guitars(owner_id,qr_code,permanent_path,name,brand,model,visibility) values($1,'QRG-OTHER-STORAGE','/i/QRG-OTHER-STORAGE','Other','Fixture','Storage','private') returning id", [OTHER])).rows[0];
    await db.query("update guitars set hero_image_path='private/path.jpg' where id=$1", [g.id]);
    await db.query("insert into storage.buckets(id,name,public) values('instrument-media','instrument-media',false) on conflict(id) do nothing");
    await db.query("insert into storage.objects(bucket_id,name) values('instrument-media',$1)", [`archive/${ACTOR}/orphan.jpg`]);
    await db.query("insert into guitar_documents(guitar_id,uploaded_by_user_id,name,storage_path,file_name,mime_type,file_size_bytes,is_public,public_description) values($1,$2,'Private Person document','other/private.pdf','private.pdf','application/pdf',10,true,'private.person@example.test')", [otherGuitar.id, ACTOR]);
    const claim = (await db.query("insert into ownership_claims(guitar_id,claim_type,status,current_owner_id,claimant_user_id) values($1,'legacy_review','denied',$2,$3) returning id", [otherGuitar.id, ACTOR, OTHER])).rows[0];
    await db.query("insert into ownership_claim_evidence(claim_id,uploaded_by,evidence_type,file_name,storage_path,private_note) values($1,$2,'receipt','claim.pdf','claim/private.pdf','Private Person')", [claim.id, OTHER]);
    await db.query("insert into ownership_transfers(guitar_id,from_owner_id,to_email,to_name,status) values($1,$2,'buyer@example.test','Buyer','sent')", [g.id, ACTOR]);
    const id = (await request()).request.requestId;
    const result = await prepareReady(id);
    assert.equal(result.fulfillment.state, "blocked");
    assert.deepEqual(result.fulfillment.blockers, ["active_ownership_transfer", "storage_cleanup_required"]);
    const preserved = (await db.query("select owner_id,visibility,summary from guitars where id=$1", [g.id])).rows[0];
    assert.equal(preserved.owner_id, ACTOR); assert.equal(preserved.visibility, "public"); assert.match(preserved.summary, /example\.test/);
    assert.equal((await db.query("select count(*)::int n from account_deletion_profile_custody")).rows[0].n, 0);
  });

  await check("a blocked review can be cancelled without orphaning state", async () => {
    await seed({ credits: 1 }); const submitted = await request(); const id = submitted.request.requestId;
    await prepare(id);
    const revision = (await db.query("select revision::text value from account_deletion_actor_revisions where actor_id=$1", [ACTOR])).rows[0].value;
    const cancelled = (await db.query("select public.cancel_account_deletion_request($1,$2,$3,$4) result", [ACTOR, id, randomUUID(), revision])).rows[0].result;
    assert.equal(cancelled.request.status, "cancelled");
    assert.equal((await db.query("select count(*)::int n from account_deletion_fulfillments")).rows[0].n, 0);
    assert.equal((await db.query("select count(*)::int n from account_deletion_fulfillment_receipts")).rows[0].n, 0);
  });

  await check("a failed quiescence transition rolls back custody and prior visibility", async () => {
    await seed(); const g = await guitar(); const id = (await request()).request.requestId;
    await db.exec(`create function public.fixture_fail_profile_freeze() returns trigger language plpgsql as $$begin
      if new.account_status='removed' then raise exception 'fixture freeze failure'; end if; return new; end$$;
      create trigger fixture_fail_profile_freeze before update on public.profiles for each row execute function public.fixture_fail_profile_freeze()`);
    await fail(() => prepare(id), "P0001");
    assert.deepEqual((await db.query("select owner_id,visibility from guitars where id=$1", [g.id])).rows[0], { owner_id: ACTOR, visibility: "public" });
    assert.equal((await db.query("select count(*)::int n from account_deletion_profile_custody where guitar_id=$1", [g.id])).rows[0].n, 0);
    assert.equal((await db.query("select count(*)::int n from account_deletion_fulfillments where request_id=$1", [id])).rows[0].n, 0);
  });

  await check("database anonymization preserves permanent identifiers and structured history while scrubbing personal content", async () => {
    await seed(); const g = await guitar();
    await db.query("update guitars set admin_archive_reason='Private Person private.person@example.test' where id=$1", [g.id]);
    await db.query("insert into guitar_specs(guitar_id,label,value) values($1,'Owner note','Private Person private.person@example.test')", [g.id]);
    await db.exec("select set_config('request.jwt.claim.role','service_role',true)");
    await db.query("update guitar_timeline_events set title='Private Person system event',description='private.person@example.test',provider_display_name='Private Person' where guitar_id=$1 and is_system", [g.id]);
    await db.exec("select set_config('request.jwt.claim.role','',true)");
    await db.query("insert into guitar_timeline_events(guitar_id,created_by_user_id,event_date,event_type,category,title,description,private_notes,shop_name,location,is_public,provider_display_name,work_order_reference,parts_installed,setup_measurements,who_performed) values($1,$2,current_date,'custom','Ownership','Private Person moved it','Email private.person@example.test','secret','Private Person Shop','Home',true,'Private Person','WO-PII','Private Person part','home address','self')", [g.id, ACTOR]);
    await db.query("insert into site_content(content_key,content_value,updated_by) values($1,$2,$3)", ["public_collection_owner:" + ACTOR, { ownerId: ACTOR, publicName: "Private Person", email: "private.person@example.test" }, ACTOR]);
    await db.query("insert into site_content(content_key,content_value,updated_by) values('record_trust:QRG-DELETE',$1,$2)", [{ authenticityStatus: "confirmed", showVerificationBadge: true, internalVerificationNote: "Home phone 555-0100", publicVerificationNote: "Lives at 10 Private Road", internalAuthenticityNote: "Private note", publicAuthenticityNote: "Personal story", legacyOwnerStory: "Private Person lived here" }, ACTOR]);
    await db.query("insert into qr_redirects(guitar_id,old_path) values($1,'/legacy/public-delete')", [g.id]);
    const id = (await request()).request.requestId, operation = randomUUID();
    const frozen = await prepare(id, operation);
    assert.equal(frozen.fulfillment.state, "quiescing_storage"); assert.equal(frozen.authActorId, null);
    assert.deepEqual(frozen.fulfillment.blockers, ["storage_quiescence_required"]);
    assert.ok(Date.parse(frozen.fulfillment.storageQuiesceUntil) > Date.parse(frozen.fulfillment.reviewedAt));
    assert.deepEqual(await prepare(id, operation), frozen);
    assert.deepEqual((await db.query("select account_status,hide_public_content from profiles where id=$1", [ACTOR])).rows[0], { account_status: "removed", hide_public_content: true });
    assert.equal((await db.query("select visibility from guitars where id=$1", [g.id])).rows[0].visibility, "private");
    assert.deepEqual((await db.query("select prior_visibility,state from account_deletion_profile_custody where guitar_id=$1", [g.id])).rows[0], { prior_visibility: "public", state: "privacy_review_required" });
    await db.query("insert into guitar_media(guitar_id,storage_path,alt) values($1,'late/public.jpg','late public media')", [g.id]);
    await db.query("insert into guitar_documents(guitar_id,uploaded_by_user_id,name,storage_path,file_name,mime_type,file_size_bytes,is_public) values($1,$2,'Late public document','late/public.pdf','public.pdf','application/pdf',10,true)", [g.id, OTHER]);
    await db.exec("set local role anon");
    for (const [table, predicate] of [["guitars", "id=$1"], ["guitar_specs", "guitar_id=$1"], ["guitar_timeline_events", "guitar_id=$1"], ["guitar_media", "guitar_id=$1"], ["guitar_documents", "guitar_id=$1"], ["qr_redirects", "guitar_id=$1"]]) {
      await fail(() => db.query(`select count(*)::int n from ${table} where ${predicate}`, [g.id]), "42501");
    }
    await db.exec("reset role");
    await db.query("delete from guitar_media where guitar_id=$1", [g.id]);
    await db.query("delete from guitar_documents where guitar_id=$1", [g.id]);
    assert.equal((await db.query(`select count(*)::int n from guitars g join profiles p on p.id=g.owner_id where g.id=$1
      and g.visibility in ('public','unlisted') and g.admin_archived_at is null and g.owner_removed_at is null
      and p.account_status='active' and not p.hide_public_content`, [g.id])).rows[0].n, 0);
    await expireStorageQuiescence(id);
    const readyOperation = randomUUID(), first = await prepare(id, readyOperation);
    assert.equal(first.fulfillment.state, "ready_for_auth_deletion"); assert.equal(first.authActorId, ACTOR);
    assert.deepEqual(await prepare(id, readyOperation), first);
    assert.deepEqual(Object.keys(first.fulfillment).sort(), ["authDeletedAt", "blockers", "completedAt", "databaseAnonymizedAt", "requestId", "reviewedAt", "revision", "startedAt", "state", "storageQuiesceUntil"]);
    const retained = (await db.query("select owner_id,qr_code,permanent_path,name,brand,model,year,serial_number,builder,location,visibility,summary,safety_note,public_safety_note,admin_archive_reason from guitars where id=$1", [g.id])).rows[0];
    assert.deepEqual(retained, { owner_id: null, qr_code: "QRG-DELETE", permanent_path: "/i/QRG-DELETE", name: "Retained instrument Profile", brand: "Synthetic", model: "Archive", year: "1962", serial_number: "SERIAL-DELETE", builder: null, location: null, visibility: "private", summary: "", safety_note: null, public_safety_note: null, admin_archive_reason: null });
    assert.equal((await db.query("select count(*)::int n from guitar_specs where guitar_id=$1", [g.id])).rows[0].n, 0);
    const events = (await db.query("select is_system,is_public,created_by_user_id,provider_user_id,event_type,category,source_key,title,description,private_notes,shop_name,location,provider_display_name,work_order_reference,parts_installed,setup_measurements,who_performed from guitar_timeline_events where guitar_id=$1 order by is_system", [g.id])).rows;
    assert.equal(events.length, 2);
    const custom = events.find(event => !event.is_system); assert.equal(custom.title, "Retained history event"); assert.equal(custom.description, "");
    const system = events.find(event => event.is_system); assert.equal(system.title, "Retained system history event"); assert.equal(system.description, ""); assert.equal(system.provider_display_name, null);
    for (const event of events) { assert.equal(event.is_public, false); assert.equal(event.event_type, null); assert.equal(event.category, "Other"); assert.equal(event.source_key, null); for (const key of ["created_by_user_id", "provider_user_id", "private_notes", "shop_name", "location", "work_order_reference", "parts_installed", "setup_measurements", "who_performed"]) assert.equal(event[key], null); }
    assert.equal((await db.query("select count(*)::int n from site_content where content_key=$1", ["public_collection_owner:" + ACTOR])).rows[0].n, 0);
    const trust = (await db.query("select content_value from site_content where content_key='record_trust:QRG-DELETE'")).rows[0].content_value;
    assert.equal(trust.authenticityStatus, "confirmed");
    assert.deepEqual(Object.keys(trust).sort(), ["authenticityStatus", "internalAuthenticityNote", "internalVerificationNote", "publicAuthenticityNote", "publicVerificationNote", "serialExceptionApproved", "showAuthenticityBadge", "showSerialPublic", "showVerificationBadge"].sort());
    for (const key of ["internalVerificationNote", "publicVerificationNote", "internalAuthenticityNote", "publicAuthenticityNote"]) assert.equal(trust[key], "");
    const custody = (await db.query("select request_id,prior_visibility,state from account_deletion_profile_custody where guitar_id=$1", [g.id])).rows[0];
    assert.deepEqual(custody, { request_id: id, prior_visibility: "public", state: "privacy_review_required" });
    assert.equal((await db.query("select actor_id from account_deletion_requests where id=$1", [id])).rows[0].actor_id, null);
    assert.equal((await db.query("select count(*)::int n from auth.users where id=$1", [ACTOR])).rows[0].n, 1);
  });

  await check("target-authored content on another Profile is sanitized without exposing or orphaning PII", async () => {
    await seed();
    const otherGuitar = (await db.query("insert into guitars(owner_id,qr_code,permanent_path,name,brand,model,visibility) values($1,'QRG-OTHER-PII','/i/QRG-OTHER-PII','Other Profile','Fixture','Other','public') returning id", [OTHER])).rows[0];
    await db.query("update guitars set safety_status_updated_by=$1,safety_note='Private Person home',public_safety_note='private.person@example.test' where id=$2", [ACTOR, otherGuitar.id]);
    await db.query("insert into service_provider_profiles(user_id,business_name,public_display_name,verification_status,verified_by,internal_review_note) values($1,'Other Shop','Other Shop','verified',$2,'Private Person approved from home')", [OTHER, ACTOR]);
    const event = (await db.query("insert into guitar_timeline_events(guitar_id,created_by_user_id,event_date,event_type,category,title,description,is_public,provider_display_name) values($1,$2,current_date,'custom','Other','Private Person contribution','private.person@example.test',true,'Private Person') returning id", [otherGuitar.id, ACTOR])).rows[0];
    await db.query("insert into guitar_external_media(guitar_id,provider,canonical_url,title,caption,is_public,created_by) values($1,'link','https://example.test/private-person','Private Person','private.person@example.test',true,$2)", [otherGuitar.id, ACTOR]);
    const submission = (await db.query("insert into service_submissions(guitar_id,provider_user_id,owner_user_id,status,title) values($1,$2,$2,'approved','Other service') returning id", [otherGuitar.id, OTHER])).rows[0];
    await db.query("insert into service_submission_notifications(submission_id,recipient_user_id,notification_type,message) values($1,$2,'review','Private Person private.person@example.test')", [submission.id, ACTOR]);
    const transfer = (await db.query("insert into ownership_transfers(guitar_id,from_owner_id,to_email,to_name,status) values($1,$2,' Private.Person@Example.Test ','Private Person',$3) returning id", [otherGuitar.id, OTHER, "cancelled"])).rows[0];
    const claim = (await db.query("insert into ownership_claims(guitar_id,claim_type,status,current_owner_id,claimant_user_id,recipient_email_normalized,acquisition_details) values($1,'legacy_review','denied',$2,$3,'private.person@example.test','Private Person home') returning id", [otherGuitar.id, OTHER, ADMIN])).rows[0];
    const claimEvent = (await db.query("insert into ownership_claim_events(claim_id,actor_user_id,action,note,metadata) values($1,$2,'reviewed','private.person@example.test',$3) returning id", [claim.id, ACTOR, { actor: ACTOR }])).rows[0];
    const id = (await request()).request.requestId;
    await fail(() => db.query("update ownership_claim_events set actor_user_id=null where id=$1", [claimEvent.id]), "PD423");
    assert.equal((await db.query("select note from ownership_claim_events where id=$1", [claimEvent.id])).rows[0].note, "private.person@example.test");
    const result = await prepareReady(id);
    assert.equal(result.fulfillment.state, "ready_for_auth_deletion");
    assert.deepEqual((await db.query("select owner_id,visibility,name from guitars where id=$1", [otherGuitar.id])).rows[0], { owner_id: OTHER, visibility: "public", name: "Other Profile" });
    assert.deepEqual((await db.query("select safety_status_updated_by,safety_note,public_safety_note from guitars where id=$1", [otherGuitar.id])).rows[0], { safety_status_updated_by: null, safety_note: null, public_safety_note: null });
    assert.deepEqual((await db.query("select verified_by,internal_review_note from service_provider_profiles where user_id=$1", [OTHER])).rows[0], { verified_by: null, internal_review_note: null });
    assert.deepEqual((await db.query("select created_by_user_id,title,description,is_public,provider_display_name from guitar_timeline_events where id=$1", [event.id])).rows[0], { created_by_user_id: null, title: "Retained history event", description: "", is_public: false, provider_display_name: null });
    assert.equal((await db.query("select count(*)::int n from guitar_external_media where guitar_id=$1", [otherGuitar.id])).rows[0].n, 0);
    assert.equal((await db.query("select count(*)::int n from service_submission_notifications where recipient_user_id=$1 or lower(message) like '%private person%'", [ACTOR])).rows[0].n, 0);
    assert.deepEqual((await db.query("select actor_user_id,note,metadata from ownership_claim_events where id=$1", [claimEvent.id])).rows[0], { actor_user_id: null, note: null, metadata: {} });
    assert.match((await db.query("select to_email from ownership_transfers where id=$1", [transfer.id])).rows[0].to_email, /^deleted\+.*@privacy\.invalid$/);
    assert.deepEqual((await db.query("select to_name from ownership_transfers where id=$1", [transfer.id])).rows[0], { to_name: null });
    assert.deepEqual((await db.query("select recipient_email_normalized,acquisition_details from ownership_claims where id=$1", [claim.id])).rows[0], { recipient_email_normalized: null, acquisition_details: null });
  });

  await check("a transferred public Profile with unscoped identity text blocks until reviewed", async () => {
    await seed(); const transferred = await guitar();
    await db.query("update guitars set owner_id=$1,name='Collector Profile',summary='Prior owner private.person@example.test',location=$2 where id=$3", [OTHER, ACTOR, transferred.id]);
    await db.query("insert into guitar_specs(guitar_id,label,value) values($1,'Provenance contact','private.person@example.test')", [transferred.id]);
    await db.query("insert into ownership_transfers(guitar_id,from_owner_id,to_email,to_name,status) values($1,$2,'other@example.test','Other Person','cancelled')", [transferred.id, ACTOR]);
    const id = (await request()).request.requestId;
    const blocked = await prepare(id);
    assert.equal(blocked.fulfillment.state, "blocked");
    assert.deepEqual(blocked.fulfillment.blockers, ["retained_personal_content_review_required"]);
    assert.deepEqual((await db.query("select owner_id,visibility,summary,location from guitars where id=$1", [transferred.id])).rows[0], {
      owner_id: OTHER, visibility: "public", summary: "Prior owner private.person@example.test", location: ACTOR
    });
    assert.equal((await db.query("select count(*)::int n from account_deletion_profile_custody")).rows[0].n, 0);
    await db.query("update guitars set summary='',location=null where id=$1", [transferred.id]);
    await db.query("delete from guitar_specs where guitar_id=$1", [transferred.id]);
    assert.equal((await prepareReady(id)).fulfillment.state, "ready_for_auth_deletion");
    assert.deepEqual((await db.query("select owner_id,visibility,summary,location from guitars where id=$1", [transferred.id])).rows[0], {
      owner_id: OTHER, visibility: "public", summary: "", location: null
    });
  });

  await check("recipient email and Auth email writes are fenced after a deletion request", async () => {
    await seed();
    const otherGuitar = (await db.query("insert into guitars(owner_id,qr_code,permanent_path,name,brand,model,visibility) values($1,'QRG-EMAIL-FENCE','/i/QRG-EMAIL-FENCE','Other','Fixture','Email','private') returning id", [OTHER])).rows[0];
    await request();
    await fail(() => db.query("insert into ownership_transfers(guitar_id,from_owner_id,to_email,to_name,status) values($1,$2,'PRIVATE.PERSON@example.test','Private Person','cancelled')", [otherGuitar.id, OTHER]), "PD423");
    await fail(() => db.query("insert into ownership_claims(guitar_id,claim_type,status,current_owner_id,recipient_email_normalized) values($1,'legacy_review','denied',$2,'private.person@example.test')", [otherGuitar.id, OTHER]), "PD423");
    await fail(() => db.query("update auth.users set email='changed@example.test' where id=$1", [ACTOR]), "PD423");
    await db.query("insert into ownership_transfers(guitar_id,from_owner_id,to_email,status) values($1,$2,'unrelated@example.test','cancelled')", [otherGuitar.id, OTHER]);
  });

  await check("a late signed upload stays blocked until the fixed quiescence rescan is clean", async () => {
    await seed(); await guitar();
    await db.query("insert into storage.buckets(id,name,public) values('instrument-media','instrument-media',false) on conflict(id) do nothing");
    const id = (await request()).request.requestId;
    const frozen = await prepare(id);
    assert.equal(frozen.fulfillment.state, "quiescing_storage");
    const selfStatus = (await db.query("select public.read_account_deletion_requests($1,null) result", [ACTOR])).rows[0].result;
    assert.equal(selfStatus.activeRequest.requestId, id);
    assert.equal(selfStatus.fulfillment.state, "quiescing_storage");
    assert.equal(selfStatus.fulfillment.storageQuiesceUntil, frozen.fulfillment.storageQuiesceUntil);
    assert.equal(JSON.stringify(selfStatus).includes("private.person@example.test"), false);
    assert.equal(Object.hasOwn(selfStatus.fulfillment, "authActorId"), false);
    const fixedDeadline = frozen.fulfillment.storageQuiesceUntil;
    const waiting = await prepare(id);
    assert.equal(waiting.fulfillment.storageQuiesceUntil, fixedDeadline);
    assert.deepEqual(waiting.fulfillment.blockers, ["storage_quiescence_required"]);
    const revision = (await db.query("select revision::text value from account_deletion_actor_revisions where actor_id=$1", [ACTOR])).rows[0].value;
    await fail(() => db.query("select public.cancel_account_deletion_request($1,$2,$3,$4) result", [ACTOR, id, randomUUID(), revision]), "PD409");
    await db.query("insert into storage.objects(bucket_id,name) values('instrument-media',$1)", [`${ACTOR}/profile-uploads/issued-before-freeze/late.jpg`]);
    await db.query("insert into storage.objects(bucket_id,name,metadata) values('instrument-media','legacy/orphan-after-freeze.jpg',$1)", [{ ownerEmail: "private.person@example.test" }]);
    await expireStorageQuiescence(id);
    const expiredDeadline = (await db.query("select public.read_account_deletion_fulfillment($1,false,$2) result", [ADMIN, id])).rows[0].result.fulfillment.storageQuiesceUntil;
    const blocked = await prepare(id);
    assert.equal(blocked.fulfillment.state, "quiescing_storage");
    assert.deepEqual(blocked.fulfillment.blockers, ["storage_cleanup_required"]);
    assert.equal(blocked.fulfillment.storageQuiesceUntil, expiredDeadline);
    const storedDeadline = (await db.query("select storage_quiesce_until<clock_timestamp() expired from account_deletion_fulfillments where request_id=$1", [id])).rows[0];
    assert.equal(storedDeadline.expired, true);
    await db.query("delete from storage.objects where name like $1 or name='legacy/orphan-after-freeze.jpg'", [`%${ACTOR}%`]);
    assert.equal((await prepare(id)).fulfillment.state, "ready_for_auth_deletion");
  });

  await check("cross-account retained content is a durable blocker that can be reviewed and resumed", async () => {
    await seed(); const g = await guitar();
    await db.query("insert into site_content(content_key,content_value,updated_by) values('unrelated-fixture',$1,$2)", [{ unexpectedActor: ACTOR }, OTHER]);
    await db.query("insert into site_content(content_key,content_value,updated_by) values('target-authored-unscoped',$1,$2)", [{ copy: "ordinary prose without identifiers" }, ACTOR]);
    const id = (await request()).request.requestId;
    const blocked = await prepare(id);
    assert.deepEqual(blocked.fulfillment.blockers, ["retained_personal_content_review_required"]);
    const unchanged = (await db.query("select owner_id,visibility,name from guitars where id=$1", [g.id])).rows[0];
    assert.deepEqual(unchanged, { owner_id: ACTOR, visibility: "public", name: "Private Person personal guitar" });
    await db.query("delete from site_content where content_key in ('unrelated-fixture','target-authored-unscoped')");
    assert.equal((await prepareReady(id)).fulfillment.state, "ready_for_auth_deletion");
  });

  await check("privacy postcondition rolls back unforeseen content created after inventory", async () => {
    await seed(); const g = await guitar(); const id = (await request()).request.requestId;
    await db.exec(`create function public.fixture_late_personal_content() returns trigger language plpgsql as $$begin
      if old.owner_id is not null and new.owner_id is null then insert into public.site_content(content_key,content_value) values('late-private-fixture',jsonb_build_object('actor',old.owner_id)); end if; return new; end$$;
      create trigger fixture_late_personal_content after update on public.guitars for each row execute function public.fixture_late_personal_content()`);
    assert.equal((await prepare(id)).fulfillment.state, "quiescing_storage");
    await expireStorageQuiescence(id);
    await fail(() => prepare(id), "PD500");
    const unchanged = (await db.query("select owner_id,visibility,name from guitars where id=$1", [g.id])).rows[0];
    assert.deepEqual(unchanged, { owner_id: ACTOR, visibility: "private", name: "Private Person personal guitar" });
    assert.equal((await db.query("select count(*)::int n from site_content where content_key='late-private-fixture'")).rows[0].n, 0);
  });

  await check("Auth deletion is a separate prerequisite and completion is idempotent", async () => {
    await seed(); const g = await guitar(); const id = (await request()).request.requestId;
    await prepareReady(id);
    await fail(() => complete(id), "PD428");
    const queued = (await db.query("select public.read_account_deletion_queue($1,false,null,null,50) result", [ADMIN])).rows[0].result.requests;
    assert.equal(queued.length, 1); assert.equal(queued[0].actorId, null); assert.equal(queued[0].fulfillment.state, "ready_for_auth_deletion");
    await db.query("delete from auth.users where id=$1", [ACTOR]);
    assert.equal((await db.query("select count(*)::int n from profiles where id=$1", [ACTOR])).rows[0].n, 0);
    assert.equal((await db.query("select count(*)::int n from guitars where id=$1", [g.id])).rows[0].n, 1);
    const operation = randomUUID(), done = await complete(id, operation);
    assert.equal(done.fulfillment.state, "completed");
    assert.deepEqual(await complete(id, operation), done);
    const responseLossRetry = await complete(id, randomUUID());
    assert.deepEqual(responseLossRetry.fulfillment, done.fulfillment);
    assert.equal((await db.query("select count(*)::int n from account_deletion_fulfillment_receipts where request_id=$1 and action='complete'", [id])).rows[0].n, 2);
    assert.equal((await db.query("select public.read_account_deletion_queue($1,false,null,null,50) result", [ADMIN])).rows[0].result.requests.length, 0);
  });

  await check("fulfillment freeze rejects a second intake before Auth deletion", async () => {
    await seed(); const id = (await request()).request.requestId; await prepareReady(id);
    await fail(() => request(), "PD409");
    assert.equal((await db.query("select count(*)::int n from account_deletion_actor_revisions where actor_id=$1", [ACTOR])).rows[0].n, 0);
    await db.query("delete from auth.users where id=$1", [ACTOR]);
    assert.equal((await complete(id)).fulfillment.state, "completed");
  });

  await check("cancelled intake history is detached before Auth deletion", async () => {
    await seed(); const old = await request();
    let revision = (await db.query("select revision::text value from account_deletion_actor_revisions where actor_id=$1", [ACTOR])).rows[0].value;
    await db.query("select public.cancel_account_deletion_request($1,$2,$3,$4) result", [ACTOR, old.request.requestId, randomUUID(), revision]);
    const current = await request();
    assert.equal((await db.query("select count(*)::int n from account_deletion_requests where actor_id=$1", [ACTOR])).rows[0].n, 2);
    assert.equal((await prepareReady(current.request.requestId)).fulfillment.state, "ready_for_auth_deletion");
    assert.equal((await db.query("select count(*)::int n from account_deletion_requests where actor_id=$1", [ACTOR])).rows[0].n, 0);
    assert.equal((await db.query("select count(*)::int n from account_deletion_request_receipts where actor_id=$1", [ACTOR])).rows[0].n, 0);
    await db.query("delete from auth.users where id=$1", [ACTOR]);
    assert.equal((await complete(current.request.requestId)).fulfillment.state, "completed");
  });

  await check("reviewer identity is removed without breaking a later Auth cascade", async () => {
    await seed();
    const otherRequest = await request(OTHER), subject = randomUUID();
    await db.query(`insert into account_deletion_fulfillments(request_id,actor_id,subject_token,actor_fingerprint,target_email,started_by,last_reviewed_by,blockers)
      values($1::uuid,$2::uuid,$3::uuid,sha256(convert_to($2::uuid::text||':'||$3::uuid::text,'UTF8')),'other@example.test',$4::uuid,$4::uuid,'["inventory_pending"]'::jsonb)`, [otherRequest.request.requestId, OTHER, subject, ACTOR]);
    const actorRequest = (await request()).request.requestId;
    await prepareReady(actorRequest);
    assert.deepEqual((await db.query("select started_by,last_reviewed_by from account_deletion_fulfillments where request_id=$1", [otherRequest.request.requestId])).rows[0], { started_by: null, last_reviewed_by: null });
    await db.query("delete from auth.users where id=$1", [ACTOR]);
    await complete(actorRequest);
    assert.equal((await prepareReady(otherRequest.request.requestId)).fulfillment.state, "ready_for_auth_deletion");
    await db.query("delete from auth.users where id=$1", [OTHER]);
    assert.equal((await complete(otherRequest.request.requestId)).fulfillment.state, "completed");
  });

  await check("the irreversible fingerprint fences the deleted UUID after the Auth cascade race", async () => {
    await seed(); const id = (await request()).request.requestId; await prepareReady(id); await db.query("delete from auth.users where id=$1", [ACTOR]); await complete(id);
    await fail(() => db.query("insert into billing_orders(owner_id,environment,request_key,offer,status) values($1,'live',$2,'{}','expired')", [ACTOR, randomUUID()]), "PD423");
    await db.query("insert into billing_orders(owner_id,environment,request_key,offer,status) values($1,'live',$2,'{}','expired')", [OTHER, randomUUID()]);
    assert.equal((await db.query("select count(*)::int n from billing_orders where owner_id=$1", [OTHER])).rows[0].n, 1);
  });

  await check("held Profiles cannot be made public, reassigned, transferred, claimed or deleted", async () => {
    await seed(); const g = await guitar();
    const otherGuitar = (await db.query("insert into guitars(owner_id,qr_code,permanent_path,name,brand,model,visibility) values($1,'QRG-CUSTODY-OTHER','/i/QRG-CUSTODY-OTHER','Other','Fixture','Other','private') returning id", [OTHER])).rows[0];
    const closedTransfer = (await db.query("insert into ownership_transfers(guitar_id,from_owner_id,to_email,status) values($1,$2,'buyer@example.test','cancelled') returning id", [g.id, ACTOR])).rows[0];
    const closedClaim = (await db.query("insert into ownership_claims(guitar_id,claim_type,status,current_owner_id,claimant_user_id) values($1,'legacy_review','denied',$2,$3) returning id", [g.id, ACTOR, OTHER])).rows[0];
    const id = (await request()).request.requestId; await prepareReady(id);
    for (const mutation of [
      () => db.query("update guitars set visibility='public' where id=$1", [g.id]),
      () => db.query("update guitars set owner_id=$1 where id=$2", [OTHER, g.id]),
      () => db.query("delete from guitars where id=$1", [g.id]),
      () => db.query("insert into ownership_transfers(guitar_id,from_owner_id,to_email,status) values($1,$2,'buyer@example.test','draft')", [g.id, OTHER]),
      () => db.query("insert into ownership_claims(guitar_id,claim_type,status,claimant_user_id) values($1,'legacy_review','admin_review',$2)", [g.id, OTHER]),
      () => db.query("update ownership_transfers set guitar_id=$1 where id=$2", [otherGuitar.id, closedTransfer.id]),
      () => db.query("update ownership_claims set guitar_id=$1 where id=$2", [otherGuitar.id, closedClaim.id])
    ]) await fail(mutation, "PD423");
    const row = (await db.query("select owner_id,visibility from guitars where id=$1", [g.id])).rows[0]; assert.deepEqual(row, { owner_id: null, visibility: "private" });
    assert.equal((await db.query("select count(*)::int n from guitars where id=$1 and visibility='public' and owner_id is not null and admin_archived_at is null and owner_removed_at is null", [g.id])).rows[0].n, 0);
    await fail(() => db.query("update profiles set account_status='active',display_name='Restored Person' where id=$1", [ACTOR]), "PD423");
  });

  await check("protocol tables and tombstones cannot be rewritten directly", async () => {
    await seed({ credits: 1 }); const id = (await request()).request.requestId; const result = await prepare(id);
    assert.equal(result.fulfillment.state, "blocked");
    await fail(() => db.query("update account_deletion_fulfillments set blockers='[]' where request_id=$1", [id]), "42501");
    await fail(() => db.query("delete from account_deletion_fulfillment_receipts where request_id=$1", [id]), "42501");
    assert.equal((await db.query("select octet_length(actor_fingerprint) n from account_deletion_fulfillments where request_id=$1", [id])).rows[0].n, 32);
  });

  console.log(`Account deletion fulfillment database tests passed (${passed}).`);
} finally {
  await db.close();
}
