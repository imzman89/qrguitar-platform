import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { context, verifyDirectory, validateNetwork, validateContainers, validateStatus, configToml, MARKER, CLI_VERSION, PORTS, ORIGIN, safeReport } from './guards.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
function command(executable, args, options = {}) {
  if (executable === 'docker') args = ['--host', 'unix:///var/run/docker.sock', ...args];
  const result = spawnSync(executable, args, { encoding: 'utf8', timeout: 600000, maxBuffer: 24 * 1024 * 1024, ...options });
  if (result.status !== 0) throw new Error('Fixture command failed: ' + executable + ' ' + args[0]);
  return result.stdout.trim(); // Never print command output: CLI start/status contain local credentials.
}
function cli(ctx, args) {
  return command('npx', ['--yes', `supabase@${CLI_VERSION}`, ...args, '--workdir', ctx.root], { cwd: ctx.root,
    env: { PATH: process.env.PATH, HOME: ctx.root, CI: 'true', DOCKER_HOST: 'unix:///var/run/docker.sock' } });
}
function inspectNetwork(ctx) { return JSON.parse(command('docker', ['network', 'inspect', ctx.network]))[0]; }
function inspectStack(ctx) {
  const ids = command('docker', ['ps', '-aq', '--filter', `network=${ctx.network}`]).split(/\s+/).filter(Boolean);
  if (!ids.length) throw new Error('Disposable stack has no containers');
  return JSON.parse(command('docker', ['inspect', ...ids]));
}
function certificate(ctx) {
  const dir = path.join(ctx.root, 'tls'); fs.mkdirSync(dir, { mode: 0o700 });
  const run = args => command('openssl', args, { cwd: dir });
  run(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '2', '-subj', '/CN=QRguitar isolated acceptance CA', '-keyout', 'ca.key', '-out', 'ca.crt', '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign']);
  run(['req', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-subj', '/CN=127.0.0.1', '-keyout', 'server.key', '-out', 'server.csr']);
  fs.writeFileSync(path.join(dir, 'server.ext'), 'subjectAltName=IP:127.0.0.1,DNS:localhost\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n', { mode: 0o600 });
  run(['x509', '-req', '-sha256', '-days', '2', '-in', 'server.csr', '-CA', 'ca.crt', '-CAkey', 'ca.key', '-CAcreateserial', '-out', 'server.crt', '-extfile', 'server.ext']);
  for (const file of fs.readdirSync(dir)) fs.chmodSync(path.join(dir, file), 0o600);
  return dir;
}
async function proxy(ctx, tls) {
  const server = https.createServer({ key: fs.readFileSync(path.join(tls, 'server.key')), cert: fs.readFileSync(path.join(tls, 'server.crt')) }, (request, response) => {
    if (!request.url?.startsWith('/') || request.url.startsWith('//') || request.url.includes('\\')) { response.writeHead(400).end(); return; }
    const url = new URL(request.url, ORIGIN);
    if (!['/auth/v1/', '/rest/v1/', '/storage/v1/'].some(prefix => url.pathname.startsWith(prefix))) { response.writeHead(404).end(); return; }
    if (Number(request.headers['content-length'] || 0) > 17 * 1024 * 1024) { response.writeHead(413).end(); return; }
    const headers = { ...request.headers, host: `127.0.0.1:${PORTS.api}`, 'x-forwarded-proto': 'https', 'x-forwarded-host': `127.0.0.1:${PORTS.tls}` };
    const upstream = http.request({ host: '127.0.0.1', port: PORTS.api, path: request.url, method: request.method, headers, timeout: 120000 }, result => {
      // No response rewriting or redirect following: signed URLs must already match the SDK origin.
      response.writeHead(result.statusCode || 502, result.headers); result.pipe(response);
    });
    let total = 0;
    request.on('data', chunk => { total += chunk.length; if (total > 17 * 1024 * 1024) { upstream.destroy(); request.destroy(); } });
    request.on('aborted', () => upstream.destroy());
    upstream.on('timeout', () => upstream.destroy());
    upstream.on('error', () => { if (!response.headersSent) response.writeHead(502); response.end(); });
    request.pipe(upstream);
  });
  server.requestTimeout = 150000; server.headersTimeout = 30000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(PORTS.tls, '127.0.0.1', resolve); });
  return server;
}
function cleanup(ctx) {
  if (!fs.existsSync(ctx.root)) return;
  verifyDirectory(ctx);
  // Config is generated, bound to this run, and never linked. Do not use --all or Docker prune.
  if (fs.existsSync(path.join(ctx.root, 'supabase/config.toml'))) {
    if (fs.readFileSync(path.join(ctx.root, 'supabase/config.toml'), 'utf8') !== configToml(ctx.project)) throw new Error('Refusing cleanup for changed project configuration');
    cli(ctx, ['stop', '--project-id', ctx.project, '--no-backup']);
  }
  const existing = command('docker', ['network', 'ls', '--format', '{{.Name}}']).split(/\r?\n/);
  if (existing.includes(ctx.network)) { validateNetwork(inspectNetwork(ctx), ctx, true); command('docker', ['network', 'rm', ctx.network]); }
  // Only this exact user-private, marker-bound RUNNER_TEMP directory is removed.
  fs.rmSync(ctx.root, { recursive: true, force: false });
}
async function main() {
  const ctx = context(process.env);
  const mode = process.argv[2]; if (!['run', 'cleanup'].includes(mode) || process.argv.length !== 3) throw new Error('Use run or cleanup');
  if (mode === 'cleanup') { cleanup(ctx); console.log('Disposable fixture cleanup complete.'); return; }
  if (fs.existsSync(ctx.root)) throw new Error('Refusing to reuse an existing fixture directory');
  const repo = fs.realpathSync(ctx.repo); ctx.repo = repo;
  if (command('docker', ['ps', '-aq'])) throw new Error('This acceptance job requires a fresh runner with no existing containers');
  if (command('docker', ['network', 'ls', '--format', '{{.Name}}']).split(/\r?\n/).includes(ctx.network)) throw new Error('Refusing to reuse an existing network');
  fs.mkdirSync(ctx.root, { mode: 0o700 });
  fs.writeFileSync(path.join(ctx.root, 'fixture.json'), JSON.stringify({ marker: MARKER, project: ctx.project, network: ctx.network }), { mode: 0o600, flag: 'wx' });
  let server, completed = false;
  try {
    if (cli(ctx, ['--version']) !== CLI_VERSION) throw new Error('Unexpected CLI version');
    cli(ctx, ['init']);
    fs.writeFileSync(path.join(ctx.root, 'supabase/config.toml'), configToml(ctx.project), { mode: 0o600 });
    verifyDirectory(ctx);
    command('docker', ['network', 'create', '--driver', 'bridge', '--label', `qrguitar.fixture=${MARKER}`, '--opt', 'com.docker.network.bridge.host_binding_ipv4=127.0.0.1', ctx.network]);
    validateNetwork(inspectNetwork(ctx), ctx, true);
    cli(ctx, ['start', '--network-id', ctx.network, '--exclude', 'studio,imgproxy,realtime,edge-runtime,logflare,vector,supavisor,postgres-meta,mailpit']);
    validateNetwork(inspectNetwork(ctx), ctx);
    const containers = inspectStack(ctx); validateContainers(containers, ctx);
    const status = JSON.parse(cli(ctx, ['status', '--output', 'json'])); validateStatus(status);
    fs.writeFileSync(path.join(ctx.root, 'status.json'), JSON.stringify(status), { mode: 0o600, flag: 'wx' });
    const tls = certificate(ctx); server = await proxy(ctx, tls);
    const infrastructure = { cliVersion: CLI_VERSION, project: ctx.project, publishedPortsLoopback: true,
      images: containers.map(row => ({ name: row.Name, image: row.Config.Image, imageId: row.Image })).sort((a, b) => a.name.localeCompare(b.name)) };
    fs.writeFileSync(path.join(ctx.root, 'infrastructure.json'), safeReport(infrastructure), { mode: 0o600 });
    const child = spawn(process.execPath, [path.join(here, 'acceptance.mjs'), ctx.root, repo], {
      cwd: ctx.root, stdio: ['ignore', 'inherit', 'inherit'],
      env: { PATH: process.env.PATH, HOME: ctx.root, NODE_ENV: 'production', NODE_EXTRA_CA_CERTS: path.join(tls, 'ca.crt'),
        QRGUITAR_STORAGE_STACK_FIXTURE: MARKER, GITHUB_ACTIONS: 'true', CI: 'true', GITHUB_RUN_ID: process.env.GITHUB_RUN_ID,
        GITHUB_RUN_ATTEMPT: process.env.GITHUB_RUN_ATTEMPT, RUNNER_TEMP: process.env.RUNNER_TEMP, GITHUB_WORKSPACE: repo }
    });
    const code = await new Promise(resolve => { child.once('error', () => resolve(1)); child.once('exit', resolve); });
    if (code !== 0) throw new Error('Actual Auth/Storage acceptance did not pass');
    completed = true;
  } finally {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    // Workflow has an independent always() cleanup step for interruption or failure.
    if (completed) cleanup(ctx);
  }
}
main().catch(() => { console.error('Storage-stack operation failed. No raw provider output or credentials were printed.'); process.exitCode = 1; });
