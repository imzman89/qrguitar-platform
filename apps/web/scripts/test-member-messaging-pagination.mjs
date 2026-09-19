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
    if (match) { this.filters.push((row) => row.updated_at < match[1] || (row.updated_at === match[2] && row.id < match[3])); return this; }
    match = expression.match(/^created_at\.lt\.([^,]+),and\(created_at\.eq\.([^,]+),id\.lt\.([0-9a-f-]+)\)$/i);
    if (match) { this.filters.push((row) => row.created_at < match[1] || (row.created_at === match[2] && row.id < match[3])); return this; }
    const exact = [...expression.matchAll(/and\(conversation_id\.eq\.([0-9a-f-]+),created_at\.eq\.([^)]+)\)/gi)]
      .map((item) => `${item[1]}|${item[2]}`);
    if (exact.length) { const allowed = new Set(exact); this.filters.push((row) => allowed.has(`${row.conversation_id}|${row.created_at}`)); return this; }
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
        const compared = a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? -1 : 1;
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

console.log("PASS member messaging cursor pagination covers 121 conversations, 425 messages, exact previews, signed attachments, API validation, and client merges");
