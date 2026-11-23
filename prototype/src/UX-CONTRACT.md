# UX Contract

## Product context

面向 AI 应用构建、发布和持续改进的浏览器本地高保真原型。zh-CN，时间按 Asia/Shanghai 展示。视觉采用亮色主题，基础键盘、焦点和状态反馈以 WCAG 2.2 AA 为设计目标；实际浏览器验收需单独进行。

## Context sources

| 领域 | 本目录依据 | 最近更新 |
| --- | --- | --- |
| 用户目标、页面归属、实现边界 | PRODUCT.md / PRODUCT-PLAN.md | 2026-11-23 |
| 颜色、密度、组件所有权 | DESIGN.md / styles.css | 2026-11-23 |
| 执行、版本、发布与评测契约 | RUNTIME-CONTRACT.md / 当前模块代码 | 2026-11-23 |
| 已执行检查与未验收范围 | qa/verification.md / qa 脚本 | 以实际记录为准 |

本轮不从仓库外部产品文档引入未经用户确认的新限制。

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
| --- | --- | --- | --- | --- |
| Select/Listbox | native select + .select | core.js / styles.css | 系统原生选择器 | verify-sources 标签检查；真实键盘弹层待浏览器验收 |
| Form | Studio.field / Studio.validate | core.js | 创建、编辑、配置；novalidate | 各模块契约与 verify-sources |
| Scrollbar | 全局原生滚动条规则 | styles.css | 系统滚动、表格横向滚动 | 源码检查；实际窄屏滚动待浏览器验收 |
| Toast | Studio.toast | core.js | success / info / warning / error | 注册与状态检查；不替代持久错误 |
| CRUD | Studio.ContentStore / Studio.Quality / Studio.Publishing | knowledge.js / quality.js / publishing.js | 对象维护、归档恢复、版本保存 | knowledge-contract / quality-contract / publishing-contract |
| Dialog/Drawer | Studio.modal / Studio.drawer | core.js | 居中、宽版、右侧 | 渲染与动作检查；焦点恢复待浏览器验收 |
| Save | Studio.save | core.js | 浏览器持久化、失败提示、导出备份 | product-integration 容量失败与恢复 |
| Search | Studio.search / .search-field | core.js | 页面对象搜索、清除 | 内容测试中的 IME、分页和空态 |
| Route | Studio.page / Studio.go | core.js | hash 页面与详情 | expanded-contract 内部路由注册 |
| Execution | Studio.Runtime | runtime.js / agent-studio.js | Agent、workflow、debug、API、eval | runtime-contract / product-integration |
| Content | Studio.ContentStore | knowledge.js | 知识、Prompt、Skill | knowledge-contract 正文、分段和版本 |
| Service/Key | Studio.Publishing | publishing.js | 所有者、调用方本地预览 | publishing-contract 申请、权限、状态 |
| Quality | Studio.Quality | quality.js | 数据集、任务、结果、复核 | quality-contract 真实执行与规则评分 |

各模块使用相同颜色令牌、按钮与字段语法，不另建平行的搜索、弹窗或通知组件。

## Navigation ownership

- **构建与发布**：工作台、智能体、工作流、发布与 API。
- **资源管理**：知识库、工具与连接、提示词与 Skills、资源市场。
- **运行与改进**：运行记录、用量与成本、质量评测；演示管理员可见公共发布审核。
- **空间设置**：固定入口，包含模型、偏好与部署配置草案。

详情路由继承对应父导航状态。旧资产路由导向实际维护位置，MCP 不出现在知识正文列表。资源选择器可以跨来源引用，但只有对象的主入口可维护其配置。

## List and dataset behavior

搜索、筛选、分页、已归档切换和结果数量都来自实际状态。数据集允许为空；新增第一条、删去最后一条、导入全部错误、筛选无结果都有合理反馈。批量操作必须显示选中数量，不能把未选中记录混入操作。

路由只记录对象、标签页和必要筛选。敏感输入、完整正文、API Key 和业务样例不写入 URL。有限列表若截断必须说明数量或提供完整入口。

## Forms, imports and sensitive values

表单使用 `novalidate` 与应用内错误消息。保存失败保留可恢复反馈；错误出现在字段或表单区域，不只依赖 toast。危险删除、吊销和重置使用具体对象与后果说明。一般保存不添加无意义的二次确认。

评测导入必须先预览、映射字段并显示行错误与重复策略。导入源、格式、映射或数据集发生变化后旧预览失效。异步文件读取在关闭或新读取后不得覆盖当前表单。支持的导出按钮必须生成实际内容。

应用 Key 明文只在签发／领取时展示一次；之后列表仅显示可识别的末尾字符、权限与状态。当前会话可在 Playground 使用内存凭据；刷新后不能找回明文。模型密钥输入关闭或保存时清空，MCP 配置仅使用凭证引用。发布请求日志不得包含 Key 正文。

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

知识检索应显示正文来源、分段、版本与匹配依据，说明本地关键词模式。API Playground 同样明确本地模拟，模拟 202 接受不显示为业务完成。状态变化通过同一运行记录传递到日志和详情。

## Flow ledger

| 操作 | 触发与处理中 | 成功去向 | 失败或取消后的恢复 |
| --- | --- | --- | --- |
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
