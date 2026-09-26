import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';
import test from 'node:test';

const root = path.resolve(process.argv[2] || fileURLToPath(new URL('../../../', import.meta.url)));
const sourcePath = path.join(root, 'apps/web/lib/supabase-http.ts');
assert.ok(fs.existsSync(sourcePath), `Missing checkout source: ${sourcePath}`);
const requireFromRoot = createRequire(path.join(root, 'package.json'));
const ts = requireFromRoot('typescript');
const compiled = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  fileName: sourcePath
}).outputText;

const savedEnv = {
  NODE_ENV: process.env.NODE_ENV,
  QRGUITAR_LOCAL_REVIEW: process.env.QRGUITAR_LOCAL_REVIEW,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
};
process.on('exit', () => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

function fixture({ baseUrl, mode = 'success', status = 200, payload = { ok: true } }) {
  const calls = [];
  function transport(kind) {
    return (url, options, callback) => {
      const call = { kind, url: String(url), options, writes: [], ended: false };
      calls.push(call);
      const request = new EventEmitter();
      request.write = chunk => { call.writes.push(String(chunk)); };
      request.destroy = error => { queueMicrotask(() => request.emit('error', error)); };
      request.end = () => {
        call.ended = true;
        queueMicrotask(() => {
          if (mode === 'network-error') return request.emit('error', new Error('mock network error'));
          if (mode === 'timeout') return request.emit('timeout');
          const response = new EventEmitter();
          response.statusCode = status;
          response.statusMessage = status === 200 ? 'OK' : 'Failure';
          response.setEncoding = () => {};
          callback(response);
          response.emit('data', JSON.stringify(payload));
          response.emit('end');
        });
      };
      return request;
    };
  }
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled)((name) => {
    if (name === 'node:http') return { request: transport('http') };
    if (name === 'node:https') return { request: transport('https') };
    if (name === './supabase-server') return { getSupabaseEnvStatus: () => ({ supabaseUrl: baseUrl }) };
    throw Error(`Unexpected import ${name}`);
  }, module, module.exports);
  return { api: module.exports, calls };
}

function environment({ nodeEnv = 'development', localReview = '1', anon = 'synthetic-anon-key', service = 'synthetic-service-key' } = {}) {
  process.env.NODE_ENV = nodeEnv;
  if (localReview === undefined) delete process.env.QRGUITAR_LOCAL_REVIEW;
  else process.env.QRGUITAR_LOCAL_REVIEW = localReview;
  if (anon === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = anon;
  if (service === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = service;
}

test('production HTTP rejects before auth headers or any transport call', () => {
  environment({ nodeEnv: 'production', anon: undefined, service: undefined });
  const { api, calls } = fixture({ baseUrl: 'http://127.0.0.1:3007' });
  assert.throws(() => api.supabaseHttpsJson('/rest/v1/guitars'), /require HTTPS/);
  assert.equal(calls.length, 0);
});

test('development nonloopback HTTP rejects before network', () => {
  environment();
  for (const url of ['http://localhost:3007', 'http://example.test', 'http://127.0.0.2:3007']) {
    const { api, calls } = fixture({ baseUrl: url });
    assert.throws(() => api.supabaseHttpsJson('/rest/v1/guitars'), /require HTTPS/, url);
    assert.equal(calls.length, 0, url);
  }
});

test('unflagged development loopback HTTP rejects before network', () => {
  for (const flag of ['0', 'missing']) {
    environment({ localReview: flag });
    if (flag === 'missing') delete process.env.QRGUITAR_LOCAL_REVIEW;
    const { api, calls } = fixture({ baseUrl: 'http://127.0.0.1:3007' });
    assert.throws(() => api.supabaseHttpsJson('/rest/v1/guitars'), /require HTTPS/);
    assert.equal(calls.length, 0);
  }
});

test('flagged development loopback uses HTTP, POST body, service auth, IPv4 and timeout', async () => {
  environment();
  const { api, calls } = fixture({ baseUrl: 'http://127.0.0.1:3007' });
  assert.deepEqual(await api.supabaseHttpsJson('/storage/v1/object/sign/test/path', {
    method: 'POST', serviceRole: true, body: { expiresIn: 3600 }, timeoutMs: 1234
  }), { ok: true });
  assert.equal(calls.length, 1);
  const call = calls[0];
  assert.equal(call.kind, 'http');
  assert.equal(call.url, 'http://127.0.0.1:3007/storage/v1/object/sign/test/path');
  assert.equal(call.options.family, 4);
  assert.equal(call.options.method, 'POST');
  assert.equal(call.options.timeout, 1234);
  assert.equal(call.options.headers.apikey, 'synthetic-service-key');
  assert.equal(call.options.headers.Authorization, 'Bearer synthetic-service-key');
  assert.equal(call.options.headers['Content-Type'], 'application/json');
  assert.equal(call.options.headers['Content-Length'], String(Buffer.byteLength(call.writes.join(''))));
  assert.deepEqual(JSON.parse(call.writes.join('')), { expiresIn: 3600 });
  assert.equal(call.ended, true);
});

test('HTTPS still uses HTTPS without review flag and keeps default GET/auth settings', async () => {
  environment({ nodeEnv: 'production', localReview: undefined });
  const { api, calls } = fixture({ baseUrl: 'https://supabase.example.test' });
  assert.deepEqual(await api.supabaseHttpsJson('/rest/v1/guitars'), { ok: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].kind, 'https');
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.timeout, 8000);
  assert.equal(calls[0].options.headers.apikey, 'synthetic-anon-key');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer synthetic-anon-key');
});

test('HTTPS preserves non-2xx rejection', async () => {
  environment({ nodeEnv: 'production' });
  const { api, calls } = fixture({ baseUrl: 'https://supabase.example.test', status: 503, payload: { message: 'mock unavailable' } });
  await assert.rejects(api.supabaseHttpsJson('/rest/v1/guitars'), /mock unavailable/);
  assert.equal(calls[0].kind, 'https');
});

test('HTTPS preserves network-error and timeout rejection', async () => {
  environment({ nodeEnv: 'production' });
  const network = fixture({ baseUrl: 'https://supabase.example.test', mode: 'network-error' });
  await assert.rejects(network.api.supabaseHttpsJson('/rest/v1/guitars'), /mock network error/);
  assert.equal(network.calls[0].kind, 'https');
  const timeout = fixture({ baseUrl: 'https://supabase.example.test', mode: 'timeout' });
  await assert.rejects(timeout.api.supabaseHttpsJson('/rest/v1/guitars'), /Supabase request timed out/);
  assert.equal(timeout.calls[0].kind, 'https');
});
