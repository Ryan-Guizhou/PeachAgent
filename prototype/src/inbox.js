(function () {
  'use strict';
  const S=window.Studio,E=S.escape;
  const T=(zh,en)=>window.StudioAppearance?.getLocale()==='en-US'?en:zh;
  function list(){
    const run=(S.pendingRuns?.()||[]).map(r=>({kind:'run',id:r.id,title:r.title,detail:r.pending?.title||T('运行等待确认','Run awaits approval'),actionable:true}));
    const keys=(S.Publishing?.requests||[]).filter(x=>x.status==='pending').map(r=>({kind:'key',id:r.id,appId:r.appId,title:r.name,detail:S.Publishing.apps.find(a=>a.id===r.appId)?.name||T('应用服务','Application'),actionable:S.Publishing.actor==='owner'}));
    const reviews=(S.state.reviews||[]).filter(r=>r.status==='pending'&&(S.state.role==='admin'||r.author==='我')).map(r=>({kind:'review',id:r.id,title:r.name,detail:'v'+(r.version||'1.0.0'),actionable:S.state.role==='admin'}));
    return [...run,...keys,...reviews];
  }
  const sections=[['run','运行审批','Run approvals'],['key','API Key 申请','API Key requests'],['review','公共资源审核','Public resource reviews']];
  function render(){
    const entries=list();
    return S.header('INBOX',T('待办与审批','Inbox & approvals'),T('统一查看待办，分别进入原有业务流程；审批权限和状态不会互相替代。','Review work in one place. Each approval keeps its original state and permissions.'))+
      '<div class="notice">'+E(T('当前项目 · 本地演示。应用申请审批仅在所有者视角可操作，公共审核仅管理员可操作。','Current project · local demo. API requests require the owner view; public reviews require the admin view.'))+'</div>'+
      sections.map(([kind,zh,en])=>{const items=entries.filter(x=>x.kind===kind);return '<section class="panel panel-pad" style="margin-top:16px"><div class="between"><h2>'+E(T(zh,en))+'</h2>'+S.badge(String(items.length),'neutral')+'</div><div class="space-list" style="margin-top:12px">'+(items.length?items.map(x=>'<div class="space-choice"><div class="space-info"><strong data-no-i18n>'+E(x.title)+'</strong><small data-no-i18n>'+E(x.detail)+'</small></div><div class="row">'+S.badge(x.actionable?T('待处理','Action required'):T('等待审批','Awaiting review'),x.actionable?'warning':'neutral')+S.btn(x.actionable?T('查看并处理','Review'):T('查看详情','View details'),'inbox-open',{variant:'secondary',small:true,attrs:'data-kind="'+E(x.kind)+'" data-id="'+E(x.id)+'"'})+'</div></div>').join(''):S.empty(T('暂无待办','No pending items'),T('这里会显示需要处理的申请。','Pending items will appear here.')) )+'</div></section>';}).join('');
  }
  S.page('inbox',{title:'待办与审批',section:'运行与改进',render});
  S.action('notifications',()=>S.go('inbox'));
  S.action('inbox-open',el=>{const item=list().find(x=>x.kind===el.dataset.kind&&x.id===el.dataset.id);if(!item){S.toast(T('待办状态已变化','Item has changed'),'warning');S.render();return;}if(item.kind==='run')S.go('task',{id:item.id});else if(item.kind==='key')S.go('service',{id:item.appId,tab:'keys'});else S.go('review');});
  S.Inbox={list,count:()=>list().filter(x=>x.actionable).length};
})();
