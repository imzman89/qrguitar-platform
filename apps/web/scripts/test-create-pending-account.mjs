import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
const require = createRequire(import.meta.url), ts = require('typescript'), React = require('react');
const source = fs.readFileSync(process.argv[2] || new URL('../app/create/page.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('create.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const functions = new Map();
function walk(n) { if (ts.isFunctionDeclaration(n) && n.name) functions.set(n.name.text, n.getText(ast)); ts.forEachChild(n, walk); } walk(ast);
function compile(name, env) {
  const js = ts.transpileModule(functions.get(name).replace(/^export default /, ''), { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  return new Function(...Object.keys(env), js + ';return ' + name)(...Object.values(env));
}
const textSource = fs.readFileSync(new URL('../lib/ui-text.ts', import.meta.url), 'utf8');
const textModule = { exports: {} };
new Function('module', 'exports', ts.transpileModule(textSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(textModule, textModule.exports);
function all(tree) { if (!tree || typeof tree !== 'object') return []; return [tree, ...React.Children.toArray(tree.props?.children).flatMap(all)]; }
function text(tree) { if (tree == null || typeof tree === 'boolean') return ''; return typeof tree === 'object' ? React.Children.toArray(tree.props?.children).map(text).join(' ') : String(tree); }
function draft(props, content = {}) {
  const env = { React, useUiText: scope => textModule.exports.createUiText(content, scope), useSiteContent: () => ({}), useRouter: () => ({}), useRef: value => ({ current: value }), useState: value => [typeof value === 'function' ? value() : value, () => {}], useMemo: fn => fn(), useEffect: () => {}, makeClientKey: () => 'synthetic-key', makePreviewQrCode: () => 'QRG-SYNTHETIC', defaultSiteSettings: { instrumentCategories: ['Acoustic Guitar'] }, styles: {}, authStyles: {}, getContentValue: (_content,key) => key, establishedInstrumentBrands: ['Fender'] };
  for (const name of ['Nav','Footer','OwnerWorkspace','Link','InstrumentPreview','PhotoOrganizer','Field','CategoryField','TextAreaField']) env[name] = name === 'Link' ? 'a' : name.toLowerCase();
  return compile('CreateOwnerDraft', env)({ isCurrent: () => true, ...props });
}
function parent() {
  const states = [], timers = new Map(), listeners = new Set(); let cursor = 0, effect, resolve;
  const read = new Promise(r => { resolve = r; });
  const auth = { getSession: () => read, onAuthStateChange: fn => { listeners.add(fn); return { data: { subscription: { unsubscribe: () => listeners.delete(fn) } } }; } };
  const env = { React, CreateOwnerDraft: 'actual-owner-draft', useRef: value => states[cursor++] ||= { current: value }, useState: value => { const i = cursor++; if (!(i in states)) states[i] = value; return [states[i], next => { states[i] = next; }]; }, useEffect: fn => { effect ||= fn; }, setTimeout: (fn,ms) => { assert.equal(ms,5000); timers.set(1,fn); return 1; }, clearTimeout: id => timers.delete(id), createBrowserSupabaseClient: () => ({ auth }) };
  const Component = compile('CreatePage', env);
  const props = () => { cursor = 0; return Component().props; };
  props(); const cleanup = effect();
  return { props, resolve, timeout: () => { for (const fn of timers.values()) fn(); }, event: session => { for (const fn of listeners) fn(session ? 'SIGNED_IN' : 'SIGNED_OUT',session); }, cleanup };
}
test('actual parent plus actual Create renderer shows status and no guest CTA while account read is pending', () => {
  const f = parent(); const tree = draft(f.props()); const nodes = all(tree);
  assert.equal(nodes.filter(n => n.type === 'a' && String(n.props.href).startsWith('/login')).length,0);
  assert.equal(nodes.filter(n => n.type === 'form').length,0);
  const status = nodes.find(n => n.props?.role === 'status'); assert.ok(status); assert.equal(status.props['aria-busy'],'true'); assert.equal(status.props['aria-live'],'polite'); assert.match(text(status),/Checking sign-in/);
  f.cleanup();
});
test('pending status uses the existing registered shared checking-sign-in override with matching scope', () => {
  const tree = draft({ user:null,authChecked:false }, { 'ui.components.Nav.checkingSignIn':'Published checking-account override' });
  assert.match(text(tree),/Published checking-account override/);
});
test('true signed-out parent retains Sign in/Create account and safe return route', async () => {
  const f = parent(); f.resolve({ data:{ session:null },error:null }); await new Promise(r => setImmediate(r));
  const nodes = all(draft(f.props())), actions = nodes.filter(n=>n.type==='a');
  assert.ok(actions.some(n=>text(n)==='Sign in'&&n.props.href==='/login?next=%2Fcreate'));
  assert.ok(actions.some(n=>text(n)==='Create account'&&n.props.href==='/login?mode=register&next=%2Fcreate'));
  assert.equal(nodes.some(n=>n.props?.role==='status'),false); f.cleanup();
});
test('five-second guarded fallback exits pending view to the existing true-guest actions', () => {
  const f = parent(); f.timeout(); const nodes=all(draft(f.props())); assert.ok(nodes.some(n=>n.type==='a'&&text(n)==='Sign in')); assert.equal(nodes.some(n=>n.props?.role==='status'),false); f.cleanup();
});
test('actual owner event renders the unchanged guarded native submit form instead of guest actions', () => {
  const f=parent(); f.event({user:{id:'synthetic-owner',email:'owner@example.invalid'}});
  const nodes=all(draft(f.props())); const form=nodes.find(n=>n.type==='form'); assert.ok(form); assert.equal(form.props.noValidate,true); assert.equal(typeof form.props.onSubmit,'function');
  assert.equal(nodes.some(n=>n.type==='a'&&String(n.props.href).startsWith('/login')),false); f.timeout(); assert.equal(f.props().user.id,'synthetic-owner'); f.cleanup();
});

test('Account owns collection naming: Create has no owner editor or requirement', () => {
  const nodes = all(draft({
    user: { id: 'synthetic-owner' },
    authChecked: true
  }));
  assert.equal(nodes.some(n => n.props?.id === 'owner'), false);
  assert.ok(nodes.some(n =>
    n.type === 'a' && n.props.href === '/account?section=collection'
  ));
});
