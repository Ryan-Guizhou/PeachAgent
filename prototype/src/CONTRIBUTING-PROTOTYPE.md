# 原型模块接口与维护约定

所有页面为普通 IIFE，在 `window.Studio` 注册，无 ES module 或外部依赖。

## 加载顺序与责任

`core → runtime → workspace → builder → ecosystem → governance → capability-ui → trace → agent-studio`。

- `core.js` 负责共享原语与兼容旧数据；不新增另一套执行器。
- `runtime.js` 的 `Studio.Runtime` 是能力目录、图执行、审批、工具调用和事件的唯一入口。详细接口见 `RUNTIME-CONTRACT.md`。
- `builder` 负责 `workflows/workflow`，不再负责任务详情。
- `capability-ui` 负责 `capabilities/mcp/mcp-detail/plugins/plugin-detail`。
- `trace` 负责 `tasks/task`，提供 `Studio.RunUI` 的状态、JSON、工具卡、审批与结果展示。
- `agent-studio` 接管 `agent/chat` 路由及新的 `Studio.startRun`；工作台发起任务也进入统一 Agent 调用路径。

## 共享界面原语

复用 `Studio.page/action/form/go/render/save`、`icon/escape/badge/btn/header/tabs/field/validate`、`modal/drawer/closeModal`、`toast/copy/download`。动作使用 `data-action`，由 `core.js` 的事件委托调用已注册 handler；不要添加虚假的内联 onclick 以迎合静态检查。

原生 select 是项目明确选择的控件，弹出层由浏览器管理。所有 form 使用 novalidate，textarea 使用 resize:none，输入保留 label/aria-label，数据必须 HTML 转义。模态导航统一关闭当前 dialog；未保存页面离开由 Studio.setDirty 管理。

样式只消费 `styles.css` 的语义令牌。功能 CSS 使用自己的前缀，不改变其它路由的页面滚动所有权。

## 数据与版本

- Graph Run、Tool Debug、Node Debug、Agent 均写入 `Studio.state.runs`，`engine:'graph'` 区分历史示例。
- status、outcome.returnValue、outcome.receipts、outcome.artifacts 分离；不得用“有文件”判断任务是否成功。
- 只有显式成果节点产生文件。节点内部输出默认只出现在执行记录中。
- Agent 具体工具绑定使用 capabilityBindings；资源/Prompt/Skill/Workflow/子 Agent 使用 contextBindings。
- 编辑草稿不得改写 publishedConfig 或已启动 Run 的 snapshot。
- 其它页面改变 Agent 草稿后调用 `Studio.AgentStudio.invalidateDraft(id)`；改变流程草稿后调用 `Studio.Workflow.invalidateDraft(id)`。
- 连接实时禁用、凭证失效和当前权限仍在每次调用检查；版本不匹配不能静默替换。
- 测试场景必须明确为本地模拟；不发起外部业务请求、不保存真实密钥。

## 重新验证

运行 `node qa/integration.cjs`、`python qa/verify-sources.py`、`python build.py`。
测试结果不能代替真实浏览器视觉、焦点和响应式验收。当前限制见 `qa/verification.md`。
