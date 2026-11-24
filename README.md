# PeachAgent

[简体中文](README.md) | [English](README_EN.md)

<!-- doc-section:overview -->
## 面向完整任务的 Agent 开发平台

PeachAgent 是平台名称，OTRYX Studio 是当前控制台原型名称。

PeachAgent 面向个人开发者，连接 Agent/工作流设计、受控执行、知识检索、质量评测、资源复用和应用发布。每位用户拥有独立租户，可在多个工作空间中管理项目，自行配置模型和工具凭证。

**当前可体验的是 OTRYX Studio 浏览器交互原型。** 真实服务端、正式模型/工具接入和可部署 Compose 包尚未交付；P1 已获技术评审批准并进入开发，尚未验收；P2–P7 仍待各期技术评审。原型演示与产品验收分别记录。

- 查看背景、完整需求和排期：[产品需求文档](requirements/PRD-PeachAgent.md)。
- 体验已有交互：[原型使用说明](prototype/README.md)。
- 查看开发边界：[技术基线](technical/README.md)与[评审及交付流程](ci/README.md)。

<!-- doc-section:quick-start -->
## 体验原型

取得仓库后，在仓库根目录运行以下命令，需要 Python 3 和现代浏览器：

```bash
python3 -m http.server 8080 --directory prototype
```

打开 [http://localhost:8080/src/index.html](http://localhost:8080/src/index.html)，选择演示入口，或使用页面的“填入演示账号”：

| 项目 | 演示值 |
| --- | --- |
| 邮箱 | `demo@peachagent.local` |
| 密码 | `PeachAgent@2026` |

也可下载 [OTRYX_Studio.html](prototype/OTRYX_Studio.html) 后直接用浏览器打开；GitHub 文件页本身显示的是源代码。

建议依次体验空间与项目切换、固定版本资源副本、模型与凭证管理、工作流与 Agent、待办审批、运行追踪、数据集评测、应用发布/API Key 和市场审核。原型提供三套主题及核心中英切换，业务数据保存在本地浏览器；外部调用、凭证和费用采用模拟数据。详细边界与验证状态见[原型说明](prototype/README.md)。

<!-- doc-section:architecture -->
## 产品如何组织

| 产品域 | 解决的问题 | 交付能力 |
| --- | --- | --- |
| **Studio** | 配置与资源分散，难以维护应用 | 项目、Agent、工作流、模型、工具与连接、Prompt/Skill、独立知识库和插件界面 |
| **Runtime** | 多步任务难以控制、解释和恢复 | 统一执行、上下文与记忆、工具授权、沙盒、人工介入、动态子 Agent 和持久任务 |
| **Quality** | 难以判断改进是否有效 | 用户维护数据集、证据标注、逐题比较、人工复核、Prompt 优化和回归 |
| **Operations** | 发布、消费与治理脱节 | Sa-Token 身份权限、空间隔离、自备凭证、Token/预算、应用与 API Key、公共资源审核和部署 |

四域是职责分工。Studio 形成版本，Runtime 记录执行事实，Quality 提供改进依据，Operations 控制身份、发布与用量；具体服务拆分在当期技术评审中确定。

已确定的产品约束包括：个人租户可使用全部已交付功能；用户自备模型和工具凭证；插件支持真实代码、统一表单和自定义界面，变更不要求重启全部 Runtime；应用模板、插件、Skill、MCP、Prompt 按版本审核后公开。完整边界以 [PRD](requirements/PRD-PeachAgent.md) 为准。

<!-- doc-section:roadmap -->
## 七个开发周期

每个阶段对应一个开发周期，前六期交付完整功能，第七期完成部署与整体验收。

| 周期 | 交付结果 | 开发工期初估 |
| --- | --- | --- |
| P1 | 账号、多空间、多项目、模型、对话、Prompt、基础用量与工作台 | 2–3 周 |
| P2 | 可视化工作流、变量/分支/子流程、调试、插件节点与两类界面 | 3–4 周 |
| P3 | Agent、MCP、Skill、项目规则、上下文/记忆、受控代码与动态插件版本 | 4–6 周 |
| P4 | 知识生命周期、可解释 RAG、引用与检索基线 | 3–4 周 |
| P5 | 自维护数据集、多维评测、Prompt 优化、完整 Token 与费用分析 | 3–4 周 |
| P6 | 动态子 Agent、复杂编排/恢复、知识增强、发布/API Key、公共审核与运营 | 4–6 周 |
| P7 | Docker Compose、初始化与挂载、备份恢复、升级及全链路验收 | 2–3 周 |

按单一主线开发、可用 AI 辅助估算，合计 **21–30 个开发周**，包含实现、联调、测试和修复，不含评审准备及等待批准。每期在技术评审时根据方案和实际投入重新估算；范围、依赖和退出条件见 [PRD 排期](requirements/PRD-PeachAgent.md#release-plan)。

<!-- doc-section:development -->
## 开发规则

**当期技术评审 → 用户明确通过 → 当期开发与验证 → 周期验收 → 下一期重新评审。**

每期开工前只展开该期需求、实现方案和验收方式。整体 PRD 确认、原型合并或上期通过，不自动批准下期开发；批准范围内的正常实现不反复请求确认。新增范围或实质方案变化需要说明影响并重新评审。

当期评审和批准记录保存在一个周期 Issue 中，开发任务按一个 Issue 对应一个 PR 跟踪。真实检查证据和遗留项随任务回填，按[开发流程](ci/README.md)集中完成适用回归。总进度由 [Issue #1](https://github.com/Ryan-Guizhou/PeachAgent/issues/1) 跟踪；文档或原型交付不勾选正式产品完成项。

<!-- doc-section:repository -->
## 文档与源码

| 路径 | 维护内容 |
| --- | --- |
| [requirements/PRD-PeachAgent.md](requirements/PRD-PeachAgent.md) | 唯一需求正文：背景、目标、用户、完整需求、七期排期与验收 |
| [technical/README.md](technical/README.md) | 既定架构约束、技术方向及各期需评审的选择 |
| [ci/README.md](ci/README.md) | 期前技术评审、用户批准、Issue/PR、周期验收与变更规则 |
| [prototype/](prototype/README.md) | 可运行的本地原型、HTML/CSS/JS 源码、实现契约和验证记录 |

已有重复总纲、阶段明细和专题已合并；旧编号在 PRD 中保留覆盖关系，历史文本可从 Git 历史查阅。后续不为每一期预建一套计划和方案文件，按该期评审 Issue 记录即可。

<!-- doc-section:license -->
## 许可证

本项目采用 [MIT License](LICENSE)。公共资源需保留作者与第三方依赖的许可信息，仓库许可证不替上传者授予他人内容的再分发权。

