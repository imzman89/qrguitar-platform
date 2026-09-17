import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash, randomUUID } from "node:crypto";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(process.argv[2] || path.join(here, "../../../.."));
assert.ok(fs.existsSync(path.join(repo, "supabase/schema.sql")), "Supply the canonical repository path; this script never reads database credentials.");
const require = createRequire(path.join(repo, "apps/web/package.json"));
const { PGlite } = require("@electric-sql/pglite");
const { installRepositorySchema } = await import(pathToFileURL(path.join(repo, "apps/web/scripts/security/postgres-fixture.mjs")));
const sqlPath = path.join(repo, "supabase/migrations/20260917200000_account_deletion_intake.sql");
const source = fs.readFileSync(sqlPath, "utf8");
const savedFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("External network is forbidden in the isolated intake fixture."); };
const db = new PGlite();
const ACTOR = "10000000-0000-4000-8000-000000000001", OTHER = "20000000-0000-4000-8000-000000000002";
const ADMIN = "30000000-0000-4000-8000-000000000003", MISSING = "40000000-0000-4000-8000-000000000004";
let passes = 0, savepoint = 0;
const requestTable = "account_deletion_requests", receiptTable = "account_deletion_request_receipts", revisionTable = "account_deletion_actor_revisions";
const methods = {
  submit: "public.submit_account_deletion_request(uuid,uuid,bigint)", cancel: "public.cancel_account_deletion_request(uuid,uuid,uuid,bigint)",
  read: "public.read_account_deletion_requests(uuid,uuid)", queue: "public.read_account_deletion_queue(uuid,boolean,timestamptz,uuid,integer)"
};

async function asRole(role, run) {
  assert.ok(["service_role", "authenticated", "anon"].includes(role));
  const point = "role_" + ++savepoint;
  await db.exec(`savepoint ${point}; set local role ${role}`);
  try { const result = await run(); await db.exec(`reset role; release savepoint ${point}`); return result; }
  catch (error) { await db.exec(`rollback to savepoint ${point}; release savepoint ${point}`); throw error; }
}
async function fail(run, code) {
  const point = "failure_" + ++savepoint;
  await db.exec("savepoint " + point);
  try { await assert.rejects(run, error => typeof code === "function" ? code(error) : error.code === code); }
  finally { await db.exec(`rollback to savepoint ${point}; release savepoint ${point}`); }
}
async function rpc(name, values, role = "service_role") {
  assert.match(name, /^[a-z_]+$/);
  return asRole(role, async () => (await db.query(`select public.${name}(${values.map((_, index) => "$" + (index + 1)).join(",")}) result`, values)).rows[0].result);
}
const revision = async (actor = ACTOR) => (await db.query("select coalesce((select revision from account_deletion_actor_revisions where actor_id=$1),0)::text value", [actor])).rows[0].value;
// Defaults represent a fresh confirmation of the current state. Every replay
// and adversarial schedule explicitly supplies its original captured revision.
const submit = async (actor = ACTOR, operation = randomUUID(), role, expected) => rpc("submit_account_deletion_request", [actor, operation, expected === undefined ? await revision(actor) : expected], role);
const cancel = async (id, actor = ACTOR, operation = randomUUID(), role, expected) => rpc("cancel_account_deletion_request", [actor, id, operation, expected === undefined ? await revision(actor) : expected], role);
const read = (actor = ACTOR, id = null, role) => rpc("read_account_deletion_requests", [actor, id], role);
const queue = (actor = ADMIN, environmentAdmin = false, beforeAt = null, beforeId = null, limit = 50, role) => rpc("read_account_deletion_queue", [actor, environmentAdmin, beforeAt, beforeId, limit], role);
async function check(name, run) {
  await db.exec("begin");
  try { await run(); passes++; console.log("PASS " + name); }
  finally { await db.exec("rollback"); }
}
async function tableSnapshot(tables = [requestTable, receiptTable, revisionTable]) {
  const result = {};
  for (const table of tables) {
    assert.match(table, /^[a-z_]+(?:\.[a-z_]+)?$/);
    result[table] = (await db.query(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text), '[]'::jsonb) rows from ${table} t`)).rows[0].rows;
  }
  return result;
}

try {
  await installRepositorySchema(db, repo, "20260917200000");
  await db.exec(source);
  await db.query("insert into auth.users(id,email) values($1,'actor@example.invalid'),($2,'other@example.invalid'),($3,'admin@example.invalid')", [ACTOR, OTHER, ADMIN]);
  await db.query("insert into profiles(id,display_name,role,account_status) values($1,'Actor','owner','active'),($2,'Other','owner','active'),($3,'Admin','admin','active')", [ACTOR, OTHER, ADMIN]);
  await db.query("insert into guitars(owner_id,qr_code,permanent_path,name,brand,visibility) values($1,'QRG-INTAKE-A','/i/QRG-INTAKE-A','Private instrument','Synthetic','private'),($2,'QRG-INTAKE-B','/i/QRG-INTAKE-B','Other instrument','Synthetic','unlisted')", [ACTOR, OTHER]);

  await check("only the four public boundary functions are executable by service_role", async () => {
    for (const role of ["anon", "authenticated", "service_role"]) for (const signature of Object.values(methods)) {
      assert.equal((await db.query("select has_function_privilege($1,$2,'EXECUTE') allowed", [role, signature])).rows[0].allowed, role === "service_role");
    }
    const helpers = (await db.query("select oid::regprocedure::text signature from pg_proc where pronamespace='public'::regnamespace and proname like '\\_account_deletion\\_%' escape '\\'")).rows;
    assert.equal(helpers.length, 4);
    for (const role of ["anon", "authenticated", "service_role"]) for (const helper of helpers) {
      assert.equal((await db.query("select has_function_privilege($1,$2,'EXECUTE') allowed", [role, helper.signature])).rows[0].allowed, false);
    }
  });

  await check("all intake functions have fixed search paths and trusted ownership", async () => {
    const functions = (await db.query("select proname,prosecdef,proconfig,pg_get_userbyid(proowner) owner from pg_proc where pronamespace='public'::regnamespace and (proname like '%account_deletion%')")).rows;
    assert.equal(functions.length, 8);
    for (const fn of functions) {
      assert.deepEqual(fn.proconfig, ["search_path=pg_catalog, public"]);
      assert.notEqual(fn.owner, "service_role"); assert.notEqual(fn.owner, "authenticated");
      assert.equal(fn.prosecdef, !["_account_deletion_request_json", "_account_deletion_receipt_json"].includes(fn.proname));
    }
  });

  for (const role of ["anon", "authenticated", "service_role"]) await check(`${role} has no direct table or column read/write privileges`, async () => {
    for (const table of [requestTable, receiptTable, revisionTable]) {
      for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]) assert.equal((await db.query("select has_table_privilege($1,$2,$3) allowed", [role, "public." + table, privilege])).rows[0].allowed, false);
      const columns = (await db.query("select attname from pg_attribute where attrelid=$1::regclass and attnum>0 and not attisdropped", ["public." + table])).rows;
      for (const { attname } of columns) for (const privilege of ["SELECT", "INSERT", "UPDATE", "REFERENCES"]) assert.equal((await db.query("select has_column_privilege($1,$2,$3,$4) allowed", [role, "public." + table, attname, privilege])).rows[0].allowed, false);
      await fail(() => asRole(role, () => db.query(`select * from public.${table}`)), "42501");
      await fail(() => asRole(role, () => db.query(`delete from public.${table}`)), "42501");
    }
    await fail(() => asRole(role, () => db.query("insert into account_deletion_requests(actor_id) values($1)", [ACTOR])), "42501");
    await fail(() => asRole(role, () => db.query("update account_deletion_requests set status='cancelled',cancelled_at=clock_timestamp()")), "42501");
  });

  for (const role of ["anon", "authenticated"]) await check(`${role} cannot forge an actor or environment administrator through RPC`, async () => {
    const created = await submit();
    await fail(() => submit(OTHER, randomUUID(), role), "42501");
    await fail(() => read(ACTOR, created.request.requestId, role), "42501");
    await fail(() => cancel(created.request.requestId, ACTOR, randomUUID(), role), "42501");
    await fail(() => queue(ACTOR, true, null, null, 100, role), "42501");
  });

  await check("restrictive RLS protects account requests even if an ordinary table grant is accidentally added", async () => {
    await submit();
    await db.exec("grant select,insert on account_deletion_requests to authenticated; create policy qa_permissive on account_deletion_requests for all to authenticated using(true) with check(true)");
    assert.equal((await asRole("authenticated", () => db.query("select * from account_deletion_requests"))).rows.length, 0);
    await fail(() => asRole("authenticated", () => db.query("insert into account_deletion_requests(actor_id) values($1)", [OTHER])), "42501");
  });

  await check("a verified actor receives only a request receipt, with no completed or processing status", async () => {
    const operation = randomUUID(), result = await submit(ACTOR, operation);
    assert.equal(result.ok, true); assert.equal(result.receipt.operationId, operation); assert.equal(result.receipt.action, "submit");
    assert.equal(result.receipt.expectedRevision, "0");
    assert.equal(result.request.status, "requested"); assert.equal(result.request.cancelledAt, null); assert.equal(result.request.requestId, result.receipt.requestId);
    assert.deepEqual(Object.keys(result.request).sort(), ["cancelledAt", "requestId", "requestedAt", "status"]);
    assert.doesNotMatch(JSON.stringify(result), /actor@example|token|completed|processing|retention|deadline/);
  });

  await check("same operation retries have stable receipts and do not duplicate requests", async () => {
    const operation = randomUUID(), first = await submit(ACTOR, operation), before = await tableSnapshot();
    assert.deepEqual(await submit(ACTOR, operation, undefined, first.receipt.expectedRevision), first); assert.deepEqual(await tableSnapshot(), before);
  });

  await check("multiple fresh submission IDs attach to one active request", async () => {
    const first = await submit(); for (let index = 0; index < 4; index++) assert.equal((await submit()).request.requestId, first.request.requestId);
    assert.equal((await db.query("select count(*)::int n from account_deletion_requests")).rows[0].n, 1);
    assert.equal((await db.query("select count(*)::int n from account_deletion_request_receipts")).rows[0].n, 5);
  });

  await check("the database unique index rejects a second active request independently of application checks", async () => {
    await submit(); await fail(() => db.query("insert into account_deletion_requests(actor_id) values($1)", [ACTOR]), "23505");
  });

  await check("operation UUIDs are scoped to verified actors", async () => {
    const operation = randomUUID(), first = await submit(ACTOR, operation), other = await submit(OTHER, operation);
    assert.notEqual(first.request.requestId, other.request.requestId); assert.equal((await read()).activeRequest.requestId, first.request.requestId);
    assert.equal((await read(OTHER)).activeRequest.requestId, other.request.requestId);
  });

  for (const status of ["locked", "banned", "removed"]) await check(`${status} account can submit, read, and cancel without its restriction being lifted`, async () => {
    await db.query("update profiles set account_status=$1 where id=$2", [status, ACTOR]);
    const profile = (await db.query("select to_jsonb(p) row from profiles p where id=$1", [ACTOR])).rows[0].row;
    const created = await submit(); assert.equal((await read()).activeRequest.requestId, created.request.requestId);
    assert.equal((await cancel(created.request.requestId)).request.status, "cancelled");
    assert.deepEqual((await db.query("select to_jsonb(p) row from profiles p where id=$1", [ACTOR])).rows[0].row, profile);
  });

  await check("verified Auth identity without a profile may request privacy review without a profile upsert", async () => {
    await db.query("insert into auth.users(id,email) values($1,'no-profile@example.invalid')", [MISSING]);
    const created = await submit(MISSING); assert.equal((await read(MISSING)).activeRequest.requestId, created.request.requestId);
    assert.equal((await cancel(created.request.requestId, MISSING)).request.status, "cancelled");
    assert.equal((await db.query("select count(*)::int n from profiles where id=$1", [MISSING])).rows[0].n, 0);
  });

  await check("unknown Auth identity cannot submit, cancel, read, or act as environment admin", async () => {
    await fail(() => submit(MISSING), "PD401"); await fail(() => read(MISSING), "PD401");
    await fail(() => cancel(randomUUID(), MISSING), "PD401"); await fail(() => queue(MISSING, true), "PD401");
    assert.deepEqual(await tableSnapshot(), { [requestTable]: [], [receiptTable]: [], [revisionTable]: [] });
  });

  await check("null identity and missing operation IDs cannot record requests", async () => {
    await fail(() => submit(null), "22023"); await fail(() => submit(ACTOR, null), "22023");
    await fail(() => cancel(null), "22023"); await fail(() => cancel(randomUUID(), ACTOR, null), "22023");
    await fail(() => read(null), "PD401");
  });

  await check("own status starts empty and never returns another actor's request", async () => {
    assert.deepEqual(await read(), { ok: true, revision: "0", request: null, activeRequest: null, latestRequest: null });
    const other = await submit(OTHER);
    assert.deepEqual(await read(), { ok: true, revision: "0", request: null, activeRequest: null, latestRequest: null });
    await fail(() => read(ACTOR, other.request.requestId), "PD404"); await fail(() => cancel(other.request.requestId), "PD404");
    await fail(() => read(ACTOR, randomUUID()), "PD404");
  });

  await check("self status is side-effect-free and exposes a canonical zero revision without creating a row", async () => {
    const before = await tableSnapshot();
    for (let count = 0; count < 3; count++) assert.equal((await read()).revision, "0");
    await queue(); assert.deepEqual(await tableSnapshot(), before);
    assert.equal((await db.query("select provolatile from pg_proc where oid='public.read_account_deletion_requests(uuid,uuid)'::regprocedure")).rows[0].provolatile, "s");
  });

  await check("one SQL statement keeps revision and request state in the same stable read snapshot", async () => {
    const result = (await asRole("service_role", () => db.query(`with changed as materialized (
      select public.submit_account_deletion_request($1,$2,0) mutation
    ) select mutation, public.read_account_deletion_requests($1,null) snapshot from changed`, [ACTOR, randomUUID()]))).rows[0];
    assert.equal(result.mutation.request.status, "requested");
    assert.deepEqual(result.snapshot, { ok: true, revision: "0", request: null, activeRequest: null, latestRequest: null });
    const next = await read(); assert.equal(next.revision, "1"); assert.equal(next.activeRequest.requestId, result.mutation.request.requestId);
  });

  await check("revision rows have nonnegative bigint and Auth RESTRICT constraints", async () => {
    await db.query("insert into auth.users(id,email) values($1,'revision-only@example.invalid')", [MISSING]);
    await fail(() => db.query("insert into account_deletion_actor_revisions(actor_id,revision) values($1,-1)", [MISSING]), "23514");
    await fail(() => db.query("insert into account_deletion_actor_revisions(actor_id,revision) values($1,null)", [MISSING]), "23502");
    await fail(() => db.query("insert into account_deletion_actor_revisions(actor_id,revision) values($1,0)", [randomUUID()]), "23503");
    await db.query("insert into account_deletion_actor_revisions(actor_id,revision) values($1,0)", [MISSING]);
    await fail(() => db.query("delete from auth.users where id=$1", [MISSING]), error => ["23001", "23503"].includes(error.code) && error.constraint === "account_deletion_actor_revisions_actor_id_fkey");
  });

  await check("revision RLS still denies reads and writes after an accidental authenticated grant", async () => {
    await submit();
    await db.exec("grant select,insert,update on account_deletion_actor_revisions to authenticated; create policy qa_revision_permissive on account_deletion_actor_revisions for all to authenticated using(true) with check(true)");
    assert.equal((await asRole("authenticated", () => db.query("select * from account_deletion_actor_revisions"))).rows.length, 0);
    await fail(() => asRole("authenticated", () => db.query("insert into account_deletion_actor_revisions(actor_id,revision) values($1,0)", [OTHER])), "42501");
    await asRole("authenticated", () => db.query("update account_deletion_actor_revisions set revision=0"));
    assert.equal(await revision(), "1");
  });

  await check("legacy mutation signatures and omitted or invalid expected revisions cannot bypass the fence", async () => {
    for (const signature of ["public.submit_account_deletion_request(uuid,uuid)", "public.cancel_account_deletion_request(uuid,uuid,uuid)"]) {
      assert.equal((await db.query("select to_regprocedure($1) value", [signature])).rows[0].value, null);
    }
    await fail(() => rpc("submit_account_deletion_request", [ACTOR, randomUUID()]), "42883");
    await fail(() => rpc("cancel_account_deletion_request", [ACTOR, randomUUID(), randomUUID()]), "42883");
    for (const expected of [null, "-1"]) {
      await fail(() => submit(ACTOR, randomUUID(), undefined, expected), "22023");
      await fail(() => cancel(randomUUID(), ACTOR, randomUUID(), undefined, expected), "22023");
    }
    await fail(() => submit(ACTOR, randomUUID(), undefined, "9223372036854775808"), "22003");
    assert.deepEqual(await tableSnapshot(), { [requestTable]: [], [receiptTable]: [], [revisionTable]: [] });
  });

  await check("a delayed old submit cannot reopen intake after a newer submit and cancellation", async () => {
    const expected = (await read()).revision, delayed = randomUUID();
    const newer = await submit(ACTOR, randomUUID(), undefined, expected);
    await cancel(newer.request.requestId, ACTOR, randomUUID(), undefined, (await read()).revision);
    const before = await tableSnapshot();
    await fail(() => submit(ACTOR, delayed, undefined, expected), "PD412");
    assert.deepEqual(await tableSnapshot(), before); assert.equal((await read()).revision, "2"); assert.equal((await read()).activeRequest, null);
  });

  for (const winner of ["first", "second"]) await check(`two confirmations captured at revision zero accept only the ${winner} dispatched operation`, async () => {
    const first = { operation: randomUUID(), expected: (await read()).revision }, second = { operation: randomUUID(), expected: (await read()).revision };
    const [accepted, stale] = winner === "first" ? [first, second] : [second, first];
    const recorded = await submit(ACTOR, accepted.operation, undefined, accepted.expected), before = await tableSnapshot();
    await fail(() => submit(ACTOR, stale.operation, undefined, stale.expected), "PD412");
    assert.deepEqual(await tableSnapshot(), before); assert.equal((await read()).revision, "1"); assert.equal(recorded.receipt.expectedRevision, "0");
  });

  await check("a stale cancellation cannot override a newer accepted confirmation", async () => {
    const created = await submit(), expected = (await read()).revision;
    await submit(ACTOR, randomUUID(), undefined, expected); // A fresh attachment is an accepted new confirmation.
    const before = await tableSnapshot(); await fail(() => cancel(created.request.requestId, ACTOR, randomUUID(), undefined, expected), "PD412");
    assert.deepEqual(await tableSnapshot(), before); assert.equal((await read()).activeRequest.requestId, created.request.requestId);
  });

  await check("each fresh no-op attachment or cancellation advances revision while exact replays do not", async () => {
    const created = await submit(); assert.equal((await read()).revision, "1");
    const attached = await submit(); assert.equal(attached.request.requestId, created.request.requestId); assert.equal(attached.receipt.expectedRevision, "1"); assert.equal((await read()).revision, "2");
    await submit(ACTOR, attached.receipt.operationId, undefined, attached.receipt.expectedRevision); assert.equal((await read()).revision, "2");
    const stopped = await cancel(created.request.requestId); assert.equal(stopped.receipt.expectedRevision, "2"); assert.equal((await read()).revision, "3");
    const again = await cancel(created.request.requestId); assert.equal(again.request.cancelledAt, stopped.request.cancelledAt); assert.equal(again.receipt.expectedRevision, "3"); assert.equal((await read()).revision, "4");
    await cancel(created.request.requestId, ACTOR, stopped.receipt.operationId, undefined, stopped.receipt.expectedRevision); assert.equal((await read()).revision, "4");
  });

  await check("reusing an operation UUID with a changed expected revision conflicts before current-state matching", async () => {
    const created = await submit(), beforeSubmit = await tableSnapshot();
    for (const changed of ["1", "9007199254740993"]) await fail(() => submit(ACTOR, created.receipt.operationId, undefined, changed), "PD409");
    assert.deepEqual(await tableSnapshot(), beforeSubmit);
    const stopped = await cancel(created.request.requestId), beforeCancel = await tableSnapshot();
    for (const changed of ["0", "2"]) await fail(() => cancel(created.request.requestId, ACTOR, stopped.receipt.operationId, undefined, changed), "PD409");
    assert.deepEqual(await tableSnapshot(), beforeCancel);
  });

  await check("revision changes are actor-isolated and retain exact bigint strings beyond JavaScript integer precision", async () => {
    await db.query("insert into account_deletion_actor_revisions(actor_id,revision) values($1,$2)", [ACTOR, "9007199254740993"]);
    assert.equal((await read()).revision, "9007199254740993");
    const created = await submit(ACTOR, randomUUID(), undefined, "9007199254740993");
    assert.equal(created.receipt.expectedRevision, "9007199254740993"); assert.equal((await read()).revision, "9007199254740994"); assert.equal((await read(OTHER)).revision, "0");
    await submit(OTHER); assert.equal((await read()).revision, "9007199254740994");
  });

  await check("bigint exhaustion fails closed and rolls back a request and receipt", async () => {
    await db.query("insert into account_deletion_actor_revisions(actor_id,revision) values($1,$2)", [ACTOR, "9223372036854775807"]);
    const before = await tableSnapshot(); await fail(() => submit(ACTOR, randomUUID(), undefined, "9223372036854775807"), "22003");
    assert.deepEqual(await tableSnapshot(), before); assert.equal((await read()).revision, "9223372036854775807");
  });

  await check("rolling write budget bounds receipts and reserves the final slot for cancelling an active request", async () => {
    const old = await submit(); await cancel(old.request.requestId); const active = await submit();
    for (let index = 3; index < 59; index++) await submit();
    const full = await tableSnapshot(); assert.equal((await read()).revision, "59");
    await fail(() => submit(), "PD429");
    await fail(() => cancel(old.request.requestId), "PD429"); // No-op cannot consume the reserved active-cancel slot.
    assert.deepEqual(await tableSnapshot(), full);
    const stopped = await cancel(active.request.requestId); assert.equal(stopped.request.status, "cancelled"); assert.equal(stopped.receipt.expectedRevision, "59");
    assert.equal((await read()).revision, "60");
    const final = await tableSnapshot();
    await fail(() => submit(), "PD429"); await fail(() => cancel(active.request.requestId), "PD429");
    assert.deepEqual(await tableSnapshot(), final); assert.equal(final[receiptTable].length, 60);
    // Historical receipts remain replayable at the limit without extra records.
    assert.equal((await submit(ACTOR, old.receipt.operationId, undefined, old.receipt.expectedRevision)).request.status, "cancelled");
    assert.deepEqual(await cancel(active.request.requestId, ACTOR, stopped.receipt.operationId, undefined, stopped.receipt.expectedRevision), stopped);
    assert.deepEqual(await tableSnapshot(), final);
    // A stale unknown intent is definitively fenced before the rate check.
    await fail(() => submit(ACTOR, randomUUID(), undefined, "0"), "PD412");
    await fail(() => cancel(active.request.requestId, ACTOR, randomUUID(), undefined, "59"), "PD412");
    assert.deepEqual(await tableSnapshot(), final);
    // Limits belong only to this actor.
    assert.equal((await submit(OTHER)).receipt.expectedRevision, "0");
  });

  await check("the rolling-hour window releases capacity without resetting monotonic revisions", async () => {
    const active = await submit(); for (let index = 1; index < 59; index++) await submit();
    await fail(() => submit(), "PD429");
    // Migration-owner-only fixture time shift; the immutable receipt trigger is
    // restored before any RPC. No production mutation or time override exists.
    await db.exec("alter table account_deletion_request_receipts disable trigger account_deletion_receipts_immutable; update account_deletion_request_receipts set recorded_at=clock_timestamp()-interval '2 hours'; alter table account_deletion_request_receipts enable trigger account_deletion_receipts_immutable");
    const attached = await submit(); assert.equal(attached.request.requestId, active.request.requestId); assert.equal(attached.receipt.expectedRevision, "59");
    assert.equal((await read()).revision, "60");
    const index = (await db.query("select pg_get_indexdef('account_deletion_receipt_actor_time'::regclass) definition")).rows[0].definition;
    assert.match(index, /\(actor_id, recorded_at DESC\)/);
  });

  await check("cancellation records a receipt, clears active status, and preserves latest request", async () => {
    const first = await submit(), operation = randomUUID(), stopped = await cancel(first.request.requestId, ACTOR, operation);
    assert.equal(stopped.receipt.operationId, operation); assert.equal(stopped.receipt.action, "cancel"); assert.equal(stopped.request.status, "cancelled");
    assert.ok(stopped.request.cancelledAt); const state = await read(ACTOR, first.request.requestId);
    assert.equal(state.activeRequest, null); assert.deepEqual(state.request, stopped.request); assert.deepEqual(state.latestRequest, stopped.request);
  });

  await check("same cancel retry preserves its original receipt and cancellation time", async () => {
    const first = await submit(), operation = randomUUID(), stopped = await cancel(first.request.requestId, ACTOR, operation), before = await tableSnapshot();
    assert.deepEqual(await cancel(first.request.requestId, ACTOR, operation, undefined, stopped.receipt.expectedRevision), stopped); assert.deepEqual(await tableSnapshot(), before);
    assert.equal((await cancel(first.request.requestId)).request.cancelledAt, stopped.request.cancelledAt);
  });

  await check("old submit retry after cancellation cannot reopen it or hide a later active request", async () => {
    const operation = randomUUID(), first = await submit(ACTOR, operation); await cancel(first.request.requestId);
    const second = await submit(); assert.notEqual(second.request.requestId, first.request.requestId);
    const before = await tableSnapshot(), replay = await submit(ACTOR, operation, undefined, first.receipt.expectedRevision);
    assert.deepEqual(replay.receipt, first.receipt); assert.equal(replay.request.status, "cancelled"); assert.equal(replay.request.requestId, first.request.requestId);
    assert.equal((await read()).activeRequest.requestId, second.request.requestId); assert.deepEqual(await tableSnapshot(), before);
  });

  await check("old cancel retry cannot cancel a newer request or be repurposed for it", async () => {
    const first = await submit(), operation = randomUUID(), stopped = await cancel(first.request.requestId, ACTOR, operation); const second = await submit();
    const before = await tableSnapshot(); await cancel(first.request.requestId, ACTOR, operation, undefined, stopped.receipt.expectedRevision);
    await fail(() => cancel(second.request.requestId, ACTOR, operation, undefined, stopped.receipt.expectedRevision), "PD409"); assert.deepEqual(await tableSnapshot(), before);
  });

  await check("one operation ID cannot change from submit to cancel or cancel to submit", async () => {
    const operation = randomUUID(), first = await submit(ACTOR, operation);
    await fail(() => cancel(first.request.requestId, ACTOR, operation), "PD409");
    const cancellation = randomUUID(); await cancel(first.request.requestId, ACTOR, cancellation);
    await fail(() => submit(ACTOR, cancellation), "PD409");
  });

  for (const action of ["submit", "cancel"]) await check(`${action} receipt insertion failure rolls back the state change`, async () => {
    const initial = action === "cancel" ? await submit() : null, before = await tableSnapshot();
    await db.exec("create function public.qa_receipt_failure() returns trigger language plpgsql as $$begin raise exception using errcode='ZT001',message='Synthetic receipt failure';end$$; create trigger qa_receipt_failure before insert on account_deletion_request_receipts for each row execute function public.qa_receipt_failure()");
    await fail(() => action === "submit" ? submit() : cancel(initial.request.requestId), "ZT001");
    assert.deepEqual(await tableSnapshot(), before);
  });

  for (const action of ["submit", "cancel"]) await check(`${action} revision failure after receipt insertion rolls back all three intake tables`, async () => {
    const initial = action === "cancel" ? await submit() : null, before = await tableSnapshot();
    await db.exec("create function public.qa_revision_failure() returns trigger language plpgsql as $$begin raise exception using errcode='ZT002',message='Synthetic revision failure';end$$; create trigger qa_revision_failure before insert or update on account_deletion_actor_revisions for each row execute function public.qa_revision_failure()");
    await fail(() => action === "submit" ? submit() : cancel(initial.request.requestId), "ZT002");
    assert.deepEqual(await tableSnapshot(), before);
  });

  await check("receipts and request identity cannot be rewritten, purged, or marked complete", async () => {
    const first = await submit(), id = first.request.requestId;
    await fail(() => db.query("update account_deletion_requests set actor_id=$1 where id=$2", [OTHER, id]), "42501");
    await fail(() => db.query("update account_deletion_requests set status='completed' where id=$1", [id]), "42501");
    await fail(() => db.query("delete from account_deletion_requests where id=$1", [id]), "42501");
    await fail(() => db.query("update account_deletion_request_receipts set action='cancel'"), "42501");
    await fail(() => db.query("delete from account_deletion_request_receipts"), "42501");
  });

  await check("receipt ownership is enforced by the composite database foreign key", async () => {
    const first = await submit();
    await fail(() => db.query("insert into account_deletion_request_receipts(actor_id,operation_id,action,request_id,expected_revision) values($1,$2,'submit',$3,0)", [OTHER, randomUUID(), first.request.requestId]), "23503");
  });

  await check("intake and cancellation leave Auth, Profiles, instrument history, files, and billing untouched", async () => {
    const existing = (await db.query("select schemaname||'.'||tablename name from pg_tables where schemaname in ('public','auth','storage') and tablename not in ('account_deletion_requests','account_deletion_request_receipts','account_deletion_actor_revisions') order by 1")).rows.map(row => row.name);
    const before = await tableSnapshot(existing); const first = await submit(); await cancel(first.request.requestId); await submit(); await read(); await queue();
    assert.deepEqual(await tableSnapshot(existing), before);
  });

  await check("Auth deletion cannot silently cascade away a pending or cancelled intake receipt", async () => {
    const restrictedByRequest = error => ["23001", "23503"].includes(error.code) && ["account_deletion_requests_actor_id_fkey", "account_deletion_actor_revisions_actor_id_fkey"].includes(error.constraint);
    const first = await submit(); await fail(() => db.query("delete from auth.users where id=$1", [ACTOR]), restrictedByRequest);
    await cancel(first.request.requestId); await fail(() => db.query("delete from auth.users where id=$1", [ACTOR]), restrictedByRequest);
  });

  await check("ordinary actor cannot enumerate the admin queue", async () => {
    await submit(); await fail(() => queue(ACTOR), "PD403");
  });

  for (const status of ["locked", "banned", "removed"]) await check(`${status} database-role admin cannot read the queue`, async () => {
    await db.query("update profiles set account_status=$1 where id=$2", [status, ADMIN]); await fail(() => queue(), "PD403");
  });

  await check("queue permits active protected admin or server-derived environment admin without changing requests", async () => {
    const first = await submit(), other = await submit(OTHER), before = await tableSnapshot();
    const items = (await queue()).requests; assert.equal(items.length, 2); assert.deepEqual(new Set(items.map(item => item.requestId)), new Set([first.request.requestId, other.request.requestId]));
    for (const item of items) assert.deepEqual(Object.keys(item).sort(), ["actorId", "cancelledAt", "requestId", "requestedAt", "status"]);
    assert.deepEqual((await queue(OTHER, true)).requests, items); assert.deepEqual(await tableSnapshot(), before);
  });

  await check("queue is bounded, cursor-stable, and omits cancelled requests", async () => {
    const first = await submit(), other = await submit(OTHER), firstPage = (await queue(ADMIN, false, null, null, 1)).requests;
    assert.equal(firstPage.length, 1);
    const cursor = firstPage[0], secondPage = (await queue(ADMIN, false, cursor.requestedAt, cursor.requestId, 1)).requests;
    assert.equal(secondPage.length, 1); assert.notEqual(secondPage[0].requestId, cursor.requestId);
    assert.deepEqual(new Set([...firstPage, ...secondPage].map(item => item.requestId)), new Set([first.request.requestId, other.request.requestId]));
    await cancel(first.request.requestId); assert.deepEqual((await queue()).requests.map(item => item.requestId), [other.request.requestId]);
  });

  await check("invalid queue limits and incomplete cursors fail closed", async () => {
    for (const limit of [null, 0, -1, 101]) await fail(() => queue(ADMIN, false, null, null, limit), "22023");
    await fail(() => queue(ADMIN, false, "2026-01-01T00:00:00Z", null), "22023");
    await fail(() => queue(ADMIN, false, null, randomUUID()), "22023");
  });

  const hash = bytes => createHash("sha256").update(bytes).digest("hex");
  const report = {
    proposal: "account-deletion-request-intake", testsPassed: passes, runtime: (await db.query("select version() version")).rows[0].version,
    limitations: ["PGlite is one database connection; real PostgreSQL multi-connection lock scheduling was not tested.", "No HTTP/Auth/reauthentication implementation or fulfillment behavior is included.", "No live database, hosted API, customer, email provider, or payment provider was contacted."],
    sqlSha256: hash(source), fixtureSha256: hash(fs.readFileSync(path.join(repo, "apps/web/scripts/security/postgres-fixture.mjs"))),
    migrationHashes: Object.fromEntries(fs.readdirSync(path.join(repo, "supabase/migrations")).filter(name => name.endsWith(".sql") && name < "20260917200000").sort().map(name => [name, hash(fs.readFileSync(path.join(repo, "supabase/migrations", name)))]))
  };
  console.log(JSON.stringify(report));
  console.log(`${passes} actual PostgreSQL intake cases passed; source hashes and limitations printed above.`);
} finally { await db.close(); globalThis.fetch = savedFetch; }
