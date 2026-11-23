(function(){
 'use strict';
 // Browser-local prototype only. Workspaces belong to a local account, not to production tenants.
 const PREFIX='peachagent-spaces-v1::';
 const LEGACY='otryx-studio-workspace::';
 const DEMO_KEY='otryx-studio-demo';
 const DEFAULT_ID='default';
 const MAX_SPACES=20;
 const validAccount=id=>id==='demo'||/^u-[a-f0-9]{24}$/.test(String(id||''));
 const validateName=name=>{const n=String(name||'').trim();if(!n||n.length>42)throw new Error('空间名称须为 1–42 个字符');return n;};
 const safeParse=s=>{try{return JSON.parse(s)}catch(_){return null}};
 const key=id=>PREFIX+id;
 function owner(){
  const session=window.StudioAuth?.getSession();
  return session?.accountId||null;
 }
 function read(id){
  if(!validAccount(id))throw new Error('无法识别当前账户');
  const defaults={version:1,active:DEFAULT_ID,spaces:[{id:DEFAULT_ID,name:id==='demo'?'演示空间':'我的工作空间',createdAt:0}]};
  let stored=null;
  try{stored=safeParse(localStorage.getItem(key(id)))}catch(_){}
  if(!stored||stored.version!==1||!Array.isArray(stored.spaces))return defaults;
  const spaces=stored.spaces.filter(s=>s&&s.id===DEFAULT_ID||s&&/^space-[a-f0-9]{24}$/.test(s.id)).filter(s=>typeof s.name==='string'&&s.name.length>0&&s.name.length<=42).slice(0,MAX_SPACES).map(s=>({id:s.id,name:s.name,createdAt:Number(s.createdAt)||0}));
  if(!spaces.some(s=>s.id===DEFAULT_ID))spaces.unshift(defaults.spaces[0]);
  return {version:1,active:spaces.some(s=>s.id===stored.active)?stored.active:DEFAULT_ID,spaces};
 }
 function write(id,state){
  localStorage.setItem(key(id),JSON.stringify(state));
 }
 function storageKey(id,space){
  if(space===DEFAULT_ID)return id==='demo'?DEMO_KEY:LEGACY+id;
  return 'otryx-studio-workspace::'+id+'::'+space;
 }
 function active(){
  const id=owner();if(!id)return null;
  const registry=read(id);
  return {owner:id,...registry.spaces.find(s=>s.id===registry.active),storageKey:storageKey(id,registry.active)};
 }
 function list(){
  const id=owner();if(!id)return [];
  const state=read(id);return state.spaces.map(s=>({...s,active:s.id===state.active}));
 }
 function randomId(){
  const bytes=new Uint8Array(12);
  if(!window.crypto?.getRandomValues)throw new Error('浏览器安全随机数不可用');
  window.crypto.getRandomValues(bytes);
  return 'space-'+Array.from(bytes,n=>n.toString(16).padStart(2,'0')).join('');
 }
 function create(name){
  const id=owner();if(!id)throw new Error('请先登录账户');
  const state=read(id);if(state.spaces.length>=MAX_SPACES)throw new Error('一个账户最多支持 20 个本地空间');
  const space={id:randomId(),name:validateName(name),createdAt:Date.now()};
  state.spaces.push(space);
  // Do not switch when persistence fails; leave all existing work intact.
  write(id,state);
  return space;
 }
 function rename(spaceId,name){
  const id=owner();if(!id)throw new Error('请先登录账户');
  const state=read(id);const target=state.spaces.find(s=>s.id===spaceId);
  if(!target)throw new Error('工作空间不存在');
  target.name=validateName(name);
  write(id,state);
  if(spaceId===state.active&&window.Studio){window.Studio.state.spaceName=target.name;window.Studio.save();window.Studio.renderChrome();}
  return target;
 }
 function switchTo(spaceId){
  const id=owner();if(!id)throw new Error('请先登录账户');
  const state=read(id);
  if(!state.spaces.some(s=>s.id===spaceId))throw new Error('工作空间不存在');
  if(state.active===spaceId)return false;
  const studio=window.Studio;
  if(studio?.dirty)throw new Error('请先保存或放弃当前编辑，再切换工作空间');
  // Keep the previous account/space captured in core.js until the reload.
  if(studio&&studio.save()===false)throw new Error('无法保存当前工作空间，请先导出备份');
  try{
   studio?.Planning?.stopAll?.('space-switch');
   (studio?.state?.runs||[]).filter(r=>['running','waiting','queued'].includes(r.status)).forEach(r=>{r.status='stopped';r.stopReason='切换空间时停止本地任务';});
   studio?.save?.();
   studio?.Publishing?.clearSession?.();
   studio?.Models?.clearSession?.();
  }catch(_){}
  state.active=spaceId;write(id,state);
  location.reload();
  return true;
 }
 function attach(S){
  const show=()=>{
   const current=active();if(!current)return;
   const esc=S.escape;
   const rows=list().map(s=>'<div class="space-choice'+(s.active?' active':'')+'"><button type="button" class="space-info" data-action="space-open" data-id="'+esc(s.id)+'" '+(s.active?'disabled':'')+'><strong>'+esc(s.name)+'</strong><small>'+(s.active?'当前空间':s.id===DEFAULT_ID?'默认空间':'独立空间')+'</small></button><button type="button" class="btn btn-ghost btn-sm" data-action="space-rename" data-id="'+esc(s.id)+'">重命名</button></div>').join('');
   S.modal({title:'切换工作空间',subtitle:'每个空间的智能体、模型、任务与评测数据独立保存在当前浏览器。',body:'<div class="space-list">'+rows+'</div><p class="small muted" style="margin-top:16px">本地原型不包含云端同步、协作成员或真正的多租户授权。</p>',footer:S.btn('关闭','modal-close',{variant:'secondary'})+S.btn('创建空间','space-create',{icon:'plus'})});
   window.StudioAppearance?.localize(document.getElementById('app-dialog'));
  };
  S.action('space-manager',show);
  S.action('space-create',()=>{
   S.modal({title:'创建空间',subtitle:'创建后可在左上角切换。新空间从独立的示例数据开始。',body:S.field('空间名称',{id:'new-space-name',name:'name',placeholder:'例如：产品研发',required:true}),footer:S.btn('取消','modal-close',{variant:'secondary'})+S.btn('创建空间','space-create-confirm')});
   document.getElementById('new-space-name')?.focus();
  });
  S.action('space-create-confirm',()=>{
   const field=document.getElementById('new-space-name');
   try{
    const space=create(field?.value);
    S.closeModal();S.toast('已创建空间：'+space.name);show();
   }catch(error){S.toast(error.message,'error');field?.focus();}
  });
  S.action('space-open',el=>{
   try{switchTo(el.dataset.id);}
   catch(error){S.toast(error.message,'warning');}
  });
  S.action('space-rename',el=>{
   const item=list().find(s=>s.id===el.dataset.id);if(!item)return;
   S.modal({title:'重命名空间',subtitle:'不会改变空间中的已有内容。',body:S.field('空间名称',{id:'rename-space-name',name:'name',value:item.name,required:true}),footer:S.btn('取消','modal-close',{variant:'secondary'})+S.btn('保存','space-rename-confirm',{attrs:'data-id="'+S.escape(item.id)+'"'})});
  });
  S.action('space-rename-confirm',el=>{
   try{rename(el.dataset.id,document.getElementById('rename-space-name')?.value);S.closeModal();S.toast('空间已重命名');show();}
   catch(error){S.toast(error.message,'error');}
  });
 }
 window.StudioSpaces={owner,read,active,list,create,rename,switchTo,storageKey,attach,DEFAULT_ID};
})();
