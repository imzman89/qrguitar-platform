import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import test from 'node:test';

// Reuse existing actual-TSX adapters without editing/registering their suites.
// Only their fixture definitions before the first test are loaded in memory.
const scripts = path.dirname(fileURLToPath(import.meta.url));
async function harness(name, firstTest, exports) {
  const file = path.join(scripts, name), url = pathToFileURL(file).href;
  const source = fs.readFileSync(file, 'utf8');
  assert.ok(source.includes(firstTest), 'Existing fixture boundary must remain explicit');
  const prefix = source.slice(0, source.indexOf(firstTest))
    .replace(/(["'])\.\/ui-text-test-context\.mjs\1/g, JSON.stringify(pathToFileURL(path.join(scripts, 'ui-text-test-context.mjs')).href))
    .replaceAll('import.meta.url', JSON.stringify(url));
  return import('data:text/javascript;base64,' + Buffer.from(prefix + '\nexport { ' + exports + ' };').toString('base64'));
}
const { fixture } = await harness('test-auth-pages.mjs', "test('login: tab keyboard", 'fixture');
const { importer, text, bulk } = await harness('test-editor-copy-feedback.mjs', "test('editor headline autosave", 'importer, text, bulk');

for (const actors of [['b'], ['', 'a'], ['b', 'a']]) test('Reset stale rendered submit and field callbacks are inert before rerender: ' + actors.join('→'), async t => {
  const f = fixture('reset-password'); t.after(() => f.dispose()); await f.flush(); f.fill();
  const oldSubmit = f.node(n => n.type === 'form').props.onSubmit;
  const oldFields = ['password', 'confirmPassword'].map(id => f.node(n => n.props?.id === id).props.onChange);
  actors.forEach(actor => f.event(actor));
  const writes = f.writes, calls = f.calls.length;
  oldSubmit({ preventDefault() {} }); oldFields.forEach(change => change({ target: { value: 'old-private-draft' } }));
  assert.equal(f.writes, writes); assert.equal(f.calls.length, calls);
  await f.flush(); assert.equal(f.count('updateUser'), 0);
  for (const id of ['password', 'confirmPassword']) assert.equal(f.node(n => n.props?.id === id).props.value, '');
});

test('Reset pre-render actor switch sends zero password updates (baseline sent one)', async t => {
  const f = fixture('reset-password'); t.after(() => f.dispose()); await f.flush(); f.fill();
  const submit = f.node(n => n.type === 'form').props.onSubmit;
  f.event('b'); submit({ preventDefault() {} }); await f.flush(); assert.equal(f.count('updateUser'), 0);
});

for (const invalid of ['short', 'mismatch']) test('Reset ' + invalid + ' error identifies/focuses field, clears on correction and sends no invalid update', async t => {
  const f = fixture('reset-password'); t.after(() => f.dispose()); await f.flush();
  const focused = [], target = invalid === 'short' ? 'password' : 'confirmPassword';
  for (const id of ['password', 'confirmPassword']) f.node(n => n.props?.id === id).props.ref.current = { focus() { focused.push(id); } };
  f.input('password', invalid === 'short' ? 'short' : 'valid-password'); f.input('confirmPassword', 'different-password'); f.submit(); await f.flush();
  const field = f.node(n => n.props?.id === target), errorId = field.props['aria-describedby'];
  assert.equal(field.props['aria-invalid'], true); assert.ok(errorId); assert.equal(f.node(n => n.props?.id === errorId).props.role, 'alert');
  assert.equal(focused.at(-1), target); assert.equal(f.count('updateUser'), 0);
  f.input('password', 'valid-password'); f.input('confirmPassword', 'valid-password');
  assert.equal(f.node(n => n.props?.id === target).props['aria-invalid'], false); assert.equal(f.node(n => n.props?.id === errorId), undefined);
  assert.equal(f.node(n => n.type === 'form').props.method, 'post'); f.submit(); await f.flush(); assert.equal(f.count('updateUser'), 1);
});

test('Import initially makes preview primary and explains disabled creation; ready rows make creation primary', async t => {
  const f = await importer(t);
  assert.equal(f.button('Create instruments').props.className, 'button');
  f.input().props.onChange({ target: { value: '' } }); f.render();
  assert.equal(f.button('Map & preview rows').props.className, 'button'); assert.equal(f.button('Create instruments').props.className, 'button secondary');
  assert.equal(f.button('Create instruments').props.disabled, true);
  assert.equal(f.button('Create instruments').props['aria-describedby'], 'bulk-import-next-step');
  assert.match(f.text(), /No Profiles are created during preview/);
});

test('Import invalid rows explain correction and uncertain requests retain their original primary', async t => {
  const f = await importer(t, { source: 'brand,model,serial,type,photo\nPrivate Brand,,No Serial,Electric Guitar,ftp://invalid/photo' });
  assert.equal(f.button('Map & preview rows').props.className, 'button'); assert.match(f.text(), /Correct the highlighted rows/);
  const feedback = f.find(n => n.props?.id === 'bulk-import-feedback');
  assert.match(text(feedback), /Correct the highlighted rows/);
  const all = f.all(), preview = all.findIndex(n => String(n.props?.className || '') === 'bulk-preview-workspace');
  assert.ok(all.indexOf(feedback) < preview, 'Local feedback must precede the potentially long row list');
});

test('Import uncertain recovery retains its exact confirmation label and primary action', async t => {
  const f = await importer(t, { rows: rows => rows.map(row => {
    const attempt = { uploadId: 'fixture-upload-123', idempotencyKey: 'fixture-key-123', phase: 'uncertain' };
    attempt.body = bulk.buildBulkRequest(row, '', attempt, 'actor-a/profile-uploads/photo.jpg');
    return { ...row, result: 'Needs confirmation', attempt };
  }) });
  assert.equal(f.button('Confirm saved import (same requests)').props.className, 'button');
  assert.equal(f.button('Map & preview rows').props.disabled, true); assert.equal(f.button('Start new import').props.disabled, true);
});
