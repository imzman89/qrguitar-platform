import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { installRepositorySchema } from "./postgres-fixture.mjs";
const args = process.argv.slice(2), option = (name) => args[args.indexOf(name) + 1];
const repo = path.resolve(args.includes("--repo") ? option("--repo") : path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../.."));
const proposal = args.includes("--proposal") ? path.resolve(option("--proposal")) : repo;
const runtime = args.includes("--runtime") ? path.resolve(option("--runtime")) : repo;
const { PGlite } = createRequire(path.join(runtime, "package.json"))("@electric-sql/pglite");
const db = new PGlite();
const owner = "11111111-1111-4111-8111-111111111111", provider = "22222222-2222-4222-8222-222222222222", stranger = "33333333-3333-4333-8333-333333333333", guitar = "44444444-4444-4444-8444-444444444444", submission = "55555555-5555-4555-8555-555555555555";
const uploadValues = (name) => ({ file_name: name + ".pdf", mime_type: "application/pdf", evidence_type: "receipt", file_size_bytes: 5, storage_path: submission + "/" + provider + "/" + name + ".pdf" });
async function evidence(action, value, actor = provider, admin = false) { return (await db.query("select public.commit_service_evidence($1,$2,$3,$4,$5::jsonb) as row", [submission,actor,admin,action,value])).rows[0].row; }
async function media(action, id = null, values = {}, actor = owner, admin = false) { return (await db.query("select public.mutate_external_media($1,$2,$3,$4,$5,$6::jsonb) as row", [guitar,actor,admin,action,id,values])).rows[0].row; }
async function snapshot() {
  return (await db.query("select jsonb_build_object('guitars',(select jsonb_agg(to_jsonb(g) order by id) from guitars g),'evidence',(select jsonb_agg(to_jsonb(e) order by id) from service_submission_evidence e),'activity',(select jsonb_agg(to_jsonb(a) order by id) from service_submission_activity a),'media',(select jsonb_agg(to_jsonb(m) order by id) from guitar_external_media m),'submissions',(select jsonb_agg(to_jsonb(s) order by id) from service_submissions s),'timeline',(select jsonb_agg(to_jsonb(t) order by id) from guitar_timeline_events t)) as state")).rows[0].state;
}
let passes = 0;
async function test(name, run) { await run(); passes++; console.log("PASS " + name); }
try {
  await installRepositorySchema(db, repo, "20260911002000");
  for (let i = 0; i < 2; i++) for (const name of ["20260911002000_atomic_service_evidence.sql", "20260911002100_atomic_external_media.sql"]) await db.exec(fs.readFileSync(path.join(proposal,"supabase/migrations",name),"utf8"));
  const correctedEvidence=fs.readFileSync(path.join(proposal,"supabase/migrations/20260917174500_business_conflict_responses.sql"),"utf8").match(/create or replace function public\.commit_service_evidence\([\s\S]*?\$\$;/i)?.[0];
  assert(correctedEvidence,"Reviewed evidence conflict function missing");await db.exec(correctedEvidence);
  await db.query("insert into auth.users(id,email) values($1,'owner@example.test'),($2,'provider@example.test'),($3,'recipient@example.test')", [owner,provider,stranger]);
  await db.query("insert into profiles(id,display_name) values($1,'Owner'),($2,'Provider'),($3,'Stranger')", [owner,provider,stranger]);
  await db.query("insert into guitars(id,owner_id,qr_code,permanent_path,name,brand) values($1,$2,'QRG-AUDIT','/i/QRG-AUDIT','Synthetic','Synthetic')", [guitar,owner]);
  await db.query("insert into service_submissions(id,guitar_id,provider_user_id,owner_user_id,title,work_performed) values($1,$2,$3,$4,'Synthetic service','Synthetic work')", [submission,guitar,provider,owner]);
  await test("both RPCs reject direct anon/authenticated execution, including forged admin flag", async () => {
    for (const role of ["anon","authenticated"]) {
      await db.exec("reset role; set role " + role);
      await assert.rejects(evidence("upload",uploadValues("unauthorized"),stranger,true), error=>error.code==="42501");
      await assert.rejects(media("insert",null,{title:"Unauthorized"},stranger,true),error=>error.code==="42501");
    }
    await db.exec("reset role; set role service_role");
  });
  let originalEvidence;
  await test("provider upload creates evidence and audit in the same commit", async () => {
    originalEvidence = await evidence("upload",uploadValues("original"));
    assert.equal(originalEvidence.uploaded_by_user_id,provider);
    assert.equal((await db.query("select count(*)::int n from service_submission_activity where metadata->>'evidenceId'=$1 and action='evidence_uploaded'",[originalEvidence.id])).rows[0].n,1);
  });
  await test("non-provider owner/stranger cannot modify private provider evidence", async () => {
    const before = await snapshot();
    for (const actor of [owner,stranger]) await assert.rejects(evidence("delete",{id:originalEvidence.id},actor),error=>error.code==="42501");
    assert.deepEqual(await snapshot(),before);
  });
  await test("upload rejects a path outside this submission and uploader", async () => {
    const before = await snapshot();
    await assert.rejects(evidence("upload",{...uploadValues("wrong"),storage_path:"somebody-else/private.pdf"}),error=>error.code==="22023");
    assert.deepEqual(await snapshot(),before);
  });
  await test("a submitted request rejects evidence mutation after a stale draft authorization", async () => {
    await db.query("update service_submissions set status='submitted' where id=$1",[submission]);
    const before = await snapshot();
    await assert.rejects(evidence("delete",{id:originalEvidence.id}),error=>error.code==="PT409");
    await assert.rejects(evidence("upload",uploadValues("after-submit")),error=>error.code==="PT409");
    assert.deepEqual(await snapshot(),before);
  });
  await test("actual approval preserves evidence against delayed provider upload/delete", async () => {
    await db.query("select public.approve_service_submission($1,$2,null)",[submission,owner]);
    const before=await snapshot();
    await assert.rejects(evidence("delete",{id:originalEvidence.id}),error=>error.code==="PT409");
    await assert.rejects(evidence("upload",uploadValues("after-approval")),error=>error.code==="PT409");
    assert.deepEqual(await snapshot(),before);
  });
  await test("explicit server admin evidence removal records the committed row/path", async () => {
    const removed=await evidence("delete",{id:originalEvidence.id},owner,true);
    assert.equal(removed.storage_path,originalEvidence.storage_path);
    assert.equal((await db.query("select count(*)::int n from service_submission_evidence where id=$1",[originalEvidence.id])).rows[0].n,0);
  });
  await test("missing evidence cannot be reported as a successful removal", async () => {
    const before=await snapshot();
    await assert.rejects(evidence("delete",{id:originalEvidence.id},owner,true),error=>error.code==="P0002");
    assert.deepEqual(await snapshot(),before);
  });
  await db.query("update service_submissions set status='changes_requested' where id=$1",[submission]);
  const rollbackEvidence=await evidence("upload",uploadValues("rollback"));
  await db.exec("reset role; create function fixture_evidence_audit_failure() returns trigger language plpgsql as $$ begin if current_setting('fixture.audit_failure',true)='on' then raise exception 'synthetic audit failure'; end if; return new; end $$; create trigger fixture_evidence_audit_failure before insert on service_submission_activity for each row execute function fixture_evidence_audit_failure(); set role service_role; select set_config('fixture.audit_failure','on',false)");
  for (const action of ["upload","delete"]) await test("audit failure rolls back evidence " + action,async()=>{
    const before=await snapshot();
    await assert.rejects(evidence(action,action==="upload"?uploadValues("must-not-exist"):{id:rollbackEvidence.id}),/synthetic audit failure/);
    assert.deepEqual(await snapshot(),before);
  });
  await db.exec("select set_config('fixture.audit_failure','off',false)");
  await test("banned provider cannot write through the service RPC",async()=>{
    await db.query("update profiles set account_status='banned' where id=$1",[provider]);
    await assert.rejects(evidence("upload",uploadValues("blocked")),error=>error.code==="42501");
    await db.query("update profiles set account_status='active' where id=$1",[provider]);
  });
  let mediaRow;
  await test("external media create/update writes only editable columns",async()=>{
    mediaRow=await media("insert",null,{provider:"youtube",canonical_url:"https://www.youtube.com/watch?v=abcdefghijk",provider_id:"abcdefghijk",title:"Before",caption:"Keep me",is_public:false});
    const updated=await media("update",mediaRow.id,{title:"After",guitar_id:"not-a-guitar",created_by:stranger,provider:"link"});
    assert.equal(updated.title,"After"); assert.equal(updated.provider,"youtube"); assert.equal(updated.created_by,owner); assert.equal(updated.caption,"Keep me"); assert.equal(updated.guitar_id,guitar);
  });
  await test("former owner cannot create/update/delete media after actual ownership transfer",async()=>{
    const transfer=(await db.query("insert into ownership_transfers(guitar_id,from_owner_id,to_email,status) values($1,$2,'recipient@example.test','sent') returning id",[guitar,owner])).rows[0].id;
    await db.query("select public.complete_ownership_transfer($1,$2,null,null,false,'Recipient')",[transfer,stranger]);
    const before=await snapshot();
    for(const action of ["insert","update","delete"]) await assert.rejects(media(action,mediaRow.id,{title:"Must not change"}),error=>error.code==="42501");
    assert.deepEqual(await snapshot(),before);
  });
  await test("current owner can remove media after transfer; a second delete fails",async()=>{
    assert.equal((await media("delete",mediaRow.id,{},stranger)).id,mediaRow.id);
    await assert.rejects(media("delete",mediaRow.id,{},stranger),error=>error.code==="P0002");
  });
  console.log(passes+" real PostgreSQL auxiliary API tests passed.");
} finally { await db.close(); }
