// Offline end-to-end direct checkout: actual service/HTTP and repository PostgreSQL schema.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { installRepositorySchema } from './security/postgres-fixture.mjs';

const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.resolve(here, '../../..');
const require = createRequire(path.join(repo, 'package.json')), ts = require('typescript'), { PGlite } = require('@electric-sql/pglite-pg17');
const modules = new Map();
function load(name) {
  if (modules.has(name)) return modules.get(name);
  const filename = path.join(repo, 'apps/web/lib', name + '.ts');
  const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} }; modules.set(name, module.exports);
  new Function('require', 'module', 'exports', js)(id => id === 'server-only' ? {} : id.startsWith('./') ? load(id.slice(2)) : require(id), module, module.exports);
  modules.set(name, module.exports); return module.exports;
}
const { createDirectPaymentsService } = load('direct-payments-service');
const { createDirectPaymentsHandlers } = load('direct-payments-http');
const { readDirectPaymentsConfig } = load('direct-payments-config');
const { profileBillingEnvironment } = load('billing-environment');
const { directPaymentUrl } = load('direct-payments');
const db = new PGlite(), savedFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('Network forbidden in this isolated payment fixture'); };
let passed = 0;
async function check(name, fn) { await fn(); passed++; console.log('PASS ' + name); }
const OWNER = randomUUID(), OTHER = randomUUID(), ADMIN = randomUUID(), EXEMPT = randomUUID();
const actors = new Map([[OWNER, { id: OWNER, accountStatus: 'active', role: 'owner' }], [OTHER, { id: OTHER, accountStatus: 'active', role: 'owner' }],
  [ADMIN, { id: ADMIN, accountStatus: 'active', role: 'admin' }], [EXEMPT, { id: EXEMPT, accountStatus: 'active', role: 'owner' }]]);
const configured = { QRGUITAR_DIRECT_PAYMENTS_ENABLED: 'true', QRGUITAR_DIRECT_MERCHANT_NAME: 'QRguitar',
  QRGUITAR_DIRECT_PAYMENT_METHODS: JSON.stringify([{ key: 'venmo', accountKey: 'fixture-business', address: 'private-fixture-identity', paymentUrl: 'https://venmo.com/fixture-merchant' }]) };
const config = readDirectPaymentsConfig(configured);
let loseReply = '';
const database = { async rpc(name, args) {
  assert.match(name, /^[a-z_]+$/); const entries = Object.entries(args); entries.forEach(([key]) => assert.match(key, /^p_[a-z_]+$/));
  await db.exec('begin; set local role service_role');
  try {
    const result = (await db.query('select public.' + name + '(' + entries.map(([key], i) => key + '=>$' + (i + 1)).join(',') + ') value', entries.map(([, value]) => value))).rows[0].value;
    await db.exec('commit');
    if (loseReply === name) { loseReply = ''; return { data: null, error: { code: 'offline_reply_lost' } }; }
    return { data: result, error: null };
  } catch (error) { await db.exec('rollback'); return { data: null, error: { code: error.code } }; }
} };
const make = (override = config) => createDirectPaymentsService({ config: override, environment: 'test', database, authenticate: async ctx => actors.get(typeof ctx === 'string' ? ctx : ctx.headers.get('authorization')?.replace('Bearer ', '')) || null });
const service = make(), handlers = createDirectPaymentsHandlers({ service: () => service, bodyTimeoutMs: 50 });
const rejects = (promise, code) => assert.rejects(promise, error => { assert.equal(error.code, code); return true; });
const request = (route, body, who = OWNER, extra = {}) => new Request('https://qrguitar-fixture.example' + route, { method: body === undefined ? 'GET' : 'POST', headers: { authorization: 'Bearer ' + who, ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

try {
  await installRepositorySchema(db, repo);
  await db.exec("update billing_instance_config set create_environment='test' where singleton");
  for (const [id, actor] of actors) {
    await db.query('insert into auth.users(id) values($1)', [id]);
    await db.query('insert into profiles(id,role,plan) values($1,$2,$3)', [id, actor.role, id === EXEMPT ? 'business' : 'single']);
  }
  await check('configuration is disabled until receiving merchant and supported links exist', () => {
    assert.equal(readDirectPaymentsConfig({}).enabled, false);
    assert.equal(readDirectPaymentsConfig({ ...configured, QRGUITAR_DIRECT_MERCHANT_NAME: '' }).enabled, false);
    assert.equal(config.enabled, true);
  });
  await check('payment destinations reject arbitrary hosts, credentials, explicit ports and paypal.me', () => {
    for (const url of ['http://venmo.com/fixture', 'https://venmo.com.evil.invalid/a', 'https://venmo.com:443/a', 'https://user@venmo.com/a', 'https://evil.invalid/a']) assert.equal(directPaymentUrl('venmo', url), null);
    assert.equal(directPaymentUrl('paypal', 'https://paypal.me/fixture'), null);
    assert.equal(directPaymentUrl('paypal', 'https://www.paypal.com/ncp/payment/EXAMPLE'), 'https://www.paypal.com/ncp/payment/EXAMPLE');
  });
  await check('private Zelle phone/email alone cannot expose a payment method', () => {
    const value = readDirectPaymentsConfig({ ...configured, QRGUITAR_DIRECT_PAYMENT_METHODS: JSON.stringify([{ key: 'zelle', accountKey: 'fixture-bank', address: 'private-fixture@example.invalid' }]) });
    assert.equal(value.enabled, false); assert.deepEqual(value.methods, []);
  });
  await check('fixed PayPal prices require three distinct pack links and normalize the internal account key', () => {
    const paypal = { key: 'paypal', accountKey: 'Fixture-PayPal', paymentUrls: {
      profile_1: 'https://www.sandbox.paypal.com/ncp/payment/FIXTURE1',
      profile_10: 'https://www.sandbox.paypal.com/ncp/payment/FIXTURE10',
      profile_25: 'https://www.sandbox.paypal.com/ncp/payment/FIXTURE25'
    } };
    const read = row => readDirectPaymentsConfig({ ...configured, QRGUITAR_DIRECT_PAYMENT_METHODS: JSON.stringify([row]) });
    assert.equal(read(paypal).enabled, true); assert.equal(read(paypal).methods[0].recipient.accountKey, 'fixture-paypal');
    assert.equal(read({ ...paypal, paymentUrls: undefined, paymentUrl: paypal.paymentUrls.profile_1 }).enabled, false);
    assert.equal(read({ ...paypal, paymentUrls: { ...paypal.paymentUrls, profile_25: paypal.paymentUrls.profile_1 } }).enabled, false);
  });
  await check('neutral test mode requires an isolated database and rejects conflicting legacy mode', () => {
    const url = 'https://isolated-fixture.supabase.co';
    assert.equal(profileBillingEnvironment({ QRGUITAR_BILLING_ENVIRONMENT: 'test' }, url), null);
    assert.equal(profileBillingEnvironment({ QRGUITAR_BILLING_ENVIRONMENT: 'test', QRGUITAR_BILLING_TEST_DATABASE_URL: url }, url), 'test');
    assert.equal(profileBillingEnvironment({ QRGUITAR_BILLING_ENVIRONMENT: 'live', STRIPE_ENVIRONMENT: 'test' }, url), null);
  });
  await check('current database balance exposes five free Profiles', async () => {
    const value = await service.status(OWNER); assert.equal(value.freeLimit, 5); assert.equal(value.freeRemaining, 5); assert.equal(value.offers.length, 3);
  });
  await check('tampered amount and client-supplied receiving identity are rejected', async () => {
    for (const field of ['amount', 'recipient', 'ownerId', 'environment']) await rejects(service.checkout(OWNER, { offerKey: 'profile_10', method: 'venmo', requestId: randomUUID(), [field]: 1 }), 'invalid_payment');
  });
  await check('expanded-access accounts cannot buy unnecessary credits', async () => {
    await rejects(service.checkout(EXEMPT, { offerKey: 'profile_1', method: 'venmo', requestId: randomUUID() }), 'profile_access_included');
  });
  const intent = { offerKey: 'profile_10', method: 'venmo', requestId: randomUUID() }; let placed;
  await check('unknown committed order response recovers the same order on retry', async () => {
    loseReply = 'billing_direct_reserve_order'; await rejects(service.checkout(OWNER, intent), 'payment_unavailable');
    placed = (await service.checkout(OWNER, intent)).order;
    assert.equal(placed.offer.amount, 5000); assert.equal(placed.status, 'awaiting_payment');
    assert.equal((await db.query('select count(*)::int n from billing_orders where owner_id=$1', [OWNER])).rows[0].n, 1);
  });
  await check('payer responses redact private receiving identity and stable internal key', () => {
    assert.equal(placed.recipient.address, null); assert.equal(placed.recipient.paymentUrl, null); assert.equal(placed.recipient.accountKey, 'venmo');
    assert.ok(!JSON.stringify(placed).includes('private-fixture-identity')); assert.ok(!JSON.stringify(placed).includes('fixture-business'));
    assert.ok(!JSON.stringify(placed).includes('fixture-merchant'));
  });
  await check('pending direct order appears separately from legacy Stripe checkout', async () => {
    const value = await service.status(OWNER); assert.equal(value.pendingOrder.orderId, placed.orderId); assert.equal(value.unresolvedOrder, null); assert.equal(value.paidAvailable, 0);
  });
  await check('cross-account order reads cannot reveal payer history', async () => {
    await rejects(service.status(OTHER, placed.orderId), 'payment_not_found');
  });
  await check('same request cannot change the purchased pack or provider', async () => {
    await rejects(service.checkout(OWNER, { ...intent, offerKey: 'profile_1' }), 'payment_conflict');
  });
  await check('disabled checkout still recovers an existing order without changing its recipient', async () => {
    const disabled = make({ ...config, enabled: false, methods: [] });
    assert.equal((await disabled.checkout(OWNER, intent)).order.orderId, placed.orderId);
    await rejects(disabled.checkout(OTHER, { ...intent, requestId: randomUUID() }), 'billing_disabled');
  });
  const claim = { orderId: placed.orderId, requestId: randomUUID(), reference: '' };
  await check('customer report is idempotent and never grants credits', async () => {
    const result = await service.claim(OWNER, claim); assert.equal(result.order.status, 'pending_review');
    assert.equal((await service.claim(OWNER, claim)).order.orderId, placed.orderId);
    assert.equal((await service.status(OWNER)).paidAvailable, 0);
  });
  const decision = { action: 'verify', orderId: placed.orderId, requestId: randomUUID(), paymentReference: 'TEST-TXN-100', amount: 5000, currency: 'usd', reason: 'Verified completed receipt in synthetic business account.' };
  await check('only active database administrators can verify receipt', async () => {
    await rejects(service.decide(OWNER, decision), 'admin_required');
    actors.get(ADMIN).accountStatus = 'locked'; await rejects(service.decide(ADMIN, decision), 'account_unavailable'); actors.get(ADMIN).accountStatus = 'active';
  });
  await check('wrong received amount never grants credits', async () => {
    await rejects(service.decide(ADMIN, { ...decision, amount: 4999 }), 'invalid_payment');
    assert.equal((await service.status(OWNER)).paidAvailable, 0);
  });
  await check('verified receipt grants ten credits exactly once after a lost reply', async () => {
    loseReply = 'billing_direct_verify_order'; await rejects(service.decide(ADMIN, decision), 'payment_unavailable');
    const value = await service.decide(ADMIN, decision); assert.equal(value.order.status, 'fulfilled');
    assert.equal((await service.status(OWNER)).paidAvailable, 10);
    assert.equal((await db.query('select count(*)::int n from billing_credit_grants where owner_id=$1', [OWNER])).rows[0].n, 1);
  });
  await check('admin queue uses server-confirmed orders and never trusts a payer report', async () => {
    const value = await service.queue(ADMIN); assert.equal(value.orders[0].status, 'fulfilled'); assert.equal(value.hasMore, false);
    await rejects(service.queue(OWNER), 'admin_required');
  });
  await check('admin exact lookup finds a fulfilled order and rejects malformed or unauthorized lookup', async () => {
    const value = await service.queue(ADMIN, placed.orderId);
    assert.equal(value.orders.length, 1); assert.equal(value.orders[0].orderId, placed.orderId); assert.equal(value.hasMore, false);
    assert.deepEqual((await service.queue(ADMIN, randomUUID())).orders, []);
    await rejects(service.queue(OWNER, placed.orderId), 'admin_required');
    await rejects(service.queue(ADMIN, 'invalid'), 'invalid_payment');
  });
  await check('HTTP refuses cross-origin mutation before payment state changes', async () => {
    const response = await handlers.checkout(request('/api/billing/direct/checkout', intent, OWNER, { origin: 'https://untrusted.invalid' }));
    assert.equal(response.status, 403);
  });
  await check('HTTP enforces bounded body and JSON content type', async () => {
    assert.equal((await handlers.claim(request('/api/billing/direct/claim', { ...claim, reference: 'x'.repeat(5000) }))).status, 413);
    assert.equal((await handlers.claim(request('/api/billing/direct/claim', claim, OWNER, { 'content-type': 'text/plain' }))).status, 415);
  });
  await check('HTTP rejects duplicate/unknown order parameters and disables caching', async () => {
    assert.equal((await handlers.status(request('/api/billing/direct/status?orderId=x&orderId=y'))).status, 400);
    const response = await handlers.status(request('/api/billing/direct/status')); assert.equal(response.status, 200); assert.match(response.headers.get('cache-control'), /no-store/);
    assert.equal((await response.json()).paidAvailable, 10);
  });
  console.log(`${passed} direct payment service and HTTP integration checks passed.`);
} finally { await db.close(); globalThis.fetch = savedFetch; }
