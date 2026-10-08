import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fixture } from "./test-downstream-ux-recovery.mjs";
const require = createRequire(import.meta.url), ts = require("typescript"), React = require("react");
const root = path.resolve(import.meta.dirname, ".."), tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const session = id => id ? { access_token: "token-" + id, user: { id } } : null;
const member = { publicName: "Private member A", handle: "", accountType: "player", avatarUrl: "", bio: "", location: "", websiteUrl: "" };
const thread = { id: "conversation-a", member, contextProfile: null, messages: [{ id: "message-a", body: "Private history A", createdAt: "2026-09-20T12:00:00Z", sentByMe: false, attachments: [] }], hasOlderMessages: false, nextMessageCursor: null };
const transfer = { id: "transfer-a", status: "sent", guitarQrCode: "QRG-FIXTURE", guitarName: "Fixture" };
const ok = value => Response.json({ ok: true, ...value });
function messagesFetch(run = () => null) { return r => run(r) ?? (r.url.endsWith("/controls") ? ok({}) : r.url === "/api/messages" ? ok({ conversations: [{ ...thread, lastMessage: { body: "Private inbox A", createdAt: "2026-09-20T12:00:00Z", sentByMe: false } }], nextCursor: null }) : ok({ conversation: thread })); }
async function ready(kind, options) { const h = fixture(kind, options); await h.settle(); return h; }
const draft = (h, value = "Private draft A") => h.elements().find(n => n.type === "textarea").props.onChange({ target: { value } });
const drafts = h => h.elements().filter(n => n.type === "textarea").map(n => n.props.value);
const attach = h => { const target = { files: [{ name: "private-photo.png", type: "image/png", size: 123, lastModified: 1 }], value: "chosen" }; h.elements().find(n => n.type === "input" && n.props.type === "file").props.onChange({ target, currentTarget: target }); assert.equal(target.value, ""); };
const sends = h => h.requests.filter(r => r.url.endsWith("/send"));
const prepared = r => ok({ uploads: r.body.files.map(f => ({ uploadId: f.uploadId, path: "protected/" + f.uploadId, token: "signed-fixture" })) });

test("Messages old rendered composer cannot dispatch or restore draft/files after actor switch", async () => {
  const h = await ready("messages", { fetch: messagesFetch() }); draft(h); attach(h);
  const oldSend = h.button("Send").props.onClick;
  const oldDraft = h.elements().find(n => n.type === "textarea").props.onChange;
  const oldFiles = h.elements().find(n => n.type === "input" && n.props.type === "file").props.onChange;
  h.auth(session("actor-b")); await h.settle();
  oldDraft({ target: { value: "private old draft" } });
  const target = { files: [{ name: "old-private.png", type: "image/png", size: 123 }], value: "chosen" };
  oldFiles({ target, currentTarget: target }); oldSend(); await h.settle();
  assert.equal(sends(h).length, 0); assert.deepEqual(drafts(h), [""]); assert.doesNotMatch(h.text(), /old-private|private-photo/); h.unmount();
});

test("Messages content refresh retains draft/files and the uncertain protected operation", async () => {
  let count = 0;
  const h = await ready("messages", { fetch: messagesFetch(r => r.url.endsWith("/uploads") ? prepared(r) : r.url.endsWith("/send") ? ++count === 1 ? Promise.reject(Error("lost")) : ok({ messageId: "replayed" }) : null) });
  draft(h); attach(h); h.button("Send").props.onClick(); await h.settle();
  const operation = sends(h)[0].body.operationId;
  h.content({ "ui.components.MessagesClient.04d7b4833927": "Member messages" }); await h.settle();
  assert.deepEqual(drafts(h), ["Private draft A"]); assert.match(h.text(), /private-photo.png/);
  h.button("Retry send").props.onClick(); await h.settle();
  assert.equal(sends(h)[1].body.operationId, operation); assert.equal(h.requests.filter(r => r.url.endsWith("/uploads")).length, 1); h.unmount();
});
test("Messages conversation transition hides prior private state while new getSession hangs", async () => {
  let hang = false;
  const h = await ready("messages", { getSession: () => hang ? new Promise(() => {}) : Promise.resolve({ data: { session: session("actor-a") } }), fetch: messagesFetch() });
  draft(h); attach(h); hang = true; h.conversation("conversation-b");
  assert.doesNotMatch(h.text(), /Private history A|Private member A|private-photo/); assert.deepEqual(drafts(h), []);
  h.expire(); await h.settle(); assert.match(h.text(), /sign-in could not be checked/); h.unmount();
});

for (const conversationId of ["conversation-a", ""]) test("Messages clears " + (conversationId ? "thread/draft/files" : "inbox") + " immediately on account switch", async () => {
  const h = await ready("messages", { conversationId, fetch: messagesFetch() });
  if (conversationId) { draft(h); attach(h); }
  assert.match(h.text(), /Private/); h.auth(session("actor-b"));
  assert.doesNotMatch(h.text(), /Private history A|Private inbox A|private-photo/);
  assert.deepEqual(drafts(h), []); h.auth(null); await h.settle();
  assert.match(h.text(), /Sign in to Messages/); assert.equal(sends(h).length, 0); h.unmount();
});
test("Messages late old-account GET cannot repopulate the new account", async () => {
  const d = deferred(); let reads = 0;
  const h = fixture("messages", { fetch: messagesFetch(r => r.method === "GET" ? ++reads === 1 ? d.promise : ok({ conversation: { ...thread, member: { ...member, publicName: "Member B" }, messages: [] } }) : null) });
  await tick(); h.auth(session("actor-b")); await h.settle();
  d.resolve(ok({ conversation: thread })); await h.settle();
  assert.match(h.text(), /Member B/); assert.doesNotMatch(h.text(), /Private history A|Private member A/); h.unmount();
});
test("Messages token refresh retains same-account draft/files", async () => {
  const h = await ready("messages", { fetch: messagesFetch() }); draft(h); attach(h);
  h.auth({ ...session("actor-a"), access_token: "refreshed" }); await h.settle();
  assert.deepEqual(drafts(h), ["Private draft A"]); assert.match(h.text(), /private-photo.png/); h.unmount();
});
test("Messages startup getSession hang is bounded and late resolution cannot dispatch", async () => {
  const d = deferred(), h = fixture("messages", { getSession: () => d.promise, fetch: messagesFetch() });
  await tick(); h.expire(); await h.settle(); assert.match(h.text(), /sign-in could not be checked/);
  d.resolve({ data: { session: session("actor-a") } }); await h.settle();
  assert.equal(h.requests.length, 0); h.unmount(); assert.equal(h.afterUnmount(), 0);
});
test("Messages send getSession hang preserves draft and operation ID without late dispatch", async () => {
  let hang = false; const d = deferred();
  const h = await ready("messages", { getSession: () => hang ? d.promise : Promise.resolve({ data: { session: session("actor-a") } }), fetch: messagesFetch(r => r.url.endsWith("/send") ? ok({ messageId: "sent-a" }) : null) });
  draft(h); hang = true; h.button("Send").props.onClick(); await tick(); h.expire(); await h.settle();
  assert.equal(h.button("Retry send").props.disabled, false); assert.deepEqual(drafts(h), ["Private draft A"]);
  d.resolve({ data: { session: session("actor-a") } }); await h.settle(); assert.equal(sends(h).length, 0);
  hang = false; h.button("Retry send").props.onClick(); await h.settle(); assert.equal(sends(h).length, 1); h.unmount();
});
test("Messages auth recheck rejection after dispatch retains uncertain protected operation", async () => {
  let rejectCheck = false;
  const h = await ready("messages", { getSession: () => rejectCheck ? Promise.reject(Error("auth unavailable")) : Promise.resolve({ data: { session: session("actor-a") } }),
    fetch: messagesFetch(r => { if (!r.url.endsWith("/send")) return null; rejectCheck = true; return ok({ messageId: "committed" }); }) });
  draft(h); h.button("Send").props.onClick(); await h.settle();
  assert.equal(h.button("Retry send").props.disabled, false); const operation = sends(h)[0].body.operationId;
  rejectCheck = false; h.button("Retry send").props.onClick(); await h.settle();
  assert.equal(sends(h).length, 2); assert.equal(sends(h)[1].body.operationId, operation); h.unmount();
});
test("Messages lost four-file preparation reply preserves IDs and does not send partial media on refused replay", async () => {
  let preparations = 0;
  const h = await ready("messages", { fetch: messagesFetch(r => r.url.endsWith("/uploads") ? ++preparations === 1 ? Promise.reject(Error("lost")) : Response.json({ ok: false, message: "A message can include up to four attachments." }, { status: 429 }) : null) });
  draft(h); for (let i = 0; i < 4; i++) attach(h); h.button("Send").props.onClick(); await h.settle();
  h.button("Retry send").props.onClick(); await h.settle();
  const uploads = h.requests.filter(r => r.url.endsWith("/uploads"));
  assert.equal(uploads.length, 2); assert.deepEqual(uploads[0].body, uploads[1].body);
  assert.equal(sends(h).length, 0); assert.deepEqual(drafts(h), ["Private draft A"]); assert.equal(h.button("Retry send").props.disabled, false); h.unmount();
});
for (const outcome of ["network", "500", "malformed", "json-hang"]) test("Messages " + outcome + " uncertainty retries exactly one protected operation", async () => {
  let count = 0;
  const h = await ready("messages", { fetch: messagesFetch(r => {
    if (!r.url.endsWith("/send")) return null;
    if (++count > 1) return ok({ messageId: "saved-a", replayed: true });
    if (outcome === "network") throw Error("lost");
    if (outcome === "500") return Response.json({ ok: false }, { status: 500 });
    if (outcome === "json-hang") return { ok: true, status: 200, json: () => new Promise(() => {}) };
    return new Response("invalid");
  }) });
  draft(h); h.button("Send").props.onClick(); await h.settle();
  if (outcome === "json-hang") { h.expire(); await h.settle(); }
  assert.deepEqual(drafts(h), ["Private draft A"]); assert.equal(h.button("Retry send").props.disabled, false);
  h.button("Retry send").props.onClick(); h.button("Sending...").props.onClick(); await h.settle();
  assert.equal(sends(h).length, 2); assert.equal(sends(h)[0].body.operationId, sends(h)[1].body.operationId);
  assert.equal(sends(h)[0].body.message, sends(h)[1].body.message); assert.deepEqual(drafts(h), [""]); h.unmount();
});
test("Messages upload hang is bounded; protected retry keeps upload path, file and send ID", async () => {
  const d = deferred(), uploads = []; let calls = 0;
  const h = await ready("messages", { fetch: messagesFetch(r => r.url.endsWith("/uploads") ? prepared(r) : r.url.endsWith("/send") ? ok({ messageId: "saved-a" }) : null),
    upload: (...args) => { uploads.push(args); return ++calls === 1 ? d.promise : Promise.resolve({ error: null }); } });
  draft(h); attach(h); h.button("Send").props.onClick(); await h.settle(); h.expire(); await h.settle();
  assert.equal(h.button("Retry send").props.disabled, false); assert.match(h.text(), /private-photo.png/); assert.equal(sends(h).length, 0);
  h.button("Retry send").props.onClick(); await h.settle();
  assert.equal(uploads.length, 2); assert.equal(uploads[0][0], uploads[1][0]); assert.equal(uploads[0][2], uploads[1][2]);
  const preparation = h.requests.filter(r => r.url.endsWith("/uploads")); assert.equal(preparation.length, 1);
  assert.equal(sends(h)[0].body.operationId, preparation[0].body.operationId);
  d.resolve({ error: null }); await h.settle(); assert.equal(sends(h).length, 1); h.unmount();
});
for (const stage of ["GET", "send", "upload"]) test("Messages " + stage + " ignores late resolution after unmount", async () => {
  const d = deferred();
  const h = fixture("messages", { fetch: messagesFetch(r => stage === "GET" && r.method === "GET" ? d.promise : r.url.endsWith("/send") ? d.promise : r.url.endsWith("/uploads") ? prepared(r) : null), upload: () => d.promise });
  await h.settle(); if (stage !== "GET") { draft(h); if (stage === "upload") attach(h); h.button("Send").props.onClick(); await h.settle(); }
  h.unmount(); d.resolve(stage === "GET" ? ok({ conversation: thread }) : stage === "send" ? ok({ messageId: "late" }) : { error: null });
  await tick(); await tick(); assert.equal(h.afterUnmount(), 0); assert.equal(h.timers.size, 0);
});
test("Messages account switch while upload hangs never sends old files or draft as the new actor", async () => {
  const d = deferred();
  const h = await ready("messages", { fetch: messagesFetch(r => r.url.endsWith("/uploads") ? prepared(r) : null), upload: () => d.promise });
  draft(h); attach(h); h.button("Send").props.onClick(); await h.settle();
  h.auth(session("actor-b")); await h.settle(); d.resolve({ error: null }); await h.settle();
  assert.equal(sends(h).length, 0); assert.deepEqual(drafts(h), [""]); assert.doesNotMatch(h.text(), /private-photo/); h.unmount();
});
for (const result of ["lost", "500", "malformed", "wrong-id", "json-hang"]) test("Transfer " + result + " locks acceptance until authoritative GET", async () => {
  let reads = 0, failCheck = false;
  const h = await ready("transfer", { fetch: r => {
    if (r.method === "GET") { reads++; return failCheck ? Response.json({ ok: false }, { status: 503 }) : ok({ transfer: { ...transfer, status: reads > 2 ? "accepted" : "sent" } }); }
    if (result === "lost") throw Error("lost");
    if (result === "500") return Response.json({ ok: false }, { status: 500 });
    if (result === "malformed") return new Response("invalid");
    if (result === "json-hang") return { ok: true, status: 200, json: () => new Promise(() => {}) };
    return ok({ transfer: { ...transfer, id: "other", status: "accepted" } });
  } });
  h.button("Accept Ownership").props.onClick(); h.button("Accepting...").props.onClick(); await h.settle();
  if (result === "json-hang") { h.expire(); await h.settle(); }
  assert.equal(h.button("Accept Ownership").props.disabled, true); h.button("Accept Ownership").props.onClick(); await h.settle();
  assert.equal(h.requests.filter(r => r.method === "PATCH").length, 1);
  failCheck = true; h.button("Reload transfer status").props.onClick(); await h.settle();
  failCheck = false; h.button("Try again").props.onClick(); await h.settle();
  assert.match(h.text(), /Ownership accepted/); assert.equal(h.requests.filter(r => r.method === "PATCH").length, 1); h.unmount();
});
test("Transfer hung token lookup ends accepting and never PATCHes on late token", async () => {
  const d = deferred(), h = await ready("transfer", { getToken: () => d.promise, fetch: () => ok({ transfer }) });
  h.button("Accept Ownership").props.onClick(); await tick(); h.expire(); await h.settle();
  assert.equal(h.button("Accept Ownership").props.disabled, true); d.resolve("late"); await h.settle();
  assert.equal(h.requests.filter(r => r.method === "PATCH").length, 0); h.unmount();
});
test("Transfer unmount aborts acceptance and ignores late completion", async () => {
  const d = deferred(), h = await ready("transfer", { fetch: r => r.method === "PATCH" ? d.promise : ok({ transfer }) });
  h.button("Accept Ownership").props.onClick(); await h.settle(); h.unmount();
  d.resolve(ok({ transfer: { ...transfer, status: "accepted" } })); await tick(); await tick();
  assert.equal(h.afterUnmount(), 0); assert.equal(h.requests.find(r => r.method === "PATCH").signal.aborted, true); assert.equal(h.timers.size, 0);
});
test("Evidence renewal reads only evidence, replaces links, and preserves review draft/visibility", async () => {
  let evidenceReads = 0;
  const submission = { id: "review-a", status: "submitted", title: "Fixture", requestedVisibility: "private", provider: {} };
  const h = await ready("service", { fetch: r => r.url.startsWith("/api/service-evidence") ? ok({ evidence: [{ id: "file-a", fileName: "receipt.pdf", type: "invoice", fileSizeBytes: 123, previewUrl: "https://fixture.invalid/signed-" + ++evidenceReads }] }) : r.method === "PATCH" ? ok({}) : ok({ submission }) });
  draft(h, "Keep this owner note"); h.elements().find(n => n.type === "select").props.onChange({ target: { value: "public" } });
  const before = h.requests.length; h.button("Refresh evidence links").props.onClick(); await h.settle();
  assert.equal(h.requests.length, before + 1); assert.match(h.requests.at(-1).url, /^\/api\/service-evidence/); assert.equal(h.requests.at(-1).method, "GET");
  assert.deepEqual(drafts(h), ["Keep this owner note"]); assert.equal(h.elements().find(n => n.type === "select").props.value, "public");
  assert.ok(h.elements().find(n => n.type === "a" && n.props.href === "https://fixture.invalid/signed-2")); assert.equal(h.decisions().length, 0); h.unmount();
});
