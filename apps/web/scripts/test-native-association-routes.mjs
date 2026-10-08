import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import test from 'node:test';
const require = createRequire(import.meta.url), ts = require('typescript');
function load(relative, dependencies = {}, environment = {}) {
  const source = fs.readFileSync(new URL(relative, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', 'process', code)(name => {
    assert.ok(Object.hasOwn(dependencies, name), 'unexpected route dependency: ' + name);
    return dependencies[name];
  }, module, module.exports, { env: environment });
  return module.exports;
}
const builders = load('../lib/native-association.ts');
const fixtures = [
  { platform: 'Apple', path: 'apple-app-site-association', key: 'QRGUITAR_APPLE_TEAM_ID', value: 'T1E2S3T4I5', builder: builders.buildAppleAppSiteAssociation },
  { platform: 'Android', path: 'assetlinks.json', key: 'QRGUITAR_ANDROID_SHA256_CERT_FINGERPRINTS', value: createHash('sha256').update('synthetic route fixture').digest('hex').match(/../g).join(':'), builder: builders.buildAndroidAssetLinks },
];
const route = (fixture, env) => load('../app/.well-known/' + fixture.path + '/route.ts', { '../../../lib/native-association': builders }, env);
for (const fixture of fixtures) {
  test(fixture.platform + ' actual public handler publishes configured JSON without redirects or authentication', async () => {
    const handler = route(fixture, { [fixture.key]: fixture.value });
    assert.equal(handler.dynamic, 'force-dynamic'); assert.equal(handler.revalidate, 0);
    const response = handler.GET();
    assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /^application\/json/);
    assert.equal(response.headers.get('location'), null); assert.equal(response.headers.get('set-cookie'), null);
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.deepEqual(await response.json(), fixture.builder(fixture.value));
  });
  test(fixture.platform + ' missing or invalid identity fails closed without reflecting configuration', async () => {
    for (const value of [undefined, '', 'PRIVATE_MALFORMED_IDENTITY', null]) {
      const response = route(fixture, { [fixture.key]: value, SUPABASE_SERVICE_ROLE_KEY: 'PRIVATE_SECRET' }).GET();
      assert.equal(response.status, 404); assert.match(response.headers.get('cache-control'), /no-store/);
      assert.equal(response.headers.get('location'), null); assert.deepEqual(await response.json(), { error: 'not_configured' });
    }
  });
  test(fixture.platform + ' configuration is read per request and can be removed without stale association', async () => {
    const env = {}, handler = route(fixture, env);
    assert.equal(handler.GET().status, 404); env[fixture.key] = fixture.value;
    assert.equal(handler.GET().status, 200); delete env[fixture.key];
    assert.equal(handler.GET().status, 404);
  });
  test(fixture.platform + ' platform setup is independent and browser auth cannot configure another signer', async () => {
    const other = fixtures.find(value => value !== fixture);
    const handler = route(fixture, { [other.key]: other.value });
    const response = handler.GET(new Request('https://www.qrguitar.com/.well-known/' + fixture.path + '?teamId=' + fixture.value, {
      headers: { authorization: 'Bearer PRIVATE_ACCESS', cookie: 'session=PRIVATE_SESSION', 'x-forwarded-host': 'attacker.invalid' },
    }));
    assert.equal(response.status, 404); assert.deepEqual(await response.json(), { error: 'not_configured' });
  });
}
