<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDialogFocus } from './composables/useDialogFocus'
import { useSession, requestKey, utcString, localTime, type Row } from './api'
import UsageOverview from './components/UsageOverview.vue'
const s=useSession(),route=useRoute(),router=useRouter()
const page=computed(()=>String(route.name||'home'))
const tr=(zh:string,en:string)=>s.locale==='en-US'?en:zh
const nav=computed(()=>[
  [tr('工作空间','Workspace'),[['home',tr('工作台','Overview'),'◫'],['projects',tr('空间与项目','Projects'),'▤'],['chat',tr('模型对话','Chat'),'○']]],
  [tr('资源管理','Resources'),[['models',tr('模型中心','Models'),'◇'],['credentials',tr('凭证中心','Credentials'),'⌁'],['prompts',tr('提示词','Prompts'),'≡'],['plugins',tr('插件声明','Plugin manifests'),'▧']]],
  [tr('运行与改进','Operations'),[['runs',tr('运行记录','Runs'),'▷'],['usage',tr('用量与预算','Usage & budgets'),'◷'],['settings',tr('设置','Settings'),'⚙']]]
] as [string,string[][]][])
const title=computed(()=>nav.value.flatMap(x=>x[1]).find(x=>x[0]===page.value)?.[1]||'Studio')
const loading=ref(true),busy=ref(false),error=ref(''),notice=ref(''),mobile=ref(false)
const usageRevision=ref(0)
const auth=ref('login'),email=ref(''),password=ref(''),token=ref(''),name=ref(''),remember=ref(false),currency=ref('USD')
const rows=ref<Row[]>([]),providers=ref<Row[]>([]),credentials=ref<Row[]>([]),protocols=ref<Row[]>([]),bindings=ref<Row[]>([]),defaults=ref<Row[]>([]),budgets=ref<Row[]>([]),calls=ref<Row[]>([]),conversations=ref<Row[]>([]),messages=ref<Row[]>([]),versions=ref<Row[]>([]),references=ref<Row[]>([]),events=ref<Row[]>([])
const conversation=ref(''),modelId=ref(''),promptVersionId=ref(''),variables=ref('{}'),chatText=ref(''),streamText=ref(''),activeRun=ref(''),runDetail=ref<Row|null>(null),selectedPrompt=ref<Row|null>(null)
const query=ref(''),edit=ref(''),form=ref<Row>({}),dirty=ref(false),stream=ref<EventSource|null>(null)
const previewText=ref<string|null>(null),manifestValid=ref(false)
const mediaUrl=ref(''),mediaType=ref('')
const selectedConversation=computed(()=>conversations.value.find(c=>c.id===conversation.value))
const canSend=computed(()=>selectedConversation.value?.status==='ACTIVE'&&!activeRun.value&&!selectedConversation.value?.activeRunId)
const streamState=ref<'idle'|'connecting'|'connected'|'reconnecting'>('idle')
const visibleMessages=computed(()=>messages.value.filter(m=>!(activeRun.value&&m.role==='ASSISTANT'&&m.status==='PENDING')))
const { dialogRef, rememberFocus }=useDialogFocus(edit,()=>closeEdit())
let generation=0,runSelection=0,conversationSelection=0,stopWatch:()=>void=()=>{},refreshTimer:number|undefined
const filtered=computed(()=>rows.value.filter(x=>JSON.stringify(x).toLocaleLowerCase().includes(query.value.toLocaleLowerCase())))
const descriptor=computed(()=>protocols.value.find(x=>x.protocol.key===form.value.protocolKey&&x.protocol.version===form.value.protocolVersion))
const activeBindings=computed(()=>bindings.value.filter(x=>x.status==='ACTIVE'&&x.enabled&&x.modelType==='LLM'))
const localeName=computed(()=>s.locale==='en-US'?'English':'简体中文')
watch(()=>s.theme,t=>document.documentElement.dataset.theme=t,{immediate:true})
watch(()=>s.locale,l=>document.documentElement.lang=l,{immediate:true})
function fail(e:unknown){error.value=e instanceof Error?e.message:String(e)}
async function action(fn:()=>Promise<unknown>){busy.value=true;error.value='';notice.value='';try{await fn();notice.value=tr('操作成功','Saved')}catch(e){fail(e)}finally{busy.value=false}}
function clearEdit(){edit.value='';form.value={};dirty.value=false;previewText.value=null;manifestValid.value=false}
function clearMedia(){if(mediaUrl.value)URL.revokeObjectURL(mediaUrl.value);mediaUrl.value='';mediaType.value=''}
function canLeave(){return !dirty.value||window.confirm(tr('放弃未保存的内容？','Discard unsaved changes?'))}
function closeEdit(){if(canLeave())clearEdit()}
function stopStream(){stream.value?.close();stream.value=null;streamState.value='idle'}
function clearPage(){generation++;runSelection++;conversationSelection++;stopStream();clearMedia();conversations.value=[];modelId.value='';promptVersionId.value='';chatText.value='';variables.value='{}';conversation.value='';activeRun.value='';streamText.value='';messages.value=[];runDetail.value=null;events.value=[];selectedPrompt.value=null;versions.value=[];rows.value=[];providers.value=[];credentials.value=[];bindings.value=[];defaults.value=[];references.value=[];calls.value=[];budgets.value=[];query.value='';clearEdit()}
async function refresh(){
 const g=++generation,wp=s.w,pp=s.p,where=page.value;const valid=()=>g===generation&&s.user&&wp===s.w&&pp===s.p&&where===page.value
 if(!s.user||!s.workspaceId||(!s.projectId&&!['projects','credentials','plugins','settings'].includes(where)))return
 error.value=''
 try{
   if(where==='home'){{const result=await s.request<Row[]>(pp+'/runs');if(valid())rows.value=result}}
   else if(where==='models'){const a=await Promise.all([s.request<Row[]>(wp+'/models'),s.request<Row[]>(wp+'/providers'),s.request<Row[]>(wp+'/credentials'),s.request<Row[]>('/model-protocols'),s.request<Row[]>(pp+'/model-bindings'),s.request<Row[]>(pp+'/model-defaults')]);if(!valid())return;[rows.value,providers.value,credentials.value,protocols.value,bindings.value,defaults.value]=a}
   else if(where==='credentials'){{const result=await s.request<Row[]>(wp+'/credentials');if(valid())rows.value=result}}
   else if(where==='prompts'){const result=await Promise.all([s.request<Row[]>(pp+'/prompts'),s.request<Row[]>(pp+'/prompt-references')]);if(valid())[rows.value,references.value]=result}
   else if(where==='plugins'){{const result=await s.request<Row[]>(wp+'/plugin-manifests');if(valid())rows.value=result}}
   else if(where==='chat'){const result=await Promise.all([s.request<Row[]>(pp+'/conversations'),s.request<Row[]>(pp+'/model-bindings'),s.request<Row[]>(pp+'/prompts'),s.request<Row[]>(pp+'/prompt-references')]);if(!valid())return;[conversations.value,bindings.value,rows.value,references.value]=result;if(!modelId.value||!activeBindings.value.some(x=>x.modelId===modelId.value))modelId.value=activeBindings.value[0]?.modelId||'';if(conversation.value)await openConversation(conversation.value)}
   else if(where==='runs'){const result=await s.request<Row[]>(pp+'/runs');if(valid())rows.value=result}
   else if(where==='usage'){const result=await Promise.all([s.request<Row[]>(pp+'/budgets'),s.request<Row[]>(pp+'/usage?from='+utcString(new Date(Date.now()-30*86400000))+'&to='+utcString(new Date(Date.now()+86400000)))]);if(valid()){[budgets.value,calls.value]=result;usageRevision.value++}}
 }catch(e){if(g===generation)fail(e)}
}
async function authSubmit(){
 await action(async()=>{
   if(auth.value==='login'){await s.login(email.value,password.value,remember.value);password.value='';token.value='';await refresh()}
   else if(auth.value==='register'){await s.request('/auth/register','POST',{email:email.value,token:token.value,password:password.value,displayName:name.value,currency:currency.value});auth.value='login';token.value='';password.value=''}
   else{await s.request('/auth/password-reset','POST',{email:email.value,token:token.value,password:password.value});auth.value='login';token.value='';password.value=''}
 })
}
async function challenge(){await action(()=>s.request('/auth/email-challenges','POST',{email:email.value,purpose:auth.value==='register'?'REGISTER':'RESET'}))}
async function logout(){if(!canLeave())return;await action(async()=>{await s.request('/auth/logout','POST',{});s.clear();clearPage()})}
async function switchSpace(event:Event){const el=event.target as HTMLSelectElement;if(!canLeave()){el.value=s.workspaceId;return}const value=el.value;clearPage();s.workspaceId=value;await s.loadProjects();await refresh()}
async function switchProject(event:Event){const el=event.target as HTMLSelectElement;if(!canLeave()){el.value=s.projectId;return}const value=el.value;clearPage();s.projectId=value;await refresh()}
async function preference(event:Event,type:string){const el=event.target as HTMLSelectElement;if(!canLeave()){el.value=type==='theme'?s.theme:s.locale;return}clearEdit();await action(()=>s.preferences(type==='locale'?el.value:s.locale,type==='theme'?el.value:s.theme))}
function startEdit(kind:string,x?:Row){
 if(!edit.value)rememberFocus()
 clearEdit();edit.value=kind
 if(kind==='workspace'||kind==='project')form.value={id:x?.id,name:x?.name||'',description:x?.description||'',rowVersion:x?.rowVersion??null}
 else if(kind==='credential')form.value={name:'',secretType:'BEARER',allowedOrigin:'https://api.openai.com',secret:''}
 else if(kind==='rotate')form.value={id:x?.id,secret:'',rowVersion:x?.rowVersion}
 else if(kind==='provider')form.value={id:x?.id,name:x?.name||'',vendorKey:x?.vendorKey||'',baseUrl:x?.baseUrl||'https://api.openai.com/v1',authMethod:x?.authMethod||'BEARER',credentialId:x?.credentialId||'',timeoutMs:x?.timeoutMs||60000,enabled:x?.enabled??true,protocolConfig:JSON.stringify(x?.protocolConfig||{},null,2),rowVersion:x?.rowVersion??null}
 else if(kind==='model'){const p=protocols.value[0];form.value={id:x?.id,providerId:x?.providerId||providers.value[0]?.id||'',name:x?.name||'',externalModelId:x?.externalModelId||'',modelType:x?.modelType||Object.keys(p?.operations||{})[0],protocolKey:x?.protocolKey||p?.protocol?.key,protocolVersion:x?.protocolVersion||p?.protocol?.version,enabled:x?.enabled??true,protocolOptions:JSON.stringify(x?.protocolOptions||{}),modelOptions:{...(x?.modelOptions||{})},pricing:JSON.stringify(x?.pricing||{},null,2),rowVersion:x?.rowVersion??null}}
 else if(kind==='prompt')form.value={id:x?.id,name:x?.name||'',description:x?.description||'',content:x?.draftContent||'',variables:JSON.stringify(x?.draftVariables||{},null,2),rowVersion:x?.rowVersion??null}
 else if(kind==='preview')form.value={id:x?.id,versionId:x?.versionId??null,name:x?.name||'',values:'{}'}
 else if(kind==='plugin')form.value={pluginKey:'',pluginVersion:'1.0.0',name:'',description:'',configSchema:'{"type":"object","properties":{}}',permissions:'[]',extensionPoints:'[]'}
 else if(kind==='budget')form.value={...x}
 else if(kind==='reference')form.value={sourceProjectId:'',versionId:'',alias:''}
 else if(kind==='debug')form.value={id:x?.id,modelType:x?.modelType,text:'',query:'',documents:'[]',audioBase64:''}
 dirty.value=false
}
function pickProtocol(event:Event){const d=protocols.value[Number((event.target as HTMLSelectElement).value)];if(!d)return;form.value.protocolKey=d.protocol.key;form.value.protocolVersion=d.protocol.version;form.value.modelType=Object.keys(d.operations)[0];form.value.modelOptions={};form.value.protocolOptions='{}';dirty.value=true}
async function fileAudio(event:Event){const file=(event.target as HTMLInputElement).files?.[0];if(!file)return;if(file.size>10*1024*1024){error.value=tr('音频最大 10 MiB','Maximum audio size is 10 MiB');return}form.value.audioBase64=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]||'');r.onerror=reject;r.readAsDataURL(file)});dirty.value=true}
function manifestPayload(f:Row){return {...f,configSchema:JSON.parse(f.configSchema),permissions:JSON.parse(f.permissions),extensionPoints:JSON.parse(f.extensionPoints)}}
async function validateManifest(){
 const scope=s.w, current=form.value
 await action(async()=>{await s.request(scope+'/plugin-manifests/validate','POST',manifestPayload(current));if(edit.value==='plugin'&&scope===s.w&&form.value===current)manifestValid.value=true})
}
async function previewPrompt(){
 const scope=s.p,current=form.value,values=current.values
 previewText.value=null
 await action(async()=>{
   const result=await s.request<{text:string}>(scope+'/prompts/'+current.id+'/preview','POST',{versionId:current.versionId,values:JSON.parse(values)})
   if(scope===s.p&&edit.value==='preview'&&form.value===current&&current.values===values)previewText.value=result.text
 })
}
async function save(){
 if(edit.value==='preview'){await previewPrompt();return}
 await action(async()=>{
   const f={...form.value},kind=edit.value;const method=f.id?'PATCH':'POST'
   if(kind==='workspace'||kind==='project'){const base=kind==='workspace'?'/workspaces':s.w+'/projects';await s.request(base+(f.id?'/'+f.id:''),method,{name:f.name,description:f.description,rowVersion:f.rowVersion});await s.loadSpaces(s.workspaceId)}
   else if(kind==='credential'){await s.request(s.w+'/credentials','POST',f)}
   else if(kind==='rotate'){await s.request(s.w+'/credentials/'+f.id+'/rotate','POST',{secret:f.secret,rowVersion:f.rowVersion})}
   else if(kind==='provider'){await s.request(s.w+'/providers'+(f.id?'/'+f.id:''),method,{...f,credentialId:f.authMethod==='NONE'?null:f.credentialId,protocolConfig:JSON.parse(f.protocolConfig)})}
   else if(kind==='model'){await s.request(s.w+'/models'+(f.id?'/'+f.id:''),method,{...f,capabilities:{},protocolOptions:JSON.parse(f.protocolOptions),pricing:JSON.parse(f.pricing)})}
   else if(kind==='prompt'){await s.request(s.p+'/prompts'+(f.id?'/'+f.id:''),method,{...f,variables:JSON.parse(f.variables)})}
   else if(kind==='plugin'){await s.request(s.w+'/plugin-manifests','POST',manifestPayload(f))}
   else if(kind==='budget'){await s.request(s.p+'/budgets/'+f.id,'PATCH',{maxCalls:f.maxCalls===''?null:f.maxCalls,maxTokens:f.maxTokens===''?null:f.maxTokens,maxCost:f.maxCost===''?null:f.maxCost,maxRunTokens:f.maxRunTokens===''?null:f.maxRunTokens,maxRunCost:f.maxRunCost===''?null:f.maxRunCost,maxConcurrency:f.maxConcurrency,maxRunSeconds:f.maxRunSeconds,rowVersion:f.rowVersion})}
   else if(kind==='reference'){await s.request(s.p+'/prompt-references','POST',f)}
   else if(kind==='debug'){const input=f.modelType==='RERANK'?{query:f.query,documents:JSON.parse(f.documents)}:{text:f.text};const r=await s.request<Row>(s.p+'/models/'+f.id+'/debug','POST',{input,audioBase64:f.audioBase64||null,maxOutputTokens:null},requestKey());clearEdit();await router.push('/runs');await showRun(r);return}
   clearEdit();await refresh()
 })
}
async function mutate(path:string,body:Row={},method='POST',confirm=false){if(confirm&&!window.confirm(tr('确认此操作？','Confirm this action?')))return;await action(async()=>{await s.request(path,method,body);if(page.value==='projects')await s.loadSpaces(s.workspaceId);await refresh()})}
async function publish(x:Row){await mutate(s.p+'/prompts/'+x.id+'/versions',{changeNote:'',rowVersion:x.rowVersion})}
async function showVersions(x:Row){
 selectedPrompt.value=x;versions.value=[]
 const scope=s.p,g=generation
 try{
   const result=await s.request<Row[]>(scope+'/prompts/'+x.id+'/versions')
   if(g===generation&&scope===s.p&&selectedPrompt.value?.id===x.id)versions.value=result
 }catch(e){if(g===generation&&scope===s.p&&selectedPrompt.value?.id===x.id)fail(e)}
}
async function changeConversation(c:Row,operation:'archive'|'restore'|'redact'){
 if(c.activeRunId)return
 if(operation==='redact'&&!window.confirm(tr('永久清除会话正文和运行输入？计量记录仍会保留。','Permanently clear conversation content and run inputs? Usage records will remain.')))return
 await mutate(s.p+'/conversations/'+c.id+'/'+operation,{rowVersion:c.rowVersion})
}
async function copyMessage(text:unknown){
 if(typeof text!=='string'||!text)return
 try{await navigator.clipboard.writeText(text);notice.value=tr('已复制','Copied');error.value=''}catch(e){fail(e)}
}
function reuseMessage(text:unknown){if(canSend.value&&typeof text==='string')chatText.value=text}
async function showMedia(artifactId:string){
 const scope=s.p,runId=runDetail.value?.id
 if(!runId)return
 clearMedia()
 await action(async()=>{
   const response=await fetch('/api/v1'+scope+'/runs/'+runId+'/artifacts/'+encodeURIComponent(artifactId),{credentials:'same-origin'})
   if(!response.ok)throw new Error(tr('产物不可用','Artifact unavailable'))
   const type=(response.headers.get('Content-Type')||'').split(';')[0]
   if(!['image/png','audio/wav'].includes(type))throw new Error(tr('不支持预览此格式','Preview format unsupported'))
   const blob=await response.blob()
   if(scope===s.p&&runDetail.value?.id===runId&&page.value==='runs'){clearMedia();mediaType.value=type;mediaUrl.value=URL.createObjectURL(blob)}
 })
}
async function newChat(){await action(async()=>{const c=await s.request<Row>(s.p+'/conversations','POST',{title:tr('新对话','New conversation')});await refresh();await openConversation(c.id)})}
async function openConversation(id:string){
 const selection=++conversationSelection,scope=s.p,g=generation
 const switching=conversation.value!==id
 if(switching){stopStream();messages.value=[];streamText.value='';activeRun.value='';chatText.value=''}
 conversation.value=id
 const valid=()=>selection===conversationSelection&&g===generation&&scope===s.p&&page.value==='chat'&&conversation.value===id
 try{
   const result=await s.request<Row[]>(scope+'/conversations/'+id+'/messages')
   if(!valid())return
   messages.value=result
   const current=conversations.value.find(x=>x.id===id)
   const runId=current?.activeRunId||''
   if(runId){
     if(activeRun.value!==runId||!stream.value){
       streamText.value=''
       subscribe(runId)
     }
   }else{stopStream();activeRun.value='';streamText.value=''}
 }catch(e){if(valid())fail(e)}
}
function subscribe(id:string,after=0){
 stopStream()
 activeRun.value=id;streamState.value=after?'reconnecting':'connecting'
 const scope=s.p,where=page.value,selected=conversation.value
 const source=new EventSource('/api/v1'+scope+'/runs/'+id+'/events?after='+after)
 stream.value=source
 const valid=()=>stream.value===source&&scope===s.p&&where===page.value&&(where!=='chat'||conversation.value===selected)
 let cursor=after
 source.onopen=()=>{if(valid())streamState.value='connected'}
 for(const kind of ['status','delta','result','terminal'])source.addEventListener(kind,(event:MessageEvent)=>{
   if(!valid())return
   const seq=Number(event.lastEventId)
   if(!Number.isSafeInteger(seq)||seq<=cursor)return
   if(seq!==cursor+1){stopStream();fail(new Error(tr('事件序列不连续，请刷新运行记录。','Event sequence gap; refresh the run history.')));return}
   let e:Row
   try{e=JSON.parse(event.data)}catch{stopStream();fail(new Error(tr('事件内容无效，请刷新。','Invalid event payload; refresh.')));return}
   cursor=seq
   if(where==='runs')events.value.push(e)
   if(kind==='delta'&&typeof e.payload?.text==='string')streamText.value+=e.payload.text
   if(kind==='terminal'){
     stopStream()
     if(where==='chat'){
       // 持久消息刷新完成后再释放当前会话的发送状态，避免显示重复的部分正文。
       void refresh()
     }else if(where==='runs'){
       activeRun.value=''
       void s.request<Row>(scope+'/runs/'+id).then(x=>{
         if(s.p===scope&&page.value==='runs'&&runDetail.value?.id===id)runDetail.value=x
       }).catch(error=>{if(s.p===scope&&page.value==='runs'&&runDetail.value?.id===id)fail(error)})
     }
   }
 })
 source.onerror=()=>{
   if(!valid())return
   streamState.value='reconnecting'
   void s.request<Row>(scope+'/runs/'+id).then(x=>{
     if(!valid()||activeRun.value!==id)return
     // 浏览器 EventSource 自行携带 Last-Event-ID 重连，避免重新提交模型。
     // 已终态且连接永久关闭时，聊天以持久消息为准。
     if(where==='chat'&&source.readyState===EventSource.CLOSED&&['SUCCEEDED','FAILED','CANCELLED','INTERRUPTED'].includes(x.status)){
       stopStream();void refresh()
     }
   }).catch(e=>{if(valid())fail(e)})
 }
}
async function send(){
 if(!chatText.value.trim()||!conversation.value||!modelId.value||!canSend.value)return
 const scope=s.p,id=conversation.value,selection=conversationSelection,text=chatText.value
 await action(async()=>{
   const r=await s.request<Row>(scope+'/conversations/'+id+'/runs','POST',{modelId:modelId.value,text,promptVersionId:promptVersionId.value||null,variables:JSON.parse(variables.value),maxOutputTokens:null},requestKey())
   if(scope!==s.p||page.value!=='chat'||conversation.value!==id||selection!==conversationSelection)return
   chatText.value='';streamText.value=''
   await refresh()
   if(scope===s.p&&page.value==='chat'&&conversation.value===id&&selectedConversation.value?.activeRunId===r.id&&!stream.value)subscribe(r.id)
 })
}
async function cancel(){if(activeRun.value)await mutate(s.p+'/runs/'+activeRun.value+'/cancel')}
async function showRun(x:Row){
 const scope=s.p,g=generation,selection=++runSelection
 stopStream();clearMedia();activeRun.value='';runDetail.value=null;events.value=[];streamText.value=''
 const valid=()=>g===generation&&scope===s.p&&page.value==='runs'&&selection===runSelection
 try{
   const result=await s.request<Row>(scope+'/runs/'+x.id)
   if(!valid())return
   runDetail.value=result;subscribe(x.id)
 }catch(e){if(valid())fail(e)}
}
async function retry(id:string){
 if(!window.confirm(tr('重试可能产生新的供应商费用。继续？','Retry may incur additional provider charges. Continue?')))return
 const scope=s.p,where=page.value,selected=conversation.value,selection=conversationSelection
 await action(async()=>{
   const r=await s.request<Row>(scope+'/runs/'+id+'/retry','POST',{acknowledgeUnknown:true},requestKey())
   if(scope!==s.p||page.value!==where||(where==='chat'&&(conversation.value!==selected||selection!==conversationSelection)))return
   if(where==='chat')await refresh()
   else await showRun(r)
 })
}
function onUnload(event:BeforeUnloadEvent){if(dirty.value){event.preventDefault();event.returnValue=''}}
onMounted(async()=>{try{await s.boot();await refresh()}catch(e){if(s.user)fail(e)}finally{loading.value=false}window.addEventListener('beforeunload',onUnload);stopWatch=router.beforeEach(()=>{if(!canLeave())return false;clearPage();mobile.value=false;return true})})
watch(page,()=>{void refresh()})
onBeforeUnmount(()=>{stopWatch();stopStream();clearMedia();window.removeEventListener('beforeunload',onUnload);if(refreshTimer)clearInterval(refreshTimer)})
</script>

<template>
<div v-if="loading" class="loading">PeachAgent Studio · {{tr('加载中','Loading')}}</div>
<div v-else-if="!s.user" class="auth-shell">
 <div class="auth-intro"><div class="brand"><span class="logo">P</span> PeachAgent <small>STUDIO</small></div><p class="eyebrow">P1 · FOUNDATION</p><h1>{{tr('为每一个想法，建立可靠的 AI 工作空间。','Build a reliable AI workspace for every idea.')}}</h1><p>{{tr('统一模型连接、项目资源、对话与运行记录。使用你的模型，掌控你的数据与预算。','Connect your models, organize projects, and stay in control of runs, data and budgets.')}}</p><div class="feature"><b>01</b>{{tr('个人租户与项目隔离','Tenant and project isolation')}}</div><div class="feature"><b>02</b>{{tr('可扩展模型协议','Extensible model protocols')}}</div><div class="feature"><b>03</b>{{tr('真实运行与用量记录','Real runs and usage records')}}</div></div>
 <form class="auth-card" @submit.prevent="authSubmit"><p class="eyebrow">{{tr('账户','ACCOUNT')}}</p><h2>{{auth==='login'?tr('欢迎回来','Welcome back'):auth==='register'?tr('创建账号','Create account'):tr('重置密码','Reset password')}}</h2>
 <label>{{tr('邮箱','Email')}}<input v-model="email" type="email" required autocomplete="email"></label>
 <label v-if="auth==='register'">{{tr('显示名称','Display name')}}<input v-model="name" required></label>
 <label v-if="auth==='register'">{{tr('币种','Currency')}}<select v-model="currency"><option>USD</option><option>CNY</option></select></label>
 <label v-if="auth!=='login'">{{tr('邮件验证码','Email verification code')}}<div class="inline"><input v-model="token" required><button type="button" :disabled="busy||!email" @click="challenge">{{tr('发送邮件','Send email')}}</button></div></label>
 <label>{{tr('密码','Password')}}<input v-model="password" type="password" required :autocomplete="auth==='login'?'current-password':'new-password'"></label>
 <label v-if="auth==='login'" class="check"><input type="checkbox" v-model="remember">{{tr('记住登录','Remember me')}}</label>
 <div v-if="error" class="error" role="alert">{{error}}</div><div v-if="notice" class="notice" role="status">{{notice}}</div>
 <button class="primary wide" :disabled="busy">{{auth==='login'?tr('登录','Sign in'):auth==='register'?tr('注册','Register'):tr('重置','Reset')}}</button>
 <div class="inline"><button type="button" class="link" @click="auth='login'">{{tr('登录','Sign in')}}</button><button type="button" class="link" @click="auth='register'">{{tr('注册','Register')}}</button><button type="button" class="link" @click="auth='reset'">{{tr('忘记密码','Forgot password')}}</button></div>
 <select v-model="s.locale" :aria-label="tr('语言','Language')"><option value="zh-CN">简体中文</option><option value="en-US">English</option></select>
 </form>
</div>
<div v-else class="shell">
 <aside class="sidebar" :class="{open:mobile}"><div class="brand"><span class="logo">P</span><div>PeachAgent<small> STUDIO</small></div></div><div class="nav-scroll"><section v-for="[heading,links] in nav" :key="heading"><div class="nav-title">{{heading}}</div><router-link v-for="[id,label,icon] in links" :key="id" :to="'/'+id" :class="{active:page===id}"><span aria-hidden="true">{{icon}}</span>{{label}}</router-link></section></div><div class="account"><div class="avatar">{{s.user.displayName?.slice(0,1)}}</div><div><b>{{s.user.displayName}}</b><small>{{s.user.email}}</small></div><button class="link" @click="logout" :title="tr('退出','Logout')">↗</button></div></aside>
 <div class="main"><header class="topbar"><button class="mobile-menu" @click="mobile=!mobile" :aria-label="tr('菜单','Menu')" :aria-expanded="mobile">☰</button><div class="breadcrumb">Studio <span>/</span> {{title}}</div><div class="scope"><select :value="s.workspaceId" @change="switchSpace" :aria-label="tr('工作空间','Workspace')"><option v-for="w in s.workspaces.filter(x=>x.status==='ACTIVE')" :key="w.id" :value="w.id">{{w.name}}</option></select><select :value="s.projectId" @change="switchProject" :aria-label="tr('项目','Project')"><option v-for="p in s.projects.filter(x=>x.status==='ACTIVE')" :key="p.id" :value="p.id">{{p.name}}</option></select></div><span class="phase">P1</span></header>
 <main><div class="heading"><div><div class="eyebrow">PEACHAGENT / {{page.toUpperCase()}}</div><h1>{{title}}</h1><p>{{tr('当前工作空间与项目的真实资源和运行状态。','Manage actual resources and execution in the current project.')}}</p></div><button @click="refresh" :disabled="busy">{{tr('刷新','Refresh')}}</button></div>
 <div v-if="error" class="error" role="alert">{{error}}</div><div v-if="notice" class="notice" role="status">{{notice}}</div>
 <template v-if="page==='home'"><div class="metrics"><article><span>{{tr('工作空间','Workspaces')}}</span><strong>{{s.workspaces.length}}</strong></article><article><span>{{tr('当前空间项目','Projects')}}</span><strong>{{s.projects.length}}</strong></article><article><span>{{tr('最近运行','Recent runs')}}</span><strong>{{rows.length}}</strong></article></div><div class="panel"><h2>{{tr('快速开始','Get started')}}</h2><div class="steps"><router-link to="/credentials">01 · {{tr('创建凭证','Create credential')}}</router-link><router-link to="/models">02 · {{tr('配置并诊断模型','Configure and diagnose')}}</router-link><router-link to="/chat">03 · {{tr('开始对话','Start a chat')}}</router-link></div></div><div class="panel"><h2>{{tr('最近运行','Recent runs')}}</h2><p v-if="!rows.length" class="empty">{{tr('暂无运行记录','No runs yet')}}</p><div v-for="x in rows.slice(0,8)" :key="x.id" class="list-row"><span>{{x.runType}} · {{x.id.slice(0,8)}}</span><span class="status">{{x.status}}</span><small>{{localTime(x.createdAt)}}</small></div></div></template>
 <template v-else-if="page==='projects'"><div v-for="kind in ['workspace','project']" :key="kind" class="panel"><div class="panel-head"><h2>{{kind==='workspace'?tr('工作空间','Workspaces'):tr('项目','Projects')}}</h2><button class="primary" @click="startEdit(kind)">{{tr('新建','Create')}}</button></div><div v-for="x in kind==='workspace'?s.workspaces:s.projects" :key="x.id" class="list-row"><div><b>{{x.name}}</b><small>{{x.description}}</small></div><span class="status">{{x.status}}</span><button v-if="x.status==='ACTIVE'" @click="startEdit(kind,x)">{{tr('编辑','Edit')}}</button><button @click="mutate((kind==='workspace'?'/workspaces':s.w+'/projects')+'/'+x.id+'/'+(x.status==='ARCHIVED'?'restore':'archive'),{rowVersion:x.rowVersion},'POST',true)">{{x.status==='ARCHIVED'?tr('恢复','Restore'):tr('归档','Archive')}}</button></div></div></template>
 <template v-else-if="page==='credentials'"><div class="panel"><div class="panel-head"><h2>{{tr('凭证列表','Credentials')}}</h2><button class="primary" @click="startEdit('credential')">{{tr('新建凭证','New credential')}}</button></div><p class="muted">{{tr('密钥加密保存，列表永远不返回原始密钥。','Encrypted at rest; secret material is never returned in lists.')}}</p><p v-if="!rows.length" class="empty">{{tr('还没有凭证','No credentials')}}</p><div v-for="x in rows" :key="x.id" class="list-row"><div><b>{{x.name}}</b><small>{{x.allowedOrigin}} · {{x.secretType}} · {{x.maskedHint}}</small></div><span class="status">{{x.status}}</span><button @click="startEdit('rotate',x)">{{tr('轮换','Rotate')}}</button><button @click="mutate(s.w+'/credentials/'+x.id+'/revoke',{rowVersion:x.rowVersion},'POST',true)">{{tr('吊销','Revoke')}}</button></div></div></template>
 <template v-else-if="page==='models'"><div class="panel"><div class="panel-head"><h2>{{tr('供应商连接','Provider connections')}}</h2><button class="primary" @click="startEdit('provider')">{{tr('新建连接','New connection')}}</button></div><p v-if="!providers.length" class="empty">{{tr('先配置连接与认证方式','Configure an endpoint and authentication first')}}</p><div v-for="x in providers" :key="x.id" class="list-row"><div><b>{{x.name}}</b><small>{{x.baseUrl}} · {{x.authMethod}}</small></div><span class="status">{{x.verifyStatus}}</span><button @click="startEdit('provider',x)">{{tr('编辑','Edit')}}</button><button @click="mutate(s.w+'/providers/'+x.id+'/verify')">{{tr('配置检查','Check config')}}</button><button @click="mutate(s.w+'/providers/'+x.id+'/archive',{rowVersion:x.rowVersion},'POST',true)">{{tr('归档','Archive')}}</button></div></div>
 <div class="panel"><div class="panel-head"><h2>{{tr('模型实例','Model instances')}}</h2><button class="primary" @click="startEdit('model')" :disabled="!providers.length">{{tr('新增模型','New model')}}</button></div><input v-model="query" :aria-label="tr('搜索模型','Search models')" :placeholder="tr('搜索模型','Search models')"><p v-if="!filtered.length" class="empty">{{tr('暂无模型','No models')}}</p><div class="table-wrap"><table><thead><tr><th>{{tr('名称','Name')}}</th><th>{{tr('类型 / 协议','Type / protocol')}}</th><th>{{tr('状态','State')}}</th><th>{{tr('操作','Actions')}}</th></tr></thead><tbody><tr v-for="x in filtered" :key="x.id"><td><b>{{x.name}}</b><small>{{x.externalModelId}}</small></td><td>{{x.modelType}}<small>{{x.protocolKey}} / {{x.protocolVersion}}</small></td><td><span class="status">{{x.verifyStatus}}</span></td><td class="actions"><button @click="startEdit('model',x)">{{tr('编辑','Edit')}}</button><button @click="mutate(s.p+'/model-bindings',{modelId:x.id,active:!bindings.some(b=>b.modelId===x.id&&b.status==='ACTIVE')})">{{bindings.some(b=>b.modelId===x.id&&b.status==='ACTIVE')?tr('解除绑定','Unbind'):tr('绑定项目','Bind')}}</button><button @click="startEdit('debug',x)" :disabled="!bindings.some(b=>b.modelId===x.id&&b.status==='ACTIVE')">{{tr('诊断','Diagnose')}}</button><button @click="mutate(s.p+'/model-defaults',{purpose:x.modelType==='LLM'?'CHAT':x.modelType,modelId:x.id})">{{tr('设为默认','Set default')}}</button><button @click="mutate(s.w+'/models/'+x.id+'/archive',{rowVersion:x.rowVersion},'POST',true)">{{tr('归档','Archive')}}</button></td></tr></tbody></table></div></div></template>
 <template v-else-if="page==='prompts'"><div class="panel"><div class="panel-head"><h2>{{tr('项目提示词','Project prompts')}}</h2><button class="primary" @click="startEdit('prompt')">{{tr('新建提示词','New prompt')}}</button></div><p v-if="!rows.length" class="empty">{{tr('暂无提示词','No prompts')}}</p><div v-for="x in rows" :key="x.id" class="list-row"><div><b>{{x.name}}</b><small>{{x.description}} · {{x.status}}</small></div><button @click="startEdit('prompt',x)">{{tr('编辑','Edit')}}</button><button @click="publish(x)" :disabled="x.status!=='ACTIVE'">{{tr('发布版本','Publish version')}}</button><button @click="startEdit('preview',x)">{{tr('预览草稿','Preview draft')}}</button><button @click="showVersions(x)">{{tr('历史版本','Versions')}}</button><button @click="mutate(s.p+'/prompts/'+x.id+'/'+(x.status==='ARCHIVED'?'restore':'archive'),{rowVersion:x.rowVersion},'POST',true)">{{x.status==='ARCHIVED'?tr('恢复','Restore'):tr('归档','Archive')}}</button></div></div><div v-if="selectedPrompt" class="panel"><h2>{{selectedPrompt.name}} · {{tr('版本','Versions')}}</h2><div v-for="v in versions" :key="v.id" class="version"><b>v{{v.versionNo}}</b><small>{{v.id}}</small><pre>{{v.content}}</pre><button @click="startEdit('preview',{id:selectedPrompt.id,versionId:v.id,name:selectedPrompt.name})">{{tr('预览版本','Preview version')}}</button></div></div><div class="panel"><div class="panel-head"><h2>{{tr('跨项目引用','Project references')}}</h2><button @click="startEdit('reference')">{{tr('新增引用','Add reference')}}</button></div><div v-for="x in references" :key="x.id" class="list-row"><span>{{x.alias}} · v{{x.versionNo}}</span><small>{{x.status}}</small><button @click="mutate(s.p+'/prompt-references/'+x.id+'/revoke',{rowVersion:x.rowVersion},'POST',true)">{{tr('撤销','Revoke')}}</button></div></div></template>
 <template v-else-if="page==='chat'"><div class="chat-layout"><div class="panel history"><button class="primary wide" @click="newChat">{{tr('新对话','New chat')}}</button><button v-for="c in conversations" :key="c.id" class="history-item" :class="{selected:c.id===conversation}" @click="openConversation(c.id)">{{c.title}}<small>{{c.status}}</small></button></div><div class="panel chat"><div v-if="selectedConversation" class="panel-head"><b>{{selectedConversation.title}}</b><div class="inline"><button v-if="selectedConversation.status==='ACTIVE'" :disabled="busy||!!activeRun" @click="changeConversation(selectedConversation,'archive')">{{tr('归档会话','Archive chat')}}</button><button v-if="selectedConversation.status==='ARCHIVED'" :disabled="busy" @click="changeConversation(selectedConversation,'restore')">{{tr('恢复会话','Restore chat')}}</button><button v-if="selectedConversation.status!=='REDACTED'" :disabled="busy||!!activeRun" @click="changeConversation(selectedConversation,'redact')">{{tr('清除会话','Clear chat')}}</button></div></div><p v-if="selectedConversation&&selectedConversation.status!=='ACTIVE'" class="muted">{{tr('此会话为只读。','This conversation is read-only.')}}</p><div class="inline"><select v-model="modelId" :aria-label="tr('模型','Model')"><option value="">{{tr('选择已绑定模型','Select bound model')}}</option><option v-for="x in activeBindings" :key="x.modelId" :value="x.modelId">{{x.name}} · {{x.verifyStatus}}</option></select><select v-model="promptVersionId" :aria-label="tr('提示词','Prompt')"><option value="">{{tr('不使用提示词','No prompt')}}</option><option v-for="x in rows.filter(x=>x.latestVersionId&&x.status==='ACTIVE')" :key="x.id" :value="x.latestVersionId">{{x.name}}</option><option v-for="x in references.filter(x=>x.status==='ACTIVE')" :key="x.id" :value="x.promptVersionId">{{x.alias}} v{{x.versionNo}}</option></select></div><label v-if="promptVersionId">{{tr('变量 JSON','Variables JSON')}}<textarea v-model="variables" rows="2"></textarea></label><div class="chat-body"><p v-if="!conversation" class="empty">{{tr('创建或选择会话，开始真实模型对话。','Create or select a conversation to begin.')}}</p><div v-for="m in visibleMessages" :key="m.id" class="message" :class="m.role==='USER'?'user':'assistant'"><b>{{m.role==='USER'?tr('你','You'):'AI'}} <small>{{m.status}}</small></b><pre>{{m.content}}</pre><div v-if="m.content" class="inline"><button @click="copyMessage(m.content)">{{tr('复制','Copy')}}</button><button :disabled="!canSend" @click="reuseMessage(m.content)">{{tr('复用','Reuse')}}</button></div><div v-if="m.role==='ASSISTANT'&&m.status==='COMPLETE'" class="inline"><button :aria-label="tr('有帮助','Helpful')" @click="mutate(s.p+'/conversations/'+conversation+'/messages/'+m.id+'/feedback',{rating:'UP',reason:null})">↑</button><button :aria-label="tr('无帮助','Not helpful')" @click="mutate(s.p+'/conversations/'+conversation+'/messages/'+m.id+'/feedback',{rating:'DOWN',reason:null})">↓</button></div></div><div v-if="activeRun" class="message assistant" aria-live="polite"><b>{{streamState==='reconnecting'?tr('连接中断，正在重连','Connection lost, reconnecting'):streamState==='connecting'?tr('正在连接','Connecting'):tr('正在生成','Generating')}}</b><pre>{{streamText}}</pre></div></div><form @submit.prevent="send"><textarea v-model="chatText" :aria-label="tr('输入消息','Enter message')" :placeholder="tr('输入消息','Enter message')" rows="4" :disabled="!canSend"></textarea><div class="panel-head"><small>{{tr('模型费用由供应商和预算决定。','Provider charges and budgets apply.')}}</small><button v-if="activeRun" type="button" @click="cancel">{{tr('停止','Stop')}}</button><button v-else class="primary" :disabled="busy||!canSend||!modelId||!chatText.trim()">{{tr('发送','Send')}}</button></div></form></div></div></template>
 <template v-else-if="page==='runs'"><div class="panel"><h2>{{tr('运行历史','Run history')}}</h2><p v-if="!rows.length" class="empty">{{tr('暂无运行','No runs')}}</p><div v-for="x in rows" :key="x.id" class="list-row"><div><b>{{x.runType}} · {{x.id.slice(0,8)}}</b><small>{{localTime(x.createdAt)}}</small></div><span class="status">{{x.status}}</span><button @click="showRun(x)">{{tr('详情','Details')}}</button><button v-if="['QUEUED','RUNNING'].includes(x.status)" @click="mutate(s.p+'/runs/'+x.id+'/cancel')">{{tr('停止','Stop')}}</button><button v-if="x.runType==='CHAT'&&['FAILED','CANCELLED','INTERRUPTED','SUCCEEDED'].includes(x.status)" @click="retry(x.id)">{{tr('重试','Retry')}}</button></div></div><div v-if="runDetail" class="panel"><h2>{{tr('运行详情','Run detail')}} · {{runDetail.status}}</h2><small>{{runDetail.traceId}}</small><div v-for="e in events" :key="e.seq" class="event"><small>{{e.seq}} · {{e.eventType}}</small><pre>{{JSON.stringify(e.payload,null,2)}}</pre><button v-if="e.payload?.artifactId" @click="showMedia(e.payload.artifactId)">{{tr('预览产物','Preview artifact')}}</button><a v-if="e.payload?.artifactId" :href="'/api/v1'+s.p+'/runs/'+runDetail.id+'/artifacts/'+e.payload.artifactId" download>{{tr('下载产物','Download artifact')}}</a></div><div v-if="mediaUrl" class="panel"><img v-if="mediaType==='image/png'" :src="mediaUrl" :alt="tr('生成图片','Generated image')" style="max-width:100%"><audio v-else :src="mediaUrl" controls></audio><button @click="clearMedia">{{tr('关闭预览','Close preview')}}</button></div></div></template>
 <template v-else-if="page==='usage'"><UsageOverview :scope="s.p" :revision="usageRevision" :locale="s.locale"/><div class="panel"><h2>{{tr('三级预算','Budget policies')}}</h2><div v-for="b in budgets" :key="b.id" class="list-row"><div><b>{{b.scopeType}}</b><small>{{tr('并发','Concurrency')}} {{b.inflightCount}} / {{b.maxConcurrency}} · {{tr('周期','Period')}} {{b.periodType}}</small></div><span>{{b.maxCost??tr('无金额限制','No cost cap')}} {{b.currency}}</span><button @click="startEdit('budget',b)">{{tr('编辑预算','Edit budget')}}</button></div></div><div class="panel"><h2>{{tr('近 30 天调用记录','Last 30 days of calls')}}</h2><p class="muted">{{tr('未知费用显示未知，不作为零处理。','Unknown costs remain unknown, not zero.')}}</p><div class="table-wrap"><table><thead><tr><th>{{tr('时间','Time')}}</th><th>{{tr('模型','Model')}}</th><th>Token</th><th>{{tr('费用','Cost')}}</th><th>{{tr('状态','Status')}}</th></tr></thead><tbody><tr v-for="x in calls" :key="x.id"><td>{{localTime(x.createdAt)}}</td><td>{{x.modelType}}</td><td>{{x.totalTokens??tr('未知','Unknown')}}<small>{{x.usageSource}}</small></td><td>{{x.costAmount??tr('未知','Unknown')}} {{x.costCurrency}}<small>{{x.costSource}}</small></td><td>{{x.status}}</td></tr></tbody></table></div></div></template>
 <template v-else-if="page==='plugins'"><div class="panel"><div class="panel-head"><h2>{{tr('私有插件声明','Private plugin manifests')}}</h2><button class="primary" @click="startEdit('plugin')">{{tr('新增声明','New manifest')}}</button></div><p class="muted">{{tr('P1 只支持声明、Schema 校验与版本登记，不安装或运行插件。','P1 validates and registers manifests only; no plugin installation or execution.')}}</p><div v-for="x in rows" :key="x.id" class="list-row"><div><b>{{x.name}}</b><small>{{x.pluginKey}} · {{x.pluginVersion}}</small></div><span class="status">{{x.status}}</span><button v-if="x.status==='DRAFT'" @click="mutate(s.w+'/plugin-manifests/'+x.id+'/declare',{rowVersion:x.rowVersion})">{{tr('声明','Declare')}}</button><button @click="mutate(s.w+'/plugin-manifests/'+x.id+'/archive',{rowVersion:x.rowVersion},'POST',true)">{{tr('归档','Archive')}}</button></div></div></template>
 <template v-else-if="page==='settings'"><div class="panel"><h2>{{tr('个人偏好','Preferences')}}</h2><label>{{tr('主题','Theme')}}<select :value="s.theme" @change="preference($event,'theme')"><option value="editorial-light">{{tr('纸面浅色','Editorial light')}}</option><option value="obsidian-dark">{{tr('曜石深色','Obsidian dark')}}</option><option value="nordic-slate">{{tr('北欧灰蓝','Nordic slate')}}</option></select></label><label>{{tr('语言','Language')}}<select :value="s.locale" @change="preference($event,'locale')"><option value="zh-CN">简体中文</option><option value="en-US">English</option></select></label><p>{{localeName}} · {{s.user.currency}}</p></div></template>
 </main></div>
 <div v-if="edit" class="overlay" @click.self="closeEdit"><form ref="dialogRef" class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" tabindex="-1" @submit.prevent="save" @input="dirty=edit!=='preview';manifestValid=false;previewText=null" @change="dirty=edit!=='preview';manifestValid=false;previewText=null"><div class="panel-head"><h2 id="dialog-title">{{tr('配置','Configure')}} · {{edit}}</h2><button type="button" @click="closeEdit" :aria-label="tr('关闭','Close')">×</button></div>
 <template v-if="['workspace','project','provider','model','prompt','plugin','credential'].includes(edit)"><label>{{tr('名称','Name')}}<input v-model="form.name" required></label></template>
 <label v-if="['workspace','project','prompt','plugin'].includes(edit)">{{tr('描述','Description')}}<textarea v-model="form.description" rows="2"></textarea></label>
 <template v-if="edit==='credential'"><label>{{tr('认证类型','Auth type')}}<select v-model="form.secretType"><option>BEARER</option><option>API_KEY</option></select></label><label>Origin<input v-model="form.allowedOrigin" required></label></template>
 <label v-if="edit==='credential'||edit==='rotate'">{{tr('密钥','Secret')}}<input type="password" v-model="form.secret" required autocomplete="new-password"></label>
 <template v-if="edit==='provider'"><label>{{tr('供应商标识','Vendor key')}}<input v-model="form.vendorKey" required></label><label>Base URL<input v-model="form.baseUrl" required></label><label>{{tr('认证方式','Authentication')}}<select v-model="form.authMethod"><option>BEARER</option><option>API_KEY</option><option>NONE</option></select></label><label v-if="form.authMethod!=='NONE'">{{tr('凭证','Credential')}}<select v-model="form.credentialId" required><option v-for="c in credentials.filter(x=>x.status==='ACTIVE')" :key="c.id" :value="c.id">{{c.name}}</option></select></label><label>{{tr('超时毫秒','Timeout ms')}}<input type="number" v-model.number="form.timeoutMs" min="1000" max="180000"></label><label>{{tr('协议连接配置 JSON','Protocol connection JSON')}}<textarea v-model="form.protocolConfig" rows="3"></textarea></label></template>
 <template v-if="edit==='model'"><label>{{tr('供应商','Provider')}}<select v-model="form.providerId" required :disabled="!!form.id"><option v-for="x in providers" :key="x.id" :value="x.id">{{x.name}}</option></select></label><label>{{tr('外部模型名称','External model ID')}}<input v-model="form.externalModelId" required></label><label>{{tr('协议','Protocol')}}<select :value="protocols.findIndex(x=>x.protocol.key===form.protocolKey&&x.protocol.version===form.protocolVersion)" @change="pickProtocol"><option v-for="(d,i) in protocols" :key="d.protocol.key+'/'+d.protocol.version" :value="i">{{d.protocol.key}} / {{d.protocol.version}}</option></select></label><label>{{tr('模型类型','Model type')}}<input :value="form.modelType" readonly></label><label v-for="(spec,key) in descriptor?.modelSchema?.properties||{}" :key="String(key)">{{key}}<select v-if="spec.enum" v-model="form.modelOptions[key]"><option v-for="v in spec.enum" :key="v">{{v}}</option></select><input v-else-if="spec.type==='boolean'" type="checkbox" v-model="form.modelOptions[key]"><input v-else-if="spec.type==='number'||spec.type==='integer'" type="number" :min="spec.minimum" :max="spec.maximum" :step="spec.type==='integer'?1:0.01" v-model.number="form.modelOptions[key]"><input v-else v-model="form.modelOptions[key]"></label><label>{{tr('价格 JSON','Pricing JSON')}}<textarea v-model="form.pricing" rows="3"></textarea></label></template>
 <label v-if="edit==='provider'||edit==='model'" class="check"><input type="checkbox" v-model="form.enabled">{{tr('启用','Enabled')}}</label>
 <template v-if="edit==='prompt'"><label>{{tr('内容','Content')}}<textarea v-model="form.content" rows="6" required></textarea></label><label>{{tr('变量 Schema JSON','Variable schema JSON')}}<textarea v-model="form.variables" rows="5"></textarea></label></template>
 <template v-if="edit==='preview'"><p>{{form.name}} · {{form.versionId?tr('固定版本','Pinned version'):tr('草稿','Draft')}}</p><label>{{tr('变量值 JSON','Variable values JSON')}}<textarea v-model="form.values" rows="5"></textarea></label><div v-if="previewText!==null" class="version" role="status"><b>{{tr('渲染结果','Rendered result')}}</b><pre>{{previewText}}</pre></div></template>
 <template v-if="edit==='reference'"><label>{{tr('来源项目 ID','Source project ID')}}<input v-model="form.sourceProjectId" required></label><label>{{tr('固定版本 ID','Pinned version ID')}}<input v-model="form.versionId" required></label><label>{{tr('别名','Alias')}}<input v-model="form.alias" required></label></template>
 <template v-if="edit==='plugin'"><label>Plugin key<input v-model="form.pluginKey" required></label><label>{{tr('版本','Version')}}<input v-model="form.pluginVersion" required></label><label>Config Schema<textarea v-model="form.configSchema" rows="4"></textarea></label><label>{{tr('声明权限 JSON','Permissions JSON')}}<textarea v-model="form.permissions" rows="2"></textarea></label><label>{{tr('扩展点 JSON','Extension points JSON')}}<textarea v-model="form.extensionPoints" rows="2"></textarea></label><button type="button" :disabled="busy" @click="validateManifest">{{tr('验证声明','Validate manifest')}}</button><p v-if="manifestValid" role="status">{{tr('声明有效','Manifest valid')}}</p></template>
 <template v-if="edit==='budget'"><label v-for="field in ['maxCalls','maxTokens','maxCost','maxConcurrency','maxRunSeconds','maxRunTokens','maxRunCost']" :key="field">{{field}}<input type="number" min="0" :step="field.toLowerCase().includes('cost')?'0.00000001':'1'" v-model.number="form[field]"></label></template>
 <template v-if="edit==='debug'"><label v-if="form.modelType==='RERANK'">Query<input v-model="form.query" required></label><label v-if="form.modelType==='RERANK'">Documents JSON<textarea v-model="form.documents" rows="5"></textarea></label><label v-else-if="form.modelType==='STT'">{{tr('WAV 文件','WAV file')}}<input type="file" accept=".wav,audio/wav" @change="fileAudio" required></label><label v-else>{{tr('输入','Input')}}<textarea v-model="form.text" rows="5" required></textarea></label><p>{{tr('实际请求可能产生费用。','The real request may incur charges.')}}</p></template>
 <div v-if="error" class="error" role="alert">{{error}}</div><div class="panel-head"><button type="button" @click="closeEdit">{{tr('取消','Cancel')}}</button><button class="primary" :disabled="busy">{{edit==='debug'?tr('运行诊断','Run diagnostic'):edit==='preview'?tr('渲染预览','Render preview'):tr('保存','Save')}}</button></div></form></div>
</div>
</template>
