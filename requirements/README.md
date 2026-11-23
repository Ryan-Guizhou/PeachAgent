# PeachAgent 需求文档

> 版本：v0.2 · 更新：2026-11-23 · 状态：依据已确认范围形成的需求基线；功能尚未实现、尚未验收。

PeachAgent 面向个人开发者，提供从设计 Agent、配置工具与知识，到实际执行、评测改进、共享发布和部署的完整平台。每个个人用户是独立租户，可使用全部产品功能；使用自己的模型及外部服务凭证。七个阶段是有依赖关系的完整交付计划，阶段 6 完成功能闭环，阶段 7 完成 Docker Compose 部署交付。

## 1. 推荐阅读顺序

| 文档 | 回答的问题 |
|---|---|
| [项目背景与范围](01-product-background-and-scope.md) | 为谁解决什么问题；哪些是本次完整版本的必需能力 |
| [产品架构与业务蓝图](06-product-architecture.md) | 四个产品域如何配合，用户、资源、运行和发布之间有什么关系 |
| [能力完整性矩阵](07-capability-matrix.md) | 哪些能力内置，哪些可以扩展，什么时候交付，怎样判断完整 |
| [七阶段路线图](02-roadmap.md) | 每期输入、输出、依赖和完成条件 |
| [跨阶段共性需求](03-cross-cutting-requirements.md) | 权限、凭证、版本、预算、失败、数据生命周期和可追溯性 |
| [验收与追踪](04-acceptance-and-traceability.md) | 每项需求如何关联 Issue、PR 和真实验收证据 |
| [决策与变更记录](05-decisions-and-change-log.md) | 用户已经确认什么，哪些属于本方案建议，后续如何变更 |
| [插件系统专题](topics/01-plugin-system.md) | 自定义代码、配置和界面如何成为可管理的插件 |
| [公共仓库专题](topics/02-public-repositories.md) | 应用、插件、Skill、MCP、提示词如何提交、审核、公开和使用 |

## 2. 七阶段详细需求

| 阶段 | 需求文档 | 本阶段可演示的结果 |
|---|---|---|
| 1 | [个人空间、项目与对话](phases/phase-01-project-and-chat.md) | 注册后配置本人模型，完成对话并看见 Token 用量；建立资源与插件开发入口 |
| 2 | [可视化工作流](phases/phase-02-visual-workflow.md) | 拖拽、连接、调试带条件和子流程的流程；配置插件节点及两类界面 |
| 3 | [Agent、MCP、Skill、上下文](phases/phase-03-agent-skills-context.md) | 执行工具任务，按需读取 Skill，管理规则与记忆，压缩上下文，动态加载受控代码插件 |
| 4 | [知识与 RAG](phases/phase-04-knowledge-and-rag.md) | 导入资料、比较检索策略、核对证据、生成可追溯回答；阶段 6 补齐扫描件、表格和跨文档完整证据场景 |
| 5 | [质量、Prompt 优化与用量](phases/phase-05-quality-prompt-cost.md) | 固定样本对比效果，分析召回缺口，优化 Prompt，并核对所有模型消耗 |
| 6 | [完整应用、共享发布与运营](phases/phase-06-publishing-and-operations.md) | 完成长任务/协作/人工介入，发布 Web/API/Webhook 应用，审核共享资源，管理个人租户与运营 |
| 7 | [Docker Compose 部署](phases/phase-07-docker-compose-deployment.md) | 填写数据库和中间件密码后一条命令部署，验证持久化、初始化、升级与备份恢复 |

## 3. 文档使用约定

需求文档规定用户能完成什么、操作结果如何、异常如何呈现以及怎样验收。实现选型、服务边界和数据方案放在 [technical](../technical/README.md)。Sa-Token、个人租户、BYOK、不重启全部 Runtime、审核后公开、Docker Compose 是用户指定的约束；其他技术推荐不视为用户已经逐项选定。

需求编号保持稳定。PA-P1 至 PA-P7 表示阶段需求，PA-COM 表示共性要求，PA-PLG 和 PA-HUB 分别表示插件与公共仓库的跨阶段契约。专题和阶段需求共同约束交付，不能只完成阶段页面而遗漏专题中的异常和生命周期。编号下的 A1、A2 等是可判定的验收项；T 类编号只是候选任务包，不是已经创建的 GitHub Issue。

当前真实记录为 [总规划 Issue #1](https://github.com/Ryan-Guizhou/PeachAgent/issues/1)、[原文档交付 Issue #2](https://github.com/Ryan-Guizhou/PeachAgent/issues/2) 和 [本次完善 Issue #4](https://github.com/Ryan-Guizhou/PeachAgent/issues/4)。应用代码、正式安装包和实际部署验证均属于后续阶段。

## 4. 从需求到开发

AI 按 [ci 执行指南](../ci/ai-execution-guide.md) 读取需求、技术蓝图和现有 Issue，再使用 [需求拆分模板](../ci/requirement-decomposition-template.md) 差量拆分。每个开发 Issue 要列明需求编号、验收项、依赖和本次不包含的边界；每个 Issue 对应 PR，合并前完成与变更相关的检查。

每期使用 [阶段核对模板](../ci/phase-review-template.md) 对照全部需求核对，不能以“PR 都关闭了”替代功能完成判断。最终使用 [上线验收模板](../ci/release-acceptance-template.md)，覆盖七期联调、跨租户隔离和部署恢复。
