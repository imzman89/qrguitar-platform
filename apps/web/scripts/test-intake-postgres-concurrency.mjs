// Acceptance runner: never starts a server, drops a database/role, or connects outside loopback.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

export const FIXTURE_MARKER = 'isolated-intake-postgresql-17';
const DATABASE = 'qrguitar_intake_qa', USER = 'qrguitar_intake_fixture', EXPECTED_CASES = 11;
export function validateFixtureConnection(environment) {
  assert.equal(environment.QRGUITAR_INTAKE_FIXTURE, FIXTURE_MARKER, 'Explicit isolated intake fixture marker is required');
  const raw = environment.QRGUITAR_INTAKE_DATABASE_URL;
  assert.ok(typeof raw === 'string' && raw.length, 'QRGUITAR_INTAKE_DATABASE_URL is required');
  let url; try { url = new URL(raw); } catch { throw new Error('Invalid intake fixture URL'); }
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol), 'Fixture URL must use PostgreSQL');
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname), 'Only localhost or 127.0.0.1 fixtures are allowed');
  assert.equal(url.pathname, '/' + DATABASE, 'Only the dedicated qrguitar_intake_qa database is allowed');
  assert.equal(url.search, '', 'Connection query overrides are forbidden');
  assert.equal(url.hash, '', 'Connection URL fragments are forbidden');
  assert.equal(decodeURIComponent(url.username), USER, 'Only the dedicated fixture bootstrap role is allowed');
  const password = decodeURIComponent(url.password), port = url.port ? Number(url.port) : 5432;
  assert.ok(password.length >= 12, 'An explicit fixture password of at least 12 characters is required');
  assert.ok(Number.isInteger(port) && port > 0 && port <= 65535, 'Invalid fixture port');
  return { host: '127.0.0.1', port, user: USER, password, database: DATABASE, ssl: false,
    connectionTimeoutMillis: 5000, query_timeout: 25000 };
}

export async function main(args = process.argv.slice(2), environment = process.env) {
  const config = validateFixtureConnection(environment); // Before filesystem, dependencies, or connections.
  assert.equal(args.length % 2, 0, 'Every option requires a value');
  const options = new Map();
  for (let i = 0; i < args.length; i += 2) {
    assert.ok(['--repo', '--intake-sql', '--report-dir'].includes(args[i]) && !options.has(args[i]), 'Unknown or duplicate option');
    assert.ok(args[i + 1] && !args[i + 1].startsWith('--'), 'Missing option value'); options.set(args[i], args[i + 1]);
  }
  assert.ok(options.has('--repo') && options.has('--intake-sql'), '--repo and --intake-sql must explicitly select the reviewed sources');
  const repo = fs.realpathSync(options.get('--repo')), intakePath = fs.realpathSync(options.get('--intake-sql'));
  const here = path.dirname(fileURLToPath(import.meta.url));
  const { Client } = createRequire(path.join(repo, 'apps/web/package.json'))('pg');
  const runId = 'intake-' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomBytes(4).toString('hex');
  const reportRoot = path.resolve(options.get('--report-dir') || path.join(here, 'postgres-results'));
  fs.mkdirSync(reportRoot, { recursive: true }); const runDir = path.join(reportRoot, runId); fs.mkdirSync(runDir);
  const hash = value => createHash('sha256').update(value).digest('hex');
  const sourceFiles = () => ['apps/web/scripts/security/postgres-fixture.mjs',
    ...['schema.sql', 'security-rls.sql', 'admin-panel-foundation.sql', 'record-archive-controls.sql', 'service-history-timeline.sql', 'lost-stolen-safety-status.sql'].map(file => 'supabase/' + file),
    ...fs.readdirSync(path.join(repo, 'supabase/migrations')).filter(file => file.endsWith('.sql')).sort().map(file => 'supabase/migrations/' + file)];
  const fingerprints = () => Object.fromEntries(sourceFiles().map(file => [file, hash(fs.readFileSync(path.join(repo, file)))]));
  const report = { runId, startedAt: new Date().toISOString(), database: DATABASE, host: config.host, port: config.port,
    fixtureMarker: FIXTURE_MARKER, sourceHashes: fingerprints(), intakeSource: path.relative(repo, intakePath).replaceAll('\\', '/'),
    intakeHash: hash(fs.readFileSync(intakePath)), runnerHash: hash(fs.readFileSync(fileURLToPath(import.meta.url))),
    tests: [], barriers: [], clientErrors: [], cleanupErrors: [], closedConnections: 0 };
  const message = error => String(error?.message || error).replaceAll(config.password, '[redacted]').replaceAll(environment.QRGUITAR_INTAKE_DATABASE_URL, '[fixture URL]');
  const log = value => { console.log(value); fs.appendFileSync(path.join(runDir, 'test-output.log'), value + '\n'); };
  const clients = new Set(); let observer;
  async function connect(label) {
    const client = new Client({ ...config, application_name: (runId + ':' + label).slice(-63) }); clients.add(client);
    client.on('error', error => report.clientErrors.push({ label, code: error.code, message: message(error) }));
    await client.connect(); await client.query("set statement_timeout='20s'; set lock_timeout='15s'; set idle_in_transaction_session_timeout='30s'"); return client;
  }
  async function close(client) {
    if (!clients.has(client)) return;
    await client.query('rollback').catch(() => {});
    try { await client.end(); report.closedConnections++; clients.delete(client); }
    catch (error) { report.cleanupErrors.push(message(error)); }
  }
  const result = async (client, sql, values) => (await client.query(sql, values)).rows[0].result;
  const begin = client => client.query("begin; set local role service_role; set local request.jwt.claim.role='service_role'");
  async function service(work) { await begin(observer); try { const value = await work(observer); await observer.query('commit'); return value; } catch (error) { await observer.query('rollback'); throw error; } }
  const submit = (client, actor, operation, revision) => result(client, 'select public.submit_account_deletion_request($1,$2,$3::bigint) result', [actor, operation, revision]);
  const cancel = (client, actor, request, operation, revision) => result(client, 'select public.cancel_account_deletion_request($1,$2,$3,$4::bigint) result', [actor, request, operation, revision]);
  const snapshot = actor => service(client => result(client, 'select public.read_account_deletion_requests($1,null) result', [actor]));
  async function actor() {
    const id = randomUUID(); await observer.query('insert into auth.users(id,email) values($1,$2)', [id, 'synthetic-' + id + '@example.invalid']); return id;
  }
  const counts = async actorId => (await observer.query("select (select count(*)::integer from account_deletion_requests where actor_id=$1) requests, (select count(*)::integer from account_deletion_requests where actor_id=$1 and status='requested') active, (select count(*)::integer from account_deletion_request_receipts where actor_id=$1) receipts, coalesce((select revision::text from account_deletion_actor_revisions where actor_id=$1),'0') revision", [actorId])).rows[0];
  async function assertCounts(actorId, requests, active, receipts, revision) { assert.deepEqual(await counts(actorId), { requests, active, receipts, revision }); }
  async function assertNoReceipt(actorId, operation) { assert.equal((await observer.query('select count(*)::integer n from account_deletion_request_receipts where actor_id=$1 and operation_id=$2', [actorId, operation])).rows[0].n, 0); }
  function rejected(value, code) { assert.equal(value.ok, false); assert.equal(value.code, code); }
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

  // A retains its transaction locks after its RPC; B runs on another backend.
  // A third backend proves B is blocked by A before A is released. No timing-only acceptance.
  async function race(name, aWork, bWork, commit = true) {
    let a, b, pending, settled = false;
    try {
      a = await connect(name + ':A'); b = await connect(name + ':B');
      const aPid = (await a.query('select pg_backend_pid() pid')).rows[0].pid, bPid = (await b.query('select pg_backend_pid() pid')).rows[0].pid;
      assert.equal(new Set([aPid, bPid, report.observerPid]).size, 3);
      await begin(a); const first = await aWork(a); await begin(b);
      pending = bWork(b, first).then(value => ({ ok: true, value }), error => ({ ok: false, code: error.code, message: message(error) })).then(value => { settled = true; return value; });
      let barrier; const deadline = Date.now() + 6000;
      while (Date.now() < deadline) {
        const row = (await observer.query('select pg_blocking_pids(pid) blockers, wait_event_type, wait_event from pg_stat_activity where pid=$1', [bPid])).rows[0];
        // Activity wait fields and lock-manager blockers can reflect different instants.
        // Retain A's transaction until one sample proves both, with B still pending.
        if (!settled && row?.blockers?.includes(aPid) && row.wait_event_type === 'Lock') { barrier = { name, aPid, bPid, observerPid: report.observerPid, ...row }; break; }
        if (settled) throw new Error('B did not wait on A: ' + JSON.stringify(await pending));
        await pause(10);
      }
      assert.ok(barrier, 'Missing actual PostgreSQL lock barrier'); assert.equal(barrier.wait_event_type, 'Lock');
      report.barriers.push(barrier); log('BARRIER ' + JSON.stringify(barrier));
      await a.query(commit ? 'commit' : 'rollback'); const second = await pending;
      await b.query(second.ok ? 'commit' : 'rollback'); return { first, second };
    } finally {
      if (a) await a.query('rollback').catch(() => {});
      if (pending) await pending;
      if (a) await close(a); if (b) await close(b);
    }
  }
  async function test(name, work) {
    try { await work(); report.tests.push({ name, ok: true }); log('PASS ' + name); }
    catch (error) { report.tests.push({ name, ok: false, code: error.code, message: message(error) }); log('FAIL ' + name + ': ' + message(error)); }
  }
  async function tests() {
    await test('two new submits from revision zero: exactly one accepted', async () => {
      const id = await actor(), a = randomUUID(), b = randomUUID();
      const got = await race('submit-distinct', c => submit(c,id,a,'0'), c => submit(c,id,b,'0'));
      assert.equal(got.first.ok,true); rejected(got.second,'PD412'); await assertCounts(id,1,1,1,'1'); await assertNoReceipt(id,b);
      assert.equal((await snapshot(id)).activeRequest.requestId,got.first.request.requestId);
    });
    await test('same submit operation concurrently replays once', async () => {
      const id = await actor(), op = randomUUID();
      const got = await race('submit-replay', c => submit(c,id,op,'0'), c => submit(c,id,op,'0'));
      assert.equal(got.second.ok,true); assert.deepEqual(got.second.value,got.first); await assertCounts(id,1,1,1,'1');
    });
    await test('rolled-back submit leaves no request receipt or revision', async () => {
      const id = await actor(), a = randomUUID(), b = randomUUID();
      const got = await race('submit-rollback', c => submit(c,id,a,'0'), c => submit(c,id,b,'0'), false);
      assert.equal(got.second.ok,true); assert.notEqual(got.first.request.requestId,got.second.value.request.requestId);
      await assertCounts(id,1,1,1,'1'); await assertNoReceipt(id,a);
      assert.equal((await snapshot(id)).activeRequest.requestId,got.second.value.request.requestId);
    });
    await test('delayed old submit cannot reopen newer submit then cancellation', async () => {
      const id = await actor(), old = randomUUID(), newer = randomUUID(), cancelOp = randomUUID();
      const got = await race('old-after-new-cancel', async c => {
        const created = await submit(c,id,newer,'0'); return cancel(c,id,created.request.requestId,cancelOp,'1');
      }, c => submit(c,id,old,'0'));
      rejected(got.second,'PD412'); await assertCounts(id,1,0,2,'2'); await assertNoReceipt(id,old);
      const state = await snapshot(id); assert.equal(state.revision,'2'); assert.equal(state.activeRequest,null); assert.equal(state.latestRequest.status,'cancelled');
    });
    await test('stale submit after concurrent cancellation must be freshly reconfirmed', async () => {
      const id = await actor(), initial = await service(c => submit(c,id,randomUUID(),'0')), stale = randomUUID();
      const got = await race('cancel-vs-submit', c => cancel(c,id,initial.request.requestId,randomUUID(),'1'), c => submit(c,id,stale,'1'));
      rejected(got.second,'PD412'); await assertCounts(id,1,0,2,'2'); await assertNoReceipt(id,stale);
      const next = await service(c => submit(c,id,randomUUID(),'2')); assert.notEqual(next.request.requestId,initial.request.requestId); await assertCounts(id,2,1,3,'3');
    });
    await test('historical submit replay after concurrent cancel cannot reopen it', async () => {
      const id = await actor(), initialOp = randomUUID(), initial = await service(c => submit(c,id,initialOp,'0'));
      const got = await race('cancel-vs-submit-replay', c => cancel(c,id,initial.request.requestId,randomUUID(),'1'), c => submit(c,id,initialOp,'0'));
      assert.equal(got.second.ok,true); assert.deepEqual(got.second.value.receipt,initial.receipt); assert.equal(got.second.value.request.status,'cancelled'); await assertCounts(id,1,0,2,'2');
    });
    await test('historical cancellation replay cannot cancel a concurrent newer request', async () => {
      const id = await actor(), initial = await service(c => submit(c,id,randomUUID(),'0')), oldOp = randomUUID();
      const old = await service(c => cancel(c,id,initial.request.requestId,oldOp,'1'));
      const got = await race('new-vs-old-cancel', c => submit(c,id,randomUUID(),'2'), c => cancel(c,id,initial.request.requestId,oldOp,'1'));
      assert.equal(got.second.ok,true); assert.deepEqual(got.second.value,old); await assertCounts(id,2,1,3,'3');
      assert.equal((await snapshot(id)).activeRequest.requestId,got.first.request.requestId);
    });
    await test('same operation changed expected revision is rejected after waiting', async () => {
      const id = await actor(), op = randomUUID();
      const got = await race('changed-revision', c => submit(c,id,op,'0'), c => submit(c,id,op,'1'));
      rejected(got.second,'PD409'); await assertCounts(id,1,1,1,'1');
      assert.deepEqual((await service(c => submit(c,id,op,'0'))).receipt,got.first.receipt);
    });
    await test('same operation changed action is rejected after waiting', async () => {
      const id = await actor(), op = randomUUID();
      const got = await race('changed-action', c => submit(c,id,op,'0'), (c, first) => cancel(c,id,first.request.requestId,op,'0'));
      rejected(got.second,'PD409'); await assertCounts(id,1,1,1,'1');
    });
    await test('same cancellation operation changed target is rejected after waiting', async () => {
      const id = await actor(), old = await service(c => submit(c,id,randomUUID(),'0'));
      await service(c => cancel(c,id,old.request.requestId,randomUUID(),'1'));
      const current = await service(c => submit(c,id,randomUUID(),'2')), op = randomUUID();
      const got = await race('changed-target', c => cancel(c,id,current.request.requestId,op,'3'), c => cancel(c,id,old.request.requestId,op,'3'));
      rejected(got.second,'PD409'); await assertCounts(id,2,0,4,'4');
      assert.deepEqual((await service(c => cancel(c,id,current.request.requestId,op,'3'))).receipt,got.first.receipt);
    });
    await test('rolled-back cancellation permits waiting cancellation with same observed revision', async () => {
      const id = await actor(), initial = await service(c => submit(c,id,randomUUID(),'0')), a = randomUUID(), b = randomUUID();
      const got = await race('cancel-rollback', c => cancel(c,id,initial.request.requestId,a,'1'), c => cancel(c,id,initial.request.requestId,b,'1'), false);
      assert.equal(got.second.ok,true); assert.equal(got.second.value.request.status,'cancelled'); await assertCounts(id,1,0,2,'2'); await assertNoReceipt(id,a);
    });
    assert.equal(report.tests.length,EXPECTED_CASES); assert.equal(report.barriers.length,EXPECTED_CASES);
  }
  try {
    observer = await connect('observer');
    const actual = (await observer.query("select current_database() database, session_user username, pg_backend_pid() pid, current_setting('server_version_num')::integer version_num, version() version, (select pg_get_userbyid(datdba) from pg_database where datname=current_database()) database_owner")).rows[0];
    assert.equal(actual.database,DATABASE); assert.equal(actual.username,USER); assert.equal(actual.database_owner,USER);
    assert.equal(Math.floor(actual.version_num/10000),17,'This acceptance job requires PostgreSQL 17');
    report.postgresVersion = actual.version; report.observerPid = actual.pid;
    assert.equal((await observer.query('select pg_try_advisory_lock(734021,1719) locked')).rows[0].locked,true,'Another intake runner owns this database');
    const existing = (await observer.query("select (select count(*)::integer from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public') objects, (select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public') functions, (select count(*)::integer from pg_namespace where nspname not in('pg_catalog','information_schema','public') and nspname !~ '^pg_') schemas, (select count(*)::integer from pg_roles where rolname in('anon','authenticated','service_role')) fixture_roles, (select count(*)::integer from pg_database where not datistemplate and datname not in('postgres','qrguitar_intake_qa')) other_databases")).rows[0];
    assert.deepEqual(existing,{objects:0,functions:0,schemas:0,fixture_roles:0,other_databases:0},'A fresh dedicated service container is required; existing objects/roles/databases are never removed');
    report.emptyFixtureVerified = true;
    const { installRepositorySchema } = await import(pathToFileURL(path.join(repo,'apps/web/scripts/security/postgres-fixture.mjs')));
    await installRepositorySchema({exec: sql => observer.query(sql),query: (sql,values) => observer.query(sql,values)},repo);
    await observer.query('alter table storage.objects add column if not exists metadata jsonb');
    await observer.query("insert into storage.buckets(id,name,public) values('instrument-media','instrument-media',false),('instrument-documents','instrument-documents',false),('service-evidence','service-evidence',false) on conflict(id) do update set public=false");
    report.baselineReadiness = await result(observer,'select qrguitar_release_readiness() result');
    assert.equal(report.baselineReadiness.ready,true,'Canonical baseline readiness failed');
    // If --intake-sql is already an installed canonical migration, do not replay it.
    const included = sourceFiles().some(file => fs.realpathSync(path.join(repo,file)) === intakePath);
    report.intakeInstalledByRepositoryFixture = included;
    if (!included) await observer.query(fs.readFileSync(intakePath,'utf8'));
    report.installedSignatures = (await observer.query("select p.oid::regprocedure::text signature, encode(sha256(convert_to(replace(p.prosrc,chr(13)||chr(10),chr(10)),'UTF8')),'hex') source_hash from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like '%account_deletion%' order by signature")).rows;
    for (const signature of ['submit_account_deletion_request(uuid,uuid,bigint)','cancel_account_deletion_request(uuid,uuid,uuid,bigint)','read_account_deletion_requests(uuid,uuid)']) {
      assert.ok(report.installedSignatures.some(row => row.signature === signature),'Missing revision-fenced RPC: '+signature);
    }
    await tests();
    assert.deepEqual(fingerprints(),report.sourceHashes,'Repository schema sources changed during validation');
    assert.equal(hash(fs.readFileSync(intakePath)),report.intakeHash,'Intake SQL changed during validation');
    assert.equal(hash(fs.readFileSync(fileURLToPath(import.meta.url))),report.runnerHash,'Harness source changed during validation');
  } catch (error) { report.fatal = {code:error.code,message:message(error)}; log('FATAL '+message(error)); }
  finally {
    for (const client of [...clients]) await close(client);
    report.passed = report.tests.filter(test => test.ok).length; report.failed = report.tests.filter(test => !test.ok).length;
    report.allConnectionsClosed = clients.size === 0 && report.cleanupErrors.length === 0; report.finishedAt = new Date().toISOString();
    report.accepted = !report.fatal && !report.failed && !report.clientErrors.length && report.allConnectionsClosed && report.passed === EXPECTED_CASES && report.barriers.length === EXPECTED_CASES;
    const reportFile = path.join(runDir,'report.json'); fs.writeFileSync(reportFile,JSON.stringify(report,null,2));
    log(JSON.stringify({accepted:report.accepted,passed:report.passed,failed:report.failed,barriers:report.barriers.length,allConnectionsClosed:report.allConnectionsClosed,reportFile}));
  }
  if (!report.accepted) process.exitCode = 1;
  return report;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try { await main(); } catch (error) { console.error('Intake fixture rejected: '+String(error?.message||error)); process.exitCode=1; }
}
