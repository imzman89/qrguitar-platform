import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
const require = createRequire(import.meta.url), ts = require('typescript');
const modulePath = fileURLToPath(new URL('../lib/native-association.ts', import.meta.url));
function loadTs(file) {
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('module', 'exports', source)(module, module.exports);
  return module.exports;
}
const { buildAppleAppSiteAssociation: apple, buildAndroidAssetLinks: android, NATIVE_APP_IDENTIFIER } = loadTs(modulePath);
const { parseQrInput } = loadTs(new URL('../../mobile/src/lib/qr-input.ts', import.meta.url));
const config = JSON.parse(fs.readFileSync(new URL('../../mobile/app.json', import.meta.url), 'utf8')).expo;
// Test-only syntactically valid identities, never published or treated as real certificates.
const team = 'T1E2S3T4I5';
const fingerprint = label => createHash('sha256').update('synthetic fixture ' + label).digest('hex').match(/../g).join(':').toUpperCase();
const current = fingerprint('current'), previous = fingerprint('previous');

test('association module passes strict standalone TypeScript without ambient app dependencies', () => {
  const program = ts.createProgram([modulePath], { strict: true, noEmit: true, skipLibCheck: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, types: [] });
  assert.deepEqual(ts.getPreEmitDiagnostics(program).map(error => ts.flattenDiagnosticMessageText(error.messageText, '\n')), []);
});
test('Apple publishes only explicit signer plus fixed existing bundle and instrument scope', () => {
  assert.equal(NATIVE_APP_IDENTIFIER, 'com.qrguitar.app');
  assert.deepEqual(apple(team), { applinks: { details: [{ appIDs: [team + '.com.qrguitar.app'], components: [{ '/': '/i/*' }] }] } });
  assert.equal(config.ios.bundleIdentifier, NATIVE_APP_IDENTIFIER);
  assert.deepEqual(Object.keys(apple(team)), ['applinks']);
});
for (const [label, value] of [
  ['missing', undefined], ['null', null], ['empty', ''], ['short', 'ABC123'],
  ['lowercase', 't1e2s3t4i5'], ['padded', ' ' + team], ['newline', team + '\n'],
  ['full identifier', team + '.com.qrguitar.app'], ['wildcard', '**********'],
  ['non-ASCII', 'Ｔ1E2S3T4I5'], ['number', 1234567890], ['object', { teamId: team }],
  ['array', [team]], ['placeholder syntax', '<TEAM_ID>'],
]) test('Apple fails closed for ' + label, () => assert.equal(apple(value), null));
test('Android publishes the fixed package with a real-shape explicit signing fingerprint', () => {
  const result = android(current);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].relation, ['delegate_permission/common.handle_all_urls']);
  assert.deepEqual(result[0].target, { namespace: 'android_app', package_name: 'com.qrguitar.app', sha256_cert_fingerprints: [current] });
  assert.deepEqual(result[0].relation_extensions['delegate_permission/common.handle_all_urls'].dynamic_app_link_components, [{ '/': '/i/*' }, { '/': '*', exclude: true }]);
  assert.equal(config.android.package, result[0].target.package_name);
});
test('actual signing rotation keeps all supplied fingerprints with deterministic normalization and deduplication', () => {
  const values = Object.freeze([previous.toLowerCase(), current, previous]);
  const expected = [current, previous].sort();
  assert.deepEqual(android(values)[0].target.sha256_cert_fingerprints, expected);
  assert.deepEqual(android(' ' + previous.toLowerCase() + ', ' + current + ' , ' + previous + ' ')[0].target.sha256_cert_fingerprints, expected);
  assert.deepEqual(values, [previous.toLowerCase(), current, previous]);
});
test('a malformed signer disables the entire rotation set instead of publishing a partial trust set', () => {
  assert.equal(android([current, 'invalid', previous]), null);
  assert.equal(android(current + ',invalid,' + previous), null);
});
for (const [label, value] of [
  ['missing', undefined], ['null', null], ['empty string', ''], ['whitespace', '  '],
  ['empty array', []], ['object', { fingerprint: current }], ['number', 123],
  ['compact hash', current.replaceAll(':', '')], ['SHA1 length', current.slice(0, 59)],
  ['non-hex', 'ZZ' + current.slice(2)], ['extra byte', current + ':AA'],
  ['leading empty member', ',' + current], ['trailing empty member', current + ','],
  ['array null member', [current, null]], ['nested array', [[current]]],
  ['newline inside', current.slice(0, 20) + '\n' + current.slice(20)],
  ['oversized string', current.repeat(44)], ['oversized set', Array(17).fill(current)],
  ['placeholder', '<ANDROID_SIGNING_SHA256>'],
]) test('Android fails closed for ' + label, () => assert.equal(android(value), null));
test('each payload is independent and output mutation cannot change later trust or path scope', () => {
  const firstApple = apple(team), firstAndroid = android(current);
  firstApple.applinks.details[0].components[0]['/'] = '/*';
  firstAndroid[0].target.sha256_cert_fingerprints.push(previous);
  firstAndroid[0].relation_extensions['delegate_permission/common.handle_all_urls'].dynamic_app_link_components[0]['/'] = '*';
  assert.deepEqual(apple(team).applinks.details[0].components, [{ '/': '/i/*' }]);
  assert.deepEqual(android(current)[0].target.sha256_cert_fingerprints, [current]);
  assert.deepEqual(android(current)[0].relation_extensions['delegate_permission/common.handle_all_urls'].dynamic_app_link_components, [{ '/': '/i/*' }, { '/': '*', exclude: true }]);
});
test('native declarations are exact per-host HTTPS instrument filters without wildcard hosts or extra routes', () => {
  assert.deepEqual(config.ios.associatedDomains, ['applinks:qrguitar.com', 'applinks:www.qrguitar.com']);
  assert.equal(config.android.intentFilters.length, 2);
  assert.deepEqual(config.android.intentFilters.map(filter => filter.data), [
    [{ scheme: 'https', host: 'qrguitar.com', pathPrefix: '/i/' }],
    [{ scheme: 'https', host: 'www.qrguitar.com', pathPrefix: '/i/' }],
  ]);
  assert.ok(config.android.intentFilters.every(filter => filter.autoVerify === true && filter.action === 'VIEW'));
});
// Scope checks below test our static declarations and existing parser, not an OS verification emulator.
function nativeStaticMatch(value) {
  const url = new URL(value);
  return config.android.intentFilters.some(filter => filter.data.some(data =>
    url.protocol === data.scheme + ':' && url.hostname === data.host && url.pathname.startsWith(data.pathPrefix)));
}
test('valid public instrument identities on both hosts stay reachable through declared HTTPS scope', () => {
  for (const host of ['qrguitar.com', 'www.qrguitar.com']) for (const suffix of ['', '/', '?source=label#photos']) {
    const value = 'https://' + host + '/i/QRG-A00174' + suffix;
    assert.equal(nativeStaticMatch(value), true);
    assert.equal(parseQrInput(value), 'QRG-A00174');
  }
});
test('static path boundaries exclude authentication account and admin links, even with misleading return queries', () => {
  for (const path of ['/account', '/account?section=privacy', '/login?next=/i/QRG-A00174', '/auth/callback', '/admin', '/api/instruments', '/dashboard/profile/QRG-A00174', '/service-work/QRG-A00174', '/i', '/instrument/QRG-A00174', '/i-lookalike/QRG-A00174', '/I/QRG-A00174', '/i/../account']) {
    const value = 'https://qrguitar.com' + path;
    assert.equal(nativeStaticMatch(value), false, path);
    assert.equal(parseQrInput(value), null, path);
  }
});
test('static scope never claims HTTP, external hosts, deceptive subdomains or custom schemes as verified HTTPS', () => {
  for (const value of ['http://qrguitar.com/i/QRG-A00174', 'https://preview.vercel.app/i/QRG-A00174', 'https://qrguitar.com.evil.test/i/QRG-A00174', 'https://other.qrguitar.com/i/QRG-A00174', 'qrguitar://i/QRG-A00174'])
    assert.equal(nativeStaticMatch(value), false);
});
test('a captured /i/ path still needs the existing native QR parser and cannot authorize arbitrary IDs or private views', () => {
  for (const path of ['/i/login', '/i/QRG-A00174/extra', '/i/QRG-A%2f00174', '/i/%E0%A4%A', '/i/QRG-']) {
    assert.equal(nativeStaticMatch('https://qrguitar.com' + path), true);
    assert.equal(parseQrInput('https://qrguitar.com' + path), null, path);
  }
});
