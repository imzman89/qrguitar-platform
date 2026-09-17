import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function compile(file) {
  const source = fs.readFileSync(path.join(web, file), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(name => {
    if (name.endsWith('.module.css')) return new Proxy({}, { get: (_, key) => key === '__esModule' ? false : String(key) });
    if (name.startsWith('.')) return compile(path.relative(web, path.resolve(web, path.dirname(file), `${name}.tsx`)));
    return require(name);
  }, module, module.exports);
  return module.exports;
}
const { printGeometry, normalizePrintOptions, printFormats, printDetailFacts, printReadiness } = compile('lib/print-layout.ts');
const { PrintDocument } = compile('app/handout/[code]/PrintDocument.tsx');
const { publicProfileUrl } = compile('lib/profile-url.ts');

test('exported Profile links never inherit local or preview hostnames', () => {
  const originalWindow = globalThis.window;
  try {
    for (const origin of ['http://127.0.0.1:3003', 'https://preview.example.test', 'https://www.qrguitar.com']) {
      globalThis.window = { location: { origin } };
      assert.equal(publicProfileUrl('QRG-E985125'), 'https://www.qrguitar.com/i/QRG-E985125');
    }
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test('permanent Profile URLs retain the saved code and encode path delimiters', () => {
  assert.equal(publicProfileUrl('QRG-05068283'), 'https://www.qrguitar.com/i/QRG-05068283');
  assert.equal(publicProfileUrl('QRG-A/B?#'), 'https://www.qrguitar.com/i/QRG-A%2FB%3F%23');
});

test('QR and sharing surfaces use the common public URL contract', () => {
  for (const file of ['components/QrDownload.tsx', 'components/CompactQr.tsx', 'components/RecordShareButton.tsx', 'app/i/[code]/ProfileClient.tsx', 'app/handout/[code]/page.tsx']) {
    const source = fs.readFileSync(path.join(web, file), 'utf8');
    assert.match(source, /publicProfileUrl\(/, file);
    assert.ok(!source.includes('window.location.origin'), `${file} must not distribute a local URL`);
  }
});

test('every format starts on normal Letter paper and accepts only supported dimensions', () => {
  for (const mode of Object.keys(printFormats)) {
    assert.equal(normalizePrintOptions(mode, null, null).size, 'letter');
    assert.deepEqual(normalizePrintOptions(mode, 'unknown', 'diagonal'), { size: 'letter', orientation: 'portrait' });
  }
  assert.deepEqual(normalizePrintOptions('handout', 'compact', 'landscape'), { size: 'letter', orientation: 'portrait' });
  assert.deepEqual(normalizePrintOptions('hangtag', '4x6', 'landscape'), { size: '4x6', orientation: 'landscape' });
});
test('physical layout rotates both paper and printable area for 4x6 landscape', () => {
  const portrait = printGeometry('4x6', 'portrait'), landscape = printGeometry('4x6', 'landscape');
  assert.equal(landscape.width, portrait.height); assert.equal(landscape.height, portrait.width);
  assert.equal(landscape.contentWidth, portrait.contentHeight); assert.equal(landscape.contentHeight, portrait.contentWidth);
});
test('all printable dimensions reserve a real paper margin', () => {
  for (const size of ['letter', 'a4', '4x6', 'compact']) {
    const g = printGeometry(size, 'portrait');
    assert.ok(g.contentWidth > 0 && g.contentWidth < g.width);
    assert.ok(g.contentHeight > 0 && g.contentHeight < g.height);
  }
});
test('availability is omitted from every compact fact when switched off', () => {
  assert.deepEqual(printDetailFacts('Used', 'Modified', 'For Sale', false), ['Used', 'Modified']);
  assert.deepEqual(printDetailFacts('Used', '', 'For Sale', true), ['Used', 'For Sale']);
});
test('readiness rejects missing images, still-loading photos, and overflowing pages', () => {
  assert.match(printReadiness([{ complete: false, naturalWidth: 0 }], false), /Loading/);
  assert.match(printReadiness([{ complete: false, naturalWidth: 0 }], false, true), /too long/);
  assert.match(printReadiness([{ complete: true, naturalWidth: 0 }], false), /could not load/);
  assert.match(printReadiness([{ complete: true, naturalWidth: 1200 }], true), /exceeds one page/);
  assert.equal(printReadiness([{ complete: true, naturalWidth: 1200 }], false), 'Ready to print.');
});

const base = { mode: 'handout', size: 'letter', orientation: 'portrait', theme: 'light', title: 'Workshop instrument', code: 'QRG-123456', serial: '', facts: ['Example brand'], details: [], specifications: [], timeline: [], badges: null, photo: '/photo.jpg', photoFit: 'contain', qrDataUrl: 'data:image/png;base64,test', profileUrl: 'https://www.qrguitar.com/i/QRG-123456', includeLogo: true, includeUrl: true, includeInstruction: true, note: '', service: null };
const render = overrides => renderToStaticMarkup(React.createElement(PrintDocument, { ...base, ...overrides }));
for (const mode of ['label', 'hangtag', 'handout', 'service']) test(`${mode}: only one selected document, one title, and the permanent QR destination`, () => {
  const html = render({ mode });
  assert.equal((html.match(/data-print-document/g) || []).length, 1);
  assert.equal((html.match(/<h2>Workshop instrument<\/h2>/g) || []).length, 1);
  assert.ok(html.includes(`data-mode="${mode}"`));
  assert.ok(html.includes('QR code linking to https://www.qrguitar.com/i/QRG-123456'));
  assert.ok(!html.includes('Serial Number'));
});
test('serial only prints when supplied by the privacy-resolved presentation', () => {
  assert.ok(!render({ serial: '' }).includes('Serial Number'));
  assert.ok(render({ serial: 'VISIBLE-123' }).includes('VISIBLE-123'));
});

test('every print format uses the same canonical logo as the application', () => {
  const { BrandLogo } = compile('components/BrandLogo.tsx');
  const logo = renderToStaticMarkup(React.createElement(BrandLogo));
  const source = logo.match(/src="([^"]+)"/)?.[1];
  assert.ok(source);
  for (const mode of ['label', 'hangtag', 'handout', 'service']) {
    const html = render({ mode });
    assert.ok(html.includes(`src="${source}"`));
    assert.ok(html.includes('alt="QRguitar logo"'));
    assert.ok(!html.includes('>QRguitar</strong>'));
    assert.ok(!render({ mode, includeLogo: false }).includes(`src="${source}"`));
  }
});
test('adjustments affect the printout without altering its identifier or QR URL', () => {
  const html = render({ photo: '/alternate.jpg', photoFit: 'cover', note: 'Collect after 3pm.', details: [['Details', 'Used']] });
  assert.ok(html.includes('/alternate.jpg') && html.includes('object-fit:cover') && html.includes('Collect after 3pm.'));
  assert.ok(html.includes('QRG-123456')); assert.ok(!html.includes('For Sale'));
});
test('service summary prints only selected public work and provenance', () => {
  const html = render({ mode: 'service', service: { title: 'Setup complete', date: 'September 17, 2026', category: 'Setup', description: 'Action adjusted.', details: [['Parts installed', 'New strings']], provenance: 'Provider-submitted - Owner-approved', privateNotes: 'NEVER_PRINT_THIS' } });
  assert.ok(html.includes('Setup complete') && html.includes('Owner-approved'));
  assert.ok(!html.includes('NEVER_PRINT_THIS'));
});
test('QR label contains no handout notes, service work or photographs', () => {
  const html = render({ mode: 'label', note: 'HANDOUT_ONLY', specifications: [['Pickup', 'SPEC_ONLY']] });
  assert.ok(!html.includes('HANDOUT_ONLY') && !html.includes('SPEC_ONLY') && !html.includes('/photo.jpg'));
});
