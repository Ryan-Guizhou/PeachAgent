(function () {
  'use strict';
  const S = window.Studio, E = S.escape, clone = value => JSON.parse(JSON.stringify(value));
  const now = () => new Date().toISOString();
  const fail = (code, message) => Object.assign(new Error(message), { code });
  const text = value => String(value == null ? '' : value).trim();
  const tags = value => (Array.isArray(value) ? value : String(value || '').split(/[,，]/)).map(text).filter(Boolean).slice(0, 8);
  const versionNext = value => { const parts = String(value || '1.0.0').split('.').map(Number); return (parts[0] || 1) + '.' + (parts[1] || 0) + '.' + ((parts[2] || 0) + 1); };
  const hasSecret = value => /(?:sk-[a-z0-9_-]{12,}|(?:api[_ -]?key|access[_ -]?token|secret|authorization)\s*[:=]\s*["']?[^\s"']{10,})/i.test(String(value || ''));
  const store = S.state.contentStore = S.state.contentStore || { schema: 1, knowledge: [], contents: [], migrated: false, legacyConnections: [], legacyArchive: [] };
  for (const key of ['knowledge', 'contents', 'legacyConnections', 'legacyArchive']) if (!Array.isArray(store[key])) store[key] = [];
  const C = S.ContentStore = {};
  const ui = { knowledgeQuery: '', knowledgeState: 'active', knowledgePage: 1, contentQuery: '', contentType: 'all', contentState: 'active', contentPage: 1, documentQuery: '', documentPage: 1, results: null, query: '', topK: 3, threshold: 0.2, version: '' };
  const PER_PAGE = 8;
  let committed = null;
  const commit = () => {
    S.session.storageUnavailable = false;
    const saved = S.save();
    if (saved === false || S.session.storageUnavailable) {
      if (committed) { store.knowledge = clone(committed.knowledge); store.contents = clone(committed.contents); }
      throw fail('STORAGE_UNAVAILABLE', '本地存储空间不足或不可写入，本次修改未保存。请导出重要内容并释放空间后重试。');
    }
    committed = { knowledge: clone(store.knowledge), contents: clone(store.contents) };
    delete S.session.contentPersistenceError;
  };
  function labelValid(value, label) { const result = text(value); if (!result || result.length > 80) throw fail('INVALID_NAME', label + '请填写 1—80 个字符。'); return result; }
  function bodyValid(value) { const result = String(value == null ? '' : value).replace(/\r\n?/g, '\n'); if (!result.trim()) throw fail('CONTENT_EMPTY', '请填写资料正文。'); if (result.length > 200000) throw fail('CONTENT_TOO_LARGE', '正文最多 200,000 个字符，请拆分资料。'); if (hasSecret(result)) throw fail('SECRET_CONTENT', '检测到疑似访问凭据，请移除后保存。'); return result; }
  function settingsValid(value) {
    const chunkSize=Number(value.chunkSize==null?500:value.chunkSize),overlap=Number(value.overlap==null?50:value.overlap);
    if(!Number.isInteger(chunkSize)||chunkSize<100||chunkSize>2000)throw fail('INVALID_CHUNK','分段长度应为 100—2,000 的整数。');
    if(!Number.isInteger(overlap)||overlap<0||overlap>=chunkSize||overlap>500)throw fail('INVALID_OVERLAP','重叠长度应为 0—500 的整数，且小于分段长度。');
    const retrievalMode=value.retrievalMode||'keyword',embeddingModel=text(value.embeddingModel),rerankModel=text(value.rerankModel);
    if(!['keyword','vector','hybrid'].includes(retrievalMode))throw fail('RETRIEVAL_MODE','请选择关键词、向量或混合检索。');
    if(retrievalMode!=='keyword'&&!embeddingModel)throw fail('EMBEDDING_REQUIRED','向量或混合检索需要选择一个向量模型。');
    const settings={chunkSize,overlap,retrievalMode,embeddingModel,rerankModel};
    if(embeddingModel){if(!S.Models)throw fail('MODELS_UNAVAILABLE','请先加载模型中心。');settings.embeddingModelSnapshot=clone(S.Models.snapshot(embeddingModel,{type:'embedding'}));}
    if(rerankModel){if(!S.Models)throw fail('MODELS_UNAVAILABLE','请先加载模型中心。');settings.rerankModelSnapshot=clone(S.Models.snapshot(rerankModel,{type:'rerank'}));}
    return settings;
  }
  function splitDocument(document, settings) {
    const content = String(document.content || '');
    const chunks = [];
    if (!content.trim()) return chunks;
    const step = settings.chunkSize - settings.overlap;
    for (let start = 0, index = 0; start < content.length; start += step, index++) {
      const part = content.slice(start, start + settings.chunkSize).trim();
      if (part) chunks.push({ id: document.id + '-chunk-' + index, index, text: part });
      if (start + settings.chunkSize >= content.length) break;
    }
    return chunks;
  }
  function knowledgeSnapshot(kb) {
    return clone({ id: kb.id, name: kb.name, description: kb.description, version: kb.version, revision: kb.revision, settings: kb.settings, documents: kb.documents, origin: kb.origin, created: kb.updated });
  }
  function rememberKnowledge(kb, reason) {
    kb.revision = (kb.revision || 0) + 1;
    kb.version = kb.revision === 1 ? (kb.version || '1.0.0') : versionNext(kb.version);
    kb.updated = now();
    kb.versions = kb.versions || [];
    kb.versions.push({ ...knowledgeSnapshot(kb), reason });
  }
  function contentSnapshot(item) {
    return clone({ id: item.id, type: item.type, name: item.name, title: item.name, description: item.description, content: item.content, template: item.content, version: item.version, arguments: item.arguments || [], dependencies: item.dependencies || [], tags: item.tags || [], origin: item.origin, created: item.updated });
  }
  function rememberContent(item, reason) {
    item.updated = now(); item.versions = item.versions || [];
    item.versions.push({ ...contentSnapshot(item), reason });
  }
  C.listKnowledge = options => store.knowledge.filter(k => options?.archived === true ? k.status === 'archived' : options?.archived === 'all' ? true : k.status !== 'archived');
  C.getKnowledge = id => store.knowledge.find(k => k.id === id || k.name === id || (k.aliases || []).includes(id));
  C.listContent = options => store.contents.filter(item => (!options?.type || options.type === 'all' || item.type === options.type) && (options?.archived === true ? item.status === 'archived' : options?.archived === 'all' ? true : item.status !== 'archived'));
  C.getContent = (id, version) => { const item = store.contents.find(x => x.id === id); if (!item) return null; if (!version || version === item.version) return clone(item); return clone((item.versions || []).find(v => v.version === version) || null); };
  C.saveKnowledge = values => {
    const old = values.id ? C.getKnowledge(values.id) : null;
    if (values.id && !old) throw fail('KNOWLEDGE_MISSING', '知识库已不存在。');
    if (old?.status === 'archived') throw fail('KNOWLEDGE_ARCHIVED', '请先恢复知识库，再修改配置。');
    const name = labelValid(values.name, '知识库名称');
    if (store.knowledge.some(k => k.id !== old?.id && (k.name === name || (k.aliases || []).includes(name)))) throw fail('NAME_EXISTS', '此名称已被现有或历史知识库引用，请换一个名称。');
    const settings = settingsValid(values.settings || old?.settings || {});
    if (hasSecret(name + text(values.description))) throw fail('SECRET_CONTENT', '名称或说明中疑似包含访问凭据。');
    const kb = old || { id: values.id || S.uid('knowledge'), documents: [], revision: 0, version: '1.0.0', created: now(), status: 'active', versions: [] };
    if (old && old.name !== name) kb.aliases = [...new Set([...(kb.aliases || []), old.name])];
    Object.assign(kb, { name, description: text(values.description).slice(0, 500), tags: tags(values.tags), settings });
    kb.documents.forEach(doc => { doc.chunks = splitDocument(doc, settings); doc.status = doc.content ? 'ready' : 'needs_content'; });
    rememberKnowledge(kb, old ? '更新知识库配置与分段' : '创建知识库');
    if (!old) store.knowledge.unshift(kb);
    commit(); return kb;
  };
  // Import a selected source revision as a new independent knowledge base.
  // Validate all documents before the single persistence operation.
  C.importKnowledgeSnapshot = (source, name, origin) => {
    name = labelValid(name || source.name, '知识库名称');
    if (store.knowledge.some(k => k.name === name || (k.aliases || []).includes(name))) throw fail('NAME_EXISTS','知识库名称已存在。');
    const description = text(source.description).slice(0,500);
    if (hasSecret(name+description)) throw fail('SECRET_CONTENT','名称或说明中疑似包含访问凭据。');
    const settings = settingsValid({chunkSize:source.settings?.chunkSize??500,overlap:source.settings?.overlap??50,retrievalMode:'keyword'});
    const docs = source.documents || [];
    if (!Array.isArray(docs) || docs.length>200) throw fail('DOCUMENT_LIMIT','最多导入 200 份资料。');
    let total=0;
    const documents=docs.map(doc=>{
      const content=bodyValid(doc.content), title=labelValid(doc.name,'资料名称');
      total+=content.length;
      if (total>1000000) throw fail('DOCUMENT_LIMIT','导入正文总量最多 1,000,000 字符。');
      const item={id:S.uid('document'),name:title,content,sourceType:'text',status:'ready',created:now(),updated:now()};
      item.chunks=splitDocument(item,settings);return item;
    });
    const kb={id:S.uid('knowledge'),name,description,tags:tags(source.tags),settings,documents,revision:0,version:'1.0.0',created:now(),status:'active',versions:[],origin:clone(origin)};
    rememberKnowledge(kb,'跨项目版本副本；重新配置向量与重排模型');store.knowledge.unshift(kb);commit();return kb;
  };
  C.addDocument = (id, values) => {
    const kb = C.getKnowledge(id); if (!kb || kb.status === 'archived') throw fail('KNOWLEDGE_UNAVAILABLE', '知识库不存在或已归档，请恢复后再维护资料。');
    if (kb.documents.length >= 200 && !values.id) throw fail('DOCUMENT_LIMIT', '每个演示知识库最多 200 份资料。');
    const name = labelValid(values.name, '资料名称'), content = bodyValid(values.content);
    const old = values.id ? kb.documents.find(d => d.id === values.id) : null;
    if (values.id && !old) throw fail('DOCUMENT_MISSING', '资料已被移除。');
    if (kb.documents.some(d => d.id !== old?.id && d.name === name)) throw fail('DOCUMENT_DUPLICATE', '当前知识库已存在同名资料，请编辑原资料或更改名称。');
    const total = kb.documents.reduce((n, d) => n + (d.id === old?.id ? 0 : (d.content || '').length), 0) + content.length;
    if (total > 1000000) throw fail('KNOWLEDGE_LIMIT', '本地演示每个知识库最多保存 1,000,000 个正文字符。');
    const doc = old || { id: S.uid('document'), created: now() };
    Object.assign(doc, { name, content, sourceType: values.sourceType || old?.sourceType || 'text', mime: values.mime || old?.mime || 'text/plain', bytes: new TextEncoder().encode(content).length, updated: now(), status: 'ready' });
    doc.chunks = splitDocument(doc, kb.settings);
    if (!old) kb.documents.unshift(doc);
    rememberKnowledge(kb, old ? '更新资料：' + name : '添加资料：' + name);
    commit(); return doc;
  };
  C.removeDocument = (id, documentId) => {
    const kb = C.getKnowledge(id); if (!kb || kb.status === 'archived') throw fail('KNOWLEDGE_UNAVAILABLE', '请先恢复知识库。');
    const doc = kb.documents.find(d => d.id === documentId); if (!doc) throw fail('DOCUMENT_MISSING', '资料已被移除。');
    kb.documents = kb.documents.filter(d => d.id !== documentId);
    rememberKnowledge(kb, '移除资料：' + doc.name); commit(); return true;
  };
  C.reindex = id => {
    const kb = C.getKnowledge(id); if (!kb || kb.status === 'archived') throw fail('KNOWLEDGE_UNAVAILABLE', '请先恢复知识库。');
    kb.documents.forEach(d => { d.chunks = splitDocument(d, kb.settings); d.status = d.content ? 'ready' : 'needs_content'; d.updated = now(); });
    rememberKnowledge(kb, '重新分段'); commit(); return kb;
  };
  C.references = (kind, id) => {
    const found = []; const kb = C.getKnowledge(id);
    (S.state.agents || []).forEach(a => {
      const matches = config => kind === 'knowledge' ? [id, kb?.name, ...(kb?.aliases || [])].filter(Boolean).includes(config?.knowledge) || config?.knowledgeId === id : (config?.contextBindings || []).some(b => b.id === id && b.enabled !== false);
      if (matches(a)) found.push({ kind: 'agent', id: a.id, name: a.name, published: false });
      if (matches(a.publishedConfig)) found.push({ kind: 'agent', id: a.id, name: a.name + ' · 已发布', published: true });
    });
    (S.state.workflow?.flows || []).forEach(flow => {
      const matches = snapshot => (snapshot?.nodes || []).some(n => (kind === 'knowledge' ? [id, kb?.name, ...(kb?.aliases || [])].filter(Boolean).includes(n.config?.knowledge) || n.config?.knowledgeId === id : n.config?.promptId === id || n.config?.skillId === id) || (n.config?.body?.nodes && matches(n.config.body)));
      if (matches(flow)) found.push({ kind: 'workflow', id: flow.id, name: flow.title, published: false });
      if (matches(flow.publishedSnapshot)) found.push({ kind: 'workflow', id: flow.id, name: flow.title + ' · 已发布', published: true });
    });
    return found;
  };
  C.archive = (kind, id, archived) => {
    const item = kind === 'knowledge' ? C.getKnowledge(id) : store.contents.find(x => x.id === id);
    if (!item) throw fail('CONTENT_MISSING', '内容不存在。');
    item.status = archived === false ? 'active' : 'archived'; item.updated = now(); commit(); return item;
  };
  C.snapshotKnowledge = (id, version) => {
    const kb = C.getKnowledge(id); if (!kb) throw fail('KNOWLEDGE_MISSING', '找不到知识库，请重新选择。');
    if (!version) return knowledgeSnapshot(kb);
    const snapshot = kb.versions.find(v => String(v.version) === String(version) || String(v.revision) === String(version));
    if (!snapshot) throw fail('KNOWLEDGE_VERSION_MISSING', '选定知识库版本已不存在。');
    return clone(snapshot);
  };
  function queryTerms(query) {
    const normalized = text(query).toLocaleLowerCase();
    const terms = normalized.match(/[a-z0-9_-]+|[\u3400-\u9fff]+/g) || [];
    return [...new Set(terms.flatMap(term => /[\u3400-\u9fff]/.test(term) && term.length > 2 ? [term, ...Array.from({ length: term.length - 1 }, (_, i) => term.slice(i, i + 2))] : [term]))];
  }
  function localVector(value){const vector=Array(64).fill(0);for(const term of queryTerms(value)){let hash=2166136261;for(const char of term)hash=Math.imul(hash^char.codePointAt(0),16777619)>>>0;vector[hash%64]++;}const norm=Math.sqrt(vector.reduce((sum,n)=>sum+n*n,0))||1;return vector.map(n=>n/norm);}
  function vectorSimilarity(left,right){return Math.max(0,Math.min(1,left.reduce((sum,n,i)=>sum+n*right[i],0)));}
  C.searchSnapshot = (snapshot, query, options) => {
    const opts = options || {};
    if (text(query).length > 500) throw fail('QUERY_TOO_LONG', '查询内容最多 500 个字符。');
    const terms = queryTerms(query);
    const topK = Math.min(20, Math.max(1, Math.floor(Number(opts.topK) || 3)));
    const thresholdValue = Number(opts.scoreThreshold == null ? 0.2 : opts.scoreThreshold);
    if (!Number.isFinite(thresholdValue) || thresholdValue < 0 || thresholdValue > 1) throw fail('INVALID_THRESHOLD', '最低匹配度应在 0—1 之间。');
    if (!snapshot || !Array.isArray(snapshot.documents)) throw fail('INVALID_KNOWLEDGE_SNAPSHOT', '知识快照不可用。');
    const settings=snapshot.settings||{},retrievalMode=settings.retrievalMode||'keyword',modelStages=[];
    const stage=(key,type)=>{const frozen=settings[key+'Snapshot'];if(!frozen)throw fail('MODEL_SNAPSHOT_MISSING','知识库模型快照缺失，请重新保存知识库设置。');S.Models?.assertAvailable(frozen,{type});return frozen;};
    const embedding=retrievalMode!=='keyword'?stage('embeddingModel','embedding'):null,rerank=settings.rerankModel&&opts.rerank!==false?stage('rerankModel','rerank'):null;
    const queryVector=embedding?localVector(query):null;
    let items = terms.length ? snapshot.documents.flatMap(doc => (doc.chunks || splitDocument(doc, snapshot.settings || { chunkSize: 500, overlap: 50 })).map(chunk => {
      const source = (doc.name + '\n' + chunk.text).toLocaleLowerCase();
      const matched = terms.filter(term => source.includes(term));
      const keywordScore=matched.length/terms.length,vectorScore=queryVector?vectorSimilarity(queryVector,localVector(source)):0;
      const score=retrievalMode==='vector'?vectorScore:retrievalMode==='hybrid'?.5*keywordScore+.5*vectorScore:keywordScore;
      return { id: chunk.id, documentId: doc.id, title: doc.name, text: chunk.text, score: +score.toFixed(4), keywordScore: +keywordScore.toFixed(4), matchedTerms: matched, source: 'knowledge://' + snapshot.id + '/' + doc.id + '#chunk-' + chunk.index, knowledgeId: snapshot.id, version: snapshot.version, chunkIndex: chunk.index };
    })).filter(item => item.score > 0 && item.score >= thresholdValue).sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'zh-CN') || a.chunkIndex - b.chunkIndex) : [];
    if(embedding)modelStages.push({type:'embedding',snapshot:embedding,inputTokens:Math.ceil((text(query).length+snapshot.documents.reduce((sum,doc)=>sum+String(doc.content||'').length,0))/1.7),outputTokens:0});
    if(rerank){const candidates=items.slice(0,Math.max(topK,Math.min(100,Number(rerank.config?.maxDocuments)||50)));modelStages.push({type:'rerank',snapshot:rerank,inputTokens:Math.ceil((text(query).length+candidates.reduce((sum,item)=>sum+item.text.length,0))/1.7),outputTokens:0});items=candidates.map(item=>({...item,retrievalScore:item.score,score:+(.7*item.keywordScore+.3*item.score).toFixed(4)})).sort((a,b)=>b.score-a.score||a.chunkIndex-b.chunkIndex);}
    return { items:items.slice(0,topK),total:items.length,version:snapshot.version,mode:retrievalMode==='keyword'&&!rerank?'local-keyword':'local-'+retrievalMode+(rerank?'-rerank':'')+'-simulation',query:text(query),topK,scoreThreshold:thresholdValue,modelStages,simulation:!!(embedding||rerank) };
  };
  C.searchKnowledge = (id, query, options) => {
    const opts = options || {}, kb = C.getKnowledge(id);
    if (!opts.snapshot && !opts.version && kb?.status === 'archived') throw fail('KNOWLEDGE_ARCHIVED', '知识库已归档，新的检索请先恢复它。');
    return C.searchSnapshot(opts.snapshot || C.snapshotKnowledge(id, opts.version), query, opts);
  };
  C.importDocument = async (id, file, options) => {
    const extension = String(file.name || '').split('.').pop().toLowerCase();
    if (!['txt', 'md', 'json'].includes(extension)) throw fail('UNSUPPORTED_FILE', '当前原型支持 TXT、Markdown 和 JSON 正文；PDF、Word 等格式尚未接入解析器。');
    if (!file.size || file.size > 512 * 1024) throw fail('FILE_SIZE', '请选择非空且不超过 512 KB 的文件。');
    if (typeof file.text !== 'function') throw fail('FILE_READ_UNAVAILABLE', '当前浏览器无法读取文件，请使用粘贴正文。');
    let content = await file.text();
    if (options?.shouldContinue && !options.shouldContinue()) throw fail('IMPORT_CANCELLED', '导入已取消，正文未保存。');
    if (extension === 'json') { try { content = JSON.stringify(JSON.parse(content), null, 2); } catch (_) { throw fail('INVALID_JSON', 'JSON 文件格式错误，请修正后重新导入。'); } }
    return C.addDocument(id, { name: file.name, content, sourceType: 'file', mime: file.type || (extension === 'json' ? 'application/json' : 'text/plain') });
  };
  C.saveContent = values => {
    const old = values.id ? store.contents.find(x => x.id === values.id) : null;
    if (values.id && !old) throw fail('CONTENT_MISSING', '内容已不存在。');
    if (old?.status === 'archived') throw fail('CONTENT_ARCHIVED', '请先恢复内容，再保存新版本。');
    const type = old?.type || values.type;
    if (!['prompt', 'skill'].includes(type)) throw fail('CONTENT_TYPE', '请选择提示词或 Skill。');
    const name = labelValid(values.name, '名称'), content = bodyValid(values.content);
    if (hasSecret(name + text(values.description) + tags(values.dependencies).join(' '))) throw fail('SECRET_CONTENT', '名称、用途或依赖中疑似包含访问凭据。');
    if (store.contents.some(x => x.id !== old?.id && x.type === type && x.name === name)) throw fail('NAME_EXISTS', '同类型下已存在这个名称。');
    const item = old || { id: S.uid(type), type, status: 'active', version: '1.0.0', created: now(), versions: [] };
    if (old) item.version = versionNext(item.version);
    Object.assign(item, { name, description: text(values.description).slice(0, 500), content, tags: tags(values.tags), dependencies: tags(values.dependencies) });
    item.arguments = [...new Set([...content.matchAll(/{{\s*([^{}]+?)\s*}}/g)].map(m => m[1].trim()))].map(name => ({ name, required: true }));
    if (values.marketId) item.marketId = values.marketId;
    if (values.origin && !old) item.origin = { projectId: String(values.origin.projectId), resourceId: String(values.origin.resourceId), version: String(values.origin.version) };
    rememberContent(item, old ? '保存内容更新' : '创建内容');
    if (!old) store.contents.unshift(item); commit(); return item;
  };
  C.copyContent = id => {
    const item = store.contents.find(x => x.id === id); if (!item) throw fail('CONTENT_MISSING', '内容不存在。');
    let name = '', i = 1; do { const suffix = ' · 副本' + (i === 1 ? '' : ' ' + i); name = item.name.slice(0, 80 - suffix.length) + suffix; i++; } while (store.contents.some(x => x.name === name && x.type === item.type));
    return C.saveContent({ ...clone(item), id: undefined, name, marketId: undefined });
  };
  C.listContexts = kind => C.listContent({ type: kind }).map(item => ({ ...contentSnapshot(item), kind: item.type, source: 'content-library', connectionId: null }));
  C.resolveContext = binding => {
    const item = store.contents.find(x => x.id === binding.id);
    if (!item || (binding.kind && item.type !== binding.kind)) throw fail('CONTENT_MISSING', '引用的内容不存在。');
    if (item.status === 'archived' && !binding.version) throw fail('CONTENT_ARCHIVED', '内容已归档，请选择已有固定版本或恢复。');
    const snapshot = binding.version ? item.versions.find(v => v.version === binding.version) : contentSnapshot(item);
    if (!snapshot) throw fail('CONTENT_VERSION_MISSING', '引用的内容版本不存在。');
    return clone(snapshot);
  };
  C.installTemplate = asset => {
    const found = store.contents.find(x => x.marketId === asset.id); if (found) return found;
    return C.saveContent({ name: asset.name, type: asset.type, description: asset.description, content: asset.content || asset.description, tags: asset.tags, marketId: asset.id });
  };
  function migrate() {
    if (store.migrated) return;
    const legacy = S.state.ecoAssets || [];
    legacy.filter(a => a.type === 'knowledge').forEach(a => {
      if (C.getKnowledge(a.id)) return;
      const kb = { id: a.id, name: a.name, description: a.description || '', tags: tags(a.tags), status: 'active', version: '1.0.0', revision: 0, settings: { chunkSize: 500, overlap: 50 }, documents: [], versions: [], created: a.updated || now() };
      if (a.content && !/只保留文件元数据/.test(a.content)) {
        const doc = { id: S.uid('document'), name: '起始资料.md', content: a.content, sourceType: 'text', mime: 'text/markdown', bytes: new TextEncoder().encode(a.content).length, status: 'ready', updated: now() };
        doc.chunks = splitDocument(doc, kb.settings); kb.documents.push(doc);
      }
      store.knowledge.push(kb); rememberKnowledge(kb, '迁移原有知识正文');
    });
    legacy.filter(a => ['prompt', 'skill'].includes(a.type)).forEach(a => {
      if (store.contents.some(x => x.id === a.id)) return;
      const item = { id: a.id, type: a.type, name: a.name, description: a.description || '', content: a.content || '', tags: tags(a.tags), status: 'active', version: a.version || '1.0.0', created: a.updated || now(), marketId: a.marketId, versions: [] };
      item.arguments = [...new Set([...item.content.matchAll(/{{\s*([^{}]+?)\s*}}/g)].map(m => m[1].trim()))].map(name => ({ name, required: true }));
      rememberContent(item, '迁移原有内容'); store.contents.push(item);
    });
    legacy.filter(a => a.type === 'file').forEach(a => {
      let kb = C.getKnowledge(a.parentId);
      if (!kb) {
        kb = C.getKnowledge('knowledge-legacy-files');
        if (!kb) { kb = { id: 'knowledge-legacy-files', name: '历史导入资料', description: '以前仅保存了文件元数据。补充正文后才能检索。', tags: [], status: 'active', version: '1.0.0', revision: 0, settings: { chunkSize: 500, overlap: 50 }, documents: [], versions: [], created: now() }; store.knowledge.push(kb); }
      }
      if (!kb.documents.some(d => d.id === a.id)) kb.documents.push({ id: a.id, name: a.name, content: '', sourceType: 'legacy', mime: a.mime || 'text/plain', bytes: a.size || 0, status: 'needs_content', updated: a.updated || now(), chunks: [] });
      rememberKnowledge(kb, '迁移历史文件元数据');
    });
    legacy.filter(a => a.type === 'mcp').forEach(a => store.legacyConnections.push({ id: a.id, name: a.name, description: a.description, endpoint: a.endpoint, marketId: a.marketId, type: 'mcp', content: a.content }));
    store.legacyArchive = legacy.filter(a => !['knowledge', 'prompt', 'skill', 'file', 'mcp'].includes(a.type)).map(clone);
    S.state.ecoAssets = [];
    store.migrated = true; commit();
  }
  function migrateLegacyKnowledgeReferences() {
    if (store.legacyAgentReferencesMigrated) return;
    const placeholders = new Set(['产品与行业知识库', '品牌内容规范', '经营分析指标库', 'Peach Cloud 工程文档']);
    const clean = config => {
      if (!config || typeof config !== 'object') return;
      if (placeholders.has(config.knowledge) && !C.getKnowledge(config.knowledge)) {
        config.legacyKnowledgeReference = config.knowledge;
        config.knowledge = '';
      }
    };
    (S.state.agents || []).forEach(agent => {
      clean(agent); clean(agent.draft); clean(agent.draftConfig); clean(agent.publishedConfig);
      (agent.publishedVersions || []).forEach(clean);
    });
    store.legacyAgentReferencesMigrated = true;
    commit();
  }
  function migrateRuntimeSkills() {
    if (store.runtimeSkillsMigrated) return;
    const source = S.state.capabilities?.skills;
    if (!Array.isArray(source)) return;
    const moved = new Set();
    source.filter(item => !item.connectionId).forEach(skill => {
      const existing = store.contents.find(item => item.id === skill.id);
      if (existing) { if (existing.type === 'skill') moved.add(skill.id); return; }
      const body = item => String(item.content || item.body || item.template || '');
      let name = String(skill.title || skill.name || '未命名 Skill').slice(0, 80), index = 2;
      const originalName = name;
      while (store.contents.some(item => item.type === 'skill' && item.name === name)) { const suffix = ' · ' + index++; name = originalName.slice(0, 80 - suffix.length) + suffix; }
      const item = { id: skill.id, type: 'skill', name, description: skill.description || '', content: body(skill), tags: tags(skill.tags), dependencies: tags(skill.dependencies), status: skill.status === 'archived' ? 'archived' : 'active', version: String(skill.version || '1.0.0'), created: skill.created || now(), versions: [] };
      const versions = Array.isArray(skill.versions) ? skill.versions : [];
      versions.forEach(entry => {
        const previous = entry.snapshot || entry;
        if (!previous.version || String(previous.version) === item.version) return;
        const snapshot = { ...item, ...clone(previous), id: item.id, type: 'skill', name: previous.name || previous.title || name, content: body(previous), dependencies: tags(previous.dependencies || item.dependencies), version: String(previous.version), updated: previous.updated || previous.created || now() };
        snapshot.arguments = [...new Set([...snapshot.content.matchAll(/{{\s*([^{}]+?)\s*}}/g)].map(match => match[1].trim()))].map(name => ({ name, required: true }));
        if (!item.versions.some(version => version.version === snapshot.version)) item.versions.push({ ...contentSnapshot(snapshot), reason: '迁移 Skill 历史版本' });
      });
      item.arguments = [...new Set([...item.content.matchAll(/{{\s*([^{}]+?)\s*}}/g)].map(match => match[1].trim()))].map(name => ({ name, required: true }));
      rememberContent(item, '迁移本地 Skill');
      store.contents.push(item); moved.add(skill.id);
    });
    S.state.capabilities.skills = source.filter(item => !moved.has(item.id));
    store.runtimeSkillsMigrated = true;
    try { commit(); } catch (error) { S.state.capabilities.skills = source; store.runtimeSkillsMigrated = false; throw error; }
  }
  try { migrate(); migrateRuntimeSkills(); migrateLegacyKnowledgeReferences(); } catch (error) { S.session.contentPersistenceError = error.message; }
  committed = { knowledge: clone(store.knowledge), contents: clone(store.contents) };
  const attr = id => 'data-id="' + E(id) + '"';
  const date = value => new Date(value || Date.now()).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai', month: 'short', day: 'numeric' });
  const badge = item => S.badge(item.status === 'archived' ? '已归档' : '可使用', item.status === 'archived' ? 'neutral' : 'success');
  const field = (label, id, value, help, multiline) => multiline ? '<div class="field"><label class="field-label" for="' + id + '">' + E(label) + '</label><textarea class="textarea" id="' + id + '" name="' + id + '" rows="8" style="resize:none" aria-describedby="' + id + '-error">' + E(value || '') + '</textarea><p class="field-help">' + E(help || '') + '</p><p class="field-error" id="' + id + '-error"></p></div>' : S.field(label, { id, name: id, value: value || '', help });
  const select = (label, id, options, value) => '<div class="field"><label class="field-label" for="' + id + '">' + E(label) + '</label><select class="select" id="' + id + '" name="' + id + '">' + options.map(o => '<option value="' + E(o.id) + '"' + (String(o.id) === String(value) ? ' selected' : '') + '>' + E(o.label) + '</option>').join('') + '</select></div>';
  function inlineError(form, message) { const error = form?.querySelector('.cs-form-error'); if (error) { error.textContent = message; error.focus(); } else S.toast(message, 'error'); }
  function handle(form, callback) { try { const result = callback(); S.closeModal(); S.render(); return result; } catch (error) { inlineError(form, error.message); return null; } }
  function bindSearch(container, id, key, pageKey, resultId, render) {
    const input = container.querySelector('#' + id); if (!input) return;
    let composing = false;
    const update = () => { ui[key] = input.value; ui[pageKey] = 1; const node = container.querySelector('#' + resultId); if (node) node.innerHTML = render(); const clear = input.parentElement?.querySelector('.search-clear'); if (clear) clear.hidden = !input.value; };
    input.addEventListener('compositionstart', () => { composing = true; });
    input.addEventListener('compositionend', () => { composing = false; update(); });
    input.addEventListener('input', event => { if (!composing && !event.isComposing) update(); });
  }
  function pageRows(items, key) { const pages = Math.max(1, Math.ceil(items.length / PER_PAGE)); ui[key] = Math.min(pages, Math.max(1, ui[key] || 1)); return { rows: items.slice((ui[key] - 1) * PER_PAGE, ui[key] * PER_PAGE), pages, total: items.length }; }
  function pager(data, key) {
    return '<div class="cs-pagination"><span class="small muted">共 ' + data.total + ' 项 · 第 ' + ui[key] + ' / ' + data.pages + ' 页</span><div class="row">' + S.btn('上一页', 'cs-page', { variant: 'ghost', small: true, attrs: 'data-key="' + key + '" data-step="-1" ' + (ui[key] === 1 ? 'disabled' : '') }) + S.btn('下一页', 'cs-page', { variant: 'ghost', small: true, attrs: 'data-key="' + key + '" data-step="1" ' + (ui[key] === data.pages ? 'disabled' : '') }) + '</div></div>';
  }
  function knowledgeResults() {
    const q = text(ui.knowledgeQuery).toLowerCase(), items = C.listKnowledge({ archived: ui.knowledgeState === 'archived' }).filter(k => !q || (k.name + ' ' + k.description + ' ' + k.tags.join(' ')).toLowerCase().includes(q)).sort((a, b) => b.updated.localeCompare(a.updated));
    const data = pageRows(items, 'knowledgePage');
    if (!items.length) return S.empty(q ? '没有匹配的知识库' : ui.knowledgeState === 'archived' ? '没有已归档的知识库' : '创建第一份知识库', q ? '清除搜索或更换关键词。' : '把需要反复引用的资料放在一起，供 Agent 和工作流检索。', S.btn(q ? '清除搜索' : '新建知识库', q ? 'cs-knowledge-clear' : 'cs-knowledge-new', { variant: 'secondary', icon: q ? 'close' : 'plus' }));
    return '<div class="cs-table-wrap"><table class="cs-table"><thead><tr><th>知识库</th><th>资料 / 分段</th><th>版本</th><th>更新时间</th><th>状态</th><th>操作</th></tr></thead><tbody>' + data.rows.map(k => '<tr><td><a class="cs-name" href="#knowledge-detail?id=' + encodeURIComponent(k.id) + '">' + E(k.name) + '</a><p class="cs-description">' + E(k.description || '未填写说明') + '</p></td><td>' + k.documents.length + ' / ' + k.documents.reduce((n, d) => n + d.chunks.length, 0) + '</td><td><span class="mono">v' + E(k.version) + '</span></td><td>' + date(k.updated) + '</td><td>' + badge(k) + '</td><td>' + S.btn(k.status === 'archived' ? '恢复' : '管理资料', k.status === 'archived' ? 'cs-restore-kb' : 'cs-knowledge-open', { variant: 'ghost', small: true, attrs: attr(k.id) }) + '</td></tr>').join('') + '</tbody></table></div>' + pager(data, 'knowledgePage');
  }
  function knowledgeModels(settings={}){
    if(!S.Models)return '';
    const modelSelect=(label,id,type,value,blank)=>'<div class="field"><label class="field-label" for="'+id+'">'+label+'</label><select class="select" id="'+id+'" name="'+id+'">'+S.Models.selectionOptions(type,value,{blankLabel:blank})+'</select></div>';
    return '<div class="divider"></div>'+select('检索方式','cs-kb-mode',[{id:'keyword',label:'关键词匹配'},{id:'vector',label:'向量检索 · 本地模拟'},{id:'hybrid',label:'混合检索 · 本地模拟'}],settings.retrievalMode||'keyword')+'<div class="grid-2">'+modelSelect('向量模型','cs-kb-embedding','embedding',settings.embeddingModel||'','关键词检索可不选择')+modelSelect('重排模型','cs-kb-rerank','rerank',settings.rerankModel||'','不重排')+'</div><p class="field-help">向量和混合检索需选择向量模型。切换模型会保存新知识版本；已发布应用保留原配置。向量和重排使用确定性的本地算法模拟，不请求真实模型服务。</p><a class="text-link" href="#models">管理模型与默认用途</a>';
  }
  function openKnowledge(values) {
    const kb = values?.id ? C.getKnowledge(values.id) : null;
    S.modal({ title: kb ? '编辑知识库' : '新建知识库', subtitle: '只管理可检索资料。外部工具请到“工具与连接”配置。', body: '<form id="cs-knowledge-form" data-form="cs-knowledge-save" novalidate><input type="hidden" name="recordId" value="' + E(kb?.id || '') + '">' + field('名称', 'cs-kb-name', kb?.name, '1—80 个字符') + field('说明', 'cs-kb-description', kb?.description, '说明资料范围，帮助使用者选对知识库。') + '<div class="grid-2">' + field('每段字符数', 'cs-kb-size', String(kb?.settings.chunkSize || 500), '100—2,000；调整后重新切分已有资料。') + field('重叠字符数', 'cs-kb-overlap', String(kb?.settings.overlap ?? 50), '0—500，且小于分段长度。') + '</div>' + field('标签', 'cs-kb-tags', (kb?.tags || []).join('，'), '用逗号分隔') + knowledgeModels(kb?.settings) + '<p class="field-error cs-form-error" role="alert" tabindex="-1"></p></form>', footer: S.btn('取消', 'modal-close', { variant: 'secondary' }) + S.btn(kb ? '保存修改' : '创建知识库', 'cs-knowledge-save', { icon: 'check' }) });
  }
  function saveKnowledgeForm(form) {
    if (!form || !S.validate(form, { 'cs-kb-name': '请填写名称', 'cs-kb-size': v => !/^\d+$/.test(v) ? '请输入整数' : null, 'cs-kb-overlap': v => !/^\d+$/.test(v) ? '请输入整数' : null })) return;
    const get = name => form.elements.namedItem(name)?.value||'';
    const kb = handle(form, () => C.saveKnowledge({ id: get('recordId') || undefined, name: get('cs-kb-name'), description: get('cs-kb-description'), tags: get('cs-kb-tags'), settings: { chunkSize: get('cs-kb-size'), overlap: get('cs-kb-overlap'),retrievalMode:get('cs-kb-mode')||'keyword',embeddingModel:get('cs-kb-embedding'),rerankModel:get('cs-kb-rerank') } }));
    if (kb) { S.go('knowledge-detail', { id: kb.id }); S.toast('知识库已保存'); }
  }
  C.openKnowledge = openKnowledge;
  S.page('knowledge', { title: '知识库', section: '资源', render() { return '<div class="cs-page">' + S.header('资料管理', '知识库', '维护可检索的内容，并查看 Agent 与工作流的引用。', S.btn('新建知识库', 'cs-knowledge-new', { icon: 'plus' })) + '<div class="cs-toolbar">' + S.tabs([{ id: 'active', label: '使用中' }, { id: 'archived', label: '已归档' }], ui.knowledgeState, 'cs-knowledge-state') + S.search('cs-knowledge-search', '搜索知识库名称、说明或标签', ui.knowledgeQuery) + '</div><section class="panel" id="cs-knowledge-results">' + knowledgeResults() + '</section><p class="cs-route-note">连接 MCP 服务与配置插件，请前往 <a href="#capabilities">工具与连接</a>；维护测试题和参考答案，请前往 <a href="#quality">质量评测</a>。</p></div>'; }, mount(container) { bindSearch(container, 'cs-knowledge-search', 'knowledgeQuery', 'knowledgePage', 'cs-knowledge-results', knowledgeResults); } });
  S.page('assets', { title: '知识库', section: '资源', render() { return S.pages.knowledge.render(); }, mount() { S.go('knowledge'); } });
  function documentResults(kb) {
    const q = text(ui.documentQuery).toLowerCase(), items = kb.documents.filter(d => !q || (d.name + ' ' + d.content).toLowerCase().includes(q));
    const data = pageRows(items, 'documentPage');
    if (!items.length) return S.empty(q ? '没有匹配的资料' : '知识库还没有资料', q ? '搜索会匹配资料名称和正文。' : '粘贴文本，或导入 TXT、Markdown、JSON 文件。', S.btn(q ? '清除搜索' : '添加资料', q ? 'cs-document-clear' : 'cs-document-new', { variant: 'secondary', attrs: attr(kb.id), icon: q ? 'close' : 'plus' }));
    return '<div class="cs-table-wrap"><table class="cs-table"><thead><tr><th>资料</th><th>正文</th><th>分段</th><th>状态</th><th>操作</th></tr></thead><tbody>' + data.rows.map(d => '<tr><td><button type="button" class="cs-text-button" data-action="cs-document-view" data-kb="' + E(kb.id) + '" ' + attr(d.id) + '>' + E(d.name) + '</button><p class="cs-description">' + date(d.updated) + ' 更新</p></td><td>' + (d.content ? d.content.length.toLocaleString('zh-CN') + ' 字符' : '尚未保存正文') + '</td><td>' + d.chunks.length + '</td><td>' + S.badge(d.status === 'ready' ? '可检索' : '待补正文', d.status === 'ready' ? 'success' : 'warning') + '</td><td><div class="row">' + S.btn('编辑', 'cs-document-edit', { variant: 'ghost', small: true, attrs: 'data-kb="' + E(kb.id) + '" ' + attr(d.id) + (kb.status === 'archived' ? ' disabled' : '') }) + S.btn('移除', 'cs-document-remove', { variant: 'ghost', small: true, attrs: 'data-kb="' + E(kb.id) + '" ' + attr(d.id) + (kb.status === 'archived' ? ' disabled' : '') }) + '</div></td></tr>').join('') + '</tbody></table></div>' + pager(data, 'documentPage');
  }
  function retrievalPanel(kb) {
    const result = ui.results?.knowledgeId === kb.id ? ui.results : null;
    return '<section class="panel cs-section"><div class="cs-section-heading"><div><h2>检索试验</h2><p>按保存的检索配置处理实际正文；向量与重排使用本地算法模拟，分数不代表真实模型质量。</p></div>' + S.badge('本地检索', 'info') + '</div><form id="cs-retrieval-form" data-form="cs-retrieval" novalidate>' + field('查询内容', 'cs-query', ui.query, '修改正文、分段参数或查询条件后，结果会相应变化。') + '<div class="cs-retrieval-options">' + field('返回条数', 'cs-topk', String(ui.topK), '1—20') + field('最低匹配度', 'cs-threshold', String(ui.threshold), '0—1') + select('资料版本', 'cs-version', (kb.versions || []).slice().reverse().map(v => ({ id: v.version, label: (v.version === kb.version ? '当前版本 v' : 'v') + v.version + ' · ' + v.reason })), kb.versions.some(v => v.version === ui.version) ? ui.version : kb.version) + '</div><p class="field-error cs-form-error" role="alert" tabindex="-1"></p><div class="row">' + S.btn('检索', 'cs-retrieval', { attrs: attr(kb.id), icon: 'search' }) + '</div></form><div class="cs-retrieval-results">' + (result ? '<p class="small muted" role="status">v' + E(result.version) + ' · '+E(result.mode)+' · 命中 ' + result.total + ' 个片段，展示 ' + result.items.length + ' 个</p>' + (result.items.length ? result.items.map(item => '<article class="cs-hit"><div class="between"><strong>' + E(item.title) + '</strong><span class="mono">' + (item.score * 100).toFixed(0) + '%</span></div><p>' + E(item.text) + '</p><span class="small muted">第 ' + (item.chunkIndex + 1) + ' 段 · 命中：' + E(item.matchedTerms.join('、')) + '</span></article>').join('') : S.empty('没有达到条件的片段', '尝试修改查询、降低最低匹配度，或补充相关正文。')) : '<p class="small muted">输入问题并检索，结果会显示命中正文和对应版本。</p>') + '</div></section>';
  }
  S.page('knowledge-detail', { title: '知识库详情', section: '资源', render() {
    const kb = C.getKnowledge(S.params.id); if (!kb) return S.empty('知识库不存在', '请从知识库列表重新选择。', S.btn('返回知识库', 'cs-knowledge-list', { variant: 'secondary' }));
    const tab = S.params.tab || 'documents', refs = C.references('knowledge', kb.id);
    const actions = kb.status === 'archived' ? S.btn('恢复知识库', 'cs-restore-kb', { attrs: attr(kb.id), icon: 'refresh' }) : S.btn('编辑设置', 'cs-knowledge-edit', { attrs: attr(kb.id), variant: 'secondary', icon: 'settings' }) + S.btn('添加资料', 'cs-document-new', { attrs: attr(kb.id), icon: 'plus' });
    let body = '';
    if (tab === 'retrieve') body = retrievalPanel(kb);
    else if (tab === 'versions') body = '<section class="panel cs-section"><h2>资料版本</h2><p class="small muted">保存内容或重新分段会产生新版本。已冻结的 Agent、流程和历史运行仍可使用原版本。</p><div class="cs-version-list">' + kb.versions.slice().reverse().map(v => '<div><span class="mono">v' + E(v.version) + '</span><span>' + E(v.reason) + '</span><span class="small muted">' + v.documents.length + ' 份资料</span>' + S.btn('检索此版本', 'cs-search-version', { variant: 'ghost', small: true, attrs: attr(kb.id) + ' data-version="' + E(v.version) + '"' }) + '</div>').join('') + '</div></section>';
    else if (tab === 'references') body = '<section class="panel cs-section"><h2>引用关系</h2><p class="small muted">归档后不能新增引用；已冻结的版本保留。配置草稿中的知识库名称仍可识别。</p>' + (refs.length ? '<div class="cs-reference-list">' + refs.map(r => '<a href="#' + (r.kind === 'agent' ? 'agent' : 'workflow') + '?id=' + encodeURIComponent(r.id) + '">' + S.icon(r.kind, 18) + '<span>' + E(r.name) + '</span>' + S.icon('arrow', 14) + '</a>').join('') + '</div>' : S.empty('还没有被引用', '在 Agent 的知识配置或工作流检索节点中选择此知识库。')) + '</section>';
    else body = '<section class="panel"><div class="cs-toolbar cs-panel-toolbar">' + S.search('cs-document-search', '搜索资料名称或正文', ui.documentQuery) + '<div class="row">' + S.btn('导入文件', 'cs-document-import', { variant: 'secondary', attrs: attr(kb.id) + (kb.status === 'archived' ? ' disabled' : ''), icon: 'upload' }) + S.btn('重新分段', 'cs-reindex', { variant: 'ghost', attrs: attr(kb.id) + (kb.status === 'archived' ? ' disabled' : ''), icon: 'refresh' }) + '</div></div><div id="cs-document-results">' + documentResults(kb) + '</div></section>';
    return '<div class="cs-page"><a class="cs-back" href="#knowledge">' + S.icon('chevron', 14) + '知识库</a>' + S.header('知识库 · v' + kb.version, kb.name, kb.description, actions) + '<div class="cs-summary-line">' + badge(kb) + '<span>' + kb.documents.length + ' 份资料</span><span>每段 ' + kb.settings.chunkSize + ' 字符 / 重叠 ' + kb.settings.overlap + ' 字符</span><span>' + refs.length + ' 处引用</span></div>' + S.tabs([{ id: 'documents', label: '资料' }, { id: 'retrieve', label: '检索试验' }, { id: 'versions', label: '版本' }, { id: 'references', label: '引用关系' }], tab, 'cs-knowledge-tab') + body + '<div class="cs-bottom-actions">' + S.btn('导出当前资料', 'cs-knowledge-export', { variant: 'secondary', icon: 'download', attrs: attr(kb.id) }) + (kb.status !== 'archived' ? S.btn('归档知识库', 'cs-archive', { variant: 'ghost', attrs: 'data-kind="knowledge" ' + attr(kb.id) }) : '') + '</div></div>';
  }, mount(container) { const kb = C.getKnowledge(S.params.id); if (kb && (!S.params.tab || S.params.tab === 'documents')) bindSearch(container, 'cs-document-search', 'documentQuery', 'documentPage', 'cs-document-results', () => documentResults(kb)); } });
  function openDocument(kbId, documentId) {
    const kb = C.getKnowledge(kbId); if (!kb || kb.status === 'archived') return S.toast('请先恢复知识库', 'warning');
    const doc = kb.documents.find(d => d.id === documentId);
    S.modal({ title: doc ? '编辑资料' : '添加资料', subtitle: kb.name + ' · 正文保存在当前浏览器', wide: true, body: '<form id="cs-document-form" data-form="cs-document-save" novalidate><input type="hidden" name="kbId" value="' + E(kb.id) + '"><input type="hidden" name="documentId" value="' + E(doc?.id || '') + '">' + field('资料名称', 'cs-doc-name', doc?.name, '知识库内名称唯一') + field('资料正文', 'cs-doc-content', doc?.content, '保存后立即按知识库设置分段；只使用可公开的演示资料。', true) + '<p class="field-error cs-form-error" role="alert" tabindex="-1"></p></form>', footer: S.btn('取消', 'modal-close', { variant: 'secondary' }) + S.btn('保存并分段', 'cs-document-save', { icon: 'check' }) });
  }
  function saveDocumentForm(form) {
    if (!form || !S.validate(form, { 'cs-doc-name': '请填写资料名称', 'cs-doc-content': '请填写资料正文' })) return;
    const get = name => form.elements.namedItem(name)?.value||'';
    const doc = handle(form, () => C.addDocument(get('kbId'), { id: get('documentId') || undefined, name: get('cs-doc-name'), content: get('cs-doc-content') }));
    if (doc) { ui.results = null; S.toast('资料已保存并分段'); }
  }
  function openImport(kbId) {
    const kb = C.getKnowledge(kbId); if (!kb || kb.status === 'archived') return S.toast('请先恢复知识库', 'warning');
    let active = true, reading = false;
    S.modal({ title: '导入资料文件', subtitle: kb.name, body: '<div class="field"><label class="field-label" for="cs-file-input">选择 TXT、Markdown 或 JSON 文件</label><input class="input" type="file" id="cs-file-input" accept=".txt,.md,.json" multiple aria-describedby="cs-file-help"><p id="cs-file-help" class="field-help">每个文件不超过 512 KB，每次最多 10 个。实际读取正文并保存在本地；PDF、Word 解析尚未接入。</p></div><div id="cs-import-results" class="cs-import-results" role="status">选择文件后逐项导入。重名文件会显示错误，不覆盖已有内容。</div>', footer: S.btn('完成', 'modal-close', { variant: 'secondary' }), onOpen(dialog) {
      dialog.querySelector('#cs-file-input').addEventListener('change', async event => {
        if (reading) return; const files = Array.from(event.target.files || []); if (!files.length) return;
        reading = true; event.target.disabled = true;
        const results = []; if (files.length > 10) results.push('每次最多 10 个文件，多出的文件未处理。');
        for (const file of files.slice(0, 10)) {
          if (!active) break;
          try { const doc = await C.importDocument(kb.id, file, { shouldContinue: () => active }); results.push('已导入 ' + doc.name + ' · ' + doc.chunks.length + ' 段'); } catch (error) { results.push(file.name + '：' + error.message); }
          if (active) dialog.querySelector('#cs-import-results').innerHTML = results.map(message => '<p>' + E(message) + '</p>').join('');
        }
        reading = false; if (active) { event.target.disabled = false; event.target.value = ''; S.render(); }
      });
    }, onClose() { active = false; ui.results = null; S.render(); } });
  }
  function retrieve(form, kbId) {
    if (!form || !S.validate(form, { 'cs-query': '请输入查询内容', 'cs-topk': v => !/^\d+$/.test(v) || +v < 1 || +v > 20 ? '请输入 1—20 的整数' : null, 'cs-threshold': v => !v || !Number.isFinite(+v) || +v < 0 || +v > 1 ? '请输入 0—1 的数字' : null })) return;
    const get = name => form.elements.namedItem(name)?.value||'';
    try { ui.query = get('cs-query'); ui.topK = +get('cs-topk'); ui.threshold = +get('cs-threshold'); ui.version = get('cs-version'); ui.results = { ...C.searchKnowledge(kbId, ui.query, { topK: ui.topK, scoreThreshold: ui.threshold, version: ui.version || undefined }), knowledgeId: kbId }; S.render(); } catch (error) { inlineError(form, error.message); }
  }
  function contentResults() {
    const q = text(ui.contentQuery).toLowerCase(), items = C.listContent({ type: ui.contentType, archived: ui.contentState === 'archived' }).filter(item => !q || (item.name + ' ' + item.description + ' ' + item.tags.join(' ')).toLowerCase().includes(q)).sort((a, b) => b.updated.localeCompare(a.updated)), data = pageRows(items, 'contentPage');
    if (!items.length) return S.empty(q ? '没有匹配的内容' : '还没有可复用内容', '创建提示词模板或 Skill 指引，再从 Agent 中引用。', S.btn(q ? '清除搜索' : '新建内容', q ? 'cs-content-clear' : 'cs-content-new', { variant: 'secondary', icon: q ? 'close' : 'plus' }));
    return '<div class="cs-table-wrap"><table class="cs-table"><thead><tr><th>名称</th><th>类型</th><th>变量 / 依赖</th><th>版本</th><th>更新时间</th><th>操作</th></tr></thead><tbody>' + data.rows.map(item => '<tr><td><a class="cs-name" href="#content-detail?id=' + encodeURIComponent(item.id) + '">' + E(item.name) + '</a><p class="cs-description">' + E(item.description) + '</p></td><td>' + E(item.type === 'skill' ? 'Skill' : '提示词') + '</td><td>' + E(item.type === 'prompt' ? (item.arguments || []).map(a => a.name).join('、') || '无' : (item.dependencies || []).join('、') || '无') + '</td><td><span class="mono">v' + E(item.version) + '</span></td><td>' + date(item.updated) + '</td><td><div class="row">' + S.btn(item.status === 'archived' ? '恢复' : '编辑', item.status === 'archived' ? 'cs-restore-content' : 'cs-content-edit', { variant: 'ghost', small: true, attrs: attr(item.id) }) + S.btn('复制', 'cs-content-copy', { variant: 'ghost', small: true, attrs: attr(item.id) }) + '</div></td></tr>').join('') + '</tbody></table></div>' + pager(data, 'contentPage');
  }
  function openContent(id) {
    const item = id ? store.contents.find(x => x.id === id) : null;
    if (item?.status === 'archived') return S.toast('请先恢复内容', 'warning');
    S.modal({ title: item ? '编辑' + (item.type === 'skill' ? ' Skill' : '提示词') : '新建可复用内容', subtitle: '保存新版本不会改写已发布 Agent 引用的旧版本。', wide: true, body: '<form id="cs-content-form" data-form="cs-content-save" novalidate><input type="hidden" name="recordId" value="' + E(item?.id || '') + '"><div class="grid-2">' + field('名称', 'cs-content-name', item?.name, '1—80 个字符') + select('类型', 'cs-content-type', [{ id: 'prompt', label: '提示词模板' }, { id: 'skill', label: 'Skill 指引' }], item?.type || (ui.contentType === 'skill' ? 'skill' : 'prompt')) + '</div>' + field('用途说明', 'cs-content-description', item?.description, '说明使用时机和预期结果') + field('内容', 'cs-content-body', item?.content, '使用 {{变量名}} 声明模板变量；Skill 可包含步骤和工具使用规则。', true) + '<div class="grid-2">' + field('标签', 'cs-content-tags', (item?.tags || []).join('，'), '用逗号分隔') + field('依赖工具 ID', 'cs-content-dependencies', (item?.dependencies || []).join('，'), '仅作为 Skill 依赖声明，授权仍在 Agent 配置中完成。') + '</div><p class="field-error cs-form-error" role="alert" tabindex="-1"></p></form>', footer: S.btn('取消', 'modal-close', { variant: 'secondary' }) + S.btn(item ? '保存新版本' : '创建内容', 'cs-content-save', { icon: 'check' }), onOpen(dialog) { if (item) dialog.querySelector('#cs-content-type').disabled = true; } });
  }
  C.openContent = openContent;
  function saveContentForm(form) {
    if (!form || !S.validate(form, { 'cs-content-name': '请填写名称', 'cs-content-body': '请填写内容' })) return;
    const get = name => form.elements.namedItem(name)?.value||'';
    const item = handle(form, () => C.saveContent({ id: get('recordId') || undefined, type: get('cs-content-type'), name: get('cs-content-name'), description: get('cs-content-description'), content: get('cs-content-body'), tags: get('cs-content-tags'), dependencies: get('cs-content-dependencies') }));
    if (item) { S.go('content-detail', { id: item.id }); S.toast('内容版本已保存'); }
  }
  S.page('library', { title: '提示词与 Skills', section: '资源', render() {
    return '<div class="cs-page">' + S.header('可复用内容', '提示词与 Skills', '维护模板正文、变量与使用规则；从 Agent 中选择具体版本。', S.btn('新建内容', 'cs-content-new', { icon: 'plus' })) + '<div class="cs-toolbar">' + S.tabs([{ id: 'all', label: '全部' }, { id: 'prompt', label: '提示词' }, { id: 'skill', label: 'Skills' }], ui.contentType, 'cs-content-type') + S.search('cs-content-search', '搜索名称、用途或标签', ui.contentQuery) + select('状态', 'cs-content-status-filter', [{ id: 'active', label: '使用中' }, { id: 'archived', label: '已归档' }], ui.contentState) + '</div><section class="panel" id="cs-content-results">' + contentResults() + '</section><p class="cs-route-note">Skill 是工作指引；它所调用的工具和连接统一在 <a href="#capabilities">工具与连接</a> 管理。</p></div>';
  }, mount(container) { bindSearch(container, 'cs-content-search', 'contentQuery', 'contentPage', 'cs-content-results', contentResults); container.querySelector('#cs-content-status-filter')?.addEventListener('change', event => { ui.contentState = event.target.value; ui.contentPage = 1; S.render(); }); } });
  S.page('content-detail', { title: '内容详情', section: '资源', render() {
    const current = store.contents.find(x => x.id === S.params.id), item = C.getContent(S.params.id, S.params.version);
    if (!current || !item) return S.empty('内容或版本不存在', '从内容库重新选择。', S.btn('返回内容库', 'cs-content-list', { variant: 'secondary' }));
    const historical = item.version !== current.version;
    return '<div class="cs-page"><a class="cs-back" href="#library">' + S.icon('chevron', 14) + '提示词与 Skills</a>' + S.header(item.type === 'skill' ? 'Skill 指引' : '提示词模板', item.name, item.description, S.btn('复制', 'cs-content-copy', { variant: 'secondary', icon: 'copy', attrs: attr(current.id) }) + (current.status === 'archived' ? S.btn('恢复内容', 'cs-restore-content', { attrs: attr(current.id), icon: 'refresh' }) : S.btn('编辑当前版本', 'cs-content-edit', { attrs: attr(current.id), icon: 'edit' }))) + '<div class="cs-content-layout"><section class="panel cs-section"><div class="cs-section-heading"><h2>正文</h2>' + S.badge('v' + item.version + (historical ? ' · 历史版本' : ''), historical ? 'neutral' : 'success') + '</div><pre class="cs-content-body">' + E(item.content) + '</pre><div class="cs-bottom-actions">' + S.btn('复制正文', 'cs-content-copy-body', { variant: 'secondary', attrs: attr(current.id) + ' data-version="' + E(item.version) + '"', icon: 'copy' }) + S.btn('导出', 'cs-content-export', { variant: 'ghost', attrs: attr(current.id) + ' data-version="' + E(item.version) + '"', icon: 'download' }) + '</div></section><aside><section class="panel cs-section"><h2>引用设置</h2><p class="small muted">Agent 绑定内容 ID 和版本；后续修改不会替换已有运行快照。</p><dl class="cs-definition"><div><dt>状态</dt><dd>' + badge(current) + '</dd></div><div><dt>输入变量</dt><dd>' + E((item.arguments || []).map(a => a.name).join('、') || '无') + '</dd></div><div><dt>工具依赖</dt><dd>' + E((item.dependencies || []).join('、') || '无') + '</dd></div></dl><label class="field-label" for="cs-content-version">查看版本</label><select id="cs-content-version" class="select" aria-label="查看内容版本">' + current.versions.slice().reverse().map(v => '<option value="' + E(v.version) + '"' + (v.version === item.version ? ' selected' : '') + '>v' + E(v.version) + ' · ' + date(v.created) + '</option>').join('') + '</select></section><section class="panel cs-section"><h2>分享模板</h2><p class="small muted">审核只公开选定版本，不包含个人连接凭据。</p>' + S.btn('提交资源审核', 'eco-publish', { variant: 'secondary', icon: 'globe', attrs: attr(current.id) + ' data-version="' + E(item.version) + '"' + (current.status === 'archived' ? ' disabled' : '') }) + '</section>' + (current.status !== 'archived' ? '<div class="cs-bottom-actions">' + S.btn('归档内容', 'cs-archive', { variant: 'ghost', attrs: 'data-kind="content" ' + attr(current.id) }) + '</div>' : '') + '</aside></div></div>';
  }, mount(container) { container.querySelector('#cs-content-version')?.addEventListener('change', event => S.go('content-detail', { id: S.params.id, version: event.target.value })); } });
  function archiveDialog(kind, id) {
    const item = kind === 'knowledge' ? C.getKnowledge(id) : C.getContent(id); if (!item) return;
    const refs = C.references(kind, id);
    S.modal({ title: '归档“' + item.name + '”？', subtitle: '可以随时从“已归档”列表恢复。', body: '<p>归档后，此内容不再出现在新增引用的选择器中。已经冻结的内容版本和历史运行仍保留。</p>' + (refs.length ? '<div class="notice warning">当前有 ' + refs.length + ' 处引用，请确认后再归档。<ul>' + refs.map(r => '<li>' + E(r.name) + '</li>').join('') + '</ul></div>' : ''), footer: S.btn('保留', 'modal-close', { variant: 'secondary' }) + S.btn('归档', 'cs-archive-confirm', { variant: 'danger', attrs: 'data-kind="' + kind + '" ' + attr(id) }) });
  }
  S.action('cs-page', el => { ui[el.dataset.key] += Number(el.dataset.step); S.render(); });
  S.action('cs-knowledge-new', () => openKnowledge());
  S.action('cs-knowledge-edit', el => openKnowledge({ id: el.dataset.id }));
  S.action('cs-knowledge-save', () => saveKnowledgeForm(document.getElementById('cs-knowledge-form'))); S.form('cs-knowledge-save', saveKnowledgeForm);
  S.action('cs-knowledge-open', el => { ui.documentQuery = ''; ui.documentPage = 1; ui.results = null; ui.version = ''; S.go('knowledge-detail', { id: el.dataset.id }); });
  S.action('cs-knowledge-list', () => S.go('knowledge'));
  S.action('cs-knowledge-export', el => { const kb = C.getKnowledge(el.dataset.id); if (kb) S.download(kb.name.replace(/[\\/:*?"<>|]/g, '_') + '.json', JSON.stringify(C.snapshotKnowledge(kb.id), null, 2), 'application/json'); });
  S.action('cs-knowledge-state', el => { ui.knowledgeState = el.dataset.id; ui.knowledgePage = 1; S.render(); });
  S.action('cs-knowledge-clear', () => { ui.knowledgeQuery = ''; ui.knowledgePage = 1; S.render(); document.getElementById('cs-knowledge-search')?.focus(); });
  S.action('cs-knowledge-tab', el => S.go('knowledge-detail', { id: S.params.id, tab: el.dataset.id }));
  S.action('cs-search-version', el => { ui.version = el.dataset.version; ui.results = null; S.go('knowledge-detail', { id: el.dataset.id, tab: 'retrieve' }); });
  S.action('cs-document-new', el => openDocument(el.dataset.id || S.params.id));
  S.action('cs-document-edit', el => openDocument(el.dataset.kb, el.dataset.id));
  S.action('cs-document-save', () => saveDocumentForm(document.getElementById('cs-document-form'))); S.form('cs-document-save', saveDocumentForm);
  S.action('cs-document-import', el => openImport(el.dataset.id || S.params.id));
  S.action('cs-document-clear', () => { ui.documentQuery = ''; ui.documentPage = 1; S.render(); document.getElementById('cs-document-search')?.focus(); });
  S.action('cs-document-view', el => {
    const kb = C.getKnowledge(el.dataset.kb), doc = kb?.documents.find(d => d.id === el.dataset.id); if (!doc) return;
    S.drawer({ title: doc.name, subtitle: doc.chunks.length + ' 个片段 · v' + kb.version, body: '<h3>完整正文</h3><pre class="cs-content-body">' + E(doc.content || '历史导入只保存了文件元数据，请编辑并补充正文。') + '</pre><h3 class="cs-subheading">分段预览</h3>' + doc.chunks.map((chunk, i) => '<details class="cs-chunk"><summary>第 ' + (i + 1) + ' 段 · ' + chunk.text.length + ' 字符</summary><pre>' + E(chunk.text) + '</pre></details>').join(''), footer: S.btn('关闭', 'modal-close', { variant: 'secondary' }) + (kb.status === 'archived' ? '' : S.btn('编辑正文', 'cs-document-edit', { attrs: attr(doc.id) + ' data-kb="' + E(kb.id) + '"', icon: 'edit' })) });
  });
  S.action('cs-document-remove', el => {
    const kb = C.getKnowledge(el.dataset.kb), doc = kb?.documents.find(d => d.id === el.dataset.id); if (!doc) return;
    S.modal({ title: '移除“' + doc.name + '”？', subtitle: '当前版本将不再检索这份资料。历史版本仍保留。', body: '<p>如果已有 Agent 或运行固定引用旧版本，它们继续使用原来的资料快照。</p>', footer: S.btn('保留资料', 'modal-close', { variant: 'secondary' }) + S.btn('移除资料', 'cs-document-remove-confirm', { variant: 'danger', attrs: attr(doc.id) + ' data-kb="' + E(kb.id) + '"' }) });
  });
  S.action('cs-document-remove-confirm', el => { try { C.removeDocument(el.dataset.kb, el.dataset.id); ui.results = null; S.closeModal(); S.render(); S.toast('资料已从当前版本移除'); } catch (error) { S.toast(error.message, 'error'); } });
  S.action('cs-reindex', el => { try { C.reindex(el.dataset.id); ui.results = null; S.render(); S.toast('已按当前设置重新分段'); } catch (error) { S.toast(error.message, 'error'); } });
  S.action('cs-retrieval', el => retrieve(document.getElementById('cs-retrieval-form'), el.dataset.id || S.params.id)); S.form('cs-retrieval', form => retrieve(form, S.params.id));
  S.action('cs-content-new', () => openContent()); S.action('cs-content-edit', el => openContent(el.dataset.id));
  S.action('cs-content-save', () => saveContentForm(document.getElementById('cs-content-form'))); S.form('cs-content-save', saveContentForm);
  S.action('cs-content-copy', el => { try { const item = C.copyContent(el.dataset.id); S.go('content-detail', { id: item.id }); S.toast('副本已创建'); } catch (error) { S.toast(error.message, 'error'); } });
  S.action('cs-content-copy-body', el => S.copy(C.getContent(el.dataset.id, el.dataset.version)?.content || ''));
  S.action('cs-content-export', el => { const item = C.getContent(el.dataset.id, el.dataset.version); if (item) S.download(item.name.replace(/[\\/:*?"<>|]/g, '_') + '.md', item.content, 'text/markdown'); });
  S.action('cs-content-list', () => S.go('library'));
  S.action('cs-content-type', el => { ui.contentType = el.dataset.id; ui.contentPage = 1; S.render(); });
  S.action('cs-content-clear', () => { ui.contentQuery = ''; ui.contentPage = 1; S.render(); document.getElementById('cs-content-search')?.focus(); });
  S.action('cs-archive', el => archiveDialog(el.dataset.kind, el.dataset.id));
  S.action('cs-archive-confirm', el => { try { C.archive(el.dataset.kind, el.dataset.id, true); S.closeModal(); S.render(); S.toast('已归档，可从归档列表恢复'); } catch (error) { S.toast(error.message, 'error'); } });
  S.action('cs-restore-kb', el => { try { C.archive('knowledge', el.dataset.id, false); S.render(); S.toast('知识库已恢复'); } catch (error) { S.toast(error.message, 'error'); } });
  S.action('cs-restore-content', el => { try { C.archive('content', el.dataset.id, false); S.render(); S.toast('内容已恢复'); } catch (error) { S.toast(error.message, 'error'); } });
  S.action('eco-asset-create', () => openContent());
  S.action('eco-asset-edit', el => {
    const id = el.dataset.id;
    if (C.getKnowledge(id)) return openKnowledge({ id });
    if (C.getContent(id)) return openContent(id);
    S.closeModal();
    if ((S.state.workflow?.flows || []).some(flow => flow.id === id)) return S.go('workflow', { id });
    const connection = S.Runtime?.connections.find(item => item.id === id);
    if (connection) return S.go(connection.kind === 'plugin' ? 'plugin-detail' : 'mcp-detail', { id: connection.kind === 'plugin' ? connection.pluginId : id, tab: 'overview' });
    S.toast('原模板已不存在，请从对应管理页重新选择。', 'warning');
  });
  S.action('eco-asset-detail', el => {
    const id = el.dataset.id;
    if (C.getKnowledge(id)) S.go('knowledge-detail', { id });
    else if (C.getContent(id)) S.go('content-detail', { id });
    else { const legacy = store.legacyConnections.find(x => x.id === id); if (legacy && S.CapabilityUI?.openConnectionTemplate) S.CapabilityUI.openConnectionTemplate(legacy); else S.go('capabilities'); }
  });
  S.action('eco-upload', el => {
    const kb = C.getKnowledge(el.dataset.id);
    if (kb) return openImport(kb.id);
    const active = C.listKnowledge();
    if (!active.length) return openKnowledge();
    S.modal({ title: '选择目标知识库', body: select('保存到', 'cs-import-target', active.map(k => ({ id: k.id, label: k.name })), active[0].id), footer: S.btn('取消', 'modal-close', { variant: 'secondary' }) + S.btn('选择文件', 'cs-import-target', { icon: 'upload' }) });
  });
  S.action('cs-import-target', () => openImport(document.getElementById('cs-import-target').value));
  S.action('eco-assets-tab', el => S.go(el.dataset.id === 'mcp' ? 'capabilities' : ['prompt', 'skill'].includes(el.dataset.id) ? 'library' : 'knowledge'));
})();
