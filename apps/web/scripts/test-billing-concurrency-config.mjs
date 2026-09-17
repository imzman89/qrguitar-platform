// These guard tests open no database connection and do not load the pg driver.
import assert from 'node:assert/strict';
import test from 'node:test';
import { FIXTURE_MARKER, validateFixtureConnection, main } from './test-billing-concurrency.mjs';

const url = 'postgresql://qrguitar_billing_fixture:ci_fixture_only_password@127.0.0.1:54321/qrguitar_billing_qa';
const environment = patch => ({ QRGUITAR_CONCURRENCY_FIXTURE: FIXTURE_MARKER, QRGUITAR_CONCURRENCY_DATABASE_URL: url, ...patch });

for (const host of ['localhost', '127.0.0.1']) test(`explicit local fixture ${host} resolves to fixed loopback`, () => {
  const config = validateFixtureConnection(environment({ QRGUITAR_CONCURRENCY_DATABASE_URL: url.replace('127.0.0.1', host) }));
  assert.equal(config.host, '127.0.0.1'); assert.equal(config.database, 'qrguitar_billing_qa'); assert.equal(config.user, 'qrguitar_billing_fixture');
  assert.equal(config.port, 54321); assert.equal(config.ssl, false); assert.equal(config.connectionTimeoutMillis, 5000); assert.equal(config.query_timeout, 25000);
});
for (const marker of [undefined, '', 'true', 'isolated-postgresql-18']) test(`missing or wrong fixture marker ${String(marker)} rejects`, () => {
  assert.throws(() => validateFixtureConnection(environment({ QRGUITAR_CONCURRENCY_FIXTURE: marker })), /fixture marker/);
});
for (const connection of [undefined, '', 'not a URL']) test(`missing/malformed fixture connection ${String(connection)} rejects`, () => {
  assert.throws(() => validateFixtureConnection(environment({ QRGUITAR_CONCURRENCY_DATABASE_URL: connection })));
});
for (const host of ['db.supabase.co', 'localhost.evil.test', '127.0.0.2', '0.0.0.0', '[::1]', 'postgres', 'example.com']) test(`nonallowlisted host ${host} rejects`, () => {
  assert.throws(() => validateFixtureConnection(environment({ QRGUITAR_CONCURRENCY_DATABASE_URL: url.replace('127.0.0.1', host) })), /Only localhost/);
});
for (const database of ['postgres', 'qrguitar_production', 'qrguitar_billing_qa_copy', 'qrguitar_billing_qa/extra', 'qrguitar%5fbilling%5fqa', '']) test(`database ${database} cannot target fixture`, () => {
  assert.throws(() => validateFixtureConnection(environment({ QRGUITAR_CONCURRENCY_DATABASE_URL: url.replace('/qrguitar_billing_qa', '/' + database) })), /dedicated/);
});
for (const suffix of ['?host=remote.example', '?sslmode=require', '?options=-csearch_path=private', '#fragment']) test(`connection override ${suffix} rejects`, () => {
  assert.throws(() => validateFixtureConnection(environment({ QRGUITAR_CONCURRENCY_DATABASE_URL: url + suffix })), /forbidden/);
});
test('generic DATABASE_URL is never an implicit fallback', () => {
  assert.throws(() => validateFixtureConnection({ QRGUITAR_CONCURRENCY_FIXTURE: FIXTURE_MARKER, DATABASE_URL: url }), /QRGUITAR_CONCURRENCY_DATABASE_URL/);
});
test('non-PostgreSQL scheme rejects', () => {
  assert.throws(() => validateFixtureConnection(environment({ QRGUITAR_CONCURRENCY_DATABASE_URL: url.replace('postgresql:', 'https:') })), /PostgreSQL/);
});
test('general postgres bootstrap user cannot target fixture', () => {
  assert.throws(() => validateFixtureConnection(environment({ QRGUITAR_CONCURRENCY_DATABASE_URL: url.replace('qrguitar_billing_fixture:', 'postgres:') })), /bootstrap role/);
});
test('missing/short fixture password rejects', () => {
  for (const password of ['', 'tiny']) assert.throws(() => validateFixtureConnection(environment({ QRGUITAR_CONCURRENCY_DATABASE_URL: url.replace('ci_fixture_only_password', password) })), /fixture password/);
});
test('main refuses absent marker before dependency/filesystem/database setup', async () => {
  await assert.rejects(main(['--repo', '/not-a-real-repository'], { QRGUITAR_CONCURRENCY_DATABASE_URL: url }), /fixture marker/);
});
