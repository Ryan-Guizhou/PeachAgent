/* Actual local runtime checks; VM markup snapshots do not claim browser layout or focus coverage. */
'use strict';
const assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
const { setup } = require('./expanded-harness.cjs');
const base = path.resolve(__dirname, '..'), plain = value => JSON.parse(JSON.stringify(value));
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const boot = () => {
  const h = setup();
  for (const [api, file] of [['Models', 'models.js'], ['Planning', 'planning.js']]) if (!h.S[api]) vm.runInContext(fs.readFileSync(path.join(base, file), 'utf8'), h.context, { filename: file });
  return h;
};
const expectCode = (fn, code) => assert.throws(fn, error => error.code === code, 'expected ' + code);
async function until(test, label, timeout = 7000) { const start = Date.now(); while (!test()) { if (Date.now() - start > timeout) throw new Error('timeout: ' + label); await wait(10); } }
async function finished(R, run) { await until(() => ['done', 'failed', 'stopped', 'rejected'].includes(run.status), run.title); await R.waitForRun(run); await wait(0); return run; }
function newPlan(h, goal = '研究企业 Agent 的工具调用方式', options = {}) {
  const { S, R } = h, agent = S.state.agents[0];
  const snap = S.AgentStudio.freezeSnapshot({ ...plain(agent), ...(options.snapshot || {}) });
  snap.modelId = S.Models.resolve(snap.model, { type: 'llm' }).id; snap.modelSnapshot = S.Models.snapshot(snap.modelId, { type: 'llm' });
  const source = R.createRun({ title: goal, kind: 'agent', snapshot: snap, model: snap.model });
  source.agentDepth = options.depth || 0; source.agentSnapshot = snap; source.goal = goal;
  S.Planning.prepare(source, { goal, snapshot: snap, sessionSnapshot: options.session || null }); R.completeRun(source, { message: '计划已生成，等待确认' });
  return source;
}
let count = 0; const passed = [], renders = [];
async function check(name, fn) { await fn(); count++; passed.push(name); console.log('PASS ' + name); }
function render(h, route, params = {}, scenario = '') { h.S.go(route, params); const html = h.S.pages[route].render(); renders.push({ route, params, scenario, html }); return html; }
function captureModal(h, scenario) { renders.push({ route: 'dialog', params: {}, scenario, html: h.nodes.get('app-dialog').innerHTML }); }
(async () => {
  const h = boot(), { S, R } = h, P = S.Planning, agentsBefore = S.state.agents.length;
  render(h, 'planning', {}, 'empty');
  const source = newPlan(h), plan = source.plan;
  await check('planning creates unique per-run Agents, an editable DAG, and no execution or permanent Agents', () => {
    assert.equal(plan.schema, 'delegation-v1'); assert.equal(plan.simulation, 'deterministic-local-rules');
    assert.equal(plan.tasks.length, 3); assert.equal(new Set(plan.tasks.map(t => t.agentId)).size, 3);
    assert.ok(plan.tasks.every(task => !S.state.agents.some(agent => agent.id === task.agentId)));
    assert.equal(S.state.agents.length, agentsBefore); assert.equal(source.toolCalls.length, 0);
    assert.equal(S.state.runs.filter(run => run.parentRunId === source.id).length, 0);
    assert.equal(P.stages(plan.tasks)[0].length, 2); assert.equal(P.stages(plan.tasks)[1].length, 1);
    assert.ok(plan.steps.length && plan.snapshot && Object.hasOwn(plan, 'sessionSnapshot'));
    assert.equal(plan.modelPool.length, 1); assert.ok(plan.tasks.every(t => t.modelId === plan.modelPool[0].id));
  });
  await check('users explicitly expand the LLM pool, auto assignment varies models, manual override and snapshots persist', () => {
    const llms = S.Models.list({ type: 'llm', enabled: true });
    P.updatePolicy(source.id, { allowedModelIds: llms.map(m => m.id) });
    assert.ok(new Set(source.plan.tasks.map(t => t.modelId)).size > 1);
    const task = source.plan.tasks[0], selected = llms[1].id;
    P.updateTask(source.id, task.id, { modelMode: 'manual', modelId: selected, temperature: .6 });
    assert.equal(source.plan.tasks[0].modelId, selected); assert.equal(source.plan.tasks[0].temperature, .6);
    const frozen = plain(source.plan.tasks[0].modelSnapshot); P.updatePolicy(source.id, { assignment: 'parent-first' });
    assert.deepEqual(plain(source.plan.tasks[0].modelSnapshot), frozen);
    const embedding = S.Models.list({ type: 'embedding' })[0];
    expectCode(() => P.updatePolicy(source.id, { allowedModelIds: [embedding.id] }), 'MODEL_TYPE_MISMATCH');
    expectCode(() => P.updateTask(source.id, task.id, { modelMode: 'manual', modelId: embedding.id }), 'MODEL_NOT_ALLOWED');
  });
  await check('cycles, tool escalation, unavailable model capabilities, depth and budget excess are blocked', () => {
    const first = source.plan.tasks[0], last = source.plan.tasks.at(-1);
    expectCode(() => P.updateTask(source.id, first.id, { dependsOn: [last.id] }), 'PLAN_CYCLE');
    expectCode(() => P.updateTask(source.id, first.id, { toolIds: ['table.upsert'] }), 'PLAN_TOOL_SCOPE');
    expectCode(() => P.updatePolicy(source.id, { concurrency: source.plan.limits.concurrency + 1 }), 'PLAN_POLICY');
    const tampered = plain(source.plan); tampered.modelPool[0].capabilities.tools = false;
    tampered.tasks[0].modelId = tampered.modelPool[0].id; tampered.tasks[0].modelSnapshot = plain(tampered.modelPool[0]);
    assert.ok(P.validate(tampered).errors.some(error => error.code === 'MODEL_CAPABILITY_MISMATCH'));
    const budget = plain(source.plan); budget.tasks[0].maxTokens = budget.policy.maxTokens;
    assert.ok(P.validate(budget).errors.some(error => error.code === 'PLAN_TOKEN_BUDGET'));
    const deep = newPlan(h, '继续拆分任务', { depth: 1 }); expectCode(() => P.execute(deep.id), 'DELEGATION_DEPTH');
    const none = newPlan(h, '分析已知目标', { snapshot: { executionPolicy: { ...source.plan.snapshot.executionPolicy, toolMode: 'none' } } });
    assert.ok(none.plan.tasks.every(task => task.toolIds.length === 0));
  });
  await check('task CRUD updates dependencies, budgets, and explicit save creates only one reusable draft', () => {
    const task = P.addTask(source.id); assert.equal(source.plan.tasks.length, 4);
    assert.ok(P.validate(source.plan).errors.some(error => error.taskId === task.id && error.code === 'PLAN_TASK_REQUIRED'));
    P.updateTask(source.id, task.id, { name: '复核交付条件', instruction: '核对研究结果是否满足目标。', outputNote: '给出核对结果和仍缺失的信息。', dependsOn: [source.plan.tasks[0].id] });
    P.removeTask(source.id, task.id); assert.equal(source.plan.tasks.length, 3);
    assert.ok(source.plan.tasks.reduce((sum, item) => sum + item.maxTokens, 0) <= source.plan.policy.maxTokens);
    const saved = P.saveDraft(source.id, source.plan.tasks[0].id);
    assert.equal(S.state.agents.length, agentsBefore + 1); assert.equal(saved.status, 'draft'); assert.ok(!saved.ephemeral);
    assert.notEqual(saved.id, source.plan.tasks[0].agentId); assert.ok(!saved.publishedConfig);
  });
  render(h, 'planning', {}, 'populated'); render(h, 'plan', { id: source.id }, 'editable');
  P.editDialog(source.id, source.plan.tasks[0].id); captureModal(h, 'task configuration'); S.closeModal();
  P.policyDialog(source.id); captureModal(h, 'allowed LLMs and execution limits'); S.closeModal();
  P.createDialog(); captureModal(h, 'create plan'); S.closeModal();
  let execution;
  await check('shared Agent runtime executes temporary children in bounded parallelism and uses real dependency outputs', async () => {
    let peak = 0;
    const off = R.subscribe(run => { if (run.parentRunId && R.findRun(run.parentRunId)?.kind === 'plan-execution') peak = Math.max(peak, S.state.runs.filter(child => child.parentRunId === run.parentRunId && !['done', 'failed', 'stopped', 'rejected'].includes(child.status)).length); });
    execution = P.execute(source.id); assert.equal(P.execute(source.id).id, execution.id);
    await finished(R, execution); off(); assert.equal(execution.status, 'done', execution.error);
    const children = S.state.runs.filter(run => run.parentRunId === execution.id); assert.equal(children.length, 3);
    assert.ok(peak <= source.plan.policy.concurrency && peak > 1, 'actual concurrency ' + peak);
    for (const task of execution.delegation.tasks) {
      const child = R.findRun(task.childRunId);
      assert.equal(child.agentSnapshot.id, task.agentId, 'Agent runtime must preserve ephemeral Agent identity');
      assert.equal(child.traceId, source.traceId); assert.equal(child.parentRunId, execution.id);
      assert.equal(child.agentSnapshot.modelId, task.modelId); assert.equal(child.agentDepth, 1);
      assert.ok(child.agentSnapshot.capabilityBindings.every(binding => source.plan.snapshot.capabilityBindings.some(parent => parent.toolId === binding.toolId)));
      for (const input of child.inputs.delegation.predecessors) {
        const upstream = R.findRun(input.runId); assert.equal(upstream.status, 'done');
        assert.deepEqual(plain(input.value), plain(upstream.outcome.returnValue));
        assert.ok(child.created >= upstream.finishedAt); assert.ok(child.goal.includes(String(input.value).slice(0, 100)));
      }
    }
    assert.equal(execution.tokens, 0, 'coordinator must not double count child usage');
    assert.equal(execution.delegationUsage.tokens, children.reduce((n, child) => n + child.tokens, 0));
    assert.deepEqual(plain(execution.outcome.returnValue.tasks.map(t => t.value)), plain(execution.delegation.tasks.map(t => R.findRun(t.childRunId).outcome.returnValue)));
    assert.equal(S.state.agents.length, agentsBefore + 1);
    expectCode(() => P.updateTask(source.id, source.plan.tasks[0].id, { name: '不应改变' }), 'PLAN_FROZEN');
    expectCode(() => P.execute(source.id), 'PLAN_ALREADY_EXECUTED');
  });
  render(h, 'plan', { id: source.id }, 'completed with actual returns');
  assert.ok(P.card(execution).includes('查看完整调用链'));
  await check('Agent Chat planning preserves session grants and execution from plan details stays linked to the conversation', async () => {
    const local = boot(), agent = local.S.state.agents[0], session = local.S.AgentStudio.sessionFor(agent);
    session.toolMode = 'none'; session.capabilityBindings = []; session.contextBindings = [];
    const message = { id: local.S.uid('message'), role: 'assistant', content: '', status: 'running' }; session.messages.push(message);
    const source = local.S.AgentStudio.start({ agentId: agent.id, goal: '分析一次纯文本需求的执行步骤', mode: 'plan', session, message }); message.runId = source.id;
    await finished(local.R, source); assert.equal(source.status, 'done', source.error); assert.ok(local.S.Planning.isPlan(source));
    assert.ok(source.plan.tasks.every(task => task.toolIds.length === 0));
    assert.equal(source.plan.limits.maxTokens, source.agentSnapshot.executionPolicy.maxTokens - source.tokens);
    const execution = local.S.Planning.execute(source.id); assert.equal(execution.conversationId, session.id);
    assert.equal(session.messages.filter(item => item.runId === execution.id).length, 1);
    assert.equal(local.S.Planning.execute(source.id).id, execution.id); assert.equal(session.messages.filter(item => item.runId === execution.id).length, 1);
    await finished(local.R, execution); assert.equal(execution.status, 'done', execution.error);
    assert.equal(session.messages.find(item => item.runId === execution.id).status, 'done');
    render(local, 'plan', { id: source.id }, 'Agent Chat plan with session grants');
  });
  await check('create form navigates through loading and the mounted route refreshes after preparation or an error', async () => {
    const local = boot(), agent = local.S.state.agents[0], values = { 'pl-parent': agent.id, 'pl-goal': '分析一个可以直接执行的目标' };
    const fields = Object.fromEntries(Object.entries(values).map(([id, value]) => [id, { id, value, setAttribute() {}, focus() {} }]));
    local.S.forms['pl-create']({ elements: { namedItem: id => fields[id] }, querySelector() { return null; } });
    assert.equal(local.S.route, 'plan'); const id = local.S.params.id, run = local.R.findRun(id), updates = [];
    assert.ok(local.S.pages.plan.render().includes('正在生成计划'));
    local.S.render = () => updates.push(local.S.pages.plan.render());
    const cleanup = local.S.pages.plan.mount(); await finished(local.R, run); cleanup();
    assert.ok(updates.some(html => html.includes('任务依赖与职责')), 'loading route must recover without another click');
    const broken = local.S.AgentStudio.start({ agentId: agent.id, goal: '生成失败计划', mode: 'plan', snapshot: { ...plain(agent), model: 'missing-llm', modelSnapshot: undefined } });
    local.S.go('plan', { id: broken.id }); const errorUpdates = []; local.S.render = () => errorUpdates.push(local.S.pages.plan.render());
    const errorCleanup = local.S.pages.plan.mount(); await finished(local.R, broken); errorCleanup();
    assert.equal(broken.status, 'failed'); assert.ok(errorUpdates.some(html => html.includes('计划未能生成') && html.includes('重新规划')));
    render(local, 'plan', { id: broken.id }, 'failed preparation with recovery');
  });
  await check('model definitions remain frozen while live model disable blocks execution without fallback', async () => {
    const isolated = boot(), source = newPlan(isolated), task = source.plan.tasks[0], key = task.modelId;
    const original = plain(task.modelSnapshot), current = isolated.S.Models.resolve(key);
    isolated.S.Models.saveModel({ ...current, name: current.name + ' 修改后', config: { ...current.config, temperature: 1.5 } });
    assert.deepEqual(plain(source.plan.tasks[0].modelSnapshot), original);
    isolated.S.Models.setStatus('model', key, 'disable');
    expectCode(() => isolated.S.Planning.execute(source.id), 'MODEL_DISABLED');
    assert.equal(source.plan.executionRunIds.length, 0);
  });
  await check('children receive only authorized frozen tools and are unaffected by same-version live schema edits', async () => {
    const local = boot(), source = newPlan(local), original = plain(local.R.getTool('web.search'));
    const allowed = new Set(source.plan.snapshot.capabilityBindings.filter(binding => binding.enabled !== false).map(binding => binding.toolId));
    assert.ok(source.plan.capabilitySnapshots.tools.every(tool => allowed.has(tool.id)));
    local.R.getTool('web.search').title = '修改后的工具名称';
    local.R.getTool('web.search').inputSchema.required.push('not_in_original_contract');
    const execution = local.S.Planning.execute(source.id); await finished(local.R, execution);
    assert.equal(execution.status, 'done', execution.error);
    const task = execution.delegation.tasks.find(item => item.toolIds.includes('web.search')), child = local.R.findRun(task.childRunId);
    assert.equal(child.capabilitySnapshots.tools.length, task.toolIds.length);
    assert.equal(child.toolCalls[0].toolName, original.title);
    assert.deepEqual(plain(child.capabilitySnapshots.tools[0].inputSchema), original.inputSchema);
  });
  await check('write children wait for real approval; decline stops the parent and prevents downstream work', async () => {
    const local = boot(), source = newPlan(local, '研究工具调用，并保存到 /planning-review', { session: { destination: '/planning-review', scenario: 'success' } }), P = local.S.Planning;
    const execution = P.execute(source.id); await until(() => execution.status === 'waiting' || ['failed', 'done'].includes(execution.status), 'write approval');
    assert.equal(execution.status, 'waiting', execution.error); const writeChild = local.R.findRun(execution.pending.childRunId);
    assert.ok(writeChild.pending); assert.equal(writeChild.outcome.receipts.length, 0);
    render(local, 'plan', { id: source.id }, 'pending write approval');
    assert.equal(local.R.resolveApproval(execution.id, false, { waitId: execution.pending.id }), true);
    await finished(local.R, execution); assert.equal(execution.status, 'rejected');
    assert.equal(writeChild.status, 'rejected'); assert.equal(execution.outcome.receipts.length, 0);
    assert.ok(local.S.state.runs.filter(r => r.parentRunId === execution.id).every(r => ['done', 'stopped', 'rejected', 'failed'].includes(r.status)));
    render(local, 'plan', { id: source.id }, 'rejected');
  });
  await check('approved delivery can finish without a top-level return or file while retaining a real receipt', async () => {
    const local = boot(), source = newPlan(local, '研究工具调用并保存到 /planning-delivery', { session: { destination: '/planning-delivery', scenario: 'success' } }), P = local.S.Planning;
    P.updatePolicy(source.id, { resultMode: 'none' }); const execution = P.execute(source.id);
    await until(() => execution.status === 'waiting' || ['failed', 'done'].includes(execution.status), 'delivery approval');
    assert.equal(execution.status, 'waiting', execution.error);
    assert.equal(local.R.resolveApproval(execution.id, true, { waitId: execution.pending.id }), true);
    await finished(local.R, execution); assert.equal(execution.status, 'done', execution.error);
    assert.equal(Object.hasOwn(execution.outcome, 'returnValue'), false); assert.equal(execution.outcome.artifacts.length, 0);
    assert.equal(execution.outcome.receipts.length, 1); assert.equal(execution.outcome.receipts[0].destination, '/planning-delivery');
    const delivery = local.R.findRun(execution.delegation.tasks.at(-1).childRunId);
    assert.ok(delivery.toolCalls[0].args.content.includes(String(delivery.inputs.delegation.predecessors[0].value).slice(0, 100)));
    render(local, 'plan', { id: source.id }, 'completed without return or file');
  });
  await check('a failed child fails the coordinator and leaves downstream tasks unexecuted', async () => {
    const local = boot(), source = newPlan(local, '检索工具资料并形成结论', { session: { scenario: 'tool_error' } });
    const execution = local.S.Planning.execute(source.id); await finished(local.R, execution);
    assert.equal(execution.status, 'failed'); assert.equal(execution.errorCode, 'PLAN_CHILD_FAILED');
    assert.equal(execution.delegation.tasks.at(-1).status, 'skipped'); assert.ok(!execution.delegation.tasks.at(-1).childRunId);
    assert.ok(!Object.hasOwn(execution.outcome, 'returnValue')); assert.ok(execution.outcome.partialResults);
    render(local, 'plan', { id: source.id }, 'failure');
  });
  await check('stopping a plan or signing out recursively cancels pending approvals and does not launch queued children', async () => {
    const local = boot(), source = newPlan(local, '研究工具并保存到 /planning-stop');
    const execution = local.S.Planning.execute(source.id);
    await until(() => execution.status === 'waiting' || ['failed', 'done'].includes(execution.status), 'stop approval');
    assert.equal(execution.status, 'waiting', execution.error); const childId = execution.pending.childRunId, pendingId = execution.pending.id;
    assert.equal(local.S.Planning.stopAll(), 1); await finished(local.R, execution);
    assert.equal(execution.status, 'stopped'); assert.equal(local.R.findRun(childId).status, 'stopped');
    assert.equal(local.R.resolveApproval(childId, true, { waitId: pendingId }), false); assert.equal(execution.outcome.receipts.length, 0);
    const nextSource = local.S.Planning.duplicate(source.id), next = local.S.Planning.execute(nextSource.id); local.R.stop(next.id); await wait(20);
    assert.equal(local.S.state.runs.filter(run => run.parentRunId === next.id).length, 0);
    assert.ok(next.delegation.tasks.every(task => task.status === 'skipped'));
    render(local, 'plan', { id: source.id }, 'stopped');
  });
  await check('markup has wired actions, accessible field labels, safe escaped content and recoverable empty/error states', () => {
    const dangerous = newPlan(h, '<img src=x onerror=alert(1)> 分析业务目标');
    const html = render(h, 'plan', { id: dangerous.id }, 'escaped user content');
    assert.ok(!html.includes('<img src=x')); assert.ok(html.includes('&lt;img'));
    render(h, 'plan', { id: 'missing' }, 'not found');
    for (const sample of renders) {
      for (const [, action] of sample.html.matchAll(/data-action="([^"]+)"/g)) assert.ok(S.actions[action], sample.scenario + ': unbound action ' + action);
      for (const [, form] of sample.html.matchAll(/data-form="([^"]+)"/g)) assert.ok(S.forms[form], sample.scenario + ': unbound form ' + form);
      for (const [, opening] of sample.html.matchAll(/(<form\b[^>]*>)/g)) assert.ok(opening.includes('novalidate'));
      for (const [, target] of sample.html.matchAll(/<label[^>]+for="([^"]+)"/g)) assert.ok(sample.html.includes('id="' + target + '"'), 'missing label target ' + target);
    }
  });
  fs.mkdirSync(path.join(__dirname, '.generated'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '.generated', 'planning-rendered.json'), JSON.stringify(renders, null, 2));
  console.log('\n' + count + ' planning contracts passed; ' + renders.length + ' actual HTML snapshots saved. Browser verification remains separate.');
})().catch(error => { console.error(error); process.exitCode = 1; });
