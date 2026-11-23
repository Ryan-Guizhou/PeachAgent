(function () {
  'use strict';
  const paths = {
    home:'M3 10 12 3l9 7M5 9v11h5v-6h4v6h5V9',
    spark:'m12 3 2.8 6.2L21 12l-6.2 2.8L12 21l-2.8-6.2L3 12l6.2-2.8L12 3ZM20 3v4M18 5h4',
    agent:'M9 3h6M12 3v4M4 11a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v6a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-6ZM8 12v2M16 12v2M9 17h6M1 12v4M23 12v4',
    workflow:'M3 4h6v6H3V4ZM15 14h6v6h-6v-6ZM6 10v7h9M9 7h9v7',
    box:'m12 3 9 5v9l-9 5-9-5V8l9-5ZM3 8l9 5 9-5M12 13v9M7 5.8l9 5',
    grid:'M3 3h7v7H3V3ZM14 3h7v7h-7V3ZM3 14h7v7H3v-7ZM14 14h7v7h-7v-7Z',
    play:'m8 4 12 8-12 8V4Z',pause:'M8 5v14M16 5v14',arrow:'M5 12h14m-6-6 6 6-6 6',
    chevron:'m9 5 7 7-7 7',plus:'M12 5v14M5 12h14',search:'M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15ZM16 16l5 5',
    close:'m6 6 12 12M18 6 6 18',check:'m5 12 4 4 10-10',clock:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 7v5l4 2',
    file:'M5 3h9l5 5v13H5V3ZM14 3v6h5M8 13h8M8 17h6',code:'m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16',
    chart:'M4 3v17h17M8 16v-4M13 16V8M18 16V5',
    settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1 1-3Z',
    shield:'m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Zm-4 9 3 3 5-6',
    bell:'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M9 21h6',more:'M5 12h.01M12 12h.01M19 12h.01',
    download:'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',upload:'M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5',
    copy:'M9 8h11v13H9V8ZM15 8V3H4v13h5',edit:'m15 4 5 5M4 20l4-1L21 6a2 2 0 0 0-4-4L4 15v5ZM3 21h18',
    trash:'M3 6h18M8 6V3h8v3M6 6l1 15h10l1-15M10 10v7M14 10v7',
    globe:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM3 12h18M12 3c-5 4-5 14 0 18M12 3c5 4 5 14 0 18',
    book:'M3 4h5a4 4 0 0 1 4 3 4 4 0 0 1 4-3h5v16h-5a4 4 0 0 0-4 1 4 4 0 0 0-4-1H3V4ZM12 7v14',
    plug:'M8 3v5M16 3v5M5 8h14v5a7 7 0 0 1-14 0V8ZM12 20v3',terminal:'M3 5h18v15H3V5Zm4 4 3 3-3 3M13 16h5',
    wallet:'M20 7H5a2 2 0 0 1 0-4h14v4M3 5v14a2 2 0 0 0 2 2h16V7M21 11h-6v6h6M17 14h.01',
    filter:'M3 5h18l-7 8v6l-4 2v-8L3 5Z',link:'m9 15 6-6M7 13l-3 3a3 3 0 0 0 4 4l4-4M12 8l4-4a3 3 0 0 1 4 4l-3 3',
    refresh:'M20 7a8 8 0 0 0-14-2L3 8M3 3v5h5M4 17a8 8 0 0 0 14 2l3-3M21 21v-5h-5',
    users:'M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM2 21v-3a7 7 0 0 1 14 0v3M16 4a4 4 0 0 1 0 7M19 14a7 7 0 0 1 3 7',
    send:'m3 3 19 9-19 9 4-9-4-9ZM7 12h15',help:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM9 9a3 3 0 0 1 6 0c0 2-3 2-3 5M12 17h.01',
    eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',stop:'M6 6h12v12H6V6Z',
    bolt:'m13 2-9 12h7l-1 8 10-13h-7l1-7Z',folder:'M3 6V4h7l2 3h9v14H3V6Z',layers:'m12 3 10 6-10 6L2 9l10-6ZM2 14l10 6 10-6',
    star:'m12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-6Z',menu:'M4 6h16M4 12h16M4 18h16',logout:'M10 3H4v18h6M9 12h12m-5-5 5 5-5 5'
  };
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const S = window.Studio = { pages:{}, actions:{}, forms:{}, params:{}, route:'home', session:{}, state:{}, cleanup:null, dirty:false, discard:null, modalCleanup:null, timers:new Map() };
  S.escape=esc;
  S.icon=(name,size=18)=>`<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.spark}"/></svg>`;
  S.uid=(prefix='item')=>prefix+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,6);
  S.badge=(label,tone='neutral')=>`<span class="badge ${esc(tone)}">${esc(label)}</span>`;
  S.btn=(label,action,opts={})=>`<button type="button" class="btn btn-${opts.variant||'primary'}${opts.small?' btn-sm':''}" data-action="${esc(action)}" ${opts.attrs||''}>${opts.icon?S.icon(opts.icon,opts.small?13:15):''}<span>${esc(label)}</span></button>`;
  S.header=(eyebrow,title,description='',actions='')=>`<div class="page-heading"><div><p class="eyebrow">${esc(eyebrow)}</p><h1>${esc(title)}</h1>${description?`<p class="page-description">${esc(description)}</p>`:''}</div><div class="heading-actions">${actions}</div></div>`;
  S.tabs=(items,active,action)=>`<div class="tabs" aria-label="页面筛选">${items.map(x=>`<button type="button" class="tab ${x.id===active?'active':''}" data-action="${esc(action)}" data-id="${esc(x.id)}" aria-pressed="${x.id===active}">${esc(x.label)}${x.count!==undefined?`<span class="tab-count">${esc(x.count)}</span>`:''}</button>`).join('')}</div>`;
  S.empty=(title,description,action='')=>`<div class="empty-state"><div class="empty-icon">${S.icon('search',24)}</div><h3>${esc(title)}</h3><p class="small">${esc(description)}</p>${action}</div>`;
  S.search=(id,placeholder,value='')=>`<div class="search-field">${S.icon('search',15)}<input type="search" id="${esc(id)}" value="${esc(value)}" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}" autocomplete="off"><button type="button" class="search-clear" data-action="clear-search" data-input="${esc(id)}" aria-label="清除搜索" ${value?'':'hidden'}>${S.icon('close',13)}</button></div>`;
  S.field=(label,o={})=>{const id=o.id||o.name;return `<div class="field"><label class="field-label" for="${esc(id)}">${esc(label)}${o.required?'<span class="required-star">*</span>':''}</label><input class="input" id="${esc(id)}" name="${esc(o.name||id)}" type="${esc(o.type||'text')}" value="${esc(o.value??'')}" placeholder="${esc(o.placeholder||'')}" ${o.required?'required':''} aria-describedby="${esc(id)}-error${o.help?' '+esc(id)+'-help':''}" ${o.type==='password'?'autocomplete="new-password"':''}>${o.help?`<p class="field-help" id="${esc(id)}-help">${esc(o.help)}</p>`:''}<p class="field-error" id="${esc(id)}-error"></p></div>`;};
  S.validate=(form,rules)=>{let first=null;Object.entries(rules).forEach(([name,rule])=>{const field=form.elements.namedItem(name)||form.querySelector('#'+CSS.escape(name));if(!field)return;const value=String(field.value||'').trim();const error=typeof rule==='function'?rule(value):(!value?rule:null);field.setAttribute('aria-invalid',error?'true':'false');let help=document.getElementById(field.id+'-error');if(!help){help=document.createElement('p');help.className='field-error';help.id=field.id+'-error';field.after(help);}help.textContent=error||'';field.setAttribute('aria-describedby',help.id);if(error&&!first)first=field;});if(first){first.focus();return false;}return true;};
  S.page=(route,config)=>{S.pages[route]=config;}; S.action=(name,fn)=>{S.actions[name]=fn;}; S.form=(name,fn)=>{S.forms[name]=fn;};
  const report=(title)=>`# ${title}\n\n> OTRYX Studio 交互原型 · 演示产物\n\n## 工作摘要\n\n已完成资料整理、结构化分析与人工确认。此文件由原型中的示例数据生成，用于体验完整的任务交付流程。\n\n## 关键发现\n\n1. 本周重点工作已按主题归类，形成可复用的知识条目。\n2. 三项待办已明确负责人和下一步动作。\n3. 需要外部操作的内容保留人工确认环节。\n\n## 下一步\n\n- 核对数据来源与结论。\n- 将失败案例加入评测集。\n- 发布通过验证的智能体版本。\n`;
  const seed=()=>({schema:1,role:'member',installed:[],reviews:[],budget:300,preferences:{notifications:true},agents:[
    {id:'research',name:'研究与洞察',description:'从复杂信息中找到线索，交付有据可循的研究报告。',icon:'globe',color:'mint',model:'DeepSeek Chat',version:'1.3.0',status:'published',tags:['联网研究','资料分析'],prompt:'你是一位严谨的研究助理。先明确目标，检索可信资料，区分事实与推断，最终交付结构清晰的研究报告。涉及外部发布时必须请求用户确认。',knowledge:'',tools:['web-search','document'],runs:128,updated:'今天 10:24',favorite:true},
    {id:'writer',name:'内容工作室',description:'把零散想法整理成清晰、有风格的内容。',icon:'edit',color:'lilac',model:'GPT-4.1',version:'1.1.0',status:'published',tags:['写作','文档生成'],prompt:'你是一位内容编辑。用清晰、自然的中文帮助用户整理信息，先拟提纲，再完成正文。保留用户的关键观点，避免空泛表达。',knowledge:'',tools:['document'],runs:86,updated:'昨天 16:10',favorite:true},
    {id:'analyst',name:'数据分析师',description:'读取业务数据，发现趋势，让下一步有依据。',icon:'chart',color:'sand',model:'Qwen Plus',version:'2.0.1',status:'published',tags:['数据分析','CSV'],prompt:'你是一位数据分析师。先检查数据完整性，给出描述性分析，再根据数据提出可验证的建议。区分相关性与因果关系。',knowledge:'',tools:['python','document'],runs:64,updated:'11月21日',favorite:true},
    {id:'engineer',name:'研发搭档',description:'梳理需求、分析代码，协助完成研发任务。',icon:'code',color:'blue',model:'DeepSeek Chat',version:'0.9.0',status:'draft',tags:['研发','任务计划'],prompt:'你是一位软件研发助手。遵守项目编码规范，先阅读上下文再修改，生成可审查的计划和结果。任何部署或外发操作须先获得确认。',knowledge:'',tools:['git','terminal'],runs:23,updated:'今天 09:32',favorite:false}
  ],models:[
    {id:'deepseek',name:'DeepSeek Chat',provider:'DeepSeek',type:'对话模型',status:'connected',endpoint:'https://api.deepseek.com/v1'},
    {id:'openai',name:'GPT-4.1',provider:'OpenAI',type:'对话模型',status:'connected',endpoint:'https://api.openai.com/v1'},
    {id:'qwen',name:'Qwen Plus',provider:'阿里云',type:'对话模型',status:'connected',endpoint:'https://dashscope.aliyuncs.com/compatible-mode/v1'}
  ],runs:[
    {id:'run-1123-01',title:'本周 AI 行业研究简报',agent:'研究与洞察',source:'行业研究与简报',status:'waiting',version:'1.3.0',tokens:16480,cost:0.31,time:'今天 10:42',created:Date.now()-420000,needsApproval:true,step:2,artifacts:[]},
    {id:'run-1123-02',title:'Peach Cloud 本周研发周报',agent:'内容工作室',source:'工作台',status:'done',version:'1.1.0',tokens:12360,cost:0.24,time:'今天 09:18',created:Date.now()-3600000,needsApproval:false,step:4,artifacts:[{name:'研发周报.md',type:'Markdown',content:report('Peach Cloud 本周研发周报')}]},
    {id:'run-1122-03',title:'产品反馈主题与优先级分析',agent:'数据分析师',source:'数据分析流程',status:'done',version:'2.0.1',tokens:8450,cost:0.16,time:'昨天 16:32',created:Date.now()-86400000,needsApproval:false,step:4,artifacts:[{name:'反馈分析.csv',type:'CSV',content:'主题,反馈数,优先级\n交互体验,24,高\n文档完善,18,中\n性能改善,12,高\n'}]},
    {id:'run-1122-04',title:'知识库增量同步',agent:'研发搭档',source:'知识同步',status:'failed',version:'0.9.0',tokens:2180,cost:0.03,time:'昨天 14:06',created:Date.now()-89000000,needsApproval:false,step:1,error:'文档工具连接超时，请重试此任务。',artifacts:[]}
  ]});
  // Capture once: signing in/out reloads the workspace. In-flight saves can never
  // write the previous account's data into the newly selected account's key.
  const workspaceKey=window.StudioAuth?.workspaceStorageKey()||'otryx-studio-demo';
  try {const saved=JSON.parse(localStorage.getItem(workspaceKey)||'null');S.state=saved&&saved.schema===1?Object.assign(seed(),saved):seed();}catch(_){S.state=seed();}
  const activeSpace=window.StudioSpaces?.active();
  if(activeSpace&&(activeSpace.id!=='default'||!S.state.spaceName))S.state.spaceName=activeSpace.name;
  S.state.agents.forEach(agent=>{if(agent.status==='published'&&!agent.publishedConfig){agent.publishedConfig=JSON.parse(JSON.stringify(agent));agent.publishedPrompt=agent.prompt;}});
  S.agentRuntime=agent=>agent?JSON.parse(JSON.stringify({... (agent.publishedConfig||agent),id:agent.id,icon:agent.icon,color:agent.color})):null;
  // Secret-bearing configuration has a defined owner. User JSON (datasets, inputs,
  // documents) keeps its original property names, including business fields named token.
  S.serializeState=()=>{const owners=new Set([S.state,...(S.state.capabilities?.connections||[]),...(S.state.capabilities?.plugins||[]),...(S.state.models||[]),...(S.state.modelRegistry?.providers||[]),...(S.state.modelRegistry?.models||[]),...(S.state.publishing?.keys||[])]);return JSON.stringify(S.state,function(key,value){return owners.has(this)&&/^(apiKey|api_key|secret|password|token|credential)$/i.test(key)?undefined:value;});};
  S.updateStorageNotice=()=>{const el=document.getElementById('storage-notice');if(el)el.hidden=!S.session.storageUnavailable;};
  S.save=()=>{try{localStorage.setItem(workspaceKey,S.serializeState());S.session.storageUnavailable=false;S.updateStorageNotice();return true;}catch(_){S.session.storageUnavailable=true;S.updateStorageNotice();return false;}};
  S.action('product-publish-service',el=>{if(!S.Publishing){S.toast('发布模块尚未加载','warning');return;}S.Publishing.setActor('owner');S.Publishing.openCreate({kind:el.dataset.kind,id:el.dataset.id});});
  S.action('product-export-state',()=>S.download('otryx-workspace-backup.json',S.serializeState(),'application/json'));

  S.setDirty=(value,onDiscard)=>{S.dirty=!!value;S.discard=onDiscard||null;};
  S.currentHash='';
  const pagePositions=new Map();
  const rememberPosition=()=>{if(S.currentHash)pagePositions.set(S.currentHash,{left:Number(window.scrollX)||0,top:Number(window.scrollY)||0});};
  const restorePosition=position=>window.scrollTo({...position,behavior:'instant'});
  const locationFor=(route,params={})=>'#'+route+(Object.keys(params).length?'?'+new URLSearchParams(params).toString():'');
  const navigate=next=>{rememberPosition();const samePage=next.split('?')[0]===(S.currentHash||'#home').split('?')[0],position=samePage?pagePositions.get(S.currentHash):{left:0,top:0};if(next!==location.hash)history.pushState(null,'',next);S.render();restorePosition(position||{left:0,top:0});};
  S.go=(route,params={})=>{const next=locationFor(route,params);if(next===location.hash){if(!S.dirty)navigate(next);return;}if(S.dirty){S.pendingNavigation=next;S.modal({title:'保留当前编辑？',subtitle:'当前修改尚未保存。你可以继续编辑，或放弃修改后离开。',body:'<div class="notice warning">已发布版本和之前保存的内容不会受到影响。</div>',footer:S.btn('继续编辑','modal-close',{variant:'secondary'})+S.btn('放弃修改并离开','discard-navigation',{variant:'danger'})});return;}navigate(next);};
  S.render=()=>{
    if(typeof S.cleanup==='function'){S.cleanup();S.cleanup=null;}
    const allowed=window.StudioAuth?.guard(location.hash||'#home');if(allowed&&allowed!==location.hash)history.replaceState(null,'',allowed);
    const [route,query='']=(location.hash.slice(1)||'home').split('?');S.route=route;S.params=Object.fromEntries(new URLSearchParams(query));S.currentHash=location.hash||'#home';
    document.body.classList.toggle('auth-shell',!!window.StudioAuth?.isAuthRoute(route));
    const page=S.pages[route];const target=document.getElementById('page-content');if(!target)return;
    S.renderChrome();
    if(!page){target.innerHTML=S.header('WORKSPACE','这个页面还没有准备好','请从左侧导航继续探索。')+S.empty('没有找到页面','返回工作台开始新的任务。',S.btn('返回工作台','go-home'));document.title='页面未找到 · OTRYX Studio';return;}
    document.title=page.title+' · OTRYX Studio';target.innerHTML=page.render();if(page.mount)S.cleanup=page.mount(target)||null;
    document.querySelectorAll('.search-field input').forEach(input=>{const clear=input.parentElement.querySelector('.search-clear');if(clear)clear.hidden=!input.value;});
    window.StudioAppearance?.localize(target);
  };
  S.pendingRuns=()=>{const seen=new Set();return S.state.runs.filter(run=>{if(run.status!=='waiting')return false;const key=run.pending?.id||run.id;if(seen.has(key))return false;seen.add(key);return true;});};
  S.renderChrome=()=>{
    S.updateStorageNotice();
    if(window.StudioAuth?.isAuthRoute(S.route))return;
    const sidebar=document.getElementById('sidebar'),topbar=document.getElementById('topbar');if(!sidebar||!topbar)return;
    const waiting=S.pendingRuns().length,reviews=S.state.reviews.filter(r=>r.status==='pending').length;
    const usage=S.usageSummary?S.usageSummary():{cost:0,budget:S.state.budget||300,ratio:0};
    const account=window.StudioAuth?.getSession(),name=account?.name||account?.displayName||(account?.isDemo?'演示用户':'我的账户');
    const initials=Array.from(name).slice(0,2).join('').toUpperCase();
    const navGroups={agents:['agents','agent','chat'],workflows:['workflows','workflow'],planning:['planning','plan'],services:['services','service'],models:['models','model-detail'],capabilities:['capabilities','mcp','mcp-detail','plugins','plugin-detail'],knowledge:['knowledge','knowledge-detail','assets','asset'],library:['library','content-detail'],quality:['quality','dataset','experiment'],tasks:['tasks','task'],market:['market','market-detail']};
    // Keep the nav, links and focusable controls alive. Runtime status updates only
    // patch their values, so scrolling the navigation never resets it to the top.
    if(!sidebar.dataset.chromeReady){
      const navItem=(route,icon,label,count=false,warm=false)=>`<a class="nav-item" data-nav="${route}" href="#${route}">${S.icon(icon,17)}<span>${label}</span>${count?`<span class="nav-count ${warm?'warm':''}" data-nav-count="${route}" hidden></span>`:''}</a>`;
      sidebar.innerHTML=`<a class="brand" href="#home" aria-label="OTRYX Studio 工作台"><svg class="brand-logo" viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M9 7h13a13 13 0 0 1 0 26H9V7Z" stroke="currentColor" stroke-width="4.5"/><path d="M22 7v26M9 20h25" stroke="currentColor" stroke-width="4.5"/><circle cx="9" cy="7" r="3.5" fill="currentColor"/></svg><span class="brand-name">OTRYX<small>STUDIO</small></span></a><button class="workspace-switch" type="button" data-action="space-manager"><span class="space-avatar" data-chrome="space-initial"></span><span class="space-copy"><strong data-chrome="space-name"></strong><small>个人工作空间</small></span>${S.icon('chevron',12)}</button><nav class="nav-scroll" aria-label="工作空间页面"><p class="nav-label">构建与发布</p>${navItem('home','home','工作台')}${navItem('agents','agent','智能体',true)}${navItem('workflows','workflow','工作流')}${navItem('planning','users','协作计划')}${navItem('services','globe','发布与 API')}<p class="nav-label">资源管理</p>${navItem('models','layers','模型中心')}${navItem('knowledge','book','知识库')}${navItem('capabilities','plug','工具与连接')}${navItem('library','file','提示词与 Skills')}${navItem('market','grid','资源市场')}<p class="nav-label">运行与改进</p>${navItem('tasks','play','运行记录',true,true)}${navItem('usage','chart','用量与成本')}${navItem('quality','shield','质量评测')}${navItem('review','users','发布审核',true,true)}</nav><div class="sidebar-status"><div class="between"><span class="small">本月用量</span><span class="budget-num"><span data-chrome="cost"></span> <span class="muted" data-chrome="budget"></span></span></div><div class="progress-track"><div class="progress-fill"></div></div><div class="between"><span class="small muted" data-chrome="ratio"></span><a href="#usage" aria-label="查看用量明细">${S.icon('arrow',12)}</a></div></div><div class="sidebar-profile"><button type="button" class="profile-avatar" data-action="profile" data-chrome="initials" aria-label="我的账户"></button><div class="profile-copy"><span data-chrome="account-name"></span><small data-chrome="role"></small></div><a class="icon-btn" href="#settings" aria-label="空间设置">${S.icon('settings',17)}</a></div>`;
      sidebar.dataset.chromeReady='true';
    }
    sidebar.querySelectorAll('[data-nav]').forEach(link=>{const route=link.dataset.nav,active=(navGroups[route]||[route]).includes(S.route);link.classList.toggle('active',active);if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');if(route==='review')link.hidden=S.state.role!=='admin';});
    const setText=(root,key,value)=>{const el=root.querySelector('[data-chrome="'+key+'"]');if(el&&el.textContent!==String(value))el.textContent=value;};
    [['agents',S.state.agents.length],['tasks',waiting],['review',reviews]].forEach(([key,count])=>{const el=sidebar.querySelector('[data-nav-count="'+key+'"]');if(el){el.hidden=!count;el.textContent=String(count);}});
    setText(sidebar,'space-name',S.state.spaceName||'我的工作空间');setText(sidebar,'space-initial',Array.from(S.state.spaceName||name)[0]||'我');
    setText(sidebar,'account-name',name);setText(sidebar,'initials',initials);setText(sidebar,'role',S.state.role==='admin'?'管理员 · 演示角色':'个人工作空间');
    setText(sidebar,'cost','¥ '+usage.cost.toFixed(2));setText(sidebar,'budget','/ '+usage.budget);setText(sidebar,'ratio','预算使用 '+(usage.ratio*100).toFixed(1)+'%');
    const status=sidebar.querySelector('.sidebar-status'),progress=sidebar.querySelector('.progress-fill');if(status)status.hidden=S.state.gov?.preferences.digest===false;if(progress)progress.style.width=Math.max(0,Math.min(100,usage.ratio*100))+'%';
    if(!topbar.dataset.chromeReady){
      topbar.innerHTML=`<div class="row"><button type="button" class="icon-btn mobile-menu" data-action="toggle-sidebar" aria-label="打开导航">${S.icon('menu',20)}</button><div class="crumbs"><span class="crumb-home">我的空间</span><span class="crumb-divider">/</span><strong data-chrome="page-title"></strong><span class="badge warning" data-chrome="admin" hidden>管理员演示</span></div></div><div class="top-actions">${window.StudioAppearance?.controls()||''}<span class="demo-badge">本地原型</span><button type="button" class="global-search" data-action="command-search" aria-label="搜索页面与资源">${S.icon('search',14)}<span>搜索工作空间</span><kbd>⌘ K</kbd></button><button type="button" class="icon-btn" data-action="notifications" aria-label="查看待办通知">${S.icon('bell',18)}<i class="notification-dot" hidden></i></button><button type="button" class="profile-avatar" data-action="profile" data-chrome="initials" aria-label="我的账户与退出"></button></div>`;
      topbar.dataset.chromeReady='true';
    }
    setText(topbar,'page-title',S.pages[S.route]?.title||'工作台');setText(topbar,'initials',initials);
    const admin=topbar.querySelector('[data-chrome="admin"]'),dot=topbar.querySelector('.notification-dot');if(admin)admin.hidden=S.state.role!=='admin';if(dot)dot.hidden=!waiting;
    window.StudioAppearance?.localize(sidebar);window.StudioAppearance?.localize(topbar);
  };
  S.modal=(opts)=>{
    S.closeModal();const dialog=document.getElementById('app-dialog');S.modalTrigger=document.activeElement;dialog.className=opts.wide?'wide':'';if(opts.drawer)dialog.classList.add('drawer');
    dialog.innerHTML=`<div class="dialog-header"><div><h2 id="dialog-title">${esc(opts.title||'详情')}</h2>${opts.subtitle?`<p>${esc(opts.subtitle)}</p>`:''}</div><button type="button" class="icon-btn" data-action="modal-close" aria-label="关闭对话框">${S.icon('close',18)}</button></div><div class="dialog-body">${opts.body||''}</div>${opts.footer?`<div class="dialog-footer">${opts.footer}</div>`:''}`;
    S.modalCleanup=opts.onClose||null;dialog.showModal();window.StudioAppearance?.localize(dialog);if(opts.onOpen)opts.onOpen(dialog);return dialog;
  };
  S.drawer=(opts)=>S.modal(Object.assign({},opts,{drawer:true}));
  S.closeModal=()=>{const d=document.getElementById('app-dialog');if(!d||!d.open)return;if(S.modalCleanup){const fn=S.modalCleanup;S.modalCleanup=null;fn();}d.close();if(S.modalTrigger&&S.modalTrigger.isConnected)S.modalTrigger.focus();};
  S.toast=(message,tone='success')=>{if(tone==='success'&&S.session.storageUnavailable){tone='warning';message+='；浏览器存储未完成，请导出备份。';}const stack=document.getElementById('toast-stack');if(!stack)return;const existing=[...stack.children].find(x=>x.dataset.message===message);if(existing)existing.remove();const el=document.createElement('div');el.className='toast '+tone;el.dataset.message=message;el.innerHTML=S.icon(tone==='success'?'check':tone==='error'?'close':'bell',16)+`<span>${esc(message)}</span>`;stack.append(el);setTimeout(()=>el.remove(),3600);};
  S.download=(filename,text,mime='text/plain')=>{const blob=new Blob([text],{type:mime+';charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);};
  S.copy=async(text)=>{try{await navigator.clipboard.writeText(text);S.toast('已复制到剪贴板');return true;}catch(_){S.modal({title:'复制内容',subtitle:'当前环境不支持直接复制，可以选中下方内容复制。',body:`<textarea class="textarea" aria-label="待复制内容" readonly style="resize:none;min-height:180px">${esc(text)}</textarea>`,footer:S.btn('关闭','modal-close',{variant:'secondary'}),onOpen:d=>d.querySelector('textarea').select()});return false;}};
  const refreshRuns=()=>{S.save();if(['home','tasks','task','usage'].includes(S.route))S.render();else S.renderChrome();};
  const completeRun=(run)=>{run.status='done';run.step=4;run.tokens=Math.max(run.tokens||0,18240);run.cost=0.36;const format=run.outputFormat||'Markdown + CSV';run.artifacts=[];if(format.includes('Markdown'))run.artifacts.push({name:run.title.replace(/[\\/:*?"<>|]/g,'_')+'.md',type:'Markdown',content:report(run.title)});if(format.includes('CSV'))run.artifacts.push({name:'任务行动清单.csv',type:'CSV',content:'序号,行动项,状态\n1,核对资料与结论,已完成\n2,人工确认交付内容,已完成\n3,将关键发现加入知识库,待安排\n'});refreshRuns();S.toast('任务已完成，交付物已就绪');};
  const scheduleRun=(run)=>{clearTimeout(S.timers.get(run.id));if(run.status!=='running')return;const timer=setTimeout(()=>{if(run.status!=='running')return;if(run.step>=3){completeRun(run);S.timers.delete(run.id);return;}run.step=(run.step||0)+1;run.tokens=(run.tokens||0)+4200;run.cost=+(run.tokens*0.0000197).toFixed(2);if(run.step>=2&&run.needsApproval){run.status='waiting';refreshRuns();S.toast('任务等待你的确认','info');S.timers.delete(run.id);return;}refreshRuns();scheduleRun(run);},1050);S.timers.set(run.id,timer);};
  S.startRun=(options={})=>{const agent=S.state.agents.find(a=>a.name===options.agent||a.id===options.agent)||S.state.agents[0];const snapshot=S.agentRuntime(agent);if(snapshot&&options.model)snapshot.model=options.model;const run={id:S.uid('run'),title:options.title||'新的创作任务',agent:snapshot?snapshot.name:'研究与洞察',source:options.source||'工作台',status:'running',version:options.version||(snapshot?snapshot.version:'1.0.0'),tokens:0,cost:0,time:'刚刚',created:Date.now(),needsApproval:options.needsApproval===undefined?snapshot?.requireApproval!==false:options.needsApproval!==false,step:0,artifacts:[],agentSnapshot:snapshot,model:snapshot?.model,outputFormat:options.outputFormat||'Markdown + CSV'};S.state.runs.unshift(run);S.save();queueMicrotask(()=>{S.go('task',{id:run.id});scheduleRun(run);});return run;};
  S.resolveRun=(id,approved)=>{const run=S.state.runs.find(r=>r.id===id);if(!run||run.status!=='waiting'){S.toast('这项审批已经处理','info');return;}run.approval={approved,actor:'Huanhuan',time:new Date().toISOString()};run.status=approved?'running':'rejected';run.step=approved?3:run.step;refreshRuns();if(approved){S.toast('已批准，本次任务继续执行');scheduleRun(run);}else S.toast('已拒绝，本次任务已结束','warning');};
  S.action('go-home',()=>S.go('home'));S.action('modal-close',()=>S.closeModal());
  S.action('discard-navigation',()=>{const next=S.pendingNavigation;if(S.discard)S.discard();S.setDirty(false);S.closeModal();S.pendingNavigation=null;navigate(next);});
  S.action('clear-search',el=>{const input=document.getElementById(el.dataset.input);if(input){input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();}});
  S.action('toggle-sidebar',()=>document.getElementById('sidebar').classList.toggle('open'));
  S.action('space-info',()=>S.modal({title:S.state.spaceName||'我的工作空间',subtitle:'这里是你的个人创作空间。',body:`<div class="notice">原型中的操作保存在当前账户的本地空间。</div><div class="divider"></div><div class="between"><span>空间所有者</span><strong>${esc(window.StudioAuth?.getSession()?.name||'演示用户')}</strong></div><div class="between" style="margin-top:14px"><span>空间类型</span><span>个人空间</span></div>`,footer:S.btn('空间设置','open-settings',{variant:'secondary'})}));
  S.action('open-settings',()=>{S.closeModal();S.go('settings');});
  S.action('profile',()=>window.StudioAuth?window.StudioAuth.openAccount():S.modal({title:'Huanhuan 的空间',subtitle:'选择演示角色，体验不同的工作流程。',body:`<div class="notice">个人空间和管理员视角共享同一组本地演示数据。角色切换不会连接真实权限服务。</div><div class="divider"></div><div class="stack">${S.btn('进入个人工作空间','role-member',{variant:'secondary',icon:'home'})}${S.btn('体验平台管理员','role-admin',{variant:'secondary',icon:'shield'})}</div>`,footer:S.btn('关闭','modal-close',{variant:'ghost'})}));
  S.action('role-member',()=>{S.state.role='member';S.save();S.closeModal();S.go('home');S.toast('已切换到个人空间');});
  S.action('role-admin',()=>{S.state.role='admin';S.save();S.closeModal();S.go('review');S.toast('已进入管理员演示');});
  S.action('notifications',()=>{const waiting=S.pendingRuns();S.drawer({title:'待你处理',subtitle:'运行审批与资源审核分别记录。',body:waiting.length?waiting.map(r=>`<div class="panel panel-pad" style="margin-bottom:12px"><div class="row">${S.badge('待确认','warning')}<span class="small muted">${esc(r.time)}</span></div><h3 style="margin:12px 0;font-size:14px">${esc(r.title)}</h3><p class="small muted">继续任务前，请核对待确认的操作、参数或内容。</p><div style="margin-top:14px">${S.btn('查看并处理','open-task',{icon:'arrow',attrs:`data-id="${esc(r.id)}"`,small:true})}</div></div>`).join(''):S.empty('暂时没有待办','所有任务都已处理，可以继续新的创作。'),footer:S.btn('全部任务','all-tasks',{variant:'secondary'})});});
  S.action('open-task',el=>{S.closeModal();S.go('task',{id:el.dataset.id});});S.action('all-tasks',()=>{S.closeModal();S.go('tasks');});
  S.action('command-search',()=>{
    if(window.StudioAuth&&!window.StudioAuth.getSession())return;
    const pages=[['home','工作台'],['agents','智能体'],['workflows','工作流'],['planning','协作计划'],['services','发布与 API'],['models','模型中心'],['knowledge','知识库'],['capabilities','工具与连接'],['library','提示词与 Skills'],['market','资源市场'],['tasks','运行记录'],['quality','质量评测'],['usage','用量与成本'],['settings','空间设置']];
    const entries=pages.map(([route,name])=>({href:'#'+route,name,kind:'页面'})).concat(S.state.agents.map(a=>({href:'#agent?id='+encodeURIComponent(a.id),name:a.name,kind:'智能体'})),(S.Runtime?.flows||[]).map(f=>({href:'#workflow?id='+encodeURIComponent(f.id),name:f.title,kind:'工作流'})),(S.ContentStore?.listKnowledge()||[]).map(k=>({href:'#knowledge-detail?id='+encodeURIComponent(k.id),name:k.name,kind:'知识库'})));
    const results=q=>entries.filter(x=>(x.name+' '+x.kind).toLowerCase().includes(q.toLowerCase())).slice(0,12).map(x=>`<a class="command-item" href="${esc(x.href)}"><span>${esc(x.name)}</span><small>${esc(x.kind)}</small></a>`).join('')||S.empty('没有匹配内容','换个关键词搜索。');
    S.modal({title:'搜索工作空间',body:S.search('command-query','搜索页面、智能体、工作流或知识库')+'<div id="command-results">'+results('')+'</div>',onOpen:d=>{const field=d.querySelector('#command-query');const update=()=>{d.querySelector('#command-results').innerHTML=results(field.value.trim());};field.addEventListener('input',ev=>{if(!ev.isComposing)update();});field.addEventListener('compositionend',update);field.focus();}});
  });
  S.action('command-go',el=>{S.closeModal();S.go(el.dataset.id);});
  S.action('help',()=>S.modal({title:'欢迎来到 OTRYX Studio',subtitle:'一套可以完整体验的 AI 工作室原型',wide:true,body:`<div class="guide-grid"><div class="guide-card">${S.icon('spark',22)}<h3>从目标开始</h3><p>在工作台输入任务，切换对话、规划和执行模式，体验从想法到交付。</p></div><div class="guide-card">${S.icon('workflow',22)}<h3>让流程运转</h3><p>编辑工作流、发布版本、开始运行，再到任务中心处理审批与查看产物。</p></div><div class="guide-card">${S.icon('grid',22)}<h3>积累你的能力</h3><p>在市场安装 Skill、MCP 和模板，或提交自己的资源，切换管理员完成审核。</p></div><div class="guide-card">${S.icon('chart',22)}<h3>持续发现改进</h3><p>查看用量账本、启动评测，基于失败案例调整智能体。</p></div></div><div class="notice" style="margin-top:18px">所有模型响应、成本、审批和运行均为本地模拟，不会连接外部服务。可在空间设置中重置演示。</div>`,footer:S.btn('开始探索','modal-close',{icon:'arrow'})}));
  S.action('reset-demo',()=>S.modal({title:'重置本地演示数据？',subtitle:'将移除你在此原型中创建的内容，恢复初始示例。',body:'<div class="notice warning">此操作只影响当前浏览器的 OTRYX Studio 原型数据。</div>',footer:S.btn('保留数据','modal-close',{variant:'secondary'})+S.btn('重置演示','confirm-reset',{variant:'danger'}),onOpen:d=>d.querySelector('[data-action="modal-close"]').focus()}));
  S.action('confirm-reset',()=>{try{S.Planning?.stopAll?.();localStorage.removeItem(workspaceKey);}catch(_){}S.setDirty(false);location.hash='home';location.reload();});
  S.init=()=>{
    if('scrollRestoration' in history)history.scrollRestoration='manual';
    document.addEventListener('click',async event=>{
      const skip=event.target.closest('.skip-link');if(skip){event.preventDefault();document.getElementById('page-content')?.focus({preventScroll:false});return;}
      const go=event.target.closest('[data-go]');if(go){event.preventDefault();S.go(go.dataset.go);return;}
      const link=event.target.closest('a[href^="#"]');if(link&&!link.classList.contains('skip-link')){const href=link.getAttribute('href');if(href.length>1){event.preventDefault();if(link.dataset.nav&&href===S.currentHash){document.getElementById('sidebar').classList.remove('open');return;}const [route,q='']=href.slice(1).split('?');if(link.closest('dialog'))S.closeModal();S.go(route,Object.fromEntries(new URLSearchParams(q)));document.getElementById('sidebar').classList.remove('open');}return;}
      const el=event.target.closest('[data-action]');if(!el||el.disabled)return;const handler=S.actions[el.dataset.action];if(!handler)return;
      try{const result=handler(el,event);if(result&&typeof result.then==='function'){el.disabled=true;el.setAttribute('aria-busy','true');await result;el.disabled=false;el.removeAttribute('aria-busy');}}catch(error){console.error('Prototype action failed:',error);S.toast('操作未完成，请重试','error');el.disabled=false;el.removeAttribute('aria-busy');}
    });
    document.addEventListener('submit',async event=>{event.preventDefault();const form=event.target,name=form.dataset.form;if(!name||!S.forms[name]||form.dataset.submitting==='true')return;form.dataset.submitting='true';form.setAttribute('aria-busy','true');try{await S.forms[name](form,event);}catch(error){console.error('Prototype form failed:',error);S.toast('保存未完成，请检查输入后重试','error');}finally{delete form.dataset.submitting;form.removeAttribute('aria-busy');}});
    document.addEventListener('input',event=>{if(event.target.matches('.search-field input')){const button=event.target.parentElement.querySelector('.search-clear');if(button)button.hidden=!event.target.value;}});
    document.addEventListener('keydown',event=>{if(event.isComposing)return;if(!window.StudioAuth?.isAuthRoute(S.route)&&(event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();S.actions['command-search']();}if(event.key==='Escape')document.getElementById('sidebar').classList.remove('open');});
    document.getElementById('app-dialog').addEventListener('cancel',event=>{event.preventDefault();S.closeModal();});
    const onHistory=()=>{if(location.hash===S.currentHash)return;const next=location.hash||'#home';rememberPosition();if(S.dirty){history.replaceState(null,'',S.currentHash);const [r,q='']=next.slice(1).split('?');S.go(r,Object.fromEntries(new URLSearchParams(q)));return;}const samePage=next.split('?')[0]===(S.currentHash||'#home').split('?')[0];const position=pagePositions.get(next)||(samePage?pagePositions.get(S.currentHash):null)||{left:0,top:0};S.render();restorePosition(position);};
    window.addEventListener('popstate',onHistory);window.addEventListener('hashchange',onHistory);
    window.addEventListener('beforeunload',event=>{if(S.dirty){event.preventDefault();event.returnValue='';}});
    S.render();S.save();if(!window.StudioAuth||window.StudioAuth.getSession())S.state.runs.filter(r=>r.status==='running'&&!r.engine).forEach(scheduleRun);
  };
})();
