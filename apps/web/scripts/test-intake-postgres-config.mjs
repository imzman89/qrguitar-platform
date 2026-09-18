// Offline guard tests: do not load pg, connect, or modify a database.
import assert from 'node:assert/strict';
import test from 'node:test';
import { FIXTURE_MARKER, validateFixtureConnection, main } from './test-intake-postgres-concurrency.mjs';
const url = 'postgresql://qrguitar_intake_fixture:ci_fixture_only_password@127.0.0.1:54321/qrguitar_intake_qa';
const env = patch => ({QRGUITAR_INTAKE_FIXTURE:FIXTURE_MARKER,QRGUITAR_INTAKE_DATABASE_URL:url,...patch});
for (const host of ['localhost','127.0.0.1']) test('fixture '+host+' resolves only to loopback', () => {
  const config = validateFixtureConnection(env({QRGUITAR_INTAKE_DATABASE_URL:url.replace('127.0.0.1',host)}));
  assert.deepEqual(config,{host:'127.0.0.1',port:54321,user:'qrguitar_intake_fixture',password:'ci_fixture_only_password',database:'qrguitar_intake_qa',ssl:false,connectionTimeoutMillis:5000,query_timeout:25000});
});
for (const marker of [undefined,'','true','isolated-postgresql-17','isolated-intake-postgresql-18']) test('reject wrong marker '+String(marker), () => {
  assert.throws(() => validateFixtureConnection(env({QRGUITAR_INTAKE_FIXTURE:marker})),/fixture marker/);
});
for (const raw of [undefined,'','not a URL']) test('reject missing or malformed URL '+String(raw), () => {
  assert.throws(() => validateFixtureConnection(env({QRGUITAR_INTAKE_DATABASE_URL:raw})));
});
for (const host of ['db.supabase.co','localhost.evil.test','127.0.0.2','0.0.0.0','[::1]','postgres','example.com']) test('reject nonallowlisted host '+host, () => {
  assert.throws(() => validateFixtureConnection(env({QRGUITAR_INTAKE_DATABASE_URL:url.replace('127.0.0.1',host)})),/Only localhost/);
});
for (const db of ['postgres','qrguitar_production','qrguitar_intake_qa_copy','qrguitar_intake_qa/extra','qrguitar%5fintake%5fqa','']) test('reject database '+db, () => {
  assert.throws(() => validateFixtureConnection(env({QRGUITAR_INTAKE_DATABASE_URL:url.replace('/qrguitar_intake_qa','/'+db)})),/dedicated/);
});
for (const suffix of ['?host=remote.example','?sslmode=require','?options=-csearch_path=private','#fragment']) test('reject overrides '+suffix, () => {
  assert.throws(() => validateFixtureConnection(env({QRGUITAR_INTAKE_DATABASE_URL:url+suffix})),/forbidden/);
});
test('never uses generic DATABASE_URL or billing fixture environment', () => {
  assert.throws(() => validateFixtureConnection({QRGUITAR_INTAKE_FIXTURE:FIXTURE_MARKER,DATABASE_URL:url,QRGUITAR_CONCURRENCY_DATABASE_URL:url}),/QRGUITAR_INTAKE_DATABASE_URL/);
});
test('reject non-PostgreSQL scheme', () => assert.throws(() => validateFixtureConnection(env({QRGUITAR_INTAKE_DATABASE_URL:url.replace('postgresql:','https:')})),/PostgreSQL/));
test('reject ordinary postgres bootstrap user', () => assert.throws(() => validateFixtureConnection(env({QRGUITAR_INTAKE_DATABASE_URL:url.replace('qrguitar_intake_fixture:','postgres:')})),/bootstrap role/));
test('reject missing or short fixture password', () => {
  for (const password of ['','tiny']) assert.throws(() => validateFixtureConnection(env({QRGUITAR_INTAKE_DATABASE_URL:url.replace('ci_fixture_only_password',password)})),/fixture password/);
});
test('main fails before filesystem/dependency/connection for absent marker', async () => {
  await assert.rejects(main(['--repo','/not-a-repository'],{QRGUITAR_INTAKE_DATABASE_URL:url}),/fixture marker/);
});
test('main requires exact explicit source options before reading files', async () => {
  await assert.rejects(main([],env()),/explicitly select/);
  await assert.rejects(main(['--repo'],env()),/requires a value/);
  await assert.rejects(main(['--unknown','x'],env()),/Unknown/);
  await assert.rejects(main(['--repo','x','--repo','y'],env()),/duplicate/);
  await assert.rejects(main(['--repo','x','--intake-sql','y'],env()),/fulfillment-sql/);
});
