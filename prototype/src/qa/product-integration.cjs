'use strict';
// Cross-module business contracts. Uses the real modules in expanded-harness;
// this is not a browser, network gateway, or visual-layout test.
const assert = require('node:assert/strict');
const { setup } = require('./expanded-harness.cjs');
const plain = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const passed = [];
const ref = path => ({ mode: 'ref', path });
const constant = value => ({ mode: 'constant', value });
const edge = (source, target) => ({ id: source + '-' + target, source, target, sourcePort: 'next' });
function fresh() {
  const env = setup();
  Object.assign(env, { C: env.S.ContentStore, P: env.S.Publishing, Q: env.S.Quality });
  env.S.modal = options => { env.modal = options; };
  env.S.drawer = env.S.modal;
  env.S.closeModal = () => {};
  return env;
}
function publishedFlow(R, id, nodes, edges, inputs = { topic: 'integration' }) {
  const flow = { id, title: id, description: '跨模块行为测试', version: '1.0', graphSchema: 2, published: true, nodes, edges, inputs };
  flow.publishedSnapshot = R.snapshot(flow);
  flow.versions = [plain(flow.publishedSnapshot)];
  R.flows.push(flow);
  return flow;
}
function inputNode(R, fields = [{ name: 'topic', type: 'string', required: true }]) {
  return R.newNode('input', { id: 'start', config: { fields } });
}
function quietAgent(S, overrides = {}) {
  const base = plain(S.state.agents.find(a => a.id === 'research').publishedConfig);
  return { ...base, capabilityBindings: [], contextBindings: [], knowledge: '', memoryPolicy: { read: false, write: 'off' }, executionPolicy: { ...base.executionPolicy, toolMode: 'none', maxRounds: 8, maxTokens: 30000, maxCost: 10 }, ...overrides };
}
function publishAgent(S, snapshot) {
  const agent = { ...plain(snapshot), publishedConfig: plain(snapshot), publishedVersions: [plain(snapshot)] };
  S.state.agents.push(agent);
  return agent;
}
async function complete(R, run) {
  assert(run, 'Expected a Runtime run');
  await R.waitForRun(run);
  assert.equal(run.status, 'done', run.error || 'Expected successful run');
  return run;
}
async function service(P, kind, id, name = '集成测试服务') {
  const app = P.createApp({ kind, id, name });
  P.changeStatus(app.id, 'published');
  const issued = await P.issueKey(app.id, { name: name + ' Key', permissions: ['invoke', 'read', 'stop'], rateLimit: 60, dayQuota: 1000, days: 30 });
  return { app, credential: issued.credential };
}
async function test(name, run) {
  await run(); passed.push(name); process.stdout.write('PASS ' + name + '\n');
}
function form(values, extras = {}) {
  const fields = Object.fromEntries(Object.entries(values).map(([name, value]) => [name, { value, id: name, setAttribute() {}, focus() {} }]));
  Object.assign(fields, extras);
  return { values, elements: { namedItem: name => fields[name] }, querySelector: selector => fields[selector.replace(/^#/, '')] || null };
}
function reviewForm(env) {
  const node = form({ 'eco-public-description': '包含真实工作流图及明确用途的公开测试模板。' }, { 'eco-publish-consent': { checked: true, setAttribute() {}, focus() {} }, 'eco-publish-consent-error': { textContent: '' } });
  env.context.document.querySelector = selector => selector === '#eco-publish-form' ? node : null;
}

async function main() {
  await test('本地及 MCP 上下文在工作流和 Agent 中可执行，发布快照不随内容更新漂移', async () => {
    const { S, R, C } = fresh();
    const prompt = C.saveContent({ type: 'prompt', name: '集成本地提示词', content: 'LOCAL_BEFORE {{任务}} / {{受众}}' });
    const skill = C.saveContent({ type: 'skill', name: '集成本地 Skill', content: 'LOCAL_SKILL_BEFORE' });
    const mcpPrompt = R.prompts[0], resource = R.resources[0], migratedSkill = C.getContent('skill-research');
    assert(migratedSkill, 'The existing local research Skill must belong to the content library');
    const previous = { prompt: mcpPrompt.template, resource: resource.text, skill: migratedSkill.content };
    const nodes = [inputNode(R),
      R.newNode('prompt', { id: 'local', config: { promptId: prompt.id, version: prompt.version }, bindings: { 任务: ref('input.topic'), 受众: constant('产品经理') } }),
      R.newNode('prompt', { id: 'remote', config: { promptId: mcpPrompt.id, version: mcpPrompt.version }, bindings: { topic: ref('input.topic') } }),
      R.newNode('resource', { id: 'resource', config: { resourceId: resource.id, version: resource.version }, bindings: {} }),
      R.newNode('output', { id: 'end', config: { mode: 'data' }, bindings: { local: ref('nodes.local.messages'), remote: ref('nodes.remote.messages'), resource: ref('nodes.resource.text') } })];
    const flow = publishedFlow(R, 'integration-context', nodes, [edge('start', 'local'), edge('local', 'remote'), edge('remote', 'resource'), edge('resource', 'end')]);
    const frozen = R.freezeWorkflow(flow.publishedSnapshot);
    const agentSnapshot = S.AgentStudio.freezeSnapshot(quietAgent(S, { contextBindings: [
      { kind: 'prompt', id: prompt.id, version: prompt.version, enabled: true, arguments: { 任务: '{{message}}', 受众: '产品经理' } },
      { kind: 'prompt', id: mcpPrompt.id, version: mcpPrompt.version, enabled: true },
      { kind: 'resource', id: resource.id, version: resource.version, enabled: true },
      { kind: 'skill', id: skill.id, version: skill.version, enabled: true },
      { kind: 'skill', id: migratedSkill.id, version: migratedSkill.version, enabled: true }
    ] }));
    C.saveContent({ id: prompt.id, name: prompt.name, content: 'LOCAL_AFTER {{topic}}' });
    C.saveContent({ id: skill.id, name: skill.name, content: 'LOCAL_SKILL_AFTER' });
    C.saveContent({ id: migratedSkill.id, name: migratedSkill.name, content: 'MIGRATED_SKILL_AFTER' });
    mcpPrompt.template = 'MCP_AFTER {{topic}}'; resource.text = 'RESOURCE_AFTER';
    const run = await complete(R, R.runWorkflow(frozen, { inputs: { topic: '冻结检查' }, speed: 0, preserveResolvedSnapshots: true }));
    assert.equal(run.outcome.returnValue.local[0].content, 'LOCAL_BEFORE 冻结检查 / 产品经理');
    assert.equal(run.outcome.returnValue.remote[0].content, previous.prompt.replace(/{{topic}}/g, '冻结检查'));
    assert.equal(run.outcome.returnValue.resource, previous.resource);
    const agent = await complete(R, S.AgentStudio.start({ agentId: 'research', snapshot: agentSnapshot, goal: '冻结检查', preserveResolvedSnapshots: true }));
    const contextOutputs = agent.events.filter(e => e.type === 'agent.context.loaded').map(e => e.data.output);
    assert(contextOutputs.some(output => output.messages?.[0]?.content === 'LOCAL_BEFORE 冻结检查 / 产品经理'));
    assert(contextOutputs.some(output => output.messages?.[0]?.content === previous.prompt.replace(/{{topic}}/g, '冻结检查')));
    assert(contextOutputs.some(output => output.text === previous.resource));
    const instructions = agent.events.filter(e => e.type === 'agent.skill.loaded').map(e => e.data.instructions);
    assert(instructions.includes('LOCAL_SKILL_BEFORE'));
    assert(instructions.includes(previous.skill));
    const broken = plain(frozen); delete broken.nodes.find(n => n.id === 'local').config.promptSnapshot;
    const failed = R.runWorkflow(broken, { inputs: { topic: '冻结检查' }, speed: 0, preserveResolvedSnapshots: true });
    await R.waitForRun(failed);
    assert.equal(failed.status, 'failed'); assert.equal(failed.errorCode, 'CONTEXT_SNAPSHOT_MISSING');
  });

  await test('服务与评测冻结嵌套工作流和 Agent 知识依赖，草稿依赖明确拒绝', async () => {
    const { S, R, C, P, Q } = fresh();
    const kb = C.saveKnowledge({ name: '依赖快照知识' });
    const doc = C.addDocument(kb.id, { name: '规则.txt', content: 'integrationrecord 的原规则是 BEFORE_RECORD。' });
    const agent = publishAgent(S, quietAgent(S, { id: 'integration-agent', name: '集成子 Agent', status: 'published', version: '1.0', knowledge: kb.id }));
    const child = publishedFlow(R, 'integration-child', [inputNode(R), R.newNode('template', { id: 'format', config: { template: 'BEFORE_CHILD {{input.topic}}' }, bindings: {} }), R.newNode('output', { id: 'end', config: { mode: 'data' }, bindings: { text: ref('nodes.format.text') } })], [edge('start', 'format'), edge('format', 'end')]);
    const parent = publishedFlow(R, 'integration-parent', [inputNode(R), R.newNode('subflow', { id: 'child', config: { flowId: child.id, version: '1.0' }, bindings: { topic: ref('input.topic') } }), R.newNode('agent', { id: 'agent', config: { agentId: agent.id, maxRounds: 2 }, bindings: { goal: constant('integrationrecord') } }), R.newNode('output', { id: 'end', config: { mode: 'data' }, bindings: { nested: ref('nodes.child.result'), answer: ref('nodes.agent.text') } })], [edge('start', 'child'), edge('child', 'agent'), edge('agent', 'end')]);
    const { app, credential } = await service(P, 'workflow', parent.id);
    const dataset = Q.createDataset({ name: '嵌套依赖评测' });
    Q.saveRules(dataset.id, [{ type: 'status', name: '运行成功' }], 100);
    Q.saveExample(dataset.id, { input: { topic: 'one' } }); Q.saveExample(dataset.id, { input: { topic: 'two' } });
    const experiment = Q.startExperiment({ datasetId: dataset.id, targetKey: 'workflow|' + parent.id + '|1.0', speed: 0 });
    child.publishedSnapshot.nodes.find(n => n.id === 'format').config.template = 'AFTER_CHILD {{input.topic}}';
    C.addDocument(kb.id, { id: doc.id, name: doc.name, content: 'integrationrecord 的新规则是 AFTER_RECORD。' });
    agent.publishedConfig.knowledge = ''; agent.publishedConfig.prompt = 'AFTER_AGENT';
    const call = await P.invoke(app.id, { credential, user: 'integration-user', inputs: { topic: 'api' }, speed: 0 });
    assert.equal(call.httpStatus, 202); await complete(R, call.run); await Q.waitForExperiment(experiment.id);
    assert.equal(call.run.outcome.returnValue.nested.text, 'BEFORE_CHILD api');
    assert.match(call.run.outcome.returnValue.answer, /BEFORE_RECORD/);
    assert(experiment.results.every(row => row.status === 'passed'));
    experiment.results.forEach((row, index) => { assert.equal(row.actual.nested.text, 'BEFORE_CHILD ' + ['one', 'two'][index]); assert.match(row.actual.answer, /BEFORE_RECORD/); });
    const apiChildren = S.state.runs.filter(run => run.parentRunId === call.run.id);
    assert(apiChildren.length >= 2); assert(apiChildren.every(run => run.traceId === call.run.traceId));
    const bad = publishedFlow(R, 'integration-unpublished-agent', [inputNode(R), R.newNode('agent', { id: 'agent', config: { agentId: 'engineer' }, bindings: { goal: ref('input.topic') } })], [edge('start', 'agent')]);
    assert.throws(() => P.createApp({ kind: 'workflow', id: bad.id, name: '不应发布草稿依赖' }), /已发布/);
    assert.throws(() => Q.startExperiment({ datasetId: dataset.id, targetKey: 'workflow|' + bad.id + '|1.0', speed: 0 }), /已发布/);
    const broken = plain(P.current(app).snapshot); delete broken.nodes.find(n => n.id === 'child').config.resolvedSnapshot;
    const failed = R.runWorkflow(broken, { inputs: { topic: 'api' }, speed: 0, preserveResolvedSnapshots: true });
    await R.waitForRun(failed); assert.equal(failed.status, 'failed'); assert.equal(failed.errorCode, 'DEPENDENCY_SNAPSHOT_MISSING');
  });

  await test('已发布 Agent 不继承草稿专属字段，显式不存在的 Agent 不回退', () => {
    const { S } = fresh(); const agent = S.state.agents[0];
    delete agent.publishedConfig.contextBindings; delete agent.publishedConfig.memoryPolicy;
    agent.contextBindings = [{ kind: 'workflow', id: 'flow-item', version: '1.0' }];
    agent.memoryPolicy = { write: 'session' }; agent.prompt = '草稿改动';
    const runtime = S.agentRuntime(agent);
    assert.equal(runtime.contextBindings, undefined); assert.equal(runtime.memoryPolicy, undefined);
    assert.equal(runtime.prompt, agent.publishedConfig.prompt);
    assert.equal(S.AgentStudio.start({ agentId: 'missing-agent', goal: '不能换成其他 Agent' }), null);
  });

  await test('用户维护的知识正文实际改变 Workflow 与 Agent 结果，历史运行保留原文', async () => {
    const { S, R, C } = fresh();
    const kb = C.saveKnowledge({ name: '用户售后制度' });
    const doc = C.addDocument(kb.id, { name: '售后.txt', content: 'returnpolicy 的退款期限为 17 天。' });
    const flow = publishedFlow(R, 'integration-knowledge', [inputNode(R), R.newNode('knowledge', { id: 'knowledge', config: { knowledge: kb.id, topK: 3, scoreThreshold: 0 }, bindings: { query: ref('input.topic') } }), R.newNode('output', { id: 'end', config: { mode: 'data' }, bindings: { items: ref('nodes.knowledge.items') } })], [edge('start', 'knowledge'), edge('knowledge', 'end')]);
    const before = await complete(R, R.runWorkflow(flow.publishedSnapshot, { inputs: { topic: 'returnpolicy' }, speed: 0 }));
    assert.match(before.outcome.returnValue.items[0].text, /17 天/);
    const agent = publishAgent(S, quietAgent(S, { id: 'integration-knowledge-agent', name: '售后知识 Agent', status: 'published', version: '1.0', knowledge: kb.id }));
    C.addDocument(kb.id, { id: doc.id, name: doc.name, content: 'returnpolicy 的退款期限已改为 31 天。' });
    const after = await complete(R, R.runWorkflow(flow.publishedSnapshot, { inputs: { topic: 'returnpolicy' }, speed: 0 }));
    const answer = await complete(R, S.AgentStudio.start({ agentId: agent.id, goal: 'returnpolicy', mode: 'execute' }));
    assert.match(after.outcome.returnValue.items[0].text, /31 天/); assert.match(answer.answer, /31 天/);
    assert.match(before.outcome.returnValue.items[0].text, /17 天/);
    assert.match(before.workflowSnapshot.nodes.find(n => n.id === 'knowledge').config.knowledgeSnapshot.documents[0].content, /17 天/);
    C.saveKnowledge({ id: kb.id, name: '已改名的售后制度' });
    assert.equal(C.getKnowledge('用户售后制度').id, kb.id);
  });

  await test('外部 API 运行可回流为可编辑评测样例，保留相同 Run 和 Trace 来源', async () => {
    const { R, P, Q } = fresh(); const { app, credential } = await service(P, 'workflow', 'flow-item', '可回流的 API');
    const response = await P.invoke(app.id, { credential, user: 'sample-user', inputs: { topic: '用户提供的真实业务题目' }, speed: 0 });
    await complete(R, response.run);
    const back = Q.fromRun(response.run.id), dataset = Q.createDataset({ name: 'API 运行回流' });
    const example = Q.saveExample(dataset.id, back);
    assert.equal(example.source.runId, response.run.id); assert.equal(example.source.traceId, response.log.traceId);
    assert.equal(example.input.topic, '用户提供的真实业务题目');
    assert.equal(example.reference.summary, response.run.outcome.returnValue.summary);
    Q.saveExample(dataset.id, { ...plain(example), reference: { summary: '人工审定后的参考答案' }, split: '人工复核' }, example.id);
    assert.equal(dataset.examples.length, 1); assert.equal(dataset.examples[0].reference.summary, '人工审定后的参考答案');
    assert.equal(response.run.outcome.returnValue.summary, '资料摘要：用户提供的真实业务题目');
  });

  await test('业务 token/password 字段持久化保真，凭据所有者脱敏且容量失败可恢复', async () => {
    const env = fresh(), { S, R, Q, context } = env;
    const business = { token: '计费单位', password: '需要分析的界面标签', api_key: '业务字段名称', authorization: '客服权限说明', nested: { secret: '参考术语' } };
    const dataset = Q.createDataset({ name: '保留业务字段' }); Q.saveExample(dataset.id, { input: business, reference: business });
    const run = R.createRun({ title: '业务 JSON 保真', inputs: business }); R.completeRun(run, { returnValue: business });
    const sentinels = ['owner-root-key', 'owner-connection-key', 'owner-plugin-key', 'owner-model-key', 'owner-api-key'];
    S.state.token = sentinels[0]; R.connections[0].apiKey = sentinels[1]; R.plugins[0].password = sentinels[2]; S.state.models[0].secret = sentinels[3]; S.state.publishing.keys.push({ id: 'credential-owner-test', credential: sentinels[4] });
    assert.equal(S.save(), true);
    const serialized = env.storage.get('otryx-studio-demo'); sentinels.forEach(secret => assert(!serialized.includes(secret)));
    const saved = JSON.parse(serialized);
    assert.deepEqual(saved.qualityData.datasets.find(d => d.id === dataset.id).examples[0].input, business);
    assert.deepEqual(saved.runs.find(r => r.id === run.id).outcome.returnValue, business);
    const restored = setup(saved);
    assert.deepEqual(plain(restored.S.Quality.getDataset(dataset.id).examples[0].reference), business);
    const set = context.localStorage.setItem;
    context.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
    assert.equal(S.save(), false); assert.equal(S.session.storageUnavailable, true); assert.equal(env.nodes.get('storage-notice').hidden, false);
    context.localStorage.setItem = set;
    assert.equal(S.save(), true); assert.equal(S.session.storageUnavailable, false); assert.equal(env.nodes.get('storage-notice').hidden, true);
  });

  await test('资源市场发布和安装完整工作流图，MCP 模板只生成可管理的连接实例', async () => {
    const env = fresh(), { S, R, C, context } = env;
    reviewForm(env);
    const flow = publishedFlow(R, 'integration-market-flow', [inputNode(R, [{ name: 'token', type: 'string', required: true }, { name: 'password', type: 'string', required: true }]), R.newNode('output', { id: 'end', config: { mode: 'data' }, bindings: { token: ref('input.token'), password: ref('input.password') } })], [edge('start', 'end')], { token: '业务配额单位', password: '界面字段名称' });
    S.actions['eco-publish-confirm']({ dataset: { id: flow.id }, disabled: false });
    const review = S.state.reviews.find(r => r.assetId === flow.id);
    assert(review?.workflowSnapshot); assert.deepEqual(plain(review.workflowSnapshot.inputs), plain(flow.inputs));
    assert.deepEqual(plain(review.workflowSnapshot.nodes), plain(flow.nodes));
    S.state.role = 'admin'; S.actions['eco-review-approve']({ dataset: { id: review.id } });
    S.actions['eco-install']({ dataset: { id: 'community-' + review.id }, disabled: false });
    const installed = R.flows.find(f => f.marketId === 'community-' + review.id);
    assert(installed); assert.notEqual(installed.id, flow.id); assert.equal(installed.publishedSnapshot, undefined);
    const run = await complete(R, R.runWorkflow(installed, { inputs: { token: '请求单位', password: '业务名称' }, speed: 0 }));
    assert.deepEqual(plain(run.outcome.returnValue), { token: '请求单位', password: '业务名称' });
    flow.nodes[1].bindings.token = constant('源已修改'); assert.equal(installed.nodes[1].bindings.token.path, 'input.token');
    const connection = R.connections.find(c => c.kind === 'mcp' && c.transport !== 'stdio');
    connection.endpoint = 'https://user:private-password@mcp.example.invalid/service?token=private-token'; connection.credentialRef = 'secretRef.private';
    S.actions['eco-publish-confirm']({ dataset: { id: connection.id }, disabled: false });
    const connectionReview = S.state.reviews.find(r => r.assetId === connection.id);
    assert(connectionReview); assert.equal(connectionReview.endpoint, 'https://mcp.example.invalid/service');
    assert(!JSON.stringify(connectionReview).includes('private-')); assert(!JSON.stringify(connectionReview).includes('secretRef.private'));
    S.actions['eco-review-approve']({ dataset: { id: connectionReview.id } });
    const marketId = 'community-' + connectionReview.id, count = R.connections.length;
    S.actions['eco-install']({ dataset: { id: marketId }, disabled: false });
    assert.equal(R.connections.length, count, 'Opening a template must not create a connection before save');
    assert.match(env.modal.title, /MCP/);
    context.FormData = class { constructor(node) { this.values = node.values; } get(name) { return this.values[name] ?? ''; } };
    S.forms['cap-connection-form'](form({ connectionId: '', pluginId: '', templateReferenceId: marketId, legacyAssetId: '', connectionName: '从市场配置的连接', endpoint: connectionReview.endpoint, 'cap-transport': 'Streamable HTTP', 'cap-location': '平台 Runner', credentialRef: '', 'cap-auth': 'none', 'cap-template': 'mcp-search' }));
    const created = R.connections.find(c => c.templateId === marketId);
    assert(created); assert.equal(R.connections.length, count + 1);
    assert(C.listContent({ archived: 'all' }).every(item => item.type !== 'mcp')); assert.equal(S.state.ecoAssets.length, 0);
    S.actions['eco-open-installed']({ dataset: { id: marketId } });
    assert.equal(S.route, 'mcp-detail'); assert.equal(S.params.id, created.id);
    S.actions['eco-install']({ dataset: { id: marketId }, disabled: false });
    assert.equal(R.connections.length, count + 1, 'Repeated install opens the existing owned connection');
    S.params = {}; S.route = 'market'; S.actions['eco-market-tab']({ dataset: { id: 'mcp' } });
    const html = S.pages.market.render();
    assert(html.includes('data-action="eco-open-installed" data-id="' + marketId + '"'), 'Market card should show the existing management destination');
  });
  console.log('PASS: ' + passed.length + ' product integration behavior groups');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
