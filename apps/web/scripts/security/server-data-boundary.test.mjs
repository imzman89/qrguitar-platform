import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createMemoryDatabase, loadRoutes } from "./mock-routes.mjs";
const args = process.argv.slice(2);
const option = (name) => args[args.indexOf(name) + 1];
const repo = path.resolve(args.includes("--repo") ? option("--repo") : path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../.."));
const proposal = args.includes("--proposal") ? path.resolve(option("--proposal")) : repo;
const runtimeRoot = args.includes("--runtime") ? path.resolve(option("--runtime")) : repo;
const { PGlite } = createRequire(path.join(runtimeRoot, "package.json"))("@electric-sql/pglite");
const db = new PGlite();
const owner = "11111111-1111-4111-8111-111111111111";
const recipient = "22222222-2222-4222-8222-222222222222";
const guitar = "33333333-3333-4333-8333-333333333333";
const tableNames = [
  "profiles", "guitars", "qr_redirects", "guitar_specs", "guitar_timeline_events",
  "guitar_media", "guitar_documents", "ownership_transfers", "site_content",
  "guitar_serial_aliases", "guitar_external_media", "ownership_claims",
  "ownership_claim_evidence", "ownership_claim_events", "admin_audit_events",
  "service_provider_profiles", "service_provider_profile_access", "service_submissions",
  "service_submission_evidence", "service_submission_tokens", "service_submission_activity",
  "service_submission_notifications"
];
async function role(name) {
  await db.exec("reset role; select set_config('request.jwt.claim.role','" + name + "',false); set role " + name);
}
async function apply(relative) {
  const source = fs.readFileSync(path.join(repo, relative), "utf8");
  // PGlite includes gen_random_uuid natively; pgcrypto's separate extension bundle is unnecessary for this fixture.
  try { await db.exec(source.replace(/create extension if not exists "?pgcrypto"?;/gi, "")); }
  catch (error) { console.error("Schema fixture failed while applying " + relative); throw error; }
}
const sql = fs.readFileSync(path.join(proposal, "supabase/migrations/20260910235900_server_data_boundary.sql"), "utf8");
try {
  await db.exec([
    "create role anon; create role authenticated; create role service_role bypassrls;",
    "create schema auth; create table auth.users(id uuid primary key);",
    "create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;",
    "create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role',true),'') $$;",
    "grant usage on schema public,auth to anon,authenticated,service_role;",
    "create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);",
    "create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);",
    "alter table storage.objects enable row level security;",
    "create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;",
    "grant usage on schema storage to anon,authenticated,service_role;",
    "grant select,insert,update,delete on storage.objects to anon,authenticated,service_role;",
    "insert into storage.buckets(id,name,public) values ('instrument-media','instrument-media',true),('instrument-documents','instrument-documents',true),('unrelated-assets','unrelated-assets',true);"
  ].join("\n"));
  for (const file of ["schema.sql", "security-rls.sql", "admin-panel-foundation.sql", "record-archive-controls.sql", "service-history-timeline.sql", "lost-stolen-safety-status.sql"]) await apply("supabase/" + file);
  for (const file of fs.readdirSync(path.join(repo, "supabase/migrations")).filter((name) => name.endsWith(".sql") && name < "20260910235900").sort()) await apply("supabase/migrations/" + file);
  await db.query("insert into auth.users(id) values ($1),($2)", [owner, recipient]);
  await db.query("insert into public.profiles(id,display_name,role,account_status,admin_notes) values ($1,'Ordinary owner','owner','banned','PRIVATE OPERATOR NOTE'),($2,'Recipient','owner','active','')", [owner, recipient]);
  await db.query("insert into public.guitars(id,owner_id,qr_code,permanent_path,name,brand,serial_number,visibility,admin_archived_at,admin_archive_reason) values ($1,$2,'QRG-SYNTH001','/i/QRG-SYNTH001','Synthetic test','Synthetic','SECRET-SERIAL-001','public',now(),'PRIVATE ARCHIVE REASON')", [guitar, owner]);
  await db.query("insert into public.admin_audit_events(action,reason,target_user_id) values ('test-only','OTHER USERS PRIVATE AUDIT',$1)", [recipient]);
  await db.query("insert into storage.objects(bucket_id,name) values ('instrument-documents',$1),('unrelated-assets','public-logo.svg')", [owner + "/" + guitar + "/private.pdf"]);
  await db.exec("create policy fixture_unrelated_assets on storage.objects for select using(bucket_id='unrelated-assets')");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);

  await role("anon");
  assert.equal((await db.query("select admin_notes from public.profiles where id=$1", [owner])).rows[0].admin_notes, "PRIVATE OPERATOR NOTE");
  assert.equal((await db.query("select serial_number,admin_archive_reason from public.guitars where id=$1", [guitar])).rows[0].serial_number, "SECRET-SERIAL-001");
  await role("authenticated");
  assert.ok((await db.query("select reason from public.admin_audit_events")).rows.some((row) => row.reason === "OTHER USERS PRIVATE AUDIT"));
  const escalated = await db.query("update public.profiles set role='admin',account_status='active',remaining_code_count=999999 where id=$1 returning id,role,account_status", [owner]);
  assert.equal(escalated.rows[0].role, "admin");
  const admin = await loadRoutes(repo, createMemoryDatabase({ profiles: escalated.rows }), { realAdmin: true, user: { id: owner, email: "synthetic@example.test" } })("apps/web/lib/admin-auth.ts").getAdminContext(new Request("https://mock.invalid"));
  assert.equal(admin.ok, true);
  assert.equal((await db.query("update public.guitars set status='verified',admin_archived_at=null where id=$1 returning status", [guitar])).rows[0].status, "verified");
  console.log("BASELINE REPRODUCED against actual checked-in schema/grants/migrations: anonymous serial/admin-note reads, ordinary owner audit reads, self-admin/unban/credits, and self-verification/unarchive.");

  await role("postgres");
  // Legacy column-level grants are a negative fixture: plain table REVOKE alone must not suffice.
  await db.exec("grant update(role) on public.profiles to authenticated; grant select(serial_number) on public.guitars to anon;");
  await db.exec(sql);
  await db.exec(sql);
  for (const name of tableNames) {
    for (const client of ["anon", "authenticated"]) {
      for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]) {
        assert.equal((await db.query("select has_table_privilege($1,$2,$3) as allowed", [client, "public." + name, privilege])).rows[0].allowed, false, client + " " + name + " " + privilege);
      }
    }
  }
  const columns = await db.query("select c.relname,a.attname from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1) and a.attnum>0 and not a.attisdropped", [tableNames]);
  for (const column of columns.rows) {
    for (const client of ["anon", "authenticated"]) for (const privilege of ["SELECT", "INSERT", "UPDATE", "REFERENCES"]) {
      assert.equal((await db.query("select has_column_privilege($1,$2,$3,$4) as allowed", [client,"public." + column.relname,column.attname,privilege])).rows[0].allowed, false);
    }
  }

  for (const client of ["anon", "authenticated"]) {
    await role(client);
    for (const query of [
      "select admin_notes from public.profiles",
      "select serial_number from public.guitars",
      "select * from public.admin_audit_events",
      "update public.profiles set role='admin'",
      "update public.profiles set account_status='active'",
      "update public.guitars set status='verified',admin_archived_at=null",
      "delete from public.guitars",
      "insert into public.guitars(name,brand,qr_code,permanent_path) values('Unauthorized','X','QRG-UNAUTH','/i/QRG-UNAUTH')"
    ]) await assert.rejects(db.exec(query), (error) => error.code === "42501");
  }
  await role("postgres");
  assert.equal((await db.query("select count(*)::int as public_count from storage.buckets where id in ('instrument-media','instrument-documents','service-evidence') and public")).rows[0].public_count, 0);
  // Prove the restrictive fence survives historical table grants/policies being reapplied.
  await apply("supabase/security-rls.sql");
  await apply("supabase/admin-panel-foundation.sql");
  await role("authenticated");
  assert.equal((await db.query("select * from public.profiles")).rows.length, 0);
  assert.equal((await db.query("update public.profiles set role='admin' where id=$1 returning id", [owner])).rows.length, 0);
  assert.equal((await db.query("select * from public.guitars")).rows.length, 0);
  assert.equal((await db.query("select * from public.admin_audit_events")).rows.length, 0);
  assert.equal((await db.query("select * from storage.objects where bucket_id='instrument-documents'")).rows.length, 0);
  assert.equal((await db.query("delete from storage.objects where bucket_id='instrument-documents' returning id")).rows.length, 0);
  assert.equal((await db.query("select * from storage.objects where bucket_id='unrelated-assets'")).rows.length, 1);
  await role("postgres");
  await db.exec(sql);

  // Privileged server operations and the real, already-restricted transfer RPC remain functional.
  await role("service_role");
  assert.equal((await db.query("update public.profiles set role='owner',account_status='active',remaining_code_count=5 where id=$1 returning remaining_code_count", [owner])).rows[0].remaining_code_count, 5);
  const transfer = await db.query("insert into public.ownership_transfers(guitar_id,from_owner_id,to_email,status) values($1,$2,'recipient@example.test','sent') returning id", [guitar, owner]);
  const transferId = transfer.rows[0].id;
  await db.query("select public.complete_ownership_transfer($1,$2)", [transferId, recipient]);
  assert.equal((await db.query("select owner_id from public.guitars where id=$1", [guitar])).rows[0].owner_id, recipient);
  assert.equal((await db.query("select status from public.ownership_transfers where id=$1", [transferId])).rows[0].status, "accepted");
  for (const client of ["anon", "authenticated"]) {
    await role(client);
    await assert.rejects(db.query("select public.complete_ownership_transfer($1,$2)", [transferId, owner]), (error) => error.code === "42501");
    await assert.rejects(db.query("select public.approve_ownership_claim($1,$2,null)", [transferId, owner]), (error) => error.code === "42501");
    await assert.rejects(db.query("select * from public.approve_service_submission($1,$2,null)", [transferId, owner]), (error) => error.code === "42501");
  }
  await role("service_role");
  assert.equal((await db.query("select * from storage.objects where bucket_id='instrument-documents'")).rows.length, 1);
  console.log("FIX VERIFIED: table/column grants, legacy-grant reapplication, storage privacy, normal server writes, and the actual ownership transfer RPC pass PostgreSQL tests; client RPC calls remain denied.");
} catch (error) {
  console.error(error.message, error.code || ""); process.exitCode = 1;
} finally {
  await db.close();
}



