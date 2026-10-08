import assert from "node:assert/strict";
import { createTestDb, readRepo } from "./atomic-test-support.mjs";

const migration = "supabase/migrations/20260917170000_ownership_claim_guards.sql";
const db = await createTestDb(["20260911001500_atomic_ownership_transfers.sql"]);
const owner = "10000000-0000-4000-8000-000000000001", claimant = "10000000-0000-4000-8000-000000000002", stranger = "10000000-0000-4000-8000-000000000003", admin = "10000000-0000-4000-8000-000000000004";
let fixtureCount = 0, passes = 0;
const tables = ["profiles", "guitars", "ownership_claims", "ownership_claim_events", "guitar_timeline_events", "ownership_transfers"];
async function snapshot() {
  const result = {};
  for (const table of tables) result[table] = (await db.query(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) rows from public.${table} t`)).rows[0].rows;
  return result;
}
async function fixture({ status = "awaiting_owner", guitarOwner = owner, claimOwner = guitarOwner, recipient = claimant } = {}) {
  const code = "QRG-CLAIM" + ++fixtureCount;
  const guitar = (await db.query("insert into guitars(owner_id,qr_code,permanent_path,name,brand,visibility) values($1,$2,$3,'Synthetic claim guitar','Synthetic','private') returning *", [guitarOwner, code, "/i/" + code])).rows[0];
  const claim = (await db.query("insert into ownership_claims(guitar_id,claim_type,status,current_owner_id,claimant_user_id,expires_at) values($1,'store_purchase',$2,$3,$4,clock_timestamp()+interval '1 day') returning *", [guitar.id, status, claimOwner, recipient])).rows[0];
  return { guitar, claim };
}
async function approve(claim, { actor = owner, note = null, envAdmin = false } = {}) {
  return (await db.query("select public.approve_ownership_claim($1,$2,$3,$4) result", [claim.id, actor, note, envAdmin])).rows[0].result;
}
async function test(name, run) {
  await db.exec("begin");
  try { await run(); passes++; console.log("PASS " + name); }
  finally { await db.exec("rollback"); }
}
async function rejects(run, code) {
  await db.exec("savepoint expected_failure");
  try { await assert.rejects(run, (error) => error.code === code); }
  finally { await db.exec("rollback to savepoint expected_failure"); }
}
try {
  await db.exec("alter table auth.users add column email text");
  await db.exec(readRepo(migration));
  await db.exec(readRepo(migration));
  await db.query("insert into auth.users(id,email) values($1,'owner@example.invalid'),($2,'claimant@example.invalid'),($3,'stranger@example.invalid'),($4,'admin@example.invalid')", [owner, claimant, stranger, admin]);
  await db.query("insert into profiles(id,display_name,role,plan) values($1,'Owner','owner','single'),($2,'Claimant','builder','enterprise'),($3,'Stranger','owner','single'),($4,'Admin','admin','single')", [owner, claimant, stranger, admin]);

  await test("migration is replayable and only service_role can execute guarded approval", async () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      assert.equal((await db.query("select has_function_privilege($1,'public.approve_ownership_claim(uuid,uuid,text,boolean)','EXECUTE') allowed", [role])).rows[0].allowed, role === "service_role");
      assert.equal((await db.query("select has_function_privilege($1,'public.approve_ownership_claim(uuid,uuid,text)','EXECUTE') allowed", [role])).rows[0].allowed, false);
    }
    const { claim } = await fixture();
    for (const role of ["anon", "authenticated"]) {
      await db.exec("set role " + role);
      await rejects(() => approve(claim, { actor: stranger, note: "Forged admin", envAdmin: true }), "42501");
      await db.exec("reset role");
    }
  });
  await test("current owner approval changes ownership and writes one receipt and timeline event", async () => {
    const { guitar, claim } = await fixture();
    const profileBefore = (await db.query("select to_jsonb(p) row from profiles p where id=$1", [claimant])).rows[0].row;
    const result = await approve(claim);
    assert.equal(result.ok, true); assert.equal(result.replayed, false); assert.equal(result.claim_id, claim.id);
    const saved = (await db.query("select * from guitars where id=$1", [guitar.id])).rows[0];
    assert.equal(saved.owner_id, claimant); assert.equal(saved.qr_code, guitar.qr_code); assert.equal(saved.permanent_path, guitar.permanent_path);
    assert.equal((await db.query("select count(*)::int n from ownership_claim_events where claim_id=$1 and action='approved'", [claim.id])).rows[0].n, 1);
    assert.equal((await db.query("select count(*)::int n from guitar_timeline_events where guitar_id=$1 and source_key=$2", [guitar.id, "ownership-claim:" + claim.id])).rows[0].n, 1);
    assert.deepEqual((await db.query("select to_jsonb(p) row from profiles p where id=$1", [claimant])).rows[0].row, profileBefore);
  });
  await test("unrelated actor and claimant cannot approve an owner's claim", async () => {
    const { claim } = await fixture(), before = await snapshot();
    for (const actor of [claimant, stranger]) await rejects(() => approve(claim, { actor }), "42501");
    assert.deepEqual(await snapshot(), before);
  });
  await test("admin_review requires administrator authority and an operator reason", async () => {
    const { claim } = await fixture({ status: "admin_review" });
    await rejects(() => approve(claim), "42501");
    await rejects(() => approve(claim, { actor: admin }), "22023");
    assert.equal((await approve(claim, { actor: admin, note: "Reviewed private evidence" })).ok, true);
  });
  await test("trusted server environment admin may approve unowned instruments with a reason", async () => {
    const { claim } = await fixture({ status: "admin_review", guitarOwner: null });
    await rejects(() => approve(claim, { actor: stranger, note: "No authority" }), "42501");
    assert.equal((await approve(claim, { actor: stranger, note: "Owner-authorized review", envAdmin: true })).ok, true);
  });
  for (const actorType of ["reviewer", "claimant"]) await test(`${actorType} must still have an active account at approval`, async () => {
    const { claim } = await fixture(), id = actorType === "reviewer" ? owner : claimant;
    for (const status of ["locked", "banned", "removed"]) {
      await db.query("update profiles set account_status=$1 where id=$2", [status, id]);
      const before = await snapshot(); await rejects(() => approve(claim), "42501"); assert.deepEqual(await snapshot(), before);
    }
    await db.query("delete from profiles where id=$1", [id]);
    await rejects(() => approve(claim), "42501");
  });
  await test("expired requests reject ordinary and administrator approval without mutations", async () => {
    const { claim } = await fixture();
    await db.query("update ownership_claims set expires_at=clock_timestamp()-interval '1 second' where id=$1", [claim.id]);
    const before = await snapshot(); await rejects(() => approve(claim), "QC003");
    await rejects(() => approve(claim, { actor: admin, note: "Review" }), "QC003"); assert.deepEqual(await snapshot(), before);
  });
  for (const column of ["admin_archived_at", "owner_removed_at"]) await test(`${column} prevents ownership from changing even for an administrator`, async () => {
    const { guitar, claim } = await fixture(); await db.query(`update guitars set ${column}=clock_timestamp() where id=$1`, [guitar.id]);
    const before = await snapshot(); await rejects(() => approve(claim), "QC002"); await rejects(() => approve(claim, { actor: admin, note: "Review" }), "QC002"); assert.deepEqual(await snapshot(), before);
  });
  await test("stale owner and missing claimant cannot transfer ownership", async () => {
    const { guitar, claim } = await fixture(); await db.query("update guitars set owner_id=$1 where id=$2", [stranger, guitar.id]);
    const before = await snapshot(); await rejects(() => approve(claim, { actor: admin, note: "Review" }), "QC002"); assert.deepEqual(await snapshot(), before);
    const missing = await fixture({ recipient: null }); await rejects(() => approve(missing.claim), "QC002");
  });
  await test("closed or awaiting-evidence requests cannot be approved", async () => {
    for (const status of ["awaiting_claimant", "denied", "cancelled", "expired"]) { const { claim } = await fixture({ status }); const before = await snapshot(); await rejects(() => approve(claim), "QC002"); assert.deepEqual(await snapshot(), before); }
  });
  await test("same reviewer can replay a committed approval after expiry without taking back a later transfer", async () => {
    const { guitar, claim } = await fixture(); const first = await approve(claim);
    const transfer = (await db.query("select public.prepare_ownership_transfer($1,$2,'stranger@example.invalid','Stranger',null,null,7,false,'Claimant') result", [claimant, guitar.qr_code])).rows[0].result.transfer;
    await db.query("select public.complete_ownership_transfer($1,$2,null,null,false,'Stranger')", [transfer.id, stranger]);
    await db.query("update ownership_claims set expires_at=clock_timestamp()-interval '1 day' where id=$1", [claim.id]);
    const before = await snapshot(), replay = await approve(claim);
    assert.equal(replay.replayed, true); assert.equal(replay.approved_at, first.approved_at); assert.deepEqual(await snapshot(), before);
    assert.equal((await db.query("select owner_id from guitars where id=$1", [guitar.id])).rows[0].owner_id, stranger);
    await rejects(() => approve(claim, { actor: admin, note: "Different reviewer" }), "QC002");
  });
  for (const table of ["ownership_claim_events", "guitar_timeline_events"]) await test(`${table} failure rolls back owner, claim receipt, and all history`, async () => {
    const { claim } = await fixture(), before = await snapshot();
    await db.exec(`create function public.qa_claim_fail() returns trigger language plpgsql as $$begin raise exception using errcode='ZT001',message='Synthetic event failure';end$$; create trigger qa_claim_fail before insert on public.${table} for each row execute function public.qa_claim_fail();`);
    await rejects(() => approve(claim), "ZT001"); assert.deepEqual(await snapshot(), before);
  });
  console.log(`${passes} transactional ownership claim cases passed.`);
} finally { await db.close(); }
