import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';

export const MARKER = 'qrguitar-disposable-storage-stack-v1';
export const CLI_VERSION = '2.117.0';
export const PORTS = Object.freeze({ api: 55431, db: 55432, shadow: 55430, tls: 55439, app: 55440 });
export const ORIGIN = `https://127.0.0.1:${PORTS.tls}`;
export const APP_ORIGIN = `https://127.0.0.1:${PORTS.app}`;
const COMMAND_CLASSES = new Set(['docker', 'supabase-cli', 'openssl', 'acceptance-child']);
const SIGNALS = new Set(['SIGTERM', 'SIGKILL', 'SIGINT', 'SIGABRT', 'SIGSEGV', 'SIGPIPE']);
const SPAWN_CODES = new Set(['ENOENT', 'EACCES', 'EPERM', 'ETIMEDOUT', 'ENOBUFS', 'ECONNREFUSED']);
export const DIAGNOSTIC_PHASES = Object.freeze([
  'context', 'mode', 'fixture-absent', 'repository-path', 'fresh-containers', 'fresh-network', 'fixture-create',
  'cli-version', 'cli-init', 'config-write', 'fixture-validate', 'network-create', 'network-validate-empty',
  'cli-start', 'network-validate-running', 'containers-inspect', 'containers-validate', 'cli-status', 'status-parse',
  'status-validate', 'status-save', 'tls-certificate', 'proxy-listen', 'infrastructure-save', 'acceptance-child',
  'proxy-close', 'cleanup-validate', 'cleanup-config', 'cleanup-cli-stop', 'cleanup-network-list',
  'cleanup-network-validate', 'cleanup-network-remove', 'cleanup-directory-remove'
]);
export function commandFailure(command, result) {
  assert.ok(COMMAND_CLASSES.has(command), 'Unexpected diagnostic command family');
  // Raw output is examined only against these fixed patterns. Never return a
  // substring, command argument, exception message, URL, environment, or buffer.
  const output = String(result.stderr || '') + '\n' + String(result.stdout || '');
  let classifier = 'unclassified';
  if (result.error?.code === 'ETIMEDOUT') classifier = 'command-timeout';
  else if (result.error?.code === 'ENOENT') classifier = 'executable-missing';
  else if (result.error?.code === 'ENOBUFS') classifier = 'output-limit';
  else if (/cannot connect to the docker daemon|is the docker daemon running|error during connect/i.test(output)) classifier = 'docker-unavailable';
  else if (/address already in use|port is already allocated|ports are not available|bind.*failed/i.test(output)) classifier = 'port-conflict';
  else if (/no space left on device/i.test(output)) classifier = 'disk-full';
  else if (/out of memory|cannot allocate memory|oomkilled/i.test(output)) classifier = 'memory-exhausted';
  else if (/failed to parse config|invalid config|failed to decode|unmarshal|unknown (?:field|key)|unsupported.*config/i.test(output)) classifier = 'config-invalid';
  else if (/unknown flag|unknown command|invalid.*exclude|unknown service/i.test(output)) classifier = 'cli-argument-invalid';
  else if (/manifest unknown|pull access denied|toomanyrequests|failed to pull|error.*pulling|image.*not found/i.test(output)) classifier = 'image-fetch-failed';
  else if (/unhealthy|health.?check|container.*not ready|failed to start.*container/i.test(output)) classifier = 'service-unhealthy';
  else if (/network.*not found|network.*already exists|endpoint.*already exists/i.test(output)) classifier = 'network-conflict';
  else if (/certificate|x509|unable to verify|ssl.*error/i.test(output)) classifier = 'tls-failed';
  else if (/permission denied|operation not permitted/i.test(output)) classifier = 'permission-denied';
  else if (/timed? out|ETIMEDOUT|deadline exceeded/i.test(output)) classifier = 'dependency-timeout';
  else if (/ENOTFOUND|EAI_AGAIN|connection refused|ECONNREFUSED|could not resolve/i.test(output)) classifier = 'dependency-unreachable';
  return Object.freeze({ command, exitCode: Number.isInteger(result.status) && result.status >= 0 && result.status <= 255 ? result.status : null,
    signal: SIGNALS.has(result.signal) ? result.signal : result.signal ? 'other' : null,
    spawnCode: SPAWN_CODES.has(result.error?.code) ? result.error.code : result.error?.code ? 'other' : null, classifier });
}
export function createDiagnostics(write = () => {}) {
  const records = [], allowed = new Set(DIAGNOSTIC_PHASES), diagnostics = new WeakMap();
  const record = value => { safeReport(value); records.push(value); write(value); };
  const failure = error => diagnostics.get(error) || { classifier: error instanceof assert.AssertionError ? 'guard-rejected' : error instanceof SyntaxError ? 'invalid-json' : 'operation-failed' };
  return {
    commandError(command, result) { const error = new Error('Fixture command failed'); diagnostics.set(error, commandFailure(command, result)); return error; },
    phase(name, run) {
      assert.ok(allowed.has(name), 'Unknown diagnostic phase');
      const started = Date.now(); record({ phase: name, event: 'start' });
      const pass = value => { record({ phase: name, event: 'pass', elapsedMs: Date.now() - started }); return value; };
      const fail = error => { record({ phase: name, event: 'fail', elapsedMs: Date.now() - started, failure: failure(error) }); throw error; };
      try { const result = run(); return result && typeof result.then === 'function' ? result.then(pass, fail) : pass(result); } catch (error) { return fail(error); }
    },
    report() { return { schemaVersion: 1, scope: 'isolated-stack-infrastructure-diagnostics', events: structuredClone(records) }; }
  };
}
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
  // CLI 2.117 normalizes config-derived IDs to at most 40 characters, but
  // explicit stop --project-id uses the raw value. Never let them diverge.
  const project = `qrg-storage-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`;
  assert.ok(project.length <= 40, 'Fixture project must fit the CLI project identity limit');
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
  assert.match(project, /^qrg-storage-[1-9][0-9]*-[1-9][0-9]*$/);
  assert.ok(project.length <= 40, 'Fixture project must fit the CLI project identity limit');
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
