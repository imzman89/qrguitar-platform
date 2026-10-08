// Real React renderer execution; native camera/permission bridges are mocked.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const directory=path.dirname(fileURLToPath(import.meta.url));
const require=createRequire(path.resolve(process.env.QRGUITAR_MOBILE_RUNTIME || path.join(directory,'..'),'package.json'));
const React=require('react'),ts=require('typescript');
const rendererRequire=createRequire(require.resolve('react-test-renderer/package.json'));
const rendererModule={exports:{}};
new Function('require','module','exports',fs.readFileSync(path.join(path.dirname(rendererRequire.resolve('react-test-renderer/package.json')),'cjs/react-test-renderer.development.js'),'utf8'))(id=>id==='react'?React:rendererRequire(id),rendererModule,rendererModule.exports);
const Renderer=rendererModule.exports,{act}=React;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const sourceDir=process.env.QRGUITAR_MOBILE_SOURCE || path.join(directory,'../src');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{resolve,reject,promise};};
function fixture(options={}){
 const appListeners=new Set(),permissions=new Set();let permission=options.permission||{granted:true,canAskAgain:true};
 const calls={profiles:[],permission:0,settings:0};
 const state={currentState:'active',addEventListener(_event,fn){appListeners.add(fn);return{remove(){appListeners.delete(fn);}};}};
 const getPermission=async()=>options.getPermission?options.getPermission():permission;
 const requestPermission=async()=>{calls.permission++;const next=await options.requestPermission?.()||permission;permission=next;permissions.forEach(fn=>fn(next));return next;};
 const camera={CameraView:'CameraView',useCameraPermissions(){const[p,set]=React.useState(permission);React.useEffect(()=>{permissions.add(set);return()=>permissions.delete(set);},[]);return[p,requestPermission,getPermission];}};
 const native={AppState:state,Linking:{openSettings:async()=>{calls.settings++;return options.openSettings?.();}},ScrollView:'ScrollView',Text:'Text',View:'View',StyleSheet:{create:value=>value,absoluteFill:{}}};
 const mocks={'react':React,'react-native':native,'expo-camera':camera,'../lib/qr-input':{parseQrInput:value=>/^QRG-[A-Z0-9]+$/.test(value)?value:null},'./ui':{Action:'Action',Field:'Field',Heading:'Heading',Notice:'Notice',colors:{},styles:{}}};
 const output=ts.transpileModule(fs.readFileSync(path.join(sourceDir,'components/Scanner.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
 const module={exports:{}};new Function('require','module','exports',output)(id=>mocks[id]||require(id),module,module.exports);
 let view;
 return {calls,async render(strict=false){await act(async()=>{const component=React.createElement(module.exports.Scanner,{onProfile:code=>calls.profiles.push(code)});view=Renderer.create(strict?React.createElement(React.StrictMode,null,component):component);await tick();});return view;},
  async background(value){await act(async()=>{state.currentState=value;appListeners.forEach(fn=>fn(value));await tick();});},
  async unmount(){await act(()=>view.unmount());}, get view(){return view;}};
}
const invoke=async(fn,...args)=>act(async()=>{fn(...args);await tick();});
const action=(view,title)=>view.root.findAllByType('Action').find(node=>node.props.title===title);
const notices=view=>view.root.findAllByType('Notice').map(node=>node.props.message).join(' ');
test('queued camera callback after unmount cannot navigate',async()=>{
 const f=fixture(),view=await f.render();const scan=view.root.findByType('CameraView').props.onBarcodeScanned;await f.unmount();
 await invoke(scan,{data:'QRG-A123'});assert.deepEqual(f.calls.profiles,[]);
});
test('old camera scan and error callbacks remain retired after background then foreground',async()=>{
 const f=fixture(),view=await f.render();const old=view.root.findByType('CameraView').props;
 await f.background('background');await invoke(old.onBarcodeScanned,{data:'QRG-A123'});assert.deepEqual(f.calls.profiles,[]);
 await f.background('active');await invoke(()=>{old.onBarcodeScanned({data:'QRG-OLD'});old.onMountError();});
 assert.deepEqual(f.calls.profiles,[]);assert.equal(view.root.findAllByType('CameraView').length,1);
 await invoke(view.root.findByType('CameraView').props.onBarcodeScanned,{data:'QRG-NEW'});assert.deepEqual(f.calls.profiles,['QRG-NEW']);await f.unmount();
});
test('duplicate active events and StrictMode effect replay leave the current scanner functional',async()=>{
 const f=fixture(),view=await f.render(true);await f.background('active');await f.background('active');
 await invoke(view.root.findByType('CameraView').props.onBarcodeScanned,{data:'QRG-A123'});assert.deepEqual(f.calls.profiles,['QRG-A123']);await f.unmount();
});
test('manual double click dispatches one successful navigation',async()=>{
 const f=fixture(),view=await f.render();await invoke(view.root.findByType('Field').props.onChangeText,'QRG-A123');
 const open=action(view,'Open Profile').props.onPress;await invoke(()=>{open();open();});assert.deepEqual(f.calls.profiles,['QRG-A123']);await f.unmount();
});
test('permission button suppresses duplicate requests and ignores rejection after unmount',async()=>{
 const gate=deferred(),f=fixture({permission:{granted:false,canAskAgain:true},requestPermission:()=>gate.promise}),view=await f.render();
 const ask=action(view,'Enable camera').props.onPress;await invoke(()=>{ask();ask();});assert.equal(f.calls.permission,1);await f.unmount();
 await invoke(()=>gate.reject(new Error('old permission failure')));assert.equal(f.calls.permission,1);
});
test('settings rejection is visible only while its scanner remains active',async()=>{
 const gate=deferred(),f=fixture({permission:{granted:false,canAskAgain:false},openSettings:()=>gate.promise}),view=await f.render();
 await invoke(action(view,'Open device settings').props.onPress);await f.background('background');await f.background('active');await invoke(()=>gate.reject(new Error('old settings')));
 assert.doesNotMatch(notices(view),/Open Settings manually/);await f.unmount();
 const fail=fixture({permission:{granted:false,canAskAgain:false},openSettings:async()=>{throw new Error('unavailable');}}),next=await fail.render();await invoke(action(next,'Open device settings').props.onPress);
 assert.match(notices(next),/Open Settings manually/);await fail.unmount();
});
