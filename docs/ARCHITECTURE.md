# Architecture

## Goal

当前仓库的目标不是做“万能下载器”，而是先把 Electron 桌面端的 `magnet -> BT 下载` 主链路跑通，并把失败原因说清楚。

当前阶段已经明确收口到：

- 桌面端只做 Electron
- 新建任务只接受 `magnet:?` 链接
- 当前运行主链路统一走内置托管的 `aria2`
- renderer 只负责展示和交互，不承担下载逻辑

## Runtime Topology

### Process split

- `src/main`
  Electron 主进程、窗口生命周期、IPC 注册、内置 aria2 托管
- `src/preload`
  向 renderer 暴露受控 API
- `src/renderer`
  React 页面、展示组件、用户交互
- `src/core`
  任务编排、状态同步、日志、诊断摘要
- `src/adapters`
  下载引擎适配层
- `src/storage`
  下载任务持久化
- `src/types`
  类型和 IPC 合同

### Main chain

```text
Renderer UI
  -> preload api
  -> IPC handlers in main
  -> InMemoryTaskManager
  -> DownloadAdapter
  -> aria2 RPC / managed aria2c
```

## Core Modules

### 1. `InMemoryTaskManager`

文件：`src/core/task-manager/index.ts`

职责：

- 创建任务
- 编排 `attach -> start`
- 同步任务快照到统一 `DownloadTask`
- 处理 pause / resume / delete
- 处理失败状态落库
- 应用启动时恢复持久化任务

说明：

- 这是当前最核心的状态机模块
- 重要变更必须优先补单元测试
- 当前已覆盖 magnet-only 校验、创建失败回滚、基础状态流转

### 2. `Aria2DownloadAdapter`

文件：`src/adapters/aria2/index.ts`

职责：

- 对接 aria2 JSON-RPC
- 抽象 attach / start / snapshot / pause / resume / delete
- 把 aria2 状态映射成统一 `DownloadTaskStatus`

说明：

- 当前业务主链路实际依赖这个 adapter
- UI 和 core 不应直接感知 aria2 RPC 细节

### 3. `ManagedAria2Service`

文件：`src/main/runtime/managed-aria2.ts`

职责：

- 启动和停止内置 `aria2c`
- 分配 RPC 端口
- 注入 RPC secret
- 轮询确认 aria2 已就绪

说明：

- 如果用户没有外部 aria2 配置，应用默认托管内置 aria2
- 这样可以减少本地环境依赖，提高 MVP 可运行性

### 4. Dashboard IPC

文件：`src/main/ipc/download-task.ts`

职责：

- 注册创建、暂停、恢复、删除等 IPC
- 生成 dashboard 快照：`tasks + diagnostics`
- 主进程定时推送 dashboard 更新给 renderer

说明：

- 已从 renderer 主动轮询改为 main 主动推送
- renderer 只做初次加载 + 订阅更新

## State Model

统一任务模型定义在 `src/types/download-task.ts`。

关键状态：

- `pending`
- `metadata`
- `downloading`
- `paused`
- `completed`
- `failed`
- `canceled`

约束：

- 所有任务状态必须可追踪
- 所有失败必须保留用户可读错误信息
- 当前阶段只允许 `magnet` 任务进入创建链路

## Synchronization Model

### Current behavior

- renderer 启动时通过 `getDashboard()` 拉一次完整快照
- main 进程定时同步任务状态
- main 进程通过 IPC 事件推送最新 dashboard
- pause / resume / delete / create 之后会立即推送一次

### Why this matters

- renderer 不再自己轮询 `listTasks()` 和 `getDiagnostics()`
- 同步责任收敛在 main，避免 UI 层承担调度逻辑
- 后续如果要细化订阅粒度，应该继续在 main / preload / IPC 侧演进

## Persistence

文件：`src/storage/index.ts`

当前使用 SQLite 持久化完整任务快照。

特点：

- 按任务 ID upsert
- 启动时恢复任务列表
- 重启后对运行中任务做“需要手动恢复”的状态收敛

注意：

- 当前持久化仍偏任务快照，而不是事件溯源模型
- 这符合现阶段 MVP，但不适合过早扩展复杂诊断

## Error Handling Rules

当前项目的错误处理原则：

- 优先返回用户可读中文错误
- 状态失败时必须落到 `DownloadTask.errorMessage`
- 记录内存日志，供诊断摘要展示
- 创建任务若已在远端创建成功但本地启动失败，必须回滚远端任务

## Testing Strategy

当前测试重点放在 `src/core/task-manager/index.test.ts`。

原因：

- 这里是当前状态机最密集的地方
- 仅靠 lint / typecheck 无法保障行为正确
- 比起 Electron E2E，这一层单元测试成本更低、收益更高

当前已覆盖：

- magnet 成功创建
- `attach` 后 `start` 失败回滚
- 回滚失败错误信息合并
- 非 magnet 输入拒绝
- pause / resume / delete 状态流转

## Known Gaps

当前仍然值得继续做的点：

- 诊断面板还未落地
- `aria2` adapter 体量仍偏大，后续可拆
- dashboard 推送的 IPC 行为还没有专门测试
- qBittorrent adapter 代码存在，但不是当前主链路
