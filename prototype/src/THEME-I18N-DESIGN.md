# PeachAgent / OTRYX Studio — 高级主题、多语言与工作空间设计

## 设计原则

参考 Linear / Raycast / Claude / Cursor 的克制风格，以高比例中性色、细描边与精准布局服务 Agent 开发任务。普通工作面板不使用外阴影；代码、JSON、Token 与耗时保持等宽字体与等宽数字；状态色只承担语义。

## 竞品参考与限制

- JEECG-Boot 开源工程具备大模型管理、知识库、流程编排、MCP、AI 应用以及平台管理能力；本次仅吸收清晰业务入口和后台管理思路，不引入低代码编辑器。
- OpenSnail / SnailAI 的产品图库被用作方向参考，但当前无法可靠取得网页内容，不对具体模块作未经验证的推断。

## 三套主题（CSS Custom Properties）

| 语义变量 | editorial-light | obsidian-dark | nordic-slate |
| --- | --- | --- | --- |
| --bg-app | #F7F7F4 | #171B20 | #E9EEF2 |
| --bg-panel | #FCFCFA | #1C2127 | #F0F4F7 |
| --bg-card | #FFFFFF | #22282F | #F8FAFC |
| --text-primary | #23292B | #EBEDF0 | #243240 |
| --accent-primary | #4B617E | #A2B9D8 | #496A84 |
| --code-bg | #F0F2F4 | #151A20 | #DFE8EE |
| --code-fg | #283D53 | #D3E3F4 | #273F52 |

theme-engine.css 还定义了语义化字色、边框、阴影、圆角、状态和字体等令牌，并兼容现有组件类名。过渡为 160ms cubic-bezier(.2,0,0,1)，尊重 prefers-reduced-motion。

## Theme Engine / i18n

appearance.js 提供 getTheme/setTheme、getLocale/setLocale、t 和 localize API。主题与语言记录在 peachagent-appearance-v1，index.html 的 head 在 CSS 加载前应用主题，避免首屏闪烁。菜单、主控、登录、工作空间和典型状态支持中英文切换。

当前复杂编辑器、执行器内部语句保留原文，避免翻译代码、JSON、工具参数或篡改原型运行语义。生产化应迁移到显式 message-key 字典分模块维护，而不以 DOM 文本翻译作为最终方案。

## 注册和多工作空间

注册后自动可见默认空间。默认空间继续使用旧版账户级存储键，升级后历史数据不会迁移丢失；新空间使用独立账户 ID + 空间 ID 存储。新增、重命名和切换均为本地演示；切换前保存现有空间，未保存的编辑会阻止切换，不提供多用户授权或云同步。

演示凭证：demo@peachagent.local / PeachAgent@2026。公开演示账号是硬编码前端演示入口，不是生产认证，不得用作正式密码。

## 验证

cd prototype/src
node qa/appearance-contract.cjs
node qa/integration.cjs
python qa/verify-sources.py
python build.py

原型入口为 prototype/OTRYX_Studio.html；只能将离线行为校验与真正的浏览器视觉检查分别归档，不能将静态检查等同于浏览器验收。
