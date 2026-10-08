import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';
import { withUiTextTestContext } from './ui-text-test-context.mjs';

const require = withUiTextTestContext(createRequire(import.meta.url));
const ts = require('typescript');
const web = path.resolve(import.meta.dirname, '..');
function compile(file, overrides = {}, append = '') {
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(web, file), 'utf8') + append;
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('require', 'module', 'exports', code)(name => overrides[name] || (name.endsWith('.module.css') ? { default: {} } : name.startsWith('.') ? compile(path.join(path.dirname(file), `${name}.ts`)) : require(name)), module, module.exports);
  return module.exports;
}
const sale = compile('lib/profile-sale.ts');
const { profilePurchaseLink } = compile('lib/profile-purchase-link.ts');
const contract = compile('lib/instrument-profile-contract.ts');
const { buildCreateProfilePayload } = compile('lib/profile-create.ts');
const never = () => { throw Error('No merchant/Auth/Storage network in sale mapping fixtures'); };
const { mapRecord } = compile('lib/public-instruments.ts', {
  './local-demo': { defaultQrStyle: {} }, './record-trust': {}, 'next/cache': { unstable_noStore: never },
  './supabase-http': { supabaseHttpsJson: never }, './supabase-pagination': { supabasePagedRows: never, supabaseRowsByValues: never },
  './public-profile-eligibility': {}, './public-file-url': { publicFileUrl: never }, './instrument-profile-contract': contract
}, '\nexport { mapRecord };');
const fields = (values) => Object.entries(values).map(([label, value], i) => ({ id: `sale-${i}`, label, value }));
const details = { 'Asking price': '2500.00', Currency: 'USD', 'Store name': 'Example Guitars', 'Store platform': 'woocommerce', 'Store item ID': '9007199254740993123', 'Store cart URL': 'https://store.example/music/cart/' };
const profile = (changes = {}) => ({ qrCode: 'QRG-SALEFIXTURE', permanentPath: '/i/QRG-SALEFIXTURE', saleStatus: 'for_sale', customLinks: [{ label: 'Shop', url: 'https://store.example/product/instrument-123' }], customFields: fields(details), ...changes });

test('exact WooCommerce product or variation mapping adds quantity one without truncating IDs', () => {
  const target = sale.wooCommerceCartLink(profile());
  assert.equal(target.href, 'https://store.example/music/cart/?add-to-cart=9007199254740993123&quantity=1');
  const params = new URL(target.href).searchParams;
  assert.equal(params.size, 2);
  assert.equal(sale.profileSaleOffer(profile()).storeName, 'Example Guitars');
});

test('WooCommerce is explicitly selected; ordinary and Shopify links never claim cart addition', () => {
  for (const platform of ['', 'listing', 'shopify', 'unknown']) {
    const record = profile({ customFields: fields({ ...details, 'Store platform': platform }) });
    const offer = sale.profileSaleOffer(record);
    assert.equal(offer.cart, null);
    assert.equal(offer.target.href, record.customLinks[0].url);
  }
  const url = 'https://guitar-shop.myshopify.com/products/one-guitar?variant=1234567890123';
  assert.equal(sale.profileSaleOffer(profile({ customLinks: [{ label: 'Shop', url }] })).target.href, url);
});

test('wrong store, malformed IDs and unsafe cart destinations fall back to the instrument page', () => {
  for (const url of ['http://store.example/cart/', 'https://other.example/cart/', 'https://store.example:444/cart/', 'https://user:pass@store.example/cart/', 'https://store.example/cart/?quantity=5', 'https://store.example/cart/#token', 'https://store.example/checkout/', 'https://store.example/cart/clear', 'https://store.example/cart/%2fclear', 'javascript:alert(1)', '//store.example/cart/', 'https://store.example/']) {
    const record = profile({ customFields: fields({ ...details, 'Store cart URL': url }) });
    assert.equal(sale.wooCommerceCartLink(record), null, url);
    assert.equal(sale.profileSaleOffer(record).target.href, record.customLinks[0].url);
  }
  for (const id of ['', '0', '-1', '1.2', '1e3', '00123', '123,456', '123:2', '123&quantity=5', 'gid://shopify/ProductVariant/123']) {
    const record = profile({ customFields: fields({ ...details, 'Store item ID': id }) });
    assert.equal(sale.wooCommerceCartLink(record), null, id);
  }
});

test('no sale promotion on sold/not-for-sale, lost or stolen instruments; the permanent identity survives', () => {
  for (const changes of [{ saleStatus: 'not_for_sale' }, { saleStatus: 'sold' }, { saleStatus: undefined }, { safetyStatus: 'lost' }, { safetyStatus: 'stolen' }]) {
    const record = profile(changes), before = JSON.stringify(record);
    assert.equal(sale.profileSaleOffer(record), null);
    assert.equal(sale.wooCommerceCartLink(record), null);
    assert.equal(JSON.stringify(record), before);
    assert.equal(record.permanentPath, '/i/QRG-SALEFIXTURE');
  }
});

test('homepages and generic carts/checkouts cannot masquerade as instrument pages', () => {
  for (const shopUrl of ['https://store.example/', 'https://store.example/shop/', 'https://store.example/products', 'https://store.example/fr/cart', 'https://store.example/cart/123:1', 'https://store.example/cart/add?id=123', 'https://store.example/checkout?id=123', 'https://store.example/?add-to-cart=123']) assert.equal(profilePurchaseLink({ saleStatus: 'for_sale', shopUrl }), null, shopUrl);
  assert.equal(profilePurchaseLink({ saleStatus: 'for_sale', shopUrl: 'https://store.example/store/guitars/item-123' }).href, 'https://store.example/store/guitars/item-123');
});

test('asking price requires an explicit currency and valid decimal precision; acquisition cost is never used', () => {
  assert.match(sale.profileAskingPrice(profile()), /USD\s+2,500\.00/);
  for (const [amount, currency] of [['', 'USD'], ['2500', ''], ['-1', 'USD'], ['0', 'USD'], ['1e4', 'USD'], ['$2500', 'USD'], ['2,500', 'USD'], ['1.234', 'USD'], ['1.5', 'JPY'], ['2', 'ZZZ']]) assert.equal(sale.profileAskingPrice(profile({ customFields: fields({ 'Asking price': amount, Currency: currency }) })), null);
  assert.match(sale.profileAskingPrice(profile({ customFields: fields({ 'Asking price': '2500', Currency: 'JPY' }) })), /JPY\s+2,500/);
  assert.equal(sale.profileAskingPrice(profile({ customFields: fields({ 'Purchase price': '50.00', Currency: 'USD', 'Seller / source': 'Private name', Acquired: '2024-01-01' }) })), null);
});

test('conflicting saved IDs and currencies never pick an arbitrary cart or asking price', () => {
  assert.equal(sale.wooCommerceCartLink(profile({ customFields: [...fields(details), { label: 'store item id', value: '123' }] })), null);
  assert.equal(sale.profileAskingPrice(profile({ customFields: [...fields(details), { label: 'currency', value: 'EUR' }] })), null);
  const duplicate = profile({ customLinks: [{ label: 'Shop', url: 'https://store.example/product/a' }, { label: 'shop', url: 'https://store.example/product/b' }] });
  assert.equal(sale.wooCommerceCartLink(duplicate), null);
  assert.equal(sale.profileSaleOffer(duplicate).target, null);
});

test('store display names bind to the chosen destination; marketplace fallback never carries the old shop name', () => {
  const record = profile({ shopUrl: 'javascript:bad', customLinks: [{ label: 'Shop', url: 'https://store.example/' }, { label: 'Reverb', url: 'https://reverb.com/item/123' }] });
  assert.equal(sale.profileSaleOffer(record).storeName, 'reverb.com');
  const noName = profile({ customFields: fields({ ...details, 'Store name': '' }), publicCollection: { publicName: 'Chosen Collection', websiteUrl: 'https://store.example/' } });
  assert.equal(sale.profileSaleOffer(noName).storeName, 'Chosen Collection');
  assert.equal(sale.profileSaleOffer({ ...noName, publicCollection: { publicName: 'Unrelated collection', websiteUrl: 'https://other.example/' } }).storeName, 'store.example');
});

test('Create serialization and actual public mapping preserve price and exact mapping without changing QR identity', () => {
  const body = { model: 'Synthetic instrument', serial: 'SALEFIXTURE', instrumentType: 'Electric Guitar', photos: ['/fixtures/front.jpg'], saleStatus: 'for_sale', customFields: fields(details), customLinks: profile().customLinks };
  const stored = JSON.parse(JSON.stringify(buildCreateProfilePayload(body, 'Fender', 'Private account name', contract.profileLinkSpecLabel)));
  const mapped = contract.sanitizePublicInstrument(mapRecord({ guitar: { ...stored.guitar, id: 'fixture', qr_code: 'QRG-SALEFIXTURE', created_at: '2026-10-02T00:00:00Z', safety_status: 'clear' }, specs: stored.specs, media: stored.media.map((m) => m.storage_path), documents: [] }));
  assert.equal(sale.profileSaleOffer(mapped).target.href, sale.wooCommerceCartLink(profile()).href);
  assert.match(sale.profileSaleOffer(mapped).price, /USD\s+2,500\.00/);
  assert.equal(mapped.ownerUserEmail, undefined);
  assert.equal(mapped.permanentPath, '/i/QRG-SALEFIXTURE');
});

test('owner sale edits preserve unrelated saved specs and stable existing IDs', () => {
  const initial = [{ id: 'finish', label: 'Finish', value: 'Sunburst' }, { id: 'old-price', label: 'Asking price', value: '2000.00' }];
  const next = sale.updateSaleDetail(initial, 'Asking price', '2500.00');
  assert.deepEqual(next[0], initial[0]);
  assert.equal(next[1].id, 'old-price');
  assert.equal(initial[1].value, '2000.00');
  assert.deepEqual(sale.updateSaleDetail(next, 'Asking price', ''), [initial[0]]);
});

test('seller validation blocks partial currency and wrong cart mappings before save; unavailable instruments keep retained details', () => {
  assert.equal(sale.profileSaleFieldsError(profile()), '');
  assert.match(sale.profileSaleFieldsError(profile({ customFields: fields({ 'Asking price': '2500' }) })), /currency/);
  assert.match(sale.profileSaleFieldsError(profile({ customFields: fields({ ...details, 'Store item ID': 'bad' }) })), /variation ID/);
  assert.match(sale.profileSaleFieldsError(profile({ customLinks: [{ label: 'Shop', url: 'https://store.example/' }] })), /instrument page/);
  assert.equal(sale.profileSaleFieldsError(profile({ saleStatus: 'not_for_sale', customFields: fields({ 'Asking price': 'bad' }) })), '');
});

test('actual owner Sale fields update persisted details and exact Shop link without erasing other links', () => {
  const Component = compile('components/ProfileSaleFields.tsx', { '../lib/profile-sale': sale, './UiTextProvider': { useUiText: () => (_, source) => source } }).ProfileSaleFields;
  let savedFields = [], savedLinks = [{ id: 'social', label: 'Instagram', url: 'https://instagram.com/example' }];
  function nodes(value) { return !value || typeof value !== 'object' ? [] : Array.isArray(value) ? value.flatMap(nodes) : [value, ...nodes(value.props?.children)]; }
  const tree = () => Component({ fields: savedFields, links: savedLinks, onFieldsChange: value => savedFields = value, onLinksChange: value => savedLinks = value });
  const inputFor = caption => nodes(tree()).find(n => n.type === 'label' && nodes(n.props.children).some(child => child.type === 'span' && child.props.children === caption)).props.children[1];
  inputFor('Asking price').props.onChange({ target: { value: '3200.00' } });
  inputFor('Currency').props.onChange({ target: { value: 'USD' } });
  inputFor('This instrument’s store page').props.onChange({ target: { value: 'https://store.example/product/guitar-456' } });
  assert.equal(sale.readSaleDetail({ customFields: savedFields }, 'Asking price'), '3200.00');
  assert.equal(savedLinks[0].id, 'social');
  assert.equal(savedLinks[1].label, 'Shop');
  assert.equal(savedLinks[1].url, 'https://store.example/product/guitar-456');
});
