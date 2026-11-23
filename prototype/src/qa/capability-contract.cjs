/* Offline capability contract checks. Not a browser or visual test. */
'use strict';
const fs = require('fs'), vm = require('vm'), assert = require('assert'), path = require('path');
const root=path.resolve(__dirname, '..');
const dom=new Map(), storage=new Map();
const node=()=>({innerHTML:'',textContent:'',children:[],style:{},dataset:{},isConnected:true,open:false,addEventListener(){},focus(){},querySelector(){return null;},querySelectorAll(){return[];},setAttribute(){},classList:{add(){},remove(){},toggle(){}}});
const document={getElementById(id){if(!dom.has(id))dom.set(id,node());return dom.get(id);},querySelector(){return null;},querySelectorAll(){return[];},addEventListener(){},activeElement:null};
class Data {constructor(form){this.form=form;}get(k){return this.form.values[k]??'';}}
const context={window:{addEventListener(){},removeEventListener(){}},document,location:{hash:'#home'},history:{replaceState(){}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},console,URL,URLSearchParams,Blob,TextEncoder,Date,Set,Map,Math,Object,JSON,Promise,FormData:Data,CSS:{escape:x=>x},queueMicrotask,setTimeout,clearTimeout,setInterval,clearInterval};
vm.createContext(context);
for(const file of ['core.js','runtime.js','capability-ui.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
const hasAgentIntegration = ['trace.js','agent-studio.js'].every(file=>fs.existsSync(path.join(root,file)));
if(hasAgentIntegration)for(const file of ['trace.js','agent-studio.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
const S=context.window.Studio,R=S.Runtime;S.toast=()=>{};S.render=()=>{};S.renderChrome=()=>{};S.go=(route,params={})=>{S.route=route;S.params=params;};S.modal=opts=>{S.lastModal=opts;};S.closeModal=()=>{};S.validate=()=>true;
const variants=[['capabilities',{}],['mcp',{}],['plugins',{}]];
for(const route of ['mcp-detail','plugin-detail'])for(const tab of ['overview','capabilities','debug','history','dependencies'])variants.push([route,{id:route==='mcp-detail'?'mcp-workspace':'docs',tab}]);
let bytes=0;
for(const [route,params]of variants){S.route=route;S.params=params;const html=S.pages[route].render();assert(html.length>100);bytes+=html.length;for(const m of html.matchAll(/data-action="([^"]+)"/g))assert(S.actions[m[1]],route+' missing '+m[1]);for(const m of html.matchAll(/data-form="([^"]+)"/g))assert(S.forms[m[1]],route+' form missing '+m[1]);assert(!html.includes('undefined'),'Undefined rendered '+route+' '+params.tab);}
function form(values){return{values,elements:{namedItem:k=>({value:values[k]||'',id:k})},querySelectorAll(){return[];},querySelector(){return null;}};}
(async()=>{
S.route='mcp-detail';S.params={id:'mcp-search',tab:'debug'};S.pages['mcp-detail'].render();S.actions['cap-run-test']({dataset:{id:'web.search'}});const run=S.state.runs[0];await R.waitForRun(run);assert.equal(run.status,'done');assert.equal(run.toolCalls[0].result.total,3);assert.equal(run.artifacts.length,0);
let html=S.pages['mcp-detail'].render();assert(html.includes(run.toolCalls[0].requestId));assert(html.includes('搜索资料'));assert(html.includes('Trace'));
S.actions['cap-result-mode']({dataset:{id:'raw'}});html=S.pages['mcp-detail'].render();assert(html.includes('structuredContent'));
const published=JSON.stringify(S.state.agents[0].publishedConfig);S.forms['cap-binding-form'](form({'cap-bind-agent':'research',toolId:'web.search',timeoutMs:'15000','cap-bind-approval':'never',contextKind:''}));assert(S.state.agents[0].capabilityBindings.some(b=>b.toolId==='web.search'));assert.equal(S.state.agents[0].status,'draft');assert.equal(JSON.stringify(S.state.agents[0].publishedConfig),published);
S.forms['cap-connection-form'](form({connectionName:'克隆搜索测试',endpoint:'https://search.example.invalid/mcp','cap-transport':'Streamable HTTP','cap-location':'平台 Runner',credentialRef:'','cap-auth':'none','cap-template':'mcp-search',connectionId:'',pluginId:''}));const conn=R.connections.find(c=>c.name==='克隆搜索测试');assert(conn);assert.equal(conn.authType,'none');const tool=R.tools.find(t=>t.connectionId===conn.id);assert(tool.adapterId==='web.search');const cloned=R.testTool(tool.id,{query:'新实例',limit:2},{speed:0});await R.waitForRun(cloned);assert.equal(cloned.status,'done');assert.equal(cloned.toolCalls[0].result.total,2);assert.equal(cloned.toolCalls[0].connectionId,conn.id);
S.actions['cap-confirm-disable']({dataset:{id:conn.id}});assert.equal(conn.enabled,false);const denied=R.testTool(tool.id,{query:'blocked'},{speed:0});await R.waitForRun(denied);assert.equal(denied.status,'failed');assert.equal(denied.toolCalls[0].error.code,'CONNECTION_DISABLED');
S.forms['cap-import-form'](form({manifest:JSON.stringify({name:'自定义包',actions:[{name:'search',title:'自定义搜索',adapterId:'web.search'}]})}));const p=R.plugins.find(p=>p.name==='自定义包');assert(p);assert.equal(p.status,'installed');const imported=R.testTool(p.toolIds[0],{query:'导入工具',limit:1},{speed:0});await R.waitForRun(imported);assert.equal(imported.status,'done');
S.actions['cap-confirm-remove-plugin']({dataset:{id:p.id}});assert.equal(p.status,'available');const removed=R.testTool(p.toolIds[0],{query:'已卸载'},{speed:0});await R.waitForRun(removed);assert.equal(removed.status,'failed');S.actions['cap-plugin-toggle']({dataset:{id:p.id}});assert.equal(p.status,'installed');assert.equal(p.enabled,true);
if(hasAgentIntegration){
  S.route='agent';S.params={id:'research',tab:'capabilities'};
  S.pages.agent.render();
  const publishedBeforeCacheBinding=JSON.stringify(S.state.agents[0].publishedConfig);
  S.forms['cap-binding-form'](form({'cap-bind-agent':'research',toolId:'table.upsert',timeoutMs:'15000','cap-bind-approval':'write',contextKind:''}));
  S.actions['as-tab']({dataset:{id:'capabilities'}});
  assert(S.pages.agent.render().includes('更新数据记录'));
  assert(S.state.agents[0].capabilityBindings.some(b=>b.toolId==='table.upsert'));
  assert.equal(JSON.stringify(S.state.agents[0].publishedConfig),publishedBeforeCacheBinding);
  console.log('PASS: capability binding invalidates actual Agent editor cache without modifying published configuration.');
}
console.log('PASS: '+variants.length+' capability route/tab variants; all rendered actions/forms registered; '+bytes+' chars rendered.');
console.log('PASS: shared debug execution, raw transcript/requestId, Agent draft binding without changing published snapshot.');
console.log('PASS: cloned connection tool dispatch, unauthenticated reference handling, live disable enforcement, plugin import/uninstall/reinstall.');
console.log('NOTE: Node VM behavior checks, not browser/visual/focus verification.');
})().catch(e=>{console.error(e);process.exitCode=1;});
