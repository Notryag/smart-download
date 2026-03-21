# UI Redesign

## Goal

当前界面已经能用，但整体气质更接近“产品介绍页 + 状态看板”，不像一个长期驻留桌面的下载工具。

这一轮 UI 目标不是做品牌展示，而是把界面重心收回到：

- 快速创建 magnet 任务
- 稳定观察任务状态
- 及时发现失败原因
- 低认知负担地做 pause / resume / delete

约束：

- 只考虑 Electron 桌面端
- 当前阶段仍然只做 `magnet -> BT -> aria2`
- renderer 继续只负责展示和交互
- 不为视觉改造引入新依赖

## Current Problems

### 1. 首页结构像营销页，不像工作台

当前页面从 [App.tsx](D:/workspace/demo/smart-download/src/renderer/src/App.tsx) 看，顶部首先是：

- `HeroSection`
- `DiagnosticsPanel`
- `TaskSection`
- `StatusStrip`
- `RecentLogsPanel`

这会导致用户进入页面后先看到“大标题、说明文案、项目结构”，而不是任务队列和操作入口。

问题不在于组件拆分，而在于信息优先级排反了。

### 2. 顶部 Hero 强化了“网站感”

[HeroSection.tsx](D:/workspace/demo/smart-download/src/renderer/src/components/HeroSection.tsx) 现在承担的是：

- 巨大的产品标题
- 阶段说明
- 项目介绍文案
- 主按钮

这类布局更像 landing page。桌面下载工具首页更应该优先展示：

- 当前引擎状态
- 活跃任务数
- 失败任务数
- 一键新建任务

### 3. DiagnosticsPanel 混入了“项目介绍信息”

[DiagnosticsPanel.tsx](D:/workspace/demo/smart-download/src/renderer/src/components/DiagnosticsPanel.tsx) 左侧卡片现在写的是：

- 进程边界
- IPC 合同
- “任务列表会轮询主进程的同步状态”

这些是开发说明，不是用户工作流信息。

它会让界面更像 demo 页面，而不是用户工具。

### 4. 底部 StatusStrip 是技术展示，不是任务控制信息

[StatusStrip.tsx](D:/workspace/demo/smart-download/src/renderer/src/components/StatusStrip.tsx) 目前展示：

- React + Vite
- Electron
- Aria2 Ready

前两项对终端用户没有操作价值，只会增加“这是技术样板”的感觉。

### 5. 视觉语言偏展示型

[main.css](D:/workspace/demo/smart-download/src/renderer/src/assets/main.css) 当前特点：

- 大面积渐变背景
- Hero 大标题
- 玻璃拟态卡片
- 大圆角、大留白

这套语言可以好看，但更像宣传站，不像下载工具。下载工具更适合：

- 稳定的结构网格
- 更紧凑的信息密度
- 明确的主次层级
- 更强的列表操作感

### 6. 任务区是对的，但权重还不够高

[TaskSection.tsx](D:/workspace/demo/smart-download/src/renderer/src/components/TaskSection.tsx) 已经具备工具核心雏形：

- 任务列表
- 任务详情
- 任务操作
- 进度与速度

问题是它被放在页面中段，前面还有更“吸睛”的模块在抢注意力。

## Product Direction

新的 UI 应该明确是：

`下载工作台`

不是：

- 产品官网
- 架构演示页
- 技术 showcase

用户打开应用之后，默认心理模型应该是：

1. 这里可以马上创建任务
2. 这里可以看到哪些任务在跑
3. 哪个任务失败了，一眼能知道
4. 我不用理解技术栈，也能完成操作

## Information Architecture

建议把主界面收敛成三段，而不是“宣传块 + 诊断块 + 工具块”。

### 1. 顶栏 Header

只保留工具信息：

- 应用名：`Smart Download`
- 当前引擎状态：`aria2 已连接 / 不可用`
- 任务摘要：`进行中 x / 失败 x`
- 主操作按钮：`新建任务`

Header 要短、稳、可扫读，不要大段介绍文案。

### 2. 主工作区 Workspace

主工作区采用两栏：

- 左栏：任务队列
- 右栏：任务详情 + 诊断

建议比例：

- 左 58%
- 右 42%

这样进入应用后，任务列表就是视觉中心。

### 3. 底部辅助区

底部只保留有诊断价值的内容：

- 最近日志
- 失败提示
- 运行时告警

不再展示 `React + Vite`、`Electron` 这类技术标签。

## Proposed Layout

```text
+--------------------------------------------------------------+
| Smart Download | aria2 正常 | 进行中 2 | 失败 1 | 新建任务   |
+--------------------------------------------------------------+
| 任务筛选/统计                                                  |
+----------------------------------+---------------------------+
| 任务列表                           | 任务详情                  |
| - Ubuntu ISO                      | 名称 / 状态 / 进度       |
| - Debian Netinst                  | 保存目录 / magnet / GID  |
| - Arch Linux                      | 速度 / 大小 / ETA        |
|                                   | 错误信息 / 操作按钮      |
+----------------------------------+---------------------------+
| 诊断摘要                           | 最近日志                  |
+--------------------------------------------------------------+
```

重点：

- 进入页面先看到任务，不先看到品牌文案
- 所有关键状态都在首屏
- 新建任务入口固定，不需要在页面里寻找

## Module Mapping

基于现有组件，建议是“重组和收口”，不是推倒重写。

### 保留并改造

- `TaskSection`
  改成页面主区核心模块
- `NewTaskModal`
  保留，后续增强输入体验
- `RecentLogsPanel`
  保留，放到底部辅助区

### 缩减或重写

- `HeroSection`
  改成 `AppHeader`
- `DiagnosticsPanel`
  去掉项目结构说明，只保留用户诊断摘要
- `StatusStrip`
  删除或并入 `AppHeader`

## Visual Direction

### 总体气质

目标是：

- 桌面工具
- 冷静
- 克制
- 信息优先

不是：

- 宣传感
- 炫技感
- 过度玻璃拟态

### 建议风格

- 背景改为更稳定的深色工作台底色，弱化大面积渐变
- 用少量橙色作为“主操作 / 进度 / 焦点”强调色
- 以蓝色表示运行中，以红色表示失败，以灰色表示暂停
- 圆角保留，但从大圆角收敛到更偏工具感的 12-16px
- 减少大字号标题，提升表格/列表可读性

### 建议排版

- 页面主标题 20-24px，而不是 42px+
- 模块标题 14-16px
- 关键数字 18-22px
- 元信息 12-13px

### 字体建议

当前 [base.css](D:/workspace/demo/smart-download/src/renderer/src/assets/base.css) 仍保留较泛的 Web 默认字体栈。

桌面工具场景更适合优先使用系统 UI 字体：

- Windows: `Segoe UI Variable`
- macOS: `SF Pro`
- 中文 fallback: `PingFang SC`, `Microsoft YaHei`

重点是稳定和可读，不追求网页品牌感。

## Interaction Principles

### 1. 新建任务必须更近

当前“新建任务”入口在 Hero 区。改造后应固定在 Header 右上角，始终可见。

### 2. 失败信息要靠近任务

错误提示不能只放全局摘要。

至少要同时出现在：

- 任务详情区
- 任务列表项的失败状态提示
- 诊断摘要里的 highlight

### 3. 活跃任务优先排序

任务列表建议优先级：

1. `downloading` / `metadata`
2. `failed`
3. `paused`
4. `completed`

现阶段即使先不改排序逻辑，UI 文案和视觉权重也应该往这个方向靠。

### 4. 常用操作前置

在任务详情里保留：

- 暂停
- 恢复
- 删除

后续可考虑在列表项里直接放轻量操作，但第一步不用急着加。

## Stage 1 UI Change Plan

### Step 1. 结构收口

- 删除 Hero 大标题式布局
- 引入紧凑 Header
- 把 TaskSection 提到首屏核心位置
- 把 DiagnosticsPanel 拆成真正的“运行摘要”
- 移除或吸收 StatusStrip

### Step 2. 视觉收口

- 收窄外边距和模块间距
- 降低玻璃拟态强度
- 收敛渐变背景
- 缩小标题字号
- 提升列表信息密度

### Step 3. 任务列表工具化

- 增强选中态
- 明确失败态和暂停态
- 优化速度/大小/ETA 的对齐方式
- 让任务详情更像 inspector，而不是介绍卡片

## Non-goals

本轮不做：

- 多窗口布局
- 自定义主题系统
- 拖拽上传 torrent 文件
- HTTP 下载入口
- 复杂筛选和搜索
- 持久化 UI 布局配置

## Suggested Implementation Order

如果后续开始改代码，建议按这个顺序：

1. `HeroSection -> AppHeader`
2. `StatusStrip` 删除或并入 Header
3. `DiagnosticsPanel` 去掉项目说明，只保留运行摘要
4. `App.tsx` 重排页面结构
5. `main.css` 收敛整体视觉风格
6. `TaskSection` 微调为更强工具化列表

这样风险最低，也符合当前仓库“小步修改，不做大重构”的要求。
