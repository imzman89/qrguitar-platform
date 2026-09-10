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
console.log('Native camera/photo permissions, no microphone/biometrics, secure transport, scheme and module resolution verified.');
