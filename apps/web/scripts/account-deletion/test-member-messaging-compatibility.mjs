import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { installRepositorySchema } from "../security/postgres-fixture.mjs";

const repo = path.resolve(process.cwd(), "../..");
const db = new PGlite();
const actor = "10000000-0000-4000-8000-000000000001";
const peer = "20000000-0000-4000-8000-000000000002";
const otherA = "30000000-0000-4000-8000-000000000003";
const otherB = "40000000-0000-4000-8000-000000000004";
const requestId = "50000000-0000-4000-8000-000000000005";
const conversation = "60000000-0000-4000-8000-000000000006";
const unrelated = "70000000-0000-4000-8000-000000000007";
const operation = "80000000-0000-4000-8000-000000000008";
const upload = "90000000-0000-4000-8000-000000000009";
const reportId = "a0000000-0000-4000-8000-00000000000a";

async function service(sql, params = []) {
  await db.exec("reset role; set role service_role;");
  return db.query(sql, params);
}

try {
  await installRepositorySchema(db, repo, "20260918180000");
  await db.exec(fs.readFileSync(path.join(repo, "supabase/migrations/20260918180000_member_messaging.sql"), "utf8"));
  await db.exec(fs.readFileSync(path.join(repo, "supabase/migrations/20260918181000_member_messaging_account_deletion.sql"), "utf8"));
  await db.exec("reset role;");
  await db.query("insert into auth.users(id,email) values($1,'actor@example.invalid'),($2,'peer@example.invalid'),($3,'a@example.invalid'),($4,'b@example.invalid')", [actor, peer, otherA, otherB]);
  await db.query("insert into public.profiles(id,display_name,account_status) values($1,'Deleted member','active'),($2,'Peer','active'),($3,'Other A','active'),($4,'Other B','active')", [actor, peer, otherA, otherB]);
  await db.query("insert into public.member_conversations(id,user_a,user_b,created_by) values($1,$2,$3,$2),($4,$5,$6,$5)", [conversation, actor, peer, unrelated, otherA, otherB]);
  const sent = (await db.query("insert into public.member_messages(conversation_id,sender_id,client_operation_id,body) values($1,$2,$3,'Private message') returning id", [conversation, actor, operation])).rows[0].id;
  const unrelatedMessage = (await db.query("insert into public.member_messages(conversation_id,sender_id,client_operation_id,body) values($1,$2,$3,'Unrelated') returning id", [unrelated, otherA, "81000000-0000-4000-8000-000000000008"])).rows[0].id;
  await db.query(`insert into public.member_message_reports(
    id,conversation_id,message_id,reported_by,target_user_id,reason,details,status,reviewed_at,reviewed_by
  ) values($1,$2,$3,$4,$5,'other','Reviewed unrelated safety report','reviewed',clock_timestamp(),$6)`,
    [reportId, unrelated, unrelatedMessage, otherB, otherA, actor]);
  const actorPath = `${conversation}/${actor}/${operation}/${upload}.jpg`;
  const peerPath = `${conversation}/${peer}/${operation}/91000000-0000-4000-8000-000000000009.png`;
  const unrelatedPath = `${unrelated}/${otherA}/${operation}/92000000-0000-4000-8000-000000000009.jpg`;
  await db.query("insert into public.member_message_uploads(upload_id,conversation_id,actor_id,operation_id,file_name,mime_type,file_size_bytes,storage_path,state,message_id,committed_at) values($1,$2,$3,$4,'actor.jpg','image/jpeg',10,$5,'committed',$6,clock_timestamp())", [upload, conversation, actor, operation, actorPath, sent]);
  await db.query("insert into public.member_message_attachments(message_id,uploader_id,file_name,mime_type,file_size_bytes,storage_path) values($1,$2,'actor.jpg','image/jpeg',10,$3),($1,$4,'peer.png','image/png',20,$5),($6,$7,'other.jpg','image/jpeg',30,$8)", [sent, actor, actorPath, peer, peerPath, unrelatedMessage, otherA, unrelatedPath]);
  await db.query("insert into public.member_message_blocks(blocker_id,blocked_id) values($1,$2)", [peer, actor]);
  await db.exec(fs.readFileSync(path.join(repo, "supabase/migrations/20260918182000_durable_member_message_history.sql"), "utf8"));
  await db.query("insert into storage.objects(bucket_id,name,metadata) values('member-message-media',$1,'{}'),('member-message-media',$2,'{}'),('member-message-media',$3,'{}')", [actorPath, peerPath, unrelatedPath]);
  await db.query("update public.profiles set account_status='removed' where id=$1", [actor]);
  await db.query("insert into public.account_deletion_requests(id,actor_id,status) values($1,$2,'requested')", [requestId, actor]);
  await db.query(`insert into public.account_deletion_fulfillments(request_id,actor_id,actor_fingerprint,target_email,state,blockers,storage_quiesce_until,database_anonymized_at)
    values($1::uuid,$2::uuid,sha256(convert_to($2::uuid::text,'UTF8')),null,'ready_for_auth_deletion','[]'::jsonb,clock_timestamp()-interval '2 hours',clock_timestamp()-interval '1 hour')`, [requestId, actor]);

  await assert.rejects(
    service("insert into public.member_messages(conversation_id,sender_id,client_operation_id,body) values($1,$2,$3,'Late message')", [conversation, actor, "83000000-0000-4000-8000-000000000008"]),
    /privacy change in progress|frozen for privacy fulfillment/i
  );

  const plan = (await service("select public.prepare_member_messaging_account_deletion($1) value", [actor])).rows[0].value;
  assert.equal(plan.ok, true);
  assert.equal(plan.bucket, "member-message-media");
  assert.deepEqual(plan.paths, [actorPath, peerPath].sort());
  await assert.rejects(service("select public.complete_member_messaging_account_deletion($1)", [actor]), /media has not been removed/i);

  await db.exec("reset role;");
  await db.query("delete from storage.objects where bucket_id='member-message-media' and name=any($1::text[])", [plan.paths]);
  const completed = (await service("select public.complete_member_messaging_account_deletion($1) value", [actor])).rows[0].value;
  assert.equal(completed.ok, true);
  assert.equal(completed.removedConversations, 1);
  await db.exec("reset role;");
  assert.equal((await db.query("select count(*)::integer n from public.member_conversations where id=$1", [conversation])).rows[0].n, 0);
  assert.equal((await db.query("select count(*)::integer n from public.member_conversations where id=$1", [unrelated])).rows[0].n, 1);
  assert.equal((await db.query("select count(*)::integer n from storage.objects where name=$1", [unrelatedPath])).rows[0].n, 1);
  assert.equal((await db.query("select count(*)::integer n from public.member_message_blocks where blocker_id=$1 or blocked_id=$1", [actor])).rows[0].n, 0);
  assert.equal((await db.query("select count(*)::integer n from public.member_messages where sender_id=$1", [actor])).rows[0].n, 0);
  assert.equal((await db.query("select count(*)::integer n from public.member_message_uploads where actor_id=$1", [actor])).rows[0].n, 0);
  assert.equal((await db.query("select count(*)::integer n from public.member_message_attachments where uploader_id=$1", [actor])).rows[0].n, 0);
  const preservedReport = (await db.query("select id,conversation_id,message_id,reported_by,target_user_id,reason,details,status,reviewed_at,reviewed_by from public.member_message_reports where id=$1", [reportId])).rows[0];
  assert.equal(preservedReport.id, reportId);
  assert.equal(preservedReport.conversation_id, unrelated);
  assert.equal(preservedReport.message_id, unrelatedMessage);
  assert.equal(preservedReport.reported_by, otherB);
  assert.equal(preservedReport.target_user_id, otherA);
  assert.equal(preservedReport.reason, "other");
  assert.equal(preservedReport.details, "Reviewed unrelated safety report");
  assert.equal(preservedReport.status, "reviewed");
  assert.ok(preservedReport.reviewed_at);
  assert.equal(preservedReport.reviewed_by, null);
  assert.equal((await db.query("select count(*)::integer n from storage.objects where bucket_id='member-message-media' and strpos('/'||name||'/','/'||$1::text||'/')>0", [actor])).rows[0].n, 0);
  assert.equal((await db.query("select count(*)::integer n from auth.users where id=$1", [actor])).rows[0].n, 1);
  assert.equal((await db.query("select state from public.account_deletion_fulfillments where actor_id=$1", [actor])).rows[0].state, "ready_for_auth_deletion");
  console.log("PASS member messaging cleanup leaves Auth deletion to the reviewed finalizer");
} finally {
  await db.close();
}
