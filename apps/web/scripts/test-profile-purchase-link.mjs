import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function compile(file) {
  const source = fs.readFileSync(path.join(web, file), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', js)(name => name.startsWith('.') ? compile(path.join(path.dirname(file), `${name}.ts`)) : require(name), module, module.exports);
  return module.exports;
}
const { profilePurchaseLink } = compile('lib/profile-purchase-link.ts');
test('only for-sale items with a safe item listing offer a purchase action', () => {
  for (const saleStatus of [undefined, 'not_for_sale', 'sold']) assert.equal(profilePurchaseLink({ saleStatus, shopUrl: 'https://shop.example/item' }), null);
  assert.equal(profilePurchaseLink({ saleStatus: 'for_sale', websiteUrl: 'https://brand.example' }), null);
  assert.deepEqual(profilePurchaseLink({ saleStatus: 'for_sale', shopUrl: 'https://www.shop.example/item' }), { href: 'https://www.shop.example/item', host: 'shop.example' });
});
test('shop listing takes precedence; valid marketplace listing is a fallback', () => {
  assert.equal(profilePurchaseLink({ saleStatus: 'for_sale', shopUrl: 'https://shop.example/item', reverbUrl: 'https://reverb.com/item/1' }).href, 'https://shop.example/item');
  assert.equal(profilePurchaseLink({ saleStatus: 'for_sale', shopUrl: 'javascript:alert(1)', reverbUrl: 'https://reverb.com/item/1' }).host, 'reverb.com');
});
test('unsafe and credential-bearing destinations never become a purchase action', () => {
  for (const shopUrl of ['javascript:alert(1)', 'http://shop.example', '//shop.example', 'https://user:password@shop.example', 'https://shop.example/has space']) assert.equal(profilePurchaseLink({ saleStatus: 'for_sale', shopUrl }), null);
});
test('reported lost or stolen items never promote a purchase', () => {
  for (const safetyStatus of ['lost', 'stolen']) assert.equal(profilePurchaseLink({ saleStatus: 'for_sale', safetyStatus, shopUrl: 'https://shop.example/item' }), null);
});
test('Profile keeps ownership help below item content and preserves private claims', () => {
  const source = fs.readFileSync(path.join(web, 'app/i/[code]/ProfileClient.tsx'), 'utf8');
  assert.ok(source.indexOf('profile-claim-entry') > source.indexOf('<ProfilePanel'));
  assert.match(source, /\/ownership-claim\?code=/);
  assert.match(source, /Scanning this QR code opens the Profile\. It never changes ownership/);
  assert.match(source, /rel="ugc nofollow noopener noreferrer"/);
});
test('print format is available outside mobile settings; optional groups remain keyboard accessible', () => {
  const source = fs.readFileSync(path.join(web, 'app/handout/[code]/page.tsx'), 'utf8');
  assert.ok(source.indexOf('<select value={mode}') < source.indexOf('<aside'));
  assert.match(source, /input, textarea, summary/);
  assert.equal((source.match(/<details className=\{styles.optionGroup\}/g) || []).length, 2);
});
