'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { setup } = require('./expanded-harness.cjs');
function load(saved) {
  const h = setup(saved);
  if (!h.S.Quality) vm.runInContext(fs.readFileSync(path.join(__dirname, '../quality.js'), 'utf8'), h.context, { filename: 'quality.js' });
  return h;
}
function addFlow(R, id, word) {
  const flow = { id, title: '质量验证 ' + id, version: '1.0', published: true, graphSchema: 2, inputs: {}, nodes: [
    R.newNode('input', { id: 'start', config: { fields: [{ name: 'message', type: 'string', required: true }] } }),
    R.newNode('template', { id: 'format', config: { template: word + ' {{input.message}}' } }),
    R.newNode('output', { id: 'finish', config: { mode: 'data' }, bindings: { answer: { mode: 'ref', path: 'nodes.format.text' } } })
  ], edges: [{ id: 'a', source: 'start', target: 'format', sourcePort: 'next' }, { id: 'b', source: 'format', target: 'finish', sourcePort: 'next' }] };
  flow.publishedSnapshot = R.snapshot(flow); flow.versions = [R.snapshot(flow)]; R.flows.push(flow); return flow;
}
async function main() {
  const { S, R, storage } = load(), Q = S.Quality;
  let checks = 0;
  const pass = message => { checks++; console.log('PASS: ' + message); };
  const d = Q.createDataset({ name: '维护测试', inputSchema: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] } });
  const a = Q.saveExample(d.id, { input: { message: 'alpha' }, reference: 'alpha', split: '回归', tags: ['核心'] });
  const b = Q.saveExample(d.id, { input: { message: 'beta' }, reference: 'unmatched', split: '回归' });
  assert.throws(() => Q.saveExample(d.id, { input: { message: 12 } }), /string|类型|文本/);
  Q.saveRules(d.id, [{ name: '回答包含参考', type: 'contains', path: 'answer', enabled: true }], 100);
  const v = Q.publishDataset(d.id, '起始基线');
  Q.saveExample(d.id, { input: { message: 'changed' }, reference: 'changed', split: '开发' }, a.id);
  assert.equal(v.examples[0].input.message, 'alpha');
  Q.deleteExamples(d.id, [a.id, b.id]); assert.equal(d.examples.length, 0); assert.equal(v.examples.length, 2);
  pass('样例增改删与类型校验，删除最后一条后历史版本保持不变');
  Q.archiveDataset(d.id); assert.throws(() => Q.saveExample(d.id, { input: {} }), /恢复/); Q.archiveDataset(d.id, false);
  assert.equal(d.archived, false); pass('归档阻止编辑，恢复后继续维护');
  const csv = 'input,reference,split,tags\r\n"{""message"":""alpha, beta""}","""alpha""",测试,"[""CSV""]"\r\n"{""message"":""line\\nnext""}","""line""",测试,[]';
  const preview = Q.previewImport(d.id, csv, 'csv');
  assert.equal(preview.valid, 2); assert.equal(preview.rows[0].value.input.message, 'alpha, beta');
  let imported = Q.importExamples(preview); assert.equal(imported.added, 2);
  imported = Q.importExamples(Q.previewImport(d.id, csv, 'csv'), 'skip'); assert.equal(imported.skipped, 2);
  const jsonl = '{"input":{"message":"gamma"},"reference":"gamma"}\nnot-json\n{"input":{"message":2}}';
  const partial = Q.previewImport(d.id, jsonl, 'jsonl'); assert.equal(partial.valid, 1); assert.equal(partial.errors, 2);
  imported = Q.importExamples(partial); assert.equal(imported.added, 1); assert.equal(imported.invalid, 2);
  assert.throws(() => Q.parseImport('a,b\n"broken', 'csv'), /引号/);
  assert.equal(JSON.parse(Q.exportDataset(d.id, 'json')).examples.length, 3);
  pass('CSV 引号/JSONL 行错误、预览、重复策略与真实导出');
  const stale = Q.previewImport(d.id, '[{"input":{"message":"new"}}]', 'json');
  Q.saveExample(d.id, { input: { message: 'parallel edit' } });
  assert.throws(() => Q.importExamples(stale), /重新预览/); pass('导入预览过期时阻止覆盖新修改');
  const preserved = JSON.parse(storage.get('otryx-studio-demo'));
  const reload = load(preserved); assert.equal(reload.S.Quality.getDataset(d.id).examples.length, 4);
  pass('用户维护的数据在状态重载后保留');
  const flow = addFlow(R, 'quality-test-flow', 'hello');
  const ex = Q.startExperiment({ datasetId: d.id, versionId: v.id, targetKey: 'workflow|' + flow.id + '|1.0', speed: 0 });
  flow.publishedSnapshot.nodes.find(n => n.id === 'format').config.template = 'mutated';
  await Q.waitForExperiment(ex.id);
  assert.equal(ex.status, 'done'); assert.equal(ex.results[0].status, 'passed'); assert.equal(ex.results[1].status, 'failed');
  assert.equal(ex.datasetSnapshot.id, d.id); assert.equal(ex.datasetSnapshot.versionId, v.id);
  assert.equal(ex.results[0].actual.answer, 'hello alpha'); assert.equal(ex.results[0].checks.length, 1);
  assert.equal(Q.summarize(ex).passed, 1); assert.equal(Q.summarize(ex).scored, 2);
  assert(ex.results.every(row => row.runId && row.traceId));
  pass('评测真实执行冻结版本与样例，输出变化决定规则得分');
  const retry = Q.retryExperiment(ex.id); await Q.waitForExperiment(retry.id);
  assert.equal(retry.results.length, 1); assert.equal(retry.results[0].exampleId, b.id); assert.equal(retry.results[0].actual.answer, 'hello beta');
  Q.reviewResult(ex.id, ex.results[1].id, 'pass', '人工接受差异'); assert.equal(ex.results[1].status, 'failed'); assert.equal(ex.results[1].review.verdict, 'pass');
  const comparisons = Q.compareExperiments(retry.id, ex.id); assert.equal(comparisons[0].comparable, true);
  pass('重试使用旧配置，人工复核独立于规则结果，并能逐样例比较');
  const noReturn = Q.evaluate({ expectedStatus: 'done' }, { status: 'done' }, [{ id: 'status', name: '正常完成', type: 'status' }], 100);
  assert(noReturn.passed); assert.equal(noReturn.score, 100);
  assert.equal(Q.evaluate({ reference: 'none' }, { status: 'done' }, [{ id: 'contains', type: 'contains' }]).passed, false);
  pass('无返回值流程可按状态通过，不会被强制判成文件缺失');
  const unsafe = Q.createDataset({ name: '保护测试' }); Q.saveRules(unsafe.id, [{ type: 'status', name: '状态' }], 100);
  Q.saveExample(unsafe.id, { input: { topic: '不能写入', destination: '/示例' } });
  const receiptCount = R.connections.length && S.state.capabilities.receipts.length;
  const blocked = Q.startExperiment({ datasetId: unsafe.id, targetKey: Q.targets().find(x => x.id === 'flow-sync').key, speed: 0 });
  await Q.waitForExperiment(blocked.id);
  assert.equal(blocked.results[0].status, 'blocked'); assert.equal(blocked.results[0].score, null);
  assert.equal(S.state.capabilities.receipts.length, receiptCount);
  pass('写工具在发送前受保护阻断，零写入回执且不虚构得分');
  const back = Q.fromRun(ex.results[0].runId); assert.equal(back.source.traceId, ex.results[0].traceId); assert.equal(back.reference.answer, 'hello alpha');
  const collected = Q.saveExample(d.id, back); assert.equal(collected.source.runId, ex.results[0].runId);
  pass('运行输入与实际输出可回流为可编辑样例，保留追踪来源');
  const stopping = Q.startExperiment({ datasetId: d.id, versionId: v.id, targetKey: 'workflow|' + flow.id + '|1.0', speed: 20 });
  Q.stopExperiment(stopping.id); await Q.waitForExperiment(stopping.id);
  assert.equal(stopping.status, 'stopped'); assert.equal(stopping.results[1].status, 'queued');
  const changedRules = JSON.parse(JSON.stringify(ex)); changedRules.id = 'different-rules'; changedRules.datasetSnapshot.threshold = 50; S.state.qualityData.experiments.push(changedRules);
  assert.equal(Q.compareExperiments(ex.id, changedRules.id)[0].comparable, false);
  pass('停止保留未执行样例，规则变化时不显示误导性的比较分差');
  const renders = [];
  for (const [route, params] of [['quality', {}], ['quality', { tab: 'experiments' }], ['dataset', { id: d.id }], ['dataset', { id: d.id, tab: 'rules' }], ['dataset', { id: d.id, tab: 'versions' }], ['experiment', { id: ex.id }], ['experiment', { id: retry.id, compare: ex.id }]]) {
    S.route = route; S.params = params; const html = S.pages[route].render(); assert(html.length > 100); assert(!html.includes('undefined')); renders.push({ route: route + ':' + (params.tab || ''), html });
  }
  S.modal = options => { renders.push({ route: 'modal:' + options.title, html: '<h2 id="dialog-title">' + options.title + '</h2>' + (options.body || '') + (options.footer || '') }); };
  S.drawer = S.modal;
  for (const [name, dataset] of [
    ['quality-create', {}], ['quality-edit', { id: d.id }], ['quality-example-add', { id: d.id }],
    ['quality-example-edit', { id: d.id, example: d.examples[0].id }], ['quality-rule-add', { id: d.id }],
    ['quality-rule-edit', { id: d.id, rule: d.rules[0].id }], ['quality-threshold', { id: d.id }],
    ['quality-version', { id: d.id }], ['quality-new-experiment', { id: d.id }], ['quality-import', { id: d.id }],
    ['quality-result', { id: ex.id, row: ex.results[0].id }], ['quality-from-run', { id: ex.results[0].runId }],
    ['quality-export', { id: d.id }], ['quality-archive', { id: d.id }]
  ]) {
    const before = renders.length; await S.actions[name]({ dataset }); assert.equal(renders.length, before + 1, name + ' opens its own dialog');
  }
  for (const render of renders) {
    for (const [, action] of render.html.matchAll(/data-action="([^"]+)"/g)) assert(S.actions[action], 'Missing action ' + action);
    for (const [, form] of render.html.matchAll(/data-form="([^"]+)"/g)) assert(S.forms[form], 'Missing form ' + form);
  }
  const destination = path.join(__dirname, '.generated', 'quality-rendered.json'); fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, JSON.stringify(renders), 'utf8');
  console.log('PASS: ' + checks + ' quality behavior groups; ' + renders.length + ' render variants');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
