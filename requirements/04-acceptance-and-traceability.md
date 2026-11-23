# 验收与需求追踪

> 版本：v0.1 · 更新：2026-11-23 · 状态：需求草案，功能尚未开发。
>
> 本文件用于核对需求覆盖，不是已通过的产品验收报告。

## 1. 追踪规则

需求编号连接以下记录：**需求正文与验收项 → 开发 Issue → PR → main 中的交付 → 真实验收证据 → 阶段结论**。

本次已建立 [总规划 Issue #1](https://github.com/Ryan-Guizhou/PeachAgent/issues/1) 和 [文档交付 Issue #2](https://github.com/Ryan-Guizhou/PeachAgent/issues/2)。各阶段任务包仅为候选拆分；需求确认后再创建相应开发 Issue，不将文档准备误记为功能完成。

每项需求可以对应多个实际 Issue，但应指定负责整体验收的记录。完成一个子任务后，只有其覆盖的验收项可以更新状态。

## 2. 原始能力要求覆盖

| 能力要求 | 需求位置 | 如何证明已覆盖 |
|---|---|---|
| 工作流节点拖拉拽与编排 | PA-P2-002—PA-P2-009、PA-P2-012 | 画布编辑、节点配置、数据传递、条件、版本、调试和子流程的操作记录 |
| MCP | PA-P3-003—PA-P3-005；增强 PA-P6-007 | 发现、授权、调用、撤权和服务变化；本地执行在后续单独验收 |
| Skill 与项目规则读取 | PA-P3-006、PA-P3-008、PA-P3-009 | 导入来源、目录范围、生效规则、指令冲突和不可自授权 |
| Skill 渐进式披露 | PA-P3-007 | 区分简介、正文、参考资料，记录按需读取内容 |
| 上下文管理与压缩 | PA-P3-010、PA-P3-011 | 容量和采用内容可见；压缩前后目标、约束、待办及证据保持正确 |
| 内置 Prompt 优化 | PA-P1-007、PA-P5-010 | 基础模板、基线、候选差异、固定条件评测、人工采用与保留原版 |
| RAG 工程与检索改善 | PA-P4-001—PA-P4-012；增强 PA-P6-011 | 文档到回答全链路、检索试验、证据引用、更新删除、失败分类 |
| 召回提升的判断依据 | PA-P4-011、PA-P5-002—PA-P5-009 | 人工确认原文证据、指标分母、固定条件对照、逐题结果和回归 |
| 质量中心与项目优劣 | PA-P5-001—PA-P5-014 | 样本覆盖、业务成功、答案与引用、可靠性、延迟和费用分项判断 |
| 成本把控 | PA-P1-009、PA-P1-010、PA-COM-004、PA-P5-012、PA-P5-013 | 首次付费即限制，明细和汇总可核对，未知价格与并发额度有明确行为 |
| 产品所需的基础配套 | PA-COM-001—PA-COM-012 | 项目权限、凭证保护、版本、状态、取消、数据生命周期和结果追溯 |
| 后续复杂任务 | PA-P6-001—PA-P6-012 | 仅对获选范围验收人工介入、恢复、协作、受控执行及增强 |

表中的范围缩写用于概览，下面逐项索引给出全部实际编号。任何新增或删除都应同步更新覆盖关系。

## 3. 核心版本端到端场景

以下是跨需求的总体验收场景；各阶段正文中的逐项验收仍需执行，不能用一个总体演示替代。

| 场景编号 | 操作与预期结果 | 重点边界 | 关联范围 |
|---|---|---|---|
| E2E-01 | 新建项目、配置模型、进行连续对话，查到历史与用量 | 缺凭证、外部错误、预算不足、取消 | PA-P1-001—PA-P1-010 |
| E2E-02 | 拖拽创建有两条业务分支和默认路径的流程，分别运行并检查结果 | 无效变量、未选中路径、草稿修改 | PA-P2-002—PA-P2-009 |
| E2E-03 | 使用授权工具与子流程完成任务并查看外部操作结果 | 撤权、结果不明、重复执行、总预算继承 | PA-P2-010—PA-P2-014 |
| E2E-04 | Agent 使用已选 MCP 工具完成至少两步任务 | 未授权工具、服务变化、失败重复、超限停止 | PA-P3-001—PA-P3-005 |
| E2E-05 | 导入 Skill，按任务读取正文和参考资料，采用正确目录规则 | 无关 Skill、规则冲突、资料伪造批准、禁用脚本 | PA-P3-006—PA-P3-009 |
| E2E-06 | 长对话或大结果触发上下文整理，继续任务并核对原始证据 | 目标或待办丢失、旧偏好冲突、跨项目记忆 | PA-P3-010—PA-P3-014 |
| E2E-07 | 导入文本资料，预览内容，对比检索，生成并核对带引用答案 | 处理失败、资料缺失、引用不支持结论、无答案 | PA-P4-001—PA-P4-011 |
| E2E-08 | 更新、撤权或删除资料后重新检索并查看历史结果 | 旧内容泄漏、当前版本与历史版本混淆 | PA-P4-004、PA-P4-012、PA-COM-007 |
| E2E-09 | 建立有证据和用途划分的样本集，对两版本进行配对评测 | 标注不全、无答案、多证据、服务失败、回归和小样本 | PA-P5-001—PA-P5-009 |
| E2E-10 | 用开发样本生成 Prompt 候选，比较后选择或保留基线 | 独立检验泄漏、越权候选、预算停止、无改善 | PA-P5-003、PA-P5-010 |
| E2E-11 | 用多维报告判断应用效果和费用，导出可核查结论 | 未知价格、不同币种、零成功任务、仅好看总分 | PA-P5-011—PA-P5-014 |
| E2E-12 | 用两个项目和不同权限覆盖上述关键路径 | 链接、检索、工具、记忆、报告和产物不得越权 | PA-COM-001、PA-COM-002、PA-COM-008、PA-COM-012 |

阶段 6 按已确认子范围选择其文档中的端到端场景，并检查对上述核心路径的影响。没有选择的增强能力标为“未纳入本期”，不标为“已实现”。

## 4. 验收证据要求

采用 [阶段核对模板](../ci/phase-review-template.md)。每次真实核对至少包含：

- 需求编号和逐项验收编号，测试的功能版本与对应提交。
- 操作前提、输入、预期行为与实际结果。
- 成功与失败/边界场景，相关运行、报告或产物的可访问证据。
- 判定结果：通过、不通过、未验证，或经确认后不纳入本次范围。
- 问题、责任、后续 Issue 和明确的范围调整依据。

产品验收证据中不填模拟成功日志。随机模型输出可以变化，但配置、输入、证据和判定依据必须足以解释本次结论。

## 5. 逐项需求索引

下表中的“验收项数”仅统计已定义的标准数量。**所有功能当前均未实现、未验收；不得将此统计解释为通过率。** 共性需求在相关阶段共同验收，不因没有独立开发任务包就省略。

<!-- generated-traceability:start -->
本版共 **91 项需求、224 条逐项验收标准、43 个候选开发任务包**。其中阶段需求 79 项，共性需求 12 项；数量用于覆盖核对，不作为完成指标。

| 范围 | 需求数 | 验收项数 | 当前产品状态 |
|---|---:|---:|---|
| [共性需求](03-cross-cutting-requirements.md) | 12 | 25 | 待确认，未实现、未验收 |
| [阶段 1：项目基础与首个对话闭环](phases/phase-01-project-and-chat.md) | 13 | 39 | 待确认，未实现、未验收 |
| [阶段 2：可视化工作流与可追踪执行](phases/phase-02-visual-workflow.md) | 14 | 42 | 待确认，未实现、未验收 |
| [阶段 3：Agent、MCP、Skill 与上下文管理](phases/phase-03-agent-skills-context.md) | 14 | 42 | 待确认，未实现、未验收 |
| [阶段 4：知识库与 RAG 需求](phases/phase-04-knowledge-and-rag.md) | 12 | 24 | 待确认，未实现、未验收 |
| [阶段 5：质量中心、Prompt 优化与成本分析需求](phases/phase-05-quality-prompt-cost.md) | 14 | 28 | 待确认，未实现、未验收 |
| [阶段 6：协作、长任务与受控扩展需求](phases/phase-06-advanced-collaboration.md) | 12 | 24 | 待确认，未实现、未验收 |

### 共性需求

| 需求编号 | 需求名称 | 候选任务包 | 验收项数 |
|---|---|---|---:|
| [PA-COM-001](03-cross-cutting-requirements.md) | 项目归属与访问范围 | 随适用功能共同验收 | 2 |
| [PA-COM-002](03-cross-cutting-requirements.md) | 凭证与敏感信息保护 | 随适用功能共同验收 | 2 |
| [PA-COM-003](03-cross-cutting-requirements.md) | 版本与运行依据 | 随适用功能共同验收 | 2 |
| [PA-COM-004](03-cross-cutting-requirements.md) | 用量、估算与任务预算 | 随适用功能共同验收 | 3 |
| [PA-COM-005](03-cross-cutting-requirements.md) | 状态、取消与部分结果 | 随适用功能共同验收 | 2 |
| [PA-COM-006](03-cross-cutting-requirements.md) | 失败、重复操作与结果确认 | 随适用功能共同验收 | 2 |
| [PA-COM-007](03-cross-cutting-requirements.md) | 资料、记忆与产物生命周期 | 随适用功能共同验收 | 2 |
| [PA-COM-008](03-cross-cutting-requirements.md) | 指令、资料和授权的边界 | 随适用功能共同验收 | 2 |
| [PA-COM-009](03-cross-cutting-requirements.md) | 可理解的操作体验 | 随适用功能共同验收 | 2 |
| [PA-COM-010](03-cross-cutting-requirements.md) | 可用性与能力依赖 | 随适用功能共同验收 | 2 |
| [PA-COM-011](03-cross-cutting-requirements.md) | 质量结论与公平比较 | 随适用功能共同验收 | 2 |
| [PA-COM-012](03-cross-cutting-requirements.md) | 运行记录、导出与追溯 | 随适用功能共同验收 | 2 |

实际开发 Issue、PR 和证据链接：待本阶段需求确认并执行后回填。

### 阶段 1：项目基础与首个对话闭环

| 需求编号 | 需求名称 | 候选任务包 | 验收项数 |
|---|---|---|---:|
| [PA-P1-001](phases/phase-01-project-and-chat.md) | 项目创建、选择与归档 | P1-T01 | 3 |
| [PA-P1-002](phases/phase-01-project-and-chat.md) | 基本成员身份与权限 | P1-T01 | 3 |
| [PA-P1-003](phases/phase-01-project-and-chat.md) | 模型资源与凭证管理 | P1-T02 | 3 |
| [PA-P1-004](phases/phase-01-project-and-chat.md) | 模型可用性验证与错误说明 | P1-T02 | 3 |
| [PA-P1-005](phases/phase-01-project-and-chat.md) | 新建会话与连续对话 | P1-T04 | 3 |
| [PA-P1-006](phases/phase-01-project-and-chat.md) | 实时反馈、停止与重试 | P1-T04 | 3 |
| [PA-P1-007](phases/phase-01-project-and-chat.md) | Prompt 模板与使用预览 | P1-T05 | 3 |
| [PA-P1-008](phases/phase-01-project-and-chat.md) | 运行历史与结果查阅 | P1-T06 | 3 |
| [PA-P1-009](phases/phase-01-project-and-chat.md) | 用量与费用状态 | P1-T03 | 3 |
| [PA-P1-010](phases/phase-01-project-and-chat.md) | 首次运行前的限额保护 | P1-T03 | 3 |
| [PA-P1-011](phases/phase-01-project-and-chat.md) | 工作台与首次使用引导 | P1-T07 | 3 |
| [PA-P1-012](phases/phase-01-project-and-chat.md) | 结果复用与任务反馈 | P1-T06 | 3 |
| [PA-P1-013](phases/phase-01-project-and-chat.md) | 资源变更与历史可解释性 | P1-T05 | 3 |

实际开发 Issue、PR 和证据链接：待本阶段需求确认并执行后回填。

### 阶段 2：可视化工作流与可追踪执行

| 需求编号 | 需求名称 | 候选任务包 | 验收项数 |
|---|---|---|---:|
| [PA-P2-001](phases/phase-02-visual-workflow.md) | 工作流创建、查找与复制 | P2-T01 | 3 |
| [PA-P2-002](phases/phase-02-visual-workflow.md) | 拖拽画布与基础编辑 | P2-T01 | 3 |
| [PA-P2-003](phases/phase-02-visual-workflow.md) | 基础节点与能力说明 | P2-T02 | 3 |
| [PA-P2-004](phases/phase-02-visual-workflow.md) | 任务输入与步骤间数据选取 | P2-T02 | 3 |
| [PA-P2-005](phases/phase-02-visual-workflow.md) | 条件分支与路径可解释性 | P2-T03 | 3 |
| [PA-P2-006](phases/phase-02-visual-workflow.md) | 运行前检查与问题定位 | P2-T03 | 3 |
| [PA-P2-007](phases/phase-02-visual-workflow.md) | 草稿、可运行版本与变更说明 | P2-T04 | 3 |
| [PA-P2-008](phases/phase-02-visual-workflow.md) | 样例输入与试运行 | P2-T04 | 3 |
| [PA-P2-009](phases/phase-02-visual-workflow.md) | 节点进度、失败与取消 | P2-T06 | 3 |
| [PA-P2-010](phases/phase-02-visual-workflow.md) | 业务工具登记、试用与使用授权 | P2-T05 | 3 |
| [PA-P2-011](phases/phase-02-visual-workflow.md) | 外部操作确认与重复执行风险 | P2-T05 | 3 |
| [PA-P2-012](phases/phase-02-visual-workflow.md) | 子流程复用与总限制 | P2-T07 | 3 |
| [PA-P2-013](phases/phase-02-visual-workflow.md) | 面向业务使用者的运行入口 | P2-T07 | 3 |
| [PA-P2-014](phases/phase-02-visual-workflow.md) | 运行依据、诊断与成本追溯 | P2-T06 | 3 |

实际开发 Issue、PR 和证据链接：待本阶段需求确认并执行后回填。

### 阶段 3：Agent、MCP、Skill 与上下文管理

| 需求编号 | 需求名称 | 候选任务包 | 验收项数 |
|---|---|---|---:|
| [PA-P3-001](phases/phase-03-agent-skills-context.md) | Agent 资产与运行模式 | P3-T01 | 3 |
| [PA-P3-002](phases/phase-03-agent-skills-context.md) | 有限多步行动与进度反馈 | P3-T01 | 3 |
| [PA-P3-003](phases/phase-03-agent-skills-context.md) | MCP 服务接入与能力发现 | P3-T02 | 3 |
| [PA-P3-004](phases/phase-03-agent-skills-context.md) | 工具选择、授权与实际调用约束 | P3-T03 | 3 |
| [PA-P3-005](phases/phase-03-agent-skills-context.md) | MCP 工具变化、失败与使用记录 | P3-T02 | 3 |
| [PA-P3-006](phases/phase-03-agent-skills-context.md) | Skill 导入、描述与版本 | P3-T04 | 3 |
| [PA-P3-007](phases/phase-03-agent-skills-context.md) | Skill 渐进式披露与用户选择 | P3-T04 | 3 |
| [PA-P3-008](phases/phase-03-agent-skills-context.md) | 项目规则文件与目录适用范围 | P3-T04 | 3 |
| [PA-P3-009](phases/phase-03-agent-skills-context.md) | 指令冲突与资料可信边界 | P3-T03 | 3 |
| [PA-P3-010](phases/phase-03-agent-skills-context.md) | 上下文可见范围与预算 | P3-T05 | 3 |
| [PA-P3-011](phases/phase-03-agent-skills-context.md) | 上下文压缩与关键事实保全 | P3-T05 | 3 |
| [PA-P3-012](phases/phase-03-agent-skills-context.md) | 会话记忆与长期记忆控制 | P3-T06 | 3 |
| [PA-P3-013](phases/phase-03-agent-skills-context.md) | Agent 与工作流互相复用 | P3-T07 | 3 |
| [PA-P3-014](phases/phase-03-agent-skills-context.md) | 完成证据与运行解释 | P3-T07 | 3 |

实际开发 Issue、PR 和证据链接：待本阶段需求确认并执行后回填。

### 阶段 4：知识库与 RAG 需求

| 需求编号 | 需求名称 | 候选任务包 | 验收项数 |
|---|---|---|---:|
| [PA-P4-001](phases/phase-04-knowledge-and-rag.md) | 创建与管理项目知识库 | P4-T01 | 2 |
| [PA-P4-002](phases/phase-04-knowledge-and-rag.md) | 导入文档并确认处理范围 | P4-T01 | 2 |
| [PA-P4-003](phases/phase-04-knowledge-and-rag.md) | 查看处理状态和内容预览 | P4-T02 | 2 |
| [PA-P4-004](phases/phase-04-knowledge-and-rag.md) | 更新资料并保留明确版本 | P4-T02 | 2 |
| [PA-P4-005](phases/phase-04-knowledge-and-rag.md) | 预览与调整知识分段 | P4-T02 | 2 |
| [PA-P4-006](phases/phase-04-knowledge-and-rag.md) | 执行可解释的检索试验 | P4-T03 | 2 |
| [PA-P4-007](phases/phase-04-knowledge-and-rag.md) | 试验问题改写和复杂问题拆分 | P4-T03 | 2 |
| [PA-P4-008](phases/phase-04-knowledge-and-rag.md) | 整理证据并保持必要上下文 | P4-T03 | 2 |
| [PA-P4-009](phases/phase-04-knowledge-and-rag.md) | 生成带有效引用的知识回答 | P4-T04 | 2 |
| [PA-P4-010](phases/phase-04-knowledge-and-rag.md) | 在 Agent 和工作流中复用知识能力 | P4-T04 | 2 |
| [PA-P4-011](phases/phase-04-knowledge-and-rag.md) | 建立最小问题与证据基线 | P4-T05 | 2 |
| [PA-P4-012](phases/phase-04-knowledge-and-rag.md) | 使资料撤权、停用和删除真实生效 | P4-T06 | 2 |

实际开发 Issue、PR 和证据链接：待本阶段需求确认并执行后回填。

### 阶段 5：质量中心、Prompt 优化与成本分析需求

| 需求编号 | 需求名称 | 候选任务包 | 验收项数 |
|---|---|---|---:|
| [PA-P5-001](phases/phase-05-quality-prompt-cost.md) | 维护具有来源与版本的数据集 | P5-T01 | 2 |
| [PA-P5-002](phases/phase-05-quality-prompt-cost.md) | 标注可追溯的相关证据和任务结果 | P5-T01 | 2 |
| [PA-P5-003](phases/phase-05-quality-prompt-cost.md) | 区分优化样本与独立检验样本 | P5-T01 | 2 |
| [PA-P5-004](phases/phase-05-quality-prompt-cost.md) | 运行可追溯的批量评测 | P5-T02 | 2 |
| [PA-P5-005](phases/phase-05-quality-prompt-cost.md) | 正确呈现检索质量指标 | P5-T02 | 2 |
| [PA-P5-006](phases/phase-05-quality-prompt-cost.md) | 区分回答质量、引用质量和任务完成 | P5-T02 | 2 |
| [PA-P5-007](phases/phase-05-quality-prompt-cost.md) | 进行条件透明的配对比较 | P5-T03 | 2 |
| [PA-P5-008](phases/phase-05-quality-prompt-cost.md) | 使自动评分可检查和可纠正 | P5-T03 | 2 |
| [PA-P5-009](phases/phase-05-quality-prompt-cost.md) | 按失败原因沉淀改进依据 | P5-T03 | 2 |
| [PA-P5-010](phases/phase-05-quality-prompt-cost.md) | 生成和验证 Prompt 优化候选 | P5-T04 | 2 |
| [PA-P5-011](phases/phase-05-quality-prompt-cost.md) | 形成可解释的项目质量看板 | P5-T05 | 2 |
| [PA-P5-012](phases/phase-05-quality-prompt-cost.md) | 汇总真实用量与有标识的估算费用 | P5-T05 | 2 |
| [PA-P5-013](phases/phase-05-quality-prompt-cost.md) | 控制整个任务的预算与新增开销 | P5-T06 | 2 |
| [PA-P5-014](phases/phase-05-quality-prompt-cost.md) | 导出具有证据和适用范围的评测结论 | P5-T07 | 2 |

实际开发 Issue、PR 和证据链接：待本阶段需求确认并执行后回填。

### 阶段 6：协作、长任务与受控扩展需求

| 需求编号 | 需求名称 | 候选任务包 | 验收项数 |
|---|---|---|---:|
| [PA-P6-001](phases/phase-06-advanced-collaboration.md) | 组织并行工作并明确汇总条件 | P6-T01 | 2 |
| [PA-P6-002](phases/phase-06-advanced-collaboration.md) | 执行有明确边界的循环与批量任务 | P6-T01 | 2 |
| [PA-P6-003](phases/phase-06-advanced-collaboration.md) | 支持可审查的人工介入 | P6-T02 | 2 |
| [PA-P6-004](phases/phase-06-advanced-collaboration.md) | 中断后恢复可理解的长任务 | P6-T02 | 2 |
| [PA-P6-005](phases/phase-06-advanced-collaboration.md) | 让多个 Agent 按明确职责协作 | P6-T03 | 2 |
| [PA-P6-006](phases/phase-06-advanced-collaboration.md) | 提供范围明确的任务执行空间 | P6-T04 | 2 |
| [PA-P6-007](phases/phase-06-advanced-collaboration.md) | 受控使用 Skill 脚本和本地 MCP 能力 | P6-T05 | 2 |
| [PA-P6-008](phases/phase-06-advanced-collaboration.md) | 交付可追溯且可核验的任务产物 | P6-T06 | 2 |
| [PA-P6-009](phases/phase-06-advanced-collaboration.md) | 复用并管理有来源的扩展包 | P6-T07 | 2 |
| [PA-P6-010](phases/phase-06-advanced-collaboration.md) | 复核记忆候选并处理过期与冲突 | P6-T07 | 2 |
| [PA-P6-011](phases/phase-06-advanced-collaboration.md) | 针对已知失败增强知识处理与检索 | P6-T08 | 2 |
| [PA-P6-012](phases/phase-06-advanced-collaboration.md) | 依据任务选择模型并说明切换 | P6-T09 | 2 |

实际开发 Issue、PR 和证据链接：待本阶段需求确认并执行后回填。
<!-- generated-traceability:end -->

## 6. 每期核对动作

1. 从本期确认的需求编号出发逐行核对，而不是只从“已完成 Issue”反推完成范围。
2. 给每项需求补齐实际 Issue、PR 和验收证据链接；不存在证据时记录未验证。
3. 对照共性需求和本期端到端场景检查跨功能遗漏。
4. 将未实现、失败、未验证、待决或范围调整事项分别列出。
5. 更新总规划 Issue 的阶段结论，必要时同步 [待决事项与变更记录](05-decisions-and-change-log.md)。

代码合并要求与阶段结论定义见 [开发流程](../ci/README.md)。本次文档交付完成，只更新文档交付状态；六阶段功能状态仍保持待确认、未开发。
