import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
const require=createRequire(import.meta.url),ts=require('typescript');
const web=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function compile(file){const module={exports:{}};const output=ts.transpileModule(fs.readFileSync(path.join(web,file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;new Function('require','module','exports',output)(name=>name.startsWith('.')?compile(path.relative(web,path.resolve(web,path.dirname(file),name)+'.ts')):require(name),module,module.exports);return module.exports;}
const {createQrBatchPdf}=compile('lib/qr-batch-pdf.ts');
const {defaultQrBatchSettings:defaults}=compile('lib/qr-batch-layout.ts');
test('vector PDF has exact physical paper sizes, original mixed copies, reusable QR forms and valid object offsets',()=>{
  const requests=[{code:'QRG-A00174',quantity:2},{code:'QRG-AB02777',quantity:1}];
  for(const stock of ['letter','a4','single']){
    const bytes=createQrBatchPdf(requests,{...defaults,stock}),pdf=Buffer.from(bytes).toString('ascii');
    assert.match(pdf,/^%PDF-1.4/);assert.match(pdf,/\/PrintScaling \/None/);
    assert.equal((pdf.match(/\/Subtype \/Form/g)||[]).length,2);
    assert.equal((pdf.match(/\/QR\d+ Do/g)||[]).length,3);
    assert.equal((pdf.match(/\/Type \/Page /g)||[]).length,stock==='single'?3:1);
    const boxes=[...pdf.matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)].map(match=>match.slice(1).map(Number));
    const expected=stock==='letter'?[612,792]:stock==='a4'?[210/25.4*72,297/25.4*72]:[108,108];
    for(const box of boxes)for(let i=0;i<2;i++)assert.ok(Math.abs(box[i]-expected[i])<1e-7);
    const xref=Number(pdf.match(/startxref\n(\d+)/)?.[1]);assert.equal(pdf.slice(xref,xref+4),'xref');
    for(const match of pdf.matchAll(/(\d{10}) 00000 n /g))assert.match(pdf.slice(Number(match[1])),/^\d+ 0 obj/);
    assert.doesNotMatch(pdf,/\/Image|\/JavaScript|\/OpenAction|private_notes|owner_email/);
    if(process.env.QR_BATCH_PDF_QA_DIR&&stock!=='a4'){
      const dir=path.resolve(process.env.QR_BATCH_PDF_QA_DIR);fs.mkdirSync(dir,{recursive:true});
      fs.writeFileSync(path.join(dir,`labels-verification-${stock}.pdf`),bytes);
      fs.writeFileSync(path.join(dir,`labels-verification-${stock}.json`),JSON.stringify({requests,settings:{...defaults,stock},scope:'Actual application vector-PDF generator with existing public Profile IDs. No ownership/database writes; not physical printer acceptance.'},null,2));
    }
  }
});
test('2 × 3-inch thermal PDF retains 38.1 mm QR size and centers every copy on its own page',()=>{
  const requests=[{code:'QRG-A00174',quantity:2},{code:'QRG-AB02777',quantity:1}];
  const settings={...defaults,stock:'single',labelWidthMm:50.8,labelHeightMm:76.2};
  const pdf=Buffer.from(createQrBatchPdf(requests,settings)).toString('ascii');
  assert.equal((pdf.match(/\/Type \/Page /g)||[]).length,3);
  assert.equal((pdf.match(/\/Subtype \/Form/g)||[]).length,2);
  assert.match(pdf,/\/PrintScaling \/None/);
  const pages=[...pdf.matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)];
  assert.equal(pages.length,3);
  for(const page of pages) {
    assert.ok(Math.abs(Number(page[1])-144)<1e-7);
    assert.ok(Math.abs(Number(page[2])-216)<1e-7);
  }
  const forms=[...pdf.matchAll(/\/BBox \[0 0 (\d+) (\d+)\]/g)].map(match=>match.slice(1).map(Number));
  const placements=[...pdf.matchAll(/q ([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm \/QR(\d+) Do Q/g)];
  assert.equal(placements.length,3);
  assert.deepEqual(placements.map(match=>Number(match[5])),[0,0,1]);
  for(const placement of placements) {
    const form=forms[Number(placement[5])];
    assert.ok(Math.abs(Number(placement[1])*form[0]-108)<1e-6);
    assert.ok(Math.abs(Number(placement[2])*form[1]-108)<1e-6);
    assert.ok(Math.abs(Number(placement[3])-18)<1e-7);
    assert.ok(Math.abs(Number(placement[4])-54)<1e-7);
  }
  for(const dimensions of [{labelWidthMm:38},{labelHeightMm:NaN},{labelWidthMm:null},{labelHeightMm:200.1}]) {
    assert.throws(()=>createQrBatchPdf(requests,{...settings,...dimensions}),/Thermal label width and height/);
  }
});

test('PDF pagination preserves first-sheet skips and blocks invalid geometry/counts before writing bytes',()=>{
  const pdf=Buffer.from(createQrBatchPdf([{code:'QRG-A00174',quantity:31}],{...defaults,skip:29})).toString('ascii');
  assert.match(pdf,/\/Count 2/);assert.equal((pdf.match(/\/QR0 Do/g)||[]).length,31);
  for(const quantity of [0,501,1.5])assert.throws(()=>createQrBatchPdf([{code:'QRG-A00174',quantity}],defaults));
});
test('tiny custom alignments remain valid fixed-point PDF numbers without exponent notation',()=>{
  const pdf=Buffer.from(createQrBatchPdf([{code:'QRG-A00174',quantity:1}],{...defaults,leftMm:0.00000001})).toString('ascii');
  assert.match(pdf,/0\.00000003 /); assert.doesNotMatch(pdf,/\d(?:\.\d+)?e[-+]\d/i);
});
