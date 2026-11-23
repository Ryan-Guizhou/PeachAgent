# 验收与需求追踪

> 版本：v0.2 · 更新：2026-11-23 · 状态：需求覆盖索引；全部应用功能尚未实现、尚未通过产品验收。

## 1. 追踪规则

每个需求形成“需求正文与验收项 → 开发 Issue → PR → main 中的交付 → 真实验收证据 → 阶段结论”的完整关系。阶段需求、共性要求与插件/公共仓库专题共同约束交付，不能只核对一个文件。

[总规划 Issue #1](https://github.com/Ryan-Guizhou/PeachAgent/issues/1) 持续追踪完整计划；[Issue #2](https://github.com/Ryan-Guizhou/PeachAgent/issues/2) / [PR #3](https://github.com/Ryan-Guizhou/PeachAgent/pull/3) 是原版文档历史记录，[Issue #4](https://github.com/Ryan-Guizhou/PeachAgent/issues/4) 追踪本次完善。文档完成不计作功能阶段完成。

任务包是拆分建议，不是实际 GitHub Issue。一个开发 Issue 可以同时覆盖某个阶段和相关专题的验收项；先按 [需求拆分模板](../ci/requirement-decomposition-template.md) 检查已有 Issue，避免为同一工作重复建任务。一个需求跨多个 Issue 时指定整体验收归属，只更新本次实际有证据的验收项。

## 2. 用户要求与覆盖位置

| 已明确要求 | 主要位置 | 完成依据 |
|---|---|---|
| 四个完整产品域、项目蓝图和架构 | [产品架构](06-product-architecture.md)、[能力矩阵](07-capability-matrix.md)、[技术目录](../technical/README.md) | 用户旅程、资源关系、模块职责、七期交付和验收相互对应 |
| 可视化工作流拖拽、节点和复杂编排 | PA-P2-001 至 PA-P2-017；PA-P6-001 至 PA-P6-004 | 真实编辑/导入导出、运行路径、校验、并行循环、等待恢复 |
| MCP、Skill、规则文件和渐进披露 | PA-P3-003 至 PA-P3-009、PA-P3-015；PA-P6-007 | 本人授权、版本、目录范围、按需读取、脚本控制与撤权 |
| 上下文工程、压缩和记忆 | PA-P3-010 至 PA-P3-012；PA-P5-016；PA-P6-010 | 容量/压缩记录、关键事实保持、原文回读、记忆范围和删除 |
| Prompt 优化 | PA-P1-007、PA-P5-003、PA-P5-010 | 变量与基线、候选差异、开发/验证/检验用途、采用与回退 |
| RAG 工程与召回提升依据 | PA-P4-001 至 PA-P4-012；PA-P5-001 至 PA-P5-009；PA-P6-011 | 原文证据、固定条件对比、候选与上下文覆盖、退化和扫描/表格/跨文档联验 |
| 高质量评测与项目优劣 | PA-P5-001 至 PA-P5-019 | 任务、答案、引用、Skill、压缩、插件、协作、可靠性、时长和费用分项判断 |
| 自定义代码/配置/前端插件，不整体重启 Runtime | PA-P1-015、PA-P2-015 至 PA-P2-017、PA-P3-015、PA-P3-016、PA-P6-009；[插件专题](topics/01-plugin-system.md) | 作者真实扩展、两类界面、就绪切换、在途/暂停/待审批版本保留与引用保护 |
| 个人用户为租户、全部功能、Sa-Token | PA-P1-001、PA-P1-002、PA-P1-014、PA-P6-017；PA-COM-001 | 两个个人账号全链路隔离，普通用户可用全部能力，管理员治理与私有资源分离 |
| 自配凭证、统一 Token 面板 | PA-P1-003、PA-P1-004、PA-P1-009、PA-P1-016、PA-P5-012、PA-P5-013、PA-P5-019 | 各来源明细、估算/报告/未知、子项包含关系、补报替换及父子去重 |
| 所有人可提交，管理员批准后公开资源 | PA-P6-018、PA-COM-014；[公共仓库专题](topics/02-public-repositories.md) | 五类资源、固定审核版本、所有读取入口一致、新版重审、不含作者秘密 |
| 发布后可用和基本运营 | PA-P6-013 至 PA-P6-021 | Web/API/Webhook、明确调用/执行身份、版本切换、配额与运行追踪 |
| 最后增加 Docker Compose 一键部署 | PA-P7-001 至 PA-P7-015 | 密码最小配置、镜像/初始化/挂载、默认完整插件界面、空环境恢复和七期联验 |
| AI 按 ci 模板拆分并按 Issue 开发、PR 合并、每期核对 | [AI 指南](../ci/ai-execution-guide.md)、[开发流程](../ci/README.md) | 查重/依赖、单 Issue PR、适用编译、main 核验和真实阶段报告 |

## 3. 跨域端到端验收场景

| 场景 | 操作与预期 | 必须覆盖的边界 | 收口阶段 |
|---|---|---|---|
| E2E-01 个人首次使用 | 两个用户建立个人租户，各自配置模型、创建项目并对话 | 凭证不可互见、缺配置、停用、模型错误、Token 未知 | 1 |
| E2E-02 工作流设计 | 拖拽带条件与子流程的图，配置数据，导入导出，试运行与版本比较 | 缺变量、跳过路径、复制后依赖重绑、草稿不改变旧运行 | 2 |
| E2E-03 插件两类界面 | 安装配置节点，通过统一表单与自定义配置/调试/结果/扩展页使用 | UI 加载失败、恶意通信、卸载和切换租户、主平台不中断 | 2；7 默认部署联验 |
| E2E-04 Agent 与 MCP | Agent 使用本人获准工具完成多步任务并展示真实效果 | 撤权、能力变化、错误参数、效果未知、重复写入 | 3 |
| E2E-05 Skill 与规则 | 选择相关 Skill，按需读正文/引用，采用 AGENTS.md 或显式规则映射 | 无关技能、目录边界、伪造批准、脚本未授权 | 3 |
| E2E-06 长上下文 | 大工具结果与长对话触发整理，任务继续并能回读精确证据 | 目标修正/待办/限制不丢失、不将计划写成已执行 | 3；5 评测 |
| E2E-07 代码插件 | 按示例开发新业务能力，打包、安装、授权并由 Agent/工作流调用 | 文件/网络越界、超限、异常、个人用量归属 | 3 |
| E2E-08 动态升级 | 保持旧任务和其他用户任务运行，安装并验证新插件版本 | 全局不重启、发布引用不变、升级失败、卸载引用保护 | 3；6 等待态；7 部署联验 |
| E2E-09 知识入库与回答 | 导入真实资料，预览/切分，试验检索，生成带原文引用的答案 | 空/损坏资料、解析缺失、无答案、无权资料 | 4 |
| E2E-10 资料生命周期 | 更新失败后仍使用旧可用版，成功切换，再撤权或删除 | 当前和历史版本区别、旧索引/缓存/导出不可绕过 | 4 |
| E2E-11 召回比较 | 固定样本与资料条件，比较候选、排序、最终上下文及答案 | 不完整标注、多证据、K/预算变化、服务失败、小样本 | 4 基线；5 完整 |
| E2E-12 Prompt 优化 | 开发集生成候选，验证集选优，保留集检验，用户采用或保留基线 | 检验泄漏、越权候选、超预算、没有改善、回退 | 5 |
| E2E-13 Token 对账 | 混合对话、压缩、RAG、评测、优化、插件与重试的调用明细 | 父子重复、缓存/推理子项、迟到补报、失败/取消、未知价格 | 5；6 发布来源 |
| E2E-14 人工等待与协作 | 多 Agent/并行任务遇到人工决定，关闭页面后恢复并汇总 | 当前撤权、旧版本引用、重复外部影响、子任务共享预算 | 6 |
| E2E-15 知识补全 | 用扫描件、表格和跨文档样本完成可追溯回答 | OCR 缺失、单位/表头、所有必要证据、引用与权限 | 6 |
| E2E-16 共享仓库 | 作者提交五类资源，管理员拒绝/批准，另一用户安装并自配凭证 | 待审直链、附件/搜索绕过、私有内容、新版重审、风险下架 | 6 |
| E2E-17 应用发布 | 发布 Web/API/Webhook，外部获准调用，切换版本再停用 | 调用者与执行租户分开、用量归属、Webhook 重复和结果通知 | 6 |
| E2E-18 个人租户运营 | 管理员处理账号状态、配额、故障与公共风险 | 普通用户不失去产品入口、管理行为可追溯、私有内容不任意公开 | 6 |
| E2E-19 空白主机部署 | 填写密码后一条命令，创建管理员并从个人 UI 配置模型 | 初始失败/重复启动、真实健康、默认插件 UI 无额外 DNS | 7 |
| E2E-20 重建与恢复 | 创建真实资料/插件/发布版本，重建容器，再在空环境恢复 | 主密钥匹配、挂载完整、当前权限、恢复不双活、不盲目重放 | 7 |

场景表是跨域联验目录，不替代下列逐需求的验收条目。任何尚未验证的路径必须保持未验证状态。

## 4. 验收证据与结论

每条证据包含需求/验收 ID、实际版本/提交、操作者权限、输入/前置条件、预期与真实结果、运行/报告/产物链接及判定。AI 不得把示例、预测、截图占位或文档描述填成已通过证据。

结果使用通过、不通过、未验证；只有存在明确范围调整记录时才可说明不纳入某次交付。功能未完成不能改名为“不适用”绕过七阶段完整目标。文档 PR 只验证文档一致性，不需要编造不存在工程的编译成功。

## 5. 全量需求索引

以下统计为已定义的需求与验收标准数量，不代表功能实现率。所有应用功能仍是待开发、未验收。专题任务包与阶段任务包有交叉约束，不能将候选包数量机械地视为必须创建的 Issue 数。

<!-- generated-traceability:start -->

| 需求来源 | 需求项 | 验收项 | 当前产品状态 |
|---|---:|---:|---|
| [共性需求](03-cross-cutting-requirements.md) | 14 | 29 | 待开发，未验收 |
| [阶段 1：项目基础与首个对话闭环](phases/phase-01-project-and-chat.md) | 16 | 48 | 待开发，未验收 |
| [阶段 2：可视化工作流与可追踪执行](phases/phase-02-visual-workflow.md) | 17 | 52 | 待开发，未验收 |
| [阶段 3：Agent、MCP、Skill 与上下文管理](phases/phase-03-agent-skills-context.md) | 16 | 50 | 待开发，未验收 |
| [阶段 4：知识库与 RAG 需求](phases/phase-04-knowledge-and-rag.md) | 12 | 24 | 待开发，未验收 |
| [阶段 5：质量中心、Prompt 优化与成本分析需求](phases/phase-05-quality-prompt-cost.md) | 19 | 38 | 待开发，未验收 |
| [阶段 6：高级协作、应用发布与运营需求](phases/phase-06-publishing-and-operations.md) | 21 | 42 | 待开发，未验收 |
| [阶段 7：Docker Compose 一键部署与完整交付](phases/phase-07-docker-compose-deployment.md) | 15 | 30 | 待开发，未验收 |
| [插件系统需求：开发、界面、动态执行与生命周期](topics/01-plugin-system.md) | 23 | 46 | 待开发，未验收 |
| [公共资源仓库需求](topics/02-public-repositories.md) | 18 | 36 | 待开发，未验收 |
| **合计** | **171** | **395** | **文档定义数量，不是通过数量** |

共有 **86 个候选任务包**；实际创建时按交叉需求与依赖合并或拆分，保留全部验收映射。

### 共性需求

| 需求编号 | 需求内容 | 候选任务 / 联验责任 | 验收项数 |
|---|---|---|---:|
| [PA-COM-001](03-cross-cutting-requirements.md#pa-com-001-项目归属与访问范围) | 项目归属与访问范围 | 随各阶段对应功能共同验收 | 2 |
| [PA-COM-002](03-cross-cutting-requirements.md#pa-com-002-凭证与敏感信息保护) | 凭证与敏感信息保护 | 随各阶段对应功能共同验收 | 2 |
| [PA-COM-003](03-cross-cutting-requirements.md#pa-com-003-版本与运行依据) | 版本与运行依据 | 随各阶段对应功能共同验收 | 2 |
| [PA-COM-004](03-cross-cutting-requirements.md#pa-com-004-用量估算与任务预算) | 用量、估算与任务预算 | 随各阶段对应功能共同验收 | 3 |
| [PA-COM-005](03-cross-cutting-requirements.md#pa-com-005-状态取消与部分结果) | 状态、取消与部分结果 | 随各阶段对应功能共同验收 | 2 |
| [PA-COM-006](03-cross-cutting-requirements.md#pa-com-006-失败重复操作与结果确认) | 失败、重复操作与结果确认 | 随各阶段对应功能共同验收 | 2 |
| [PA-COM-007](03-cross-cutting-requirements.md#pa-com-007-资料记忆与产物生命周期) | 资料、记忆与产物生命周期 | 随各阶段对应功能共同验收 | 2 |
| [PA-COM-008](03-cross-cutting-requirements.md#pa-com-008-指令资料和授权的边界) | 指令、资料和授权的边界 | 随各阶段对应功能共同验收 | 2 |
| [PA-COM-009](03-cross-cutting-requirements.md#pa-com-009-可理解的操作体验) | 可理解的操作体验 | 随各阶段对应功能共同验收 | 2 |
| [PA-COM-010](03-cross-cutting-requirements.md#pa-com-010-可用性与能力依赖) | 可用性与能力依赖 | 随各阶段对应功能共同验收 | 2 |
| [PA-COM-011](03-cross-cutting-requirements.md#pa-com-011-质量结论与公平比较) | 质量结论与公平比较 | 随各阶段对应功能共同验收 | 2 |
| [PA-COM-012](03-cross-cutting-requirements.md#pa-com-012-运行记录导出与追溯) | 运行记录、导出与追溯 | 随各阶段对应功能共同验收 | 2 |
| [PA-COM-013](03-cross-cutting-requirements.md#pa-com-013-动态扩展与引用稳定性) | 动态扩展与引用稳定性 | 随各阶段对应功能共同验收 | 2 |
| [PA-COM-014](03-cross-cutting-requirements.md#pa-com-014-审核与公开范围一致) | 审核与公开范围一致 | 随各阶段对应功能共同验收 | 2 |

### 阶段 1：项目基础与首个对话闭环

| 需求编号 | 需求内容 | 候选任务 / 联验责任 | 验收项数 |
|---|---|---|---:|
| [PA-P1-001](phases/phase-01-project-and-chat.md#pa-p1-001-个人租户中的项目创建选择与归档) | 个人租户中的项目创建、选择与归档 | P1-T01 | 3 |
| [PA-P1-002](phases/phase-01-project-and-chat.md#pa-p1-002-个人身份租户归属与访问权限) | 个人身份、租户归属与访问权限 | P1-T01 | 3 |
| [PA-P1-003](phases/phase-01-project-and-chat.md#pa-p1-003-自备模型与外部凭证管理) | 自备模型与外部凭证管理 | P1-T02 | 3 |
| [PA-P1-004](phases/phase-01-project-and-chat.md#pa-p1-004-模型可用性验证与错误说明) | 模型可用性验证与错误说明 | P1-T02 | 3 |
| [PA-P1-005](phases/phase-01-project-and-chat.md#pa-p1-005-新建会话与连续对话) | 新建会话与连续对话 | P1-T04 | 3 |
| [PA-P1-006](phases/phase-01-project-and-chat.md#pa-p1-006-实时反馈停止与重试) | 实时反馈、停止与重试 | P1-T04 | 3 |
| [PA-P1-007](phases/phase-01-project-and-chat.md#pa-p1-007-prompt-模板与使用预览) | Prompt 模板与使用预览 | P1-T05 | 3 |
| [PA-P1-008](phases/phase-01-project-and-chat.md#pa-p1-008-运行历史与结果查阅) | 运行历史与结果查阅 | P1-T06 | 3 |
| [PA-P1-009](phases/phase-01-project-and-chat.md#pa-p1-009-用量与费用状态) | 用量与费用状态 | P1-T03 | 3 |
| [PA-P1-010](phases/phase-01-project-and-chat.md#pa-p1-010-首次运行前的限额保护) | 首次运行前的限额保护 | P1-T03 | 3 |
| [PA-P1-011](phases/phase-01-project-and-chat.md#pa-p1-011-工作台与首次使用引导) | 工作台与首次使用引导 | P1-T07 | 3 |
| [PA-P1-012](phases/phase-01-project-and-chat.md#pa-p1-012-结果复用与任务反馈) | 结果复用与任务反馈 | P1-T06 | 3 |
| [PA-P1-013](phases/phase-01-project-and-chat.md#pa-p1-013-资源变更与历史可解释性) | 资源变更与历史可解释性 | P1-T05 | 3 |
| [PA-P1-014](phases/phase-01-project-and-chat.md#pa-p1-014-个人账号进入与租户初始化) | 个人账号进入与租户初始化 | P1-T01 | 3 |
| [PA-P1-015](phases/phase-01-project-and-chat.md#pa-p1-015-插件开发入口与声明准备) | 插件开发入口与声明准备 | P1-T08 | 3 |
| [PA-P1-016](phases/phase-01-project-and-chat.md#pa-p1-016-统一-token-面板与任务来源) | 统一 Token 面板与任务来源 | P1-T03 | 3 |

### 阶段 2：可视化工作流与可追踪执行

| 需求编号 | 需求内容 | 候选任务 / 联验责任 | 验收项数 |
|---|---|---|---:|
| [PA-P2-001](phases/phase-02-visual-workflow.md#pa-p2-001-工作流创建查找复制与导入导出) | 工作流创建、查找、复制与导入导出 | P2-T01 | 4 |
| [PA-P2-002](phases/phase-02-visual-workflow.md#pa-p2-002-拖拽画布与基础编辑) | 拖拽画布与基础编辑 | P2-T01 | 3 |
| [PA-P2-003](phases/phase-02-visual-workflow.md#pa-p2-003-基础节点与能力说明) | 基础节点与能力说明 | P2-T02 | 3 |
| [PA-P2-004](phases/phase-02-visual-workflow.md#pa-p2-004-任务输入与步骤间数据选取) | 任务输入与步骤间数据选取 | P2-T02 | 3 |
| [PA-P2-005](phases/phase-02-visual-workflow.md#pa-p2-005-条件分支与路径可解释性) | 条件分支与路径可解释性 | P2-T03 | 3 |
| [PA-P2-006](phases/phase-02-visual-workflow.md#pa-p2-006-运行前检查与问题定位) | 运行前检查与问题定位 | P2-T03 | 3 |
| [PA-P2-007](phases/phase-02-visual-workflow.md#pa-p2-007-草稿可运行版本与变更说明) | 草稿、可运行版本与变更说明 | P2-T04 | 3 |
| [PA-P2-008](phases/phase-02-visual-workflow.md#pa-p2-008-样例输入与试运行) | 样例输入与试运行 | P2-T04 | 3 |
| [PA-P2-009](phases/phase-02-visual-workflow.md#pa-p2-009-节点进度失败与取消) | 节点进度、失败与取消 | P2-T06 | 3 |
| [PA-P2-010](phases/phase-02-visual-workflow.md#pa-p2-010-业务工具登记试用与使用授权) | 业务工具登记、试用与使用授权 | P2-T05 | 3 |
| [PA-P2-011](phases/phase-02-visual-workflow.md#pa-p2-011-外部操作确认与重复执行风险) | 外部操作确认与重复执行风险 | P2-T05 | 3 |
| [PA-P2-012](phases/phase-02-visual-workflow.md#pa-p2-012-子流程复用与总限制) | 子流程复用与总限制 | P2-T07 | 3 |
| [PA-P2-013](phases/phase-02-visual-workflow.md#pa-p2-013-面向业务使用者的运行入口) | 面向业务使用者的运行入口 | P2-T07 | 3 |
| [PA-P2-014](phases/phase-02-visual-workflow.md#pa-p2-014-运行依据诊断与成本追溯) | 运行依据、诊断与成本追溯 | P2-T06 | 3 |
| [PA-P2-015](phases/phase-02-visual-workflow.md#pa-p2-015-插件节点目录与数据接入) | 插件节点目录与数据接入 | P2-T08 | 3 |
| [PA-P2-016](phases/phase-02-visual-workflow.md#pa-p2-016-统一表单与自定义插件界面) | 统一表单与自定义插件界面 | P2-T08 | 3 |
| [PA-P2-017](phases/phase-02-visual-workflow.md#pa-p2-017-配置与界面插件不停平台安装) | 配置与界面插件不停平台安装 | P2-T09 | 3 |

### 阶段 3：Agent、MCP、Skill 与上下文管理

| 需求编号 | 需求内容 | 候选任务 / 联验责任 | 验收项数 |
|---|---|---|---:|
| [PA-P3-001](phases/phase-03-agent-skills-context.md#pa-p3-001-agent-资产与运行模式) | Agent 资产与运行模式 | P3-T01 | 3 |
| [PA-P3-002](phases/phase-03-agent-skills-context.md#pa-p3-002-有限多步行动与进度反馈) | 有限多步行动与进度反馈 | P3-T01 | 3 |
| [PA-P3-003](phases/phase-03-agent-skills-context.md#pa-p3-003-mcp-服务接入与能力发现) | MCP 服务接入与能力发现 | P3-T02 | 3 |
| [PA-P3-004](phases/phase-03-agent-skills-context.md#pa-p3-004-工具选择授权与实际调用约束) | 工具选择、授权与实际调用约束 | P3-T03 | 3 |
| [PA-P3-005](phases/phase-03-agent-skills-context.md#pa-p3-005-mcp-工具变化失败与使用记录) | MCP 工具变化、失败与使用记录 | P3-T02 | 3 |
| [PA-P3-006](phases/phase-03-agent-skills-context.md#pa-p3-006-skill-导入编辑描述与版本) | Skill 导入、编辑、描述与版本 | P3-T04 | 4 |
| [PA-P3-007](phases/phase-03-agent-skills-context.md#pa-p3-007-skill-渐进式披露与用户选择) | Skill 渐进式披露与用户选择 | P3-T04 | 3 |
| [PA-P3-008](phases/phase-03-agent-skills-context.md#pa-p3-008-项目规则文件与目录适用范围) | 项目规则文件与目录适用范围 | P3-T04 | 4 |
| [PA-P3-009](phases/phase-03-agent-skills-context.md#pa-p3-009-指令冲突与资料可信边界) | 指令冲突与资料可信边界 | P3-T03 | 3 |
| [PA-P3-010](phases/phase-03-agent-skills-context.md#pa-p3-010-上下文可见范围与预算) | 上下文可见范围与预算 | P3-T05 | 3 |
| [PA-P3-011](phases/phase-03-agent-skills-context.md#pa-p3-011-上下文压缩与关键事实保全) | 上下文压缩与关键事实保全 | P3-T05 | 3 |
| [PA-P3-012](phases/phase-03-agent-skills-context.md#pa-p3-012-会话记忆与长期记忆控制) | 会话记忆与长期记忆控制 | P3-T06 | 3 |
| [PA-P3-013](phases/phase-03-agent-skills-context.md#pa-p3-013-agent-与工作流互相复用) | Agent 与工作流互相复用 | P3-T07 | 3 |
| [PA-P3-014](phases/phase-03-agent-skills-context.md#pa-p3-014-完成证据与运行解释) | 完成证据与运行解释 | P3-T07 | 3 |
| [PA-P3-015](phases/phase-03-agent-skills-context.md#pa-p3-015-受控代码插件与-skill-脚本执行) | 受控代码插件与 Skill 脚本执行 | P3-T08 | 3 |
| [PA-P3-016](phases/phase-03-agent-skills-context.md#pa-p3-016-动态代码版本与在途任务保护) | 动态代码版本与在途任务保护 | P3-T09 | 3 |

### 阶段 4：知识库与 RAG 需求

| 需求编号 | 需求内容 | 候选任务 / 联验责任 | 验收项数 |
|---|---|---|---:|
| [PA-P4-001](phases/phase-04-knowledge-and-rag.md#pa-p4-001创建与管理项目知识库) | 创建与管理项目知识库 | P4-T01 | 2 |
| [PA-P4-002](phases/phase-04-knowledge-and-rag.md#pa-p4-002导入文档并确认处理范围) | 导入文档并确认处理范围 | P4-T01 | 2 |
| [PA-P4-003](phases/phase-04-knowledge-and-rag.md#pa-p4-003查看处理状态和内容预览) | 查看处理状态和内容预览 | P4-T02 | 2 |
| [PA-P4-004](phases/phase-04-knowledge-and-rag.md#pa-p4-004更新资料并保留明确版本) | 更新资料并保留明确版本 | P4-T02 | 2 |
| [PA-P4-005](phases/phase-04-knowledge-and-rag.md#pa-p4-005预览与调整知识分段) | 预览与调整知识分段 | P4-T02 | 2 |
| [PA-P4-006](phases/phase-04-knowledge-and-rag.md#pa-p4-006执行可解释的检索试验) | 执行可解释的检索试验 | P4-T03 | 2 |
| [PA-P4-007](phases/phase-04-knowledge-and-rag.md#pa-p4-007试验问题改写和复杂问题拆分) | 试验问题改写和复杂问题拆分 | P4-T03 | 2 |
| [PA-P4-008](phases/phase-04-knowledge-and-rag.md#pa-p4-008整理证据并保持必要上下文) | 整理证据并保持必要上下文 | P4-T03 | 2 |
| [PA-P4-009](phases/phase-04-knowledge-and-rag.md#pa-p4-009生成带有效引用的知识回答) | 生成带有效引用的知识回答 | P4-T04 | 2 |
| [PA-P4-010](phases/phase-04-knowledge-and-rag.md#pa-p4-010在-agent-和工作流中复用知识能力) | 在 Agent 和工作流中复用知识能力 | P4-T04 | 2 |
| [PA-P4-011](phases/phase-04-knowledge-and-rag.md#pa-p4-011建立最小问题与证据基线) | 建立最小问题与证据基线 | P4-T05 | 2 |
| [PA-P4-012](phases/phase-04-knowledge-and-rag.md#pa-p4-012使资料撤权停用和删除真实生效) | 使资料撤权、停用和删除真实生效 | P4-T06 | 2 |

### 阶段 5：质量中心、Prompt 优化与成本分析需求

| 需求编号 | 需求内容 | 候选任务 / 联验责任 | 验收项数 |
|---|---|---|---:|
| [PA-P5-001](phases/phase-05-quality-prompt-cost.md#pa-p5-001维护具有来源与版本的数据集) | 维护具有来源与版本的数据集 | P5-T01 | 2 |
| [PA-P5-002](phases/phase-05-quality-prompt-cost.md#pa-p5-002标注可追溯的相关证据和任务结果) | 标注可追溯的相关证据和任务结果 | P5-T01 | 2 |
| [PA-P5-003](phases/phase-05-quality-prompt-cost.md#pa-p5-003区分优化样本与独立检验样本) | 区分优化样本与独立检验样本 | P5-T01 | 2 |
| [PA-P5-004](phases/phase-05-quality-prompt-cost.md#pa-p5-004运行可追溯的批量评测) | 运行可追溯的批量评测 | P5-T02 | 2 |
| [PA-P5-005](phases/phase-05-quality-prompt-cost.md#pa-p5-005正确呈现检索质量指标) | 正确呈现检索质量指标 | P5-T02 | 2 |
| [PA-P5-006](phases/phase-05-quality-prompt-cost.md#pa-p5-006区分回答质量引用质量和任务完成) | 区分回答质量、引用质量和任务完成 | P5-T02 | 2 |
| [PA-P5-007](phases/phase-05-quality-prompt-cost.md#pa-p5-007进行条件透明的配对比较) | 进行条件透明的配对比较 | P5-T03 | 2 |
| [PA-P5-008](phases/phase-05-quality-prompt-cost.md#pa-p5-008使自动评分可检查和可纠正) | 使自动评分可检查和可纠正 | P5-T03 | 2 |
| [PA-P5-009](phases/phase-05-quality-prompt-cost.md#pa-p5-009按失败原因沉淀改进依据) | 按失败原因沉淀改进依据 | P5-T03 | 2 |
| [PA-P5-010](phases/phase-05-quality-prompt-cost.md#pa-p5-010生成和验证-prompt-优化候选) | 生成和验证 Prompt 优化候选 | P5-T04 | 2 |
| [PA-P5-011](phases/phase-05-quality-prompt-cost.md#pa-p5-011形成可解释的项目质量看板) | 形成可解释的项目质量看板 | P5-T05 | 2 |
| [PA-P5-012](phases/phase-05-quality-prompt-cost.md#pa-p5-012汇总真实用量与有标识的估算费用) | 汇总真实用量与有标识的估算费用 | P5-T05 | 2 |
| [PA-P5-013](phases/phase-05-quality-prompt-cost.md#pa-p5-013控制整个任务的预算与新增开销) | 控制整个任务的预算与新增开销 | P5-T06 | 2 |
| [PA-P5-014](phases/phase-05-quality-prompt-cost.md#pa-p5-014导出具有证据和适用范围的评测结论) | 导出具有证据和适用范围的评测结论 | P5-T07 | 2 |
| [PA-P5-015](phases/phase-05-quality-prompt-cost.md#pa-p5-015评测-skill-选择和渐进读取) | 评测 Skill 选择和渐进读取 | P5-T08 | 2 |
| [PA-P5-016](phases/phase-05-quality-prompt-cost.md#pa-p5-016评测上下文压缩后的任务保全) | 评测上下文压缩后的任务保全 | P5-T08 | 2 |
| [PA-P5-017](phases/phase-05-quality-prompt-cost.md#pa-p5-017评测工具参数与插件行为) | 评测工具参数与插件行为 | P5-T09 | 2 |
| [PA-P5-018](phases/phase-05-quality-prompt-cost.md#pa-p5-018评测多-agent-协作和长任务结果) | 评测多 Agent 协作和长任务结果 | P5-T09 | 2 |
| [PA-P5-019](phases/phase-05-quality-prompt-cost.md#pa-p5-019提供贯穿全部任务的-token-消费面板) | 提供贯穿全部任务的 Token 消费面板 | P5-T10 | 2 |

### 阶段 6：高级协作、应用发布与运营需求

| 需求编号 | 需求内容 | 候选任务 / 联验责任 | 验收项数 |
|---|---|---|---:|
| [PA-P6-001](phases/phase-06-publishing-and-operations.md#pa-p6-001组织并行工作并明确汇总条件) | 组织并行工作并明确汇总条件 | P6-T01 | 2 |
| [PA-P6-002](phases/phase-06-publishing-and-operations.md#pa-p6-002执行有明确边界的循环与批量任务) | 执行有明确边界的循环与批量任务 | P6-T01 | 2 |
| [PA-P6-003](phases/phase-06-publishing-and-operations.md#pa-p6-003支持可审查的人工介入) | 支持可审查的人工介入 | P6-T02 | 2 |
| [PA-P6-004](phases/phase-06-publishing-and-operations.md#pa-p6-004中断后恢复可理解的长任务) | 中断后恢复可理解的长任务 | P6-T02 | 2 |
| [PA-P6-005](phases/phase-06-publishing-and-operations.md#pa-p6-005让多个-agent-按明确职责协作) | 让多个 Agent 按明确职责协作 | P6-T03 | 2 |
| [PA-P6-006](phases/phase-06-publishing-and-operations.md#pa-p6-006提供范围明确的任务执行空间) | 提供范围明确的任务执行空间 | P6-T04 | 2 |
| [PA-P6-007](phases/phase-06-publishing-and-operations.md#pa-p6-007受控使用-skill-脚本和本地-mcp-能力) | 受控使用 Skill 脚本和本地 MCP 能力 | P6-T05 | 2 |
| [PA-P6-008](phases/phase-06-publishing-and-operations.md#pa-p6-008交付可追溯且可核验的任务产物) | 交付可追溯且可核验的任务产物 | P6-T06 | 2 |
| [PA-P6-009](phases/phase-06-publishing-and-operations.md#pa-p6-009动态复用后端与前端插件能力) | 动态复用后端与前端插件能力 | P6-T07 | 2 |
| [PA-P6-010](phases/phase-06-publishing-and-operations.md#pa-p6-010复核记忆候选并处理过期与冲突) | 复核记忆候选并处理过期与冲突 | P6-T07 | 2 |
| [PA-P6-011](phases/phase-06-publishing-and-operations.md#pa-p6-011交付扫描文本表格与跨文档知识能力) | 交付扫描文本、表格与跨文档知识能力 | P6-T08 | 2 |
| [PA-P6-012](phases/phase-06-publishing-and-operations.md#pa-p6-012依据任务选择模型并说明切换) | 依据任务选择模型并说明切换 | P6-T09 | 2 |
| [PA-P6-013](phases/phase-06-publishing-and-operations.md#pa-p6-013将已验证的配置发布为应用版本) | 将已验证的配置发布为应用版本 | P6-T10 | 2 |
| [PA-P6-014](phases/phase-06-publishing-and-operations.md#pa-p6-014通过-web-与-api-受控使用应用) | 通过 Web 与 API 受控使用应用 | P6-T11 | 2 |
| [PA-P6-015](phases/phase-06-publishing-and-operations.md#pa-p6-015提供有边界的-webhook-触发与结果通知) | 提供有边界的 Webhook 触发与结果通知 | P6-T11 | 2 |
| [PA-P6-016](phases/phase-06-publishing-and-operations.md#pa-p6-016切换回退与下线应用版本) | 切换、回退与下线应用版本 | P6-T10 | 2 |
| [PA-P6-017](phases/phase-06-publishing-and-operations.md#pa-p6-017运营个人租户与平台用户) | 运营个人租户与平台用户 | P6-T12 | 2 |
| [PA-P6-018](phases/phase-06-publishing-and-operations.md#pa-p6-018接入统一的公共资源仓库) | 接入统一的公共资源仓库 | P6-T13 | 2 |
| [PA-P6-019](phases/phase-06-publishing-and-operations.md#pa-p6-019观察应用调用并执行租户配额) | 观察应用调用并执行租户配额 | P6-T14 | 2 |
| [PA-P6-020](phases/phase-06-publishing-and-operations.md#pa-p6-020提供必要状态检查与运营告警) | 提供必要状态检查与运营告警 | P6-T14 | 2 |
| [PA-P6-021](phases/phase-06-publishing-and-operations.md#pa-p6-021按范围导出保留与删除运营数据) | 按范围导出、保留与删除运营数据 | P6-T15 | 2 |

### 阶段 7：Docker Compose 一键部署与完整交付

| 需求编号 | 需求内容 | 候选任务 / 联验责任 | 验收项数 |
|---|---|---|---:|
| [PA-P7-001](phases/phase-07-docker-compose-deployment.md#pa-p7-001-支持范围与前置检查) | 支持范围与前置检查 | P7-T01 | 2 |
| [PA-P7-002](phases/phase-07-docker-compose-deployment.md#pa-p7-002-完整交付包与一次启动入口) | 完整交付包与一次启动入口 | P7-T01 | 2 |
| [PA-P7-003](phases/phase-07-docker-compose-deployment.md#pa-p7-003-区分中间件密码平台秘密与个人-key) | 区分中间件密码、平台秘密与个人 Key | P7-T02 | 2 |
| [PA-P7-004](phases/phase-07-docker-compose-deployment.md#pa-p7-004-首次管理员引导与重复初始化) | 首次管理员引导与重复初始化 | P7-T02 | 2 |
| [PA-P7-005](phases/phase-07-docker-compose-deployment.md#pa-p7-005-个人租户和部署后的-byok) | 个人租户和部署后的 BYOK | P7-T03 | 2 |
| [PA-P7-006](phases/phase-07-docker-compose-deployment.md#pa-p7-006-默认持久化与数据生命周期) | 默认持久化与数据生命周期 | P7-T04 | 2 |
| [PA-P7-007](phases/phase-07-docker-compose-deployment.md#pa-p7-007-启动就绪与依赖故障) | 启动就绪与依赖故障 | P7-T05 | 2 |
| [PA-P7-008](phases/phase-07-docker-compose-deployment.md#pa-p7-008-启停与中断后的真实状态) | 启停与中断后的真实状态 | P7-T04 | 2 |
| [PA-P7-009](phases/phase-07-docker-compose-deployment.md#pa-p7-009-状态诊断日志与资源提示) | 状态诊断、日志与资源提示 | P7-T05 | 2 |
| [PA-P7-010](phases/phase-07-docker-compose-deployment.md#pa-p7-010-网络文件与执行权限边界) | 网络、文件与执行权限边界 | P7-T03 | 2 |
| [PA-P7-011](phases/phase-07-docker-compose-deployment.md#pa-p7-011-部署后动态安装与升级插件) | 部署后动态安装与升级插件 | P7-T06 | 2 |
| [PA-P7-012](phases/phase-07-docker-compose-deployment.md#pa-p7-012-一致备份与可验证恢复) | 一致备份与可验证恢复 | P7-T07 | 2 |
| [PA-P7-013](phases/phase-07-docker-compose-deployment.md#pa-p7-013-版本升级与兼容恢复) | 版本升级与兼容恢复 | P7-T07 | 2 |
| [PA-P7-014](phases/phase-07-docker-compose-deployment.md#pa-p7-014-前六阶段全功能部署验收) | 前六阶段全功能部署验收 | P7-T08 | 2 |
| [PA-P7-015](phases/phase-07-docker-compose-deployment.md#pa-p7-015-使用说明维护与交付结论) | 使用说明、维护与交付结论 | P7-T08 | 2 |

### 插件系统需求：开发、界面、动态执行与生命周期

| 需求编号 | 需求内容 | 候选任务 / 联验责任 | 验收项数 |
|---|---|---|---:|
| [PA-PLG-001](topics/01-plugin-system.md#pa-plg-001-插件开发入口) | 插件开发入口 | PLG-T01 | 2 |
| [PA-PLG-002](topics/01-plugin-system.md#pa-plg-002-能力包身份内容与版本) | 能力包身份、内容与版本 | PLG-T01 | 2 |
| [PA-PLG-003](topics/01-plugin-system.md#pa-plg-003-输入输出配置与权限声明) | 输入、输出、配置与权限声明 | PLG-T02 | 2 |
| [PA-PLG-004](topics/01-plugin-system.md#pa-plg-004-sdk模板与可复现样例) | SDK、模板与可复现样例 | PLG-T02 | 2 |
| [PA-PLG-005](topics/01-plugin-system.md#pa-plg-005-调试验证与打包) | 调试、验证与打包 | PLG-T03 | 2 |
| [PA-PLG-006](topics/01-plugin-system.md#pa-plg-006-安装前完整性与兼容性检查) | 安装前完整性与兼容性检查 | PLG-T04 | 2 |
| [PA-PLG-007](topics/01-plugin-system.md#pa-plg-007-个人安装范围与能力授权) | 个人安装范围与能力授权 | PLG-T05 | 2 |
| [PA-PLG-008](topics/01-plugin-system.md#pa-plg-008-byok-配置与凭证替换) | BYOK 配置与凭证替换 | PLG-T05 | 2 |
| [PA-PLG-009](topics/01-plugin-system.md#pa-plg-009-统一配置表单) | 统一配置表单 | PLG-T06 | 2 |
| [PA-PLG-010](topics/01-plugin-system.md#pa-plg-010-自定义组件与页面扩展) | 自定义组件与页面扩展 | PLG-T06 | 2 |
| [PA-PLG-011](topics/01-plugin-system.md#pa-plg-011-界面挂载卸载与局部故障) | 界面挂载、卸载与局部故障 | PLG-T06 | 2 |
| [PA-PLG-012](topics/01-plugin-system.md#pa-plg-012-自定义节点与-agent-工具执行) | 自定义节点与 Agent 工具执行 | PLG-T07 | 2 |
| [PA-PLG-013](topics/01-plugin-system.md#pa-plg-013-动态安装升级与配置生效) | 动态安装、升级与配置生效 | PLG-T08 | 2 |
| [PA-PLG-014](topics/01-plugin-system.md#pa-plg-014-应用版本与在途任务绑定) | 应用版本与在途任务绑定 | PLG-T08 | 2 |
| [PA-PLG-015](topics/01-plugin-system.md#pa-plg-015-停用撤权卸载与影响说明) | 停用、撤权、卸载与影响说明 | PLG-T08 | 2 |
| [PA-PLG-016](topics/01-plugin-system.md#pa-plg-016-受控代码与脚本执行) | 受控代码与脚本执行 | PLG-T07 | 2 |
| [PA-PLG-017](topics/01-plugin-system.md#pa-plg-017-token用量与诊断归属) | Token、用量与诊断归属 | PLG-T09 | 2 |
| [PA-PLG-018](topics/01-plugin-system.md#pa-plg-018-知识处理与检索扩展) | 知识处理与检索扩展 | PLG-T10 | 2 |
| [PA-PLG-019](topics/01-plugin-system.md#pa-plg-019-评测器与优化步骤扩展) | 评测器与优化步骤扩展 | PLG-T11 | 2 |
| [PA-PLG-020](topics/01-plugin-system.md#pa-plg-020-公共发布与安装联动) | 公共发布与安装联动 | PLG-T12 | 2 |
| [PA-PLG-021](topics/01-plugin-system.md#pa-plg-021-应用发布的插件依赖检查) | 应用发布的插件依赖检查 | PLG-T12 | 2 |
| [PA-PLG-022](topics/01-plugin-system.md#pa-plg-022-兼容检查升级验证与问题复现) | 兼容检查、升级验证与问题复现 | PLG-T04 | 2 |
| [PA-PLG-023](topics/01-plugin-system.md#pa-plg-023-插件资料产物与配置迁移) | 插件资料、产物与配置迁移 | PLG-T09 | 2 |

### 公共资源仓库需求

| 需求编号 | 需求内容 | 候选任务 / 联验责任 | 验收项数 |
|---|---|---|---:|
| [PA-HUB-001](topics/02-public-repositories.md#pa-hub-001建立五类资源的统一目录) | 建立五类资源的统一目录 | HUB-T01 | 2 |
| [PA-HUB-002](topics/02-public-repositories.md#pa-hub-002保持私人资源与公共副本分离) | 保持私人资源与公共副本分离 | HUB-T01 | 2 |
| [PA-HUB-003](topics/02-public-repositories.md#pa-hub-003提供足以判断用途和来源的资源说明) | 提供足以判断用途和来源的资源说明 | HUB-T02 | 2 |
| [PA-HUB-004](topics/02-public-repositories.md#pa-hub-004生成去除私人信息的公开副本) | 生成去除私人信息的公开副本 | HUB-T02 | 2 |
| [PA-HUB-005](topics/02-public-repositories.md#pa-hub-005提交可被精确识别的固定版本) | 提交可被精确识别的固定版本 | HUB-T03 | 2 |
| [PA-HUB-006](topics/02-public-repositories.md#pa-hub-006提供管理员审核队列和详情) | 提供管理员审核队列和详情 | HUB-T04 | 2 |
| [PA-HUB-007](topics/02-public-repositories.md#pa-hub-007只公开审核通过的精确版本) | 只公开审核通过的精确版本 | HUB-T04 | 2 |
| [PA-HUB-008](topics/02-public-repositories.md#pa-hub-008处理拒绝补充撤回与重新提交) | 处理拒绝、补充、撤回与重新提交 | HUB-T03 | 2 |
| [PA-HUB-009](topics/02-public-repositories.md#pa-hub-009使所有公开读取入口遵守同一可见规则) | 使所有公开读取入口遵守同一可见规则 | HUB-T05 | 2 |
| [PA-HUB-010](topics/02-public-repositories.md#pa-hub-010在采用者租户内安装和配置) | 在采用者租户内安装和配置 | HUB-T05 | 2 |
| [PA-HUB-011](topics/02-public-repositories.md#pa-hub-011以配置模板分发公共应用) | 以配置模板分发公共应用 | HUB-T06 | 2 |
| [PA-HUB-012](topics/02-public-repositories.md#pa-hub-012分发包含后端和自定义界面的插件) | 分发包含后端和自定义界面的插件 | HUB-T06 | 2 |
| [PA-HUB-013](topics/02-public-repositories.md#pa-hub-013分发可检查的-skill-资料包) | 分发可检查的 Skill 资料包 | HUB-T07 | 2 |
| [PA-HUB-014](topics/02-public-repositories.md#pa-hub-014发布需自行配置的-mcp-资源) | 发布需自行配置的 MCP 资源 | HUB-T07 | 2 |
| [PA-HUB-015](topics/02-public-repositories.md#pa-hub-015发布不携带私人数据的-prompt-模板) | 发布不携带私人数据的 Prompt 模板 | HUB-T08 | 2 |
| [PA-HUB-016](topics/02-public-repositories.md#pa-hub-016对每次更新重审并让采用者选择升级) | 对每次更新重审并让采用者选择升级 | HUB-T08 | 2 |
| [PA-HUB-017](topics/02-public-repositories.md#pa-hub-017区分普通撤回与风险下架) | 区分普通撤回与风险下架 | HUB-T09 | 2 |
| [PA-HUB-018](topics/02-public-repositories.md#pa-hub-018提供作者采用者和管理员的通知与审计) | 提供作者、采用者和管理员的通知与审计 | HUB-T09 | 2 |

<!-- generated-traceability:end -->

## 6. 每期核对与维护

每次新增、拆分或修订详细需求后，更新本索引和对应任务覆盖。保留原需求编号含义，追加新编号；实际 Issue/PR/证据关系在总 Issue 与阶段核对记录中维护。不能只按候选工作包是否完成判断功能覆盖。

采用 [阶段核对模板](../ci/phase-review-template.md) 检查阶段正文、共性要求、插件/公共仓库专题和以上端到端场景。最后按 [上线验收模板](../ci/release-acceptance-template.md) 核对可获取安装产物、真实部署、持久化和恢复。所有未完成项都有明确后续任务，只有有真实证据的部分可更新完成状态。
