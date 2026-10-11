import { withUiTextTestContext } from "./ui-text-test-context.mjs";
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const args = process.argv.slice(2), option = name => args[args.indexOf(name) + 1];
const repo = path.resolve(args.includes('--repo') ? option('--repo') : path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..'));
const source = path.resolve(args.includes('--source') ? option('--source') : repo);
const require = withUiTextTestContext(createRequire(path.join(repo, 'apps/web/package.json')));
const ts = require('typescript'), React = require('react');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const session = id => id ? { user: { id }, access_token: 'synthetic-token-' + id } : null;
const sessionResult = id => ({ data: { session: session(id) }, error: null });

function compile(relative, imports, globals, fallbackRequire = require) {
  const input = fs.readFileSync(path.join(source, 'apps/web', relative), 'utf8');
  const code = ts.transpileModule(input, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', ...Object.keys(globals), code)(name => Object.hasOwn(imports, name) ? imports[name] : name.endsWith('.module.css') ? { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) } : fallbackRequire(name), module, module.exports, ...Object.values(globals));
  return module.exports;
}
const checkoutNavigation = compile('lib/checkout-navigation.ts', { './security-headers': compile('lib/security-headers.ts', {}, {}) }, {});
const authRedirect = compile('lib/auth-redirect.ts', {}, {});
const uiText = compile('lib/ui-text.ts', {}, {});
const workspaceTools = compile('lib/workspace-tools.ts', { './ui-text': uiText }, {});
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
function fixture(page, options = {}) {
  const f = { actor: options.actor ?? (page === 'reset-password' ? 'a' : ''), clears: 0, writes: 0, navigations: [], documentNavigations: [], history: [], calls: [], tracking: [], focusRequests: [], reads: 0, disposed: false };
  const states = [], effects = [], listeners = new Set(), timers = new Map();
  let cursor = 0, effectCursor = 0, dirty = true, tree, now = 0, timerId = 0;
  const setTimer = (callback, delay) => { const id = ++timerId; timers.set(id, { at: now + delay, callback }); return id; };
  const clearTimer = id => timers.delete(id);
  const hooks = {
    useState(initial) { const index = cursor++; if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial; return [states[index], next => { f.writes++; const value = typeof next === 'function' ? next(states[index]) : next; if (!Object.is(value, states[index])) { states[index] = value; dirty = true; } }]; },
    useRef(initial) { const index = cursor++; return states[index] ||= { current: initial }; },
    useMemo(run, dependencies) { const index = cursor++, old = states[index]; if (!old || dependencies.some((value, i) => !Object.is(old.dependencies[i], value))) states[index] = { value: run(), dependencies }; return states[index].value; },
    useCallback(callback, dependencies) { return hooks.useMemo(() => callback, dependencies); },
    useEffect(run, dependencies) { const index = effectCursor++, old = effects[index]; if (!old || dependencies.some((value, i) => !Object.is(old.dependencies[i], value))) effects[index] = { run, dependencies, cleanup: old?.cleanup, pending: true }; },
  };
  const auth = {
    getSession() { f.reads++; return options.read ? options.read(f) : Promise.resolve(sessionResult(f.actor)); },
    onAuthStateChange(listener) {
      if (options.subscribeError) throw Error('PRIVATE_SUBSCRIPTION');
      listeners.add(listener);
      if (Object.hasOwn(options, 'immediateActor')) listener('INITIAL_SESSION', session(options.immediateActor));
      return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } };
    },
  };
  for (const name of ['signInWithPassword', 'signUp', 'resetPasswordForEmail', 'signOut', 'updateUser']) {
    auth[name] = async (...values) => {
      f.calls.push({ name, values });
      if (options[name]) return options[name](f, ...values);
      if (name === 'signOut') { f.event(''); return { error: null }; }
      if (name === 'signInWithPassword') { f.event('a'); return { data: { session: session('a'), user: { id: 'a' } }, error: null }; }
      if (name === 'signUp') return { data: { session: null, user: { id: 'a', identities: [{ id: 'email-a' }] } }, error: null };
      return { data: { user: { id: f.actor } }, error: null };
    };
  }
  const router = { replace: href => f.navigations.push(href) };
  const location = new URL('https://www.qrguitar.com/' + page + (options.search || '?next=%2Fdashboard'));
  location.replace = href => f.documentNavigations.push(href);
  f.titleWrites = [];
  let documentTitle = '';
  f.document = { get title() { return documentTitle; }, set title(value) { documentTitle = value; f.titleWrites.push(value); } };
  const globals = {
    document: f.document,
    window: { location, history: { replaceState(_state, _title, href) { f.history.push(href); } }, setTimeout: setTimer, clearTimeout: clearTimer, dispatchEvent() {} },
    setTimeout: setTimer, clearTimeout: clearTimer, CustomEvent: class { constructor(type) { this.type = type; } },
  };
  const imports = {
    react: hooks, 'next/link': { default: 'a', __esModule: true }, 'next/navigation': { useRouter: () => router },
    '../../components/CheckoutAwareLink': { default: 'a', __esModule: true },
    '../../components/Nav': { Nav: () => null }, '../../components/Footer': { Footer: () => null },
    '../../lib/supabase-browser': {
      createBrowserSupabaseClient: () => { if (options.constructError) throw Error('PRIVATE_CONFIG'); return { auth }; },
      clearQrGuitarSessionState: () => f.clears++, readSessionStorage: () => null, removeSessionStorage() {}, sessionExpiredMessageKey: 'expiry',
    },
    '../../lib/content-registry': { getContentValue: (_content, key) => key }, '../../lib/use-site-content': { useSiteContent: () => options.content || {} },
    '../../lib/auth-redirect': authRedirect,
    '../../lib/workspace-tools': workspaceTools,
    '../../lib/checkout-navigation': checkoutNavigation,
    '../../lib/optional-tracking-consent': {
      optionalTrackingProductEvents: { registrationCompleted: 'account_registration_completed' },
      dispatchOptionalTrackingProductEvent: async event => { f.tracking.push(event); return true; },
    },
  };
  const Component = compile(page === 'login' ? 'app/login/LoginClient.tsx' : 'app/' + page + '/page.tsx', imports, globals, withUiTextTestContext(require, options.content || {})).default;
  // Commit only the registration callback refs. Record requested focus, not native keyboard focus.
  function commitRegistrationRefs(node, hidden = false, disabled = false) {
    if (!node || typeof node !== 'object') return;
    const props = node.props || {}, hiddenHere = hidden || Boolean(props.hidden);
    const disabledHere = disabled || (node.type === 'fieldset' && Boolean(props.disabled));
    if (node.type === 'input' && (props.id === 'name' || props.name === 'workspace-role') && typeof props.ref === 'function') {
      const target = props.id === 'name' ? 'name' : props.value;
      props.ref({ focus() {
        assert.equal(hiddenHere, false, target + ' requested focus while hidden');
        assert.equal(disabledHere || Boolean(props.disabled), false, target + ' requested focus while disabled');
        f.focusRequests.push(target);
      } });
    }
    for (const child of React.Children.toArray(props.children)) commitRegistrationRefs(child, hiddenHere, disabledHere);
  }
  f.render = () => {
    assert.equal(f.disposed, false); dirty = true; let remaining = 30;
    while (dirty) {
      assert.ok(remaining--, 'render loop'); dirty = false; cursor = effectCursor = 0; tree = Component(page === 'login' ? { initialMode: options.initialMode ?? (location.searchParams.get('mode') === 'register' || location.searchParams.get('mode') === 'reset' ? location.searchParams.get('mode') : 'login') } : undefined);
      for (const effect of effects) if (effect.pending) { effect.pending = false; effect.cleanup?.(); effect.cleanup = effect.run(); }
    }
    commitRegistrationRefs(tree);
    return tree;
  };
  f.flush = async () => { await tick(); return f.render(); };
  f.event = (id, event = id ? 'SIGNED_IN' : 'SIGNED_OUT') => { f.actor = id; for (const listener of [...listeners]) listener(event, session(id)); };
  f.emit = (id, event) => { f.event(id, event); return f.render(); };
  f.node = predicate => find(f.render(), predicate);
  f.button = label => f.node(node => node.type === 'button' && text(node).trim() === label);
  f.input = (id, value) => { const node = f.node(node => node.type === 'input' && node.props.id === id); assert.ok(node, id + ' input'); node.props.onChange({ target: { value } }); f.render(); };
  f.selectRole = value => {
    const group = f.node(node => node.props?.id === 'registration-role-choices');
    assert.ok(group, 'registration role group'); assert.equal(group.props.hidden, false); assert.equal(group.props.disabled, false);
    const node = f.node(node => node.type === 'input' && node.props.name === 'workspace-role' && node.props.value === value);
    assert.ok(node, value + ' role choice'); node.props.onChange(); f.render();
  };
  f.stageButton = target => f.node(node => node.type === 'button' && node.props['aria-controls'] === target);
  f.continueRegistration = () => {
    const button = f.stageButton('registration-details'); assert.ok(button, 'explicit registration Continue');
    assert.equal(button.props.type, 'button'); assert.equal(button.props.disabled, false); button.props.onClick(); f.render();
  };
  f.changeRegistration = () => {
    const button = f.stageButton('registration-role-choices'); assert.ok(button, 'explicit Change workspace');
    assert.equal(button.props.type, 'button'); assert.equal(button.props.disabled, false); button.props.onClick(); f.render();
  };
  f.fill = () => { if (page === 'login') f.input('email', 'owner@example.test'); f.input('password', 'new-password-123'); if (page === 'reset-password') f.input('confirmPassword', 'new-password-123'); };
  f.submit = () => {
    const form = f.node(node => node.type === 'form'); assert.ok(form); form.props.onSubmit({ preventDefault() {} });
    f.render();
  };
  f.click = label => { const button = f.button(label); assert.ok(button, label + ' button'); const result = button.props.onClick(); f.render(); return result; };
  f.text = () => text(f.render());
  f.busy = () => Boolean(f.node(node => (node.type === 'form' && node.props['aria-busy']) || (node.type === 'button' && node.props.disabled && /Save new password|Saving\.\.\.|Sign out/.test(text(node)))));
  f.count = name => f.calls.filter(call => call.name === name).length;
  f.advance = async milliseconds => {
    now += milliseconds;
    for (const [id, timer] of [...timers].sort((a, b) => a[1].at - b[1].at)) if (timer.at <= now && timers.delete(id)) timer.callback();
    return f.flush();
  };
  f.dispose = () => { effects.forEach(effect => effect.cleanup?.()); f.disposed = true; };
  f.replayEffects = () => { effects.forEach(effect => { effect.cleanup?.(); effect.cleanup = effect.run(); }); f.render(); };
  f.listenerCount = () => listeners.size;
  f.render(); return f;
}


test('login: trusted server mode reaches the first client render without a sign-in flash', async () => {
  const Client = () => null;
  for (const [header, mode, title] of [['register', 'register', 'Create your QRguitar account'], ['reset', 'reset', 'Reset your QRguitar password'], ['login', 'login', 'Sign in to QRguitar'], [null, 'login', 'Sign in to QRguitar'], ['REGISTER', 'login', 'Sign in to QRguitar']]) {
    const Page = compile('app/login/page.tsx', { 'next/headers': { headers: async () => ({ get: name => { assert.equal(name, 'x-qrguitar-auth-mode'); return header; } }) }, './LoginClient': { default: Client, __esModule: true } }, {}).default;
    const element = await Page(); assert.equal(element.type, Client); assert.equal(element.props.initialMode, mode);
    const f = fixture('login', { initialMode: element.props.initialMode, search: '?mode=' + mode + '&next=%2Fcreate' });
    assert.equal(f.titleWrites[0], title); assert.equal(f.titleWrites.every(value => value === title), true); f.dispose();
  }
});
for (const [mode, title] of [['register', 'Create your QRguitar account'], ['reset', 'Reset your QRguitar password']]) {
  test('login: first announcement title matches direct ' + mode + ' navigation', () => {
    const f = fixture('login', { search: '?mode=' + mode + '&next=%2Fcreate' });
    assert.equal(f.titleWrites[0], title);
    assert.equal(f.titleWrites.every(value => value === title), true); f.dispose();
  });
}
test('login: tab keyboard activation updates focus, one tab stop and labelled panel without losing the return path', async () => {
  const f = fixture('login', { search: '?next=%2Fownership-claim%3Fcode%3DQRG-TEST' }); await f.flush(); f.fill();
  const focused = [];
  for (const mode of ['login', 'register']) f.node(node => node.props?.id === 'auth-' + mode + '-tab').props.ref.current = { focus: () => focused.push(mode) };
  const check = mode => {
    assert.equal(f.document.title, mode === 'register' ? 'Create your QRguitar account' : 'Sign in to QRguitar');
    for (const candidate of ['login', 'register']) {
      const tab = f.node(node => node.props?.id === 'auth-' + candidate + '-tab');
      assert.equal(tab.props['aria-selected'], candidate === mode);
      assert.equal(tab.props.tabIndex, candidate === mode ? 0 : -1);
      assert.equal(tab.props['aria-controls'], 'auth-access-panel');
    }
    const panel = f.node(node => node.props?.id === 'auth-access-panel');
    assert.equal(panel.props.role, 'tabpanel'); assert.equal(panel.props['aria-labelledby'], 'auth-' + mode + '-tab');
    assert.equal(f.node(node => node.props?.id === 'email').props.value, 'owner@example.test');
  };
  check('login');
  for (const [from, key, target] of [['login', 'ArrowRight', 'register'], ['register', 'ArrowLeft', 'login'], ['login', 'ArrowLeft', 'register'], ['register', 'ArrowRight', 'login'], ['login', 'End', 'register'], ['register', 'Home', 'login']]) {
    let prevented = false;
    f.node(node => node.props?.id === 'auth-' + from + '-tab').props.onKeyDown({ key, preventDefault() { prevented = true; } }); f.render();
    assert.equal(prevented, true); assert.equal(focused.at(-1), target); check(target);
    const url = new URL(f.history.at(-1), 'https://www.qrguitar.com');
    assert.equal(url.searchParams.get('next'), '/ownership-claim?code=QRG-TEST'); assert.equal(url.searchParams.get('mode'), target);
  }
  f.input('password', 'still-entering-password');
  f.node(node => node.props?.id === 'auth-login-tab').props.onKeyDown({ key: 'Home', preventDefault() {} }); f.render();
  assert.equal(f.node(node => node.props?.id === 'password').props.value, 'still-entering-password');
  const historyCount = f.history.length, focusCount = focused.length;
  for (const key of ['Tab', 'ArrowDown']) f.node(node => node.props?.id === 'auth-login-tab').props.onKeyDown({ key, preventDefault() { assert.fail('Unrelated key must remain native'); } });
  f.node(node => node.props?.id === 'auth-login-tab').props.onKeyDown({ key: 'ArrowLeft', altKey: true, preventDefault() { assert.fail('Browser shortcut must remain native'); } });
  assert.equal(f.history.length, historyCount); assert.equal(focused.length, focusCount); assert.equal(f.calls.length, 0); f.dispose();
});

test('login: pending authentication ignores tab keyboard activation and preserves its credentials', async () => {
  const gate = deferred(), f = fixture('login', { signInWithPassword: () => gate.promise }); await f.flush(); f.fill(); f.submit(); await f.flush();
  const tab = f.node(node => node.props?.id === 'auth-login-tab');
  f.node(node => node.props?.id === 'auth-register-tab').props.ref.current = { focus() { assert.fail('Pending request must not move to another tab'); } };
  assert.equal(tab.props.disabled, true);
  assert.equal(f.document.title, 'Sign in to QRguitar');
  for (const key of ['ArrowRight', 'End']) tab.props.onKeyDown({ key, preventDefault() {} }); f.render();
  assert.equal(f.node(node => node.props?.id === 'auth-login-tab').props['aria-selected'], true);
  assert.equal(f.node(node => node.props?.id === 'password').props.value, 'new-password-123');
  assert.equal(f.history.length, 0); assert.equal(f.count('signInWithPassword'), 1);
  gate.resolve({ data: { session: null }, error: Error('Invalid login credentials') }); await f.flush(); f.dispose();
});

test('login: password reset has no orphan tab semantics and returns to the sign-in panel', async () => {
  const f = fixture('login', { search: '?mode=reset&next=%2Faccount' }); await f.flush(); f.input('email', 'owner@example.test');
  assert.equal(f.document.title, 'Reset your QRguitar password');
  assert.equal(f.node(node => node.props?.role === 'tablist'), undefined);
  assert.equal(f.node(node => node.props?.role === 'tabpanel'), undefined);
  f.click('Back to sign in');
  assert.equal(f.document.title, 'Sign in to QRguitar');
  assert.equal(f.node(node => node.props?.id === 'auth-login-tab').props.tabIndex, 0);
  assert.equal(f.node(node => node.props?.role === 'tabpanel').props['aria-labelledby'], 'auth-login-tab');
  assert.equal(f.node(node => node.props?.id === 'email').props.value, 'owner@example.test');
  const url = new URL(f.history.at(-1), 'https://www.qrguitar.com'); assert.equal(url.searchParams.get('next'), '/account'); assert.equal(f.calls.length, 0); f.dispose();
});

for (const page of ['login', 'reset-password']) {
  test(page + ': late initial signed-in read cannot overwrite a sign-out event', async () => {
    const gate = deferred(), f = fixture(page, { read: () => gate.promise });
    f.emit(''); gate.resolve(sessionResult('a')); await f.flush();
    assert.equal(f.node(node => node.type === 'input' && node.props.id === 'confirmPassword'), undefined);
    assert.equal(f.navigations.length, 0); assert.doesNotMatch(f.text(), /Welcome back\.|Enter a new password\./); f.dispose();
  });
  test(page + ': late initial null/error cannot overwrite a newer signed-in identity', async () => {
    for (const reject of [false, true]) {
      const gate = deferred(), f = fixture(page, { read: () => gate.promise });
      f.emit('b'); if (reject) gate.reject(Error('PRIVATE')); else gate.resolve(sessionResult('')); await f.flush();
      assert.match(f.text(), page === 'login' ? /Welcome back/ : /Enter a new password/); f.dispose();
    }
  });
  test(page + ': synchronous auth event outranks initial lookup', async () => {
    const f = fixture(page, { immediateActor: '', read: async () => sessionResult('a') }); await f.flush();
    assert.doesNotMatch(f.text(), /Welcome back\.|Enter a new password\./); assert.equal(f.navigations.length, 0); f.dispose();
  });
  test(page + ': initial read failure is visible and finite', async () => {
    for (const kind of ['returned', 'thrown', 'timeout']) {
      const f = fixture(page, { read: () => kind === 'thrown' ? Promise.reject(Error('PRIVATE')) : kind === 'returned' ? Promise.resolve({ ...sessionResult('a'), error: Error('PRIVATE') }) : new Promise(() => {}) });
      if (kind === 'timeout') await f.advance(10000); else await f.flush();
      assert.match(f.text(), /could not be checked/i); assert.doesNotMatch(f.text(), /PRIVATE|Validating your secure link/); f.dispose();
    }
  });
  test(page + ': construction failure renders feedback instead of crashing', async () => {
    const f = fixture(page, { constructError: true }); await f.flush(); assert.match(f.text(), /unavailable|could not be checked/i); f.dispose();
  });
  test(page + ': subscription failure cannot leave an unobserved writable Auth client', async () => {
    const f = fixture(page, { subscribeError: true }); await f.flush(); assert.match(f.text(), /unavailable|could not be checked/i);
    if (page === 'login') { f.fill(); f.submit(); await f.flush(); }
    assert.equal(f.calls.length, 0); f.dispose();
  });
  test(page + ': unmount ignores deferred initial reads and unsubscribes', async () => {
    const gate = deferred(), f = fixture(page, { read: () => gate.promise }); f.dispose(); const writes = f.writes;
    gate.resolve(sessionResult('a')); await tick(); assert.equal(f.writes, writes); assert.equal(f.navigations.length, 0); assert.equal(f.listenerCount(), 0);
  });
}

for (const returned of [true, false]) test('login: failed logout remains honest (' + returned + ')', async () => {
  const f = fixture('login', { actor: 'a', signOut: async () => { if (!returned) throw Error('PRIVATE'); return { error: Error('PRIVATE') }; } });
  await f.flush(); await f.click('Sign out'); await f.flush();
  assert.match(f.text(), /Could not sign out/); assert.match(f.text(), /Welcome back/); assert.equal(f.clears, 0); assert.equal(f.busy(), false); f.dispose();
});
for (const returned of [true, false]) test('login: local sign-out plus remote failure is partial (' + returned + ')', async () => {
  const f = fixture('login', { actor: 'a', signOut: async f => { f.event(''); if (!returned) throw Error('PRIVATE'); return { error: Error('PRIVATE') }; } });
  await f.flush(); await f.click('Sign out'); await f.flush();
  assert.match(f.text(), /signed out on this device.*other devices could not be confirmed/); assert.equal(f.clears, 1); assert.equal(f.busy(), false); f.dispose();
});
test('login: successful sign-out reports success once and duplicate clicks share one operation', async () => {
  const gate = deferred(), f = fixture('login', { actor: 'a', signOut: () => gate.promise }); await f.flush();
  const button = f.button('Sign out'); const first = button.props.onClick(); void button.props.onClick(); await f.flush(); assert.equal(f.count('signOut'), 1);
  f.emit(''); gate.resolve({ error: null }); await first; await f.flush(); assert.match(f.text(), /Signed out\./); assert.equal(f.clears, 1); assert.equal(f.busy(), false); f.dispose();
});
for (const transition of [['b'], ['', 'a'], ['b', 'a']]) test('login: old logout cannot affect later identity ' + transition.join('→'), async () => {
  const gate = deferred(), f = fixture('login', { actor: 'a', signOut: () => gate.promise }); await f.flush(); const before = f.navigations.length;
  const action = f.click('Sign out'); await f.flush(); transition.forEach(id => f.emit(id)); gate.resolve({ error: null }); await action; await f.flush();
  assert.equal(f.clears, 0); assert.equal(f.navigations.length, before); assert.doesNotMatch(f.text(), /Signed out\.|Could not sign out/); assert.match(f.text(), /Welcome back/); f.dispose();
});
test('login: fresh-session mismatch prevents signing out the other account', async () => {
  const f = fixture('login', { actor: 'a' }); await f.flush(); f.actor = 'b'; await f.click('Sign out'); await f.flush(); assert.equal(f.count('signOut'), 0); assert.equal(f.clears, 0); f.dispose();
});
test('login: pending sign-out deadline is truthful and never launches another request', async () => {
  const gate = deferred(), f = fixture('login', { actor: 'a', signOut: () => gate.promise }); await f.flush(); const action = f.click('Sign out'); await f.flush();
  await f.advance(20000); assert.match(f.text(), /still pending.*not confirmed/); assert.equal(f.busy(), true); void f.click('Sign out'); assert.equal(f.count('signOut'), 1);
  gate.resolve({ error: Error('late failure') }); await action; await f.flush(); assert.match(f.text(), /Could not sign out/); assert.equal(f.busy(), false); f.dispose();
});
test('login: successful sign-in preserves the supplied safe destination', async () => {
  const f = fixture('login', { search: '?next=%2Fownership-claim%3Fcode%3DQRG-TEST' }); await f.flush(); f.fill(); f.submit(); await f.flush();
  assert.deepEqual(f.navigations, ['/ownership-claim?code=QRG-TEST']); assert.equal(f.count('signInWithPassword'), 1); assert.equal(f.busy(), false); f.dispose();
});
test('login: first sign-in while the initial session read hangs still navigates after confirmation', async () => {
  const gate = deferred(), f = fixture('login', { search: '?next=%2Fcreate', read: f => f.reads === 1 ? gate.promise : Promise.resolve(sessionResult(f.actor)) });
  f.fill(); f.submit(); await f.flush(); assert.deepEqual(f.navigations, ['/create']); assert.equal(f.count('signInWithPassword'), 1); assert.equal(f.busy(), false);
  gate.resolve(sessionResult('old-account')); await f.flush(); assert.deepEqual(f.navigations, ['/create']); f.dispose();
});
test('login: sign-in followed by failed session verification shows an honest recoverable message', async () => {
  const f = fixture('login', { read: f => f.reads === 3 ? Promise.reject(Error('PRIVATE')) : Promise.resolve(sessionResult(f.actor)) });
  await f.flush(); f.fill(); f.submit(); await f.flush(); assert.match(f.text(), /Welcome back/); assert.match(f.text(), /request could not be confirmed/); assert.equal(f.navigations.length, 0); assert.equal(f.busy(), false); f.dispose();
});
test('login: registration without a session honestly asks for email confirmation', async () => {
  const f = fixture('login', { search: '?mode=register&next=%2Fcreate' }); await f.flush(); f.selectRole('player'); f.continueRegistration(); f.input('name', 'Synthetic owner'); f.fill(); f.submit(); await f.flush();
  assert.match(f.text(), /Check your email to confirm/); assert.equal(f.navigations.length, 0); assert.equal(f.calls[0].values[0].options.emailRedirectTo, 'https://www.qrguitar.com/create');
  assert.deepEqual(f.tracking, [{ name: 'account_registration_completed', properties: { confirmation: 'email_pending' } }]); f.dispose();
});
for (const state of ['initial read', 'initial auth event', 'completed sign-in']) test('login: ' + state + ' opens a new billing document with the exact return destination', async () => {
  const destination = '/billing/paypal/return?orderId=44444444-4444-4444-8444-444444444444#payment';
  const options = { search: '?next=' + encodeURIComponent(destination), ...(state === 'initial read' ? { actor: 'a' } : state === 'initial auth event' ? { immediateActor: 'a' } : {}) };
  const f = fixture('login', options); await f.flush();
  if (state === 'completed sign-in') { f.fill(); f.submit(); await f.flush(); assert.equal(f.count('signInWithPassword'), 1); }
  assert.deepEqual(f.documentNavigations, [destination]); assert.deepEqual(f.navigations, []); f.dispose();
});
test('login: an unsafe external billing return cannot become document navigation', async () => {
  const f = fixture('login', { search: '?next=' + encodeURIComponent('//untrusted.invalid/billing') }); await f.flush(); f.fill(); f.submit(); await f.flush();
  assert.deepEqual(f.navigations, ['/dashboard']); assert.deepEqual(f.documentNavigations, []); f.dispose();
});
test('login: registration with a confirmed session records the session-ready outcome', async () => {
  const f = fixture('login', { search: '?mode=register&next=%2Fcreate', signUp: async fixtureState => {
    fixtureState.event('a');
    return { data: { session: session('a'), user: { id: 'a', identities: [{ id: 'email-a' }] } }, error: null };
  } });
  await f.flush(); f.selectRole('player'); f.continueRegistration(); f.input('name', 'Synthetic owner'); f.fill(); f.submit(); await f.flush();
  assert.deepEqual(f.tracking, [{ name: 'account_registration_completed', properties: { confirmation: 'session_ready' } }]);
  assert.deepEqual(f.navigations, ['/create']); f.dispose();
});
test('login: existing-email obfuscation never records a new registration', async () => {
  const f = fixture('login', { search: '?mode=register&next=%2Fcreate', signUp: async () => ({ data: { session: null, user: { id: 'opaque-user', identities: [] } }, error: null }) });
  await f.flush(); f.selectRole('player'); f.continueRegistration(); f.input('name', 'Synthetic owner'); f.fill(); f.submit(); await f.flush();
  assert.match(f.text(), /Check your email to confirm/); assert.deepEqual(f.tracking, []); assert.equal(f.navigations.length, 0); f.dispose();
});
test('login: reset email uses the intended return path and does not navigate', async () => {
  const f = fixture('login', { search: '?mode=reset&next=%2Faccount' }); await f.flush(); f.input('email', 'owner@example.test'); f.submit(); await f.flush();
  assert.match(f.text(), /Password reset email sent/); assert.equal(f.calls[0].values[1].redirectTo, 'https://www.qrguitar.com/reset-password?next=%2Faccount'); assert.equal(f.navigations.length, 0); f.dispose();
});
test('login: a completed action supersedes an older initial session snapshot', async () => {
  const gate = deferred(), f = fixture('login', { search: '?mode=reset&next=%2Faccount', read: f => f.reads === 1 ? gate.promise : Promise.resolve(sessionResult('')) });
  f.input('email', 'owner@example.test'); f.submit(); await f.flush(); assert.match(f.text(), /Password reset email sent/);
  gate.resolve(sessionResult('old-account')); await f.flush(); assert.equal(f.navigations.length, 0); assert.doesNotMatch(f.text(), /Welcome back/); assert.match(f.text(), /Password reset email sent/); f.dispose();
});
test('login: a delayed sign-in result cannot navigate over another account', async () => {
  const gate = deferred(), f = fixture('login', { signInWithPassword: () => gate.promise }); await f.flush(); f.fill(); f.submit(); await f.flush(); f.emit('b');
  gate.resolve({ data: { session: session('a'), user: { id: 'a' } }, error: null }); await f.flush(); assert.equal(f.navigations.length, 0); assert.match(f.text(), /Welcome back/); f.dispose();
});
test('login: mode changes and duplicate submit are blocked while the mutation is pending', async () => {
  const gate = deferred(), f = fixture('login', { signInWithPassword: () => gate.promise }); await f.flush(); f.fill(); const form = f.node(node => node.type === 'form');
  form.props.onSubmit({ preventDefault() {} }); form.props.onSubmit({ preventDefault() {} }); await f.flush(); f.click('Create account');
  assert.equal(f.count('signInWithPassword'), 1); assert.doesNotMatch(f.text(), /New account/); gate.resolve({ data: { session: null }, error: Error('Invalid login credentials') }); await f.flush(); assert.match(f.text(), /Email or password is not correct/); f.dispose();
});

for (const returned of [true, false]) test('reset: update failure releases busy and permits a retry (' + returned + ')', async () => {
  let failure = true; const f = fixture('reset-password', { updateUser: async () => { if (!failure) return { data: { user: { id: 'a' } }, error: null }; if (!returned) throw Error('PRIVATE'); return { data: { user: null }, error: { message: 'weak password' } }; } });
  await f.flush(); f.fill(); f.submit(); await f.flush(); assert.equal(f.busy(), false); assert.match(f.text(), returned ? /stronger password/ : /could not be confirmed.*may already have been saved/); assert.doesNotMatch(f.text(), /Password updated/);
  failure = false; f.submit(); await f.flush(); assert.match(f.text(), /Password updated/); assert.equal(f.count('updateUser'), 2); f.dispose();
});
test('reset: rejected session refresh fails before any password mutation', async () => {
  const f = fixture('reset-password', { read: f => f.reads === 1 ? Promise.resolve(sessionResult('a')) : Promise.reject(Error('PRIVATE')) }); await f.flush(); f.fill(); f.submit(); await f.flush();
  assert.equal(f.count('updateUser'), 0); assert.equal(f.busy(), false); assert.match(f.text(), /sign-in could not be checked/); f.dispose();
});
test('reset: fresh actor mismatch clears typed secrets and never updates the new account', async () => {
  const f = fixture('reset-password'); await f.flush(); f.fill(); f.actor = 'b'; f.submit(); await f.flush();
  assert.equal(f.count('updateUser'), 0); assert.equal(f.node(node => node.props?.id === 'password').props.value, ''); assert.equal(f.node(node => node.props?.id === 'confirmPassword').props.value, ''); f.dispose();
});
test('reset: same-actor refresh preserves fields and one pending update', async () => {
  const gate = deferred(), f = fixture('reset-password', { updateUser: () => gate.promise }); await f.flush(); f.fill();
  assert.equal(f.button('Save new password').props.type, 'submit'); f.submit(); f.submit(); await f.flush();
  f.emit('a', 'TOKEN_REFRESHED'); assert.equal(f.node(node => node.props?.id === 'password').props.value, 'new-password-123'); assert.equal(f.count('updateUser'), 1);
  gate.resolve({ data: { user: { id: 'a' } }, error: null }); await f.flush(); assert.match(f.text(), /Password updated/); f.dispose();
});
for (const ids of [['b'], ['', 'a']]) test('reset: account transition suppresses delayed password success ' + ids.join('→'), async () => {
  const gate = deferred(), f = fixture('reset-password', { updateUser: () => gate.promise }); await f.flush(); f.fill(); f.submit(); await f.flush(); ids.forEach(id => f.emit(id));
  gate.resolve({ data: { user: { id: 'a' } }, error: null }); await f.flush(); await f.advance(900); assert.doesNotMatch(f.text(), /Password updated/); assert.equal(f.navigations.length, 0); assert.equal(f.node(node => node.props?.id === 'password').props.value, ''); f.dispose();
});
test('reset: account transition clears the success screen and pending redirect', async () => {
  const f = fixture('reset-password'); await f.flush(); f.fill(); f.submit(); await f.flush(); assert.match(f.text(), /Password updated/); f.emit('b'); await f.advance(900);
  assert.doesNotMatch(f.text(), /Password updated/); assert.equal(f.navigations.length, 0); f.dispose();
});
test('reset: confirmed update navigates once to the original destination', async () => {
  const f = fixture('reset-password', { search: '?next=%2Faccount' }); await f.flush(); f.fill(); f.submit(); await f.flush(); await f.advance(900);
  assert.deepEqual(f.navigations, ['/account']); assert.equal(f.count('updateUser'), 1); f.dispose();
});
test('reset: confirmed update keeps the billing return and loads its document security policy', async () => {
  const destination = '/billing?orderId=44444444-4444-4444-8444-444444444444#payment';
  const f = fixture('reset-password', { search: '?next=' + encodeURIComponent(destination) }); await f.flush(); f.fill(); f.submit(); await f.flush();
  assert.match(f.text(), /Password updated/); assert.deepEqual(f.documentNavigations, []);
  const continueLink = f.node(node => node.type === 'a' && text(node).trim() === 'Continue'); assert.equal(continueLink.props.href, destination);
  await f.advance(900); assert.deepEqual(f.documentNavigations, [destination]); assert.deepEqual(f.navigations, []); assert.equal(f.count('updateUser'), 1); f.dispose();
});
test('reset: account change still cancels a pending document return to billing', async () => {
  const f = fixture('reset-password', { search: '?next=%2Fbilling' }); await f.flush(); f.fill(); f.submit(); await f.flush(); f.emit('b'); await f.advance(900);
  assert.deepEqual(f.documentNavigations, []); assert.deepEqual(f.navigations, []); assert.doesNotMatch(f.text(), /Password updated/); f.dispose();
});
test('reset: unmount suppresses late update feedback and navigation', async () => {
  const gate = deferred(), f = fixture('reset-password', { updateUser: () => gate.promise }); await f.flush(); f.fill(); f.submit(); await f.flush(); f.dispose(); const writes = f.writes;
  gate.resolve({ data: { user: { id: 'a' } }, error: null }); await tick(); assert.equal(f.writes, writes); assert.equal(f.navigations.length, 0); assert.equal(f.listenerCount(), 0);
});
test('reset: pending deadline never claims failure or permits overlapping password updates', async () => {
  const gate = deferred(), f = fixture('reset-password', { updateUser: () => gate.promise }); await f.flush(); f.fill(); f.submit(); await f.flush(); await f.advance(20000);
  assert.match(f.text(), /still pending.*may already have been saved/); assert.equal(f.busy(), true);
  const saving = f.button('Saving...'); assert.equal(saving.props.disabled, true); f.submit(); assert.equal(f.count('updateUser'), 1);
  gate.reject(Error('PRIVATE')); await f.flush(); assert.equal(f.busy(), false); f.dispose();
});
test('reset: initial read failure offers an actual retry and preserves return destination', async () => {
  let failed = true; const f = fixture('reset-password', { search: '?next=%2Faccount', read: () => failed ? Promise.reject(Error('PRIVATE')) : Promise.resolve(sessionResult('')) });
  await f.flush(); failed = false; f.click('Try again'); await f.flush(); const link = f.node(node => node.type === 'a' && text(node) === 'Request a new reset link');
  assert.equal(link.props.href, '/login?mode=reset&next=%2Faccount'); f.dispose();
});
test('reset: effect cleanup/setup cannot revive an earlier pending success', async () => {
  const gate = deferred(), f = fixture('reset-password', { updateUser: () => gate.promise }); await f.flush(); f.fill(); f.submit(); await f.flush(); f.replayEffects(); await f.flush();
  gate.resolve({ data: { user: { id: 'a' } }, error: null }); await f.flush(); await f.advance(900); assert.doesNotMatch(f.text(), /Password updated/); assert.equal(f.navigations.length, 0); assert.equal(f.busy(), false); assert.equal(f.listenerCount(), 1); f.dispose();
});

test('auth, Account and navigation pages typecheck against the actual canonical dependencies', () => {
  const configPath = path.join(repo, 'apps/web/tsconfig.json');
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  assert.equal(config.error, undefined);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath));
  const options = { ...parsed.options, noEmit: true, incremental: false };
  const host = ts.createCompilerHost(options), read = host.readFile.bind(host);
  const checkedSources = ['app/login/page.tsx', 'app/login/LoginClient.tsx', 'app/reset-password/page.tsx', 'app/account/page.tsx', 'components/Nav.tsx'];
  const roots = checkedSources.map(relative => path.join(repo, 'apps/web', relative));
  host.readFile = file => {
    const relative = path.relative(path.join(repo, 'apps/web'), file).replaceAll('\\', '/');
    return checkedSources.includes(relative) ? fs.readFileSync(path.join(source, 'apps/web', relative), 'utf8') : read(file);
  };
  const program = ts.createProgram([...roots, path.join(repo, 'apps/web/next-env.d.ts')], options, host);
  const errors = ts.getPreEmitDiagnostics(program).filter(item => item.category === ts.DiagnosticCategory.Error);
  assert.equal(errors.length, 0, ts.formatDiagnosticsWithColorAndContext(errors, { getCanonicalFileName: value => value, getCurrentDirectory: () => repo, getNewLine: () => '\n' }));
});

test('login: native fallback submits credentials by POST, never in the URL', async () => {
  const f = fixture('login'); await f.flush();
  assert.equal(f.node(node => node.type === 'form').props.method, 'post');
  f.dispose();
});

test('reset: native form submission reuses the guarded update and preserves the Account section', async () => {
  const f = fixture('reset-password', { search: '?next=%2Faccount%3Fsection%3Dsecurity' }); await f.flush(); f.fill();
  const form = f.node(node => node.type === 'form'); assert.equal(form.props.method, 'post');
  assert.equal(f.button('Save new password').props.type, 'submit');
  let prevented = false; form.props.onSubmit({ preventDefault() { prevented = true; } }); await f.flush();
  assert.equal(prevented, true); assert.equal(f.count('updateUser'), 1);
  await f.advance(900); assert.deepEqual(f.navigations, ['/account?section=security']); f.dispose();
});

// Role-first signup: actual page callbacks and SDK arguments, no account or network mutations.
test('signup: a self-service account requires an explicit workspace choice before SDK mutation', async () => {
  const f = fixture('login', { search: '?mode=register' }); await f.flush(); f.input('name', 'New owner'); f.fill(); f.submit(); await f.flush(); assert.equal(f.count('signUp'),0); assert.match(f.text(), /Choose your workspace/); f.dispose();
});
for (const role of ['player','collector','shop','builder','luthier','other']) test('signup: exact selected workspace metadata is submitted for '+role, async () => {
  const f = fixture('login', { search: '?mode=register&next=%2Fcreate' }); await f.flush(); f.selectRole(role); f.continueRegistration(); f.input('name','  New owner  '); f.fill(); f.submit(); await f.flush(); assert.equal(f.count('signUp'),1); assert.deepEqual(f.calls[0].values[0].options.data,{display_name:'New owner',qrguitar_workspace_type:role}); assert.equal(f.calls[0].values[0].options.emailRedirectTo,'https://www.qrguitar.com/create'); assert.match(f.text(),/Check your email/); f.dispose();
});
test('signup: choosing a business changes the single name field without losing its typed value', async () => {
  const f=fixture('login',{search:'?mode=register'});await f.flush();f.selectRole('shop');f.continueRegistration();f.input('name','My guitars');assert.match(f.text(),/Business name/);assert.match(f.text(),/Add your logo and support preferences later/);const name=f.node(n=>n.type==='input'&&n.props.id==='name');assert.equal(name.props.value,'My guitars');assert.equal(name.props.autoComplete,'organization');assert.equal(name.props.maxLength,80);f.changeRegistration();f.selectRole('collector');f.continueRegistration();assert.equal(f.node(n=>n.type==='input'&&n.props.id==='name').props.value,'My guitars');assert.doesNotMatch(f.text(),/Add your logo/);f.dispose();
});
test('signup: a pending registration locks workspace choices and duplicate submit', async()=>{
  const gate=deferred(),f=fixture('login',{search:'?mode=register',signUp:()=>gate.promise});await f.flush();f.selectRole('builder');f.continueRegistration();f.input('name','Maker');f.fill();f.submit();await f.flush();assert.equal(f.node(n=>n.type==='fieldset').props.disabled,true);f.submit();await f.flush();assert.equal(f.count('signUp'),1);gate.resolve({data:{session:null,user:{id:'new',identities:[{id:'new-email'}]}},error:null});await f.flush();assert.equal(f.busy(),false);f.dispose();
});
test('signup: an account transition clears its preceding role choice',async()=>{
  const f=fixture('login',{search:'?mode=register'});await f.flush();f.selectRole('collector');f.emit('another');f.emit('');assert.equal(f.node(n=>n.type==='input'&&n.props.value==='collector').props.checked,false);f.dispose();
});
for(const invalid of ['A','  ','🎸']) test('signup: too short normalized name cannot submit '+JSON.stringify(invalid),async()=>{
  const f=fixture('login',{search:'?mode=register'});await f.flush();f.selectRole('collector');f.continueRegistration();f.input('name',invalid);f.fill();f.submit();await f.flush();assert.equal(f.count('signUp'),0);assert.match(f.text(),/required|between 2 and 80/);f.dispose();
});
test('signup: an overlong business name cannot submit',async()=>{
  const f=fixture('login',{search:'?mode=register'});await f.flush();f.selectRole('shop');f.continueRegistration();f.input('name','x'.repeat(81));f.fill();f.submit();await f.flush();assert.equal(f.count('signUp'),0);assert.match(f.text(),/between 2 and 80/);f.dispose();
});
test('signup: invited buyer keeps its simple original registration payload and exact destination',async()=>{
  const destination='/transfer/invite-id?code=1#accept',f=fixture('login',{search:'?mode=register&next='+encodeURIComponent(destination),signUp:async state=>{state.event('a');return {data:{session:session('a'),user:{id:'a',identities:[{id:'email-a'}]}},error:null};}});await f.flush();assert.equal(f.node(n=>n.type==='fieldset'),undefined);f.input('name','B');f.fill();f.submit();await f.flush();assert.equal(f.count('signUp'),1);assert.deepEqual(f.calls[0].values[0].options.data,{display_name:'B'});assert.deepEqual(f.navigations,[destination]);f.dispose();
});
test('signup: sign-in and reset modes show no registration roles',async()=>{
  const f=fixture('login');await f.flush();assert.equal(f.node(n=>n.type==='fieldset'),undefined);f.click('Create account');assert.ok(f.node(n=>n.type==='fieldset'));f.click('Sign in');assert.equal(f.node(n=>n.type==='fieldset'),undefined);f.dispose();
});

// Explicit progression uses the actual component/controller, real copy resolver and existing SDK fixture.
function registrationValues(f) {
  return Object.fromEntries(['name', 'email', 'password'].map(id => [id, f.node(n => n.type === 'input' && n.props.id === id).props.value]));
}
function assertRegistrationStage(f, roleStep) {
  const group = f.node(n => n.props?.id === 'registration-role-choices'), details = f.node(n => n.props?.id === 'registration-details');
  assert.ok(group); assert.ok(details); assert.equal(group.props.hidden, !roleStep); assert.equal(group.props.disabled, !roleStep || f.busy()); assert.equal(details.props.hidden, roleStep);
  for (const id of ['name', 'email', 'password']) assert.equal(f.node(n => n.type === 'input' && n.props.id === id).props.disabled, roleStep);
  assert.equal(Boolean(f.stageButton('registration-details')), roleStep);
  assert.equal(Boolean(f.stageButton('registration-role-choices')), !roleStep);
}

test('signup progression: initial roles stay unselected and radio changes never advance or request focus', async () => {
  const f = fixture('login', { search: '?mode=register' }); await f.flush(); const reads = f.reads;
  assertRegistrationStage(f, true); assert.equal(f.stageButton('registration-details').props.disabled, true);
  for (const role of ['player', 'collector', 'shop', 'builder', 'luthier', 'other']) assert.equal(f.node(n => n.type === 'input' && n.props.value === role).props.checked, false);
  for (const role of ['player', 'collector', 'shop', 'builder', 'luthier', 'other']) {
    const radio = f.node(n => n.type === 'input' && n.props.value === role); assert.equal(radio.props.onKeyDown, undefined);
    f.selectRole(role); assertRegistrationStage(f, true); assert.equal(f.node(n => n.type === 'input' && n.props.value === role).props.checked, true);
    assert.deepEqual(f.focusRequests, []); assert.equal(f.calls.length, 0); assert.equal(f.reads, reads);
  }
  f.dispose();
});

test('signup progression: guarded Continue and stage-one form submission never create an account', async () => {
  const f = fixture('login', { search: '?mode=register' }); await f.flush(); const reads = f.reads;
  f.stageButton('registration-details').props.onClick(); f.render(); assertRegistrationStage(f, true);
  f.submit(); await f.flush(); assertRegistrationStage(f, true); assert.match(f.text(), /Choose your workspace/); assert.equal(f.calls.length, 0);
  f.selectRole('shop'); f.submit(); await f.flush(); assertRegistrationStage(f, false);
  assert.equal(f.calls.length, 0); assert.equal(f.reads, reads); assert.deepEqual(registrationValues(f), { name: '', email: '', password: '' }); assert.deepEqual(f.focusRequests, ['name']);
  f.dispose();
});

test('signup progression: Continue and Change consume their focus request once and never on radio updates', async () => {
  const f = fixture('login', { search: '?mode=register' }); await f.flush(); f.selectRole('shop'); f.continueRegistration();
  assert.deepEqual(f.focusRequests, ['name']); f.render(); await f.flush(); f.input('name', 'Retained name'); assert.deepEqual(f.focusRequests, ['name']);
  f.changeRegistration(); assert.deepEqual(f.focusRequests, ['name', 'shop']); f.render(); await f.flush(); assert.deepEqual(f.focusRequests, ['name', 'shop']);
  f.selectRole('builder'); assert.deepEqual(f.focusRequests, ['name', 'shop']); f.continueRegistration(); assert.deepEqual(f.focusRequests, ['name', 'shop', 'name']);
  f.render(); await f.flush(); assert.deepEqual(f.focusRequests, ['name', 'shop', 'name']); assert.equal(f.calls.length, 0); f.dispose();
});

test('signup progression: repeated Change preserves all fields and submits only the final exact workspace', async () => {
  const destination = '/create?from=signup#instrument', f = fixture('login', { search: '?mode=register&next=' + encodeURIComponent(destination) }); await f.flush();
  f.selectRole('shop'); f.continueRegistration(); f.input('name', 'My guitar business'); f.input('email', 'studio@example.test'); f.input('password', 'retained-password-123');
  const expected = { name: 'My guitar business', email: 'studio@example.test', password: 'retained-password-123' };
  for (const role of ['builder', 'collector', 'luthier', 'other', 'player']) {
    f.changeRegistration(); assertRegistrationStage(f, true); assert.deepEqual(registrationValues(f), expected);
    f.selectRole(role); assert.deepEqual(registrationValues(f), expected); f.continueRegistration(); assertRegistrationStage(f, false); assert.deepEqual(registrationValues(f), expected); assert.equal(f.calls.length, 0);
  }
  f.submit(); await f.flush(); assert.equal(f.count('signUp'), 1);
  assert.deepEqual(f.calls[0].values[0], { email: expected.email, password: expected.password, options: { data: { display_name: expected.name, qrguitar_workspace_type: 'player' }, emailRedirectTo: 'https://www.qrguitar.com' + destination } });
  f.dispose();
});

test('signup progression: pending signup guards Change, stale Continue and duplicate submission without losing fields', async () => {
  const gate = deferred(), f = fixture('login', { search: '?mode=register', signUp: () => gate.promise }); await f.flush(); f.selectRole('builder');
  const staleContinue = f.stageButton('registration-details').props.onClick; f.continueRegistration(); f.input('name', 'Pending builder'); f.fill(); const expected = registrationValues(f);
  f.submit(); await f.flush(); assert.equal(f.count('signUp'), 1); assert.equal(f.stageButton('registration-role-choices').props.disabled, true);
  staleContinue(); f.stageButton('registration-role-choices').props.onClick(); f.submit(); await f.flush(); await f.advance(20000);
  assertRegistrationStage(f, false); assert.deepEqual(registrationValues(f), expected); assert.deepEqual(f.focusRequests, ['name']); assert.equal(f.count('signUp'), 1); assert.equal(f.busy(), true);
  gate.resolve({ data: { session: null, user: { id: 'new', identities: [{ id: 'new-email' }] } }, error: null }); await f.flush();
  assert.equal(f.busy(), false); assert.deepEqual(registrationValues(f), expected); f.changeRegistration(); assertRegistrationStage(f, true); assert.deepEqual(registrationValues(f), expected); f.dispose();
});

test('signup progression: an actor transition resets the advanced stage, choices, fields and focus intent', async () => {
  const f = fixture('login', { search: '?mode=register&next=%2Fcreate' }); await f.flush(); f.selectRole('collector'); f.continueRegistration(); f.input('name', 'Earlier actor'); f.fill();
  f.emit('another'); f.emit(''); assertRegistrationStage(f, true); assert.deepEqual(registrationValues(f), { name: '', email: '', password: '' });
  for (const role of ['player', 'collector', 'shop', 'builder', 'luthier', 'other']) assert.equal(f.node(n => n.type === 'input' && n.props.value === role).props.checked, false);
  assert.equal(f.stageButton('registration-details').props.disabled, true); assert.deepEqual(f.focusRequests, ['name']); assert.equal(f.calls.length, 0); assert.deepEqual(f.navigations, []); f.dispose();
});

test('signup progression: real CMS overrides survive the role/details/Change transitions without leaking to another fixture', async () => {
  const content = {
    'ui.app.login.page.registrationRole': 'Published workspace heading', 'ui.app.login.page.registrationRoleHelp': 'Published workspace help',
    'ui.app.login.page.registrationContinue': 'Published continue', 'ui.app.login.page.registrationChange': 'Published change',
    'ui.app.login.page.businessName': 'Published business name', 'ui.app.login.page.businessDetailsLater': 'Published later details',
    'ui.workspace.679ab74fd398': 'Published store choice', 'ui.workspace.15aa16da501a': 'Published store benefit'
  };
  const f = fixture('login', { search: '?mode=register', content }); await f.flush();
  const group = f.node(n => n.props?.id === 'registration-role-choices'); assert.match(text(group), /Published workspace heading/); assert.match(text(group), /Published workspace help/);
  assert.equal(text(f.stageButton('registration-details')), 'Published continue'); f.selectRole('shop'); f.continueRegistration();
  const summary = f.node(n => n.props?.className === 'registrationSummary'); assert.ok(summary); assert.equal(text(find(summary, n => n.type === 'strong')), 'Published store choice'); assert.equal(text(find(summary, n => n.type === 'span')), 'Published store benefit');
  assert.equal(text(f.node(n => n.type === 'label' && n.props.htmlFor === 'name')), 'Published business name'); assert.match(f.text(), /Published later details/); assert.equal(text(f.stageButton('registration-role-choices')), 'Published change');
  f.changeRegistration(); assert.equal(text(f.stageButton('registration-details')), 'Published continue'); f.dispose();
  const plain = fixture('login', { search: '?mode=register' }); await plain.flush(); assert.equal(text(plain.stageButton('registration-details')), 'Continue'); plain.dispose();
});

for (const [role, key] of [
  ['player', 'ui.workspace.11c503369f69'], ['collector', 'ui.workspace.b5efa61cb710'], ['shop', 'ui.workspace.15aa16da501a'],
  ['builder', 'ui.workspace.c110fe1e6af2'], ['luthier', 'ui.workspace.93363fe59878'], ['other', 'ui.workspace.23160d470c3a']
]) test('signup progression: registered benefit override is retained in the role choice and summary for ' + role, async () => {
  const benefit = 'Published benefit for ' + role, f = fixture('login', { search: '?mode=register', content: { [key]: benefit } }); await f.flush();
  const choice = f.node(n => n.type === 'label' && find(n, child => child.type === 'input' && child.props.value === role)); assert.ok(choice); assert.equal(text(find(choice, n => n.type === 'small')), benefit);
  f.selectRole(role); f.continueRegistration(); const summary = f.node(n => n.props?.className === 'registrationSummary'); assert.ok(summary); assert.equal(text(find(summary, n => n.type === 'span')), benefit); assert.equal(f.calls.length, 0); f.dispose();
});

test('signup progression: invited buyers keep enabled one-step credentials and the original metadata boundary', async () => {
  const destination = '/transfer/invite-id?code=1#accept', f = fixture('login', { search: '?mode=register&next=' + encodeURIComponent(destination) }); await f.flush();
  assert.equal(f.node(n => n.props?.id === 'registration-role-choices'), undefined); assert.equal(f.stageButton('registration-details'), undefined); assert.equal(f.stageButton('registration-role-choices'), undefined);
  assert.equal(f.node(n => n.props?.id === 'registration-details').props.hidden, false);
  for (const id of ['name', 'email', 'password']) assert.equal(f.node(n => n.type === 'input' && n.props.id === id).props.disabled, false);
  const name = f.node(n => n.type === 'input' && n.props.id === 'name'); assert.equal(name.props.minLength, undefined); assert.equal(name.props.maxLength, undefined); assert.equal(name.props.autoComplete, 'nickname');
  f.input('name', 'B'); f.fill(); f.submit(); await f.flush(); assert.equal(f.count('signUp'), 1); assert.deepEqual(f.calls[0].values[0].options.data, { display_name: 'B' }); assert.equal(f.calls[0].values[0].options.emailRedirectTo, 'https://www.qrguitar.com' + destination); assert.deepEqual(f.focusRequests, []); f.dispose();
});
