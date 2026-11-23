/* Offline checks for the browser-local appearance and workspace contracts. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto').webcrypto;
const root=path.join(__dirname,'..');
const source=name=>fs.readFileSync(path.join(root,name),'utf8');
const stores=new Map();
const storage={
 getItem:key=>stores.has(key)?stores.get(key):null,
 setItem:(key,value)=>stores.set(key,String(value)),
 removeItem:key=>stores.delete(key)
};
const rootElement={dataset:{},lang:'zh-CN',setAttribute(key,value){if(key==='data-theme')this.dataset.theme=value;else this[key]=value;}};
let accountId='u-0123456789abcdef01234567',reloads=0;
const doc={
 documentElement:rootElement,
 querySelector:()=>null,
 querySelectorAll:()=>[],
 createTreeWalker:()=>({nextNode:()=>false})
};
const messages=[];
const studio={
 actions:{},dirty:false,state:{runs:[]},save(){return true},
 render(){},closeModal(){},toast(text){messages.push(text)},
 action(name,fn){this.actions[name]=fn},
 modal(){},btn(label,action,options={}){return '<button data-action="'+action+'">'+label+'</button>'},
 field(name){return '<input name="'+name+'">'},
 escape: text=>String(text).replaceAll('<','&lt;')
};
const win={
 crypto,Studio:studio,
 StudioAuth:{getSession:()=>({accountId})},
 StudioAppearance:null
};
const context=vm.createContext({
 window:win,document:doc,localStorage:storage,location:{reload(){reloads++;}},
 getComputedStyle:()=>({getPropertyValue:()=> '#171B20'}),
 NodeFilter:{SHOW_TEXT:4},Date,Uint8Array,JSON,Map,Set,Array,Object,console
});
vm.runInContext(source('appearance.js'),context);
vm.runInContext(source('spaces.js'),context);
const A=win.StudioAppearance,W=win.StudioSpaces;
A.attach(studio);W.attach(studio);
assert.equal(A.getTheme(),'editorial-light');
assert.equal(A.setTheme('obsidian-dark'),true);
assert.equal(rootElement.dataset.theme,'obsidian-dark');
assert.match(storage.getItem('peachagent-appearance-v1'),/obsidian-dark/);
assert.equal(A.setTheme('unknown'),false);
assert.equal(A.setLocale('en-US'),true);
assert.equal(rootElement.lang,'en-US');
assert.equal(A.t('智能体'),'Agents');
assert.equal(A.setLocale('zh-CN'),true);
assert.equal(A.t('智能体'),'智能体');
assert.equal(W.active().id,'default');
assert.equal(W.active().storageKey,'otryx-studio-workspace::'+accountId);
const newSpace=W.create('产品研发');
assert.equal(W.list().length,2);
assert.equal(W.list().filter(item=>item.active).length,1);
assert.equal(W.rename(newSpace.id,'工程测试').name,'工程测试');
assert.equal(W.switchTo(newSpace.id),true);
assert.equal(reloads,1);
assert.equal(W.active().storageKey,'otryx-studio-workspace::'+accountId+'::'+newSpace.id);
assert.equal(W.list().find(item=>item.active).name,'工程测试');
const other=accountId;accountId='u-abcdefabcdefabcdefabcdef';
assert.equal(W.active().id,'default');
assert.equal(W.list().length,1);
accountId=other;
studio.dirty=true;
assert.throws(()=>W.switchTo('default'),/先保存或放弃/);
studio.dirty=false;
assert.equal(W.switchTo('default'),true);
assert.equal(W.active().storageKey,'otryx-studio-workspace::'+accountId);
assert.equal(reloads,2);
console.log('PASS: appearance theme/locale persistence, default workspace, isolation, rename, dirty switch guard.');
