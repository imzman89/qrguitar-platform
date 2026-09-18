import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { randomUUID, randomBytes, createHash, createCipheriv, createDecipheriv } from 'node:crypto';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const lib = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/lib');
const cache = new Map();
function load(name) {
  if (cache.has(name)) return cache.get(name);
  const output = ts.transpileModule(fs.readFileSync(path.join(lib, name + '.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} }; cache.set(name, module.exports);
  const mockedRequire = id => {
    if (id === '../../modules/qrguitar-photo-picker') return { __esModule: true, default: null };
    if (id.startsWith('./')) return load(id.slice(2));
    if (id === 'react-native-url-polyfill/auto') return {};
    if (id === 'react-native') return { Platform: { OS: 'android' }, AppState: { currentState: 'active', addEventListener() { return { remove() {} }; } } };
    if (id === 'expo-crypto') return { randomUUID };
    if (id === 'expo-secure-store' || id === 'expo-file-system' || id === 'expo-image-picker') return {};
    if (id === '@supabase/supabase-js') return { createClient() { throw new Error('Use an injected auth client in unit tests.'); } };
    return require(id);
  };
  new Function('require', 'module', 'exports', output)(mockedRequire, module, module.exports);
  cache.set(name, module.exports); return module.exports;
}
const authLib = load('auth');
const apiLib = load('api');
const runtimeEnvironmentLib = load('runtime-environment');
const exportEnvironmentLib = await import('./export-environment.mjs');
const draftLib = load('profile-draft');
const pickerLib = load('photo-picker');
const identifiedPickerLib = load('identified-photo-picker');
const { createEncryptedStorage, createNativeAuth, NativeSessionChangedError } = authLib;
const { createNativeApi, NativeApiError } = apiLib;
const { isOfflineAcceptanceEnvironment, runtimeFetch } = runtimeEnvironmentLib;
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const actor = '11111111-1111-4111-8111-111111111111';
const otherActor = '22222222-2222-4222-8222-222222222222';
const session = id => ({ user: { id, email: id + '@example.com' }, access_token: 'token-' + id });
function memoryStorage() {
  const values = new Map();
  return { values, getItem: async key => values.get(key) ?? null, setItem: async (key, value) => { values.set(key, value); }, removeItem: async key => { values.delete(key); } };
}
test('offline acceptance mode requires its exact fixture and never delegates a network request', async () => {
  const shared = exportEnvironmentLib.OFFLINE_ACCEPTANCE_RUNTIME_ENVIRONMENT;
  const fixture = {
    supabaseUrl: shared.supabaseUrl,
    supabaseKey: shared.supabaseKey,
    apiOrigin: shared.apiOrigin,
    offlineAcceptance: shared.offlineAcceptance,
    offlineAcceptanceEvidence: shared.bundleEvidence,
  };
  assert.equal(isOfflineAcceptanceEnvironment(fixture, 'android'), true);
  assert.equal(isOfflineAcceptanceEnvironment(fixture, 'ios'), false);
  assert.equal(isOfflineAcceptanceEnvironment({ ...fixture, offlineAcceptance: '' }, 'android'), false);
  assert.equal(isOfflineAcceptanceEnvironment({ ...fixture, offlineAcceptance: fixture.offlineAcceptance + '-changed' }, 'android'), false);
  assert.equal(isOfflineAcceptanceEnvironment({ ...fixture, offlineAcceptanceEvidence: '' }, 'android'), false);
  let requests = 0;
  const online = async () => { requests++; return new Response(); };
  const offline = runtimeFetch(fixture, online, 'android');
  await assert.rejects(offline('https://www.qrguitar.com/api/instruments'), /disabled in this offline acceptance build/);
  assert.equal(requests, 0);
  assert.equal(runtimeFetch({ ...fixture, offlineAcceptance: '' }, online, 'android'), online);
  assert.equal(runtimeFetch(fixture, online, 'web'), online);
});
test('the exact embedded fixture boots the real auth and API singletons without reaching fetch', async () => {
  const environment = {
    ...exportEnvironmentLib.OFFLINE_ACCEPTANCE_ENVIRONMENT,
    [exportEnvironmentLib.OFFLINE_ACCEPTANCE_BUNDLE_EVIDENCE_NAME]:
      exportEnvironmentLib.OFFLINE_ACCEPTANCE_RUNTIME_ENVIRONMENT.bundleEvidence,
  };
  const previous = new Map(Object.keys(environment).map(name => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  let requests = 0;
  try {
    Object.assign(process.env, environment);
    globalThis.fetch = async () => { requests++; throw new Error('native fetch must stay unreachable'); };
    const auth = authLib.getNativeAuth();
    const stop = auth.start(); await tick();
    assert.equal(auth.getSnapshot().status, 'unconfigured');
    await assert.rejects(apiLib.getNativeApi().listPublic(), error =>
      error.code === 'network_error' && error.message === 'QRguitar could not be reached. Check your connection and try again.');
    assert.equal(requests, 0); stop();
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});
function encryptedFixture() {
  const pointers = new Map(), files = new Map(), events = [];
  const backend = {
    digest: async value => createHash('sha256').update(value).digest('hex'), randomId: randomUUID,
    seal: async value => {
      const key = randomBytes(32), iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
      return { key: key.toString('hex'), ciphertext: Buffer.concat([iv, cipher.update(value, 'utf8'), cipher.final(), cipher.getAuthTag()]) };
    },
    open: async (bytes, key) => {
      const raw = Buffer.from(bytes), decipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), raw.subarray(0, 12));
      decipher.setAuthTag(raw.subarray(-16)); return Buffer.concat([decipher.update(raw.subarray(12, -16)), decipher.final()]).toString('utf8');
    },
    readPointer: async key => pointers.get(key) ?? null,
    writePointer: async (key, value) => { events.push('pointer'); pointers.set(key, value); },
    removePointer: async key => { events.push('remove-pointer'); pointers.delete(key); },
    readFile: async id => { if (!files.has(id)) throw new Error('Missing encrypted file'); return files.get(id); },
    writeFile: async (id, value) => { events.push('file'); files.set(id, Buffer.from(value)); },
    removeFile: async id => { events.push('remove-file'); files.delete(id); }
  };
  return { backend, pointers, files, events, storage: createEncryptedStorage(backend) };
}
test('encrypted storage round trips a large session and Unicode without plaintext or oversized SecureStore entries', async () => {
  const f = encryptedFixture(); const secret = JSON.stringify({ access_token: 'secret'.repeat(9000), name: 'José 🎸 世界' });
  await f.storage.setItem('session', secret);
  assert.equal(await f.storage.getItem('session'), secret);
  assert.ok([...f.pointers.values()].every(value => value.length < 2048 && !value.includes('secret')));
  assert.ok([...f.files.values()].every(value => !value.includes(Buffer.from('secretsecret'))));
  assert.deepEqual(f.events, ['file', 'pointer']);
});
test('failed pointer write preserves previous data and encrypted candidate', async () => {
  const f = encryptedFixture(); await f.storage.setItem('session', 'old');
  f.backend.writePointer = async () => { throw new Error('SecureStore full'); };
  await assert.rejects(f.storage.setItem('session', 'new'), /full/);
  assert.equal(await f.storage.getItem('session'), 'old'); assert.equal(f.files.size, 2);
});
test('pointer write that commits then throws keeps the new readable file', async () => {
  const f = encryptedFixture(); const write = f.backend.writePointer;
  f.backend.writePointer = async (...args) => { await write(...args); throw new Error('native bridge lost response'); };
  await assert.rejects(f.storage.setItem('session', 'new'), /lost response/);
  assert.equal(await f.storage.getItem('session'), 'new');
});
test('corrupt or missing ciphertext fails explicitly, not as an empty session', async () => {
  const f = encryptedFixture(); await f.storage.setItem('session', 'private');
  const id = [...f.files.keys()][0]; f.files.get(id)[20] ^= 1;
  await assert.rejects(f.storage.getItem('session'));
  f.files.delete(id); await assert.rejects(f.storage.getItem('session'), /Missing/);
});
test('committed pointer update/delete survives cleanup failure', async () => {
  const f = encryptedFixture(); await f.storage.setItem('session', 'old');
  f.backend.removeFile = async () => { throw new Error('cleanup failed'); };
  await f.storage.setItem('session', 'new'); assert.equal(await f.storage.getItem('session'), 'new');
  await f.storage.removeItem('session'); assert.equal(await f.storage.getItem('session'), null);
});
test('writes serialize with logout and no late encrypted write resurrects the session', async () => {
  const f = encryptedFixture(); const gate = deferred(); const original = f.backend.writeFile;
  f.backend.writeFile = async (...args) => { await gate.promise; await original(...args); };
  const save = f.storage.setItem('session', 'old-refresh'); const remove = f.storage.removeItem('session');
  gate.resolve(); await Promise.all([save, remove]); assert.equal(await f.storage.getItem('session'), null);
});
test('UTF-8 adapter handles large ASCII, Unicode and malformed ciphertext encoding', () => {
  const text = 'photo'.repeat(100000) + 'é世界🎸';
  assert.equal(authLib.decodeUtf8(authLib.encodeUtf8(text)), text);
  assert.throws(() => authLib.decodeUtf8(Uint8Array.of(0xc0, 0x80)), /encoding/);
});
function authFixture(options = {}) {
  const storage = options.storage || memoryStorage(); const clients = []; let appListener;
  const appState = { currentState: 'active', addEventListener(_event, listener) { appListener = listener; return { remove() { appListener = null; } }; } };
  const auth = createNativeAuth({ storage, appState, timeoutMs: options.timeoutMs || 60, clientFactory(scopedStorage) {
    let listener; let currentSession = options.initialSession ?? null;
    const c = { storage: scopedStorage, starts: 0, stops: 0, emit(value) { currentSession = value; listener?.('TOKEN_REFRESHED', value); }, auth: {
      getSession: () => options.getSession ? options.getSession() : Promise.resolve({ data: { session: currentSession }, error: null }),
      onAuthStateChange(callback) { listener = callback; return { data: { subscription: { unsubscribe() { listener = null; } } } }; },
      startAutoRefresh: async () => { c.starts++; }, stopAutoRefresh: async () => { c.stops++; },
      signInWithPassword: async () => ({ data: { session: session(actor) }, error: null }),
      signUp: async () => ({ data: { session: null }, error: null }),
      signOut: async () => ({ error: null })
    }};
    clients.push(c); return c;
  }});
  return { auth, storage, clients, background: value => appListener?.(value) };
}
test('an intentionally unconfigured auth runtime never constructs or refreshes a client', async () => {
  let clients = 0, appListener;
  const auth = createNativeAuth({
    storage: memoryStorage(),
    configurationError: 'Account access is intentionally unavailable in this offline acceptance build.',
    appState: {
      currentState: 'active',
      addEventListener(_event, listener) { appListener = listener; return { remove() { appListener = null; } }; }
    },
    clientFactory() { clients++; throw new Error('client must stay unreachable'); }
  });
  const stop = auth.start(); await tick();
  assert.equal(auth.getSnapshot().status, 'unconfigured'); assert.equal(clients, 0);
  appListener?.('background'); appListener?.('active'); assert.equal(clients, 0);
  await assert.rejects(auth.signIn('person@example.com', 'password-long'), /intentionally unavailable/);
  assert.equal(clients, 0); stop();
});
test('auth starts refresh only active, stops in background, and subscribes once for two consumers', async () => {
  const f = authFixture({ initialSession: session(actor) }); const stop1 = f.auth.start(); const stop2 = f.auth.start(); await tick();
  assert.equal(f.clients.length, 1); assert.equal(f.auth.getSnapshot().status, 'signed-in');
  f.background('background'); f.background('active'); assert.equal(f.clients[0].starts, 2); assert.equal(f.clients[0].stops, 1);
  stop1(); assert.equal(f.clients[0].stops, 1); stop2(); assert.equal(f.clients[0].stops, 2);
});
test('late initial session success cannot restore the previous account after logout', async () => {
  const pending = deferred(); const f = authFixture({ getSession: () => pending.promise }); const stop = f.auth.start();
  await f.auth.signOut(); pending.resolve({ data: { session: session(actor) }, error: null }); await tick();
  assert.equal(f.auth.getSnapshot().status, 'signed-out'); stop();
});
test('late initial session rejection cannot replace successful logout with a stale error', async () => {
  const pending = deferred(); const f = authFixture({ getSession: () => pending.promise }); const stop = f.auth.start();
  await f.auth.signOut(); pending.reject(new Error('old storage error')); await tick();
  assert.equal(f.auth.getSnapshot().status, 'signed-out'); stop();
});
test('logout invalidates API leases and prevents retired clients persisting late refresh tokens', async () => {
  const f = authFixture({ initialSession: session(actor) }); const stop = f.auth.start(); await tick();
  const lease = await f.auth.acquireSession(); const old = f.clients[0]; await f.auth.signOut();
  await old.storage.setItem('qrguitar.auth.session', 'old credentials');
  assert.equal(f.auth.isCurrent(lease), false); assert.equal(await f.storage.getItem('qrguitar.auth.session'), null); stop();
});
test('token refresh for same actor retains lease; account switch invalidates it', async () => {
  const f = authFixture({ initialSession: session(actor) }); const stop = f.auth.start(); await tick();
  const lease = await f.auth.acquireSession(); f.clients[0].emit({ ...session(actor), access_token: 'fresh' }); assert.ok(f.auth.isCurrent(lease));
  f.clients[0].emit(session(otherActor)); assert.equal(f.auth.isCurrent(lease), false); stop();
});
test('session acquisition checks account changes even when the old token lookup rejects', async () => {
  const f = authFixture({ initialSession: session(actor) }); const stop = f.auth.start(); await tick();
  const pending = deferred(); f.clients[0].auth.getSession = () => pending.promise;
  const request = f.auth.acquireSession(); f.clients[0].emit(session(otherActor)); pending.reject(new Error('old auth failure'));
  await assert.rejects(request, NativeSessionChangedError); stop();
});
test('sign-up without a session reports email confirmation, never a signed-in account', async () => {
  const f = authFixture(); const stop = f.auth.start(); await tick();
  assert.deepEqual(await f.auth.signUp('person@example.com', 'password-long', 'Person'), { requiresEmailConfirmation: true });
  assert.equal(f.auth.getSnapshot().status, 'signed-out'); stop();
});
test('timed-out sign-in retires client so late auth events and persistence cannot sign the user in', async () => {
  const f = authFixture({ timeoutMs: 10 }); const stop = f.auth.start(); await tick(); const pending = deferred();
  f.clients[0].auth.signInWithPassword = () => pending.promise;
  const old = f.clients[0]; await assert.rejects(f.auth.signIn('a@example.com', 'password'), /timed out/);
  old.emit(session(actor)); await old.storage.setItem('qrguitar.auth.session', 'stale'); pending.resolve({ data: { session: session(actor) }, error: null }); await tick();
  assert.notEqual(f.auth.getSnapshot().status, 'signed-in'); assert.equal(f.storage.values.size, 0); stop();
});
test('local logout storage failure remains visible and requires retry instead of claiming durable logout', async () => {
  const f = authFixture({ initialSession: session(actor) }); const stop = f.auth.start(); await tick();
  f.storage.removeItem = async () => { throw new Error('keychain locked'); };
  await assert.rejects(f.auth.signOut(), /could not be saved/); assert.equal(f.auth.getSnapshot().status, 'error'); assert.equal(f.auth.getSnapshot().session, null); stop();
});
function simpleAuth() {
  let id = actor, revision = 1; const listeners = new Set();
  return { getSnapshot: () => ({ status: id ? 'signed-in' : 'signed-out', session: id ? session(id) : null, revision, message: '' }), subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    acquireSession: async expected => { if (!id || expected && id !== expected) throw new NativeSessionChangedError(); return { actorId: id, revision, accessToken: 'private-token' }; },
    isCurrent: lease => lease.actorId === id && lease.revision === revision,
    change(next) { id = next; revision++; for (const listener of listeners) listener(this.getSnapshot()); }
  };
}
const instrument = (overrides = {}) => ({ qrCode: 'QRG-123ABC', name: 'Example guitar', brand: 'Example', model: 'Model', visibility: 'public', ...overrides });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
function apiFixture(fetcher, opts = {}) { const auth = opts.auth || simpleAuth(); return { auth, api: createNativeApi({ auth, fetch: fetcher, origin: 'https://qrguitar.com', storageOrigin: 'https://project.supabase.co', timeoutMs: opts.timeoutMs || 50 }) }; }
test('API honors empty successful collection and distinguishes outage/auth/malformed envelopes', async () => {
  const results = [json({ ok: true, instruments: [], count: 0 }), json({ ok: false, message: 'Unavailable' }, 503), json({ ok: false, instruments: [] }, 401), json({ ok: true }), json({ ok: true, instruments: [null] })];
  const f = apiFixture(async () => results.shift());
  assert.deepEqual(await f.api.listPublic(), []);
  await assert.rejects(f.api.listPublic(), error => error.status === 503);
  await assert.rejects(f.api.listMine(), error => error.status === 401);
  await assert.rejects(f.api.listPublic(), /incomplete/); await assert.rejects(f.api.listPublic(), /unreadable/);
});
test('owner reads use scoped API endpoints with bearer token; public reads omit credentials', async () => {
  const calls = []; const f = apiFixture(async (url, options) => { calls.push([url, options]); return json(url.includes('code=') ? { ok: true, instrument: instrument() } : { ok: true, instruments: [] }); });
  await f.api.listPublic(); await f.api.listMine(); await f.api.readMine('qrg-123abc');
  assert.equal(calls[0][1].headers.Authorization, undefined); assert.equal(calls[1][1].headers.Authorization, 'Bearer private-token');
  assert.equal(calls[2][0], 'https://qrguitar.com/api/instruments?scope=mine&code=QRG-123ABC');
  assert.equal(calls[2][1].redirect, 'error'); assert.equal(calls[2][1].credentials, 'omit');
});
test('public catalog rejects private/unlisted and public detail rejects private; unlisted direct detail works', async () => {
  for (const visibility of ['private', 'unlisted']) {
    const f = apiFixture(async () => json({ ok: true, instruments: [instrument({ visibility })] })); await assert.rejects(f.api.listPublic(), /restricted/);
  }
  let visibility = 'private'; const f = apiFixture(async () => json({ ok: true, instrument: instrument({ visibility }) }));
  await assert.rejects(f.api.readPublic('QRG-123ABC'), /private/); visibility = 'unlisted'; assert.equal((await f.api.readPublic('QRG-123ABC')).visibility, 'unlisted');
});
test('late owner response and late JSON rejection are guarded after account switch', async () => {
  for (const failure of [false, true]) {
    const pending = deferred(); const auth = simpleAuth();
    const f = apiFixture(async () => ({ ok: true, status: 200, url: '', redirected: false, json: () => pending.promise }), { auth });
    const request = f.api.listMine(); await tick(); auth.change(otherActor);
    if (failure) pending.reject(new Error('old JSON')); else pending.resolve({ ok: true, instruments: [instrument()] });
    await assert.rejects(request, NativeSessionChangedError);
  }
});
test('fetch that ignores abort and JSON parsing that never settles are bounded', async () => {
  for (const fetcher of [() => new Promise(() => {}), async () => ({ ok: true, status: 200, json: () => new Promise(() => {}) })]) {
    const f = apiFixture(fetcher, { timeoutMs: 10 }); await assert.rejects(f.api.listPublic(), error => error.code === 'timeout');
  }
});
test('create response malformed, network failure or timeout retains an uncertain outcome', async () => {
  for (const fetcher of [async () => { throw new Error('offline'); }, async () => json({ ok: true }), async () => new Response('<html>error</html>'), async () => json(null)]) {
    const f = apiFixture(fetcher); await assert.rejects(f.api.createProfile(actor, '{}'), error => error.uncertain === true);
  }
});
test('create confirms only the exact route success shape and strict reset response', async () => {
  let response = json({ ok: true, qrCode: 'QRG-ABC', permanentPath: '/i/QRG-ABC', message: 'Created' });
  const f = apiFixture(async () => response);
  assert.equal((await f.api.createProfile(actor, '{}')).qrCode, 'QRG-ABC');
  response = json({ ok: false, code: 'upload_session_changed', resetUploads: true, retryable: true }, 409);
  await assert.rejects(f.api.createProfile(actor, '{}'), error => error.resetUploads && !error.uncertain);
  response = json({ ok: false, code: 'create_unconfirmed', resetUploads: true }, 502);
  await assert.rejects(f.api.createProfile(actor, '{}'), error => !error.resetUploads && error.uncertain);
});
test('safe native URLs reject executable, local, credentials, protocol-relative and storage paths', () => {
  for (const value of ['javascript:alert(1)', 'data:image/svg+xml,a', 'file:///private/a', 'http://example.com/a', '//evil.com/a', 'https://127.0.0.1/a', 'https://[::1]/a', 'https://user:pass@example.com/a', 'https://device.local/a', actor + '/profile-uploads/a/image.jpg']) assert.equal(apiLib.safeNativeImageUrl(value), undefined, value);
  assert.equal(apiLib.safeNativeImageUrl('https://project.supabase.co/storage/v1/object/sign/images/a?token=abc'), 'https://project.supabase.co/storage/v1/object/sign/images/a?token=abc');
  assert.equal(apiLib.safeNativeReferenceUrl('/api/instruments/documents/example'), 'https://qrguitar.com/api/instruments/documents/example');
});
test('API origin allows only production hosts, plus exact local web development proxy', () => {
  assert.equal(apiLib.resolveNativeApiOrigin(undefined, false, 'android'), 'https://www.qrguitar.com');
  assert.equal(apiLib.resolveNativeApiOrigin('https://qrguitar.com', false, 'android'), 'https://www.qrguitar.com');
  assert.equal(apiLib.resolveNativeApiOrigin('https://www.qrguitar.com/', false, 'ios'), 'https://www.qrguitar.com');
  assert.equal(apiLib.resolveNativeApiOrigin('http://127.0.0.1:3014', true, 'web'), 'http://127.0.0.1:3014');
  for (const [origin, development, platform] of [['http://127.0.0.1:3014', false, 'web'], ['http://127.0.0.1:3014', true, 'ios'], ['https://evil.com', true, 'web'], ['https://qrguitar.com.evil.com', false, 'android']]) assert.throws(() => apiLib.resolveNativeApiOrigin(origin, development, platform), /invalid/);
});
const photo = (id = randomUUID()) => ({ id, dataUrl: 'data:image/jpeg;base64,' + Buffer.from([255,216,255,224,0,16,74,70,73,70,0,1,2,3,4,5]).toString('base64') });
const input = { brand: 'Example', model: 'Model', serial: 'SN1234', serialNotUsed: false, instrumentType: 'Electric guitar', visibility: 'private' };
const result = { qrCode: 'QRG-NEW123', permanentPath: '/i/QRG-NEW123', message: 'Created' };
function draftFixture(options = {}) {
  const auth = options.auth || simpleAuth(), storage = options.storage || memoryStorage(), calls = [];
  const api = {
    uploadPhoto: async (id, uploadId, _photo, index) => { calls.push(['upload', index]); return id + '/profile-uploads/' + uploadId + '/image-' + index + '-' + randomUUID() + '.jpg'; },
    createProfile: async (id, body) => { calls.push(['create', id, body]); return result; }, ...options.api
  };
  const controller = draftLib.makeProfileDraftController(actor, { auth, storage, api, randomId: randomUUID });
  return { auth, storage, api, calls, controller };
}
test('draft uploads all photos, defaults serial private, and persists confirmation with exact contract', async () => {
  const f = draftFixture(); assert.deepEqual(await f.controller.createOrRetry(input, [photo(), photo()]), result);
  const body = JSON.parse(f.calls.find(call => call[0] === 'create')[2]);
  assert.equal(body.photos.length, 2); assert.equal(body.heroImagePath, body.photos[0]); assert.equal(body.showSerialPublic, false); assert.equal(body.visibility, 'private');
  assert.equal(f.controller.getState().draft.result.qrCode, result.qrCode);
  await f.controller.createOrRetry(); assert.equal(f.calls.filter(call => call[0] === 'create').length, 1);
});
test('partial upload failure resumes after the last durable photo', async () => {
  const f = draftFixture(); const upload = f.api.uploadPhoto; let fail = true;
  f.api.uploadPhoto = async (...args) => { if (args[3] === 1 && fail) { fail = false; throw new Error('upload interrupted'); } return upload(...args); };
  await assert.rejects(f.controller.createOrRetry(input, [photo(), photo()]), /interrupted/);
  assert.equal(f.controller.getState().draft.stagedPaths.length, 1);
  await f.controller.createOrRetry(); assert.deepEqual(f.calls.filter(call => call[0] === 'upload').map(call => call[1]), [0, 1]);
});
test('uncertain create survives restart with identical body, keys, uploaded paths and no reupload', async () => {
  const f = draftFixture(); let sent;
  f.api.createProfile = async (_actor, body) => { sent = body; throw new NativeApiError('lost response', { uncertain: true, retryable: true }); };
  await assert.rejects(f.controller.createOrRetry(input, [photo()]), /lost/);
  const restarted = draftFixture({ storage: f.storage, api: { uploadPhoto: async () => { throw new Error('must not reupload'); }, createProfile: async (_actor, body) => { assert.equal(body, sent); return result; } } });
  const saved = await restarted.controller.loadDraft(); assert.equal(saved.uncertain, true);
  await assert.rejects(restarted.controller.saveDraft({ ...input, model: 'Changed' }, [photo()]), /Retry/);
  await assert.rejects(restarted.controller.discardDraft(), /unconfirmed/);
  assert.deepEqual(await restarted.controller.createOrRetry(), result);
});
test('duplicate create clicks cannot upload or submit twice', async () => {
  const gate = deferred(); const f = draftFixture(); const create = f.api.createProfile;
  f.api.createProfile = async (...args) => { await gate.promise; return create(...args); };
  const first = f.controller.createOrRetry(input, [photo()]);
  await assert.rejects(f.controller.createOrRetry(input, [photo()]), /already/); gate.resolve(); await first;
  assert.equal(f.calls.filter(call => call[0] === 'create').length, 1);
});
test('definitive upload reset clears only frozen body and paths, retaining original input and identities', async () => {
  const f = draftFixture(); f.api.createProfile = async () => { throw new NativeApiError('reset', { status: 409, code: 'upload_session_changed', resetUploads: true }); };
  await f.controller.saveDraft(input, [photo()]); const original = f.controller.getState().draft;
  await assert.rejects(f.controller.createOrRetry(), /reset/); const after = f.controller.getState().draft;
  assert.equal(after.uploadId, original.uploadId); assert.equal(after.idempotencyKey, original.idempotencyKey); assert.deepEqual(after.input, original.input); assert.deepEqual(after.photos, original.photos);
  assert.equal(after.frozenBody, null); assert.deepEqual(after.stagedPaths, []); assert.equal(after.uncertain, false);
});
test('an earlier unknown create remains frozen after a later early validation or unauthorized response', async () => {
  const f = draftFixture(); f.api.createProfile = async () => { throw new NativeApiError('lost', { uncertain: true }); };
  await assert.rejects(f.controller.createOrRetry(input, [photo()])); const body = f.controller.getState().draft.frozenBody;
  f.api.createProfile = async () => { throw new NativeApiError('sign in', { status: 401, code: 'auth_required' }); };
  await assert.rejects(f.controller.createOrRetry()); assert.equal(f.controller.getState().draft.frozenBody, body); assert.equal(f.controller.getState().draft.uncertain, true);
});
test('definitive first-attempt validation rejection allows correction without a new identity', async () => {
  const f = draftFixture(); f.api.createProfile = async () => { throw new NativeApiError('Brand spelling', { status: 409, code: 'brand_spelling_conflict' }); };
  await assert.rejects(f.controller.createOrRetry(input, [photo()])); const before = f.controller.getState().draft;
  assert.equal(before.uncertain, false); assert.equal(before.frozenBody, null);
  await f.controller.saveDraft({ ...input, brand: 'Corrected' }, before.photos); assert.equal(f.controller.getState().draft.idempotencyKey, before.idempotencyKey);
});
test('local persistence failure before dispatch prevents any create request', async () => {
  const f = draftFixture(); const save = f.storage.setItem;
  f.storage.setItem = async (key, value) => { if (JSON.parse(value).draft.uncertain) throw new Error('device storage full'); await save(key, value); };
  await assert.rejects(f.controller.createOrRetry(input, [photo()]), /storage full/);
  assert.equal(f.calls.filter(call => call[0] === 'create').length, 0);
});
test('server-confirmed create stays successful when local confirmation persistence fails', async () => {
  const f = draftFixture(); const save = f.storage.setItem;
  f.storage.setItem = async (key, value) => { if (JSON.parse(value).draft.result) throw new Error('device storage full'); await save(key, value); };
  assert.deepEqual(await f.controller.createOrRetry(input, [photo()]), result);
  assert.match(f.controller.getState().error, /Profile created/); assert.deepEqual(f.controller.getState().draft.result, result);
  const persisted = JSON.parse([...f.storage.values.values()][0]).draft; assert.equal(persisted.uncertain, true); assert.equal(persisted.result, null);
});
test('account switch during upload hides draft and prevents sending create for a different actor', async () => {
  const gate = deferred(); const f = draftFixture(); const upload = f.api.uploadPhoto;
  f.api.uploadPhoto = async (...args) => { await gate.promise; return upload(...args); };
  const pending = f.controller.createOrRetry(input, [photo()]); await tick(); f.auth.change(otherActor); gate.resolve();
  await assert.rejects(pending, NativeSessionChangedError); assert.equal(f.controller.getState().draft, null); assert.equal(f.calls.filter(call => call[0] === 'create').length, 0);
});
test('tampered frozen request and wrong actor data fail explicitly and remain stored', async () => {
  const f = draftFixture(); f.api.createProfile = async () => { throw new NativeApiError('lost', { uncertain: true }); };
  await assert.rejects(f.controller.createOrRetry(input, [photo()]));
  const key = [...f.storage.values.keys()][0]; const saved = JSON.parse(f.storage.values.get(key)); saved.draft.frozenBody = saved.draft.frozenBody.replace('Example', 'Other'); f.storage.values.set(key, JSON.stringify(saved));
  const restarted = draftFixture({ storage: f.storage }); await assert.rejects(restarted.controller.loadDraft(), /request has changed/); assert.ok(f.storage.values.has(key));
});
test('picker MIME is derived from bytes, rejects missing base64 and enforces 12 MiB before direct API transport', async () => {
  const valid = photo(); assert.ok(draftLib.photoFromPickerAsset({ base64: valid.dataUrl.split(',')[1], mimeType: 'image/heic' }).dataUrl.startsWith('data:image/jpeg;'));
  assert.throws(() => draftLib.photoFromPickerAsset({ uri: 'file://private/a' }), /could not be read/);
  const oversized = { id: randomUUID(), dataUrl: 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([255,216,255]), Buffer.alloc(draftLib.MAX_NATIVE_IMAGE_BYTES)]).toString('base64') };
  assert.throws(() => draftLib.validateNativeProfile(input, [oversized]), /12 MiB/);
  let called = false; const f = apiFixture(async () => { called = true; return json({}); });
  await assert.rejects(f.api.uploadPhoto(actor, randomUUID(), oversized.dataUrl, 0), /12 MiB/); assert.equal(called, false);
});
test('partial form and zero photos autosave and restore without invoking transport', async () => {
  const f = draftFixture(); const partial = { ...input, brand: '', model: '', serial: '', instrumentType: '' };
  await f.controller.saveDraft(partial, []); f.controller.dispose();
  const reopened = draftFixture({ storage: f.storage }); const draft = await reopened.controller.loadDraft();
  assert.deepEqual(draft.input, { ...partial, showSerialPublic: false }); assert.deepEqual(draft.photos, []); assert.equal(reopened.calls.length, 0);
});
test('incomplete create rejects before uploading while preserving the partial draft', async () => {
  const f = draftFixture(); await assert.rejects(f.controller.createOrRetry({ ...input, brand: '' }, []), /brand/);
  assert.equal(f.calls.length, 0); assert.equal(f.controller.getState().draft.input.brand, '');
  await f.controller.saveDraft(input, []); await assert.rejects(f.controller.createOrRetry(), /at least one photo/); assert.equal(f.calls.length, 0);
});
test('dispose during create removes observers and visible callbacks, preserving durable unknown attempt', async () => {
  const gate = deferred(); const f = draftFixture(); f.api.createProfile = () => gate.promise;
  let events = 0; f.controller.subscribe(() => { events++; });
  const pending = f.controller.createOrRetry(input, [photo()]); await tick();
  const persisted = JSON.parse([...f.storage.values.values()][0]).draft; assert.equal(persisted.uncertain, true);
  f.controller.dispose(); const before = events; gate.resolve(result); await assert.rejects(pending, NativeSessionChangedError);
  assert.equal(events, before); assert.equal(f.controller.getState().draft, null);
  const reopened = draftFixture({ storage: f.storage }); assert.equal((await reopened.controller.loadDraft()).uncertain, true);
});
test('disposing idle draft controller removes account subscription and rejects further mutation', async () => {
  const auth = simpleAuth(); const subscribe = auth.subscribe; let active = 0;
  auth.subscribe = fn => { active++; const cleanup = subscribe.call(auth, fn); return () => { active--; cleanup(); }; };
  const f = draftFixture({ auth }); assert.equal(active, 1); f.controller.dispose(); assert.equal(active, 0);
  await assert.rejects(f.controller.saveDraft(input, [photo()]), NativeSessionChangedError);
});
const stableFileId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const stableUploadId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const signedPath = actor + '/profile-uploads/' + stableUploadId + '/image-' + stableFileId + '.jpg';
const signedUrl = 'https://project.supabase.co/storage/v1/object/upload/sign/instrument-media/' + signedPath + '?token=upload-only';
test('direct upload handshake uses stable identity, tiny JSON and raw bytes without bearer credentials', async () => {
  const calls = [];
  const f = apiFixture(async (url, options) => {
    calls.push([url, options]);
    if (options.method === 'PUT') return new Response('', { status: 200 });
    const body = JSON.parse(options.body);
    return json({ ok: true, phase: body.action === 'prepare' ? 'upload' : 'complete', storagePath: signedPath, kind: 'image', signedUrl });
  });
  const selected = photo(); assert.equal(await f.api.uploadPhoto(actor, stableUploadId, selected.dataUrl, 0, stableFileId), signedPath);
  assert.equal(calls.length, 3);
  const prepare = JSON.parse(calls[0][1].body); assert.equal(prepare.expectedOwnerId, actor); assert.equal(prepare.fileId, stableFileId); assert.equal(prepare.size, 16); assert.ok(calls[0][1].body.length < 1024);
  assert.equal(calls[1][1].headers.Authorization, undefined); assert.equal(calls[1][1].headers.apikey, undefined); assert.equal(calls[1][1].credentials, 'omit'); assert.equal(calls[1][1].headers['x-upsert'], 'false');
  assert.ok(calls[1][1].body instanceof ArrayBuffer); assert.deepEqual(Buffer.from(calls[1][1].body), Buffer.from(selected.dataUrl.split(',')[1], 'base64'));
  assert.equal(JSON.parse(calls[2][1].body).action, 'complete');
});
test('already registered stable photo resumes without uploading the bytes twice', async () => {
  let calls = 0; const f = apiFixture(async (_url, options) => { calls++; assert.equal(options.method, 'POST'); return json({ ok: true, phase: 'complete', storagePath: signedPath, kind: 'image' }); });
  assert.equal(await f.api.uploadPhoto(actor, stableUploadId, photo().dataUrl, 0, stableFileId), signedPath); assert.equal(calls, 1);
});
test('lost PUT response is reconciled through complete before reporting a failure', async () => {
  const actions = []; const f = apiFixture(async (_url, options) => {
    if (options.method === 'PUT') throw new Error('lost network response');
    const action = JSON.parse(options.body).action; actions.push(action);
    return json({ ok: true, phase: action === 'prepare' ? 'upload' : 'complete', storagePath: signedPath, kind: 'image', signedUrl });
  });
  assert.equal(await f.api.uploadPhoto(actor, stableUploadId, photo().dataUrl, 0, stableFileId), signedPath); assert.deepEqual(actions, ['prepare', 'complete']);
});
test('unconfirmed direct upload retries with identical file metadata and never issues cleanup DELETE', async () => {
  const calls = []; let retry = false; const f = apiFixture(async (_url, options) => {
    calls.push(options);
    if (options.method === 'PUT') throw new Error('unknown PUT');
    const body = JSON.parse(options.body);
    if (body.action === 'complete' && !retry) return json({ ok: false, message: 'Upload not found yet', retryable: true }, 503);
    return json({ ok: true, phase: retry ? 'complete' : 'upload', storagePath: signedPath, kind: 'image', signedUrl });
  });
  await assert.rejects(f.api.uploadPhoto(actor, stableUploadId, photo().dataUrl, 0, stableFileId), /not found/); retry = true;
  await f.api.uploadPhoto(actor, stableUploadId, photo().dataUrl, 0, stableFileId);
  const prepares = calls.filter(call => call.method === 'POST' && JSON.parse(call.body).action === 'prepare'); assert.equal(prepares[0].body, prepares[1].body); assert.ok(calls.every(call => call.method !== 'DELETE'));
});
test('signed URL validation rejects host/path/token substitution before any customer bytes leave', async () => {
  for (const bad of [signedUrl.replace('project.supabase.co', 'attacker.example'), signedUrl.replace(actor, otherActor), signedUrl + '&token=second', signedUrl + '#fragment', signedUrl.replace('?token=upload-only', ''), signedUrl.replace('https://', 'http://')]) {
    let puts = 0; const f = apiFixture(async (_url, options) => { if (options.method === 'PUT') puts++; return json({ ok: true, phase: 'upload', storagePath: signedPath, kind: 'image', signedUrl: bad }); });
    await assert.rejects(f.api.uploadPhoto(actor, stableUploadId, photo().dataUrl, 0, stableFileId), /address is invalid/); assert.equal(puts, 0);
  }
});
test('account switch during upload preparation prevents raw transfer and completion for the prior actor', async () => {
  const gate = deferred(); const auth = simpleAuth(); let calls = 0;
  const f = apiFixture(async () => { calls++; return gate.promise; }, { auth });
  const pending = f.api.uploadPhoto(actor, stableUploadId, photo().dataUrl, 0, stableFileId); await tick(); auth.change(otherActor);
  gate.resolve(json({ ok: true, phase: 'upload', storagePath: signedPath, kind: 'image', signedUrl }));
  await assert.rejects(pending, NativeSessionChangedError); assert.equal(calls, 1);
});
test('new auth event supersedes a late initial session read rejection', async () => {
  const gate = deferred(); const f = authFixture({ getSession: () => gate.promise }); const stop = f.auth.start();
  f.clients[0].emit(session(actor)); gate.reject(new Error('stale initialization failure')); await tick();
  assert.equal(f.auth.getSnapshot().status, 'signed-in'); stop();
});
test('definitive staging reset rotates upload incarnations while preserving photo selection identity', async () => {
  const f = draftFixture(); f.api.createProfile = async () => { throw new NativeApiError('reset', { status: 409, code: 'upload_session_changed', resetUploads: true }); };
  await f.controller.saveDraft(input, [photo()]); const initial = f.controller.getState().draft;
  await assert.rejects(f.controller.createOrRetry(), /reset/); const reset = f.controller.getState().draft;
  assert.notEqual(reset.uploadFileIds[0], initial.uploadFileIds[0]); assert.equal(reset.photos[0].id, initial.photos[0].id); assert.equal(reset.photos[0].dataUrl, initial.photos[0].dataUrl);
  const seen = []; f.api.uploadPhoto = async (_actor, uploadId, _data, _index, fileId) => { seen.push(fileId); return actor + '/profile-uploads/' + uploadId + '/image-' + fileId + '.jpg'; }; f.api.createProfile = async () => result;
  await f.controller.createOrRetry(); assert.deepEqual(seen, reset.uploadFileIds);
});
test('uncertain retry never rotates upload file IDs, even after restart', async () => {
  const f = draftFixture(); await f.controller.saveDraft(input, [photo()]); const initial = f.controller.getState().draft.uploadFileIds;
  f.api.createProfile = async () => { throw new NativeApiError('unknown', { uncertain: true }); }; await assert.rejects(f.controller.createOrRetry());
  f.controller.dispose(); const reopened = draftFixture({ storage: f.storage }); assert.deepEqual((await reopened.controller.loadDraft()).uploadFileIds, initial);
});
test('new same-actor controller serializes behind a disposed pending encrypted save and keeps the latest edit', async () => {
  const encrypted = encryptedFixture(); const gate = deferred(); const originalWrite = encrypted.backend.writeFile;
  encrypted.backend.writeFile = async (...args) => { await gate.promise; return originalWrite(...args); };
  const first = draftFixture({ storage: encrypted.storage });
  const oldSave = first.controller.saveDraft({ ...input, model: 'Old partial form' }, []); await tick(); first.controller.dispose();
  const next = draftFixture({ storage: encrypted.storage }); let restored = false;
  const read = next.controller.loadDraft().then(draft => { restored = true; return draft; }); await tick(); assert.equal(restored, false);
  gate.resolve(); await assert.rejects(oldSave, NativeSessionChangedError); assert.equal((await read).input.model, 'Old partial form');
  await next.controller.saveDraft({ ...input, model: 'Latest form' }, []);
  const durable = await encrypted.storage.getItem('qrguitar.profile-draft.v1.' + actor);
  assert.equal(JSON.parse(durable).draft.input.model, 'Latest form');
});
test('contradictory reset/uncertain response fails closed and never authorizes staging reset', async () => {
  const f = apiFixture(async () => json({ ok: false, code: 'upload_session_changed', resetUploads: true, uncertain: true }, 409));
  await assert.rejects(f.api.createProfile(actor, '{}'), error => error.resetUploads === false && error.uncertain === true);
});

const selectionKey = 'qrguitar.android-photo-selection.v1';
const selectedResult = () => ({canceled:false,assets:[{base64:photo().dataUrl.split(',')[1],mimeType:'image/jpeg'}]});
function pickerFixture(options={}) {
  const f=draftFixture(options), calls={launch:0,pending:0}; let pendingResult=null;
  const dependencies={auth:f.auth,storage:f.storage,randomId:randomUUID,
    launch:async settings=>{calls.launch++;assert.equal(settings.base64,true);assert.equal(settings.exif,false);assert.ok(f.storage.values.has(selectionKey));return options.launch?options.launch(settings):selectedResult();},
    pending:async()=>{calls.pending++;if(options.pending)return options.pending();const result=pendingResult;pendingResult=null;return result;}};
  const picker=pickerLib.makeNativePhotoPicker(dependencies);
  return {...f,picker,pickerCalls:calls,dependencies,setPending:value=>{pendingResult=value;},
    restart(){const resumed=draftFixture({storage:f.storage,auth:f.auth});return {...resumed,picker:pickerLib.makeNativePhotoPicker(dependencies)};}};
}
test('Android selection persists actor/draft binding before launch and atomically applies one photo without upload/create',async()=>{
  const f=pickerFixture();const selected=await f.picker.pick(actor,f.controller,input,[]);
  assert.equal(selected.photos.length,1);assert.ok(selected.lastPhotoSelectionId);assert.equal(f.storage.values.has(selectionKey),false);assert.equal(f.calls.length,0);
  const durable=JSON.parse(f.storage.values.get('qrguitar.profile-draft.v1.'+actor)).draft;
  assert.equal(durable.lastPhotoSelectionId,selected.lastPhotoSelectionId);assert.deepEqual(durable.photos,selected.photos);
});
test('Android activity restart consumes pending result only for its original persisted draft',async()=>{
  const gate=deferred(),f=pickerFixture({launch:()=>gate.promise}),signal=new AbortController();
  void f.picker.pick(actor,f.controller,input,[],signal.signal).catch(()=>{});await tick();
  const target=JSON.parse(f.storage.values.get(selectionKey));signal.abort();f.controller.dispose();
  const resumed=f.restart();f.setPending(selectedResult());const restored=await resumed.picker.recover(actor,resumed.controller);
  assert.equal(restored.photos.length,1);assert.equal(restored.uploadId,target.uploadId);assert.equal(restored.idempotencyKey,target.idempotencyKey);assert.equal(restored.lastPhotoSelectionId,target.selectionId);
  assert.equal(resumed.calls.length,0);assert.equal(f.storage.values.has(selectionKey),false);
});
test('another account cannot consume or attach the original pending photo selection',async()=>{
  const gate=deferred(),f=pickerFixture({launch:()=>gate.promise});void f.picker.pick(actor,f.controller,input,[]).catch(()=>{});await tick();
  const original=f.storage.values.get(selectionKey),before=f.pickerCalls.pending;f.auth.change(otherActor);const restarted=f.restart();
  const otherController=draftLib.makeProfileDraftController(otherActor,{auth:f.auth,storage:f.storage,api:f.api,randomId:randomUUID});f.setPending(selectedResult());
  assert.equal(await restarted.picker.recover(otherActor,otherController),null);await assert.rejects(restarted.picker.pick(otherActor,otherController,input,[]),/previous account/);
  assert.equal(f.pickerCalls.pending,before);assert.equal(f.storage.values.get(selectionKey),original);assert.equal(otherController.getState().draft,null);
  f.auth.change(actor);const own=f.restart();assert.equal((await own.picker.recover(actor,own.controller)).photos.length,1);
});
test('late direct picker result after account switch is checkpointed for the original actor but never attached',async()=>{
  const gate=deferred(),f=pickerFixture({launch:()=>gate.promise}),pending=f.picker.pick(actor,f.controller,input,[]);await tick();f.auth.change(otherActor);gate.resolve(selectedResult());
  await assert.rejects(pending,NativeSessionChangedError);assert.equal(f.controller.getState().draft,null);
  const retained=JSON.parse(f.storage.values.get(selectionKey));assert.equal(retained.actorId,actor);assert.equal(retained.photos.length,1);
  f.auth.change(actor);const own=f.restart();assert.equal((await own.picker.recover(actor,own.controller)).photos.length,1);
});
test('lost selection cleanup cannot duplicate photos after controller/process restart',async()=>{
  const f=pickerFixture(),remove=f.storage.removeItem;let fail=true;
  f.storage.removeItem=async key=>{if(key===selectionKey&&fail){fail=false;throw Error('storage unavailable');}await remove(key);};
  const original=await f.picker.pick(actor,f.controller,input,[]);assert.equal(original.photos.length,1);assert.equal(f.storage.values.has(selectionKey),true);
  const resumed=f.restart(),restored=await resumed.picker.recover(actor,resumed.controller);
  assert.deepEqual(restored.photos,original.photos);assert.equal(restored.photos.length,1);assert.equal(f.pickerCalls.pending,1);assert.equal(resumed.calls.length,0);
});
test('temporary encrypted checkpoint failure retains consumed native photos in memory for safe retry',async()=>{
  const f=pickerFixture(),save=f.storage.setItem;let fail=true;
  f.storage.setItem=async(key,value)=>{if(key===selectionKey&&JSON.parse(value).photos&&fail){fail=false;throw Error('secure save failed');}await save(key,value);};
  await assert.rejects(f.picker.pick(actor,f.controller,input,[]),/secure save failed/);assert.equal(f.controller.getState().draft.photos.length,0);
  const restored=await f.picker.recover(actor,f.controller);assert.equal(restored.photos.length,1);assert.equal(f.pickerCalls.launch,1);assert.equal(f.calls.length,0);
});
test('picker never opens if durable binding fails and does not discard an existing draft',async()=>{
  const f=pickerFixture(),save=f.storage.setItem;f.storage.setItem=async(key,value)=>{if(key===selectionKey)throw Error('secure storage full');await save(key,value);};
  await assert.rejects(f.picker.pick(actor,f.controller,input,[photo()]),/secure storage full/);assert.equal(f.pickerCalls.launch,0);assert.equal(f.controller.getState().draft.photos.length,1);
});
for(const [label,result] of [['cancel',{canceled:true,assets:null}],['no result',null],['native error',{code:'ERR_PICKER',message:'private platform diagnostic'}]])test('pending '+label+' preserves draft and never uploads or creates',async()=>{
  const gate=deferred(),f=pickerFixture({launch:()=>gate.promise});void f.picker.pick(actor,f.controller,input,[photo()]).catch(()=>{});await tick();
  const resumed=f.restart();f.setPending(result);
  if(label==='native error')await assert.rejects(resumed.picker.recover(actor,resumed.controller),/choose the photos again/);else assert.equal(await resumed.picker.recover(actor,resumed.controller),null);
  assert.equal((await resumed.controller.loadDraft()).photos.length,1);assert.equal(f.storage.values.has(selectionKey),label==='no result');assert.equal(resumed.calls.length,0);
});
test('replaced draft quarantines pending selection without consuming its native result',async()=>{
  const gate=deferred(),f=pickerFixture({launch:()=>gate.promise});void f.picker.pick(actor,f.controller,input,[]).catch(()=>{});await tick();
  const prior=f.storage.values.get(selectionKey);await f.controller.discardDraft();await f.controller.saveDraft(input,[]);const resumed=f.restart();f.setPending(selectedResult());const before=f.pickerCalls.pending;
  await assert.rejects(resumed.picker.recover(actor,resumed.controller),/earlier or saved draft/);assert.equal(f.pickerCalls.pending,before);assert.equal(f.storage.values.get(selectionKey),prior);assert.equal(resumed.controller.getState().draft.photos.length,0);
});
test('uncertain saved create cannot receive recovered picker photos',async()=>{
  const gate=deferred(),f=pickerFixture({launch:()=>gate.promise});void f.picker.pick(actor,f.controller,input,[photo()]).catch(()=>{});await tick();
  f.api.createProfile=async()=>{throw new NativeApiError('unknown',{uncertain:true});};await assert.rejects(f.controller.createOrRetry());
  const resumed=f.restart();f.setPending(selectedResult());await assert.rejects(resumed.picker.recover(actor,resumed.controller),/earlier or saved draft/);
  assert.equal(resumed.controller.getState().draft.uncertain,true);assert.equal(resumed.controller.getState().draft.photos.length,1);assert.equal(resumed.calls.length,0);
});
test('temporary authentication failure retains the durable picker intent and native result',async()=>{
  const gate=deferred(),f=pickerFixture({launch:()=>gate.promise});void f.picker.pick(actor,f.controller,input,[]).catch(()=>{});await tick();const prior=f.storage.values.get(selectionKey),before=f.pickerCalls.pending;
  const resumed=f.restart(),acquire=f.auth.acquireSession;f.auth.acquireSession=async()=>{throw Error('refresh unavailable');};
  await assert.rejects(resumed.picker.recover(actor,resumed.controller),/refresh unavailable/);assert.equal(f.storage.values.get(selectionKey),prior);assert.equal(f.pickerCalls.pending,before);f.auth.acquireSession=acquire;
});
test('rapid picker and recovery calls are single-flight and native photos cannot be applied after unmount',async()=>{
  const gate=deferred(),f=pickerFixture({launch:()=>gate.promise}),signal=new AbortController(),pending=f.picker.pick(actor,f.controller,input,[],signal.signal);
  await assert.rejects(f.picker.pick(actor,f.controller,input,[]),/already being handled/);await assert.rejects(f.picker.recover(actor,f.controller),/already being handled/);await tick();signal.abort();f.controller.dispose();gate.resolve(selectedResult());
  await assert.rejects(pending,NativeSessionChangedError);assert.equal(f.pickerCalls.launch,1);assert.equal(JSON.parse(f.storage.values.get(selectionKey)).photos.length,1);assert.equal(f.calls.length,0);
});

async function foreignCheckpointFixture() {
  const gate=deferred(),f=pickerFixture({launch:()=>gate.promise}),pending=f.picker.pick(actor,f.controller,input,[]);
  await tick();f.auth.change(otherActor);gate.resolve(selectedResult());await assert.rejects(pending,NativeSessionChangedError);
  const checkpoint=f.storage.values.get(selectionKey),otherController=draftLib.makeProfileDraftController(otherActor,{auth:f.auth,storage:f.storage,api:f.api,randomId:randomUUID});
  return {...f,checkpoint,otherController,otherPicker:pickerLib.makeNativePhotoPicker({...f.dependencies,launch:async()=>selectedResult()})};
}
const savedSelectionKey=owner=>selectionKey+'.saved.'+owner;

test('checkpointed foreign photos move to the original encrypted actor slot before another account selects',async()=>{
  const f=await foreignCheckpointFixture(),original=JSON.parse(f.checkpoint);
  const other=await f.otherPicker.pick(otherActor,f.otherController,{...input,brand:'Other account'},[]);
  assert.equal(f.storage.values.get(savedSelectionKey(actor)),f.checkpoint);assert.equal(other.actorId,otherActor);assert.equal(other.photos.length,1);assert.notEqual(other.photos[0].id,original.photos[0].id);assert.equal(f.storage.values.has(selectionKey),false);
  f.auth.change(actor);const own=f.restart(),restored=await own.picker.recover(actor,own.controller);
  assert.deepEqual(restored.photos,original.photos);assert.equal(restored.input.brand,input.brand);assert.equal(f.storage.values.has(savedSelectionKey(actor)),false);assert.equal(f.calls.length,0);assert.equal(own.calls.length,0);
});

for(const commitThenFail of [false,true])test('foreign archive write failure '+(commitThenFail?'after':'before')+' commit preserves original photos and blocks a new launch',async()=>{
  const f=await foreignCheckpointFixture(),save=f.storage.setItem;let fail=true,launches=0;
  f.storage.setItem=async(key,value)=>{if(key===savedSelectionKey(actor)&&fail){fail=false;if(commitThenFail)await save(key,value);throw Error('archive unavailable');}await save(key,value);};
  const picker=pickerLib.makeNativePhotoPicker({...f.dependencies,launch:async()=>{launches++;return selectedResult();}});
  await assert.rejects(picker.pick(otherActor,f.otherController,input,[]),/archive unavailable/);assert.equal(f.storage.values.get(selectionKey),f.checkpoint);assert.equal(launches,0);assert.equal(f.otherController.getState().draft,null);
  assert.equal((await picker.pick(otherActor,f.otherController,input,[])).photos.length,1);assert.equal(launches,1);assert.equal(f.storage.values.get(savedSelectionKey(actor)),f.checkpoint);
});

test('discard of original actor archive neither consumes nor deletes another actor native selection',async()=>{
  const f=await foreignCheckpointFixture(),original=JSON.parse(f.checkpoint);
  await f.otherPicker.pick(otherActor,f.otherController,input,[]);const otherIntent={...original,actorId:otherActor,selectionId:randomUUID(),photos:undefined};
  f.storage.values.set(selectionKey,JSON.stringify(otherIntent));const before=f.pickerCalls.pending;f.auth.change(actor);const own=f.restart();
  await own.picker.discard(actor);assert.equal(f.pickerCalls.pending,before);assert.equal(f.storage.values.get(selectionKey),JSON.stringify(otherIntent));assert.equal(f.storage.values.has(savedSelectionKey(actor)),false);assert.equal((await own.controller.loadDraft()).photos.length,0);
});

test('explicit discard releases an unapplicable selection while retaining the immutable uncertain create',async()=>{
  const gate=deferred(),f=pickerFixture({launch:()=>gate.promise});void f.picker.pick(actor,f.controller,input,[photo()]).catch(()=>{});await tick();
  f.api.createProfile=async()=>{throw new NativeApiError('unknown',{uncertain:true});};await assert.rejects(f.controller.createOrRetry());const original=JSON.stringify(f.controller.getState().draft);
  const own=f.restart();f.setPending(selectedResult());await own.picker.discard(actor);
  assert.equal(f.storage.values.has(selectionKey),false);assert.equal(JSON.stringify(await own.controller.loadDraft()),original);assert.equal(own.calls.length,0);
});

test('combined oversized pending photos can be explicitly abandoned without losing saved draft',async()=>{
  const data=Buffer.alloc(10*1024*1024);data.set([255,216,255,224]);const largeResult={canceled:false,assets:[1,2].map(()=>({base64:data.toString('base64'),mimeType:'image/jpeg'}))};
  const f=pickerFixture({launch:async()=>largeResult});await assert.rejects(f.picker.pick(actor,f.controller,input,[]),/16 MiB/);const original=JSON.stringify(f.controller.getState().draft);
  const own=f.restart();await assert.rejects(own.picker.recover(actor,own.controller),/16 MiB/);await own.picker.discard(actor);
  assert.equal(f.storage.values.has(selectionKey),false);assert.equal(JSON.stringify(await own.controller.loadDraft()),original);assert.equal(own.calls.length,0);
});

test('known in-memory photos survive checkpoint failure followed by account switch and actor archive',async()=>{
  const f=pickerFixture(),save=f.storage.setItem;let fail=true;
  f.storage.setItem=async(key,value)=>{if(key===selectionKey&&JSON.parse(value).photos&&fail){fail=false;throw Error('secure save failed');}await save(key,value);};
  await assert.rejects(f.picker.pick(actor,f.controller,input,[]),/secure save failed/);f.auth.change(otherActor);
  const other=draftLib.makeProfileDraftController(otherActor,{auth:f.auth,storage:f.storage,api:f.api,randomId:randomUUID});await f.picker.pick(otherActor,other,input,[]);
  assert.equal(JSON.parse(f.storage.values.get(savedSelectionKey(actor))).photos.length,1);f.auth.change(actor);const own=f.restart();assert.equal((await own.picker.recover(actor,own.controller)).photos.length,1);assert.equal(own.calls.length,0);
});

test('corrupt selection remains private and is not silently removed or consumed',async()=>{
  for(const raw of ['{private-image-data','null',JSON.stringify({version:1,photos:[null]})]) {
    const f=pickerFixture();f.storage.values.set(selectionKey,raw);await assert.rejects(f.picker.recover(actor,f.controller),error=>/unreadable/.test(error.message)&&!error.message.includes('private-image-data'));
    assert.equal(f.storage.values.get(selectionKey),raw);assert.equal(f.pickerCalls.pending,0);assert.equal(f.pickerCalls.launch,0);
  }
});

test('null recovery and explicit discard cannot release an unresolved binding before a late result and account switch',async()=>{
  const f=pickerFixture({launch:async()=>{throw Error('activity interrupted');}});await assert.rejects(f.picker.pick(actor,f.controller,input,[]),/activity interrupted/);
  const original=f.storage.values.get(selectionKey),resumed=f.restart();assert.equal(await resumed.picker.recover(actor,resumed.controller),null);
  await assert.rejects(resumed.picker.discard(actor),/has not returned yet/);await assert.rejects(resumed.picker.pick(actor,resumed.controller,input,[]),/has not returned yet/);
  assert.equal(f.storage.values.get(selectionKey),original);assert.equal(f.pickerCalls.launch,1);f.auth.change(otherActor);
  const other=draftLib.makeProfileDraftController(otherActor,{auth:f.auth,storage:f.storage,api:f.api,randomId:randomUUID}),before=f.pickerCalls.pending;
  await assert.rejects(resumed.picker.pick(otherActor,other,input,[]),/previous account/);assert.equal(f.pickerCalls.pending,before);assert.equal(other.getState().draft,null);
  f.setPending(selectedResult());f.auth.change(actor);const own=f.restart(),restored=await own.picker.recover(actor,own.controller);
  assert.equal(restored.lastPhotoSelectionId,JSON.parse(original).selectionId);assert.equal(restored.photos.length,1);assert.equal(f.storage.values.has(selectionKey),false);assert.equal(own.calls.length,0);
});

for(const [label,asset] of [['missing bytes',{uri:'file:///private/photo.jpg'}],['unsupported bytes',{base64:Buffer.from('not an image').toString('base64')}],['oversized image',{base64:Buffer.alloc(12*1024*1024+1).toString('base64')}]])test('consumed '+label+' result keeps terminal receipt so explicit discard works after restart',async()=>{
  const f=pickerFixture({launch:async()=>{throw Error('activity interrupted');}});await assert.rejects(f.picker.pick(actor,f.controller,input,[photo()]));const original=JSON.stringify(f.controller.getState().draft);
  f.setPending({canceled:false,assets:[asset]});const resumed=f.restart();await assert.rejects(resumed.picker.recover(actor,resumed.controller),/could not be read/);
  const saved=JSON.parse(f.storage.values.get(selectionKey));assert.equal(saved.resultReceived,true);assert.equal(saved.photos,undefined);
  const again=f.restart(),before=f.pickerCalls.pending;await assert.rejects(again.picker.recover(actor,again.controller),/finished but could not be restored/);await again.picker.discard(actor);
  assert.equal(f.pickerCalls.pending,before);assert.equal(f.storage.values.has(selectionKey),false);assert.equal(JSON.stringify(await again.controller.loadDraft()),original);assert.equal(again.calls.length,0);
});

test('account change during confirmed discard checkpoints a consumed result before retiring the original lease',async()=>{
  const f=pickerFixture({launch:async()=>{throw Error('activity interrupted');}});await assert.rejects(f.picker.pick(actor,f.controller,input,[photo()]));const original=JSON.stringify(f.controller.getState().draft);
  const gate=deferred(),picker=pickerLib.makeNativePhotoPicker({...f.dependencies,pending:()=>gate.promise}),discarding=picker.discard(actor);await tick();f.auth.change(otherActor);gate.resolve(selectedResult());
  await assert.rejects(discarding,NativeSessionChangedError);const retained=JSON.parse(f.storage.values.get(selectionKey));assert.equal(retained.actorId,actor);assert.equal(retained.resultReceived,true);assert.equal(retained.photos,undefined);
  f.auth.change(actor);const own=f.restart(),before=f.pickerCalls.pending;await own.picker.discard(actor);
  assert.equal(f.pickerCalls.pending,before);assert.equal(f.storage.values.has(selectionKey),false);assert.equal(JSON.stringify(await own.controller.loadDraft()),original);assert.equal(own.calls.length,0);
});

const identifiedKey = id => 'qrguitar.android-photo-selection.v2.' + id;
function identifiedFixture(options = {}) {
  const f = draftFixture(options), journal = new Map(), nativeCalls = [], events = new Set();
  const publish = record => { journal.set(record.selectionId, structuredClone(record)); for (const event of events) event({selectionId:record.selectionId,status:record.status}); return structuredClone(record); };
  const bridge = {
    isAvailable: () => options.available !== false,
    startSelectionAsync: async (id, settings) => {
      nativeCalls.push(['start',id,settings]);
      assert.equal(JSON.parse(await f.storage.getItem(identifiedKey(f.auth.getSnapshot().session.user.id))).selectionId,id);
      if (journal.has(id)) return structuredClone(journal.get(id));
      const record = options.pending ? {selectionId:id,status:'pending'} : {selectionId:id,status:'ready',resultId:randomUUID(),photos:options.photos || [photo()]};
      return publish(record);
    },
    readSelectionAsync: async id => { nativeCalls.push(['read',id]); return structuredClone(journal.get(id) || {selectionId:id,status:'missing'}); },
    acknowledgeSelectionAsync: async (id,resultId) => {
      nativeCalls.push(['ack',id,resultId]);
      const current=journal.get(id);
      if (current?.status==='acknowledged') return structuredClone(current);
      assert.equal(current?.status,'ready');assert.equal(current.resultId,resultId);
      return publish({selectionId:id,status:'acknowledged'});
    },
    discardSelectionAsync: async id => { nativeCalls.push(['discard',id]); return publish({selectionId:id,status:'discarded'}); },
    subscribe: listener => { events.add(listener);return ()=>events.delete(listener); },
  };
  const dependencies={auth:f.auth,storage:f.storage,randomId:randomUUID,bridge,...(options.legacy?{legacy:options.legacy}:{})};
  const picker=identifiedPickerLib.makeIdentifiedNativePhotoPicker(dependencies);
  function restart(actorId=actor) {
    const controller=draftLib.makeProfileDraftController(actorId,{auth:f.auth,storage:f.storage,api:f.api,randomId:randomUUID});
    return {controller,picker:identifiedPickerLib.makeIdentifiedNativePhotoPicker(dependencies)};
  }
  return {...f,picker,bridge,journal,nativeCalls,publish,dependencies,restart,
    marker: (id=actor)=>JSON.parse(f.storage.values.get(identifiedKey(id)) || 'null')};
}

test('identified native result is acknowledged only after the real encrypted draft receipt commits',async()=>{
  const f=identifiedFixture(),ack=f.bridge.acknowledgeSelectionAsync;
  f.bridge.acknowledgeSelectionAsync=async(id,resultId)=>{
    const saved=JSON.parse(await f.storage.getItem('qrguitar.profile-draft.v1.'+actor)).draft;
    assert.equal(saved.lastPhotoSelectionId,id);assert.equal(saved.photos.length,1);
    return ack(id,resultId);
  };
  const draft=await f.picker.pick(actor,f.controller,input,[]);
  assert.equal(draft.photos.length,1);assert.equal(f.marker(),null);assert.equal(f.journal.get(draft.lastPhotoSelectionId).status,'acknowledged');assert.equal(f.calls.length,0);
});

for(const committed of [false,true])test('identified intent-save failure '+(committed?'after':'before')+' commit never launches native',async()=>{
  const f=identifiedFixture(),save=f.storage.setItem;
  f.storage.setItem=async(key,value)=>{if(key===identifiedKey(actor)){if(committed)await save(key,value);throw Error('secure intent unavailable');}return save(key,value);};
  await assert.rejects(f.picker.pick(actor,f.controller,input,[photo()]),/intent unavailable/);
  assert.equal(f.nativeCalls.length,0);assert.equal(f.controller.getState().draft.photos.length,1);
  f.storage.setItem=save;
  if(committed){const own=f.restart();await own.picker.discard(actor);assert.equal(f.journal.get([...f.journal.keys()][0]).status,'discarded');assert.equal(f.marker(),null);}
});

for(const committed of [false,true])test('identified result survives process loss when application storage fails '+(committed?'after':'before')+' commit',async()=>{
  const f=identifiedFixture(),save=f.storage.setItem;let failure=true;
  f.storage.setItem=async(key,value)=>{if(key==='qrguitar.profile-draft.v1.'+actor&&JSON.parse(value).draft.lastPhotoSelectionId&&failure){failure=false;if(committed)await save(key,value);throw Error('application write failed');}return save(key,value);};
  await assert.rejects(f.picker.pick(actor,f.controller,input,[]),/write failed/);
  const id=f.marker().selectionId,original=structuredClone(f.journal.get(id));assert.equal(original.status,'ready');assert.equal(f.nativeCalls.filter(c=>c[0]==='ack').length,0);
  const own=f.restart(),draft=await own.picker.recover(actor,own.controller);
  assert.deepEqual(draft.photos,original.photos);assert.equal(draft.lastPhotoSelectionId,id);assert.equal(f.marker(),null);assert.equal(f.journal.get(id).status,'acknowledged');assert.equal(f.calls.length,0);
});

for(const committed of [false,true])test('native ack failure '+(committed?'after':'before')+' commit reconciles without duplicate photos or launching a replacement',async()=>{
  const f=identifiedFixture(),ack=f.bridge.acknowledgeSelectionAsync;let fail=true;
  f.bridge.acknowledgeSelectionAsync=async(...args)=>{if(fail){fail=false;if(committed)await ack(...args);throw Error('ack response lost');}return ack(...args);};
  const first=await f.picker.pick(actor,f.controller,input,[]),id=f.marker().selectionId;
  assert.equal(first.photos.length,1);assert.equal(f.nativeCalls.filter(c=>c[0]==='start').length,1);
  const own=f.restart(),recovered=await own.picker.pick(actor,own.controller,{...input,brand:'Never a replacement'},[]);
  assert.deepEqual(recovered.photos,first.photos);assert.equal(recovered.input.brand,input.brand);assert.equal(f.marker(),null);assert.equal(f.journal.get(id).status,'acknowledged');assert.equal(f.nativeCalls.filter(c=>c[0]==='start').length,1);
});

for(const committed of [false,true])test('marker cleanup failure '+(committed?'after':'before')+' commit retains durable photos across coordinator restart',async()=>{
  const f=identifiedFixture(),remove=f.storage.removeItem;let fail=true;
  f.storage.removeItem=async key=>{if(key===identifiedKey(actor)&&fail){fail=false;if(committed)await remove(key);throw Error('cleanup unavailable');}return remove(key);};
  const first=await f.picker.pick(actor,f.controller,input,[]),own=f.restart();
  await own.picker.recover(actor,own.controller);
  assert.deepEqual((await own.controller.loadDraft()).photos,first.photos);assert.equal(f.marker(),null);assert.equal(f.nativeCalls.filter(c=>c[0]==='start').length,1);
});

test('native request IDs keep unresolved selections separate across accounts and reject an old A-B-A lease',async()=>{
  const f=identifiedFixture({pending:true});await f.picker.pick(actor,f.controller,input,[]);const first=f.marker();
  f.auth.change(otherActor);const other=f.restart(otherActor);await other.picker.pick(otherActor,other.controller,{...input,brand:'Other'},[]);const second=f.marker(otherActor);assert.notEqual(first.selectionId,second.selectionId);
  const selectedA={selectionId:first.selectionId,status:'ready',resultId:randomUUID(),photos:[photo()]};f.publish(selectedA);
  assert.equal(await other.picker.recover(otherActor,other.controller),null);assert.equal((await other.controller.loadDraft()).photos.length,0);assert.equal(f.journal.get(first.selectionId).status,'ready');
  f.auth.change(actor);const own=f.restart(),gate=deferred(),read=f.bridge.readSelectionAsync;f.bridge.readSelectionAsync=()=>gate.promise;
  const pending=own.picker.recover(actor,own.controller);await tick();f.auth.change(otherActor);f.auth.change(actor);gate.resolve(selectedA);await assert.rejects(pending,NativeSessionChangedError);assert.equal(f.journal.get(first.selectionId).status,'ready');
  f.bridge.readSelectionAsync=read;const fresh=f.restart(),restored=await fresh.picker.recover(actor,fresh.controller);assert.deepEqual(restored.photos,selectedA.photos);assert.equal(f.journal.get(second.selectionId).status,'pending');
});

test('identified pending and missing requests can be deliberately discarded with draft preserved',async()=>{
  for(const missing of [false,true]){
    const f=identifiedFixture({pending:true});await f.picker.pick(actor,f.controller,input,[photo()]);const id=f.marker().selectionId,before=JSON.stringify(f.controller.getState().draft);
    if(missing)f.journal.delete(id);
    await assert.rejects(f.picker.pick(actor,f.controller,input,[]),/still pending/);
    await f.picker.discard(actor);assert.equal(f.journal.get(id).status,'discarded');assert.equal(f.marker(),null);assert.equal(JSON.stringify(await f.controller.loadDraft()),before);
    assert.equal(f.calls.length,0);
  }
});

for(const committed of [false,true])test('discard native failure '+(committed?'after':'before')+' commit is not treated as successful marker removal',async()=>{
  const f=identifiedFixture({pending:true});await f.picker.pick(actor,f.controller,input,[]);const id=f.marker().selectionId,discard=f.bridge.discardSelectionAsync;let fail=true;
  f.bridge.discardSelectionAsync=async(...args)=>{if(fail){fail=false;if(committed)await discard(...args);throw Error('discard unavailable');}return discard(...args);};
  await assert.rejects(f.picker.discard(actor),/unavailable/);assert.equal(f.marker().selectionId,id);
  const own=f.restart();await own.picker.discard(actor);assert.equal(f.marker(),null);assert.equal(f.journal.get(id).status,'discarded');
});

test('ready result with foreign ID, bad count or duplicate IDs never corrupts the recoverable intent',async()=>{
  for(const invalid of [r=>({...r,selectionId:randomUUID()}),r=>({...r,photos:Array.from({length:9},()=>photo())}),r=>({...r,photos:[r.photos[0],r.photos[0]]})]){
    const f=identifiedFixture({pending:true});await f.picker.pick(actor,f.controller,input,[photo()]);const id=f.marker().selectionId,before=JSON.stringify(f.controller.getState().draft),read=f.bridge.readSelectionAsync;
    f.bridge.readSelectionAsync=async()=>invalid({selectionId:id,status:'ready',resultId:randomUUID(),photos:[photo()]});
    await assert.rejects(f.picker.recover(actor,f.controller));assert.equal(f.nativeCalls.filter(c=>c[0]==='ack').length,0);assert.equal(f.marker().selectionId,id);assert.equal(JSON.stringify(await f.controller.loadDraft()),before);
    f.bridge.readSelectionAsync=read;await f.picker.discard(actor);assert.equal(f.marker(),null);
  }
});

test('a valid native payload that exceeds combined draft byte limits stays native until deliberate discard',async()=>{
  const bytes=Buffer.alloc(9*1024*1024);bytes.set([255,216,255,224]);const large=()=>({id:randomUUID(),dataUrl:'data:image/jpeg;base64,'+bytes.toString('base64')});
  const f=identifiedFixture({photos:[large(),large()]});await assert.rejects(f.picker.pick(actor,f.controller,input,[]),/16 MiB/);
  assert.equal(f.journal.get(f.marker().selectionId).status,'ready');assert.equal(f.marker().photos,undefined);assert.equal((await f.controller.loadDraft()).photos.length,0);assert.equal(f.nativeCalls.filter(c=>c[0]==='ack').length,0);
  const own=f.restart();await own.picker.discard(actor);assert.equal(f.marker(),null);
});

test('frozen or replaced drafts cannot receive native photos and retain a usable discard path',async()=>{
  for(const frozen of [false,true]){
    const f=identifiedFixture({pending:true});await f.picker.pick(actor,f.controller,input,[photo()]);const id=f.marker().selectionId;
    if(frozen){f.api.createProfile=async()=>{throw new NativeApiError('unknown',{uncertain:true});};await assert.rejects(f.controller.createOrRetry());}
    else{await f.controller.discardDraft();await f.controller.saveDraft(input,[]);}
    const before=JSON.stringify(f.controller.getState().draft);f.publish({selectionId:id,status:'ready',resultId:randomUUID(),photos:[photo()]});
    await assert.rejects(f.picker.recover(actor,f.controller));assert.equal(f.journal.get(id).status,'ready');await f.picker.discard(actor);assert.equal(JSON.stringify(await f.controller.loadDraft()),before);
  }
});

test('identified cancellation clears only its marker and does not upload or change draft',async()=>{
  const f=identifiedFixture({pending:true});await f.picker.pick(actor,f.controller,input,[photo()]);const id=f.marker().selectionId,before=JSON.stringify(f.controller.getState().draft);
  f.publish({selectionId:id,status:'cancelled'});assert.equal(await f.picker.recover(actor,f.controller),null);assert.equal(f.marker(),null);assert.equal(JSON.stringify(await f.controller.loadDraft()),before);assert.equal(f.calls.length,0);
});

test('absent native capability fails before intent or anonymous fallback while saved draft still loads',async()=>{
  const f=identifiedFixture({available:false});await f.controller.saveDraft(input,[photo()]);const before=JSON.stringify(f.controller.getState().draft);
  await assert.rejects(f.picker.pick(actor,f.controller,input,[]),/updated QRguitar app/);assert.equal(f.marker(),null);assert.equal(f.nativeCalls.length,0);assert.equal(await f.picker.recover(actor,f.controller),null);assert.equal(JSON.stringify(await f.controller.loadDraft()),before);
});

test('native event subscription filters request identity, current account lease and unsubscribe',async()=>{
  const f=identifiedFixture({pending:true});await f.picker.pick(actor,f.controller,input,[]);let notifications=0;const stop=f.picker.subscribe(actor,()=>notifications++),id=f.marker().selectionId;
  f.publish({selectionId:randomUUID(),status:'cancelled'});await tick();assert.equal(notifications,0);
  f.publish({selectionId:id,status:'ready',resultId:randomUUID(),photos:[photo()]});await tick();assert.equal(notifications,1);
  f.auth.change(otherActor);f.publish({selectionId:id,status:'cancelled'});await tick();assert.equal(notifications,1);f.auth.change(actor);stop();f.publish({selectionId:id,status:'cancelled'});await tick();assert.equal(notifications,1);
});

test('legacy excessive asset count leaves a terminal readable selection that the owner can discard',async()=>{
  const selected=selectedResult(),f=pickerFixture({launch:async()=>({...selected,assets:Array.from({length:9},()=>selected.assets[0])})});
  await assert.rejects(f.picker.pick(actor,f.controller,input,[]));const saved=JSON.parse(f.storage.values.get(selectionKey));assert.equal(saved.resultReceived,true);assert.equal(saved.photos,undefined);
  const own=f.restart();await own.picker.discard(actor);assert.equal(f.storage.values.has(selectionKey),false);assert.equal((await own.controller.loadDraft()).photos.length,0);
});

test('legacy unresolved selection can be abandoned only by its owner after the anonymous launch channel is retired',async()=>{
  const f=pickerFixture({launch:async()=>{throw Error('activity interrupted');}});await assert.rejects(f.picker.pick(actor,f.controller,input,[photo()]));const before=f.pickerCalls.pending;
  const recovery=pickerLib.makeNativePhotoPicker({...f.dependencies,retiredAnonymousChannel:true});f.auth.change(otherActor);assert.equal(await recovery.hasPending(otherActor),false);await recovery.discard(otherActor);assert.equal(f.storage.values.has(selectionKey),true);
  f.auth.change(actor);assert.equal(await recovery.hasPending(actor),true);await recovery.discard(actor);assert.equal(f.pickerCalls.pending,before);assert.equal(f.storage.values.has(selectionKey),false);assert.equal((await f.controller.loadDraft()).photos.length,1);
});
