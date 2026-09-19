import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const web = path.resolve(process.cwd());
const read = (file) => fs.readFileSync(path.join(web, file), "utf8");
const status = read("components/ProfileStatusBadges.tsx");
const card = read("components/CollectibleRecordCard.tsx");
const profile = read("app/i/[code]/ProfileClient.tsx");
const member = read("app/collections/[handle]/page.tsx");
const messages = read("components/MessagesClient.tsx");
const dto = read("lib/member-messaging.ts");
const server = read("lib/member-messaging-server.ts");
const controls = read("app/api/messages/[conversationId]/controls/route.ts");
const migration = read("../../supabase/migrations/20260918180000_member_messaging.sql");
const deletionMigration = read("../../supabase/migrations/20260918181000_member_messaging_account_deletion.sql");

assert.match(status, /Owned by <strong>/);
assert.match(status, /href={`\/collections\/\$\{ownerCollection\.handle\}`}/);
assert.match(card, /ownerCollection={record\.publicCollection}/);
assert.match(profile, /ownerCollection={instrument\.publicCollection}/);
assert.match(profile, /MemberMessageLink/);
assert.match(member, /MemberMessageLink/);
assert.match(member, /SellerWebsiteLink/);
assert.doesNotMatch(member, /CollectionInquiryForm/);

assert.match(messages, /postgres_changes/);
assert.match(messages, /setInterval\(refresh, 12000\)/);
assert.match(messages, /window\.addEventListener\("online"/);
assert.match(messages, /MEMBER_MEDIA_COUNT_LIMIT/);
assert.match(messages, /uncertainSend/);
assert.doesNotMatch(messages, /Archive conversation|Restore conversation|Block member|Unblock member|No archived conversations/);
assert.match(messages, /Conversation history stays available to both members/);
assert.doesNotMatch(messages, /submitReport|Report sent to QRguitar for review/);
assert.match(messages, /mailto:support@qrguitar\.com/);
assert.match(messages, /Report a safety concern/);
assert.doesNotMatch(messages, /blockConfirmOpen|thread\.blocked|thread\.archived/);
assert.match(controls, /action !== "read"/);
assert.doesNotMatch(controls, /set_member_conversation_archived|set_member_message_block/);
assert.doesNotMatch(messages, /window\.confirm/);

assert.doesNotMatch(dto, /peerId|senderId|storagePath/);
assert.match(server, /code === "PD423"/);
assert.match(migration, /member_conversation_participant_read/);
assert.match(migration, /member_message_participant_read/);
assert.match(migration, /member_message_media_no_direct_access/);
assert.match(migration, /grant execute[\s\S]*to service_role/);
assert.match(migration, /Message limit reached/);
assert.match(deletionMigration, /member-message-media/);
assert.match(deletionMigration, /account_deletion_fence_member_conversations|account_deletion_fence_'\|\|table_name/);
assert.match(deletionMigration, /delete from public\.member_conversations/);

const writeRoutes = [
  "app/api/messages/conversations/route.ts",
  "app/api/messages/[conversationId]/send/route.ts",
  "app/api/messages/[conversationId]/uploads/route.ts",
  "app/api/messages/[conversationId]/controls/route.ts"
];
for (const route of writeRoutes) {
  const source = read(route);
  assert.match(source, /memberMessageOriginAllowed\(request\)/, `${route} must enforce same-origin writes`);
  assert.match(source, /requireMessagingAccess\(request\)/, `${route} must require an active account`);
}

console.log("PASS member attribution, public member page, real-time UI, media, and API contract");
