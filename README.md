# PeachAgent

[简体中文](README.md) · [English](README_EN.md)

<!-- doc-section:overview -->
## 面向完整任务的 AI 智能体开发平台

PeachAgent 计划将可视化工作流、Agent、MCP、Skill、项目规则、上下文管理、知识检索、质量评测、Prompt 优化和成本控制放在同一个项目中，让应用能够逐步构建、运行、检查和改进。

**当前状态：需求规划阶段。** 仓库已提供 v0.1 需求草案、路线图、开发流程和文档图示，尚未实现产品功能。需求需要项目负责人确认，技术方案随后确定。

<!-- doc-section:capabilities -->
## 计划提供的能力

| 能力 | 用户可以完成的事情 |
|---|---|
| 项目与模型 | 管理项目、配置可用模型、开展对话并查看运行历史 |
| 可视化工作流 | 拖拽节点、连接步骤、配置条件与数据传递、运行调试 |
| Agent 与 MCP | 在明确授权和任务限制内选择工具并完成多步任务 |
| Skill 与项目规则 | 读取 AGENTS.md 等确认支持的规则，按需加载 Skill 正文和参考资料 |
| 上下文与记忆 | 查看容量与采用的信息，压缩历史并保留目标、约束、待办和证据 |
| 知识库与 RAG | 维护资料、比较检索结果、回答时提供可核验引用 |
| 质量与 Prompt | 通过固定样本比较版本、分析失败、评测优化候选并人工选择 |
| 成本与预算 | 从首次付费调用开始记录用量、限制任务，分析每个成功任务的成本 |

以上为规划能力，详细范围与完成标准见 [需求文档](requirements/README.md)。

![PeachAgent 产品能力关系](image/product-capabilities.svg)

图示表达产品能力关系，不代表已确定的技术架构。

<!-- doc-section:roadmap -->
## 六阶段路线图

| 阶段 | 交付的用户结果 | 需求 |
|---|---|---|
| 1 | 完成有记录、有用量和预算约束的项目对话 | [项目与对话](requirements/phases/phase-01-project-and-chat.md) |
| 2 | 拖拽并运行可调试、有版本的工作流 | [可视化工作流](requirements/phases/phase-02-visual-workflow.md) |
| 3 | 结合 MCP、Skill、规则和上下文完成有限多步任务 | [Agent、Skill 与上下文](requirements/phases/phase-03-agent-skills-context.md) |
| 4 | 使用项目资料检索证据并进行带引用问答 | [知识库与 RAG](requirements/phases/phase-04-knowledge-and-rag.md) |
| 5 | 对比质量、验证 Prompt 优化并分析成本 | [质量、Prompt 与成本](requirements/phases/phase-05-quality-prompt-cost.md) |
| 6 | 按需求增强人工介入、长任务、协作和受控执行 | [高级协作与扩展](requirements/phases/phase-06-advanced-collaboration.md) |

**阶段 1 交付首个可运行成果，阶段 1–5 组成首个完整核心版本，阶段 6 为后续增强。** 当前所有功能阶段均待确认、未开发。具体依赖、阶段边界与核对方式见 [完整路线图](requirements/02-roadmap.md)。

<!-- doc-section:reading -->
## 从这里开始

当前可直接阅读和审阅文档，尚无产品启动命令或运行环境要求。

1. 阅读 [项目背景与范围](requirements/01-product-background-and-scope.md)，确认目标用户和使用场景。
2. 阅读 [路线图](requirements/02-roadmap.md) 与对应阶段需求，确认交付顺序和边界。
3. 核对 [共性需求](requirements/03-cross-cutting-requirements.md) 中的权限、版本、预算和结果记录。
4. 通过 [验收与需求追踪](requirements/04-acceptance-and-traceability.md) 检查能力覆盖和任务拆分。
5. 在 [待决事项](requirements/05-decisions-and-change-log.md) 中确认关键产品选择。

需求确认后再补充技术设计、开发任务和真实的启动说明。详细需求与流程文档目前以中文提供。

<!-- doc-section:repository -->
## 仓库目录

| 目录或文件 | 用途 | 当前边界 |
|---|---|---|
| [requirements/](requirements/README.md) | 背景、路线图、共性要求、分期需求、验收与变更 | 描述需求与标准，不确定技术实现 |
| technical/ | 后续技术文档 | 目前只有 .gitkeep 占位，需求确认后补充 |
| [image/](image/README.md) | 文档图示与可编辑源文件 | 产品能力、路线图和开发流程图 |
| [ci/](ci/README.md) | 项目开发与交付流程、Issue/PR/阶段核对模板 | 本次只规定流程，不配置自动化流水线 |
| [README_EN.md](README_EN.md) | 内容对应的英文项目入口 | 与本 README 保持同步 |
| [LICENSE](LICENSE) | 项目许可证 | MIT |

<!-- doc-section:development -->
## 开发与交付

按 [开发流程](ci/README.md) 执行：

**确认需求 → 拆分 Issue → 按 Issue 开发 → 提交 PR → 检查与编译/构建 → 合并 main → 核对阶段功能。**

- 每个开发 Issue 对应一份交付 PR，并注明需求编号与验收证据。
- 代码 PR 合并前必须排除明显错误，并正常编译或构建通过；使用真实工程提供的命令记录结果。
- 纯文档 PR 检查内容、链接、图示和需求映射，编译标为“不适用”。
- 阶段结束逐项检查需求，明确遗漏、失败和延期。PR 合并不自动等于阶段完成。

总规划由 [Issue #1](https://github.com/Ryan-Guizhou/PeachAgent/issues/1) 跟踪；本次文档交付对应 [Issue #2](https://github.com/Ryan-Guizhou/PeachAgent/issues/2)。候选开发任务尚未自动转成已开工 Issue。

<!-- doc-section:status -->
## 当前边界

本仓库正在确认产品需求，暂未确定框架、数据库、接口和部署方式。此前讨论的技术建议没有作为已确认决策写入本版文档。

本次不实施产品代码、自动化 CI/CD、灰度发布、商业计费或大规模运维。图片展示规划和流程，所有验收条目等待真实功能交付后执行。

<!-- doc-section:license -->
## 许可证

本项目使用 [MIT License](LICENSE)。
