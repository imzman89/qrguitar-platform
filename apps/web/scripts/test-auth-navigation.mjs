import { withUiTextTestContext } from "./ui-text-test-context.mjs";
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
const require = withUiTextTestContext(createRequire(import.meta.url)), ts = require('typescript'), React = require('react');
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
const session = id => id ? { user: { id } } : null;
const result = id => ({ data: { session: session(id) }, error: null });
function compile(relative, imports, globals = {}, sourceOverride) {
  const source = sourceOverride ?? fs.readFileSync(new URL('../' + relative, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', ...Object.keys(globals), code)(name => Object.hasOwn(imports, name) ? imports[name] : require(name), module, module.exports, ...Object.values(globals));
  return module.exports;
}
const observer = compile('lib/session-identity.ts', {});
function find(tree, predicate) {
  if (!tree || typeof tree !== 'object') return;
  if (predicate(tree)) return tree;
  for (const child of React.Children.toArray(tree.props?.children)) { const found = find(child, predicate); if (found) return found; }
}
function text(tree) {
  if (tree == null || typeof tree === 'boolean') return '';
  if (typeof tree !== 'object') return String(tree);
  return React.Children.toArray(tree.props?.children).map(text).join(' ');
}
export function navigationFixture(component, options = {}) {
  const f = { signouts: 0, clears: 0, writes: 0, disposed: false };
  const states = [], effects = [], listeners = new Set();
  let cursor = 0, effectCursor = 0, dirty = true, tree;
  const hooks = {
    useState(initial) { const index = cursor++; if (!(index in states)) states[index] = initial; return [states[index], next => { f.writes++; const value = typeof next === 'function' ? next(states[index]) : next; if (!Object.is(value, states[index])) { states[index] = value; dirty = true; } }]; },
    useRef(initial) { const index = cursor++; return states[index] ||= { current: initial }; },
    useCallback(callback, dependencies) { const index = cursor++, previous = states[index]; if (!previous || dependencies.some((value, i) => !Object.is(previous.dependencies[i], value))) states[index] = { callback, dependencies }; return states[index].callback; },
    useEffect(run, dependencies) { const index = effectCursor++, previous = effects[index]; if (!previous || dependencies.some((value, i) => !Object.is(previous.dependencies[i], value))) effects[index] = { run, dependencies, cleanup: previous?.cleanup, pending: true }; },
  };
  const auth = {
    getSession: () => options.read ? options.read() : Promise.resolve(result(options.actor || 'owner-a')),
    onAuthStateChange(listener) { listeners.add(listener); if (Object.hasOwn(options, 'immediateActor')) listener('INITIAL_SESSION', session(options.immediateActor)); return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } }; },
    async signOut() { f.signouts++; return options.signOut ? options.signOut() : { error: null }; },
  };
  const browser = { createBrowserSupabaseClient: () => ({ auth }), clearQrGuitarSessionState: () => { f.clears++; } };
  const hook = compile('lib/use-auth-navigation.ts', { react: hooks, './supabase-browser': browser, './session-identity': observer });
  const settings = { content: {}, composition: { footer: { sections: [{ id: 'links', blocks: [] }] } } };
  const imports = {
    react: hooks, 'next/link': { default: 'a', __esModule: true }, 'next/navigation': { usePathname: () => '/' },
    './CheckoutAwareLink': { default: 'a', __esModule: true },
    'lucide-react': { LogOut: () => null, Menu: () => null, UserRound: () => null, X: () => null },
    './BrandLogo': { BrandLogo: () => null }, './Nav.module.css': { default: {}, __esModule: true }, './Footer.module.css': { default: {}, __esModule: true },
    '../lib/supabase-browser': browser, '../lib/use-auth-navigation': hook,
    '../lib/site-settings': { defaultSiteSettings: settings, fetchPublishedSiteSettings: options.published || (async () => settings) },
    '../lib/content-registry': { getContentValue: (content, key) => content[key] || key },
  };
  const globals = { document: { addEventListener() {}, removeEventListener() {} } };
  const Component = compile('components/' + component + '.tsx', imports, globals, options.source)[component];
  f.render = () => {
    assert.equal(f.disposed, false); dirty = true; let remaining = 30;
    while (dirty) {
      assert.ok(remaining--, 'render loop'); dirty = false; cursor = effectCursor = 0; tree = Component();
      for (const effect of effects) if (effect.pending) { effect.pending = false; effect.cleanup?.(); effect.cleanup = effect.run(); }
    }
    return tree;
  };
  f.flush = async () => { await tick(); return f.render(); };
  f.emit = id => { for (const listener of [...listeners]) listener(id ? 'SIGNED_IN' : 'SIGNED_OUT', session(id)); f.render(); };
  f.signedIn = () => Boolean(find(f.render(), node => node.props?.['aria-label'] === 'Account menu' || (node.type === 'button' && /Logout|Signing out/.test(text(node)))));
  f.openAccount = () => { const button = find(f.render(), node => node.props?.['aria-label'] === 'Account menu'); if (button) { button.props.onClick(); f.render(); } };
  f.logout = () => {
    const button = find(f.render(), node => node.type === 'button' && /^(Logout|Sign out|Signing out\.\.\.)$/.test(text(node).trim()));
    assert.ok(button, 'sign-out button exists'); button.props.onClick(); return button;
  };
  f.alert = () => text(find(f.render(), node => node.props?.role === 'alert'));
  f.text = () => text(f.render());
  f.pending = () => Boolean(find(f.render(), node => node.type === 'button' && text(node).includes('Signing out') && node.props.disabled));
  f.dispose = () => { effects.forEach(effect => effect.cleanup?.()); f.disposed = true; };
  f.listenerCount = () => listeners.size;
  f.render(); return f;
}

for (const component of ['Nav', 'Footer']) {
  test(component + ': published navigation/footer content still loads on mount', async () => {
    const published = { content: { 'global.navigation.dashboard': 'Published collection link', 'global.footer.description': 'Published collection description' }, composition: { footer: { sections: [] } } };
    const f = navigationFixture(component, { published: async () => published });
    await f.flush(); assert.match(f.text(), /Published collection/); f.dispose();
  });
  test(component + ': late initial session cannot restore signed-in controls after sign-out', async () => {
    const gate = deferred(), f = navigationFixture(component, { read: () => gate.promise });
    f.emit(''); gate.resolve(result('owner-a')); await f.flush(); assert.equal(f.signedIn(), false); f.dispose();
  });
  test(component + ': late initial null cannot remove a newer signed-in account', async () => {
    const gate = deferred(), f = navigationFixture(component, { read: () => gate.promise });
    f.emit('owner-b'); gate.resolve(result('')); await f.flush(); assert.equal(f.signedIn(), true); f.dispose();
  });
  test(component + ': a synchronous initial Auth event outranks stale session lookup', async () => {
    const f = navigationFixture(component, { immediateActor: '', read: async () => result('owner-a') });
    await f.flush(); assert.equal(f.signedIn(), false); f.dispose();
  });
  test(component + ': rejected current initial lookup stays signed out without an unhandled rejection', async () => {
    const f = navigationFixture(component, { read: async () => { throw Error('Private transport detail'); } });
    await f.flush(); assert.equal(f.signedIn(), false); assert.equal(f.alert(), ''); f.dispose();
  });
  test(component + ': late initial error cannot erase a new account', async () => {
    const gate = deferred(), f = navigationFixture(component, { read: () => gate.promise });
    f.emit('owner-b'); gate.reject(Error('Old lookup failure')); await f.flush(); assert.equal(f.signedIn(), true); f.dispose();
  });
  test(component + ': current Auth error ignores a session returned alongside the error', async () => {
    const f = navigationFixture(component, { read: async () => ({ ...result('owner-a'), error: Error('Invalid session') }) });
    await f.flush(); assert.equal(f.signedIn(), false); f.dispose();
  });
  test(component + ': unmount cancels observation and all late state updates', async () => {
    const gate = deferred(), f = navigationFixture(component, { read: () => gate.promise });
    await f.flush(); f.dispose(); const writes = f.writes; gate.resolve(result('owner-a')); await tick();
    assert.equal(f.writes, writes); assert.equal(f.listenerCount(), 0);
  });
  for (const rejected of [false, true]) test(component + ': failed logout is visible and keeps session state (' + (rejected ? 'throw' : 'returned error') + ')', async () => {
    const f = navigationFixture(component, { signOut: async () => { if (rejected) throw Error('PRIVATE'); return { error: Error('PRIVATE') }; } });
    await f.flush(); f.openAccount(); f.logout(); await f.flush();
    assert.equal(f.signedIn(), true); assert.equal(f.clears, 0); assert.equal(f.alert(), 'Could not sign out. Please try again.'); assert.equal(f.pending(), false); f.dispose();
  });
  test(component + ': repeat logout clicks start one request and show pending feedback', async () => {
    const gate = deferred(), f = navigationFixture(component, { signOut: () => gate.promise });
    await f.flush(); f.openAccount(); f.logout(); assert.equal(f.pending(), true); f.logout(); assert.equal(f.signouts, 1);
    gate.resolve({ error: null }); await f.flush(); assert.equal(f.signedIn(), false); assert.equal(f.clears, 1); f.dispose();
  });
  test(component + ': observed sign-out plus successful response clears local session metadata', async () => {
    const gate = deferred(), f = navigationFixture(component, { signOut: () => gate.promise });
    await f.flush(); f.openAccount(); f.logout(); f.emit(''); gate.resolve({ error: null }); await f.flush();
    assert.equal(f.signedIn(), false); assert.equal(f.clears, 1); f.dispose();
  });
  for (const rejected of [false, true]) test(component + ': SDK local sign-out followed by remote failure remains visibly partial (' + rejected + ')', async () => {
    const gate = deferred(), f = navigationFixture(component, { signOut: () => gate.promise });
    await f.flush(); f.openAccount(); f.logout(); f.emit('');
    if (rejected) gate.reject(Error('PRIVATE_REMOTE_FAILURE')); else gate.resolve({ error: Error('PRIVATE_REMOTE_FAILURE') });
    await f.flush(); assert.equal(f.signedIn(), false); assert.equal(f.clears, 1);
    assert.equal(f.alert(), 'You are signed out on this device. Sign-out on other devices could not be confirmed.');
    f.emit('owner-b'); assert.equal(f.alert(), ''); f.dispose();
  });
  for (const error of [null, Error('Old actor failure')]) test(component + ': an old logout cannot clear or report errors on the next account (' + Boolean(error) + ')', async () => {
    const gate = deferred(), f = navigationFixture(component, { signOut: () => gate.promise });
    await f.flush(); f.openAccount(); f.logout(); f.emit('owner-b'); gate.resolve({ error }); await f.flush();
    assert.equal(f.signedIn(), true); assert.equal(f.clears, 0); assert.equal(f.alert(), ''); f.dispose();
  });
  test(component + ': same-user reauthentication cannot be cleared by the old logout completion', async () => {
    const gate = deferred(), f = navigationFixture(component, { signOut: () => gate.promise });
    await f.flush(); f.openAccount(); f.logout(); f.emit(''); f.emit('owner-a'); gate.resolve({ error: null }); await f.flush();
    assert.equal(f.signedIn(), true); assert.equal(f.clears, 0); f.dispose();
  });
  test(component + ': unmount during logout suppresses late local clearing and feedback', async () => {
    const gate = deferred(), f = navigationFixture(component, { signOut: () => gate.promise });
    await f.flush(); f.openAccount(); f.logout(); f.dispose(); const writes = f.writes; gate.resolve({ error: null }); await tick();
    assert.equal(f.clears, 0); assert.equal(f.writes, writes);
  });
}
