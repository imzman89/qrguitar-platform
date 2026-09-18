// Real PostgreSQL scheduling proof. This script never starts a server or drops a database/role.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

export const FIXTURE_MARKER = 'isolated-postgresql-17';
const DATABASE = 'qrguitar_billing_qa', USER = 'qrguitar_billing_fixture';

/** Validate before loading pg or opening any connection; no generic DATABASE_URL fallback. */
export function validateFixtureConnection(environment) {
  assert.equal(environment.QRGUITAR_CONCURRENCY_FIXTURE, FIXTURE_MARKER, 'Explicit isolated PostgreSQL fixture marker is required');
  const value = environment.QRGUITAR_CONCURRENCY_DATABASE_URL;
  assert.ok(typeof value === 'string' && value.length > 0, 'QRGUITAR_CONCURRENCY_DATABASE_URL is required');
  let url;
  try { url = new URL(value); } catch { throw new Error('Invalid concurrency fixture URL'); }
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol), 'Fixture URL must use PostgreSQL');
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname), 'Only localhost or 127.0.0.1 fixtures are allowed');
  assert.equal(url.pathname, '/' + DATABASE, 'Only the dedicated qrguitar_billing_qa database is allowed');
  assert.equal(url.search, '', 'Connection query overrides are forbidden');
  assert.equal(url.hash, '', 'Connection URL fragments are forbidden');
  assert.equal(decodeURIComponent(url.username), USER, 'Only the dedicated fixture bootstrap role is allowed');
  const password = decodeURIComponent(url.password);
  assert.ok(password.length >= 12, 'An explicit fixture password of at least 12 characters is required');
  const port = url.port ? Number(url.port) : 5432;
  assert.ok(Number.isInteger(port) && port > 0 && port <= 65535, 'Invalid fixture port');
  // Resolve allowed localhost to a fixed loopback address rather than accepting DNS/options overrides.
  return { host: '127.0.0.1', port, user: USER, password, database: DATABASE, ssl: false,
    connectionTimeoutMillis: 5000, query_timeout: 25000 };
}

export async function main(args = process.argv.slice(2), environment = process.env) {
  const config = validateFixtureConnection(environment);
  const option = (name, fallback) => { const index = args.indexOf(name); if (index < 0) return fallback; assert.ok(args[index + 1] && !args[index + 1].startsWith('--'), name + ' requires a value'); return args[index + 1]; };
  assert.ok(args.every((value, index) => index % 2 ? !value.startsWith('--') : ['--repo', '--report-dir'].includes(value)), 'Unknown or malformed argument');
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repo = fs.realpathSync(option('--repo', path.resolve(here, '../../..')));
  const { Client } = createRequire(path.join(repo, 'apps/web/package.json'))('pg');
  const runId = 'billing-' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomBytes(4).toString('hex');
  const reportRoot = path.resolve(option('--report-dir', path.join(repo, 'test-results/billing-concurrency')));
  fs.mkdirSync(reportRoot, { recursive: true });
  const runDir = path.join(reportRoot, runId); fs.mkdirSync(runDir);
  const sourceFiles = () => [
    'apps/web/scripts/security/postgres-fixture.mjs',
    ...['schema.sql', 'security-rls.sql', 'admin-panel-foundation.sql', 'record-archive-controls.sql', 'service-history-timeline.sql', 'lost-stolen-safety-status.sql'].map(file => 'supabase/' + file),
    ...fs.readdirSync(path.join(repo, 'supabase/migrations')).filter(file => file.endsWith('.sql')).sort().map(file => 'supabase/migrations/' + file)
  ];
  const fingerprints = () => Object.fromEntries(sourceFiles().map(file => [file, createHash('sha256').update(fs.readFileSync(path.join(repo, file))).digest('hex')]));
  const report = { runId, startedAt: new Date().toISOString(), database: DATABASE, host: config.host, port: config.port,
    fixtureMarker: FIXTURE_MARKER, sourceHashes: fingerprints(), runnerHash: createHash('sha256').update(fs.readFileSync(fileURLToPath(import.meta.url))).digest('hex'),
    tests: [], barriers: [], clientErrors: [], cleanupErrors: [], closedConnections: 0 };
  const reportFile = path.join(runDir, 'report.json');
  const message = error => String(error?.message || error).replaceAll(config.password, '[redacted]').replaceAll(environment.QRGUITAR_CONCURRENCY_DATABASE_URL, '[fixture URL]');
  function log(value) { console.log(value); fs.appendFileSync(path.join(runDir, 'test-output.log'), value + '\n'); }
  const clients = new Set(); let observer;
  async function connect(label) {
    const client = new Client({ ...config, application_name: (runId + ':' + label).slice(-63) });
    client.on('error', error => report.clientErrors.push({ label, code: error.code, message: message(error) }));
    clients.add(client);
    await client.connect();
    await client.query("set statement_timeout='20s'; set lock_timeout='15s'; set idle_in_transaction_session_timeout='30s'");
    return client;
  }
  async function close(client) {
    if (!clients.has(client)) return;
    await client.query('rollback').catch(() => {});
    try { await client.end(); report.closedConnections++; }
    finally { clients.delete(client); }
  }
  const result = async (client, sql, values) => (await client.query(sql, values)).rows[0].result;
  const begin = client => client.query("begin; set local role service_role; set local request.jwt.claim.role='service_role'");
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  async function race(name, aWork, bWork, commit = true) {
    let a, b, pending, settled = false;
    try {
      a = await connect(name + ':A'); b = await connect(name + ':B');
      const aPid = (await a.query('select pg_backend_pid() pid')).rows[0].pid;
      const bPid = (await b.query('select pg_backend_pid() pid')).rows[0].pid;
      assert.notEqual(aPid, bPid); assert.notEqual(aPid, report.observerPid); assert.notEqual(bPid, report.observerPid);
      await begin(a); const first = await aWork(a); await begin(b);
      pending = bWork(b).then(value => ({ ok: true, value }), error => ({ ok: false, code: error.code, message: message(error) })).then(value => { settled = true; return value; });
      let barrier; const deadline = Date.now() + 6000;
      while (Date.now() < deadline) {
        const row = (await observer.query('select pg_blocking_pids(pid) blockers, wait_event_type, wait_event from pg_stat_activity where pid=$1', [bPid])).rows[0];
        // Activity wait fields and lock-manager blockers can reflect different instants.
        // Retain A's transaction until one sample proves both, with B still pending.
        if (!settled && row?.blockers?.includes(aPid) && row.wait_event_type === 'Lock') { barrier = { name, aPid, bPid, observerPid: report.observerPid, ...row }; break; }
        if (settled) throw new Error('Second writer did not wait: ' + JSON.stringify(await pending));
        await sleep(10);
      }
      assert.ok(barrier, 'Missing actual PostgreSQL lock barrier'); assert.equal(barrier.wait_event_type, 'Lock');
      report.barriers.push(barrier); log('BARRIER ' + JSON.stringify(barrier));
      await a.query(commit ? 'commit' : 'rollback'); const second = await pending;
      await b.query(second.ok ? 'commit' : 'rollback'); return { first, second };
    } finally {
      if (a) await a.query('rollback').catch(() => {});
      if (pending) await pending;
      if (a) await close(a);
      if (b) await close(b);
    }
  }
  async function test(name, fn) {
    try { await fn(); report.tests.push({ name, ok: true }); log('PASS ' + name); }
    catch (error) { report.tests.push({ name, ok: false, code: error.code, message: message(error) }); log('FAIL ' + name + ': ' + message(error)); }
  }
  async function user() {
    const id = randomUUID(), email = 'synthetic-' + id + '@example.invalid';
    await observer.query('insert into auth.users(id,email) values($1,$2)', [id, email]);
    await observer.query("insert into profiles(id,display_name,role,plan) values($1,'Synthetic owner','owner','single')", [id]);
    return { id, email };
  }
  const offer = { key: 'profile_1', version: 1, currency: 'usd', amount: 1200, credits: 1, priceId: 'price_syntheticConcurrency1' };
  const reserve = (client, owner, key) => result(client, 'select public.billing_reserve_order($1,$2,$3,$4::jsonb) result', [owner.id, 'live', key, offer]);
  const status = owner => result(observer, 'select public.billing_account_status($1,$2) result', [owner.id, 'live']);
  async function linked(owner) {
    const order = await reserve(observer, owner, randomUUID());
    const customerId = 'cus_' + owner.id.replaceAll('-', ''), sessionId = 'cs_' + order.orderId.replaceAll('-', '');
    await result(observer, 'select public.billing_link_customer($1,$2,$3) result', [owner.id, 'live', customerId]);
    return result(observer, 'select public.billing_link_checkout($1,$2,$3,$4,$5) result', [owner.id, 'live', order.orderId, sessionId, customerId]);
  }
  const payment = (order, eventId = 'evt_' + randomUUID().replaceAll('-', '')) => ({ eventId, sessionId: order.sessionId, customerId: order.customerId,
    paymentId: 'pi_' + order.orderId.replaceAll('-', ''), priceId: order.offer.priceId, amount: order.offer.amount, currency: 'usd', credits: order.offer.credits, quantity: 1, environment: 'live', status: 'complete', paymentStatus: 'paid' });
  const fulfill = (client, owner, order, receipt) => result(client, 'select public.billing_fulfill_order($1,$2,$3,$4::jsonb) result', [owner.id, 'live', order.orderId, receipt]);
  async function upload(owner) {
    const upload = randomUUID(), key = randomUUID(), photo = owner.id + '/profile-uploads/' + upload + '/image-' + randomUUID() + '.jpg';
    await observer.query("insert into storage.objects(bucket_id,name,metadata) values('instrument-media',$1,$2)", [photo, { size: 100, mimetype: 'image/jpeg' }]);
    await result(observer, 'select register_staged_instrument_upload($1,$2,$3,$4) result', [owner.id, upload, 'instrument-media', photo]);
    return { owner, key, upload, photo, payload: { guitar: { name: 'Concurrency Guitar', brand: 'Synthetic', model: 'Fixture', year: null, serial_number: null, builder: null, location: null, visibility: 'private', summary: 'Synthetic fixture', hero_image_path: photo }, media: [{ storage_path: photo, alt: 'Synthetic photo', sort_order: 0 }], documents: [], specs: [], service: null, show_serial_public: false, owner_name: '' } };
  }
  const create = (client, fixture) => result(client, 'select create_instrument_profile($1,$2,$3,$4::jsonb,false,$5) result', [fixture.owner.id, fixture.key, fixture.upload, fixture.payload, 'Synthetic owner']);
  async function owned(owner, count) {
    for (let index = 0; index < count; index++) {
      const code = 'QRG-' + randomBytes(8).toString('hex').toUpperCase();
      await observer.query("insert into guitars(owner_id,qr_code,permanent_path,name,brand,visibility) values($1,$2,$3,'Synthetic baseline','Synthetic','private')", [owner.id, code, '/i/' + code]);
    }
  }
  async function counts(owner) {
    return (await observer.query("select (select count(*)::integer from guitars where owner_id=$1) profiles, (select count(*)::integer from instrument_create_receipts where owner_id=$1) creates, (select count(*)::integer from instrument_staged_uploads where owner_id=$1 and state='consumed') uploads, (select count(*)::integer from billing_credit_grants where owner_id=$1) grants, (select count(*)::integer from billing_credit_consumptions where owner_id=$1) debits, (select count(*)::integer from billing_orders where owner_id=$1 and status in('reserved','open')) unresolved", [owner.id])).rows[0];
  }
  async function tests() {
    await result(observer, 'select billing_register_offer($1,$2::jsonb) result', ['live', offer]);
    for (const commit of [true, false]) await test('last prepaid credit: A ' + (commit ? 'commit' : 'rollback'), async () => {
      const owner = await user(); await owned(owner, 5); const order = await linked(owner); await fulfill(observer, owner, order, payment(order));
      const a = await upload(owner), b = await upload(owner);
      const raceResult = await race('last-credit-' + commit, client => create(client, a), client => create(client, b), commit);
      assert.equal(raceResult.first.ok, true); assert.equal(raceResult.second.ok, !commit);
      if (commit) assert.equal(raceResult.second.code, 'QG001'); else assert.equal(raceResult.second.value.ok, true);
      const actual = await counts(owner); assert.deepEqual(actual, { profiles: 6, creates: 1, uploads: 1, grants: 1, debits: 1, unresolved: 0 });
      const balance = await status(owner); assert.equal(balance.paidGranted, 1); assert.equal(balance.paidConsumed, 1); assert.equal(balance.paidAvailable, 0);
      const rows = (await observer.query('select upload_id,state from instrument_staged_uploads where owner_id=$1', [owner.id])).rows;
      assert.equal(rows.find(row => row.upload_id === (commit ? a.upload : b.upload)).state, 'consumed');
      assert.equal(rows.find(row => row.upload_id === (commit ? b.upload : a.upload)).state, 'staged');
      const winner = commit ? a : b, won = commit ? raceResult.first : raceResult.second.value;
      assert.equal((await create(observer, winner)).qrCode, won.qrCode); assert.deepEqual(await counts(owner), actual);
      log('OUTCOME ' + JSON.stringify({ case: 'last-credit-' + commit, loserSqlstate: raceResult.second.code, counts: actual, paidAvailable: balance.paidAvailable }));
    });
    for (const sameEvent of [true, false]) for (const commit of [true, false]) await test((sameEvent ? 'same' : 'different') + ' event duplicate fulfillment: A ' + (commit ? 'commit' : 'rollback'), async () => {
      const owner = await user(), order = await linked(owner), first = payment(order), second = sameEvent ? first : { ...first, eventId: first.eventId + '_second' };
      const raceResult = await race('fulfill-' + sameEvent + '-' + commit, client => fulfill(client, owner, order, first), client => fulfill(client, owner, order, second), commit);
      assert.equal(raceResult.first.granted, true); assert.equal(raceResult.second.ok, true); assert.equal(raceResult.second.value.granted, !commit); assert.equal(raceResult.second.value.alreadyGranted, commit);
      assert.deepEqual(await counts(owner), { profiles: 0, creates: 0, uploads: 0, grants: 1, debits: 0, unresolved: 0 });
      const receipts = (await observer.query("select count(*)::integer n from billing_receipts where order_id=$1 and kind='payment'", [order.orderId])).rows[0].n;
      assert.equal(receipts, commit && !sameEvent ? 2 : 1); assert.equal((await status(owner)).paidAvailable, 1);
      assert.equal((await fulfill(observer, owner, order, second)).alreadyGranted, true);
      log('OUTCOME ' + JSON.stringify({ case: 'fulfill-' + sameEvent + '-' + commit, grantCount: 1, receiptCount: receipts, paidAvailable: 1 }));
    });
    for (const sameKey of [true, false]) for (const commit of [true, false]) await test((sameKey ? 'same' : 'different') + ' request checkout reserve: A ' + (commit ? 'commit' : 'rollback'), async () => {
      const owner = await user(), aKey = randomUUID(), bKey = sameKey ? aKey : randomUUID();
      const raceResult = await race('reserve-' + sameKey + '-' + commit, client => reserve(client, owner, aKey), client => reserve(client, owner, bKey), commit);
      assert.equal(raceResult.second.ok, sameKey || !commit);
      if (commit && !sameKey) assert.equal(raceResult.second.code, 'PT409');
      if (commit && sameKey) assert.deepEqual(raceResult.second.value, raceResult.first);
      const rows = (await observer.query('select id,request_key,status from billing_orders where owner_id=$1', [owner.id])).rows;
      assert.equal(rows.length, 1); assert.equal(rows[0].status, 'reserved'); assert.equal(rows[0].request_key, commit ? aKey : bKey);
      assert.equal((await counts(owner)).unresolved, 1); assert.equal((await status(owner)).paidGranted, 0);
      assert.equal((await reserve(observer, owner, commit ? aKey : bKey)).orderId, rows[0].id);
      log('OUTCOME ' + JSON.stringify({ case: 'reserve-' + sameKey + '-' + commit, unresolvedOrders: 1, loserSqlstate: raceResult.second.code }));
    });
    // Direct business payment races use the same real advisory/row/unique-index barriers.
    const operator = await user(); await observer.query("update profiles set role='admin' where id=$1", [operator.id]);
    const recipient = { accountKey: 'synthetic-business', displayName: 'Synthetic QRguitar', paymentUrl: 'https://venmo.com/synthetic-fixture', address: 'synthetic-fixture' };
    const directOrder = (owner, account = recipient) => result(observer, 'select billing_direct_reserve_order($1,$2,$3,$4,$5,$6::jsonb) result', [owner.id, 'live', randomUUID(), 'profile_1', 'venmo', account]);
    const directVerify = (client, order, id, reference) => result(client, 'select billing_direct_verify_order($1,$2,$3,$4,$5,$6,$7,$8) result', ['live', order.orderId, operator.id, id, reference, 1200, 'usd', 'Verified completed payment in synthetic receiving account.']);
    const directClose = (client, order, id) => result(client, 'select billing_direct_close_order($1,$2,$3,$4,$5) result', ['live', order.orderId, operator.id, id, 'Reviewed synthetic receiving account; no payment arrived.']);
    for (const sameId of [true, false]) for (const commit of [true, false]) await test('direct duplicate verification '+sameId+': A '+(commit?'commit':'rollback'), async () => {
      const owner=await user(), order=await directOrder(owner), aId=randomUUID(), bId=sameId?aId:randomUUID(), reference='DIRECT-'+randomUUID();
      const outcome=await race('direct-verify-'+sameId+'-'+commit, client=>directVerify(client,order,aId,reference), client=>directVerify(client,order,bId,reference),commit);
      assert.equal(outcome.first.granted,true);assert.equal(outcome.second.ok,true);assert.equal(outcome.second.value.granted,!commit);
      assert.equal((await counts(owner)).grants,1);assert.equal((await status(owner)).paidGranted,1);
      assert.equal((await directVerify(observer,order,bId,reference)).alreadyGranted,true);
    });
    for (const commit of [true, false]) await test('direct shared receipt across owners/config rotation: A '+(commit?'commit':'rollback'), async () => {
      const ownerA=await user(),ownerB=await user(),orderA=await directOrder(ownerA),orderB=await directOrder(ownerB,{...recipient,accountKey:'rotated-synthetic-key'}),reference='RECEIPT-'+randomUUID();
      const outcome=await race('direct-unique-receipt-'+commit,client=>directVerify(client,orderA,randomUUID(),reference),client=>directVerify(client,orderB,randomUUID(),reference.replaceAll('-','').toLowerCase()),commit);
      assert.equal(outcome.first.granted,true);assert.equal(outcome.second.ok,!commit);if(commit)assert.equal(outcome.second.code,'PT409');
      const a=await status(ownerA),b=await status(ownerB);assert.equal(a.paidGranted,commit?1:0);assert.equal(b.paidGranted,commit?0:1);
      assert.equal(a.paidGranted+b.paidGranted,1);
    });
    for (const commit of [true, false]) await test('direct close then verify: A '+(commit?'commit':'rollback'), async () => {
      const owner=await user(),order=await directOrder(owner),reference='LATE-'+randomUUID();
      const outcome=await race('direct-close-verify-'+commit,client=>directClose(client,order,randomUUID()),client=>directVerify(client,order,randomUUID(),reference),commit);
      assert.equal(outcome.first.status,'expired');assert.equal(outcome.second.ok,true);assert.equal(outcome.second.value.granted,true);
      const balance=await status(owner);assert.equal(balance.paidGranted,1);assert.equal(balance.hold,commit);assert.equal(balance.paidAvailable,commit?0:1);
    });
    for (const commit of [true, false]) await test('direct verify then close: A '+(commit?'commit':'rollback'), async () => {
      const owner=await user(),order=await directOrder(owner),reference='RECEIVED-'+randomUUID();
      const outcome=await race('direct-verify-close-'+commit,client=>directVerify(client,order,randomUUID(),reference),client=>directClose(client,order,randomUUID()),commit);
      assert.equal(outcome.first.granted,true);assert.equal(outcome.second.ok,!commit);if(commit)assert.equal(outcome.second.code,'PT409');
      const saved=await result(observer,'select billing_direct_get_order($1,$2,$3) result',[owner.id,'live',order.orderId]);
      assert.equal(saved.status,commit?'fulfilled':'expired');assert.equal((await status(owner)).paidGranted,commit?1:0);
    });
    const merchant='SYNTHETICMERCHANT',paypalId=()=>randomUUID().replaceAll('-','').toUpperCase();
    const ppReserve=(client,owner,key)=>result(client,'select billing_paypal_reserve_order($1,$2,$3,$4,$5) result',[owner.id,'live',key,'profile_1',merchant]);
    const ppBind=(client,owner,order,provider)=>result(client,'select billing_paypal_bind_order($1,$2,$3,$4,$5) result',[owner.id,'live',order.orderId,provider,merchant]);
    const ppOrder=async owner=>ppBind(observer,owner,await ppReserve(observer,owner,randomUUID()),paypalId());
    const ppReceipt=(order,capture=paypalId())=>({paypalOrderId:order.paypalOrderId,captureId:capture,merchantId:merchant,referenceId:order.orderId,customId:order.orderId,invoiceId:'QRG-'+order.orderId,amount:1200,currency:'USD',status:'COMPLETED'});
    const ppCapture=(client,order,receipt)=>result(client,'select billing_paypal_apply_capture($1,$2,$3::jsonb) result',['live',order.orderId,receipt]);
    const ppClose=(client,order)=>result(client,'select billing_paypal_close_order($1,$2,$3,$4,$5) result',['live',order.orderId,order.paypalOrderId,merchant,'VOIDED']);
    const ppReview=(client,order,receipt,event)=>result(client,'select billing_paypal_record_review($1,$2,$3,$4,$5::jsonb) result',['live',order.orderId,event,'refund',{...receipt,status:'REFUNDED'}]);
    for(const sameKey of [true,false])for(const commit of [true,false])await test('PayPal reserve '+sameKey+': A '+(commit?'commit':'rollback'),async()=>{
      const owner=await user(),aKey=randomUUID(),bKey=sameKey?aKey:randomUUID();
      const outcome=await race('paypal-reserve-'+sameKey+'-'+commit,c=>ppReserve(c,owner,aKey),c=>ppReserve(c,owner,bKey),commit);
      assert.equal(outcome.second.ok,sameKey||!commit);if(commit&&!sameKey)assert.equal(outcome.second.code,'PT409');
      if(commit&&sameKey)assert.deepEqual(outcome.second.value,outcome.first);
      assert.equal((await counts(owner)).unresolved,1);assert.equal((await status(owner)).paidGranted,0);
    });
    for(const commit of [true,false])await test('PayPal order binding across owners: A '+(commit?'commit':'rollback'),async()=>{
      const ownerA=await user(),ownerB=await user(),a=await ppReserve(observer,ownerA,randomUUID()),b=await ppReserve(observer,ownerB,randomUUID()),provider=paypalId();
      const outcome=await race('paypal-bind-'+commit,c=>ppBind(c,ownerA,a,provider),c=>ppBind(c,ownerB,b,provider),commit);
      assert.equal(outcome.second.ok,!commit);if(commit)assert.equal(outcome.second.code,'PT409');
      assert.equal((await observer.query('select count(*)::int n from billing_paypal_bindings where paypal_order_id=$1',[provider])).rows[0].n,1);
    });
    for(const commit of [true,false])await test('PayPal capture response/webhook duplicate: A '+(commit?'commit':'rollback'),async()=>{
      const owner=await user(),order=await ppOrder(owner),receipt=ppReceipt(order);
      const outcome=await race('paypal-capture-duplicate-'+commit,c=>ppCapture(c,order,receipt),c=>ppCapture(c,order,receipt),commit);
      assert.equal(outcome.first.granted,true);assert.equal(outcome.second.ok,true);assert.equal(outcome.second.value.granted,!commit);
      assert.equal((await counts(owner)).grants,1);assert.equal((await status(owner)).paidAvailable,1);
      assert.equal((await observer.query("select count(*)::int n from billing_receipts where order_id=$1 and kind='payment'",[order.orderId])).rows[0].n,1);
    });
    for(const commit of [true,false])await test('PayPal capture identity across owners: A '+(commit?'commit':'rollback'),async()=>{
      const ownerA=await user(),ownerB=await user(),a=await ppOrder(ownerA),b=await ppOrder(ownerB),capture=paypalId();
      const outcome=await race('paypal-capture-identity-'+commit,c=>ppCapture(c,a,ppReceipt(a,capture)),c=>ppCapture(c,b,ppReceipt(b,capture)),commit);
      assert.equal(outcome.second.ok,!commit);if(commit)assert.equal(outcome.second.code,'PT409');
      assert.equal((await status(ownerA)).paidGranted,commit?1:0);assert.equal((await status(ownerB)).paidGranted,commit?0:1);
    });
    for(const automaticFirst of[true,false])for(const commit of[true,false])await test('PayPal automatic/manual receipt collision '+automaticFirst+': A '+(commit?'commit':'rollback'),async()=>{
      const autoOwner=await user(),manualOwner=await user(),auto=await ppOrder(autoOwner),capture=paypalId();
      const manual=await result(observer,'select billing_direct_reserve_order($1,$2,$3,$4,$5,$6::jsonb) result',[manualOwner.id,'live',randomUUID(),'profile_1','paypal',{...recipient,accountKey:'synthetic-paypal',paymentUrl:'https://www.paypal.com/ncp/payment/SYNTHETIC'}]);
      const automatic=c=>ppCapture(c,auto,ppReceipt(auto,capture)),manualVerification=c=>directVerify(c,manual,randomUUID(),capture.toLowerCase());
      const outcome=await race('paypal-manual-collision-'+automaticFirst+'-'+commit,automaticFirst?automatic:manualVerification,automaticFirst?manualVerification:automatic,commit);
      assert.equal(outcome.second.ok,!commit);if(commit)assert.equal(outcome.second.code,'PT409');
      const autoWins=automaticFirst===commit;
      assert.equal((await status(autoOwner)).paidGranted,autoWins?1:0);assert.equal((await status(manualOwner)).paidGranted,autoWins?0:1);
    });
    for(const commit of[true,false])await test('PayPal void then late capture: A '+(commit?'commit':'rollback'),async()=>{
      const owner=await user(),order=await ppOrder(owner),receipt=ppReceipt(order);
      const outcome=await race('paypal-close-capture-'+commit,c=>ppClose(c,order),c=>ppCapture(c,order,receipt),commit);
      assert.equal(outcome.second.ok,true);assert.equal(outcome.second.value.granted,true);
      const balance=await status(owner);assert.equal(balance.paidGranted,1);assert.equal(balance.hold,commit);assert.equal(balance.paidAvailable,commit?0:1);
    });
    for(const refundFirst of[true,false])for(const commit of[true,false])await test('PayPal refund/capture ordering '+refundFirst+': A '+(commit?'commit':'rollback'),async()=>{
      const owner=await user(),order=await ppOrder(owner),receipt=ppReceipt(order),event=paypalId();
      const capture=c=>ppCapture(c,order,receipt),refund=c=>ppReview(c,order,receipt,event);
      const outcome=await race('paypal-refund-capture-'+refundFirst+'-'+commit,refundFirst?refund:capture,refundFirst?capture:refund,commit);
      assert.equal(outcome.second.ok,true);const balance=await status(owner);
      assert.equal(balance.paidGranted,refundFirst||commit?1:0);assert.equal(balance.hold,!refundFirst||commit);
      assert.equal(balance.paidAvailable,refundFirst&&!commit?1:0);
    });
    const ppReverseApproval=(client,order,event)=>result(client,'select billing_paypal_reverse_approval($1,$2,$3,$4,$5) result',['live',order.orderId,order.paypalOrderId,merchant,event]);
    for(const approvalFirst of[true,false])for(const commit of[true,false])await test('PayPal approval reversal/capture ordering '+approvalFirst+': A '+(commit?'commit':'rollback'),async()=>{
      const owner=await user(),order=await ppOrder(owner),receipt=ppReceipt(order),event=paypalId();
      const capture=c=>ppCapture(c,order,receipt),reversal=c=>ppReverseApproval(c,order,event);
      const outcome=await race('paypal-approval-reversal-capture-'+approvalFirst+'-'+commit,approvalFirst?reversal:capture,approvalFirst?capture:reversal,commit);
      assert.equal(outcome.second.ok,true);const balance=await status(owner);
      assert.equal(balance.paidGranted,approvalFirst||commit?1:0);assert.equal(balance.hold,commit);
      assert.equal(balance.paidAvailable,approvalFirst&&!commit?1:0);
      const saved=await result(observer,'select billing_paypal_get_order($1,$2,$3) result',[owner.id,'live',order.orderId]);
      assert.equal(saved.status,approvalFirst||commit?'fulfilled':'expired');
    });
    const ppExpire=(client,owner,order)=>result(client,'select billing_paypal_expire_unbound($1,$2,$3) result',[owner.id,'live',order.orderId]);
    const ppFailure=(client,order,receipt)=>result(client,'select billing_paypal_record_failure($1,$2,$3::jsonb) result',['live',order.orderId,{...receipt,status:'DENIED'}]);
    async function agedPayPal(owner){
      const orderId=randomUUID(),request=randomUUID(),approved={key:'profile_1',version:1,currency:'usd',amount:1200,credits:1};
      await observer.query("insert into billing_orders(id,owner_id,environment,request_key,offer,created_at) values($1,$2,'live',$3,$4,'2000-01-01T00:00:00Z')",[orderId,owner.id,request,approved]);
      await observer.query("insert into billing_paypal_orders(order_id,owner_id,environment,merchant_id) values($1,$2,'live',$3)",[orderId,owner.id,merchant]);
      return result(observer,'select billing_paypal_get_order($1,$2,$3) result',[owner.id,'live',orderId]);
    }
    for(const expiryFirst of[true,false])for(const commit of[true,false])await test('PayPal aged expiry/bind ordering '+expiryFirst+': A '+(commit?'commit':'rollback'),async()=>{
      const owner=await user(),order=await agedPayPal(owner),provider=paypalId();
      const expiry=c=>ppExpire(c,owner,order),binding=c=>ppBind(c,owner,order,provider);
      const outcome=await race('paypal-expiry-bind-'+expiryFirst+'-'+commit,expiryFirst?expiry:binding,expiryFirst?binding:expiry,commit);
      assert.equal(outcome.second.ok,true);
      const saved=await result(observer,'select billing_paypal_get_order($1,$2,$3) result',[owner.id,'live',order.orderId]);
      const expired=expiryFirst===commit;assert.equal(saved.status,expired?'expired':'open');
      assert.equal((await counts(owner)).unresolved,expired?0:1);assert.equal((await status(owner)).paidGranted,0);assert.equal((await status(owner)).hold,false);
      if(expiryFirst||commit)assert.equal(saved.paypalOrderId,provider);else assert.equal(saved.paypalOrderId,null);
    });
    for(const failureFirst of[true,false])for(const commit of[true,false])await test('PayPal ordinary failure/capture ordering '+failureFirst+': A '+(commit?'commit':'rollback'),async()=>{
      const owner=await user(),order=await ppOrder(owner),receipt=ppReceipt(order);
      const capture=c=>ppCapture(c,order,receipt),failure=c=>ppFailure(c,order,receipt);
      const outcome=await race('paypal-failure-capture-'+failureFirst+'-'+commit,failureFirst?failure:capture,failureFirst?capture:failure,commit);
      assert.equal(outcome.second.ok,true);const balance=await status(owner);
      assert.equal(balance.paidGranted,failureFirst||commit?1:0);assert.equal(balance.hold,commit);
      assert.equal(balance.paidAvailable,failureFirst&&!commit?1:0);
      const saved=await result(observer,'select billing_paypal_get_order($1,$2,$3) result',[owner.id,'live',order.orderId]);
      assert.equal(saved.status,failureFirst||commit?'fulfilled':'expired');
    });
    assert.equal(report.tests.length, 52); assert.equal(report.barriers.length, 52);
  }
  try {
    observer = await connect('observer');
    const actual = (await observer.query("select current_database() database, session_user username, pg_backend_pid() pid, current_setting('server_version_num')::integer version_num, version() version, (select pg_get_userbyid(datdba) from pg_database where datname=current_database()) database_owner")).rows[0];
    assert.equal(actual.database, DATABASE); assert.equal(actual.username, USER); assert.equal(actual.database_owner, USER);
    assert.equal(Math.floor(actual.version_num / 10000), 17, 'This acceptance job requires PostgreSQL 17');
    report.postgresVersion = actual.version; report.observerPid = actual.pid;
    assert.equal((await observer.query('select pg_try_advisory_lock(734021,1701) locked')).rows[0].locked, true, 'Another fixture runner owns this database');
    const existing = (await observer.query("select (select count(*)::integer from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public') objects, (select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public') functions, (select count(*)::integer from pg_namespace where nspname not in('pg_catalog','information_schema','public') and nspname !~ '^pg_') schemas, (select count(*)::integer from pg_roles where rolname in('anon','authenticated','service_role')) fixture_roles, (select count(*)::integer from pg_database where not datistemplate and datname not in('postgres','qrguitar_billing_qa')) other_databases")).rows[0];
    assert.deepEqual(existing, { objects: 0, functions: 0, schemas: 0, fixture_roles: 0, other_databases: 0 }, 'A fresh dedicated service container is required; existing schemas, roles and databases are never removed');
    report.emptyFixtureVerified = true;
    const { installRepositorySchema } = await import(pathToFileURL(path.join(repo, 'apps/web/scripts/security/postgres-fixture.mjs')));
    await installRepositorySchema({ exec: sql => observer.query(sql), query: (sql, values) => observer.query(sql, values) }, repo);
    await observer.query('alter table storage.objects add column if not exists metadata jsonb');
    await observer.query("insert into storage.buckets(id,name,public) values('instrument-media','instrument-media',false),('instrument-documents','instrument-documents',false),('service-evidence','service-evidence',false) on conflict(id) do update set public=false");
    report.readiness = await result(observer, 'select qrguitar_release_readiness() result');
    assert.equal(report.readiness.ready, true, 'Canonical release readiness failed: ' + JSON.stringify(report.readiness));
    report.installedSignatures = (await observer.query("select p.oid::regprocedure::text signature, encode(sha256(convert_to(replace(p.prosrc,chr(13)||chr(10),chr(10)),'UTF8')),'hex') source_hash from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'billing_%' or p.proname like 'create_instrument_profile%') order by signature")).rows;
    await tests();
    assert.deepEqual(fingerprints(), report.sourceHashes, 'Repository schema sources changed during validation');
  } catch (error) {
    report.fatal = { code: error.code, message: message(error) }; log('FATAL ' + message(error));
  } finally {
    for (const client of [...clients]) try { await close(client); } catch (error) { report.cleanupErrors.push(message(error)); }
    report.passed = report.tests.filter(item => item.ok).length; report.failed = report.tests.filter(item => !item.ok).length;
    report.allConnectionsClosed = clients.size === 0 && report.cleanupErrors.length === 0;
    report.finishedAt = new Date().toISOString();
    report.accepted = !report.fatal && !report.failed && !report.clientErrors.length && report.allConnectionsClosed && report.passed === 52 && report.barriers.length === 52;
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    log(JSON.stringify({ accepted: report.accepted, passed: report.passed, failed: report.failed, barriers: report.barriers.length, allConnectionsClosed: report.allConnectionsClosed, reportFile }));
  }
  if (!report.accepted) process.exitCode = 1;
  return report;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try { await main(); }
  catch (error) { console.error('Concurrency fixture rejected: ' + String(error?.message || error)); process.exitCode = 1; }
}
