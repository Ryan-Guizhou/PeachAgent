# PeachAgent 交互原型

本目录保存本次已交付的 OTRYX Studio 原型，作为 PeachAgent 产品交互与运行语义的参考。它使用原生 HTML、CSS、JavaScript 实现，外部模型、MCP 和插件调用由本地适配器模拟。原型入库不代表七阶段生产功能已经实现或验收。

关联任务：[Issue #6](https://github.com/Ryan-Guizhou/PeachAgent/issues/6)。完整产品范围仍以仓库 [requirements](../requirements/README.md) 和 [technical](../technical/README.md) 为准；原型中的品牌、示例数据和交互方案可在后续产品开发中继续调整。

## 打开体验

下载或克隆仓库后，用桌面浏览器打开 [OTRYX_Studio.html](OTRYX_Studio.html)。该文件已经内联 CSS 和 JavaScript，无需 npm 安装、构建服务或联网加载前端依赖。GitHub 文件页展示源码，需要下载文件后打开。

修改源码时，也可以从仓库根目录启动本地静态服务：

```bash
python -m http.server 8080 --directory prototype
```

然后打开 <http://localhost:8080/src/index.html>。Windows 使用 `python`；系统仅提供 `python3` 时，将文档中的 `python` 替换为 `python3`。

## 建议体验路径

1. **工作流 → 研究简报 · 写入团队空间**：运行并完成审批，观察目标写入回执、无流程返回值和零下载文件。
2. **MCP → Research MCP → 调试**：按 Schema 填写参数，切换成功、空结果、工具错误、超时等模拟场景，查看协议记录，再绑定到 Agent。
3. **Agent Chat → 工具调用 → 运行追踪**：查看能力绑定、执行计划、参数、审批、父子运行和同一次调用的追踪记录。
4. 对比 **更新业务记录 · 无返回值**、**多路分析 · 返回结构化数据**、**复用发布子流程**、**生成文件 · 显式成果节点** 的不同结果。

## 本次原型覆盖

| 模块 | 可体验内容 |
|---|---|
| 工作流 | 37 个节点族、图编辑、上下游变量和类型、分支、并行、循环、审批、子流程、版本与调试 |
| 能力与 MCP | 连接实例、Tools/Resources/Prompts、Schema 参数、模拟调用、协议记录、历史与绑定 |
| 插件 | 配置实例、启停、版本兼容演示、安装/卸载、Agent 与节点使用 |
| Agent | 提示词与模型配置、工具和上下文绑定、计划/执行、权限范围、预算、会话与审批 |
| 追踪 | 节点/工具输入输出、错误与重试、父子运行、事件、快照、用量和运行比较 |
| 原有页面 | 知识与资产、公共市场与审核、用量、质量、模型设置和部署配置草案 |

工作流结果分别记录 **执行状态、可选流程返回值、目标操作回执、显式文件**。执行成功不要求产生文件或返回数据；条件未命中时也可以正常结束，且不生成任何新对象。

## 目录与文档

| 路径 | 用途 |
|---|---|
| [OTRYX_Studio.html](OTRYX_Studio.html) | 可直接打开的离线单文件入口 |
| [src/index.html](src/index.html) | 开发入口；同目录保存全部 CSS 和 JS |
| [src/README.md](src/README.md) | 详细功能、源码职责、数据边界与维护说明 |
| [src/PRODUCT-PLAN.md](src/PRODUCT-PLAN.md) | 原型产品规划及本轮实施对照 |
| [src/RUNTIME-CONTRACT.md](src/RUNTIME-CONTRACT.md) | 共享运行数据、能力绑定与接口约定 |
| [src/DESIGN.md](src/DESIGN.md) / [src/UX-CONTRACT.md](src/UX-CONTRACT.md) | 视觉和交互约定 |
| [src/CONTRIBUTING-PROTOTYPE.md](src/CONTRIBUTING-PROTOTYPE.md) | 模块边界与修改约束 |
| [src/qa/verification.md](src/qa/verification.md) | 已执行检查、静态审计结果与未验收范围 |

## 构建与验证

需要 Node.js 和 Python 3，仅使用它们的内置模块。从仓库根目录执行：

```bash
node prototype/src/qa/integration.cjs
python prototype/src/qa/verify-sources.py
python prototype/src/build.py
```

按此顺序运行：第一步生成供第二步检查的页面快照。快照位于 `prototype/src/qa/.generated/`，已被 Git 忽略。最后一步重新生成 `prototype/OTRYX_Studio.html`，修改源码后应一并提交更新后的离线入口。

Node 契约与静态检查覆盖运行、工作流、能力配置及跨模块行为。具体数量和检查结果见 [验证记录](src/qa/verification.md)；这些检查不等同于真实浏览器验收。

## 已知边界

- 外部工具、模型响应、连接发现和协议均为本地模拟；不会真实连接业务系统或产生模型费用。
- Webhook、定时、数据库、沙箱等提供配置与受控演示，未接入对应后端服务。
- 部分嵌套流程与复杂 Schema 使用高级 JSON 配置，尚未提供完整的嵌套子画布。
- 状态保存在浏览器 localStorage。请使用示例数据，不要填写真实密钥或敏感业务材料。
- 真实浏览器中的视觉、焦点、窄屏、拖拽、剪贴板和下载验收仍待完成，未提供截图验收结论。
- Sa-Token、持久任务队列、真实凭证保管、运行隔离和 Docker Compose 安装包属于后续正式产品开发范围。
