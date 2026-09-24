import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PGlite} from '@electric-sql/pglite';
import {installRepositorySchema} from './postgres-fixture.mjs';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..');
const migration=fs.readFileSync(path.join(repo,'supabase/migrations/20260923120000_five_free_profiles.sql'),'utf8');
const creditedSignature='public.create_instrument_profile_credited(uuid,text,text,jsonb,boolean,text,text)';
const definition=async(db,signature)=>(await db.query('select pg_get_functiondef($1::regprocedure) value',[signature])).rows[0].value;
const status=async(db,owner)=>(await db.query("select billing_account_status($1,'live') value",[owner])).rows[0].value;
const owner='72000000-0000-4000-8000-000000000001';
const db=new PGlite();
try {
 await installRepositorySchema(db,repo,'20260923120000');
 await db.query('insert into auth.users(id) values($1)',[owner]);
 await db.query('insert into profiles(id,plan) values($1,$2)',[owner,'single']);
 for(let index=0;index<25;index++)await db.query("insert into guitars(owner_id,qr_code,permanent_path,name,brand) values($1,$2,$3,'Existing','Fixture')",[owner,'QRG-EXISTING-'+index,'/i/QRG-EXISTING-'+index]);
 const before=await status(db,owner);
 assert.equal(before.freeLimit,25);
 assert.equal(before.ownedProfiles,25);
 await db.exec(migration);
 const after=await status(db,owner);
 assert.equal(after.freeLimit,5);
 assert.equal(after.freeRemaining,0);
 assert.equal(after.ownedProfiles,25);
 assert.equal(after.paidConsumed,0);
 const first=await definition(db,creditedSignature);
 await db.exec(migration);
 assert.equal(await definition(db,creditedSignature),first);
 assert.deepEqual(await status(db,owner),after);
 assert.equal((await db.query('select count(*)::int n from guitars where owner_id=$1',[owner])).rows[0].n,25);
 console.log('PASS existing 25 Profiles remain; five-free transition and retry change no historical credit consumption');
}finally{await db.close();}

const mixed=new PGlite();
try {
 await installRepositorySchema(mixed,repo,'20260923120000');
 const old=await definition(mixed,creditedSignature);
 await mixed.exec(old.replace('(select count(*) from public.guitars where owner_id=p_owner_id)>=25','(select count(*) from public.guitars where owner_id=p_owner_id)>=5'));
 await assert.rejects(()=>mixed.exec(migration),/mixed or unrecognized/);
 await mixed.exec('rollback');
 assert.equal((await status(mixed,owner)).freeLimit,25);
 console.log('PASS mixed allowance transition fails without changing billing status');
}finally{await mixed.close();}