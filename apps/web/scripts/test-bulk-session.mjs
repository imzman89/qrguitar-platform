import { withUiTextTestContext } from "./ui-text-test-context.mjs";
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

// Actual TSX handlers/effects with deterministic hook, Auth and browser adapters.
// Draft parsing, session observation and Web Lock lease code are the real modules.
// No external request, real storage write, emitted file or production fixture.
const require = createRequire(import.meta.url), ts = require('typescript');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function compile(file, imports = {}, cache = new Map()) {
  file = path.resolve(root, file);
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'module', 'exports', source)(withUiTextTestContext(name =>
    Object.hasOwn(imports, name) ? imports[name] : compile(path.resolve(path.dirname(file), name + '.ts'), imports, cache)),
  module, module.exports);
  return module.exports;
}
const bulk = compile('lib/bulk-import.ts');
const leases = compile('lib/bulk-import-lock.ts');
const identity = compile('lib/session-identity.ts');
const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : node && typeof node === 'object' ? [node, ...nodes(node.props?.children)] : [];
const copy = node => Array.isArray(node) ? node.map(copy).join('') : typeof node === 'string' ? node : node && typeof node === 'object' ? copy(node.props?.children) : '';
const session = actorId => actorId ? { user: { id: actorId }, access_token: 'synthetic-' + actorId } : null;
const snapshot = actorId => ({ data: { session: session(actorId) } });
function deferred() { let resolve, reject; return { promise: new Promise((yes, no) => { resolve = yes; reject = no; }), resolve: value => resolve(value), reject: error => reject(error) }; }
function draft(actorId, uncertain = false) {
  const text = 'brand,model,serial,type,photo\nPRIVATE-' + actorId + ',Model,No Serial,Electric Guitar,https://example.invalid/photo.jpg';
  const rows = bulk.parseRows(text);
  if (uncertain) {
    const uploadId = 'upload-identity-00000001', idempotencyKey = 'request-identity-00000001';
    rows[0].attempt = { uploadId, idempotencyKey, phase: 'uncertain', body: { uploadId, idempotencyKey, visibility: 'private' } };
  }
  return { version: 2, ownerId: actorId, text, rows, columnMapping: {} };
}
function fixture(t, { parent = false, synchronousActor, factoryThrows = false, getSessionThrows = false, uncertain = false, queueLocks = false } = {}) {
  const initial = deferred(), subscribers = new Set(), retainedCallbacks = [], slots = [], acquired = [], storageReads = [], storageWrites = [], queuedLocks = [];
  const storage = new Map(['actor-a', 'actor-b'].map(actor => [bulk.bulkDraftKey(actor), JSON.stringify(draft(actor, uncertain))]));
  let cursor = 0, dirty = true, pending = [], tree, disposed = false, unsubscribed = 0, mutations = 0;
  const hooks = {
    useState(initialValue) {
      const index = cursor++; slots[index] ??= { value: typeof initialValue === 'function' ? initialValue() : initialValue };
      return [slots[index].value, next => {
        const value = typeof next === 'function' ? next(slots[index].value) : next;
        if (!Object.is(value, slots[index].value)) { slots[index].value = value; dirty = true; }
      }];
    },
    useRef(value) { const index = cursor++; slots[index] ??= { current: value }; return slots[index]; },
    useMemo(fn, deps) { const index = cursor++; if (!same(slots[index]?.deps, deps)) slots[index] = { value: fn(), deps }; return slots[index].value; },
    useEffect(fn, deps) {
      const index = cursor++; slots[index] ??= {};
      if (!same(slots[index].deps, deps)) pending.push(() => { slots[index].cleanup?.(); slots[index].deps = deps; slots[index].cleanup = fn(); });
    },
  };
  const auth = {
    getSession() { if (getSessionThrows) throw new Error('Unavailable session'); return initial.promise; },
    onAuthStateChange(fn) {
      subscribers.add(fn); retainedCallbacks.push(fn);
      if (synchronousActor !== undefined) fn('SIGNED_IN', session(synchronousActor));
      return { data: { subscription: { unsubscribe() { subscribers.delete(fn); unsubscribed++; } } } };
    },
  };
  const lockManager = {
    request(name, options, callback) {
      const request = deferred();
      const begin = () => {
        if (options.signal.aborted) { request.reject(new DOMException('Aborted', 'AbortError')); return; }
        Promise.resolve(callback({ name, mode: 'exclusive' })).then(request.resolve, request.reject);
      };
      if (queueLocks) queuedLocks.push(begin); else queueMicrotask(begin);
      return request.promise;
    },
  };
  const oldWindow = globalThis.window, oldNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator'), oldFetch = globalThis.fetch;
  globalThis.window = { localStorage: {
    getItem(key) { storageReads.push(key); return storage.get(key) || null; },
    setItem(key, value) { storageWrites.push(key); storage.set(key, value); },
  } };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: lockManager } });
  globalThis.fetch = () => { mutations++; throw new Error('Unexpected request'); };
  const jsx = (type, props, key) => ({ type, props, key });
  const imports = {
    react: hooks, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'next/link': { default: 'Link' }, 'lucide-react': {},
    '../lib/supabase-browser': { createBrowserSupabaseClient() { if (factoryThrows) throw new Error('Unavailable Auth'); return { auth }; } },
    '../lib/session-identity': identity, './BulkProfileImport': { BulkProfileImport: 'BulkProfileImport' },
    '../lib/profile-upload-client': {}, '../lib/qrguitar-id': {},
    '../lib/content-registry': { getContentValue: () => '' }, '../lib/use-site-content': { useSiteContent: () => ({}) },
    '../lib/bulk-import': bulk, '../lib/bulk-import-lock': {
      acquireBulkImportLease(manager, owner) { const lease = leases.acquireBulkImportLease(manager, owner); acquired.push(lease); return lease; },
    },
  };
  const Component = parent ? compile('components/BulkImportWorkspace.tsx', imports).BulkImportWorkspace : compile('components/BulkProfileImport.tsx', imports).BulkProfileImport;
  const f = {
    initial, acquired, storageReads, storageWrites, storage, queuedLocks,
    settle() {
      if (disposed) return;
      for (let count = 0; count < 25; count++) {
        if (dirty) { cursor = 0; pending = []; dirty = false; tree = Component({}); }
        const jobs = pending; pending = []; jobs.forEach(fn => fn());
        if (!dirty) return;
      }
      throw new Error('Component effects did not settle');
    },
    async flush() { for (let count = 0; count < 14; count++) { await Promise.resolve(); f.settle(); } },
    emit(event, actor) { for (const fn of [...subscribers]) fn(event, session(actor)); f.settle(); },
    emitBatch(events) { for (const [event, actor] of events) for (const fn of [...subscribers]) fn(event, session(actor)); f.settle(); },
    lateEvent(event, actor) { for (const fn of retainedCallbacks) fn(event, session(actor)); f.settle(); },
    textarea: () => nodes(tree).find(node => node.type === 'textarea')?.props.value,
    copy: () => copy(tree),
    child: () => nodes(tree).find(node => node.type === 'BulkProfileImport'),
    edit(value) { nodes(tree).find(node => node.type === 'textarea').props.onChange({ target: { value } }); f.settle(); },
    dispose() { if (disposed) return; disposed = true; slots.forEach(slot => slot?.cleanup?.()); },
    subscriptions: () => subscribers.size, unsubscribed: () => unsubscribed, requests: () => mutations,
  };
  t.after(() => {
    f.dispose(); globalThis.window = oldWindow; globalThis.fetch = oldFetch;
    if (oldNavigator) Object.defineProperty(globalThis, 'navigator', oldNavigator); else delete globalThis.navigator;
  });
  f.settle(); return f;
}

test('later sign-out prevents stale initial actor from restoring private draft or acquiring its lease', async t => {
  const f = fixture(t); f.emit('SIGNED_OUT', ''); f.initial.resolve(snapshot('actor-a')); await f.flush();
  assert.equal(f.textarea(), ''); assert.deepEqual(f.storageReads, []); assert.equal(f.acquired.length, 0);
  assert.match(f.copy(), /Sign in to restore your import/); assert.equal(f.requests(), 0);
});
test('later account B wins over stale initial A without reading any A draft', async t => {
  const f = fixture(t); f.emit('SIGNED_IN', 'actor-b'); await f.flush(); f.initial.resolve(snapshot('actor-a')); await f.flush();
  assert.match(f.textarea(), /PRIVATE-actor-b/); assert.ok(!f.storageReads.includes(bulk.bulkDraftKey('actor-a')));
  assert.deepEqual(f.acquired.map(lease => lease.ownerId), ['actor-b']);
});
test('live sign-out clears rendered draft and releases the current account lease', async t => {
  const f = fixture(t); f.initial.resolve(snapshot('actor-a')); await f.flush(); assert.match(f.textarea(), /PRIVATE-actor-a/);
  const lease = f.acquired[0]; f.emit('SIGNED_OUT', ''); await f.flush();
  assert.equal(f.textarea(), ''); assert.equal(lease.isOwned(), false); assert.throws(lease.assertOwned);
  assert.match(f.copy(), /Sign in to restore/);
});
test('live account switch releases A and restores only B after the transition', async t => {
  const f = fixture(t); f.initial.resolve(snapshot('actor-a')); await f.flush(); const first = f.acquired[0];
  f.emit('SIGNED_IN', 'actor-b'); assert.equal(f.textarea(), ''); await f.flush();
  assert.equal(first.isOwned(), false); assert.match(f.textarea(), /PRIVATE-actor-b/);
});
test('same-actor token refresh preserves edits and does not reacquire or reload the draft', async t => {
  const f = fixture(t); f.initial.resolve(snapshot('actor-a')); await f.flush(); f.edit('Local edit waiting for review');
  const reads = f.storageReads.length; f.emit('TOKEN_REFRESHED', 'actor-a'); await f.flush();
  assert.equal(f.textarea(), 'Local edit waiting for review'); assert.equal(f.acquired.length, 1); assert.equal(f.storageReads.length, reads);
});
test('late initial rejection cannot clear a newer signed-in actor', async t => {
  const f = fixture(t); f.emit('SIGNED_IN', 'actor-b'); await f.flush(); f.initial.reject(new Error('Old failed request')); await f.flush();
  assert.match(f.textarea(), /PRIVATE-actor-b/); assert.equal(f.acquired[0].isOwned(), true);
});
test('a synchronous subscription event outranks the subsequently settled initial read', async t => {
  const f = fixture(t, { synchronousActor: 'actor-b' }); await f.flush(); f.initial.resolve(snapshot('actor-a')); await f.flush();
  assert.match(f.textarea(), /PRIVATE-actor-b/); assert.ok(!f.storageReads.includes(bulk.bulkDraftKey('actor-a')));
});
test('initial Auth error with stale data never restores a private draft', async t => {
  const f = fixture(t); f.initial.resolve({ ...snapshot('actor-a'), error: new Error('Failed session read') }); await f.flush();
  assert.equal(f.textarea(), ''); assert.deepEqual(f.storageReads, []);
});
test('Auth construction failure fails closed without storage access', async t => {
  const f = fixture(t, { factoryThrows: true }); await f.flush();
  assert.equal(f.textarea(), ''); assert.deepEqual(f.storageReads, []); assert.match(f.copy(), /Sign in to restore/);
});
test('synchronous session-read failure leaves no private draft or unhandled rejection', async t => {
  const f = fixture(t, { getSessionThrows: true }); await f.flush();
  assert.equal(f.textarea(), ''); assert.deepEqual(f.storageReads, []); assert.match(f.copy(), /Sign in to restore/);
});
test('unmount ignores late read and retained Auth callback and releases subscription', async t => {
  const f = fixture(t); f.dispose(); f.initial.resolve(snapshot('actor-a')); f.lateEvent('SIGNED_IN', 'actor-b'); await f.flush();
  assert.equal(f.subscriptions(), 0); assert.equal(f.unsubscribed(), 1); assert.deepEqual(f.storageReads, []); assert.equal(f.acquired.length, 0);
});
test('queued old-account lock cannot restore that draft after an account switch', async t => {
  const f = fixture(t, { queueLocks: true }); f.initial.resolve(snapshot('actor-a')); await f.flush();
  f.emit('SIGNED_IN', 'actor-b'); await f.flush(); f.queuedLocks.forEach(begin => begin()); await f.flush();
  assert.equal(f.acquired[0].isOwned(), false); assert.ok(!f.storageReads.includes(bulk.bulkDraftKey('actor-a'))); assert.match(f.textarea(), /PRIVATE-actor-b/);
});
test('uncertain request identity survives sign-out and restoration without any replacement POST', async t => {
  const f = fixture(t, { uncertain: true }); const original = JSON.parse(f.storage.get(bulk.bulkDraftKey('actor-a'))).rows[0].attempt;
  f.initial.resolve(snapshot('actor-a')); await f.flush(); f.emit('SIGNED_OUT', ''); await f.flush();
  f.emit('SIGNED_IN', 'actor-a'); await f.flush();
  const restored = JSON.parse(f.storage.get(bulk.bulkDraftKey('actor-a'))).rows[0].attempt;
  assert.deepEqual(restored, original); assert.match(f.copy(), /earlier request needs confirmation/); assert.equal(f.requests(), 0);
});
test('parent live sign-out unmounts the import surface and shows the sign-in destination', async t => {
  const f = fixture(t, { parent: true }); f.initial.resolve(snapshot('actor-a')); await f.flush();
  assert.match(f.child().key, /^actor-a:/); f.emit('SIGNED_OUT', ''); await f.flush();
  assert.equal(f.child(), undefined); assert.match(f.copy(), /Sign in to import inventory/);
});
test('parent signed-out panel reacts to later sign-in and keys controller to new actor', async t => {
  const f = fixture(t, { parent: true }); f.initial.resolve(snapshot('')); await f.flush();
  f.emit('SIGNED_IN', 'actor-a'); assert.match(f.child().key, /^actor-a:/);
  f.emit('SIGNED_IN', 'actor-b'); assert.match(f.child().key, /^actor-b:/);
});
test('parent sign-out wins against late initial signed-in success', async t => {
  const f = fixture(t, { parent: true }); f.emit('SIGNED_OUT', ''); f.initial.resolve(snapshot('actor-a')); await f.flush();
  assert.equal(f.child(), undefined); assert.match(f.copy(), /Sign in to import inventory/);
});
test('parent initial rejection exits the checking state and remains responsive to sign-in', async t => {
  const f = fixture(t, { parent: true }); f.initial.reject(new Error('Unavailable')); await f.flush();
  assert.equal(f.child(), undefined); assert.match(f.copy(), /Sign in to import inventory/);
  f.emit('SIGNED_IN', 'actor-b'); assert.match(f.child().key, /^actor-b:/);
});
test('parent factory failure gives a signed-out surface instead of a permanent opening screen', async t => {
  const f = fixture(t, { parent: true, factoryThrows: true }); await f.flush();
  assert.match(f.copy(), /Sign in to import inventory/); assert.equal(f.child(), undefined);
});
for (const [name, events] of [
  ['sign-out then same-user sign-in', [['SIGNED_OUT', ''], ['SIGNED_IN', 'actor-a']]],
  ['A to B to A', [['SIGNED_IN', 'actor-b'], ['SIGNED_IN', 'actor-a']]],
]) {
  test('batched ' + name + ' reacquires the final actor lease and restores its exact uncertain draft', async t => {
    const f = fixture(t, { uncertain: true }); const stored = f.storage.get(bulk.bulkDraftKey('actor-a'));
    f.initial.resolve(snapshot('actor-a')); await f.flush(); const oldLease = f.acquired[0];
    assert.equal(oldLease.isOwned(), true);
    f.emitBatch(events); await f.flush();
    assert.equal(oldLease.isOwned(), false);
    assert.equal(f.acquired.length, 2);
    assert.equal(f.acquired[1].ownerId, 'actor-a'); assert.equal(f.acquired[1].isOwned(), true);
    assert.match(f.textarea(), /PRIVATE-actor-a/); assert.match(f.copy(), /earlier request needs confirmation/);
    assert.deepEqual(JSON.parse(f.storage.get(bulk.bulkDraftKey('actor-a'))), JSON.parse(stored));
    assert.ok(!f.storageReads.includes(bulk.bulkDraftKey('actor-b')));
    assert.equal(f.requests(), 0);
  });
  test('parent batched ' + name + ' creates a new controller key for the final same actor', async t => {
    const f = fixture(t, { parent: true }); f.initial.resolve(snapshot('actor-a')); await f.flush();
    const previousKey = f.child().key; f.emitBatch(events);
    assert.match(f.child().key, /^actor-a:/); assert.notEqual(f.child().key, previousKey);
  });
}
test('batched same-actor refreshes preserve controller key, draft edits and current lease', async t => {
  const f = fixture(t); f.initial.resolve(snapshot('actor-a')); await f.flush(); f.edit('Unsaved local edit before refresh');
  const lease = f.acquired[0], reads = f.storageReads.length;
  f.emitBatch([['TOKEN_REFRESHED', 'actor-a'], ['SIGNED_IN', 'actor-a']]); await f.flush();
  assert.equal(f.acquired.length, 1); assert.equal(lease.isOwned(), true); assert.equal(f.storageReads.length, reads);
  assert.equal(f.textarea(), 'Unsaved local edit before refresh');
});
test('parent batched same-actor refreshes keep the same controller mounted', async t => {
  const f = fixture(t, { parent: true }); f.initial.resolve(snapshot('actor-a')); await f.flush();
  const key = f.child().key;
  f.emitBatch([['TOKEN_REFRESHED', 'actor-a'], ['SIGNED_IN', 'actor-a']]); assert.equal(f.child().key, key);
});
