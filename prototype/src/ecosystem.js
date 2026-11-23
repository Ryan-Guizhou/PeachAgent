(function () {
  'use strict';
  const S = window.Studio;
  const E = S.escape;
  const types = {
    knowledge: { label: '知识库', icon: 'book', tone: 'mint' },
    skill: { label: 'Skill', icon: 'bolt', tone: 'lilac' },
    mcp: { label: 'MCP', icon: 'plug', tone: 'apricot' },
    prompt: { label: '提示词', icon: 'terminal', tone: 'mint' },
    memory: { label: '记忆', icon: 'layers', tone: 'lilac' },
    file: { label: '文件', icon: 'file', tone: 'apricot' },
    agent: { label: 'Agent', icon: 'agent', tone: 'mint' },
    workflow: { label: 'Workflow', icon: 'workflow', tone: 'lilac' }
  };
  const ui = { assetType: 'all', assetQuery: '', assetSort: 'updated', assetLimit: 9, marketType: 'all', marketQuery: '', marketLimit: 9, reviewStatus: 'all', reviewQuery: '' };
  const stamp = () => new Date().toISOString();
  const today = () => new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const meta = type => types[String(type || '').toLowerCase()] || types.skill;
  const fmtDate = value => value ? new Date(value).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai', month: 'short', day: 'numeric' }) : '今天';
  const sizeText = n => n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
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
  const getAsset = id => S.state.ecoAssets.find(a => a.id === id);
  const getResource = id => allResources().find(a => a.id === id);
  const installed = id => S.state.installed.includes(id) && (
    (S.state.agents || []).some(agent => agent.marketId === id) ||
    S.state.ecoAssets.some(asset => asset.marketId === id) ||
    (S.state.workflow?.flows || []).some(flow => flow.marketId === id)
  );
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

  function assetCard(a) {
    const review = [...S.state.reviews].reverse().find(r => r.assetId === a.id && r.version === a.version);
    return `<article class="eco-asset-card"><div class="row between">${iconTile(a.type)}<span class="eco-type-label">${E(meta(a.type).label)}</span></div><button type="button" class="eco-card-title" data-action="eco-asset-detail" ${attr(a.id)}>${E(a.name)}</button><p class="eco-card-description">${E(a.description)}</p><div class="eco-card-tags">${(a.tags || []).slice(0, 2).map(t => `<span class="tag">${E(t)}</span>`).join('')}${a.source === 'market' ? S.badge('来自市场', 'info') : ''}</div><div class="eco-asset-footer"><span>${a.type === 'knowledge' ? `${a.documents || 0} 份资料` : a.type === 'file' ? sizeText(a.size || 0) : `v${E(a.version || '1.0.0')}`}</span>${review ? reviewBadge(review.status) : `<span>${fmtDate(a.updated)} 更新</span>`}</div></article>`;
  }
  function filteredAssets() {
    const q = ui.assetQuery.trim().toLocaleLowerCase();
    return S.state.ecoAssets.filter(a => (ui.assetType === 'all' || a.type === ui.assetType) && (!q || `${a.name} ${a.description} ${(a.tags || []).join(' ')}`.toLocaleLowerCase().includes(q))).sort((a, b) => ui.assetSort === 'name' ? a.name.localeCompare(b.name, 'zh-CN') : String(b.updated).localeCompare(String(a.updated)));
  }
  function assetResults() {
    const assets = filteredAssets();
    return `<div class="eco-result-heading"><p class="muted small" role="status">${ui.assetQuery ? `找到 ${assets.length} 项资产` : `共 ${assets.length} 项资产`}</p><span class="small muted">保存在个人空间</span></div>${assets.length ? `<div class="eco-asset-grid">${assets.slice(0, ui.assetLimit).map(assetCard).join('')}</div>${assets.length > ui.assetLimit ? `<div class="eco-load-more">${S.btn(`加载更多（还有 ${assets.length - ui.assetLimit} 项）`, 'eco-assets-more', { variant: 'secondary' })}</div>` : ''}` : S.empty(ui.assetQuery ? '没有找到匹配的资产' : '这里还没有资产', ui.assetQuery ? '试试更短的关键词，或清除搜索查看全部资产。' : '创建一份知识、提示词或工具配置，让下一次工作更快开始。', S.btn(ui.assetQuery ? '清除搜索' : '创建资产', ui.assetQuery ? 'eco-assets-clear' : 'eco-asset-create', { icon: ui.assetQuery ? 'close' : 'plus' }))}`;
  }
  S.page('assets', {
    title: '资产库', section: '构建',
    render() {
      const list = ['knowledge', 'skill', 'mcp', 'prompt', 'memory', 'file'];
      if (S.state.ecoAssets.some(a => a.type === 'workflow')) list.push('workflow');
      return `<div class="eco-page">${S.header('能力管理', '资产库', '让资料、工具与经验，成为下一次工作的起点。', `${S.btn('导入文件', 'eco-upload', { icon: 'upload', variant: 'secondary' })}${S.btn('创建资产', 'eco-asset-create', { icon: 'plus' })}`)}<div class="eco-library-note"><div class="eco-library-mark">${S.icon('layers', 22)}</div><div><strong>你的积累，随时可用</strong><p>在 Agent 与工作流中组合这些资产，保留自己的知识和工作方式。</p></div><span class="eco-library-count"><strong>${S.state.ecoAssets.length}</strong> 项资产</span></div><section class="eco-library">${filterButtons([{ id: 'all', label: '全部', count: S.state.ecoAssets.length }, ...list.map(type => ({ id: type, label: meta(type).label, count: S.state.ecoAssets.filter(a => a.type === type).length }))], ui.assetType, 'eco-assets-tab')}<div class="eco-toolbar">${S.search('eco-asset-search', '搜索资产名称、说明或标签', ui.assetQuery)}<label class="eco-sort-label">排序<select class="select" id="eco-asset-sort" aria-label="资产排序"><option value="updated" ${ui.assetSort === 'updated' ? 'selected' : ''}>最近更新</option><option value="name" ${ui.assetSort === 'name' ? 'selected' : ''}>名称顺序</option></select></label></div><div id="eco-asset-results">${assetResults()}</div></section></div>`;
    },
    mount(container) {
      searchMount(container, 'eco-asset-search', q => { ui.assetQuery = q; ui.assetLimit = 9; container.querySelector('#eco-asset-results').innerHTML = assetResults(); });
      container.querySelector('#eco-asset-sort').addEventListener('change', event => { ui.assetSort = event.target.value; container.querySelector('#eco-asset-results').innerHTML = assetResults(); });
    }
  });
  S.action('eco-assets-tab', el => { ui.assetType = el.dataset.id; ui.assetLimit = 9; S.render(); });
  S.action('eco-assets-more', () => { ui.assetLimit += 9; S.render(); });
  S.action('eco-assets-clear', () => { ui.assetQuery = ''; S.render(); document.querySelector('#eco-asset-search')?.focus(); });
  S.action('eco-asset-create', () => assetForm());
  S.action('eco-asset-edit', el => assetForm(getAsset(el.dataset.id)));
  function assetForm(asset) {
    let currentType = asset?.type || (ui.assetType !== 'all' && ui.assetType !== 'file' ? ui.assetType : 'knowledge');
    if (currentType === 'file') currentType = 'knowledge';
    const existing = Boolean(asset);
    const details = type => `${type === 'mcp' ? field('服务地址', 'eco-endpoint', asset?.endpoint || '', '仅保存地址，不建立连接。请勿在地址中加入密钥。', true) : ''}${field(type === 'knowledge' ? '知识内容' : type === 'prompt' ? '提示词内容' : type === 'memory' ? '记忆内容' : type === 'mcp' ? '工具与权限说明' : '使用说明', 'eco-content', asset?.content || '', type === 'prompt' ? '用 {{变量名}} 标记需要填写的内容。' : type === 'knowledge' ? '可以直接录入资料，也可以保存后导入文件。' : '明确适用范围、输入与输出。请勿填写真实密钥。', true, true)}`;
    S.modal({ title: existing ? '编辑资产' : '创建资产', subtitle: '保存到个人空间，随时可以继续编辑。', wide: true, body: `<form id="eco-asset-form" novalidate><div class="grid-2">${field('资产名称', 'eco-name', asset?.name || '', '使用易于识别的名称，最多 60 个字符。', true)}<div class="field"><label class="field-label" for="eco-kind">资产类型</label><select class="select" name="eco-kind" id="eco-kind" ${existing ? 'disabled' : ''}>${['knowledge', 'skill', 'mcp', 'prompt', 'memory', 'workflow'].map(type => `<option value="${type}" ${type === currentType ? 'selected' : ''}>${meta(type).label}</option>`).join('')}</select><p class="field-help">文件请使用“导入文件”。</p></div></div>${field('简短说明', 'eco-description', asset?.description || '', '说明这项资产能帮助你完成什么，最多 180 个字符。', true)}<div id="eco-type-fields">${details(currentType)}</div>${field('标签', 'eco-tags', (asset?.tags || []).join('，'), '用逗号分隔，最多 4 个标签。')}</form>`, footer: `${S.btn('取消', 'eco-close', { variant: 'secondary' })}${S.btn(existing ? '保存修改' : '创建资产', 'eco-asset-save', { attrs: existing ? attr(asset.id) : '' })}`, onOpen(dialog) { dialog.querySelector('#eco-kind').addEventListener('change', event => { const draft = dialog.querySelector('#eco-content')?.value || ''; currentType = event.target.value; dialog.querySelector('#eco-type-fields').innerHTML = details(currentType); dialog.querySelector('#eco-content').value = draft; }); } });
  }
  S.action('eco-close', () => S.closeModal());
  S.action('eco-asset-save', el => {
    const form = document.querySelector('#eco-asset-form');
    if (!form || el.disabled) return;
    const type = form.querySelector('#eco-kind').value;
    const rules = {
      'eco-name': value => !value.trim() ? '请输入资产名称。' : value.trim().length > 60 ? '资产名称不能超过 60 个字符。' : secretError(value),
      'eco-description': value => !value.trim() ? '请简要说明资产用途。' : value.length > 180 ? '说明不能超过 180 个字符。' : secretError(value),
      'eco-content': value => !value.trim() ? '请填写具体内容。' : value.length > 50000 ? '内容不能超过 50,000 个字符。' : secretError(value),
      'eco-tags': value => value.length > 120 ? '标签内容不能超过 120 个字符。' : secretError(value)
    };
    if (type === 'mcp') rules['eco-endpoint'] = value => { try { const u = new URL(value); return !['https:', 'http:'].includes(u.protocol) ? '请输入以 https:// 或 http:// 开头的地址。' : u.username || u.password || u.search || u.hash ? '请使用不包含账号、密钥、查询参数或片段的服务地址。' : null; } catch (_) { return '请输入完整、有效的服务地址，例如 https://example.com/mcp。'; } };
    if (!S.validate(form, rules)) return;
    const original = getAsset(el.dataset.id);
    const a = { ...(original || {}), id: original?.id || S.uid('asset'), type, name: form.querySelector('#eco-name').value.trim(), description: form.querySelector('#eco-description').value.trim(), content: form.querySelector('#eco-content').value.trim(), tags: form.querySelector('#eco-tags').value.split(/[,，]/).map(s => s.trim()).filter(Boolean).slice(0, 4), version: original ? bumpVersion(original.version) : '1.0.0', updated: stamp(), source: original?.source || 'personal' };
    if (type === 'mcp') a.endpoint = form.querySelector('#eco-endpoint').value.trim();
    if (type === 'knowledge' && !original) a.documents = 1;
    if (original) Object.assign(original, a); else S.state.ecoAssets.unshift(a);
    S.save(); S.closeModal(); ui.assetType = type; ui.assetQuery = ''; S.go('assets'); S.render(); S.toast(original ? '资产修改已保存' : '资产已创建');
  });
  function bumpVersion(value) { const parts = String(value || '1.0.0').split('.').map(Number); return `${parts[0] || 1}.${parts[1] || 0}.${(parts[2] || 0) + 1}`; }
  function showAsset(id) {
    const a = getAsset(id); if (!a) return S.toast('这项资产已不存在，请刷新列表。', 'warning');
    const children = S.state.ecoAssets.filter(f => f.parentId === a.id);
    const latestReview = [...S.state.reviews].reverse().find(r => r.assetId === a.id && r.version === a.version);
    S.drawer({ title: a.name, subtitle: `${meta(a.type).label} · v${a.version || '1.0.0'} · ${fmtDate(a.updated)} 更新`, body: `<div class="eco-detail-top">${iconTile(a.type, null, true)}<p>${E(a.description)}</p></div>${a.endpoint ? `<div class="eco-detail-section"><h3>服务地址</h3><code class="eco-code-line">${E(a.endpoint)}</code><p class="field-help">仅保存连接信息，本演示不请求该服务。</p></div>` : ''}<div class="eco-detail-section"><h3>${a.type === 'file' ? '文件信息' : '内容预览'}</h3>${a.type === 'file' ? `<dl class="eco-definition"><div><dt>文件名</dt><dd>${E(a.name)}</dd></div><div><dt>文件大小</dt><dd>${sizeText(a.size || 0)}</dd></div><div><dt>状态</dt><dd>模拟解析完成</dd></div></dl><p class="notice">原型仅保留本地文件元数据，不保存或上传文件内容。</p>` : `<pre class="eco-content-preview">${E(a.content || '暂无内容')}</pre>`}</div>${a.type === 'knowledge' ? `<div class="eco-detail-section"><div class="row between"><h3>导入的资料</h3>${S.btn('导入文件', 'eco-upload', { icon: 'upload', variant: 'secondary', small: true, attrs: attr(a.id) })}</div>${children.length ? `<ul class="eco-file-list">${children.map(f => `<li>${S.icon('file', 16)}<span>${E(f.name)}</span><span class="muted">${sizeText(f.size || 0)}</span></li>`).join('')}</ul>` : `<p class="muted small">暂无新导入的文件。可以导入 PDF、文档或文本资料。</p>`}</div>` : ''}${latestReview ? `<div class="eco-detail-section"><div class="row between"><h3>公共发布</h3>${reviewBadge(latestReview.status)}</div>${latestReview.reason ? `<p class="eco-review-reason">${E(latestReview.reason)}</p>` : '<p class="muted small">审核状态保留在“发布与审核”中。</p>'}</div>` : ''}<div class="eco-detail-section eco-detail-danger">${S.btn('删除资产', 'eco-asset-delete', { variant: 'ghost', icon: 'trash', attrs: attr(a.id) })}</div>`, footer: `${a.type !== 'file' ? S.btn('编辑资产', 'eco-asset-edit', { variant: 'secondary', icon: 'edit', attrs: attr(a.id) }) : ''}${['skill', 'mcp', 'prompt', 'workflow'].includes(a.type) ? S.btn(latestReview?.status === 'pending' ? '审核中' : latestReview?.status === 'approved' ? '当前版本已公开' : '提交公开审核', 'eco-publish', { icon: 'globe', attrs: `${attr(a.id)} ${['pending', 'approved'].includes(latestReview?.status) ? 'disabled' : ''}` }) : ''}` });
  }
  S.action('eco-asset-detail', el => showAsset(el.dataset.id));
  S.action('eco-asset-delete', el => {
    const a = getAsset(el.dataset.id); if (!a) return;
    S.modal({ title: `删除“${a.name}”？`, subtitle: '这会移除个人空间中的资产。已提交的审核快照会保留。', body: `<p>删除后，当前个人资产内容无法恢复。${a.type === 'knowledge' ? '已导入的文件会保留在文件分类中。' : ''}</p>`, footer: `${S.btn('保留资产', 'eco-close', { variant: 'secondary' })}${S.btn('删除资产', 'eco-asset-delete-confirm', { variant: 'danger', attrs: attr(a.id) })}` });
  });
  S.action('eco-asset-delete-confirm', el => { const a = getAsset(el.dataset.id); if (!a) return; S.state.ecoAssets = S.state.ecoAssets.filter(x => x.id !== a.id); S.state.ecoAssets.forEach(x => { if (x.parentId === a.id) delete x.parentId; }); if (a.marketId) S.state.installed = S.state.installed.filter(id => id !== a.marketId); S.save(); S.closeModal(); S.render(); S.toast('资产已删除'); });

  let uploadSession = null;
  function renderUploads() {
    const list = document.querySelector('#eco-upload-list'); if (!list || !uploadSession) return;
    list.innerHTML = uploadSession.files.map(f => `<div class="eco-upload-item"><div class="eco-upload-item-top">${S.icon('file', 20)}<div><strong>${E(f.name)}</strong><span>${sizeText(f.size)} · ${f.status === 'ready' ? '模拟解析完成' : f.status === 'processing' ? `本地模拟解析 ${f.progress}%` : f.status === 'cancelled' ? '已取消解析' : E(f.error)}</span></div>${f.status === 'processing' ? S.btn('取消', 'eco-upload-cancel', { variant: 'ghost', small: true, attrs: attr(f.id) }) : f.status === 'cancelled' ? S.btn('重试', 'eco-upload-retry', { variant: 'secondary', small: true, attrs: attr(f.id) }) : f.status === 'error' ? S.btn('移除', 'eco-upload-remove', { variant: 'ghost', small: true, attrs: attr(f.id) }) : S.icon('check', 18)}</div>${f.status === 'processing' ? `<div class="progress-track" role="progressbar" aria-label="${E(f.name)} 模拟解析" aria-valuenow="${f.progress}" aria-valuemin="0" aria-valuemax="100"><div class="progress-fill" style="width:${f.progress}%"></div></div>` : ''}</div>`).join('');
    const save = document.querySelector('[data-action="eco-upload-save"]');
    const ready = uploadSession.files.filter(f => f.status === 'ready').length;
    if (save) { save.disabled = !ready || uploadSession.files.some(f => f.status === 'processing'); save.textContent = ready ? `保存 ${ready} 个文件` : '保存至资产库'; }
  }
  function startParse(f) {
    if (!uploadSession) return; const session = uploadSession;
    f.status = 'processing'; f.progress = 0;
    const timer = window.setInterval(() => { if (uploadSession !== session) return window.clearInterval(timer); f.progress = Math.min(100, f.progress + 25); if (f.progress === 100) { f.status = 'ready'; window.clearInterval(timer); session.timers.delete(f.id); } renderUploads(); }, 180);
    session.timers.set(f.id, timer); renderUploads();
  }
  function addFiles(files) {
    if (!uploadSession) return;
    const remaining = Math.max(0, 10 - uploadSession.files.length);
    [...files].slice(0, Math.max(0, 10 - uploadSession.files.length)).forEach(file => {
      if (uploadSession.files.some(f => f.name === file.name && f.size === file.size)) { S.toast(`“${file.name}”已在本次导入列表中`, 'info'); return; }
      const extension = file.name.split('.').pop().toLowerCase();
      const error = !['pdf', 'md', 'txt', 'docx', 'csv', 'json'].includes(extension) ? '格式不支持，请选择 PDF、MD、TXT、DOCX、CSV 或 JSON。' : file.size > 20 * 1024 * 1024 ? '文件超过 20 MB，请压缩后重试。' : !file.size ? '文件为空，请选择有内容的文件。' : '';
      const f = { id: S.uid('upload'), name: file.name, size: file.size, mime: file.type || 'application/octet-stream', lastModified: file.lastModified, status: error ? 'error' : 'processing', error, progress: 0 };
      uploadSession.files.push(f); if (!error) startParse(f);
    });
    if (files.length > remaining) S.toast('每次最多导入 10 个文件，请分批导入。', 'info');
    renderUploads();
  }
  S.action('eco-upload', el => {
    S.closeModal();
    uploadSession = { target: el.dataset.id || null, files: [], timers: new Map() };
    S.modal({ title: '导入文件', subtitle: uploadSession.target ? `添加到「${getAsset(uploadSession.target)?.name || '知识库'}」` : '把资料加入个人资产库。', body: `<div class="eco-dropzone" id="eco-dropzone"><span class="eco-upload-icon">${S.icon('upload', 30)}</span><strong>把文件拖到这里</strong><span>或通过文件选择器添加</span><label class="btn btn-secondary eco-file-picker" for="eco-file-input">选择本地文件<input id="eco-file-input" type="file" multiple accept=".pdf,.md,.txt,.docx,.csv,.json" aria-label="选择要导入的本地文件"></label><small>PDF、MD、TXT、DOCX、CSV、JSON · 单个不超过 20 MB · 每次最多 10 个</small></div><p class="notice small">演示仅读取名称、大小和格式，并模拟解析过程；文件内容不会上传或持久化。</p><div id="eco-upload-list" class="eco-upload-list" aria-live="polite"></div>`, footer: `${S.btn('取消', 'eco-close', { variant: 'secondary' })}${S.btn('保存至资产库', 'eco-upload-save', { attrs: 'disabled' })}`, onOpen(dialog) {
      dialog.querySelector('#eco-file-input').addEventListener('change', event => { addFiles(event.target.files); event.target.value = ''; });
      const drop = dialog.querySelector('#eco-dropzone');
      drop.addEventListener('dragover', event => { event.preventDefault(); drop.classList.add('is-dragging'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('is-dragging'));
      drop.addEventListener('drop', event => { event.preventDefault(); drop.classList.remove('is-dragging'); addFiles(event.dataTransfer.files); });
    }, onClose() { if (uploadSession) uploadSession.timers.forEach(timer => window.clearInterval(timer)); uploadSession = null; } });
  });
  S.action('eco-upload-cancel', el => { const f = uploadSession?.files.find(f => f.id === el.dataset.id); if (!f) return; window.clearInterval(uploadSession.timers.get(f.id)); uploadSession.timers.delete(f.id); f.status = 'cancelled'; renderUploads(); });
  S.action('eco-upload-retry', el => { const f = uploadSession?.files.find(f => f.id === el.dataset.id); if (f?.status === 'cancelled') startParse(f); });
  S.action('eco-upload-remove', el => { if (!uploadSession) return; uploadSession.files = uploadSession.files.filter(f => f.id !== el.dataset.id); renderUploads(); });
  S.action('eco-upload-save', () => {
    if (!uploadSession || uploadSession.files.some(f => f.status === 'processing')) return;
    const ready = uploadSession.files.filter(f => f.status === 'ready'); if (!ready.length) return;
    const parent = getAsset(uploadSession.target); const parentId = parent?.id;
    ready.forEach(f => S.state.ecoAssets.unshift({ id: S.uid('asset'), type: 'file', name: f.name, description: parent ? `已导入「${parent.name}」，本地模拟解析完成。` : '本地文件元数据，模拟解析完成。', size: f.size, mime: f.mime, lastModified: f.lastModified, parentId, status: 'ready', version: '1.0.0', source: 'upload', updated: stamp(), tags: [f.name.split('.').pop().toUpperCase()], content: '只保留文件元数据，不包含原始文件内容。' }));
    if (parent) { parent.documents = (parent.documents || 0) + ready.length; parent.updated = stamp(); }
    S.save(); S.closeModal(); ui.assetType = 'file'; ui.assetQuery = ''; S.go('assets'); S.render(); S.toast(`${ready.length} 个文件已加入资产库`);
  });

  function marketCard(a) {
    return `<article class="eco-market-card"><div class="row between">${iconTile(a.type, a.icon)}<span class="eco-type-label">${E(meta(a.type).label)}</span></div><button type="button" class="eco-card-title" data-action="eco-market-detail" ${attr(a.id)}>${E(a.name)}</button><p class="eco-card-description">${E(a.description)}</p><div class="eco-card-tags">${(a.tags || []).slice(0, 2).map(t => `<span class="tag">${E(t)}</span>`).join('')}</div><div class="eco-market-author"><span>${E(a.author)}</span><span>${S.icon('star', 13)} ${E(a.rating || '新上架')}</span></div><div class="eco-market-bottom"><span class="muted small">${a.installs === '新' ? '社区新作' : `${E(a.installs)} 次安装`}</span>${S.btn(installed(a.id) ? '已安装' : '安装', 'eco-install', { icon: installed(a.id) ? 'check' : 'plus', variant: installed(a.id) ? 'ghost' : 'secondary', small: true, attrs: `${attr(a.id)} ${installed(a.id) ? 'disabled' : ''}` })}</div></article>`;
  }
  function marketResults() {
    const q = ui.marketQuery.trim().toLowerCase(); const resources = allResources().filter(a => (ui.marketType === 'all' || a.type.toLowerCase() === ui.marketType) && (!q || `${a.name} ${a.description} ${a.author} ${(a.tags || []).join(' ')}`.toLowerCase().includes(q)));
    return `<div class="eco-result-heading"><p class="small muted" role="status">${ui.marketQuery ? `找到 ${resources.length} 个资源` : `探索 ${resources.length} 个经过审核的资源`}</p><span class="small muted">安装与评分为演示数据</span></div>${resources.length ? `<div class="eco-market-grid">${resources.slice(0, ui.marketLimit).map(marketCard).join('')}</div>${resources.length > ui.marketLimit ? `<div class="eco-load-more">${S.btn(`继续探索（还有 ${resources.length - ui.marketLimit} 个）`, 'eco-market-more', { variant: 'secondary', icon: 'arrow' })}</div>` : ''}` : S.empty('暂时没有匹配的资源', '试试其它分类或关键词，也可以提交你的作品。', S.btn('清除搜索与筛选', 'eco-market-clear', { variant: 'secondary' }))}`;
  }
  S.page('market', {
    title: '社区市场', section: '生态',
    render() { return `<div class="eco-page">${S.header('COMMUNITY · 能力收藏馆', '社区市场', '发现好用的 Agent、工作流与工具，让下一次工作有一个更好的起点。', S.btn('我的提交', 'eco-open-reviews', { icon: 'clock', variant: 'ghost' }) + S.btn('分享我的作品', 'eco-publish-choose', { icon: 'upload', variant: 'secondary' }))}<section class="eco-market-hero"><div class="eco-hero-copy"><span class="eco-curated-label">${S.icon('spark', 15)} 本期精选 · 研究与表达</span><h2>好能力，<br>值得放进你的工作室。</h2><p>从寻找依据到打磨表达，把成熟的方法带回你的日常工作。</p>${S.btn('认识深度研究员', 'eco-market-detail', { icon: 'arrow', attrs: 'data-id="market-researcher"' })}</div><div class="eco-collection" aria-label="精选能力组合"><div class="eco-collection-label"><span>精选能力组合</span><span>研究 → 创作 → 核验</span></div>${[['market-researcher', 'search', '研究', '先找到值得相信的依据'], ['market-editor', 'edit', '表达', '让每一句话准确抵达'], ['market-factcheck', 'check', '核验', '把可靠留在交付之前']].map(([id, icon, name, description], i) => `<button type="button" class="eco-collection-item eco-collection-${i}" data-action="eco-market-detail" ${attr(id)}><span class="eco-collection-symbol">${S.icon(icon, 22)}</span><span><strong>${name}</strong><small>${description}</small></span>${S.icon('arrow', 17)}</button>`).join('')}</div></section><section class="eco-market-catalog"><div class="eco-section-heading"><h2>找到你的下一项能力</h2><span class="small muted">开放组合 · 安装后可编辑</span></div><div class="eco-market-controls">${filterButtons([{ id: 'all', label: '全部' }, ...['agent', 'workflow', 'skill', 'mcp', 'prompt'].map(id => ({ id, label: meta(id).label }))], ui.marketType, 'eco-market-tab')}${S.search('eco-market-search', '搜索能力、作者或用途', ui.marketQuery)}</div><div id="eco-market-results">${marketResults()}</div></section><div class="eco-publish-banner"><div>${S.icon('globe', 25)}<div><strong>把你的好方法，分享给更多人。</strong><p>作品通过审核后，会出现在这里。你始终保留个人空间中的版本。</p></div></div>${S.btn('提交作品', 'eco-publish-choose', { variant: 'secondary', icon: 'arrow' })}</div></div>`; },
    mount(container) { searchMount(container, 'eco-market-search', q => { ui.marketQuery = q; ui.marketLimit = 9; container.querySelector('#eco-market-results').innerHTML = marketResults(); }); }
  });
  S.action('eco-open-reviews', () => S.go('review'));
  S.action('eco-market-tab', el => { ui.marketType = el.dataset.id; ui.marketLimit = 9; S.render(); });
  S.action('eco-market-more', () => { ui.marketLimit += 9; S.render(); });
  S.action('eco-market-clear', () => { ui.marketQuery = ''; ui.marketType = 'all'; S.render(); document.querySelector('#eco-market-search')?.focus(); });
  S.action('eco-market-detail', el => {
    const a = getResource(el.dataset.id); if (!a) return S.toast('这项资源尚未公开或已不可用。', 'warning');
    S.drawer({ title: a.name, subtitle: `${meta(a.type).label} · ${a.author} · v${a.version || '1.0.0'}`, body: `<div class="eco-detail-top">${iconTile(a.type, a.icon, true)}<p>${E(a.details || a.description)}</p></div><div class="eco-card-tags">${(a.tags || []).map(t => `<span class="tag">${E(t)}</span>`).join('')}${S.badge('审核通过', 'success')}</div><div class="eco-detail-section"><h3>它能帮助你</h3><ul class="eco-feature-list">${(a.features || []).map(f => `<li>${S.icon('check', 17)}<span>${E(f)}</span></li>`).join('')}</ul></div><div class="eco-detail-section"><h3>${a.type === 'mcp' ? '连接与工具' : a.type === 'workflow' ? '工作流概览' : '方法预览'}</h3>${a.endpoint ? `<code class="eco-code-line">${E(a.endpoint)}</code>` : ''}<pre class="eco-content-preview">${E(a.content || a.description)}</pre></div><div class="eco-detail-section"><h3>使用范围</h3><p class="muted">${E(a.permissions || '使用你授权的模型与资料。')}</p><p class="notice small">安装会在你的个人空间创建一份可编辑副本。原型不会连接外部服务或运行真实模型。</p></div>`, footer: `${S.btn('关闭', 'eco-close', { variant: 'secondary' })}${S.btn(installed(a.id) ? '已安装到工作室' : '安装到我的工作室', 'eco-install', { icon: installed(a.id) ? 'check' : 'plus', attrs: `${attr(a.id)} ${installed(a.id) ? 'disabled' : ''}` })}` });
  });
  S.action('eco-install', el => {
    const a = getResource(el.dataset.id); if (!a || el.disabled || installed(a.id)) return;
    el.disabled = true; el.setAttribute('aria-busy', 'true'); el.textContent = '安装中…';
    window.setTimeout(() => {
      if (installed(a.id)) return;
      const resource = getResource(a.id); if (!resource) { S.toast('资源已不可用，请重新选择。', 'warning'); S.render(); return; }
      if (!S.state.installed.includes(a.id)) S.state.installed.push(a.id);
      if (a.type.toLowerCase() === 'agent') {
        if (!Array.isArray(S.state.agents)) S.state.agents = [];
        const agent = { id: S.uid('agent'), name: a.name, description: a.description, icon: a.icon || 'agent', color: 'mint', model: S.state.models?.find(model => model.status === 'connected')?.name || 'DeepSeek Chat', version: a.version || '1.0.0', status: 'published', tags: a.tags || [], prompt: a.content || a.description, knowledge: '', tools: [], runs: 0, updated: today(), marketId: a.id, favorite: false, temperature: 0.7, requireApproval: true };
        agent.publishedConfig = JSON.parse(JSON.stringify(agent));
        agent.publishedPrompt = agent.prompt;
        S.state.agents.unshift(agent);
      } else {
        if (a.type.toLowerCase() === 'workflow' && typeof S.installWorkflow === 'function') S.installWorkflow(a);
        S.state.ecoAssets.unshift({ id: S.uid('asset'), type: a.type.toLowerCase(), name: a.name, description: a.description, content: a.content || a.description, endpoint: a.endpoint, version: a.version || '1.0.0', tags: a.tags || [], updated: stamp(), source: 'market', marketId: a.id });
      }
      S.save(); S.closeModal(); S.render(); S.toast(`“${a.name}”已安装，可在${a.type.toLowerCase() === 'agent' ? ' Agent 列表' : a.type.toLowerCase() === 'workflow' ? '工作流与资产库' : '资产库'}中查看`);
    }, 420);
  });

  function publishForm(asset) {
    if (!asset) return;
    if (S.state.reviews.some(r => r.assetId === asset.id && r.version === asset.version && ['pending', 'approved'].includes(r.status))) return S.toast('当前版本已经提交，无需重复提交。', 'info');
    S.modal({ title: '提交公开审核', subtitle: `公开作品：${asset.name}`, body: `<form id="eco-publish-form" novalidate><div class="notice"><strong>通过审核后，所有社区用户都能发现并安装这份作品。</strong><p>提交的是当前版本快照；个人空间中的后续修改不会自动公开。</p></div>${field('公开说明', 'eco-public-description', asset.description, '说清楚用途、适用范围与使用方式，至少 12 个字符。', true, true)}<label class="eco-check-field"><input type="checkbox" id="eco-publish-consent" name="eco-publish-consent"><span>我已检查内容，确认不含私人资料、密钥或未经授权的内容。</span></label><p id="eco-publish-consent-error" class="field-error"></p></form>`, footer: `${S.btn('取消', 'eco-close', { variant: 'secondary' })}${S.btn('提交审核', 'eco-publish-confirm', { icon: 'send', attrs: attr(asset.id) })}` });
  }
  S.action('eco-publish', el => publishForm(getAsset(el.dataset.id)));
  S.action('eco-publish-choose', () => {
    const assets = S.state.ecoAssets.filter(a => ['skill', 'mcp', 'prompt', 'workflow'].includes(a.type));
    if (!assets.length) return S.modal({ title: '先创建一份作品', body: S.empty('暂时没有可提交的作品', 'Skill、MCP、提示词和工作流可以提交到公共市场。', S.btn('创建资产', 'eco-asset-create', { icon: 'plus' })), footer: S.btn('关闭', 'eco-close', { variant: 'secondary' }) });
    S.modal({ title: '选择要分享的作品', subtitle: '个人知识库、记忆与文件不参与公共发布。', body: `<div class="field"><label class="field-label" for="eco-publish-asset">选择资产</label><select class="select" id="eco-publish-asset">${assets.map(a => `<option value="${E(a.id)}">${E(a.name)} · ${meta(a.type).label} · v${E(a.version || '1.0.0')}</option>`).join('')}</select></div><p class="notice small">提交后进入管理员审核，审核通过前不会出现在社区市场。</p>`, footer: `${S.btn('取消', 'eco-close', { variant: 'secondary' })}${S.btn('继续', 'eco-publish-next', { icon: 'arrow' })}` });
  });
  S.action('eco-publish-next', () => publishForm(getAsset(document.querySelector('#eco-publish-asset')?.value)));
  S.action('eco-publish-confirm', el => {
    const a = getAsset(el.dataset.id); const form = document.querySelector('#eco-publish-form'); if (!a || !form || el.disabled) return;
    const valid = S.validate(form, { 'eco-public-description': value => value.trim().length < 12 ? '请补充至少 12 个字符的用途与使用说明。' : secretError(value) });
    const consent = form.querySelector('#eco-publish-consent');
    const error = form.querySelector('#eco-publish-consent-error');
    error.textContent = consent.checked ? '' : '请先检查作品内容并勾选确认。'; consent.setAttribute('aria-invalid', String(!consent.checked)); consent.setAttribute('aria-describedby', 'eco-publish-consent-error');
    if (!valid || !consent.checked) { if (valid) consent.focus(); return; }
    if (secretError(a.content) || secretError(a.endpoint)) return S.toast('作品中疑似包含密钥，请先编辑移除后再提交。', 'error');
    if (S.state.reviews.some(r => r.assetId === a.id && r.version === a.version && ['pending', 'approved'].includes(r.status))) return S.toast('当前版本已经提交。', 'info');
    el.disabled = true;
    S.state.reviews.unshift({ id: S.uid('review'), assetId: a.id, name: a.name, type: a.type, author: '我', status: 'pending', description: form.querySelector('#eco-public-description').value.trim(), content: a.content, endpoint: a.endpoint, tags: a.tags, version: a.version || '1.0.0', reason: '', created: stamp() });
    S.save(); S.closeModal(); ui.reviewStatus = 'pending'; S.go('review'); S.render(); S.toast('作品已提交，等待管理员审核');
  });
  function reviewResults() {
    const q = ui.reviewQuery.trim().toLowerCase();
    const reviews = visibleReviews().filter(r => (ui.reviewStatus === 'all' || r.status === ui.reviewStatus) && (!q || `${r.name} ${r.description} ${r.author}`.toLowerCase().includes(q)));
    return `<p class="small muted" role="status">共 ${reviews.length} 份提交</p>${reviews.length ? `<div class="eco-reviews">${reviews.map(r => `<article class="eco-review-row">${iconTile(r.type)}<div class="eco-review-main"><button type="button" class="eco-review-title" data-action="eco-review-detail" ${attr(r.id)}>${E(r.name)}</button><p>${E(r.description)}</p><div class="eco-review-meta"><span>${E(r.author)} 提交</span><span>${meta(r.type).label}</span><span>v${E(r.version || '1.0.0')}</span><span>${fmtDate(r.created)}</span></div>${r.status === 'rejected' ? `<p class="eco-review-reason">退回原因：${E(r.reason || '请补充作品说明后重新提交。')}</p>` : ''}</div><div class="eco-review-actions">${reviewBadge(r.status)}${S.btn(S.state.role === 'admin' && r.status === 'pending' ? '开始审核' : '查看详情', 'eco-review-detail', { variant: 'secondary', small: true, attrs: attr(r.id) })}</div></article>`).join('')}</div>` : S.empty('还没有这类提交', ui.reviewQuery ? '尝试其它关键词，或清除搜索。' : '提交作品后，可以在这里查看每个版本的审核状态。', S.btn('提交作品', 'eco-publish-choose', { icon: 'plus' }))}`;
  }
  S.page('review', {
    title: '发布与审核', section: '生态',
    render() { const admin = S.state.role === 'admin'; return `<div class="eco-page">${S.header('公共资源管理', '发布与审核', '让每一份公开的能力，都有清晰的用途、边界与来处。', S.btn('提交作品', 'eco-publish-choose', { icon: 'plus' }))}<div class="eco-role-banner">${S.icon('shield', 22)}<div><strong>${admin ? '演示管理员 · 可以审核公共作品' : '普通成员 · 查看自己的提交'}</strong><p>${admin ? '仅处理待审核作品。审核通过后，会立即出现在演示市场。' : '公开作品由管理员审核。使用顶部的演示角色切换，可以体验管理员审核流程。'}</p></div>${S.badge('本地演示', 'info')}</div><div class="eco-review-layout"><section>${filterButtons([{ id: 'all', label: '全部' }, { id: 'pending', label: '待审核', count: visibleReviews().filter(r => r.status === 'pending').length }, { id: 'approved', label: '已通过' }, { id: 'rejected', label: '已退回' }], ui.reviewStatus, 'eco-review-tab')}<div class="eco-review-search">${S.search('eco-review-search', '搜索作品或作者', ui.reviewQuery)}</div><div id="eco-review-results">${reviewResults()}</div></section><aside class="eco-review-guide"><span class="eco-guide-icon">${S.icon('globe', 25)}</span><h3>公开前，再检查一遍</h3><ol><li><strong>能解决什么问题</strong><p>用途明确，输入与输出有说明。</p></li><li><strong>是否容易开始使用</strong><p>给出示例，注明所需工具与权限。</p></li><li><strong>是否适合公开</strong><p>移除私人资料、密钥和未授权内容。</p></li></ol><div class="eco-guide-footer">审核通过只是起点。<br>好的作品，会在使用中继续生长。</div></aside></div></div>`; },
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
    r.status = 'approved'; r.reason = ''; r.reviewedAt = stamp(); S.save(); S.closeModal(); S.render(); S.toast(`“${r.name}”已通过审核，并在市场公开`);
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
  S.action('eco-review-market', el => { S.closeModal(); ui.marketType = 'all'; ui.marketQuery = S.state.reviews.find(r => r.id === el.dataset.id)?.name || ''; S.go('market'); S.render(); });
})();
