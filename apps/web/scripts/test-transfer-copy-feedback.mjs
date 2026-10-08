import { withUiTextTestContext } from "./ui-text-test-context.mjs";
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

const hereRoot = path.resolve(import.meta.dirname, '../../..');
const repo = path.resolve(process.argv.find(arg => arg.startsWith('--repo='))?.slice(7) || hereRoot);
const sourceRoot = path.resolve(process.argv.find(arg => arg.startsWith('--source-root='))?.slice(14) || hereRoot);
const require = withUiTextTestContext(createRequire(path.join(repo, 'package.json')));
const { useUiText } = require("UiTextProvider");
const ts = require('typescript'), React = require('react');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const transfer = { id: 'transfer-a', status: 'sent', guitarQrCode: 'QRG-A', claimPath: '/transfer/transfer-a', toEmail: 'buyer@example.invalid' };
function component(file, name, env) {
  env = { useUiText, ...env };
  const source = fs.readFileSync(path.join(sourceRoot, 'apps/web', file), 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(declaration, 'Component must exist in actual source');
  const text = declaration.getText(ast).replace(/^export default /, '').replace(/^export /, '');
  const js = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  return new Function('require', 'exports', ...Object.keys(env), js + '\nreturn ' + name)(require, {}, ...Object.values(env));
}
function all(tree) {
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...React.Children.toArray(tree.props?.children).flatMap(all)];
}
const words = tree => typeof tree === 'string' || typeof tree === 'number' ? String(tree) : tree && typeof tree === 'object' ? React.Children.toArray(tree.props?.children).map(words).join('') : '';
function fixture(kind, options = {}) {
  const values = [], effects = [], timers = new Map();
  let cursor = 0, effectCursor = 0, dirty = true, mounted = true, timerId = 0, tree, sessionCurrent = true, authCallback;
  let params = { id: 'transfer-a' };
  let props = { className: 'transfer', bodyClassName: 'body', instrument: { qrCode: 'QRG-A', updatedAt: '2026-10-01T12:00:00.000Z', documentFiles: [] }, sessionRevision: 1, user: { email: 'owner@example.invalid' },
    allowBuyerCode: true, latestTransfer: options.latestTransfer === null ? undefined : { ...transfer, ...options.latestTransfer },
    isSessionCurrent: () => sessionCurrent, onTransferCreated: value => { props.latestTransfer = value; dirty = true; }, onTransferChanged() {} };
  const f = { writes: 0, copies: [], requests: [], tracking: [], timers };
  const hooks = {
    useState(initial) { const index = cursor++; if (!(index in values)) values[index] = typeof initial === 'function' ? initial() : initial; return [values[index], next => { f.writes++; const value = typeof next === 'function' ? next(values[index]) : next; if (!Object.is(value, values[index])) { values[index] = value; dirty = true; } }]; },
    useRef(initial) { const index = cursor++; return values[index] ||= { current: initial }; },
    useMemo(fn) { return fn(); },
    useEffect(run, deps) { const index = effectCursor++, old = effects[index]; if (!old || deps.some((value, i) => !Object.is(value, old.deps[i]))) effects[index] = { run, deps, cleanup: old?.cleanup, pending: true }; }
  };
  const window = { location: { origin: 'https://www.qrguitar.com' }, navigator: options.missingClipboard ? {} : { clipboard: { writeText: value => { f.copies.push(value); return options.copy ? options.copy(value) : Promise.resolve(); } } } };
  const noop = () => null;
  const env = { ...hooks, window, workflow: new Proxy({}, { get: (_, name) => name }), BadgeCheck: noop, Copy: noop, LogIn: noop, Repeat2: noop, ShieldCheck: noop, Mail: noop, Nav: noop, Footer: noop, Link: 'a',
    useParams: () => params, transferStatusLabel: value => value.status, getSupabaseAccessToken: async () => 'synthetic-token', AbortController,
    useAuthNavigation: () => ({ logout: async () => false, signingOut: false, logoutError: '' }),
    optionalTrackingProductEvents: { ownershipTransferCompleted: 'ownership_transfer_completed' },
    dispatchOptionalTrackingProductEvent: async event => { f.tracking.push(event); return true; },
    setTimeout: (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms }); return id; }, clearTimeout: id => timers.delete(id),
    createBrowserSupabaseClient: () => ({ auth: {
      getSession: async () => ({ data: { session: { access_token: 'synthetic-token', user: { id: 'actor-a' } } } }),
      onAuthStateChange: callback => { authCallback = callback; return { data: { subscription: { unsubscribe() {} } } }; }
    } }),
    fetch: async (url, init) => {
      const request = { url, method: init?.method || 'GET', body: init?.body ? JSON.parse(init.body) : undefined }; f.requests.push(request);
      if (options.fetch) return options.fetch(request);
      if (request.method === 'GET') return Response.json({ ok: true, transfer: { ...transfer, status: 'accepted', id: params.id, guitarQrCode: params.id === 'transfer-a' ? 'QRG-A' : 'QRG-B' } });
      if (request.body?.action === 'cancel') return Response.json({ ok: true, transfer: { ...transfer, status: 'cancelled' }, message: 'Transfer cancelled.' });
      if (request.body?.action === 'resend') return Response.json({ ok: true, message: 'Invitation resent.' });
      return Response.json({ ok: true, transfer: { ...transfer, handoffPrepared: true }, buyerCode: 'SYNTHETIC-BUYER-CODE', message: 'Transfer prepared.' });
    }
  };
  const C = component(kind === 'dashboard' ? 'app/dashboard/page.tsx' : 'app/transfer/[id]/page.tsx', kind === 'dashboard' ? 'TransferPanel' : 'TransferClaimPage', env);
  f.render = () => {
    assert.ok(mounted); dirty = true; let turns = 0;
    while (dirty) { assert.ok(turns++ < 20); dirty = false; cursor = effectCursor = 0; tree = C(props); for (const effect of effects) if (effect.pending) { effect.pending = false; effect.cleanup?.(); effect.cleanup = effect.run(); } }
    return tree;
  };
  f.button = label => { const found = all(f.render()).find(node => node.type === 'button' && words(node).trim() === label); assert.ok(found, 'Missing button: ' + label); return found; };
  f.click = label => { const button = f.button(label); if (button.props.type === "submit") all(f.render()).find(node => node.type === "form").props.onSubmit({ preventDefault() {} }); else button.props.onClick(); f.render(); };
  f.message = () => all(f.render()).filter(node => node.type === 'p' && node.props?.className?.includes('form-message')).map(words).join('|');
  f.props = patch => { props = { ...props, ...patch }; f.render(); };
  f.auth = () => { authCallback('SIGNED_IN', { access_token: 'synthetic-second', user: { id: 'actor-b' } }); f.render(); };
  f.invalidateSession = () => { sessionCurrent = false; };
  f.route = id => { params = { id }; f.render(); };
  f.replayEffects = () => { for (const effect of effects) { effect.cleanup?.(); effect.cleanup = effect.run(); } f.render(); };
  f.unmount = () => { for (const effect of effects) effect.cleanup?.(); mounted = false; };
  f.render(); return f;
}
async function ready(kind, options) { const f = fixture(kind, options); await tick(); f.render(); return f; }

for (const kind of ['dashboard', 'transfer']) {
  const label = kind === 'dashboard' ? 'Copy Claim Link' : 'Copy Profile Link';
  test(kind + ': no success before fulfillment; current success reports copied', async () => {
    const d = deferred(), f = await ready(kind, { copy: () => d.promise }); f.click(label); assert.equal(f.message(), '');
    d.resolve(); await tick(); assert.match(f.message(), /copied/i); assert.equal(f.copies.length, 1); f.unmount(); assert.equal(f.timers.size, 0);
  });
  for (const mode of ['missing', 'reject']) test(kind + ': ' + mode + ' clipboard has recoverable failure', async () => {
    const f = await ready(kind, { missingClipboard: mode === 'missing', copy: async () => { throw Error('denied'); } }); f.click(label); await tick(); assert.match(f.message(), /Could not copy/); f.unmount();
  });
  for (const oldOutcome of ['success', 'failure']) test(kind + ': older ' + oldOutcome + ' cannot replace the newer copy result', async () => {
    const a = deferred(), b = deferred(); let n = 0;
    const f = await ready(kind, { copy: () => ++n === 1 ? a.promise : b.promise }); f.click(label); f.click(label);
    if (oldOutcome === 'success') b.reject(Error('new copy denied')); else b.resolve(); await tick(); const newest = f.message();
    if (oldOutcome === 'success') a.resolve(); else a.reject(Error('old denied')); await tick();
    assert.equal(f.message(), newest); assert.match(newest, oldOutcome === 'success' ? /Could not copy/ : /copied/); f.unmount();
  });
  test(kind + ': unresolved earlier copy does not strand another explicit copy', async () => {
    let n = 0; const f = await ready(kind, { copy: () => ++n === 1 ? new Promise(() => {}) : Promise.resolve() });
    f.click(label); f.click(label); await tick(); assert.equal(f.copies.length, 2); assert.match(f.message(), /copied/); f.unmount();
  });
  for (const outcome of ['success', 'failure']) test(kind + ': unmount ignores late ' + outcome, async () => {
    const d = deferred(), f = await ready(kind, { copy: () => d.promise }); f.click(label); f.unmount(); const writes = f.writes;
    if (outcome === 'success') d.resolve(); else d.reject(Error('late')); await tick(); assert.equal(f.writes, writes); assert.equal(f.timers.size, 0);
  });
}

for (const outcome of ['success', 'failure']) test('dashboard: confirmed cancellation wins over earlier copy ' + outcome, async () => {
  const d = deferred(), f = await ready('dashboard', { copy: () => d.promise }); f.click('Copy Claim Link'); f.click('Cancel Transfer'); await tick();
  assert.equal(f.message(), 'Transfer cancelled.'); if (outcome === 'success') d.resolve(); else d.reject(Error('late')); await tick(); assert.equal(f.message(), 'Transfer cancelled.'); f.unmount();
});
test('dashboard: copy during resend cannot suppress the mutation result', async () => {
  const request = deferred(); const f = await ready('dashboard', { latestTransfer: null, fetch: async input => input.body?.action === 'resend' ? request.promise : Response.json({ ok: true, transfer: { ...transfer, handoffPrepared: true }, buyerCode: 'SYNTHETIC-BUYER-CODE' }) });
  f.click('Buyer code'); f.click('Prepare for Buyer'); await tick(); f.render();
  const beforeRenderCopy = f.button('Copy Buyer Code');
  f.button('Resend invitation').props.onClick(); beforeRenderCopy.props.onClick();
  assert.equal(f.button('Copy Buyer Code').props.disabled, true); f.click('Copy Buyer Code'); await tick(); assert.equal(f.copies.length, 0);
  request.resolve(Response.json({ ok: true, message: 'Invitation resent.' })); await tick(); assert.equal(f.message(), 'Invitation resent.');
  f.click('Copy Buyer Code'); await tick(); assert.equal(f.message(), 'Buyer code copied. Share it only with the recipient.'); f.unmount();
});
test('dashboard: a newer resend operation suppresses earlier buyer-code feedback', async () => {
  const d = deferred(), f = await ready('dashboard', { latestTransfer: null, copy: () => d.promise });
  f.click('Buyer code'); f.click('Prepare for Buyer'); await tick(); f.render(); f.click('Copy Buyer Code'); f.click('Resend invitation'); await tick();
  assert.equal(f.message(), 'Invitation resent.'); d.resolve(); await tick(); assert.equal(f.message(), 'Invitation resent.'); assert.deepEqual(f.copies, ['SYNTHETIC-BUYER-CODE']); f.unmount();
});
test('dashboard: immediate parent account revision invalidates copy before rerender', async () => {
  const d = deferred(), f = await ready('dashboard', { copy: () => d.promise }); f.click('Copy Claim Link'); f.invalidateSession(); const writes = f.writes; d.resolve(); await tick(); assert.equal(f.writes, writes); f.unmount();
});
for (const patch of [{ instrument: { qrCode: 'QRG-B' } }, { latestTransfer: { ...transfer, id: 'transfer-b', claimPath: '/transfer/b' } }, { latestTransfer: { ...transfer, status: 'cancelled' } }]) test('dashboard: changed transfer context suppresses old copy: ' + JSON.stringify(patch), async () => {
  const d = deferred(), f = await ready('dashboard', { copy: () => d.promise }); f.click('Copy Claim Link'); f.props(patch); const writes = f.writes; d.resolve(); await tick(); assert.equal(f.writes, writes); f.unmount();
});
test('dashboard: effect cleanup/setup replay invalidates old copy and permits a new one', async () => {
  const a = deferred(); let n = 0; const f = await ready('dashboard', { copy: () => ++n === 1 ? a.promise : Promise.resolve() }); f.click('Copy Claim Link'); f.replayEffects();
  f.click('Copy Claim Link'); await tick(); const message = f.message(); a.reject(Error('old')); await tick(); assert.equal(f.message(), message); assert.match(message, /copied/); f.unmount();
});
for (const change of ['auth', 'route']) test('transfer: ' + change + ' reload invalidates earlier Profile copy', async () => {
  const d = deferred(), f = await ready('transfer', { copy: () => d.promise }); f.click('Copy Profile Link'); if (change === 'auth') f.auth(); else f.route('transfer-b'); await tick(); f.render();
  assert.equal(f.message(), ''); d.resolve(); await tick(); assert.equal(f.message(), ''); f.unmount();
});

function acceptanceHandlers(copy, fetch, options = {}) {
  const file = 'app/transfer/[id]/page.tsx', source = fs.readFileSync(path.join(sourceRoot, 'apps/web', file), 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), selected = [];
  function visit(node) { if (ts.isFunctionDeclaration(node) && ['acceptTransfer', 'copyProfileLink'].includes(node.name?.text)) selected.push(node.getText(ast)); ts.forEachChild(node, visit); }
  visit(ast); assert.equal(selected.length, 2);
  const state = { message: '', accepting: false, acceptUncertain: false, transfer: { ...transfer }, permanentPath: '', loadError: false, tracking: [] };
  const env = { ui: useUiText("app.transfer.id.page"), transfer: state.transfer, accepting: false, renderedAuthRevision: 1, signedIn: true, transferId: options.transferId ?? transfer.id, authRevision: { current: 1 }, feedbackRevision: { current: 0 }, acceptMutation: { current: null },
    uncertainLock: { current: false }, acceptController: { current: null }, AbortController, setTimeout, clearTimeout,
    window: { navigator: { clipboard: { writeText: copy } }, location: { origin: 'https://www.qrguitar.com' } }, profileHref: '/i/QRG-A', getSupabaseAccessToken: async () => 'synthetic-token', fetch,
    optionalTrackingProductEvents: { ownershipTransferCompleted: 'ownership_transfer_completed' },
    dispatchOptionalTrackingProductEvent: async event => { state.tracking.push(event); return true; } };
  for (const key of Object.keys(state)) env['set' + key[0].toUpperCase() + key.slice(1)] = value => { state[key] = value; };
  const js = ts.transpileModule(selected.join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  return { state, authRevision: env.authRevision, ...new Function(...Object.keys(env), js + '\nreturn {acceptTransfer, copyProfileLink};')(...Object.values(env)) };
}
test('transfer: acceptance started after a copy retains its confirmed outcome', async () => {
  const d = deferred(), h = acceptanceHandlers(() => d.promise, async () => Response.json({ ok: true, transfer: { ...transfer, status: 'accepted' }, message: 'Ownership accepted.' }));
  const copying = h.copyProfileLink(); await h.acceptTransfer(); assert.equal(h.state.message, 'Ownership accepted.');
  d.resolve(); await copying; assert.equal(h.state.message, 'Ownership accepted.'); assert.equal(h.state.transfer.status, 'accepted');
  assert.deepEqual(h.state.tracking, [{ name: 'ownership_transfer_completed', properties: { method: 'email_link' } }]);
});
test('transfer: same-tick copy during acceptance cannot steal feedback or delay a subsequent copy', async () => {
  const d = deferred(); let copies = 0;
  const h = acceptanceHandlers(async () => { copies++; }, () => d.promise);
  const accepting = h.acceptTransfer(); await h.copyProfileLink(); assert.equal(copies, 0);
  d.resolve(Response.json({ ok: true, transfer: { ...transfer, status: 'accepted' }, message: 'Ownership accepted.' })); await accepting;
  assert.equal(h.state.message, 'Ownership accepted.'); await h.copyProfileLink(); assert.equal(copies, 1); assert.equal(h.state.message, 'Profile link copied.');
});

for (const boundary of ["auth", "route"]) test("transfer: extracted stale " + boundary + " handlers cannot copy or accept", async () => {
  let copies = 0, requests = 0;
  const h = acceptanceHandlers(async () => { copies++; }, async () => { requests++; throw Error("stale handler dispatched"); }, boundary === "route" ? { transferId: "transfer-b" } : {});
  if (boundary === "auth") h.authRevision.current++;
  await h.copyProfileLink(); await h.acceptTransfer();
  assert.equal(copies, 0); assert.equal(requests, 0); assert.equal(h.state.message, "");
  assert.equal(h.state.accepting, false); assert.deepEqual(h.state.tracking, []);
});

// Exercise the actual handoff component without real accounts, files or network writes.
const validInstrument=files=>({qrCode:'QRG-A',updatedAt:'2026-10-01T12:00:00.000Z',documentFiles:files});
const privateFile={id:'private-1',name:'Private receipt',updatedAt:'2026-10-01T12:00:00.000Z',visibility:'private'};
const publicFile={...privateFile,id:'public-1',name:'Public evidence',visibility:'public'};
test('handoff omits empty file choices for valid empty and public-only records',async()=>{
 for(const files of [[],[publicFile]]){const f=await ready('dashboard',{latestTransfer:null});f.props({instrument:validInstrument(files)});const nodes=all(f.render());assert.equal(nodes.some(n=>n.type==='fieldset'),false);assert.equal(f.button('Send Transfer Email').props.disabled,false);assert.equal(f.requests.length,0);f.unmount();}
});
test('handoff retains reload guidance and blocks submission when record or file metadata is incomplete',async()=>{
 for(const instrument of [{qrCode:'QRG-A',documentFiles:[]},validInstrument([{...publicFile,updatedAt:undefined}])]){const f=await ready('dashboard',{latestTransfer:null});f.props({instrument});const nodes=all(f.render());assert.ok(nodes.some(n=>n.type==='fieldset'&&n.props.disabled));assert.ok(nodes.some(n=>n.props?.role==='status'&&words(n).includes('Reload your collection')));assert.equal(f.button('Send Transfer Email').props.disabled,true);all(f.render()).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await tick();assert.equal(f.requests.length,0);f.unmount();}
});
test('handoff preserves unchecked private choices and submits reviewed IDs once from its native form',async()=>{
 const request=deferred(),f=await ready('dashboard',{latestTransfer:null,fetch:()=>request.promise});f.props({instrument:validInstrument([privateFile,publicFile])});
 let nodes=all(f.render()),boxes=nodes.filter(n=>n.type==='input'&&n.props.type==='checkbox');assert.equal(boxes.length,1);assert.equal(boxes[0].props.checked,false);boxes[0].props.onChange({target:{checked:true}});f.render();
 nodes=all(f.render());nodes.find(n=>n.type==='input'&&n.props.type==='email').props.onChange({target:{value:'buyer@example.invalid'}});f.render();
 assert.equal(f.button('Send Transfer Email').props.type,'submit');assert.equal(f.button('Send Transfer Email').props.onClick,undefined);const submit=all(f.render()).find(n=>n.type==='form').props.onSubmit;let prevented=0;submit({preventDefault(){prevented++;}});submit({preventDefault(){prevented++;}});await tick();assert.equal(prevented,2);assert.equal(f.requests.length,1);assert.deepEqual(f.requests[0].body.selectedPrivateDocumentIds,['private-1']);assert.equal(f.requests[0].body.expectedDocuments.length,2);
 request.resolve(Response.json({ok:true,transfer:{...transfer},message:'Transfer prepared.'}));await tick();f.render();f.props({latestTransfer:undefined,sessionRevision:2});assert.ok(all(f.render()).filter(n=>n.type==='input'&&n.props.type==='checkbox').every(n=>n.props.checked===false));f.unmount();
});
test('handoff email is required for an email invitation and optional for an in-person buyer code',async()=>{
 const f=await ready('dashboard',{latestTransfer:null});assert.equal(all(f.render()).find(n=>n.type==='input'&&n.props.type==='email').props.required,true);f.click('Buyer code');assert.equal(all(f.render()).find(n=>n.type==='input'&&n.props.type==='email').props.required,false);assert.equal(f.button('Prepare for Buyer').props.type,'submit');f.unmount();
});
test('handoff cannot implicitly submit while an invitation is already pending',async()=>{
 const f=await ready('dashboard');let prevented=false;all(f.render()).find(n=>n.type==='form').props.onSubmit({preventDefault(){prevented=true;}});await tick();assert.equal(prevented,true);assert.equal(f.requests.length,0);assert.ok(all(f.render()).filter(n=>n.type==='button').every(n=>n.props.type!=='submit'));f.unmount();
});
test('handoff outcome feedback is announced without issuing an extra request',async()=>{
 const f=await ready('dashboard',{latestTransfer:null,fetch:async()=>{throw Error('Uncertain transport');}});all(f.render()).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await tick();const message=all(f.render()).find(n=>n.type==='p'&&n.props.className==='form-message');assert.equal(message.props.role,'status');assert.match(words(message),/could not confirm/i);assert.equal(f.requests.length,1);f.unmount();
});

test('handoff keeps an initially empty live region mounted before announcing its outcome',async()=>{
 const f=await ready('dashboard',{latestTransfer:null,fetch:async()=>{throw Error('uncertain');}});let status=all(f.render()).find(n=>n.type==='p'&&n.props.role==='status'&&n.props['aria-live']==='polite');assert.ok(status);assert.equal(words(status),'');assert.equal(status.props.className,'sr-only');assert.equal(status.props['aria-atomic'],'true');
 all(f.render()).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await tick();status=all(f.render()).find(n=>n.type==='p'&&n.props.role==='status'&&n.props['aria-live']==='polite');assert.equal(status.props.className,'form-message');assert.match(words(status),/could not confirm/i);f.unmount();
});
test('handoff freezes preparation inputs and prevents method changes from discarding a one-time code',async()=>{
 const request=deferred(),f=await ready('dashboard',{latestTransfer:null,fetch:()=>request.promise});f.click('Buyer code');const staleEmailMode=f.button('Email invitation').props.onClick;all(f.render()).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});staleEmailMode();await tick();f.render();
 assert.equal(f.button('Email invitation').props.disabled,true);assert.equal(f.button('Buyer code').props.disabled,true);assert.equal(f.button('Buyer code').props['aria-pressed'],true);assert.ok(all(f.render()).filter(n=>n.type==='input'||n.type==='select').every(n=>n.props.disabled===true));assert.equal(f.requests.length,1);assert.equal(f.requests[0].body.mode,'buyer_code');
 request.resolve(Response.json({ok:true,transfer:{...transfer,handoffPrepared:true},buyerCode:'ONE-TIME-CODE',message:'Prepared.'}));await tick();f.render();assert.ok(all(f.render()).some(n=>n.type==='strong'&&words(n)==='ONE-TIME-CODE'));assert.equal(f.button('Copy Buyer Code').props.disabled,false);f.unmount();
});


for(const history of [
 {toName:'Current buyer',toEmail:' OWNER@example.invalid ',acceptedAt:'2026-10-01T10:00:00.000Z'},
 {toName:'Previous buyer',toEmail:'other@example.invalid',acceptedAt:'invalid-date'},
 {toName:'',toEmail:'',handoffPrepared:true,expiresAt:'2026-10-02T10:00:00.000Z'}
])test('accepted handoff is collapsed history, with a clear next preparation: '+JSON.stringify(history),async()=>{
 const f=await ready('dashboard',{latestTransfer:{...history,status:'accepted'}}),tree=f.render(),nodes=all(tree),outerSummary=React.Children.toArray(tree.props.children).find(n=>n.type==='summary');
 assert.equal(all(outerSummary).some(n=>n.type==='strong'),false);assert.match(words(nodes.find(n=>n.type==='p'&&n.props.className==='field-note')),/Start a new handoff/);
 const past=nodes.find(n=>n.type==='details'&&n.props.className==='previous-handoff');assert.ok(past);assert.equal(past.props.open,undefined);assert.match(words(past),/Previous handoff \(completed\)/);assert.match(words(past),/Handoff completed/);
 if(history.toEmail)assert.ok(words(past).includes(history.toEmail));else assert.match(words(past),/Recipient not email-bound/);
 assert.equal(all(past).some(n=>n.type==='code'),false);assert.equal(all(past).some(n=>n.type==='button'),false);assert.equal(all(past).some(n=>n.type==='time'),Boolean(history.acceptedAt&&Number.isFinite(Date.parse(history.acceptedAt))));
 assert.equal(f.button('Send Transfer Email').props.disabled,false);assert.equal(f.requests.length,0);f.unmount();
});

test('new preparation replaces completed history with the current pending invitation controls',async()=>{
 const f=await ready('dashboard',{latestTransfer:{status:'accepted'}});assert.ok(all(f.render()).some(n=>n.type==='details'&&n.props.className==='previous-handoff'));
 f.click('Send Transfer Email');await tick();const nodes=all(f.render());assert.equal(nodes.some(n=>n.type==='details'&&n.props.className==='previous-handoff'),false);assert.equal(f.button('Cancel Transfer').props.disabled,false);assert.equal(f.button('Resend invitation').props.disabled,false);assert.equal(f.requests.length,1);f.unmount();
});

for(const status of ['sent','cancelled'])test('non-completed '+status+' handoff keeps its existing status and receipt behavior',async()=>{
 const f=await ready('dashboard',{latestTransfer:{status}}),tree=f.render(),nodes=all(tree),summary=React.Children.toArray(tree.props.children).find(n=>n.type==='summary');
 assert.ok(all(summary).some(n=>n.type==='strong'&&words(n)===status));assert.equal(nodes.some(n=>n.type==='details'&&n.props.className==='previous-handoff'),false);assert.ok(nodes.some(n=>n.type==='code'&&words(n).includes('/transfer/transfer-a')));assert.equal(f.requests.length,0);f.unmount();
});
