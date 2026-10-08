import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';
import { withUiTextTestContext } from './ui-text-test-context.mjs';
const require = withUiTextTestContext(createRequire(import.meta.url));
const ts = require('typescript'), postcss = require('postcss');
const web = path.resolve(import.meta.dirname, '..');
const css = fs.readFileSync(path.join(web, 'app/edit/[code]/edit.module.css'), 'utf8');
// Snapshot is the confirmed candidate's global stylesheet, not the older checkout.
const snapshot = path.resolve(web, '../../outputs/mobile-editor-photos-20260930/preimages/apps__web__app__globals.css');
const globalCss = fs.readFileSync(fs.existsSync(snapshot) ? snapshot : path.join(web, 'app/globals.css'), 'utf8');
const sheet = postcss.parse(globalCss), scoped = postcss.parse(css);
const phone = scoped.nodes.find(n => n.type === 'atrule' && n.params === '(max-width: 520px)');
assert.ok(phone, 'Edit-only phone rules must exist');
function declarations(selector) {
  const rule = phone.nodes.find(n => n.type === 'rule' && n.selector.includes(selector));
  assert.ok(rule, selector); return Object.fromEntries(rule.nodes.filter(n => n.type === 'decl').map(n => [n.prop, n.value]));
}
// This is an explicit contract for the three organizer-grid rules in these
// stylesheets, not a browser layout engine or a screenshot/geometry claim.
function gridAt(width, edit) {
  let winner;
  for (const [root, isScoped] of [[sheet, false], [scoped, true]]) root.walkRules(rule => {
    const selector = rule.selector.replace(/:global\(([^)]+)\)/g, '$1');
    if (!['.photo-organizer-grid', '.photoSection .photo-organizer-grid'].includes(selector)) return;
    if (isScoped && !edit) return;
    for (let parent = rule.parent; parent; parent = parent.parent) if (parent.type === 'atrule' && parent.name === 'media') {
      const max = /max-width:\s*(\d+)px/.exec(parent.params), min = /min-width:\s*(\d+)px/.exec(parent.params);
      if ((max && width > Number(max[1])) || (min && width < Number(min[1]))) return;
    }
    const value = rule.nodes.find(n => n.type === 'decl' && n.prop === 'grid-template-columns')?.value;
    const specificity = (selector.match(/\.[\w-]+/g) || []).length;
    if (value && (!winner || specificity >= winner.specificity)) winner = { value, specificity };
  });
  return winner?.value;
}
for (const width of [320, 390]) test(`Edit ${width}px grid beats late one-column global rule without affecting Create`, () => {
  assert.equal(gridAt(width, true), 'repeat(2, minmax(0, 1fr))');
  assert.equal(gridAt(width, false), 'minmax(0, 1fr)');
  assert.equal(declarations('.photo-organizer-tile > img')['object-fit'], 'contain');
  assert.equal(declarations('.photo-organizer-tile > img').height, '96px');
});
test('Desktop and larger phone grid remain unchanged; all new rules are owner-photo scoped', () => {
  for (const width of [600, 760, 1440]) assert.equal(gridAt(width, true), gridAt(width, false));
  phone.walkRules(rule => assert.ok(rule.selector.split(',').every(s => s.trim().startsWith('.photoSection :global('))));
  assert.doesNotMatch(phone.toString(), /display:\s*none|line-clamp|overflow-y|scroll-snap|max-height|object-fit:\s*cover/);
});
test('Phone menus remain 44px or taller, wrap labels and retain visible inset focus', () => {
  const controls = declarations('.photo-organizer-menu summary),');
  assert.equal(controls['min-height'], '44px'); assert.equal(controls.height, 'auto'); assert.equal(controls['white-space'], 'normal');
  const focus = declarations('summary:focus-visible'); assert.match(focus.outline, /^2px solid/); assert.equal(focus['outline-offset'], '-3px');
  assert.equal(declarations('.photo-organizer-status')['overflow-wrap'], 'anywhere');
  assert.equal(declarations('.photo-organizer-header > div > span').display, 'block');
});
function fixture(count, disabled = false, content = {}) {
  let images = Array.from({ length: count }, (_, i) => '/fixture-' + i + (i === count - 1 ? '-long-file-name'.repeat(12) : '') + '.jpg'), mainImage = images[0], targetIndex = 2;
  const moves = [], removed = [], focused = [], module = { exports: {} };
  const jsx = (type, props, key) => ({ type, props, key });
  const source = fs.readFileSync(path.join(web, 'components/PhotoOrganizer.tsx'), 'utf8');
  const componentRequire = withUiTextTestContext(createRequire(import.meta.url), content);
  const doc = { elementFromPoint: () => ({ closest: () => ({ dataset: { photoIndex: String(targetIndex) } }) }) };
  const modules = name => name === 'react' ? { useRef: v => ({ current: v }), useState: v => [v, () => {}] }
    : name === 'react/jsx-runtime' ? { jsx, jsxs: jsx }
    : name === 'lucide-react' ? new Proxy({}, { get: (_, key) => key }) : componentRequire(name);
  new Function('require', 'module', 'exports', 'document', 'requestAnimationFrame', ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText)(modules, module, module.exports, doc, fn => fn());
  const statusByImage = { [images[0]]: { state: 'uploading', progress: 63 }, [images.at(-1)]: { state: 'error', message: 'The selected photo could not be confirmed. This long error and your selected image must remain available for explicit recovery.' } };
  const f = { moves, removed, focused, statusByImage,
    render: () => module.exports.PhotoOrganizer({ images, mainImage, disabled, statusByImage, onSelectMain: src => { mainImage = src; }, onRemove: src => { removed.push(src); }, onMove: (from, to) => { moves.push([from, to]); images.splice(to, 0, images.splice(from, 1)[0]); } }),
    event: { currentTarget: { closest: () => ({ querySelector: () => ({ isConnected: true, focus: () => focused.push(true) }) }) } }
  }; return f;
}
const nodes = v => Array.isArray(v) ? v.flatMap(nodes) : v && typeof v === 'object' ? [v, ...nodes(v.props?.children)] : [];
const words = v => Array.isArray(v) ? v.map(words).join('') : typeof v === 'string' || typeof v === 'number' ? String(v) : v?.props ? words(v.props.children) : '';
for (const count of [5, 20]) test(`Actual organizer renders all ${count} photos, main label, per-image status and reorder alternatives`, () => {
  const f = fixture(count), tree = f.render(), all = nodes(tree), articles = all.filter(n => n.type === 'article');
  assert.equal(articles.length, count); assert.equal(all.filter(n => n.type === 'img').length, count);
  assert.equal(all.filter(n => n.props?.className === 'photo-organizer-main').length, 1);
  assert.match(words(tree), /Uploading 63%/); assert.match(words(tree), /long error/);
  assert.equal(all.find(n => n.props?.role === 'alert').props.className, 'photo-organizer-status is-error');
  const first = nodes(articles[0]), last = nodes(articles.at(-1));
  assert.equal(first.find(n => n.type === 'button' && words(n).includes('Move earlier')).props.disabled, true);
  assert.equal(last.find(n => n.type === 'button' && words(n).includes('Move later')).props.disabled, true);
  const second = nodes(articles[1]), select = second.find(n => n.props?.['aria-label'] === 'Set photo 2 as main');
  select.props.onClick(f.event); assert.equal(f.focused.length, 1); assert.equal(nodes(f.render()).filter(n => n.props?.className === 'photo-organizer-main').length, 1);
  second.find(n => n.type === 'button' && words(n).includes('Move earlier')).props.onClick(f.event); assert.deepEqual(f.moves, [[1, 0]]);
  second.find(n => n.props?.['aria-label'] === 'Remove photo 2').props.onClick(); assert.deepEqual(f.removed, ['/fixture-1.jpg']);
  // Two columns mean 3/10 compact rows rather than 5/20 full-width rows.
  assert.equal(Math.ceil(count / 2), count === 5 ? 3 : 10);
});
test('Disabled organizer keeps every action disabled and touch reorder alternative remains wired', () => {
  const all = nodes(fixture(5, true).render()); assert.ok(all.filter(n => n.type === 'button').every(n => n.props.disabled));
  const f = fixture(5), handle = nodes(f.render()).find(n => n.props?.['aria-label'] === 'Drag photo 2 to reorder');
  handle.props.onPointerDown({ pointerType: 'touch', pointerId: 7, currentTarget: { setPointerCapture() {} } });
  handle.props.onPointerMove({ pointerType: 'touch', clientX: 100, clientY: 100, preventDefault() {} }); assert.deepEqual(f.moves, [[1, 2]]);
});
test('Long source filename and saved More wording remain intact, with natural inline menu/error content', () => {
  const wording = 'More photo actions with a deliberately longer saved label';
  const f = fixture(5, false, { 'ui.components.PhotoOrganizer.d47d7cb0e4f8': wording }), all = nodes(f.render());
  assert.equal(all.filter(n => n.type === 'summary' && words(n) === wording).length, 5);
  assert.match(all.filter(n => n.type === 'img').at(-1).props.src, /long-file-name.*long-file-name/);
  assert.match(words(all.find(n => n.props?.role === 'alert')), /explicit recovery/);
  assert.equal(all.filter(n => n.type === 'details').length, 5);
  assert.match(globalCss, /\.photo-organizer-menu > div\s*\{\s*position:\s*relative;/);
  phone.walkRules(rule => {
    if (rule.selector.includes('.photo-organizer-status') || rule.selector.includes(':global(.photo-organizer-tile)')) {
      rule.walkDecls(decl => assert.ok(!['height', 'max-height'].includes(decl.prop), 'Only the thumbnail may have a bounded height'));
    }
  });
});
