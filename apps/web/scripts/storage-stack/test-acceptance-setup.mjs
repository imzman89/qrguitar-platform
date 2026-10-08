import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { applicationLoader } from './acceptance.mjs';
import { createDiagnostics, safeReport, ORIGIN, APP_ORIGIN, readinessProjection, READINESS_LABELS, configToml, assertFixtureAuthSettings } from './guards.mjs';

const repo = path.resolve(process.argv.find(arg => arg.startsWith('--repo='))?.slice(7) || path.resolve(import.meta.dirname, '../../../..'));
const require = createRequire(path.join(repo, 'package.json'));

test('fixture enables existing email sign-in while global signup and auto-confirmation stay disabled', () => {
  const sections = {}; let current;
  for (const line of configToml('qrg-storage-35293824185-1').split(/\r?\n/)) {
    const section = /^\[([^\]]+)\]$/.exec(line);
    if (section) { current = section[1]; sections[current] = {}; continue; }
    const boolean = /^(\w+) = (true|false)$/.exec(line);
    if (boolean && current) sections[current][boolean[1]] = boolean[2] === 'true';
  }
  assert.equal(sections.auth.enable_signup, false);
  assert.equal(sections['auth.email'].enable_signup, true);
  assert.equal(sections['auth.email'].enable_confirmations, true);
});

test('actual Auth settings must permit existing email users without enabling signup or auto-confirmation', () => {
  const valid = { external: { email: true }, disable_signup: true, mailer_autoconfirm: false };
  assertFixtureAuthSettings(valid);
  for (const value of [null, {}, { ...valid, external: { email: false } }, { ...valid, disable_signup: false }, { ...valid, mailer_autoconfirm: true }, { ...valid, external: { email: 'true' } }]) {
    assert.throws(() => assertFixtureAuthSettings(value));
  }
});

test('installed Auth SDK preserves the disabled-provider code while diagnostics hide request and error content', async () => {
  const { createClient } = require('@supabase/supabase-js');
  const calls = [], diagnostics = createDiagnostics();
  const client = createClient(ORIGIN, 'synthetic-not-a-credential', { auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      calls.push({ url: String(input), method: init.method, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ code: 'email_provider_disabled', msg: 'private fixture details ?token=never-output' }), { status: 422, headers: { 'content-type': 'application/json', 'x-supabase-api-version': '2024-01-01' } });
    } } });
  const result = await client.auth.signInWithPassword({ email: 'fixture@example.invalid', password: 'synthetic-only-no-network' });
  assert.equal(calls.length, 1); assert.equal(calls[0].url, ORIGIN + '/auth/v1/token?grant_type=password'); assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].body.email, 'fixture@example.invalid'); assert.equal(calls[0].body.password, 'synthetic-only-no-network');
  assert.equal(result.data.session, null); assert.equal(result.error.status, 422); assert.equal(result.error.code, 'email_provider_disabled');
  assert.throws(() => diagnostics.phase('auth-user-signin', () => { throw result.error; }, { actorKind: 'provider' }));
  assert.deepEqual(diagnostics.report().events.at(-1).failure, { classifier: 'operation-failed', authCode: 'email_provider_disabled', httpStatus: 422 });
  const report = safeReport(diagnostics.report());
  for (const forbidden of ['private fixture details', '?token=', 'fixture@example.invalid', 'synthetic-only-no-network']) assert.ok(!report.includes(forbidden));
});

test('Auth diagnostics accept only exact known codes, never arbitrary or credential-like strings', () => {
  for (const code of ['email_provider_disabled?token=private', 'private-custom-code', 'password', 'EMAIL_PROVIDER_DISABLED']) {
    const diagnostics = createDiagnostics();
    assert.throws(() => diagnostics.phase('auth-user-signin', () => { throw Object.assign(Error('private content'), { status: 422, code }); }, { actorKind: 'provider' }));
    assert.deepEqual(diagnostics.report().events.at(-1).failure, { classifier: 'operation-failed', httpStatus: 422 });
    assert.ok(!safeReport(diagnostics.report()).includes(code));
  }
});
test('actual route and protocol load with synthetic environment and forbidden network', () => {
  const savedEnv = process.env, savedFetch = globalThis.fetch;
  let networkCalls = 0;
  process.env = { NODE_ENV: 'production', NEXT_PUBLIC_SUPABASE_URL: ORIGIN, NEXT_PUBLIC_SITE_URL: APP_ORIGIN,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-not-a-credential', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-not-a-credential' };
  globalThis.fetch = async () => { networkCalls++; throw Error('Network forbidden during module-only test'); };
  try {
    const report = { loadedModules: {} }, load = applicationLoader(repo, require('typescript'), report);
    const route = load('apps/web/app/api/service-evidence/route.ts'), protocol = load('apps/web/lib/service-evidence-upload.ts');
    for (const method of ['GET', 'POST', 'DELETE']) assert.equal(typeof route[method], 'function');
    assert.equal(typeof protocol.parseServiceEvidenceUploadDiscovery, 'function');
    assert.ok(Object.keys(report.loadedModules).length > 1); assert.equal(networkCalls, 0);
    assert.strictEqual(load('apps/web/app/api/service-evidence/route.ts'), route);
  } finally { process.env = savedEnv; globalThis.fetch = savedFetch; }
});
test('fresh full repository schema needs exactly two operator-provisioned private buckets', async () => {
  const { PGlite } = require('@electric-sql/pglite-pg17');
  const { installRepositorySchema } = await import(pathToFileURL(path.join(repo, 'apps/web/scripts/security/postgres-fixture.mjs')));
  const db = new PGlite(), savedFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw Error('Network forbidden in synthetic readiness reproduction'); };
  try {
    await installRepositorySchema(db, repo);
    const readiness = async () => (await db.query('select public.qrguitar_release_readiness() value')).rows[0].value;
    const before = await readiness();
    assert.equal(before.ready, false);
    const manifest = JSON.parse(fs.readFileSync(path.join(repo, 'apps/web/scripts/release-readiness-manifest.json'), 'utf8'));
    assert.equal(manifest.releaseVersion, '2026-10-04.1', 'Review the fixed diagnostic vocabulary when the schema contract changes');
    const beforeProjection = readinessProjection(before, manifest);
    assert.equal(beforeProjection.ready, false);
    assert.equal(beforeProjection.exactCheckSet, true);
    assert.deepEqual(beforeProjection.checks.filter(row => !row.ok), [{ name: 'private_storage_buckets', ok: false }]);
    assert.deepEqual(before.checks.filter(item => !item.ok).map(item => item.name), ['private_storage_buckets']);
    assert.deepEqual((await db.query('select id, public from storage.buckets order by id')).rows, [
      { id: 'member-message-media', public: false }, { id: 'service-evidence', public: false }
    ]);
    for (const id of ['instrument-media', 'instrument-documents']) await db.query('insert into storage.buckets(id,name,public)values($1,$1,false)', [id]);
    const after = await readiness(); assert.equal(after.ready, true); assert.equal(after.checks.length, 14); assert.ok(after.checks.every(item => item.ok));
    assert.equal(after.releaseVersion, manifest.releaseVersion);
    const expectedProjection = { expectedReleaseVersion: manifest.releaseVersion, releaseVersion: manifest.releaseVersion,
      ready: true, exactCheckSet: true, checks: READINESS_LABELS.map(name => ({ name, ok: true })) };
    const projection = readinessProjection({ ...after, privateData: 'never-print-private-actor',
      checks: after.checks.map(row => ({ ...row, detail: '?token=never-print-capability' })) }, manifest);
    assert.deepEqual(projection, expectedProjection);
    const printed = safeReport(projection);
    assert.ok(!printed.includes('never-print'));
    assert.deepEqual(JSON.parse(printed), expectedProjection);
    assert.equal((await db.query('select count(*)::int n from auth.users')).rows[0].n, 0);
    assert.equal((await db.query('select count(*)::int n from storage.objects')).rows[0].n, 0);
  } finally { globalThis.fetch = savedFetch; await db.close(); }
});
test('real Supabase default grants require the permanent editor-helper permission migration', async () => {
  const { PGlite } = require('@electric-sql/pglite-pg17');
  const { installRepositorySchema } = await import(pathToFileURL(path.join(repo, 'apps/web/scripts/security/postgres-fixture.mjs')));
  const migrationName = '20260917220500_site_editor_helper_permissions.sql';
  const migrationPath = process.argv.find(arg => arg.startsWith('--permissions-sql='))?.slice(18) || path.join(repo, 'supabase/migrations', migrationName);
  const migrationSql = fs.readFileSync(migrationPath, 'utf8').replaceAll('\r\n', '\n');
  const db = new PGlite(), savedFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw Error('Network forbidden in synthetic grant regression'); };
  let scaffolded = false;
  try {
    await installRepositorySchema({ exec: async sql => {
      if (sql.replaceAll('\r\n', '\n') === migrationSql) return [];
      const result = await db.exec(sql);
      if (!scaffolded) {
        assert.ok(sql.startsWith('create role anon;')); scaffolded = true;
        // Match the real local Supabase postgres defaults before application DDL.
        await db.exec('alter default privileges for role postgres in schema public grant all on functions to anon,authenticated,service_role;alter default privileges for role postgres in schema public grant all on tables to anon,authenticated,service_role;alter default privileges for role postgres in schema public grant all on sequences to anon,authenticated,service_role;');
      }
      return result;
    } }, repo);
    for (const id of ['instrument-media', 'instrument-documents']) await db.query('insert into storage.buckets(id,name,public)values($1,$1,false)', [id]);
    const readiness = async () => (await db.query('select public.qrguitar_release_readiness() value')).rows[0].value;
    const before = await readiness(); assert.equal(before.ready, false);
    assert.deepEqual(before.checks.filter(item => !item.ok).map(item => item.name), ['blocked_function_grants']);
    const privileges = async () => (await db.query("select has_function_privilege('service_role','public.site_editor_changed_fields(jsonb,jsonb)','EXECUTE') changed,has_function_privilege('service_role','public.assign_site_editor_version()','EXECUTE') version")).rows[0];
    assert.deepEqual(await privileges(), { changed: true, version: true });
    await db.exec(migrationSql);
    assert.deepEqual(await privileges(), { changed: false, version: false });
    const after = await readiness(); assert.equal(after.ready, true); assert.ok(after.checks.every(item => item.ok));
    await db.exec(migrationSql); assert.deepEqual(await readiness(), after, 'Permanent hardening must be idempotent');
  } finally { globalThis.fetch = savedFetch; await db.close(); }
});
test('schema diagnostics expose only whitelisted filename/hash and SQLSTATE', async () => {
  const diagnostics = createDiagnostics(), error = Object.assign(Error('private SQL and actor payload'), { code: '42501', detail: 'private data', status: 403 });
  await assert.rejects(diagnostics.phase('schema-apply', async () => { throw error; }, { source: '20260917220000_service_evidence_recovery.sql', sha256: 'a'.repeat(64) }));
  const failure = diagnostics.report().events.at(-1); assert.equal(failure.failure.sqlState, '42501'); assert.equal(failure.failure.httpStatus, 403);
  const report = safeReport(diagnostics.report()); assert.ok(!report.includes('private SQL')); assert.ok(!report.includes('private data'));
});
test('arbitrary diagnostic details and paths cannot leak into setup output', () => {
  for (const details of [{ source: '../private.sql' }, { source: 'customer-notes.sql' }, { sha256: 'private value' }, { actorKind: 'email@example.test' }, { bucket: 'customer-bucket' }, { caseIndex: 0 }, { query: 'private query' }]) {
    const diagnostics = createDiagnostics(); assert.throws(() => diagnostics.phase('schema-apply', () => {}, details)); assert.equal(diagnostics.report().events.length, 0);
  }
});
test('unsafe provider status/code fields remain absent from diagnostics', () => {
  const diagnostics = createDiagnostics();
  assert.throws(() => diagnostics.phase('auth-user-create', () => { throw Object.assign(Error('credential-like-message'), { code: 'arbitrary-private-code', status: 'private-status' }); }, { actorKind: 'provider' }));
  assert.deepEqual(diagnostics.report().events.at(-1).failure, { classifier: 'operation-failed' });
});
test('HTTP status assertions retain safe numeric expected and actual values', () => {
  const diagnostics = createDiagnostics();
  assert.throws(() => diagnostics.phase('acceptance-case', () => assert.equal(503, 200), { caseIndex: 1 }));
  const failure = diagnostics.report().events.at(-1).failure;
  assert.deepEqual(failure, { classifier: 'guard-rejected', actualType: 'number', expectedType: 'number', actualScalar: 503, expectedScalar: 200 });
  safeReport(diagnostics.report());
});
test('assertions never serialize strings or objects but retain explicit safe service status', () => {
  const diagnostics = createDiagnostics();
  assert.throws(() => diagnostics.phase('acceptance-case', () => assert.equal('?token=private-capability', 'private-secret'), { caseIndex: 2 }));
  assert.throws(() => diagnostics.phase('acceptance-case', () => assert.equal({ status: 403, code: '42501', message: 'private payload' }, null), { caseIndex: 3 }));
  const failures = diagnostics.report().events.filter(row => row.event === 'fail').map(row => row.failure);
  assert.equal(failures[0].actualScalar, undefined); assert.equal(failures[0].expectedScalar, undefined);
  assert.equal(failures[1].httpStatus, 403); assert.equal(failures[1].sqlState, '42501'); assert.equal(failures[1].expectedScalar, null);
  const report = safeReport(diagnostics.report()); assert.ok(!report.includes('private'));
});
const readinessManifest = () => ({ releaseVersion: '2026-09-17.6', checks: [...READINESS_LABELS] });
test('readiness projection identifies exact failed flags without weakening assertions', () => {
  const value = { ready: false, releaseVersion: '2026-09-17.6', checks: READINESS_LABELS.map(name => ({ name, ok: name !== 'function_security' })) };
  const projection = readinessProjection(value, readinessManifest());
  assert.equal(projection.ready, false); assert.equal(projection.exactCheckSet, true);
  assert.deepEqual(projection.checks.filter(row => !row.ok), [{ name: 'function_security', ok: false }]);
  assert.equal(projection.releaseVersion, '2026-09-17.6'); safeReport(projection);
});
test('readiness projection excludes private RPC fields and arbitrary version/check labels', () => {
  const value = { ready: 'private', releaseVersion: '?token=private', privateData: 'never print', checks: [
    { name: 'private_storage_buckets', ok: true, detail: 'never print' }, { name: 'private_storage_buckets', ok: true },
    { name: 'private-actor-label', ok: true }, { name: 'function_security', ok: '?token=private' }
  ] };
  const projection = readinessProjection(value, readinessManifest());
  assert.equal(projection.ready, null); assert.equal(projection.releaseVersion, 'unexpected'); assert.equal(projection.exactCheckSet, false);
  assert.ok(projection.checks.every(row => row.ok === null)); assert.equal(projection.checks.length, 14);
  const printed = safeReport(projection); assert.ok(!printed.includes('never print')); assert.ok(!printed.includes('private-actor-label'));
});
test('readiness projection rejects a manifest outside the fixed diagnostic vocabulary', () => {
  assert.throws(() => readinessProjection({}, { releaseVersion: '2026-09-17.6', checks: ['private-label'] }));
  assert.throws(() => readinessProjection({}, { ...readinessManifest(), releaseVersion: 'private-version' }));
});

test('current manifest accepts only reviewed diagnostic values and rejects future or private versions', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(repo, 'apps/web/scripts/release-readiness-manifest.json'), 'utf8'));
  for (const releaseVersion of ['2026-09-17.11', '2026-09-17.12', '2026-09-17.14', '?token=private-version']) {
    assert.throws(() => readinessProjection({}, { ...manifest, releaseVersion }));
    const projected = readinessProjection({ releaseVersion, ready: '?token=private-ready', privateData: 'never-print',
      checks: [{ name: 'private-actor-label', ok: true }, { name: 'function_security', ok: '?token=private-flag' }] }, manifest);
    assert.equal(projected.expectedReleaseVersion, manifest.releaseVersion);
    assert.equal(projected.releaseVersion, 'unexpected');
    assert.equal(projected.ready, null);
    assert.equal(projected.exactCheckSet, false);
    assert.deepEqual(projected.checks, READINESS_LABELS.map(name => ({ name, ok: null })));
    const printed = safeReport(projected);
    assert.ok(!printed.includes(releaseVersion));
    assert.ok(!printed.includes('never-print'));
    assert.ok(!printed.includes('private-actor-label'));
  }
});
