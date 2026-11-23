# 共享执行、内容、发布与评测接口

`runtime.js` 在 `core.js` 后、各页面脚本之前加载；全局 `Studio.Runtime`（简称 `R`）。全部外部服务为本地模拟，控制流和参数解析真实执行。runtime 负责目录、连接、图示例及迁移；页面不另建平行数据源。`knowledge.js`、`publishing.js`、`quality.js` 分别拥有内容、应用服务和评测状态，并通过本契约复用 Runtime。

## 数据

- `R.catalog`: 数组，37 个节点族。每项 `{id:'N01',type:'input',name,group,icon,description,extension,defaults,inputs,outputs,fields}`。`inputs` 为 JSON Schema 对象 `{type:'object',properties,required}`；`outputs` 为字段名称到类型描述的映射。`fields` 为 `[{key,label,type:'text'|'textarea'|'number'|'select'|'json'|'checkbox',options?,help?}]`；配置放 `node.config[key]`。
- `R.nodeType(type)` / `R.newNode(type,patch={})`。
- `R.flows`: `S.state.workflow.flows` 当前数组。运行已有发布版本时传 `flow.publishedSnapshot` 或 `R.publishedFlow(id)`。
- 流程 `{id,title,description,version,published,graphSchema:2,nodes,edges,inputs:{topic:'...',destination:'...'},history,publishedSnapshot}`；快照只含图与配置，不含递归 publishedSnapshot。
- 节点 `{id,type,title,x,y,config:{...},bindings:{name:binding},policy:{timeout:15000,retries:0,onError:'fail'|'continue'|'branch',breakpoint:false}}`。
- `binding` 可为普通 JSON 常量，或 `{mode:'constant',value:any}`、`{mode:'ref',path:'nodes.search.result.items'}`、`{mode:'template',value:'主题：{{input.topic}}'}`。支持安全表达式 `{mode:'expression',left:binding,operator:'gt',right:binding}`，无 eval。
- 边 `{id,source,target,sourcePort:'next'}`。通常 `next`；IF 为 `true` / `false` / `elif-1` 等；Switch 为配置 case 的 id / `default`；classifier 为标签值；human 为 `approved` / `rejected`；失败为 `error`。使用 `R.ports(node)` 获取 `[{id,label}]`。
- `R.connections` / `R.plugins` / `R.tools` / `R.resources` / `R.prompts` / `R.skills`：可配置且持久化的目录数组；可直接编辑对象再 `S.save()`。`R.getTool(id)` / `R.getConnection(id)`。
- tool `{id,name,title,kind:'mcp'|'plugin',connectionId,version,description,write,inputSchema,outputSchema,example}`。初始工具 ID：`web.search`、`web.fetch`、`workspace.write`、`docs.create`、`table.upsert`。连接 ID：`mcp-search`、`mcp-workspace`、`plugin-docs`、`plugin-table`。连接 `{id,name,kind,transport,endpoint,location,status:'ready'|'disabled'|'auth_required',enabled,credentialRef,version,protocolVersion}`。插件 `{id,name,version,status:'installed'|'disabled',enabled,description,toolIds,config}`。
- 所有运行加入 `S.state.runs`，`engine:'graph'` 用于区分旧演示记录；`kind:'workflow'|'node-debug'|'tool-debug'|'agent'|'subworkflow'|'plan-execution'`。

## 公共方法

- `R.createRun({title,kind,source,agent,model,version,parentRunId,inputs,snapshot})` → run，初始 running。
- `R.runWorkflow(flow,{inputs={},scenario='success',debug=false,fromNode?,breakpoints=[],parentRunId?,speed?,preserveResolvedSnapshots=false,refreshSnapshot=false}={})` → run（同步返回，异步推进）。`scenario` 可为全局字符串或 `{nodeId:'empty'}`，测试空结果、失败、超时等。`speed:0` 为测试无延迟。
- `R.testNode(node,{inputs={},context={},scenario='success',speed?}={})` → run。context 可提供 input、nodes、workflow、iteration、loop。
- `R.testTool(toolId,args,{scenario='success',speed?,approved?}={})` → run。
- `await R.invokeTool({run,toolId,args,scenario='success',nodeId,nodeExecutionId,approved=false,binding?,connectionId?,timeoutMs?,speed})` → structured result；自动创建 toolCall/events/transcript，写入工具在未批准时暂停 run，审批后继续。
- `R.completeRun(run,{returnValue?,message?,receipts?,artifacts?}={})` / `R.failRun(run,error)`。
- `R.resolveApproval(runId,approved,values={})` → boolean；仅当前 pending 生效一次。`R.resume(runId)` 恢复断点。`R.stop(runId)`。
- `R.subscribe(fn)` → unsubscribe；每个状态变化回调 `fn(run,event)`。
- `R.findRun(id)` / `R.validate(flow)` → `{valid,errors:[{nodeId?,message,code}],warnings:[...]}`。
- `R.resolveBinding(binding,context)` → value（未产生的引用抛出 `UNPRODUCED`）。`R.validateSchema(value,schema)` → 字符串错误数组。
- `R.snapshot(flow)` → 不含历史/递归发布字段的独立图配置快照。`R.publishedFlow(id)` 返回当前发布配置副本。
- `R.freezeWorkflow(flow,options={})` → 递归固定子流程、Agent、知识、Prompt、Resource 和工具绑定的图快照。`options.preserveResolvedSnapshots` 要求使用已有快照，缺失时报错；`options.refresh` 用于明确发布当前配置；显式发布子依赖使用 refresh:false，不改写子版本模型。普通执行默认保留已有快照，refreshSnapshot 是明确更新当前配置的选项。
- `R.listVariables(flow,nodeId,run?)` → `[{path,type,label,sample?}]`，仅合法上游。
- `R.event(run,type,data={})` 记录事件；`R.addModelUsage(run,{nodeId,model,inputTokens,outputTokens})` 记录估算用量。
- `R.waitForRun(run)` Promise：等到 done/failed/rejected/stopped；等待审批不会提前结束。

## 运行记录

`run`: `{id,engine,kind,status,title,source,created,finishedAt?,duration?,version,model,inputs,snapshot,workflowSnapshot,capabilitySnapshots,traceId,spanId,parentRunId?,events:[],nodeExecutions:[],toolCalls:[],pending?,outcome:{receipts:[],artifacts:[],returnValue?,message?},artifacts:[],tokens,cost,usageKind:'estimated'}`。

- node execution `{id,nodeId,title,type,status,startedAt,endedAt?,inputs,output?,error?,attempts:[],itemIndex?,round?,parentExecutionId?}`。
- tool call `{id,toolId,toolName,connectionId,nodeId,nodeExecutionId,requestId,status,args,result?,error?,startedAt,endedAt?,duration?,transcript:[],version}`。
- event `{id,seq,type,time,runId,nodeId?,nodeExecutionId?,toolCallId?,data}`。
- pending `{id,kind:'approval'|'input'|'breakpoint',nodeId?,nodeExecutionId?,toolCallId?,title,description,args?,fields?,preview?,created}`。
- receipt `{id,kind:'external-write',destination,title,toolCallId,simulated:true,at}`。仅模拟写入，不伪装真实业务成功。

## 节点类型及主要配置

`input`, `webhook`, `schedule`, `event`, `llm`, `agent`, `classifier`, `extract`, `knowledge`, `document`, `memory`, `mcp`, `plugin`, `http`, `code`, `database`, `sandbox`, `mapping`, `template`, `assign`, `list`, `if`, `switch`, `merge`, `parallel`, `iteration`, `loop`, `control`, `human`, `subflow`, `wait`, `resource`, `prompt`, `answer`, `output`, `artifact`, `end`。

- mcp/plugin: config.toolId；bindings 为 Schema 参数名到 binding 的映射。
- if: config.conditions `[{left:binding,operator:'gt'|'eq'|'contains'|'empty'|'not_empty'|'gte'|'lt'|'lte'|'neq',right:binding}]`，config.combinator:'and'|'or'；可 config.elif 为条件组。
- switch: bindings.value；config.cases `[{id:'case-a',value:'...'}]`。
- merge: config.candidates 为 binding 数组；返回 `{value,selectedPath}`，只选实际产生分支。
- parallel: config.mode:'split'|'join'；join config.allowPartial，bindings 为命名来源，等待全部入边。
- iteration: bindings.items 为 array；config.body 是可选嵌套 graph；无 body 时 config.template 每项模板；config.concurrency / errorPolicy:'stop'|'keep'，返回 `{items,count,errors}`。
- loop: config.initialState object，config.conditions 条件组，config.maxRounds，config.body 可选嵌套图，config.updates 字段到 binding（支持 expression 的 add/subtract）；无 body 也按 state 更新；返回 `{state,rounds,reason}`。
- human: config.fields，bindings.content；批准返回 `{approved:true,...values}`；未配置 rejected 边时拒绝结束。
- subflow: config.flowId，config.version；执行冻结后 `config.resolvedSnapshot` 保存独立依赖，bindings 为子流程 input。
- agent: `config.agentId` 与版本；冻结后的 `config.agentSnapshot` 供共享 Agent 运行器使用。
- knowledge: `config.knowledge`、`topK`、`scoreThreshold`；冻结后 `knowledgeSnapshot` 保存正文和分段，查询调用 ContentStore 的关键词或向量／重排本地模拟，config.rerank=false 可跳过知识设置里的重排阶段。
- prompt/resource: 分别通过 `config.promptSnapshot`／`resourceSnapshot` 留存上下文；本地 Prompt 与 MCP Prompt 均可引用。
- output: config.mode:'none'|'data'；bindings 为命名返回字段。none 成功结束且不创建文件。
- artifact: config.filename、format；bindings.content；只有此类显式能力会创建可下载文件。
- end: config.status:'done'|'failed'、message；允许零返回值成功结束。

除非明确配置 output / answer / artifact，内部节点输出只存在 Trace；流程不会自动把最后一个节点结果当作返回值，不会自动生成文件。

## 已实现的约束

- 工具 Schema 与版本在 Run 创建时取快照；连接启停和授权状态仍逐次检查。
- 人工节点 `config.approveToolId` + `config.approveArgs` 可授予一次精确工具与参数的写入确认；参数变化后重新确认。普通人工节点不会无条件授权所有后续写入。
- 新连接的工具可用 `adapterId` 指定已有模拟处理器，调用与追踪仍保留独立 toolId。
- `fromNode` 只运行选中节点及其下游，读取显式传入的 context；不重放之前成功的写入。
- 页面重新加载后将未完成的旧会话标为停止，保留历史和回执；不会悄悄恢复并重复产生效果。
- R.createRun 生成 traceId/spanId；工具调用共享 Trace、独立 spanId 和 requestId。远端内部没有模拟 Span。

- 工作流 Agent 节点在完整应用中复用 `Studio.AgentStudio.start`，父子运行关联、审批代理与回执引用一致；独立 runtime 测试环境只启用明确标记的有限检索适配器。
- `output.mode=none` 忽略保留在草稿中的返回值绑定，因此未产生或已删除变量不会阻止无返回值结束。
- `parallel` 汇合开启 `allowPartial` 后，失败路径保留错误/未产生标记，健康路径结果可继续；默认仍要求全部成功。
- 无法取得绑定的工具固定版本时返回 `VERSION_MISMATCH`，不会静默换用新版本。

## 依赖冻结与历史复现

编辑器发布通过 freezeSnapshot／freezeWorkflow 保存完整可解析配置；本次执行、服务版本和评测任务继续保留这些固定依赖内容。使用 `R.snapshot` 不能代替完整依赖冻结。

- `R.freezeWorkflow(flow)` 和 `S.AgentStudio.freezeSnapshot(snapshot)` 深复制并递归解析依赖。循环引用、缺少已发布子配置或过深依赖明确报错。
- Workflow 的 `config.body.nodes`、子流程、Agent 节点，以及 Agent 上下文中的工作流／子 Agent 都遵守同一规则。
- 知识正文、Prompt／Skill／Resource 内容固定到对应 snapshot。服务和评测启动后不回读当前内容来替换已有快照。
- 重放已经冻结的服务、评测或历史配置，调用 `runWorkflow`／`AgentStudio.start` 时传 `preserveResolvedSnapshots:true`；该选项向嵌套运行传播。缺少快照会形成准备错误，不静默使用 live 配置。
- 普通新执行保留已发布模型及已有依赖快照；缺失的旧配置可解析并固定本次内容。显式重新发布才刷新当前对象的模型配置，发布子依赖保持其版本。
- 连接启停、凭证可用性和工具版本兼容仍在每次调用时验证。版本冻结不是跳过授权或停用的途径。

```js
const frozen = Studio.Runtime.freezeWorkflow(publishedFlow);
const run = Studio.Runtime.runWorkflow(frozen, {
  inputs: { topic: '检查示例' },
  preserveResolvedSnapshots: true
});
await Studio.Runtime.waitForRun(run);
```

## AgentStudio

`S.AgentStudio.start({agentId,ephemeralAgent?,snapshot?,goal,mode,sessionSnapshot?,parentRunId?,depth?,preserveResolvedSnapshots?,refreshSnapshot?,capabilitySnapshots?})` 同步返回 run，异步推进。完整应用中 Agent 节点、独立 Chat、API 试调与评测都调用该入口。

`freezeSnapshot(snapshot,options={})` 递归固定 `knowledgeSnapshot`、`contextBindings[].snapshot`、上下文工作流的 `resolvedSnapshot` 和子 Agent 的 `agentSnapshot`。`preserveResolvedSnapshots:true` 禁止回退当前内容；`refresh:true` 用于明确发布当前配置；显式发布子依赖不继承这个刷新选项。模型使用 modelSnapshot 固定实例和服务商；会话显式选择另一模型时建立新的本轮模型快照。`planTools` 为确定性本地规划器，不代表真实大模型推理。

`sessionFor(agent)` 管理会话；`saveConfig(publish)` 保存或发布当前工作台配置；`invalidateDraft(id)` 清除对应 UI 缓存。会话能力变更影响之后的消息，已经开始的运行保存独立配置。Prompt 的 `contextBindings[].arguments` 保存参数，字符串中的 `{{message}}` 在当轮替换为 goal；工作流 `R.inputSchemaFor(node)` 根据 Prompt 的实际 arguments 生成输入 Schema。

## ContentStore：唯一内容来源

`knowledge.js` 暴露 `S.ContentStore`（简称 `C`），持久状态为 `S.state.contentStore`。知识、Prompt／Skill 与 MCP／插件连接分开管理；旧 `ecoAssets` 根据类型迁移或保留归档信息。

### 内容结构

- 知识库：`{id,name,description,tags,status:'active'|'archived',version,revision,settings:{chunkSize,overlap,retrievalMode:'keyword'|'vector'|'hybrid',embeddingModel?,rerankModel?,embeddingModelSnapshot?,rerankModelSnapshot?},documents,versions}`。
- 文档：`{id,name,content,sourceType,mime,bytes,status,chunks:[{id,index,text}],created,updated}`。仅有元数据的旧记录标 `needs_content`。
- Prompt／Skill：`{id,type:'prompt'|'skill',name,description,content,tags,dependencies,arguments,status,version,versions}`。`arguments` 从 `{{variable}}` 模板提取。
- 内容版本是独立正文与配置副本。归档阻止新的编辑或常规检索；已有固定快照可供历史执行继续引用。

### 公共方法

- `C.listKnowledge(options?)` / `C.getKnowledge(idOrName)`。
- `C.saveKnowledge(values)`：有 id 则编辑，无 id 则创建；校验名称及分段参数。
- `C.addDocument(knowledgeId,values)`：有文档 id 则编辑；`C.removeDocument(knowledgeId,documentId)` / `C.reindex(knowledgeId)`。
- `await C.importDocument(knowledgeId,file,{shouldContinue?})`：读取 TXT／MD／JSON 正文；取消或读取过期后不落库。
- `C.snapshotKnowledge(id,version?)`：返回当前或指定版本副本。
- `C.searchSnapshot(snapshot,query,{topK,scoreThreshold,rerank}?)`：不读取 live 内容，返回 `{items,total,version,mode,query,topK,scoreThreshold,modelStages,simulation}`；每条含文档、分段、score、source 和 matchedTerms。关键词模式为 local-keyword，其它模式明确附 simulation。
- `C.searchKnowledge(id,query,options?)`：便捷检索入口，可传 `version` 或 `snapshot`。
- `C.listContent(options?)` / `C.getContent(id,version?)` / `C.saveContent(values)` / `C.copyContent(id)`。
- `C.listContexts(kind)`：供 Agent 选择本地 Prompt／Skill；`C.resolveContext({kind,id,version?})` 返回对应内容快照。
- `C.archive(kind,id,archived)`、`C.references(kind,id)`、`C.installTemplate(asset)`。

引用本地内容时不能把它再伪造成一个 MCP 连接。知识检索使用保存正文的关键词匹配，或 64 维词项哈希向量与确定性重排的本地模拟。模型配置按知识版本固定，停用状态仍即时检查；没有真实模型网络调用、向量库或 OCR。UI 的版本、分段、引用与数量从此状态计算。

## Publishing：服务与 API Key

`publishing.js` 暴露 `S.Publishing`（简称 `P`），持久状态为 `S.state.publishing`。路由 `services` 为服务列表，`service?id=...&tab=overview|access|keys|logs` 为服务详情。

### 数据与生命周期

- app：`{id,name,description,kind:'agent'|'workflow',sourceId,status:'draft'|'published'|'disabled',accessPolicy:'private'|'request',activeVersionId,versions,created,updated}`。
- version：保存来源版本、输入 Schema 和递归冻结的执行 snapshot。新建或切换服务版本不会改变旧运行。
- request：`pending → approved → claimed`，或 `pending → rejected|cancelled`。审批可收窄授权；领取实际生成 Key，一次完成。
- key：appId、consumer、permissions、rateLimit、dayQuota、expiresAt、status、fingerprint、suffix、usage 等。有效状态为 active／disabled／expired／revoked，过期由时间计算。
- log：一次 API 模拟请求的 app、操作、user、httpStatus、requestId，以及接受后产生的 runId／traceId／版本。Key 正文不进入业务输入或日志。

Key 使用 Web Crypto 随机数和 SHA-256 摘要。明文一次展示，存在当前页面会话内存中供试调；持久化只存指纹和元数据。刷新后可手动提供原凭据或重新签发／轮换。此实现用于原型交互，不构成真实服务端秘密保管或多租户隔离。

### 公共方法

- `P.sources(kind?,id?)` 列出已发布来源；`P.createApp({name,description,kind,id,version,accessPolicy})` 创建草稿服务。
- `P.updateApp(id,values)` / `P.changeStatus(id,'published'|'disabled')` / `P.addVersion(id,sourceVersion)` / `P.activateVersion(id,versionId)`。
- `await P.issueKey(appId,options)`；`P.requestKey(appId,options)`；`P.reviewRequest(id,approved,values)`；`P.cancelRequest(id)`；`await P.claimKey(id)`。
- options 包含 name、purpose、permissions、rateLimit、dayQuota、days。权限为 invoke／read／stop。
- `P.setKeyStatus(id,status)` / `await P.rotateKey(id)` / `P.keyState(key)`。轮换旧 Key 立即吊销，保留原权限及到期时间。
- `await P.invoke(appId,{credential?,keyId?,useSession?,user,inputs,speed?})`。
- `await P.readRun(appId,runId,auth)` / `await P.stopRun(appId,runId,auth)`。auth 包含凭据和同一 user；校验服务、权限、终端用户及运行归属。
- `P.openApi(appId)` 返回可导出的 OpenAPI 对象；`P.openCreate` 打开创建 UI。
- `P.setActor('owner'|'caller')` 切换本地角色预览；`P.clearSession()` 清除内存凭据。

`invoke` 返回 `{httpStatus,body,log,run?}`。成功接受使用 202，最终状态读取 run；无返回值时 body 不强制添加 outputs，receipts 和 files 可为空。权限、Key、配额、输入或服务错误提供相应码与原因。人工等待需要所有者在运行详情处理，没有开放外部审批接口。

API 调用实际复用 `R.runWorkflow` 或 `S.AgentStudio.start` 并传 `preserveResolvedSnapshots:true`；将 `run.apiService` 和 `api.request.accepted` 事件用于 Trace。所有地址为 `.example` 占位，模拟请求不使用网络。对外 MCP 服务未实现。

## Quality：可维护数据与确定性评测

`quality.js` 暴露 `S.Quality`（简称 `Q`），持久状态为 `S.state.qualityData`。路由 `quality` 管理数据集和任务，`dataset?id=...` 维护单集，`experiment?id=...` 检查任务。

### 数据结构

- dataset：`{id,name,description,revision,archived,inputSchema,examples,rules,threshold,versions,createdAt,updatedAt}`。
- example：`{id,input,reference?,expectedStatus,tags,split,source?,createdAt,updatedAt}`。input 必须是 JSON 对象；reference 可省略。source 保存原 runId／traceId 与观察到的状态。
- dataset version：独立 examples／inputSchema／rules／threshold 快照；版本 id 与 dataset id 不混用。任务里的 datasetSnapshot 保留数据集 id 和可选 versionId。
- experiment：`{id,name,status,target,datasetSnapshot,split,options,results,createdAt,finishedAt?,retryOf?}`。target 保存已发布 Agent／Workflow 的固定快照。
- result：`{id,exampleId,example,fingerprint,status,checks,score,actual?,actualStatus?,runId?,traceId?,tokens,cost,duration,review?}`。

任务状态 running／done／stopped；逐题状态 queued／running／passed／failed／error／blocked／stopped。score 在没有可判定结果时为 null。人工 review 独立记录 verdict／note／at，不覆盖自动状态。

### 数据维护接口

- `Q.createDataset(values)` / `Q.updateDataset(id,values)` / `Q.archiveDataset(id,archived=true)`。
- `Q.saveExample(datasetId,values,exampleId?)` / `Q.deleteExamples(datasetId,ids)` / `Q.moveExamples(datasetId,ids,split)`。
- `Q.saveRules(datasetId,rules,threshold)` / `Q.publishDataset(datasetId,note)`。
- `Q.parseImport(text,format)` / `Q.defaultMapping(headers)` / `Q.previewImport(datasetId,text,format,mapping?)`。
- `Q.importExamples(preview,strategy='skip')`：strategy 为 skip／replace／allow；revision 已变化则要求重新预览。
- `Q.exportDataset(datasetId,format)`：返回 json／jsonl／csv 内容；调用方使用共享下载接口。
- `Q.getDataset(id)` / `Q.getExperiment(id)`。

导入支持 JSON 数组、带 examples 的 JSON、逐行 JSONL 与正确处理引号的 CSV。行错误保留在预览，明确导入有效记录；单次限制 1,000 行／2 MB，单集最多 5,000 条。重复按 input + split 判断。空集、归档恢复、删除最后一条均正常可用；历史版本不随之消失。

### 执行、判定与回收接口

- `Q.targets()` 列出已发布版本；`Q.startExperiment({datasetId,versionId?,targetKey,split?,name?,timeoutMs?,speed?})` 同步创建任务并异步执行。默认单条时限 15 秒，上限 60 秒。
- `await Q.waitForExperiment(id)`；`Q.stopExperiment(id)`；`Q.retryExperiment(id)` 创建新任务，只包含旧任务未通过／错误／阻断／停止／未执行样例，保留原始配置。
- `Q.evaluate(example,{status,returnValue},rules,threshold)`：规则类型 contains／equals／json-fields／status／nonempty，可配置返回字段 path、必需字段及启停，等权计算。
- `Q.summarize(experiment)` 聚合实际完成、通过、失败、阻断、错误、已判分数量、分数、用量和估算成本。
- `Q.reviewResult(experimentId,rowId,'pass'|'fail'|'pending',note)` 保存人工复核。
- `Q.compareExperiments(id,baselineId)` 返回逐题对应；只有同一 exampleId、输入／参考／状态指纹、同一规则与阈值才显示 delta。
- `Q.fromRun(runId)` 返回可编辑样例草稿；**`Q.openAddFromRun(runId)`** 是运行详情集成入口：选择目标数据集，进入样例编辑，再保存，并保留来源。

执行使用 Runtime／AgentStudio 的当前本地适配器，实际输出随后按规则计算；没有 LLM 判分或固定评分。启动固定目标、依赖、数据和规则，重试保留同一快照。

离线评测监听根运行与子运行的执行事件，在写工具发送前阻止调用；数据库节点和人工等待会阻断，不自动批准。被阻断或超时无虚构分数和成功回执。无返回流程可用状态规则判定。用量汇总根与后代自身的消费一次，避免父子重复计费。

## 保存与集成约束

`S.save()` 返回布尔结果；存储失败通过共享持续提示反馈。数据模型中的普通 JSON 字段不得因与凭据字段同名而被全局删除；秘密清理由持有该秘密的配置路径或模块负责。Key 明文不放进 state。

所有模块加载后才渲染完整应用，页面跨模块链接通过公开接口调用。工具连接、知识内容、服务 Key、评测数据拥有各自唯一 namespace，不能再创建一个平行的“资产”对象来复制状态。

验证脚本在 `qa/`，包括 Runtime、工作流、能力、跨模块、内容、发布、质量与产品集成。记录实际执行结果，避免在本契约固定测试数量；真实浏览器行为另行验收。

## StudioAuth：账户与工作区

`auth.js` 在 core 之前加载，不依赖 Studio.state。`StudioAuth.attach(Studio)` 在全部模块加载后、init 之前注册页面。

- `workspaceStorageKey()` 返回账户专属 key 或旧演示 key；core 在启动时捕获一次，不随过渡中的身份改变。
- `guard(hash)` 返回安全站内 hash；`isAuthRoute(route)` 决定独立账户页面壳。
- `getSession()` 只暴露安全的账户和有效期元数据。`openAccount()` 打开账户与退出入口。
- `logout({force:false})`、`expire()` 停止工作区异步活动并清除会话凭据；身份转换通过重载重新初始化所有状态闭包。

独立账户记录包含 PBKDF2 加盐验证器，不保存密码正文；会话通常 12 小时，记住登录为 7 天。演示重置挑战只在页面内存保存，10 分钟有效、成功即销毁，不通过 URL 传递，也不发送邮件。认证是本地原型流程，不构成服务端鉴权。

## Models：唯一模型配置来源

`S.state.modelRegistry={schema:1,providers,models,defaults,debugRuns}`。旧 S.state.models 是同步兼容视图，不能建立第二个管理入口。模型本地 id 与厂商 modelId 分开，名称更改保留 aliases。

- `M.list({type,enabled,capabilities,providerId,archived})`；`resolve(idOrName,options)` 类型和能力不符会抛明确错误。
- `M.snapshot(idOrName,options)` 深冻结模型参数、能力与 provider 配置引用，不含真实凭据。
- `M.assertAvailable(snapshotOrId,options)` 检查当前模型及原快照连接启停、类型和能力。
- `M.saveProvider`、`saveModel`、`setStatus`、`remove`、`defaults`、`setDefault`、`references`、`providerReferences` 管理唯一注册表。引用包含应用服务版本、评测、知识、发布配置和活动运行。
- `M.selectionOptions(type,selected,options)` 生成统一原生 select 选项，空选择与不可用原值均明确展示。
- `M.freezeBinding(selection,previous,options)` 先解析稳定 ID 和用途，再保留或刷新快照；外部 modelId 不能充当本地绑定 ID 规避类型检查。
- `M.migrateLegacyBindings()` 只处理明确配置 owner；对旧名称发布配置一次捕获，记录 legacy-name 来源。未知或停用保持阻断，不自动替换。已完成运行不重新迁移。

类型为 llm、embedding、rerank、image、stt、tts。协议和能力由模型实例声明；服务商模板不等同于真实兼容认证。知识保存同时固定向量／重排配置；`R.recordRetrievalUsage(run,result,meta)` 将实际本地模拟阶段写入估算用量事件。

## Planning：运行范围的自主协作

`Planning.prepare(run,{goal,snapshot,sessionSnapshot})` 生成 `run.plan`，schema 为 delegation-v1。保留旧 steps/snapshot/sessionSnapshot 兼容字段，新增 tasks、agents、policy、limits、modelPool、capabilitySnapshots 与执行历史。

- 每个 task 保存 agentId、name、role、instruction、inputNote、outputNote、dependsOn、toolIds、modelMode、modelId、modelSnapshot、temperature、maxTokens、maxCost。
- `updateTask`、`addTask`、`removeTask`、`updatePolicy` 校验依赖循环、预算、模型池和父授权边界。
- `execute(planRunId)` 创建 kind=plan-execution 的协调 Run。原计划、协调 Run、子 Run 通过 parentRunId 共享 traceId。重复点击返回活跃协调 Run；结束后需 duplicate 创建待确认的新计划。
- `childSnapshot` 创建临时 Agent，`AgentStudio.start({ephemeralAgent,snapshot,preserveResolvedSnapshots:true,capabilitySnapshots})` 执行，工具定义进一步缩小到任务 allowlist。临时 Agent 不进入永久列表；saveDraft 是明确单独动作。
- 依赖任务的实际结果作为后续输入，按 concurrency 有界调度。父与子预算、时限、数量、深度均检查；不得扩大工具范围，也不能自动批准写入。
- 协调 Run 转发待确认 child，记录 waitingRunIds；拒绝、失败或停止会停止未完成任务，保留已发生的回执。`stopAll()` 用于登出与过期。
- `delegationUsage` 汇总子用量供展示，协调 Run 不重复增加 tokens/cost。resultMode=none 可成功且无返回值／文件；实际回执继续保留。
- `card`、`open` 和 plan/planning 页面共享同一计划状态；从详情执行也追加回来源 Chat 会话。

自动分工与模型输出均为可观察的本地规则模拟，实际任务 DAG、审批、取消、子 Run 与 Trace 由共享执行器执行。
