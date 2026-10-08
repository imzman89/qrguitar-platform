import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash, randomUUID, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { context, verifyDirectory, validateStatus, exactApiUrl, ORIGIN, APP_ORIGIN, MARKER, safeReport, createDiagnostics, readinessProjection, assertFixtureAuthSettings } from './guards.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const EXPECTED_CASES = 18;
export function applicationLoader(repo, ts, report) {
  const cache = new Map();
  return function load(relative) {
    const full = path.resolve(repo, relative);
    assert.ok(full.startsWith(path.join(repo, 'apps/web') + path.sep));
    if (cache.has(full)) return cache.get(full).exports;
    const source = fs.readFileSync(full, 'utf8'); report.loadedModules[path.relative(repo, full).replaceAll('\\', '/')] = hash(source);
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const module = { exports: {} }; cache.set(full, module);
    const actualRequire = createRequire(full);
    new Function('module', 'exports', 'require', '__filename', '__dirname', compiled)(module, module.exports,
      name => name.startsWith('.') ? load(path.relative(repo, path.resolve(path.dirname(full), name + '.ts'))) : actualRequire(name), full, path.dirname(full));
    return module.exports;
  };
}
async function main() {
  const diagnostics = createDiagnostics(row => console.log('ACCEPTANCE_DIAGNOSTIC ' + JSON.stringify(row)));
  const step = (name, work, info) => diagnostics.phase(name, work, info);
  let db, report, output;
  const nativeFetch = globalThis.fetch;
  try {
  const outer = { ...process.env }; delete outer.NODE_EXTRA_CA_CERTS;
  const ctx = step('child-context', () => context(outer));
  const repo = fs.realpathSync(ctx.repo); output = path.join(repo, 'test-results/storage-stack');
  fs.mkdirSync(output, { recursive: true });
  step('child-fixture', () => {
  assert.equal(process.argv.length, 4); assert.equal(path.resolve(process.argv[2]), ctx.root);
  assert.equal(fs.realpathSync(process.argv[3]), fs.realpathSync(ctx.repo));
  verifyDirectory(ctx);
  assert.equal(process.env.NODE_EXTRA_CA_CERTS, path.join(ctx.root, 'tls/ca.crt'));
  assert.equal(process.env.NODE_ENV, 'production');
  });
  const { status, connection } = step('child-status', () => { const status = JSON.parse(fs.readFileSync(path.join(ctx.root, 'status.json'), 'utf8')); return { status, connection: validateStatus(status) }; });
  const require = createRequire(path.join(repo, 'apps/web/package.json'));
  const { Client, createClient, ts } = step('child-dependencies', () => ({ Client: require('pg').Client, createClient: require('@supabase/supabase-js').createClient, ts: require('typescript') }));
  const files = step('child-sources', () => {
    const names = fs.readdirSync(path.join(repo, 'supabase/migrations')).filter(name => name.endsWith('.sql'));
    assert.ok(names.every(name => /^\d{14}_[a-z0-9_]+\.sql$/.test(name)), 'Unexpected migration filename');
    return ['schema.sql', 'security-rls.sql', 'admin-panel-foundation.sql', 'record-archive-controls.sql', 'service-history-timeline.sql', 'lost-stolen-safety-status.sql', ...names.sort().map(name => 'migrations/' + name)];
  });
  const fingerprints = () => Object.fromEntries(files.map(name => ['supabase/' + name, hash(fs.readFileSync(path.join(repo, 'supabase', name)))]));
  const harnessRoot = path.dirname(fileURLToPath(import.meta.url));
  const harnessFingerprints = () => Object.fromEntries(['acceptance.mjs', 'guards.mjs', 'stack.mjs'].map(name => [name, hash(fs.readFileSync(path.join(harnessRoot, name)))]));
  report = { fixture: MARKER, startedAt: new Date().toISOString(), infrastructure: JSON.parse(fs.readFileSync(path.join(ctx.root, 'infrastructure.json'), 'utf8')),
    sourceHashes: fingerprints(), harnessHashes: harnessFingerprints(), loadedModules: {}, packages: {}, tests: [], complete: false,
    scope: 'Actual Next handler functions and real local Auth/Storage/PostgREST/PG17; no browser, hosted-provider, SMTP, deployment, or lock-barrier claim' };
  step('child-package-versions', () => { for (const pkg of ['@supabase/supabase-js', '@supabase/storage-js', 'next', 'typescript', 'pg']) report.packages[pkg] = require(pkg + '/package.json').version; });
  db = new Client({ ...connection, application_name: 'qrguitar-isolated-storage-acceptance' });
  globalThis.fetch = (input, init = {}) => {
    const url = exactApiUrl(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    assert.ok(['/auth/v1/', '/rest/v1/', '/storage/v1/'].some(prefix => url.pathname.startsWith(prefix)), 'Unexpected network path');
    return nativeFetch(input, { ...init, redirect: 'error', signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(120000)]) : AbortSignal.timeout(120000) });
  };
  // Only freshly generated local CLI credentials enter the actual application modules.
  process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGIN;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = status.ANON_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = status.SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SITE_URL = APP_ORIGIN;
  const load = applicationLoader(repo, ts, report);
  const { route, protocol } = step('child-module-load', () => ({ route: load('apps/web/app/api/service-evidence/route.ts'), protocol: load('apps/web/lib/service-evidence-upload.ts') }));
  const service = createClient(ORIGIN, status.SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const scalar = async (sql, values = []) => (await db.query(sql, values)).rows[0].value;
  async function test(name, work) {
    try { await step('acceptance-case', work, { caseIndex: report.tests.length + 1 }); report.tests.push({ name, ok: true }); console.log('PASS ' + name); }
    catch (error) { report.tests.push({ name, ok: false, failureType: error instanceof assert.AssertionError ? 'assertion' : 'operation' }); console.error('FAIL ' + name); throw new Error('Acceptance case failed'); }
  }
  async function control(method, actor, body, search = '') {
    const headers = { origin: APP_ORIGIN };
    if (actor) headers.authorization = 'Bearer ' + actor.token;
    if (body) headers['content-type'] = 'application/json';
    const response = await route[method](new Request(APP_ORIGIN + '/api/service-evidence' + search, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) }));
    assert.match(response.headers.get('cache-control') || '', /no-store/);
    return { status: response.status, value: await response.json() };
  }
  async function user(label) {
    const email = `fixture-${label}-${randomUUID()}@example.invalid`, password = randomBytes(30).toString('base64url');
    const created = await step('auth-user-create', async () => { const result = await service.auth.admin.createUser({ email, password, email_confirm: true }); if (result.error) throw result.error; assert.ok(result.data.user?.id); return result; }, { actorKind: label });
    const client = createClient(ORIGIN, status.ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const login = await step('auth-user-signin', async () => { const result = await client.auth.signInWithPassword({ email, password }); if (result.error) throw result.error; assert.ok(result.data.session?.access_token); return result; }, { actorKind: label });
    const id = created.data.user.id;
    assert.equal(login.data.user.id, id);
    await step('auth-profile-create', () => db.query("insert into public.profiles(id,display_name) values($1,'Synthetic acceptance actor') on conflict(id) do nothing", [id]), { actorKind: label });
    return { id, token: login.data.session.access_token, client };
  }
  const bytes = size => { const value = Buffer.alloc(size, 0x71); Buffer.from('%PDF-1.4\n% synthetic fixture\n').copy(value); Buffer.from('\n%%EOF\n').copy(value, Math.max(0, size - 7)); return value; };
  let provider, owner, stranger, submission;
  async function discovery(actor = provider, uploadId) {
    const response = await control('GET', actor, null, '?submissionId=' + submission + '&uploadState=1' + (uploadId ? '&uploadId=' + uploadId : ''));
    assert.equal(response.status, 200);
    const value = protocol.parseServiceEvidenceUploadDiscovery(response.value, { actorId: actor.id, submissionId: submission, ...(uploadId ? { uploadId } : {}) });
    assert.ok(value, 'The actual discovery DTO must satisfy the exact v2 contract');
    assert.ok(!JSON.stringify(value).includes('token=') && !JSON.stringify(value).includes('signedUrl'));
    return value;
  }
  const bodyFor = async size => ({ protocolVersion: 2, action: 'prepare', expectedActorId: provider.id, submissionId: submission,
    uploadId: randomUUID(), expectedRevision: (await discovery()).revision, evidenceType: 'receipt', fileName: 'synthetic.pdf', mimeType: 'application/pdf', size });
  const intent = (body, action) => ({ protocolVersion: 2, action, expectedActorId: body.expectedActorId,
    submissionId: body.submissionId, uploadId: body.uploadId, expectedRevision: body.expectedRevision });
  async function protocolCounts() {
    return scalar("select jsonb_build_object('uploads',(select count(*) from service_evidence_uploads),'scopes',(select count(*) from service_evidence_upload_scopes),'discards',(select count(*) from service_evidence_upload_discard_receipts),'evidence',(select count(*) from service_submission_evidence),'objects',(select count(*) from storage.objects)) value");
  }
  async function prepared(size) {
    const body = await bodyFor(size), response = await control('POST', provider, body);
    assert.equal(response.status, 200); assert.equal(response.value.phase, 'upload');
    assert.equal(response.value.protocolVersion, 2); assert.equal(response.value.expectedRevision, body.expectedRevision);
    assert.equal(response.value.actorId, body.expectedActorId); assert.equal(response.value.submissionId, body.submissionId); assert.equal(response.value.uploadId, body.uploadId);
    assert.equal(protocol.cleanServiceEvidenceRevision(response.value.revision), response.value.revision); assert.ok(BigInt(response.value.revision) > BigInt(body.expectedRevision));
    assert.ok(protocol.validServiceEvidenceSignedUploadUrl(response.value.signedUrl, ORIGIN, response.value.storagePath));
    return { body, ...response.value };
  }
  async function put(upload, data) {
    exactApiUrl(upload.signedUrl, '/storage/v1/object/upload/sign/service-evidence/');
    return fetch(upload.signedUrl, { method: 'PUT', body: new File([data], 'synthetic.pdf', { type: 'application/pdf' }),
      credentials: 'omit', redirect: 'error', headers: { 'content-type': 'application/pdf', 'x-upsert': 'false', origin: APP_ORIGIN } });
  }
  async function counts(uploadId) {
    return scalar("select jsonb_build_object('receipts',(select count(*) from public.service_evidence_uploads where upload_id=$1),'evidence',(select count(*) from public.service_submission_evidence where id=(select evidence_id from public.service_evidence_uploads where upload_id=$1)),'activity',(select count(*) from public.service_submission_activity where submission_id=$2 and action='evidence_uploaded')) value", [uploadId, submission]);
  }
  async function preview(evidenceId, expected, actor = provider) {
    const list = await control('GET', actor, null, '?submissionId=' + submission);
    assert.equal(list.status, 200); const row = list.value.evidence.find(item => item.id === evidenceId); assert.ok(row);
    assert.equal(row.storagePath, undefined); exactApiUrl(row.previewUrl, '/storage/v1/object/sign/service-evidence/');
    const response = await fetch(row.previewUrl, { credentials: 'omit', redirect: 'error' }); assert.equal(response.status, 200);
    const actual = Buffer.from(await response.arrayBuffer()); assert.equal(actual.length, expected.length); assert.equal(hash(actual), hash(expected));
    return row.previewUrl;
  }
    await step('database-connect', () => db.connect());
    await step('database-preconditions', async () => {
    assert.equal(await scalar('select current_database() value'), 'postgres');
    assert.match(await scalar("select current_setting('server_version') value"), /^17\./);
    assert.equal(await scalar('select count(*)::int value from auth.users'), 0, 'Refusing nonempty Auth');
    assert.equal(await scalar('select count(*)::int value from storage.objects'), 0, 'Refusing nonempty Storage');
    assert.equal(await scalar("select count(*)::int value from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p')"), 0, 'Refusing an existing application schema');
    assert.equal(await scalar('select count(*)::int value from storage.buckets'), 0, 'Refusing nonempty buckets');
    });
    for (const file of files) await step('schema-apply', () => db.query(fs.readFileSync(path.join(repo, 'supabase', file), 'utf8')), { source: path.basename(file), sha256: report.sourceHashes['supabase/' + file] });
    await step('schema-notify', () => db.query("notify pgrst,'reload schema'"));
    // The base DDL documents these two operator-provisioned private buckets but
    // does not create them. Create only in this previously empty disposable stack.
    for (const bucket of ['instrument-media', 'instrument-documents']) {
      await step('fixture-bucket-create', async () => { const result = await service.storage.createBucket(bucket, { public: false }); if (result.error) throw result.error; assert.equal(result.data?.name, bucket); }, { bucket });
      await step('fixture-bucket-verify', async () => { const result = await service.storage.getBucket(bucket); if (result.error) throw result.error; assert.equal(result.data?.id, bucket); assert.equal(result.data?.public, false); }, { bucket });
    }
    const manifest = JSON.parse(fs.readFileSync(path.join(repo, 'apps/web/scripts/release-readiness-manifest.json'), 'utf8'));
    let readiness;
    await step('readiness-rpc', async () => {
    let lastError;
    for (let i = 0; i < 40; i++) {
      const result = await service.rpc('qrguitar_release_readiness');
      if (!result.error) { readiness = result.data; break; }
      lastError = result.error;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (!readiness && lastError) throw lastError;
    });
    report.readiness = readinessProjection(readiness, manifest);
    safeReport(report.readiness);
    console.log('READINESS_DIAGNOSTIC ' + JSON.stringify(report.readiness));
    step('readiness-validate', () => {
    assert.equal(readiness?.ready, true, 'Full repository readiness must pass before fixture users');
    assert.equal(readiness.releaseVersion, manifest.releaseVersion);
    assert.equal(readiness.checks.length, manifest.checks.length);
    assert.ok(readiness.checks.every(item => item.ok === true));
    assert.deepEqual(readiness.checks.map(item => item.name).sort(), [...manifest.checks].sort());
    });
    report.releaseVersion = readiness.releaseVersion; report.readinessChecks = readiness.checks.length;
    await step('auth-settings', async () => {
      const response = await fetch(ORIGIN + '/auth/v1/settings', { headers: { apikey: status.ANON_KEY } });
      assert.equal(response.status, 200);
      assertFixtureAuthSettings(await response.json());
    });
    provider = await user('provider'); owner = await user('owner'); stranger = await user('stranger');
    const guitar = randomUUID(); submission = randomUUID(); const qr = 'QRG-' + randomBytes(8).toString('hex').toUpperCase();
    await step('fixture-instrument-create', () => db.query("insert into public.guitars(id,owner_id,qr_code,permanent_path,name,brand,visibility) values($1,$2,$3,$4,'Synthetic','Synthetic','private')", [guitar, owner.id, qr, '/i/' + qr]));
    await step('fixture-submission-create', () => db.query('insert into public.service_submissions(id,guitar_id,provider_user_id,owner_user_id) values($1,$2,$3,$4)', [submission, guitar, provider.id, owner.id]));
    let small, large, smallEvidence, largeEvidence, oldPreview;
    await test('fresh discovery and exact absent UUID lookup are read-only and create no scope or receipt', async () => {
      const before = await protocolCounts(), unknown = randomUUID();
      for (const value of [await discovery(), await discovery(provider, unknown), await discovery(provider, unknown)]) {
        assert.equal(value.revision, '0'); assert.equal(value.pendingCount, 0); assert.equal(value.pending, null); assert.equal(value.latest, null); assert.equal(value.requested, null); assert.equal(value.canPrepare, true);
      }
      assert.deepEqual(await protocolCounts(), before); assert.equal(before.scopes, 0); assert.equal(before.uploads, 0); assert.equal(before.discards, 0);
    });
    await test('real Auth denies anonymous, mismatched actor, and unrelated provider controls', async () => {
      const body = await bodyFor(1024);
      assert.equal((await control('POST', null, body)).status, 401);
      assert.equal((await control('GET', null, null, '?submissionId=' + submission)).status, 401);
      assert.equal((await control('POST', stranger, body)).status, 409);
      assert.equal((await control('POST', stranger, { ...body, expectedActorId: stranger.id })).status, 403);
      assert.equal((await control('GET', stranger, null, '?submissionId=' + submission)).status, 403);
      for (const actor of [null, owner, stranger]) {
        const response = await control('GET', actor, null, '?submissionId=' + submission + '&uploadState=1');
        assert.equal(response.status, actor ? 403 : 401); assert.equal(response.value.pending, undefined);
      }
      assert.equal(await scalar('select count(*)::int value from service_evidence_uploads'), 0);
    });
    await test('legacy v1 controls receive finite upgrade guidance without any receipt mutation', async () => {
      const body = await bodyFor(1024); delete body.protocolVersion; delete body.expectedRevision;
      const before = await protocolCounts(), response = await control('POST', provider, body);
      assert.equal(response.status, 426); assert.equal(response.value.code, 'upload_upgrade_required'); assert.deepEqual(await protocolCounts(), before);
    });
    await test('actual Storage browser preflight permits raw PUT content type and non-upsert header', async () => {
      small = await prepared(1024);
      const response = await fetch(small.signedUrl, { method: 'OPTIONS', headers: { origin: APP_ORIGIN, 'access-control-request-method': 'PUT', 'access-control-request-headers': 'content-type,x-upsert' } });
      assert.ok(response.ok); assert.ok(['*', APP_ORIGIN].includes(response.headers.get('access-control-allow-origin')));
      const methods = (response.headers.get('access-control-allow-methods') || '').toLowerCase(); assert.ok(methods.includes('put') || methods === '*');
      const headers = (response.headers.get('access-control-allow-headers') || '').toLowerCase(); assert.ok(headers === '*' || (headers.includes('content-type') && headers.includes('x-upsert')));
    });
    await test('small raw File arrives with exact real SDK metadata and one committed evidence', async () => {
      let before = await protocolCounts(); const missing = await discovery(provider, small.uploadId);
      assert.equal(missing.pendingCount, 1); assert.equal(missing.pending.uploadId, small.uploadId); assert.equal(missing.requested.expectedRevision, small.body.expectedRevision);
      assert.equal(missing.requested.storageState, 'missing'); assert.equal(missing.requested.canFinish, false); assert.equal(missing.requested.canDiscard, true); assert.equal(missing.canPrepare, false); assert.deepEqual(await protocolCounts(), before);
      assert.ok((await put(small, bytes(1024))).ok);
      const info = await service.storage.from('service-evidence').info(small.storagePath); assert.equal(info.error, null);
      assert.equal(info.data.name, small.storagePath); assert.equal(info.data.bucketId, 'service-evidence'); assert.equal(info.data.size, 1024); assert.equal(info.data.contentType, 'application/pdf');
      before = await protocolCounts(); const arrived = await discovery(provider, small.uploadId);
      assert.equal(arrived.requested.storageState, 'matching'); assert.equal(arrived.requested.canFinish, true); assert.equal(arrived.requested.state, 'prepared'); assert.deepEqual(await protocolCounts(), before);
      const got = await control('POST', provider, intent(small.body, 'complete')); assert.equal(got.status, 200); assert.equal(got.value.committed, true); smallEvidence = got.value.evidence.id;
      assert.equal(got.value.expectedRevision, small.body.expectedRevision); assert.equal(got.value.protocolVersion, 2);
      assert.deepEqual(await counts(small.uploadId), { receipts: 1, evidence: 1, activity: 1 });
    });
    await test('private provider and owner preview bytes match the original SHA-256', async () => {
      oldPreview = await preview(smallEvidence, bytes(1024)); await preview(smallEvidence, bytes(1024), owner);
      const publicPath = ORIGIN + '/storage/v1/object/public/service-evidence/' + small.storagePath;
      assert.ok(!(await fetch(publicPath, { credentials: 'omit' })).ok, 'Private object must not have a public download');
    });
    await test('signed non-upsert capability cannot overwrite existing file bytes', async () => {
      assert.ok(!(await put(small, Buffer.alloc(1024, 0x62))).ok); await preview(smallEvidence, bytes(1024));
    });
    await test('full 15 MiB raw File bypasses the JSON handler and verifies complete byte hash', async () => {
      large = await prepared(15 * 1024 * 1024); assert.ok(Buffer.byteLength(JSON.stringify(large.body)) < 16384);
      assert.ok((await put(large, bytes(large.body.size))).ok);
      const got = await control('POST', provider, intent(large.body, 'complete')); assert.equal(got.status, 200); largeEvidence = got.value.evidence.id;
      await preview(largeEvidence, bytes(large.body.size)); report.largeFileBytes = large.body.size; report.largeFileSha256 = hash(bytes(large.body.size));
    });
    await test('concurrent real HTTP completions of one receipt produce one evidence and activity', async () => {
      const upload = await prepared(2048); assert.ok((await put(upload, bytes(2048))).ok);
      const results = await Promise.all([control('POST', provider, intent(upload.body, 'complete')), control('POST', provider, intent(upload.body, 'complete'))]);
      assert.ok(results.every(result => result.status === 200 && result.value.committed === true)); assert.equal(results[0].value.evidence.id, results[1].value.evidence.id);
      assert.deepEqual(await counts(upload.uploadId), { receipts: 1, evidence: 1, activity: 3 });
    });
    await test('same-identity prepare and completion replay preserve the original committed result', async () => {
      const before = await counts(small.uploadId), replay = await control('POST', provider, small.body);
      assert.equal(replay.status, 200); assert.equal(replay.value.phase, 'committed'); assert.equal(replay.value.evidence.id, smallEvidence);
      const complete = await control('POST', provider, intent(small.body, 'complete')); assert.equal(complete.value.evidence.id, smallEvidence); assert.deepEqual(await counts(small.uploadId), before);
    });
    await test('actual byte-size mismatch remains prepared without new evidence', async () => {
      const upload = await prepared(4096); assert.ok((await put(upload, bytes(2048))).ok);
      const result = await control('POST', provider, intent(upload.body, 'complete')); assert.equal(result.status, 409); assert.equal(result.value.code, 'upload_metadata_mismatch');
      assert.deepEqual(await counts(upload.uploadId), { receipts: 1, evidence: 0, activity: 3 });
      const mismatch = await discovery(provider, upload.uploadId); assert.equal(mismatch.requested.storageState, 'mismatch'); assert.equal(mismatch.requested.canFinish, false); assert.equal(mismatch.requested.canDiscard, true);
      const discarded = await control('POST', provider, intent(upload.body, 'discard')); assert.equal(discarded.status, 200); assert.equal(discarded.value.phase, 'discarded');
      assert.equal((await service.storage.from('service-evidence').info(upload.storagePath)).data.size, 2048, 'Discard must preserve stored bytes');
    });
    await test('real PostgREST denies private receipt table and helper access to clients and service', async () => {
      for (const client of [provider.client, stranger.client, service]) for (const table of ['service_evidence_uploads', 'service_evidence_upload_scopes', 'service_evidence_upload_discard_receipts']) { const result = await client.from(table).select('*'); assert.ok(result.error); }
      const result = await provider.client.rpc('prepare_service_evidence_upload', { p_submission_id: submission, p_actor_id: provider.id, p_is_admin: true, p_upload_id: randomUUID(), p_evidence: {}, p_expected_revision: '0' }); assert.ok(result.error);
      assert.ok((await service.rpc('_service_evidence_upload_bucket')).error);
    });
    await test('explicit discard before delayed prepare creates a terminal fence without fabricating bytes', async () => {
      const body = await bodyFor(512), before = await protocolCounts(); assert.equal((await discovery(provider, body.uploadId)).requested, null);
      assert.deepEqual(await protocolCounts(), before);
      const discarded = await control('POST', provider, intent(body, 'discard'));
      assert.equal(discarded.status, 200); assert.equal(discarded.value.phase, 'discarded'); assert.equal(discarded.value.receipt.metadata, null); assert.equal(discarded.value.receipt.storagePath, null);
      assert.equal(discarded.value.expectedRevision, body.expectedRevision);
      const terminal = await discovery(provider, body.uploadId); assert.equal(terminal.requested.state, 'discarded'); assert.equal(terminal.requested.expectedRevision, body.expectedRevision);
      for (const request of [body, intent(body, 'complete')]) { const late = await control('POST', provider, request); assert.equal(late.status, 409); assert.equal(late.value.code, 'upload_discarded'); }
      const replay = await control('POST', provider, intent(body, 'discard')); assert.equal(replay.value.receipt.discardedAt, discarded.value.receipt.discardedAt); assert.equal(replay.value.revision, discarded.value.revision);
      const after = await protocolCounts(); assert.equal(after.uploads, before.uploads); assert.equal(after.objects, before.objects); assert.equal(after.discards, before.discards + 1);
    });
    await test('explicit discard of matching unfinished bytes keeps Storage data and creates no evidence', async () => {
      const upload = await prepared(1024); assert.ok((await put(upload, bytes(1024))).ok); const before = await protocolCounts();
      const arrived = await discovery(provider, upload.uploadId); assert.equal(arrived.requested.canFinish, true);
      const discarded = await control('POST', provider, intent(upload.body, 'discard')); assert.equal(discarded.status, 200); assert.equal(discarded.value.phase, 'discarded');
      const after = await protocolCounts(); assert.equal(after.objects, before.objects); assert.equal(after.evidence, before.evidence);
      assert.equal((await discovery(provider, upload.uploadId)).pendingCount, 0);
      const file = await service.storage.from('service-evidence').download(upload.storagePath); assert.equal(file.error, null); assert.equal(hash(Buffer.from(await file.data.arrayBuffer())), hash(bytes(1024)));
      const late = await control('POST', provider, intent(upload.body, 'complete')); assert.equal(late.status, 409); assert.equal(late.value.code, 'upload_discarded');
    });
    await test('discard after a committed completion reports kept evidence without deleting bytes', async () => {
      const before = await protocolCounts(), result = await control('POST', provider, intent(small.body, 'discard'));
      assert.equal(result.status, 200); assert.equal(result.value.phase, 'committed'); assert.equal(result.value.receipt.evidence.id, smallEvidence);
      assert.deepEqual(await protocolCounts(), before); await preview(smallEvidence, bytes(1024));
    });
    await test('a delayed old fresh intent cannot prepare after another scope revision wins', async () => {
      const delayed = await bodyFor(512), winner = await prepared(512);
      assert.equal(delayed.expectedRevision, winner.body.expectedRevision);
      assert.equal((await control('POST', provider, intent(winner.body, 'discard'))).value.phase, 'discarded');
      const before = await protocolCounts(), late = await control('POST', provider, delayed);
      assert.equal(late.status, 412); assert.equal(late.value.code, 'upload_revision_changed'); assert.equal(late.value.uploadId, delayed.uploadId); assert.equal(late.value.expectedRevision, delayed.expectedRevision);
      assert.deepEqual(await protocolCounts(), before); assert.equal((await discovery(provider, delayed.uploadId)).requested, null);
    });
    await test('existing delete removes real bytes and atomically tombstones the original identity', async () => {
      const deleted = await control('DELETE', provider, { evidenceId: smallEvidence }); assert.equal(deleted.status, 200); assert.equal(deleted.value.committed, true); assert.equal(deleted.value.cleanupPending, false);
      assert.ok((await service.storage.from('service-evidence').info(small.storagePath)).error);
      assert.ok(!(await fetch(oldPreview, { credentials: 'omit' })).ok);
      for (const request of [small.body, intent(small.body, 'complete')]) { const retry = await control('POST', provider, request); assert.equal(retry.status, 409); assert.equal(retry.value.code, 'upload_deleted'); }
      const removed = await discovery(provider, small.uploadId); assert.equal(removed.requested.state, 'deleted'); assert.equal(removed.requested.evidence, null);
      assert.deepEqual(await counts(small.uploadId), { receipts: 1, evidence: 0, activity: 3 });
      assert.equal(await scalar('select state value from service_evidence_uploads where upload_id=$1', [small.uploadId]), 'deleted');
    });
    await test('restricted provider cannot mint another upload capability or mutate existing evidence', async () => {
      await db.query("update public.profiles set account_status='locked' where id=$1", [provider.id]);
      const locked = await discovery(provider, large.uploadId); assert.equal(locked.canPrepare, false); assert.equal(locked.requested.canFinish, false); assert.equal(locked.requested.canDiscard, false);
      assert.equal((await control('POST', provider, await bodyFor(512))).status, 403);
      assert.equal((await control('DELETE', provider, { evidenceId: largeEvidence })).status, 403);
      assert.equal(await scalar('select count(*)::int value from service_submission_evidence where id=$1', [largeEvidence]), 1);
    });
    step('acceptance-final-validation', () => {
    assert.equal(report.tests.length, EXPECTED_CASES); assert.ok(report.tests.every(item => item.ok));
    assert.deepEqual(fingerprints(), report.sourceHashes, 'Schema sources changed during acceptance');
    assert.deepEqual(harnessFingerprints(), report.harnessHashes, 'Harness sources changed during acceptance');
    for (const [relative, digest] of Object.entries(report.loadedModules)) assert.equal(hash(fs.readFileSync(path.join(repo, relative))), digest);
    report.complete = true;
    });
  } finally {
    if (db) await step('database-close', () => db.end()).catch(() => undefined);
    globalThis.fetch = nativeFetch;
    if (output) {
      fs.writeFileSync(path.join(output, 'acceptance-setup.json'), safeReport(diagnostics.report()));
      if (report) { report.finishedAt = new Date().toISOString(); fs.writeFileSync(path.join(output, 'acceptance.json'), safeReport(report)); }
    }
  }
  console.log(`Actual isolated Auth/Storage acceptance: ${report.tests.length}/${EXPECTED_CASES} passed.`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(() => { console.error('Isolated Auth/Storage acceptance failed; see fixed setup diagnostics and credential-free reports.'); process.exitCode = 1; });
