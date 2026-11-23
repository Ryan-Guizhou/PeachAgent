(function () {
  'use strict';
  const S=window.Studio,M=S.Models,E=S.escape,copy=value=>JSON.parse(JSON.stringify(value));
  if(!M)return;
  const fail=(code,message)=>Object.assign(new Error(message),{code});
  // All consuming surfaces use the same registry. Legacy names resolve through
  // aliases; option values are stable local IDs, distinct from provider Model IDs.
  M.selectionOptions=(type,selected,options={})=>{
    const rows=M.list({type,enabled:true,capabilities:options.capabilities||[]});
    let current;try{current=M.resolve(selected,{type,enabled:false});}catch(_){}
    const chosen=current?.id||selected||'';
    let html=options.blankLabel!==undefined||!chosen?`<option value="" ${!chosen?'selected':''}>${E(options.blankLabel??'请选择模型')}</option>`:'';
    if(chosen&&!rows.some(model=>model.id===chosen))html+=`<option value="${E(chosen)}" selected>${E(current?.name||selected)} · 不可用，请重新选择</option>`;
    html+=rows.map(model=>`<option value="${E(model.id)}" ${model.id===chosen?'selected':''}>${E(model.name)}</option>`).join('');
    if(!html)html='<option value="">暂无可用模型，请先到模型中心配置</option>';
    return html;
  };
  M.freezeBinding=(selection,previous,options={})=>{
    const type=options.type||'llm',capabilities=options.capabilities||[];
    const selected=M.resolve(selection,{type,capabilities});
    if(options.preserveResolvedSnapshots&&!previous)throw fail('MODEL_SNAPSHOT_MISSING','模型配置快照缺失，请重新保存并发布当前配置。');
    if(previous&&!options.refresh){
      if(selected.id!==previous.id)throw fail('MODEL_SNAPSHOT_MISMATCH','模型选择与固定快照不一致，请重新发布配置。');
      M.assertAvailable(previous,{type,capabilities});return copy(previous);
    }
    return copy(M.snapshot(selection,{type,capabilities}));
  };
  // Migrate only pre-existing configuration owners, never arbitrary user JSON or
  // completed runs. A single explicit capture upgrades old name-based releases.
  // Unknown/disabled models remain blocked rather than silently substituted.
  M.migrateLegacyBindings=()=>{
    const seen=new Set();let upgraded=0;
    function pin(owner,type='llm',selectionKey='model',snapshotKey='modelSnapshot'){
      if(!owner?.[selectionKey]||owner[snapshotKey]||owner.modelBindingMigration?.[selectionKey])return;
      const marker=owner.modelBindingMigration=owner.modelBindingMigration||{};
      try{owner[snapshotKey]=copy(M.snapshot(owner[selectionKey],{type}));marker[selectionKey]={status:'captured',source:'legacy-name',at:new Date().toISOString()};upgraded++;}
      catch(error){marker[selectionKey]={status:'blocked',code:error.code,message:error.message};}
    }
    function knowledge(kb){if(!kb)return;pin(kb.settings,'embedding','embeddingModel','embeddingModelSnapshot');pin(kb.settings,'rerank','rerankModel','rerankModelSnapshot');}
    function agent(value){if(!value||seen.has(value))return;seen.add(value);pin(value);knowledge(value.knowledgeSnapshot);for(const b of value.contextBindings||[]){if(b.agentSnapshot)agent(b.agentSnapshot);if(b.resolvedSnapshot)flow(b.resolvedSnapshot);}}
    function flow(value){if(!value||seen.has(value))return;seen.add(value);for(const node of value.nodes||[]){const c=node.config||{};if(node.type==='llm')pin(c);if(c.agentSnapshot)agent(c.agentSnapshot);if(c.resolvedSnapshot)flow(c.resolvedSnapshot);if(c.body)flow(c.body);knowledge(c.knowledgeSnapshot);}}
    for(const a of S.state.agents||[]){agent(a);agent(a.publishedConfig);for(const version of a.publishedVersions||[])agent(version);}
    for(const f of S.Runtime?.flows||[]){flow(f);flow(f.publishedSnapshot);for(const version of f.versions||[])flow(version);}
    for(const app of S.state.publishing?.apps||[])for(const version of app.versions||[])(app.kind==='agent'?agent:flow)(version.snapshot);
    for(const kb of S.state.contentStore?.knowledge||[]){knowledge(kb);for(const version of kb.versions||[])knowledge(version);}
    return upgraded;
  };
  M.migrateLegacyBindings();
}());
