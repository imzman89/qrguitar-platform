import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import sharp from 'sharp';
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
const require = createRequire(import.meta.url), ts = require('typescript');
const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function compile(file, overrides = {}) {
  const output = ts.transpileModule(fs.readFileSync(path.join(web, file), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', output)(name => {
    for (const [ending, value] of Object.entries(overrides)) if (name.endsWith(ending)) return value;
    if (name.startsWith('.')) return compile(path.relative(web, path.resolve(web, path.dirname(file), name) + '.ts'), overrides);
    return require(name);
  }, module, module.exports);
  return module.exports;
}
const { buildQrBatchPlan, qrBatchGeometry, defaultQrBatchSettings: defaults } = compile('lib/qr-batch-layout.ts');
const { prepareQrBatch, validateQrBatchRecords, loadQrBatchInventory } = compile('lib/qr-batch-client.ts');
const { printQrSvg } = compile('lib/qr-print-output.ts');
const identity = { id: 'owner-A', token: 'synthetic-test-token' };
const inventory = ['QRG-RETAIL-A', 'QRG-RETAIL-B'].map(qrCode => ({ qrCode, title: qrCode, isPublic: true }));
const requests = [{ code: inventory[0].qrCode, quantity: 2 }, { code: inventory[1].qrCode, quantity: 1 }];
const fakeSvg = async () => '<svg width="38.1mm" height="38.1mm"></svg>';
const options = () => ({ requests, settings: { ...defaults }, readIdentity: async () => identity, loadInventory: async () => inventory, renderQr: fakeSvg, isCurrent: () => true, signal: new AbortController().signal });

test('mixed A×2 and B×1 retain instrument identity, order and exact 1.5-inch label boundaries', () => {
  const plan = buildQrBatchPlan(requests, defaults);
  assert.equal(plan.count, 3); assert.equal(plan.pages.length, 1);
  assert.deepEqual(plan.pages[0].map(cell => [cell.code, cell.copy]), [['QRG-RETAIL-A',1],['QRG-RETAIL-A',2],['QRG-RETAIL-B',1]]);
  for (const cell of plan.pages[0]) assert.ok(Math.abs(cell.sideMm / 25.4 - 1.5) < 1e-9);
});
test('Letter/A4 sheet geometry, custom spacing and skipped used labels paginate without overlap or clipping', () => {
  for (const stock of ['letter','a4']) for (const sideMm of [25,32,38.1]) for (const gap of [0,3.175,12.7]) {
    const settings = { ...defaults, stock, sideMm, gapXMm: gap, gapYMm: gap };
    const geometry = qrBatchGeometry(settings); settings.skip = geometry.capacity - 1;
    const plan = buildQrBatchPlan([{ code:'QRG-RETAIL-A',quantity:100 }], settings);
    assert.equal(plan.pages[0].length, 1); assert.equal(plan.pages[0][0].slot, settings.skip);
    assert.equal(plan.pages[1][0].slot, 0);
    assert.equal(plan.pages.flat().length, 100);
    for (const page of plan.pages) for (let index=0; index<page.length; index++) {
      const cell = page[index];
      assert.ok(cell.xMm >= settings.leftMm && cell.yMm >= settings.topMm);
      assert.ok(cell.xMm + cell.sideMm <= plan.widthMm - settings.rightMm + 1e-8);
      assert.ok(cell.yMm + cell.sideMm <= plan.heightMm - settings.bottomMm + 1e-8);
      for (const other of page.slice(index+1)) assert.ok(cell.xMm + cell.sideMm <= other.xMm + 1e-8 || other.xMm + other.sideMm <= cell.xMm + 1e-8 || cell.yMm + cell.sideMm <= other.yMm + 1e-8 || other.yMm + other.sideMm <= cell.yMm + 1e-8);
    }
  }
});
test('individual label printers receive one exact square per copy', () => {
  const plan = buildQrBatchPlan(requests, { ...defaults,stock:'single' });
  assert.equal(plan.pages.length,3); assert.equal(plan.widthMm,38.1); assert.equal(plan.heightMm,38.1);
  for (const page of plan.pages) assert.deepEqual([page[0].xMm,page[0].yMm,page.length],[0,0,1]);
});
test('2 × 3-inch thermal stock centers an unchanged 38.1 mm QR, one page per copy', () => {
  const plan = buildQrBatchPlan(requests, { ...defaults, stock:'single', labelWidthMm:50.8, labelHeightMm:76.2 });
  assert.deepEqual([plan.widthMm,plan.heightMm,plan.columns,plan.rows,plan.capacity,plan.count,plan.pages.length], [50.8,76.2,1,1,1,3,3]);
  assert.deepEqual(plan.pages.flat().map(cell => [cell.code,cell.copy]), [['QRG-RETAIL-A',1],['QRG-RETAIL-A',2],['QRG-RETAIL-B',1]]);
  for (const cells of plan.pages) {
    assert.equal(cells.length,1); const cell=cells[0];
    assert.equal(cell.sideMm,38.1); assert.equal(cell.slot,0);
    assert.ok(Math.abs(cell.xMm-6.35)<1e-9); assert.ok(Math.abs(cell.yMm-19.05)<1e-9);
  }
});

test('thermal stock defaults stay square; invalid dimensions and used-label skips fail without shrinking', () => {
  for (const sideMm of [25,32,38.1]) {
    const geometry=qrBatchGeometry({ ...defaults,stock:'single',sideMm });
    assert.deepEqual([geometry.widthMm,geometry.heightMm,geometry.capacity,geometry.leftMm,geometry.topMm], [sideMm,sideMm,1,0,0]);
  }
  for (const field of ['labelWidthMm','labelHeightMm']) for (const value of [38,NaN,Infinity,-Infinity,0,200.1,null,'50.8']) {
    assert.throws(() => buildQrBatchPlan(requests,{...defaults,stock:'single',[field]:value}), /Thermal label width and height/);
  }
  const largest=buildQrBatchPlan(requests,{...defaults,stock:'single',labelWidthMm:200,labelHeightMm:200});
  assert.equal(largest.capacity,1); assert.equal(largest.pages.length,3);
  assert.ok(largest.pages.flat().every(cell=>cell.sideMm===38.1));
  for (const skip of [1,-1,NaN,0.5]) assert.throws(() => buildQrBatchPlan(requests,{...defaults,stock:'single',skip}), /skip must be zero/);
});

test('invalid quantities, aliases, geometry and oversized jobs fail without partial layout', () => {
  for (const quantity of [0,-1,1.5,NaN,Infinity,501]) assert.throws(() => buildQrBatchPlan([{code:'A',quantity}],defaults));
  assert.throws(() => buildQrBatchPlan([{code:'A',quantity:250},{code:'B',quantity:251}],defaults),/500/);
  assert.throws(() => buildQrBatchPlan([{code:'A',quantity:1},{code:'a',quantity:1}],defaults),/distinct/);
  for (const settings of [{leftMm:NaN},{topMm:-1},{gapXMm:Infinity},{leftMm:100,rightMm:100},{skip:0.5},{skip:999},{stock:'unknown'},{sideMm:38}]) assert.throws(() => buildQrBatchPlan(requests,{...defaults,...settings}));
});
test('private, removed, unknown and ambiguous records cannot silently enter or disappear from a print job', () => {
  assert.throws(() => validateQrBatchRecords([{...inventory[0],isPublic:false},inventory[1]],requests),/unavailable/);
  assert.throws(() => validateQrBatchRecords([inventory[1]],requests),/no longer/);
  assert.throws(() => validateQrBatchRecords([inventory[0],inventory[0]],requests),/duplicate/);
  assert.throws(() => validateQrBatchRecords(inventory,[{code:'qrg-retail-a',quantity:1}]),/no longer/);
});
test('inventory requests are private, authenticated and reject another actor or incomplete server eligibility', async () => {
  let seen;
  const fetcher = async (url,init) => { seen={url,init}; return new Response(JSON.stringify({ok:true,actorId:identity.id,instruments:inventory})); };
  assert.deepEqual(await loadQrBatchInventory(identity,new AbortController().signal,fetcher),inventory);
  assert.equal(seen.url,'/api/print/qr'); assert.equal(seen.init.cache,'no-store'); assert.equal(seen.init.headers.authorization,`Bearer ${identity.token}`);
  for (const body of [{ok:true,actorId:'owner-B',instruments:inventory},{ok:true,actorId:identity.id,instruments:[{qrCode:'A',title:'A'}]},{ok:false,instruments:inventory}]) await assert.rejects(loadQrBatchInventory(identity,new AbortController().signal,async()=>new Response(JSON.stringify(body))));
});
test('preparation reuses one QR per instrument while retaining every requested copy', async () => {
  const rendered=[];
  const result=await prepareQrBatch({...options(),renderQr:async code=>{rendered.push(code);return fakeSvg();}});
  assert.deepEqual(rendered,['QRG-RETAIL-A','QRG-RETAIL-B']); assert.equal(result.plan.count,3); assert.equal(result.ownerId,identity.id);
});
test('missing or private saved inventory is rejected before generating any QR', async () => {
  for(const records of [[],[{...inventory[0],isPublic:false},inventory[1]]]) {
    let calls=0; await assert.rejects(prepareQrBatch({...options(),loadInventory:async()=>records,renderQr:async()=>{calls++;return fakeSvg();}})); assert.equal(calls,0);
  }
});
test('account changes after rendering, stale selections and QR failures cannot return a printable partial batch', async () => {
  let reads=0; await assert.rejects(prepareQrBatch({...options(),readIdentity:async()=>++reads===1?identity:{id:'owner-B',token:'synthetic-B'}}),/account changed/);
  let current=true; await assert.rejects(prepareQrBatch({...options(),loadInventory:async()=>{current=false;return inventory;},isCurrent:()=>current}),/selection changed/);
  await assert.rejects(prepareQrBatch({...options(),renderQr:async code=>{if(code.endsWith('B'))throw Error('render failed');return fakeSvg();}}),/render failed/);
  await assert.rejects(prepareQrBatch({...options(),readIdentity:async()=>null}),/Sign in/);
});
test('cancellation releases a hanging authentication or QR render without publishing late results', async () => {
  for(const override of [{readIdentity:()=>new Promise(()=>{})},{renderQr:()=>new Promise(()=>{})}]) {
    const controller=new AbortController(); const work=prepareQrBatch({...options(),...override,signal:controller.signal});
    setTimeout(()=>controller.abort(),5); await assert.rejects(work,error=>error.name==='AbortError');
  }
});
test('each mixed label, including repeat copies, decodes its permanent Profile URL using the original application SVG', async () => {
  prepareZXingModule({overrides:{wasmBinary:fs.readFileSync(require.resolve('zxing-wasm/reader/zxing_reader.wasm'))}});
  const plan=buildQrBatchPlan(requests,defaults);
  for(const cell of plan.pages.flat()) {
    const svg=await printQrSvg(cell.code,cell.sideMm);
    assert.match(svg,/width="38.1mm" height="38.1mm"/);
    const png=await sharp(Buffer.from(svg),{density:300}).png().toBuffer();
    const decoded=await readBarcodes(new Uint8Array(png),{formats:['QRCode'],tryInvert:false});
    assert.equal(decoded.length,1); assert.equal(decoded[0].text,`https://www.qrguitar.com/i/${cell.code}`);
  }
});
test('server print inventory scopes to the authenticated owner and applies current public eligibility without media or private documents', async () => {
  let seenPath='', readCalls=0;
  const route=compile('app/api/print/qr/route.ts',{
    'supabase-server':{getAuthenticatedUser:async()=>({user:{id:identity.id}}),createServerSupabaseClient:()=>({from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{id:identity.id,account_status:'active',hide_public_content:false},error:null})})})})})},
    'supabase-pagination':{supabasePagedRows:async query=>{seenPath=query;readCalls++;return [{qr_code:'QRG-RETAIL-A',name:'Real guitar',visibility:'public'},{qr_code:'PRIVATE',name:'Private',visibility:'private'},{qr_code:'ARCHIVE',name:'Archive',visibility:'public',admin_archived_at:'2026-01-01'},{qr_code:'QRG-PI260001',name:'Retired',visibility:'public'}];}}
  });
  const response=await route.GET(new Request('https://example.test/api/print/qr?owner_id=owner-B'));
  const body=await response.json(); assert.equal(body.actorId,identity.id); assert.equal(readCalls,1);
  const query=new URL(seenPath,'https://example.test'); assert.equal(query.searchParams.get('owner_id'),`eq.${identity.id}`); assert.equal(query.searchParams.get('admin_archived_at'),'is.null');assert.equal(query.searchParams.get('owner_removed_at'),'is.null');
  assert.equal(response.headers.get('Cache-Control'),'private, no-store, max-age=0'); assert.equal(response.headers.get('Vary'),'Authorization');
  assert.deepEqual(body.instruments.map(row=>row.isPublic),[true,false,false,false]); assert.doesNotMatch(JSON.stringify(body),/token|serial_number|private_notes|document/);
});
test('unauthenticated print inventory performs no privileged database read',async()=>{
  const route=compile('app/api/print/qr/route.ts',{'supabase-server':{getAuthenticatedUser:async()=>({user:null}),createServerSupabaseClient:()=>{throw Error('Must not read');}}});
  const response=await route.GET(new Request('https://example.test/api/print/qr'));assert.equal(response.status,401);
});
