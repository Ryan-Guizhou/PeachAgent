(function () {
  'use strict';
  const S = window.Studio, R = S.Runtime, E = S.escape;
  const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
  const terminal = status => ['done', 'failed', 'rejected', 'stopped'].includes(status);
  const BASE = 'https://api.peachagent.example/v1';
  const PERMISSIONS = ['invoke', 'read', 'stop'];
  const scopeNames = { invoke: '发起调用', read: '读取结果', stop: '停止运行' };
  const ui = { actor: 'owner', query: '', filter: 'all', listPage: 1, keyPage: 1, logPage: 1, requestPage: 1, language: 'curl', secrets: new Map(), play: {}, activeIssue: null };
  const data = () => S.state.publishing;
  const appBy = id => data().apps.find(app => app.id === id);
  const keyBy = id => data().keys.find(key => key.id === id);
  const current = app => app.versions.find(version => version.id === app.activeVersionId);
  const canViewApp = app => ui.actor === 'owner' || app.accessPolicy === 'request' && app.status === 'published' || data().keys.some(key => key.appId === app.id && key.consumer === 'caller') || data().requests.some(request => request.appId === app.id);
  const now = () => Date.now();
  const rotations = new Set();
  const date = value => value ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)) : '—';
  const error = (code, message, http = 400) => Object.assign(new Error(message), { code, http });
  const button = (label, action, attrs = {}, options = {}) => S.btn(label, action, { variant: 'secondary', small: true, ...options, attrs: Object.entries(attrs).map(([key, value]) => 'data-' + key + '="' + E(value) + '"').join(' ') + (options.attrs ? ' ' + options.attrs : '') });
  const link = (label, route, params = {}, icon = 'arrow') => '<a class="btn btn-secondary btn-sm" href="#' + E(route) + '?' + E(new URLSearchParams(params).toString()) + '">' + S.icon(icon, 14) + '<span>' + E(label) + '</span></a>';
  const code = value => '<pre class="pub-code">' + E(typeof value === 'string' ? value : JSON.stringify(value, null, 2)) + '</pre>';
  const select = (label, id, value, choices, help = '') => '<div class="field"><label class="field-label" for="' + E(id) + '">' + E(label) + '</label><select class="select" name="' + E(id) + '" id="' + E(id) + '" aria-describedby="' + E(id) + '-error">' + choices.map(choice => '<option value="' + E(choice.id) + '"' + (String(choice.id) === String(value) ? ' selected' : '') + '>' + E(choice.label) + '</option>').join('') + '</select>' + (help ? '<p class="field-help">' + E(help) + '</p>' : '') + '<p class="field-error" id="' + E(id) + '-error"></p></div>';
  const area = (label, id, value, help = '') => '<div class="field"><label class="field-label" for="' + E(id) + '">' + E(label) + '</label><textarea class="textarea" name="' + E(id) + '" id="' + E(id) + '" rows="5" style="resize:none" aria-describedby="' + E(id) + '-error">' + E(value) + '</textarea>' + (help ? '<p class="field-help">' + E(help) + '</p>' : '') + '<p class="field-error" id="' + E(id) + '-error"></p></div>';
  const formError = message => '<p class="field-error pub-form-error" id="pub-form-error" role="alert">' + E(message || '') + '</p>';
  const failure = exception => { const node = document.getElementById('pub-form-error'); if (node) { node.textContent = exception.message; node.setAttribute('tabindex', '-1'); node.focus(); } else S.toast(exception.message, 'error'); };
  function assertOwner() { if (ui.actor !== 'owner') throw error('OWNER_REQUIRED', '请切换到服务所有者预览后管理此配置。', 403); }
  function requireApp(id) { const app = appBy(id); if (!app) throw error('SERVICE_NOT_FOUND', '找不到此应用服务。', 404); return app; }
  function actorKey(key) { return ui.actor === 'owner' || key.consumer === 'caller'; }
  function requireManagedKey(id) { const key = keyBy(id); if (!key || !actorKey(key)) throw error('KEY_NOT_FOUND', '当前预览身份无法管理此密钥。', 404); return key; }
  const keyState = key => key.status === 'revoked' ? 'revoked' : key.expiresAt && key.expiresAt <= now() ? 'expired' : key.status;
  const stateBadge = state => { const labels = { published: ['已上线', 'success'], draft: ['待发布', 'neutral'], disabled: ['已停用', 'warning'], active: ['可用', 'success'], revoked: ['已吊销', 'danger'], expired: ['已过期', 'warning'], pending: ['待审批', 'warning'], approved: ['待领取', 'info'], claimed: ['已领取', 'success'], rejected: ['已驳回', 'danger'], cancelled: ['已取消', 'neutral'], running: ['执行中', 'info'], waiting: ['等待确认', 'warning'], done: ['已完成', 'success'], stopped: ['已停止', 'neutral'], failed: ['失败', 'danger'] }; const item = labels[state] || [state, 'neutral']; return S.badge(item[0], item[1]); };
  function sources(kind, id) {
    const result = [];
    if (!kind || kind === 'workflow') R.flows.filter(flow => (!id || flow.id === id) && flow.publishedSnapshot).forEach(flow => {
      const seen = new Set(); [flow.publishedSnapshot, ...(flow.versions || [])].filter(Boolean).forEach(snapshot => { if (seen.has(snapshot.version)) return; seen.add(snapshot.version); result.push({ key: 'workflow|' + flow.id + '|' + snapshot.version, kind: 'workflow', id: flow.id, version: snapshot.version, name: snapshot.title || flow.title, snapshot: clone(snapshot) }); });
    });
    if (!kind || kind === 'agent') S.state.agents.filter(agent => (!id || agent.id === id) && agent.publishedConfig).forEach(agent => {
      const seen = new Set(); [agent.publishedConfig, ...(agent.publishedVersions || [])].filter(Boolean).forEach(snapshot => { if (seen.has(snapshot.version)) return; seen.add(snapshot.version); result.push({ key: 'agent|' + agent.id + '|' + snapshot.version, kind: 'agent', id: agent.id, version: snapshot.version, name: snapshot.name || agent.name, snapshot: clone(snapshot) }); });
    });
    return result;
  }
  function sourceFor(kind, id, version) {
    const source = sources(kind, id).find(item => !version || item.version === version);
    if (!source) throw error('PUBLISHED_VERSION_REQUIRED', '请先在编辑器发布此 Agent 或工作流，再创建应用服务。', 422);
    return source;
  }
  function freezeAgent(snapshot) {
    const saved = S.AgentStudio?.freezeSnapshot ? S.AgentStudio.freezeSnapshot(snapshot) : clone(snapshot);
    saved.capabilityBindings = (saved.capabilityBindings || []).map(binding => {
      const tool = R.getTool(binding.toolId);
      if (binding.enabled !== false && !tool) throw error('DEPENDENCY_MISSING', 'Agent 引用的工具不存在：' + binding.toolId, 422);
      return { ...binding, ...(tool ? { connectionId: binding.connectionId || tool.connectionId, version: binding.version || tool.version } : {}) };
    });
    saved.contextBindings = (saved.contextBindings || []).map(binding => {
      if (binding.enabled === false || !['workflow', 'agent'].includes(binding.kind)) return binding;
      const dependency = binding.kind === 'workflow' ? binding.resolvedSnapshot : binding.agentSnapshot;
      const version = dependency?.version || sourceFor(binding.kind, binding.id, binding.version).version;
      return { ...binding, version };
    });
    return saved;
  }
  function freezeWorkflow(snapshot, chain = []) {
    if (chain.includes(snapshot.id) || chain.length > 4) throw error('DEPENDENCY_CYCLE', '子流程存在循环引用或超过发布嵌套深度。', 422);
    const saved = R.freezeWorkflow ? R.freezeWorkflow(snapshot) : clone(snapshot);
    function freezeNodes(nodes) {
      (nodes || []).forEach(node => {
        node.config = node.config || {};
        if (node.type === 'subflow') {
          const dependency = node.config.resolvedSnapshot || sourceFor('workflow', node.config.flowId, node.config.version).snapshot;
          node.config.version = dependency.version;
          node.config.resolvedSnapshot = freezeWorkflow(dependency, chain.concat(snapshot.id));
        }
        if (node.type === 'agent') node.config.agentSnapshot = freezeAgent(node.config.agentSnapshot || sourceFor('agent', node.config.agentId).snapshot);
        if (['mcp', 'plugin'].includes(node.type)) {
          const tool = R.getTool(node.config.toolId);
          if (!tool) throw error('DEPENDENCY_MISSING', '节点引用的工具不存在：' + node.config.toolId, 422);
          node.config.binding = { ...(node.config.binding || {}), toolId: tool.id, connectionId: node.config.connectionId || tool.connectionId, version: node.config.binding?.version || tool.version, enabled: node.config.binding?.enabled !== false };
        }
        if (node.config.body?.nodes) freezeNodes(node.config.body.nodes);
      });
    }
    freezeNodes(saved.nodes);
    return saved;
  }
  function schemaFor(source) {
    if (source.kind === 'agent') return { type: 'object', properties: { message: { type: 'string', minLength: 1, description: '发送给 Agent 的任务或问题' } }, required: ['message'], additionalProperties: false };
    if (source.snapshot.inputSchema?.type === 'object') return clone(source.snapshot.inputSchema);
    const properties = {}, required = [];
    const entry = source.snapshot.nodes.find(node => node.type === 'input');
    (entry?.config?.fields || []).forEach(field => { if (['__proto__', 'prototype', 'constructor'].includes(field.name)) return; properties[field.name] = { type: field.type === 'text' ? 'string' : field.type || 'string', description: field.description || field.label || field.name }; if (field.default !== undefined) properties[field.name].default = clone(field.default); if (field.required) required.push(field.name); });
    if (!Object.keys(properties).length) Object.entries(source.snapshot.inputs || {}).forEach(([key, value]) => { properties[key] = { type: Array.isArray(value) ? 'array' : value === null ? 'string' : typeof value === 'number' ? Number.isInteger(value) ? 'integer' : 'number' : typeof value, default: clone(value) }; });
    return { type: 'object', properties, required, additionalProperties: false };
  }
  function makeVersion(source, label) {
    const inputSchema = schemaFor(source), snapshot = source.kind === 'agent' ? freezeAgent(source.snapshot) : freezeWorkflow(source.snapshot);
    return { id: S.uid('release'), label, sourceVersion: source.version, created: now(), snapshot, inputSchema, outputSchema: { type: 'object', required: ['run_id', 'status', 'receipts', 'files'], properties: { run_id: { type: 'string' }, status: { type: 'string' }, outputs: { description: '只有流程显式返回数据时才出现；成功完成可以没有此字段' }, receipts: { type: 'array', description: '目标位置操作回执，可为空' }, files: { type: 'array', description: '仅显式生成的文件，可为空' } } } };
  }
  function createApp(options) {
    assertOwner();
    const name = String(options.name || '').trim(); if (!name || name.length > 80) throw error('NAME_REQUIRED', '服务名称需为 1—80 个字符。', 422);
    const source = sourceFor(options.kind, options.id, options.version), version = makeVersion(source, '发布版 1');
    const app = { id: S.uid('app'), name, description: String(options.description || '').trim().slice(0,500), kind: source.kind, sourceId: source.id, status: 'draft', accessPolicy: options.accessPolicy === 'request' ? 'request' : 'private', activeVersionId: version.id, versions: [version], created: now(), updated: now() };
    data().apps.unshift(app); S.save(); return app;
  }
  function changeStatus(id, state) { assertOwner(); const app = requireApp(id); if (!['published', 'disabled'].includes(state)) throw error('STATUS_INVALID', '不支持此服务状态。'); if (!current(app)) throw error('VERSION_MISSING', '服务缺少可用的发布快照。', 422); app.status = state; app.updated = now(); S.save(); return app; }
  function updateApp(id, values) { assertOwner(); const app = requireApp(id); const name = String(values.name || '').trim(); if (!name || name.length > 80) throw error('NAME_REQUIRED', '服务名称需为 1—80 个字符。', 422); app.name = name; app.description = String(values.description || '').trim().slice(0,500); app.accessPolicy = values.accessPolicy === 'request' ? 'request' : 'private'; app.updated = now(); S.save(); return app; }
  function addVersion(id, sourceVersion) { assertOwner(); const app = requireApp(id); const version = makeVersion(sourceFor(app.kind, app.sourceId, sourceVersion), '发布版 ' + (app.versions.length + 1)); app.versions.unshift(version); app.activeVersionId = version.id; app.updated = now(); S.save(); return version; }
  function activateVersion(id, versionId) { assertOwner(); const app = requireApp(id); if (!app.versions.some(version => version.id === versionId)) throw error('VERSION_MISSING', '此服务没有该发布版本。'); app.activeVersionId = versionId; app.updated = now(); S.save(); return current(app); }
  function keyOptions(options) {
    const permissions = [...new Set(options.permissions || ['invoke', 'read'])];
    if (!permissions.length || permissions.some(scope => !PERMISSIONS.includes(scope))) throw error('SCOPE_INVALID', '请选择有效的调用权限。', 422);
    const rateLimit = Number(options.rateLimit == null ? 60 : options.rateLimit), dayQuota = Number(options.dayQuota == null ? 1000 : options.dayQuota), days = Number(options.days == null ? 30 : options.days);
    if (!Number.isInteger(rateLimit) || rateLimit < 1 || rateLimit > 600 || !Number.isInteger(dayQuota) || dayQuota < 1 || dayQuota > 100000 || !Number.isInteger(days) || days < 1 || days > 365) throw error('LIMIT_INVALID', '每分钟 1—600 次、每日 1—100000 次、有效期 1—365 天，请填写整数。', 422);
    const name = String(options.name || '').trim(); if (!name || name.length > 60) throw error('KEY_NAME', '请填写 1—60 个字符的密钥名称。', 422);
    return { name, permissions, rateLimit, dayQuota, days, purpose: String(options.purpose || '').trim().slice(0,500) };
  }
  function cryptoApi() { const api = window.crypto || (typeof crypto !== 'undefined' && crypto); if (!api?.getRandomValues || !api?.subtle) throw error('CRYPTO_UNAVAILABLE', '此浏览器不支持凭据生成，请通过本地 HTTP 服务打开原型。', 503); return api; }
  async function digest(value) { const buffer = await cryptoApi().subtle.digest('SHA-256', new TextEncoder().encode(value)); return Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join(''); }
  async function issueKeyInternal(app, options, consumer, requestId, beforeCommit) {
    if (app.status !== 'published') throw error('SERVICE_UNAVAILABLE', '请先上线应用服务，再签发 API Key。', 503);
    const settings = keyOptions(options), bytes = new Uint8Array(32); cryptoApi().getRandomValues(bytes);
    const credential = 'pa_demo_' + Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    const fingerprint = await digest(credential);
    if (app.status !== 'published') throw error('SERVICE_UNAVAILABLE', '服务状态已变化，请上线后重新签发。', 503);
    const key = { id: S.uid('key'), appId: app.id, name: settings.name, purpose: settings.purpose, consumer, permissions: settings.permissions, rateLimit: settings.rateLimit, dayQuota: settings.dayQuota, expiresAt: now() + settings.days * 86400000, created: now(), status: 'active', fingerprint, suffix: credential.slice(-6), requestId: requestId || null, usage: { minute: 0, minuteCount: 0, day: '', dayCount: 0 }, lastUsed: null };
    if (beforeCommit) beforeCommit(key);
    data().keys.unshift(key); ui.secrets.set(key.id, credential); S.save(); return { key, credential };
  }
  async function issueKey(appId, options) { assertOwner(); return issueKeyInternal(requireApp(appId), options, 'owner'); }
  function requestKey(appId, options) {
    if (ui.actor !== 'caller') throw error('CALLER_REQUIRED', '请切换到调用方预览提交申请。', 403);
    const app = requireApp(appId); if (app.status !== 'published' || app.accessPolicy !== 'request') throw error('REQUEST_CLOSED', '此服务当前未开放 API Key 申请。', 403);
    const values = keyOptions(options); if (!values.purpose) throw error('PURPOSE_REQUIRED', '请说明调用场景和用途。', 422);
    if (data().requests.some(request => request.appId === appId && request.status === 'pending')) throw error('REQUEST_PENDING', '此服务已有一条待审批申请，可在申请记录中查看或取消。', 409);
    const request = { id: S.uid('request'), appId, ...values, applicant: '本地调用方', status: 'pending', created: now() }; data().requests.unshift(request); S.save(); return request;
  }
  function reviewRequest(id, approved, values = {}) {
    assertOwner(); const request = data().requests.find(item => item.id === id); if (!request || request.status !== 'pending') throw error('REQUEST_STATE', '申请已处理或不存在，请刷新记录。', 409);
    if (!approved && !String(values.reason || '').trim()) throw error('REASON_REQUIRED', '请填写驳回原因，便于调用方修改后重新申请。', 422);
    if (approved) { const settings = keyOptions({ ...request, ...values }); if (settings.permissions.some(scope => !request.permissions.includes(scope)) || settings.rateLimit > request.rateLimit || settings.dayQuota > request.dayQuota || settings.days > request.days) throw error('APPROVAL_SCOPE', '审批可收窄权限、额度和有效期，不能超出申请范围。', 422); request.grant = settings; }
    request.status = approved ? 'approved' : 'rejected'; request.reason = String(values.reason || '').trim().slice(0,500); request.reviewed = now(); S.save(); return request;
  }
  function cancelRequest(id) { const request = data().requests.find(item => item.id === id); if (ui.actor !== 'caller' || !request || request.status !== 'pending') throw error('REQUEST_STATE', '只有调用方可取消待审批申请。', 409); request.status = 'cancelled'; S.save(); return request; }
  async function claimKey(id) {
    if (ui.actor !== 'caller') throw error('CALLER_REQUIRED', '请切换到调用方预览领取密钥。', 403);
    const request = data().requests.find(item => item.id === id); if (!request || request.status !== 'approved' || request.claiming) throw error('REQUEST_STATE', '此申请尚未批准或已领取。', 409);
    request.claiming = true;
    try { const issued = await issueKeyInternal(requireApp(request.appId), request.grant, 'caller', request.id); request.status = 'claimed'; request.keyId = issued.key.id; request.claimedAt = now(); return issued; } finally { delete request.claiming; S.save(); }
  }
  function setKeyStatus(id, state) { const key = requireManagedKey(id); if (!['active', 'disabled', 'revoked'].includes(state) || key.status === 'revoked' || keyState(key) === 'expired' && state !== 'revoked') throw error('KEY_STATE', '已吊销或过期的密钥不能重新启用，请创建或轮换密钥。', 409); key.status = state; if (state === 'revoked') { key.revokedAt = now(); ui.secrets.delete(key.id); } S.save(); return key; }
  async function rotateKey(id) {
    const old = requireManagedKey(id);
    if (['revoked', 'expired'].includes(keyState(old))) throw error('KEY_STATE', '已吊销或过期的密钥不能轮换，请重新签发或申请。', 409);
    if (rotations.has(id)) throw error('KEY_BUSY', '此密钥正在轮换，请勿重复提交。', 409);
    rotations.add(id);
    const initialStatus = old.status, originalExpiry = old.expiresAt;
    try {
      const issued = await issueKeyInternal(requireApp(old.appId), { name: old.name, purpose: old.purpose, permissions: old.permissions, rateLimit: old.rateLimit, dayQuota: old.dayQuota, days: Math.max(1, Math.ceil((originalExpiry - now()) / 86400000)) }, old.consumer, old.requestId, key => {
        if (old.status !== initialStatus || ['revoked', 'expired'].includes(keyState(old))) throw error('KEY_STATE', '密钥状态在轮换期间发生变化，请刷新后重试。', 409);
        key.expiresAt = originalExpiry;
        old.status = 'revoked'; old.rotatedTo = key.id; old.revokedAt = now(); ui.secrets.delete(old.id);
      });
      return issued;
    } finally { rotations.delete(id); }
  }
  function findCredential(options) { if (options.credential) return String(options.credential).trim(); const key = keyBy(options.keyId); return options.useSession && key && actorKey(key) ? ui.secrets.get(key.id) || '' : ''; }
  async function authorize(appId, options, permission, consume = false) {
    const credential = findCredential(options); if (!credential) throw error('UNAUTHORIZED', '缺少 API Key。请填写密钥或选择本次会话已签发的凭据。', 401);
    const fingerprint = await digest(credential), key = data().keys.find(item => item.fingerprint === fingerprint);
    if (!key || keyState(key) !== 'active') throw error('UNAUTHORIZED', 'API Key 无效、已停用、吊销或过期。', 401);
    if (key.appId !== appId || !key.permissions.includes(permission)) throw error('FORBIDDEN', 'API Key 不属于此服务，或没有本次操作的权限。', 403);
    const app = requireApp(appId); if (app.status !== 'published') throw error('SERVICE_UNAVAILABLE', '应用服务已停用或尚未上线。', 503);
    if (consume) {
      const minute = Math.floor(now() / 60000), day = new Date(now() + 8 * 3600000).toISOString().slice(0,10), usage = key.usage;
      if (usage.minute !== minute) { usage.minute = minute; usage.minuteCount = 0; }
      if (usage.day !== day) { usage.day = day; usage.dayCount = 0; }
      if (usage.minuteCount >= key.rateLimit || usage.dayCount >= key.dayQuota) throw error('RATE_LIMITED', '已达到每分钟或当日调用额度。等待窗口重置，或联系服务所有者调整授权。', 429);
      usage.minuteCount++; usage.dayCount++; key.lastUsed = now(); S.save();
    }
    return { app, key, credential };
  }
  function responseBody(run) {
    return { run_id: run.id, status: run.status, ...(own(run.outcome, 'returnValue') ? { outputs: clone(run.outcome.returnValue) } : {}), receipts: clone(run.outcome?.receipts || []), files: (run.outcome?.artifacts || []).map(file => ({ name: file.name, type: file.type })), ...(run.error ? { error: { code: run.errorCode, message: run.error } } : {}), ...(run.pending ? { waiting: { title: run.pending.title, kind: run.pending.kind, message: '需由服务所有者在运行记录中处理；本地演示未对外开放审批端点。' } } : {}) };
  }
  const containsCredential = value => /pa_demo_[a-f0-9]{64}/i.test(String(value));
  function addLog(appId, user, operation) { const log = { id: S.uid('api-request'), appId, consumer: ui.actor, user: String(user || '').replace(/pa_demo_[a-f0-9]{64}/gi, '[凭据已隐藏]').slice(0,128), operation, created: now(), httpStatus: null, status: 'validating', simulated: true }; data().logs.unshift(log); if (data().logs.length > 300) data().logs.length = 300; return log; }
  function failed(log, exception) { log.httpStatus = exception.http || 500; log.status = 'failed'; log.errorCode = exception.code || 'INTERNAL_ERROR'; log.message = exception.message; log.duration = now() - log.created; S.save(); return { httpStatus: log.httpStatus, body: { request_id: log.id, error: { code: log.errorCode, message: log.message } }, log }; }
  async function invoke(appId, options = {}) {
    const log = addLog(appId, options.user, 'invoke');
    try {
      const { app, key, credential } = await authorize(appId, options, 'invoke');
      const user = String(options.user || '').trim(); if (!user || user.length > 128) throw error('END_USER_REQUIRED', '请填写稳定的终端用户标识 user（1—128 个字符）。', 422);
      if (containsCredential(user)) throw error('SECRET_IN_INPUT', '请勿把 API Key 放入终端用户标识。', 422);
      const version = clone(current(app)); if (!version) throw error('VERSION_MISSING', '此服务缺少发布版本。', 503);
      const inputs = options.inputs; if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs)) throw error('INPUT_SCHEMA', 'inputs 必须是 JSON 对象。', 422);
      if (containsCredential(JSON.stringify(inputs)) || JSON.stringify(inputs).includes(credential)) throw error('SECRET_IN_INPUT', '请勿把 API Key 放入业务输入。', 422);
      const errors = R.validateSchema(inputs, version.inputSchema); if (errors.length) throw error('INPUT_SCHEMA', errors.join('；'), 422);
      if (app.kind === 'agent' && !S.state.agents.some(agent => agent.id === app.sourceId)) throw error('SOURCE_UNAVAILABLE', '服务引用的 Agent 已移除，请重新配置服务。', 503);
      await authorize(appId, options, 'invoke', true);
      const run = app.kind === 'workflow' ? R.runWorkflow(version.snapshot, { inputs: clone(inputs), title: app.name, speed: options.speed, preserveResolvedSnapshots: true }) : S.AgentStudio.start({ agentId: app.sourceId, snapshot: version.snapshot, goal: inputs.message, mode: 'execute', preserveResolvedSnapshots: true });
      if (!run) throw error('RUN_START_FAILED', '未能创建运行，请检查发布版本。', 503);
      run.apiService = { appId, appName: app.name, releaseId: version.id, releaseLabel: version.label, sourceVersion: version.sourceVersion, keyId: key.id, requestId: log.id, user };
      run.source = 'API · ' + app.name;
      Object.assign(log, { user, keyId: key.id, keyName: key.name, releaseId: version.id, releaseLabel: version.label, sourceVersion: version.sourceVersion, httpStatus: 202, runId: run.id, traceId: run.traceId, status: run.status, duration: 0 });
      R.event(run, 'api.request.accepted', { requestId: log.id, appId, keyId: key.id, user, releaseId: version.id }); S.save();
      return { httpStatus: 202, body: { request_id: log.id, ...responseBody(run) }, log, run };
    } catch (exception) { return failed(log, exception); }
  }
  async function readRun(appId, runId, options = {}) {
    const log = addLog(appId, options.user, 'read');
    try { const { key } = await authorize(appId, options, 'read'); const run = R.findRun(runId); if (!run || run.apiService?.appId !== appId) throw error('RUN_NOT_FOUND', '此服务没有该运行。', 404); if (!options.user || run.apiService.user !== String(options.user).trim()) throw error('END_USER_FORBIDDEN', '终端用户标识与此运行不一致。', 403); Object.assign(log, { keyId: key.id, keyName: key.name, runId, traceId: run.traceId, httpStatus: 200, status: run.status, duration: now() - log.created }); S.save(); return { httpStatus: 200, body: { request_id: log.id, ...responseBody(run) }, log, run }; } catch (exception) { return failed(log, exception); }
  }
  async function stopRun(appId, runId, options = {}) {
    const log = addLog(appId, options.user, 'stop');
    try { const { key } = await authorize(appId, options, 'stop'); const run = R.findRun(runId); if (!run || run.apiService?.appId !== appId) throw error('RUN_NOT_FOUND', '此服务没有该运行。', 404); if (!options.user || run.apiService.user !== String(options.user).trim()) throw error('END_USER_FORBIDDEN', '终端用户标识与此运行不一致。', 403); if (terminal(run.status)) throw error('RUN_TERMINAL', '运行已结束，无需再次停止。', 409); R.stop(runId); Object.assign(log, { keyId: key.id, keyName: key.name, runId, traceId: run.traceId, httpStatus: 200, status: run.status, duration: now() - log.created }); S.save(); return { httpStatus: 200, body: { request_id: log.id, ...responseBody(run) }, log, run }; } catch (exception) { return failed(log, exception); }
  }
  function exampleInputs(app) {
    const version = current(app), result = {};
    Object.entries(version.inputSchema.properties || {}).forEach(([key, field]) => { const saved = version.snapshot.inputs?.[key]; result[key] = saved !== undefined ? clone(saved) : field.default !== undefined ? clone(field.default) : field.type === 'string' ? key === 'message' ? '总结本周产品反馈，说明下一步建议。' : '企业 Agent 平台' : ['integer', 'number'].includes(field.type) ? 3 : field.type === 'boolean' ? true : field.type === 'array' ? [] : {}; });
    return result;
  }
  function openApi(appId) {
    const app = requireApp(appId), version = current(app), prefix = '/apps/' + app.id;
    const errors = { '401': { description: '缺少、无效、停用或过期的 Key' }, '403': { description: '作用域或终端用户不匹配' }, '422': { description: '请求参数不符合已发布的输入 Schema' }, '429': { description: '达到调用额度' }, '503': { description: '服务停用或依赖不可用' } };
    return { openapi: '3.1.0', info: { title: app.name, version: version.sourceVersion, description: '本地交互原型生成的接入合同；示例域名不提供真实网络服务。' }, servers: [{ url: BASE }], security: [{ bearerAuth: [] }], paths: { [prefix + '/runs']: { post: { summary: '发起一次异步运行', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['inputs', 'user'], properties: { inputs: version.inputSchema, user: { type: 'string', minLength: 1, maxLength: 128 } }, additionalProperties: false } } } }, responses: { '202': { description: '已接受；使用 run_id 查询状态', content: { 'application/json': { schema: version.outputSchema } } }, ...errors } } }, [prefix + '/runs/{run_id}']: { get: { summary: '查询运行状态和可选结果', parameters: [{ name: 'run_id', in: 'path', required: true, schema: { type: 'string' } }, { name: 'user', in: 'query', required: true, schema: { type: 'string' } }], responses: { '200': { description: '当前运行状态；outputs 为可选字段', content: { 'application/json': { schema: version.outputSchema } } }, ...errors } } }, [prefix + '/runs/{run_id}/stop']: { post: { summary: '停止尚未结束的运行', parameters: [{ name: 'run_id', in: 'path', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['user'], properties: { user: { type: 'string' } } } } } }, responses: { '200': { description: '已请求停止；此前写入不会回滚' }, '409': { description: '运行已经结束' }, ...errors } } } }, components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', description: '按单个服务授予的 API Key，请从服务端调用并从环境变量读取。' } } } };
  }
  function snippet(app, language) {
    const url = BASE + '/apps/' + app.id + '/runs', body = { inputs: exampleInputs(app), user: 'customer-001' };
    if (language === 'javascript') return '// 在服务端读取环境变量；此域名仅展示接入合同。\nconst response = await fetch(' + JSON.stringify(url) + ', {\n  method: "POST",\n  headers: {\n    Authorization: `Bearer ${process.env.PEACH_API_KEY}`,\n    "Content-Type": "application/json"\n  },\n  body: JSON.stringify(' + JSON.stringify(body, null, 2) + ')\n});\nconst result = await response.json();\nconsole.log(result.run_id, result.status);';
    if (language === 'python') return '# 在服务端读取环境变量；此域名仅展示接入合同。\nimport json, os, urllib.request\n\npayload = ' + JSON.stringify(JSON.stringify(body)) + '\nrequest = urllib.request.Request(\n    ' + JSON.stringify(url) + ',\n    data=payload.encode("utf-8"),\n    headers={"Authorization": "Bearer " + os.environ["PEACH_API_KEY"],\n             "Content-Type": "application/json"},\n    method="POST"\n)\nwith urllib.request.urlopen(request) as response:\n    result = json.load(response)\n    print(result["run_id"], result["status"])';
    return '# 仅接入示例；请在服务端设置 PEACH_API_KEY。\ncurl --request POST "' + url + '" \\\n  --header "Authorization: Bearer $PEACH_API_KEY" \\\n  --header "Content-Type: application/json" \\\n  --data \'' + JSON.stringify(body, null, 2).replace(/'/g, "'\\''") + '\'';
  }
  if (!S.state.publishing || S.state.publishing.schema !== 1) {
    S.state.publishing = { schema: 1, apps: [], requests: [], keys: [], logs: [] };
    const sample = sources('workflow', 'flow-item')[0];
    if (sample) { const app = createApp({ kind: sample.kind, id: sample.id, version: sample.version, name: '资料摘要服务', description: '将一条资料整理成统一摘要。可在调用方预览中申请 API Key。', accessPolicy: 'request' }); app.status = 'published'; app.example = true; }
  }
  data().requests.forEach(request => { delete request.claiming; });
  data().logs.forEach(log => { const run = log.runId && R.findRun(log.runId); if (run) { log.status = run.status; log.duration = run.duration || 0; } });
  R.subscribe(run => {
    const logs = data().logs.filter(log => log.operation === 'invoke' && log.runId === run.id);
    logs.forEach(log => { log.status = run.status; log.duration = run.duration || now() - run.created; log.tokens = run.tokens || 0; log.cost = run.cost || 0; });
    if (logs.length) { S.save(); if (S.route === 'service') { const result = document.getElementById('pub-play-result'); if (result && ui.play[S.params.id]?.result?.run?.id === run.id) result.innerHTML = resultHtml(ui.play[S.params.id].result); } }
  });
  function pager(length, page, action, size = 8) { const total = Math.max(1, Math.ceil(length / size)); return '<div class="pub-pager"><span>共 ' + length + ' 条 · 第 ' + page + ' / ' + total + ' 页</span><div class="row">' + button('上一页', action, { page: page - 1 }, { attrs: page <= 1 ? 'disabled' : '' }) + button('下一页', action, { page: page + 1 }, { attrs: page >= total ? 'disabled' : '' }) + '</div></div>'; }
  function actorControl() { return '<div class="pub-actor"><span>本地身份预览</span><div class="mode-pill">' + ['owner', 'caller'].map(actor => '<button type="button" data-action="pub-actor" data-id="' + actor + '" class="' + (ui.actor === actor ? 'active' : '') + '" aria-pressed="' + (ui.actor === actor) + '">' + (actor === 'owner' ? '服务所有者' : '调用方') + '</button>').join('') + '</div></div>'; }
  function serviceTable(apps) {
    if (!apps.length) return S.empty(ui.query ? '没有找到服务' : '还没有应用服务', ui.actor === 'owner' ? '先发布一个 Agent 或工作流版本，再为它创建对外服务。' : '可申请的服务及你已获授权的服务会出现在这里。', ui.actor === 'owner' ? button('创建应用服务', 'pub-create', {}, { variant: 'primary', icon: 'plus' }) : '');
    ui.listPage = Math.min(ui.listPage, Math.max(1, Math.ceil(apps.length / 8)));
    return '<div class="panel pub-table-panel"><div class="pub-table-scroll"><table class="pub-table"><thead><tr><th scope="col">应用服务</th><th scope="col">发布来源</th><th scope="col">接入方式</th><th scope="col">状态</th><th scope="col">最近更新</th><th scope="col">操作</th></tr></thead><tbody>' + apps.slice((ui.listPage - 1) * 8, ui.listPage * 8).map(app => '<tr><td><a class="pub-name" href="#service?id=' + E(app.id) + '">' + E(app.name) + '</a><p class="pub-cell-note">' + E(app.description || '尚未添加服务说明') + '</p></td><td>' + S.badge(app.kind === 'workflow' ? '工作流' : 'Agent') + '<span class="pub-cell-note">' + E(current(app)?.sourceVersion || '—') + '</span></td><td>' + E(app.accessPolicy === 'request' ? '申请后调用' : '所有者签发') + '</td><td>' + stateBadge(app.status) + '</td><td class="pub-nowrap">' + E(date(app.updated)) + '</td><td>' + link(ui.actor === 'caller' ? '查看接入' : '管理服务', 'service', { id: app.id, tab: ui.actor === 'caller' ? 'access' : 'overview' }) + '</td></tr>').join('') + '</tbody></table></div>' + pager(apps.length, ui.listPage, 'pub-list-page') + '</div>';
  }
  S.page('services', { title: '发布与 API', section: '对外提供能力', render() {
    const visible = data().apps.filter(canViewApp);
    const apps = visible.filter(app => (!ui.query || (app.name + ' ' + app.description).toLowerCase().includes(ui.query.toLowerCase())) && (ui.filter === 'all' || app.status === ui.filter));
    return S.header('应用服务', '发布与 API', '把已经验证的 Agent 或工作流交给外部系统调用。', ui.actor === 'owner' ? button('创建应用服务', 'pub-create', {}, { variant: 'primary', icon: 'plus' }) : '') + '<div class="pub-context">' + actorControl() + '<p>此处管理向外提供的服务；模型供应商密钥、MCP 连接凭据仍在各自配置中维护。</p></div><div class="toolbar pub-toolbar">' + S.search('pub-service-search', '搜索服务名称或说明', ui.query) + S.tabs([{ id: 'all', label: '全部' }, { id: 'published', label: '已上线' }, { id: 'draft', label: '待发布' }, { id: 'disabled', label: '已停用' }], ui.filter, 'pub-filter') + '</div>' + serviceTable(apps) + '<div class="pub-footnote">本地交互预览：不会开启公网接口或发起外部请求。Key 申请、授权检查、运行与记录在当前浏览器内完成。</div>';
  }, mount(root) { const input = root.querySelector('#pub-service-search'); let composing = false; input?.addEventListener('compositionstart', () => composing = true); input?.addEventListener('compositionend', () => { composing = false; ui.query = input.value.trim(); ui.listPage = 1; S.render(); }); input?.addEventListener('input', () => { if (composing) return; ui.query = input.value.trim(); ui.listPage = 1; const position = input.selectionStart; S.render(); const fresh = document.getElementById('pub-service-search'); fresh?.focus(); try { fresh?.setSelectionRange(position, position); } catch (_) {} }); } });
  function overview(app) {
    const version = current(app), requests = data().requests.filter(request => request.appId === app.id && request.status === 'pending').length;
    return '<div class="pub-overview-grid"><section class="panel pub-panel"><div class="pub-section-head"><div><h2>服务配置</h2><p>外部调用固定使用这里的发布版本。</p></div>' + (ui.actor === 'owner' ? button('编辑说明', 'pub-edit', { id: app.id }, { icon: 'edit', variant: 'ghost' }) : '') + '</div><dl class="pub-definition"><div><dt>来源</dt><dd>' + E(app.kind === 'workflow' ? '工作流' : 'Agent') + ' · ' + E(version.snapshot.title || version.snapshot.name) + '</dd></div><div><dt>当前版本</dt><dd>' + E(version.label) + ' / ' + E(version.sourceVersion) + '</dd></div><div><dt>Key 获取方式</dt><dd>' + E(app.accessPolicy === 'request' ? '调用方申请，所有者审批后领取' : '服务所有者直接签发') + '</dd></div><div><dt>接口地址</dt><dd class="mono pub-wrap">' + E(BASE + '/apps/' + app.id + '/runs') + '</dd></div></dl><div class="notice">运行成功可以没有 outputs 或文件。外部调用先返回 run_id，再按终端用户查询运行状态、操作回执与可选结果。</div></section><section class="panel pub-panel"><div class="pub-section-head"><div><h2>接入准备</h2><p>按顺序完成一次端到端调用。</p></div></div><ol class="pub-checklist"><li><span class="pub-step">1</span><div><strong>发布固定版本</strong><p>' + E(app.status === 'published' ? '服务已上线；修改编辑草稿不会影响当前服务。' : '上线后才能签发 Key 或接受调用。') + '</p></div>' + stateBadge(app.status) + '</li><li><span class="pub-step">2</span><div><strong>签发或申请 API Key</strong><p>' + (requests ? requests + ' 条申请等待所有者审批。' : '每个 Key 只授权此服务，可限制权限、有效期和额度。') + '</p></div>' + link('管理 Key', 'service', { id: app.id, tab: 'keys' }) + '</li><li><span class="pub-step">3</span><div><strong>验证请求与结果</strong><p>按实际输入 Schema 测试，查看同一次调用的 Trace。</p></div>' + link('打开调试台', 'service', { id: app.id, tab: 'access' }) + '</li></ol></section></div><section class="panel pub-panel pub-section-space"><div class="pub-section-head"><div><h2>发布版本</h2><p>切换只影响后续新调用，正在运行的任务保留原快照。</p></div>' + (ui.actor === 'owner' ? button('发布新版本', 'pub-version-new', { id: app.id }, { icon: 'plus' }) : '') + '</div><div class="pub-version-list">' + app.versions.map(item => '<div><span><strong>' + E(item.label) + '</strong><small>来源 ' + E(item.sourceVersion) + ' · ' + E(date(item.created)) + '</small></span>' + (item.id === app.activeVersionId ? S.badge('当前使用', 'success') : ui.actor === 'owner' ? button('切换到此版本', 'pub-version-switch', { id: app.id, version: item.id }, { variant: 'ghost' }) : '') + '</div>').join('') + '</div></section><div class="pub-schema-grid pub-section-space"><details class="panel pub-panel"><summary>输入 Schema</summary>' + code(version.inputSchema) + '</details><details class="panel pub-panel"><summary>结果合同</summary>' + code(version.outputSchema) + '</details></div>';
  }
  function keyRows(app) {
    const keys = data().keys.filter(key => key.appId === app.id && actorKey(key));
    ui.keyPage = Math.min(ui.keyPage, Math.max(1, Math.ceil(keys.length / 8)));
    if (!keys.length) return S.empty('还没有 API Key', ui.actor === 'owner' ? '签发一个 Key，选择权限、有效期和调用额度。' : '先提交申请，批准后在下方申请记录中领取。');
    return '<div class="pub-table-scroll"><table class="pub-table"><thead><tr><th scope="col">名称与标识</th><th scope="col">权限</th><th scope="col">调用额度</th><th scope="col">到期时间</th><th scope="col">状态</th><th scope="col">操作</th></tr></thead><tbody>' + keys.slice((ui.keyPage - 1) * 8, ui.keyPage * 8).map(key => '<tr><td><strong>' + E(key.name) + '</strong><span class="pub-cell-note mono">pa_demo_••••' + E(key.suffix) + '</span><span class="pub-cell-note">' + E(key.consumer === 'owner' ? '所有者签发' : '调用方申请') + '</span></td><td>' + key.permissions.map(scope => '<span class="pub-scope">' + E(scopeNames[scope]) + '</span>').join('') + '</td><td><span>' + key.rateLimit + ' 次/分钟</span><span class="pub-cell-note">' + key.usage.dayCount + ' / ' + key.dayQuota + ' 次/日</span></td><td class="pub-nowrap">' + E(date(key.expiresAt)) + '</td><td>' + stateBadge(keyState(key)) + '</td><td><div class="pub-actions">' + (['active', 'disabled'].includes(keyState(key)) ? button(key.status === 'active' ? '停用' : '启用', 'pub-key-state', { id: key.id, state: key.status === 'active' ? 'disabled' : 'active' }, { variant: 'ghost' }) : '') + (key.status !== 'revoked' ? (!['expired', 'revoked'].includes(keyState(key)) ? button('轮换', 'pub-key-rotate', { id: key.id }, { variant: 'ghost' }) : '') + button('吊销', 'pub-key-state', { id: key.id, state: 'revoked' }, { variant: 'ghost' }) : '') + '</div></td></tr>').join('') + '</tbody></table></div>' + pager(keys.length, ui.keyPage, 'pub-key-page');
  }
  function requestRows(app) {
    const requests = data().requests.filter(request => request.appId === app.id); ui.requestPage = Math.min(ui.requestPage, Math.max(1, Math.ceil(requests.length / 8)));
    if (!requests.length) return '<p class="pub-muted-pad">尚无申请。切换到调用方预览，可以体验提交、审批和领取流程。</p>';
    return '<div class="pub-table-scroll"><table class="pub-table"><thead><tr><th scope="col">申请与用途</th><th scope="col">申请范围</th><th scope="col">状态</th><th scope="col">时间</th><th scope="col">操作</th></tr></thead><tbody>' + requests.slice((ui.requestPage - 1) * 8, ui.requestPage * 8).map(request => '<tr><td><strong>' + E(request.name) + '</strong><p class="pub-cell-note">' + E(request.purpose) + '</p>' + (request.reason ? '<p class="pub-cell-note">处理说明：' + E(request.reason) + '</p>' : '') + '</td><td>' + E(request.permissions.map(scope => scopeNames[scope]).join('、')) + '<span class="pub-cell-note">' + request.rateLimit + ' 次/分钟 · ' + request.dayQuota + ' 次/日 · ' + request.days + ' 天</span></td><td>' + stateBadge(request.status) + '</td><td class="pub-nowrap">' + E(date(request.created)) + '</td><td><div class="pub-actions">' + (request.status === 'pending' ? ui.actor === 'owner' ? button('审批', 'pub-request-review', { id: request.id }, { variant: 'primary' }) : button('取消申请', 'pub-request-cancel', { id: request.id }, { variant: 'ghost' }) : request.status === 'approved' && ui.actor === 'caller' ? button('领取 Key', 'pub-request-claim', { id: request.id }, { variant: 'primary' }) : request.status === 'claimed' ? '<span class="small muted">已关联密钥</span>' : '') + '</div></td></tr>').join('') + '</tbody></table></div>' + pager(requests.length, ui.requestPage, 'pub-request-page');
  }
  function keysPanel(app) {
    const canRequest = app.status === 'published' && app.accessPolicy === 'request';
    return '<section class="panel pub-panel"><div class="pub-section-head"><div><h2>API Key</h2><p>仅用于调用此服务。完整 Key 只在签发或轮换时显示一次。</p></div>' + (ui.actor === 'owner' ? button('签发 API Key', 'pub-key-new', { id: app.id }, { variant: 'primary', icon: 'plus', attrs: app.status !== 'published' ? 'disabled title="先上线服务"' : '' }) : button('申请 API Key', 'pub-key-request', { id: app.id }, { variant: 'primary', icon: 'plus', attrs: !canRequest ? 'disabled title="服务当前未开放新申请"' : '' })) + '</div>' + (app.status !== 'published' ? '<div class="notice warning">服务尚未上线，暂不能签发或领取 Key；已有 Key 的调用也会被拒绝。</div>' : '') + keyRows(app) + '</section><section class="panel pub-panel pub-section-space"><div class="pub-section-head"><div><h2>' + (ui.actor === 'owner' ? '接入申请' : '我的申请') + '</h2><p>' + (ui.actor === 'owner' ? '核对调用用途，按申请范围批准或说明驳回原因。' : '批准后由你领取密钥；所有者不会再次看到完整 Key。') + '</p></div>' + (ui.actor === 'owner' ? button('预览调用方申请', 'pub-actor', { id: 'caller' }, { variant: 'ghost' }) : button('预览所有者审批', 'pub-actor', { id: 'owner' }, { variant: 'ghost' })) + '</div>' + requestRows(app) + '</section>';
  }
  function playState(app) { if (!ui.play[app.id]) ui.play[app.id] = { inputText: JSON.stringify(exampleInputs(app), null, 2), user: 'customer-001', keyId: '', method: 'session', result: null }; return ui.play[app.id]; }
  function resultHtml(result) {
    if (!result) return '<div class="pub-result-empty">' + S.icon('terminal', 24) + '<strong>等待一次请求</strong><p>校验 Key、输入与额度后，创建可追踪的本地运行。</p></div>';
    const run = result.run, body = run ? { request_id: result.log.id, ...responseBody(run) } : result.body;
    return '<div class="pub-result-head"><strong>HTTP ' + result.httpStatus + '</strong>' + (run ? stateBadge(run.status) : S.badge(body.error?.code || '请求失败', 'danger')) + '</div><p class="small muted">' + (result.httpStatus === 202 ? '请求已接受。下方展示同一运行的当前状态；公网接入时使用 run_id 查询。' : '请求未创建运行，可修正参数后重新调用。') + '</p>' + code(body) + (run ? '<div class="pub-actions">' + link('查看运行与 Trace', 'task', { id: run.id }) + (!terminal(run.status) ? button('停止此运行', 'pub-stop-run', { app: result.log.appId, run: run.id }, { variant: 'secondary' }) : '') + '</div>' : '');
  }
  function accessPanel(app) {
    const play = playState(app), available = data().keys.filter(key => key.appId === app.id && actorKey(key));
    return '<div class="notice pub-access-note">API 文档面向服务端接入。示例域名不提供网络服务；下方调试会在本地校验并运行当前发布快照。</div><div class="pub-access-grid"><section class="panel pub-panel"><div class="pub-section-head"><div><h2>请求示例</h2><p>用固定的 user 标识调用方的最终用户。</p></div>' + button('导出 OpenAPI', 'pub-openapi', { id: app.id }, { variant: 'ghost', icon: 'download' }) + '</div>' + S.tabs([{ id: 'curl', label: 'cURL' }, { id: 'javascript', label: 'JavaScript' }, { id: 'python', label: 'Python' }], ui.language, 'pub-language') + code(snippet(app, ui.language)) + '<div class="pub-example-actions">' + button('复制示例', 'pub-copy-example', { id: app.id }, { icon: 'copy' }) + '</div><details class="pub-contract"><summary>查看输入字段与错误说明</summary>' + code(current(app).inputSchema) + '<dl class="pub-error-list"><div><dt>401</dt><dd>Key 缺失、无效、停用、过期或吊销</dd></div><div><dt>403</dt><dd>服务作用域、权限或最终用户不匹配</dd></div><div><dt>422</dt><dd>输入不符合发布版本的 Schema</dd></div><div><dt>429</dt><dd>达到分钟或日额度</dd></div><div><dt>503</dt><dd>服务未上线、停用或依赖不可用</dd></div></dl></details></section><section class="panel pub-panel"><div class="pub-section-head"><div><h2>接入调试</h2><p>执行真实前端路径，外部工具仍使用模拟适配器。</p></div>' + S.badge('本地模拟', 'info') + '</div><form id="pub-playground-form" data-form="pub-playground" novalidate data-app="' + E(app.id) + '">' + select('鉴权方式', 'pub-auth-method', play.method, [{ id: 'session', label: '使用本次会话已签发的 Key' }, { id: 'manual', label: '手动输入 Key' }]) + '<div id="pub-session-key"' + (play.method !== 'session' ? ' hidden' : '') + '>' + select('API Key', 'pub-play-key', play.keyId || available[0]?.id || '', [{ id: '', label: '请选择 Key' }, ...available.map(key => ({ id: key.id, label: key.name + ' · ' + keyState(key) + (ui.secrets.has(key.id) ? '' : ' · 请手动输入或轮换') }))]) + '</div><div id="pub-manual-key"' + (play.method !== 'manual' ? ' hidden' : '') + '><div class="field"><label class="field-label" for="pub-play-credential">API Key</label><div class="pub-secret-input"><input id="pub-play-credential" name="pub-play-credential" class="input" type="password" autocomplete="off" placeholder="pa_demo_…" aria-describedby="pub-play-credential-error"><button type="button" class="icon-btn" data-action="pub-toggle-secret" data-id="pub-play-credential" aria-label="显示 API Key" aria-pressed="false">' + S.icon('eye', 16) + '</button></div><p class="field-error" id="pub-play-credential-error"></p></div></div>' + S.field('终端用户 user', { id: 'pub-play-user', name: 'pub-play-user', value: play.user, required: true, help: '用同一个标识查询该用户的运行，不填写邮箱或手机号等敏感信息。' }) + area('业务输入 inputs（JSON）', 'pub-play-input', play.inputText) + formError() + '<button type="submit" class="btn btn-primary"' + (play.busy ? ' disabled aria-busy="true"' : '') + '>' + S.icon('play', 14) + '<span>' + (play.busy ? '校验请求中' : '发送模拟请求') + '</span></button></form><div class="pub-play-result" id="pub-play-result" aria-live="polite">' + resultHtml(play.result) + '</div></section></div>';
  }
  function logsPanel(app) {
    const logs = data().logs.filter(log => log.appId === app.id && (ui.actor === 'owner' || log.consumer === 'caller'));
    ui.logPage = Math.min(ui.logPage, Math.max(1, Math.ceil(logs.length / 10)));
    return '<section class="panel pub-panel"><div class="pub-section-head"><div><h2>调用记录</h2><p>保留最近 300 条本地请求。鉴权失败、Schema 错误与实际运行分别记录；不保存完整 Key。</p></div>' + button('刷新', 'pub-refresh', {}, { icon: 'refresh', variant: 'ghost' }) + '</div>' + (logs.length ? '<div class="pub-table-scroll"><table class="pub-table"><thead><tr><th scope="col">请求</th><th scope="col">调用身份</th><th scope="col">HTTP</th><th scope="col">运行状态</th><th scope="col">版本 / 用量</th><th scope="col">追踪</th></tr></thead><tbody>' + logs.slice((ui.logPage - 1) * 10, ui.logPage * 10).map(log => '<tr><td><span class="mono pub-request-id">' + E(log.id) + '</span><span class="pub-cell-note">' + E(date(log.created)) + ' · ' + E(log.operation) + '</span></td><td>' + E(log.keyName || '未通过鉴权') + '<span class="pub-cell-note">user: ' + E(log.user || '未提供') + '</span></td><td>' + S.badge(String(log.httpStatus || '—'), log.httpStatus >= 400 ? 'danger' : 'success') + '</td><td>' + stateBadge(log.status) + (log.errorCode ? '<span class="pub-cell-note">' + E(log.errorCode) + '</span>' : '') + '</td><td>' + E(log.releaseLabel || '—') + '<span class="pub-cell-note">' + (log.tokens || 0) + ' Token · ' + (log.duration || 0) + ' ms</span></td><td>' + (log.runId ? link('运行详情', 'task', { id: log.runId }) : button('查看错误', 'pub-log-error', { id: log.id }, { variant: 'ghost' })) + '</td></tr>').join('') + '</tbody></table></div>' + pager(logs.length, ui.logPage, 'pub-log-page', 10) : S.empty('尚无调用记录', '在接入调试中完成一次请求后，可在这里追踪输入验证、运行和结果。', link('打开调试台', 'service', { id: app.id, tab: 'access' }))) + '</section>';
  }
  S.page('service', { title: '应用服务', section: '对外提供能力', render() {
    const app = appBy(S.params.id); if (!app || !canViewApp(app)) return S.empty('找不到应用服务', '该服务不存在，请返回列表。', link('返回服务列表', 'services'));
    const tab = ['overview', 'access', 'keys', 'logs'].includes(S.params.tab) ? S.params.tab : 'overview';
    const actions = ui.actor === 'owner' ? link('打开源配置', app.kind === 'workflow' ? 'workflow' : 'agent', { id: app.sourceId }, 'edit') + button(app.status === 'published' ? '停用服务' : '上线服务', 'pub-service-state', { id: app.id, state: app.status === 'published' ? 'disabled' : 'published' }, { variant: app.status === 'published' ? 'secondary' : 'primary', icon: app.status === 'published' ? 'pause' : 'globe' }) : button('申请 API Key', 'pub-key-request', { id: app.id }, { variant: 'primary', attrs: app.accessPolicy !== 'request' || app.status !== 'published' ? 'disabled title="暂未开放申请"' : '' });
    return '<a class="pub-back" href="#services">' + S.icon('arrow', 13) + '返回应用服务</a>' + S.header(app.kind === 'workflow' ? '工作流服务' : 'Agent 服务', app.name, app.description, actions) + '<div class="pub-detail-bar">' + stateBadge(app.status) + '<span>' + E(current(app)?.label) + ' / ' + E(current(app)?.sourceVersion) + '</span>' + actorControl() + '</div>' + S.tabs([{ id: 'overview', label: '概览与版本' }, { id: 'access', label: 'API 接入' }, { id: 'keys', label: 'Key 与申请', count: data().requests.filter(request => request.appId === app.id && request.status === 'pending').length || undefined }, { id: 'logs', label: '调用记录' }], tab, 'pub-detail-tab') + '<div class="pub-tab-body">' + (tab === 'overview' ? overview(app) : tab === 'access' ? accessPanel(app) : tab === 'keys' ? keysPanel(app) : logsPanel(app)) + '</div>';
  }, mount(root) {
    const app = appBy(S.params.id); if (!app || !root.querySelector('#pub-playground-form')) return;
    const play = playState(app), form = root.querySelector('#pub-playground-form');
    form.addEventListener('input', event => { const id = event.target.id; if (id === 'pub-play-input') play.inputText = event.target.value; if (id === 'pub-play-user') play.user = event.target.value; });
    form.addEventListener('change', event => { if (event.target.id === 'pub-play-key') play.keyId = event.target.value; if (event.target.id === 'pub-auth-method') { play.method = event.target.value; document.getElementById('pub-session-key').hidden = play.method !== 'session'; document.getElementById('pub-manual-key').hidden = play.method !== 'manual'; const credential = document.getElementById('pub-play-credential'); if (credential) credential.value = ''; } });
    return () => { const credential = form.querySelector('#pub-play-credential'); if (credential) credential.value = ''; };
  } });
  function openCreate(options = {}) {
    assertOwner(); const choices = sources(options.kind, options.id); if (!choices.length) { S.modal({ title: '先发布一个可调用版本', subtitle: '应用服务使用固定版本，编辑草稿暂不能对外提供调用。', body: '<p>先在 Agent 或工作流编辑器保存并发布，再从这里创建服务。</p>', footer: button('关闭', 'modal-close') + link(options.kind === 'agent' ? '打开 Agent' : '打开工作流', options.kind === 'agent' ? options.id ? 'agent' : 'agents' : options.id ? 'workflow' : 'workflows', options.id ? { id: options.id } : {}) }); return; }
    const chosen = choices[0];
    S.modal({ title: '创建应用服务', subtitle: '选择已经发布的能力，为外部系统提供稳定的接入入口。', body: '<form data-form="pub-create" id="pub-create-form" novalidate>' + select('来源与发布版本', 'pub-source', chosen.key, choices.map(source => ({ id: source.key, label: (source.kind === 'workflow' ? '工作流 · ' : 'Agent · ') + source.name + ' / ' + source.version }))) + S.field('服务名称', { id: 'pub-name', name: 'pub-name', value: chosen.name + '服务', required: true }) + area('服务说明', 'pub-description', '') + select('Key 获取方式', 'pub-policy', 'private', [{ id: 'private', label: '所有者直接签发' }, { id: 'request', label: '开放申请，由所有者审批' }]) + formError() + '</form>', footer: button('取消', 'modal-close') + '<button type="submit" form="pub-create-form" class="btn btn-primary">创建服务</button>' });
  }
  function permissionChoices() { return [{ id: 'invoke,read', label: '发起调用、读取结果' }, { id: 'invoke,read,stop', label: '发起调用、读取结果、停止运行' }, { id: 'read', label: '只读运行结果' }]; }
  function grantFields(value = {}) { return S.field('Key 名称', { id: 'pub-key-name', name: 'pub-key-name', value: value.name || '', required: true, placeholder: '例如：业务系统生产调用' }) + area('调用用途', 'pub-key-purpose', value.purpose || '') + select('权限', 'pub-key-scope', (value.permissions || ['invoke', 'read']).join(','), permissionChoices()) + '<div class="pub-form-grid">' + S.field('每分钟最多调用次数', { id: 'pub-key-rate', name: 'pub-key-rate', type: 'number', value: value.rateLimit || 60 }) + S.field('每日最多调用次数', { id: 'pub-key-quota', name: 'pub-key-quota', type: 'number', value: value.dayQuota || 1000 }) + S.field('有效期（天）', { id: 'pub-key-days', name: 'pub-key-days', type: 'number', value: value.days || 30 }) + '</div>'; }
  function valuesFrom(form) { const v = name => form.elements.namedItem(name)?.value || ''; return { name: v('pub-key-name'), purpose: v('pub-key-purpose'), permissions: v('pub-key-scope').split(','), rateLimit: Number(v('pub-key-rate')), dayQuota: Number(v('pub-key-quota')), days: Number(v('pub-key-days')) }; }
  function openKeyForm(appId, request) { const app = requireApp(appId); S.modal({ title: request ? '申请 API Key' : '签发 API Key', subtitle: app.name + ' · 此 Key 只可访问当前服务', body: '<form data-form="pub-key-form" id="pub-key-form" data-app="' + E(app.id) + '" data-request="' + request + '" novalidate>' + grantFields() + '<div class="notice">' + (request ? '提交后由服务所有者审批，批准后由你领取。' : '完整 Key 仅显示一次；原型只持久保存指纹和管理信息。') + '</div>' + formError() + '</form>', footer: button('取消', 'modal-close') + '<button type="submit" form="pub-key-form" class="btn btn-primary">' + (request ? '提交申请' : '生成 API Key') + '</button>' }); }
  function showIssued(issued) {
    S.modal({ title: 'API Key 已生成', subtitle: issued.key.name + ' · 请现在保存，关闭后不再显示完整 Key。', body: '<div class="notice warning">这是仅用于本地原型的演示凭据。上线产品应由服务端签发、校验并保存哈希。</div><div class="field pub-issued"><label class="field-label" for="pub-issued-secret">完整 Key（仅此一次）</label><input id="pub-issued-secret" class="input mono" type="password" readonly autocomplete="off" aria-describedby="pub-issued-help"><p class="field-help" id="pub-issued-help">可复制到你的密码管理器；原型刷新后只保留 Key 指纹及末位。</p></div><div class="pub-actions">' + button('显示 Key', 'pub-reveal-issued', {}, { icon: 'eye' }) + button('复制 Key', 'pub-copy-issued', {}, { icon: 'copy' }) + '</div>', footer: button('已保存，关闭', 'modal-close', {}, { variant: 'primary' }), onOpen(dialog) { ui.activeIssue = { id: issued.key.id, credential: issued.credential }; const input = dialog.querySelector('#pub-issued-secret'); if (input) input.value = issued.credential; }, onClose() { const input = document.getElementById('pub-issued-secret'); if (input) input.value = ''; ui.activeIssue = null; } });
  }
  async function submitOnce(form, task) { if (form.dataset.busy === 'true') return; form.dataset.busy = 'true'; const buttons = [...form.querySelectorAll('button[type="submit"]'), ...document.querySelectorAll('button[form="' + form.id + '"]')]; buttons.forEach(item => { item.disabled = true; item.setAttribute('aria-busy', 'true'); }); try { await task(); } catch (exception) { failure(exception); } finally { delete form.dataset.busy; buttons.forEach(item => { item.disabled = false; item.removeAttribute('aria-busy'); }); } }
  S.form('pub-create', form => { try { if (!S.validate(form, { 'pub-name': value => !value || value.length > 80 ? '请填写 1—80 个字符的服务名称。' : '' })) return; const source = sources().find(item => item.key === form.elements.namedItem('pub-source').value); if (!source) throw error('SOURCE_CHANGED', '来源版本已变化，请重新选择。'); const app = createApp({ kind: source.kind, id: source.id, version: source.version, name: form.elements.namedItem('pub-name').value, description: form.elements.namedItem('pub-description').value, accessPolicy: form.elements.namedItem('pub-policy').value }); S.closeModal(); S.go('service', { id: app.id }); S.toast('服务已创建，请核对后上线'); } catch (exception) { failure(exception); } });
  S.form('pub-key-form', form => submitOnce(form, async () => { const values = valuesFrom(form); if (!S.validate(form, { 'pub-key-name': '请填写 Key 名称。', 'pub-key-rate': value => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 600 ? '' : '填写 1—600 的整数。', 'pub-key-quota': value => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 100000 ? '' : '填写 1—100000 的整数。', 'pub-key-days': value => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 365 ? '' : '填写 1—365 的整数。', ...(form.dataset.request === 'true' ? { 'pub-key-purpose': '请说明调用用途。' } : {}) })) return; if (form.dataset.request === 'true') { requestKey(form.dataset.app, values); S.closeModal(); S.render(); S.toast('申请已提交，等待服务所有者审批'); } else { const issued = await issueKey(form.dataset.app, values); S.closeModal(); S.render(); showIssued(issued); } }));
  S.form('pub-edit', form => { try { if (!S.validate(form, { 'pub-name': '请填写服务名称。' })) return; updateApp(form.dataset.app, { name: form.elements.namedItem('pub-name').value, description: form.elements.namedItem('pub-description').value, accessPolicy: form.elements.namedItem('pub-policy').value }); S.closeModal(); S.render(); S.toast('服务说明已保存'); } catch (exception) { failure(exception); } });
  S.form('pub-version', form => { try { const source = sources().find(item => item.key === form.elements.namedItem('pub-version-source').value); if (!source) throw error('SOURCE_CHANGED', '请选择存在的发布版本。'); addVersion(form.dataset.app, source.version); delete ui.play[form.dataset.app]; S.closeModal(); S.render(); S.toast('服务已切换到新发布版本'); } catch (exception) { failure(exception); } });
  S.form('pub-review', form => { try { const approved = form.elements.namedItem('pub-review-decision').value === 'approve'; reviewRequest(form.dataset.request, approved, { ...valuesFrom(form), reason: form.elements.namedItem('pub-review-reason').value }); S.closeModal(); S.render(); S.toast(approved ? '申请已批准，等待调用方领取' : '申请已驳回'); } catch (exception) { failure(exception); } });
  S.form('pub-playground', form => submitOnce(form, async () => { const app = requireApp(form.dataset.app), play = playState(app); if (!S.validate(form, { 'pub-play-user': '请填写终端用户标识。', 'pub-play-input': value => { try { const parsed = JSON.parse(value); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? '' : '请填写 JSON 对象。'; } catch (_) { return 'JSON 格式不正确，请修正后重试。'; } } })) return; const inputs = JSON.parse(form.elements.namedItem('pub-play-input').value); play.user = form.elements.namedItem('pub-play-user').value.trim(); play.keyId = form.elements.namedItem('pub-play-key').value; play.method = form.elements.namedItem('pub-auth-method').value; play.inputText = form.elements.namedItem('pub-play-input').value; const credential = form.elements.namedItem('pub-play-credential').value; play.busy = true; try { play.result = await invoke(app.id, { inputs, user: play.user, keyId: play.keyId, useSession: play.method === 'session', ...(play.method === 'manual' ? { credential } : {}) }); const target = document.getElementById('pub-play-result'); if (target) target.innerHTML = resultHtml(play.result); } finally { play.busy = false; } }));
  S.action('pub-create', () => openCreate());
  S.action('pub-actor', el => { ui.actor = el.dataset.id === 'caller' ? 'caller' : 'owner'; ui.keyPage = ui.logPage = ui.requestPage = ui.listPage = 1; S.render(); });
  S.action('pub-filter', el => { ui.filter = el.dataset.id; ui.listPage = 1; S.render(); });
  S.action('pub-detail-tab', el => S.go('service', { id: S.params.id, tab: el.dataset.id }));
  S.action('pub-refresh', () => S.render());
  for (const [action, property] of [['pub-list-page', 'listPage'], ['pub-key-page', 'keyPage'], ['pub-request-page', 'requestPage'], ['pub-log-page', 'logPage']]) S.action(action, el => { ui[property] = Math.max(1, Number(el.dataset.page) || 1); S.render(); });
  S.action('pub-service-state', el => { const app = requireApp(el.dataset.id), state = el.dataset.state; S.modal({ title: (state === 'published' ? '上线 ' : '停用 ') + app.name + '？', subtitle: state === 'published' ? '后续新调用使用当前服务发布快照。' : '新的 API 请求将被拒绝；正在运行的任务不会自动回滚或停止。', body: '<div class="notice">' + E(current(app).label + ' · 来源 ' + current(app).sourceVersion) + '</div>', footer: button('取消', 'modal-close') + button(state === 'published' ? '上线服务' : '停用服务', 'pub-service-confirm', { id: app.id, state }, { variant: state === 'published' ? 'primary' : 'danger' }) }); });
  S.action('pub-service-confirm', el => { try { changeStatus(el.dataset.id, el.dataset.state); S.closeModal(); S.render(); S.toast(el.dataset.state === 'published' ? '服务已上线' : '服务已停用'); } catch (exception) { failure(exception); } });
  S.action('pub-edit', el => { assertOwner(); const app = requireApp(el.dataset.id); S.modal({ title: '编辑服务说明', body: '<form data-form="pub-edit" id="pub-edit-form" data-app="' + E(app.id) + '" novalidate>' + S.field('服务名称', { id: 'pub-name', name: 'pub-name', value: app.name, required: true }) + area('服务说明', 'pub-description', app.description) + select('Key 获取方式', 'pub-policy', app.accessPolicy, [{ id: 'private', label: '所有者直接签发' }, { id: 'request', label: '调用方申请，所有者审批' }]) + '<p class="field-help">关闭新申请不会吊销已有 Key，已有授权需在 Key 列表单独处理。</p>' + formError() + '</form>', footer: button('取消', 'modal-close') + '<button class="btn btn-primary" type="submit" form="pub-edit-form">保存说明</button>' }); });
  S.action('pub-version-new', el => { assertOwner(); const app = requireApp(el.dataset.id), choices = sources(app.kind, app.sourceId); S.modal({ title: '发布新的服务版本', subtitle: '只选择来源中已发布的版本；创建后切换后续新调用。', body: '<form data-form="pub-version" id="pub-version-form" data-app="' + E(app.id) + '" novalidate>' + select('来源发布版本', 'pub-version-source', choices[0]?.key || '', choices.map(source => ({ id: source.key, label: source.name + ' / ' + source.version }))) + formError() + '</form>', footer: button('取消', 'modal-close') + '<button class="btn btn-primary" type="submit" form="pub-version-form"' + (!choices.length ? ' disabled' : '') + '>发布并切换</button>' }); });
  S.action('pub-version-switch', el => S.modal({ title: '切换服务版本？', subtitle: '正在运行的任务保留原版本，新的调用使用所选版本及输入合同。', body: '<div class="notice warning">请确认外部调用方能够处理此版本的输入与返回结构。</div>', footer: button('取消', 'modal-close') + button('切换版本', 'pub-version-confirm', { id: el.dataset.id, version: el.dataset.version }, { variant: 'primary' }) }));
  S.action('pub-version-confirm', el => { try { activateVersion(el.dataset.id, el.dataset.version); delete ui.play[el.dataset.id]; S.closeModal(); S.render(); S.toast('服务版本已切换'); } catch (exception) { failure(exception); } });
  S.action('pub-key-new', el => openKeyForm(el.dataset.id, false)); S.action('pub-key-request', el => openKeyForm(el.dataset.id, true));
  S.action('pub-request-review', el => { assertOwner(); const request = data().requests.find(item => item.id === el.dataset.id); if (!request) return; S.modal({ title: '审批 API Key 申请', subtitle: request.applicant + ' · 可收窄申请范围', wide: true, body: '<form data-form="pub-review" id="pub-review-form" data-request="' + E(request.id) + '" novalidate>' + grantFields(request) + select('审批结果', 'pub-review-decision', 'approve', [{ id: 'approve', label: '批准，允许调用方领取' }, { id: 'reject', label: '驳回，说明原因' }]) + area('处理说明（驳回时必填）', 'pub-review-reason', '') + formError() + '</form>', footer: button('取消', 'modal-close') + '<button class="btn btn-primary" type="submit" form="pub-review-form">保存审批结果</button>' }); });
  S.action('pub-request-cancel', el => S.modal({ title: '取消这次申请？', subtitle: '取消后，所有者不能继续审批；你可以重新申请。', footer: button('保留申请', 'modal-close') + button('取消申请', 'pub-request-cancel-confirm', { id: el.dataset.id }, { variant: 'danger' }) }));
  S.action('pub-request-cancel-confirm', el => { try { cancelRequest(el.dataset.id); S.closeModal(); S.render(); S.toast('申请已取消'); } catch (exception) { failure(exception); } });
  S.action('pub-request-claim', async el => { try { const issued = await claimKey(el.dataset.id); S.render(); showIssued(issued); } catch (exception) { failure(exception); } });
  S.action('pub-key-state', el => { const key = requireManagedKey(el.dataset.id), state = el.dataset.state; S.modal({ title: (state === 'revoked' ? '吊销 ' : state === 'active' ? '启用 ' : '停用 ') + key.name + '？', subtitle: state === 'revoked' ? '此 Key 将立即失效，无法恢复。需要继续接入时请重新签发。' : state === 'disabled' ? '此 Key 的后续请求将被拒绝；已有运行保持当前状态。' : '此 Key 将恢复在原作用域、额度和有效期内的调用。', body: '<p class="mono">pa_demo_••••' + E(key.suffix) + '</p>', footer: button('取消', 'modal-close') + button(state === 'revoked' ? '吊销 Key' : state === 'active' ? '启用 Key' : '停用 Key', 'pub-key-confirm', { id: key.id, state }, { variant: state === 'active' ? 'primary' : 'danger' }) }); });
  S.action('pub-key-confirm', el => { try { setKeyStatus(el.dataset.id, el.dataset.state); S.closeModal(); S.render(); S.toast('Key 状态已更新'); } catch (exception) { failure(exception); } });
  S.action('pub-key-rotate', el => { const key = requireManagedKey(el.dataset.id); S.modal({ title: '轮换 ' + key.name + '？', subtitle: '生成新 Key 后，旧 Key 立即失效。请同步更新调用方配置。', body: '<div class="notice warning">权限和额度不扩大；完整的新 Key 仅显示一次。</div>', footer: button('取消', 'modal-close') + button('轮换 Key', 'pub-key-rotate-confirm', { id: key.id }, { variant: 'primary' }) }); });
  S.action('pub-key-rotate-confirm', async el => { try { const issued = await rotateKey(el.dataset.id); S.closeModal(); S.render(); showIssued(issued); } catch (exception) { failure(exception); } });
  S.action('pub-reveal-issued', el => { const input = document.getElementById('pub-issued-secret'); if (!input) return; input.type = input.type === 'password' ? 'text' : 'password'; el.querySelector('span').textContent = input.type === 'password' ? '显示 Key' : '隐藏 Key'; el.setAttribute('aria-pressed', String(input.type === 'text')); });
  S.action('pub-copy-issued', async () => { if (!ui.activeIssue) return; try { await navigator.clipboard.writeText(ui.activeIssue.credential); S.toast('已复制 API Key'); } catch (_) { const input = document.getElementById('pub-issued-secret'); if (input) { input.type = 'text'; input.focus(); input.select(); } S.toast('请选中当前字段复制', 'info'); } });
  S.action('pub-toggle-secret', el => { const input = document.getElementById(el.dataset.id); if (!input) return; input.type = input.type === 'password' ? 'text' : 'password'; el.setAttribute('aria-label', input.type === 'password' ? '显示 API Key' : '隐藏 API Key'); el.setAttribute('aria-pressed', String(input.type === 'text')); });
  S.action('pub-language', el => { ui.language = el.dataset.id; S.render(); }); S.action('pub-copy-example', el => S.copy(snippet(requireApp(el.dataset.id), ui.language)));
  S.action('pub-openapi', el => { const app = requireApp(el.dataset.id); S.download(app.name.replace(/[\\/:*?"<>|]/g, '_') + '-openapi.json', JSON.stringify(openApi(app.id), null, 2), 'application/json'); });
  S.action('pub-log-error', el => { const log = data().logs.find(item => item.id === el.dataset.id); if (log) S.modal({ title: '请求未被接受', subtitle: log.id, body: code({ status: log.httpStatus, code: log.errorCode, message: log.message }), footer: button('关闭', 'modal-close') }); });
  S.action('pub-stop-run', async el => { const app = requireApp(el.dataset.app), play = playState(app); const credential = document.getElementById('pub-play-credential')?.value || ''; const result = await stopRun(app.id, el.dataset.run, { user: play.user, keyId: play.keyId, useSession: play.method === 'session', ...(play.method === 'manual' ? { credential } : {}) }); if (result.httpStatus >= 400) S.modal({ title: '无法停止运行', body: code(result.body), footer: button('关闭', 'modal-close') }); else { const target = document.getElementById('pub-play-result'); if (target) target.innerHTML = resultHtml(play.result); S.toast('运行已停止，已完成的操作回执保留'); } });
  S.Publishing = { sources, createApp, updateApp, changeStatus, addVersion, activateVersion, issueKey, requestKey, reviewRequest, cancelRequest, claimKey, setKeyStatus, rotateKey, invoke, readRun, stopRun, openApi, openCreate, keyState, current, setActor(actor) { ui.actor = actor === 'caller' ? 'caller' : 'owner'; }, get actor() { return ui.actor; }, clearSession() { ui.secrets.clear(); ui.activeIssue = null; }, get apps() { return data().apps; }, get keys() { return data().keys; }, get requests() { return data().requests; }, get logs() { return data().logs; } };
  S.save();
})();
