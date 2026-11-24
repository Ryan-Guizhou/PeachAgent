# OTRYX Studio 原型源码

本目录是 [PeachAgent 交互原型](../README.md)的可维护源码。整体需求及 P1–P7 排期统一见[产品 PRD](../../requirements/PRD-PeachAgent.md)，当前可体验范围与模拟边界见上级 README。

## 源码职责

所有模块采用普通 IIFE，共享 `window.Studio`，无外部前端依赖。完整加载顺序以 [index.html](index.html) 为准；共享执行由 `Studio.Runtime` 负责，各页面不另建执行器。

| 文件 | 职责 |
| --- | --- |
| `index.html` | 页面壳、模块加载、主题预应用及启动入口 |
| `appearance.js` / `theme-engine.css` | 三套主题、核心双语与浏览器外观偏好 |
| `spaces.js` / `auth.js` / `auth.css` | 本地账户、会话、空间生命周期与数据隔离 |
| `projects.js` | 项目注册表、项目级存储、固定版本资源副本 |
| `credentials.js` | 模型／工具凭证引用、绑定、撤销和轮换元数据 |
| `inbox.js` | 统一待办导航；复用三类原审批权限 |
| `core.js` / `styles.css` / `product-polish.css` | 状态保存、路由、共享表单与弹窗、导航、存储错误提示 |
| `runtime.js` | 节点目录、图执行、变量、工具适配器、审批、依赖快照与事件 |
| `workspace.js` | 工作台、Agent 列表及旧路由兼容 |
| `builder.js/css` | 工作流画布、参数检查器、连线及调试 |
| `agent-studio.js/css` | Agent 配置、Chat、上下文绑定与统一调用路径 |
| `planning.js/css` | 临时子 Agent、任务 DAG、模型池、预算及父子运行 |
| `models.js/css` / `model-bindings.js` | 服务商、六类模型、用途默认值、可用性与配置快照 |
| `capability-ui.js/css` | MCP／插件、连接实例、具体能力及调试 |
| `knowledge.js/css` | 知识正文、分段、检索、Prompt／Skill 与内容版本 |
| `publishing.js/css` | 服务版本、API Key、本地 Playground 和调用日志 |
| `quality.js/css` | 数据集、导入导出、规则、评测、比较与人工复核 |
| `trace.js/css` | 状态、调用树、审批、结果、快照与问题回收 |
| `ecosystem.js/css` | 市场模板、演示审核与旧资产入口迁移 |
| `governance.js/css` | 估算用量、空间偏好及 Compose 草案 |
| `qa/` / `build.py` | 离线契约、静态标记检查、验证记录及单文件构建 |

## 维护规则

按[当期评审与交付规则](../../ci/README.md)确认开发范围后，再修改源码。共享数据、方法和状态约束见 [RUNTIME-CONTRACT.md](RUNTIME-CONTRACT.md)，页面行为见 [UX-CONTRACT.md](UX-CONTRACT.md)，模块协作规则见 [CONTRIBUTING-PROTOTYPE.md](CONTRIBUTING-PROTOTYPE.md)。

`styles.css` 提供共享基础样式，`theme-engine.css` 提供三主题语义令牌及兼容覆盖；主题细节见 [THEME-I18N-DESIGN.md](THEME-I18N-DESIGN.md)。颜色与组件变更应同时核对三套主题。

主题／语言使用当前浏览器共享偏好；业务状态按账户、空间与项目保存。`core.js` 在启动时固定存储 key，身份、空间或项目切换通过重载重新初始化。默认空间的默认项目沿用旧数据 key；新增项目使用独立示例数据。

当前外部模型、工具和业务写入均为模拟。不要把新的页面配置项写成已经接入的服务能力，也不要把本地角色预览写成生产权限校验。

## 构建与验证

从本目录执行：

```bash
node qa/integration.cjs
python qa/verify-sources.py
python build.py
```

第一步生成 `qa/.generated/*-rendered.json`，静态检查依赖这些快照；最后一步把入口引用的 CSS／JS 内联到上级 `OTRYX_Studio.html`。源码变更经验证后同步构建文件。

模块契约可以单独运行，例如 `node qa/appearance-contract.cjs`、`node qa/quality-contract.cjs`、`node qa/publishing-contract.cjs`。实际完成的检查及缺口统一记录在 [qa/verification.md](qa/verification.md)，不在各说明中重复测试数量。离线契约和静态标记检查不能代替浏览器布局、焦点、滚动、拖动与下载验收。
