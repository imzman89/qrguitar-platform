import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {PGlite} from "@electric-sql/pglite-pg17";
export const appRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
export const repoRoot=path.resolve(appRoot,"../..");
export const readRepo=(relative)=>fs.readFileSync(path.join(repoRoot,relative),"utf8").replace(/^\uFEFF/,"");
export async function createTestDb(migrations=[]){
  const db=new PGlite();
  await db.exec(`create schema auth;create table auth.users(id uuid primary key);
    create role anon;create role authenticated;create role service_role;
    create function auth.uid() returns uuid language sql as $$select null::uuid$$;
    create function auth.role() returns text language sql as $$select current_user::text$$;
    create schema storage;
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text not null,name text not null,metadata jsonb,unique(bucket_id,name));`);
  for(const file of ["schema.sql","private-document-vault.sql","admin-panel-foundation.sql","record-archive-controls.sql","core-profile-history-claims.sql"]){
    await db.exec(readRepo("supabase/"+file).replace(/create extension if not exists "?pgcrypto"?;/gi,""));
  }
  for(const migration of migrations)await db.exec(readRepo("supabase/migrations/"+migration));
  return db;
}
export function reportFailure(error){console.error({message:error.message,code:error.code,position:error.position,where:error.where});process.exitCode=1;}

