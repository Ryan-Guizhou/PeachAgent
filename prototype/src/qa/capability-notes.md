# 能力中心实现与验证

## 文件与入口

- `capability-ui.js`、`capability-ui.css`；须在 `runtime.js` 之后加载。
- 路由：`capabilities`、`mcp`、`mcp-detail`、`plugins`、`plugin-detail`。
- 共用 `Studio.Runtime` 的连接、工具、插件、测试用例、执行记录；不建立独立的假调用历史。
- 所有外部调用均使用明确标注的本地模拟适配器。

## 已实现

MCP 连接支持新建、编辑、启用、停用、配置检查、能力发现结果与版本记录。传输配置包含 Streamable HTTP、stdio、旧 HTTP+SSE；stdio 指向 Runner，浏览器不执行用户电脑上的命令。凭证只接受引用，默认示例引用和命名引用都可编辑。

能力清单区分 Tools、Resources、Prompts。工具调试器根据 JSON Schema 生成参数表单；对象和数组使用 JSON 字段，也可切换完整 JSON 输入。运行使用实际输入和所选模拟场景。场景包含成功、空结果、工具失败、超时、输出结构不匹配、协议错误和授权过期。

调试结果展示结构化输出与执行器记录的原始响应，协议区显示请求 ID、传输方式和提供的 HTTP 状态。`isError` 为工具失败，不能由 HTTP 成功替代。停止、写入审批、拒绝和 Trace 跳转使用公共 Runtime。工具写入产生目标位置回执，不自动生成下载文件。

测试输入可命名保存、重新载入和删除。工具可挂载到 Agent 草稿（保持已发布快照），或作为独立节点加入工作流草稿。挂载保存 `capabilityBindings` 的工具、连接、版本、启用状态、审批策略和超时配置。

插件支持配置实例、启用、停用、卸载、重新安装、兼容升级演示、依赖和版本记录。插件清单可导出或导入；导入仅接受已知模拟适配器，不下载或执行外部代码，自定义不匹配 Schema 会报错。一个插件包可以有多个配置实例，每个实例持有独立、无名称冲突的工具 ID。

## 验证

执行 `node --check capability-ui.js` 通过。

Node VM 契约验证覆盖：

- 13 个路由与详情页标签变体可渲染，所有生成的 `data-action`、`data-form` 均已注册。
- 工具调试产生实际 Runtime 结果、同一 request ID 和原始响应；无隐式下载文件。
- Agent 能力保存只更新草稿，已发布 `publishedConfig` 不变。
- 能力挂载调用 `Studio.AgentStudio.invalidateDraft`，集成验证了已缓存的 Agent 编辑页能显示新绑定；上下文绑定保留实际资源版本。
- 从连接模板复制工具后，命名空间 ID 保持唯一，使用原有适配器并记录新连接 ID。
- 无授权连接使用 `authType: none`；停用连接阻止下一次工具调用。
- 私有插件清单导入可调用；卸载阻止调用，重新安装恢复。

可重新运行的验证脚本为 `qa/capability-contract.cjs`，在源码目录执行 `node qa/capability-contract.cjs`。脚本使用项目相对路径；当 `trace.js` 与 `agent-studio.js` 存在时，同时运行 Agent 编辑缓存集成验证。

## 限制

浏览器预览受环境策略限制，未运行实际浏览器视觉、焦点、窄屏和下拉展开验收。以上是 Node VM 行为检查，不作为真实浏览器验证声明。

MCP 连接检查和能力刷新仅验证本地演示状态。协议记录来自本地适配器，不是远程抓包。导入插件不会安装真实插件包。升级示例保留 Schema，以演示版本与依赖关系；不提供真实远端版本发现。
