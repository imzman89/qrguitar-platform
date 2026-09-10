import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateExportEnvironment } from './export-environment.mjs';

const valid = { EXPO_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example' };
const jwt = role => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.example`;
test('release accepts publishable and legacy anon public configuration', () => {
  assert.doesNotThrow(() => validateExportEnvironment(valid));
  assert.doesNotThrow(() => validateExportEnvironment({ ...valid, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '', EXPO_PUBLIC_SUPABASE_ANON_KEY: jwt('anon') }));
});
test('release refuses missing, partial and malformed public configuration', () => {
  for (const env of [{}, { EXPO_PUBLIC_SUPABASE_URL: valid.EXPO_PUBLIC_SUPABASE_URL }, { ...valid, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'not-a-key' }, { ...valid, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_' }]) {
    assert.throws(() => validateExportEnvironment(env), /Set EXPO_PUBLIC_SUPABASE_URL/);
  }
});
test('release rejects server keys without echoing credential contents', () => {
  for (const secret of ['sb_secret_private-value', jwt('service_role'), jwt('authenticated')]) {
    assert.throws(() => validateExportEnvironment({ ...valid, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: secret }), error => !error.message.includes(secret) && /Server credentials/.test(error.message));
  }
});
test('Supabase configuration rejects cleartext, URL credentials and endpoint paths', () => {
  for (const url of ['http://example.supabase.co', 'https://person:password@example.supabase.co', 'https://example.supabase.co/auth/v1', 'https://example.supabase.co/?key=value', 'https://example.supabase.co/#key']) {
    assert.throws(() => validateExportEnvironment({ ...valid, EXPO_PUBLIC_SUPABASE_URL: url }));
  }
});
test('every release platform rejects development and foreign API origins', () => {
  for (const platform of ['all', 'android', 'ios', 'web']) {
    for (const origin of ['http://127.0.0.1:3014', 'https://qrguitar.com.evil.example', 'https://foreign.example']) {
      assert.throws(() => validateExportEnvironment({ ...valid, EXPO_PUBLIC_API_ORIGIN: origin }, { platform }));
    }
  }
});
test('only development web may use the exact local QA proxy', () => {
  assert.doesNotThrow(() => validateExportEnvironment({ ...valid, EXPO_PUBLIC_API_ORIGIN: 'http://127.0.0.1:3014' }, { development: true, platform: 'web' }));
  for (const platform of ['android', 'ios', 'all']) assert.throws(() => validateExportEnvironment({ ...valid, EXPO_PUBLIC_API_ORIGIN: 'http://127.0.0.1:3014' }, { development: true, platform }));
});
test('an entirely unconfigured dev build still opens the explanatory UI', () => {
  assert.doesNotThrow(() => validateExportEnvironment({}, { development: true, platform: 'web' }));
  assert.throws(() => validateExportEnvironment({ EXPO_PUBLIC_SUPABASE_URL: valid.EXPO_PUBLIC_SUPABASE_URL }, { development: true, platform: 'web' }));
});

test('the real export command fails before bundling when release configuration is missing or secret', async () => {
  const { spawnSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const script = fileURLToPath(new URL('./export-native.mjs', import.meta.url));
  const env = { ...process.env };
  for (const name of ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'EXPO_PUBLIC_SUPABASE_ANON_KEY', 'EXPO_PUBLIC_API_ORIGIN']) delete env[name];
  const missing = spawnSync(process.execPath, [script, '--platform', 'all'], { env, encoding: 'utf8' });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /Set EXPO_PUBLIC_SUPABASE_URL/);
  assert.doesNotMatch(missing.stdout, /Metro|Bundled/);
  const secret = 'sb_secret_never-print-this';
  const forbidden = spawnSync(process.execPath, [script, '--platform', 'ios'], { env: { ...env, ...valid, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: secret }, encoding: 'utf8' });
  assert.equal(forbidden.status, 1);
  assert.doesNotMatch(forbidden.stdout + forbidden.stderr, new RegExp(secret));
});
