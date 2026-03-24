# AGENTS.md

## Product goal
Electron 桌面端智能下载调度器。
第一阶段目标只有一个：跑通 magnet 下载主链路，并把失败原因说清楚。

## Start here

每次接手默认只读：

1. `AGENTS.md`
2. `TASKS.md`

然后按需处理：

- 需要理解当前实现时，再读 `docs/ARCHITECTURE.md`
- 需要确认历史取舍时，再读相关 `docs/decisions/*.md`
- 先搜索相关代码，再展开具体文件，不要预读整仓文档

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
- 完成一个小任务后默认直接提交 commit
- 提交前校验统一交给仓库 hook 处理

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

## Current reality
- 当前下载主链路统一走内置托管的 `aria2`
- renderer 只负责 UI 与订阅，不承担下载调度
- dashboard 状态同步已经切到 `main -> renderer` 主动推送
- `src/adapters/bt` 里的 qBittorrent 相关代码不是当前生效主链路

## Current hotspots
- Phase 2 诊断 / facts / guidance：`src/core/task-manager/task-facts.ts`、`src/core/task-manager/task-utils.ts`、`src/core/diagnostics/index.ts`
- aria2 magnet 主链路与原始信号映射：`src/adapters/aria2/index.ts`、`src/adapters/aria2/utils.ts`
- 任务状态同步与仪表盘快照：`src/core/task-manager/index.ts`、`src/main/ipc/download-task.ts`
- Electron 启动装配与托管 aria2：`src/main/index.ts`、`src/main/runtime/managed-aria2.ts`

## Task routing
- 做 Phase 2 后端结构化信号时，先看 `src/core/task-manager/*` 和 `src/core/diagnostics/*`
- 做 magnet / aria2 相关问题时，先看 `src/adapters/aria2/*`
- 做状态同步、dashboard、inspector 数据来源时，先看 `src/main/ipc/download-task.ts`
- 做“共享 runtime / 自动化入口”时，先看 `src/main/index.ts` 和 `src/main/runtime/managed-aria2.ts`

## Done criteria
- 应用能创建 magnet 下载任务
- 进度和状态能正确更新
- 失败时有清晰提示
- 改动已提交，且提交前校验由 hook 自动通过
