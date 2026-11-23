# 文档图示

> 版本：v0.2 · 更新：2026-11-23 · 状态：产品规划、技术建议和交付流程图；不表示平台已经实现或部署。

图示以可编辑 DOT 源文件维护，SVG 用于 README 和文档内展示。精确的结构关系由图源生成，不使用生成式图片替代架构信息。功能验收以需求正文为准，技术细节以 technical 为准。

| 图示 | 可编辑源文件 | 用途与关联 |
|---|---|---|
| [product-capabilities.svg](product-capabilities.svg) | [product-capabilities.dot](product-capabilities.dot) | 四域产品关系及个人租户/插件支撑；[产品架构](../requirements/06-product-architecture.md) |
| [roadmap.svg](roadmap.svg) | [roadmap.dot](roadmap.dot) | 六期完整功能及第七期部署；[路线图](../requirements/02-roadmap.md) |
| [development-flow.svg](development-flow.svg) | [development-flow.dot](development-flow.dot) | AI 模板、Issue/PR/main 和每期核对；[开发流程](../ci/README.md) |
| [platform-architecture.svg](platform-architecture.svg) | [platform-architecture.dot](platform-architecture.dot) | 控制/执行/隔离、权威与派生数据；[技术总架构](../technical/01-platform-architecture.md) |
| [plugin-lifecycle.svg](plugin-lifecycle.svg) | [plugin-lifecycle.dot](plugin-lifecycle.dot) | 动态升级、旧版本引用、撤权与卸载；[插件设计](../technical/02-plugin-runtime-and-ui.md) |
| [public-review-flow.svg](public-review-flow.svg) | [public-review-flow.dot](public-review-flow.dot) | 私有副本、固定审核版本、公开和下架；[公共资源设计](../technical/05-public-repository-and-application-release.md) |
| [deployment-layout.svg](deployment-layout.svg) | [deployment-layout.dot](deployment-layout.dot) | Compose 入口、内网服务、执行边界与挂载恢复；[部署设计](../technical/06-docker-compose-deployment.md) |

## 维护方式

使用 Graphviz 将对应 DOT 渲染为 SVG，确保具备可显示中文的字体；当前图使用 Noto Sans CJK SC。更新图源与 SVG 后同时核对文档引用、标签和阶段归属，尤其不能恢复“阶段 6 可选”或“technical 仅占位”的旧口径。

运行命令示例：

```bash
dot -Tsvg image/platform-architecture.dot -o image/platform-architecture.svg
```

生成命令仅维护文档图片，不构建应用或启动部署。图中的服务名称和端口属于拟定架构；正式参数由第七阶段交付包验证并锁定。
