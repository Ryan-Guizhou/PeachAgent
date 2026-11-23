(function () {
  'use strict';
  const S = window.Studio;
  const E = S.escape;
  const R = () => S.Runtime;
  const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const ui = { query: '', filter: 'all', tabs: {}, debug: {}, historyPage: 1, pages: {} };
  const scenarios = [{ id: 'success', label: '正常返回' }, { id: 'empty', label: '空结果' }, { id: 'tool_error', label: '工具执行失败' }, { id: 'timeout', label: '调用超时' }, { id: 'schema_error', label: '返回结构不匹配' }, { id: 'protocol_error', label: '协议错误' }, { id: 'auth_error', label: '授权失效' }];
  const tabDefs = [{ id: 'overview', label: '概览与连接' }, { id: 'capabilities', label: '能力清单' }, { id: 'debug', label: '调试台' }, { id: 'history', label: '调用记录' }, { id: 'dependencies', label: '引用与版本' }];
  const now = () => new Date().toISOString();
  const time = value => value ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)) : '尚未测试';
  const button = (text, action, data = {}, options = {}) => S.btn(text, action, { variant: 'secondary', small: true, ...options, attrs: Object.entries(data).map(([key, value]) => `data-${key}="${E(value)}"`).join(' ') + (options.attrs ? ' ' + options.attrs : '') });
  const link = (text, route, params = {}, icon) => `<a class="btn btn-secondary btn-sm" href="#${E(route)}${Object.keys(params).length ? '?' + E(new URLSearchParams(params).toString()) : ''}">${icon ? S.icon(icon, 14) : ''}<span>${E(text)}</span></a>`;
  const select = (label, id, value, choices, extra = '') => `<div class="field"><label class="field-label" for="${E(id)}">${E(label)}</label><select class="select" id="${E(id)}" name="${E(id)}" aria-describedby="${E(id)}-error" ${extra}>${choices.map(item => { const x = typeof item === 'string' ? { id: item, label: item } : item; return `<option value="${E(x.id)}" ${String(x.id) === String(value) ? 'selected' : ''}>${E(x.label)}</option>`; }).join('')}</select><p class="field-error" id="${E(id)}-error"></p></div>`;
  const code = (value, extra = '') => `<pre class="cap-code ${extra}">${E(typeof value === 'string' ? value : JSON.stringify(value, null, 2))}</pre>`;
  const capData = () => S.state.capabilities;
  const connections = () => R().connections || [];
  const plugins = () => R().plugins || [];
  const tools = () => R().tools || [];
  const getConn = id => connections().find(x => x.id === id);
  const getPlugin = id => plugins().find(x => x.id === id);
  const getTool = id => tools().find(x => x.id === id);
  const isPlugin = () => S.route === 'plugin-detail';
  const context = () => isPlugin() ? (S.params.id ? getPlugin(S.params.id) : plugins()[0]) : (S.params.id ? getConn(S.params.id) : connections().find(x => x.kind === 'mcp'));
  const ownerId = () => `${isPlugin() ? 'plugin' : 'mcp'}:${context()?.id || ''}`;
  const ownerTools = owner => isPlugin() ? tools().filter(t => (owner.toolIds || []).includes(t.id) || t.pluginId === owner.id) : tools().filter(t => t.connectionId === owner.id);
  const ownerConnections = owner => isPlugin() ? connections().filter(c => c.pluginId === owner.id || (owner.toolIds || []).some(id => getTool(id)?.connectionId === c.id)) : [owner];
  const detailRoute = () => isPlugin() ? 'plugin-detail' : 'mcp-detail';
  const selectedTab = () => S.params.tab || ui.tabs[ownerId()] || 'overview';
  const titleOf = item => item.title || item.name || item.id;
  const status = item => item.status === 'available' || item.installed === false ? S.badge('未安装', 'neutral') : item.enabled === false || item.status === 'disabled' ? S.badge('已停用', 'neutral') : item.status === 'unverified' ? S.badge('待配置能力', 'warning') : item.status === 'auth_required' ? S.badge('待授权', 'warning') : item.status === 'error' ? S.badge('连接异常', 'danger') : item.status === 'available' || item.installed === false ? S.badge('未安装', 'neutral') : S.badge('可用 · 模拟', 'success');
  const isReady = c => !!c && c.enabled !== false && c.status === 'ready';
  const scenarioName = id => scenarios.find(s => s.id === id)?.label || id;
  const runStatus = run => { const labels = { running: ['执行中', 'info'], waiting: ['等待确认', 'warning'], done: ['执行成功', 'success'], failed: ['执行失败', 'danger'], rejected: ['已拒绝', 'warning'], stopped: ['已停止', 'neutral'] }; const x = labels[run?.status] || ['未运行', 'neutral']; return S.badge(x[0], x[1]); };
  const historyFor = (toolIds, connIds = []) => S.state.runs.filter(run => run.engine === 'graph' && (run.toolCalls || []).some(call => toolIds.includes(call.toolId) || connIds.includes(call.connectionId)));
  const uses = (toolIds, connIds = []) => {
    const out = [];
    S.state.agents.forEach(agent => {
      const matches = (agent.capabilityBindings || []).filter(b => toolIds.includes(b.toolId) || connIds.includes(b.connectionId));
      if (matches.length) out.push({ name: agent.name, kind: 'Agent 草稿', version: agent.version, route: 'agent', id: agent.id, count: matches.length });
      const pub = (agent.publishedConfig?.capabilityBindings || []).filter(b => toolIds.includes(b.toolId) || connIds.includes(b.connectionId));
      if (pub.length) out.push({ name: agent.name, kind: 'Agent 发布版', version: agent.publishedConfig.version || agent.version, route: 'agent', id: agent.id, count: pub.length });
    });
    (R().flows || []).forEach(flow => {
      const matches = (flow.nodes || []).filter(n => toolIds.includes(n.config?.toolId));
      if (matches.length) out.push({ name: flow.title, kind: '工作流', version: flow.version, route: 'workflow', id: flow.id, count: matches.length });
    });
    return out;
  };
  const recordVersion = (item, message, detail) => { item.history = item.history || []; item.history.unshift({ id: S.uid('config'), version: item.version || '1.0.0', message, detail: detail || '', time: now() }); };
  const nextVersion = version => { const parts = String(version || '1.0.0').split('.').map(x => Number(x) || 0); while (parts.length < 3) parts.push(0); parts[2] += 1; return parts.join('.'); };
  function debugState(owner) {
    const key = ownerId();
    const available = ownerTools(owner);
    if (!ui.debug[key]) ui.debug[key] = { toolId: S.params.tool || available[0]?.id || '', mode: 'form', resultMode: 'structured', scenario: 'success', args: {}, runs: {} };
    const state = ui.debug[key];
    if (S.params.tool && available.some(t => t.id === S.params.tool)) state.toolId = S.params.tool;
    if (!available.some(t => t.id === state.toolId)) state.toolId = available[0]?.id || '';
    const tool = getTool(state.toolId);
    if (tool && state.args[tool.id] === undefined) state.args[tool.id] = clone(tool.example || {});
    return state;
  }
  function recentRunsHtml(runs, limit = 5) {
    return runs.length ? runs.slice(0, limit).map(run => `<div class="cap-instance-row"><div><strong><a href="#task?id=${E(run.id)}">${E(run.title)}</a></strong><p>${E(time(run.created))} · ${(run.toolCalls || []).length} 次调用</p></div>${runStatus(run)}</div>`).join('') : '<p class="cap-history-empty">还没有调用记录。选一个工具进行第一次测试。</p>';
  }
  function serviceRow(conn) {
    const list = tools().filter(t => t.connectionId === conn.id);
    const resources = (R().resources || []).filter(r => r.connectionId === conn.id);
    const prompts = (R().prompts || []).filter(p => p.connectionId === conn.id);
    return `<article class="cap-service-row"><div class="cap-service-icon">${S.icon(conn.transport === 'stdio' ? 'terminal' : 'plug', 22)}</div><div class="cap-service-copy"><h3><a href="#mcp-detail?id=${E(conn.id)}">${E(conn.name)}</a>${status(conn)}</h3><p>${E(conn.description || conn.endpoint || conn.command || '个人空间的 MCP 连接')}</p><div class="cap-row-meta"><span class="mono">${E(conn.transport || 'Streamable HTTP')}</span><span>${E(conn.location || '平台 Runner')}</span><span>${list.length} Tools · ${resources.length} Resources · ${prompts.length} Prompts</span></div></div><div class="cap-row-actions">${link('打开调试台', 'mcp-detail', { id: conn.id, tab: 'debug' }, 'terminal')}${button('配置', 'cap-config', { id: conn.id }, { variant: 'ghost', icon: 'settings' })}</div></article>`;
  }
  function pluginRow(plugin) {
    const list = tools().filter(t => (plugin.toolIds || []).includes(t.id) || t.pluginId === plugin.id);
    return `<article class="cap-service-row"><div class="cap-service-icon cap-plugin-icon">${S.icon('box', 22)}</div><div class="cap-service-copy"><h3><a href="#plugin-detail?id=${E(plugin.id)}">${E(plugin.name)}</a>${status(plugin)}</h3><p>${E(plugin.description || '可复用的工具扩展包')}</p><div class="cap-row-meta"><span class="mono">v${E(plugin.version)}</span><span>${E(plugin.author || 'OTRYX 示例库')}</span><span>${list.length} 个具体动作</span></div></div><div class="cap-row-actions">${link('管理插件', 'plugin-detail', { id: plugin.id }, 'arrow')}</div></article>`;
  }
  function resourceTabs() {
    return '<nav class="resource-tabs" aria-label="工具资源分类">' + [['capabilities','全部工具'],['mcp','MCP 连接'],['plugins','插件']].map(([route,label]) => `<a href="#${route}" ${S.route===route?'aria-current="page" class="active"':''}>${label}</a>`).join('') + '</nav>';
  }
  function paginate(items) {
    const count=Math.max(1,Math.ceil(items.length/8)),page=Math.max(1,Math.min(ui.pages[S.route]||1,count));ui.pages[S.route]=page;
    return {rows:items.slice((page-1)*8,page*8),footer:`<div class="cap-pager"><span>共 ${items.length} 项 · 第 ${page} / ${count} 页</span><div class="cap-inline-actions">${button('上一页','cap-list-page',{page:page-1},{attrs:page===1?'disabled':''})}${button('下一页','cap-list-page',{page:page+1},{attrs:page===count?'disabled':''})}</div></div>`};
  }
  function capabilitiesPage() {
    const matches=tools().filter(tool=>[tool.title,tool.name,tool.id,getConn(tool.connectionId)?.name].join(' ').toLowerCase().includes(ui.query.toLowerCase())),list=paginate(matches);
    return `<div class="cap-page">${S.header('','工具与连接','在这里配置工具来源、检查参数，并查看实际调用记录。',button('导入插件','cap-import-plugin',{}, {icon:'upload',small:false})+button('添加 MCP 连接','cap-new-connection',{}, {icon:'plus',variant:'primary',small:false}))}${resourceTabs()}<div class="toolbar">${S.search('cap-search','搜索工具名称、动作或连接',ui.query)}<span class="small muted">${matches.length} 个动作</span></div><section class="panel cap-table-panel"><div class="product-table-wrap"><table class="product-table"><thead><tr><th scope="col">工具 / 动作</th><th scope="col">来源</th><th scope="col">权限</th><th scope="col">状态</th><th scope="col">操作</th></tr></thead><tbody>${list.rows.map(tool=>{const conn=getConn(tool.connectionId),plugin=plugins().find(p=>(p.toolIds||[]).includes(tool.id)),route=tool.kind==='plugin'?'plugin-detail':'mcp-detail',id=plugin?.id||conn?.id||'';return `<tr><td><div class="cap-table-tool"><strong>${E(titleOf(tool))}</strong><span class="small mono muted">${E(tool.id)} · v${E(tool.version||'1.0')}</span></div></td><td><a class="text-link" href="#${route}?id=${E(id)}">${E(plugin?.name||conn?.name||'来源已移除')}</a><div class="small muted">${tool.kind==='plugin'?'插件动作':'MCP Tool'}</div></td><td>${S.badge(tool.write?'写入 · 需要确认':'只读',tool.write?'warning':'neutral')}</td><td>${status(plugin&&(plugin.enabled===false||plugin.installed===false||['disabled','available'].includes(plugin.status))?plugin:conn||{status:'error'})}</td><td><div class="product-row-actions">${button('调试','cap-debug-tool',{id:tool.id},{icon:'play'})}${button('Schema','cap-schema',{id:tool.id},{variant:'ghost'})}</div></td></tr>`;}).join('')}</tbody></table></div>${!matches.length?S.empty('没有匹配的工具','调整搜索，或添加一个连接和插件。',button('清除搜索','cap-clear-search')):''}</section>${list.footer}<p class="cap-invariant">${S.icon('info',14)}连接配置与 Agent 授权分别管理；工具在当前原型中使用本地模拟适配器。</p></div>`;
  }
  function mcpPage() {
    const all = connections().filter(c => c.kind === 'mcp');
    const filtered = all.filter(c => `${c.name} ${c.endpoint} ${c.transport}`.toLowerCase().includes(ui.query.toLowerCase()) && (ui.filter === 'all' || (ui.filter === 'ready' ? isReady(c) : !isReady(c))));
    const list=paginate(filtered),legacy=(S.state.contentStore?.legacyConnections||[]).filter(a=>!all.some(c=>c.migratedAssetId===a.id||c.templateId===a.id));
    return `<div class="cap-page">${S.header('','工具与连接','管理接入 Agent 和工作流的 MCP 服务。向外提供 API 请前往「发布与 API」。',button('添加 MCP 连接','cap-new-connection',{}, {icon:'plus',variant:'primary',small:false}))}${resourceTabs()}${legacy.length?`<section class="panel cap-detail-panel"><h2>待配置的历史连接模板</h2><p class="field-help">${legacy.length} 份原资产记录已归并到这里，保存连接后可继续调试。</p>${legacy.map(a=>`<div class="cap-instance-row"><strong>${E(a.name)}</strong>${button('配置连接','cap-legacy-template',{id:a.id})}</div>`).join('')}</section>`:''}<div class="toolbar">${S.search('cap-search','搜索连接名称、地址或传输方式',ui.query)}${S.tabs([{id:'all',label:'全部',count:all.length},{id:'ready',label:'可用'},{id:'attention',label:'待处理'}],ui.filter,'cap-filter')}</div><div class="cap-card-list">${list.rows.map(serviceRow).join('')||S.empty('没有匹配的连接','调整搜索条件，或新建一个 MCP 连接。',button('清除筛选','cap-clear-search'))}</div>${list.footer}<p class="cap-invariant">${S.icon('terminal',14)}地址、授权与能力发现在本地模拟；不会访问外部服务或启动本地进程。</p></div>`;
  }
  function pluginsPage() {
    const filtered=plugins().filter(p=>`${p.name} ${p.description}`.toLowerCase().includes(ui.query.toLowerCase())),list=paginate(filtered);
    return `<div class="cap-page">${S.header('','工具与连接','安装扩展包后，选择配置实例、调试具体动作，再授权给应用。',button('导入插件清单','cap-import-plugin',{}, {icon:'upload',variant:'primary',small:false}))}${resourceTabs()}<div class="toolbar">${S.search('cap-search','搜索插件或动作',ui.query)}<span class="small muted">${filtered.length} 个插件包</span></div><div class="cap-card-list">${list.rows.map(pluginRow).join('')||S.empty('没有找到插件','调整搜索条件，或导入插件清单。',button('清除搜索','cap-clear-search'))}</div>${list.footer}<p class="cap-invariant">${S.icon('shield',14)}安装与启用不会自动授权给所有 Agent。当前原型仅导入受控模拟适配器的清单。</p></div>`;
  }
  function detailHeader(owner) {
    const plugin = isPlugin();
    const deps = uses(ownerTools(owner).map(t => t.id), ownerConnections(owner).map(c => c.id));
    const main = plugin ? button(owner.status === 'available' || owner.installed === false ? '安装插件' : owner.enabled === false ? '启用插件' : '停用插件', 'cap-plugin-toggle', { id: owner.id }, { icon: owner.enabled === false ? 'play' : 'pause', variant: 'secondary' }) : button(owner.enabled === false ? '启用连接' : '停用连接', 'cap-connection-toggle', { id: owner.id }, { variant: 'secondary' });
    return `<a class="cap-back" href="#${plugin ? 'plugins' : 'mcp'}">${S.icon('arrow', 13)}${plugin ? '全部插件' : '全部 MCP 连接'}</a><div class="cap-detail-top"><div class="cap-detail-title"><span class="cap-service-icon ${plugin ? 'cap-plugin-icon' : ''}">${S.icon(plugin ? 'box' : 'plug', 26)}</span><div><h1>${E(owner.name)}</h1><p>${E(owner.description || (plugin ? '可复用的工具扩展，按具体动作配置和授权。' : '个人空间的 MCP 服务连接。'))}</p><div class="cap-title-meta">${status(owner)}${S.badge('v' + (owner.version || '1.0.0'))}<span class="cap-mini-count">${ownerTools(owner).length} 个工具 · ${deps.length} 处引用</span></div></div></div><div class="cap-row-actions">${main}${plugin ? button('升级检查', 'cap-plugin-upgrade', { id: owner.id }, { icon: 'refresh' }) : button('编辑连接', 'cap-config', { id: owner.id }, { icon: 'settings' })}</div></div><div class="cap-detail-tabs">${S.tabs(tabDefs, selectedTab(), 'cap-tab')}</div>`;
  }
  function overview(owner) {
    const conn = ownerConnections(owner)[0];
    const plugin = isPlugin();
    const rows = plugin ? [['安装来源', owner.source || '官方示例库 · 已审核模板'], ['插件作者', owner.author || 'OTRYX 示例库'], ['当前版本', 'v' + owner.version], ['配置实例', String(ownerConnections(owner).length) + ' 个'], ['导出能力', ownerTools(owner).map(t => titleOf(t)).join('、')], ['执行环境', '隔离插件 Runner · 本地模拟']] : [['传输方式', owner.transport || 'Streamable HTTP'], ['执行位置', owner.location || '平台 Runner'], ['服务地址', owner.endpoint || owner.command || '未配置'], ['协议版本', owner.protocolVersion || '按服务协商'], ['凭证引用', owner.credentialRef || '无需凭证'], ['配置版本', 'v' + owner.version], ['最近检查', time(owner.lastTestAt)]];
    return `<div class="cap-overview-grid"><section class="panel cap-detail-panel"><h2>${plugin ? '插件信息' : '连接配置'}</h2><dl class="cap-definition">${rows.map(([k, v]) => `<dt>${E(k)}</dt><dd${/地址|版本|引用/.test(k) ? ' class="mono"' : ''}>${E(v)}</dd>`).join('')}</dl><div class="cap-mini-notice">${plugin ? '安装插件后，仍需选择具体配置实例与动作。升级只影响后续调用，不要求整体 Runtime 重启。' : '此处的凭证引用用于接入外部 MCP 服务。向外提供应用 API 所用的 Key，在「发布与 API」中维护。'}</div><div class="cap-inline-actions" style="margin-top:18px">${plugin ? button('新增配置实例', 'cap-new-instance', { id: owner.id }, { icon: 'plus' }) : button('验证连接', 'cap-test-connection', { id: owner.id }, { icon: 'check', variant: 'primary' })}${!plugin ? button('刷新能力', 'cap-refresh-schema', { id: owner.id }, { icon: 'refresh' }) : button('查看插件清单', 'cap-plugin-manifest', { id: owner.id }, { icon: 'code' }) + (owner.status !== 'available' && owner.installed !== false ? button('卸载插件', 'cap-plugin-remove', { id: owner.id }, { variant: 'ghost', icon: 'trash' }) : '')}</div>${owner.health ? `<div class="cap-mini-notice" role="status">${E(owner.health.message || '连接检查已完成（模拟）')} · ${E(time(owner.lastTestAt))}</div>` : ''}</section><section class="panel cap-detail-panel"><h2>调用边界</h2><div class="cap-permission">${S.icon('eye', 17)}<div><strong>按动作授权</strong><p>Agent 仅能调用显式挂载的工具；MCP 注解不会自动授予权限。</p></div></div><div class="cap-permission">${S.icon('shield', 17)}<div><strong>写入前确认</strong><p>外部写入先展示参数和目标位置，由你确认后继续。</p></div></div><div class="cap-permission">${S.icon('clock', 17)}<div><strong>取消不代表回滚</strong><p>已完成的写入不会因后续停止而自动撤销，回执保留在运行记录中。</p></div></div><div class="cap-permission">${S.icon('terminal', 17)}<div><strong>可追溯的调用</strong><p>参数、原始结果、错误和请求标识进入统一 Trace。</p></div></div></section></div>${plugin ? `<section class="panel cap-detail-panel" style="margin-top:20px"><div class="cap-section-head"><h2>配置实例</h2>${button('新增实例', 'cap-new-instance', { id: owner.id }, { icon: 'plus' })}</div>${ownerConnections(owner).map(c => `<div class="cap-instance-row"><div><strong>${E(c.name)}</strong><p>${E(c.endpoint || c.location || '插件 Runner')} · ${E(c.credentialRef || '无需凭证')} · v${E(c.version)}</p></div><div class="cap-row-actions">${status(c)}${button('配置', 'cap-config', { id: c.id }, { variant: 'ghost', icon: 'settings' })}${button(c.enabled === false ? '启用' : '停用', 'cap-connection-toggle', { id: c.id }, { variant: 'ghost' })}</div></div>`).join('') || S.empty('还没有配置实例', '添加一个实例，选择目标位置与凭证引用。')}</section>` : ''}`;
  }
  function toolsPanel(owner) {
    const list = ownerTools(owner);
    const ids = ownerConnections(owner).map(c => c.id);
    const resources = (R().resources || []).filter(r => ids.includes(r.connectionId));
    const prompts = (R().prompts || []).filter(p => ids.includes(p.connectionId));
    return `<div class="cap-section-head"><div><h2>Tools <span class="cap-mini-count">${list.length}</span></h2><p>选择具体动作，查看参数契约并独立测试。</p></div>${!isPlugin() ? button('刷新发现', 'cap-refresh-schema', { id: owner.id }, { icon: 'refresh' }) : ''}</div><div class="cap-tools-grid">${list.map(t => `<article class="panel cap-tool-card"><div class="between"><span class="cap-kicker">${E(t.kind)} · ${t.write ? 'WRITE' : 'READ'}</span>${S.badge(t.write ? '写入需确认' : '只读', t.write ? 'warning' : 'neutral')}</div><h3>${S.icon(t.write ? 'edit' : 'search', 17)}${E(titleOf(t))}</h3><p>${E(t.description || '按输入 Schema 调用此动作。')}</p><div class="cap-tool-id">${E(t.id)}</div><div class="cap-tool-schema">${E(Object.entries(t.inputSchema?.properties || {}).map(([name, s]) => name + ': ' + (s.type || 'unknown') + ((t.inputSchema.required || []).includes(name) ? ' *' : '')).join(' · ') || '无输入参数')}</div><div class="cap-tool-footer"><span class="small muted">v${E(t.version || '1.0.0')} · ${E(getConn(t.connectionId)?.name || '未配置连接')}</span><div class="cap-inline-actions">${button('Schema', 'cap-schema', { id: t.id }, { variant: 'ghost', icon: 'code' })}${button('调试', 'cap-debug-tool', { id: t.id }, { variant: 'primary', icon: 'play' })}</div></div></article>`).join('') || S.empty('尚未发现工具', '先验证连接，再刷新服务的能力清单。')} </div>${resources.length ? `<h2 class="cap-context-heading">Resources · 上下文资源</h2>${resources.map(resource => `<article class="cap-context-card"><div class="between"><h3>${S.icon('book', 16)} ${E(titleOf(resource))}</h3>${S.badge('资源读取')}</div><p>${E(resource.uri || resource.description || '可读取的上下文材料')}</p><div class="cap-inline-actions">${button('读取预览', 'cap-read-resource', { id: resource.id }, { icon: 'eye' })}${button('加入 Agent 上下文', 'cap-bind-context', { id: resource.id, kind: 'resource' }, { variant: 'ghost', icon: 'plus' })}</div></article>`).join('')}` : ''}${prompts.length ? `<h2 class="cap-context-heading">Prompts · 参数化提示词</h2>${prompts.map(prompt => `<article class="cap-context-card"><div class="between"><h3>${S.icon('spark', 16)} ${E(titleOf(prompt))}</h3>${S.badge('消息模板')}</div><p>${E(prompt.description || '填写参数后预览生成的消息。')}</p><div class="cap-inline-actions">${button('填参预览', 'cap-preview-prompt', { id: prompt.id }, { icon: 'eye' })}${button('加入 Agent 上下文', 'cap-bind-context', { id: prompt.id, kind: 'prompt' }, { variant: 'ghost', icon: 'plus' })}</div></article>`).join('')}` : ''}<p class="cap-invariant">${S.icon('book', 15)}Resources 提供上下文，Prompts 提供消息模板；它们与可执行 Tool 分别绑定。</p>`;
  }
  function schemaField(name, schema, value, required) {
    const id = 'cap-param-' + name.replace(/[^\w-]/g, '_');
    const title = `<label class="field-label" for="${E(id)}"><span class="cap-schema-prop">${E(schema.title || name)} ${required ? '<span class="cap-required">*</span>' : ''}<span class="cap-type">${E(schema.type || 'unknown')}</span></span></label>`;
    const attrs = `id="${E(id)}" name="${E(name)}" data-cap-param="${E(name)}" data-type="${E(schema.type || 'string')}" ${required ? 'required' : ''} aria-describedby="${E(id)}-help ${E(id)}-error"`;
    let control;
    if (schema.enum) control = `<select class="select" ${attrs}><option value="">请选择</option>${schema.enum.map(v => `<option value="${E(v)}" ${String(v) === String(value) ? 'selected' : ''}>${E(v)}</option>`).join('')}</select>`;
    else if (schema.type === 'boolean') control = `<select class="select" ${attrs}><option value="true" ${value === true ? 'selected' : ''}>true</option><option value="false" ${value !== true ? 'selected' : ''}>false</option></select>`;
    else if (['array', 'object'].includes(schema.type)) control = `<textarea class="textarea" ${attrs} style="resize:none" spellcheck="false">${E(JSON.stringify(value === undefined ? (schema.type === 'array' ? [] : {}) : value, null, 2))}</textarea>`;
    else if (/content|text|description|body/i.test(name)) control = `<textarea class="textarea" ${attrs} style="resize:none">${E(value === undefined ? '' : value)}</textarea>`;
    else control = `<input class="input" ${attrs} type="${['number', 'integer'].includes(schema.type) ? 'number' : 'text'}" value="${E(value === undefined ? '' : value)}" ${schema.minimum !== undefined ? `min="${Number(schema.minimum)}"` : ''} ${schema.maximum !== undefined ? `max="${Number(schema.maximum)}"` : ''} ${schema.type === 'integer' ? 'step="1"' : ''}>`;
    return `<div class="field${['array', 'object'].includes(schema.type) ? ' cap-span-all' : ''}">${title}${control}<p class="field-help" id="${E(id)}-help">${E(schema.description || (required ? '必填参数' : '可选参数'))}</p><p class="field-error" id="${E(id)}-error"></p></div>`;
  }
  function debugInputs(tool, state) {
    const args = state.args[tool.id] || {};
    return `<div class="cap-debug-panel-head"><h3>输入参数</h3>${S.tabs([{ id: 'form', label: '表单' }, { id: 'json', label: 'JSON' }], state.mode, 'cap-input-mode')}</div><form data-form="cap-debug-form" class="cap-schema-form" novalidate>${state.mode === 'json' ? `<div class="field cap-span-all"><label class="field-label" for="cap-json-input">arguments <span class="cap-type">object</span></label><textarea class="textarea cap-debug-json" id="cap-json-input" style="resize:none" spellcheck="false" aria-describedby="cap-debug-errors">${E(state.raw === undefined ? JSON.stringify(args, null, 2) : state.raw)}</textarea></div>` : Object.entries(tool.inputSchema?.properties || {}).map(([name, schema]) => schemaField(name, schema, args[name], (tool.inputSchema.required || []).includes(name))).join('') || '<p class="small muted">这个工具不需要输入参数。</p>'}<p class="cap-form-error cap-span-all" id="cap-debug-errors" role="alert">${E(state.error || '')}</p></form><div class="cap-inline-actions">${button('恢复示例', 'cap-reset-args', { id: tool.id }, { variant: 'ghost', icon: 'refresh' })}${button('查看契约', 'cap-schema', { id: tool.id }, { variant: 'ghost', icon: 'code' })}</div>`;
  }
  function callFor(run, tool) { return run?.toolCalls?.findLast ? run.toolCalls.findLast(c => c.toolId === tool.id) : [...(run?.toolCalls || [])].reverse().find(c => c.toolId === tool.id); }
  function resultHtml(tool, state) {
    const run = R().findRun(state.runs[tool.id]);
    if (!run) return `<div class="cap-debug-empty"><span class="cap-service-icon">${S.icon('terminal', 24)}</span><h3>让第一次调用可检查</h3><p>填写参数，选择一个测试场景。结构化返回、原始响应和执行事件会显示在这里。</p></div>`;
    const call = callFor(run, tool);
    let result = call?.result === undefined ? run.outcome?.returnValue : call.result;
    const error = call?.error || run.error;
    const rawResponse = [...(call?.transcript || [])].reverse().find(entry => entry.direction === 'response')?.body;
    const displayedResult = state.resultMode === 'raw' ? rawResponse : result;
    const errorText = typeof error === 'string' ? error : error?.message || error?.code || (error ? JSON.stringify(error) : '');
    const waiting = run.status === 'waiting' && run.pending;
    return `<div class="cap-result-meta">${runStatus(run)}<span>${call?.duration !== undefined ? Math.round(call.duration) + ' ms' : run.status === 'running' ? '等待服务结果' : ''}</span><span class="mono">${E(call?.requestId || run.id)}</span></div>${waiting ? `<div class="notice warning"><strong>${E(run.pending.title || '确认本次工具写入')}</strong><p class="small" style="margin-top:6px">${E(run.pending.description || '此动作将写入目标位置。当前为本地模拟，确认后继续执行。')}</p></div>${code(run.pending.args || call?.args || {})}<div class="cap-inline-actions" style="margin:12px 0">${button('确认并继续', 'cap-approve-tool', { id: run.id }, { variant: 'primary', icon: 'check' })}${button('拒绝', 'cap-reject-tool', { id: run.id }, { variant: 'ghost' })}</div>` : ''}${errorText ? `<div class="notice warning" role="alert"><strong>${E(error?.code || '调用未完成')}</strong><p class="small">${E(errorText)}</p></div>` : ''}${(run.outcome?.receipts || []).map(receipt => `<div class="cap-result-receipt"><strong>${S.icon('check', 14)} ${E(receipt.title || '已写入目标位置')} · 模拟回执</strong><p>${E(receipt.destination)}</p><p class="mono">${E(receipt.toolCallId || call?.id || '')}</p></div>`).join('')}${displayedResult !== undefined ? code(displayedResult) : !waiting ? `<div class="cap-debug-empty"><span class="cap-service-icon">${S.icon(run.status === 'running' ? 'clock' : 'check', 23)}</span><h3>${run.status === 'running' ? '调用进行中' : run.status === 'done' ? '执行完成，没有返回内容' : '没有可用的返回值'}</h3><p>${run.status === 'running' ? '事件到达后会更新；不显示无法确认的进度百分比。' : '成功状态不要求有文件或返回数据。检查回执与调用记录了解实际动作。'}</p></div>` : ''}<div class="cap-inline-actions" style="margin-top:14px">${link('查看完整 Trace', 'task', { id: run.id }, 'workflow')}${result !== undefined ? button('复制结果', 'cap-copy-result', { id: run.id, tool: tool.id }, { variant: 'ghost', icon: 'copy' }) : ''}</div>`;
  }
  function protocolHtml(tool, state) {
    const run = R().findRun(state.runs[tool.id]);
    const call = callFor(run, tool);
    const transcript = call?.transcript || [];
    if (!transcript.length) return '<p class="cap-history-empty">运行后显示模拟协议记录。请求与结果以同一个 request ID 关联。</p>';
    return transcript.map((entry, index) => `<div class="cap-protocol-event"><span class="cap-protocol-kind">${E(entry.direction || entry.type || (index === 0 ? 'request' : 'response'))}</span><div><p>${E(entry.time ? time(entry.time) : '')}${entry.method || entry.body?.method ? ' · ' + E(entry.method || entry.body.method) : ''}${entry.httpStatus !== undefined ? ' · HTTP ' + E(entry.httpStatus) : ''}${entry.transport ? ' · ' + E(entry.transport) : ''}</p><pre>${E(JSON.stringify(entry.body || entry.payload || entry.message || entry.data || entry, null, 2))}</pre></div></div>`).join('');
  }
  function debuggerPanel(owner) {
    const list = ownerTools(owner);
    if (!list.length) return S.empty('先添加一个具体工具', '连接成功并发现能力后，可在这里测试。');
    const state = debugState(owner), tool = getTool(state.toolId);
    const run = R().findRun(state.runs[tool.id]);
    const tests = (capData().testCases || []).filter(t => t.toolId === tool.id);
    return `<div class="cap-section-head"><div><h2>工具调试台</h2><p>单独验证一次调用，然后把同一项能力带入 Agent 或工作流。</p></div><span class="cap-kicker">LOCAL ADAPTER</span></div><section class="cap-debug-workbench"><div class="cap-debug-toolbar">${select('具体动作', 'cap-tool-select', tool.id, list.map(t => ({ id: t.id, label: titleOf(t) + ' · ' + (getConn(t.connectionId)?.name || t.kind) })), 'data-cap-change="tool"')}${select('测试场景', 'cap-scenario', state.scenario, scenarios, 'data-cap-change="scenario"')}<div class="cap-debug-run">${button('运行测试', 'cap-run-test', { id: tool.id }, { icon: 'play', variant: 'primary', attrs: run?.status === 'running' || run?.status === 'waiting' ? 'disabled aria-disabled="true"' : '' })}${run && ['running', 'waiting'].includes(run.status) ? button('停止', 'cap-stop-test', { id: run.id }, { icon: 'stop', variant: 'ghost' }) : ''}</div></div><div class="cap-debug-body"><section class="cap-debug-inputs">${debugInputs(tool, state)}</section><section class="cap-debug-results"><div class="cap-debug-panel-head"><h3>调用结果</h3>${S.tabs([{ id: 'structured', label: '结构化' }, { id: 'raw', label: '原始响应' }], state.resultMode, 'cap-result-mode')}</div><div id="cap-debug-output" aria-live="polite">${resultHtml(tool, state)}</div></section></div><section class="cap-protocol-panel"><div class="cap-protocol-title"><h3>${S.icon('code', 15)} 协议与执行记录</h3><span class="cap-mini-count">脱敏 · 模拟适配器记录</span></div><div class="cap-protocol-list" id="cap-debug-protocol">${protocolHtml(tool, state)}</div></section><div class="cap-debug-footer"><span class="small muted">${tool.write ? '写入动作会在调用前等待确认。' : '只读调用，无外部写入。'} 工具执行状态单独检查。</span><div class="cap-inline-actions">${button('保存测试用例', 'cap-save-test', { id: tool.id }, { icon: 'plus' })}${button('挂载到 Agent', 'cap-bind-tool', { id: tool.id }, { icon: 'agent' })}${button('加入工作流', 'cap-add-workflow', { id: tool.id }, { icon: 'workflow' })}</div></div></section>${tests.length ? `<section class="cap-test-list"><div class="cap-section-head"><h3>保存的测试用例</h3><span class="cap-mini-count">${tests.length} 个</span></div>${tests.map(test => `<div class="cap-test-row"><div><h4>${E(test.name)}</h4><p>${E(scenarioName(test.scenario))} · ${E(time(test.created))} · ${E(test.expectedStatus || '等待验证')}</p></div><div class="cap-row-actions">${button('载入用例', 'cap-load-test', { id: test.id }, { icon: 'play' })}${button('删除', 'cap-delete-test', { id: test.id }, { variant: 'ghost', icon: 'trash' })}</div></div>`).join('')}</section>` : ''}<p class="cap-invariant">${S.icon('terminal', 15)}这里不会访问真实服务。输入校验、场景错误、授权检查、审批暂停与 Trace 使用共同的执行器。</p>`;
  }
  function historyPanel(owner) {
    const list = historyFor(ownerTools(owner).map(t => t.id), ownerConnections(owner).map(c => c.id));
    const pageSize = 8, pages = Math.max(1, Math.ceil(list.length / pageSize));
    ui.historyPage = Math.min(ui.historyPage, pages);
    const shown = list.slice((ui.historyPage - 1) * pageSize, ui.historyPage * pageSize);
    return `<div class="cap-section-head"><div><h2>每次调用，都能回到现场</h2><p>来自调试台、Agent 和工作流的记录集中展示。</p></div><span class="cap-mini-count">${list.length} 次运行</span></div><div class="panel table-wrap"><table class="data-table"><thead><tr><th scope="col">运行 / 来源</th><th scope="col">状态</th><th scope="col">调用工具</th><th scope="col">时间</th><th scope="col">查看</th></tr></thead><tbody>${shown.map(run => `<tr><td><strong>${E(run.title)}</strong><div class="small muted">${E(run.kind)} · <span class="mono">${E(run.id)}</span></div></td><td>${runStatus(run)}</td><td>${E((run.toolCalls || []).map(c => c.toolName || c.toolId).join('、'))}</td><td class="small">${E(time(run.created))}</td><td>${link('Trace', 'task', { id: run.id }, 'arrow')}</td></tr>`).join('')}</tbody></table>${!shown.length ? S.empty('还没有调用记录', '去调试台运行一个测试，或在 Agent 中调用这项能力。', button('打开调试台', 'cap-tab', { id: 'debug' }, { icon: 'play' })) : ''}</div><div class="cap-pager"><span>第 ${ui.historyPage} / ${pages} 页 · 每页 ${pageSize} 条</span><div class="cap-inline-actions">${button('上一页', 'cap-history-page', { page: ui.historyPage - 1 }, { attrs: ui.historyPage === 1 ? 'disabled' : '' })}${button('下一页', 'cap-history-page', { page: ui.historyPage + 1 }, { attrs: ui.historyPage === pages ? 'disabled' : '' })}</div></div>`;
  }
  function dependenciesPanel(owner) {
    const deps = uses(ownerTools(owner).map(t => t.id), ownerConnections(owner).map(c => c.id));
    const history = owner.history || [];
    return `<div class="cap-overview-grid"><section class="panel cap-detail-panel"><h2>被引用的位置 <span class="cap-mini-count">${deps.length}</span></h2>${deps.map(dep => `<div class="cap-instance-row"><div><strong>${E(dep.name)}</strong><p>${E(dep.kind)} · v${E(dep.version || '草稿')} · ${dep.count} 个绑定</p></div>${link('查看配置', dep.route, { id: dep.id }, 'arrow')}</div>`).join('') || '<p class="cap-history-empty">还没有被 Agent 或工作流引用。可以在调试台直接挂载。</p>'}<div class="cap-mini-notice">修改连接只更新该实例的新调用。已发布 Agent 与工作流保留配置快照；实时禁用和凭证撤销仍然生效。</div></section><section class="panel cap-detail-panel"><h2>配置与能力版本</h2><div class="cap-timeline">${history.length ? history.slice(0, 10).map(item => `<div class="cap-timeline-item"><strong>v${E(item.version)} · ${E(item.message || '配置更新')}</strong><p>${E(item.detail || '')}</p><p>${E(time(item.time || item.created))}</p></div>`).join('') : `<div class="cap-timeline-item"><strong>v${E(owner.version)} · 初始配置</strong><p>当前示例连接已就绪；后续修改会记录在这里。</p></div>`}</div>${owner.schemaDiff ? `<div class="divider"></div><h3>最近的能力变化</h3>${code(owner.schemaDiff)}` : ''}</section></div>`;
  }
  function detailPage() {
    const owner = context();
    if (!owner) return `<div class="cap-page">${S.empty('没有找到这项能力', '返回工具与连接选择一个现有连接或插件。', link('工具与连接', 'capabilities'))}</div>`;
    const tab = selectedTab();
    return `<div class="cap-page">${detailHeader(owner)}${tab === 'capabilities' ? toolsPanel(owner) : tab === 'debug' ? debuggerPanel(owner) : tab === 'history' ? historyPanel(owner) : tab === 'dependencies' ? dependenciesPanel(owner) : overview(owner)}</div>`;
  }
  function mount(page) {
    const search = page.querySelector('#cap-search');
    if(search){let composing=false;const update=()=>{ui.query=search.value;ui.pages[S.route]=1;const focus=search.selectionStart;S.render();const next=document.getElementById('cap-search');if(next){next.focus();try{next.setSelectionRange(focus,focus);}catch(_){}}};search.addEventListener('compositionstart',()=>composing=true);search.addEventListener('compositionend',()=>{composing=false;update();});search.addEventListener('input',event=>{if(!composing&&!event.isComposing)update();});}
    page.addEventListener('change', event => {
      if (!event.target.dataset.capChange) return;
      const owner = context(); if (!owner) return;
      const state = debugState(owner);
      if (event.target.dataset.capChange === 'tool') { try { collectArgs(false); } catch (_) {} state.toolId = event.target.value; delete state.raw; state.error = ''; if (S.params.tool) S.params.tool = ''; S.go(detailRoute(), { id: owner.id, tab: 'debug' }); }
      if (event.target.dataset.capChange === 'scenario') state.scenario = event.target.value;
    });
    page.addEventListener('input', event => {
      if (!event.target.matches('[data-cap-param],#cap-json-input')) return;
      const owner = context(); if (!owner) return;
      const state = debugState(owner);
      if (event.target.id === 'cap-json-input') state.raw = event.target.value;
      else { try { state.args[state.toolId] = collectArgs(false); } catch (_) {} }
    });
    const unsubscribe = R().subscribe ? R().subscribe(run => {
      if (!['mcp-detail', 'plugin-detail'].includes(S.route) || selectedTab() !== 'debug') return;
      const owner = context(); if (!owner) return;
      const state = debugState(owner), tool = getTool(state.toolId);
      if (!tool || state.runs[tool.id] !== run.id) return;
      const out = document.getElementById('cap-debug-output'), protocol = document.getElementById('cap-debug-protocol');
      if (out) out.innerHTML = resultHtml(tool, state);
      if (protocol) protocol.innerHTML = protocolHtml(tool, state);
      const runButton = page.querySelector('[data-action="cap-run-test"]'); if (runButton) { runButton.disabled = ['running', 'waiting'].includes(run.status); runButton.setAttribute('aria-disabled', String(runButton.disabled)); }
      const stopButton = page.querySelector('[data-action="cap-stop-test"]'); if (stopButton) stopButton.hidden = !['running', 'waiting'].includes(run.status);
    }) : null;
    return () => { if (unsubscribe) unsubscribe(); };
  }
  function collectArgs(showError = true) {
    const state = debugState(context()), tool = getTool(state.toolId); let args = {};
    try {
      if (state.mode === 'json') {
        const text = document.getElementById('cap-json-input')?.value ?? state.raw ?? JSON.stringify(state.args[tool.id]);
        state.raw = text; args = JSON.parse(text);
        if (!args || Array.isArray(args) || typeof args !== 'object') throw new Error('arguments 必须是 JSON 对象。');
      } else {
        const form = document.querySelector('form[data-form="cap-debug-form"]');
        if (!form) return state.args[tool.id];
        form.querySelectorAll('[data-cap-param]').forEach(field => {
          const name = field.dataset.capParam, type = field.dataset.type, value = field.value;
          if (!value.trim() && !(tool.inputSchema?.required || []).includes(name)) return;
          if (['object', 'array'].includes(type)) { try { args[name] = JSON.parse(value); } catch (_) { throw new Error(name + ' 不是有效的 JSON。'); } }
          else if (type === 'boolean') args[name] = value === 'true';
          else if (['number', 'integer'].includes(type)) args[name] = value.trim() ? Number(value) : undefined;
          else args[name] = value;
        });
      }
      if (showError) { const errors = R().validateSchema(args, tool.inputSchema || { type: 'object' }); if (errors.length) throw new Error(errors.join('；')); }
      state.error = ''; state.args[tool.id] = args;
      const error = document.getElementById('cap-debug-errors'); if (error) error.textContent = '';
      return args;
    } catch (error) {
      if (showError) { state.error = error.message; const message = document.getElementById('cap-debug-errors'); if (message) message.textContent = error.message; }
      throw error;
    }
  }
  function connectionDialog(existing, pluginId, template) {
    const plugin = pluginId ? getPlugin(pluginId) : existing?.kind === 'plugin' ? plugins().find(p => ownerConnectionsForPlugin(p).some(c => c.id === existing.id)) : null;
    const defaults=template?.configTemplate||{};const data=existing?clone(existing):{name:template?.name||'',transport:plugin?'plugin':(/stdio/i.test(defaults.transport||template?.transport||'')?'stdio':/sse/i.test(defaults.transport||template?.transport||'')?'HTTP+SSE':'Streamable HTTP'),endpoint:plugin?'workspace://documents':defaults.endpoint||template?.endpoint||defaults.command||'https://mcp.example.com/mcp',location:defaults.location||'平台 Runner',credentialRef:'',authMode:'none'};
    const templateOptions = [{id:'',label:'仅保存连接配置，不复制能力'},...connections().filter(c => c.kind === (plugin ? 'plugin' : 'mcp') && (!plugin || ownerConnectionsForPlugin(plugin).some(x => x.id === c.id))).map(c => ({ id: c.id, label: c.name + ' · ' + tools().filter(t => t.connectionId === c.id).length + ' 个工具' }))];
    S.modal({ title: existing ? '编辑连接实例' : plugin ? '新增插件配置实例' : '添加 MCP 连接', subtitle: '当前原型使用本地适配器。地址用于配置展示，不会发起真实请求。', wide: true,
      body: `<form data-form="cap-connection-form" id="cap-connection-form" novalidate><input type="hidden" name="connectionId" value="${E(existing?.id || '')}"><input type="hidden" name="pluginId" value="${E(plugin?.id || '')}"><input type="hidden" name="templateReferenceId" value="${E(template?.id||existing?.templateId||'')}"><input type="hidden" name="legacyAssetId" value="${E(template&&S.state.contentStore?.legacyConnections?.some(a=>a.id===template.id)?template.id:existing?.migratedAssetId||'')}">${S.field('连接名称', { id: 'cap-connection-name', name: 'connectionName', value: data.name, required: true, placeholder: '例如：研究团队搜索服务' })}<div class="cap-form-row">${select('传输方式', 'cap-transport', data.transport, plugin ? [{ id: 'plugin', label: '插件 Runner' }] : [{ id: 'Streamable HTTP', label: 'Streamable HTTP' }, { id: 'stdio', label: 'stdio · Runner 内执行' }, { id: 'HTTP+SSE', label: 'HTTP + SSE · 兼容旧服务' }])}${select('执行位置', 'cap-location', data.location, [...new Set([data.location, '平台 Runner', '自托管 Runner', '隔离容器', '隔离容器 Runner', '插件 Runner'].filter(Boolean))])}</div>${S.field(plugin ? '目标空间 / 配置地址' : '服务地址 / Runner 命令', { id: 'cap-endpoint', name: 'endpoint', value: data.endpoint || data.command, required: true, help: plugin ? '例如 workspace://documents/team；与凭证引用分别配置。' : 'HTTP 使用完整 URL；stdio 使用 Runner 已安装的命令，浏览器不执行本地命令。' })}<div class="cap-form-row">${select('授权方式', 'cap-auth', data.authMode || (data.credentialRef ? 'reference' : 'none'), [{ id: 'none', label: '无需授权' }, { id: 'reference', label: 'API 凭证引用' }, { id: 'oauth', label: 'OAuth 授权引用' }])}${S.field('凭证引用', { id: 'cap-credential-ref', name: 'credentialRef', value: data.credentialRef, placeholder: 'secretRef.research-mcp', help: '只接受引用名称，不填写 API Key 或令牌正文。' })}</div>${!existing || !tools().some(t=>t.connectionId===existing.id) ? select('本地调试模板', 'cap-template', '', templateOptions) : ''}<div class="notice">仅保存连接不会发现远程工具。选择本地调试模板可复制其模拟能力；需要授权但凭证引用留空时，调试台会阻止调用。</div><p class="field-error" id="cap-connection-error" role="alert"></p></form>`,
      footer: button('取消', 'modal-close', {}, { variant: 'ghost' }) + button('保存连接', 'cap-save-connection', {}, { variant: 'primary', icon: 'check' }),
      onOpen: dialog => dialog.querySelector('#cap-connection-name')?.focus()
    });
  }
  function ownerConnectionsForPlugin(plugin) { return connections().filter(c => c.pluginId === plugin.id || (plugin.toolIds || []).some(id => getTool(id)?.connectionId === c.id)); }
  function cloneConnectionTools(sourceId, connection, plugin) {
    const originals = tools().filter(t => t.connectionId === sourceId);
    originals.forEach(tool => {
      const copied = { ...clone(tool), id: connection.id + '::' + (tool.adapterId || tool.id), adapterId: tool.adapterId || tool.id, connectionId: connection.id };
      if (plugin) copied.pluginId = plugin.id;
      tools().push(copied); if (plugin) { plugin.toolIds = plugin.toolIds || []; plugin.toolIds.push(copied.id); }
    });
    ['resources', 'prompts'].forEach(kind => { (R()[kind] || []).filter(item => item.connectionId === sourceId).forEach(item => (R()[kind] || []).push({ ...clone(item), id: connection.id + '::' + item.id, connectionId: connection.id })); });
  }
  function saveConnection(form) {
    if (!S.validate(form, { connectionName: '请填写连接名称。', endpoint: '请填写服务地址或 Runner 命令。' })) return;
    const values = new FormData(form), id = values.get('connectionId'), plugin = getPlugin(values.get('pluginId'));
    const transport = values.get('cap-transport'), endpoint = String(values.get('endpoint')).trim(), ref = String(values.get('credentialRef') || '').trim(), auth = values.get('cap-auth');
    let message = '';
    if (!plugin && transport !== 'stdio') { try { const url = new URL(endpoint); if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || /token|secret|key|authorization/i.test(url.search)) message = '请使用不含凭证的 HTTP(S) 服务地址。'; } catch (_) { message = '服务地址格式不正确，请填写完整 HTTP(S) URL。'; } }
    if (ref && !/^(?:(?:secretRef\.|oauthRef\.|credentialRef\.)[a-zA-Z0-9_.-]{1,80}|cred-[a-zA-Z0-9_.-]{1,80})$/.test(ref)) message = '凭证引用格式应为 secretRef.name、oauthRef.name 或 credentialRef.name；不要填写密钥正文。';
    if (message) { document.getElementById('cap-connection-error').textContent = message; return; }
    let conn = id ? getConn(id) : null;
    if (!conn) { conn = { id: S.uid(plugin ? 'plugin-instance' : 'mcp'), kind: plugin ? 'plugin' : 'mcp', enabled: true, version: '1.0.0', protocolVersion: '2026-07-28', history: [] }; if (plugin) conn.pluginId = plugin.id; connections().push(conn); }
    else conn.version = nextVersion(conn.version);
    Object.assign(conn, { name: String(values.get('connectionName')).trim(), transport, endpoint, location: values.get('cap-location'), credentialRef: auth === 'none' ? '' : ref, authMode: auth, authType: auth === 'none' ? 'none' : auth === 'oauth' ? 'oauth' : 'reference', status: conn.enabled === false ? 'disabled' : auth !== 'none' && !ref ? 'auth_required' : 'ready' });
    if(values.get('templateReferenceId'))conn.templateId=String(values.get('templateReferenceId'));if(values.get('legacyAssetId'))conn.migratedAssetId=String(values.get('legacyAssetId'));if(values.get('cap-template')&&!tools().some(t=>t.connectionId===conn.id))cloneConnectionTools(values.get('cap-template'),conn,plugin);if(!tools().some(t=>t.connectionId===conn.id)&&conn.status==='ready')conn.status='unverified';
    recordVersion(conn, id ? '连接配置已更新' : '创建连接实例', '仅后续调用使用此连接配置；不重启其他 Runtime。');
    S.save(); S.closeModal(); S.toast(conn.status === 'auth_required' ? '连接已保存，等待授权引用' : '连接配置已保存', conn.status === 'auth_required' ? 'warning' : 'success');
    S.go(plugin ? 'plugin-detail' : 'mcp-detail', { id: plugin ? plugin.id : conn.id, tab: 'overview' });
  }
  function toolBindingDialog(tool, kind, object) {
    const contextual = !!kind;
    const label = contextual ? titleOf(object) : titleOf(tool);
    S.modal({ title: '挂载到 Agent', subtitle: label + ' · 保存到草稿，测试通过后再发布。',
      body: `<form data-form="cap-binding-form" id="cap-binding-form" novalidate><input type="hidden" name="toolId" value="${E(tool?.id || '')}"><input type="hidden" name="contextKind" value="${E(kind || '')}"><input type="hidden" name="contextId" value="${E(object?.id || '')}">${select('选择 Agent', 'cap-bind-agent', S.state.agents[0]?.id, S.state.agents.map(a => ({ id: a.id, label: a.name + ' · v' + a.version })))}${!contextual ? `${select('调用审批', 'cap-bind-approval', tool.write ? 'write' : 'never', tool.write ? [{ id: 'write', label: '写入操作前确认' }, { id: 'always', label: '每次调用前确认' }] : [{ id: 'never', label: '只读调用无需确认' }, { id: 'always', label: '每次调用前确认' }])}${S.field('调用超时（毫秒）', { id: 'cap-bind-timeout', name: 'timeoutMs', type: 'number', value: '15000' })}` : ''}<div class="notice">此操作不会改变已发布 Agent 的能力快照。保存后可前往 Agent 编辑页继续配置。</div></form>`,
      footer: button('取消', 'modal-close', {}, { variant: 'ghost' }) + button('保存到 Agent 草稿', 'cap-save-binding', {}, { variant: 'primary', icon: 'check' })
    });
  }
  S.page('capabilities', { title: '工具与连接', section: '知识与能力', render: capabilitiesPage, mount });
  S.page('mcp', { title: 'MCP 连接', section: '知识与能力', render: mcpPage, mount });
  S.page('mcp-detail', { title: 'MCP 连接与调试', section: '知识与能力', render: detailPage, mount });
  S.page('plugins', { title: '插件', section: '知识与能力', render: pluginsPage, mount });
  S.page('plugin-detail', { title: '插件配置与调试', section: '知识与能力', render: detailPage, mount });
  S.action('cap-filter',el=>{ui.filter=el.dataset.id;ui.pages[S.route]=1;S.render();});
  S.action('cap-list-page',el=>{ui.pages[S.route]=Number(el.dataset.page)||1;S.render();});
  S.action('cap-legacy-template',el=>{const asset=S.state.contentStore?.legacyConnections?.find(a=>a.id===el.dataset.id);if(asset)S.CapabilityUI.openConnectionTemplate(asset);});
  S.action('cap-clear-search', () => { ui.query = ''; ui.filter = 'all'; ui.pages[S.route]=1; S.render(); });
  S.action('cap-tab', el => { ui.tabs[ownerId()] = el.dataset.id; ui.historyPage = 1; S.go(detailRoute(), { id: context().id, tab: el.dataset.id }); });
  S.action('cap-new-connection', () => connectionDialog());
  S.action('cap-new-instance', el => connectionDialog(null, el.dataset.id));
  S.action('cap-config', el => { const conn = getConn(el.dataset.id); if (conn) connectionDialog(conn); });
  S.form('cap-connection-form', saveConnection);
  S.action('cap-save-connection', () => saveConnection(document.getElementById('cap-connection-form')));
  S.action('cap-history-page', el => { ui.historyPage = Number(el.dataset.page) || 1; S.render(); });
  S.action('cap-connection-toggle', el => {
    const conn = getConn(el.dataset.id); if (!conn) return;
    const disable = conn.enabled !== false;
    if (!disable) { conn.enabled = true; conn.status = conn.authMode && conn.authMode !== 'none' && !conn.credentialRef ? 'auth_required' : tools().some(t=>t.connectionId===conn.id)?'ready':'unverified'; recordVersion(conn, '连接已启用'); S.save(); S.render(); S.toast('连接已启用'); return; }
    const deps = uses(tools().filter(t => t.connectionId === conn.id).map(t => t.id), [conn.id]);
    S.modal({ title: '停用“' + conn.name + '”？', subtitle: '停用后会阻止这个连接的新调用。', body: `<div class="notice warning">当前有 ${deps.length} 处配置引用。已完成的外部动作不会回滚；其他连接继续工作。</div>`, footer: button('保留启用', 'modal-close') + button('停用连接', 'cap-confirm-disable', { id: conn.id }, { variant: 'danger' }) });
  });
  S.action('cap-confirm-disable', el => { const conn = getConn(el.dataset.id); if (!conn) return; conn.enabled = false; conn.status = 'disabled'; recordVersion(conn, '连接已停用'); S.save(); S.closeModal(); S.render(); S.toast('已停用连接，后续调用将被阻止', 'warning'); });
  S.action('cap-test-connection', async el => {
    const conn = getConn(el.dataset.id); if (!conn) return;
    if (R().testConnection) { const result = await R().testConnection(conn.id); conn.health = typeof result === 'object' && result ? result : { message: result === false ? '连接检查失败（模拟）' : '连接检查完成（模拟）' }; }
    else conn.health = { message: isReady(conn) ? '地址与授权引用通过本地检查（模拟）' : '连接未就绪，请检查启用状态与凭证引用。' };
    conn.lastTestAt = now(); S.save(); S.render(); S.toast(isReady(conn) ? '连接检查已完成（模拟）' : '连接需要处理', isReady(conn) ? 'success' : 'warning');
  });
  S.action('cap-refresh-schema', async el => {
    const conn = getConn(el.dataset.id); if (!conn) return;
    if (!isReady(conn)) { S.toast('请先启用连接并配置授权引用', 'warning'); return; }
    const result = R().refreshCapabilities ? await R().refreshCapabilities(conn.id) : { added: [], removed: [], changed: [], message: '本地能力契约未发生变化。' };
    conn.schemaDiff = result || { added: [], removed: [], changed: [] }; conn.lastRefreshAt = now(); recordVersion(conn, '刷新能力契约（模拟）', '工具 Schema 与当前目录完成比对。'); S.save();
    S.modal({ title: '能力发现与变化', subtitle: conn.name + ' · 本地模拟发现结果', body: `<div class="notice">${tools().filter(t => t.connectionId === conn.id).length} 个工具已载入。现有绑定不会静默切换到不兼容 Schema。</div><div style="margin-top:16px">${code(conn.schemaDiff)}</div>`, footer: button('查看能力清单', 'cap-open-capabilities', { id: conn.id }, { variant: 'primary' }) });
  });
  S.action('cap-open-run', el => { S.closeModal(); S.go('task', { id: el.dataset.id }); });
  S.action('cap-open-capabilities', el => { S.closeModal(); S.go('mcp-detail', { id: el.dataset.id, tab: 'capabilities' }); });
  S.action('cap-schema', el => { const tool = getTool(el.dataset.id); if (!tool) return; S.modal({ title: titleOf(tool) + ' · Schema', subtitle: tool.id + ' · v' + tool.version, wide: true, body: `<h3 class="small">输入契约</h3>${code(tool.inputSchema || {})}<h3 class="small" style="margin:18px 0 9px">输出契约</h3>${code(tool.outputSchema || { description: '服务未声明输出结构；需在下游显式解析。' })}<div class="notice" style="margin-top:16px">${tool.write ? '此动作有写入副作用；重复执行可能产生新记录。取消不会撤销已完成的写入。' : '此动作为只读示例。参数仍需满足契约和当前授权范围。'}</div>`, footer: button('关闭', 'modal-close') }); });
  S.action('cap-debug-tool', el => { const tool = getTool(el.dataset.id); if (!tool) return; const plugin = plugins().find(p => (p.toolIds || []).includes(tool.id)); S.go(tool.kind === 'plugin' ? 'plugin-detail' : 'mcp-detail', { id: tool.kind === 'plugin' ? plugin?.id : tool.connectionId, tab: 'debug', tool: tool.id }); });
  S.action('cap-input-mode', el => { const state = debugState(context()); try { collectArgs(true); } catch (_) { return; } state.mode = el.dataset.id; delete state.raw; S.render(); });
  S.action('cap-result-mode', el => { const state = debugState(context()); state.resultMode = el.dataset.id; const tool = getTool(state.toolId); const output = document.getElementById('cap-debug-output'); if (output) output.innerHTML = resultHtml(tool, state); S.render(); });
  S.action('cap-reset-args', el => { const state = debugState(context()), tool = getTool(el.dataset.id); state.args[tool.id] = clone(tool.example || {}); delete state.raw; state.error = ''; S.render(); });
  S.action('cap-run-test', el => { const state = debugState(context()); let args; try { args = collectArgs(true); } catch (_) { return; } const run = R().testTool(el.dataset.id, args, { scenario: state.scenario }); state.runs[el.dataset.id] = run.id; state.error = ''; S.render(); });
  S.form('cap-debug-form', () => { const state = debugState(context()); S.actions['cap-run-test']({ dataset: { id: state.toolId } }); });
  S.action('cap-stop-test', el => { R().stop(el.dataset.id); S.render(); });
  S.action('cap-approve-tool', el => { R().resolveApproval(el.dataset.id, true); });
  S.action('cap-reject-tool', el => { R().resolveApproval(el.dataset.id, false); });
  S.action('cap-copy-result', el => { const run = R().findRun(el.dataset.id), tool = getTool(el.dataset.tool); S.copy(JSON.stringify(callFor(run, tool)?.result ?? run.outcome?.returnValue ?? null, null, 2)); });
  S.action('cap-save-test', el => {
    const state = debugState(context()); let args; try { args = collectArgs(true); } catch (_) { return; }
    S.session.capTestDraft = { toolId: el.dataset.id, args: clone(args), scenario: state.scenario, runId: state.runs[el.dataset.id] };
    S.modal({ title: '保存测试用例', subtitle: '保留输入和测试场景，之后可以重复载入验证。', body: `<form data-form="cap-test-case-form" id="cap-test-case-form" novalidate>${S.field('用例名称', { id: 'cap-test-name', name: 'testName', required: true, value: titleOf(getTool(el.dataset.id)) + ' · ' + scenarioName(state.scenario) })}</form>`, footer: button('取消', 'modal-close', {}, { variant: 'ghost' }) + button('保存用例', 'cap-save-test-confirm', {}, { variant: 'primary' }) });
  });
  function saveTest(form) { if (!S.validate(form, { testName: '请给这个用例起一个名字。' })) return; const draft = S.session.capTestDraft; if (!draft) return; capData().testCases = capData().testCases || []; capData().testCases.unshift({ ...clone(draft), id: S.uid('test'), name: form.elements.namedItem('testName').value.trim(), expectedStatus: draft.scenario === 'success' || draft.scenario === 'empty' ? '预期成功' : '预期失败', created: now() }); delete S.session.capTestDraft; S.save(); S.closeModal(); S.render(); S.toast('测试用例已保存'); }
  S.form('cap-test-case-form', saveTest);
  S.action('cap-save-test-confirm', () => saveTest(document.getElementById('cap-test-case-form')));
  S.action('cap-load-test', el => { const test = (capData().testCases || []).find(t => t.id === el.dataset.id); if (!test) return; const state = debugState(context()); state.toolId = test.toolId; state.args[test.toolId] = clone(test.args); state.scenario = test.scenario; delete state.raw; state.error = ''; S.render(); S.toast('用例已载入，点击运行测试开始验证', 'info'); });
  S.action('cap-delete-test', el => { const test = (capData().testCases || []).find(t => t.id === el.dataset.id); if (!test) return; S.modal({ title: '删除测试用例？', subtitle: test.name, body: '<div class="notice warning">仅移除此测试输入，历史运行与 Trace 保留。</div>', footer: button('保留用例', 'modal-close') + button('删除用例', 'cap-confirm-delete-test', { id: test.id }, { variant: 'danger' }) }); });
  S.action('cap-confirm-delete-test', el => { const list = capData().testCases || [], index = list.findIndex(t => t.id === el.dataset.id); if (index < 0) return; list.splice(index, 1); S.save(); S.closeModal(); S.render(); S.toast('测试用例已删除'); });
  S.action('cap-bind-tool', el => { const tool = getTool(el.dataset.id); if (tool) toolBindingDialog(tool); });
  S.action('cap-bind-context', el => { const list = el.dataset.kind === 'resource' ? R().resources : R().prompts; const item = list.find(x => x.id === el.dataset.id); if (item) toolBindingDialog(null, el.dataset.kind, item); });
  function saveBinding(form) {
    const values = new FormData(form), agent = S.state.agents.find(a => a.id === values.get('cap-bind-agent'));
    if (!agent) return;
    const kind = values.get('contextKind');
    if (kind) { agent.contextBindings = agent.contextBindings || []; if (!agent.contextBindings.some(b => b.kind === kind && b.id === values.get('contextId'))) agent.contextBindings.push({ kind, id: values.get('contextId'), enabled: true, version: (kind === 'resource' ? R().resources : R().prompts).find(item => item.id === values.get('contextId'))?.version || '1.0.0' }); }
    else { const tool = getTool(values.get('toolId')); if (!tool) return; const timeout = Number(values.get('timeoutMs')); if (!Number.isFinite(timeout) || timeout < 100 || timeout > 300000) { S.toast('超时需要在 100–300000 毫秒之间', 'warning'); return; } agent.capabilityBindings = agent.capabilityBindings || []; const binding = { toolId: tool.id, connectionId: tool.connectionId, enabled: true, approval: values.get('cap-bind-approval'), scope: 'all', version: tool.version || '1.0.0', timeoutMs: timeout }; const previous = agent.capabilityBindings.find(b => b.toolId === tool.id); if (previous) Object.assign(previous, binding); else agent.capabilityBindings.push(binding); }
    agent.status = 'draft'; agent.updated = '刚刚'; if (S.AgentStudio?.invalidateDraft) S.AgentStudio.invalidateDraft(agent.id); S.save(); S.closeModal(); S.toast('已挂载到“' + agent.name + '”草稿'); S.go('agent', { id: agent.id, tab: 'capabilities' });
  }
  S.form('cap-binding-form', saveBinding);
  S.action('cap-save-binding', () => saveBinding(document.getElementById('cap-binding-form')));
  S.action('cap-add-workflow', el => {
    const tool = getTool(el.dataset.id); if (!tool) return;
    S.modal({ title: '加入工作流', subtitle: '在保存的草稿中添加节点；连线和变量映射由你继续配置。', body: `<form data-form="cap-workflow-form" id="cap-workflow-form" novalidate><input type="hidden" name="toolId" value="${E(tool.id)}">${select('选择工作流', 'cap-target-flow', R().flows[0]?.id, R().flows.map(f => ({ id: f.id, label: f.title + ' · 草稿' })))}</form><div class="notice">新节点不会自动接入执行路径，发布版本保持不变。</div>`, footer: button('取消', 'modal-close', {}, { variant: 'ghost' }) + button('添加节点并打开', 'cap-save-workflow-node', {}, { variant: 'primary', icon: 'workflow' }) });
  });
  function saveWorkflowNode(form) { const values = new FormData(form), flow = R().flows.find(f => f.id === values.get('cap-target-flow')), tool = getTool(values.get('toolId')); if (!flow || !tool) return; const node = R().newNode(tool.kind === 'plugin' ? 'plugin' : 'mcp', { title: titleOf(tool), x: Math.max(60, ...flow.nodes.map(n => Number(n.x) || 0)) + 260, y: 80 }); node.config.toolId = tool.id; node.bindings = Object.fromEntries(Object.entries(tool.example || {}).map(([k, v]) => [k, { mode: 'constant', value: v }])); flow.nodes.push(node); flow.updated = '刚刚'; S.save(); S.closeModal(); if (S.Workflow?.invalidateDraft) S.Workflow.invalidateDraft(flow.id); S.go('workflow', { id: flow.id, node: node.id }); S.toast('工具节点已加入草稿，请连接上下游'); }
  S.form('cap-workflow-form', saveWorkflowNode);
  S.action('cap-save-workflow-node', () => saveWorkflowNode(document.getElementById('cap-workflow-form')));
  S.action('cap-read-resource', el => { const resource = (R().resources || []).find(x => x.id === el.dataset.id); if (!resource) return; const conn = getConn(resource.connectionId); if (!isReady(conn)) { S.toast('连接未就绪，无法读取资源', 'warning'); return; } const node = R().newNode('resource', { title: titleOf(resource), config: { resourceId: resource.id, uri: resource.uri, connectionId: resource.connectionId } }); const run = R().testNode(node, { inputs: {} }); S.go('task', { id: run.id }); });
  S.action('cap-preview-prompt', el => {
    const prompt = (R().prompts || []).find(x => x.id === el.dataset.id); if (!prompt) return;
    const promptArgs = prompt.arguments || [{ name: 'topic', required: true }]; const schema = prompt.inputSchema || { type: 'object', properties: Object.fromEntries(promptArgs.map(a => [a.name, { type: 'string', description: a.description || '模板参数' }])), required: promptArgs.filter(a => a.required).map(a => a.name) };
    S.modal({ title: titleOf(prompt), subtitle: '填入参数，生成可检查的消息模板。', body: `<form data-form="cap-prompt-form" id="cap-prompt-form" novalidate><input type="hidden" name="promptId" value="${E(prompt.id)}">${Object.entries(schema.properties || {}).map(([name, spec]) => schemaField(name, spec, prompt.example?.[name] || '', (schema.required || []).includes(name))).join('')}<p class="field-error" id="cap-prompt-error" role="alert"></p></form><div id="cap-prompt-preview"></div>`, footer: button('关闭', 'modal-close', {}, { variant: 'ghost' }) + button('生成预览', 'cap-render-prompt', {}, { variant: 'primary', icon: 'spark' }) });
  });
  async function renderPrompt(form) {
    const values = new FormData(form), prompt = (R().prompts || []).find(x => x.id === values.get('promptId')); if (!prompt) return;
    const conn = getConn(prompt.connectionId), errorNode = document.getElementById('cap-prompt-error');
    if (!isReady(conn)) { errorNode.textContent = '连接未就绪。'; return; }
    const args = {}; form.querySelectorAll('[data-cap-param]').forEach(f => { args[f.dataset.capParam] = f.value; });
    const schema = prompt.inputSchema || { type: 'object', required: (prompt.arguments || [{ name: 'topic', required: true }]).filter(a => a.required).map(a => a.name) }, errors = R().validateSchema(args, schema);
    if (errors.length) { errorNode.textContent = errors.join('；'); return; }
    errorNode.textContent = '';
    const preview = document.getElementById('cap-prompt-preview'); preview.innerHTML = '<p class="small muted" role="status">正在生成模板预览…</p>';
    const node = R().newNode('prompt', { title: titleOf(prompt), config: { promptId: prompt.id } });
    const run = R().testNode(node, { inputs: args });
    await R().waitForRun(run);
    if (!preview.isConnected) return;
    preview.innerHTML = '<h3 class="small" style="margin:16px 0 10px">消息预览 · 模拟</h3>' + (run.status === 'done' ? code(run.outcome?.returnValue || run.nodeExecutions?.[0]?.output) : '<div class="notice warning">' + E(run.error?.message || '模板预览未完成') + '</div>') + '<div style="margin-top:12px">' + button('查看本次 Trace', 'cap-open-run', { id: run.id }, { icon: 'arrow' }) + '</div>';
  }
  S.form('cap-prompt-form', renderPrompt);
  S.action('cap-render-prompt', () => renderPrompt(document.getElementById('cap-prompt-form')));
  S.action('cap-plugin-toggle', el => {
    const plugin = getPlugin(el.dataset.id); if (!plugin) return;
    if (plugin.status === 'available' || plugin.installed === false || plugin.enabled === false) { plugin.installed = true; plugin.enabled = true; plugin.status = 'installed'; ownerConnectionsForPlugin(plugin).forEach(c => { c.enabled = true; c.status = c.authMode && c.authMode !== 'none' && !c.credentialRef ? 'auth_required' : 'ready'; }); recordVersion(plugin, '插件已安装并启用'); S.save(); S.render(); S.toast('插件已启用，请检查配置实例'); return; }
    S.modal({ title: '停用“' + plugin.name + '”？', subtitle: '停止此插件全部配置实例的新调用。', body: `<div class="notice warning">${uses(plugin.toolIds || []).length} 处配置引用此插件。其他插件和 MCP 服务不受影响。</div>`, footer: button('保持启用', 'modal-close') + button('停用插件', 'cap-confirm-plugin-disable', { id: plugin.id }, { variant: 'danger' }) });
  });
  S.action('cap-confirm-plugin-disable', el => { const plugin = getPlugin(el.dataset.id); if (!plugin) return; plugin.enabled = false; plugin.status = 'disabled'; ownerConnectionsForPlugin(plugin).forEach(c => { c.enabled = false; c.status = 'disabled'; }); recordVersion(plugin, '插件已停用'); S.save(); S.closeModal(); S.render(); S.toast('插件已停用', 'warning'); });
  S.action('cap-plugin-remove', el => { const plugin = getPlugin(el.dataset.id); if (!plugin) return; S.modal({ title: '卸载“' + plugin.name + '”？', subtitle: '移除可用安装状态，保留定义和历史记录以供重新安装。', body: '<div class="notice warning">' + uses(plugin.toolIds || []).length + ' 处配置引用此插件。卸载后这些工具不能被调用；历史 Trace 和已完成写入回执不会删除。</div>', footer: button('保留插件', 'modal-close') + button('卸载插件', 'cap-confirm-remove-plugin', { id: plugin.id }, { variant: 'danger' }) }); });
  S.action('cap-confirm-remove-plugin', el => { const plugin = getPlugin(el.dataset.id); if (!plugin) return; plugin.enabled = false; plugin.installed = false; plugin.status = 'available'; ownerConnectionsForPlugin(plugin).forEach(c => { c.enabled = false; c.status = 'disabled'; }); recordVersion(plugin, '卸载插件', '保留定义与历史记录，可重新安装。'); S.save(); S.closeModal(); S.render(); S.toast('插件已卸载，历史记录已保留', 'warning'); });
  S.action('cap-plugin-upgrade', el => { const plugin = getPlugin(el.dataset.id); if (!plugin) return; const target = nextVersion(plugin.version); S.modal({ title: '检查插件更新', subtitle: plugin.name + ' · v' + plugin.version + ' → v' + target + '（演示版本）', body: `<div class="notice">此次演示升级保留输入输出 Schema，增加配置版本记录。不会下载或执行外部代码。</div><ul class="cap-changelog"><li>导出动作 ${E((plugin.toolIds || []).join('、'))} 保持兼容。</li><li>${uses(plugin.toolIds || []).length} 处引用的发布快照保留。</li><li>新的调用记录会标注新工具版本。</li></ul>`, footer: button('取消', 'modal-close', {}, { variant: 'ghost' }) + button('应用演示升级', 'cap-confirm-upgrade', { id: plugin.id, version: target }, { variant: 'primary', icon: 'check' }) }); });
  S.action('cap-confirm-upgrade', el => { const plugin = getPlugin(el.dataset.id); if (!plugin) return; const previous = plugin.version; plugin.version = el.dataset.version; tools().filter(t => (plugin.toolIds || []).includes(t.id)).forEach(t => { t.previousVersions = t.previousVersions || []; t.previousVersions.push({ version: t.version, inputSchema: clone(t.inputSchema), outputSchema: clone(t.outputSchema) }); t.version = plugin.version; }); recordVersion(plugin, '兼容升级', 'v' + previous + ' → v' + plugin.version + '；Schema 保持兼容。'); S.save(); S.closeModal(); S.render(); S.toast('演示升级已完成，后续调用使用新版本'); });
  S.action('cap-plugin-manifest', el => { const plugin = getPlugin(el.dataset.id); if (!plugin) return; const manifest = { id: plugin.id, name: plugin.name, version: plugin.version, source: plugin.source || 'reviewed-example', permissions: ['tool:invoke', ...(tools().some(t => (plugin.toolIds || []).includes(t.id) && t.write) ? ['destination:write'] : [])], tools: tools().filter(t => (plugin.toolIds || []).includes(t.id)).map(t => ({ id: t.id, name: t.name, inputSchema: t.inputSchema, outputSchema: t.outputSchema })), credentials: 'references-only' }; S.session.capManifest = manifest; S.modal({ title: plugin.name + ' · 插件清单', subtitle: '不包含凭证、私有内容或调用日志。', wide: true, body: code(manifest), footer: button('关闭', 'modal-close') + button('导出清单', 'cap-export-manifest', { id: plugin.id }, { variant: 'primary', icon: 'download' }) }); });
  S.action('cap-export-manifest', el => S.download(el.dataset.id + '-manifest.json', JSON.stringify(S.session.capManifest, null, 2), 'application/json'));
  function pluginImportDialog(provided,templateId=''){
    const manifest = provided|| { name: '团队通知助手', version: '1.0.0', description: '把结构化进展保存到团队消息草稿。', actions: [{ name: 'create_draft', title: '创建通知草稿', write: true, adapterId: 'docs.create' }] };
    S.modal({ title: '导入插件清单', subtitle: '仅导入本地模拟能力定义，不安装或执行外部代码。', wide: true, body: `<form data-form="cap-import-form" id="cap-import-form" novalidate><input type="hidden" name="templateId" value="${E(templateId)}"><label class="field-label" for="cap-import-json">插件 Manifest JSON</label><textarea class="textarea cap-manifest" id="cap-import-json" name="manifest" spellcheck="false" style="resize:none">${E(JSON.stringify(manifest, null, 2))}</textarea><p class="field-help">动作必须指定受控演示 adapterId：docs.create、table.upsert、web.search、web.fetch 或 workspace.write。</p><p class="field-error" id="cap-import-error" role="alert"></p></form>`, footer: button('取消', 'modal-close', {}, { variant: 'ghost' }) + button('验证并导入', 'cap-confirm-import', {}, { variant: 'primary', icon: 'check' }) });
  }
  S.action('cap-import-plugin',()=>pluginImportDialog());
  function importPlugin(form) {
    try {
      const manifest = JSON.parse(form.elements.namedItem('manifest').value);
      if (!manifest.name || !Array.isArray(manifest.actions) || !manifest.actions.length) throw new Error('清单需要 name 和至少一个 actions 动作。');
      if (manifest.actions.length > 12) throw new Error('演示清单最多支持 12 个动作。');
      const allowed = ['docs.create', 'table.upsert', 'web.search', 'web.fetch', 'workspace.write'];
      manifest.actions.forEach(action => { if (!action.name || !allowed.includes(action.adapterId)) throw new Error('每个动作需要名称与受支持的 adapterId。'); const base = getTool(action.adapterId); if (!base) throw new Error('缺少该动作的模拟适配器。'); if (action.inputSchema && JSON.stringify(action.inputSchema) !== JSON.stringify(base.inputSchema)) throw new Error('此演示导入器只支持适配器原有 Schema。移除自定义 inputSchema，或使用能力清单显示的完整契约。'); });
      const id = S.uid('plugin'), conn = { id: id + '-default', name: manifest.name + ' · 默认实例', kind: 'plugin', pluginId: id, transport: 'plugin', location: '隔离容器', endpoint: 'workspace://imports/' + id, status: 'ready', enabled: true, credentialRef: '', authMode: 'none', authType: 'none', version: '1.0.0' };
      const plugin = { id, name: String(manifest.name).slice(0, 80), description: String(manifest.description || '本地导入的模拟插件'), version: String(manifest.version || '1.0.0'), enabled: true, installed: true, status: 'installed', source: '私有清单 · 本地模拟', marketId: form.elements.namedItem('templateId')?.value||'', author: '我的空间', toolIds: [], config: {}, history: [] };
      manifest.actions.forEach(action => { const base = getTool(action.adapterId), tool = { ...clone(base), id: id + '::' + action.name, adapterId: action.adapterId, name: action.name, title: action.title || action.name, kind: 'plugin', pluginId: id, connectionId: conn.id, version: plugin.version, write: base.write }; tools().push(tool); plugin.toolIds.push(tool.id); });
      connections().push(conn); plugins().push(plugin); recordVersion(plugin, '导入私有插件清单', '受控模拟适配器，未执行外部代码。'); S.save(); S.closeModal(); S.go('plugin-detail', { id, tab: 'capabilities' }); S.toast('清单已导入，具体参数沿用受控适配器契约');
    } catch (error) { document.getElementById('cap-import-error').textContent = error.message; }
  }
  S.CapabilityUI={
    openConnectionTemplate(asset){const existing=connections().find(c=>c.templateId===asset.id||c.migratedAssetId===asset.id);if(existing){S.go('mcp-detail',{id:existing.id});return;}connectionDialog(null,null,asset);},
    openPluginTemplate(asset){const existing=getPlugin(asset.pluginId||asset.configTemplate?.pluginId)||plugins().find(p=>p.marketId===asset.id);if(existing){S.go('plugin-detail',{id:existing.id});return;}let manifest=asset.manifest||asset.configTemplate?.manifest;try{if(!manifest&&asset.content)manifest=JSON.parse(asset.content);}catch(_){}if(manifest?.actions?.length){pluginImportDialog(manifest,asset.id);return;}S.modal({title:'插件清单尚未提供',body:'<p>这个模板还没有包含可导入的插件清单。请在工具与连接中导入包含动作定义的 Manifest。</p>',footer:button('关闭','modal-close')+link('管理插件','plugins')});}
  };
  S.form('cap-import-form', importPlugin);
  S.action('cap-confirm-import', () => importPlugin(document.getElementById('cap-import-form')));
})();
