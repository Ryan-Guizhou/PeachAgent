# 用量、质量与设置模块验证记录

## 实现范围

- `usage`：近 7 / 30 天、本地 SVG 趋势、数据点键盘与悬停详情、按模型 / Agent / 任务汇总、8 条分页、UTF-8 CSV 下载、预算与阈值验证。
- `quality`：3 组评测集与样例、评测启动 / 停止 / 重试、3.5 秒有界进度、结果与示例基线对比、失败案例、应用建议到 Agent 草稿、跳转草稿。已发布提示词单独保留。
- `settings`：模型配置、API Key 显隐、本地成功 / 超时模拟、连接元数据保存、启用 / 停用、空间偏好、部署配置预览 / 复制 / 文件下载。
- 模型凭证只存在于打开的配置对话框中。保存只读取白名单元数据，保存和关闭都清空凭证；Endpoint 拒绝用户信息、查询参数和片段，避免把凭证误写入 URL 配置。
- 共享 `Studio.usageSummary()` 返回 `{cost, tokens, budget, ratio}`；ratio 为 cost / budget 的小数比值，超预算时可大于 1。预算同步到 `Studio.state.budget`，本地运行用量会叠加到账本。

## 数据与产品边界

费用、调用和评测均明确标注为本地演示。模型测试没有网络请求。部署配置是未部署的草案，OTRYX 前端 / API / Runtime 镜像为显式占位符，需要自行实现、构建并补齐安全与运维配置。

## 历史验证记录

以下记录来自原型开发阶段。临时脚本未纳入仓库，不是当前可运行的验证入口；当前可重复执行的检查请在 `prototype/src` 下运行 `node qa/integration.cjs` 和 `python qa/verify-sources.py`，范围见 `qa/verification.md`。

1. `node --check governance.js`：通过。
2. 开发阶段临时脚本 `otryx-governance-smoke.cjs`：当时执行通过，未随仓库提供。基于共享 API 契约的 Node VM 烟测覆盖 6 种页面状态渲染、用量新增记录 CSV、提示词草稿与发布版本分离、评测推进到完成、敏感值不进入状态与保存快照、部署参数写入下载内容。
3. `audit_project.py ... --mode strict --no-write`：执行完成。5 条 `affordance.actionless-button` 报告，来自 governance 日期按钮 1 处、builder 2 处、index 2 处。检查脚本只识别 inline onclick，不识别本项目共享 `data-action` 事件分派。这些需要用运行时点击证明，不应添加无动作 onclick 来让扫描通过。
4. 原生 alert / confirm / prompt、网络请求、直接 localStorage 调用检查：governance 中均不存在。字段验证、弹层、通知与下载复用 Studio 公共 API。

## 浏览器验证状态

开发阶段曾编写临时脚本 `otryx-governance-browser.py`，计划检查日期与分组、CSV 下载、预算错误恢复、评测停止与重试、结果建议、Esc、模型凭证显隐、模拟失败与成功、状态与存储中无密钥、偏好保存、YAML 下载和 390px 页面宽度。该脚本未随仓库提供，不要求读者运行。

当时执行环境无法启动 Chromium：Playwright 内置 headless shell 未安装；系统 Chromium 在进程启动阶段报 `socket() failed: Operation not permitted`。没有获得浏览器结果或截图，不将静态与契约烟测描述为真实浏览器验证。真实浏览器验收仍需在可用环境中按上述场景执行并记录结果。
