'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { setup } = require('./expanded-harness.cjs');
const plain = value => JSON.parse(JSON.stringify(value));
const checks = [];
const rendered = [];
function capture(route, params, html) {
  assert.equal(/href\s*=\s*["']\s*["']/i.test(html), false, route + ' must not render empty links');
  rendered.push({ route, params: plain(params || {}), html });
  return html;
}
function fresh(saved) {
  const env = setup(saved);
  if (!env.S.ContentStore) vm.runInContext(fs.readFileSync(path.join(__dirname, '../knowledge.js'), 'utf8'), env.context, { filename: 'knowledge.js' });
  env.C = env.S.ContentStore;
  for (const route of ['knowledge', 'assets', 'knowledge-detail', 'library', 'content-detail', 'market', 'review']) {
    if (!env.S.pages[route]) continue;
    const render = env.S.pages[route].render;
    env.S.pages[route].render = function (...args) { return capture(route, env.S.params, render.apply(this, args)); };
  }
  env.S.modal = options => { env.modal = options; capture('dialog', { title: options.title }, (options.body || '') + (options.footer || '')); };
  env.S.drawer = options => { env.modal = options; capture('drawer', { title: options.title }, (options.body || '') + (options.footer || '')); };
  env.S.closeModal = () => {};
  return env;
}
function errorCode(code) { return error => error.code === code; }
async function test(name, run) { await run(); checks.push(name); process.stdout.write('PASS ' + name + '\n'); }
const file = (name, content, type = 'text/plain') => ({ name, type, size: Buffer.byteLength(content), text: async () => content });
function publishForm(env, description = '用于验证资源模板的公开说明、版本快照和配置范围。') {
  const input = value => ({ value, id: 'eco-public-description', setAttribute() {}, focus() {} });
  const fields = { 'eco-public-description': input(description), 'eco-publish-consent': { ...input(''), checked: true }, 'eco-publish-consent-error': { textContent: '' } };
  const form = { elements: { namedItem: name => fields[name] }, querySelector: selector => fields[selector.replace(/^#/, '')] || null };
  env.context.document.querySelector = selector => selector === '#eco-publish-form' ? form : null;
  return form;
}

(async () => {
  await test('migration preserves real content and removes duplicate asset ownership', () => {
    const { S, C } = fresh();
    assert.equal(S.state.ecoAssets.length, 0);
    const brand = C.getKnowledge('eco-kb-brand');
    assert.equal(brand.documents.length, 1, 'seed document count must come from actual body');
    assert.match(brand.documents[0].content, /品牌表达清晰/);
    assert.equal(brand.documents[0].status, 'ready');
    assert.equal(C.listContent().every(item => ['prompt', 'skill'].includes(item.type)), true);
    assert.equal(C.getContent('skill-research').name, '研究方法');
    assert.equal(S.Runtime.skills.some(skill => skill.id === 'skill-research'), false);
    const legacy = C.getKnowledge('knowledge-legacy-files').documents.find(doc => doc.id === 'eco-file-roadmap');
    assert.equal(legacy.status, 'needs_content');
    assert.equal(legacy.content, '');
    assert.equal(legacy.chunks.length, 0);
    assert.ok(S.state.contentStore.legacyConnections.some(item => item.id === 'eco-mcp-docs'));
    assert.equal(C.listKnowledge({ archived: 'all' }).some(kb => kb.id === 'eco-mcp-docs'), false);
    assert.equal(S.state.agents.find(agent => agent.id === 'research').knowledge, '');
  });

  await test('local Runtime Skills migrate with versioned bodies and keep connected resources in their owner', () => {
    const original = fresh(), saved = plain(original.S.state);
    delete saved.contentStore.runtimeSkillsMigrated;
    saved.capabilities.skills = [
      { id: 'versioned-local-skill', title: '可维护研究方法', version: '2.0', content: '当前方法 {{topic}}', dependencies: ['web.search'], versions: [{ version: '1.0', content: '历史方法 {{subject}}', dependencies: ['web.fetch'] }] },
      { id: 'connected-skill', name: '连接提供的指引', connectionId: 'mcp-workspace', content: '连接拥有的内容', version: '1.0' }
    ];
    const { C, R } = fresh(saved);
    const migrated = C.getContent('versioned-local-skill');
    assert.equal(migrated.version, '2.0');
    assert.equal(migrated.content, '当前方法 {{topic}}');
    assert.deepEqual(plain(migrated.dependencies), ['web.search']);
    assert.equal(C.resolveContext({ kind: 'skill', id: migrated.id, version: '1.0' }).content, '历史方法 {{subject}}');
    assert.deepEqual(plain(C.resolveContext({ kind: 'skill', id: migrated.id, version: '1.0' }).dependencies), ['web.fetch']);
    assert.equal(R.skills.some(skill => skill.id === migrated.id), false);
    assert.equal(R.skills.some(skill => skill.id === 'connected-skill'), true);
    assert.ok(R.prompts.some(prompt => prompt.id === 'prompt-report'));
    assert.ok(R.resources.some(resource => resource.id === 'resource-style'));
  });

  await test('legacy placeholder cleanup leaves actual and user-created references intact', () => {
    const original = fresh();
    original.C.saveKnowledge({ name: '品牌内容规范' });
    const saved = plain(original.S.state);
    delete saved.contentStore.legacyAgentReferencesMigrated;
    saved.agents = [
      { id: 'legacy-fixture', name: '迁移样例', status: 'draft', knowledge: '产品与行业知识库', publishedConfig: { knowledge: '产品与行业知识库' }, publishedVersions: [{ knowledge: '产品与行业知识库' }], draft: { knowledge: '产品与行业知识库' } },
      { id: 'real-fixture', name: '实际资料', status: 'draft', knowledge: '品牌内容规范' },
      { id: 'custom-fixture', name: '用户引用', status: 'draft', knowledge: '客户自己的知识库' }
    ];
    const { S } = fresh(saved);
    const legacy = S.state.agents[0];
    assert.equal(legacy.knowledge, '');
    assert.equal(legacy.publishedConfig.knowledge, '');
    assert.equal(legacy.publishedVersions[0].knowledge, '');
    assert.equal(legacy.draft.legacyKnowledgeReference, '产品与行业知识库');
    assert.equal(S.state.agents[1].knowledge, '品牌内容规范');
    assert.equal(S.state.agents[2].knowledge, '客户自己的知识库');
  });

  await test('knowledge CRUD, local search parameters, and immutable revisions', () => {
    const { C } = fresh();
    const kb = C.saveKnowledge({ name: '报销规则 QA', settings: { chunkSize: 100, overlap: 20 } });
    assert.equal(kb.documents.length, 0);
    assert.equal(C.searchKnowledge(kb.id, '住宿').total, 0);
    const one = C.addDocument(kb.id, { name: '规则一.md', content: '住宿 报销额度为每天 520 元。' });
    C.addDocument(kb.id, { name: '规则二.md', content: '交通 报销需要保留行程记录。' });
    const low = C.searchKnowledge(kb.id, '住宿 报销', { topK: 20, scoreThreshold: 0.4 });
    const high = C.searchKnowledge(kb.id, '住宿 报销', { topK: 20, scoreThreshold: 0.8 });
    assert.equal(low.mode, 'local-keyword');
    assert.equal(low.total, 2);
    assert.equal(high.total, 1);
    assert.match(high.items[0].text, /520/);
    assert.equal(C.searchKnowledge(kb.id, '住宿 报销', { topK: 1, scoreThreshold: 0.4 }).items.length, 1);
    assert.equal(C.searchKnowledge(kb.id, '绝无此内容海洋水族').total, 0);
    const frozen = C.snapshotKnowledge(kb.id);
    C.addDocument(kb.id, { id: one.id, name: one.name, content: '住宿 补贴更新为每天 630 元。' });
    assert.equal(C.searchKnowledge(kb.id, '520').total, 0);
    assert.match(C.searchKnowledge(kb.id, '520', { snapshot: frozen }).items[0].text, /520/);
    assert.match(C.searchSnapshot(frozen, '520').items[0].text, /520/);
    assert.equal(C.snapshotKnowledge(kb.id, frozen.version).documents.find(doc => doc.id === one.id).content, '住宿 报销额度为每天 520 元。');
    frozen.documents[0].content = 'external mutation';
    assert.notEqual(C.snapshotKnowledge(kb.id, frozen.version).documents[0].content, 'external mutation');
    const beforeRemoval = C.snapshotKnowledge(kb.id);
    C.removeDocument(kb.id, one.id);
    assert.equal(C.searchKnowledge(kb.id, '630').total, 0);
    assert.equal(C.searchSnapshot(beforeRemoval, '630').total, 1);
    assert.throws(() => C.saveKnowledge({ name: '报销规则 QA' }), errorCode('NAME_EXISTS'));
    assert.throws(() => C.saveKnowledge({ name: ' ' }), errorCode('INVALID_NAME'));
    assert.throws(() => C.saveKnowledge({ name: 'invalid', settings: { chunkSize: 99, overlap: 0 } }), errorCode('INVALID_CHUNK'));
    assert.throws(() => C.saveKnowledge({ name: 'invalid', settings: { chunkSize: 100, overlap: 100 } }), errorCode('INVALID_OVERLAP'));
    assert.throws(() => C.searchKnowledge(kb.id, 'x'.repeat(501)), errorCode('QUERY_TOO_LONG'));
    assert.throws(() => C.searchKnowledge(kb.id, 'x', { scoreThreshold: 1.2 }), errorCode('INVALID_THRESHOLD'));
  });

  await test('chunk settings change actual segmentation while old snapshots remain usable', () => {
    const { C } = fresh();
    const kb = C.saveKnowledge({ name: '分段试验', settings: { chunkSize: 100, overlap: 0 } });
    const doc = C.addDocument(kb.id, { name: 'long.txt', content: '检索关键词。' + '正文'.repeat(240) });
    const frozen = C.snapshotKnowledge(kb.id);
    const oldCount = doc.chunks.length;
    C.saveKnowledge({ id: kb.id, name: '分段试验更新', settings: { chunkSize: 200, overlap: 20 } });
    assert.ok(C.getKnowledge(kb.id).documents[0].chunks.length < oldCount);
    assert.equal(frozen.documents[0].chunks.length, oldCount);
    assert.equal(C.getKnowledge('分段试验').id, kb.id, 'legacy name bindings survive a rename');
    const oldVersion = kb.version;
    C.reindex(kb.id);
    assert.notEqual(kb.version, oldVersion);
    assert.equal(C.searchSnapshot(frozen, '关键词').total, 1);
  });

  await test('archive and reference tracking preserve published configurations', () => {
    const { S, C } = fresh();
    const kb = C.saveKnowledge({ name: '引用资料' });
    C.addDocument(kb.id, { name: 'ref.txt', content: '发布快照保留这份资料。' });
    const frozen = C.snapshotKnowledge(kb.id);
    const agent = { id: 'refs-agent', name: '引用者', knowledge: kb.id, publishedConfig: { knowledge: kb.id, knowledgeSnapshot: frozen } };
    const flow = { id: 'refs-flow', title: '引用流程', nodes: [{ type: 'knowledge', config: { knowledge: kb.id } }], publishedSnapshot: { nodes: [{ type: 'knowledge', config: { knowledge: kb.id } }] } };
    S.state.agents.push(agent); S.state.workflow.flows.push(flow);
    const original = JSON.stringify(agent.publishedConfig);
    const refs = C.references('knowledge', kb.id);
    assert.equal(refs.filter(ref => ref.id === agent.id).length, 2);
    assert.equal(refs.filter(ref => ref.id === flow.id && ref.published).length, 1);
    C.archive('knowledge', kb.id, true);
    assert.equal(C.listKnowledge().some(item => item.id === kb.id), false);
    assert.equal(C.listKnowledge({ archived: true }).some(item => item.id === kb.id), true);
    assert.throws(() => C.searchKnowledge(kb.id, '快照'), errorCode('KNOWLEDGE_ARCHIVED'));
    assert.throws(() => C.addDocument(kb.id, { name: 'new', content: '禁止修改' }), errorCode('KNOWLEDGE_UNAVAILABLE'));
    assert.throws(() => C.saveKnowledge({ id: kb.id, name: 'new' }), errorCode('KNOWLEDGE_ARCHIVED'));
    assert.equal(C.searchKnowledge(kb.id, '快照', { version: frozen.version }).total, 1);
    assert.equal(C.searchSnapshot(frozen, '快照').total, 1);
    assert.equal(JSON.stringify(agent.publishedConfig), original);
    C.archive('knowledge', kb.id, false);
    assert.equal(C.searchKnowledge(kb.id, '快照').total, 1);
  });

  await test('file import reads text, validates JSON, and does not fake unsupported or cancelled imports', async () => {
    const { C } = fresh();
    const kb = C.saveKnowledge({ name: '真实文件正文' });
    const imported = await C.importDocument(kb.id, file('实际文件.MD', '# 用户正文\n发票保留 90 天。'));
    assert.match(imported.content, /90 天/);
    assert.match(C.searchKnowledge(kb.id, '发票').items[0].text, /90 天/);
    const json = await C.importDocument(kb.id, file('结构化.json', '{"policy":"退货 7 天","token":"业务字段"}', 'application/json'));
    assert.deepEqual(JSON.parse(json.content), { policy: '退货 7 天', token: '业务字段' });
    assert.ok(json.content.includes('\n  '));
    const count = kb.documents.length;
    await assert.rejects(C.importDocument(kb.id, file('bad.json', '{bad}')), errorCode('INVALID_JSON'));
    await assert.rejects(C.importDocument(kb.id, file('plan.pdf', 'not parsed')), errorCode('UNSUPPORTED_FILE'));
    await assert.rejects(C.importDocument(kb.id, file('empty.txt', '')), errorCode('FILE_SIZE'));
    await assert.rejects(C.importDocument(kb.id, file('blank.txt', '  ')), errorCode('CONTENT_EMPTY'));
    await assert.rejects(C.importDocument(kb.id, file('实际文件.MD', '不同正文')), errorCode('DOCUMENT_DUPLICATE'));
    await assert.rejects(C.importDocument(kb.id, { name: 'unsupported.txt', size: 1 }), errorCode('FILE_READ_UNAVAILABLE'));
    let read = 0;
    await assert.rejects(C.importDocument(kb.id, { name: 'cancelled.txt', size: 10, text: async () => { read++; return 'read but cancelled'; } }, { shouldContinue: () => false }), errorCode('IMPORT_CANCELLED'));
    assert.equal(read, 1);
    assert.equal(kb.documents.length, count);
  });

  await test('Prompt and Skill versions, copy, and archived bindings are real user content', () => {
    const { C } = fresh();
    const prompt = C.saveContent({ type: 'prompt', name: '用户提示词', content: '针对 {{topic}} 为 {{audience}} 编写说明。' });
    assert.deepEqual(plain(prompt.arguments.map(item => item.name)), ['topic', 'audience']);
    const binding = { id: prompt.id, kind: 'prompt', version: prompt.version };
    const before = C.resolveContext(binding);
    C.saveContent({ id: prompt.id, name: prompt.name, content: '新版内容只需要 {{topic}}。' });
    assert.equal(C.resolveContext(binding).content, before.content);
    assert.notEqual(C.resolveContext({ id: prompt.id, kind: 'prompt' }).content, before.content);
    const skill = C.saveContent({ type: 'skill', name: '用户 Skill', content: '检查输入，再调用用户授权的工具。', dependencies: 'web.search，docs.create' });
    assert.deepEqual(plain(C.listContexts('skill').find(item => item.id === skill.id).dependencies), ['web.search', 'docs.create']);
    const copy = C.copyContent(prompt.id);
    assert.notEqual(copy.id, prompt.id);
    assert.equal(copy.version, '1.0.0');
    assert.equal(copy.content, prompt.content);
    C.archive('content', prompt.id, true);
    assert.equal(C.listContexts('prompt').some(item => item.id === prompt.id), false);
    assert.equal(C.resolveContext(binding).content, before.content);
    assert.throws(() => C.resolveContext({ id: prompt.id, kind: 'prompt' }), errorCode('CONTENT_ARCHIVED'));
    assert.throws(() => C.saveContent({ id: prompt.id, name: prompt.name, content: '不可直接修改归档内容' }), errorCode('CONTENT_ARCHIVED'));
    C.archive('content', prompt.id, false);
    assert.ok(C.listContexts('prompt').some(item => item.id === prompt.id));
    const long = C.saveContent({ type: 'skill', name: '长'.repeat(80), content: '可复制的长名称。' });
    assert.ok(C.copyContent(long.id).name.length <= 80);
    assert.throws(() => C.saveContent({ type: 'prompt', name: '凭据', content: 'api_key=do-not-save-this-key' }), errorCode('SECRET_CONTENT'));
  });

  await test('safe HTML, canonical routes, document preview, and data export', () => {
    const env = fresh(), { S, C } = env;
    const prompt = C.saveContent({ type: 'prompt', name: '<img src=x onerror=alert(1)>', content: '<script>alert(1)</script> {{<svg onload=alert(2)>}}' });
    S.params = { id: prompt.id };
    const contentHtml = S.pages['content-detail'].render();
    assert.ok(contentHtml.includes('&lt;script&gt;'));
    assert.equal(contentHtml.includes('<script>alert'), false);
    assert.equal(S.pages.library.render().includes('<img src=x'), false);
    const kb = C.saveKnowledge({ name: '预览正文' });
    const doc = C.addDocument(kb.id, { name: 'safe.txt', content: '<img src=x onerror=alert(1)>\n真实正文' });
    S.actions['cs-document-view']({ dataset: { kb: kb.id, id: doc.id } });
    assert.match(env.modal.body, /真实正文/);
    assert.ok(env.modal.body.includes('&lt;img'));
    C.openKnowledge(); C.openKnowledge({ id: kb.id });
    C.openContent(); C.openContent(prompt.id);
    S.actions['cs-document-new']({ dataset: { id: kb.id } });
    S.actions['cs-document-edit']({ dataset: { kb: kb.id, id: doc.id } });
    S.actions['cs-document-import']({ dataset: { id: kb.id } });
    S.actions['cs-document-remove']({ dataset: { kb: kb.id, id: doc.id } });
    S.actions['cs-archive']({ dataset: { kind: 'knowledge', id: kb.id } });
    S.actions['cs-archive']({ dataset: { kind: 'content', id: prompt.id } });
    S.actions['eco-market-detail']({ dataset: { id: 'market-notion' } });
    S.actions['eco-publish-choose']();
    S.pages.review.render();
    let download;
    S.download = (name, body, mime) => { download = { name, body, mime }; };
    S.actions['cs-knowledge-export']({ dataset: { id: kb.id } });
    assert.equal(JSON.parse(download.body).documents[0].content, doc.content);
    assert.equal(download.mime, 'application/json');
    for (const tab of ['documents', 'retrieve', 'versions', 'references']) { S.params = { id: kb.id, tab }; assert.equal(typeof S.pages['knowledge-detail'].render(), 'string'); }
    S.pages.assets.mount(); assert.equal(S.route, 'knowledge');
    S.actions['eco-asset-detail']({ dataset: { id: prompt.id } }); assert.equal(S.route, 'content-detail');
    S.actions['eco-asset-edit']({ dataset: { id: S.Runtime.connections[0].id } }); assert.equal(S.route, 'mcp-detail');
  });

  await test('search, IME composition, empty recovery, and pagination reflect user-maintained data', () => {
    const { S, C } = fresh();
    for (let index = 0; index < 10; index++) C.saveKnowledge({ name: '分页资料 ' + index });
    const handlers = {}, result = { innerHTML: '' }, clear = { hidden: true };
    const input = { value: '', addEventListener: (name, fn) => { handlers[name] = fn; }, parentElement: { querySelector: () => clear } };
    const container = { querySelector: selector => selector === '#cs-knowledge-search' ? input : selector === '#cs-knowledge-results' ? result : null };
    S.pages.knowledge.mount(container);
    handlers.compositionstart(); input.value = '分页资料'; handlers.input({ isComposing: true });
    assert.equal(result.innerHTML, '');
    handlers.compositionend();
    assert.match(result.innerHTML, /共 10 项/);
    assert.equal((result.innerHTML.match(/class="cs-name"/g) || []).length, 8);
    S.actions['cs-page']({ dataset: { key: 'knowledgePage', step: '1' } });
    assert.match(S.pages.knowledge.render(), /第 2 \/ 2 页/);
    input.value = '找不到这个知识库'; handlers.input({ isComposing: false });
    assert.match(result.innerHTML, /没有匹配的知识库/);
    assert.equal(clear.hidden, false);
    S.actions['cs-knowledge-clear']();
    assert.equal(S.pages.knowledge.render().includes('没有匹配的知识库'), false);
  });

  await test('market installs resolve to one owner and MCP stays an unconfigured template', () => {
    const { S, C, R } = fresh();
    let chosenMcp, chosenPlugin;
    S.CapabilityUI = { ...S.CapabilityUI, openConnectionTemplate: asset => { chosenMcp = asset; }, openPluginTemplate: asset => { chosenPlugin = asset; } };
    const before = { connections: R.connections.length, knowledge: C.listKnowledge({ archived: 'all' }).length, content: C.listContent({ archived: 'all' }).length };
    S.actions['eco-install']({ dataset: { id: 'market-notion' } });
    assert.equal(chosenMcp.id, 'market-notion');
    assert.equal(R.connections.length, before.connections);
    assert.equal(C.listKnowledge({ archived: 'all' }).length, before.knowledge);
    assert.equal(C.listContent({ archived: 'all' }).length, before.content);
    assert.equal(S.state.ecoAssets.length, 0);
    const savedConnection = { id: 'saved-market-mcp', kind: 'mcp', templateId: 'market-notion', status: 'unverified', enabled: false };
    R.connections.push(savedConnection);
    S.actions['eco-install']({ dataset: { id: 'market-notion' } });
    assert.equal(S.route, 'mcp-detail');
    assert.equal(S.params.id, savedConnection.id);
    assert.match(S.pages.market.render(), /已加入我的空间/);
    S.actions['eco-install']({ dataset: { id: 'market-brief' } });
    const installed = C.listContent().find(item => item.marketId === 'market-brief');
    assert.ok(installed.content.includes('{{需求想法}}'));
    assert.equal(S.route, 'content-detail');
    assert.equal(S.params.id, installed.id);
    S.actions['eco-install']({ dataset: { id: 'market-brief' } });
    assert.equal(C.listContent({ archived: 'all' }).filter(item => item.marketId === 'market-brief').length, 1);
    S.state.reviews.push({ id: 'plugin-fixture', type: 'plugin', name: '插件模板', author: '我', status: 'approved', pluginId: 'docs', version: '1.0.0' });
    S.actions['eco-install']({ dataset: { id: 'community-plugin-fixture' } });
    assert.equal(chosenPlugin.pluginId, 'docs');
    S.actions['eco-install']({ dataset: { id: 'market-researcher' } });
    const agent = S.state.agents.find(item => item.marketId === 'market-researcher');
    assert.equal(agent.status, 'draft');
    assert.equal(agent.capabilityBindings.length, 0);
    assert.equal(agent.publishedConfig, undefined);
  });

  await test('public review freezes selected content versions and strips connection credentials', () => {
    const env = fresh(), { S, C, R } = env;
    publishForm(env);
    const prompt = C.saveContent({ type: 'prompt', name: '版本分享测试', content: '最初的模板 {{topic}}' });
    const firstVersion = prompt.version;
    C.saveContent({ id: prompt.id, name: prompt.name, content: '后续修改的模板' });
    S.actions['eco-publish']({ dataset: { id: prompt.id, version: firstVersion } });
    assert.match(env.modal.footer, new RegExp('data-version="' + firstVersion.replace(/\./g, '\\.') + '"'));
    S.actions['eco-publish-confirm']({ dataset: { id: prompt.id, version: firstVersion }, disabled: false });
    const selected = S.state.reviews.find(item => item.assetId === prompt.id);
    assert.equal(selected.version, firstVersion);
    assert.equal(selected.content, '最初的模板 {{topic}}');
    const conn = R.connections.find(item => item.kind === 'mcp' && item.transport !== 'stdio');
    conn.endpoint = 'https://private-user:private-pass@public.example.invalid/mcp?token=private-value#private-hash';
    conn.credentialRef = 'private-credential-reference';
    conn.env = { API_KEY: 'private-env-value' };
    S.actions['eco-publish-confirm']({ dataset: { id: conn.id }, disabled: false });
    const shared = S.state.reviews.find(item => item.assetId === conn.id);
    assert.equal(shared.endpoint, 'https://public.example.invalid/mcp');
    assert.equal(shared.configTemplate.transport, conn.transport);
    assert.equal(JSON.stringify(shared).includes('private-'), false);
    assert.equal(JSON.stringify(shared).includes('credentialRef'), false);
    const flow = R.flows.find(item => item.publishedSnapshot);
    flow.publishedSnapshot.knowledgeSnapshot = { documents: [{ content: 'private-body-content' }] };
    flow.publishedSnapshot.nodes.find(node => node.type === 'mcp').config.apiKey = 'private-workflow-key';
    flow.publishedSnapshot.inputs = { token: 'business-token-count', password: 'business-password-field', authorization: { type: 'business-approval' } };
    flow.publishedSnapshot.outputSchema = { type: 'object', properties: { token: { type: 'string' }, password: { type: 'string' } } };
    S.actions['eco-publish-confirm']({ dataset: { id: flow.id }, disabled: false });
    const reviewedFlow = S.state.reviews.find(item => item.assetId === flow.id);
    assert.ok(reviewedFlow.workflowSnapshot.nodes.length > 0);
    assert.equal(JSON.stringify(reviewedFlow).includes('private-body-content'), false);
    assert.equal(JSON.stringify(reviewedFlow).includes('private-workflow-key'), false);
    assert.deepEqual(plain(reviewedFlow.workflowSnapshot.inputs), plain(flow.publishedSnapshot.inputs));
    assert.deepEqual(plain(reviewedFlow.workflowSnapshot.outputSchema), plain(flow.publishedSnapshot.outputSchema));
    const title = reviewedFlow.workflowSnapshot.title;
    flow.publishedSnapshot.title = '发布后改动';
    assert.equal(reviewedFlow.workflowSnapshot.title, title);
  });

  await test('storage failure rolls back content changes and saved user data survives reload', () => {
    const env = fresh(), { S, C } = env;
    const kb = C.saveKnowledge({ name: '持久化知识库' });
    C.addDocument(kb.id, { name: 'data.txt', content: '用户自己的退款规则，期限是 17 天。' });
    const prompt = C.saveContent({ type: 'prompt', name: '持久化提示词', content: '保留输入 {{user_value}}' });
    const saved = plain(JSON.parse(env.storage.get('otryx-studio-demo')));
    const before = plain(C.snapshotKnowledge(kb.id));
    const save = S.save;
    S.save = () => { S.session.storageUnavailable = true; return false; };
    assert.throws(() => C.addDocument(kb.id, { name: 'unsaved.txt', content: '不得假装保存成功' }), errorCode('STORAGE_UNAVAILABLE'));
    assert.deepEqual(plain(C.snapshotKnowledge(kb.id)), before);
    assert.equal(C.getKnowledge(kb.id).documents.some(item => item.name === 'unsaved.txt'), false);
    S.save = save;
    C.addDocument(kb.id, { name: 'recovered.txt', content: '存储恢复后正常保存' });
    assert.equal(S.session.storageUnavailable, false);
    const reload = fresh(saved);
    assert.match(reload.C.searchKnowledge(kb.id, '退款').items[0].text, /17 天/);
    assert.equal(reload.C.getContent(prompt.id).content, '保留输入 {{user_value}}');
    assert.equal(reload.S.state.ecoAssets.length, 0);
    assert.equal(reload.C.getKnowledge(kb.id).documents.some(item => item.name === 'unsaved.txt'), false);
  });

  const renderedDirectory = path.join(__dirname, '.generated');
  fs.mkdirSync(renderedDirectory, { recursive: true });
  fs.writeFileSync(path.join(renderedDirectory, 'knowledge-rendered.json'), JSON.stringify(rendered, null, 2));
  process.stdout.write('\nKnowledge/content contract: ' + checks.length + ' scenarios passed; ' + rendered.length + ' rendered pages/dialogs captured.\n');
})().catch(error => { console.error(error); process.exitCode = 1; });
