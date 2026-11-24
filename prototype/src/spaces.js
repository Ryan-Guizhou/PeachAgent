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
  if(!stored||stored.version!==1||!Array.isArray(stored.spaces)){
   // Preserve the name saved before the workspace registry was introduced.
   try{const legacy=safeParse(localStorage.getItem(storageKey(id,DEFAULT_ID)));const name=legacy?.spaceName||legacy?.gov?.preferences?.name;if(typeof name==='string'&&name.trim()&&name.trim().length<=42)defaults.spaces[0].name=name.trim();}catch(_){}
   return defaults;
  }
  const spaces=stored.spaces.filter(s=>s&&s.id===DEFAULT_ID||s&&/^space-[a-f0-9]{24}$/.test(s.id)).filter(s=>typeof s.name==='string'&&s.name.length>0&&s.name.length<=42).slice(0,MAX_SPACES).map(s=>({id:s.id,name:s.name,createdAt:Number(s.createdAt)||0,archived:s.id!==DEFAULT_ID&&!!s.archived}));
  if(!spaces.some(s=>s.id===DEFAULT_ID))spaces.unshift(defaults.spaces[0]);
  return {version:1,active:spaces.some(s=>s.id===stored.active&&!s.archived)?stored.active:DEFAULT_ID,spaces};
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
  if(spaceId===state.active&&window.Studio){
   const studio=window.Studio;
   studio.state.spaceName=target.name;
   if(studio.state.gov?.preferences)studio.state.gov.preferences.name=target.name;
   studio.renderChrome?.();
  }
  return target;
 }
 function switchTo(spaceId){
  const id=owner();if(!id)throw new Error('请先登录账户');
  const state=read(id);
  if(!state.spaces.some(s=>s.id===spaceId&&!s.archived))throw new Error('工作空间不存在或已归档');
  if(state.active===spaceId)return false;
  const studio=window.Studio;
  if(studio?.dirty||window.StudioAppearance?.hasUncommittedInput?.(false))throw new Error('请先保存或放弃当前编辑，再切换工作空间');
  // Keep the previous account/space captured in core.js until the reload.
  if(studio&&studio.save()===false)throw new Error('无法保存当前工作空间，请先导出备份');
  if(studio&&window.StudioAuth.stopWorkspace('space-switch')===false)throw new Error('本地任务已停止，但保存未完成；仍在原空间，请导出备份后重试。');
  state.active=spaceId;
  try{write(id,state);}catch(error){throw new Error('本地任务已停止，但空间切换未保存；仍在原空间，请检查浏览器存储后重试。',{cause:error});}
  location.hash='#home';
  location.reload();
  return true;
 }
 function archive(spaceId,archived=true){
  const id=owner();if(!id)throw new Error('请先登录账户');
  const state=read(id),target=state.spaces.find(s=>s.id===spaceId);
  if(!target||spaceId===DEFAULT_ID||spaceId===state.active)throw new Error('默认空间和当前空间不能归档，请先切换空间');
  target.archived=!!archived;write(id,state);return target;
 }
 function canDelete(spaceId){
  const id=owner();if(!id)return false;
  const state=read(id),target=state.spaces.find(s=>s.id===spaceId);
  return !!target?.archived&&spaceId!==DEFAULT_ID&&spaceId!==state.active&&localStorage.getItem(storageKey(id,spaceId))===null&&localStorage.getItem('peachagent-projects-v1::'+id+'::'+spaceId)===null;
 }
 function remove(spaceId){
  if(!canDelete(spaceId))throw new Error('只能删除没有项目目录和已保存数据的归档空间');
  const id=owner(),state=read(id);state.spaces=state.spaces.filter(s=>s.id!==spaceId);write(id,state);
 }
 function attach(S){
  const show=()=>{
   const current=active();if(!current)return;
   const esc=S.escape;
   const rows=list().map(s=>'<div class="space-choice'+(s.active?' active':'')+'"><button type="button" class="space-info" data-action="space-open" data-id="'+esc(s.id)+'" '+(s.active||s.archived?'disabled':'')+'><strong data-no-i18n>'+esc(s.name)+'</strong><small>'+(s.active?'当前空间':s.archived?'已归档':s.id===DEFAULT_ID?'默认空间':'独立空间')+'</small></button><button type="button" class="btn btn-ghost btn-sm" data-action="space-rename" data-id="'+esc(s.id)+'">重命名</button>'+(s.id!==DEFAULT_ID&&!s.active?S.btn(s.archived?'恢复':'归档','space-archive',{small:true,variant:'secondary',attrs:'data-id="'+esc(s.id)+'"'}) :'')+(s.archived&&canDelete(s.id)?S.btn('删除空空间','space-delete',{small:true,variant:'danger',attrs:'data-id="'+esc(s.id)+'"'}) :'')+'</div>').join('');
   S.modal({title:'切换工作空间',subtitle:'每个空间的智能体、模型、任务与评测数据独立保存在当前浏览器。',body:'<div class="space-list">'+rows+'</div><p class="small muted" style="margin-top:16px">本地原型不包含云端同步、协作成员或真正的多租户授权。</p>',footer:S.btn('关闭','modal-close',{variant:'secondary'})+S.btn('创建空间','space-create',{icon:'plus'})});
   window.StudioAppearance?.localize(document.getElementById('app-dialog'));
  };
  S.action('space-manager',show);
  S.action('space-archive',el=>{try{const item=list().find(s=>s.id===el.dataset.id);archive(item.id,!item.archived);show();}catch(error){S.toast(error.message,'warning');}});
  S.action('space-delete',el=>S.modal({title:'删除空工作空间？',subtitle:'仅删除未保存项目和业务数据的归档空间目录项。',footer:S.btn('取消','modal-close',{variant:'secondary'})+S.btn('删除','space-delete-confirm',{variant:'danger',attrs:'data-id="'+S.escape(el.dataset.id)+'"'})}));
  S.action('space-delete-confirm',el=>{try{remove(el.dataset.id);show();}catch(error){S.toast(error.message,'warning');}});
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
 window.StudioSpaces={owner,read,active,list,create,rename,archive,canDelete,remove,switchTo,storageKey,attach,DEFAULT_ID};
})();
