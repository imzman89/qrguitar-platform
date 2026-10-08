import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import QRCode from 'qrcode';
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';

const require = createRequire(import.meta.url);
const ts = require('typescript');
function compile(name) {
  const source = fs.readFileSync(new URL(`../lib/${name}.ts`, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', output)(require, module, module.exports);
  return module.exports;
}
const { qrColorError, qrRenderOptions, beginQrRender } = compile('qr-output');
const { publicProfileUrl } = compile('profile-url');
prepareZXingModule({ overrides: { wasmBinary: fs.readFileSync(require.resolve('zxing-wasm/reader/zxing_reader.wasm')) } });

test('invisible and malformed custom colors cannot generate a downloadable QR', async () => {
  for (const colors of [
    { foreground: '#ffffff', background: '#ffffff' },
    { foreground: '#eeeeee', background: '#ffffff' },
    { foreground: '#00000000', background: '#ffffff' },
    { foreground: 'bad', background: 'transparent' },
  ]) {
    assert.ok(qrColorError(colors));
    assert.throws(() => qrRenderOptions(colors));
  }
});

for (const [name, colors] of Object.entries({
  print: { foreground: '#071014', background: '#f8f6f2' },
  white: { foreground: '#f8f6f2', background: '#071014' },
  orange: { foreground: '#ffbd55', background: '#071014' },
  compact: { foreground: '#081014', background: '#ffffff' },
})) {
  test(`${name}: an independent decoder reads permanent links from real generated PNG pixels`, async () => {
    for (const code of ['QRG-AB02777', 'QRG-A/B?#']) {
      const url = publicProfileUrl(code);
      const png = await QRCode.toBuffer(url, qrRenderOptions(colors, name === 'compact' ? 240 : 720));
      const results = await readBarcodes(new Uint8Array(png), { formats: ['QRCode'], tryInvert: true });
      assert.equal(results.length, 1);
      assert.equal(results[0].text, url);
    }
  });
}

test('transparent export retains at least four clear modules on every edge', async () => {
  const url = publicProfileUrl('QRG-AB02777');
  const moduleCount = QRCode.create(url, { errorCorrectionLevel: 'H' }).modules.size;
  const width = (moduleCount + 8) * 8;
  const png = await QRCode.toBuffer(url, qrRenderOptions({ foreground: '#071014', background: 'transparent' }, width));
  const pngRequire = createRequire(require.resolve('qrcode'));
  const { PNG } = pngRequire('pngjs');
  const pixels = PNG.sync.read(png);
  const margin = 4 * 8;
  for (let y = 0; y < width; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    if (x < margin || y < margin || x >= width - margin || y >= width - margin) assert.equal(pixels.data[i + 3], 0);
    // Composite on its intended plain white backing for the decoder.
    if (pixels.data[i + 3] === 0) pixels.data.fill(255, i, i + 4);
  }
  const results = await readBarcodes({ width, height: width, data: new Uint8ClampedArray(pixels.data) }, { formats: ['QRCode'] });
  assert.equal(results[0]?.text, url);
});

const flush = () => new Promise(resolve => setImmediate(resolve));
test('a superseded or unmounted render cannot publish a stale instrument QR', async () => {
  let resolveOld;
  const events = [];
  const cancel = beginQrRender(() => new Promise(resolve => { resolveOld = resolve; }), value => events.push(value));
  await flush();
  cancel();
  beginQrRender(async () => 'new-profile.png', value => events.push(value));
  await flush();
  resolveOld('old-profile.png');
  await flush();
  assert.deepEqual(events, [{ url: 'new-profile.png', error: '' }]);
});

test('canvas/generator failures publish a recoverable error instead of an unhandled rejection', async () => {
  for (const render of [() => { throw new Error('sync'); }, async () => { throw new Error('canvas'); }]) {
    const events = [];
    beginQrRender(render, value => events.push(value));
    await flush();
    assert.equal(events.length, 1);
    assert.equal(events[0].url, '');
    assert.match(events[0].error, /Try again/);
  }
});

test('hung generation ends with a retry message and ignores its late result', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const events = [];
  let resolve;
  beginQrRender(() => new Promise(done => { resolve = done; }), value => events.push(value), 12000);
  await Promise.resolve();
  t.mock.timers.tick(12000);
  assert.match(events[0].error, /too long/);
  resolve('too-late.png');
  await flush();
  assert.equal(events.length, 1);
});
