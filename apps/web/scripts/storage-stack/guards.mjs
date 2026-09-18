import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';

export const MARKER = 'qrguitar-disposable-storage-stack-v1';
export const CLI_VERSION = '2.117.0';
export const PORTS = Object.freeze({ api: 55431, db: 55432, shadow: 55430, tls: 55439, app: 55440 });
export const ORIGIN = `https://127.0.0.1:${PORTS.tls}`;
export const APP_ORIGIN = `https://127.0.0.1:${PORTS.app}`;
export function context(env, platform = process.platform) {
  assert.equal(platform, 'linux', 'Only disposable Linux GitHub runners are supported');
  assert.equal(env.GITHUB_ACTIONS, 'true'); assert.equal(env.CI, 'true');
  assert.equal(env.QRGUITAR_STORAGE_STACK_FIXTURE, MARKER);
  assert.match(env.GITHUB_RUN_ID || '', /^[1-9][0-9]*$/);
  assert.match(env.GITHUB_RUN_ATTEMPT || '', /^[1-9][0-9]*$/);
  assert.ok(env.RUNNER_TEMP && path.isAbsolute(env.RUNNER_TEMP));
  assert.ok(env.GITHUB_WORKSPACE && path.isAbsolute(env.GITHUB_WORKSPACE));
  for (const [key, value] of Object.entries(env)) {
    if (!value) continue;
    assert.ok(!/^(SUPABASE_|NEXT_PUBLIC_SUPABASE_|QRGUITAR_(?:OWNER|ADMIN)_EMAILS|DATABASE_URL$|PG(?:HOST|PORT|USER|PASSWORD|DATABASE|SERVICE|SERVICEFILE)$|STRIPE_|DOCKER_(?:HOST|CONTEXT|TLS_VERIFY|CERT_PATH|CONFIG)$)/.test(key), 'Application, provider or remote Docker configuration is forbidden in the fixture environment');
  }
  assert.ok(!env.NODE_TLS_REJECT_UNAUTHORIZED && !env.NODE_EXTRA_CA_CERTS && !env.NODE_OPTIONS, 'External TLS/Node overrides are forbidden');
  const project = `qrguitar-storage-acceptance-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`;
  const root = path.join(env.RUNNER_TEMP, project);
  assert.notEqual(path.resolve(root), path.resolve(env.GITHUB_WORKSPACE));
  return { project, network: `${project}-loopback`, root, repo: env.GITHUB_WORKSPACE, marker: MARKER };
}
export function verifyDirectory(ctx) {
  const st = fs.lstatSync(ctx.root); assert.ok(st.isDirectory() && !st.isSymbolicLink());
  assert.equal(fs.realpathSync(ctx.root), path.resolve(ctx.root));
  assert.equal(st.mode & 0o077, 0, 'Fixture root must be private');
  const stamp = JSON.parse(fs.readFileSync(path.join(ctx.root, 'fixture.json'), 'utf8'));
  assert.deepEqual(stamp, { marker: MARKER, project: ctx.project, network: ctx.network });
  assert.equal(fs.existsSync(path.join(ctx.root, 'supabase/.temp/project-ref')), false, 'A linked project is forbidden');
  assert.equal(fs.existsSync(path.join(ctx.root, '.env')), false); assert.equal(fs.existsSync(path.join(ctx.root, '.env.local')), false);
}
export function exactApiUrl(raw, prefix = '/') {
  assert.equal(typeof raw, 'string');
  const url = new URL(raw);
  assert.equal(url.origin, ORIGIN, 'Only the exact TLS fixture origin is allowed');
  assert.ok(!url.username && !url.password && !url.hash);
  assert.ok(url.pathname.startsWith(prefix) && !raw.includes('\\'));
  return url;
}
export function validateStatus(status) {
  assert.ok(status && typeof status === 'object');
  assert.equal(status.API_URL, `http://127.0.0.1:${PORTS.api}`);
  const db = new URL(status.DB_URL);
  assert.equal(db.protocol, 'postgresql:'); assert.equal(db.hostname, '127.0.0.1');
  assert.equal(db.port, String(PORTS.db)); assert.equal(db.pathname, '/postgres');
  assert.equal(db.username, 'postgres'); assert.equal(db.password, 'postgres');
  assert.equal(db.search, ''); assert.equal(db.hash, '');
  for (const [key, role] of [['ANON_KEY', 'anon'], ['SERVICE_ROLE_KEY', 'service_role']]) {
    assert.equal(typeof status[key], 'string'); assert.equal(status[key].split('.').length, 3);
    assert.equal(JSON.parse(Buffer.from(status[key].split('.')[1], 'base64url').toString()).role, role);
  }
  return { host: '127.0.0.1', port: PORTS.db, user: 'postgres', password: 'postgres', database: 'postgres', ssl: false, connectionTimeoutMillis: 5000, query_timeout: 120000 };
}
export function validateNetwork(network, ctx, empty = false) {
  assert.equal(network.Name, ctx.network); assert.equal(network.Driver, 'bridge');
  assert.equal(network.Labels?.['qrguitar.fixture'], MARKER);
  assert.equal(network.Options?.['com.docker.network.bridge.host_binding_ipv4'], '127.0.0.1');
  if (empty) assert.equal(Object.keys(network.Containers || {}).length, 0);
}
export function validateContainers(containers, ctx) {
  assert.ok(containers.length >= 5, 'Auth, Storage, PostgREST, Kong and PostgreSQL must exist');
  const names = containers.map(row => row.Name.replace(/^\//, ''));
  for (const kind of ['db', 'auth', 'storage', 'rest', 'kong']) assert.ok(names.includes(`supabase_${kind}_${ctx.project}`), `Missing ${kind} container`);
  for (const row of containers) {
    assert.ok(row.Name.endsWith('_' + ctx.project)); assert.equal(row.State?.Running, true);
    assert.ok(row.NetworkSettings?.Networks?.[ctx.network]);
    for (const bindings of Object.values(row.NetworkSettings?.Ports || {})) for (const binding of bindings || []) {
      assert.equal(binding.HostIp, '127.0.0.1', 'Published stack ports must bind only IPv4 loopback');
      assert.ok(/^[0-9]+$/.test(binding.HostPort));
    }
  }
}
export function configToml(project) {
  assert.match(project, /^qrguitar-storage-acceptance-[1-9][0-9]*-[1-9][0-9]*$/);
  return `project_id = "${project}"
[api]
enabled = true
port = ${PORTS.api}
schemas = ["public", "graphql_public"]
extra_search_path = ["public", "extensions"]
max_rows = 1000
[db]
port = ${PORTS.db}
shadow_port = ${PORTS.shadow}
major_version = 17
[db.seed]
enabled = false
[db.pooler]
enabled = false
[studio]
enabled = false
[local_smtp]
enabled = false
[storage]
enabled = true
file_size_limit = "20MiB"
[storage.image_transformation]
enabled = false
[storage.vector]
enabled = false
[auth]
enabled = true
site_url = "${APP_ORIGIN}"
additional_redirect_urls = []
enable_signup = false
[auth.email]
enable_signup = false
enable_confirmations = true
[analytics]
enabled = false
[edge_runtime]
enabled = false
`;
}
export function safeReport(report) {
  // Output is deliberately constructed from fixed case labels and scalar facts.
  const text = JSON.stringify(report, null, 2);
  assert.ok(!/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|[?&]token=|BEGIN (?:RSA |EC )?PRIVATE KEY|service_role_key|anon_key|access_token|refresh_token|password/i.test(text), 'Report contains credential-like material');
  return text + '\n';
}
