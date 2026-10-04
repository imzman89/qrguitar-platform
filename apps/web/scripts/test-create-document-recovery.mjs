import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const checkout = path.resolve(process.argv[2] || fileURLToPath(new URL('../../../', import.meta.url)));
const packageFile = path.join(checkout, 'apps/web/package.json');
const pageFile = path.join(checkout, 'apps/web/app/create/page.tsx');
assert.ok(fs.existsSync(packageFile), `Missing ${packageFile}`);
assert.ok(fs.existsSync(pageFile), `Missing ${pageFile}`);
const require = createRequire(packageFile);
const ts = require('typescript');
const source = fs.readFileSync(pageFile, 'utf8');
const ast = ts.createSourceFile(pageFile, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const functions = new Map();
function collect(node) {
  if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node.getText(ast));
  ts.forEachChild(node, collect);
}
collect(ast);
function compile(name, env = {}) {
  env = { isCurrent: () => true, tokenForDraftOwner: async () => 'synthetic', ...env };
  const body = functions.get(name);
  assert.ok(body, `Missing actual handler ${name}`);
  const js = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(env), `${js}\nreturn ${name};`)(...Object.values(env));
}

test('identical document bytes keep separate staged paths and retry the same document identity', async () => {
  const bytes = 'data:application/pdf;base64,AA==';
  let documents = [
    { id: 'doc-a', name: 'A.pdf', dataUrl: bytes },
    { id: 'doc-b', name: 'B.pdf', dataUrl: bytes }
  ];
  let uuid = 0;
  const calls = [];
  const uploadFileIds = { current: new Map() };
  const uploadStagedFile = compile('uploadStagedFile', {
    user: { id: 'synthetic-owner' }, uploadFileIds, uploadId: 'synthetic-session',
    crypto: { randomUUID: () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, '0')}` },
    dataUrlToProfileFile: () => new Blob(['synthetic'], { type: 'application/pdf' }),
    createBrowserSupabaseClient: () => ({ auth: { getSession: async () => ({ data: { session: { user: { id: 'synthetic-owner' }, access_token: 'synthetic' } } }) } }),
    uploadProfileFile: async (options) => {
      calls.push({ fileId: options.fileId, kind: options.kind });
      if (calls.length === 2) throw new Error('synthetic upload failure');
      return `${options.kind}/${options.fileId}`;
    }
  });
  const uploadWithConcurrency = compile('uploadWithConcurrency');
  function stage() {
    return compile('stageSelectedFiles', {
      galleryImages: [], photoUploads: {}, documents,
      uploadWithConcurrency, uploadStagedFile,
      setPhotoUploads: () => {},
      setDocuments: (update) => { documents = typeof update === 'function' ? update(documents) : update; },
      ui: (_key, fallback) => fallback
    });
  }

  await assert.rejects(stage()(), /Some files could not be uploaded/);
  assert.equal(calls.length, 2);
  assert.notEqual(calls[0].fileId, calls[1].fileId, 'same bytes in two rows must not share a staged path');
  assert.equal(documents[0].storagePath, `document/${calls[0].fileId}`);
  assert.equal(documents[1].storagePath, undefined);

  const retried = await stage()();
  assert.equal(calls.length, 3, 'only the failed document should upload again');
  assert.equal(calls[2].fileId, calls[1].fileId, 'retry must retain its file identity');
  assert.equal(retried.documentPaths[0], documents[0].storagePath);
  assert.equal(retried.documentPaths[1], documents[1].storagePath);
  assert.notEqual(retried.documentPaths[0], retried.documentPaths[1]);
});

test('document server error opens hidden details and focuses its picker', () => {
  const outer = { open: false, parentElement: { closest: () => null } };
  const inner = { open: false, parentElement: { closest: () => outer } };
  let focused = false;
  let scrollOptions;
  const picker = {
    closest: (selector) => selector === 'details' ? inner : null,
    focus: (options) => { focused = options?.preventScroll === true; },
    scrollIntoView: (options) => { scrollOptions = options; }
  };
  const lookedUp = [];
  const focusFirstError = compile('focusFirstError', {
    window: { setTimeout: (callback) => callback(), matchMedia: () => ({ matches: true }) },
    document: { getElementById: (id) => { lookedUp.push(id); return id === 'profileDocuments' ? picker : null; }, querySelector: () => null }
  });
  focusFirstError({ documents: 'Remove or retry the failed document.' });
  assert.deepEqual(lookedUp, ['profileDocuments']);
  assert.equal(inner.open, true);
  assert.equal(outer.open, true);
  assert.equal(focused, true);
  assert.deepEqual(scrollOptions, { behavior: 'auto', block: 'center' });
  assert.match(source, /id="document-error"[^>]*role="alert"/);
  assert.match(source, /aria-describedby=\{fieldErrors\.documents\s*\?\s*"document-feedback document-error"/);
});

test('Retry safely is disabled while file preparation is pending', () => {
  const start = source.indexOf('lastErrorRetryable ? <button');
  assert.ok(start >= 0, 'Retry safely button not found');
  const end = source.indexOf('</button>', start);
  assert.ok(end > start, 'Retry safely button has no closing tag');
  assert.ok(source.slice(start, end).includes('disabled={savingProfile || preparingFiles}'));
});

test('document feedback snapshots selection before the native picker resets its FileList', async () => {
  const files = [{ name: 'A.pdf', type: 'application/pdf', size: 5 }, { name: 'B.pdf', type: 'application/pdf', size: 5 }];
  let documents = [], feedback = '', key = 0;
  const addDocuments = compile('addDocuments', {
    documents, saveInFlight: { current: false }, fileSelectionPending: { current: false },
    setPreparingFiles() {}, setDocumentFeedback: value => { feedback = value; },
    MAX_IMAGE_FILE_SIZE: 12 * 1024 * 1024, makeClientKey: () => String(++key),
    fileToDataUrl: async () => 'data:application/pdf;base64,AA==',
    setDocuments: update => { documents = update(documents); },
    ui: (_key, fallback, values = {}) => fallback.replace(/\{\{(\w+)\}\}/g, (_, key) => String(values[key] ?? ''))
  });
  const pending = addDocuments(files);
  files.length = 0; // Resetting input.value empties the browser-owned FileList before the async read completes.
  await pending;
  assert.equal(documents.length, 2);
  assert.equal(feedback, '2 documents added.');
});
