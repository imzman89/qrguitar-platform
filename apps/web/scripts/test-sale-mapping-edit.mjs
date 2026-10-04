import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import test from 'node:test';

const require=createRequire(import.meta.url);
const ts=require('typescript');
const web=path.resolve(import.meta.dirname,'..');
function compile(file,overrides={}) {
  const module={exports:{}};
  const code=ts.transpileModule(fs.readFileSync(path.join(web,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  new Function('require','module','exports',code)(name=>overrides[name]|| (name.endsWith('.module.css')?{default:{}}:name.startsWith('.')?compile(path.join(path.dirname(file),name+'.ts')):require(name)),module,module.exports);
  return module.exports;
}
const sale=compile('lib/profile-sale.ts');
const Component=compile('components/ProfileSaleFields.tsx',{'../lib/profile-sale':sale,'./UiTextProvider':{useUiText:()=> (_key,source)=>source}}).ProfileSaleFields;
const itemA='https://store.example/product/instrument-a?variation_id=101';
const itemB='https://store.example/product/instrument-b?variation_id=202';
const details={ 'Asking price':'2500.00', Currency:'USD', 'Store name':'Example store', 'Store platform':'woocommerce', 'Store item ID':'101', 'Store cart URL':'https://store.example/cart/'};
function fields(values=details) {return Object.entries(values).map(([label,value],index)=>({id:`field-${index}`,label,value}));}
function nodes(value) {return !value||typeof value!=='object'?[]:Array.isArray(value)?value.flatMap(nodes):[value,...nodes(value.props?.children)];}
function edit(next,platform='woocommerce') {
  let savedFields=fields({...details,'Store platform':platform});
  let savedLinks=[{id:'shop',label:'Shop',url:itemA},{id:'social',label:'Instagram',url:'https://instagram.com/example'}];
  const tree=Component({fields:savedFields,links:savedLinks,onFieldsChange:value=>savedFields=value,onLinksChange:value=>savedLinks=value});
  const label=nodes(tree).find(node=>node.type==='label'&&nodes(node.props.children).some(child=>child.type==='span'&&child.props.children==='This instrument’s store page'));
  label.props.children[1].props.onChange({target:{value:next}});
  return {saleStatus:'for_sale',customFields:savedFields,customLinks:savedLinks};
}

test('changing the selected WooCommerce instrument page invalidates its old exact item ID before save',()=>{
  const record=edit(itemB);
  assert.equal(sale.readSaleDetail(record,'Store item ID'),'');
  assert.equal(sale.wooCommerceCartLink(record),null);
  assert.match(sale.profileSaleFieldsError(record),/variation ID/);
  assert.equal(sale.profileSaleOffer(record).target.href,itemB);
  assert.match(sale.profileSaleOffer(record).price,/USD\s+2,500\.00/);
});

test('changing a variant query or merchant origin also invalidates the old item ID',()=>{
  for (const url of ['https://store.example/product/instrument-a?variation_id=202','https://other.example/product/instrument-a']) {
    const record=edit(url);
    assert.equal(sale.wooCommerceCartLink(record),null);
    assert.equal(sale.readSaleDetail(record,'Store item ID'),'');
  }
});

test('retained mapping cannot reappear after editing a listing destination and selecting WooCommerce later',()=>{
  const record=edit(itemB,'listing');
  assert.equal(sale.readSaleDetail(record,'Store item ID'),'');
  record.customFields=sale.updateSaleDetail(record.customFields,'Store platform','woocommerce');
  assert.equal(sale.wooCommerceCartLink(record),null);
});

test('unchanged item URL preserves mapping, prices, currency, existing IDs and unrelated links',()=>{
  const record=edit(' '+itemA+' ');
  assert.deepEqual(record.customFields,fields());
  assert.equal(sale.wooCommerceCartLink(record).href,'https://store.example/cart/?add-to-cart=101&quantity=1');
  assert.deepEqual(record.customLinks.find(link=>link.id==='social'),{id:'social',label:'Instagram',url:'https://instagram.com/example'});
});

test('an explicitly reviewed replacement ID enables only the newly selected instrument mapping',()=>{
  const record=edit(itemB);
  record.customFields=sale.updateSaleDetail(record.customFields,'Store item ID','202');
  assert.equal(sale.wooCommerceCartLink(record).href,'https://store.example/cart/?add-to-cart=202&quantity=1');
  assert.equal(sale.profileSaleFieldsError(record),'');
});
