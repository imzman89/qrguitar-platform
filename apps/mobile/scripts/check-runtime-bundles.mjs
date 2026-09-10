import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(appRoot, '../..');
const requireApp = createRequire(path.join(appRoot, 'package.json'));
const exportDir = path.resolve(process.argv[2] || path.join(appRoot, 'dist'));
const expectedRoot = (name) => '/' + path.relative(repoRoot, path.dirname(requireApp.resolve(name + '/package.json'))).replaceAll('\\', '/');
const versions = Object.fromEntries(['react', 'react-dom', 'react-native'].map(name => [name, requireApp(name + '/package.json').version]));
assert.equal(versions.react, versions['react-dom'], 'React and React DOM must match for Expo web');
const packageRoots = (sources, name) => {
  const marker = '/node_modules/' + name + '/';
  return [...new Set(sources.map(source => source.replaceAll('\\', '/')).filter(source => source.includes(marker)).map(source => source.slice(0, source.indexOf(marker) + marker.length - 1)))];
};
for (const platform of ['android', 'ios', 'web']) {
  const dir = path.join(exportDir, '_expo/static/js', platform);
  const maps = fs.readdirSync(dir).filter(file => file.endsWith('.map'));
  assert.ok(maps.length, platform + ': export with --source-maps before checking runtime resolution');
  const sources = maps.flatMap(file => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')).sources);
  assert.deepEqual(packageRoots(sources, 'react-test-renderer'), [], platform + ': test renderer must not enter shipped bundles');
  assert.deepEqual(packageRoots(sources, 'react'), [expectedRoot('react')], platform + ': bundle must contain exactly the app React instance');
  if (platform === 'web') {
    assert.deepEqual(packageRoots(sources, 'react-dom'), [expectedRoot('react-dom')], 'web: React DOM must resolve from the Expo app');
    assert.deepEqual(packageRoots(sources, 'react-native'), [], 'web: use react-native-web, never the native runtime');
  } else {
    assert.deepEqual(packageRoots(sources, 'react-native'), [expectedRoot('react-native')], platform + ': one SDK-compatible React Native instance required');
    assert.deepEqual(packageRoots(sources, 'react-dom'), [], platform + ': web React DOM must not enter native bundles');
  }
  console.log(platform + ': one correct React runtime, ' + (platform === 'web' ? 'React DOM' : 'React Native') + ' resolution verified');
}
console.log(JSON.stringify(versions));
