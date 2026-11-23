# 共享执行模型接口

`runtime.js` 在 `core.js` 后、各页面脚本之前加载；全局 `Studio.Runtime`（简称 `R`）。全部外部服务为本地模拟，控制流和参数解析真实执行。runtime 负责目录、连接、图示例及迁移；页面不另建平行数据源。

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
- 所有运行加入 `S.state.runs`，`engine:'graph'` 用于区分旧演示记录；`kind:'workflow'|'node-debug'|'tool-debug'|'agent'|'subworkflow'`。

## 公共方法

- `R.createRun({title,kind,source,agent,model,version,parentRunId,inputs,snapshot})` → run，初始 running。
- `R.runWorkflow(flow,{inputs={},scenario='success',debug=false,fromNode?,breakpoints=[],parentRunId?,speed?}={})` → run（同步返回，异步推进）。`scenario` 可为全局字符串或 `{nodeId:'empty'}`，测试空结果、失败、超时等。`speed:0` 为测试无延迟。
- `R.testNode(node,{inputs={},context={},scenario='success',speed?}={})` → run。context 可提供 input、nodes、workflow、iteration、loop。
- `R.testTool(toolId,args,{scenario='success',speed?,approved?}={})` → run。
- `await R.invokeTool({run,toolId,args,scenario='success',nodeId,nodeExecutionId,approved=false,binding?,connectionId?,timeoutMs?,speed})` → structured result；自动创建 toolCall/events/transcript，写入工具在未批准时暂停 run，审批后继续。
- `R.completeRun(run,{returnValue?,message?,receipts?,artifacts?}={})` / `R.failRun(run,error)`。
- `R.resolveApproval(runId,approved,values={})` → boolean；仅当前 pending 生效一次。`R.resume(runId)` 恢复断点。`R.stop(runId)`。
- `R.subscribe(fn)` → unsubscribe；每个状态变化回调 `fn(run,event)`。
- `R.findRun(id)` / `R.validate(flow)` → `{valid,errors:[{nodeId?,message,code}],warnings:[...]}`。
- `R.resolveBinding(binding,context)` → value（未产生的引用抛出 `UNPRODUCED`）。`R.validateSchema(value,schema)` → 字符串错误数组。
- `R.snapshot(flow)` → 不含历史/递归字段的独立图快照。`R.publishedFlow(id)`。
- `R.listVariables(flow,nodeId,run?)` → `[{path,type,label,sample?}]`，仅合法上游。
- `R.event(run,type,data={})` 记录事件；`R.addModelUsage(run,{nodeId,model,inputTokens,outputTokens})` 记录估算用量。
- `R.waitForRun(run)` Promise：等到 done/failed/rejected/stopped；等待审批不会提前结束。

## 运行记录

`run`: `{id,engine,kind,status,title,source,created,finishedAt?,duration?,version,model,inputs,snapshot,workflowSnapshot,events:[],nodeExecutions:[],toolCalls:[],pending?,outcome:{receipts:[],artifacts:[],returnValue?,message?},artifacts:[],tokens,cost,usageKind:'estimated'}`。

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
- subflow: config.flowId，config.version（发布快照），bindings 为子流程 input。
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
