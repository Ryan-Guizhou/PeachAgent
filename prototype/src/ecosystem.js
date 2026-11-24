(function () {
  'use strict';
  const S = window.Studio;
  const E = S.escape;
  const types = {
    knowledge: { label: '知识库', icon: 'book', tone: 'mint' },
    skill: { label: 'Skill', icon: 'bolt', tone: 'lilac' },
    mcp: { label: 'MCP', icon: 'plug', tone: 'apricot' },
    plugin: { label: '插件', icon: 'plug', tone: 'apricot' },
    prompt: { label: '提示词', icon: 'terminal', tone: 'mint' },
    memory: { label: '记忆', icon: 'layers', tone: 'lilac' },
    file: { label: '文件', icon: 'file', tone: 'apricot' },
    agent: { label: 'Agent', icon: 'agent', tone: 'mint' },
    workflow: { label: 'Workflow', icon: 'workflow', tone: 'lilac' }
  };
  const ui = { marketType: 'all', marketQuery: '', marketLimit: 9, reviewStatus: 'all', reviewQuery: '' };
  const stamp = () => new Date().toISOString();
  const today = () => new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const meta = type => types[String(type || '').toLowerCase()] || types.skill;
  const fmtDate = value => value ? new Date(value).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai', month: 'short', day: 'numeric' }) : '今天';
  const attr = id => `data-id="${E(id)}"`;
  const seedAssets = [
    { id: 'eco-kb-brand', type: 'knowledge', name: '品牌与产品资料', description: '产品定位、品牌语气与常见问题，帮助每一次回答保持一致。', content: 'OTRYX 是个人 AI 工作室。品牌表达清晰、克制、具体。\n核心用户：独立创作者、产品经理、开发者。\n产品价值：把知识、工具与工作流组合成可以复用的能力。', documents: 12, tags: ['品牌', '产品'] },
    { id: 'eco-kb-research', type: 'knowledge', name: '研究资料室', description: '精选行业报告与访谈记录，为结论保留可以追溯的依据。', content: '研究原则：区分事实与推断；保留来源；对结论注明适用范围。\n访谈结构：背景、目标、当前做法、阻碍、理想结果。', documents: 8, tags: ['研究', '资料'] },
    { id: 'eco-skill-review', type: 'skill', name: '文案质量检查', description: '逐项检查事实、语气和行动指引，输出可以直接采用的修改建议。', content: '# 文案质量检查\n1. 标记未经证实的事实。\n2. 检查表达是否具体、自然。\n3. 保持品牌语气一致。\n4. 返回原句、问题与修改建议。', tags: ['写作', '质量'] },
    { id: 'eco-mcp-docs', type: 'mcp', name: '文档连接器', description: '为工作室提供文档检索与摘要能力。连接信息仅用于本地演示。', endpoint: 'https://docs.example.com/mcp', content: '可用工具：search_documents、read_document。\n权限：只读。', tags: ['文档', '只读'] },
    { id: 'eco-prompt-brief', type: 'prompt', name: '从想法到产品简报', description: '把零散想法整理成目标、用户、范围与验收标准。', content: '你是一位经验丰富的产品经理。请根据 {{想法}} 输出一份产品简报，包含：目标用户、核心问题、解决思路、本期范围、非本期范围、成功标准。遇到信息缺口时明确列出假设。', tags: ['产品', '简报'] },
    { id: 'eco-prompt-notes', type: 'prompt', name: '会议纪要整理', description: '从讨论中提取决定、待办和未解决问题，保留负责人。', content: '请整理以下会议记录：{{会议记录}}。输出：讨论结论、行动项（负责人 / 截止时间）、待确认问题。不要补充记录中不存在的人名与日期。', tags: ['效率', '会议'] },
    { id: 'eco-memory-style', type: 'memory', name: '我的写作偏好', description: '简洁中文，结论在前，重要判断附上依据。', content: '使用简体中文。先给出结论，再解释依据。\n不使用夸张营销词。\n必要时用表格比较，不堆叠过多列表。', tags: ['偏好', '个人'] },
    { id: 'eco-file-roadmap', type: 'file', name: '产品路线图.md', description: '产品迭代方向与近期里程碑。示例文件元数据。', content: '演示文件，不包含原始文件内容。', size: 18432, mime: 'text/markdown', status: 'ready', tags: ['Markdown'] }
  ];
  const seedCatalog = [
    { id: 'market-researcher', type: 'agent', name: '深度研究员', author: 'OTRYX 编辑部', description: '从一个问题出发，完成检索、交叉核验与有据可循的研究简报。', details: '适合产品调研、行业学习与选题准备。先梳理研究问题，再给出来源清单，最终交付结构化简报。每个关键结论都保留事实与推断的边界。', icon: 'search', installs: '2.4k', rating: '4.9', tags: ['研究', '来源追踪'], features: ['拆解研究问题与检索路径', '比对来源并标注信息缺口', '生成附参考来源的研究简报'], content: '你是一位严谨的研究员。先明确研究范围，再整理来源与证据。区分事实、推断与尚待核实的信息，最后输出结论、依据和行动建议。', permissions: '使用你配置的模型；访问已授权知识库。' },
    { id: 'market-weekly', type: 'workflow', name: '一份周报的诞生', author: '林间工作室', description: '从工作记录到进展、风险与下周计划，交付前由你确认。', details: '把散落的工作记录整理成可阅读的周报。保留人工确认节点，适合个人项目和小团队汇报。', installs: '1.6k', rating: '4.8', tags: ['工作流', '人工确认'], features: ['聚合并去重工作记录', '提炼本周成果与阻塞', '确认后生成周报产物'], content: '输入工作记录 → 提取任务与进展 → 撰写周报 → 人工确认 → 生成文档', permissions: '读取你提供的工作记录；生成本地演示产物。' },
    { id: 'market-review', type: 'skill', name: '代码审阅搭档', author: 'Code & Craft', description: '围绕正确性、边界条件与维护成本，给出可操作的审阅意见。', details: '适用于小范围变更与提交前自查。按严重程度整理发现，避免把个人风格偏好当作缺陷。', installs: '3.1k', rating: '4.9', tags: ['开发', '代码质量'], features: ['检查输入与边界条件', '识别错误处理与状态问题', '按优先级提供修改建议'], content: '# 代码审阅\n基于提供的代码判断正确性。仅报告能够解释的缺陷，并附定位、影响与修复建议。不要凭空假设依赖行为。', permissions: '仅分析你提供的文本。' },
    { id: 'market-notion', type: 'mcp', name: '知识空间连接器', author: 'Open Tools', description: '为 Agent 接上知识页面的搜索、读取与目录浏览能力。', details: '使用统一工具接口连接知识空间。此原型只保存连接名称和地址，不发出请求，也不保存任何凭据。', endpoint: 'https://knowledge.example.com/mcp', installs: '986', rating: '4.7', tags: ['知识管理', '只读'], features: ['按标题和关键词搜索', '读取页面与引用关系', '浏览空间目录'], content: '工具：search_pages / read_page / list_pages\n模式：只读', permissions: '需要在真实部署时另行授权；本演示不建立外部连接。' },
    { id: 'market-brief', type: 'prompt', name: '把需求说清楚', author: '向前一小步', description: '把模糊的想法变成有用户、有边界、有验收标准的需求说明。', details: '为开始写需求前的思考提供结构。支持变量替换，适合产品、运营与开发协作。', installs: '1.2k', rating: '4.8', tags: ['产品设计', '需求'], features: ['定位真实用户与场景', '拆出范围和明确的非目标', '形成可验证的验收标准'], content: '请将 {{需求想法}} 整理为需求说明。依次输出：目标用户、当前问题、预期结果、核心流程、范围边界、验收标准、待确认问题。不要把假设写成已经确定的事实。', permissions: '仅使用你填写的提示词变量。' },
    { id: 'market-editor', type: 'agent', name: '品牌内容编辑', author: '纸间 Paper Lab', description: '记住品牌的表达方式，把初稿打磨成清晰、可信的内容。', details: '结合品牌知识库完成选题、写作和编辑。提供修改理由，便于你保留最终表达权。', installs: '1.8k', rating: '4.9', tags: ['品牌', '内容创作'], features: ['读取品牌语气与目标受众', '给出标题与结构备选', '检查事实、可读性和语气'], content: '你是品牌内容编辑。根据用户提供的品牌资料与目标读者编辑内容，保持事实准确、表达自然。逐项说明关键修改的原因。', permissions: '使用你配置的模型和指定的品牌资料。' },
    { id: 'market-csv', type: 'skill', name: '表格洞察速写', author: 'Data Garden', description: '先看数据质量，再找趋势、异常和值得继续追问的问题。', details: '帮助把一张表格转化为有边界的分析。适合在正式建模前检查数据与提出假设。', installs: '854', rating: '4.8', tags: ['数据', '表格'], features: ['检查缺失值与字段含义', '概述分布、趋势和异常', '给出可复现的后续分析计划'], content: '# 表格洞察\n先描述数据范围与质量，再提出最多五个值得关注的发现。对每个发现说明依据和限制。相关性不得表达为因果。', permissions: '仅分析你明确提供的数据。' },
    { id: 'market-launch', type: 'workflow', name: '新品发布准备室', author: '小步快跑', description: '一份产品资料，串起发布简报、渠道文案与检查清单。', details: '将资料输入、内容生成、人工校对与产物整理编排在一起。所有外发动作均留给你确认。', installs: '732', rating: '4.7', tags: ['发布', '内容协作'], features: ['梳理产品卖点和受众', '起草不同渠道的内容', '人工校对后整理交付清单'], content: '产品资料 → 核心信息提炼 → 多渠道文案 → 人工校对 → 发布检查清单', permissions: '读取输入资料；本演示不发送或发布内容。' },
    { id: 'market-fetch', type: 'mcp', name: '网页资料读取器', author: 'Open Tools', description: '把公开页面整理成干净的正文，为研究保留标题和出处。', details: '用于公开资料采集的连接器模板。提供结构化返回字段，便于后续摘要与引用。', endpoint: 'https://reader.example.com/mcp', installs: '2.0k', rating: '4.8', tags: ['网页', '资料收集'], features: ['提取公开页面正文', '保留标题、地址和读取时间', '按段落整理可引用资料'], content: '工具：read_public_page\n输出：title / url / text / retrieved_at', permissions: '真实连接时仅读取有权访问的公开页面；本地演示无网络请求。' },
    { id: 'market-interview', type: 'prompt', name: '访谈里的真实问题', author: '慢研究', description: '从用户的原话中提取动机、阻碍与证据，保留不确定之处。', details: '避免过早归纳。将观点和原始引文放在一起，让后续产品判断有据可循。', installs: '667', rating: '4.9', tags: ['用户研究', '访谈'], features: ['提取任务、动机与阻碍', '把结论对应到原始引文', '列出需要追加验证的问题'], content: '分析 {{访谈记录}}，输出用户任务、动机、当前解决方式、阻碍和未满足需求。每条发现附上原话作为依据。不要把单个受访者的观点概括为普遍规律。', permissions: '仅处理你提供的访谈内容。' },
    { id: 'market-learning', type: 'agent', name: '个人学习教练', author: '知更鸟', description: '围绕你的目标设计学习路径，用小练习检验真正的理解。', details: '从已有基础开始，为有限的时间安排可完成的学习任务。通过回顾与练习调整下一步。', installs: '1.1k', rating: '4.8', tags: ['学习', '个人成长'], features: ['确认目标和当前基础', '拆分可执行的学习单元', '通过练习反馈调整计划'], content: '你是耐心的学习教练。先了解用户目标、基础和可用时间，再制定具体的小步学习计划。用简短练习检验理解，遇到错误时解释原因。', permissions: '使用你配置的模型；保留你明确保存的学习偏好。' },
    { id: 'market-factcheck', type: 'skill', name: '事实与引用检查', author: 'OTRYX 编辑部', description: '区分事实、观点和推断，让每一个重要判断都能找到来处。', details: '对待发布的文章或报告进行证据检查。输出证据缺口与需要弱化措辞的段落。', installs: '1.5k', rating: '4.9', tags: ['事实核查', '质量'], features: ['标记需要来源的陈述', '检查引用与结论是否对应', '区分证据不足和事实错误'], content: '# 事实与引用检查\n逐段列出可核实陈述，检查给定来源是否直接支持它。没有来源时标记待核实，不得声称已完成检索。', permissions: '仅检查你提供的内容与来源。' }
  ];
  if (!Array.isArray(S.state.ecoAssets)) S.state.ecoAssets = seedAssets.map((a, i) => ({ ...a, version: '1.0.0', updated: new Date(Date.now() - i * 86400000).toISOString(), source: 'personal' }));
  if (!Array.isArray(S.state.installed)) S.state.installed = [];
  if (!Array.isArray(S.state.reviews)) S.state.reviews = [];
  if (!S.state.ecoReviewsSeeded) {
    if (!S.state.reviews.length) S.state.reviews.push(
      { id: 'eco-review-research', name: '竞品观察手册', type: 'skill', author: '陈序', status: 'pending', description: '按统一维度整理竞品动态，区分变化事实与影响判断。', version: '1.0.0', reason: '', created: stamp(), content: '记录产品、时间、变化和来源；按用户价值、体验与业务模式整理观察。', tags: ['研究', '产品'], permissions: '仅处理用户提供的资料。' },
      { id: 'eco-review-report', name: '阅读笔记整理', type: 'prompt', author: '纸飞机', status: 'pending', description: '把阅读摘录整理成观点、依据、疑问与下一步行动。', version: '1.1.0', reason: '', created: stamp(), content: '请整理 {{阅读摘录}}，分为核心观点、依据、我的疑问和下一步行动。', tags: ['阅读', '效率'] },
      { id: 'eco-review-old', name: '通用营销文案模板', type: 'prompt', author: '我', status: 'rejected', description: '为不同产品快速生成渠道文案。', version: '1.0.0', reason: '请补充输入变量说明和输出示例，并明确事实核验要求。', created: stamp(), content: '为 {{产品}} 生成一份推广文案。', tags: ['写作'] }
    );
    S.state.ecoReviewsSeeded = true;
  }
  const allResources = () => seedCatalog.concat(S.state.reviews.filter(r => r.status === 'approved').map(r => ({ ...r, id: `community-${r.id}`, reviewId: r.id, details: r.details || r.description, installs: '新', rating: '新上架', features: r.features || ['社区审核通过', '安装后可在个人空间继续编辑', '保留当前版本快照'], permissions: r.permissions || '按你授予的权限使用。', tags: r.tags || ['社区作品'] })));
  const getAsset = (id, version) => {
    const asset = shareable().find(a => a.id === id);
    if (asset && version && ['prompt', 'skill'].includes(asset.type)) {
      const snapshot = S.ContentStore?.getContent(id, version);
      return snapshot ? { ...asset, ...snapshot } : null;
    }
    return asset && version && String(asset.version)!==String(version) ? null : asset;
  };
  const getResource = id => allResources().find(a => a.id === id);
  function installedTarget(id) {
    const agent = (S.state.agents || []).find(a => a.marketId === id);
    if (agent) return { route: 'agent', id: agent.id };
    const flow = (S.state.workflow?.flows || []).find(f => f.marketId === id);
    if (flow) return { route: 'workflow', id: flow.id };
    const content = S.ContentStore?.listContent({ archived: 'all' }).find(a => a.marketId === id);
    if (content) return { route: 'content-detail', id: content.id };
    const connection = S.Runtime?.connections.find(c => c.marketId === id || c.templateId === id || c.migratedAssetId === id);
    if (connection) return { route: connection.kind === 'plugin' ? 'plugin-detail' : 'mcp-detail', id: connection.kind === 'plugin' ? connection.pluginId : connection.id };
    const plugin = S.Runtime?.plugins.find(item => item.marketId === id || item.templateId === id);
    if (plugin && plugin.installed !== false && plugin.status !== 'available') return { route: 'plugin-detail', id: plugin.id };
    return null;
  }
  const installed = id => !!installedTarget(id);
  function publicSnapshot(value) {
    // Graph configuration owns its credentials; business JSON keeps its field names.
    // For example, inputs.token and a mapping output named password are not secrets
    // merely because of their names. Resolved private context belongs to the source
    // workspace and is never bundled in a public workflow template.
    const graph = S.Runtime?.snapshot ? S.Runtime.snapshot(value) : JSON.parse(JSON.stringify({ id: value.id, title: value.title, description: value.description, version: value.version, graphSchema: value.graphSchema, nodes: value.nodes || [], edges: value.edges || [], inputs: value.inputs || {}, inputSchema: value.inputSchema, outputSchema: value.outputSchema }));
    const privateFields = ['credentialRef', 'knowledgeSnapshot', 'materializedContexts', 'capabilitySnapshots', 'promptSnapshot', 'resourceSnapshot', 'skillSnapshot', 'agentSnapshot', 'resolvedSnapshot', 'contextSnapshots'];
    const credentialKey = /^(?:api[_-]?key|token|password|secret|authorization|access_token|refresh_token|credential|credentials|auth|secrets|env)$/i;
    const headerKey = /^(?:authorization|proxy-authorization|cookie|set-cookie|(?:x-)?api[-_]?key|access[-_]?token)$/i;
    const cleanNodes = nodes => (nodes || []).forEach(node => {
      const config = node.config || {};
      for (const key of privateFields) delete config[key];
      if (['mcp', 'plugin', 'http', 'database', 'sandbox'].includes(node.type)) {
        for (const key of Object.keys(config)) if (credentialKey.test(key)) delete config[key];
        if (config.binding && typeof config.binding === 'object') { for (const key of Object.keys(config.binding)) if (credentialKey.test(key) || key === 'credentialRef') delete config.binding[key]; }
      }
      if (node.type === 'http') {
        if (config.headers && typeof config.headers === 'object') for (const key of Object.keys(config.headers)) if (headerKey.test(key)) delete config.headers[key];
        if (config.url) { try { const url = new URL(config.url); if (/^https?:$/.test(url.protocol)) { url.username = ''; url.password = ''; for (const key of [...url.searchParams.keys()]) if (credentialKey.test(key)) url.searchParams.delete(key); config.url = url.toString(); } } catch (_) {} }
      }
      if (config.body?.nodes) cleanNodes(config.body.nodes);
    });
    cleanNodes(graph.nodes);
    return graph;
  }
  function publicEndpoint(value) { try { const url = new URL(value); return /^https?:$/.test(url.protocol) ? url.origin + url.pathname : undefined; } catch (_) { return undefined; } }
  // Public plugin packages only contain a portable allow-listed adapter manifest.
  // Never publish instance endpoints, configuration, credentials or execution history.
  function publicPluginManifest(plugin) {
    const allowed = new Set(['docs.create','table.upsert','web.search','web.fetch','workspace.write']);
    const actions=(plugin.toolIds||[]).map(id=>(S.Runtime?.tools||[]).find(t=>t.id===id)).filter(Boolean).map(tool=>({name:tool.name,title:tool.title,adapterId:tool.adapterId||tool.originToolId||tool.id}));
    if(!actions.length||actions.length!==(plugin.toolIds||[]).length||actions.length>12||actions.some(action=>!action.name||!allowed.has(action.adapterId))||new Set(actions.map(action=>action.name)).size!==actions.length)return null;
    return {name:String(plugin.name||'Plugin'),description:String(plugin.description||''),version:String(plugin.version||'1.0.0'),actions};
  }
  function shareable() {
    const contents = S.ContentStore?.listContent({ archived: false }) || [];
    const flows = (S.state.workflow?.flows || []).filter(f => f.publishedSnapshot || f.published).map(f => ({ id: f.id, type: 'workflow', name: f.title, description: f.description, content: JSON.stringify(publicSnapshot(f.publishedSnapshot || f), null, 2), version: (f.publishedSnapshot || f).version, tags: ['工作流'], workflowSnapshot: publicSnapshot(f.publishedSnapshot || f) }));
    const connections = (S.Runtime?.connections || []).filter(c => c.kind === 'mcp').map(c => {
      const endpoint = c.transport === 'stdio' ? undefined : publicEndpoint(c.endpoint);
      const configTemplate = { transport: c.transport || 'Streamable HTTP', location: c.location || '平台 Runner', endpoint };
      return { id: c.id, type: 'mcp', name: c.name, description: c.description || 'MCP 连接模板；安装者自行配置授权。', endpoint, transport: configTemplate.transport, location: configTemplate.location, configTemplate, content: JSON.stringify({ ...configTemplate, description: c.description || '', toolNames: (S.Runtime?.tools || []).filter(t => t.connectionId === c.id).map(t => t.name), note: c.transport === 'stdio' ? '启动命令、参数和环境变量由安装者自行配置，不在公共模板中共享。' : '授权与凭据引用由安装者自行配置。' }, null, 2), version: c.version || '1.0.0', tags: ['MCP 模板'] };
    });
    const plugins=(S.Runtime?.plugins||[]).filter(p=>p.installed!==false&&p.status==='installed').map(p=>{
      const manifest=publicPluginManifest(p);if(!manifest)return null;
      return {id:p.id,type:'plugin',name:manifest.name,description:manifest.description||'可移植的插件动作清单',version:manifest.version,tags:['插件模板'],content:JSON.stringify(manifest,null,2),configTemplate:{manifest}};
    }).filter(Boolean);
    const agents=(S.state.agents||[]).filter(a=>a.publishedConfig).map(a=>{
      const v=a.publishedConfig;
      return {id:a.id,type:'agent',name:v.name,description:v.description||'智能体提示词模板；能力由安装者重新配置',version:v.version||a.version,tags:['Agent 模板'],content:v.prompt||''};
    }).filter(a=>a.content);
    return contents.concat(flows, connections, plugins, agents);
  }
  const visibleReviews = () => S.state.role === 'admin' ? S.state.reviews : S.state.reviews.filter(review => review.author === '我');
  const reviewBadge = status => S.badge(({ pending: '待审核', approved: '已通过', rejected: '已退回' })[status] || '草稿', ({ pending: 'warning', approved: 'success', rejected: 'danger' })[status] || 'neutral');
  const iconTile = (type, icon, large = false) => `<span class="eco-icon eco-icon-${meta(type).tone}${large ? ' eco-icon-lg' : ''}">${S.icon(icon || meta(type).icon, large ? 28 : 22)}</span>`;
  const filterButtons = (items, active, action) => `<div class="eco-filters" aria-label="资源分类">${items.map(t => `<button type="button" class="eco-filter${active === t.id ? ' is-active' : ''}" data-action="${action}" data-id="${E(t.id)}" aria-pressed="${active === t.id}">${E(t.label)}${t.count !== undefined ? `<span>${t.count}</span>` : ''}</button>`).join('')}</div>`;
  const searchMount = (container, id, onQuery) => {
    const input = container.querySelector(`#${id}`);
    if (!input) return;
    let composing = false;
    input.addEventListener('compositionstart', () => { composing = true; });
    input.addEventListener('compositionend', () => { composing = false; onQuery(input.value); });
    input.addEventListener('input', event => { if (!composing && !event.isComposing) onQuery(input.value); });
  };
  const field = (label, id, value, help, required = false, multiline = false) => multiline ? `<div class="field"><label class="field-label" for="${id}">${E(label)}${required ? ' <span aria-hidden="true">*</span>' : ''}</label><textarea class="textarea eco-content-input" id="${id}" name="${id}" rows="7" style="resize: none" ${required ? 'required' : ''} aria-describedby="${id}-help">${E(value || '')}</textarea><p class="field-help" id="${id}-help">${E(help || '')}</p><p class="field-error" id="${id}-error"></p></div>` : S.field(label, { id, name: id, value: value || '', required, help });
  const secretError = value => /(?:sk-[a-z0-9_-]{12,}|(?:api[_ -]?key|access[_ -]?token|secret|authorization)\s*[:=]\s*["']?[^\s"']{10,})/i.test(value || '') ? '请移除真实密钥或访问凭据；此处只保存可公开的说明。' : null;

  S.action('eco-close', () => S.closeModal());

  function marketCard(a) {
    const active = installed(a.id), action = active ? 'eco-open-installed' : 'eco-install';
    const label = active ? '管理' : a.type === 'mcp' ? '配置连接' : '安装';
    return `<article class="eco-market-card"><div class="row between">${iconTile(a.type, a.icon)}<span class="eco-type-label">${E(meta(a.type).label)}</span></div><button type="button" class="eco-card-title" data-action="eco-market-detail" ${attr(a.id)}>${E(a.name)}</button><p class="eco-card-description">${E(a.description)}</p><div class="eco-card-tags">${(a.tags || []).slice(0, 2).map(t => `<span class="tag">${E(t)}</span>`).join('')}</div><div class="eco-market-author"><span>${E(a.author)}</span><span>v${E(a.version || '1.0.0')}</span></div><div class="eco-market-bottom"><span class="muted small">${active ? '已加入我的空间' : a.reviewId ? '社区已审核' : '示例模板'}</span>${S.btn(label, action, { icon: active ? 'arrow' : 'plus', variant: 'secondary', small: true, attrs: attr(a.id) })}</div></article>`;
  }
  function marketResults() {
    const q = ui.marketQuery.trim().toLowerCase(); const resources = allResources().filter(a => (ui.marketType === 'all' || a.type.toLowerCase() === ui.marketType) && (!q || `${a.name} ${a.description} ${a.author} ${(a.tags || []).join(' ')}`.toLowerCase().includes(q)));
    return `<div class="eco-result-heading"><p class="small muted" role="status">${ui.marketQuery ? `找到 ${resources.length} 个资源` : `共 ${resources.length} 个可用模板`}</p><span class="small muted">模板安装后在对应模块管理</span></div>${resources.length ? `<div class="eco-market-grid">${resources.slice(0, ui.marketLimit).map(marketCard).join('')}</div>${resources.length > ui.marketLimit ? `<div class="eco-load-more">${S.btn(`继续探索（还有 ${resources.length - ui.marketLimit} 个）`, 'eco-market-more', { variant: 'secondary', icon: 'arrow' })}</div>` : ''}` : S.empty('暂时没有匹配的资源', '试试其它分类或关键词，也可以提交你的作品。', S.btn('清除搜索与筛选', 'eco-market-clear', { variant: 'secondary' }))}`;
  }
  S.page('market', {
    title: '资源市场', section: '资源',
    render() { return `<div class="eco-page">${S.header('模板与扩展', '资源市场', '查找可复用模板。安装后进入对应管理页，连接授权始终由你配置。', S.btn('我的提交', 'eco-open-reviews', { icon: 'clock', variant: 'ghost' }) + S.btn('分享模板', 'eco-publish-choose', { icon: 'upload', variant: 'secondary' }))}<div class="eco-market-controls">${filterButtons([{ id: 'all', label: '全部' }, ...['agent', 'workflow', 'skill', 'mcp', 'plugin', 'prompt'].map(id => ({ id, label: meta(id).label }))], ui.marketType, 'eco-market-tab')}${S.search('eco-market-search', '搜索名称、用途或作者', ui.marketQuery)}</div><div id="eco-market-results">${marketResults()}</div><p class="eco-ownership-note">知识正文在 <a href="#knowledge">知识库</a> 维护；模板在 <a href="#library">提示词与 Skills</a> 维护；MCP 与插件实例统一在 <a href="#capabilities">工具与连接</a> 配置。</p></div>`; },
    mount(container) { searchMount(container, 'eco-market-search', q => { ui.marketQuery = q; ui.marketLimit = 9; container.querySelector('#eco-market-results').innerHTML = marketResults(); const input = container.querySelector('#eco-market-search'); const clear = input?.parentElement?.querySelector('.search-clear'); if (clear) clear.hidden = !q; }); }
  });
  S.action('eco-open-reviews', () => S.go('review'));
  S.action('eco-market-tab', el => { ui.marketType = el.dataset.id; ui.marketLimit = 9; S.render(); });
  S.action('eco-market-more', () => { ui.marketLimit += 9; S.render(); });
  S.action('eco-market-clear', () => { ui.marketQuery = ''; ui.marketType = 'all'; S.render(); document.querySelector('#eco-market-search')?.focus(); });
  S.action('eco-market-detail', el => {
    const a = getResource(el.dataset.id); if (!a) return S.toast('这项资源尚未公开或已不可用。', 'warning');
    S.drawer({ title: a.name, subtitle: `${meta(a.type).label} · ${a.author} · v${a.version || '1.0.0'}`, body: `<div class="eco-detail-top">${iconTile(a.type, a.icon, true)}<p>${E(a.details || a.description)}</p></div><div class="eco-card-tags">${(a.tags || []).map(t => `<span class="tag">${E(t)}</span>`).join('')}${S.badge(a.reviewId ? '审核通过' : '示例模板', a.reviewId ? 'success' : 'info')}</div><div class="eco-detail-section"><h3>它能帮助你</h3><ul class="eco-feature-list">${(a.features || []).map(f => `<li>${S.icon('check', 17)}<span>${E(f)}</span></li>`).join('')}</ul></div><div class="eco-detail-section"><h3>${a.type === 'mcp' ? '连接与工具' : a.type === 'workflow' ? '工作流概览' : '方法预览'}</h3>${a.endpoint ? `<code class="eco-code-line">${E(a.endpoint)}</code>` : ''}<pre class="eco-content-preview">${E(a.content || a.description)}</pre></div><div class="eco-detail-section"><h3>使用范围</h3><p class="muted">${E(a.permissions || '使用你授权的模型与资料。')}</p><p class="notice small">内容模板安装后可独立编辑；MCP 模板只预填连接表单，需要单独保存与授权。本地原型不会连接外部服务。</p></div>`, footer: `${S.btn('关闭', 'eco-close', { variant: 'secondary' })}${S.btn(installed(a.id) ? '打开管理页' : a.type === 'mcp' ? '配置连接' : '安装到我的空间', installed(a.id) ? 'eco-open-installed' : 'eco-install', { icon: installed(a.id) ? 'arrow' : 'plus', attrs: attr(a.id) })}` });
  });
  S.action('eco-open-installed', el => { const target = installedTarget(el.dataset.id); if (!target) return S.toast('请重新安装或配置此模板。', 'warning'); S.closeModal(); S.go(target.route, { id: target.id }); });
  S.action('eco-install', el => {
    const a = getResource(el.dataset.id); if (!a || el.disabled) return;
    const target = installedTarget(a.id); if (target) { S.closeModal(); S.go(target.route, { id: target.id }); return; }
    if (a.type === 'mcp') { S.closeModal(); if (S.CapabilityUI?.openConnectionTemplate) S.CapabilityUI.openConnectionTemplate(a); else S.go('capabilities', { tab: 'mcp', templateId: a.id }); return; }
    if (a.type === 'plugin') { S.closeModal(); if (S.CapabilityUI?.openPluginTemplate) S.CapabilityUI.openPluginTemplate(a); else S.go('capabilities', { tab: 'plugins' }); return; }
    try {
      let route, id;
      if (a.type.toLowerCase() === 'agent') {
        const agent = { id: S.uid('agent'), name: a.name, description: a.description, icon: a.icon || 'agent', color: 'mint', model: S.state.models?.find(model => model.status === 'connected')?.name || 'DeepSeek Chat', version: a.version || '1.0.0', status: 'draft', tags: a.tags || [], prompt: a.content || a.description, knowledge: '', tools: [], capabilityBindings: [], contextBindings: [], runs: 0, updated: today(), marketId: a.id, favorite: false, temperature: 0.7, requireApproval: true };
        S.state.agents.unshift(agent); route = 'agent'; id = agent.id;
      } else if (a.type.toLowerCase() === 'workflow') {
        if (typeof S.installWorkflow !== 'function') throw new Error('工作流编辑器尚未就绪，请稍后重试。');
        const flow = S.installWorkflow(a); route = 'workflow'; id = typeof flow === 'string' ? flow : flow?.id || S.state.workflow.flows.find(f => f.marketId === a.id)?.id;
      } else {
        if (!S.ContentStore) throw new Error('内容库尚未就绪，请稍后重试。');
        const item = S.ContentStore.installTemplate(a); route = 'content-detail'; id = item.id;
      }
      if (!S.state.installed.includes(a.id)) S.state.installed.push(a.id);
      S.save(); S.closeModal(); S.go(route, { id }); S.toast('模板已加入我的空间，可以继续配置');
    } catch (error) { S.toast(error.message || '安装失败，请重试', 'error'); }
  });

  function publishForm(asset) {
    if (!asset) return;
    if (S.state.reviews.some(r => r.assetId === asset.id && r.version === asset.version && ['pending', 'approved'].includes(r.status))) return S.toast('当前版本已经提交，无需重复提交。', 'info');
    S.modal({ title: '提交公开审核', subtitle: `公开作品：${asset.name}`, body: `<form id="eco-publish-form" novalidate><div class="notice"><strong>通过审核后，当前原型市场可发现并安装该版本；正式公共仓库面向所有获授权的用户。</strong><p>提交的是当前版本快照；个人空间中的后续修改不会自动公开。</p></div>${field('公开说明', 'eco-public-description', asset.description, '说清楚用途、适用范围与使用方式，至少 12 个字符。', true, true)}<label class="eco-check-field"><input type="checkbox" id="eco-publish-consent" name="eco-publish-consent"><span>我已检查内容，确认不含私人资料、密钥或未经授权的内容。</span></label><p id="eco-publish-consent-error" class="field-error"></p></form>`, footer: `${S.btn('取消', 'eco-close', { variant: 'secondary' })}${S.btn('提交审核', 'eco-publish-confirm', { icon: 'send', attrs: attr(asset.id) + ' data-version="' + E(asset.version || '1.0.0') + '"' })}` });
  }
  S.action('eco-publish', el => publishForm(getAsset(el.dataset.id, el.dataset.version)));
  S.action('eco-publish-choose', () => {
    const assets = shareable();
    if (!assets.length) return S.modal({ title: '先创建一份模板', body: S.empty('暂时没有可提交的作品', 'Agent、工作流、插件、Skill、MCP 和提示词可以提交到公共市场。', S.btn('创建内容', 'eco-asset-create', { icon: 'plus' })), footer: S.btn('关闭', 'eco-close', { variant: 'secondary' }) });
    S.modal({ title: '选择要分享的作品', subtitle: '个人知识库、记忆与文件不参与公共发布。', body: `<div class="field"><label class="field-label" for="eco-publish-asset">选择模板</label><select class="select" id="eco-publish-asset">${assets.map(a => `<option value="${E(a.id)}">${E(a.name)} · ${meta(a.type).label} · v${E(a.version || '1.0.0')}</option>`).join('')}</select></div><p class="notice small">提交后进入管理员审核，审核通过前不会出现在社区市场。</p>`, footer: `${S.btn('取消', 'eco-close', { variant: 'secondary' })}${S.btn('继续', 'eco-publish-next', { icon: 'arrow' })}` });
  });
  S.action('eco-publish-next', () => publishForm(getAsset(document.querySelector('#eco-publish-asset')?.value)));
  S.action('eco-publish-confirm', el => {
    const a = getAsset(el.dataset.id, el.dataset.version); const form = document.querySelector('#eco-publish-form'); if (!a) return S.toast('作品版本已变化，请重新选择当前版本。','warning'); if (!form || el.disabled) return;
    const valid = S.validate(form, { 'eco-public-description': value => value.trim().length < 12 ? '请补充至少 12 个字符的用途与使用说明。' : secretError(value) });
    const consent = form.querySelector('#eco-publish-consent');
    const error = form.querySelector('#eco-publish-consent-error');
    error.textContent = consent.checked ? '' : '请先检查作品内容并勾选确认。'; consent.setAttribute('aria-invalid', String(!consent.checked)); consent.setAttribute('aria-describedby', 'eco-publish-consent-error');
    if (!valid || !consent.checked) { if (valid) consent.focus(); return; }
    if (secretError(a.content) || secretError(a.endpoint) || secretError(a.name)) return S.toast('作品中疑似包含密钥，请先编辑移除后再提交。', 'error');
    if (S.state.reviews.some(r => r.assetId === a.id && r.version === a.version && ['pending', 'approved'].includes(r.status))) return S.toast('当前版本已经提交。', 'info');
    el.disabled = true;
    S.state.reviews.unshift({ id: S.uid('review'), assetId: a.id, name: a.name, type: a.type, workflowSnapshot: a.workflowSnapshot ? JSON.parse(JSON.stringify(a.workflowSnapshot)) : undefined, configTemplate: a.configTemplate ? JSON.parse(JSON.stringify(a.configTemplate)) : undefined, transport: a.transport, location: a.location, author: '我', status: 'pending', description: form.querySelector('#eco-public-description').value.trim(), content: a.content, endpoint: a.endpoint, tags: a.tags, version: a.version || '1.0.0', reason: '', created: stamp() });
    if(S.save()===false){S.state.reviews.shift();el.disabled=false;return S.toast('审核记录未保存，请检查浏览器存储。','warning');} S.closeModal(); ui.reviewStatus = 'pending'; S.go('review'); S.render(); S.toast('作品已提交，等待管理员审核');
  });
  function reviewResults() {
    const q = ui.reviewQuery.trim().toLowerCase();
    const reviews = visibleReviews().filter(r => (ui.reviewStatus === 'all' || r.status === ui.reviewStatus) && (!q || `${r.name} ${r.description} ${r.author}`.toLowerCase().includes(q)));
    return `<p class="small muted" role="status">共 ${reviews.length} 份提交</p>${reviews.length ? `<div class="eco-reviews">${reviews.map(r => `<article class="eco-review-row">${iconTile(r.type)}<div class="eco-review-main"><button type="button" class="eco-review-title" data-action="eco-review-detail" ${attr(r.id)}>${E(r.name)}</button><p>${E(r.description)}</p><div class="eco-review-meta"><span>${E(r.author)} 提交</span><span>${meta(r.type).label}</span><span>v${E(r.version || '1.0.0')}</span><span>${fmtDate(r.created)}</span></div>${r.status === 'rejected' ? `<p class="eco-review-reason">退回原因：${E(r.reason || '请补充作品说明后重新提交。')}</p>` : ''}</div><div class="eco-review-actions">${reviewBadge(r.status)}${S.btn(S.state.role === 'admin' && r.status === 'pending' ? '开始审核' : '查看详情', 'eco-review-detail', { variant: 'secondary', small: true, attrs: attr(r.id) })}</div></article>`).join('')}</div>` : S.empty('还没有这类提交', ui.reviewQuery ? '尝试其它关键词，或清除搜索。' : '提交作品后，可以在这里查看每个版本的审核状态。', S.btn('提交作品', 'eco-publish-choose', { icon: 'plus' }))}`;
  }
  S.page('review', {
    title: '资源审核', section: '资源',
    render() { const admin = S.state.role === 'admin'; return `<div class="eco-page">${S.header('公共模板', '资源审核', '核对用途、内容和权限，审核通过后公开指定版本。', S.btn('提交作品', 'eco-publish-choose', { icon: 'plus' }))}<div class="eco-role-banner">${S.icon('shield', 22)}<div><strong>${admin ? '演示管理员 · 可以审核公共作品' : '普通成员 · 查看自己的提交'}</strong><p>${admin ? '仅处理待审核作品。审核通过后，会立即出现在演示市场。' : '公开作品由管理员审核。使用顶部的演示角色切换，可以体验管理员审核流程。'}</p></div>${S.badge('本地演示', 'info')}</div><div class="eco-review-layout"><section>${filterButtons([{ id: 'all', label: '全部' }, { id: 'pending', label: '待审核', count: visibleReviews().filter(r => r.status === 'pending').length }, { id: 'approved', label: '已通过' }, { id: 'rejected', label: '已退回' }], ui.reviewStatus, 'eco-review-tab')}<div class="eco-review-search">${S.search('eco-review-search', '搜索作品或作者', ui.reviewQuery)}</div><div id="eco-review-results">${reviewResults()}</div></section><aside class="eco-review-guide"><span class="eco-guide-icon">${S.icon('globe', 25)}</span><h3>公开前，再检查一遍</h3><ol><li><strong>能解决什么问题</strong><p>用途明确，输入与输出有说明。</p></li><li><strong>是否容易开始使用</strong><p>给出示例，注明所需工具与权限。</p></li><li><strong>是否适合公开</strong><p>移除私人资料、密钥和未授权内容。</p></li></ol><div class="eco-guide-footer">审核通过只是起点。<br>后续更新需要再次审核。</div></aside></div></div>`; },
    mount(container) { searchMount(container, 'eco-review-search', q => { ui.reviewQuery = q; container.querySelector('#eco-review-results').innerHTML = reviewResults(); }); }
  });
  S.action('eco-review-tab', el => { ui.reviewStatus = el.dataset.id; S.render(); });
  S.action('eco-review-detail', el => showReview(el.dataset.id));
  function showReview(id) {
    const r = visibleReviews().find(r => r.id === id); if (!r) return S.toast('这份提交不属于当前可查看的审核记录。', 'warning');
    const canReview = S.state.role === 'admin' && r.status === 'pending';
    S.drawer({ title: r.name, subtitle: `${meta(r.type).label} · ${r.author} · v${r.version || '1.0.0'}`, body: `<div class="row between"><span class="muted small">${fmtDate(r.created)} 提交</span>${reviewBadge(r.status)}</div><div class="eco-detail-section"><h3>公开说明</h3><p>${E(r.description)}</p></div><div class="eco-detail-section"><h3>提交的版本快照</h3>${r.endpoint ? `<code class="eco-code-line">${E(r.endpoint)}</code>` : ''}<pre class="eco-content-preview">${E(r.content || '作者尚未提供详细内容。')}</pre></div>${r.reason ? `<div class="eco-review-reason"><strong>退回原因</strong><p>${E(r.reason)}</p></div>` : ''}<div class="eco-detail-section"><h3>审核记录</h3><ul class="eco-audit-list"><li>${S.icon('send', 16)}<span>${E(r.author)} 提交 v${E(r.version || '1.0.0')}</span></li>${r.status !== 'pending' ? `<li>${S.icon(r.status === 'approved' ? 'check' : 'refresh', 16)}<span>演示管理员${r.status === 'approved' ? '审核通过，已在市场公开' : '退回修改'}${r.reviewedAt ? ` · ${fmtDate(r.reviewedAt)}` : ''}</span></li>` : '<li><span class="eco-audit-dot"></span><span>等待管理员审核，尚未公开</span></li>'}</ul></div>${canReview ? '<p class="notice small">通过后，社区用户将能够发现并安装这个版本。请检查内容、权限说明与适用范围。</p>' : ''}`, footer: canReview ? `${S.btn('退回修改', 'eco-review-reject', { variant: 'secondary', attrs: attr(r.id) })}${S.btn('通过并公开', 'eco-review-approve', { icon: 'check', attrs: attr(r.id) })}` : `${S.btn('关闭', 'eco-close', { variant: 'secondary' })}${r.status === 'approved' ? S.btn('在市场查看', 'eco-review-market', { icon: 'globe', attrs: attr(r.id) }) : r.status === 'rejected' && r.assetId && getAsset(r.assetId) ? S.btn('编辑并重新提交', 'eco-asset-edit', { icon: 'edit', attrs: attr(r.assetId) }) : ''}` });
  }
  S.action('eco-review-approve', el => {
    const r = S.state.reviews.find(r => r.id === el.dataset.id);
    if (S.state.role !== 'admin') return S.toast('只有演示管理员可以审核作品。', 'warning');
    if (!r || r.status !== 'pending') return S.toast('这份提交已经处理，无需重复审核。', 'info');
    const previous={...r};r.status = 'approved'; r.reason = ''; r.reviewedAt = stamp(); if(S.save()===false){Object.assign(r,previous);return S.toast('审核结果未保存','warning');} S.closeModal(); S.render(); S.toast(`“${r.name}”已通过审核，并在市场公开`);
  });
  S.action('eco-review-reject', el => {
    const r = S.state.reviews.find(r => r.id === el.dataset.id);
    if (S.state.role !== 'admin' || !r || r.status !== 'pending') return S.toast('当前没有可执行的审核操作。', 'warning');
    S.modal({ title: `退回“${r.name}”`, subtitle: '给作者明确的修改方向，作品将保留在审核记录中。', body: `<form id="eco-reject-form" novalidate>${field('退回原因', 'eco-reject-reason', '', '至少 8 个字符，说明需要补充或修改的内容。', true, true)}</form>`, footer: `${S.btn('取消', 'eco-close', { variant: 'secondary' })}${S.btn('退回修改', 'eco-review-reject-confirm', { attrs: attr(r.id) })}` });
  });
  S.action('eco-review-reject-confirm', el => {
    const r = S.state.reviews.find(r => r.id === el.dataset.id); const form = document.querySelector('#eco-reject-form');
    if (S.state.role !== 'admin' || !r || r.status !== 'pending') return S.toast('审核状态已变化，请刷新后重试。', 'warning');
    if (!form || !S.validate(form, { 'eco-reject-reason': value => value.trim().length < 8 ? '请填写至少 8 个字符的具体修改建议。' : secretError(value) })) return;
    r.status = 'rejected'; r.reason = form.querySelector('#eco-reject-reason').value.trim(); r.reviewedAt = stamp(); S.save(); S.closeModal(); S.render(); S.toast('作品已退回，修改原因已保存');
  });
  S.Ecosystem={shareable,getAsset,allResources,publicPluginManifest};
  S.action('eco-review-market', el => { S.closeModal(); ui.marketType = 'all'; ui.marketQuery = S.state.reviews.find(r => r.id === el.dataset.id)?.name || ''; S.go('market'); S.render(); });
})();
