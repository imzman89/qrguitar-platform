import assert from 'node:assert/strict';
import { test } from 'node:test';
import { context, validateStatus, validateNetwork, validateContainers, exactApiUrl, configToml, safeReport, MARKER, ORIGIN } from './guards.mjs';

const env = { GITHUB_ACTIONS: 'true', CI: 'true', QRGUITAR_STORAGE_STACK_FIXTURE: MARKER,
  GITHUB_RUN_ID: '12345', GITHUB_RUN_ATTEMPT: '1', RUNNER_TEMP: '/tmp/fixture-runner', GITHUB_WORKSPACE: '/tmp/fixture-repo' };
const fixture = () => context(env, 'linux');
const jwt = role => 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify({ role })).toString('base64url') + '.synthetic';
const status = () => ({ API_URL: 'http://127.0.0.1:55431', DB_URL: 'postgresql://postgres:postgres@127.0.0.1:55432/postgres', ANON_KEY: jwt('anon'), SERVICE_ROLE_KEY: jwt('service_role') });
test('explicit isolated context produces exact per-run project and paths', () => {
  const ctx = fixture(); assert.equal(ctx.project, 'qrguitar-storage-acceptance-12345-1'); assert.ok(ctx.root.endsWith(ctx.project));
});
for (const [name, change] of Object.entries({ noMarker: { QRGUITAR_STORAGE_STACK_FIXTURE: '' }, wrongMarker: { QRGUITAR_STORAGE_STACK_FIXTURE: 'production' }, noActions: { GITHUB_ACTIONS: '' }, noCI: { CI: '' }, runTraversal: { GITHUB_RUN_ID: '../prod' }, badAttempt: { GITHUB_RUN_ATTEMPT: '0' }, relativeTemp: { RUNNER_TEMP: 'relative' }, relativeRepo: { GITHUB_WORKSPACE: 'relative' } })) {
  test('rejects context ' + name, () => assert.throws(() => context({ ...env, ...change }, 'linux')));
}
for (const key of ['SUPABASE_ACCESS_TOKEN', 'SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'QRGUITAR_ADMIN_EMAILS', 'DATABASE_URL', 'PGHOST', 'PGSERVICEFILE', 'STRIPE_SECRET_KEY', 'DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH', 'DOCKER_CONFIG', 'NODE_TLS_REJECT_UNAUTHORIZED', 'NODE_OPTIONS', 'NODE_EXTRA_CA_CERTS']) {
  test('rejects inherited external configuration ' + key, () => assert.throws(() => context({ ...env, [key]: 'forbidden' }, 'linux')));
}
test('rejects a workstation runtime even with a copied CI marker', () => assert.throws(() => context(env, 'win32')));
test('valid status yields only the exact disposable PostgreSQL connection', () => assert.deepEqual(validateStatus(status()), { host: '127.0.0.1', port: 55432, user: 'postgres', password: 'postgres', database: 'postgres', ssl: false, connectionTimeoutMillis: 5000, query_timeout: 120000 }));
for (const [name, replacement] of Object.entries({ hosted: 'postgresql://postgres:postgres@db.production.supabase.co:55432/postgres', defaultPort: 'postgresql://postgres:postgres@127.0.0.1:5432/postgres', wrongDatabase: 'postgresql://postgres:postgres@127.0.0.1:55432/customer', query: 'postgresql://postgres:postgres@127.0.0.1:55432/postgres?host=remote', fragment: 'postgresql://postgres:postgres@127.0.0.1:55432/postgres#remote', wrongRole: 'postgresql://admin:postgres@127.0.0.1:55432/postgres' })) {
  test('rejects status connection ' + name, () => assert.throws(() => validateStatus({ ...status(), DB_URL: replacement })));
}
test('rejects hosted or differently bound API from CLI status', () => assert.throws(() => validateStatus({ ...status(), API_URL: 'https://example.supabase.co' })));
test('rejects swapped local credential roles', () => assert.throws(() => validateStatus({ ...status(), SERVICE_ROLE_KEY: jwt('authenticated') })));
test('exact TLS destination accepted without disabling validation', () => assert.equal(exactApiUrl(ORIGIN + '/storage/v1/object/sign/bucket/path?token=synthetic').origin, ORIGIN));
for (const value of ['http://127.0.0.1:55439/auth/v1/user', 'https://127.0.0.1:443/auth/v1/user', 'https://example.supabase.co/storage/v1/object', 'https://user@127.0.0.1:55439/auth/v1/user', ORIGIN + '/auth/v1/user#hidden', ORIGIN + '\\evil']) {
  test('rejects unsafe network destination ' + value.replace(/https?:\/\//, ''), () => assert.throws(() => exactApiUrl(value)));
}
const network = () => ({ Name: fixture().network, Driver: 'bridge', Labels: { 'qrguitar.fixture': MARKER }, Options: { 'com.docker.network.bridge.host_binding_ipv4': '127.0.0.1' }, Containers: {} });
test('exact empty marker-bound network passes', () => validateNetwork(network(), fixture(), true));
for (const row of [{ ...network(), Name: 'existing-network' }, { ...network(), Driver: 'host' }, { ...network(), Labels: {} }, { ...network(), Options: {} }, { ...network(), Containers: { foreign: {} } }]) {
  test('network guard rejects an unsafe or reused resource ' + JSON.stringify(row), () => assert.throws(() => validateNetwork(row, fixture(), true)));
}
const containers = () => ['db', 'auth', 'storage', 'rest', 'kong'].map(kind => ({ Name: '/supabase_' + kind + '_' + fixture().project, State: { Running: true }, NetworkSettings: { Networks: { [fixture().network]: {} }, Ports: { '1/tcp': [{ HostIp: '127.0.0.1', HostPort: '55431' }] } } }));
test('all five real stack services bound to loopback pass', () => validateContainers(containers(), fixture()));
for (const ip of ['0.0.0.0', '::', '192.168.1.20', '']) {
  test('container guard rejects published host binding ' + JSON.stringify(ip), () => { const rows = containers(); rows[0].NetworkSettings.Ports['1/tcp'][0].HostIp = ip; assert.throws(() => validateContainers(rows, fixture())); });
}
test('container guard rejects missing service', () => assert.throws(() => validateContainers(containers().slice(1), fixture())));
test('container guard rejects unrelated project', () => { const rows = containers(); rows[0].Name = '/supabase_db_production'; assert.throws(() => validateContainers(rows, fixture())); });
test('generated configuration cannot interpolate a different project', () => assert.throws(() => configToml('qvoruycxxrbarlafvhbi')));
test('generated config disables external providers and seeding and selects PG17', () => {
  const config = configToml(fixture().project); assert.match(config, /major_version = 17/); assert.match(config, /\[db.seed\]\nenabled = false/); assert.ok(!config.includes('env(')); assert.ok(!config.includes('supabase.co'));
});
test('report retains only scalar evidence', () => assert.equal(JSON.parse(safeReport({ complete: true, tests: [{ name: 'bytes hash', ok: true }] })).complete, true));
for (const value of [jwt('service_role'), '?token=signed-capability', 'access_token', '-----BEGIN PRIVATE KEY-----']) {
  test('report rejects credential-like material ' + value.slice(0, 8), () => assert.throws(() => safeReport({ value })));
}
