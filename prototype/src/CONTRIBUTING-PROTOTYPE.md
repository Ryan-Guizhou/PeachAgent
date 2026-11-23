# 原型模块维护约定

源码开发须遵循[当期评审与交付规则](../../ci/README.md)：只展开当前 P1–P7 周期的需求与技术方案，经用户明确通过后开发。整体需求以[产品 PRD](../../requirements/PRD-PeachAgent.md)为准；现有原型能力和接口以代码及本目录契约为依据。

## 加载与共享边界

所有页面为普通 IIFE，无 ES module 或外部前端依赖。完整加载顺序以 [index.html](index.html) 为准：外观、空间与账户模块先于 `core`；`runtime` 先于依赖它的业务模块。全部模块载入后，依次执行 `StudioAuth.attach`、`StudioSpaces.attach`、`StudioAppearance.attach`，再执行 `Studio.init`。

- `core.js` 负责共享状态、路由、表单与旧数据兼容。
- `Studio.Runtime` 是图执行、工具调用、审批和事件的共享入口；接口见 [RUNTIME-CONTRACT.md](RUNTIME-CONTRACT.md)。
- `builder` 维护工作流；`capability-ui` 维护工具与连接；`trace` 维护运行详情；`agent-studio` 维护 Agent 与 Chat，页面间通过公开接口协作。
- 模型、知识、服务与评测各有唯一状态来源，不能再创建复制相同配置的平行“资产”对象。

## 界面与数据

复用 `Studio.page/action/form/go/render/save`、字段、弹窗、通知、复制与下载等共享原语。动作使用 `data-action` 事件委托，不添加空 `onclick` 掩盖静态检查结果。

原生 select、`novalidate` 表单及应用内错误反馈沿用现有约定；输入保留 label／aria-label，用户内容必须 HTML 转义。未保存编辑通过 `Studio.setDirty` 管理，异步刷新不得覆盖当前编辑内容。具体行为见 [UX-CONTRACT.md](UX-CONTRACT.md)。

共享样式由 `styles.css` 提供，主题语义令牌和兼容覆盖由 `theme-engine.css` 提供。功能 CSS 使用自己的前缀，消费共享令牌；检查三主题表现，避免只针对亮色硬编码。不得改变其它路由的滚动容器归属。

## 执行、版本与保存

- Agent、Workflow、Tool Debug、Node Debug、API 和评测复用共享执行路径，运行进入 `Studio.state.runs`。
- 状态、返回值、操作回执与显式文件分别表达；只有明确的成果能力生成文件，内部节点输出不自动变成交付物。
- 编辑草稿不改写已发布配置或已启动运行的快照。改变 Agent／工作流草稿时调用对应 `invalidateDraft`。
- 连接禁用、凭据失效和当前权限逐次检查；固定版本缺失时明确失败，不静默替换。
- 账户／空间 key 在启动时捕获；身份与空间切换重载，防止延迟保存串写。外观偏好与业务数据分别存储。
- 外部能力明确标为本地模拟，不发业务网络请求，不保存真实密钥；存储失败必须保留可恢复反馈。

## 验证与交付

从本目录执行 `node qa/integration.cjs`、`python qa/verify-sources.py`、`python build.py`。先生成检查所需的页面标记，再验证与构建。

检查证据记录在 [qa/verification.md](qa/verification.md)，区分历史结果、本次结果与未覆盖范围。Node 契约、静态源码和页面标记不能代替真实浏览器验收。
