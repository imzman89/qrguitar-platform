import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const marker = '// QRguitar installed acceptance overlay; generated CI project only.';
const endMarker = '// End QRguitar installed acceptance overlay.';
const hostArgument = '      useDevSupport = false, // QRguitar installed acceptance: embedded bundle only.';
const manifestRemoval = '    <!-- QRguitar installed acceptance only; this offline APK is not for release. -->\n    <uses-permission android:name="android.permission.INTERNET" tools:node="remove" />';
const manifestQueries = '    <queries>\n        <intent><action android:name="android.provider.action.PICK_IMAGES" /></intent>\n    </queries>';
const gradleOverlay = `${marker}
react {
    debuggableVariants = []
}
android {
    defaultConfig {
        testInstrumentationRunner 'androidx.test.runner.AndroidJUnitRunner'
        // The intentional-death helper runs only through the separate host controller.
        testInstrumentationRunnerArguments class: 'com.qrguitar.acceptance.InstalledAcceptanceTest'
    }
}
dependencies {
    androidTestImplementation 'androidx.test:runner:1.6.2'
    androidTestImplementation 'androidx.test.ext:junit:1.2.1'
    androidTestImplementation 'androidx.test.uiautomator:uiautomator:2.3.0'
}
${endMarker}`;

export function patchGradle(source) {
  assert.match(source, /apply plugin: "com\.android\.application"/);
  assert.match(source, /applicationId 'com\.qrguitar\.app'/);
  assert.match(source, /bundleCommand = "export:embed"/);
  assert.match(source, /signingConfig signingConfigs\.debug/);
  const normalized = source.replace(/\r\n/g, '\n');
  if (normalized.includes(marker)) {
    assert.equal(normalized.split(marker).length, 2, 'Duplicate acceptance overlay');
    assert.ok(normalized.endsWith(gradleOverlay + '\n'), 'Existing acceptance overlay differs');
    return source;
  }
  assert.ok(!normalized.includes(endMarker), 'Partial acceptance overlay');
  assert.ok(!/^\s*debuggableVariants\s*=/m.test(normalized), 'Unexpected existing variant override');
  assert.ok(!/^\s*testInstrumentationRunner\s/m.test(normalized), 'Unexpected existing app test runner');
  assert.ok(!/^\s*testInstrumentationRunnerArguments\s/m.test(normalized), 'Unexpected existing app test arguments');
  return normalized.trimEnd() + '\n\n' + gradleOverlay + '\n';
}

export function patchApplication(source) {
  assert.match(source, /^package com\.qrguitar\.app\s*$/m);
  assert.match(source, /class MainApplication : Application\(\), ReactApplication/);
  assert.equal(source.split('ExpoReactHostFactory.getDefaultReactHost(').length, 2, 'Unexpected host factory count');
  if (source.includes(hostArgument)) {
    assert.equal(source.split('useDevSupport').length, 2, 'Unexpected developer-support override');
    return source;
  }
  assert.ok(!source.includes('useDevSupport'), 'Unexpected developer-support override');
  const anchor = '      context = applicationContext,';
  assert.equal(source.split(anchor).length, 2, 'Unexpected host context shape');
  return source.replace(anchor, anchor + (source.includes('\r\n') ? '\r\n' : '\n') + hostArgument);
}

export function patchDebugManifest(source) {
  assert.match(source, /<manifest\s+xmlns:android="http:\/\/schemas\.android\.com\/apk\/res\/android"/);
  assert.match(source, /xmlns:tools="http:\/\/schemas\.android\.com\/tools"/);
  assert.equal(source.split('</manifest>').length, 2, 'Unexpected debug manifest');
  let normalized = source.replace(/\r\n/g, '\n');
  assert.equal(normalized.split('<application').length, 2, 'Unexpected debug application count');
  if (normalized.includes('android:testOnly')) {
    assert.equal(normalized.split('android:testOnly').length, 2, 'Duplicate debug testOnly policy');
    assert.equal(normalized.split('android:testOnly="true"').length, 2, 'Unexpected existing debug testOnly policy');
  } else {
    normalized = normalized.replace('<application ', '<application android:testOnly="true" ');
    assert.match(normalized, /<application android:testOnly="true" /);
  }
  if (normalized.includes('android.provider.action.PICK_IMAGES')) {
    assert.ok(normalized.includes(manifestQueries), 'Unexpected picker visibility query');
    assert.equal(normalized.split('android.provider.action.PICK_IMAGES').length, 2, 'Duplicate picker visibility query');
  } else {
    assert.ok(!normalized.includes('<queries'), 'Unexpected debug visibility queries');
    normalized = normalized.replace('</manifest>', manifestQueries + '\n</manifest>');
  }
  if (normalized.includes(manifestRemoval)) {
    assert.equal(normalized.split('android.permission.INTERNET').length, 2, 'Duplicate INTERNET declaration');
    return normalized;
  }
  assert.ok(!normalized.includes('android.permission.INTERNET'), 'Unexpected existing debug INTERNET policy');
  return normalized.replace('</manifest>', manifestRemoval + '\n</manifest>');
}

export function prepareInstalledTest(mobileRoot, { check = false } = {}) {
  const root = fs.realpathSync(mobileRoot);
  const config = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
  assert.equal(config.expo.android.package, 'com.qrguitar.app');
  const android = path.join(root, 'android');
  assert.equal(fs.realpathSync(android), android, 'Generated Android root must not be a symlink');
  const guardedPath = (relative) => {
    const destination = path.resolve(android, relative);
    assert.ok(destination.startsWith(android + path.sep), 'Output leaves generated Android root');
    let ancestor = destination;
    while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
    assert.equal(fs.realpathSync(ancestor), ancestor, 'Generated output ancestor must not be a symlink');
    return destination;
  };
  const gradle = guardedPath('app/build.gradle');
  const application = guardedPath('app/src/main/java/com/qrguitar/app/MainApplication.kt');
  const manifest = guardedPath('app/src/debug/AndroidManifest.xml');
  const writes = [
    [gradle, patchGradle(fs.readFileSync(gradle, 'utf8'))],
    [application, patchApplication(fs.readFileSync(application, 'utf8'))],
    [manifest, patchDebugManifest(fs.readFileSync(manifest, 'utf8'))],
  ];
  const testRoot = path.join(root, 'scripts/android-instrumentation/java/com/qrguitar/acceptance');
  const names = fs.readdirSync(testRoot).filter(name => name.endsWith('.java')).sort();
  assert.deepEqual(names, ['InstalledAcceptanceTest.java', 'ReadyProcessDeathAcceptanceTest.java'], 'Unexpected instrumentation overlay files');
  for (const name of names) {
    const content = fs.readFileSync(path.join(testRoot, name), 'utf8');
    assert.ok(content.startsWith(marker), 'Instrumentation ownership marker missing');
    const destination = guardedPath('app/src/androidTest/java/com/qrguitar/acceptance/' + name);
    if (fs.existsSync(destination)) {
      assert.ok(fs.readFileSync(destination, 'utf8').startsWith(marker), 'Refusing to overwrite an unrelated test');
    }
    writes.push([destination, content]);
  }
  // Validate every target before the first write. No tracked app source, signing, or workflow mutation.
  for (const [destination, content] of writes) {
    if (!check && (!fs.existsSync(destination) || fs.readFileSync(destination, 'utf8') !== content)) {
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, content);
    }
  }
  return writes.map(([destination]) => path.relative(root, destination));
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === thisFile) {
  assert.ok(process.argv.slice(2).every(argument => argument === '--check'), 'Only --check is supported');
  const check = process.argv.includes('--check');
  const outputs = prepareInstalledTest(path.resolve(path.dirname(thisFile), '..'), { check });
  console.log(JSON.stringify({ mode: check ? 'validated-no-writes' : 'prepared', outputs, tests: 4,
    offlineInternetPermissionRemoved: true,
    note: 'Acceptance-only offline debug APK. Not a production or release artifact.' }, null, 2));
}
