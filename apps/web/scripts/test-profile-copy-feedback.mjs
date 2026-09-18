import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(process.argv.find(value => value.startsWith('--repo='))?.slice(7) || path.join(here, '../../..'));
const sourcePath = path.resolve(process.argv.find(value => value.startsWith('--source='))?.slice(9) || path.join(repo, 'apps/web/app/i/[code]/ProfileClient.tsx'));
const require = createRequire(path.join(repo, 'package.json'));
const ts = require('typescript');
const source = fs.readFileSync(sourcePath, 'utf8');
const sf = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const component = sf.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'ProfileClient');
assert.ok(component?.body);
const statements = component.body.statements;
const handler = statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'copyProfileUrl');
assert.ok(handler);
const refs = statements.filter(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(declaration => ts.isIdentifier(declaration.name) && /^copy\w*Ref$/.test(declaration.name.text)));
const effect = statements.find(node => ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) && node.expression.expression.getText(sf) === 'useEffect' && node.expression.arguments[0]?.getText(sf).includes('copyActiveRef'));
// Execute the actual source handler, refs and lifecycle effect, with deterministic
// React-ref/effect and browser adapters. No browser globals or network are used.
const text = [...refs, ...(effect ? [effect] : []), handler].map(node => node.getText(sf)).join('\n');
const js = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
const renderActual = new Function('shareUrl', 'useRef', 'useEffect', 'navigator', 'setCopyStatus', 'setShareNotice', 'setTimeout', 'clearTimeout', js + '\nreturn copyProfileUrl;');
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function fixture(write = async () => {}) {
  const f = { copy: 'idle', notice: 'idle', calls: [], writes: [], timers: new Map(), write, mounted: true };
  const refs = []; let cursor = 0, cleanup, deps, nextEffect, id = 0;
  const useRef = initial => refs[cursor++] ||= { current: initial };
  const useEffect = (run, nextDeps) => { if (!deps || nextDeps.some((value, index) => value !== deps[index])) nextEffect = { run, deps: nextDeps }; };
  const set = key => value => { f[key] = value; f.writes.push({ key, value, mounted: f.mounted }); };
  const navigator = { clipboard: { writeText: url => { f.calls.push(url); return f.write(url); } } };
  f.render = (url = f.url) => {
    f.url = url; cursor = 0; nextEffect = undefined;
    f.click = renderActual(url, useRef, useEffect, navigator, set('copy'), set('notice'), (fn, delay) => { const key = ++id; f.timers.set(key, { fn, delay }); return key; }, key => f.timers.delete(key));
    if (nextEffect) { cleanup?.(); deps = nextEffect.deps; cleanup = nextEffect.run(); }
  };
  f.unmount = () => { cleanup?.(); f.mounted = false; };
  f.replayEffects = () => { cleanup?.(); deps = undefined; f.render(); };
  f.noClipboard = () => { delete navigator.clipboard; };
  f.fire = key => { const timer = f.timers.get(key); f.timers.delete(key); timer?.fn(); };
  f.render('https://www.qrguitar.com/i/FIRST');
  return f;
}

test('pending write has no success feedback; only resolution reports copied', async () => {
  const gate = deferred(), f = fixture(() => gate.promise), pending = f.click();
  assert.equal(f.copy, 'idle'); assert.equal(f.notice, 'idle'); assert.equal(f.timers.size, 0);
  assert.deepEqual(f.calls, [f.url]); gate.resolve(); await pending;
  assert.equal(f.copy, 'copied'); assert.equal(f.notice, 'copied'); assert.equal([...f.timers.values()][0].delay, 1400);
  f.fire([...f.timers.keys()][0]); assert.equal(f.copy, 'idle'); assert.equal(f.notice, 'idle'); f.unmount();
});
for (const mode of ['rejection', 'missing']) test(mode + ' shows failure without copied feedback', async () => {
  const f = fixture(async () => { throw Error('denied'); }); if (mode === 'missing') f.noClipboard();
  await f.click(); assert.equal(f.copy, 'idle'); assert.equal(f.notice, 'failed');
  assert.equal([...f.timers.values()][0].delay, 1800); f.unmount();
});
test('older pending success cannot overwrite a newer failure', async () => {
  const old = deferred(), f = fixture(() => old.promise), pending = f.click();
  f.write = async () => { throw Error('new denial'); }; await f.click();
  const before = [...f.writes], timers = [...f.timers]; old.resolve(); await pending;
  assert.equal(f.notice, 'failed'); assert.equal(f.copy, 'idle'); assert.deepEqual(f.writes, before); assert.deepEqual([...f.timers], timers); f.unmount();
});
test('older rejection cannot overwrite newer success', async () => {
  const old = deferred(), f = fixture(() => old.promise), pending = f.click();
  f.write = async () => {}; await f.click(); const before = [...f.writes]; old.reject(Error('late denial')); await pending;
  assert.equal(f.copy, 'copied'); assert.equal(f.notice, 'copied'); assert.deepEqual(f.writes, before); f.unmount();
});
for (const settle of ['resolve', 'reject']) test('URL change ignores old ' + settle + ' and copies the new URL only on explicit click', async () => {
  const old = deferred(), f = fixture(() => old.promise), pending = f.click();
  f.render('https://www.qrguitar.com/i/SECOND'); const before = [...f.writes]; old[settle](Error('old result')); await pending;
  assert.deepEqual(f.writes, before); assert.equal(f.copy, 'idle'); assert.equal(f.notice, 'idle'); assert.equal(f.timers.size, 0); assert.equal(f.calls.length, 1);
  f.write = async () => {}; await f.click(); assert.equal(f.calls.at(-1), f.url); assert.equal(f.copy, 'copied'); f.unmount();
});
for (const settle of ['resolve', 'reject']) test('unmount ignores pending ' + settle + ' without timers or state writes', async () => {
  const old = deferred(), f = fixture(() => old.promise), pending = f.click(); f.unmount(); const before = [...f.writes];
  old[settle](Error('old result')); await pending; assert.deepEqual(f.writes, before); assert.equal(f.timers.size, 0);
});
for (const first of ['success', 'failure']) test('cleared old ' + first + ' timer cannot clear newer feedback', async () => {
  const f = fixture(first === 'success' ? async () => {} : async () => { throw Error('denied'); }); await f.click();
  const oldTimer = [...f.timers.values()][0]; f.write = async () => { throw Error('new denial'); }; await f.click();
  const before = [...f.writes]; assert.equal(f.timers.size, 1); oldTimer.fn();
  assert.deepEqual(f.writes, before); assert.equal(f.notice, 'failed'); assert.equal(f.timers.size, 1); f.unmount();
});
test('URL changes and unmount remove timers and ignore already queued callbacks', async () => {
  const f = fixture(); await f.click(); const oldTimer = [...f.timers.values()][0]; f.render('https://www.qrguitar.com/i/SECOND');
  assert.equal(f.timers.size, 0); const changed = [...f.writes]; oldTimer.fn(); assert.deepEqual(f.writes, changed);
  await f.click(); const currentTimer = [...f.timers.values()][0]; f.unmount(); const unmounted = [...f.writes]; currentTimer.fn();
  assert.equal(f.timers.size, 0); assert.deepEqual(f.writes, unmounted);
});
test('same URL rerender preserves current feedback and timer', async () => {
  const f = fixture(); await f.click(); const before = [...f.writes], timers = [...f.timers]; f.render();
  assert.deepEqual(f.writes, before); assert.deepEqual([...f.timers], timers); assert.equal(f.copy, 'copied'); f.unmount();
});
test('effect cleanup/setup replay invalidates the old result', async () => {
  const old = deferred(), f = fixture(() => old.promise), pending = f.click(); f.replayEffects(); const before = [...f.writes];
  old.resolve(); await pending; assert.deepEqual(f.writes, before); assert.equal(f.timers.size, 0); f.unmount();
});
test('never-settling write does not lock the button or another instance', async () => {
  const f = fixture(() => new Promise(() => {})); void f.click(); f.write = async () => { throw Error('retry denial'); }; await f.click();
  assert.equal(f.calls.length, 2); assert.equal(f.notice, 'failed');
  const other = fixture(); await other.click(); assert.equal(other.copy, 'copied'); f.unmount(); other.unmount();
});
test('empty URL and saved handler after unmount do not dispatch clipboard writes', async () => {
  const f = fixture(); f.render(''); await f.click(); assert.equal(f.calls.length, 0);
  f.render('https://www.qrguitar.com/i/THIRD'); const saved = f.click; f.unmount(); await saved(); assert.equal(f.calls.length, 0);
});
