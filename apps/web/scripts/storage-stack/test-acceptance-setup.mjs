import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { applicationLoader } from './acceptance.mjs';
import { createDiagnostics, safeReport, ORIGIN, APP_ORIGIN } from './guards.mjs';

const repo = path.resolve(process.argv.find(arg => arg.startsWith('--repo='))?.slice(7) || path.resolve(import.meta.dirname, '../../../..'));
const require = createRequire(path.join(repo, 'package.json'));
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
  const { PGlite } = require('@electric-sql/pglite');
  const { installRepositorySchema } = await import(pathToFileURL(path.join(repo, 'apps/web/scripts/security/postgres-fixture.mjs')));
  const db = new PGlite(), savedFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw Error('Network forbidden in synthetic readiness reproduction'); };
  try {
    await installRepositorySchema(db, repo);
    const readiness = async () => (await db.query('select public.qrguitar_release_readiness() value')).rows[0].value;
    const before = await readiness();
    assert.equal(before.ready, false);
    assert.deepEqual(before.checks.filter(item => !item.ok).map(item => item.name), ['private_storage_buckets']);
    assert.deepEqual((await db.query('select id from storage.buckets order by id')).rows.map(row => row.id), ['service-evidence']);
    for (const id of ['instrument-media', 'instrument-documents']) await db.query('insert into storage.buckets(id,name,public)values($1,$1,false)', [id]);
    const after = await readiness(); assert.equal(after.ready, true); assert.equal(after.checks.length, 14); assert.ok(after.checks.every(item => item.ok));
    assert.equal(after.releaseVersion, JSON.parse(fs.readFileSync(path.join(repo, 'apps/web/scripts/release-readiness-manifest.json'), 'utf8')).releaseVersion);
    assert.equal((await db.query('select count(*)::int n from auth.users')).rows[0].n, 0);
    assert.equal((await db.query('select count(*)::int n from storage.objects')).rows[0].n, 0);
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
