(function () {
  'use strict';
  const S = window.Studio, R = S.Runtime, E = S.escape;
  const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const terminal = status => ['done', 'failed', 'rejected', 'stopped'].includes(status);
  const issue = (code, message) => Object.assign(new Error(message), { code });
  const active = new Set();
  const statusNames = { draft: '待确认计划', executing: '执行中', queued: '等待前置', running: '运行中', waiting: '等待确认', done: '已完成', failed: '失败', rejected: '已拒绝', stopped: '已停止', skipped: '未执行' };
  const statusBadge = value => S.badge(statusNames[value] || value, ['done'].includes(value) ? 'success' : ['failed', 'rejected'].includes(value) ? 'danger' : ['waiting'].includes(value) ? 'warning' : ['running', 'executing'].includes(value) ? 'info' : 'neutral');
  const toolFor = (plan, id) => plan.capabilitySnapshots ? plan.capabilitySnapshots.tools.find(tool => tool.id === id) : R.getTool(id);
  const toolTitle = (plan, id) => toolFor(plan, id)?.title || id;
  const modelKey = model => model?.id || model?.name || '';
  const toolRequired = task => (task.toolIds || []).length > 0;
  const modelRequirements = task => ({ type: 'llm', capabilities: toolRequired(task) ? ['tools'] : [] });
  const isPlan = run => run?.plan?.schema === 'delegation-v1';
  const findPlan = id => { const run = R.findRun(id); if (!isPlan(run)) throw issue('PLAN_NOT_FOUND', '这份计划不存在，请从 Agent 对话重新生成。'); return run; };
  const checkEditable = plan => { if (plan.executionRunIds?.length) throw issue('PLAN_FROZEN', '这份计划已经执行，配置已固定。请复制为新计划后修改。'); };
  const date = value => new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  function availableModels() {
    if (S.Models) return S.Models.list({ type: 'llm', enabled: true });
    return (S.state.models || []).filter(m => !m.type || ['llm', 'LLM', 'chat'].includes(m.type)).filter(m => m.enabled !== false && !m.archived).map(m => ({ ...clone(m), id: m.id || m.name, type: 'llm', capabilities: m.capabilities || { tools: true }, config: m.config || {}, legacy: true }));
  }
  function captureModel(id) {
    if (S.Models) return clone(S.Models.snapshot(id, { type: 'llm' }));
    const model = availableModels().find(m => [m.id, m.name, m.modelId].includes(id));
    if (!model) throw issue('MODEL_NOT_FOUND', '这个 LLM 不可用，请先在模型中心配置。');
    return clone(model);
  }
  function checkModel(snapshot, task, live = true) {
    if (!snapshot || snapshot.type !== 'llm') throw issue('MODEL_TYPE_MISMATCH', '子 Agent 只能使用 LLM；向量和重排模型用于对应工作流节点。');
    if (toolRequired(task) && !snapshot.capabilities?.tools) throw issue('MODEL_CAPABILITY_MISMATCH', '使用工具的子 Agent 需要已声明工具调用能力的 LLM。');
    if (live && S.Models) {
      if (S.Models.assertAvailable) S.Models.assertAvailable(snapshot, modelRequirements(task));
      else S.Models.resolve(modelKey(snapshot), modelRequirements(task));
    }
    return snapshot;
  }
  function stages(tasks) {
    const levels = [], remaining = new Set(tasks.map(t => t.id)), placed = new Set();
    if (remaining.size !== tasks.length) throw issue('PLAN_TASK_DUPLICATE', '任务编号重复，请重新生成计划。');
    while (remaining.size) {
      const level = tasks.filter(t => remaining.has(t.id) && (t.dependsOn || []).every(id => placed.has(id)));
      if (!level.length) throw issue('PLAN_CYCLE', '依赖不能形成循环，也不能指向已删除的任务。请调整前置任务。');
      levels.push(level); level.forEach(t => { remaining.delete(t.id); placed.add(t.id); });
    }
    return levels;
  }
  function parentBindings(plan) {
    const policy = plan.snapshot.executionPolicy || {};
    if (policy.toolMode === 'none') return [];
    return (plan.snapshot.capabilityBindings || []).filter(b => b.enabled !== false && (policy.toolMode !== 'required' || b.toolId === policy.forcedToolId));
  }
  function captureCapabilities(snapshots, bindings, contexts) {
    const ids = new Set(bindings.map(binding => binding.toolId)), tools = (snapshots?.tools || []).filter(tool => ids.has(tool.id));
    const connections = new Set([...tools.map(tool => tool.connectionId), ...bindings.map(binding => binding.connectionId), ...(contexts || []).filter(binding => binding.enabled !== false && ['resource', 'prompt', 'skill'].includes(binding.kind)).map(binding => binding.snapshot?.connectionId || binding.connectionId)].filter(Boolean));
    return { tools: clone(tools), connections: clone((snapshots?.connections || []).filter(connection => connections.has(connection.id))) };
  }
  function allocate(plan) {
    const count = Math.max(1, plan.tasks.length), tokenShare = Math.floor(plan.policy.maxTokens / count), costShare = Math.floor(plan.policy.maxCost * 1e6 / count) / 1e6;
    plan.tasks.forEach(task => { task.maxTokens = tokenShare; task.maxCost = costShare; });
  }
  function assignModels(plan) {
    plan.tasks.forEach((task, index) => {
      if (task.modelMode === 'manual') return;
      const candidates = plan.modelPool.filter(m => m.type === 'llm' && (!toolRequired(task) || m.capabilities?.tools));
      const preferred = candidates.find(m => modelKey(m) === (plan.snapshot.modelId || modelKey(plan.snapshot.modelSnapshot)) || m.name === plan.snapshot.model);
      const chosen = plan.policy.assignment === 'parent-first' ? preferred || candidates[0] : candidates[index % Math.max(1, candidates.length)];
      task.modelId = modelKey(chosen); task.modelSnapshot = clone(chosen);
    });
  }
  function childSnapshot(plan, task) {
    const parent = plan.snapshot, p = parent.executionPolicy || {}, granted = new Set(task.toolIds);
    return {
      id: task.agentId, name: task.name, description: task.role, icon: 'agent', color: 'mint', version: 'plan-' + plan.revision, status: 'draft', tags: ['临时子 Agent'],
      model: task.modelSnapshot?.name || '', modelId: task.modelId, modelSnapshot: clone(task.modelSnapshot), temperature: task.temperature,
      prompt: task.instruction + '\n输入约定：' + task.inputNote + '\n完成条件：' + task.outputNote + '\n只处理当前职责；不得继续创建子 Agent。',
      knowledge: parent.knowledge || '', knowledgeSnapshot: clone(parent.knowledgeSnapshot),
      contextBindings: clone((parent.contextBindings || []).filter(b => b.enabled !== false && ['resource', 'prompt', 'skill'].includes(b.kind))),
      capabilityBindings: parentBindings(plan).filter(b => granted.has(b.toolId)).map(b => ({ ...clone(b), approval: toolFor(plan, b.toolId)?.write ? 'write' : b.approval })),
      tools: [], requireApproval: true, memoryPolicy: { read: false, write: 'never' },
      executionPolicy: { ...p, toolMode: task.toolIds.length ? 'auto' : 'none', forcedToolId: '', maxRounds: Math.min(p.maxRounds || 8, Math.max(1, task.toolIds.length + 1)), maxTokens: task.maxTokens, maxCost: task.maxCost, timeoutMs: Math.min(p.timeoutMs || 60000, plan.policy.timeoutMs), toolConcurrency: 1, requireApproval: true, memoryWrite: 'never' },
      delegationPolicy: { enabled: false, maxAgents: 0, maxDepth: 0 }, ephemeral: true, planId: plan.id, taskId: task.id
    };
  }
  function syncDerived(plan) {
    plan.agents = plan.tasks.map(task => childSnapshot(plan, task));
    plan.steps = plan.tasks.map((task, index) => ({ step: index + 1, taskId: task.id, title: task.name, toolId: task.toolIds[0] || '', requiresApproval: task.toolIds.some(id => toolFor(plan, id)?.write), dependsOn: clone(task.dependsOn) }));
  }
  function validate(plan, options = {}) {
    const errors = [], add = (code, message, taskId) => errors.push({ code, message, ...(taskId ? { taskId } : {}) });
    if (!plan?.tasks?.length) return { valid: false, errors: [{ code: 'PLAN_EMPTY', message: '至少保留一个子任务。' }] };
    const p = plan.policy, limits = plan.limits;
    for (const key of ['maxAgents', 'concurrency', 'maxTokens', 'timeoutMs']) {
      if (!Number.isInteger(p[key]) || p[key] < (key === 'timeoutMs' ? 1000 : 1) || p[key] > limits[key]) add('PLAN_POLICY', '执行边界超出父 Agent 允许范围：' + key);
    }
    if (!Number.isFinite(p.maxCost) || p.maxCost <= 0 || p.maxCost > limits.maxCost + 1e-8) add('PLAN_POLICY', '总费用预算需要大于 0，且不能超过父 Agent 剩余额度。');
    if (p.maxDepth !== 1 || plan.depth + 1 > p.maxDepth) add('DELEGATION_DEPTH', '当前委派深度已达到上限；子 Agent 不能再次拆分任务。');
    if (plan.snapshot.delegationPolicy?.enabled === false || plan.snapshot.delegationPolicy?.maxDepth === 0 || plan.snapshot.delegationPolicy?.maxAgents === 0) add('DELEGATION_DISABLED', '父 Agent 未允许创建子 Agent。请选择已允许委派的父 Agent。');
    if (plan.tasks.length > p.maxAgents) add('PLAN_AGENT_LIMIT', '临时子 Agent 数量超过本次上限。');
    if (!['balanced', 'parent-first'].includes(p.assignment)) add('PLAN_ASSIGNMENT', '请选择一种已支持的模型分配方式。');
    if (!['summary', 'none'].includes(plan.resultMode)) add('PLAN_RESULT_MODE', '请选择汇总返回或仅保留完成状态。');
    if (plan.requirements?.missingWrite) add('PLAN_WRITE_MISSING', '目标包含写入，但父 Agent 没有授权匹配的写入工具。请回到对话调整工具后重新规划。');
    const allow = new Set(parentBindings(plan).map(b => b.toolId)), pool = new Map(plan.modelPool.map(m => [modelKey(m), m]));
    if (!pool.size) add('MODEL_POOL_EMPTY', '请至少允许一个可用的 LLM。');
    plan.tasks.forEach(task => {
      if (!task.name?.trim() || !task.instruction?.trim() || !task.outputNote?.trim()) add('PLAN_TASK_REQUIRED', '请填写子 Agent 名称、职责指引与完成条件。', task.id);
      if (!Number.isFinite(task.temperature) || task.temperature < 0 || task.temperature > 2) add('PLAN_TEMPERATURE', 'Temperature 需要在 0–2 之间。', task.id);
      if (!Number.isInteger(task.maxTokens) || task.maxTokens < 100 || task.maxTokens > p.maxTokens || !Number.isFinite(task.maxCost) || task.maxCost <= 0 || task.maxCost > p.maxCost) add('PLAN_TASK_BUDGET', '子任务预算需为有效正数，并在本次总预算内。', task.id);
      if (!Array.isArray(task.toolIds) || task.toolIds.some(id => !allow.has(id))) add('PLAN_TOOL_SCOPE', '子 Agent 不能使用父 Agent 未授权的工具。', task.id);
      else if (task.toolIds.some(id => !toolFor(plan, id))) add('PLAN_TOOL_UNAVAILABLE', '工具定义快照缺失，请返回会话重新授权并生成计划。', task.id);
      const frozen = pool.get(task.modelId);
      if (!frozen || !task.modelSnapshot || modelKey(task.modelSnapshot) !== task.modelId) add('MODEL_NOT_ALLOWED', '请选择本次允许模型池中的模型。', task.id);
      else if (JSON.stringify(task.modelSnapshot) !== JSON.stringify(frozen)) add('MODEL_SNAPSHOT_MISMATCH', '模型快照与本次模型池不一致，请重新选择模型。', task.id);
      else { try { checkModel(frozen, task, options.live !== false); } catch (error) { add(error.code, error.message, task.id); } }
    });
    if (plan.tasks.reduce((sum, task) => sum + task.maxTokens, 0) > p.maxTokens) add('PLAN_TOKEN_BUDGET', '各子 Agent 的 Token 配额合计超过本次总预算。请重新分配。');
    if (plan.tasks.reduce((sum, task) => sum + task.maxCost, 0) > p.maxCost + 1e-8) add('PLAN_COST_BUDGET', '各子 Agent 的费用配额合计超过本次总预算。请重新分配。');
    try { stages(plan.tasks); } catch (error) { add(error.code, error.message); }
    return { valid: errors.length === 0, errors };
  }
  function prepare(run, options = {}) {
    const snapshot = clone(options.snapshot || run.agentSnapshot || run.snapshot), goal = String(options.goal || run.goal || '').trim();
    if (!snapshot || !goal) throw issue('PLAN_INPUT', '需要明确目标和父 Agent 配置。');
    const ep = snapshot.executionPolicy || {}, dp = snapshot.delegationPolicy || {}, maxAgents = Math.max(1, Math.min(8, dp.maxAgents || 6));
    const limits = { maxAgents, concurrency: Math.max(1, Math.min(4, dp.concurrency || ep.toolConcurrency || 2)), maxTokens: Math.max(0, Math.floor((ep.maxTokens || 12000) - (run.tokens || 0))), maxCost: Math.max(0, Number(((ep.maxCost || 2) - (run.cost || 0)).toFixed(6))), maxDepth: 1, timeoutMs: ep.timeoutMs || 60000 };
    const plan = { schema: 'delegation-v1', id: S.uid('plan'), sourceRunId: run.id, goal, createdAt: Date.now(), revision: 1, status: 'draft', simulation: 'deterministic-local-rules', snapshot, sessionSnapshot: clone(options.sessionSnapshot || null), depth: run.agentDepth || 0, limits, policy: { ...limits, assignment: 'balanced' }, modelPool: [], tasks: [], agents: [], steps: [], executionRunIds: [], resultMode: 'summary' };
    plan.capabilitySnapshots = captureCapabilities(run.capabilitySnapshots, parentBindings(plan), snapshot.contextBindings);
    const allowedIds = dp.allowedModelIds?.length ? dp.allowedModelIds : [snapshot.modelId || snapshot.modelSnapshot?.id || snapshot.model];
    const seenModels = new Set();
    allowedIds.filter(Boolean).forEach(id => { try { const m = snapshot.modelSnapshot && [modelKey(snapshot.modelSnapshot), snapshot.modelSnapshot.name].includes(id) ? clone(snapshot.modelSnapshot) : captureModel(id); if (!seenModels.has(modelKey(m))) { seenModels.add(modelKey(m)); plan.modelPool.push(m); } } catch (_) { /* Unavailable models produce a visible validation error, never a fallback. */ } });
    const bindings = parentBindings(plan), reads = bindings.filter(b => toolFor(plan, b.toolId) && !toolFor(plan, b.toolId).write), writes = bindings.filter(b => toolFor(plan, b.toolId)?.write);
    const writeRequested = /写入|保存到|同步到|归档|上传|更新|创建文档|create|upsert|write/i.test(goal);
    const selected = S.AgentStudio?.planTools ? S.AgentStudio.planTools(snapshot, goal, plan.sessionSnapshot) : bindings;
    const requestedWrite = selected.find(b => writes.some(w => w.toolId === b.toolId));
    const deliveryTool = requestedWrite || writes[0];
    plan.requirements = { writeRequested, missingWrite: writeRequested && !deliveryTool };
    const makeTask = (name, role, instruction, outputNote, tools = [], dependsOn = []) => ({ id: S.uid('plan-task'), agentId: S.uid('temporary-agent'), name, role, instruction, inputNote: dependsOn.length ? '原始目标与前置任务的真实结果；完整输入保留在子运行中。' : '用户目标与父 Agent 已授权的上下文。', outputNote, dependsOn, toolIds: tools, modelId: '', modelMode: 'auto', temperature: .3, maxTokens: 100, maxCost: .01 });
    if (maxAgents === 1) {
      plan.tasks.push(makeTask('目标执行员', '完成本次目标并核对结果', '围绕用户目标获取依据、完成已授权动作，汇总实际结果。', '说明已完成的动作、依据与仍缺少的信息。', [...reads.slice(0, 1).map(b => b.toolId), ...(writeRequested && deliveryTool ? [deliveryTool.toolId] : [])]));
    } else {
      const gather = makeTask(reads.length ? '资料研究员' : '目标分析员', reads.length ? '检索目标所需的依据' : '梳理目标、约束与已知信息', reads.length ? '检索与用户目标直接相关的资料，保留可核对的来源。' : '梳理用户目标与已提供信息，明确缺口，不虚构外部资料。', '给出有来源的要点，标出未知项。', reads.slice(0, 1).map(b => b.toolId));
      plan.tasks.push(gather);
      let dependencies = [gather.id];
      if (maxAgents >= (writeRequested && deliveryTool ? 4 : 3)) {
        const review = makeTask('约束核对员', '独立核对完成条件与风险', '从用户目标提取交付条件、约束和需要人工判断的事项。可使用已授权知识，说明依据不足之处。', '列出验收条件与待核实项。');
        plan.tasks.push(review); dependencies.push(review.id);
      }
      if (!(writeRequested && deliveryTool && maxAgents === 2)) {
        const synthesize = makeTask('结果整合员', '汇合前置结果形成交付内容', '读取前置任务结果，按用户目标整理结论；保留来源和不确定项。', '输出可继续使用的结论，说明前置结果如何被采用。', [], dependencies);
        plan.tasks.push(synthesize); dependencies = [synthesize.id];
      }
      if (writeRequested && deliveryTool) plan.tasks.push(makeTask('交付执行员', '将前置结果放到指定位置', '读取前置结果，按用户指定位置写入或保存；等待本次写入审批后才继续。', '保留目标位置与实际操作回执；无需额外生成文件。', [deliveryTool.toolId], dependencies));
    }
    allocate(plan); assignModels(plan); syncDerived(plan); run.plan = plan;
    R.event(run, 'plan.created', { planId: plan.id, temporaryAgents: plan.tasks.map(t => ({ id: t.agentId, role: t.role, modelId: t.modelId })), simulation: plan.simulation });
    return plan;
  }
  function commitEdit(run, next) { next.revision++; syncDerived(next); run.plan = next; S.save(); return next; }
  function updateTask(runId, taskId, values) {
    const run = findPlan(runId); checkEditable(run.plan); const next = clone(run.plan), task = next.tasks.find(t => t.id === taskId);
    if (!task) throw issue('PLAN_TASK_NOT_FOUND', '子任务已不存在。');
    const keys = ['name', 'role', 'instruction', 'inputNote', 'outputNote', 'dependsOn', 'toolIds', 'temperature', 'maxTokens', 'maxCost', 'modelMode'];
    keys.forEach(key => { if (Object.hasOwn(values, key)) task[key] = clone(values[key]); });
    task.dependsOn = Array.from(new Set(task.dependsOn)); task.toolIds = Array.from(new Set(task.toolIds));
    if (Object.hasOwn(values, 'modelId')) { task.modelId = values.modelId; task.modelSnapshot = clone(next.modelPool.find(m => modelKey(m) === values.modelId)); }
    if (task.modelMode === 'auto') assignModels(next);
    stages(next.tasks);
    const ownErrors = validate(next, { live: false }).errors.filter(error => error.taskId === taskId);
    if (ownErrors.length) throw issue(ownErrors[0].code, ownErrors[0].message);
    return commitEdit(run, next);
  }
  function addTask(runId) {
    const run = findPlan(runId); checkEditable(run.plan); const next = clone(run.plan);
    if (next.tasks.length >= next.policy.maxAgents) throw issue('PLAN_AGENT_LIMIT', '已达到本次子 Agent 数量上限。请先调整执行边界。');
    const task = { id: S.uid('plan-task'), agentId: S.uid('temporary-agent'), name: '新增子任务', role: '补充一项独立职责', instruction: '', inputNote: '用户目标与选定前置任务的结果。', outputNote: '', dependsOn: [], toolIds: [], modelId: '', modelMode: 'auto', temperature: .3, maxTokens: 100, maxCost: .001 };
    next.tasks.push(task); allocate(next); assignModels(next); commitEdit(run, next); return task;
  }
  function removeTask(runId, taskId) {
    const run = findPlan(runId); checkEditable(run.plan);
    if (run.plan.tasks.length <= 1) throw issue('PLAN_EMPTY', '至少保留一个子任务。');
    const next = clone(run.plan); if (!next.tasks.some(t => t.id === taskId)) throw issue('PLAN_TASK_NOT_FOUND', '子任务不存在。');
    next.tasks = next.tasks.filter(t => t.id !== taskId); next.tasks.forEach(t => { t.dependsOn = t.dependsOn.filter(id => id !== taskId); });
    allocate(next); assignModels(next); return commitEdit(run, next);
  }
  function updatePolicy(runId, values) {
    const run = findPlan(runId); checkEditable(run.plan); const next = clone(run.plan);
    ['maxAgents', 'concurrency', 'maxTokens', 'maxCost', 'timeoutMs', 'assignment'].forEach(key => { if (Object.hasOwn(values, key)) next.policy[key] = values[key]; });
    if (Object.hasOwn(values, 'resultMode')) next.resultMode = values.resultMode;
    if (Object.hasOwn(values, 'allowedModelIds')) {
      const previous = new Map(next.modelPool.map(m => [modelKey(m), m]));
      next.modelPool = Array.from(new Set(values.allowedModelIds)).map(id => previous.has(id) ? previous.get(id) : captureModel(id));
    }
    assignModels(next); allocate(next);
    const structural = validate(next, { live: false }).errors.filter(e => ['PLAN_POLICY', 'PLAN_AGENT_LIMIT', 'PLAN_ASSIGNMENT', 'PLAN_RESULT_MODE', 'DELEGATION_DEPTH'].includes(e.code));
    if (structural.length) throw issue(structural[0].code, structural[0].message);
    return commitEdit(run, next);
  }
  function redistribute(runId) {
    const run = findPlan(runId); checkEditable(run.plan); const next = clone(run.plan); allocate(next); return commitEdit(run, next);
  }
  function saveDraft(runId, taskId) {
    const plan = findPlan(runId).plan, task = plan.tasks.find(t => t.id === taskId);
    if (!task) throw issue('PLAN_TASK_NOT_FOUND', '子任务不存在。');
    const invalid = validate(plan).errors.find(error => error.taskId === taskId);
    if (invalid) throw issue(invalid.code, invalid.message);
    checkModel(task.modelSnapshot, task);
    const saved = childSnapshot(plan, task); saved.id = S.uid('agent'); saved.name = task.name + ' · 草稿'; saved.version = '0.1.0'; saved.status = 'draft'; saved.updated = '刚刚'; saved.runs = 0; saved.history = []; saved.tags = ['由计划保存'];
    delete saved.ephemeral; delete saved.planId; delete saved.taskId;
    S.state.agents.unshift(saved); S.save(); return saved;
  }
  function duplicate(runId) {
    const previous = findPlan(runId), plan = clone(previous.plan), ids = new Map(plan.tasks.map(t => [t.id, S.uid('plan-task')]));
    const run = R.createRun({ title: '新计划 · ' + previous.plan.goal.slice(0, 32), kind: 'agent', source: '任务规划', inputs: { message: plan.goal, mode: 'plan' }, snapshot: plan.snapshot, model: plan.snapshot.model });
    plan.id = S.uid('plan'); plan.sourceRunId = run.id; plan.createdAt = Date.now(); plan.status = 'draft'; plan.revision = 1; plan.executionRunIds = [];
    plan.tasks.forEach(task => { task.dependsOn = task.dependsOn.map(id => ids.get(id)); task.id = ids.get(task.id); task.agentId = S.uid('temporary-agent'); });
    syncDerived(plan); run.plan = plan; run.goal = plan.goal; run.agentSnapshot = clone(plan.snapshot);
    R.completeRun(run, { message: '已复制配置与模型快照，等待确认新计划。' }); return run;
  }
  function allChildRuns(coordinator) { return S.state.runs.filter(run => run.parentRunId === coordinator.id); }
  function collect(coordinator) {
    const children = allChildRuns(coordinator);
    const descendants = [], visit = parentId => S.state.runs.filter(run => run.parentRunId === parentId).forEach(run => { descendants.push(run); visit(run.id); });
    visit(coordinator.id);
    coordinator.delegationUsage = { tokens: descendants.reduce((sum, child) => sum + (child.tokens || 0), 0), cost: Number(descendants.reduce((sum, child) => sum + (child.cost || 0), 0).toFixed(6)), estimated: true };
    coordinator.outcome.receipts = children.flatMap(child => clone(child.outcome?.receipts || []));
    coordinator.outcome.artifacts = children.flatMap(child => clone(child.outcome?.artifacts || [])); coordinator.artifacts = coordinator.outcome.artifacts;
    return coordinator.delegation.tasks.filter(task => task.childRunId).map(task => {
      const child = R.findRun(task.childRunId), result = { taskId: task.id, name: task.name, agentId: task.agentId, childRunId: child.id, status: child.status, receipts: clone(child.outcome.receipts || []), artifacts: clone(child.outcome.artifacts || []), message: child.outcome.message || child.error || '' };
      if (Object.hasOwn(child.outcome, 'returnValue')) result.value = clone(child.outcome.returnValue);
      return result;
    });
  }
  function executionInput(coordinator, task) {
    const predecessors = task.dependsOn.map(id => {
      const upstream = coordinator.delegation.tasks.find(t => t.id === id), child = R.findRun(upstream.childRunId);
      if (!child || child.status !== 'done') throw issue('PLAN_DEPENDENCY', '前置任务尚未成功完成。');
      const input = { taskId: id, name: upstream.name, runId: child.id, receipts: clone(child.outcome.receipts), message: child.outcome.message || '' };
      if (Object.hasOwn(child.outcome, 'returnValue')) input.value = clone(child.outcome.returnValue);
      return input;
    });
    return { goal: coordinator.delegation.goal, responsibility: task.instruction, predecessors };
  }
  function childGoal(input) {
    const excerpt = input.predecessors.map(item => {
      const raw = Object.hasOwn(item, 'value') ? typeof item.value === 'string' ? item.value : JSON.stringify(item.value) : item.message;
      return item.name + '：' + String(raw || '已完成，没有返回值').slice(0, 420) + (String(raw || '').length > 420 ? '…（完整输入见本次运行）' : '') + (item.receipts.length ? '\n操作回执：' + JSON.stringify(item.receipts).slice(0, 280) : '');
    }).join('\n');
    return input.responsibility + '\n用户目标：' + input.goal + (excerpt ? '\n已完成任务的实际结果摘要：\n' + excerpt : '');
  }
  function mirrorWaiting(coordinator) {
    if (terminal(coordinator.status)) return;
    const waiting = allChildRuns(coordinator).filter(run => run.status === 'waiting' && run.pending);
    const before = coordinator.pending?.id, previousStatus = coordinator.status;
    coordinator.pending = waiting.length ? { ...clone(waiting[0].pending), childRunId: waiting[0].id } : null;
    coordinator.delegation.waitingRunIds = waiting.map(run => run.id); coordinator.status = waiting.length ? 'waiting' : 'running';
    if (before !== coordinator.pending?.id || previousStatus !== coordinator.status) R.event(coordinator, waiting.length ? 'plan.waiting' : 'plan.resumed', { childRunIds: waiting.map(run => run.id), waitId: coordinator.pending?.id });
  }
  function stopRemaining(coordinator, reason) {
    allChildRuns(coordinator).filter(run => !terminal(run.status)).forEach(run => R.stop(run.id));
    coordinator.delegation.tasks.forEach(task => { const child = task.childRunId && R.findRun(task.childRunId); if (child) task.status = child.status; else if (task.status === 'queued') { task.status = 'skipped'; task.reason = reason; } });
    coordinator.outcome.partialResults = collect(coordinator); S.save();
  }
  async function runCoordinator(coordinator, source) {
    const plan = coordinator.snapshot, tasks = coordinator.delegation.tasks, pending = new Map();
    let unsubscribe, timer, lastClock = Date.now(), activeMs = 0, ending = false;
    const finishEarly = (code, message) => {
      if (ending || terminal(coordinator.status)) return;
      ending = true; R.failRun(coordinator, issue(code, message)); stopRemaining(coordinator, message);
    };
    unsubscribe = R.subscribe(changed => {
      if (changed.id === coordinator.id && terminal(changed.status)) {
        if (changed.status !== 'done') stopRemaining(coordinator, changed.error || '父任务已停止');
        return;
      }
      if (changed.parentRunId !== coordinator.id || terminal(coordinator.status)) return;
      const task = tasks.find(t => t.childRunId === changed.id); if (task) task.status = changed.status;
      collect(coordinator);
      if (changed.status === 'rejected') finishEarly('REJECTED', '子任务的操作已被拒绝，后续任务和其他未完成子任务已停止。');
      else if (changed.status === 'failed') finishEarly('PLAN_CHILD_FAILED', '子任务未完成：' + (changed.error || changed.title));
      else if (changed.status === 'stopped') finishEarly('CANCELLED', '子任务已停止，整个计划停止继续执行。');
      else if (coordinator.delegationUsage.tokens > plan.policy.maxTokens || coordinator.delegationUsage.cost > plan.policy.maxCost + 1e-8) finishEarly('PLAN_BUDGET', '达到本次总预算，已停止后续任务。');
      else mirrorWaiting(coordinator);
    });
    timer = setInterval(() => { const now = Date.now(); if (coordinator.status === 'running') activeMs += now - lastClock; lastClock = now; if (activeMs > plan.policy.timeoutMs) finishEarly('CANCELLED', '达到本次执行时限，后续任务已停止。'); }, 250);
    const launch = task => {
      checkModel(task.modelSnapshot, task);
      const input = executionInput(coordinator, task), snapshot = childSnapshot(plan, task);
      const childSession = plan.sessionSnapshot ? { ...clone(plan.sessionSnapshot), id: undefined, contextCall: null, argsText: '', toolMode: snapshot.executionPolicy.toolMode, forcedToolId: '', capabilityBindings: clone(snapshot.capabilityBindings), contextBindings: clone(snapshot.contextBindings), model: snapshot.model } : null;
      const capabilities = captureCapabilities(plan.capabilitySnapshots, snapshot.capabilityBindings, snapshot.contextBindings);
      const child = S.AgentStudio.start({ ephemeralAgent: clone(snapshot), snapshot, capabilitySnapshots: capabilities, goal: childGoal(input), mode: 'execute', parentRunId: coordinator.id, depth: plan.depth + 1, preserveResolvedSnapshots: true, sessionSnapshot: childSession });
      if (!child) throw issue('PLAN_CHILD_START', '无法启动临时子 Agent，请重新检查配置。');
      child.inputs.delegation = clone(input); child.planTaskId = task.id; child.temporaryAgentId = task.agentId; task.childRunId = child.id; task.status = child.status;
      R.event(coordinator, 'plan.task.started', { taskId: task.id, childRunId: child.id, temporaryAgentId: task.agentId, modelId: task.modelId, dependsOn: task.dependsOn, inputRunIds: input.predecessors.map(item => item.runId) });
      const waiting = R.waitForRun(child).then(() => {
        task.status = child.status; collect(coordinator);
        R.event(coordinator, 'plan.task.ended', { taskId: task.id, childRunId: child.id, status: child.status, hasReturnValue: Object.hasOwn(child.outcome, 'returnValue') });
      }).finally(() => pending.delete(task.id));
      pending.set(task.id, waiting);
    };
    try {
      while (!terminal(coordinator.status)) {
        const ready = tasks.filter(task => task.status === 'queued' && task.dependsOn.every(id => tasks.find(t => t.id === id)?.status === 'done'));
        for (const task of ready) { if (pending.size >= plan.policy.concurrency || terminal(coordinator.status)) break; launch(task); }
        if (terminal(coordinator.status)) break;
        if (!pending.size) {
          if (tasks.every(task => task.status === 'done')) break;
          throw issue('PLAN_BLOCKED', '存在无法满足的任务依赖，已停止本次计划。');
        }
        await Promise.race(pending.values());
      }
      if (terminal(coordinator.status)) return;
      const results = collect(coordinator), value = { goal: plan.goal, tasks: results, receipts: clone(coordinator.outcome.receipts) };
      coordinator.answer = '已完成 ' + results.length + ' 个子任务。' + (coordinator.outcome.receipts.length ? '指定位置的操作回执已保留。' : '') + (plan.resultMode === 'none' ? '本次未设置汇总返回值。' : '\n\n' + results.map(result => result.name + '\n' + (Object.hasOwn(result, 'value') ? typeof result.value === 'string' ? result.value : JSON.stringify(result.value, null, 2) : result.message || '已完成，无返回值')).join('\n\n'));
      R.completeRun(coordinator, { ...(plan.resultMode === 'summary' ? { returnValue: value } : {}), message: '所有子任务已完成；' + (plan.resultMode === 'none' ? '未设置返回值，操作回执与子运行保留。' : '已根据子任务实际结果汇总。') });
    } catch (error) {
      if (!terminal(coordinator.status)) R.failRun(coordinator, issue(error.code || 'PLAN_EXECUTION', error.message));
      stopRemaining(coordinator, error.message);
    } finally {
      clearInterval(timer); unsubscribe(); active.delete(coordinator.id); source.plan.status = coordinator.status; collect(coordinator);
      const message = S.state.chatSessions?.find(session => session.id === coordinator.conversationId)?.messages.find(item => item.runId === coordinator.id);
      if (message) { message.status = coordinator.status; message.content = coordinator.answer || coordinator.error || coordinator.outcome.message || ''; }
      S.save();
    }
  }
  function execute(runId) {
    const source = findPlan(runId), original = source.plan;
    const previous = (original.executionRunIds || []).map(id => R.findRun(id)).find(run => run && !terminal(run.status));
    if (previous) return previous;
    if (original.executionRunIds?.length) throw issue('PLAN_ALREADY_EXECUTED', '这份计划已经执行。需要重试时请复制为新计划，避免重复写入。');
    if (source.status !== 'done') throw issue('PLAN_NOT_READY', '计划尚未生成完成。');
    const session = S.state.chatSessions?.find(item => item.id === source.conversationId);
    if (session?.messages.some(message => { const run = message.runId && R.findRun(message.runId); return run && !terminal(run.status); })) throw issue('PLAN_CHAT_BUSY', '这段会话还有正在运行的任务，请等待完成或停止后再执行计划。');
    const result = validate(original); if (!result.valid) throw issue(result.errors[0].code, result.errors[0].message);
    syncDerived(original); const plan = clone(original);
    const coordinator = R.createRun({ title: plan.goal.slice(0, 42), kind: 'plan-execution', source: '自主任务规划', parentRunId: source.id, inputs: { goal: plan.goal }, snapshot: plan, version: '计划 r' + plan.revision });
    coordinator.capabilitySnapshots = clone(plan.capabilitySnapshots);
    coordinator.planSourceRunId = source.id; coordinator.delegation = { schema: plan.schema, goal: plan.goal, sourceRunId: source.id, policy: clone(plan.policy), revision: plan.revision, tasks: plan.tasks.map(task => ({ ...clone(task), status: 'queued' })), waitingRunIds: [], simulation: plan.simulation };
    coordinator.delegationUsage = { tokens: 0, cost: 0, estimated: true }; original.executionRunIds.push(coordinator.id); original.status = 'executing'; active.add(coordinator.id);
    if (session) {
      coordinator.conversationId = session.id;
      const message = { id: S.uid('message'), role: 'assistant', runId: coordinator.id, content: '', status: coordinator.status };
      session.messages.push(message); coordinator.messageId = message.id;
    }
    R.event(coordinator, 'plan.execution.confirmed', { sourceRunId: source.id, taskCount: plan.tasks.length, policy: clone(plan.policy), modelPool: plan.modelPool.map(modelKey) });
    queueMicrotask(() => { if (!terminal(coordinator.status)) runCoordinator(coordinator, source); else { stopRemaining(coordinator, '已停止'); original.status = coordinator.status; active.delete(coordinator.id); S.save(); } });
    return coordinator;
  }
  function stopAll() { const running = S.state.runs.filter(run => run.kind === 'plan-execution' && !terminal(run.status)); running.forEach(run => R.stop(run.id)); return running.length; }
  function card(run) {
    const source = isPlan(run) ? run : run?.planSourceRunId ? R.findRun(run.planSourceRunId) : null;
    if (!isPlan(source)) return '';
    const plan = source.plan, coordinator = run.delegation ? run : R.findRun(plan.executionRunIds?.at(-1)), total = plan.tasks.length, done = coordinator?.delegation?.tasks.filter(task => task.status === 'done').length || 0;
    const names = [...new Set(plan.tasks.map(t => t.modelSnapshot?.name).filter(Boolean))];
    return `<section class="pl-chat-card" aria-label="自主任务计划"><div class="between"><div class="row">${S.icon('workflow',18)}<strong>自主任务计划</strong></div>${statusBadge(coordinator?.status || 'draft')}</div><p>${E(total)} 个临时子 Agent · ${E(names.join(' / ') || '待选择模型')}${coordinator ? ' · 已完成 ' + done + '/' + total : ''}</p><p class="small muted">${coordinator ? '依赖结果、人工确认与子调用均可追踪。' : '本地规则生成。确认职责、模型和预算后再执行。'}</p><div class="row"><a class="btn btn-secondary btn-sm" href="#plan?id=${encodeURIComponent(source.id)}">${coordinator ? '查看计划与进度' : '审阅与编辑计划'}</a>${coordinator ? `<a class="text-link small" href="#task?id=${encodeURIComponent(coordinator.id)}&tab=trace">查看完整调用链</a>` : ''}</div></section>`;
  }
  const selectField = (label, name, options, value, help = '') => `<div class="field"><label class="field-label" for="${E(name)}">${E(label)}</label><select class="select" id="${E(name)}" name="${E(name)}">${options.map(([id, title]) => `<option value="${E(id)}" ${id === value ? 'selected' : ''}>${E(title)}</option>`).join('')}</select>${help ? `<p class="field-help">${E(help)}</p>` : ''}<p class="field-error" id="${E(name)}-error"></p></div>`;
  const textareaField = (label, name, value, rows = 3) => `<div class="field"><label class="field-label" for="${E(name)}">${E(label)}</label><textarea class="textarea" style="resize:none" id="${E(name)}" name="${E(name)}" rows="${rows}">${E(value)}</textarea><p class="field-error" id="${E(name)}-error"></p></div>`;
  function editDialog(runId, taskId) {
    const run = findPlan(runId), plan = run.plan; checkEditable(plan); const task = plan.tasks.find(t => t.id === taskId);
    const modelOptions = [['auto', '自动分配 · 在允许池内匹配能力'], ...plan.modelPool.map(m => [modelKey(m), m.name + (m.capabilities?.tools ? ' · 支持工具' : ' · 仅对话')])];
    S.modal({ title: '配置临时子 Agent', subtitle: '仅作用于本次计划。开始执行后配置固定。', wide: true, body: `<form id="pl-task-form" data-form="pl-save-task" data-id="${E(runId)}" data-task="${E(taskId)}" novalidate><div class="grid-2">${S.field('子 Agent 名称', { name: 'pl-name', value: task.name, required: true })}${S.field('职责摘要', { name: 'pl-role', value: task.role })}</div>${textareaField('工作指引', 'pl-instruction', task.instruction)}<div class="grid-2">${textareaField('输入约定', 'pl-input', task.inputNote, 2)}${textareaField('完成条件 / 输出约定', 'pl-output', task.outputNote, 2)}</div><div class="pl-form-section"><h3>上下游传参</h3><p class="small muted">选中的前置任务全部成功后才启动；其返回值、回执与来源 Run 会作为输入传入。</p><div class="pl-check-list">${plan.tasks.filter(other => other.id !== task.id).map(other => `<label class="pl-check"><input type="checkbox" name="pl-dependencies" value="${E(other.id)}" ${task.dependsOn.includes(other.id) ? 'checked' : ''}><span>${E(other.name)}<small>${E(other.outputNote)}</small></span></label>`).join('') || '<p class="small muted">当前没有其他任务，可先添加子 Agent。</p>'}</div></div><div class="pl-form-section"><h3>模型与参数</h3>${selectField('分配模型', 'pl-model', modelOptions, task.modelMode === 'manual' ? task.modelId : 'auto', '自动分配只使用本次允许的 LLM。带工具的任务要求工具调用能力。')}<div class="pl-field-three">${S.field('Temperature', { name: 'pl-temperature', type: 'number', value: task.temperature })}${S.field('Token 配额', { name: 'pl-tokens', type: 'number', value: task.maxTokens })}${S.field('费用配额（¥，估算）', { name: 'pl-cost', type: 'number', value: task.maxCost })}</div></div><div class="pl-form-section"><h3>可使用的工具</h3><p class="small muted">只能缩小父 Agent 的授权。连接、版本、目标范围与写入审批保持原有约束。</p><div class="pl-check-list">${parentBindings(plan).map(binding => `<label class="pl-check"><input type="checkbox" name="pl-tools" value="${E(binding.toolId)}" ${task.toolIds.includes(binding.toolId) ? 'checked' : ''}><span>${E(toolTitle(plan, binding.toolId))}<small>${E(binding.scope || 'all')} · ${toolFor(plan, binding.toolId)?.write ? '写入前人工确认' : '只读'}</small></span></label>`).join('') || '<p class="small muted">父 Agent 没有授权工具；当前任务可分析已有上下文。</p>'}</div></div><p class="field-error" id="pl-form-error" role="alert"></p></form>`, footer: S.btn('取消', 'modal-close', { variant: 'secondary' }) + '<button class="btn btn-primary" type="submit" form="pl-task-form">保存子 Agent</button>' });
  }
  function policyDialog(runId) {
    const plan = findPlan(runId).plan; checkEditable(plan); const allowed = new Set(plan.modelPool.map(modelKey)), all = availableModels(), p = plan.policy;
    plan.modelPool.forEach(m => { if (!all.some(a => modelKey(a) === modelKey(m))) all.push({ ...m, unavailable: true }); });
    S.modal({ title: '模型池与执行边界', subtitle: '调整本次可用资源，保存后重新均分子任务预算。手动指定的模型保持不变。', wide: true, body: `<form id="pl-policy-form" data-form="pl-save-policy" data-id="${E(runId)}" novalidate><h3 class="pl-section-heading">允许自动分配的 LLM</h3><p class="small muted">默认只有父 Agent 的模型。勾选后才允许使用其他模型；已选模型保留生成计划时的配置快照。</p><div class="pl-check-list pl-model-list">${all.map(model => `<label class="pl-check"><input type="checkbox" name="pl-pool" value="${E(modelKey(model))}" ${allowed.has(modelKey(model)) ? 'checked' : ''}><span>${E(model.name)}<small>${E(model.modelId || modelKey(model))} · ${model.capabilities?.tools ? '工具调用' : '仅对话'}${model.unavailable ? ' · 当前已停用，执行前需移除或恢复' : ''}</small></span>${S.badge(allowed.has(modelKey(model)) ? '已允许' : '待选择', allowed.has(modelKey(model)) ? 'success' : 'neutral')}</label>`).join('') || '<p class="small muted">暂无可用 LLM，请先在模型中心维护。</p>'}</div>${selectField('自动分配方式', 'pl-assignment', [['balanced', '均衡分配 · 按任务轮转兼容模型'], ['parent-first', '优先父 Agent 模型 · 不兼容时选择池内模型']], p.assignment)}<div class="pl-field-three">${S.field('最多子 Agent', { name: 'pl-max-agents', type: 'number', value: p.maxAgents, help: '父 Agent 上限：' + plan.limits.maxAgents })}${S.field('最多并行子任务', { name: 'pl-concurrency', type: 'number', value: p.concurrency, help: '父 Agent 上限：' + plan.limits.concurrency })}${S.field('总时限（毫秒）', { name: 'pl-timeout', type: 'number', value: p.timeoutMs, help: '人工等待时间不计入总时限' })}</div><div class="grid-2">${S.field('子任务 Token 总预算', { name: 'pl-total-tokens', type: 'number', value: p.maxTokens, help: '父 Agent 剩余上限：' + plan.limits.maxTokens })}${S.field('子任务总费用（¥，估算）', { name: 'pl-total-cost', type: 'number', value: p.maxCost, help: '父 Agent 剩余上限：¥ ' + plan.limits.maxCost })}</div>${selectField('完成后返回什么', 'pl-result-mode', [['summary', '汇总子任务结果'], ['none', '只保留完成状态与操作回执，不返回内容']], plan.resultMode)}<p class="small muted">委派深度固定为 1。子 Agent 不再拆分任务；结果不要求是文件，写入目的地也可直接结束。</p><p class="field-error" id="pl-form-error" role="alert"></p></form>`, footer: S.btn('取消', 'modal-close', { variant: 'secondary' }) + '<button class="btn btn-primary" type="submit" form="pl-policy-form">保存执行边界</button>' });
  }
  function createDialog() {
    const agents = S.state.agents.filter(agent => !agent.archived);
    S.modal({ title: '规划一个任务', subtitle: '从目标和父 Agent 的能力生成可编辑计划，确认后才开始执行。', wide: true, body: `<form id="pl-create-form" data-form="pl-create" novalidate>${selectField('父 Agent', 'pl-parent', agents.map(a => [a.id, a.name]), agents[0]?.id || '')}${textareaField('希望完成的目标', 'pl-goal', '', 4)}<div class="notice">本地规则模拟规划，会为本次目标创建临时子 Agent。可在下一步调整职责、依赖、工具、模型与预算。</div><p class="field-error" id="pl-form-error" role="alert"></p></form>`, footer: S.btn('取消', 'modal-close', { variant: 'secondary' }) + '<button class="btn btn-primary" type="submit" form="pl-create-form">生成计划</button>' });
  }
  function taskCard(source, task, index, execution) {
    const plan = source.plan, editable = !plan.executionRunIds.length, state = execution?.delegation.tasks.find(t => t.id === task.id), child = state?.childRunId && R.findRun(state.childRunId), depends = task.dependsOn.map(id => plan.tasks.find(t => t.id === id)?.name || '未知任务');
    return `<article class="pl-task ${child?.status === 'waiting' ? 'pl-task-waiting' : ''}"><div class="pl-task-heading"><span class="pl-task-number">${String(index + 1).padStart(2, '0')}</span><div><h3>${E(task.name)}</h3><p>${E(task.role)}</p></div>${statusBadge(state?.status || 'draft')}</div><div class="pl-task-model">${S.icon('spark',14)}<strong>${E(task.modelSnapshot?.name || '待分配模型')}</strong><span>${task.modelMode === 'manual' ? '手动指定' : '自动分配'}</span></div><dl class="pl-task-meta"><dt>前置任务</dt><dd>${E(depends.join('、') || '无 · 可立即开始')}</dd><dt>输出约定</dt><dd>${E(task.outputNote)}</dd><dt>可用工具</dt><dd>${E(task.toolIds.map(id => toolTitle(plan, id)).join('、') || '无工具 · 分析上下文')}</dd><dt>预算</dt><dd>${task.maxTokens.toLocaleString('zh-CN')} Token · ¥ ${Number(task.maxCost).toFixed(4)}</dd></dl>${state?.reason ? `<p class="pl-task-reason">${E(state.reason)}</p>` : ''}<div class="pl-task-actions">${editable ? S.btn('配置子 Agent', 'pl-edit-task', { small: true, variant: 'secondary', attrs: `data-id="${E(source.id)}" data-task="${E(task.id)}"` }) : child ? `<a class="btn btn-secondary btn-sm" href="#task?id=${encodeURIComponent(child.id)}">查看子运行</a>` : ''}${S.btn('保存为草稿', 'pl-save-draft', { small: true, variant: 'ghost', attrs: `data-id="${E(source.id)}" data-task="${E(task.id)}"` })}${editable ? `<button class="icon-btn pl-remove" type="button" data-action="pl-remove-task" data-id="${E(source.id)}" data-task="${E(task.id)}" aria-label="删除子任务 ${E(task.name)}" ${plan.tasks.length === 1 ? 'disabled title="至少保留一个子任务"' : ''}>${S.icon('trash',14)}</button>` : ''}</div></article>`;
  }
  function renderDetail() {
    let source;
    try { source = findPlan(S.params.id); }
    catch (_) {
      const record = R.findRun(S.params.id);
      if (record && !terminal(record.status)) return S.header('TASK PLANNING', '正在生成计划', '计划与模型配置正在准备。') + '<div class="notice" role="status">正在准备临时子 Agent…</div>';
      if (record?.error) return S.header('TASK PLANNING', '计划未能生成', record.error) + `<div class="notice warning" role="alert">${E(record.error)}</div>` + S.empty('调整配置后重新规划', '请检查父 Agent 的模型、能力与预算；已有运行错误保留供排查。', S.btn('重新规划', 'pl-create-dialog', { variant: 'secondary' }) + `<a class="btn btn-ghost" href="#task?id=${encodeURIComponent(record.id)}">查看运行错误</a>`);
      return S.header('TASK PLANNING', '计划不可用', '请从 Agent 对话重新规划。') + S.empty('还没有这份计划', '返回计划列表，创建一个新的目标。', S.btn('查看任务计划', 'pl-list', { variant: 'secondary' }));
    }
    const plan = source.plan, execution = R.findRun(plan.executionRunIds.at(-1)), editable = !plan.executionRunIds.length, check = validate(plan), done = execution?.delegation.tasks.filter(t => t.status === 'done').length || 0;
    let levels; try { levels = stages(plan.tasks); } catch (_) { levels = [plan.tasks]; }
    const actions = editable ? S.btn('模型与执行边界', 'pl-policy', { variant: 'secondary', icon: 'settings', attrs: `data-id="${E(source.id)}"` }) + S.btn('确认并开始执行', 'pl-execute', { icon: 'play', attrs: `data-id="${E(source.id)}" ${check.valid ? '' : 'disabled title="请先解决计划中的配置问题"'}` }) : !terminal(execution?.status) && execution ? S.btn('停止整个计划', 'pl-stop', { variant: 'secondary', icon: 'stop', attrs: `data-id="${E(execution.id)}"` }) : S.btn('复制为新计划', 'pl-duplicate', { variant: 'secondary', icon: 'copy', attrs: `data-id="${E(source.id)}"` });
    return `<div class="pl-breadcrumb"><a href="#planning">任务计划</a><span>/</span><span aria-current="page">计划详情</span></div>` + S.header('TASK PLANNING', plan.goal.length > 42 ? plan.goal.slice(0, 42) + '…' : plan.goal, '为当前目标创建临时职责，按依赖执行并汇合真实子任务结果。', actions) +
      (plan.goal.length > 42 ? `<details class="pl-full-goal"><summary>查看完整目标</summary><p>${E(plan.goal)}</p></details>` : '') +
      `<section class="panel pl-overview"><div><div class="row">${statusBadge(execution?.status || 'draft')}${S.badge('本地规则模拟', 'neutral')}<span class="small muted">计划 r${plan.revision} · ${E(date(plan.createdAt))}</span></div><p class="pl-overview-copy">${editable ? '先核对任务分工与授权。临时子 Agent 仅属于本次运行，保存为草稿后才会加入智能体列表。' : '本次执行使用确认时的模型与能力快照。修改资源配置不会替换运行中的定义，停用状态仍会检查。'}</p></div><dl class="pl-overview-facts"><div><dt>子 Agent</dt><dd>${execution ? done + ' / ' : ''}${plan.tasks.length}</dd></div><div><dt>最多并行</dt><dd>${plan.policy.concurrency}</dd></div><div><dt>Token 总预算</dt><dd>${plan.policy.maxTokens.toLocaleString('zh-CN')}</dd></div><div><dt>费用预算</dt><dd>¥ ${Number(plan.policy.maxCost).toFixed(3)}</dd></div></dl></section>` +
      (!check.valid && editable ? `<div class="notice warning pl-validation" role="alert"><strong>执行前还需要调整</strong><ul>${check.errors.map(error => `<li>${E((error.taskId ? plan.tasks.find(t => t.id === error.taskId)?.name + '：' : '') + error.message)}</li>`).join('')}</ul></div>` : '') +
      (execution?.status === 'waiting' ? `<section class="pl-approvals">${allChildRuns(execution).filter(child => child.status === 'waiting').map(child => `<div class="pl-approval-owner"><p class="small muted">来自子 Agent · ${E(child.agent)}</p>${S.RunUI.approval(child, 'plan')}</div>`).join('')}</section>` : '') +
      `<div class="pl-section-header"><div><h2>任务依赖与职责</h2><p class="small muted">同一阶段可并行；每个任务等待全部前置任务成功后启动。</p></div>${editable ? `<div class="row">${S.btn('均分预算', 'pl-redistribute', { small: true, variant: 'ghost', attrs: `data-id="${E(source.id)}"` })}${S.btn('添加子 Agent', 'pl-add-task', { small: true, variant: 'secondary', icon: 'plus', attrs: `data-id="${E(source.id)}" ${plan.tasks.length >= plan.policy.maxAgents ? 'disabled title="已达到子 Agent 数量上限"' : ''}` })}</div>` : execution ? `<a class="btn btn-secondary btn-sm" href="#task?id=${encodeURIComponent(execution.id)}&tab=trace">查看完整调用链</a>` : ''}</div>` +
      `<div class="pl-dag" aria-label="按依赖分层的任务图">${levels.map((level, index) => `<section class="pl-stage"><div class="pl-stage-heading"><span class="pl-stage-line"></span><h3>阶段 ${index + 1}</h3><span>${level.length > 1 ? level.length + ' 项可并行' : index ? '等待前置完成' : '确认后开始'}</span></div><div class="pl-stage-tasks">${level.map(task => taskCard(source, task, plan.tasks.indexOf(task), execution)).join('')}</div></section>`).join('')}</div>` +
      `<div class="panel pl-result-policy"><div>${S.icon('check',19)}<div><h3>完成方式</h3><p>${plan.resultMode === 'none' ? '所有子任务成功即完成，不提供汇总返回值；操作回执和子运行仍可查看。' : '所有子任务成功后，按实际返回值与操作回执汇总；没有文件也可以成功结束。'}</p></div></div><span class="small muted">模型池 ${plan.modelPool.length} 个 LLM · 委派深度 1</span></div>` +
      (execution && terminal(execution.status) ? `<section class="panel pl-execution-result"><div class="between"><h2>执行结果</h2>${statusBadge(execution.status)}</div>${execution.error ? `<p class="pl-task-reason">${E(execution.error)}</p>` : `<p class="small muted">${E(execution.outcome.message || '')}</p>`}<div class="pl-execution-metrics"><span>已完成 ${done} / ${plan.tasks.length} 个子任务</span><span>${execution.outcome.receipts.length} 条操作回执</span><span>${execution.outcome.artifacts.length} 个文件</span><span>估算 ${execution.delegationUsage?.tokens || 0} Token</span></div>${S.RunUI.results(execution)}</section>` : '');
  }
  function renderList() {
    const all = S.state.runs.filter(isPlan), page = Math.max(1, Math.min(Math.ceil(all.length / 12) || 1, Number(S.params.page) || 1)), rows = all.slice((page - 1) * 12, page * 12);
    return S.header('TASK PLANNING', '任务计划', '把复杂目标拆为临时子 Agent，可单独配置模型、能力和上下游依赖。', S.btn('规划新任务', 'pl-create-dialog', { icon: 'plus' })) + `<div class="notice pl-list-notice">规划与模型响应均为本地模拟。执行会进入统一运行记录，工具写入沿用人工确认。</div>` + `<section class="panel">${rows.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>目标</th><th>状态</th><th>子 Agent</th><th>模型</th><th>创建时间</th><th>操作</th></tr></thead><tbody>${rows.map(run => { const p = run.plan, execution = R.findRun(p.executionRunIds.at(-1)); return `<tr><td><a class="pl-list-title" href="#plan?id=${encodeURIComponent(run.id)}">${E(p.goal)}</a><small class="muted">${E(p.snapshot.name || '父 Agent')} · 计划 r${p.revision}</small></td><td>${statusBadge(execution?.status || 'draft')}</td><td>${p.tasks.length}</td><td>${E([...new Set(p.tasks.map(t => t.modelSnapshot?.name).filter(Boolean))].join(' / ') || '待配置')}</td><td class="small muted">${E(date(p.createdAt))}</td><td><a class="text-link" href="#plan?id=${encodeURIComponent(run.id)}">查看计划</a></td></tr>`; }).join('')}</tbody></table></div><div class="pl-pagination"><span>共 ${all.length} 份计划 · 第 ${page} / ${Math.ceil(all.length / 12)} 页</span><div class="row">${page > 1 ? `<a class="btn btn-secondary btn-sm" href="#planning?page=${page - 1}">上一页</a>` : ''}${page * 12 < all.length ? `<a class="btn btn-secondary btn-sm" href="#planning?page=${page + 1}">下一页</a>` : ''}</div></div>` : S.empty('从一个目标开始', '系统会创建本次专用的子 Agent。你可以在执行前审阅或调整每项配置。', S.btn('规划新任务', 'pl-create-dialog', { icon: 'plus' }))}</section>`;
  }
  function mountDetail() {
    let queued = false; const id = S.params.id;
    return R.subscribe(changed => {
      const source = R.findRun(id), executionIds = source?.plan?.executionRunIds || [];
      if (changed.id !== id && !executionIds.includes(changed.id) && !executionIds.includes(changed.parentRunId)) return;
      if (queued) return; queued = true;
      queueMicrotask(() => { queued = false; if (S.route === 'plan' && S.params.id === id && !document.getElementById('app-dialog')?.open) S.render(); });
    });
  }
  const fieldValue = (form, name) => form.elements.namedItem(name)?.value || '';
  const checked = (form, name) => Array.from(form.querySelectorAll('input[name="' + name + '"]:checked')).map(input => input.value);
  const formError = error => { const target = document.getElementById('pl-form-error'); if (target) { target.textContent = error.message; target.setAttribute('tabindex', '-1'); target.focus(); } };
  const safeAction = fn => el => { try { return fn(el); } catch (error) { S.toast(error.message, 'warning'); } };
  S.page('planning', { title: '任务计划', section: 'agents', render: renderList });
  S.page('plan', { title: '任务计划', section: 'agents', render: renderDetail, mount: mountDetail });
  S.action('pl-list', () => S.go('planning'));
  S.action('pl-create-dialog', createDialog);
  S.action('pl-edit-task', safeAction(el => editDialog(el.dataset.id, el.dataset.task)));
  S.action('pl-policy', safeAction(el => policyDialog(el.dataset.id)));
  S.action('pl-add-task', safeAction(el => { const task = addTask(el.dataset.id); S.render(); editDialog(el.dataset.id, task.id); }));
  S.action('pl-remove-task', safeAction(el => { const plan = findPlan(el.dataset.id).plan, task = plan.tasks.find(t => t.id === el.dataset.task); checkEditable(plan); S.modal({ title: '删除子任务「' + task.name + '」？', subtitle: '将同时移除其他任务对它的依赖，并重新均分预算。请重新核对上下游关系。', body: '<p class="small muted">这只调整尚未执行的计划，不会删除已保存的智能体。</p>', footer: S.btn('保留任务', 'modal-close', { variant: 'secondary' }) + S.btn('删除子任务', 'pl-confirm-remove', { variant: 'danger', attrs: `data-id="${E(el.dataset.id)}" data-task="${E(task.id)}"` }) }); }));
  S.action('pl-confirm-remove', safeAction(el => { removeTask(el.dataset.id, el.dataset.task); S.closeModal(); S.render(); S.toast('已删除子任务，并重新均分预算'); }));
  S.action('pl-save-draft', safeAction(el => { const saved = saveDraft(el.dataset.id, el.dataset.task); S.toast('已将「' + saved.name + '」加入智能体列表'); }));
  S.action('pl-redistribute', safeAction(el => { redistribute(el.dataset.id); S.render(); S.toast('已在全部子任务间均分预算'); }));
  S.action('pl-execute', safeAction(el => { execute(el.dataset.id); S.render(); S.toast('计划已开始执行'); }));
  S.action('pl-stop', safeAction(el => { R.stop(el.dataset.id); S.render(); S.toast('已停止计划和未完成子任务'); }));
  S.action('pl-duplicate', safeAction(el => { const copy = duplicate(el.dataset.id); S.go('plan', { id: copy.id }); S.toast('已复制为待确认的新计划'); }));
  S.form('pl-save-task', form => { if (!S.validate(form, { 'pl-name': '请填写子 Agent 名称', 'pl-instruction': '请填写工作指引', 'pl-output': '请填写完成条件' })) return; try { const model = fieldValue(form, 'pl-model'); updateTask(form.dataset.id, form.dataset.task, { name: fieldValue(form, 'pl-name').trim(), role: fieldValue(form, 'pl-role').trim(), instruction: fieldValue(form, 'pl-instruction').trim(), inputNote: fieldValue(form, 'pl-input').trim(), outputNote: fieldValue(form, 'pl-output').trim(), dependsOn: checked(form, 'pl-dependencies'), toolIds: checked(form, 'pl-tools'), temperature: Number(fieldValue(form, 'pl-temperature')), maxTokens: Number(fieldValue(form, 'pl-tokens')), maxCost: Number(fieldValue(form, 'pl-cost')), modelMode: model === 'auto' ? 'auto' : 'manual', ...(model !== 'auto' ? { modelId: model } : {}) }); S.closeModal(); S.render(); S.toast('子 Agent 配置已保存'); } catch (error) { formError(error); } });
  S.form('pl-save-policy', form => { try { updatePolicy(form.dataset.id, { maxAgents: Number(fieldValue(form, 'pl-max-agents')), concurrency: Number(fieldValue(form, 'pl-concurrency')), timeoutMs: Number(fieldValue(form, 'pl-timeout')), maxTokens: Number(fieldValue(form, 'pl-total-tokens')), maxCost: Number(fieldValue(form, 'pl-total-cost')), assignment: fieldValue(form, 'pl-assignment'), resultMode: fieldValue(form, 'pl-result-mode'), allowedModelIds: checked(form, 'pl-pool') }); S.closeModal(); S.render(); S.toast('已保存模型池与执行边界，并重新均分预算'); } catch (error) { formError(error); } });
  S.form('pl-create', form => { if (!S.validate(form, { 'pl-parent': '请选择父 Agent', 'pl-goal': '请填写希望完成的目标' })) return; try { const run = S.AgentStudio.start({ agentId: fieldValue(form, 'pl-parent'), goal: fieldValue(form, 'pl-goal').trim(), mode: 'plan' }); if (!run) throw issue('PLAN_PARENT_MISSING', '所选父 Agent 不可用。'); S.closeModal(); S.go('plan', { id: run.id }); } catch (error) { formError(error); } });
  S.Planning = { prepare, execute, card, isPlan, open: id => S.go('plan', { id }), validate, stages, updateTask, addTask, removeTask, updatePolicy, redistribute, saveDraft, duplicate, stopAll, childSnapshot, renderDetail, renderList, editDialog, policyDialog, createDialog };
})();
