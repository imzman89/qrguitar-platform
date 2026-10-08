import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireApp = createRequire(path.join(appRoot, 'package.json'));
const cli = path.join(path.dirname(requireApp.resolve('expo/package.json')), 'bin/cli');
const config = JSON.parse(execFileSync(process.execPath, [cli, 'config', '--type', 'introspect', '--json'], {
  cwd: appRoot, encoding: 'utf8', env: { ...process.env, CI: '1', EXPO_NO_TELEMETRY: '1' },
}));
const plist = config.ios.infoPlist;
assert.ok(plist.NSCameraUsageDescription, 'Camera requires a purpose string');
assert.ok(plist.NSPhotoLibraryUsageDescription, 'Photo selection requires a purpose string');
assert.equal(plist.NSMicrophoneUsageDescription, undefined, 'The app does not record audio');
assert.equal(plist.NSFaceIDUsageDescription, undefined, 'The app does not request biometric authentication');
assert.equal(plist.NSAppTransportSecurity.NSAllowsArbitraryLoads, false, 'Production connections require secure transport');
assert.ok(config.android.permissions.includes('android.permission.CAMERA'));
assert.ok(config.android.blockedPermissions.includes('android.permission.RECORD_AUDIO'));
assert.ok(!config.android.permissions.includes('android.permission.RECORD_AUDIO'));
assert.equal(config.scheme, 'qrguitar');
assert.equal(config.web.bundler, 'metro');
assert.equal(config.experiments.autolinkingModuleResolution, true);
assert.equal(config.ios.bundleIdentifier, 'com.qrguitar.app');
assert.equal(config.android.package, 'com.qrguitar.app');
const associationDomains = ['applinks:qrguitar.com', 'applinks:www.qrguitar.com'];
assert.deepEqual(config.ios.associatedDomains, associationDomains);
assert.deepEqual(config.ios.entitlements['com.apple.developer.associated-domains'], associationDomains);
assert.equal(config.android.intentFilters.length, 2);
for (const [index, host] of ['qrguitar.com', 'www.qrguitar.com'].entries()) {
  const filter = config.android.intentFilters[index];
  assert.equal(filter.action, 'VIEW');
  assert.equal(filter.autoVerify, true);
  assert.deepEqual(filter.category, ['BROWSABLE', 'DEFAULT']);
  assert.deepEqual(filter.data, [{ scheme: 'https', host, pathPrefix: '/i/' }]);
}
const manifest = config._internal.modResults.android.manifest.manifest;
const mainActivity = manifest.application[0].activity.find(activity => activity.$['android:name'] === '.MainActivity');
const verifiedFilters = mainActivity['intent-filter'].filter(filter => filter.$?.['android:autoVerify'] === 'true');
assert.equal(verifiedFilters.length, 2);
assert.deepEqual(verifiedFilters.flatMap(filter => filter.data.map(entry => entry.$)), [
  { 'android:scheme': 'https', 'android:host': 'qrguitar.com', 'android:pathPrefix': '/i/' },
  { 'android:scheme': 'https', 'android:host': 'www.qrguitar.com', 'android:pathPrefix': '/i/' },
]);
for (const filter of verifiedFilters) {
  assert.deepEqual(filter.action.map(action => action.$['android:name']), ['android.intent.action.VIEW']);
  assert.deepEqual(filter.category.map(category => category.$['android:name']).sort(), ['android.intent.category.BROWSABLE', 'android.intent.category.DEFAULT']);
}
console.log('Native permissions, secure transport, fixed app identity and generated iOS/Android HTTPS instrument-link scope verified. Installed-device association remains unverified.');
