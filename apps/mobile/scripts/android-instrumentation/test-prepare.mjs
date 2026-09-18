import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { patchApplication, patchDebugManifest, patchGradle, prepareInstalledTest } from '../prepare-installed-test.mjs';

const mobile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const gradle = `apply plugin: "com.android.application"\nreact { bundleCommand = "export:embed" }\nandroid { defaultConfig { applicationId 'com.qrguitar.app' }; buildTypes { debug { signingConfig signingConfigs.debug } } }\n`;
const app = 'package com.qrguitar.app\nclass MainApplication : Application(), ReactApplication {\nExpoReactHostFactory.getDefaultReactHost(\n      context = applicationContext,\n      packageList = PackageList(this).packages\n)\n}\n';
const manifest = '<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools">\n<application android:usesCleartextTraffic="true" />\n</manifest>\n';

test('generated Gradle overlay embeds debug bundle with app-target runner and is idempotent', () => {
  const value = patchGradle(gradle);
  assert.match(value, /debuggableVariants = \[\]/);
  assert.match(value, /AndroidJUnitRunner/);
  assert.match(value, /testInstrumentationRunnerArguments class: 'com\.qrguitar\.acceptance\.InstalledAcceptanceTest'/);
  assert.equal(patchGradle(value), value);
  assert.ok(value.startsWith(gradle.trimEnd()));
});
test('generated host disables developer support without changing the app entry and is idempotent', () => {
  const value = patchApplication(app.replace(/\n/g, '\r\n'));
  assert.match(value, /context = applicationContext,\r\n      useDevSupport = false,/);
  assert.match(value, /packageList = PackageList\(this\).packages/);
  assert.equal(patchApplication(value), value);
});
test('debug manifest removes only Internet permission and labels fixture, idempotently', () => {
  const value = patchDebugManifest(manifest);
  assert.match(value, /android.permission.INTERNET" tools:node="remove"/);
  assert.match(value, /not for release/);
  assert.match(value, /<application android:testOnly="true" /);
  assert.match(value, /android.provider.action.PICK_IMAGES/);
  assert.match(value, /android:usesCleartextTraffic="true"/);
  assert.equal(patchDebugManifest(value), value);
});
test('wrong app identity, altered host, existing policy and partial overlays fail closed', () => {
  assert.throws(() => patchGradle(gradle.replace('com.qrguitar.app', 'com.other.app')));
  assert.throws(() => patchGradle(gradle + '\ndebuggableVariants = ["debug"]'));
  assert.throws(() => patchGradle(gradle + '\ntestInstrumentationRunnerArguments class: "unexpected.Test"'));
  assert.throws(() => patchGradle(patchGradle(gradle).replace('runner:1.6.2', 'runner:changed')));
  assert.throws(() => patchApplication(app.replace('context = applicationContext', 'context = anotherContext')));
  assert.throws(() => patchApplication(app + '\nuseDevSupport = true'));
  assert.throws(() => patchDebugManifest(manifest.replace('</manifest>', '<uses-permission android:name="android.permission.INTERNET" /></manifest>')));
  assert.throws(() => patchDebugManifest(manifest.replace('<application ', '<application android:testOnly="false" ')));
  assert.throws(() => patchDebugManifest(manifest.replace('</manifest>', '<queries>different</queries></manifest>')));
});

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qrguitar-installed-test-'));
  const put = (relative, content) => { const file = path.join(root, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); };
  put('app.json', JSON.stringify({ expo: { android: { package: 'com.qrguitar.app' } } }));
  put('android/app/build.gradle', gradle);
  put('android/app/src/main/java/com/qrguitar/app/MainApplication.kt', app);
  put('android/app/src/debug/AndroidManifest.xml', manifest);
  for (const name of ['InstalledAcceptanceTest.java', 'ReadyProcessDeathAcceptanceTest.java']) {
    put('scripts/android-instrumentation/java/com/qrguitar/acceptance/' + name,
        fs.readFileSync(path.join(mobile, 'scripts/android-instrumentation/java/com/qrguitar/acceptance/' + name)));
  }
  return { root, put };
}
function withFixture(run) {
  const value = fixture();
  try { run(value); } finally {
    const resolved = fs.realpathSync(value.root);
    assert.ok(resolved.startsWith(fs.realpathSync(os.tmpdir()) + path.sep));
    assert.ok(path.basename(resolved).startsWith('qrguitar-installed-test-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}
test('check mode validates all five outputs without writing generated files', () => withFixture(({ root }) => {
  const outputs = prepareInstalledTest(root, { check: true });
  assert.equal(outputs.length, 5);
  assert.equal(fs.readFileSync(path.join(root, 'android/app/build.gradle'), 'utf8'), gradle);
  assert.equal(fs.existsSync(path.join(root, 'android/app/src/androidTest')), false);
}));
test('prepare writes only generated overlay targets and a second run is identical', () => withFixture(({ root, put }) => {
  put('src/App.tsx', 'keep original app');
  const outputs = prepareInstalledTest(root);
  const first = outputs.map(file => fs.readFileSync(path.join(root, file), 'utf8'));
  assert.deepEqual(prepareInstalledTest(root), outputs);
  assert.deepEqual(outputs.map(file => fs.readFileSync(path.join(root, file), 'utf8')), first);
  assert.equal(fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8'), 'keep original app');
}));
test('unrelated destination tests reject before any build or host mutation', () => withFixture(({ root, put }) => {
  put('android/app/src/androidTest/java/com/qrguitar/acceptance/InstalledAcceptanceTest.java', 'unrelated existing test');
  assert.throws(() => prepareInstalledTest(root), /unrelated test/);
  assert.equal(fs.readFileSync(path.join(root, 'android/app/build.gradle'), 'utf8'), gradle);
  assert.equal(fs.readFileSync(path.join(root, 'android/app/src/main/java/com/qrguitar/app/MainApplication.kt'), 'utf8'), app);
}));
test('unexpected overlay file list rejects before any generated mutation', () => withFixture(({ root, put }) => {
  put('scripts/android-instrumentation/java/com/qrguitar/acceptance/Other.java', 'unexpected');
  assert.throws(() => prepareInstalledTest(root), /Unexpected instrumentation/);
  assert.equal(fs.readFileSync(path.join(root, 'android/app/build.gradle'), 'utf8'), gradle);
}));
