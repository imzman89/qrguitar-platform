import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { installRepositorySchema } from "./security/postgres-fixture.mjs";

const repo = path.resolve(process.cwd(), "../..");
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
  console.log(`PASS ${passed} member messaging database cases`);
} finally {
  await db.close();
}
