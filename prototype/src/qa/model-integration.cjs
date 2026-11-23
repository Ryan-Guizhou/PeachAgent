/* Cross-module behavior using actual code. Does not verify browser layout. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {setup}=require('./expanded-harness.cjs');
const plain=value=>JSON.parse(JSON.stringify(value));
const pass=[],renders=[];
async function check(name,fn){await fn();pass.push(name);console.log('PASS '+name);}
const expectCode=(fn,code)=>assert.throws(fn,error=>error.code===code,code);
async function done(R,run){await R.waitForRun(run);assert.equal(run.status,'done',run.error||run.status);return run;}
function render(S,route,params={}){S.go(route,params);const html=S.pages[route].render();renders.push({route,params,html});return html;}
(async()=>{
  await check('typed selectors and new workflow nodes use maintained defaults; foreign types cannot reuse a stale LLM snapshot',()=>{
    const {S,R}=setup(),M=S.Models;
    M.setDefault('llm','openai');assert.equal(R.newNode('llm').config.model,'openai');
    const html=M.selectionOptions('llm','DeepSeek Chat');assert.match(html,/value="deepseek" selected/);assert.ok(!html.includes('model-demo-embedding'));
    const llm=M.resolve('deepseek'),provider=M.providers().find(p=>p.id===llm.providerId);
    M.saveModel({...llm,modelId:'overlapping-external-id'});
    const embedding=M.saveModel({name:'overlapping-external-id',providerId:provider.id,modelId:'new-embedding',type:'embedding',adapter:'openai-embeddings',config:M.typeConfig('embedding'),capabilities:{},enabled:true});
    expectCode(()=>M.freezeBinding(embedding.name,M.snapshot(llm.id),{type:'llm',preserveResolvedSnapshots:true}),'MODEL_TYPE_MISMATCH');
    expectCode(()=>M.freezeBinding('openai',M.snapshot('deepseek'),{type:'llm',preserveResolvedSnapshots:true}),'MODEL_SNAPSHOT_MISMATCH');
    const disabled=M.resolve('openai');M.setStatus('model',disabled.id,'disable');assert.match(M.selectionOptions('llm',disabled.id),/不可用/);
  });
  await check('published Agent chat keeps model/provider revisions; explicit republishing refreshes its own model',async()=>{
    const {S,R}=setup(),M=S.Models,a=S.state.agents[0],published=plain(a.publishedConfig.modelSnapshot);
    const model=M.resolve(a.model);M.saveModel({...model,config:{...model.config,temperature:.12}});
    const provider=M.providers().find(p=>p.id===published.providerId);M.saveProvider({...provider,timeoutMs:12000});
    const run=await done(R,S.AgentStudio.start({agentId:a.id,goal:'检索模型配置'}));
    assert.equal(run.modelSnapshot.revision,published.revision);assert.equal(run.modelSnapshot.config.temperature,published.config.temperature);assert.equal(run.modelSnapshot.provider.timeoutMs,published.provider.timeoutMs);
    S.go('agent',{id:a.id});S.AgentStudio.saveConfig(true);
    assert.equal(a.publishedConfig.modelSnapshot.config.temperature,.12);assert.equal(a.publishedConfig.modelSnapshot.provider.timeoutMs,12000);
    assert.equal(run.modelSnapshot.config.temperature,published.config.temperature);
  });
  await check('new parent versions keep published child model revisions and historical workflow runs keep their original models',async()=>{
    const {S,R}=setup(),M=S.Models,child=S.state.agents[0],previous=plain(child.publishedConfig.modelSnapshot);
    const model=M.resolve(child.model);M.saveModel({...model,config:{...model.config,temperature:.19}});
    const parent=plain(S.state.agents[1]);parent.contextBindings=[{kind:'agent',id:child.id,version:child.publishedConfig.version,enabled:true}];
    const frozen=S.AgentStudio.freezeSnapshot(parent,{refresh:true});assert.equal(frozen.contextBindings[0].agentSnapshot.modelSnapshot.revision,previous.revision);
    const workflow={id:'model-consumer',version:'1.0',nodes:[R.newNode('agent',{id:'agent-node',config:{agentId:child.id}})],edges:[]};
    const graph=R.freezeWorkflow(workflow,{refresh:true});assert.equal(graph.nodes[0].config.agentSnapshot.modelSnapshot.revision,previous.revision);
    const historical={id:'old-llm',version:'1.0',nodes:[R.newNode('llm',{id:'llm-node',config:{model:child.model,modelSnapshot:previous,prompt:'检索模型配置'}})],edges:[]};
    const run=await done(R,R.runWorkflow(historical,{inputs:{topic:'模型配置'},speed:0}));assert.equal(run.snapshot.nodes[0].config.modelSnapshot.revision,previous.revision);
    assert.equal(run.events.find(e=>e.type==='model.usage').data.modelSnapshot.revision,previous.revision);
  });
  await check('type and capability failures block before model usage; live disable blocks fixed Agent and node runs',async()=>{
    const {S,R}=setup(),M=S.Models,a=S.state.agents[0];
    const snap=S.AgentStudio.freezeSnapshot(a);snap.model=M.defaults('embedding');
    const bad=S.AgentStudio.start({agentId:a.id,snapshot:snap,goal:'验证错误类型',preserveResolvedSnapshots:true});await R.waitForRun(bad);assert.equal(bad.errorCode,'MODEL_TYPE_MISMATCH');assert.equal(bad.tokens,0);
    M.setStatus('model','deepseek','disable');
    const blocked=S.AgentStudio.start({agentId:a.id,snapshot:a.publishedConfig,goal:'模型不可用',preserveResolvedSnapshots:true});await R.waitForRun(blocked);assert.equal(blocked.errorCode,'MODEL_DISABLED');assert.equal(blocked.toolCalls.length,0);
    const node=R.testNode(R.newNode('llm',{config:{model:'deepseek',prompt:'试调'}}),{speed:0});await R.waitForRun(node);assert.equal(node.errorCode,'MODEL_DISABLED');assert.equal(node.tokens,0);
  });
  await check('knowledge maintains typed embedding/rerank settings and versions; retrieval actually produces frozen model stages',async()=>{
    const {S,R,nodes}=setup(),M=S.Models,C=S.ContentStore;
    const settings={chunkSize:200,overlap:20,retrievalMode:'hybrid',embeddingModel:M.defaults('embedding'),rerankModel:M.defaults('rerank')};
    expectCode(()=>C.saveKnowledge({name:'错误向量类型',settings:{...settings,embeddingModel:'deepseek'}}),'MODEL_TYPE_MISMATCH');
    expectCode(()=>C.saveKnowledge({name:'缺少向量模型',settings:{...settings,embeddingModel:''}}),'EMBEDDING_REQUIRED');
    const kb=C.saveKnowledge({name:'模型检索配置',description:'验证检索模型与实际正文',settings});
    C.addDocument(kb.id,{name:'模型使用说明',content:'语言模型负责回答与工具调用。向量模型负责资料召回，重排模型对候选片段排序。模型配置必须符合使用位置需要的类型。'});
    C.addDocument(kb.id,{name:'餐饮记录',content:'今天的午餐包含米饭、青菜和汤。'});
    const snapshot=C.snapshotKnowledge(kb.id),retrieved=C.searchSnapshot(snapshot,'向量模型',{scoreThreshold:0});
    assert.equal(retrieved.modelStages.length,2);assert.equal(retrieved.mode,'local-hybrid-rerank-simulation');assert.equal(retrieved.items[0].title,'模型使用说明');assert.ok(retrieved.items[0].retrievalScore>=0);
    const model=M.resolve(settings.embeddingModel);M.saveModel({...model,config:{...model.config,dimensions:512}});
    assert.equal(C.searchSnapshot(snapshot,'向量模型').modelStages[0].snapshot.revision,snapshot.settings.embeddingModelSnapshot.revision);
    const debug=await done(R,R.testNode(R.newNode('knowledge',{config:{knowledge:kb.id,topK:3,scoreThreshold:0,rerank:true}}),{inputs:{query:'向量模型'},speed:0}));
    assert.deepEqual(plain(debug.events.filter(e=>e.type==='model.usage').map(e=>e.data.stage)),['embedding','rerank']);
    assert.ok(M.references(settings.embeddingModel).some(ref=>ref.kind==='知识库'));
    C.openKnowledge({id:kb.id});renders.push({route:'dialog',scenario:'typed-knowledge-models',html:nodes.get('app-dialog').innerHTML});
    render(S,'knowledge-detail',{id:kb.id,tab:'retrieve'});
    M.setStatus('model',settings.rerankModel,'disable');expectCode(()=>C.searchSnapshot(snapshot,'向量模型'),'MODEL_DISABLED');
    assert.equal(C.searchSnapshot(snapshot,'向量模型',{rerank:false}).modelStages.length,1);
  });
  await check('planning and model ownership are represented in shared chrome and Trace without fake rerun actions',async()=>{
    const {S,R}=setup();const source=await done(R,S.AgentStudio.start({agentId:'research',mode:'plan',goal:'分析模型的工具调用方式'}));
    assert.equal(source.plan.schema,'delegation-v1');
    render(S,'task',{id:source.id});const run=S.Planning.execute(source.id);await done(R,run);
    const html=render(S,'task',{id:run.id});assert.match(html,/自主任务计划/);assert.match(html,/查看或复制计划/);assert.ok(!html.includes('data-action="run-rerun"'));
    render(S,'agent',{id:'research'});render(S,'chat',{agent:'research'});
  });
  fs.mkdirSync(path.resolve(__dirname,'.generated'),{recursive:true});fs.writeFileSync(path.resolve(__dirname,'.generated/model-integration-rendered.json'),JSON.stringify(renders));
  console.log(`PASS: ${pass.length} cross-module model behavior groups; ${renders.length} rendered states. Browser verification remains separate.`);
})().catch(error=>{console.error(error);process.exit(1);});
