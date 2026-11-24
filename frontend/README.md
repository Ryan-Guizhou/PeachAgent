# PeachAgent Studio 前端

[English](README_EN.md) | [完整后端启动](../backend/README.md)

Vue 3 + TypeScript + Pinia + Vue Router + Vite。P1 使用真实 REST 与 SSE，不以 localStorage 保存 Cookie、密钥、对话或模拟运行结果。

1. 安装 Node.js 22（至少 22.12）及 npm。
2. 按后端说明配置 .env 并启动中间件、API、Worker；API 设 PUBLIC_ORIGIN=http://127.0.0.1:5173，COOKIE_SECURE=false（仅本地 HTTP）。API 默认 8080。
3. 在 frontend 目录执行：

```bash
npm install
npm run dev
```

访问 http://127.0.0.1:5173，不要混用 localhost。vite.config.ts 代理 /api 到 http://127.0.0.1:8080，changeOrigin=false；修改 API 地址/端口时同步代理目标，修改前端端口时同步 PUBLIC_ORIGIN。浏览器使用 HttpOnly Cookie，写请求携带 CSRF Token；SSE 自动读取运行事件。

生产构建：`npm run build`（TypeScript 校验 + Vite，输出 dist/）。可使用后端说明中的同源静态模式预览，勿将 npm run preview 当作完整后端。测试依赖 Playwright 通过 package.json 固定版本：`npx playwright install chromium`。完整 smoke 由 [CI](../.github/workflows/p1-backend.yml) 先建立一次性账号和模型 fixture，再执行 `npm run qa:browser`；单独执行不提供测试数据。截图输出 qa/evidence/。使用 `npm audit --audit-level=high` 检查安全告警。

P1 仅开放已交付的十个工作台页面；P2 后续功能不开放。真实供应商验证及完整 UI 验收见 [#18](https://github.com/Ryan-Guizhou/PeachAgent/issues/18)。
