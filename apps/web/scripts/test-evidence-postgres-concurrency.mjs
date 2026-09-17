// Acceptance runner: never starts a server, drops a database/role, or connects outside loopback.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

export const FIXTURE_MARKER = 'isolated-evidence-postgresql-17';
const DATABASE = 'qrguitar_evidence_qa', USER = 'qrguitar_evidence_fixture', EXPECTED_CASES = 8;
export function validateFixtureConnection(environment) {
  assert.equal(environment.QRGUITAR_EVIDENCE_FIXTURE, FIXTURE_MARKER, 'Explicit isolated evidence fixture marker is required');
  const raw = environment.QRGUITAR_EVIDENCE_DATABASE_URL;
  assert.ok(typeof raw === 'string' && raw.length, 'QRGUITAR_EVIDENCE_DATABASE_URL is required');
  let url; try { url = new URL(raw); } catch { throw new Error('Invalid evidence fixture URL'); }
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol), 'Fixture URL must use PostgreSQL');
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname), 'Only localhost or 127.0.0.1 fixtures are allowed');
  assert.equal(url.pathname, '/' + DATABASE, 'Only the dedicated qrguitar_evidence_qa database is allowed');
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
    assert.ok(['--repo', '--evidence-sql', '--report-dir'].includes(args[i]) && !options.has(args[i]), 'Unknown or duplicate option');
    assert.ok(args[i + 1] && !args[i + 1].startsWith('--'), 'Missing option value'); options.set(args[i], args[i + 1]);
  }
  assert.ok(options.has('--repo') && options.has('--evidence-sql'), '--repo and --evidence-sql must explicitly select the reviewed sources');
  const repo = fs.realpathSync(options.get('--repo')), evidencePath = fs.realpathSync(options.get('--evidence-sql'));
  const here = path.dirname(fileURLToPath(import.meta.url));
  const { Client } = createRequire(path.join(repo, 'apps/web/package.json'))('pg');
  const runId = 'evidence-' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomBytes(4).toString('hex');
  const reportRoot = path.resolve(options.get('--report-dir') || path.join(here, 'postgres-results'));
  fs.mkdirSync(reportRoot, { recursive: true }); const runDir = path.join(reportRoot, runId); fs.mkdirSync(runDir);
  const hash = value => createHash('sha256').update(value).digest('hex');
  const sourceFiles = () => ['apps/web/scripts/security/postgres-fixture.mjs',
    ...['schema.sql', 'security-rls.sql', 'admin-panel-foundation.sql', 'record-archive-controls.sql', 'service-history-timeline.sql', 'lost-stolen-safety-status.sql'].map(file => 'supabase/' + file),
    ...fs.readdirSync(path.join(repo, 'supabase/migrations')).filter(file => file.endsWith('.sql')).sort().map(file => 'supabase/migrations/' + file)];
  const fingerprints = () => Object.fromEntries(sourceFiles().map(file => [file, hash(fs.readFileSync(path.join(repo, file)))]));
  const report = { runId, startedAt: new Date().toISOString(), database: DATABASE, host: config.host, port: config.port,
    fixtureMarker: FIXTURE_MARKER, sourceHashes: fingerprints(), evidenceSource: path.relative(repo, evidencePath).replaceAll('\\', '/'),
    evidenceHash: hash(fs.readFileSync(evidencePath)), runnerHash: hash(fs.readFileSync(fileURLToPath(import.meta.url))),
    tests: [], barriers: [], clientErrors: [], cleanupErrors: [], closedConnections: 0 };
  const message = error => String(error?.message || error).replaceAll(config.password, '[redacted]').replaceAll(environment.QRGUITAR_EVIDENCE_DATABASE_URL, '[fixture URL]');
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
  const metadata = { evidence_type: 'receipt', file_name: 'Synthetic.pdf', mime_type: 'application/pdf', file_size_bytes: 42 };
  const prepare = (client, f) => result(client, 'select public.prepare_service_evidence_upload($1,$2,false,$3,$4::jsonb) result', [f.submission, f.actor, f.upload, JSON.stringify(metadata)]);
  const complete = (client, f) => result(client, 'select public.commit_service_evidence_upload($1,$2,false,$3) result', [f.submission, f.actor, f.upload]);
  const remove = (client, f, evidenceId) => result(client, "select public.commit_service_evidence($1,$2,false,'delete',$3::jsonb) result", [f.submission, f.actor, JSON.stringify({ id: evidenceId })]);
  const submit = async (client, f) => (await client.query("update public.service_submissions set status='submitted' where id=$1 and status='draft' returning status", [f.submission])).rows[0];
  const lockAccount = async (client, f) => (await client.query("update public.profiles set account_status='locked' where id=$1 returning account_status", [f.actor])).rows[0];
  async function fixture() {
    const f = { actor: randomUUID(), owner: randomUUID(), guitar: randomUUID(), submission: randomUUID(), upload: randomUUID() };
    await observer.query('insert into auth.users(id,email) values($1,$2),($3,$4)', [f.actor, 'synthetic-' + f.actor + '@example.invalid', f.owner, 'synthetic-' + f.owner + '@example.invalid']);
    await observer.query("insert into public.profiles(id,display_name) values($1,'Synthetic provider'),($2,'Synthetic owner')", [f.actor, f.owner]);
    const code = 'QRG-' + randomBytes(8).toString('hex').toUpperCase();
    await observer.query("insert into public.guitars(id,owner_id,qr_code,permanent_path,name,brand) values($1,$2,$3,$4,'Synthetic','Synthetic')", [f.guitar, f.owner, code, '/i/' + code]);
    await observer.query('insert into public.service_submissions(id,guitar_id,provider_user_id,owner_user_id) values($1,$2,$3,$4)', [f.submission, f.guitar, f.actor, f.owner]);
    const receipt = await service(c => prepare(c, f));
    await observer.query("insert into storage.objects(id,bucket_id,name,metadata) values($1,'service-evidence',$2,$3::jsonb)", [randomUUID(), receipt.storagePath, JSON.stringify({ size: 42, mimetype: 'application/pdf' })]);
    return f;
  }
  async function assertCounts(f, state, evidence, uploaded, removed = 0) {
    const actual = (await observer.query("select (select count(*)::integer from public.service_evidence_uploads where upload_id=$1) receipts, (select state from public.service_evidence_uploads where upload_id=$1) state, (select count(*)::integer from public.service_submission_evidence where submission_id=$2) evidence, (select count(*)::integer from public.service_submission_activity where submission_id=$2 and action='evidence_uploaded') uploaded, (select count(*)::integer from public.service_submission_activity where submission_id=$2 and action='evidence_removed') removed", [f.upload, f.submission])).rows[0];
    assert.deepEqual(actual, { receipts: 1, state, evidence, uploaded, removed });
  }
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
    await test('two completions of one upload serialize into one evidence and activity', async () => {
      const f = await fixture();
      const got = await race('complete-replay', c => complete(c,f), c => complete(c,f));
      assert.equal(got.first.state,'committed'); assert.equal(got.second.ok,true); assert.deepEqual(got.second.value,got.first);
      await assertCounts(f,'committed',1,1);
    });
    await test('submission closes before waiting completion: new evidence rejected', async () => {
      const f = await fixture();
      const got = await race('submit-before-complete', c => submit(c,f), c => complete(c,f));
      assert.equal(got.first.status,'submitted'); rejected(got.second,'PT409'); await assertCounts(f,'prepared',0,0);
    });
    await test('completion precedes waiting submit: one committed evidence survives close', async () => {
      const f = await fixture();
      const got = await race('complete-before-submit', c => complete(c,f), c => submit(c,f));
      assert.equal(got.first.state,'committed'); assert.equal(got.second.ok,true); assert.equal(got.second.value.status,'submitted');
      await assertCounts(f,'committed',1,1); assert.deepEqual(await service(c=>complete(c,f)),got.first);
    });
    await test('delete precedes late completion: tombstone rejects resurrection', async () => {
      const f = await fixture(), original = await service(c=>complete(c,f));
      const got = await race('delete-before-complete', c => remove(c,f,original.evidence.id), c => complete(c,f));
      assert.equal(got.first.id,original.evidence.id); rejected(got.second,'SE409'); await assertCounts(f,'deleted',0,1,1);
    });
    await test('completion precedes waiting delete: metadata and receipt are removed together', async () => {
      const f = await fixture();
      const got = await race('complete-before-delete', c => complete(c,f), (c,first) => remove(c,f,first.evidence.id));
      assert.equal(got.second.ok,true); assert.equal(got.second.value.id,got.first.evidence.id); await assertCounts(f,'deleted',0,1,1);
      await assert.rejects(service(c=>complete(c,f)),error=>error.code==='SE409');
    });
    await test('account lock precedes completion: current restriction denies mutation', async () => {
      const f = await fixture();
      const got = await race('lock-before-complete', c => lockAccount(c,f), c => complete(c,f));
      assert.equal(got.first.account_status,'locked'); rejected(got.second,'42501'); await assertCounts(f,'prepared',0,0);
    });
    await test('completion holds account share lock until commit then account can lock', async () => {
      const f = await fixture();
      const got = await race('complete-before-lock', c => complete(c,f), c => lockAccount(c,f));
      assert.equal(got.first.state,'committed'); assert.equal(got.second.ok,true); assert.equal(got.second.value.account_status,'locked');
      await assertCounts(f,'committed',1,1); await assert.rejects(service(c=>complete(c,f)),error=>error.code==='42501');
    });
    await test('rolled-back first completion leaves waiting retry to commit exactly once', async () => {
      const f = await fixture();
      const got = await race('complete-rollback', c => complete(c,f), c => complete(c,f),false);
      assert.equal(got.second.ok,true); assert.equal(got.second.value.state,'committed'); assert.notEqual(got.second.value.evidence.id,got.first.evidence.id);
      await assertCounts(f,'committed',1,1);
    });
    assert.equal(report.tests.length,EXPECTED_CASES); assert.equal(report.barriers.length,EXPECTED_CASES);
  }
  try {
    observer = await connect('observer');
    const actual = (await observer.query("select current_database() database, session_user username, pg_backend_pid() pid, current_setting('server_version_num')::integer version_num, version() version, (select pg_get_userbyid(datdba) from pg_database where datname=current_database()) database_owner")).rows[0];
    assert.equal(actual.database,DATABASE); assert.equal(actual.username,USER); assert.equal(actual.database_owner,USER);
    assert.equal(Math.floor(actual.version_num/10000),17,'This acceptance job requires PostgreSQL 17');
    report.postgresVersion = actual.version; report.observerPid = actual.pid;
    assert.equal((await observer.query('select pg_try_advisory_lock(734021,1721) locked')).rows[0].locked,true,'Another evidence runner owns this database');
    const existing = (await observer.query("select (select count(*)::integer from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public') objects, (select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public') functions, (select count(*)::integer from pg_namespace where nspname not in('pg_catalog','information_schema','public') and nspname !~ '^pg_') schemas, (select count(*)::integer from pg_roles where rolname in('anon','authenticated','service_role')) fixture_roles, (select count(*)::integer from pg_database where not datistemplate and datname not in('postgres','qrguitar_evidence_qa')) other_databases")).rows[0];
    assert.deepEqual(existing,{objects:0,functions:0,schemas:0,fixture_roles:0,other_databases:0},'A fresh dedicated service container is required; existing objects/roles/databases are never removed');
    report.emptyFixtureVerified = true;
    const { installRepositorySchema } = await import(pathToFileURL(path.join(repo,'apps/web/scripts/security/postgres-fixture.mjs')));
    await installRepositorySchema({exec: sql => observer.query(sql),query: (sql,values) => observer.query(sql,values)},repo);
    await observer.query('alter table storage.objects add column if not exists metadata jsonb');
    await observer.query("insert into storage.buckets(id,name,public) values('instrument-media','instrument-media',false),('instrument-documents','instrument-documents',false),('service-evidence','service-evidence',false) on conflict(id) do update set public=false");
    report.baselineReadiness = await result(observer,'select qrguitar_release_readiness() result');
    assert.equal(report.baselineReadiness.ready,true,'Canonical baseline readiness failed');
    // If --evidence-sql is already an installed canonical migration, do not replay it.
    const included = sourceFiles().some(file => fs.realpathSync(path.join(repo,file)) === evidencePath);
    report.evidenceInstalledByRepositoryFixture = included;
    if (!included) await observer.query(fs.readFileSync(evidencePath,'utf8'));
    report.installedSignatures = (await observer.query("select p.oid::regprocedure::text signature, encode(sha256(convert_to(replace(p.prosrc,chr(13)||chr(10),chr(10)),'UTF8')),'hex') source_hash from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like '%service_evidence%' order by signature")).rows;
    for (const signature of ['prepare_service_evidence_upload(uuid,uuid,boolean,uuid,jsonb)','commit_service_evidence_upload(uuid,uuid,boolean,uuid)','commit_service_evidence(uuid,uuid,boolean,text,jsonb)']) {
      assert.ok(report.installedSignatures.some(row => row.signature === signature),'Missing evidence RPC: '+signature);
    }
    await tests();
    assert.deepEqual(fingerprints(),report.sourceHashes,'Repository schema sources changed during validation');
    assert.equal(hash(fs.readFileSync(evidencePath)),report.evidenceHash,'Evidence SQL changed during validation');
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
  try { await main(); } catch (error) { console.error('Evidence fixture rejected: '+String(error?.message||error)); process.exitCode=1; }
}
