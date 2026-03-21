# AGENTS.md

## Product goal
Electron 桌面端智能下载调度器。
第一阶段目标只有一个：跑通 magnet 下载主链路，并把失败原因说清楚。

## Current scope
- 只做 Electron 桌面端
- 只做 magnet -> BT 下载
- 只做基础状态同步和基础错误提示
- 诊断、持久化、HTTP 下载都放到后续阶段

## Working style
- 小步修改，不做大重构
- 每次只完成当前阶段最优先的一个 TASK
- 不确定时先读代码，不要猜
- 不改无关文件
- 完成后更新 TASKS.md
- 仅在项目已存在对应脚本时运行 lint / typecheck

## Tech stack
- Electron
- React + TypeScript
- BT adapter
- SQLite（第二阶段）

## Rules
- 不自研 BT 协议栈
- 第一阶段不接入 HTTP adapter
- 不随意引入新依赖
- 所有任务状态必须可追踪
- 所有错误必须有用户可读提示
- renderer 只负责 UI，下载逻辑放 main / core / adapter

## Folder conventions
- src/main: Electron 主进程与 IPC
- src/renderer: React 页面与组件
- src/core: 调度与任务管理
- src/adapters: 下载引擎适配层
- src/storage: 持久化
- src/types: 类型定义

## Done criteria
- 应用能创建 magnet 下载任务
- 进度和状态能正确更新
- 失败时有清晰提示
- lint / typecheck 通过（若脚本已存在）
