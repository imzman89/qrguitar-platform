import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const args = process.argv.slice(2), option = name => args[args.indexOf(name) + 1];
const repo = path.resolve(args.includes('--repo') ? option('--repo') : path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..'));
const source = path.resolve(args.includes('--source') ? option('--source') : repo);
const require = createRequire(path.join(repo, 'apps/web/package.json'));
const ts = require('typescript'), React = require('react');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const session = id => id ? { user: { id }, access_token: 'synthetic-token-' + id } : null;
const sessionResult = id => ({ data: { session: session(id) }, error: null });

function compile(relative, imports, globals) {
  const input = fs.readFileSync(path.join(source, 'apps/web', relative), 'utf8');
  const code = ts.transpileModule(input, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', ...Object.keys(globals), code)(name => Object.hasOwn(imports, name) ? imports[name] : require(name), module, module.exports, ...Object.values(globals));
  return module.exports;
}
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
  const f = { actor: options.actor ?? (page === 'reset-password' ? 'a' : ''), clears: 0, writes: 0, navigations: [], calls: [], tracking: [], reads: 0, disposed: false };
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
  const globals = {
    window: { location, history: { replaceState() {} }, setTimeout: setTimer, clearTimeout: clearTimer, dispatchEvent() {} },
    setTimeout: setTimer, clearTimeout: clearTimer, CustomEvent: class { constructor(type) { this.type = type; } },
  };
  const imports = {
    react: hooks, 'next/link': { default: 'a', __esModule: true }, 'next/navigation': { useRouter: () => router },
    '../../components/Nav': { Nav: () => null }, '../../components/Footer': { Footer: () => null },
    '../../lib/supabase-browser': {
      createBrowserSupabaseClient: () => { if (options.constructError) throw Error('PRIVATE_CONFIG'); return { auth }; },
      clearQrGuitarSessionState: () => f.clears++, readSessionStorage: () => null, removeSessionStorage() {}, sessionExpiredMessageKey: 'expiry',
    },
    '../../lib/content-registry': { getContentValue: (_content, key) => key }, '../../lib/use-site-content': { useSiteContent: () => ({}) },
    '../../lib/auth-redirect': { safeAuthRedirect: value => value?.startsWith('/') && !value.startsWith('//') && !value.startsWith('/login') ? value : '/dashboard' },
    '../../lib/optional-tracking-consent': {
      optionalTrackingProductEvents: { registrationCompleted: 'account_registration_completed' },
      dispatchOptionalTrackingProductEvent: async event => { f.tracking.push(event); return true; },
    },
  };
  const Component = compile('app/' + page + '/page.tsx', imports, globals).default;
  f.render = () => {
    assert.equal(f.disposed, false); dirty = true; let remaining = 30;
    while (dirty) {
      assert.ok(remaining--, 'render loop'); dirty = false; cursor = effectCursor = 0; tree = Component();
      for (const effect of effects) if (effect.pending) { effect.pending = false; effect.cleanup?.(); effect.cleanup = effect.run(); }
    }
    return tree;
  };
  f.flush = async () => { await tick(); return f.render(); };
  f.event = (id, event = id ? 'SIGNED_IN' : 'SIGNED_OUT') => { f.actor = id; for (const listener of [...listeners]) listener(event, session(id)); };
  f.emit = (id, event) => { f.event(id, event); return f.render(); };
  f.node = predicate => find(f.render(), predicate);
  f.button = label => f.node(node => node.type === 'button' && text(node).trim() === label);
  f.input = (id, value) => { const node = f.node(node => node.type === 'input' && node.props.id === id); assert.ok(node, id + ' input'); node.props.onChange({ target: { value } }); f.render(); };
  f.fill = () => { if (page === 'login') f.input('email', 'owner@example.test'); f.input('password', 'new-password-123'); if (page === 'reset-password') f.input('confirmPassword', 'new-password-123'); };
  f.submit = () => {
    if (page === 'login') { const form = f.node(node => node.type === 'form'); assert.ok(form); form.props.onSubmit({ preventDefault() {} }); }
    else { const button = f.button('Save new password'); assert.ok(button); void button.props.onClick(); }
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
  const f = fixture('login', { search: '?mode=register&next=%2Fcreate' }); await f.flush(); f.input('name', 'Synthetic owner'); f.fill(); f.submit(); await f.flush();
  assert.match(f.text(), /Check your email to confirm/); assert.equal(f.navigations.length, 0); assert.equal(f.calls[0].values[0].options.emailRedirectTo, 'https://www.qrguitar.com/create');
  assert.deepEqual(f.tracking, [{ name: 'account_registration_completed', properties: { confirmation: 'email_pending' } }]); f.dispose();
});
test('login: registration with a confirmed session records the session-ready outcome', async () => {
  const f = fixture('login', { search: '?mode=register&next=%2Fcreate', signUp: async fixtureState => {
    fixtureState.event('a');
    return { data: { session: session('a'), user: { id: 'a', identities: [{ id: 'email-a' }] } }, error: null };
  } });
  await f.flush(); f.input('name', 'Synthetic owner'); f.fill(); f.submit(); await f.flush();
  assert.deepEqual(f.tracking, [{ name: 'account_registration_completed', properties: { confirmation: 'session_ready' } }]);
  assert.deepEqual(f.navigations, ['/create']); f.dispose();
});
test('login: existing-email obfuscation never records a new registration', async () => {
  const f = fixture('login', { search: '?mode=register&next=%2Fcreate', signUp: async () => ({ data: { session: null, user: { id: 'opaque-user', identities: [] } }, error: null }) });
  await f.flush(); f.input('name', 'Synthetic owner'); f.fill(); f.submit(); await f.flush();
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
  const gate = deferred(), f = fixture('reset-password', { updateUser: () => gate.promise }); await f.flush(); f.fill(); const button = f.button('Save new password'); void button.props.onClick(); void button.props.onClick(); await f.flush();
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
test('reset: unmount suppresses late update feedback and navigation', async () => {
  const gate = deferred(), f = fixture('reset-password', { updateUser: () => gate.promise }); await f.flush(); f.fill(); f.submit(); await f.flush(); f.dispose(); const writes = f.writes;
  gate.resolve({ data: { user: { id: 'a' } }, error: null }); await tick(); assert.equal(f.writes, writes); assert.equal(f.navigations.length, 0); assert.equal(f.listenerCount(), 0);
});
test('reset: pending deadline never claims failure or permits overlapping password updates', async () => {
  const gate = deferred(), f = fixture('reset-password', { updateUser: () => gate.promise }); await f.flush(); f.fill(); f.submit(); await f.flush(); await f.advance(20000);
  assert.match(f.text(), /still pending.*may already have been saved/); assert.equal(f.busy(), true);
  const saving = f.button('Saving...'); void saving.props.onClick(); assert.equal(f.count('updateUser'), 1);
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

test('both pages typecheck against the actual canonical dependencies', () => {
  const configPath = path.join(repo, 'apps/web/tsconfig.json');
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  assert.equal(config.error, undefined);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath));
  const options = { ...parsed.options, noEmit: true, incremental: false };
  const host = ts.createCompilerHost(options), read = host.readFile.bind(host);
  const roots = ['app/login/page.tsx', 'app/reset-password/page.tsx'].map(relative => path.join(repo, 'apps/web', relative));
  host.readFile = file => {
    const relative = path.relative(path.join(repo, 'apps/web'), file).replaceAll('\\', '/');
    return ['app/login/page.tsx', 'app/reset-password/page.tsx'].includes(relative) ? fs.readFileSync(path.join(source, 'apps/web', relative), 'utf8') : read(file);
  };
  const program = ts.createProgram([...roots, path.join(repo, 'apps/web/next-env.d.ts')], options, host);
  const errors = ts.getPreEmitDiagnostics(program).filter(item => item.category === ts.DiagnosticCategory.Error);
  assert.equal(errors.length, 0, ts.formatDiagnosticsWithColorAndContext(errors, { getCanonicalFileName: value => value, getCurrentDirectory: () => repo, getNewLine: () => '\n' }));
});
