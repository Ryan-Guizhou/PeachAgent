---
version: alpha
name: OTRYX Studio
description: 个人 AI 创作与运行工作室，以雾白、深海绿和任务接力图呈现可交付工作。
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
面向个人创作者、开发者与运营人员的产品界面。主任务是发起和继续工作、构建可复用 Agent 和流程、管理资产与运行质量。简体中文，zh-CN，Asia/Shanghai。
视觉参照是精密创作工作室：工具固定在边缘，中央留给正在进行的工作，细致标注表达状态与关系。采用雾白和深海绿色，而不是沿用参考产品的蓝色后台布局。
唯一视觉签名是任务接力带：将检索、执行、确认、交付表现为有语义的连接节点。其它模块保持安静，减少装饰。
这是交互原型，产品品牌 OTRYX Studio 为本轮设计提案，不表示最终命名决定。
设计令牌以本文件为规范，styles.css 的 :root 一对一实现，下游 feature CSS 只使用语义变量；无需外部网络字体。

## Colors
主操作 --primary #176B62；正文 --ink #203B3B；次级文本 --muted #637774；背景 --bg #F5F8F7；表面 --surface #FFFFFF；边线 --line #E2EAE7；柔和强调 --mint #E8F2ED；成功 --success #23735B；警告 --warning #A46324；错误 --danger #B44444；辅助资产 --lilac #EEEAF7。状态同时使用文本与图标。

## Typography
品牌和数字使用 --font-display；内容使用 --font-body；运行编号、版本和日志使用 --font-mono。标题 30px，页面说明 14px，主要正文 14px/1.65，表格 13px，辅助标注 12px。中文段落避免过长行和连续粗体。

## Layout
桌面左侧 224px 导航，顶部 76px 上下文栏。内容区最大 1440px，32px 内边距。首页采用 2:1 非对称布局，以大任务输入器和连续任务带为主体，辅助信息在右列。1000px 变紧凑布局，760px 导航改为可打开的覆盖面板，主内容单列。页面自然垂直滚动，只有画布、日志与表格拥有局部横向滚动。

## Elevation & Depth
静态卡片以边线和色差建立层次，几乎无阴影；输入面板和浮层使用轻阴影。避免大面积渐变、发光与装饰性玻璃效果。

## Shapes
卡片 16px，主要输入容器 20px，按钮 9px，标签和模式切换使用完整圆角。图标为统一 1.7px 描边的原生 SVG。

## Components
共享按钮、输入、原生选择框、空状态、分页、徽章、对话框、通知归 core.js / styles.css 所有。原生选择框接受操作系统弹层并保留键盘行为。导航使用链接；动作使用按钮；禁用和忙碌态稳定尺寸。
全局滚动条：--scroll-thumb #B5C8C0，--scroll-track #F5F8F7，hover #8DA99D，active #688F7F；在 forced-colors 中恢复系统配色。
动效只用于状态切换、任务推进和流式输出；150–220ms，尊重 prefers-reduced-motion。

## Do's and Don'ts
- 保留清晰的中文动作名称和可键盘操作的焦点。
- 每次审批、发布、安装都必须改变对应的演示状态，并可在其它页面观察结果。
- 不加载外部依赖，不在原型内发出真实模型或业务请求。
- 不复制参考网站结构，不以四个大数字卡片作为首页主视觉。
