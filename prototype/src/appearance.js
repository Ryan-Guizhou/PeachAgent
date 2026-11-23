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
  '我的账户与退出登录':'Account & Sign Out','管理员演示':'Admin Demo','空间所有者':'Workspace Owner',
  '空间类型':'Workspace Type','个人空间':'Personal Space','关闭':'Close','返回':'Back','创建':'Create',
  '保存':'Save','取消':'Cancel','编辑':'Edit','删除':'Delete','确定':'Confirm','新增':'New',
  '登录':'Sign in','注册':'Sign up','登录工作空间':'Sign in to your workspace','创建本地账户':'Create local account',
  '忘记密码':'Forgot password','重置密码':'Reset password','重置本地密码':'Reset local password',
  '登录状态已失效':'Session expired','欢迎回来':'Welcome back','创建你的工作空间':'Create your workspace',
  '你的称呼':'Your name','邮箱':'Email','密码':'Password','设置密码':'Set password','确认密码':'Confirm password',
  '注册邮箱':'Email address','新密码':'New password','确认新密码':'Confirm new password',
  '返回工作空间':'Back to workspace','创建并进入工作空间':'Create account & enter workspace',
  '进入演示空间':'Enter demo workspace','创建本地账户':'Create local account','返回登录':'Back to sign in',
  '忘记密码？':'Forgot password?','先了解产品':'Explore the platform',
  '重新登录':'Sign in again','退出登录':'Sign out','会话状态':'Session status',
  '登录已失效':'Session expired','找回访问方式':'Recover access','继续本地重置':'Continue reset',
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
  '复制':'Copy','账户':'Account'
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
  if(locale==='en-US'){
   const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
   const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
   nodes.forEach(node=>{
    if(node.parentElement?.closest('script,style,textarea,pre,code,kbd,[contenteditable],.mono,.code-editor,.auth-credential-demo'))return;
    const raw=node.nodeValue,trimmed=raw.trim();
    if(labels[trimmed])node.nodeValue=raw.replace(trimmed,labels[trimmed]);
   });
   root.querySelectorAll('input[placeholder],textarea[placeholder]').forEach(el=>{
    if(labels[el.placeholder])el.placeholder=labels[el.placeholder];
   });
  }else{
   const inverse=Object.fromEntries(Object.entries(labels).map(([zh,en])=>[en,zh]));
   const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
   const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
   nodes.forEach(node=>{
    if(node.parentElement?.closest('script,style,textarea,pre,code,kbd,[contenteditable],.mono,.code-editor,.auth-credential-demo'))return;
    const raw=node.nodeValue,trimmed=raw.trim();if(inverse[trimmed])node.nodeValue=raw.replace(trimmed,inverse[trimmed]);
   });
  }
  updateChrome();
 }
 function setTheme(next){
  if(!themes.includes(next))return false;
  theme=next;document.documentElement.dataset.theme=theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',getComputedStyle(document.documentElement).getPropertyValue('--bg-app').trim());
  persist();updateChrome();return true;
 }
 function setLocale(next){
  if(!['zh-CN','en-US'].includes(next))return false;
  locale=next;document.documentElement.lang=next;persist();
  if(studio){studio.closeModal?.();studio.render();} else location.reload();
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
 window.StudioAppearance={attach,setTheme,setLocale,localize,controls,getTheme:()=>theme,getLocale:()=>locale,t,themes,labels};
})();
