(function () {
  'use strict';
  const S = window.Studio, E = S.escape;
  const T = (zh,en) => window.StudioAppearance?.getLocale() === 'en-US' ? en : zh;
  const kindName = kind => kind === 'model' ? T('模型凭证','Model credential') : T('工具凭证','Tool credential');
  const records = () => S.state.credentialRegistry || (S.state.credentialRegistry = []);
  const valid = (kind, ref) => kind === 'model' ? /^(env|vault|secret):[a-zA-Z][a-zA-Z0-9_./-]{0,119}$/.test(ref) : kind === 'tool' && /^(?:(?:secretRef\.|oauthRef\.|credentialRef\.)[a-zA-Z0-9_.-]{1,80}|cred-[a-zA-Z0-9_.-]{1,80})$/.test(ref);
  const owners = kind => kind === 'model' ? (S.Models?.providers() || []).filter(x=>!x.archived) : (S.Runtime?.connections || []);
  const find = (kind,ref) => records().find(x=>x.kind===kind&&x.ref===ref);
  const fail = (code,message) => { throw Object.assign(new Error(message),{code}); };
  function mutate(fn) {
    const old=JSON.parse(JSON.stringify(records()));
    try {
      const result=fn();
      if(S.save()===false)fail('STORAGE_UNAVAILABLE',T('凭证元数据保存失败','Credential metadata was not saved'));
      return result;
    } catch(error) { S.state.credentialRegistry=old; throw error; }
  }
  function list() {
    const result=records().map(x=>({...x}));
    for(const kind of ['model','tool'])for(const owner of owners(kind)){
      const ref=owner.credentialRef;
      if(ref&&!result.some(x=>x.kind===kind&&x.ref===ref))result.push({kind,ref,name:ref,status:'active',revision:1,createdAt:null,verifiedAt:null,legacy:true});
    }
    return result.map(item=>({...item,bindings:owners(item.kind).filter(x=>x.credentialRef===item.ref).map(x=>({id:x.id,name:x.name,kind:x.kind,pluginId:x.pluginId}))}));
  }
  function register(kind,ref,name) {
    ref=String(ref||'').trim();name=String(name||'').trim();
    if(!valid(kind,ref))fail('CREDENTIAL_REFERENCE_INVALID',T('只允许受支持的凭证引用格式，不能填写密钥正文','Use a supported reference, not the secret value'));
    if(!name||name.length>80)fail('CREDENTIAL_NAME_INVALID',T('名称须为 1–80 个字符','Name must contain 1–80 characters'));
    if(find(kind,ref))fail('CREDENTIAL_EXISTS',T('该引用已登记','Reference already exists'));
    return mutate(()=>{const entry={kind,ref,name,status:'active',revision:1,createdAt:Date.now(),verifiedAt:null};records().push(entry);return entry;});
  }
  function isUsable(kind,ref){return !ref||find(kind,ref)?.status!=='revoked';}
  function assertUsable(kind,ref){if(!isUsable(kind,ref))fail('CREDENTIAL_REVOKED',T('凭证引用已撤销，请绑定新的有效引用','Credential reference revoked; bind an active reference'));}
  function change(kind,ref,operation) {
    const existing=list().find(x=>x.kind===kind&&x.ref===ref);
    if(!existing)fail('CREDENTIAL_MISSING',T('凭证引用不存在','Credential reference not found'));
    if(operation!=='revoke')assertUsable(kind,ref);
    if(operation==='verify'&&!valid(kind,ref))fail('CREDENTIAL_REFERENCE_INVALID',T('引用格式无效','Invalid reference format'));
    return mutate(()=>{
      let entry=find(kind,ref);
      if(!entry){entry={kind,ref,name:existing.name,status:'active',revision:1,createdAt:Date.now(),verifiedAt:null};records().push(entry);}
      if(operation==='rotate'){entry.revision++;entry.verifiedAt=null;entry.rotatedAt=Date.now();}
      else if(operation==='revoke'){entry.status='revoked';entry.revokedAt=Date.now();}
      else if(operation==='verify'){entry.verifiedAt=Date.now();}
      return entry;
    });
  }
  function bind(kind,ref,ownerId){
    assertUsable(kind,ref);
    if(!valid(kind,ref)||!list().some(x=>x.kind===kind&&x.ref===ref))fail('CREDENTIAL_MISSING',T('请先登记有效引用','Register a valid reference first'));
    const owner=owners(kind).find(x=>x.id===ownerId);
    if(!owner)fail('CONNECTION_NOT_FOUND',T('连接不存在','Connection not found'));
    if(kind==='model')return S.Models.saveProvider({...owner,auth:'reference',credentialRef:ref});
    const old={...owner};Object.assign(owner,{credentialRef:ref,authMode:'reference',authType:'reference',status:owner.enabled===false?'disabled':'unverified',lastTest:null});
    if(S.save()===false){Object.assign(owner,old);fail('STORAGE_UNAVAILABLE',T('连接未保存','Connection was not saved'));}
    return owner;
  }
  const attrs=(kind,ref)=>'data-kind="'+E(kind)+'" data-ref="'+E(ref)+'"';
  const safe=fn=>el=>{try{return fn(el);}catch(error){S.toast(error.message,'warning');}};
  const option=(value,label)=>'<option value="'+E(value)+'">'+E(label)+'</option>';
  function refresh(){S.closeModal();S.render();}
  function render(){
    const items=list(),rows=items.map(item=>'<div class="space-choice"><div class="space-info"><strong data-no-i18n>'+E(item.name)+'</strong><small>'+E(kindName(item.kind))+' · <span class="mono" data-no-i18n>'+E(item.ref)+'</span> · r'+item.revision+'</small><small>'+E(item.bindings.map(x=>x.name).join('、')||T('未绑定连接','Not bound'))+'</small><small>'+E(item.verifiedAt?T('引用格式已校验（非真实连接）','Reference format checked (not a live connection)'):T('未校验','Not verified'))+'</small></div><div class="row" style="flex-wrap:wrap">'+S.badge(item.status==='revoked'?T('已撤销','Revoked'):T('有效','Active'),item.status==='revoked'?'danger':'success')+(item.status==='revoked'?'':S.btn(T('绑定连接','Bind'),'cred-bind',{variant:'secondary',small:true,attrs:attrs(item.kind,item.ref)})+S.btn(T('验证','Verify'),'cred-verify',{variant:'ghost',small:true,attrs:attrs(item.kind,item.ref)})+S.btn(T('轮换','Rotate'),'cred-rotate',{variant:'ghost',small:true,attrs:attrs(item.kind,item.ref)})+S.btn(T('撤销','Revoke'),'cred-revoke',{variant:'danger',small:true,attrs:attrs(item.kind,item.ref)}))+'</div></div>').join('');
    return S.header('CREDENTIALS',T('凭证中心','Credentials'),T('统一管理当前项目的模型与工具凭证引用，不存放密钥正文。','Manage model and tool credential references in this project; no secret values are stored.'),S.btn(T('添加凭证引用','Add reference'),'cred-create',{icon:'plus'}))+'<section class="panel panel-pad"><div class="notice">'+E(T('原型仅模拟引用登记、格式校验、轮换记录和撤销。实际供应商密钥由外部系统管理；应用 API Key 在「发布与 API」单独维护。','This prototype simulates reference registration, format checks, rotation records and revocation. Real secrets are managed externally; application API keys are separate.'))+' <a href="#services">'+E(T('应用 API Key','Application API keys'))+'</a></div><div class="space-list" style="margin-top:16px">'+(rows||S.empty(T('还没有凭证引用','No references'),T('登记引用后即可绑定连接。','Register a reference to bind it to a connection.')) )+'</div></section>';
  }
  S.page('credentials',{title:'凭证中心',section:'资源管理',render});
  S.action('cred-create',()=>S.modal({title:T('添加凭证引用','Add credential reference'),subtitle:T('只填写外部保管系统的标识，不输入真实密钥。','Enter only the external secret reference, never the secret.'),body:'<div class="field"><label class="field-label" for="cred-kind">'+E(T('用途','Purpose'))+'</label><select class="select" id="cred-kind">'+option('model',kindName('model'))+option('tool',kindName('tool'))+'</select></div>'+S.field(T('名称','Name'),{id:'cred-name',required:true})+S.field(T('凭证引用','Credential reference'),{id:'cred-ref',required:true,placeholder:'env:MODEL_API_KEY / secretRef.tool',help:T('模型：env:、vault:、secret:；工具：secretRef.、oauthRef.、credentialRef.、cred-。','Model: env:, vault:, secret:; tool: secretRef., oauthRef., credentialRef., cred-.')}),footer:S.btn('取消','modal-close',{variant:'secondary'})+S.btn('保存','cred-create-confirm')}));
  S.action('cred-create-confirm',safe(()=>{register(document.getElementById('cred-kind').value,document.getElementById('cred-ref').value,document.getElementById('cred-name').value);refresh();}));
  S.action('cred-bind',safe(el=>{const {kind,ref}=el.dataset;assertUsable(kind,ref);const items=owners(kind);if(!items.length){S.toast(T('请先创建连接','Create a connection first'),'warning');return;}S.modal({title:T('绑定连接','Bind connection'),subtitle:ref,body:'<div class="field"><label class="field-label" for="cred-owner">'+E(T('目标连接','Target connection'))+'</label><select class="select" id="cred-owner">'+items.map(x=>option(x.id,x.name)).join('')+'</select></div><p class="small muted">'+E(T('替换该连接的当前引用；绑定后需要重新验证连接。','Replace its current reference; revalidate the connection afterward.'))+'</p>',footer:S.btn('取消','modal-close',{variant:'secondary'})+S.btn('保存','cred-bind-confirm',{attrs:attrs(kind,ref)})});}));
  S.action('cred-bind-confirm',safe(el=>{bind(el.dataset.kind,el.dataset.ref,document.getElementById('cred-owner').value);refresh();}));
  S.action('cred-verify',safe(el=>{change(el.dataset.kind,el.dataset.ref,'verify');S.render();S.toast(T('引用格式校验通过，未调用外部服务','Reference format verified; no external call made'));}));
  for(const operation of ['rotate','revoke']){
    S.action('cred-'+operation,safe(el=>{const {kind,ref}=el.dataset,item=list().find(x=>x.kind===kind&&x.ref===ref);if(!item)return;S.modal({title:operation==='rotate'?T('记录一次凭证轮换？','Record a credential rotation?'):T('撤销凭证引用？','Revoke credential reference?'),subtitle:ref,body:'<p>'+E(operation==='rotate'?T('记录引用修订，实际密钥请在外部保管系统轮换。','Record the reference revision; rotate the actual secret externally.'):T('撤销后阻止使用此引用的新模型或工具调用，包括审批后继续执行的动作。','Revocation blocks new model or tool calls using the reference, including resumed approval actions.'))+'</p><p class="small muted">'+E(T('受影响连接：','Affected connections: ')+item.bindings.map(x=>x.name).join('、'))+'</p>',footer:S.btn('取消','modal-close',{variant:'secondary'})+S.btn(operation==='rotate'?T('确认轮换','Confirm rotation'):T('确认撤销','Confirm revocation'),'cred-'+operation+'-confirm',{variant:operation==='revoke'?'danger':'primary',attrs:attrs(kind,ref)})});}));
    S.action('cred-'+operation+'-confirm',safe(el=>{change(el.dataset.kind,el.dataset.ref,operation);refresh();}));
  }
  S.Credentials={list,register,bind,change,isUsable,assertUsable,valid};
})();
