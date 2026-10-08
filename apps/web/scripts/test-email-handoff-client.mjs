import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';
const require = createRequire(import.meta.url), ts = require('typescript');
const source = fs.readFileSync(path.resolve(import.meta.dirname, '../lib/email-handoff-client.ts'),'utf8');
const module = {exports:{}};
new Function('module','exports','window',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(module,module.exports,{location:{origin:'https://localhost:55440'}});
const {createEmailHandoffClient}=module.exports;
const id='11111111-1111-4111-8111-111111111111', email='buyer@example.invalid';
const buyer={access_token:'synthetic-buyer',user:{id:'buyer-a',email}};
const other={access_token:'synthetic-other',user:{id:'other-b',email:'other@example.invalid'}};
const record={id,status:'sent',guitarName:'Synthetic guitar',guitarQrCode:'QRG-TEST',toEmail:email};
const flush=async()=>{for(let i=0;i<6;i++)await new Promise(resolve=>setImmediate(resolve));};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
function fixture(options={}){
 let session=options.session??null, authListener, state, publishes=0;
 const requests=[],authCalls=[];
 const auth={getSession:async()=>({data:{session},error:null}),onAuthStateChange:fn=>{authListener=fn;return{data:{subscription:{unsubscribe(){authListener=null;}}}};},
 signInWithOtp:async args=>{authCalls.push(args);return options.send?.(args)??{error:null};},
 verifyOtp:async args=>{authCalls.push(args);if(options.verify)return options.verify(args);session=buyer;authListener?.('SIGNED_IN',session);return{data:{session},error:null};}};
 const fetcher=async(url,init={})=>{const request={url,...init,body:init.body?JSON.parse(init.body):undefined};requests.push(request);if(options.fetch)return options.fetch(request,session);return init.method==='PATCH'?Response.json({ok:true,transfer:{...record,status:'accepted'},permanentPath:'/i/QRG-TEST',ownsProfile:true}):session?.user.email===email?Response.json({ok:true,transfer:record}):Response.json({ok:true,requiresSignIn:true,transfer:{id}});};
 const client=createEmailHandoffClient(id,{auth},next=>{state=next;publishes++;},fetcher);
 return{client,requests,authCalls,state:()=>state,publishes:()=>publishes,event(next){session=next;authListener?.(next?'SIGNED_IN':'SIGNED_OUT',next);},setSession(next){session=next;}};
}

function renderActualReceive(state) {
  const React = require('react');
  const {renderToStaticMarkup} = require('react-dom/server');
  let stateIndex = 0;
  const react = {useRef: () => ({current: null}), useEffect() {}, useState: initial => [stateIndex++ === 0 ? state : initial, () => {}]};
  const page = {exports: {}};
  const source = fs.readFileSync(path.resolve(import.meta.dirname, '../app/receive/[id]/page.tsx'), 'utf8');
  const compiled = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX}}).outputText;
  const dependencies = {
    react,
    'next/link': {__esModule: true, default: ({children, ...props}) => React.createElement('a', props, children)},
    'next/navigation': {useParams: () => ({id})},
    '../../../components/Nav': {Nav: () => null},
    '../../../components/Footer': {Footer: () => null},
    '../../../lib/supabase-browser': {createBrowserSupabaseClient: () => {throw Error('No auth/network in a receive rendering fixture');}},
    '../../../lib/email-handoff-client': {createEmailHandoffClient},
    '../../../lib/use-auth-navigation': {useAuthNavigation: () => ({logout: async () => {throw Error('No account action in a receive rendering fixture');}, signingOut: false, logoutError: ''})},
    './receive.module.css': {__esModule: true, default: new Proxy({}, {get: (_, key) => key})}
  };
  new Function('require', 'module', 'exports', compiled)(name => {
    if (dependencies[name]) return dependencies[name];
    if (name === 'react/jsx-runtime') return require(name);
    throw Error('Unexpected receive dependency: ' + name);
  }, page, page.exports);
  assert.equal(typeof page.exports.default, 'function', 'Actual receive page component must exist');
  return renderToStaticMarkup(page.exports.default());
}

test('anonymous invitation shows no private instrument or recipient details',async()=>{const h=fixture();await h.client.reload();assert.equal(h.state().phase,'email');assert.equal(h.state().transfer,null);assert.equal(h.state().permanentPath,'');assert.equal(h.requests.filter(r=>r.method==='PATCH').length,0);h.client.dispose();});
test('verified email accepts once after explicit intent with the verified session',async()=>{const h=fixture();await h.client.reload();await Promise.all([h.client.verifyAndAccept(email,'123456'),h.client.verifyAndAccept(email,'123456')]);assert.equal(h.authCalls.length,1);assert.equal(h.authCalls[0].type,'email');const writes=h.requests.filter(r=>r.method==='PATCH');assert.equal(writes.length,1);assert.equal(writes[0].headers.authorization,'Bearer synthetic-buyer');assert.deepEqual(writes[0].body,{id,action:'accept'});assert.equal(h.state().phase,'accepted');h.client.dispose();});
test('expired code cannot dispatch ownership acceptance',async()=>{const h=fixture({verify:async()=>({data:{session:null},error:{message:'expired'}})});await h.client.reload();await h.client.verifyAndAccept(email,'123456');assert.equal(h.requests.filter(r=>r.method==='PATCH').length,0);assert.match(h.state().message,/could not be verified/);h.client.dispose();});
test('invalid code is rejected before calling Auth',async()=>{const h=fixture();await h.client.reload();await h.client.verifyAndAccept(email,'123');assert.equal(h.authCalls.length,0);assert.match(h.state().message,/complete one-time code/);h.client.dispose();});
test('a signed-in recipient is never accepted by page load or auth events',async()=>{const h=fixture({session:buyer});await h.client.reload();h.event(buyer);await flush();assert.equal(h.state().canAccept,true);assert.equal(h.requests.filter(r=>r.method==='PATCH').length,0);await h.client.accept();assert.equal(h.requests.filter(r=>r.method==='PATCH').length,1);h.client.dispose();});
test('wrong recipient rejection never displays accepted ownership',async()=>{const h=fixture({fetch:request=>request.method==='PATCH'?Response.json({ok:false,message:'Wrong recipient'},{status:403}):Response.json({ok:true,requiresSignIn:true})});await h.client.reload();await h.client.verifyAndAccept(email,'123456');assert.notEqual(h.state().phase,'accepted');assert.match(h.state().message,/Wrong recipient/);h.client.dispose();});
test('account A-B-A changes while OTP verification is pending invalidate intent',async()=>{const pending=deferred();const h=fixture({verify:()=>pending.promise});await h.client.reload();const operation=h.client.verifyAndAccept(email,'123456');await flush();h.event(buyer);h.event(other);h.event(buyer);pending.resolve({data:{session:buyer},error:null});await operation;await flush();assert.equal(h.requests.filter(r=>r.method==='PATCH').length,0);h.client.dispose();});
test('unmount while verification is pending cannot accept or publish later',async()=>{const pending=deferred();const h=fixture({verify:()=>pending.promise});await h.client.reload();const operation=h.client.verifyAndAccept(email,'123456');await flush();h.client.dispose();const count=h.publishes();h.setSession(buyer);pending.resolve({data:{session:buyer},error:null});await operation;assert.equal(h.requests.filter(r=>r.method==='PATCH').length,0);assert.equal(h.publishes(),count);});
test('unconfirmed acceptance blocks repeated writes until saved status is read',async()=>{let writes=0;const h=fixture({session:buyer,fetch:request=>request.method==='PATCH'?(writes++,new Response('broken-json')):Response.json({ok:true,transfer:record})});await h.client.reload();await h.client.accept();assert.equal(h.state().uncertain,true);await h.client.accept();assert.equal(writes,1);await h.client.reload();assert.equal(h.state().uncertain,false);await h.client.accept();assert.equal(writes,2);h.client.dispose();});
test('a replacement account cannot receive the previous acceptance result',async()=>{const pending=deferred();const h=fixture({session:buyer,fetch:(request,session)=>request.method==='PATCH'?pending.promise:session?.user.email===email?Response.json({ok:true,transfer:record}):Response.json({ok:true,requiresSignIn:true})});await h.client.reload();const operation=h.client.accept();await flush();h.event(other);pending.resolve(Response.json({ok:true,transfer:{...record,status:'accepted'},ownsProfile:true}));await operation;await flush();assert.equal(h.state().transfer,null);assert.equal(h.state().phase,'email');h.client.dispose();});
test('already accepted invitation never replays ownership on load',async()=>{const h=fixture({session:buyer,fetch:()=>Response.json({ok:true,transfer:{...record,status:'accepted'},ownsProfile:true})});await h.client.reload();assert.equal(h.state().phase,'accepted');await h.client.accept();assert.equal(h.requests.filter(r=>r.method==='PATCH').length,0);h.client.dispose();});
test('resend holds its mutation lock and never changes ownership',async()=>{const pending=deferred();const h=fixture({send:()=>pending.promise});await h.client.reload();const a=h.client.requestCode(email),b=h.client.requestCode(email);await flush();assert.equal(h.authCalls.length,1);pending.resolve({error:null});await Promise.all([a,b]);assert.equal(h.requests.filter(r=>r.method==='PATCH').length,0);h.client.dispose();});
test('the previous owner is not presented as the accepting buyer',async()=>{const h=fixture({session:other,fetch:()=>Response.json({ok:true,transfer:{...record,status:'accepted'},ownsProfile:false})});await h.client.reload();assert.equal(h.state().phase,'completed');assert.equal(h.state().canAccept,false);assert.match(h.state().message,/managed by another owner/);h.client.dispose();});
test('accepted invitation after a later transfer does not claim current ownership',async()=>{const h=fixture({session:buyer,fetch:()=>Response.json({ok:true,transfer:{...record,status:'accepted'},ownsProfile:false})});await h.client.reload();assert.equal(h.state().phase,'completed');assert.equal(h.state().canAccept,false);assert.equal(h.requests.filter(r=>r.method==='PATCH').length,0);h.client.dispose();});
test('uncertain result is scoped to the account, allowing email recovery after logout',async()=>{const s=fixture({session:buyer,fetch:(request,session)=>request.method==='PATCH'?new Response('broken-json'):session?Response.json({ok:true,transfer:record}):Response.json({ok:true,requiresSignIn:true})});await s.client.reload();await s.client.accept();assert.equal(s.state().uncertain,true);s.event(null);await flush();assert.equal(s.state().phase,'email');assert.equal(s.state().uncertain,false);await s.client.requestCode(email);assert.equal(s.authCalls.length,1);s.client.dispose();});
test('newly verified buyer can check saved status after a definite conflict',async()=>{let cancelled=false;const h=fixture({fetch:(request,session)=>request.method==='PATCH'?Response.json({ok:false,message:'This handoff changed'},{status:409}):session?Response.json({ok:true,transfer:{...record,status:cancelled?'cancelled':'sent'}}):Response.json({ok:true,requiresSignIn:true})});await h.client.reload();await h.client.verifyAndAccept(email,'123456');assert.equal(h.state().phase,'email');assert.equal(h.state().signedIn,true);cancelled=true;await h.client.reload();assert.equal(h.state().phase,'unavailable');assert.equal(h.requests.filter(r=>r.method==='PATCH').length,1);h.client.dispose();});
test('logout during pending acceptance ends in the email recovery view',async()=>{const pending=deferred();const h=fixture({session:buyer,fetch:(request,session)=>request.method==='PATCH'?pending.promise:session?Response.json({ok:true,transfer:record}):Response.json({ok:true,requiresSignIn:true})});await h.client.reload();const operation=h.client.accept();await flush();h.event(null);pending.resolve(Response.json({ok:true,transfer:{...record,status:'accepted'},ownsProfile:true}));await operation;await flush();assert.equal(h.state().phase,'email');assert.equal(h.state().transfer,null);assert.equal(h.state().busy,false);h.client.dispose();});

test('receive renders the owner route for current accepted ownership, including a private public-QR destination', async () => {
  for (const reloadAccepted of [false, true]) {
    const h = fixture({session: buyer, fetch: request => Response.json({ok: true, transfer: {...record, status: reloadAccepted || request.method === 'PATCH' ? 'accepted' : 'sent'}, permanentPath: '/i/QRG-TEST', ownsProfile: true})});
    try {
      await h.client.reload();
      if (!reloadAccepted) await h.client.accept();
      assert.equal(h.state().phase, 'accepted');
      const html = renderActualReceive(h.state());
      assert.match(html, /href="\/dashboard\/profile\/QRG-TEST\?returnTo=%2Fdashboard">Open your Profile</);
      assert.doesNotMatch(html, /href="\/i\/QRG-TEST"/);
      assert.match(html, /href="\/dashboard">Your collection</);
      assert.equal(h.state().permanentPath, '/i/QRG-TEST', 'Canonical QR path must remain unchanged');
      assert.equal(h.requests.filter(r => r.method === 'PATCH').length, reloadAccepted ? 0 : 1);
    } finally {h.client.dispose();}
  }
});

test('receive renders no owner-open action for historical acceptance now managed by a later owner', async () => {
  for (const session of [buyer, other]) {
    const h = fixture({session, fetch: () => Response.json({ok: true, transfer: {...record, status: 'accepted'}, permanentPath: '/i/QRG-TEST', ownsProfile: false})});
    try {
      await h.client.reload();
      assert.equal(h.state().phase, 'completed');
      const html = renderActualReceive(h.state());
      assert.match(html, /Its story continues/);
      assert.match(html, /href="\/dashboard">Your collection</);
      assert.doesNotMatch(html, /Open your Profile|href="\/dashboard\/profile\/|href="\/i\/QRG-TEST"/);
      assert.equal(h.requests.filter(r => r.method === 'PATCH').length, 0);
      assert.equal(h.state().permanentPath, '/i/QRG-TEST');
    } finally {h.client.dispose();}
  }
});


test('cancelled receive explains the unavailable invitation and cannot offer acceptance', async () => {
  const h = fixture({session: buyer, fetch: () => Response.json({ok: true, transfer: {...record, status: 'cancelled'}})});
  try {
    await h.client.reload();
    assert.equal(h.state().phase, 'unavailable');
    const html = renderActualReceive(h.state());
    assert.match(html, /<p class="intro">This invitation is no longer available\. Ask the seller for a new one\.<\/p>/);
    assert.doesNotMatch(html, /Accept the seller’s invitation|Accept this Profile|Verify code and accept Profile/);
    assert.match(html, /Check invitation again/);
    assert.equal(h.requests.filter(r => r.method === 'PATCH').length, 0);
    assert.equal(h.authCalls.length, 0);
  } finally {h.client.dispose();}
});

for (const scenario of [
  {name: 'current accepted owner', status: 'accepted', ownsProfile: true, phase: 'accepted', connected: true},
  {name: 'historical completed handoff', status: 'accepted', ownsProfile: false, phase: 'completed', connected: true},
  {name: 'ready recipient', status: 'sent', phase: 'ready', connected: false},
  {name: 'anonymous invitation', anonymous: true, phase: 'email', connected: false}
]) test('receive preserves its existing intro for ' + scenario.name, async () => {
  const h = fixture(scenario.anonymous ? {} : {session: buyer, fetch: () => Response.json({ok: true, transfer: {...record, status: scenario.status}, ownsProfile: scenario.ownsProfile})});
  try {
    await h.client.reload();
    assert.equal(h.state().phase, scenario.phase);
    const html = renderActualReceive(h.state());
    const intro = html.match(/<p class="intro">([^<]*)<\/p>/)?.[1];
    assert.equal(intro, scenario.connected ? 'The instrument, its identity, and its documented history remain connected.' : 'Accept the seller’s invitation. Your photos, service records, and instrument history stay together through every ownership change.');
    assert.equal(h.requests.filter(r => r.method === 'PATCH').length, 0);
    assert.equal(h.authCalls.length, 0);
    if (scenario.anonymous) {
      assert.equal(h.state().transfer, null);
      assert.doesNotMatch(html, /Synthetic guitar|QRG-TEST|buyer@example.invalid/);
    }
  } finally {h.client.dispose();}
});
