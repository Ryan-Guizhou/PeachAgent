'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('node:assert/strict');
const {setup}=require('./expanded-harness.cjs');
const base=path.resolve(__dirname,'..');
function boot(saved){const h=setup(saved);if(!h.S.Models)vm.runInContext(fs.readFileSync(path.join(base,'models.js'),'utf8'),h.context,{filename:'models.js'});return h;}
const plain=v=>JSON.parse(JSON.stringify(v));
function code(fn,c){assert.throws(fn,e=>e.code===c,`expected ${c}`);}
let checks=0;
function check(name,fn){fn();checks++;console.log('PASS '+name);}
(async()=>{
 const h=boot(),{S}=h,M=S.Models,renders=[];
 const render=(route,params={})=>{S.go(route,params);const html=S.pages[route].render();renders.push({route,params,html});return html;};
 const modal=(label)=>{renders.push({route:'dialog',params:{scenario:label},html:h.nodes.get('app-dialog').innerHTML});};
 check('legacy names migrate once with stable ids and capability declarations',()=>{
   for(const name of ['GPT-4.1','DeepSeek Chat','Qwen Plus','Claude Sonnet']){const m=M.resolve(name,{type:'llm',capabilities:['tools']});assert.equal(m.type,'llm');assert.ok(m.declaration.includes('迁移'));assert.equal(M.resolve(m.id).id,m.id);}
   assert.equal(M.list({type:'llm',enabled:true}).length,4);assert.equal(M.list({type:'embedding',enabled:true}).length,1);
   const clone=M.list();clone[0].name='mutated';assert.notEqual(M.list()[0].name,'mutated');
 });
 check('type and capability errors reject invalid selectors without fallbacks',()=>{
   const embed=M.list({type:'embedding'})[0];code(()=>M.resolve(embed.id,{type:'llm'}),'MODEL_TYPE_MISMATCH');
   code(()=>M.resolve('missing-model'),'MODEL_NOT_FOUND');assert.equal(M.validate(embed.id,{type:'rerank'}).ok,false);
   assert.ok(M.list({type:'llm',enabled:true,capabilities:['tools']}).every(m=>m.capabilities.tools));
 });
 check('templates and request adapters keep rerank separate from OpenAI shape',()=>{
   assert.ok(M.templates.length>=18);assert.ok(!M.adapters['openai-chat'].types.includes('rerank'));
   assert.ok(!M.adapters['openai-embeddings'].types.includes('rerank'));assert.ok(M.adapters['cohere-rerank'].types.includes('rerank'));
   assert.equal(M.recommendedAdapter('openai-compatible','rerank'),'');
 });
 const p=M.saveProvider({name:'Contract gateway',template:'custom',protocol:'custom',baseUrl:'https://gateway.example',auth:'reference',credentialRef:'env:TEAM_MODEL_KEY',apiKey:'RAW-KEY-SENTINEL',password:'RAW-PASSWORD-SENTINEL',timeoutMs:3000,retries:2,enabled:true});
 check('provider CRUD persists references and drops credential bodies',()=>{
   assert.equal(M.providers().find(x=>x.id===p.id).credentialRef,'env:TEAM_MODEL_KEY');
   const saved=S.serializeState();assert.ok(!saved.includes('RAW-KEY-SENTINEL'));assert.ok(!saved.includes('RAW-PASSWORD-SENTINEL'));
   code(()=>M.saveProvider({...p,credentialRef:'sk-test-raw-secret'}),'CREDENTIAL_REFERENCE_INVALID');
   code(()=>M.saveProvider({...p,baseUrl:'https://user:secret@example.com'}),'CONFIG_INVALID');
   code(()=>M.saveProvider({...p,baseUrl:'https://example.com?key=secret'}),'CONFIG_INVALID');
   code(()=>M.saveProvider({...p,baseUrl:'http://remote.example'}),'CONFIG_INVALID');
   assert.equal(M.saveProvider({...p,baseUrl:'http://localhost:8000'}).revision,2);
 });
 const made={};
 for(const type of Object.keys(M.types))made[type]=M.saveModel({name:'Contract '+type,modelId:'test-'+type,providerId:p.id,type,adapter:'custom-http',requestPath:'/model/'+type,capabilities:{tools:false,json:false},config:M.typeConfig(type),enabled:true});
 check('all six model types save only typed config and explicit capabilities',()=>{
   for(const [type,m]of Object.entries(made)){assert.equal(M.resolve(m.id,{type}).type,type);assert.deepEqual(plain(M.resolve(m.id).config),plain(M.typeConfig(type)));}
   code(()=>M.resolve(made.llm.id,{capabilities:['tools']}),'MODEL_CAPABILITY_MISMATCH');
   assert.ok(!M.list({type:'llm',enabled:true,capabilities:['tools']}).some(m=>m.id===made.llm.id));
   code(()=>M.saveModel({...made.rerank,adapter:'openai-chat'}),'PROTOCOL_TYPE_MISMATCH');
   code(()=>M.saveModel({...made.embedding,config:{dimensions:0}}),'CONFIG_INVALID');
   code(()=>M.saveModel({...made.rerank,config:{topN:10,maxDocuments:3}}),'CONFIG_INVALID');
   code(()=>M.saveModel({...made.llm,config:{contextWindow:4096,maxOutputTokens:8192}}),'CONFIG_INVALID');
   code(()=>M.saveModel({...made.llm,modelId:'two words'}),'CONFIG_INVALID');
   code(()=>M.saveModel({...made.llm,name:'openai'}),'MODEL_NAME_CONFLICT');
 });
 check('rename aliases and deep frozen snapshots retain exact earlier config',()=>{
   const snap=M.snapshot(made.llm.id,{type:'llm'});assert.ok(Object.isFrozen(snap));assert.ok(Object.isFrozen(snap.config));assert.ok(Object.isFrozen(snap.provider));
   M.saveModel({...made.llm,name:'Renamed language model',capabilities:{tools:true,json:true},config:{...made.llm.config,temperature:.3}});
   assert.equal(M.resolve('Contract llm').id,made.llm.id);assert.equal(M.resolve(made.llm.id).name,'Renamed language model');assert.equal(snap.name,'Contract llm');assert.equal(snap.config.temperature,.7);assert.equal(snap.capabilities.tools,false);
   assert.equal(M.assertAvailable(snap,{type:'llm'}).id,made.llm.id);code(()=>M.assertAvailable(snap,{type:'llm',capabilities:['tools']}),'MODEL_CAPABILITY_MISMATCH');
   M.setStatus('provider',p.id,'disable');code(()=>M.assertAvailable(snap),'PROVIDER_DISABLED');assert.equal(M.list({enabled:true}).some(m=>m.providerId===p.id),false);M.setStatus('provider',p.id,'enable');
 });
 check('defaults enforce type and referenced models cannot be deleted or retyped',()=>{
   M.setDefault('embedding',made.embedding.id);assert.equal(M.defaults('embedding'),made.embedding.id);
   code(()=>M.setDefault('llm',made.embedding.id),'MODEL_TYPE_MISMATCH');code(()=>M.remove('model',made.embedding.id),'MODEL_IN_USE');
   code(()=>M.saveModel({...made.embedding,type:'llm',adapter:'openai-embeddings'}),'PROTOCOL_TYPE_MISMATCH');
   code(()=>M.saveModel({...made.embedding,type:'llm',adapter:'custom-http'}),'MODEL_IN_USE');
   const agent=S.state.agents[0],old=agent.model;agent.model=made.rerank.id;assert.ok(M.references(made.rerank.id).some(x=>x.kind==='Agent'));agent.model=old;
   S.state.contentStore.knowledge.push({id:'models-contract-kb',name:'Contract knowledge',settings:{embeddingModel:made.embedding.id,rerankModel:made.rerank.id}});
   assert.ok(M.references(made.embedding.id).some(x=>x.kind==='知识库'));assert.ok(M.references(made.rerank.id).some(x=>x.kind==='知识库'));
   S.state.contentStore.knowledge=S.state.contentStore.knowledge.filter(k=>k.id!=='models-contract-kb');
   code(()=>M.remove('provider',p.id),'PROVIDER_IN_USE');
 });
 check('stop/archive/restore do not silently change defaults or enable models',()=>{
   M.setStatus('model',made.embedding.id,'disable');assert.equal(M.defaults('embedding'),made.embedding.id);code(()=>M.resolve(made.embedding.id),'MODEL_DISABLED');
   M.setStatus('model',made.embedding.id,'archive');assert.ok(M.list({archived:true}).some(m=>m.id===made.embedding.id));
   code(()=>M.setStatus('model',made.embedding.id,'enable'),'CONFIG_INVALID');M.setStatus('model',made.embedding.id,'restore');assert.equal(M.resolve(made.embedding.id,{enabled:false}).enabled,false);M.setStatus('model',made.embedding.id,'enable');
 });
 check('published API and quality snapshots prevent deletion even after source removal',()=>{
   const serviceModel=M.saveModel({name:'Service-only frozen model',modelId:'service-only-model',providerId:p.id,type:'llm',adapter:'custom-http',requestPath:'/llm',config:M.typeConfig('llm'),capabilities:{},enabled:true});
   const evaluationModel=M.saveModel({name:'Evaluation-only frozen model',modelId:'evaluation-only-model',providerId:p.id,type:'llm',adapter:'custom-http',requestPath:'/llm',config:M.typeConfig('llm'),capabilities:{},enabled:true});
   const source={model:serviceModel.id,modelSnapshot:M.snapshot(serviceModel.id)};
   S.state.publishing.apps.push({id:'models-service-reference',name:'Frozen API version',kind:'agent',versions:[{id:'v1',snapshot:source}]});
   S.state.qualityData.experiments.push({id:'models-quality-reference',name:'Frozen quality target',status:'done',target:{kind:'agent',snapshot:{model:evaluationModel.id,modelSnapshot:M.snapshot(evaluationModel.id)}}});
   assert.ok(M.references(serviceModel.id).some(r=>r.kind==='API 服务版本'&&r.route==='service'));code(()=>M.remove('model',serviceModel.id),'MODEL_IN_USE');
   assert.ok(M.references(evaluationModel.id).some(r=>r.kind==='评测任务'&&r.route==='experiment'));code(()=>M.remove('model',evaluationModel.id),'MODEL_IN_USE');
   M.saveModel({...M.resolve(serviceModel.id),name:'Renamed service model'});assert.ok(M.references(serviceModel.id).some(r=>r.kind==='API 服务版本'));
   S.state.publishing.apps=S.state.publishing.apps.filter(a=>a.id!=='models-service-reference');S.state.qualityData.experiments=S.state.qualityData.experiments.filter(e=>e.id!=='models-quality-reference');
   M.remove('model',serviceModel.id);M.remove('model',evaluationModel.id);
 });
 check('moving a model cannot delete a provider still pinned by released snapshots',()=>{
   const original=M.saveProvider({name:'Original frozen connection',template:'custom',protocol:'custom',baseUrl:'https://original.example',auth:'none',enabled:true});
   const moving=M.saveModel({name:'Model with fixed provider',modelId:'provider-pinned',providerId:original.id,type:'llm',adapter:'custom-http',requestPath:'/llm',config:M.typeConfig('llm'),capabilities:{},enabled:true});
   const pinned=M.snapshot(moving.id);
   S.state.publishing.apps.push({id:'models-provider-reference',name:'Fixed original provider',kind:'agent',versions:[{id:'v1',snapshot:{model:moving.id,modelSnapshot:pinned}}]});
   M.saveModel({...M.resolve(moving.id),providerId:p.id});assert.equal(M.list({providerId:original.id}).length,0);
   assert.ok(M.providerReferences(original.id).some(r=>r.kind==='API 服务版本'));code(()=>M.remove('provider',original.id),'PROVIDER_IN_USE');
   M.setStatus('provider',original.id,'disable');code(()=>M.assertAvailable(pinned),'PROVIDER_DISABLED');M.setStatus('provider',original.id,'enable');
   assert.equal(M.assertAvailable(pinned).id,moving.id);
   S.state.publishing.apps=S.state.publishing.apps.filter(a=>a.id!=='models-provider-reference');M.remove('model',moving.id);M.remove('provider',original.id);
 });
 check('simulated tests and discovery record local outcomes and import idempotently',()=>{
   assert.equal(M.testConnection(p.id).simulated,true);assert.equal(M.testConnection(p.id,'timeout').status,'timeout');assert.equal(M.testConnection(p.id,'unauthorized').status,'unauthorized');
   const found=M.discover(p.id);assert.equal(found.length,6);assert.ok(found.every(c=>c.simulated&&!c.capabilities.tools));
   assert.equal(M.importDiscovered(p.id,['llm','embedding','rerank']).length,3);assert.equal(M.importDiscovered(p.id,['llm','embedding','rerank']).length,0);
   assert.ok(M.discover(p.id).find(c=>c.type==='llm').imported);
 });
 check('typed debug uses caller input and returns matching shapes without network',()=>{
   const llm=M.debug(made.llm.id,{prompt:'Specific input',json:true});assert.equal(llm.output.response.summary,'Specific input');assert.equal(llm.simulated,true);
   const emb=M.debug(made.embedding.id,{texts:['ab','cd']});assert.equal(emb.output.dimensions,768);assert.equal(emb.output.data.length,2);assert.notDeepEqual(plain(emb.output.data[0].vectorPreview),plain(emb.output.data[1].vectorPreview));
   const rerank=M.debug(made.rerank.id,{query:'模型连接',documents:['无关','模型连接配置']});assert.equal(rerank.output.results[0].index,1);
   assert.equal(M.debug(made.image.id,{prompt:'image example'}).output.images.length,1);
   assert.equal(M.debug(made.stt.id,{demoTranscript:'会议十点开始'}).output.text,'会议十点开始');
   assert.equal(M.debug(made.tts.id,{text:'你好'}).output.audio.characters,2);
   const err=M.debug(made.llm.id,{prompt:'timeout'},'timeout');assert.equal(err.error.code,'SIMULATED_TIMEOUT');assert.equal(err.output,null);
   code(()=>M.debug(made.embedding.id,{texts:[]}),'INPUT_INVALID');code(()=>M.debug(made.rerank.id,{query:'x',documents:[]}),'INPUT_INVALID');
   code(()=>M.debug(made.llm.id,{prompt:'test',apiKey:'SECRET'}),'INPUT_INVALID');
   code(()=>M.debug(made.image.id,{prompt:'test',count:11}),'CONFIG_INVALID');
 });
 check('storage failure rolls CRUD back instead of losing previous config',()=>{
   const before=JSON.stringify(S.state.modelRegistry),legacy=JSON.stringify(S.state.models),save=S.save;S.save=()=>false;
   code(()=>M.saveProvider({...M.providers().find(x=>x.id===p.id),name:'Should rollback'}),'STORAGE_WRITE_FAILED');
   assert.equal(JSON.stringify(S.state.modelRegistry),before);assert.equal(JSON.stringify(S.state.models),legacy);S.save=save;
 });
 check('unreferenced deletion and reload preserve saved edits and aliases',()=>{
   const disposable=M.saveModel({name:'Delete me',modelId:'delete-me',providerId:p.id,type:'llm',adapter:'custom-http',requestPath:'/test',config:M.typeConfig('llm'),capabilities:{},enabled:true});M.remove('model',disposable.id);code(()=>M.resolve(disposable.id),'MODEL_NOT_FOUND');
   const next=boot(plain(S.state));assert.equal(next.S.Models.resolve('Contract llm').name,'Renamed language model');assert.equal(next.S.Models.list().length,M.list().length);assert.equal(next.S.Models.defaults('embedding'),made.embedding.id);
 });
 render('models');render('models',{tab:'providers'});render('models',{tab:'defaults'});render('models',{type:'embedding'});render('models',{type:'rerank'});render('models',{archived:'1'});render('models',{provider:p.id});render('models',{page:999});
 for(const m of Object.values(made)){render('model-detail',{id:m.id});render('model-detail',{id:m.id,tab:'debug'});render('model-detail',{id:m.id,tab:'history'});M.openModel(m.id);modal('edit-'+m.type);}
 render('model-detail',{id:'unknown'});render('settings',{tab:'models'});assert.ok(!S.pages.settings.render().includes('gov-model-card'));
 for(const t of M.templates){M.openProvider(undefined,{name:'Template '+t.name,template:t.id,protocol:t.family,baseUrl:t.url,auth:t.auth||'reference',credentialRef:'',apiVersion:'',timeoutMs:60000,retries:1,enabled:true});modal('provider-'+t.id);}
 M.openProvider(p.id);modal('provider-edit');
 for(const type of Object.keys(M.types)){await S.actions['mc-default-edit']({dataset:{type}});modal('default-'+type);}
 await S.actions['mc-discover']({dataset:{id:p.id}});modal('discovery');
 await S.actions['mc-status']({dataset:{kind:'model',id:made.embedding.id,status:'disable'}});modal('disable-with-references');
 await S.actions['mc-delete']({dataset:{kind:'provider',id:p.id}});modal('delete-provider-blocked');
 await S.actions['mc-debug-record']({dataset:{id:S.state.modelRegistry.debugRuns[0].id}});modal('debug-record');
 check('rendered routes and dialogs have escaped data and registered actions',()=>{
   for(const r of renders){assert.ok(r.html.length>40);for(const match of r.html.matchAll(/data-action="([^"]+)"/g))assert.equal(typeof S.actions[match[1]],'function','missing '+match[1]);}
   const bad=M.saveModel({name:'<img src=x onerror=evil()>',modelId:'xss-model',providerId:p.id,type:'llm',adapter:'custom-http',requestPath:'/test',config:M.typeConfig('llm'),capabilities:{},enabled:true});
   const html=render('model-detail',{id:bad.id});assert.ok(!html.includes('<img src=x onerror=evil()>'));assert.ok(html.includes('&lt;img'));
 });
 const out=path.join(__dirname,'.generated','models-rendered.json');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(renders,null,2));
 console.log(`models-contract: ${checks} contracts passed; ${renders.length} actual rendered states -> ${out}`);
})().catch(e=>{console.error(e);process.exitCode=1;});
