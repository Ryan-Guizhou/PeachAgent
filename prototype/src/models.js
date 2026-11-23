(function () {
  'use strict';
  const S = window.Studio, E = S.escape;
  const copy = value => JSON.parse(JSON.stringify(value));
  const now = () => Date.now();
  const uid = prefix => S.uid(prefix);
  const fail = (code, message) => { const e = new Error(message); e.code = code; throw e; };
  const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
  const types = { llm: '语言模型', embedding: '向量模型', rerank: '重排模型', image: '图像生成', stt: '语音识别', tts: '语音合成' };
  const caps = { tools: '工具调用', vision: '图像理解', json: '结构化输出', streaming: '流式输出' };
  // Protocol shapes are independent of provider brands. Availability and model
  // capabilities are declarations, never inferred from a provider's name.
  const adapters = {
    'openai-chat': { name: 'OpenAI Chat Completions', types: ['llm'], path: '/chat/completions' },
    'openai-responses': { name: 'OpenAI Responses', types: ['llm'], path: '/responses' },
    'openai-embeddings': { name: 'OpenAI Embeddings', types: ['embedding'], path: '/embeddings' },
    'openai-image': { name: 'OpenAI Images', types: ['image'], path: '/images/generations' },
    'openai-stt': { name: 'OpenAI Audio Transcriptions', types: ['stt'], path: '/audio/transcriptions' },
    'openai-tts': { name: 'OpenAI Audio Speech', types: ['tts'], path: '/audio/speech' },
    'anthropic-messages': { name: 'Anthropic Messages', types: ['llm'], path: '/v1/messages' },
    'gemini-content': { name: 'Gemini generateContent', types: ['llm', 'image', 'stt', 'tts'], path: '/models/{model}:generateContent' },
    'gemini-embeddings': { name: 'Gemini embedContent', types: ['embedding'], path: '/models/{model}:embedContent' },
    'ollama-chat': { name: 'Ollama Chat', types: ['llm'], path: '/api/chat' },
    'ollama-embed': { name: 'Ollama Embed', types: ['embedding'], path: '/api/embed' },
    'cohere-chat': { name: 'Cohere Chat v2', types: ['llm'], path: '/v2/chat' },
    'cohere-embed': { name: 'Cohere Embed v2', types: ['embedding'], path: '/v2/embed' },
    'cohere-rerank': { name: 'Cohere Rerank v2', types: ['rerank'], path: '/v2/rerank' },
    'jina-embed': { name: 'Jina Embeddings', types: ['embedding'], path: '/v1/embeddings' },
    'jina-rerank': { name: 'Jina Rerank', types: ['rerank'], path: '/v1/rerank' },
    'voyage-embed': { name: 'Voyage Embeddings', types: ['embedding'], path: '/v1/embeddings' },
    'voyage-rerank': { name: 'Voyage Rerank', types: ['rerank'], path: '/v1/rerank' },
    'custom-http': { name: '自定义 HTTP 映射', types: Object.keys(types), path: '' }
  };
  const families = { 'openai-compatible': 'OpenAI 兼容', 'openai-native': 'OpenAI 原生 / Responses', azure: 'Azure OpenAI', anthropic: 'Anthropic', gemini: 'Gemini 原生', ollama: 'Ollama 原生', cohere: 'Cohere', jina: 'Jina', voyage: 'Voyage', custom: '自定义 HTTP' };
  const templates = [
    { id: 'openai-compatible', name: 'OpenAI 兼容服务', family: 'openai-compatible', url: 'https://your-provider.example/v1' },
    { id: 'openai', name: 'OpenAI', family: 'openai-native', url: 'https://api.openai.com/v1' },
    { id: 'azure', name: 'Azure OpenAI', family: 'azure', url: 'https://your-resource.openai.azure.com/openai/v1' },
    { id: 'anthropic', name: 'Anthropic', family: 'anthropic', url: 'https://api.anthropic.com' },
    { id: 'gemini', name: 'Google Gemini', family: 'gemini', url: 'https://generativelanguage.googleapis.com/v1beta' },
    { id: 'ollama', name: 'Ollama', family: 'ollama', url: 'http://localhost:11434', auth: 'none' },
    { id: 'vllm', name: 'vLLM', family: 'openai-compatible', url: 'http://localhost:8000/v1', auth: 'none' },
    { id: 'xinference', name: 'Xinference', family: 'openai-compatible', url: 'http://localhost:9997/v1', auth: 'none' },
    { id: 'dashscope', name: '阿里云百炼 / Qwen', family: 'openai-compatible', url: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
    { id: 'deepseek', name: 'DeepSeek', family: 'openai-compatible', url: 'https://api.deepseek.com/v1' },
    { id: 'zhipu', name: '智谱 BigModel', family: 'openai-compatible', url: 'https://open.bigmodel.cn/api/paas/v4' },
    { id: 'volcengine', name: '火山方舟', family: 'openai-compatible', url: 'https://ark.cn-beijing.volces.com/api/v3' },
    { id: 'siliconflow', name: '硅基流动', family: 'openai-compatible', url: 'https://api.siliconflow.cn/v1' },
    { id: 'openrouter', name: 'OpenRouter', family: 'openai-compatible', url: 'https://openrouter.ai/api/v1' },
    { id: 'cohere', name: 'Cohere', family: 'cohere', url: 'https://api.cohere.com' },
    { id: 'jina', name: 'Jina AI', family: 'jina', url: 'https://api.jina.ai' },
    { id: 'voyage', name: 'Voyage AI', family: 'voyage', url: 'https://api.voyageai.com' },
    { id: 'custom', name: '自定义服务 / 企业网关', family: 'custom', url: 'https://your-gateway.example' }
  ];
  const typeConfig = type => ({ llm: { contextWindow: 32768, maxOutputTokens: 4096, temperature: 0.7 }, embedding: { dimensions: 768, metric: 'cosine', batchSize: 32 }, rerank: { topN: 5, maxDocuments: 100 }, image: { width: 1024, height: 1024, format: 'png', maxImages: 1 }, stt: { language: 'auto', format: 'text', maxSeconds: 300 }, tts: { voice: 'default', format: 'mp3', speed: 1 } }[type]);
  function recommendedAdapter(family, type) {
    if (family === 'custom') return 'custom-http';
    if (family === 'anthropic') return type === 'llm' ? 'anthropic-messages' : '';
    if (family === 'gemini') return type === 'embedding' ? 'gemini-embeddings' : ['llm','image','stt','tts'].includes(type) ? 'gemini-content' : '';
    if (family === 'ollama') return { llm: 'ollama-chat', embedding: 'ollama-embed' }[type] || '';
    if (['cohere','jina','voyage'].includes(family)) return { llm: family === 'cohere' ? 'cohere-chat' : '', embedding: family + '-embed', rerank: family + '-rerank' }[type] || '';
    return { llm: family === 'openai-native' ? 'openai-responses' : 'openai-chat', embedding: 'openai-embeddings', image: 'openai-image', stt: 'openai-stt', tts: 'openai-tts' }[type] || '';
  }
  const data = () => S.state.modelRegistry;
  const rawModel = value => { const key = typeof value === 'object' ? value?.id : value; return data().models.find(m => m.id === key) || data().models.find(m => m.name === key || (m.aliases || []).includes(key)); };
  const provider = id => data().providers.find(p => p.id === id);
  const available = m => Boolean(m && m.enabled !== false && !m.archived && provider(m.providerId)?.enabled !== false && !provider(m.providerId)?.archived && provider(m.providerId));
  const hasCaps = (m, needed = []) => needed.every(c => m.capabilities?.[c] === true);
  function syncLegacy() {
    S.state.models = data().models.map(m => ({ id: m.id, name: m.name, provider: provider(m.providerId)?.name || '连接已删除', type: types[m.type], modelType: m.type, endpoint: provider(m.providerId)?.baseUrl || '', status: available(m) ? 'connected' : 'disabled', capabilities: copy(m.capabilities), archived: !!m.archived }));
  }
  function migrate() {
    if (S.state.modelRegistry?.schema === 1) { syncLegacy(); return; }
    const legacy = copy(S.state.models || []), registry = { schema: 1, providers: [], models: [], defaults: {}, debugRuns: [] };
    const existing = legacy.length ? legacy : [{ id: 'deepseek', name: 'DeepSeek Chat', provider: 'DeepSeek', type: '对话模型', endpoint: 'https://api.deepseek.com/v1' }];
    if (!existing.some(m => m.name === 'Claude Sonnet')) existing.push({ id: 'model-claude', name: 'Claude Sonnet', provider: 'Anthropic', type: '对话模型', endpoint: 'https://api.anthropic.com' });
    for (const old of existing) {
      const inferred = /anthropic|claude/i.test(old.provider + ' ' + old.name) ? 'anthropic' : /deepseek/i.test(old.provider + ' ' + old.name) ? 'deepseek' : /阿里|qwen/i.test(old.provider + ' ' + old.name) ? 'dashscope' : /openai|gpt/i.test(old.provider + ' ' + old.name) ? 'openai' : 'openai-compatible';
      const t = templates.find(x => x.id === inferred), pid = 'provider-' + (old.id || uid('legacy'));
      registry.providers.push({ id: pid, name: old.provider || old.name, template: t.id, protocol: t.family, baseUrl: old.endpoint || t.url, auth: 'reference', credentialRef: '', enabled: old.status !== 'disabled', archived: false, timeoutMs: 60000, retries: 1, apiVersion: '', revision: 1, validation: null, createdAt: now(), updatedAt: now() });
      const type = /嵌入|embedding|向量/i.test(old.type || '') ? 'embedding' : /rerank|重排/.test(old.type || '') ? 'rerank' : 'llm';
      const external = { 'GPT-4.1': 'gpt-4.1', 'DeepSeek Chat': 'deepseek-chat', 'Qwen Plus': 'qwen-plus', 'Claude Sonnet': 'claude-sonnet-demo' }[old.name] || old.name;
      registry.models.push({ id: old.id || uid('model'), name: old.name, aliases: [old.name], modelId: external, providerId: pid, type, adapter: recommendedAdapter(t.family, type) || 'custom-http', requestPath: '', capabilities: { tools: type === 'llm', vision: false, json: type === 'llm', streaming: type === 'llm' }, config: typeConfig(type), enabled: old.status !== 'disabled', archived: false, revision: 1, declaration: '迁移示例声明；未连接真实模型验证', createdAt: now(), updatedAt: now() });
    }
    const pid = 'provider-type-examples';
    registry.providers.push({ id: pid, name: '类型调试示例', template: 'custom', protocol: 'custom', baseUrl: 'https://local-demo.example.invalid', auth: 'none', credentialRef: '', enabled: true, archived: false, timeoutMs: 60000, retries: 0, apiVersion: '', revision: 1, validation: null, createdAt: now(), updatedAt: now() });
    ['embedding', 'rerank', 'image', 'stt', 'tts'].forEach(type => registry.models.push({ id: 'model-demo-' + type, name: types[type] + ' · 本地示例', aliases: [], modelId: 'demo-' + type, providerId: pid, type, adapter: 'custom-http', requestPath: '/demo/' + type, capabilities: { tools: false, vision: false, json: false, streaming: false }, config: typeConfig(type), enabled: true, archived: false, revision: 1, declaration: '本地类型演示，不对应真实在线模型', createdAt: now(), updatedAt: now() }));
    Object.keys(types).forEach(type => { registry.defaults[type] = registry.models.find(m => m.type === type && m.enabled)?.id || ''; });
    S.state.modelRegistry = registry; syncLegacy();
  }
  migrate();
  function mutate(fn) {
    const before = data(), legacy = S.state.models;
    S.state.modelRegistry = copy(before);
    try { const result = fn(data()); syncLegacy(); if (S.save() === false) fail('STORAGE_WRITE_FAILED', '浏览器存储未能保存。修改已撤回，请释放空间后重试。'); return copy(result ?? null); }
    catch (e) { S.state.modelRegistry = before; S.state.models = legacy; throw e; }
  }
  function resolve(value, options = {}) {
    const m = rawModel(value); if (!m) fail('MODEL_NOT_FOUND', '模型不存在，请在模型中心重新选择。');
    if (options.type && m.type !== options.type) fail('MODEL_TYPE_MISMATCH', `“${m.name}”是${types[m.type]}，此处需要${types[options.type] || options.type}。`);
    if (!hasCaps(m, options.capabilities)) fail('MODEL_CAPABILITY_MISMATCH', `“${m.name}”未声明所需能力：${(options.capabilities || []).filter(c => !m.capabilities?.[c]).map(c => caps[c] || c).join('、')}。`);
    if (options.enabled !== false) {
      if (m.enabled === false || m.archived) fail('MODEL_DISABLED', `“${m.name}”已停用或归档，请启用后再运行。`);
      const p = provider(m.providerId); if (!p || p.enabled === false || p.archived) fail('PROVIDER_DISABLED', `“${m.name}”的服务商连接不可用，请在模型中心检查。`);
    }
    return copy(m);
  }
  function list(options = {}) {
    return copy(data().models.filter(m => (!options.type || m.type === options.type) && (options.archived === true ? m.archived : options.archived === 'all' || !m.archived) && (options.enabled === undefined || available(m) === options.enabled) && (!options.providerId || m.providerId === options.providerId) && hasCaps(m, options.capabilities)));
  }
  function validate(value, options = {}) { try { return { ok: true, model: resolve(value, options), errors: [] }; } catch (e) { return { ok: false, errors: [{ code: e.code, message: e.message }], code: e.code, message: e.message }; } }
  function snapshot(value, options = {}) { const m = resolve(value, options), p = provider(m.providerId); return freeze({ ...m, provider: copy(p), capturedAt: now(), simulation: true }); }
  function assertAvailable(value, options = {}) {
    const current = resolve(value, options);
    if (value && typeof value === 'object') {
      if (value.type !== current.type || options.type && value.type !== options.type) fail('MODEL_TYPE_MISMATCH', '模型快照类型与当前用途不兼容，请重新选择模型。');
      if (!hasCaps(value, options.capabilities)) fail('MODEL_CAPABILITY_MISMATCH', '此运行固定的模型快照缺少所需能力。');
      if (value.providerId !== current.providerId && !provider(value.providerId)) fail('PROVIDER_DISABLED', '运行固定的服务商连接已不存在。');
      const original = provider(value.providerId); if (!original || !original.enabled || original.archived) fail('PROVIDER_DISABLED', '运行固定的服务商连接已停用或归档。');
    }
    return current;
  }
  function checkUrl(value) {
    try { const u = new URL(value); return (u.protocol === 'https:' || u.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(u.hostname)) && !u.username && !u.password && !u.search && !u.hash; } catch (_) { return false; }
  }
  const integer = (v, min, max, label) => { const n = Number(v); if (!Number.isInteger(n) || n < min || n > max) fail('CONFIG_INVALID', `${label}需为 ${min}–${max} 的整数。`); return n; };
  const decimal = (v, min, max, label) => { const n = Number(v); if (!Number.isFinite(n) || n < min || n > max) fail('CONFIG_INVALID', `${label}需在 ${min}–${max} 之间。`); return n; };
  function saveProvider(input) {
    const old = input.id ? provider(input.id) : null; if (input.id && !old) fail('PROVIDER_NOT_FOUND', '连接不存在。');
    const name = String(input.name || '').trim(), baseUrl = String(input.baseUrl || '').trim().replace(/\/$/, '');
    if (!name) fail('CONFIG_INVALID', '请填写连接名称。');
    if (!checkUrl(baseUrl)) fail('CONFIG_INVALID', 'Base URL 需为无凭证、查询参数和片段的 HTTPS 地址；本机可使用 HTTP。');
    if (!templates.some(t => t.id === input.template) || !families[input.protocol]) fail('CONFIG_INVALID', '请选择有效的服务商模板和默认协议。');
    if (!['reference','none'].includes(input.auth)) fail('CONFIG_INVALID', '请选择凭证引用或无需凭证。');
    const credentialRef = String(input.credentialRef || '').trim();
    if (credentialRef && !/^(env|vault|secret):[a-zA-Z][a-zA-Z0-9_./-]{0,119}$/.test(credentialRef)) fail('CREDENTIAL_REFERENCE_INVALID', '只接受 env:变量名、vault:路径 或 secret:标识。不要填写密钥正文。');
    const value = { id: old?.id || uid('provider'), name, template: input.template, protocol: input.protocol, baseUrl, auth: input.auth, credentialRef: input.auth === 'none' ? '' : credentialRef, apiVersion: String(input.apiVersion || '').trim().slice(0,80), timeoutMs: integer(input.timeoutMs ?? 60000, 1000, 300000, '超时毫秒'), retries: integer(input.retries ?? 1, 0, 5, '重试次数'), enabled: input.enabled !== false, archived: old?.archived || false, revision: (old?.revision || 0) + 1, validation: null, createdAt: old?.createdAt || now(), updatedAt: now() };
    return mutate(d => { const i = d.providers.findIndex(p => p.id === value.id); if (i >= 0) d.providers[i] = value; else d.providers.push(value); return value; });
  }
  function normalConfig(type, cfg) {
    const c = { ...typeConfig(type), ...cfg };
    if (type === 'llm') { const contextWindow = integer(c.contextWindow, 256, 10000000, '上下文窗口'), maxOutputTokens = integer(c.maxOutputTokens, 1, contextWindow, '最大输出 Token'); return { contextWindow, maxOutputTokens, temperature: decimal(c.temperature, 0, 2, '温度') }; }
    if (type === 'embedding') { if (!['cosine','dot','euclidean'].includes(c.metric)) fail('CONFIG_INVALID', '请选择有效的向量距离度量。'); return { dimensions: integer(c.dimensions, 1, 65536, '向量维度'), metric: c.metric, batchSize: integer(c.batchSize, 1, 2048, '批大小') }; }
    if (type === 'rerank') { const maxDocuments = integer(c.maxDocuments, 1, 10000, '最大文档数'); return { maxDocuments, topN: integer(c.topN, 1, maxDocuments, 'Top N') }; }
    if (type === 'image') { if (!['png','jpeg','webp'].includes(c.format)) fail('CONFIG_INVALID', '请选择 PNG、JPEG 或 WebP。'); return { width: integer(c.width, 64, 8192, '宽度'), height: integer(c.height, 64, 8192, '高度'), format: c.format, maxImages: integer(c.maxImages, 1, 10, '每次最大张数') }; }
    if (type === 'stt') { if (!['text','json','srt','vtt'].includes(c.format)) fail('CONFIG_INVALID', '请选择有效的转写格式。'); return { language: String(c.language || 'auto').slice(0,20), format: c.format, maxSeconds: integer(c.maxSeconds, 1, 7200, '音频时长上限') }; }
    if (!['mp3','wav','opus','aac'].includes(c.format)) fail('CONFIG_INVALID', '请选择有效的音频格式。');
    return { voice: String(c.voice || 'default').trim().slice(0,120), format: c.format, speed: decimal(c.speed, 0.25, 4, '语速') };
  }
  function modelValue(input) {
    const old = input.id ? rawModel(input.id) : null; if (input.id && !old) fail('MODEL_NOT_FOUND', '模型不存在。');
    const p = provider(input.providerId), type = input.type, name = String(input.name || '').trim(), modelId = String(input.modelId || '').trim();
    if (!p || p.archived) fail('PROVIDER_DISABLED', '请选择未归档的服务商连接。');
    if (!types[type]) fail('MODEL_TYPE_MISMATCH', '请选择模型类型。');
    if (!name || !modelId) fail('CONFIG_INVALID', '请填写显示名称与服务商 Model ID / 部署名。');
    if (modelId.length > 240 || /[\r\n\s]/.test(modelId)) fail('CONFIG_INVALID', 'Model ID 不能包含空白，最长 240 字符。');
    if (data().models.some(m => m.id !== old?.id && (m.id === name || m.name === name || m.aliases?.includes(name)))) fail('MODEL_NAME_CONFLICT', '这个显示名称已与其它模型的名称、稳定 ID 或历史别名冲突。');
    if (data().models.some(m => m.id !== old?.id && m.providerId === p.id && m.modelId === modelId && m.type === type)) fail('MODEL_ID_CONFLICT', '此连接下已存在相同类型与 Model ID，请编辑已有实例。');
    if (!adapters[input.adapter]?.types.includes(type)) fail('PROTOCOL_TYPE_MISMATCH', `选择的请求协议不支持${types[type]}。重排需独立的 Rerank 协议或自定义映射。`);
    const requestPath = String(input.requestPath || '').trim();
    if (requestPath && !/^\/(?!\/)[a-zA-Z0-9_./{}:-]*$/.test(requestPath)) fail('CONFIG_INVALID', '请求路径须以单个 / 开始，不能含凭证、查询参数或域名。');
    if (input.adapter === 'custom-http' && !requestPath) fail('CONFIG_INVALID', '自定义 HTTP 映射需填写请求路径。');
    if (old && old.type !== type && dependencies(old.id).length) fail('MODEL_IN_USE', '模型已被引用，不能直接改变类型。请新建模型后迁移引用。');
    const capabilities = Object.fromEntries(Object.keys(caps).map(c => [c, type === 'llm' && input.capabilities?.[c] === true]));
    const value = { id: old?.id || uid('model'), name, aliases: [...new Set([...(old?.aliases || []), ...(old && old.name !== name ? [old.name] : [])])], modelId, providerId: p.id, type, adapter: input.adapter, requestPath, capabilities, config: normalConfig(type, input.config), enabled: input.enabled !== false, archived: old?.archived || false, revision: (old?.revision || 0) + 1, declaration: input.declaration || '用户声明；等待真实服务验证', createdAt: old?.createdAt || now(), updatedAt: now() };
    return value;
  }
  function saveModel(input) {
    const value = modelValue(input);
    return mutate(d => { const i = d.models.findIndex(m => m.id === value.id); if (i >= 0) d.models[i] = value; else d.models.push(value); return value; });
  }
  function dependencies(id) {
    const m = rawModel(id); if (!m) return [];
    const keys = new Set([m.id, m.name, ...(m.aliases || [])]), result = [];
    const references = (v, key = '') => { if (typeof v === 'string') return /model/i.test(key) && keys.has(v); if (Array.isArray(v)) return v.some(x => references(x,key)); if (v && typeof v === 'object') return Object.entries(v).some(([k,x]) => /modelSnapshot/i.test(key) && k === 'id' && keys.has(x) || references(x,k)); return false; };
    Object.entries(data().defaults).forEach(([type,v]) => { if (keys.has(v)) result.push({ kind: '默认用途', name: types[type], route: 'models', params: { tab: 'defaults' } }); });
    (S.state.agents || []).forEach(a => { if (references(a)) result.push({ kind: 'Agent', name: a.name, route: 'agent', params: { id: a.id } }); });
    (S.state.workflow?.flows || []).forEach(f => { if (references(f)) result.push({ kind: '工作流', name: f.title || f.name, route: 'workflow', params: { id: f.id } }); });
    (S.state.publishing?.apps || []).forEach(app => { if ((app.versions || []).some(version => references(version.snapshot))) result.push({ kind: 'API 服务版本', name: app.name, route: 'service', params: { id: app.id } }); });
    (S.state.qualityData?.experiments || []).forEach(experiment => { if (references(experiment.target?.snapshot)) result.push({ kind: '评测任务', name: experiment.name || experiment.id, route: 'experiment', params: { id: experiment.id } }); });
    [...(S.state.knowledge?.bases || []), ...(S.state.contentStore?.knowledge || [])].forEach(k => { if (references(k)) result.push({ kind: '知识库', name: k.name, route: 'knowledge-detail', params: { id: k.id } }); });
    (S.state.runs || []).filter(r => !['done','failed','stopped','rejected'].includes(r.status) && (references(r.plan) || references(r.modelSnapshot,'modelSnapshot') || references(r.agentSnapshot) || references(r.snapshot))).forEach(r => result.push({ kind: '进行中运行', name: r.title || r.id, route: 'task', params: { id: r.id } }));
    (S.state.chatSessions || []).filter(c => references(c)).forEach(c => result.push({ kind: '会话', name: c.title || '会话', route: 'chat', params: { id: c.agentId, session: c.id } }));
    return result;
  }
  function providerReferences(id) {
    const result = data().models.filter(m => m.providerId === id).map(m => ({ kind: '模型实例', name: m.name, route: 'model-detail', params: { id: m.id } }));
    // A model can move to another connection while existing releases retain the
    // original provider. Those fixed references must also prevent deletion.
    const contains = value => { if (!value || typeof value !== 'object') return false; if (value.providerId === id && value.modelId && types[value.type]) return true; return Object.values(value).some(contains); };
    const add = (value, kind, name, route, params) => { if (contains(value)) result.push({ kind, name, route, params }); };
    (S.state.agents || []).forEach(a => add(a, 'Agent 固定配置', a.name, 'agent', { id: a.id }));
    (S.state.workflow?.flows || []).forEach(f => add(f, '工作流固定配置', f.title || f.name, 'workflow', { id: f.id }));
    (S.state.contentStore?.knowledge || []).forEach(k => add(k, '知识库固定配置', k.name, 'knowledge-detail', { id: k.id }));
    (S.state.publishing?.apps || []).forEach(app => { if ((app.versions || []).some(v => contains(v.snapshot))) result.push({ kind: 'API 服务版本', name: app.name, route: 'service', params: { id: app.id } }); });
    (S.state.qualityData?.experiments || []).forEach(e => add(e.target?.snapshot, '评测任务', e.name || e.id, 'experiment', { id: e.id }));
    (S.state.runs || []).filter(r => !['done','failed','stopped','rejected'].includes(r.status)).forEach(r => add([r.plan,r.modelSnapshot,r.agentSnapshot,r.workflowSnapshot,r.snapshot], '进行中运行', r.title || r.id, 'task', { id: r.id }));
    return result;
  }
  function setStatus(kind, id, status) {
    if (!['model','provider'].includes(kind)) fail('CONFIG_INVALID', '对象类型不正确。');
    return mutate(d => { const item = d[kind === 'model' ? 'models' : 'providers'].find(x => x.id === id); if (!item) fail('MODEL_NOT_FOUND', '对象已不存在。');
      if (status === 'archive') { item.archived = true; item.enabled = false; } else if (status === 'restore') { item.archived = false; item.enabled = false; } else if (status === 'enable') { if (item.archived) fail('CONFIG_INVALID', '请先恢复归档。'); item.enabled = true; } else if (status === 'disable') item.enabled = false; else fail('CONFIG_INVALID', '未知状态。');
      item.revision++; item.updatedAt = now(); return item;
    });
  }
  function remove(kind, id) {
    if (!['provider','model'].includes(kind)) fail('CONFIG_INVALID', '对象类型不正确。');
    if (kind === 'provider') { if (providerReferences(id).length) fail('PROVIDER_IN_USE', '连接仍有模型实例或已固定的配置引用。请先处理这些引用，或停用、归档连接。'); }
    else if (dependencies(id).length) fail('MODEL_IN_USE', '模型仍被引用。请先迁移默认用途、Agent、工作流或会话中的配置。');
    return mutate(d => { const key = kind === 'provider' ? 'providers' : 'models', i = d[key].findIndex(x => x.id === id); if (i < 0) fail('MODEL_NOT_FOUND', '对象已不存在。'); return d[key].splice(i, 1)[0]; });
  }
  function defaults(type) { return type ? data().defaults[type] || '' : copy(data().defaults); }
  function setDefault(type, id) { if (!types[type]) fail('MODEL_TYPE_MISMATCH', '默认用途不正确。'); if (id) resolve(id, { type }); return mutate(d => { d.defaults[type] = id ? rawModel(id).id : ''; return d.defaults; }); }
  function testConnection(id, scenario = 'success') {
    if (!['success','timeout','unauthorized'].includes(scenario)) fail('CONFIG_INVALID', '未知的连接校验场景。');
    const p = provider(id); if (!p) fail('PROVIDER_NOT_FOUND', '连接不存在。'); if (!p.enabled || p.archived) fail('PROVIDER_DISABLED', '连接已停用或归档。');
    if (!checkUrl(p.baseUrl)) fail('CONFIG_INVALID', '连接地址格式不正确。');
    const result = { status: scenario === 'timeout' ? 'timeout' : scenario === 'unauthorized' ? 'unauthorized' : 'passed', simulated: true, testedAt: now(), message: scenario === 'timeout' ? '模拟超时；可调整超时或重试。' : scenario === 'unauthorized' ? '模拟凭证被拒绝；请检查引用配置。' : '地址与配置校验通过；真实服务连通性尚未验证。' };
    return mutate(d => { d.providers.find(x => x.id === id).validation = result; return result; });
  }
  function discover(id) {
    const p = provider(id); if (!p || !p.enabled || p.archived) fail('PROVIDER_DISABLED', '请先启用服务商连接。');
    const candidates = p.protocol === 'anthropic' ? ['llm'] : p.protocol === 'ollama' ? ['llm','embedding'] : ['cohere','jina','voyage'].includes(p.protocol) ? (p.protocol === 'cohere' ? ['llm','embedding','rerank'] : ['embedding','rerank']) : p.protocol === 'custom' ? Object.keys(types) : ['llm','embedding'];
    return candidates.map(type => ({ providerId: id, type, name: p.name + ' · ' + types[type] + '示例', modelId: 'discovered-demo-' + type, adapter: recommendedAdapter(p.protocol,type) || 'custom-http', requestPath: p.protocol === 'custom' ? '/demo/' + type : '', capabilities: Object.fromEntries(Object.keys(caps).map(c => [c,false])), config: typeConfig(type), enabled: true, simulated: true, imported: data().models.some(m => m.providerId === id && m.modelId === 'discovered-demo-' + type && m.type === type) }));
  }
  function importDiscovered(id, wantedTypes) { const choices = discover(id).filter(c => wantedTypes.includes(c.type)); if (!choices.length) fail('CONFIG_INVALID','请选择要导入的类型示例。'); const out = choices.filter(c => !c.imported).map(c => modelValue({ ...c, declaration: '模拟发现示例；能力未声明' })); if(!out.length)return []; return mutate(d=>{d.models.push(...out);return out;}); }
  function debug(value, input, scenario = 'success') {
    if (!['success','timeout'].includes(scenario)) fail('CONFIG_INVALID', '未知的模型调试场景。');
    const m = resolve(value), snap = snapshot(m.id), started = now();
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail('INPUT_INVALID', '请输入对应类型的 JSON 对象。');
    const fields = { llm: ['prompt','tools','json'], embedding: ['texts'], rerank: ['query','documents'], image: ['prompt','count'], stt: ['demoTranscript'], tts: ['text'] }[m.type];
    if (Object.keys(input).some(k => !fields.includes(k))) fail('INPUT_INVALID', '此模型只接受输入字段：' + fields.join('、') + '。不要在调试输入中填写凭证。');
    if (JSON.stringify(input).length > 100000) fail('INPUT_INVALID', '本地调试输入最多 100,000 个字符，请缩小样例。');
    let output;
    const nonempty = (v, label) => { if (typeof v !== 'string' || !v.trim()) fail('INPUT_INVALID', label + '不能为空。'); return v.trim(); };
    if (m.type === 'llm') { const prompt = nonempty(input.prompt, 'prompt'); if (input.tools === true && !m.capabilities.tools) fail('MODEL_CAPABILITY_MISMATCH', '此模型未声明工具调用能力。'); if (input.json === true && !m.capabilities.json) fail('MODEL_CAPABILITY_MISMATCH', '此模型未声明结构化输出能力。'); output = input.json ? { response: { summary: prompt.slice(0,160), simulated: true }, finishReason: 'stop' } : { text: '本地模拟回复：已收到「' + prompt.slice(0,160) + '」。', finishReason: 'stop' }; }
    if (m.type === 'embedding') { const texts = input.texts; if (!Array.isArray(texts) || !texts.length || texts.length > m.config.batchSize || texts.some(x => typeof x !== 'string' || !x.trim())) fail('INPUT_INVALID', 'texts 需为非空字符串数组，条数不超过配置的批大小。'); output = { dimensions: m.config.dimensions, metric: m.config.metric, data: texts.map((t,i) => ({ index: i, vectorPreview: Array.from({length: Math.min(8,m.config.dimensions)}, (_,j) => Number((((t.charCodeAt(j % t.length) + j * 17) % 199 - 99) / 100).toFixed(2))), previewOnly: m.config.dimensions > 8 })), note: '只演示形状与维度；预览值由字符确定，不代表语义向量。' }; }
    if (m.type === 'rerank') { const query = nonempty(input.query,'query'), documents = input.documents; if (!Array.isArray(documents) || !documents.length || documents.length > m.config.maxDocuments || documents.some(x => typeof x !== 'string' || !x.trim())) fail('INPUT_INVALID', 'documents 需为非空字符串数组，条数不超过最大文档数。'); const terms = [...new Set(query.toLowerCase().replace(/\s/g,'').split(''))]; output = { results: documents.map((text,index) => ({ index, text, score: Number((terms.filter(x => text.toLowerCase().includes(x)).length / Math.max(1,terms.length)).toFixed(3)) })).sort((a,b) => b.score - a.score || a.index - b.index).slice(0, Math.min(m.config.topN, documents.length)), scoring: '本地字符重合度，非真实模型相关性分数' }; }
    if (m.type === 'image') { nonempty(input.prompt,'prompt'); const count = integer(input.count ?? 1, 1, m.config.maxImages, 'count'); output = { images: Array.from({length:count},(_,i)=>({ id: 'sim-image-' + (i+1), width: m.config.width, height: m.config.height, format: m.config.format })), delivery: '仅返回模拟元数据；没有生成图像文件或外部 URL' }; }
    if (m.type === 'stt') { const transcript = nonempty(input.demoTranscript, 'demoTranscript（模拟音频内容）'); output = { text: transcript, language: m.config.language, format: m.config.format, source: '本地输入回显；没有上传音频或执行真实识别' }; }
    if (m.type === 'tts') { const text = nonempty(input.text,'text'); output = { audio: { format: m.config.format, voice: m.config.voice, speed: m.config.speed, characters: text.length }, delivery: '仅返回模拟音频元数据；没有生成或播放音频' }; }
    const error = scenario === 'timeout' ? { code: 'SIMULATED_TIMEOUT', message: '本地模拟超时。可切换成功场景后重试。' } : null;
    const record = { id: uid('model-test'), modelId: m.id, modelName: m.name, modelType: m.type, snapshot: snap, input: copy(input), output: error ? null : output, error, status: error ? 'failed' : 'succeeded', createdAt: now(), durationMs: Math.max(1,now()-started), simulated: true };
    return mutate(d => { d.debugRuns.unshift(record); d.debugRuns = d.debugRuns.slice(0,100); return record; });
  }
  S.Models = { types: freeze(copy(types)), adapters: freeze(copy(adapters)), templates: freeze(copy(templates)), list, resolve, validate, snapshot, assertAvailable, defaults, setDefault, displayName: value => rawModel(value)?.name || (typeof value === 'string' ? value : value?.name || '未选择模型'), saveProvider, saveModel, setStatus, remove, dependencies, references: dependencies, providerReferences, testConnection, discover, importDiscovered, debug, providers: () => copy(data().providers), recommendedAdapter, typeConfig: type => copy(typeConfig(type)), openModel, openProvider };

  const ui = { q: '', providerQ: '', discovery: null, pending: null, debugInput: {}, debugResult: {}, modelDraft: null, providerDraft: null };
  const attrs = (id, extra = '') => `data-id="${E(id)}" ${extra}`;
  const link = (label, route, params = {}, cls = 'text-link') => `<a class="${cls}" href="#${route}${Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : ''}">${E(label)}</a>`;
  const date = t => t ? new Date(t).toLocaleString('zh-CN',{hour12:false}) : '尚未测试';
  const status = item => S.badge(item.archived ? '已归档' : item.enabled === false ? '已停用' : '已启用', item.archived || item.enabled === false ? 'neutral' : 'success');
  const table = (heads, rows, empty) => rows ? `<div class="table-wrap"><table class="data-table"><thead><tr>${heads.map(h=>`<th>${E(h)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>` : empty;
  const formError = '<p class="field-error mc-form-error" id="mc-form-error" role="alert"></p>';
  function select(label, id, choices, value, attrs = '') { return `<div class="field"><label class="field-label" for="${id}">${E(label)}</label><select class="select" id="${id}" name="${id}" ${attrs}>${choices.map(([v,t])=>`<option value="${E(v)}" ${String(v) === String(value) ? 'selected' : ''}>${E(t)}</option>`).join('')}</select></div>`; }
  function pager(total) { const page = Math.max(1,Math.min(Number(S.params.page)||1,Math.ceil(total/8)||1)); return { start:(page-1)*8, html:`<div class="mc-pagination"><span class="small muted">共 ${total} 项 · 第 ${page} / ${Math.ceil(total/8)||1} 页</span><div class="row">${S.btn('上一页','mc-page',{small:true,variant:'secondary',attrs:`data-page="${page-1}" ${page===1?'disabled':''}`})}${S.btn('下一页','mc-page',{small:true,variant:'secondary',attrs:`data-page="${page+1}" ${page*8>=total?'disabled':''}`})}</div></div>` }; }
  function modelState(m) { return available(m) ? status(m) : S.badge(m.archived?'已归档':!m.enabled?'模型停用':'连接停用','neutral'); }
  function protocolNote() { return `<details class="mc-protocol-note"><summary>请求协议与兼容范围</summary><p>模板负责预填连接格式。具体模型的类型、Model ID、能力与部署参数由你维护；兼容服务通常只实现部分接口。重排使用独立的 Rerank 请求协议，不归入 OpenAI Chat / Embeddings 标准接口。</p><p>所有连接校验、发现和调试均在本地模拟。下方是协议参考，不代表原型已接通这些服务。</p><div class="mc-source-links"><a href="https://docs.ollama.com/api/openai-compatibility" target="_blank" rel="noopener noreferrer">Ollama 兼容范围</a><a href="https://docs.vllm.ai/en/latest/serving/openai_compatible_server/" target="_blank" rel="noopener noreferrer">vLLM 请求接口</a><a href="https://docs.cohere.com/reference/rerank" target="_blank" rel="noopener noreferrer">Cohere Rerank</a><a href="https://ai.google.dev/gemini-api/docs/embeddings" target="_blank" rel="noopener noreferrer">Gemini Embeddings</a></div></details>`; }
  function renderModels() {
    const type = types[S.params.type] ? S.params.type : '', archived = S.params.archived === '1', q = ui.q.toLowerCase();
    let rows = list({ type:type||undefined, archived }).filter(m=>(!S.params.provider || m.providerId===S.params.provider) && (!S.params.status || (S.params.status==='enabled'?available(m):!available(m))) && [m.name,m.modelId,provider(m.providerId)?.name].some(v=>String(v||'').toLowerCase().includes(q)));
    const p = pager(rows.length);
    return `<section class="panel mc-panel"><div class="mc-toolbar">${S.search('mc-search','搜索名称、Model ID 或连接',ui.q)}${select('模型类型','mc-type-filter',[['','全部类型'],...Object.entries(types)],type)}${select('可用状态','mc-status-filter',[['','全部状态'],['enabled','可用'],['disabled','不可用']],S.params.status||'')}${S.btn(archived?'返回使用中的模型':'查看归档','mc-archive-filter',{small:true,variant:'ghost'})}</div>${S.params.provider?`<div class="mc-filter-summary">连接筛选：${E(provider(S.params.provider)?.name||'未知连接')} ${S.btn('清除','mc-clear-provider',{small:true,variant:'ghost'})}</div>`:''}${table(['模型 / Model ID','类型 / 协议','连接','状态','操作'],rows.slice(p.start,p.start+8).map(m=>`<tr><td>${link(m.name,'model-detail',{id:m.id},'mc-model-name')}<small class="mc-sub mono">${E(m.modelId)}</small></td><td>${E(types[m.type])}<small class="mc-sub">${E(adapters[m.adapter]?.name||m.adapter)}</small></td><td><button type="button" class="text-link mc-link-button" data-action="mc-provider-edit" data-id="${E(m.providerId)}">${E(provider(m.providerId)?.name||'连接不存在')}</button><small class="mc-sub">${m.type==='llm'?Object.entries(m.capabilities).filter(([,v])=>v).map(([k])=>caps[k]).join(' · ')||'尚未声明扩展能力':m.type==='embedding'?m.config.dimensions+' 维 · '+m.config.metric:m.type==='rerank'?'Top '+m.config.topN+' · 最多 '+m.config.maxDocuments+' 文档':'类型参数可配置'}</small></td><td>${modelState(m)}</td><td><div class="row">${link('调试','model-detail',{id:m.id,tab:'debug'},'btn btn-secondary btn-sm')}${S.btn(m.archived?'恢复':'编辑',m.archived?'mc-restore':'mc-model-edit',{small:true,variant:'ghost',attrs:attrs(m.id,'data-kind="model"')})}</div></td></tr>`).join(''),S.empty(q||type?'没有匹配的模型':archived?'没有已归档模型':'添加第一个模型','选择服务商连接，填写 Model ID，再声明用途与能力。',S.btn('手动添加','mc-model-add',{icon:'plus'})))}${p.html}</section>`;
  }
  function renderProviders() {
    const archived = S.params.archived==='1', rows=data().providers.filter(p=>!!p.archived===archived&&[p.name,p.baseUrl,p.template].some(v=>v.toLowerCase().includes(ui.providerQ.toLowerCase()))), p=pager(rows.length);
    return `<section class="panel mc-panel"><div class="mc-toolbar">${S.search('mc-provider-search','搜索连接名称或地址',ui.providerQ)}${S.btn(archived?'返回使用中的连接':'查看归档','mc-archive-filter',{small:true,variant:'ghost'})}</div>${table(['连接','默认协议 / 凭证引用','模型实例','配置校验','操作'],rows.slice(p.start,p.start+8).map(c=>`<tr><td><strong>${E(c.name)}</strong><small class="mc-sub mono mc-endpoint">${E(c.baseUrl)}</small>${status(c)}</td><td>${E(families[c.protocol])}<small class="mc-sub mono">${E(c.auth==='none'?'无需凭证':c.credentialRef||'未填写引用')}</small></td><td>${link(data().models.filter(m=>m.providerId===c.id).length+' 个模型','models',{provider:c.id})}</td><td>${c.validation?S.badge(c.validation.status==='passed'?'模拟通过':'模拟失败',c.validation.status==='passed'?'success':'warning'):'尚未校验'}<small class="mc-sub">${c.validation?date(c.validation.testedAt):'未验证真实服务'}</small></td><td><div class="mc-row-actions">${S.btn('配置','mc-provider-edit',{small:true,variant:'secondary',attrs:attrs(c.id)})}${!c.archived?S.btn('模拟发现','mc-discover',{small:true,variant:'ghost',attrs:attrs(c.id,!c.enabled?'disabled':'')}):S.btn('恢复','mc-restore',{small:true,variant:'ghost',attrs:attrs(c.id,'data-kind="provider"')})}</div></td></tr>`).join(''),S.empty('没有匹配的连接','添加服务商连接后，可手动维护模型实例。',S.btn('添加连接','mc-provider-add')))}${p.html}</section>${protocolNote()}`;
  }
  function renderDefaults() {
    return `<section class="panel mc-panel"><div class="mc-panel-head"><div><h2>按用途设置默认模型</h2><p class="small muted">新建配置可使用这些默认值。已有 Agent、节点和运行快照保留自己的选择。</p></div></div><div class="mc-default-grid">${Object.entries(types).map(([type,label])=>{const id=defaults(type),m=rawModel(id),check=id?validate(id,{type}):null;return `<div class="mc-default-item"><span class="mc-type-icon">${S.icon(type==='llm'?'spark':type==='embedding'?'database':type==='rerank'?'sort':'box',20)}</span><div><h3>${E(label)}</h3><p>${E(m?.name||'尚未指定')}</p><span class="small ${check&&!check.ok?'mc-warning':'muted'}">${check&&!check.ok?E(check.message):m?E(provider(m.providerId)?.name||''):'需要时可在具体应用中选择'}</span></div>${S.btn('设置','mc-default-edit',{small:true,variant:'secondary',attrs:`data-type="${type}"`})}</div>`;}).join('')}</div></section>`;
  }
  S.page('models',{title:'模型中心',section:'配置',render(){const tab=['providers','defaults'].includes(S.params.tab)?S.params.tab:'models';return `<div class="mc-page">${S.header('模型中心','连接模型，按能力使用','维护服务商连接与模型实例，为 Agent、工作流和知识检索提供统一选择。',S.btn('添加连接','mc-provider-add',{variant:'secondary',icon:'plus'})+S.btn('添加模型','mc-model-add',{icon:'plus'}))}<div class="mc-simulation">${S.icon('info',16)}<span>本地原型 · 配置可保存；连接、发现与调试均为模拟，不向服务商发送请求。</span></div>${S.tabs([{id:'models',label:'模型实例',count:list().length},{id:'providers',label:'服务商连接',count:data().providers.filter(p=>!p.archived).length},{id:'defaults',label:'默认用途'}],tab,'mc-tab')}${tab==='providers'?renderProviders():tab==='defaults'?renderDefaults():renderModels()}</div>`;},mount:mountPage});
  function detailOverview(m) { const p=provider(m.providerId),deps=dependencies(m.id);return `<div class="mc-detail-grid"><section class="panel mc-panel"><div class="mc-panel-head"><h2>调用配置</h2>${S.btn('编辑模型','mc-model-edit',{small:true,variant:'secondary',attrs:attrs(m.id)})}</div><dl class="mc-definition"><dt>Model ID / 部署名</dt><dd class="mono">${E(m.modelId)}</dd><dt>请求协议</dt><dd>${E(adapters[m.adapter]?.name||m.adapter)}</dd><dt>请求路径</dt><dd class="mono">${E(m.requestPath||adapters[m.adapter]?.path||'未配置')}</dd><dt>服务商连接</dt><dd>${E(p?.name||'不存在')} ${S.btn('配置连接','mc-provider-edit',{small:true,variant:'ghost',attrs:attrs(m.providerId)})}</dd><dt>能力声明</dt><dd>${m.type==='llm'?Object.entries(m.capabilities).filter(([,v])=>v).map(([c])=>E(caps[c])).join(' · ')||'未声明扩展能力':E(types[m.type])}<small class="mc-sub">${E(m.declaration)}</small></dd>${Object.entries(m.config).map(([k,v])=>`<dt>${E(({contextWindow:'上下文 Token',maxOutputTokens:'最大输出 Token',temperature:'温度',dimensions:'向量维度',metric:'距离度量',batchSize:'批大小',topN:'Top N',maxDocuments:'最多文档数',width:'宽度',height:'高度',format:'输出格式',maxImages:'每次最多张数',language:'语言',maxSeconds:'时长上限（秒）',voice:'音色 ID',speed:'语速'})[k]||k)}</dt><dd>${E(v)}</dd>`).join('')}</dl><p class="mc-note">以上数值为本空间配置，不代表服务商公布的上限。修改后只影响新的配置快照。</p></section><section class="panel mc-panel"><div class="mc-panel-head"><div><h2>引用关系</h2><p class="small muted">${deps.length} 个配置正在使用此模型</p></div></div>${deps.length?`<ul class="mc-dependencies">${deps.map(d=>`<li><span>${E(d.kind)}</span>${link(d.name,d.route,d.params)}</li>`).join('')}</ul>`:S.empty('尚无引用','可在 Agent、工作流节点或默认用途中选择。')}<div class="mc-danger-actions">${m.archived?S.btn('恢复模型','mc-restore',{variant:'secondary',attrs:attrs(m.id,'data-kind="model"')}):S.btn(m.enabled?'停用模型':'启用模型','mc-status',{variant:'secondary',attrs:attrs(m.id,`data-kind="model" data-status="${m.enabled?'disable':'enable'}"`)})}${!m.archived?S.btn('归档','mc-status',{variant:'ghost',attrs:attrs(m.id,'data-kind="model" data-status="archive"')}):''}${S.btn('删除','mc-delete',{variant:'ghost',attrs:attrs(m.id,'data-kind="model"')})}</div><p class="mc-note">停用或归档不会切换已有引用；新的调用会明确提示不可用。历史运行快照保留。</p></section></div>`; }
  function exampleInput(type) { return { llm: {prompt:'把会议纪要整理成三项待办',tools:false,json:false}, embedding:{texts:['模型中心统一维护连接','知识检索需要向量模型']}, rerank:{query:'如何维护模型连接',documents:['在模型中心维护连接与凭证引用','调整页面主题色','为每个工作流节点选择模型']}, image:{prompt:'一张简洁的产品概念图',count:1}, stt:{demoTranscript:'明天上午十点讨论项目计划。'}, tts:{text:'你好，欢迎使用 PeachAgent。'} }[type]; }
  function debugResultHTML(record) { return record?`<div class="mc-debug-result"><div class="row between">${S.badge(record.error?'模拟失败':'模拟完成',record.error?'warning':'success')}<span class="small muted">本地 ${record.durationMs} ms · r${record.snapshot.revision}</span></div><pre><code>${E(JSON.stringify(record.error||record.output,null,2))}</code></pre><p class="small muted">输入、类型校验及结果已保存在此模型的调试记录中。</p></div>`:S.empty('等待一次类型调试','编辑左侧 JSON，检查输入约束与返回结构。不会调用真实模型。'); }
  function detailDebug(m) { const input=ui.debugInput[m.id]||JSON.stringify(exampleInput(m.type),null,2);return `<div class="mc-debug-grid"><section class="panel mc-panel"><div class="mc-panel-head"><div><h2>${E(types[m.type])}调试</h2><p class="small muted">按照此模型类型构造输入，配置会固定到本次记录。</p></div></div><form id="mc-debug-form" data-form="mc-debug-form" data-id="${E(m.id)}" novalidate><div class="field"><label class="field-label" for="mc-debug-input">输入 JSON</label><textarea class="textarea mono mc-json-input" id="mc-debug-input" name="input" aria-describedby="mc-debug-input-help">${E(input)}</textarea><p class="field-help" id="mc-debug-input-help">${m.type==='stt'?'使用 demoTranscript 表示模拟音频内容，不会上传或识别音频。':m.type==='rerank'?'query 为查询；documents 为字符串数组，返回原始索引与本地字符重合度。':m.type==='embedding'?'texts 为字符串数组，返回配置维度和确定性的向量预览。':'输入与输出均用于验证本地交互结构。'}</p></div>${select('模拟场景','mc-debug-scenario',[['success','模拟成功'],['timeout','模拟超时']], 'success')}${formError}<div class="row">${S.btn('填入示例','mc-debug-example',{variant:'secondary',attrs:attrs(m.id)})}${S.btn('运行本地调试','mc-debug-run',{icon:'play',attrs:attrs(m.id,!available(m)?'disabled':'')})}</div></form>${!available(m)?'<p class="field-error">此模型或连接不可用，启用后可调试。</p>':''}</section><section class="panel mc-panel"><div class="mc-panel-head"><h2>输出</h2>${S.badge('本地模拟','neutral')}</div><div id="mc-debug-output" aria-live="polite">${debugResultHTML(ui.debugResult[m.id])}</div></section></div>`; }
  function detailHistory(m) { const rows=data().debugRuns.filter(r=>r.modelId===m.id), p=pager(rows.length);return `<section class="panel mc-panel"><div class="mc-panel-head"><div><h2>调试记录</h2><p class="small muted">保留最近 100 次模型调试；每条含类型、输入、输出与配置快照。</p></div></div>${table(['时间 / 记录','结果','固定配置','操作'],rows.slice(p.start,p.start+8).map(r=>`<tr><td>${date(r.createdAt)}<small class="mc-sub mono">${E(r.id)}</small></td><td>${S.badge(r.error?'模拟失败':'模拟完成',r.error?'warning':'success')}</td><td>${E(types[r.modelType])} · r${r.snapshot.revision}<small class="mc-sub">${E(r.snapshot.modelId)}</small></td><td>${S.btn('查看','mc-debug-record',{small:true,variant:'secondary',attrs:attrs(r.id)})}</td></tr>`).join(''),S.empty('还没有调试记录','在类型调试中运行一次检查后，结果会显示在这里。'))}${p.html}</section>`; }
  S.page('model-detail',{title:'模型详情',section:'配置',render(){const m=rawModel(S.params.id);if(!m)return S.empty('模型不存在','该模型可能已被删除。',link('返回模型中心','models',{},'btn btn-secondary'));const tab=['debug','history'].includes(S.params.tab)?S.params.tab:'overview';return `<div class="mc-page"><div class="mc-back">${link('← 模型中心','models')}</div>${S.header(types[m.type],m.name,`${m.modelId} · ${provider(m.providerId)?.name||'连接不存在'}`,S.btn('编辑模型','mc-model-edit',{variant:'secondary',attrs:attrs(m.id)}))}<div class="mc-meta">${modelState(m)}<span>配置 r${m.revision}</span><span>更新于 ${date(m.updatedAt)}</span><span>本地模拟</span></div>${S.tabs([{id:'overview',label:'配置与引用'},{id:'debug',label:'类型调试'},{id:'history',label:'调试记录',count:data().debugRuns.filter(r=>r.modelId===m.id).length}],tab,'mc-detail-tab')}${tab==='debug'?detailDebug(m):tab==='history'?detailHistory(m):detailOverview(m)}</div>`;},mount:mountPage});

  function mountPage(container) {
    let timer;
    const input = e => { if (e.isComposing) return; const target=e.target; if (!['mc-search','mc-provider-search'].includes(target.id)) { if(target.id==='mc-debug-input')ui.debugInput[S.params.id]=target.value;return; } clearTimeout(timer); timer=setTimeout(()=>{const start=target.selectionStart,end=target.selectionEnd;ui[target.id==='mc-search'?'q':'providerQ']=target.value;S.go(S.route,{...S.params,page:1});const next=document.getElementById(target.id);next?.focus();next?.setSelectionRange?.(start,end);},180); };
    const change = e => { const keys={'mc-type-filter':'type','mc-status-filter':'status'};if(keys[e.target.id])S.go('models',{...S.params,[keys[e.target.id]]:e.target.value,page:1}); };
    container.addEventListener('input',input);container.addEventListener('compositionend',input);container.addEventListener('change',change);
    return()=>{clearTimeout(timer);container.removeEventListener('input',input);container.removeEventListener('compositionend',input);container.removeEventListener('change',change);};
  }
  const value = (form,name) => form.elements[name]?.value || '';
  const checked = (form,name) => !!form.elements[name]?.checked;
  function action(name, fn) { S.action(name, async el => { try { return await fn(el||{dataset:{}}); } catch(e) { const node=document.getElementById('mc-form-error'); if(node && document.getElementById('app-dialog')?.open) { node.textContent=e.message; node.setAttribute('tabindex','-1');node.focus(); } else S.toast(e.message,'error'); } }); }
  function providerDraftFromForm() { const f=document.getElementById('mc-provider-form');if(!f)return ui.providerDraft;return {...ui.providerDraft,name:value(f,'name'),template:value(f,'mc-provider-template'),protocol:value(f,'mc-provider-protocol'),baseUrl:value(f,'baseUrl'),auth:value(f,'mc-provider-auth'),credentialRef:value(f,'credentialRef'),apiVersion:value(f,'apiVersion'),timeoutMs:value(f,'timeoutMs'),retries:value(f,'retries'),enabled:checked(f,'enabled')}; }
  function openProvider(id, draft) {
    const old=id?provider(id):null,t=templates[0];ui.providerDraft=draft||copy(old||{name:'',template:t.id,protocol:t.family,baseUrl:t.url,auth:'reference',credentialRef:'',apiVersion:'',timeoutMs:60000,retries:1,enabled:true});const d=ui.providerDraft;
    S.modal({title:old?'配置服务商连接':'添加服务商连接',subtitle:'同一连接可维护多个模型实例。模板只预填格式，不代表真实服务已适配。',wide:true,body:`<form id="mc-provider-form" data-form="mc-provider-form" data-id="${E(id||'')}" novalidate><div class="mc-form-grid">${S.field('连接名称',{id:'mc-provider-name',name:'name',value:d.name,required:true,placeholder:'例如：团队主模型网关'})}${select('服务商模板','mc-provider-template',templates.map(t=>[t.id,t.name]),d.template)}</div><div class="mc-form-grid">${select('默认协议族','mc-provider-protocol',Object.entries(families),d.protocol)}${select('认证方式','mc-provider-auth',[['reference','凭证引用'],['none','无需凭证（本地服务）']],d.auth)}</div>${S.field('Base URL',{id:'mc-provider-url',name:'baseUrl',value:d.baseUrl,required:true,help:'完整 HTTPS 基址，不含 API Key 或查询参数；本机可使用 HTTP。'})}${S.field('凭证引用',{id:'mc-provider-ref',name:'credentialRef',value:d.credentialRef,placeholder:'env:MODEL_API_KEY 或 vault:team/models/main',help:'仅保存引用标识。原型不会读取环境变量或密钥库。'})}<div class="mc-form-grid">${S.field('API 版本 / 部署附加标识（可选）',{id:'mc-provider-version',name:'apiVersion',value:d.apiVersion,help:'Azure 等服务可按实际部署要求填写。'})}${S.field('请求超时（毫秒）',{id:'mc-provider-timeout',name:'timeoutMs',value:d.timeoutMs,type:'number'})}${S.field('失败重试次数',{id:'mc-provider-retries',name:'retries',value:d.retries,type:'number'})}<label class="mc-checkbox"><input type="checkbox" name="enabled" ${d.enabled?'checked':''}>启用此连接</label></div><div class="mc-temporary"><label class="field-label" for="mc-temporary-key">临时演示密钥（可选）</label><input class="input" id="mc-temporary-key" type="password" autocomplete="off" placeholder="仅体验遮罩；关闭或保存后丢弃" aria-describedby="mc-temporary-key-help"><p class="field-help" id="mc-temporary-key-help">不保存、不发送。连接测试不需要真实凭据。</p></div>${old?`<div class="mc-provider-test">${select('模拟校验场景','mc-provider-scenario',[['success','模拟校验通过'],['timeout','模拟连接超时'],['unauthorized','模拟凭证拒绝']],'success')}${S.btn('校验已保存配置','mc-provider-test',{variant:'secondary',attrs:attrs(old.id)})}<p id="mc-provider-test-result" class="small muted" role="status">${E(old.validation?.message||'尚未校验已保存配置')}</p></div>`:'<p class="small muted">保存连接后，可执行配置校验和模拟发现。</p>'}${formError}</form>`,footer:`${old?S.btn(old.enabled?'停用连接':'启用连接','mc-status',{variant:'ghost',attrs:attrs(old.id,`data-kind="provider" data-status="${old.enabled?'disable':'enable'}"`)})+S.btn(old.archived?'恢复连接':'归档连接',old.archived?'mc-restore':'mc-status',{variant:'ghost',attrs:attrs(old.id,'data-kind="provider" data-status="archive"')})+S.btn('删除','mc-delete',{variant:'ghost',attrs:attrs(old.id,'data-kind="provider"')}):''}${S.btn('取消','modal-close',{variant:'secondary'})}${S.btn('保存连接','mc-provider-save')}`,onOpen:()=>{const el=document.getElementById('mc-provider-template');el?.addEventListener('change',()=>{const next=providerDraftFromForm(),t=templates.find(x=>x.id===el.value);next.template=t.id;next.protocol=t.family;next.baseUrl=t.url;next.auth=t.auth||'reference';openProvider(id,next);});},onClose:()=>{const key=document.getElementById('mc-temporary-key');if(key)key.value='';}});
  }
  function modelDraftFromForm() { const f=document.getElementById('mc-model-form');if(!f)return ui.modelDraft;const type=value(f,'mc-model-type'),config={};Object.keys(typeConfig(type)).forEach(k=>{config[k]=value(f,'cfg-'+k);});return {...ui.modelDraft,name:value(f,'name'),modelId:value(f,'modelId'),providerId:value(f,'mc-model-provider'),type,adapter:value(f,'mc-model-adapter'),requestPath:value(f,'requestPath'),enabled:checked(f,'enabled'),capabilities:Object.fromEntries(Object.keys(caps).map(c=>[c,checked(f,'cap-'+c)])),config}; }
  function configFields(type,cfg) {
    const labels={contextWindow:'上下文窗口（Token）',maxOutputTokens:'最大输出 Token',temperature:'温度',dimensions:'向量维度',batchSize:'批大小',topN:'返回 Top N',maxDocuments:'最大文档数',width:'宽度（px）',height:'高度（px）',maxImages:'每次最多张数',language:'语言代码 / auto',maxSeconds:'音频时长上限（秒）',voice:'音色 ID',speed:'语速倍率'};
    return Object.entries({...typeConfig(type),...cfg}).filter(([k])=>Object.hasOwn(typeConfig(type),k)).map(([k,v])=>k==='metric'?select('距离度量','cfg-metric',[['cosine','Cosine'],['dot','Dot product'],['euclidean','Euclidean']],v):k==='format'?select('输出格式','cfg-format',({image:['png','jpeg','webp'],stt:['text','json','srt','vtt'],tts:['mp3','wav','opus','aac']}[type]||[]).map(x=>[x,x.toUpperCase()]),v):S.field(labels[k]||k,{id:'mc-cfg-'+k,name:'cfg-'+k,value:v,type:typeof typeConfig(type)[k]==='number'?'number':'text'})).join('');
  }
  function openModel(id, draft) {
    const old=id?rawModel(id):null,ps=data().providers.filter(p=>!p.archived);if(!ps.length){openProvider();return;}
    const first=ps.find(p=>p.enabled)||ps[0];ui.modelDraft=draft||copy(old||{name:'',modelId:'',providerId:first.id,type:'llm',adapter:recommendedAdapter(first.protocol,'llm')||'custom-http',requestPath:'',config:typeConfig('llm'),capabilities:Object.fromEntries(Object.keys(caps).map(c=>[c,false])),enabled:true});const d=ui.modelDraft,options=Object.entries(adapters).filter(([,a])=>a.types.includes(d.type));
    S.modal({title:old?'编辑模型实例':'添加模型实例',subtitle:'Model ID 使用服务商实际标识。类型与能力由你声明，模拟调试不会验证厂商支持范围。',wide:true,body:`<form id="mc-model-form" data-form="mc-model-form" data-id="${E(id||'')}" novalidate><div class="mc-form-grid">${S.field('显示名称',{id:'mc-model-name',name:'name',value:d.name,required:true,placeholder:'例如：主力推理模型'})}${S.field('Model ID / Azure 部署名',{id:'mc-model-modelid',name:'modelId',value:d.modelId,required:true,placeholder:'填写服务商的模型 ID'})}${select('服务商连接','mc-model-provider',ps.map(p=>[p.id,p.name+(!p.enabled?'（已停用）':'')]),d.providerId)}${select('模型类型','mc-model-type',Object.entries(types),d.type)}${select('请求协议','mc-model-adapter',[['','请选择协议'],...options.map(([k,a])=>[k,a.name])],d.adapter)}${S.field('请求路径覆盖（自定义时必填）',{id:'mc-model-path',name:'requestPath',value:d.requestPath,placeholder:adapters[d.adapter]?.path||'/your-endpoint',help:'相对于连接 Base URL；原型仅固定配置，不执行 HTTP 映射。'})}</div>${d.type==='rerank'?'<div class="notice small">重排有独立的 query / documents / top_n 输入。请按服务商实际接口选择 Cohere、Jina、Voyage 或自定义协议。</div>':''}<h3 class="mc-form-heading">${E(types[d.type])}参数</h3><div class="mc-form-grid">${configFields(d.type,d.config)}</div>${d.type==='llm'?`<h3 class="mc-form-heading">能力声明</h3><div class="mc-capabilities">${Object.entries(caps).map(([k,label])=>`<label class="mc-checkbox"><input type="checkbox" name="cap-${k}" ${d.capabilities[k]?'checked':''}>${E(label)}</label>`).join('')}</div><p class="field-help">工具调用用于 MCP、插件与子 Agent 工具调度；不会根据服务商品牌自动开启。</p>`:''}<label class="mc-checkbox"><input type="checkbox" name="enabled" ${d.enabled?'checked':''}>启用此模型</label>${formError}</form>`,footer:S.btn('取消','modal-close',{variant:'secondary'})+S.btn('保存模型','mc-model-save'),onOpen:()=>{['mc-model-type','mc-model-provider'].forEach(key=>document.getElementById(key)?.addEventListener('change',()=>{const next=modelDraftFromForm();if(next.type!==d.type){next.config=typeConfig(next.type);next.capabilities=Object.fromEntries(Object.keys(caps).map(c=>[c,false]));}next.adapter=recommendedAdapter(provider(next.providerId)?.protocol,next.type);next.requestPath='';openModel(id,next);}));}});
  }
  action('mc-tab',el=>S.go('models',{tab:el.dataset.id||el.dataset.tab||el.dataset.value}));
  action('mc-detail-tab',el=>S.go('model-detail',{id:S.params.id,tab:el.dataset.id||el.dataset.tab||el.dataset.value}));
  action('mc-page',el=>S.go(S.route,{...S.params,page:el.dataset.page}));
  action('mc-archive-filter',()=>S.go('models',{...S.params,archived:S.params.archived==='1'?'0':'1',page:1}));
  action('mc-clear-provider',()=>{const p={...S.params};delete p.provider;p.page=1;S.go('models',p);});
  action('mc-provider-add',()=>openProvider());action('mc-provider-edit',el=>openProvider(el.dataset.id));
  action('mc-model-add',()=>openModel());action('mc-model-edit',el=>openModel(el.dataset.id));
  action('mc-provider-save',()=>{const f=document.getElementById('mc-provider-form');if(!S.validate(f,{name:'请输入连接名称',baseUrl:'请输入 Base URL'}))return;const p=saveProvider({...providerDraftFromForm(),id:f.dataset.id||undefined});document.getElementById('mc-temporary-key').value='';S.closeModal();S.go('models',{tab:'providers'});S.toast('连接配置已保存。可继续校验或维护模型实例。');return p;});
  action('mc-model-save',()=>{const f=document.getElementById('mc-model-form');if(!S.validate(f,{name:'请输入显示名称',modelId:'请输入 Model ID'}))return;const m=saveModel({...modelDraftFromForm(),id:f.dataset.id||undefined});S.closeModal();S.go('model-detail',{id:m.id});S.toast('模型配置已保存');return m;});
  action('mc-provider-test',el=>{const f=document.getElementById('mc-provider-form'),result=testConnection(el.dataset.id,value(f,'mc-provider-scenario'));document.getElementById('mc-provider-test-result').textContent=result.message;return result;});
  action('mc-discover',el=>{const p=provider(el.dataset.id),rows=discover(p.id);ui.discovery={providerId:p.id};S.modal({title:'模拟发现模型',subtitle:p.name+' · 使用本地类型示例，未请求服务商模型列表',body:`<form id="mc-discover-form" data-form="mc-discover-form" novalidate><div class="mc-discover-list">${rows.map(c=>`<label class="mc-discover-row"><input type="checkbox" name="discover-type" value="${c.type}" ${c.imported?'disabled':'checked'}><span><strong>${E(c.name)}</strong><small class="mc-sub mono">${E(c.modelId)}</small></span>${S.badge(c.imported?'已导入':types[c.type],c.imported?'neutral':'success')}</label>`).join('')}</div><p class="field-help">导入的示例不声明工具、视觉等能力。请根据具体模型编辑确认。</p>${formError}</form>`,footer:S.btn('取消','modal-close',{variant:'secondary'})+S.btn('导入所选示例','mc-discover-import')});});
  action('mc-discover-import',()=>{const f=document.getElementById('mc-discover-form'),wanted=Array.from(f.querySelectorAll('input[name="discover-type"]:checked')).map(n=>n.value),rows=importDiscovered(ui.discovery.providerId,wanted);S.closeModal();S.go('models',{provider:ui.discovery.providerId});S.toast('已导入 '+rows.length+' 个本地模型示例');});
  action('mc-default-edit',el=>{const type=el.dataset.type,rows=list({type,enabled:true}),current=defaults(type);S.modal({title:'设置'+types[type]+'默认模型',body:`<form id="mc-default-form" data-form="mc-default-form" data-type="${type}" novalidate>${select('默认模型','mc-default-selection',[['','暂不指定'],...rows.map(m=>[m.id,m.name+' · '+provider(m.providerId)?.name])],current)}${current&&!rows.some(m=>m.id===current)?'<p class="field-error">原默认模型已不可用，请重新选择或清除默认值。</p>':''}<p class="field-help">仅列出类型一致且连接可用的模型；不会修改已保存的 Agent、节点或运行快照。</p>${formError}</form>`,footer:S.btn('取消','modal-close',{variant:'secondary'})+S.btn('保存默认用途','mc-default-save')});});
  action('mc-default-save',()=>{const f=document.getElementById('mc-default-form');setDefault(f.dataset.type,value(f,'mc-default-selection'));S.closeModal();S.render();S.toast('默认用途已更新');});
  function affected(kind,id) { return kind === 'model' ? dependencies(id) : providerReferences(id); }
  action('mc-status',el=>{const{kind,id,status:next}=el.dataset,item=kind==='provider'?provider(id):rawModel(id);if(next==='enable'){setStatus(kind,id,next);S.closeModal();S.render();S.toast('已启用');return;}const refs=affected(kind,id);ui.pending={kind,id,status:next};S.modal({title:next==='archive'?'归档这项配置？':'停用这项配置？',subtitle:item?.name,body:`<p>${refs.length?'以下配置受到影响。新的调用将提示不可用；现有引用不会自动替换。':'当前没有发现配置引用。'}历史记录与快照保留。</p>${refs.length?`<ul class="mc-dependencies">${refs.map(r=>`<li><span>${E(r.kind)}</span>${E(r.name)}</li>`).join('')}</ul>`:''}${formError}`,footer:S.btn('保持启用','modal-close',{variant:'secondary'})+S.btn(next==='archive'?'确认归档':'确认停用','mc-status-confirm',{variant:'danger'})});});
  action('mc-status-confirm',()=>{const p=ui.pending;setStatus(p.kind,p.id,p.status);S.closeModal();S.render();S.toast(p.status==='archive'?'配置已归档':'配置已停用');});
  action('mc-restore',el=>{setStatus(el.dataset.kind||'model',el.dataset.id,'restore');S.closeModal();S.render();S.toast('配置已恢复，当前保持停用，可核对后启用');});
  action('mc-delete',el=>{const{kind,id}=el.dataset,refs=affected(kind,id);ui.pending={kind,id};S.modal({title:refs.length?'请先迁移配置引用':'删除这项配置？',body:`<p>${refs.length?'删除前需要处理以下引用。也可以先停用或归档此配置。':'此配置将从模型中心移除；历史运行快照与调试记录保留。'}</p>${refs.length?`<ul class="mc-dependencies">${refs.map(r=>`<li><span>${E(r.kind)}</span>${link(r.name,r.route,r.params)}</li>`).join('')}</ul>`:''}${formError}`,footer:S.btn('返回','modal-close',{variant:'secondary'})+(!refs.length?S.btn('删除配置','mc-delete-confirm',{variant:'danger'}):'')});});
  action('mc-delete-confirm',()=>{remove(ui.pending.kind,ui.pending.id);S.closeModal();S.go('models',{tab:ui.pending.kind==='provider'?'providers':'models'});S.toast('配置已删除');});
  action('mc-debug-example',el=>{const m=rawModel(el.dataset.id),input=JSON.stringify(exampleInput(m.type),null,2);ui.debugInput[m.id]=input;document.getElementById('mc-debug-input').value=input;});
  action('mc-debug-run',()=>{const f=document.getElementById('mc-debug-form'),raw=value(f,'input');ui.debugInput[f.dataset.id]=raw;let input;try{input=JSON.parse(raw);}catch(_){document.getElementById('mc-form-error').textContent='JSON 格式不正确，请检查引号、逗号与括号。';return;}try{const record=debug(f.dataset.id,input,value(f,'mc-debug-scenario'));ui.debugResult[f.dataset.id]=record;document.getElementById('mc-form-error').textContent='';document.getElementById('mc-debug-output').innerHTML=debugResultHTML(record);S.toast(record.error?'模拟调试返回超时，可切换场景重试':'本地类型调试已完成',record.error?'error':'success');return record;}catch(e){document.getElementById('mc-form-error').textContent=e.message;}});
  action('mc-debug-record',el=>{const r=data().debugRuns.find(x=>x.id===el.dataset.id);if(!r)fail('RUN_NOT_FOUND','调试记录已不存在。');S.drawer({title:'模型调试记录',subtitle:r.modelName+' · '+date(r.createdAt),body:`<div class="mc-record">${debugResultHTML(r)}<h3>输入</h3><pre><code>${E(JSON.stringify(r.input,null,2))}</code></pre><h3>固定模型配置</h3><pre><code>${E(JSON.stringify(r.snapshot,null,2))}</code></pre></div>`});});
  if(S.form)[['mc-provider-form','mc-provider-save'],['mc-model-form','mc-model-save'],['mc-default-form','mc-default-save'],['mc-discover-form','mc-discover-import'],['mc-debug-form','mc-debug-run']].forEach(([form,name])=>S.form(form,()=>S.actions[name]()));
}());
