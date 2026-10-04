import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const repo = path.resolve(process.cwd(), "../..");
// This regression uses synthetic accounts and a fresh in-memory database. All
// schema writes target the new in-memory PGlite instance below, never a URL.
const require = createRequire(path.join(repo, "apps/web/package.json"));
const { PGlite } = require("@electric-sql/pglite");
const { installRepositorySchema } = await import(pathToFileURL(path.join(repo, "apps/web/scripts/security/postgres-fixture.mjs")));
const proposalPath = path.join(repo, 'supabase/migrations/20260930010000_member_message_upload_replay.sql');
const rollbackPath = path.join(repo, 'apps/web/scripts/fixtures/member-message-upload-replay-rollback.sql');
const migrationPath = path.join(repo, "supabase/migrations/20260918180000_member_messaging.sql");
const durableMigrationPath = path.join(repo, "supabase/migrations/20260918182000_durable_member_message_history.sql");
const paginationMigrationPath = path.join(repo, "supabase/migrations/20260919101000_member_messaging_pagination.sql");
const db = new PGlite();
const users = {
  sender: "10000000-0000-4000-8000-000000000001",
  owner: "20000000-0000-4000-8000-000000000002",
  outsider: "30000000-0000-4000-8000-000000000003"
};
const guitarId = "40000000-0000-4000-8000-000000000004";
const operationId = "50000000-0000-4000-8000-000000000005";
const uploadId = "60000000-0000-4000-8000-000000000006";
let passed = 0;

async function test(name, run) {
  await run();
  passed += 1;
  console.log(`PASS ${name}`);
}

async function role(name, actorId = "") {
  await db.exec("reset role; reset \"request.jwt.claim.sub\"; reset \"request.jwt.claim.role\";");
  if (name !== "postgres") {
    await db.exec(`set role ${name}; set \"request.jwt.claim.role\"='${name}';`);
  }
  if (actorId) await db.exec(`set \"request.jwt.claim.sub\"='${actorId}';`);
}

async function service(sql, params = []) {
  await role("service_role");
  return db.query(sql, params);
}

try {
  await installRepositorySchema(db, repo, "20260918180000");
  await db.exec(fs.readFileSync(migrationPath, "utf8"));
  await role("postgres");
  await db.query("insert into auth.users(id,email) values($1,'sender@example.invalid'),($2,'owner@example.invalid'),($3,'outsider@example.invalid')", Object.values(users));
  await db.query("insert into public.profiles(id,display_name,account_status) values($1,'Sender','active'),($2,'Owner','active'),($3,'Outsider','active')", Object.values(users));
  await db.query("insert into public.site_content(content_key,content_value,updated_by) values($1,$2::jsonb,$3)", [
    `public_collection_owner:${users.owner}`,
    JSON.stringify({ enabled: true, allowMessages: true, publicName: "Owner Studio", handle: "owner-studio" }),
    users.owner
  ]);
  await db.query("insert into public.guitars(id,owner_id,qr_code,permanent_path,name,brand,visibility) values($1,$2,'QRG-MSGTEST','/i/QRG-MSGTEST','Message Test Guitar','QRguitar','public')", [guitarId, users.owner]);

  let conversationId = "";
  await test("service creates one non-enumerable participant conversation", async () => {
    const created = await service("select public.ensure_member_conversation($1,$2,$3) value", [users.sender, users.owner, guitarId]);
    conversationId = created.rows[0].value.conversationId;
    assert.match(conversationId, /^[0-9a-f-]{36}$/);
    assert.equal(created.rows[0].value.created, true);
    const replay = await service("select public.ensure_member_conversation($1,$2,$3) value", [users.sender, users.owner, guitarId]);
    assert.equal(replay.rows[0].value.conversationId, conversationId);
    assert.equal(replay.rows[0].value.created, false);
  });

  await test("participants read only their conversation and outsiders cannot enumerate it", async () => {
    await role("authenticated", users.sender);
    assert.equal((await db.query("select count(*)::integer n from public.member_conversations")).rows[0].n, 1);
    await role("authenticated", users.owner);
    assert.equal((await db.query("select count(*)::integer n from public.member_conversations")).rows[0].n, 1);
    await role("authenticated", users.outsider);
    assert.equal((await db.query("select count(*)::integer n from public.member_conversations")).rows[0].n, 0);
  });

  await test("authenticated clients cannot write around the service boundary", async () => {
    await role("authenticated", users.sender);
    await assert.rejects(
      db.query("insert into public.member_messages(conversation_id,sender_id,client_operation_id,body) values($1,$2,$3,'bypass')", [conversationId, users.sender, operationId]),
      /permission denied|row-level security/i
    );
  });

  let storagePath = "";
  await test("media preparation enforces type, size, identity, and count limits", async () => {
    const prepared = await service("select public.prepare_member_message_upload($1,$2,$3,$4,$5::jsonb) value", [
      conversationId, users.sender, operationId, uploadId,
      JSON.stringify({ fileName: "front.jpg", mimeType: "image/jpeg", fileSizeBytes: 1024 })
    ]);
    storagePath = prepared.rows[0].value.storagePath;
    assert.match(storagePath, new RegExp(`^${conversationId}/${users.sender}/${operationId}/${uploadId}\\.jpg$`));
    await assert.rejects(
      service("select public.prepare_member_message_upload($1,$2,$3,$4,$5::jsonb)", [conversationId, users.sender, operationId, "60000000-0000-4000-8000-000000000099", JSON.stringify({ fileName: "bad.exe", mimeType: "application/octet-stream", fileSizeBytes: 10 })]),
      /supported image or video/i
    );
  });

  let messageId = "";
  await test("send verifies uploaded bytes and replays one operation idempotently", async () => {
    await role("postgres");
    await db.query("insert into storage.objects(bucket_id,name,metadata) values('member-message-media',$1,$2::jsonb)", [storagePath, JSON.stringify({ mimetype: "image/jpeg", size: 1024 })]);
    const sent = await service("select public.send_member_message($1,$2,$3,$4) value", [conversationId, users.sender, operationId, "Hello from the secure thread."]);
    messageId = sent.rows[0].value.messageId;
    assert.equal(sent.rows[0].value.replayed, false);
    const replay = await service("select public.send_member_message($1,$2,$3,$4) value", [conversationId, users.sender, operationId, "Hello from the secure thread."]);
    assert.equal(replay.rows[0].value.messageId, messageId);
    assert.equal(replay.rows[0].value.replayed, true);
    await assert.rejects(
      service("select public.send_member_message($1,$2,$3,$4)", [conversationId, users.sender, operationId, "Changed body"]),
      /belongs to another message/i
    );
    await assert.rejects(
      service("select public.prepare_member_message_upload($1,$2,$3,$4,$5::jsonb)", [conversationId, users.sender, operationId, "60000000-0000-4000-8000-000000000088", JSON.stringify({ fileName: "late.png", mimeType: "image/png", fileSizeBytes: 20 })]),
      /already been sent/i
    );
  });

  await test("message rows remain participant-only and reports target only the other member", async () => {
    await role("authenticated", users.owner);
    assert.equal((await db.query("select count(*)::integer n from public.member_messages")).rows[0].n, 1);
    await role("authenticated", users.outsider);
    assert.equal((await db.query("select count(*)::integer n from public.member_messages")).rows[0].n, 0);
    const report = await service("select public.report_member_message($1,$2,$3,'spam','Synthetic database test') value", [conversationId, users.owner, messageId]);
    assert.equal(report.rows[0].value.ok, true);
    await assert.rejects(
      service("select public.report_member_message($1,$2,$3,'spam','Self-report')", [conversationId, users.sender, messageId]),
      /message from the other member/i
    );
  });

  if (proposalPath) await testLegacyBlockProposed(conversationId);
  await test("durable-history migration clears legacy controls and makes archive, block, and delete unavailable", async () => {
    await service("select public.set_member_message_block($1,$2,true)", [users.owner, users.sender]);
    await role("postgres");
    await db.query("update public.member_conversations set user_a_archived_at=clock_timestamp() where id=$1", [conversationId]);
    await db.exec(fs.readFileSync(durableMigrationPath, "utf8"));
    await db.exec(fs.readFileSync(paginationMigrationPath, "utf8"));
    const state = (await db.query("select user_a_archived_at,user_b_archived_at from public.member_conversations where id=$1", [conversationId])).rows[0];
    assert.deepEqual(state, { user_a_archived_at: null, user_b_archived_at: null });
    assert.equal((await db.query("select count(*)::integer n from public.member_message_blocks")).rows[0].n, 0);
    assert.equal((await db.query("select to_regprocedure('public.set_member_conversation_archived(uuid,uuid,boolean)') archived,to_regprocedure('public.set_member_message_block(uuid,uuid,boolean)') blocked")).rows[0].archived, null);
    assert.equal((await db.query("select to_regprocedure('public.set_member_message_block(uuid,uuid,boolean)') blocked")).rows[0].blocked, null);
    await assert.rejects(db.query("insert into public.member_message_blocks(blocker_id,blocked_id) values($1,$2)", [users.owner, users.sender]), /member_message_blocks_disabled|check constraint/i);
    await assert.rejects(db.query("update public.member_conversations set user_a_archived_at=clock_timestamp() where id=$1", [conversationId]), /durable_history_no_archive|check constraint/i);
    const sent = await service("select public.send_member_message($1,$2,$3,'Durable history remains writable') value", [conversationId, users.sender, "70000000-0000-4000-8000-000000000007"]);
    assert.equal(sent.rows[0].value.replayed, false);
    await role("postgres");
    const activityBeforeRead = (await db.query("select updated_at from public.member_conversations where id=$1", [conversationId])).rows[0].updated_at;
    await service("select public.mark_member_conversation_read($1,$2)", [conversationId, users.owner]);
    await role("postgres");
    assert.equal(new Date((await db.query("select updated_at from public.member_conversations where id=$1", [conversationId])).rows[0].updated_at).getTime(), new Date(activityBeforeRead).getTime());
    await role("authenticated", users.sender);
    await assert.rejects(db.query("delete from public.member_messages where conversation_id=$1", [conversationId]), /permission denied|row-level security/i);
    await assert.rejects(db.query("update public.member_messages set body='hidden' where conversation_id=$1", [conversationId]), /permission denied|row-level security/i);
    await role("service_role");
    await assert.rejects(db.query("delete from public.member_conversations where id=$1", [conversationId]), /permission denied|row-level security/i);
  });

  await test("stable database keys page beyond 100 conversations and 200 durable messages without omission", async () => {
    await role("postgres");
    await db.query(`insert into auth.users(id,email)
      select ('90000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'scale-'||i||'@example.invalid'
      from generate_series(1,100) i`);
    await db.query(`insert into public.profiles(id,display_name,account_status)
      select ('90000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'Scale peer '||i,'active'
      from generate_series(1,100) i`);
    await db.query(`insert into public.member_conversations(id,user_a,user_b,created_by,created_at,updated_at,last_message_at)
      select ('91000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,$1,
        ('90000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,$1,
        timestamptz '2026-09-18 12:00:00+00'-i*interval '1 second',
        timestamptz '2026-09-18 12:00:00+00'-i*interval '1 second',null
      from generate_series(1,100) i`, [users.sender]);
    await db.query(`insert into public.member_messages(id,conversation_id,sender_id,client_operation_id,body,created_at)
      select ('92000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,$1,$2,
        ('93000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'Scale message '||i,
        timestamptz '2026-09-17 12:00:00+00'-i*interval '1 second'
      from generate_series(1,203) i`, [conversationId, users.sender]);

    const conversationIds = [];
    let conversationCursor = null;
    do {
      const params = [users.sender];
      let filter = "";
      if (conversationCursor) {
        params.push(conversationCursor.updated_at, conversationCursor.id);
        filter = "and (updated_at<$2 or (updated_at=$2 and id<$3))";
      }
      const page = (await db.query(`select id,updated_at from public.member_conversations
        where $1 in (user_a,user_b) ${filter} order by updated_at desc,id desc limit 26`, params)).rows;
      const visible = page.slice(0,25);
      conversationIds.push(...visible.map(row => row.id));
      conversationCursor = page.length > 25 ? visible.at(-1) : null;
    } while (conversationCursor);
    assert.equal(conversationIds.length, 101);
    assert.equal(new Set(conversationIds).size, 101);
    assert.equal((await db.query("select count(*)::integer n from pg_indexes where schemaname='public' and indexname in ('member_conversations_user_a_updated_page','member_conversations_user_b_updated_page')")).rows[0].n, 2);

    const messageIds = [];
    let messageCursor = null;
    do {
      const params = [conversationId];
      let filter = "";
      if (messageCursor) {
        params.push(messageCursor.created_at, messageCursor.id);
        filter = "and (created_at<$2 or (created_at=$2 and id<$3))";
      }
      const page = (await db.query(`select id,created_at from public.member_messages where conversation_id=$1 ${filter}
        order by created_at desc,id desc limit 201`, params)).rows;
      const visible = page.slice(0,200);
      messageIds.push(...visible.map(row => row.id));
      messageCursor = page.length > 200 ? visible.at(-1) : null;
    } while (messageCursor);
    assert.equal(messageIds.length, 205);
    assert.equal(new Set(messageIds).size, 205);
  });

  await test("anonymous clients receive no messaging metadata", async () => {
    await role("anon");
    await assert.rejects(db.query("select * from public.member_conversations"), /permission denied/i);
    await assert.rejects(db.query("select * from public.member_message_attachments"), /permission denied/i);
  });

  await role("postgres");
  if (proposalPath) await testM1(conversationId);
  console.log(`PASS ${passed} member messaging database cases`);
} finally {
  await db.close();
}

async function testM1(conversationId) {
  assert.ok(rollbackPath, "Supply both proposal and rollback review artifacts");
  const proposal = fs.readFileSync(proposalPath, "utf8"), rollback = fs.readFileSync(rollbackPath, "utf8");
  await test("M1 source diff is only quota relocation; rollback body equals repository baseline", async () => {
    const extract = sql => {
      const definition = sql.replaceAll("\r\n", "\n").match(/create (?:or replace )?function public\.prepare_member_message_upload\([\s\S]*?end \$\$;/)?.[0];
      assert.ok(definition, "Expected exact preparation function"); return definition.replace(/^create or replace function/, "create function");
    };
    const before = extract(fs.readFileSync(migrationPath, "utf8"));
    const quota = before.match(/  if \(select count\(\*\) from public.member_message_uploads[\s\S]*?message='Attachment limit reached\. Try again later\.';\n  end if;\n/)?.[0];
    assert.ok(quota, "Expected both existing quota checks");
    const moved = quota.split("\n").map(line => line ? "  " + line : "").join("\n");
    const expected = before.replace(quota, "").replace("  else\n    insert into public.member_message_uploads", "  else\n" + moved + "    insert into public.member_message_uploads");
    assert.equal(extract(proposal), expected); assert.equal(extract(rollback), before);
  });
  const signature = "public.prepare_member_message_upload(uuid,uuid,uuid,uuid,jsonb)";
  const metadata = async () => {
    await role("postgres");
    return (await db.query("select oid,proowner,proacl::text,prosecdef,proconfig::text,pg_get_functiondef(oid) definition from pg_proc where oid=$1::regprocedure", [signature])).rows[0];
  };
  const original = await metadata();
  await assertOldQuotaReplayFailure(conversationId, "baseline");
  await db.exec(proposal);
  const replaced = await metadata();
  await test("M1 replacement preserves exact existing function owner/OID/ACL/security/search_path", async () => {
    const { definition: before, ...beforeMeta } = original, { definition: after, ...afterMeta } = replaced;
    assert.deepEqual(afterMeta, beforeMeta); assert.notEqual(after, before);
    assert.equal(replaced.prosecdef, true); assert.match(replaced.proconfig, /search_path=pg_catalog, public/);
  });
  // These cases are rolled back together. Expected errors use savepoints so
  // their SQLSTATE cannot poison later assertions in this isolated transaction.
  await role("postgres"); await db.exec("begin");
  const uuid = n => "71000000-0000-4000-8000-" + String(n).padStart(12, "0");
  const file = { fileName: "fixture.jpg", mimeType: "image/jpeg", fileSizeBytes: 1024 };
  const operation = uuid(1), ids = [2, 3, 4, 5].map(uuid);
  const prepare = (id, changes = {}) => service("select public.prepare_member_message_upload($1,$2,$3,$4,$5::jsonb) value", [
    changes.conversation ?? conversationId, changes.actor ?? users.sender, changes.operation ?? operation, id, JSON.stringify(changes.file ?? file)
  ]);
  const receipts = async (op = operation) => {
    await role("postgres");
    return (await db.query("select * from public.member_message_uploads where actor_id=$1 and operation_id=$2 order by upload_id", [users.sender, op])).rows;
  };
  async function refused(run, code, message) {
    await db.exec("savepoint m1_refusal");
    let failure;
    try { await run(); } catch (error) { failure = error; }
    await db.exec("rollback to savepoint m1_refusal; release savepoint m1_refusal");
    assert.ok(failure, "Expected refusal " + code); assert.equal(failure.code, code);
    if (message) assert.match(failure.message, message);
  }
  try {
    // Earlier legacy fixtures leave recent receipts. Age those isolated rows
    // for an exact hourly boundary, never remove a customer record.
    await db.exec("update public.member_message_uploads set prepared_at=clock_timestamp()-interval '2 hours'");
    let first;
    await test("M1 replay of all four prepared receipts is exact and insert-free", async () => {
      for (const id of ids) await prepare(id);
      first = await receipts(); assert.equal(first.length, 4);
      for (const id of ids) assert.equal((await prepare(id)).rows[0].value.storagePath, first.find(r => r.upload_id === id).storage_path);
      assert.deepEqual(await receipts(), first);
    });
    await test("M1 fifth NEW attachment remains MM429 without changing four receipts", async () => {
      await refused(() => prepare(uuid(6)), "MM429", /four attachments/); assert.deepEqual(await receipts(), first);
    });
    await test("M1 queued exact replay calls keep receipts unchanged (not independent concurrent transactions)", async () => {
      await role("service_role");
      await Promise.all(Array.from({ length: 8 }, (_, n) => db.query("select public.prepare_member_message_upload($1,$2,$3,$4,$5::jsonb)", [conversationId, users.sender, operation, ids[n % 4], JSON.stringify(file)])));
      assert.deepEqual(await receipts(), first);
    });
    await test("M1 exact receipt replay at hourly24 succeeds; new25th remains MM429", async () => {
      for (let n = 0; n < 20; n++) await prepare(uuid(100 + n), { operation: uuid(200 + Math.floor(n / 4)) });
      await role("postgres");
      assert.equal((await db.query("select count(*)::integer n from public.member_message_uploads where actor_id=$1 and prepared_at>clock_timestamp()-interval '1 hour'", [users.sender])).rows[0].n, 24);
      for (const id of ids) await prepare(id);
      await refused(() => prepare(uuid(300), { operation: uuid(301) }), "MM429", /Attachment limit/);
      assert.deepEqual(await receipts(), first);
    });
    await test("M1 valid changed actor/conversation/operation/file tuple remains MM409 even at quota", async () => {
      const otherConversation = uuid(400);
      await role("postgres"); await db.query("insert into public.member_conversations(id,user_a,user_b,created_by) values($1,$2,$3,$2)", [otherConversation, users.sender, users.outsider]);
      for (const changes of [
        { actor: users.owner }, { conversation: otherConversation }, { operation: uuid(401) },
        { file: { ...file, fileName: "different.jpg" } }, { file: { ...file, mimeType: "image/png" } }, { file: { ...file, fileSizeBytes: 2048 } }
      ]) await refused(() => prepare(ids[0], changes), "MM409", /another attachment/);
      assert.deepEqual(await receipts(), first);
    });
    await test("M1 invalid name/type/size/shape remains 22023 BEFORE exact receipt replay", async () => {
      for (const invalid of [
        { ...file, fileName: "../fixture.jpg" }, { ...file, fileName: "" }, { ...file, fileName: "x".repeat(121) },
        { ...file, mimeType: "application/pdf" }, { ...file, fileSizeBytes: 0 }, { ...file, fileSizeBytes: 15728641 },
        { ...file, fileSizeBytes: 1.5 }, { ...file, extra: true }
      ]) await refused(() => prepare(ids[0], { file: invalid }), "22023");
      assert.deepEqual(await receipts(), first);
    });
    await test("M1 inactive actor/peer and missing/nonparticipant conversation remain denied", async () => {
      await refused(() => prepare(ids[0], { actor: users.outsider }), "MM404");
      await refused(() => prepare(ids[0], { actor: uuid(502) }), "MM401");
      await refused(() => prepare(ids[0], { conversation: uuid(500) }), "MM404");
      for (const actor of [users.sender, users.owner]) {
        await role("postgres"); await db.query("update public.profiles set account_status='locked' where id=$1", [actor]);
        await refused(() => prepare(ids[0]), "MM401");
        await role("postgres"); await db.query("update public.profiles set account_status='active' where id=$1", [actor]);
      }
      assert.deepEqual(await receipts(), first);
    });
    await test("M1 anonymous/authenticated cannot EXECUTE; service-only ACL and direct-table boundary unchanged", async () => {
      for (const name of ["anon", "authenticated"]) {
        await role(name, users.sender);
        await refused(() => db.query("select public.prepare_member_message_upload($1,$2,$3,$4,$5::jsonb)", [conversationId, users.sender, operation, ids[0], JSON.stringify(file)]), "42501");
      }
      await role("authenticated", users.sender);
      await refused(() => db.query("select * from public.member_message_uploads"), "42501");
      await prepare(ids[0]); assert.deepEqual(await receipts(), first);
    });
    await test("M1 discarded/committed receipts and already-sent operation cannot be reused", async () => {
      await role("postgres");
      await db.query("update public.member_message_uploads set state='discarded',discarded_at=clock_timestamp() where upload_id=$1", [ids[0]]);
      await refused(() => prepare(ids[0]), "MM409", /no longer/);
      await role("postgres");
      const syntheticMessage = uuid(600);
      await db.query("insert into public.member_messages(id,conversation_id,sender_id,client_operation_id,body) values($1,$2,$3,$4,'fixture')", [syntheticMessage, conversationId, users.sender, uuid(601)]);
      await db.query("update public.member_message_uploads set state='committed',message_id=$2,committed_at=clock_timestamp() where upload_id=$1", [ids[1], syntheticMessage]);
      await refused(() => prepare(ids[1]), "MM409", /no longer/);
      await db.query("insert into public.member_messages(conversation_id,sender_id,client_operation_id,body) values($1,$2,$3,'sent fixture')", [conversationId, users.sender, operation]);
      await refused(() => prepare(ids[2]), "MM409", /already been sent/);
      await role("postgres");
      await db.query("delete from public.member_messages where sender_id=$1 and client_operation_id=$2", [users.sender, operation]);
    });
    await test("M1 does not introduce instrument gating: archived/missing context permits exact receipt replay", async () => {
      await role("postgres"); await db.query("update public.guitars set owner_removed_at=clock_timestamp() where id=$1", [guitarId]);
      await prepare(ids[2]); // Runbook must not call this existing durable-history behavior a new denial.
      await role("postgres"); await db.query("update public.member_conversations set context_guitar_id=null where id=$1", [conversationId]);
      await prepare(ids[2]);
      await role("postgres"); await db.query("update public.member_conversations set context_guitar_id=$2 where id=$1", [conversationId, guitarId]);
      await db.query("update public.guitars set owner_removed_at=null where id=$1", [guitarId]);
    });
    await testApiLostReply(conversationId, uuid, file);
  } finally { await db.exec("rollback"); await role("postgres"); }
  await db.exec(rollback);
  await test("M1 rollback restores previous function body modulo CRLF/LF and exact metadata", async () => {
    const restored = await metadata(), { definition: before, ...beforeMeta } = original, { definition: after, ...afterMeta } = restored;
    assert.deepEqual(afterMeta, beforeMeta); assert.equal(after.replaceAll("\r\n", "\n"), before.replaceAll("\r\n", "\n"));
  });
  await assertOldQuotaReplayFailure(conversationId, "rollback");
  console.log("M1 concurrency limit: PGlite is one queued connection; no real parallel-transaction/Storage/Auth acceptance claimed.");
}

async function testLegacyBlockProposed(conversationId) {
  await test("M1 proposal preserves the legacy blocked-conversation send guard before durable controls are disabled", async () => {
    assert.ok(rollbackPath); await role("postgres"); await db.exec(fs.readFileSync(proposalPath, "utf8")); await db.exec("begin");
    const op = "73000000-0000-4000-8000-000000000001", upload = "73000000-0000-4000-8000-000000000002";
    const prepare = () => service("select public.prepare_member_message_upload($1,$2,$3,$4,$5::jsonb)", [conversationId, users.sender, op, upload, JSON.stringify({ fileName: "blocked-fixture.jpg", mimeType: "image/jpeg", fileSizeBytes: 1024 })]);
    try {
      await prepare(); await service("select public.set_member_message_block($1,$2,true)", [users.owner, users.sender]);
      await db.exec("savepoint blocked_replay");
      await assert.rejects(prepare(), error => error.code === "MM403" && /Messaging is unavailable/.test(error.message));
      await db.exec("rollback to savepoint blocked_replay; release savepoint blocked_replay");
    } finally { await db.exec("rollback"); await role("postgres"); await db.exec(fs.readFileSync(rollbackPath, "utf8")); }
  });
}

async function assertOldQuotaReplayFailure(conversationId, label) {
  await test("M1 " + label + ": exact receipt replay fails at four and hourly24 with MM429", async () => {
    const uuid = n => "72000000-0000-4000-8000-" + String(n).padStart(12, "0");
    const file = JSON.stringify({ fileName: "old-fixture.jpg", mimeType: "image/jpeg", fileSizeBytes: 1024 });
    const prepare = (operation, upload) => service("select public.prepare_member_message_upload($1,$2,$3,$4,$5::jsonb)", [conversationId, users.sender, uuid(operation), uuid(upload), file]);
    await role("postgres"); await db.exec("begin");
    try {
      await db.exec("update public.member_message_uploads set prepared_at=clock_timestamp()-interval '2 hours'");
      for (let n = 0; n < 4; n++) await prepare(1, 10 + n);
      await db.exec("savepoint old_four");
      await assert.rejects(prepare(1, 10), error => error.code === "MM429" && /four attachments/.test(error.message));
      await db.exec("rollback to savepoint old_four; release savepoint old_four");
      // An operation below its own four-file cap isolates the global hourly cap.
      for (let n = 0; n < 20; n++) await prepare(100 + n, 200 + n);
      await role("postgres");
      assert.equal((await db.query("select count(*)::integer n from public.member_message_uploads where actor_id=$1 and prepared_at>clock_timestamp()-interval '1 hour'", [users.sender])).rows[0].n, 24);
      await db.exec("savepoint old_hour");
      await assert.rejects(prepare(100, 200), error => error.code === "MM429" && /Attachment limit/.test(error.message));
      await db.exec("rollback to savepoint old_hour; release savepoint old_hour");
    } finally { await db.exec("rollback"); await role("postgres"); }
  });
}

async function testApiLostReply(conversationId, uuid, file) {
  await test("M1 actual upload API lost four-file reply retries same IDs/paths, renews tokens, and sends once", async () => {
    // Auth is synthetic and signed URL minting is in-memory. Actual route code
    // calls the real proposed SQL in PGlite. No network or storage upload occurs.
    await role("postgres"); await db.exec("update public.member_message_uploads set prepared_at=clock_timestamp()-interval '2 hours'");
    const ts = require("typescript"), modules = new Map();
    const load = name => {
      if (modules.has(name)) return modules.get(name);
      const module = { exports: {} }, source = fs.readFileSync(path.join(repo, "apps/web/lib/" + name + ".ts"), "utf8");
      const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
      new Function("require", "module", "exports", code)(require, module, module.exports);
      modules.set(name, module.exports); return module.exports;
    };
    let signed = 0;
    const supabase = {
      rpc: async (name, args) => {
        try {
          const params = name === "prepare_member_message_upload"
            ? [args.p_conversation_id, args.p_actor_id, args.p_operation_id, args.p_upload_id, JSON.stringify(args.p_file)]
            : [args.p_conversation_id, args.p_actor_id, args.p_operation_id, args.p_body];
          const sql = name === "prepare_member_message_upload"
            ? "select public.prepare_member_message_upload($1,$2,$3,$4,$5::jsonb) value"
            : "select public.send_member_message($1,$2,$3,$4) value";
          return { data: (await service(sql, params)).rows[0].value, error: null };
        } catch (error) { return { data: null, error }; }
      },
      storage: { from: bucket => ({ createSignedUploadUrl: async (storagePath, options) => {
        assert.equal(bucket, "member-message-media"); assert.deepEqual(options, { upsert: false });
        return { data: { path: storagePath, token: "fixture-token-" + ++signed }, error: null };
      } }) },
      from() { throw Error("Unexpected destructive route cleanup during successful protected replay"); }
    };
    function route(name) {
      const module = { exports: {} }, source = fs.readFileSync(path.join(repo, "apps/web/app/api/messages/[conversationId]/" + name + "/route.ts"), "utf8");
      const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
      new Function("require", "module", "exports", code)(specifier => {
        if (specifier.endsWith("/member-messaging")) return load("member-messaging");
        if (specifier.endsWith("/member-messaging-http")) return load("member-messaging-http");
        if (specifier.endsWith("/member-messaging-server")) return {
          requireMessagingAccess: async () => ({ ok: true, user: { id: users.sender }, supabase }),
          requireParticipantConversation: async (_, actor, id) => {
            await role("postgres"); return (await db.query("select 1 from public.member_conversations where id=$1 and $2 in (user_a,user_b)", [id, actor])).rows.length === 1;
          },
          messagingDatabaseError: error => ({ message: error.message, status: error.code === "MM429" ? 429 : 409 })
        };
        throw Error("Unexpected route dependency: " + specifier);
      }, module, module.exports);
      return module.exports;
    }
    const uploads = route("uploads"), send = route("send"), op = uuid(700);
    const files = [701, 702, 703, 704].map(n => ({ uploadId: uuid(n), ...file }));
    const context = { params: Promise.resolve({ conversationId }) };
    const request = (endpoint, body) => new Request("https://fixture.invalid/api/messages/" + conversationId + "/" + endpoint, {
      method: "POST", headers: { origin: "https://fixture.invalid", "content-type": "application/json", "sec-fetch-site": "same-origin", authorization: "Bearer synthetic" }, body: JSON.stringify(body)
    });
    const firstResponse = await uploads.POST(request("uploads", { operationId: op, files }), context);
    assert.equal(firstResponse.status, 200);
    const first = await firstResponse.json(); // Harness inspection; simulated client loses this response.
    await role("postgres"); const before = (await db.query("select * from public.member_message_uploads where operation_id=$1 order by upload_id", [op])).rows;
    const retryResponse = await uploads.POST(request("uploads", { operationId: op, files }), context);
    assert.equal(retryResponse.status, 200); const retry = await retryResponse.json();
    assert.deepEqual(retry.uploads.map(u => [u.uploadId, u.path]), first.uploads.map(u => [u.uploadId, u.path]));
    assert.notDeepEqual(retry.uploads.map(u => u.token), first.uploads.map(u => u.token));
    await role("postgres"); assert.deepEqual((await db.query("select * from public.member_message_uploads where operation_id=$1 order by upload_id", [op])).rows, before);
    for (const upload of retry.uploads) await db.query("insert into storage.objects(bucket_id,name,metadata) values('member-message-media',$1,$2::jsonb)", [upload.path, JSON.stringify({ mimetype: file.mimeType, size: file.fileSizeBytes })]);
    const sent = await send.POST(request("send", { operationId: op, message: "Synthetic lost-response fixture" }), context);
    assert.equal(sent.status, 200); const saved = await sent.json();
    const replay = await send.POST(request("send", { operationId: op, message: "Synthetic lost-response fixture" }), context);
    assert.equal(replay.status, 200); assert.equal((await replay.json()).messageId, saved.messageId);
    await role("postgres");
    assert.equal((await db.query("select count(*)::integer n from public.member_messages where sender_id=$1 and client_operation_id=$2", [users.sender, op])).rows[0].n, 1);
    assert.equal((await db.query("select count(*)::integer n from public.member_message_attachments where message_id=$1", [saved.messageId])).rows[0].n, 4);
  });
}
