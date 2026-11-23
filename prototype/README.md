# PeachAgent 交互原型

本目录保存 OTRYX Studio 的原生 HTML、CSS、JavaScript 高保真原型。它覆盖从构建 Agent／工作流、维护知识与工具，到发布应用服务、申请 API Key、追踪运行、维护评测集的完整使用路径。OTRYX Studio 是原型暂定名称。

**这是可交互的本地原型。** 数据、参数、分支、权限校验、版本与规则评分按实际操作变化；模型、MCP、插件、HTTP 和外部写入仍通过本地适配器模拟。发布页不会建立真实 API 服务，也不会发出业务网络请求。

本轮只调整 `prototype/` 内的交互与说明，以用户反馈和本目录的实际源码为依据。关联任务：[Issue #6](https://github.com/Ryan-Guizhou/PeachAgent/issues/6)。

## 打开体验

下载 [OTRYX_Studio.html](OTRYX_Studio.html)，用桌面浏览器打开。HTML、CSS、JavaScript 已内联，无需安装前端依赖或联网。GitHub 文件页显示源码，需要下载文件后打开。

修改源码时，也可以从仓库根目录启动本地静态服务：

```bash
python -m http.server 8080 --directory prototype
```

访问 <http://localhost:8080/src/index.html>。系统仅提供 `python3` 时，将命令中的 `python` 替换为 `python3`。

## 建议先体验这五条路径

1. **发布与 API → 新建服务**：选择已发布 Agent 或工作流，固定来源版本并上线。在 API Key 页切换“调用方预览”提交申请，再以“所有者预览”审批，返回调用方领取。通过接入页的本地 Playground 调用，查看请求、运行与 Trace 的关联。
2. **质量评测 → 新建评测集**：添加样例或导入 JSON／JSONL／CSV，维护参考输出、分组、输入 Schema 与规则，保存版本后启动评测。修改参考答案再启动新任务，观察真实变化的判定结果；历史任务保持原快照。
3. **知识库 → 新建知识库**：粘贴资料或导入 TXT／Markdown／JSON 正文，调整分段并测试检索。把知识库绑定到 Agent 或知识检索节点，查看对应版本与引用。提示词与 Skills 在独立入口维护。
4. **工具与连接 → MCP → Research MCP → 调试台**：填写 Schema 参数，切换成功、空结果、工具错误、超时等模拟场景，查看协议记录，再挂载到 Agent。Chat 和工作流复用同一连接及具体工具。
5. **工作流 → 研究简报 · 写入团队空间**：检查变量、分支和人工确认，运行后查看模拟目标写入回执。流程可成功结束且没有返回值、没有下载文件。

## 页面归属

| 导航 | 用户在这里处理的事情 |
| --- | --- |
| 工作台 | 继续编辑、查看最近运行、处理待确认事项和待审批申请 |
| 智能体 / 工作流 | 配置、测试、发布可复用执行版本；进入独立 Agent Chat |
| 发布与 API | 创建应用服务、选择服务版本、接入示例、API Key 申请与管理、调用日志 |
| 知识库 | 资料正文、文档、分段、检索测试、引用与版本 |
| 工具与连接 | MCP、插件、连接实例、凭证引用、具体工具和调试 |
| 提示词与 Skills | 可编辑正文、参数、依赖说明、归档与版本 |
| 资源市场 | 发现和安装模板；公开资源的提交与演示审核 |
| 运行记录 / 用量与成本 | 同一执行的结果、调用链、审批、错误、用量和估算成本 |
| 质量评测 | 评测集、样例、规则、版本、任务、比较、人工复核与问题回收 |

MCP 连接不会再作为知识内容重复维护。应用服务对外提供能力的生命周期与资源市场审核分开；API Key 申请审批也与运行中的写入确认分开。

## 运行结果的含义

**成功完成不要求生成文件或返回数据。** 运行状态、可选返回值、目标操作回执、显式文件分别保存。节点可能已将目标内容放到指定位置；条件不满足时也可以不执行任何业务操作而正常结束。内部节点输出用于传参和调试，不会自动变成文件或最终返回值。

## 目录与文档

| 路径 | 用途 |
| --- | --- |
| [OTRYX_Studio.html](OTRYX_Studio.html) | 离线单文件入口 |
| [src/index.html](src/index.html) | 拆分源码入口 |
| [src/README.md](src/README.md) | 详细功能、体验步骤、源码职责与实现边界 |
| [src/PRODUCT.md](src/PRODUCT.md) | 当前用户目标、对象职责与产品原则 |
| [src/PRODUCT-PLAN.md](src/PRODUCT-PLAN.md) | 本轮产品规划、实施状态及后续工程边界 |
| [src/RUNTIME-CONTRACT.md](src/RUNTIME-CONTRACT.md) | 共享执行、内容、发布和评测接口 |
| [src/DESIGN.md](src/DESIGN.md) / [src/UX-CONTRACT.md](src/UX-CONTRACT.md) | 视觉与交互约定 |
| [src/qa/verification.md](src/qa/verification.md) | 已执行检查与尚未验收的范围 |

## 构建与验证

使用 Node.js 和 Python 3 的内置模块。从仓库根目录执行：

```bash
node prototype/src/qa/integration.cjs
python prototype/src/qa/verify-sources.py
python prototype/src/build.py
```

契约脚本会生成供静态检查使用的页面快照，位于已忽略的 `prototype/src/qa/.generated/`。最后一步重新生成离线入口，源码修改后应同步更新该文件。模块检查也可分别运行 `prototype/src/qa/quality-contract.cjs` 和 `prototype/src/qa/publishing-contract.cjs`。

测试覆盖内容以当前脚本与[验证记录](src/qa/verification.md)为准；Node 契约和静态标记检查不等同于真实浏览器验收。

## 实现边界

- API 地址使用 `.example` 占位。Playground 在浏览器中校验 Key、作用域、权限和配额，并运行本地快照；不向该地址发请求。对外 MCP 服务尚未实现。
- 评测执行本地模型／工具适配器，通过确定性规则计算结果。没有接入 LLM 判分，不能把规则通过率理解为真实模型的语义质量。
- 知识检索使用实际保存正文的本地关键词匹配；没有嵌入模型、向量数据库、OCR 或 PDF／Word 解析。
- 37 个工作流节点族提供配置和受控执行。Webhook、定时、数据库、沙箱等未连接生产后端；复杂嵌套 body 使用高级 JSON，尚无完整子画布。
- 状态存入当前浏览器 localStorage。存储不可用时页面显示持久提示；刷新前可导出重要内容。不要填入真实凭据或敏感业务资料。
- 应用 API Key 明文仅一次展示，并只在当前页面会话内用于试调；持久存储仅保留指纹和元数据。模型密钥与 MCP 凭证属于另一类配置。
- 真实浏览器的视觉、焦点、窄屏、拖拽、原生选择、剪贴板和下载仍需目标环境验收。此文档不声明已完成截图或浏览器验收。
