import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire("C:/Users/mrgar/Documents/Codex/2026-09-10/loo/work/release-home-content-frozen-20261005/package.json"), ts = require('typescript');
const root = path.resolve(import.meta.dirname, '..');
const acceptanceModule={exports:{}};new Function('module','exports',ts.transpileModule(fs.readFileSync(path.join(root,'lib/email-acceptance.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)(acceptanceModule,acceptanceModule.exports);const acceptance=acceptanceModule.exports;
const source = fs.readFileSync(path.join(root, 'lib/service-email-outbox.ts'), 'utf8');
const exports = {};
new Function('require', 'exports', ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText)(name=>name==='./email-acceptance'?acceptance:require(name), exports);
const { createServiceEmailOutboxWorker: worker, createServiceEmailOutboxStore: adapter } = exports;
const id = '11111111-1111-4111-8111-111111111111', lease = '22222222-2222-4222-8222-222222222222', submissionId = '33333333-3333-4333-8333-333333333333';
const delivery = { to: 'synthetic@example.invalid', profileTitle: 'Synthetic Profile', providerName: 'Synthetic provider', submissionId };
function fixture(patch = {}) {
  const h = { calls: [], receipts: [], available: 1, ...patch };
  const store = {
    async claim(token) { h.calls.push('claim'); return h.claim ? h.claim(token) : h.available-- > 0 ? { id, leaseToken: token } : null; },
    async begin(intent) { h.calls.push('begin'); return h.begin ? h.begin(intent) : delivery; },
    async settle(intent, receipt) { h.calls.push('settle'); if (h.settle) return h.settle(intent, receipt); h.receipts.push({ intent, receipt }); }
  };
  h.worker = worker({ store, origin: 'https://www.qrguitar.com', uuid: () => lease, databaseTimeoutMs: 15, sendTimeoutMs: 15,
    send: async (input, signal) => { h.calls.push('send'); h.input = input; h.signal = signal; return h.send ? h.send(input, signal) : { outcome: 'accepted', providerMessageId: 'synthetic-message' }; }, ...h.deps });
  return h;
}
let count = 0;
async function test(name, run) { await run(); count++; console.log('PASS ' + name); }
await test('provider acceptance is durably recorded but never named delivered', async () => {
  const h = fixture(), result = await h.worker.run(); assert.equal(result.accepted, 1); assert.equal('delivered' in result, false); assert.equal(h.receipts[0].receipt.state, 'accepted'); assert.equal(h.input.idempotencyKey, id); assert.equal(h.input.reviewUrl, 'https://www.qrguitar.com/service-review/' + submissionId); assert.equal(h.input.reviewUrl.includes('token'), false);
});
await test('suppressed eligibility never contacts provider', async () => { const h = fixture({ begin: async () => null }); assert.equal((await h.worker.run()).suppressed, 1); assert.equal(h.calls.includes('send'), false); assert.equal(h.receipts.length, 0); });
for (const outcome of [{ outcome: 'unknown' }, { outcome: 'accepted' }, { outcome: 'accepted', providerMessageId: 'bad\nvalue' }, undefined]) await test('ambiguous provider outcome is not automatically retryable', async () => {
  const h = fixture({ send: async () => outcome }); assert.equal((await h.worker.run()).unknown, 1); assert.equal(h.receipts[0].receipt.state, 'unknown');
});
for (const send of [async () => { throw Error('network lost'); }, () => new Promise(() => {})]) await test('lost or timed-out provider response becomes unknown', async () => {
  const h = fixture({ send }); assert.equal((await h.worker.run()).unknown, 1); assert.equal(h.calls.filter(x => x === 'send').length, 1);
});
for (const delay of [-2, 120, 999999, NaN]) await test('definite retryable rejection clamps delay ' + delay, async () => {
  const h = fixture({ send: async () => ({ outcome: 'rejected', retryable: true, retryAfterSeconds: delay }) }); assert.equal((await h.worker.run()).retry, 1); assert.equal(h.receipts[0].receipt.retryAfterSeconds, Number.isFinite(delay) ? Math.min(21600, Math.max(60, Math.ceil(delay))) : 60);
});
await test('permanent provider rejection is failed, not retry', async () => { const h = fixture({ send: async () => ({ outcome: 'rejected', retryable: false }) }); assert.equal((await h.worker.run()).failed, 1); });
await test('uncertain pre-send claim never starts provider request', async () => { const h = fixture({ claim: () => new Promise(() => {}) }); await assert.rejects(h.worker.run(), /timed out/); assert.equal(h.calls.includes('send'), false); });
await test('uncertain dispatch lease never starts provider request', async () => { const h = fixture({ begin: () => new Promise(() => {}) }); await assert.rejects(h.worker.run(), /timed out/); assert.equal(h.calls.includes('send'), false); });
await test('provider acceptance followed by lost receipt fails run without resending', async () => { const h = fixture({ settle: async () => { throw Error('DB down'); } }); await assert.rejects(h.worker.run(), /DB down/); assert.equal(h.calls.filter(x => x === 'send').length, 1); });
await test('late provider acceptance after timeout cannot overwrite unknown', async () => {
  let resolve; const h = fixture({ send: () => new Promise(r => resolve = r) }); await h.worker.run(); resolve({ outcome: 'accepted', providerMessageId: 'late' }); await new Promise(r => setImmediate(r)); assert.equal(h.receipts.length, 1); assert.equal(h.receipts[0].receipt.state, 'unknown'); assert.equal(h.signal.aborted, true);
});
await test('invalid claim does not cause send', async () => { const h = fixture({ claim: async () => ({ id, leaseToken: id }) }); await assert.rejects(h.worker.run(), /Invalid/); assert.equal(h.calls.includes('send'), false); });
await test('invalid dispatch context fails without sending', async () => { const h = fixture({ begin: async () => ({ ...delivery, submissionId: '../../admin' }) }); assert.equal((await h.worker.run()).failed, 1); assert.equal(h.calls.includes('send'), false); });
await test('one run has a bounded three-intent batch', async () => { const h = fixture({ available: 100 }); assert.equal((await h.worker.run()).claimed, 3); });
await test('elapsed budget prevents starting another intent', async () => { let now = 0; const h = fixture({ available: 100, deps: { now: () => now }, send: async () => { now = 16000; return { outcome: 'accepted', providerMessageId: 'ok' }; } }); assert.equal((await h.worker.run()).claimed, 1); });
await test('summary contains no delivery address, title, ids or provider receipt', async () => { const h = fixture(); const result = JSON.stringify(await h.worker.run()); for (const value of [delivery.to, delivery.profileTitle, id, submissionId, 'synthetic-message']) assert.equal(result.includes(value), false); });
for (const origin of ['https://evil.invalid', 'https://www.qrguitar.com/path', 'https://www.qrguitar.com/?next=x', 'https://user@www.qrguitar.com']) await test('reject untrusted review origin ' + origin, () => { assert.throws(() => worker({ origin, store: {}, send() {} })); });
await test('explicit isolated mode keeps synthetic CTA on literal loopback', async () => {
  const h=fixture({deps:{mode:'isolated',origin:'http://127.0.0.1:55440'}}); await h.worker.run(); assert.equal(h.input.reviewUrl,'http://127.0.0.1:55440/service-review/'+submissionId);
  assert.throws(()=>worker({origin:'http://127.0.0.1:55440',store:{},send(){}}));
  for(const origin of ['https://www.qrguitar.com','https://evil.invalid:55440','http://127.0.0.1.evil.invalid:55440','http://localhost:55440','http://127.0.0.1:80']) assert.throws(()=>worker({mode:'isolated',origin,store:{},send(){}}));
});
await test('RPC adapter sends only narrow intent and lease fields', async () => {
  const calls = [], store = adapter({ async rpc(name, args) { calls.push({ name, args }); return { data: name === 'claim_service_email_intent' ? { id, leaseToken: lease } : name === 'begin_service_email_dispatch' ? delivery : true, error: null }; } });
  const intent = await store.claim(lease); await store.begin(intent); await store.settle(intent, { state: 'accepted', providerMessageId: 'receipt' }); assert.equal(calls.length, 3); assert.equal(JSON.stringify(calls).includes(delivery.to), false);
});
await test('RPC errors are sanitized and unconfirmed settle rejects', async () => {
  const broken = adapter({ rpc: async () => ({ data: null, error: Error('secret provider credential') }) }); await assert.rejects(broken.claim(lease), e => !e.message.includes('secret'));
  const missing = adapter({ rpc: async () => ({ data: null, error: null }) }); await assert.rejects(missing.settle({ id, leaseToken: lease }, { state: 'unknown' }), /could not be confirmed/);
});
await test('SQL proposal remains inert, server-only, atomic and no-backfill by construction', () => {
  const sql = fs.readFileSync(path.resolve(root, '../../supabase/proposals/service-email-outbox.sql'), 'utf8');
  assert.match(sql, /values\(true,false\)/); assert.match(sql, /after insert or update on public.service_submissions/); assert.match(sql, /unique\(submission_id,event_sequence\)/); assert.match(sql, /for update skip locked/); assert.match(sql, /when i.state='dispatching' then 'unknown'/); assert.match(sql, /g.owner_id is distinct from s.owner_user_id/); assert.match(sql, /s.expires_at<=clock_timestamp\(\)/); assert.match(sql, /enable row level security/); assert.match(sql, /from public,anon,authenticated,service_role/); assert.doesNotMatch(sql, /insert into public.service_email_intents[^;]+select[^;]+from public.service_submissions/is); assert.match(sql,/active:=false/);
});
console.log(JSON.stringify({ passed: count, databaseExecution: 'This suite checks SQL text only; run test-service-email-outbox-db.mjs for independent PGlite execution. No shared backend used.' }));

const relay={schema:"qrguitar-zoho-smtp-acceptance/v1",provider:"zoho-smtp",responseCode:250};
await test("service SMTP receipt remains relay evidence",async()=>{const h=fixture({send:async()=>({outcome:"accepted",relayAcceptance:relay})});assert.equal((await h.worker.run()).accepted,1);assert.equal(h.receipts[0].receipt.providerMessageId,undefined);assert.deepEqual(h.receipts[0].receipt.relayAcceptance,relay);assert.equal(h.calls.filter(x=>x==="send").length,1);});
await test("service contradictory evidence stays unknown",async()=>{const h=fixture({send:async()=>({outcome:"accepted",providerMessageId:"id",relayAcceptance:relay})});assert.equal((await h.worker.run()).unknown,1);assert.equal(h.receipts[0].receipt.state,"unknown");assert.equal(h.calls.filter(x=>x==="send").length,1);});
