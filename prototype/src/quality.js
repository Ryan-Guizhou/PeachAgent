(function () {
  'use strict';
  const S = window.Studio, R = S.Runtime, E = S.escape;
  const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const now = () => Date.now();
  const uid = prefix => S.uid(prefix);
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const states = ['done', 'failed', 'stopped', 'rejected'];
  const ui = { queries: {}, selected: new Set(), selectionOwner: '', importDraft: null };
  const workers = new Map();
  const labels = { done: '已完成', running: '评测中', stopped: '已停止', passed: '通过', failed: '未通过', error: '执行错误', blocked: '受保护阻断', queued: '未执行' };
  const ruleTypes = { contains: '包含参考内容', equals: '与参考输出相等', 'json-fields': 'JSON 字段与类型', status: '运行状态符合预期', nonempty: '返回值非空' };
  const typeNames = ['string', 'number', 'integer', 'boolean', 'object', 'array', 'null'];
  function fail(message) { throw new Error(message); }
  function stable(value) {
    if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
    if (object(value)) return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}';
    return JSON.stringify(value);
  }
  const fingerprint = example => stable({ input: example.input, reference: example.reference, expectedStatus: example.expectedStatus });
  const duplicateKey = example => stable({ input: example.input, split: example.split });
  const display = value => value === undefined ? '无返回值' : typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  const date = value => value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
  const tone = value => ['done', 'passed'].includes(value) ? 'success' : ['failed', 'error'].includes(value) ? 'danger' : ['stopped', 'blocked'].includes(value) ? 'warning' : 'neutral';
  const badge = status => S.badge(labels[status] || status, tone(status));
  function ruleBase(type = 'contains') { return { id: uid('rule'), name: ruleTypes[type], type, path: '', enabled: true, fields: [] }; }
  function newDataset(name, description = '') {
    return { id: uid('dataset'), name, description, revision: 1, createdAt: now(), updatedAt: now(), archived: false, threshold: 100, inputSchema: { type: 'object' }, rules: [ruleBase()], examples: [], versions: [] };
  }
  function initialState() {
    const research = newDataset('研究问答 · 起始样例', '可编辑的 3 条示例。参考输出与规则都由你维护。');
    research.id = 'quality-research';
    research.examples = [
      ['研究企业 Agent 的工具调用方式', '工具', '开发'],
      ['研究知识库如何保留来源', '来源', '测试'],
      ['研究工作流如何处理空结果', '工作流', '测试']
    ].map(([message, reference, split]) => ({ id: uid('example'), input: { message }, reference, expectedStatus: 'done', tags: ['起始样例'], split, createdAt: now(), updatedAt: now() }));
    const outputs = newDataset('流程运行 · 状态检查', '用于检查工作流运行状态，允许正常结束时没有返回值。');
    outputs.id = 'quality-workflow'; outputs.rules = [ruleBase('status')];
    outputs.examples = ['工具调试', '上下游参数'].map(topic => ({ id: uid('example'), input: { topic }, expectedStatus: 'done', tags: ['状态'], split: '测试', createdAt: now(), updatedAt: now() }));
    return { schema: 1, datasets: [research, outputs], experiments: [] };
  }
  if (!S.state.qualityData || S.state.qualityData.schema !== 1) S.state.qualityData = initialState();
  const data = () => S.state.qualityData;
  const dataset = id => data().datasets.find(d => d.id === id);
  const experiment = id => data().experiments.find(e => e.id === id);
  data().experiments.forEach(e => { if (e.status === 'running') { e.status = 'stopped'; e.finishedAt = now(); e.stopReason = '页面重新载入；保留已完成结果，没有自动重放。'; e.results.forEach(row => { if (row.status === 'running') row.status = 'stopped'; }); } });
  function editable(id) { const d = dataset(id); if (!d) fail('评测集不存在'); if (d.archived) fail('请先恢复评测集，再修改内容'); return d; }
  function changed(d) { d.revision++; d.updatedAt = now(); S.save(); return d; }
  function validateSchema(schema) {
    if (!object(schema) || schema.type && schema.type !== 'object') fail('输入 Schema 必须是 object 类型的 JSON Schema');
    if (schema.properties && !object(schema.properties)) fail('Schema.properties 必须是对象');
    if (schema.required && (!Array.isArray(schema.required) || schema.required.some(x => typeof x !== 'string'))) fail('Schema.required 必须是字段名数组');
    return clone(schema);
  }
  function validateExample(d, value) {
    if (!object(value) || !object(value.input)) fail('输入必须是 JSON 对象，例如 {"message":"你的问题"}');
    const errors = R.validateSchema(value.input, d.inputSchema || { type: 'object' });
    if (errors.length) fail(errors.join('；'));
    const expectedStatus = value.expectedStatus || 'done';
    if (!states.includes(expectedStatus)) fail('预期状态不受支持');
    const split = String(value.split || '默认').trim();
    if (!split || split.length > 40) fail('分组名称需为 1—40 个字符');
    const tags = (Array.isArray(value.tags) ? value.tags : String(value.tags || '').split(/[,，]/)).map(x => String(x).trim()).filter(Boolean);
    if (tags.some(x => x.length > 50) || tags.length > 20) fail('标签最多 20 个，每个不超过 50 个字符');
    return { input: clone(value.input), ...(own(value, 'reference') ? { reference: clone(value.reference) } : {}), expectedStatus, split, tags: [...new Set(tags)], ...(value.source ? { source: clone(value.source) } : {}) };
  }
  function createDataset(value) {
    const name = String(value.name || '').trim();
    if (!name || name.length > 80) fail('评测集名称需为 1—80 个字符');
    if (data().datasets.some(d => !d.archived && d.name === name)) fail('已有同名评测集，请使用不同名称');
    const d = newDataset(name, String(value.description || '').trim());
    d.inputSchema = validateSchema(value.inputSchema || { type: 'object' });
    data().datasets.unshift(d); S.save(); return d;
  }
  function updateDataset(id, value) {
    const d = editable(id), name = String(value.name || '').trim();
    if (!name || name.length > 80) fail('评测集名称需为 1—80 个字符');
    if (data().datasets.some(x => x.id !== id && !x.archived && x.name === name)) fail('已有同名评测集');
    const schema = validateSchema(value.inputSchema || d.inputSchema);
    const invalid = d.examples.filter(x => R.validateSchema(x.input, schema).length);
    if (invalid.length) fail('新 Schema 与 ' + invalid.length + ' 条现有样例不兼容；请先修改样例');
    d.name = name; d.description = String(value.description || '').trim(); d.inputSchema = schema; return changed(d);
  }
  function archiveDataset(id, archived = true) { const d = dataset(id); if (!d) fail('评测集不存在'); d.archived = archived; return changed(d); }
  function saveExample(id, value, exampleId) {
    const d = editable(id), normalized = validateExample(d, value);
    let item = exampleId && d.examples.find(x => x.id === exampleId);
    if (exampleId && !item) fail('该样例已被删除，请刷新列表');
    if (!item) { if (d.examples.length >= 5000) fail('当前原型每个评测集最多维护 5,000 条样例'); item = { id: uid('example'), createdAt: now() }; d.examples.push(item); }
    delete item.reference; delete item.source; Object.assign(item, normalized, { updatedAt: now() }); changed(d); return item;
  }
  function deleteExamples(id, ids) { const d = editable(id), selected = new Set(ids); const before = d.examples.length; d.examples = d.examples.filter(x => !selected.has(x.id)); changed(d); return before - d.examples.length; }
  function moveExamples(id, ids, split) {
    const d = editable(id); if (!String(split).trim() || String(split).length > 40) fail('分组名称需为 1—40 个字符');
    d.examples.filter(x => ids.includes(x.id)).forEach(x => { x.split = String(split).trim(); x.updatedAt = now(); }); return changed(d);
  }
  function saveRules(id, rules, threshold) {
    const d = editable(id), limit = Number(threshold);
    if (!Number.isFinite(limit) || limit < 1 || limit > 100) fail('通过阈值应在 1—100% 之间');
    const normalized = rules.map(r => {
      if (!ruleTypes[r.type]) fail('不支持的评判方式');
      if (r.path && !/^[\w\u4e00-\u9fff.-]+$/.test(r.path)) fail('输出路径使用字段名和点号，例如 result.text');
      if (String(r.path).split('.').some(x => ['__proto__', 'constructor', 'prototype'].includes(x))) fail('输出路径包含不允许的字段');
      const fields = r.fields || [];
      if (r.type === 'json-fields' && (!fields.length || fields.some(x => !x.path || !typeNames.includes(x.type)))) fail('请填写至少一个 JSON 字段及有效类型');
      return { id: r.id || uid('rule'), name: String(r.name || ruleTypes[r.type]).trim(), type: r.type, path: String(r.path || '').trim(), enabled: r.enabled !== false, fields: clone(fields) };
    });
    d.rules = normalized; d.threshold = limit; return changed(d);
  }
  function datasetSnapshot(d, label) { return clone({ id: d.id, name: d.name, revision: d.revision, label: label || '工作副本 r' + d.revision, inputSchema: d.inputSchema, examples: d.examples, rules: d.rules, threshold: d.threshold }); }
  function publishDataset(id, note = '') {
    const d = editable(id); if (!d.examples.length) fail('先添加样例，再保存数据集版本');
    const snapshot = datasetSnapshot(d, '版本 ' + (d.versions.length + 1));
    const v = { ...snapshot, id: uid('dataset-version'), createdAt: now(), note: String(note).trim() };
    d.versions.unshift(v); S.save(); return v;
  }
  function parseCSV(text) {
    const rows = []; let cells = [], cell = '', quoted = false, afterQuote = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (quoted) { if (char === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (char === '"') { quoted = false; afterQuote = true; } else cell += char; continue; }
      if (char === '"') { if (cell || afterQuote) fail('CSV 引号位置不正确'); quoted = true; continue; }
      if (char === ',') { cells.push(cell); cell = ''; afterQuote = false; continue; }
      if (char === '\n' || char === '\r') { if (char === '\r' && text[i + 1] === '\n') i++; cells.push(cell); if (cells.some(x => x !== '')) rows.push(cells); cells = []; cell = ''; afterQuote = false; continue; }
      if (afterQuote && char.trim()) fail('CSV 闭合引号后应为逗号或换行');
      if (!afterQuote) cell += char;
    }
    if (quoted) fail('CSV 存在未闭合的引号');
    cells.push(cell); if (cells.some(x => x !== '')) rows.push(cells);
    if (!rows.length) return { headers: [], rows: [] };
    const headers = rows.shift().map(x => x.trim());
    if (headers.some(x => !x) || new Set(headers).size !== headers.length) fail('CSV 表头不能为空或重复');
    return { headers, rows: rows.map((cells, i) => ({ row: i + 1, value: Object.fromEntries(headers.map((h, n) => [h, cells[n] || ''])), ...(cells.length !== headers.length ? { error: '列数与表头不一致' } : {}) })) };
  }
  function parseImport(text, format) {
    const source = String(text || '').replace(/^\uFEFF/, '');
    if (source.length > 2000000) fail('单次导入文本不能超过 2 MB');
    let parsed;
    if (format === 'csv') parsed = parseCSV(source);
    else if (format === 'jsonl') {
      const rows = source.split(/\r?\n/).map((line, i) => ({ line, row: i + 1 })).filter(x => x.line.trim()).map(x => { try { return { row: x.row, value: JSON.parse(x.line) }; } catch (_) { return { row: x.row, error: '不是合法 JSON' }; } });
      parsed = { rows, headers: [...new Set(rows.flatMap(x => object(x.value) ? Object.keys(x.value) : []))] };
    } else {
      let values; try { values = JSON.parse(source); } catch (_) { fail('JSON 无法解析，请检查括号和双引号'); }
      if (object(values) && Array.isArray(values.examples)) values = values.examples;
      if (!Array.isArray(values)) fail('JSON 导入应为样例数组，或含 examples 数组的对象');
      parsed = { rows: values.map((value, i) => ({ row: i + 1, value })), headers: [...new Set(values.flatMap(x => object(x) ? Object.keys(x) : []))] };
    }
    if (parsed.rows.length > 1000) fail('单次最多导入 1,000 条，请分批导入');
    return parsed;
  }
  function maybeJSON(value) { if (typeof value !== 'string') return value; try { return JSON.parse(value); } catch (_) { return value; } }
  function defaultMapping(headers) { return { input: ['input', 'inputs', 'question'].find(x => headers.includes(x)) || headers[0] || '', reference: ['reference', 'reference_output', 'output', 'answer'].find(x => headers.includes(x)) || '', split: headers.includes('split') ? 'split' : '', tags: headers.includes('tags') ? 'tags' : '', expectedStatus: headers.includes('expectedStatus') ? 'expectedStatus' : '' }; }
  function previewImport(id, text, format = 'jsonl', mapping) {
    const d = editable(id), parsed = parseImport(text, format), map = mapping || defaultMapping(parsed.headers);
    if (!map.input) fail('请选择输入字段');
    const rows = parsed.rows.map(record => {
      try {
        if (record.error) fail(record.error);
        if (!object(record.value)) fail('每条记录必须是对象');
        if (!own(record.value, map.input)) fail('缺少输入字段：' + map.input);
        let input = maybeJSON(record.value[map.input]);
        if (typeof input === 'string') input = { message: input };
        const item = { input, split: map.split ? record.value[map.split] : '默认', tags: map.tags ? maybeJSON(record.value[map.tags]) : [], expectedStatus: map.expectedStatus ? record.value[map.expectedStatus] : 'done' };
        if (map.reference && own(record.value, map.reference) && record.value[map.reference] !== '') item.reference = maybeJSON(record.value[map.reference]);
        const value = validateExample(d, item), duplicate = d.examples.some(x => duplicateKey(x) === duplicateKey(value));
        return { row: record.row, value, duplicate };
      } catch (error) { return { row: record.row, error: error.message }; }
    });
    return { datasetId: id, revision: d.revision, headers: parsed.headers, mapping: map, rows, valid: rows.filter(r => !r.error).length, errors: rows.filter(r => r.error).length };
  }
  function importExamples(preview, strategy = 'skip') {
    const d = editable(preview.datasetId); if (!['skip', 'replace', 'allow'].includes(strategy)) fail('重复处理方式无效');
    if (preview.revision !== d.revision) fail('评测集已被修改，请重新预览后导入');
    const valid = preview.rows.filter(x => !x.error).map(x => validateExample(d, x.value));
    if (!valid.length) fail('没有可导入的有效记录');
    if (d.examples.length + valid.length > 5000) fail('导入可能超过 5,000 条上限，请减少本批数量');
    let added = 0, replaced = 0, skipped = 0;
    valid.forEach(value => {
      const match = d.examples.find(x => duplicateKey(x) === duplicateKey(value));
      if (match && strategy === 'skip') { skipped++; return; }
      if (match && strategy === 'replace') { delete match.reference; Object.assign(match, clone(value), { updatedAt: now() }); replaced++; }
      else { d.examples.push({ ...clone(value), id: uid('example'), createdAt: now(), updatedAt: now() }); added++; }
    });
    changed(d); return { added, replaced, skipped, invalid: preview.errors };
  }
  function exportDataset(id, format = 'jsonl') {
    const d = dataset(id); if (!d) fail('评测集不存在');
    const rows = d.examples.map(x => ({ input: x.input, ...(own(x, 'reference') ? { reference: x.reference } : {}), expectedStatus: x.expectedStatus, split: x.split, tags: x.tags, ...(x.source ? { source: x.source } : {}) }));
    if (format === 'json') return JSON.stringify({ name: d.name, description: d.description, revision: d.revision, inputSchema: d.inputSchema, rules: d.rules, examples: rows }, null, 2);
    if (format === 'csv') {
      const cell = v => { let text = typeof v === 'string' ? v : JSON.stringify(v === undefined ? '' : v); if (/^[=+\-@\t\r]/.test(text)) text = "'" + text; return '"' + text.replace(/"/g, '""') + '"'; };
      return '\ufeff' + [['input', 'reference', 'expectedStatus', 'split', 'tags'], ...rows.map(x => [JSON.stringify(x.input), own(x, 'reference') ? JSON.stringify(x.reference) : '', x.expectedStatus, x.split, JSON.stringify(x.tags)])].map(row => row.map(cell).join(',')).join('\r\n');
    }
    return rows.map(x => JSON.stringify(x)).join('\n');
  }
  function pathValue(value, path) { return String(path || '').split('.').filter(Boolean).reduce((v, key) => ['__proto__', 'constructor', 'prototype'].includes(key) || v == null ? undefined : own(v, key) ? v[key] : undefined, value); }
  function evaluate(example, outcome, rules, threshold = 100) {
    const checks = rules.filter(r => r.enabled !== false).map(rule => {
      const actual = pathValue(outcome.returnValue, rule.path);
      let passed = false, reason = '';
      if (rule.type === 'status') { passed = outcome.status === (example.expectedStatus || 'done'); reason = '预期 ' + (example.expectedStatus || 'done') + '，实际 ' + outcome.status; }
      else if (rule.type === 'equals') { passed = own(example, 'reference') && stable(actual) === stable(example.reference); reason = !own(example, 'reference') ? '样例缺少参考输出' : passed ? '实际输出与参考输出一致' : '实际输出与参考输出不同'; }
      else if (rule.type === 'contains') { const words = Array.isArray(example.reference) ? example.reference : [example.reference]; passed = actual !== undefined && own(example, 'reference') && words.length > 0 && words.every(x => x !== undefined && String(x).length && display(actual).includes(String(x))); reason = !own(example, 'reference') ? '样例缺少参考内容' : passed ? '包含全部参考内容' : '未包含全部参考内容'; }
      else if (rule.type === 'nonempty') { passed = actual !== undefined && actual !== null && actual !== '' && (!Array.isArray(actual) || actual.length > 0) && (!object(actual) || Object.keys(actual).length > 0); reason = passed ? '返回值非空' : '返回值为空'; }
      else if (rule.type === 'json-fields') { const errors = rule.fields.filter(f => { const value = pathValue(actual, f.path); return f.type === 'null' ? value !== null : f.type === 'array' ? !Array.isArray(value) : f.type === 'object' ? !object(value) : f.type === 'integer' ? !Number.isInteger(value) : typeof value !== f.type; }); passed = errors.length === 0; reason = passed ? '字段和类型符合要求' : '不符合：' + errors.map(f => f.path + ':' + f.type).join('、'); }
      return { ruleId: rule.id, name: rule.name, passed, reason };
    });
    const score = checks.length ? Math.round(checks.filter(x => x.passed).length / checks.length * 10000) / 100 : null;
    return { checks, score, passed: score !== null && score >= threshold };
  }
  function targets() {
    const result = [];
    (S.state.agents || []).forEach(a => { const versions = [a.publishedConfig, ...(a.publishedVersions || [])].filter(Boolean); const seen = new Set(); versions.forEach(v => { if (seen.has(v.version)) return; seen.add(v.version); result.push({ key: 'agent|' + a.id + '|' + v.version, kind: 'agent', id: a.id, version: v.version, name: a.name, snapshot: clone(v) }); }); });
    (R.flows || []).forEach(f => { const versions = [f.publishedSnapshot, ...(f.versions || [])].filter(Boolean); const seen = new Set(); versions.forEach(v => { if (seen.has(v.version)) return; seen.add(v.version); result.push({ key: 'workflow|' + f.id + '|' + v.version, kind: 'workflow', id: f.id, version: v.version, name: f.title, snapshot: clone(v) }); }); });
    return result;
  }
  function freezeFlow(flow, seen = []) {
    if (seen.includes(flow.id)) fail('子流程存在循环依赖，无法冻结评测版本');
    const snap = clone(flow), trail = seen.concat(flow.id);
    (snap.nodes || []).forEach(node => {
      const c = node.config || (node.config = {});
      if (node.type === 'subflow') { const child = R.flows.find(x => x.id === c.flowId); const chosen = [child?.publishedSnapshot, ...(child?.versions || [])].filter(Boolean).find(x => !c.version || x.version === c.version); if (!chosen) fail('子流程发布版本不可用：' + c.flowId); c.resolvedSnapshot = freezeFlow(chosen, trail); }
      if (node.type === 'agent') { const child = S.state.agents.find(x => x.id === c.agentId); if (!child?.publishedConfig) fail('子 Agent 未发布：' + c.agentId); c.agentSnapshot = clone(child.publishedConfig); }
      if (c.body?.nodes) c.body = freezeFlow({ id: snap.id + ':' + node.id, ...c.body }, trail);
    });
    return snap;
  }
  function summarize(e) {
    const scored = e.results.filter(r => r.score !== null && r.score !== undefined), complete = e.results.filter(r => !['queued', 'running'].includes(r.status));
    return { total: e.results.length, complete: complete.length, scored: scored.length, passed: e.results.filter(r => r.status === 'passed').length, failed: e.results.filter(r => r.status === 'failed').length, blocked: e.results.filter(r => r.status === 'blocked').length, errors: e.results.filter(r => r.status === 'error').length, score: scored.length ? Math.round(scored.reduce((n, r) => n + r.score, 0) / scored.length * 100) / 100 : null, tokens: e.results.reduce((n, r) => n + (r.tokens || 0), 0), cost: e.results.reduce((n, r) => n + (r.cost || 0), 0) };
  }
  function startExperiment(options) {
    const d = editable(options.datasetId);
    const version = options.versionId ? d.versions.find(v => v.id === options.versionId) : null;
    if (options.versionId && !version) fail('数据集版本不存在');
    const snap = version ? { ...clone(version), id: d.id, versionId: version.id } : datasetSnapshot(d);
    snap.examples = snap.examples.filter(x => !options.split || x.split === options.split);
    if (!snap.examples.length) fail('当前分组没有样例，先添加样例或选择其它分组');
    if (!snap.rules.some(r => r.enabled !== false)) fail('先启用至少一条评判规则');
    const target = targets().find(x => x.key === options.targetKey); if (!target) fail('请选择一个可用的已发布版本');
    if (target.kind === 'workflow') target.snapshot = R.freezeWorkflow ? R.freezeWorkflow(target.snapshot) : freezeFlow(target.snapshot);
    else if (S.AgentStudio.freezeSnapshot) target.snapshot = S.AgentStudio.freezeSnapshot(target.snapshot);
    return launch({ name: String(options.name || target.name + ' · 评测').trim(), datasetSnapshot: snap, target, split: options.split || '', options: { timeoutMs: Math.min(60000, Math.max(1000, Number(options.timeoutMs) || 15000)), speed: options.speed }, createdAt: now() });
  }
  function launch(base) {
    const e = { ...clone(base), id: uid('experiment'), status: 'running', createdAt: now(), results: base.datasetSnapshot.examples.map(example => ({ id: uid('eval-row'), exampleId: example.id, example: clone(example), fingerprint: fingerprint(example), status: 'queued', checks: [], score: null, review: null })) };
    data().experiments.unshift(e); S.save();
    const promise = execute(e).finally(() => { workers.delete(e.id); }); workers.set(e.id, promise); return e;
  }
  async function execute(e) {
    for (const row of e.results) {
      if (e.status !== 'running') break;
      row.status = 'running'; row.startedAt = now(); S.save(); refresh(e.id);
      let run, timer, blockedReason = '', unsub = () => {};
      try {
        const belongs = candidate => { let current = candidate, depth = 0; while (current && depth++ < 30) { if (current.id === run?.id) return true; current = current.parentRunId && R.findRun(current.parentRunId); } return false; };
        const block = (reason, candidate) => { if (blockedReason) return; blockedReason = reason; if (run) R.stop(run.id); if (candidate && candidate.id !== run?.id) R.stop(candidate.id); };
        unsub = R.subscribe((candidate, event) => {
          if (!belongs(candidate) || e.status !== 'running') return;
          if (event.type === 'tool.started') { const tool = candidate.capabilitySnapshots?.tools?.find(t => t.id === event.data.toolId) || R.getTool(event.data.toolId); if (tool?.write) block('离线评测阻止写入工具：' + (tool.title || tool.id), candidate); }
          if (event.type === 'node.started' && ['human', 'database'].includes(event.data.type)) block(event.data.type === 'human' ? '此路径需要人工输入或批准，请在调试台验证该场景' : '离线评测未启用数据库操作', candidate);
          if (event.type === 'run.waiting') queueMicrotask(() => { if (candidate.status === 'waiting') block('此路径正在等待确认；离线评测不会自动批准操作', candidate); });
        });
        if (e.target.kind === 'workflow') run = R.runWorkflow(clone(e.target.snapshot), { inputs: clone(row.example.input), speed: e.options.speed, preserveResolvedSnapshots: true, title: e.name + ' · 样例' });
        else { const goal = row.example.input.message || row.example.input.goal || row.example.input.topic || JSON.stringify(row.example.input); run = S.AgentStudio.start({ agentId: e.target.id, snapshot: clone(e.target.snapshot), goal: typeof goal === 'string' ? goal : JSON.stringify(goal), mode: 'execute', preserveResolvedSnapshots: true }); }
        if (!run) fail('未能创建评测运行');
        e.activeRunId = run.id; row.runId = run.id; row.traceId = run.traceId; run.qualityExperimentId = e.id; run.qualityExampleId = row.exampleId; run.source = '质量评测'; S.save();
        timer = setTimeout(() => { if (!states.includes(run.status)) { blockedReason = '达到单条样例时限，已停止运行'; R.stop(run.id); } }, e.options.timeoutMs);
        await R.waitForRun(run);
        row.actualStatus = run.status; row.actual = clone(run.outcome?.returnValue); row.receipts = clone(run.outcome?.receipts || []);
        const usageRuns = S.state.runs.filter(belongs); row.tokens = usageRuns.reduce((n, item) => n + (item.tokens || 0), 0); row.cost = usageRuns.reduce((n, item) => n + (item.cost || 0), 0);
        if (e.status === 'stopped') { row.status = 'stopped'; row.message = '评测已由用户停止'; }
        else if (blockedReason) { row.status = 'blocked'; row.message = blockedReason; }
        else {
          const result = evaluate(row.example, { status: run.status, returnValue: run.outcome?.returnValue }, e.datasetSnapshot.rules, e.datasetSnapshot.threshold);
          Object.assign(row, result); row.status = result.passed ? 'passed' : 'failed';
          if (run.status !== (row.example.expectedStatus || 'done')) { row.status = 'error'; row.score = null; row.message = run.error || '运行状态不符合样例预期：' + run.status; }
        }
      } catch (error) { row.status = e.status === 'stopped' ? 'stopped' : 'error'; row.message = error.message; row.score = null; }
      finally { clearTimeout(timer); unsub(); row.finishedAt = now(); row.duration = row.finishedAt - row.startedAt; delete e.activeRunId; S.save(); refresh(e.id); }
    }
    if (e.status === 'running') e.status = 'done'; e.finishedAt = now(); S.save(); refresh(e.id); return e;
  }
  function refresh(id) { if (S.route === 'quality' || S.route === 'experiment' && S.params.id === id) { if (!document.getElementById('app-dialog')?.open) S.render(); } }
  function stopExperiment(id) { const e = experiment(id); if (!e || e.status !== 'running') return false; e.status = 'stopped'; e.stopReason = '用户停止'; if (e.activeRunId) R.stop(e.activeRunId); S.save(); return true; }
  function retryExperiment(id) {
    const e = experiment(id); if (!e) fail('评测任务不存在'); if (e.status === 'running') fail('先停止当前评测再重试');
    const failed = new Set(e.results.filter(r => ['failed', 'blocked', 'error', 'stopped', 'queued'].includes(r.status)).map(r => r.exampleId));
    if (!failed.size) fail('没有需要重试的样例');
    const snap = clone(e.datasetSnapshot); snap.examples = snap.examples.filter(x => failed.has(x.id));
    return launch({ name: e.name + ' · 重试', retryOf: e.id, datasetSnapshot: snap, target: clone(e.target), split: e.split, options: clone(e.options) });
  }
  function reviewResult(id, rowId, verdict, note) { const e = experiment(id), row = e?.results.find(r => r.id === rowId); if (!row) fail('结果不存在'); if (!['pass', 'fail', 'pending'].includes(verdict)) fail('复核结论无效'); row.review = { verdict, note: String(note || '').trim(), at: now() }; S.save(); return row; }
  function compareExperiments(id, baselineId) {
    const e = experiment(id), baseline = experiment(baselineId); if (!e || !baseline) fail('评测任务不存在');
    const ruleShape = item => ({ threshold: item.datasetSnapshot.threshold, rules: item.datasetSnapshot.rules.map(r => ({ type: r.type, path: r.path || '', fields: r.fields || [], enabled: r.enabled !== false })) });
    const sameRules = stable(ruleShape(e)) === stable(ruleShape(baseline));
    return e.results.map(row => { const prior = baseline.results.find(x => x.exampleId === row.exampleId && x.fingerprint === row.fingerprint); return { row, prior: prior || null, comparable: !!prior && sameRules, reason: !sameRules ? '评判规则或阈值已变化' : !prior ? '输入或参考输出已变化' : '', delta: prior && sameRules && row.score !== null && prior.score !== null ? row.score - prior.score : null }; });
  }
  function fromRun(runId) {
    const run = R.findRun(runId); if (!run) fail('运行记录不存在');
    return { input: clone(run.inputs || {}), ...(own(run.outcome, 'returnValue') ? { reference: clone(run.outcome.returnValue) } : {}), expectedStatus: 'done', split: '待复核', tags: ['运行回流'], source: { runId: run.id, traceId: run.traceId, at: now(), observedStatus: run.status } };
  }
  S.Quality = { createDataset, updateDataset, archiveDataset, saveExample, deleteExamples, moveExamples, saveRules, publishDataset, parseImport, defaultMapping, previewImport, importExamples, exportDataset, evaluate, targets, freezeFlow, startExperiment, stopExperiment, retryExperiment, reviewResult, compareExperiments, summarize, fromRun, getDataset: dataset, getExperiment: experiment, waitForExperiment: id => workers.get(id) || Promise.resolve(experiment(id)), openAddFromRun };

  const attrs = (id, extras = '') => `data-id="${E(id)}" ${extras}`;
  const link = (label, route, params = {}, css = 'btn btn-secondary btn-sm') => `<a class="${css}" href="#${route}?${E(new URLSearchParams(params).toString())}">${E(label)}</a>`;
  function select(label, id, options, value = '', extra = '') { return `<div class="field"><label class="field-label" for="${id}">${E(label)}</label><select class="select" id="${id}" name="${id}" ${extra}>${options.map(x => `<option value="${E(x[0])}" ${String(value) === String(x[0]) ? 'selected' : ''}>${E(x[1])}</option>`).join('')}</select></div>`; }
  function textarea(label, id, value, help = '', rows = 5) { return `<div class="field"><label class="field-label" for="${id}">${E(label)}</label><textarea class="input quality-json" id="${id}" name="${id}" rows="${rows}" aria-describedby="${id}-error ${id}-help">${E(value || '')}</textarea><p id="${id}-help" class="field-help">${E(help)}</p><p id="${id}-error" class="field-error"></p></div>`; }
  const json = value => `<pre class="quality-code">${E(display(value))}</pre>`;
  function pagination(total, size = 10) { const page = Math.max(1, Math.min(Number(S.params.page) || 1, Math.ceil(total / size) || 1)); return { page, start: (page - 1) * size, html: `<div class="quality-pagination"><span class="small muted">共 ${total} 条 · 第 ${page} / ${Math.ceil(total / size) || 1} 页</span><div class="row">${S.btn('上一页', 'quality-page', { small: true, variant: 'secondary', attrs: `data-page="${page - 1}" ${page === 1 ? 'disabled' : ''}` })}${S.btn('下一页', 'quality-page', { small: true, variant: 'secondary', attrs: `data-page="${page + 1}" ${page * size >= total ? 'disabled' : ''}` })}</div></div>` }; }
  function table(headers, rows, empty) { return `<div class="table-wrap"><table class="data-table"><thead><tr>${headers.map(h => '<th scope="col">' + h + '</th>').join('')}</tr></thead><tbody>${rows || `<tr><td colspan="${headers.length}">${empty}</td></tr>`}</tbody></table></div>`; }
  function queryKey() { return S.route + ':' + (S.params.id || ''); }
  function mount(container) {
    const onInput = event => { if (event.isComposing || event.target.id !== 'quality-search') return; const input = event.target; ui.queries[queryKey()] = input.value; const pos = input.selectionStart; S.params.page = 1; S.render(); const next = document.getElementById('quality-search'); if (next) { next.focus(); try { next.setSelectionRange(pos, pos); } catch (_) {} } };
    const onChange = event => { const el = event.target; if (el.dataset.qualityPick) { el.checked ? ui.selected.add(el.dataset.qualityPick) : ui.selected.delete(el.dataset.qualityPick); const count = container.querySelector('#quality-selected-count'); if (count) count.textContent = ui.selected.size + ' 条已选'; } if (el.id === 'quality-split-filter' || el.id === 'quality-result-filter') S.go(S.route, { ...S.params, page: 1, [el.id === 'quality-split-filter' ? 'split' : 'result']: el.value }); if (el.id === 'quality-compare') S.go('experiment', { ...S.params, compare: el.value, page: 1 }); };
    container.addEventListener('input', onInput); container.addEventListener('compositionend', onInput); container.addEventListener('change', onChange);
    return () => { container.removeEventListener('input', onInput); container.removeEventListener('compositionend', onInput); container.removeEventListener('change', onChange); };
  }
  function renderQuality() {
    const tab = S.params.tab === 'experiments' ? 'experiments' : 'datasets', q = (ui.queries[queryKey()] || '').toLowerCase(), archived = S.params.archived === 'true';
    let rows, content;
    if (tab === 'datasets') {
      rows = data().datasets.filter(d => d.archived === archived && (d.name + ' ' + d.description).toLowerCase().includes(q)); const p = pagination(rows.length);
      content = table(['评测集', '样例 / 分组', '版本', '最近修改', '操作'], rows.slice(p.start, p.start + 10).map(d => `<tr><td><a class="quality-name" href="#dataset?id=${E(d.id)}">${E(d.name)}</a><p class="small muted">${E(d.description || '暂无说明')}</p></td><td>${d.examples.length} 条 <span class="muted">/ ${new Set(d.examples.map(x => x.split)).size} 组</span></td><td>${d.versions.length ? E(d.versions[0].label) : '工作副本'}<small class="quality-sub">r${d.revision}</small></td><td class="small">${date(d.updatedAt)}</td><td><div class="row">${link('维护样例', 'dataset', { id: d.id })}${archived ? S.btn('恢复', 'quality-restore', { small: true, variant: 'ghost', attrs: attrs(d.id) }) : S.btn('启动评测', 'quality-new-experiment', { small: true, variant: 'ghost', attrs: attrs(d.id) })}</div></td></tr>`).join(''), S.empty(q ? '没有匹配的评测集' : archived ? '没有已归档的评测集' : '创建你的第一个评测集', '维护输入、参考输出与评判规则，再选择已发布版本进行评测。', !archived ? S.btn('新建评测集', 'quality-create') : '')) + p.html;
    } else {
      rows = data().experiments.filter(e => (e.name + ' ' + e.target.name + ' ' + e.datasetSnapshot.name).toLowerCase().includes(q)); const p = pagination(rows.length);
      content = table(['评测任务 / 目标版本', '评测集快照', '进度', '规则结果', '操作'], rows.slice(p.start, p.start + 10).map(e => { const m = summarize(e); return `<tr><td><a class="quality-name" href="#experiment?id=${E(e.id)}">${E(e.name)}</a><small class="quality-sub">${E(e.target.name)} · ${E(e.target.version)}</small></td><td>${E(e.datasetSnapshot.name)}<small class="quality-sub">${E(e.datasetSnapshot.label)} · ${date(e.createdAt)}</small></td><td>${badge(e.status)}<small class="quality-sub">${m.complete}/${m.total} 条已处理</small></td><td>${m.scored ? m.passed + '/' + m.scored + ' 条通过' : '尚无可评分结果'}${m.blocked ? `<small class="quality-sub">${m.blocked} 条受保护阻断</small>` : ''}</td><td>${link('查看结果', 'experiment', { id: e.id })}</td></tr>`; }).join(''), S.empty('还没有评测任务', '从评测集选择已发布的 Agent 或工作流版本开始。', S.btn('选择评测集', 'quality-tab', { attrs: 'data-id="datasets"' }))) + p.html;
    }
    return `<div class="quality-page">${S.header('质量评测', '用自己的样例验证应用', '维护评测集、固定版本、查看每条结果。当前规则检查基于本地模拟执行，不代表模型的真实语义质量。', S.btn('新建评测集', 'quality-create', { icon: 'plus' }))}${S.tabs([{ id: 'datasets', label: '评测集', count: data().datasets.filter(d => !d.archived).length }, { id: 'experiments', label: '评测任务', count: data().experiments.length }], tab, 'quality-tab')}<section class="panel quality-panel"><div class="quality-toolbar">${S.search('quality-search', tab === 'datasets' ? '搜索评测集名称或说明' : '搜索任务或应用名称', ui.queries[queryKey()] || '')}${tab === 'datasets' ? S.btn(archived ? '查看使用中的评测集' : '查看已归档', 'quality-archive-filter', { variant: 'ghost', small: true }) : ''}</div>${content}</section><div class="quality-hint">${S.icon('help', 16)}<span>知识库用于给应用提供资料；评测集用于检查应用表现。二者分别维护。</span></div></div>`;
  }
  function renderDataset() {
    const d = dataset(S.params.id); if (!d) return S.empty('评测集不存在', '它可能已经被移除，请返回评测集列表。', link('返回评测集', 'quality'));
    if (ui.selectionOwner !== d.id) { ui.selectionOwner = d.id; ui.selected.clear(); }
    const q = (ui.queries[queryKey()] || '').toLowerCase(), tab = ['rules', 'versions'].includes(S.params.tab) ? S.params.tab : 'examples';
    const actions = d.archived ? S.btn('恢复评测集', 'quality-restore', { attrs: attrs(d.id) }) : S.btn('编辑信息', 'quality-edit', { variant: 'secondary', attrs: attrs(d.id) }) + S.btn('启动评测', 'quality-new-experiment', { attrs: attrs(d.id), icon: 'play' });
    let content;
    if (tab === 'rules') {
      content = `<section class="panel quality-panel"><div class="quality-panel-heading"><div><h2>评判规则</h2><p class="small muted">每条样例按启用规则打分，达到 ${d.threshold}% 即通过。规则配置会随数据集快照固定。</p></div>${!d.archived ? S.btn('添加规则', 'quality-rule-add', { attrs: attrs(d.id), icon: 'plus', variant: 'secondary' }) : ''}</div>${table(['规则', '输出路径 / 字段', '状态', '操作'], d.rules.map(r => `<tr><td><strong>${E(r.name)}</strong><small class="quality-sub">${E(ruleTypes[r.type])}</small></td><td>${E(r.path || '整个返回值')}${r.type === 'json-fields' ? `<small class="quality-sub">${E(r.fields.map(x => x.path + ':' + x.type).join('、'))}</small>` : ''}</td><td>${S.badge(r.enabled === false ? '已停用' : '已启用', r.enabled === false ? 'neutral' : 'success')}</td><td>${!d.archived ? S.btn('编辑', 'quality-rule-edit', { small: true, variant: 'ghost', attrs: attrs(d.id, `data-rule="${E(r.id)}"`) }) : '—'}</td></tr>`).join(''), S.empty('尚未配置规则', '添加可重复执行的规则后，再启动评测。'))}<div class="quality-pagination"><span class="small muted">未接入 LLM 判分，不生成固定的综合质量分数。</span>${!d.archived ? S.btn('设置通过阈值', 'quality-threshold', { small: true, variant: 'secondary', attrs: attrs(d.id) }) : ''}</div></section>`;
    } else if (tab === 'versions') {
      content = `<section class="panel quality-panel"><div class="quality-panel-heading"><div><h2>数据集版本</h2><p class="small muted">版本包含输入 Schema、样例、参考输出和评判规则；保存后不随工作副本变化。</p></div>${!d.archived ? S.btn('保存版本', 'quality-version', { attrs: attrs(d.id), variant: 'secondary' }) : ''}</div>${table(['版本', '样例 / 规则', '保存时间', '说明'], d.versions.map(v => `<tr><td>${E(v.label)}<small class="quality-sub">工作副本 r${v.revision}</small></td><td>${v.examples.length} 条 / ${v.rules.filter(r => r.enabled !== false).length} 条规则</td><td>${date(v.createdAt)}</td><td>${E(v.note || '未填写说明')}</td></tr>`).join(''), S.empty('还没有保存版本', '可以先维护样例，再保存一个用于回归比较的版本。'))}</section>`;
    } else {
      const rows = d.examples.filter(x => (!S.params.split || x.split === S.params.split) && (display(x.input) + ' ' + display(x.reference) + ' ' + x.tags.join(' ')).toLowerCase().includes(q));
      const p = pagination(rows.length), splits = [...new Set(d.examples.map(x => x.split))];
      content = `<section class="panel quality-panel"><div class="quality-toolbar">${S.search('quality-search', '搜索输入、参考输出或标签', ui.queries[queryKey()] || '')}${select('样例分组', 'quality-split-filter', [['', '全部分组'], ...splits.map(x => [x, x])], S.params.split || '')}<div class="row">${!d.archived ? S.btn('导入', 'quality-import', { small: true, variant: 'secondary', icon: 'upload', attrs: attrs(d.id) }) : ''}${S.btn('导出', 'quality-export', { small: true, variant: 'secondary', icon: 'download', attrs: attrs(d.id) })}${!d.archived ? S.btn('添加样例', 'quality-example-add', { small: true, icon: 'plus', attrs: attrs(d.id) }) : ''}</div></div><div class="quality-selection"><span id="quality-selected-count">${ui.selected.size} 条已选</span>${!d.archived ? S.btn('移动到分组', 'quality-bulk-split', { small: true, variant: 'ghost', attrs: attrs(d.id) }) + S.btn('删除所选', 'quality-bulk-delete', { small: true, variant: 'ghost', attrs: attrs(d.id) }) : ''}${S.btn('清除选择', 'quality-clear-selection', { small: true, variant: 'ghost' })}</div>${table(['选择', '输入', '参考输出 / 预期状态', '分组 / 标签', '操作'], rows.slice(p.start, p.start + 10).map(x => `<tr><td><input type="checkbox" data-quality-pick="${E(x.id)}" aria-label="选择样例 ${E(x.id)}" ${ui.selected.has(x.id) ? 'checked' : ''} ${d.archived ? 'disabled' : ''}></td><td><div class="quality-preview">${E(display(x.input))}</div>${x.source?.runId ? `<small class="quality-sub">来自 ${link('运行记录', 'task', { id: x.source.runId }, 'text-link')}</small>` : ''}</td><td><div class="quality-preview">${E(own(x, 'reference') ? display(x.reference) : '未设置参考输出')}</div><small class="quality-sub">预期 ${E(x.expectedStatus)}</small></td><td>${S.badge(x.split)}<small class="quality-sub">${E(x.tags.join(' · '))}</small></td><td>${S.btn(d.archived ? '查看' : '编辑', 'quality-example-edit', { small: true, variant: 'secondary', attrs: attrs(d.id, `data-example="${E(x.id)}"`) })}</td></tr>`).join(''), S.empty(q || S.params.split ? '没有匹配的样例' : '评测集还是空的', '手动添加样例、导入已有文件，或从运行记录加入案例。', !d.archived ? S.btn('添加第一条样例', 'quality-example-add', { attrs: attrs(d.id) }) : ''))}${p.html}</section>`;
    }
    return `<div class="quality-page"><div class="quality-back">${link('← 评测集', 'quality', {}, 'text-link')}</div>${S.header('评测集', d.name, d.description, actions)}<div class="quality-meta"><span>${d.examples.length} 条样例</span><span>工作副本 r${d.revision}</span><span>${date(d.updatedAt)} 更新</span>${d.archived ? S.badge('已归档', 'warning') : S.btn('归档', 'quality-archive', { small: true, variant: 'ghost', attrs: attrs(d.id) })}</div>${S.tabs([{ id: 'examples', label: '样例' }, { id: 'rules', label: '评判规则', count: d.rules.length }, { id: 'versions', label: '版本', count: d.versions.length }], tab, 'quality-dataset-tab')}${content}</div>`;
  }
  function renderExperiment() {
    const e = experiment(S.params.id); if (!e) return S.empty('没有找到评测任务', '返回质量评测查看现有任务。', link('返回质量评测', 'quality'));
    const m = summarize(e), filter = S.params.result || '', rows = e.results.filter(r => !filter || r.status === filter), p = pagination(rows.length);
    const comparisons = S.params.compare && experiment(S.params.compare) ? compareExperiments(e.id, S.params.compare) : [];
    const other = data().experiments.filter(x => x.id !== e.id && x.status !== 'running' && x.datasetSnapshot.id === e.datasetSnapshot.id);
    return `<div class="quality-page"><div class="quality-back">${link('← 评测任务', 'quality', { tab: 'experiments' }, 'text-link')}</div>${S.header('评测任务', e.name, e.target.name + ' · ' + e.target.version + ' / ' + e.datasetSnapshot.name + ' · ' + e.datasetSnapshot.label, e.status === 'running' ? S.btn('停止评测', 'quality-stop', { variant: 'secondary', attrs: attrs(e.id), icon: 'stop' }) : S.btn('按原配置重试未通过项', 'quality-retry', { variant: 'secondary', attrs: attrs(e.id), icon: 'refresh' }))}<div class="quality-summary">${badge(e.status)}<span><strong>${m.complete}/${m.total}</strong> 条已处理</span><span><strong>${m.passed}/${m.scored}</strong> 可评分样例通过</span><span>${m.blocked} 条阻断 · ${m.errors} 条执行错误</span><span>${m.tokens.toLocaleString('zh-CN')} Token · 估算 ¥${m.cost.toFixed(4)}</span></div><p class="quality-note">评分来自本次实际模拟输出与已冻结规则；阻断和执行错误单独计数，不计入通过率。人工复核不改写自动结果。</p><section class="panel quality-panel"><div class="quality-toolbar">${select('结果筛选', 'quality-result-filter', [['', '全部结果'], ...['passed', 'failed', 'error', 'blocked', 'queued', 'stopped'].map(x => [x, labels[x]])], filter)}${select('对比任务', 'quality-compare', [['', '不对比'], ...other.map(x => [x.id, x.name + ' · ' + date(x.createdAt)])], S.params.compare || '')}<span class="small muted">同一样例、输入、参考输出与评判规则一致时才比较得分</span></div>${table(['样例输入', '自动结果 / 复核', '规则得分', ...(comparisons.length ? ['对比'] : []), '耗时 / 用量', '操作'], rows.slice(p.start, p.start + 10).map(row => { const diff = comparisons.find(x => x.row.id === row.id); return `<tr><td><div class="quality-preview">${E(display(row.example.input))}</div><small class="quality-sub">${E(row.example.split)}</small></td><td>${badge(row.status)}${row.review ? `<small class="quality-sub">人工：${{ pass: '通过', fail: '不通过', pending: '待复核' }[row.review.verdict]}</small>` : ''}${row.message ? `<small class="quality-sub">${E(row.message)}</small>` : ''}</td><td>${row.score === null ? '—' : row.score + '%'}</td>${comparisons.length ? `<td>${!diff?.comparable ? E(diff?.reason || '样例或规则变更 / 不可比') : diff.delta === null ? '有未评分结果' : (diff.delta > 0 ? '+' : '') + diff.delta.toFixed(1) + '%'}</td>` : ''}<td class="small">${row.duration === undefined ? '—' : row.duration + ' ms'}<small class="quality-sub">${row.tokens || 0} Token</small></td><td>${S.btn('查看与复核', 'quality-result', { variant: 'secondary', small: true, attrs: attrs(e.id, `data-row="${E(row.id)}"`) })}</td></tr>`; }).join(''), S.empty('没有符合条件的结果', '切换筛选查看其它样例。'))}${p.html}</section><details class="panel quality-snapshot"><summary>查看固定配置与运行边界</summary><dl class="quality-detail-list"><dt>目标版本</dt><dd>${E(e.target.kind)} / ${E(e.target.id)} / ${E(e.target.version)}</dd><dt>数据集</dt><dd>${E(e.datasetSnapshot.label)}，${e.datasetSnapshot.examples.length} 条样例，阈值 ${e.datasetSnapshot.threshold}%</dd><dt>执行保护</dt><dd>阻止外部写入和数据库节点；人工等待不会自动审批。模型和工具均由本地适配器模拟。</dd><dt>开始时间</dt><dd>${date(e.createdAt)}</dd><dt>结束时间</dt><dd>${date(e.finishedAt)}</dd></dl><h3>本次评判规则</h3>${json(e.datasetSnapshot.rules)}</details></div>`;
  }
  S.page('quality', { title: '质量评测', section: '运行与改进', render: renderQuality, mount });
  S.page('dataset', { title: '评测集', section: '运行与改进', render: renderDataset, mount });
  S.page('experiment', { title: '评测结果', section: '运行与改进', render: renderExperiment, mount });
  function action(name, fn) { S.action(name, async el => { try { await fn(el || { dataset: {} }); } catch (error) { const errorBox = document.getElementById('quality-form-error'); if (errorBox && document.getElementById('app-dialog')?.open) { errorBox.textContent = error.message; errorBox.focus?.(); } else S.toast(error.message, 'error'); } }); }
  const formError = '<p id="quality-form-error" class="field-error" role="alert" tabindex="-1"></p>';
  const formValues = id => document.getElementById(id);
  function parseField(value, label, optional = false) { if (!value.trim() && optional) return undefined; try { return JSON.parse(value); } catch (_) { fail(label + '不是合法 JSON'); } }
  function openDataset(id) {
    const d = id ? editable(id) : { name: '', description: '', inputSchema: { type: 'object' } };
    S.modal({ title: id ? '编辑评测集' : '新建评测集', subtitle: '先创建评测集，再维护样例和规则。', body: `<form id="quality-dataset-form" data-form="quality-dataset-form" data-id="${E(id || '')}" novalidate>${S.field('名称', { id: 'quality-name', name: 'name', value: d.name, required: true })}${textarea('说明', 'quality-description', d.description, '说明测试目的与样例来源。', 2)}<details><summary>输入 Schema（可选）</summary>${textarea('输入 JSON Schema', 'quality-schema', JSON.stringify(d.inputSchema, null, 2), '每条输入必须是 JSON 对象；修改 Schema 会校验现有样例。')}</details>${formError}</form>`, footer: S.btn('取消', 'modal-close', { variant: 'secondary' }) + S.btn(id ? '保存修改' : '创建评测集', 'quality-dataset-save') });
  }
  function openExample(id, exampleId, preset) {
    const d = dataset(id); if (!d) fail('评测集不存在');
    const item = exampleId ? d.examples.find(x => x.id === exampleId) : preset || { input: { message: '' }, split: '默认', tags: [], expectedStatus: 'done' };
    if (!item) fail('样例不存在');
    if (d.archived) { S.modal({ title: '查看已归档样例', subtitle: d.name, wide: true, body: '<h3>输入</h3>' + json(item.input) + '<h3>参考输出</h3>' + json(item.reference) + '<p class="small muted">恢复评测集后可以修改样例。</p>', footer: S.btn('关闭', 'modal-close', { variant: 'secondary' }) }); return; }
    ui.exampleSource = clone(item.source);
    S.modal({ title: d.archived ? '查看样例' : exampleId ? '编辑样例' : '添加样例', subtitle: d.name, wide: true, body: `<form id="quality-example-form" data-form="quality-example-form" data-id="${E(id)}" data-example="${E(exampleId || '')}" novalidate><div class="quality-two-columns">${textarea('输入（JSON 对象）', 'quality-input', JSON.stringify(item.input, null, 2), 'Agent 常用 message；工作流字段应匹配其开始节点。', 9)}${textarea('参考输出（可选 JSON）', 'quality-reference', own(item, 'reference') ? JSON.stringify(item.reference, null, 2) : '', '文本写为 JSON 字符串，例如 "必须包含的内容"；留空表示无参考输出。', 9)}</div><div class="quality-three-columns">${S.field('分组', { id: 'quality-split', name: 'split', value: item.split, required: true })}${S.field('标签', { id: 'quality-tags', name: 'tags', value: (item.tags || []).join(', '), help: '使用逗号分隔' })}${select('预期运行状态', 'quality-expected', states.map(x => [x, x === 'done' ? '正常完成 done' : x]), item.expectedStatus || 'done')}</div>${item.source ? `<p class="small muted">来源运行 ${E(item.source.runId)}。参考输出是当前运行结果的副本，请人工核对后保存。</p>` : ''}${formError}</form>`, footer: (exampleId && !d.archived ? S.btn('删除样例', 'quality-example-delete', { variant: 'ghost', attrs: attrs(id, `data-example="${E(exampleId)}"`) }) : '') + S.btn('关闭', 'modal-close', { variant: 'secondary' }) + (!d.archived ? S.btn('保存样例', 'quality-example-save') : '') });
  }
  function openRules(id, ruleId) {
    const d = editable(id), rule = d.rules.find(r => r.id === ruleId) || ruleBase('contains');
    S.modal({ title: ruleId ? '编辑评判规则' : '添加评判规则', body: `<form id="quality-rule-form" data-form="quality-rule-form" data-id="${E(id)}" data-rule="${E(ruleId || '')}" novalidate>${S.field('规则名称', { id: 'quality-rule-name', name: 'name', value: rule.name, required: true })}${select('评判方式', 'quality-rule-type', Object.entries(ruleTypes), rule.type)}${S.field('返回值内的字段路径', { id: 'quality-rule-path', name: 'path', value: rule.path, help: '留空检查整个返回值；例如 result.text。状态规则不使用此字段。' })}${textarea('JSON 必需字段', 'quality-rule-fields', (rule.fields || []).map(x => x.path + ':' + x.type).join('\n'), '仅 JSON 字段规则使用；每行 field.path:type，类型可用 string/number/integer/boolean/object/array/null。', 4)}<label class="quality-check"><input type="checkbox" id="quality-rule-enabled" name="enabled" ${rule.enabled !== false ? 'checked' : ''}> 启用此规则</label>${formError}</form>`, footer: (ruleId ? S.btn('删除规则', 'quality-rule-delete', { variant: 'ghost', attrs: attrs(id, `data-rule="${E(ruleId)}"`) }) : '') + S.btn('取消', 'modal-close', { variant: 'secondary' }) + S.btn('保存规则', 'quality-rule-save') });
  }
  function openExperiment(id) {
    const d = id ? editable(id) : data().datasets.find(x => !x.archived); if (!d) { openDataset(); return; }
    const choices = targets();
    const preferred = choices.find(x => d.id === 'quality-workflow' ? x.id === 'flow-item' : x.kind === 'agent');
    S.modal({ title: '启动评测', subtitle: d.name + ' · 使用当前选择的固定快照', wide: true, body: `<form id="quality-experiment-form" data-form="quality-experiment-form" data-id="${E(d.id)}" novalidate>${S.field('任务名称', { id: 'quality-experiment-name', name: 'name', value: d.name + ' · 回归检查', required: true })}${select('应用与发布版本', 'quality-target', choices.map(x => [x.key, (x.kind === 'agent' ? 'Agent' : '工作流') + ' / ' + x.name + ' / ' + x.version]), preferred?.key || choices[0]?.key || '')}<div class="quality-two-columns">${select('数据集版本', 'quality-version-id', [['', '当前工作副本 r' + d.revision + '（启动时固定）'], ...d.versions.map(v => [v.id, v.label + ' · ' + v.examples.length + ' 条'])])}${select('样例分组', 'quality-run-split', [['', '全部分组'], ...[...new Set(d.examples.map(x => x.split))].map(x => [x, x])])}</div><div class="notice small">只读评测：外部写入与数据库操作会被阻断；人工等待不会自动批准。每条样例产生独立运行记录。输出来自本地模拟适配器，得分按样例与规则计算。</div>${formError}</form>`, footer: S.btn('取消', 'modal-close', { variant: 'secondary' }) + S.btn('开始评测', 'quality-experiment-start', { icon: 'play', attrs: choices.length && d.examples.length ? '' : 'disabled' }) });
  }
  function openImport(id) {
    editable(id); ui.importDraft = null; ui.importHeaders = []; ui.importReadSeq = (ui.importReadSeq || 0) + 1;
    S.modal({ title: '导入样例', subtitle: '先预览并检查字段，再导入有效记录。单次最多 1,000 条。', wide: true, body: `<form id="quality-import-form" data-form="quality-import-form" data-id="${E(id)}" novalidate><div class="quality-two-columns">${select('文件格式', 'quality-import-format', [['jsonl', 'JSONL（每行一个对象）'], ['json', 'JSON 数组'], ['csv', 'CSV（含表头）']])}<div class="field"><label class="field-label" for="quality-import-file">选择本地文件</label><input class="input" id="quality-import-file" name="file" type="file" accept=".json,.jsonl,.csv"><p class="field-help">只在当前浏览器读取，不上传。</p></div></div>${textarea('导入内容', 'quality-import-text', '{"input":{"message":"示例问题"},"reference":"预期内容","split":"测试","tags":["示例"]}', '文本输入会映射为 {message:文本}；复杂输入请使用 JSON 对象。', 6)}<div id="quality-import-mapping"></div>${select('重复记录处理', 'quality-import-strategy', [['skip', '跳过相同输入和分组'], ['replace', '更新相同输入和分组的参考输出'], ['allow', '保留重复记录']])}<div id="quality-import-preview" role="status" class="quality-import-preview">尚未预览</div>${formError}</form>`, footer: S.btn('预览数据', 'quality-import-preview', { variant: 'secondary' }) + S.btn('导入有效记录', 'quality-import-apply', { attrs: 'disabled id="quality-import-apply-button"' }), onOpen: dialog => {
      const invalidate = () => { ui.importDraft = null; dialog.querySelector('#quality-import-apply-button').disabled = true; };
      dialog.querySelector('#quality-import-file').addEventListener('change', async event => {
        const sequence = ++ui.importReadSeq;
        invalidate();
        try {
          const file = event.target.files[0]; if (!file) return;
          if (file.size > 2000000) fail('文件不能超过 2 MB');
          const content = await file.text();
          if (sequence !== ui.importReadSeq || !dialog.open) return;
          dialog.querySelector('#quality-import-text').value = content;
          dialog.querySelector('#quality-import-format').value = file.name.toLowerCase().endsWith('.csv') ? 'csv' : file.name.toLowerCase().endsWith('.jsonl') ? 'jsonl' : 'json';
          ui.importHeaders = [];
          dialog.querySelector('#quality-import-mapping').innerHTML = '';
          dialog.querySelector('#quality-import-preview').textContent = '文件已读取，请预览数据。';
          dialog.querySelector('#quality-form-error').textContent = '';
        } catch (error) { if (sequence === ui.importReadSeq && dialog.open) dialog.querySelector('#quality-form-error').textContent = error.message; }
      });
      dialog.addEventListener('input', event => {
        if (event.target.id === 'quality-import-text') ui.importReadSeq++;
        if (ui.importDraft) invalidate();
      });
      dialog.addEventListener('change', event => {
        if (event.target.id !== 'quality-import-file' && event.target.id !== 'quality-import-strategy') {
          invalidate();
          if (event.target.id === 'quality-import-format') { ui.importReadSeq++; dialog.querySelector('#quality-import-mapping').innerHTML = ''; }
        }
      });
    }, onClose: () => { ui.importReadSeq++; } });
  }
  function openAddFromRun(runId) {
    const preset = fromRun(runId), available = data().datasets.filter(d => !d.archived);
    if (!available.length) { S.toast('先创建一个评测集，再从运行记录添加样例', 'info'); S.go('quality'); return; }
    ui.fromRun = { runId, preset };
    S.modal({ title: '将运行加入评测集', subtitle: '先选择评测集，再核对输入与参考输出。不会直接把本次答案认定为正确答案。', body: `${select('目标评测集', 'quality-fromrun-dataset', available.map(d => [d.id, d.name]))}<p class="small muted">运行 ${E(runId)} · ${E(preset.source.observedStatus)}</p>${json(preset.input)}${formError}`, footer: S.btn('取消', 'modal-close', { variant: 'secondary' }) + S.btn('继续编辑样例', 'quality-fromrun-next') });
  }
  function openResult(id, rowId) {
    const e = experiment(id), row = e?.results.find(r => r.id === rowId); if (!row) fail('结果不存在');
    S.drawer({ title: '样例结果与人工复核', subtitle: e.target.name + ' · ' + e.target.version, wide: true, body: `<div class="row">${badge(row.status)}<span>规则得分 ${row.score === null ? '—' : row.score + '%'}</span></div>${row.message ? `<p class="notice warning">${E(row.message)}</p>` : ''}<h3>输入</h3>${json(row.example.input)}<div class="quality-two-columns"><section><h3>参考输出</h3>${json(row.example.reference)}</section><section><h3>实际输出</h3>${json(row.actual)}<p class="small muted">实际状态：${E(row.actualStatus || '未执行')}</p></section></div><h3>规则明细</h3>${row.checks.map(c => `<div class="quality-check-result">${S.badge(c.passed ? '通过' : '未通过', c.passed ? 'success' : 'warning')}<div><strong>${E(c.name)}</strong><p class="small muted">${E(c.reason)}</p></div></div>`).join('') || '<p class="small muted">此结果尚未评分。</p>'}<form id="quality-review-form" data-form="quality-review-form" data-id="${E(id)}" data-row="${E(rowId)}" novalidate>${select('人工复核结论', 'quality-verdict', [['pending', '待复核'], ['pass', '人工通过'], ['fail', '人工不通过']], row.review?.verdict || 'pending')}${textarea('复核说明', 'quality-review-note', row.review?.note || '', '独立保存人工判断，不覆盖自动规则得分。', 3)}${formError}</form>`, footer: (row.runId ? link('查看调用追踪', 'task', { id: row.runId }) + S.btn('回流到评测集', 'quality-from-run', { variant: 'secondary', attrs: attrs(row.runId) }) : '') + S.btn('保存复核', 'quality-review-save') });
  }
  action('quality-create', () => openDataset());
  action('quality-edit', el => openDataset(el.dataset.id));
  action('quality-dataset-save', () => { const f = formValues('quality-dataset-form'); if (!S.validate(f, { name: '请填写名称' })) return; const value = { name: f.elements.name.value, description: f.elements['quality-description'].value, inputSchema: parseField(f.elements['quality-schema'].value, '输入 Schema') }; const d = f.dataset.id ? updateDataset(f.dataset.id, value) : createDataset(value); S.closeModal(); S.go('dataset', { id: d.id }); S.toast('评测集已保存'); });
  action('quality-example-add', el => openExample(el.dataset.id));
  action('quality-example-edit', el => openExample(el.dataset.id, el.dataset.example));
  action('quality-example-save', () => { const f = formValues('quality-example-form'), reference = parseField(f.elements['quality-reference'].value, '参考输出', true); const value = { input: parseField(f.elements['quality-input'].value, '输入'), ...(reference !== undefined ? { reference } : {}), expectedStatus: f.elements['quality-expected'].value, tags: f.elements.tags.value, split: f.elements.split.value, ...(ui.exampleSource ? { source: ui.exampleSource } : {}) }; saveExample(f.dataset.id, value, f.dataset.example || undefined); S.closeModal(); S.render(); S.toast('样例已保存'); });
  function confirmDelete(id, ids) { if (!ids.length) fail('先选择要删除的样例'); const d = editable(id); ui.pendingDelete = { id, ids }; S.modal({ title: '删除 ' + ids.length + ' 条样例？', subtitle: d.name, body: '<p>将从当前工作副本删除所选样例。已保存版本和历史评测结果仍然保留。</p>', footer: S.btn('保留样例', 'modal-close', { variant: 'secondary' }) + S.btn('删除样例', 'quality-delete-confirm', { variant: 'danger' }) }); }
  action('quality-example-delete', el => confirmDelete(el.dataset.id, [el.dataset.example]));
  action('quality-bulk-delete', el => confirmDelete(el.dataset.id, [...ui.selected]));
  action('quality-delete-confirm', () => { deleteExamples(ui.pendingDelete.id, ui.pendingDelete.ids); ui.selected.clear(); S.closeModal(); S.render(); S.toast('样例已删除，历史版本保持不变'); });
  action('quality-clear-selection', () => { ui.selected.clear(); S.render(); });
  action('quality-bulk-split', el => { if (!ui.selected.size) fail('先选择要移动的样例'); ui.moveId = el.dataset.id; S.modal({ title: '移动 ' + ui.selected.size + ' 条样例到分组', body: `<form id="quality-split-form" data-form="quality-split-form" novalidate>${S.field('分组名称', { id: 'quality-move-split', name: 'split', required: true })}${formError}</form>`, footer: S.btn('取消', 'modal-close', { variant: 'secondary' }) + S.btn('移动样例', 'quality-split-save') }); });
  action('quality-split-save', () => { moveExamples(ui.moveId, [...ui.selected], document.getElementById('quality-move-split').value); ui.selected.clear(); S.closeModal(); S.render(); S.toast('样例分组已更新'); });
  action('quality-archive', el => { ui.archiveId = el.dataset.id; S.modal({ title: '归档评测集？', subtitle: editable(el.dataset.id).name, body: '<p>归档后将停止编辑和新建评测。现有样例、版本和历史结果保留，可以随时恢复。</p>', footer: S.btn('保持使用', 'modal-close', { variant: 'secondary' }) + S.btn('归档评测集', 'quality-archive-confirm', { variant: 'danger' }) }); });
  action('quality-archive-confirm', () => { archiveDataset(ui.archiveId); S.closeModal(); S.go('quality'); S.toast('评测集已归档，可在已归档列表恢复'); });
  action('quality-restore', el => { archiveDataset(el.dataset.id, false); S.render(); S.toast('评测集已恢复'); });
  action('quality-archive-filter', () => S.go('quality', { tab: 'datasets', archived: S.params.archived === 'true' ? 'false' : 'true' }));
  action('quality-tab', el => S.go('quality', { tab: el.dataset.id }));
  action('quality-dataset-tab', el => S.go('dataset', { id: S.params.id, tab: el.dataset.id }));
  action('quality-page', el => S.go(S.route, { ...S.params, page: el.dataset.page }));
  action('quality-rule-add', el => openRules(el.dataset.id));
  action('quality-rule-edit', el => openRules(el.dataset.id, el.dataset.rule));
  action('quality-rule-save', () => { const f = formValues('quality-rule-form'), d = editable(f.dataset.id); if (!S.validate(f, { name: '请填写规则名称' })) return; const fields = f.elements['quality-rule-fields'].value.split('\n').filter(x => x.trim()).map(line => { const at = line.lastIndexOf(':'); return { path: line.slice(0, at).trim(), type: line.slice(at + 1).trim() }; }); const value = { id: f.dataset.rule || uid('rule'), name: f.elements.name.value, type: f.elements['quality-rule-type'].value, path: f.elements.path.value, enabled: f.elements.enabled.checked, fields }; const rules = d.rules.filter(r => r.id !== value.id).concat(value); saveRules(d.id, rules, d.threshold); S.closeModal(); S.render(); S.toast('评判规则已保存'); });
  action('quality-rule-delete', el => { const d = editable(el.dataset.id); ui.removeRule = { id: d.id, rule: el.dataset.rule }; S.modal({ title: '删除这条评判规则？', body: '<p>只影响工作副本，历史版本和已启动评测仍使用原规则。</p>', footer: S.btn('保留规则', 'modal-close', { variant: 'secondary' }) + S.btn('删除规则', 'quality-rule-delete-confirm', { variant: 'danger' }) }); });
  action('quality-rule-delete-confirm', () => { const d = editable(ui.removeRule.id); saveRules(d.id, d.rules.filter(r => r.id !== ui.removeRule.rule), d.threshold); S.closeModal(); S.render(); });
  action('quality-threshold', el => { const d = editable(el.dataset.id); ui.thresholdId = d.id; S.modal({ title: '设置通过阈值', subtitle: '启用规则等权计算。阈值会固定到每次评测的数据集快照中。', body: `<form id="quality-threshold-form" data-form="quality-threshold-form" novalidate>${S.field('通过阈值（%）', { id: 'quality-threshold-value', name: 'threshold', type: 'number', value: d.threshold, required: true })}${formError}</form>`, footer: S.btn('保存阈值', 'quality-threshold-save') }); });
  action('quality-threshold-save', () => { const d = editable(ui.thresholdId); saveRules(d.id, d.rules, document.getElementById('quality-threshold-value').value); S.closeModal(); S.render(); });
  action('quality-version', el => { ui.versionId = el.dataset.id; S.modal({ title: '保存数据集版本', subtitle: '固定当前样例、Schema 和规则，之后可直接选择此版本评测。', body: `<form id="quality-version-form" data-form="quality-version-form" novalidate>${S.field('版本说明', { id: 'quality-version-note', name: 'note', placeholder: '例如：补齐空结果与异常输入样例' })}${formError}</form>`, footer: S.btn('取消', 'modal-close', { variant: 'secondary' }) + S.btn('保存版本', 'quality-version-save') }); });
  action('quality-version-save', () => { publishDataset(ui.versionId, document.getElementById('quality-version-note').value); S.closeModal(); S.render(); S.toast('数据集版本已保存'); });
  action('quality-import', el => openImport(el.dataset.id));
  action('quality-import-preview', () => { const f = formValues('quality-import-form'), mappingRoot = document.getElementById('quality-import-mapping'), format = f.elements['quality-import-format'].value, text = f.elements['quality-import-text'].value; const parsed = parseImport(text, format); let mapping; if (mappingRoot.children.length && stable(ui.importHeaders) === stable(parsed.headers)) mapping = Object.fromEntries(['input', 'reference', 'split', 'tags', 'expectedStatus'].map(key => [key, document.getElementById('quality-map-' + key).value])); else { ui.importHeaders = parsed.headers.slice(); mapping = defaultMapping(parsed.headers); mappingRoot.innerHTML = '<h3>字段映射</h3><div class="quality-three-columns">' + [['input', '输入'], ['reference', '参考输出'], ['split', '分组'], ['tags', '标签'], ['expectedStatus', '预期状态']].map(([key, name]) => select(name, 'quality-map-' + key, [['', key === 'input' ? '请选择输入列' : '不导入此字段'], ...parsed.headers.map(x => [x, x])], mapping[key])).join('') + '</div>'; } const preview = previewImport(f.dataset.id, text, format, mapping); ui.importDraft = preview; document.getElementById('quality-form-error').textContent = ''; document.getElementById('quality-import-preview').innerHTML = `<p><strong>${preview.valid} 条有效</strong> · ${preview.errors} 条有误 · ${preview.rows.filter(x => x.duplicate).length} 条与现有输入重复</p>${table(['记录', '预览 / 错误'], preview.rows.slice(0, 20).map(row => `<tr><td>${row.row}</td><td>${row.error ? `<span class="field-error">${E(row.error)}</span>` : `<span class="quality-preview">${E(display(row.value.input))}</span>${row.duplicate ? S.badge('重复', 'warning') : ''}`}</td></tr>`).join(''), '没有记录')}<p class="small muted">预览前 20 条；导入将处理全部有效记录。错误记录不会导入，请修正后另行提交。</p>`; document.getElementById('quality-import-apply-button').disabled = !preview.valid; });
  action('quality-import-apply', () => { if (!ui.importDraft) fail('内容已变化，请重新预览'); const result = importExamples(ui.importDraft, document.getElementById('quality-import-strategy').value); S.closeModal(); S.render(); S.toast(`新增 ${result.added} 条，更新 ${result.replaced} 条，跳过 ${result.skipped} 条；${result.invalid} 条错误未导入`); });
  action('quality-export', el => { ui.exportId = el.dataset.id; S.modal({ title: '导出评测集', body: select('导出格式', 'quality-export-format', [['jsonl', 'JSONL 样例'], ['json', 'JSON（含 Schema 和规则）'], ['csv', 'CSV 样例']]) + '<p class="small muted">CSV 对以公式符号开头的文本增加保护前缀；JSON / JSONL 保留原始值。</p>', footer: S.btn('下载', 'quality-export-save', { icon: 'download' }) }); });
  action('quality-export-save', () => { const format = document.getElementById('quality-export-format').value; S.download('dataset-' + ui.exportId + '.' + format, exportDataset(ui.exportId, format), format === 'csv' ? 'text/csv' : format === 'json' ? 'application/json' : 'application/x-ndjson'); S.closeModal(); });
  action('quality-new-experiment', el => openExperiment(el.dataset.id));
  action('quality-experiment-start', () => { const f = formValues('quality-experiment-form'); if (!S.validate(f, { name: '请填写任务名称' })) return; const e = startExperiment({ datasetId: f.dataset.id, name: f.elements.name.value, targetKey: f.elements['quality-target'].value, versionId: f.elements['quality-version-id'].value, split: f.elements['quality-run-split'].value }); S.closeModal(); S.go('experiment', { id: e.id }); S.toast('评测已开始，配置已固定'); });
  action('quality-stop', el => { stopExperiment(el.dataset.id); S.render(); S.toast('已停止评测，未执行样例不会自动重放', 'info'); });
  action('quality-retry', el => { const e = retryExperiment(el.dataset.id); S.go('experiment', { id: e.id }); S.toast('已按原快照新建重试任务'); });
  action('quality-result', el => openResult(el.dataset.id, el.dataset.row));
  action('quality-review-save', () => { const f = formValues('quality-review-form'); reviewResult(f.dataset.id, f.dataset.row, f.elements['quality-verdict'].value, f.elements['quality-review-note'].value); S.closeModal(); S.render(); S.toast('人工复核已保存，自动结果保持原样'); });
  action('quality-from-run', el => openAddFromRun(el.dataset.id));
  action('quality-fromrun-next', () => { const id = document.getElementById('quality-fromrun-dataset').value; openExample(id, null, ui.fromRun.preset); });
  ['dataset', 'example', 'rule', 'split', 'threshold', 'version', 'review'].forEach(name => S.form('quality-' + name + '-form', () => S.actions['quality-' + name + '-save']()));
  S.form('quality-experiment-form', () => S.actions['quality-experiment-start']());
  S.form('quality-import-form', () => S.actions['quality-import-preview']());
  S.action('gov-new-eval', () => openExperiment());
  S.action('gov-dataset', el => { const id = el?.dataset?.id === 'research' ? 'quality-research' : el?.dataset?.id === 'safety' ? 'quality-workflow' : el?.dataset?.id; if (dataset(id)) S.go('dataset', { id }); else S.go('quality'); });
  S.save();
}());
