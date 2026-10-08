import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const web = path.resolve(process.cwd());
const require = createRequire(path.join(web, "package.json"));
const ts = require("typescript");

function compile(file, customRequire) {
  const source = fs.readFileSync(path.join(web, file), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", output)(customRequire || require, module, module.exports);
  return module.exports;
}

const messaging = compile("lib/member-messaging.ts");
const server = compile("lib/member-messaging-server.ts", (id) => {
  if (id === "server-only") return {};
  if (id === "./member-messaging") return messaging;
  if (id === "./admin-auth") return { assertAccountCanWrite: async () => ({ ok: true }) };
  if (id === "./public-collections") return {
    publicCollectionOwnerKey: (id) => `public_collection_owner:${id}`,
    cleanPublicCollection: () => ({ enabled: false, publicName: "", handle: "", accountType: "member", bio: "", location: "", websiteUrl: "", avatarUrl: "" })
  };
  if (id === "./supabase-server") return { createServerSupabaseClient: () => null, getAuthenticatedUser: async () => ({ user: null }) };
  return require(id);
});

const actor = "10000000-0000-4000-8000-000000000001";
const peer = "20000000-0000-4000-8000-000000000002";
const uuid = (prefix, index) => `${prefix}0000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
const stamp = (offset) => new Date(Date.UTC(2026, 8, 18, 12, 0, 0) - offset * 1000).toISOString();
const conversationRows = Array.from({ length: 121 }, (_, index) => ({
  id: uuid("a", index + 1), user_a: actor, user_b: peer, context_guitar_id: null,
  created_at: stamp(index), updated_at: stamp(index), last_message_at: stamp(index),
  user_a_read_at: null, user_b_read_at: null
}));
const messageRows = [];
for (let index = 0; index < 600; index += 1) messageRows.push({
  id: uuid("b", index + 1), conversation_id: conversationRows[0].id, sender_id: index % 2 ? actor : peer,
  body: `High-volume ${index}`, created_at: stamp(index)
});
for (let index = 1; index < conversationRows.length; index += 1) messageRows.push({
  id: uuid("c", index + 1), conversation_id: conversationRows[index].id, sender_id: peer,
  body: `Exact preview ${index}`, created_at: conversationRows[index].last_message_at
});
const threadConversation = { ...conversationRows[0], last_message_at: stamp(0), updated_at: stamp(0) };
const threadMessages = Array.from({ length: 425 }, (_, index) => ({
  id: uuid("d", index + 1), conversation_id: threadConversation.id, sender_id: index % 2 ? actor : peer,
  body: `Thread ${index}`, created_at: stamp(index)
}));
const attachmentRows = [10, 420].map((index) => ({
  id: uuid("e", index + 1), message_id: threadMessages[index].id, file_name: `photo-${index}.jpg`,
  mime_type: "image/jpeg", file_size_bytes: 1234, storage_path: `${threadConversation.id}/${actor}/${index}.jpg`
}));

// Model PostgreSQL timestamp comparison at microsecond precision, independently
// of the server's cursor serializer. Date alone would hide the reported defect.
function timestampMicros(value) {
  const fraction = value.match(/\.(\d+)(?=Z|[+-]\d\d:\d\d$)/)?.[1] || "";
  const wholeSecond = value.replace(/\.\d+(?=Z|[+-]\d\d:\d\d$)/, "");
  return BigInt(Date.parse(wholeSecond)) * 1000n + BigInt(fraction.padEnd(6, "0"));
}
const timeKey = (conversationId, timestamp) => `${conversationId}|${timestampMicros(timestamp)}`;
const timestampCompare = (a, b) => timestampMicros(a) < timestampMicros(b) ? -1 : timestampMicros(a) > timestampMicros(b) ? 1 : 0;

class Query {
  constructor(client, table) { this.client = client; this.table = table; this.filters = []; this.orders = []; this.cap = null; }
  select() { return this; }
  eq(column, value) { this.filters.push((row) => String(row[column]) === String(value)); return this; }
  in(column, values) { const allowed = new Set(values.map(String)); this.filters.push((row) => allowed.has(String(row[column]))); return this; }
  or(expression) {
    this.client.orExpressions.push({ table: this.table, expression });
    let match = expression.match(/^user_a\.eq\.([0-9a-f-]+),user_b\.eq\.([0-9a-f-]+)$/i);
    if (match) { this.filters.push((row) => row.user_a === match[1] || row.user_b === match[2]); return this; }
    match = expression.match(/^updated_at\.lt\.([^,]+),and\(updated_at\.eq\.([^,]+),id\.lt\.([0-9a-f-]+)\)$/i);
    if (match) { this.filters.push((row) => timestampCompare(row.updated_at, match[1]) < 0 || (timestampCompare(row.updated_at, match[2]) === 0 && row.id < match[3])); return this; }
    match = expression.match(/^created_at\.lt\.([^,]+),and\(created_at\.eq\.([^,]+),id\.lt\.([0-9a-f-]+)\)$/i);
    if (match) { this.filters.push((row) => timestampCompare(row.created_at, match[1]) < 0 || (timestampCompare(row.created_at, match[2]) === 0 && row.id < match[3])); return this; }
    const exact = [...expression.matchAll(/and\(conversation_id\.eq\.([0-9a-f-]+),created_at\.eq\.([^)]+)\)/gi)]
      .map((item) => timeKey(item[1], item[2]));
    if (exact.length) { const allowed = new Set(exact); this.filters.push((row) => allowed.has(timeKey(row.conversation_id, row.created_at))); return this; }
    throw new Error(`Unhandled ${this.table} or filter: ${expression}`);
  }
  order(column, options = {}) { this.orders.push({ column, ascending: options.ascending !== false }); return this; }
  limit(value) { this.cap = value; return this; }
  rows() {
    let rows = [...(this.client.tables[this.table] || [])];
    for (const filter of this.filters) rows = rows.filter(filter);
    if (this.orders.length) rows.sort((left, right) => {
      for (const order of this.orders) {
        const a = left[order.column], b = right[order.column];
        const compared = a === b ? 0 : a === null ? 1 : b === null ? -1 : order.column.endsWith("_at") ? timestampCompare(a, b) : a < b ? -1 : 1;
        if (compared) return order.ascending ? compared : -compared;
      }
      return 0;
    });
    if (this.cap !== null) rows = rows.slice(0, this.cap);
    return rows;
  }
  maybeSingle() { const rows = this.rows(); return Promise.resolve({ data: rows.length === 1 ? rows[0] : null, error: null }); }
  then(resolve, reject) { return Promise.resolve({ data: this.rows(), error: null }).then(resolve, reject); }
}

function fakeClient({ conversations = conversationRows, messages = messageRows, attachments = [] } = {}) {
  const tables = {
    member_conversations: conversations,
    member_messages: messages,
    member_message_attachments: attachments,
    site_content: [],
    profiles: [{ id: peer, account_status: "active", hide_public_content: false }],
    guitars: []
  };
  return {
    tables,
    orExpressions: [],
    from(table) { return new Query(this, table); },
    storage: { from() { return { async createSignedUrls(paths) { return { error: null, data: paths.map((item) => ({ path: item, signedUrl: `https://signed.invalid/${encodeURIComponent(item)}?token=private` })) }; } }; } }
  };
}

const listClient = fakeClient();
const summaries = [];
let conversationCursor = null;
do {
  const page = await server.listMemberConversations(listClient, actor, conversationCursor);
  assert.ok(page.conversations.length <= server.MEMBER_CONVERSATION_PAGE_SIZE);
  summaries.push(...page.conversations);
  conversationCursor = page.nextCursor ? server.decodeMemberConversationCursor(page.nextCursor) : null;
} while (conversationCursor);
assert.equal(summaries.length, 121);
assert.equal(new Set(summaries.map((item) => item.id)).size, 121);
assert.equal(summaries.find((item) => item.id === conversationRows[1].id).lastMessage.body, "Exact preview 1");
assert.ok(listClient.orExpressions.some((item) => item.table === "member_messages" && item.expression.includes(`conversation_id.eq.${conversationRows[1].id},created_at.eq.${conversationRows[1].last_message_at}`)));
const previewFilters = listClient.orExpressions.filter((item) => item.table === "member_messages").map((item) => item.expression);
assert.ok(previewFilters.length >= 5);
assert.ok(Math.max(...previewFilters.map((filter) => Buffer.byteLength(filter, "utf8"))) < 4096);
assert.equal(server.decodeMemberConversationCursor("mm1.bad"), null);
assert.equal(server.decodeMemberConversationCursor("mc1.not-json"), null);

const microStamp = (index) => `2026-09-20T23:59:37.${String(416998 - index).padStart(6, "0")}+00:00`;
const microConversations = Array.from({ length: 28 }, (_, index) => ({
  ...conversationRows[0], id: uuid("f", index + 1), updated_at: microStamp(index), last_message_at: microStamp(index)
}));
const microPreviews = microConversations.map((row, index) => ({
  id: uuid("9", index + 1), conversation_id: row.id, sender_id: peer, body: `Microsecond preview ${index}`, created_at: row.last_message_at
}));
const microClient = fakeClient({ conversations: microConversations, messages: microPreviews });
const firstMicroPage = await server.listMemberConversations(microClient, actor);
assert.equal(firstMicroPage.conversations[0].lastMessage?.body, "Microsecond preview 0", "Real PostgreSQL microseconds must survive exact inbox lookup");
const microCursor = server.decodeMemberConversationCursor(firstMicroPage.nextCursor);
assert.equal(microCursor.updatedAt, "2026-09-20T23:59:37.416974Z");
const secondMicroPage = await server.listMemberConversations(microClient, actor, microCursor);
assert.deepEqual([...firstMicroPage.conversations, ...secondMicroPage.conversations].map(row => row.id), microConversations.map(row => row.id), "Conversations within one millisecond must not disappear at the page boundary");
assert.equal(secondMicroPage.nextCursor, null);

const microThread = Array.from({ length: 205 }, (_, index) => ({
  ...microPreviews[0], id: uuid("8", index + 1), created_at: microStamp(index), body: `Microsecond thread ${index}`
}));
const microThreadClient = fakeClient({ conversations: [microConversations[0]], messages: microThread });
const firstMicroThread = await server.loadMemberConversation(microThreadClient, actor, microConversations[0].id);
const microMessageCursor = server.decodeMemberMessageCursor(firstMicroThread.nextMessageCursor);
assert.equal(microMessageCursor.createdAt, "2026-09-20T23:59:37.416799Z");
const secondMicroThread = await server.loadMemberConversation(microThreadClient, actor, microConversations[0].id, microMessageCursor);
assert.equal(secondMicroThread.messages.length, 5, "Messages within one millisecond must survive pagination");
assert.equal(new Set([...firstMicroThread.messages, ...secondMicroThread.messages].map(row => row.id)).size, 205);
const mergedMicroThread = messaging.mergeMemberMessagePages(firstMicroThread.messages, secondMicroThread.messages);
assert.deepEqual(mergedMicroThread.map(row => row.id), [...microThread].reverse().map(row => row.id), "Client history merges must preserve microsecond chronology rather than sort same-millisecond messages by UUID");
assert.deepEqual(messaging.mergeMemberMessagePages(mergedMicroThread, firstMicroThread.messages).map(row => row.id), mergedMicroThread.map(row => row.id), "Refresh must preserve the full-precision order across loaded pages");

const laterMessage = { ...firstMicroThread.messages[0], id: uuid("1", 1), createdAt: "2026-09-20T23:59:37.416999Z", body: "Later" };
const earlierMessage = { ...firstMicroThread.messages[0], id: uuid("f", 1), createdAt: "2026-09-21T01:59:37.416001+02:00", body: "Earlier" };
assert.deepEqual(messaging.mergeMemberMessagePages([laterMessage], [earlierMessage]).map(row => row.body), ["Earlier", "Later"], "Timezone normalization and microseconds take precedence over reversed UUID order");
const equalTimestampA = { ...earlierMessage, createdAt: "2026-09-20T23:59:37.416900Z" };
const equalTimestampB = { ...laterMessage, createdAt: "2026-09-20T18:59:37.4169-05:00" };
assert.deepEqual(messaging.mergeMemberMessagePages([equalTimestampA], [equalTimestampB]).map(row => row.id), [laterMessage.id, earlierMessage.id], "Equivalent offsets and trailing zeros use the existing UUID tie-breaker");
const zeroMicros = { ...earlierMessage, createdAt: "2026-09-20T23:59:37.416Z" };
assert.deepEqual(messaging.mergeMemberMessagePages([laterMessage], [zeroMicros]).map(row => row.id), [earlierMessage.id, laterMessage.id], "Millisecond-only timestamps remain compatible");
const invalidTimestamp = { ...earlierMessage, createdAt: "not a timestamp" };
assert.deepEqual(messaging.mergeMemberMessagePages([invalidTimestamp], [laterMessage]).map(row => row.id), [laterMessage.id, earlierMessage.id], "Malformed timestamps retain the existing deterministic UUID fallback");
const replacement = { ...earlierMessage, body: "Refreshed earlier message", attachments: [{ id: "newly-signed" }] };
const replaced = messaging.mergeMemberMessagePages([laterMessage, earlierMessage], [replacement]);
assert.equal(replaced.length, 2);assert.equal(replaced[0], replacement, "Incoming duplicate IDs still replace stale message and attachment data");

const offsetClient = fakeClient({ conversations: [{ ...microConversations[0], last_message_at: "2026-09-21T01:59:37.416998+02:00" }], messages: [microPreviews[0]] });
assert.equal((await server.listMemberConversations(offsetClient, actor)).conversations[0].lastMessage?.body, "Microsecond preview 0", "Timezone normalization must retain all fractional digits");
const cursorWithTime = timestamp => `mc1.${Buffer.from(JSON.stringify([timestamp, microConversations[0].id]), "utf8").toString("base64url")}`;
assert.equal(server.decodeMemberConversationCursor(cursorWithTime("2026-09-20T23:59:37.416998Z")).updatedAt, "2026-09-20T23:59:37.416998Z");
assert.equal(server.decodeMemberConversationCursor(cursorWithTime("2026-09-20T23:59:37.416Z")).updatedAt, "2026-09-20T23:59:37.416Z", "Previously issued millisecond cursors remain valid");
for (const invalid of ["2026-02-30T23:59:37.416998Z", "2026-09-20T24:00:00.000Z", "2026-09-20T23:59:60.000Z", "2026-09-20T23:59:37.4169981Z", "2026-09-20T23:59:37.416998Z),id.gt.0", "2026-09-20T23:59:37.416998+00:00"]) {
  assert.equal(server.decodeMemberConversationCursor(cursorWithTime(invalid)), null, `Reject invalid or noncanonical cursor timestamp ${invalid}`);
}

const threadClient = fakeClient({ conversations: [threadConversation], messages: threadMessages, attachments: attachmentRows });
const threadPages = [];
let messageCursor = null;
do {
  const page = await server.loadMemberConversation(threadClient, actor, threadConversation.id, messageCursor);
  assert.ok(page);
  assert.ok(page.messages.length <= server.MEMBER_MESSAGE_PAGE_SIZE);
  threadPages.push(page);
  messageCursor = page.nextMessageCursor ? server.decodeMemberMessageCursor(page.nextMessageCursor) : null;
} while (messageCursor);
assert.deepEqual(threadPages.map((page) => page.messages.length), [200, 200, 25]);
let mergedMessages = [];
for (const page of threadPages) mergedMessages = messaging.mergeMemberMessagePages(mergedMessages, page.messages);
assert.equal(mergedMessages.length, 425);
assert.equal(new Set(mergedMessages.map((item) => item.id)).size, 425);
for (const attachmentIndex of [10, 420]) {
  const attachment = mergedMessages.find((item) => item.id === threadMessages[attachmentIndex].id).attachments[0];
  assert.match(attachment.signedUrl, /^https:\/\/signed\.invalid\//);
  assert.match(attachment.signedUrl, /token=private$/);
}
const refreshed = messaging.mergeMemberMessagePages(mergedMessages, threadPages[0].messages);
assert.equal(refreshed.find((item) => item.id === threadMessages[420].id).attachments[0].signedUrl,
  mergedMessages.find((item) => item.id === threadMessages[420].id).attachments[0].signedUrl);
assert.equal(messaging.mergeMemberConversationPages(summaries.slice(0, 100), summaries.slice(90)).length, 121);

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
let listCursorSeen = null;
const listRoute = compile("app/api/messages/route.ts", (id) => {
  if (id.endsWith("member-messaging-http")) return { memberMessageJson: json };
  if (id.endsWith("member-messaging-server")) return {
    requireMessagingAccess: async () => ({ ok: true, user: { id: actor }, supabase: {} }),
    decodeMemberConversationCursor: server.decodeMemberConversationCursor,
    listMemberConversations: async (_client, _actor, cursor) => { listCursorSeen = cursor; return { conversations: [], nextCursor: null }; }
  };
  return require(id);
});
const validConversationCursor = (await server.listMemberConversations(fakeClient(), actor)).nextCursor;
assert.equal((await listRoute.GET(new Request("https://www.qrguitar.com/api/messages?cursor=bad"))).status, 400);
assert.equal((await listRoute.GET(new Request(`https://www.qrguitar.com/api/messages?cursor=${validConversationCursor}&cursor=${validConversationCursor}`))).status, 400);
assert.equal((await listRoute.GET(new Request(`https://www.qrguitar.com/api/messages?cursor=${encodeURIComponent(validConversationCursor)}`))).status, 200);
assert.equal(listCursorSeen.id, server.decodeMemberConversationCursor(validConversationCursor).id);

let messageCursorSeen = null;
const threadRoute = compile("app/api/messages/[conversationId]/route.ts", (id) => {
  if (id.endsWith("member-messaging")) return messaging;
  if (id.endsWith("member-messaging-http")) return { memberMessageJson: json };
  if (id.endsWith("member-messaging-server")) return {
    requireMessagingAccess: async () => ({ ok: true, user: { id: actor }, supabase: {} }),
    decodeMemberMessageCursor: server.decodeMemberMessageCursor,
    loadMemberConversation: async (_client, _actor, _conversation, cursor) => { messageCursorSeen = cursor; return threadPages[1]; }
  };
  return require(id);
});
const validMessageCursor = threadPages[0].nextMessageCursor;
const context = { params: Promise.resolve({ conversationId: threadConversation.id }) };
assert.equal((await threadRoute.GET(new Request(`https://www.qrguitar.com/api/messages/${threadConversation.id}?cursor=${validConversationCursor}`), context)).status, 400);
assert.equal((await threadRoute.GET(new Request(`https://www.qrguitar.com/api/messages/${threadConversation.id}?cursor=${encodeURIComponent(validMessageCursor)}`), context)).status, 200);
assert.equal(messageCursorSeen.id, server.decodeMemberMessageCursor(validMessageCursor).id);

console.log("PASS member messaging cursor pagination covers 121 conversations, 425 messages, PostgreSQL microsecond previews, 28 same-millisecond conversations, 205 same-millisecond messages, timezone/invalid-date cases, signed attachments, API validation, and full-precision client merge ordering");
