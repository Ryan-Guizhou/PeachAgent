# UX Contract

## Product context
个人租户 AI 工作室的高保真本地交互原型。zh-CN；Asia/Shanghai；目标 WCAG 2.2 AA 基础行为。

## Business-context sources
| Domain | Authoritative source | Source type | Reviewed date |
| --- | --- | --- | --- |
| 权限与公共发布 | PRODUCT.md | 用户需求与本轮边界 | 2026-11-23 |
| 生命周期与任务审批 | PRODUCT.md | 用户需求 | 2026-11-23 |
| 用量与密钥 | PRODUCT.md | 原型约束 | 2026-11-23 |
| 数据与重置 | PRODUCT.md | 本地演示 | 2026-11-23 |

## Visual contract
DESIGN.md 定义规范，styles.css 的语义变量实现颜色、字形、圆角；模块样式消费相同变量。亮色为唯一主题。

## Canonical UI Map
| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
| --- | --- | --- | --- | --- |
| Select/Listbox | native select + .select | DESIGN.md | native | 浏览器键盘与展开 |
| Form | Studio.field / Studio.validate | core.js | create/edit | 新建 Agent 和配置 |
| Scrollbar | styles.css global baseline | DESIGN.md | 画布几何差异 | computed style |
| Toast | Studio.toast | core.js | success/info/warning/error | aria-live |
| CRUD | Studio.state / save / render / go | PRODUCT.md | 列表/编辑工作台 | 流程检验 |
| Dialog | Studio.modal / drawer | core.js | modal/drawer | Esc、焦点恢复 |
| Search | .search-field + Studio.search | core.js | local | 清除、中文输入 |
| Execution | Studio.Runtime | RUNTIME-CONTRACT.md | workflow / tool debug / agent | 配置驱动的图执行与事件检查 |
| Tool binding | agent.capabilityBindings | PRODUCT.md | Agent 草稿 / 单次会话 | 具体工具、连接、版本、授权状态 |
| Run result | outcome 与 status 分离 | PRODUCT.md | 无返回 / 数据 / 回执 / 文件 | 无文件成功、目标写入、显式产物 |

## Dataset navigation
演示数据使用本地分页或显式数量限制；筛选即时执行。路由使用 hash，页面筛选由 params 读取。跨页搜索和临时编辑是本地 UI 状态，不写入 URL，避免演示输入暴露在链接。数据规模有限；列表显示结果数和空状态。

## Navigation and responsive behavior
每个路由更新中文标题。浏览器前进后退可恢复路由。手机侧栏有关闭按钮和背景，内容不依赖 hover。表格横向滚动；画布提供缩放及按钮添加节点作为拖动替代。

## Overlays and feedback
共享原生 dialog 内部使用自有样式，showModal 提供焦点约束；关闭恢复触发点。持久通知使用 status/alert，toast 仅确认结果。危险重置使用命名确认对话框。原型保存无需多余确认。

## Forms and sensitive values
form novalidate，内联验证与首错误焦点。textarea resize none。模型 token 字段 masked，提供显示/隐藏，关闭丢弃，绝不序列化。无真实请求或费用。

## Async and resilience
模拟执行使用有界异步任务，注明演示；节点输入、条件和工具状态驱动执行。审批批准与驳回互斥，已完成记录不能重复处理。保存仅在成功后关闭表单。localStorage 不可用时保持会话内状态。未保存工作台配置切换页面时用自有对话框提醒。运行版本冻结，当前禁用/凭证可用性仍在每次调用时检查。页面重载不自动重放外部操作；中断记录保留并由用户明确新建重跑。

## Flow ledger
| Operation | Trigger | Pending | Success destination | Feedback | Failure recovery | Source ref |
| --- | --- | --- | --- | --- | --- | --- |
| 创建 Agent | 新建 | 校验 | Agent 列表 | 创建成功 | 保留字段 | PRODUCT.md |
| 编辑并发布 | 发布版本 | 保存中 | 编辑工作台 | 版本更新 | 留在表单 | PRODUCT.md |
| 执行任务 | 开始运行 | 执行节点 | 任务详情 | 已开始 | 停止/重试 | PRODUCT.md |
| 人工审批 | 批准/拒绝 | 状态变更 | 任务详情 | 已记录 | 不重复执行 | PRODUCT.md |
| 市场审核 | 提交/批准/退回 | 待审核 | 审核/市场 | 状态变化 | 退回保留理由 | PRODUCT.md |
| 安装资源 | 安装 | 安装中 | 当前市场 | 已安装 | 保持原列表 | PRODUCT.md |
| 调试工具 | 运行测试 | 参数校验/调用 | 当前调试台 | 结构化结果与事件 | 保留输入并显示分类错误 | PRODUCT.md |
| 无返回完成 | 结束节点 | 前置节点完成 | 运行详情 | 已完成、返回为空 | 查看实际失败节点 | PRODUCT.md |
| 目标位置写入 | 工具节点 | 审批/执行 | 运行详情 | 模拟位置与回执 | 不重复回放已完成写入 | PRODUCT.md |

## Verification
已执行 premium 静态审计、29 项 Runtime 契约、228 个工作流检查器渲染、13 个能力页面变体及 78 个跨模块状态的 Node VM 检查，结果见 qa/verification.md。原生 Select 所有权由 premium-ui.json 明确记录；静态审计器不识别 data-action 事件委托的报告单独说明。当前环境阻止浏览器预览；实际点击、焦点、窄屏、拖动、下载和减少动效仍待浏览器验收，不将源码规则当作验收通过。
