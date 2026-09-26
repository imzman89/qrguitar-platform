import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

// Manual isolated acceptance only: never run as part of the default test suite.
const ORIGIN = 'https://localhost:55440';
const BACKEND = 'http://127.0.0.1:55431';
const ROUTE = 'apps/web/app/api/service-submissions/route.ts';
const sha = value => createHash('sha256').update(value).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const plan = ['anonymous review denied', 'wrong account denied even with valid old token',
  'provider cannot approve; owner cannot resend', 'changed owner denies old and new owner approval and suppresses resend',
  'expired review denies approval and suppresses resend without extending deadline',
  'failed resend preserves old token and original deadline', 'old token still approves through actual HTTP',
  'tokenless current-owner approval succeeds', 'duplicate approval creates no duplicate history', 'exact fixture cleanup'];

function validateStatus(status) {
  assert.equal(status.API_URL, BACKEND);
  const db = new URL(status.DB_URL);
  assert.equal(db.protocol, 'postgresql:');
  assert.equal(db.hostname, '127.0.0.1');
  assert.equal(db.port, '55432');
  assert.equal(db.pathname, '/postgres');
  assert.equal(db.search, '');
  assert.equal(db.hash, '');
  assert.ok(status.ANON_KEY && status.SERVICE_ROLE_KEY);
  return { host: db.hostname, port: 55432, database: 'postgres', user: decodeURIComponent(db.username),
    password: decodeURIComponent(db.password), ssl: false, connectionTimeoutMillis: 10000,
    statement_timeout: 15000, application_name: 'qrg-service-review-http' };
}

function validateRuntime(identity, repo, expectedHead) {
  assert.match(expectedHead, /^[a-f0-9]{40}$/);
  assert.equal(identity.origin, ORIGIN);
  assert.equal(identity.backend, BACKEND);
  assert.equal(identity.supabaseOrigin, ORIGIN);
  assert.equal(fs.realpathSync(identity.sourceCheckout), fs.realpathSync(repo));
  assert.equal(identity.sourceHead, expectedHead);
  assert.equal(identity.configRedacted?.productionDestination, false);
  assert.equal(identity.configRedacted?.financialCredentialsPresent, false);
  assert.equal(identity.configRedacted?.database, '127.0.0.1:55432');
  assert.ok(Object.values(identity.configRedacted.paymentFlags).length >= 4);
  assert.ok(Object.values(identity.configRedacted.paymentFlags).every(value => value === 'false'));
  assert.equal(identity.windowsTrustChanged, false);
}

function localUrl(input) {
  const url = new URL(input instanceof Request ? input.url : String(input));
  assert.ok([ORIGIN, BACKEND].includes(url.origin), 'Nonlocal network destination rejected');
  assert.ok(!url.username && !url.password && !url.hash);
  assert.ok(url.origin === ORIGIN || /^\/(auth|rest)\/v1\//.test(url.pathname));
  return url;
}

if (process.argv[2] === '--self-test') {
  for (const url of ['https://www.qrguitar.com/api/service-submissions', 'http://127.0.0.1:54321/auth/v1/token',
    'https://localhost.evil:55440/', 'https://secret@localhost:55440/', 'http://127.0.0.1:55431/other']) assert.throws(() => localUrl(url));
  assert.equal(localUrl(ORIGIN + '/api/service-submissions').origin, ORIGIN);
  const status = { API_URL: BACKEND, DB_URL: 'postgresql://postgres:synthetic@127.0.0.1:55432/postgres', ANON_KEY: 'synthetic', SERVICE_ROLE_KEY: 'synthetic' };
  assert.equal(validateStatus(status).port, 55432);
  for (const changed of [{ API_URL: 'https://project.supabase.co' }, { DB_URL: 'postgresql://x@y:55432/postgres' },
    { DB_URL: status.DB_URL + '?host=external.example' }, { SERVICE_ROLE_KEY: '' }]) assert.throws(() => validateStatus({ ...status, ...changed }));
  console.log('PASS local-only guards: 11 assertions; no network or database access');
} else if (process.argv[2] !== '--execute') {
  console.log(JSON.stringify({ mode: 'plan-only', backendTouched: false, cases: plan,
    execution: '--execute <candidate-repo> <full-sha> <private-status-directory> <process-ca-file> <report-directory>; requires released backend slot and provider-disabled runtime.' }, null, 2));
} else {
  await run().catch(() => { console.error('FAIL isolated HTTP acceptance. See redacted report; no secrets are printed.'); process.exitCode = 1; });
}

async function run() {
  assert.equal(process.env.QRGUITAR_SERVICE_HTTP_SLOT, 'boss-released-service-review');
  assert.equal(process.argv.length, 8);
  const privateRoot = fs.realpathSync(process.argv[5]), ca = fs.realpathSync(process.argv[6]), reportRoot = fs.realpathSync(process.argv[7]);
  assert.equal(fs.realpathSync(process.env.NODE_EXTRA_CA_CERTS), ca);
  assert.equal(process.env.NODE_TLS_REJECT_UNAUTHORIZED, undefined);
  assert.equal(process.env.NODE_OPTIONS, undefined);
  const repo = fs.realpathSync(process.argv[3]), expectedHead = process.argv[4];
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  assert.equal(git('rev-parse', 'HEAD'), expectedHead);
  // Patch may be cherry-picked; require the exact reviewed route bytes, not ancestry.
  const reference = execFileSync('git', ['-C', repo, 'show', '585c09a:' + ROUTE], { stdio: ['ignore', 'pipe', 'pipe'] });
  assert.equal(sha(fs.readFileSync(path.join(repo, ROUTE)).toString().replaceAll('\r\n', '\n')), sha(reference.toString().replaceAll('\r\n', '\n')));
  const status = read(path.join(privateRoot, 'status.json')), connection = validateStatus(status);
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = (input, init = {}) => {
    localUrl(input);
    return nativeFetch(input, { ...init, redirect: 'error', signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(45000)]) : AbortSignal.timeout(45000) });
  };
  const identityResponse = await fetch(ORIGIN + '/__qragent1_https_runtime');
  assert.equal(identityResponse.status, 200);
  const identity = await identityResponse.json();
  validateRuntime(identity, repo, expectedHead);
  const files = git('ls-files').split(/\r?\n/).filter(file => file && file !== 'apps/web/next-env.d.ts').sort()
    .map(file => ({ file, sha256: sha(fs.readFileSync(path.join(repo, file))) }));
  assert.equal(identity.sourceDigest, sha(JSON.stringify(files)), 'Runtime source changed after startup');
  const require = createRequire(path.join(repo, 'apps/web/package.json'));
  const { Client } = require('pg'), { createClient } = require('@supabase/supabase-js');
  const db = new Client(connection);
  const service = createClient(BACKEND, status.SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const users = [], guitars = [], submissions = [];
  const runId = randomUUID(), reportPath = path.join(reportRoot, 'service-review-http-' + runId + '.json');
  const report = { runId, expectedHead, scope: 'actual HTTPS Next routes with real local Auth/PostgREST/Postgres; no SMTP/provider send',
    tests: [], cleanup: 'pending', complete: false, created: { users, guitars, submissions } };
  const save = () => fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  const scalar = async (sql, args = []) => (await db.query(sql, args)).rows[0].value;
  async function test(name, body) {
    try { await body(); report.tests.push({ name, passed: true }); }
    catch (error) { report.tests.push({ name, passed: false, kind: error instanceof assert.AssertionError ? 'assertion' : 'operation',
      ...(Number.isInteger(error.actual) ? { actualStatus: error.actual } : {}),
      ...(Number.isInteger(error.expected) ? { expectedStatus: error.expected } : {}) }); throw error; }
    finally { save(); }
  }
  async function actor(label) {
    const password = randomBytes(30).toString('base64url');
    const email = `service-http-${label}-${runId}@example.invalid`;
    const made = await service.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(made.error); assert.ok(made.data.user?.id);
    const id = made.data.user.id; users.push(id); save();
    const client = createClient(BACKEND, status.ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const signed = await client.auth.signInWithPassword({ email, password });
    assert.ifError(signed.error); assert.ok(signed.data.session?.access_token);
    await db.query("insert into profiles(id,display_name) values($1,'Synthetic service HTTP actor') on conflict(id) do nothing", [id]);
    return { id, token: signed.data.session.access_token };
  }
  async function fixture(owner, provider, expiry = new Date(Date.now() + 86400000)) {
    const guitar = randomUUID(), id = randomUUID(), token = randomBytes(32).toString('hex');
    guitars.push(guitar); submissions.push(id); save();
    const qr = 'QRG-' + randomBytes(8).toString('hex').toUpperCase();
    await db.query("insert into guitars(id,owner_id,qr_code,permanent_path,name,brand,visibility) values($1,$2,$3,$4,'Synthetic service HTTP item','Synthetic','private')", [guitar, owner.id, qr, '/i/' + qr]);
    await db.query("insert into service_submissions(id,guitar_id,provider_user_id,owner_user_id,status,service_date,service_type,title,work_performed,expires_at,submitted_at) values($1,$2,$3,$4,'submitted',current_date,'Setup','Synthetic setup','Synthetic fixture work',$5,now())", [id, guitar, provider.id, owner.id, expiry]);
    await db.query('insert into service_submission_tokens(submission_id,token_hash,expires_at) values($1,$2,$3)', [id, sha(token), expiry]);
    return { id, guitar, token, expiry };
  }
  async function request(actor, row, action, token) {
    const response = await fetch(ORIGIN + '/api/service-submissions', { method: 'PATCH', headers: {
      'content-type': 'application/json', origin: ORIGIN, ...(actor ? { authorization: 'Bearer ' + actor.token } : {}) },
      body: JSON.stringify({ id: row.id, action, requestedVisibility: 'private', ...(token ? { reviewToken: token } : {}) }) });
    assert.match(response.headers.get('cache-control') || '', /no-store/);
    return { status: response.status, body: await response.json() };
  }
  async function unchanged(row) {
    assert.equal(await scalar('select status value from service_submissions where id=$1', [row.id]), 'submitted');
    assert.equal(await scalar('select count(*)::int value from guitar_timeline_events where service_submission_id=$1', [row.id]), 0);
    assert.equal(await scalar('select count(*)::int value from service_submission_tokens where submission_id=$1 and token_hash=$2 and consumed_at is null', [row.id, sha(row.token)]), 1);
    assert.equal((await scalar('select expires_at value from service_submissions where id=$1', [row.id])).toISOString(), row.expiry.toISOString());
  }
  let connected = false;
  try {
    await db.connect(); connected = true;
    assert.match(await scalar("select current_setting('server_version') value"), /^17\./);
    assert.equal(await scalar("select count(*)::int value from auth.users where email is null or email not like '%@example.invalid'"), 0, 'Refusing backend containing real accounts');
    const owner = await actor('owner'), provider = await actor('provider'), other = await actor('other');
    await db.query("insert into service_provider_profiles(user_id,public_display_name) values($1,'Synthetic service provider')", [provider.id]);
    const row = await fixture(owner, provider);
    await test(plan[0], async () => { assert.equal((await request(null, row, 'approve', row.token)).status, 401); await unchanged(row); });
    await test(plan[1], async () => { assert.equal((await request(other, row, 'approve', row.token)).status, 403); await unchanged(row); });
    await test(plan[2], async () => {
      assert.equal((await request(provider, row, 'approve')).status, 403);
      assert.equal((await request(owner, row, 'retry_email')).status, 403); await unchanged(row);
    });
    await test(plan[3], async () => {
      const changed = await fixture(owner, provider);
      await db.query('update guitars set owner_id=$2 where id=$1', [changed.guitar, other.id]);
      assert.equal((await request(owner, changed, 'approve', changed.token)).status, 403);
      assert.equal((await request(other, changed, 'approve', changed.token)).status, 403);
      const resend = await request(provider, changed, 'retry_email');
      assert.equal(resend.status, 502); assert.equal(resend.body.emailOutcome, 'not_sent'); await unchanged(changed);
    });
    await test(plan[4], async () => {
      const expired = await fixture(owner, provider, new Date(Date.now() - 60000));
      assert.equal((await request(owner, expired, 'approve')).status, 409);
      const resend = await request(provider, expired, 'retry_email');
      assert.equal(resend.status, 502); assert.equal(resend.body.emailOutcome, 'not_sent'); await unchanged(expired);
    });
    await test(plan[5], async () => {
      const resend = await request(provider, row, 'retry_email');
      assert.equal(resend.status, 502);
      assert.ok(['rejected', 'unknown'].includes(resend.body.emailOutcome));
      assert.equal(resend.body.ok, false); await unchanged(row);
    });
    await test(plan[6], async () => {
      // This is the exact token carried by an earlier review URL, posted by the actual review page.
      const approved = await request(owner, row, 'approve', row.token);
      assert.equal(approved.status, 200); assert.equal(approved.body.ok, true);
      assert.equal(await scalar('select count(*)::int value from guitar_timeline_events where service_submission_id=$1', [row.id]), 1);
    });
    await test(plan[7], async () => {
      const tokenless = await fixture(owner, provider);
      const approved = await request(owner, tokenless, 'approve');
      assert.equal(approved.status, 200); assert.equal(approved.body.ok, true);
    });
    await test(plan[8], async () => {
      assert.equal((await request(owner, row, 'approve', row.token)).status, 409);
      const again = await request(owner, row, 'approve');
      assert.equal(again.status, 200); assert.equal(again.body.alreadyApproved, true);
      assert.equal(await scalar('select count(*)::int value from guitar_timeline_events where service_submission_id=$1', [row.id]), 1);
    });
    report.complete = true;
  } finally {
    if (connected) {
      try {
        // Only this run's pre-recorded synthetic UUIDs are eligible for deletion.
        await db.query('begin');
        // Existing provenance trigger permits administrative cleanup, never end-user deletion.
        await db.query("select set_config('request.jwt.claim.role','service_role',true)");
        await db.query('delete from admin_audit_events where actor_user_id=any($1::uuid[])', [users]);
        await db.query('delete from service_submissions where id=any($1::uuid[])', [submissions]);
        await db.query('delete from guitars where id=any($1::uuid[])', [guitars]);
        await db.query('delete from auth.users where id=any($1::uuid[]) and email like $2', [users, 'service-http-%-' + runId + '@example.invalid']);
        assert.equal(await scalar('select count(*)::int value from auth.users where id=any($1::uuid[])', [users]), 0);
        assert.equal(await scalar('select count(*)::int value from guitars where id=any($1::uuid[])', [guitars]), 0);
        assert.equal(await scalar('select count(*)::int value from service_submissions where id=any($1::uuid[])', [submissions]), 0);
        await db.query('commit'); report.cleanup = 'passed';
      } catch { await db.query('rollback').catch(() => {}); report.cleanup = 'failed'; report.complete = false; }
      await db.end();
    }
    globalThis.fetch = nativeFetch;
    save();
    console.log(JSON.stringify({ complete: report.complete, passed: report.tests.filter(t => t.passed).length, cleanup: report.cleanup, reportPath }));
    assert.equal(report.cleanup, 'passed');
  }
}
