(function () {
  'use strict';
  const S = window.Studio;
  const R = S.Runtime = {};
  const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const uid = prefix => S.uid(prefix);
  const hex = length => Array.from({length},()=>Math.floor(Math.random()*16).toString(16)).join('');
  const listeners = new Set(), approvals = new Map(), completions = new Map();
  const unsafeKeys = new Set(['__proto__', 'prototype', 'constructor']);
  const terminal = status => ['done', 'failed', 'rejected', 'stopped'].includes(status);
  const issue = (code, message, extra) => Object.assign(new Error(message), { code }, extra || {});
  const schema = (properties, required) => ({ type: 'object', properties, required: required || [], additionalProperties: false });
  const string = description => ({ type: 'string', description });
  const ref = path => ({ mode: 'ref', path });
  const constant = value => ({ mode: 'constant', value });
  const template = value => ({ mode: 'template', value });
  const field = (key, label, type, options, help) => ({ key, label, type: type || 'text', ...(options ? { options } : {}), ...(help ? { help } : {}) });
  const property = (type, description) => ({ type, description });
  function safe(value) {
    return JSON.parse(JSON.stringify(value === undefined ? null : value, (key, item) => /^(apiKey|api_key|password|secret|authorization|access_token|refresh_token)$/i.test(key) ? '[已脱敏]' : item));
  }
  const delay = (run, speed) => new Promise(resolve => setTimeout(resolve, speed === undefined ? (run && run.speed !== undefined ? run.speed : 110) : speed));
  function assertActive(run) { if (terminal(run.status)) throw issue('CANCELLED', '运行已结束，未继续调用。'); }
  function emit(run, type, data) {
    const e = { id: uid('event'), seq: run.events.length + 1, type, time: Date.now(), runId: run.id, data: safe(data || {}) };
    ['nodeId', 'nodeExecutionId', 'toolCallId', 'attemptId', 'parentRunId'].forEach(key => { if (data && data[key]) e[key] = data[key]; });
    run.events.push(e); S.save();
    listeners.forEach(fn => { try { fn(run, e); } catch (error) { console.warn('Runtime listener failed', error.message); } });
    if (terminal(run.status)) { const callbacks = completions.get(run.id) || []; callbacks.forEach(fn => fn(run)); completions.delete(run.id); }
    return e;
  }
  R.event = emit;
  R.subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn); };
  R.findRun = id => S.state.runs.find(run => run.id === id);
  R.waitForRun = run => terminal(run.status) ? Promise.resolve(run) : new Promise(resolve => { const items = completions.get(run.id) || []; items.push(resolve); completions.set(run.id, items); });

  const defs = [
    ['N01','input','用户输入','触发与输入','play','声明任务输入字段和默认值。',false,{fields:[{name:'topic',type:'string',required:true,default:'企业 AI 平台'}]},[field('fields','输入字段','json')],{topic:property('string','任务主题')}],
    ['N02','webhook','Webhook 触发','触发与输入','link','注入请求事件并验证参数；本地原型不提供公网 URL。',true,{method:'POST',path:'/events/research',deduplicationKey:'event_id'},[field('method','请求方法','select',['POST','PUT']),field('path','路径'),field('deduplicationKey','去重字段')],{event:property('object','注入的事件')}],
    ['N03','schedule','定时触发','触发与输入','clock','按时区和计划执行，原型可手动注入定时事件。',true,{cron:'0 9 * * 1',timezone:'Asia/Shanghai',missedPolicy:'skip'},[field('cron','计划表达式'),field('timezone','时区'),field('missedPolicy','错过任务','select',['skip','run_once'])],{scheduledAt:property('string','计划时间')}],
    ['N04','event','插件事件','触发与输入','bolt','接收选定插件的事件并应用过滤。',true,{pluginId:'plugin-docs',eventName:'document.updated'},[field('pluginId','插件'),field('eventName','事件类型')],{event:property('object','事件内容')}],
    ['N05','llm','LLM','智能处理','spark','将上游内容和提示词交给模型；原型按输入生成模拟响应。',false,{model:'DeepSeek Chat',prompt:'基于 {{input.topic}} 整理重点，保留来源。',temperature:0.4,outputMode:'text',maxTokens:2048},[field('model','模型','select',['DeepSeek Chat','GPT-4.1','Qwen Plus']),field('prompt','提示词','textarea'),field('temperature','Temperature','number'),field('outputMode','响应格式','select',['text','json']),field('maxTokens','最大输出 Token','number')],{text:property('string','生成内容'),result:property('object','结构化响应')}],
    ['N06','agent','Agent','智能处理','agent','调用已发布 Agent 的能力快照。',false,{agentId:'research',maxRounds:4},[field('agentId','Agent ID'),field('maxRounds','最大轮数','number')],{text:property('string','Agent 结果'),toolResults:property('array','工具结果')}],
    ['N07','classifier','问题分类','智能处理','filter','按明确标签选择出口；原型采用可见的关键词规则。',false,{labels:[{id:'research',label:'研究',keywords:['研究','分析']},{id:'writing',label:'写作',keywords:['写','文案']}],defaultLabel:'research'},[field('labels','分类规则','json'),field('defaultLabel','默认分类')],{label:property('string','命中的标签'),reason:property('string','可解释规则')}],
    ['N08','extract','参数提取','智能处理','code','按照字段 Schema 从 JSON 或键值文本提取参数。',false,{fields:[{name:'title',type:'string',required:true}],missingPolicy:'fail'},[field('fields','字段契约','json'),field('missingPolicy','缺失字段','select',['fail','null'])],{result:property('object','提取字段')}],
    ['N09','knowledge','知识检索','知识与上下文','book','基于查询召回知识片段与来源。',false,{knowledge:'研究资料室',topK:3,scoreThreshold:0.5,rerank:true},[field('knowledge','知识库'),field('topK','Top K','number'),field('scoreThreshold','最低分数','number'),field('rerank','重排','checkbox')],{items:property('array','召回片段'),total:property('integer','条数')}],
    ['N10','document','文档提取','知识与上下文','file','从文件引用或示例文本提取内容，保留来源。',false,{format:'text',includeMetadata:true},[field('format','提取格式','select',['text','json']),field('includeMetadata','保留元信息','checkbox')],{text:property('string','文档正文'),metadata:property('object','文件信息')}],
    ['N11','memory','记忆读写','知识与上下文','layers','按作用域读取或写入本地示例记忆。',true,{mode:'read',scope:'agent',key:'preferences'},[field('mode','操作','select',['read','write']),field('scope','范围','select',['agent','conversation','tenant']),field('key','记忆键')],{value:property('object','记忆值')}],
    ['N12','mcp','MCP 工具','工具与集成','plug','绑定 MCP 连接和具体工具，按 Schema 传参。',false,{toolId:'web.search'},[field('toolId','工具 ID')],{result:property('object','结构化工具结果')}],
    ['N13','plugin','插件工具','工具与集成','box','选择已安装插件导出的具体动作。',false,{toolId:'docs.create'},[field('toolId','插件动作')],{result:property('object','插件结果')}],
    ['N14','http','HTTP 请求','工具与集成','globe','配置 URL、方法、请求体和超时；仅模拟响应。',false,{method:'GET',url:'https://api.example.invalid/items',headers:{},mockStatus:200},[field('method','方法','select',['GET','POST','PUT','PATCH','DELETE']),field('url','URL'),field('headers','请求头（不含明文密钥）','json'),field('mockStatus','模拟状态码','number')],{status:property('integer','HTTP 状态'),body:property('object','响应体')}],
    ['N15','code','代码处理','数据处理','code','受控示例处理器；不会执行任意输入代码。',false,{handler:'identity',language:'javascript'},[field('handler','示例处理器','select',['identity','uppercase','sum','pick','count']),field('language','代码语言','select',['javascript','python'])],{result:property('object','处理结果')}],
    ['N16','database','数据库查询','工具与集成','layers','参数化查询配置，原型返回示例行。',true,{connectionId:'plugin-table',query:'SELECT * FROM items WHERE topic = :topic',limit:20},[field('connectionId','连接'),field('query','参数化 SQL','textarea'),field('limit','最多行数','number')],{rows:property('array','查询记录'),count:property('integer','记录数')}],
    ['N17','sandbox','沙箱任务','工具与集成','terminal','选择执行模板和资源限制；原型只返回模拟日志。',true,{runner:'isolated-python',command:'python analyse.py',timeout:30,network:false},[field('runner','执行器模板'),field('command','命令','textarea'),field('timeout','超时秒数','number'),field('network','允许网络','checkbox')],{stdout:property('string','模拟输出'),exitCode:property('integer','模拟退出码')}],
    ['N18','mapping','字段映射','数据处理','code','命名输入映射为新的对象，保留类型。',false,{mapping:{title:ref('input.topic')}},[field('mapping','目标字段映射','json')],{result:property('object','映射结果')}],
    ['N19','template','模板渲染','数据处理','file','使用变量渲染文字或 JSON。',false,{template:'主题：{{input.topic}}',outputType:'text'},[field('template','模板','textarea'),field('outputType','输出类型','select',['text','json'])],{text:property('string','渲染文本'),result:property('object','JSON 结果')}],
    ['N20','assign','变量赋值','数据处理','edit','更新本工作流状态，系统变量不可写入。',false,{scope:'workflow',key:'report_title',operation:'set'},[field('scope','作用域','select',['workflow','conversation']),field('key','变量名'),field('operation','操作','select',['set','append','clear'])],{value:property('object','赋值后的值')}],
    ['N21','list','列表处理','数据处理','filter','过滤、排序、去重、切片和字段选择。',false,{operation:'slice',limit:3,key:'title',order:'asc',match:''},[field('operation','操作','select',['slice','sort','unique','filter','pluck','count']),field('key','字段'),field('limit','数量上限','number'),field('order','排序','select',['asc','desc']),field('match','筛选文本')],{items:property('array','处理后列表'),count:property('integer','数量')}],
    ['N22','if','条件分支','流程控制','workflow','按 IF、ELIF、ELSE 顺序选择一个出口。',false,{combinator:'and',conditions:[{left:ref('input.topic'),operator:'not_empty'}],elif:[]},[field('combinator','条件关系','select',['and','or']),field('conditions','IF 条件','json'),field('elif','ELIF 条件组','json')],{matched:property('string','命中端口'),evaluations:property('array','实际比较值')}],
    ['N23','switch','Switch','流程控制','workflow','按指定值匹配 case；未命中走 default。',false,{cases:[{id:'case-a',value:'research'},{id:'case-b',value:'writing'}]},[field('cases','分支值','json')],{matched:property('string','命中端口'),value:property('string','实际值')}],
    ['N24','merge','分支汇合','流程控制','layers','只读取实际产生的分支值；null 不等于未产生。',false,{candidates:[]},[field('candidates','候选变量（按优先顺序）','json')],{value:property('object','激活路径的值'),selectedPath:property('string','选中的来源')}],
    ['N25','parallel','并行分发 / 汇合','流程控制','workflow','分发同时可执行的分支，汇合等待全部入边。',false,{mode:'split',allowPartial:false},[field('mode','模式','select',['split','join']),field('allowPartial','允许部分失败','checkbox')],{result:property('object','各分支结果')}],
    ['N26','iteration','数组迭代','流程控制','refresh','逐项处理数组，输出保持输入顺序。',false,{template:'{{iteration.index}} · {{iteration.item.title}}',concurrency:2,errorPolicy:'keep',body:null},[field('template','逐项模板','textarea'),field('concurrency','最大并行项数','number'),field('errorPolicy','逐项失败','select',['stop','keep']),field('body','嵌套节点图（可选）','json')],{items:property('array','逐项结果'),count:property('integer','输入项数'),errors:property('array','失败位置')}],
    ['N27','loop','条件循环','流程控制','refresh','携带状态逐轮执行，受最大次数约束。',false,{initialState:{count:0},conditions:[{left:ref('loop.count'),operator:'lt',right:constant(3)}],combinator:'and',maxRounds:5,updates:{count:{mode:'expression',left:ref('loop.count'),operator:'add',right:constant(1)}},body:null,limitPolicy:'finish'},[field('initialState','初始状态','json'),field('conditions','继续条件','json'),field('maxRounds','最多轮数','number'),field('updates','每轮状态更新','json'),field('body','循环节点图（可选）','json'),field('limitPolicy','达到上限','select',['finish','fail'])],{state:property('object','最终状态'),rounds:property('integer','执行轮数'),reason:property('string','退出原因')}],
    ['N28','control','循环控制','流程控制','stop','只在迭代或循环容器中 Break / Continue。',false,{action:'break'},[field('action','控制动作','select',['break','continue'])],{action:property('string','控制动作')}],
    ['N29','human','人工输入 / 审批','流程控制','shield','暂停并保存现场，接收编辑和决策后继续。',false,{title:'确认内容与目标位置',description:'确认本次模拟写入范围后继续。',fields:[{name:'note',label:'补充说明',type:'string',required:false}]},[field('title','审批标题'),field('description','说明','textarea'),field('fields','人工输入字段','json')],{approved:property('boolean','决定'),note:property('string','反馈')}],
    ['N30','subflow','子工作流','流程控制','workflow','复用发布快照并关联父子运行。',false,{flowId:'flow-item',version:'1.0'},[field('flowId','子流程 ID'),field('version','发布版本')],{result:property('object','子流程返回'),childRunId:property('string','子运行')}],
    ['N31','wait','等待 / 事件恢复','流程控制','clock','等待关联事件；原型用人工恢复模拟。',true,{mode:'event',eventName:'document.confirmed',delayMs:300},[field('mode','等待方式','select',['event','delay']),field('eventName','事件名称'),field('delayMs','模拟等待毫秒','number')],{event:property('object','恢复数据')}],
    ['N32','resource','MCP 资源','知识与上下文','book','读取资源 URI 或参数化模板。',false,{resourceId:'resource-style',uri:'workspace://guides/research'},[field('resourceId','资源 ID'),field('uri','资源 URI')],{text:property('string','资源内容'),uri:property('string','来源')}],
    ['N33','prompt','提示词模板','知识与上下文','spark','填入本地或 MCP Prompt 参数并生成消息。',false,{promptId:'prompt-report'},[field('promptId','Prompt ID')],{messages:property('array','填参后的消息')}],
    ['N34','answer','对话回复','完成与结果','send','向对话追加内容，不必创建文件。',false,{template:'{{input.topic}} 的处理已完成。'},[field('template','回复内容','textarea')],{text:property('string','回复文本')}],
    ['N35','output','最终输出','完成与结果','arrow','可返回结构化字段，也可无返回值完成。',false,{mode:'none'},[field('mode','返回方式','select',['none','data'])],{value:property('object','可选返回值')}],
    ['N36','artifact','成果生成','完成与结果','file','显式创建可下载文件；与外部写入回执分开。',false,{filename:'研究简报.md',format:'Markdown'},[field('filename','文件名'),field('format','格式','select',['Markdown','JSON','CSV','Text'])],{file:property('file','文件引用')}],
    ['N37','end','结束 / 失败','完成与结果','check','完成任务或明确失败；可无返回和无文件。',false,{status:'done',message:'所有步骤已执行完成。'},[field('status','结束状态','select',['done','failed']),field('message','说明','textarea')],{}]
  ];
  R.catalog = defs.map(([id,type,name,group,icon,description,extension,defaults,fields,outputs]) => ({id,type,name,group,icon,description,extension,defaults,fields,inputs:[],outputs}));
  const inputSchemas = {
    llm:schema({content:{description:'处理内容，可为文本、列表或对象'},context:{description:'额外上下文'}}),
    agent:schema({goal:string('本次目标')},['goal']),classifier:schema({text:string('待分类文本')},['text']),extract:schema({text:string('JSON 或键值文本')},['text']),
    knowledge:schema({query:string('检索问题')},['query']),document:schema({file:{description:'文件引用或带 content 的对象'},text:string('示例正文')}),memory:schema({value:{description:'要写入的记忆值'}}),
    http:schema({query:{type:'object'},body:{description:'请求体'}}),code:schema({value:{description:'声明的处理器输入'}},['value']),database:schema({topic:string('参数化查询值')}),sandbox:schema({input:{description:'脚本输入'}}),
    mapping:schema({},[]),template:schema({},[]),assign:schema({value:{description:'赋值内容'}},['value']),list:schema({items:{type:'array',description:'待处理数组'}},['items']),
    if:schema({},[]),switch:schema({value:{description:'分支判定值'}},['value']),merge:schema({},[]),parallel:{type:'object',properties:{},additionalProperties:true},iteration:schema({items:{type:'array',description:'逐项执行的输入数组'}},['items']),
    loop:schema({},[]),human:schema({content:{description:'待审阅内容'},destination:string('目标位置')}),subflow:{type:'object',properties:{topic:string('子工作流输入')},additionalProperties:true},
    wait:schema({event:{type:'object',description:'恢复事件'}}),resource:schema({},[]),prompt:schema({topic:string('模板参数')},['topic']),answer:schema({text:string('回复内容')}),output:{type:'object',properties:{},additionalProperties:true},artifact:schema({content:{description:'文件内容，可为文本或 JSON'}},['content']),end:schema({},[]),
    webhook:schema({event:{type:'object'}}),event:schema({event:{type:'object'}})
  };
  R.catalog.forEach(def=>{def.inputs=inputSchemas[def.type]||schema({},[]);});
  for(const [type,key]of [['merge','value'],['code','result'],['memory','value'],['assign','value'],['output','value']])R.catalog.find(d=>d.type===type).outputs[key].type='any';
  const defaultBindings={
    llm:{content:ref('input.topic')},agent:{goal:ref('input.topic')},classifier:{text:ref('input.topic')},extract:{text:constant('{"title":"示例内容"}')},knowledge:{query:ref('input.topic')},document:{text:constant('待提取的示例正文')},memory:{value:constant({language:'zh-CN'})},
    http:{body:constant({})},code:{value:constant([1,2,3])},database:{topic:ref('input.topic')},sandbox:{input:constant({})},assign:{value:constant('新值')},list:{items:constant([{title:'资料 A'},{title:'资料 B'}])},switch:{value:constant('research')},iteration:{items:constant([{title:'资料 A'},{title:'资料 B'}])},human:{content:constant('请检查本次操作的内容与目标位置。')},subflow:{topic:ref('input.topic')},prompt:{topic:ref('input.topic')},artifact:{content:constant('显式生成的文件内容。')}
  };
  R.nodeType = type => R.catalog.find(def => def.type === type);
  R.newNode = (type, patch) => { const def = R.nodeType(type) || R.nodeType('template'); return Object.assign({ id:uid('node'),type:def.type,title:def.name,x:80,y:80,config:{...copy(def.defaults),...(def.type==='llm'&&S.Models?{model:S.Models.defaults('llm')||''}:{})},bindings:copy(defaultBindings[def.type]||{}),policy:{timeout:15000,retries:0,onError:'fail',breakpoint:false} }, copy(patch || {})); };
  R.ports = node => {
    const c = node.config || {};
    let ports = [{id:'next',label:'继续'}];
    if (node.type === 'if') ports = [{id:'true',label:'IF'},...(c.elif||[]).map((_,i)=>({id:'elif-'+(i+1),label:'ELIF '+(i+1)})),{id:'false',label:'ELSE'}];
    if (node.type === 'switch') ports = (c.cases||[]).map(x=>({id:x.id,label:String(x.value)})).concat({id:'default',label:'默认'});
    if (node.type === 'classifier') ports = (c.labels||[]).map(x=>({id:x.id,label:x.label||x.id}));
    if (node.type === 'human') ports = [{id:'approved',label:'批准'},{id:'rejected',label:'拒绝'}];
    if (['output','end'].includes(node.type)) ports=[];
    return [...ports,{id:'error',label:'错误'}];
  };

  const seeds = {
    connections:[
      {id:'mcp-search',name:'Research MCP',kind:'mcp',transport:'Streamable HTTP',endpoint:'https://research.example.invalid/mcp',location:'平台 Runner',status:'ready',enabled:true,credentialRef:'cred-research-demo',version:'1.0',protocolVersion:'2026-07-28',description:'搜索与读取网页的模拟连接。',lastTest:null},
      {id:'mcp-workspace',name:'Workspace MCP',kind:'mcp',transport:'stdio',endpoint:'workspace-mcp --root /data/workspace',location:'隔离容器 Runner',status:'ready',enabled:true,credentialRef:'cred-workspace-demo',version:'1.0',protocolVersion:'2026-07-28',description:'写入指定工作目录；使用模拟回执，不接触本机文件。',lastTest:null},
      {id:'plugin-docs',name:'团队文档 · 默认空间',kind:'plugin',pluginId:'docs',transport:'plugin',endpoint:'https://docs.example.invalid',location:'插件 Runner',status:'ready',enabled:true,credentialRef:'cred-docs-demo',version:'1.0'},
      {id:'plugin-table',name:'业务表 · 研究记录',kind:'plugin',pluginId:'table',transport:'plugin',endpoint:'table://research-records',location:'插件 Runner',status:'ready',enabled:true,credentialRef:'cred-table-demo',version:'1.0'}
    ],
    plugins:[
      {id:'docs',name:'团队文档',version:'1.2.0',status:'installed',enabled:true,description:'将内容写入指定文档空间并返回位置回执。',author:'OTRYX 示例',toolIds:['docs.create'],config:{folder:'/产品研究'},permissions:['documents:write'],exports:['tool']},
      {id:'table',name:'业务数据表',version:'1.0.0',status:'installed',enabled:true,description:'按记录键更新示例数据表。',author:'OTRYX 示例',toolIds:['table.upsert'],config:{table:'research-records'},permissions:['rows:write'],exports:['tool','trigger']}
    ],
    tools:[
      {id:'web.search',name:'search',title:'搜索资料',kind:'mcp',connectionId:'mcp-search',version:'1.0',description:'根据查询返回带标题、链接和摘要的资料列表。',write:false,inputSchema:schema({query:string('搜索主题'),limit:{type:'integer',minimum:1,maximum:8,default:3}},['query']),outputSchema:schema({items:{type:'array',items:schema({title:string('标题'),url:string('来源'),summary:string('摘要')},['title','url','summary'])},total:{type:'integer'}},['items','total']),example:{query:'企业 Agent 平台',limit:3}},
      {id:'web.fetch',name:'fetch',title:'读取网页',kind:'mcp',connectionId:'mcp-search',version:'1.0',description:'读取指定示例页面的文本内容。',write:false,inputSchema:schema({url:string('页面 URL')},['url']),outputSchema:schema({url:string('页面 URL'),text:string('正文'),title:string('标题')},['url','text','title']),example:{url:'https://example.invalid/research/1'}},
      {id:'workspace.write',name:'write_file',title:'写入指定目录',kind:'mcp',connectionId:'mcp-workspace',version:'1.0',description:'把内容放到指定路径；返回模拟写入回执。',write:true,inputSchema:schema({path:string('目标绝对路径'),content:string('写入内容')},['path','content']),outputSchema:schema({destination:string('目标路径'),written:{type:'boolean'},receiptId:string('回执编号'),bytes:{type:'integer'}},['destination','written','receiptId','bytes']),example:{path:'/研究简报/本周观察.md',content:'本周观察：把可复用能力与执行链路连接起来。'}},
      {id:'docs.create',name:'create_document',title:'创建团队文档',kind:'plugin',pluginId:'docs',connectionId:'plugin-docs',version:'1.2.0',description:'将文档内容放入指定空间，返回文档位置。',write:true,inputSchema:schema({title:string('标题'),content:string('正文'),folder:string('目标目录')},['title','content','folder']),outputSchema:schema({destination:string('目标位置'),documentId:string('文档编号'),receiptId:string('回执编号')},['destination','documentId','receiptId']),example:{title:'产品研究简报',content:'示例研究结果',folder:'/产品研究'}},
      {id:'table.upsert',name:'upsert_record',title:'更新数据记录',kind:'plugin',pluginId:'table',connectionId:'plugin-table',version:'1.0.0',description:'按 key 新增或更新记录；模拟幂等键。',write:true,inputSchema:schema({table:string('表名'),key:string('记录键'),values:{type:'object',additionalProperties:true}},['table','key','values']),outputSchema:schema({destination:string('记录位置'),updated:{type:'boolean'},receiptId:string('回执编号')},['destination','updated','receiptId']),example:{table:'research-records',key:'weekly-01',values:{status:'reviewed',topic:'企业 Agent'}}}
    ],
    resources:[{id:'resource-style',name:'研究写作规范',title:'研究写作规范',connectionId:'mcp-workspace',uri:'workspace://guides/research',mimeType:'text/plain',text:'保留信息来源；区分事实与推断；写明空结果；外部写入前确认目标位置。',version:'1.0'}],
    prompts:[{id:'prompt-report',name:'report_brief',title:'研究简报提示词',connectionId:'mcp-workspace',version:'1.0',arguments:[{name:'topic',required:true}],template:'请围绕 {{topic}} 生成摘要、证据和下一步，保留引用。'}],
    skills:[{id:'skill-research',name:'研究方法',title:'研究方法',version:'1.0',description:'先定义问题，再检索、对比、验证和说明限制。',content:'明确问题；检索可信资料；区分事实与判断；输出简洁结论。',dependencies:['web.search']}],
    testCases:[],receipts:[],memory:{},schema:2
  };
  if (!S.state.capabilities || S.state.capabilities.schema !== 2) S.state.capabilities=copy(seeds);
  for (const key of ['connections','plugins','tools','resources','prompts','skills','testCases']) Object.defineProperty(R,key,{get:()=>S.state.capabilities[key]});
  R.getTool = id => R.tools.find(tool=>tool.id===id);
  R.getConnection = id => R.connections.find(connection=>connection.id===id);
  for(const type of ['mcp','plugin']){const def=R.nodeType(type);const tool=R.getTool(def.defaults.toolId);def.inputs=copy(tool.inputSchema);defaultBindings[type]=Object.fromEntries(Object.entries(tool.example).map(([key,value])=>[key,constant(value)]));if(type==='mcp')defaultBindings[type].query=ref('input.topic');}
  R.inputSchemaFor=node=>{
    if(['mcp','plugin'].includes(node.type))return R.getTool(node.config?.toolId)?.inputSchema;
    if(node.type==='prompt'){
      const c=node.config||{};let prompt=c.promptSnapshot;
      if(!prompt){try{prompt=S.ContentStore?.getContent(c.promptId)?S.ContentStore.resolveContext({kind:'prompt',id:c.promptId,version:c.version}):R.prompts.find(p=>p.id===c.promptId);}catch(_){}}
      if(prompt)return schema(Object.fromEntries((prompt.arguments||[]).map(a=>[a.name,{type:'string',description:a.description||a.name}])),(prompt.arguments||[]).filter(a=>a.required).map(a=>a.name));
    }
    return R.nodeType(node.type)?.inputs;
  };
  R.testConnection = id => { const c=R.getConnection(id); if(!c) return {ok:false,error:'连接不存在'};const configured=Boolean(c.endpoint||c.command),authorized=Boolean(c.credentialRef||c.authType==='none')&&S.Credentials?.isUsable('tool',c.credentialRef)!==false,discovered=R.tools.some(t=>t.connectionId===c.id)||R.resources.some(r=>r.connectionId===c.id)||R.prompts.some(p=>p.connectionId===c.id); const ok=c.enabled!==false&&configured&&authorized&&discovered;c.status=ok?'ready':c.enabled===false?'disabled':!authorized?'auth_required':'unverified';c.lastTest={at:Date.now(),ok,simulated:true,checks:[{name:'本地配置',ok:configured},{name:'凭据引用',ok:authorized},{name:'本地模拟能力',ok:discovered}]};S.save();return c.lastTest; };
  R.refreshCapabilities = id => { const c=R.getConnection(id); if(!c) return {ok:false,error:'连接不存在'};const result={ok:c.enabled!==false&&c.status==='ready',simulated:true,at:Date.now(),tools:R.tools.filter(t=>t.connectionId===id).length,added:[],removed:[],changed:[]};c.lastDiscovery=result;S.save();return result; };

  R.validateSchema = function validate(value, definition, path) {
    const errors=[], d=definition||{}, p=path||'$';
    if (value===undefined) return [p+' 缺失'];
    const type=d.type;
    if (type==='object') {
      if(value===null||typeof value!=='object'||Array.isArray(value)) return [p+' 应为对象'];
      (d.required||[]).forEach(key=>{if(value[key]===undefined)errors.push(p+'.'+key+' 为必填字段');});
      Object.keys(value).forEach(key=>{if(unsafeKeys.has(key))errors.push(p+' 包含不允许的字段');else if(d.properties&&d.properties[key])errors.push(...validate(value[key],d.properties[key],p+'.'+key));else if(d.additionalProperties===false)errors.push(p+'.'+key+' 不是已声明字段');});
    } else if(type==='array') {if(!Array.isArray(value))return[p+' 应为数组'];if(d.items)value.forEach((item,i)=>errors.push(...validate(item,d.items,p+'['+i+']')));}
    else if(type==='integer'&&(!Number.isInteger(value))) errors.push(p+' 应为整数');
    else if(type==='number'&&(typeof value!=='number'||!Number.isFinite(value)))errors.push(p+' 应为有限数字');
    else if(type==='boolean'&&typeof value!=='boolean')errors.push(p+' 应为布尔值');
    else if(type==='string'&&typeof value!=='string')errors.push(p+' 应为文本');
    if(d.enum&&!d.enum.includes(value))errors.push(p+' 不在允许值中');
    if(typeof value==='number'&&d.minimum!==undefined&&value<d.minimum)errors.push(p+' 小于最小值 '+d.minimum);
    if(typeof value==='number'&&d.maximum!==undefined&&value>d.maximum)errors.push(p+' 超过最大值 '+d.maximum);
    if(typeof value==='string'&&d.minLength!==undefined&&value.length<d.minLength)errors.push(p+' 字符数不足');
    return errors;
  };
  function getPath(context,path) {
    if(typeof path!=='string'||!path)throw issue('INVALID_REF','变量路径为空。');
    const parts=path.replace(/\[(\d+)\]/g,'.$1').split('.');
    if(parts[0]==='secretRef')throw issue('SECRET_SCOPE','凭据引用只能用于凭据配置，不能作为普通文本。');
    let cursor=context;
    for(const part of parts){if(unsafeKeys.has(part)||cursor===null||cursor===undefined||!Object.prototype.hasOwnProperty.call(Object(cursor),part))throw issue('UNPRODUCED','变量尚未产生：'+path,{path});cursor=cursor[part];}
    return copy(cursor);
  }
  function compare(left,operator,right) {
    if(operator==='empty')return left===null||left===undefined||left===''||(Array.isArray(left)&&left.length===0);
    if(operator==='not_empty')return !compare(left,'empty');
    if(operator==='eq')return JSON.stringify(left)===JSON.stringify(right);
    if(operator==='neq')return !compare(left,'eq',right);
    if(operator==='contains')return Array.isArray(left)?left.some(x=>compare(x,'eq',right)):String(left).includes(String(right));
    if(['gt','gte','lt','lte','add','subtract','multiply'].includes(operator)) { if(typeof left!=='number'||typeof right!=='number')throw issue('TYPE_MISMATCH','数值比较或计算需要 number 输入。'); }
    switch(operator){case'gt':return left>right;case'gte':return left>=right;case'lt':return left<right;case'lte':return left<=right;case'add':return left+right;case'subtract':return left-right;case'multiply':return left*right;default:throw issue('EXPRESSION','不支持的运算：'+operator);}
  }
  R.resolveBinding = (binding, context) => {
    if(binding&&typeof binding==='object'&&!Array.isArray(binding)&&binding.mode){
      if(binding.mode==='constant'||binding.mode==='literal')return copy(binding.value);
      if(binding.mode==='ref')return getPath(context,binding.path||binding.value);
      if(binding.mode==='template')return String(binding.value||'').replace(/{{\s*([^{}]+?)\s*}}/g,(_,path)=>{const value=getPath(context,path.trim());return typeof value==='string'?value:JSON.stringify(value);});
      if(binding.mode==='expression')return compare(R.resolveBinding(binding.left,context),binding.operator,R.resolveBinding(binding.right,context));
      throw issue('BINDING_MODE','不支持的输入方式。');
    }
    return copy(binding);
  };
  function resolveMap(bindings,context) { const result={};for(const [key,value] of Object.entries(bindings||{})){if(unsafeKeys.has(key))throw issue('INVALID_KEY','字段名称不被允许。');result[key]=R.resolveBinding(value,context);}return result; }
  function evaluateConditions(group,context) {
    const evaluations=(group.conditions||[]).map(condition=>{const left=R.resolveBinding(condition.left,context), right=R.resolveBinding(condition.right,context);return{left,operator:condition.operator,right,result:compare(left,condition.operator,right)};});
    return {matched:group.combinator==='or'?evaluations.some(x=>x.result):evaluations.every(x=>x.result),evaluations};
  }
  R.createRun = opts => {
    const o=opts||{};const parent=o.parentRunId&&R.findRun(o.parentRunId);const run={id:uid('run'),traceId:parent?.traceId||hex(32),spanId:hex(16),parentSpanId:parent?.spanId,engine:'graph',kind:o.kind||'workflow',title:o.title||'未命名任务',source:o.source||'工作流',agent:o.agent||'',model:o.model||'',version:o.version||'草稿',status:'running',created:Date.now(),time:'刚刚',duration:0,inputs:copy(o.inputs||{}),snapshot:copy(o.snapshot||{}),capabilitySnapshots:{tools:copy(R.tools),connections:copy(R.connections)},events:[],nodeExecutions:[],toolCalls:[],outcome:{receipts:[],artifacts:[]},artifacts:[],tokens:0,cost:0,usageKind:'estimated',step:0,needsApproval:false,simulated:true,...(o.parentRunId?{parentRunId:o.parentRunId}:{})};
    S.state.runs.unshift(run);emit(run,'run.started',{kind:run.kind,title:run.title,parentRunId:run.parentRunId});return run;
  };
  R.completeRun = (run,result) => {
    if(terminal(run.status))return run;
    const r=result||{};
    if(Object.prototype.hasOwnProperty.call(r,'returnValue'))run.outcome.returnValue=copy(r.returnValue);
    if(r.message)run.outcome.message=r.message;
    if(r.receipts)run.outcome.receipts.push(...copy(r.receipts));
    if(r.artifacts)run.outcome.artifacts.push(...copy(r.artifacts));
    run.artifacts=run.outcome.artifacts;run.status='done';run.finishedAt=Date.now();run.duration=run.finishedAt-run.created;run.step=4;run.pending=null;
    emit(run,'run.completed',{hasReturnValue:Object.prototype.hasOwnProperty.call(run.outcome,'returnValue'),receiptCount:run.outcome.receipts.length,artifactCount:run.outcome.artifacts.length});return run;
  };
  R.failRun = (run,error) => { if(terminal(run.status))return run;run.status=error&&error.code==='REJECTED'?'rejected':error&&error.code==='CANCELLED'?'stopped':'failed';run.error=error&&error.message||String(error);run.errorCode=error&&error.code||'EXECUTION_ERROR';run.finishedAt=Date.now();run.duration=run.finishedAt-run.created;run.pending=null;emit(run,'run.failed',{code:run.errorCode,message:run.error});return run; };
  R.addModelUsage = (run,usage) => {if(usage?.modelSnapshot&&S.Models)S.Models.assertAvailable(usage.modelSnapshot,{type:usage.modelSnapshot.type});const u=Object.assign({inputTokens:0,outputTokens:0,model:'模拟模型',estimated:true},usage||{});u.totalTokens=u.inputTokens+u.outputTokens;u.cost=Number((u.totalTokens*0.000002).toFixed(6));run.tokens+=u.totalTokens;run.cost=Number((run.cost+u.cost).toFixed(6));if(!run.model)run.model=u.model;emit(run,'model.usage',u);return u;};
  R.recordRetrievalUsage=(run,result,meta={})=>{for(const stage of result.modelStages||[])R.addModelUsage(run,{...meta,model:stage.snapshot.name,modelSnapshot:stage.snapshot,inputTokens:stage.inputTokens,outputTokens:stage.outputTokens||0,stage:stage.type,adapter:'deterministic-local-retrieval'});};
  function requestApproval(run,details) {
    assertActive(run);
    const pending=Object.assign({id:uid('wait'),kind:'approval',created:Date.now(),title:'确认本次操作',description:'这次操作只影响本地模拟数据。'},copy(details));
    run.pendingQueue=run.pendingQueue||[];run.pendingQueue.push(pending);run.pending=run.pendingQueue[0];run.status='waiting';run.needsApproval=true;emit(run,'run.waiting',pending);
    return new Promise((resolve,reject)=>approvals.set(pending.id,{run,resolve,reject,pending}));
  }
  R.requestApproval=requestApproval;
  R.resolveApproval = (runId,approved,values) => {
    const run=R.findRun(runId);if(!run||run.status!=='waiting'||!run.pending)return false;
    const pending=run.pending;if(pending.childRunId)return R.resolveApproval(pending.childRunId,approved,values);const handler=approvals.get(pending.id);if(!handler)return false;
    if(values&&values.waitId&&values.waitId!==pending.id)return false;
    const valuesCopy=copy(values||{});delete valuesCopy.waitId;
    if(approved&&pending.fields){const props={};const required=[];pending.fields.forEach(f=>{if(unsafeKeys.has(f.name))return;const type=f.type==='text'?'string':f.type||'string';props[f.name]={type,...(f.required&&type==='string'?{minLength:1}:{})};if(f.required)required.push(f.name);if(typeof valuesCopy[f.name]==='string'&&valuesCopy[f.name].trim()){if(type==='number'||type==='integer')valuesCopy[f.name]=Number(valuesCopy[f.name]);if(type==='boolean'&&['true','false'].includes(valuesCopy[f.name]))valuesCopy[f.name]=valuesCopy[f.name]==='true';if(type==='object'||type==='array'){try{valuesCopy[f.name]=JSON.parse(valuesCopy[f.name]);}catch(_){}}}});const errs=R.validateSchema(valuesCopy,{type:'object',properties:props,required,additionalProperties:true});if(errs.length){run.pending.validationErrors=errs;emit(run,'approval.invalid',{errors:errs});return false;}}
    approvals.delete(pending.id);run.pendingQueue=(run.pendingQueue||[]).filter(x=>x.id!==pending.id);run.pending=run.pendingQueue[0]||null;run.status=run.pending?'waiting':'running';
    emit(run,approved?'approval.approved':'approval.rejected',{waitId:pending.id,nodeId:pending.nodeId,toolCallId:pending.toolCallId,values:valuesCopy});
    handler.resolve({approved:!!approved,values:valuesCopy});return true;
  };
  R.resume = runId => R.resolveApproval(runId,true,{});
  R.stop = runId => { const run=R.findRun(runId);if(!run||terminal(run.status))return false;run.status='stopped';run.finishedAt=Date.now();run.duration=run.finishedAt-run.created;run.pending=null;run.pendingQueue=[];for(const [id,entry]of approvals){if(entry.run.id===runId){approvals.delete(id);entry.reject(issue('CANCELLED','运行已停止。'));}}run.toolCalls.filter(c=>['running','waiting'].includes(c.status)).forEach(c=>{c.status='cancelled';c.endedAt=Date.now();c.error={code:'CANCELLED',message:'本地模拟已停止；真实外部操作的取消不能保证回滚。'};});emit(run,'run.stopped',{message:'模拟执行已停止。已确认的写入回执保留。'});S.state.runs.filter(x=>x.parentRunId===runId&&!terminal(x.status)).forEach(child=>R.stop(child.id));return true; };

  const scenarioFor=(run,nodeId,override)=>override||((typeof run.scenario==='object'&&run.scenario!==null)?run.scenario[nodeId]||'success':run.scenario||'success');
  R.invokeTool = async options => {
    const o=options||{},run=o.run,tool=run?.capabilitySnapshots?.tools?.find(t=>t.id===o.toolId)||R.getTool(o.toolId);if(!run)throw issue('RUN_REQUIRED','工具调用需要运行记录。');assertActive(run);
    const call={id:uid('call'),traceId:run.traceId,spanId:hex(16),parentSpanId:run.spanId,toolId:o.toolId,toolName:tool?tool.title:o.toolId,write:!!tool?.write,effectStatus:tool?.write?'not_started':undefined,connectionId:o.connectionId||(tool&&tool.connectionId),nodeId:o.nodeId,nodeExecutionId:o.nodeExecutionId,requestId:uid('rpc'),status:'running',args:safe(o.args||{}),startedAt:Date.now(),transcript:[],version:tool&&tool.version||'unknown'};
    run.toolCalls.push(call);emit(run,'tool.started',{toolCallId:call.id,nodeId:o.nodeId,nodeExecutionId:o.nodeExecutionId,toolId:o.toolId,args:call.args});
    try {
      if(!tool)throw issue('TOOL_NOT_FOUND','未找到工具：'+o.toolId);
      if(o.binding&&o.binding.enabled===false)throw issue('TOOL_DISABLED','此能力绑定已禁用。');if(o.binding?.toolId&&o.binding.toolId!==tool.id)throw issue('POLICY_DENIED','能力绑定不允许调用该工具。');if(o.binding?.version&&o.binding.version!==tool.version)throw issue('VERSION_MISMATCH','绑定版本 '+o.binding.version+' 当前不可用；请检查升级影响并重新绑定 '+tool.version+'。');
      const connection=R.getConnection(call.connectionId);const connectionSnapshot=run.capabilitySnapshots?.connections?.find(c=>c.id===call.connectionId)||connection;call.connectionVersion=connectionSnapshot?.version;if(!connection)throw issue('CONNECTION_NOT_FOUND','连接实例不存在。');
      if(connection.enabled===false||connection.status==='disabled')throw issue('CONNECTION_DISABLED','连接已禁用，请启用后重试。');
      S.Credentials?.assertUsable('tool',connection.credentialRef);
      S.Credentials?.assertUsable('tool',connectionSnapshot?.credentialRef);
      if(connection.status==='auth_required'||(!connection.credentialRef&&connection.authType!=='none'))throw issue('AUTH_REQUIRED','连接需要配置凭据引用。');
      const plugin=tool.pluginId&&R.plugins.find(p=>p.id===tool.pluginId);if(tool.pluginId&&(!plugin||plugin.enabled===false||plugin.status!=='installed'))throw issue('PLUGIN_DISABLED','插件未安装或已禁用。');
      if(connection.status!=='ready')throw issue('CONNECTION_NOT_READY','连接尚未就绪，请先测试连接配置。');
      const args=copy(o.args||{});const errs=R.validateSchema(args,tool.inputSchema);if(errs.length)throw issue('INPUT_SCHEMA',errs.join('；'),{details:errs});
      if((tool.write||o.binding&&o.binding.approval==='always')&&!o.approved){call.status='waiting';const approval=await requestApproval(run,{kind:'approval',title:tool.write?'确认目标位置与写入内容':'确认工具调用',description:tool.description,toolCallId:call.id,nodeId:o.nodeId,nodeExecutionId:o.nodeExecutionId,args:copy(args),preview:args.content||args.values||args,fields:[]});if(!approval.approved)throw issue('REJECTED','用户拒绝了工具调用。');call.status='running';}
      assertActive(run);
      S.Credentials?.assertUsable('tool',connection.credentialRef);
      S.Credentials?.assertUsable('tool',connectionSnapshot?.credentialRef);
      if(connection.enabled===false||connection.status==='disabled')throw issue('CONNECTION_DISABLED','审批期间连接已被禁用。');if(connection.status!=='ready'||(!connection.credentialRef&&connection.authType!=='none'))throw issue('AUTH_REQUIRED','审批期间连接授权已失效。');
      const scenario=scenarioFor(run,o.nodeId,o.scenario);call.scenario=scenario;
      const meta={protocolVersion:connectionSnapshot.protocolVersion||'2026-07-28',clientInfo:{name:'OTRYX Prototype',version:'1.0'},traceparent:'00-'+run.traceId+'-'+call.spanId+'-01'};
      call.transcript.push({direction:'request',time:Date.now(),transport:connectionSnapshot.transport,requestId:call.requestId,body:{jsonrpc:'2.0',id:call.requestId,method:'tools/call',params:{name:tool.name,arguments:copy(args),_meta:meta}}});
      emit(run,'tool.request',{toolCallId:call.id,requestId:call.requestId,transport:connectionSnapshot.transport,connectionId:connection.id});
      const requestStartedAt=Date.now();await delay(run,o.speed);assertActive(run);const timeoutMs=Number(o.timeoutMs||o.binding?.timeoutMs||0);if(timeoutMs>0&&Date.now()-requestStartedAt>timeoutMs)throw issue('TIMEOUT','工具超过配置的 '+timeoutMs+'ms 超时限制。');
      if(scenario==='timeout')throw issue('TIMEOUT','模拟工具超时。可调整超时策略或重试。');
      if(scenario==='auth_error')throw issue('AUTH_REQUIRED','模拟授权过期，请更新凭据引用。');
      if(scenario==='protocol_error')throw issue('PROTOCOL_ERROR','模拟协议响应缺少有效 JSON-RPC 内容。');
      if(scenario==='tool_error'){call.transcript.push({direction:'response',time:Date.now(),requestId:call.requestId,httpStatus:connectionSnapshot.transport==='Streamable HTTP'?200:undefined,body:{jsonrpc:'2.0',id:call.requestId,result:{isError:true,content:[{type:'text',text:'工具未能完成请求（模拟）。'}]}}});throw issue('TOOL_ERROR','工具执行失败（isError: true）；协议响应成功不代表任务成功。');}
      let result;const adapterId=tool.adapterId||tool.originToolId||tool.id;
      if(adapterId==='web.search') {const limit=args.limit===undefined?3:args.limit;const suffix=['产品架构与能力目录','工作流与人工协作','工具调试与运行观察','模型接入和费用','公共能力治理','知识与记忆','发布与版本','部署与运维'];const empty=scenario==='empty'||String(args.query).includes('无结果');const items=empty?[]:suffix.slice(0,limit).map((title,i)=>({title:args.query+' · '+title,url:'https://example.invalid/research/'+encodeURIComponent(args.query)+'/'+(i+1),summary:'围绕“'+args.query+'”的示例资料 '+(i+1)+'，用于验证输入、分支和参数流转。'}));result={items,total:items.length};}
      else if(adapterId==='web.fetch')result={url:args.url,title:'页面资料',text:'来自 '+args.url+' 的模拟正文。包含能力配置、调用链路和执行结果。'};
      else if(adapterId==='workspace.write')result={destination:args.path,written:true,receiptId:uid('receipt'),bytes:new TextEncoder().encode(args.content).length};
      else if(adapterId==='docs.create')result={destination:args.folder.replace(/\/$/,'')+'/'+args.title,documentId:uid('doc'),receiptId:uid('receipt')};
      else if(adapterId==='table.upsert')result={destination:'table://'+args.table+'/'+args.key,updated:true,receiptId:uid('receipt')};
      else result=copy(tool.mockResult||{result:args});
      if(scenario==='schema_error')result={invalid:'此结果故意违反输出 Schema'};
      call.transcript.push({direction:'response',time:Date.now(),requestId:call.requestId,httpStatus:connectionSnapshot.transport==='Streamable HTTP'?200:undefined,body:{jsonrpc:'2.0',id:call.requestId,result:{isError:false,structuredContent:copy(result),content:[{type:'text',text:JSON.stringify(result)}]}}});
      const outputErrors=R.validateSchema(result,tool.outputSchema);if(outputErrors.length)throw issue('OUTPUT_SCHEMA','输出校验失败：'+outputErrors.join('；'),{details:outputErrors});
      if(tool.write){call.effectStatus='confirmed';const receipt={id:result.receiptId,kind:'external-write',destination:result.destination,title:args.title||args.path||args.key,toolCallId:call.id,simulated:true,at:Date.now()};run.outcome.receipts.push(receipt);S.state.capabilities.receipts.push(copy(receipt));emit(run,'effect.recorded',{toolCallId:call.id,receipt});}
      call.status='done';call.result=copy(result);call.endedAt=Date.now();call.duration=call.endedAt-call.startedAt;emit(run,'tool.completed',{toolCallId:call.id,nodeId:o.nodeId,nodeExecutionId:o.nodeExecutionId,result:call.result,duration:call.duration});return copy(result);
    } catch(error) {call.status=error.code==='CANCELLED'?'cancelled':error.code==='REJECTED'?'rejected':'failed';if(tool?.write&&call.transcript.some(x=>x.direction==='request')&&['TIMEOUT','OUTPUT_SCHEMA','CANCELLED','PROTOCOL_ERROR'].includes(error.code)){call.effectStatus='unknown';error.message+='；模拟外部写入的完成状态未知，重试前应核对目标位置。';}call.error={code:error.code||'TOOL_ERROR',message:error.message};call.endedAt=Date.now();call.duration=call.endedAt-call.startedAt;emit(run,'tool.failed',{toolCallId:call.id,nodeId:o.nodeId,code:call.error.code,message:call.error.message});throw error;}
  };
  R.testTool=(toolId,args,options)=>{const tool=R.getTool(toolId),o=options||{};const run=R.createRun({title:'测试 · '+(tool?tool.title:toolId),kind:'tool-debug',source:'工具调试器',inputs:args,version:tool&&tool.version,snapshot:{tool:copy(tool)}});run.speed=o.speed;run.scenario=o.scenario||'success';Promise.resolve().then(async()=>{try{const result=await R.invokeTool({run,toolId,args,...o});R.completeRun(run,{returnValue:result});}catch(error){R.failRun(run,error);}});return run;};

  function refsIn(value, found) {
    const result=found||[];if(!value||typeof value!=='object')return result;
    if(value.mode==='ref'&&typeof(value.path||value.value)==='string')result.push(value.path||value.value);
    if(value.mode==='template')for(const match of String(value.value||'').matchAll(/{{\s*([^{}]+?)\s*}}/g))result.push(match[1].trim());
    for(const v of Object.values(value))if(v&&typeof v==='object')refsIn(v,result);
    return result;
  }
  function ancestors(flow,id) {
    const result=new Set();const visit=target=>(flow.edges||[]).filter(e=>e.target===target).forEach(e=>{if(!result.has(e.source)){result.add(e.source);visit(e.source);}});visit(id);result.delete(id);return result;
  }
  R.validate=flow=>{
    const errors=[],warnings=[],nodes=flow.nodes||[],edges=flow.edges||[],ids=new Set(nodes.map(n=>n.id));
    const add=(code,message,nodeId)=>errors.push({code,message,...(nodeId?{nodeId}:{})});
    if(!nodes.length)add('EMPTY_GRAPH','流程至少需要一个节点。');
    if(ids.size!==nodes.length)add('DUPLICATE_ID','节点 ID 必须唯一。');
    const entries=nodes.filter(n=>!edges.some(e=>e.target===n.id));
    if(nodes.length&&entries.length!==1)add('ENTRY_COUNT','流程应有一个入口节点；通过并行节点显式分发。');
    edges.forEach(e=>{if(!ids.has(e.source)||!ids.has(e.target))add('MISSING_NODE','连线引用了不存在的节点。',e.source);const source=nodes.find(n=>n.id===e.source);if(source&&!R.ports(source).some(p=>p.id===(e.sourcePort||'next')))add('INVALID_PORT','无效出口：'+(e.sourcePort||'next'),e.source);if(e.source===e.target)add('CYCLE','节点不能连接自身。',e.source);});
    const visitState={};function visit(id){if(visitState[id]===1){add('CYCLE','不允许任意回连；请使用循环容器。',id);return;}if(visitState[id]===2)return;visitState[id]=1;edges.filter(e=>e.source===id&&ids.has(e.target)).forEach(e=>visit(e.target));visitState[id]=2;}nodes.forEach(n=>visit(n.id));
    const reached=new Set();function reach(id){if(reached.has(id))return;reached.add(id);edges.filter(e=>e.source===id).forEach(e=>reach(e.target));}if(entries[0])reach(entries[0].id);
    nodes.forEach(node=>{
      if(!R.nodeType(node.type))add('NODE_TYPE','未知节点类型：'+node.type,node.id);
      if(!reached.has(node.id))add('UNREACHABLE','节点无法从入口到达。',node.id);
      const allowed=ancestors(flow,node.id);
      const effectiveBindings=(node.type==='output'&&node.config?.mode==='none')||(node.type==='mapping'&&node.config?.mapping)?{}:node.bindings||{};
      const refConfig={...(node.config||{})};delete refConfig.body;delete refConfig.resolvedSnapshot;delete refConfig.agentSnapshot;const paths=refsIn(effectiveBindings).concat(refsIn(refConfig));
      if(typeof(node.config||{}).template==='string')for(const m of node.config.template.matchAll(/{{\s*([^{}]+?)\s*}}/g))paths.push(m[1].trim());
      if(typeof(node.config||{}).prompt==='string')for(const m of node.config.prompt.matchAll(/{{\s*([^{}]+?)\s*}}/g))paths.push(m[1].trim());
      paths.forEach(path=>{const parts=path.split('.');if(parts[0]==='nodes'&&!allowed.has(parts[1])&&!(flow.nested&&!ids.has(parts[1])))add('REF_SCOPE','引用必须来自可达的上游节点：'+path,node.id);if(parts[0]==='secretRef')add('SECRET_SCOPE','密钥引用只能放入凭据配置。',node.id);if(parts[0]==='iteration'&&node.type!=='iteration'&&!flow.nested)add('REF_SCOPE','iteration 变量只能在迭代容器中使用。',node.id);if(parts[0]==='loop'&&node.type!=='loop'&&!flow.nested)add('REF_SCOPE','loop 变量只能在循环容器中使用。',node.id);});
      const c=node.config||{};
      if(node.type==='llm'&&S.Models){const check=S.Models.validate(c.modelSnapshot||c.model,{type:'llm',capabilities:c.outputMode==='json'?['json']:[]});if(!check.ok)add(check.code,check.message,node.id);}
      if(['mcp','plugin'].includes(node.type)){
        const tool=R.getTool(c.toolId);if(!tool)add('TOOL_NOT_FOUND','请选择存在的具体工具。',node.id);else{const conn=R.getConnection(tool.connectionId);if(!conn||conn.enabled===false||conn.status!=='ready')warnings.push({nodeId:node.id,code:'CONNECTION_STATE',message:'连接未就绪，运行时会阻止该工具。'});(tool.inputSchema.required||[]).forEach(key=>{if(!Object.prototype.hasOwnProperty.call(node.bindings||{},key))add('REQUIRED_BINDING','工具必填参数未绑定：'+key,node.id);});for(const [key,value]of Object.entries(node.bindings||{})){if(value&&value.mode==='ref')continue;if(value&&['template','expression'].includes(value.mode))continue;const def=tool.inputSchema.properties[key];if(def){const errs=R.validateSchema(value&&value.mode==='constant'?value.value:value,def);errs.forEach(message=>add('INPUT_TYPE',key+'：'+message,node.id));}}}
      }
      const inputContract=R.inputSchemaFor(node);
      if(inputContract){
        (inputContract.required||[]).forEach(key=>{if(!Object.prototype.hasOwnProperty.call(node.bindings||{},key)&&!['mcp','plugin'].includes(node.type))add('REQUIRED_BINDING','必填输入未绑定：'+key,node.id);});
        Object.entries(effectiveBindings).forEach(([key,binding])=>{
          const expected=inputContract.properties?.[key]?.type;if(!expected||!binding||binding.mode!=='ref')return;
          const parts=String(binding.path||binding.value||'').split('.');let actual;
          if(parts[0]==='input')actual=nodes.find(n=>n.type==='input')?.config?.fields?.find(f=>f.name===parts[1])?.type;
          if(parts[0]==='nodes'){const source=nodes.find(n=>n.id===parts[1]);let definition=R.nodeType(source?.type)?.outputs?.[parts[2]];if(source&&['mcp','plugin'].includes(source.type)&&parts[2]==='result'){definition=R.getTool(source.config?.toolId)?.outputSchema;for(const part of parts.slice(3))definition=definition?.properties?.[part]||(/^\d+$/.test(part)?definition?.items:undefined);}actual=definition?.type;if(['merge','code','memory','assign','output'].includes(source?.type))actual=undefined;if(parts.length>3&&!['mcp','plugin'].includes(source?.type))actual=undefined;}
          if(actual&&expected!==actual&&!(expected==='number'&&actual==='integer'))add('REF_TYPE',key+' 需要 '+expected+'，来源为 '+actual+'：'+(binding.path||binding.value),node.id);
        });
      }

      if(node.type==='loop'&&(!(c.maxRounds>0)||c.maxRounds>50))add('LOOP_LIMIT','最大轮数应在 1–50 之间。',node.id);
      if(node.type==='control'&&!flow.nested)add('CONTROL_SCOPE','Break / Continue 只允许在容器子图中。',node.id);
      if(node.type==='if'&&!edges.some(e=>e.source===node.id&&e.sourcePort==='false'))warnings.push({nodeId:node.id,code:'NO_ELSE',message:'条件未命中时将直接结束这条路径。'});
      if(node.type==='output'&&c.mode==='data'&&!Object.keys(node.bindings||{}).length)warnings.push({nodeId:node.id,code:'EMPTY_RETURN',message:'返回数据模式当前会返回空对象。'});
      if(c.body){const nested=R.validate({...c.body,nested:true});nested.errors.forEach(e=>add(e.code,'容器内：'+e.message,node.id));}
    });
    return{valid:errors.length===0,errors,warnings};
  };
  R.listVariables=(flow,nodeId,run)=>{
    const vars=[],allowed=ancestors(flow,nodeId);const add=(path,type,label,sample)=>vars.push({path,type,label,...(sample!==undefined?{sample:copy(sample)}:{})});
    const inputFields=(flow.nodes||[]).find(n=>n.type==='input')?.config?.fields||[];
    const inputKeys=new Set([...Object.keys(flow.inputs||{}),...inputFields.map(f=>f.name)]);
    inputKeys.forEach(key=>add('input.'+key,inputFields.find(f=>f.name===key)?.type||typeof(flow.inputs||{})[key],'任务输入 · '+key,run?.inputs?.[key]??flow.inputs?.[key]));
    add('sys.run_id','string','系统 · 运行 ID',run?.id);add('sys.tenant_id','string','系统 · 租户','personal-demo');
    (flow.nodes||[]).filter(n=>allowed.has(n.id)).forEach(node=>{let outputs=R.nodeType(node.type)?.outputs||{};const execution=run?.nodeExecutions?.filter(e=>e.nodeId===node.id&&e.status==='done').at(-1);Object.entries(outputs).forEach(([key,d])=>{add('nodes.'+node.id+'.'+key,d.type,node.title+' · '+key,execution?.output?.[key]);});if(['mcp','plugin'].includes(node.type)){const tool=R.getTool(node.config?.toolId);Object.entries(tool?.outputSchema?.properties||{}).forEach(([key,d])=>add('nodes.'+node.id+'.result.'+key,d.type,node.title+' · '+key,execution?.output?.result?.[key]));}});
    return vars;
  };
  R.snapshot=flow=>copy({id:flow.id,title:flow.title,description:flow.description,version:flow.version,graphSchema:2,nodes:flow.nodes||[],edges:flow.edges||[],inputs:flow.inputs||{},inputSchema:flow.inputSchema,outputSchema:flow.outputSchema});
  R.publishedFlow=id=>{const flow=R.flows.find(f=>f.id===id);return flow&&flow.publishedSnapshot?copy(flow.publishedSnapshot):null;};
  // 发布服务、离线评测与运行复用同一套依赖快照规则。
  R.freezeWorkflow=(flow,options={})=>{
    const snapshot=R.snapshot(flow),trail=options.trail||[],key='workflow:'+snapshot.id+'@'+snapshot.version;
    if(trail.includes(key)||trail.length>=8)throw issue('DEPENDENCY_CYCLE','存在循环依赖或超过允许的依赖深度。');
    const next={...options,trail:[...trail,key]};
    const prepare=nodes=>{for(const node of nodes||[]){
      const c=node.config=node.config||{};
      if(node.type==='llm'&&S.Models?.freezeBinding)c.modelSnapshot=S.Models.freezeBinding(c.model,c.modelSnapshot,{...options,type:'llm',capabilities:c.outputMode==='json'?['json']:[]});
      if(node.type==='subflow'){
        let dependency=c.resolvedSnapshot;
        if(!options.preserveResolvedSnapshots&&(!dependency||options.refresh)){
          const owner=R.flows.find(f=>f.id===c.flowId),versions=owner?[owner.publishedSnapshot,...(owner.versions||[])].filter(Boolean):[];
          dependency=versions.find(v=>!c.version||v.version===c.version);
        }
        if(!dependency)throw issue('DEPENDENCY_SNAPSHOT_MISSING','子流程缺少可用的发布快照：'+(c.flowId||node.title));
        if(c.version&&dependency.version!==c.version)throw issue('DEPENDENCY_VERSION','子流程快照版本不匹配：'+c.version);
        c.resolvedSnapshot=R.freezeWorkflow(dependency,{...next,refresh:false});
      }
      if(node.type==='agent'){
        let dependency=c.agentSnapshot;
        if(!options.preserveResolvedSnapshots&&(!dependency||options.refresh)){const agent=S.state.agents.find(a=>a.id===c.agentId);dependency=agent?[agent.publishedConfig,...(agent.publishedVersions||[])].filter(Boolean).find(a=>!c.version||a.version===c.version):null;}
        if(!dependency||dependency.status==='draft')throw issue('DEPENDENCY_SNAPSHOT_MISSING','Agent 节点需要已发布的配置快照：'+(c.agentId||node.title));
        c.agentSnapshot=S.AgentStudio?.freezeSnapshot?S.AgentStudio.freezeSnapshot(dependency,{...next,refresh:false}):copy(dependency);
      }
      if(node.type==='knowledge'&&c.knowledge&&S.ContentStore){
        if(!c.knowledgeSnapshot||options.refresh){
          if(options.preserveResolvedSnapshots)throw issue('KNOWLEDGE_SNAPSHOT_MISSING','知识节点缺少固定内容版本，请重新发布。');
          c.knowledgeSnapshot=S.ContentStore.snapshotKnowledge(c.knowledge);
        }
        if(!c.knowledgeSnapshot)throw issue('KNOWLEDGE_NOT_FOUND','知识库不可用：'+c.knowledge);
      }
      if(['prompt','resource'].includes(node.type)){
        const key=node.type==='prompt'?'promptSnapshot':'resourceSnapshot';
        if(!c[key]||options.refresh){
          if(options.preserveResolvedSnapshots)throw issue('CONTEXT_SNAPSHOT_MISSING','上下文节点缺少固定版本，请重新发布。');
          const local=node.type==='prompt'&&S.ContentStore?.getContent(c.promptId);
          const value=local?S.ContentStore.resolveContext({kind:'prompt',id:c.promptId,version:c.version}):(node.type==='prompt'?R.prompts:R.resources).find(item=>item.id===(c.promptId||c.resourceId)&&(!c.version||String(item.version)===String(c.version)));
          if(!value)throw issue('CONTEXT_NOT_FOUND','上下文资源或版本不存在。');
          c[key]=copy(value);
        }
      }
      if(['mcp','plugin'].includes(node.type)&&c.toolId){const tool=R.getTool(c.toolId);if(tool&&!c.binding)c.binding={toolId:tool.id,connectionId:c.connectionId||tool.connectionId,version:tool.version,enabled:true,approval:tool.write?'write':'never'};}
      if(c.body?.nodes)prepare(c.body.nodes);
    }};
    prepare(snapshot.nodes);return snapshot;
  };


  function contextFor(run,provided) {return Object.assign({input:copy(run.inputs),sys:{run_id:run.id,tenant_id:'personal-demo'},nodes:{},workflow:{},conversation:{language:'zh-CN'},env:{default_language:'zh-CN'}},copy(provided||{}));}
  function executionFor(run,node,scope){const item={id:uid('node-exec'),traceId:run.traceId,spanId:hex(16),parentSpanId:run.spanId,nodeId:node.id,title:node.title,type:node.type,status:'running',startedAt:Date.now(),inputs:{},attempts:[],...(scope||{})};run.nodeExecutions.push(item);emit(run,'node.started',{nodeId:node.id,nodeExecutionId:item.id,title:node.title,type:node.type,...scope});return item;}
  async function performNode(run,node,ctx,execution,flow) {
    const c=node.config||{},input=execution.inputs;
    switch(node.type){
      case'input':{const values={...copy(ctx.input)};for(const f of c.fields||[]){if(values[f.name]===undefined&&f.default!==undefined)values[f.name]=copy(f.default);if(f.required&&(values[f.name]===undefined||values[f.name]===''))throw issue('INPUT_REQUIRED','请输入 '+f.name);if(values[f.name]!==undefined){const errs=R.validateSchema(values[f.name],{type:f.type||'string'});if(errs.length)throw issue('INPUT_TYPE',f.name+'：'+errs.join('；'));}}ctx.input=values;return values;}
      case'webhook':case'event':return{event:copy(input.event||ctx.input),simulated:true};
      case'schedule':return{scheduledAt:new Date().toISOString(),timezone:c.timezone,simulated:true};
      case'mcp':case'plugin':{const grants=ctx.__writeApprovals||[];const grant=grants.find(g=>!g.used&&g.toolId===c.toolId&&g.signature===JSON.stringify(input));if(grant)grant.used=true;const result=await R.invokeTool({run,toolId:c.toolId,connectionId:c.connectionId,args:input,nodeId:node.id,nodeExecutionId:execution.id,scenario:scenarioFor(run,node.id),approved:!!grant,binding:c.binding,timeoutMs:node.policy?.timeout||node.policy?.timeoutMs});return{result};}
      case'llm':{
        if(S.Models)S.Models.assertAvailable(c.modelSnapshot||c.model,{type:'llm',capabilities:c.outputMode==='json'?['json']:[]});
        const prompt=R.resolveBinding(template(c.prompt||'整理当前信息。'),ctx);const topic=ctx.input.topic||input.topic||'当前任务';const content=input.content===undefined?input.context:input.content;
        const details=content===undefined?'围绕输入目标整理观察、证据与下一步。':typeof content==='string'?content:JSON.stringify(content,null,2);
        const text='# '+topic+'\n\n'+prompt+'\n\n## 资料摘要\n'+details+'\n\n## 结论\n这是基于当前输入的本地模拟响应；内容与分支来自本次运行。';
        R.addModelUsage(run,{nodeId:node.id,nodeExecutionId:execution.id,model:c.modelSnapshot?.name||c.model||'DeepSeek Chat',modelSnapshot:c.modelSnapshot,inputTokens:Math.ceil((prompt+details).length/1.7),outputTokens:Math.ceil(text.length/1.7)});
        return{text,result:c.outputMode==='json'?{topic,summary:details,conclusion:'已根据输入整理',sourceCount:Array.isArray(content)?content.length:1}:null};
      }
      case'agent':{
        const agent=S.state.agents.find(a=>a.id===c.agentId);if(!agent)throw issue('AGENT_NOT_FOUND','Agent 不存在。');const snapshot=c.agentSnapshot?copy(c.agentSnapshot):S.agentRuntime(agent);const bindings=(snapshot.capabilityBindings||[]).filter(b=>b.enabled!==false);const results=[];const goal=input.goal||ctx.input.topic||'分析当前信息';
        if(S.AgentStudio&&typeof S.AgentStudio.start==='function'){
          const childSnapshot=copy(snapshot);childSnapshot.executionPolicy={...(childSnapshot.executionPolicy||{}),maxRounds:Math.max(1,Number(c.maxRounds)||4)};
          const child=S.AgentStudio.start({agentId:agent.id,snapshot:childSnapshot,goal:String(goal),mode:'execute',parentRunId:run.id,depth:(run.depth||0)+1,preserveResolvedSnapshots:run.preserveResolvedSnapshots});
          if(!child)throw issue('AGENT_START','Agent 未能创建运行。');execution.childRunId=child.id;emit(run,'agent.child.started',{nodeId:node.id,nodeExecutionId:execution.id,childRunId:child.id,agentId:agent.id,version:snapshot.version});
          const unsubscribe=R.subscribe(changed=>{if(changed.id===child.id&&changed.status==='waiting'){run.pending={...copy(changed.pending),childRunId:child.id};run.status='waiting';emit(run,'agent.child.waiting',{nodeId:node.id,childRunId:child.id});}else if(changed.id===child.id&&run.pending?.childRunId===child.id&&changed.status!=='waiting'){run.pending=null;run.status='running';}});
          await R.waitForRun(child);unsubscribe();assertActive(run);if(child.status!=='done')throw issue('AGENT_FAILED','Agent 子运行未完成：'+(child.error||child.status));
          run.outcome.receipts.push(...(child.outcome.receipts||[]).map(receipt=>({...copy(receipt),sourceRunId:child.id,reference:true})));
          run.outcome.artifacts.push(...(child.outcome.artifacts||[]).map(artifact=>({...copy(artifact),sourceRunId:child.id,reference:true})));run.artifacts=run.outcome.artifacts;
          emit(run,'agent.child.completed',{nodeId:node.id,childRunId:child.id});return{text:child.answer||String(child.outcome.returnValue||''),result:copy(child.outcome.returnValue),toolResults:child.toolCalls.map(call=>({id:call.id,toolId:call.toolId,status:call.status,result:copy(call.result)})),childRunId:child.id,agentVersion:snapshot.version};
        }
        emit(run,'agent.mock_fallback',{nodeId:node.id,mode:'limited-local-adapter',message:'独立执行器模式仅演示检索；完整产品通过 AgentStudio 执行绑定能力。'});
        const search=bindings.find(b=>R.getTool(b.toolId)?.id==='web.search');if(search&&Number(c.maxRounds||4)>0)results.push(await R.invokeTool({run,toolId:search.toolId,args:{query:String(goal),limit:2},nodeId:node.id,nodeExecutionId:execution.id,binding:search,approved:ctx.__approvedWrite===true}));
        const text='Agent '+snapshot.name+' 已整理：'+String(goal)+(results.length?'；已使用绑定的检索能力。':'；当前未挂载检索工具。');R.addModelUsage(run,{nodeId:node.id,model:snapshot.model,inputTokens:Math.ceil(String(goal).length+120),outputTokens:text.length});return{text,toolResults:results,agentVersion:snapshot.version};
      }
      case'classifier':{const text=String(input.text??ctx.input.topic??'');const matched=(c.labels||[]).find(label=>(label.keywords||[]).some(keyword=>text.includes(keyword)));return{label:matched?matched.id:c.defaultLabel,reason:matched?'命中示例关键词：'+(matched.keywords||[]).filter(k=>text.includes(k)).join('、'):'使用默认分类'};}
      case'extract':{const raw=input.text??input.value??'';let data;if(typeof raw==='object')data=raw;else{try{data=JSON.parse(raw);}catch(_){data={};String(raw).split(/[\n;,，；]/).forEach(line=>{const parts=line.split(/[:：]/);if(parts.length>1)data[parts.shift().trim()]=parts.join(':').trim();});}}const result={};for(const f of c.fields||[]){if(data[f.name]===undefined){if(f.required&&c.missingPolicy!=='null')throw issue('EXTRACT_MISSING','缺少字段：'+f.name);result[f.name]=null;}else{let value=data[f.name];if(['number','integer'].includes(f.type)&&typeof value==='string')value=Number(value);const errs=R.validateSchema(value,{type:f.type||'string'});if(errs.length)throw issue('EXTRACT_SCHEMA',errs.join('；'));result[f.name]=value;}}return{result};}
      case'knowledge':{const query=String(input.query??ctx.input.topic??'');if(scenarioFor(run,node.id)==='empty')return{items:[],total:0,mode:'local-keyword'};if(!S.ContentStore)return{items:[],total:0,mode:'unavailable',message:'未加载知识内容管理模块。'};const knowledge=c.knowledgeSnapshot||S.ContentStore.snapshotKnowledge(c.knowledge);if(!knowledge)throw issue('KNOWLEDGE_NOT_FOUND','请选择一个可用的知识库。');const found=S.ContentStore.searchSnapshot(knowledge,query,{topK:Number(c.topK)||3,scoreThreshold:Number(c.scoreThreshold)||0,rerank:c.rerank!==false});R.recordRetrievalUsage(run,found,{nodeId:node.id,nodeExecutionId:execution.id});return found;}
      case'document':{const value=input.file??input.text??'';return{text:typeof value==='string'?value:value.content||'示例文件 '+(value.name||''),metadata:c.includeMetadata?{name:value.name||'输入文本',simulated:true}:{}};}
      case'memory':{const key=(c.scope||'agent')+':'+c.key;if(c.mode==='write'){S.state.capabilities.memory[key]=copy(input.value);emit(run,'memory.updated',{nodeId:node.id,key});}return{value:copy(S.state.capabilities.memory[key]??null)};}
      case'http':{if(!/^https?:\/\//.test(c.url||''))throw issue('HTTP_URL','URL 必须以 http:// 或 https:// 开头。');const status=Number(c.mockStatus||200);if(status>=400)throw issue('HTTP_ERROR','模拟 HTTP '+status);return{status,headers:{'content-type':'application/json'},body:{url:c.url,method:c.method,input:copy(input),simulated:true}};}
      case'code':{const value=input.value??input.items??input;let result=value;if(c.handler==='uppercase')result=String(value).toUpperCase();if(c.handler==='sum'){if(!Array.isArray(value)||value.some(x=>typeof x!=='number'))throw issue('CODE_INPUT','sum 处理器需要数字数组。');result=value.reduce((sum,x)=>sum+x,0);}if(c.handler==='count')result=Array.isArray(value)||typeof value==='string'?value.length:Object.keys(value||{}).length;if(c.handler==='pick')result=value[c.key||'title'];return{result,handler:c.handler};}
      case'database':return{rows:[{id:1,topic:input.topic||ctx.input.topic||'示例',status:'reviewed'}].slice(0,Math.max(0,Number(c.limit)||20)),count:1,simulated:true};
      case'sandbox':return{stdout:'[simulation] '+c.runner+'\nCommand: '+c.command+'\nInput: '+JSON.stringify(input),exitCode:0,simulated:true};
      case'mapping':return{result:resolveMap(c.mapping||node.bindings||{},ctx)};
      case'template':{const text=R.resolveBinding(template(c.template||''),ctx);if(c.outputType==='json'){try{return{text,result:JSON.parse(text)};}catch(_){throw issue('TEMPLATE_JSON','模板结果不是有效 JSON。');}}return{text};}
      case'assign':{if(!['workflow','conversation'].includes(c.scope)||unsafeKeys.has(c.key))throw issue('ASSIGN_SCOPE','只能更新工作流或会话变量。');const value=input.value;ctx[c.scope]=ctx[c.scope]||{};if(c.operation==='clear')delete ctx[c.scope][c.key];else if(c.operation==='append')ctx[c.scope][c.key]=[...(Array.isArray(ctx[c.scope][c.key])?ctx[c.scope][c.key]:[]),copy(value)];else ctx[c.scope][c.key]=copy(value);return{value:copy(ctx[c.scope][c.key]??null)};}
      case'list':{if(!Array.isArray(input.items))throw issue('LIST_INPUT','items 必须为数组。');let items=copy(input.items);const value=x=>c.key&&x&&typeof x==='object'?x[c.key]:x;if(c.operation==='slice')items=items.slice(0,Math.max(0,Number(c.limit)||0));if(c.operation==='sort')items.sort((a,b)=>String(value(a)).localeCompare(String(value(b)))*(c.order==='desc'?-1:1));if(c.operation==='unique'){const seen=new Set();items=items.filter(x=>{const k=JSON.stringify(value(x));if(seen.has(k))return false;seen.add(k);return true;});}if(c.operation==='filter')items=items.filter(x=>String(value(x)).includes(c.match||''));if(c.operation==='pluck')items=items.map(value);return{items,count:items.length};}
      case'if':{let evaluation=evaluateConditions(c,ctx);let matched=evaluation.matched?'true':'false';const evaluations=[...evaluation.evaluations];if(!evaluation.matched){for(let i=0;i<(c.elif||[]).length;i++){evaluation=evaluateConditions(c.elif[i],ctx);evaluations.push(...evaluation.evaluations);if(evaluation.matched){matched='elif-'+(i+1);break;}}}emit(run,'branch.selected',{nodeId:node.id,nodeExecutionId:execution.id,port:matched,evaluations});return{matched,evaluations};}
      case'switch':{const found=(c.cases||[]).find(item=>compare(input.value,'eq',item.value));const matched=found?found.id:'default';emit(run,'branch.selected',{nodeId:node.id,port:matched,value:input.value});return{matched,value:copy(input.value)};}
      case'merge':{for(const binding of c.candidates||[]){try{return{value:R.resolveBinding(binding,ctx),selectedPath:binding.path||'常量'};}catch(error){if(error.code!=='UNPRODUCED')throw error;}}throw issue('MERGE_EMPTY','没有实际产生的候选分支值。');}
      case'parallel':return{result:copy(input),mode:c.mode||'split'};
      case'iteration':{
        if(!Array.isArray(input.items))throw issue('ITERATION_INPUT','迭代输入 items 必须是数组。');if(input.items.length>30)throw issue('ITERATION_LIMIT','原型每次最多模拟 30 项。');
        const results=new Array(input.items.length),errors=[];let cursor=0,broken=false;const concurrency=Math.min(6,Math.max(1,Number(c.concurrency)||1));
        async function worker(){while(cursor<input.items.length&&!broken){const index=cursor++;const local=copy(ctx);local.iteration={item:copy(input.items[index]),index};local.__scope={parentExecutionId:execution.id,itemIndex:index};local.__approvedWrite=false;local.__writeApprovals=[];emit(run,'iteration.started',{nodeId:node.id,nodeExecutionId:execution.id,itemIndex:index});try{if(c.body){const child=await executeGraph(run,{...copy(c.body),nested:true},local);results[index]=Object.prototype.hasOwnProperty.call(child,'__returnValue')?copy(child.__returnValue):copy(child.nodes[child.__lastNodeId]);if(child.__control==='break')broken=true;}else results[index]=R.resolveBinding(template(c.template||'{{iteration.item}}'),local);emit(run,'iteration.completed',{nodeId:node.id,itemIndex:index,result:results[index]});}catch(error){errors.push({index,code:error.code,message:error.message});results[index]={error:{code:error.code,message:error.message}};if(c.errorPolicy!=='keep')throw error;}}}
        await Promise.all(Array.from({length:Math.min(concurrency,input.items.length)},worker));return{items:results.map(value=>value===undefined?{skipped:true}:value),count:input.items.length,errors};
      }
      case'loop':{
        let state=copy(c.initialState||{}),round=0,reason='condition';const limit=Math.min(50,Math.max(1,Number(c.maxRounds)||5));
        while(true){const local=copy(ctx);local.loop={...state,round};local.__scope={parentExecutionId:execution.id,round};local.__approvedWrite=false;local.__writeApprovals=[];const condition=evaluateConditions(c,local);if(!condition.matched){reason='condition';break;}if(round>=limit){reason='limit';if(c.limitPolicy==='fail')throw issue('LOOP_LIMIT','循环达到最大次数 '+limit);break;}emit(run,'loop.started',{nodeId:node.id,nodeExecutionId:execution.id,round,state});if(c.body){await executeGraph(run,{...copy(c.body),nested:true},local);if(local.__control==='break'){reason='break';break;}}state={...state,...resolveMap(c.updates||{},local)};round++;emit(run,'loop.completed',{nodeId:node.id,round,state});assertActive(run);}
        return{state,rounds:round,reason};
      }
      case'control':{if(!ctx.__scope)throw issue('CONTROL_SCOPE','循环控制节点必须在容器内部。');ctx.__control=c.action;return{action:c.action};}
      case'human':{const approvedArgs=c.approveToolId?resolveMap(c.approveArgs||{},ctx):null;const decision=await requestApproval(run,{nodeId:node.id,nodeExecutionId:execution.id,title:c.title||node.title,description:c.description||'',fields:c.fields||[],preview:approvedArgs?{toolId:c.approveToolId,args:approvedArgs}:copy(input),kind:'input'});if(decision.approved&&approvedArgs){ctx.__writeApprovals=ctx.__writeApprovals||[];ctx.__writeApprovals.push({toolId:c.approveToolId,signature:JSON.stringify(approvedArgs),used:false});}return{approved:decision.approved,...decision.values};}
      case'subflow':{
        const sub=c.resolvedSnapshot?copy(c.resolvedSnapshot):R.publishedFlow(c.flowId);if(!sub)throw issue('SUBFLOW_MISSING','子流程没有发布版本。');if(c.version&&sub.version!==c.version){if(run.preserveResolvedSnapshots)throw issue('DEPENDENCY_VERSION','固定子流程版本不匹配。');const found=R.flows.find(f=>f.id===c.flowId)?.versions?.find(v=>v.version===c.version);if(!found)throw issue('SUBFLOW_VERSION','子流程版本不存在：'+c.version);Object.assign(sub,copy(found));}if((run.depth||0)>=4)throw issue('SUBFLOW_DEPTH','子流程最大嵌套深度为 4。');
        const child=R.runWorkflow(sub,{inputs:copy(input),parentRunId:run.id,speed:run.speed,depth:(run.depth||0)+1,scenario:scenarioFor(run,node.id),preserveResolvedSnapshots:run.preserveResolvedSnapshots});execution.childRunId=child.id;emit(run,'subflow.started',{nodeId:node.id,childRunId:child.id,version:sub.version});
        const unsubscribe=R.subscribe(changed=>{if(changed.id===child.id&&changed.status==='waiting'){run.pending={...copy(changed.pending),childRunId:child.id};run.status='waiting';emit(run,'subflow.waiting',{nodeId:node.id,childRunId:child.id});}else if(changed.id===child.id&&run.pending?.childRunId===child.id&&changed.status!=='waiting'){run.pending=null;run.status='running';}});
        await R.waitForRun(child);unsubscribe();if(child.status!=='done')throw issue('SUBFLOW_FAILED','子流程未完成：'+(child.error||child.status));return{result:copy(child.outcome.returnValue),childRunId:child.id};
      }
      case'wait':{if(c.mode==='event'){const response=await requestApproval(run,{kind:'input',nodeId:node.id,nodeExecutionId:execution.id,title:'等待事件 · '+(c.eventName||''),description:'提交可模拟关联事件到达。',fields:[]});if(!response.approved)throw issue('REJECTED','等待已取消。');return{event:response.values};}await delay(run,Math.min(2000,Math.max(0,Number(c.delayMs)||0)));assertActive(run);return{event:{resumed:true}};}
      case'resource':{const resource=c.resourceSnapshot||R.resources.find(r=>r.id===c.resourceId);if(!resource)throw issue('RESOURCE_MISSING','资源不存在。');const conn=R.getConnection(resource.connectionId);if(conn)S.Credentials?.assertUsable('tool',conn.credentialRef);if(conn&&(conn.enabled===false||conn.status!=='ready'))throw issue('CONNECTION_DISABLED','资源连接未就绪。');return{text:resource.text,uri:resource.uri};}
      case'prompt':{const prompt=c.promptSnapshot||(S.ContentStore?.getContent(c.promptId)?S.ContentStore.resolveContext({kind:'prompt',id:c.promptId,version:c.version}):R.prompts.find(p=>p.id===c.promptId&&(!c.version||String(p.version)===String(c.version))));if(!prompt)throw issue('PROMPT_MISSING','Prompt 不存在。');const connection=R.getConnection(prompt.connectionId);if(connection)S.Credentials?.assertUsable('tool',connection.credentialRef);if(connection&&(connection.enabled===false||connection.status!=='ready'))throw issue('CONNECTION_DISABLED','Prompt 连接未就绪。');for(const arg of prompt.arguments||[])if(arg.required&&input[arg.name]===undefined)throw issue('PROMPT_ARGUMENT','缺少 Prompt 参数：'+arg.name);const text=String(prompt.template||prompt.content||'').replace(/{{\s*([^{}]+?)\s*}}/g,(_,key)=>String(input[key.trim()]??''));return{messages:[{role:'user',content:text}]};}
      case'answer':{const text=input.text??R.resolveBinding(template(c.template||''),ctx);if(ctx.__scope)ctx.__returnValue=text;else run.outcome.returnValue=text;emit(run,'answer.created',{nodeId:node.id,text});return{text};}
      case'output':{if(c.mode==='data'){const value=copy(input);if(ctx.__scope)ctx.__returnValue=value;else run.outcome.returnValue=value;return{value};}return{};}
      case'artifact':{const raw=input.content??input;const content=typeof raw==='string'?raw:JSON.stringify(raw,null,2);const artifact={id:uid('artifact'),name:c.filename||'result.txt',type:c.format||'Text',content,simulated:true,nodeId:node.id};run.outcome.artifacts.push(artifact);run.artifacts=run.outcome.artifacts;emit(run,'artifact.created',{nodeId:node.id,artifact:{id:artifact.id,name:artifact.name,type:artifact.type}});return{file:{id:artifact.id,name:artifact.name,type:artifact.type,size:content.length}};}
      case'end':{if(c.status==='failed')throw issue('TERMINATED',c.message||'流程主动终止。');if(!ctx.__scope)run.outcome.message=c.message||'所有步骤已完成。';return{};}
      default:throw issue('NODE_TYPE','尚未配置执行器：'+node.type);
    }
  }
  async function executeNode(run,node,ctx,flow) {
    assertActive(run);const execution=executionFor(run,node,ctx.__scope);
    try{
      if(node.policy?.breakpoint||run.breakpoints?.includes(node.id)){const response=await requestApproval(run,{kind:'breakpoint',nodeId:node.id,nodeExecutionId:execution.id,title:'断点 · '+node.title,description:'查看变量后继续执行此节点。'});if(!response.approved)throw issue('CANCELLED','调试已停止。');}
      const retries=Math.min(3,Math.max(0,Number(node.policy?.retries)||0));let output;
      for(let i=0;i<=retries;i++){
        const attempt={id:uid('attempt'),index:i+1,startedAt:Date.now(),status:'running'};execution.attempts.push(attempt);emit(run,'attempt.started',{nodeId:node.id,nodeExecutionId:execution.id,attemptId:attempt.id,index:i+1});
        try{
          try{const bindings=(node.type==='output'&&node.config?.mode==='none')||(node.type==='mapping'&&node.config?.mapping)?{}:node.bindings||{};execution.inputs=resolveMap(bindings,ctx);}catch(error){if(node.type==='parallel'&&node.config?.mode==='join'&&node.config.allowPartial){execution.inputs={};for(const [key,value]of Object.entries(node.bindings||{})){try{execution.inputs[key]=R.resolveBinding(value,ctx);}catch(e){execution.inputs[key]={error:e.message,unproduced:true};}}}else throw error;}
          if(!['input','mcp','plugin'].includes(node.type))await delay(run);assertActive(run);
          output=await performNode(run,node,ctx,execution,flow);attempt.status='done';attempt.endedAt=Date.now();break;
        }catch(error){attempt.status='failed';attempt.endedAt=Date.now();attempt.error={code:error.code||'NODE_ERROR',message:error.message};emit(run,'attempt.failed',{nodeId:node.id,nodeExecutionId:execution.id,attemptId:attempt.id,index:i+1,...attempt.error});const unsafeRetry=['REJECTED','CANCELLED','AUTH_REQUIRED','INPUT_SCHEMA','OUTPUT_SCHEMA','TYPE_MISMATCH'].includes(error.code)||(['mcp','plugin'].includes(node.type)&&R.getTool(node.config?.toolId)?.write);if(i===retries||unsafeRetry)throw error;emit(run,'node.retrying',{nodeId:node.id,attempt:i+2});}
      }
      execution.output=copy(output);execution.status='done';execution.endedAt=Date.now();execution.duration=execution.endedAt-execution.startedAt;ctx.nodes[node.id]=copy(output);ctx.__lastNodeId=node.id;run.step=Math.min(3,run.step+1);emit(run,'node.completed',{nodeId:node.id,nodeExecutionId:execution.id,output:execution.output,duration:execution.duration});return{output,execution};
    }catch(error){execution.status=error.code==='CANCELLED'?'cancelled':'failed';execution.error={code:error.code||'NODE_ERROR',message:error.message};execution.endedAt=Date.now();execution.duration=execution.endedAt-execution.startedAt;emit(run,'node.failed',{nodeId:node.id,nodeExecutionId:execution.id,...execution.error});throw Object.assign(error,{nodeId:node.id,nodeExecutionId:execution.id});}
  }
  async function executeGraph(run,flow,ctx) {
    const partialFailures=new Set();const nodes=flow.nodes||[],edges=flow.edges||[],nodeState=new Map(nodes.map(n=>[n.id,'pending'])),edgeState=new Map(edges.map(e=>[e.id,undefined]));
    const activate=(node,output,failed)=>{let port='next';if(node.type==='if'||node.type==='switch')port=output?.matched;if(node.type==='classifier')port=output?.label;if(node.type==='human')port=output?.approved?'approved':'rejected';if(failed)port='error';edges.filter(e=>e.source===node.id).forEach(e=>edgeState.set(e.id,(e.sourcePort||'next')===port));};
    let cycles=0;
    while([...nodeState.values()].some(v=>v==='pending')){
      assertActive(run);if(++cycles>nodes.length*3+3)throw issue('GRAPH_STALLED','图调度未能收敛。');let progressed=false;const ready=[];
      for(const node of nodes){if(nodeState.get(node.id)!=='pending')continue;const incoming=edges.filter(e=>e.target===node.id);if(incoming.some(e=>edgeState.get(e.id)===undefined))continue;const active=incoming.length===0||incoming.some(e=>edgeState.get(e.id)===true)||partialFailures.has(node.id);if(!active){nodeState.set(node.id,'skipped');edges.filter(e=>e.source===node.id).forEach(e=>edgeState.set(e.id,false));const record={id:uid('node-exec'),traceId:run.traceId,spanId:hex(16),parentSpanId:run.spanId,nodeId:node.id,title:node.title,type:node.type,status:'skipped',startedAt:Date.now(),endedAt:Date.now(),inputs:{},attempts:[],...(ctx.__scope||{})};run.nodeExecutions.push(record);emit(run,'node.skipped',{nodeId:node.id,nodeExecutionId:record.id,reason:'上游路径未激活'});progressed=true;}else ready.push(node);}
      if(ready.length){await Promise.all(ready.map(async node=>{nodeState.set(node.id,'running');try{const result=await executeNode(run,node,ctx,flow);nodeState.set(node.id,'done');activate(node,result.output,false);if(node.type==='human'&&!result.output.approved&&!edges.some(e=>e.source===node.id&&e.sourcePort==='rejected'))throw issue('REJECTED','人工输入已拒绝，此路径未配置拒绝出口。');}catch(error){nodeState.set(node.id,'failed');const errorEdges=edges.filter(e=>e.source===node.id&&e.sourcePort==='error');if(!['REJECTED','CANCELLED'].includes(error.code)&&(node.policy?.onError==='continue'||errorEdges.length)){ctx.nodes[node.id]={error:{code:error.code,message:error.message}};if(errorEdges.length)activate(node,ctx.nodes[node.id],true);else activate(node,ctx.nodes[node.id],false);}else if(!['REJECTED','CANCELLED'].includes(error.code)){
        const visited=new Set(),joins=[];const locate=id=>{if(visited.has(id))return;visited.add(id);const target=nodes.find(n=>n.id===id);if(target?.type==='parallel'&&target.config?.mode==='join'){if(target.config.allowPartial)joins.push(target.id);return;}edges.filter(e=>e.source===id&&e.sourcePort!=='error').forEach(e=>locate(e.target));};edges.filter(e=>e.source===node.id&&e.sourcePort!=='error').forEach(e=>locate(e.target));
        if(!joins.length)throw error;ctx.nodes[node.id]={error:{code:error.code,message:error.message}};joins.forEach(id=>partialFailures.add(id));edges.filter(e=>e.source===node.id).forEach(e=>edgeState.set(e.id,false));emit(run,'node.partial_failure',{nodeId:node.id,joinIds:joins,code:error.code,message:error.message});
      }else throw error;}}));progressed=true;}
      if(ctx.__control)break;
      if(!progressed)throw issue('GRAPH_STALLED','存在未解析的依赖，请检查分支与连线。');
    }
    return ctx;
  }
  R.runWorkflow=(flow,options)=>{
    const o=options||{};let snapshot,preparationError;
    try{snapshot=R.freezeWorkflow(flow,{preserveResolvedSnapshots:!!o.preserveResolvedSnapshots,refresh:!!o.refreshSnapshot});}catch(error){snapshot=R.snapshot(flow);preparationError=error;}
    const inputs={...(snapshot.inputs||{}),...Object.fromEntries(Object.entries(o.inputs||{}).filter(([,value])=>value!==undefined))};
    const run=R.createRun({title:o.title||snapshot.title,kind:o.parentRunId?'subworkflow':o.debug?'workflow-debug':'workflow',source:snapshot.title,version:snapshot.version,inputs,snapshot,parentRunId:o.parentRunId});
    run.workflowSnapshot=copy(snapshot);run.workflowId=snapshot.id;run.scenario=o.scenario||'success';run.speed=o.speed;run.depth=o.depth||0;run.breakpoints=copy(o.breakpoints||[]);run.preserveResolvedSnapshots=!!o.preserveResolvedSnapshots;
    const validation=R.validate(snapshot);run.validation=validation;
    Promise.resolve().then(async()=>{try{if(preparationError)throw preparationError;if(!validation.valid)throw issue('GRAPH_INVALID',validation.errors.map(e=>e.message).join('；'));const ctx=contextFor(run,o.context);run.context=ctx;let executionFlow=snapshot;if(o.fromNode){if(!snapshot.nodes.some(n=>n.id===o.fromNode))throw issue('DEBUG_NODE','起始节点不存在。');const descendants=new Set();const walk=id=>{if(descendants.has(id))return;descendants.add(id);snapshot.edges.filter(e=>e.source===id).forEach(e=>walk(e.target));};walk(o.fromNode);executionFlow={...snapshot,nodes:snapshot.nodes.filter(n=>descendants.has(n.id)),edges:snapshot.edges.filter(e=>descendants.has(e.source)&&descendants.has(e.target))};run.fromNode=o.fromNode;emit(run,'debug.from_node',{nodeId:o.fromNode,upstreamSnapshot:copy(ctx.nodes)});}await executeGraph(run,executionFlow,ctx);R.completeRun(run);}catch(error){R.failRun(run,error);}});return run;
  };
  R.testNode=(node,options)=>{const o=options||{};let n=copy(node),preparationError;try{n=R.freezeWorkflow({id:'single-node',version:'debug',nodes:[n],edges:[]}).nodes[0];}catch(error){preparationError=error;}if(o.inputs&&Object.keys(o.inputs).length)n.bindings=Object.fromEntries(Object.entries(o.inputs).map(([key,value])=>[key,constant(value)]));const run=R.createRun({title:'单节点 · '+node.title,kind:'node-debug',source:'工作流调试',inputs:o.context?.input||{},snapshot:{node:n},parentRunId:o.parentRunId});run.scenario=o.scenario||'success';run.speed=o.speed;Promise.resolve().then(async()=>{try{if(preparationError)throw preparationError;const ctx=contextFor(run,o.context);const result=await executeNode(run,n,ctx,{nodes:[n],edges:[]});R.completeRun(run,{returnValue:result.output});}catch(error){R.failRun(run,error);}});return run;};

  function node(type,id,title,x,y,config,bindings,policy){return R.newNode(type,{id,title,x,y,config:{...copy(R.nodeType(type).defaults),...copy(config||{})},bindings:copy(bindings||{}),policy:{timeout:15000,retries:0,onError:'fail',...copy(policy||{})}});}
  const edge=(source,target,sourcePort)=>({id:'edge-'+source+'-'+target+'-'+(sourcePort||'next'),source,target,sourcePort:sourcePort||'next'});
  function exampleFlows(){
    const research={id:'flow-research',title:'研究简报 · 写入团队空间',description:'检索、空结果分支、逐项整理、人工确认，最后把内容放进指定位置。无需下载文件。',version:'1.0',graphSchema:2,published:true,updated:'刚刚',runs:0,inputs:{topic:'企业 Agent 平台',destination:'/产品研究/每周观察',limit:3},nodes:[
      node('input','start','接收主题与目标位置',60,80,{fields:[{name:'topic',type:'string',required:true,default:'企业 Agent 平台'},{name:'destination',type:'string',required:true,default:'/产品研究/每周观察'},{name:'limit',type:'integer',required:true,default:3}]}),
      node('mcp','search','搜索相关资料',350,80,{toolId:'web.search'},{query:ref('input.topic'),limit:ref('input.limit')}),
      node('if','check','是否找到资料？',640,80,{conditions:[{left:ref('nodes.search.result.total'),operator:'gt',right:constant(0)}]}),
      node('mapping','normal','使用搜索结果',930,10,{mapping:{items:ref('nodes.search.result.items')}}),
      node('mapping','fallback','使用空结果说明',930,210,{mapping:{items:constant([{title:'未找到公开资料',url:'',summary:'请补充来源；本次保留空结果事实。'}])}}),
      node('merge','merge','汇合实际激活的分支',1220,80,{candidates:[ref('nodes.normal.result.items'),ref('nodes.fallback.result.items')]}),
      node('iteration','iterate','逐项整理资料',1220,350,{template:'资料 {{iteration.index}}：{{iteration.item.title}}\n{{iteration.item.summary}}\n来源：{{iteration.item.url}}',concurrency:2,errorPolicy:'keep'},{items:ref('nodes.merge.value')}),
      node('llm','report','整理研究简报',930,350,{prompt:'围绕 {{input.topic}} 整理研究简报。保留来源，空结果要明确说明。'},{content:ref('nodes.iterate.items')}),
      node('human','review','确认内容与目标位置',640,350,{title:'确认写入团队空间',description:'内容将通过团队文档插件放到目标目录；这是本地模拟操作。',approveToolId:'docs.create',approveArgs:{title:template('{{input.topic}} · 研究简报'),content:ref('nodes.report.text'),folder:ref('input.destination')}},{content:ref('nodes.report.text'),destination:ref('input.destination')}),
      node('plugin','write','写入指定文档目录',350,350,{toolId:'docs.create'},{title:template('{{input.topic}} · 研究简报'),content:ref('nodes.report.text'),folder:ref('input.destination')}),
      node('end','finish','完成 · 不返回文件',60,350,{message:'研究简报已在模拟目标空间中落位。此流程没有返回值和下载文件。'}),
      node('end','declined','已拒绝 · 未进行写入',640,610,{message:'已按人工决定结束，未进行后续写入。'})
    ],edges:[edge('start','search'),edge('search','check'),edge('check','normal','true'),edge('check','fallback','false'),edge('normal','merge'),edge('fallback','merge'),edge('merge','iterate'),edge('iterate','report'),edge('report','review'),edge('review','write','approved'),edge('review','declined','rejected'),edge('write','finish')]};
    const action={id:'flow-sync',title:'更新业务记录 · 无返回值',description:'把给定信息写入指定数据表；检查回执后正常结束，产物数可以为零。',version:'1.0',graphSchema:2,published:true,updated:'刚刚',runs:0,inputs:{topic:'本周研究已确认',recordKey:'weekly-01'},nodes:[
      node('input','start','输入记录内容',60,130,{fields:[{name:'topic',type:'string',required:true},{name:'recordKey',type:'string',required:true}]}),
      node('mapping','fields','映射业务字段',350,130,{mapping:{topic:ref('input.topic'),status:constant('reviewed')}}),
      node('plugin','upsert','写入指定业务表',640,130,{toolId:'table.upsert'},{table:constant('research-records'),key:ref('input.recordKey'),values:ref('nodes.fields.result')}),
      node('output','finish','结束 · 无返回值',930,130,{mode:'none'})
    ],edges:[edge('start','fields'),edge('fields','upsert'),edge('upsert','finish')]};
    const data={id:'flow-parallel',title:'多路分析 · 返回结构化数据',description:'并行检索与提取输入，汇合后执行有界循环，返回数据对象。',version:'1.0',graphSchema:2,published:true,updated:'刚刚',runs:0,inputs:{topic:'工作流调试',rounds:3},nodes:[
      node('input','start','输入研究主题',60,170,{fields:[{name:'topic',type:'string',required:true},{name:'rounds',type:'integer',required:true,default:3}]}),
      node('parallel','split','同时启动两个分支',340,170,{mode:'split'}),
      node('knowledge','knowledge','知识库检索',620,40,{topK:2},{query:ref('input.topic')}),
      node('mcp','search','MCP 资料搜索',620,300,{toolId:'web.search'},{query:ref('input.topic'),limit:constant(2)}),
      node('parallel','join','等待两个分支',900,170,{mode:'join',allowPartial:false},{knowledge:ref('nodes.knowledge.items'),web:ref('nodes.search.result.items')}),
      node('loop','loop','按条件完善计数',1180,170,{initialState:{count:0},conditions:[{left:ref('loop.count'),operator:'lt',right:ref('input.rounds')}],maxRounds:8,updates:{count:{mode:'expression',left:ref('loop.count'),operator:'add',right:constant(1)}}}),
      node('output','finish','返回数据对象',1460,170,{mode:'data'},{topic:ref('input.topic'),sources:ref('nodes.join.result'),review:ref('nodes.loop.state'),rounds:ref('nodes.loop.rounds')})
    ],edges:[edge('start','split'),edge('split','knowledge'),edge('split','search'),edge('knowledge','join'),edge('search','join'),edge('join','loop'),edge('loop','finish')]};
    const item={id:'flow-item',title:'资料摘要 · 可复用子流程',description:'接收单条资料，生成统一结构；可由 Agent 或其他流程调用。',version:'1.0',graphSchema:2,published:true,updated:'刚刚',runs:0,inputs:{topic:'单条资料'},nodes:[node('input','start','接收资料',60,120,{fields:[{name:'topic',type:'string',required:true}]}),node('template','summary','生成统一摘要',350,120,{template:'资料摘要：{{input.topic}}'}),node('output','finish','返回摘要',640,120,{mode:'data'},{summary:ref('nodes.summary.text')})],edges:[edge('start','summary'),edge('summary','finish')]};
    const subflow={id:'flow-subflow',title:'复用发布子流程',description:'调用已发布的资料摘要流程，观察父子 Run 与版本快照。',version:'1.0',graphSchema:2,published:true,updated:'刚刚',runs:0,inputs:{topic:'工具调用的可观察性'},nodes:[node('input','start','输入主题',60,120,{fields:[{name:'topic',type:'string',required:true}]}),node('subflow','summary','调用资料摘要',350,120,{flowId:'flow-item',version:'1.0'},{topic:ref('input.topic')}),node('output','finish','返回子流程结果',640,120,{mode:'data'},{summary:ref('nodes.summary.result.summary')})],edges:[edge('start','summary'),edge('summary','finish')]};
    const artifact={id:'flow-artifact',title:'生成文件 · 显式成果节点',description:'需要下载文件时才添加成果生成节点，文件与运行返回值分别管理。',version:'1.0',graphSchema:2,published:true,updated:'刚刚',runs:0,inputs:{topic:'我的研究主题'},nodes:[node('input','start','输入主题',60,120,{fields:[{name:'topic',type:'string',required:true}]}),node('template','content','编排文档内容',350,120,{template:'# {{input.topic}}\n\n这是显式生成文件的示例。'}),node('artifact','file','生成 Markdown 文件',640,120,{filename:'研究摘要.md',format:'Markdown'},{content:ref('nodes.content.text')}),node('end','finish','任务完成',930,120,{message:'已由成果节点生成文件。'})],edges:[edge('start','content'),edge('content','file'),edge('file','finish')]};
    return[research,action,data,item,subflow,artifact].map(flow=>({...flow,history:[{version:flow.version,note:'完整图编排示例',date:'刚刚'}],publishedSnapshot:R.snapshot(flow),versions:[R.snapshot(flow)]}));
  }
  function migrateLegacyFlow(legacy) {
    const oldNodes=legacy.nodes||[];let previousValue=ref('input.topic');
    const nodes=oldNodes.map((old,index)=>{
      const type={input:'input',knowledge:'knowledge',model:'llm',approval:'human',output:'artifact',tool:'mcp'}[old.type]||'template';let config={},bindings={};
      if(type==='input')config={fields:[{name:'topic',type:'string',required:true,default:old.prompt||legacy.title}]};
      if(type==='knowledge'){config={knowledge:old.knowledge||'产品与行业知识库',topK:Number(old.limit)||3};bindings={query:ref('input.topic')};}
      if(type==='llm'){config={model:old.model||'DeepSeek Chat',prompt:old.prompt||'整理本次输入。',temperature:Number(old.temperature)||0.4};bindings={content:copy(previousValue)};}
      if(type==='human'){config={title:old.title,description:old.prompt||'确认当前内容后继续。'};bindings={content:copy(previousValue)};}
      if(type==='artifact'){const format=String(old.format||'Markdown').includes('CSV')?'CSV':'Markdown';config={filename:(legacy.title||'原有成果')+(format==='CSV'?'.csv':'.md'),format};bindings={content:copy(previousValue)};}
      if(type==='mcp'){config={toolId:'web.search'};bindings={query:ref('input.topic'),limit:constant(3)};}
      const converted=node(type,old.id||'legacy-'+index,old.title||R.nodeType(type).name,Number(old.x)||60+index*290,Number(old.y)||100,config,bindings);
      if(type==='knowledge')previousValue=ref('nodes.'+converted.id+'.items');if(type==='llm'||type==='template')previousValue=ref('nodes.'+converted.id+'.text');if(type==='mcp')previousValue=ref('nodes.'+converted.id+'.result');
      return converted;
    });
    if(!nodes.length)nodes.push(node('input','start','接收主题',60,100));
    const edges=nodes.slice(0,-1).map((n,i)=>edge(n.id,nodes[i+1].id,n.type==='human'?'approved':'next'));
    const flow={id:'migrated-'+legacy.id,title:(legacy.title||'原有工作流')+' · 原有配置',description:legacy.description||'保留之前保存的节点配置，已转换为图结构。',version:legacy.version||'1.0',graphSchema:2,published:!!legacy.published,updated:legacy.updated||'迁移完成',runs:legacy.runs||0,inputs:{topic:oldNodes[0]?.prompt||legacy.title||'当前任务'},nodes,edges,history:copy(legacy.history||[]),migratedFrom:legacy.id};
    if(flow.published){if(legacy.publishedSnapshot?.nodes){const originalPublished=migrateLegacyFlow({...copy(legacy),...copy(legacy.publishedSnapshot),published:false,publishedSnapshot:undefined});flow.publishedSnapshot=R.snapshot(originalPublished);flow.publishedSnapshot.id=flow.id;}else flow.publishedSnapshot=R.snapshot(flow);flow.versions=[copy(flow.publishedSnapshot)];}return flow;
  }
  if(!S.state.workflow||!Array.isArray(S.state.workflow.flows))S.state.workflow={flows:exampleFlows()};
  else if(!S.state.workflow.flows.some(flow=>flow.graphSchema===2)){
    S.state.workflow.legacyFlows=copy(S.state.workflow.flows);S.state.workflow.flows=[...exampleFlows(),...S.state.workflow.flows.map(migrateLegacyFlow)];
  }
  Object.defineProperty(R,'flows',{get:()=>S.state.workflow.flows});
  R.examples=exampleFlows;
  R.resetCapabilities=()=>{S.state.capabilities=copy(seeds);S.save();};
  S.state.runs.filter(run=>run.engine==='graph'&&!terminal(run.status)).forEach(run=>{run.status='stopped';run.error='页面会话已结束。此前的完成记录与写入回执已保留；如需重新执行请新建运行。';run.errorCode='SESSION_INTERRUPTED';run.pending=null;run.finishedAt=Date.now();run.duration=run.finishedAt-run.created;run.events=run.events||[];emit(run,'run.interrupted',{reason:'页面重新加载；未重放外部写入。'});});
  S.save();
})();
