import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { installRepositorySchema } from "./postgres-fixture.mjs";
const args = process.argv.slice(2);
const option = (name) => args[args.indexOf(name) + 1];
const repo = path.resolve(args.includes("--repo") ? option("--repo") : path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../.."));
const proposal = args.includes("--proposal") ? path.resolve(option("--proposal")) : repo;
const runtime = args.includes("--runtime") ? path.resolve(option("--runtime")) : repo;
const { PGlite } = createRequire(path.join(runtime, "package.json"))("@electric-sql/pglite");
const db = new PGlite();
const first = "11111111-1111-4111-8111-111111111111";
const second = "22222222-2222-4222-8222-222222222222";
const fresh = "33333333-3333-4333-8333-333333333333";
const ownerKey = (id) => "public_collection_owner:" + id;
const handleKey = (handle) => "public_collection_handle:" + handle;
const collection = (handle, extra = {}) => ({ enabled: true, handle, publicName: "Synthetic collection", accountType: "collector", ...extra });
async function asRole(role) { await db.exec("reset role; set role " + role); }
async function version(id) { return Number((await db.query("select account_settings_version from profiles where id=$1", [id])).rows[0]?.account_settings_version || 0); }
async function save(id, name, settings = null, expectedVersion) {
  return (await db.query("select public.save_account_settings($1,$2,$3::jsonb,$4::bigint) as saved", [id, name, settings, expectedVersion === undefined ? await version(id) : expectedVersion])).rows[0].saved;
}
async function content(key) { return (await db.query("select content_value from site_content where content_key=$1", [key])).rows[0]?.content_value; }
async function snapshot() {
  return (await db.query("select jsonb_build_object('profiles',(select jsonb_agg(to_jsonb(p) order by id) from profiles p),'content',(select jsonb_agg(to_jsonb(c) order by content_key) from site_content c)) as state")).rows[0].state;
}
let passes = 0;
async function test(name, run) { await run(); passes++; console.log("PASS " + name); }
try {
  await installRepositorySchema(db, repo, "20260911001000");
  const migration = fs.readFileSync(path.join(proposal, "supabase/migrations/20260911001000_atomic_account_settings.sql"), "utf8");
  await db.exec(migration);
  await db.exec(migration);
  const versions = fs.readFileSync(path.join(proposal, "supabase/migrations/20260917172000_account_settings_versions.sql"), "utf8");
  await db.exec(versions); await db.exec(versions);
  const conflictResponse = fs.readFileSync(path.join(proposal, "supabase/migrations/20260917174500_business_conflict_responses.sql"), "utf8");
  await db.exec(conflictResponse); await db.exec(conflictResponse);
  await db.query("insert into auth.users(id) values($1),($2),($3)", [first, second, fresh]);
  await db.query("insert into profiles(id,display_name,role,plan,remaining_code_count,admin_notes) values($1,'First','shop','business',73,'private operator note'),($2,'Second','builder','pack_25',12,'second private note')", [first, second]);
  await db.query("insert into site_content(content_key,content_value) values('unrelated', '{\"keep\":true}')");

  await test("anon and authenticated cannot call the service-only RPC", async () => {
    for (const role of ["anon", "authenticated"]) {
      await asRole(role);
      await assert.rejects(save(first, "Escalation", collection("stolen"), 0), (error) => error.code === "42501");
    }
    await asRole("service_role");
  });
  await test("service role cannot bypass versions through the old three-argument helper", async () => {
    const before = await snapshot();
    await assert.rejects(db.query("select public.save_account_settings($1,$2,$3::jsonb)", [first, "Bypass", collection("bypass")]), (error) => error.code === "42501");
    assert.deepEqual(await snapshot(), before);
  });
  await test("versioned RPC has the intended signature and fixed definer search path", async () => {
    const row = (await db.query("select prosecdef, proconfig from pg_proc where oid='public.save_account_settings(uuid,text,jsonb,bigint)'::regprocedure")).rows[0];
    assert.equal(row.prosecdef, true); assert.deepEqual(row.proconfig, ["search_path=pg_catalog, public"]);
  });
  await test("new profile inherits valid database defaults", async () => {
    await save(fresh, "New profile");
    const row = (await db.query("select role,plan from profiles where id=$1", [fresh])).rows[0];
    assert.deepEqual(row, { role: "owner", plan: "single" });
  });
  await test("invalid collection rolls back all state before any profile change", async () => {
    const before = await snapshot();
    await assert.rejects(save(first, "Must not persist", collection("x")), (error) => error.code === "22023");
    assert.deepEqual(await snapshot(), before);
  });
  await test("profile and collection save preserves every unrelated field/row", async () => {
    const before = await snapshot();
    await save(first, "Updated name", collection("first-handle", { ownerId: second, unexpected: "drop me" }));
    const after = await snapshot();
    for (const prior of before.profiles) {
      const current = after.profiles.find((item) => item.id === prior.id);
      assert.deepEqual(current, prior.id === first ? { ...prior, display_name: "Updated name", account_settings_version: prior.account_settings_version + 1 } : prior);
    }
    assert.deepEqual(await content("unrelated"), { keep: true });
    assert.equal((await content(ownerKey(first))).ownerId, first);
    assert.equal((await content(ownerKey(first))).unexpected, undefined);
    assert.equal((await content(handleKey("first-handle"))).ownerId, first);
  });
  await test("omitted collection preserves existing settings and mapping byte-for-byte", async () => {
    const before = await snapshot();
    const result = await save(first, "Name only");
    assert.deepEqual((await snapshot()).content, before.content);
    assert.deepEqual(result.publicCollection, await content(ownerKey(first)));
  });
  await test("competing reservation has one owner and rolls back losing profile/settings", async () => {
    const before = await snapshot();
    await assert.rejects(save(second, "Must not persist", collection("first-handle")), (error) => error.code === "23505");
    assert.deepEqual(await snapshot(), before);
  });
  await test("overlapping requests cannot both reserve one handle", async () => {
    // PGlite serializes its single connection. This exercises actual SQL/unique-index semantics,
    // not an independent two-connection lock-scheduling benchmark.
    const results = await Promise.allSettled([save(first, "First winner", collection("contested")), save(second, "Second winner", collection("contested"))]);
    assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
    const winner = (await content(handleKey("contested"))).ownerId;
    assert.equal((await content(ownerKey(winner))).handle, "contested");
    const loser = winner === first ? second : first;
    assert.notEqual((await content(ownerKey(loser)))?.handle, "contested");
  });
  await test("rename releases only a mapping still owned by this user", async () => {
    const old = (await content(ownerKey(first))).handle;
    await db.query("update site_content set content_value=$1 where content_key=$2", [{ ownerId: second, preserve: "foreign mapping" }, handleKey(old)]);
    const foreign = (await db.query("select * from site_content where content_key=$1", [handleKey(old)])).rows[0];
    await save(first, "Renamed", collection("renamed"));
    assert.deepEqual((await db.query("select * from site_content where content_key=$1", [handleKey(old)])).rows[0], foreign);
  });
  await test("disabled collection releases its own mapping and preserves settings", async () => {
    await save(first, "Disabled", collection("renamed", { enabled: false }));
    assert.equal(await content(handleKey("renamed")), undefined);
    assert.equal((await content(ownerKey(first))).enabled, false);
  });
  await test("disable never deletes a handle now owned by someone else", async () => {
    await save(first, "Enabled", collection("disable-test"));
    await db.query("update site_content set content_value=$1 where content_key=$2", [{ ownerId: second }, handleKey("disable-test")]);
    await save(first, "Disabled", collection("disable-test", { enabled: false }));
    assert.equal((await content(handleKey("disable-test"))).ownerId, second);
  });
  await test("a malformed existing handle mapping is not stolen", async () => {
    await db.query("insert into site_content(content_key,content_value) values($1,'{}')", [handleKey("malformed")]);
    const before = await snapshot();
    await assert.rejects(save(first, "Must not persist", collection("malformed")), (error) => error.code === "23505");
    assert.deepEqual(await snapshot(), before);
  });
  await test("downstream settings write failure rolls back profile, reservation and old-handle cleanup", async () => {
    await save(first, "Before rollback", collection("before-rollback"));
    await asRole("postgres");
    await db.exec("create function fixture_fail_settings() returns trigger language plpgsql as $$ begin if new.content_value->>'handle'='forced-failure' and new.content_key like 'public_collection_owner:%' then raise exception 'synthetic failure'; end if; return new; end $$; create trigger fixture_fail_settings before insert or update on site_content for each row execute function fixture_fail_settings();");
    await asRole("service_role");
    const before = await snapshot();
    await assert.rejects(save(first, "Must not persist", collection("forced-failure")), /synthetic failure/);
    assert.deepEqual(await snapshot(), before);
  });
  await test("deferred A cannot overwrite B after a pre-save reload", async () => {
    const loadedVersion = await version(first);
    let release; const gate = new Promise((resolve) => { release = resolve; });
    // The transport-delayed request reaches real SQL only after B commits. This
    // represents the reported timeout/reload order without claiming independent
    // connections: PGlite's one connection serializes database transactions.
    const delayedA = gate.then(() => save(first, "Late A", collection("late-a"), loadedVersion));
    const outcomeA = delayedA.then((value) => ({ value }), (error) => ({ error }));
    assert.equal(await version(first), loadedVersion);
    const savedB = await save(first, "Confirmed B", collection("confirmed-b"), loadedVersion);
    assert.equal(savedB.settingsVersion, loadedVersion + 1); const afterB = await snapshot();
    release(); assert.equal((await outcomeA).error?.code, "PT409"); assert.deepEqual(await snapshot(), afterB);
    await assert.rejects(save(first, "Stale retry", collection("late-a"), loadedVersion), (error) => error.code === "PT409");
    assert.deepEqual(await snapshot(), afterB);
  });
  await test("overlapping same-version account saves commit exactly once", async () => {
    const expected = await version(first);
    const outcomes = await Promise.allSettled([save(first, "Concurrent A", collection("concurrent-a"), expected), save(first, "Concurrent B", collection("concurrent-b"), expected)]);
    assert.equal(outcomes.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(outcomes.find((result) => result.status === "rejected").reason.code, "PT409");
    const winner = outcomes.find((result) => result.status === "fulfilled").value;
    assert.equal(await version(first), expected + 1); assert.equal((await content(ownerKey(first))).handle, winner.publicCollection.handle);
    assert.equal(await content(handleKey(winner.publicCollection.handle === "concurrent-a" ? "concurrent-b" : "concurrent-a")), undefined);
  });
  await test("reload after a lost committed response permits the next version only", async () => {
    const old = await version(first); const committed = await save(first, "Lost response", collection("lost-response"), old);
    const before = await snapshot(); await assert.rejects(save(first, "Blind retry", null, old), (error) => error.code === "PT409");
    assert.deepEqual(await snapshot(), before);
    const recovered = await version(first); assert.equal(recovered, committed.settingsVersion);
    assert.equal((await save(first, "Recovered save", null, recovered)).settingsVersion, recovered + 1);
  });
  await test("expected stale-save conflict is PT409, never retryable serialization_failure", async () => {
    const before = await snapshot(), old = (await version(first)) - 1;
    await assert.rejects(save(first, "Must not retry", null, old), (error) => {
      assert.equal(error.code, "PT409"); assert.notEqual(error.code.slice(0, 2), "40"); return true;
    });
    assert.deepEqual(await snapshot(), before);
    const source = (await db.query("select prosrc from pg_proc where oid='public.save_account_settings(uuid,text,jsonb,bigint)'::regprocedure")).rows[0].prosrc;
    assert.match(source, /errcode = 'PT409'/); assert.doesNotMatch(source, /40001|serialization_failure/);
  });
  await test("invalid expected versions roll back all account state", async () => {
    const before = await snapshot();
    for (const expected of [null, -1, 9007199254740991]) await assert.rejects(save(first, "Invalid version", collection("invalid-version"), expected), (error) => error.code === "22023");
    assert.deepEqual(await snapshot(), before);
  });
  await test("mismatched owner settings fail without changing any row", async () => {
    await db.query("update site_content set content_value=content_value || $1::jsonb where content_key=$2", [{ ownerId: second }, ownerKey(first)]);
    const before = await snapshot();
    await assert.rejects(save(first, "Must not persist", collection("wrong-settings-owner")), (error) => error.code === "42501");
    assert.deepEqual(await snapshot(), before);
  });
  for (const status of ["locked", "banned", "removed"]) await test(status + " account cannot save, even after a stale API check", async () => {
    await db.query("update profiles set account_status=$1 where id=$2", [status, first]);
    const before = await snapshot();
    await assert.rejects(save(first, "Must not persist", collection("blocked")), (error) => error.code === "42501");
    assert.deepEqual(await snapshot(), before);
  });
  console.log(passes + " real PostgreSQL account tests passed.");
} finally { await db.close(); }

