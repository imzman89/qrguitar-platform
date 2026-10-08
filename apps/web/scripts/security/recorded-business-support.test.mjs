import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { installRepositorySchema } from "./postgres-fixture.mjs";
import { loadRoutes } from "./mock-routes.mjs";
const args = process.argv.slice(2);
const repo = path.resolve(args.includes("--repo") ? args[args.indexOf("--repo") + 1] : path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../.."));
const requireWeb = createRequire(path.join(repo, "apps/web/package.json"));
const { PGlite } = requireWeb("@electric-sql/pglite-pg17");
const ts = requireWeb("typescript");
const db = new PGlite();
const buyer = "11111111-1111-4111-8111-111111111111";
const seller = "22222222-2222-4222-8222-222222222222";
const stranger = "33333333-3333-4333-8333-333333333333";
const guitar = "44444444-4444-4444-8444-444444444444";
const transfer = "55555555-5555-4555-8555-555555555555";
const oldTransfer = "66666666-6666-4666-8666-666666666666";
const uuid = () => crypto.randomUUID();
const ownerKey = id => "public_collection_owner:" + id;
const handleKey = handle => "public_collection_handle:" + handle;
const settings = extra => ({ enabled: true, handle: "recorded-shop", publicName: "Synthetic business", accountType: "shop", allowMessages: true, ...extra });
let passes = 0;
async function test(name, run) { await run(); passes++; console.log("PASS " + name); }
async function save(value, id = seller, expected) {
  const version = Number((await db.query("select account_settings_version from profiles where id=$1", [id])).rows[0].account_settings_version);
  return (await db.query("select public.save_account_settings($1,$2,$3::jsonb,$4::bigint) as saved", [id, "Synthetic account", value, expected ?? version])).rows[0].saved;
}
async function raw(value) { await db.query("update site_content set content_value=$1 where content_key=$2", [value, ownerKey(seller)]); }
async function snapshot() {
  return (await db.query("select jsonb_build_object('profiles',(select jsonb_agg(to_jsonb(p) order by id) from profiles p),'content',(select jsonb_agg(to_jsonb(s) order by content_key) from site_content s)) as state")).rows[0].state;
}
// This adapter translates the actual source's projections/filters/orders into real fixture SQL.
// It contains no ownership, transfer, role or consent decisions.
function adapter() {
  const calls = [];
  const ident = value => { assert.match(value, /^[a-z_]+$/); return '"' + value + '"'; };
  class Query {
    constructor(table) { this.table = table; this.columns = "*"; this.where = []; this.values = []; this.sort = []; }
    select(columns) { this.columns = columns; return this; }
    eq(column, value) { this.values.push(value); this.where.push(ident(column) + "=$" + this.values.length); return this; }
    is(column, value) { assert.equal(value, null); this.where.push(ident(column) + " is null"); return this; }
    in(column, values) { this.values.push(values); this.where.push(ident(column) + "::text=any($" + this.values.length + "::text[])"); return this; }
    order(column, options) { this.sort.push(ident(column) + (options?.ascending === false ? " desc" : " asc")); return this; }
    limit(value) { assert.ok(Number.isInteger(value) && value > 0); this.cap = value; return this; }
    maybeSingle() { this.single = true; return this; }
    async result() {
      calls.push({ table: this.table, columns: this.columns });
      try {
        const columns = this.columns === "*" ? "*" : this.columns.split(",").map(ident).join(",");
        const sql = "select " + columns + " from " + ident(this.table) + (this.where.length ? " where " + this.where.join(" and ") : "")
          + (this.sort.length ? " order by " + this.sort.join(",") : "") + (this.cap ? " limit " + this.cap : "");
        const result = await db.query(sql, this.values);
        if (this.single && result.rows.length > 1) return { error: { message: "Nonunique fixture read" }, data: null };
        return { error: null, data: this.single ? result.rows[0] || null : result.rows };
      } catch (error) { return { error: { code: error.code, message: "Synthetic SQL read unavailable" }, data: null }; }
    }
    then(resolve, reject) { return this.result().then(resolve, reject); }
  }
  const rpcArgs = {
    save_account_settings: ["p_user_id", "p_display_name", "p_collection", "p_expected_version"],
    ensure_member_conversation: ["p_actor_id", "p_target_id", "p_context_guitar_id"],
    ensure_recorded_business_conversation: ["p_actor_id", "p_target_id", "p_transfer_id", "p_handle"]
  };
  return { calls, from: table => new Query(table),
    async rpc(name, parameters) {
      calls.push({ rpc: name, parameters });
      try { const keys = rpcArgs[name]; assert.ok(keys); return { data: (await db.query("select public." + name + "(" + keys.map((_, i) => "$" + (i + 1)).join(",") + ") as result", keys.map(k => parameters[k]))).rows[0].result, error: null }; }
      catch (error) { return { data: null, error: { code: error.code, message: error.message } }; }
    },
    auth: { admin: { updateUserById: async () => ({ error: null }) } },
    storage: { from() { throw new Error("No media access in recorded-contact qualification."); } }
  };
}
const routeRequest = body => new Request("https://fixture.invalid/api/messages/conversations", { method: "POST", headers: { origin: "https://fixture.invalid", "content-type": "application/json" }, body: JSON.stringify(body) });
const contactRequest = () => new Request("https://fixture.invalid/api/instruments/business-contact?code=QRG-SUPPORT");
try {
  await installRepositorySchema(db, repo, "20260918180000");
  for (const migration of ["20260918180000_member_messaging.sql", "20260918182000_durable_member_message_history.sql", "20260930010000_member_message_upload_replay.sql", "20261005213000_recorded_business_support.sql"])
    await db.exec(fs.readFileSync(path.join(repo, "supabase/migrations", migration), "utf8").replaceAll("\r\n", "\n"));
  await db.query("insert into auth.users(id,email) values($1,'buyer-private@example.test'),($2,'seller-private@example.test'),($3,'stranger-private@example.test')", [buyer, seller, stranger]);
  await db.query("insert into profiles(id,display_name) values($1,'Buyer'),($2,'Business'),($3,'Stranger')", [buyer, seller, stranger]);
  await db.query("insert into guitars(id,owner_id,name,brand,model,qr_code,permanent_path,visibility,serial_number) values($1,$2,'Synthetic private instrument','Unrelated brand','Test model','QRG-SUPPORT','/i/QRG-SUPPORT','private','DO-NOT-EXPOSE')", [guitar, buyer]);
  await db.query("insert into ownership_transfers(id,guitar_id,from_owner_id,to_email,status,accepted_by,accepted_at,claim_token_hash) values($1,$2,$3,'buyer-private@example.test','accepted',$4,'2026-10-05T12:00:00Z','private-claim-hash'),($5,$2,$3,'buyer-private@example.test','accepted',$4,'2026-10-04T12:00:00Z','older-private-hash')", [transfer, guitar, seller, buyer, oldTransfer]);
  await save({ enabled: false, handle: "", publicName: "", accountType: "player" }, buyer);
  await save(settings({ allowWarrantyHelp: false, warrantyHelpUrl: "" }));
  const sqlDb = adapter();
  const modules = { "server-only": {} }; // Build-time server marker only; all policy modules remain actual source.
  const load = loadRoutes(repo, sqlDb, { user: { id: buyer }, modules });
  const helper = load("apps/web/lib/recorded-business-contact.ts");
  const cleaner = load("apps/web/lib/public-collections.ts");
  const contactRoute = load("apps/web/app/api/instruments/business-contact/route.ts");
  const conversationRoute = load("apps/web/app/api/messages/conversations/route.ts");

  await test("new assistance defaults off and legacy brand normalizes to builder", async () => {
    assert.equal(cleaner.cleanPublicCollection({}).allowWarrantyHelp, false);
    assert.equal(cleaner.cleanPublicCollection({ allowWarrantyHelp: "true" }).allowWarrantyHelp, false);
    assert.equal(cleaner.cleanPublicCollection({}).warrantyHelpUrl, "");
    assert.equal(cleaner.cleanPublicCollection({ accountType: "brand" }).accountType, "builder");
    assert.equal(cleaner.cleanPublicCollection({ warrantyHelpUrl: "javascript:bad" }).warrantyHelpUrl, "");
  });
  for (const role of ["shop", "builder", "brand"]) for (const messages of [false, true]) for (const help of [false, true])
    await test(role + " independent opt-ins " + messages + "/" + help, async () => {
      const value = settings({ accountType: role === "brand" ? "builder" : role, allowMessages: messages, allowWarrantyHelp: help, warrantyHelpUrl: "https://support.example.test/" });
      const saved = await save(value);
      assert.equal(saved.publicCollection.allowWarrantyHelp, help);
      assert.equal(saved.publicCollection.warrantyHelpUrl, value.warrantyHelpUrl);
      if (role === "brand") await raw({ ...saved.publicCollection, accountType: "brand" });
      const response = await contactRoute.GET(contactRequest()); assert.equal(response.status, 200);
      const body = await response.json();
      assert.deepEqual(body.contact, { transferId: transfer, publicName: value.publicName, handle: value.handle, messageAllowed: messages, warrantyHelpUrl: help ? value.warrantyHelpUrl : "" });
      const serialized = JSON.stringify(body);
      for (const secret of ["senderId", "from_owner_id", "DO-NOT-EXPOSE", "private-claim-hash", "buyer-private", "seller-private", "to_email", seller])
        assert.ok(!serialized.includes(secret), "No private contact field: " + secret);
    });
  await test("omitted assistance fields preserve saved choices; name-only save preserves content", async () => {
    await save(settings({ allowWarrantyHelp: true, warrantyHelpUrl: "https://support.example.test/" }));
    const saved = await save(settings({ allowMessages: false }));
    assert.equal(saved.publicCollection.allowWarrantyHelp, true); assert.equal(saved.publicCollection.warrantyHelpUrl, "https://support.example.test/");
    const before = await snapshot(); await save(null); assert.deepEqual((await snapshot()).content, before.content);
  });
  await test("old Account HTTP payload preserves previously opted-in assistance", async () => {
    await save(settings({ allowWarrantyHelp: true, warrantyHelpUrl: "https://support.example.test/" }));
    const route = loadRoutes(repo, sqlDb, { user: { id: seller }, modules })("apps/web/app/api/account/route.ts");
    const expectedVersion = Number((await db.query("select account_settings_version from profiles where id=$1", [seller])).rows[0].account_settings_version);
    const response = await route.PATCH(new Request("https://fixture.invalid/api/account", { method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Old client", expectedVersion, publicCollection: settings({ allowMessages: false }) }) }));
    assert.equal(response.status, 200); const result = await response.json();
    assert.equal(result.account.publicCollection.allowWarrantyHelp, true); assert.equal(result.account.publicCollection.warrantyHelpUrl, "https://support.example.test/");
    const request = sqlDb.calls.findLast(call => call.rpc === "save_account_settings").parameters.p_collection;
    assert.equal("allowWarrantyHelp" in request, false); assert.equal("warrantyHelpUrl" in request, false);
  });
  await test("unsafe assistance and stale versions roll back the entire account snapshot", async () => {
    for (const value of [{ allowWarrantyHelp: "true" }, { warrantyHelpUrl: "http://unsafe.example/" }, { warrantyHelpUrl: "https://user:pass@example.test/" }, { warrantyHelpUrl: "https://example.test\\@evil.test/" }, { allowWarrantyHelp: true, warrantyHelpUrl: "" }]) {
      const before = await snapshot();
      await assert.rejects(save(settings(value)), error => error.code === "22023"); assert.deepEqual(await snapshot(), before);
    }
    const before = await snapshot(); await assert.rejects(save(settings(), seller, -1), error => error.code === "22023"); assert.deepEqual(await snapshot(), before);
    const current = Number((await db.query("select account_settings_version from profiles where id=$1", [seller])).rows[0].account_settings_version);
    await assert.rejects(save(settings(), seller, current - 1), error => error.code === "PT409"); assert.deepEqual(await snapshot(), before);
  });
  await save(settings({ allowWarrantyHelp: false, warrantyHelpUrl: "" }));
  await test("anonymous/nonowner cannot obtain owner support", async () => {
    const anonymous = loadRoutes(repo, sqlDb, { modules })("apps/web/app/api/instruments/business-contact/route.ts");
    const strangerRoute = loadRoutes(repo, sqlDb, { user: { id: stranger }, modules })("apps/web/app/api/instruments/business-contact/route.ts");
    assert.equal((await anonymous.GET(contactRequest())).status, 401); assert.equal((await strangerRoute.GET(contactRequest())).status, 404);
  });
  await test("reassigned or missing handle cannot redirect a recorded contact", async () => {
    await db.query("update site_content set content_value=$1 where content_key=$2", [{ ownerId: stranger }, handleKey("recorded-shop")]);
    assert.equal(await helper.loadRecordedBusinessContact(sqlDb, buyer, { code: "QRG-SUPPORT" }), null);
    const response = await conversationRoute.POST(routeRequest({ handle: "recorded-shop", transferId: transfer }));
    assert.equal(response.status, 404);
    await db.query("update site_content set content_value=$1 where content_key=$2", [{ ownerId: seller }, handleKey("recorded-shop")]);
  });
  await test("arbitrary, older, sent and different-recipient handoffs do not create a conversation", async () => {
    for (const receipt of [oldTransfer, uuid()]) assert.equal((await conversationRoute.POST(routeRequest({ handle: "recorded-shop", transferId: receipt }))).status, 404);
    await db.query("update ownership_transfers set status='sent' where id=$1", [transfer]);
    assert.equal((await conversationRoute.POST(routeRequest({ handle: "recorded-shop", transferId: transfer }))).status, 404);
    await db.query("update ownership_transfers set status='accepted',accepted_by=$2 where id=$1", [transfer, stranger]);
    assert.equal((await conversationRoute.POST(routeRequest({ handle: "recorded-shop", transferId: transfer }))).status, 404);
    await db.query("update ownership_transfers set accepted_by=$2 where id=$1", [transfer, buyer]);
    assert.equal((await db.query("select count(*)::integer as count from member_conversations")).rows[0].count, 0);
  });
  await test("nonbusiness/hidden/inactive/missing settings fail closed", async () => {
    const saved = (await db.query("select content_value from site_content where content_key=$1", [ownerKey(seller)])).rows[0].content_value;
    for (const value of [null, { ...saved, accountType: "collector" }, { ...saved, enabled: false }]) {
      await raw(value ?? {}); assert.equal(await helper.loadRecordedBusinessContact(sqlDb, buyer, { code: "QRG-SUPPORT" }), null);
    }
    await raw(saved);
    for (const [field, value] of [["hide_public_content", true], ["account_status", "locked"]]) {
      await db.query("update profiles set " + field + "=$1 where id=$2", [value, seller]);
      assert.equal(await helper.loadRecordedBusinessContact(sqlDb, buyer, { code: "QRG-SUPPORT" }), null);
      await db.query("update profiles set " + field + "=$1 where id=$2", [field === "hide_public_content" ? false : "active", seller]);
    }
    const unavailable = { ...sqlDb, from() { return { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: null, error: { message: "Synthetic outage" } }) }; } };
    await assert.rejects(helper.loadRecordedBusinessContact(unavailable, buyer, { code: "QRG-SUPPORT" }), error => error.status === 503);
  });
  let conversation;
  await test("private default-off buyer opens existing pair inbox without public Profile context", async () => {
    const response = await conversationRoute.POST(routeRequest({ handle: "recorded-shop", transferId: transfer }));
    assert.equal(response.status, 200); conversation = (await response.json()).conversationId;
    const row = (await db.query("select context_guitar_id,created_by from member_conversations where id=$1", [conversation])).rows[0];
    assert.equal(row.context_guitar_id, null); assert.equal(row.created_by, buyer);
    const buyerSettings = (await db.query("select content_value from site_content where content_key=$1", [ownerKey(buyer)])).rows[0].content_value;
    assert.equal(buyerSettings.enabled, false); assert.equal(buyerSettings.allowMessages, false);
  });
  const send = (actor, operation, body) => db.query("select public.send_member_message($1,$2,$3,$4) as sent", [conversation, actor, operation, body]);
  let operation, confirmed;
  await test("business replies to private player; requested support does not require buyer public contact", async () => {
    operation = uuid(); confirmed = (await send(buyer, operation, "Requested support")).rows[0].sent;
    const reply = (await send(seller, uuid(), "Business reply")).rows[0].sent; assert.equal(reply.replayed, false);
    assert.equal((await db.query("select count(*)::integer as count from member_messages where conversation_id=$1", [conversation])).rows[0].count, 2);
  });
  await test("business opt-out denies new inbound creation/send/upload, preserving exact committed replay/history", async () => {
    const before = (await db.query("select to_jsonb(m) as row from member_messages m where conversation_id=$1 order by id", [conversation])).rows;
    await save(settings({ allowMessages: false, allowWarrantyHelp: true, warrantyHelpUrl: "https://support.example.test/" }));
    assert.equal((await conversationRoute.POST(routeRequest({ handle: "recorded-shop", transferId: transfer }))).status, 403);
    await assert.rejects(send(buyer, uuid(), "New inbound"), error => error.code === "MM403");
    await assert.rejects(db.query("select public.prepare_member_message_upload($1,$2,$3,$4,$5)", [conversation, buyer, uuid(), uuid(), { fileName: "synthetic.jpg", mimeType: "image/jpeg", fileSizeBytes: 12 }]), error => error.code === "MM403");
    const replay = (await send(buyer, operation, "Requested support")).rows[0].sent;
    assert.deepEqual(replay, { ...confirmed, replayed: true });
    await assert.rejects(send(buyer, operation, "Changed body"), error => error.code === "MM409");
    const after = (await db.query("select to_jsonb(m) as row from member_messages m where conversation_id=$1 order by id", [conversation])).rows;
    assert.deepEqual(after, before);
    await db.query("select public.mark_member_conversation_read($1,$2)", [conversation, buyer]);
    await db.query("select public.mark_member_conversation_read($1,$2)", [conversation, seller]);
    assert.equal((await db.query("select user_a_archived_at,user_b_archived_at from member_conversations where id=$1", [conversation])).rows[0].user_a_archived_at, null);
    const thread = await load("apps/web/lib/member-messaging-server.ts").loadMemberConversation(sqlDb, buyer, conversation);
    assert.equal(thread.messages.length, 2); assert.equal(thread.messages.some(message => message.body === "Requested support"), true);
  });
  await test("ownership changed between HTTP proof and SQL creation is rejected atomically", async () => {
    await save(settings({ allowWarrantyHelp: false, warrantyHelpUrl: "" }));
    await db.query("update guitars set owner_id=$1 where id=$2", [stranger, guitar]);
    const before = (await db.query("select to_jsonb(c) as row from member_conversations c")).rows;
    await assert.rejects(db.query("select public.ensure_recorded_business_conversation($1,$2,$3,$4)", [buyer, seller, transfer, "recorded-shop"]), error => error.code === "MM404");
    assert.deepEqual((await db.query("select to_jsonb(c) as row from member_conversations c")).rows, before);
    await db.query("update guitars set owner_id=$1 where id=$2", [buyer, guitar]);
  });
  await test("recorded wrapper rejects changed handle/role and preserves existing pair identity", async () => {
    await assert.rejects(db.query("select public.ensure_recorded_business_conversation($1,$2,$3,$4)", [buyer, seller, transfer, "different-handle"]), error => error.code === "MM404");
    await assert.rejects(db.query("select public.ensure_recorded_business_conversation($1,$2,$3,$4)", [buyer, stranger, transfer, "recorded-shop"]), error => error.code === "MM404");
    const result = (await db.query("select public.ensure_recorded_business_conversation($1,$2,$3,$4) as result", [buyer, seller, transfer, "recorded-shop"])).rows[0].result;
    assert.equal(result.conversationId, conversation); assert.equal(result.created, false);
  });
  await test("generic existing public member path and no-contact self-registered instrument remain supported", async () => {
    const response = await conversationRoute.POST(routeRequest({ handle: "recorded-shop" }));
    assert.equal(response.status, 200); assert.equal((await response.json()).conversationId, conversation);
    await db.query("update ownership_transfers set status='cancelled' where guitar_id=$1", [guitar]);
    assert.equal(await helper.loadRecordedBusinessContact(sqlDb, buyer, { code: "QRG-SUPPORT" }), null);
    await db.query("update ownership_transfers set status='accepted' where guitar_id=$1", [guitar]);
  });
  await test("API roles cannot directly invoke private helper or recorded service entry", async () => {
    for (const role of ["anon", "authenticated"]) {
      await db.exec("set role " + role);
      await assert.rejects(db.query("select public.ensure_recorded_business_conversation($1,$2,$3,$4)", [buyer, seller, transfer, "recorded-shop"]), error => error.code === "42501");
      await assert.rejects(db.query("select public._member_require_business_message_consent($1)", [seller]), error => error.code === "42501");
      await db.exec("reset role");
    }
  });
  console.log(passes + " recorded business support tests passed; no external systems used.");
} finally { await db.close(); }
