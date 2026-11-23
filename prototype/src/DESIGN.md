---
version: alpha
name: OTRYX Studio
description: AI 应用构建与运行工作空间，以雾白、深海绿和清晰对象层级支撑日常工作。
colors:
  primary: "#176B62"
  ink: "#203B3B"
  muted: "#637774"
  background: "#F5F8F7"
  surface: "#FFFFFF"
  border: "#E2EAE7"
  mint: "#E8F2ED"
  success: "#23735B"
  warning: "#A46324"
  danger: "#B44444"
  lilac: "#EEEAF7"
  focus: "#176B62"
typography:
  display:
    fontFamily: "Avenir Next, Trebuchet MS, PingFang SC, Microsoft YaHei, sans-serif"
  sans:
    fontFamily: "PingFang SC, Microsoft YaHei, system-ui, sans-serif"
  mono:
    fontFamily: "SFMono-Regular, Consolas, monospace"
rounded:
  DEFAULT: "12px"
  sm: "8px"
  lg: "20px"
spacing:
  section-gap: "28px"
  page-max: "1440px"
components:
  button:
    borderRadius: "9px"
  card:
    borderRadius: "16px"
  dialog:
    borderRadius: "20px"
---

## Overview

面向需要构建、维护并开放 AI 应用的个人开发者与业务人员。主任务是继续编辑、处理运行待办、维护资源、发布能力和检查质量。默认简体中文，zh-CN；时间显示使用 Asia/Shanghai。

视觉使用雾白、深海绿、细边线和统一描边图标。品牌 OTRYX Studio 为原型暂定名称。布局按用户当前任务安排，常用操作稳定可见，版本、权限和结果有清楚的上下文。

2026-11-23 的用户反馈明确要求降低装饰性、提高实用性。本轮将首页主内容改为应用与工作流列表、最近运行和待办；任务接力带不再作为必须重复的视觉装饰。保留已认可的色彩与组件语汇，以实际对象、状态和操作形成层次。

## Colors

主操作 --primary #176B62；正文 --ink #203B3B；次级文本 --muted #637774；背景 --bg #F5F8F7；表面 --surface #FFFFFF；边线 --line #E2EAE7；柔和强调 --mint #E8F2ED；成功 --success #23735B；警告 --warning #A46324；错误 --danger #B44444；辅助 --lilac #EEEAF7。状态同时使用中文文本和图标，不只依赖颜色。

`styles.css` 的 `:root` 实现共享令牌，新增模块样式消费相同语义变量。颜色不以业务模块各自另造主题。

## Typography

品牌和数字使用 --font-display；内容使用 --font-body；运行编号、API 示例、版本和日志使用 --font-mono。主要标题约 28–30px，正文和页面说明 14px，表格 13px，辅助标注 12px。中文段落控制行宽，减少连续粗体。无需外部网络字体。

## Layout

桌面左侧 224px 导航，顶部 76px 上下文栏，内容区最大 1440px。导航按“构建与发布”“资源管理”“运行与改进”分组；设置保留固定入口。列表先展示名称、状态、版本和下一步操作，再展示技术细节。

工作台使用主要对象列表与侧边待办。管理页面使用页头、工具栏、列表和分页；内容详情使用明确标签页。表格保留合理密度，空状态引导创建或导入。API Key、评测样例、知识文档等可增长数据不使用仅供展示的固定卡片。

1000px 以下逐步收紧布局，760px 以下侧栏变为覆盖面板，详情区域单列。页面自然垂直滚动；画布、代码和宽表格可局部横向滚动。主操作不依赖 hover 才能找到。

## Elevation & Shapes

静态区域以边线和表面色差建立层次，浮层使用轻阴影。卡片常用 12–16px 圆角，主要输入容器和 dialog 使用 20px，按钮 9px。禁止大面积渐变、发光、装饰性玻璃和没有任务意义的指标大屏。图标保持原生 SVG、统一描边。

## Components and ownership

共享按钮、表单、原生 select、搜索、空状态、分页、徽章、dialog、drawer 和 toast 归 `core.js` / `styles.css` 所有。模块只补充自己的数据表、配置区、代码块与结果细节，不另建平行组件系统。

导航使用链接；即时动作使用按钮。禁用、提交中和错误状态保持尺寸稳定，错误靠近字段并带可读说明。原生选择框保留系统弹层和键盘行为。

全局滚动条使用 --scroll-thumb #B5C8C0、--scroll-track #F5F8F7，hover #8DA99D、active #688F7F；forced-colors 中恢复系统配色。动效只用于状态切换、任务推进和输出反馈，150–220ms，尊重 prefers-reduced-motion。

## Content hierarchy

- 用户先看到要处理的对象、当前状态和可执行动作。
- 服务页明确来源版本和本地 API 模拟；Key 明文只在领取时展示。
- 评测页先显示样例和具体判定原因，避免把规则平均分包装成语义质量。
- 知识页明确正文、分段、版本和命中来源；MCP 配置归工具与连接。
- 运行详情区分执行状态、可选返回、操作回执和文件；没有文件的成功运行保持完整表达。
- 代码、Schema、requestId、traceId 放在接入、调试与详情中，不堆到日常列表。

## Do's and Don'ts

- 用清楚的中文动作名，保留可键盘操作的焦点。
- 创建、编辑、导入、归档、发布、审批应改变实际状态，并在关联页面可观察。
- 列表为空、最后一条被删除、筛选无结果、存储失败都是正常可恢复状态。
- 不复制参考产品布局，不把示例数值当作用户数据，不制造没有依据的评分。
- 不引入外部依赖，不在原型发出真实模型或业务请求。
