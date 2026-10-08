// Executes real React 19 components with mocked native bridges. Device/layout acceptance is separate.
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require=createRequire(import.meta.url),React=require('react'),ts=require('typescript');
const rendererRequire=createRequire(require.resolve('react-test-renderer/package.json'));
const rendererModule={exports:{}};
new Function('require','module','exports',fs.readFileSync(path.join(path.dirname(rendererRequire.resolve('react-test-renderer/package.json')),'cjs/react-test-renderer.development.js'),'utf8'))(id=>id==='react'?React:rendererRequire(id),rendererModule,rendererModule.exports);
const Renderer=rendererModule.exports;
const {act}=React;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../src');
const mounted=new Set();
afterEach(async()=>{for(const view of mounted)await act(()=>view.unmount());mounted.clear();});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {resolve,reject,promise};};
async function render(Component,props={}){let view;await act(async()=>{view=Renderer.create(React.createElement(Component,props));await tick();});mounted.add(view);return view;}
async function flush(){await act(tick);}
async function invoke(fn,...args){await act(async()=>{fn(...args);await tick();});}
const action=(view,title)=>view.root.findAllByType('Action').find(x=>x.props.title===title);
const field=(view,label)=>view.root.findAllByType('Field').find(x=>x.props.label===label);
const notices=view=>view.root.findAllByType('Notice').map(x=>x.props.message).join(' ');
// Native bridge stubs expose visible labels as string props; never serialize embedded React elements/fibers.
const text=view=>{
 const parts=[];const visit=node=>{
  if(node==null)return;if(typeof node==='string'||typeof node==='number'){parts.push(String(node));return;}
  if(Array.isArray(node)){node.forEach(visit);return;}
  for(const key of ['title','copy','eyebrow','message','label','value','accessibilityLabel'])if(typeof node.props?.[key]==='string')parts.push(node.props[key]);
  visit(node.children);
 };visit(view.toJSON());return parts.join(' ');
};
function fixture(options={}){
 const events=new Set(),authListeners=new Set(),permissionListeners=new Set(),selectionListeners=new Map(),capturedSelectionCallbacks=[],nativeSelectionListeners=new Set(),nativeResults=new Map();
 const calls={signIn:[],signUp:[],create:[],save:[],discard:0,dispose:0,requestPermission:0,picker:0,pendingPicker:0,pickerRecover:[],pickerDiscard:[],nativeStarts:[],nativeReads:[],nativeAcks:[],nativeDiscards:[],links:[],profiles:[]};
 const stored=new Map(options.selectionIntent?[['qrguitar.android-photo-selection.v1',JSON.stringify(options.selectionIntent)]]:[]);
 const storage={getItem:async key=>stored.get(key)??null,setItem:async(key,value)=>{stored.set(key,value);},removeItem:async key=>{await options.removeSelection?.(key);stored.delete(key);}};
 const nativeModule={protocolVersion:1,
  startSelectionAsync:async(id,settings)=>{calls.nativeStarts.push({id,settings});const selected=options.nativeStart?await options.nativeStart(id,settings):options.picker?await options.picker():{canceled:true};const result=selected.status?selected:selected.canceled?{selectionId:id,status:'cancelled'}:{selectionId:id,status:'ready',resultId:'result-111111111111',photos:selected.assets.map(asset=>({id:asset.id||'native-photo-111111111111',dataUrl:'data:image/jpeg;base64,'+asset.base64}))};nativeResults.set(id,result);return result;},
  readSelectionAsync:async id=>{calls.nativeReads.push(id);return nativeResults.get(id)||{selectionId:id,status:'missing'};},
  acknowledgeSelectionAsync:async(id,resultId)=>{calls.nativeAcks.push({id,resultId});const result={selectionId:id,status:'acknowledged'};nativeResults.set(id,result);return result;},
  discardSelectionAsync:async id=>{calls.nativeDiscards.push(id);const result={selectionId:id,status:'discarded'};nativeResults.set(id,result);return result;},
  addListener(event,listener){assert.equal(event,'onSelectionChanged');nativeSelectionListeners.add(listener);return{remove(){nativeSelectionListeners.delete(listener);}};}};
 class SessionChanged extends Error{constructor(){super('Your account session changed.');}}
 let snapshot=options.snapshot||{status:'signed-in',session:{user:{id:'owner-111111111111',email:'owner@example.invalid',user_metadata:{display_name:'Owner'}}},revision:1,message:''};
 let permission=options.permission||{granted:false,canAskAgain:true};
 const appState={currentState:'active',addEventListener(_event,fn){events.add(fn);return {remove(){events.delete(fn);}};}};
 const alerts=[];
 const auth={getSnapshot:()=>snapshot,start:()=>()=>{},subscribe(fn){authListeners.add(fn);return()=>authListeners.delete(fn);},
  signIn:async(...args)=>{calls.signIn.push(args);return options.signIn?.(...args);},
  signUp:async(...args)=>{calls.signUp.push(args);return options.signUp?options.signUp(...args):{requiresEmailConfirmation:true};},
  signOut:async()=>{snapshot={...snapshot,status:'signed-out',session:null,revision:snapshot.revision+1};authListeners.forEach(fn=>fn(snapshot));},
  retry:async()=>{},acquireSession:async expected=>{if(snapshot.status!=='signed-in'||snapshot.session?.user.id!==expected)throw new SessionChanged();return {actorId:expected,revision:snapshot.revision,accessToken:'test-token'};},
  isCurrent:lease=>snapshot.status==='signed-in'&&snapshot.session?.user.id===lease.actorId&&snapshot.revision===lease.revision};
 let state={draft:options.draft||null,busy:false,error:''};const listeners=new Set();
 const emit=patch=>{state={...state,...patch};listeners.forEach(fn=>fn(state));};
 const draft={getState:()=>state,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},loadDraft:async()=>state.draft,
  saveDraft:async(input,photos)=>{calls.save.push([input,photos]);emit({busy:true});try{await options.saveDraft?.(input,photos);const next={actorId:snapshot.session?.user.id,input,photos,uploadId:state.draft?.uploadId||'upload-111111111111',idempotencyKey:state.draft?.idempotencyKey||'create-111111111111',lastPhotoSelectionId:state.draft?.lastPhotoSelectionId,frozenBody:null,uncertain:false,result:null};emit({draft:next});return next;}finally{emit({busy:false});}},
  applyPhotoSelection:async(selectionId,target,photos)=>{if(state.draft?.lastPhotoSelectionId===selectionId)return state.draft;if(!state.draft||state.draft.actorId!==target.actorId||state.draft.uploadId!==target.uploadId||state.draft.idempotencyKey!==target.idempotencyKey||state.draft.frozenBody)throw Error('Stale selection');const saved=await draft.saveDraft(state.draft.input,[...state.draft.photos,...photos]);const next={...saved,lastPhotoSelectionId:selectionId};emit({draft:next});return next;},
  createOrRetry:async(...args)=>{calls.create.push(args);emit({busy:true});try{return options.create?await options.create(...args):{qrCode:'QRG-NEW123',permanentPath:'/i/QRG-NEW123',message:'Saved'};}finally{emit({busy:false});}},
  discardDraft:async()=>{calls.discard++;emit({draft:null});},dispose:()=>{calls.dispose++;listeners.clear();}};
 const requestPermission=async()=>{calls.requestPermission++;permission=options.requestPermission?await options.requestPermission():{granted:false,canAskAgain:false};permissionListeners.forEach(fn=>fn(permission));return permission;};
 const getPermission=async()=>permission;
 const api={listPublic:async()=>[],listMine:async()=>[],readPublic:async()=>options.record,readMine:async()=>options.record,...options.api};
 const bridge={AppState:appState,Platform:{OS:options.platform||'android'},Alert:{alert:(...args)=>alerts.push(args)},Linking:{openURL:async url=>{calls.links.push(url);return options.openURL?.(url);},openSettings:async()=>calls.links.push('settings'),getInitialURL:async()=>options.initialUrl||null,addEventListener:()=>({remove(){}})},BackHandler:{addEventListener:()=>{calls.backHandlers=(calls.backHandlers||0)+1;return{remove(){}};}},Share:{share:async()=>{}},StyleSheet:{create:x=>x,absoluteFill:{position:'absolute'}}};
 for(const name of ['ActivityIndicator','KeyboardAvoidingView','Modal','Pressable','RefreshControl','ScrollView','Switch','Text','View'])bridge[name]=name;
 const mocks={'react':React,'react-native':bridge,'react-native-safe-area-context':{SafeAreaProvider:'SafeAreaProvider',SafeAreaView:'SafeAreaView'},'expo-status-bar':{StatusBar:'StatusBar'},'expo-image':{Image:'Image'},
  'expo-image-picker':{launchImageLibraryAsync:async()=>{calls.picker++;return options.picker?options.picker():{canceled:true};},getPendingResultAsync:async()=>{calls.pendingPicker++;return options.pendingPicker?options.pendingPicker():null;}},
  'qrguitar-photo-picker':{__esModule:true,default:options.nativeModuleAvailable===false?null:nativeModule},
  'expo-crypto':{randomUUID:require('node:crypto').randomUUID},
  'expo-camera':{CameraView:'CameraView',useCameraPermissions(){const [p,set]=React.useState(permission);React.useEffect(()=>{permissionListeners.add(set);return()=>permissionListeners.delete(set);},[]);return [p,requestPermission,getPermission];}},
  'auth':{getNativeAuth:()=>auth,getNativeStorage:()=>storage,NativeSessionChangedError:SessionChanged},'api':{getNativeApi:()=>api,safeNativeImageUrl:value=>typeof value==='string'&&value.startsWith('https://')?value:null},
  'profile-draft':{createProfileDraftController:()=>draft,photoFromPickerAsset:asset=>({id:asset.id||'photo-111111111111',dataUrl:'data:image/jpeg;base64,'+asset.base64}),validatePartialNativeProfile(){},MAX_NATIVE_PHOTOS:8,MAX_NATIVE_IMAGE_BYTES:12*1024*1024},
  'ui':{Action:'Action',Field:'Field',Heading:'Heading',Notice:'Notice',colors:{gold:'gold',background:'black'},styles:{}}};
 const cache=new Map();
 function load(file){
  if(cache.has(file))return cache.get(file);let source=fs.readFileSync(path.join(base,file),'utf8');
  if(file==='App.tsx')source+='\nexport {Browse,Login,Create,Profile,Photo,useResource,OwnedRecords,Library,openWeb};';
  const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
  const module={exports:{}};cache.set(file,module.exports);
  const scopedRequire=id=>{if(mocks[id])return mocks[id];const key=id.split('/').at(-1);if(mocks[key])return mocks[key];if(id.startsWith('.')){const candidate=path.posix.normalize(path.posix.join(path.posix.dirname(file),id));return load(fs.existsSync(path.join(base,candidate+'.tsx'))?candidate+'.tsx':candidate+'.ts');}return require(id);};
  new Function('require','module','exports',output)(scopedRequire,module,module.exports);cache.set(file,module.exports);return module.exports;
 }
 // Core tests exercise real coordinator/native receipts. These component cases
 // inject event scheduling independently of the native activity implementation.
 const pickerModule=options.photoCoordinator?null:load('lib/photo-picker.ts');
 mocks['photo-picker']={getNativePhotoPicker(){
  const backing=options.photoCoordinator||pickerModule.getNativePhotoPicker();
  return {pick:(...args)=>backing.pick(...args),discard:async(...args)=>{calls.pickerDiscard.push(args[0]);return backing.discard?.(...args);},
   recover:async(...args)=>{calls.pickerRecover.push(args[0]);return backing.recover?.(...args)??null;},
   subscribe(actor,listener){selectionListeners.set(listener,actor);capturedSelectionCallbacks.push(listener);const unsubscribe=options.photoCoordinator?()=>{}:backing.subscribe(actor,listener);return()=>{selectionListeners.delete(listener);unsubscribe();};}};
 }};
 return {App:load('App.tsx'),Scanner:load('components/Scanner.tsx').Scanner,helpers:load('lib/ui-actions.ts'),calls,alerts,draft,emit,auth,stored,capturedSelectionCallbacks,
  notifySelection(actor='owner-111111111111'){for(const [listener,owner] of selectionListeners)if(owner===actor)listener();},
  deliverNative(result){nativeResults.set(result.selectionId,result);nativeSelectionListeners.forEach(listener=>listener({selectionId:result.selectionId,status:result.status}));},
  selectionListenerCount:()=>selectionListeners.size,
  async background(value){appState.currentState=value;await invoke(()=>events.forEach(fn=>fn(value)));},
  async changeAccount(next){snapshot=next;await invoke(()=>authListeners.forEach(fn=>fn(snapshot)));},
  async setPermission(next){permission=next;await invoke(()=>permissionListeners.forEach(fn=>fn(next)));},
  createProps:{actorId:'owner-111111111111',displayName:'Owner',onCreated:code=>calls.profiles.push(code),leaveGuardRef:{current:null}}};
}
test('renderer uses precisely the mobile React runtime',()=>{assert.equal(React.version,'19.2.3');assert.equal(Renderer.version,React.version);});

test('Browse exposes a failed catalog load and retry recovers to an empty catalog',async()=>{
 let attempts=0;
 const f=fixture({api:{listPublic:async()=>{attempts++;if(attempts===1)throw Error('QRguitar could not be reached. Check your connection and try again.');return [];}}});
 const view=await render(f.App.Browse,{onOpen(){},onScan(){},onCreate(){}});
 assert.equal(attempts,1);assert.match(notices(view),/QRguitar could not be reached\. Check your connection and try again\./);assert.ok(action(view,'Retry Catalog'));
 await invoke(action(view,'Retry Catalog').props.onPress);assert.equal(attempts,2);assert.equal(action(view,'Retry Catalog'),undefined);assert.match(text(view),/The Catalog is quiet for now/);
});

const librarySnapshot=(id='owner-111111111111')=>({status:'signed-in',session:{user:{id,email:id+'@example.invalid'},access_token:'PRIVATE_ACCESS',refresh_token:'PRIVATE_REFRESH'},revision:1,message:''});
const libraryProps=snapshot=>({snapshot,onSignIn(){},onCreate(){},onOpen(){},onSignOut(){}});

test('signed-in Library exposes deletion review before the instrument collection with accurate browser guidance',async()=>{
 const f=fixture(),view=await render(f.App.Library,libraryProps(librarySnapshot()));
 assert.ok(action(view,'Request account deletion'));
 const copy=text(view),requestIndex=copy.indexOf('Request account deletion');
 assert.ok(requestIndex<copy.indexOf('Your collection')||requestIndex<copy.indexOf('0 Profiles'));
 assert.match(copy,/permanent instrument history/);assert.match(copy,/website may ask you to sign in/);assert.match(copy,/use the account you want reviewed/);
 assert.match(copy,/does not delete your account or personal information/);assert.deepEqual(f.calls.links,[]);
});

test('deletion-review entry opens only the privacy URL without credentials or native mutations',async()=>{
 const f=fixture(),view=await render(f.App.Library,libraryProps(librarySnapshot()));
 await invoke(action(view,'Request account deletion').props.onPress);
 assert.deepEqual(f.calls.links,['https://qrguitar.com/account?section=privacy']);assert.doesNotMatch(f.calls.links[0],/PRIVATE|token|email|owner-/);
 assert.deepEqual(f.calls.signIn,[]);assert.deepEqual(f.calls.signUp,[]);assert.deepEqual(f.calls.create,[]);assert.deepEqual(f.calls.save,[]);assert.equal(f.calls.discard,0);assert.equal(f.alerts.length,0);
});

test('signed-out loading auth-error and unconfigured Library states do not expose an account request action',async()=>{
 for(const status of ['signed-out','loading','error','unconfigured']){
  const f=fixture(),view=await render(f.App.Library,libraryProps({status,session:null,revision:1,message:'Session check unavailable'}));
  assert.equal(action(view,'Request account deletion'),undefined);assert.deepEqual(f.calls.links,[]);
 }
});

test('sign-out removes the visible request entry and another actor gets the same credential-free destination',async()=>{
 const f=fixture(),view=await render(f.App.Library,libraryProps(librarySnapshot()));
 await update(view,f.App.Library,libraryProps({status:'signed-out',session:null,revision:2,message:''}));assert.equal(action(view,'Request account deletion'),undefined);
 await update(view,f.App.Library,libraryProps(librarySnapshot('different-owner')));await invoke(action(view,'Request account deletion').props.onPress);
 assert.deepEqual(f.calls.links,['https://qrguitar.com/account?section=privacy']);
});

test('browser launch rejection is caught without claiming request receipt or erasure',async()=>{
 const f=fixture({openURL:async()=>{throw Error('Browser could not open');}}),view=await render(f.App.Library,libraryProps(librarySnapshot()));
 await invoke(action(view,'Request account deletion').props.onPress);
 assert.deepEqual(f.calls.links,['https://qrguitar.com/account?section=privacy']);assert.equal(f.alerts.length,1);assert.equal(f.alerts[0][0],'Link unavailable');assert.equal(f.alerts[0][1],'Browser could not open');
 assert.doesNotMatch(text(view),/Request received|Request submitted|Account deleted|Deletion completed/);assert.deepEqual(f.calls.create,[]);
});

test('Account Create and sign-out controls remain usable beside deletion review',async()=>{
 let signedOut=0,created=0;const f=fixture(),view=await render(f.App.Library,{...libraryProps(librarySnapshot()),onSignOut(){signedOut++;},onCreate(){created++;}});
 await invoke(action(view,'Account').props.onPress);await invoke(action(view,'Create Profile').props.onPress);await invoke(action(view,'Sign out').props.onPress);
 assert.deepEqual(f.calls.links,['https://qrguitar.com/account']);assert.equal(signedOut,1);assert.equal(created,1);
});

test('web links retain previous allowed routes and accept the exact privacy-section route',async()=>{
 const f=fixture(),paths=['/login','/login?mode=register','/login?mode=reset','/account','/dashboard','/create','/catalog','/privacy','/terms','/edit/QRG-ABC123','/handout/QRG-ABC123','/account?section=privacy'];
 for(const value of paths)await f.App.openWeb(value);
 assert.deepEqual(f.calls.links,paths.map(value=>'https://qrguitar.com'+value));
});

test('web links reject other sections credentials redirects fragments and encoded lookalikes before Linking',async()=>{
 const f=fixture();
 for(const value of ['/account?section=billing','/account?section=Privacy','/account?section=privacy&access_token=SECRET','/account?access_token=SECRET&section=privacy','/account?section=privacy#token','/account?section=privacy/','/account?section=privacy&next=https://evil.invalid','/account?section=privacy&section=privacy','/account?section=%70rivacy','/account/?section=privacy','/account%3Fsection%3Dprivacy','//evil.invalid/account?section=privacy','https://evil.invalid/account?section=privacy','https://qrguitar.com/account?section=privacy','/privacy?section=privacy','/dashboard?section=privacy','/login?mode=register&token=SECRET'])await assert.rejects(f.App.openWeb(value),/link is unavailable/);
 assert.deepEqual(f.calls.links,[]);
});
test('scanner does not request camera on mount and manual URL opens only the permanent identity',async()=>{
 const f=fixture(),v=await render(f.Scanner,{onProfile:code=>f.calls.profiles.push(code)});assert.equal(f.calls.requestPermission,0);
 await invoke(field(v,'QRguitar ID or Profile link').props.onChangeText,'https://qrguitar.com/i/QRG-ABC123?ignored=yes#photo');
 await invoke(action(v,'Open Profile').props.onPress);assert.deepEqual(f.calls.profiles,['QRG-ABC123']);assert.deepEqual(f.calls.links,[]);
});
test('scanner ignores repeated camera events and lets a rejected scan rearm',async()=>{
 const f=fixture({permission:{granted:true,canAskAgain:true}}),v=await render(f.Scanner,{onProfile:code=>f.calls.profiles.push(code)});
 const scan=v.root.findByType('CameraView').props.onBarcodeScanned;await invoke(()=>{scan({data:'https://evil.invalid/i/QRG-ABC123'});scan({data:'QRG-ABC123'});});assert.equal(f.calls.profiles.length,0);assert.match(notices(v),/not a QRguitar/);
 await invoke(action(v,'Scan again').props.onPress);const valid=v.root.findByType('CameraView').props.onBarcodeScanned;
 await invoke(()=>{valid({data:'QRG-ABC123'});valid({data:'QRG-OTHER'});});assert.deepEqual(f.calls.profiles,['QRG-ABC123']);
});
test('denied camera still has manual entry and explicit settings fallback',async()=>{
 const f=fixture(),v=await render(f.Scanner,{onProfile:()=>{}});await invoke(action(v,'Enable camera').props.onPress);
 assert.match(notices(v),/not granted/);assert.ok(field(v,'QRguitar ID or Profile link'));await invoke(action(v,'Open device settings').props.onPress);assert.deepEqual(f.calls.links,['settings']);
});
test('camera leaves the native tree in background and returns only when active',async()=>{
 const f=fixture({permission:{granted:true,canAskAgain:true}}),v=await render(f.Scanner,{onProfile:()=>{}});
 assert.equal(v.root.findAllByType('CameraView').length,1);await f.background('background');assert.equal(v.root.findAllByType('CameraView').length,0);
 await f.background('active');assert.equal(v.root.findAllByType('CameraView').length,1);
 await invoke(v.root.findByType('CameraView').props.onMountError);assert.equal(v.root.findAllByType('CameraView').length,0);assert.match(notices(v),/could not start/);
});
test('login validates and suppresses a second submission until first resolves',async()=>{
 const pending=deferred(),f=fixture({signIn:()=>pending.promise}),v=await render(f.App.Login);
 await invoke(action(v,'Sign in').props.onPress);assert.equal(f.calls.signIn.length,0);
 await invoke(field(v,'Email').props.onChangeText,'owner@example.invalid');await invoke(field(v,'Password').props.onChangeText,'password123');
 const submit=v.root.findAllByType('Action').filter(x=>x.props.title==='Sign in').at(-1).props.onPress;await invoke(()=>{submit();submit();});
 assert.equal(f.calls.signIn.length,1);assert.equal(field(v,'Password').props.editable,false);pending.resolve();await flush();assert.equal(field(v,'Password').props.editable,true);
});
test('registration requires consent and reports confirmation without pretending to sign in',async()=>{
 const f=fixture(),v=await render(f.App.Login);await invoke(action(v,'Create account').props.onPress);
 await invoke(field(v,'Display name').props.onChangeText,'Owner');await invoke(field(v,'Email').props.onChangeText,'owner@example.invalid');await invoke(field(v,'Password').props.onChangeText,'password123');
 const submit=()=>v.root.findAllByType('Action').filter(x=>x.props.title==='Create account').at(-1).props.onPress;
 await invoke(submit());assert.equal(f.calls.signUp.length,0);assert.match(notices(v),/accept the Terms/);
 await invoke(v.root.findByType('Switch').props.onValueChange,true);await invoke(submit());assert.equal(f.calls.signUp.length,1);assert.match(notices(v),/Check your email/);assert.equal(field(v,'Password').props.value,'');assert.equal(f.calls.signIn.length,0);
});

const draftInput=(extra={})=>({brand:'Fender',model:'Stratocaster',serial:'',serialNotUsed:true,instrumentType:'Guitar',year:'',condition:'used',visibility:'private',showSerialPublic:false,location:'',summary:'',ownerName:'Owner',...extra});
const selectedPhoto={id:'photo-111111111111',dataUrl:'data:image/jpeg;base64,cGhvdG8='};
const savedDraft=(extra={})=>({actorId:'owner-111111111111',input:draftInput(),photos:[selectedPhoto],uploadId:'upload-111111111111',idempotencyKey:'create-111111111111',frozenBody:null,uncertain:false,result:null,...extra});
const record=(extra={})=>({qrCode:'QRG-ABC123',name:'Private instrument',brand:'Fender',model:'Stratocaster',serial:'PRIVATE-SERIAL-42',visibility:'private',heroImageDataUrl:'https://synthetic.supabase.co/private-image.jpg',galleryImageDataUrls:[],...extra});
const submitAction=(view,title)=>view.root.findAllByType('Action').filter(node=>node.props.title===title).at(-1);
async function elapse(ms){await act(async()=>{await new Promise(resolve=>setTimeout(resolve,ms));await tick();});}
async function update(view,Component,props){await act(async()=>{view.update(React.createElement(Component,props));await tick();});}
async function unmount(view){await act(()=>view.unmount());mounted.delete(view);}

test('leaving Create saves a partial draft before changing the actual root route',async()=>{
 const pending=deferred(),f=fixture({saveDraft:()=>pending.promise}),v=await render(f.App.default);
 await invoke(action(v,'Create Profile').props.onPress);await invoke(field(v,'Brand').props.onChangeText,'Partial brand');
 const destination=v.root.findAllByType('Pressable').filter(node=>node.props.accessibilityRole==='tab')[2];
 await invoke(destination.props.onPress);assert.equal(f.calls.save.length,1);assert.equal(f.calls.save[0][0].brand,'Partial brand');assert.equal(f.calls.save[0][0].model,'');assert.deepEqual(f.calls.save[0][1],[]);
 assert.ok(field(v,'Brand'));assert.equal(field(v,'Brand').props.editable,false);assert.equal(f.calls.dispose,0);
 pending.resolve();await flush();assert.equal(field(v,'Brand'),undefined);assert.equal(f.calls.dispose,1);assert.equal(f.calls.create.length,0);assert.match(text(v),/Your instruments/);
});
test('Create waits for a busy controller and ignores a double tap while awaiting confirmation',async()=>{
 const pending=deferred(),f=fixture({draft:savedDraft(),create:()=>pending.promise}),v=await render(f.App.Create,f.createProps);
 await invoke(()=>f.emit({busy:true}));const save=action(v,'Create Profile').props.onPress;
 await invoke(()=>{save();save();});assert.equal(f.calls.create.length,0);assert.equal(field(v,'Brand').props.editable,false);
 await invoke(()=>f.emit({busy:false}));assert.equal(f.calls.create.length,1);assert.equal(f.calls.create[0].length,2);assert.equal(f.calls.create[0][0].brand,'Fender');
 pending.resolve({qrCode:'QRG-CONFIRMED',message:'Saved'});await flush();assert.deepEqual(f.calls.profiles,['QRG-CONFIRMED']);
});
test('uncertain Create retries with no replacement input or photos',async()=>{
 const original=savedDraft({frozenBody:{name:'Exact saved request'},uncertain:true}),f=fixture({draft:original}),v=await render(f.App.Create,f.createProps);
 assert.equal(field(v,'Brand').props.editable,false);assert.equal(action(v,'Choose photos').props.disabled,true);assert.equal(action(v,'Discard draft').props.disabled,true);
 await invoke(action(v,'Retry the same save').props.onPress);assert.deepEqual(f.calls.create,[[]]);assert.deepEqual(f.calls.save,[]);
});
test('confirmed draft starts another only after pending work finishes and preserves the saved result',async()=>{
 const original=savedDraft({frozenBody:{name:'Committed'},result:{qrCode:'QRG-SAVED123',message:'Confirmed'}}),f=fixture({draft:original}),v=await render(f.App.Create,f.createProps);
 await invoke(()=>f.emit({busy:true}));const start=action(v,'Start another Profile').props.onPress;await invoke(()=>{start();start();});assert.equal(f.calls.discard,0);assert.equal(action(v,'Start another Profile').props.loading,true);
 await invoke(()=>f.emit({busy:false}));assert.equal(f.calls.discard,1);assert.equal(field(v,'Brand').props.value,'');assert.equal(v.root.findAllByType('Image').length,0);assert.equal(original.result.qrCode,'QRG-SAVED123');assert.equal(f.calls.create.length,0);
});
test('confirmed Discard waits for busy draft work and suppresses a repeated confirmation',async()=>{
 const f=fixture({draft:savedDraft()}),v=await render(f.App.Create,f.createProps);await invoke(()=>f.emit({busy:true}));await invoke(action(v,'Discard draft').props.onPress);
 const discard=f.alerts.at(-1)[2].find(button=>button.text==='Discard').onPress;await invoke(()=>{discard();discard();});assert.equal(f.calls.discard,0);assert.equal(field(v,'Brand').props.editable,false);
 await invoke(()=>f.emit({busy:false}));assert.equal(f.calls.discard,1);assert.equal(field(v,'Brand').props.value,'');assert.equal(v.root.findAllByType('Image').length,0);
});
test('a slow autosave cannot overwrite the next edit and the next edit saves after idle',async()=>{
 const first=deferred(),f=fixture({saveDraft:input=>input.brand==='First edit'?first.promise:undefined}),v=await render(f.App.Create,f.createProps);
 await invoke(field(v,'Brand').props.onChangeText,'First edit');await elapse(650);assert.equal(f.calls.save.length,1);assert.equal(f.draft.getState().busy,true);
 await invoke(field(v,'Brand').props.onChangeText,'Second edit');await elapse(650);assert.equal(f.calls.save.length,1);assert.equal(field(v,'Brand').props.value,'Second edit');
 first.resolve();await flush();assert.equal(f.calls.save.length,2);assert.equal(f.calls.save[1][0].brand,'Second edit');assert.equal(f.draft.getState().draft.input.brand,'Second edit');assert.equal(field(v,'Brand').props.value,'Second edit');
});
test('leave guard locks editing immediately and saves the latest immutable snapshot',async()=>{
 const pending=deferred(),f=fixture({draft:savedDraft(),saveDraft:()=>pending.promise}),v=await render(f.App.Create,f.createProps);
 await invoke(field(v,'Brand').props.onChangeText,'Before navigation');const staleChange=field(v,'Brand').props.onChangeText;let leaving;
 await invoke(()=>{leaving=f.createProps.leaveGuardRef.current();staleChange('Blocked edit');});assert.equal(field(v,'Brand').props.editable,false);assert.equal(field(v,'Brand').props.value,'Before navigation');assert.equal(f.calls.save[0][0].brand,'Before navigation');
 pending.resolve();await act(async()=>{await leaving;await tick();});assert.equal(field(v,'Brand').props.editable,true);
});
test('submit and leave guard serialize while an earlier autosave holds the controller busy',async()=>{
 const upload=deferred(),f=fixture({draft:savedDraft(),create:async()=>{await upload.promise;const result={qrCode:'QRG-QUEUE123',message:'Saved'};f.emit({draft:savedDraft({frozenBody:{exact:true},result})});return result;}}),v=await render(f.App.Create,f.createProps);
 await invoke(()=>f.emit({busy:true}));let leaving,finished=false;const save=action(v,'Create Profile').props.onPress;
 await invoke(()=>{save();leaving=f.createProps.leaveGuardRef.current().then(()=>{finished=true;});});assert.equal(f.calls.create.length,0);assert.equal(f.calls.save.length,0);assert.equal(finished,false);
 await invoke(()=>f.emit({busy:false}));assert.equal(f.calls.create.length,1);assert.equal(f.calls.save.length,0);assert.equal(finished,false);assert.equal(field(v,'Brand').props.editable,false);
 await invoke(save);assert.equal(f.calls.create.length,1);upload.resolve();await act(async()=>{await leaving;await tick();});assert.equal(finished,true);assert.equal(f.calls.save.length,0);assert.deepEqual(f.calls.profiles,['QRG-QUEUE123']);
});
test('photo picker cancellation keeps existing photos and double taps launch only once',async()=>{
 const pending=deferred(),f=fixture({draft:savedDraft(),picker:()=>pending.promise}),v=await render(f.App.Create,f.createProps);const choose=action(v,'Choose photos').props.onPress;
 await invoke(()=>{choose();choose();});assert.equal(f.calls.nativeStarts.length,1);assert.equal(f.calls.picker,0);assert.equal(action(v,'Choose photos').props.loading,true);assert.equal(action(v,'Create Profile').props.disabled,true);
 pending.resolve({canceled:true});await flush();assert.equal(action(v,'Choose photos').props.loading,false);assert.equal(v.root.findAllByType('Image').length,1);assert.equal(notices(v),'');assert.equal(f.calls.create.length,0);
});
test('photo picker results arriving after unmount cannot save or create a draft',async()=>{
 const pending=deferred(),f=fixture({picker:()=>pending.promise}),v=await render(f.App.Create,f.createProps);
 await invoke(action(v,'Choose photos').props.onPress);await unmount(v);assert.equal(f.calls.dispose,1);assert.equal(f.createProps.leaveGuardRef.current,null);
 const before=f.calls.save.length;pending.resolve({canceled:false,assets:[{id:'photo-late-123',base64:'bGF0ZQ=='}]});await flush();assert.ok(before>=1);assert.equal(f.calls.save.length,before);assert.equal(f.calls.create.length,0);assert.equal(f.calls.nativeStarts.length,1);assert.equal(f.calls.picker,0);
});

const pendingSelection=(draft=savedDraft(),extra={})=>({version:1,selectionId:'selection-111111111111',actorId:draft.actorId,uploadId:draft.uploadId,idempotencyKey:draft.idempotencyKey,photoIds:draft.photos.map(photo=>photo.id),...extra});
const recoveredPhoto=()=>({canceled:false,assets:[{id:'recovered-111111111111',base64:'cGhvdG8='}]});
test('restored Android Create attaches the pending original selection once without launching or submitting',async()=>{
 const f=fixture({draft:savedDraft(),selectionIntent:pendingSelection(),pendingPicker:async()=>recoveredPhoto()}),v=await render(f.App.Create,f.createProps);
 assert.equal(v.root.findAllByType('Image').length,2);assert.equal(f.calls.pendingPicker,1);assert.equal(f.calls.picker,0);assert.equal(f.calls.nativeStarts.length,0);assert.equal(f.calls.create.length,0);assert.equal(f.stored.size,0);
 await f.background('active');assert.equal(v.root.findAllByType('Image').length,2);assert.equal(f.calls.pendingPicker,1);
});
test('pending picker error preserves saved draft and restore retry works without opening another picker',async()=>{
 const f=fixture({draft:savedDraft(),selectionIntent:pendingSelection(),pendingPicker:async()=>({code:'ERR_PICKER',message:'private platform detail'})}),v=await render(f.App.Create,f.createProps);
 assert.match(text(v),/choose the photos again/);assert.doesNotMatch(text(v),/private platform/);assert.equal(f.calls.create.length,0);
 await invoke(action(v,'Try restoring again').props.onPress);assert.equal(field(v,'Brand').props.value,'Fender');assert.equal(v.root.findAllByType('Image').length,1);assert.equal(f.calls.picker,0);
});
test('explicit pending-selection discard resolves stale draft quarantine without deleting draft or creating Profile',async()=>{
 const f=fixture({draft:savedDraft(),selectionIntent:pendingSelection(undefined,{uploadId:'earlier-upload-111111111'}),pendingPicker:async()=>({canceled:true,assets:null})}),v=await render(f.App.Create,f.createProps);
 assert.match(text(v),/earlier or saved draft/);await invoke(action(v,'Discard pending photo selection').props.onPress);assert.equal(f.stored.size,1);
 await invoke(f.alerts.at(-1)[2].find(button=>button.text==='Discard selection').onPress);
 assert.equal(f.stored.size,0);assert.equal(field(v,'Brand').props.value,'Fender');assert.equal(v.root.findAllByType('Image').length,1);assert.equal(f.calls.discard,0);assert.equal(f.calls.create.length,0);
});
test('foreground recovery keeps local edits made before the autosave timer',async()=>{
 const f=fixture({draft:savedDraft(),pendingPicker:async()=>recoveredPhoto()}),v=await render(f.App.Create,f.createProps);
 await invoke(field(v,'Brand').props.onChangeText,'Edited before background');f.stored.set('qrguitar.android-photo-selection.v1',JSON.stringify(pendingSelection()));
 await f.background('active');assert.equal(field(v,'Brand').props.value,'Edited before background');assert.equal(v.root.findAllByType('Image').length,2);assert.equal(f.draft.getState().draft.input.brand,'Edited before background');assert.equal(f.calls.create.length,0);
});

test('foreground before first autosave persists a fresh partial form',async()=>{
 const f=fixture(),v=await render(f.App.Create,f.createProps);
 await invoke(field(v,'Brand').props.onChangeText,'Fresh partial form');assert.equal(f.draft.getState().draft,null);
 await f.background('active');assert.equal(f.calls.save.length,1);assert.equal(f.draft.getState().draft.input.brand,'Fresh partial form');assert.equal(field(v,'Brand').props.value,'Fresh partial form');assert.equal(f.calls.create.length,0);
});

test('discarding pending photos preserves edits made before autosave and never discards the draft',async()=>{
 const f=fixture({draft:savedDraft(),pendingPicker:async()=>({canceled:true,assets:null})}),v=await render(f.App.Create,f.createProps);
 f.stored.set('qrguitar.android-photo-selection.v1',JSON.stringify(pendingSelection(undefined,{uploadId:'earlier-upload-111111111'})));
 await invoke(action(v,'Choose photos').props.onPress);assert.match(notices(v),/earlier or saved draft/);
 await invoke(action(v,'Discard pending photo selection').props.onPress);
 await invoke(field(v,'Brand').props.onChangeText,'Edit before discard confirmation');
 await invoke(f.alerts.at(-1)[2].find(button=>button.text==='Discard selection').onPress);
 assert.equal(field(v,'Brand').props.value,'Edit before discard confirmation');assert.equal(f.draft.getState().draft.input.brand,'Edit before discard confirmation');assert.equal(v.root.findAllByType('Image').length,1);assert.equal(f.calls.discard,0);assert.equal(f.calls.create.length,0);
});

test('picker cleanup retry preserves a fresh edit and cannot duplicate already-applied photos',async()=>{
 let fail=true;const f=fixture({draft:savedDraft(),picker:async()=>recoveredPhoto(),removeSelection:async()=>{if(fail){fail=false;throw Error('storage temporarily unavailable');}}}),v=await render(f.App.Create,f.createProps);
 await invoke(action(v,'Choose photos').props.onPress);assert.equal(v.root.findAllByType('Image').length,2);assert.equal(f.stored.size,1);
 await invoke(field(v,'Brand').props.onChangeText,'Edited after receipt');await invoke(action(v,'Choose photos').props.onPress);
 assert.equal(field(v,'Brand').props.value,'Edited after receipt');assert.equal(f.draft.getState().draft.input.brand,'Edited after receipt');assert.equal(v.root.findAllByType('Image').length,2);assert.equal(f.calls.nativeStarts.length,1);assert.equal(f.calls.picker,0);assert.equal(f.stored.size,0);assert.equal(f.calls.create.length,0);
});

test('previous-account anonymous selection stays private while the current actor uses only the identified channel',async()=>{
 const intent=pendingSelection(undefined,{actorId:'previous-111111111111'}),f=fixture({draft:savedDraft(),selectionIntent:intent}),v=await render(f.App.Create,f.createProps);
 await invoke(action(v,'Choose photos').props.onPress);assert.equal(notices(v),'');assert.equal(f.calls.pendingPicker,0);assert.equal(f.calls.picker,0);assert.equal(f.calls.nativeStarts.length,1);assert.equal(v.root.findAllByType('Image').length,1);
 assert.equal(action(v,'Discard pending photo selection'),undefined);
 assert.equal(JSON.parse(f.stored.get('qrguitar.android-photo-selection.v1')).actorId,intent.actorId);assert.equal(f.calls.pendingPicker,0);
});
test('web keeps the picker launch in the original user gesture and does not inspect Android pending results',async()=>{
 const f=fixture({platform:'web'}),v=await render(f.App.Create,f.createProps);let immediate;
 await invoke(()=>{action(v,'Choose photos').props.onPress();immediate=f.calls.picker;});assert.equal(immediate,1);assert.equal(f.calls.pendingPicker,0);assert.equal(f.calls.save.length,0);
});

const eventPhoto={id:'event-photo-111111111111',dataUrl:'data:image/jpeg;base64,ZXZlbnQ='};
const addEventPhoto=controller=>controller.saveDraft(controller.getState().draft.input,[...controller.getState().draft.photos,eventPhoto]);

test('actual Android facade launches an identified request and filters native completion events before applying and acknowledging',async()=>{
 const f=fixture({draft:savedDraft(),nativeStart:async id=>({selectionId:id,status:'pending'})}),v=await render(f.App.Create,f.createProps);
 await invoke(action(v,'Choose photos').props.onPress);assert.equal(f.calls.nativeStarts.length,1);assert.equal(f.calls.picker,0);assert.equal(f.calls.pendingPicker,0);
 const start=f.calls.nativeStarts[0],marker=JSON.parse(f.stored.get('qrguitar.android-photo-selection.v2.'+f.createProps.actorId));
 assert.equal(marker.selectionId,start.id);assert.equal(start.settings.maxAssets,7);assert.equal(marker.actorId,f.createProps.actorId);
 await invoke(()=>f.deliverNative({selectionId:'foreign-request-111111111111',status:'ready',resultId:'foreign-result-111111111111',photos:[eventPhoto]}));
 assert.equal(f.calls.nativeReads.length,0);assert.equal(v.root.findAllByType('Image').length,1);
 await invoke(()=>{field(v,'Brand').props.onChangeText('Latest native event edit');f.deliverNative({selectionId:start.id,status:'ready',resultId:'matching-result-111111111111',photos:[eventPhoto]});});
 assert.deepEqual(f.calls.nativeReads,[start.id]);assert.deepEqual(f.calls.nativeAcks,[{id:start.id,resultId:'matching-result-111111111111'}]);
 assert.equal(v.root.findAllByType('Image').length,2);assert.equal(field(v,'Brand').props.value,'Latest native event edit');assert.equal(f.draft.getState().draft.lastPhotoSelectionId,start.id);assert.equal(f.stored.size,0);assert.equal(f.calls.create.length,0);
});

test('actual Android facade with missing native module preserves the draft and never launches or drains anonymous Expo',async()=>{
 const f=fixture({draft:savedDraft(),nativeModuleAvailable:false}),v=await render(f.App.Create,f.createProps);
 await invoke(action(v,'Choose photos').props.onPress);assert.match(notices(v),/Install the updated QRguitar app/);
 assert.equal(field(v,'Brand').props.value,'Fender');assert.equal(v.root.findAllByType('Image').length,1);assert.equal(f.calls.nativeStarts.length,0);assert.equal(f.calls.picker,0);assert.equal(f.calls.pendingPicker,0);assert.equal(f.stored.size,0);
});

test('legacy anonymous intent is recovery-only and explicit retirement never consumes its late result for a new identified selection',async()=>{
 let late=false;
 const f=fixture({draft:savedDraft(),selectionIntent:pendingSelection(),pendingPicker:async()=>late?recoveredPhoto():null}),v=await render(f.App.Create,f.createProps);
 await invoke(action(v,'Choose photos').props.onPress);assert.match(notices(v),/earlier photo selection is still pending/);assert.equal(f.calls.nativeStarts.length,0);
 const before=f.calls.pendingPicker;late=true;await invoke(action(v,'Discard pending photo selection').props.onPress);await invoke(f.alerts.at(-1)[2].find(button=>button.text==='Discard selection').onPress);
 assert.equal(f.calls.pendingPicker,before);assert.equal(f.stored.has('qrguitar.android-photo-selection.v1'),false);
 await invoke(action(v,'Choose photos').props.onPress);assert.equal(f.calls.nativeStarts.length,1);assert.equal(f.calls.pendingPicker,before);assert.equal(f.calls.picker,0);assert.equal(v.root.findAllByType('Image').length,1);assert.equal(f.calls.create.length,0);
});

test('identified result event after prompt picker return recovers without another foreground transition',async()=>{
 let available=false;
 const f=fixture({draft:savedDraft(),photoCoordinator:{pick:async()=>null,recover:async(_actor,controller)=>{if(!available)return null;available=false;return addEventPhoto(controller);}}}),v=await render(f.App.Create,f.createProps);
 await invoke(action(v,'Choose photos').props.onPress);assert.equal(v.root.findAllByType('Image').length,1);
 available=true;await invoke(()=>f.notifySelection());
 assert.equal(v.root.findAllByType('Image').length,2);assert.equal(f.draft.getState().draft.photos.length,2);assert.equal(f.calls.pendingPicker,0);assert.equal(f.calls.create.length,0);
});

test('identified event during picker work queues recovery instead of dropping the result',async()=>{
 const pending=deferred();let available=false;
 const f=fixture({draft:savedDraft(),photoCoordinator:{pick:()=>pending.promise,recover:async(_actor,controller)=>{if(!available)return null;available=false;return addEventPhoto(controller);}}}),v=await render(f.App.Create,f.createProps);
 const before=f.calls.pickerRecover.length;await invoke(action(v,'Choose photos').props.onPress);available=true;await invoke(()=>f.notifySelection());
 assert.equal(f.calls.pickerRecover.length,before);assert.equal(action(v,'Create Profile').props.disabled,true);
 pending.resolve(null);await flush();assert.equal(f.calls.pickerRecover.length,before+1);assert.equal(v.root.findAllByType('Image').length,2);assert.equal(f.calls.create.length,0);
});

test('event queued during a picker commit cannot flush the previous rendered photo list over the committed result',async()=>{
 let f;
 f=fixture({draft:savedDraft(),photoCoordinator:{recover:async()=>null,pick:async(_actor,controller)=>{const result=await addEventPhoto(controller);f.notifySelection();return result;}}});
 const v=await render(f.App.Create,f.createProps);await invoke(action(v,'Choose photos').props.onPress);
 assert.equal(v.root.findAllByType('Image').length,2);assert.equal(f.draft.getState().draft.photos.length,2);
 assert.equal(f.calls.save.at(-1)[1].length,2);assert.equal(f.calls.save.filter(([,photos])=>photos.length===1).length,0);assert.equal(f.calls.create.length,0);
});

test('native event during queued draft mutation waits and preserves the dirty fields being committed',async()=>{
 const saving=deferred();let available=false;
 const f=fixture({draft:savedDraft(),saveDraft:input=>input.brand==='Latest unsaved brand'?saving.promise:undefined,photoCoordinator:{pick:async()=>null,recover:async(_actor,controller)=>{if(!available)return null;available=false;return addEventPhoto(controller);}}}),v=await render(f.App.Create,f.createProps);
 await invoke(field(v,'Brand').props.onChangeText,'Latest unsaved brand');let leaving;await invoke(()=>{leaving=f.createProps.leaveGuardRef.current();});
 const before=f.calls.pickerRecover.length;available=true;await invoke(()=>f.notifySelection());assert.equal(f.calls.pickerRecover.length,before);
 saving.resolve();await act(async()=>{await leaving;await tick();});await flush();
 assert.equal(field(v,'Brand').props.value,'Latest unsaved brand');assert.equal(f.draft.getState().draft.input.brand,'Latest unsaved brand');assert.equal(v.root.findAllByType('Image').length,2);
});

test('field edit and identified event in the same turn preserve input before React effects run',async()=>{
 let available=false;
 const f=fixture({draft:savedDraft(),photoCoordinator:{pick:async()=>null,recover:async(_actor,controller)=>{if(!available)return null;available=false;return addEventPhoto(controller);}}}),v=await render(f.App.Create,f.createProps);
 await invoke(()=>{field(v,'Brand').props.onChangeText('Same turn edit');available=true;f.notifySelection();});
 assert.equal(field(v,'Brand').props.value,'Same turn edit');assert.equal(f.draft.getState().draft.input.brand,'Same turn edit');assert.equal(v.root.findAllByType('Image').length,2);
});

test('events during recovery coalesce into a subsequent pass without losing just-applied photos',async()=>{
 let available=false,f;
 f=fixture({draft:savedDraft(),photoCoordinator:{pick:async()=>null,recover:async(_actor,controller)=>{if(!available)return null;available=false;const result=await addEventPhoto(controller);f.notifySelection();f.notifySelection();return result;}}});
 const v=await render(f.App.Create,f.createProps),before=f.calls.pickerRecover.length;available=true;await invoke(()=>f.notifySelection());
 assert.equal(f.calls.pickerRecover.length,before+2);assert.equal(v.root.findAllByType('Image').length,2);assert.equal(f.draft.getState().draft.photos.length,2);assert.equal(f.calls.save.length,1);
});

test('dirty-draft save failure prevents recovery consumption and a later event retries the latest form',async()=>{
 let fail=true,available=false;
 const f=fixture({draft:savedDraft(),saveDraft:input=>{if(input.brand==='Keep this edit'&&fail)throw Error('Draft save unavailable');},photoCoordinator:{pick:async()=>null,recover:async(_actor,controller)=>{if(!available)return null;available=false;return addEventPhoto(controller);}}}),v=await render(f.App.Create,f.createProps);
 const before=f.calls.pickerRecover.length;await invoke(field(v,'Brand').props.onChangeText,'Keep this edit');available=true;await invoke(()=>f.notifySelection());
 assert.equal(f.calls.pickerRecover.length,before);assert.equal(available,true);assert.equal(field(v,'Brand').props.value,'Keep this edit');assert.match(notices(v),/Draft save unavailable/);
 fail=false;await invoke(()=>f.notifySelection());assert.equal(field(v,'Brand').props.value,'Keep this edit');assert.equal(f.draft.getState().draft.input.brand,'Keep this edit');assert.equal(v.root.findAllByType('Image').length,2);assert.equal(notices(v),'');
});

test('native event during initial restoration is retained until the form becomes ready',async()=>{
 const pending=deferred();let reads=0;
 const f=fixture({draft:savedDraft(),photoCoordinator:{pick:async()=>null,recover:async(_actor,controller)=>++reads===1?pending.promise:addEventPhoto(controller)}}),v=await render(f.App.Create,f.createProps);
 assert.match(text(v),/Restoring your draft/);await invoke(()=>f.notifySelection());assert.equal(reads,1);
 pending.resolve(null);await flush();await flush();assert.equal(reads,2);assert.equal(v.root.findAllByType('Image').length,2);assert.equal(f.calls.create.length,0);
});

test('unmount cancels queued native recovery and even an already-captured listener cannot restart it',async()=>{
 const pending=deferred();
 const f=fixture({draft:savedDraft(),photoCoordinator:{pick:()=>pending.promise,recover:async()=>null}}),v=await render(f.App.Create,f.createProps);
 const before=f.calls.pickerRecover.length;await invoke(action(v,'Choose photos').props.onPress);await invoke(()=>f.notifySelection());const late=f.capturedSelectionCallbacks.at(-1);
 await unmount(v);assert.equal(f.selectionListenerCount(),0);pending.resolve(null);await flush();await invoke(late);
 assert.equal(f.calls.pickerRecover.length,before);assert.equal(f.calls.create.length,0);assert.equal(f.calls.save.length,0);
});

test('retired account listener cannot recover into the replacement account UI',async()=>{
 const old=fixture({draft:savedDraft(),photoCoordinator:{pick:async()=>null,recover:async()=>null}}),first=await render(old.App.Create,old.createProps),late=old.capturedSelectionCallbacks.at(-1);
 const before=old.calls.pickerRecover.length;await unmount(first);
 const actor='other-owner-111111111111',next=fixture({snapshot:librarySnapshot(actor),draft:savedDraft({actorId:actor,input:draftInput({brand:'Other account'})}),photoCoordinator:{pick:async()=>null,recover:async()=>null}});
 const second=await render(next.App.Create,{...next.createProps,actorId:actor});await invoke(late);
 assert.equal(old.calls.pickerRecover.length,before);assert.equal(field(second,'Brand').props.value,'Other account');assert.equal(next.calls.save.length,0);assert.ok(next.calls.pickerRecover.every(value=>value===actor));
});

test('missing identified module leaves the editable draft visible and never falls back to the anonymous picker',async()=>{
 const f=fixture({draft:savedDraft(),photoCoordinator:{recover:async()=>null,pick:async()=>{throw Error('Photo selection requires the updated Android app.');}}}),v=await render(f.App.Create,f.createProps);
 await invoke(field(v,'Brand').props.onChangeText,'Saved before capability check');await invoke(action(v,'Choose photos').props.onPress);
 assert.match(notices(v),/updated Android app/);assert.equal(field(v,'Brand').props.value,'Saved before capability check');assert.equal(f.draft.getState().draft.input.brand,'Saved before capability check');assert.equal(v.root.findAllByType('Image').length,1);assert.equal(f.calls.picker,0);assert.equal(f.calls.pendingPicker,0);
});
test('backgrounding the root hides private Create content without losing its photos or inputs',async()=>{
 const f=fixture({picker:async()=>({canceled:false,assets:[{id:'selected-111111111',base64:'cGhvdG8='}]})}),v=await render(f.App.default);
 await invoke(action(v,'Create Profile').props.onPress);await invoke(field(v,'Brand').props.onChangeText,'Background draft');await invoke(action(v,'Choose photos').props.onPress);
 assert.equal(v.root.findAllByType('Image').length,1);await f.background('background');assert.equal(f.calls.dispose,0);assert.equal(field(v,'Brand').props.value,'Background draft');assert.equal(v.root.findAllByType('Image').length,1);
 assert.equal(v.root.findByType('KeyboardAvoidingView').props.accessibilityElementsHidden,true);assert.match(text(v),/Return to the app/);
 await f.background('active');assert.equal(f.calls.dispose,0);assert.equal(field(v,'Brand').props.value,'Background draft');assert.equal(v.root.findAllByType('Image').length,1);assert.equal(v.root.findByType('KeyboardAvoidingView').props.accessibilityElementsHidden,false);
});
test('failed owner Profile refresh removes cached private record and photos',async()=>{
 let reads=0;const privateRecord=record(),f=fixture({api:{readMine:async()=>{if(++reads===1)return privateRecord;throw Error('Owner read failed');}}});
 const props={code:privateRecord.qrCode,mine:true,snapshot:f.auth.getSnapshot(),active:true,onLibrary:()=>{}},v=await render(f.App.Profile,props);
 assert.match(text(v),/PRIVATE-SERIAL-42/);assert.ok(v.root.findAllByType('Image').length);
 await invoke(action(v,'Refresh Profile').props.onPress);assert.equal(reads,2);assert.doesNotMatch(text(v),/PRIVATE-SERIAL-42|Private instrument|private-image/);assert.equal(v.root.findAllByType('Image').length,0);assert.match(text(v),/Profile unavailable/);
});
test('failed owner library refresh removes cached instrument cards',async()=>{
 let reads=0;const f=fixture({api:{listMine:async()=>{if(++reads===1)return[record()];throw Error('Collection read failed');}}});
 const v=await render(f.App.OwnedRecords,{actorId:'owner-111111111111',revision:1,onOpen:()=>{}});assert.match(text(v),/Private instrument/);
 await invoke(action(v,'Refresh').props.onPress);assert.equal(reads,2);assert.doesNotMatch(text(v),/Private instrument|private-image/);assert.match(notices(v),/Collection read failed/);
});
test('private gallery Modal is hidden whenever active is false and uses no image cache',async()=>{
 const f=fixture({record:record()}),props={code:'QRG-ABC123',mine:true,snapshot:f.auth.getSnapshot(),active:true,onLibrary:()=>{}},v=await render(f.App.Profile,props);
 await invoke(v.root.findAllByType('Pressable').find(node=>node.props.accessibilityLabel==='Open photo gallery').props.onPress);assert.equal(v.root.findByType('Modal').props.visible,true);
 assert.ok(v.root.findAllByType('Image').every(node=>node.props.cachePolicy==='none'));
 await update(v,f.App.Profile,{...props,active:false});assert.equal(v.root.findByType('Modal').props.visible,false);
 await update(v,f.App.Profile,props);assert.equal(v.root.findByType('Modal').props.visible,true);
});
test('Login error survives root auth revision changes during sign-in',async()=>{
 const pending=deferred(),signedOut={status:'signed-out',session:null,revision:1,message:''},f=fixture({snapshot:signedOut,signIn:()=>pending.promise}),v=await render(f.App.default);
 await invoke(action(v,'Create Profile').props.onPress);await invoke(field(v,'Email').props.onChangeText,'owner@example.invalid');await invoke(field(v,'Password').props.onChangeText,'password123');
 await invoke(submitAction(v,'Sign in').props.onPress);await f.changeAccount({...signedOut,revision:2,status:'error',message:'Session request failed'});
 assert.equal(field(v,'Email').props.value,'owner@example.invalid');pending.reject(Error('Incorrect password'));await flush();assert.match(notices(v),/Incorrect password/);assert.equal(field(v,'Password').props.editable,true);assert.equal(f.calls.signIn.length,1);
});
test('registration confirmation survives root auth revision changes without false login',async()=>{
 const pending=deferred(),signedOut={status:'signed-out',session:null,revision:1,message:''},f=fixture({snapshot:signedOut,signUp:()=>pending.promise}),v=await render(f.App.default);
 await invoke(action(v,'Create Profile').props.onPress);await invoke(action(v,'Create account').props.onPress);
 await invoke(field(v,'Display name').props.onChangeText,'Owner');await invoke(field(v,'Email').props.onChangeText,'owner@example.invalid');await invoke(field(v,'Password').props.onChangeText,'password123');await invoke(v.root.findByType('Switch').props.onValueChange,true);
 await invoke(submitAction(v,'Create account').props.onPress);await f.changeAccount({...signedOut,revision:2});pending.resolve({requiresEmailConfirmation:true});await flush();
 assert.match(notices(v),/Check your email/);assert.equal(field(v,'Password').props.value,'');assert.equal(field(v,'Email').props.value,'owner@example.invalid');assert.equal(f.calls.signUp.length,1);assert.equal(f.calls.signIn.length,0);
});
test('initial auth restoration preserves a public deep-linked Profile',async()=>{
 let reads=0;const publicRecord=record({name:'Public deep-link instrument',visibility:'public',serial:''}),f=fixture({snapshot:{status:'loading',session:null,revision:0,message:''},initialUrl:'https://qrguitar.com/i/QRG-ABC123',api:{readPublic:async()=>{reads++;return publicRecord;},readMine:async()=>{throw Error('Unexpected owner read');}}}),v=await render(f.App.default);
 await flush();assert.match(text(v),/Public deep-link instrument/);
 await f.changeAccount({status:'signed-in',session:{user:{id:'owner-111111111111',email:'owner@example.invalid',user_metadata:{display_name:'Owner'}}},revision:1,message:''});await flush();
 assert.match(text(v),/Public deep-link instrument/);assert.equal(action(v,'Full Profile').props.title,'Full Profile');assert.equal(action(v,'Edit in browser'),undefined);assert(reads>=1);
});
function busySource(initial=true,{synchronousIdle=false}={}){
 let busy=initial,removed=0,subscriptions=0;const listeners=new Set();
 return {getState:()=>({busy}),subscribe(fn){subscriptions++;listeners.add(fn);if(synchronousIdle){busy=false;fn();}return()=>{removed++;listeners.delete(fn);};},set(next){busy=next;for(const fn of[...listeners])fn();},stats:()=>({listeners:listeners.size,removed,subscriptions})};
}
test('idle wait unsubscribes after completion and handles synchronous subscribe emission',async()=>{
 const helper=fixture().helpers.waitForDraftIdle,source=busySource(),abort=new AbortController();const pending=helper(source,abort.signal,1000);assert.equal(source.stats().listeners,1);source.set(false);await pending;abort.abort();assert.deepEqual(source.stats(),{listeners:0,removed:1,subscriptions:1});
 const synchronous=busySource(true,{synchronousIdle:true});await helper(synchronous,undefined,1000);assert.deepEqual(synchronous.stats(),{listeners:0,removed:1,subscriptions:1});
 const idle=busySource(false);await helper(idle);assert.equal(idle.stats().subscriptions,0);
});
test('idle wait abort and timeout remove subscriptions and reject without hanging',async()=>{
 const helper=fixture().helpers.waitForDraftIdle,source=busySource(),abort=new AbortController();const pending=helper(source,abort.signal,1000);const rejected=assert.rejects(pending,/no longer active/);abort.abort();await rejected;assert.equal(source.stats().listeners,0);assert.equal(source.stats().removed,1);
 const expired=busySource();await assert.rejects(helper(expired,undefined,15),/still being saved/);assert.equal(expired.stats().listeners,0);assert.equal(expired.stats().removed,1);
 const stopped=busySource();await assert.rejects(helper(stopped,AbortSignal.abort()),/no longer active/);assert.equal(stopped.stats().subscriptions,0);
});
test('mutation queue keeps later work locked through a rejected predecessor',async()=>{
 const queue=fixture().helpers.createUiMutationQueue(),first=deferred(),second=deferred(),events=[];let changes=0;const unsub=queue.subscribe(()=>changes++);
 const one=queue.run(async()=>{events.push('first');await first.promise;});const rejected=assert.rejects(one,/synthetic failure/);const two=queue.run(async()=>{events.push('second');await second.promise;});assert.equal(queue.getBusy(),true);await tick();assert.deepEqual(events,['first']);
 first.reject(Error('synthetic failure'));await rejected;await tick();assert.deepEqual(events,['first','second']);assert.equal(queue.getBusy(),true);second.resolve();await two;assert.equal(queue.getBusy(),false);assert.equal(changes,4);unsub();
});

test('hardware Back handling registers only on Android, without browser or iOS warnings',async()=>{for(const platform of ['web','ios','android']){const f=fixture({platform});await render(f.App.default);assert.equal(f.calls.backHandlers||0,platform==='android'?1:0);}});
