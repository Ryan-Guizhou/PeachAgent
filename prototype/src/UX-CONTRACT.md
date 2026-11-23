# UX Contract

## Product context

面向 AI 应用构建、发布和持续改进的浏览器本地高保真原型。支持三套主题及 zh-CN／en-US 核心界面切换，复杂编辑器和部分动态文案仍保留中文；时间按 Asia/Shanghai 展示。基础键盘、焦点和状态反馈以 WCAG 2.2 AA 为设计目标，实际浏览器验收需单独进行。

## Context sources

| 领域 | 本目录依据 | 最近更新 |
| --- | --- | --- |
| 用户目标、页面归属、实现边界 | [产品 PRD](../../requirements/PRD-PeachAgent.md) / [原型说明](../README.md) | 2026-11-23 |
| 颜色、密度、组件所有权 | DESIGN.md / THEME-I18N-DESIGN.md / styles.css / theme-engine.css | 2026-11-23 |
| 执行、版本、发布与评测契约 | RUNTIME-CONTRACT.md / 当前模块代码 | 2026-11-23 |
| 已执行检查与未验收范围 | qa/verification.md / qa 脚本 | 以实际记录为准 |

产品需求与排期统一由 PRD 管理；本契约记录当前原型的交互行为及验收目标，不代表正式服务已经实现。

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
| --- | --- | --- | --- | --- |
| Select/Listbox | native select + .select | core.js / styles.css | 系统原生选择器 | verify-sources 标签检查；真实键盘弹层待浏览器验收 |
| Form | Studio.field / Studio.validate | core.js | 创建、编辑、配置；novalidate | 各模块契约与 verify-sources |
| Scrollbar | 全局原生滚动条规则 | styles.css | 系统滚动、表格横向滚动 | 源码检查；实际窄屏滚动待浏览器验收 |
| Toast | Studio.toast | core.js | success / info / warning / error | 注册与状态检查；不替代持久错误 |
| CRUD | Studio.ContentStore / Studio.Quality / Studio.Publishing / Studio.Models | knowledge.js / quality.js / publishing.js / models.js | 对象维护、归档恢复、版本保存 | knowledge-contract / quality-contract / publishing-contract |
| Dialog/Drawer | Studio.modal / Studio.drawer | core.js | 居中、宽版、右侧 | 渲染与动作检查；焦点恢复待浏览器验收 |
| Save | Studio.save | core.js | 浏览器持久化、失败提示、导出备份 | product-integration 容量失败与恢复 |
| Search | Studio.search / .search-field | core.js | 页面对象搜索、清除 | 内容测试中的 IME、分页和空态 |
| Route | Studio.page / Studio.go | core.js | History API 管理的 hash 页面与详情 | navigation-contract DOM/history 模型与路由注册 |
| Auth | StudioAuth | auth.js | 登录、注册、恢复、过期、账户弹窗 | auth-contract / navigation-contract |
| Workspace | StudioSpaces | spaces.js | 默认空间、创建、重命名、切换 | appearance-contract 已定义；新增能力尚未完整回归 |
| Appearance | StudioAppearance | appearance.js / theme-engine.css | 三主题、核心中英文、浏览器偏好 | appearance-contract 已定义；真实视觉及完整翻译待验收 |
| Model selection | Studio.Models.selectionOptions / freezeBinding | models.js / model-bindings.js | 按类型与能力过滤，稳定 ID，原生 select | models-contract / model-integration |
| Delegation | Studio.Planning | planning.js | 临时子 Agent、任务 DAG、模型池 | planning-contract 实际子运行与审批 |
| Execution | Studio.Runtime | runtime.js / agent-studio.js | Agent、workflow、debug、API、eval | runtime-contract / product-integration |
| Content | Studio.ContentStore | knowledge.js | 知识、Prompt、Skill | knowledge-contract 正文、分段和版本 |
| Service/Key | Studio.Publishing | publishing.js | 所有者、调用方本地预览 | publishing-contract 申请、权限、状态 |
| Quality | Studio.Quality | quality.js | 数据集、任务、结果、复核 | quality-contract 真实执行与规则评分 |

各模块使用相同颜色令牌、按钮与字段语法，不另建平行的搜索、弹窗或通知组件。三主题为 editorial-light、obsidian-dark、nordic-slate；主题和语言偏好在当前浏览器共享。代码、JSON 编辑区保持原文，核心双语不等于完整业务翻译。

## Navigation ownership

- **构建与发布**：工作台、智能体、工作流、协作计划、发布与 API。
- **资源管理**：模型中心、知识库、工具与连接、提示词与 Skills、资源市场。
- **运行与改进**：运行记录、用量与成本、质量评测；演示管理员可见公共发布审核。
- **空间设置**：固定入口，包含个人偏好与部署配置草案；旧模型标签只链接唯一模型中心。

详情路由继承对应父导航状态。导航 DOM 与滚动容器在路由和后台刷新中保持；当前菜单重复点击不导航。程序化同 hash 刷新保留内容位置，不添加重复 history；同页 query 变更保留位置，前进后退恢复历史位置。旧资产路由导向实际维护位置，MCP 不出现在知识正文列表。资源选择器可以跨来源引用，但只有对象的主入口可维护其配置。

## List and dataset behavior

搜索、筛选、分页、已归档切换和结果数量都来自实际状态。数据集允许为空；新增第一条、删去最后一条、导入全部错误、筛选无结果都有合理反馈。批量操作必须显示选中数量，不能把未选中记录混入操作。

路由只记录对象、标签页和必要筛选。敏感输入、完整正文、API Key 和业务样例不写入 URL。有限列表若截断必须说明数量或提供完整入口。

## Forms, imports and sensitive values

表单使用 `novalidate` 与应用内错误消息。保存失败保留可恢复反馈；错误出现在字段或表单区域，不只依赖 toast。危险删除、吊销和重置使用具体对象与后果说明。一般保存不添加无意义的二次确认。

评测导入必须先预览、映射字段并显示行错误与重复策略。导入源、格式、映射或数据集发生变化后旧预览失效。异步文件读取在关闭或新读取后不得覆盖当前表单。支持的导出按钮必须生成实际内容。

应用 Key 明文只在签发／领取时展示一次；之后列表仅显示可识别的末尾字符、权限与状态。当前会话可在 Playground 使用内存凭据；刷新后不能找回明文。模型密钥输入关闭或保存时清空，MCP 配置仅使用凭证引用。发布请求日志不得包含 Key 正文。

## Account and planning behavior

登录是独立页面壳。注册、登录与恢复都有字段错误、提交状态、密码显隐和自动填充语义；允许密码管理器和粘贴。安全的站内返回路径保留必要对象参数，敏感输入不进入 URL。原有用户可直接进入演示空间。

注册账户有默认本地空间，可继续创建、重命名和切换空间；新空间带独立示例数据。业务状态按账户和空间保存，默认空间兼容旧数据。启动时捕获存储 key，身份或空间切换重载，防止过渡期串写。切换空间前检查未保存编辑并保存当前状态，切换时停止本地运行；当前不提供云同步、协作成员或服务端多租户授权。

密码仅保存加盐验证器；演示重置码只在内存存活且有到期与一次使用规则。会话过期／退出停止活跃运行、评测与子计划，清理临时 Key；未保存编辑通过应用弹窗处理。语言切换会关闭弹窗并重新渲染，未保存编辑保护尚未覆盖该操作。

计划先展示可编辑的临时子 Agent、依赖、输入输出、模型及权限，确认开始后冻结。自动分配只能使用允许模型池，手工选择仍检查类型与能力。临时对象不自动进入 Agent 列表；保存为草稿是单独动作。任务失败或审批拒绝不会显示全部成功；重复点击不重复执行，结束后的重试复制为新计划。

## Versions and async work

- 编辑器发布保留配置版本；运行启动时固定本次配置和依赖。
- 应用服务和评测拥有独立快照，明确新增版本或新任务才更新；历史重试不静默替换依赖。
- 当前连接停用和授权状态仍逐次检查，不被快照绕过。
- 运行审批、Key 申请审批、市场审核是三个独立流程，禁止混用状态名。
- 长任务显示真实状态、完成条数、已用时间与停止入口，未知总量不绘制虚假精确进度。
- 页面重载不自动重放执行。中断运行和评测停止并保留记录，重试由用户明确发起。
- 未保存工作台编辑离开时通过应用对话框提醒；详情页刷新不能覆盖正在编辑的表单。

## Results and quality

成功状态独立于返回值、操作回执和文件数量。没有返回与文件时显示实际完成状态及说明；内部节点输出只在传参和 Trace 中出现。

评测结果区分规则通过／未通过、执行错误、保护阻断、未执行和人工复核。平均分只计算确有规则分数的样例；被阻断不显示零分或随机分数。比较任务时先确认同一样例与同一规则。规则通过率不称为真实语义质量。

知识检索应显示正文来源、分段、版本与匹配依据；分别说明关键词匹配或向量／重排本地模拟。模型配置随知识版本保存，真实模型服务未连接。API Playground 同样明确本地模拟，模拟 202 接受不显示为业务完成。状态变化通过同一运行记录传递到日志和详情。

## Flow ledger

| 操作 | 触发与处理中 | 成功去向 | 失败或取消后的恢复 |
| --- | --- | --- | --- |
| 注册 / 登录 | 字段校验、密码校验或创建、提交防重 | 返回安全的站内目标／个人工作区 | 保留非敏感字段，清理密码并定位错误 |
| 会话过期 / 退出 | 停止活跃运行、清理会话秘密 | 登录或过期页 | 未保存编辑可返回继续；失败不切错工作区 |
| 维护模型 | 按类型校验参数、引用与连接 | 模型列表／详情／用途默认项 | 写入失败回滚；停用不静默替换引用 |
| 自主规划 | 生成并审阅临时任务、分配模型与权限 | 执行 DAG、统一 Trace 与可选返回 | 阻断循环／越权，失败停止下游，明确复制后重试 |
| 创建 Agent / 工作流 | 表单校验，保存草稿 | 对应列表／编辑器 | 保留字段并定位错误 |
| 发布配置 | 校验图／配置、版本号 | 发布历史与可选来源 | 保留草稿和既有版本 |
| 创建并上线服务 | 选择已发布来源、固定依赖 | 服务概览与接入页 | 显示缺失依赖，允许重新配置 |
| 申请 Key | 填用途、权限和额度 | 待审批记录 | 可取消；驳回保留理由 |
| 审批与领取 | 角色校验、一次领取 | Key 列表与一次明文 | 重复或状态冲突明确报错 |
| API 试调 | 校验授权、配额、Schema | requestId / Run / Trace | 保留输入，显示错误码和原因 |
| 维护知识 | 正文校验、分段、保存版本 | 文档与检索页 | 内容保留反馈，不假装索引成功 |
| 导入评测样例 | 解析、映射、预览错误 | 数据集样例列表 | 错误行不导入，可修正后重新预览 |
| 启动评测 | 固定目标、数据与规则 | 任务详情及逐题结果 | 可停止、按旧快照重试失败项 |
| 问题回收 | 选择评测集、核对内容 | 新增可编辑样例 | 取消不改变运行或数据集 |
| 调试工具 | 参数校验、本地调用 | 输出、协议和事件 | 保留输入及分类错误 |
| 运行人工确认 | 批准／拒绝当前等待项 | 原运行继续或结束 | 不重复处理或重放已完成写入 |
| 无返回完成 | 配置路径完成 | 已完成，返回和文件可为空 | 如失败则定位实际节点 |
| 模板公开审核 | 提交、管理员演示处理 | 市场模板状态 | 退回保留理由 |

## Responsive and accessibility behavior

页面更新中文标题，导航支持前进后退；移动侧栏有关闭和遮罩。宽表、日志和画布可局部滚动，表单在窄屏单列。图编辑提供按钮添加节点、缩放和自动布局，减少单纯依赖拖动。

状态同时使用文字与图标，输入有 label，错误有可读消息，交互保留可见焦点。动效尊重 `prefers-reduced-motion`，强制颜色模式不隐藏核心控制。原生 dialog 的实际焦点约束、select 弹层及移动行为需浏览器检验。

## Verification

运行、图、能力、跨模块、内容、发布和质量的契约由 `qa/` 的 Node 脚本验证；生成标记用于检查语法、语义令牌、控件标签、表单和动作绑定。具体执行结果见 `qa/verification.md`，不在此复制容易过期的测试数量。

静态检查与 Node VM 渲染不是浏览器验收。真实点击、焦点、窄屏、拖动、原生选择框、下载、剪贴板、减少动效和视觉布局仍应在目标浏览器中验证；本契约不宣称这些检查已经完成。

