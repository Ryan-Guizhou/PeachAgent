(function () {
  'use strict';
  const DEFAULT_ID = 'default', LIMIT = 30;
  const space = () => window.StudioSpaces?.active();
  const fail = message => { throw new Error(message); };
  const registryKey = current => 'peachagent-projects-v1::' + current.owner + '::' + current.id;
  const storageKey = (current, id) => current.storageKey + (id === DEFAULT_ID ? '' : '::project::' + id);
  const nameOf = value => {
    const name = String(value || '').trim();
    if (!name || name.length > 60) fail('项目名称须为 1–60 个字符');
    return name;
  };
  function read(current = space()) {
    if (!current) return null;
    const initial = { schema: 1, active: DEFAULT_ID, items: [{ id: DEFAULT_ID, name: '默认项目', archived: false, createdAt: 0 }] };
    let raw;
    try { raw = localStorage.getItem(registryKey(current)); } catch (_) { return initial; }
    if (!raw) return initial;
    let saved;
    try { saved = JSON.parse(raw); } catch (_) { fail('项目目录已损坏，请先备份浏览器数据'); }
    if (saved?.schema !== 1 || !Array.isArray(saved.items)) fail('项目目录版本不受支持');
    const ids = new Set();
    const items = saved.items.filter(item => {
      if (!item || !/^(default|project-[a-f0-9]{24})$/.test(item.id) || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 60 || ids.has(item.id)) return false;
      ids.add(item.id); return true;
    }).map(item => ({ id: item.id, name: item.name, archived: item.id !== DEFAULT_ID && !!item.archived, createdAt: Number(item.createdAt) || 0 }));
    if (!ids.has(DEFAULT_ID)) items.unshift(initial.items[0]);
    return { schema: 1, active: items.some(item => item.id === saved.active && !item.archived) ? saved.active : DEFAULT_ID, items };
  }
  function save(current, registry) { localStorage.setItem(registryKey(current), JSON.stringify(registry)); }
  function required() { const current = space(); if (!current) fail('请先登录并选择工作空间'); return current; }
  function list() { const r = read(); return r ? r.items.map(item => ({ ...item, active: item.id === r.active })) : []; }
  function active() {
    const current = space(); if (!current) return null;
    const r = read(current), item = r.items.find(x => x.id === r.active);
    return { ...item, spaceId: current.id, storageKey: storageKey(current, item.id) };
  }
  function create(value) {
    const current = required(), r = read(current), name = nameOf(value);
    if (r.items.length >= LIMIT) fail('每个本地空间最多支持 30 个项目');
    if (r.items.some(item => item.name === name)) fail('项目名称已存在');
    const bytes = new Uint8Array(12); window.crypto.getRandomValues(bytes);
    const item = { id: 'project-' + Array.from(bytes, n => n.toString(16).padStart(2, '0')).join(''), name, archived: false, createdAt: Date.now() };
    r.items.push(item); save(current, r); return item;
  }
  function rename(id, value) {
    const current = required(), r = read(current), item = r.items.find(x => x.id === id), name = nameOf(value);
    if (!item) fail('项目不存在');
    if (r.items.some(x => x.id !== id && x.name === name)) fail('项目名称已存在');
    item.name = name; save(current, r); return item;
  }
  function archive(id, archived = true) {
    const current = required(), r = read(current), item = r.items.find(x => x.id === id);
    if (!item || id === DEFAULT_ID || id === r.active) fail('默认项目和当前项目不能归档，请先切换项目');
    item.archived = !!archived; save(current, r); return item;
  }
  function canDelete(id) {
    const current = required(), r = read(current), item = r.items.find(x => x.id === id);
    return !!item?.archived && id !== r.active && id !== DEFAULT_ID && localStorage.getItem(storageKey(current, id)) === null;
  }
  function remove(id) {
    if (!canDelete(id)) fail('只能删除从未保存过数据的已归档项目；其他项目保留历史记录');
    const current = required(), r = read(current);
    r.items = r.items.filter(x => x.id !== id); save(current, r);
  }
  function switchTo(id) {
    const current = required(), r = read(current);
    if (!r.items.some(x => x.id === id && !x.archived)) fail('项目不存在或已归档');
    if (r.active === id) return false;
    const S = window.Studio;
    if (S?.dirty || window.StudioAppearance?.hasUncommittedInput?.(false)) fail('请先保存或放弃当前编辑');
    if (S && S.save() === false) fail('无法保存当前项目，请先导出备份');
    if (S && window.StudioAuth.stopWorkspace('project-switch') === false) fail('任务停止后保存未完成，仍在原项目');
    r.active = id;
    try { save(current, r); } catch (_) { fail('项目切换未保存，仍在原项目；已停止的任务不会自动恢复'); }
    location.hash = '#home'; location.reload(); return true;
  }
  function sourceState(projectId) {
    const current = required(), r = read(current), source = r.items.find(x => x.id === projectId && !x.archived && x.id !== r.active);
    if (!source) fail('来源项目不存在、已归档或为当前项目');
    try { return JSON.parse(localStorage.getItem(storageKey(current, source.id)) || 'null'); } catch (_) { fail('来源项目数据无法读取'); }
  }
  function importable(projectId) {
    const data = sourceState(projectId);
    return (data?.contentStore?.contents || []).filter(item => ['prompt', 'skill'].includes(item.type) && item.status !== 'archived' && item.version).map(item => ({ id: item.id, name: item.name, type: item.type, version: item.version }));
  }
  function importContent(projectId, itemId, version, name) {
    const allowed = importable(projectId).find(item => item.id === itemId && item.version === version);
    if (!allowed) fail('来源版本已变化，请重新选择');
    const item = sourceState(projectId)?.contentStore?.contents?.find(x => x.id === itemId && x.version === version);
    if (!item) fail('来源版本不存在');
    const S = window.Studio;
    return S.ContentStore.saveContent({ type: item.type, name: name || item.name, content: item.content, description: item.description, tags: item.tags, dependencies: item.dependencies, origin: { projectId, resourceId: itemId, version } });
  }
  function attach(S) {
    const E = S.escape, T = (zh, en) => window.StudioAppearance?.getLocale() === 'en-US' ? en : zh;
    const attr = id => 'data-id="' + E(id) + '"';
    const safe = fn => el => { try { return fn(el); } catch (error) { S.toast(error.message, 'warning'); } };
    const label = (zh, en) => E(T(zh,en));
    const link = (route, title, count) => '<a class="btn btn-secondary" href="#' + route + '">' + E(title) + ' · ' + count + '</a>';
    const summary = () => [
      ['agents',T('智能体','Agents'),S.state.agents?.length || 0],['workflows',T('工作流','Workflows'),S.Runtime?.flows.length || 0],
      ['models',T('模型','Models'),S.Models?.list().length || 0],['capabilities',T('工具连接','Tool connections'),S.Runtime?.connections.length || 0],
      ['knowledge',T('知识库','Knowledge'),S.ContentStore?.listKnowledge().length || 0],['library',T('Prompt / Skill','Prompts / Skills'),S.ContentStore?.listContent().length || 0],
      ['quality',T('质量评测','Evaluations'),S.Quality?.datasets?.length || S.state.qualityData?.datasets?.length || 0],['tasks',T('运行','Runs'),S.state.runs?.length || 0]
    ].map(([route,title,count]) => link(route,title,count)).join('');
    function refresh() { S.closeModal(); S.render(); }
    function nameDialog(item) {
      S.modal({title: item ? T('重命名项目','Rename project') : T('创建项目','Create project'), subtitle:T('新项目从独立的示例数据开始，切换后不会沿用其他项目的配置。','New projects start with separate sample data.'), body:S.field(T('项目名称','Project name'),{id:'project-name-input',name:'name',value:item?.name||'',required:true}), footer:S.btn('取消','modal-close',{variant:'secondary'})+S.btn('保存','project-name-save',{attrs:attr(item?.id||'')})});
      document.getElementById('project-name-input')?.focus();
    }
    S.page('projects',{title:'项目管理',section:'构建与发布',render(){
      const current = active(), items = list();
      if (!current) return S.empty(T('请先登录','Sign in first'),T('登录后维护项目。','Sign in to manage projects.'));
      const rows = items.map(item => '<div class="space-choice' + (item.active?' active':'') + '"><div class="space-info"><strong data-no-i18n>'+E(item.name)+'</strong><small>'+label(item.active?'当前项目':item.archived?'已归档':item.id===DEFAULT_ID?'默认项目':'独立项目',item.active?'Current project':item.archived?'Archived':item.id===DEFAULT_ID?'Default project':'Independent project')+'</small></div><div class="row" style="flex-wrap:wrap">'+
        (!item.active&&!item.archived?S.btn(T('切换','Switch'),'project-switch',{small:true,attrs:attr(item.id)}):'')+
        S.btn(T('重命名','Rename'),'project-rename',{small:true,variant:'ghost',attrs:attr(item.id)})+
        (item.id!==DEFAULT_ID&&!item.active?S.btn(item.archived?T('恢复','Restore'):T('归档','Archive'),'project-archive',{small:true,variant:'secondary',attrs:attr(item.id)}):'')+
        (item.archived&&canDelete(item.id)?S.btn(T('删除空项目','Delete empty project'),'project-delete',{small:true,variant:'danger',attrs:attr(item.id)}):'')+'</div></div>').join('');
      return S.header('PROJECTS',T('项目管理','Projects'),T('在当前工作空间内组织独立的应用、资源和运行记录。','Organize independent apps, resources and runs in this workspace.'),S.btn(T('创建项目','Create project'),'project-create',{icon:'plus'}))+
        '<div class="panel panel-pad"><div class="between"><div><h2>'+label('当前项目','Current project')+'</h2><p data-no-i18n class="muted">'+E(current.name)+'</p></div>'+S.btn(T('导入资源副本','Import resource copy'),'project-import',{variant:'secondary',icon:'download'})+'</div><div class="row" style="flex-wrap:wrap;margin-top:16px">'+summary()+'</div><p class="small muted" style="margin-top:12px">'+label('模型、工具、知识和内容在项目内通过原有管理页维护；跨项目仅显式复制 Prompt / Skill 固定版本，不复制凭证或任务。','Manage models, tools, knowledge and content in their original pages. Cross-project imports copy only explicit Prompt / Skill versions, never credentials or runs.')+'</p></div><section class="panel panel-pad" style="margin-top:16px"><h2>'+label('全部项目','All projects')+'</h2><div class="space-list" style="margin-top:12px">'+rows+'</div><p class="small muted" style="margin-top:12px">'+label('归档保留所有历史。只有从未保存过数据的已归档项目可以删除。切换项目会停止本地执行并回到工作台。','Archiving preserves history. Only unused archived projects can be deleted. Switching stops local runs and returns to the dashboard.')+'</p></section>';
    }});
    S.action('project-create',()=>nameDialog(null));
    S.action('project-rename',safe(el=>{const item=list().find(x=>x.id===el.dataset.id);if(!item)fail('项目不存在');nameDialog(item);}));
    S.action('project-name-save',safe(el=>{const value=document.getElementById('project-name-input')?.value;el.dataset.id?rename(el.dataset.id,value):create(value);refresh();S.toast(T('项目已保存','Project saved'));}));
    S.action('project-switch',safe(el=>switchTo(el.dataset.id)));
    S.action('project-archive',safe(el=>{const item=list().find(x=>x.id===el.dataset.id);if(!item)fail('项目不存在');archive(item.id,!item.archived);refresh();}));
    S.action('project-delete',safe(el=>{const id=el.dataset.id;S.modal({title:T('删除空项目？','Delete empty project?'),subtitle:T('仅删除从未保存数据的项目目录项。','Only the unused registry entry will be removed.'),footer:S.btn('取消','modal-close',{variant:'secondary'})+S.btn('删除','project-delete-confirm',{variant:'danger',attrs:attr(id)})});}));
    S.action('project-delete-confirm',safe(el=>{remove(el.dataset.id);refresh();}));
    S.action('project-import',safe(()=>{
      const items=list().filter(x=>!x.active&&!x.archived).flatMap(project=>importable(project.id).map(item=>({project,item})));
      if(!items.length){S.toast(T('没有其他项目中可导入的 Prompt / Skill','No importable Prompt / Skill in other projects'),'info');return;}
      S.modal({title:T('导入资源副本','Import resource copy'),subtitle:T('选择同一空间中的来源项目和固定版本，不会建立跨项目运行权限。','Choose a source project and version in this workspace. No runtime permissions are shared.'),body:'<div class="field"><label class="field-label" for="project-import-source">'+label('来源项目 / 资源 / 版本','Source project / resource / version')+'</label><select class="select" id="project-import-source">'+items.map(({project,item})=>'<option value="'+E(JSON.stringify([project.id,item.id,item.version]))+'">'+E(project.name+' / '+item.name+' / '+item.version)+'</option>').join('')+'</select></div>'+S.field(T('副本名称','Copy name'),{id:'project-import-name',placeholder:T('留空使用来源名称','Leave empty to use source name')}),footer:S.btn('取消','modal-close',{variant:'secondary'})+S.btn(T('导入副本','Import copy'),'project-import-confirm')});
    }));
    S.action('project-import-confirm',safe(()=>{const values=JSON.parse(document.getElementById('project-import-source').value);const item=importContent(...values,document.getElementById('project-import-name').value.trim());S.closeModal();S.go('content-detail',{id:item.id});S.toast(T('已导入固定版本副本','Versioned copy imported'));}));
  }
  window.StudioProjects = { read, list, active, create, rename, archive, canDelete, remove, switchTo, importable, importContent, storageKey, attach, DEFAULT_ID };
})();
