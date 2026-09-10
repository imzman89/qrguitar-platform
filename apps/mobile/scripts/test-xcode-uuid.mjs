import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const requireRepo = createRequire(path.join(repoRoot, 'package.json'));
const parentPath = requireRepo.resolve('xcode/lib/pbxProject');
const parentRequire = createRequire(parentPath);
const source = fs.readFileSync(parentPath, 'utf8');
const baseline = parentRequire('./pbxProject');
const fixedUuid = parentRequire('uuid');
const fixture = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/xcode/full-project.json'), 'utf8'));
const parser = parentRequire('./parser/pbxproj');
const expected = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/xcode/baseline.json'), 'utf8'));
const sha256 = value => createHash('sha256').update(value).digest('hex');
const loadWithUuid = uuid => {
  const mod = { exports: {} };
  const factory = vm.runInThisContext('(function(require,module,exports,__filename,__dirname){\n' + source + '\n})', { filename: parentPath });
  factory(name => name === 'uuid' ? uuid : parentRequire(name), mod, mod.exports, parentPath, path.dirname(parentPath));
  return mod.exports;
};
const Candidate = loadWithUuid(fixedUuid);
const make = (Constructor = Candidate) => { const project = new Constructor('.'); project.hash = structuredClone(fixture); return project; };
const normalizeGeneratedIds = text => {
  const baselineIds = new Set(make(baseline).allUuids());
  const replacements = new Map();
  return text.replace(/\b[A-F0-9]{24}\b/g, id => {
    if (baselineIds.has(id)) return id;
    if (!replacements.has(id)) replacements.set(id, 'NEW_ID_' + replacements.size);
    return replacements.get(id);
  });
};
test('xcode3.0.1 uses only the supported no-options CommonJS UUID v4 call', () => {
  assert.equal(parentRequire('../package.json').version, '3.0.1');
  assert.equal((source.match(/require\('uuid'\)/g) || []).length, 1);
  assert.deepEqual(source.match(/uuid\.[a-zA-Z0-9_]+\([^)]*\)/g), ['uuid.v4()']);
  assert.equal(parentRequire('uuid/package.json').version, '11.1.1');
  assert.match(fixedUuid.v4(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
test('fixed UUID dependency preserves untouched Xcode project output byte-for-byte', () => {
  assert.equal(sha256(make().writeSync()), expected.untouchedSha256);
});
test('actual parser and writer preserve a complete project through round-trip', () => {
  const project = make(); const original = project.writeSync();
  project.hash = parser.parse(original); assert.equal(project.writeSync(), original);
});
test('2000 actual candidate project UUIDs retain format and uniqueness', () => {
  const project = make(); const ids = new Set(project.allUuids());
  for (let i = 0; i < 2000; i++) { const id = project.generateUuid(); assert.match(id, /^[A-F0-9]{24}$/); assert.ok(!ids.has(id)); ids.add(id); }
});
test('existing project UUID collisions are retried without replacing original objects', () => {
  const existing = make().allUuids()[0]; let calls = 0;
  const CollisionCandidate = loadWithUuid({ v4: () => ++calls === 1 ? existing + '12345678' : fixedUuid.v4() });
  const project = make(CollisionCandidate); const before = structuredClone(project.hash);
  assert.notEqual(project.generateUuid(), existing); assert.equal(calls, 2); assert.deepEqual(project.hash, before);
});
const operations = {
  'source file add': p => p.addSourceFile('QRguitarAdded.m'),
  'resource file add': p => p.addResourceFile('QRguitarAdded.png'),
  'framework add': p => p.addFramework('WebKit.framework', { weak: true }),
  'group with source files add': p => p.addPbxGroup(['Scan.m', 'Scan.h'], 'QRguitar Scanner', 'Scanner'),
  'source file add/remove': p => { p.addSourceFile('QRguitarRemoved.m'); p.removeSourceFile('QRguitarRemoved.m'); },
  'resource file add/remove': p => { p.addResourceFile('QRguitarRemoved.png'); p.removeResourceFile('QRguitarRemoved.png'); },
};
for (const [name, operation] of Object.entries(operations)) test(name + ': actual parser/writer semantics match baseline after UUID normalization', () => {
  const candidate = make();
  operation(candidate);
  const output = candidate.writeSync();
  assert.equal(sha256(normalizeGeneratedIds(output)), expected.operations[name]);
  candidate.hash = parser.parse(output); assert.equal(candidate.writeSync(), output);
  for (const id of candidate.allUuids()) assert.match(id, /^[A-F0-9]{24}$/);
});
