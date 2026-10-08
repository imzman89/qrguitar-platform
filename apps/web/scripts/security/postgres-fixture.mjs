import fs from "node:fs";
import path from "node:path";

// Real repository DDL and every earlier migration, with only Supabase's auth/storage runtime scaffolded.
export async function installRepositorySchema(db, repo, beforeMigration = "99999999999999") {
  await db.exec([
    "create role anon; create role authenticated; create role service_role bypassrls;",
    "create schema auth; create table auth.users(id uuid primary key, email text);",
    "create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;",
    "create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role',true),'') $$;",
    "grant usage on schema public,auth to anon,authenticated,service_role;",
    "create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);",
    "create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,owner uuid,owner_id text,metadata jsonb,user_metadata jsonb,version text,updated_at timestamptz not null default now());",
    "alter table storage.objects enable row level security;",
    "create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;",
    "grant usage on schema storage to anon,authenticated,service_role;",
    "grant select,insert,update,delete on storage.objects to anon,authenticated,service_role;"
  ].join("\n"));
  const files = ["schema.sql", "security-rls.sql", "admin-panel-foundation.sql", "record-archive-controls.sql", "service-history-timeline.sql", "lost-stolen-safety-status.sql"];
  files.push(...fs.readdirSync(path.join(repo, "supabase/migrations")).filter((name) => name.endsWith(".sql") && name < beforeMigration).sort().map((name) => "migrations/" + name));
  for (const file of files) {
    // gen_random_uuid is built into this PostgreSQL runtime; the external pgcrypto bundle is not required.
    const sql = fs.readFileSync(path.join(repo, "supabase", file), "utf8").replaceAll("\r\n", "\n").replace(/create extension if not exists "?pgcrypto"?;/gi, "");
    try { await db.exec(sql); }
    catch (error) { console.error("Failed repository schema fixture: " + file); throw error; }
  }
}

