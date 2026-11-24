# PeachAgent Studio

Vue 3 + TypeScript + Pinia + Vue Router. P1 控制台以原型的布局、主题令牌及对象归属为参考，使用真实 REST 与 SSE。无模拟模型响应，不把 Cookie、密钥或对话持久化至 localStorage。

开发启动：先按 ../backend/README.md 启动 API 与 Worker，API 的 PUBLIC_ORIGIN 设为 http://127.0.0.1:5173，开发 HTTP 下 COOKIE_SECURE=false。执行 npm install 后 npm run dev。API 与 Worker 的 PEACHAGENT_ARTIFACT_DIRECTORY 必须指向同一受保护目录。正式部署由同源反向代理提供静态资源和 /api，生产保持 Secure Cookie。

P2 以后页面未开放。真实供应商调用需要用户配置凭证及可访问地址。当前页面与后端运行接口需集成验收，不以构建成功代表产品验收。
