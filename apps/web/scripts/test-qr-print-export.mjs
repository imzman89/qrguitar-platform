import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import QRCode from 'qrcode';
import sharp from 'sharp';
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { withUiTextTestContext } from './ui-text-test-context.mjs';

const require = createRequire(import.meta.url), ts = require('typescript');
const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function compile(file) {
  const source = fs.readFileSync(path.join(web, file), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', output)(withUiTextTestContext(name => {
    if (name.endsWith('.module.css')) return new Proxy({}, { get: (_, key) => key === '__esModule' ? false : String(key) });
    if (name.startsWith('.')) {
      const target = path.resolve(web, path.dirname(file), name);
      return compile(path.relative(web, target + (fs.existsSync(target + '.ts') ? '.ts' : '.tsx')));
    }
    return require(name);
  }), module, module.exports);
  return module.exports;
}
const { qrPrintMetrics, printQrSvg, printQrPng } = compile('lib/qr-print-output.ts');
const { printGeometry, normalizePrintOptions, printSpecifications, printPlacement, hangTagSpecifications } = compile('lib/print-layout.ts');
const { PrintDocument } = compile('app/handout/[code]/PrintDocument.tsx');
const { sanitizePublicInstrument, resolveInstrumentPresentation, isOwnerOnlyInstrumentSpec } = compile('lib/instrument-profile-contract.ts');
prepareZXingModule({ overrides: { wasmBinary: fs.readFileSync(require.resolve('zxing-wasm/reader/zxing_reader.wasm')) } });

for (const sideMm of [25, 32, 38]) test(`${sideMm}mm: original dimensioned SVG and integer-module PNG decode to the permanent link`, async () => {
  for (const code of ['QRG-QR4-GUITAR', 'QRG-QR4-PEDAL', 'QRG-QR4-AMP', 'QRG-A/B?#']) {
    const expected = `https://www.qrguitar.com/i/${encodeURIComponent(code)}`;
    const metrics = qrPrintMetrics(code, sideMm);
    const svg = await printQrSvg(code, sideMm);
    assert.match(svg, new RegExp(`width="${sideMm}mm" height="${sideMm}mm"`));
    assert.match(svg, new RegExp(`viewBox="0 0 ${metrics.totalModules} ${metrics.totalModules}"`));
    assert.doesNotMatch(svg, /<image|<text|opacity|foreignObject|script|href/);
    assert.ok(metrics.pixelWidth % metrics.totalModules === 0);
    assert.ok(metrics.pixelWidth / (sideMm / 25.4) >= 300);
    const dataUrl = await printQrPng(code, sideMm);
    const png = Buffer.from(dataUrl.split(',')[1], 'base64');
    const metadata = await sharp(png).metadata();
    assert.equal(metadata.width, metrics.pixelWidth);
    assert.equal(metadata.height, metrics.pixelWidth);
    for (const image of [png, await sharp(Buffer.from(svg), { density: 300 }).resize(metrics.pixelWidth, metrics.pixelWidth).png().toBuffer()]) {
      const decoded = await readBarcodes(new Uint8Array(image), { formats: ['QRCode'], tryInvert: false });
      assert.equal(decoded.length, 1);
      assert.equal(decoded[0].text, expected);
    }
    // Inspect the ORIGINAL generated PNG, without rescaling or compositing it.
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const quiet = 4 * metrics.scale;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      const offset = (y * info.width + x) * 4;
      const rgba = Array.from(data.subarray(offset, offset + 4));
      assert.ok(rgba.join(',') === '0,0,0,255' || rgba.join(',') === '255,255,255,255');
      if (x < quiet || y < quiet || x >= info.width - quiet || y >= info.height - quiet) assert.deepEqual(rgba, [255,255,255,255]);
    }
    if (process.env.QR4_FIXTURE_DIR && code === 'QRG-QR4-GUITAR') {
      const dir = path.resolve(process.env.QR4_FIXTURE_DIR);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `synthetic-qr-${sideMm}mm.svg`), svg);
      fs.writeFileSync(path.join(dir, `synthetic-qr-${sideMm}mm.png`), png);
      fs.writeFileSync(path.join(dir, `synthetic-qr-${sideMm}mm.json`), JSON.stringify({ ...metrics, evidence: 'Generated application-helper fixture. Not a native browser download or physical printer/phone acceptance.' }, null, 2) + '\n');
    }
  }
});

test('QR-only dimensions include the quiet zone without extra page margin or non-square rotation', () => {
  assert.deepEqual(normalizePrintOptions('qr', 'letter', 'landscape'), { size: 'qr32', orientation: 'portrait' });
  for (const sideMm of [25,32,38]) {
    const g = printGeometry(`qr${sideMm}`, 'portrait');
    assert.ok(Math.abs(g.width * 25.4 - sideMm) < 0.000001);
    assert.equal(g.width, g.height); assert.equal(g.margin, 0);
    assert.equal(g.contentWidth, g.width); assert.equal(g.contentHeight, g.height);
  }
  assert.throws(() => qrPrintMetrics('QRG-QR4', 5), /supported/);
});

test('print CSS removes preview scaling and lets QR-only fill its exact square page', () => {
  const postcss = require('postcss');
  const documentCss = postcss.parse(fs.readFileSync(path.join(web,'app/handout/[code]/print-document.module.css'),'utf8'));
  const suiteCss = postcss.parse(fs.readFileSync(path.join(web,'app/handout/[code]/print-suite.module.css'),'utf8'));
  const properties = selector => {let result={};documentCss.walkRules(rule=>{if(rule.selector===selector)rule.walkDecls(decl=>result[decl.prop]=decl.value);});return result;};
  assert.equal(properties('.document[data-mode="qr"]').height,'var(--print-content-height)');
  assert.equal(properties('.qrOnly .qr').width,'100%');
  assert.equal(properties('.qrOnly .qr').height,'100%');
  let scaleCleared=false, smallPageCleared=false;
  suiteCss.walkRules(rule=>{
    if(rule.parent.type==='atrule'&&rule.parent.params==='print'&&rule.selector.includes('.pageCanvas')) {
      if(rule.nodes.some(decl=>decl.prop==='transform'&&decl.value==='none'&&decl.important)) scaleCleared=true;
    }
    if(rule.selector.includes('[data-print-page-size^="qr"] [data-print-frame]')) {
      smallPageCleared=rule.nodes.some(decl=>decl.prop==='padding'&&decl.value==='0'&&decl.important)&&rule.nodes.some(decl=>decl.prop==='margin'&&decl.value==='0'&&decl.important);
    }
  });
  assert.ok(scaleCleared);assert.ok(smallPageCleared);
});

test('QR-only renders exactly the code, omitting labels, logos, photos and owner/service data', () => {
  const html = renderToStaticMarkup(React.createElement(PrintDocument, {
    mode:'qr',size:'qr32',orientation:'portrait',theme:'light',title:'Guitar',code:'QRG-QR4',serial:'OWNER_SERIAL',
    facts:['OWNER_FACT'],details:[['Seller / source','OWNER_SELLER']],specifications:[['Power','9V']],timeline:['OWNER_HISTORY'],badges:'BADGE',photo:'/OWNER_PHOTO.jpg',photoFit:'contain',qrDataUrl:'data:image/svg+xml,test',profileUrl:'https://www.qrguitar.com/i/QRG-QR4',includeLogo:true,includeUrl:true,includeInstruction:true,scanInstruction:'SCAN_INSTRUCTION',note:'OWNER_NOTE',service:{title:'OWNER_SERVICE'}
  }));
  assert.equal((html.match(/<img/g) || []).length, 1);
  assert.equal((html.match(/data-print-document/g) || []).length, 1);
  assert.doesNotMatch(html, /OWNER_|BADGE|SCAN_INSTRUCTION|qrguitar-logo|<h2|<dl/);
});

test('guitar and bass use their saved construction facts; pedal and amp use their saved electronics facts', () => {
  const saved = { finish:'Red',bodyWood:'STALE_BODY',neckWood:'STALE_NECK',pickups:'STALE_PICKUPS',customFields:[{label:'Power',value:'9V center negative'},{label:'Revision',value:'V2'},{label:'Speakers',value:'2 × 12 in'}] };
  for (const instrumentType of ['Electric Guitar','Acoustic Guitar','Bass Guitar','Other Guitar']) {
    const specs = printSpecifications({ ...saved, instrumentType });
    assert.ok(specs.some(([label]) => label === 'Body'));
    assert.ok(specs.some(([label]) => label === 'Neck'));
    assert.ok(specs.some(([label]) => label === 'Pickups'));
  }
  for (const instrumentType of ['Pedal','Amplifier']) {
    const specs = printSpecifications({ ...saved, instrumentType });
    assert.doesNotMatch(JSON.stringify(specs), /STALE_/);
    assert.equal(specs[1][0], 'Power');
    assert.ok(specs.some(([label,value]) => label === 'Revision' && value === 'V2'));
    assert.ok(specs.some(([label,value]) => label === 'Speakers' && value === '2 × 12 in'));
    assert.ok(specs.some(([label]) => label === 'Finish'));
  }
});

test('placement advice follows the saved type without claiming finish-safe adhesives', () => {
  assert.match(printPlacement('Bass Guitar'), /adhesive compatibility/);
  assert.match(printPlacement('Pedal'), /jacks.*battery/);
  assert.match(printPlacement('Amplifier'), /vents.*safety/);
  assert.doesNotMatch(printPlacement('Brand Asset'), /guitar|bass|pickguard/);
});

test('sale details print only for available gear; cart mappings never enter a printout', () => {
  const customFields = [['Power','9V'],['Asking price','199.00'],['Currency','USD'],['Store name','Example shop'],['Store platform','woocommerce'],['Store item ID','42'],['Store cart URL','https://example.test/cart/']].map(([label,value])=>({label,value}));
  for (const instrument of [{saleStatus:'not_for_sale'}, {saleStatus:'for_sale',safetyStatus:'lost'}, {saleStatus:'for_sale',safetyStatus:'stolen'}]) {
    const facts = printSpecifications({instrumentType:'Pedal',customFields,...instrument});
    assert.deepEqual(facts,[['Type','Pedal'],['Power','9V']]);
  }
  const facts = printSpecifications({instrumentType:'Pedal',customFields,saleStatus:'for_sale'});
  assert.deepEqual(hangTagSpecifications(facts).map(([label,value])=>[label,value.replace(/\s+/g,' ')]),[['Asking price','USD 199.00'],['Store name','Example shop'],['Power','9V']]);
  assert.doesNotMatch(JSON.stringify(facts), /woocommerce|Store item ID|Store cart URL|example.test/);
  assert.ok(!printSpecifications({instrumentType:'Pedal',customFields:[...customFields,{label:' asking   price ',value:'100'}],saleStatus:'for_sale'}).some(([label])=>label.trim().toLowerCase()==='asking price'));
});

test('rich sale specifications keep explicit currency and store before the eight-fact cap', () => {
  const customFields = [['Scale','25.5 in'],['Frets','22'],['Asking price','1250'],['Currency','USD'],['Store name','Example store']].map(([label,value])=>({label,value}));
  const facts = printSpecifications({instrumentType:'Electric Guitar',finish:'Red',bodyWood:'Alder',neckWood:'Maple',pickups:'Single coils',customFields,saleStatus:'for_sale'});
  assert.equal(facts.length,8);
  assert.deepEqual(facts.slice(0,3).map(([label,value])=>[label,value.replace(/\s+/g,' ')]),[['Type','Electric Guitar'],['Asking price','USD 1,250.00'],['Store name','Example store']]);
  assert.deepEqual(hangTagSpecifications(facts).slice(0,2).map(([label,value])=>[label,value.replace(/\s+/g,' ')]),[['Asking price','USD 1,250.00'],['Store name','Example store']]);
  for (const label of ['Finish','Body','Neck','Pickups','Scale']) assert.ok(facts.some(([key])=>key===label));
});

test('missing duplicate or invalid explicit currency never prints an ambiguous sale amount', () => {
  const price={label:'Asking price',value:'1250'}, store={label:'Store name',value:'Example store'};
  for (const currencyFields of [[],[{label:'Currency',value:''}],[{label:'Currency',value:'US dollars'}],[{label:'Currency',value:'ZZZ'}],[{label:'Currency',value:'USD'},{label:' CURRENCY ',value:'USD'}]]) {
    const facts=printSpecifications({instrumentType:'Electric Guitar',customFields:[price,store,...currencyFields],saleStatus:'for_sale'});
    assert.ok(!facts.some(([label])=>label==='Asking price'||label==='Currency'));
    assert.doesNotMatch(JSON.stringify(hangTagSpecifications(facts)),/1250/);
    assert.ok(facts.some(([label,value])=>label==='Store name'&&value==='Example store'));
  }
});

test('invalid or duplicate sale prices and unsupported precision fail closed without rounding or default currency', () => {
  for (const [amount,currency] of [['0','USD'],['-1','USD'],['1,250','USD'],['1250.123','USD'],['1250.50','JPY']]) {
    assert.ok(!printSpecifications({instrumentType:'Pedal',saleStatus:'for_sale',customFields:[{label:'Asking price',value:amount},{label:'Currency',value:currency}]}).some(([label])=>label==='Asking price'));
  }
  const duplicate=printSpecifications({instrumentType:'Pedal',saleStatus:'for_sale',customFields:[{label:'Asking price',value:'1250'},{label:' asking  price ',value:'1250'},{label:'Currency',value:'USD'}]});
  assert.ok(!duplicate.some(([label])=>label==='Asking price'));
  const explicit=printSpecifications({instrumentType:'Pedal',saleStatus:'for_sale',customFields:[{label:'Asking price',value:'1250'},{label:'Currency',value:'EUR'}]});
  assert.equal(explicit[1][1].replace(/\s+/g,' '),'EUR 1,250.00');
});

test('genuine same-batch sanitizer keeps purchase/contact metadata out of shared print facts', () => {
  assert.equal(typeof isOwnerOnlyInstrumentSpec,'function','Agent1 same-batch sanitizer dependency must be integrated');
  const raw = {qrCode:'QRG-QR4-PRIVACY',instrumentType:'Pedal',serial:'OWNER_SERIAL',showSerialPublic:false,owner:'OWNER_REAL_NAME',ownerUserEmail:'OWNER_EMAIL',publicCollection:{publicName:'Example collection'},createdAt:'2026-01-01',customFields:[{label:'Power',value:'9V'},{label:' SeLLeR   /   source ',value:'OWNER_SELLER'},{label:' ACQUIRED ',value:'OWNER_DATE'}]};
  const shared = sanitizePublicInstrument(raw);
  assert.equal(shared.owner,'Example collection');
  assert.ok(!Object.hasOwn(shared,'ownerUserEmail'));
  assert.deepEqual(printSpecifications(shared),[['Type','Pedal'],['Power','9V']]);
  assert.equal(resolveInstrumentPresentation(shared,'public').serialNumber,'');
  assert.match(JSON.stringify(printSpecifications(raw)),/OWNER_SELLER/);
  assert.equal(resolveInstrumentPresentation(raw,'owner').serialNumber,'OWNER_SERIAL');
});

test('genuine revised sanitizer and actual Print attribution suppress an absent collection caption', () => {
  const source=fs.readFileSync(path.join(web,'app/handout/[code]/page.tsx'),'utf8');
  const ast=ts.createSourceFile('page.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let expression;
  function visit(node) {
    if(ts.isJsxSelfClosingElement(node)&&node.tagName.getText(ast)==='PrintDocument') {
      expression=node.attributes.properties.find(p=>ts.isJsxAttribute(p)&&p.name.getText(ast)==='details')?.initializer?.expression;
    }
    ts.forEachChild(node,visit);
  }
  visit(ast);assert.ok(expression,'Actual PrintDocument details binding must exist');
  const output=ts.transpileModule(`export function select(instrument){const condition='',originalityStatus='',includeAvailability=false,saleStatus='',includeAttribution=true;return ${expression.getText(ast)};}`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const module={exports:{}};new Function('exports','module',output)(module.exports,module);
  const raw={qrCode:'QRG-QR4-CAPTION',owner:'OWNER_REAL_NAME',ownerUserEmail:'OWNER_EMAIL',createdAt:'2026-01-01'};
  const shared=sanitizePublicInstrument(raw);
  assert.equal(shared.owner,'Collection');
  assert.equal(shared.publicCollection,undefined);
  const details=module.exports.select(shared);
  assert.deepEqual(details,[]);
  const html=renderToStaticMarkup(React.createElement(PrintDocument,{mode:'hangtag',size:'4x6',orientation:'portrait',theme:'light',title:'Example gear',code:raw.qrCode,serial:'',facts:[],details,specifications:[],timeline:[],badges:null,photo:'',photoFit:'contain',qrDataUrl:'data:image/svg+xml,test',profileUrl:`https://www.qrguitar.com/i/${raw.qrCode}`,includeLogo:false,includeUrl:true,includeInstruction:false,scanInstruction:'',note:'',service:null}));
  assert.doesNotMatch(html,/Unclaimed|OWNER_REAL_NAME|OWNER_EMAIL|<dt>Collection<\/dt>/);
  assert.deepEqual(module.exports.select(sanitizePublicInstrument({...raw,publicCollection:{publicName:'Chosen collection'}})),[['Collection','Chosen collection']]);
});
