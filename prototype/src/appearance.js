(function(){
 'use strict';
 const KEY='peachagent-appearance-v1';
 const themes=['editorial-light','obsidian-dark','nordic-slate'];
 const names={'editorial-light':['日光纸感','Editorial Light'],'obsidian-dark':['深空工作台','Obsidian Dark'],'nordic-slate':['冷静灰蓝','Nordic Slate']};
 const captions={'editorial-light':['温润白纸与精细边框','Warm paper and precise outlines'],'obsidian-dark':['低眩光石墨与沉稳蓝灰','Graphite surfaces and restrained blue'],'nordic-slate':['清冷石板与结构化面板','Cool slate and structured surfaces']};
 const labels={
  '工作台':'Workspace','智能体':'Agents','工作流':'Workflows','协作计划':'Agent Planning','发布与 API':'Publish & API',
  '构建与发布':'Build & Publish','资源管理':'Resources','运行与改进':'Observe & Improve',
  '模型中心':'Models','知识库':'Knowledge','工具与连接':'Tools & Connections','提示词与 Skills':'Prompts & Skills',
  '资源市场':'Marketplace','运行记录':'Runs','用量与成本':'Usage & Cost','质量评测':'Evaluations','发布审核':'Reviews',
  '空间设置':'Space Settings','我的空间':'My Space','个人工作空间':'Personal Workspace','我的工作空间':'My Workspace',
  '本地原型':'Local Prototype','本地交互原型':'Interactive Prototype','搜索工作空间':'Search Workspace',
  '本月用量':'Monthly Usage','我的账户':'My Account','我的账户与退出':'Account & Sign Out',
  '我的账户与退出登录':'Account & Sign Out of Workspace','管理员演示':'Admin Demo','空间所有者':'Workspace Owner',
  '空间类型':'Workspace Type','个人空间':'Personal Space','关闭':'Close','返回':'Back','创建':'Create',
  '保存':'Save','取消':'Cancel','编辑':'Edit','删除':'Delete','确定':'Confirm','新增':'New',
  '登录':'Sign in','注册':'Sign up','登录工作空间':'Sign in to your workspace',
  '忘记密码':'Forgot password','重置密码':'Reset password','重置本地密码':'Reset local password',
  '登录状态已失效':'Session expired','欢迎回来':'Welcome back','创建你的工作空间':'Create your workspace',
  '你的称呼':'Your name','邮箱':'Email','密码':'Password','设置密码':'Set password','确认密码':'Confirm password',
  '注册邮箱':'Email address','新密码':'New password','确认新密码':'Confirm new password',
  '返回工作空间':'Back to workspace','创建并进入工作空间':'Create account & enter workspace',
  '进入演示空间':'Enter demo workspace','创建本地账户':'Create local account','返回登录':'Back to sign in',
  '忘记密码？':'Forgot password?','先了解产品':'Explore the platform',
  '重新登录':'Sign in again','退出登录':'Sign out','会话状态':'Session status',
  '登录已失效':'Login expired','找回访问方式':'Recover access','继续本地重置':'Continue reset',
  '更新本地密码':'Update local password','重新生成演示码':'Regenerate demo code',
  '切换主题':'Change theme','语言':'Language','主题':'Theme',
  '从一个想法，':'From one idea,','到可运行的应用。':'to a working application.',
  '让智能体完成任务':'Delegate tasks to agents','把过程编排清楚':'Orchestrate every step',
  '将能力提供给业务':'Ship capabilities to your business',
  '继续构建应用，处理运行待办，查看最近的执行结果。':'Keep building, review pending runs, and inspect recent outcomes.',
  '新建工作流':'New workflow','新建智能体':'New agent','开始探索':'Explore',
  '启动运行':'Run','停止运行':'Stop','运行中':'Running','已完成':'Completed',
  '失败':'Failed','等待确认':'Awaiting approval','待确认':'Needs review','暂停':'Paused',
  '正在处理…':'Processing…','没有匹配内容':'No results','暂时没有待办':'All caught up',
  '创建空间':'Create workspace','切换空间':'Switch workspace','重命名空间':'Rename workspace',
  '当前空间':'Current workspace','默认空间':'Default workspace','演示空间':'Demo workspace',
  '空间名称':'Workspace name','新增工作空间':'New workspace',
  '演示账号':'Demo account','演示密码':'Demo password','填入演示账号':'Use demo credentials',
  '复制':'Copy','账户':'Account',
  "项目管理":"Projects",
  "凭证中心":"Credentials",
  "待办与审批":"Inbox & approvals",
  "任务计划":"Task plans",
  "智能体工作台":"Agent workspace",
  "Agent Chat":"Agent Chat",
  "资源审核":"Resource reviews",
  "应用服务":"Applications",
  "默认项目":"Default project",
  "当前项目":"Current project",
  "创建项目":"Create project",
  "项目名称":"Project name",
  "归档":"Archive",
  "恢复":"Restore",
  "重命名":"Rename",
  "已归档":"Archived",
  "已撤销":"Revoked",
  "有效":"Active",
  "查看详情":"View details",
  "查看并处理":"Review",
  "开始审核":"Review submission",
  "绑定连接":"Bind connection",
  "添加凭证引用":"Add credential reference",
  "凭证引用":"Credential reference",
  "验证":"Verify",
  "轮换":"Rotate",
  "撤销":"Revoke",
  "运行审批":"Run approvals",
  "API Key 申请":"API Key requests",
  "公共资源审核":"Public resource reviews",
  "全部":"All",
  "待审核":"Pending review",
  "已通过":"Approved",
  "已退回":"Rejected",
  "草稿":"Draft",
  "已发布":"Published",
  "已启用":"Enabled",
  "已停用":"Disabled",
  "启用":"Enable",
  "停用":"Disable",
  "已安装":"Installed",
  "安装":"Install",
  "卸载":"Uninstall",
  "配置":"Configure",
  "管理":"Manage",
  "刷新":"Refresh",
  "复制链接":"Copy link",
  "导入":"Import",
  "导出":"Export",
  "保存草稿":"Save draft",
  "发布版本":"Publish version",
  "发布为服务":"Publish as service",
  "新会话":"New chat",
  "历史会话":"Chat history",
  "发送":"Send",
  "停止":"Stop",
  "继续":"Continue",
  "添加":"Add",
  "选择":"Select",
  "名称":"Name",
  "描述":"Description",
  "对话模型":"Chat model",
  "配置连接":"Configure connection",
  "添加连接":"Add connection",
  "添加模型":"Add model",
  "模型实例":"Model instances",
  "服务商连接":"Provider connections",
  "默认用途":"Defaults",
  "工具选择":"Tool selection",
  "资源分类":"Resource type",
  "页面筛选":"Page filters",
  "打开导航":"Open navigation",
  "关闭导航":"Close navigation",
  "关闭对话框":"Close dialog",
  "搜索页面与资源":"Search pages and resources",
  "查看待办通知":"Open inbox",
  "查看用量明细":"View usage details",
  "清除搜索":"Clear search",
  "工作空间页面":"Workspace pages",
  "主导航":"Main navigation",
  "跳转到主要内容":"Skip to main content",
  "发送消息":"Send message",
  "配置智能体":"Configure agent",
  "打开工作空间":"Open workspace",
  "管理员 · 演示角色":"Administrator · demo role",
  "显示":"Show",
  "隐藏":"Hide",
  "输入你的密码":"Enter password",
  "至少 8 个字符":"At least 8 characters",
  "再次输入密码":"Re-enter password",
  "设置新密码":"Set new password",
  "继续你的应用、工作流和运行记录。":"Continue building apps and workflows and reviewing runs.",
  "为你的应用建立一个独立的工作空间。":"Create a separate workspace for your apps.",
  "使用当前浏览器的演示流程重新设置密码。":"Reset the local demo password in this browser.",
  "完成后，请使用新密码重新登录。":"Sign in again using the new password.",
  "在同一个空间里构建智能体、编排工作流，":"Build agents and workflows in one workspace,",
  "让每一次调用都可配置、可追踪、可改进。":"Make each invocation configurable, traceable and improvable.",
  "配置模型、工具和协作方式。":"Configure models, tools and collaboration.",
  "从节点传参到分支执行，逐步调试。":"Debug node inputs and branch execution step by step.",
  "发布应用与 API，持续检查质量。":"Publish apps and APIs and monitor quality.",
  "你的内容，保存在当前浏览器。":"Your content stays in this browser.",
  "账户之间使用独立工作空间。":"Accounts have separate workspaces.",
  "本地演示账户 · 不连接身份服务 · 不发送邮件":"Local demo account · No identity service · No email sent",
  "已有账户？登录":"Already have an account? Sign in",
  "导入资源副本":"Import resource copy"
 };
 let theme='editorial-light',locale='zh-CN', studio=null;
 try{
  const saved=JSON.parse(localStorage.getItem(KEY)||'{}');
  if(themes.includes(saved.theme))theme=saved.theme;
  if(['zh-CN','en-US'].includes(saved.locale))locale=saved.locale;
 }catch(_){}
 document.documentElement.setAttribute('data-theme',theme);
 document.documentElement.lang=locale;
 const t=value=>locale==='en-US'?(labels[value]||value):value;
 function persist(){try{localStorage.setItem(KEY,JSON.stringify({theme,locale}));}catch(_){}}
 function updateChrome(){
  document.querySelectorAll('[data-appearance-theme]').forEach(el=>{
   const themeName=names[theme][locale==='zh-CN'?0:1];el.title=t('切换主题')+' · '+themeName;el.setAttribute('aria-label',el.title);
  });
  document.querySelectorAll('[data-appearance-locale]').forEach(el=>{
   el.title=t('语言')+' · '+(locale==='zh-CN'?'English':'中文');
   el.setAttribute('aria-label',el.title);
   const text=el.querySelector('.appearance-locale-text');if(text)text.textContent=locale==='zh-CN'?'EN':'中';
  });
 }
 function localize(root=document){
  if(!root?.querySelectorAll)return;
  // Only opt-in UI elements and known static shell/auth labels. Never traverse
  // arbitrary business data (resource names, chat text, knowledge or JSON).
  const fixed='[data-i18n],.nav-label,[data-nav]>span:not([data-nav-count]),.auth-step-label,.auth-feature-list strong,.auth-feature-list span,.auth-switch a,.auth-back,.auth-divider span,.auth-prototype-label,.auth-credential-demo .credential-label,.crumb-home,.demo-badge,.sidebar-status .small:not([data-chrome]),.space-copy small,.auth-footer span';
  root.querySelectorAll(fixed).forEach(el=>{
   if(el.closest?.('[data-no-i18n]')||el.children.length)return;
   const source=el.getAttribute('data-i18n')||el.getAttribute('data-i18n-source')||el.textContent.trim();
   if(!Object.prototype.hasOwnProperty.call(labels,source))return;
   el.setAttribute('data-i18n-source',source);el.textContent=t(source);
  });
  root.querySelectorAll('[data-i18n-aria-label],[data-i18n-title],[data-i18n-placeholder]').forEach(el=>{
   if(el.closest?.('[data-no-i18n]'))return;
   for(const attr of ['aria-label','title','placeholder']){
    const source=el.getAttribute('data-i18n-'+attr);
    if(source)el.setAttribute(attr,t(source));
   }
  });
  updateChrome();
 }
 function setTheme(next){
  if(!themes.includes(next))return false;
  theme=next;document.documentElement.dataset.theme=theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',getComputedStyle(document.documentElement).getPropertyValue('--bg-app').trim());
  persist();updateChrome();return true;
 }
 function hasUncommittedInput(includeDialog=true){
  if(studio?.dirty||(includeDialog&&document.getElementById?.('app-dialog')?.open))return true;
  return Array.from(document.querySelectorAll('#page-content form input, #page-content form textarea, #page-content form select')).some(el=>{
   if(el.disabled||['hidden','button','submit'].includes(el.type))return false;
   if(el.type==='checkbox'||el.type==='radio')return el.checked!==el.defaultChecked;
   if(el.tagName==='SELECT'){
    const options=Array.from(el.options),hasDefault=options.some(item=>item.defaultSelected);
    return options.some((option,index)=>option.selected!==(option.defaultSelected||(!hasDefault&&!el.multiple&&index===0)));
   }
   return el.value!==el.defaultValue;
  });
 }
 function setLocale(next){
  if(!['zh-CN','en-US'].includes(next))return false;
  if(next===locale)return true;
  if(hasUncommittedInput()){studio?.toast(locale==='zh-CN'?'请先保存或放弃当前编辑，关闭弹窗后再切换语言。':'Save or discard your edits and close the dialog before changing language.','warning');return false;}
  locale=next;document.documentElement.lang=next;persist();
  if(studio){studio.closeModal?.();studio.render();localize(document);} else location.reload();
  updateChrome();return true;
 }
 function controls(){
  return '<div class="appearance-controls" role="group" aria-label="Appearance">'+
    '<button type="button" class="appearance-trigger" data-action="appearance-theme" data-appearance-theme aria-label="切换主题">'+
    '<svg class="icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"/></svg><span>'+t('主题')+'</span></button>'+
    '<button type="button" class="appearance-trigger" data-action="appearance-locale" data-appearance-locale aria-label="语言">'+
    '<svg class="icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-5 4-5 14 0 18M12 3c5 4 5 14 0 18"/></svg><span class="appearance-locale-text">'+(locale==='zh-CN'?'EN':'中')+'</span></button></div>';
 }
 // Use conventional English/Chinese choices rather than a hidden OS-preference toggle.
 function themeDialog(){
  if(!studio)return;
  const index=locale==='zh-CN'?0:1;
  const body='<div class="theme-options">'+themes.map(key=>'<button type="button" class="theme-option" data-action="appearance-select" data-theme-value="'+key+'" aria-pressed="'+(theme===key)+'">'+
    '<span class="theme-swatch" style="background:'+(key==='editorial-light'?'#F7F7F4':key==='obsidian-dark'?'#171B20':'#E9EEF2')+'"></span><span><strong>'+names[key][index]+'</strong><small>'+captions[key][index]+'</small></span></button>').join('')+'</div>';
  studio.modal({title:t('切换主题'),subtitle:locale==='zh-CN'?'三套工作台主题均使用语义颜色令牌，设置会在本地保存。':'Three restrained themes with semantic tokens. Your choice is saved locally.',body});
  localize(document.getElementById('app-dialog'));
 }
 function attach(S){
  studio=S;
  S.action('appearance-theme',()=>themeDialog());
  S.action('appearance-select',el=>{setTheme(el.dataset.themeValue);S.closeModal();S.toast(locale==='zh-CN'?'主题已更新':'Theme updated');});
  S.action('appearance-locale',()=>setLocale(locale==='zh-CN'?'en-US':'zh-CN'));
 }
 window.StudioAppearance={attach,setTheme,setLocale,localize,hasUncommittedInput,controls,getTheme:()=>theme,getLocale:()=>locale,t,themes,labels};
})();
