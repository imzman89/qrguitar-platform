import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
const require=createRequire(import.meta.url),React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),ts=require('typescript');
const web=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const cache=new Map();
function load(file){const abs=path.resolve(web,file);if(cache.has(abs))return cache.get(abs);const m={exports:{}};cache.set(abs,m.exports);const source=fs.readFileSync(abs,'utf8');const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;new Function('require','module','exports',code)(name=>name.startsWith('.')?load(path.relative(web,path.resolve(path.dirname(abs),name+'.ts'))):require(name),m,m.exports);cache.set(abs,m.exports);return m.exports;}
const settingsModule=load('lib/site-settings.ts'),{resolveVisibleEditorialSections,defaultEditorialComposition}=settingsModule,{getContentValue}=load('lib/content-registry.ts');
function compileGuide(sourceOverride,react=React){const m={exports:{}};const source=sourceOverride||fs.readFileSync(web+'/app/how-it-works/HowItWorksClient.tsx','utf8');new Function('require','module','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText)(name=>name==='react'?react:name==='../../lib/site-settings'?{resolveVisibleEditorialSections}:name==='../../lib/content-registry'?{getContentValue}:name.endsWith('/UiTextProvider')?{useUiText:()=>((key,fallback)=>fallback)}:name.endsWith('/CheckoutAwareLink')?{default:({children,...props})=>React.createElement('a',props,children)}:name.endsWith('.module.css')?{default:new Proxy({},{get:(_,k)=>k})}:name.endsWith('/Nav')?{Nav:()=>null}:name.endsWith('/Footer')?{Footer:()=>null}:name.endsWith('/EditorialIcon')?{EditorialIcon:()=>null}:name.endsWith('/CollectibleRecordCard')?{CollectibleRecordCard:()=>null}:require(name),m,m.exports);return m.exports.HowItWorksClient;}
function renderGuide(blocks,selected='how-role-provider',sourceOverride){return renderToStaticMarkup(React.createElement(compileGuide(sourceOverride),{settings:{content:{},composition:{howItWorks:{sections:[{id:'roles',visible:true,blocks}]}}},initialAudienceId:selected}));}
const provider=url=>({id:'how-role-provider',title:'Provider role',body:'Existing provider benefit',ctaUrl:url,ctaLabel:'Set up provider tools',visible:true});
const providerLink=html=>html.match(/href="([^"]+)"[^>]*>Set up provider tools<\/a>/)?.[1];
test('saved exact legacy provider link opens editable Account details',()=>assert.equal(providerLink(renderGuide([provider('/account#service-provider')])),'/account?section=profile'));
test('corrected default and custom provider routes are retained',()=>{for(const url of ['/account?section=profile','/custom-provider-setup'])assert.equal(providerLink(renderGuide([provider(url)])),url);});
test('another role retains its own legacy-looking custom route',()=>{const block={...provider('/account#service-provider'),id:'custom-role'};assert.equal(providerLink(renderGuide([block],'custom-role')),'/account#service-provider');});
test('hidden provider uses the actual visible-role fallback',()=>{const html=renderGuide([{...provider('/account#service-provider'),visible:false},{id:'how-role-owner',title:'Owner role',body:'Owner benefit',ctaUrl:'/create',ctaLabel:'Start free',visible:true}]);assert.ok(!html.includes('Provider role'));assert.match(html,/href="\/create"[^>]*>Start free/);});
test('missing CTA retains existing create fallback',()=>assert.equal(providerLink(renderGuide([provider(undefined)])),'/create'));
test('fresh Home composition omits redundant archive and process while preserving managed sections',()=>{const sections=defaultEditorialComposition.home.sections;assert.equal(sections.find(s=>s.id==='archive').visible,false);assert.equal(sections.find(s=>s.id==='lifecycle').visible,false);assert.ok(sections.find(s=>s.id==='hero').visible);assert.ok(sections.find(s=>s.id==='roles').visible);assert.ok(sections.find(s=>s.id==='finalCta').visible);assert.ok(sections.find(s=>s.id==='lifecycle').blocks.length);});
test('saved section visibility continues to override fresh composition defaults',()=>{const saved=structuredClone(defaultEditorialComposition);saved.home.sections.find(s=>s.id==='archive').visible=true;const ids=resolveVisibleEditorialSections({composition:saved},'home').map(s=>s.id);assert.ok(ids.includes('archive'));});


function guideScrollFixture(selected,blocks=defaultEditorialComposition.howItWorks.sections.find(section=>section.id==='roles').blocks,width=320){
  const saved={document:globalThis.document,window:globalThis.window},opener={name:'existing focus'},slots=[],focusCalls=[],scrolls=[],elements=new Map(),resizeListeners=new Set();
  globalThis.document={activeElement:opener};
  globalThis.window={scrollY:840,scrollTo(){throw new Error('Guide must not scroll the page');},addEventListener(type,listener){assert.equal(type,'resize');resizeListeners.add(listener);},removeEventListener(type,listener){assert.equal(type,'resize');resizeListeners.delete(listener);}};
  let cursor=0,pending=[],tree,tabs=[],scrollLeft=0;
  const widths=new Map([['how-role-player',180],['how-role-shop',84],['how-role-builder',170],['how-role-provider',160],['how-role-buyer',100]]);
  const strip={
    clientWidth:width,clientLeft:2,scrollTop:17,
    get scrollWidth(){return tabs.reduce((total,tab)=>total+(widths.get(tab.node.key)||150),0);},
    get scrollLeft(){return scrollLeft;},
    set scrollLeft(value){scrollLeft=Math.max(0,Math.min(value,Math.max(0,this.scrollWidth-this.clientWidth)));scrolls.push(scrollLeft);},
    getBoundingClientRect(){return {left:20,right:24+this.clientWidth,width:this.clientWidth+4};},
    querySelector(selector){assert.equal(selector,'[aria-selected="true"]');return tabs.find(tab=>tab.node.props['aria-selected']===true)||null;},
    querySelectorAll(selector){assert.equal(selector,'[role="tab"]');return tabs;},
    scrollIntoView(){throw new Error('Guide must not scroll ancestor containers');}
  };
  const hooks={...React,
    useMemo:run=>run(),
    useState(initial){const id=cursor++;if(!(id in slots))slots[id]={value:typeof initial==='function'?initial():initial};return [slots[id].value,value=>{slots[id].value=typeof value==='function'?value(slots[id].value):value;}];},
    useRef(initial){const id=cursor++;if(!(id in slots))slots[id]={current:initial};return slots[id];},
    useEffect(run,deps){const id=cursor++,previous=slots[id];if(!previous||deps.some((value,index)=>!Object.is(value,previous.deps[index]))){slots[id]={deps,cleanup:previous?.cleanup};pending.push(()=>{previous?.cleanup?.();slots[id].cleanup=run();});}}
  };
  const Guide=compileGuide(undefined,hooks);
  const props={settings:{content:{},composition:{howItWorks:{sections:[{id:'roles',visible:true,blocks}]}}},initialAudienceId:selected};
  function all(node=tree){if(Array.isArray(node))return node.flatMap(child=>child==null?[]:all(child));return React.isValidElement(node)?[node,...(Array.isArray(node.props.children)?node.props.children:[node.props.children]).flatMap(child=>child==null?[]:all(child))]:[];}
  function render(){
    cursor=0;pending=[];tree=Guide(props);
    tabs=all().filter(node=>node.type==='button'&&node.props.role==='tab').map(node=>{
      if(!elements.has(node.key))elements.set(node.key,{
        parentElement:strip,
        getBoundingClientRect(){const index=tabs.indexOf(this),offset=tabs.slice(0,index).reduce((total,tab)=>total+(widths.get(tab.node.key)||150),0),width=widths.get(this.node.key)||150,left=22+offset-strip.scrollLeft;return {left,right:left+width,width};},
        focus(options){document.activeElement=this;focusCalls.push(options);},
        scrollIntoView(){throw new Error('Guide must not scroll ancestor containers');}
      });
      const element=elements.get(node.key);element.node=node;return element;
    });
    const list=all().find(node=>node.props.role==='tablist');
    if(list?.props.ref)list.props.ref.current=strip;
    pending.forEach(run=>run());
  }
  const tab=id=>{const result=tabs.find(item=>item.node.key===id);assert.ok(result,id);return result;};
  const selectedTab=()=>{const result=tabs.find(item=>item.node.props['aria-selected']===true);assert.ok(result,'selected role');return result;};
  function visible(){const bounds=selectedTab().getBoundingClientRect(),left=strip.getBoundingClientRect().left+strip.clientLeft;assert.ok(bounds.left>=left,'selected role left edge is clipped');assert.ok(bounds.right<=left+strip.clientWidth,'selected role right edge is clipped');}
  function key(value){let prevented=false;const current=selectedTab();current.node.props.onKeyDown({key:value,currentTarget:current,preventDefault(){prevented=true;}});render();return prevented;}
  function href(){return all(all().find(node=>node.props.role==='tabpanel')).find(node=>node.props.href)?.props.href;}
  function unchangedVertical(){assert.equal(window.scrollY,840);assert.equal(strip.scrollTop,17);}
  function resize(width){strip.clientWidth=width;scrollLeft=Math.min(scrollLeft,Math.max(0,strip.scrollWidth-width));[...resizeListeners].forEach(listener=>listener());}
  function cleanup(){slots.forEach(slot=>slot?.cleanup?.());const remaining=resizeListeners.size;for(const [name,value]of Object.entries(saved)){if(value===undefined)delete globalThis[name];else globalThis[name]=value;}return remaining;}
  render();
  return {strip,opener,focusCalls,scrolls,visible,key,href,unchangedVertical,resize,cleanup,selectedTab,get listenerCount(){return resizeListeners.size;},ids:()=>tabs.map(tab=>tab.node.key),click(id){tab(id).node.props.onClick();render();}};
}

test('Guide reveals a deep-linked selected role without changing focus or vertical position',()=>{
  const roles=defaultEditorialComposition.howItWorks.sections.find(section=>section.id==='roles').blocks;
  for(const id of ['how-role-builder','how-role-provider','how-role-buyer']){
    const f=guideScrollFixture(id);
    try{
      assert.equal(f.selectedTab().node.key,id);f.visible();f.unchangedVertical();
      assert.equal(document.activeElement,f.opener);assert.deepEqual(f.focusCalls,[]);
      assert.deepEqual(f.ids(),roles.filter(block=>block.visible).map(block=>block.id));
      assert.equal(f.href(),roles.find(block=>block.id===id).ctaUrl);
      assert.equal(f.listenerCount,1);
    }finally{assert.equal(f.cleanup(),0);}
  }
});
test('Guide reveals custom click and keyboard selections using horizontal parent scroll only',()=>{
  const roles=[...defaultEditorialComposition.howItWorks.sections.find(section=>section.id==='roles').blocks,{id:'custom-business-role',title:'Custom business role',body:'Existing custom benefit',ctaUrl:'/custom-inventory',ctaLabel:'Custom tools',visible:true}];
  const f=guideScrollFixture('how-role-player',roles);
  try{
    f.click('custom-business-role');f.visible();assert.equal(f.href(),'/custom-inventory');assert.equal(document.activeElement,f.opener);
    assert.deepEqual(f.ids(),roles.filter(block=>block.visible).map(block=>block.id));
    for(const [key,id]of [['Home','how-role-player'],['End','custom-business-role'],['ArrowRight','how-role-player'],['ArrowLeft','custom-business-role']]){
      assert.equal(f.key(key),true);assert.equal(f.selectedTab().node.key,id);f.visible();f.unchangedVertical();
      assert.equal(document.activeElement,f.selectedTab());assert.deepEqual(f.focusCalls.at(-1),{preventScroll:true});assert.equal(f.listenerCount,1);
    }
  }finally{assert.equal(f.cleanup(),0);}
});
test('Guide reveals the selected role after responsive resize and removes its resize listener',()=>{
  const f=guideScrollFixture('how-role-builder',undefined,2000);
  try{
    assert.deepEqual(f.scrolls,[]);f.resize(320);f.visible();f.unchangedVertical();
    assert.equal(document.activeElement,f.opener);assert.deepEqual(f.focusCalls,[]);assert.equal(f.listenerCount,1);
    f.resize(2000);f.visible();f.unchangedVertical();
  }finally{assert.equal(f.cleanup(),0);}
});
test('Guide does not scroll a visible selection or a non-overflowing role strip',()=>{
  for(const [id,width]of [['how-role-shop',320],['how-role-builder',2000]]){
    const f=guideScrollFixture(id,undefined,width);
    try{f.visible();assert.deepEqual(f.scrolls,[]);assert.equal(document.activeElement,f.opener);f.unchangedVertical();f.click('how-role-player');f.visible();assert.deepEqual(f.scrolls,[]);}
    finally{assert.equal(f.cleanup(),0);}
  }
});


test('Guide Home and End reveal an unchanged selected tab after manual horizontal scrolling',()=>{
  for(const [id,key,left]of [['how-role-player','Home',200],['how-role-buyer','End',0]]){
    const f=guideScrollFixture(id);
    try{
      const selected=f.selectedTab(),href=f.href();
      selected.focus({preventScroll:true});
      f.strip.scrollLeft=left;
      const bounds=selected.getBoundingClientRect(),viewportLeft=f.strip.getBoundingClientRect().left+f.strip.clientLeft;
      assert.ok(bounds.left<viewportLeft||bounds.right>viewportLeft+f.strip.clientWidth,'manual scroll must hide the unchanged selected tab');
      assert.equal(f.key(key),true);assert.equal(f.selectedTab().node.key,id);
      assert.equal(document.activeElement,selected);f.visible();f.unchangedVertical();
      assert.equal(f.href(),href);assert.deepEqual(f.focusCalls.at(-1),{preventScroll:true});assert.equal(f.listenerCount,1);
    }finally{assert.equal(f.cleanup(),0);}
  }
});
